/**
 * attendanceSheetService — the Enterprise Attendance Excel Import engine.
 *
 * Given a company scope and a batch of already-parsed punch rows (from an Excel /
 * CSV biometric export, canonicalised on the client), this engine:
 *   1. Matches each row to an employee by PRIORITY  biometric id → employee code
 *      → legacy id, strictly within the company (RULE 5 isolation).
 *   2. Groups rows to exactly ONE record per (employee, date) — earliest punch is
 *      the IN, latest punch is the OUT (handles multi-punch and multi-row files).
 *   3. Derives the attendance status from live company data, in this precedence:
 *      Approved Leave (never overwritten) → Holiday → Weekly-Off → punches
 *      (Present / Half Day / Absent) with Late / Early / Missed-Punch / Overtime.
 *   4. Writes attendance IDEMPOTENTLY (one row per employee+date — re-importing the
 *      same file updates, never duplicates), flags the affected payroll as
 *      outdated, and (optionally) queues Pending Overtime for approval.
 *   5. Returns a validation summary + a per-row error report + an unmatched list.
 *
 * It creates NO duplicate rows, NEVER matches across companies, and NEVER changes
 * payroll numbers directly (it only flags them for recompute, exactly like a
 * manual attendance correction). All heavy reads are done once, up-front, so the
 * engine scales to tens of thousands of rows without per-row round-trips.
 *
 * This module is pure orchestration over `prisma` and is unit-testable: pass any
 * object exposing the `.employee/.attendance/.leaveRequest/.overtime/.payroll/
 * .communicationHoliday/.$transaction` surface.
 */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const OFF = ['Archived', 'Resigned', 'Terminated', 'Inactive', 'Offboarded'];

// ── small helpers ───────────────────────────────────────────────────────────
const norm = (v) => (v == null ? '' : String(v).trim());
const up = (v) => norm(v).toUpperCase();
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Normalise a date cell to canonical 'YYYY-MM-DD' (defensive — the client already
// normalises, but biometric files are wild). Accepts ISO, DD/MM/YYYY, DD-MM-YYYY,
// YYYY/MM/DD and JS Date. Returns '' when it cannot be understood.
function toISODate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = norm(v);
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);      // DD-MM-YYYY (day-first — India)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return toISODate(d);
  return '';
}

// Parse a time cell to minutes-since-midnight. Accepts 'HH:mm', 'HH:mm:ss',
// 'h:mm AM/PM', Excel fraction of a day (0..1), or a full datetime string.
// Returns null when there is no usable time.
function toMinutes(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 0 && v < 1) return Math.round(v * 24 * 60); // Excel day fraction
  let s = norm(v);
  if (!s) return null;
  // A full datetime — keep only the time portion.
  const dt = s.match(/\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?/);
  if (dt) s = dt[0];
  const ampm = s.match(/([AaPp][Mm])\s*$/);
  const suffix = ampm ? ampm[1].toUpperCase() : '';
  s = s.replace(/[AaPp][Mm]\s*$/, '').trim();
  const parts = s.split(':').map((x) => parseInt(x, 10));
  if (!parts.length || isNaN(parts[0])) return null;
  let h = parts[0];
  const min = isNaN(parts[1]) ? 0 : parts[1];
  if (suffix === 'PM' && h < 12) h += 12;
  if (suffix === 'AM' && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

const minToHHMM = (mins) => {
  if (mins == null) return '';
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// Break minutes from a shift's breakTime ('60', '1:00', '0:45', '' → default 60).
function breakMinutesOf(shift) {
  const b = norm(shift?.breakTime);
  if (!b) return 60;
  if (b.includes(':')) { const mm = toMinutes(b); return mm == null ? 60 : mm; }
  const n = parseInt(b, 10);
  return isNaN(n) ? 60 : n;
}

/**
 * Process a batch of canonical punch rows for one company.
 *
 * @param prisma            a Prisma client (or compatible stub)
 * @param companyId         the company whose employees & policy apply (RULE 5)
 * @param rows              [{ rowNo, employeeKey, altKey?, date, inTime, outTime, status?, shift? }]
 * @param options           { weeklyOffDays?:number[]=[0], createOvertime?:boolean=true,
 *                            fullDayHours?, halfDayHours?, dryRun?:boolean=false }
 * @param actor             { id?, name? } for audit (optional)
 * @returns { companyId, summary, errors, unmatched, sample }
 */
async function processAttendanceRows(prisma, { companyId, rows, options = {}, actor = {} }) {
  companyId = Number(companyId);
  if (!companyId) throw new Error('companyId is required for attendance import (company isolation).');
  rows = Array.isArray(rows) ? rows : [];

  const weeklyOffDays = Array.isArray(options.weeklyOffDays) && options.weeklyOffDays.length
    ? options.weeklyOffDays.map(Number).filter((n) => n >= 0 && n <= 6)
    : [0]; // Sunday
  const createOvertime = options.createOvertime !== false;
  const dryRun = options.dryRun === true;
  const todayISO = toISODate(new Date());

  const summary = { total: rows.length, matchedRows: 0, records: 0, imported: 0, updated: 0, skipped: 0, errors: 0, overtimeQueued: 0 };
  const errors = [];       // { row, employeeId, employeeName, error, fix }
  const unmatchedMap = new Map(); // employeeKey → { employeeKey, rows: [] }

  // ── 1. Preload the company's employees and build priority match maps ────────
  const emps = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, employeeId: true, legacyEmployeeId: true, biometricId: true, name: true,
      department: true, branchId: true, branchLocation: true, shiftId: true, status: true },
  });
  const byBiometric = new Map();
  const byCode = new Map();
  const byLegacy = new Map();
  for (const e of emps) {
    if (e.biometricId) byBiometric.set(up(e.biometricId), e);
    if (e.employeeId) byCode.set(up(e.employeeId), e);
    if (e.legacyEmployeeId) byLegacy.set(up(e.legacyEmployeeId), e);
  }
  // Priority: biometric id → employee code → legacy id. Tries altKey too (a second
  // ID column, e.g. file has both a biometric column and an employee-code column).
  const matchOne = (key, alt) => {
    for (const k of [key, alt]) {
      const u = up(k);
      if (!u) continue;
      if (byBiometric.has(u)) return byBiometric.get(u);
      if (byCode.has(u)) return byCode.get(u);
      if (byLegacy.has(u)) return byLegacy.get(u);
    }
    return null;
  };

  // ── 2. Validate + match + group rows to one bucket per (employee, date) ─────
  // bucket key: `${emp.id}|${date}` → { emp, date, ins:[], outs:[], statusRaw, shiftRaw, rowNos:[] }
  const buckets = new Map();
  for (const raw of rows) {
    const rowNo = raw.rowNo ?? '?';
    const employeeKey = norm(raw.employeeKey);
    const date = toISODate(raw.date);

    if (!employeeKey) { summary.errors++; errors.push({ row: rowNo, employeeId: '', employeeName: '', error: 'Missing Employee/Biometric ID.', fix: 'Add the employee identifier column.' }); continue; }
    if (!date) { summary.errors++; errors.push({ row: rowNo, employeeId: employeeKey, employeeName: '', error: `Invalid or missing date ("${norm(raw.date)}").`, fix: 'Use a real date, e.g. 2026-07-01 or 01/07/2026.' }); continue; }
    if (date > todayISO) { summary.errors++; errors.push({ row: rowNo, employeeId: employeeKey, employeeName: '', error: `Future date (${date}) cannot be imported.`, fix: 'Remove rows dated after today.' }); continue; }

    const emp = matchOne(employeeKey, raw.altKey);
    if (!emp) {
      const g = unmatchedMap.get(up(employeeKey)) || { employeeKey, count: 0, sampleDate: date };
      g.count++; unmatchedMap.set(up(employeeKey), g);
      summary.skipped++;
      errors.push({ row: rowNo, employeeId: employeeKey, employeeName: '', error: 'No employee in this company matches this ID.', fix: 'Map the biometric/employee code in Biometric Mapping, then re-import only this row.' });
      continue;
    }
    if (OFF.includes(emp.status)) { summary.skipped++; errors.push({ row: rowNo, employeeId: emp.employeeId, employeeName: emp.name, error: `${emp.name} is offboarded (${emp.status}).`, fix: 'Offboarded employees are skipped by policy.' }); continue; }

    summary.matchedRows++;
    const key = `${emp.id}|${date}`;
    let b = buckets.get(key);
    if (!b) { b = { emp, date, ins: [], outs: [], statusRaw: '', shiftRaw: '', rowNos: [] }; buckets.set(key, b); }
    b.rowNos.push(rowNo);
    const inM = toMinutes(raw.inTime);
    const outM = toMinutes(raw.outTime);
    const single = toMinutes(raw.punchTime); // one-timestamp biometric files
    if (inM != null) b.ins.push(inM);
    if (outM != null) b.outs.push(outM);
    if (single != null) { b.ins.push(single); b.outs.push(single); } // resolved by min/max across the day
    if (!b.statusRaw && norm(raw.status)) b.statusRaw = norm(raw.status);
    if (!b.shiftRaw && norm(raw.shift)) b.shiftRaw = norm(raw.shift);
  }

  // ── 3. Preload holidays, approved leaves, shifts, existing attendance ───────
  const empIds = [...new Set([...buckets.values()].map((b) => b.emp.id))];
  const dates = [...new Set([...buckets.values()].map((b) => b.date))];

  const [holidays, leaves, shifts, existingAtt] = await Promise.all([
    prisma.communicationHoliday.findMany({ where: { companyId, status: 'Active', date: { in: dates.length ? dates : [' '] } } }),
    prisma.leaveRequest.findMany({ where: { companyId, employeeId: { in: empIds.length ? empIds : [-1] }, status: 'Approved' } }),
    prisma.shift.findMany({ where: { companyId } }),
    prisma.attendance.findMany({ where: { employeeId: { in: empIds.length ? empIds : [-1] }, date: { in: dates.length ? dates : [' '] } }, select: { employeeId: true, date: true, status: true } }),
  ]);

  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const existingSet = new Set(existingAtt.map((a) => `${a.employeeId}|${a.date}`));
  // Existing status per employee+date — powers the "Duplicate Attendance / will
  // update" preview grid (existing vs. new status). Read-only; write path unchanged.
  const existingStatusMap = new Map(existingAtt.map((a) => [`${a.employeeId}|${a.date}`, a.status]));
  // holiday lookup by date, honouring applicableBranches / applicableDepartments.
  const holidaysByDate = new Map();
  for (const h of holidays) {
    const arr = holidaysByDate.get(h.date) || [];
    arr.push(h); holidaysByDate.set(h.date, arr);
  }
  const parseScope = (json) => { if (!json) return 'all'; const t = norm(json); if (!t || t === 'all') return 'all'; try { const a = JSON.parse(t); return Array.isArray(a) ? a.map(String) : 'all'; } catch (_) { return 'all'; } };
  const holidayFor = (emp, date) => {
    const list = holidaysByDate.get(date);
    if (!list) return null;
    return list.find((h) => {
      const br = parseScope(h.applicableBranches);
      const dp = parseScope(h.applicableDepartments);
      const brOk = br === 'all' || br.includes(String(emp.branchId));
      const dpOk = dp === 'all' || dp.includes(String(emp.department));
      return brOk && dpOk;
    }) || null;
  };
  const leaveFor = (empId, date) => leaves.find((l) => l.employeeId === empId && date >= l.fromDate && date <= l.toDate) || null;

  // ── 4. Derive the attendance record for every bucket ────────────────────────
  const toWrite = [];           // full attendance create rows
  const otToQueue = [];         // pending overtime rows
  const previewRows = [];       // enriched rows for the HR preview table (display only)
  const willUpdate = [];        // records that already exist → existing vs. new status
  const defShift = { start: '09:00', end: '18:00', grace: '10', breakTime: '60', otEnabled: true, name: 'General' };

  for (const b of buckets.values()) {
    const { emp, date } = b;
    const shift = (emp.shiftId && shiftById.get(emp.shiftId)) || defShift;
    const startM = toMinutes(shift.start) ?? 540;
    let endM = toMinutes(shift.end) ?? 1080;
    if (endM <= startM) endM += 24 * 60; // overnight shift spans midnight
    const graceM = parseInt(norm(shift.grace), 10) || 0;
    const brkM = breakMinutesOf(shift);
    const shiftWorkHrs = round2(Math.max(0, (endM - startM - brkM) / 60)) || 8;
    const fullHrs = Number(options.fullDayHours) || round2(shiftWorkHrs * 0.75);
    const halfHrs = Number(options.halfDayHours) || round2(shiftWorkHrs * 0.35);

    const hasIn = b.ins.length > 0;
    const hasOut = b.outs.length > 0;
    let inM = hasIn ? Math.min(...b.ins) : null;
    let outM = hasOut ? Math.max(...b.outs) : null;
    // Overnight: out earlier than in ⇒ next-day punch.
    if (inM != null && outM != null && outM < inM) outM += 24 * 60;
    const gross = (inM != null && outM != null) ? (outM - inM) : 0;
    const net = gross > 0 ? Math.max(0, gross - brkM) : 0;
    const worked = round2(net / 60);

    const flags = [];
    let status = 'Absent';
    let leaveType = null;
    let otHours = 0;

    const leave = leaveFor(emp.id, date);
    const holiday = holidayFor(emp, date);
    const isWeeklyOff = weeklyOffDays.includes(new Date(date + 'T00:00:00').getDay());
    const worked01 = inM != null || outM != null;

    if (leave) {
      // Respect approved leave — never overwrite it with a punch-derived status.
      status = 'Leave';
      leaveType = leave.leaveType || 'Leave';
      if (worked01) flags.push('Leave/Punch Conflict');
    } else if (holiday) {
      status = 'Holiday';
      if (hasIn && hasOut && worked > 0) { flags.push('Holiday Work'); flags.push('Overtime'); otHours = worked; }
    } else if (isWeeklyOff) {
      status = 'Weekly Off';
      if (hasIn && hasOut && worked > 0) { flags.push('Week Off Work'); flags.push('Overtime'); otHours = worked; }
    } else if (!hasIn && !hasOut) {
      // No punches on a working day. Honour an explicit status column if present.
      status = normalizeStatus(b.statusRaw) || 'Absent';
      if (status === 'Leave') leaveType = 'Leave';
    } else if (hasIn !== hasOut || inM == null || outM == null) {
      status = 'Present';
      flags.push('Missed Punch');
    } else {
      if (inM > startM + graceM) flags.push('Late Mark');
      if (outM < endM) flags.push('Early Going');
      if (worked >= fullHrs) status = 'Present';
      else if (worked >= halfHrs) status = 'Half Day';
      else status = 'Half Day';
      // Overtime beyond the shift's working span (only when the shift allows it).
      if ((shift.otEnabled !== false) && worked > shiftWorkHrs + 0.25) {
        otHours = round2(worked - shiftWorkHrs);
        flags.push('Overtime');
      }
    }

    const record = {
      companyId,
      employeeId: emp.id,
      employeeName: emp.name || 'Unknown',
      department: emp.department || 'General',
      branch: emp.branchLocation || null,
      date,
      clockIn: inM != null ? minToHHMM(inM) : '',
      clockOut: outM != null ? minToHHMM(outM) : '',
      status,
      hoursWorked: worked,
      flags: [...new Set(flags)],
      leaveType,
      shift: shift.name || b.shiftRaw || null,
    };
    toWrite.push(record);
    const exists = existingSet.has(`${emp.id}|${date}`);
    if (exists) summary.updated++; else summary.imported++;

    // ── Preview-only projections (never affect what is written) ──────────────
    previewRows.push({
      rowNo: b.rowNos[0] ?? null,
      employeeCode: emp.employeeId || '',
      biometricId: emp.biometricId || '',
      employeeName: emp.name || 'Unknown',
      department: emp.department || '',
      date,
      punchIn: record.clockIn || '',
      punchOut: record.clockOut || '',
      hoursWorked: worked,
      status,
      result: exists ? 'Update' : 'Ready',
    });
    if (exists) {
      willUpdate.push({
        employeeCode: emp.employeeId || '',
        employeeName: emp.name || 'Unknown',
        date,
        existingStatus: existingStatusMap.get(`${emp.id}|${date}`) || '—',
        newStatus: status,
      });
    }

    if (createOvertime && otHours > 0) {
      otToQueue.push({
        companyId, employeeId: emp.id, employeeName: emp.name, employeeCode: emp.employeeId,
        department: emp.department || null, branch: emp.branchLocation || null,
        shift: shift.name || null, date, inTime: record.clockIn, outTime: record.clockOut,
        otHours, type: 'Auto', reason: 'Attendance import', remarks: 'attendance-import', status: 'Pending',
      });
    }
  }
  summary.records = toWrite.length;
  summary.matchedEmployees = empIds.length;         // distinct employees matched
  summary.unmatchedEmployees = unmatchedMap.size;   // distinct IDs with no employee

  const unmatched = [...unmatchedMap.values()].sort((a, b) => b.count - a.count);
  // Enriched preview rows for the HR table (first 100). Ordered by date then name
  // so the preview reads chronologically.
  const sample = previewRows
    .slice()
    .sort((a, b) => (a.date === b.date ? String(a.employeeName).localeCompare(String(b.employeeName)) : a.date < b.date ? -1 : 1))
    .slice(0, 100);

  // Attendance period + working/holiday breakdown for the timeline panel. Computed
  // over the matched dates (dry-run only — one extra read, no writes).
  let timeline = null;
  if (dates.length) {
    const sortedDates = [...dates].sort();
    const start = sortedDates[0];
    const end = sortedDates[sortedDates.length - 1];
    const startD = new Date(start + 'T00:00:00');
    const endD = new Date(end + 'T00:00:00');
    const totalDays = Math.max(1, Math.round((endD - startD) / 86400000) + 1);
    let holidayDates = new Set();
    if (dryRun) {
      const rangeHols = await prisma.communicationHoliday.findMany({
        where: { companyId, status: 'Active', date: { gte: start, lte: end } },
        select: { date: true },
      });
      holidayDates = new Set(rangeHols.map((h) => h.date));
    }
    let workingDays = 0;
    let holidayDays = 0;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startD.getTime() + i * 86400000);
      const iso = toISODate(d);
      if (holidayDates.has(iso)) holidayDays++;
      else if (!weeklyOffDays.includes(d.getDay())) workingDays++;
    }
    timeline = { start, end, totalDays, workingDays, holidayDays, recordsFound: summary.total };
  }

  if (dryRun) {
    summary.overtimeQueued = otToQueue.length;
    return { companyId, dryRun: true, summary, errors: errors.slice(0, 500), unmatched, sample, willUpdate: willUpdate.slice(0, 500), timeline };
  }

  // ── 5. Persist idempotently (delete+recreate per employee+date = no dupes) ──
  const CHUNK = 400;
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    const chunk = toWrite.slice(i, i + CHUNK);
    const pairs = chunk.map((r) => ({ employeeId: r.employeeId, date: r.date }));
    await prisma.$transaction([
      prisma.attendance.deleteMany({ where: { OR: pairs } }),
      prisma.attendance.createMany({ data: chunk, skipDuplicates: true }),
    ]);
  }

  // Overtime: replace any prior auto-import OT for these employee/dates, then add.
  if (createOvertime && empIds.length) {
    await prisma.overtime.deleteMany({ where: { employeeId: { in: empIds }, date: { in: dates }, remarks: 'attendance-import' } });
    for (let i = 0; i < otToQueue.length; i += CHUNK) {
      await prisma.overtime.createMany({ data: otToQueue.slice(i, i + CHUNK) });
    }
    summary.overtimeQueued = otToQueue.length;
  }

  // ── 6. Flag the affected payroll month(s) as outdated (recompute needed) ────
  const monthKeys = new Map(); // `${empId}|${month}|${year}` → {employeeId, month, year}
  for (const r of toWrite) {
    const d = new Date(r.date + 'T00:00:00');
    monthKeys.set(`${r.employeeId}|${d.getMonth()}|${d.getFullYear()}`, { employeeId: r.employeeId, month: MONTH_NAMES[d.getMonth()], year: d.getFullYear() });
  }
  for (const k of monthKeys.values()) {
    try { await prisma.payroll.updateMany({ where: { employeeId: k.employeeId, month: k.month, year: k.year }, data: { isOutdated: true } }); } catch (_) { /* never block import */ }
  }

  return { companyId, dryRun: false, summary, errors: errors.slice(0, 500), unmatched, sample, willUpdate: willUpdate.slice(0, 500), timeline };
}

// Map a free-text status cell to a canonical attendance status (used only when a
// row has NO punches but does carry a Status column, e.g. hand-made Excel sheets).
function normalizeStatus(v) {
  const s = norm(v).toLowerCase();
  if (!s) return '';
  if (/^(p|present|wfo|on duty|full)/.test(s)) return 'Present';
  if (/half/.test(s)) return 'Half Day';
  if (/(wfh|work from home|remote)/.test(s)) return 'Work From Home';
  if (/(leave|cl|sl|pl|el|lop|lwp)/.test(s)) return 'Leave';
  if (/(holiday|hol)/.test(s)) return 'Holiday';
  if (/(week.?off|w\/o|wo)/.test(s)) return 'Weekly Off';
  if (/(a|absent|ab)/.test(s)) return 'Absent';
  return '';
}

module.exports = { processAttendanceRows, toISODate, toMinutes, minToHHMM, normalizeStatus };
