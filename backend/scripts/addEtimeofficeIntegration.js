/**
 * Additive & idempotent — creates the E-TimeOffice pull-API integration tables
 * (etimeoffice_connections, attendance_sync_logs) and seeds the "E-TimeOffice"
 * vendor row. NON-destructive; avoids `prisma db push` (which drops columns on
 * drift). Run locally and on prod, then `npx prisma generate`.
 *   node scripts/addEtimeofficeIntegration.js
 */
const prisma = require('../src/config/prisma');

// CREATE TABLE IF NOT EXISTS — column names MUST match the Prisma field names
// (Prisma maps camelCase fields to camelCase columns; @@map only renames the
// table). DATETIME(3) + CURRENT_TIMESTAMP(3) mirror Prisma's now() defaults.
const CREATE_CONNECTIONS = `
CREATE TABLE IF NOT EXISTS \`etimeoffice_connections\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`enabled\` TINYINT(1) NOT NULL DEFAULT 0,
  \`apiBaseUrl\` VARCHAR(191) NOT NULL DEFAULT 'https://api.etimeoffice.com/api/',
  \`corporateId\` VARCHAR(191) NULL,
  \`apiUsername\` VARCHAR(191) NULL,
  \`apiPassword\` TEXT NULL,
  \`empCode\` VARCHAR(191) NOT NULL DEFAULT 'ALL',
  \`syncIntervalMinutes\` INT NOT NULL DEFAULT 30,
  \`syncWindowDays\` INT NOT NULL DEFAULT 2,
  \`lastCursor\` VARCHAR(191) NULL,
  \`lastSyncAt\` DATETIME(3) NULL,
  \`lastSyncStatus\` VARCHAR(191) NULL,
  \`connectionStatus\` VARCHAR(191) NOT NULL DEFAULT 'not_connected',
  \`lastTestAt\` DATETIME(3) NULL,
  \`lastTestStatus\` VARCHAR(191) NULL,
  \`lastTestResponseMs\` INT NULL,
  \`lastError\` TEXT NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`etimeoffice_connections_companyId_key\` (\`companyId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const CREATE_SYNC_LOGS = `
CREATE TABLE IF NOT EXISTS \`attendance_sync_logs\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`source\` VARCHAR(191) NOT NULL DEFAULT 'E-TimeOffice',
  \`trigger\` VARCHAR(191) NOT NULL DEFAULT 'manual',
  \`status\` VARCHAR(191) NOT NULL DEFAULT 'RUNNING',
  \`startedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`endedAt\` DATETIME(3) NULL,
  \`durationMs\` INT NULL,
  \`fetched\` INT NOT NULL DEFAULT 0,
  \`imported\` INT NOT NULL DEFAULT 0,
  \`updated\` INT NOT NULL DEFAULT 0,
  \`skipped\` INT NOT NULL DEFAULT 0,
  \`duplicates\` INT NOT NULL DEFAULT 0,
  \`unmatched\` INT NOT NULL DEFAULT 0,
  \`failed\` INT NOT NULL DEFAULT 0,
  \`httpStatus\` INT NULL,
  \`windowFrom\` VARCHAR(191) NULL,
  \`windowTo\` VARCHAR(191) NULL,
  \`errorMessage\` TEXT NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  KEY \`attendance_sync_logs_companyId_idx\` (\`companyId\`),
  KEY \`attendance_sync_logs_status_idx\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

// Additive columns merged from the retired Attendance Devices module. Idempotent
// (skips any that already exist) so this script is safe to re-run on every deploy.
const CONNECTION_COLUMNS = [
  { name: 'vendor', ddl: "VARCHAR(191) NOT NULL DEFAULT 'E-TimeOffice'" },
  { name: 'branchId', ddl: 'INT NULL' },
  { name: 'deviceSerialNumber', ddl: 'VARCHAR(191) NULL' },
  { name: 'deviceLocation', ddl: 'VARCHAR(191) NULL' },
];

async function columnExists(table, col) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, col,
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

(async () => {
  try {
    await prisma.$executeRawUnsafe(CREATE_CONNECTIONS);
    console.log('+ ensured table etimeoffice_connections');
    await prisma.$executeRawUnsafe(CREATE_SYNC_LOGS);
    console.log('+ ensured table attendance_sync_logs');

    for (const { name, ddl } of CONNECTION_COLUMNS) {
      if (await columnExists('etimeoffice_connections', name)) { console.log(`= etimeoffice_connections.${name} exists — skipped`); continue; }
      await prisma.$executeRawUnsafe(`ALTER TABLE \`etimeoffice_connections\` ADD COLUMN \`${name}\` ${ddl}`);
      console.log(`+ added etimeoffice_connections.${name}`);
    }

    // Seed the E-TimeOffice vendor row (idempotent — name is unique).
    const existing = await prisma.attendanceVendor.findFirst({ where: { name: 'E-TimeOffice' } });
    if (existing) {
      console.log('= vendor "E-TimeOffice" already present — skipped');
    } else {
      await prisma.attendanceVendor.create({
        data: {
          name: 'E-TimeOffice',
          displayName: 'E-TimeOffice (Cloud Attendance API)',
          defaultBaseUrl: 'https://api.etimeoffice.com/api/',
          authType: 'BASIC',
          isActive: true,
          notes: 'Pull-based attendance sync via the documented E-TimeOffice REST API (Basic auth: Corporateid:Username:Password:True).',
          sortOrder: 0,
        },
      });
      console.log('+ seeded vendor "E-TimeOffice"');
    }

    console.log('Done. Run `npx prisma generate` next.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
