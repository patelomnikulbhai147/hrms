/**
 * Additive & idempotent — create compliance_report_logs (audit trail for the
 * Government Compliance Reports module). NON-destructive; avoids `prisma db push`.
 *   node scripts/addComplianceReportLogs.js
 */
const prisma = require('../src/config/prisma');

(async () => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`compliance_report_logs\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`companyId\` INT NOT NULL,
        \`reportKey\` VARCHAR(191) NOT NULL,
        \`reportName\` VARCHAR(191) NOT NULL,
        \`action\` VARCHAR(191) NOT NULL,
        \`format\` VARCHAR(191) NULL,
        \`filters\` TEXT NULL,
        \`rowCount\` INT NOT NULL DEFAULT 0,
        \`performedBy\` INT NULL,
        \`performedByName\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`compliance_report_logs_companyId_idx\`(\`companyId\`),
        INDEX \`compliance_report_logs_reportKey_idx\`(\`reportKey\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('= compliance_report_logs ready');
  } catch (e) {
    console.error('Migration failed:', e.message); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
