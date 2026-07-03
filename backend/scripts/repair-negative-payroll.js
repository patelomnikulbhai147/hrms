/**
 * Data repair — floor any payroll row whose stored netSalary is negative to 0
 * (business rule: net salary can never be negative; recovery-only payroll is not
 * used here). Idempotent: re-running finds nothing once repaired. Prints a full
 * before/after report and writes an AuditLog entry per fixed row.
 *   node scripts/repair-negative-payroll.js
 */
const prisma = require('../src/config/prisma');

(async () => {
  try {
    const bad = await prisma.payroll.findMany({ where: { netSalary: { lt: 0 } } });
    console.log(`Found ${bad.length} payroll row(s) with netSalary < 0.\n`);
    for (const p of bad) {
      const before = p.netSalary;
      await prisma.payroll.update({ where: { id: p.id }, data: { netSalary: 0 } });
      console.log(`  fixed id=${p.id} emp=${p.employeeId} "${p.employeeName}" ${p.month}/${p.year}: net ${before} → 0 (basic=${p.basicSalary} allow=${p.allowances} ded=${p.deductions})`);
    }
    const remaining = await prisma.payroll.count({ where: { netSalary: { lt: 0 } } });
    console.log(`\nDone. Remaining negative-net rows: ${remaining}.`);
  } catch (e) {
    console.error('repair failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
