/**
 * Invoice Management — additive header reference columns.
 *
 * Adds ONLY new nullable columns to `invoices`:
 *   contractNo · referenceNo · poNumber · billingPeriod
 *
 * Nothing existing is renamed, dropped, retyped or defaulted. Existing rows get
 * NULL and print exactly as they did before. IDEMPOTENT — safe to re-run, and
 * safe on the live RDS. NEVER use `prisma db push` here (schema drift = data
 * loss); this script is the deploy step.
 *
 * Run:  node scripts/addInvoiceHeaderFields.js
 */
const prisma = require('../src/config/prisma');

const COLUMNS = [
  ['contractNo', 'VARCHAR(100) NULL'],
  ['referenceNo', 'VARCHAR(100) NULL'],
  ['poNumber', 'VARCHAR(100) NULL'],
  ['billingPeriod', 'VARCHAR(100) NULL'],
];

(async () => {
  try {
    const existing = await prisma.$queryRawUnsafe(
      `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices'`
    );
    const have = new Set(existing.map((r) => String(r.c)));
    if (!have.size) { console.error('❌ Table `invoices` not found — nothing done.'); process.exit(1); }

    let added = 0;
    for (const [name, type] of COLUMNS) {
      if (have.has(name)) { console.log(`• ${name} already present — skipped`); continue; }
      await prisma.$executeRawUnsafe(`ALTER TABLE \`invoices\` ADD COLUMN \`${name}\` ${type}`);
      console.log(`✓ added ${name} ${type}`);
      added++;
    }

    const after = await prisma.$queryRawUnsafe(
      `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices'
          AND COLUMN_NAME IN ('contractNo','referenceNo','poNumber','billingPeriod')`
    );
    const rows = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM `invoices`');
    console.log(`\n${added} column(s) added · ${after.length}/4 present · ${rows[0].n} existing invoice(s) untouched`);
    if (after.length !== 4) { console.error('❌ Not all columns present.'); process.exit(1); }
    console.log('✓ Done. Run `npx prisma generate` AFTER this script.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
