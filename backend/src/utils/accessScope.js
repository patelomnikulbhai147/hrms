// ===========================================================================
//  Branch-aware RBAC access resolution.
//
//  The single rule every list endpoint (and the auth middleware) uses to decide
//  exactly which workspaces a non-Super-Admin user may reach, so the frontend
//  and backend agree. Company ids and branch ids share one id space, and a
//  user's grant set ([companyId, ...accessibleCompanyIds]) may contain either.
//
//  Rule:
//    • An explicitly granted BRANCH id is always accessible.
//    • A granted COMPANY id expands to ALL its branches ONLY when the user has
//      no specific branch of that company granted. If they DO have specific
//      branches, access is branch-level: just those branches — the company and
//      its sibling branches stay hidden. (Assigning Rajkot must never reveal
//      Ahmedabad/Bhavnagar/Siddhpur.)
// ===========================================================================

const S = (v) => String(v);

/**
 * @param {Array} rawIds    grant set: [companyId, ...accessibleCompanyIds]
 * @param {Array} companies top-level companies: [{ id }]
 * @param {Array} branches  branches: [{ id, companyId }]
 * @returns {{ branchIds: string[], companyWideIds: string[] }}
 *   branchIds      – every branch id the user may enter
 *   companyWideIds – companies the user owns in full (company-level access)
 */
function resolveAccess(rawIds, companies, branches) {
  const companyIdSet = new Set((companies || []).map((c) => S(c.id)));
  const branchIdSet = new Set((branches || []).map((b) => S(b.id)));

  const grants = [
    ...new Set(
      (rawIds || [])
        .filter((v) => v !== null && v !== undefined && v !== '')
        .map(S)
    ),
  ];

  const grantedBranchIds = new Set();
  const grantedCompanyIds = new Set();
  for (const id of grants) {
    if (branchIdSet.has(id)) grantedBranchIds.add(id);
    else if (companyIdSet.has(id)) grantedCompanyIds.add(id);
  }

  const branchIds = new Set(grantedBranchIds);
  const companyWideIds = new Set();

  for (const cid of grantedCompanyIds) {
    const children = (branches || []).filter((b) => S(b.companyId) === cid);
    const hasSpecificBranch = children.some((b) => grantedBranchIds.has(S(b.id)));
    if (hasSpecificBranch) continue; // branch-level — do NOT widen to the company
    companyWideIds.add(cid);
    for (const b of children) branchIds.add(S(b.id));
  }

  return { branchIds: [...branchIds], companyWideIds: [...companyWideIds] };
}

module.exports = { resolveAccess };
