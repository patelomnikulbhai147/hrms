/**
 * Additive & idempotent — creates the Employee Loan Management tables and adds
 * the `loanDeduction` column to `payroll`. NON-destructive; avoids `prisma db
 * push` drops on drift. Run locally and on prod, then `npx prisma generate`.
 *   node scripts/addLoanModule.js
 */
const prisma = require('../src/config/prisma');

const TABLES = [
`CREATE TABLE IF NOT EXISTS \`loan_types\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`name\` VARCHAR(191) NOT NULL,
  \`code\` VARCHAR(191) NULL,
  \`description\` TEXT NULL,
  \`defaultInterestType\` VARCHAR(191) NOT NULL DEFAULT 'Flat',
  \`defaultInterestRate\` DOUBLE NOT NULL DEFAULT 0,
  \`maxAmount\` DOUBLE NULL DEFAULT 0,
  \`maxTenureMonths\` INT NULL DEFAULT 0,
  \`requiresApproval\` TINYINT(1) NOT NULL DEFAULT 1,
  \`isSystem\` TINYINT(1) NOT NULL DEFAULT 0,
  \`active\` TINYINT(1) NOT NULL DEFAULT 1,
  \`displayOrder\` INT NOT NULL DEFAULT 0,
  \`createdBy\` VARCHAR(191) NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  KEY \`loan_types_companyId_idx\` (\`companyId\`),
  KEY \`loan_types_companyId_active_idx\` (\`companyId\`, \`active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

`CREATE TABLE IF NOT EXISTS \`loans\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`branchId\` INT NULL,
  \`employeeId\` INT NOT NULL,
  \`employeeName\` VARCHAR(191) NOT NULL DEFAULT 'Unknown',
  \`department\` VARCHAR(191) NULL,
  \`loanNumber\` VARCHAR(191) NOT NULL,
  \`loanTypeId\` INT NULL,
  \`loanTypeName\` VARCHAR(191) NOT NULL DEFAULT 'Loan',
  \`principalAmount\` DOUBLE NOT NULL DEFAULT 0,
  \`interestType\` VARCHAR(191) NOT NULL DEFAULT 'Flat',
  \`interestRate\` DOUBLE NOT NULL DEFAULT 0,
  \`totalInterest\` DOUBLE NOT NULL DEFAULT 0,
  \`totalPayable\` DOUBLE NOT NULL DEFAULT 0,
  \`tenureMonths\` INT NOT NULL DEFAULT 1,
  \`emiAmount\` DOUBLE NOT NULL DEFAULT 0,
  \`startDate\` VARCHAR(191) NULL,
  \`endDate\` VARCHAR(191) NULL,
  \`deductionStartMonth\` VARCHAR(191) NOT NULL DEFAULT 'January',
  \`deductionStartYear\` INT NOT NULL DEFAULT 2026,
  \`approvalAuthority\` VARCHAR(191) NULL,
  \`remarks\` TEXT NULL,
  \`attachments\` TEXT NULL,
  \`status\` VARCHAR(191) NOT NULL DEFAULT 'Draft',
  \`rejectionReason\` VARCHAR(191) NULL,
  \`disbursedDate\` VARCHAR(191) NULL,
  \`requestedBy\` VARCHAR(191) NULL,
  \`approvedBy\` VARCHAR(191) NULL,
  \`approvedAt\` DATETIME(3) NULL,
  \`closedAt\` DATETIME(3) NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`loans_companyId_loanNumber_key\` (\`companyId\`, \`loanNumber\`),
  KEY \`loans_companyId_idx\` (\`companyId\`),
  KEY \`loans_companyId_status_idx\` (\`companyId\`, \`status\`),
  KEY \`loans_employeeId_idx\` (\`employeeId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

`CREATE TABLE IF NOT EXISTS \`loan_installments\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`loanId\` INT NOT NULL,
  \`seq\` INT NOT NULL,
  \`periodMonth\` VARCHAR(191) NOT NULL,
  \`periodYear\` INT NOT NULL,
  \`dueDate\` VARCHAR(191) NULL,
  \`emiAmount\` DOUBLE NOT NULL DEFAULT 0,
  \`principalComponent\` DOUBLE NOT NULL DEFAULT 0,
  \`interestComponent\` DOUBLE NOT NULL DEFAULT 0,
  \`openingBalance\` DOUBLE NOT NULL DEFAULT 0,
  \`closingBalance\` DOUBLE NOT NULL DEFAULT 0,
  \`status\` VARCHAR(191) NOT NULL DEFAULT 'Pending',
  \`paidAmount\` DOUBLE NOT NULL DEFAULT 0,
  \`paidDate\` DATETIME(3) NULL,
  \`paidByPayrollId\` INT NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`loan_installments_loanId_seq_key\` (\`loanId\`, \`seq\`),
  KEY \`loan_installments_companyId_idx\` (\`companyId\`),
  KEY \`loan_installments_loanId_idx\` (\`loanId\`),
  KEY \`loan_installments_companyId_periodMonth_periodYear_idx\` (\`companyId\`, \`periodMonth\`, \`periodYear\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

`CREATE TABLE IF NOT EXISTS \`loan_audits\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`companyId\` INT NOT NULL,
  \`loanId\` INT NULL,
  \`entityType\` VARCHAR(191) NOT NULL DEFAULT 'Loan',
  \`action\` VARCHAR(191) NOT NULL,
  \`fromStatus\` VARCHAR(191) NULL,
  \`toStatus\` VARCHAR(191) NULL,
  \`performedBy\` VARCHAR(191) NULL,
  \`details\` TEXT NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  KEY \`loan_audits_companyId_idx\` (\`companyId\`),
  KEY \`loan_audits_loanId_idx\` (\`loanId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
];

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, column
  );
  return Number(rows?.[0]?.n || 0) > 0;
}

(async () => {
  try {
    for (const ddl of TABLES) {
      const name = /EXISTS \`([a-z_]+)\`/.exec(ddl)[1];
      await prisma.$executeRawUnsafe(ddl);
      console.log('+ ensured table', name);
    }
    // Additive column on the existing payroll table (MySQL has no ADD COLUMN IF
    // NOT EXISTS, so probe information_schema first).
    if (await columnExists('payroll', 'loanDeduction')) {
      console.log('= payroll.loanDeduction already present — nothing to do.');
    } else {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `payroll` ADD COLUMN `loanDeduction` DOUBLE NULL DEFAULT 0 AFTER `tax`"
      );
      console.log('+ added column payroll.loanDeduction');
    }
    console.log('Done. Run `npx prisma generate` next.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
