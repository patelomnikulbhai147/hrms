/**
 * Additive & idempotent — creates the `compliance_documents` table backing the
 * Finance & Compliance → Documents module. A brand-new table (not an ALTER on the
 * row-size-limited Company table), so CREATE TABLE IF NOT EXISTS is safe and
 * non-destructive. Column types mirror the Prisma model (schema.prisma
 * ComplianceDocument). Run then `npx prisma generate`.
 *   node scripts/addComplianceDocuments.js
 */
const prisma = require('../src/config/prisma');

(async () => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compliance_documents'`
    );
    if (Number(rows?.[0]?.c || 0) > 0) {
      console.log('= compliance_documents already present — nothing to do.');
    } else {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE \`compliance_documents\` (
          \`id\`             INT NOT NULL AUTO_INCREMENT,
          \`companyId\`      INT NOT NULL,
          \`branchId\`       INT NULL,
          \`name\`           VARCHAR(191) NOT NULL,
          \`category\`       VARCHAR(191) NOT NULL,
          \`complianceType\` VARCHAR(191) NULL,
          \`employeeId\`     INT NULL,
          \`employeeName\`   VARCHAR(191) NULL,
          \`department\`     VARCHAR(191) NULL,
          \`fileName\`       VARCHAR(191) NULL,
          \`fileData\`       LONGTEXT NULL,
          \`mimeType\`       VARCHAR(191) NULL,
          \`size\`           VARCHAR(191) NULL,
          \`url\`            TEXT NULL,
          \`issueDate\`      VARCHAR(191) NULL,
          \`expiryDate\`     VARCHAR(191) NULL,
          \`description\`    TEXT NULL,
          \`tags\`           VARCHAR(191) NULL,
          \`status\`         VARCHAR(191) NOT NULL DEFAULT 'Pending',
          \`source\`         VARCHAR(191) NOT NULL DEFAULT 'Manual',
          \`sourceRef\`      VARCHAR(191) NULL,
          \`uploadedBy\`     VARCHAR(191) NULL,
          \`uploadedOn\`     VARCHAR(191) NULL,
          \`verifiedBy\`     VARCHAR(191) NULL,
          \`verifiedOn\`     VARCHAR(191) NULL,
          \`editedBy\`       VARCHAR(191) NULL,
          \`editedOn\`       VARCHAR(191) NULL,
          \`history\`        JSON NULL,
          \`createdAt\`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`),
          INDEX \`compliance_documents_companyId_idx\` (\`companyId\`),
          INDEX \`compliance_documents_companyId_category_idx\` (\`companyId\`, \`category\`),
          INDEX \`compliance_documents_companyId_status_idx\` (\`companyId\`, \`status\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('+ created table compliance_documents');
    }
    console.log('Done. Run `npx prisma generate` next.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
