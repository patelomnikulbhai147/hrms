const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const leaveService = require('../services/leaveService');
const AuditService = require('../services/auditService');

const allowedIdsFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);

// ── Leave Credit Master ──────────────────────────────────────────────────────
exports.getConfig = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']) || req.user?.companyId || 1;
    const year = Number(req.query.year) || leaveService.DEFAULT_YEAR;
    const cfg = await leaveService.getOrCreateConfig(companyId, year);
    res.json(cfg);
  } catch (e) {
    console.error('getConfig', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const companyId = idParam(req.body.companyId || req.query.companyId || req.headers['x-workspace-id']) || req.user?.companyId || 1;
    const year = Number(req.body.year) || leaveService.DEFAULT_YEAR;
    const cfg = await leaveService.getOrCreateConfig(companyId, year);
    const numericFields = ['startMonth', 'endMonth', 'clPerMonth', 'plPerMonth', 'slPerMonth', 'carryForward', 'maxCarryForward', 'maxEncashmentDays'];
    const boolFields = ['carryForwardEnabled', 'allowEncashment'];
    const data = {};
    for (const f of numericFields) if (req.body[f] !== undefined) data[f] = Number(req.body[f]);
    for (const f of boolFields) if (req.body[f] !== undefined) data[f] = !!req.body[f];
    if (req.body.encashableTypes !== undefined) {
      data.encashableTypes = Array.isArray(req.body.encashableTypes)
        ? req.body.encashableTypes.join(',')
        : String(req.body.encashableTypes);
    }
    const updated = await prisma.leaveCreditConfig.update({ where: { id: cfg.id }, data });
    if (req.user?.id) {
      await AuditService.logAudit(req.user.id, 'UPDATE_LEAVE_CREDIT', 'Leaves', String(cfg.id), { companyId, year, ...data, by: req.user.name });
    }
    res.json(updated);
  } catch (e) {
    console.error('updateConfig', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Employee leave wallets (workspace-scoped) ────────────────────────────────
exports.getBalances = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    const year = Number(req.query.year) || leaveService.DEFAULT_YEAR;

    let empWhere = {};
    if (req.user && req.user.role !== 'Super Admin') {
      const ids = allowedIdsFor(req);
      empWhere = { OR: [{ companyId: { in: ids } }, { branchId: { in: ids } }] };
    } else if (companyId) {
      empWhere = { OR: [{ companyId }, { branchId: companyId }] };
    }

    const balances = await prisma.leaveBalance.findMany({
      where: { year, employee: empWhere },
      include: { employee: { select: { id: true, employeeId: true, name: true, branchId: true, companyId: true } } },
    });
    res.json(balances.map(b => ({
      id: b.id, employeeId: b.employeeId, year: b.year,
      employeeCode: b.employee?.employeeId, employeeName: b.employee?.name,
      branchId: b.employee?.branchId, companyId: b.employee?.companyId,
      clBalance: b.clBalance, plBalance: b.plBalance, slBalance: b.slBalance,
      clUsed: b.clUsed, plUsed: b.plUsed, slUsed: b.slUsed,
      carryForward: b.carryForward, accruedThroughMonth: b.accruedThroughMonth,
    })));
  } catch (e) {
    console.error('getBalances', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// Accrue all employees in scope up to a given month (1-12). Admin action.
exports.accrue = async (req, res) => {
  try {
    const year = Number(req.body.year) || leaveService.DEFAULT_YEAR;
    const throughMonth = Number(req.body.throughMonth) || (new Date(req.body.asOf || '2026-06-15')).getMonth() + 1;
    const companyId = idParam(req.body.companyId || req.headers['x-workspace-id']);

    // Archived (offboarded) employees are EXCLUDED from leave credits.
    let empWhere = { status: 'Active' };
    if (req.user && req.user.role !== 'Super Admin') {
      const ids = allowedIdsFor(req);
      empWhere.OR = [{ companyId: { in: ids } }, { branchId: { in: ids } }];
    } else if (companyId) {
      empWhere.OR = [{ companyId }, { branchId: companyId }];
    }
    const emps = await prisma.employee.findMany({ where: empWhere, select: { id: true } });
    for (const e of emps) await leaveService.accrue(e.id, throughMonth, year);
    res.json({ accrued: emps.length, throughMonth, year });
  } catch (e) {
    console.error('accrue', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// Super-Admin manual balance edit.
exports.updateBalance = async (req, res) => {
  try {
    if (req.user?.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only Super Admin can edit leave balances.' });
    }
    const employeeId = idParam(req.params.employeeId);
    const year = Number(req.body.year) || leaveService.DEFAULT_YEAR;
    const bal = await leaveService.getOrCreateBalance(employeeId, year);
    const fields = ['clBalance', 'plBalance', 'slBalance', 'clUsed', 'plUsed', 'slUsed', 'carryForward'];
    const data = {};
    for (const f of fields) if (req.body[f] !== undefined) data[f] = Number(req.body[f]);
    const updated = await prisma.leaveBalance.update({ where: { id: bal.id }, data });
    await AuditService.logAudit(req.user.id, 'EDIT_LEAVE_BALANCE', 'Leaves', String(employeeId), { ...data, year, by: req.user.name });
    res.json(updated);
  } catch (e) {
    console.error('updateBalance', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
