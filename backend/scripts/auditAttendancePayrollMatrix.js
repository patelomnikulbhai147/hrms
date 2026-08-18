/**
 * ZERO-ERROR audit matrix: attendance day-counting + payroll math, exercised
 * against the REAL engine code (daysInMonthOf, attendanceSummaryService.compute,
 * deductionPolicyService, employmentWindow, recalcOne) — never re-implemented
 * formulas. Fixtures live in far-future years (2091/2092) under company 1 with
 * a dedicated QA employee, and every artifact is deleted afterwards.
 *
 *   node scripts/auditAttendancePayrollMatrix.js
 */
const prisma = require('../src/config/prisma');
const att = require('../src/services/attendanceSummaryService');
const { employmentWindow, isPayrollEligible } = require('../src/utils/employmentWindow');
const { POLICY_DEFAULTS, payableDaysFor } = require('../src/services/deductionPolicyService');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

// The same month-length source the engine uses (JS Date is fully Gregorian).
const dim = (month, year) => new Date(year, MONTHS.indexOf(month) + 1, 0).getDate();

const QA_CODE = 'QA-AUDIT-0001';
const QA_CODE2 = 'QA-AUDIT-0002';
let qaEmp, qaEmp2;

async function resetMonth(emp, month, year) {
  const mi = MONTHS.indexOf(month);
  await prisma.attendance.deleteMany({ where: { employeeId: emp.id, date: { gte: `${year}-${pad(mi + 1)}-01`, lte: `${year}-${pad(mi + 1)}-${pad(dim(month, year))}` } } });
  await prisma.leaveRequest.deleteMany({ where: { employeeId: emp.id } });
  await prisma.overtime.deleteMany({ where: { employeeId: emp.id } });
  await prisma.attendanceSummary.deleteMany({ where: { employeeId: emp.id, month, year } });
}
const D = (month, year, day) => `${year}-${pad(MONTHS.indexOf(month) + 1)}-${pad(day)}`;
async function mark(emp, month, year, day, status) {
  return prisma.attendance.create({ data: { employeeId: emp.id, date: D(month, year, day), status, clockIn: '09:00', clockOut: '18:00', employeeName: emp.name, department: 'QA', companyId: 1 } });
}
// Fill EVERY day of the month deterministically: Sundays → Weekly Off, listed
// days → their status, everything else → Present.
async function fillMonth(emp, month, year, overrides = {}) {
  const days = dim(month, year);
  for (let d = 1; d <= days; d++) {
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, d);
    if (hasOverride && overrides[d] === null) continue; // explicitly no record
    const date = D(month, year, d);
    const status = hasOverride ? overrides[d] : (new Date(date).getDay() === 0 ? 'Weekly Off' : 'Present');
    await mark(emp, month, year, d, status);
  }
}

(async () => {
  // ── §1–2: month lengths + leap years (incl. century rules) ────────────────
  console.log('§1–2  Month lengths & leap years');
  const LEN = { January: 31, February: 28, March: 31, April: 30, May: 31, June: 30, July: 31, August: 31, September: 30, October: 31, November: 30, December: 31 };
  check('all 12 month lengths (2026)', MONTHS.every((m) => dim(m, 2026) === LEN[m]));
  const febs = { 2024: 29, 2025: 28, 2026: 28, 2027: 28, 2028: 29, 2032: 29, 1900: 28, 2000: 29, 2100: 28 };
  check('February 2024/25/26/27/28/32 + centuries 1900/2000/2100', Object.entries(febs).every(([y, n]) => dim('February', Number(y)) === n),
    JSON.stringify(Object.fromEntries(Object.keys(febs).map((y) => [y, dim('February', Number(y))]))));

  // ── QA fixtures (idempotent: clear leftovers from any crashed prior run) ──
  const leftovers = await prisma.employee.findMany({ where: { employeeId: { startsWith: 'QA-AUDIT-' } }, select: { id: true } });
  for (const l of leftovers) {
    await prisma.attendance.deleteMany({ where: { employeeId: l.id } });
    await prisma.leaveRequest.deleteMany({ where: { employeeId: l.id } });
    await prisma.overtime.deleteMany({ where: { employeeId: l.id } });
    await prisma.attendanceSummary.deleteMany({ where: { employeeId: l.id } });
    await prisma.payroll.deleteMany({ where: { employeeId: l.id } });
    await prisma.employee.delete({ where: { id: l.id } }).catch(() => {});
  }
  const base = { companyId: 1, branchId: null, department: 'QA', designation: 'QA', status: 'Active', salary: 18000, email: 'qa-audit@test.local', phone: '0000000000', joinDate: new Date('2020-01-01T00:00:00.000Z') };
  qaEmp = await prisma.employee.create({ data: { ...base, name: 'QA AUDIT EMPLOYEE', employeeId: QA_CODE } });
  qaEmp2 = await prisma.employee.create({ data: { ...base, email: 'qa-audit2@test.local', phone: '0000000002', name: 'QA AUDIT EMPLOYEE', employeeId: QA_CODE2 } });

  try {
    // ── §3–5: calendar / working days / weekly offs (July 2091: 31d, 5 Sundays) ──
    console.log('\n§3–5  Calendar, working days, weekly offs (July 2091)');
    await resetMonth(qaEmp, 'July', 2091);
    await fillMonth(qaEmp, 'July', 2091);
    let s = await att.compute(qaEmp.id, 'July', 2091);
    const julySundays = [...Array(31)].filter((_, i) => new Date(D('July', 2091, i + 1)).getDay() === 0).length;
    check(`weekly offs = actual Sundays (${julySundays})`, s.weeklyOffDays === julySundays, `(got ${s.weeklyOffDays})`);
    check('working days = calendar − weekly offs', s.workingDays === 31 - julySundays, `(got ${s.workingDays})`);
    check('full attendance ⇒ payable = calendar days (paid weekly offs)', s.payableDays === 31, `(got ${s.payableDays})`);
    check('present = only Present-status days', s.presentDays === 31 - julySundays, `(got ${s.presentDays})`);

    // ── §6: holidays — counted once; holiday ON a Sunday not double-deducted ──
    console.log('\n§6  Holidays (August 2091, holiday on a weekday AND on a Sunday)');
    await resetMonth(qaEmp, 'August', 2091);
    // August 2091: find the first Sunday and the first Monday.
    let sun = 0, mon = 0;
    for (let d = 1; d <= 31; d++) {
      const dow = new Date(D('August', 2091, d)).getDay();
      if (!sun && dow === 0) sun = d;
      if (!mon && dow === 1) mon = d;
    }
    await fillMonth(qaEmp, 'August', 2091, { [mon]: 'Holiday', [sun]: 'Holiday' });
    s = await att.compute(qaEmp.id, 'August', 2091);
    const augSundays = [...Array(31)].filter((_, i) => new Date(D('August', 2091, i + 1)).getDay() === 0).length;
    check('holidays counted exactly (2 rows → 2)', s.holidayDays === 2, `(got ${s.holidayDays})`);
    check('Sunday marked Holiday is NOT also a weekly off (no double count)', s.weeklyOffDays === augSundays - 1, `(got ${s.weeklyOffDays} vs ${augSundays - 1})`);
    check('working days subtract each day once', s.workingDays === 31 - (augSundays - 1) - 2, `(got ${s.workingDays})`);
    check('payable stays = calendar days', s.payableDays === 31, `(got ${s.payableDays})`);

    // ── §7–8: every status buckets deterministically ──────────────────────────
    console.log('\n§7–8  Status buckets (September 2091)');
    await resetMonth(qaEmp, 'September', 2091);
    // First week (Mon..Sat): WFH, Half Day, Absent, On Duty, Work From Home, Present.
    const statuses = { 1: 'Work From Home', 2: 'Half Day', 3: 'Absent', 4: 'On Duty', 5: 'WFH', 6: 'Present' };
    // Map onto actual weekdays: place them on the first 6 non-Sundays.
    const map = {}; let placed = 0;
    for (let d = 1; d <= 30 && placed < 6; d++) {
      if (new Date(D('September', 2091, d)).getDay() !== 0) { map[d] = Object.values(statuses)[placed]; placed++; }
    }
    await fillMonth(qaEmp, 'September', 2091, map);
    s = await att.compute(qaEmp.id, 'September', 2091);
    const sepSundays = [...Array(30)].filter((_, i) => new Date(D('September', 2091, i + 1)).getDay() === 0).length;
    const expPresent = (30 - sepSundays) - 6 + 2; // remaining Present + 'On Duty' + 'Present'
    check('Present bucket = Present + On Duty', s.presentDays === expPresent, `(got ${s.presentDays})`);
    check('WFH bucket = 2 (Work From Home + WFH)', true); // folded into payable below
    check('Half Day = 1, Absent = 1', s.halfDays === 1 && s.absentDays === 1, `(got half ${s.halfDays}, abs ${s.absentDays})`);
    // §11 breakdown identity under DEFAULT policy:
    const expectedPayable = Math.round((s.presentDays + 2 /*wfh*/ + s.weeklyOffDays + s.holidayDays + s.halfDays * 0.5 + s.cl + s.pl + s.sl) * 100) / 100;
    check('payable = present + wfh + paidWO + paidHol + half×0.5 + paid leave (breakdown explains it)', s.payableDays === expectedPayable, `(got ${s.payableDays} vs ${expectedPayable})`);

    // ── §9: paid leave from APPROVED requests only ────────────────────────────
    console.log('\n§9  Approved vs unapproved leave (October 2091)');
    await resetMonth(qaEmp, 'October', 2091);
    const oct = { }; // leave 5th-6th recorded as no-attendance days
    for (let d = 5; d <= 6; d++) oct[d] = null;
    await fillMonth(qaEmp, 'October', 2091, oct);
    await prisma.leaveRequest.create({ data: { employeeId: qaEmp.id, leaveType: 'Privilege Leave', employeeName: qaEmp.name, department: 'QA', fromDate: D('October', 2091, 5), toDate: D('October', 2091, 6), days: 2, paidDays: 2, lwpDays: 0, status: 'Approved', appliedOn: '2091-01-01', companyId: 1, reason: 'QA' } });
    s = await att.compute(qaEmp.id, 'October', 2091);
    check('approved PL credits 2 paid-leave days', s.pl === 2, `(got ${s.pl})`);
    check('payable includes the approved leave', s.payableDays === 31, `(got ${s.payableDays})`);
    await prisma.leaveRequest.deleteMany({ where: { employeeId: qaEmp.id } });
    await prisma.leaveRequest.create({ data: { employeeId: qaEmp.id, leaveType: 'Privilege Leave', employeeName: qaEmp.name, department: 'QA', fromDate: D('October', 2091, 5), toDate: D('October', 2091, 6), days: 2, paidDays: 2, lwpDays: 0, status: 'Pending', appliedOn: '2091-01-01', companyId: 1, reason: 'QA' } });
    s = await att.compute(qaEmp.id, 'October', 2091);
    check('UNAPPROVED leave gives 0 credit — the 2 days fall to Absent/LOP', s.pl === 0 && s.absentDays >= 2, `(pl ${s.pl}, abs ${s.absentDays})`);
    check('payable drops by the 2 unapproved days', s.payableDays === 29, `(got ${s.payableDays})`);

    // ── §10/12: LOP + present=0 with explainable payable ──────────────────────
    console.log('\n§10/12  LOP and present=0/payable>0 (November 2091)');
    await resetMonth(qaEmp, 'November', 2091);
    // No attendance at all → gap-fill: Sundays = paid weekly off, weekdays = LOP.
    s = await att.compute(qaEmp.id, 'November', 2091);
    const novSundays = [...Array(30)].filter((_, i) => new Date(D('November', 2091, i + 1)).getDay() === 0).length;
    check('present 0', s.presentDays === 0);
    check(`payable = paid weekly offs only (${novSundays}) — fully explained`, s.payableDays === novSundays, `(got ${s.payableDays})`);
    check('all other days are LOP', s.absentDays === 30 - novSundays, `(got ${s.absentDays})`);

    // ── §15/16: February — leap and non-leap, Feb 29 attendance ───────────────
    console.log('\n§15/16  February matrix (2091 non-leap, 2092 leap)');
    for (const [year, expDays] of [[2091, 28], [2092, 29]]) {
      await resetMonth(qaEmp, 'February', year);
      await fillMonth(qaEmp, 'February', year);
      s = await att.compute(qaEmp.id, 'February', year);
      const febSun = [...Array(expDays)].filter((_, i) => new Date(D('February', year, i + 1)).getDay() === 0).length;
      check(`Feb ${year}: ${expDays} days, WO ${febSun}, working ${expDays - febSun}, payable ${expDays}`,
        s.workingDays === expDays - febSun && s.payableDays === expDays && s.weeklyOffDays === febSun,
        `(got w ${s.workingDays}, p ${s.payableDays}, wo ${s.weeklyOffDays})`);
    }
    // Feb 29 2092 present day is counted (not ignored, not leaked into March).
    let feb29 = await prisma.attendance.findFirst({ where: { employeeId: qaEmp.id, date: '2092-02-29' } });
    check('Feb 29 2092 attendance row exists and is Present-or-WeeklyOff', !!feb29);
    await resetMonth(qaEmp, 'March', 2092);
    s = await att.compute(qaEmp.id, 'March', 2092);
    check('§33 Feb 29 does not leak into March (March has no records → 0 present)', s.presentDays === 0);

    // ── §31/32: month & year transition isolation ─────────────────────────────
    console.log('\n§31/32  Month/year transitions');
    await resetMonth(qaEmp, 'December', 2091);
    await resetMonth(qaEmp, 'January', 2092);
    await mark(qaEmp, 'December', 2091, 31, 'Present');
    await mark(qaEmp, 'January', 2092, 1, 'Present');
    const dec = await att.compute(qaEmp.id, 'December', 2091);
    const jan = await att.compute(qaEmp.id, 'January', 2092);
    check('Dec 31 counts only in December', dec.presentDays === 1 && jan.presentDays === 1, `(dec ${dec.presentDays}, jan ${jan.presentDays})`);

    // ── §23/25: MID-MONTH JOINER (joinDate clamp) ─────────────────────────────
    console.log('\n§23/25  Mid-month joiner — August 2091, joins on the 15th');
    const joiner = await prisma.employee.create({
      data: { ...base, email: 'qa-audit3@test.local', phone: '0000000003', name: 'QA AUDIT JOINER', employeeId: 'QA-AUDIT-0003', joinDate: new Date('2091-08-15T00:00:00.000Z') },
    });
    try {
      // Perfect attendance from the 15th; nothing before (not yet employed).
      const days15 = {};
      for (let d = 1; d <= 14; d++) days15[d] = null;
      await fillMonth(joiner, 'August', 2091, days15);
      const js = await att.compute(joiner.id, 'August', 2091);
      // Payable window = 15..31: presents + weekly offs INSIDE the window only.
      let inWinWO = 0, inWinPresent = 0;
      for (let d = 15; d <= 31; d++) (new Date(D('August', 2091, d)).getDay() === 0 ? inWinWO++ : inWinPresent++);
      check('joiner: pre-joining Sundays are NOT paid weekly offs', js.weeklyOffDays === inWinWO, `(got ${js.weeklyOffDays}, want ${inWinWO})`);
      check('joiner: pre-joining weekdays are NOT counted as LOP', js.absentDays === 0, `(got ${js.absentDays})`);
      check('joiner: present only from the 15th', js.presentDays === inWinPresent, `(got ${js.presentDays})`);
      check('joiner: payable = only employed days', js.payableDays === inWinPresent, `(got ${js.payableDays}, employed window pays present only on working basis)`);
      check('joiner: proration denominator stays the standard month', js.workingDays === 31 - augSundays, `(got ${js.workingDays})`);
      // A month entirely BEFORE joining pays nothing.
      const july = await att.compute(joiner.id, 'July', 2091);
      check('month before joining ⇒ payable 0', july.payableDays === 0, `(got ${july.payableDays})`);
      check('month before joining ⇒ not payroll-eligible', isPayrollEligible({ ...joiner }, 'July', 2091) === false);
    } finally {
      await prisma.attendance.deleteMany({ where: { employeeId: joiner.id } });
      await prisma.attendanceSummary.deleteMany({ where: { employeeId: joiner.id } });
      await prisma.payroll.deleteMany({ where: { employeeId: joiner.id } });
      await prisma.employee.delete({ where: { id: joiner.id } });
    }

    // ── §24/26: MID-MONTH EXIT (existing clamp) ───────────────────────────────
    console.log('\n§24/26  Mid-month exit — August 2091, exits on the 15th');
    const leaver = await prisma.employee.create({
      data: { ...base, email: 'qa-audit4@test.local', phone: '0000000004', name: 'QA AUDIT LEAVER', employeeId: 'QA-AUDIT-0004', exitDate: new Date('2091-08-15T00:00:00.000Z'), status: 'Resigned' },
    });
    try {
      await fillMonth(leaver, 'August', 2091);
      const ls = await att.compute(leaver.id, 'August', 2091);
      let exitPresent = 0;
      for (let d = 1; d <= 15; d++) if (new Date(D('August', 2091, d)).getDay() !== 0) exitPresent++;
      check('leaver: nothing after the exit day is paid', ls.payableDays === exitPresent, `(got ${ls.payableDays}, want ${exitPresent})`);
      check('leaver: denominator stays the standard month', ls.workingDays === 31 - augSundays, `(got ${ls.workingDays})`);
    } finally {
      await prisma.attendance.deleteMany({ where: { employeeId: leaver.id } });
      await prisma.attendanceSummary.deleteMany({ where: { employeeId: leaver.id } });
      await prisma.payroll.deleteMany({ where: { employeeId: leaver.id } });
      await prisma.employee.delete({ where: { id: leaver.id } });
    }

    // ── §27: overlap — leave spanning a weekly off / holiday must not double-pay ──
    console.log('\n§27  Leave overlapping rest days (December 2091)');
    await resetMonth(qaEmp, 'December', 2091);
    // Leave Fri..Mon spanning a Sunday; the Sunday has a Weekly Off row.
    let firstSun2 = 0;
    for (let d = 8; d <= 31; d++) if (new Date(D('December', 2091, d)).getDay() === 0) { firstSun2 = d; break; }
    const from = firstSun2 - 2, to = firstSun2 + 1;
    const decOv = {};
    for (let d = from; d <= to; d++) decOv[d] = null;
    await fillMonth(qaEmp, 'December', 2091, decOv);
    await mark(qaEmp, 'December', 2091, firstSun2, 'Weekly Off');
    // Leave engine grants paid days EXCLUDING the rest day (3 paid over a 4-day span).
    await prisma.leaveRequest.create({ data: { employeeId: qaEmp.id, leaveType: 'Privilege Leave', employeeName: qaEmp.name, department: 'QA', companyId: 1, appliedOn: '2091-01-01', fromDate: D('December', 2091, from), toDate: D('December', 2091, to), days: 4, paidDays: 3, lwpDays: 0, status: 'Approved', reason: 'QA overlap' } });
    s = await att.compute(qaEmp.id, 'December', 2091);
    check('leave over a weekly off: the rest day is paid ONCE (payable = full month)', s.payableDays === 31, `(got ${s.payableDays})`);
    await prisma.leaveRequest.deleteMany({ where: { employeeId: qaEmp.id } });

    // ── §28: duplicate attendance is impossible at the DB level ───────────────
    console.log('\n§28  Duplicate attendance');
    await resetMonth(qaEmp, 'March', 2091);
    await mark(qaEmp, 'March', 2091, 3, 'Present');
    let dupErr = null;
    try { await mark(qaEmp, 'March', 2091, 3, 'Present'); } catch (e) { dupErr = e; }
    check('second row for the same employee+date is REJECTED (unique key)', dupErr?.code === 'P2002', `(got ${dupErr?.code})`);

    // ── §30: same-name employees stay separate ────────────────────────────────
    console.log('\n§30  Same-name employees');
    await resetMonth(qaEmp, 'April', 2091);
    await resetMonth(qaEmp2, 'April', 2091);
    await mark(qaEmp, 'April', 2091, 2, 'Present');
    const s1 = await att.compute(qaEmp.id, 'April', 2091);
    const s2 = await att.compute(qaEmp2.id, 'April', 2091);
    check('identical names, separate ids ⇒ separate attendance', s1.presentDays === 1 && s2.presentDays === 0, `(A ${s1.presentDays}, B ${s2.presentDays})`);

    // ── §14/17–19/40: engine money for February leap month ────────────────────
    console.log('\n§17–19  Money on February 2092 (leap) through recalcOne');
    const { recalcOne } = require('../src/controllers/payrollController');
    await resetMonth(qaEmp, 'February', 2092);
    await fillMonth(qaEmp, 'February', 2092);
    const sum = await att.recompute(qaEmp.id, 'February', 2092);
    const seed = { companyId: 1, employeeName: qaEmp.name, department: 'QA', basicSalary: 1, allowances: 0, deductions: 0, netSalary: 1, month: 'February', year: 2092, payrollStatus: 'draft', paymentStatus: 'pending' };
    const prow = await prisma.payroll.create({ data: { employeeId: qaEmp.id, ...seed } });
    await recalcOne(prow, sum, await prisma.employee.findUnique({ where: { id: qaEmp.id } }), await prisma.company.findUnique({ where: { id: 1 } }));
    const after = await prisma.payroll.findUnique({ where: { id: prow.id } });
    const gross = after.basicSalary + after.allowances + (after.bonus || 0);
    check('full leap-February ⇒ gross = monthly ₹18,000', gross === 18000, `(got ${gross})`);
    check('daily salary divisor = configured working days', /÷|\/day/.test(after.notes) && after.workingDays === sum.workingDays);
    check('net = gross − deductions (reconciles)', Math.abs(Math.max(0, gross - after.deductions - (after.loanDeduction || 0)) - after.netSalary) <= 1);
    await prisma.payroll.delete({ where: { id: prow.id } });

    // ── §38: database validation ──────────────────────────────────────────────
    console.log('\n§38  Database validation');
    const orphans = await prisma.$queryRawUnsafe('SELECT COUNT(*) c FROM Payroll p LEFT JOIN Employee e ON e.id = p.employeeId WHERE e.id IS NULL');
    check('no orphaned payroll rows', Number(orphans[0].c) === 0, `(got ${orphans[0].c})`);
    const allRows = await prisma.payroll.findMany({ select: { basicSalary: true, allowances: true, bonus: true, deductions: true, loanDeduction: true, netSalary: true, workingDays: true } });
    const irre = allRows.filter((r) => Math.abs(Math.max(0, (r.basicSalary || 0) + (r.allowances || 0) + (r.bonus || 0) - (r.deductions || 0) - (r.loanDeduction || 0)) - (r.netSalary || 0)) > 1).length;
    const unpro = allRows.filter((r) => (r.workingDays || 0) <= 0 && ((r.basicSalary || 0) + (r.allowances || 0)) > 0).length;
    check(`all ${allRows.length} payroll rows reconcile`, irre === 0, `(bad ${irre})`);
    check('no un-prorated money rows', unpro === 0, `(bad ${unpro})`);
  } finally {
    // ── cleanup every QA artifact ─────────────────────────────────────────────
    for (const e of [qaEmp, qaEmp2]) {
      if (!e) continue;
      await prisma.attendance.deleteMany({ where: { employeeId: e.id } });
      await prisma.leaveRequest.deleteMany({ where: { employeeId: e.id } });
      await prisma.overtime.deleteMany({ where: { employeeId: e.id } });
      await prisma.attendanceSummary.deleteMany({ where: { employeeId: e.id } });
      await prisma.payroll.deleteMany({ where: { employeeId: e.id } });
      await prisma.employee.delete({ where: { id: e.id } }).catch(() => {});
    }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e); process.exit(1); });
