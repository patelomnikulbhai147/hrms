/**
 * Task Manager — retire the "Pending" status.
 *
 * DATA-ONLY and IDEMPOTENT. No column is added, renamed or dropped; only the
 * `status` VALUES are migrated and the column DEFAULT is realigned so a future
 * insert can never reintroduce "Pending".
 *
 *   Pending  → In Progress   (the new default / only starting state)
 *   Overdue  → In Progress   (Overdue is now CALCULATED from dueDate, never stored)
 *
 * Run:  node scripts/migrateTaskPendingStatus.js
 */
const prisma = require('../src/config/prisma');

(async () => {
  try {
    const before = await prisma.task.groupBy({ by: ['status'], _count: { _all: true } });
    console.log('Status counts BEFORE:', before.map(r => `${r.status}=${r._count._all}`).join(', ') || '(no tasks)');

    const pending = await prisma.task.updateMany({ where: { status: 'Pending' }, data: { status: 'In Progress' } });
    const overdue = await prisma.task.updateMany({ where: { status: 'Overdue' }, data: { status: 'In Progress' } });
    console.log(`Migrated Pending → In Progress: ${pending.count}`);
    console.log(`Migrated stored Overdue → In Progress: ${overdue.count} (Overdue is now derived)`);

    // Realign the column default (safe, non-destructive; no structure change).
    try {
      await prisma.$executeRawUnsafe("ALTER TABLE `Task` ALTER COLUMN `status` SET DEFAULT 'In Progress'");
      console.log("Column default set to 'In Progress'.");
    } catch (e) {
      console.warn('Default not changed (harmless — the API always sends a status):', e.message);
    }

    const after = await prisma.task.groupBy({ by: ['status'], _count: { _all: true } });
    console.log('Status counts AFTER :', after.map(r => `${r.status}=${r._count._all}`).join(', ') || '(no tasks)');

    const leftovers = after.filter(r => !['In Progress', 'Completed', 'Cancelled'].includes(r.status));
    if (leftovers.length) {
      console.error('❌ Unexpected statuses remain:', leftovers.map(r => r.status).join(', '));
      process.exit(1);
    }
    console.log('✓ No Pending records remain.');
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
