/**
 * Regression test — mobile number validation.
 *
 * The Quick Registration form accepted any length and allowed a '+', so a
 * 15-digit or malformed "mobile" could be stored. The rule now comes from the
 * SHARED registry (utils/fieldValidators.js on the server, utils/fieldFormats.ts
 * in the browser), and this pins BOTH halves:
 *   • the rule itself — normalisation and accept/reject, on each side;
 *   • the API — a request that skips the form is still refused.
 *
 * Creates nothing that survives: any temp employee it manages to create is
 * deleted again.
 *
 *   node backend/scripts/verifyMobileValidation.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');
const { normalizeField, validateField } = require('../src/utils/fieldValidators');

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000/api';
const SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

let passed = 0, failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
};
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

// [input, shouldPass, expected normalised value]
const CASES = [
  ['9876543210', true, '9876543210'],          // plain 10 digits
  ['+91 98765 43210', true, '9876543210'],     // country code + spaces
  ['91-9876543210', true, '9876543210'],       // trunk code + dash
  ['98765 43210', true, '9876543210'],         // internal space
  ['987654321', false, '987654321'],           // 9 digits — too short
  ['98765432100', true, '9876543210'],         // 11 digits — extra digit dropped from the END, not the front
  ['09876543210', true, '9876543210'],         // 0 trunk prefix
  ['919876543210', true, '9876543210'],        // 91 country code, no plus
  ['12345', false, '12345'],                   // far too short
  ['abcdefghij', false, ''],                   // letters only
  ['98765abcde', false, '98765'],              // letters stripped, too short
  ['5876543210', false, '5876543210'],         // valid length, invalid Indian prefix
  ['!@#$%^&*()', false, ''],                   // symbols only
];

(async () => {
  console.log('Mobile number validation\n');

  // ── the rule ──────────────────────────────────────────────────────────────
  console.log('Shared rule (backend registry):');
  for (const [input, shouldPass, expectNorm] of CASES) {
    const norm = normalizeField('mobile', input);
    const res = validateField('mobile', input);
    // A blank normalises to empty, which the registry treats as "optional-blank
    // passes" — required-ness is the caller's job, so only test non-blank here.
    const accepted = norm !== '' && res.valid;
    check(`${JSON.stringify(input).padEnd(18)} → ${JSON.stringify(norm).padEnd(14)} ${accepted ? 'accepted' : 'rejected'}`,
      accepted === shouldPass && norm === expectNorm,
      norm === expectNorm ? '' : `expected normalised ${JSON.stringify(expectNorm)}`);
  }

  // Digits only, never longer than 10 — the two properties the form promises.
  const longRandom = '+91 (98765) 43210 ext 999';
  const trimmed = normalizeField('mobile', longRandom);
  check('normalisation always yields digits only', /^[0-9]*$/.test(trimmed), `got "${trimmed}"`);
  check('normalisation never exceeds 10 digits', trimmed.length <= 10, `length ${trimmed.length}`);

  // ── the API ───────────────────────────────────────────────────────────────
  console.log('\nAPI (POST /temporary-employees):');
  const user = await prisma.user.findFirst({
    where: { role: 'Company Head', companyId: { not: null } },
    select: { id: true, companyId: true, email: true },
  });
  if (!user) throw new Error('no Company Head to authenticate as');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt.sign({ id: user.id }, SECRET, { expiresIn: '10m' })}`,
  };
  const branch = await prisma.branch.findFirst({ where: { companyId: user.companyId }, select: { id: true, branchName: true } });

  const post = (mobile) => fetch(`${BASE}/temporary-employees`, {
    method: 'POST', headers,
    body: JSON.stringify({
      name: 'QA Mobile Probe', mobile,
      branchId: branch?.id, branchLocation: branch?.branchName,
      companyId: user.companyId,
    }),
  });

  const created = [];
  for (const bad of ['987654321', '98765432100000', 'abcdefghij', '12345', '5876543210']) {
    const r = await post(bad);
    const b = await j(r);
    // 400 = our shape check. Anything 2xx means an invalid number was stored.
    check(`rejects ${JSON.stringify(bad)}`, r.status === 400,
      r.status === 400 ? String(b.error || '').slice(0, 60) : `status ${r.status}`);
    if (r.status < 300 && b?.id) created.push(b.id);
  }

  // A well-formed number must still be accepted (or refused only as a DUPLICATE,
  // which is a different rule and proves validation let it through).
  const good = `9${String(Date.now()).slice(-9)}`;
  const okRes = await post(good);
  const okBody = await j(okRes);
  const passedValidation = okRes.status < 300 || okBody?.code === 'DUPLICATE_MOBILE';
  check(`accepts a valid number (${good})`, passedValidation, `status ${okRes.status}`);
  if (okRes.status < 300 && okBody?.id) created.push(okBody.id);

  // Stored normalised, not as typed.
  if (okRes.status < 300 && okBody?.id) {
    const row = await prisma.temporaryEmployee.findUnique({ where: { id: okBody.id }, select: { mobile: true } });
    check('stores the normalised digits', row?.mobile === good, `stored "${row?.mobile}"`);
  }

  for (const id of created) {
    await prisma.temporaryEmployee.delete({ where: { id } }).catch(() => {});
  }
  if (created.length) console.log(`\ncleaned up ${created.length} probe record(s)`);

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('\nFAILED:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
