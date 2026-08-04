/**
 * Attendance → Payroll write paths: tenant scope verification.
 *
 * Both `syncPayroll` (Attendance Sync) and `pushToPayroll` (Push to Payroll)
 * CREATE payroll rows. Both used to accept the workspace the CLIENT named in
 * place of the caller's real grants, so a Company Head of one tenant could read
 * — and write payroll for — another tenant's employees.
 *
 * Denial cases run against live data but return before any write. The success
 * case runs entirely inside a scratch tenant and cleans up after itself.
 *
 *   node backend/scripts/verifyAttendancePayrollScope.js
 */
const prisma = require('../src/config/prisma');
const att = require('../src/controllers/attendanceController');

const CO = 999951, VICTIM = 1;
let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log(`  ✓ ${l}${d ? `  (${d})` : ''}`); } else { fail++; console.log(`  ✗ ${l}${d ? `  (${d})` : ''}`); } };

const mkRes = () => { const r = { statusCode: 200, body: null }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const call = async (fn, user, body) => { const res = mkRes(); await att[fn]({ user, body, query: {}, params: {}, headers: {} }, res); return res; };

const OUTSIDER = { id: 99991, name: 'QA Outsider', role: 'Company Head', companyId: 26, accessibleCompanyIds: [26], accessibleBranchIds: [] };
const SUPER = { id: 1, name: 'QA SA', role: 'Super Admin' };

async function wipe() {
  await prisma.payroll.deleteMany({ where: { companyId: CO } }).catch(() => {});
  await prisma.attendanceSummary.deleteMany({ where: { employee: { companyId: CO } } }).catch(() => {});
  const us = await prisma.user.findMany({ where: { companyId: CO }, select: { id: true } }).catch(() => []);
  if (us.length) await prisma.auditLog.deleteMany({ where: { userId: { in: us.map((u) => u.id) } } }).catch(() => {});
  if (us.length) await prisma.user.deleteMany({ where: { id: { in: us.map((u) => u.id) } } }).catch(() => {});
  await prisma.employee.deleteMany({ where: { companyId: CO } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: CO } }).catch(() => {});
}

async function main() {
  console.log('Attendance → Payroll tenant-scope verification\n');
  await wipe();
  const realBefore = await prisma.payroll.count({ where: { companyId: { not: CO } } });

  // ── §1 syncPayroll ────────────────────────────────────────────────────────
  console.log('§1 syncPayroll (Attendance Sync)');
  let r = await call('syncPayroll', OUTSIDER, { month: 7, year: 2026, dryRun: true, companyId: VICTIM });
  check('outsider naming another tenant → 403', r.statusCode === 403, `${r.statusCode}`);
  check('no victim rows returned', !(r.body?.rows?.length), `${r.body?.rows?.length || 0} rows`);

  r = await call('syncPayroll', OUTSIDER, { month: 7, year: 2026, dryRun: true, scopeIds: [VICTIM, 3, 3200] });
  const leaked = [...new Set((r.body?.rows || []).map((x) => x.companyId))].filter((c) => c !== 26);
  check('outsider naming foreign scopeIds leaks nothing', leaked.length === 0, `companies seen: ${JSON.stringify(leaked)}`);

  r = await call('syncPayroll', OUTSIDER, { month: 7, year: 2026, dryRun: true });
  const own = [...new Set((r.body?.rows || []).map((x) => x.companyId))];
  check('outsider still sees their OWN tenant', r.statusCode === 200 && own.every((c) => c === 26) && (r.body?.rows?.length > 0),
    `${r.body?.rows?.length} rows, companies ${JSON.stringify(own)}`);

  r = await call('syncPayroll', SUPER, { month: 7, year: 2026, dryRun: true, companyId: VICTIM });
  check('Super Admin is unrestricted', r.statusCode === 200 && r.body?.rows?.length > 0, `${r.body?.rows?.length} rows`);

  // A multi-company grant must keep working — this is the real production case
  // (a Company Head granted several companies).
  const multi = { id: 99993, name: 'QA Multi', role: 'Company Head', companyId: 1, accessibleCompanyIds: [1, 2, 11], accessibleBranchIds: [] };
  r = await call('syncPayroll', multi, { month: 7, year: 2026, dryRun: true, companyId: 11 });
  const seen = [...new Set((r.body?.rows || []).map((x) => x.companyId))];
  check('a granted second company is still reachable', r.statusCode === 200 && r.body?.rows?.length > 0 && seen.every((c) => c === 11),
    `${r.body?.rows?.length} rows from company ${JSON.stringify(seen)}`);

  // ── §2 pushToPayroll ──────────────────────────────────────────────────────
  console.log('\n§2 pushToPayroll (Push to Payroll)');
  const victimEmps = await prisma.employee.findMany({ where: { companyId: VICTIM }, select: { id: true, name: true }, take: 3 });
  const pushRows = victimEmps.map((e) => ({
    employeeId: e.id, employeeName: e.name, payableSalary: 1000, present: 20, paidLeave: 0,
    unpaidLeave: 0, halfDay: 0, otHours: 0, payableDays: 30, workingDays: 26, weeklyOff: 4, holiday: 0,
  }));

  r = await call('pushToPayroll', OUTSIDER, { month: 'July', year: 2026, companyId: VICTIM, rows: pushRows });
  check('outsider naming the victim company → 403', r.statusCode === 403, `${r.statusCode} ${r.body?.error || ''}`);

  r = await call('pushToPayroll', OUTSIDER, { month: 'July', year: 2026, rows: pushRows });
  check('outsider without a named company → 403', r.statusCode === 403, `${r.statusCode}`);

  const afterDenials = await prisma.payroll.count({ where: { companyId: VICTIM, month: 'July', year: 2026 } });

  // ── §3 The legitimate path still writes ───────────────────────────────────
  console.log('\n§3 The legitimate push still works (scratch tenant)');
  await prisma.company.create({ data: { id: CO, name: 'QA Scope Co', isHeadOffice: true, plan: 'Enterprise' } });
  await prisma.employee.createMany({
    data: [1, 2].map((n) => ({
      employeeId: `QASC-${n}`, companyId: CO, name: `QA Scope ${n}`, email: `qasc${n}@test.local`,
      department: 'Ops', designation: 'Staff', joinDate: new Date('2020-01-01'), salary: 30000, status: 'Active',
    })),
  });
  const mine = await prisma.employee.findMany({ where: { companyId: CO }, select: { id: true, name: true } });
  // A REAL user row: auditLog.userId is a FK, so a fake id would make the batch
  // audit fail (caught, but it would hide whether the audit path actually works).
  const ownerUser = await prisma.user.create({
    data: {
      name: 'QA Owner', email: 'qascopeowner@test.local', username: 'qascopeowner',
      passwordHash: 'x', role: 'Company Head', companyId: CO, status: 'Active',
    },
  });
  const owner = { id: ownerUser.id, name: 'QA Owner', role: 'Company Head', companyId: CO, accessibleCompanyIds: [CO], accessibleBranchIds: [] };
  r = await call('pushToPayroll', owner, {
    month: 'July', year: 2031, companyId: CO,
    rows: mine.map((e) => ({
      employeeId: e.id, employeeName: e.name, payableSalary: 25000, present: 26, paidLeave: 0,
      unpaidLeave: 0, halfDay: 0, otHours: 0, payableDays: 31, workingDays: 26, weeklyOff: 5, holiday: 0,
    })),
  });
  check('owner pushes their own employees → 200', r.statusCode === 200, `${r.statusCode} ${r.body?.error || ''}`);
  const created = await prisma.payroll.count({ where: { companyId: CO, month: 'July', year: 2031 } });
  check('payroll rows were created by the push', created === mine.length, `${created} rows for ${mine.length} employees`);

  r = await call('syncPayroll', owner, { month: 7, year: 2031, dryRun: true, companyId: CO });
  check('owner can sync their own tenant', r.statusCode === 200 && r.body?.rows?.length === mine.length, `${r.body?.rows?.length} rows`);

  // ── §4 Isolation ──────────────────────────────────────────────────────────
  console.log('\n§4 Isolation');
  check('the denied pushes wrote nothing to the victim',
    afterDenials === (await prisma.payroll.count({ where: { companyId: VICTIM, month: 'July', year: 2026 } })));
  const realAfter = await prisma.payroll.count({ where: { companyId: { not: CO } } });
  check('no payroll row outside the scratch tenant changed', realAfter === realBefore, `${realBefore} → ${realAfter}`);

  console.log(`\n${'-'.repeat(58)}\n${pass} passed, ${fail} failed\n`);
  await wipe();
}

main()
  .catch(async (e) => { console.error('\nFATAL:', e); fail++; await wipe().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); process.exit(fail ? 1 : 0); });
