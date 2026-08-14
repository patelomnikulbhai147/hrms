// QA: payroll wallet gate — service-level case matrix against the LOCAL dev DB.
// Uses far-future periods (year 2099) so no real payroll period is touched, and
// restores the wallet balance + removes its own transactions afterwards.
//   node scripts/testPayrollWalletGate.js
const prisma = require('../src/config/prisma');
const { assessPayrollWallet, chargePayrollWallet } = require('../src/services/payrollWalletGuard');

const COMPANY_ID = 1;
const YEAR = 2099;

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

async function setBalance(walletCompanyId, balance) {
  await prisma.wallet.upsert({
    where: { companyId: walletCompanyId },
    update: { balance },
    create: { companyId: walletCompanyId, balance, status: 'Active' },
  });
}

(async () => {
  // Pricing must be the corrected matrix (no shadow Free row).
  await prisma.pricingMaster.deleteMany({ where: { tierName: 'Free' } });
  for (const tier of [
    { tierName: '0-100', minEmployees: 0, maxEmployees: 100, quarterlyPrice: 25, yearlyPrice: 20 },
    { tierName: '100-500', minEmployees: 101, maxEmployees: 500, quarterlyPrice: 20, yearlyPrice: 16 },
    { tierName: '500+', minEmployees: 501, maxEmployees: null, quarterlyPrice: 15, yearlyPrice: 12 },
  ]) {
    await prisma.pricingMaster.upsert({ where: { tierName: tier.tierName }, update: tier, create: tier });
  }

  const base = await assessPayrollWallet(COMPANY_ID, 'January', YEAR);
  const required = base.required;
  const wid = base.walletCompanyId;
  const originalBalance = (await prisma.wallet.findUnique({ where: { companyId: wid } }))?.balance ?? 0;
  console.log(`Company ${COMPANY_ID} → wallet company ${wid}; activeEmployees=${base.estimate.activeEmployees}, costPerEmployee=${base.estimate.costPerEmployee}, required=₹${required}`);
  check('pricing fix: required amount is > 0 (no shadow Free tier)', required > 0, `(got ${required})`);

  const txWhere = (ref) => ({ type: 'Payroll', referenceNumber: ref, wallet: { companyId: wid } });
  const txCount = (ref) => prisma.walletTransaction.count({ where: txWhere(ref) });

  // CASE 1 — balance 0 → blocked, no transaction
  console.log('\nCASE 1: balance ₹0');
  await setBalance(wid, 0);
  let a = await assessPayrollWallet(COMPANY_ID, 'January', YEAR);
  check('assessment says blocked', a.ok === false && a.shortfall === required);
  let threw = null;
  try { await chargePayrollWallet({ companyId: COMPANY_ID, month: 'January', year: YEAR, createdBy: 'QA' }); } catch (e) { threw = e; }
  check('charge throws INSUFFICIENT_WALLET_BALANCE', threw?.code === 'INSUFFICIENT_WALLET_BALANCE');
  check('error carries assessment payload', threw?.assessment?.balance === 0 && threw?.assessment?.requiredNow === required);
  check('no wallet transaction created', (await txCount(a.reference)) === 0);

  // CASE 2 — balance < required → blocked
  console.log('\nCASE 2: balance = required - 1');
  await setBalance(wid, required - 1);
  threw = null;
  try { await chargePayrollWallet({ companyId: COMPANY_ID, month: 'January', year: YEAR, createdBy: 'QA' }); } catch (e) { threw = e; }
  check('charge blocked', threw?.code === 'INSUFFICIENT_WALLET_BALANCE');
  check('shortfall = 1', threw?.assessment?.shortfall === 1, `(got ${threw?.assessment?.shortfall})`);

  // CASE 3 — balance == required → succeeds exactly once
  console.log('\nCASE 3: balance = required (exact)');
  await setBalance(wid, required);
  let r = await chargePayrollWallet({ companyId: COMPANY_ID, month: 'January', year: YEAR, createdBy: 'QA' });
  check('charge succeeds', r.charged === true);
  check('balance is now 0', r.balanceAfter === 0, `(got ${r.balanceAfter})`);
  check('exactly one transaction', (await txCount(r.assessment.reference)) === 1);
  const again = await chargePayrollWallet({ companyId: COMPANY_ID, month: 'January', year: YEAR, createdBy: 'QA' });
  check('regenerate same period: NOT charged again', again.charged === false && again.assessment.alreadyCharged === true);
  check('still exactly one transaction', (await txCount(r.assessment.reference)) === 1);

  // CASE 4 — balance > required → succeeds, remainder kept
  console.log('\nCASE 4: balance = required + 500');
  await setBalance(wid, required + 500);
  r = await chargePayrollWallet({ companyId: COMPANY_ID, month: 'February', year: YEAR, createdBy: 'QA' });
  check('charge succeeds', r.charged === true);
  check('remainder is ₹500', r.balanceAfter === 500, `(got ${r.balanceAfter})`);

  // CASE 5a — RACE, same period: two concurrent charges → exactly one tx
  console.log('\nCASE 5a: concurrent same-period charges');
  await setBalance(wid, required * 3);
  const [x1, x2] = await Promise.allSettled([
    chargePayrollWallet({ companyId: COMPANY_ID, month: 'March', year: YEAR, createdBy: 'QA-A' }),
    chargePayrollWallet({ companyId: COMPANY_ID, month: 'March', year: YEAR, createdBy: 'QA-B' }),
  ]);
  const chargedCount = [x1, x2].filter(x => x.status === 'fulfilled' && x.value.charged).length;
  const marchRef = `PR-March-${YEAR}-C${wid}`;
  check('exactly one concurrent call charged', chargedCount === 1, `(charged=${chargedCount}, s1=${x1.status}, s2=${x2.status})`);
  check('exactly one transaction for the period', (await txCount(marchRef)) === 1);

  // CASE 5b — RACE, two periods, balance covers only one → one wins, one 402s
  console.log('\nCASE 5b: concurrent different-period charges, funds for ONE');
  await setBalance(wid, required);
  const [y1, y2] = await Promise.allSettled([
    chargePayrollWallet({ companyId: COMPANY_ID, month: 'April', year: YEAR, createdBy: 'QA-A' }),
    chargePayrollWallet({ companyId: COMPANY_ID, month: 'May', year: YEAR, createdBy: 'QA-B' }),
  ]);
  const wins = [y1, y2].filter(x => x.status === 'fulfilled' && x.value.charged).length;
  const insuff = [y1, y2].filter(x => x.status === 'rejected' && x.reason?.code === 'INSUFFICIENT_WALLET_BALANCE').length;
  const endBal = (await prisma.wallet.findUnique({ where: { companyId: wid } })).balance;
  check('exactly one period charged', wins === 1, `(wins=${wins})`);
  check('the other was rejected as insufficient', insuff === 1, `(insufficient=${insuff})`);
  check('balance never went negative', endBal === 0, `(got ${endBal})`);

  // Cleanup: remove QA transactions + restore original balance
  const del = await prisma.walletTransaction.deleteMany({
    where: { type: 'Payroll', referenceNumber: { endsWith: `-${YEAR}-C${wid}` }, wallet: { companyId: wid } },
  });
  await setBalance(wid, originalBalance);
  console.log(`\nCleanup: removed ${del.count} QA transaction(s), balance restored to ₹${originalBalance}.`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
