/**
 * Seed the leave system for existing data (idempotent):
 *  1. One LeaveCreditConfig per company (default CL1 / PL1.5 / SL1, CF5).
 *  2. A LeaveBalance per employee accrued Jan→current month (June 2026 ⇒ CL6 /
 *     PL9 / SL6) minus already-approved CL/PL/SL days.
 *  3. A current-month AttendanceSummary per employee, derived from real data.
 */
const prisma = require('../src/config/prisma');
const leaveService = require('../src/services/leaveService');
const summaryService = require('../src/services/attendanceSummaryService');

const YEAR = 2026;
const THROUGH_MONTH = 6;      // June
const CURRENT_MONTH = 'June';

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const c of companies) {
    const cfg = await leaveService.getOrCreateConfig(c.id, YEAR);
    console.log(`Config: ${c.name} (company ${c.id}) → CL ${cfg.clPerMonth}/PL ${cfg.plPerMonth}/SL ${cfg.slPerMonth} per month, CF ${cfg.carryForward}`);
  }

  const employees = await prisma.employee.findMany({ select: { id: true, companyId: true } });
  console.log(`\nSeeding wallets for ${employees.length} employees (accrued through month ${THROUGH_MONTH})...`);

  // Pre-aggregate already-approved CL/PL/SL usage per employee.
  const approved = await prisma.leaveRequest.findMany({
    where: { status: 'Approved' },
    select: { employeeId: true, leaveType: true, days: true, paidDays: true },
  });
  const usedBy = new Map(); // employeeId -> {CL,PL,SL}
  for (const l of approved) {
    const cat = leaveService.categoryOf(l.leaveType);
    if (!['CL', 'PL', 'SL'].includes(cat)) continue;
    const m = usedBy.get(l.employeeId) || { CL: 0, PL: 0, SL: 0 };
    m[cat] += (l.paidDays || l.days || 0);
    usedBy.set(l.employeeId, m);
  }

  let walletCount = 0;
  for (const e of employees) {
    const bal = await leaveService.getOrCreateBalance(e.id, YEAR);
    const used = usedBy.get(e.id) || { CL: 0, PL: 0, SL: 0 };
    // Set used first so accrue() computes the right available balance.
    await prisma.leaveBalance.update({
      where: { id: bal.id },
      data: { clUsed: round(used.CL), plUsed: round(used.PL), slUsed: round(used.SL), carryForward: 0 },
    });
    await leaveService.accrue(e.id, THROUGH_MONTH, YEAR);
    walletCount++;
  }
  console.log(`Wallets seeded: ${walletCount}`);

  console.log(`\nBuilding ${CURRENT_MONTH} ${YEAR} attendance summaries...`);
  let summaryCount = 0;
  for (const e of employees) {
    await summaryService.recompute(e.id, CURRENT_MONTH, YEAR);
    summaryCount++;
  }
  console.log(`Summaries seeded: ${summaryCount}`);

  // Sample output
  const sample = await prisma.leaveBalance.findMany({
    where: { year: YEAR }, take: 3, orderBy: { employeeId: 'asc' },
    include: { employee: { select: { employeeId: true, name: true } } },
  });
  console.log('\nSample wallets:');
  sample.forEach(b => console.log(`  ${b.employee.employeeId} ${b.employee.name}: CL ${b.clBalance} / PL ${b.plBalance} / SL ${b.slBalance}`));
}

main()
  .catch(e => { console.error('SEED FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
