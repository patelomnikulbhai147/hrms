/**
 * Additive, idempotent migration — adds the attendance-snapshot columns used by
 * the single Payroll engine (Attendance Synchronization → Salary Worksheet).
 *
 * Uses ALTER TABLE ... ADD COLUMN (NOT `prisma db push`, which would drift/reset
 * live data — see the deploy landmine notes). Each ADD is wrapped so a
 * "duplicate column" error is ignored, making the script safe to re-run.
 */
const prisma = require('../src/config/prisma');

const STATEMENTS = [
  // AttendanceSummary — the source of truth
  "ALTER TABLE `AttendanceSummary` ADD COLUMN `workingDays` DOUBLE NOT NULL DEFAULT 0",
  "ALTER TABLE `AttendanceSummary` ADD COLUMN `weeklyOffDays` DOUBLE NOT NULL DEFAULT 0",
  "ALTER TABLE `AttendanceSummary` ADD COLUMN `holidayDays` DOUBLE NOT NULL DEFAULT 0",
  "ALTER TABLE `AttendanceSummary` ADD COLUMN `attendanceStatus` VARCHAR(191) NULL",
  "ALTER TABLE `AttendanceSummary` ADD COLUMN `attendanceSource` VARCHAR(191) NULL",
  "ALTER TABLE `AttendanceSummary` ADD COLUMN `syncedAt` DATETIME(3) NULL",
  // Payroll — mirrored snapshot for slip/register/reports + sync gate
  "ALTER TABLE `Payroll` ADD COLUMN `workingDays` DOUBLE NOT NULL DEFAULT 0",
  "ALTER TABLE `Payroll` ADD COLUMN `weeklyOffDays` DOUBLE NOT NULL DEFAULT 0",
  "ALTER TABLE `Payroll` ADD COLUMN `holidayDays` DOUBLE NOT NULL DEFAULT 0",
  "ALTER TABLE `Payroll` ADD COLUMN `attendanceSyncedAt` DATETIME(3) NULL",
  "ALTER TABLE `Payroll` ADD COLUMN `attendanceSource` VARCHAR(191) NULL",
];

const isDuplicate = (e) => {
  const m = String(e && e.message || e).toLowerCase();
  return m.includes('duplicate column') || m.includes('exists');
};

(async () => {
  let added = 0, skipped = 0;
  for (const sql of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      added++;
      console.log('  ✓ ' + sql);
    } catch (e) {
      if (isDuplicate(e)) { skipped++; console.log('  • already present — ' + sql.split('ADD COLUMN')[1].trim()); }
      else { console.error('  ✗ FAILED — ' + sql + '\n    ' + (e.message || e)); }
    }
  }
  console.log(`\nDone. ${added} column(s) added, ${skipped} already present.`);
  await prisma.$disconnect();
})();
