/**
 * Add the Dispatch & Destination columns to the Invoice table.
 *
 * ADDITIVE AND IDEMPOTENT — every statement is ADD COLUMN, and "duplicate
 * column" is swallowed, so re-running is safe.
 *
 * Run this INSTEAD of `prisma db push`. On this repo db push is destructive
 * against the live RDS: the committed schema drops Employee.serviceBookNo and
 * Payroll.leaveEncashment* and tries to add unique indexes that existing
 * duplicate rows reject. See the deploy notes.
 *
 * Deploy order (backend):
 *   node scripts/addInvoiceDispatchFields.js
 *   npx prisma generate          # client must know the new columns
 *   pm2 reload hrms-backend
 *
 * `prisma generate` WITHOUT this script first is the failure mode to avoid:
 * the client would expect columns the database lacks and every invoice read
 * would fail with P2022.
 *
 *   node scripts/addInvoiceDispatchFields.js          # apply
 *   node scripts/addInvoiceDispatchFields.js --check  # report only, no writes
 */
const prisma = require('../src/config/prisma');

const COLUMNS = [
  ['dispatchFrom',    'VARCHAR(160) NULL'],
  ['dispatchAddress', 'TEXT NULL'],
  ['dispatchCity',    'VARCHAR(100) NULL'],
  ['dispatchState',   'VARCHAR(100) NULL'],
  ['dispatchPincode', 'VARCHAR(12) NULL'],
  ['dispatchDate',    'VARCHAR(10) NULL'],
  ['dispatchThrough', 'VARCHAR(160) NULL'],
  ['vehicleNumber',   'VARCHAR(40) NULL'],
  ['lrNumber',        'VARCHAR(60) NULL'],
  ['shipToName',      'VARCHAR(160) NULL'],
  ['shipToCity',      'VARCHAR(100) NULL'],
  ['shipToState',     'VARCHAR(100) NULL'],
  ['shipToPincode',   'VARCHAR(12) NULL'],
  ['shipToCountry',   'VARCHAR(100) NULL'],
];

// PHYSICAL table name. The Prisma model is `Invoice` but carries
// @@map("invoices") — raw DDL must use the mapped name, not the model name.
const TABLE = 'invoices';

async function existingColumns() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, TABLE
  );
  return new Set(rows.map((r) => r.name));
}

(async () => {
  const checkOnly = process.argv.includes('--check');
  try {
    const present = await existingColumns();
    if (!present.size) {
      console.error(`✗ Table \`${TABLE}\` not found in this database. Aborting without changes.`);
      process.exitCode = 1;
      return;
    }

    const missing = COLUMNS.filter(([name]) => !present.has(name));
    console.log(`${TABLE}: ${COLUMNS.length} expected, ${COLUMNS.length - missing.length} already present, ${missing.length} to add.`);

    if (checkOnly) {
      missing.forEach(([name, type]) => console.log(`  would add: ${name} ${type}`));
      if (!missing.length) console.log('  nothing to do — schema is already up to date.');
      return;
    }

    let added = 0;
    for (const [name, type] of missing) {
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` ADD COLUMN \`${name}\` ${type}`);
        console.log(`  + ${name}`);
        added++;
      } catch (e) {
        // 1060 = duplicate column: a concurrent/repeat run already added it.
        if (/duplicate column/i.test(e.message)) console.log(`  = ${name} (already present)`);
        else throw e;
      }
    }

    const after = await existingColumns();
    const stillMissing = COLUMNS.filter(([n]) => !after.has(n)).map(([n]) => n);
    console.log(`\nAdded ${added} column(s).`);
    if (stillMissing.length) {
      console.error(`✗ Still missing: ${stillMissing.join(', ')}`);
      process.exitCode = 1;
    } else {
      console.log('✓ All Dispatch & Destination columns are present.');
      console.log('  Next: npx prisma generate && pm2 reload hrms-backend');
    }
  } catch (e) {
    console.error('✗ Failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
