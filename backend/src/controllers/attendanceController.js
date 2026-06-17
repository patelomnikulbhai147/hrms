const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { OFFBOARDED_STATUSES, isOffboarded } = require('../utils/employeeStatus');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// System-wide sync: when an attendance record changes, the payroll already
// computed for that employee/month is now stale — flag it isOutdated so the UI
// shows it needs a recalculation. This keeps payroll, summaries and reports from
// going stale after an attendance correction. Guarded so it can never block the
// attendance operation.
async function flagPayrollOutdated(employeeId, dateStr) {
  try {
    if (!employeeId || !dateStr) return;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;
    await prisma.payroll.updateMany({
      where: { employeeId: Number(employeeId), month: MONTH_NAMES[d.getMonth()], year: d.getFullYear() },
      data: { isOutdated: true },
    });
  } catch (_) { /* never block the attendance op */ }
}

exports.getAll = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
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

    // Get Active Employees for the scope (offboarded employees excluded)
    const employees = await prisma.employee.findMany({
      where: { ...empWhere, status: { notIn: OFFBOARDED_STATUSES } },
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

// ---------------------------------------------------------------------------
// Attendance -> Payroll synchronization.
//
// For each active in-scope employee, compute payable/LOP days and approved OT
// for the given month/year from the live attendance, leave and overtime tables,
// then upsert the matching Payroll row (deductions/allowances/netSalary).
// `dryRun: true` returns the computed preview WITHOUT writing — so the UI can
// show numbers before the admin commits. Mirrors the auto-draft logic in
// payrollController.syncPayrollForEmployees.
// ---------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0');

exports.syncPayroll = async (req, res) => {
  try {
    const { companyId, month, year, scopeIds, dryRun = true } = req.body || {};
    if (!month || !year) {
      return res.status(400).json({ error: 'month and year are required.' });
    }

    // Resolve the scope to a set of companyIds the requester may touch.
    let allowedIds = null;
    if (req.user && req.user.role !== 'Super Admin') {
      allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
    }

    const empWhere = { status: { notIn: OFFBOARDED_STATUSES } };
    if (Array.isArray(scopeIds) && scopeIds.length > 0) {
      empWhere.OR = [{ companyId: { in: scopeIds } }, { branchId: { in: scopeIds } }, { id: { in: scopeIds } }];
    } else if (companyId) {
      empWhere.OR = [{ companyId }, { branchId: companyId }];
    } else if (allowedIds) {
      empWhere.OR = [{ companyId: { in: allowedIds } }, { branchId: { in: allowedIds } }];
    }

    const employees = await prisma.employee.findMany({ where: empWhere });
    if (employees.length === 0) {
      return res.json({ month, year, dryRun, count: 0, totals: {}, rows: [] });
    }

    const companyIds = [...new Set(employees.map(e => e.companyId).filter(Boolean))];
    const companies = await prisma.company.findMany({ where: { id: { in: companyIds } } });
    const companyMap = Object.fromEntries(companies.map(c => [c.id, c]));

    // Days in the target month.
    const y = Number(year);
    const mIndex = Number(month) - 1; // month is 1-based number
    const daysInMonth = new Date(y, mIndex + 1, 0).getDate();
    const monthPrefix = `${y}-${pad2(Number(month))}`; // 'YYYY-MM'
    const allDates = Array.from({ length: daysInMonth }, (_, i) => `${monthPrefix}-${pad2(i + 1)}`);

    const empIds = employees.map(e => e.id);

    // Pull attendance, approved leaves and approved overtime for the month in scope.
    const [attendance, leaves, overtimes] = await Promise.all([
      prisma.attendance.findMany({ where: { employeeId: { in: empIds }, date: { startsWith: monthPrefix } } }),
      prisma.leaveRequest.findMany({ where: { employeeId: { in: empIds }, status: 'Approved' } }),
      prisma.overtime.findMany({ where: { employeeId: { in: empIds }, date: { startsWith: monthPrefix }, status: 'Approved' } }),
    ]);

    const attByEmpDate = new Map();
    for (const a of attendance) attByEmpDate.set(`${a.employeeId}|${a.date}`, a);

    const bucketOf = (status) => {
      const s = String(status || '').toLowerCase();
      if (/work from home|wfh/.test(s)) return 'wfh';
      if (/half[\s-]?day/.test(s)) return 'half';
      if (/leave/.test(s)) return 'leave';
      if (/holiday/.test(s)) return 'holiday';
      if (/weekly off|week off/.test(s)) return 'weeklyOff';
      if (/present|on duty|wfo/.test(s)) return 'present';
      return 'absent';
    };

    const rows = [];
    for (const emp of employees) {
      const counts = { present: 0, absent: 0, leave: 0, half: 0, wfh: 0, holiday: 0, weeklyOff: 0 };
      for (const date of allDates) {
        let status;
        const rec = attByEmpDate.get(`${emp.id}|${date}`);
        if (rec) status = rec.status;
        else {
          const onLeave = leaves.find(l => l.employeeId === emp.id && date >= l.fromDate && date <= l.toDate);
          if (onLeave) status = 'Leave';
          else status = (new Date(date).getDay() === 0) ? 'Weekly Off' : 'Absent';
        }
        counts[bucketOf(status)]++;
      }

      const otHours = overtimes
        .filter(o => o.employeeId === emp.id)
        .reduce((acc, o) => acc + Number(o.otHours || 0), 0);

      const company = companyMap[emp.companyId] || null;
      const lopDays = counts.absent;
      const payableDays = counts.present + counts.half * 0.5 + counts.leave + counts.weeklyOff + counts.holiday + counts.wfh;
      const perDay = (emp.salary || 0) / daysInMonth;
      const lopDeduction = Math.round(perDay * lopDays);
      const overtimeRate = company?.overtimeRate || 1.5;
      const hourlyRate = (emp.salary || 0) / (daysInMonth * 8);
      const otAmount = Math.round(otHours * hourlyRate * overtimeRate);

      rows.push({
        employeeId: emp.id,
        employeeName: emp.name,
        companyId: emp.companyId,
        department: emp.department,
        salary: emp.salary || 0,
        daysInMonth,
        ...counts,
        lopDays,
        payableDays,
        otHours,
        lopDeduction,
        otAmount,
      });
    }

    const totals = rows.reduce((acc, r) => ({
      employees: (acc.employees || 0) + 1,
      lopDays: (acc.lopDays || 0) + r.lopDays,
      otHours: (acc.otHours || 0) + r.otHours,
      lopDeduction: (acc.lopDeduction || 0) + r.lopDeduction,
      otAmount: (acc.otAmount || 0) + r.otAmount,
    }), {});

    if (dryRun) {
      return res.json({ month, year, dryRun: true, count: rows.length, totals, rows });
    }

    // Commit: upsert payroll rows for the month/year.
    const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][mIndex];
    let updated = 0, created = 0;
    for (const r of rows) {
      if (!r.salary || r.salary <= 0) continue;
      const company = companyMap[r.companyId];
      const basicSalary = r.salary;
      const hra = Math.round(basicSalary * 0.4);
      const special = Math.round(basicSalary * 0.1);
      const baseAllowances = hra + special;
      const allowances = baseAllowances + r.otAmount;

      const pfRate = company?.pfRate || 12;
      const esicRate = company?.esicRate || 0.75;
      const profTax = company?.profTaxRate || 200;
      const statutory = Math.round(basicSalary * (pfRate / 100)) + Math.round(basicSalary * (esicRate / 100)) + profTax;
      const deductions = statutory + r.lopDeduction;
      const netSalary = Math.max(0, (basicSalary + allowances) - deductions);

      // Payroll has a @@unique([employeeId, month, year, companyId]); month stored as name.
      const existing = await prisma.payroll.findFirst({
        where: { employeeId: r.employeeId, year: y, companyId: r.companyId, month: { in: [monthName, String(month), monthPrefix] } },
      });

      const data = {
        allowances, deductions, netSalary,
        notes: `Attendance sync: ${r.payableDays} payable / ${r.lopDays} LOP day(s), ${r.otHours} OT hr(s).`,
      };

      if (existing) {
        await prisma.payroll.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.payroll.create({
          data: {
            companyId: r.companyId, employeeId: r.employeeId, employeeName: r.employeeName,
            department: r.department || 'General', month: monthName, year: y,
            basicSalary, allowances, deductions, netSalary,
            payrollStatus: 'draft', paymentStatus: 'pending', payslipGenerated: false,
            ...data,
          },
        });
        created++;
      }
    }

    return res.json({ month, year, dryRun: false, count: rows.length, updated, created, totals, rows });
  } catch (error) {
    console.error('Error in syncPayroll:', error);
    res.status(500).json({ error: error.message || 'Server error during payroll sync' });
  }
};

exports.create = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.reason; // metadata, not a column

    // Offboarding policy: no attendance may be marked for an offboarded employee
    // (Archived/Resigned/Terminated/Inactive/Offboarded).
    if (body.employeeId) {
      const emp = await prisma.employee.findUnique({ where: { id: Number(body.employeeId) }, select: { status: true, name: true } });
      if (emp && isOffboarded(emp.status)) {
        return res.status(403).json({
          code: 'EMPLOYEE_OFFBOARDED',
          error: `${emp.name} is offboarded (${emp.status}) — attendance cannot be marked.`,
        });
      }
    }

    const data = await prisma.attendance.create({ data: body });
    // A new attendance record changes the month's totals → payroll is now stale.
    await flagPayrollOutdated(data.employeeId, data.date);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const body = { ...req.body };
    const reason = (body.reason || '').toString();
    delete body.reason; // metadata, not a column

    const existing = await prisma.attendance.findUnique({ where: { id: idParam(id) } });
    const data = await prisma.attendance.update({ where: { id: idParam(id) }, data: body });

    // ── System-wide sync: flag the affected month's payroll as outdated ──────
    await flagPayrollOutdated(data.employeeId, data.date);

    // Traceable correction: who / when / why / what (visible in the Audit Trail).
    if (req.user && req.user.id) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'CORRECT_ATTENDANCE',
          module: 'Attendance',
          targetId: String(data.id),
          details: JSON.stringify({
            employeeId: data.employeeId,
            date: data.date,
            by: req.user.name || req.user.email,
            reason: reason || '(no reason given)',
            from: existing ? existing.status : undefined,
            to: data.status,
          }).slice(0, 1000),
        },
      }).catch(() => {});
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
    const existing = await prisma.attendance.findUnique({ where: { id: idParam(id) } });
    await prisma.attendance.delete({ where: { id: idParam(id) } });
    // Removing a record also changes the month's totals → payroll is now stale.
    if (existing) await flagPayrollOutdated(existing.employeeId, existing.date);
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
