/**
 * Payroll → Generate Payroll: id-handling verification.
 *
 * Covers the Prisma validation failure (a string companyId inside an OR block)
 * and every scenario around it: bulk / selective / branch / company, empty and
 * invalid selections, offboarded-status exclusion, Company Head vs HR, and a
 * 700+ employee dataset.
 *
 * Writes real payroll rows, so it works ONLY inside a scratch tenant and asserts
 * that the surrounding real data is untouched.
 *
 *   node backend/scripts/verifyPayrollGenerateIds.js
 */
const prisma = require('../src/config/prisma');
const payroll = require('../src/controllers/payrollController');
const { OFFBOARDED_STATUSES } = require('../src/utils/employeeStatus');
const { toPositiveInt, toPositiveIntList } = require('../src/utils/numericId');

const CO = 999931;          // scratch head company
const BR = 999932;          // scratch branch (Branch table)
const MONTH = 'January';
const YEAR = 2031;          // far-future period: cannot collide with real payroll
const BULK = 700;           // "large dataset" employees

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${label}${detail ? `  (${detail})` : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? `  (${detail})` : ''}`); }
};

const mkRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const gen = async (body, user = { id: 1, name: 'QA', role: 'Company Head' }) => {
  const res = mkRes();
  await payroll.generate({ body, user, query: {}, params: {}, headers: {} }, res);
  return res;
};

async function wipe() {
  await prisma.payroll.deleteMany({ where: { companyId: CO } }).catch(() => {});
  await prisma.companyPayroll.deleteMany({ where: { companyId: CO } }).catch(() => {});
  await prisma.branchPayroll.deleteMany({ where: { companyId: CO } }).catch(() => {});
  await prisma.attendanceSummary.deleteMany({ where: { employee: { companyId: CO } } }).catch(() => {});
  await prisma.attendance.deleteMany({ where: { employee: { companyId: CO } } }).catch(() => {});
  await prisma.employee.deleteMany({ where: { companyId: CO } }).catch(() => {});
  await prisma.branch.deleteMany({ where: { companyId: CO } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: CO } }).catch(() => {});
}

const emp = (n, over = {}) => ({
  employeeId: `QAPG-${n}`, companyId: CO, name: `QA Emp ${n}`, email: `qapg${n}@test.local`,
  department: 'Ops', designation: 'Staff', joinDate: new Date('2020-01-01'),
  salary: 30000, status: 'Active', ...over,
});

async function main() {
  console.log('Payroll Generate — id handling verification\n');
  await wipe();

  // Baseline of the REAL data, to prove nothing outside the scratch tenant moved.
  const realPayrollBefore = await prisma.payroll.count({ where: { companyId: { not: CO } } });

  await prisma.company.create({ data: { id: CO, name: 'QA Payroll Co', isHeadOffice: true, plan: 'Enterprise', basicPercent: 50, pfRate: 12, esicRate: 0.75, profTaxRate: 200 } });
  await prisma.branch.create({ data: { id: BR, companyId: CO, branchName: 'QA Branch', branchNo: 1 } });

  await prisma.employee.createMany({
    data: [
      emp(1), emp(2), emp(3),                                   // company-level, active
      emp(4, { branchId: BR }), emp(5, { branchId: BR }),       // branch-level, active
      ...OFFBOARDED_STATUSES.map((s, i) => emp(`off${i}`, { status: s })), // 5 offboarded
    ],
  });
  const all = await prisma.employee.findMany({ where: { companyId: CO }, select: { id: true, status: true, branchId: true } });
  const active = all.filter((e) => !OFFBOARDED_STATUSES.includes(e.status));
  const activeIds = active.map((e) => e.id);
  console.log(`scratch tenant ${CO}: ${all.length} employees (${active.length} active, ${all.length - active.length} offboarded)\n`);

  // ── §1 The reported failure ───────────────────────────────────────────────
  console.log('§1 The reported failure: companyId arriving as a string');
  const asString = await gen({ companyId: String(CO), month: MONTH, year: YEAR, role: 'Company Head' });
  check('generate with companyId "999931" (string) succeeds',
    asString.statusCode === 201, `${asString.statusCode} ${asString.body?.error || ''}`);
  check('no Prisma validation error leaked to the client',
    !/Invalid value provided|IntFilter|prisma\./i.test(String(asString.body?.error || '')));
  check('it generated for the ACTIVE employees only',
    asString.body?.count === active.length, `count=${asString.body?.count}, active=${active.length}`);

  const rows = await prisma.payroll.findMany({ where: { companyId: CO, month: MONTH, year: YEAR }, select: { employeeId: true } });
  const offIds = all.filter((e) => OFFBOARDED_STATUSES.includes(e.status)).map((e) => e.id);
  check('no offboarded/archived/resigned/terminated/inactive employee was paid',
    rows.every((r) => !offIds.includes(r.employeeId)), `${offIds.length} excluded`);

  // ── §2 Every entry path ───────────────────────────────────────────────────
  console.log('\n§2 Every generation path');
  const asInt = await gen({ companyId: CO, month: MONTH, year: YEAR, role: 'Company Head' });
  check('by company, id as a number', asInt.statusCode === 201, String(asInt.statusCode));

  const selected = activeIds.slice(0, 2);
  const sel = await gen({ companyId: CO, month: MONTH, year: YEAR, role: 'Company Head', employeeIds: selected });
  check('selected employees only', sel.statusCode === 201 && sel.body?.count === selected.length,
    `count=${sel.body?.count}`);

  const selStr = await gen({ companyId: String(CO), month: MONTH, year: YEAR, role: 'Company Head', employeeIds: selected.map(String) });
  check('selected employees sent as STRING ids', selStr.statusCode === 201 && selStr.body?.count === selected.length,
    `count=${selStr.body?.count}`);

  const branchEmps = all.filter((e) => e.branchId === BR).length;
  const byBranch = await gen({ companyId: CO, branchId: String(BR), month: MONTH, year: YEAR, role: 'HR' });
  check('by branch, branchId as a string', byBranch.statusCode === 201 && byBranch.body?.count === branchEmps,
    `count=${byBranch.body?.count}, branch employees=${branchEmps}`);
  const bp = await prisma.branchPayroll.findFirst({ where: { branchId: BR, payrollMonth: MONTH, payrollYear: YEAR } });
  check('branch payroll period row created', !!bp);

  // Branch-only, BRAND-NEW period: no companyId at all. BranchPayroll.companyId is
  // required, so this used to fail on the first run of a period (a re-run silently
  // worked via the upsert's update path). The company is now resolved from the branch.
  const NEWMONTH = 'February';
  await prisma.branchPayroll.deleteMany({ where: { branchId: BR, payrollMonth: NEWMONTH, payrollYear: YEAR } });
  const branchOnly = await gen({ branchId: BR, month: NEWMONTH, year: YEAR, role: 'HR' });
  check('branch-only generate, brand-new period → 201',
    branchOnly.statusCode === 201, `${branchOnly.statusCode} ${branchOnly.body?.error || ''}`);
  check('no "Argument `companyId` is missing" error',
    !/companyId.*is missing/i.test(String(branchOnly.body?.error || '')));
  const bpNew = await prisma.branchPayroll.findFirst({ where: { branchId: BR, payrollMonth: NEWMONTH, payrollYear: YEAR } });
  check('period row created with the company resolved from the branch',
    !!bpNew && bpNew.companyId === CO, `companyId=${bpNew?.companyId}, expected ${CO}`);
  const branchOnlyAgain = await gen({ branchId: BR, month: NEWMONTH, year: YEAR, role: 'HR' });
  check('branch-only re-run still works (update path)', branchOnlyAgain.statusCode === 201, String(branchOnlyAgain.statusCode));
  const bpRows = await prisma.payroll.count({ where: { companyId: CO, month: NEWMONTH, year: YEAR } });
  check('branch-only re-run did not duplicate rows', bpRows === branchEmps, `${bpRows} rows for ${branchEmps} branch employees`);
  const missing = await gen({ branchId: 987654321, month: NEWMONTH, year: YEAR, role: 'HR' });
  check('unknown branch → clean 404, not a Prisma crash',
    missing.statusCode === 404 && missing.body?.code === 'BRANCH_NOT_FOUND', `${missing.statusCode} ${missing.body?.code}`);

  // A BRANCH id arriving as companyId — Company.id and Branch.id share one
  // sequence and the workspace switcher hands a Company Head their branch, so
  // this is the NORMAL production shape, not an edge case. CompanyPayroll.companyId
  // is a FK to Company, so the raw branch id used to fail with
  // "Foreign key constraint violated: `companyId`".
  const BRMONTH = 'March';
  const asBranchWorkspace = await gen({ companyId: BR, month: BRMONTH, year: YEAR, role: 'Company Head' });
  check('branch id passed as companyId → 201 (no FK violation)',
    asBranchWorkspace.statusCode === 201, `${asBranchWorkspace.statusCode} ${asBranchWorkspace.body?.error || ''}`);
  check('no foreign-key error surfaced',
    !/Foreign key constraint|companyPayroll\.upsert/i.test(String(asBranchWorkspace.body?.error || '')));
  const cpBr = await prisma.companyPayroll.findFirst({ where: { payrollMonth: BRMONTH, payrollYear: YEAR, companyId: CO } });
  check('period row points at the OWNING company, not the branch',
    !!cpBr && cpBr.companyId === CO, `companyId=${cpBr?.companyId}, expected ${CO} (branch was ${BR})`);
  const brRows = await prisma.payroll.findMany({ where: { month: BRMONTH, year: YEAR, companyId: CO }, select: { companyId: true } });
  check('payroll rows agree with their period row',
    brRows.length > 0 && brRows.every((r) => r.companyId === cpBr.companyId), `${brRows.length} rows`);
  const ghost = await gen({ companyId: 987654321, month: BRMONTH, year: YEAR, role: 'Company Head' });
  check('unknown workspace id → clean 404',
    ghost.statusCode === 404 && ghost.body?.code === 'WORKSPACE_NOT_FOUND', `${ghost.statusCode} ${ghost.body?.code}`);

  // ── §3 Roles ──────────────────────────────────────────────────────────────
  console.log('\n§3 Roles');
  const ch = await gen({ companyId: String(CO), branchId: String(BR), month: MONTH, year: YEAR, role: 'Company Head' },
    { id: 1, name: 'QA CH', role: 'Company Head' });
  check('Company Head + branchId still generates company-wide (isBranch=false)',
    ch.statusCode === 201 && ch.body?.count === active.length, `count=${ch.body?.count}`);
  const hr = await gen({ companyId: String(CO), month: MONTH, year: YEAR, role: 'HR' }, { id: 2, name: 'QA HR', role: 'HR' });
  check('HR generates by company', hr.statusCode === 201, String(hr.statusCode));

  // ── §4 Bad input is refused clearly, never as a 500 ───────────────────────
  console.log('\n§4 Invalid input is refused with a clear 400');
  const cases = [
    ['companyId "abc"', { companyId: 'abc', month: MONTH, year: YEAR }, 'INVALID_COMPANY_ID'],
    ['companyId 0', { companyId: 0, month: MONTH, year: YEAR }, null],
    ['companyId -5', { companyId: -5, month: MONTH, year: YEAR }, 'INVALID_COMPANY_ID'],
    ['companyId 1.5', { companyId: 1.5, month: MONTH, year: YEAR }, 'INVALID_COMPANY_ID'],
    ['branchId "xyz"', { companyId: CO, branchId: 'xyz', month: MONTH, year: YEAR }, 'INVALID_BRANCH_ID'],
    ['employeeIds not an array', { companyId: CO, month: MONTH, year: YEAR, employeeIds: 'a,b' }, 'INVALID_EMPLOYEE_IDS'],
    ['employeeIds all invalid', { companyId: CO, month: MONTH, year: YEAR, employeeIds: ['x', null, NaN] }, 'NO_VALID_EMPLOYEE_IDS'],
    ['employeeIds empty array', { companyId: CO, month: MONTH, year: YEAR, employeeIds: [] }, 'NO_VALID_EMPLOYEE_IDS'],
  ];
  for (const [label, body, code] of cases) {
    const r = await gen(body);
    const ok = r.statusCode === 400 && (!code || r.body?.code === code);
    check(`${label} → 400`, ok, `${r.statusCode} ${r.body?.code || r.body?.error || ''}`);
    check(`${label} → no raw Prisma error`, !/Invalid value provided|IntFilter|Argument `/i.test(String(r.body?.error || '')));
  }

  const emptyCount = await prisma.payroll.count({ where: { companyId: CO, month: MONTH, year: YEAR } });
  check('an empty selection did NOT widen to the whole company',
    emptyCount === active.length, `${emptyCount} rows, expected ${active.length}`);

  const mixed = await gen({ companyId: CO, month: MONTH, year: YEAR, employeeIds: [String(activeIds[0]), 'junk', null] });
  check('a partly-invalid selection still processes the valid ids',
    mixed.statusCode === 201 && mixed.body?.count === 1, `count=${mixed.body?.count}`);

  // ── §5 Idempotency ────────────────────────────────────────────────────────
  console.log('\n§5 Re-generation updates, never duplicates');
  const before = await prisma.payroll.count({ where: { companyId: CO, month: MONTH, year: YEAR } });
  await gen({ companyId: String(CO), month: MONTH, year: YEAR, role: 'Company Head' });
  await gen({ companyId: CO, month: MONTH, year: YEAR, role: 'Company Head' });
  const after = await prisma.payroll.count({ where: { companyId: CO, month: MONTH, year: YEAR } });
  check('row count unchanged after two more full runs', before === after, `${before} → ${after}`);
  const dupes = await prisma.$queryRawUnsafe(
    'SELECT employeeId, COUNT(*) n FROM payroll WHERE companyId = ? AND month = ? AND year = ? GROUP BY employeeId HAVING n > 1', CO, MONTH, YEAR);
  check('no duplicate employee rows for the period', dupes.length === 0, `${dupes.length} duplicated`);

  // ── §6 Salary / attendance pipeline still runs ────────────────────────────
  console.log('\n§6 No regression in the calculation pipeline');
  const sample = await prisma.payroll.findFirst({ where: { companyId: CO, month: MONTH, year: YEAR } });
  check('rows carry the payroll identity (net = basic + allowances + bonus − deductions)',
    Math.abs((sample.basicSalary + sample.allowances + (sample.bonus || 0) - sample.deductions) - sample.netSalary) < 1,
    `${sample.basicSalary}+${sample.allowances}+${sample.bonus || 0}-${sample.deductions} = ${sample.netSalary}`);
  check('workflow status is pending_approval, not paid',
    sample.payrollStatus === 'pending_approval' && sample.paymentStatus === 'pending');
  const summaries = await prisma.attendanceSummary.count({ where: { employee: { companyId: CO }, month: MONTH, year: YEAR } });
  check('attendance summaries were computed for the period', summaries > 0, `${summaries} summaries`);
  const parent = await prisma.companyPayroll.findFirst({ where: { companyId: CO, payrollMonth: MONTH, payrollYear: YEAR } });
  check('period totals recomputed from child rows', parent && parent.totalEmployees === after,
    `parent=${parent?.totalEmployees}, rows=${after}`);

  // ── §7 Large dataset ──────────────────────────────────────────────────────
  console.log(`\n§7 Large dataset (${BULK}+ employees)`);
  await prisma.employee.createMany({
    data: Array.from({ length: BULK }, (_, i) => emp(`bulk${i}`)),
  });
  const total = await prisma.employee.count({ where: { companyId: CO, status: { notIn: OFFBOARDED_STATUSES } } });
  const t0 = Date.now();
  const big = await gen({ companyId: String(CO), month: MONTH, year: YEAR, role: 'Company Head' });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  check(`generate for ${total} employees succeeds`, big.statusCode === 201, `${big.statusCode} in ${secs}s`);
  check('every active employee got exactly one row', big.body?.count === total, `count=${big.body?.count}, active=${total}`);
  const bigDupes = await prisma.$queryRawUnsafe(
    'SELECT employeeId, COUNT(*) n FROM payroll WHERE companyId = ? AND month = ? AND year = ? GROUP BY employeeId HAVING n > 1', CO, MONTH, YEAR);
  check('still no duplicates at scale', bigDupes.length === 0);

  // ── §8 Isolation ──────────────────────────────────────────────────────────
  console.log('\n§8 Real data untouched');
  const realPayrollAfter = await prisma.payroll.count({ where: { companyId: { not: CO } } });
  check('no payroll row outside the scratch tenant was created or removed',
    realPayrollAfter === realPayrollBefore, `${realPayrollBefore} → ${realPayrollAfter}`);

  // ── §9 The helper itself ──────────────────────────────────────────────────
  console.log('\n§9 numericId helper');
  check("toPositiveInt('7') → 7", toPositiveInt('7') === 7);
  check('toPositiveInt(7) → 7', toPositiveInt(7) === 7);
  check('rejects 0, -1, 1.5, NaN, null, "", "abc", true, {}',
    [0, -1, 1.5, NaN, null, undefined, '', 'abc', true, {}, []].every((v) => toPositiveInt(v) === undefined));
  const list = toPositiveIntList(['1', 2, 'x', null, NaN, 2, 0, -3]);
  check('toPositiveIntList de-duplicates and reports rejects',
    JSON.stringify(list.ids) === '[1,2]' && list.rejected.length === 5, JSON.stringify(list));

  console.log(`\n${'-'.repeat(60)}\n${pass} passed, ${fail} failed\n`);
  await wipe();
}

main()
  .catch(async (e) => { console.error('\nFATAL:', e); fail++; await wipe().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); process.exit(fail ? 1 : 0); });
