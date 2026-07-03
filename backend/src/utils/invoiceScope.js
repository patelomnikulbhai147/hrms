// Shared company-scope + role helpers for the Invoice Management module.
// RBAC: Company Head & Finance (Accountant) = full; HR = view/create/edit (no
// delete/cancel); Super Admin = view within a named workspace; Employee = none.
const idParam = require('./idParam');

const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const canView = (req) => ['Super Admin', 'Company Head', 'Finance', 'HR'].includes(req.user?.role);
const canEdit = (req) => ['Company Head', 'Finance', 'HR'].includes(req.user?.role); // create + edit
const canManage = (req) => ['Super Admin', 'Company Head', 'Finance'].includes(req.user?.role); // delete/cancel/settings
const actorOf = (req) => req.user?.name || req.user?.email || 'System';

const companyScopeFor = (req) => [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);

// Which company a WRITE targets — Super Admin must name one; others are pinned.
function targetCompanyId(req, requested) {
  if (isSuperAdmin(req)) return idParam(requested || req.query.companyId || req.headers['x-workspace-id']) || null;
  return req.user?.companyId || null;
}

// Company-scoped WHERE for reads (null → unauthorised workspace).
function scopedWhere(req) {
  const workspaceId = idParam(req.query.companyId || req.headers['x-workspace-id']);
  if (isSuperAdmin(req)) return workspaceId ? { companyId: workspaceId } : {};
  const scope = companyScopeFor(req);
  if (workspaceId && !scope.includes(workspaceId)) return null;
  return { companyId: workspaceId || { in: scope.length ? scope : [-1] } };
}

module.exports = { isSuperAdmin, canView, canEdit, canManage, actorOf, targetCompanyId, scopedWhere };
