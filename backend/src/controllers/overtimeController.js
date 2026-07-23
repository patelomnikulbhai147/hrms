const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { grantedCompanyIds, grantedBranchIds, canReachCompany } = require('../utils/companyScope');

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
    res.status(201).json(shapeOvertime(data));
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
      select: { id: true, companyId: true, employee: { select: { branchId: true } } },
    });
    if (!current) return res.status(404).json({ error: 'Overtime entry not found.' });
    if (req.user && req.user.role !== 'Super Admin') {
      const reachable = canReachCompany(req, current.companyId)
        || (current.employee?.branchId != null && canReachCompany(req, current.employee.branchId));
      if (!reachable) return res.status(403).json({ error: 'Not your workspace.' });
    }

    const updated = await prisma.overtime.update({ where: { id: idParam(id) }, data });
    res.json(shapeOvertime(updated));
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
      select: { id: true, companyId: true, employee: { select: { branchId: true } } },
    });
    if (!current) return res.status(404).json({ error: 'Overtime entry not found.' });
    if (req.user && req.user.role !== 'Super Admin') {
      const reachable = canReachCompany(req, current.companyId)
        || (current.employee?.branchId != null && canReachCompany(req, current.employee.branchId));
      if (!reachable) return res.status(403).json({ error: 'Not your workspace.' });
    }
    await prisma.overtime.delete({ where: { id: idParam(id) } });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting overtime', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
