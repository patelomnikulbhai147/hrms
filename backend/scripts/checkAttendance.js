// Diagnostic: inspect the attendance table directly to see whether edits persist.
const prisma = require('../src/config/prisma');
(async () => {
  try {
    const total = await prisma.attendance.count();
    console.log('attendance row count:', total);
    const latest = await prisma.attendance.findMany({
      orderBy: { id: 'desc' }, take: 12,
      select: { id: true, employeeId: true, employeeName: true, companyId: true, date: true, status: true, createdAt: true, updatedAt: true },
    });
    console.log('\nLatest 12 attendance rows (by id):');
    latest.forEach(r => console.log(`#${r.id} emp=${r.employeeId} co=${r.companyId} ${r.date} ${r.status} created=${r.createdAt?.toISOString?.() || r.createdAt} updated=${r.updatedAt?.toISOString?.() || r.updatedAt}`));

    const attCo = await prisma.attendance.groupBy({ by: ['companyId'], _count: { _all: true } });
    console.log('\nAttendance rows by companyId:', attCo.map(c => `co${c.companyId}=${c._count._all}`).join(', '));

    const empCo = await prisma.employee.groupBy({ by: ['companyId'], _count: { _all: true } });
    console.log('Employees by companyId:', empCo.map(c => `co${c.companyId}=${c._count._all}`).join(', '));
  } catch (e) {
    console.error('DB CHECK FAILED:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
