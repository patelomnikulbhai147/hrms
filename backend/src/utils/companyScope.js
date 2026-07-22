/**
 * The set of workspace ids a request is allowed to touch — as NUMBERS.
 *
 * `User.companyId` is an Int, but `User.accessibleCompanyIds` is a JSON column
 * holding STRINGS: a real row reads { companyId: 1, accessibleCompanyIds:
 * ["1","2","11"] }. Every scope helper in this codebase built its grant list as
 *
 *     [req.user.companyId, ...(req.user.accessibleCompanyIds || [])]
 *
 * which produces the mixed array [1, "1", "2", "11"]. Two things then go wrong:
 *
 *   • `grants.includes(2)` is FALSE — the array holds the string "2" — so a user
 *     acting on a company they can access, but which is not their own home
 *     company, is refused with a 403. Verified in production: raising overtime
 *     for a company-2 employee as a company-1 Company Head.
 *
 *   • passing the mixed array to Prisma as `{ companyId: { in: grants } }` puts
 *     strings against an Int column, which does not match the rows it should.
 *
 * Both failures are invisible whenever a test or a user happens to act on their
 * OWN company, because that id is already a number — which is exactly why this
 * survived so long.
 *
 * Use `grantedCompanyIds(req)` for the id list and `canReachCompany(req, id)` for
 * a single check. Both coerce, drop anything non-numeric, and de-duplicate.
 */

/** Every company/branch id this request may act on, as unique Numbers. */
function grantedCompanyIds(req) {
  const raw = [req?.user?.companyId, ...(Array.isArray(req?.user?.accessibleCompanyIds) ? req.user.accessibleCompanyIds : [])];
  const out = [];
  for (const v of raw) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Branch ids the request is scoped to, as unique Numbers. */
function grantedBranchIds(req) {
  const raw = Array.isArray(req?.user?.accessibleBranchIds) ? req.user.accessibleBranchIds : [];
  const out = [];
  for (const v of raw) {
    const n = Number(v);
    if (Number.isFinite(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

/** True when this request may act on `id` (Super Admin always may). */
function canReachCompany(req, id) {
  if (req?.user?.role === 'Super Admin') return true;
  const n = Number(id);
  if (!Number.isFinite(n)) return false;
  return grantedCompanyIds(req).includes(n) || grantedBranchIds(req).includes(n);
}

module.exports = { grantedCompanyIds, grantedBranchIds, canReachCompany };
