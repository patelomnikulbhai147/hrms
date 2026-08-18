// Additive, idempotent migration: creates the payroll_employee_billing ledger
// used by the payroll wallet gate's per-employee delta billing. Safe to run on
// live RDS — CREATE TABLE IF NOT EXISTS only, no drops, no data changes.
// Usage: node scripts/addPayrollEmployeeBillingTable.js
const prisma = require('../src/config/prisma');

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS payroll_employee_billing (
      id INT NOT NULL AUTO_INCREMENT,
      companyId INT NOT NULL,
      employeeId INT NOT NULL,
      month VARCHAR(191) NOT NULL,
      year INT NOT NULL,
      amount DOUBLE NOT NULL DEFAULT 0,
      reference VARCHAR(191) NULL,
      createdBy VARCHAR(191) NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY payroll_employee_billing_companyId_employeeId_month_year_key (companyId, employeeId, month, year),
      KEY payroll_employee_billing_companyId_month_year_idx (companyId, month, year)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM payroll_employee_billing`);
  console.log(`[OK] payroll_employee_billing present (rows: ${rows[0].c}).`);
}

main()
  .catch((e) => { console.error('[FAIL]', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
