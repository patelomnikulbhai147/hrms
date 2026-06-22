/**
 * Additive & idempotent — Tenders & Contracts module (Phase 1).
 *   1. extends Tender with lifecycle columns (clientName, branchId, serviceType,
 *      startDate, endDate, remarks, convertedContractId),
 *   2. creates contracts / contract_sites / deployments tables.
 * NON-destructive; avoids `prisma db push`. Run locally and on prod, then
 * `prisma generate` + restart.
 *   node scripts/createTendersContracts.js
 */
const prisma = require('../src/config/prisma');

let TENDER = 'Tender';
async function resolveTable(logicalName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?) LIMIT 1`,
    logicalName,
  );
  if (!rows?.[0]) throw new Error(`Table matching "${logicalName}" not found.`);
  return rows[0].t;
}
async function columnExists(table, col) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, col,
  );
  return Number(rows?.[0]?.c || 0) > 0;
}
async function addCol(table, col, ddl) {
  if (await columnExists(table, col)) { console.log(`= ${table}.${col} exists — skipped`); return; }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${ddl}`);
  console.log(`+ added ${table}.${col}`);
}

(async () => {
  try {
    TENDER = await resolveTable(TENDER);

    console.log('==> Extending Tender with lifecycle columns');
    await addCol(TENDER, 'clientName', 'VARCHAR(191) NULL');
    await addCol(TENDER, 'branchId', 'INT NULL');
    await addCol(TENDER, 'serviceType', 'VARCHAR(191) NULL');
    await addCol(TENDER, 'startDate', 'VARCHAR(191) NULL');
    await addCol(TENDER, 'endDate', 'VARCHAR(191) NULL');
    await addCol(TENDER, 'remarks', 'TEXT NULL');
    await addCol(TENDER, 'convertedContractId', 'INT NULL');

    console.log('==> Creating contracts table');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`contracts\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`contractNumber\` VARCHAR(191) NULL,
        \`contractName\` VARCHAR(191) NOT NULL,
        \`clientName\` VARCHAR(191) NULL,
        \`companyId\` INT NOT NULL,
        \`branchId\` INT NULL,
        \`tenderId\` INT NULL,
        \`contractValue\` DOUBLE NOT NULL DEFAULT 0,
        \`startDate\` VARCHAR(191) NULL,
        \`endDate\` VARCHAR(191) NULL,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'Active',
        \`documentPath\` TEXT NULL,
        \`notes\` TEXT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`contracts_tenderId_key\` (\`tenderId\`),
        INDEX \`contracts_companyId_idx\` (\`companyId\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('= contracts ready');

    console.log('==> Creating contract_sites table');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`contract_sites\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`contractId\` INT NOT NULL,
        \`companyId\` INT NOT NULL,
        \`siteName\` VARCHAR(191) NOT NULL,
        \`siteAddress\` TEXT NULL,
        \`siteSupervisor\` VARCHAR(191) NULL,
        \`requiredHeadcount\` INT NOT NULL DEFAULT 0,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'Active',
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`contract_sites_contractId_idx\` (\`contractId\`),
        INDEX \`contract_sites_companyId_idx\` (\`companyId\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('= contract_sites ready');

    console.log('==> Creating deployments table');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`deployments\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`contractId\` INT NOT NULL,
        \`siteId\` INT NOT NULL,
        \`employeeId\` INT NOT NULL,
        \`companyId\` INT NOT NULL,
        \`roleAtSite\` VARCHAR(191) NULL,
        \`assignmentDate\` VARCHAR(191) NULL,
        \`releaseDate\` VARCHAR(191) NULL,
        \`allocationPercent\` INT NOT NULL DEFAULT 100,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'Assigned',
        \`notes\` TEXT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`deployments_contractId_idx\` (\`contractId\`),
        INDEX \`deployments_siteId_idx\` (\`siteId\`),
        INDEX \`deployments_employeeId_idx\` (\`employeeId\`),
        INDEX \`deployments_companyId_idx\` (\`companyId\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('= deployments ready');

    console.log('\n✅ Tenders & Contracts schema ready. Run: npx prisma generate  then restart.');
  } catch (e) {
    console.error('Migration failed:', e.message); process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
