/* Smoke test: dedicated Salary Advance flow (create → list w/ derived → approve
 * → purpose persisted → payroll-ready schedule). Self-cleaning.
 *   node scripts/test-salary-advance-smoke.js
 */
const prisma = require('../src/config/prisma');
const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

(async () => {
  let advId, oneTimeId;
  try {
    const token = (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'om@gmail.com', password: 'Om@12345' }) })).json()).token;
    ok(!!token, 'login as Company Head');

    const emps = await prisma.employee.findMany({ where: { companyId: 1, salary: { gt: 0 } }, take: 1 });
    const empId = emps[0].id;
    const now = new Date();

    // Find the seeded Salary Advance type
    const types = await (await fetch(`${BASE}/loans/types`, { headers: H(token) })).json();
    const advType = types.find((t) => /salary advance/i.test(t.name));
    ok(!!advType, `Salary Advance loan type seeded (id ${advType?.id})`);

    // ── EMI advance (3 installments) ──
    const adv = await (await fetch(`${BASE}/loans`, {
      method: 'POST', headers: H(token),
      body: JSON.stringify({
        employeeId: empId, loanTypeId: advType.id, loanTypeName: advType.name,
        principalAmount: 30000, tenureMonths: 3, interestType: 'None', interestRate: 0,
        deductionStartMonth: MONTHS[now.getMonth()], deductionStartYear: now.getFullYear(),
        purpose: 'Medical emergency', approvalAuthority: 'Finance Head', remarks: 'Smoke test EMI advance',
        submit: true,
      }),
    })).json();
    advId = adv.id;
    ok(!!advId, `created EMI salary advance ${adv.loanNumber}`);
    ok(adv.interestType === 'None' && adv.totalInterest === 0, 'zero-interest advance (EMI = amount / months)');
    ok(adv.emiAmount === 10000, `monthly recovery = 10000 (got ${adv.emiAmount})`);
    ok(adv.purpose === 'Medical emergency', 'purpose (Reason) persisted');
    ok(adv.status === 'Pending Approval', 'submitted → Pending Approval');

    // ── One-Time advance ──
    const one = await (await fetch(`${BASE}/loans`, {
      method: 'POST', headers: H(token),
      body: JSON.stringify({
        employeeId: empId, loanTypeId: advType.id, loanTypeName: advType.name,
        principalAmount: 15000, tenureMonths: 1, interestType: 'None', interestRate: 0,
        deductionStartMonth: MONTHS[now.getMonth()], deductionStartYear: now.getFullYear(),
        purpose: 'Travel', submit: true,
      }),
    })).json();
    oneTimeId = one.id;
    ok(one.tenureMonths === 1 && one.emiAmount === 15000, 'one-time advance recovers full amount in one deduction');

    // ── List carries derived ledger figures ──
    const list = await (await fetch(`${BASE}/loans?status=Pending Approval&pageSize=200`, { headers: H(token) })).json();
    const row = (list.loans || []).find((l) => l.id === advId);
    ok(!!row && row.derived, 'list response includes derived ledger figures');
    ok(row.derived.outstandingPrincipal === 30000 && row.derived.paidPrincipal === 0, 'derived: recovered 0 / remaining 30000 before approval');

    // ── Approve → schedule generated (payroll-ready) ──
    await fetch(`${BASE}/loans/${advId}/status`, { method: 'POST', headers: H(token), body: JSON.stringify({ action: 'approve' }) });
    const full = await (await fetch(`${BASE}/loans/${advId}`, { headers: H(token) })).json();
    ok((full.installments || []).length === 3, `approval generated 3 recovery installments (got ${full.installments?.length})`);
    const sum = (full.installments || []).reduce((s, i) => s + i.emiAmount, 0);
    ok(sum === 30000, `installments sum exactly to principal (${sum})`);
    ok(full.installments.every((i) => i.dueDate), 'each installment carries a due date (reminder-ready)');
    ok(full.status === 'Approved', 'advance is Approved and ready for payroll recovery');

    // cleanup
    await prisma.loanInstallment.deleteMany({ where: { loanId: { in: [advId, oneTimeId] } } });
    await prisma.loanAudit.deleteMany({ where: { loanId: { in: [advId, oneTimeId] } } });
    await prisma.loan.deleteMany({ where: { id: { in: [advId, oneTimeId] } } });
    ok(true, 'cleaned up test records');

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  } catch (e) {
    console.error('TEST ERROR:', e.message, e.stack);
    try { await prisma.loanInstallment.deleteMany({ where: { loanId: { in: [advId, oneTimeId].filter(Boolean) } } }); } catch {}
    try { await prisma.loan.deleteMany({ where: { id: { in: [advId, oneTimeId].filter(Boolean) } } }); } catch {}
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
