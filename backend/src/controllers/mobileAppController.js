const prisma = require('../config/prisma');
const { ACTIVE_EMPLOYEE_WHERE } = require('../utils/employeeStatus');
const { ensureEmployeeProfileForUser } = require('../services/userEmployeeProfileService');
const { scopeWhere } = require('./notificationController');
const { buildEmployeeScope, NOT_OFFBOARDED } = require('../utils/employeeScope');
const idParam = require('../utils/idParam');

/**
 * Common response format for mobile APIs.
 */
const respond = (res, statusCode, success, message, data = null) => {
  res.status(statusCode).json({
    success,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

/**
 * GET /api/app/v1/dashboard
 * Retrieves a management summary optimized for the mobile dashboard.
 */
exports.getDashboard = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    if (!companyId) {
      return respond(res, 403, false, 'User is not assigned to a company.');
    }

    // Since this is a Head/HR dashboard, fetch scoped data for the company.
    // 1. Total Active Employees
    const totalActiveEmployees = await prisma.employee.count({
      where: { companyId, ...ACTIVE_EMPLOYEE_WHERE }
    });

    // 2. Today's Attendance Snapshot (Present / Absent)
    // Mobile only needs counts, so we aggregate today's records.
    const today = new Date();
    // Use local date string YYYY-MM-DD
    const tzOffset = (new Date()).getTimezoneOffset() * 60000; 
    const localISOTime = (new Date(today - tzOffset)).toISOString().slice(0, 10);
    const todayStr = localISOTime;

    const todayAttendance = await prisma.attendance.findMany({
      where: { 
        employee: { companyId },
        date: todayStr 
      },
      select: { status: true }
    });

    const isAtWork = (status) => {
      const s = String(status || '').toLowerCase();
      return /present|on duty|wfh|wfo|work from home|half[\s-]?day/.test(s);
    };

    const presentToday = todayAttendance.filter(a => isAtWork(a.status)).length;
    const absentToday = totalActiveEmployees - presentToday;

    // 3. Pending Leave Requests Count
    const pendingLeaves = await prisma.leaveRequest.count({
      where: { 
        employee: { companyId },
        status: 'Pending'
      }
    });

    // 4. Recent Notifications
    // Reuse scopeWhere to ensure privacy restrictions are respected.
    const recentNotifications = await prisma.notification.findMany({
      where: scopeWhere(req),
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        priority: true,
        read: true,
        timestamp: true
      }
    });

    return respond(res, 200, true, 'Dashboard data retrieved successfully', {
      headcount: {
        totalActive: totalActiveEmployees,
        presentToday,
        absentToday: Math.max(0, absentToday) // safeguard
      },
      pendingApprovals: {
        leaves: pendingLeaves
      },
      recentNotifications
    });

  } catch (error) {
    console.error('[MobileApp] getDashboard Error:', error);
    return respond(res, 500, false, 'Failed to fetch dashboard data.');
  }
};

/**
 * GET /api/app/v1/profile
 * Retrieves the current user's profile and linked Employee data.
 */
exports.getProfile = async (req, res) => {
  try {
    // Ensure the user has a linked Employee profile
    const result = await ensureEmployeeProfileForUser(req.user);
    const employee = result.employee;

    if (!employee) {
      return respond(res, 404, false, 'Employee profile not found.');
    }

    // Optimize response for mobile
    const profileData = {
      id: employee.id,
      employeeId: employee.employeeId, // Code
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      department: employee.department,
      designation: employee.designation,
      role: employee.role,
      joinDate: employee.joinDate,
      profilePhoto: employee.profilePhoto,
      employmentType: employee.employmentType,
      status: employee.status
    };

    return respond(res, 200, true, 'Profile retrieved successfully', profileData);
  } catch (error) {
    console.error('[MobileApp] getProfile Error:', error);
    return respond(res, 500, false, 'Failed to fetch profile.');
  }
};

/**
 * PUT /api/app/v1/profile
 * Updates the user's linked Employee record (phone, address, profile photo).
 */
exports.updateProfile = async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return respond(res, 400, false, 'User is not linked to an employee profile.');
    }

    const { phone, presentAddress, avatar } = req.body;
    
    // Only update fields that the mobile app is allowed to edit.
    const updateData = {};
    if (phone !== undefined) updateData.phone = String(phone).trim() || null;
    if (presentAddress !== undefined) updateData.presentAddress = String(presentAddress).trim() || null;
    if (avatar !== undefined) updateData.avatar = String(avatar) || null;

    if (Object.keys(updateData).length === 0) {
      return respond(res, 400, false, 'No valid fields provided for update.');
    }

    const updatedEmployee = await prisma.employee.update({
      where: { id: Number(req.user.employeeId) },
      data: updateData,
      select: {
        id: true,
        phone: true,
        presentAddress: true,
        avatar: true
      }
    });

    return respond(res, 200, true, 'Profile updated successfully', updatedEmployee);
  } catch (error) {
    console.error('[MobileApp] updateProfile Error:', error);
    return respond(res, 500, false, 'Failed to update profile.');
  }
};

/**
 * GET /api/app/v1/notifications
 * Retrieves all notifications for the user optimized for mobile view.
 */
exports.getNotifications = async (req, res) => {
  try {
    const take = Math.min(100, Number(req.query.limit) || 50);
    
    const notifications = await prisma.notification.findMany({
      where: scopeWhere(req),
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        priority: true,
        read: true,
        timestamp: true
      }
    });

    return respond(res, 200, true, 'Notifications retrieved successfully', notifications);
  } catch (error) {
    console.error('[MobileApp] getNotifications Error:', error);
    return respond(res, 500, false, 'Failed to fetch notifications.');
  }
};

/**
 * GET /api/app/v1/company
 * Retrieves the current user's Company details optimized for mobile view.
 */
exports.getCompany = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    if (!companyId) {
      return respond(res, 403, false, 'User is not assigned to a company.');
    }

    const company = await prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: {
        id: true,
        name: true,
        status: true,
        accountStatus: true,
        industry: true,
        adminEmail: true,
        phone: true,
        plan: true
      }
    });

    if (!company) {
      return respond(res, 404, false, 'Company not found.');
    }

    return respond(res, 200, true, 'Company details retrieved successfully', company);
  } catch (error) {
    console.error('[MobileApp] getCompany Error:', error);
    return respond(res, 500, false, 'Failed to fetch company details.');
  }
};

/**
 * GET /api/app/v1/employees
 * GET /api/app/v1/employees/search
 * Retrieves scoped list of employees optimized for mobile, with pagination, sorting, and filtering.
 */
exports.getEmployees = async (req, res) => {
  try {
    const { page = 1, limit = 20, department, branchId, designation, status, q } = req.query;

    // Prevent 'All' from being injected into the scope as a literal status
    const originalStatus = req.query.status;
    if (originalStatus && String(originalStatus).toLowerCase() === 'all') {
      delete req.query.status;
    }

    const scope = buildEmployeeScope(req);
    req.query.status = originalStatus; // restore it

    if (!scope.ok) return respond(res, scope.status, false, scope.body.error);
    const { withStatus } = scope;

    let tableWhere = withStatus(NOT_OFFBOARDED);
    if (status) {
      if (String(status).toLowerCase() === 'all') tableWhere = withStatus(null);
      else tableWhere = withStatus(null); // Because buildEmployeeScope already handled it!
    }

    const bFilter = idParam(branchId);
    if (bFilter) tableWhere = { AND: [tableWhere, { branchId: bFilter }] };

    if (department) tableWhere = { AND: [tableWhere, { department }] };
    if (designation) tableWhere = { AND: [tableWhere, { designation }] };

    if (q) {
      const searchStr = String(q).trim();
      if (searchStr) {
        tableWhere = {
          AND: [
            tableWhere,
            {
              OR: [
                { name: { contains: searchStr } },
                { email: { contains: searchStr } },
                { employeeId: { contains: searchStr } }
              ]
            }
          ]
        };
      }
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where: tableWhere,
        skip,
        take: limitNum,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          employeeId: true,
          name: true,
          email: true,
          phone: true,
          department: true,
          designation: true,
          avatar: true,
          status: true,
          joinDate: true,
          branch: { select: { branchName: true } }
        }
      }),
      prisma.employee.count({ where: tableWhere })
    ]);

    const mapped = employees.map(emp => ({
      id: emp.id,
      employeeId: emp.employeeId,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      department: emp.department,
      designation: emp.designation,
      avatar: emp.avatar,
      status: emp.status,
      joinDate: emp.joinDate,
      branch: emp.branch?.branchName || null
    }));

    return res.json({
      success: true,
      message: 'Employees retrieved successfully.',
      data: mapped,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[MobileApp] getEmployees Error:', error);
    return respond(res, 500, false, 'Failed to fetch employees.');
  }
};

/**
 * GET /api/app/v1/employees/:id
 * Retrieves a single employee optimized for mobile.
 */
exports.getEmployeeById = async (req, res) => {
  try {
    const empId = idParam(req.params.id);
    if (!empId) return respond(res, 400, false, 'Invalid employee ID.');

    const scope = buildEmployeeScope(req);
    if (!scope.ok) return respond(res, scope.status, false, scope.body.error);
    
    // We allow fetching even offboarded via direct ID, so withStatus(null)
    const tableWhere = { AND: [scope.withStatus(null), { id: empId }] };

    const emp = await prisma.employee.findFirst({
      where: tableWhere,
      select: {
        id: true,
        employeeId: true,
        name: true,
        email: true,
        phone: true,
        department: true,
        designation: true,
        avatar: true,
        status: true,
        joinDate: true,
        branch: { select: { branchName: true } }
      }
    });

    if (!emp) {
      return respond(res, 404, false, 'Employee not found or access denied.');
    }

    const mapped = {
      id: emp.id,
      employeeId: emp.employeeId,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      department: emp.department,
      designation: emp.designation,
      avatar: emp.avatar,
      status: emp.status,
      joinDate: emp.joinDate,
      branch: emp.branch?.branchName || null
    };

    return respond(res, 200, true, 'Employee retrieved successfully', mapped);
  } catch (error) {
    console.error('[MobileApp] getEmployeeById Error:', error);
    return respond(res, 500, false, 'Failed to fetch employee.');
  }
};
