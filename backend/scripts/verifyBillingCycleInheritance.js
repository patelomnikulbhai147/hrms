/**
 * Billing Cycle Inheritance — verification suite.
 *
 * Proves the rule end to end: the billing cycle is chosen ONCE at onboarding,
 * stored on CompanySubscription, and every later employee-slot purchase reads it
 * from there — server-side, never from the client, and re-read live so a
 * subscription change immediately re-prices future purchases.
 *
 * Self-contained: scratch companies in the 9999xx range, cleaned up on the way
 * in and on the way out. Touches no real tenant. No gateway calls.
 *
 *   node backend/scripts/verifyBillingCycleInheritance.js
 */
const prisma = require('../src/config/prisma');
const {
  BILLING_CYCLES, DEFAULT_BILLING_CYCLE, isBillingCycle, normalizeBillingCycle,
} = require('../src/utils/billingCycle');
const slotService = require('../src/services/employeeSlotService');
const slotController = require('../src/controllers/employeeSlotController');
const { provisionFreeCompany } = require('../src/services/companyProvisioning');
const companyController = require('../src/controllers/companyController');
const subscriptionController = require('../src/controllers/subscriptionController');

// Scratch tenants are identified by NAME, not by a pinned id: provisioning
// allocates its own id and rewriting it afterwards would fight the ON UPDATE
// CASCADE foreign keys. Ids are captured from the create calls instead.
const SCRATCH_NAMES = ['QA Yearly Co', 'QA Quarterly Co', 'QA Admin-Created Co'];
const SCRATCH_EMAIL = '@qa-billingcycle.local';

let YEARLY_CO, QUARTERLY_CO, ADMIN_CO;

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${label}${detail ? `  (${detail})` : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? `  (${detail})` : ''}`); }
};

// ── Minimal Express doubles so the real HTTP handlers can be exercised ────────
const mkRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const mkReq = (over = {}) => ({ body: {}, query: {}, params: {}, headers: {}, user: null, ...over });
const headReq = (companyId, body = {}) => mkReq({
  user: { id: 999999, role: 'Company Head', companyId, name: 'QA Head' },
  body,
});

// ── Cleanup ──────────────────────────────────────────────────────────────────
// Removes only rows this script created (scratch company names + a dedicated
// email domain). Order matters: auditlog.userId is RESTRICT, so audit rows must
// go before the users they are attributed to.
async function wipe() {
  const companies = await prisma.company.findMany({
    where: { name: { in: SCRATCH_NAMES } }, select: { id: true },
  }).catch(() => []);
  const ids = companies.map((c) => c.id);
  const users = await prisma.user.findMany({
    where: { OR: [{ companyId: { in: ids } }, { email: { contains: SCRATCH_EMAIL } }] },
    select: { id: true },
  }).catch(() => []);
  const userIds = users.map((u) => u.id);

  if (userIds.length) await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  if (ids.length) {
    await prisma.employeeSlotTransaction.deleteMany({ where: { companyId: { in: ids } } }).catch(() => {});
    await prisma.subscriptionHistory.deleteMany({ where: { companyId: { in: ids } } }).catch(() => {});
    await prisma.companySubscription.deleteMany({ where: { companyId: { in: ids } } }).catch(() => {});
  }
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  if (ids.length) {
    await prisma.employee.deleteMany({ where: { companyId: { in: ids } } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { companyId: { in: ids } } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  }
}

async function main() {
  console.log('Billing Cycle Inheritance verification (scratch tenants)\n');
  await wipe();

  // ── §1 The normalizer is the single vocabulary ─────────────────────────────
  console.log('§1 Cycle vocabulary (utils/billingCycle)');
  check('canonical values are exactly Quarterly + Yearly', JSON.stringify(BILLING_CYCLES) === '["Quarterly","Yearly"]');
  check('default is Quarterly', DEFAULT_BILLING_CYCLE === 'Quarterly');
  check("isBillingCycle('Yearly')", isBillingCycle('Yearly') === true);
  check("isBillingCycle('Monthly') is false", isBillingCycle('Monthly') === false);
  check("normalize('Yearly') -> Yearly", normalizeBillingCycle('Yearly') === 'Yearly');
  check("normalize('yearly') -> Yearly", normalizeBillingCycle('yearly') === 'Yearly');
  check("normalize('ANNUAL') -> Yearly", normalizeBillingCycle('ANNUAL') === 'Yearly');
  check("normalize('quarter') -> Quarterly", normalizeBillingCycle('quarter') === 'Quarterly');
  check("legacy 'Monthly' -> Quarterly (never stored as-is)", normalizeBillingCycle('Monthly') === 'Quarterly');
  check('null/undefined/blank -> Quarterly',
    normalizeBillingCycle(null) === 'Quarterly' &&
    normalizeBillingCycle(undefined) === 'Quarterly' &&
    normalizeBillingCycle('   ') === 'Quarterly');
  check('junk object -> Quarterly', normalizeBillingCycle({ a: 1 }) === 'Quarterly');
  check('explicit fallback is honoured', normalizeBillingCycle('nonsense', 'Yearly') === 'Yearly');
  check('a BAD fallback cannot leak either', normalizeBillingCycle('nonsense', 'Monthly') === 'Quarterly');

  // ── §2 Onboarding stores the chosen cycle ──────────────────────────────────
  console.log('\n§2 Onboarding writes the cycle to the subscription record');

  const y = await provisionFreeCompany({
    company: { name: 'QA Yearly Co', email: `yearly${SCRATCH_EMAIL}`, state: 'Gujarat', city: 'Rajkot', country: 'India' },
    head: { name: 'QA Yearly Head', email: `yhead${SCRATCH_EMAIL}`, mobile: '9000000001', passwordHash: '$2a$10$abcdefghijklmnopqrstuv' },
    branch: { branchName: 'Head Office', address: 'QA' },
    billingCycle: 'Yearly',
  });
  YEARLY_CO = y.company.id;

  const q = await provisionFreeCompany({
    company: { name: 'QA Quarterly Co', email: `quarterly${SCRATCH_EMAIL}`, state: 'Gujarat', city: 'Rajkot', country: 'India' },
    head: { name: 'QA Quarterly Head', email: `qhead${SCRATCH_EMAIL}`, mobile: '9000000002', passwordHash: '$2a$10$abcdefghijklmnopqrstuv' },
    branch: { branchName: 'Head Office', address: 'QA' },
    billingCycle: 'quarterly',
  });
  QUARTERLY_CO = q.company.id;

  const ySub = await prisma.companySubscription.findUnique({ where: { companyId: YEARLY_CO } });
  const qSub = await prisma.companySubscription.findUnique({ where: { companyId: QUARTERLY_CO } });
  const yCo = await prisma.company.findUnique({ where: { id: YEARLY_CO } });
  const qCo = await prisma.company.findUnique({ where: { id: QUARTERLY_CO } });

  check('self-registration (Yearly) -> subscription.billingCycle = Yearly', ySub?.billingCycle === 'Yearly', ySub?.billingCycle);
  check('self-registration (Yearly) -> company mirror = Yearly', yCo?.billingCycle === 'Yearly', yCo?.billingCycle);
  check("self-registration ('quarterly') normalises to Quarterly", qSub?.billingCycle === 'Quarterly', qSub?.billingCycle);
  check('company mirror and subscription agree', yCo.billingCycle === ySub.billingCycle && qCo.billingCycle === qSub.billingCycle);

  // Super Admin "Add Company" path.
  const adminRes = mkRes();
  await companyController.createCompany(mkReq({
    user: { id: 1, role: 'Super Admin', name: 'QA SA' },
    body: {
      name: 'QA Admin-Created Co', plan: 'Starter', billingCycle: 'Yearly',
      adminName: 'QA Admin Head', adminEmail: `ahead${SCRATCH_EMAIL}`, isHeadOffice: true,
    },
  }), adminRes);
  ADMIN_CO = adminRes.body?.id;
  check('Super Admin Add Company succeeded', !!ADMIN_CO, adminRes.body?.error || `id ${ADMIN_CO}`);
  const aSub = await prisma.companySubscription.findUnique({ where: { companyId: ADMIN_CO } });
  const aCo = await prisma.company.findUnique({ where: { id: ADMIN_CO } });
  check('Super Admin Add Company (Yearly) -> subscription = Yearly', aSub?.billingCycle === 'Yearly', aSub?.billingCycle);
  check('Super Admin Add Company -> company mirror = Yearly', aCo?.billingCycle === 'Yearly', aCo?.billingCycle);

  // ── §3 Slot purchases INHERIT the cycle (same slots, different price) ──────
  console.log('\n§3 Slot purchase inherits the cycle from the subscription');
  const SLOTS = 25;
  const yQuote = await slotService.quoteSlots(YEARLY_CO, SLOTS);
  const qQuote = await slotService.quoteSlots(QUARTERLY_CO, SLOTS);

  check('yearly tenant quote succeeds', yQuote.ok === true, yQuote.error || '');
  check('quarterly tenant quote succeeds', qQuote.ok === true, qQuote.error || '');
  check('quote echoes the inherited cycle (Yearly)', yQuote.subscription?.billingCycle === 'Yearly', yQuote.subscription?.billingCycle);
  check('quote marks the cycle as inherited', yQuote.subscription?.inherited === true);
  check('quote echoes the inherited cycle (Quarterly)', qQuote.subscription?.billingCycle === 'Quarterly', qQuote.subscription?.billingCycle);
  check('tier cycle label follows the subscription', yQuote.tier?.cycle === 'Yearly' && qQuote.tier?.cycle === 'Quarterly',
    `${yQuote.tier?.cycle} / ${qQuote.tier?.cycle}`);
  check('identical slot count is priced DIFFERENTLY per cycle', yQuote.tier.rate !== qQuote.tier.rate,
    `yearly ₹${yQuote.tier.rate} vs quarterly ₹${qQuote.tier.rate}`);
  check('yearly rate is the cheaper of the two', yQuote.tier.rate < qQuote.tier.rate);
  check('totals differ accordingly', yQuote.grandTotal !== qQuote.grandTotal,
    `₹${yQuote.grandTotal} vs ₹${qQuote.grandTotal}`);
  check('subtotal = slots × inherited rate (yearly)', yQuote.subtotal === SLOTS * yQuote.tier.rate,
    `${SLOTS} × ${yQuote.tier.rate} = ${yQuote.subtotal}`);
  check('subtotal = slots × inherited rate (quarterly)', qQuote.subtotal === SLOTS * qQuote.tier.rate,
    `${SLOTS} × ${qQuote.tier.rate} = ${qQuote.subtotal}`);

  // ── §4 The client cannot choose the cycle ─────────────────────────────────
  console.log('\n§4 The cycle is never a client input');
  const inj = mkRes();
  await slotController.quote(headReq(QUARTERLY_CO, { slots: SLOTS, billingCycle: 'Yearly', cycle: 'yearly' }), inj);
  check('POST /quote with billingCycle=Yearly on a QUARTERLY tenant is ignored',
    inj.statusCode === 200 && inj.body?.subscription?.billingCycle === 'Quarterly',
    `status ${inj.statusCode}, cycle ${inj.body?.subscription?.billingCycle}`);
  check('injected cycle did not change the price',
    inj.body?.tier?.rate === qQuote.tier.rate && inj.body?.grandTotal === qQuote.grandTotal,
    `₹${inj.body?.grandTotal}`);

  const inj2 = mkRes();
  await slotController.getOverview(headReq(YEARLY_CO, { billingCycle: 'Quarterly' }), inj2);
  check('GET /overview with an injected cycle still reports the subscription cycle',
    inj2.body?.billingCycle === 'Yearly' && inj2.body?.subscription?.billingCycle === 'Yearly',
    inj2.body?.billingCycle);

  // Static guarantee: no slot code path reads a cycle off the request.
  const fs = require('fs');
  const slotSources = [
    'src/controllers/employeeSlotController.js',
    'src/services/employeeSlotService.js',
  ].map((f) => fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8')).join('\n');
  const readsCycleFromReq = /req\.(body|query|params|headers)[^\n]{0,60}(billingCycle|cycle)/i.test(slotSources);
  check('no slot handler reads a cycle from the request', readsCycleFromReq === false);

  // ── §5 Changing the subscription re-prices FUTURE purchases ───────────────
  console.log('\n§5 A subscription cycle change flows through automatically');
  const changeRes = mkRes();
  await subscriptionController.update(mkReq({
    user: { id: 1, role: 'Super Admin', name: 'QA SA' },
    params: { companyId: String(QUARTERLY_CO) },
    body: { billingCycle: 'Yearly', reason: 'QA cycle switch' },
  }), changeRes);
  check('subscription update accepted', changeRes.statusCode === 200, changeRes.body?.error || '');
  const qSub2 = await prisma.companySubscription.findUnique({ where: { companyId: QUARTERLY_CO } });
  const qCo2 = await prisma.company.findUnique({ where: { id: QUARTERLY_CO } });
  check('subscription now Yearly', qSub2.billingCycle === 'Yearly', qSub2.billingCycle);
  check('company mirror followed the change', qCo2.billingCycle === 'Yearly', qCo2.billingCycle);

  const qQuote2 = await slotService.quoteSlots(QUARTERLY_CO, SLOTS);
  check('the SAME purchase now quotes on the new cycle — no code change',
    qQuote2.subscription.billingCycle === 'Yearly' && qQuote2.tier.rate === yQuote.tier.rate,
    `₹${qQuote.tier.rate} -> ₹${qQuote2.tier.rate}`);
  check('history recorded the cycle change',
    (await prisma.subscriptionHistory.count({ where: { companyId: QUARTERLY_CO, newCycle: 'Yearly' } })) > 0);

  // Reverse it — the flow must work both ways.
  const backRes = mkRes();
  await subscriptionController.update(mkReq({
    user: { id: 1, role: 'Super Admin', name: 'QA SA' },
    params: { companyId: String(QUARTERLY_CO) },
    body: { billingCycle: 'Quarterly', reason: 'QA cycle switch back' },
  }), backRes);
  const qQuote3 = await slotService.quoteSlots(QUARTERLY_CO, SLOTS);
  check('Yearly -> Quarterly flows through too',
    qQuote3.subscription.billingCycle === 'Quarterly' && qQuote3.tier.rate === qQuote.tier.rate,
    `₹${qQuote3.tier.rate}`);

  const badCycle = mkRes();
  await subscriptionController.update(mkReq({
    user: { id: 1, role: 'Super Admin', name: 'QA SA' },
    params: { companyId: String(QUARTERLY_CO) },
    body: { billingCycle: 'Monthly' },
  }), badCycle);
  const qSub4 = await prisma.companySubscription.findUnique({ where: { companyId: QUARTERLY_CO } });
  check("an invalid cycle ('Monthly') is not stored", qSub4.billingCycle === 'Quarterly', qSub4.billingCycle);

  // ── §6 A missing subscription row is reseeded from the company mirror ─────
  console.log('\n§6 A lost subscription row does not lose the cycle');
  await prisma.companySubscription.delete({ where: { companyId: YEARLY_CO } });
  const orphanQuote = await slotService.quoteSlots(YEARLY_CO, SLOTS);
  check('quote with NO subscription row still uses the tenant\'s Yearly cycle',
    orphanQuote.subscription.billingCycle === 'Yearly' && orphanQuote.tier.rate === yQuote.tier.rate,
    orphanQuote.subscription.billingCycle);

  const reseed = mkRes();
  await subscriptionController.getOne(mkReq({
    user: { id: 1, role: 'Super Admin', name: 'QA SA' },
    params: { companyId: String(YEARLY_CO) },
  }), reseed);
  const ySub2 = await prisma.companySubscription.findUnique({ where: { companyId: YEARLY_CO } });
  check('the lazily recreated subscription row is Yearly, not the schema default',
    ySub2?.billingCycle === 'Yearly', ySub2?.billingCycle);

  // ── §7 The company profile route cannot change the cycle ──────────────────
  console.log('\n§7 The cycle is not editable through the company profile');
  const upd = mkRes();
  await companyController.updateCompany(mkReq({
    user: { id: 1, role: 'Super Admin', name: 'QA SA' },
    params: { id: String(YEARLY_CO) },
    body: { billingCycle: 'Quarterly', tagline: 'QA touch' },
  }), upd);
  const yCo3 = await prisma.company.findUnique({ where: { id: YEARLY_CO } });
  check('other fields still update', yCo3.tagline === 'QA touch');
  check('billingCycle is ignored by updateCompany', yCo3.billingCycle === 'Yearly', yCo3.billingCycle);

  const updOnly = mkRes();
  await companyController.updateCompany(mkReq({
    user: { id: 1, role: 'Super Admin', name: 'QA SA' },
    params: { id: String(YEARLY_CO) },
    body: { billingCycle: 'Quarterly' },
  }), updOnly);
  check('a cycle-only company update is refused with a clear reason',
    updOnly.statusCode === 400 && updOnly.body?.code === 'BILLING_CYCLE_READONLY',
    `${updOnly.statusCode} ${updOnly.body?.code}`);

  // ── §8 Nothing else about pricing moved ──────────────────────────────────
  console.log('\n§8 Pricing, GST and settlement logic unchanged');
  check('GST split still present on the quote', yQuote.gst && typeof yQuote.gst.total === 'number');
  check('grandTotal = subtotal + GST', Math.abs(yQuote.grandTotal - (yQuote.subtotal + yQuote.gst.total)) < 0.01,
    `${yQuote.subtotal} + ${yQuote.gst.total} = ${yQuote.grandTotal}`);
  check('slot multiples rule still enforced', (await slotService.quoteSlots(QUARTERLY_CO, 7)).ok === false);
  check('minimum slots rule still enforced', (await slotService.quoteSlots(QUARTERLY_CO, 0)).ok === false);

  console.log(`\n${'─'.repeat(60)}\n${pass} passed, ${fail} failed\n`);
  await wipe();
  return fail;
}

main()
  .catch(async (e) => { console.error('\nFATAL:', e); await wipe().catch(() => {}); fail = fail || 1; })
  .finally(async () => { await prisma.$disconnect(); process.exit(fail ? 1 : 0); });
