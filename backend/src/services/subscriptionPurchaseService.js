// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION PURCHASE SERVICE — the self-service upgrade / renewal engine.
//
// Everything the purchase wizard shows is computed HERE, server-side, from the
// authenticated tenant's own records:
//   • plan catalog + per-employee rates  → planStore (SA-editable)
//   • current plan / cycle / renewal     → CompanySubscription (never client input)
//   • employee floor (min seats)         → live capacity (employeeLimitService)
//   • discount                           → CompanySubscription.discountPercent (SA-set)
//   • GST split                          → company billing state vs platform GST state
// The client only ever sends { planKey, billingCycle, employeeCount }; price,
// discount, GST and limits are recomputed and FROZEN onto the payment order.
//
// Settlement (applySubscriptionInTx) is invoked by the SUBSCRIPTION_PURCHASE
// handler inside the payment spine's transaction — the plan flip, the Company
// mirror, renewal date, seat capacity and included credits all commit together
// with the idempotency gate, exactly like every other paid product.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');
const planStore = require('./planStore');
const { pricePerEmployee } = require('./planEntitlements');
const { getCapacity, resolveHead } = require('./employeeLimitService');
const { billingGst, gstTypeFor } = require('./employeeSlotService');
const { normalizeBillingCycle } = require('../utils/billingCycle');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const CYCLE_MONTHS = { Quarterly: 3, Yearly: 12 };

const addMonths = (from, months) => {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
};

/** Public-safe view of one plan definition (never leaks internal config). */
function presentPlan(def, { currentPlanKey, currentOrder } = {}) {
  const savings = def.priceQuarterly > 0
    ? Math.round((1 - def.priceYearly / def.priceQuarterly) * 100)
    : 0;
  return {
    key: def.key,
    name: def.name,
    description: def.description,
    color: def.color,
    displayOrder: def.displayOrder,
    pricing: {
      quarterly: def.priceQuarterly,
      yearly: def.priceYearly,
      yearlySavingsPercent: Math.max(0, savings),
    },
    employeeLimit: def.limits?.employeeLimit ?? -1,
    employeeRange: { min: def.employeeMin, max: def.employeeMax },
    branchLimit: def.limits?.branchLimit ?? -1,
    adminUserLimit: def.limits?.adminUserLimit ?? -1,
    storageMB: def.limits?.storageMB ?? -1,
    apiCalls: def.limits?.apiCalls ?? -1,
    includedVerificationCredits: def.includedVerificationCredits || 0,
    modules: (def.enabledModules || []).slice(),
    moduleCount: (def.enabledModules || []).length,
    supportLevel: def.key === 'Enterprise' ? 'Priority 24×7' : def.priceQuarterly > 0 ? 'Business hours' : 'Community',
    isCurrent: def.key === currentPlanKey,
    isUpgrade: currentOrder != null && def.displayOrder > currentOrder,
    isPopular: def.key === (planStore.getSettings().popularPlan || 'Professional'),
    purchasable: def.priceQuarterly > 0 && !def.custom && def.status === 'Active',
  };
}

/** Self-service catalog: active, non-custom plans in display order. */
function planCatalog(currentPlanKey) {
  const plans = planStore.getPlans().filter((p) => p.status === 'Active' && !p.custom);
  const current = plans.find((p) => p.key === currentPlanKey);
  return plans
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((p) => presentPlan(p, { currentPlanKey, currentOrder: current?.displayOrder ?? 0 }));
}

/** Subscription facts + activity, shared with the slot module's rule. */
async function subscriptionState(headId, headPlan) {
  const [sub, company] = await Promise.all([
    prisma.companySubscription.findUnique({ where: { companyId: headId } }),
    prisma.company.findUnique({ where: { id: headId }, select: { state: true, paymentStatus: true, name: true } }),
  ]);
  const status = sub?.status || 'Active';
  const isExpired =
    status === 'Expired' ||
    (sub?.renewalDate && new Date(sub.renewalDate) < new Date()) ||
    ['Overdue', 'Expired', 'Unpaid'].includes(company?.paymentStatus);
  return {
    sub,
    company,
    current: {
      plan: sub?.plan || headPlan || 'Free',
      billingCycle: normalizeBillingCycle(sub?.billingCycle),
      status,
      renewalDate: sub?.renewalDate || null,
      discountPercent: Number(sub?.discountPercent) || 0,
      active: status === 'Active' && !isExpired,
    },
  };
}

/** Wizard Step 1 + 2 payload: where the company stands + what it can buy. */
async function getWizardContext(companyId) {
  const head = await resolveHead(companyId);
  if (!head) { const e = new Error('Company not found.'); e.status = 404; throw e; }

  const [capacity, gst, state] = await Promise.all([
    getCapacity(head.id),
    billingGst(),
    subscriptionState(head.id, head.plan),
  ]);

  let credits = 0;
  try {
    const VerificationCreditService = require('./verificationCreditService');
    const wallet = await VerificationCreditService.getWallet(head.id);
    credits = Number(wallet?.remainingCredits) || 0;
  } catch (_) { /* wallet optional */ }

  const { resolveEntitlements, PREMIUM_MODULES } = require('./planEntitlements');
  const { subscriptionForPlan } = require('../middleware/subscriptionMiddleware');
  const ent = resolveEntitlements(head.plan, await subscriptionForPlan(head.id, head.plan));
  const enabledModules = PREMIUM_MODULES.filter((m) => !ent.locked.includes(m));

  return {
    company: { id: head.id, name: state.company?.name || head.name },
    current: {
      ...state.current,
      employeeLimit: capacity.limit,
      baseLimit: capacity.baseLimit,
      extraSlots: capacity.extraSlots,
      employeesUsed: capacity.current,
      unlimited: capacity.unlimited,
      verificationCredits: credits,
      enabledModules,
    },
    minEmployees: capacity.current, // seat floor — can never buy below live usage
    plans: planCatalog(state.current.plan),
    billingCycles: [
      { key: 'Quarterly', label: 'Quarterly' },
      { key: 'Yearly', label: 'Yearly' },
    ],
    gst: { enabled: gst.gstEnabled, percent: gst.gstPercent, currency: gst.currency },
  };
}

/**
 * The authoritative quote. Client input is ONLY {planKey, billingCycle,
 * employeeCount} — everything else comes from the tenant's records.
 */
async function quoteSubscription(companyId, { planKey, billingCycle, employeeCount } = {}) {
  const head = await resolveHead(companyId);
  if (!head) return { ok: false, error: 'Company not found.' };

  const def = planStore.getPlans().find((p) => p.key === String(planKey || '').trim());
  if (!def || def.status !== 'Active') return { ok: false, error: 'The selected plan is not available.' };
  if (def.custom) return { ok: false, error: 'The Custom plan is configured by our team — please contact support.' };
  if (!(def.priceQuarterly > 0)) return { ok: false, error: 'The Free plan cannot be purchased online.' };

  if (!String(billingCycle || '').trim()) {
    return { ok: false, error: 'Please choose a billing cycle (Quarterly or Yearly).' };
  }
  const cycle = normalizeBillingCycle(billingCycle);

  const seats = Number(employeeCount);
  if (!Number.isInteger(seats) || seats < 1) {
    return { ok: false, error: 'Please enter a valid number of employees.' };
  }

  const [capacity, gst, state] = await Promise.all([
    getCapacity(head.id),
    billingGst(),
    subscriptionState(head.id, head.plan),
  ]);

  // ── Downgrade / capacity guards (server-side, never advisory) ──────────────
  if (seats < capacity.current) {
    return {
      ok: false,
      code: 'BELOW_CURRENT_USAGE',
      error: `You currently have ${capacity.current} active users. You cannot purchase fewer than ${capacity.current} employee slots. Archive or offboard users first, or choose a higher count.`,
      minEmployees: capacity.current,
    };
  }
  if (def.employeeMax !== -1 && seats > def.employeeMax) {
    return {
      ok: false,
      code: 'EXCEEDS_PLAN_CAPACITY',
      error: `The ${def.name} plan supports up to ${def.employeeMax} employees. Please choose a higher plan for ${seats} employees.`,
      planMax: def.employeeMax,
    };
  }

  // ── Price (rate → discount → GST split) ────────────────────────────────────
  const rate = pricePerEmployee(def.key, cycle);
  const subtotal = r2(seats * rate);
  const discountPercent = state.current.discountPercent;
  const discountAmount = r2(subtotal * (discountPercent / 100));
  const taxable = r2(subtotal - discountAmount);
  const gstType = gst.gstEnabled ? gstTypeFor(state.company?.state, require('./invoiceIssuerStore').getIssuer().state) : 'NONE';
  const gstAmount = gst.gstEnabled ? r2(taxable * (gst.gstPercent / 100)) : 0;
  const cgst = gstType === 'CGST_SGST' ? r2(gstAmount / 2) : 0;
  const sgst = gstType === 'CGST_SGST' ? r2(gstAmount - cgst) : 0;
  const igst = gstType === 'IGST' ? gstAmount : 0;
  const grandTotal = r2(taxable + gstAmount);

  // ── Change type + renewal preview ──────────────────────────────────────────
  const now = new Date();
  const samePlan = def.key === state.current.plan;
  const sameCycle = cycle === state.current.billingCycle;
  const currentDef = planStore.getPlans().find((p) => p.key === state.current.plan);
  let changeType = 'NEW';
  if (samePlan && sameCycle) changeType = 'RENEWAL';
  else if (samePlan) changeType = 'CYCLE_CHANGE';
  else if (currentDef && def.displayOrder > currentDef.displayOrder) changeType = 'UPGRADE';
  else if (currentDef && def.displayOrder < currentDef.displayOrder) changeType = 'DOWNGRADE';
  // A renewal that still has time left EXTENDS from the current renewal date;
  // everything else starts a fresh period today.
  const renewalBase = changeType === 'RENEWAL' && state.current.renewalDate && new Date(state.current.renewalDate) > now
    ? new Date(state.current.renewalDate)
    : now;
  const newRenewalDate = addMonths(renewalBase, CYCLE_MONTHS[cycle]);

  // Seats above the plan's base limit become extra slots; the base is a floor.
  const baseLimit = def.limits?.employeeLimit ?? -1;
  const newEmployeeLimit = baseLimit === -1 ? null : Math.max(baseLimit, seats);
  const extraSlots = baseLimit === -1 ? 0 : Math.max(0, seats - baseLimit);

  return {
    ok: true,
    plan: { key: def.key, name: def.name },
    billingCycle: cycle,
    changeType,
    employeeCount: seats,
    rate,
    currentEmployeesUsed: capacity.current,
    currentLimit: capacity.limit,
    newEmployeeLimit,
    extraSlots,
    includedVerificationCredits: def.includedVerificationCredits || 0,
    additionalVerificationCredits: 0, // add-on credits ride the recharge module
    subtotal,
    discount: { percent: discountPercent, amount: discountAmount },
    gst: { enabled: gst.gstEnabled, type: gstType, percent: gst.gstEnabled ? gst.gstPercent : 0, cgst, sgst, igst, total: gstAmount },
    grandTotal,
    currency: gst.currency,
    renewalDate: newRenewalDate,
    currentRenewalDate: state.current.renewalDate,
  };
}

/** Company Head starts the online subscription purchase. */
async function createSubscriptionOrder({ scope, user, planKey, billingCycle, employeeCount }) {
  const quote = await quoteSubscription(scope.companyId, { planKey, billingCycle, employeeCount });
  if (!quote.ok) {
    const err = new Error(quote.error);
    err.status = 422;
    if (quote.code) err.code = quote.code;
    throw err;
  }
  if (!(quote.grandTotal > 0)) {
    const err = new Error('This subscription has no payable amount. Please contact support.');
    err.status = 422;
    throw err;
  }
  const paymentOrderService = require('./payments/paymentOrderService');
  return paymentOrderService.createPaymentOrderForPurpose({
    scope,
    user,
    purpose: paymentOrderService.PURPOSE_SUBSCRIPTION,
    baseAmount: r2(quote.subtotal - quote.discount.amount),
    gstEnabled: quote.gst.enabled,
    gstPercent: quote.gst.percent,
    gstAmount: quote.gst.total,
    totalAmount: quote.grandTotal,
    currency: quote.currency,
    quantity: quote.employeeCount,
    unitPrice: quote.rate,
    serviceType: 'SUBSCRIPTION',
    packageName: `${quote.plan.name} — ${quote.billingCycle}`,
    note: `ZeniaHR ${quote.plan.name} subscription (${quote.billingCycle}, ${quote.employeeCount} employees)`,
    // Settlement metadata — frozen at order creation, parsed by the handler.
    notes: JSON.stringify({
      kind: 'SUBSCRIPTION_PURCHASE',
      planKey: quote.plan.key,
      billingCycle: quote.billingCycle,
      employeeCount: quote.employeeCount,
      changeType: quote.changeType,
      discountPercent: quote.discount.percent,
    }),
  });
}

/**
 * THE subscription mutation — runs inside the payment settlement transaction.
 * Reads ONLY the frozen order row; recomputes the renewal date at settle time
 * from the live subscription (a renewal extends, everything else restarts).
 */
async function applySubscriptionInTx(tx, order) {
  let meta = {};
  try { meta = JSON.parse(order.notes || '{}'); } catch (_) { /* handled below */ }
  const planKey = meta.planKey;
  const cycle = normalizeBillingCycle(meta.billingCycle);
  const seats = Number(order.creditsPurchased) || Number(meta.employeeCount) || 0;
  const def = planStore.getPlans().find((p) => p.key === planKey);
  if (!def) throw new Error(`Subscription order ${order.orderId} references unknown plan "${planKey}".`);

  const head = await resolveHead(order.companyId);
  if (!head) throw new Error('Company not found.');

  let sub = await tx.companySubscription.findUnique({ where: { companyId: head.id } });
  if (!sub) {
    sub = await tx.companySubscription.create({ data: { companyId: head.id, plan: head.plan || 'Free' } });
  }

  const now = new Date();
  const isRenewal = sub.plan === planKey && normalizeBillingCycle(sub.billingCycle) === cycle;
  const renewalBase = isRenewal && sub.renewalDate && new Date(sub.renewalDate) > now ? new Date(sub.renewalDate) : now;
  const renewalDate = addMonths(renewalBase, CYCLE_MONTHS[cycle]);

  const baseLimit = def.limits?.employeeLimit ?? -1;
  const oldExtra = Math.max(0, Number(sub.extraEmployeeSlots) || 0);
  const newExtra = baseLimit === -1 ? 0 : Math.max(0, seats - baseLimit);
  const oldBase = require('./planEntitlements').resolveEntitlements(sub.plan, sub.plan === 'Custom' ? sub : null).limits?.maxEmployees;
  const oldLimit = oldBase == null || Number(oldBase) < 0 ? null : Number(oldBase) + oldExtra;
  const newLimit = baseLimit === -1 ? null : Math.max(baseLimit, seats);

  const prev = { plan: sub.plan, billingCycle: sub.billingCycle, renewalDate: sub.renewalDate, status: sub.status };

  await tx.companySubscription.update({
    where: { companyId: head.id },
    data: {
      plan: planKey,
      billingCycle: cycle,
      status: 'Active',
      renewalDate,
      extraEmployeeSlots: newExtra,
    },
  });

  // Mirror onto the Company row — the live enforcement source (module gates,
  // capacity, slot pricing all read Company.plan / the subscription).
  await tx.company.update({
    where: { id: head.id },
    data: { plan: planKey, paymentStatus: 'Paid', billingCycle: cycle },
  });

  // Seat capacity change → append-only slot-transaction row (same audit trail
  // the slot module uses), so the limit history stays complete.
  if (oldLimit !== newLimit || oldExtra !== newExtra) {
    await tx.employeeSlotTransaction.create({
      data: {
        companyId: head.id,
        type: 'SUBSCRIPTION_CHANGE',
        status: 'COMPLETED',
        packName: `${def.name} — ${cycle}`,
        slots: newExtra - oldExtra,
        amount: order.totalAmount,
        orderId: order.orderId,
        requestedBy: order.userName || 'Company Head',
        actionedBy: 'Online Payment',
        oldLimit,
        newLimit,
        reason: `Subscription ${planKey} (${seats} employees)`,
      },
    });
  }

  // Included verification credits — granted on every PAID purchase/renewal.
  let creditsGranted = 0;
  if ((def.includedVerificationCredits || 0) > 0) {
    const VerificationCreditService = require('./verificationCreditService');
    await VerificationCreditService.purchaseCredits(
      {
        companyId: head.id,
        credits: def.includedVerificationCredits,
        referenceId: order.orderId,
        remarks: `Included with the ${def.name} subscription (order ${order.orderId})`,
        createdBy: order.userName || 'Subscription Purchase',
        provider: 'Cashfree Payment Gateway',
        serviceType: 'BANK_VERIFICATION',
      },
      tx
    );
    creditsGranted = def.includedVerificationCredits;
  }

  return {
    headId: head.id,
    planKey,
    planName: def.name,
    billingCycle: cycle,
    renewalDate,
    seats,
    oldPlan: prev.plan,
    oldLimit,
    newLimit,
    creditsGranted,
    changeType: meta.changeType || (isRenewal ? 'RENEWAL' : 'CHANGE'),
    companyName: head.name || `Company #${head.id}`,
  };
}

module.exports = {
  CYCLE_MONTHS,
  planCatalog,
  getWizardContext,
  quoteSubscription,
  createSubscriptionOrder,
  applySubscriptionInTx,
};
