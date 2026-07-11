/**
 * Additive migration — `payroll_worksheet.deductionsJson`.
 *
 * The worksheet's deductions were 11 FIXED columns (pf … otherDeductions), so a
 * company could not itemise LWP / Food / Uniform / Notice Recovery, nor any
 * component it defines later in the Component Builder. Everything else was
 * forced into the `otherDeductions` bucket.
 *
 * `deductionsJson` holds the COMPLETE, self-describing deduction set for a
 * worksheet row:
 *
 *   [ { "key": "pf",  "label": "Provident Fund (PF)", "amount": 4560 },
 *     { "key": "lwp", "label": "Leave Without Pay (LWP)", "amount": 5000 },
 *     { "key": "pc_17", "label": "Canteen Recovery", "amount": 250 } ]
 *
 * Self-describing on purpose: a payslip PDF can render a custom component
 * without looking its label up, and a component later renamed or archived in
 * settings does not rewrite history on an already-issued payslip.
 *
 * The 11 legacy columns are STILL written for the keys they cover, so anything
 * reading them directly keeps working. `deductionsJson` is authoritative when
 * present.
 *
 * ADDITIVE and IDEMPOTENT: adds one nullable column, drops nothing, rewrites no
 * rows. Safe to re-run. `prisma db push` leaves this table alone (it is not a
 * Prisma model), so this must be run explicitly on each environment.
 *
 *   node backend/scripts/addWorksheetDeductionsJson.js
 */
const prisma = require('../src/config/prisma');

async function hasColumn(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, column,
  );
  return Number(rows[0]?.c || 0) > 0;
}

(async () => {
  try {
    const tbl = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_worksheet'`,
    );
    if (!Number(tbl[0]?.c || 0)) {
      console.error('✖ payroll_worksheet does not exist. Run createPayrollWorksheetTables.js first.');
      process.exit(1);
    }

    if (await hasColumn('payroll_worksheet', 'deductionsJson')) {
      console.log('= payroll_worksheet.deductionsJson already present — nothing to do.');
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE payroll_worksheet ADD COLUMN deductionsJson TEXT NULL AFTER otherDeductions',
      );
      console.log('+ added payroll_worksheet.deductionsJson (TEXT NULL)');
    }

    const cnt = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM payroll_worksheet');
    console.log(`✔ done. payroll_worksheet rows untouched: ${Number(cnt[0].c)}`);
  } catch (e) {
    console.error('✖ migration failed:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
