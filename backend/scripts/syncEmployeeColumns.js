/**
 * Additive & idempotent — ensures EVERY Employee scalar column from schema.prisma
 * exists on the database. Fixes RDS schema drift where columns added to the schema
 * over time (e.g. biometricId) were never migrated onto production, which makes
 * `employee.findMany()` 500 with "column ... does not exist" and the UI show 0
 * employees. NON-destructive (only ADDs missing columns); never drops anything.
 *   node scripts/syncEmployeeColumns.js
 * Then: npx prisma generate && pm2 reload hrms-backend
 */
const prisma = require('../src/config/prisma');

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
async function columnExists(col) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    TABLE, col,
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

// Every scalar column in the Employee model, with a DDL that matches the Prisma
// type. Pre-existing columns are skipped, so only genuinely-missing ones are
// added. New columns are nullable (or carry a default) so existing rows are safe.
const COLUMNS = [
  { name: 'legacyEmployeeId',  ddl: 'VARCHAR(191) NULL' },
  { name: 'branchId',          ddl: 'INT NULL' },
  { name: 'shiftId',           ddl: 'INT NULL' },
  { name: 'biometricId',       ddl: 'VARCHAR(50) NULL' },
  { name: 'firstName',         ddl: 'VARCHAR(191) NULL' },
  { name: 'lastName',          ddl: 'VARCHAR(191) NULL' },
  { name: 'phone',             ddl: 'VARCHAR(191) NULL' },
  { name: 'role',              ddl: "VARCHAR(191) NOT NULL DEFAULT 'Staff'" },
  { name: 'status',            ddl: "VARCHAR(191) NOT NULL DEFAULT 'Active'" },
  { name: 'exitDate',          ddl: 'DATETIME(3) NULL' },
  { name: 'exitReason',        ddl: 'VARCHAR(191) NULL' },
  { name: 'location',          ddl: 'VARCHAR(191) NULL' },
  { name: 'avatar',            ddl: 'LONGTEXT NULL' },
  { name: 'salary',            ddl: 'DOUBLE NOT NULL DEFAULT 0' },
  { name: 'manager',           ddl: 'VARCHAR(191) NULL' },
  { name: 'pan',               ddl: 'VARCHAR(191) NULL' },
  { name: 'aadhaar',           ddl: 'VARCHAR(191) NULL' },
  { name: 'uan',               ddl: 'VARCHAR(191) NULL' },
  { name: 'pfNumber',          ddl: 'VARCHAR(191) NULL' },
  { name: 'esiNumber',         ddl: 'VARCHAR(191) NULL' },
  { name: 'bankName',          ddl: 'VARCHAR(191) NULL' },
  { name: 'accountNumber',     ddl: 'VARCHAR(191) NULL' },
  { name: 'ifsc',              ddl: 'VARCHAR(191) NULL' },
  { name: 'accountHolderName', ddl: 'VARCHAR(191) NULL' },
  { name: 'bankBranch',        ddl: 'VARCHAR(191) NULL' },
  { name: 'bankAddress',       ddl: 'TEXT NULL' },
  { name: 'bankCity',          ddl: 'VARCHAR(191) NULL' },
  { name: 'bankDistrict',      ddl: 'VARCHAR(191) NULL' },
  { name: 'bankState',         ddl: 'VARCHAR(191) NULL' },
  { name: 'offboardingState',  ddl: 'JSON NULL' },
  { name: 'employmentHistory', ddl: 'JSON NULL' },
  { name: 'documents',         ddl: 'JSON NULL' },
  { name: 'aadhaarName',       ddl: 'VARCHAR(191) NULL' },
  { name: 'aadhaarUpload',     ddl: 'LONGTEXT NULL' },
  { name: 'branchLocation',    ddl: 'VARCHAR(191) NULL' },
  { name: 'category',          ddl: 'VARCHAR(191) NULL' },
  { name: 'dob',               ddl: 'VARCHAR(191) NULL' },
  { name: 'emergencyContact',  ddl: 'VARCHAR(191) NULL' },
  { name: 'employmentType',    ddl: 'VARCHAR(191) NULL' },
  { name: 'fatherSpouseName',  ddl: 'VARCHAR(191) NULL' },
  { name: 'gender',            ddl: 'VARCHAR(191) NULL' },
  { name: 'maritalStatus',     ddl: 'VARCHAR(191) NULL' },
  { name: 'middleName',        ddl: 'VARCHAR(191) NULL' },
  { name: 'nationality',       ddl: 'VARCHAR(191) NULL' },
  { name: 'state',             ddl: 'VARCHAR(191) NULL' },
  { name: 'city',              ddl: 'VARCHAR(191) NULL' },
  { name: 'panUpload',         ddl: 'LONGTEXT NULL' },
  { name: 'permanentAddress',  ddl: 'TEXT NULL' },
  { name: 'photoUpload',       ddl: 'LONGTEXT NULL' },
  { name: 'presentAddress',    ddl: 'TEXT NULL' },
  { name: 'relationType',      ddl: 'VARCHAR(191) NULL' },
  { name: 'signatureUpload',   ddl: 'LONGTEXT NULL' },
  { name: 'bonusApplicable',   ddl: 'TINYINT(1) NOT NULL DEFAULT 0' },
  { name: 'bonusType',         ddl: 'VARCHAR(191) NULL' },
  { name: 'bonusCalcMethod',   ddl: 'VARCHAR(191) NULL' },
  { name: 'bonusValue',        ddl: 'DOUBLE NULL' },
  { name: 'bonusEffectiveDate',ddl: 'DATETIME(3) NULL' },
  { name: 'bonusEndDate',      ddl: 'DATETIME(3) NULL' },
  { name: 'bonusNotes',        ddl: 'TEXT NULL' },
];

(async () => {
  try {
    TABLE = await resolveTable(TABLE);
    console.log(`==> Syncing columns on \`${TABLE}\` (idempotent)`);
    let added = 0;
    for (const { name, ddl } of COLUMNS) {
      if (await columnExists(name)) continue;
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` ADD COLUMN \`${name}\` ${ddl}`);
      console.log(`+ added ${TABLE}.${name}`); added++;
    }
    console.log(added ? `\n✅ ${added} missing column(s) added.` : '\n= No missing columns — already in sync.');
  } catch (e) {
    console.error('Migration failed:', e.message); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
