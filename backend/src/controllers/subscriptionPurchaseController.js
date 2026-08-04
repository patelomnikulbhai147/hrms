/**
 * Subscription Purchase — HTTP layer for the self-service upgrade wizard.
 *
 * Tenant identity resolves EXCLUSIVELY from the authenticated session via
 * resolveWalletCompany (branch → head, scope-checked). The client can only ever
 * send { planKey, billingCycle, employeeCount }; plan, price, discount, GST and
 * limits are computed server-side and frozen onto the payment order.
 */
const prisma = require('../config/prisma');
const { resolveWalletCompany } = require('../utils/verificationScope');
const purchaseService = require('../services/subscriptionPurchaseService');
const paymentOrderService = require('../services/payments/paymentOrderService');
const AuditService = require('../services/auditService');

const audit = (req, action, targetId, details) => {
  if (req.user?.id) {
    AuditService.logAudit(req.user.id, action, 'Subscriptions', String(targetId), details || {}).catch(() => {});
  }
};

const resolveTenant = (req, res) => {
  const scope = resolveWalletCompany(req);
  if (scope.error) {
    res.status(scope.status).json({ error: scope.error });
    return null;
  }
  return scope;
};

const canPurchase = (req) => ['Company Head', 'Super Admin'].includes(req.user?.role);
const canView = (req) => req.user?.role !== 'Employee';

exports.getContext = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to subscription management.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const context = await purchaseService.getWizardContext(scope.companyId);
    res.json({ ...context, canPurchase: canPurchase(req) });
  } catch (e) {
    console.error('subscription-purchase getContext:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not load subscription information.' });
  }
};

exports.quote = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to subscription management.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const quote = await purchaseService.quoteSubscription(scope.companyId, {
      planKey: req.body?.planKey,
      billingCycle: req.body?.billingCycle,
      employeeCount: req.body?.employeeCount,
    });
    if (!quote.ok) return res.status(422).json({ error: quote.error, code: quote.code, minEmployees: quote.minEmployees, planMax: quote.planMax });
    res.json(quote);
  } catch (e) {
    console.error('subscription-purchase quote:', e);
    res.status(500).json({ error: 'Could not calculate the subscription quote.' });
  }
};

exports.createOrder = async (req, res) => {
  try {
    if (!canPurchase(req)) return res.status(403).json({ error: 'Only a Company Head can purchase a subscription.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const rawWorkspace = parseInt(req.headers['x-workspace-id'], 10) || null;
    const result = await purchaseService.createSubscriptionOrder({
      scope: {
        companyId: scope.companyId,
        branchId: rawWorkspace && rawWorkspace !== scope.companyId ? rawWorkspace : null,
        workspaceId: rawWorkspace,
        workspaceKind: req.headers['x-workspace-kind'] || null,
      },
      user: req.user,
      planKey: req.body?.planKey,
      billingCycle: req.body?.billingCycle,
      employeeCount: req.body?.employeeCount,
    });
    audit(req, 'SUBSCRIPTION_ORDER_CREATED', result.order.orderId, {
      companyId: scope.companyId,
      amount: result.order.totalAmount,
      plan: req.body?.planKey,
      billingCycle: req.body?.billingCycle,
      employees: req.body?.employeeCount,
    });
    res.status(201).json(result);
  } catch (e) {
    if (e.status === 422) {
      return res.status(422).json({ error: e.message, code: e.code });
    }
    console.error('subscription-purchase createOrder:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not start the subscription purchase.' });
  }
};

exports.verifyOrder = async (req, res) => {
  try {
    if (!canPurchase(req)) return res.status(403).json({ error: 'Only a Company Head can verify a subscription purchase.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const order = await prisma.paymentOrder.findUnique({ where: { orderId: req.params.orderId } });
    if (!order || order.companyId !== scope.companyId || order.purpose !== paymentOrderService.PURPOSE_SUBSCRIPTION) {
      return res.status(404).json({ error: 'Payment order not found.' });
    }
    const { order: updated, outcome } = await paymentOrderService.verifyAndSettle(order.orderId, {
      trigger: 'client-verify',
      actorName: req.user?.name || req.user?.email || 'Company Head',
    });
    if (outcome === 'CREDITED') {
      audit(req, 'SUBSCRIPTION_PURCHASE_SETTLED', order.orderId, { amount: updated.totalAmount });
    }
    // Fresh context so the UI (plan, limit, renewal, credits) updates without a
    // second round trip; the client also refetches its auth profile.
    const context = await purchaseService.getWizardContext(scope.companyId).catch(() => null);
    res.json({ outcome, order: paymentOrderService.presentOrderForTenant(updated), current: context?.current ?? null });
  } catch (e) {
    console.error('subscription-purchase verifyOrder:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not verify the payment. If you were charged, the upgrade will be applied automatically shortly.' });
  }
};

// One unified billing history: every self-service payment (subscription,
// employee slots, verification credits, future add-ons) for this tenant.
exports.getHistory = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to billing history.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const orders = await prisma.paymentOrder.findMany({
      where: { companyId: scope.companyId },
      orderBy: { id: 'desc' },
      take: 100,
    });
    const orderIds = orders.map((o) => o.orderId);
    const invoices = orderIds.length
      ? await prisma.verificationRechargeInvoice.findMany({
          where: { orderId: { in: orderIds } },
          select: { id: true, orderId: true, invoiceNo: true, purpose: true },
        })
      : [];
    const invByOrder = new Map(invoices.map((i) => [i.orderId, i]));
    res.json({
      history: orders.map((o) => ({
        ...paymentOrderService.presentOrderForTenant(o),
        invoice: invByOrder.get(o.orderId) || null,
      })),
    });
  } catch (e) {
    console.error('subscription-purchase getHistory:', e);
    res.status(500).json({ error: 'Could not load billing history.' });
  }
};
