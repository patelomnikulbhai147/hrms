/**
 * Additive, idempotent migration for the Attendance & Salary Deduction Policy
 * engine:
 *   • CREATE TABLE `deduction_policy`  (versioned per-company/branch policy store)
 *   • ALTER  TABLE `Payroll` ADD `policyVersion`  (which policy version a row used)
 *
 * Uses raw CREATE/ALTER (NOT `prisma db push`, which drifts/resets live data —
 * see the deploy landmine notes). Each statement is wrapped so an
 * "already exists" / "duplicate column" error is ignored → safe to re-run.
 *
 * Run once per environment after pulling this change:
 *   node scripts/addDeductionPolicy.js
 * Then regenerate the client:
 *   npx prisma generate
 */
const prisma = require('../src/config/prisma');

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS \`deduction_policy\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`companyId\` INT NOT NULL,
    \`branchId\` INT NULL,
    \`version\` INT NOT NULL DEFAULT 1,
    \`enabled\` BOOLEAN NOT NULL DEFAULT true,
    \`config\` JSON NOT NULL,
    \`reason\` TEXT NULL,
    \`createdBy\` VARCHAR(191) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`),
    INDEX \`deduction_policy_companyId_idx\` (\`companyId\`),
    INDEX \`deduction_policy_companyId_branchId_idx\` (\`companyId\`, \`branchId\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  "ALTER TABLE `Payroll` ADD COLUMN `policyVersion` INT NULL",
];

const isBenign = (e) => {
  const m = String((e && e.message) || e).toLowerCase();
  return m.includes('duplicate column') || m.includes('already exists') || m.includes('exists');
};

(async () => {
  let ok = 0, skipped = 0;
  for (const sql of STATEMENTS) {
    const label = sql.trim().split('\n')[0].slice(0, 70);
    try {
      await prisma.$executeRawUnsafe(sql);
      ok++;
      console.log('  ✓ ' + label);
    } catch (e) {
      if (isBenign(e)) { skipped++; console.log('  • already present — ' + label); }
      else { console.error('  ✗ FAILED — ' + label + '\n    ' + (e.message || e)); }
    }
  }
  console.log(`\nDone. ${ok} statement(s) applied, ${skipped} already present.`);
  await prisma.$disconnect();
})();
