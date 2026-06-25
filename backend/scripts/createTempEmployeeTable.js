/**
 * Additive & idempotent — create the `TemporaryEmployee` table if it does not
 * exist (e.g. on a production DB that predates the temp-employee feature).
 * Mirrors the Prisma model in schema.prisma exactly, INCLUDING the later
 * self-onboarding (`selfProfile`) and approval-workflow audit columns, so the
 * column-adder scripts then have nothing left to do. NON-destructive: uses
 * CREATE TABLE IF NOT EXISTS and never alters/drops an existing table.
 *   node scripts/createTempEmployeeTable.js
 */
const prisma = require('../src/config/prisma');

const DDL = `
CREATE TABLE IF NOT EXISTS \`TemporaryEmployee\` (
  \`id\`                    INT          NOT NULL AUTO_INCREMENT,
  \`tempEmployeeId\`        VARCHAR(191) NOT NULL,
  \`companyId\`             INT          NOT NULL,
  \`branchId\`              INT          NULL,
  \`branchLocation\`        VARCHAR(191) NULL,
  \`name\`                  VARCHAR(191) NOT NULL,
  \`mobile\`                VARCHAR(191) NOT NULL,
  \`department\`            VARCHAR(191) NULL,
  \`designation\`           VARCHAR(191) NULL,
  \`email\`                 VARCHAR(191) NULL,
  \`status\`                VARCHAR(191) NOT NULL DEFAULT 'Pending Profile',
  \`dob\`                   VARCHAR(191) NULL,
  \`gender\`                VARCHAR(191) NULL,
  \`fatherSpouseName\`      VARCHAR(191) NULL,
  \`aadhaar\`               VARCHAR(191) NULL,
  \`pan\`                   VARCHAR(191) NULL,
  \`bankName\`              VARCHAR(191) NULL,
  \`accountNumber\`         VARCHAR(191) NULL,
  \`ifsc\`                  VARCHAR(191) NULL,
  \`presentAddress\`        TEXT         NULL,
  \`permanentAddress\`      TEXT         NULL,
  \`nominee\`               JSON         NULL,
  \`emergencyContact\`      VARCHAR(191) NULL,
  \`education\`             JSON         NULL,
  \`experience\`            JSON         NULL,
  \`photoUpload\`           LONGTEXT     NULL,
  \`documents\`             JSON         NULL,
  \`selfProfile\`           JSON         NULL,
  \`profileCompletion\`     INT          NOT NULL DEFAULT 0,
  \`convertedEmployeeId\`   INT          NULL,
  \`convertedEmployeeCode\` VARCHAR(191) NULL,
  \`convertedAt\`           DATETIME(3)  NULL,
  \`rejectedReason\`        VARCHAR(191) NULL,
  \`submittedBy\`           VARCHAR(191) NULL,
  \`submittedAt\`           DATETIME(3)  NULL,
  \`approvedBy\`            VARCHAR(191) NULL,
  \`approvedAt\`            DATETIME(3)  NULL,
  \`rejectedBy\`            VARCHAR(191) NULL,
  \`rejectedAt\`            DATETIME(3)  NULL,
  \`changeRequestNote\`     TEXT         NULL,
  \`changeRequestBy\`       VARCHAR(191) NULL,
  \`changeRequestAt\`       DATETIME(3)  NULL,
  \`createdBy\`             VARCHAR(191) NULL,
  \`createdAt\`             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\`             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`TemporaryEmployee_tempEmployeeId_key\` (\`tempEmployeeId\`),
  KEY \`TemporaryEmployee_companyId_idx\` (\`companyId\`),
  KEY \`TemporaryEmployee_branchId_idx\` (\`branchId\`),
  KEY \`TemporaryEmployee_status_idx\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function tableExists(name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)`,
    name,
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

(async () => {
  try {
    const existedBefore = await tableExists('TemporaryEmployee');
    if (existedBefore) {
      console.log('= TemporaryEmployee already exists — nothing to create (run the column-adder scripts to top up).');
    } else {
      await prisma.$executeRawUnsafe(DDL);
      console.log('+ created TemporaryEmployee table (with selfProfile + approval audit columns).');
    }
  } catch (e) {
    console.error('Create failed:', e.message); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
