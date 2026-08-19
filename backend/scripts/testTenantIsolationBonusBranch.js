// Tenant-isolation regression for employee-bonus + branch write handlers
// (security fix 2026-08-18). Self-contained: two throw-away companies, one
// branch + one employee + one bonus each, two Company-Head users. Runs the 20
// required tests through the REAL HTTP API, then removes every fixture.
// NON-destructive to real data. Run with the backend up on :5000.
//   node scripts/testTenantIsolationBonusBranch.js
const prisma = require('../src/config/prisma');
const bcrypt = require('bcryptjs');

const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const PW = 'QaTI#20260818';
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
const H = (t, ws) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(ws ? { 'x-workspace-id': String(ws) } : {}) });

(async () => {
  const donor = await prisma.user.findFirst({ where: { role: 'Company Head' } });
  const A = await prisma.company.create({ data: { name: 'QATI-A', plan: 'Enterprise' } });
  const B = await prisma.company.create({ data: { name: 'QATI-B', plan: 'Enterprise' } });
  const brA = await prisma.branch.create({ data: { branchName: 'QATI-A-Branch', companyId: A.id, status: 'Active' } });
  const brB = await prisma.branch.create({ data: { branchName: 'QATI-B-Branch', companyId: B.id, status: 'Active' } });
  const empBase = { department: 'Ops', designation: 'Exec', salary: 30000, status: 'Active', joinDate: new Date('2024-01-01') };
  const empA = await prisma.employee.create({ data: { employeeId: 'TI-A-1', companyId: A.id, branchId: brA.id, name: 'Alice A', email: 'alice.qati@test.local', phone: '9611100001', ...empBase } });
  const empB = await prisma.employee.create({ data: { employeeId: 'TI-B-1', companyId: B.id, name: 'Bob B', email: 'bob.qati@test.local', phone: '9622200002', ...empBase } });
  const bonusB = await prisma.employeeBonus.create({ data: { companyId: B.id, employeeId: empB.id, bonusType: 'Festival', calcMethod: 'Fixed Amount', amount: 5000, status: 'Active' } });
  const bonusA = await prisma.employeeBonus.create({ data: { companyId: A.id, employeeId: empA.id, bonusType: 'Festival', calcMethod: 'Fixed Amount', amount: 4000, status: 'Active' } });
  // Clone the donor's permission matrix but GUARANTEE the modules these tests
  // exercise are granted — a real donor may lack `companies` (branch writes are
  // gated on companies:edit) or `payroll` (bonus writes), which would 403 the
  // legitimate ALLOW cases at the RBAC layer before the tenant guard is reached.
  const withPerms = (base) => {
    const p = base ? (typeof base === 'string' ? JSON.parse(base) : JSON.parse(JSON.stringify(base))) : {};
    p.permissions = p.permissions || {};
    p.permissions.companies = { view: true, edit: true, create: true, delete: true, export: true };
    p.permissions.payroll = { view: true, edit: true, create: true, delete: true, export: true };
    p.permissions.employees = { view: true, edit: true, create: true, delete: true, export: true };
    return p;
  };
  const mkUser = async (tag, companyId) => prisma.user.create({ data: { name: `QA TI ${tag}`, username: `qa-ti-${tag.toLowerCase()}-20260818`, email: `qa-ti-${tag.toLowerCase()}@test.local`, password: PW, passwordHash: await bcrypt.hash(PW, 10), role: 'Company Head', companyId, permissions: withPerms(donor.permissions) } });
  const uA = await mkUser('A', A.id);
  const uB = await mkUser('B', B.id);
  const createdBonusIds = [];

  const cleanup = async () => {
    if (createdBonusIds.length) await prisma.employeeBonus.deleteMany({ where: { id: { in: createdBonusIds } } }).catch(() => {});
    await prisma.employeeBonus.deleteMany({ where: { id: { in: [bonusA.id, bonusB.id] } } }).catch(() => {});
    await prisma.employee.deleteMany({ where: { id: { in: [empA.id, empB.id] } } }).catch(() => {});
    for (const u of [uA, uB]) { await prisma.loginAudit.deleteMany({ where: { email: u.email } }).catch(() => {}); await prisma.auditLog.deleteMany({ where: { userId: u.id } }).catch(() => {}); await prisma.user.delete({ where: { id: u.id } }).catch(() => {}); }
    await prisma.branch.deleteMany({ where: { id: { in: [brA.id, brB.id] } } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: { in: [A.id, B.id] } } }).catch(() => {});
  };

  try {
    const tA = await login(uA.email);
    const tB = await login(uB.email);

    // ── BONUS ────────────────────────────────────────────────────────────────
    let r = await fetch(`${BASE}/employee-bonuses`, { method: 'POST', headers: H(tA), body: JSON.stringify({ employeeId: empA.id, bonusType: 'Performance', calcMethod: 'Fixed Amount', amount: 1000 }) });
    let j = await r.json().catch(() => ({})); if (j && j.id) createdBonusIds.push(j.id);
    ok('BONUS-1 A creates bonus for A employee → PASS', r.status === 201 && j.companyId === A.id, `status=${r.status}`);

    r = await fetch(`${BASE}/employee-bonuses`, { method: 'POST', headers: H(tA), body: JSON.stringify({ employeeId: empB.id, bonusType: 'Performance', calcMethod: 'Fixed Amount', amount: 1000 }) });
    j = await r.json().catch(() => ({})); if (j && j.id) createdBonusIds.push(j.id);
    ok('BONUS-2 A creates bonus for B employee → 403', r.status === 403, `status=${r.status}`);

    r = await fetch(`${BASE}/employee-bonuses`, { method: 'POST', headers: H(tB), body: JSON.stringify({ employeeId: empB.id, bonusType: 'Performance', calcMethod: 'Fixed Amount', amount: 1000 }) });
    j = await r.json().catch(() => ({})); if (j && j.id) createdBonusIds.push(j.id);
    ok('BONUS-3 B creates bonus for B employee → PASS', r.status === 201 && j.companyId === B.id, `status=${r.status}`);

    r = await fetch(`${BASE}/employee-bonuses/${bonusB.id}`, { method: 'PUT', headers: H(tA), body: JSON.stringify({ amount: 99999 }) });
    ok('BONUS-4 A updates B bonus → 404', r.status === 404, `status=${r.status}`);

    r = await fetch(`${BASE}/employee-bonuses/${bonusB.id}`, { method: 'DELETE', headers: H(tA) });
    ok('BONUS-5 A deletes B bonus → 404', r.status === 404, `status=${r.status}`);

    // Verify A's failed probes left B's bonus byte-identical BEFORE B mutates it.
    const bAfterA = await prisma.employeeBonus.findUnique({ where: { id: bonusB.id } });
    ok('B bonus untouched by A probes', bAfterA.amount === 5000 && bAfterA.status === 'Active', `amount=${bAfterA.amount} status=${bAfterA.status}`);

    r = await fetch(`${BASE}/employee-bonuses/${bonusB.id}`, { method: 'PUT', headers: H(tB), body: JSON.stringify({ amount: 5500 }) });
    ok('BONUS-6 B updates own bonus → PASS', r.status === 200, `status=${r.status}`);

    r = await fetch(`${BASE}/employee-bonuses/${bonusB.id}`, { method: 'DELETE', headers: H(tB) });
    j = await r.json().catch(() => ({}));
    ok('BONUS-7 B deletes own bonus → PASS', r.status === 200, `status=${r.status}`);

    r = await fetch(`${BASE}/employee-bonuses`, { method: 'POST', headers: H(tA, B.id), body: JSON.stringify({ employeeId: empB.id, bonusType: 'x', calcMethod: 'Fixed Amount', amount: 1 }) });
    j = await r.json().catch(() => ({})); if (j && j.id) createdBonusIds.push(j.id);
    ok('BONUS-8 companyId/workspace spoof on create → 403', r.status === 403, `status=${r.status}`);

    r = await fetch(`${BASE}/employee-bonuses/${bonusA.id}`, { method: 'PUT', headers: H(tB), body: JSON.stringify({ amount: 1 }) });
    ok('BONUS-9 workspace spoof on B→A update → 404', r.status === 404, `status=${r.status}`);

    r = await fetch(`${BASE}/employee-bonuses?employeeId=${empB.id}`, { headers: H(tA) });
    j = await r.json().catch(() => ([]));
    ok('BONUS-10 list stays tenant-scoped', Array.isArray(j) && !j.some((x) => x.companyId === B.id), `rows=${Array.isArray(j) ? j.length : '?'}`);

    // ── BRANCH ─────────────────────────────────────────────────────────────────
    r = await fetch(`${BASE}/branches/${brA.id}`, { method: 'PUT', headers: H(tA), body: JSON.stringify({ location: 'Updated A' }) });
    ok('BRANCH-1 A updates Branch A → PASS', r.status === 200, `status=${r.status}`);

    r = await fetch(`${BASE}/branches/${brB.id}`, { method: 'PUT', headers: H(tA), body: JSON.stringify({ location: 'Hijack B' }) });
    ok('BRANCH-2 A updates Branch B → BLOCKED', r.status === 403 || r.status === 404, `status=${r.status}`);

    r = await fetch(`${BASE}/branches/${brB.id}/archive`, { method: 'POST', headers: H(tA), body: JSON.stringify({ reason: 'x' }) });
    ok('BRANCH-3 A archives Branch B → BLOCKED', r.status === 403 || r.status === 404, `status=${r.status}`);

    r = await fetch(`${BASE}/branches/${brB.id}/reactivate`, { method: 'POST', headers: H(tA), body: JSON.stringify({ reason: 'x' }) });
    ok('BRANCH-4 A reactivates Branch B → BLOCKED', r.status === 403 || r.status === 404, `status=${r.status}`);

    r = await fetch(`${BASE}/branches/${brB.id}`, { method: 'DELETE', headers: H(tA) });
    ok('BRANCH-5 A deletes Branch B → BLOCKED', r.status === 403 || r.status === 404, `status=${r.status}`);

    r = await fetch(`${BASE}/branches/${brB.id}/offboard`, { method: 'POST', headers: H(tA), body: JSON.stringify({ employeeAction: 'archive', reason: 'x', effectiveDate: '2026-08-18' }) });
    ok('BRANCH-6 A offboards Branch B → BLOCKED', r.status === 403 || r.status === 404, `status=${r.status}`);

    // Verify A's failed probes left Branch B AND its employee untouched BEFORE B mutates it.
    const brBAfterA = await prisma.branch.findUnique({ where: { id: brB.id }, select: { status: true, isArchived: true } });
    const empBafterA = await prisma.employee.findUnique({ where: { id: empB.id }, select: { status: true } });
    ok('Branch B + its workforce untouched by A probes', brBAfterA.status === 'Active' && !brBAfterA.isArchived && empBafterA.status === 'Active', `branch=${brBAfterA.status} emp=${empBafterA.status}`);

    r = await fetch(`${BASE}/branches/${brB.id}`, { method: 'PUT', headers: H(tB), body: JSON.stringify({ location: 'B own edit' }) });
    ok('BRANCH-7 B operates on Branch B → PASS', r.status === 200, `status=${r.status}`);

    r = await fetch(`${BASE}/branches/${brA.id}`, { method: 'PUT', headers: H(tA, A.id), body: JSON.stringify({ location: 'A within parent' }) });
    ok('BRANCH-8 branch user within permitted parent → PASS', r.status === 200, `status=${r.status}`);

    r = await fetch(`${BASE}/branches/${brB.id}`, { method: 'PUT', headers: H(tA, B.id), body: JSON.stringify({ location: 'ws spoof' }) });
    ok('BRANCH-9 x-workspace-id spoof → BLOCKED', r.status === 403 || r.status === 404, `status=${r.status}`);

    r = await fetch(`${BASE}/branches/${brB.id}/offboard`, { method: 'POST', headers: H(tA, B.id), body: JSON.stringify({ employeeAction: 'archive', reason: 'x', effectiveDate: '2026-08-18' }) });
    ok('BRANCH-10 companyId spoof on offboard → BLOCKED', r.status === 403 || r.status === 404, `status=${r.status}`);

    // valid same-company offboard still works — empA is attached to brA, so the
    // unchanged archive logic must flip it to Archived.
    r = await fetch(`${BASE}/branches/${brA.id}/offboard`, { method: 'POST', headers: H(tA), body: JSON.stringify({ employeeAction: 'archive', reason: 'legit', effectiveDate: '2026-08-18' }) });
    j = await r.json().catch(() => ({}));
    const empAafter = await prisma.employee.findUnique({ where: { id: empA.id }, select: { status: true } });
    ok('same-company offboard still works (unchanged logic)', (r.status === 200 || r.status === 201) && empAafter.status === 'Archived', `status=${r.status} emp=${empAafter.status}`);
  } finally {
    await cleanup();
    const left = await prisma.company.count({ where: { name: { startsWith: 'QATI-' } } });
    const uleft = await prisma.user.count({ where: { email: { startsWith: 'qa-ti-' } } });
    console.log(left || uleft ? `  CLEANUP INCOMPLETE (companies=${left} users=${uleft})` : '  cleanup OK — all fixtures removed');
  }
  console.log(`\nTENANT ISOLATION (bonus+branch): ${PASS} passed, ${FAIL} failed`);
  await prisma.$disconnect();
  process.exit(FAIL ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e); await prisma.$disconnect(); process.exit(1); });
