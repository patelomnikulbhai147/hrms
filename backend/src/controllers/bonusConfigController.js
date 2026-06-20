/**
 * Bonus Configuration — Phase 1 of the Bonus Management module.
 *
 * Per-company, per-financial-year bonus rule templates. Part of the separate
 * bonus transaction system (never stored on the employee table).
 *   - View   : Super Admin / Company Head / HR / Finance (company-scoped)
 *   - Manage : Super Admin / Company Head (create / edit / delete)
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

const BONUS_TYPES = ['Statutory', 'Festival', 'Performance', 'Ex-Gratia', 'Special'];

const companyScopeFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const canView = (req) => ['Super Admin', 'Company Head', 'HR', 'Finance'].includes(req.user?.role);
const canManage = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);

const num = (v, d) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? d : Number(v));
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';

async function audit(req, action, entityId, details) {
  try {
    await prisma.bonusAuditLog.create({
      data: {
        companyId: details.companyId, cycleId: null, entityType: 'CONFIGURATION', entityId: entityId || null,
        action, performedBy: req.user?.id || null, performedByName: req.user?.name || req.user?.email || null,
        details: JSON.stringify(details),
      },
    });
  } catch { /* audit must never block the main action */ }
}

const shape = (b) => {
  const out = {};
  if (b.bonusType !== undefined) out.bonusType = String(b.bonusType).trim();
  if (b.financialYear !== undefined) out.financialYear = String(b.financialYear).trim();
  if (b.minBonusPercent !== undefined) out.minBonusPercent = num(b.minBonusPercent, 8.33);
  if (b.maxBonusPercent !== undefined) out.maxBonusPercent = num(b.maxBonusPercent, 20);
  if (b.salaryCeiling !== undefined) out.salaryCeiling = b.salaryCeiling === '' || b.salaryCeiling === null ? null : num(b.salaryCeiling, null);
  if (b.minWorkingDays !== undefined) out.minWorkingDays = num(b.minWorkingDays, 30);
  if (b.includeLeaveDays !== undefined) out.includeLeaveDays = bool(b.includeLeaveDays);
  if (b.includeOvertime !== undefined) out.includeOvertime = bool(b.includeOvertime);
  if (b.isActive !== undefined) out.isActive = bool(b.isActive);
  return out;
};

function targetCompanyId(req, requested) {
  if (isSuperAdmin(req)) return idParam(requested) || null;
  return req.user?.companyId || null;
}

exports.getAll = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view bonus configurations.' });
    const workspaceId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let where = {};
    if (!isSuperAdmin(req)) {
      const scope = companyScopeFor(req);
      where.companyId = { in: scope.length ? scope : [-1] };
      if (workspaceId && !scope.includes(workspaceId)) return res.status(403).json({ error: 'Unauthorized to view this workspace.' });
      if (workspaceId) where.companyId = workspaceId;
    } else if (workspaceId) {
      where.companyId = workspaceId;
    }
    const rows = await prisma.bonusConfiguration.findMany({ where, orderBy: [{ financialYear: 'desc' }, { bonusType: 'asc' }] });
    res.json(rows);
  } catch (e) {
    console.error('bonusConfig.getAll', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to manage bonus configurations.' });
    const b = req.body || {};
    if (!b.bonusType || !BONUS_TYPES.includes(String(b.bonusType).trim())) return res.status(400).json({ error: 'A valid bonus type is required.' });
    if (!b.financialYear || !String(b.financialYear).trim()) return res.status(400).json({ error: 'Financial year is required.' });

    const companyId = targetCompanyId(req, b.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return res.status(400).json({ error: 'Selected company does not exist.' });

    const data = { ...shape(b), companyId };
    if (data.maxBonusPercent < data.minBonusPercent) return res.status(400).json({ error: 'Maximum bonus % cannot be less than minimum bonus %.' });

    const row = await prisma.bonusConfiguration.create({ data });
    await audit(req, 'CREATE', row.id, { companyId, bonusType: row.bonusType, financialYear: row.financialYear });
    res.status(201).json(row);
  } catch (e) {
    console.error('bonusConfig.create', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to manage bonus configurations.' });
    const id = idParam(req.params.id);
    const existing = await prisma.bonusConfiguration.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Configuration not found.' });
    if (!isSuperAdmin(req) && !companyScopeFor(req).includes(existing.companyId)) {
      return res.status(403).json({ error: 'Unauthorized for this configuration.' });
    }
    const b = req.body || {};
    if (b.bonusType !== undefined && !BONUS_TYPES.includes(String(b.bonusType).trim())) return res.status(400).json({ error: 'Invalid bonus type.' });
    const data = shape(b);
    const minP = data.minBonusPercent ?? existing.minBonusPercent;
    const maxP = data.maxBonusPercent ?? existing.maxBonusPercent;
    if (maxP < minP) return res.status(400).json({ error: 'Maximum bonus % cannot be less than minimum bonus %.' });

    const row = await prisma.bonusConfiguration.update({ where: { id }, data });
    await audit(req, 'UPDATE', id, { companyId: existing.companyId, fields: Object.keys(data) });
    res.json(row);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Configuration not found.' });
    console.error('bonusConfig.update', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to manage bonus configurations.' });
    const id = idParam(req.params.id);
    const existing = await prisma.bonusConfiguration.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Configuration not found.' });
    if (!isSuperAdmin(req) && !companyScopeFor(req).includes(existing.companyId)) {
      return res.status(403).json({ error: 'Unauthorized for this configuration.' });
    }
    const inUse = await prisma.bonusCycle.count({ where: { configId: id } });
    if (inUse > 0) return res.status(409).json({ error: `Cannot delete: ${inUse} bonus cycle(s) use this configuration. Deactivate it instead.` });
    await prisma.bonusConfiguration.delete({ where: { id } });
    await audit(req, 'DELETE', id, { companyId: existing.companyId, bonusType: existing.bonusType, financialYear: existing.financialYear });
    res.json({ message: 'Deleted' });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Configuration not found.' });
    console.error('bonusConfig.remove', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
