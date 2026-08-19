const prisma = require('../config/prisma');
const { nextEntityId, nextBranchNo } = require('../utils/sequentialNo');
const idParam = require('../utils/idParam');
const respondError = require('../utils/respondError');
const AuditService = require('../services/auditService');
const { canEnterWorkspace, isSuperAdmin } = require('../utils/workspaceScope');

// Tenant guard for branch WRITE handlers. A branch id from the client is a
// request, not a permission: without this a leader of company A could update,
// archive, reactivate, delete or offboard (mass-archiving the workforce of)
// company B's branch by naming its id. Loads the branch once, 404s if missing,
// and 403s (existing convention) when the branch's parent company is outside
// the caller's scope. Super Admin is unrestricted. Uses the existing
// workspaceScope helper — no new tenant resolver. Returns the branch on success.
async function authorizeBranchWrite(req, res) {
  const branchId = idParam(req.params.id);
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    res.status(404).json({ success: false, message: 'Branch not found.' });
    return null;
  }
  if (!isSuperAdmin(req) && !canEnterWorkspace(req, branch.companyId)) {
    res.status(403).json({ success: false, message: 'You do not have access to this branch.' });
    return null;
  }
  return branch;
}

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
      headcount: activeBy[b.id] || 0,
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
    const body = idParam.coerceEntityIds({ ...req.body });
    delete body.id;
    delete body.branchNo;

    // ── Normalise the payload the branch forms actually send ──
    // "Deploy Branch" (Companies + Billing) posts a COMPANY-shaped object — the
    // same object it pushes into local UI state — so the parent arrives as
    // `parentCompanyId`, the branch title as `name` and the address as
    // `address`. Branch stores those as `companyId` / `branchName` / `location`.
    // Without this mapping `companyId` was undefined and Prisma rejected the
    // create with the (opaque) "Argument `company` is missing". updateBranch has
    // always normalised this way; create now matches it.
    if (body.name && !body.branchName) body.branchName = body.name;
    if (body.address && !body.location) body.location = body.address;
    const rawCompanyId = body.companyId ?? body.parentCompanyId;
    const companyId = Number(rawCompanyId);

    // Explicit validation BEFORE Prisma so a missing/invalid parent returns a
    // clear, actionable error instead of a generic relation/type error. Branch
    // .companyId is an Int, so a non-numeric id (e.g. a legacy "c-gcri" string)
    // is rejected here rather than surfacing as Prisma's opaque
    // "Argument `companyId`: Expected Int or Null, provided String".
    if (rawCompanyId === undefined || rawCompanyId === null || rawCompanyId === '' || !Number.isFinite(companyId)) {
      console.warn(`[branch:create] rejected — invalid companyId:`, { companyId: rawCompanyId, type: typeof rawCompanyId });
      return res.status(400).json({
        success: false,
        code: 'COMPANY_REQUIRED',
        message: 'Please select a parent company before deploying a branch.',
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      return res.status(400).json({
        success: false,
        code: 'COMPANY_REQUIRED',
        message: 'Please select a parent company before deploying a branch.',
      });
    }

    // Whitelist real Branch columns only — the posted object also carries
    // Company-only keys (plan, logo, domain, accountStatus, …) which Prisma
    // would otherwise reject wholesale with "Unknown argument".
    const data = { companyId };
    for (const key of BRANCH_UPDATABLE_FIELDS) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (!data.branchName) {
      return res.status(400).json({
        success: false,
        code: 'BRANCH_NAME_REQUIRED',
        message: 'Please enter a branch name before deploying a branch.',
      });
    }

    // ── Branch slots are NOT enforced ──
    // Business rule: every company may create UNLIMITED branches. Branch
    // creation is gated by PERMISSIONS ONLY (route auth), never by slot
    // availability. The old "Change #27" quota check (base 1 slot +
    // Company.purchasedAdditionalBranches, 403 BRANCH_LIMIT_REACHED) is
    // removed deliberately — do not reintroduce it.
    // `purchasedAdditionalBranches` still exists as BILLING data (branch
    // charges / subscription display in Billing + Employee Subscription); it
    // must never block a create.

    const createData = {
      ...data,
      id: await nextEntityId(),
      branchNo: await nextBranchNo(companyId),
    };
    // Prove the type at the Prisma boundary: must print type: 'number'.
    console.log('[branch:create]', {
      selectedCompanyId: rawCompanyId,
      companyId: createData.companyId,
      type: typeof createData.companyId,
      company: company.name,
      payloadKeys: Object.keys(body),
      prismaData: createData,
    });

    const branch = await prisma.branch.create({ data: createData });
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

    // Tenant guard: only a branch inside the caller's company scope may be edited.
    if (!(await authorizeBranchWrite(req, res))) return;

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
      // Reactivating clears the offboard record — the branch is live again, so
      // stale offboard metadata must not linger and misreport in the UI/reports.
      data.offboardReason = null;
      data.offboardEffectiveDate = null;
      data.offboardedAt = null;
      data.offboardedBy = null;
      data.offboardEmployeeAction = null;
      data.offboardTransferBranchId = null;
    } else if (typeof data.status === 'string' &&
      ['Archived', 'Offboarded', 'Suspended', 'Inactive', 'Deactivated', 'Disabled'].includes(data.status)) {
      if (data.isArchived === undefined && ['Archived', 'Offboarded'].includes(data.status)) data.isArchived = true;
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

// ── Branch offboarding (soft) ────────────────────────────────────────────────
// Marks a branch Offboarded and decides what happens to its employees. This
// NEVER deletes anything: attendance, payroll, leave, documents, tasks, reports,
// audit logs and employment history are all retained. Employee rows are only
// ever re-pointed (transfer) or status-flipped (archive/inactive).
//
// Employees are matched by `branchId` ONLY — deliberately.
//
// It is tempting to also match `companyId = <branch id>`, mirroring the OR in
// employeeController.getEmployees. Do NOT. That OR exists because the ACTIVE
// WORKSPACE id may be a company id or a branch id, so it probes both columns to
// find out which; it does not mean employees are double-linked to a branch.
// Company.id and Branch.id are allocated from ONE shared collision-free sequence
// (utils/sequentialNo.nextEntityId = max(max Company.id, max Branch.id) + 1), and
// Employee.companyId is an FK to Company — so an employee's companyId can never
// equal a live branch's id. Verified against real data: 0 id collisions and 0
// such employees.
//
// Matching companyId here would therefore sweep nothing on correct data, and on
// a namespace violation it would archive an UNRELATED company's entire workforce.
const OFFBOARD_EMPLOYEE_ACTIONS = ['transfer', 'archive', 'inactive'];

exports.offboardBranch = async (req, res) => {
  try {
    const branchId = idParam(req.params.id);
    const { employeeAction, destinationBranchId, reason, effectiveDate } = req.body || {};

    if (!OFFBOARD_EMPLOYEE_ACTIONS.includes(employeeAction)) {
      return res.status(400).json({
        success: false,
        code: 'EMPLOYEE_ACTION_REQUIRED',
        message: 'Choose how employees should be handled: transfer, archive, or inactive.',
      });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({
        success: false, code: 'REASON_REQUIRED',
        message: 'Please provide a reason for offboarding this branch.',
      });
    }
    const effective = effectiveDate ? new Date(effectiveDate) : null;
    if (!effective || Number.isNaN(effective.getTime())) {
      return res.status(400).json({
        success: false, code: 'EFFECTIVE_DATE_REQUIRED',
        message: 'Please provide a valid effective date.',
      });
    }

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return res.status(404).json({ success: false, message: 'Branch not found.' });
    // Tenant guard: offboarding mass-archives/transfers this branch's workforce,
    // so a foreign branch must be refused BEFORE any employee is touched.
    if (!isSuperAdmin(req) && !canEnterWorkspace(req, branch.companyId)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this branch.' });
    }
    if (branch.isArchived || String(branch.status).toLowerCase() === 'offboarded') {
      return res.status(409).json({
        success: false, code: 'ALREADY_OFFBOARDED',
        message: 'This branch has already been offboarded.',
      });
    }

    // Transfer target must be a real, live, sibling branch — never itself.
    let destId = null;
    if (employeeAction === 'transfer') {
      destId = idParam(destinationBranchId);
      if (!destId) {
        return res.status(400).json({
          success: false, code: 'DESTINATION_REQUIRED',
          message: 'Select a destination branch to transfer employees to.',
        });
      }
      if (destId === branchId) {
        return res.status(400).json({
          success: false, code: 'DESTINATION_INVALID',
          message: 'Employees cannot be transferred to the branch being offboarded.',
        });
      }
      const dest = await prisma.branch.findUnique({ where: { id: destId } });
      if (!dest || dest.companyId !== branch.companyId) {
        return res.status(400).json({
          success: false, code: 'DESTINATION_INVALID',
          message: 'The destination branch must belong to the same company.',
        });
      }
      if (dest.isArchived || String(dest.status).toLowerCase() !== 'active') {
        return res.status(400).json({
          success: false, code: 'DESTINATION_INACTIVE',
          message: 'The destination branch must be active.',
        });
      }
    }

    // See the note above: branchId only.
    const employeeWhere = { branchId };
    const actor = req.user ? (req.user.name || req.user.email || String(req.user.id)) : null;

    const result = await prisma.$transaction(async (tx) => {
      let affected = 0;

      if (employeeAction === 'transfer') {
        // Re-point to the destination branch. companyId is untouched — the parent
        // company is unchanged, since a destination must be a sibling branch.
        const moved = await tx.employee.updateMany({
          where: employeeWhere,
          data: { branchId: destId },
        });
        affected = moved.count;
      } else {
        // 'archive' removes them from active operational modules (the status is
        // in OFFBOARDED_STATUSES, so they fall into the Previous tab and drop out
        // of payroll/attendance/leave). 'inactive' keeps the record inactive but
        // attached to the branch. Neither deletes.
        const status = employeeAction === 'archive' ? 'Archived' : 'Inactive';
        const data = { status };
        if (employeeAction === 'archive') {
          data.exitDate = effective;
          data.exitReason = `Branch offboarded: ${String(reason).trim()}`;
        }
        const swept = await tx.employee.updateMany({ where: employeeWhere, data });
        affected = swept.count;
      }

      const updated = await tx.branch.update({
        where: { id: branchId },
        data: {
          status: 'Offboarded',
          isArchived: true,
          offboardReason: String(reason).trim(),
          offboardEffectiveDate: effective,
          offboardedAt: new Date(),
          offboardedBy: actor,
          offboardEmployeeAction: employeeAction,
          offboardTransferBranchId: destId,
          headcount: 0,
        },
      });

      const HeadcountSyncService = require('../services/headcountSyncService');
      if (employeeAction === 'transfer' && destId) {
        await HeadcountSyncService.syncBranchHeadcount(destId, tx);
      }

      return { updated, affected };
    });

    console.log('[branch:offboard]', {
      branchId, employeeAction, destinationBranchId: destId,
      employeesAffected: result.affected, by: actor,
    });

    // Write audit log entry
    await AuditService.logAudit(
      req.user.id,
      'Branch Offboarding',
      'Companies',
      String(branchId),
      {
        branchId,
        branchName: branch.branchName,
        offboardedBy: actor,
        offboardedAt: new Date(),
        reason: reason,
        employeeAction: employeeAction,
        destinationBranchId: destId,
        effectiveDate: effective,
      }
    );

    res.json({
      success: true,
      message: 'Branch offboarded successfully.',
      employeesAffected: result.affected,
      branch: {
        ...result.updated,
        name: result.updated.branchName,
        isHeadOffice: false,
        parentCompanyId: result.updated.companyId,
      },
    });
  } catch (error) {
    return respondError(res, error);
  }
};

exports.deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;
    // Tenant guard: only a branch inside the caller's company scope may be deleted.
    if (!(await authorizeBranchWrite(req, res))) return;
    await prisma.branch.delete({
      where: { id: idParam(id) }
    });
    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    return respondError(res, error);
  }
};

exports.reactivateBranch = async (req, res) => {
  try {
    const branchId = idParam(req.params.id);
    const { reason } = req.body || {};

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }
    // Tenant guard: reactivation restores the branch's employees, so a foreign
    // branch must be refused before any employee row is swept.
    if (!isSuperAdmin(req) && !canEnterWorkspace(req, branch.companyId)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this branch.' });
    }

    const previousStatus = branch.status;
    const previousIsArchived = branch.isArchived;
    const actor = req.user ? (req.user.name || req.user.email || String(req.user.id)) : 'System';

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.branch.update({
        where: { id: branchId },
        data: {
          status: 'Active',
          isArchived: false,
          offboardReason: null,
          offboardEffectiveDate: null,
          offboardedAt: null,
          offboardedBy: null,
          offboardEmployeeAction: null,
          offboardTransferBranchId: null,
        },
      });

      let affected = 0;
      if (branch.offboardEmployeeAction === 'archive' || branch.offboardEmployeeAction === 'inactive') {
        const targetStatus = branch.offboardEmployeeAction === 'archive' ? 'Archived' : 'Inactive';
        const swept = await tx.employee.updateMany({
          where: {
            branchId: branchId,
            status: targetStatus,
          },
          data: {
            status: 'Active',
            exitDate: null,
            exitReason: null,
          },
        });
        affected = swept.count;
      }

      const HeadcountSyncService = require('../services/headcountSyncService');
      await HeadcountSyncService.syncBranchHeadcount(branchId, tx);

      return { updated, affected };
    });

    console.log('[branch:reactivate]', {
      branchId,
      employeesAffected: result.affected,
      by: actor,
    });

    // Write audit log entry
    await AuditService.logAudit(
      req.user.id,
      'Branch Reactivation',
      'Companies',
      String(branchId),
      {
        branchId,
        branchName: branch.branchName,
        reactivatedBy: actor,
        reactivatedAt: new Date(),
        reason: reason || null,
        previousStatus,
        previousIsArchived,
        previouslyOffboardedBy: branch.offboardedBy,
        previouslyOffboardedAt: branch.offboardedAt,
        previousOffboardReason: branch.offboardReason,
        employeesAffected: result.affected,
      }
    );

    res.json({
      success: true,
      message: 'Branch reactivated successfully.',
      employeesAffected: result.affected,
      branch: {
        ...result.updated,
        name: result.updated.branchName,
        isHeadOffice: false,
        parentCompanyId: result.updated.companyId,
      },
    });
  } catch (error) {
    return respondError(res, error);
  }
};

exports.archiveBranch = async (req, res) => {
  try {
    const branchId = idParam(req.params.id);
    const { reason } = req.body || {};

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }
    // Tenant guard: only a branch inside the caller's company scope may be archived.
    if (!isSuperAdmin(req) && !canEnterWorkspace(req, branch.companyId)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this branch.' });
    }

    const previousStatus = branch.status;
    const actor = req.user ? (req.user.name || req.user.email || String(req.user.id)) : 'System';

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.branch.update({
        where: { id: branchId },
        data: {
          status: 'Archived',
          isArchived: true,
        },
      });
      return updated;
    });

    console.log('[branch:archive]', {
      branchId,
      by: actor,
    });

    // Write audit log entry
    await AuditService.logAudit(
      req.user.id,
      'Branch Archival',
      'Companies',
      String(branchId),
      {
        branchId,
        branchName: branch.branchName,
        archivedBy: actor,
        archivedAt: new Date(),
        reason: reason || null,
        previousStatus,
      }
    );

    res.json({
      success: true,
      message: 'Branch archived successfully.',
      branch: {
        ...result,
        name: result.branchName,
        isHeadOffice: false,
        parentCompanyId: result.companyId,
      },
    });
  } catch (error) {
    return respondError(res, error);
  }
};

