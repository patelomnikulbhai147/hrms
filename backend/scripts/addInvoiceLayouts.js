/**
 * Additive & idempotent — creates the invoice_layouts table for the visual
 * (drag-and-drop) Invoice Designer. NON-destructive; avoids `prisma db push`.
 * Run locally AND on prod, then `npx prisma generate` + restart the backend.
 *   node scripts/addInvoiceLayouts.js
 */
const prisma = require('../src/config/prisma');

(async () => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_layouts'`);
    if (Number(rows?.[0]?.c || 0) > 0) {
      console.log('= invoice_layouts already exists — nothing to do.');
    } else {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE \`invoice_layouts\` (
          \`id\`         INT NOT NULL AUTO_INCREMENT,
          \`companyId\`  INT NOT NULL,
          \`name\`       VARCHAR(191) NOT NULL,
          \`layoutJson\` TEXT NOT NULL,
          \`isDefault\`  BOOLEAN NOT NULL DEFAULT false,
          \`createdBy\`  VARCHAR(191) NULL,
          \`updatedBy\`  VARCHAR(191) NULL,
          \`createdAt\`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\`  DATETIME(3) NOT NULL,
          PRIMARY KEY (\`id\`),
          INDEX \`invoice_layouts_companyId_idx\` (\`companyId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log('+ created table invoice_layouts');
    }
    console.log('\nDone. Next: `npx prisma generate` then restart the backend.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
