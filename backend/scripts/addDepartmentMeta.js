/**
 * Additive & idempotent — adds Company.departmentMeta (JSON): rich per-department
 * metadata keyed by name (code/description/status/color/order/head/…). Keeps the
 * existing customDepartments (name array) as the source of truth. NON-destructive;
 * avoids `prisma db push`. Run then `npx prisma generate`.
 *   node scripts/addDepartmentMeta.js
 */
const prisma = require('../src/config/prisma');

(async () => {
  try {
    // Resolve the real Company table name (default map is "Company"; MySQL may
    // lower-case it depending on lower_case_table_names).
    const t = await prisma.$queryRawUnsafe(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'company' LIMIT 1`
    );
    const table = t?.[0]?.name;
    if (!table) { console.error('Could not find the Company table.'); process.exitCode = 1; return; }

    const cols = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'departmentMeta'`,
      table
    );
    if (Number(cols?.[0]?.c || 0) > 0) {
      console.log(`= ${table}.departmentMeta already present — nothing to do.`);
    } else {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${table}\` ADD COLUMN \`departmentMeta\` JSON NULL AFTER \`customDepartments\``
      );
      console.log(`+ added column ${table}.departmentMeta`);
    }
    console.log('Done. Run `npx prisma generate` next.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
