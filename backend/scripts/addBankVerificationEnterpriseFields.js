/**
 * Enterprise Bank Account Verification — additive & idempotent schema upgrade.
 *
 * Adds the full verification record to `bank_verification_audit_logs`, the
 * denormalised verification summary + micr/swift to `employees`, and the
 * payroll-gate flag to `verification_settings`.
 *
 * NON-destructive: every statement is ADD COLUMN IF NOT EXISTS / CREATE INDEX
 * guarded, no column is dropped, no data is rewritten. Existing rows keep their
 * values and get NULL for the new columns.
 *
 * Deliberately NOT `prisma db push`: on this schema db push also applies
 * unrelated destructive drops against live data (see the EC2 deploy landmine).
 *
 *   node scripts/addBankVerificationEnterpriseFields.js
 */
const prisma = require('../src/config/prisma');

// MySQL 8 has no ADD COLUMN IF NOT EXISTS, so each column is checked first.
async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function indexExists(table, indexName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`  · ${table}.${column} already present`);
    return false;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`  + ${table}.${column}`);
  return true;
}

async function addIndex(table, indexName, columns) {
  if (await indexExists(table, indexName)) {
    console.log(`  · ${table}.${indexName} already present`);
    return false;
  }
  await prisma.$executeRawUnsafe(`CREATE INDEX \`${indexName}\` ON \`${table}\` (${columns})`);
  console.log(`  + index ${table}.${indexName}`);
  return true;
}

const AUDIT_COLUMNS = [
  // Who / where
  ['employeeId', 'INT NULL'],
  ['employeeCode', 'VARCHAR(64) NULL'],
  ['branchId', 'INT NULL'],
  ['branchName', 'VARCHAR(191) NULL'],
  ['department', 'VARCHAR(191) NULL'],
  ['designation', 'VARCHAR(191) NULL'],
  ['employeeEmail', 'VARCHAR(191) NULL'],
  ['employeePhone', 'VARCHAR(32) NULL'],
  ['verifiedById', 'INT NULL'],
  ['verifiedByName', 'VARCHAR(191) NULL'],
  ['verifiedByRole', 'VARCHAR(64) NULL'],
  // Provider identity
  ['environment', 'VARCHAR(32) NULL'],
  ['verificationId', 'VARCHAR(191) NULL'],
  ['requestId', 'VARCHAR(191) NULL'],
  ['verificationSource', 'VARCHAR(64) NULL'],
  // Bank response
  ['accountHolderName', 'VARCHAR(191) NULL'],
  ['bankName', 'VARCHAR(191) NULL'],
  ['branchName2', 'VARCHAR(191) NULL'],
  ['branchAddress', 'TEXT NULL'],
  ['city', 'VARCHAR(128) NULL'],
  ['district', 'VARCHAR(128) NULL'],
  ['state', 'VARCHAR(128) NULL'],
  ['micr', 'VARCHAR(32) NULL'],
  ['swift', 'VARCHAR(32) NULL'],
  ['utr', 'VARCHAR(64) NULL'],
  ['accountStatus', 'VARCHAR(64) NULL'],
  ['accountStatusCode', 'VARCHAR(64) NULL'],
  ['verificationMessage', 'TEXT NULL'],
  // Name match
  ['enteredName', 'VARCHAR(191) NULL'],
  ['nameMatchResult', 'VARCHAR(32) NULL'],
  ['nameMatchScore', 'INT NULL'],
  ['nameMatchSource', 'VARCHAR(32) NULL'],
  // API log
  ['requestTimestamp', 'DATETIME(3) NULL'],
  ['responseTimestamp', 'DATETIME(3) NULL'],
  ['httpStatus', 'INT NULL'],
  ['retryCount', 'INT NOT NULL DEFAULT 0'],
  ['rawRequest', 'JSON NULL'],
  ['rawResponse', 'JSON NULL'],
  // Billing
  ['verificationCost', 'INT NULL'],
  ['walletBalanceBefore', 'INT NULL'],
  ['walletBalanceAfter', 'INT NULL'],
];

const EMPLOYEE_COLUMNS = [
  ['micr', 'VARCHAR(32) NULL'],
  ['swift', 'VARCHAR(32) NULL'],
  ['bankVerificationStatus', 'VARCHAR(32) NULL'],
  ['bankVerificationRefId', 'VARCHAR(191) NULL'],
  ['bankVerificationId', 'VARCHAR(191) NULL'],
  ['bankVerifiedAt', 'DATETIME(3) NULL'],
  ['bankVerifiedBy', 'VARCHAR(191) NULL'],
  ['bankVerificationProvider', 'VARCHAR(64) NULL'],
  ['bankVerificationEnvironment', 'VARCHAR(32) NULL'],
  ['bankNameMatchResult', 'VARCHAR(32) NULL'],
  ['bankNameMatchScore', 'INT NULL'],
];

(async () => {
  let added = 0;
  try {
    console.log('bank_verification_audit_logs —');
    for (const [col, def] of AUDIT_COLUMNS) {
      if (await addColumn('bank_verification_audit_logs', col, def)) added++;
    }
    await addIndex('bank_verification_audit_logs', 'bank_verification_audit_logs_employeeId_idx', '`employeeId`');
    await addIndex('bank_verification_audit_logs', 'bank_verification_audit_logs_companyId_status_idx', '`companyId`, `status`');
    await addIndex('bank_verification_audit_logs', 'bank_verification_audit_logs_createdAt_idx', '`createdAt`');

    // The Employee model carries no @@map, so its table is `Employee`.
    console.log('Employee —');
    for (const [col, def] of EMPLOYEE_COLUMNS) {
      if (await addColumn('Employee', col, def)) added++;
    }

    console.log('verification_settings —');
    if (await addColumn('verification_settings', 'requireVerifiedBankForPayroll', 'TINYINT(1) NOT NULL DEFAULT 0')) added++;

    console.log(`\nDone. ${added} column(s) added. Run \`npx prisma generate\` and restart the backend.`);
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
