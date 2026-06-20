// Add the UNIQUE(employeeId, date) constraint directly (no prisma db push, so the
// unrelated schema-drift columns are left untouched). Safe because duplicates were
// already removed. Idempotent: ignores "already exists".
const prisma = require('../src/config/prisma');

(async () => {
  try {
    // Does a unique index on (employeeId, date) already exist?
    const existing = await prisma.$queryRawUnsafe(
      `SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Attendance'
        GROUP BY INDEX_NAME, NON_UNIQUE
       HAVING cols = 'employeeId,date' AND NON_UNIQUE = 0`
    );
    if (existing.length) {
      console.log('Unique index already present:', existing[0].INDEX_NAME);
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `Attendance` ADD UNIQUE INDEX `Attendance_employeeId_date_key` (`employeeId`, `date`)'
      );
      console.log('Added UNIQUE INDEX Attendance_employeeId_date_key (employeeId, date).');
    }

    // Prove it: try to insert a duplicate; it must be rejected.
    const sample = await prisma.attendance.findFirst({ select: { employeeId: true, date: true } });
    if (sample) {
      try {
        await prisma.$executeRawUnsafe(
          'INSERT INTO `Attendance` (`companyId`,`employeeId`,`employeeName`,`department`,`date`,`status`) VALUES (1, ?, ?, ?, ?, ?)',
          sample.employeeId, 'DUP TEST', 'General', sample.date, 'Present'
        );
        console.log('WARNING: duplicate insert SUCCEEDED — constraint NOT enforced!');
      } catch (e) {
        console.log('Verified: duplicate insert correctly REJECTED ->', e.message.split('\n')[0]);
      }
    }
  } catch (e) {
    console.error('FAILED:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
