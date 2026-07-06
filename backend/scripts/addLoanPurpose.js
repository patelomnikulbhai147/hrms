/**
 * Additive & idempotent — adds `purpose` TEXT column to `loans` (the Reason /
 * purpose a loan or salary advance is requested for, distinct from `remarks`).
 * Run then `npx prisma generate`.
 *   node scripts/addLoanPurpose.js
 */
const prisma = require('../src/config/prisma');

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, column
  );
  return Number(rows?.[0]?.n || 0) > 0;
}

(async () => {
  try {
    if (await columnExists('loans', 'purpose')) {
      console.log('= loans.purpose already present — nothing to do.');
    } else {
      await prisma.$executeRawUnsafe('ALTER TABLE `loans` ADD COLUMN `purpose` TEXT NULL');
      console.log('+ added column loans.purpose');
    }
    console.log('Done. Run `npx prisma generate` next.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
