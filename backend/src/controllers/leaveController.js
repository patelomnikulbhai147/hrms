const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const leaveService = require('../services/leaveService');
const AuditService = require('../services/auditService');
const { notify } = require('../services/notificationService');

// The login user (if any) linked to an employee record — so leave decisions can
// be delivered straight to that employee's notification bell.
async function userIdForEmployee(employeeId) {
  if (!employeeId) return null;
  const u = await prisma.user.findFirst({ where: { employeeId: Number(employeeId) }, select: { id: true } }).catch(() => null);
  return u ? u.id : null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthNameOf = (dateStr) => {
  const d = new Date(dateStr);
  return isNaN(d) ? MONTHS[5] : MONTHS[d.getMonth()];
};
const yearOf = (dateStr) => {
  const d = new Date(dateStr);
  return isNaN(d) ? leaveService.DEFAULT_YEAR : d.getFullYear();
};

// Flag the employee's payroll for the leave month as needing regeneration.
async function markPayrollOutdated(employeeId, month, year) {
  try {
    await prisma.payroll.updateMany({
      where: { employeeId: Number(employeeId), month, year: Number(year) },
      data: { isOutdated: true },
    });
  } catch (e) { console.error('markPayrollOutdated failed:', e.message); }
}

exports.getAll = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      whereClause = {
        OR: [
          { companyId: { in: allowedIds } },
          { employee: { branchId: { in: allowedIds } } },
          { employee: { companyId: { in: allowedIds } } }
        ]
      };
      if (companyId) {
        whereClause = {
          OR: [
            { companyId },
            { employee: { branchId: companyId } },
            { employee: { companyId: companyId } }
          ]
        };
      }
    } else if (companyId) {
      whereClause = {
        OR: [
          { companyId },
          { employee: { branchId: companyId } },
          { employee: { companyId: companyId } }
        ]
      };
    }

    const data = await prisma.leaveRequest.findMany({ where: whereClause });
    res.json(data);
  } catch (error) {
    console.error('Error fetching', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const body = { ...req.body };
    const employeeId = Number(body.employeeId);
    const days = Number(body.days) || 0;
    const year = yearOf(body.fromDate);

    // Balance validation: CL/PL/SL cannot be requested beyond available balance.
    // LWP and special types (maternity etc.) are always allowed.
    const v = await leaveService.validate(employeeId, body.leaveType, days, year);
    if (!v.ok && !body.allowLWP) {
      return res.status(409).json({ error: v.message, available: v.available, category: v.category });
    }
    body.paidDays = v.paidDays;
    body.lwpDays = v.lwpDays;

    const data = await prisma.leaveRequest.create({ data: body });
    // Notify HR / admins (company-wide) that a leave request needs action.
    try {
      await notify({
        companyId: data.companyId, type: 'leave_request', title: 'New Leave Request',
        message: `${data.employeeName} applied for ${data.leaveType} (${data.days} day${data.days === 1 ? '' : 's'}) from ${data.fromDate}.`,
        priority: 'medium',
      });
    } catch (e) { /* non-fatal */ }
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const patch = { ...req.body };
    const existing = await prisma.leaveRequest.findUnique({ where: { id: idParam(id) } });
    if (!existing) return res.status(404).json({ error: 'Leave request not found' });

    const month = monthNameOf(existing.fromDate);
    const year = yearOf(existing.fromDate);
    const newStatus = patch.status;
    const wasApproved = existing.status === 'Approved';
    const actor = req.user || {};

    // ── Transition: → Approved : deduct balance, split LWP, flag payroll ──
    if (newStatus === 'Approved' && !wasApproved) {
      const { paidDays, lwpDays } = await leaveService.deduct(existing.employeeId, existing.leaveType, existing.days, year);
      patch.paidDays = paidDays;
      patch.lwpDays = lwpDays;
      if (!patch.approvedOn) patch.approvedOn = new Date().toISOString().slice(0, 10);
      if (!patch.approvedBy && actor.name) patch.approvedBy = actor.name;
      await markPayrollOutdated(existing.employeeId, month, year);
      if (actor.id) {
        await AuditService.logAudit(actor.id, 'APPROVE_LEAVE', 'Leaves', String(existing.id), {
          employee: existing.employeeName, type: existing.leaveType, days: existing.days,
          paidDays, lwpDays, month, year, by: actor.name, role: actor.role,
        });
      }
    }

    // ── Transition: Approved → Rejected/Cancelled/Pending : restore balance ──
    if (wasApproved && newStatus && ['Rejected', 'Cancelled', 'Pending'].includes(newStatus)) {
      await leaveService.restore(existing.employeeId, existing.leaveType, existing.paidDays, year);
      patch.paidDays = 0;
      patch.lwpDays = 0;
      await markPayrollOutdated(existing.employeeId, month, year);
      if (actor.id) {
        await AuditService.logAudit(actor.id, 'REVERSE_LEAVE', 'Leaves', String(existing.id), {
          employee: existing.employeeName, type: existing.leaveType, restored: existing.paidDays,
          newStatus, by: actor.name, role: actor.role,
        });
      }
    }

    const data = await prisma.leaveRequest.update({ where: { id: idParam(id) }, data: patch });

    // Notify the employee when their request is approved or rejected.
    if (newStatus && newStatus !== existing.status && ['Approved', 'Rejected'].includes(newStatus)) {
      try {
        const empUserId = await userIdForEmployee(existing.employeeId);
        await notify({
          userId: empUserId, companyId: existing.companyId, type: newStatus === 'Approved' ? 'leave_approved' : 'leave_rejected',
          title: newStatus === 'Approved' ? 'Leave Approved' : 'Leave Rejected',
          message: `Your ${existing.leaveType} leave (${existing.days} day${existing.days === 1 ? '' : 's'}) from ${existing.fromDate} was ${newStatus.toLowerCase()}${actor.name ? ` by ${actor.name}` : ''}.`,
          priority: newStatus === 'Rejected' ? 'high' : 'medium',
        });
      } catch (e) { /* non-fatal */ }
    }
    res.json(data);
  } catch (error) {
    console.error('Error updating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.leaveRequest.findUnique({ where: { id: idParam(id) } });
    // Restore balance if a still-approved leave is deleted.
    if (existing && existing.status === 'Approved' && existing.paidDays > 0) {
      await leaveService.restore(existing.employeeId, existing.leaveType, existing.paidDays, yearOf(existing.fromDate));
    }
    await prisma.leaveRequest.delete({ where: { id: idParam(id) } });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
