// Employee Card Designer — per-company custom/edited card templates. Built-in
// templates live in the frontend; this stores only what a company creates or
// customises. Templates are private to their company unless a Super Admin marks
// one `shared`.
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { canView, canEdit, canManage, actorOf, readCompanyId, scopedWhere, isSuperAdmin } = require('../utils/cardScope');

const MAX_SPEC = 400000; // guard against oversized specs (embedded images belong on the employee, not here)

function shape(t) {
  return {
    id: t.id, companyId: t.companyId, name: t.name, category: t.category,
    size: t.size, orientation: t.orientation, builtinId: t.builtinId || null,
    isDefault: t.isDefault, shared: t.shared, custom: true,
    spec: t.spec, updatedAt: t.updatedAt, createdBy: t.createdBy || null,
  };
}

exports.list = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const where = scopedWhere(req);
    if (where === null) return res.status(403).json({ error: 'Unauthorised workspace.' });
    const rows = await prisma.cardTemplate.findMany({ where, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
    res.json({ templates: rows.map(shape) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.get = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const t = await prisma.cardTemplate.findUnique({ where: { id: idParam(req.params.id) } });
    if (!t) return res.status(404).json({ error: 'Template not found.' });
    res.json(shape(t));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// Create (no id) or update (id) a template.
exports.save = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised to edit templates.' });
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Template name is required.' });
    const spec = b.spec;
    if (!spec || typeof spec !== 'object' || !Array.isArray(spec.elements)) {
      return res.status(400).json({ error: 'A valid template design (spec.elements) is required.' });
    }
    if (JSON.stringify(spec).length > MAX_SPEC) return res.status(413).json({ error: 'Template design is too large.' });

    const data = {
      name,
      category: b.category || 'Custom',
      size: b.size || spec.size || 'CR80',
      orientation: b.orientation || spec.orientation || 'portrait',
      builtinId: b.builtinId || spec.builtinId || null,
      spec,
    };

    if (b.id) {
      const id = idParam(b.id);
      const existing = await prisma.cardTemplate.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Template not found.' });
      const cid = readCompanyId(req);
      if (!isSuperAdmin(req) && cid && existing.companyId !== cid && !existing.shared) {
        return res.status(403).json({ error: 'Not your company template.' });
      }
      const updated = await prisma.cardTemplate.update({ where: { id }, data });
      return res.json(shape(updated));
    }

    const companyId = readCompanyId(req, b.companyId);
    if (!companyId) return res.status(400).json({ error: 'Company context required.' });
    const created = await prisma.cardTemplate.create({ data: { ...data, companyId, createdBy: actorOf(req) } });
    res.status(201).json(shape(created));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Not authorised to delete templates.' });
    const id = idParam(req.params.id);
    const existing = await prisma.cardTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Template not found.' });
    const cid = readCompanyId(req);
    if (!isSuperAdmin(req) && cid && existing.companyId !== cid) return res.status(403).json({ error: 'Not your company template.' });
    await prisma.cardTemplate.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// Mark a persisted template as this company's default (unsets the previous one).
exports.setDefault = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised.' });
    const id = idParam(req.params.id);
    const existing = await prisma.cardTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Template not found.' });
    const companyId = existing.companyId;
    await prisma.cardTemplate.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } });
    const updated = await prisma.cardTemplate.update({ where: { id }, data: { isDefault: true } });
    res.json(shape(updated));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// Super Admin only — make a template available to every company (or revoke).
exports.setShared = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Only a Super Admin can share templates across companies.' });
    const id = idParam(req.params.id);
    const existing = await prisma.cardTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Template not found.' });
    const updated = await prisma.cardTemplate.update({ where: { id }, data: { shared: req.body.shared !== false } });
    res.json(shape(updated));
  } catch (e) { res.status(500).json({ error: e.message }); }
};
