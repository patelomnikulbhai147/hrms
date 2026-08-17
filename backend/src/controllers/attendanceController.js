const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const otPay = require('../utils/overtimePay');
const { deriveOvertimeHours } = require('../utils/overtimeDerivation');
const { OFFBOARDED_STATUSES, isOffboarded } = require('../utils/employeeStatus');
const { canEnterWorkspace, companyScopeFor, isSuperAdmin } = require('../utils/workspaceScope');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ── Future-date guard (enterprise rule) ─────────────────────────────────────
// Attendance may NEVER be marked for a date after today, UNLESS the request
// explicitly opts into future scheduling via `allowFutureDays` (mirrored from the
// company's Attendance Date Policy) — and even then only within a hard cap. With
// no allowance (the default), any future date is rejected. Enforced here on the
// server so a direct API call can never bypass the UI restriction. `today` is the
// server clock — no hardcoded dates.
const FUTURE_DAYS_HARD_CAP = 31;
function isFutureAttendanceDate(dateStr, allowFutureDays = 0) {
  if (!dateStr) return false;
  const capDays = Math.max(0, Math.min(FUTURE_DAYS_HARD_CAP, Number(allowFutureDays) || 0));
  const limit = new Date(); limit.setHours(0, 0, 0, 0); limit.setDate(limit.getDate() + capDays);
  const d = new Date(`${dateStr}T00:00:00`);
  return !isNaN(d.getTime()) && d.getTime() > limit.getTime();
}

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

    // ── Row filters ──────────────────────────────────────────────────────────
    // These were accepted and silently DISCARDED: `?employeeId=7` and a date
    // range both returned the entire scoped table, so a caller asking for one
    // employee (or for the year 2099) still received every row — 28,861 of them,
    // 9.8 MB. A filter that is ignored is worse than one that is rejected: the
    // screen looks filtered and is not.
    const rowWhere = {};
    const employeeId = idParam(req.query.employeeId);
    if (employeeId) rowWhere.employeeId = employeeId;

    const startDate = String(req.query.startDate || req.query.from || '').trim();
    const endDate = String(req.query.endDate || req.query.to || '').trim();
    if (startDate || endDate) {
      rowWhere.date = {};
      if (startDate) rowWhere.date.gte = startDate;
      if (endDate) rowWhere.date.lte = endDate;
    }
    if (req.query.status) rowWhere.status = String(req.query.status);
    if (req.query.department) rowWhere.department = String(req.query.department);
    if (req.query.branch) rowWhere.branch = String(req.query.branch);

    // Optional cap. Unbounded by DEFAULT so existing callers are unaffected —
    // `take` must stay undefined unless the caller actually asked for a limit.
    // (Math.max(1, …) here would have silently capped every request at 1 row.)
    const limitRaw = parseInt(req.query.limit, 10);
    const take = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(5000, limitRaw) : undefined;

    let data;
    if (empWhere) {
      const scopedEmps = await prisma.employee.findMany({ where: empWhere, select: { id: true } });
      const empIds = scopedEmps.map(e => e.id);
      // `?employeeId=` NARROWS the scoped set — it never replaces it. Asking for
      // an employee outside the caller's workspace must return nothing, not that
      // employee's attendance.
      const scopedEmployeeId = rowWhere.employeeId
        ? (empIds.includes(rowWhere.employeeId) ? rowWhere.employeeId : -1)
        : { in: empIds.length ? empIds : [-1] };
      data = await prisma.attendance.findMany({
        where: { ...rowWhere, employeeId: scopedEmployeeId },
        ...(take ? { take, orderBy: { date: 'desc' } } : {}),
      });
      console.log('[attendance.getAll] workspace=', companyId, 'role=', req.user?.role, 'scopedEmployees=', empIds.length, 'attendanceRows=', data.length);
    } else {
      data = await prisma.attendance.findMany({
        where: rowWhere,
        ...(take ? { take, orderBy: { date: 'desc' } } : {}),
      });
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

// ─────────────────────────────────────────────────────────────────────────────
// Auto-raise overtime from a day's punches.
//
// Only the Excel-import path used to do this, so a day typed into the Attendance
// screen produced no overtime however long it was: 09:00–21:00 against a 9-hour
// shift generated nothing. Both paths now measure the day with the SAME rule
// (utils/overtimeDerivation).
//
// The record is created PENDING — deriving hours is not approving them, and only
// approval moves money. Idempotent: the auto-raised row for an employee+date is
// replaced, never stacked, so correcting a punch cannot leave two claims behind.
// A MANUALLY raised overtime record for that date is left completely alone; a
// person's judgement outranks a derivation.
// ─────────────────────────────────────────────────────────────────────────────
const AUTO_OT_MARKER = 'auto-derived';

async function deriveOvertimeForAttendance(record) {
  if (!record || !record.employeeId || !record.date) return null;
  try {
    const emp = await prisma.employee.findUnique({
      where: { id: Number(record.employeeId) },
      select: { id: true, name: true, employeeId: true, companyId: true, department: true, branchLocation: true, shiftId: true },
    });
    if (!emp) return null;

    // A manual claim for this date wins — never overwrite or duplicate it.
    const manual = await prisma.overtime.findFirst({
      where: { employeeId: emp.id, date: record.date, NOT: { remarks: AUTO_OT_MARKER } },
      select: { id: true },
    });
    if (manual) return { skipped: 'a manually raised overtime entry already exists for this date' };

    const shift = emp.shiftId
      ? await prisma.shift.findUnique({ where: { id: Number(emp.shiftId) }, select: { name: true, start: true, end: true, breakTime: true, otEnabled: true } })
      : null;

    const status = String(record.status || '').toLowerCase();
    const { otHours, reason } = deriveOvertimeHours({
      clockIn: record.clockIn, clockOut: record.clockOut, shift,
      isHoliday: /holiday/.test(status),
      isWeeklyOff: /weekly off|week off/.test(status),
    });

    // Clear any previous auto-raised row for the date, so an edited punch
    // re-derives instead of accumulating.
    await prisma.overtime.deleteMany({ where: { employeeId: emp.id, date: record.date, remarks: AUTO_OT_MARKER } });
    if (!(otHours > 0)) return { otHours: 0, reason };

    const created = await prisma.overtime.create({
      data: {
        companyId: emp.companyId, employeeId: emp.id, employeeName: emp.name,
        employeeCode: emp.employeeId, department: emp.department || null,
        branch: emp.branchLocation || null, shift: shift?.name || null,
        date: record.date, inTime: record.clockIn || '', outTime: record.clockOut || '',
        otHours, type: 'Auto', reason: 'Derived from attendance punches',
        remarks: AUTO_OT_MARKER, status: 'Pending',
      },
    });
    console.log('[attendance→overtime]', JSON.stringify({
      employeeId: emp.id, date: record.date, clockIn: record.clockIn, clockOut: record.clockOut,
      shift: shift?.name || null, otHours, overtimeId: created.id, status: 'Pending', reason,
    }));
    return { otHours, overtimeId: created.id, reason };
  } catch (err) {
    // Never fail an attendance write because the derivation had a problem — but
    // never hide it either.
    console.error('[attendance→overtime] DERIVATION FAILED', JSON.stringify({
      employeeId: record?.employeeId, date: record?.date,
      message: err?.message, code: err?.code, timestamp: new Date().toISOString(),
    }));
    console.error(err?.stack || err);
    return { error: err?.message || 'derivation failed' };
  }
}

exports.syncPayroll = async (req, res) => {
  // ROOT-CAUSE FIX: Employee.companyId / branchId are Int columns, but the client
  // sends companyId/scopeIds as STRINGS (e.g. the active workspace id "5"). Passing
  // a String into an Int filter is exactly what made `prisma.employee.findMany()`
  // throw "Invalid invocation". Coerce every id to Int up-front. These are declared
  // in the OUTER scope so the catch block can print the exact inputs that built the
  // failing query.
  const toIntId = (v) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
  const body = req.body || {};
  // `snapshotOnly` (Phase 1 "Push to Payroll Engine"): write ONLY the attendance
  // snapshot (AttendanceSummary) — NO payroll row is created, NO proration, and
  // NO PF / ESIC / PT / deduction / net-salary calculation runs. Payroll generation
  // (Phase 2) reads this snapshot later. The default (false) keeps the full sync.
  // `markSynced` stamps `syncedAt` on the snapshot (the official "pushed / ready
  // for payroll generation" marker). "Push to Payroll Engine" sends true (default);
  // "Refresh Calculation" sends false — it recomputes & persists the calculation
  // from the latest attendance WITHOUT declaring the month officially pushed.
  const { month, year, dryRun = true, snapshotOnly = false, markSynced = true } = body;
  // `clientRunId` (optional): lets the client cancel this run and poll progress.
  // The run is recorded in AttendanceSyncLog (source 'PayrollSync') — DB-backed so
  // cancel/status work across PM2 cluster workers, no schema change needed.
  const clientRunId = body.clientRunId != null ? String(body.clientRunId).slice(0, 191) : null;
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

    // A named workspace is only honoured if the caller may actually enter it.
    if (companyId !== undefined && !isSuperAdmin(req) && !canEnterWorkspace(req, companyId)) {
      return res.status(403).json({ error: 'You are not authorised to sync payroll for this workspace.' });
    }

    empWhere = { status: { notIn: OFFBOARDED_STATUSES } };
    if (scopeIds.length > 0) {
      empWhere.OR = [{ companyId: { in: scopeIds } }, { branchId: { in: scopeIds } }, { id: { in: scopeIds } }];
    } else if (companyId !== undefined) {
      empWhere.OR = [{ companyId }, { branchId: companyId }];
    } else if (allowedIds && allowedIds.length) {
      empWhere.OR = [{ companyId: { in: allowedIds } }, { branchId: { in: allowedIds } }];
    }

    // ── Hard tenant fence ────────────────────────────────────────────────────
    // `allowedIds` above was computed and then only ever used as a FALLBACK, so
    // naming `companyId` (or any `scopeIds`) replaced the caller's scope instead
    // of narrowing it: a Company Head of one tenant could read — and with
    // dryRun:false WRITE payroll rows for — another tenant's employees simply by
    // naming their id. The scope the client asks for is now intersected with the
    // scope the caller actually holds, so a named id can only ever narrow.
    // `scopeIds` also matches raw employee PKs, which this fence contains too.
    if (!isSuperAdmin(req)) {
      const allowedCompanies = companyScopeFor(req); // branch-aware, numeric
      empWhere.AND = [
        ...(empWhere.AND || []),
        { companyId: { in: allowedCompanies.length ? allowedCompanies : [-1] } },
      ];
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

    // Resolve the Deduction Policy ONCE per company|branch scope (not per
    // employee) — the OT multiplier lives there, and a per-employee await inside
    // the loop would be hundreds of round-trips for a large company.
    const policySvc = require('../services/deductionPolicyService');
    const policyCache = new Map();
    for (const scope of new Set(employees.map((e) => `${e.companyId}|${e.branchId ?? ''}`))) {
      const [cid, bid] = scope.split('|');
      const resolved = await policySvc
        .resolveEffectivePolicy({ companyId: Number(cid), branchId: bid === '' ? null : Number(bid) })
        .catch(() => null);
      policyCache.set(scope, resolved);
    }
    const policyFor = (e) => policyCache.get(`${e.companyId}|${e.branchId ?? ''}`) || null;

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

      // OT priced by the SHARED formula (utils/overtimePay) — the same one the
      // payroll engine uses. Previously this divided by calendar days and ignored
      // the Deduction Policy multiplier, so the amount reviewed here did not match
      // the amount that reached the payslip.
      const workingDays = Math.max(0, daysInMonth - counts.weeklyOff - counts.holiday) || daysInMonth;
      const overtimeRate = otPay.resolveOvertimeMultiplier(policyFor(emp), company);
      const otAmount = otPay.computeOvertimeAmount({
        otHours, monthlyGross: emp.salary || 0, workingDays, multiplier: overtimeRate,
      });

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

    // ── Commit: write the SINGLE canonical snapshot + payroll, via the ONE engine ──
    // Instead of a second inline salary formula, we persist the verified attendance
    // snapshot (AttendanceSummary, via recompute — identical to what the Salary
    // Worksheet reads) and recalc payroll from it (recalcOne — the same engine the
    // "Recalculate Attendance" button uses, with attendance proration). This removes
    // the dual calculation: Sync popup, worksheet, dashboard & slip all read one source.
    const attSvc = require('../services/attendanceSummaryService');
    const payrollCtrl = require('./payrollController'); // lazy require — no top-level cycle
    const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][mIndex];
    // Per-employee resilience: one employee failing (bad row, recompute error) must
    // NOT abort the whole run. Each employee is wrapped in its own try/catch, and
    // failures are collected so the UI can report "N succeeded, M failed · details".
    let updated = 0, created = 0, synced = 0;
    const failures = [];
    const eligible = rows.filter((r) => r.salary && r.salary > 0);

    // ── Cancellable job record (DB-backed, cluster-safe) ─────────────────────
    const startedAt = Date.now();
    let run = null;
    if (clientRunId) {
      run = await prisma.attendanceSyncLog.create({
        data: {
          companyId: companyId ?? (employees[0]?.companyId ?? 0),
          source: 'PayrollSync', trigger: 'manual', status: 'RUNNING',
          windowFrom: clientRunId, windowTo: `${monthName} ${y}`,
          fetched: eligible.length,
        },
      }).catch(() => null);
    }

    // The per-employee unit of work — UNCHANGED calculation path: the exact same
    // recompute (attendance snapshot) + recalcForEmployeeMonth (ONE payroll
    // engine) calls as before, per employee, atomic per employee.
    const processOne = async (r) => {
      try {
        if (snapshotOnly) {
          // ── PHASE 1 — Attendance snapshot ONLY ──────────────────────────────
          // Persist the finalized attendance figures into the AttendanceSummary
          // snapshot. NO payroll row is created and NO salary math runs here.
          await attSvc.recompute(r.employeeId, monthName, y, { markSynced });
          synced++;
          return;
        }
        // ── Full sync (existing behaviour) ────────────────────────────────────
        const existing = await prisma.payroll.findFirst({
          where: { employeeId: r.employeeId, year: y, companyId: r.companyId, month: { in: [monthName, String(month), monthPrefix] } },
        });
        if (existing) {
          updated++;
        } else {
          await prisma.payroll.create({
            data: {
              companyId: r.companyId, employeeId: r.employeeId, employeeName: r.employeeName,
              department: r.department || 'General', month: monthName, year: y,
              basicSalary: r.salary, allowances: 0, deductions: 0, netSalary: 0,
              payrollStatus: 'draft', paymentStatus: 'pending', payslipGenerated: false,
            },
          });
          created++;
        }
        // 1) Persist the verified attendance snapshot (worksheet's source of truth).
        await attSvc.recompute(r.employeeId, monthName, y, { markSynced });
        // 2) Recalc payroll from that snapshot with attendance proration (one engine).
        await payrollCtrl.recalcForEmployeeMonth(r.employeeId, monthName, y);
        synced++;
      } catch (e) {
        console.error('[syncPayroll] employee failed', r.employeeId, e && e.message);
        failures.push({
          employeeId: r.employeeId,
          employeeName: r.employeeName || `#${r.employeeId}`,
          department: r.department || null,
          reason: (e && e.message) || 'Unknown error',
        });
      }
    };

    // ── Bounded-concurrency runner with cooperative cancellation ─────────────
    // Employees are independent (each touches only its own summary/payroll rows),
    // so N run in parallel — the run was latency-bound on thousands of SEQUENTIAL
    // round-trips, not CPU. The math per employee is byte-identical. Every
    // POLL_EVERY completions the run row is re-read: a CANCEL_REQUESTED status
    // stops NEW work immediately while in-flight employees finish atomically —
    // no partial per-employee writes, no corrupted rows.
    const CONCURRENCY = 8;
    const POLL_EVERY = 16;
    let cancelled = false;
    let dispatched = 0;
    let completed = 0;
    const pollRun = async () => {
      if (!run) return;
      const rowNow = await prisma.attendanceSyncLog.findUnique({
        where: { id: run.id }, select: { status: true },
      }).catch(() => null);
      if (rowNow && rowNow.status === 'CANCEL_REQUESTED') cancelled = true;
      await prisma.attendanceSyncLog.update({
        where: { id: run.id },
        data: { imported: synced, updated, failed: failures.length, skipped: completed },
      }).catch(() => {});
    };
    const workers = Array.from({ length: Math.min(CONCURRENCY, eligible.length) }, async () => {
      for (;;) {
        if (cancelled) return;
        const idx = dispatched++;
        if (idx >= eligible.length) return;
        await processOne(eligible[idx]);
        completed++;
        if (run && completed % POLL_EVERY === 0) await pollRun();
      }
    });
    await Promise.all(workers);

    if (run) {
      await prisma.attendanceSyncLog.update({
        where: { id: run.id },
        data: {
          status: cancelled ? 'CANCELLED' : (failures.length ? 'PARTIAL' : 'SUCCESS'),
          imported: synced, updated, failed: failures.length, skipped: completed,
          endedAt: new Date(), durationMs: Date.now() - startedAt,
        },
      }).catch(() => {});
    }

    return res.json({
      month, year, dryRun: false, snapshotOnly, count: rows.length,
      processed: eligible.length, attempted: completed, synced,
      failed: failures.length, failures, cancelled,
      remaining: Math.max(0, eligible.length - completed),
      durationMs: Date.now() - startedAt,
      updated, created, totals, rows,
    });
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

// POST /sync-payroll/cancel { clientRunId } — request cancellation of a running
// payroll sync. Cluster-safe: flips the DB run row to CANCEL_REQUESTED; the
// worker loop (any PM2 worker) sees it on its next poll, stops dispatching new
// employees, and lets in-flight atomic per-employee work finish cleanly.
exports.syncPayrollCancel = async (req, res) => {
  try {
    const clientRunId = req.body?.clientRunId != null ? String(req.body.clientRunId).slice(0, 191) : '';
    if (!clientRunId) return res.status(400).json({ error: 'clientRunId is required.' });
    const upd = await prisma.attendanceSyncLog.updateMany({
      where: { source: 'PayrollSync', windowFrom: clientRunId, status: 'RUNNING' },
      data: { status: 'CANCEL_REQUESTED' },
    });
    return res.json({ ok: true, requested: upd.count > 0 });
  } catch (e) {
    console.error('[syncPayrollCancel]', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /sync-payroll/status?runId= — progress for the modal (processed / total).
exports.syncPayrollStatus = async (req, res) => {
  try {
    const runId = req.query?.runId != null ? String(req.query.runId).slice(0, 191) : '';
    if (!runId) return res.status(400).json({ error: 'runId is required.' });
    const row = await prisma.attendanceSyncLog.findFirst({
      where: { source: 'PayrollSync', windowFrom: runId },
      orderBy: { id: 'desc' },
      select: { status: true, fetched: true, imported: true, updated: true, failed: true, skipped: true },
    });
    if (!row) return res.json({ status: 'UNKNOWN', processed: 0, total: 0 });
    return res.json({
      status: row.status,
      processed: row.skipped || 0, // `skipped` carries completed-count during the run
      synced: row.imported || 0,
      failed: row.failed || 0,
      total: row.fetched || 0,
    });
  } catch (e) {
    console.error('[syncPayrollStatus]', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── PUSH TO PAYROLL ENGINE — transfer the finalized attendance AND compute pay ──
// Takes the per-employee attendance the user reviewed on the Attendance
// Synchronization page, writes it into the Payroll module (the `payroll` table the
// Payroll UI reads) as one draft batch (company + month + year), and then runs the
// SINGLE payroll engine over it.
//
// It used to stop after the transfer: `overtime: 0, allowances: 0, deductions: 0,
// netSalary = payableSalary` were written verbatim and no engine ran. That is why
// approved overtime showed HOURS on the payroll row but never an AMOUNT — gross and
// net were unchanged and the payslip had no OT line. The hours were transferred,
// the money never was.
//
// Now the batch write is followed by, per employee:
//   1. attendanceSummaryService.recompute — persists the canonical snapshot,
//      including otHours summed from APPROVED overtime only;
//   2. payrollController.recalcForEmployeeMonth → recalcOne — the one engine that
//      computes OT amount, splits gross into Basic/HRA/Special, applies PF/ESI/PT
//      and produces net. No salary formula is duplicated here.
//
// Idempotent per employee/month/year/company (unique key → no duplicates; the
// engine is itself idempotent), and blocked (409) if payroll already exists for the
// period unless `replace` is set. Locked payroll rows are never touched.
exports.pushToPayroll = async (req, res) => {
  const toIntId = (v) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const body = req.body || {};
  const year = Number(body.year);
  const replace = !!body.replace;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const companyId = toIntId(body.companyId);

  try {
    // ── STEP: validate the request ──────────────────────────────────────────
    if (!body.month || !year) return res.status(400).json({ error: 'Payroll month and year are required.' });
    if (!rows.length) return res.status(400).json({ error: 'No employees to push. Recalculate attendance first.' });
    let month = String(body.month);
    if (/^\d+$/.test(month)) month = MONTH_NAMES[Number(month) - 1];
    if (!MONTH_NAMES.includes(month)) return res.status(400).json({ error: 'Invalid payroll month.' });

    // ── STEP: resolve the pushed employees + verify they are IN SCOPE ───────
    // (Company Head / Branch Head / HR may only push their own company/branch.)
    const isSuper = req.user?.role === 'Super Admin';
    const empIds = [...new Set(rows.map(r => toIntId(r.employeeId)).filter(v => v !== undefined))];
    const employees = await prisma.employee.findMany({ where: { id: { in: empIds.length ? empIds : [-1] } } });
    const empById = new Map(employees.map(e => [e.id, e]));

    let allowedCompanyIds = null, allowedBranchIds = null;
    if (!isSuper) {
      allowedCompanyIds = new Set([req.user.companyId, ...(req.user.accessibleCompanyIds || [])].map(toIntId).filter(v => v !== undefined));
      allowedBranchIds = new Set([...(req.user.accessibleBranchIds || [])].map(toIntId).filter(v => v !== undefined));
    }
    // A named workspace must be one the caller may enter — otherwise the check
    // below ("is this employee in the company the CLIENT named?") is satisfied by
    // simply naming the victim's company, which let a Company Head push payroll
    // for another tenant's employees. Authorise the id first, then keep the
    // narrowing behaviour it was written for.
    if (companyId !== undefined && !isSuper && !canEnterWorkspace(req, companyId)) {
      return res.status(403).json({ error: 'You are not authorised to push payroll for this workspace.' });
    }
    const inScope = (e) => {
      if (isSuper) return true;
      // The caller's real grants are ALWAYS required; a named companyId can only
      // narrow further, never substitute for them.
      const granted = allowedCompanyIds.has(e.companyId) || allowedBranchIds.has(e.branchId);
      if (!granted) return false;
      if (companyId !== undefined) return e.companyId === companyId || e.branchId === companyId;
      return true;
    };
    for (const r of rows) {
      const e = empById.get(toIntId(r.employeeId));
      if (!e) return res.status(400).json({ error: `Employee ${r.employeeId} was not found.` });
      if (!inScope(e)) return res.status(403).json({ error: 'One or more employees are outside your workspace scope.' });
    }

    const batchCompanyId = companyId !== undefined ? companyId : (employees[0]?.companyId || 1);

    // ── STEP: prevent duplicate payroll for company + month + year ──────────
    const existing = await prisma.payroll.findMany({
      where: { month, year, companyId: batchCompanyId },
      select: { id: true },
    });
    if (existing.length > 0 && !replace) {
      return res.status(409).json({
        error: 'PAYROLL_EXISTS',
        message: `Payroll already generated for ${month} ${year}.`,
        existing: existing.length,
      });
    }

    // ── STEP: wallet gate (validate + charge, FAIL-CLOSED) ──────────────────
    // Push-to-Payroll IS payroll generation, so it passes the same mandatory
    // wallet gate as /payroll/generate — atomic per-period charge, no rows
    // written on insufficient balance, and a broken wallet check blocks rather
    // than bypasses.
    {
      const { chargePayrollWallet, insufficientPayload } = require('../services/payrollWalletGuard');
      try {
        const charge = await chargePayrollWallet({
          companyId: batchCompanyId,
          month,
          year,
          createdBy: req.user?.name || 'System',
        });
        if (charge.charged) {
          await prisma.auditLog.create({
            data: {
              action: 'WALLET_DEDUCTION',
              module: 'Wallet',
              targetId: charge.assessment.reference,
              details: `Deducted ₹${charge.assessment.requiredNow} for Payroll Generation via Attendance Push (${month} ${year}).`,
              userId: req.user?.id || 1,
            },
          }).catch((e) => console.error('[pushToPayroll] wallet audit log failed:', e.message));
        }
      } catch (walletErr) {
        if (walletErr.code === 'INSUFFICIENT_WALLET_BALANCE') {
          return res.status(402).json(insufficientPayload(walletErr.assessment));
        }
        console.error('[pushToPayroll] wallet gate failed — push blocked:', walletErr.message);
        return res.status(503).json({
          success: false,
          code: 'WALLET_CHECK_FAILED',
          error: 'Payroll wallet could not be verified. Push to payroll is blocked — please try again.',
        });
      }
    }

    // ── STEP: build the payroll writes with the EXACT reviewed values ───────
    const now = new Date();
    const generatedBy = req.user?.name || req.user?.email || `User#${req.user?.id || '?'}`;
    let totalAmount = 0;
    const ops = rows.map((r) => {
      const e = empById.get(toIntId(r.employeeId));
      // EXACT transfer — the estimated/payable salary the user reviewed becomes
      // gross AND net (no recalculation, no deductions in this phase).
      const payable = round2(r.payableSalary);
      totalAmount = round2(totalAmount + payable);
      const data = {
        companyId: e.companyId,
        employeeName: r.employeeName || e.name || 'Unknown',
        department: r.department || e.department || 'General',
        // Seed values only — the engine pass below overwrites every money field
        // from the synced AttendanceSummary. They are NOT the final figures.
        basicSalary: payable, allowances: 0, deductions: 0, netSalary: payable,
        overtime: 0, bonus: 0, loanDeduction: 0, tax: 0,
        presentDays: round2(r.present),
        plDays: round2(r.paidLeave), clDays: 0, slDays: 0,
        lwpDays: round2(r.unpaidLeave),
        halfDays: round2(r.halfDay),
        otHours: round2(r.otHours),
        payableDays: round2(r.payableDays),
        workingDays: round2(r.workingDays),
        weeklyOffDays: round2(r.weeklyOff),
        holidayDays: round2(r.holiday),
        attendanceSyncedAt: now, attendanceSource: 'Attendance Synchronization',
        isOutdated: false, summarySyncedAt: now,
        payrollStatus: 'draft', paymentStatus: 'pending', payslipGenerated: false,
        notes: `Transferred from Attendance Synchronization — ${round2(r.payableDays)}/${round2(r.workingDays)} payable day(s).`,
      };
      return prisma.payroll.upsert({
        where: { employeeId_month_year_companyId: { employeeId: e.id, month, year, companyId: e.companyId } },
        update: data,
        create: { employeeId: e.id, month, year, ...data },
      });
    });

    // ── STEP: ONE transaction — all-or-nothing (no partial payroll) ─────────
    await prisma.$transaction(ops);

    // ── STEP: run the SINGLE payroll engine over the batch ──────────────────
    // Without this the rows above are attendance-only: OT hours present, OT amount
    // zero, no PF/ESI/PT, net = gross. The engine computes the money from the
    // canonical AttendanceSummary, so Payroll, the Salary Worksheet, the payslip
    // and every report read one identical calculation.
    //
    // Deliberately NOT inside the transaction above: a batch can be several
    // hundred employees and each recompute issues many queries, which would blow
    // Prisma's interactive-transaction timeout and hold locks across the whole
    // run. Instead each employee is independent — one failure cannot corrupt or
    // roll back the others, and every failure is reported back to the caller
    // rather than being swallowed.
    const attSvc = require('../services/attendanceSummaryService');
    const payrollCtrl = require('./payrollController'); // lazy require — no top-level cycle
    let computed = 0;
    const engineFailures = [];
    for (const r of rows) {
      const eid = toIntId(r.employeeId);
      const e = empById.get(eid);
      try {
        // 1) Canonical attendance snapshot (otHours = APPROVED overtime only).
        await attSvc.recompute(eid, month, year, { markSynced: true });
        // 2) One engine: OT amount, Basic/HRA/Special split, PF/ESI/PT, net.
        await payrollCtrl.recalcForEmployeeMonth(eid, month, year);
        computed++;
      } catch (err) {
        console.error('[pushToPayroll] engine failed for employee', eid, err && err.message);
        engineFailures.push({
          employeeId: eid,
          employeeName: r.employeeName || e?.name || `#${eid}`,
          reason: (err && err.message) || 'Unknown error',
        });
        // Leave the row visibly unfinished so it cannot be mistaken for final pay.
        await prisma.payroll.updateMany({
          where: { employeeId: eid, month, year, companyId: e?.companyId },
          data: { isOutdated: true },
        }).catch(() => {});
      }
    }

    // The reviewed estimate is NOT the payable total once deductions apply — report
    // what the engine actually produced so the UI never shows a stale figure.
    const computedAgg = await prisma.payroll.aggregate({
      where: { month, year, companyId: batchCompanyId, employeeId: { in: empIds.length ? empIds : [-1] } },
      _sum: { netSalary: true, overtime: true, otHours: true },
    });
    const netTotal = round2(computedAgg._sum.netSalary || 0);
    const overtimeTotal = round2(computedAgg._sum.overtime || 0);
    const otHoursTotal = round2(computedAgg._sum.otHours || 0);

    const batchId = `PB-${batchCompanyId}-${year}-${String(MONTH_NAMES.indexOf(month) + 1).padStart(2, '0')}`;

    // ── STEP: audit the batch ───────────────────────────────────────────────
    try {
      await prisma.auditLog.create({
        data: {
          userId: req.user?.id || null,
          action: 'PUSH_TO_PAYROLL', module: 'Payroll', targetId: batchId,
          details: JSON.stringify({
            batchId, companyId: batchCompanyId, month, year,
            employeeCount: rows.length, totalPayrollAmount: totalAmount,
            computed, netTotal, overtimeTotal, otHoursTotal,
            engineFailed: engineFailures.length,
            generatedBy, generatedAt: now.toISOString(), replaced: existing.length > 0,
          }).slice(0, 1000),
        },
      });
    } catch (_) { /* audit is best-effort */ }

    return res.json({
      batchId, month, year, companyId: batchCompanyId,
      employees: rows.length, totalAmount, replaced: existing.length > 0,
      // Post-engine figures — what payroll actually holds now.
      computed, netTotal, overtimeTotal, otHoursTotal,
      failed: engineFailures.length, engineFailures,
      generatedBy, generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('[pushToPayroll] FAILED', error);
    return res.status(500).json({ error: error.message || 'Failed to push to payroll.', code: error.code });
  }
};

exports.create = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.reason; // metadata, not a column
    const source = (body.source || '').toString(); delete body.source; // audit metadata, not a column
    const allowFutureDays = body.allowFutureDays; delete body.allowFutureDays; // policy hint, not a column
    // Coerce id columns to Int (companyId/employeeId are Int) so a string id from
    // the client can never break the attendance write.
    if (body.companyId !== undefined) { const n = Number(body.companyId); if (Number.isFinite(n)) body.companyId = n; }
    if (body.employeeId !== undefined) { const n = Number(body.employeeId); if (Number.isFinite(n)) body.employeeId = n; }

    // Future-date policy: reject any date after today (bounded allowance aside).
    if (isFutureAttendanceDate(body.date, allowFutureDays)) {
      return res.status(403).json({ code: 'FUTURE_DATE', error: 'Attendance cannot be marked for future dates.' });
    }

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
        // Re-derive overtime: a corrected punch must not leave the old claim behind.
        const overtime = await deriveOvertimeForAttendance(updated);
        const flagged = await flagPayrollOutdated(updated.employeeId, updated.date);
        await writeAttendanceAudit(req, 'CORRECT_ATTENDANCE', updated, dup.status, source, undefined, flagged > 0);
        return res.status(200).json({ ...updated, overtime });
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
    // Punches in ⇒ overtime derived (Pending, awaiting approval).
    const overtime = await deriveOvertimeForAttendance(data);
    // A new attendance record changes the month's totals → payroll is now stale.
    const flagged = await flagPayrollOutdated(data.employeeId, data.date);
    await writeAttendanceAudit(req, action, data, undefined, source, undefined, flagged > 0);
    res.status(action === 'CORRECT_ATTENDANCE' ? 200 : 201).json({ ...data, overtime });
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
    const allowFutureDays = body.allowFutureDays; delete body.allowFutureDays; // policy hint, not a column
    // Coerce id columns to Int so a string companyId/employeeId can never break the save.
    if (body.companyId !== undefined) { const n = Number(body.companyId); if (Number.isFinite(n)) body.companyId = n; }
    if (body.employeeId !== undefined) { const n = Number(body.employeeId); if (Number.isFinite(n)) body.employeeId = n; }

    const existing = await prisma.attendance.findUnique({ where: { id: idParam(id) } });
    // Future-date policy: reject moving/marking a record onto a future date.
    if (isFutureAttendanceDate(body.date || existing?.date, allowFutureDays)) {
      return res.status(403).json({ code: 'FUTURE_DATE', error: 'Attendance cannot be marked for future dates.' });
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE REPORTS — the "View Full Report" destinations.
//
// Both are projections of ONE aggregate (services/attendanceReportService.js), so
// the Department report's numbers can never disagree with the Workforce report's,
// and both reconcile with the dashboard cards because they share the frontend's
// status classifier via utils/attendanceStatus.js.
//
// Scope, branch confinement and the date range are all resolved server-side; a
// hand-crafted request cannot widen them. Failures are logged with the actor and
// the query, and returned as real status codes — never a silent empty report.
// ─────────────────────────────────────────────────────────────────────────────
const { buildReport } = require('../services/attendanceReportService');

const reportHandler = (name, project) => async (req, res) => {
  const tag = `[attendance:${name}] by=${req.user?.id ?? '?'} (${req.user?.role || 'unknown'}) q=${JSON.stringify(req.query)}`;
  const startedAt = Date.now();
  try {
    const built = await buildReport(req, req.query || {});
    if (!built.ok) {
      console.warn(`${tag} REJECTED ${built.status}: ${built.body.error}`);
      return res.status(built.status).json(built.body);
    }
    const body = project(built.report);
    console.log(`${tag} ok in ${Date.now() - startedAt}ms employees=${built.report.totals.employees} records=${built.report.totals.records}`);
    res.json(body);
  } catch (error) {
    // Never fail silently: the actor, the query, the message and the stack all go
    // to the log, and the caller gets a 500 they can surface.
    console.error(`${tag} FAILED after ${Date.now() - startedAt}ms`, error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// GET /api/attendance/workforce-report
// Everything: totals, the three trend series, department split and the
// per-employee breakdown.
exports.workforceReport = reportHandler('workforce-report', (r) => r);

// GET /api/attendance/department-report
// Department-first projection. The employee list is retained for the drill-down
// but carries only the fields the department view renders.
exports.departmentReport = reportHandler('department-report', (r) => ({
  range: r.range,
  scope: r.scope,
  totals: r.totals,
  byDepartment: r.byDepartment,
  daily: r.daily,
  employees: r.byEmployee.map((e) => ({
    employeeId: e.employeeId, code: e.code, name: e.name, department: e.department,
    designation: e.designation, branch: e.branch,
    present: e.present, absent: e.absent, leave: e.leave, halfDay: e.halfDay, wfh: e.wfh,
    late: e.late, earlyExit: e.earlyExit, overtimeHours: e.overtimeHours,
    attendancePercent: e.attendancePercent,
  })),
}));
