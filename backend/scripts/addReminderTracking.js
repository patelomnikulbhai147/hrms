/**
 * Additive & idempotent — adds `remindersSent` JSON column to `loans` and
 * `compliance_filings` (Phase 3 auto-reminder dedup). Run then `npx prisma generate`.
 *   node scripts/addReminderTracking.js
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
    for (const table of ['loans', 'compliance_filings']) {
      if (await columnExists(table, 'remindersSent')) {
        console.log(`= ${table}.remindersSent already present — nothing to do.`);
      } else {
        await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`remindersSent\` JSON NULL`);
        console.log(`+ added column ${table}.remindersSent`);
      }
    }
    console.log('Done. Run `npx prisma generate` next.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
