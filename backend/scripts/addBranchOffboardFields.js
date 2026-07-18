/**
 * Additive migration — Branch offboarding columns.
 *
 * Adds the soft-offboard metadata columns to `Branch`. ADDITIVE AND IDEMPOTENT:
 * each column is added only when absent, so re-running is safe.
 *
 * Run this on every environment BEFORE deploying the branch-offboarding feature:
 *   node scripts/addBranchOffboardFields.js
 *
 * DO NOT use `prisma db push` to apply these. Pushing the repo schema at an
 * existing database drops columns it doesn't know about — a known landmine on
 * this project's live RDS. Always ALTER.
 */
const prisma = require('../src/config/prisma');

// column name → DDL type. Every column is NULLable so existing rows are valid
// without a backfill (a branch that was never offboarded has no offboard data).
const COLUMNS = {
  offboardReason: 'TEXT NULL',
  offboardEffectiveDate: 'DATETIME(3) NULL',
  offboardedAt: 'DATETIME(3) NULL',
  offboardedBy: 'VARCHAR(191) NULL',
  offboardEmployeeAction: 'VARCHAR(32) NULL',
  offboardTransferBranchId: 'INT NULL',
};

async function main() {
  const existing = await prisma.$queryRawUnsafe(
    `SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Branch'`
  );
  const have = new Set(existing.map(r => r.c));

  const missing = Object.entries(COLUMNS).filter(([name]) => !have.has(name));
  if (missing.length === 0) {
    console.log('[branch-offboard] all columns already present — nothing to do.');
    return;
  }

  for (const [name, type] of missing) {
    const sql = `ALTER TABLE \`Branch\` ADD COLUMN \`${name}\` ${type}`;
    console.log('[branch-offboard] ' + sql);
    await prisma.$executeRawUnsafe(sql);
  }
  console.log(`[branch-offboard] added ${missing.length} column(s).`);
}

main()
  .catch(e => { console.error('[branch-offboard] FAILED:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
