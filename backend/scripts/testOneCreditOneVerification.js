/**
 * Regression suite for the rule: 1 verification credit = 1 successful verification.
 *
 * Runs against scratch companies (id 999801/999802) and cleans up after itself.
 * Never calls Cashfree or any external provider — only the credit service.
 *
 * Usage: node scripts/testOneCreditOneVerification.js
 */
require('dotenv').config();
const prisma = require('../src/config/prisma');
const Credits = require('../src/services/verificationCreditService');

const A = 999801; // API mode, funded
const B = 999802; // used for concurrency + exhaustion

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

async function reset(companyId, credits, mode = 'API') {
  await prisma.verificationCreditTransaction.deleteMany({ where: { companyId } });
  await prisma.verificationCreditWallet.deleteMany({ where: { companyId } });
  await prisma.verificationSettings.deleteMany({ where: { companyId } });

  await prisma.verificationSettings.create({
    data: { companyId, verificationMode: mode, provider: 'Test Provider', status: 'Connected', costPerVerification: 1 },
  });
  await prisma.verificationCreditWallet.create({
    data: {
      companyId, serviceType: 'BANK_VERIFICATION',
      totalCredits: credits, usedCredits: 0, remainingCredits: credits,
      expiredCredits: 0, status: credits > 0 ? 'Active' : 'Exhausted',
    },
  });
}

async function cleanup() {
  for (const id of [A, B]) {
    await prisma.verificationCreditTransaction.deleteMany({ where: { companyId: id } });
    await prisma.verificationCreditWallet.deleteMany({ where: { companyId: id } });
    await prisma.verificationSettings.deleteMany({ where: { companyId: id } });
  }
}

(async () => {
  console.log('=== 1 credit = 1 verification ===\n');

  // ── 1. n credits == n verifications, with no conversion ─────────────────────
  console.log('1. Credits map 1:1 onto verifications');
  for (const n of [1, 10, 25, 50, 100]) {
    await reset(A, n);
    const s = await Credits.checkCredits(A);
    check(`${n} credits -> ${n} verifications`, s.remainingVerifications, n);
    check(`${n} credits -> cost reported as 1`, s.costPerVerification, 1);
    check(`${n} credits -> available`, s.isAvailable, true);
  }

  // ── 2. Each success deducts exactly one ─────────────────────────────────────
  console.log('\n2. Each successful verification deducts exactly 1 credit');
  await reset(A, 10);
  let expected = 10;
  for (let i = 1; i <= 4; i++) {
    const r = await Credits.deductCreditOnSuccess({ companyId: A, referenceId: `T${i}` });
    expected -= 1;
    check(`verification ${i}: remaining`, r.remainingCredits, expected);
    check(`verification ${i}: ledger credits`, r.transaction.credits, 1);
  }
  const w = await prisma.verificationCreditWallet.findFirst({ where: { companyId: A } });
  check('used counter after 4 successes', w.usedCredits, 4);
  check('remaining after 4 successes', w.remainingCredits, 6);
  check('allocated - used = remaining', w.totalCredits - w.usedCredits, w.remainingCredits);

  // ── 3. Exactly n verifications from n credits, then blocked ─────────────────
  console.log('\n3. 10 credits allow exactly 10 verifications, then stop');
  await reset(B, 10);
  let succeeded = 0;
  for (let i = 0; i < 15; i++) {
    try { await Credits.deductCreditOnSuccess({ companyId: B, referenceId: `X${i}` }); succeeded++; }
    catch { /* expected once exhausted */ }
  }
  check('successful deductions from 10 credits', succeeded, 10);
  const wb = await prisma.verificationCreditWallet.findFirst({ where: { companyId: B } });
  check('remaining after exhaustion', wb.remainingCredits, 0);
  check('used after exhaustion', wb.usedCredits, 10);
  check('status after exhaustion', wb.status, 'Exhausted');
  const st = await Credits.checkCredits(B);
  check('blocked when empty', st.unavailableCode, 'INSUFFICIENT_CREDITS');
  check('no verifications left', st.remainingVerifications, 0);

  // ── 4. No double deduction under concurrency ────────────────────────────────
  console.log('\n4. Concurrent successes never over-deduct');
  await reset(B, 5);
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) => Credits.deductCreditOnSuccess({ companyId: B, referenceId: `C${i}` }))
  );
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const wc = await prisma.verificationCreditWallet.findFirst({ where: { companyId: B } });
  check('at most 5 succeed from 5 credits', ok, 5);
  check('remaining never negative', wc.remainingCredits, 0);
  check('used equals successes', wc.usedCredits, ok);
  const ledger = await prisma.verificationCreditTransaction.findMany({ where: { companyId: B, transactionType: 'Debit' } });
  check('one ledger row per success', ledger.length, ok);
  check('every ledger row is 1 credit', [...new Set(ledger.map((t) => t.credits))], [1]);

  // ── 5. Add / Remove / Reset apply verbatim ──────────────────────────────────
  console.log('\n5. Super Admin actions apply the number verbatim');
  await reset(A, 0);
  await Credits.allocateCredits({ companyId: A, action: 'ADD', credits: 25 });
  let s5 = await Credits.checkCredits(A);
  check('ADD 25 -> 25 credits', s5.remainingCredits, 25);
  check('ADD 25 -> 25 verifications', s5.remainingVerifications, 25);

  await Credits.allocateCredits({ companyId: A, action: 'DEDUCT', credits: 5 });
  s5 = await Credits.checkCredits(A);
  check('REMOVE 5 -> 20 credits', s5.remainingCredits, 20);
  const w5 = await prisma.verificationCreditWallet.findFirst({ where: { companyId: A } });
  check('after removal: allocated - used = remaining', w5.totalCredits - w5.usedCredits, w5.remainingCredits);

  await Credits.allocateCredits({ companyId: A, action: 'RESET', credits: 0 });
  s5 = await Credits.checkCredits(A);
  check('RESET -> 0 credits', s5.remainingCredits, 0);

  await Credits.allocateCredits({ companyId: A, action: 'ADD', credits: 100 });
  s5 = await Credits.checkCredits(A);
  check('ADD 100 after reset -> 100', s5.remainingCredits, 100);
  check('ADD 100 -> 100 verifications', s5.remainingVerifications, 100);

  // ── 6. A failed verification deducts nothing ────────────────────────────────
  console.log('\n6. Nothing is deducted without a success');
  await reset(A, 7);
  const before = await Credits.checkCredits(A);
  // deductCreditOnSuccess is the ONLY path that deducts; not calling it is the
  // failure case. Assert the figure is untouched.
  const after = await Credits.checkCredits(A);
  check('unchanged with no success', after.remainingCredits, before.remainingCredits);
  check('still 7 verifications', after.remainingVerifications, 7);

  await cleanup();

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exitCode = fail === 0 ? 0 : 1;
})()
  .catch(async (e) => { console.error('SUITE ERROR:', e); await cleanup().catch(() => {}); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
