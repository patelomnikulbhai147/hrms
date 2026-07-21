// Additive, idempotent migration for the Super Admin interactive Invoice Editor:
//   • SubscriptionInvoice: lineItems / pan / contactPerson / companyPhone /
//     bankDetails / roundOff / editUnlocked / finalizedAt  (all nullable or defaulted)
//   • subscription_invoice_audit: the per-field edit trail
// Only ADDs columns and a new table — never drops or renames, and never runs
// `prisma db push` (per this repo's drift landmines). Safe to run repeatedly:
//   node scripts/addInvoiceEditorFields.js
const prisma = require('../src/config/prisma');

const COLUMNS = [
  ['lineItems', 'JSON NULL'],
  ['pan', 'VARCHAR(191) NULL'],
  ['contactPerson', 'VARCHAR(191) NULL'],
  ['companyPhone', 'VARCHAR(191) NULL'],
  ['bankDetails', 'TEXT NULL'],
  ['roundOff', 'DOUBLE NOT NULL DEFAULT 0'],
  ['editUnlocked', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['finalizedAt', 'DATETIME(3) NULL'],
];

(async () => {
  try {
    for (const [name, ddl] of COLUMNS) {
      const [{ n }] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS n FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'SubscriptionInvoice' AND column_name = ?`,
        name
      );
      if (Number(n) > 0) { console.log(`SubscriptionInvoice.${name} already exists — skipped.`); continue; }
      await prisma.$executeRawUnsafe(`ALTER TABLE \`SubscriptionInvoice\` ADD COLUMN \`${name}\` ${ddl}`);
      console.log(`Added SubscriptionInvoice.${name} (${ddl}).`);
    }

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`subscription_invoice_audit\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`invoiceId\` INT NOT NULL,
        \`invoiceNo\` VARCHAR(191) NULL,
        \`field\` VARCHAR(191) NOT NULL,
        \`oldValue\` TEXT NULL,
        \`newValue\` TEXT NULL,
        \`action\` VARCHAR(191) NOT NULL DEFAULT 'EDIT',
        \`reason\` TEXT NULL,
        \`changedBy\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`subscription_invoice_audit_invoiceId_idx\` (\`invoiceId\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('subscription_invoice_audit table ready (created if missing).');
  } catch (e) {
    console.error('Failed to add invoice editor fields:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
