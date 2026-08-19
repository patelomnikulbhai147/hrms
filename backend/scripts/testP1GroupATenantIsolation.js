// P1 Group-A tenant-isolation regression across the three remediated handlers:
//   1. notificationController.create   — cross-tenant bell injection
//   2. loanTypeController.remove       — cross-tenant loan-type delete
//   3. complianceReportController      — foreign company PII in the report header
// Self-contained: two throwaway companies + a branch + employees + CH users;
// runs the own=PASS / foreign=BLOCKED / leak matrix through the REAL HTTP API,
// verifies zero foreign DB change, and removes every fixture. Backend up on :5000.
//   node scripts/testP1GroupATenantIsolation.js
const prisma = require('../src/config/prisma');
const bcrypt = require('bcryptjs');

const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const PW = 'QaP1#20260819';
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { PASS++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
  else { FAIL++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};
const BLOCKED = (s) => s === 403 || s === 404;
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
const withPerms = (base) => {
  const p = base ? (typeof base === 'string' ? JSON.parse(base) : JSON.parse(JSON.stringify(base))) : {};
  p.permissions = p.permissions || {};
  for (const m of ['employees', 'leaves', 'attendance', 'payroll', 'documents', 'companies', 'loans', 'tenders', 'reports']) {
    p.permissions[m] = { view: true, edit: true, create: true, delete: true, approve: true, export: true };
  }
  return p;
};

(async () => {
  const donor = await prisma.user.findFirst({ where: { role: 'Company Head' } });
  const A = await prisma.company.create({ data: { name: 'QAP1-A-CorpXYZ', plan: 'Enterprise' } });
  const B = await prisma.company.create({ data: { name: 'QAP1-B-SecretCo', plan: 'Enterprise' } });
  const brB = await prisma.branch.create({ data: { branchName: 'QAP1-B-Br', companyId: B.id, status: 'Active' } });
  const eb = { department: 'Ops', designation: 'Exec', salary: 30000, status: 'Active', joinDate: new Date('2024-01-01') };
  const empA = await prisma.employee.create({ data: { employeeId: 'P1-A-1', companyId: A.id, name: 'Alice A', email: 'alicep1@test.local', phone: '9710000101', ...eb } });
  const empB = await prisma.employee.create({ data: { employeeId: 'P1-B-1', companyId: B.id, name: 'Bob B', email: 'bobp1@test.local', phone: '9710000102', ...eb } });
  const mkUser = async (tag, companyId, branchId) => prisma.user.create({ data: { name: `QA P1 ${tag}`, username: `qa-p1-${tag.toLowerCase()}-20260819`, email: `qa-p1-${tag.toLowerCase()}@test.local`, password: PW, passwordHash: await bcrypt.hash(PW, 10), role: 'Company Head', companyId, branchId: branchId || null, permissions: withPerms(donor && donor.permissions) } });
  const uA = await mkUser('A', A.id);
  const uB = await mkUser('B', B.id);           // the cross-tenant injection TARGET
  // Loan types: one owned by B (A must not delete), one owned by A (A may delete).
  const ltB = await prisma.loanType.create({ data: { companyId: B.id, name: 'QAP1 B-Type', code: 'BT', defaultInterestType: 'Flat', defaultInterestRate: 5, isSystem: false } }).catch((e) => { console.log('ltB seed:', e.message); return null; });
  const ltA = await prisma.loanType.create({ data: { companyId: A.id, name: 'QAP1 A-Type', code: 'AT', defaultInterestType: 'Flat', defaultInterestRate: 5, isSystem: false } }).catch((e) => { console.log('ltA seed:', e.message); return null; });
  const createdNotifs = [];

  const cleanup = async () => {
    for (const id of createdNotifs) await prisma.notification.deleteMany({ where: { id } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { OR: [{ companyId: { in: [A.id, B.id] } }, { branchId: brB.id }, { userId: { in: [uA.id, uB.id] } }] } }).catch(() => {});
    await prisma.loanType.deleteMany({ where: { companyId: { in: [A.id, B.id] } } }).catch(() => {});
    await prisma.employee.deleteMany({ where: { id: { in: [empA.id, empB.id] } } }).catch(() => {});
    for (const u of [uA, uB]) {
      await prisma.loginAudit.deleteMany({ where: { email: u.email } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
    }
    await prisma.branch.deleteMany({ where: { id: brB.id } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: { in: [A.id, B.id] } } }).catch(() => {});
  };

  try {
    const tA = await login(uA.email);

    // ── NOTIFICATION.create ──────────────────────────────────────────────────
    // 1) foreign userId — would land in B-user's bell (delivered by userId)
    let r = await fetch(`${BASE}/notifications`, { method: 'POST', headers: H(tA), body: JSON.stringify({ userId: uB.id, message: 'inject-user', title: 'x' }) });
    let n = await prisma.notification.count({ where: { userId: uB.id, message: 'inject-user' } });
    ok('NOTIF foreign userId inject BLOCKED + no row', BLOCKED(r.status) && n === 0, `http=${r.status} rows=${n}`);

    // 2) foreign companyId — company-wide bell in B
    r = await fetch(`${BASE}/notifications`, { method: 'POST', headers: H(tA), body: JSON.stringify({ companyId: B.id, message: 'inject-co', title: 'x' }) });
    n = await prisma.notification.count({ where: { companyId: B.id, message: 'inject-co' } });
    ok('NOTIF foreign companyId inject BLOCKED + no row', BLOCKED(r.status) && n === 0, `http=${r.status} rows=${n}`);

    // 3) foreign branchId
    r = await fetch(`${BASE}/notifications`, { method: 'POST', headers: H(tA), body: JSON.stringify({ branchId: brB.id, message: 'inject-br', title: 'x' }) });
    n = await prisma.notification.count({ where: { branchId: brB.id, message: 'inject-br' } });
    ok('NOTIF foreign branchId inject BLOCKED + no row', BLOCKED(r.status) && n === 0, `http=${r.status} rows=${n}`);

    // 4) global (no company/branch/user) as non-SA → platform-wide, must be blocked
    r = await fetch(`${BASE}/notifications`, { method: 'POST', headers: H(tA), body: JSON.stringify({ message: 'inject-global', title: 'x' }) });
    n = await prisma.notification.count({ where: { message: 'inject-global' } });
    ok('NOTIF global broadcast by non-SA BLOCKED + no row', BLOCKED(r.status) && n === 0, `http=${r.status} rows=${n}`);

    // 5) own userId → PASS
    r = await fetch(`${BASE}/notifications`, { method: 'POST', headers: H(tA), body: JSON.stringify({ userId: uA.id, message: 'own-user', title: 'ok' }) });
    let row = await prisma.notification.findFirst({ where: { userId: uA.id, message: 'own-user' } });
    if (row) createdNotifs.push(row.id);
    ok('NOTIF own userId PASS', (r.status === 200 || r.status === 201) && !!row, `http=${r.status} row=${!!row}`);

    // 6) own companyId → PASS
    r = await fetch(`${BASE}/notifications`, { method: 'POST', headers: H(tA), body: JSON.stringify({ companyId: A.id, message: 'own-co', title: 'ok' }) });
    row = await prisma.notification.findFirst({ where: { companyId: A.id, message: 'own-co' } });
    if (row) createdNotifs.push(row.id);
    ok('NOTIF own companyId PASS', (r.status === 200 || r.status === 201) && !!row, `http=${r.status} row=${!!row}`);

    // ── LOANTYPE.remove ──────────────────────────────────────────────────────
    if (ltB) {
      r = await fetch(`${BASE}/loans/types/${ltB.id}`, { method: 'DELETE', headers: H(tA) });
      const still = await prisma.loanType.findUnique({ where: { id: ltB.id } });
      ok('LOANTYPE foreign delete BLOCKED + still exists', BLOCKED(r.status) && !!still, `http=${r.status} exists=${!!still}`);
      // spoof x-workspace-id=B — still must not delete B's type
      r = await fetch(`${BASE}/loans/types/${ltB.id}`, { method: 'DELETE', headers: H(tA, B.id) });
      const still2 = await prisma.loanType.findUnique({ where: { id: ltB.id } });
      ok('LOANTYPE spoof workspace=B delete BLOCKED + still exists', BLOCKED(r.status) && !!still2, `http=${r.status} exists=${!!still2}`);
    } else console.log('  (loanType foreign probes skipped — seed failed)');
    if (ltA) {
      r = await fetch(`${BASE}/loans/types/${ltA.id}`, { method: 'DELETE', headers: H(tA) });
      const gone = await prisma.loanType.findUnique({ where: { id: ltA.id } });
      ok('LOANTYPE own delete PASS + removed', (r.status === 200 || r.status === 201) && !gone, `http=${r.status} gone=${!gone}`);
    } else console.log('  (loanType own probe skipped — seed failed)');

    // ── COMPLIANCE REPORT header PII ─────────────────────────────────────────
    const gen = async (companyId) => {
      const rr = await fetch(`${BASE}/compliance-reports/generate`, { method: 'POST', headers: H(tA), body: JSON.stringify({ reportKey: 'leave_register', companyId, startDate: '2026-08-01', endDate: '2026-08-31' }) });
      const jj = await rr.json().catch(() => ({}));
      const meta = jj.meta || (jj.data && jj.data.meta) || null;
      return { status: rr.status, name: meta && meta.name };
    };
    // Control: own report renders under A's header
    let g = await gen(A.id);
    ok('REPORT own header = A (control)', g.status === 200 && /QAP1-A/.test(g.name || ''), `http=${g.status} name=${g.name}`);
    // Leak: A asks for B's companyId — header must NOT be B's identity/PII
    g = await gen(B.id);
    ok('REPORT foreign companyId does NOT leak B header', g.status === 200 && !/QAP1-B/.test(g.name || '') && /QAP1-A/.test(g.name || ''), `http=${g.status} name=${g.name}`);
    // Spoof: same via x-workspace-id header
    {
      const rr = await fetch(`${BASE}/compliance-reports/generate`, { method: 'POST', headers: H(tA, B.id), body: JSON.stringify({ reportKey: 'leave_register', startDate: '2026-08-01', endDate: '2026-08-31' }) });
      const jj = await rr.json().catch(() => ({}));
      const meta = jj.meta || (jj.data && jj.data.meta) || null;
      ok('REPORT spoof workspace=B does NOT leak B header', rr.status === 200 && !/QAP1-B/.test((meta && meta.name) || '') && /QAP1-A/.test((meta && meta.name) || ''), `http=${rr.status} name=${meta && meta.name}`);
    }
  } finally {
    await cleanup();
    const left = await prisma.company.count({ where: { name: { startsWith: 'QAP1-' } } });
    const uleft = await prisma.user.count({ where: { email: { startsWith: 'qa-p1-' } } });
    console.log(left || uleft ? `  CLEANUP INCOMPLETE (companies=${left} users=${uleft})` : '  cleanup OK — all fixtures removed');
  }
  console.log(`\nP1 GROUP-A TENANT ISOLATION: ${PASS} passed, ${FAIL} failed`);
  await prisma.$disconnect();
  process.exit(FAIL ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e); await prisma.$disconnect(); process.exit(1); });
