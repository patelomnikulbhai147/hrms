// Employee-import tenant-isolation test matrix (§20 of the 2026-08-18 fix).
// Self-contained: creates two throw-away companies (QATSA/QATSB) + a branch +
// temp users, runs the 12 required tests through the REAL HTTP API, then
// removes every fixture. Run with the backend up on :5000.
//   node scripts/testEmployeeImportTenantScope.js
const prisma = require('../src/config/prisma');
const bcrypt = require('bcryptjs');

const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const PW = 'QaImport#20260818';
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { PASS++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
  else { FAIL++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

async function login(email) {
  for (let i = 0; i < 3; i++) {
    const cap = await (await fetch(`${BASE}/auth/captcha`)).json().catch(() => ({}));
    const svg = cap.captchaSvg || cap.svg || '';
    const ans = [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => m[1]).join('');
    const body = { email, password: PW };
    if (cap.captchaId) { body.captchaId = cap.captchaId; body.captchaAnswer = ans; }
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    const t = j.token || (j.data && j.data.token);
    if (t) return t;
  }
  throw new Error(`login failed: ${email}`);
}
const importCall = (token, employees) =>
  fetch(`${BASE}/employees/bulk`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ employees }),
  });

(async () => {
  // ── fixtures ───────────────────────────────────────────────────────────────
  const donor = await prisma.user.findFirst({ where: { email: 'om@gmail.com' } })
    || await prisma.user.findFirst({ where: { role: 'Company Head' } });
  const A = await prisma.company.create({ data: { name: 'QATSA Pvt Ltd', plan: 'Enterprise' } });
  const B = await prisma.company.create({ data: { name: 'QATSB Pvt Ltd', plan: 'Enterprise' } });
  const brA = await prisma.branch.create({ data: { branchName: 'QATSA-Branch', companyId: A.id } });
  const mkUser = async (tag, companyId) => prisma.user.create({
    data: {
      name: `QA Import ${tag}`, username: `qa-import-${tag.toLowerCase()}-20260818`,
      email: `qa-import-${tag.toLowerCase()}@test.local`, password: PW,
      passwordHash: await bcrypt.hash(PW, 10), role: 'Company Head', companyId,
      permissions: donor.permissions,
    },
  });
  const uA = await mkUser('A', A.id);
  const uB = await mkUser('B', B.id);
  const CODE = 'EMP-QATS-0001';

  const cleanup = async () => {
    const empIds = (await prisma.employee.findMany({ where: { companyId: { in: [A.id, B.id] } }, select: { id: true } })).map(e => e.id);
    if (empIds.length) {
      await prisma.payroll.deleteMany({ where: { employeeId: { in: empIds } } });
      await prisma.attendance.deleteMany({ where: { employeeId: { in: empIds } } });
      await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: empIds } } });
      await prisma.attendanceSummary.deleteMany({ where: { employeeId: { in: empIds } } });
      await prisma.employee.deleteMany({ where: { id: { in: empIds } } });
    }
    for (const u of [uA, uB]) {
      await prisma.loginAudit.deleteMany({ where: { email: u.email } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
    }
    await prisma.branch.delete({ where: { id: brA.id } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: { in: [A.id, B.id] } } }).catch(() => {});
  };

  try {
    const tA = await login(uA.email);
    const tB = await login(uB.email);

    // Seed A's John via import, then give him payroll/attendance/leave/biometric.
    let r = await importCall(tA, [{ companyId: A.id, employeeId: CODE, name: 'John Original', phone: '9811100001', email: 'john.qatsa@test.local', department: 'Ops', designation: 'Exec', salary: 30000, status: 'Active', joinDate: '2024-01-01', biometricId: 'BIO-111' }]);
    let j = await r.json();
    const john = await prisma.employee.findFirst({ where: { companyId: A.id, employeeId: CODE } });
    ok('seed: A imports John', [200, 201].includes(r.status) && !!john, `status=${r.status}`);
    // The import seeds a current-month draft payroll for new employees on a
    // setImmediate — let it land BEFORE the baseline snapshot, or the async row
    // shows up only in the "after" snapshot and fakes a protection failure.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await prisma.payroll.create({ data: { companyId: A.id, employeeId: john.id, employeeName: john.name, month: 'July', year: 2026, basicSalary: 15000, allowances: 15000, deductions: 2000, netSalary: 28000, workingDays: 27, payrollStatus: 'draft', paymentStatus: 'pending' } });
    await prisma.attendance.create({ data: { companyId: A.id, employeeId: john.id, employeeName: john.name, department: 'Ops', date: '2026-07-01', clockIn: '09:00', clockOut: '18:00', status: 'Present', hoursWorked: 8 } });
    await prisma.leaveRequest.create({ data: { companyId: A.id, employeeId: john.id, employeeName: john.name, department: 'Ops', leaveType: 'CL', fromDate: '2026-07-10', toDate: '2026-07-10', days: 1, status: 'Approved', reason: 'qa', appliedOn: '2026-07-01' } });
    const snapshot = async () => {
      const e = await prisma.employee.findUnique({ where: { id: john.id } });
      const p = await prisma.payroll.findMany({ where: { employeeId: john.id } });
      const at = await prisma.attendance.findMany({ where: { employeeId: john.id } });
      const lv = await prisma.leaveRequest.findMany({ where: { employeeId: john.id } });
      return JSON.stringify({ companyId: e.companyId, branchId: e.branchId, name: e.name, biometricId: e.biometricId, p: p.map(x => [x.id, x.companyId, x.netSalary]), at: at.map(x => [x.id, x.companyId, x.status]), lv: lv.map(x => [x.id, x.companyId, x.status]) });
    };
    // TEST 1 — same-company update
    r = await importCall(tA, [{ companyId: A.id, employeeId: CODE, name: 'John Updated', phone: '9811100001', department: 'Ops', status: 'Active' }]);
    j = await r.json();
    const john2 = await prisma.employee.findUnique({ where: { id: john.id } });
    const aCount = await prisma.employee.count({ where: { companyId: A.id } });
    ok('T1 same-company import updates (no duplicate)', [200, 201].includes(r.status) && john2.name === 'John Updated' && aCount === 1, `name=${john2.name} count=${aCount}`);

    // Baseline AFTER the legitimate same-company update: everything from here
    // on is another tenant's activity and must leave John's world untouched.
    const before = await snapshot();

    // TEST 2+3 — different company, same code → separate employee; A untouched
    r = await importCall(tB, [{ companyId: B.id, employeeId: CODE, name: 'Rahul B', phone: '9822200002', email: 'rahul.qatsb@test.local', department: 'Sales', status: 'Active' }]);
    j = await r.json();
    const rahul = await prisma.employee.findFirst({ where: { companyId: B.id, employeeId: CODE } });
    const johnAfterB = await prisma.employee.findUnique({ where: { id: john.id } });
    ok('T2 B gets its own EMP-QATS-0001', [200, 201].includes(r.status) && !!rahul && rahul.id !== john.id, `rahulId=${rahul && rahul.id}`);
    ok('T3 A\'s John untouched (still company A, still John)', johnAfterB.companyId === A.id && johnAfterB.name === 'John Updated');

    // TEST 4 — duplicate rows in the same file
    r = await importCall(tB, [
      { companyId: B.id, employeeId: 'EMP-QATS-0002', name: 'Dup Row', phone: '9833300003', status: 'Active' },
      { companyId: B.id, employeeId: 'EMP-QATS-0002', name: 'Dup Row', phone: '9833300003', status: 'Active' },
    ]);
    j = await r.json();
    const dupCount = await prisma.employee.count({ where: { companyId: B.id, employeeId: 'EMP-QATS-0002' } });
    ok('T4 duplicate rows in one file → one employee', [200, 201].includes(r.status) && dupCount === 1, `count=${dupCount}`);

    // TEST 5 — same code, different name, same company → existing policy: code match routes to UPDATE, reported per-row
    r = await importCall(tB, [{ companyId: B.id, employeeId: CODE, name: 'Rahul Renamed', status: 'Active' }]);
    j = await r.json();
    const renamed = await prisma.employee.findFirst({ where: { companyId: B.id, employeeId: CODE } });
    const rowResult = (j.results || []).find((x) => x.employeeId === CODE) || {};
    ok('T5 same-code same-company follows update policy + per-row report', [200, 201].includes(r.status) && renamed.name === 'Rahul Renamed' && /updated/i.test(rowResult.status || ''), `status=${rowResult.status}`);

    // TEST 6 — branch import resolves to parent company
    r = await importCall(tA, [{ companyId: brA.id, employeeId: 'EMP-QATS-0003', name: 'Branch Person', phone: '9844400004', status: 'Active' }]);
    j = await r.json();
    const branchEmp = await prisma.employee.findFirst({ where: { employeeId: 'EMP-QATS-0003', companyId: A.id } });
    ok('T6 branch import → companyId=parent, branchId=branch', [200, 201].includes(r.status) && !!branchEmp && branchEmp.branchId === brA.id, branchEmp ? `companyId=${branchEmp.companyId} branchId=${branchEmp.branchId}` : `status=${r.status}`);

    // TEST 7 — spoofed companyId in rows → 403, no write
    r = await importCall(tB, [{ companyId: A.id, employeeId: 'EMP-QATS-0009', name: 'Spoof Row', status: 'Active' }]);
    const spoofRow = await prisma.employee.findFirst({ where: { employeeId: 'EMP-QATS-0009' } });
    ok('T7 spoofed companyId → 403 and no DB change', r.status === 403 && !spoofRow, `status=${r.status}`);

    // TEST 8 — spoofed workspace on validate-code → 403
    r = await fetch(`${BASE}/employees/validate-code`, { method: 'POST', headers: { Authorization: `Bearer ${tB}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'XX-1', companyId: A.id }) });
    ok('T8 spoofed workspace id → 403', r.status === 403, `status=${r.status}`);

    // TESTS 9-12 — A's payroll/attendance/leave/biometric byte-identical
    const after = await snapshot();
    if (before !== after) {
      console.log('    BEFORE:', before);
      console.log('    AFTER :', after);
    }
    ok('T9-T12 A\'s payroll/attendance/leave/biometric untouched', before === after);

    // Cross-company create must also work through the single-create dedup path:
    // B creating an employee with A's phone digits must not be blocked or merged.
    r = await importCall(tB, [{ companyId: B.id, employeeId: 'EMP-QATS-0004', name: 'John Original', phone: '9811100001', status: 'Active' }]);
    j = await r.json();
    const phoneTwin = await prisma.employee.findFirst({ where: { companyId: B.id, employeeId: 'EMP-QATS-0004' } });
    const johnFinal = await prisma.employee.findUnique({ where: { id: john.id } });
    ok('bonus: same phone+name in another company → separate person, A untouched', [200, 201].includes(r.status) && !!phoneTwin && johnFinal.companyId === A.id, `status=${r.status}`);
  } finally {
    await cleanup();
    const leftovers = await prisma.employee.count({ where: { employeeId: { startsWith: 'EMP-QATS-' } } });
    console.log(leftovers ? `  CLEANUP INCOMPLETE (${leftovers} left)` : '  cleanup OK — all fixtures removed');
  }

  console.log(`\nIMPORT TENANT MATRIX: ${PASS} passed, ${FAIL} failed`);
  await prisma.$disconnect();
  process.exit(FAIL ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e); await prisma.$disconnect(); process.exit(1); });
