/**
 * Payment order lifecycle — the reusable spine for every self-service payment.
 *
 * Invariants this file enforces (do not weaken them):
 *
 *  1. Tenant identity is written ONCE, at order creation, from the
 *     authenticated session. Settlement, webhooks and history reads derive the
 *     company ONLY from the stored payment_orders row — a client- or
 *     webhook-supplied company id never reaches a credit write.
 *  2. Pricing is a SNAPSHOT. Credits are settled from the values frozen at
 *     order creation; a Super Admin price change mid-checkout cannot alter an
 *     in-flight order.
 *  3. Settlement is idempotent. The conditional settlementStatus update inside
 *     the transaction is the single gate — webhook retries, double clicks and
 *     concurrent verify calls all collapse into exactly one credit grant.
 *  4. The gateway is the source of truth. We never settle from a webhook body
 *     or client claim — we re-fetch the order + payments from the Cashfree API
 *     before any credit is written.
 *  5. Post-commit work (invoice, notifications) is failure-tolerant and can
 *     never roll back credits.
 */
const crypto = require('crypto');
const prisma = require('../../config/prisma');
const cashfreePg = require('./cashfreePgClient');
const rechargeSettings = require('./rechargeSettingsService');
const rechargeHandler = require('./settlements/verificationCreditRecharge');

const PURPOSE_RECHARGE = 'VERIFICATION_CREDIT_RECHARGE';
const PURPOSE_SLOT_PURCHASE = 'EMPLOYEE_SLOT_PURCHASE';
const PURPOSE_SUBSCRIPTION = 'SUBSCRIPTION_PURCHASE';

// Settlement handlers by order purpose — future paid products register here.
const SETTLEMENT_HANDLERS = {
  [PURPOSE_RECHARGE]: rechargeHandler,
  [PURPOSE_SLOT_PURCHASE]: require('./settlements/employeeSlotPurchase'),
  [PURPOSE_SUBSCRIPTION]: require('./settlements/subscriptionPurchase'),
};

const SECRET_KEY_RE = /secret|token|auth|apikey|api_key|client_id|clientid|signature|password/i;

/** Strip anything credential-shaped before a payload is stored. */
function redactPayload(value, depth = 0) {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redactPayload(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_RE.test(k) ? '[REDACTED]' : redactPayload(v, depth + 1);
    }
    return out;
  }
  return value;
}

function newOrderId() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `PGO-${ymd}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

/** The order fields a tenant may see. providerCostSnapshot and the per-credit
 *  price snapshot stay server-side; raw payloads stay Super-Admin-side. */
function presentOrderForTenant(order) {
  return {
    orderId: order.orderId,
    purpose: order.purpose,
    baseAmount: order.baseAmount,
    gstEnabled: order.gstEnabled,
    gstPercent: order.gstPercent,
    gstAmount: order.gstAmount,
    totalAmount: order.totalAmount,
    currency: order.currency,
    creditsPurchased: order.creditsPurchased,
    packageName: order.packageName,
    status: order.status,
    settlementStatus: order.settlementStatus,
    paymentMethod: order.paymentMethod,
    cfPaymentId: order.cfPaymentId,
    paymentTime: order.paymentTime,
    creditedAt: order.creditedAt,
    invoiceId: order.invoiceId,
    createdAt: order.createdAt,
  };
}

/**
 * Create a recharge order for the resolved tenant. `scope` comes from the
 * controller AFTER resolveWalletCompany — never from the request body.
 */
async function createRechargeOrder({ scope, user, amount, packageId = null }) {
  const settings = await rechargeSettings.getSettings();
  if (!settings.enableOnlineRecharge) {
    const err = new Error('Online recharge is currently disabled. Please contact support.');
    err.status = 403;
    throw err;
  }
  if (!cashfreePg.isConfigured()) {
    const err = new Error('The payment gateway is not configured. Please contact support.');
    err.status = 503;
    throw err;
  }

  // Package selection just supplies the amount server-side; a tampered amount
  // on a package order is ignored.
  let pkg = null;
  if (packageId) {
    pkg = await prisma.verificationRechargePackage.findUnique({ where: { id: parseInt(packageId, 10) } });
    if (!pkg || !pkg.isActive) {
      const err = new Error('The selected recharge package is no longer available.');
      err.status = 400;
      throw err;
    }
  }

  const quote = rechargeSettings.priceQuote(pkg ? pkg.amount : amount, settings);
  if (!quote.ok) {
    const err = new Error(quote.error);
    err.status = 422;
    throw err;
  }

  const orderId = newOrderId();
  const company = await prisma.company.findUnique({ where: { id: scope.companyId } }).catch(() => null);

  const cfOrder = await cashfreePg.createOrder({
    orderId,
    amount: quote.totalPayable,
    currency: quote.currency,
    customer: {
      // Cashfree's customer_id is informational for us; tenant truth stays in
      // our own row. Prefixed so gateway-side records are traceable per company.
      id: `company-${scope.companyId}-user-${user?.id || 0}`,
      name: user?.name || company?.name || undefined,
      email: user?.email || company?.email || undefined,
      phone: user?.phone || company?.phone || undefined,
    },
    note: `Verification credit recharge — ${quote.credits} credits`,
    meta: { purpose: PURPOSE_RECHARGE },
  });

  const order = await prisma.paymentOrder.create({
    data: {
      orderId,
      provider: 'CASHFREE_PG',
      purpose: PURPOSE_RECHARGE,
      cfOrderId: cfOrder?.cf_order_id != null ? String(cfOrder.cf_order_id) : null,
      paymentSessionId: cfOrder?.payment_session_id || null,
      companyId: scope.companyId,
      branchId: scope.branchId ?? null,
      workspaceId: scope.workspaceId ?? null,
      workspaceKind: scope.workspaceKind ?? null,
      userId: user?.id ?? null,
      userName: user?.name || user?.email || null,
      userRole: user?.role || null,
      baseAmount: quote.baseAmount,
      gstEnabled: quote.gstEnabled,
      gstPercent: quote.gstPercent,
      gstAmount: quote.gstAmount,
      totalAmount: quote.totalPayable,
      currency: quote.currency,
      sellingPriceSnapshot: settings.sellingPricePerCredit,
      providerCostSnapshot: settings.providerCostPerCredit,
      creditsPurchased: quote.credits,
      packageId: pkg?.id ?? null,
      packageName: pkg?.name ?? null,
      status: 'ACTIVE',
      settlementStatus: 'PENDING',
      rawOrderResponse: redactPayload(cfOrder),
    },
  });

  return {
    order: presentOrderForTenant(order),
    paymentSessionId: order.paymentSessionId,
    checkoutMode: cashfreePg.envMode(),
  };
}

/**
 * Generic order creation for any registered purpose (used by non-credit
 * products, e.g. employee slot packs). Same invariants as the recharge path:
 * `scope` is resolved from the authenticated session by the caller, pricing is
 * computed server-side and frozen onto the row, and `quantity` maps onto the
 * creditsPurchased column (the spine's generic "units purchased" field).
 */
async function createPaymentOrderForPurpose({
  scope, user, purpose,
  baseAmount, gstEnabled = false, gstPercent = 0, gstAmount = 0, totalAmount, currency = 'INR',
  quantity, unitPrice, providerCost = 0,
  packageId = null, packageName = null, serviceType = 'PLATFORM', note = null,
  notes = null, // free-form settlement metadata frozen onto the row (e.g. JSON)
}) {
  if (!SETTLEMENT_HANDLERS[purpose]) {
    const err = new Error(`No settlement handler registered for purpose ${purpose}.`);
    err.status = 500;
    throw err;
  }
  if (!cashfreePg.isConfigured()) {
    const err = new Error('The payment gateway is not configured. Please contact support.');
    err.status = 503;
    throw err;
  }

  const orderId = newOrderId();
  const company = await prisma.company.findUnique({ where: { id: scope.companyId } }).catch(() => null);

  const cfOrder = await cashfreePg.createOrder({
    orderId,
    amount: totalAmount,
    currency,
    customer: {
      id: `company-${scope.companyId}-user-${user?.id || 0}`,
      name: user?.name || company?.name || undefined,
      email: user?.email || company?.email || undefined,
      phone: user?.phone || company?.phone || undefined,
    },
    note,
    meta: { purpose },
  });

  const order = await prisma.paymentOrder.create({
    data: {
      orderId,
      provider: 'CASHFREE_PG',
      purpose,
      cfOrderId: cfOrder?.cf_order_id != null ? String(cfOrder.cf_order_id) : null,
      paymentSessionId: cfOrder?.payment_session_id || null,
      companyId: scope.companyId,
      branchId: scope.branchId ?? null,
      workspaceId: scope.workspaceId ?? null,
      workspaceKind: scope.workspaceKind ?? null,
      userId: user?.id ?? null,
      userName: user?.name || user?.email || null,
      userRole: user?.role || null,
      serviceType,
      baseAmount,
      gstEnabled,
      gstPercent,
      gstAmount,
      totalAmount,
      currency,
      sellingPriceSnapshot: unitPrice,
      providerCostSnapshot: providerCost,
      creditsPurchased: quantity,
      packageId,
      packageName,
      status: 'ACTIVE',
      settlementStatus: 'PENDING',
      rawOrderResponse: redactPayload(cfOrder),
      notes: notes != null ? String(notes) : null,
    },
  });

  return {
    order: presentOrderForTenant(order),
    paymentSessionId: order.paymentSessionId,
    checkoutMode: cashfreePg.envMode(),
  };
}

/** Map a Cashfree order_status to our terminal/interim order status. */
function mapCfOrderStatus(cfStatus) {
  switch (String(cfStatus || '').toUpperCase()) {
    case 'PAID': return 'PAID';
    case 'EXPIRED': return 'EXPIRED';
    case 'TERMINATED':
    case 'TERMINATION_REQUESTED': return 'CANCELLED';
    case 'ACTIVE': return 'ACTIVE';
    default: return 'ACTIVE';
  }
}

/**
 * Verify with the gateway and settle if paid. Safe to call any number of
 * times from any trigger (client verify, webhook, approval, recovery sweep).
 *
 * Returns { order, outcome } where outcome ∈
 *   'CREDITED'          — this call granted the credits
 *   'ALREADY_SETTLED'   — a previous call did; nothing happened now
 *   'AWAITING_APPROVAL' — paid, held for Super Admin approval
 *   'PENDING'           — gateway does not report the order as paid yet
 *   'NOT_PAID'          — order expired/cancelled/failed
 *   'FLAGGED'           — paid but the gateway figures do not match ours
 */
async function verifyAndSettle(orderId, { trigger = 'manual', actorName = 'System' } = {}) {
  const order = await prisma.paymentOrder.findUnique({ where: { orderId } });
  if (!order) {
    const err = new Error('Payment order not found.');
    err.status = 404;
    throw err;
  }
  if (order.settlementStatus === 'CREDITED') {
    return { order, outcome: 'ALREADY_SETTLED' };
  }

  // ── 1. Gateway truth ───────────────────────────────────────────────────────
  const cfOrder = await cashfreePg.getOrder(orderId);
  const cfStatus = mapCfOrderStatus(cfOrder?.order_status);

  if (cfStatus !== 'PAID') {
    // Keep our row in step with the gateway, but never regress a PAID order.
    if (order.status !== 'PAID' && order.status !== cfStatus) {
      await prisma.paymentOrder.update({
        where: { orderId },
        data: { status: cfStatus, rawOrderResponse: redactPayload(cfOrder) },
      });
    }
    const refreshed = await prisma.paymentOrder.findUnique({ where: { orderId } });
    return { order: refreshed, outcome: cfStatus === 'ACTIVE' ? 'PENDING' : 'NOT_PAID' };
  }

  // ── 2. Amount / currency integrity ────────────────────────────────────────
  const paidAmount = Number(cfOrder.order_amount);
  const paidCurrency = String(cfOrder.order_currency || 'INR');
  if (Math.abs(paidAmount - order.totalAmount) > 0.009 || paidCurrency !== order.currency) {
    const flagReason = `Gateway reports ${paidCurrency} ${paidAmount}, order expects ${order.currency} ${order.totalAmount}.`;
    await prisma.paymentOrder.update({
      where: { orderId },
      data: { status: 'FLAGGED', flagReason, rawOrderResponse: redactPayload(cfOrder) },
    });
    const flagged = await prisma.paymentOrder.findUnique({ where: { orderId } });
    await notifySuperAdmins({
      title: 'Recharge payment flagged',
      message: `Order ${orderId} (company #${order.companyId}) was paid but the amounts do not match: ${flagReason} No credits were allocated.`,
      priority: 'high',
    }).catch(() => {});
    return { order: flagged, outcome: 'FLAGGED' };
  }

  // Successful payment details (for the record + invoice).
  let successPayment = null;
  try {
    const payments = await cashfreePg.getOrderPayments(orderId);
    successPayment = (Array.isArray(payments) ? payments : []).find(
      (p) => String(p?.payment_status || '').toUpperCase() === 'SUCCESS'
    ) || null;
  } catch (_) { /* payment details are enrichment, not a settlement gate */ }

  const paymentFields = {
    status: 'PAID',
    cfPaymentId: successPayment?.cf_payment_id != null ? String(successPayment.cf_payment_id) : order.cfPaymentId,
    paymentMethod: successPayment?.payment_group || order.paymentMethod,
    bankReference: successPayment?.bank_reference || order.bankReference,
    paymentTime: successPayment?.payment_completion_time ? new Date(successPayment.payment_completion_time) : (order.paymentTime || new Date()),
    rawOrderResponse: redactPayload(cfOrder),
    rawPaymentResponse: successPayment ? redactPayload(successPayment) : order.rawPaymentResponse,
  };

  // ── 3. Manual-approval hold (optional enterprise mode) ─────────────────────
  const settings = await rechargeSettings.getSettings();
  if (!settings.autoCreditAllocation && order.settlementStatus === 'PENDING') {
    const held = await prisma.paymentOrder.updateMany({
      where: { orderId, settlementStatus: 'PENDING' },
      data: { ...paymentFields, settlementStatus: 'AWAITING_APPROVAL' },
    });
    if (held.count === 1) {
      await notifySuperAdmins({
        title: 'Recharge awaiting approval',
        message: `Order ${orderId} (company #${order.companyId}) is paid — ${order.creditsPurchased} credits are awaiting your approval.`,
        priority: 'high',
      }).catch(() => {});
    }
    const heldOrder = await prisma.paymentOrder.findUnique({ where: { orderId } });
    return { order: heldOrder, outcome: heldOrder.settlementStatus === 'CREDITED' ? 'ALREADY_SETTLED' : 'AWAITING_APPROVAL' };
  }
  if (order.settlementStatus === 'AWAITING_APPROVAL') {
    // Paid + held: only approveSettlement() may proceed from here.
    await prisma.paymentOrder.update({ where: { orderId }, data: paymentFields }).catch(() => {});
    const heldOrder = await prisma.paymentOrder.findUnique({ where: { orderId } });
    return { order: heldOrder, outcome: 'AWAITING_APPROVAL' };
  }

  return settle(order, paymentFields, { fromStatus: 'PENDING', actorName, trigger });
}

/** Super Admin releases a held settlement. */
async function approveSettlement(orderId, approverName = 'Super Admin') {
  const order = await prisma.paymentOrder.findUnique({ where: { orderId } });
  if (!order) {
    const err = new Error('Payment order not found.');
    err.status = 404;
    throw err;
  }
  if (order.settlementStatus === 'CREDITED') return { order, outcome: 'ALREADY_SETTLED' };
  if (order.settlementStatus !== 'AWAITING_APPROVAL' || order.status !== 'PAID') {
    const err = new Error('Only paid orders awaiting approval can be approved.');
    err.status = 409;
    throw err;
  }
  return settle(order, { approvedBy: approverName, approvedAt: new Date() }, { fromStatus: 'AWAITING_APPROVAL', actorName: approverName, trigger: 'approval' });
}

/**
 * The one settlement path. The conditional updateMany on settlementStatus is
 * the idempotency gate; everything inside the transaction commits or rolls
 * back together. Credits are computed from the ORDER SNAPSHOT only.
 */
async function settle(order, extraOrderFields, { fromStatus, actorName, trigger }) {
  const handler = SETTLEMENT_HANDLERS[order.purpose];
  if (!handler) {
    const err = new Error(`No settlement handler for purpose ${order.purpose}.`);
    err.status = 500;
    throw err;
  }

  let settled = false;
  let handlerResult = null;

  await prisma.$transaction(async (tx) => {
    const gate = await tx.paymentOrder.updateMany({
      where: { orderId: order.orderId, settlementStatus: fromStatus },
      data: { settlementStatus: 'CREDITED', creditedAt: new Date(), ...extraOrderFields },
    });
    if (gate.count !== 1) return; // someone else settled (or is settling) — do nothing

    handlerResult = await handler.settle(tx, order, { actorName, trigger });
    if (handlerResult?.creditLedgerTxId) {
      await tx.paymentOrder.update({
        where: { orderId: order.orderId },
        data: { creditLedgerTxId: handlerResult.creditLedgerTxId },
      });
    }
    settled = true;
  });

  const finalOrder = await prisma.paymentOrder.findUnique({ where: { orderId: order.orderId } });
  if (!settled) return { order: finalOrder, outcome: 'ALREADY_SETTLED' };

  // Post-commit: invoice + notifications. Never allowed to affect the credits.
  try {
    await handler.afterCommit(finalOrder, handlerResult);
  } catch (e) {
    console.error(`[payments] post-settlement steps failed for ${order.orderId} (credits are safe):`, e.message);
  }
  return { order: await prisma.paymentOrder.findUnique({ where: { orderId: order.orderId } }), outcome: 'CREDITED', handlerResult };
}

/** Record a gateway refund. NEVER touches credits — Super Admin decides. */
async function recordRefund({ orderId, cfRefundId = null, amount, status = 'PENDING', reason = null, rawPayload = null }) {
  const order = await prisma.paymentOrder.findUnique({ where: { orderId } });
  if (!order) return null;

  let refund = null;
  if (cfRefundId) {
    refund = await prisma.paymentRefund.upsert({
      where: { cfRefundId: String(cfRefundId) },
      update: { status: String(status || 'PENDING'), rawPayload: redactPayload(rawPayload) },
      create: {
        orderId,
        cfRefundId: String(cfRefundId),
        companyId: order.companyId,
        amount: Number(amount) || order.totalAmount,
        status: String(status || 'PENDING'),
        reason,
        rawPayload: redactPayload(rawPayload),
      },
    });
  } else {
    refund = await prisma.paymentRefund.create({
      data: {
        orderId,
        companyId: order.companyId,
        amount: Number(amount) || order.totalAmount,
        status: String(status || 'PENDING'),
        reason,
        rawPayload: redactPayload(rawPayload),
      },
    });
  }

  await prisma.paymentOrder.update({ where: { orderId }, data: { status: 'REFUNDED' } }).catch(() => {});
  await notifySuperAdmins({
    title: 'Recharge payment refunded',
    message: `Order ${orderId} (company #${order.companyId}, ${order.creditsPurchased} credits) was refunded at the gateway. Credits were NOT auto-removed — review and adjust manually if appropriate.`,
    priority: 'high',
  }).catch(() => {});
  return refund;
}

async function notifySuperAdmins({ title, message, priority = 'high' }) {
  const { notifyMany } = require('../notificationService');
  const admins = await prisma.user.findMany({ where: { role: 'Super Admin' }, select: { id: true } });
  await notifyMany(admins.map((a) => a.id), { type: 'PAYMENT_ALERT', title, message, priority });
}

module.exports = {
  PURPOSE_RECHARGE,
  PURPOSE_SLOT_PURCHASE,
  PURPOSE_SUBSCRIPTION,
  createRechargeOrder,
  createPaymentOrderForPurpose,
  verifyAndSettle,
  approveSettlement,
  recordRefund,
  presentOrderForTenant,
  redactPayload,
  notifySuperAdmins,
};
