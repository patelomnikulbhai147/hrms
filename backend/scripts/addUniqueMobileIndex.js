/**
 * Additive & idempotent — enforce "one mobile = one employee identity" at the
 * DATABASE layer by adding a UNIQUE index on TemporaryEmployee.mobile.
 *
 * SAFE BY DESIGN:
 *  • If the unique index already exists → skip.
 *  • If the column currently holds duplicate mobiles → DO NOT add the index
 *    (it would fail); instead print the offending groups and exit 0 so the
 *    deploy is never blocked. The application layer still enforces uniqueness,
 *    and you can clean the duplicates, then re-run this to add the hard index.
 *  • Never drops/alters data. Avoids `prisma db push` (the live DB has drift).
 *
 *   node scripts/addUniqueMobileIndex.js
 */
const prisma = require('../src/config/prisma');

const TABLE = 'TemporaryEmployee';
const INDEX = 'TemporaryEmployee_mobile_key';

async function indexExists() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    TABLE, INDEX,
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function findDuplicates() {
  // Group on the raw stored value; report any mobile used more than once.
  return prisma.$queryRawUnsafe(
    `SELECT mobile, COUNT(*) AS c FROM \`${TABLE}\`
     WHERE mobile IS NOT NULL AND mobile <> ''
     GROUP BY mobile HAVING c > 1 ORDER BY c DESC`,
  );
}

(async () => {
  try {
    if (await indexExists()) {
      console.log(`= ${INDEX} already exists — skipped.`);
      return;
    }
    const dups = await findDuplicates();
    if (dups.length) {
      console.warn(`! Cannot add UNIQUE index yet — ${dups.length} duplicate mobile value(s) found in ${TABLE}:`);
      for (const d of dups) console.warn(`    ${d.mobile} → ${Number(d.c)} records`);
      console.warn('  The application layer still blocks new duplicates. Clean these, then re-run this script.');
      return; // exit 0 — never block the deploy
    }
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${TABLE}\` ADD UNIQUE INDEX \`${INDEX}\` (\`mobile\`)`,
    );
    console.log(`+ added UNIQUE index ${INDEX} on ${TABLE}.mobile`);
  } catch (e) {
    console.error('Migration failed:', e.message); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
