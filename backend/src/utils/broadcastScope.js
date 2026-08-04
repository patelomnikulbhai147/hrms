/**
 * WHO MAY A BROADCAST REACH — resolved from the database, never from the payload.
 *
 * This is the single security boundary for notification broadcasting. Both the
 * options endpoint (which audiences to OFFER) and the send endpoint (which
 * audience to ACCEPT) call this, so the menu the user sees and the rule the
 * server enforces can never drift apart. A UI that hides "Specific Branch" is a
 * courtesy; this file is what actually stops a branch user reaching Rajkot.
 *
 * THE CONFINEMENT RULE
 *   A user whose own workspace IS a branch is locked to that branch — for every
 *   audience, always. It does not matter what companyId the request carries.
 *   That last part is the whole point: `req.user.companyId` for a branch user is
 *   the BRANCH id, but such users routinely also hold a grant on the parent
 *   company (that is how they read shared company data). Trusting the posted
 *   companyId therefore let a branch user name the parent, whose scope fans out
 *   to every sibling branch — the exact cross-branch leak this must prevent.
 *   So the sender's confinement is derived from WHO THEY ARE, and the payload
 *   can only ever narrow it further, never widen it.
 *
 * WHY A LOOKUP AND NOT A COMPARISON
 *   Company.id and Branch.id share ONE id sequence, so an id alone cannot tell
 *   you which table it belongs to — the only reliable test is to look it up in
 *   `Branch`. See the company/branch id-namespace note; this is the same rule the
 *   rest of the codebase follows.
 */
const prisma = require('../config/prisma');
const { canReachCompany, grantedBranchIds } = require('./companyScope');

/** Roles that may send a broadcast at all. */
const BROADCASTERS = ['Super Admin', 'Company Head', 'HR', 'Admin'];

/**
 * The audiences each kind of sender may use. Values are the wire contract shared
 * by the options endpoint, the send endpoint and the UI.
 *
 * A branch sender has no branch selector at all: there is exactly one branch they
 * can reach, and it is already implied. "all" means "everyone in MY branch" for
 * them, and "everyone in the company, all branches" for a parent-company sender —
 * which is why the label differs while the value does not.
 */
const BRANCH_AUDIENCES = ['all', 'role', 'department', 'employee'];
const COMPANY_AUDIENCES = ['all', 'branch', 'role', 'department', 'employee'];

/**
 * Resolve the sending scope for this request.
 *
 * @param {object} req             the authenticated request
 * @param {*}      requestedCompany optional workspace the caller asked to act in
 *                                  (honoured ONLY for non-branch senders, and
 *                                  only when they can reach it)
 * @returns {Promise<object>} either
 *   { ok: false, status, body }  — refuse, with the response already shaped, or
 *   { ok: true, isBranchUser, companyId, branchId, branchName,
 *     scopeIds, branches, audiences }
 *
 * `scopeIds` is the set of workspace ids employees/users may be drawn from. For
 * a branch sender it is exactly [branchId]; for a company sender it is the
 * company plus its own branches — NOT everything the sender has a grant on, so a
 * Company Head with several companies cannot spray one company's staff from
 * another company's workspace.
 */
async function resolveBroadcastScope(req, requestedCompany) {
  const role = req.user?.role;
  if (!BROADCASTERS.includes(role)) {
    return { ok: false, status: 403, body: { error: 'You are not allowed to send broadcasts.' } };
  }

  const homeId = Number(req.user?.companyId);

  // Super Admin is never a branch user: they act on whichever workspace they
  // name. Everyone else is classified by looking their own workspace up.
  const homeBranch = role !== 'Super Admin' && Number.isFinite(homeId)
    ? await prisma.branch.findUnique({
        where: { id: homeId },
        select: { id: true, companyId: true, branchName: true },
      }).catch(() => null)
    : null;

  if (homeBranch) {
    return {
      ok: true,
      isBranchUser: true,
      // The parent is recorded for provenance/labelling only — it is deliberately
      // NOT added to scopeIds, or the branch user would reach their siblings.
      companyId: homeBranch.companyId,
      branchId: homeBranch.id,
      branchName: homeBranch.branchName || `Branch ${homeBranch.id}`,
      scopeIds: [homeBranch.id],
      branchIds: [homeBranch.id],
      branches: [],
      audiences: BRANCH_AUDIENCES,
    };
  }

  // ── Parent company (or Super Admin) ────────────────────────────────────────
  const asked = requestedCompany === undefined || requestedCompany === null || requestedCompany === ''
    ? null
    : Number(requestedCompany);
  const companyId = Number.isFinite(asked) && asked ? asked : homeId;
  if (!Number.isFinite(companyId) || !companyId) {
    return { ok: false, status: 400, body: { error: 'Company context required.' } };
  }

  // A user assigned SPECIFIC branches of a company does not hold the company id
  // itself: authMiddleware drops the parent from accessibleCompanyIds and lists
  // the branches in accessibleBranchIds instead ("the parent company is only kept
  // when the user has NO specific branch of it"). Such a user is legitimately
  // multi-branch but not company-wide, so a plain canReachCompany test would
  // refuse them outright. They are admitted here and then confined below to the
  // branches they actually hold.
  const heldBranches = grantedBranchIds(req);
  if (!canReachCompany(req, companyId) && !heldBranches.length) {
    return { ok: false, status: 403, body: { error: 'Not your workspace.' } };
  }

  // A caller could name a BRANCH id here (the workspace switcher can be sitting
  // on one). Treat that as "act as that branch" rather than silently widening to
  // the parent — narrowing on request is always safe.
  const askedBranch = await prisma.branch.findUnique({
    where: { id: companyId },
    select: { id: true, companyId: true, branchName: true },
  }).catch(() => null);

  if (askedBranch) {
    return {
      ok: true,
      isBranchUser: false,          // they MAY switch workspaces; they are just in one
      companyId: askedBranch.companyId,
      branchId: askedBranch.id,
      branchName: askedBranch.branchName || `Branch ${askedBranch.id}`,
      scopeIds: [askedBranch.id],
      branchIds: [askedBranch.id],
      branches: [],
      audiences: BRANCH_AUDIENCES,
    };
  }

  const allBranches = await prisma.branch.findMany({
    where: { companyId },
    select: { id: true, branchName: true },
    orderBy: { branchName: 'asc' },
  });

  // Company-wide access means every branch. Branch-assigned access means only the
  // branches actually granted — and NOT the company row itself, whose employees
  // sit outside any branch the user was given.
  const companyWide = canReachCompany(req, companyId);
  const branches = companyWide ? allBranches : allBranches.filter((b) => heldBranches.includes(b.id));

  if (!branches.length && !companyWide) {
    return { ok: false, status: 403, body: { error: 'Not your workspace.' } };
  }

  // A user with exactly ONE branch is, for broadcasting purposes, a branch user:
  // there is nothing to choose between, so offering a branch selector would be
  // noise and offering "All Branches" would be a lie.
  if (!companyWide && branches.length === 1) {
    const only = branches[0];
    return {
      ok: true,
      isBranchUser: true,
      companyId,
      branchId: only.id,
      branchName: only.branchName || `Branch ${only.id}`,
      scopeIds: [only.id],
      branchIds: [only.id],
      branches: [],
      audiences: BRANCH_AUDIENCES,
    };
  }

  return {
    ok: true,
    isBranchUser: false,
    companyId,
    branchId: null,
    branchName: null,
    scopeIds: companyWide ? [companyId, ...allBranches.map((b) => b.id)] : branches.map((b) => b.id),
    // null = company-wide (every branch AND head-office staff who belong to no
    // branch). A list = only these branches, and nobody outside them.
    branchIds: companyWide ? null : branches.map((b) => b.id),
    branches: branches.map((b) => ({ id: b.id, name: b.branchName || `Branch ${b.id}` })),
    audiences: COMPANY_AUDIENCES,
  };
}

/**
 * Narrow a resolved scope to ONE branch — used when a company sender picks
 * "Specific Branch", or cascades Branch → Department → Employee.
 *
 * Returns { ok: false, ... } when the branch is not part of this scope, which is
 * what stops a hand-crafted request naming another company's branch.
 */
function narrowToBranch(scope, branchIdRaw) {
  const branchId = Number(branchIdRaw);
  if (!Number.isFinite(branchId) || !branchId) {
    return { ok: false, status: 400, body: { error: 'Select a branch.' } };
  }
  if (!scope.scopeIds.includes(branchId)) {
    return { ok: false, status: 403, body: { error: 'That branch is outside your workspace.' } };
  }
  return { ok: true, branchId, scopeIds: [branchId] };
}

// ─────────────────────────────────────────────────────────────────────────────
// BRANCH MEMBERSHIP IS RECORDED DIFFERENTLY FOR EMPLOYEES AND USERS.
// Verified against live data:
//
//   Employee → companyId = the PARENT company, branchId = the branch
//              (companyId=1 branchId=3 → 788 rows; NO employee row carries a
//              branch id in companyId)
//   User     → companyId = the BRANCH id, branchId = the branch
//              (companyId=5 branchId=5), or companyId = parent with branchId
//              null for company-wide staff
//
// So "everyone in branch 5" is two different queries, and the obvious shared
// `companyId IN [5]` filter silently matches ZERO employees — a department
// broadcast that reaches nobody while reporting success. These two builders are
// the only place that asymmetry is expressed; both audiences go through them.
//
// Both are written to match EITHER storage shape, so a row that does carry a
// branch id in companyId is still found.
// ─────────────────────────────────────────────────────────────────────────────

/** Prisma `where` selecting the employees this scope may target. */
function employeeWhere(scope, narrowBranchId) {
  const ids = narrowBranchId ? [Number(narrowBranchId)] : scope.branchIds;
  if (!ids) return { companyId: { in: scope.scopeIds } };   // company-wide
  return { OR: [{ companyId: scope.companyId, branchId: { in: ids } }, { companyId: { in: ids } }] };
}

/** Prisma `where` selecting the ACTIVE user logins this scope may target. */
function userWhere(scope, narrowBranchId) {
  const ids = narrowBranchId ? [Number(narrowBranchId)] : scope.branchIds;
  if (!ids) return { status: 'Active', companyId: { in: scope.scopeIds } };  // company-wide
  // A company-level user (companyId = parent, branchId null) is deliberately NOT
  // matched here: they are not a member of any one branch.
  return { status: 'Active', OR: [{ companyId: { in: ids } }, { branchId: { in: ids } }] };
}

module.exports = {
  BROADCASTERS,
  BRANCH_AUDIENCES,
  COMPANY_AUDIENCES,
  resolveBroadcastScope,
  narrowToBranch,
  employeeWhere,
  userWhere,
};
