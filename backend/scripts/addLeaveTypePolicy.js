/**
 * Additive, idempotent migration for gender-based leave eligibility:
 *   • CREATE TABLE `leave_type_policy`  (per-company leave-type master)
 *
 * Uses raw CREATE (NOT `prisma db push`, which drifts/resets live data — see the
 * deploy landmine notes). Safe to re-run: an "already exists" error is ignored.
 *
 * Nothing is seeded here. leaveEligibilityService carries the defaults and only
 * writes a row when HR actually changes one, so a company that never touches the
 * configuration keeps working with zero rows in this table.
 *
 *   node scripts/addLeaveTypePolicy.js
 *   npx prisma generate
 */
const prisma = require('../src/config/prisma');

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS \`leave_type_policy\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`companyId\` INT NOT NULL,
    \`code\` VARCHAR(64) NOT NULL,
    \`label\` VARCHAR(191) NOT NULL,
    \`eligibleGender\` VARCHAR(16) NOT NULL DEFAULT 'All',
    \`enabled\` BOOLEAN NOT NULL DEFAULT true,
    \`sortOrder\` INT NOT NULL DEFAULT 0,
    \`isSystem\` BOOLEAN NOT NULL DEFAULT true,
    \`updatedBy\` VARCHAR(191) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`),
    UNIQUE INDEX \`leave_type_policy_companyId_code_key\` (\`companyId\`, \`code\`),
    INDEX \`leave_type_policy_companyId_idx\` (\`companyId\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
];

const isBenign = (e) => {
  const m = String((e && e.message) || e).toLowerCase();
  return m.includes('duplicate') || m.includes('already exists') || m.includes('exists');
};

(async () => {
  let ok = 0, skipped = 0, failed = 0;
  for (const sql of STATEMENTS) {
    const label = sql.trim().split('\n')[0].slice(0, 70);
    try {
      await prisma.$executeRawUnsafe(sql);
      ok++;
      console.log('  ✓ ' + label);
    } catch (e) {
      if (isBenign(e)) { skipped++; console.log('  • already present — ' + label); }
      else { failed++; console.error('  ✗ FAILED — ' + label + '\n    ' + (e.message || e)); }
    }
  }
  console.log(`\nDone. ${ok} statement(s) applied, ${skipped} already present, ${failed} failed.`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
})();
