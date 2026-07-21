// Additive, idempotent migration: create the ecr_history table for the isolated
// EPFO ECR Generation report. Safe to run repeatedly and safe on live data — it
// only CREATEs a new table (never db push, per this repo's drift landmines). Run
// after pulling the schema change and before restarting the backend:
//   node scripts/addEcrHistoryTable.js
const prisma = require('../src/config/prisma');

(async () => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ecr_history\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`companyId\` INT NOT NULL,
        \`companyName\` VARCHAR(191) NULL,
        \`branchId\` INT NULL,
        \`branchName\` VARCHAR(191) NULL,
        \`month\` VARCHAR(191) NOT NULL,
        \`year\` INT NOT NULL,
        \`department\` VARCHAR(191) NULL,
        \`employeeStatus\` VARCHAR(191) NULL,
        \`employeeCount\` INT NOT NULL DEFAULT 0,
        \`totalEmployees\` INT NOT NULL DEFAULT 0,
        \`fileName\` VARCHAR(191) NULL,
        \`fileContent\` LONGTEXT NULL,
        \`generatedBy\` VARCHAR(191) NULL,
        \`generatedByName\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`ecr_history_companyId_idx\` (\`companyId\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('ecr_history table ready (created if missing).');
  } catch (e) {
    console.error('Failed to create ecr_history:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
