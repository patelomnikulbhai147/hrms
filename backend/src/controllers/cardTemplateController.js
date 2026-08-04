// Employee Card Designer — per-company custom/edited card templates. Built-in
// templates live in the frontend; this stores only what a company creates or
// customises. Templates are private to their company unless a Super Admin marks
// one `shared`.
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { canView, canEdit, canManage, actorOf, readCompanyId, scopedWhere, isSuperAdmin } = require('../utils/cardScope');

// Templates may now carry their own uploaded artwork (a company's own card
// design), so the old 400 KB ceiling — written when images were assumed to live
// on the employee record — would reject every custom upload with a 413.
//
// 4 MB comfortably fits a front and a back image after the client's downscale
// (~1.2 MB each) plus the element list, while still refusing a template heavy
// enough to bog down the gallery, which loads every spec to draw its thumbnails.
// The database itself is not the constraint (max_allowed_packet is 512 MB here).
const MAX_SPEC = 4_000_000;

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
    // Sorted in JS, deliberately NOT by MySQL.
    //
    // `spec` holds a template's whole design, and since custom uploads were
    // allowed it can carry megabytes of base64 artwork. Asking MySQL to ORDER BY
    // makes it materialise and sort rows that wide, which overflows sort_buffer_size
    // on the production instance and fails the whole query with
    //   ERROR 1038 "Out of sort memory, consider increasing server sort buffer size"
    // — so the gallery 500'd as soon as a company uploaded its first design.
    //
    // Sorting here costs nothing (a company has a handful of templates) and does
    // not depend on how the database server happens to be tuned. Ordering is
    // unchanged: default first, then most recently updated.
    const rows = await prisma.cardTemplate.findMany({ where });
    rows.sort((a, b) =>
      (b.isDefault === true) - (a.isDefault === true)
      || new Date(b.updatedAt) - new Date(a.updatedAt));
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

// ── Active template (the one shown in Generate & Preview) ────────────────────
// Stored per company in card_active_templates. Unlike setDefault (which flips a
// flag on a custom card_templates row and therefore can't point at a built-in),
// this holds a plain template id — a built-in id ("glassmorphism") OR "db:<n>".

// The card_active_templates table is addressed via raw SQL so this works with the
// currently-generated Prisma client (no `prisma generate` / restart required). The
// matching model in schema.prisma keeps future migrations drift-free.

// GET /api/card-templates/active — the company's active template id (or null).
exports.getActive = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const companyId = readCompanyId(req);
    if (!companyId) return res.json({ templateId: null });
    const rows = await prisma.$queryRawUnsafe(
      'SELECT templateId FROM `card_active_templates` WHERE companyId = ? LIMIT 1', Number(companyId),
    );
    res.json({ templateId: rows && rows[0] ? rows[0].templateId : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /api/card-templates/active — { templateId } sets the company's active template.
// One row per company (companyId is UNIQUE) → upsert via INSERT … ON DUPLICATE KEY.
exports.setActive = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised to change the active template.' });
    const companyId = readCompanyId(req, req.body && req.body.companyId);
    if (!companyId) return res.status(400).json({ error: 'Company context required.' });
    const templateId = String((req.body && req.body.templateId) || '').trim();
    if (!templateId) return res.status(400).json({ error: 'templateId is required.' });
    await prisma.$executeRawUnsafe(
      'INSERT INTO `card_active_templates` (companyId, templateId, updatedBy, createdAt, updatedAt) '
      + 'VALUES (?, ?, ?, NOW(3), NOW(3)) '
      + 'ON DUPLICATE KEY UPDATE templateId = VALUES(templateId), updatedBy = VALUES(updatedBy), updatedAt = NOW(3)',
      Number(companyId), templateId, actorOf(req),
    );
    res.json({ templateId });
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
