// End-to-end verification of Phase-1 onboarding + FREE 30-employee limit.
// Builds a throwaway FREE company, generates the sample workspace, asserts the
// count + cap + enforcement, then removes ONLY what it created. Touches no real
// tenant. Run: node scripts/verifyOnboardingPhase1.js
const prisma = require('../src/config/prisma');
const { generateDemoWorkspace, DEMO_EMPLOYEE_PREFIX } = require('../src/services/demoDataService');
const { getCapacity, assertCapacity } = require('../src/services/employeeLimitService');

const CID = 990001, BID = 990002;
const ok = (c, m) => console.log(`${c ? 'PASS ✔' : 'FAIL ✗'}  ${m}`);

(async () => {
  // Clean any leftovers from a previous run.
  await prisma.employee.deleteMany({ where: { companyId: CID } });
  await prisma.branch.deleteMany({ where: { id: BID } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: CID } }).catch(() => {});

  await prisma.company.create({ data: { id: CID, name: 'ZZ Onboarding Test (throwaway)', plan: 'Free', isHeadOffice: true, employeeCount: 0 } });
  await prisma.branch.create({ data: { id: BID, companyId: CID, branchName: 'Head Office', branchCode: 'HO' } }).catch(async (e) => {
    // Branch schema may require different fields; fall back to minimal.
    console.log('branch create note:', e.message.split('\n')[0]);
  });

  try {
    // 1) Generate sample workspace → exactly 30.
    const gen = await generateDemoWorkspace(CID, 'Verifier');
    ok(gen.created === 30, `sample workspace generated 30 employees (got ${gen.created})`);

    const demoCount = await prisma.employee.count({ where: { companyId: CID, employeeId: { startsWith: DEMO_EMPLOYEE_PREFIX } } });
    ok(demoCount === 30, `30 demo employees tagged '${DEMO_EMPLOYEE_PREFIX}%' (got ${demoCount})`);

    // 2) Idempotent — second call must not double-generate.
    const gen2 = await generateDemoWorkspace(CID, 'Verifier');
    ok(gen2.skipped === true, `re-generation is a no-op (skipped=${gen2.skipped})`);

    // 3) Capacity resolves to FREE 30, current 30, remaining 0.
    const cap = await getCapacity(CID);
    ok(cap.plan === 'Free' && cap.limit === 30 && cap.current === 30 && cap.remaining === 0,
      `capacity = ${cap.plan} ${cap.current}/${cap.limit} remaining ${cap.remaining}`);

    // 4) One more employee is blocked with EMPLOYEE_LIMIT_REACHED.
    const guard = await assertCapacity(CID, 1);
    ok(guard.ok === false && guard.body.code === 'EMPLOYEE_LIMIT_REACHED',
      `31st employee blocked (${guard.ok === false ? guard.body.code : 'ALLOWED — WRONG'})`);

    // 5) After removing demo data, capacity frees up to 0/30.
    await prisma.employee.deleteMany({ where: { companyId: CID, employeeId: { startsWith: DEMO_EMPLOYEE_PREFIX } } });
    const cap2 = await getCapacity(CID);
    ok(cap2.current === 0 && cap2.remaining === 30, `after removal capacity = ${cap2.current}/${cap2.limit} remaining ${cap2.remaining}`);
    const guard2 = await assertCapacity(CID, 1);
    ok(guard2.ok === true, `adding is allowed again after removal (ok=${guard2.ok})`);
  } finally {
    // Cleanup — delete ONLY the throwaway tenant.
    await prisma.employee.deleteMany({ where: { companyId: CID } });
    await prisma.branch.deleteMany({ where: { id: BID } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: CID } }).catch(() => {});
    console.log('\nCleaned up throwaway company', CID);
    await prisma.$disconnect();
  }
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
