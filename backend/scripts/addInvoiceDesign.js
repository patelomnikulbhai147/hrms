/**
 * Additive & idempotent — adds invoice_settings.designJson (Invoice Designer
 * template config, JSON stored as TEXT). NON-destructive; avoids `prisma db push`
 * (which drops columns on drift). Run locally and on prod, then `npx prisma generate`.
 *   node scripts/addInvoiceDesign.js
 *
 * MySQL has no "ADD COLUMN IF NOT EXISTS", so we probe information_schema first.
 */
const prisma = require('../src/config/prisma');

(async () => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_settings' AND COLUMN_NAME = 'designJson'`
    );
    const exists = Number(rows?.[0]?.c || 0) > 0;
    if (exists) {
      console.log('= invoice_settings.designJson already present — nothing to do.');
    } else {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `invoice_settings` ADD COLUMN `designJson` TEXT NULL AFTER `footerText`"
      );
      console.log('+ added column invoice_settings.designJson');
    }
    console.log('Done. Run `npx prisma generate` next.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
