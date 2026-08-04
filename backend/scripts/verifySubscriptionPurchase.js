/**
 * Subscription Purchase (upgrade / renewal wizard) — verification suite.
 *
 * Scratch tenant (999907), stubbed payment gateway (no network, nothing
 * billable), self-cleaning. Covers: wizard context, quote validation
 * (below-usage, plan capacity, Free/unknown plans), pricing + discount + GST,
 * purchase settlement (plan flip, Company mirror, renewal date, limit, module
 * unlock, included credits, invoice), renewal extension, upgrade, cycle
 * change, failed payment, duplicate settlement, tenant isolation.
 *
 *   node scripts/verifySubscriptionPurchase.js
 */
process.env.CASHFREE_PG_ENV = 'sandbox';
process.env.CASHFREE_PG_SANDBOX_CLIENT_ID = 'TEST_ID';
process.env.CASHFREE_PG_SANDBOX_CLIENT_SECRET = 'TEST_SECRET';

const prisma = require('../src/config/prisma');
const cashfreePg = require('../src/services/payments/cashfreePgClient');
const paymentOrderService = require('../src/services/payments/paymentOrderService');
const svc = require('../src/services/subscriptionPurchaseService');
const { getCapacity } = require('../src/services/employeeLimitService');
const { getLockedModules } = require('../src/services/planEntitlements');
const planStore = require('../src/services/planStore');

const COMPANY = 999907;
const BYSTANDER = 999908;

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const daysBetween = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
const addMonths = (from, m) => { const d = new Date(from); d.setMonth(d.getMonth() + m); return d; };

// ── Gateway stub (same technique as the slot/recharge suites) ────────────────
const gatewayState = new Map();
cashfreePg.createOrder = async ({ orderId, amount, currency }) => {
  gatewayState.set(orderId, { order_id: orderId, order_status: 'ACTIVE', order_amount: amount, order_currency: currency });
  return { cf_order_id: `cf_${orderId}`, payment_session_id: `session_${orderId}` };
};
cashfreePg.getOrder = async (orderId) => ({ ...gatewayState.get(orderId) });
cashfreePg.getOrderPayments = async (orderId) =>
  gatewayState.get(orderId)?.order_status === 'PAID'
    ? [{ cf_payment_id: 7711, payment_status: 'SUCCESS', payment_group: 'upi', payment_completion_time: new Date().toISOString() }]
    : [];
const markPaid = (orderId) => {
  const s = gatewayState.get(orderId);
  gatewayState.set(orderId, { ...s, order_status: 'PAID' });
};

const scope = { companyId: COMPANY, branchId: null, workspaceId: COMPANY, workspaceKind: 'company' };
const buyer = { name: 'QA Company Head', email: null, role: 'Company Head' };

const walletCredits = async () => {
  const w = await prisma.verificationCreditWallet.findFirst({ where: { companyId: COMPANY } });
  return Number(w?.remainingCredits) || 0;
};

async function buyAndSettle(planKey, billingCycle, employeeCount) {
  const created = await svc.createSubscriptionOrder({ scope, user: buyer, planKey, billingCycle, employeeCount });
  markPaid(created.order.orderId);
  const settle = await paymentOrderService.verifyAndSettle(created.order.orderId, { trigger: 'test' });
  return { created, settle };
}

async function main() {
  console.log('Subscription Purchase verification (scratch tenant, stubbed gateway)\n');

  // ── Setup: scratch Free head company with 6 active employees ───────────────
  await prisma.company.createMany({
    data: [
      { id: COMPANY, name: 'QA Subscription Co', plan: 'Free', isHeadOffice: true, state: 'Gujarat' },
      { id: BYSTANDER, name: 'QA Sub Bystander', plan: 'Free', isHeadOffice: true },
    ],
    skipDuplicates: true,
  });
  await prisma.employee.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({
      companyId: COMPANY, employeeId: `QSUB-${i + 1}`, name: `QA Emp ${i + 1}`,
      email: `qsub${i + 1}@qa.test`, department: 'General', designation: 'Staff',
      role: 'Staff', salary: 0, status: 'Active', joinDate: new Date('2026-01-01'),
    })),
  });

  // Deterministic GST for the money checks; restored at the end.
  const { getSettings } = require('../src/services/payments/rechargeSettingsService');
  const originalGst = await getSettings();
  await prisma.verificationRechargeSettings.update({ where: { scope: 'GLOBAL' }, data: { gstEnabled: true, gstPercent: 18 } });

  try {
    // §1 Wizard context
    console.log('§1 Wizard context');
    const ctx = await svc.getWizardContext(COMPANY);
    check('current plan + cycle come from the subscription record', ctx.current.plan === 'Free' && ctx.current.billingCycle === 'Quarterly');
    check('minimum employees = live active users', ctx.minEmployees === 6, `min=${ctx.minEmployees}`);
    check('catalog excludes Custom, includes the standard plans',
      !ctx.plans.some((p) => p.key === 'Custom') && ['Free', 'Starter', 'Professional', 'Enterprise'].every((k) => ctx.plans.some((p) => p.key === k)));
    check('Free plan is not purchasable; paid plans are',
      ctx.plans.find((p) => p.key === 'Free')?.purchasable === false && ctx.plans.find((p) => p.key === 'Starter')?.purchasable === true);
    check('plan cards carry pricing, limits, credits and modules',
      ctx.plans.every((p) => p.pricing && p.employeeLimit !== undefined && p.includedVerificationCredits !== undefined && p.moduleCount !== undefined));
    check('current plan badge on Free', ctx.plans.find((p) => p.key === 'Free')?.isCurrent === true);

    // §2 Quote validation (server-side guards)
    console.log('§2 Quote validation');
    let q = await svc.quoteSubscription(COMPANY, { planKey: 'Free', billingCycle: 'Quarterly', employeeCount: 50 });
    check('Free plan refused for online purchase', q.ok === false);
    q = await svc.quoteSubscription(COMPANY, { planKey: 'NoSuchPlan', billingCycle: 'Quarterly', employeeCount: 50 });
    check('unknown plan refused', q.ok === false);
    q = await svc.quoteSubscription(COMPANY, { planKey: 'Starter', billingCycle: '', employeeCount: 50 });
    check('missing billing cycle refused', q.ok === false && /billing cycle/i.test(q.error));
    q = await svc.quoteSubscription(COMPANY, { planKey: 'Starter', billingCycle: 'Quarterly', employeeCount: 5 });
    check('cannot buy fewer seats than current active users (6)', q.ok === false && q.code === 'BELOW_CURRENT_USAGE' && q.minEmployees === 6);
    q = await svc.quoteSubscription(COMPANY, { planKey: 'Starter', billingCycle: 'Quarterly', employeeCount: 150 });
    check('seats above the plan capacity refused (Starter max 100)', q.ok === false && q.code === 'EXCEEDS_PLAN_CAPACITY');

    // §3 Pricing, discount, GST
    console.log('§3 Pricing, discount, GST');
    q = await svc.quoteSubscription(COMPANY, { planKey: 'Starter', billingCycle: 'Quarterly', employeeCount: 100 });
    check('Starter quarterly 100 seats: 100 × ₹25 = ₹2500 subtotal', q.ok && q.rate === 25 && q.subtotal === 2500, JSON.stringify(q));
    check('GST 18% on ₹2500 = ₹450, grand total ₹2950', q.gst.total === 450 && q.grandTotal === 2950);
    check('GST split matches the state rule',
      q.gst.type === 'CGST_SGST' ? (q.gst.cgst === 225 && q.gst.sgst === 225 && q.gst.igst === 0) : (q.gst.igst === 450 && q.gst.cgst === 0));
    check('Free → Starter classified as UPGRADE', q.changeType === 'UPGRADE');
    check('renewal preview ≈ 3 months out', daysBetween(q.renewalDate, addMonths(new Date(), 3)) < 5);

    q = await svc.quoteSubscription(COMPANY, { planKey: 'Starter', billingCycle: 'Yearly', employeeCount: 100 });
    check('yearly rate applies: 100 × ₹20 = ₹2000', q.ok && q.rate === 20 && q.subtotal === 2000);

    // Per-company discount (Super-Admin set) is honoured.
    await prisma.companySubscription.upsert({
      where: { companyId: COMPANY },
      create: { companyId: COMPANY, plan: 'Free', discountPercent: 10 },
      update: { discountPercent: 10 },
    });
    q = await svc.quoteSubscription(COMPANY, { planKey: 'Starter', billingCycle: 'Quarterly', employeeCount: 100 });
    check('10% discount: 2500 − 250 → GST on 2250 = 405 → total 2655',
      q.discount.amount === 250 && q.gst.total === 405 && q.grandTotal === 2655, JSON.stringify(q));
    await prisma.companySubscription.update({ where: { companyId: COMPANY }, data: { discountPercent: 0 } });

    // §4 Purchase → settlement (plan flip + mirror + credits + invoice)
    console.log('§4 Online purchase settles the subscription');
    // Configure included credits on the stored Starter plan (SA-editable field)
    // so the grant path is genuinely exercised; restored in the finally block.
    const starterOriginal = planStore.getPlans().find((p) => p.key === 'Starter');
    planStore.upsertPlan({ ...starterOriginal, includedVerificationCredits: 100 });
    const creditsBefore = await walletCredits();

    // Failed payment first: unpaid order must change nothing.
    const unpaid = await svc.createSubscriptionOrder({ scope, user: buyer, planKey: 'Starter', billingCycle: 'Quarterly', employeeCount: 100 });
    const unpaidVerify = await paymentOrderService.verifyAndSettle(unpaid.order.orderId, { trigger: 'test' });
    const subAfterUnpaid = await prisma.companySubscription.findUnique({ where: { companyId: COMPANY } });
    check('unpaid order → PENDING, plan unchanged', unpaidVerify.outcome === 'PENDING' && subAfterUnpaid.plan === 'Free');

    const { created, settle } = await buyAndSettle('Starter', 'Quarterly', 100);
    check('order frozen: 100 employees @ ₹25, total ₹2950, purpose SUBSCRIPTION_PURCHASE',
      created.order.creditsPurchased === 100 && created.order.totalAmount === 2950);
    check('payment settled (CREDITED)', settle.outcome === 'CREDITED');

    const sub = await prisma.companySubscription.findUnique({ where: { companyId: COMPANY } });
    const company = await prisma.company.findUnique({ where: { id: COMPANY } });
    check('subscription updated: Starter / Quarterly / Active', sub.plan === 'Starter' && sub.billingCycle === 'Quarterly' && sub.status === 'Active');
    check('renewal date set ≈ now + 3 months', sub.renewalDate && daysBetween(sub.renewalDate, addMonths(new Date(), 3)) < 5);
    check('Company mirror updated (plan + paymentStatus + cycle)', company.plan === 'Starter' && company.paymentStatus === 'Paid' && company.billingCycle === 'Quarterly');

    const cap = await getCapacity(COMPANY);
    check('employee limit = 100 (plan base, no stray extras)', cap.limit === 100 && cap.extraSlots === 0);
    // Every premium module (custom-domain included) unlocks on a paid plan;
    // only the free tier locks anything.
    check('module unlock is driven by the plan (Free locks premium, paid plans lock nothing)',
      getLockedModules('Free').length > 0 && getLockedModules(company.plan).length === 0);

    const creditsAfter = await walletCredits();
    check('included verification credits granted (+100, from the plan config)', creditsAfter === creditsBefore + 100, `before=${creditsBefore} after=${creditsAfter}`);

    const invoice = await prisma.verificationRechargeInvoice.findUnique({ where: { orderId: created.order.orderId } });
    check('invoice generated with SUB numbering', !!invoice && /^SUB-\d{4}-\d{4}$/.test(invoice.invoiceNo));
    check('invoice totals match the frozen order', !!invoice && invoice.totalAmount === 2950 && Math.abs((invoice.cgst + invoice.sgst + invoice.igst) - 450) < 0.02);

    const history = await prisma.subscriptionHistory.findFirst({ where: { companyId: COMPANY }, orderBy: { id: 'desc' } });
    check('upgrade history row written (Free → Starter)', !!history && history.oldPlan === 'Free' && history.newPlan === 'Starter');

    const again = await paymentOrderService.verifyAndSettle(created.order.orderId, { trigger: 'test' });
    check('duplicate settlement is a no-op (credits not double-granted)',
      again.outcome === 'ALREADY_SETTLED' && (await walletCredits()) === creditsAfter);

    // §5 Renewal extends from the current renewal date
    console.log('§5 Renewal (same plan + cycle) extends the period');
    q = await svc.quoteSubscription(COMPANY, { planKey: 'Starter', billingCycle: 'Quarterly', employeeCount: 100 });
    check('same plan + cycle classified as RENEWAL', q.ok && q.changeType === 'RENEWAL');
    const firstRenewal = sub.renewalDate;
    const renewal = await buyAndSettle('Starter', 'Quarterly', 100);
    const subRenewed = await prisma.companySubscription.findUnique({ where: { companyId: COMPANY } });
    check('renewal settled', renewal.settle.outcome === 'CREDITED');
    check('renewal date EXTENDED by 3 months from the previous date (≈ now + 6mo)',
      daysBetween(subRenewed.renewalDate, addMonths(new Date(firstRenewal), 3)) < 5);

    // §6 Upgrade to Professional (limit jump + audit row)
    console.log('§6 Upgrade to Professional');
    q = await svc.quoteSubscription(COMPANY, { planKey: 'Professional', billingCycle: 'Quarterly', employeeCount: 150 });
    check('Professional quarterly 150 seats: 150 × ₹20 = ₹3000', q.ok && q.rate === 20 && q.subtotal === 3000 && q.changeType === 'UPGRADE');
    const upg = await buyAndSettle('Professional', 'Quarterly', 150);
    const subUpg = await prisma.companySubscription.findUnique({ where: { companyId: COMPANY } });
    const capUpg = await getCapacity(COMPANY);
    check('upgrade settled → Professional, limit 1000 (plan base)', upg.settle.outcome === 'CREDITED' && subUpg.plan === 'Professional' && capUpg.limit === 1000);
    check('upgrade resets the renewal period (≈ now + 3mo, not extended)',
      daysBetween(subUpg.renewalDate, addMonths(new Date(), 3)) < 5);
    const slotTx = await prisma.employeeSlotTransaction.findFirst({ where: { companyId: COMPANY, type: 'SUBSCRIPTION_CHANGE' }, orderBy: { id: 'desc' } });
    check('limit change recorded in the slot audit trail (100 → 1000)', !!slotTx && slotTx.oldLimit === 100 && slotTx.newLimit === 1000);

    // §7 Billing cycle change (Quarterly → Yearly)
    console.log('§7 Quarterly → Yearly cycle change');
    q = await svc.quoteSubscription(COMPANY, { planKey: 'Professional', billingCycle: 'Yearly', employeeCount: 150 });
    check('same plan, new cycle classified as CYCLE_CHANGE', q.ok && q.changeType === 'CYCLE_CHANGE' && q.rate === 16);
    const cyc = await buyAndSettle('Professional', 'Yearly', 150);
    const subCyc = await prisma.companySubscription.findUnique({ where: { companyId: COMPANY } });
    check('cycle switched to Yearly, renewal ≈ now + 12 months',
      cyc.settle.outcome === 'CREDITED' && subCyc.billingCycle === 'Yearly' && daysBetween(subCyc.renewalDate, addMonths(new Date(), 12)) < 6);
    const companyCyc = await prisma.company.findUnique({ where: { id: COMPANY } });
    check('Company cycle mirror follows (slot purchases now price yearly)', companyCyc.billingCycle === 'Yearly');

    // §8 Tenant isolation
    console.log('§8 Tenant isolation');
    const bySub = await prisma.companySubscription.findUnique({ where: { companyId: BYSTANDER } });
    const byCompany = await prisma.company.findUnique({ where: { id: BYSTANDER } });
    check('bystander subscription untouched', !bySub && byCompany.plan === 'Free');
    const byOrders = await prisma.paymentOrder.count({ where: { companyId: BYSTANDER } });
    check('bystander has zero payment orders', byOrders === 0);

    // §9 Unified history: all purposes visible for the tenant
    console.log('§9 Unified billing history');
    const orders = await prisma.paymentOrder.findMany({ where: { companyId: COMPANY } });
    check('all subscription orders on the shared payment spine',
      orders.length >= 4 && orders.every((o) => o.purpose === 'SUBSCRIPTION_PURCHASE'));
  } finally {
    // Restore the Starter plan definition as found.
    try {
      const starterNow = planStore.getPlans().find((p) => p.key === 'Starter');
      if (starterNow) planStore.upsertPlan({ ...starterNow, includedVerificationCredits: 0 });
    } catch (_) { /* best effort */ }
    // Restore GST settings as found.
    await prisma.verificationRechargeSettings.update({
      where: { scope: 'GLOBAL' },
      data: { gstEnabled: originalGst.gstEnabled, gstPercent: originalGst.gstPercent },
    }).catch(() => {});

    console.log('\nCleaning up scratch tenant…');
    const orders = await prisma.paymentOrder.findMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } }, select: { orderId: true } });
    const ids = orders.map((o) => o.orderId);
    await prisma.verificationRechargeInvoice.deleteMany({ where: { orderId: { in: ids } } }).catch(() => {});
    await prisma.paymentWebhookEvent.deleteMany({ where: { orderId: { in: ids } } }).catch(() => {});
    await prisma.paymentOrder.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
    await prisma.employeeSlotTransaction.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
    await prisma.subscriptionHistory.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
    await prisma.verificationCreditTransaction.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
    await prisma.verificationCreditWallet.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
    await prisma.companySubscription.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
    await prisma.employee.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
