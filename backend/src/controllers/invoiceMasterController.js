/**
 * Invoice masters — Customers, Products/Services and per-company Settings.
 * Company-scoped (RULE 5) and role-gated (see utils/invoiceScope). Isolated:
 * touches only invoice_* tables.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { canView, canEdit, canManage, actorOf, targetCompanyId, scopedWhere, isSuperAdmin } = require('../utils/invoiceScope');

const audit = (companyId, entityType, entityId, action, by, details) =>
  prisma.invoiceAudit.create({ data: { companyId, entityType, entityId, action, performedBy: by, details: details ? String(details).slice(0, 2000) : null } }).catch(() => {});

const need = (req, res) => { const c = targetCompanyId(req, req.body?.companyId); if (!c) { res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' }); return null; } return c; };

// Client Master code — CLI-000001, assigned once per customer, unique per company.
// Derives the next sequence from the highest existing CLI-###### for the company
// (so it survives deletes/backfill without a separate counter column).
const CLIENT_CODE_RE = /^CLI-(\d+)$/i;
async function nextCustomerCode(companyId) {
  const rows = await prisma.invoiceCustomer.findMany({ where: { companyId }, select: { customerCode: true } });
  let max = 0;
  for (const r of rows) { const m = CLIENT_CODE_RE.exec(String(r.customerCode || '')); if (m) max = Math.max(max, parseInt(m[1], 10)); }
  return `CLI-${String(max + 1).padStart(6, '0')}`;
}

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
exports.listCustomers = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized workspace.' });
    const where = { ...base };
    if (req.query.q) {
      const q = String(req.query.q);
      // Search across every field the Customers grid shows: company/customer name,
      // contact person, client code, GSTIN, mobile and email.
      where.OR = [
        { companyName: { contains: q } }, { contactPerson: { contains: q } },
        { customerCode: { contains: q } }, { gstin: { contains: q } },
        { phone: { contains: q } }, { email: { contains: q } },
      ];
    }
    if (req.query.active === 'true') where.isActive = true;
    const customers = await prisma.invoiceCustomer.findMany({ where, orderBy: { companyName: 'asc' } });
    // Attach lightweight history (invoice count / outstanding / paid) per customer.
    const ids = customers.map((c) => c.id);
    const invoices = ids.length ? await prisma.invoice.findMany({ where: { ...base, customerId: { in: ids }, status: { not: 'Cancelled' } }, select: { customerId: true, grandTotal: true, balanceDue: true, amountPaid: true } }) : [];
    const agg = {};
    for (const inv of invoices) { const k = inv.customerId; agg[k] = agg[k] || { count: 0, outstanding: 0, paid: 0 }; agg[k].count++; agg[k].outstanding += inv.balanceDue; agg[k].paid += inv.amountPaid; }
    res.json(customers.map((c) => ({ ...c, history: agg[c.id] || { count: 0, outstanding: 0, paid: 0 } })));
  } catch (e) { console.error('invoice.listCustomers', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.saveCustomer = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission.' });
    const companyId = need(req, res); if (!companyId) return;
    const b = req.body || {};
    if (!String(b.companyName || '').trim()) return res.status(400).json({ error: 'Customer / Company Name is required.' });
    const creditDays = (b.creditDays === '' || b.creditDays == null) ? null : Math.max(0, parseInt(b.creditDays, 10) || 0);
    const data = {
      companyName: String(b.companyName).trim(), contactPerson: b.contactPerson || null, gstin: b.gstin || null, pan: b.pan || null,
      email: b.email || null, phone: b.phone || null, addressLine: b.addressLine || null, shipToAddress: b.shipToAddress || null,
      city: b.city || null, state: b.state || null, country: b.country || 'India',
      paymentTerms: b.paymentTerms || null, creditDays, isActive: b.isActive !== false, notes: b.notes || null,
    };
    const id = idParam(req.params.id);
    let saved;
    if (id) {
      const existing = await prisma.invoiceCustomer.findFirst({ where: { id, companyId } });
      if (!existing) return res.status(404).json({ error: 'Customer not found.' });
      // Client code is assigned once and never changed here; backfill it if missing.
      const code = existing.customerCode || await nextCustomerCode(companyId);
      saved = await prisma.invoiceCustomer.update({ where: { id }, data: { ...data, customerCode: code, updatedBy: actorOf(req) } });
      audit(companyId, 'Customer', id, 'UPDATED', actorOf(req), saved.companyName);
    } else {
      // Assign a unique CLI-###### on create, retrying on the rare unique clash.
      let saveErr = null;
      for (let attempt = 0; attempt < 5 && !saved; attempt++) {
        try {
          saved = await prisma.invoiceCustomer.create({ data: { ...data, customerCode: await nextCustomerCode(companyId), companyId, createdBy: actorOf(req), updatedBy: actorOf(req) } });
        } catch (err) { saveErr = err; if (err?.code !== 'P2002') throw err; }
      }
      if (!saved) throw saveErr || new Error('Could not assign a client code.');
      audit(companyId, 'Customer', saved.id, 'CREATED', actorOf(req), saved.companyName);
    }
    res.status(id ? 200 : 201).json(saved);
  } catch (e) { console.error('invoice.saveCustomer', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.deleteCustomer = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const existing = await prisma.invoiceCustomer.findFirst({ where: { id, ...base } });
    if (!existing) return res.status(404).json({ error: 'Customer not found.' });
    const used = await prisma.invoice.count({ where: { customerId: id } });
    if (used > 0) return res.status(409).json({ error: `This customer has ${used} invoice(s) and cannot be deleted. Deactivate it instead.`, code: 'IN_USE' });
    await prisma.invoiceCustomer.delete({ where: { id } });
    audit(existing.companyId, 'Customer', id, 'DELETED', actorOf(req), existing.companyName);
    res.json({ ok: true });
  } catch (e) { console.error('invoice.deleteCustomer', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── PRODUCTS / SERVICES ───────────────────────────────────────────────────────
exports.listProducts = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const where = { ...base };
    if (req.query.q) where.OR = [{ name: { contains: String(req.query.q) } }, { hsnSac: { contains: String(req.query.q) } }];
    if (req.query.active === 'true') where.isActive = true;
    res.json(await prisma.invoiceProduct.findMany({ where, orderBy: { name: 'asc' } }));
  } catch (e) { console.error('invoice.listProducts', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.saveProduct = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission.' });
    const companyId = need(req, res); if (!companyId) return;
    const b = req.body || {};
    if (!String(b.name || '').trim()) return res.status(400).json({ error: 'Product / Service name is required.' });
    const rate = Number(b.rate); const taxRate = Number(b.taxRate);
    if (b.rate != null && (!Number.isFinite(rate) || rate < 0)) return res.status(400).json({ error: 'Rate must be a non-negative number.' });
    if (b.taxRate != null && (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)) return res.status(400).json({ error: 'Tax rate must be between 0 and 100.' });
    const data = { name: String(b.name).trim(), hsnSac: b.hsnSac || null, description: b.description || null, unit: b.unit || 'Nos', rate: Math.max(0, rate || 0), taxRate: Math.max(0, taxRate || 0), isActive: b.isActive !== false };
    const id = idParam(req.params.id);
    let saved;
    if (id) {
      const existing = await prisma.invoiceProduct.findFirst({ where: { id, companyId } });
      if (!existing) return res.status(404).json({ error: 'Product not found.' });
      saved = await prisma.invoiceProduct.update({ where: { id }, data: { ...data, updatedBy: actorOf(req) } });
      audit(companyId, 'Product', id, 'UPDATED', actorOf(req), saved.name);
    } else {
      saved = await prisma.invoiceProduct.create({ data: { ...data, companyId, createdBy: actorOf(req), updatedBy: actorOf(req) } });
      audit(companyId, 'Product', saved.id, 'CREATED', actorOf(req), saved.name);
    }
    res.status(id ? 200 : 201).json(saved);
  } catch (e) { console.error('invoice.saveProduct', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.deleteProduct = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const existing = await prisma.invoiceProduct.findFirst({ where: { id, ...base } });
    if (!existing) return res.status(404).json({ error: 'Product not found.' });
    await prisma.invoiceProduct.delete({ where: { id } });
    audit(existing.companyId, 'Product', id, 'DELETED', actorOf(req), existing.name);
    res.json({ ok: true });
  } catch (e) { console.error('invoice.deleteProduct', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── SETTINGS (per company) ────────────────────────────────────────────────────
const DEFAULT_SETTINGS = { invoicePrefix: 'INV', numberFormat: '{PREFIX}-{FY}-{SEQ}', nextNumber: 1, seqPadding: 4, defaultCurrency: 'INR', defaultPaymentTerms: 'Net 30', themeColor: '#4F7CFF' };

exports.getSettings = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const companyId = targetCompanyId(req, req.query.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    let s = await prisma.invoiceSettings.findUnique({ where: { companyId } });
    if (!s) s = await prisma.invoiceSettings.create({ data: { companyId, ...DEFAULT_SETTINGS } });
    res.json(s);
  } catch (e) { console.error('invoice.getSettings', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.saveSettings = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'No permission to edit settings.' });
    const companyId = need(req, res); if (!companyId) return;
    const b = req.body || {};
    const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
    const data = {
      invoicePrefix: (b.invoicePrefix || 'INV').trim(), numberFormat: b.numberFormat || '{PREFIX}-{FY}-{SEQ}',
      nextNumber: Math.max(1, Math.round(num(b.nextNumber, 1))), seqPadding: Math.min(10, Math.max(1, Math.round(num(b.seqPadding, 4)))),
      defaultCurrency: b.defaultCurrency || 'INR', defaultPaymentTerms: b.defaultPaymentTerms || null,
      defaultNotes: b.defaultNotes || null, defaultTerms: b.defaultTerms || null, companyGstin: b.companyGstin || null,
      bankDetails: b.bankDetails || null, upiId: b.upiId || null, logoUrl: b.logoUrl || null, signatureUrl: b.signatureUrl || null,
      themeColor: b.themeColor || '#4F7CFF', footerText: b.footerText || null,
      // Invoice Designer template config (JSON). undefined → left unchanged so a
      // numbering/defaults save never wipes a saved design.
      ...(b.designJson !== undefined ? { designJson: b.designJson == null ? null : String(b.designJson) } : {}),
    };
    const saved = await prisma.invoiceSettings.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
    audit(companyId, 'Settings', saved.id, 'UPDATED', actorOf(req), 'Invoice settings updated');
    res.json(saved);
  } catch (e) { console.error('invoice.saveSettings', e); res.status(500).json({ error: e.message || 'Server error' }); }
};
