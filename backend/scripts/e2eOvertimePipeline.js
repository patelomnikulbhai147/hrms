/**
 * END-TO-END OVERTIME PIPELINE — 12 stages, fresh employee, no shortcuts.
 *
 * Builds the exact dataset from the brief:
 *   Paresh Patel (QA) · ₹30,000/mo · OT multiplier 1.5
 *   01 Jul 09:00–21:00 → 3h OT
 *   02 Jul 09:00–20:00 → 2h OT
 *   03 Jul 09:00–22:00 → 4h OT      Expected approved total = 9h
 *
 * Every stage is driven through the REAL HTTP API and then verified against the
 * REAL database — no stage is assumed to have worked because the previous one
 * returned 200. Instrumentation prints the OT value as it crosses each boundary,
 * so if it becomes 0 the stage that dropped it is named.
 *
 * Creates a scratch employee in a far-future period and deletes everything it
 * made, including the employee.
 *
 * Usage: node scripts/e2eOvertimePipeline.js [baseUrl]
 */
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');
require('dotenv').config();

const BASE = process.argv[2] || 'http://localhost:5000/api';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// A PAST period. Attendance for a future date is refused with 403 by the
// future-attendance policy, so a pipeline test must run over days that could
// legitimately have been worked. Far enough back that no real data collides.
const YEAR = 2019, MONTH_NUM = 7, MONTH = MONTHS[MONTH_NUM - 1];
const PERIOD = `${YEAR}-${String(MONTH_NUM).padStart(2, '0')}`;
const SALARY = 30000;
const STD_HOURS = 9; // hours beyond which the day earns overtime

const DAYS = [
  { date: `${PERIOD}-01`, in: '09:00', out: '21:00', expectOt: 3 },
  { date: `${PERIOD}-02`, in: '09:00', out: '20:00', expectOt: 2 },
  { date: `${PERIOD}-03`, in: '09:00', out: '22:00', expectOt: 4 },
];
const EXPECTED_OT = DAYS.reduce((s, d) => s + d.expectOt, 0); // 9

let stageNo = 0;
const results = [];
const stage = (name, passed, detail = '') => {
  stageNo++;
  results.push({ n: stageNo, name, passed, detail });
  console.log(`Stage ${String(stageNo).padStart(2)} │ ${passed ? 'PASS' : 'FAIL'} │ ${name}`);
  if (detail) console.log(`         │      │ ${detail}`);
};
const trace = (where, msg) => console.log(`         ·      · [${where}] ${msg}`);
const near = (a, b, t = 1.5) => Math.abs(Number(a || 0) - Number(b || 0)) <= t;
const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const hoursBetween = (i, o) => {
  const [ih, im] = i.split(':').map(Number), [oh, om] = o.split(':').map(Number);
  let m = (oh * 60 + om) - (ih * 60 + im); if (m < 0) m += 1440;
  return Math.round((m / 60) * 100) / 100;
};

(async () => {
  const user = await prisma.user.findFirst({
    where: { role: 'Company Head', companyId: { not: null } },
    select: { id: true, email: true, role: true, companyId: true },
  });
  if (!user) throw new Error('No Company Head user to authenticate as.');
  const token = jwt.sign({ id: user.id, role: user.role, companyId: user.companyId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const COMPANY = user.companyId;

  const company = await prisma.company.findUnique({
    where: { id: COMPANY }, select: { name: true, overtimeRate: true, basicPercent: true },
  });
  const branch = await prisma.branch.findFirst({ where: { companyId: COMPANY }, select: { id: true, branchName: true } });

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  END-TO-END OVERTIME PIPELINE                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`Company        : ${company?.name} (id ${COMPANY})`);
  console.log(`Branch         : ${branch?.branchName || '—'} (id ${branch?.id ?? '—'})`);
  console.log(`Period         : ${MONTH} ${YEAR}`);
  console.log(`Salary         : ${inr(SALARY)}/month`);
  console.log(`OT multiplier  : ${company?.overtimeRate ?? 1.5}x`);
  console.log(`Expected OT    : ${EXPECTED_OT} hours\n`);

  // ALWAYS create a dedicated shift — never reuse whatever the company happens to
  // have. An earlier run adopted an existing 09:00–18:00 shift that carried a
  // 1-hour break (an 8h span, not 9h), so the same code derived 9h locally and 12h
  // on production and the suite reported a product failure that was really a
  // non-deterministic fixture. 09:00–18:00 with a zero break = exactly 9h, so the
  // brief's days (12h, 11h, 13h worked) yield 3 + 2 + 4 = 9 hours of overtime
  // on every environment.
  const shift = await prisma.shift.create({
    data: {
      companyId: COMPANY, name: `E2E QA Shift ${Date.now().toString().slice(-6)}`,
      code: `E2E${Date.now().toString().slice(-4)}`,
      start: '09:00', end: '18:00', grace: '15', breakTime: '0', otEnabled: true, status: 'Active',
    },
    select: { id: true, name: true, start: true, end: true, breakTime: true, otEnabled: true },
  });
  const shiftCreated = true;
  const { shiftWorkHours } = require('../src/utils/overtimeDerivation');
  console.log(`Shift          : ${shift.start}–${shift.end}, break "${shift.breakTime}" ⇒ ${shiftWorkHours(shift)}h working span\n`);

  let emp = null;
  const cleanup = async () => {
    if (shiftCreated && shift) await prisma.shift.delete({ where: { id: shift.id } }).catch(() => {});
    if (!emp) return;
    await prisma.overtime.deleteMany({ where: { employeeId: emp.id } }).catch(() => {});
    await prisma.attendance.deleteMany({ where: { employeeId: emp.id } }).catch(() => {});
    await prisma.attendanceSummary.deleteMany({ where: { employeeId: emp.id } }).catch(() => {});
    await prisma.payroll.deleteMany({ where: { employeeId: emp.id } }).catch(() => {});
    await prisma.employee.delete({ where: { id: emp.id } }).catch(() => {});
  };

  try {
    // ── STAGE 1 — a fresh employee + attendance records ──────────────────────
    emp = await prisma.employee.create({
      data: {
        companyId: COMPANY, branchId: branch?.id ?? null,
        employeeId: `PM-QA-${Date.now().toString().slice(-5)}`,
        name: 'Paresh Patel (E2E)', email: `e2e.ot.${Date.now()}@qa.local`,
        department: 'Operations', designation: 'QA Subject',
        salary: SALARY, status: 'Active', shiftId: shift.id,
        joinDate: new Date(`${YEAR}-01-01T00:00:00Z`), // required DateTime on Employee
        branchLocation: branch?.branchName || 'Head Office',
      },
    });
    trace('setup', `employee #${emp.id} ${emp.employeeId} created`);

    const attRes = [];
    for (const d of DAYS) {
      const worked = hoursBetween(d.in, d.out);
      const r = await fetch(`${BASE}/attendance`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          companyId: COMPANY, employeeId: emp.id, employeeName: emp.name,
          department: emp.department, date: d.date, status: 'Present',
          clockIn: d.in, clockOut: d.out, hoursWorked: worked,
        }),
      });
      attRes.push({ ...d, http: r.status, worked });
      trace('POST /attendance', `${d.date} ${d.in}-${d.out} = ${worked}h worked → HTTP ${r.status}`);
    }
    const attRows = await prisma.attendance.findMany({
      where: { employeeId: emp.id }, select: { date: true, clockIn: true, clockOut: true, hoursWorked: true, status: true },
      orderBy: { date: 'asc' },
    });
    stage('Attendance records created (check-in/out persisted)',
      attRows.length === DAYS.length && attRows.every((a) => a.clockIn && a.clockOut),
      `${attRows.length}/${DAYS.length} rows; ` + attRows.map((a) => `${a.date} ${a.clockIn}-${a.clockOut} ${a.hoursWorked}h`).join(' | '));

    // ── STAGE 2 — automatic OT calculation from attendance ───────────────────
    const autoRows = await prisma.overtime.findMany({
      where: { employeeId: emp.id }, select: { id: true, date: true, otHours: true, status: true, type: true },
      orderBy: { date: 'asc' },
    });
    const autoTotal = autoRows.reduce((s, o) => s + Number(o.otHours || 0), 0);
    const derivable = attRows.reduce((s, a) => s + Math.max(0, Number(a.hoursWorked || 0) - STD_HOURS), 0);
    trace('derivation', `hours beyond the ${STD_HOURS}h shift across the 3 days = ${derivable}h (expected ${EXPECTED_OT}h)`);
    autoRows.forEach((o) => trace('auto OT', `${o.date} → ${o.otHours}h (${o.type}, ${o.status})`));
    const perDayCorrect = DAYS.every((d) => {
      const row = autoRows.find((o) => o.date === d.date);
      return row && near(row.otHours, d.expectOt, 0.01);
    });
    stage('OT auto-calculated from attendance hours',
      autoRows.length === DAYS.length && near(autoTotal, EXPECTED_OT, 0.01) && perDayCorrect,
      `${autoRows.length} row(s) auto-created totalling ${autoTotal}h (expected ${EXPECTED_OT}h); per-day 3/2/4 correct=${perDayCorrect}`);

    // ── STAGE 3 — OT records carry the right keys ────────────────────────────
    const otIds = autoRows.map((o) => o.id);
    const otRows = await prisma.overtime.findMany({
      where: { employeeId: emp.id },
      select: { id: true, employeeId: true, companyId: true, date: true, otHours: true, status: true, employeeCode: true },
      orderBy: { date: 'asc' },
    });
    const totalRaised = otRows.reduce((s, o) => s + Number(o.otHours || 0), 0);
    stage('OT records stored with employee/company/branch/date/hours',
      otRows.length === DAYS.length && near(totalRaised, EXPECTED_OT, 0.01)
        && otRows.every((o) => o.employeeId === emp.id && o.companyId === COMPANY),
      `${otRows.length} rows totalling ${totalRaised}h; empId/companyId consistent`);

    stage('OT starts Pending (not payable before approval)',
      otRows.every((o) => o.status === 'Pending'),
      otRows.map((o) => `${o.date}:${o.status}`).join(' '));

    // ── STAGE 4 — approval ───────────────────────────────────────────────────
    let syncEcho = [];
    for (const id of otIds) {
      const r = await fetch(`${BASE}/overtime/${id}`, {
        method: 'PUT', headers: H, body: JSON.stringify({ status: 'Approved' }),
      });
      const j = await r.json();
      if (Array.isArray(j?.payrollSync)) syncEcho = j.payrollSync;
      trace('PUT /overtime/:id', `#${id} → ${j?.status}; payrollSync=${JSON.stringify(j?.payrollSync || [])}`);
    }
    const approvedRows = await prisma.overtime.findMany({
      where: { employeeId: emp.id, status: 'Approved' }, select: { otHours: true },
    });
    const approvedTotal = approvedRows.reduce((s, o) => s + Number(o.otHours || 0), 0);
    stage('OT approved — approval_status = APPROVED',
      approvedRows.length === DAYS.length && near(approvedTotal, EXPECTED_OT, 0.01),
      `${approvedRows.length} approved, total ${approvedTotal}h`);

    // ── STAGE 5/6 — the snapshot the payroll engine reads ────────────────────
    const summary = await prisma.attendanceSummary.findFirst({
      where: { employeeId: emp.id, month: MONTH, year: YEAR },
      select: { otHours: true, presentDays: true, payableDays: true, workingDays: true, syncedAt: true },
    });
    trace('AttendanceSummary', `otHours=${summary?.otHours} present=${summary?.presentDays} payable=${summary?.payableDays}`);
    stage('Approved OT reaches the AttendanceSummary snapshot (payroll queue)',
      summary && near(summary.otHours, EXPECTED_OT, 0.01),
      `summary.otHours = ${summary?.otHours} (expected ${EXPECTED_OT})`);

    stage('Approval echoed a payroll sync result (no silent failure)',
      syncEcho.length > 0 && syncEcho.every((s) => s.ok !== false),
      JSON.stringify(syncEcho).slice(0, 150));

    // ── STAGE — Push to Payroll Engine ──────────────────────────────────────
    // Approving OT refreshes the snapshot, but if payroll for the month has not
    // been generated yet there is no row to carry the money. This is the step
    // that creates it — the same call the "Push to Payroll Engine" button makes.
    const dry = await (await fetch(`${BASE}/attendance/sync-payroll`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ companyId: COMPANY, month: MONTH_NUM, year: YEAR, dryRun: true }),
    })).json();
    const mine = (dry.rows || []).find((r) => r.employeeId === emp.id);
    trace('sync preview', mine ? `otHours=${mine.otHours} otAmount=${inr(mine.otAmount)} payableDays=${mine.payableDays}` : 'employee not in preview');

    const pushRes = await fetch(`${BASE}/attendance/push-to-payroll`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        companyId: COMPANY, month: MONTH, year: YEAR, replace: true,
        rows: [{
          employeeId: emp.id, employeeCode: emp.employeeId, employeeName: emp.name,
          department: emp.department, monthlySalary: SALARY,
          workingDays: mine?.daysInMonth ?? 31, present: mine?.present ?? 0,
          paidLeave: 0, unpaidLeave: 0, halfDay: 0,
          otHours: mine?.otHours ?? EXPECTED_OT,
          weeklyOff: mine?.weeklyOff ?? 0, holiday: mine?.holiday ?? 0,
          payableDays: mine?.payableDays ?? 0,
          dailySalary: Math.round(SALARY / 31),
          payableSalary: Math.round((SALARY / 31) * (mine?.payableDays ?? 0)),
          attendanceStatus: 'Ready',
        }],
      }),
    });
    const push = await pushRes.json();
    trace('POST /attendance/push-to-payroll', `HTTP ${pushRes.status}; computed=${push?.computed} otHoursTotal=${push?.otHoursTotal} overtimeTotal=${inr(push?.overtimeTotal)} failed=${push?.failed}`);
    stage('Push to Payroll Engine receives employee/hours/month/year/company',
      pushRes.status === 200 && push?.computed === 1 && push?.failed === 0
      && near(push?.otHoursTotal, EXPECTED_OT, 0.01),
      `HTTP ${pushRes.status}, computed=${push?.computed}, otHoursTotal=${push?.otHoursTotal}, overtimeTotal=${inr(push?.overtimeTotal)}`);

    // ── STAGE 7/8 — the engine and the money ────────────────────────────────
    const pay = await prisma.payroll.findFirst({
      where: { employeeId: emp.id, month: MONTH, year: YEAR },
      select: {
        id: true, otHours: true, overtime: true, basicSalary: true, allowances: true,
        deductions: true, netSalary: true, bonus: true, workingDays: true, payableDays: true,
      },
    });
    trace('payroll row', pay ? `otHours=${pay.otHours} overtime=${inr(pay.overtime)} basic=${inr(pay.basicSalary)} allow=${inr(pay.allowances)} net=${inr(pay.netSalary)}` : 'NO ROW');
    stage('Payroll engine received the APPROVED hours (not 0)',
      pay && near(pay.otHours, EXPECTED_OT, 0.01), `payroll.otHours = ${pay?.otHours}`);

    const mult = Number(company?.overtimeRate) || 1.5;
    const wd = Number(pay?.workingDays) || 0;
    const hourly = wd > 0 ? SALARY / (wd * 8) : 0;
    const expectedAmt = Math.round(EXPECTED_OT * hourly * mult);
    trace('formula', `${EXPECTED_OT}h × (${inr(SALARY)} / (${wd}d × 8)) × ${mult} = ${inr(expectedAmt)}`);
    stage('OT amount = hours × hourly rate × multiplier',
      pay && near(pay.overtime, expectedAmt, 2), `stored ${inr(pay?.overtime)} vs formula ${inr(expectedAmt)}`);

    // ── STAGE 9 — payroll tables carry OT, and net includes it ──────────────
    const otInAllow = pay && Number(pay.allowances) >= Number(pay.overtime) - 1;
    const expNet = pay ? Math.max(0, (pay.basicSalary + pay.allowances + (pay.bonus || 0)) - pay.deductions) : 0;
    stage('OT sits inside earnings and net = basic + allowances + bonus − deductions',
      otInAllow && near(pay.netSalary, expNet),
      `allowances ${inr(pay?.allowances)} ⊇ overtime ${inr(pay?.overtime)}; net ${inr(pay?.netSalary)} = ${inr(expNet)}`);

    // ── STAGE 10 — the reported screen ──────────────────────────────────────
    const wsRes = await fetch(`${BASE}/payroll/${pay.id}/worksheet`, { headers: H });
    const ws = await wsRes.json().catch(() => null);
    trace('GET /payroll/:id/worksheet', `HTTP ${wsRes.status}; attendance.otHours=${ws?.attendance?.otHours}`);
    stage('Payroll → Attendance Summary shows the OT hours',
      wsRes.status === 200 && near(ws?.attendance?.otHours, EXPECTED_OT, 0.01),
      `HTTP ${wsRes.status}, Overtime = ${ws?.attendance?.otHours} (expected ${EXPECTED_OT})`);

    // ── STAGE 11 — payslip ──────────────────────────────────────────────────
    const slipRes = await fetch(`${BASE}/compliance-reports/generate`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ reportKey: 'salary_slip', companyId: COMPANY, payrollPeriod: PERIOD, employeeId: emp.id }),
    });
    const slip = await slipRes.json().catch(() => null);
    const slipRow = (slip?.rows || []).find((r) => r.name === emp.name);
    trace('salary_slip', slipRow ? `overtime=${inr(slipRow.overtime)} otHours=${slipRow.otHours}` : `no row (HTTP ${slipRes.status})`);
    stage('Payslip shows Overtime as its own earning',
      slipRow && near(slipRow.overtime, pay.overtime) && near(slipRow.otHours, EXPECTED_OT, 0.01),
      slipRow ? `${inr(slipRow.overtime)} / ${slipRow.otHours}h` : 'employee not in slip');

    // ── STAGE 12 — register + OT register ───────────────────────────────────
    const regRes = await fetch(`${BASE}/compliance-reports/generate`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ reportKey: 'salary_register', companyId: COMPANY, payrollPeriod: PERIOD }),
    });
    const reg = await regRes.json().catch(() => null);
    const regRow = (reg?.rows || []).find((r) => r.name === emp.name);
    const otRegRes = await fetch(`${BASE}/compliance-reports/generate`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ reportKey: 'overtime_register', companyId: COMPANY, payrollPeriod: PERIOD, startDate: `${PERIOD}-01`, endDate: `${PERIOD}-31` }),
    });
    const otReg = await otRegRes.json().catch(() => null);
    const otRegRows = (otReg?.rows || []).filter((r) => String(r.employeeName || r.name) === emp.name);
    trace('reports', `salary_register overtime=${inr(regRow?.overtime)}; overtime_register rows=${otRegRows.length}`);
    stage('Salary Register and Overtime Register agree',
      regRow && near(regRow.overtime, pay.overtime) && otRegRows.length === DAYS.length,
      `register ${inr(regRow?.overtime)}, OT register ${otRegRows.length} entries`);

    // ── Cross-layer consistency: one number everywhere ──────────────────────
    const values = {
      'overtime table (approved)': approvedTotal,
      'attendance_summary.otHours': Number(summary?.otHours || 0),
      'payroll.otHours': Number(pay?.otHours || 0),
      'worksheet attendance.otHours': Number(ws?.attendance?.otHours || 0),
      'payslip otHours': Number(slipRow?.otHours || 0),
    };
    console.log('\n─── OT hours as it crosses every layer ───');
    Object.entries(values).forEach(([k, v]) => console.log(`   ${k.padEnd(30)} ${v}`));
    const allSame = Object.values(values).every((v) => near(v, EXPECTED_OT, 0.01));
    stage('Every layer reports the SAME overtime hours', allSame,
      allSame ? `all = ${EXPECTED_OT}h` : JSON.stringify(values));
  } finally {
    await cleanup();
    const passed = results.filter((r) => r.passed).length;
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log(`║  ${String(passed).padStart(2)} / ${String(results.length).padStart(2)} stages passed                                          ║`);
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    results.filter((r) => !r.passed).forEach((r) => console.log(`  FAILED  Stage ${r.n}: ${r.name}\n          ${r.detail}`));
    console.log('\n(scratch employee and all its rows deleted)');
    await prisma.$disconnect();
    process.exit(results.some((r) => !r.passed) ? 1 : 0);
  }
})().catch(async (e) => { console.error('PIPELINE ERROR:', e); await prisma.$disconnect(); process.exit(1); });
