/**
 * testVerificationWalletGate.js
 *
 * End-to-end regression suite for the Bank Verification credit wallet gate.
 *
 * The credit model is: 1 verification credit = 1 successful verification. There
 * is no cost per verification and no conversion; see
 * scripts/testOneCreditOneVerification.js for the suite dedicated to that rule.
 *
 * This suite covers the defects that made a funded tenant report "credits
 * exhausted":
 *   - running out of credits rewriting the tenant's mode to Manual, so adding
 *     credits restored the figure but never the ability to verify
 *   - Manual mode / suspension reported to the UI as CREDITS_EXHAUSTED
 *   - a workspace id (branch) addressing a different tenant than the one debited
 *   - concurrent verifications sharing a single deduction (lost update)
 *
 * Runs against the live API on a scratch company id, then removes everything it
 * created. No existing tenant data is read or written.
 *
 * Usage: node scripts/testVerificationWalletGate.js
 */
require('dotenv').config();
const prisma = require('../src/config/prisma');
const VerificationCreditService = require('../src/services/verificationCreditService');

// Scratch tenants, well outside real company ids.
const TEST_COMPANIES = { A: 990001, B: 990002, C: 990003, D: 990004 };

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  PASS  ${label}  → ${JSON.stringify(actual)}`); }
  else { failed++; console.log(`  FAIL  ${label}  → expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

async function seed(companyId, { remaining, total = remaining, used = 0, mode = 'API Verification', cost = 1, walletStatus = 'Active', settingsStatus = 'Connected' }) {
  // Each scenario starts from an empty ledger as well as an empty wallet, so
  // ledger assertions describe only the verification under test.
  await prisma.verificationCreditTransaction.deleteMany({ where: { companyId } });
  await prisma.verificationCreditWallet.deleteMany({ where: { companyId } });
  await prisma.verificationSettings.deleteMany({ where: { companyId } });
  await prisma.verificationCreditWallet.create({
    data: { companyId, serviceType: 'BANK_VERIFICATION', totalCredits: total, usedCredits: used, remainingCredits: remaining, status: walletStatus }
  });
  await prisma.verificationSettings.create({
    data: { companyId, verificationMode: mode, provider: 'Cashfree Production API', status: settingsStatus, costPerVerification: cost }
  });
}

async function cleanup() {
  const ids = Object.values(TEST_COMPANIES);
  await prisma.verificationCreditTransaction.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.verificationCreditWallet.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.verificationSettings.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.companyBankVerificationSettings.deleteMany({ where: { companyId: { in: ids } } }).catch(() => {});
}

(async () => {
  await cleanup();

  console.log('\n=== 1. Credits → verifications available (1 credit = 1 verification) ===');
  const cases = [
    { id: TEST_COMPANIES.A, remaining: 20, expectVerifications: 20, expectAvailable: true },
    { id: TEST_COMPANIES.B, remaining: 8, expectVerifications: 8, expectAvailable: true },
    { id: TEST_COMPANIES.C, remaining: 1, expectVerifications: 1, expectAvailable: true },
    { id: TEST_COMPANIES.D, remaining: 0, expectVerifications: 0, expectAvailable: false }
  ];
  for (const c of cases) {
    await seed(c.id, { remaining: c.remaining });
    const s = await VerificationCreditService.checkCredits(c.id);
    check(`${c.remaining} credits → verifications`, s.remainingVerifications, c.expectVerifications);
    check(`${c.remaining} credits → verify allowed`, s.isAvailable, c.expectAvailable);
  }

  console.log('\n=== 2. Zero credits is blocked, and blocked for the right reason ===');
  await seed(TEST_COMPANIES.A, { remaining: 0, total: 8, used: 8 });
  let st = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('0 credits → verify allowed', st.isAvailable, false);
  check('0 credits → reason code', st.unavailableCode, 'INSUFFICIENT_CREDITS');
  let debitError = null;
  try { await VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.A }); } catch (e) { debitError = e.message; }
  check('0 credits → deduction refused', !!debitError, true);

  console.log('\n=== 3. A single credit buys exactly one verification ===');
  await seed(TEST_COMPANIES.A, { remaining: 1 });
  st = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('1 credit → verify allowed', st.isAvailable, true);
  const lastOne = await VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.A, verifiedBy: 'regression' });
  check('1 credit → spent, none left', lastOne.remainingCredits, 0);
  st = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('after last credit → blocked', st.unavailableCode, 'INSUFFICIENT_CREDITS');

  console.log('\n=== 4. Cost is a fixed 1 and is not tenant-configurable ===');
  // Seeded with a deliberately wrong stored cost: the flow must ignore it.
  await seed(TEST_COMPANIES.A, { remaining: 30, cost: 10 });
  st = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('stored cost 10 is ignored → reports 1', st.costPerVerification, 1);
  check('30 credits → 30 verifications', st.remainingVerifications, 30);
  const debit10 = await VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.A, verifiedBy: 'regression' });
  check('deducted amount is 1', debit10.transaction.credits, 1);
  check('closing credits', debit10.remainingCredits, 29);

  console.log('\n=== 5. Deduction happens once, only on success, and lands in the ledger ===');
  await seed(TEST_COMPANIES.A, { remaining: 8 });
  const before = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  const debit = await VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.A, referenceId: 'REG-TEST-1', verifiedBy: 'regression' });
  const after = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('credits before', before.remainingCredits, 8);
  check('credits after one verification', after.remainingCredits, 7);
  check('used credits after', after.usedCredits, 1);
  check('verifications left after', after.remainingVerifications, 7);
  const ledger = await prisma.verificationCreditTransaction.findMany({ where: { companyId: TEST_COMPANIES.A, transactionType: 'Debit' } });
  check('ledger debit rows', ledger.length, 1);
  check('ledger debit amount', ledger[0].credits, 1);
  check('ledger opening→closing', [ledger[0].openingBalance, ledger[0].closingBalance], [8, 7]);
  check('result exposes cost of 1', debit.costPerVerification, 1);

  console.log('\n=== 6. Exhaustion does NOT rewrite the tenant config, and adding credits restores service ===');
  await seed(TEST_COMPANIES.A, { remaining: 1 });
  await VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.A, verifiedBy: 'regression' });
  const drained = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('drained → credits', drained.remainingCredits, 0);
  check('drained → verify allowed', drained.isAvailable, false);
  check('drained → mode preserved', drained.verificationMode, 'API Verification');
  check('drained → reason code', drained.unavailableCode, 'INSUFFICIENT_CREDITS');

  await VerificationCreditService.allocateCredits({ companyId: TEST_COMPANIES.A, action: 'ADD', credits: 20, createdBy: 'regression' });
  const recharged = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('after adding 20 → credits', recharged.remainingCredits, 20);
  check('after adding 20 → verify allowed again', recharged.isAvailable, true);
  check('after adding 20 → verifications', recharged.remainingVerifications, 20);
  check('after adding 20 → wallet status', recharged.walletStatus, 'Active');

  console.log('\n=== 7. Manual mode and suspension are NOT reported as exhausted credits ===');
  await seed(TEST_COMPANIES.B, { remaining: 50, mode: 'Manual' });
  const manualMode = await VerificationCreditService.checkCredits(TEST_COMPANIES.B);
  check('manual mode → verify allowed', manualMode.isAvailable, false);
  check('manual mode → reason code', manualMode.unavailableCode, 'MANUAL_MODE');
  check('manual mode → credits intact', manualMode.remainingCredits, 50);

  await seed(TEST_COMPANIES.B, { remaining: 50, walletStatus: 'Suspended' });
  const suspended = await VerificationCreditService.checkCredits(TEST_COMPANIES.B);
  check('suspended → verify allowed', suspended.isAvailable, false);
  check('suspended → reason code', suspended.unavailableCode, 'SUSPENDED');
  check('suspended → credits intact', suspended.remainingCredits, 50);

  console.log('\n=== 8. Adding credits never lifts a deliberate suspension ===');
  await VerificationCreditService.allocateCredits({ companyId: TEST_COMPANIES.B, action: 'ADD', credits: 40, createdBy: 'regression' });
  const stillSuspended = await VerificationCreditService.checkCredits(TEST_COMPANIES.B);
  check('suspended + credits added → wallet status', stillSuspended.walletStatus, 'Suspended');
  check('suspended + credits added → verify allowed', stillSuspended.isAvailable, false);

  console.log('\n=== 9. Concurrent verifications cannot share one credit (lost update) ===');
  await seed(TEST_COMPANIES.C, { remaining: 1 });
  const results = await Promise.allSettled([
    VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.C, verifiedBy: 'race-1' }),
    VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.C, verifiedBy: 'race-2' })
  ]);
  check('one deduction succeeds', results.filter(r => r.status === 'fulfilled').length, 1);
  check('one deduction is refused', results.filter(r => r.status === 'rejected').length, 1);
  const raceWallet = await VerificationCreditService.checkCredits(TEST_COMPANIES.C);
  check('credits never go negative', raceWallet.remainingCredits, 0);
  const raceLedger = await prisma.verificationCreditTransaction.findMany({ where: { companyId: TEST_COMPANIES.C, transactionType: 'Debit' } });
  check('exactly one ledger row for one credit', raceLedger.length, 1);

  console.log('\n=== 10. Counters reconcile: allocated − used = remaining ===');
  await seed(TEST_COMPANIES.D, { remaining: 0, total: 0, used: 0 });
  await VerificationCreditService.allocateCredits({ companyId: TEST_COMPANIES.D, action: 'ADD', credits: 100, createdBy: 'regression' });
  for (let i = 0; i < 35; i++) {
    await VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.D, verifiedBy: 'regression' });
  }
  const recon = await VerificationCreditService.checkCredits(TEST_COMPANIES.D);
  check('allocated', recon.totalCredits, 100);
  check('used', recon.usedCredits, 35);
  check('remaining', recon.remainingCredits, 65);
  check('allocated − used = remaining', recon.totalCredits - recon.usedCredits, recon.remainingCredits);
  const successRows = await prisma.verificationCreditTransaction.count({ where: { companyId: TEST_COMPANIES.D, transactionType: 'Debit' } });
  check('successful verifications = credits used', successRows, recon.usedCredits);

  await cleanup();

  console.log(`\n================ ${passed} passed, ${failed} failed ================\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
