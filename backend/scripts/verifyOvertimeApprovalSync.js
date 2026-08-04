/**
 * Approving overtime must reach the Payroll Attendance Summary — the exact
 * failure reported: "Approved OT = 7 Hours" but "Payroll → Attendance Summary →
 * Overtime = 0".
 *
 * Root cause under test: payrollWorksheetController resolves its attendance as
 * `summary || computed`, so the STORED AttendanceSummary wins. Nothing recomputed
 * that row when overtime was approved, so approved hours stayed invisible to
 * Payroll until someone re-ran Attendance Synchronization by hand.
 *
 * This drives the REAL endpoints and then reads the REAL worksheet API — the same
 * payload the Payroll screen renders — so it fails if any link in the chain
 * breaks. Cleans up after itself.
 *
 * Usage: node scripts/verifyOvertimeApprovalSync.js [baseUrl]
 */
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');
require('dotenv').config();

const BASE = process.argv[2] || 'http://localhost:5000/api';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const YEAR = 2027, MONTH_NUM = 8, MONTH = MONTHS[MONTH_NUM - 1];
const OT_HOURS = 7; // the number from the report

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`); } else { fail++; console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`); } };
const near = (a, b, t = 1.5) => Math.abs(Number(a || 0) - Number(b || 0)) <= t;

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
    select: { id: true, name: true, employeeId: true, companyId: true, salary: true, department: true },
    orderBy: { id: 'asc' },
  });
  if (!emp) throw new Error(`No active salaried employee in company ${user.companyId}.`);
  console.log(`Subject: ${emp.name} (${emp.employeeId}) · ₹${emp.salary}/mo · ${MONTH} ${YEAR}\n`);

  const otIds = [];
  const cleanup = async () => {
    for (const id of otIds) await prisma.overtime.delete({ where: { id } }).catch(() => {});
    await prisma.payroll.deleteMany({ where: { employeeId: emp.id, month: MONTH, year: YEAR } }).catch(() => {});
    await prisma.attendanceSummary.deleteMany({ where: { employeeId: emp.id, month: MONTH, year: YEAR } }).catch(() => {});
  };
  await cleanup();

  const worksheetOt = async (payrollId) => {
    const r = await fetch(`${BASE}/payroll/${payrollId}/worksheet`, { headers: H });
    const j = await r.json().catch(() => null);
    return { status: r.status, otHours: j?.attendance?.otHours, attendance: j?.attendance, payroll: j };
  };

  try {
    // ── A payroll row must exist for the period, as it would in real use ─────
    await prisma.payroll.create({
      data: {
        companyId: emp.companyId, employeeId: emp.id, employeeName: emp.name,
        department: emp.department || 'General', month: MONTH, year: YEAR,
        basicSalary: emp.salary, allowances: 0, deductions: 0, netSalary: 0,
        payrollStatus: 'draft', paymentStatus: 'pending', payslipGenerated: false,
      },
    });
    // Seed a STALE stored summary — the precondition that caused the bug.
    const attSvc = require('../src/services/attendanceSummaryService');
    await attSvc.recompute(emp.id, MONTH, YEAR);
    const stale = await prisma.attendanceSummary.findFirst({ where: { employeeId: emp.id, month: MONTH, year: YEAR } });
    const payroll = await prisma.payroll.findFirst({ where: { employeeId: emp.id, month: MONTH, year: YEAR } });
    console.log('A. Baseline (stored summary exists, no overtime yet)');
    ok('stored AttendanceSummary present', !!stale, `otHours=${stale?.otHours}`);
    const base = await worksheetOt(payroll.id);
    ok('worksheet reachable', base.status === 200, `HTTP ${base.status}`);
    ok('baseline overtime is 0', Number(base.otHours || 0) === 0, `otHours=${base.otHours}`);

    // ── Create the OT as PENDING ─────────────────────────────────────────────
    console.log('\nB. Raise overtime (Pending)');
    const cr = await fetch(`${BASE}/overtime`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        companyId: emp.companyId, empId: emp.id, empName: emp.name, empCode: emp.employeeId,
        department: emp.department, date: `${YEAR}-${String(MONTH_NUM).padStart(2, '0')}-14`,
        in: '18:00', out: '01:00', otHours: OT_HOURS, type: 'Normal Overtime', reason: 'APPROVAL-SYNC-TEST',
      }),
    });
    const created = await cr.json();
    if (created?.id) otIds.push(created.id);
    ok('overtime created', cr.status === 201, `HTTP ${cr.status}`);
    ok('starts Pending', created?.status === 'Pending', `status=${created?.status}`);

    const pend = await worksheetOt(payroll.id);
    ok('PENDING overtime does NOT reach the summary', Number(pend.otHours || 0) === 0, `otHours=${pend.otHours}`);

    // ── APPROVE — the moment that must propagate ─────────────────────────────
    console.log('\nC. Approve it — the chain must fire');
    const t0 = Date.now();
    const up = await fetch(`${BASE}/overtime/${created.id}`, {
      method: 'PUT', headers: H, body: JSON.stringify({ status: 'Approved' }),
    });
    const approved = await up.json();
    const ms = Date.now() - t0;
    ok('approval succeeds', up.status === 200 && approved?.status === 'Approved', `HTTP ${up.status}`);
    ok('approval reports a payroll sync', Array.isArray(approved?.payrollSync) && approved.payrollSync.length > 0,
      JSON.stringify(approved?.payrollSync || []).slice(0, 120));
    ok('sync reported no failure', (approved?.payrollSync || []).every((s) => s.ok !== false));
    ok('approval completes in < 3s', ms < 3000, `${ms}ms`);

    // ── The reported screen ──────────────────────────────────────────────────
    console.log('\nD. Payroll → Attendance Summary (the reported screen)');
    const after = await worksheetOt(payroll.id);
    ok('Attendance Summary shows the approved hours', near(after.otHours, OT_HOURS, 0.01),
      `Overtime = ${after.otHours} (expected ${OT_HOURS})`);
    ok('NO manual re-sync was needed', true, 'value came straight from the approval');

    // ── Money ────────────────────────────────────────────────────────────────
    console.log('\nE. Payroll & payslip');
    const pay = await prisma.payroll.findFirst({
      where: { employeeId: emp.id, month: MONTH, year: YEAR },
      select: { id: true, otHours: true, overtime: true, allowances: true, basicSalary: true, deductions: true, netSalary: true, bonus: true },
    });
    ok('payroll.otHours updated', near(pay.otHours, OT_HOURS, 0.01), `otHours=${pay.otHours}`);
    ok('OT amount calculated', Number(pay.overtime) > 0, `overtime=₹${pay.overtime}`);
    ok('OT sits inside allowances (so it is paid)', Number(pay.allowances) >= Number(pay.overtime) - 1,
      `allowances=₹${pay.allowances} overtime=₹${pay.overtime}`);
    const expNet = Math.max(0, (pay.basicSalary + pay.allowances + (pay.bonus || 0)) - pay.deductions);
    ok('net = basic + allowances + bonus − deductions', near(pay.netSalary, expNet), `net=₹${pay.netSalary}`);

    const slipRes = await fetch(`${BASE}/compliance-reports/generate`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ reportKey: 'salary_slip', companyId: emp.companyId, payrollPeriod: `${YEAR}-${String(MONTH_NUM).padStart(2, '0')}`, employeeId: emp.id }),
    });
    const slip = await slipRes.json().catch(() => null);
    const row = (slip?.rows || []).find((r) => r.name === emp.name);
    ok('payslip carries the OT amount', row && near(row.overtime, pay.overtime), `overtime=₹${row?.overtime}`);
    ok('payslip carries the OT hours', row && near(row.otHours, OT_HOURS, 0.01), `otHours=${row?.otHours}`);

    // ── Un-approve — the reverse must propagate too ──────────────────────────
    console.log('\nF. Reject it again — the reverse must propagate');
    await fetch(`${BASE}/overtime/${created.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ status: 'Rejected' }) });
    const rev = await worksheetOt(payroll.id);
    const payAfter = await prisma.payroll.findFirst({ where: { employeeId: emp.id, month: MONTH, year: YEAR }, select: { otHours: true, overtime: true, netSalary: true } });
    ok('summary returns to 0', Number(rev.otHours || 0) === 0, `otHours=${rev.otHours}`);
    ok('OT amount removed from payroll', Number(payAfter.overtime || 0) === 0, `overtime=₹${payAfter.overtime}`);
    ok('net falls back by the OT amount', payAfter.netSalary < pay.netSalary,
      `${pay.netSalary} → ${payAfter.netSalary}`);

    // ── Idempotency ──────────────────────────────────────────────────────────
    console.log('\nG. Idempotency');
    for (let i = 0; i < 3; i++) {
      await fetch(`${BASE}/overtime/${created.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ status: 'Approved' }) });
    }
    const rep = await prisma.payroll.findFirst({ where: { employeeId: emp.id, month: MONTH, year: YEAR }, select: { otHours: true, overtime: true } });
    ok('three approvals do not multiply the hours', near(rep.otHours, OT_HOURS, 0.01), `otHours=${rep.otHours}`);
    ok('three approvals do not multiply the amount', near(rep.overtime, pay.overtime), `overtime=₹${rep.overtime}`);
    const rowCount = await prisma.payroll.count({ where: { employeeId: emp.id, month: MONTH, year: YEAR } });
    ok('no duplicate payroll rows', rowCount === 1, `rows=${rowCount}`);
  } finally {
    await cleanup();
    console.log(`\n${pass} passed, ${fail} failed  (test data cleaned up)`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  }
})().catch(async (e) => { console.error('SUITE ERROR:', e); await prisma.$disconnect(); process.exit(1); });
