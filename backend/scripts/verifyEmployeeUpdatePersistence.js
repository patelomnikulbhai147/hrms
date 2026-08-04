/**
 * Regression test — employee edits must reach the database and be readable back.
 *
 * Guards the bug where the UI reported "Employee updated successfully" but the
 * old values reappeared when the record was reopened. That turned out to be a
 * stale client-side list, not a lost write, so this test pins BOTH halves:
 *   • the write really commits (verified by an independent SQL read, not the
 *     API's own echo — an endpoint that returned the payload it was handed would
 *     otherwise pass while saving nothing);
 *   • GET /employees/:id exists and answers with the committed state, which is
 *     what the edit screen now re-reads before it opens.
 *
 * Runs against a live backend on the local database. Restores the record it
 * touched, so it is safe to re-run.
 *
 *   node backend/scripts/verifyEmployeeUpdatePersistence.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000/api';
const SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
};

const body = async (r) => {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
};

// Every field the edit form lets a user change, with a value distinguishable
// from whatever is already stored.
const editsFor = (stamp) => ({
  name: `QA Name ${stamp}`,
  email: `qa.${stamp}@example.com`,
  phone: `98${String(stamp).padStart(8, '0')}`.slice(0, 10),
  gender: 'Female',
  dob: '1991-02-03T00:00:00.000Z',
  maritalStatus: 'MARRIED',
  fatherSpouseName: `QA Father ${stamp}`,
  emergencyContact: '9876543210',
  presentAddress: `QA Present ${stamp}`,
  permanentAddress: `QA Permanent ${stamp}`,
  city: 'Rajkot',
  state: 'Gujarat',
  nationality: 'Indian',
  department: 'General',
  designation: `QA Desig ${stamp}`,
  employmentType: 'CONTRACTUAL',
  category: 'Skilled',
  salary: 31234,
  manager: `QA Manager ${stamp}`,
  bankName: `QA Bank ${stamp}`,
  accountNumber: `1234${stamp}`,
  ifsc: 'HDFC0001234',
  pan: 'ABCDE1234F',
  uan: '123456789012',
  pfNumber: `PF${stamp}`,
  wcPolicyNumber: `WC-${stamp}`,
});

const same = (a, b) => {
  if (a instanceof Date || b instanceof Date) {
    const da = new Date(a).getTime(); const db = new Date(b).getTime();
    return !Number.isNaN(da) && !Number.isNaN(db) && da === db;
  }
  return String(a ?? '') === String(b ?? '');
};

(async () => {
  console.log('Employee update persistence\n');

  // A Company Head with edit rights; the token is minted directly because login
  // is CAPTCHA-gated.
  const user = await prisma.user.findFirst({
    where: { role: 'Company Head', companyId: { not: null } },
    // accessibleCompanyIds matters: the isolation check below must exclude every
    // company this user is granted, not just their primary one.
    select: { id: true, companyId: true, email: true, accessibleCompanyIds: true },
  });
  if (!user) throw new Error('no Company Head user to authenticate as');

  const target = await prisma.employee.findFirst({
    where: { companyId: user.companyId, status: 'Active' },
  });
  if (!target) throw new Error(`no active employee in company ${user.companyId}`);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt.sign({ id: user.id }, SECRET, { expiresIn: '10m' })}`,
  };
  console.log(`as ${user.email} (company ${user.companyId}) editing employee ${target.id} ${target.name}\n`);

  const original = { ...target };
  const stamp = Date.now().toString().slice(-6);
  const edits = editsFor(stamp);

  try {
    // ── the single-record read the edit screen depends on ───────────────────
    const getRes = await fetch(`${BASE}/employees/${target.id}`, { headers });
    const got = await body(getRes);
    check('GET /employees/:id exists', getRes.status === 200, `status ${getRes.status}`);
    check('GET /employees/:id returns the record', got && String(got.id) === String(target.id));

    // ── the write ────────────────────────────────────────────────────────────
    // Mimic the client exactly: it spreads the whole loaded record, then overlays
    // the edits, and includes form-only helper keys.
    const payload = { ...target, ...edits, confirmAccountNumber: edits.accountNumber, codeMode: 'auto' };
    const putRes = await fetch(`${BASE}/employees/${target.id}`, {
      method: 'PUT', headers, body: JSON.stringify(payload),
    });
    const putBody = await body(putRes);
    check('PUT /employees/:id succeeds', putRes.status === 200,
      putRes.status === 200 ? '' : JSON.stringify(putBody).slice(0, 200));
    if (putRes.status !== 200) throw new Error('update rejected — cannot verify persistence');

    // ── the database, read independently of the API ─────────────────────────
    const row = await prisma.employee.findUnique({ where: { id: target.id } });
    const lost = Object.entries(edits).filter(([k, v]) => !same(row[k], v)).map(([k]) => k);
    check(`all ${Object.keys(edits).length} edited fields are committed to the database`,
      lost.length === 0, lost.length ? `not persisted: ${lost.join(', ')}` : '');

    // A success response must never describe state the database does not hold.
    const liars = Object.keys(edits).filter((k) => same(putBody[k], edits[k]) && !same(row[k], edits[k]));
    check('the success response matches the committed row (no false "saved")', liars.length === 0,
      liars.length ? `echoed but not stored: ${liars.join(', ')}` : '');

    // ── reopening the employee, exactly as the UI now does ──────────────────
    const reopened = await body(await fetch(`${BASE}/employees/${target.id}`, { headers }));
    const staleOnReopen = Object.entries(edits).filter(([k, v]) => !same(reopened[k], v)).map(([k]) => k);
    check('reopening the employee shows the edited values', staleOnReopen.length === 0,
      staleOnReopen.length ? `stale: ${staleOnReopen.join(', ')}` : '');

    // ── and through the list the table actually renders from ────────────────
    const list = await body(await fetch(`${BASE}/employees?limit=200`, { headers }));
    const rows = Array.isArray(list) ? list : (list.employees || list.data || []);
    const listed = rows.find((e) => String(e.id) === String(target.id));
    check('the employee list serves the edited values', !!listed && same(listed.name, edits.name),
      listed ? `list name="${listed.name}"` : 'employee missing from list');

    // `updatedAt` must advance, or "when did this last change?" is unanswerable.
    check('updatedAt advanced', new Date(row.updatedAt) > new Date(original.updatedAt),
      `${original.updatedAt?.toISOString?.()} -> ${row.updatedAt?.toISOString?.()}`);

    // ── a rejected update must not report success ────────────────────────────
    const badRes = await fetch(`${BASE}/employees/${target.id}`, {
      method: 'PUT', headers, body: JSON.stringify({ ...target, name: '   ' }),
    });
    check('a blank required field is rejected, not silently accepted', badRes.status >= 400,
      `status ${badRes.status}`);
    const afterBad = await prisma.employee.findUnique({ where: { id: target.id }, select: { name: true } });
    check('the rejected update left the record untouched', same(afterBad.name, edits.name));

    // ── an out-of-scope employee must not be readable ────────────────────────
    // "Out of scope" is not simply "a different companyId": a Company Head may
    // hold grants over several companies, and may reach an employee through an
    // accessible BRANCH as well. Exclude the whole grant set, or this asserts
    // against a record the user is legitimately entitled to see.
    const grants = [user.companyId, ...(Array.isArray(user.accessibleCompanyIds) ? user.accessibleCompanyIds : [])]
      .filter((v) => v != null)
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    const branchesOfGrants = await prisma.branch.findMany({
      where: { companyId: { in: grants } }, select: { id: true },
    });
    const reachableBranchIds = branchesOfGrants.map((b) => b.id);
    const foreign = await prisma.employee.findFirst({
      where: {
        companyId: { notIn: grants },
        OR: [{ branchId: null }, { branchId: { notIn: reachableBranchIds } }],
      },
      select: { id: true, companyId: true },
    });
    if (foreign) {
      const fRes = await fetch(`${BASE}/employees/${foreign.id}`, { headers });
      check(`an out-of-scope employee (company ${foreign.companyId}) is not readable`,
        fRes.status === 403 || fRes.status === 404, `status ${fRes.status}`);
    } else {
      console.log(`  SKIP  no employee outside the user's grants (${grants.join(', ')}) to test isolation with`);
    }
  } finally {
    // Put the record back the way it was found.
    const restore = {};
    for (const k of Object.keys(editsFor('0'))) restore[k] = original[k];
    await prisma.employee.update({ where: { id: target.id }, data: restore }).catch((e) => {
      console.error('  !! could not restore the test employee:', e.message);
    });
    console.log('\nrestored the test employee to its original values');
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
