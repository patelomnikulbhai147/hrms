// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE SLOT SERVICE — add-on employee slots on top of the plan limit.
//
//   effective limit = plan base limit + CompanySubscription.extraEmployeeSlots
//
// The ONLY writers of extraEmployeeSlots are:
//   • grantSlotsInTx()  — called from the payment settlement handler (online
//     purchase), the Super Admin approval of a manual request, and the Super
//     Admin manual adjust. Always inside a transaction, always paired with an
//     append-only employee_slot_transactions row + old/new limits for audit.
//
// Business rules enforced here:
//   • Packs below the online-payment minimum (₹500 total) are NEVER sent to
//     the gateway — the client gets the contact-sales response instead.
//   • extraEmployeeSlots can never go below 0 (a Super Admin decrease clamps).
//   • The base plan limit is never modified by any slot operation.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');
const { resolveHead, getCapacity } = require('./employeeLimitService');
const { resolveEntitlements } = require('./planEntitlements');
const AuditService = require('./auditService');
const { normalizeBillingCycle } = require('../utils/billingCycle');
const { lockRowForUpdate } = require('../utils/rowLock');
const { gstTypeFor: sharedGstTypeFor } = require('../utils/placeOfSupply');

// There is NO minimum payment amount for slot purchases — the only floor is
// MIN_SLOTS below. (A minimum-amount rule exists ONLY in the Verification
// Credit Recharge module: rechargeSettingsService.minRechargeAmount.)
// Slots are sold in steps of 5 — minimum 5, always a multiple of 5.
const SLOT_STEP = 5;
const MIN_SLOTS = 5;
// Shown whenever a purchase is attempted without an active subscription.
const SUBSCRIPTION_EXPIRED_MESSAGE =
  'Your subscription has expired. Please renew your subscription before purchasing additional employee slots.';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** GST facts come from the platform billing settings (shared with recharges). */
async function billingGst() {
  const { getSettings } = require('./payments/rechargeSettingsService');
  const s = await getSettings();
  return { gstEnabled: Boolean(s.gstEnabled), gstPercent: s.gstEnabled ? Number(s.gstPercent) : 0, currency: s.currency || 'INR' };
}

/** Slots must be a whole multiple of 5, at least 5. */
function validateSlots(raw) {
  const slots = Number(raw);
  if (!Number.isInteger(slots) || slots < MIN_SLOTS || slots % SLOT_STEP !== 0) {
    return { ok: false, error: `Employee slots are sold in multiples of ${SLOT_STEP} (minimum ${MIN_SLOTS}). For example: 5, 10, 15, 20, 25.` };
  }
  return { ok: true, slots };
}

/** The configurable pricing matrix (per slot, per cycle) — Plan Settings. */
function pricingTiers() {
  const store = require('./planStore');
  const tiers = store.getSettings().slotPricingTiers;
  const fallback = store.DEFAULT_SETTINGS.slotPricingTiers;
  const list = Array.isArray(tiers) && tiers.length ? tiers : fallback;
  return list
    .map((t) => ({ upTo: t.upTo == null ? null : Number(t.upTo), quarterly: Number(t.quarterly) || 0, yearly: Number(t.yearly) || 0 }))
    .sort((a, b) => (a.upTo == null ? Infinity : a.upTo) - (b.upTo == null ? Infinity : b.upTo));
}

/** Tier for a given employee limit (the limit AFTER adding the new slots). */
function tierFor(newLimit) {
  const tiers = pricingTiers();
  let from = 0;
  for (const t of tiers) {
    if (t.upTo == null || newLimit <= t.upTo) {
      return { ...t, from, label: t.upTo == null ? `${from + 1}+ Employees` : `${from === 0 ? 0 : from + 1}–${t.upTo} Employees` };
    }
    from = t.upTo;
  }
  const last = tiers[tiers.length - 1];
  return { ...last, from, label: `${from + 1}+ Employees` };
}

/**
 * Intra- vs inter-state supply. Origin = the platform's registered GST state
 * (invoice issuer settings); destination = the company's billing state.
 *
 * Delegates to utils/placeOfSupply — the ONE resolver shared by the quote, the
 * payment order, the recharge invoice and the subscription invoice, so no two
 * of them can ever decide the split differently. (This local copy previously
 * normalised states slightly differently from the other call sites.)
 */
function gstTypeFor(companyState, originState) {
  return sharedGstTypeFor(companyState, originState);
}

/** Everything a slot quote needs, loaded once (overview quotes many amounts). */
async function buildQuoteContext(companyId) {
  const head = await resolveHead(companyId);
  const [capacity, gst, sub, company] = await Promise.all([
    getCapacity(companyId),
    billingGst(),
    head
      ? prisma.companySubscription.findUnique({
          where: { companyId: head.id },
          select: { plan: true, billingCycle: true, status: true, renewalDate: true },
        })
      : null,
    head ? prisma.company.findUnique({ where: { id: head.id }, select: { state: true, paymentStatus: true, billingCycle: true } }) : null,
  ]);
  const { getIssuer } = require('./invoiceIssuerStore');
  const issuer = getIssuer();

  // Billing cycle is INHERITED from the subscription record — it is never a
  // client input anywhere in this module. Active/expired uses the same rule as
  // subscriptionController's analytics (status + renewalDate + paymentStatus);
  // a company without a subscription row is treated as Active on its plan,
  // exactly like the rest of the platform treats it.
  const status = sub?.status || 'Active';
  const isExpired =
    status === 'Expired' ||
    (sub?.renewalDate && new Date(sub.renewalDate) < new Date()) ||
    ['Overdue', 'Expired', 'Unpaid'].includes(company?.paymentStatus);
  // Subscription row first, then the company mirror (a company onboarded Yearly
  // whose subscription row has not materialised yet must still quote yearly),
  // then the default. Normalised so a legacy 'Monthly' can never select a rate.
  const cycleLabel = normalizeBillingCycle(sub?.billingCycle, normalizeBillingCycle(company?.billingCycle));
  return {
    capacity,
    gst,
    cycle: cycleLabel === 'Yearly' ? 'yearly' : 'quarterly',
    cycleLabel,
    companyState: company?.state || null,
    originState: issuer.state || null,
    subscription: {
      plan: sub?.plan || capacity.plan || 'Free',
      billingCycle: cycleLabel,
      status,
      renewalDate: sub?.renewalDate || null,
      active: status === 'Active' && !isExpired,
      inherited: true,
    },
  };
}

/**
 * Price a slot purchase: tier chosen by the limit AFTER the purchase, rate per
 * the company's billing cycle, GST split by billing state vs the platform's
 * registered state. Returns { ok:false, error } for invalid requests.
 */
function priceSlots(slotsRaw, ctx) {
  const v = validateSlots(slotsRaw);
  if (!v.ok) return v;
  const { capacity, gst, cycle, cycleLabel } = ctx;
  if (ctx.subscription && !ctx.subscription.active) {
    return { ok: false, code: 'SUBSCRIPTION_EXPIRED', error: SUBSCRIPTION_EXPIRED_MESSAGE };
  }
  if (capacity.unlimited) {
    return { ok: false, error: 'Your current plan has unlimited employees — additional slots are not required.' };
  }
  const slots = v.slots;

  // Same math for the quoted count and for the "how many more slots until the
  // online minimum" probe below — one formula, no drift.
  const totalsFor = (count) => {
    const newLimit = capacity.limit + count;
    const tier = tierFor(newLimit);
    const rate = tier[cycle];
    const subtotal = r2(count * rate);
    const gstType = gst.gstEnabled ? gstTypeFor(ctx.companyState, ctx.originState) : 'NONE';
    const gstAmount = gst.gstEnabled ? r2(subtotal * (gst.gstPercent / 100)) : 0;
    const cgst = gstType === 'CGST_SGST' ? r2(gstAmount / 2) : 0;
    const sgst = gstType === 'CGST_SGST' ? r2(gstAmount - cgst) : 0;
    const igst = gstType === 'IGST' ? gstAmount : 0;
    return { newLimit, tier, rate, subtotal, gstType, gstAmount, cgst, sgst, igst, grandTotal: r2(subtotal + gstAmount) };
  };

  const t = totalsFor(slots);

  return {
    ok: true,
    slots,
    currentLimit: capacity.limit,
    newLimit: t.newLimit,
    tier: { label: t.tier.label, rate: t.rate, cycle: cycleLabel },
    // Echo the inherited subscription so the UI can display it — never an input.
    subscription: ctx.subscription
      ? { plan: ctx.subscription.plan, billingCycle: ctx.subscription.billingCycle, inherited: true }
      : null,
    subtotal: t.subtotal,
    gst: { enabled: gst.gstEnabled, type: t.gstType, percent: gst.gstEnabled ? gst.gstPercent : 0, cgst: t.cgst, sgst: t.sgst, igst: t.igst, total: t.gstAmount },
    grandTotal: t.grandTotal,
    currency: gst.currency,
  };
}

/** One-shot quote (context + pricing) for a company. */
async function quoteSlots(companyId, slotsRaw) {
  const ctx = await buildQuoteContext(companyId);
  return priceSlots(slotsRaw, ctx);
}

/** Sales-team contact block for the manual path (never hardcoded per-tenant). */
function salesContact() {
  const { getIssuer } = require('./invoiceIssuerStore');
  const issuer = getIssuer();
  return {
    email: process.env.SUPPORT_EMAIL || issuer.email || 'support@zeniahr.com',
    phone: issuer.phone || null,
    whatsapp: issuer.phone || null,
    message: 'Please contact our sales team to purchase additional employee slots.',
  };
}

/**
 * THE slot mutation. Runs inside the caller's transaction: bumps
 * extraEmployeeSlots (clamped at 0), records the append-only transaction row
 * with old/new limits, and returns both. Never touches the base plan.
 */
async function grantSlotsInTx(tx, {
  companyId, slots, type, status = 'COMPLETED',
  packId = null, packName = null, amount = null, orderId = null,
  requestedBy = null, actionedBy = null, reason = null, requestRowId = null,
}) {
  const head = await resolveHead(companyId);
  if (!head) throw new Error('Company not found.');

  // Get-or-create the subscription row (same lazy pattern subscriptionController
  // uses) — seeded from the company's own cycle, never the schema default, so a
  // Yearly tenant whose row is materialised here stays Yearly.
  let sub = await tx.companySubscription.findUnique({ where: { companyId: head.id } });
  if (!sub) {
    // Two concurrent first-time grants can both miss here; companyId is unique,
    // so the loser re-reads the winner's row instead of failing the payment.
    try {
      sub = await tx.companySubscription.create({
        data: {
          companyId: head.id,
          plan: head.plan || 'Free',
          billingCycle: normalizeBillingCycle(head.billingCycle),
        },
      });
    } catch (e) {
      if (e?.code !== 'P2002') throw e;
      sub = await tx.companySubscription.findUnique({ where: { companyId: head.id } });
    }
  }

  // ── Serialise concurrent grants on this company ────────────────────────────
  // extraEmployeeSlots is read here and written back absolutely below. Without
  // an exclusive lock, two settlements (e.g. the client /verify and the webhook
  // for a DIFFERENT order) can both read the same balance and the second write
  // silently discards the first — the customer pays for two packs and receives
  // one, while both transaction rows claim success.
  //
  // The balance MUST come from the locking read itself: a plain findUnique here
  // would return this transaction's REPEATABLE-READ snapshot (the pre-lock
  // value) and the lost update would survive the lock.
  const locked = await lockRowForUpdate(
    tx, 'CompanySubscription', 'companyId', head.id, ['extraEmployeeSlots']
  );
  const currentExtra = Math.max(0, Number(locked?.extraEmployeeSlots) || 0);

  const baseMax = resolveEntitlements(head.plan, head.plan === 'Custom' ? sub : null).limits?.maxEmployees;
  const unlimited = baseMax == null || Number(baseMax) < 0;
  // From the LOCKED current read — never from `sub`, which is snapshot data.
  const oldExtra = currentExtra;
  const newExtra = Math.max(0, oldExtra + Number(slots));
  const appliedDelta = newExtra - oldExtra; // may differ from `slots` when clamped
  const oldLimit = unlimited ? null : Number(baseMax) + oldExtra;
  const newLimit = unlimited ? null : Number(baseMax) + newExtra;

  await tx.companySubscription.update({
    where: { companyId: head.id },
    data: { extraEmployeeSlots: newExtra },
  });

  let slotTx;
  if (requestRowId) {
    // Approving an existing manual request updates that row in place.
    slotTx = await tx.employeeSlotTransaction.update({
      where: { id: requestRowId },
      data: { status, actionedBy, oldLimit, newLimit, reason: reason || undefined },
    });
  } else {
    slotTx = await tx.employeeSlotTransaction.create({
      data: {
        companyId: head.id, type, status, packId, packName,
        slots: appliedDelta, amount, orderId, oldLimit, newLimit,
        requestedBy, actionedBy, reason,
      },
    });
  }
  return { slotTx, oldExtra, newExtra, oldLimit, newLimit, appliedDelta, headId: head.id };
}

/** Company-facing overview: capacity, quick options (each fully quoted), the
 *  pricing matrix for display, contact info and history. Quick options come
 *  from the active packs' slot counts; their prices are ALWAYS the live tier
 *  quote — the pack table's legacy price column is not used for pricing. */
async function getOverview(companyId) {
  const [ctx, packs] = await Promise.all([
    buildQuoteContext(companyId),
    prisma.employeeSlotPack.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
  ]);
  const head = await resolveHead(companyId);
  const quickOptions = packs
    .map((p) => {
      const q = priceSlots(p.slots, ctx);
      return q.ok ? { id: p.id, name: p.name, ...q } : null;
    })
    .filter(Boolean);
  const history = head
    ? await prisma.employeeSlotTransaction.findMany({ where: { companyId: head.id }, orderBy: { id: 'desc' }, take: 50 })
    : [];
  return {
    capacity: ctx.capacity,
    billingCycle: ctx.cycleLabel,
    subscription: ctx.subscription,
    subscriptionExpiredMessage: ctx.subscription.active ? null : SUBSCRIPTION_EXPIRED_MESSAGE,
    quickOptions,
    pricingTiers: pricingTiers().map((t) => ({ ...tierFor(t.upTo == null ? Number.MAX_SAFE_INTEGER : t.upTo) })),
    slotStep: SLOT_STEP,
    minSlots: MIN_SLOTS,
    currency: ctx.gst.currency,
    contact: salesContact(),
    history,
  };
}

/** Company Head starts an ONLINE slot purchase (custom multiple-of-5 count or
 *  a quick-option pack; ₹500+ grand total only). */
async function createSlotOrder({ scope, user, slots = null, packId = null }) {
  let requested = slots;
  let pack = null;
  if (packId) {
    pack = await prisma.employeeSlotPack.findUnique({ where: { id: parseInt(packId, 10) || 0 } });
    if (!pack || !pack.isActive) {
      const err = new Error('The selected slot pack is no longer available.');
      err.status = 400;
      throw err;
    }
    requested = pack.slots;
  }
  const quote = await quoteSlots(scope.companyId, requested);
  if (!quote.ok) {
    const err = new Error(quote.error);
    err.status = 422;
    if (quote.code) err.code = quote.code;
    throw err;
  }
  // No minimum payment amount for slot purchases: 5 slots at the current rate
  // goes straight to the gateway (the ₹-minimum rule belongs ONLY to the
  // Verification Credit Recharge module).
  const paymentOrderService = require('./payments/paymentOrderService');
  return paymentOrderService.createPaymentOrderForPurpose({
    scope,
    user,
    purpose: paymentOrderService.PURPOSE_SLOT_PURCHASE,
    baseAmount: quote.subtotal,
    gstEnabled: quote.gst.enabled,
    gstPercent: quote.gst.percent,
    gstAmount: quote.gst.total,
    totalAmount: quote.grandTotal,
    currency: quote.currency,
    quantity: quote.slots,
    unitPrice: quote.tier.rate,
    serviceType: 'EMPLOYEE_SLOTS',
    packageId: pack?.id ?? null,
    packageName: pack?.name ?? `+${quote.slots} Employees`,
    note: `Employee slots +${quote.slots} @ ${quote.tier.rate}/${quote.tier.cycle} (${quote.tier.label})`,
  });
}

/** Company Head files a manual purchase request (any amount, same step rule). */
async function requestManualPurchase({ scope, user, packId = null, slots = null, note = '' }) {
  let pack = null;
  if (packId) pack = await prisma.employeeSlotPack.findUnique({ where: { id: parseInt(packId, 10) || 0 } });
  const v = validateSlots(pack ? pack.slots : slots);
  if (!v.ok) {
    const err = new Error(v.error);
    err.status = 422;
    throw err;
  }
  const requestedSlots = v.slots;
  const head = await resolveHead(scope.companyId);
  const ctx = await buildQuoteContext(scope.companyId);
  if (ctx.subscription && !ctx.subscription.active) {
    const err = new Error(SUBSCRIPTION_EXPIRED_MESSAGE);
    err.status = 422;
    err.code = 'SUBSCRIPTION_EXPIRED';
    throw err;
  }
  const quote = priceSlots(requestedSlots, ctx);
  const row = await prisma.employeeSlotTransaction.create({
    data: {
      companyId: head.id,
      type: 'MANUAL_REQUEST',
      status: 'REQUESTED',
      packId: pack?.id ?? null,
      packName: pack?.name ?? `+${requestedSlots} Employees`,
      slots: requestedSlots,
      amount: quote.ok ? quote.grandTotal : null,
      requestedBy: user?.name || user?.email || 'Company Head',
      reason: String(note || '').trim() || null,
    },
  });
  const { notifySuperAdmins } = require('./payments/paymentOrderService');
  await notifySuperAdmins({
    title: 'Employee slot purchase request',
    message: `Company #${head.id} requested ${requestedSlots} additional employee slots (${row.packName}). Review it under Subscription Management → Employee Slots.`,
    priority: 'high',
  }).catch(() => {});
  return row;
}

/** Super Admin approves a pending manual request → slots granted atomically. */
async function approveRequest(requestId, approver) {
  const row = await prisma.employeeSlotTransaction.findUnique({ where: { id: parseInt(requestId, 10) || 0 } });
  if (!row || row.type !== 'MANUAL_REQUEST') { const e = new Error('Request not found.'); e.status = 404; throw e; }
  if (row.status !== 'REQUESTED') { const e = new Error('This request has already been actioned.'); e.status = 409; throw e; }

  let result;
  await prisma.$transaction(async (tx) => {
    // Idempotency gate — same pattern as payment settlement.
    const gate = await tx.employeeSlotTransaction.updateMany({
      where: { id: row.id, status: 'REQUESTED' },
      data: { status: 'APPROVED', actionedBy: approver },
    });
    if (gate.count !== 1) { const e = new Error('This request has already been actioned.'); e.status = 409; throw e; }
    result = await grantSlotsInTx(tx, {
      companyId: row.companyId, slots: row.slots,
      type: 'MANUAL_REQUEST', status: 'APPROVED',
      actionedBy: approver, requestRowId: row.id,
    });
  });
  await auditSlotChange(null, 'SLOT_REQUEST_APPROVED', result, { requestId: row.id, by: approver });
  notifyCompanyOfGrant(result.headId, result.appliedDelta, result.newLimit).catch(() => {});
  return result;
}

/** Super Admin rejects a pending request. */
async function rejectRequest(requestId, actor, reason = '') {
  const gate = await prisma.employeeSlotTransaction.updateMany({
    where: { id: parseInt(requestId, 10) || 0, type: 'MANUAL_REQUEST', status: 'REQUESTED' },
    data: { status: 'REJECTED', actionedBy: actor, reason: String(reason || '').trim() || null },
  });
  if (gate.count !== 1) { const e = new Error('Request not found or already actioned.'); e.status = 409; throw e; }
  return prisma.employeeSlotTransaction.findUnique({ where: { id: parseInt(requestId, 10) } });
}

/** Super Admin manual grant/decrease (delta may be negative; extra clamps at 0). */
async function adjustSlots({ companyId, delta, reason, actor }) {
  const d = parseInt(delta, 10);
  if (!d) { const e = new Error('Enter a non-zero slot adjustment.'); e.status = 422; throw e; }
  if (!String(reason || '').trim()) { const e = new Error('A reason is required for manual slot changes.'); e.status = 422; throw e; }
  let result;
  await prisma.$transaction(async (tx) => {
    result = await grantSlotsInTx(tx, {
      companyId, slots: d,
      type: d > 0 ? 'MANUAL_GRANT' : 'MANUAL_ADJUST',
      actionedBy: actor, reason,
    });
  });
  await auditSlotChange(null, d > 0 ? 'SLOT_MANUAL_GRANT' : 'SLOT_MANUAL_DECREASE', result, { by: actor, reason });
  notifyCompanyOfGrant(result.headId, result.appliedDelta, result.newLimit).catch(() => {});
  return result;
}

/** AuditLog entry for every slot modification (module EmployeeSlots). */
async function auditSlotChange(userId, action, result, details = {}) {
  try {
    let actorId = userId;
    if (!actorId) {
      const admin = await prisma.user.findFirst({ where: { role: 'Super Admin' }, select: { id: true } });
      actorId = admin?.id;
    }
    if (!actorId) return;
    await AuditService.logAudit(actorId, action, 'EmployeeSlots', String(result.headId), {
      oldLimit: result.oldLimit, newLimit: result.newLimit, delta: result.appliedDelta, ...details,
    });
  } catch (e) {
    console.error('[slots] audit write failed:', e.message);
  }
}

/** Notify the company's heads that their limit changed. */
async function notifyCompanyOfGrant(headId, delta, newLimit) {
  if (!delta) return;
  const { notifyMany } = require('./notificationService');
  const heads = await prisma.user.findMany({
    where: { companyId: headId, role: 'Company Head', status: 'Active' },
    select: { id: true },
  });
  await notifyMany(heads.map((h) => h.id), {
    companyId: headId,
    type: 'EMPLOYEE_SLOTS',
    title: delta > 0 ? 'Employee slots added' : 'Employee slot limit changed',
    message: delta > 0
      ? `${delta} additional employee slots have been added to your plan. Your employee limit is now ${newLimit ?? 'unlimited'}.`
      : `Your employee slot limit was adjusted. It is now ${newLimit ?? 'unlimited'}.`,
    priority: 'medium',
  });
}

module.exports = {
  SLOT_STEP,
  MIN_SLOTS,
  SUBSCRIPTION_EXPIRED_MESSAGE,
  billingGst,
  validateSlots,
  pricingTiers,
  tierFor,
  gstTypeFor,
  buildQuoteContext,
  priceSlots,
  quoteSlots,
  salesContact,
  grantSlotsInTx,
  getOverview,
  createSlotOrder,
  requestManualPurchase,
  approveRequest,
  rejectRequest,
  adjustSlots,
  auditSlotChange,
  notifyCompanyOfGrant,
};
