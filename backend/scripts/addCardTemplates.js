/**
 * Additive & idempotent — creates the `card_templates` table for the Employee
 * Card Designer. Run then `npx prisma generate`.
 *   node scripts/addCardTemplates.js
 */
const prisma = require('../src/config/prisma');

async function tableExists(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, table
  );
  return Number(rows?.[0]?.n || 0) > 0;
}

(async () => {
  try {
    if (await tableExists('card_templates')) {
      console.log('= card_templates already exists — nothing to do.');
    } else {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE \`card_templates\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`companyId\` INT NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`category\` VARCHAR(191) NOT NULL DEFAULT 'Custom',
          \`size\` VARCHAR(191) NOT NULL DEFAULT 'CR80',
          \`orientation\` VARCHAR(191) NOT NULL DEFAULT 'portrait',
          \`builtinId\` VARCHAR(191) NULL,
          \`spec\` JSON NOT NULL,
          \`isDefault\` BOOLEAN NOT NULL DEFAULT false,
          \`shared\` BOOLEAN NOT NULL DEFAULT false,
          \`createdBy\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL,
          PRIMARY KEY (\`id\`),
          INDEX \`card_templates_companyId_idx\` (\`companyId\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
      console.log('+ created table card_templates');
    }
    console.log('Done. Run `npx prisma generate` next.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
