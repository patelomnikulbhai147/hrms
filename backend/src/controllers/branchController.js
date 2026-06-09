const prisma = require('../config/prisma');

exports.getBranches = async (req, res) => {
  try {
    const { companyId } = req.query;
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      whereClause.OR = [
        { companyId: { in: allowedIds } },
        { id: { in: allowedIds } }
      ];
      if (companyId) {
        if (!allowedIds.includes(companyId)) {
          // If they request a specific company but they only have access to a child branch of it,
          // the OR clause already includes that logic for their specific branches. We just AND the companyId.
          whereClause.companyId = companyId;
        } else {
          whereClause.companyId = companyId;
        }
      }
    } else if (companyId) {
      whereClause.companyId = companyId;
    }

    const branches = await prisma.branch.findMany({ where: whereClause });

    // Live employee counts per branch, computed directly from the Employee table.
    // `headcount` is the TOTAL number of employees assigned to the branch
    // (COUNT WHERE branchId = b.id) — the canonical "staff count" shown across
    // the UI, dashboard and exports. The stale stored Branch.headcount column is
    // intentionally ignored. `activeHeadcount` is the active-only subset.
    const branchIds = branches.map(b => b.id);
    const [totalGroups, activeGroups] = await Promise.all([
      prisma.employee.groupBy({
        by: ['branchId'],
        where: { branchId: { in: branchIds } },
        _count: { _all: true },
      }),
      prisma.employee.groupBy({
        by: ['branchId'],
        where: { branchId: { in: branchIds }, status: { in: ['Active', 'ACTIVE'] } },
        _count: { _all: true },
      }),
    ]);
    const totalBy = Object.fromEntries(totalGroups.map(g => [g.branchId, g._count._all]));
    const activeBy = Object.fromEntries(activeGroups.map(g => [g.branchId, g._count._all]));

    const enrichedBranches = branches.map(b => ({
      ...b,
      headcount: totalBy[b.id] || 0,
      activeHeadcount: activeBy[b.id] || 0,
      totalEmployeeCount: totalBy[b.id] || 0,
    }));

    res.json(enrichedBranches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createBranch = async (req, res) => {
  try {
    const branch = await prisma.branch.create({
      data: req.body
    });
    res.status(201).json(branch);
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Scalar columns that actually exist on the Branch model. Any other key in the
// request body (e.g. accountStatus / branchPortalActive — which live on Company,
// not Branch) is ignored so Prisma never rejects the whole update with an
// "Unknown argument" error and silently fails a Restore/Suspend.
const BRANCH_UPDATABLE_FIELDS = [
  'branchName', 'location', 'status', 'isArchived', 'adminEmail', 'adminName',
  'basicPercent', 'branchCode', 'email', 'phone', 'employeeCapacity',
  'esicRate', 'overtimeRate', 'pfRate', 'profTaxRate', 'headcount',
];

exports.updateBranch = async (req, res) => {
  try {
    const { id } = req.params;

    // Accept `name` as an alias for branchName (the frontend sends either).
    const body = { ...req.body };
    if (body.name && !body.branchName) body.branchName = body.name;
    if (body.address && !body.location) body.location = body.address;

    // Whitelist only real Branch columns.
    const data = {};
    for (const key of BRANCH_UPDATABLE_FIELDS) {
      if (body[key] !== undefined) data[key] = body[key];
    }

    // Restore semantics: reactivating a branch must also clear the archive flag,
    // and archiving must set it — keep status and isArchived consistent.
    if (data.status === 'Active') {
      data.isArchived = false;
    } else if (typeof data.status === 'string' &&
      ['Archived', 'Suspended', 'Inactive', 'Deactivated', 'Disabled'].includes(data.status)) {
      if (data.isArchived === undefined && data.status === 'Archived') data.isArchived = true;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid branch fields supplied to update.' });
    }

    const branch = await prisma.branch.update({ where: { id }, data });
    res.json({ ...branch, name: branch.branchName, isHeadOffice: false, parentCompanyId: branch.companyId });
  } catch (error) {
    console.error('Error updating branch:', error);
    // P2025 = record not found
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Branch not found.' });
    }
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.branch.delete({
      where: { id }
    });
    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    console.error('Error deleting branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
