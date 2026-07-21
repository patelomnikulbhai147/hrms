// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE INVOICE EDITOR (Super Admin → Subscription Management → Billing).
//
// A standalone controller so the existing subscriptionInvoiceController — and the
// Payroll / Customer / Employee invoice modules — stay byte-for-byte untouched.
// Every amount is derived by invoiceEditorEngine; nothing here hand-calculates.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');
const AuditService = require('../services/auditService');
const engine = require('../services/invoiceEditorEngine');

const r2 = engine.r2;
const actorOf = (req) => req.user?.name || req.user?.email || 'Super Admin';
const LIFECYCLE = ['Draft', 'Pending', 'Paid', 'Overdue', 'Cancelled', 'Refunded'];
const logAudit = (req, action, targetId, details) => {
  if (req.user?.id) AuditService.logAudit(req.user.id, action, 'SubscriptionBilling', String(targetId), { ...details, by: actorOf(req) }).catch(() => {});
};
const withBalance = (inv) => ({ ...inv, balance: r2((inv.grandTotal || 0) - (inv.amountPaid || 0)) });
const effectiveStatus = (inv) => (inv.status === 'Pending' && inv.dueDate && new Date(inv.dueDate) < new Date() ? 'Overdue' : inv.status);

// Header fields the editor may change, with their audit labels.
const EDITABLE_FIELDS = {
  invoiceNo: 'Invoice Number', invoiceDate: 'Invoice Date', dueDate: 'Due Date',
  periodStart: 'Billing Period From', periodEnd: 'Billing Period To',
  companyName: 'Company Name', billingAddress: 'Billing Address', gstin: 'GST Number',
  pan: 'PAN', contactPerson: 'Contact Person', companyEmail: 'Email', companyPhone: 'Phone',
  notes: 'Notes', terms: 'Terms & Conditions', bankDetails: 'Bank Details',
};
const MONEY_AUDIT = { subtotal: 'Subtotal', discountAmount: 'Discount', gstAmount: 'GST Amount', grandTotal: 'Grand Total' };
const DATE_FIELDS = ['invoiceDate', 'dueDate', 'periodStart', 'periodEnd'];

const asDate = (v) => (v ? new Date(v) : null);
const dayOf = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');

// ── GET /:id/editor — the editable model (seeds one item from a legacy invoice) ──
exports.getEditor = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });

    const stored = Array.isArray(inv.lineItems) ? inv.lineItems : null;
    const lineItems = stored && stored.length ? stored : engine.seedItemsFromLegacy(inv);
    const computed = engine.computeInvoiceFromItems({
      lineItems, interState: inv.interState, roundOffEnabled: true, amountPaid: inv.amountPaid,
    });

    return res.json({
      invoice: withBalance({ ...inv, status: effectiveStatus(inv) }),
      lineItems: computed.items,
      computed,
      locked: engine.isLocked(inv),
      lockedStatuses: engine.LOCKED_STATUSES,
      seeded: !(stored && stored.length),
    });
  } catch (e) { console.error('[invoiceEditor.getEditor]', e); return res.status(500).json({ error: 'Failed to load the invoice editor.' }); }
};

// ── PUT /:id/editor — save the edited invoice (Save Draft / Save Changes) ──
exports.saveEditor = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    if (engine.isLocked(inv)) {
      return res.status(423).json({ error: `This invoice is ${inv.status} and is locked for editing. Unlock it first.`, locked: true });
    }

    const b = req.body || {};
    const lineItems = Array.isArray(b.lineItems) ? b.lineItems
      : (Array.isArray(inv.lineItems) && inv.lineItems.length ? inv.lineItems : engine.seedItemsFromLegacy(inv));

    const errors = engine.validateInvoice({ lineItems, amountPaid: inv.amountPaid, invoiceNo: b.invoiceNo, invoiceDate: b.invoiceDate });
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    // Invoice number must stay unique across the register.
    if (b.invoiceNo && String(b.invoiceNo).trim() !== inv.invoiceNo) {
      const clash = await prisma.subscriptionInvoice.findUnique({ where: { invoiceNo: String(b.invoiceNo).trim() } });
      if (clash) return res.status(409).json({ error: `Invoice number ${String(b.invoiceNo).trim()} is already in use.` });
    }

    const interState = b.interState != null ? !!b.interState : inv.interState;
    const roundOffEnabled = b.roundOffEnabled != null ? !!b.roundOffEnabled : true;
    const money = engine.computeInvoiceFromItems({ lineItems, interState, roundOffEnabled, amountPaid: inv.amountPaid });

    const data = {
      lineItems: money.items,
      subtotal: money.subtotal, discountAmount: money.discountAmount, discountPercent: money.discountPercent,
      gstPercent: money.gstPercent, gstAmount: money.gstAmount,
      cgst: money.cgst, sgst: money.sgst, igst: money.igst, interState,
      roundOff: money.roundOff, grandTotal: money.grandTotal,
    };
    for (const f of Object.keys(EDITABLE_FIELDS)) {
      if (b[f] === undefined) continue;
      data[f] = DATE_FIELDS.includes(f) ? asDate(b[f]) : b[f];
    }
    if (b.invoiceNo !== undefined) data.invoiceNo = String(b.invoiceNo).trim();
    if (b.status && LIFECYCLE.includes(b.status)) data.status = b.status;

    // ── Audit trail: one row per changed field (old → new, who, why) ──
    const rows = [];
    const push = (label, oldV, newV) => {
      const o = oldV == null ? '' : String(oldV);
      const n = newV == null ? '' : String(newV);
      if (o !== n) rows.push({
        invoiceId: id, invoiceNo: data.invoiceNo || inv.invoiceNo, field: label,
        oldValue: o.slice(0, 2000), newValue: n.slice(0, 2000),
        action: 'EDIT', reason: b.reason || null, changedBy: actorOf(req),
      });
    };
    for (const [f, label] of Object.entries(EDITABLE_FIELDS)) {
      if (data[f] === undefined) continue;
      if (DATE_FIELDS.includes(f)) { if (dayOf(inv[f]) !== dayOf(data[f])) push(label, dayOf(inv[f]), dayOf(data[f])); }
      else push(label, inv[f], data[f]);
    }
    for (const [f, label] of Object.entries(MONEY_AUDIT)) push(label, inv[f], data[f]);
    const oldCount = Array.isArray(inv.lineItems) ? inv.lineItems.length : 0;
    if (oldCount !== money.items.length) push('Invoice Items', `${oldCount} item(s)`, `${money.items.length} item(s)`);

    const updated = await prisma.subscriptionInvoice.update({ where: { id }, data });
    if (rows.length) await prisma.subscriptionInvoiceAudit.createMany({ data: rows }).catch((e) => console.error('[invoiceEditor] audit write:', e.message));
    logAudit(req, 'EDIT_INVOICE', id, { invoiceNo: updated.invoiceNo, amount: updated.grandTotal, fieldsChanged: rows.length });

    return res.json({ invoice: withBalance({ ...updated, status: effectiveStatus(updated) }), computed: money, changed: rows.length });
  } catch (e) { console.error('[invoiceEditor.saveEditor]', e); return res.status(500).json({ error: 'Failed to save the invoice.' }); }
};

// ── POST /:id/finalize — Mark Final (Draft → Pending) ──
exports.finalize = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    if (engine.isLocked(inv)) return res.status(423).json({ error: `This invoice is ${inv.status} and is locked.`, locked: true });

    const updated = await prisma.subscriptionInvoice.update({
      where: { id },
      data: { status: inv.status === 'Draft' ? 'Pending' : inv.status, finalizedAt: new Date(), editUnlocked: false },
    });
    await prisma.subscriptionInvoiceAudit.create({
      data: { invoiceId: id, invoiceNo: updated.invoiceNo, field: 'Status', oldValue: inv.status, newValue: updated.status, action: 'FINALIZE', reason: req.body?.reason || null, changedBy: actorOf(req) },
    }).catch(() => {});
    logAudit(req, 'FINALIZE_INVOICE', id, { invoiceNo: updated.invoiceNo });
    return res.json(withBalance({ ...updated, status: effectiveStatus(updated) }));
  } catch (e) { console.error('[invoiceEditor.finalize]', e); return res.status(500).json({ error: 'Failed to finalize the invoice.' }); }
};

// ── POST /:id/unlock — re-open a Paid/Cancelled/Archived invoice (audited) ──
exports.unlockEditor = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const inv = await prisma.subscriptionInvoice.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A reason is required to unlock a finalized invoice.' });

    const updated = await prisma.subscriptionInvoice.update({ where: { id }, data: { editUnlocked: true } });
    await prisma.subscriptionInvoiceAudit.create({
      data: { invoiceId: id, invoiceNo: updated.invoiceNo, field: 'Edit Lock', oldValue: 'Locked', newValue: 'Unlocked', action: 'UNLOCK', reason, changedBy: actorOf(req) },
    }).catch(() => {});
    logAudit(req, 'UNLOCK_INVOICE', id, { invoiceNo: updated.invoiceNo, reason });
    return res.json({ invoice: withBalance({ ...updated, status: effectiveStatus(updated) }), locked: false });
  } catch (e) { console.error('[invoiceEditor.unlockEditor]', e); return res.status(500).json({ error: 'Failed to unlock the invoice.' }); }
};

// ── GET /:id/audit — the edit trail for this invoice ──
exports.editorAudit = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await prisma.subscriptionInvoiceAudit.findMany({ where: { invoiceId: id }, orderBy: { id: 'desc' }, take: 300 });
    return res.json({ audit: rows });
  } catch (e) { console.error('[invoiceEditor.editorAudit]', e); return res.status(500).json({ error: 'Failed to load the invoice audit trail.' }); }
};
