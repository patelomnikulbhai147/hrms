// ── Employee list scope + filters (single source of truth) ───────────────────
// Extracted from getEmployees so the roster table, its reconciled counts, and
// the Employee Cards grid all resolve "which employees may this user see, under
// these filters" through exactly ONE implementation. Two copies of this logic
// would eventually disagree, and the symptom is the worst kind: a page quietly
// showing a different set of people than the count above it.
const idParam = require('./idParam');
const { OFFBOARDED_STATUSES } = require('./employeeStatus');

const NOT_OFFBOARDED = { status: { notIn: OFFBOARDED_STATUSES } };
const IS_OFFBOARDED = { status: { in: OFFBOARDED_STATUSES } };

/**
 * Build the Prisma `where` for an employee query from the request.
 *
 * @returns { ok: true, baseWhere, withStatus } on success, or
 *          { ok: false, status, body } when the workspace is not authorised.
 *
 * `withStatus(extra)` clones baseWhere and ANDs one more condition, so every
 * count bucket is derived from the same scope + filters without ever mutating
 * the base object.
 */
function buildEmployeeScope(req) {
  const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
  const { search, department, status, branch } = req.query;

  const baseWhere = {};
  if (req.user && req.user.role !== 'Super Admin') {
    // Scoped to the user's companies AND the branches under them. Branch ids are
    // included so a Company Head / HR can open a BRANCH sub-workspace.
    const companyScope = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
    const branchScope = (req.user.accessibleBranchIds || []).filter(Boolean);
    const allowedIds = [...companyScope, ...branchScope];
    baseWhere.OR = [
      { companyId: { in: companyScope } },
      { branchId: { in: branchScope.length ? branchScope : companyScope } },
    ];
    if (companyId) {
      if (!allowedIds.includes(companyId)) {
        return { ok: false, status: 403, body: { error: 'Unauthorized to view this workspace\'s employees' } };
      }
      // The selected workspace id may be a company OR a branch — match either.
      baseWhere.OR = [{ companyId }, { branchId: companyId }];
    }
  } else if (companyId) {
    baseWhere.OR = [{ companyId }, { branchId: companyId }];
  }

  const AND = [];
  if (search) {
    AND.push({ OR: [{ name: { contains: search } }, { employeeId: { contains: search } }, { designation: { contains: search } }] });
  }
  if (department) {
    AND.push({ OR: [{ department }, { designation: department }] });
  }
  if (status) AND.push({ status });
  if (branch) baseWhere.branchLocation = branch;
  if (AND.length) baseWhere.AND = AND;

  const withStatus = (extra) => (extra ? { ...baseWhere, AND: [...(baseWhere.AND || []), extra] } : { ...baseWhere });

  return { ok: true, baseWhere, withStatus };
}

module.exports = { buildEmployeeScope, NOT_OFFBOARDED, IS_OFFBOARDED };
