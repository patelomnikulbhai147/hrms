const prisma = require('../config/prisma');
const leaveService = require('../services/leaveService');
const leaveEligibility = require('../services/leaveEligibilityService');
const { ensureEmployeeProfileForUser } = require('../services/userEmployeeProfileService');
const { notify } = require('../services/notificationService');

const respond = (res, statusCode, success, message, data = null) => {
  res.status(statusCode).json({
    success,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

exports.getLeaveBalances = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const currentYear = new Date().getFullYear();
    const balance = await leaveService.getOrCreateBalance(employee.id, currentYear);
    
    // Convert to a format more mobile-friendly if needed, but existing is fine
    const balanceData = {
        cl: balance.cl,
        pl: balance.pl,
        sl: balance.sl,
        year: balance.year
    };

    return respond(res, 200, true, 'Leave balances retrieved.', balanceData);
  } catch (error) {
    console.error('[mobileLeaveController.getLeaveBalances] Error:', error);
    return respond(res, 500, false, 'Failed to fetch leave balances.');
  }
};

exports.getLeaveHistory = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const { page = 1, limit = 20, status } = req.query;
    
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where = { employeeId: employee.id };
    if (status) {
        where.status = String(status);
    }

    const [leaves, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.leaveRequest.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      message: 'Leave history retrieved.',
      data: leaves,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[mobileLeaveController.getLeaveHistory] Error:', error);
    return respond(res, 500, false, 'Failed to fetch leave history.');
  }
};

exports.applyLeave = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const { leaveType, fromDate, toDate, days, reason, allowLWP } = req.body;
    
    if (!leaveType || !fromDate || !toDate || !days || !reason) {
        return respond(res, 400, false, 'leaveType, fromDate, toDate, days, and reason are required.');
    }

    const year = new Date(fromDate).getFullYear();

    // 1. Eligibility Check
    const eligibility = await leaveEligibility.resolveEligibility(employee.id, leaveType);
    if (!eligibility.ok) {
        return res.status(403).json({
            success: false,
            message: eligibility.message,
            code: eligibility.code
        });
    }

    // 2. Balance Validation
    const v = await leaveService.validate(employee.id, leaveType, days, year);
    if (!v.ok && !allowLWP) {
        return res.status(409).json({
            success: false,
            message: v.message,
            available: v.available,
            category: v.category
        });
    }

    // 3. Create Request
    const leaveData = {
        companyId: employee.companyId,
        employeeId: employee.id,
        employeeName: employee.name,
        department: employee.department || 'General',
        leaveType,
        fromDate,
        toDate,
        days: parseFloat(days),
        reason,
        status: 'Pending',
        appliedOn: new Date().toISOString().split('T')[0],
        paidDays: v.paidDays,
        lwpDays: v.lwpDays
    };

    const newLeave = await prisma.leaveRequest.create({ data: leaveData });

    // Notify HR / Admins
    try {
      await notify({
        companyId: newLeave.companyId, 
        type: 'leave_request', 
        title: 'New Leave Request',
        message: `${newLeave.employeeName} applied for ${newLeave.leaveType} (${newLeave.days} day${newLeave.days === 1 ? '' : 's'}) from ${newLeave.fromDate}.`,
        priority: 'medium'
      });
    } catch (e) { /* silent */ }

    return respond(res, 201, true, 'Leave applied successfully.', newLeave);
  } catch (error) {
    console.error('[mobileLeaveController.applyLeave] Error:', error);
    return respond(res, 500, false, 'Failed to apply leave.');
  }
};

exports.cancelLeave = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const leaveId = parseInt(req.params.id, 10);
    const existing = await prisma.leaveRequest.findUnique({
        where: { id: leaveId }
    });

    if (!existing) {
        return respond(res, 404, false, 'Leave request not found.');
    }

    if (existing.employeeId !== employee.id) {
        return respond(res, 403, false, 'You can only cancel your own leave requests.');
    }

    if (existing.status !== 'Pending') {
        return respond(res, 400, false, `Cannot cancel a leave request that is ${existing.status}.`);
    }

    const updated = await prisma.leaveRequest.update({
        where: { id: leaveId },
        data: { status: 'Cancelled' }
    });

    return respond(res, 200, true, 'Leave request cancelled successfully.', updated);
  } catch (error) {
    console.error('[mobileLeaveController.cancelLeave] Error:', error);
    return respond(res, 500, false, 'Failed to cancel leave.');
  }
};

exports.getLeaveStatus = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const leaveId = parseInt(req.params.id, 10);
    const leave = await prisma.leaveRequest.findUnique({
        where: { id: leaveId }
    });

    if (!leave || leave.employeeId !== employee.id) {
        return respond(res, 404, false, 'Leave request not found.');
    }

    return respond(res, 200, true, 'Leave status retrieved.', leave);
  } catch (error) {
    console.error('[mobileLeaveController.getLeaveStatus] Error:', error);
    return respond(res, 500, false, 'Failed to fetch leave status.');
  }
};
