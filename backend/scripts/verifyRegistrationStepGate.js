/**
 * Regression test — an employee cannot be created from a half-finished wizard.
 *
 * The registration wizard now locks each step until the previous one is complete,
 * but a lock in the browser is a courtesy, not an enforcement point. This checks
 * the ONLY thing that actually protects the data: POST /api/employees refuses a
 * payload that skipped a step, no matter how it was sent.
 *
 * Every probe gets its own name and mobile, because the duplicate guard rejects a
 * second record with the same company+branch+name — a shared name would mask what
 * is actually being tested. The probes that deliberately OMIT or CORRUPT a field
 * must keep that field exactly as the case intends, so uniqueness is applied when
 * the body is built, never afterwards.
 *
 * Records it manages to create are deleted again.
 *
 *   node backend/scripts/verifyRegistrationStepGate.js
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

(async () => {
  console.log('Registration step gate (server-side authority)\n');

  const user = await prisma.user.findFirst({
    where: { role: 'Company Head', companyId: { not: null } },
    select: { id: true, companyId: true, email: true },
  });
  if (!user) throw new Error('no Company Head to authenticate as');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt.sign({ id: user.id }, SECRET, { expiresIn: '10m' })}`,
  };
  console.log(`as ${user.email} (company ${user.companyId})\n`);

  const base = Date.now();
  let probe = 0;
  // A fresh, valid identity for each probe. Callers then delete or corrupt
  // exactly the field their case is about.
  const body = () => {
    probe++;
    return {
      companyId: user.companyId,
      // Step 1 — Personal Info
      name: `QA StepGate ${String(base).slice(-6)}-${probe}`,
      phone: `9${String(base + probe * 137).slice(-9)}`,
      gender: 'Male',
      dob: '1990-01-01',
      // Step 2 — Employment Details
      department: 'General',
      designation: 'QA Tester',
      joinDate: '2026-01-01',
      salary: 25000,
      employmentType: 'PERMANENT',
      category: 'Skilled',
    };
  };

  const created = [];
  const post = async (payload) => {
    const r = await fetch(`${BASE}/employees`, { method: 'POST', headers, body: JSON.stringify(payload) });
    const b = await j(r);
    if (r.status < 300 && b?.id) created.push(b.id);
    return { status: r.status, body: b };
  };

  // ── skipping Step 2 entirely ────────────────────────────────────────────
  const onlyStep1 = body();
  for (const k of ['department', 'designation', 'joinDate', 'salary', 'employmentType', 'category']) delete onlyStep1[k];
  const r1 = await post(onlyStep1);
  check('a payload with only Step 1 is refused', r1.status >= 400,
    r1.status >= 400 ? `${r1.status} ${String(r1.body.error || '').slice(0, 55)}` : 'ACCEPTED');
  check('the refusal names the missing fields', !!(r1.body.fields || r1.body.error),
    JSON.stringify(r1.body.fields || r1.body.error || '').slice(0, 90));

  // ── each Step 2 field is genuinely required ─────────────────────────────
  for (const key of ['department', 'designation', 'joinDate', 'salary']) {
    const p = body(); delete p[key];
    const r = await post(p);
    check(`Step 2 incomplete: missing ${key} is refused`, r.status >= 400,
      r.status >= 400 ? `${r.status}` : 'ACCEPTED — incomplete record created');
  }

  // ── Step 1 fields are required too ──────────────────────────────────────
  for (const key of ['name', 'phone']) {
    const p = body(); delete p[key];
    const r = await post(p);
    check(`Step 1 incomplete: missing ${key} is refused`, r.status >= 400,
      r.status >= 400 ? `${r.status}` : 'ACCEPTED — incomplete record created');
  }

  // ── present but invalid is refused, not just absent ─────────────────────
  const badPhone = body(); badPhone.phone = '12345';
  const rp = await post(badPhone);
  check('a present-but-invalid mobile is refused', rp.status >= 400,
    rp.status >= 400 ? `${rp.status} ${String(rp.body.error || '').slice(0, 45)}` : 'ACCEPTED');

  const badSalary = body(); badSalary.salary = 'not-a-number';
  const rs = await post(badSalary);
  check('a present-but-invalid salary is refused', rs.status >= 400,
    rs.status >= 400 ? `${rs.status}` : 'ACCEPTED');

  // ── the complete payload IS accepted ────────────────────────────────────
  const rf = await post(body());
  check('a complete payload is accepted', rf.status < 300,
    rf.status < 300 ? `created ${rf.body.employeeId || rf.body.id}` : `${rf.status} ${String(rf.body.error || '').slice(0, 70)}`);

  for (const id of created) await prisma.employee.deleteMany({ where: { id } }).catch(() => {});
  if (created.length) console.log(`\ncleaned up ${created.length} probe record(s)`);

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('\nFAILED:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
