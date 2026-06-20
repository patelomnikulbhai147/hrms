// Find duplicate attendance rows (same employeeId + date) — the cause of the
// "edit reverts after refresh" bug.
const prisma = require('../src/config/prisma');
(async () => {
  try {
    const dupes = await prisma.$queryRawUnsafe(
      `SELECT employeeId, date, COUNT(*) AS n
         FROM Attendance
        GROUP BY employeeId, date
       HAVING COUNT(*) > 1
        ORDER BY n DESC`
    );
    const groups = dupes.length;
    const extraRows = dupes.reduce((s, d) => s + (Number(d.n) - 1), 0);
    console.log(`Duplicate (employeeId,date) groups: ${groups}`);
    console.log(`Redundant rows that must be removed: ${extraRows}`);
    console.log('\nTop 15 duplicate groups:');
    dupes.slice(0, 15).forEach(d => console.log(`  emp=${d.employeeId} ${d.date}  -> ${d.n} rows`));
  } catch (e) {
    console.error('FAILED:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
