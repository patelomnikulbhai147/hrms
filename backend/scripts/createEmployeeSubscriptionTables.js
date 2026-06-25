/**
 * Additive & idempotent — create the NEW Employee-Based Subscription (Beta) tables
 * if they don't exist. Standalone tables; NEVER touches the existing SubscriptionPlan
 * / Billing system. Uses CREATE TABLE IF NOT EXISTS and seeds one config row.
 *   node scripts/createEmployeeSubscriptionTables.js
 */
const prisma = require('../src/config/prisma');

const DDL = [
`CREATE TABLE IF NOT EXISTS \`EmployeeSubscription\` (
  \`id\`                   INT          NOT NULL AUTO_INCREMENT,
  \`companyId\`            INT          NOT NULL,
  \`employeePrice\`        DOUBLE       NULL,
  \`branchPrice\`          DOUBLE       NULL,
  \`peakEmployeeCount\`    INT          NOT NULL DEFAULT 0,
  \`purchasedBranchSlots\` INT          NOT NULL DEFAULT 1,
  \`discountPercent\`      DOUBLE       NOT NULL DEFAULT 0,
  \`status\`               VARCHAR(191) NOT NULL DEFAULT 'Active',
  \`paymentStatus\`        VARCHAR(191) NOT NULL DEFAULT 'Pending',
  \`validUntil\`           DATETIME(3)  NULL,
  \`createdAt\`            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\`            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`EmployeeSubscription_companyId_key\` (\`companyId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS \`EmployeeSubscriptionConfig\` (
  \`id\`            INT         NOT NULL AUTO_INCREMENT,
  \`employeePrice\` DOUBLE      NOT NULL DEFAULT 100,
  \`branchPrice\`   DOUBLE      NOT NULL DEFAULT 500,
  \`updatedAt\`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

`CREATE TABLE IF NOT EXISTS \`SubscriptionBillingAudit\` (
  \`id\`          INT          NOT NULL AUTO_INCREMENT,
  \`companyId\`   INT          NULL,
  \`companyName\` VARCHAR(191) NULL,
  \`field\`       VARCHAR(191) NOT NULL,
  \`oldValue\`    VARCHAR(191) NULL,
  \`newValue\`    VARCHAR(191) NULL,
  \`changedBy\`   VARCHAR(191) NULL,
  \`reason\`      TEXT         NULL,
  \`createdAt\`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  KEY \`SubscriptionBillingAudit_companyId_idx\` (\`companyId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

(async () => {
  try {
    for (const ddl of DDL) await prisma.$executeRawUnsafe(ddl);
    console.log('+ ensured EmployeeSubscription / EmployeeSubscriptionConfig / SubscriptionBillingAudit tables');
    // Seed the singleton config row once.
    const cfg = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM `EmployeeSubscriptionConfig`');
    if (Number(cfg?.[0]?.c || 0) === 0) {
      await prisma.$executeRawUnsafe('INSERT INTO `EmployeeSubscriptionConfig` (`employeePrice`, `branchPrice`) VALUES (100, 500)');
      console.log('+ seeded default config (employeePrice=100, branchPrice=500)');
    } else {
      console.log('= config row already present — skipped');
    }
    console.log('Done.');
  } catch (e) {
    console.error('Migration failed:', e.message); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
