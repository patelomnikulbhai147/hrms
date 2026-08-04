/**
 * END-TO-END — GROUPED OVERTIME MODULE + PAYROLL INTEGRATION
 *
 * Builds the exact dataset from the brief, on a scratch employee:
 *
 *   26 Mar   3h   Pending     ← must never be paid
 *   21 Apr   2h   Approved
 *   03 May   7h   Approved
 *   06 May   1h   Approved
 *   07 Jun   3h   Approved
 *   ───────────────────────────
 *   Total 16h · Approved 13h · Pending 3h · 5 records, 4 months
 *
 * Then proves, through the REAL HTTP API and against the REAL database:
 *   • the employee appears exactly ONCE in the grouped view
 *   • expanding shows all 5 original records — none merged, renamed or deleted
 *   • Total / Approved / Pending / Amount / Records / Last OT are all correct
 *   • a SECOND employee stays a separate row with its own totals
 *   • payroll is fed from the Overtime table, not from the grouped totals
 *   • the March pending 3h reaches payroll as ZERO
 *   • Push to Payroll is idempotent — running it twice changes nothing
 *   • attendance summary, payroll, worksheet, payslip and register all agree
 *
 * Usage: node scripts/e2eOvertimeGrouped.js [baseUrl]
 */
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');
require('dotenv').config();

const BASE = process.argv[2] || 'http://localhost:5000/api';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// A PAST year — far enough back that nothing real collides, and never a future
// period (the future-attendance policy would refuse it).
const YEAR = 2019;
const SALARY = 30000;

// The brief's five records, verbatim.
const RECORDS = [
  { date: `${YEAR}-03-26`, in: '18:00', out: '21:00', hours: 3, status: 'Pending',  type: 'Weekend Overtime' },
  { date: `${YEAR}-04-21`, in: '18:00', out: '20:00', hours: 2, status: 'Approved', type: 'Normal Overtime' },
  { date: `${YEAR}-05-03`, in: '15:00', out: '22:00', hours: 7, status: 'Approved', type: 'Normal Overtime' },
  { date: `${YEAR}-05-06`, in: '18:00', out: '19:00', hours: 1, status: 'Approved', type: 'Normal Overtime' },
  { date: `${YEAR}-06-07`, in: '18:00', out: '21:00', hours: 3, status: 'Approved', type: 'Normal Overtime' },
];
const TOTAL_HOURS = RECORDS.reduce((s, r) => s + r.hours, 0);                                    // 16
const APPROVED_HOURS = RECORDS.filter(r => r.status === 'Approved').reduce((s, r) => s + r.hours, 0); // 13
const PENDING_HOURS = TOTAL_HOURS - APPROVED_HOURS;                                              // 3
const LAST_DATE = RECORDS.map(r => r.date).sort().pop();

// Approved hours per month — what payroll must hold, month by month.
const APPROVED_BY_MONTH = RECORDS.reduce((acc, r) => {
  if (r.status !== 'Approved') return acc;
  const m = MONTHS[Number(r.date.slice(5, 7)) - 1];
  acc[m] = (acc[m] || 0) + r.hours;
  return acc;
}, {});
// March carries pending-only overtime, so payroll for March must be exactly 0.
const ALL_MONTHS = [...new Set(RECORDS.map(r => MONTHS[Number(r.date.slice(5, 7)) - 1]))];

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
const monthNum = (m) => MONTHS.indexOf(m) + 1;

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
    where: { id: COMPANY }, select: { name: true, overtimeRate: true },
  });
  const branch = await prisma.branch.findFirst({ where: { companyId: COMPANY }, select: { id: true, branchName: true } });

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  GROUPED OVERTIME MODULE + PAYROLL INTEGRATION                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`API            : ${BASE}`);
  console.log(`Company        : ${company?.name} (id ${COMPANY})`);
  console.log(`Branch         : ${branch?.branchName || '—'}`);
  console.log(`Salary         : ${inr(SALARY)}/month · multiplier ${company?.overtimeRate ?? 1.5}x`);
  console.log(`Dataset        : ${RECORDS.length} records, ${TOTAL_HOURS}h total = ${APPROVED_HOURS}h approved + ${PENDING_HOURS}h pending`);
  console.log(`Approved/month : ${JSON.stringify(APPROVED_BY_MONTH)}\n`);

  let emp = null, emp2 = null;
  const cleanup = async () => {
    for (const e of [emp, emp2].filter(Boolean)) {
      await prisma.overtime.deleteMany({ where: { employeeId: e.id } }).catch(() => {});
      await prisma.attendanceSummary.deleteMany({ where: { employeeId: e.id } }).catch(() => {});
      await prisma.payroll.deleteMany({ where: { employeeId: e.id } }).catch(() => {});
      await prisma.employee.delete({ where: { id: e.id } }).catch(() => {});
    }
  };
  const mkEmployee = (label) => prisma.employee.create({
    data: {
      companyId: COMPANY, branchId: branch?.id ?? null,
      employeeId: `PM-QA-${Date.now().toString().slice(-5)}${label}`,
      name: `Paresh Patel (E2E ${label})`, email: `e2e.otg.${label}.${Date.now()}@qa.local`,
      department: 'Sales', designation: 'QA Subject',
      salary: SALARY, status: 'Active',
      joinDate: new Date(`${YEAR}-01-01T00:00:00Z`),
      branchLocation: branch?.branchName || 'Ahmedabad Head Office',
    },
  });
  const fetchSummary = async () => {
    const r = await fetch(`${BASE}/overtime/summary?companyId=${COMPANY}`, { headers: H });
    const j = await r.json();
    return { http: r.status, body: j, mine: (j.employees || []).filter((g) => g.employeeId === emp.id) };
  };

  try {
    // ── STAGE 1 — the dataset, created through the real API ─────────────────
    emp = await mkEmployee('A');
    emp2 = await mkEmployee('B');
    trace('setup', `employees #${emp.id} (${emp.employeeId}) and #${emp2.id} (${emp2.employeeId}) created`);

    const created = [];
    for (const r of RECORDS) {
      const res = await fetch(`${BASE}/overtime`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          companyId: COMPANY, empId: emp.id, empName: emp.name, empCode: emp.employeeId,
          department: emp.department, branch: emp.branchLocation,
          date: r.date, in: r.in, out: r.out, otHours: r.hours,
          type: r.type, status: r.status, reason: 'E2E grouped-module fixture',
        }),
      });
      const j = await res.json();
      created.push({ ...r, id: j.id, http: res.status });
      trace('POST /overtime', `${r.date} ${r.hours}h ${r.status} → HTTP ${res.status} id=${j.id}`);
    }
    // A second employee, so grouping has something to keep apart.
    await fetch(`${BASE}/overtime`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        companyId: COMPANY, empId: emp2.id, empName: emp2.name, empCode: emp2.employeeId,
        department: emp2.department, branch: emp2.branchLocation,
        date: `${YEAR}-05-10`, in: '18:00', out: '22:00', otHours: 4,
        type: 'Normal Overtime', status: 'Approved', reason: 'E2E second employee',
      }),
    });

    const dbRows = await prisma.overtime.findMany({
      where: { employeeId: emp.id }, orderBy: { date: 'asc' },
      select: { id: true, date: true, otHours: true, status: true },
    });
    stage('Five individual OT records stored (one row per entry)',
      dbRows.length === RECORDS.length && created.every((c) => c.http === 201),
      dbRows.map((r) => `${r.date}:${r.otHours}h:${r.status}`).join(' | '));

    // ── STAGE 2 — one row per employee ──────────────────────────────────────
    let sum = await fetchSummary();
    trace('GET /overtime/summary', `HTTP ${sum.http}; ${(sum.body.employees || []).length} employee row(s) in scope`);
    stage('Employee appears exactly ONCE in the grouped view',
      sum.http === 200 && sum.mine.length === 1,
      `${sum.mine.length} row(s) for employee #${emp.id} across ${RECORDS.length} records`);

    const g = sum.mine[0] || {};
    const otherRow = (sum.body.employees || []).find((x) => x.employeeId === emp2.id);
    stage('A second employee is a SEPARATE row with its own totals',
      !!otherRow && near(otherRow.totalHours, 4, 0.01) && near(g.totalHours, TOTAL_HOURS, 0.01),
      `employee B total=${otherRow?.totalHours}h (expected 4h); employee A total=${g.totalHours}h (expected ${TOTAL_HOURS}h)`);

    // ── STAGE 3 — the grouped figures ───────────────────────────────────────
    trace('grouped row', `total=${g.totalHours}h approved=${g.approvedHours}h pending=${g.pendingHours}h records=${g.records} last=${g.lastDate} amount=${inr(g.otAmount)}`);
    stage('Total / Approved / Pending hours are correct',
      near(g.totalHours, TOTAL_HOURS, 0.01) && near(g.approvedHours, APPROVED_HOURS, 0.01) && near(g.pendingHours, PENDING_HOURS, 0.01),
      `total ${g.totalHours}=${TOTAL_HOURS}, approved ${g.approvedHours}=${APPROVED_HOURS}, pending ${g.pendingHours}=${PENDING_HOURS}`);

    stage('Record count, identity columns and Last OT are correct',
      g.records === RECORDS.length && g.lastDate === LAST_DATE
        && g.employeeCode === emp.employeeId && g.department === emp.department && g.branch === emp.branchLocation,
      `records=${g.records}, last=${g.lastDate} (expected ${LAST_DATE}), code=${g.employeeCode}, dept=${g.department}, branch=${g.branch}`);

    // ── STAGE 4 — expansion shows every original record ─────────────────────
    const entryIds = (g.entries || []).map((e) => e.id).sort((a, b) => a - b);
    const dbIds = dbRows.map((r) => r.id).sort((a, b) => a - b);
    const entriesMatch = JSON.stringify(entryIds) === JSON.stringify(dbIds)
      && (g.entries || []).every((e) => {
        const db = dbRows.find((r) => r.id === e.id);
        return db && near(e.otHours, db.otHours, 0.01) && e.status === db.status;
      });
    stage('Expanding the row returns ALL individual records, unmodified',
      (g.entries || []).length === RECORDS.length && entriesMatch,
      `${(g.entries || []).length} entries; ids match the database and hours/status are unchanged`);

    // ── STAGE 5 — grouping is a VIEW: nothing merged or deleted ─────────────
    const afterView = await prisma.overtime.findMany({
      where: { employeeId: emp.id }, orderBy: { date: 'asc' },
      select: { id: true, date: true, otHours: true, status: true },
    });
    stage('Grouping never merges or deletes the underlying records',
      JSON.stringify(afterView) === JSON.stringify(dbRows),
      `${afterView.length} rows in the database, byte-identical to before the grouped read`);

    // ── STAGE 6 — the OT amount uses the shared engine formula ──────────────
    const otPay = require('../src/utils/overtimePay');
    const policySvc = require('../src/services/deductionPolicyService');
    const policy = await policySvc.resolveEffectivePolicy({ companyId: COMPANY, branchId: branch?.id ?? null }).catch(() => null);
    const mult = otPay.resolveOvertimeMultiplier(policy, company);
    let expectedAmount = 0;
    for (const [m, hrs] of Object.entries(APPROVED_BY_MONTH)) {
      const snap = await prisma.attendanceSummary.findFirst({
        where: { employeeId: emp.id, month: m, year: YEAR }, select: { workingDays: true },
      });
      let wd = Number(snap?.workingDays) || 0;
      if (!(wd > 0)) {
        const mi = MONTHS.indexOf(m), days = new Date(YEAR, mi + 1, 0).getDate();
        let sundays = 0; for (let d = 1; d <= days; d++) if (new Date(YEAR, mi, d).getDay() === 0) sundays++;
        wd = days - sundays;
      }
      const amt = otPay.computeOvertimeAmount({ otHours: hrs, monthlyGross: SALARY, workingDays: wd, multiplier: mult });
      trace('formula', `${m}: ${hrs}h × (${inr(SALARY)} / (${wd}d × 8)) × ${mult} = ${inr(amt)}`);
      expectedAmount += amt;
    }
    stage('OT Amount = approved hours × hourly rate × multiplier (shared formula)',
      near(g.otAmount, expectedAmount, 2),
      `grouped ${inr(g.otAmount)} vs engine formula ${inr(expectedAmount)} — pending hours excluded`);

    // ── STAGE 7 — payroll rows for every month the dataset touches ──────────
    for (const m of ALL_MONTHS) {
      const mn = monthNum(m);
      const days = new Date(YEAR, mn, 0).getDate();
      const res = await fetch(`${BASE}/attendance/push-to-payroll`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          companyId: COMPANY, month: m, year: YEAR, replace: true,
          rows: [{
            employeeId: emp.id, employeeCode: emp.employeeId, employeeName: emp.name,
            department: emp.department, monthlySalary: SALARY,
            workingDays: days, present: 0, paidLeave: 0, unpaidLeave: 0, halfDay: 0,
            otHours: 0, weeklyOff: 0, holiday: 0, payableDays: 0,
            dailySalary: Math.round(SALARY / days), payableSalary: 0, attendanceStatus: 'Ready',
          }],
        }),
      });
      const j = await res.json().catch(() => null);
      trace('POST /attendance/push-to-payroll', `${m} ${YEAR} → HTTP ${res.status}, computed=${j?.computed}, otHoursTotal=${j?.otHoursTotal}`);
    }
    const payRows = await prisma.payroll.findMany({
      where: { employeeId: emp.id, year: YEAR },
      select: { id: true, month: true, otHours: true, overtime: true, allowances: true, deductions: true, basicSalary: true, netSalary: true, bonus: true },
    });
    stage('A payroll row exists for every month in the dataset',
      payRows.length === ALL_MONTHS.length,
      payRows.map((p) => `${p.month}: ${p.otHours}h ${inr(p.overtime)}`).join(' | '));

    // ── STAGE 8 — payroll holds the APPROVED hours, month by month ──────────
    const perMonthOk = ALL_MONTHS.every((m) => {
      const p = payRows.find((r) => r.month === m);
      return p && near(p.otHours, APPROVED_BY_MONTH[m] || 0, 0.01);
    });
    stage('Payroll carries the approved hours for each month',
      perMonthOk,
      ALL_MONTHS.map((m) => `${m}: payroll ${payRows.find((r) => r.month === m)?.otHours ?? '—'}h vs approved ${APPROVED_BY_MONTH[m] || 0}h`).join(' | '));

    // ── STAGE 9 — pending overtime is never paid ────────────────────────────
    const march = payRows.find((p) => p.month === 'March');
    stage('PENDING overtime reaches payroll as ZERO (never paid)',
      march && near(march.otHours, 0, 0.01) && near(march.overtime, 0, 0.01),
      `March holds ${PENDING_HOURS}h pending → payroll otHours=${march?.otHours}, amount=${inr(march?.overtime)}`);

    // ── STAGE 10 — the money, and where it sits ─────────────────────────────
    const payTotalOt = payRows.reduce((s, p) => s + Number(p.otHours || 0), 0);
    const payTotalAmt = payRows.reduce((s, p) => s + Number(p.overtime || 0), 0);
    const earningsOk = payRows.every((p) => Number(p.allowances || 0) >= Number(p.overtime || 0) - 1);
    const netOk = payRows.every((p) => near(p.netSalary, Math.max(0, (p.basicSalary + p.allowances + (p.bonus || 0)) - p.deductions)));
    trace('payroll', `Σ otHours=${payTotalOt} Σ overtime=${inr(payTotalAmt)}`);
    stage('OT sits inside earnings and net = basic + allowances + bonus − deductions',
      near(payTotalOt, APPROVED_HOURS, 0.01) && earningsOk && netOk,
      `Σ payroll otHours=${payTotalOt} (approved ${APPROVED_HOURS}); allowances ⊇ overtime on every row; net reconciles`);

    // ── STAGE 11 — the grouped view now reports Synced ──────────────────────
    sum = await fetchSummary();
    const g2 = sum.mine[0] || {};
    const monthsOk = Object.entries(APPROVED_BY_MONTH).every(([m, hrs]) => {
      const row = (g2.months || []).find((x) => x.month === m && x.year === YEAR);
      return row && near(row.approvedHours, hrs, 0.01) && near(row.payrollOtHours, hrs, 0.01) && row.status === 'Synced';
    });
    trace('reconciliation', (g2.months || []).map((m) => `${m.month}: approved ${m.approvedHours}h / payroll ${m.payrollOtHours}h → ${m.status}`).join(' | '));
    stage('Payroll Status reads Synced, and reconciles month by month',
      g2.payrollStatus === 'Synced' && monthsOk,
      `status=${g2.payrollStatus}; amount now ${inr(g2.otAmount)} (payroll's own figure)`);

    // ── STAGE 12 — Push to Payroll, and its idempotence ────────────────────
    const before = payRows.map((p) => `${p.month}:${p.otHours}:${Math.round(p.overtime || 0)}:${Math.round(p.netSalary || 0)}`).sort().join('|');
    const pushRes = await fetch(`${BASE}/overtime/push-to-payroll`, {
      method: 'POST', headers: H, body: JSON.stringify({ employeeId: emp.id }),
    });
    const push = await pushRes.json();
    trace('POST /overtime/push-to-payroll', `HTTP ${pushRes.status}; approvedHours=${push?.approvedHours} periods=${push?.periodsPushed} failed=${push?.failed} in ${push?.ms}ms`);
    const afterFirst = await prisma.payroll.findMany({
      where: { employeeId: emp.id, year: YEAR },
      select: { month: true, otHours: true, overtime: true, netSalary: true },
    });
    const afterFirstKey = afterFirst.map((p) => `${p.month}:${p.otHours}:${Math.round(p.overtime || 0)}:${Math.round(p.netSalary || 0)}`).sort().join('|');
    stage('Push to Payroll succeeds for every period with overtime',
      pushRes.status === 200 && push?.failed === 0 && near(push?.approvedHours, APPROVED_HOURS, 0.01)
        && push?.periodsPushed === ALL_MONTHS.length,
      `${push?.periodsPushed}/${ALL_MONTHS.length} periods, ${push?.approvedHours}h approved, ${push?.failed} failures`);

    await fetch(`${BASE}/overtime/push-to-payroll`, { method: 'POST', headers: H, body: JSON.stringify({ employeeId: emp.id }) });
    const afterSecond = await prisma.payroll.findMany({
      where: { employeeId: emp.id, year: YEAR },
      select: { month: true, otHours: true, overtime: true, netSalary: true },
    });
    const afterSecondKey = afterSecond.map((p) => `${p.month}:${p.otHours}:${Math.round(p.overtime || 0)}:${Math.round(p.netSalary || 0)}`).sort().join('|');
    stage('Pushing twice changes nothing — no duplicate OT processing',
      before === afterFirstKey && afterFirstKey === afterSecondKey,
      `before=${before}\n         │      │ after×2=${afterSecondKey}`);

    // ── STAGE 13 — Attendance Summary (the screen that showed 0) ────────────
    const snapshots = await prisma.attendanceSummary.findMany({
      where: { employeeId: emp.id, year: YEAR }, select: { month: true, otHours: true },
    });
    const snapOk = Object.entries(APPROVED_BY_MONTH).every(([m, hrs]) =>
      near(snapshots.find((s) => s.month === m)?.otHours, hrs, 0.01));
    const worksheetMonth = 'May';
    const wsPay = payRows.find((p) => p.month === worksheetMonth);
    const wsRes = await fetch(`${BASE}/payroll/${wsPay.id}/worksheet`, { headers: H });
    const ws = await wsRes.json().catch(() => null);
    trace('GET /payroll/:id/worksheet', `${worksheetMonth}: attendance.otHours=${ws?.attendance?.otHours} (approved ${APPROVED_BY_MONTH[worksheetMonth]}h)`);
    stage('Payroll → Attendance Summary shows the approved OT hours, not 0',
      snapOk && wsRes.status === 200 && near(ws?.attendance?.otHours, APPROVED_BY_MONTH[worksheetMonth], 0.01),
      `snapshots ${snapshots.map((s) => `${s.month}:${s.otHours}h`).join(' ')}; worksheet ${worksheetMonth} = ${ws?.attendance?.otHours}h`);

    // ── STAGE 14 — payslip + salary register ───────────────────────────────
    const period = `${YEAR}-05`;
    const slip = await (await fetch(`${BASE}/compliance-reports/generate`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ reportKey: 'salary_slip', companyId: COMPANY, payrollPeriod: period, employeeId: emp.id }),
    })).json().catch(() => null);
    const slipRow = (slip?.rows || []).find((r) => r.name === emp.name);
    const reg = await (await fetch(`${BASE}/compliance-reports/generate`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ reportKey: 'salary_register', companyId: COMPANY, payrollPeriod: period }),
    })).json().catch(() => null);
    const regRow = (reg?.rows || []).find((r) => r.name === emp.name);
    trace('reports', `slip otHours=${slipRow?.otHours} overtime=${inr(slipRow?.overtime)}; register overtime=${inr(regRow?.overtime)}`);
    stage('Payslip and Salary Register carry Overtime as its own component',
      slipRow && near(slipRow.otHours, APPROVED_BY_MONTH[worksheetMonth], 0.01) && near(slipRow.overtime, wsPay.overtime)
        && regRow && near(regRow.overtime, wsPay.overtime),
      slipRow ? `slip ${slipRow.otHours}h / ${inr(slipRow.overtime)}; register ${inr(regRow?.overtime)}` : 'employee not in the slip');

    // ── STAGE 15 — one number across every layer ───────────────────────────
    const values = {
      'overtime table (approved)': APPROVED_HOURS,
      'grouped summary approvedHours': Number(g2.approvedHours || 0),
      'attendance_summary Σ otHours': snapshots.reduce((s, x) => s + Number(x.otHours || 0), 0),
      'payroll Σ otHours': afterSecond.reduce((s, x) => s + Number(x.otHours || 0), 0),
    };
    console.log('\n─── approved OT hours as it crosses every layer ───');
    Object.entries(values).forEach(([k, v]) => console.log(`   ${k.padEnd(32)} ${v}`));
    stage('Every layer reports the SAME approved overtime',
      Object.values(values).every((v) => near(v, APPROVED_HOURS, 0.01)),
      `all = ${APPROVED_HOURS}h`);
  } finally {
    await cleanup();
    const passed = results.filter((r) => r.passed).length;
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log(`║  ${String(passed).padStart(2)} / ${String(results.length).padStart(2)} stages passed                                          ║`);
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    results.filter((r) => !r.passed).forEach((r) => console.log(`  FAILED  Stage ${r.n}: ${r.name}\n          ${r.detail}`));
    console.log('\n(scratch employees and all their rows deleted)');
    await prisma.$disconnect();
    process.exit(results.some((r) => !r.passed) ? 1 : 0);
  }
})().catch(async (e) => { console.error('E2E ERROR:', e); await prisma.$disconnect(); process.exit(1); });
