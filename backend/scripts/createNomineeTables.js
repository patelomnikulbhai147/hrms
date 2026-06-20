/**
 * Create the dedicated nominee tables (idempotent). Additive only — does NOT touch
 * the Employee table or any existing column, so no other module is affected.
 *   node scripts/createNomineeTables.js
 */
const prisma = require('../src/config/prisma');

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS employee_nominees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employeeId INT NOT NULL,
    companyId INT NULL,
    fullName VARCHAR(191) NOT NULL,
    relationship VARCHAR(64) NOT NULL,
    dob VARCHAR(20) NULL,
    gender VARCHAR(20) NULL,
    mobile VARCHAR(20) NULL,
    email VARCHAR(191) NULL,
    nationality VARCHAR(64) NULL,
    maritalStatus VARCHAR(20) NULL,
    aadhaar VARCHAR(20) NULL,
    pan VARCHAR(20) NULL,
    passport VARCHAR(40) NULL,
    drivingLicense VARCHAR(40) NULL,
    country VARCHAR(64) NULL,
    state VARCHAR(64) NULL,
    city VARCHAR(64) NULL,
    addressLine1 VARCHAR(255) NULL,
    addressLine2 VARCHAR(255) NULL,
    postalCode VARCHAR(20) NULL,
    percentage DECIMAL(6,2) NOT NULL DEFAULT 0,
    isEmergencyContact TINYINT(1) NOT NULL DEFAULT 0,
    isDependent TINYINT(1) NOT NULL DEFAULT 0,
    isLegalHeir TINYINT(1) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    createdBy VARCHAR(191) NULL,
    updatedBy VARCHAR(191) NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nominee_employee (employeeId),
    CONSTRAINT fk_nominee_employee FOREIGN KEY (employeeId) REFERENCES Employee(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS nominee_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nomineeId INT NOT NULL,
    docType VARCHAR(64) NOT NULL,
    fileName VARCHAR(255) NULL,
    mimeType VARCHAR(128) NULL,
    fileData LONGTEXT NULL,
    uploadedBy VARCHAR(191) NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_nomdoc_nominee (nomineeId),
    CONSTRAINT fk_nomdoc_nominee FOREIGN KEY (nomineeId) REFERENCES employee_nominees(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS nominee_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nomineeId INT NULL,
    employeeId INT NULL,
    action VARCHAR(20) NOT NULL,
    performedBy VARCHAR(191) NULL,
    performedById INT NULL,
    previousValues MEDIUMTEXT NULL,
    newValues MEDIUMTEXT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_nomaudit_employee (employeeId),
    INDEX idx_nomaudit_nominee (nomineeId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

(async () => {
  try {
    for (const sql of STATEMENTS) { await prisma.$executeRawUnsafe(sql); }
    const tables = await prisma.$queryRawUnsafe(
      "SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('employee_nominees','nominee_documents','nominee_audit_logs')"
    );
    console.log('Nominee tables present:');
    tables.forEach(t => console.log('  ✓', t.TABLE_NAME));
  } catch (e) {
    console.error('CREATE FAILED:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
