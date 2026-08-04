// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION BILLING (Super Admin) — the master billing center. Real, persisted
// GST invoices, each linked to a company + plan + headcount + billing cycle +
// payment status + renewal. Amounts are ALWAYS computed by the engine, never
// entered by hand. Distinct from the company-side Invoice module.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');
const AuditService = require('../services/auditService');
const emailService = require('../services/emailService');
const { DEFAULT_BRAND } = require('../services/emailBranding');
const store = require('../services/planStore');
const { ACTIVE_EMPLOYEE_WHERE } = require('../utils/employeeStatus');
const { pricePerEmployee } = require('../services/planEntitlements');
const { computeInvoice, periodEndFor, nextInvoiceNo, createInvoiceWithUniqueNo, r2 } = require('../services/subscriptionInvoiceEngine');
const { resolvePlaceOfSupply } = require('../utils/placeOfSupply');
const { renderInvoiceHtml } = require('../services/subscriptionInvoiceHtml');
const issuerStore = require('../services/invoiceIssuerStore');

// ── Invoice issuer settings (Super Admin customization) ──────────────────────
// Branding, statutory ids, bank details, signature, notes/terms, footer and
// invoice prefix used by the Subscription Billing invoice document.
exports.getSettings = (req, res) => {
  try {
    return res.json(issuerStore.getIssuer());
  } catch (e) {
    console.error('[subscriptionInvoices.getSettings]', e);
    return res.status(500).json({ error: 'Failed to load invoice settings.' });
  }
};

exports.updateSettings = (req, res) => {
  try {
    const saved = issuerStore.saveIssuer(req.body || {});
    if (req.user?.id) {
      AuditService.logAudit(req.user.id, 'UPDATE_INVOICE_SETTINGS', 'Subscription Billing', 'settings', {
        by: req.user?.name || req.user?.email || 'Super Admin',
      }).catch(() => {});
    }
    return res.json(saved);
  } catch (e) {
    console.error('[subscriptionInvoices.updateSettings]', e);
    return res.status(500).json({ error: e.message || 'Failed to save invoice settings.' });
  }
};

const actorOf = (req) => req.user?.name || req.user?.email || 'Super Admin';
const HEAD_OFFICE_WHERE = { parentCompanyId: null };
const LIFECYCLE = ['Draft', 'Pending', 'Paid', 'Overdue', 'Cancelled', 'Refunded'];

const countActive = (companyId) => prisma.employee.count({ where: { companyId: Number(companyId), ...ACTIVE_EMPLOYEE_WHERE } });
async function findHead(companyId) {
  return prisma.user.findFirst({ where: { companyId: Number(companyId), role: 'Company Head' }, select: { name: true, email: true }, orderBy: { id: 'asc' } });
}
const audit = (req, action, targetId, details) => {
  if (req.user?.id) AuditService.logAudit(req.user.id, action, 'SubscriptionBilling', String(targetId), { ...details, by: actorOf(req) }).catch(() => {});
};

// Renewal status derived from the billing period (presentation only).
function renewalStatus(inv) {
  if (!inv.periodEnd) return 'N/A';
  const end = new Date(inv.periodEnd).getTime();
  const now = Date.now();
  if (end < now) return 'Expired';
  if (end - now < 30 * 864e5) return 'Due Soon';
  return 'Active';
}
const withDerived = (inv) => ({ ...inv, balance: r2((inv.grandTotal || 0) - (inv.amountPaid || 0)), renewalStatus: renewalStatus(inv) });

// Auto-mark overdue: a Pending invoice past its due date reads as Overdue.
function effectiveStatus(inv) {
  if (inv.status === 'Pending' && inv.dueDate && new Date(inv.dueDate) < new Date()) return 'Overdue';
  return inv.status;
}

// ── Build the computed billing payload for a company (live data + overrides) ──
async function buildBillingPayload(companyId, body = {}) {
  const company = await prisma.company.findUnique({ where: { id: Number(companyId) } });
  if (!company) return { error: 'Company not found.' };
  const settings = store.getSettings();
  const plan = body.plan || company.plan || 'Free';
  const billingCycle = body.billingCycle || settings.defaultBillingCycle || 'Quarterly';
  const employeeCount = body.employeeCount != null ? Number(body.employeeCount) : await countActive(companyId);
  const rate = body.pricePerEmployee != null ? Number(body.pricePerEmployee) : pricePerEmployee(plan, billingCycle);
  const gstPercent = body.gstPercent != null ? Number(body.gstPercent) : (Number(settings.taxPercent) || 0);
  // ── Place of supply is DERIVED, never a checkbox ───────────────────────────
  // This was `!!body.interState`, defaulting to false — so an out-of-state
  // customer silently received CGST+SGST instead of IGST, and a regenerated
  // invoice could disagree with the quote it came from. It now resolves through
  // the same helper the payment-order path uses, from the issuer's state and the
  // customer's state, so quote and invoice always agree.
  const issuer = require('../services/invoiceIssuerStore').getIssuer();
  const pos = resolvePlaceOfSupply(issuer.state, company.state);
  const interState = pos.interState;
  if (pos.warning) {
    console.warn(`[subscription-invoice] company ${companyId}: ${pos.warning}`);
  }
  const discountPercent = Number(body.discountPercent) || 0;
  const { taxable, ...money } = computeInvoice({ employeeCount, pricePerEmployee: rate, discountPercent, gstPercent, interState });
  const head = await findHead(companyId);
  const invoiceDate = body.invoiceDate ? new Date(body.invoiceDate) : new Date();
  const periodStart = body.periodStart ? new Date(body.periodStart) : invoiceDate;
  const periodEnd = body.periodEnd ? new Date(body.periodEnd) : periodEndFor(periodStart, billingCycle);
  const dueDate = body.dueDate ? new Date(body.dueDate) : new Date(invoiceDate.getTime() + (Number(settings.gracePeriodDays) || 7) * 864e5);
  const addressBits = [company.billingAddress || company.address, company.city, company.state, company.pincode].filter(Boolean);
  return {
    company, head,
    data: {
      companyId: Number(companyId),
      companyName: company.name,
      companyHead: head?.name || company.adminName || null,
      companyEmail: head?.email || company.adminEmail || company.contactEmail || null,
      billingAddress: addressBits.join(', ') || null,
      gstin: company.gstNumber || null,
      plan, billingCycle, employeeCount, pricePerEmployee: rate,
      discountPercent, ...money,
      // Surfaced so the UI/report can show WHY this split was applied, and flag
      // the case where it could not be derived.
      placeOfSupply: {
        interState: pos.interState,
        gstType: pos.gstType,
        derivable: pos.derivable,
        supplierState: pos.supplierState,
        customerState: pos.customerState,
        warning: pos.warning,
      },
      periodStart, periodEnd, invoiceDate, dueDate,
      notes: body.notes ?? null, terms: body.terms ?? settings.invoiceTerms ?? null,
    },
  };
}

// ── GET /dashboard — summary cards ───────────────────────────────────────────
exports.dashboard = async (req, res) => {
  try {
    const invoices = await prisma.subscriptionInvoice.findMany();
    const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
    let totalRevenue = 0, monthlyRevenue = 0, annualRevenue = 0, outstanding = 0;
    let paid = 0, pending = 0, overdue = 0, upcomingRenewals = 0;
    for (const inv of invoices) {
      const st = effectiveStatus(inv);
      if (st === 'Paid') {
        totalRevenue += inv.amountPaid || inv.grandTotal;
        const d = new Date(inv.invoiceDate);
        if (d.getFullYear() === y) { annualRevenue += inv.amountPaid || inv.grandTotal; if (d.getMonth() === m) monthlyRevenue += inv.amountPaid || inv.grandTotal; }
        paid++;
      } else if (st === 'Overdue') { overdue++; outstanding += (inv.grandTotal || 0) - (inv.amountPaid || 0); }
      else if (st === 'Pending') { pending++; outstanding += (inv.grandTotal || 0) - (inv.amountPaid || 0); }
      if (inv.status !== 'Cancelled' && inv.periodEnd) {
        const end = new Date(inv.periodEnd).getTime();
        if (end >= now.getTime() && end - now.getTime() < 30 * 864e5) upcomingRenewals++;
      }
    }
    return res.json({
      totalRevenue: r2(totalRevenue), monthlyRevenue: r2(monthlyRevenue), annualRevenue: r2(annualRevenue),
      outstanding: r2(outstanding), paidInvoices: paid, pendingInvoices: pending, overdueInvoices: overdue,
      upcomingRenewals, totalInvoices: invoices.length, currency: 'INR',
    });
  } catch (e) { console.error('[subInvoice.dashboard]', e); return res.status(500).json({ error: 'Failed to load billing dashboard.' }); }
};

// ── GET / — invoice list (search + filters) ──────────────────────────────────
exports.list = async (req, res) => {
  try {
    const { search, plan, status, billingCycle, month, paymentStatus } = req.query;
    const where = {};
    if (plan && plan !== 'all') where.plan = plan;
    if (billingCycle && billingCycle !== 'all') where.billingCycle = billingCycle;
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.OR = [
        { companyName: { contains: String(search) } },
        { invoiceNo: { contains: String(search) } },
        { companyEmail: { contains: String(search) } },
      ];
    }
    let rows = await prisma.subscriptionInvoice.findMany({ where, orderBy: { id: 'desc' }, take: 1000 });
    if (month && month !== 'all') {
      rows = rows.filter((r) => { const d = new Date(r.invoiceDate); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month; });
    }
    let out = rows.map((r) => withDerived({ ...r, status: effectiveStatus(r) }));
    if (paymentStatus && paymentStatus !== 'all') out = out.filter((r) => r.status === paymentStatus);
    return res.json(out);
  } catch (e) { console.error('[subInvoice.list]', e); return res.status(500).json({ error: 'Failed to load invoices.' }); }
};

// ── POST /preview — compute totals for the form WITHOUT saving ────────────────
exports.preview = async (req, res) => {
  try {
    const built = await buildBillingPayload(req.body.companyId, req.body);
    if (built.error) return res.status(404).json({ error: built.error });
    return res.json(built.data);
  } catch (e) { console.error('[subInvoice.preview]', e); return res.status(500).json({ error: 'Failed to compute invoice.' }); }
};

// ── POST / — generate a real invoice ─────────────────────────────────────────
exports.generate = async (req, res) => {
  try {
    const built = await buildBillingPayload(req.body.companyId, req.body);
    if (built.error) return res.status(404).json({ error: built.error });
    const status = LIFECYCLE.includes(req.body.status) ? req.body.status : 'Pending';
    // Collision-safe: the unique index arbitrates and a clash simply retries with
    // the next number, so two simultaneous generates both succeed with distinct
    // numbers instead of one 500'ing with no invoice created.
    const inv = await createInvoiceWithUniqueNo(
      (invoiceNo) => ({ ...built.data, invoiceNo, status, createdBy: actorOf(req) }),
      { invoiceDate: built.data.invoiceDate, invoiceNo: req.body.invoiceNo }
    );
    audit(req, 'GENERATE_INVOICE', inv.id, { invoiceNo: inv.invoiceNo, company: inv.companyName, amount: inv.grandTotal });
    return res.status(201).json(withDerived(inv));
  } catch (e) { console.error('[subInvoice.generate]', e); return res.status(500).json({ error: 'Failed to generate invoice.' }); }
};

// ── GET /:id — invoice + payments ────────────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    const payments = await prisma.subscriptionInvoicePayment.findMany({ where: { invoiceId: id }, orderBy: { id: 'desc' } });
    return res.json({ ...withDerived({ ...inv, status: effectiveStatus(inv) }), payments });
  } catch (e) { console.error('[subInvoice.getOne]', e); return res.status(500).json({ error: 'Failed to load invoice.' }); }
};

// ── PUT /:id — edit invoice fields (recompute totals) ────────────────────────
exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    const b = req.body || {};
    const employeeCount = b.employeeCount != null ? Number(b.employeeCount) : inv.employeeCount;
    const pricePer = b.pricePerEmployee != null ? Number(b.pricePerEmployee) : inv.pricePerEmployee;
    const discountPercent = b.discountPercent != null ? Number(b.discountPercent) : inv.discountPercent;
    const gstPercent = b.gstPercent != null ? Number(b.gstPercent) : inv.gstPercent;
    const interState = b.interState != null ? !!b.interState : inv.interState;
    const { taxable, ...money } = computeInvoice({ employeeCount, pricePerEmployee: pricePer, discountPercent, gstPercent, interState });
    const data = {
      ...money, employeeCount, pricePerEmployee: pricePer, discountPercent,
      billingCycle: b.billingCycle || inv.billingCycle,
      plan: b.plan || inv.plan,
      notes: b.notes !== undefined ? b.notes : inv.notes,
      terms: b.terms !== undefined ? b.terms : inv.terms,
      dueDate: b.dueDate !== undefined ? (b.dueDate ? new Date(b.dueDate) : null) : inv.dueDate,
      invoiceDate: b.invoiceDate ? new Date(b.invoiceDate) : inv.invoiceDate,
      periodStart: b.periodStart ? new Date(b.periodStart) : inv.periodStart,
      periodEnd: b.periodEnd ? new Date(b.periodEnd) : inv.periodEnd,
      gstin: b.gstin !== undefined ? b.gstin : inv.gstin,
      billingAddress: b.billingAddress !== undefined ? b.billingAddress : inv.billingAddress,
    };
    if (LIFECYCLE.includes(b.status)) data.status = b.status;
    const updated = await prisma.subscriptionInvoice.update({ where: { id }, data });
    audit(req, 'EDIT_INVOICE', id, { invoiceNo: updated.invoiceNo, amount: updated.grandTotal });
    return res.json(withDerived(updated));
  } catch (e) { console.error('[subInvoice.update]', e); return res.status(500).json({ error: 'Failed to update invoice.' }); }
};

// ── POST /:id/status — mark Paid/Pending/Draft/Overdue/Cancelled/Refunded ────
exports.setStatus = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = req.body.status;
    if (!LIFECYCLE.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    const data = { status };
    // Marking Paid settles the invoice + records a payment for the balance.
    if (status === 'Paid') {
      data.amountPaid = inv.grandTotal;
      const bal = r2((inv.grandTotal || 0) - (inv.amountPaid || 0));
      if (bal > 0) {
        await prisma.subscriptionInvoicePayment.create({
          data: { invoiceId: id, companyId: inv.companyId, amount: bal, method: req.body.method || 'Manual', referenceNo: req.body.referenceNo || null, collectedBy: actorOf(req), notes: req.body.notes || 'Marked paid' },
        });
      }
    }
    if (status === 'Refunded') data.amountPaid = 0;
    const updated = await prisma.subscriptionInvoice.update({ where: { id }, data });
    audit(req, `INVOICE_${status.toUpperCase()}`, id, { invoiceNo: inv.invoiceNo, company: inv.companyName });
    return res.json(withDerived(updated));
  } catch (e) { console.error('[subInvoice.setStatus]', e); return res.status(500).json({ error: 'Failed to change status.' }); }
};

// ── POST /:id/payments — record a payment ────────────────────────────────────
exports.addPayment = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    const amount = r2(req.body.amount);
    if (!(amount > 0)) return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    await prisma.subscriptionInvoicePayment.create({
      data: { invoiceId: id, companyId: inv.companyId, amount, method: req.body.method || 'Bank Transfer', referenceNo: req.body.referenceNo || null, paidAt: req.body.paidAt ? new Date(req.body.paidAt) : new Date(), collectedBy: req.body.collectedBy || actorOf(req), notes: req.body.notes || null },
    });
    const amountPaid = r2((inv.amountPaid || 0) + amount);
    const status = amountPaid >= inv.grandTotal ? 'Paid' : inv.status === 'Draft' ? 'Pending' : inv.status;
    const updated = await prisma.subscriptionInvoice.update({ where: { id }, data: { amountPaid, status } });
    audit(req, 'INVOICE_PAYMENT', id, { invoiceNo: inv.invoiceNo, amount, paid: amountPaid });
    const payments = await prisma.subscriptionInvoicePayment.findMany({ where: { invoiceId: id }, orderBy: { id: 'desc' } });
    return res.json({ ...withDerived(updated), payments });
  } catch (e) { console.error('[subInvoice.addPayment]', e); return res.status(500).json({ error: 'Failed to record payment.' }); }
};

exports.payments = async (req, res) => {
  try {
    const payments = await prisma.subscriptionInvoicePayment.findMany({ where: { invoiceId: Number(req.params.id) }, orderBy: { id: 'desc' } });
    return res.json(payments);
  } catch (e) { console.error('[subInvoice.payments]', e); return res.status(500).json({ error: 'Failed to load payments.' }); }
};

// ── GET /payments — every payment received, newest first (READ-ONLY) ──────────
// Backs the Billing → Payments register. Purely a projection of rows that already
// exist: each SubscriptionInvoicePayment is stamped with its invoice's number,
// company and total so the list needs no N+1 lookups. Nothing is computed or
// changed here — recording a payment still goes exclusively through addPayment.
exports.allPayments = async (req, res) => {
  try {
    const take = Math.min(Number(req.query.limit) || 500, 1000);
    const payments = await prisma.subscriptionInvoicePayment.findMany({ orderBy: { id: 'desc' }, take });
    const invIds = [...new Set(payments.map((p) => p.invoiceId))];
    const invoices = invIds.length
      ? await prisma.subscriptionInvoice.findMany({
        where: { id: { in: invIds } },
        // dueDate is required — effectiveStatus() derives "Overdue" from it.
        select: { id: true, invoiceNo: true, companyId: true, companyName: true, plan: true, grandTotal: true, amountPaid: true, status: true, dueDate: true },
      })
      : [];
    const byId = new Map(invoices.map((i) => [i.id, i]));
    return res.json(payments.map((p) => {
      const inv = byId.get(p.invoiceId);
      return {
        ...p,
        invoiceNo: inv?.invoiceNo || `#${p.invoiceId}`,
        companyName: inv?.companyName || `Company #${p.companyId}`,
        plan: inv?.plan || null,
        invoiceTotal: inv?.grandTotal ?? null,
        invoiceStatus: inv ? effectiveStatus(inv) : null,
      };
    }));
  } catch (e) { console.error('[subInvoice.allPayments]', e); return res.status(500).json({ error: 'Failed to load payments.' }); }
};

// ── POST /:id/duplicate — copy as a new Draft ────────────────────────────────
exports.duplicate = async (req, res) => {
  try {
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id: Number(req.params.id) } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    const { id, invoiceNo, amountPaid, status, createdAt, updatedAt, ...rest } = inv;
    const copy = await createInvoiceWithUniqueNo(
      (newNo) => ({ ...rest, invoiceNo: newNo, status: 'Draft', amountPaid: 0, invoiceDate: new Date(), createdBy: actorOf(req) }),
      { invoiceDate: new Date() }
    );
    audit(req, 'DUPLICATE_INVOICE', copy.id, { from: invoiceNo, to: copy.invoiceNo });
    return res.status(201).json(withDerived(copy));
  } catch (e) { console.error('[subInvoice.duplicate]', e); return res.status(500).json({ error: 'Failed to duplicate invoice.' }); }
};

// ── POST /:id/regenerate — recompute amounts from the company's LIVE state ────
exports.regenerate = async (req, res) => {
  try {
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id: Number(req.params.id) } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    const built = await buildBillingPayload(inv.companyId, { billingCycle: inv.billingCycle, discountPercent: inv.discountPercent, gstPercent: inv.gstPercent, interState: inv.interState, invoiceDate: inv.invoiceDate, periodStart: inv.periodStart, periodEnd: inv.periodEnd, notes: inv.notes, terms: inv.terms });
    if (built.error) return res.status(404).json({ error: built.error });
    const { companyId, companyName, invoiceDate, periodStart, periodEnd, notes, terms, ...money } = built.data;
    const updated = await prisma.subscriptionInvoice.update({ where: { id: inv.id }, data: { ...money, companyName, companyId } });
    audit(req, 'REGENERATE_INVOICE', inv.id, { invoiceNo: inv.invoiceNo, amount: updated.grandTotal });
    return res.json(withDerived(updated));
  } catch (e) { console.error('[subInvoice.regenerate]', e); return res.status(500).json({ error: 'Failed to regenerate invoice.' }); }
};

// ── POST /:id/renew — generate the NEXT period's invoice ──────────────────────
exports.renew = async (req, res) => {
  try {
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id: Number(req.params.id) } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    const nextStart = inv.periodEnd ? new Date(inv.periodEnd) : new Date();
    const built = await buildBillingPayload(inv.companyId, { billingCycle: inv.billingCycle, discountPercent: inv.discountPercent, gstPercent: inv.gstPercent, interState: inv.interState, invoiceDate: new Date(), periodStart: nextStart });
    if (built.error) return res.status(404).json({ error: built.error });
    const renewal = await createInvoiceWithUniqueNo(
      (newNo) => ({ ...built.data, invoiceNo: newNo, status: 'Pending', createdBy: actorOf(req) }),
      { invoiceDate: new Date() }
    );
    // Push the company's subscription renewalDate forward too (best effort).
    await prisma.companySubscription.update({ where: { companyId: inv.companyId }, data: { renewalDate: renewal.periodEnd } }).catch(() => {});
    audit(req, 'RENEW_INVOICE', renewal.id, { from: inv.invoiceNo, to: renewal.invoiceNo, company: renewal.companyName });
    return res.status(201).json(withDerived(renewal));
  } catch (e) { console.error('[subInvoice.renew]', e); return res.status(500).json({ error: 'Failed to generate renewal invoice.' }); }
};

// ── POST /:id/email — send the invoice to the company ────────────────────────
exports.email = async (req, res) => {
  try {
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id: Number(req.params.id) } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    const to = (req.body.to && String(req.body.to).trim()) || inv.companyEmail;
    if (!to) return res.status(400).json({ error: 'No recipient email on file for this company.' });
    const html = renderInvoiceHtml(inv, { settings: store.getSettings() });
    // A SUBSCRIPTION invoice comes from the PLATFORM, not from the customer, so
    // the sender is the configured issuer (Super Admin → Invoice Settings),
    // falling back to ZeniaHR — never a hardcoded name.
    const issuerName = (require('../services/invoiceIssuerStore').getIssuer().name || '').trim();
    const result = await emailService.sendMail({
      branding: { ...DEFAULT_BRAND, name: issuerName || DEFAULT_BRAND.name },
      to, subject: `Invoice ${inv.invoiceNo} — ${store.getSettings().currency || 'INR'} ${inv.grandTotal.toLocaleString('en-IN')}`,
      text: `Please find your subscription invoice ${inv.invoiceNo} for ${inv.companyName}. Amount due: ${inv.grandTotal}.`,
      html,
    });
    audit(req, 'EMAIL_INVOICE', inv.id, { invoiceNo: inv.invoiceNo, to, delivered: result.delivered });
    if (!result.configured) return res.status(200).json({ delivered: false, devMode: true, message: `Email logged (SMTP not configured). Would send to ${to}.` });
    if (!result.delivered) return res.status(502).json({ error: result.error || 'Email provider rejected the message.' });
    return res.json({ delivered: true, to });
  } catch (e) { console.error('[subInvoice.email]', e); return res.status(500).json({ error: 'Failed to email invoice.' }); }
};

// ── GET /:id/html — server-rendered A4 invoice (email/print fallback) ─────────
exports.html = async (req, res) => {
  try {
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id: Number(req.params.id) } });
    if (!inv) return res.status(404).send('Invoice not found.');
    audit(req, 'DOWNLOAD_INVOICE', inv.id, { invoiceNo: inv.invoiceNo });
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderInvoiceHtml(inv, { settings: store.getSettings() }));
  } catch (e) { console.error('[subInvoice.html]', e); return res.status(500).send('Failed to render invoice.'); }
};

// ── DELETE /:id — remove an invoice (Draft/Cancelled only) ────────────────────
exports.remove = async (req, res) => {
  try {
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id: Number(req.params.id) } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    if (!['Draft', 'Cancelled'].includes(inv.status)) return res.status(400).json({ error: 'Only Draft or Cancelled invoices can be deleted. Cancel it first.' });
    await prisma.subscriptionInvoicePayment.deleteMany({ where: { invoiceId: inv.id } });
    await prisma.subscriptionInvoice.delete({ where: { id: inv.id } });
    audit(req, 'DELETE_INVOICE', inv.id, { invoiceNo: inv.invoiceNo });
    return res.json({ ok: true });
  } catch (e) { console.error('[subInvoice.remove]', e); return res.status(500).json({ error: 'Failed to delete invoice.' }); }
};

// ── GET /company/:companyId — per-company billing page ───────────────────────
exports.companyBilling = async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    const [sub, invoices, head] = await Promise.all([
      prisma.companySubscription.findUnique({ where: { companyId } }).catch(() => null),
      prisma.subscriptionInvoice.findMany({ where: { companyId }, orderBy: { id: 'desc' } }),
      findHead(companyId),
    ]);
    const invIds = invoices.map((i) => i.id);
    const payments = invIds.length ? await prisma.subscriptionInvoicePayment.findMany({ where: { invoiceId: { in: invIds } }, orderBy: { id: 'desc' } }) : [];
    const outstanding = r2(invoices.reduce((s, i) => (['Pending', 'Overdue'].includes(effectiveStatus(i)) ? s + (i.grandTotal - i.amountPaid) : s), 0));
    return res.json({
      company: { id: company.id, name: company.name, plan: company.plan, head: head?.name, email: head?.email || company.adminEmail, gstin: company.gstNumber },
      subscription: sub,
      invoices: invoices.map((i) => withDerived({ ...i, status: effectiveStatus(i) })),
      payments, outstanding,
      upcomingRenewal: sub?.renewalDate || (invoices[0]?.periodEnd ?? null),
    });
  } catch (e) { console.error('[subInvoice.companyBilling]', e); return res.status(500).json({ error: 'Failed to load company billing.' }); }
};

// ── GET /reports — billing / revenue / outstanding / GST summary / register ──
exports.reports = async (req, res) => {
  try {
    const invoices = await prisma.subscriptionInvoice.findMany({ orderBy: { invoiceDate: 'asc' } });
    const paid = invoices.filter((i) => effectiveStatus(i) === 'Paid');
    // Revenue by month (paid).
    const revByMonth = {};
    for (const i of paid) { const d = new Date(i.invoiceDate); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; revByMonth[k] = r2((revByMonth[k] || 0) + (i.amountPaid || i.grandTotal)); }
    const revenueByMonth = Object.entries(revByMonth).map(([month, amount]) => ({ month, amount }));
    // Revenue by year.
    const revByYear = {};
    for (const i of paid) { const y = new Date(i.invoiceDate).getFullYear(); revByYear[y] = r2((revByYear[y] || 0) + (i.amountPaid || i.grandTotal)); }
    const revenueByYear = Object.entries(revByYear).map(([year, amount]) => ({ year, amount }));
    // Outstanding by company.
    const outByCo = {};
    for (const i of invoices) { const st = effectiveStatus(i); if (['Pending', 'Overdue'].includes(st)) { const k = i.companyName || `#${i.companyId}`; outByCo[k] = r2((outByCo[k] || 0) + (i.grandTotal - i.amountPaid)); } }
    const outstandingByCompany = Object.entries(outByCo).map(([company, amount]) => ({ company, amount })).sort((a, b) => b.amount - a.amount);
    // GST summary.
    const gstSummary = invoices.reduce((a, i) => {
      if (i.status === 'Cancelled') return a;
      a.taxable = r2(a.taxable + (i.subtotal - i.discountAmount)); a.cgst = r2(a.cgst + i.cgst); a.sgst = r2(a.sgst + i.sgst); a.igst = r2(a.igst + i.igst); a.gst = r2(a.gst + i.gstAmount); a.grand = r2(a.grand + i.grandTotal); return a;
    }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, grand: 0 });
    return res.json({
      revenueByMonth, revenueByYear, outstandingByCompany, gstSummary,
      register: invoices.map((i) => withDerived({ ...i, status: effectiveStatus(i) })),
      totals: { invoices: invoices.length, paid: paid.length, revenue: r2(paid.reduce((s, i) => s + (i.amountPaid || i.grandTotal), 0)) },
    });
  } catch (e) { console.error('[subInvoice.reports]', e); return res.status(500).json({ error: 'Failed to load billing reports.' }); }
};
