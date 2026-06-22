/**
 * Additive & idempotent — add Employee.state + Employee.city (Personal Info).
 * NON-destructive; avoids `prisma db push`. Run locally and on prod, then
 * `prisma generate` + restart.
 *   node scripts/addEmployeeStateCity.js
 */
const prisma = require('../src/config/prisma');

// Resolve real table name (case-sensitive on Linux/RDS); model `Employee` has no
// @@map, so the table is `Employee`, and hard-coding 'employee' fails on RDS.
let TABLE = 'employee';
async function resolveTable(logicalName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?) LIMIT 1`,
    logicalName,
  );
  if (!rows?.[0]) throw new Error(`Table matching "${logicalName}" not found.`);
  return rows[0].t;
}
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
    TABLE = await resolveTable(TABLE);
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
