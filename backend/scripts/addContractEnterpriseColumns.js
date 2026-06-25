/**
 * Idempotent migration — adds the enterprise contract columns to `contracts`.
 *
 * Safe to run repeatedly: each column is added only if missing (information_schema
 * check), so it never drops or rewrites existing data. Run with:
 *     node scripts/addContractEnterpriseColumns.js
 * then regenerate the client:  npx prisma generate
 */
const prisma = require('../src/config/prisma');

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, column
  );
  return Number(rows?.[0]?.n || 0) > 0;
}

async function addJsonColumn(table, column) {
  if (await columnExists(table, column)) {
    console.log(`• ${table}.${column} already exists — skipped.`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` JSON NULL`);
  console.log(`✓ Added ${table}.${column}`);
}

(async () => {
  try {
    console.log('Adding enterprise contract columns…');
    await addJsonColumn('contracts', 'details');
    await addJsonColumn('contracts', 'documents');
    await addJsonColumn('contracts', 'activity');
    console.log('Done. Now run:  npx prisma generate');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
