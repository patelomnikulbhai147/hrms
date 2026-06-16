const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

// Real scalar columns on the Shift model. Anything else in the request body
// (e.g. the legacy `break` alias, an `id`, or a branch-level `companyId`) is
// dropped so Prisma never rejects the whole write with "Unknown argument …" —
// the bug that previously made Create/Edit Shift silently fail.
const SHIFT_FIELDS = ['name', 'code', 'start', 'end', 'grace', 'breakTime', 'otEnabled', 'status'];

// The frontend historically sent `break` instead of the real column `breakTime`.
// Accept either so old and new clients both persist the value.
function pickShiftData(body) {
  const src = { ...body };
  if (src.break !== undefined && src.breakTime === undefined) src.breakTime = src.break;
  const data = {};
  for (const k of SHIFT_FIELDS) if (src[k] !== undefined) data[k] = src[k];
  return data;
}

// Shifts are COMPANY-wide policies. A workspace id can be either a company id or
// a branch id (the two id spaces overlap). Resolve any branch id to its parent
// company so shifts are consistent whether you enter the company or one of its
// branches.
async function resolveCompanyId(rawId) {
  const id = idParam(rawId);
  if (!id) return null;
  const branch = await prisma.branch.findUnique({ where: { id }, select: { companyId: true } });
  return branch ? branch.companyId : id;
}

// The set of company ids the caller may touch (their own + accessible).
function allowedCompanyIds(req) {
  return [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
}

exports.getAll = async (req, res) => {
  try {
    const workspaceId = req.query.companyId || req.headers['x-workspace-id'];
    const companyId = await resolveCompanyId(workspaceId);
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      const allowed = allowedCompanyIds(req);
      whereClause.companyId = { in: allowed };
      if (companyId) {
        if (!allowed.includes(companyId)) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        whereClause.companyId = companyId;
      }
    } else if (companyId) {
      whereClause.companyId = companyId;
    }

    const data = await prisma.shift.findMany({
      where: whereClause,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching shifts', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req.body.companyId || req.headers['x-workspace-id']);
    if (!companyId) return res.status(400).json({ error: 'A company workspace is required to create a shift.' });

    if (req.user && req.user.role !== 'Super Admin' && !allowedCompanyIds(req).includes(companyId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const data = pickShiftData(req.body);
    if (!data.name || !data.start || !data.end) {
      return res.status(400).json({ error: 'Shift name, start and end time are required.' });
    }

    const shift = await prisma.shift.create({ data: { ...data, companyId } });
    res.status(201).json(shift);
  } catch (error) {
    console.error('Error creating shift', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const data = pickShiftData(req.body);
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid shift fields supplied to update.' });
    }
    const shift = await prisma.shift.update({ where: { id }, data });
    res.json(shift);
  } catch (error) {
    console.error('Error updating shift', error);
    if (error.code === 'P2025') return res.status(404).json({ error: 'Shift not found.' });
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// Archive = soft delete. Keeps the row (and any employee assignments) but hides
// it from the active policy list. Reversible via update(status:'Active').
exports.archive = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const shift = await prisma.shift.update({ where: { id }, data: { status: 'Archived' } });
    res.json(shift);
  } catch (error) {
    console.error('Error archiving shift', error);
    if (error.code === 'P2025') return res.status(404).json({ error: 'Shift not found.' });
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    // Detach any employees first so the hard delete never fails on a FK.
    await prisma.employee.updateMany({ where: { shiftId: id }, data: { shiftId: null } });
    await prisma.shift.delete({ where: { id } });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting shift', error);
    if (error.code === 'P2025') return res.status(404).json({ error: 'Shift not found.' });
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// Assign / unassign employees to a shift (bulk). body: { employeeIds: number[] }
exports.assignEmployees = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const shift = await prisma.shift.findUnique({ where: { id } });
    if (!shift) return res.status(404).json({ error: 'Shift not found.' });

    const employeeIds = (req.body.employeeIds || []).map(idParam).filter(Boolean);
    // Replace the shift's roster: clear current members, then set the new set
    // (scoped to the shift's company so we never touch another company's staff).
    await prisma.employee.updateMany({ where: { shiftId: id }, data: { shiftId: null } });
    if (employeeIds.length) {
      await prisma.employee.updateMany({
        where: { id: { in: employeeIds }, companyId: shift.companyId },
        data: { shiftId: id },
      });
    }
    const count = await prisma.employee.count({ where: { shiftId: id } });
    res.json({ shiftId: id, assigned: count });
  } catch (error) {
    console.error('Error assigning employees to shift', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
