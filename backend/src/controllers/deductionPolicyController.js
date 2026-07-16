// Attendance & Salary Deduction Policy — REST surface for the master calc config.
//   GET  /                → effective policy for the current workspace (+ meta)
//   GET  /versions        → version history for the scope
//   PUT  /                → save a NEW version (Super Admin / Company Head) + audit
//   POST /recalculate     → cascade: recompute attendance summaries + payroll for
//                           a period so the new policy takes effect immediately
//
// The policy itself is the single source of truth — see deductionPolicyService.
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const policyService = require('../services/deductionPolicyService');
const attendanceSummaryService = require('../services/attendanceSummaryService');
const { recalcForEmployeeMonth } = require('./payrollController');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthIndex = (name) => Math.max(0, MONTHS.findIndex((m) => m.toLowerCase() === String(name).toLowerCase()));
const pad = (x) => String(x).padStart(2, '0');

const isSuper = (req) => req.user?.role === 'Super Admin';
const canView = (req) => ['Super Admin', 'Company Head', 'HR', 'Finance', 'Manager', 'Auditor'].includes(req.user?.role);
const canEdit = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);
const actorOf = (req) => req.user?.name || req.user?.email || 'System';

// The workspace company/branch id (SA reads the x-workspace-id header; company
// users are pinned to their own company). May be a branch id — the service
// normalises it to { companyId (parent), branchId }.
function workspaceId(req) {
  if (isSuper(req)) return idParam(req.query.companyId || req.headers['x-workspace-id']) || null;
  return req.user?.companyId || null;
}

async function audit(req, action, details) {
  try {
    if (!req.user?.id) return;
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action,
        module: 'Payroll',
        details: JSON.stringify({ ...details, by: actorOf(req) }).slice(0, 1500),
      },
    });
  } catch (_) { /* audit is best-effort */ }
}

// GET / — effective policy for the current workspace.
exports.getEffective = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const cid = workspaceId(req);
    if (!cid) return res.json({ config: policyService.POLICY_DEFAULTS, version: 0, enabled: true, exists: false, branchScoped: false });
    const eff = await policyService.resolveEffectivePolicy({ companyId: cid });
    res.json({
      config: eff.config,
      version: eff.version,
      enabled: eff.enabled,
      exists: eff.exists,
      branchScoped: eff.branchScoped,
      scope: eff.scope,
      updatedAt: eff.createdAt,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /versions — version history for the scope.
exports.versions = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const cid = workspaceId(req);
    if (!cid) return res.json({ versions: [] });
    const branchLevel = String(req.query.branchLevel || '') === 'true';
    const versions = await policyService.listVersions(cid, branchLevel ? cid : null);
    res.json({ versions });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// PUT / — save a new immutable version. Body: { config, enabled, reason, branchLevel }.
exports.save = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Only Super Admin / Company Head can edit the deduction policy.' });
    const cid = workspaceId(req);
    if (!cid) return res.status(400).json({ error: 'No company in context.' });

    // Company-level saves target the PARENT company (branchId null); a branch
    // override is only stored when the workspace resolves to a real branch.
    const scope = await policyService.resolveScope(cid);
    const branchLevel = !!req.body.branchLevel && scope.branchId != null;
    const row = await policyService.saveNewVersion({
      companyId: scope.companyId,
      branchId: branchLevel ? scope.branchId : null,
      config: req.body.config || {},
      enabled: req.body.enabled,
      reason: req.body.reason,
      createdBy: actorOf(req),
    });
    await audit(req, 'SAVE_DEDUCTION_POLICY', {
      companyId: scope.companyId, branchId: branchLevel ? scope.branchId : null,
      version: row.version, enabled: row.enabled, scope: branchLevel ? 'branch' : 'company',
    });
    res.json({ ok: true, version: row.version, enabled: row.enabled, config: row.config, branchScoped: branchLevel });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /recalculate — apply the current policy to a period by rebuilding each
// employee's AttendanceSummary from raw rows (policy-aware) then re-running the
// single payroll engine (recalcOne stamps the policy version). Locked rows are
// left untouched. Body: { month?, year? } (defaults to the current month).
exports.recalculate = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Only Super Admin / Company Head can trigger a recalculation.' });
    const now = new Date();
    const month = req.body.month || MONTHS[now.getMonth()];
    const year = Number(req.body.year) || now.getFullYear();

    // Scope the payroll rows to the workspace (same rule as payroll recalculate).
    let where = { month, year };
    if (isSuper(req)) {
      const cid = idParam(req.headers['x-workspace-id'] || req.query.companyId || req.body.companyId);
      if (cid) where.companyId = cid;
    } else {
      const allowed = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
      where.OR = [{ companyId: { in: allowed.length ? allowed : [-1] } }, { employee: { branchId: { in: allowed.length ? allowed : [-1] } } }];
    }

    const rows = await prisma.payroll.findMany({ where, select: { employeeId: true } });
    const empIds = [...new Set(rows.map((r) => r.employeeId))];

    const mi = monthIndex(month);
    const last = new Date(year, mi + 1, 0).getDate();
    let recalculated = 0;
    for (const eid of empIds) {
      // Rebuild the summary from raw attendance ONLY when rows exist (otherwise a
      // recompute would zero a seeded/manual summary — same guard as payroll).
      const rawCount = await prisma.attendance
        .count({ where: { employeeId: eid, date: { gte: `${year}-${pad(mi + 1)}-01`, lte: `${year}-${pad(mi + 1)}-${pad(last)}` } } })
        .catch(() => 0);
      if (rawCount > 0) await attendanceSummaryService.recompute(eid, month, year).catch(() => {});
      recalculated += await recalcForEmployeeMonth(eid, month, year).catch(() => 0);
    }

    const eff = await policyService.resolveEffectivePolicy({ companyId: workspaceId(req) }).catch(() => null);
    await audit(req, 'RECALCULATE_POLICY', { month, year, employees: empIds.length, recalculated, version: eff?.version ?? null });
    res.json({ ok: true, month, year, employees: empIds.length, recalculated, version: eff?.version ?? null });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
