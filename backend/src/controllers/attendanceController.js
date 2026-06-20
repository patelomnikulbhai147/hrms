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
// Keyed by the EDITED record's own month/year — so editing (say) May attendance
// only ever flags May payroll and never touches the active month. Returns the
// number of payroll rows flagged so the audit trail can record payroll impact.
async function flagPayrollOutdated(employeeId, dateStr) {
  try {
    if (!employeeId || !dateStr) return 0;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 0;
    const res = await prisma.payroll.updateMany({
      where: { employeeId: Number(employeeId), month: MONTH_NAMES[d.getMonth()], year: d.getFullYear() },
      data: { isOutdated: true },
    });
    return res.count || 0;
  } catch (_) { return 0; /* never block the attendance op */ }
}

// Traceable audit entry for an attendance mark/correction: who, when, employee,
// old → new status, the view it was made from (Source, e.g. "Weekly Attendance")
// and an optional reason. Visible in the Audit Trail. Never blocks the operation.
async function writeAttendanceAudit(req, action, data, fromStatus, source, reason, payrollImpact) {
  try {
    if (!req.user || !req.user.id) return;
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action, // MARK_ATTENDANCE (new) | CORRECT_ATTENDANCE (change)
        module: 'Attendance',
        targetId: String(data.id),
        details: JSON.stringify({
          employeeId: data.employeeId,
          employeeName: data.employeeName,
          date: data.date,
          by: req.user.name || req.user.email,
          source: source || 'Attendance',
          reason: reason || undefined,
          from: fromStatus,
          to: data.status,
          payrollRecalcRequired: payrollImpact ? 'Yes' : 'No',
        }).slice(0, 1000),
      },
    });
  } catch (_) { /* audit is best-effort */ }
}

exports.getAll = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);

    // ── ROOT-CAUSE FIX (attendance vanishing after refresh) ──────────────────
    // Previously attendance was filtered by `attendance.companyId === workspaceId`
    // (exact). But the grid lists EMPLOYEES with the kind-aware isCompanyIdMatch
    // (which also matches by branchId / parent company). So in a branch or sub
    // workspace — or when a Super Admin views a specific company — an employee was
    // shown, their attendance was SAVED with the employee's own companyId, but the
    // reload filtered it out → the change appeared to revert.
    //
    // Now we scope attendance by the SAME employee set the Employees grid uses, then
    // return attendance for those employees. A saved row for any visible employee is
    // therefore always returned on refresh, regardless of its companyId.
    let empWhere = null; // null = no restriction (Super Admin, no workspace selected)
    if (req.user && req.user.role !== 'Super Admin') {
      const companyScope = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      const branchScope = (req.user.accessibleBranchIds || []).filter(Boolean);
      const allowedIds = [...companyScope, ...branchScope];
      if (companyId) {
        if (!allowedIds.includes(companyId)) return res.status(403).json({ error: 'Unauthorized' });
        empWhere = { OR: [{ companyId }, { branchId: companyId }] };
      } else {
        empWhere = { OR: [{ companyId: { in: companyScope } }, { branchId: { in: branchScope.length ? branchScope : companyScope } }] };
      }
    } else if (companyId) {
      // Super Admin viewing a specific company/branch workspace.
      empWhere = { OR: [{ companyId }, { branchId: companyId }] };
    }

    let data;
    if (empWhere) {
      const scopedEmps = await prisma.employee.findMany({ where: empWhere, select: { id: true } });
      const empIds = scopedEmps.map(e => e.id);
      data = await prisma.attendance.findMany({ where: { employeeId: { in: empIds.length ? empIds : [-1] } } });
      console.log('[attendance.getAll] workspace=', companyId, 'role=', req.user?.role, 'scopedEmployees=', empIds.length, 'attendanceRows=', data.length);
    } else {
      data = await prisma.attendance.findMany({});
      console.log('[attendance.getAll] role=', req.user?.role, 'no workspace filter, attendanceRows=', data.length);
    }
    res.json(data);
  } catch (error) {
    console.error('[attendance.getAll] FAILED', error);
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
  // ROOT-CAUSE FIX: Employee.companyId / branchId are Int columns, but the client
  // sends companyId/scopeIds as STRINGS (e.g. the active workspace id "5"). Passing
  // a String into an Int filter is exactly what made `prisma.employee.findMany()`
  // throw "Invalid invocation". Coerce every id to Int up-front. These are declared
  // in the OUTER scope so the catch block can print the exact inputs that built the
  // failing query.
  const toIntId = (v) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
  const body = req.body || {};
  const { month, year, dryRun = true } = body;
  const companyId = toIntId(body.companyId);
  const scopeIds = Array.isArray(body.scopeIds) ? body.scopeIds.map(toIntId).filter(v => v !== undefined) : [];
  let allowedIds = null;
  let empWhere = null;
  try {
    if (!month || !year) {
      return res.status(400).json({ error: 'month and year are required.' });
    }

    // Resolve the scope to a set of companyIds the requester may touch (coerced to Int).
    if (req.user && req.user.role !== 'Super Admin') {
      allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].map(toIntId).filter(v => v !== undefined);
    }

    empWhere = { status: { notIn: OFFBOARDED_STATUSES } };
    if (scopeIds.length > 0) {
      empWhere.OR = [{ companyId: { in: scopeIds } }, { branchId: { in: scopeIds } }, { id: { in: scopeIds } }];
    } else if (companyId !== undefined) {
      empWhere.OR = [{ companyId }, { branchId: companyId }];
    } else if (allowedIds && allowedIds.length) {
      empWhere.OR = [{ companyId: { in: allowedIds } }, { branchId: { in: allowedIds } }];
    }

    console.log('[syncPayroll] employee.findMany query', { role: req.user?.role, companyId, scopeIds, allowedIds, status: 'notIn OFFBOARDED_STATUSES', empWhere: JSON.stringify(empWhere) });
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
    // Print the FULL Prisma exception + the exact inputs that built the query, so
    // the real cause is visible in the server log (not just a generic popup).
    console.error('[syncPayroll] FAILED — full error:\n', error);
    console.error('[syncPayroll] DEBUG OUTPUT', {
      prismaCode: error.code,
      prismaMeta: error.meta,
      status: 'notIn OFFBOARDED_STATUSES',
      OFFBOARDED_STATUSES,
      companyId,
      branchId: companyId,
      scopeIds,
      allowedIds,
      empWhere: empWhere ? JSON.stringify(empWhere) : null,
      role: req.user?.role,
    });
    res.status(500).json({ error: error.message || 'Server error during payroll sync', code: error.code });
  }
};

exports.create = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.reason; // metadata, not a column
    const source = (body.source || '').toString(); delete body.source; // audit metadata, not a column
    // Coerce id columns to Int (companyId/employeeId are Int) so a string id from
    // the client can never break the attendance write.
    if (body.companyId !== undefined) { const n = Number(body.companyId); if (Number.isFinite(n)) body.companyId = n; }
    if (body.employeeId !== undefined) { const n = Number(body.employeeId); if (Number.isFinite(n)) body.employeeId = n; }

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

    // Single source of truth: never create a SECOND row for the same employee+date.
    // If one already exists, treat this as a correction (update) instead of a dup.
    if (body.employeeId && body.date) {
      const dup = await prisma.attendance.findFirst({ where: { employeeId: Number(body.employeeId), date: body.date } });
      if (dup) {
        const updated = await prisma.attendance.update({ where: { id: dup.id }, data: body });
        const flagged = await flagPayrollOutdated(updated.employeeId, updated.date);
        await writeAttendanceAudit(req, 'CORRECT_ATTENDANCE', updated, dup.status, source, undefined, flagged > 0);
        return res.status(200).json(updated);
      }
    }

    console.log('[attendance.create] BEFORE', { employeeId: body.employeeId, date: body.date, status: body.status, source: source || 'Attendance' });
    let data;
    let action = 'MARK_ATTENDANCE';
    try {
      data = await prisma.attendance.create({ data: body });
    } catch (err) {
      // Race-safe against the UNIQUE(employeeId, date) constraint: if a row for this
      // employee+date was created concurrently, update it instead of failing.
      if (err.code === 'P2002') {
        const dup = await prisma.attendance.findFirst({ where: { employeeId: Number(body.employeeId), date: body.date } });
        if (!dup) throw err;
        data = await prisma.attendance.update({ where: { id: dup.id }, data: body });
        action = 'CORRECT_ATTENDANCE';
      } else throw err;
    }
    console.log('[attendance.create] AFTER (db response)', { id: data.id, employeeId: data.employeeId, date: data.date, status: data.status, action });
    // A new attendance record changes the month's totals → payroll is now stale.
    const flagged = await flagPayrollOutdated(data.employeeId, data.date);
    await writeAttendanceAudit(req, action, data, undefined, source, undefined, flagged > 0);
    res.status(action === 'CORRECT_ATTENDANCE' ? 200 : 201).json(data);
  } catch (error) {
    console.error('[attendance.create] FAILED', error);
    res.status(500).json({ error: error.message || 'Server error', code: error.code });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const body = { ...req.body };
    const reason = (body.reason || '').toString();
    delete body.reason; // metadata, not a column
    const source = (body.source || '').toString(); delete body.source; // audit metadata, not a column
    // Coerce id columns to Int so a string companyId/employeeId can never break the save.
    if (body.companyId !== undefined) { const n = Number(body.companyId); if (Number.isFinite(n)) body.companyId = n; }
    if (body.employeeId !== undefined) { const n = Number(body.employeeId); if (Number.isFinite(n)) body.employeeId = n; }

    const existing = await prisma.attendance.findUnique({ where: { id: idParam(id) } });
    console.log('[attendance.update] BEFORE', { id, employeeId: existing?.employeeId, date: existing?.date, status: existing?.status, source: source || 'Attendance' });
    const data = await prisma.attendance.update({ where: { id: idParam(id) }, data: body });
    console.log('[attendance.update] AFTER (db response)', { id: data.id, employeeId: data.employeeId, date: data.date, status: data.status });

    // ── System-wide sync: flag the affected month's payroll as outdated ──────
    const flagged = await flagPayrollOutdated(data.employeeId, data.date);

    // Traceable correction: who / when / source / old → new (visible in Audit Trail).
    await writeAttendanceAudit(req, 'CORRECT_ATTENDANCE', data, existing ? existing.status : undefined, source, reason || '(no reason given)', flagged > 0);

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
