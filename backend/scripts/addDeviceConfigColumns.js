/**
 * Phase 2 — additively add device-configuration columns to `attendance_devices`.
 *
 * Idempotent and NON-destructive: each column is added only if missing. This
 * intentionally avoids `prisma db push`, which would also apply unrelated
 * destructive drops that exist in the schema-vs-DB drift. Safe to run on local
 * and (with the production DATABASE_URL) on RDS.
 *
 *   node scripts/addDeviceConfigColumns.js
 */
const prisma = require('../src/config/prisma');

const TABLE = 'attendance_devices';
const COLUMNS = [
  { name: 'attendanceVendor', ddl: 'VARCHAR(191) NULL' },
  { name: 'corporateId',      ddl: 'VARCHAR(191) NULL' },
  { name: 'apiUsername',      ddl: 'VARCHAR(191) NULL' },
  { name: 'apiPassword',      ddl: 'TEXT NULL' },
  { name: 'deviceLocation',   ddl: 'VARCHAR(191) NULL' },
  { name: 'syncEnabled',      ddl: 'TINYINT(1) NOT NULL DEFAULT 0' },
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
      if (await columnExists(name)) {
        console.log(`= ${TABLE}.${name} already exists — skipped`);
        continue;
      }
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` ADD COLUMN \`${name}\` ${ddl}`);
      console.log(`+ added ${TABLE}.${name} (${ddl})`);
      added++;
    }
    console.log(`Done. ${added} column(s) added.`);
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
