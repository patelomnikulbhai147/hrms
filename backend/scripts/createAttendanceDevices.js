/**
 * Additive & idempotent — creates the `attendance_devices` base table if it is
 * missing (RDS drift: the table was never created on production, which makes the
 * vendor/config migrations fail with "Table doesn't exist"). NON-destructive.
 *   node scripts/createAttendanceDevices.js
 * The subsequent vendor/config scripts then find their columns already present.
 */
const prisma = require('../src/config/prisma');

(async () => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`attendance_devices\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`companyId\` INT NOT NULL,
        \`branchId\` INT NULL,
        \`deviceName\` VARCHAR(191) NOT NULL,
        \`deviceIp\` VARCHAR(191) NULL,
        \`port\` INT NULL,
        \`serialNumber\` VARCHAR(191) NULL,
        \`deviceType\` VARCHAR(191) NULL,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
        \`lastSync\` DATETIME(3) NULL,
        \`lastTestAt\` DATETIME(3) NULL,
        \`lastTestStatus\` VARCHAR(191) NULL,
        \`lastTestResponseMs\` INT NULL,
        \`attendanceVendor\` VARCHAR(191) NULL,
        \`apiBaseUrl\` TEXT NULL,
        \`corporateId\` VARCHAR(191) NULL,
        \`apiUsername\` VARCHAR(191) NULL,
        \`apiPassword\` TEXT NULL,
        \`deviceLocation\` VARCHAR(191) NULL,
        \`syncEnabled\` TINYINT(1) NOT NULL DEFAULT 0,
        \`syncIntervalMinutes\` INT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`attendance_devices_companyId_idx\` (\`companyId\`),
        INDEX \`attendance_devices_branchId_idx\` (\`branchId\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('= attendance_devices ready');
  } catch (e) {
    console.error('Migration failed:', e.message); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
