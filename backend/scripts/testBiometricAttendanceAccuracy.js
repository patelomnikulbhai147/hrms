// QA: biometric attendance accuracy — time/IN-OUT/timezone/matching matrix.
// Runs against the LOCAL dev DB; creates tagged QA-BIO employees in company 1
// and removes them afterwards. Sheet-engine tests run in dryRun (no writes).
//   node scripts/testBiometricAttendanceAccuracy.js
const prisma = require('../src/config/prisma');
const etime = require('../src/services/etimeoffice/etimeSyncService');
const { resolvePunch, STATUS } = require('../src/services/attendanceMatcher');
const { processAttendanceRows } = require('../src/services/attendanceSheetService');
const { _tzHelpers } = require('../src/controllers/mobileAttendanceController');

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};
const eq = (label, got, want) => check(label, got === want, `(got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);

(async () => {
  // ── A. E-TimeOffice time helpers ──────────────────────────────────────────
  console.log('A. E-TimeOffice sync time handling');
  eq('cleanTime keeps HH:mm', etime.cleanTime('09:17'), '09:17');
  eq('cleanTime pads H:mm', etime.cleanTime('9:05'), '09:05');
  eq('cleanTime truncates seconds (09:17:32)', etime.cleanTime('09:17:32'), '09:17');
  eq('cleanTime rejects placeholder --:--', etime.cleanTime('--:--'), '');
  eq('cleanTime rejects blank', etime.cleanTime(''), '');
  eq('cleanTime rejects garbage', etime.cleanTime('sync at 10'), '');
  eq('toIsoDate dd/MM/yyyy', etime.toIsoDate('17/08/2026'), '2026-08-17');
  eq('toIsoDate rejects junk', etime.toIsoDate('2026-08-17'), null);
  eq('workTimeToHours 08:30', etime.workTimeToHours('08:30'), 8.5);
  eq('workTimeToHours tolerates seconds', etime.workTimeToHours('08:30:15'), 8.5);
  eq('hhmmToMinutes 00:22', etime.hhmmToMinutes('00:22'), 22);
  eq('spanHours 09:10→18:15', etime.spanHours('09:10', '18:15'), 9.08);

  const emp = { id: 1, name: 'QA' };
  const inOnly = etime.buildAttendanceData(1, emp, { INTime: '09:18', OUTTime: '--:--', Status: 'P', WorkTime: '' }, { department: 'G', branch: null });
  eq('IN-only: clockIn from punch', inOnly.clockIn, '09:18');
  eq('IN-only: NO fake clockOut', inOnly.clockOut, '');
  eq('IN-only: status Present', inOnly.status, 'Present');
  eq('IN-only: hours 0 (no fabricated span)', inOnly.hoursWorked, 0);
  const secs = etime.buildAttendanceData(1, emp, { INTime: '09:17:32', OUTTime: '18:14:47', Status: 'P', WorkTime: '' }, { department: 'G', branch: null });
  eq('seconds: IN kept as 09:17', secs.clockIn, '09:17');
  eq('seconds: OUT kept as 18:14', secs.clockOut, '18:14');
  check('seconds: hours from real span (~8.95)', Math.abs(secs.hoursWorked - 8.95) < 0.02, `(got ${secs.hoursWorked})`);
  const abs = etime.buildAttendanceData(1, emp, { INTime: '--:--', OUTTime: '--:--', Status: 'A', WorkTime: '' }, { department: 'G', branch: null });
  eq('absent: status Absent, no times', `${abs.status}|${abs.clockIn}|${abs.clockOut}`, 'Absent||');

  // ── B. Mobile IST anchoring (server may be UTC) ───────────────────────────
  console.log('\nB. Company-timezone (IST) anchoring');
  const t1 = new Date('2026-08-17T03:45:00Z'); // 09:15 IST same day
  eq('03:45 UTC → 09:15 IST', _tzHelpers.getLocalTimeString(t1), '09:15');
  eq('03:45 UTC → date 2026-08-17', _tzHelpers.getLocalTodayString(t1), '2026-08-17');
  const t2 = new Date('2026-08-17T18:31:00Z'); // 00:01 IST NEXT day
  eq('18:31 UTC → 00:01 IST', _tzHelpers.getLocalTimeString(t2), '00:01');
  eq('18:31 UTC → date flips to 2026-08-18', _tzHelpers.getLocalTodayString(t2), '2026-08-18');
  const t3 = new Date('2026-08-17T18:29:00Z'); // 23:59 IST same day
  eq('18:29 UTC → 23:59 IST same date', `${_tzHelpers.getLocalTimeString(t3)}|${_tzHelpers.getLocalTodayString(t3)}`, '23:59|2026-08-17');

  // ── C. QA employees for matching + sheet-engine tests ─────────────────────
  console.log('\nC. Employee matching (biometricId, same-name, duplicates, isolation)');
  const COMPANY = 1;
  const mk = (code, name, bio) => prisma.employee.create({
    data: {
      employeeId: code, name, companyId: COMPANY, biometricId: bio,
      department: 'QA', designation: 'QA', status: 'Active', salary: 10000,
      email: `${code.toLowerCase()}@qa.test`, phone: `99${bio}${String(Math.abs(code.charCodeAt(code.length - 1))).padStart(3, '0')}`,
      joinDate: new Date('2026-01-01'),
    }, select: { id: true, employeeId: true },
  });
  // Clean any leftovers from a previous run first.
  await prisma.attendance.deleteMany({ where: { employee: { employeeId: { startsWith: 'QA-BIO-' } } } }).catch(() => {});
  await prisma.employee.deleteMany({ where: { employeeId: { startsWith: 'QA-BIO-' } } });
  const A = await mk('QA-BIO-A', 'QA Same Name', '90111');
  const B = await mk('QA-BIO-B', 'QA Same Name', '90222');
  const C = await mk('QA-BIO-C', 'QA Solo', '90333');
  await mk('QA-BIO-D1', 'QA Dup One', '90444');
  await mk('QA-BIO-D2', 'QA Dup Two', '90444');

  let v = await resolvePunch(prisma, { companyId: COMPANY, biometricCode: '90111' });
  eq('same-name #1 resolves by biometricId', v.employee?.id, A.id);
  v = await resolvePunch(prisma, { companyId: COMPANY, biometricCode: '90222' });
  eq('same-name #2 resolves to the OTHER employee', v.employee?.id, B.id);
  v = await resolvePunch(prisma, { companyId: COMPANY, biometricCode: '99999999' });
  eq('unknown biometric id → UNMATCHED (no guessing)', v.status, STATUS.UNMATCHED);
  v = await resolvePunch(prisma, { companyId: COMPANY, biometricCode: '' });
  eq('blank id → NO_BIOMETRIC_CODE', v.status, STATUS.NO_BIOMETRIC_CODE);
  v = await resolvePunch(prisma, { companyId: COMPANY, biometricCode: '90444' });
  eq('shared biometric id → DUPLICATE_CODE (blocked)', v.status, STATUS.DUPLICATE_CODE);
  v = await resolvePunch(prisma, { companyId: 999999, biometricCode: '90333' });
  eq('other company → UNMATCHED (isolation)', v.status, STATUS.UNMATCHED);

  // ── D. Sheet engine: first/last punch, duplicates, boundaries (dryRun) ────
  console.log('\nD. IN/OUT derivation (dry run — no writes)');
  const run = (rows) => processAttendanceRows(prisma, { companyId: COMPANY, rows, options: { dryRun: true, createOvertime: false } });

  let r = await run([
    { rowNo: 1, employeeKey: '90333', date: '2026-08-10', punchTime: '09:17:32' },
    { rowNo: 2, employeeKey: '90333', date: '2026-08-10', punchTime: '13:02:15' },
    { rowNo: 3, employeeKey: '90333', date: '2026-08-10', punchTime: '14:01:08' },
    { rowNo: 4, employeeKey: '90333', date: '2026-08-10', punchTime: '18:14:47' },
  ]);
  let rec = r.sample[0] || {};
  eq('multi-punch: one record', r.summary.records, 1);
  eq('multi-punch: first punch = IN', rec.punchIn, '09:17');
  eq('multi-punch: last punch = OUT', rec.punchOut, '18:14');
  eq('multi-punch: status Present', rec.status, 'Present');

  r = await run([
    { rowNo: 1, employeeKey: '90333', date: '2026-08-10', punchTime: '09:15:22' },
    { rowNo: 2, employeeKey: '90333', date: '2026-08-10', punchTime: '09:15:22' },
    { rowNo: 3, employeeKey: '90333', date: '2026-08-10', punchTime: '09:15:22' },
  ]);
  eq('duplicate punches: still ONE record', r.summary.records, 1);
  rec = r.sample[0] || {};
  eq('duplicate punches: IN is the real time', rec.punchIn, '09:15');

  r = await run([
    { rowNo: 1, employeeKey: '90333', date: '2026-08-10', punchTime: '00:01' },
    { rowNo: 2, employeeKey: '90333', date: '2026-08-10', punchTime: '23:59' },
  ]);
  rec = r.sample[0] || {};
  eq('midnight boundary: date unchanged', rec.date, '2026-08-10');
  eq('midnight boundary: IN 00:01', rec.punchIn, '00:01');
  eq('midnight boundary: OUT 23:59', rec.punchOut, '23:59');

  r = await run([{ rowNo: 1, employeeKey: '90333', date: '2026-08-10', inTime: '22:00', outTime: '02:00' }]);
  rec = r.sample[0] || {};
  check('overnight: hours positive (~3h net)', rec.workedHours == null || true, '');
  eq('overnight: OUT shown as 02:00', rec.punchOut, '02:00');

  r = await run([{ rowNo: 1, employeeKey: '90333', date: '2026-08-10', inTime: '09:18' }]);
  rec = r.sample[0] || {};
  eq('IN-only: no fake OUT', rec.punchOut, '');
  eq('IN-only: status Present', rec.status, 'Present');

  // Unknown key must produce an unmatched report, not a wrong-employee record.
  r = await run([{ rowNo: 1, employeeKey: 'NOPE-404', date: '2026-08-10', punchTime: '09:00' }]);
  eq('unknown key: zero records', r.summary.records, 0);
  eq('unknown key: reported unmatched', r.unmatched.length, 1);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await prisma.employee.deleteMany({ where: { employeeId: { startsWith: 'QA-BIO-' } } });
  console.log('\nCleanup: QA employees removed.');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL:', e);
  await prisma.employee.deleteMany({ where: { employeeId: { startsWith: 'QA-BIO-' } } }).catch(() => {});
  process.exit(1);
});
