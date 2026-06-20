/**
 * Bonus Management foundation — additive & idempotent. NON-destructive.
 * Creates the 6 bonus tables (separate bonus transaction system). Avoids
 * `prisma db push`. Run locally and on prod, then `prisma generate` + restart.
 *   node scripts/addBonusModule.js
 */
const prisma = require('../src/config/prisma');

const TABLES = [
  `CREATE TABLE IF NOT EXISTS \`bonus_configurations\` (
     \`id\` INT NOT NULL AUTO_INCREMENT,
     \`companyId\` INT NOT NULL,
     \`bonusType\` VARCHAR(191) NOT NULL,
     \`financialYear\` VARCHAR(191) NOT NULL,
     \`minBonusPercent\` DOUBLE NOT NULL DEFAULT 8.33,
     \`maxBonusPercent\` DOUBLE NOT NULL DEFAULT 20,
     \`salaryCeiling\` DOUBLE NULL,
     \`minWorkingDays\` INT NOT NULL DEFAULT 30,
     \`includeLeaveDays\` TINYINT(1) NOT NULL DEFAULT 1,
     \`includeOvertime\` TINYINT(1) NOT NULL DEFAULT 0,
     \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
     \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     INDEX \`bonus_configurations_companyId_idx\`(\`companyId\`),
     INDEX \`bonus_configurations_companyId_financialYear_idx\`(\`companyId\`, \`financialYear\`),
     PRIMARY KEY (\`id\`)
   ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS \`bonus_cycles\` (
     \`id\` INT NOT NULL AUTO_INCREMENT,
     \`companyId\` INT NOT NULL,
     \`configId\` INT NULL,
     \`name\` VARCHAR(191) NOT NULL,
     \`bonusType\` VARCHAR(191) NOT NULL,
     \`financialYear\` VARCHAR(191) NOT NULL,
     \`status\` VARCHAR(191) NOT NULL DEFAULT 'Draft',
     \`totalAmount\` DOUBLE NOT NULL DEFAULT 0,
     \`employeeCount\` INT NOT NULL DEFAULT 0,
     \`generatedBy\` INT NULL, \`approvedBy\` INT NULL, \`releasedBy\` INT NULL,
     \`generatedAt\` DATETIME(3) NULL, \`approvedAt\` DATETIME(3) NULL, \`paidAt\` DATETIME(3) NULL,
     \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     INDEX \`bonus_cycles_companyId_idx\`(\`companyId\`),
     INDEX \`bonus_cycles_status_idx\`(\`status\`),
     PRIMARY KEY (\`id\`)
   ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS \`bonus_eligibility\` (
     \`id\` INT NOT NULL AUTO_INCREMENT,
     \`cycleId\` INT NOT NULL, \`companyId\` INT NOT NULL, \`employeeId\` INT NOT NULL,
     \`workingDays\` INT NOT NULL DEFAULT 0,
     \`eligibilityStatus\` VARCHAR(191) NOT NULL DEFAULT 'Pending Verification',
     \`reason\` TEXT NULL,
     \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     INDEX \`bonus_eligibility_cycleId_idx\`(\`cycleId\`),
     INDEX \`bonus_eligibility_companyId_idx\`(\`companyId\`),
     PRIMARY KEY (\`id\`)
   ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS \`bonus_calculations\` (
     \`id\` INT NOT NULL AUTO_INCREMENT,
     \`cycleId\` INT NOT NULL, \`companyId\` INT NOT NULL, \`employeeId\` INT NOT NULL,
     \`eligibleSalary\` DOUBLE NOT NULL DEFAULT 0,
     \`bonusPercent\` DOUBLE NOT NULL DEFAULT 0,
     \`bonusAmount\` DOUBLE NOT NULL DEFAULT 0,
     \`isManualOverride\` TINYINT(1) NOT NULL DEFAULT 0,
     \`overrideBy\` INT NULL, \`notes\` TEXT NULL,
     \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     INDEX \`bonus_calculations_cycleId_idx\`(\`cycleId\`),
     INDEX \`bonus_calculations_companyId_idx\`(\`companyId\`),
     PRIMARY KEY (\`id\`)
   ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS \`bonus_payments\` (
     \`id\` INT NOT NULL AUTO_INCREMENT,
     \`cycleId\` INT NOT NULL, \`companyId\` INT NOT NULL, \`employeeId\` INT NOT NULL,
     \`amount\` DOUBLE NOT NULL DEFAULT 0,
     \`paymentDate\` DATETIME(3) NULL,
     \`paymentMode\` VARCHAR(191) NULL, \`reference\` VARCHAR(191) NULL,
     \`status\` VARCHAR(191) NOT NULL DEFAULT 'Pending',
     \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     INDEX \`bonus_payments_cycleId_idx\`(\`cycleId\`),
     INDEX \`bonus_payments_companyId_idx\`(\`companyId\`),
     PRIMARY KEY (\`id\`)
   ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS \`bonus_audit_logs\` (
     \`id\` INT NOT NULL AUTO_INCREMENT,
     \`companyId\` INT NOT NULL, \`cycleId\` INT NULL,
     \`entityType\` VARCHAR(191) NOT NULL, \`entityId\` INT NULL,
     \`action\` VARCHAR(191) NOT NULL,
     \`performedBy\` INT NULL, \`performedByName\` VARCHAR(191) NULL,
     \`details\` TEXT NULL,
     \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     INDEX \`bonus_audit_logs_companyId_idx\`(\`companyId\`),
     INDEX \`bonus_audit_logs_cycleId_idx\`(\`cycleId\`),
     PRIMARY KEY (\`id\`)
   ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
];

(async () => {
  try {
    for (const ddl of TABLES) {
      const name = ddl.match(/EXISTS `([^`]+)`/)[1];
      await prisma.$executeRawUnsafe(ddl);
      console.log(`= ${name} ready`);
    }
    console.log('Done. Bonus module tables ready.');
  } catch (e) {
    console.error('Migration failed:', e.message); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
