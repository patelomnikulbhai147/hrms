/**
 * Invoice Management — invoices (with line items), payments, dashboard & status
 * workflow. Company-scoped (RULE 5), role-gated. Fully isolated: touches only
 * invoice_* tables — no Payroll/Attendance/Employee/Reports impact.
 *
 * Money is ALWAYS recomputed server-side (services/invoiceCalc) so the DB can
 * never hold a wrong/negative total. Invoice numbers are unique per company.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const calc = require('../services/invoiceCalc');
const { canView, canEdit, canManage, actorOf, targetCompanyId, scopedWhere, isSuperAdmin } = require('../utils/invoiceScope');

const STATUSES = ['Draft', 'Generated', 'Sent', 'Viewed', 'Partially Paid', 'Paid', 'Closed', 'Cancelled'];
const audit = (companyId, invoiceId, action, by, details) =>
  prisma.invoiceAudit.create({ data: { companyId, entityType: 'Invoice', entityId: invoiceId, invoiceId, action, performedBy: by, details: details ? String(details).slice(0, 2000) : null } }).catch(() => {});

// Resolve the company's home state (to decide intra vs inter-state GST) from the
// invoice settings GSTIN state code, else the Company record. Best-effort only.
async function companyState(companyId) {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { state: true } }).catch(() => null);
  return (c && c.state) || null;
}

// Recompute + persist an invoice's payment rollup and derived status.
async function recalcPayments(invoice) {
  const pays = await prisma.invoicePayment.findMany({ where: { invoiceId: invoice.id, status: { in: ['Paid', 'Partial'] } } });
  const amountPaid = calc.r2(pays.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const balanceDue = calc.r2(Math.max(0, invoice.grandTotal - amountPaid));
  // Don't override a manually Cancelled/Closed invoice's lifecycle status.
  let status = invoice.status;
  if (!['Cancelled', 'Closed'].includes(status)) {
    if (amountPaid <= 0) status = ['Draft'].includes(invoice.status) ? 'Draft' : (invoice.status === 'Viewed' ? 'Viewed' : invoice.status);
    else if (amountPaid + 0.01 < invoice.grandTotal) status = 'Partially Paid';
    else status = 'Paid';
  }
  return prisma.invoice.update({ where: { id: invoice.id }, data: { amountPaid, balanceDue, status } });
}

// ── Number generation (atomic-ish: bump settings.nextNumber, retry on clash) ──
async function nextInvoiceNumber(companyId, invoiceDate) {
  let settings = await prisma.invoiceSettings.findUnique({ where: { companyId } });
  if (!settings) settings = await prisma.invoiceSettings.create({ data: { companyId } });
  for (let attempt = 0; attempt < 20; attempt++) {
    const seq = settings.nextNumber + attempt;
    const number = calc.formatInvoiceNumber(settings, seq, invoiceDate);
    const clash = await prisma.invoice.findFirst({ where: { companyId, invoiceNumber: number }, select: { id: true } });
    if (!clash) {
      await prisma.invoiceSettings.update({ where: { companyId }, data: { nextNumber: seq + 1 } });
      return number;
    }
  }
  // Fallback: timestamp-suffixed to guarantee uniqueness.
  return `${settings.invoicePrefix || 'INV'}-${companyId}-${Date.now()}`;
}

// Validate + normalise an invoice body. Returns { error } or { data, items }.
function validateBody(b) {
  if (!b) return { error: 'Empty request.' };
  if (!String(b.billToName || '').trim() && !b.customerId) return { error: 'A customer is required.' };
  const items = Array.isArray(b.items) ? b.items.filter((it) => String(it.name || '').trim()) : [];
  if (items.length === 0) return { error: 'Add at least one line item.' };
  if (!String(b.invoiceDate || '').trim()) return { error: 'Invoice date is required.' };
  if (b.dueDate && b.invoiceDate && new Date(b.dueDate) < new Date(b.invoiceDate)) return { error: 'Due date cannot be earlier than the invoice date.' };
  for (const it of items) {
    if (Number(it.quantity) < 0 || Number(it.rate) < 0) return { error: `Line "${it.name}" has a negative quantity or rate.` };
  }
  return { items };
}

// ── LIST ──────────────────────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized workspace.' });
    const where = { ...base };
    const { q, status, customerId, from, to, transactionType } = req.query;
    if (status && status !== 'All') where.status = status;
    if (customerId) where.customerId = idParam(customerId);
    if (transactionType) where.transactionType = transactionType;
    if (q) where.OR = [{ invoiceNumber: { contains: String(q) } }, { billToName: { contains: String(q) } }];
    if (from || to) where.invoiceDate = { ...(from ? { gte: String(from) } : {}), ...(to ? { lte: String(to) } : {}) };
    const invoices = await prisma.invoice.findMany({ where, orderBy: { id: 'desc' }, take: 1000 });
    res.json(invoices);
  } catch (e) { console.error('invoice.list', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── GET ONE (with items, payments, audit) ─────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const invoice = await prisma.invoice.findFirst({ where: { id, ...base } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    const [items, payments, audits] = await Promise.all([
      prisma.invoiceItem.findMany({ where: { invoiceId: id }, orderBy: { sortOrder: 'asc' } }),
      prisma.invoicePayment.findMany({ where: { invoiceId: id }, orderBy: { id: 'desc' } }),
      prisma.invoiceAudit.findMany({ where: { invoiceId: id }, orderBy: { id: 'desc' }, take: 100 }),
    ]);
    res.json({ ...invoice, items, payments, audits });
  } catch (e) { console.error('invoice.getOne', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// Optional short text → trimmed, capped at the column width, blank becomes NULL.
const trim100 = (v) => { const s = String(v ?? '').trim(); return s ? s.slice(0, 100) : null; };

// Per-invoice branding override → compact JSON, or NULL when nothing is
// overridden (so the invoice keeps following the live Company Profile).
// Only image sources are accepted, and only the four known asset keys.
const ASSET_KEYS = ['logo', 'signature', 'stamp', 'qr'];
const isImageSrc = (v) => {
  const s = String(v ?? '').trim();
  return /^data:image\/(png|jpe?g|svg\+xml|webp|gif);base64,/i.test(s) || /^https?:\/\//i.test(s);
};
const brandingOverrideOf = (v) => {
  if (v === undefined) return undefined;                 // not sent → leave as-is
  if (v === null || v === '') return null;               // explicitly cleared
  let obj = v;
  if (typeof v === 'string') { try { obj = JSON.parse(v); } catch { return null; } }
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const k of ASSET_KEYS) if (isImageSrc(obj[k])) out[k] = String(obj[k]);
  return Object.keys(out).length ? JSON.stringify(out) : null;
};

// Build the invoice column payload + computed items from a validated body.
async function buildInvoiceData(companyId, b, items) {
  const homeState = (b.placeOfSupply != null ? null : await companyState(companyId)); // placeOfSupply drives it
  const supply = b.placeOfSupply || b.billToState || null;
  // Intra-state when the customer's state matches the company's home state.
  const cState = await companyState(companyId);
  const intraState = supply && cState ? String(supply).trim().toLowerCase() === String(cState).trim().toLowerCase() : true;
  const { lines, totals } = calc.computeInvoice(items, { intraState });
  const data = {
    companyId,
    transactionType: b.transactionType || 'Collect Payment',
    customerId: b.customerId ? idParam(b.customerId) : null,
    billToName: String(b.billToName || '').trim() || 'Customer',
    billToGstin: b.billToGstin || null, billToAddress: b.billToAddress || null, billToShipAddress: b.billToShipAddress || null,
    billToEmail: b.billToEmail || null,
    billToPhone: b.billToPhone || null, billToState: b.billToState || supply || null,
    invoiceDate: String(b.invoiceDate), dueDate: b.dueDate || null, currency: b.currency || 'INR',
    // Optional service-invoice header references (blank → NULL → line hidden).
    contractNo: trim100(b.contractNo), referenceNo: trim100(b.referenceNo),
    poNumber: trim100(b.poNumber), billingPeriod: trim100(b.billingPeriod),
    ...(brandingOverrideOf(b.brandingOverride) !== undefined ? { brandingOverride: brandingOverrideOf(b.brandingOverride) } : {}),
    paymentTerms: b.paymentTerms || null, placeOfSupply: supply,
    notes: b.notes || null, termsConditions: b.termsConditions || null, paymentMode: b.paymentMode || null,
    bankDetails: b.bankDetails || null, upiId: b.upiId || null,
    ...(await dispatchDestinationData(b, companyId, supply)),
    ...totals,
  };
  return { data, lines };
}

// ── Dispatch & Destination ───────────────────────────────────────────────────
// Whatever the client sent wins; anything it left blank is derived, so an
// invoice created through the API without these fields still carries sensible
// logistics rather than empty labels.
//
//   Dispatch  → the issuing company/branch (where the goods leave from)
//   Destination → the customer's shipping address, falling back to billing
//                 ("If no shipping address exists, use the billing address")
//
// Every value is nullable: a service invoice leaves them blank and the sections
// render nothing at all.
async function dispatchDestinationData(b, companyId, supply) {
  const t = (v, n) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };

  // Only pay for the company read when something is actually missing.
  const needsCompany = !b.dispatchFrom || !b.dispatchAddress || !b.dispatchCity || !b.dispatchState || !b.dispatchPincode;
  let co = null;
  if (needsCompany) {
    co = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, address: true, city: true, state: true, pincode: true },
    }).catch(() => null);
  }

  return {
    dispatchFrom:    t(b.dispatchFrom    ?? co?.name,    160),
    dispatchAddress: t(b.dispatchAddress ?? co?.address, 65535),
    dispatchCity:    t(b.dispatchCity    ?? co?.city,    100),
    dispatchState:   t(b.dispatchState   ?? co?.state,   100),
    dispatchPincode: t(b.dispatchPincode ?? co?.pincode, 12),
    // Not derivable — these are per-consignment facts the user supplies.
    dispatchDate:    t(b.dispatchDate, 10),
    dispatchThrough: t(b.dispatchThrough, 160),
    vehicleNumber:   t(b.vehicleNumber, 40),
    lrNumber:        t(b.lrNumber, 60),

    // Consignee fields are stored ONLY when supplied. Defaulting shipToName to
    // billToName here would look harmless but would mark every invoice as having
    // destination data, so the section could never hide on a services invoice —
    // the renderer already falls back to the billing name for display.
    shipToName:    t(b.shipToName, 160),
    shipToCity:    t(b.shipToCity, 100),
    shipToState:   t(b.shipToState, 100),
    shipToPincode: t(b.shipToPincode, 12),
    shipToCountry: t(b.shipToCountry, 100),
  };
}

// Persist line items (delete + recreate — simplest correct approach for edits).
async function writeItems(companyId, invoiceId, lines) {
  await prisma.invoiceItem.deleteMany({ where: { invoiceId } });
  if (lines.length) {
    await prisma.invoiceItem.createMany({
      data: lines.map((l, i) => ({
        companyId, invoiceId, productId: l.productId ? idParam(l.productId) : null,
        name: String(l.name).trim(), description: l.description || null, hsnSac: l.hsnSac || null,
        quantity: l.quantity, unit: l.unit || 'Nos', rate: l.rate, discountPct: l.discountPct, discountAmt: l.discountAmt,
        taxRate: l.taxRate, taxableValue: l.taxableValue, cgst: l.cgst, sgst: l.sgst, igst: l.igst, amount: l.amount, sortOrder: i,
      })),
    });
  }
}

// ── CREATE ────────────────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission to create invoices.' });
    const companyId = targetCompanyId(req, req.body?.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const v = validateBody(req.body); if (v.error) return res.status(400).json({ error: v.error });

    const { data, lines } = await buildInvoiceData(companyId, req.body, v.items);
    // Draft keeps a provisional number only when finalised; but we still assign a
    // unique number up-front so the list/print always has one. A Draft can be
    // regenerated. Requested explicit number is honoured if unique.
    let invoiceNumber = String(req.body.invoiceNumber || '').trim();
    if (invoiceNumber) {
      const clash = await prisma.invoice.findFirst({ where: { companyId, invoiceNumber }, select: { id: true } });
      if (clash) return res.status(409).json({ error: `Invoice number "${invoiceNumber}" already exists.`, code: 'DUP_NUMBER' });
    } else {
      invoiceNumber = await nextInvoiceNumber(companyId, req.body.invoiceDate);
    }
    const status = req.body.status === 'Generated' || req.body.finalize ? 'Generated' : (STATUSES.includes(req.body.status) ? req.body.status : 'Draft');
    const invoice = await prisma.invoice.create({
      data: { ...data, invoiceNumber, status, balanceDue: data.grandTotal, amountPaid: 0, createdBy: actorOf(req), updatedBy: actorOf(req) },
    });
    await writeItems(companyId, invoice.id, lines);
    audit(companyId, invoice.id, 'CREATED', actorOf(req), `${invoiceNumber} · ${invoice.billToName} · ₹${invoice.grandTotal}`);
    const items = await prisma.invoiceItem.findMany({ where: { invoiceId: invoice.id }, orderBy: { sortOrder: 'asc' } });
    res.status(201).json({ ...invoice, items });
  } catch (e) { console.error('invoice.create', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── UPDATE (edit draft/generated; locked once Paid/Cancelled) ─────────────────
exports.update = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission to edit invoices.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const existing = await prisma.invoice.findFirst({ where: { id, ...base } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found.' });
    if (['Cancelled', 'Paid', 'Closed'].includes(existing.status)) return res.status(400).json({ error: `A ${existing.status} invoice cannot be edited.` });
    const v = validateBody(req.body); if (v.error) return res.status(400).json({ error: v.error });

    const { data, lines } = await buildInvoiceData(existing.companyId, req.body, v.items);
    // Keep the existing number (immutable) and re-derive balance/status vs payments.
    const amountPaid = existing.amountPaid || 0;
    const balanceDue = calc.r2(Math.max(0, data.grandTotal - amountPaid));
    let status = STATUSES.includes(req.body.status) ? req.body.status : existing.status;
    if (amountPaid > 0 && !['Cancelled', 'Closed'].includes(status)) status = amountPaid + 0.01 < data.grandTotal ? 'Partially Paid' : 'Paid';
    const invoice = await prisma.invoice.update({ where: { id }, data: { ...data, balanceDue, status, updatedBy: actorOf(req) } });
    await writeItems(existing.companyId, id, lines);
    audit(existing.companyId, id, 'UPDATED', actorOf(req), `${invoice.invoiceNumber} · ₹${invoice.grandTotal}`);
    const items = await prisma.invoiceItem.findMany({ where: { invoiceId: id }, orderBy: { sortOrder: 'asc' } });
    res.json({ ...invoice, items });
  } catch (e) { console.error('invoice.update', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── STATUS transitions (Generate / Send / View / Cancel / Close) ──────────────
exports.setStatus = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const status = req.body?.status;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const existing = await prisma.invoice.findFirst({ where: { id, ...base } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found.' });
    if (status === 'Cancelled' && !canManage(req)) return res.status(403).json({ error: 'Only Company Head / Finance can cancel an invoice.' });
    if (existing.status === 'Cancelled') return res.status(400).json({ error: 'A cancelled invoice cannot change status.' });
    const invoice = await prisma.invoice.update({ where: { id }, data: { status, updatedBy: actorOf(req) } });
    const map = { Sent: 'SENT', Generated: 'CREATED', Cancelled: 'CANCELLED' };
    audit(existing.companyId, id, map[status] || 'UPDATED', actorOf(req), `Status → ${status}`);
    res.json(invoice);
  } catch (e) { console.error('invoice.setStatus', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── DUPLICATE ─────────────────────────────────────────────────────────────────
exports.duplicate = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const src = await prisma.invoice.findFirst({ where: { id, ...base } });
    if (!src) return res.status(404).json({ error: 'Invoice not found.' });
    const items = await prisma.invoiceItem.findMany({ where: { invoiceId: id }, orderBy: { sortOrder: 'asc' } });
    const invoiceNumber = await nextInvoiceNumber(src.companyId, new Date().toISOString().slice(0, 10));
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = src;
    const clone = await prisma.invoice.create({
      data: { ...rest, invoiceNumber, status: 'Draft', amountPaid: 0, balanceDue: src.grandTotal, invoiceDate: new Date().toISOString().slice(0, 10), createdBy: actorOf(req), updatedBy: actorOf(req) },
    });
    await writeItems(src.companyId, clone.id, items);
    audit(src.companyId, clone.id, 'CREATED', actorOf(req), `Duplicated from ${src.invoiceNumber}`);
    res.status(201).json(clone);
  } catch (e) { console.error('invoice.duplicate', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── DELETE (Draft/Cancelled only, and only if never paid) ─────────────────────
exports.remove = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'No permission to delete invoices.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const existing = await prisma.invoice.findFirst({ where: { id, ...base } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found.' });
    if (existing.amountPaid > 0) return res.status(409).json({ error: 'This invoice has recorded payments and cannot be deleted. Cancel it instead.', code: 'HAS_PAYMENTS' });
    if (!['Draft', 'Cancelled'].includes(existing.status)) return res.status(409).json({ error: `Only Draft or Cancelled invoices can be deleted (this one is ${existing.status}). Cancel it first.`, code: 'NOT_DELETABLE' });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await prisma.invoicePayment.deleteMany({ where: { invoiceId: id } });
    await prisma.invoice.delete({ where: { id } });
    audit(existing.companyId, id, 'DELETED', actorOf(req), existing.invoiceNumber);
    res.json({ ok: true });
  } catch (e) { console.error('invoice.remove', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── PAYMENTS ──────────────────────────────────────────────────────────────────
exports.recordPayment = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const invoice = await prisma.invoice.findFirst({ where: { id, ...base } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    if (invoice.status === 'Cancelled') return res.status(400).json({ error: 'Cannot record a payment against a cancelled invoice.' });
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    if (amount > invoice.balanceDue + 0.01) return res.status(400).json({ error: `Payment ₹${amount} exceeds the balance due ₹${invoice.balanceDue}.` });
    const payment = await prisma.invoicePayment.create({
      data: {
        companyId: invoice.companyId, invoiceId: id, amount: calc.r2(amount),
        paymentDate: req.body.paymentDate || new Date().toISOString().slice(0, 10),
        mode: req.body.mode || 'Bank', referenceNumber: req.body.referenceNumber || null, notes: req.body.notes || null,
        status: 'Paid', recordedBy: actorOf(req),
      },
    });
    const updated = await recalcPayments(invoice);
    audit(invoice.companyId, id, 'PAYMENT_RECORDED', actorOf(req), `₹${amount} via ${payment.mode} · balance ₹${updated.balanceDue}`);
    res.status(201).json({ payment, invoice: updated });
  } catch (e) { console.error('invoice.recordPayment', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.deletePayment = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const payId = idParam(req.params.paymentId);
    const pay = await prisma.invoicePayment.findFirst({ where: { id: payId, ...base } });
    if (!pay) return res.status(404).json({ error: 'Payment not found.' });
    await prisma.invoicePayment.delete({ where: { id: payId } });
    const invoice = await prisma.invoice.findUnique({ where: { id: pay.invoiceId } });
    const updated = await recalcPayments(invoice);
    audit(pay.companyId, pay.invoiceId, 'UPDATED', actorOf(req), `Payment ₹${pay.amount} reversed · balance ₹${updated.balanceDue}`);
    res.json({ ok: true, invoice: updated });
  } catch (e) { console.error('invoice.deletePayment', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── DASHBOARD (KPIs) ──────────────────────────────────────────────────────────
exports.dashboard = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const invoices = await prisma.invoice.findMany({ where: base, select: { status: true, grandTotal: true, amountPaid: true, balanceDue: true, dueDate: true, invoiceDate: true, invoiceNumber: true, billToName: true, id: true } });
    const today = new Date().toISOString().slice(0, 10);
    const monthPrefix = today.slice(0, 7);
    const byStatus = {};
    let totalRevenue = 0, outstanding = 0, thisMonthRevenue = 0, overdue = 0;
    // Transaction type buckets
    let accountsReceivable = 0, accountsPayable = 0;
    let salesTotal = 0, purchaseTotal = 0;

    // Billed value and the unpaid count, for the All Invoices summary cards.
    // Cancelled invoices are excluded from every money figure — they were never
    // owed — but they still appear in byStatus so the status breakdown is honest.
    let totalInvoiced = 0, unpaid = 0, live = 0;
    for (const inv of invoices) {
      byStatus[inv.status] = (byStatus[inv.status] || 0) + 1;
      if (inv.status !== 'Cancelled') {
        live++;
        // Maintain legacy fields for "Collect Payment" & default fallback
        if (!inv.transactionType || inv.transactionType === 'Collect Payment') {
          totalInvoiced += inv.grandTotal;
          totalRevenue += inv.amountPaid;
          outstanding += inv.balanceDue;
          if ((inv.invoiceDate || '').startsWith(monthPrefix)) thisMonthRevenue += inv.amountPaid;
          if (inv.balanceDue > 0 && inv.dueDate && inv.dueDate < today) overdue++;
          if (inv.amountPaid <= 0 && inv.balanceDue > 0) unpaid++;
          
          salesTotal += inv.grandTotal;
          accountsReceivable += inv.balanceDue;
        } else if (inv.transactionType === 'Pay Vendor') {
          purchaseTotal += inv.grandTotal;
          accountsPayable += inv.balanceDue;
        }
      }
    }
    // Monthly revenue (last 6 months, from recorded payments).
    const payments = await prisma.invoicePayment.findMany({ where: { ...base, status: { in: ['Paid', 'Partial'] } }, select: { amount: true, paymentDate: true } });
    const monthly = {};
    for (const p of payments) { const m = (p.paymentDate || '').slice(0, 7); if (m) monthly[m] = (monthly[m] || 0) + p.amount; }
    const recent = [...invoices].sort((a, b) => b.id - a.id).slice(0, 8);
    const upcoming = invoices.filter((i) => i.balanceDue > 0 && i.dueDate && i.dueDate >= today && i.status !== 'Cancelled').sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 8);
    res.json({
      kpis: {
        total: invoices.length,
        draft: byStatus['Draft'] || 0, generated: byStatus['Generated'] || 0, sent: byStatus['Sent'] || 0,
        paid: byStatus['Paid'] || 0, partiallyPaid: byStatus['Partially Paid'] || 0, cancelled: byStatus['Cancelled'] || 0,
        overdue, unpaid, live,
        // totalInvoiced − totalRevenue === outstanding, by construction: all three
        // are accumulated in the same pass over the same rows, so the summary
        // cards can never fail to reconcile.
        totalInvoiced: calc.r2(totalInvoiced),
        totalRevenue: calc.r2(totalRevenue), outstanding: calc.r2(outstanding), thisMonthRevenue: calc.r2(thisMonthRevenue),
        accountsReceivable: calc.r2(accountsReceivable), accountsPayable: calc.r2(accountsPayable),
        salesTotal: calc.r2(salesTotal), purchaseTotal: calc.r2(purchaseTotal)
      },
      byStatus, monthly, recent, upcoming,
    });
  } catch (e) { console.error('invoice.dashboard', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// Record a print/email/whatsapp action for the audit trail (fire-and-forget).
// ── EMAIL THE INVOICE (additive endpoint; no existing route changed) ─────────
// The client sends the exact HTML it is showing, so the attached PDF is the very
// invoice that was edited/printed. On success the invoice moves Draft/Generated
// → Sent, matching the existing print/email workflow.
exports.emailInvoice = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission to send invoices.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const invoice = await prisma.invoice.findFirst({ where: { id, ...base } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

    const to = String(req.body?.to || invoice.billToEmail || '').trim();
    if (!to) return res.status(400).json({ error: 'No customer email address for this invoice.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: `"${to}" is not a valid email address.` });
    const html = String(req.body?.html || '');
    if (!html.trim()) return res.status(400).json({ error: 'Nothing to send — the invoice document was empty.' });

    const company = await prisma.company.findUnique({ where: { id: invoice.companyId }, select: { name: true } }).catch(() => null);
    const { emailInvoicePdf } = require('../services/invoicePdfMailer');
    const result = await emailInvoicePdf({
      to, cc: req.body?.cc || undefined, subject: req.body?.subject, message: req.body?.message,
      html, invoice, companyName: company?.name,
    });
    if (result.error && !result.delivered) return res.status(502).json({ error: result.error });

    audit(invoice.companyId, id, 'EMAILED', actorOf(req), `${result.delivered ? 'Sent' : 'Queued (SMTP not configured)'} to ${to}`);
    if (result.delivered && ['Draft', 'Generated'].includes(invoice.status)) {
      await prisma.invoice.update({ where: { id }, data: { status: 'Sent' } }).catch(() => {});
    }
    res.json({ ok: true, to, ...result });
  } catch (e) { console.error('invoice.emailInvoice', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.logAction = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const invoice = await prisma.invoice.findFirst({ where: { id, ...base } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    const action = String(req.body?.action || '').toUpperCase();
    if (!['PRINTED', 'EMAILED', 'WHATSAPP', 'DOWNLOADED', 'VIEWED'].includes(action)) return res.status(400).json({ error: 'Unknown action.' });
    audit(invoice.companyId, id, action === 'WHATSAPP' ? 'EMAILED' : action, actorOf(req), req.body?.detail || action);
    // A print/email of a Draft advances it to Sent (soft workflow).
    if (['PRINTED', 'EMAILED', 'WHATSAPP'].includes(action) && ['Draft', 'Generated'].includes(invoice.status) && canEdit(req)) {
      await prisma.invoice.update({ where: { id }, data: { status: 'Sent' } }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) { console.error('invoice.logAction', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.getReminderCenter = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const invoice = await prisma.invoice.findFirst({ where: { id, ...base } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

    const items = await prisma.invoiceItem.findMany({ where: { invoiceId: id }, orderBy: { sortOrder: 'asc' } });
    const payments = await prisma.invoicePayment.findMany({ where: { invoiceId: id }, orderBy: { id: 'desc' } });
    const reminders = await prisma.invoiceReminder.findMany({ where: { invoiceId: id }, orderBy: { id: 'desc' } }).catch(() => []);
    const audits = await prisma.invoiceAudit.findMany({ where: { invoiceId: id }, orderBy: { id: 'desc' } });
    const settings = await prisma.invoiceSettings.findUnique({ where: { companyId: invoice.companyId } }).catch(() => null);
    const company = await prisma.company.findUnique({ where: { id: invoice.companyId }, select: { name: true, phone: true, contactEmail: true, adminEmail: true } }).catch(() => null);

    const todayStr = new Date().toISOString().slice(0, 10);
    let autoStatus = invoice.status;
    let overdueDays = 0;
    if (!['Cancelled', 'Closed', 'Paid'].includes(autoStatus)) {
      if (invoice.balanceDue <= 0) {
        autoStatus = 'Paid';
      } else if (invoice.dueDate && invoice.dueDate < todayStr) {
        autoStatus = 'Overdue';
        const dToday = new Date(todayStr);
        const dDue = new Date(invoice.dueDate);
        overdueDays = Math.max(0, Math.floor((dToday - dDue) / 86400000));
      } else if (invoice.amountPaid > 0) {
        autoStatus = 'Partially Paid';
      } else if (['Sent', 'Viewed'].includes(invoice.status)) {
        autoStatus = 'Pending Payment';
      }
    }

    const progress = {
      total: invoice.grandTotal || 0,
      paid: invoice.amountPaid || 0,
      remaining: invoice.balanceDue || 0,
      percent: Math.min(100, Math.round(((invoice.amountPaid || 0) / (invoice.grandTotal || 1)) * 100))
    };

    const recentReminder = reminders.length > 0 ? reminders[0] : null;
    let isRateLimited = false;
    if (recentReminder && recentReminder.createdAt) {
      const diffMins = (Date.now() - new Date(recentReminder.createdAt).getTime()) / 60000;
      if (diffMins < 10) isRateLimited = true;
    }

    res.json({
      invoice: { ...invoice, items },
      payments,
      reminders,
      audits,
      settings: settings || {},
      companyName: company?.name || 'Company',
      companyContact: { phone: company?.phone, email: company?.email },
      autoStatus,
      overdueDays,
      progress,
      isRateLimited
    });
  } catch (e) { console.error('invoice.getReminderCenter', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.sendReminder = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission to send reminders.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const invoice = await prisma.invoice.findFirst({ where: { id, ...base } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

    if (invoice.balanceDue <= 0 && invoice.status !== 'Draft') {
      return res.status(400).json({ error: 'No reminder allowed for fully paid invoices.' });
    }

    const channels = Array.isArray(req.body.channels) ? req.body.channels : ['Email'];
    const message = String(req.body.message || '').trim();
    const subject = String(req.body.subject || `Payment Reminder - Invoice ${invoice.invoiceNumber}`).trim();
    const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : ['Attach Invoice PDF'];
    const toEmail = String(req.body.toEmail || invoice.billToEmail || '').trim();
    const toPhone = String(req.body.toPhone || invoice.billToPhone || '').trim();
    const force = Boolean(req.body.force);

    if (!force) {
      const recent = await prisma.invoiceReminder.findFirst({ where: { invoiceId: id }, orderBy: { id: 'desc' } }).catch(() => null);
      if (recent && recent.createdAt) {
        const diffMins = (Date.now() - new Date(recent.createdAt).getTime()) / 60000;
        if (diffMins < 10) {
          return res.status(429).json({ error: 'A reminder was sent recently (less than 10 minutes ago). Confirm to resend.', requiresConfirmation: true });
        }
      }
    }

    const company = await prisma.company.findUnique({ where: { id: invoice.companyId }, select: { name: true } }).catch(() => null);
    const actor = actorOf(req);
    const ip = req.ip || req.connection?.remoteAddress || null;
    const sentResults = [];

    for (const channel of channels) {
      let recipient = '';
      let status = 'Delivered';
      if (channel === 'Email') {
        if (!toEmail) return res.status(400).json({ error: 'Customer email address is required for Email reminder.' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) return res.status(400).json({ error: `"${toEmail}" is not a valid email address.` });
        recipient = toEmail;
        if (req.body.html) {
          try {
            const { emailInvoicePdf } = require('../services/invoicePdfMailer');
            const mailRes = await emailInvoicePdf({
              to: toEmail, subject, message, html: req.body.html, invoice, companyName: company?.name
            });
            if (mailRes.error && !mailRes.delivered) status = 'Failed';
          } catch (err) { status = 'Failed'; }
        }
      } else if (channel === 'WhatsApp' || channel === 'SMS') {
        if (!toPhone) return res.status(400).json({ error: `Customer mobile number is required for ${channel} reminder.` });
        recipient = toPhone;
      } else {
        recipient = invoice.billToName;
      }

      const rem = await prisma.invoiceReminder.create({
        data: {
          companyId: invoice.companyId,
          invoiceId: id,
          channel,
          sentBy: actor,
          status,
          recipient,
          message,
          attachments: JSON.stringify(attachments),
          ip
        }
      }).catch(() => null);
      if (rem) sentResults.push(rem);
    }

    audit(invoice.companyId, id, 'REMINDER_SENT', actor, `Payment reminder sent via ${channels.join(', ')}`);

    if (['Draft', 'Generated'].includes(invoice.status)) {
      await prisma.invoice.update({ where: { id }, data: { status: 'Sent' } }).catch(() => {});
    }

    res.json({ ok: true, sentCount: sentResults.length, reminders: sentResults });
  } catch (e) { console.error('invoice.sendReminder', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.rescheduleDueDate = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission to reschedule due date.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const invoice = await prisma.invoice.findFirst({ where: { id, ...base } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

    const newDate = String(req.body.dueDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return res.status(400).json({ error: 'Invalid due date format (YYYY-MM-DD required).' });

    await prisma.invoice.update({ where: { id }, data: { dueDate: newDate } });
    audit(invoice.companyId, id, 'DUE_DATE_RESCHEDULED', actorOf(req), `Due date rescheduled from ${invoice.dueDate || 'none'} to ${newDate}`);

    res.json({ ok: true, dueDate: newDate });
  } catch (e) { console.error('invoice.rescheduleDueDate', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.sendThankYou = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const invoice = await prisma.invoice.findFirst({ where: { id, ...base } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

    const toEmail = String(req.body.toEmail || invoice.billToEmail || '').trim();
    if (!toEmail) return res.status(400).json({ error: 'No email address found to send thank you note.' });

    const subject = `Thank You for Your Payment - Invoice ${invoice.invoiceNumber}`;
    const message = req.body.message || `Dear ${invoice.billToName},\n\nWe have received your payment in full for Invoice ${invoice.invoiceNumber}.\n\nThank you for your business!\n\nRegards,\nYour Company`;

    if (req.body.html) {
      try {
        const { emailInvoicePdf } = require('../services/invoicePdfMailer');
        await emailInvoicePdf({ to: toEmail, subject, message, html: req.body.html, invoice });
      } catch (e) {}
    }

    audit(invoice.companyId, id, 'THANK_YOU_SENT', actorOf(req), `Thank you note sent to ${toEmail}`);
    res.json({ ok: true });
  } catch (e) { console.error('invoice.sendThankYou', e); res.status(500).json({ error: e.message || 'Server error' }); }
};
