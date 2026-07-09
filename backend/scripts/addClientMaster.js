/**
 * Additive & idempotent — Client Master fields on the invoice customer master
 * plus a ship-to snapshot on invoices. NON-destructive; avoids `prisma db push`
 * (which drops columns on drift). Run locally AND on prod, then `npx prisma generate`
 * + restart the backend.
 *   node scripts/addClientMaster.js
 *
 * Adds:
 *   invoice_customers.customerCode   VARCHAR(191)  (unique per company: CLI-000001)
 *   invoice_customers.shipToAddress  TEXT
 *   invoice_customers.paymentTerms   VARCHAR(191)
 *   invoice_customers.creditDays     INT
 *   invoices.billToShipAddress       TEXT
 *   UNIQUE INDEX invoice_customers (companyId, customerCode)
 * Then backfills CLI-###### codes for existing customers, per company.
 *
 * MySQL has no "ADD COLUMN IF NOT EXISTS", so we probe information_schema first.
 */
const prisma = require('../src/config/prisma');

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, table, column);
  return Number(rows?.[0]?.c || 0) > 0;
}
async function indexExists(table, index) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`, table, index);
  return Number(rows?.[0]?.c || 0) > 0;
}
async function addColumn(table, column, ddl) {
  if (await columnExists(table, column)) { console.log(`= ${table}.${column} already present — skipped`); return; }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`+ added ${table}.${column}`);
}

(async () => {
  try {
    // 1. New columns (all nullable → additive, no data loss).
    await addColumn('invoice_customers', 'customerCode', '`customerCode` VARCHAR(191) NULL AFTER `companyId`');
    await addColumn('invoice_customers', 'shipToAddress', '`shipToAddress` TEXT NULL AFTER `addressLine`');
    await addColumn('invoice_customers', 'paymentTerms', '`paymentTerms` VARCHAR(191) NULL AFTER `country`');
    await addColumn('invoice_customers', 'creditDays', '`creditDays` INT NULL AFTER `paymentTerms`');
    await addColumn('invoices', 'billToShipAddress', '`billToShipAddress` TEXT NULL AFTER `billToAddress`');

    // 2. Backfill CLI-###### per company (idempotent — only rows missing a code).
    const companies = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT companyId FROM invoice_customers WHERE customerCode IS NULL OR customerCode = ''`);
    let filled = 0;
    for (const { companyId } of companies) {
      const codeRows = await prisma.$queryRawUnsafe(
        `SELECT customerCode FROM invoice_customers WHERE companyId = ? AND customerCode REGEXP '^CLI-[0-9]+$'`, companyId);
      let max = 0;
      for (const r of codeRows) { const m = /^CLI-(\d+)$/i.exec(r.customerCode || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); }
      const need = await prisma.$queryRawUnsafe(
        `SELECT id FROM invoice_customers WHERE companyId = ? AND (customerCode IS NULL OR customerCode = '') ORDER BY id ASC`, companyId);
      for (const { id } of need) {
        const code = `CLI-${String(++max).padStart(6, '0')}`;
        await prisma.$executeRawUnsafe(`UPDATE invoice_customers SET customerCode = ? WHERE id = ?`, code, id);
        filled++;
      }
    }
    console.log(filled ? `+ backfilled ${filled} client code(s)` : '= no client codes needed backfilling');

    // 3. Unique index (companyId, customerCode) — added after backfill.
    if (await indexExists('invoice_customers', 'invoice_customers_companyId_customerCode_key')) {
      console.log('= unique index (companyId, customerCode) already present — skipped');
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `invoice_customers` ADD UNIQUE INDEX `invoice_customers_companyId_customerCode_key` (`companyId`, `customerCode`)');
      console.log('+ added unique index invoice_customers (companyId, customerCode)');
    }

    console.log('\nDone. Next: `npx prisma generate` then restart the backend.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
