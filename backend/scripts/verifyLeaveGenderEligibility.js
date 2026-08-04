/**
 * GENDER-BASED LEAVE ELIGIBILITY — end-to-end through the real HTTP API.
 *
 * Creates four scratch employees (Male, Female, "F" — the abbreviated spelling
 * that exists in production — and one with NO gender recorded), then drives the
 * real endpoints and checks the database, not just the response codes.
 *
 * The point of the suite is the second half: the API must refuse an ineligible
 * leave type even though nothing rendered a dropdown. Hiding the option is not
 * the fix; this is what proves the rule is enforced.
 *
 * Usage: node scripts/verifyLeaveGenderEligibility.js [baseUrl]
 */
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');
require('dotenv').config();

const BASE = process.argv[2] || 'http://localhost:5000/api';
const svc = require('../src/services/leaveEligibilityService');

let n = 0;
const results = [];
const check = (name, passed, detail = '') => {
  n++;
  results.push({ n, name, passed, detail });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const has = (types, label) => types.some((t) => t.label === label);

(async () => {
  const user = await prisma.user.findFirst({
    where: { role: 'Company Head', companyId: { not: null } },
    select: { id: true, role: true, companyId: true, email: true },
  });
  if (!user) throw new Error('No Company Head user to authenticate as.');
  const token = jwt.sign({ id: user.id, role: user.role, companyId: user.companyId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const COMPANY = user.companyId;

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  GENDER-BASED LEAVE ELIGIBILITY                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`API      : ${BASE}`);
  console.log(`Company  : ${COMPANY}  (authenticated as ${user.email})\n`);

  const made = [];
  const mk = async (label, gender) => {
    const e = await prisma.employee.create({
      data: {
        companyId: COMPANY, employeeId: `QA-GEN-${label}-${Date.now().toString().slice(-5)}`,
        name: `QA Gender ${label}`, email: `qa.gender.${label}.${Date.now()}@qa.local`,
        department: 'Operations', designation: 'QA Subject', salary: 20000,
        status: 'Active', gender, joinDate: new Date('2024-01-01T00:00:00Z'),
      },
    });
    made.push(e);
    // A scratch employee starts with a zero wallet, so Casual/Sick/Annual would
    // be refused with 409 INSUFFICIENT BALANCE — a different rule entirely, and
    // it would mask whether eligibility passed. Give them balance so the only
    // thing under test here is eligibility.
    await prisma.leaveBalance.create({
      data: {
        companyId: COMPANY, employeeId: e.id, year: 2024,
        clBalance: 10, plBalance: 10, slBalance: 10, accruedThroughMonth: 12,
      },
    }).catch(() => {});
    return e;
  };
  const cleanup = async () => {
    for (const e of made) {
      await prisma.leaveRequest.deleteMany({ where: { employeeId: e.id } }).catch(() => {});
      await prisma.leaveBalance.deleteMany({ where: { employeeId: e.id } }).catch(() => {});
      await prisma.employee.delete({ where: { id: e.id } }).catch(() => {});
    }
    await prisma.leaveTypePolicy.deleteMany({ where: { companyId: COMPANY, code: 'paternity' } }).catch(() => {});
  };

  const applyLeave = (employee, leaveType) => fetch(`${BASE}/leaves`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      companyId: COMPANY, employeeId: employee.id, employeeName: employee.name,
      department: employee.department, leaveType,
      fromDate: '2024-06-03', toDate: '2024-06-04', days: 2,
      reason: 'QA eligibility fixture', status: 'Pending', appliedOn: '2024-06-01',
    }),
  });

  try {
    const male = await mk('M', 'Male');
    const female = await mk('F', 'Female');
    const abbrev = await mk('ABBR', 'F');       // the 5 production rows spelled 'F'
    const unknown = await mk('NONE', null);     // the 16 production rows with no gender

    // ── Normalisation ───────────────────────────────────────────────────────
    console.log('\n── Gender normalisation (production holds Male/Female/M/F/NULL) ──');
    check('"Male" → Male', svc.normalizeGender('Male') === 'Male');
    check('"M" → Male', svc.normalizeGender('M') === 'Male');
    check('"female" → Female', svc.normalizeGender('female') === 'Female');
    check('"F" → Female', svc.normalizeGender('F') === 'Female', 'the 5 abbreviated production rows');
    check('null → not recorded', svc.normalizeGender(null) === null);
    check('"" → not recorded', svc.normalizeGender('  ') === null);
    check('"Other" → Other', svc.normalizeGender('Other') === 'Other');

    // ── The eligible list the form renders ──────────────────────────────────
    console.log('\n── GET /leave-types/eligible ──');
    const eligibleOf = async (emp) => {
      const r = await fetch(`${BASE}/leave-types/eligible?employeeId=${emp.id}`, { headers: H });
      return { http: r.status, body: await r.json() };
    };

    const m = await eligibleOf(male);
    check('male: HTTP 200 and gender resolved', m.http === 200 && m.body.gender === 'Male');
    check('male: Maternity Leave is NOT offered', !has(m.body.types, 'Maternity Leave'),
      `${m.body.types.length} types offered`);
    check('male: no female-only type is offered',
      !['Pregnancy Leave', 'Miscarriage Leave', 'Nursing Leave', 'Adoption Leave'].some((l) => has(m.body.types, l)));
    check('male: Paternity Leave IS offered', has(m.body.types, 'Paternity Leave'));
    check('no leave type outside the agreed catalogue is offered',
      m.body.types.length === 9,
      `${m.body.types.length} types (8 universal + Paternity)`);
    check('male: every universal type is offered',
      ['Annual Leave', 'Casual Leave', 'Sick Leave', 'Paid Leave', 'Earned Leave', 'Comp Off', 'Optional Leave', 'LOP']
        .every((l) => has(m.body.types, l)),
      m.body.types.map((t) => t.label).join(', '));

    const f = await eligibleOf(female);
    check('female: Maternity Leave IS offered', has(f.body.types, 'Maternity Leave'));
    check('female: pregnancy / miscarriage / nursing are offered',
      ['Pregnancy Leave', 'Miscarriage Leave', 'Nursing Leave'].every((l) => has(f.body.types, l)));
    check('female: Paternity Leave is NOT offered', !has(f.body.types, 'Paternity Leave'));

    const a = await eligibleOf(abbrev);
    check('gender "F" is treated exactly like "Female"',
      a.body.gender === 'Female' && has(a.body.types, 'Maternity Leave'));

    const u = await eligibleOf(unknown);
    check('no gender recorded: flagged, not guessed',
      u.body.gender === null && u.body.genderRecorded === false);
    check('no gender recorded: universal types still offered',
      ['Annual Leave', 'Casual Leave', 'Sick Leave', 'LOP'].every((l) => has(u.body.types, l)));
    check('no gender recorded: NO gender-specific type is granted',
      !has(u.body.types, 'Maternity Leave') && !has(u.body.types, 'Paternity Leave'),
      'a restricted type is never granted off a blank field');

    // ── The rule the UI cannot enforce ──────────────────────────────────────
    console.log('\n── POST /leaves — direct API calls that bypass the form ──');
    const r1 = await applyLeave(male, 'Maternity Leave');
    const b1 = await r1.json();
    check('male + "Maternity Leave" → refused', r1.status === 400 && b1.success === false,
      `HTTP ${r1.status} "${b1.message}"`);
    check('refusal uses the specified message',
      b1.message === 'The selected leave type is not eligible for this employee.');
    check('nothing was written to the database',
      (await prisma.leaveRequest.count({ where: { employeeId: male.id } })) === 0);

    const r2 = await applyLeave(male, 'Maternity');
    check('the bare spelling "Maternity" is refused too', r2.status === 400,
      'live data holds 134 rows spelled this way');

    const r3 = await applyLeave(male, '  maternity leave  ');
    check('casing and padding cannot slip past it', r3.status === 400);

    const r4 = await applyLeave(female, 'Paternity Leave');
    check('female + "Paternity Leave" → refused', r4.status === 400);

    const r5 = await applyLeave(unknown, 'Maternity Leave');
    const b5 = await r5.json();
    check('unrecorded gender + Maternity → refused, and says why',
      r5.status === 400 && b5.code === 'GENDER_NOT_RECORDED',
      b5.message);

    // ── The rule must not block legitimate leave ────────────────────────────
    console.log('\n── POST /leaves — eligible applications still succeed ──');
    const ok1 = await applyLeave(male, 'Casual Leave');
    const okBody1 = await ok1.json();
    check('male + Casual Leave → accepted', ok1.status === 201, `HTTP ${ok1.status}`);

    const ok2 = await applyLeave(female, 'Maternity Leave');
    check('female + Maternity Leave → accepted', ok2.status === 201, `HTTP ${ok2.status}`);

    const ok3 = await applyLeave(abbrev, 'Maternity Leave');
    check('gender "F" + Maternity Leave → accepted', ok3.status === 201);

    const ok4 = await applyLeave(male, 'Paternity Leave');
    check('male + Paternity Leave → accepted', ok4.status === 201);

    const ok5 = await applyLeave(unknown, 'Sick Leave');
    check('unrecorded gender + a universal type → accepted', ok5.status === 201);

    const ok6 = await applyLeave(male, 'Optional Holiday');
    check('an unrecognised historical type is not blocked', ok6.status === 201,
      'live data holds "Optional Holiday", "CL", "PL", "SL", "LWP"');

    // ── Existing records: visible, not editable forward ─────────────────────
    console.log('\n── Historical records ──');
    // Plant a record that violates current policy, the way pre-policy data does.
    const legacy = await prisma.leaveRequest.create({
      data: {
        companyId: COMPANY, employeeId: male.id, employeeName: male.name,
        department: male.department, leaveType: 'Maternity', fromDate: '2023-02-01',
        toDate: '2023-02-05', days: 5, reason: 'pre-policy record', status: 'Pending',
        appliedOn: '2023-01-25',
      },
    });
    const listed = await (await fetch(`${BASE}/leaves?companyId=${COMPANY}`, { headers: H })).json();
    check('a pre-policy record stays VISIBLE for audit',
      Array.isArray(listed) && listed.some((l) => l.id === legacy.id));

    const appr = await fetch(`${BASE}/leaves/${legacy.id}`, {
      method: 'PUT', headers: H, body: JSON.stringify({ status: 'Approved' }),
    });
    check('it cannot be APPROVED forward', appr.status === 400, `HTTP ${appr.status}`);
    check('and so it never became paid days',
      (await prisma.leaveRequest.findUnique({ where: { id: legacy.id } })).status === 'Pending');

    const rej = await fetch(`${BASE}/leaves/${legacy.id}`, {
      method: 'PUT', headers: H, body: JSON.stringify({ status: 'Rejected' }),
    });
    check('but it CAN be rejected, so HR can clear it', rej.status === 200, `HTTP ${rej.status}`);

    const retype = await fetch(`${BASE}/leaves/${okBody1.id}`, {
      method: 'PUT', headers: H, body: JSON.stringify({ leaveType: 'Maternity Leave' }),
    });
    check('an eligible record cannot be EDITED into an ineligible type', retype.status === 400,
      `HTTP ${retype.status}`);

    // ── Configuration, not hardcoding ───────────────────────────────────────
    console.log('\n── Policy configuration ──');
    const before = await applyLeave(female, 'Paternity Leave');
    check('baseline: Paternity is Male-only', before.status === 400);

    const cfg = await fetch(`${BASE}/leave-types/paternity`, {
      method: 'PUT', headers: H, body: JSON.stringify({ companyId: COMPANY, eligibleGender: 'All' }),
    });
    check('HR can open Paternity to both parents', cfg.status === 200, `HTTP ${cfg.status}`);

    const after = await applyLeave(female, 'Paternity Leave');
    check('and the API immediately honours it', after.status === 201,
      'the rule came from configuration, not from code');

    const fAfter = await eligibleOf(female);
    check('the form list follows the same configuration',
      has(fAfter.body.types, 'Paternity Leave'));

    const bad = await fetch(`${BASE}/leave-types/paternity`, {
      method: 'PUT', headers: H, body: JSON.stringify({ companyId: COMPANY, eligibleGender: 'Martian' }),
    });
    check('an invalid gender value is rejected', bad.status === 400);

    const unknownType = await fetch(`${BASE}/leave-types/not-a-type`, {
      method: 'PUT', headers: H, body: JSON.stringify({ companyId: COMPANY, enabled: false }),
    });
    check('an unknown leave-type code is rejected', unknownType.status === 404);

    // ── Access control ──────────────────────────────────────────────────────
    console.log('\n── Access control ──');
    const badId = await fetch(`${BASE}/leaves/undefined`, {
      method: 'PUT', headers: H, body: JSON.stringify({ status: 'Approved' }),
    });
    check('a non-numeric leave id is a 400, not a 500', badId.status === 400, `HTTP ${badId.status}`);

    const anon = await fetch(`${BASE}/leave-types/eligible?employeeId=${male.id}`);
    check('unauthenticated eligibility lookup → 401', anon.status === 401, `HTTP ${anon.status}`);
    const anonCfg = await fetch(`${BASE}/leave-types/paternity`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eligibleGender: 'All' }),
    });
    check('unauthenticated policy change → 401', anonCfg.status === 401, `HTTP ${anonCfg.status}`);
  } finally {
    await cleanup();
    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${passed} passed, ${results.length - passed} failed  (test data cleaned up)`);
    results.filter((r) => !r.passed).forEach((r) => console.log(`  FAILED  ${r.n}. ${r.name} — ${r.detail}`));
    await prisma.$disconnect();
    process.exit(results.some((r) => !r.passed) ? 1 : 0);
  }
})().catch(async (e) => { console.error('SUITE ERROR:', e); await prisma.$disconnect(); process.exit(1); });
