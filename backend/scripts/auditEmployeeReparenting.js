// READ-ONLY audit: employees that may have been re-parented across tenants by
// the old import-by-globally-unique-code flow (fixed 2026-08-18). Writes
// NOTHING. For each suspicious employee it prints the §21 report columns and a
// classification hint; repair decisions stay with a human.
//
// Signals swept:
//   1. Employee rows whose UPDATE_EMPLOYEE/UPSERT_EMPLOYEE audit entries were
//      written by a user of a DIFFERENT company than the employee's current one.
//   2. Employees whose payroll rows live under another company.
//   3. Employees whose attendance rows carry another company's id.
//   4. Employees whose leave requests carry another company's id.
const prisma = require('../src/config/prisma');

(async () => {
  const branches = await prisma.branch.findMany({ select: { id: true, companyId: true } });
  const branchParent = new Map(branches.map((b) => [b.id, b.companyId]));
  const own = (companyId) => branchParent.get(companyId) ?? companyId; // normalise branch keys
  const users = await prisma.user.findMany({ select: { id: true, name: true, companyId: true, role: true } });
  const userById = new Map(users.map((u) => [u.id, u]));

  const suspects = new Map(); // employeeId(int) -> { reasons: [] }
  const flag = (empId, reason) => {
    if (!suspects.has(empId)) suspects.set(empId, { reasons: [] });
    suspects.get(empId).reasons.push(reason);
  };

  // 1. cross-company employee edits in the audit log
  const logs = await prisma.auditLog.findMany({
    where: { module: 'Employee', action: { in: ['UPDATE_EMPLOYEE', 'UPSERT_EMPLOYEE'] } },
    select: { userId: true, targetId: true, createdAt: true },
  });
  const empIds = [...new Set(logs.map((l) => Number(l.targetId)).filter(Number.isFinite))];
  const emps = empIds.length
    ? await prisma.employee.findMany({ where: { id: { in: empIds } }, select: { id: true, companyId: true } })
    : [];
  const empCompany = new Map(emps.map((e) => [e.id, e.companyId]));
  for (const l of logs) {
    const eid = Number(l.targetId);
    const actor = userById.get(l.userId);
    const empCo = empCompany.get(eid);
    if (!actor || empCo == null) continue;
    if (own(actor.companyId) !== own(empCo)) {
      flag(eid, `edited ${l.createdAt.toISOString().slice(0, 10)} by ${actor.name} (C${actor.companyId}) while employee now in C${empCo}`);
    }
  }

  // 2-4. data rows living under another company
  const crossPayroll = await prisma.$queryRaw`
    SELECT p.employeeId AS eid, p.companyId AS rowCo, e.companyId AS empCo, COUNT(*) AS n
    FROM Payroll p JOIN Employee e ON p.employeeId = e.id
    WHERE p.companyId <> e.companyId AND p.companyId NOT IN (SELECT id FROM Branch)
    GROUP BY p.employeeId, p.companyId, e.companyId`;
  for (const r of crossPayroll) flag(Number(r.eid), `${r.n} payroll row(s) in C${r.rowCo}, employee in C${r.empCo}`);
  const crossAtt = await prisma.$queryRaw`
    SELECT a.employeeId AS eid, a.companyId AS rowCo, e.companyId AS empCo, COUNT(*) AS n
    FROM Attendance a JOIN Employee e ON a.employeeId = e.id
    WHERE a.companyId <> e.companyId AND a.companyId NOT IN (SELECT id FROM Branch)
    GROUP BY a.employeeId, a.companyId, e.companyId`;
  for (const r of crossAtt) flag(Number(r.eid), `${r.n} attendance row(s) in C${r.rowCo}, employee in C${r.empCo}`);
  const crossLeave = await prisma.$queryRaw`
    SELECT l.employeeId AS eid, l.companyId AS rowCo, e.companyId AS empCo, COUNT(*) AS n
    FROM LeaveRequest l JOIN Employee e ON l.employeeId = e.id
    WHERE l.companyId <> e.companyId AND l.companyId NOT IN (SELECT id FROM Branch)
    GROUP BY l.employeeId, l.companyId, e.companyId`;
  for (const r of crossLeave) flag(Number(r.eid), `${r.n} leave row(s) in C${r.rowCo}, employee in C${r.empCo}`);

  if (!suspects.size) {
    console.log('CLEAN — no cross-tenant re-parenting signals found.');
    await prisma.$disconnect();
    return;
  }
  const detail = await prisma.employee.findMany({
    where: { id: { in: [...suspects.keys()] } },
    select: { id: true, employeeId: true, name: true, companyId: true, branchId: true, createdAt: true, updatedAt: true },
  });
  console.log(`SUSPECTS: ${suspects.size} employee(s)\n`);
  for (const e of detail) {
    const [payroll, attendance] = await Promise.all([
      prisma.payroll.count({ where: { employeeId: e.id } }),
      prisma.attendance.count({ where: { employeeId: e.id } }),
    ]);
    console.log(`- id=${e.id} code=${e.employeeId} "${e.name}" C${e.companyId} br=${e.branchId ?? '-'} payroll=${payroll} attendance=${attendance}`);
    for (const rs of suspects.get(e.id).reasons.slice(0, 6)) console.log(`    · ${rs}`);
    console.log('    classification: MANUAL REVIEW (VALID TRANSFER vs IMPORT HIJACK — check audit trail)');
  }
  await prisma.$disconnect();
})().catch(async (e) => { console.error('FATAL:', e); await prisma.$disconnect(); process.exit(1); });
