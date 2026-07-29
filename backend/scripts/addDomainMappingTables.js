/**
 * White Label & Custom Domain (Beta) — additive & idempotent schema upgrade.
 *
 *   domain_mappings        — one domain ↔ one company; DNS/SSL status machine
 *   white_label_settings   — per-company login/email branding
 *
 * NON-destructive: CREATE TABLE IF NOT EXISTS only. Deliberately NOT
 * `prisma db push` (EC2 landmine).
 *
 *   node scripts/addDomainMappingTables.js
 */
const prisma = require('../src/config/prisma');

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, column
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`  · ${table}.${column} already present`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`  + ${table}.${column}`);
}

async function main() {
  console.log('White Label & Custom Domain — additive schema upgrade');

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS \`domain_mappings\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`companyId\` INT NOT NULL,
    \`domain\` VARCHAR(191) NOT NULL,
    \`status\` VARCHAR(191) NOT NULL DEFAULT 'PENDING_DNS',
    \`sslStatus\` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    \`dnsType\` VARCHAR(191) NOT NULL DEFAULT 'CNAME',
    \`dnsTarget\` VARCHAR(191) NOT NULL,
    \`verifyToken\` VARCHAR(191) NOT NULL,
    \`dnsCheckedAt\` DATETIME(3) NULL,
    \`dnsVerifiedAt\` DATETIME(3) NULL,
    \`sslIssuedAt\` DATETIME(3) NULL,
    \`sslExpiresAt\` DATETIME(3) NULL,
    \`activatedAt\` DATETIME(3) NULL,
    \`lastError\` TEXT NULL,
    \`failCount\` INT NOT NULL DEFAULT 0,
    \`disabledBy\` VARCHAR(191) NULL,
    \`disabledAt\` DATETIME(3) NULL,
    \`createdBy\` VARCHAR(191) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`),
    UNIQUE INDEX \`domain_mappings_companyId_key\` (\`companyId\`),
    UNIQUE INDEX \`domain_mappings_domain_key\` (\`domain\`),
    INDEX \`domain_mappings_status_idx\` (\`status\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log('  ✓ domain_mappings');

  // Completion-round columns (additive; safe on an existing table).
  await addColumn('domain_mappings', 'uuid', 'VARCHAR(191) NULL');
  await addColumn('domain_mappings', 'subdomain', 'VARCHAR(191) NULL');
  await addColumn('domain_mappings', 'sslProvider', 'VARCHAR(191) NULL');
  await addColumn('domain_mappings', 'healthStatus', "VARCHAR(191) NOT NULL DEFAULT 'UNKNOWN'");
  await addColumn('domain_mappings', 'healthDetail', 'TEXT NULL');
  await addColumn('domain_mappings', 'dnsProvider', 'VARCHAR(191) NULL');
  await addColumn('domain_mappings', 'cnameHost', 'VARCHAR(191) NULL');
  await addColumn('domain_mappings', 'cnameValue', 'VARCHAR(191) NULL');
  await addColumn('domain_mappings', 'txtHost', 'VARCHAR(191) NULL');
  await addColumn('domain_mappings', 'txtValue', 'VARCHAR(191) NULL');
  await addColumn('domain_mappings', 'verificationMethod', "VARCHAR(191) NOT NULL DEFAULT 'DNS'");
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX `domain_mappings_uuid_key` ON `domain_mappings`(`uuid`)').catch(() => {});

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS \`white_label_settings\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`companyId\` INT NOT NULL,
    \`enabled\` BOOLEAN NOT NULL DEFAULT false,
    \`logoUrl\` TEXT NULL,
    \`faviconUrl\` TEXT NULL,
    \`primaryColor\` VARCHAR(191) NULL,
    \`secondaryColor\` VARCHAR(191) NULL,
    \`loginBackground\` TEXT NULL,
    \`supportEmail\` VARCHAR(191) NULL,
    \`supportPhone\` VARCHAR(191) NULL,
    \`footerText\` TEXT NULL,
    \`hideZeniaBranding\` BOOLEAN NOT NULL DEFAULT true,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`),
    UNIQUE INDEX \`white_label_settings_companyId_key\` (\`companyId\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log('  ✓ white_label_settings');

  console.log('Done.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
