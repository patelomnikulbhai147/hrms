// ── Workspace authorisation & scope (single source of truth) ─────────────────
//
// A workspace id arriving from the client (`x-workspace-id`, `?companyId=`) may
// be a COMPANY id or a BRANCH id — the two share one id space.
//
// `protect` (authMiddleware) deliberately splits a user's grants in two:
//     accessibleCompanyIds → companies owned in FULL
//     accessibleBranchIds  → the individual branches they may enter
// A branch id is therefore NEVER present in accessibleCompanyIds. Any check of
// the form `accessibleCompanyIds.includes(workspaceId)` consequently rejects
// every branch workspace — a valid user, correctly signed in, refused with
// "Unauthorized to view this workspace." That is the bug this module exists to
// prevent recurring: authorise through here, not through a private helper.
//
// For modules whose tables carry only a `companyId` (no branch column), a branch
// workspace resolves to its PARENT COMPANY, so reads and writes land on the same
// row. Mirrors utils/verificationScope.js and utils/invoiceScope.js.
const idParam = require('./idParam');
// Reachability ("may this request touch this id?") already has a single, correct,
// branch-aware implementation. This module does NOT re-implement it — it adds the
// second half: resolving a branch workspace to the company its data is stored
// under, and building the Prisma filter from that.
const { grantedCompanyIds, grantedBranchIds, canReachCompany } = require('./companyScope');

const isSuperAdmin = (req) => req.user?.role === 'Super Admin';

/** Workspace id → owning company id. Company ids and unknown ids pass through. */
const toCompany = (req, id) => {
  if (id == null) return id;
  const map = req.user?.branchCompanyMap || {};
  const key = Number(id);
  return map[key] != null ? map[key] : id;
};

/**
 * Every COMPANY id a non–Super-Admin may reach: company-wide grants, their own
 * company, and the parent company of every branch they can enter. Numeric
 * throughout, so a string id from a token or header can never miss a match.
 */
const companyScopeFor = (req) => {
  const granted = [...grantedCompanyIds(req), ...grantedBranchIds(req)];
  return [
    ...new Set(
      granted
        .map((id) => Number(toCompany(req, id)))
        .filter((c) => Number.isFinite(c))
    ),
  ];
};

/** The workspace the request names, from any of the places clients send it. */
const requestedWorkspaceId = (req, requested) =>
  idParam(
    requested ?? req.query?.companyId ?? req.body?.companyId ?? req.params?.companyId ?? req.headers['x-workspace-id']
  );

/**
 * Is this user allowed into this workspace? Accepts a company OR branch id.
 * Super Admin is unrestricted.
 */
function canEnterWorkspace(req, workspaceId) {
  if (workspaceId == null) return true;
  // Direct grant (company OR branch) — the canonical check.
  if (canReachCompany(req, workspaceId)) return true;
  // Or the workspace's parent company is granted company-wide, which implies
  // every branch beneath it.
  const company = Number(toCompany(req, workspaceId));
  return Number.isFinite(company) && companyScopeFor(req).includes(company);
}

/**
 * Prisma `where` for a company-scoped READ.
 *
 * @returns an object to spread into the query, or `null` when the caller
 *          genuinely may not enter the named workspace (→ 403). `null` means
 *          "denied"; `{}` means "unrestricted" (Super Admin, no workspace named).
 */
function scopedCompanyWhere(req, requested) {
  const workspaceId = requestedWorkspaceId(req, requested);
  const companyId = workspaceId == null ? null : Number(toCompany(req, workspaceId));

  if (isSuperAdmin(req)) return companyId != null && Number.isFinite(companyId) ? { companyId } : {};

  if (workspaceId != null) {
    if (!canEnterWorkspace(req, workspaceId)) return null;
    return { companyId };
  }

  const scope = companyScopeFor(req);
  return { companyId: { in: scope.length ? scope : [-1] } };
}

/**
 * Which company a WRITE targets. A branch workspace resolves to its parent
 * company so the row is written where the same user will read it back.
 * Returns null when no company can be determined (caller decides the message).
 */
function targetCompanyId(req, requested) {
  const workspaceId = requestedWorkspaceId(req, requested);
  if (isSuperAdmin(req)) {
    const c = workspaceId == null ? null : Number(toCompany(req, workspaceId));
    return Number.isFinite(c) ? c : null;
  }
  // A named workspace outside the caller's scope is refused rather than
  // silently redirected to their own company.
  if (workspaceId != null) {
    if (!canEnterWorkspace(req, workspaceId)) return null;
    const c = Number(toCompany(req, workspaceId));
    return Number.isFinite(c) ? c : null;
  }
  const own = Number(toCompany(req, req.user?.companyId));
  return Number.isFinite(own) ? own : null;
}

module.exports = {
  isSuperAdmin,
  toCompany,
  companyScopeFor,
  requestedWorkspaceId,
  canEnterWorkspace,
  scopedCompanyWhere,
  targetCompanyId,
};
