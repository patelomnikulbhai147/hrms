/**
 * Invoice Management — additive branding-asset columns.
 *
 *   invoice_settings.stampUrl  TEXT NULL   company-default seal / stamp
 *   invoice_settings.qrUrl     TEXT NULL   company-default payment QR
 *   invoices.brandingOverride  TEXT NULL   per-invoice JSON {logo,signature,stamp,qr}
 *
 * Nothing existing is renamed, dropped, retyped or re-defaulted. Existing rows
 * get NULL and therefore keep falling back to Company Profile exactly as today.
 * IDEMPOTENT and safe on live RDS. NEVER `prisma db push` (drift = data loss).
 *
 * Run:  node scripts/addInvoiceBrandingFields.js   →   then `npx prisma generate`
 */
const prisma = require('../src/config/prisma');

const PLAN = [
  ['invoice_settings', 'stampUrl', 'TEXT NULL'],
  ['invoice_settings', 'qrUrl', 'TEXT NULL'],
  ['invoices', 'brandingOverride', 'TEXT NULL'],
];

(async () => {
  try {
    let added = 0;
    for (const [table, column, type] of PLAN) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, table, column
      );
      if (rows.length) { console.log(`• ${table}.${column} already present — skipped`); continue; }
      const exists = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, table
      );
      if (!Number(exists[0].n)) { console.error(`❌ table \`${table}\` not found — aborting.`); process.exit(1); }
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`);
      console.log(`✓ added ${table}.${column} ${type}`);
      added++;
    }

    // Verify + report that nothing existing was disturbed.
    for (const [table, column] of PLAN) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, table, column
      );
      if (!Number(rows[0].n)) { console.error(`❌ ${table}.${column} missing after migration.`); process.exit(1); }
    }
    const inv = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM `invoices`');
    const set = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM `invoice_settings`');
    console.log(`\n${added} column(s) added · ${inv[0].n} invoice(s) and ${set[0].n} settings row(s) untouched (NULL = use Company Profile)`);
    console.log('✓ Done. Run `npx prisma generate` AFTER this script.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
