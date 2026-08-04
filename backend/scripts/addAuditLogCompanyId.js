/**
 * AuditLog tenant column + indexes — additive & idempotent.
 *
 * The activity trail had no company column at all, so scoping it to a tenant
 * meant joining through `user`, and the table was indexed only on id and userId
 * — every such read scanned a table that is already tens of thousands of rows
 * and only grows.
 *
 * `companyId` is nullable on purpose: platform-level and system actions
 * genuinely belong to no single company, and back-filling them to an arbitrary
 * tenant would be a lie in the audit trail.
 *
 * NON-destructive: ADD COLUMN / ADD INDEX only, each guarded by an
 * information_schema check. Deliberately NOT `prisma db push` (EC2 landmine).
 *
 *   node scripts/addAuditLogCompanyId.js            # apply
 *   node scripts/addAuditLogCompanyId.js --backfill # also backfill from user.companyId
 */
const prisma = require('../src/config/prisma');

const BACKFILL = process.argv.includes('--backfill');
const TABLE = 'AuditLog';

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, column
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function indexExists(table, index) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table, index
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) { console.log(`  · ${table}.${column} already present`); return; }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`  + ${table}.${column}`);
}

/**
 * Resolve a table's REAL name as stored by the server.
 *
 * MySQL on Linux (RDS) is case-SENSITIVE about table names; on Windows it is
 * not. A hardcoded `user` therefore works locally and fails on RDS with
 * "Table 'corehrms.user' doesn't exist". Ask the catalogue instead of guessing.
 */
async function realTableName(nameLower) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = ?`,
    String(nameLower).toLowerCase()
  );
  return rows?.[0]?.t || null;
}

async function addIndex(table, index, columns) {
  if (await indexExists(table, index)) { console.log(`  · index ${index} already present`); return; }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (${columns})`);
  console.log(`  + index ${index}`);
}

async function main() {
  console.log('AuditLog tenant column — additive schema upgrade');

  await addColumn(TABLE, 'companyId', 'INT NULL');
  await addIndex(TABLE, 'AuditLog_companyId_idx', '`companyId`');
  await addIndex(TABLE, 'AuditLog_createdAt_idx', '`createdAt`');

  if (BACKFILL) {
    // Attribute historical rows to the acting user's company. Rows whose user is
    // gone, or who has no company (Super Admin / system), stay NULL — that is the
    // honest value, not a guess.
    const userTable = await realTableName('user');
    if (!userTable) {
      console.log('  ! no user table found — skipping backfill');
    } else {
      const res = await prisma.$executeRawUnsafe(
        `UPDATE \`${TABLE}\` a
           JOIN \`${userTable}\` u ON u.id = a.userId
            SET a.companyId = u.companyId
          WHERE a.companyId IS NULL AND u.companyId IS NOT NULL`
      );
      console.log(`  ~ back-filled ${res} historical row(s) from ${userTable}.companyId`);
    }
  } else {
    console.log('  (run with --backfill to populate historical rows)');
  }

  const [{ total, scoped }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS total, SUM(companyId IS NOT NULL) AS scoped FROM \`${TABLE}\``
  );
  console.log(`\n✅ AuditLog ready — ${Number(total)} rows, ${Number(scoped || 0)} carry a companyId.`);
}

main()
  .catch((e) => { console.error('FAILED:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
