/**
 * Additive & idempotent — onboarding expansion:
 *  • TemporaryEmployee.selfProfile  (JSON)  — all expanded EMPLOYEE-owned personal
 *    data that has no dedicated scalar column (name parts, marital status,
 *    nationality, blood group, alternate mobile, structured present/permanent
 *    address, extra identity numbers, banking extras, etc.).
 *  • Employee.employmentMeta        (JSON)  — extended HR EMPLOYMENT assignment
 *    captured at approval (grade, level, confirmation date, probation, wage/skill
 *    category, PF/ESI/PT, bonus eligibility, weekly-off, attendance/leave/holiday
 *    policy choices). A RECORD only — the payroll/attendance/leave engines are
 *    untouched and continue to read their own config.
 * NON-destructive; avoids `prisma db push`. Run locally + prod, then `prisma generate`.
 *   node scripts/addOnboardingExpansionFields.js
 */
const prisma = require('../src/config/prisma');

async function resolveTable(logicalName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?) LIMIT 1`,
    logicalName,
  );
  if (!rows?.[0]) throw new Error(`Table matching "${logicalName}" not found.`);
  return rows[0].t;
}
async function columnExists(table, col) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, col,
  );
  return Number(rows?.[0]?.c || 0) > 0;
}
async function addJsonColumn(logicalTable, col) {
  const table = await resolveTable(logicalTable);
  if (await columnExists(table, col)) { console.log(`= ${table}.${col} exists — skipped`); return 0; }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` JSON NULL`);
  console.log(`+ added ${table}.${col}`); return 1;
}

(async () => {
  try {
    let added = 0;
    added += await addJsonColumn('TemporaryEmployee', 'selfProfile');
    added += await addJsonColumn('Employee', 'employmentMeta');
    console.log(`Done. ${added} column(s) added.`);
  } catch (e) {
    console.error('Migration failed:', e.message); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
