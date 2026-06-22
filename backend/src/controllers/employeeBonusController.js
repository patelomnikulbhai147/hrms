const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const respondError = require('../utils/respondError');
const AuditService = require('../services/auditService');

const MODULE = 'EmployeeBonus';

// Resolve a one-time bonus amount from the calc method against the employee's
// monthly salary. Percentage bonuses are stored with both percent + resolved
// amount so payroll never has to recompute.
function resolveAmount({ calcMethod, amount, percent }, monthlySalary) {
  if (calcMethod === 'Percentage of Salary') {
    const pct = Number(percent) || 0;
    return Math.round(((Number(monthlySalary) || 0) * pct) / 100);
  }
  return Math.round(Number(amount) || 0);
}

const toDateOrNull = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Company scope guard — non Super Admin users only touch their own companies.
function companyScope(req) {
  if (req.user && req.user.role !== 'Super Admin') {
    return [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
  }
  return null; // null = unrestricted (Super Admin)
}

// GET /api/employee-bonuses?employeeId=&companyId=&month=&year=&status=
exports.list = async (req, res) => {
  try {
    const where = {};
    const employeeId = idParam(req.query.employeeId);
    const companyId = idParam(req.query.companyId);
    if (employeeId) where.employeeId = employeeId;
    if (companyId) where.companyId = companyId;
    if (req.query.month) where.payrollMonth = String(req.query.month);
    if (req.query.year) where.payrollYear = Number(req.query.year);
    if (req.query.status) where.status = String(req.query.status);

    const scope = companyScope(req);
    if (scope) where.companyId = where.companyId && scope.includes(where.companyId) ? where.companyId : { in: scope };

    const rows = await prisma.employeeBonus.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(rows);
  } catch (error) {
    return respondError(res, error);
  }
};

// POST /api/employee-bonuses  — issue a one-time bonus (festival / performance / custom)
exports.create = async (req, res) => {
  try {
    const b = req.body || {};
    const employeeId = idParam(b.employeeId);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required.' });
    if (!b.bonusType) return res.status(400).json({ error: 'bonusType is required.' });

    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, salary: true, name: true },
    });
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const monthlySalary = (Number(emp.salary) || 0) / 12;
    const amount = resolveAmount(b, monthlySalary);

    const row = await prisma.employeeBonus.create({
      data: {
        companyId: emp.companyId,
        employeeId: emp.id,
        source: b.source || 'payroll',
        bonusType: b.bonusType,
        calcMethod: b.calcMethod || 'Fixed Amount',
        amount,
        percent: b.calcMethod === 'Percentage of Salary' ? Number(b.percent) || 0 : null,
        reason: b.reason || null,
        approvedBy: req.user?.id || null,
        approvedByName: req.user?.name || req.user?.email || null,
        approvalDate: b.approvalDate ? toDateOrNull(b.approvalDate) : new Date(),
        effectiveDate: toDateOrNull(b.effectiveDate),
        endDate: toDateOrNull(b.endDate),
        status: b.status || 'Active',
        payrollMonth: b.payrollMonth || null,
        payrollYear: b.payrollYear ? Number(b.payrollYear) : null,
        notes: b.notes || null,
        createdBy: req.user?.id || null,
        createdByName: req.user?.name || req.user?.email || null,
      },
    });

    await AuditService.logAudit(req.user?.id, 'BONUS_CREATED', MODULE, String(row.id), {
      employee: emp.name, type: row.bonusType, amount: row.amount, reason: row.reason,
    });
    res.status(201).json(row);
  } catch (error) {
    return respondError(res, error);
  }
};

// PUT /api/employee-bonuses/:id
exports.update = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const existing = await prisma.employeeBonus.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Bonus record not found.' });

    const b = req.body || {};
    const emp = await prisma.employee.findUnique({ where: { id: existing.employeeId }, select: { salary: true, name: true } });
    const monthlySalary = (Number(emp?.salary) || 0) / 12;

    const calcMethod = b.calcMethod || existing.calcMethod;
    const amount = resolveAmount(
      { calcMethod, amount: b.amount ?? existing.amount, percent: b.percent ?? existing.percent },
      monthlySalary
    );

    const row = await prisma.employeeBonus.update({
      where: { id },
      data: {
        bonusType: b.bonusType ?? existing.bonusType,
        calcMethod,
        amount,
        percent: calcMethod === 'Percentage of Salary' ? Number(b.percent ?? existing.percent) || 0 : null,
        reason: b.reason ?? existing.reason,
        effectiveDate: b.effectiveDate !== undefined ? toDateOrNull(b.effectiveDate) : existing.effectiveDate,
        endDate: b.endDate !== undefined ? toDateOrNull(b.endDate) : existing.endDate,
        status: b.status ?? existing.status,
        payrollMonth: b.payrollMonth ?? existing.payrollMonth,
        payrollYear: b.payrollYear !== undefined ? (b.payrollYear ? Number(b.payrollYear) : null) : existing.payrollYear,
        notes: b.notes ?? existing.notes,
      },
    });

    await AuditService.logAudit(req.user?.id, 'BONUS_UPDATED', MODULE, String(id), {
      employee: emp?.name, before: { amount: existing.amount, status: existing.status },
      after: { amount: row.amount, status: row.status },
    });
    res.json(row);
  } catch (error) {
    return respondError(res, error);
  }
};

// DELETE /api/employee-bonuses/:id  — soft-cancel (keeps history) unless ?hard=1
exports.remove = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const existing = await prisma.employeeBonus.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Bonus record not found.' });

    if (['1', 'true', 'yes'].includes(String(req.query.hard || '').toLowerCase())) {
      await prisma.employeeBonus.delete({ where: { id } });
      await AuditService.logAudit(req.user?.id, 'BONUS_DELETED', MODULE, String(id), { amount: existing.amount });
      return res.json({ message: 'Bonus deleted.' });
    }

    const row = await prisma.employeeBonus.update({ where: { id }, data: { status: 'Cancelled' } });
    await AuditService.logAudit(req.user?.id, 'BONUS_CANCELLED', MODULE, String(id), { amount: existing.amount });
    res.json(row);
  } catch (error) {
    return respondError(res, error);
  }
};

module.exports = exports;
