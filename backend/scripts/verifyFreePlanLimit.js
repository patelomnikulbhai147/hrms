// ─────────────────────────────────────────────────────────────────────────────
// FREE-PLAN EMPLOYEE LIMIT (100) — end-to-end verification.
//
// Covers the acceptance tests for the Free signup change:
//   T2  employee #100 is allowed
//   T3  employee #101 is blocked with EMPLOYEE_LIMIT_REACHED
//   T4  a bulk import that would breach the cap is rejected in full, reporting
//       the exact number of available slots (85 present + 30 imported → 15 left)
//   T5  a Super-Admin plan upgrade lifts the cap immediately (no migration)
//
// Builds a throwaway tenant, asserts, then deletes ONLY what it created — no
// real company is touched. Run: node scripts/verifyFreePlanLimit.js
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../src/config/prisma');
const { getCapacity, assertCapacity } = require('../src/services/employeeLimitService');

const CID = 990101;
const PREFIX = 'ZZLIM';
let failures = 0;
const ok = (c, m) => { if (!c) failures++; console.log(`${c ? 'PASS ✔' : 'FAIL ✗'}  ${m}`); };

// Seed N employees straight into the DB (bypassing the controller on purpose —
// we are testing the capacity resolver that every create path consults).
async function seed(n, from = 1) {
  const rows = [];
  for (let i = from; i < from + n; i++) {
    rows.push({
      employeeId: `${PREFIX}${String(i).padStart(4, '0')}`,
      companyId: CID,
      name: `Limit Test ${i}`,
      email: `limit.test.${i}@zz-throwaway.local`,
      phone: `9${String(200000000 + i)}`,
      department: 'General',
      designation: 'Staff',
      joinDate: new Date('2026-01-01'),
      salary: 20000,
      status: 'Active',
    });
  }
  await prisma.employee.createMany({ data: rows });
}

async function wipe() {
  await prisma.employee.deleteMany({ where: { companyId: CID } });
  await prisma.company.deleteMany({ where: { id: CID } }).catch(() => {});
}

(async () => {
  await wipe();
  await prisma.company.create({ data: { id: CID, name: 'ZZ Free-Limit Test (throwaway)', plan: 'Free', isHeadOffice: true, employeeCount: 0 } });

  try {
    // ── T1 (plan defaults) ────────────────────────────────────────────────────
    const cap0 = await getCapacity(CID);
    ok(cap0.plan === 'Free' && cap0.limit === 100, `new Free company cap = ${cap0.limit} (expected 100)`);

    // ── T2: employee #100 is allowed ─────────────────────────────────────────
    await seed(99);
    const cap99 = await getCapacity(CID);
    ok(cap99.current === 99 && cap99.remaining === 1, `99 seeded → ${cap99.current}/${cap99.limit}, remaining ${cap99.remaining}`);
    const g100 = await assertCapacity(CID, 1);
    ok(g100.ok === true, `employee #100 is allowed (ok=${g100.ok})`);

    // ── T3: employee #101 is blocked ─────────────────────────────────────────
    await seed(1, 100);
    const g101 = await assertCapacity(CID, 1);
    ok(g101.ok === false && g101.body.code === 'EMPLOYEE_LIMIT_REACHED' && g101.status === 403,
      `employee #101 blocked → ${g101.ok === false ? `${g101.status} ${g101.body.code}` : 'ALLOWED — WRONG'}`);
    // Message changed with the Slot Management feature (2026-07-29): the block
    // now directs users to purchase slot packs / contact sales, and the body
    // carries the cap breakdown as structured fields instead of prose.
    ok(/purchase additional employee slots/i.test(g101.body?.error || '') && g101.body?.limit === 100,
      `block message + structured limit: "${g101.body?.error || ''}" (limit=${g101.body?.limit})`);

    // ── T4: import of 30 with 85 on file → blocked, 15 slots available ───────
    await prisma.employee.deleteMany({ where: { companyId: CID, employeeId: { gte: `${PREFIX}0086` } } });
    const cap85 = await getCapacity(CID);
    ok(cap85.current === 85, `trimmed to ${cap85.current} employees for the import test`);
    const gImp = await assertCapacity(CID, 30);   // exactly what bulkCreate's pre-flight calls
    ok(gImp.ok === false && gImp.body.availableSlots === 15,
      `import of 30 rejected with availableSlots=${gImp.ok === false ? gImp.body.availableSlots : 'n/a'} (expected 15)`);
    const gFit = await assertCapacity(CID, 15);
    ok(gFit.ok === true, `an import of exactly 15 still fits (ok=${gFit.ok})`);

    // ── T5: Super-Admin upgrade lifts the cap immediately ────────────────────
    await prisma.company.update({ where: { id: CID }, data: { plan: 'Professional' } });
    const capPro = await getCapacity(CID);
    ok(capPro.plan === 'Professional' && capPro.limit > 100,
      `after upgrade cap = ${capPro.plan} ${capPro.current}/${capPro.limit}`);
    const gAfter = await assertCapacity(CID, 30);
    ok(gAfter.ok === true, `the previously-blocked 30-row import is allowed after upgrade (ok=${gAfter.ok})`);
  } finally {
    await wipe();
    console.log(`\nCleaned up throwaway company ${CID}. ${failures === 0 ? 'ALL PASS ✔' : `${failures} FAILURE(S) ✗`}`);
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  }
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
