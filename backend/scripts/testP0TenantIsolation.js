// P0 tenant-isolation regression across the six remediated families:
// Leave, Leave Admin, Attendance, Documents, Loans, Tenders.
// Self-contained: two throwaway companies + employees + CH users; runs the full
// own=PASS / foreign=BLOCKED / spoof matrix through the REAL HTTP API, verifies
// zero foreign DB change, and removes every fixture. Backend must be up on :5000.
//   node scripts/testP0TenantIsolation.js
const prisma = require('../src/config/prisma');
const bcrypt = require('bcryptjs');

const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const PW = 'QaP0#20260819';
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
  for (const m of ['employees', 'leaves', 'attendance', 'payroll', 'documents', 'companies', 'loans', 'tenders']) {
    p.permissions[m] = { view: true, edit: true, create: true, delete: true, approve: true, export: true };
  }
  return p;
};

(async () => {
  const donor = await prisma.user.findFirst({ where: { role: 'Company Head' } });
  const A = await prisma.company.create({ data: { name: 'QAP0-A', plan: 'Enterprise' } });
  const B = await prisma.company.create({ data: { name: 'QAP0-B', plan: 'Enterprise' } });
  const brB = await prisma.branch.create({ data: { branchName: 'QAP0-B-Br', companyId: B.id, status: 'Active' } });
  const eb = { department: 'Ops', designation: 'Exec', salary: 30000, status: 'Active', joinDate: new Date('2024-01-01') };
  const empA = await prisma.employee.create({ data: { employeeId: 'P0-A-1', companyId: A.id, name: 'Alice A', email: 'alicep0@test.local', phone: '9700000101', ...eb } });
  const empB = await prisma.employee.create({ data: { employeeId: 'P0-B-1', companyId: B.id, name: 'Bob B', email: 'bobp0@test.local', phone: '9700000102', ...eb } });
  // Company B fixtures A will try to touch:
  const leaveB = await prisma.leaveRequest.create({ data: { companyId: B.id, employeeId: empB.id, employeeName: empB.name, department: 'Ops', leaveType: 'CL', fromDate: '2026-09-10', toDate: '2026-09-10', days: 1, status: 'Pending', reason: 'qa', appliedOn: '2026-09-01' } });
  const attB = await prisma.attendance.create({ data: { companyId: B.id, employeeId: empB.id, employeeName: empB.name, department: 'Ops', date: '2026-08-03', clockIn: '09:00', clockOut: '18:00', status: 'Present', hoursWorked: 8 } });
  const docB = await prisma.document.create({ data: { companyId: B.id, employeeId: empB.id, name: 'B-secret.pdf', type: 'Contract', status: 'Verified', uploadedBy: 'seed', uploadedOn: '2026-08-01', size: '10 KB' } });
  const balB = await prisma.leaveBalance.create({ data: { companyId: B.id, employeeId: empB.id, year: 2026, clBalance: 10, plBalance: 10, slBalance: 10, clUsed: 0, plUsed: 0, slUsed: 0, carryForward: 0 } }).catch((e) => { console.log('balB seed:', e.message); return null; });
  const balA = await prisma.leaveBalance.create({ data: { companyId: A.id, employeeId: empA.id, year: 2026, clBalance: 10, plBalance: 10, slBalance: 10, clUsed: 0, plUsed: 0, slUsed: 0, carryForward: 0 } }).catch(() => null);
  const loanB = await prisma.loan.create({ data: { loanNumber: 'QAP0-LN-1', companyId: B.id, employeeId: empB.id, employeeName: empB.name, principalAmount: 100000, interestRate: 10, tenureMonths: 12, emiAmount: 8792, status: 'Pending Approval', loanTypeName: 'Personal' } }).catch((e) => { console.log('loanB seed:', e.message); return null; });
  const tenderB = await prisma.tender.create({ data: { companyId: B.id, tenderName: 'B tender', tenderValue: 500000, status: 'Draft' } }).catch((e) => { console.log('tenderB seed:', e.message); return null; });
  const mkUser = async (tag, companyId) => prisma.user.create({ data: { name: `QA P0 ${tag}`, username: `qa-p0-${tag.toLowerCase()}-20260819`, email: `qa-p0-${tag.toLowerCase()}@test.local`, password: PW, passwordHash: await bcrypt.hash(PW, 10), role: 'Company Head', companyId, permissions: withPerms(donor.permissions) } });
  const uA = await mkUser('A', A.id);
  const created = [];

  const cleanup = async () => {
    for (const id of created) await prisma.leaveRequest.deleteMany({ where: { id } }).catch(() => {});
    await prisma.loanInstallment.deleteMany({ where: { loanId: loanB?.id } }).catch(() => {});
    await prisma.loanAudit.deleteMany({ where: { loanId: loanB?.id } }).catch(() => {});
    if (loanB) await prisma.loan.deleteMany({ where: { id: loanB.id } }).catch(() => {});
    if (tenderB) await prisma.tender.deleteMany({ where: { id: tenderB.id } }).catch(() => {});
    await prisma.leaveBalance.deleteMany({ where: { employeeId: { in: [empA.id, empB.id] } } }).catch(() => {});
    await prisma.document.deleteMany({ where: { employeeId: { in: [empA.id, empB.id] } } }).catch(() => {});
    await prisma.attendance.deleteMany({ where: { employeeId: { in: [empA.id, empB.id] } } }).catch(() => {});
    await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: [empA.id, empB.id] } } }).catch(() => {});
    await prisma.attendanceSummary.deleteMany({ where: { employeeId: { in: [empA.id, empB.id] } } }).catch(() => {});
    await prisma.payroll.deleteMany({ where: { employeeId: { in: [empA.id, empB.id] } } }).catch(() => {});
    await prisma.employee.deleteMany({ where: { id: { in: [empA.id, empB.id] } } }).catch(() => {});
    await prisma.loginAudit.deleteMany({ where: { email: uA.email } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { userId: uA.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: uA.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: brB.id } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: { in: [A.id, B.id] } } }).catch(() => {});
  };

  try {
    const tA = await login(uA.email);

    // ── LEAVE ──────────────────────────────────────────────────────────────
    let r = await fetch(`${BASE}/leaves/${leaveB.id}`, { method: 'PUT', headers: H(tA), body: JSON.stringify({ status: 'Approved' }) });
    let lv = await prisma.leaveRequest.findUnique({ where: { id: leaveB.id } });
    ok('LEAVE foreign approve BLOCKED + unchanged', BLOCKED(r.status) && lv.status === 'Pending', `http=${r.status} status=${lv.status}`);
    r = await fetch(`${BASE}/leaves/${leaveB.id}`, { method: 'DELETE', headers: H(tA) });
    lv = await prisma.leaveRequest.findUnique({ where: { id: leaveB.id } });
    ok('LEAVE foreign delete BLOCKED + still exists', BLOCKED(r.status) && !!lv, `http=${r.status} exists=${!!lv}`);
    r = await fetch(`${BASE}/leaves`, { method: 'POST', headers: H(tA), body: JSON.stringify({ employeeId: empB.id, companyId: A.id, leaveType: 'CL', fromDate: '2026-09-20', toDate: '2026-09-20', days: 1, reason: 'x', appliedOn: '2026-09-01' }) });
    const injected = await prisma.leaveRequest.count({ where: { employeeId: empB.id, fromDate: '2026-09-20' } });
    ok('LEAVE foreign create BLOCKED (no row for B emp)', BLOCKED(r.status) && injected === 0, `http=${r.status} injected=${injected}`);
    // own leave create works
    r = await fetch(`${BASE}/leaves`, { method: 'POST', headers: H(tA), body: JSON.stringify({ employeeId: empA.id, leaveType: 'CL', fromDate: '2026-09-05', toDate: '2026-09-05', days: 1, reason: 'x', appliedOn: '2026-09-01' }) });
    const mine = await prisma.leaveRequest.findFirst({ where: { employeeId: empA.id, fromDate: '2026-09-05' } });
    if (mine) created.push(mine.id);
    ok('LEAVE own create PASS (companyId derived)', (r.status === 200 || r.status === 201) && mine && mine.companyId === A.id, `http=${r.status} co=${mine && mine.companyId}`);

    // ── LEAVE ADMIN ────────────────────────────────────────────────────────
    r = await fetch(`${BASE}/leave-admin/grant`, { method: 'POST', headers: H(tA), body: JSON.stringify({ employeeId: empB.id, category: 'CL', days: 5 }) });
    let b = await prisma.leaveBalance.findFirst({ where: { employeeId: empB.id, year: 2026 } });
    ok('LEAVEADMIN foreign grant BLOCKED + balance unchanged', BLOCKED(r.status) && (!b || b.clBalance === 10), `http=${r.status} cl=${b && b.clBalance}`);
    r = await fetch(`${BASE}/leave-admin/transfer`, { method: 'POST', headers: H(tA), body: JSON.stringify({ fromEmployeeId: empB.id, toEmployeeId: empA.id, category: 'CL', days: 3 }) });
    b = await prisma.leaveBalance.findFirst({ where: { employeeId: empB.id, year: 2026 } });
    ok('LEAVEADMIN foreign transfer BLOCKED + source unchanged', BLOCKED(r.status) && (!b || b.clBalance === 10), `http=${r.status} cl=${b && b.clBalance}`);
    r = await fetch(`${BASE}/leave-admin/reset`, { method: 'POST', headers: H(tA), body: JSON.stringify({ employeeId: empB.id }) });
    ok('LEAVEADMIN foreign reset BLOCKED', BLOCKED(r.status), `http=${r.status}`);
    // own grant works
    r = await fetch(`${BASE}/leave-admin/grant`, { method: 'POST', headers: H(tA), body: JSON.stringify({ employeeId: empA.id, category: 'CL', days: 2 }) });
    ok('LEAVEADMIN own grant PASS', r.status === 200 || r.status === 201, `http=${r.status}`);

    // ── ATTENDANCE ─────────────────────────────────────────────────────────
    r = await fetch(`${BASE}/attendance/${attB.id}`, { method: 'PUT', headers: H(tA), body: JSON.stringify({ status: 'Absent' }) });
    let at = await prisma.attendance.findUnique({ where: { id: attB.id } });
    ok('ATTEND foreign edit BLOCKED + unchanged', BLOCKED(r.status) && at && at.status === 'Present', `http=${r.status} status=${at && at.status}`);
    r = await fetch(`${BASE}/attendance/${attB.id}`, { method: 'DELETE', headers: H(tA) });
    at = await prisma.attendance.findUnique({ where: { id: attB.id } });
    ok('ATTEND foreign delete BLOCKED + still exists', BLOCKED(r.status) && !!at, `http=${r.status} exists=${!!at}`);
    r = await fetch(`${BASE}/attendance`, { method: 'POST', headers: H(tA), body: JSON.stringify({ employeeId: empB.id, companyId: A.id, date: '2026-08-04', status: 'Present', clockIn: '09:00', clockOut: '18:00', employeeName: empB.name, department: 'Ops' }) });
    const attCreated = await prisma.attendance.count({ where: { employeeId: empB.id, date: '2026-08-04' } });
    ok('ATTEND foreign create BLOCKED', BLOCKED(r.status) && attCreated === 0, `http=${r.status} created=${attCreated}`);
    // own create works
    r = await fetch(`${BASE}/attendance`, { method: 'POST', headers: H(tA), body: JSON.stringify({ employeeId: empA.id, date: '2026-08-05', status: 'Present', clockIn: '09:00', clockOut: '18:00', employeeName: empA.name, department: 'Ops' }) });
    ok('ATTEND own create PASS', r.status === 200 || r.status === 201, `http=${r.status}`);

    // ── DOCUMENTS ──────────────────────────────────────────────────────────
    r = await fetch(`${BASE}/documents/${docB.id}`, { method: 'PUT', headers: H(tA), body: JSON.stringify({ name: 'hijacked' }) });
    let dc = await prisma.document.findUnique({ where: { id: docB.id } });
    ok('DOC foreign update BLOCKED + unchanged', BLOCKED(r.status) && dc && dc.name === 'B-secret.pdf', `http=${r.status} name=${dc && dc.name}`);
    r = await fetch(`${BASE}/documents/${docB.id}`, { method: 'DELETE', headers: H(tA) });
    dc = await prisma.document.findUnique({ where: { id: docB.id } });
    ok('DOC foreign delete BLOCKED + still exists', BLOCKED(r.status) && !!dc, `http=${r.status} exists=${!!dc}`);
    r = await fetch(`${BASE}/documents/${docB.id}/file`, { headers: H(tA) });
    ok('DOC foreign file read BLOCKED', BLOCKED(r.status), `http=${r.status}`);

    // ── LOANS ──────────────────────────────────────────────────────────────
    if (loanB) {
      r = await fetch(`${BASE}/loans/${loanB.id}`, { headers: H(tA) });
      ok('LOAN foreign read BLOCKED', BLOCKED(r.status), `http=${r.status}`);
      r = await fetch(`${BASE}/loans/${loanB.id}/status`, { method: 'POST', headers: H(tA), body: JSON.stringify({ action: 'approve' }) });
      let ln = await prisma.loan.findUnique({ where: { id: loanB.id } });
      const inst = await prisma.loanInstallment.count({ where: { loanId: loanB.id } });
      ok('LOAN foreign approve BLOCKED + no ledger + status unchanged', BLOCKED(r.status) && ln.status === 'Pending Approval' && inst === 0, `http=${r.status} status=${ln.status} installments=${inst}`);
      r = await fetch(`${BASE}/loans/${loanB.id}`, { method: 'PUT', headers: H(tA), body: JSON.stringify({ principalAmount: 1 }) });
      ln = await prisma.loan.findUnique({ where: { id: loanB.id } });
      ok('LOAN foreign update BLOCKED + unchanged', BLOCKED(r.status) && ln.principalAmount === 100000, `http=${r.status} principal=${ln.principalAmount}`);
      r = await fetch(`${BASE}/loans/${loanB.id}`, { method: 'DELETE', headers: H(tA) });
      ln = await prisma.loan.findUnique({ where: { id: loanB.id } });
      ok('LOAN foreign delete BLOCKED + still exists', BLOCKED(r.status) && !!ln, `http=${r.status} exists=${!!ln}`);
    } else console.log('  (loan probes skipped — seed failed)');

    // ── TENDERS ────────────────────────────────────────────────────────────
    if (tenderB) {
      r = await fetch(`${BASE}/tenders/${tenderB.id}`, { method: 'PUT', headers: H(tA), body: JSON.stringify({ tenderValue: 1 }) });
      let td = await prisma.tender.findUnique({ where: { id: tenderB.id } });
      ok('TENDER foreign update BLOCKED + unchanged', BLOCKED(r.status) && td && td.tenderValue === 500000, `http=${r.status} value=${td && td.tenderValue}`);
      r = await fetch(`${BASE}/tenders/${tenderB.id}`, { method: 'DELETE', headers: H(tA) });
      td = await prisma.tender.findUnique({ where: { id: tenderB.id } });
      ok('TENDER foreign delete BLOCKED + still exists', BLOCKED(r.status) && !!td, `http=${r.status} exists=${!!td}`);
    } else console.log('  (tender probes skipped — seed failed)');

    // ── SPOOFS ─────────────────────────────────────────────────────────────
    r = await fetch(`${BASE}/leaves/${leaveB.id}`, { method: 'PUT', headers: H(tA, B.id), body: JSON.stringify({ status: 'Approved' }) });
    ok('SPOOF x-workspace-id=B on leave BLOCKED', BLOCKED(r.status), `http=${r.status}`);
    r = await fetch(`${BASE}/attendance/${attB.id}`, { method: 'PUT', headers: H(tA, brB.id), body: JSON.stringify({ status: 'Absent' }) });
    ok('SPOOF x-workspace-id=B-branch on attendance BLOCKED', BLOCKED(r.status), `http=${r.status}`);
  } finally {
    await cleanup();
    const left = await prisma.company.count({ where: { name: { startsWith: 'QAP0-' } } });
    const uleft = await prisma.user.count({ where: { email: { startsWith: 'qa-p0-' } } });
    console.log(left || uleft ? `  CLEANUP INCOMPLETE (companies=${left} users=${uleft})` : '  cleanup OK — all fixtures removed');
  }
  console.log(`\nP0 TENANT ISOLATION: ${PASS} passed, ${FAIL} failed`);
  await prisma.$disconnect();
  process.exit(FAIL ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e); await prisma.$disconnect(); process.exit(1); });
