// ─────────────────────────────────────────────────────────────────────────────
// etimeSyncService — the Phase 5 sync engine.
//
// Pulls per-day IN/OUT punches from E-TimeOffice for a rolling window, routes
// EVERY punch through attendanceMatcher.resolvePunch (RULES 1–5 — biometricId
// only, company-isolated, blank/duplicate-safe), and upserts MATCHED punches
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
    select: { id: true },
  });
  await prismaClient.attendance.upsert({
    where: { employeeId_date: { employeeId: employee.id, date: isoDate } },
    create: { employeeId: employee.id, date: isoDate, ...data },
    update: data,
  });
  return existing ? 'updated' : 'created';
}

/**
 * runSync — sync one company for the rolling window.
 * @param {number} companyId
 * @param {{ trigger?: 'manual'|'scheduler', dryRun?: boolean }} opts
 * @returns {Promise<{ ok, summary, runId?, error? }>}
 */
async function runSync(companyId, { trigger = 'manual', dryRun = false } = {}) {
  const startedAt = Date.now();
  const creds = await settings.getDecryptedCreds(companyId);
  if (!creds) return { ok: false, error: 'No E-TimeOffice connection is configured for this company.' };
  if (!settings.hasCredentials(creds._row)) {
    return { ok: false, error: 'E-TimeOffice credentials are incomplete (Corporate ID, Username and Password are required).' };
  }

  const windowDays = Math.max(1, Number(creds._row.syncWindowDays) || 2);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (windowDays - 1));
  const windowFrom = client.fmtDate(from);
  const windowTo = client.fmtDate(to);

  // Open the run-level log (RUNNING) so an in-flight/crashed sync is still visible.
  const run = await prisma.attendanceSyncLog.create({
    data: { companyId, source: 'E-TimeOffice', trigger, status: 'RUNNING', windowFrom, windowTo },
  });

  const summary = { fetched: 0, imported: 0, updated: 0, skipped: 0, duplicates: 0, unmatched: 0, failed: 0 };

  // Pull the IN/OUT window (retry/timeout handled inside the client).
  const pull = await client.downloadInOutPunchData(creds, { empCode: creds.empCode || 'ALL', fromDate: from, toDate: to });
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
      verdict = await resolvePunch(prisma, { companyId, biometricCode });
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
  runSync, importOne, buildAttendanceData,
  toIsoDate, cleanTime, workTimeToHours, hhmmToMinutes, spanHours, mapStatus,
};
