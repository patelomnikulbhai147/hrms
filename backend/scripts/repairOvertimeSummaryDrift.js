/**
 * Repair employee-months where APPROVED overtime is missing from the stored
 * AttendanceSummary — and therefore invisible to Payroll.
 *
 * These predate the approval hook in overtimeController: before it existed,
 * approving overtime did not refresh the snapshot, so the hours never reached
 * the payroll worksheet. New approvals repair themselves; these do not.
 *
 * Repairs by re-running the SAME engine the hook uses (recompute → recalcOne).
 * No new formula, no hand-set values.
 *
 * DRY RUN BY DEFAULT — it changes real pay.
 *
 *   node scripts/repairOvertimeSummaryDrift.js                # report only
 *   node scripts/repairOvertimeSummaryDrift.js --apply        # write
 *   node scripts/repairOvertimeSummaryDrift.js --apply --company 13
 *
 * Locked months and locked payroll are skipped — a closed pay period must only
 * change through an explicit, audited correction.
 */
const prisma = require('../src/config/prisma');

const APPLY = process.argv.includes('--apply');
const ci = process.argv.indexOf('--company');
const ONLY_COMPANY = ci > -1 ? Number(process.argv[ci + 1]) : null;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

(async () => {
  const where = { status: 'Approved', ...(ONLY_COMPANY ? { companyId: ONLY_COMPANY } : {}) };
  const ot = await prisma.overtime.findMany({
    where, select: { employeeId: true, employeeName: true, date: true, otHours: true },
  });

  // Truth: approved hours per employee-month.
  const truth = new Map();
  for (const o of ot) {
    const y = Number(String(o.date).slice(0, 4));
    const mi = Number(String(o.date).slice(5, 7)) - 1;
    if (!y || !MONTHS[mi]) continue;
    const k = `${o.employeeId}|${MONTHS[mi]}|${y}`;
    const c = truth.get(k) || { hours: 0, name: o.employeeName };
    c.hours += Number(o.otHours || 0);
    truth.set(k, c);
  }

  const drift = [];
  for (const [k, t] of truth) {
    const [empId, month, year] = k.split('|');
    const s = await prisma.attendanceSummary.findFirst({
      where: { employeeId: Number(empId), month, year: Number(year) },
      select: { id: true, otHours: true, locked: true },
    });
    // No summary row at all is fine — the worksheet falls back to live figures.
    if (!s) continue;
    if (Math.abs(Number(s.otHours || 0) - t.hours) < 0.01) continue;
    drift.push({ employeeId: Number(empId), name: t.name, month, year: Number(year), approved: t.hours, stored: Number(s.otHours || 0), locked: !!s.locked });
  }

  const lost = drift.filter((d) => d.stored === 0);
  console.log(`Employee-months with approved overtime : ${truth.size}${ONLY_COMPANY ? ` (company ${ONLY_COMPANY})` : ''}`);
  console.log(`  stored summary disagrees             : ${drift.length}`);
  console.log(`  ...of which approved OT is INVISIBLE : ${lost.length}  (stored 0, payroll pays nothing)`);
  const locked = drift.filter((d) => d.locked);
  if (locked.length) console.log(`  ${locked.length} locked month(s) will be SKIPPED.`);

  const target = drift.filter((d) => !d.locked);
  if (!target.length) { console.log('\nNothing to repair.'); await prisma.$disconnect(); return; }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to repair.\n');
    target.slice(0, 20).forEach((d) => console.log(`   ${d.name} (emp ${d.employeeId}) ${d.month} ${d.year}: approved=${d.approved}h stored=${d.stored}h`));
    if (target.length > 20) console.log(`   … and ${target.length - 20} more`);
    await prisma.$disconnect();
    return;
  }

  const attSvc = require('../src/services/attendanceSummaryService');
  const payrollCtrl = require('../src/controllers/payrollController');
  let fixed = 0, failed = 0, netBefore = 0, netAfter = 0;

  for (const d of target) {
    try {
      const before = await prisma.payroll.findFirst({
        where: { employeeId: d.employeeId, month: d.month, year: d.year },
        select: { id: true, netSalary: true, overtime: true, payrollStatus: true },
      });
      if (before?.payrollStatus === 'locked') { console.log(`   SKIP ${d.name} ${d.month} ${d.year} — payroll locked`); continue; }

      await attSvc.recompute(d.employeeId, d.month, d.year);
      await payrollCtrl.recalcForEmployeeMonth(d.employeeId, d.month, d.year);

      const after = before && await prisma.payroll.findUnique({
        where: { id: before.id }, select: { netSalary: true, overtime: true, otHours: true },
      });
      if (before && after) { netBefore += before.netSalary || 0; netAfter += after.netSalary || 0; }
      fixed++;
      console.log(`   OK  ${d.name} ${d.month} ${d.year}: OT ${d.stored}h→${d.approved}h` +
        (after ? `, amount ${inr(before.overtime)}→${inr(after.overtime)}, net ${inr(before.netSalary)}→${inr(after.netSalary)}` : ' (no payroll row)'));
    } catch (e) {
      failed++;
      console.log(`   ERR ${d.name} ${d.month} ${d.year}: ${e.message}`);
    }
  }

  console.log(`\nRepaired ${fixed}, failed ${failed}.`);
  console.log(`Net total across repaired rows: ${inr(netBefore)} → ${inr(netAfter)}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
