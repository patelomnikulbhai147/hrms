// Additive, idempotent migration: add Employee.wcPolicyNumber (VARCHAR(100), nullable).
// Workmen Compensation (WC) insurance policy number — optional. Safe to run
// repeatedly and safe on live data: it only ADDS a nullable column and never runs
// `prisma db push` (per this repo's drift landmines). Run after pulling the schema
// change and before restarting the backend:
//   node scripts/addWcPolicyColumn.js
const prisma = require('../src/config/prisma');

(async () => {
  try {
    const [{ n }] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'Employee' AND column_name = 'wcPolicyNumber'`
    );
    if (Number(n) > 0) {
      console.log('Employee.wcPolicyNumber already exists — skipping column add.');
    } else {
      await prisma.$executeRawUnsafe('ALTER TABLE `Employee` ADD COLUMN `wcPolicyNumber` VARCHAR(100) NULL');
      console.log('Added Employee.wcPolicyNumber (VARCHAR(100) NULL).');
    }
  } catch (e) {
    console.error('Failed to add Employee.wcPolicyNumber:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
