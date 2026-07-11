// Shared company-scope + role helpers for the Invoice Management module.
// RBAC: Company Head & Finance (Accountant) = full; HR = view/create/edit (no
// delete/cancel); Super Admin = view within a named workspace; Employee = none.
const idParam = require('./idParam');

const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const canView = (req) => ['Super Admin', 'Company Head', 'Finance', 'HR'].includes(req.user?.role);
const canEdit = (req) => ['Company Head', 'Finance', 'HR'].includes(req.user?.role); // create + edit
const canManage = (req) => ['Super Admin', 'Company Head', 'Finance'].includes(req.user?.role); // delete/cancel/settings
const actorOf = (req) => req.user?.name || req.user?.email || 'System';

// Map a workspace id (which may be a COMPANY id or a BRANCH id — they share one
// id space) to its owning company. Invoice masters (customers/products/settings)
// and invoices have no branch column, so a branch workspace transparently
// operates on its parent company's data. Non-branch / unknown ids pass through.
const toCompany = (req, id) => {
  if (id == null) return id;
  const map = req.user?.branchCompanyMap || {};
  return map[id] != null ? map[id] : id;
};

// Every COMPANY id a non–Super-Admin user may reach in this module: their
// company-wide grants plus the parent company of any branch they can enter.
const companyScopeFor = (req) => {
  const branchParents = (req.user?.accessibleBranchIds || []).map((b) => toCompany(req, b));
  return [...new Set([req.user?.companyId, ...(req.user?.accessibleCompanyIds || []), ...branchParents].filter(Boolean))];
};

// Resolve the requested workspace (write body → query → x-workspace-id header) to
// the COMPANY a read/write should target, honouring branch→parent resolution and
// the caller's scope. Returns:
//   undefined → no workspace named
//   null      → a workspace was named but it is outside the user's scope
//   <number>  → the company id to use
function resolveWorkspaceCompany(req, requested) {
  const raw = idParam(requested || req.query.companyId || req.headers['x-workspace-id']);
  if (raw == null) return undefined;
  const company = toCompany(req, raw);
  if (isSuperAdmin(req)) return company; // Super Admin may target any named company
  return companyScopeFor(req).includes(company) ? company : null;
}

// Which company a WRITE targets. Super Admin must name one; a non–Super-Admin who
// named a valid workspace uses it (branch→parent), else falls back to their
// primary company. `null` = cannot resolve (Super Admin with none, or a named
// workspace outside scope).
function targetCompanyId(req, requested) {
  const resolved = resolveWorkspaceCompany(req, requested);
  if (resolved === null) return null;
  if (resolved !== undefined) return resolved;
  return isSuperAdmin(req) ? null : (req.user?.companyId || null);
}

// The single company a WRITE should land in so it matches what `scopedWhere`/list
// READS. Kept as a named export for callers that create by workspace; identical
// to `targetCompanyId`. Before this was branch-aware, a saved record landed in
// one company while the list read another (invisible saves, "not found" on
// update, unreliable duplicate checks) — most visibly for a Company Head working
// inside a branch workspace.
const writeCompanyId = targetCompanyId;

// Company-scoped WHERE for reads (null → unauthorised workspace).
function scopedWhere(req) {
  const resolved = resolveWorkspaceCompany(req, undefined); // reads: query/header only
  if (resolved === null) return null;
  if (resolved !== undefined) return { companyId: resolved };
  if (isSuperAdmin(req)) return {}; // Super Admin, no workspace → all companies
  const scope = companyScopeFor(req);
  return { companyId: { in: scope.length ? scope : [-1] } };
}

module.exports = { isSuperAdmin, canView, canEdit, canManage, actorOf, targetCompanyId, writeCompanyId, scopedWhere, companyScopeFor, resolveWorkspaceCompany };
