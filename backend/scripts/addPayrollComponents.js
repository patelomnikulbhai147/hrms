/**
 * Additive & idempotent — creates the Payroll Component Builder tables
 * (payroll_components, payroll_component_audits). NON-destructive; avoids
 * `prisma db push` (which drops columns on drift). Run locally and on prod,
 * then `npx prisma generate`.
 *   node scripts/addPayrollComponents.js
 */
const prisma = require('../src/config/prisma');

const CREATE_COMPONENTS = `
CREATE TABLE IF NOT EXISTS \`payroll_components\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`componentName\` VARCHAR(191) NOT NULL,
  \`displayName\` VARCHAR(191) NULL,
  \`shortCode\` VARCHAR(191) NULL,
  \`description\` TEXT NULL,
  \`componentType\` VARCHAR(191) NOT NULL,
  \`payrollCategory\` VARCHAR(191) NOT NULL DEFAULT 'Fixed',
  \`calculationMethod\` VARCHAR(191) NOT NULL DEFAULT 'Fixed Amount',
  \`amount\` DOUBLE NULL DEFAULT 0,
  \`percentage\` DOUBLE NULL DEFAULT 0,
  \`formula\` TEXT NULL,
  \`taxable\` VARCHAR(191) NOT NULL DEFAULT 'Taxable',
  \`taxablePercent\` DOUBLE NULL DEFAULT 0,
  \`pfApplicable\` TINYINT(1) NOT NULL DEFAULT 0,
  \`esicApplicable\` TINYINT(1) NOT NULL DEFAULT 0,
  \`ptApplicable\` TINYINT(1) NOT NULL DEFAULT 0,
  \`lwfApplicable\` TINYINT(1) NOT NULL DEFAULT 0,
  \`tdsApplicable\` TINYINT(1) NOT NULL DEFAULT 0,
  \`effectiveFrom\` VARCHAR(191) NULL,
  \`effectiveTo\` VARCHAR(191) NULL,
  \`status\` VARCHAR(191) NOT NULL DEFAULT 'Active',
  \`displayOrder\` INT NOT NULL DEFAULT 0,
  \`usageCount\` INT NOT NULL DEFAULT 0,
  \`lastUsedAt\` DATETIME(3) NULL,
  \`createdBy\` VARCHAR(191) NULL,
  \`updatedBy\` VARCHAR(191) NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  KEY \`payroll_components_companyId_idx\` (\`companyId\`),
  KEY \`payroll_components_companyId_componentType_idx\` (\`companyId\`, \`componentType\`),
  KEY \`payroll_components_companyId_status_idx\` (\`companyId\`, \`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const CREATE_AUDITS = `
CREATE TABLE IF NOT EXISTS \`payroll_component_audits\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`componentId\` INT NOT NULL,
  \`action\` VARCHAR(191) NOT NULL,
  \`changedBy\` VARCHAR(191) NULL,
  \`changes\` TEXT NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  KEY \`payroll_component_audits_componentId_idx\` (\`componentId\`),
  KEY \`payroll_component_audits_companyId_idx\` (\`companyId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

(async () => {
  try {
    await prisma.$executeRawUnsafe(CREATE_COMPONENTS);
    console.log('+ ensured table payroll_components');
    await prisma.$executeRawUnsafe(CREATE_AUDITS);
    console.log('+ ensured table payroll_component_audits');
    console.log('Done. Run `npx prisma generate` next.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
