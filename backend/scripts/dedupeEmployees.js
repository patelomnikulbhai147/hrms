/**
 * Employee de-duplication & data-integrity cleanup.
 *
 * Approved plan (Audit 2026-06-12):
 *  - 3 confirmed duplicate pairs (same person, same phone). Keep the Ahmedabad /
 *    original lower-code record as the SURVIVOR; re-point every child record
 *    (payroll, attendance, leave, overtime) from the DUPLICATE to the survivor;
 *    then delete the duplicate Employee row.
 *  - 2 blank-name placeholder rows (name "-", no phone, no payroll): delete
 *    outright (their attendance rows cascade-delete).
 *
 * Child tables reference Employee.id (Int PK), NOT the employeeId code string.
 * Only Payroll has a unique key [employeeId, month, year, companyId]; when the
 * survivor already owns a payslip for the same period the duplicate's payslip is
 * dropped instead of re-pointed (the survivor's is authoritative).
 *
 * A full snapshot of every affected row is written to
 * scratch/dedupe-snapshot.json before any mutation, so the operation is
 * reversible.
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

// [survivorId, duplicateId]
const MERGES = [
  { survivor: 199, duplicate: 840, label: 'PRAJAPATI POOJA RAMANIKBHAI (AHMD<-SIDD)' },
  { survivor: 298, duplicate: 772, label: 'PRANALI JATINKUMAR MANDANKA (AHMD dup)' },
  { survivor: 569, duplicate: 795, label: 'JADAV BHAVIKABEN BATUKBHAI (AHMD<-BHAV)' },
];
const BLANK_DELETE = [621, 703]; // VE-AHMD-0615, VE-AHMD-0697

async function snapshot(ids) {
  const [employees, payroll, attendance, leave, overtime] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: ids } } }),
    prisma.payroll.findMany({ where: { employeeId: { in: ids } } }),
    prisma.attendance.findMany({ where: { employeeId: { in: ids } } }),
    prisma.leaveRequest.findMany({ where: { employeeId: { in: ids } } }),
    prisma.overtime.findMany({ where: { employeeId: { in: ids } } }),
  ]);
  return { employees, payroll, attendance, leave, overtime };
}

async function main() {
  const affected = [
    ...MERGES.flatMap(m => [m.survivor, m.duplicate]),
    ...BLANK_DELETE,
  ];

  const before = await snapshot(affected);
  const dir = path.join(__dirname, '..', 'scratch');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'dedupe-snapshot.json'), JSON.stringify(before, null, 2));
  console.log('Snapshot written: scratch/dedupe-snapshot.json (' +
    before.employees.length + ' employees, ' + before.payroll.length + ' payroll, ' +
    before.attendance.length + ' attendance, ' + before.leave.length + ' leave)\n');

  const report = [];

  for (const m of MERGES) {
    const moved = { payroll: 0, payrollDropped: 0, attendance: 0, leave: 0, overtime: 0 };

    // Payroll — respect the [employeeId,month,year,companyId] unique key.
    const dupPay = await prisma.payroll.findMany({ where: { employeeId: m.duplicate } });
    for (const pr of dupPay) {
      const clash = await prisma.payroll.findFirst({
        where: { employeeId: m.survivor, month: pr.month, year: pr.year, companyId: pr.companyId },
      });
      if (clash) {
        await prisma.payroll.delete({ where: { id: pr.id } });
        moved.payrollDropped++;
      } else {
        await prisma.payroll.update({ where: { id: pr.id }, data: { employeeId: m.survivor } });
        moved.payroll++;
      }
    }

    // No unique key on these — re-point everything.
    moved.attendance = (await prisma.attendance.updateMany({ where: { employeeId: m.duplicate }, data: { employeeId: m.survivor } })).count;
    moved.leave = (await prisma.leaveRequest.updateMany({ where: { employeeId: m.duplicate }, data: { employeeId: m.survivor } })).count;
    moved.overtime = (await prisma.overtime.updateMany({ where: { employeeId: m.duplicate }, data: { employeeId: m.survivor } })).count;

    await prisma.employee.delete({ where: { id: m.duplicate } });

    const line = `MERGED ${m.label}: dup id${m.duplicate} -> survivor id${m.survivor} | ` +
      `payroll moved ${moved.payroll}, dropped ${moved.payrollDropped}; attendance ${moved.attendance}; leave ${moved.leave}; overtime ${moved.overtime}`;
    console.log(line);
    report.push(line);
  }

  for (const id of BLANK_DELETE) {
    const e = before.employees.find(x => x.id === id);
    await prisma.employee.delete({ where: { id } }); // attendance cascades
    const line = `DELETED blank row id${id} (${e ? e.employeeId : '?'}) — name "-", cascaded its attendance`;
    console.log(line);
    report.push(line);
  }

  // Final counts
  const [emp, pay, att, lv, ot] = await Promise.all([
    prisma.employee.count(), prisma.payroll.count(), prisma.attendance.count(),
    prisma.leaveRequest.count(), prisma.overtime.count(),
  ]);
  const g = await prisma.employee.groupBy({ by: ['branchId'], _count: { _all: true }, orderBy: { branchId: 'asc' } });
  console.log('\nFINAL: employees=' + emp + ' payroll=' + pay + ' attendance=' + att + ' leave=' + lv + ' overtime=' + ot);
  console.log('Per-branch:', g.map(x => 'B' + x.branchId + '=' + x._count._all).join(' '));

  fs.writeFileSync(path.join(dir, 'dedupe-report.txt'),
    report.join('\n') + `\n\nFINAL employees=${emp} payroll=${pay} attendance=${att} leave=${lv} overtime=${ot}\n` +
    'Per-branch: ' + g.map(x => 'B' + x.branchId + '=' + x._count._all).join(' ') + '\n');
  console.log('\nReport written: scratch/dedupe-report.txt');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
