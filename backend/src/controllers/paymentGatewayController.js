/**
 * Self-Service Verification Credit Recharge — HTTP layer.
 *
 * Tenant endpoints resolve the company EXCLUSIVELY through
 * resolveWalletCompany(req) (branch workspace → parent company, scope-checked)
 * and then check order ownership against that resolved id. Client-supplied
 * company ids, wallet ids, credit counts and prices are never read.
 *
 * Company-facing responses NEVER contain the per-credit selling price, the
 * provider cost, or any margin figure — quotes return "amount → credits" only.
 */
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { resolveWalletCompany, isSuperAdmin } = require('../utils/verificationScope');
const cashfreePg = require('../services/payments/cashfreePgClient');
const rechargeSettings = require('../services/payments/rechargeSettingsService');
const paymentOrderService = require('../services/payments/paymentOrderService');
const rechargeInvoiceService = require('../services/payments/rechargeInvoiceService');
const AuditService = require('../services/auditService');
const { pageWindow, pageMeta } = require('../utils/pagination');

const audit = (req, action, targetId, details) => {
  if (req.user?.id) {
    AuditService.logAudit(req.user.id, action, 'VerificationRecharge', String(targetId), details || {}).catch(() => {});
  }
};

/** Tenant scope helper — resolved company or an error response (null return). */
const resolveTenant = (req, res) => {
  const scope = resolveWalletCompany(req);
  if (scope.error) {
    res.status(scope.status).json({ error: scope.error });
    return null;
  }
  return scope;
};

/** Recharge purchasing is a leadership action; Employees have no access at all. */
const canPurchase = (req) => ['Company Head', 'Super Admin'].includes(req.user?.role);
const canView = (req) => req.user?.role !== 'Employee';

// ─────────────────────────────────────────────────────────────────────────────
// Tenant: config / quote / order / verify / history / invoice
// ─────────────────────────────────────────────────────────────────────────────

exports.getRechargeConfig = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to verification credit recharge.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const config = await rechargeSettings.tenantConfig();
    res.json({ ...config, canPurchase: canPurchase(req) });
  } catch (e) {
    console.error('getRechargeConfig:', e);
    res.status(500).json({ error: 'Could not load recharge configuration.' });
  }
};

exports.quoteRecharge = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to verification credit recharge.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const settings = await rechargeSettings.getSettings();
    const quote = rechargeSettings.priceQuote(req.body?.amount, settings);
    if (!quote.ok) return res.status(422).json({ error: quote.error });
    // The quote shape is already tenant-safe (amount → credits, GST, total).
    res.json(quote);
  } catch (e) {
    console.error('quoteRecharge:', e);
    res.status(500).json({ error: 'Could not calculate the recharge quote.' });
  }
};

exports.createRechargeOrder = async (req, res) => {
  try {
    if (!canPurchase(req)) {
      return res.status(403).json({ error: 'Only a Company Head can purchase verification credits.' });
    }
    const scope = resolveTenant(req, res);
    if (!scope) return;

    // Branch/workspace provenance for the order record. The wallet company is
    // scope.companyId; a branch workspace keeps its branch id as provenance.
    const rawWorkspace = parseInt(req.headers['x-workspace-id'], 10) || null;
    const result = await paymentOrderService.createRechargeOrder({
      scope: {
        companyId: scope.companyId,
        branchId: rawWorkspace && rawWorkspace !== scope.companyId ? rawWorkspace : null,
        workspaceId: rawWorkspace,
        workspaceKind: req.headers['x-workspace-kind'] || null,
      },
      user: req.user,
      amount: req.body?.amount,
      packageId: req.body?.packageId || null,
    });
    audit(req, 'RECHARGE_ORDER_CREATED', result.order.orderId, {
      companyId: scope.companyId,
      amount: result.order.totalAmount,
      credits: result.order.creditsPurchased,
    });
    res.status(201).json(result);
  } catch (e) {
    console.error('createRechargeOrder:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not start the recharge payment.' });
  }
};

exports.verifyRechargeOrder = async (req, res) => {
  try {
    if (!canPurchase(req)) {
      return res.status(403).json({ error: 'Only a Company Head can verify a recharge payment.' });
    }
    const scope = resolveTenant(req, res);
    if (!scope) return;

    const order = await prisma.paymentOrder.findUnique({ where: { orderId: req.params.orderId } });
    if (!order || order.companyId !== scope.companyId) {
      // Not-found for foreign orders: existence is not disclosed across tenants.
      return res.status(404).json({ error: 'Payment order not found.' });
    }

    const { order: updated, outcome } = await paymentOrderService.verifyAndSettle(order.orderId, {
      trigger: 'client-verify',
      actorName: req.user?.name || req.user?.email || 'Company Head',
    });
    if (outcome === 'CREDITED') {
      audit(req, 'RECHARGE_SETTLED', order.orderId, { credits: updated.creditsPurchased, amount: updated.totalAmount });
    }

    // Fresh wallet figures so the UI can update without a second round trip.
    const wallet = await prisma.verificationCreditWallet.findUnique({
      where: { companyId_serviceType: { companyId: scope.companyId, serviceType: updated.serviceType || 'BANK_VERIFICATION' } },
    });
    res.json({
      outcome,
      order: paymentOrderService.presentOrderForTenant(updated),
      wallet: wallet
        ? { totalCredits: wallet.totalCredits, usedCredits: wallet.usedCredits, remainingCredits: wallet.remainingCredits, status: wallet.status }
        : null,
    });
  } catch (e) {
    console.error('verifyRechargeOrder:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not verify the payment. If you were charged, the credits will be added automatically shortly.' });
  }
};

exports.getRechargeHistory = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to recharge history.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const { page, take, skip } = pageWindow(req.query.page, req.query.pageSize || req.query.limit, 20);
    const where = { companyId: scope.companyId, purpose: paymentOrderService.PURPOSE_RECHARGE };
    const [total, rows] = await Promise.all([
      prisma.paymentOrder.count({ where }),
      prisma.paymentOrder.findMany({ where, orderBy: { id: 'desc' }, take, skip }),
    ]);
    const invoices = await prisma.verificationRechargeInvoice.findMany({
      where: { orderId: { in: rows.map((r) => r.orderId) } },
      select: { id: true, orderId: true, invoiceNo: true },
    });
    const invByOrder = new Map(invoices.map((i) => [i.orderId, i]));
    res.json({
      ...pageMeta(total, page, take),
      orders: rows.map((r) => ({
        ...paymentOrderService.presentOrderForTenant(r),
        invoice: invByOrder.get(r.orderId) || null,
      })),
    });
  } catch (e) {
    console.error('getRechargeHistory:', e);
    res.status(500).json({ error: 'Could not load recharge history.' });
  }
};

exports.downloadRechargeInvoice = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to recharge invoices.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const invoice = await prisma.verificationRechargeInvoice.findUnique({ where: { id: parseInt(req.params.id, 10) || 0 } });
    if (!invoice || (!isSuperAdmin(req) && invoice.companyId !== scope.companyId)) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }
    if (String(req.query.format || '').toLowerCase() === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(rechargeInvoiceService.renderInvoiceHtml(invoice));
    }
    const pdf = await rechargeInvoiceService.renderInvoicePdf(invoice);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNo}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (e) {
    console.error('downloadRechargeInvoice:', e);
    res.status(500).json({ error: 'Could not generate the invoice PDF.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Super Admin: settings / packages / orders / approval / refunds / dashboard
// (mounted behind requireSuperAdmin — role is already guaranteed here)
// ─────────────────────────────────────────────────────────────────────────────

exports.adminGetSettings = async (_req, res) => {
  try {
    const settings = await rechargeSettings.getSettings();
    const gatewayStatus = cashfreePg.configStatus(); // names only, never secret values
    res.json({ ...settings, gatewayConfigured: gatewayStatus.configured, gatewayMode: gatewayStatus.mode, gatewayStatus });
  } catch (e) {
    console.error('adminGetSettings:', e);
    res.status(500).json({ error: 'Could not load recharge settings.' });
  }
};

exports.adminUpdateSettings = async (req, res) => {
  try {
    const updated = await rechargeSettings.updateSettings(req.body || {}, req.user?.name || req.user?.email || 'Super Admin');
    audit(req, 'RECHARGE_SETTINGS_UPDATED', 'GLOBAL', req.body || {});
    const gatewayStatus = cashfreePg.configStatus();
    res.json({ ...updated, gatewayConfigured: gatewayStatus.configured, gatewayMode: gatewayStatus.mode, gatewayStatus });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.adminListPackages = async (_req, res) => {
  try {
    res.json(await rechargeSettings.listPackages({ activeOnly: false }));
  } catch (e) {
    res.status(500).json({ error: 'Could not load recharge packages.' });
  }
};

exports.adminSavePackage = async (req, res) => {
  try {
    const pkg = await rechargeSettings.savePackage({ ...req.body, id: req.params.id || req.body?.id || null });
    audit(req, 'RECHARGE_PACKAGE_SAVED', pkg.id, { name: pkg.name, amount: pkg.amount });
    res.json(pkg);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.adminDeletePackage = async (req, res) => {
  try {
    await rechargeSettings.deletePackage(req.params.id);
    audit(req, 'RECHARGE_PACKAGE_DELETED', req.params.id, {});
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Could not delete the package.' });
  }
};

exports.adminListOrders = async (req, res) => {
  try {
    const { page, take, skip } = pageWindow(req.query.page, req.query.pageSize || req.query.limit, 20);
    const where = { purpose: paymentOrderService.PURPOSE_RECHARGE };
    if (req.query.companyId) where.companyId = parseInt(req.query.companyId, 10) || 0;
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.settlementStatus) where.settlementStatus = String(req.query.settlementStatus);
    if (req.query.search) {
      where.OR = [
        { orderId: { contains: String(req.query.search) } },
        { cfPaymentId: { contains: String(req.query.search) } },
        { userName: { contains: String(req.query.search) } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.paymentOrder.count({ where }),
      prisma.paymentOrder.findMany({ where, orderBy: { id: 'desc' }, take, skip }),
    ]);
    const companies = await prisma.company.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.companyId))] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(companies.map((c) => [c.id, c.name]));
    // Full rows for Super Admin — including snapshots and margin per order.
    res.json({
      ...pageMeta(total, page, take),
      orders: rows.map((r) => ({
        ...r,
        companyName: nameById.get(r.companyId) || `Company #${r.companyId}`,
        marginAmount: rechargeSettings.r2(r.baseAmount - r.creditsPurchased * r.providerCostSnapshot),
      })),
    });
  } catch (e) {
    console.error('adminListOrders:', e);
    res.status(500).json({ error: 'Could not load payment orders.' });
  }
};

exports.adminApproveOrder = async (req, res) => {
  try {
    const approver = req.user?.name || req.user?.email || 'Super Admin';
    const { order, outcome } = await paymentOrderService.approveSettlement(req.params.orderId, approver);
    audit(req, 'RECHARGE_APPROVED', order.orderId, { outcome, credits: order.creditsPurchased });
    res.json({ outcome, order });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

exports.adminReverifyOrder = async (req, res) => {
  try {
    const { order, outcome } = await paymentOrderService.verifyAndSettle(req.params.orderId, {
      trigger: 'admin-reverify',
      actorName: req.user?.name || 'Super Admin',
    });
    audit(req, 'RECHARGE_REVERIFIED', order.orderId, { outcome });
    res.json({ outcome, order });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

exports.adminRegenerateInvoice = async (req, res) => {
  try {
    const invoice = await rechargeInvoiceService.createForOrder(req.params.orderId);
    audit(req, 'RECHARGE_INVOICE_REGENERATED', req.params.orderId, { invoiceNo: invoice.invoiceNo });
    res.json(invoice);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.adminListRefunds = async (req, res) => {
  try {
    const { page, take, skip } = pageWindow(req.query.page, req.query.pageSize, 20);
    const [total, rows] = await Promise.all([
      prisma.paymentRefund.count(),
      prisma.paymentRefund.findMany({ orderBy: { id: 'desc' }, take, skip }),
    ]);
    res.json({ ...pageMeta(total, page, take), refunds: rows });
  } catch (e) {
    res.status(500).json({ error: 'Could not load refunds.' });
  }
};

exports.adminMarkRefundAdjusted = async (req, res) => {
  try {
    const refund = await prisma.paymentRefund.update({
      where: { id: parseInt(req.params.id, 10) || 0 },
      data: {
        creditsAdjusted: true,
        adjustedBy: req.user?.name || req.user?.email || 'Super Admin',
        adjustedAt: new Date(),
      },
    });
    audit(req, 'RECHARGE_REFUND_ADJUSTED', refund.orderId, { refundId: refund.id });
    res.json(refund);
  } catch (e) {
    res.status(400).json({ error: 'Could not update the refund record.' });
  }
};

exports.adminDashboard = async (_req, res) => {
  try {
    const where = { purpose: paymentOrderService.PURPOSE_RECHARGE };
    const settled = { ...where, settlementStatus: 'CREDITED' };
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);

    const [agg, todayAgg, monthAgg, failedCount, pendingCount, awaitingApproval, flaggedCount, refundAgg, settledRows] = await Promise.all([
      prisma.paymentOrder.aggregate({ where: settled, _sum: { baseAmount: true, gstAmount: true, totalAmount: true, creditsPurchased: true }, _count: true }),
      prisma.paymentOrder.aggregate({ where: { ...settled, creditedAt: { gte: dayStart } }, _sum: { baseAmount: true }, _count: true }),
      prisma.paymentOrder.aggregate({ where: { ...settled, creditedAt: { gte: monthStart } }, _sum: { baseAmount: true }, _count: true }),
      prisma.paymentOrder.count({ where: { ...where, status: { in: ['FAILED', 'EXPIRED', 'CANCELLED'] } } }),
      prisma.paymentOrder.count({ where: { ...where, status: 'ACTIVE' } }),
      prisma.paymentOrder.count({ where: { ...where, settlementStatus: 'AWAITING_APPROVAL' } }),
      prisma.paymentOrder.count({ where: { ...where, status: 'FLAGGED' } }),
      prisma.paymentRefund.aggregate({ _sum: { amount: true }, _count: true }),
      prisma.paymentOrder.findMany({
        where: { ...settled, creditedAt: { gte: yearAgo } },
        select: { companyId: true, baseAmount: true, creditsPurchased: true, providerCostSnapshot: true, creditedAt: true },
      }),
    ]);

    // Margin uses each order's FROZEN provider-cost snapshot — reporting stays
    // truthful across historical price changes.
    const totalMargin = settledRows.reduce((s, r) => s + (r.baseAmount - r.creditsPurchased * r.providerCostSnapshot), 0);

    const monthly = new Map();
    const byCompany = new Map();
    for (const r of settledRows) {
      const d = new Date(r.creditedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const m = monthly.get(key) || { month: key, revenue: 0, credits: 0, margin: 0, orders: 0 };
      m.revenue += r.baseAmount;
      m.credits += r.creditsPurchased;
      m.margin += r.baseAmount - r.creditsPurchased * r.providerCostSnapshot;
      m.orders += 1;
      monthly.set(key, m);
      const c = byCompany.get(r.companyId) || { companyId: r.companyId, revenue: 0, credits: 0, orders: 0 };
      c.revenue += r.baseAmount;
      c.credits += r.creditsPurchased;
      c.orders += 1;
      byCompany.set(r.companyId, c);
    }
    const topCompanies = [...byCompany.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const companies = await prisma.company.findMany({
      where: { id: { in: topCompanies.map((c) => c.companyId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(companies.map((c) => [c.id, c.name]));

    const r2 = rechargeSettings.r2;
    res.json({
      totalRevenue: r2(agg._sum.baseAmount || 0),
      totalGstCollected: r2(agg._sum.gstAmount || 0),
      totalCollected: r2(agg._sum.totalAmount || 0),
      totalMargin: r2(totalMargin),
      creditsSold: agg._sum.creditsPurchased || 0,
      settledOrders: agg._count || 0,
      todayRevenue: r2(todayAgg._sum.baseAmount || 0),
      todayOrders: todayAgg._count || 0,
      monthRevenue: r2(monthAgg._sum.baseAmount || 0),
      monthOrders: monthAgg._count || 0,
      failedOrders: failedCount,
      pendingOrders: pendingCount,
      awaitingApproval,
      flaggedOrders: flaggedCount,
      refunds: { count: refundAgg._count || 0, amount: r2(refundAgg._sum.amount || 0) },
      monthlyRevenue: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, revenue: r2(m.revenue), margin: r2(m.margin) })),
      topCompanies: topCompanies.map((c) => ({ ...c, revenue: r2(c.revenue), companyName: nameById.get(c.companyId) || `Company #${c.companyId}` })),
    });
  } catch (e) {
    console.error('adminDashboard:', e);
    res.status(500).json({ error: 'Could not load the payments dashboard.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Webhook (public; mounted with express.raw BEFORE the JSON body parser)
// ─────────────────────────────────────────────────────────────────────────────

exports.cashfreeWebhook = async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const eventKey = String(req.headers['x-idempotency-key'] || crypto.createHash('sha256').update(rawBody).digest('hex'));

  const signatureValid = cashfreePg.verifyWebhookSignature({ signature, timestamp, rawBody });

  let payload = null;
  try { payload = JSON.parse(rawBody.toString('utf8')); } catch (_) { payload = null; }
  const eventType = payload?.type || null;
  const orderId = payload?.data?.order?.order_id || payload?.data?.refund?.order_id || null;
  const cfPaymentId = payload?.data?.payment?.cf_payment_id != null ? String(payload.data.payment.cf_payment_id) : null;

  // 1. Record the delivery. The unique eventKey is the replay gate: a
  //    duplicate insert means this exact delivery was already handled.
  let event;
  try {
    event = await prisma.paymentWebhookEvent.create({
      data: {
        eventKey,
        eventType,
        orderId,
        cfPaymentId,
        signatureValid,
        rawPayload: paymentOrderService.redactPayload(payload),
      },
    });
  } catch (e) {
    if (e?.code === 'P2002') {
      // Same delivery seen before. If it fully processed, acknowledge and stop.
      // If its processing previously FAILED, fall through and try again —
      // settlement idempotency (not this table) is what prevents double credits.
      const prior = await prisma.paymentWebhookEvent.findUnique({ where: { eventKey } }).catch(() => null);
      if (!prior || prior.processed) return res.status(200).json({ received: true, duplicate: true });
      event = prior;
    } else {
      console.error('cashfreeWebhook: could not record event:', e.message);
      return res.status(500).json({ error: 'Could not record the webhook event.' });
    }
  }

  if (!signatureValid) {
    // Stored for forensics, never processed.
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }

  // 2. Process. Settlement itself is idempotent, so even two deliveries with
  //    DIFFERENT eventKeys for the same payment cannot double-credit.
  let result = 'ignored';
  try {
    if (orderId && /^PAYMENT_/.test(String(eventType))) {
      const { outcome } = await paymentOrderService.verifyAndSettle(orderId, { trigger: 'webhook', actorName: 'Cashfree Webhook' });
      result = outcome;
    } else if (orderId && /REFUND/.test(String(eventType))) {
      const refund = payload?.data?.refund || {};
      await paymentOrderService.recordRefund({
        orderId,
        cfRefundId: refund.cf_refund_id,
        amount: refund.refund_amount,
        status: refund.refund_status || 'PENDING',
        reason: refund.refund_note || null,
        rawPayload: payload,
      });
      result = 'refund-recorded';
    }
    await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processed: true, processedAt: new Date(), processingResult: result },
    });
    return res.status(200).json({ received: true, result });
  } catch (e) {
    console.error(`cashfreeWebhook: processing failed for ${orderId}:`, e.message);
    await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processed: false, processingResult: `ERROR: ${e.message}` },
    }).catch(() => {});
    // 500 → Cashfree retries with a new delivery; settlement stays idempotent.
    return res.status(500).json({ error: 'Webhook processing failed; retry expected.' });
  }
};
