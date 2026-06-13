const prisma = require('../config/prisma');
const { nextEntityId, nextBranchNo } = require('../utils/sequentialNo');
const idParam = require('../utils/idParam');
const respondError = require('../utils/respondError');

exports.getBranches = async (req, res) => {
  try {
    // CRITICAL: the branch REGISTRY must NOT be narrowed by the active workspace
    // (the `x-workspace-id` header). That header changes every time a Super Admin
    // masquerades into a company/branch. Because branch ids overlap company ids
    // (e.g. Branch 2 "Bhavnagar" vs Company 2 "HealthPlus"), filtering the
    // registry by the active id would drop the very branch being opened, and the
    // frontend's resolveActiveWorkspace would then fall back to the colliding
    // company — opening the wrong workspace. Only an EXPLICIT ?companyId= query
    // narrows the result; the active-workspace header is ignored here. (Mirrors
    // /api/companies, which already returns the full set for Super Admin.)
    const explicitCompanyId = idParam(req.query.companyId);
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      whereClause.OR = [
        { companyId: { in: allowedIds } },
        { id: { in: allowedIds } }
      ];
    }
    if (explicitCompanyId) {
      // Explicit filter (e.g. a specific company's branch list). For non-super
      // users this ANDs with the access OR-clause above, so it can never widen
      // their scope.
      whereClause.companyId = explicitCompanyId;
    }

    const branches = await prisma.branch.findMany({
      where: whereClause,
      include: {
        company: {
          select: { name: true }
        }
      },
      // Company-wise ordering: group by company, then ascending branchNo
      // (the per-company 1..N sequence), falling back to id for any legacy
      // rows that predate branchNo backfill.
      orderBy: [{ companyId: 'asc' }, { branchNo: 'asc' }, { id: 'asc' }],
    });

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
      parentCompanyName: b.company?.name || 'Unknown Company'
    }));

    res.json(enrichedBranches);
  } catch (error) {
    return respondError(res, error);
  }
};

exports.createBranch = async (req, res) => {
  try {
    const data = require('../utils/idParam').coerceEntityIds({ ...req.body });
    delete data.id;
    delete data.branchNo;
    const branch = await prisma.branch.create({
      data: {
        ...data,
        id: await nextEntityId(),
        branchNo: await nextBranchNo(data.companyId),
      }
    });
    res.status(201).json(branch);
  } catch (error) {
    return respondError(res, error);
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

    const branch = await prisma.branch.update({ where: { id: idParam(id) }, data });
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
      where: { id: idParam(id) }
    });
    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    return respondError(res, error);
  }
};
