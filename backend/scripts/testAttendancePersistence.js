// Standalone persistence regression for the importOne overwrite guard.
// Proves a punch-less biometric re-sync can NEVER flip a saved record to Absent,
// that re-sync is idempotent, that Absent→Present still upgrades, and that a
// human-entered record survives a punch-less sync. Self-cleaning throwaway fixtures.
//
//   node scripts/testAttendancePersistence.js
//
// Safe to run against production: it creates its own QA company/employee, touches
// only those rows, and deletes them at the end. No existing data is read or written.
const prisma = require('../src/config/prisma');
const sync = require('../src/services/etimeoffice/etimeSyncService');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { PASS++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
  else { FAIL++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};
const rec = (o) => ({ Empcode: '', Name: '', INTime: '', OUTTime: '', WorkTime: '', OverTime: '', Status: '', Late_In: '', Erl_Out: '', Remark: '', DateString: '', ...o });

(async () => {
  const co = await prisma.company.create({ data: { name: 'QA-PERSIST-' + Date.now(), plan: 'Enterprise' } });
  const emp = await prisma.employee.create({ data: {
    companyId: co.id, employeeId: 'PERS-1', biometricId: 'PB1', name: 'Persist Test',
    email: 'persist' + Date.now() + '@qa.local', department: 'Ops', designation: 'X',
    salary: 1000, status: 'Active', joinDate: new Date('2024-01-01'),
  } });
  const cleanup = async () => {
    await prisma.attendance.deleteMany({ where: { employeeId: emp.id } }).catch(() => {});
    await prisma.employee.delete({ where: { id: emp.id } }).catch(() => {});
    await prisma.company.delete({ where: { id: co.id } }).catch(() => {});
  };

  try {
    const D = '15/08/2026', ISO = '2026-08-15';
    const get = () => prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: ISO } } });

    await sync.importOne(prisma, co.id, emp, rec({ Empcode: 'PB1', INTime: '09:30', OUTTime: '18:00', WorkTime: '08:00', Status: 'P', DateString: D }));
    let r = await get();
    ok('initial punch → Present', r && r.status === 'Present' && r.clockIn === '09:30', `${r?.status}/${r?.clockIn}`);

    const o2 = await sync.importOne(prisma, co.id, emp, rec({ Empcode: 'PB1', INTime: '09:30', OUTTime: '18:00', WorkTime: '08:00', Status: 'P', DateString: D }));
    r = await get();
    ok('re-sync same day idempotent (no dup)', o2 === 'updated' && r.status === 'Present', `${o2}/${r?.status}`);

    const o3 = await sync.importOne(prisma, co.id, emp, rec({ Empcode: 'PB1', INTime: '--:--', OUTTime: '--:--', Status: 'A', DateString: D }));
    r = await get();
    ok('no-punch Absent re-sync PRESERVES Present', o3 === 'skipped' && r.status === 'Present' && r.clockIn === '09:30', `${o3}/${r?.status}/${r?.clockIn}`);

    const o4 = await sync.importOne(prisma, co.id, emp, rec({ Empcode: 'PB1', INTime: '--:--', Status: '', DateString: D }));
    r = await get();
    ok('blank punch-less re-sync PRESERVES Present', o4 === 'skipped' && r.status === 'Present', `${o4}/${r?.status}`);

    const UD = '16/08/2026', UISO = '2026-08-16';
    const getU = () => prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: UISO } } });
    await sync.importOne(prisma, co.id, emp, rec({ Empcode: 'PB1', INTime: '--:--', Status: 'A', DateString: UD }));
    const oU = await sync.importOne(prisma, co.id, emp, rec({ Empcode: 'PB1', INTime: '10:00', OUTTime: '17:00', WorkTime: '07:00', Status: 'P', DateString: UD }));
    const ur = await getU();
    ok('Absent→Present upgrade still works', oU === 'updated' && ur.status === 'Present' && ur.clockIn === '10:00', `${oU}/${ur?.status}`);

    const LD = '17/08/2026', LISO = '2026-08-17';
    await prisma.attendance.create({ data: { companyId: co.id, employeeId: emp.id, date: LISO, status: 'Leave', clockIn: '', clockOut: '', hoursWorked: 0, flags: { source: 'Daily Attendance' } } });
    const oL = await sync.importOne(prisma, co.id, emp, rec({ Empcode: 'PB1', INTime: '--:--', Status: 'A', DateString: LD }));
    const lr = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: LISO } } });
    ok('manual Leave preserved vs punch-less sync', oL === 'skipped' && lr.status === 'Leave', `${oL}/${lr?.status}`);

    const dupes = await prisma.attendance.groupBy({ by: ['employeeId', 'date'], where: { employeeId: emp.id }, _count: { _all: true } });
    ok('no duplicate (employeeId,date) rows', dupes.every((g) => g._count._all === 1), `groups=${dupes.length}`);
  } finally {
    await cleanup();
  }
  console.log(`\nATTENDANCE PERSISTENCE: ${PASS} passed, ${FAIL} failed`);
  await prisma.$disconnect();
  process.exit(FAIL ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e); await prisma.$disconnect(); process.exit(1); });
