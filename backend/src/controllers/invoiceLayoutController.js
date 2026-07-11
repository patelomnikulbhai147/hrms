/**
 * Visual Invoice Designer — per-company named canvas layouts (invoice_layouts).
 * Additive & isolated: the classic flow templates (invoice_settings.designJson)
 * and all invoice/GST/numbering logic are untouched. An invoice renders a canvas
 * layout ONLY when a company has one marked active (isDefault). RBAC + scoping
 * reuse the shared invoiceScope helpers.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { canView, canEdit, canManage, actorOf, writeCompanyId, scopedWhere, isSuperAdmin } = require('../utils/invoiceScope');

const MAX_LAYOUT = 500000; // guard against oversized specs

const shape = (r) => ({
  id: r.id, companyId: r.companyId, name: r.name, isDefault: r.isDefault,
  layout: safeParse(r.layoutJson),
  createdAt: r.createdAt, updatedAt: r.updatedAt,
  createdBy: r.createdBy || null, updatedBy: r.updatedBy || null,
});
function safeParse(s) { try { return typeof s === 'string' ? JSON.parse(s) : (s || null); } catch { return null; } }

// A company must not have two templates with the same name (the Saved Templates
// list and the Create-Invoice gallery both key on name). Case-insensitive, and
// `exceptId` lets a rename/update keep its own name. Returns the clashing row or
// null. MySQL's default collation is case-insensitive, but we normalise in JS so
// the guard holds regardless of the column collation.
async function findNameClash(companyId, name, exceptId) {
  const norm = String(name || '').trim().toLowerCase();
  const rows = await prisma.invoiceLayout.findMany({ where: { companyId }, select: { id: true, name: true } });
  return rows.find((r) => r.id !== exceptId && String(r.name || '').trim().toLowerCase() === norm) || null;
}

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
//
// Scope invariant: a write must land in / target the SAME company `list` reads
// from (the active workspace), otherwise a saved template is invisible and an
// update by id 404s ("Layout not found"). Update locates the row via the read
// scope (`scopedWhere`); create targets `writeCompanyId` (workspace-aware).
exports.save = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'No permission.' });
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Please enter a template name.' });

    // The layout must carry at least one canvas block — never persist an empty
    // design. The message is actionable (not a raw internal error).
    const layout = b.layout;
    if (!layout || typeof layout !== 'object') {
      return res.status(400).json({ error: 'Unable to save the template because the invoice layout was not received. Please try again.' });
    }
    if (!Array.isArray(layout.blocks) || layout.blocks.length === 0) {
      return res.status(400).json({ error: 'Add at least one element to the canvas before saving the template.' });
    }
    const layoutJson = JSON.stringify(layout);
    if (layoutJson.length > MAX_LAYOUT) return res.status(413).json({ error: 'This template is too large to save. Please simplify the design.' });

    const id = idParam(req.params.id) || (b.id ? idParam(b.id) : null);
    if (id) {
      // Find within the READ scope — whatever the user can see, they may update.
      const base = scopedWhere(req);
      if (base === null) return res.status(403).json({ error: 'Unauthorized workspace.' });
      const existing = await prisma.invoiceLayout.findFirst({ where: { id, ...base } });
      // The tracked template no longer exists in scope (deleted elsewhere, or the
      // workspace changed). Rather than fail, tell the client to create instead —
      // the frontend retries as a create so the design is never lost.
      if (!existing) return res.status(404).json({ error: 'This template no longer exists. It will be saved as a new template.', code: 'LAYOUT_GONE' });
      const clash = await findNameClash(existing.companyId, name, existing.id);
      if (clash) return res.status(409).json({ error: `A template named "${name}" already exists. Please choose another name.`, code: 'DUPLICATE_NAME' });
      const updated = await prisma.invoiceLayout.update({ where: { id }, data: { name, layoutJson, updatedBy: actorOf(req) } });
      return res.json(shape(updated));
    }
    const companyId = writeCompanyId(req, b.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company before saving a template.' : 'Your account is not linked to a company.' });
    const clash = await findNameClash(companyId, name, null);
    if (clash) return res.status(409).json({ error: `A template named "${name}" already exists. Please choose another name.`, code: 'DUPLICATE_NAME' });
    const created = await prisma.invoiceLayout.create({ data: { companyId, name, layoutJson, createdBy: actorOf(req), updatedBy: actorOf(req) } });
    res.status(201).json(shape(created));
  } catch (e) {
    console.error('invoiceLayout.save failed:', e);
    res.status(500).json({ error: 'An unexpected error occurred while saving the template. Please try again.' });
  }
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
