const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { grantedCompanyIds, canReachCompany } = require('../utils/companyScope');

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
      whereClause.companyId = { in: grantedCompanyIds(req) };
      if (companyId) {
        if (!canReachCompany(req, companyId)) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        whereClause.companyId = companyId;
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

    if (!canReachCompany(req, row.companyId)) {
      return res.status(403).json({ error: 'Not your workspace.' });
    }

    const data = await prisma.overtime.create({ data: row });
    res.status(201).json(shapeOvertime(data));
  } catch (error) {
    console.error('Error creating overtime', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    // Same alias problem as create: only send through the keys the caller
    // actually supplied, so a status-only PATCH cannot blank employeeName.
    const full = toOvertimeRow({ ...req.body, companyId: req.body.companyId ?? undefined }, req.user);
    const supplied = {};
    for (const [k, v] of Object.entries(full)) {
      if (v !== null && v !== undefined && v !== '') supplied[k] = v;
    }
    delete supplied.companyId; // never re-home an entry to another company
    const data = await prisma.overtime.update({ where: { id: idParam(id) }, data: supplied });
    res.json(shapeOvertime(data));
  } catch (error) {
    console.error('Error updating overtime', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.overtime.delete({ where: { id: idParam(id) } });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting overtime', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
