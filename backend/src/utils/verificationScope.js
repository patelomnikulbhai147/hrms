// Shared tenant resolver for the Bank Verification module (credit wallet,
// settings, provider calls).
//
// The wallet is COMPANY-level (verification_credit_wallet.companyId, unique per
// company+serviceType). Workspace ids reaching the API may be COMPANY ids or
// BRANCH ids — they share one id space — so a branch workspace must resolve to
// its parent company before it touches a wallet. Without this, the balance the
// employee form READS (x-workspace-id → branch id) and the balance the
// verification WRITES (token companyId) are two different rows: the UI shows one
// wallet while a second, phantom wallet is auto-created and debited.
//
// Mirrors utils/invoiceScope.js, which solves the same read/write split.
const idParam = require('./idParam');

const isSuperAdmin = (req) => req.user?.role === 'Super Admin';

// Workspace id → owning company id. Non-branch / unknown ids pass through.
const toCompany = (req, id) => {
  if (id == null) return id;
  const map = req.user?.branchCompanyMap || {};
  return map[id] != null ? map[id] : id;
};

// Every COMPANY id a non–Super-Admin user may reach: company-wide grants plus
// the parent company of any branch they can enter.
const companyScopeFor = (req) => {
  const branchParents = (req.user?.accessibleBranchIds || []).map((b) => toCompany(req, b));
  return [
    ...new Set(
      [toCompany(req, req.user?.companyId), ...(req.user?.accessibleCompanyIds || []).map((c) => toCompany(req, idParam(c))), ...branchParents]
        .map((c) => (c == null ? c : Number(c)))
        .filter((c) => Number.isFinite(c))
    )
  ];
};

/**
 * The COMPANY whose wallet this request must read AND write.
 *
 * Resolution order: explicitly named workspace (body → query → params →
 * x-workspace-id header) resolved to its parent company, else the caller's own
 * company. A named workspace outside the caller's scope is rejected.
 *
 * Returns { companyId } on success or { error, status } on failure. There is
 * deliberately NO numeric fallback: defaulting to company 1 would show one
 * tenant another tenant's balance.
 */
function resolveWalletCompany(req, requested) {
  const named = idParam(requested ?? req.body?.companyId ?? req.query?.companyId ?? req.params?.companyId ?? req.headers['x-workspace-id']);

  if (named != null) {
    const company = toCompany(req, named);
    if (isSuperAdmin(req)) return { companyId: Number(company) };
    if (!companyScopeFor(req).includes(Number(company))) {
      return { error: 'This workspace is outside your access scope.', status: 403 };
    }
    return { companyId: Number(company) };
  }

  if (isSuperAdmin(req)) {
    return { error: 'Select a company workspace to view its verification credit wallet.', status: 400 };
  }

  const own = toCompany(req, req.user?.companyId);
  if (own == null || !Number.isFinite(Number(own))) {
    return { error: 'No company is associated with your account.', status: 400 };
  }
  return { companyId: Number(own) };
}

module.exports = { isSuperAdmin, toCompany, companyScopeFor, resolveWalletCompany };
