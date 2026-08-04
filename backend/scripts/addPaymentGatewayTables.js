/**
 * Self-Service Verification Credit Recharge — additive & idempotent schema.
 *
 * Creates the Cashfree PG payment spine:
 *   payment_orders                  — merchant orders (tenant identity + pricing snapshot)
 *   payment_webhook_events          — every gateway callback, deduped by eventKey
 *   payment_refunds                 — gateway refunds (never auto-deduct credits)
 *   verification_recharge_settings  — Super-Admin pricing config (single GLOBAL row, seeded)
 *   verification_recharge_packages  — quick-pick amounts
 *   verification_recharge_invoices  — recharge tax invoices (one per settled order)
 *
 * NON-destructive: every statement is CREATE TABLE IF NOT EXISTS. No existing
 * table or column is touched. Deliberately NOT `prisma db push` (EC2 landmine).
 *
 *   node scripts/addPaymentGatewayTables.js
 */
const prisma = require('../src/config/prisma');

const TABLES = [
  [
    'payment_orders',
    `CREATE TABLE IF NOT EXISTS \`payment_orders\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`orderId\` VARCHAR(191) NOT NULL,
      \`provider\` VARCHAR(191) NOT NULL DEFAULT 'CASHFREE_PG',
      \`purpose\` VARCHAR(191) NOT NULL DEFAULT 'VERIFICATION_CREDIT_RECHARGE',
      \`cfOrderId\` VARCHAR(191) NULL,
      \`paymentSessionId\` TEXT NULL,
      \`companyId\` INT NOT NULL,
      \`branchId\` INT NULL,
      \`workspaceId\` INT NULL,
      \`workspaceKind\` VARCHAR(191) NULL,
      \`userId\` INT NULL,
      \`userName\` VARCHAR(191) NULL,
      \`userRole\` VARCHAR(191) NULL,
      \`serviceType\` VARCHAR(191) NOT NULL DEFAULT 'BANK_VERIFICATION',
      \`baseAmount\` DOUBLE NOT NULL,
      \`gstEnabled\` BOOLEAN NOT NULL DEFAULT false,
      \`gstPercent\` DOUBLE NOT NULL DEFAULT 0,
      \`gstAmount\` DOUBLE NOT NULL DEFAULT 0,
      \`totalAmount\` DOUBLE NOT NULL,
      \`currency\` VARCHAR(191) NOT NULL DEFAULT 'INR',
      \`sellingPriceSnapshot\` DOUBLE NOT NULL,
      \`providerCostSnapshot\` DOUBLE NOT NULL DEFAULT 0,
      \`creditsPurchased\` INT NOT NULL,
      \`packageId\` INT NULL,
      \`packageName\` VARCHAR(191) NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'CREATED',
      \`settlementStatus\` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
      \`flagReason\` TEXT NULL,
      \`cfPaymentId\` VARCHAR(191) NULL,
      \`paymentMethod\` VARCHAR(191) NULL,
      \`bankReference\` VARCHAR(191) NULL,
      \`paymentTime\` DATETIME(3) NULL,
      \`creditedAt\` DATETIME(3) NULL,
      \`creditLedgerTxId\` VARCHAR(191) NULL,
      \`invoiceId\` INT NULL,
      \`approvedBy\` VARCHAR(191) NULL,
      \`approvedAt\` DATETIME(3) NULL,
      \`rawOrderResponse\` JSON NULL,
      \`rawPaymentResponse\` JSON NULL,
      \`failureReason\` TEXT NULL,
      \`notes\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`payment_orders_orderId_key\` (\`orderId\`),
      INDEX \`payment_orders_companyId_idx\` (\`companyId\`),
      INDEX \`payment_orders_companyId_status_idx\` (\`companyId\`, \`status\`),
      INDEX \`payment_orders_status_settlementStatus_idx\` (\`status\`, \`settlementStatus\`),
      INDEX \`payment_orders_cfOrderId_idx\` (\`cfOrderId\`),
      INDEX \`payment_orders_createdAt_idx\` (\`createdAt\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  ],
  [
    'payment_webhook_events',
    `CREATE TABLE IF NOT EXISTS \`payment_webhook_events\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`provider\` VARCHAR(191) NOT NULL DEFAULT 'CASHFREE_PG',
      \`eventKey\` VARCHAR(191) NOT NULL,
      \`eventType\` VARCHAR(191) NULL,
      \`orderId\` VARCHAR(191) NULL,
      \`cfPaymentId\` VARCHAR(191) NULL,
      \`signatureValid\` BOOLEAN NOT NULL DEFAULT false,
      \`processed\` BOOLEAN NOT NULL DEFAULT false,
      \`processedAt\` DATETIME(3) NULL,
      \`processingResult\` TEXT NULL,
      \`rawPayload\` JSON NULL,
      \`receivedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`payment_webhook_events_eventKey_key\` (\`eventKey\`),
      INDEX \`payment_webhook_events_orderId_idx\` (\`orderId\`),
      INDEX \`payment_webhook_events_receivedAt_idx\` (\`receivedAt\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  ],
  [
    'payment_refunds',
    `CREATE TABLE IF NOT EXISTS \`payment_refunds\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`orderId\` VARCHAR(191) NOT NULL,
      \`cfRefundId\` VARCHAR(191) NULL,
      \`companyId\` INT NOT NULL,
      \`amount\` DOUBLE NOT NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
      \`reason\` TEXT NULL,
      \`creditsAdjusted\` BOOLEAN NOT NULL DEFAULT false,
      \`adjustedBy\` VARCHAR(191) NULL,
      \`adjustedAt\` DATETIME(3) NULL,
      \`rawPayload\` JSON NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`payment_refunds_cfRefundId_key\` (\`cfRefundId\`),
      INDEX \`payment_refunds_orderId_idx\` (\`orderId\`),
      INDEX \`payment_refunds_companyId_idx\` (\`companyId\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  ],
  [
    'verification_recharge_settings',
    `CREATE TABLE IF NOT EXISTS \`verification_recharge_settings\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`scope\` VARCHAR(191) NOT NULL DEFAULT 'GLOBAL',
      \`enableOnlineRecharge\` BOOLEAN NOT NULL DEFAULT false,
      \`sellingPricePerCredit\` DOUBLE NOT NULL DEFAULT 4.0,
      \`providerCostPerCredit\` DOUBLE NOT NULL DEFAULT 2.5,
      \`minRechargeAmount\` DOUBLE NOT NULL DEFAULT 500,
      \`maxRechargeAmount\` DOUBLE NOT NULL DEFAULT 100000,
      \`gstEnabled\` BOOLEAN NOT NULL DEFAULT false,
      \`gstPercent\` DOUBLE NOT NULL DEFAULT 18,
      \`currency\` VARCHAR(191) NOT NULL DEFAULT 'INR',
      \`autoCreditAllocation\` BOOLEAN NOT NULL DEFAULT true,
      \`roundOffPolicy\` VARCHAR(191) NOT NULL DEFAULT 'FLOOR',
      \`updatedBy\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`verification_recharge_settings_scope_key\` (\`scope\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  ],
  [
    'verification_recharge_packages',
    `CREATE TABLE IF NOT EXISTS \`verification_recharge_packages\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`name\` VARCHAR(191) NOT NULL,
      \`amount\` DOUBLE NOT NULL,
      \`description\` VARCHAR(191) NULL,
      \`isActive\` BOOLEAN NOT NULL DEFAULT true,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  ],
  [
    'verification_recharge_invoices',
    `CREATE TABLE IF NOT EXISTS \`verification_recharge_invoices\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`invoiceNo\` VARCHAR(191) NOT NULL,
      \`orderId\` VARCHAR(191) NOT NULL,
      \`companyId\` INT NOT NULL,
      \`companyName\` VARCHAR(191) NULL,
      \`companyEmail\` VARCHAR(191) NULL,
      \`billingAddress\` TEXT NULL,
      \`gstin\` VARCHAR(191) NULL,
      \`creditsPurchased\` INT NOT NULL,
      \`baseAmount\` DOUBLE NOT NULL,
      \`gstPercent\` DOUBLE NOT NULL DEFAULT 0,
      \`gstAmount\` DOUBLE NOT NULL DEFAULT 0,
      \`cgst\` DOUBLE NOT NULL DEFAULT 0,
      \`sgst\` DOUBLE NOT NULL DEFAULT 0,
      \`igst\` DOUBLE NOT NULL DEFAULT 0,
      \`interState\` BOOLEAN NOT NULL DEFAULT false,
      \`totalAmount\` DOUBLE NOT NULL,
      \`currency\` VARCHAR(191) NOT NULL DEFAULT 'INR',
      \`cfPaymentId\` VARCHAR(191) NULL,
      \`paymentMethod\` VARCHAR(191) NULL,
      \`paymentDate\` DATETIME(3) NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'Paid',
      \`createdBy\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`verification_recharge_invoices_invoiceNo_key\` (\`invoiceNo\`),
      UNIQUE INDEX \`verification_recharge_invoices_orderId_key\` (\`orderId\`),
      INDEX \`verification_recharge_invoices_companyId_idx\` (\`companyId\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  ],
];

async function main() {
  console.log('Self-Service Recharge — creating payment gateway tables (additive, idempotent)');
  for (const [name, ddl] of TABLES) {
    await prisma.$executeRawUnsafe(ddl);
    console.log(`  ✓ ${name}`);
  }

  // Seed the single GLOBAL settings row (disabled by default — Super Admin
  // turns online recharge on deliberately after configuring PG credentials).
  const existing = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM \`verification_recharge_settings\` WHERE \`scope\` = 'GLOBAL'`
  );
  if (Number(existing?.[0]?.c || 0) === 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`verification_recharge_settings\` (\`scope\`) VALUES ('GLOBAL')`
    );
    console.log('  + seeded GLOBAL recharge settings row (online recharge OFF by default)');
  } else {
    console.log('  · GLOBAL recharge settings row already present');
  }

  // Seed the default quick-pick packages once (only when the table is empty so
  // Super Admin edits/deletions are never resurrected).
  const pkgCount = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM \`verification_recharge_packages\``
  );
  if (Number(pkgCount?.[0]?.c || 0) === 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`verification_recharge_packages\` (\`name\`, \`amount\`, \`sortOrder\`) VALUES
        ('Starter', 500, 1), ('Growth', 1000, 2), ('Business', 2500, 3), ('Enterprise', 5000, 4), ('Enterprise Plus', 10000, 5)`
    );
    console.log('  + seeded default recharge packages (500 / 1000 / 2500 / 5000 / 10000)');
  } else {
    console.log('  · recharge packages already present');
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
