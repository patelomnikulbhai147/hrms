/**
 * Vendor architecture migration — additive & idempotent. NON-destructive.
 *
 *  1. adds attendance_devices.apiBaseUrl + syncIntervalMinutes (if missing),
 *  2. creates the attendance_vendors registry table (if missing),
 *  3. seeds the known vendors (INSERT IGNORE — never overwrites edits).
 *
 * Deliberately avoids `prisma db push` (which would also apply unrelated
 * destructive drops from the schema-vs-DB drift). Run locally and on prod:
 *   node scripts/addVendorArchitecture.js
 */
const prisma = require('../src/config/prisma');

async function columnExists(table, col) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, col,
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function addColumn(table, col, ddl) {
  if (await columnExists(table, col)) { console.log(`= ${table}.${col} exists — skipped`); return; }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${ddl}`);
  console.log(`+ added ${table}.${col}`);
}

// Default seed catalog. defaultBaseUrl is CONFIG DATA (editable later via the
// vendor API), not application logic. eSSL/Matrix/ZKTeco/BioMax are typically
// on-prem (no cloud base URL) → left null for the admin to fill in.
const VENDOR_SEED = [
  { name: 'E-TimeOffice', displayName: 'E-TimeOffice (Pulpit Mobility)', defaultBaseUrl: 'https://api.etimeoffice.com/api/', authType: 'BASIC', sortOrder: 1 },
  { name: 'eSSL',    displayName: 'eSSL',    defaultBaseUrl: null, authType: 'BASIC', sortOrder: 2 },
  { name: 'Matrix',  displayName: 'Matrix',  defaultBaseUrl: null, authType: 'BASIC', sortOrder: 3 },
  { name: 'ZKTeco',  displayName: 'ZKTeco',  defaultBaseUrl: null, authType: 'BASIC', sortOrder: 4 },
  { name: 'BioMax',  displayName: 'BioMax',  defaultBaseUrl: null, authType: 'BASIC', sortOrder: 5 },
  { name: 'Other',   displayName: 'Other',   defaultBaseUrl: null, authType: 'NONE',  sortOrder: 99 },
];

(async () => {
  try {
    // 1) device columns
    await addColumn('attendance_devices', 'apiBaseUrl', 'TEXT NULL');
    await addColumn('attendance_devices', 'syncIntervalMinutes', 'INT NULL');

    // 2) vendor registry table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`attendance_vendors\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(191) NOT NULL,
        \`displayName\` VARCHAR(191) NULL,
        \`defaultBaseUrl\` TEXT NULL,
        \`authType\` VARCHAR(191) NULL,
        \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
        \`notes\` TEXT NULL,
        \`settings\` LONGTEXT NULL,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`attendance_vendors_name_key\`(\`name\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('= attendance_vendors table ready');

    // 3) seed (INSERT IGNORE preserves any admin edits / never duplicates)
    let seeded = 0;
    for (const v of VENDOR_SEED) {
      const r = await prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO \`attendance_vendors\`
         (\`name\`, \`displayName\`, \`defaultBaseUrl\`, \`authType\`, \`isActive\`, \`sortOrder\`, \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, ?, ?, 1, ?, NOW(3), NOW(3))`,
        v.name, v.displayName, v.defaultBaseUrl, v.authType, v.sortOrder,
      );
      if (Number(r) > 0) { seeded++; console.log(`+ seeded vendor "${v.name}"`); }
      else console.log(`= vendor "${v.name}" already present — kept`);
    }
    console.log(`Done. ${seeded} vendor(s) seeded.`);
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
