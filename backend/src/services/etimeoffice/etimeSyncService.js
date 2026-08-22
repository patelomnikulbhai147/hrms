// ─────────────────────────────────────────────────────────────────────────────
// etimeSyncService — the Phase 5 sync engine.
//
// Pulls per-day IN/OUT punches from E-TimeOffice for a rolling window (or an
// explicit From/To range), routes EVERY punch through the matcher BIOMETRIC-FIRST
// then Employee-Code fallback (RULES 1–5 — company-isolated, blank/duplicate-safe,
// never by name), and upserts MATCHED punches
// into the existing `attendance` table. Idempotent by construction: the unique
// (employeeId, date) key means a re-sync UPDATES the same row instead of ever
// creating a duplicate. Non-matched punches are logged + parked in the unmatched
// queue (never silently dropped). One run-level AttendanceSyncLog row summarises
// the run; per-punch verdicts go to attendance_import_logs.
//
// This module is the ONLY writer of attendance for the E-TimeOffice path, and it
// only ever touches its own company's data (RULE 5).
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../../config/prisma');
const { resolvePunch, STATUS, QUEUEABLE } = require('../attendanceMatcher');
const client = require('./etimeClient');
const settings = require('./etimeSettingsService');

// Accepts "H:mm", "HH:mm" and "HH:mm:ss" — seconds are tolerated (capture groups
// keep hour/minute only) so a provider that starts sending seconds can never
// silently blank out a real punch time.
const HHMM = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

// "dd/MM/yyyy" → "yyyy-MM-dd" (the format the attendance table stores). Returns
// null for anything that isn't a real dd/MM/yyyy so a bad row is skipped safely.
function toIsoDate(dateStr) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dateStr || '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// ── Timezone-correct dates (Asia/Kolkata) ────────────────────────────────────
// The sync window and the dashboard's "today" must be anchored to the BUSINESS
// day in IST, not the Node server's local clock — otherwise a UTC-clock host
// rolls the window a day early after ~18:30 UTC (the ±1-day bug the reference
// implementation also has). Everything here derives from IST.
const IST_TZ = process.env.ETIME_TZ || 'Asia/Kolkata';
const MAX_RANGE_DAYS = Number(process.env.ETIME_MAX_RANGE_DAYS) || 92;

// Today's calendar date in IST as { y, m, d } numbers.
function istTodayYMD() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}
// Today's date in IST as 'yyyy-MM-dd' (used by the dashboard's attendance filter).
function istTodayIso() { const t = istTodayYMD(); return `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`; }
// Add a whole-day delta to a {y,m,d} via UTC arithmetic (India has no DST).
function addDaysYMD({ y, m, d }, delta) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
const dmy = ({ y, m, d }) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
const cmpYMD = (a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d);

// Parse ISO 'yyyy-MM-dd' or 'dd/MM/yyyy' → { y, m, d } (or null).
function parseYMD(v) {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  return null;
}
// True only for a REAL calendar date — rejects 2026-02-30, month 13, day 32, and
// (via the round-trip) correctly accepts Feb-29 on leap years and rejects it otherwise.
function isRealDate({ y, m, d }) {
  if (!(y >= 1970 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Resolve the sync window as dd/MM/yyyy strings. An explicit { fromDate, toDate }
 * (ISO or dd/MM/yyyy) is validated — real dates, from ≤ to, not in the future
 * (IST), and within MAX_RANGE_DAYS — and returns { error } on any violation.
 * With no range it returns the rolling syncWindowDays window ending on IST-today.
 * @returns {{ from:string, to:string } | { error:string }}
 */
function resolveWindow(creds, { fromDate, toDate } = {}) {
  if (fromDate || toDate) {
    const f = parseYMD(fromDate);
    const t = parseYMD(toDate);
    if (!f || !t) return { error: 'Enter a valid From and To date.' };
    if (!isRealDate(f) || !isRealDate(t)) return { error: 'From/To is not a real calendar date (check the month and day).' };
    if (cmpYMD(f, t) > 0) return { error: 'The From date must be on or before the To date.' };
    if (cmpYMD(t, istTodayYMD()) > 0) return { error: 'The To date cannot be in the future.' };
    const spanDays = Math.round((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(f.y, f.m - 1, f.d)) / 864e5);
    if (spanDays > MAX_RANGE_DAYS) return { error: `The date range is too large (max ${MAX_RANGE_DAYS} days). Narrow the From/To dates.` };
    return { from: dmy(f), to: dmy(t) };
  }
  const windowDays = Math.max(1, Number(creds && creds._row && creds._row.syncWindowDays) || 2);
  const today = istTodayYMD();
  return { from: dmy(addDaysYMD(today, -(windowDays - 1))), to: dmy(today) };
}

// The trailing numeric group of a code, leading zeros stripped ("VE-AHMD-0025" →
// "25", "0025" → "25"). E-TimeOffice devices enrol people by this bare number
// while the HR code carries a branch prefix, so the two align only after this.
function normNumeric(v) {
  const m = /(\d+)\s*$/.exec(String(v == null ? '' : v));
  return m ? String(parseInt(m[1], 10)) : null;
}

/**
 * buildEmployeeIndex — one company- (and optionally branch-) scoped lookup built
 * ONCE per sync, resolving a device Empcode to an employee in PRIORITY order:
 *   1) exact Biometric Code   2) exact Employee Code   3) normalized numeric
 *      suffix of the Employee Code (device number → HR code number).
 * Never by name. Company/branch isolation is guaranteed by the query scope; an
 * ambiguous normalized code (same number in >1 branch, when not branch-scoped)
 * returns DUPLICATE_CODE and is parked, never auto-mapped.
 */
async function buildEmployeeIndex(companyId, branchId) {
  // Fetch the whole company roster. Exact biometric-id / employee-code matches are
  // globally unique within a company (or flagged DUPLICATE_CODE), so they resolve
  // COMPANY-WIDE — this lets HQ/office staff who are enrolled on a branch device
  // match by their exact biometric id without having to be filed under that branch.
  // Only the fuzzy device-number (numeric suffix) match is ambiguous — a bare "0001"
  // repeats across branches — so it stays confined to the connection's branch when set.
  const emps = await prisma.employee.findMany({ where: { companyId }, select: { id: true, name: true, department: true, employeeId: true, biometricId: true, branchId: true } });
  const bId = (branchId != null && String(branchId).trim() !== '') ? (Number(branchId) || branchId) : null;
  // Every key maps to an ARRAY so a code shared by >1 employee is detected as an
  // ambiguous DUPLICATE_CODE (blocked), never silently collapsed to one person.
  const bio = new Map(), code = new Map(), suf = new Map();
  const push = (map, key, e) => { if (!map.has(key)) map.set(key, []); map.get(key).push(e); };
  for (const e of emps) {
    if (e.biometricId) push(bio, String(e.biometricId).trim(), e);
    if (e.employeeId) push(code, String(e.employeeId).trim(), e);
    // Numeric-suffix (device number) is the only ambiguous key → branch-scoped.
    if (bId == null || e.branchId === bId) {
      const s = normNumeric(e.employeeId);
      if (s) push(suf, s, e);
    }
  }
  const pick = (list, matchedBy, msg) => {
    if (list.length === 1) return { status: STATUS.MATCHED, matchedBy, message: msg, employee: list[0] };
    return { status: STATUS.DUPLICATE_CODE, matchedBy, message: `Code matches ${list.length} employees (${list.map((e) => e.employeeId).join(', ')}). Set the connection's Branch to disambiguate.`, candidates: list };
  };
  return {
    size: emps.length,
    resolve(rawCode) {
      const c = rawCode == null ? '' : String(rawCode).trim();
      if (!c) return { status: STATUS.NO_BIOMETRIC_CODE, message: 'Employee biometric code not configured.' };
      if (bio.has(c)) return pick(bio.get(c), 'biometricCode', 'Matched by Biometric Code.');
      if (code.has(c)) return pick(code.get(c), 'employeeCode', 'Matched by Employee Code.');
      const n = normNumeric(c);
      if (n && suf.has(n)) return pick(suf.get(n), 'employeeCodeNormalized', 'Matched by Employee Code (device number).');
      return { status: STATUS.UNMATCHED, message: 'No employee matched by biometric or employee code in this workspace.' };
    },
  };
}

/**
 * resolveDevicePunch — resolve ONE device code (biometric → employee code → the
 * device number). Builds a per-call index; the sync loop uses buildEmployeeIndex
 * once instead. `branchId` confines matching to a branch (disambiguates numbers
 * that repeat across branches). Kept as the single-punch entry point (tests + the
 * unmatched-queue path).
 */
async function resolveDevicePunch(companyId, deviceCode, branchId) {
  const idx = await buildEmployeeIndex(companyId, branchId);
  return idx.resolve(deviceCode);
}

// A device time ("12:06", "9:06", "12:06:44") normalises to zero-padded "HH:mm";
// the "--:--" placeholder (or anything unparseable) becomes '' — never a fake time.
function cleanTime(t) {
  const m = HHMM.exec(String(t == null ? '' : t).trim());
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

// "HH:mm" work-time → decimal hours (e.g. "08:30" → 8.5). Non-times → 0.
function workTimeToHours(t) {
  const m = HHMM.exec(String(t || '').trim());
  if (!m) return 0;
  return Math.round((parseInt(m[1], 10) + parseInt(m[2], 10) / 60) * 100) / 100;
}

// "HH:mm" duration → whole minutes (e.g. Late_In "00:22" → 22). Non-times → 0.
function hhmmToMinutes(t) {
  const m = HHMM.exec(String(t || '').trim());
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Difference in decimal hours between two "HH:mm" clock times (out − in). Used as
// a fallback when the API's WorkTime is blank but both punches exist.
function spanHours(inT, outT) {
  const a = HHMM.exec(String(inT || '').trim());
  const b = HHMM.exec(String(outT || '').trim());
  if (!a || !b) return 0;
  const mins = (parseInt(b[1], 10) * 60 + parseInt(b[2], 10)) - (parseInt(a[1], 10) * 60 + parseInt(a[2], 10));
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

// Map an E-TimeOffice status token ("P/2", "A", "WO", …) to our attendance
// status vocabulary. Unknown tokens fall back to presence inferred from INTime.
function mapStatus(raw, hasIn) {
  const s = String(raw || '').trim().toUpperCase();
  const head = s.split('/')[0];
  if (head.startsWith('WO')) return 'Weekly Off';
  if (head.startsWith('P')) return 'Present';
  if (head.startsWith('A')) return 'Absent';
  if (head.startsWith('H') && head !== 'HLF') return 'Holiday';
  if (head.startsWith('L')) return 'Leave';
  if (head === 'HLF' || s.includes('HALF') || s.includes('½')) return 'Half Day';
  return hasIn ? 'Present' : 'Absent';
}

// Build the attendance row payload from ONE E-TimeOffice IN/OUT record. This is
// the single, canonical mapping of a punch → an attendance row: In Time (first
// punch), Out Time (last punch), Working Hours, Status, Late minutes, Early-exit
// minutes and Source/SyncTime are all derived here so the scheduler, manual sync
// and the unmatched-queue resolver produce IDENTICAL rows (no separate code path).
function buildAttendanceData(companyId, employee, rec, details) {
  const clockIn = cleanTime(rec.INTime);
  const clockOut = cleanTime(rec.OUTTime);
  const status = mapStatus(rec.Status, !!clockIn);
  // Prefer the API's WorkTime (it accounts for breaks); fall back to out−in.
  const hoursWorked = workTimeToHours(rec.WorkTime) || spanHours(clockIn, clockOut);
  const lateMinutes = hhmmToMinutes(rec.Late_In);
  const earlyExitMinutes = hhmmToMinutes(rec.Erl_Out);
  const flags = {
    source: 'E-TimeOffice',
    syncTime: new Date().toISOString(),
    rawStatus: rec.Status || null,
    remark: rec.Remark || null,
    lateMinutes,
    earlyExitMinutes,
    isLate: lateMinutes > 0,
    isEarlyExit: earlyExitMinutes > 0,
    overtimeMinutes: hhmmToMinutes(rec.OverTime),
  };
  // Attendance.branch is a plain string; Employee.branch is a relation object.
  // Coerce defensively so a caller passing either shape (or the raw relation) is safe.
  const rawBranch = details && details.branch;
  const branch = typeof rawBranch === 'string' ? rawBranch : (rawBranch && rawBranch.branchName) || null;
  return {
    companyId,
    employeeName: employee.name || rec.Name || 'Unknown',
    department: (details && details.department) || 'General',
    branch,
    clockIn: clockIn || '',
    clockOut: clockOut || '',
    status,
    hoursWorked,
    flags,
  };
}

/**
 * importOne — idempotently upsert ONE matched punch into the attendance table.
 * Shared by the sync loop AND the unmatched-queue resolver so both paths behave
 * identically. Idempotent by the unique (employeeId, date) key: a re-import
 * UPDATES the same row (In/Out/Hours/Status refreshed) — never a duplicate.
 * @returns {Promise<'created'|'updated'|'skipped'>}
 */
async function importOne(prismaClient, companyId, employee, rec, details = null) {
  const isoDate = toIsoDate(rec.DateString);
  if (!isoDate) return 'skipped';
  let d = details;
  if (!d) {
    const e = await prismaClient.employee.findUnique({ where: { id: employee.id }, select: { department: true, branch: { select: { branchName: true } } } }).catch(() => null);
    d = { department: (e && e.department) || 'General', branch: (e && e.branch && e.branch.branchName) || null };
  }
  const data = buildAttendanceData(companyId, employee, rec, d);
  const existing = await prismaClient.attendance.findUnique({
    where: { employeeId_date: { employeeId: employee.id, date: isoDate } },
    select: { id: true, status: true, clockIn: true, clockOut: true, flags: true },
  });

  // ── PERSISTENCE GUARD: never let a punch-less sync flip a saved record to Absent ──
  // The device's IN/OUT feed returns EVERY employee for EVERY day in the window,
  // marking days with no punch as Absent. The 30-min scheduler re-syncs a rolling
  // window, so a past day whose punch has aged out (or is momentarily missing)
  // would otherwise OVERWRITE a previously-saved Present → Absent. "No data from
  // the biometric API" is NOT proof of absence: if a meaningful record already
  // exists we KEEP it. This also makes re-syncing the same date idempotent.
  if (existing) {
    const incomingAbsentNoPunch =
      String(data.status || '').toLowerCase().startsWith('absent') && !data.clockIn && !data.clockOut;
    const existingIsMeaningful =
      !String(existing.status || '').toLowerCase().startsWith('absent') || !!existing.clockIn || !!existing.clockOut;
    // A human-entered row (Daily/Weekly manual entry, mobile check-in) is authoritative.
    const existingSource =
      existing.flags && typeof existing.flags === 'object' ? String(existing.flags.source || '') : '';
    const existingIsManual = !!existingSource && existingSource !== 'E-TimeOffice';

    // 1) Punch-less Absent must never replace an existing meaningful record.
    if (incomingAbsentNoPunch && existingIsMeaningful) return 'skipped';
    // 2) A biometric sync must never overwrite a human-entered record with a
    //    punch-less Absent (manual entries win over "device had nothing today").
    if (incomingAbsentNoPunch && existingIsManual) return 'skipped';
  }

  await prismaClient.attendance.upsert({
    where: { employeeId_date: { employeeId: employee.id, date: isoDate } },
    create: { employeeId: employee.id, date: isoDate, ...data },
    update: data,
  });
  return existing ? 'updated' : 'created';
}

/**
 * runSync — sync one company for the rolling window OR an explicit date range.
 * @param {number} companyId
 * @param {{ trigger?: 'manual'|'scheduler', dryRun?: boolean, fromDate?: string, toDate?: string }} opts
 *        fromDate/toDate (ISO 'yyyy-MM-dd' or 'dd/MM/yyyy') request a historical
 *        range sync; omit both for the rolling syncWindowDays window (IST-anchored).
 * @returns {Promise<{ ok, summary, runId?, error? }>}
 */
async function runSync(companyId, { trigger = 'manual', dryRun = false, fromDate, toDate } = {}) {
  const startedAt = Date.now();
  const creds = await settings.getDecryptedCreds(companyId);
  if (!creds) return { ok: false, error: 'No E-TimeOffice connection is configured for this company.' };
  if (!settings.hasCredentials(creds._row)) {
    return { ok: false, error: 'E-TimeOffice credentials are incomplete (Corporate ID, Username and Password are required).' };
  }

  // ── Single-owner guard (cross-tenant contamination protection) ─────────────
  // A biometric machine account (Corporate ID + Username) enrols people who each
  // belong to ONE company. The vendor API, however, returns the SAME punch stream
  // to every company that configures the same account, and each company then
  // matches those device numbers against its OWN roster — so a second company
  // reinterprets another company's punches as its own employees (wrong data).
  // Therefore a given machine account may be actively synced by only ONE company:
  // the one whose connection is ENABLED. If another company already owns
  // (enabled) the same account, refuse this sync instead of contaminating it.
  const cid = Number(companyId);
  const corp = creds._row.corporateId;
  const user = creds._row.apiUsername;
  if (corp && user) {
    const owner = await prisma.etimeConnection.findFirst({
      where: { companyId: { not: cid }, enabled: true, corporateId: corp, apiUsername: user },
      select: { companyId: true },
    }).catch(() => null);
    if (owner) {
      return { ok: false, error: `This E-TimeOffice machine account is already connected to another company (#${owner.companyId}). A biometric account can be synced by only one company — disable it there first if you want to move it here.` };
    }
  }

  // Resolve the window: explicit From/To (validated) or the rolling IST window.
  const win = resolveWindow(creds, { fromDate, toDate });
  if (win.error) return { ok: false, error: win.error };
  const windowFrom = win.from;
  const windowTo = win.to;

  // Open the run-level log (RUNNING) so an in-flight/crashed sync is still visible.
  const run = await prisma.attendanceSyncLog.create({
    data: { companyId, source: 'E-TimeOffice', trigger, status: 'RUNNING', windowFrom, windowTo },
  });

  const summary = { fetched: 0, imported: 0, updated: 0, skipped: 0, duplicates: 0, unmatched: 0, failed: 0 };

  // Pull the IN/OUT window (retry/timeout handled inside the client). The client
  // accepts the dd/MM/yyyy strings directly (its String() passthrough).
  const pull = await client.downloadInOutPunchData(creds, { empCode: creds.empCode || 'ALL', fromDate: windowFrom, toDate: windowTo });
  if (!pull.ok) {
    await prisma.attendanceSyncLog.update({
      where: { id: run.id },
      data: { status: 'FAILED', endedAt: new Date(), durationMs: Date.now() - startedAt, httpStatus: pull.httpStatus || null, errorMessage: pull.message || 'Fetch failed.' },
    });
    await prisma.etimeConnection.update({
      where: { companyId },
      data: { connectionStatus: 'error', lastSyncStatus: 'FAILED', lastError: pull.message || 'Fetch failed.', lastSyncAt: new Date() },
    }).catch(() => {});
    return { ok: false, runId: run.id, error: pull.message || 'Fetch failed.', httpStatus: pull.httpStatus || null, summary };
  }

  summary.fetched = pull.records.length;

  // Build the code→employee index ONCE, scoped to the connection's branch when
  // configured (so device numbers that repeat across branches resolve uniquely).
  const empIndex = await buildEmployeeIndex(companyId, creds._row.branchId);

  // Cache employee department/branch so the same employee isn't refetched across
  // the multiple days a rolling window returns.
  const detailCache = new Map();
  const getDetails = async (empId) => {
    if (detailCache.has(empId)) return detailCache.get(empId);
    const e = await prisma.employee.findUnique({ where: { id: empId }, select: { department: true, branch: { select: { branchName: true } } } }).catch(() => null);
    const d = { department: (e && e.department) || 'General', branch: (e && e.branch && e.branch.branchName) || null };
    detailCache.set(empId, d);
    return d;
  };

  for (const rec of pull.records) {
    const biometricCode = rec.Empcode != null ? String(rec.Empcode) : '';
    const isoDate = toIsoDate(rec.DateString);

    // A record with no usable date can't map to an attendance row — skip + log.
    if (!isoDate) {
      summary.skipped++;
      await prisma.attendanceImportLog.create({
        data: { companyId, biometricCode: biometricCode.slice(0, 191), status: 'UNMATCHED', punchTime: rec.DateString || null, message: 'Punch had no valid date (DateString).' },
      }).catch(() => {});
      continue;
    }

    let verdict;
    try {
      // Biometric → Employee Code → device-number match (never name; collisions blocked).
      verdict = empIndex.resolve(biometricCode);
    } catch (e) {
      summary.failed++;
      continue;
    }

    // Per-punch audit (mirrors attendanceImportController).
    await prisma.attendanceImportLog.create({
      data: {
        companyId,
        biometricCode: biometricCode ? biometricCode.slice(0, 191) : null,
        employeeId: verdict.employee?.id || null,
        employeeCode: verdict.employee?.employeeId || null,
        employeeName: verdict.employee?.name || rec.Name || null,
        punchTime: `${rec.DateString || isoDate} ${rec.INTime || ''}`.trim(),
        status: verdict.status,
        message: verdict.message,
      },
    }).catch(() => {});

    // Non-matched → park in the queue (RULES 1/2/3), never create attendance.
    if (QUEUEABLE.has(verdict.status)) {
      if (verdict.status === STATUS.DUPLICATE_CODE) summary.duplicates++;
      else summary.unmatched++;
      await prisma.unmatchedAttendance.create({
        data: {
          companyId,
          biometricCode: biometricCode ? biometricCode.slice(0, 191) : null,
          punchTime: `${rec.DateString || isoDate} ${rec.INTime || ''}`.trim(),
          reason: verdict.status,
          message: verdict.message,
          rawPayload: JSON.stringify(rec).slice(0, 4000),
        },
      }).catch(() => {});
      continue;
    }

    if (verdict.status !== STATUS.MATCHED || !verdict.employee) { summary.skipped++; continue; }

    // Dry run: prove matching without writing attendance.
    if (dryRun) { summary.imported++; continue; }

    // MATCHED → idempotent upsert via the shared writer (same path the unmatched
    // resolver uses, so scheduler / manual sync / resolve produce identical rows).
    try {
      const details = await getDetails(verdict.employee.id);
      const outcome = await importOne(prisma, companyId, verdict.employee, rec, details);
      if (outcome === 'updated') summary.updated++;
      else if (outcome === 'created') summary.imported++;
      else summary.skipped++;
    } catch (e) {
      summary.failed++;
    }
  }

  const durationMs = Date.now() - startedAt;
  const status = summary.failed > 0 ? 'PARTIAL' : 'SUCCESS';

  await prisma.attendanceSyncLog.update({
    where: { id: run.id },
    data: {
      status, endedAt: new Date(), durationMs, httpStatus: pull.httpStatus || null,
      fetched: summary.fetched, imported: summary.imported, updated: summary.updated,
      skipped: summary.skipped, duplicates: summary.duplicates, unmatched: summary.unmatched, failed: summary.failed,
    },
  });

  await prisma.etimeConnection.update({
    where: { companyId },
    data: { connectionStatus: 'connected', lastSyncStatus: status, lastSyncAt: new Date(), lastError: null },
  }).catch(() => {});

  return { ok: true, runId: run.id, summary: { ...summary, durationMs, status } };
}

module.exports = {
  runSync, importOne, buildAttendanceData, resolveDevicePunch, buildEmployeeIndex,
  resolveWindow, istTodayIso, istTodayYMD, normNumeric,
  toIsoDate, cleanTime, workTimeToHours, hhmmToMinutes, spanHours, mapStatus,
};
