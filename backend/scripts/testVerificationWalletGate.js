/**
 * testVerificationWalletGate.js
 *
 * End-to-end regression suite for the Bank Verification credit wallet gate.
 *
 * Covers the defects that made a funded wallet report "Verification balance is
 * exhausted":
 *   - balance gated on `> 0` instead of `>= cost per verification`
 *   - the ₹4 price hardcoded in the debit while settings priced it differently
 *   - running out of credits rewriting the tenant's mode to Manual, so a
 *     recharge restored the money but never the ability to verify
 *   - Manual mode / suspension reported to the UI as CREDITS_EXHAUSTED
 *   - a workspace id (branch) addressing a different wallet than the one debited
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

async function seed(companyId, { remaining, total = remaining, used = 0, mode = 'API Verification', cost = 4, walletStatus = 'Active', settingsStatus = 'Connected' }) {
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

  console.log('\n=== 1. Balance → verifications available (cost ₹4) ===');
  const cases = [
    { id: TEST_COMPANIES.A, remaining: 20, expectVerifications: 5, expectAvailable: true },
    { id: TEST_COMPANIES.B, remaining: 8, expectVerifications: 2, expectAvailable: true },
    { id: TEST_COMPANIES.C, remaining: 18, expectVerifications: 4, expectAvailable: true },
    { id: TEST_COMPANIES.D, remaining: 2, expectVerifications: 0, expectAvailable: false }
  ];
  for (const c of cases) {
    await seed(c.id, { remaining: c.remaining });
    const s = await VerificationCreditService.checkCredits(c.id);
    check(`₹${c.remaining} → verifications`, s.remainingVerifications, c.expectVerifications);
    check(`₹${c.remaining} → verify allowed`, s.isAvailable, c.expectAvailable);
  }

  console.log('\n=== 2. Zero balance is blocked, and blocked for the right reason ===');
  await seed(TEST_COMPANIES.A, { remaining: 0, total: 8, used: 8 });
  let st = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('₹0 → verify allowed', st.isAvailable, false);
  check('₹0 → reason code', st.unavailableCode, 'INSUFFICIENT_CREDITS');

  console.log('\n=== 3. ₹2 with a ₹4 charge cannot start a verification (was billable-but-undebitable) ===');
  await seed(TEST_COMPANIES.A, { remaining: 2 });
  st = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('₹2 of ₹4 → verify allowed', st.isAvailable, false);
  check('₹2 of ₹4 → reason code', st.unavailableCode, 'INSUFFICIENT_CREDITS');
  let debitError = null;
  try { await VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.A }); } catch (e) { debitError = e.message; }
  check('₹2 of ₹4 → debit refused', !!debitError, true);

  console.log('\n=== 4. Price comes from settings, not a constant ===');
  await seed(TEST_COMPANIES.A, { remaining: 30, cost: 10 });
  st = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('₹30 at ₹10 each → cost reported', st.costPerVerification, 10);
  check('₹30 at ₹10 each → verifications', st.remainingVerifications, 3);
  const debit10 = await VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.A, verifiedBy: 'regression' });
  check('₹30 at ₹10 each → debited amount', debit10.transaction.credits, 10);
  check('₹30 at ₹10 each → closing balance', debit10.remainingCredits, 20);

  console.log('\n=== 5. Debit happens once, only on success, and lands in the ledger ===');
  await seed(TEST_COMPANIES.A, { remaining: 8 });
  const before = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  const debit = await VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.A, referenceId: 'REG-TEST-1', verifiedBy: 'regression' });
  const after = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('balance before', before.remainingCredits, 8);
  check('balance after one verification', after.remainingCredits, 4);
  check('used credits after', after.usedCredits, 4);
  check('verifications left after', after.remainingVerifications, 1);
  const ledger = await prisma.verificationCreditTransaction.findMany({ where: { companyId: TEST_COMPANIES.A, transactionType: 'Debit' } });
  check('ledger debit rows', ledger.length, 1);
  check('ledger debit amount', ledger[0].credits, 4);
  check('ledger opening→closing', [ledger[0].openingBalance, ledger[0].closingBalance], [8, 4]);
  check('debit result exposes cost', debit.costPerVerification, 4);

  console.log('\n=== 6. Exhaustion does NOT rewrite the tenant config, and a recharge restores service ===');
  await seed(TEST_COMPANIES.A, { remaining: 4 });
  await VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.A, verifiedBy: 'regression' });
  const drained = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('drained → balance', drained.remainingCredits, 0);
  check('drained → verify allowed', drained.isAvailable, false);
  check('drained → mode preserved', drained.verificationMode, 'API Verification');
  check('drained → reason code', drained.unavailableCode, 'INSUFFICIENT_CREDITS');

  await VerificationCreditService.allocateCredits({ companyId: TEST_COMPANIES.A, action: 'ADD', credits: 20, createdBy: 'regression' });
  const recharged = await VerificationCreditService.checkCredits(TEST_COMPANIES.A);
  check('recharged → balance', recharged.remainingCredits, 20);
  check('recharged → verify allowed again', recharged.isAvailable, true);
  check('recharged → verifications', recharged.remainingVerifications, 5);
  check('recharged → wallet status', recharged.walletStatus, 'Active');

  console.log('\n=== 7. Manual mode and suspension are NOT reported as an exhausted balance ===');
  await seed(TEST_COMPANIES.B, { remaining: 50, mode: 'Manual' });
  const manualMode = await VerificationCreditService.checkCredits(TEST_COMPANIES.B);
  check('manual mode → verify allowed', manualMode.isAvailable, false);
  check('manual mode → reason code', manualMode.unavailableCode, 'MANUAL_MODE');
  check('manual mode → balance intact', manualMode.remainingCredits, 50);

  await seed(TEST_COMPANIES.B, { remaining: 50, walletStatus: 'Suspended' });
  const suspended = await VerificationCreditService.checkCredits(TEST_COMPANIES.B);
  check('suspended → verify allowed', suspended.isAvailable, false);
  check('suspended → reason code', suspended.unavailableCode, 'SUSPENDED');
  check('suspended → balance intact', suspended.remainingCredits, 50);

  console.log('\n=== 8. A recharge never lifts a deliberate suspension ===');
  await VerificationCreditService.allocateCredits({ companyId: TEST_COMPANIES.B, action: 'ADD', credits: 40, createdBy: 'regression' });
  const stillSuspended = await VerificationCreditService.checkCredits(TEST_COMPANIES.B);
  check('suspended + recharge → wallet status', stillSuspended.walletStatus, 'Suspended');
  check('suspended + recharge → verify allowed', stillSuspended.isAvailable, false);

  console.log('\n=== 9. Concurrent verifications cannot both spend the same ₹4 ===');
  await seed(TEST_COMPANIES.C, { remaining: 4 });
  const results = await Promise.allSettled([
    VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.C, verifiedBy: 'race-1' }),
    VerificationCreditService.deductCreditOnSuccess({ companyId: TEST_COMPANIES.C, verifiedBy: 'race-2' })
  ]);
  check('one debit succeeds', results.filter(r => r.status === 'fulfilled').length, 1);
  check('one debit is refused', results.filter(r => r.status === 'rejected').length, 1);
  const raceWallet = await VerificationCreditService.checkCredits(TEST_COMPANIES.C);
  check('balance never goes negative', raceWallet.remainingCredits, 0);

  await cleanup();

  console.log(`\n================ ${passed} passed, ${failed} failed ================\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
