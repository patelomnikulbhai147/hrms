/**
 * Controlled end-to-end repro of the Overtime → Payroll pipeline.
 *
 * Creates an approved OT record for ONE employee in a scratch period, runs the
 * real HTTP endpoints the UI calls, and prints what actually landed in payroll.
 * Cleans up after itself.
 *
 * Usage: node scripts/reproOvertimeToPayroll.js [baseUrl]
 */
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');
require('dotenv').config();

const BASE = process.argv[2] || 'http://localhost:5000/api';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// A period far enough out that no real payroll exists for it.
const YEAR = 2027, MONTH_NUM = 3, MONTH = MONTHS[MONTH_NUM - 1];

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

(async () => {
  // A Company Head of a real tenant — NOT a Super Admin, who is deliberately
  // blocked from tenant HR data without an audited Support Session.
  const admin = await prisma.user.findFirst({
    where: { role: 'Company Head', companyId: { not: null } },
    select: { id: true, email: true, role: true, companyId: true },
  });
  if (!admin) throw new Error('No Company Head user to authenticate as.');
  const token = jwt.sign({ id: admin.id, role: admin.role, companyId: admin.companyId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  console.log(`(authenticated as ${admin.role} ${admin.email}, company ${admin.companyId})`);

  // Pick an active employee with a real salary IN THAT COMPANY.
  const emp = await prisma.employee.findFirst({
    where: { salary: { gt: 0 }, status: 'Active', companyId: admin.companyId },
    select: { id: true, name: true, employeeId: true, companyId: true, branchId: true, salary: true, department: true },
    orderBy: { id: 'asc' },
  });
  if (!emp) throw new Error(`No active salaried employee in company ${admin.companyId}.`);
  const company = await prisma.company.findUnique({ where: { id: emp.companyId }, select: { overtimeRate: true, basicPercent: true, name: true } });

  console.log('=== SUBJECT ===');
  console.log(`   ${emp.name} (${emp.employeeId})  emp#${emp.id}  company=${company?.name}`);
  console.log(`   monthly salary = ${money(emp.salary)}   company.overtimeRate = ${company?.overtimeRate ?? '(unset → 1.5)'}`);
  console.log(`   period = ${MONTH} ${YEAR}`);

  const created = [];
  const cleanup = async () => {
    for (const id of created) await prisma.overtime.delete({ where: { id } }).catch(() => {});
    await prisma.payroll.deleteMany({ where: { employeeId: emp.id, month: MONTH, year: YEAR } }).catch(() => {});
    await prisma.attendanceSummary.deleteMany({ where: { employeeId: emp.id, month: MONTH, year: YEAR } }).catch(() => {});
    await prisma.attendance.deleteMany({ where: { employeeId: emp.id, date: { startsWith: `${YEAR}-${String(MONTH_NUM).padStart(2, '0')}` } } }).catch(() => {});
  };
  await cleanup(); // start from a known-clean slate

  try {
    // ── 1. Create an APPROVED overtime record: 10 hours ───────────────────────
    const OT_HOURS = 10;
    const otDate = `${YEAR}-${String(MONTH_NUM).padStart(2, '0')}-10`;
    const otRow = await prisma.overtime.create({
      data: {
        companyId: emp.companyId, employeeId: emp.id, employeeName: emp.name,
        employeeCode: emp.employeeId, department: emp.department, date: otDate,
        inTime: '18:00', outTime: '04:00', otHours: OT_HOURS,
        type: 'Normal Overtime', status: 'Approved', reason: 'REPRO-SCRIPT',
      },
    });
    created.push(otRow.id);
    console.log(`\n=== 1. OT RECORD CREATED ===\n   ${OT_HOURS}h on ${otDate}, status=Approved`);

    // Expected OT amount by the documented formula.
    const dim = new Date(YEAR, MONTH_NUM, 0).getDate();
    const rate = company?.overtimeRate || 1.5;
    console.log(`\n=== EXPECTED (formula) ===`);
    console.log(`   hourlyRate = salary / (days × 8)`);
    console.log(`   OT amount  = ${OT_HOURS}h × hourly × ${rate}`);

    // ── 2. Preview via syncPayroll dry-run (what the UI shows before pushing) ──
    const dry = await fetch(`${BASE}/attendance/sync-payroll`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ companyId: emp.companyId, month: MONTH_NUM, year: YEAR, dryRun: true }),
    });
    const dryJson = await dry.json();
    const mine = (dryJson.rows || []).find((r) => r.employeeId === emp.id);
    console.log(`\n=== 2. SYNC PREVIEW (dry run) — HTTP ${dry.status} ===`);
    if (mine) {
      console.log(`   otHours  = ${mine.otHours}`);
      console.log(`   otAmount = ${money(mine.otAmount)}   <-- the UI shows this`);
    } else console.log('   employee not in preview rows:', dryJson.error || `${(dryJson.rows || []).length} rows`);

    // ── 3. Push to Payroll Engine — the exact call the button makes ───────────
    const pushRows = [{
      employeeId: emp.id, employeeCode: emp.employeeId, employeeName: emp.name,
      department: emp.department, monthlySalary: emp.salary,
      workingDays: mine?.daysInMonth ?? dim, present: mine?.present ?? 0,
      paidLeave: 0, unpaidLeave: 0, halfDay: 0,
      otHours: mine?.otHours ?? OT_HOURS,
      weeklyOff: mine?.weeklyOff ?? 0, holiday: mine?.holiday ?? 0,
      payableDays: mine?.payableDays ?? 0,
      dailySalary: Math.round((emp.salary || 0) / dim),
      payableSalary: Math.round(((emp.salary || 0) / dim) * (mine?.payableDays ?? 0)),
      attendanceStatus: 'Ready',
    }];
    const push = await fetch(`${BASE}/attendance/push-to-payroll`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ companyId: emp.companyId, month: MONTH, year: YEAR, rows: pushRows, replace: true }),
    });
    const pushJson = await push.json();
    console.log(`\n=== 3. PUSH TO PAYROLL ENGINE — HTTP ${push.status} ===`);
    console.log(`   ${JSON.stringify(pushJson).slice(0, 200)}`);

    // ── 4. What actually landed in the payroll table ──────────────────────────
    const pay = await prisma.payroll.findFirst({
      where: { employeeId: emp.id, month: MONTH, year: YEAR },
      select: { id: true, basicSalary: true, allowances: true, deductions: true, overtime: true, otHours: true, netSalary: true, attendanceSource: true, notes: true },
    });
    console.log(`\n=== 4. PAYROLL ROW AFTER PUSH ===`);
    if (!pay) console.log('   NO PAYROLL ROW WRITTEN');
    else {
      console.log(`   otHours          = ${pay.otHours}`);
      console.log(`   overtime AMOUNT  = ${money(pay.overtime)}`);
      console.log(`   basicSalary      = ${money(pay.basicSalary)}`);
      console.log(`   allowances       = ${money(pay.allowances)}`);
      console.log(`   deductions       = ${money(pay.deductions)}`);
      console.log(`   netSalary        = ${money(pay.netSalary)}`);
      console.log(`   attendanceSource = ${pay.attendanceSource}`);
      const otInNet = (pay.overtime || 0) > 0 && (pay.allowances || 0) >= (pay.overtime || 0) - 1;
      console.log(`\n   VERDICT:`);
      console.log(`      OT hours reached payroll : ${(pay.otHours || 0) > 0 ? 'YES' : 'NO'}`);
      console.log(`      OT amount calculated     : ${(pay.overtime || 0) > 0 ? 'YES' : 'NO  <-- BUG'}`);
      console.log(`      OT included in net pay   : ${otInNet ? 'YES' : 'NO  <-- BUG'}`);
    }
  } finally {
    await cleanup();
    console.log('\n(cleaned up: OT, payroll, summary and attendance rows for the scratch period)');
    await prisma.$disconnect();
  }
})().catch(async (e) => { console.error('REPRO FAILED:', e); await prisma.$disconnect(); process.exit(1); });
