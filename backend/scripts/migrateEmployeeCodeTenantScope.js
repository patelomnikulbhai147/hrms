// Employee code becomes TENANT-SCOPED (security fix, 2026-08-18).
//
//   before: UNIQUE(employeeId)              — global; one tenant's code blocks
//                                             (or hijacks) another tenant's
//   after:  UNIQUE(companyId, employeeId)   — per-company identity
//
// Order matters and the whole change is loss-proof:
//   1. ADD the compound unique — cannot fail: global uniqueness implies
//      compound uniqueness (every existing code appears exactly once anywhere,
//      so certainly once per company).
//   2. DROP the old single-column unique — only after step 1 holds, so there is
//      never a moment without a uniqueness guarantee on the code.
// Idempotent: each step checks information_schema first (table/index names
// resolved case-insensitively — RDS/Linux MySQL is case-sensitive). NEVER use
// prisma db push for this (see deploy runbook).
const prisma = require('../src/config/prisma');

const COMPOUND = 'Employee_companyId_employeeId_key'; // prisma's default name
const OLD_SINGLE = 'Employee_employeeId_key';

async function indexExists(table, name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT INDEX_NAME) AS n FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?) AND INDEX_NAME = ?`,
    table, name,
  );
  return Number(rows[0].n) > 0;
}

async function realTableName(lower) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = ?`, lower,
  );
  return rows.length ? rows[0].t : null;
}

(async () => {
  const table = await realTableName('employee');
  if (!table) throw new Error('Employee table not found');

  // Sanity: with the global unique in place duplicates are impossible, but if
  // this ever runs on a DB where the old index is already gone, verify anyway.
  const dups = await prisma.$queryRawUnsafe(
    `SELECT companyId, employeeId, COUNT(*) AS c FROM \`${table}\`
     GROUP BY companyId, employeeId HAVING c > 1 LIMIT 5`,
  );
  if (dups.length) {
    console.error('ABORT — duplicate (companyId, employeeId) pairs exist:', dups);
    process.exit(1);
  }

  if (await indexExists(table, COMPOUND)) {
    console.log(`[OK] ${COMPOUND} already present.`);
  } else {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${COMPOUND}\` (companyId, employeeId)`);
    console.log(`[ADDED] ${COMPOUND}`);
  }

  if (await indexExists(table, OLD_SINGLE)) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` DROP INDEX \`${OLD_SINGLE}\``);
    console.log(`[DROPPED] ${OLD_SINGLE} (global employee-code unique)`);
  } else {
    console.log(`[OK] ${OLD_SINGLE} already absent.`);
  }

  const final = await indexExists(table, COMPOUND);
  console.log(final ? 'DONE — employee code is now unique per company.' : 'ERROR — compound index missing!');
  await prisma.$disconnect();
  process.exit(final ? 0 : 1);
})().catch(async (e) => { console.error('FATAL:', e.message); await prisma.$disconnect(); process.exit(1); });
