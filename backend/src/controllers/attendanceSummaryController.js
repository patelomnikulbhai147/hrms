const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const AuditService = require('../services/auditService');
const summaryService = require('../services/attendanceSummaryService');
const payrollController = require('./payrollController');
const { OFFBOARDED_STATUSES } = require('../utils/employeeStatus');

const allowedIdsFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);

const isSuper = (req) => req.user?.role === 'Super Admin';

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const payableOf = (s) => round(s.presentDays + s.halfDays * 0.5 + s.cl + s.pl + s.sl);

// Month-aware payroll rule: a period is "active" (eligible for AUTOMATIC payroll
// recalculation after an attendance edit) only while it is still being worked —
// i.e. at least one payroll row for that employee/month is NOT finalized
// (approved / locked / paid). Editing a historical, finalized month must only
// FLAG payroll as outdated ("recalculation recommended"), never silently modify
// it. This protects already-approved/paid months from back-dated changes.
async function periodIsActive(employeeId, month, year) {
  const rows = await prisma.payroll.findMany({
    where: { employeeId: Number(employeeId), month, year },
    select: { payrollStatus: true, paymentStatus: true },
  });
  if (!rows.length) return false;
  const finalized = (r) =>
    ['approved', 'locked', 'paid'].includes(String(r.payrollStatus || '').toLowerCase()) ||
    String(r.paymentStatus || '').toLowerCase() === 'paid';
  return rows.some((r) => !finalized(r));
}

// Is the summary's employee inside the caller's workspace scope?
function inScope(req, summaryEmployee) {
  if (isSuper(req)) return true;
  const ids = allowedIdsFor(req).map(String);
  return ids.includes(String(summaryEmployee.companyId)) || ids.includes(String(summaryEmployee.branchId));
}

// GET /api/attendance-summary?month=June&year=2026
exports.getAll = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    const month = req.query.month || undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;

    let empWhere = {};
    if (!isSuper(req)) {
      const ids = allowedIdsFor(req);
      empWhere = { OR: [{ companyId: { in: ids } }, { branchId: { in: ids } }] };
    } else if (companyId) {
      empWhere = { OR: [{ companyId }, { branchId: companyId }] };
    }

    const rows = await prisma.attendanceSummary.findMany({
      where: { ...(month ? { month } : {}), ...(year ? { year } : {}), employee: empWhere },
      include: { employee: { select: { id: true, employeeId: true, name: true, branchId: true, companyId: true, branchLocation: true, department: true } } },
    });
    res.json(rows.map(s => ({
      id: s.id, employeeId: s.employeeId, month: s.month, year: s.year,
      employeeCode: s.employee?.employeeId, employeeName: s.employee?.name,
      department: s.employee?.department, branchId: s.employee?.branchId,
      branchLocation: s.employee?.branchLocation, companyId: s.employee?.companyId,
      presentDays: s.presentDays, absentDays: s.absentDays, cl: s.cl, pl: s.pl, sl: s.sl,
      lwp: s.lwp, halfDays: s.halfDays, otHours: s.otHours, shift: s.shift,
      payableDays: s.payableDays, locked: s.locked, updatedBy: s.updatedBy, updatedAt: s.updatedAt,
    })));
  } catch (e) {
    console.error('summary getAll', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST /api/attendance-summary/recompute  { employeeIds?, month, year, companyId? }
// Rebuilds summaries from raw attendance + approved leaves (skips locked rows).
exports.recompute = async (req, res) => {
  try {
    const month = req.body.month || 'June';
    const year = Number(req.body.year) || 2026;
    let employeeIds = req.body.employeeIds;

    if (!Array.isArray(employeeIds) || !employeeIds.length) {
      const companyId = idParam(req.body.companyId || req.headers['x-workspace-id']);
      // Offboarded employees are excluded from attendance-summary recompute.
      let empWhere = { status: { notIn: OFFBOARDED_STATUSES } };
      if (!isSuper(req)) {
        const ids = allowedIdsFor(req);
        empWhere.OR = [{ companyId: { in: ids } }, { branchId: { in: ids } }];
      } else if (companyId) {
        empWhere.OR = [{ companyId }, { branchId: companyId }];
      }
      const emps = await prisma.employee.findMany({ where: empWhere, select: { id: true } });
      employeeIds = emps.map(e => e.id);
    }
    for (const eid of employeeIds) await summaryService.recompute(Number(eid), month, year);
    res.json({ recomputed: employeeIds.length, month, year });
  } catch (e) {
    console.error('summary recompute', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// PUT /api/attendance-summary/:id  — edit the editable fields (role-gated, lock-aware, audited)
exports.update = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const existing = await prisma.attendanceSummary.findUnique({
      where: { id: idParam(id) },
      include: { employee: { select: { companyId: true, branchId: true, name: true, employeeId: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Attendance summary not found' });
    if (!inScope(req, existing.employee)) return res.status(403).json({ error: 'Outside your workspace scope.' });

    // Lock rule: a locked month can only be edited by Super Admin.
    if (existing.locked && !isSuper(req)) {
      return res.status(423).json({ error: 'Month Locked — only a Super Admin can edit a locked payroll month.' });
    }

    const EDITABLE = ['presentDays', 'absentDays', 'cl', 'pl', 'sl', 'lwp', 'halfDays', 'otHours'];
    const data = {};
    for (const f of EDITABLE) if (req.body[f] !== undefined) data[f] = round(req.body[f]);
    if (req.body.shift !== undefined) data.shift = req.body.shift;

    const next = { ...existing, ...data };
    data.payableDays = payableOf(next);
    data.updatedBy = req.user?.name || 'system';

    const updated = await prisma.attendanceSummary.update({ where: { id: idParam(id) }, data });

    // Attendance is the source of truth. ALWAYS flag this month's payroll as
    // outdated so the UI shows "Payroll Recalculation Required". Then, ONLY when
    // the period is still active (non-finalized), AUTO-recompute payroll from the
    // new summary so the active month's dashboard/reports reflect the change with
    // no manual step. A historical/finalized month is left untouched — flagged
    // only ("recalculation recommended"), never silently modified.
    await prisma.payroll.updateMany({
      where: { employeeId: existing.employeeId, month: existing.month, year: existing.year },
      data: { isOutdated: true },
    });
    let payrollSynced = 0;
    const monthActive = await periodIsActive(existing.employeeId, existing.month, existing.year);
    if (monthActive) {
      try {
        payrollSynced = await payrollController.recalcForEmployeeMonth(existing.employeeId, existing.month, existing.year);
      } catch (syncErr) {
        console.error('Auto payroll sync after attendance edit failed:', syncErr.message);
      }
    }

    // Audit old → new for the changed fields.
    if (req.user?.id) {
      const changes = {};
      for (const f of [...EDITABLE, 'shift']) {
        if (data[f] !== undefined && existing[f] !== data[f]) changes[f] = { from: existing[f], to: data[f] };
      }
      await AuditService.logAudit(req.user.id, 'EDIT_ATTENDANCE', 'Attendance', String(existing.employeeId), {
        employee: existing.employee?.name, code: existing.employee?.employeeId,
        month: existing.month, year: existing.year, changes,
        by: req.user.name, role: req.user.role,
      });
    }

    res.json({ ...updated, payrollSynced, payrollMonthActive: monthActive });
  } catch (e) {
    console.error('summary update', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

module.exports = exports;
