// ─────────────────────────────────────────────────────────────────────────────
// PLAN CONFIG (Super Admin) — CRUD for the editable subscription-plan master
// records + global platform settings. This is the master configuration for the
// whole application: the permission engine (planEntitlements) reads its
// entitlements from these records, so a change here re-permissions every company
// on that plan on the NEXT request — no code change, no redeploy.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');
const store = require('../services/planStore');
const AuditService = require('../services/auditService');
const reportCtrl = require('./complianceReportController');

const actorOf = (req) => req.user?.name || req.user?.email || 'Super Admin';

// ── GET /api/plan-config — every editable plan definition ────────────────────
exports.list = async (req, res) => {
  try {
    const plans = store.getPlans();
    // Attach a live usage count so the UI can warn before delete + show adoption.
    const counts = await prisma.company.groupBy({ by: ['plan'], where: { isArchived: false }, _count: { _all: true } }).catch(() => []);
    const byPlan = new Map(counts.map((c) => [String(c.plan), c._count._all]));
    return res.json(plans.map((p) => ({ ...p, companyCount: byPlan.get(p.key) || 0 })));
  } catch (e) {
    console.error('[planConfig.list]', e);
    return res.status(500).json({ error: 'Failed to load plans.' });
  }
};

// ── GET /api/plan-config/metadata — modules / reports / features / limits ────
exports.metadata = (req, res) => {
  try {
    let reports = [];
    try { reports = reportCtrl.reportCatalogMeta(); } catch (_) { reports = []; }
    // Group reports by category for the checkbox UI.
    const byCat = {};
    for (const r of reports) { (byCat[r.category] = byCat[r.category] || []).push(r); }
    const reportGroups = Object.entries(byCat).map(([category, items]) => ({ category, items }));
    return res.json({
      modules: store.MODULE_CATALOG,
      premiumModules: store.PREMIUM_MODULES,
      features: store.FEATURE_CATALOG,
      limits: store.LIMIT_CATALOG,
      reports,
      reportGroups,
      billingCycles: ['Quarterly', 'Yearly'],
    });
  } catch (e) {
    console.error('[planConfig.metadata]', e);
    return res.status(500).json({ error: 'Failed to load plan metadata.' });
  }
};

// ── GET/PUT /api/plan-config/settings — global platform settings ─────────────
exports.getSettings = (req, res) => res.json(store.getSettings());
exports.updateSettings = (req, res) => {
  try {
    const saved = store.saveSettings(req.body || {});
    if (req.user?.id) AuditService.logAudit(req.user.id, 'UPDATE_PLAN_SETTINGS', 'Subscriptions', 'settings', { by: actorOf(req) }).catch(() => {});
    return res.json(saved);
  } catch (e) {
    console.error('[planConfig.updateSettings]', e);
    return res.status(500).json({ error: 'Failed to save settings.' });
  }
};

// ── POST /api/plan-config — create a new (custom) plan ───────────────────────
exports.create = (req, res) => {
  try {
    const b = req.body || {};
    const key = String(b.key || b.name || '').trim();
    if (!key) return res.status(400).json({ error: 'Plan name is required.' });
    if (store.getPlan(key)) return res.status(409).json({ error: 'A plan with this name already exists.' });
    const saved = store.upsertPlan({ ...b, key, isSystem: false });
    if (req.user?.id) AuditService.logAudit(req.user.id, 'CREATE_PLAN', 'Subscriptions', key, { by: actorOf(req), plan: key }).catch(() => {});
    return res.status(201).json(saved);
  } catch (e) {
    console.error('[planConfig.create]', e);
    return res.status(500).json({ error: 'Failed to create plan.' });
  }
};

// ── PUT /api/plan-config/:key — update a plan's config (the master edit) ──────
exports.update = (req, res) => {
  try {
    const key = req.params.key;
    const existing = store.getPlan(key);
    if (!existing) return res.status(404).json({ error: 'Plan not found.' });
    // Merge onto the existing record so a partial save can't wipe unspecified
    // sections (limits/features/modules/reports).
    const merged = {
      ...existing,
      ...req.body,
      key: existing.key, // key is immutable on update
      limits: { ...existing.limits, ...(req.body?.limits || {}) },
      features: { ...existing.features, ...(req.body?.features || {}) },
    };
    const saved = store.upsertPlan(merged);
    if (req.user?.id) AuditService.logAudit(req.user.id, 'UPDATE_PLAN', 'Subscriptions', key, { by: actorOf(req), plan: key }).catch(() => {});
    return res.json(saved);
  } catch (e) {
    console.error('[planConfig.update]', e);
    return res.status(500).json({ error: 'Failed to update plan.' });
  }
};

// ── DELETE /api/plan-config/:key — remove a non-system plan (if unused) ───────
exports.remove = async (req, res) => {
  try {
    const key = req.params.key;
    const existing = store.getPlan(key);
    if (!existing) return res.status(404).json({ error: 'Plan not found.' });
    if (existing.isSystem) return res.status(400).json({ error: 'System plans cannot be deleted.' });
    const inUse = await prisma.company.count({ where: { plan: key, isArchived: false } }).catch(() => 0);
    if (inUse > 0) return res.status(409).json({ error: `Cannot delete — ${inUse} company(ies) are on this plan. Move them to another plan first.` });
    store.deletePlan(key);
    if (req.user?.id) AuditService.logAudit(req.user.id, 'DELETE_PLAN', 'Subscriptions', key, { by: actorOf(req), plan: key }).catch(() => {});
    return res.json({ ok: true });
  } catch (e) {
    console.error('[planConfig.remove]', e);
    return res.status(500).json({ error: 'Failed to delete plan.' });
  }
};
