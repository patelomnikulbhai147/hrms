const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { grantedCompanyIds, grantedBranchIds, canReachCompany } = require('../utils/companyScope');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ─────────────────────────────────────────────────────────────────────────────
// Overtime → AttendanceSummary → Payroll: the link that was missing.
//
// The payroll worksheet resolves its Attendance Summary as `summary || computed`
// — the STORED AttendanceSummary wins over the live figures. Nothing recomputed
// that stored row when an overtime record was approved, so newly-approved hours
// stayed invisible to Payroll until somebody happened to re-run Attendance
// Synchronization. Measured on real data: 5 employee-months had approved
// overtime with `summary.otHours = 0` and therefore `payroll.overtime = 0`.
//
// Approving overtime is the event that changes the payable hours, so approving
// it is what must refresh the snapshot. This runs on every write that can move
// the APPROVED total for an employee-month — create, edit, approve/reject and
// delete — and it is idempotent: recompute derives the total from the Overtime
// table rather than adding a delta, so running it twice cannot double-count.
//
// A locked month is left alone (attendanceSummaryService.recompute refuses to
// overwrite one) and locked payroll is skipped by the engine, so a closed pay
// period never moves.
// ─────────────────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' → { month: 'July', year: 2026 } | null */
function periodOf(date) {
  const m = /^(\d{4})-(\d{2})/.exec(String(date || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const name = MONTH_NAMES[Number(m[2]) - 1];
  return name && year ? { month: name, year } : null;
}

/**
 * Refresh the attendance snapshot + payroll for every period the given dates
 * touch. An edit that MOVES an entry between months passes both dates, so the
 * month it left is corrected as well as the one it joined.
 *
 * Never throws: an overtime record that saved correctly must not report failure
 * because a downstream recompute had a problem. The outcome is returned so the
 * caller can put it in the response, and any failure is logged in full — the
 * one thing this must never do is fail silently.
 */
async function syncOvertimeToPayroll(employeeId, dates, context = {}) {
  const eid = idParam(employeeId);
  const results = [];
  if (!eid) return results;

  const periods = new Map();
  for (const d of dates.filter(Boolean)) {
    const p = periodOf(d);
    if (p) periods.set(`${p.month}|${p.year}`, p);
  }

  const attSvc = require('../services/attendanceSummaryService');
  const payrollCtrl = require('./payrollController'); // lazy — avoids a require cycle

  for (const { month, year } of periods.values()) {
    const started = Date.now();
    try {
      // 1) Canonical snapshot — otHours is re-derived from APPROVED rows only.
      const summary = await attSvc.recompute(eid, month, year);
      // 2) One engine: OT amount, gross split, PF/ESI/PT, net. Skips locked rows.
      const recalculated = await payrollCtrl.recalcForEmployeeMonth(eid, month, year);
      results.push({
        month, year, ok: true,
        otHours: summary?.otHours ?? 0,
        payrollRowsRecalculated: recalculated,
        ms: Date.now() - started,
      });
    } catch (err) {
      // Everything needed to diagnose it, per incident-response requirements.
      const approved = await prisma.overtime
        .aggregate({ where: { employeeId: eid, status: 'Approved' }, _sum: { otHours: true } })
        .catch(() => null);
      const payroll = await prisma.payroll
        .findFirst({ where: { employeeId: eid, month, year }, select: { id: true, otHours: true, overtime: true } })
        .catch(() => null);
      console.error('[overtime→payroll] SYNC FAILED', JSON.stringify({
        employeeId: eid,
        overtimeRecordId: context.overtimeId ?? null,
        trigger: context.trigger || 'unknown',
        payrollMonth: `${month} ${year}`,
        approvedHoursOnRecord: approved?._sum?.otHours ?? null,
        payrollId: payroll?.id ?? null,
        hoursImported: payroll?.otHours ?? null,
        otAmount: payroll?.overtime ?? null,
        sqlErrorCode: err?.code ?? null,
        meta: err?.meta ?? null,
        message: err?.message,
        timestamp: new Date().toISOString(),
      }));
      console.error(err?.stack || err);
      results.push({ month, year, ok: false, error: err?.message || 'sync failed' });
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// The Overtime form and the Overtime table have never agreed on field names.
// The client posts { empId, empName, empCode, in, out }; the model requires
// { employeeId, employeeName, employeeCode, inTime, outTime }. `create` passed
// req.body straight to Prisma, so EVERY overtime entry failed in production with
// "Argument `employeeName` is missing" — 500 on every attempt, the only
// recurring error in the live logs.
//
// Normalising here (rather than renaming the form fields) fixes it for clients
// already deployed in browsers, and accepts both spellings so a later frontend
// change cannot break it again.
const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');

function toOvertimeRow(body, user) {
  const b = body || {};
  const employeeId = idParam(pick(b.employeeId, b.empId));
  const companyId = idParam(pick(b.companyId, user?.companyId));
  const otHours = Number(pick(b.otHours, 0)) || 0;
  return {
    companyId,
    employeeId,
    employeeName: String(pick(b.employeeName, b.empName) || '').trim(),
    employeeCode: pick(b.employeeCode, b.empCode) || null,
    department: b.department || null,
    branch: b.branch || null,
    shift: b.shift || null,
    date: String(pick(b.date) || ''),
    inTime: String(pick(b.inTime, b.in) || ''),
    outTime: String(pick(b.outTime, b.out) || ''),
    otHours,
    type: String(pick(b.type) || 'Normal Overtime'),
    reason: b.reason || null,
    remarks: b.remarks || null,
    status: b.status || 'Pending',
  };
}

// Echo the legacy aliases back so the existing Overtime table — which renders
// `ot.empName` — keeps working without a frontend deploy.
const shapeOvertime = (row) => ({
  ...row,
  empId: row.employeeId,
  empName: row.employeeName,
  empCode: row.employeeCode,
  in: row.inTime,
  out: row.outTime,
});

exports.getAll = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      // Mirror the create check: a user granted only certain BRANCHES of a
      // company must still see the overtime raised for employees in them, even
      // though the row itself is stamped with the parent company id.
      const branchIds = grantedBranchIds(req);
      whereClause.OR = [
        { companyId: { in: grantedCompanyIds(req) } },
        ...(branchIds.length ? [{ employee: { branchId: { in: branchIds } } }] : []),
      ];
      if (companyId) {
        if (!canReachCompany(req, companyId)) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        delete whereClause.OR;
        // The requested workspace may be a BRANCH. Overtime rows are stamped with
        // the PARENT company id (the model has no branchId), so filtering by the
        // branch id directly would match nothing — a branch user would see an
        // empty overtime list. Match on the employee's branch instead.
        // branchCompanyMap is built by authMiddleware: branch id → parent company.
        const isBranch = !!(req.user.branchCompanyMap || {})[companyId];
        if (isBranch) whereClause.employee = { branchId: companyId };
        else whereClause.companyId = companyId;
      }
    } else if (companyId) {
      whereClause.companyId = companyId;
    }

    const data = await prisma.overtime.findMany({ where: whereClause });
    res.json(data.map(shapeOvertime));
  } catch (error) {
    console.error('Error fetching overtimes', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const row = toOvertimeRow(req.body, req.user);

    // Validate explicitly so a bad entry is a 400 the user can act on, not a 500.
    const missing = ['companyId', 'employeeId', 'employeeName', 'date', 'inTime', 'outTime']
      .filter((k) => row[k] === null || row[k] === undefined || row[k] === '');
    if (missing.length) {
      return res.status(400).json({
        error: `Missing required overtime details: ${missing.join(', ')}.`,
        fields: missing,
      });
    }

    // Authorise against the EMPLOYEE, not just the company id on the payload.
    //
    // resolveAccess (authMiddleware) demotes a company to branch-level access
    // whenever the user is granted specific branches of it: a Company Head with
    // branches 7 and 8 of company 2 gets accessibleBranchIds [7,8] and company 2
    // is NOT in accessibleCompanyIds. Overtime rows only carry companyId, so a
    // company-level check refused every entry for a branch the user genuinely
    // administers. Verified in production — raising overtime for an employee in
    // branch 7 of company 2 returned 403.
    const employee = await prisma.employee.findUnique({
      where: { id: row.employeeId },
      select: { id: true, companyId: true, branchId: true },
    });
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });

    const reachable = canReachCompany(req, employee.companyId)
      || (employee.branchId != null && canReachCompany(req, employee.branchId));
    if (!reachable) return res.status(403).json({ error: 'Not your workspace.' });

    // Keep the stored companyId consistent with the employee it belongs to,
    // rather than trusting whatever the client posted.
    row.companyId = employee.companyId;

    const data = await prisma.overtime.create({ data: row });
    // A record created already-Approved (bulk import, or an admin approving at
    // entry) must reach payroll immediately, not wait for a later sync.
    const payrollSync = await syncOvertimeToPayroll(data.employeeId, [data.date], {
      overtimeId: data.id, trigger: 'create',
    });
    res.status(201).json({ ...shapeOvertime(data), payrollSync });
  } catch (error) {
    console.error('Error creating overtime', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// Which request-body keys (including legacy aliases) map onto which column.
// Used so an update writes ONLY what the caller actually sent.
const UPDATE_FIELDS = {
  employeeId: ['employeeId', 'empId'],
  employeeName: ['employeeName', 'empName'],
  employeeCode: ['employeeCode', 'empCode'],
  department: ['department'],
  branch: ['branch'],
  shift: ['shift'],
  date: ['date'],
  inTime: ['inTime', 'in'],
  outTime: ['outTime', 'out'],
  otHours: ['otHours'],
  type: ['type'],
  reason: ['reason'],
  remarks: ['remarks'],
  status: ['status'],
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};

    // Build the patch from the keys PRESENT in the request — never from a
    // normalised full row.
    //
    // This used to call toOvertimeRow(), which fills in defaults for everything
    // the caller omitted (otHours → 0, type → 'Normal Overtime'), then dropped
    // only null/undefined/''. Zero survives that filter, so approving an entry —
    // a status-only PUT { status: 'Approved' } — silently rewrote otHours to 0
    // and reset the OT type. The hours vanished at the exact moment the record
    // became eligible for pay, so approved overtime was always worth ₹0.
    const data = {};
    for (const [column, aliases] of Object.entries(UPDATE_FIELDS)) {
      const key = aliases.find((a) => Object.prototype.hasOwnProperty.call(b, a));
      if (key === undefined) continue;             // not supplied → leave untouched
      const raw = b[key];
      if (raw === undefined) continue;

      if (column === 'employeeId') {
        const v = idParam(raw);
        if (v !== undefined && v !== null) data[column] = v;
      } else if (column === 'otHours') {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ error: 'Overtime hours must be a non-negative number.', fields: ['otHours'] });
        }
        data[column] = n;
      } else if (['employeeName', 'date', 'inTime', 'outTime', 'type', 'status'].includes(column)) {
        // Required columns — reject a blank rather than writing one.
        const v = String(raw ?? '').trim();
        if (v === '') {
          return res.status(400).json({ error: `${column} cannot be blank.`, fields: [column] });
        }
        data[column] = v;
      } else {
        data[column] = raw === '' ? null : raw;     // optional text columns
      }
    }
    // companyId is deliberately absent from UPDATE_FIELDS — an entry is never
    // re-homed to another company by an edit.

    if (!Object.keys(data).length) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    // Authorise against the EXISTING row before touching it, so an id from
    // another tenant cannot be edited by guessing it.
    const current = await prisma.overtime.findUnique({
      where: { id: idParam(id) },
      select: { id: true, companyId: true, employeeId: true, date: true, status: true, otHours: true, employee: { select: { branchId: true } } },
    });
    if (!current) return res.status(404).json({ error: 'Overtime entry not found.' });
    if (req.user && req.user.role !== 'Super Admin') {
      const reachable = canReachCompany(req, current.companyId)
        || (current.employee?.branchId != null && canReachCompany(req, current.employee.branchId));
      if (!reachable) return res.status(403).json({ error: 'Not your workspace.' });
    }

    const updated = await prisma.overtime.update({ where: { id: idParam(id) }, data });

    // THE approval hook. Approving (or un-approving, re-dating, re-hosting to a
    // different employee, or changing the hours) all move an employee-month's
    // approved total, so every one of them refreshes the snapshot and payroll.
    // Both the OLD and NEW date/employee are passed, so an entry moved between
    // months or people corrects the period it left as well as the one it joined.
    const payrollSync = await syncOvertimeToPayroll(updated.employeeId, [current.date, updated.date], {
      overtimeId: updated.id, trigger: `update:${current.status}->${updated.status}`,
    });
    if (current.employeeId !== updated.employeeId) {
      payrollSync.push(...await syncOvertimeToPayroll(current.employeeId, [current.date], {
        overtimeId: updated.id, trigger: 'update:reassigned-from',
      }));
    }
    res.json({ ...shapeOvertime(updated), payrollSync });
  } catch (error) {
    console.error('Error updating overtime', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    // Same ownership check as update — deleting by a guessed id must not reach
    // another tenant's overtime.
    const current = await prisma.overtime.findUnique({
      where: { id: idParam(id) },
      select: { id: true, companyId: true, employeeId: true, date: true, status: true, employee: { select: { branchId: true } } },
    });
    if (!current) return res.status(404).json({ error: 'Overtime entry not found.' });
    if (req.user && req.user.role !== 'Super Admin') {
      const reachable = canReachCompany(req, current.companyId)
        || (current.employee?.branchId != null && canReachCompany(req, current.employee.branchId));
      if (!reachable) return res.status(403).json({ error: 'Not your workspace.' });
    }
    await prisma.overtime.delete({ where: { id: idParam(id) } });
    // Deleting APPROVED overtime removes paid hours — payroll must stop paying
    // them, so the snapshot is rebuilt the same way as on approval.
    const payrollSync = await syncOvertimeToPayroll(current.employeeId, [current.date], {
      overtimeId: current.id, trigger: 'delete',
    });
    res.json({ message: 'Deleted successfully', payrollSync });
  } catch (error) {
    console.error('Error deleting overtime', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
