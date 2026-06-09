const prisma = require('../config/prisma');

exports.getAll = async (req, res) => {
  try {
    const { companyId } = req.query;
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      whereClause.companyId = { in: allowedIds };
      if (companyId) {
        if (!allowedIds.includes(companyId)) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        whereClause.companyId = companyId;
      }
    } else if (companyId) {
      whereClause.companyId = companyId;
    }

    const data = await prisma.attendance.findMany({ where: whereClause });
    res.json(data);
  } catch (error) {
    console.error('Error fetching', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const { companyId, date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    let empWhere = {};
    let attWhere = { date: targetDate };
    let leaveWhere = { status: 'Approved', fromDate: { lte: targetDate }, toDate: { gte: targetDate } };

    if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      empWhere.companyId = { in: allowedIds };
      attWhere.companyId = { in: allowedIds };
      leaveWhere.companyId = { in: allowedIds };
    }

    if (companyId) {
      const comp = await prisma.company.findUnique({ where: { id: companyId } });
      if (comp) {
         empWhere.companyId = companyId;
         attWhere.companyId = companyId;
         leaveWhere.companyId = companyId;
      } else {
         const branch = await prisma.branch.findUnique({ where: { id: companyId } });
         if (branch) {
            empWhere.companyId = branch.companyId;
            empWhere.branchId = branch.id;

            attWhere.companyId = branch.companyId;
            attWhere.branch = branch.branchName;

            leaveWhere.companyId = branch.companyId;
            // LeaveRequests might not have branch filtering natively or rely on employeeId. 
            // We will filter leaves by joining or post-filtering below.
         } else {
            // It's just a fallback if not found
            empWhere.companyId = companyId;
            attWhere.companyId = companyId;
            leaveWhere.companyId = companyId;
         }
      }
    }

    // Get Active Employees for the scope
    const employees = await prisma.employee.findMany({
      where: { ...empWhere, status: 'Active' },
      select: { id: true, department: true, companyId: true, branchId: true }
    });

    const totalEmployees = employees.length;
    const validEmployeeIds = new Set(employees.map(e => e.id));

    // Get Attendance for the scope on the given date
    const attendance = await prisma.attendance.findMany({
      where: attWhere
    });

    // Get Leave Requests for the scope on the given date
    const leaves = await prisma.leaveRequest.findMany({
      where: leaveWhere
    });

    // Only count leaves for valid employees in scope
    const leaveEmployeeIds = new Set(leaves.filter(l => validEmployeeIds.has(l.employeeId)).map(l => l.employeeId));
    
    const presentRecords = attendance.filter(a => ['Present', 'Half Day', 'Late', 'Work From Home', 'On Duty'].includes(a.status));
    const uniquePresentIds = new Set(presentRecords.map(a => a.employeeId));
    
    // Validate bounds
    const presentToday = Math.min(uniquePresentIds.size, totalEmployees);
    const onLeaveToday = Math.min(leaveEmployeeIds.size, totalEmployees - presentToday);
    const absentToday = Math.max(0, totalEmployees - presentToday - onLeaveToday);
    
    const wfhToday = attendance.filter(a => a.status === 'Work From Home').length;
    const overtimeToday = attendance.filter(a => (a.hoursWorked || 0) > 9).length;
    
    // New KPIs
    const halfDayToday = attendance.filter(a => a.status === 'Half Day').length;
    const lateToday = attendance.filter(a => a.status === 'Late' || (a.flags && a.flags.includes('Late Mark'))).length;

    // Aggregations
    const departmentAnalytics = {};
    const branchAnalytics = {};
    const companyAnalytics = {};

    employees.forEach(emp => {
      const d = emp.department || 'Other';
      const b = emp.branchId || 'Head Office';
      const c = emp.companyId || 'Unknown';
      
      if (!departmentAnalytics[d]) departmentAnalytics[d] = { total: 0, present: 0 };
      if (!branchAnalytics[b]) branchAnalytics[b] = { total: 0, present: 0 };
      if (!companyAnalytics[c]) companyAnalytics[c] = { total: 0, present: 0 };
      
      departmentAnalytics[d].total++;
      branchAnalytics[b].total++;
      companyAnalytics[c].total++;

      if (uniquePresentIds.has(emp.id)) {
        departmentAnalytics[d].present++;
        branchAnalytics[b].present++;
        companyAnalytics[c].present++;
      }
    });

    res.json({
      date: targetDate,
      totalEmployees,
      presentToday,
      absentToday,
      onLeaveToday,
      wfhToday,
      overtimeToday,
      halfDayToday,
      lateToday,
      departmentAnalytics,
      branchAnalytics,
      companyAnalytics
    });
  } catch (error) {
    console.error('Error in getAnalytics:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const data = await prisma.attendance.create({
      data: req.body
    });
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await prisma.attendance.update({
      where: { id },
      data: req.body
    });
    res.json(data);
  } catch (error) {
    console.error('Error updating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.attendance.delete({
      where: { id }
    });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
