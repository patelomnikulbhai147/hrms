/**
 * Additive & idempotent — creates the Invoice Management tables. NON-destructive;
 * avoids `prisma db push` (which drops columns on drift). Run locally and on prod,
 * then `npx prisma generate`.
 *   node scripts/addInvoiceModule.js
 */
const prisma = require('../src/config/prisma');

const TABLES = [
`CREATE TABLE IF NOT EXISTS \`invoice_customers\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`companyName\` VARCHAR(191) NOT NULL,
  \`contactPerson\` VARCHAR(191) NULL,
  \`gstin\` VARCHAR(191) NULL,
  \`pan\` VARCHAR(191) NULL,
  \`email\` VARCHAR(191) NULL,
  \`phone\` VARCHAR(191) NULL,
  \`addressLine\` TEXT NULL,
  \`city\` VARCHAR(191) NULL,
  \`state\` VARCHAR(191) NULL,
  \`country\` VARCHAR(191) NULL DEFAULT 'India',
  \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
  \`notes\` TEXT NULL,
  \`createdBy\` VARCHAR(191) NULL,
  \`updatedBy\` VARCHAR(191) NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  KEY \`invoice_customers_companyId_idx\` (\`companyId\`),
  KEY \`invoice_customers_companyId_isActive_idx\` (\`companyId\`, \`isActive\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

`CREATE TABLE IF NOT EXISTS \`invoice_products\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`name\` VARCHAR(191) NOT NULL,
  \`hsnSac\` VARCHAR(191) NULL,
  \`description\` TEXT NULL,
  \`unit\` VARCHAR(191) NULL DEFAULT 'Nos',
  \`rate\` DOUBLE NOT NULL DEFAULT 0,
  \`taxRate\` DOUBLE NOT NULL DEFAULT 0,
  \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
  \`createdBy\` VARCHAR(191) NULL,
  \`updatedBy\` VARCHAR(191) NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  KEY \`invoice_products_companyId_idx\` (\`companyId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

`CREATE TABLE IF NOT EXISTS \`invoices\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`invoiceNumber\` VARCHAR(191) NOT NULL,
  \`customerId\` INT NULL,
  \`billToName\` VARCHAR(191) NOT NULL,
  \`billToGstin\` VARCHAR(191) NULL,
  \`billToAddress\` TEXT NULL,
  \`billToEmail\` VARCHAR(191) NULL,
  \`billToPhone\` VARCHAR(191) NULL,
  \`billToState\` VARCHAR(191) NULL,
  \`invoiceDate\` VARCHAR(191) NOT NULL,
  \`dueDate\` VARCHAR(191) NULL,
  \`currency\` VARCHAR(191) NOT NULL DEFAULT 'INR',
  \`paymentTerms\` VARCHAR(191) NULL,
  \`placeOfSupply\` VARCHAR(191) NULL,
  \`status\` VARCHAR(191) NOT NULL DEFAULT 'Draft',
  \`subtotal\` DOUBLE NOT NULL DEFAULT 0,
  \`discountTotal\` DOUBLE NOT NULL DEFAULT 0,
  \`taxableAmount\` DOUBLE NOT NULL DEFAULT 0,
  \`cgst\` DOUBLE NOT NULL DEFAULT 0,
  \`sgst\` DOUBLE NOT NULL DEFAULT 0,
  \`igst\` DOUBLE NOT NULL DEFAULT 0,
  \`roundOff\` DOUBLE NOT NULL DEFAULT 0,
  \`grandTotal\` DOUBLE NOT NULL DEFAULT 0,
  \`amountPaid\` DOUBLE NOT NULL DEFAULT 0,
  \`balanceDue\` DOUBLE NOT NULL DEFAULT 0,
  \`notes\` TEXT NULL,
  \`termsConditions\` TEXT NULL,
  \`paymentMode\` VARCHAR(191) NULL,
  \`bankDetails\` TEXT NULL,
  \`upiId\` VARCHAR(191) NULL,
  \`isRecurringChild\` TINYINT(1) NOT NULL DEFAULT 0,
  \`createdBy\` VARCHAR(191) NULL,
  \`updatedBy\` VARCHAR(191) NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`invoices_companyId_invoiceNumber_key\` (\`companyId\`, \`invoiceNumber\`),
  KEY \`invoices_companyId_idx\` (\`companyId\`),
  KEY \`invoices_companyId_status_idx\` (\`companyId\`, \`status\`),
  KEY \`invoices_companyId_customerId_idx\` (\`companyId\`, \`customerId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

`CREATE TABLE IF NOT EXISTS \`invoice_items\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`invoiceId\` INT NOT NULL,
  \`productId\` INT NULL,
  \`name\` VARCHAR(191) NOT NULL,
  \`description\` TEXT NULL,
  \`hsnSac\` VARCHAR(191) NULL,
  \`quantity\` DOUBLE NOT NULL DEFAULT 1,
  \`unit\` VARCHAR(191) NULL DEFAULT 'Nos',
  \`rate\` DOUBLE NOT NULL DEFAULT 0,
  \`discountPct\` DOUBLE NOT NULL DEFAULT 0,
  \`discountAmt\` DOUBLE NOT NULL DEFAULT 0,
  \`taxRate\` DOUBLE NOT NULL DEFAULT 0,
  \`taxableValue\` DOUBLE NOT NULL DEFAULT 0,
  \`cgst\` DOUBLE NOT NULL DEFAULT 0,
  \`sgst\` DOUBLE NOT NULL DEFAULT 0,
  \`igst\` DOUBLE NOT NULL DEFAULT 0,
  \`amount\` DOUBLE NOT NULL DEFAULT 0,
  \`sortOrder\` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (\`id\`),
  KEY \`invoice_items_invoiceId_idx\` (\`invoiceId\`),
  KEY \`invoice_items_companyId_idx\` (\`companyId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

`CREATE TABLE IF NOT EXISTS \`invoice_payments\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`invoiceId\` INT NOT NULL,
  \`amount\` DOUBLE NOT NULL DEFAULT 0,
  \`paymentDate\` VARCHAR(191) NOT NULL,
  \`mode\` VARCHAR(191) NOT NULL DEFAULT 'Bank',
  \`referenceNumber\` VARCHAR(191) NULL,
  \`notes\` TEXT NULL,
  \`status\` VARCHAR(191) NOT NULL DEFAULT 'Paid',
  \`recordedBy\` VARCHAR(191) NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  KEY \`invoice_payments_invoiceId_idx\` (\`invoiceId\`),
  KEY \`invoice_payments_companyId_idx\` (\`companyId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

`CREATE TABLE IF NOT EXISTS \`invoice_settings\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`invoicePrefix\` VARCHAR(191) NOT NULL DEFAULT 'INV',
  \`numberFormat\` VARCHAR(191) NOT NULL DEFAULT '{PREFIX}-{FY}-{SEQ}',
  \`nextNumber\` INT NOT NULL DEFAULT 1,
  \`seqPadding\` INT NOT NULL DEFAULT 4,
  \`defaultCurrency\` VARCHAR(191) NOT NULL DEFAULT 'INR',
  \`defaultPaymentTerms\` VARCHAR(191) NULL DEFAULT 'Net 30',
  \`defaultNotes\` TEXT NULL,
  \`defaultTerms\` TEXT NULL,
  \`companyGstin\` VARCHAR(191) NULL,
  \`bankDetails\` TEXT NULL,
  \`upiId\` VARCHAR(191) NULL,
  \`logoUrl\` TEXT NULL,
  \`signatureUrl\` TEXT NULL,
  \`themeColor\` VARCHAR(191) NULL DEFAULT '#4F7CFF',
  \`footerText\` TEXT NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`invoice_settings_companyId_key\` (\`companyId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

`CREATE TABLE IF NOT EXISTS \`invoice_audits\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`entityType\` VARCHAR(191) NOT NULL,
  \`entityId\` INT NULL,
  \`invoiceId\` INT NULL,
  \`action\` VARCHAR(191) NOT NULL,
  \`performedBy\` VARCHAR(191) NULL,
  \`details\` TEXT NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  KEY \`invoice_audits_companyId_idx\` (\`companyId\`),
  KEY \`invoice_audits_invoiceId_idx\` (\`invoiceId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
];

(async () => {
  try {
    for (const ddl of TABLES) {
      const name = /EXISTS \`([a-z_]+)\`/.exec(ddl)[1];
      await prisma.$executeRawUnsafe(ddl);
      console.log('+ ensured table', name);
    }
    console.log('Done. Run `npx prisma generate` next.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
