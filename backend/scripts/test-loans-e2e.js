/* E2E: loan lifecycle (HTTP) + automatic payroll deduction (direct). Self-cleaning.
 *   node scripts/test-loans-e2e.js
 */
const prisma = require('../src/config/prisma');
const { applyLoanToPayrollRow, unsettleForPayroll } = require('../src/services/loanPayroll');

const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

async function login() {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'om@gmail.com', password: 'Om@12345' }) });
  const j = await r.json();
  return j.token;
}
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

(async () => {
  const TEST_MONTH = 'March', TEST_YEAR = 2031; // far-future period → no collision with real payroll
  let loanId, empId, emiAmount;
  try {
    const token = await login();
    ok(!!token, 'login as Company Head');

    // 1) Loan types seed
    let types = await (await fetch(`${BASE}/loans/types`, { headers: H(token) })).json();
    ok(Array.isArray(types) && types.length >= 9, `loan types seeded (${types.length})`);

    // pick a real employee w/ salary in company 1
    const emps = await prisma.employee.findMany({ where: { companyId: 1, salary: { gt: 0 } }, take: 1 });
    ok(emps.length > 0, 'found an employee with salary');
    empId = emps[0].id;

    // 2) EMI preview (flat 12% / 10 months on 100000)
    const prev = await (await fetch(`${BASE}/loans/preview`, { method: 'POST', headers: H(token), body: JSON.stringify({ principalAmount: 100000, interestType: 'Flat', interestRate: 12, tenureMonths: 10 }) })).json();
    ok(prev.totalInterest === 10000, `flat interest = 10000 (got ${prev.totalInterest})`);
    ok(prev.totalPayable === 110000, `total payable = 110000 (got ${prev.totalPayable})`);
    ok(prev.emiAmount === 11000, `EMI = 11000 (got ${prev.emiAmount})`);
    ok((prev.schedule || []).length === 10, 'schedule has 10 rows');

    // 3) Create + submit
    const created = await (await fetch(`${BASE}/loans`, { method: 'POST', headers: H(token), body: JSON.stringify({
      employeeId: empId, loanTypeName: 'Personal Loan', principalAmount: 100000, interestType: 'Flat', interestRate: 12,
      tenureMonths: 10, deductionStartMonth: TEST_MONTH, deductionStartYear: TEST_YEAR, submit: true,
    }) })).json();
    loanId = created.id; emiAmount = created.emiAmount;
    ok(created.status === 'Pending Approval', `created & submitted (status ${created.status})`);
    ok(created.emiAmount === 11000, `stored EMI = 11000 (got ${created.emiAmount})`);

    // reject-before-approve guard
    const badDisburse = await fetch(`${BASE}/loans/${loanId}/status`, { method: 'POST', headers: H(token), body: JSON.stringify({ action: 'disburse' }) });
    ok(badDisburse.status === 409, 'cannot disburse a pending loan (409)');

    // 4) Approve → generates schedule
    const appr = await (await fetch(`${BASE}/loans/${loanId}/status`, { method: 'POST', headers: H(token), body: JSON.stringify({ action: 'approve' }) })).json();
    ok(appr.status === 'Approved', 'approved');
    const insts = await prisma.loanInstallment.findMany({ where: { loanId } });
    ok(insts.length === 10, `10 installments generated (got ${insts.length})`);
    ok(insts.every((i) => i.status === 'Pending'), 'all installments Pending');
    const schedSum = insts.reduce((s, i) => s + i.principalComponent, 0);
    ok(schedSum === 100000, `principal components sum to 100000 (got ${schedSum})`);

    // 5) Disburse
    const disb = await (await fetch(`${BASE}/loans/${loanId}/status`, { method: 'POST', headers: H(token), body: JSON.stringify({ action: 'disburse' }) })).json();
    ok(disb.status === 'Disbursed', 'disbursed');

    // ── PAYROLL AUTO-DEDUCTION (the spine) ──────────────────────────────────
    // Create a draft payroll row for the loan's first deduction period.
    const basic = emps[0].salary;
    const payroll = await prisma.payroll.upsert({
      where: { employeeId_month_year_companyId: { employeeId: empId, month: TEST_MONTH, year: TEST_YEAR, companyId: 1 } },
      update: { basicSalary: basic, allowances: 0, bonus: 0, deductions: 2000, loanDeduction: 0, netSalary: basic - 2000 },
      create: { companyId: 1, employeeId: empId, employeeName: emps[0].name, month: TEST_MONTH, year: TEST_YEAR, basicSalary: basic, allowances: 0, bonus: 0, deductions: 2000, netSalary: basic - 2000 },
    });

    const p1 = await applyLoanToPayrollRow(prisma, payroll, 'TEST');
    ok(p1.loanDeduction === 11000, `payroll.loanDeduction = EMI 11000 (got ${p1.loanDeduction})`);
    ok(p1.deductions === 13000, `deductions = 2000 + 11000 (got ${p1.deductions})`);
    ok(p1.netSalary === basic - 13000, `net reduced by EMI (got ${p1.netSalary}, want ${basic - 13000})`);
    const inst1 = await prisma.loanInstallment.findFirst({ where: { loanId, seq: 1 } });
    ok(inst1.status === 'Paid' && inst1.paidByPayrollId === payroll.id, 'installment #1 settled & keyed to payroll');
    const afterRun = await prisma.loan.findUnique({ where: { id: loanId } });
    ok(afterRun.status === 'Running', `loan advanced to Running (got ${afterRun.status})`);

    // Idempotency: re-run same month must NOT double-deduct.
    const p2 = await applyLoanToPayrollRow(prisma, p1, 'TEST');
    ok(p2.loanDeduction === 11000, `idempotent re-run: still 11000 (got ${p2.loanDeduction})`);
    ok(p2.deductions === 13000, `idempotent re-run: deductions still 13000 (got ${p2.deductions})`);
    const paidCount = await prisma.loanInstallment.count({ where: { loanId, status: 'Paid' } });
    ok(paidCount === 1, `still exactly 1 installment paid (got ${paidCount})`);

    // Reversal: un-settle (payroll deleted) reverts installment + status.
    await unsettleForPayroll(prisma, payroll.id);
    const inst1b = await prisma.loanInstallment.findFirst({ where: { loanId, seq: 1 } });
    ok(inst1b.status === 'Pending' && inst1b.paidByPayrollId === null, 'un-settle reverted installment #1');
    const afterRevert = await prisma.loan.findUnique({ where: { id: loanId } });
    ok(afterRevert.status === 'Disbursed', `loan reverted to Disbursed (got ${afterRevert.status})`);

    // 6) Dashboard + report reflect the loan
    const dash = await (await fetch(`${BASE}/loans/dashboard`, { headers: H(token) })).json();
    ok(dash.kpis.totalActiveLoans >= 1, `dashboard active loans >= 1 (got ${dash.kpis.totalActiveLoans})`);
    const rep = await (await fetch(`${BASE}/loans/reports/outstanding`, { headers: H(token) })).json();
    ok(Array.isArray(rep.rows), 'outstanding report returns rows');

    // cleanup: delete test payroll row + loan (force via draft? it's Disbursed → delete installments+loan directly)
    await prisma.payroll.deleteMany({ where: { employeeId: empId, month: TEST_MONTH, year: TEST_YEAR, companyId: 1 } });
    await prisma.loanInstallment.deleteMany({ where: { loanId } });
    await prisma.loanAudit.deleteMany({ where: { loanId } });
    await prisma.loan.delete({ where: { id: loanId } });
    ok(true, 'cleaned up test loan + payroll row');

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  } catch (e) {
    console.error('TEST ERROR:', e.message, e.stack);
    // best-effort cleanup
    if (loanId) { try { await prisma.loanInstallment.deleteMany({ where: { loanId } }); await prisma.loanAudit.deleteMany({ where: { loanId } }); await prisma.loan.delete({ where: { id: loanId } }); } catch {} }
    if (empId) { try { await prisma.payroll.deleteMany({ where: { employeeId: empId, month: TEST_MONTH, year: TEST_YEAR, companyId: 1 } }); } catch {} }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
