const prisma = require('../config/prisma');
const { ensureEmployeeProfileForUser } = require('../services/userEmployeeProfileService');
const AuditService = require('../services/auditService');

const respond = (res, statusCode, success, message, data = null) => {
  res.status(statusCode).json({
    success,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

const getLocalTodayString = () => {
  const today = new Date();
  const tzOffset = today.getTimezoneOffset() * 60000;
  return new Date(today - tzOffset).toISOString().slice(0, 10);
};

exports.getTodayAttendance = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const todayStr = getLocalTodayString();
    const attendance = await prisma.attendance.findFirst({
      where: { employeeId: employee.id, date: todayStr }
    });

    let lateStatus = false;
    let earlyExitStatus = false;
    let shiftTime = '09:00 - 18:00'; // Default assumed shift

    if (attendance) {
        if (attendance.shift) {
            shiftTime = attendance.shift;
        }
        
        // Simple mock late/early calculation against standard 09:00 - 18:00
        if (attendance.clockIn) {
            const clockInTime = new Date(`${todayStr}T${attendance.clockIn}:00`);
            const standardStartTime = new Date(`${todayStr}T09:00:00`); // 9 AM
            if (clockInTime > standardStartTime) lateStatus = true;
        }

        if (attendance.clockOut && attendance.clockOut !== '') {
            const clockOutTime = new Date(`${todayStr}T${attendance.clockOut}:00`);
            const standardEndTime = new Date(`${todayStr}T18:00:00`); // 6 PM
            if (clockOutTime < standardEndTime) earlyExitStatus = true;
        }
    }

    const payload = attendance ? {
        id: attendance.id,
        date: attendance.date,
        shift: shiftTime,
        checkIn: attendance.clockIn || '',
        checkOut: attendance.clockOut || '',
        workingHours: attendance.hoursWorked || 0,
        lateStatus,
        earlyExitStatus,
        status: attendance.status
    } : null;

    return respond(res, 200, true, 'Today attendance retrieved.', payload);
  } catch (error) {
    console.error('[mobileAttendanceController.getTodayAttendance] Error:', error);
    return respond(res, 500, false, 'Failed to fetch today attendance.');
  }
};

exports.getMonthlyAttendance = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const { month, year } = req.query;
    if (!month || !year) {
        return respond(res, 400, false, 'month and year query parameters are required.');
    }

    // Try fetching summary snapshot
    const summary = await prisma.attendanceSummary.findFirst({
        where: { employeeId: employee.id, month: String(month), year: parseInt(year, 10) }
    });

    // We also need total working hours, which might not be in summary. Let's aggregate it.
    const paddedMonthNum = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(month) + 1;
    let totalWorkingHours = 0;
    
    if (paddedMonthNum > 0) {
        const paddedMonthStr = String(paddedMonthNum).padStart(2, '0');
        const dateFilter = { startsWith: `${year}-${paddedMonthStr}` };
        const records = await prisma.attendance.findMany({
            where: { employeeId: employee.id, date: dateFilter },
            select: { hoursWorked: true }
        });
        totalWorkingHours = records.reduce((sum, r) => sum + (r.hoursWorked || 0), 0);
    }

    const payload = {
        present: summary?.presentDays || 0,
        absent: summary?.absentDays || 0,
        leave: (summary?.cl || 0) + (summary?.pl || 0) + (summary?.sl || 0) + (summary?.lwp || 0),
        holiday: summary?.holidayDays || 0,
        weekend: summary?.weeklyOffDays || 0,
        halfDay: summary?.halfDays || 0,
        totalWorkingHours: Math.round(totalWorkingHours * 100) / 100
    };

    return respond(res, 200, true, 'Monthly attendance summary retrieved.', payload);
  } catch (error) {
    console.error('[mobileAttendanceController.getMonthlyAttendance] Error:', error);
    return respond(res, 500, false, 'Failed to fetch monthly attendance.');
  }
};

exports.getAttendanceHistory = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const { page = 1, limit = 20, date, month, year } = req.query;
    
    let dateFilter = {};
    if (date) {
        dateFilter = date;
    } else if (month && year) {
        const paddedMonthNum = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(month) + 1;
        if (paddedMonthNum > 0) {
            const paddedMonthStr = String(paddedMonthNum).padStart(2, '0');
            dateFilter = { startsWith: `${year}-${paddedMonthStr}` };
        }
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where = { employeeId: employee.id };
    if (Object.keys(dateFilter).length > 0 || typeof dateFilter === 'string') {
        where.date = dateFilter;
    }

    const [attendance, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.attendance.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      message: 'Attendance history retrieved.',
      data: attendance,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[mobileAttendanceController.getAttendanceHistory] Error:', error);
    return respond(res, 500, false, 'Failed to fetch attendance history.');
  }
};

exports.checkIn = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const todayStr = getLocalTodayString();
    
    const existing = await prisma.attendance.findFirst({
      where: { employeeId: employee.id, date: todayStr }
    });

    if (existing && existing.clockIn && existing.clockIn !== '') {
      return respond(res, 400, false, 'Already checked in today.');
    }

    const now = new Date();
    const timeString = now.toTimeString().slice(0, 5); // HH:MM

    let record;
    if (existing) {
        record = await prisma.attendance.update({
            where: { id: existing.id },
            data: { clockIn: timeString, status: 'Present' }
        });
    } else {
        const branchObj = await prisma.branch.findUnique({ where: { id: employee.branchId || -1 } }).catch(()=>null);
        record = await prisma.attendance.create({
            data: {
                companyId: employee.companyId,
                employeeId: employee.id,
                employeeName: employee.name,
                department: employee.department || 'General',
                branch: branchObj?.branchName || null,
                date: todayStr,
                clockIn: timeString,
                clockOut: '',
                status: 'Present',
                hoursWorked: 0
            }
        });
    }

    // Audit Log
    await AuditService.logAudit(req.user.id, 'MOBILE_CHECK_IN', 'Attendance', record.id, {
        date: todayStr,
        time: timeString
    });

    return respond(res, 200, true, 'Checked in successfully.', record);
  } catch (error) {
    console.error('[mobileAttendanceController.checkIn] Error:', error);
    return respond(res, 500, false, 'Check in failed.');
  }
};

exports.checkOut = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const todayStr = getLocalTodayString();
    const existing = await prisma.attendance.findFirst({
      where: { employeeId: employee.id, date: todayStr }
    });

    if (!existing || !existing.clockIn || existing.clockIn === '') {
      return respond(res, 400, false, 'You must check in first before checking out.');
    }
    
    if (existing.clockOut && existing.clockOut !== '') {
        return respond(res, 400, false, 'Already checked out today.');
    }

    const now = new Date();
    const timeString = now.toTimeString().slice(0, 5); // HH:MM
    
    // Simple hours worked calculation
    const clockInDate = new Date(`${todayStr}T${existing.clockIn}:00`);
    const clockOutDate = new Date(`${todayStr}T${timeString}:00`);
    let hoursWorked = (clockOutDate - clockInDate) / (1000 * 60 * 60);
    if (hoursWorked < 0) hoursWorked = 0; // Cross-midnight edge cases

    const record = await prisma.attendance.update({
        where: { id: existing.id },
        data: { 
            clockOut: timeString, 
            hoursWorked: Math.round(hoursWorked * 100) / 100
        }
    });

    // Audit Log
    await AuditService.logAudit(req.user.id, 'MOBILE_CHECK_OUT', 'Attendance', record.id, {
        date: todayStr,
        time: timeString,
        hoursWorked: record.hoursWorked
    });

    return respond(res, 200, true, 'Checked out successfully.', record);
  } catch (error) {
    console.error('[mobileAttendanceController.checkOut] Error:', error);
    return respond(res, 500, false, 'Check out failed.');
  }
};
