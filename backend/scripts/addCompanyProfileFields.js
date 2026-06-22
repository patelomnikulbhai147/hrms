/**
 * Additive & idempotent — add Company profile-identity + digital-asset columns
 * used by the merged "Company Profile & Branding" settings tab. NON-destructive;
 * avoids `prisma db push`. Run locally and on prod, then `prisma generate`.
 *   node scripts/addCompanyProfileFields.js
 */
const prisma = require('../src/config/prisma');

// Resolve the REAL table name — case-sensitive on Linux/RDS. The Prisma `Company`
// model has no @@map, so the table is `Company`; hard-coding 'company' fails on
// RDS ("table doesn't exist"). Resolve from information_schema first.
let TABLE = 'company';
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
  { name: 'companyCode',           ddl: 'VARCHAR(191) NULL' },
  { name: 'registrationNumber',    ddl: 'VARCHAR(191) NULL' },
  { name: 'panNumber',             ddl: 'VARCHAR(191) NULL' },
  { name: 'cinNumber',             ddl: 'VARCHAR(191) NULL' },
  { name: 'city',                  ddl: 'VARCHAR(191) NULL' },
  { name: 'state',                 ddl: 'VARCHAR(191) NULL' },
  { name: 'pincode',               ddl: 'VARCHAR(191) NULL' },
  { name: 'emailSignature',        ddl: 'TEXT NULL' },
  { name: 'faviconImage',          ddl: 'LONGTEXT NULL' },
  { name: 'stampImage',            ddl: 'LONGTEXT NULL' },
  { name: 'digitalSignatureImage', ddl: 'LONGTEXT NULL' },
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
