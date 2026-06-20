// Prove the root cause: OLD getAll filtered attendance by attendance.companyId ===
// workspaceId, which excluded saved rows in branch/sub workspaces. NEW getAll scopes
// by employee membership and returns them.
const prisma = require('../src/config/prisma');
(async () => {
  try {
    const EMP = 799;
    const emp = await prisma.employee.findUnique({ where: { id: EMP }, select: { id: true, name: true, companyId: true, branchId: true, branchLocation: true } });
    console.log('Employee:', emp);

    const empAtt = await prisma.attendance.findMany({ where: { employeeId: EMP }, select: { id: true, date: true, status: true, companyId: true } });
    console.log(`\nThis employee has ${empAtt.length} attendance rows; their companyId(s):`, [...new Set(empAtt.map(a => a.companyId))]);

    // Candidate workspaces a user might be in: the employee's company + its branches.
    const branches = await prisma.company.findMany({ where: { parentCompanyId: emp.companyId }, select: { id: true, name: true } }).catch(() => []);
    const workspaces = [emp.companyId, ...(emp.branchId ? [emp.branchId] : []), ...branches.map(b => b.id)];
    console.log('\nWorkspaces to test:', workspaces, branches.length ? `(branches: ${branches.map(b => b.id).join(',')})` : '');

    for (const ws of [...new Set(workspaces)]) {
      // OLD logic: attendance.companyId === ws
      const oldRows = await prisma.attendance.count({ where: { employeeId: EMP, companyId: ws } });
      // NEW logic: employee in scope of ws (companyId=ws OR branchId=ws) -> their attendance
      const scoped = await prisma.employee.findMany({ where: { OR: [{ companyId: ws }, { branchId: ws }] }, select: { id: true } });
      const inScope = scoped.some(e => e.id === EMP);
      const newRows = inScope ? empAtt.length : 0;
      console.log(`  workspace=${ws}:  OLD returns ${oldRows} of emp's rows  |  NEW returns ${newRows}  ${oldRows === 0 && newRows > 0 ? '  <-- OLD would REVERT, NEW fixes it' : ''}`);
    }
  } catch (e) {
    console.error('FAILED:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
