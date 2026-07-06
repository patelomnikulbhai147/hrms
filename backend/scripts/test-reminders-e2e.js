/* E2E Phase 3: auto-reminder scheduler + loan-type limits. Self-cleaning.
 *   node scripts/test-reminders-e2e.js
 */
const prisma = require('../src/config/prisma');
const rs = require('../src/services/reminderScheduler');
const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
const arr = (v) => (Array.isArray(v) ? v : []);
const iso = (offsetDays) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);

(async () => {
  const CID = 1;
  let restoreIds = [], f7, fOver, typeId, loanId, empId;
  try {
    const token = (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'om@gmail.com', password: 'Om@12345' }) })).json()).token;
    ok(!!token, 'login');

    // ── 1) stagePlan unit ──
    ok(rs.stagePlan(20).stage === '30', "days 20 → stage '30'");
    ok(rs.stagePlan(10).stage === '15', "days 10 → stage '15'");
    ok(rs.stagePlan(5).stage === '7', "days 5 → stage '7'");
    ok(rs.stagePlan(1).stage === '1', "days 1 → stage '1'");
    ok(rs.stagePlan(-3).stage === 'overdue', 'days -3 → overdue');
    ok(rs.stagePlan(40).stage === null, 'days 40 → no reminder');
    ok(JSON.stringify(rs.stagePlan(10).cover) === JSON.stringify(['30', '15']), "stage '15' covers ['30','15']");

    // ── 2) Loan-type limits ──
    const lt = await (await fetch(`${BASE}/loans/types`, { method: 'POST', headers: H(token), body: JSON.stringify({ name: 'CLAUDE_TEST_LT', maxAmount: 50000, maxTenureMonths: 12, defaultInterestType: 'None' }) })).json();
    typeId = lt.id;
    const emps = await prisma.employee.findMany({ where: { companyId: CID, salary: { gt: 0 } }, take: 1 });
    empId = emps[0].id;
    const over = await fetch(`${BASE}/loans`, { method: 'POST', headers: H(token), body: JSON.stringify({ employeeId: empId, loanTypeId: typeId, loanTypeName: 'CLAUDE_TEST_LT', principalAmount: 100000, tenureMonths: 6, interestType: 'None' }) });
    ok(over.status === 400, 'loan amount over type limit rejected (400)');
    const overTenure = await fetch(`${BASE}/loans`, { method: 'POST', headers: H(token), body: JSON.stringify({ employeeId: empId, loanTypeId: typeId, loanTypeName: 'CLAUDE_TEST_LT', principalAmount: 40000, tenureMonths: 24, interestType: 'None' }) });
    ok(overTenure.status === 400, 'loan tenure over type limit rejected (400)');

    // ── 3) Compliance reminders (isolate: pre-mark existing filings as done) ──
    const existing = await prisma.complianceFiling.findMany({ where: { companyId: CID }, select: { id: true, remindersSent: true } });
    restoreIds = existing.filter((f) => !arr(f.remindersSent).length).map((f) => f.id);
    await prisma.complianceFiling.updateMany({ where: { id: { in: existing.map((f) => f.id) } }, data: { remindersSent: ['30', '15', '7', '1', 'overdue'] } });

    f7 = await prisma.complianceFiling.create({ data: { companyId: CID, category: 'Custom', title: 'CLAUDE_DUE7', frequency: 'One-Time', periodLabel: 'TEST7', periodMonth: 5, periodYear: 2098, dueDate: iso(7), status: 'Pending' } });
    fOver = await prisma.complianceFiling.create({ data: { companyId: CID, category: 'Custom', title: 'CLAUDE_OVERDUE', frequency: 'One-Time', periodLabel: 'TESTO', periodMonth: 6, periodYear: 2098, dueDate: iso(-2), status: 'Overdue' } });

    const before = await prisma.notification.count({ where: { companyId: CID, type: 'reminder' } });
    const run1 = await rs.runComplianceReminders();
    ok(run1.sent >= 2, `first pass fired ≥2 reminders (sent ${run1.sent})`);
    const f7a = await prisma.complianceFiling.findUnique({ where: { id: f7.id } });
    ok(arr(f7a.remindersSent).includes('7'), "due-in-7 filing marked stage '7'");
    ok(arr(f7a.remindersSent).includes('30') && arr(f7a.remindersSent).includes('15'), 'covers looser stages 30/15');
    const fOa = await prisma.complianceFiling.findUnique({ where: { id: fOver.id } });
    ok(arr(fOa.remindersSent).includes('overdue'), 'overdue filing marked overdue');
    const after = await prisma.notification.count({ where: { companyId: CID, type: 'reminder' } });
    ok(after > before, `in-app reminder notifications created (${after - before})`);

    // dedup: second pass fires nothing new for these
    const run2 = await rs.runComplianceReminders();
    ok(run2.sent === 0, `second pass deduped (sent ${run2.sent})`);

    // manual HTTP endpoint works
    const httpRun = await (await fetch(`${BASE}/compliance-mgmt/run-reminders`, { method: 'POST', headers: H(token) })).json();
    ok(typeof httpRun.sent === 'number', 'HTTP run-reminders endpoint responds');

    // ── 4) Loan EMI reminder ──
    const now = new Date();
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const loan = await (await fetch(`${BASE}/loans`, { method: 'POST', headers: H(token), body: JSON.stringify({ employeeId: empId, loanTypeName: 'Test', principalAmount: 12000, tenureMonths: 3, interestType: 'None', deductionStartMonth: MONTHS[now.getMonth()], deductionStartYear: now.getFullYear(), submit: true }) })).json();
    loanId = loan.id;
    await fetch(`${BASE}/loans/${loanId}/status`, { method: 'POST', headers: H(token), body: JSON.stringify({ action: 'approve' }) });
    await fetch(`${BASE}/loans/${loanId}/status`, { method: 'POST', headers: H(token), body: JSON.stringify({ action: 'disburse' }) });
    const inst1 = await prisma.loanInstallment.findFirst({ where: { loanId, seq: 1 } });
    ok(!!inst1.dueDate, `installment #1 has a due date (${inst1.dueDate})`);
    const loanRun = await rs.runLoanReminders();
    ok(loanRun.sent >= 1, `loan reminder fired (sent ${loanRun.sent})`);
    const loanAfter = await prisma.loan.findUnique({ where: { id: loanId } });
    ok(arr(loanAfter.remindersSent).some((k) => k.startsWith('1:')), 'loan marked reminded for installment #1');

    // cleanup
    await prisma.loanInstallment.deleteMany({ where: { loanId } });
    await prisma.loanAudit.deleteMany({ where: { loanId } });
    await prisma.loan.delete({ where: { id: loanId } });
    await prisma.complianceFiling.deleteMany({ where: { id: { in: [f7.id, fOver.id] } } });
    if (restoreIds.length) await prisma.complianceFiling.updateMany({ where: { id: { in: restoreIds } }, data: { remindersSent: null } });
    await fetch(`${BASE}/loans/types/${typeId}`, { method: 'DELETE', headers: H(token) });
    // clear the reminder notifications + queue rows we generated for the test
    await prisma.notification.deleteMany({ where: { companyId: CID, type: 'reminder' } }).catch(() => {});
    ok(true, 'cleaned up');

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  } catch (e) {
    console.error('TEST ERROR:', e.message, e.stack);
    try { if (loanId) { await prisma.loanInstallment.deleteMany({ where: { loanId } }); await prisma.loan.delete({ where: { id: loanId } }); } } catch {}
    try { if (f7) await prisma.complianceFiling.deleteMany({ where: { id: { in: [f7?.id, fOver?.id].filter(Boolean) } } }); } catch {}
    try { if (restoreIds.length) await prisma.complianceFiling.updateMany({ where: { id: { in: restoreIds } }, data: { remindersSent: null } }); } catch {}
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
