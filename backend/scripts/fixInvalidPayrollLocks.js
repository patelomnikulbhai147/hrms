/**
 * DATA FIX — payroll may only be Locked once it is fully Paid. Any record that is
 * locked but NOT paid is invalid (it was locked automatically/incorrectly) and is
 * reverted to an editable 'approved' status with its attendance month reopened.
 *
 * NON-destructive: only flips payrollStatus/lockedAt of invalid rows; preserves
 * all amounts, payment fields, and history. Idempotent — safe to re-run.
 *   node scripts/fixInvalidPayrollLocks.js
 */
const prisma = require('../src/config/prisma');

(async () => {
  try {
    // Locked but payment not completed (anything other than 'paid').
    const bad = await prisma.payroll.findMany({
      where: { payrollStatus: 'locked', NOT: { paymentStatus: 'paid' } },
      select: { id: true, employeeName: true, paymentStatus: true, employeeId: true, month: true, year: true },
    });
    console.log(`Invalid locked-but-unpaid payroll records found: ${bad.length}`);
    if (!bad.length) { console.log('✅ Nothing to fix — every locked payroll is Paid.'); return; }

    bad.slice(0, 20).forEach(b =>
      console.log(`  · #${b.id} ${b.employeeName} — paymentStatus=${b.paymentStatus || '(null)'}`));

    const ids = bad.map(b => b.id);
    const r = await prisma.payroll.updateMany({
      where: { id: { in: ids } },
      data: { payrollStatus: 'approved', lockedAt: null },
    });
    // Reopen the attendance month for each corrected record.
    for (const b of bad) {
      await prisma.attendanceSummary.updateMany({
        where: { employeeId: b.employeeId, month: b.month, year: b.year },
        data: { locked: false },
      }).catch(() => {});
    }
    console.log(`\n✅ Corrected ${r.count} record(s): unlocked (payment not completed) → status 'approved', editable again.`);
  } catch (e) {
    console.error('Fix failed:', e.message); process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
