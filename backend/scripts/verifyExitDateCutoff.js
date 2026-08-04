/**
 * Offboarding salary cut-off — end-to-end verification.
 *
 *   node scripts/verifyExitDateCutoff.js
 *
 * Builds a scratch employee with a fully recorded July 2026, then moves the exit
 * date around and asserts what the REAL engine produces: attendanceSummaryService
 * .compute for the days, payrollController.recalcOne for the money, and the
 * eligibility filter for the roster. Self-cleaning — every row it creates is
 * deleted again, including on failure.
 */
const prisma = require('../src/config/prisma');
const attSvc = require('../src/services/attendanceSummaryService');
const payroll = require('../src/controllers/payrollController');
const { employmentWindow, isPayrollEligible, payrollEligibilityWhere } = require('../src/utils/employmentWindow');

const MONTH = 'July', YEAR = 2026, SALARY = 30000;
const pad = (n) => String(n).padStart(2, '0');
const d = (day) => `${YEAR}-07-${pad(day)}`;
const DAYS = 31;

let fails = 0;
const eq = (label, actual, expected) => {
  const ok = Math.abs(Number(actual) - Number(expected)) < 0.01;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(56)} ${actual}${ok ? '' : `  (expected ${expected})`}`);
  if (!ok) fails++;
};
const is = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label.padEnd(56)} ${detail}`);
  if (!cond) fails++;
};

const setExit = (id, iso) =>
  prisma.employee.update({ where: { id }, data: { exitDate: iso ? new Date(`${iso}T00:00:00.000Z`) : null } });

async function summaryFor(empId) {
  // compute() only — never persisted, so the test cannot corrupt a real summary.
  return attSvc.compute(empId, MONTH, YEAR);
}

(async () => {
  const company = await prisma.company.findFirst({ where: { id: 1 }, select: { id: true, basicPercent: true, pfRate: true, profTaxRate: true } });
  let emp = null, pay = null;

  try {
    emp = await prisma.employee.create({
      data: {
        companyId: company.id, employeeId: `ZZ-EXIT-${Date.now()}`,
        name: 'Exit Cutoff Probe', email: `exit.probe.${Date.now()}@scratch.local`,
        department: 'QA', designation: 'Probe', status: 'Active',
        joinDate: new Date('2020-01-01T00:00:00.000Z'), salary: SALARY,
      },
    });

    // A fully recorded July: Present on working days, Weekly Off on Sundays.
    // 18–20 July are deliberately left unrecorded — an approved leave covers
    // them, so the leave is not double-counted against an attendance row.
    const LEAVE = [18, 19, 20];
    const sundays = [];
    const rows = [];
    for (let day = 1; day <= DAYS; day++) {
      const isSun = new Date(d(day)).getDay() === 0;
      if (isSun) sundays.push(day);
      if (LEAVE.includes(day)) continue;
      rows.push({ companyId: company.id, employeeId: emp.id, employeeName: emp.name, date: d(day), status: isSun ? 'Weekly Off' : 'Present' });
    }
    await prisma.attendance.createMany({ data: rows });

    // Signals that live AFTER a 15 July exit and must all be ignored.
    await prisma.overtime.create({ data: { companyId: company.id, employeeId: emp.id, employeeName: emp.name, date: d(20), otHours: 8, status: 'Approved', type: 'Normal', inTime: '18:00', outTime: '02:00' } });
    await prisma.overtime.create({ data: { companyId: company.id, employeeId: emp.id, employeeName: emp.name, date: d(10), otHours: 3, status: 'Approved', type: 'Normal', inTime: '18:00', outTime: '21:00' } });
    await prisma.leaveRequest.create({
      data: {
        companyId: company.id, employeeId: emp.id, employeeName: emp.name, department: emp.department, leaveType: 'Casual Leave',
        fromDate: d(18), toDate: d(20), days: 3, status: 'Approved', reason: 'probe', appliedOn: d(1),
      },
    });

    const sundaysUpTo = (n) => sundays.filter((s) => s <= n).length;
    // A Sunday swallowed by an approved leave counts as leave, not a weekly off
    // (existing convention), so 19 July does not reduce the working-day count.
    const fullWeeklyOff = sundays.filter((s) => !LEAVE.includes(s)).length;
    const fullWorking = DAYS - fullWeeklyOff;
    console.log(`July 2026: ${DAYS} days, ${sundays.length} Sundays (${sundays.join(',')}), `
      + `${fullWeeklyOff} of them weekly offs → full working days ${fullWorking}\n`);

    // ── 1. No exit date — behaviour must be byte-identical to before ──────────
    console.log('── No exit date (control) ──');
    let s = await summaryFor(emp.id);
    // Full month, rest days credited as before: 25 present + 3 weekly off + 3 CL.
    eq('workingDays (full month)', s.workingDays, fullWorking);
    eq('presentDays', s.presentDays, DAYS - sundays.length - 2);   // 18 & 20 are on leave
    eq('weeklyOffDays (19 Jul is leave, not a weekly off)', s.weeklyOffDays, fullWeeklyOff);
    eq('cl', s.cl, 3);
    eq('payableDays credits rest days (unchanged behaviour)', s.payableDays, 31);
    is('payable ≥ working → paid in full', s.payableDays >= s.workingDays, `${s.payableDays}/${s.workingDays}`);
    eq('otHours (3 + 8, both inside the month)', s.otHours, 11);
    const baselineWorking = s.workingDays;

    // ── 2. Exit 15 July — the headline case ──────────────────────────────────
    console.log('\n── Exit 15 Jul 2026 ──');
    await setExit(emp.id, d(15));
    emp = await prisma.employee.findUnique({ where: { id: emp.id } });
    const w = employmentWindow(emp, MONTH, YEAR);
    is('payroll period is 01 Jul – 15 Jul', w.monthStart === d(1) && w.windowEnd === d(15), `${w.monthStart} → ${w.windowEnd}`);

    s = await summaryFor(emp.id);
    const expPresent = 15 - sundaysUpTo(15);
    eq('presentDays counted only to the 15th', s.presentDays, expPresent);
    eq('weeklyOffDays counted only to the 15th', s.weeklyOffDays, sundaysUpTo(15));
    eq('otHours — the 20 Jul overtime is ignored', s.otHours, 3);
    eq('cl — the 18–20 Jul leave is ignored', s.cl, 0);
    // Truncated month → same basis as workingDays, so the 2 Sundays are carried
    // by the daily rate rather than credited on top: 13 working days of 27.
    eq('payableDays = working days actually served', s.payableDays, expPresent);
    eq('workingDays UNCHANGED (denominator = full month)', s.workingDays, baselineWorking);
    is('payable < working → salary prorates', s.payableDays < s.workingDays, `${s.payableDays}/${s.workingDays}`);

    // The money, through the real engine.
    pay = await prisma.payroll.create({
      data: {
        companyId: company.id, employeeId: emp.id, employeeName: emp.name, department: emp.department,
        month: MONTH, year: YEAR, basicSalary: 0, allowances: 0, deductions: 0, netSalary: 0,
        payrollStatus: 'pending_approval', paymentStatus: 'pending', paymentDate: new Date().toISOString(),
      },
    });
    const summaryRow = { ...s, syncedAt: new Date() };
    let out = await payroll.recalcOne(pay, summaryRow, emp, company);
    const expectedGross = Math.round(SALARY * (s.payableDays / s.workingDays));
    const grossOut = out.basicSalary + (out.allowances - out.overtime);
    eq('gross pay = monthly × payable/working', grossOut, expectedGross);
    // 15 of 31 calendar days ≈ 48.4%; the working-day basis gives 13/27 ≈ 48.1%.
    is('gross ≈ the half-month the employee actually served',
      Math.abs(grossOut / SALARY - 15 / DAYS) < 0.02, `₹${grossOut} of ₹${SALARY} = ${Math.round(grossOut / SALARY * 1000) / 10}%`);
    eq('payroll row stores payableDays', out.payableDays, s.payableDays);
    eq('payroll row stores full-month workingDays', out.workingDays, baselineWorking);
    eq('overtime paid on 3 h only (not 11)', out.otHours, 3);

    // ── 3. Exit 25 July ──────────────────────────────────────────────────────
    console.log('\n── Exit 25 Jul 2026 ──');
    await setExit(emp.id, d(25));
    emp = await prisma.employee.findUnique({ where: { id: emp.id } });
    s = await summaryFor(emp.id);
    // Days 1–25: 25 − 3 Sundays = 22 non-Sundays, less the 18th & 20th on leave
    // = 20 present, + 3 CL = 23 payable working days out of 27.
    eq('presentDays', s.presentDays, 25 - sundaysUpTo(25) - 2);
    eq('payableDays = present + paid leave', s.payableDays, (25 - sundaysUpTo(25) - 2) + 3);
    eq('workingDays still the full month', s.workingDays, baselineWorking);
    eq('otHours — 20 Jul overtime now counts', s.otHours, 11);
    eq('cl — 18–20 Jul leave now counts', s.cl, 3);
    out = await payroll.recalcOne(pay, { ...s, syncedAt: new Date() }, emp, company);
    is('gross ≈ the 25 of 31 days served',
      Math.abs((out.basicSalary + out.allowances - out.overtime) / SALARY - 25 / DAYS) < 0.03,
      `₹${out.basicSalary + out.allowances - out.overtime}`);

    // ── 4. Exit 31 July — the last day, so nothing is truncated ──────────────
    console.log('\n── Exit 31 Jul 2026 (last day of month) ──');
    await setExit(emp.id, d(31));
    emp = await prisma.employee.findUnique({ where: { id: emp.id } });
    s = await summaryFor(emp.id);
    eq('payableDays identical to the no-exit control', s.payableDays, 31);
    eq('workingDays = full month', s.workingDays, fullWorking);
    is('not truncated → paid in full', s.payableDays >= s.workingDays, `${s.payableDays}/${s.workingDays}`);
    out = await payroll.recalcOne(pay, { ...s, syncedAt: new Date() }, emp, company);
    eq('gross = the whole monthly salary', out.basicSalary + out.allowances - out.overtime, SALARY);

    // ── 5. Exit 30 June — no July employment at all ──────────────────────────
    console.log('\n── Exit 30 Jun 2026 (before the payroll month) ──');
    await setExit(emp.id, '2026-06-30');
    emp = await prisma.employee.findUnique({ where: { id: emp.id } });
    s = await summaryFor(emp.id);
    eq('payableDays = 0', s.payableDays, 0);
    eq('presentDays = 0', s.presentDays, 0);
    eq('otHours = 0', s.otHours, 0);
    out = await payroll.recalcOne(pay, { ...s, syncedAt: new Date() }, emp, company);
    eq('net salary = 0', out.netSalary, 0);

    // ── 6. Roster eligibility ────────────────────────────────────────────────
    console.log('\n── Eligibility (roster) ──');
    const cases = [
      { exit: null, status: 'Active', month: 'July', want: true, label: 'active, no exit date → July' },
      { exit: d(15), status: 'Active', month: 'July', want: true, label: 'exit 15 Jul, still Active → July' },
      { exit: d(15), status: 'Resigned', month: 'July', want: true, label: 'exit 15 Jul, Resigned → July (exit month)' },
      { exit: d(15), status: 'Resigned', month: 'August', want: false, label: 'exit 15 Jul, Resigned → August (excluded)' },
      { exit: '2026-08-10', status: 'Resigned', month: 'July', want: true, label: 'exit 10 Aug on notice → July (full month)' },
      { exit: '2026-08-10', status: 'Resigned', month: 'August', want: true, label: 'exit 10 Aug → August (prorated)' },
      { exit: '2026-08-10', status: 'Resigned', month: 'September', want: false, label: 'exit 10 Aug → September (excluded)' },
      { exit: null, status: 'Archived', month: 'July', want: false, label: 'offboarded with no exit date → excluded' },
    ];
    for (const c of cases) {
      const got = isPayrollEligible({ exitDate: c.exit ? new Date(`${c.exit}T00:00:00.000Z`) : null, status: c.status }, c.month, YEAR);
      is(c.label, got === c.want, got ? 'eligible' : 'excluded');
    }

    // The Prisma fragment must agree with the in-memory predicate.
    await setExit(emp.id, d(15));
    await prisma.employee.update({ where: { id: emp.id }, data: { status: 'Resigned' } });
    const inJuly = await prisma.employee.findMany({
      where: { AND: [payrollEligibilityWhere('July', YEAR)], id: emp.id }, select: { id: true },
    });
    const inAugust = await prisma.employee.findMany({
      where: { AND: [payrollEligibilityWhere('August', YEAR)], id: emp.id }, select: { id: true },
    });
    is('DB filter: offboarded leaver IS in July roster', inJuly.length === 1);
    is('DB filter: offboarded leaver is NOT in August roster', inAugust.length === 0);
  } finally {
    if (emp) {
      if (pay) await prisma.payroll.deleteMany({ where: { employeeId: emp.id } });
      await prisma.attendanceSummary.deleteMany({ where: { employeeId: emp.id } });
      await prisma.overtime.deleteMany({ where: { employeeId: emp.id } });
      await prisma.leaveRequest.deleteMany({ where: { employeeId: emp.id } });
      await prisma.attendance.deleteMany({ where: { employeeId: emp.id } });
      await prisma.employee.delete({ where: { id: emp.id } });
      console.log(`\ncleaned up scratch employee #${emp.id}`);
    }
    await prisma.$disconnect();
  }

  console.log('\n' + '─'.repeat(78));
  console.log(fails === 0 ? 'PASS — payroll stops at the exit date and prorates against the full month'
    : `${fails} FAILING CHECK(S)`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('VERIFY ERROR:', e); process.exit(1); });
