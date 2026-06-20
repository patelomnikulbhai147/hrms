/**
 * Additive & idempotent — add Employee.state + Employee.city (Personal Info).
 * NON-destructive; avoids `prisma db push`. Run locally and on prod, then
 * `prisma generate` + restart.
 *   node scripts/addEmployeeStateCity.js
 */
const prisma = require('../src/config/prisma');

const TABLE = 'employee';
const COLUMNS = [
  { name: 'state', ddl: 'VARCHAR(191) NULL' },
  { name: 'city',  ddl: 'VARCHAR(191) NULL' },
];

async function columnExists(col) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    TABLE, col,
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

(async () => {
  try {
    let added = 0;
    for (const { name, ddl } of COLUMNS) {
      if (await columnExists(name)) { console.log(`= ${TABLE}.${name} exists — skipped`); continue; }
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` ADD COLUMN \`${name}\` ${ddl}`);
      console.log(`+ added ${TABLE}.${name}`); added++;
    }
    console.log(`Done. ${added} column(s) added.`);
  } catch (e) {
    console.error('Migration failed:', e.message); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
