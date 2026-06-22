/**
 * Employee Bonus restructure foundation — additive & idempotent. NON-destructive.
 * Adds the per-employee bonus config columns to `employee` and creates the
 * `employee_bonuses` ledger table. Deliberately avoids `prisma db push` (the live
 * DB has columns not modelled in schema.prisma, so a push would try to drop data).
 *   node scripts/addEmployeeBonusModel.js
 * Then run `npx prisma generate` and restart the backend.
 */
const prisma = require('../src/config/prisma');

// Each column added only if missing — safe to re-run.
const EMPLOYEE_COLUMNS = [
  ['bonusApplicable', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['bonusType', 'VARCHAR(191) NULL'],
  ['bonusCalcMethod', 'VARCHAR(191) NULL'],
  ['bonusValue', 'DOUBLE NULL'],
  ['bonusEffectiveDate', 'DATETIME(3) NULL'],
  ['bonusEndDate', 'DATETIME(3) NULL'],
  ['bonusNotes', 'TEXT NULL'],
];

// Overtime surfaced as its own payroll line (already counted within `allowances`
// for net-salary math; this lets the UI show it separately without double-count).
const PAYROLL_COLUMNS = [
  ['overtime', 'DOUBLE NULL DEFAULT 0'],
];

const EMPLOYEE_BONUSES_TABLE = `
  CREATE TABLE IF NOT EXISTS \`employee_bonuses\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`companyId\` INT NOT NULL,
    \`employeeId\` INT NOT NULL,
    \`source\` VARCHAR(191) NOT NULL DEFAULT 'employee',
    \`bonusType\` VARCHAR(191) NOT NULL,
    \`calcMethod\` VARCHAR(191) NULL,
    \`amount\` DOUBLE NOT NULL DEFAULT 0,
    \`percent\` DOUBLE NULL,
    \`reason\` TEXT NULL,
    \`approvedBy\` INT NULL,
    \`approvedByName\` VARCHAR(191) NULL,
    \`approvalDate\` DATETIME(3) NULL,
    \`effectiveDate\` DATETIME(3) NULL,
    \`endDate\` DATETIME(3) NULL,
    \`status\` VARCHAR(191) NOT NULL DEFAULT 'Active',
    \`payrollMonth\` VARCHAR(191) NULL,
    \`payrollYear\` INT NULL,
    \`notes\` TEXT NULL,
    \`createdBy\` INT NULL,
    \`createdByName\` VARCHAR(191) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX \`employee_bonuses_companyId_idx\`(\`companyId\`),
    INDEX \`employee_bonuses_employeeId_idx\`(\`employeeId\`),
    INDEX \`employee_bonuses_payrollMonth_payrollYear_idx\`(\`payrollMonth\`, \`payrollYear\`),
    PRIMARY KEY (\`id\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, column
  );
  return Number(rows[0].c) > 0;
}

async function run() {
  console.log('==> Adding employee bonus config columns (idempotent)…');
  for (const [name, def] of EMPLOYEE_COLUMNS) {
    if (await columnExists('employee', name)) {
      console.log(`    • employee.${name} already exists — skipped`);
      continue;
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE \`employee\` ADD COLUMN \`${name}\` ${def}`);
    console.log(`    ✓ added employee.${name}`);
  }

  console.log('==> Adding payroll bonus/overtime columns (idempotent)…');
  for (const [name, def] of PAYROLL_COLUMNS) {
    if (await columnExists('payroll', name)) {
      console.log(`    • payroll.${name} already exists — skipped`);
      continue;
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE \`payroll\` ADD COLUMN \`${name}\` ${def}`);
    console.log(`    ✓ added payroll.${name}`);
  }

  console.log('==> Creating employee_bonuses table (idempotent)…');
  await prisma.$executeRawUnsafe(EMPLOYEE_BONUSES_TABLE);
  console.log('    ✓ employee_bonuses ready');

  console.log('\n✅ Done. Now run: npx prisma generate  then restart the backend.');
}

run()
  .catch((e) => { console.error('❌ Migration failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
