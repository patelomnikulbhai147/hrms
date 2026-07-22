/**
 * Regression test — overtime entry.
 *
 * POST /api/overtime returned 500 on EVERY request in production: the form posts
 * { empId, empName, empCode, in, out } and the table requires
 * { employeeId, employeeName, employeeCode, inTime, outTime }, and the controller
 * handed req.body straight to Prisma. It was the only recurring error in the live
 * logs, and overtime had never been saveable.
 *
 * Pins that BOTH payload spellings work, that the response still carries the
 * legacy aliases the existing table renders, and that a genuinely incomplete
 * entry is a 400 rather than a 500.
 *
 *   node backend/scripts/verifyOvertimeCreate.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000/api';
const SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

let passed = 0, failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
};
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const hdr = (u) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: u.id }, SECRET, { expiresIn: '10m' })}` });

const created = [];

(async () => {
  console.log('Overtime entry\n');

  const users = await prisma.user.findMany({
    where: { role: { in: ['Company Head', 'HR'] }, companyId: { not: null } },
    select: { id: true, email: true, companyId: true, accessibleCompanyIds: true },
  });
  // Pick an employee the server will genuinely consider in scope, using the SAME
  // resolver the auth middleware uses. The raw accessibleCompanyIds column is not
  // the grant set: resolveAccess demotes a company to BRANCH-level access when the
  // user holds specific branches of it, so a company id sitting in that column may
  // be legitimately unreachable company-wide. Reading the raw column here produced
  // three false failures against production.
  const { resolveAccess } = require('../src/utils/accessScope');
  const [companies, branches] = await Promise.all([
    prisma.company.findMany({ select: { id: true } }),
    prisma.branch.findMany({ select: { id: true, companyId: true } }),
  ]);

  let user = null, emp = null, via = '';
  const pickEmp = (where) => prisma.employee.findFirst({ where, select: { id: true, name: true, employeeId: true, companyId: true, branchId: true, department: true } });

  for (const u of users) {
    const raw = [u.companyId, ...(Array.isArray(u.accessibleCompanyIds) ? u.accessibleCompanyIds : [])];
    const { branchIds, companyWideIds } = resolveAccess(raw, companies, branches);
    // Prefer a BRANCH-scoped employee — that is the path that was broken, and it
    // is invisible if the test only ever uses the user's own company.
    const byBranch = branchIds.length ? await pickEmp({ branchId: { in: branchIds.map(Number) } }) : null;
    if (byBranch) { user = u; emp = byBranch; via = `branch ${byBranch.branchId} of company ${byBranch.companyId}`; break; }
    const byCompany = await pickEmp({ companyId: { in: companyWideIds.map(Number) } });
    if (byCompany && !emp) { user = u; emp = byCompany; via = `company ${byCompany.companyId}`; }
  }
  if (!user || !emp) throw new Error('no user with a reachable employee to raise overtime for');
  if (!via.startsWith('branch')) console.log('  NOTE  no branch-scoped employee available — the branch-grant path is not exercised here.');
  console.log(`as ${user.email}; employee ${emp.name} (${emp.employeeId}) reachable via ${via}\n`);

  const base = { date: '2026-07-22', otHours: 2, type: 'Normal Overtime', status: 'Pending', department: emp.department, branch: 'QA', shift: 'General Shift' };

  // ── the shape the deployed form actually sends ──────────────────────────────
  const legacy = await fetch(`${BASE}/overtime`, {
    method: 'POST', headers: hdr(user),
    body: JSON.stringify({ ...base, companyId: emp.companyId, empId: emp.id, empName: emp.name, empCode: emp.employeeId, in: '18:00', out: '20:00' }),
  });
  const lBody = await j(legacy);
  check('the form\'s own payload is accepted', legacy.status === 201,
    legacy.status === 201 ? `id ${lBody.id}` : `${legacy.status} ${String(lBody.error || '').slice(0, 70)}`);
  if (lBody && lBody.id) created.push(lBody.id);

  if (lBody && lBody.id) {
    const row = await prisma.overtime.findUnique({ where: { id: lBody.id } });
    check('it is stored under the model\'s own column names',
      row?.employeeName === emp.name && row?.inTime === '18:00' && row?.outTime === '20:00',
      row ? `employeeName="${row.employeeName}" inTime=${row.inTime} outTime=${row.outTime}` : 'row missing');
    check('the response still carries the legacy aliases the table renders',
      lBody.empName === emp.name && lBody.in === '18:00', `empName="${lBody.empName}" in=${lBody.in}`);
  }

  // ── and the canonical shape, so a future frontend fix cannot break it ───────
  const modern = await fetch(`${BASE}/overtime`, {
    method: 'POST', headers: hdr(user),
    body: JSON.stringify({ ...base, companyId: emp.companyId, employeeId: emp.id, employeeName: emp.name, employeeCode: emp.employeeId, inTime: '19:00', outTime: '21:30' }),
  });
  const mBody = await j(modern);
  check('the canonical payload is accepted too', modern.status === 201, `status ${modern.status}`);
  if (mBody && mBody.id) created.push(mBody.id);

  // ── it comes back in the list ───────────────────────────────────────────────
  // Unfiltered: the user's whole scope, company-wide grants plus branch grants.
  const list = await j(await fetch(`${BASE}/overtime`, { headers: hdr(user) }));
  check('the entry appears in the overtime list',
    Array.isArray(list) && list.some((o) => o.id === (lBody && lBody.id)),
    Array.isArray(list) ? `${list.length} row(s) in scope` : 'not an array');

  // Filtered by the workspace the entry belongs to. For a branch-scoped employee
  // that workspace is the BRANCH, whose id never appears on the overtime row —
  // the list has to resolve it through the employee.
  const wsId = emp.branchId != null ? emp.branchId : emp.companyId;
  const scoped = await j(await fetch(`${BASE}/overtime?companyId=${wsId}`, { headers: hdr(user) }));
  check('and in the list filtered to its own workspace',
    Array.isArray(scoped) && scoped.some((o) => o.id === (lBody && lBody.id)),
    `workspace ${wsId}${Array.isArray(scoped) ? ` → ${scoped.length} row(s)` : ''}`);

  // ── an incomplete entry is a 400, not a 500 ─────────────────────────────────
  const bad = await fetch(`${BASE}/overtime`, {
    method: 'POST', headers: hdr(user),
    body: JSON.stringify({ ...base, companyId: emp.companyId, empId: emp.id, in: '18:00', out: '20:00' }), // no name
  });
  const badBody = await j(bad);
  check('an incomplete entry is rejected with 400, not 500', bad.status === 400,
    `status ${bad.status}${bad.status === 400 ? ` (${String(badBody.error).slice(0, 48)})` : ''}`);

  // ── status update must not blank the record ────────────────────────────────
  if (lBody && lBody.id) {
    const upd = await fetch(`${BASE}/overtime/${lBody.id}`, {
      method: 'PUT', headers: hdr(user), body: JSON.stringify({ status: 'Approved' }),
    });
    const after = await prisma.overtime.findUnique({ where: { id: lBody.id } });
    check('a status-only update keeps the rest of the record',
      upd.status === 200 && after?.status === 'Approved' && after?.employeeName === emp.name,
      after ? `status=${after.status} employeeName="${after.employeeName}"` : 'row missing');
  }

  for (const id of created) await prisma.overtime.deleteMany({ where: { id } }).catch(() => {});
  console.log(`\ncleaned up ${created.length} overtime row(s)`);

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('\nFAILED:', e.message);
  for (const id of created) await prisma.overtime.deleteMany({ where: { id } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
