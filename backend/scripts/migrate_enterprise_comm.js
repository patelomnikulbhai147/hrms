// Additive, idempotent migration for the Enterprise Communication Workflow.
// Creates 2 new tables + adds 2 columns to communication_templates.
// NEVER uses prisma db push. Safe to re-run.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    table, column
  );
  return Number(rows[0].c) > 0;
}

(async () => {
  // 1) communication_master_templates
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`communication_master_templates\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`title\` VARCHAR(191) NOT NULL,
      \`category\` VARCHAR(191) NOT NULL,
      \`festivalKey\` VARCHAR(191) NOT NULL DEFAULT '',
      \`subject\` TEXT NULL,
      \`body\` TEXT NULL,
      \`placeholders\` TEXT NULL,
      \`layout\` LONGTEXT NULL,
      \`backgroundImage\` LONGTEXT NULL,
      \`whatsappCompatible\` TINYINT(1) NOT NULL DEFAULT 1,
      \`whatsappCaption\` TEXT NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'Active',
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`createdBy\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`communication_master_templates_category_idx\` (\`category\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
  console.log('✓ communication_master_templates ready');

  // 2) communication_event_mappings
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`communication_event_mappings\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`companyId\` INT NOT NULL,
      \`eventKey\` VARCHAR(191) NOT NULL,
      \`festivalKey\` VARCHAR(191) NOT NULL DEFAULT '',
      \`hrmateTemplateId\` INT NULL,
      \`whatsappEnabled\` TINYINT(1) NOT NULL DEFAULT 1,
      \`emailEnabled\` TINYINT(1) NOT NULL DEFAULT 0,
      \`enabled\` TINYINT(1) NOT NULL DEFAULT 0,
      \`ruleId\` INT NULL,
      \`createdBy\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`comm_event_map_company_event_festival_key\` (\`companyId\`, \`eventKey\`, \`festivalKey\`),
      INDEX \`communication_event_mappings_companyId_idx\` (\`companyId\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
  console.log('✓ communication_event_mappings ready');

  // 3) additive columns on communication_templates (guarded)
  if (!(await columnExists('communication_templates', 'masterTemplateId'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`communication_templates\` ADD COLUMN \`masterTemplateId\` INT NULL`);
    console.log('✓ added communication_templates.masterTemplateId');
  } else console.log('· communication_templates.masterTemplateId already present');

  if (!(await columnExists('communication_templates', 'libraryState'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`communication_templates\` ADD COLUMN \`libraryState\` VARCHAR(191) NOT NULL DEFAULT 'enabled'`);
    console.log('✓ added communication_templates.libraryState');
  } else console.log('· communication_templates.libraryState already present');

  console.log('\nMigration complete.');
  await prisma.$disconnect();
})().catch(async (e) => { console.error('MIGRATION FAILED:', e.message); try { await prisma.$disconnect(); } catch {} process.exit(1); });
