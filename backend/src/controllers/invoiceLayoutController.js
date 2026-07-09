/**
 * Visual Invoice Designer — per-company named canvas layouts (invoice_layouts).
 * Additive & isolated: the classic flow templates (invoice_settings.designJson)
 * and all invoice/GST/numbering logic are untouched. An invoice renders a canvas
 * layout ONLY when a company has one marked active (isDefault). RBAC + scoping
 * reuse the shared invoiceScope helpers.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { canView, canEdit, canManage, actorOf, targetCompanyId, scopedWhere, isSuperAdmin } = require('../utils/invoiceScope');

const MAX_LAYOUT = 500000; // guard against oversized specs

const shape = (r) => ({
  id: r.id, companyId: r.companyId, name: r.name, isDefault: r.isDefault,
  layout: safeParse(r.layoutJson), updatedAt: r.updatedAt, createdBy: r.createdBy || null,
});
function safeParse(s) { try { return typeof s === 'string' ? JSON.parse(s) : (s || null); } catch { return null; } }

exports.list = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized workspace.' });
    const rows = await prisma.invoiceLayout.findMany({ where: base, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
    res.json({ layouts: rows.map(shape) });
  } catch (e) { console.error('invoiceLayout.list', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.get = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const row = await prisma.invoiceLayout.findFirst({ where: { id: idParam(req.params.id), ...base } });
    if (!row) return res.status(404).json({ error: 'Layout not found.' });
    res.json(shape(row));
  } catch (e) { console.error('invoiceLayout.get', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// Create (no id) or update (id) a named layout.
exports.save = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission.' });
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Layout name is required.' });
    const layout = b.layout;
    if (!layout || typeof layout !== 'object' || !Array.isArray(layout.blocks)) {
      return res.status(400).json({ error: 'A valid layout (layout.blocks[]) is required.' });
    }
    const layoutJson = JSON.stringify(layout);
    if (layoutJson.length > MAX_LAYOUT) return res.status(413).json({ error: 'Layout is too large.' });

    const id = idParam(req.params.id) || (b.id ? idParam(b.id) : null);
    if (id) {
      const companyId = targetCompanyId(req, b.companyId);
      const existing = await prisma.invoiceLayout.findFirst({ where: { id, ...(isSuperAdmin(req) ? {} : { companyId }) } });
      if (!existing) return res.status(404).json({ error: 'Layout not found.' });
      const updated = await prisma.invoiceLayout.update({ where: { id }, data: { name, layoutJson, updatedBy: actorOf(req) } });
      return res.json(shape(updated));
    }
    const companyId = targetCompanyId(req, b.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const created = await prisma.invoiceLayout.create({ data: { companyId, name, layoutJson, createdBy: actorOf(req), updatedBy: actorOf(req) } });
    res.status(201).json(shape(created));
  } catch (e) { console.error('invoiceLayout.save', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.remove = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const existing = await prisma.invoiceLayout.findFirst({ where: { id, ...base } });
    if (!existing) return res.status(404).json({ error: 'Layout not found.' });
    await prisma.invoiceLayout.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { console.error('invoiceLayout.remove', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// Mark a layout as the company's ACTIVE canvas layout (unset the previous). Pass
// { active:false } to turn canvas rendering OFF (revert invoices to flow templates).
exports.setDefault = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const existing = await prisma.invoiceLayout.findFirst({ where: { id, ...base } });
    if (!existing) return res.status(404).json({ error: 'Layout not found.' });
    const companyId = existing.companyId;
    await prisma.invoiceLayout.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } });
    const makeActive = req.body?.active !== false;
    const updated = await prisma.invoiceLayout.update({ where: { id }, data: { isDefault: makeActive } });
    res.json(shape(updated));
  } catch (e) { console.error('invoiceLayout.setDefault', e); res.status(500).json({ error: e.message || 'Server error' }); }
};
