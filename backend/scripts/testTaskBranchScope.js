/**
 * Task Manager — branch-scope enforcement test (backend, no HTTP).
 * Calls the real controller with mocked req/res, then deletes every task it made.
 * Run: node scripts/testTaskBranchScope.js
 */
const prisma = require('../src/config/prisma');
const ctrl = require('../src/controllers/taskController');

const made = [];
const call = (user, body) => new Promise((resolve) => {
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json(payload) { if (payload && payload.id) made.push(payload.id); resolve({ code: this.statusCode, body: payload }); },
  };
  ctrl.create({ user, body, params: {}, query: {}, headers: {} }, res).catch(e => resolve({ code: 500, body: { error: e.message } }));
});

let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    ${detail}`}`); };

(async () => {
  // Fixtures from the live dev DB.
  const SA = { id: 1, role: 'Super Admin', name: 'Super Admin', companyId: null };
  const CO11 = { id: 13, role: 'Company Head', name: 'Pulpit Head', companyId: 11 }; // parent company
  const BR20 = { id: 99, role: 'HR', name: 'Rajkot HR', companyId: 20 };             // Rajkot Branch of 11
  const BR22 = { id: 98, role: 'HR', name: 'Surat HR', companyId: 22 };              // Surat Branch of 11
  const CO1 = { id: 2, role: 'Company Head', name: 'Vishv Head', companyId: 1 };     // other company

  console.log('── Parent company (company 11) ──');
  let r = await call(CO11, { title: 'T1 own branch', companyId: 11, branchId: 20 });
  check('Company Head → own branch (Rajkot 20) allowed', r.code === 201 && r.body.branchId === 20, JSON.stringify(r));

  r = await call(CO11, { title: 'T2 no branch', companyId: 11 });
  check('Company Head → "All Branches in Scope" (no branch) allowed', r.code === 201 && r.body.branchId === null, JSON.stringify(r));

  r = await call(CO11, { title: 'T3 foreign branch', companyId: 11, branchId: 5 }); // branch of company 1
  check('Company Head → ANOTHER company\'s branch (5) REJECTED', r.code === 403, JSON.stringify(r));

  r = await call(CO11, { title: 'T4 archived branch', companyId: 11, branchId: 10 }); // archived
  check('Company Head → archived branch (10) REJECTED', r.code === 403, JSON.stringify(r));

  console.log('\n── Branch users ──');
  r = await call(BR20, { title: 'T5 branch implicit', companyId: 20 });
  check('Rajkot user → branch auto-set to 20', r.code === 201 && r.body.branchId === 20, JSON.stringify(r));

  r = await call(BR22, { title: 'T6 surat implicit', companyId: 22 });
  check('Surat user → branch auto-set to 22', r.code === 201 && r.body.branchId === 22, JSON.stringify(r));

  r = await call(BR20, { title: 'T7 tampered', companyId: 20, branchId: 22 });
  check('Rajkot user posting branchId=22 (tampered) REJECTED', r.code === 403, JSON.stringify(r));

  r = await call(BR20, { title: 'T8 cross-company', companyId: 20, branchId: 5 });
  check('Rajkot user posting a foreign branch REJECTED', r.code === 403, JSON.stringify(r));

  console.log('\n── Cross-company / Super Admin ──');
  r = await call(CO1, { title: 'T9 cross company', companyId: 11, branchId: 20 });
  check('Company 1 head targeting company 11 REJECTED', r.code === 403, JSON.stringify(r));

  r = await call(SA, { title: 'T10 SA ok', companyId: 11, branchId: 22 });
  check('Super Admin → any branch of the chosen company allowed', r.code === 201 && r.body.branchId === 22, JSON.stringify(r));

  r = await call(SA, { title: 'T11 SA mismatch', companyId: 11, branchId: 5 });
  check('Super Admin → branch NOT in the chosen company REJECTED', r.code === 403, JSON.stringify(r));

  // cleanup
  if (made.length) {
    await prisma.taskComment.deleteMany({ where: { taskId: { in: made } } });
    await prisma.task.deleteMany({ where: { id: { in: made } } });
  }
  console.log(`\ncleaned up ${made.length} test task(s)`);
  console.log(fail ? `\n${pass} passed, ${fail} FAILED` : `\nALL ${pass} PASSED`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})();
