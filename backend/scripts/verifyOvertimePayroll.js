/**
 * E2E: Attendance → Overtime → Payroll → Payslip → Reports.
 *
 * Exercises the REAL HTTP endpoints the UI calls, asserts the money, and cleans
 * up every row it creates. Safe to run against any environment.
 *
 * Usage: node scripts/verifyOvertimePayroll.js [baseUrl]
 */
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');
const otPay = require('../src/utils/overtimePay');
require('dotenv').config();

const BASE = process.argv[2] || 'http://localhost:5000/api';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const YEAR = 2027, MONTH_NUM = 5, MONTH = MONTHS[MONTH_NUM - 1]; // scratch period
const OT_HOURS = 10;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};
const near = (a, b, tol = 1.5) => Math.abs(Number(a || 0) - Number(b || 0)) <= tol;

(async () => {
  const user = await prisma.user.findFirst({
    where: { role: 'Company Head', companyId: { not: null } },
    select: { id: true, email: true, role: true, companyId: true },
  });
  if (!user) throw new Error('No Company Head user available.');
  const token = jwt.sign({ id: user.id, role: user.role, companyId: user.companyId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const emp = await prisma.employee.findFirst({
    where: { salary: { gt: 0 }, status: 'Active', companyId: user.companyId },
    select: { id: true, name: true, employeeId: true, companyId: true, branchId: true, salary: true, department: true },
    orderBy: { id: 'asc' },
  });
  if (!emp) throw new Error(`No active salaried employee in company ${user.companyId}.`);
  const company = await prisma.company.findUnique({
    where: { id: emp.companyId },
    select: { overtimeRate: true, basicPercent: true, pfRate: true, esicRate: true, profTaxRate: true },
  });

  const otIds = [];
  const cleanup = async () => {
    for (const id of otIds) await prisma.overtime.delete({ where: { id } }).catch(() => {});
    await prisma.payroll.deleteMany({ where: { employeeId: emp.id, month: MONTH, year: YEAR } }).catch(() => {});
    await prisma.attendanceSummary.deleteMany({ where: { employeeId: emp.id, month: MONTH, year: YEAR } }).catch(() => {});
  };
  await cleanup();

  console.log(`Subject: ${emp.name} (${emp.employeeId}) · salary ₹${emp.salary} · ${MONTH} ${YEAR}\n`);

  try {
    // ── A. Overtime creation ────────────────────────────────────────────────
    console.log('A. Overtime record');
    const createRes = await fetch(`${BASE}/overtime`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        companyId: emp.companyId, empId: emp.id, empName: emp.name, empCode: emp.employeeId,
        department: emp.department, date: `${YEAR}-${String(MONTH_NUM).padStart(2, '0')}-12`,
        in: '18:00', out: '04:00', otHours: OT_HOURS, type: 'Normal Overtime', reason: 'E2E-VERIFY',
      }),
    });
    const createdOt = await createRes.json();
    ok('POST /overtime creates a record', createRes.status === 201, `HTTP ${createRes.status}`);
    if (createdOt?.id) otIds.push(createdOt.id);
    ok('OT hours stored', Number(createdOt?.otHours) === OT_HOURS, `otHours=${createdOt?.otHours}`);
    ok('OT defaults to Pending (needs approval)', createdOt?.status === 'Pending', `status=${createdOt?.status}`);

    // ── B. Pending OT must NOT be paid ──────────────────────────────────────
    console.log('\nB. Pending overtime is excluded from pay');
    const dryPending = await (await fetch(`${BASE}/attendance/sync-payroll`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ companyId: emp.companyId, month: MONTH_NUM, year: YEAR, dryRun: true }),
    })).json();
    const pendRow = (dryPending.rows || []).find((r) => r.employeeId === emp.id);
    ok('pending OT contributes 0 hours', Number(pendRow?.otHours || 0) === 0, `otHours=${pendRow?.otHours}`);
    ok('pending OT contributes ₹0', Number(pendRow?.otAmount || 0) === 0, `otAmount=${pendRow?.otAmount}`);

    // ── C. Approve ──────────────────────────────────────────────────────────
    console.log('\nC. Approve the overtime');
    const upd = await fetch(`${BASE}/overtime/${createdOt.id}`, {
      method: 'PUT', headers: H, body: JSON.stringify({ status: 'Approved' }),
    });
    const approved = await upd.json();
    ok('PUT /overtime/:id approves', upd.status === 200 && approved?.status === 'Approved', `status=${approved?.status}`);

    // ── D. Preview ──────────────────────────────────────────────────────────
    console.log('\nD. Sync preview (what the user reviews)');
    const dry = await (await fetch(`${BASE}/attendance/sync-payroll`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ companyId: emp.companyId, month: MONTH_NUM, year: YEAR, dryRun: true }),
    })).json();
    const row = (dry.rows || []).find((r) => r.employeeId === emp.id);
    ok('approved OT hours appear in preview', Number(row?.otHours) === OT_HOURS, `otHours=${row?.otHours}`);

    // Independent recomputation of the expected amount.
    const dim = new Date(YEAR, MONTH_NUM, 0).getDate();
    const workingDays = Math.max(0, dim - (row?.weeklyOff || 0) - (row?.holiday || 0)) || dim;
    const policy = await require('../src/services/deductionPolicyService')
      .resolveEffectivePolicy({ companyId: emp.companyId, branchId: emp.branchId }).catch(() => null);
    const mult = otPay.resolveOvertimeMultiplier(policy, company);
    const expectedOt = otPay.computeOvertimeAmount({
      otHours: OT_HOURS, monthlyGross: emp.salary, workingDays, multiplier: mult,
    });
    console.log(`     formula: ${OT_HOURS}h × (₹${emp.salary} / (${workingDays}d × 8)) × ${mult} = ₹${expectedOt}`);
    ok('preview OT amount matches the formula', near(row?.otAmount, expectedOt), `preview=₹${row?.otAmount} expected=₹${expectedOt}`);

    // ── E. Push to Payroll Engine ───────────────────────────────────────────
    console.log('\nE. Push to Payroll Engine');
    const pushBody = {
      companyId: emp.companyId, month: MONTH, year: YEAR, replace: true,
      rows: [{
        employeeId: emp.id, employeeCode: emp.employeeId, employeeName: emp.name,
        department: emp.department, monthlySalary: emp.salary, workingDays,
        present: row?.present ?? 0, paidLeave: 0, unpaidLeave: 0, halfDay: 0,
        otHours: row?.otHours ?? OT_HOURS, weeklyOff: row?.weeklyOff ?? 0, holiday: row?.holiday ?? 0,
        payableDays: row?.payableDays ?? 0,
        dailySalary: Math.round(emp.salary / dim),
        payableSalary: Math.round((emp.salary / dim) * (row?.payableDays ?? 0)),
        attendanceStatus: 'Ready',
      }],
    };
    const t0 = Date.now();
    const pushRes = await fetch(`${BASE}/attendance/push-to-payroll`, { method: 'POST', headers: H, body: JSON.stringify(pushBody) });
    const push = await pushRes.json();
    const pushMs = Date.now() - t0;
    ok('POST /attendance/push-to-payroll succeeds', pushRes.status === 200, `HTTP ${pushRes.status}`);
    ok('engine ran for every employee', push?.computed === 1 && push?.failed === 0, `computed=${push?.computed} failed=${push?.failed}`);
    ok('push completes in < 2s', pushMs < 2000, `${pushMs}ms`);
    ok('response reports the OT total', near(push?.overtimeTotal, expectedOt), `overtimeTotal=₹${push?.overtimeTotal}`);

    // ── F. The payroll row ──────────────────────────────────────────────────
    console.log('\nF. Payroll record');
    const pay = await prisma.payroll.findFirst({
      where: { employeeId: emp.id, month: MONTH, year: YEAR },
      select: {
        id: true, basicSalary: true, allowances: true, deductions: true, overtime: true,
        otHours: true, netSalary: true, bonus: true, payableDays: true, workingDays: true,
      },
    });
    ok('payroll row exists', !!pay);
    ok('OT hours stored on payroll', Number(pay?.otHours) === OT_HOURS, `otHours=${pay?.otHours}`);
    ok('OT AMOUNT calculated', Number(pay?.overtime) > 0, `overtime=₹${pay?.overtime}`);
    ok('OT amount matches preview exactly', near(pay?.overtime, row?.otAmount), `payroll=₹${pay?.overtime} preview=₹${row?.otAmount}`);
    ok('OT is inside allowances (so it is paid)', Number(pay?.allowances) >= Number(pay?.overtime) - 1,
      `allowances=₹${pay?.allowances} overtime=₹${pay?.overtime}`);

    // Net identity: net = basic + allowances + bonus − deductions
    const expectedNet = Math.max(0, (pay.basicSalary + pay.allowances + (pay.bonus || 0)) - pay.deductions);
    ok('net = basic + allowances + bonus − deductions', near(pay?.netSalary, expectedNet),
      `net=₹${pay?.netSalary} expected=₹${expectedNet}`);

    // ── G. OT actually raises net pay (the headline claim) ──────────────────
    console.log('\nG. Overtime raises net pay');
    const netWithOt = pay.netSalary;
    await prisma.overtime.update({ where: { id: createdOt.id }, data: { status: 'Rejected' } });
    await fetch(`${BASE}/attendance/push-to-payroll`, { method: 'POST', headers: H, body: JSON.stringify({ ...pushBody, rows: [{ ...pushBody.rows[0], otHours: 0 }] }) });
    const payNoOt = await prisma.payroll.findFirst({
      where: { employeeId: emp.id, month: MONTH, year: YEAR },
      select: { netSalary: true, overtime: true, otHours: true },
    });
    ok('rejected OT pays ₹0', Number(payNoOt?.overtime || 0) === 0, `overtime=₹${payNoOt?.overtime}`);
    ok('net is LOWER without OT', Number(payNoOt?.netSalary) < netWithOt,
      `withOT=₹${netWithOt} withoutOT=₹${payNoOt?.netSalary} (Δ ₹${Math.round(netWithOt - payNoOt.netSalary)})`);
    ok('the difference equals the OT amount', near(netWithOt - payNoOt.netSalary, expectedOt, 2),
      `Δ=₹${Math.round(netWithOt - payNoOt.netSalary)} otAmount=₹${expectedOt}`);

    // Restore approval for the remaining checks.
    await prisma.overtime.update({ where: { id: createdOt.id }, data: { status: 'Approved' } });
    await fetch(`${BASE}/attendance/push-to-payroll`, { method: 'POST', headers: H, body: JSON.stringify(pushBody) });

    // ── H. Idempotency — no duplicate OT, no double-counting ───────────────
    console.log('\nH. Idempotency');
    await fetch(`${BASE}/attendance/push-to-payroll`, { method: 'POST', headers: H, body: JSON.stringify(pushBody) });
    await fetch(`${BASE}/attendance/push-to-payroll`, { method: 'POST', headers: H, body: JSON.stringify(pushBody) });
    const rowCount = await prisma.payroll.count({ where: { employeeId: emp.id, month: MONTH, year: YEAR } });
    const afterRepeat = await prisma.payroll.findFirst({
      where: { employeeId: emp.id, month: MONTH, year: YEAR },
      select: { overtime: true, otHours: true, netSalary: true },
    });
    ok('no duplicate payroll rows after 3 pushes', rowCount === 1, `rows=${rowCount}`);
    ok('OT amount not multiplied by repeats', near(afterRepeat?.overtime, expectedOt), `overtime=₹${afterRepeat?.overtime}`);
    ok('OT hours not accumulated', Number(afterRepeat?.otHours) === OT_HOURS, `otHours=${afterRepeat?.otHours}`);
    ok('net stable across repeats', near(afterRepeat?.netSalary, netWithOt, 2), `net=₹${afterRepeat?.netSalary}`);

    // ── I. Payslip earnings ─────────────────────────────────────────────────
    console.log('\nI. Payslip / reports');
    // Real contract: POST /compliance-reports/generate { reportKey, payrollPeriod:"YYYY-MM" }.
    const period = `${YEAR}-${String(MONTH_NUM).padStart(2, '0')}`;
    const genReport = async (reportKey, extra = {}) => {
      const res = await fetch(`${BASE}/compliance-reports/generate`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ reportKey, companyId: emp.companyId, payrollPeriod: period, startDate: `${period}-01`, endDate: `${period}-${new Date(YEAR, MONTH_NUM, 0).getDate()}`, ...extra }),
      });
      const json = await res.json().catch(() => null);
      return { status: res.status, json };
    };

    const slip = await genReport('salary_slip', { employeeId: emp.id });
    const slipRow = (slip.json?.rows || []).find((r) => String(r.code) === String(emp.employeeId) || r.name === emp.name);
    if (slipRow) {
      ok('salary slip exposes the OT amount', near(slipRow.overtime, expectedOt), `overtime=₹${slipRow.overtime}`);
      ok('salary slip exposes OT hours', Number(slipRow.otHours) === OT_HOURS, `otHours=${slipRow.otHours}`);
    } else {
      ok('salary slip returned the employee', false, `HTTP ${slip.status} ${slip.json?.error || `${(slip.json?.rows || []).length} rows`}`);
      ok('salary slip exposes OT hours', false, 'no row');
    }

    const reg = await genReport('salary_register');
    const regRow = (reg.json?.rows || []).find((r) => r.name === emp.name);
    if (regRow) ok('salary register shows the OT amount', near(regRow.overtime, expectedOt), `overtime=₹${regRow.overtime}`);
    else ok('salary register returned the employee', false, `HTTP ${reg.status} ${reg.json?.error || `${(reg.json?.rows || []).length} rows`}`);

    // ── J. Overtime register still reports the raw hours ────────────────────
    const otReg = await genReport('overtime_register');
    const otRegRow = (otReg.json?.rows || []).find((r) => String(r.employeeName || r.name) === emp.name);
    ok('overtime register lists the entry', !!otRegRow,
      otRegRow ? `hours=${otRegRow.otHours ?? otRegRow.hours}` : `HTTP ${otReg.status} ${otReg.json?.error || `${(otReg.json?.rows || []).length} rows`}`);
  } finally {
    await cleanup();
    console.log(`\n${pass} passed, ${fail} failed  (test data cleaned up)`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  }
})().catch(async (e) => { console.error('SUITE ERROR:', e); await prisma.$disconnect(); process.exit(1); });
