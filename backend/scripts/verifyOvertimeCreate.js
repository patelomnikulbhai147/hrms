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
  let user = null, emp = null;
  for (const u of users) {
    const grants = [u.companyId, ...(Array.isArray(u.accessibleCompanyIds) ? u.accessibleCompanyIds.map(Number) : [])];
    const e = await prisma.employee.findFirst({ where: { companyId: { in: grants } }, select: { id: true, name: true, employeeId: true, companyId: true, department: true } });
    if (e) { user = u; emp = e; break; }
  }
  if (!user || !emp) throw new Error('no user with a reachable employee to raise overtime for');
  console.log(`as ${user.email}; employee ${emp.name} (${emp.employeeId}) in company ${emp.companyId}\n`);

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
  const list = await j(await fetch(`${BASE}/overtime?companyId=${emp.companyId}`, { headers: hdr(user) }));
  check('the entry appears in the overtime list',
    Array.isArray(list) && list.some((o) => o.id === (lBody && lBody.id)));

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
