/**
 * Repair payroll rows written by the OLD "Push to Payroll Engine", which stored
 * attendance but never ran the salary engine — allowances = 0, deductions = 0,
 * overtime = ₹0, net = gross. Those rows understate or overstate real pay.
 *
 * Re-runs the SINGLE engine (attendanceSummary.recompute → recalcForEmployeeMonth)
 * over each affected row. No new formula: identical to what a fresh push now does.
 *
 * DRY RUN BY DEFAULT — it mutates real payroll, so it never writes unless asked.
 *
 *   node scripts/repairPushedPayrollOvertime.js                 # report only
 *   node scripts/repairPushedPayrollOvertime.js --apply         # write
 *   node scripts/repairPushedPayrollOvertime.js --apply --company 1
 *
 * LOCKED payroll is always skipped — a locked month is a closed pay period and
 * must only change through an explicit, audited recalculation.
 */
const prisma = require('../src/config/prisma');

const APPLY = process.argv.includes('--apply');
const companyArgIdx = process.argv.indexOf('--company');
const ONLY_COMPANY = companyArgIdx > -1 ? Number(process.argv[companyArgIdx + 1]) : null;

const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

(async () => {
  const where = {
    attendanceSource: 'Attendance Synchronization',
    allowances: 0,
    deductions: 0,
    ...(ONLY_COMPANY ? { companyId: ONLY_COMPANY } : {}),
  };

  const rows = await prisma.payroll.findMany({
    where,
    select: {
      id: true, companyId: true, employeeId: true, employeeName: true, month: true, year: true,
      basicSalary: true, allowances: true, deductions: true, overtime: true, otHours: true,
      netSalary: true, payrollStatus: true,
    },
    orderBy: [{ year: 'asc' }, { employeeName: 'asc' }],
  });

  console.log(`Rows written by the un-calculated push: ${rows.length}${ONLY_COMPANY ? ` (company ${ONLY_COMPANY})` : ''}`);
  if (!rows.length) { await prisma.$disconnect(); return; }

  const locked = rows.filter((r) => r.payrollStatus === 'locked');
  const target = rows.filter((r) => r.payrollStatus !== 'locked');
  if (locked.length) console.log(`  ${locked.length} locked row(s) will be SKIPPED (closed pay periods).`);
  console.log(`  ${target.length} row(s) eligible for recalculation.\n`);

  if (!APPLY) {
    console.log('DRY RUN — nothing written. Re-run with --apply to repair.\n');
    target.slice(0, 15).forEach((r) => {
      console.log(`   ${r.employeeName} ${r.month} ${r.year}: basic=${inr(r.basicSalary)} allow=${inr(r.allowances)} ded=${inr(r.deductions)} ot=${inr(r.overtime)} (${r.otHours}h) net=${inr(r.netSalary)}`);
    });
    if (target.length > 15) console.log(`   … and ${target.length - 15} more`);
    await prisma.$disconnect();
    return;
  }

  const attSvc = require('../src/services/attendanceSummaryService');
  const payrollCtrl = require('../src/controllers/payrollController');

  let repaired = 0, failed = 0;
  let otBefore = 0, otAfter = 0, netBefore = 0, netAfter = 0;

  for (const r of target) {
    try {
      await attSvc.recompute(r.employeeId, r.month, r.year, { markSynced: true });
      await payrollCtrl.recalcForEmployeeMonth(r.employeeId, r.month, r.year);
      const after = await prisma.payroll.findUnique({
        where: { id: r.id },
        select: { overtime: true, netSalary: true, allowances: true, deductions: true, otHours: true },
      });
      otBefore += r.overtime || 0; otAfter += after?.overtime || 0;
      netBefore += r.netSalary || 0; netAfter += after?.netSalary || 0;
      repaired++;
      console.log(`   OK  ${r.employeeName} ${r.month} ${r.year}: net ${inr(r.netSalary)} → ${inr(after?.netSalary)}, OT ${inr(r.overtime)} → ${inr(after?.overtime)} (${after?.otHours}h)`);
    } catch (e) {
      failed++;
      console.log(`   ERR ${r.employeeName} ${r.month} ${r.year}: ${e.message}`);
    }
  }

  console.log(`\nRepaired ${repaired}, failed ${failed}, skipped ${locked.length} locked.`);
  console.log(`Overtime total : ${inr(otBefore)} → ${inr(otAfter)}`);
  console.log(`Net total      : ${inr(netBefore)} → ${inr(netAfter)}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
