// QA: payroll wallet gate — service-level case matrix against the LOCAL dev DB.
// Delta-billing model: only employees NEVER billed for the period are charged;
// ₹0 required is a VALID passing state (re-pushes are free). Uses far-future
// periods (year 2099) for charge tests so no real payroll period is touched,
// and removes its own ledger rows/transactions + restores the balance after.
//   node scripts/testPayrollWalletGate.js
const prisma = require('../src/config/prisma');
const { assessPayrollWallet, chargePayrollWallet } = require('../src/services/payrollWalletGuard');
const { isFuturePeriod } = require('../src/utils/payrollPeriod');

const COMPANY_ID = 1;
const BRANCH_ID = 3; // Ahmedabad — a Branch-table id (the live-bug trigger)
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
  const rate = base.costPerEmployee;
  const wid = base.walletCompanyId;
  const originalBalance = (await prisma.wallet.findUnique({ where: { companyId: wid } }))?.balance ?? 0;
  console.log(`Company ${COMPANY_ID} → wallet company ${wid}; activeEmployees=${base.estimate.activeEmployees}, costPerEmployee=₹${rate}`);
  check('pricing fix: per-employee rate is > 0 (no shadow Free tier)', rate > 0, `(got ${rate})`);

  // Real employees for the cases: 3 active employees + the July-2026 billed set.
  const actives = await prisma.employee.findMany({
    where: { companyId: COMPANY_ID, status: 'Active' }, select: { id: true }, take: 3, orderBy: { id: 'asc' },
  });
  const [empA, empB, empC] = actives.map((e) => e.id);
  const julyBilled = (await prisma.payroll.findMany({
    where: { month: 'July', year: 2026, companyId: COMPANY_ID }, select: { employeeId: true }, take: 5,
  })).map((r) => r.employeeId);

  const txCount = (ref) => prisma.walletTransaction.count({ where: { type: 'Payroll', referenceNumber: ref, wallet: { companyId: wid } } });
  const ledgerCount = (month) => prisma.payrollEmployeeBilling.count({ where: { companyId: wid, month, year: YEAR } });

  // T0 — the live bug: a BRANCH workspace id must resolve to the parent wallet.
  console.log('\nT0: branch workspace id resolves to the parent company wallet');
  const viaBranch = await assessPayrollWallet(BRANCH_ID, 'July', 2026, { employeeIds: julyBilled });
  check('branch id 3 → wallet company 1 (no "Company 3 not found")', viaBranch.walletCompanyId === wid);

  // T1/T2 — TEST 1+2: every target already has payroll for the period → ₹0
  // required, ALLOWED even on a ₹0 wallet, and charge() deducts nothing.
  console.log('\nT1: all employees already have July 2026 payroll, wallet ₹0');
  await setBalance(wid, 0);
  let a = await assessPayrollWallet(COMPANY_ID, 'July', 2026, { employeeIds: julyBilled });
  check('requiredNow is ₹0', a.requiredNow === 0, `(got ${a.requiredNow})`);
  check('gate PASSES on ₹0 wallet (zero billable is valid)', a.ok === true);
  check(`all ${julyBilled.length} targets counted as already billed`, a.alreadyBilled === julyBilled.length && a.newEmployees === 0);
  let r = await chargePayrollWallet({ companyId: COMPANY_ID, month: 'July', year: 2026, employeeIds: julyBilled, createdBy: 'QA' });
  check('charge() is a no-op (charged=false, ₹0)', r.charged === false && (r.amount || 0) === 0);
  check('balance untouched', (await prisma.wallet.findUnique({ where: { companyId: wid } })).balance === 0);

  // T3 — TEST 3: one genuinely NEW employee → exactly one employee's fee.
  console.log('\nT3: one new employee, exact balance');
  await setBalance(wid, rate);
  a = await assessPayrollWallet(COMPANY_ID, 'January', YEAR, { employeeIds: [empA] });
  check('assessment: 1 new employee, required = 1 × rate', a.newEmployees === 1 && a.requiredNow === rate);
  r = await chargePayrollWallet({ companyId: COMPANY_ID, month: 'January', year: YEAR, employeeIds: [empA], createdBy: 'QA' });
  check('charged exactly one employee fee', r.charged === true && r.billedEmployees === 1 && r.amount === rate);
  check('balance is now ₹0', r.balanceAfter === 0, `(got ${r.balanceAfter})`);
  check('one ledger row recorded', (await ledgerCount('January')) === 1);

  // T4 — TEST 4: new employee + insufficient wallet → blocked, nothing written.
  console.log('\nT4: one new employee, wallet ₹0');
  let threw = null;
  try { await chargePayrollWallet({ companyId: COMPANY_ID, month: 'January', year: YEAR, employeeIds: [empB], createdBy: 'QA' }); } catch (e) { threw = e; }
  check('blocked with INSUFFICIENT_WALLET_BALANCE', threw?.code === 'INSUFFICIENT_WALLET_BALANCE');
  check('payload says 1 new employee, shortfall = rate', threw?.assessment?.newEmployees === 1 && threw?.assessment?.shortfall === rate);
  check('no ledger row leaked for the blocked employee', (await ledgerCount('January')) === 1);

  // T5 — TEST 5: repeat push of the billed employee → ₹0, no second charge.
  console.log('\nT5: repeat push of an already-billed employee');
  r = await chargePayrollWallet({ companyId: COMPANY_ID, month: 'January', year: YEAR, employeeIds: [empA], createdBy: 'QA' });
  check('repeat is free (charged=false)', r.charged === false && r.assessment.alreadyBilled === 1);
  check('still exactly one transaction', (await txCount(`PRB-January-${YEAR}-C${wid}`)) === 1);

  // T6 — mixed batch: billed + new → bills ONLY the new one.
  console.log('\nT6: mixed batch (1 billed + 1 new)');
  await setBalance(wid, rate);
  r = await chargePayrollWallet({ companyId: COMPANY_ID, month: 'January', year: YEAR, employeeIds: [empA, empB], createdBy: 'QA' });
  check('bills only the new employee', r.charged === true && r.billedEmployees === 1 && r.amount === rate);
  check('two ledger rows total for January', (await ledgerCount('January')) === 2);

  // T7 — TEST 10: double-click race on the SAME new employee → one charge.
  console.log('\nT7: concurrent charges for the same new employee');
  await setBalance(wid, rate * 5);
  const [x1, x2] = await Promise.allSettled([
    chargePayrollWallet({ companyId: COMPANY_ID, month: 'February', year: YEAR, employeeIds: [empC], createdBy: 'QA-A' }),
    chargePayrollWallet({ companyId: COMPANY_ID, month: 'February', year: YEAR, employeeIds: [empC], createdBy: 'QA-B' }),
  ]);
  const chargedCount = [x1, x2].filter((x) => x.status === 'fulfilled' && x.value.charged).length;
  check('exactly one concurrent call charged', chargedCount === 1, `(charged=${chargedCount}, s1=${x1.status}, s2=${x2.status})`);
  check('exactly one ledger row for the employee', (await ledgerCount('February')) === 1);
  const balAfterRace = (await prisma.wallet.findUnique({ where: { companyId: wid } })).balance;
  check('exactly one fee deducted, never negative', balAfterRace === rate * 4, `(got ${balAfterRace})`);

  // T8 — TEST 8: technical failure is DISTINCT from insufficiency.
  console.log('\nT8: unknown workspace id → WALLET_CHECK_FAILED, not "insufficient"');
  threw = null;
  try { await assessPayrollWallet(999999999, 'January', YEAR); } catch (e) { threw = e; }
  check('throws WALLET_CHECK_FAILED', threw?.code === 'WALLET_CHECK_FAILED', `(got ${threw?.code})`);

  // T9 — legacy one-lump periods stay covered (no re-billing after migration).
  console.log('\nT9: legacy lump-charged period is grandfathered');
  const legacyRef = `PR-June-${YEAR}-C${wid}`;
  const legacyTx = await prisma.walletTransaction.create({
    data: { walletId: base.walletId, type: 'Payroll', amount: -1, balanceBefore: 1, balanceAfter: 0, referenceNumber: legacyRef, createdBy: 'QA-LEGACY' },
  });
  a = await assessPayrollWallet(COMPANY_ID, 'June', YEAR, { employeeIds: [empB] });
  check('legacy-charged period requires ₹0 for everyone', a.requiredNow === 0 && a.ok === true && a.alreadyCharged === true);
  await prisma.walletTransaction.delete({ where: { id: legacyTx.id } });

  // T10 — TEST 9/7: the future-month rule is untouched (controller-enforced).
  console.log('\nT10: period rules (today is treated as the server clock)');
  const now = new Date();
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const curMonth = MONTHS[now.getMonth()];
  const nextMonth = MONTHS[(now.getMonth() + 1) % 12];
  const nextYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  check('current month is allowed', isFuturePeriod(curMonth, now.getFullYear()) === false);
  check('past month (July 2026) is allowed / editable', isFuturePeriod('July', 2026) === false);
  check('next month is blocked', isFuturePeriod(nextMonth, nextYear) === true);

  // Cleanup: QA ledger rows, QA transactions, restore balance.
  const delLedger = await prisma.payrollEmployeeBilling.deleteMany({ where: { companyId: wid, year: YEAR } });
  const delTx = await prisma.walletTransaction.deleteMany({
    where: { type: 'Payroll', referenceNumber: { endsWith: `-${YEAR}-C${wid}` }, wallet: { companyId: wid } },
  });
  await setBalance(wid, originalBalance);
  console.log(`\nCleanup: removed ${delLedger.count} ledger row(s) + ${delTx.count} transaction(s), balance restored to ₹${originalBalance}.`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
