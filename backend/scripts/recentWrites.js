// Show the most recently written attendance rows with full timestamps, to answer
// "did the A->P change actually hit the database?" YES/NO.
const prisma = require('../src/config/prisma');
(async () => {
  try {
    const now = new Date();
    const latest = await prisma.attendance.findMany({
      orderBy: { updatedAt: 'desc' }, take: 15,
      select: { id: true, employeeId: true, employeeName: true, date: true, status: true, createdAt: true, updatedAt: true },
    });
    console.log('Server time now:', now.toISOString());
    console.log('\nMost recently UPDATED attendance rows:');
    latest.forEach(r => {
      const ageMin = ((now - new Date(r.updatedAt)) / 60000).toFixed(1);
      console.log(`  #${r.id} emp=${r.employeeId} (${r.employeeName}) ${r.date} = ${r.status}  | updated ${ageMin} min ago (${new Date(r.updatedAt).toISOString()})`);
    });
  } catch (e) {
    console.error('FAILED:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
