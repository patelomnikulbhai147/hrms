// Replicate the frontend resolveStatus() against the REAL db for the recently
// edited employee, to prove what the Weekly grid would render after a refresh.
const prisma = require('../src/config/prisma');

function resolveStatus(empId, date, attendance, leaves) {
  const existing = attendance.find(a => a.employeeId === empId && a.date === date);
  if (existing) return { status: existing.status, source: 'DB record' };
  const onLeave = leaves.find(l => l.employeeId === empId && l.status === 'Approved' && date >= l.fromDate && date <= l.toDate);
  if (onLeave) return { status: 'Leave', source: 'approved leave' };
  const isSunday = new Date(date).getDay() === 0;
  return { status: isSunday ? 'Weekly Off' : 'Absent', source: 'computed default' };
}

(async () => {
  try {
    const EMP = 799;
    const dates = ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21'];
    // Simulate a Super Admin getAll (no scope filter) — exactly what the client receives.
    const attendance = await prisma.attendance.findMany({ where: {} });
    const leaves = await prisma.leaveRequest.findMany({ where: {} });
    console.log(`Loaded ${attendance.length} attendance + ${leaves.length} leave rows (client receives these on refresh).`);
    console.log(`\nWhat the Weekly grid renders for employee #${EMP} after refresh:`);
    for (const d of dates) {
      const r = resolveStatus(EMP, d, attendance, leaves);
      console.log(`  ${d} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d).getDay()]})  ->  ${r.status}   [${r.source}]`);
    }
    // Show the actual stored rows for this employee in that week.
    const rows = await prisma.attendance.findMany({ where: { employeeId: EMP, date: { in: dates } }, select: { id: true, date: true, status: true, employeeId: true } });
    console.log('\nActual DB rows for that employee/week:');
    rows.forEach(r => console.log(`  #${r.id} emp=${r.employeeId} ${r.date} = ${r.status}`));
  } catch (e) {
    console.error('FAILED:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
