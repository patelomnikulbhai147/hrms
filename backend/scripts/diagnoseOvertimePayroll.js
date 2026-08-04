/**
 * Diagnose the Overtime → Payroll pipeline. Read-only, no sampling.
 *
 * Answers, with data rather than inference:
 *   1. Do Overtime rows exist, and what status are they in?
 *   2. Do the OT hours reach AttendanceSummary.otHours?
 *   3. Do they reach payroll.otHours?
 *   4. Is payroll.overtime (the AMOUNT) non-zero where hours exist?
 *   5. Is the OT amount actually inside `allowances` (i.e. paid in net)?
 */
const prisma = require('../src/config/prisma');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

(async () => {
  const ot = await prisma.overtime.groupBy({ by: ['status'], _count: { _all: true }, _sum: { otHours: true } });
  console.log('=== 1. Overtime rows by status ===');
  if (!ot.length) console.log('   (no overtime rows at all)');
  ot.forEach((r) => console.log(`   ${String(r.status).padEnd(10)} count=${String(r._count._all).padEnd(6)} hours=${r._sum.otHours || 0}`));

  // EVERY approved row — no take limit, or the per-employee totals are wrong.
  const approved = await prisma.overtime.findMany({
    where: { status: 'Approved' },
    select: { employeeId: true, employeeName: true, date: true, otHours: true },
  });
  console.log(`\n=== 2. Approved OT rows: ${approved.length} ===`);

  const byEmpMonth = new Map();
  for (const o of approved) {
    const m = MONTHS[Number(String(o.date).slice(5, 7)) - 1];
    const y = Number(String(o.date).slice(0, 4));
    if (!m || !y) continue;
    const k = `${o.employeeId}|${m}|${y}`;
    const cur = byEmpMonth.get(k) || { hours: 0, name: o.employeeName };
    cur.hours += Number(o.otHours || 0);
    byEmpMonth.set(k, cur);
  }
  console.log(`   distinct employee-months with approved OT: ${byEmpMonth.size}`);

  let checked = 0, noPayroll = 0, hoursMissing = 0, amountZero = 0, netExcludesOt = 0, ok = 0;
  const failures = [];

  for (const [k, { hours, name }] of byEmpMonth) {
    const [employeeId, month, year] = k.split('|');
    const pay = await prisma.payroll.findFirst({
      where: { employeeId: Number(employeeId), month, year: Number(year) },
      select: {
        id: true, employeeName: true, basicSalary: true, allowances: true, deductions: true,
        overtime: true, otHours: true, netSalary: true, bonus: true, notes: true,
      },
    });
    if (!pay) { noPayroll++; continue; }
    checked++;

    const summary = await prisma.attendanceSummary.findFirst({
      where: { employeeId: Number(employeeId), month, year: Number(year) },
      select: { otHours: true },
    }).catch(() => null);

    const problems = [];
    if (Math.abs((pay.otHours || 0) - hours) > 0.01) {
      problems.push(`payroll.otHours=${pay.otHours} but approved OT=${hours} (summary=${summary?.otHours ?? 'n/a'})`);
      hoursMissing++;
    }
    if ((pay.otHours || 0) > 0 && !(pay.overtime > 0)) {
      problems.push(`otHours=${pay.otHours} but overtime AMOUNT=${pay.overtime}`);
      amountZero++;
    }
    if ((pay.overtime || 0) > 0 && (pay.allowances || 0) < (pay.overtime || 0) - 1) {
      problems.push(`overtime=${pay.overtime} NOT inside allowances=${pay.allowances} → not paid in net`);
      netExcludesOt++;
    }

    if (problems.length) {
      failures.push({
        employeeId, name: pay.employeeName || name, period: `${month} ${year}`,
        summaryOt: summary?.otHours ?? 'n/a', approved: hours, ...pay, problems,
      });
    } else ok++;
  }

  console.log(`\n=== 3. Employee-months cross-checked against payroll ===`);
  console.log(`   payroll row exists          : ${checked}`);
  console.log(`   no payroll row for period   : ${noPayroll}`);
  console.log(`   clean                       : ${ok}`);
  console.log(`   OT hours not transferred    : ${hoursMissing}`);
  console.log(`   OT amount = 0 despite hours : ${amountZero}`);
  console.log(`   OT amount not in allowances : ${netExcludesOt}`);

  console.log(`\n=== 4. First failures ===`);
  failures.slice(0, 10).forEach((f) => {
    console.log(`   emp=${f.employeeId} ${f.name} ${f.period}`);
    console.log(`      approvedOT=${f.approved}h  summary.otHours=${f.summaryOt}  payroll.otHours=${f.otHours}  overtime=₹${f.overtime}`);
    console.log(`      basic=${f.basicSalary} allow=${f.allowances} ded=${f.deductions} net=${f.netSalary}`);
    console.log(`      notes: ${String(f.notes || '').slice(0, 110)}`);
    f.problems.forEach((p) => console.log(`      X ${p}`));
  });

  // How many payroll rows carry the pushToPayroll signature (allowances/deductions
  // forced to 0, net === basic) — those can never contain an OT amount.
  const pushShaped = await prisma.payroll.count({
    where: { allowances: 0, deductions: 0, otHours: { gt: 0 } },
  });
  const withHours = await prisma.payroll.count({ where: { otHours: { gt: 0 } } });
  const zeroAmount = await prisma.payroll.count({
    where: { otHours: { gt: 0 }, OR: [{ overtime: 0 }, { overtime: null }] },
  });
  const hoursZero = await prisma.payroll.count({ where: { otHours: 0 } });
  console.log(`\n=== 5. GLOBAL payroll table ===`);
  console.log(`   rows with otHours > 0                        : ${withHours}`);
  console.log(`   ...with overtime amount 0/null               : ${zeroAmount}`);
  console.log(`   ...with allowances=0 AND deductions=0 (push) : ${pushShaped}`);
  console.log(`   rows with otHours = 0                        : ${hoursZero}`);

  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
