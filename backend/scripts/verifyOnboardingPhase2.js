// Phase-2 verification: rich demo generation + safe removal.
// Builds a throwaway company holding BOTH a real employee (with real
// attendance/payroll/document/notification/holiday) AND generated demo data,
// then removes the sample data and proves ONLY demo rows were deleted and every
// real record survived. Self-cleaning. Run: node scripts/verifyOnboardingPhase2.js
const prisma = require('../src/config/prisma');
const { generateDemoWorkspace, removeSampleData, DEMO_EMPLOYEE_PREFIX, DEMO_MARKER } = require('../src/services/demoDataService');

const CID = 990001, BID = 990002;
const ok = (c, m) => console.log(`${c ? 'PASS ✔' : 'FAIL ✗'}  ${m}`);
const wipe = async () => {
  const emps = await prisma.employee.findMany({ where: { companyId: CID }, select: { id: true } });
  const ids = emps.map((e) => e.id);
  if (ids.length) { for (const t of ['attendance', 'payroll', 'leaveRequest', 'attendanceSummary', 'overtime', 'leaveBalance']) await prisma[t].deleteMany({ where: { employeeId: { in: ids } } }).catch(() => {}); }
  await prisma.document.deleteMany({ where: { companyId: CID } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { companyId: CID } }).catch(() => {});
  await prisma.communicationHoliday.deleteMany({ where: { companyId: CID } }).catch(() => {});
  await prisma.employee.deleteMany({ where: { companyId: CID } }).catch(() => {});
  await prisma.branch.deleteMany({ where: { id: BID } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: CID } }).catch(() => {});
};

(async () => {
  await wipe();
  await prisma.company.create({ data: { id: CID, name: 'ZZ Onboarding Test (throwaway)', plan: 'Free', isHeadOffice: true, employeeCount: 0 } });
  await prisma.branch.create({ data: { id: BID, companyId: CID, branchName: 'Head Office', branchCode: 'HO' } }).catch(() => {});

  // ── A REAL employee + real child records (must NEVER be deleted) ──
  const real = await prisma.employee.create({ data: { employeeId: 'REAL-0001', companyId: CID, branchId: BID, name: 'Real Person', email: 'real.person@realco.example', department: 'Operations', designation: 'Manager', joinDate: new Date(), salary: 50000, status: 'Active' } });
  await prisma.attendance.create({ data: { companyId: CID, employeeId: real.id, employeeName: real.name, date: '2026-07-01', status: 'Present' } });
  await prisma.payroll.create({ data: { companyId: CID, employeeId: real.id, employeeName: real.name, month: 'July', year: 2026, netSalary: 48000 } });
  await prisma.document.create({ data: { companyId: CID, employeeId: real.id, name: 'Real Contract', type: 'Legal', uploadedBy: 'Real HR', uploadedOn: '2026-07-01', size: '10 KB' } });
  await prisma.notification.create({ data: { companyId: CID, type: 'info', message: 'Real notification', timestamp: new Date().toISOString() } });
  await prisma.communicationHoliday.create({ data: { companyId: CID, name: 'Company Foundation Day', date: '2026-07-15', createdBy: 'Real HR' } });

  try {
    // ── Generate rich demo data ──
    const gen = await generateDemoWorkspace(CID, 'Verifier');
    ok(gen.created === 30, `generated 30 demo employees (got ${gen.created})`);
    ok(gen.attendance > 0 && gen.payroll === 60 && gen.summaries === 60,
      `rich data: ${gen.attendance} attendance, ${gen.payroll} payroll, ${gen.summaries} summaries, ${gen.leaves} leaves, ${gen.documents} docs, ${gen.holidays} holidays, ${gen.notifications} notifications`);

    const demoEmpIds = (await prisma.employee.findMany({ where: { companyId: CID, employeeId: { startsWith: DEMO_EMPLOYEE_PREFIX } }, select: { id: true } })).map((e) => e.id);
    const demoAtt = await prisma.attendance.count({ where: { employeeId: { in: demoEmpIds } } });
    ok(demoAtt > 0, `demo attendance present before removal (${demoAtt})`);

    // ── Remove sample data ──
    const rem = await removeSampleData(CID);
    ok(rem.employees === 30, `removed 30 demo employees (got ${rem.employees})`);

    // Demo gone:
    const demoLeft = await prisma.employee.count({ where: { companyId: CID, employeeId: { startsWith: DEMO_EMPLOYEE_PREFIX } } });
    const demoAttLeft = await prisma.attendance.count({ where: { employeeId: { in: demoEmpIds } } });
    const demoPayLeft = await prisma.payroll.count({ where: { employeeId: { in: demoEmpIds } } });
    const demoDocLeft = await prisma.document.count({ where: { companyId: CID, uploadedBy: DEMO_MARKER } });
    const demoNoteLeft = await prisma.notification.count({ where: { companyId: CID, type: 'demo' } });
    const demoHolLeft = await prisma.communicationHoliday.count({ where: { companyId: CID, createdBy: DEMO_MARKER } });
    ok(demoLeft === 0 && demoAttLeft === 0 && demoPayLeft === 0 && demoDocLeft === 0 && demoNoteLeft === 0 && demoHolLeft === 0,
      `all demo rows gone (emp ${demoLeft}, att ${demoAttLeft}, pay ${demoPayLeft}, doc ${demoDocLeft}, note ${demoNoteLeft}, hol ${demoHolLeft})`);

    // REAL survives:
    const realEmp = await prisma.employee.count({ where: { id: real.id } });
    const realAtt = await prisma.attendance.count({ where: { employeeId: real.id } });
    const realPay = await prisma.payroll.count({ where: { employeeId: real.id } });
    const realDoc = await prisma.document.count({ where: { companyId: CID, uploadedBy: 'Real HR' } });
    const realNote = await prisma.notification.count({ where: { companyId: CID, type: 'info' } });
    const realHol = await prisma.communicationHoliday.count({ where: { companyId: CID, createdBy: 'Real HR' } });
    ok(realEmp === 1 && realAtt === 1 && realPay === 1 && realDoc === 1 && realNote === 1 && realHol === 1,
      `ALL real records survived (emp ${realEmp}, att ${realAtt}, pay ${realPay}, doc ${realDoc}, note ${realNote}, hol ${realHol})`);
  } finally {
    await wipe();
    console.log('\nCleaned up throwaway company', CID);
    await prisma.$disconnect();
  }
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
