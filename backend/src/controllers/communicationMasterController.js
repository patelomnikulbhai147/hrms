// ─────────────────────────────────────────────────────────────────────────────
// Master Template Library controller (Enterprise Communication Workflow — Step 1).
//
// A PLATFORM-level catalog governed by Super Admin. Company Head / HR may BROWSE
// it (to copy templates into their own library) but can NEVER modify it. Lives at
// /api/communication-master — deliberately OUTSIDE the company-scoped
// /api/communication gate (which blocks Super Admin), because managing the master
// catalog is a Super-Admin platform responsibility.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');
const { generateMasterTemplates, MASTER_CATEGORIES } = require('../data/masterTemplateLibrary');

const MASTER_FIELDS = ['title', 'category', 'festivalKey', 'subject', 'body', 'placeholders', 'layout', 'backgroundImage', 'whatsappCompatible', 'whatsappCaption', 'status', 'sortOrder'];
function pick(body) {
  const d = {};
  for (const k of MASTER_FIELDS) if (body[k] !== undefined) d[k] = body[k];
  if (d.layout && typeof d.layout === 'object') d.layout = JSON.stringify(d.layout);
  if (d.placeholders && typeof d.placeholders === 'object') d.placeholders = JSON.stringify(d.placeholders);
  if (d.festivalKey == null) d.festivalKey = '';
  return d;
}
const sendErr = (res, e, where) => {
  console.error(`[communication-master] ${where}:`, e.message);
  if (e.code === 'P2025') return res.status(404).json({ error: 'Master template not found.' });
  res.status(500).json({ error: 'Master library operation failed.' });
};

// GET /  — browse the catalog (any authenticated user; used by company copy UI).
exports.list = async (req, res) => {
  try {
    const where = { status: { not: 'Deleted' } };
    if (req.query.category) where.category = String(req.query.category);
    if (req.query.status) where.status = String(req.query.status);
    const items = await prisma.communicationMasterTemplate.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    res.json(items);
  } catch (e) { sendErr(res, e, 'list'); }
};

exports.categories = (_req, res) => res.json(MASTER_CATEGORIES);

// GET /stats — quick counts (used by Super Admin dashboard).
exports.stats = async (_req, res) => {
  try {
    const total = await prisma.communicationMasterTemplate.count({ where: { status: 'Active' } });
    const grouped = await prisma.communicationMasterTemplate.groupBy({ by: ['category'], where: { status: 'Active' }, _count: { id: true } });
    res.json({ total, byCategory: grouped.map((g) => ({ category: g.category, count: g._count.id })), categories: MASTER_CATEGORIES.length });
  } catch (e) { sendErr(res, e, 'stats'); }
};

// POST /  — Super Admin creates a master template.
exports.create = async (req, res) => {
  try {
    const data = pick(req.body);
    if (!data.title || !data.category) return res.status(400).json({ error: 'Title and category are required.' });
    data.createdBy = req.user?.name || req.user?.email || 'Super Admin';
    const created = await prisma.communicationMasterTemplate.create({ data });
    res.status(201).json(created);
  } catch (e) { sendErr(res, e, 'create'); }
};

// PUT /:id — Super Admin updates a master template.
exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = pick(req.body);
    const updated = await prisma.communicationMasterTemplate.update({ where: { id }, data });
    res.json(updated);
  } catch (e) { sendErr(res, e, 'update'); }
};

// DELETE /:id — Super Admin archives (soft) or removes a master template.
exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (String(req.query.hard) === 'true') await prisma.communicationMasterTemplate.delete({ where: { id } });
    else await prisma.communicationMasterTemplate.update({ where: { id }, data: { status: 'Archived' } });
    res.json({ message: 'Done' });
  } catch (e) { sendErr(res, e, 'remove'); }
};

// POST /seed — Super Admin generates the 100+ template catalog. Idempotent: seeds
// only when empty unless ?force=true (which replaces the auto-generated set but
// preserves any Super-Admin hand-authored rows by leaving non-seed rows intact).
exports.seed = async (req, res) => {
  try {
    const force = String(req.query.force) === 'true';
    const existing = await prisma.communicationMasterTemplate.count();
    if (existing > 0 && !force) return res.json({ seeded: 0, existing, message: 'Master library already seeded. Use ?force=true to regenerate.' });
    if (force) await prisma.communicationMasterTemplate.deleteMany({});
    const rows = generateMasterTemplates().map((r) => ({ ...r, createdBy: req.user?.name || req.user?.email || 'System Seed' }));
    // createMany in one shot (all additive, no relations).
    const result = await prisma.communicationMasterTemplate.createMany({ data: rows });
    res.status(201).json({ seeded: result.count, categories: MASTER_CATEGORIES.length });
  } catch (e) { sendErr(res, e, 'seed'); }
};
