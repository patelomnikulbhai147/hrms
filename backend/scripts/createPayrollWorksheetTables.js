/**
 * Payroll Employee Salary Worksheet — enhancement-layer tables.
 *
 * These tables store the GRANULAR per-line-item salary breakdown that the
 * existing `Payroll` table (aggregate columns only) cannot hold. The worksheet
 * is an ADD-ON: on every save the controller also writes the derived aggregates
 * back to the existing Payroll row, so payslips / register / reports / dashboard
 * keep working unchanged. Nothing here modifies existing payroll tables.
 *
 * Run once:  node backend/scripts/createPayrollWorksheetTables.js
 */
const prisma = require('../src/config/prisma');

const WORKSHEET = `
CREATE TABLE IF NOT EXISTS payroll_worksheet (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  payrollId            INT NOT NULL,
  employeeId           INT NOT NULL,
  companyId            INT NULL,
  month                VARCHAR(20) NULL,
  year                 INT NULL,
  -- Earnings
  basic                DECIMAL(12,2) NOT NULL DEFAULT 0,
  hra                  DECIMAL(12,2) NOT NULL DEFAULT 0,
  da                   DECIMAL(12,2) NOT NULL DEFAULT 0,
  conveyance           DECIMAL(12,2) NOT NULL DEFAULT 0,
  medical              DECIMAL(12,2) NOT NULL DEFAULT 0,
  specialAllowance     DECIMAL(12,2) NOT NULL DEFAULT 0,
  educationAllowance   DECIMAL(12,2) NOT NULL DEFAULT 0,
  washingAllowance     DECIMAL(12,2) NOT NULL DEFAULT 0,
  bonus                DECIMAL(12,2) NOT NULL DEFAULT 0,
  incentive            DECIMAL(12,2) NOT NULL DEFAULT 0,
  overtime             DECIMAL(12,2) NOT NULL DEFAULT 0,
  arrears              DECIMAL(12,2) NOT NULL DEFAULT 0,
  otherEarnings        DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- Deductions
  pf                   DECIMAL(12,2) NOT NULL DEFAULT 0,
  eps                  DECIMAL(12,2) NOT NULL DEFAULT 0,
  vpf                  DECIMAL(12,2) NOT NULL DEFAULT 0,
  esi                  DECIMAL(12,2) NOT NULL DEFAULT 0,
  professionalTax      DECIMAL(12,2) NOT NULL DEFAULT 0,
  tds                  DECIMAL(12,2) NOT NULL DEFAULT 0,
  lwf                  DECIMAL(12,2) NOT NULL DEFAULT 0,
  advanceRecovery      DECIMAL(12,2) NOT NULL DEFAULT 0,
  loanRecovery         DECIMAL(12,2) NOT NULL DEFAULT 0,
  insurance            DECIMAL(12,2) NOT NULL DEFAULT 0,
  otherDeductions      DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- Employer contributions (informational, drive CTC impact)
  employerPf           DECIMAL(12,2) NOT NULL DEFAULT 0,
  employerEsi          DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- Computed totals (persisted so DB stays the single source of truth)
  totalEarnings        DECIMAL(12,2) NOT NULL DEFAULT 0,
  totalDeductions      DECIMAL(12,2) NOT NULL DEFAULT 0,
  grossSalary          DECIMAL(12,2) NOT NULL DEFAULT 0,
  netSalary            DECIMAL(12,2) NOT NULL DEFAULT 0,
  ctcImpact            DECIMAL(12,2) NOT NULL DEFAULT 0,
  createdBy            VARCHAR(191) NULL,
  updatedBy            VARCHAR(191) NULL,
  createdAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_worksheet_payroll (payrollId),
  INDEX idx_worksheet_employee (employeeId),
  INDEX idx_worksheet_period (month, year),
  CONSTRAINT fk_worksheet_payroll FOREIGN KEY (payrollId) REFERENCES Payroll(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const AUDIT = `
CREATE TABLE IF NOT EXISTS payroll_worksheet_audit_logs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  payrollId       INT NULL,
  employeeId      INT NULL,
  month           VARCHAR(20) NULL,
  year            INT NULL,
  action          VARCHAR(20) NOT NULL,
  performedBy     VARCHAR(191) NULL,
  performedById   INT NULL,
  previousValues  MEDIUMTEXT NULL,
  newValues       MEDIUMTEXT NULL,
  createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wsaudit_payroll (payrollId),
  INDEX idx_wsaudit_employee (employeeId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

(async () => {
  try {
    await prisma.$executeRawUnsafe(WORKSHEET);
    await prisma.$executeRawUnsafe(AUDIT);
    console.log('✅ payroll_worksheet and payroll_worksheet_audit_logs are ready.');
  } catch (e) {
    console.error('FAILED:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
