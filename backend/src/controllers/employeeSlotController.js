/**
 * Employee Slot Management — HTTP layer.
 *
 * Tenant identity resolves EXCLUSIVELY from the authenticated session via
 * resolveWalletCompany (branch → head, scope-checked). Slot limits can only be
 * raised by a settled payment or a Super Admin — no company-facing endpoint
 * writes a limit, and client-supplied company/limit values are never read.
 */
const prisma = require('../config/prisma');
const { resolveWalletCompany } = require('../utils/verificationScope');
const slotService = require('../services/employeeSlotService');
const paymentOrderService = require('../services/payments/paymentOrderService');
const { getCapacity, resolveHead } = require('../services/employeeLimitService');
const AuditService = require('../services/auditService');

const audit = (req, action, targetId, details) => {
  if (req.user?.id) {
    AuditService.logAudit(req.user.id, action, 'EmployeeSlots', String(targetId), details || {}).catch(() => {});
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

// ─────────────────────────────────────────────────────────────────────────────
// Company endpoints
// ─────────────────────────────────────────────────────────────────────────────

exports.getOverview = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to employee slot management.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const overview = await slotService.getOverview(scope.companyId);
    res.json({ ...overview, canPurchase: canPurchase(req) });
  } catch (e) {
    console.error('slots getOverview:', e);
    res.status(500).json({ error: 'Could not load employee slot information.' });
  }
};

// Server-side quote for the live breakdown (tier, rate, GST split, totals).
// The client sends ONE number (slots); everything else is computed here.
exports.quote = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to employee slot management.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const quote = await slotService.quoteSlots(scope.companyId, req.body?.slots);
    if (!quote.ok) return res.status(422).json({ error: quote.error, code: quote.code });
    res.json(quote);
  } catch (e) {
    console.error('slots quote:', e);
    res.status(500).json({ error: 'Could not calculate the slot quote.' });
  }
};

exports.createOrder = async (req, res) => {
  try {
    if (!canPurchase(req)) return res.status(403).json({ error: 'Only a Company Head can purchase employee slots.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const rawWorkspace = parseInt(req.headers['x-workspace-id'], 10) || null;
    const result = await slotService.createSlotOrder({
      scope: {
        companyId: scope.companyId,
        branchId: rawWorkspace && rawWorkspace !== scope.companyId ? rawWorkspace : null,
        workspaceId: rawWorkspace,
        workspaceKind: req.headers['x-workspace-kind'] || null,
      },
      user: req.user,
      slots: req.body?.slots ?? null,
      packId: req.body?.packId ?? null,
    });
    audit(req, 'SLOT_ORDER_CREATED', result.order.orderId, { companyId: scope.companyId, amount: result.order.totalAmount, slots: result.order.creditsPurchased });
    res.status(201).json(result);
  } catch (e) {
    if (e.code === 'SUBSCRIPTION_EXPIRED') {
      return res.status(422).json({ error: e.message, code: 'SUBSCRIPTION_EXPIRED' });
    }
    console.error('slots createOrder:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not start the slot purchase.' });
  }
};

exports.verifyOrder = async (req, res) => {
  try {
    if (!canPurchase(req)) return res.status(403).json({ error: 'Only a Company Head can verify a slot purchase.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const order = await prisma.paymentOrder.findUnique({ where: { orderId: req.params.orderId } });
    if (!order || order.companyId !== scope.companyId || order.purpose !== paymentOrderService.PURPOSE_SLOT_PURCHASE) {
      return res.status(404).json({ error: 'Payment order not found.' });
    }
    const { order: updated, outcome } = await paymentOrderService.verifyAndSettle(order.orderId, {
      trigger: 'client-verify',
      actorName: req.user?.name || req.user?.email || 'Company Head',
    });
    if (outcome === 'CREDITED') {
      audit(req, 'SLOT_PURCHASE_SETTLED', order.orderId, { slots: updated.creditsPurchased, amount: updated.totalAmount });
    }
    // Fresh capacity so the UI updates without a second round trip.
    const capacity = await getCapacity(scope.companyId);
    res.json({ outcome, order: paymentOrderService.presentOrderForTenant(updated), capacity });
  } catch (e) {
    console.error('slots verifyOrder:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not verify the payment. If you were charged, the slots will be added automatically shortly.' });
  }
};

exports.requestManual = async (req, res) => {
  try {
    if (!canPurchase(req)) return res.status(403).json({ error: 'Only a Company Head can request additional employee slots.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const row = await slotService.requestManualPurchase({
      scope, user: req.user, packId: req.body?.packId || null, slots: req.body?.slots || null, note: req.body?.note || '',
    });
    audit(req, 'SLOT_REQUEST_FILED', row.id, { slots: row.slots, pack: row.packName });
    res.status(201).json({ ...row, contact: slotService.salesContact() });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

// Feeds the dedicated Employee Slot History page: the full transaction log
// (not the modal's 50-row slice), invoice + payment pointers per row, and a
// pre-computed summary for the page's stat cards. Read-only; tenant-internal
// fields only (never provider cost or raw gateway payloads).
exports.getHistory = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to slot purchase history.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const head = await resolveHead(scope.companyId);
    const [capacity, rows] = await Promise.all([
      getCapacity(scope.companyId),
      head
        ? prisma.employeeSlotTransaction.findMany({ where: { companyId: head.id }, orderBy: { id: 'desc' }, take: 1000 })
        : [],
    ]);
    // Attach invoice + payment pointers for online purchases.
    const orderIds = rows.map((h) => h.orderId).filter(Boolean);
    const [invoices, orders] = await Promise.all([
      orderIds.length
        ? prisma.verificationRechargeInvoice.findMany({ where: { orderId: { in: orderIds } }, select: { id: true, orderId: true, invoiceNo: true } })
        : [],
      orderIds.length
        ? prisma.paymentOrder.findMany({
            where: { orderId: { in: orderIds } },
            select: {
              orderId: true, status: true, settlementStatus: true, paymentMethod: true,
              bankReference: true, cfPaymentId: true, paymentTime: true, creditedAt: true,
              baseAmount: true, gstEnabled: true, gstPercent: true, gstAmount: true,
              totalAmount: true, currency: true,
            },
          })
        : [],
    ]);
    const invByOrder = new Map(invoices.map((i) => [i.orderId, i]));
    const payByOrder = new Map(orders.map((o) => [o.orderId, o]));

    // Summary for the page's stat cards — settled rows only (rows are id-desc,
    // so the first settled purchase row IS the most recent one).
    const settled = rows.filter((r) => r.status === 'COMPLETED' || r.status === 'APPROVED');
    const purchases = settled.filter((r) => (r.slots || 0) > 0);
    const summary = {
      totalPurchasedSlots: purchases.reduce((a, r) => a + r.slots, 0),
      totalAmountSpent: settled.reduce((a, r) => a + (Number(r.amount) || 0), 0),
      lastPurchaseAt: purchases.length ? purchases[0].createdAt : null,
      transactionCount: rows.length,
    };

    res.json({
      capacity,
      summary,
      history: rows.map((h) => ({
        ...h,
        invoice: h.orderId ? invByOrder.get(h.orderId) || null : null,
        payment: h.orderId ? payByOrder.get(h.orderId) || null : null,
      })),
    });
  } catch (e) {
    console.error('slots getHistory:', e);
    res.status(500).json({ error: 'Could not load slot purchase history.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Super Admin endpoints (router is hard-gated with requireSuperAdmin)
// ─────────────────────────────────────────────────────────────────────────────

exports.adminListPacks = async (_req, res) => {
  try {
    res.json(await prisma.employeeSlotPack.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }));
  } catch (e) {
    res.status(500).json({ error: 'Could not load slot packs.' });
  }
};

exports.adminSavePack = async (req, res) => {
  try {
    const b = req.body || {};
    const slots = parseInt(b.slots, 10);
    const price = Number(b.price);
    if (!String(b.name || '').trim()) return res.status(400).json({ error: 'Pack name is required.' });
    if (!Number.isFinite(slots) || slots < 1) return res.status(400).json({ error: 'Slots must be a positive whole number.' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Price must be zero or a positive number.' });
    const data = { name: String(b.name).trim(), slots, price, isActive: b.isActive !== false, sortOrder: parseInt(b.sortOrder, 10) || 0 };
    const id = parseInt(req.params.id || b.id, 10) || null;
    const pack = id
      ? await prisma.employeeSlotPack.update({ where: { id }, data })
      : await prisma.employeeSlotPack.create({ data });
    audit(req, 'SLOT_PACK_SAVED', pack.id, data);
    res.json(pack);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.adminDeletePack = async (req, res) => {
  try {
    await prisma.employeeSlotPack.delete({ where: { id: parseInt(req.params.id, 10) || 0 } });
    audit(req, 'SLOT_PACK_DELETED', req.params.id, {});
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Could not delete the pack.' });
  }
};

exports.adminListRequests = async (_req, res) => {
  try {
    const rows = await prisma.employeeSlotTransaction.findMany({
      where: { type: 'MANUAL_REQUEST', status: 'REQUESTED' },
      orderBy: { id: 'asc' },
    });
    const companies = await prisma.company.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.companyId))] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(companies.map((c) => [c.id, c.name]));
    res.json(rows.map((r) => ({ ...r, companyName: nameById.get(r.companyId) || `Company #${r.companyId}` })));
  } catch (e) {
    res.status(500).json({ error: 'Could not load slot requests.' });
  }
};

exports.adminApproveRequest = async (req, res) => {
  try {
    const result = await slotService.approveRequest(req.params.id, req.user?.name || req.user?.email || 'Super Admin');
    audit(req, 'SLOT_REQUEST_APPROVED', req.params.id, { oldLimit: result.oldLimit, newLimit: result.newLimit });
    res.json({ success: true, oldLimit: result.oldLimit, newLimit: result.newLimit });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

exports.adminRejectRequest = async (req, res) => {
  try {
    const row = await slotService.rejectRequest(req.params.id, req.user?.name || 'Super Admin', req.body?.reason);
    audit(req, 'SLOT_REQUEST_REJECTED', req.params.id, { reason: req.body?.reason });
    res.json(row);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

exports.adminAdjust = async (req, res) => {
  try {
    const companyId = parseInt(req.body?.companyId, 10);
    if (!companyId) return res.status(400).json({ error: 'companyId is required.' });
    const result = await slotService.adjustSlots({
      companyId, delta: req.body?.delta, reason: req.body?.reason,
      actor: req.user?.name || req.user?.email || 'Super Admin',
    });
    audit(req, 'SLOT_MANUAL_ADJUST', companyId, { delta: req.body?.delta, reason: req.body?.reason, oldLimit: result.oldLimit, newLimit: result.newLimit });
    res.json({ success: true, oldLimit: result.oldLimit, newLimit: result.newLimit, extraSlots: result.newExtra });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

exports.adminListTransactions = async (req, res) => {
  try {
    const where = {};
    if (req.query.companyId) where.companyId = parseInt(req.query.companyId, 10) || 0;
    if (req.query.type) where.type = String(req.query.type);
    const rows = await prisma.employeeSlotTransaction.findMany({ where, orderBy: { id: 'desc' }, take: 200 });
    const companies = await prisma.company.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.companyId))] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(companies.map((c) => [c.id, c.name]));
    res.json(rows.map((r) => ({ ...r, companyName: nameById.get(r.companyId) || `Company #${r.companyId}` })));
  } catch (e) {
    res.status(500).json({ error: 'Could not load slot transactions.' });
  }
};

exports.adminUsage = async (_req, res) => {
  try {
    const heads = await prisma.company.findMany({
      where: { parentCompanyId: null, isArchived: false },
      select: { id: true, name: true, plan: true },
      orderBy: { id: 'asc' },
    });
    const usage = [];
    for (const h of heads) {
      const cap = await getCapacity(h.id);
      usage.push({
        companyId: h.id, companyName: h.name, plan: cap.plan,
        baseLimit: cap.baseLimit, extraSlots: cap.extraSlots, limit: cap.limit,
        used: cap.current, remaining: cap.unlimited ? null : cap.remaining, unlimited: cap.unlimited,
      });
    }
    res.json(usage);
  } catch (e) {
    console.error('slots adminUsage:', e);
    res.status(500).json({ error: 'Could not load slot usage.' });
  }
};
