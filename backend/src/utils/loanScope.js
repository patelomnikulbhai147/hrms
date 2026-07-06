// Shared company-scope + role helpers for the Employee Loan module.
// RBAC (mapped onto the app's real roles):
//   view    — Super Admin, Company Head, HR, Finance, Manager (Employee: OWN only)
//   create  — Company Head, HR, Finance
//   edit    — Company Head, HR, Finance   (drafts only, enforced in controller)
//   approve — Company Head, Finance       (independent Approve permission)
//   manage  — Company Head, Finance       (delete / force-close)
const idParam = require('./idParam');

const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const isEmployee = (req) => ['Employee', 'Staff'].includes(req.user?.role);
const canView = (req) => ['Super Admin', 'Company Head', 'HR', 'Finance', 'Manager'].includes(req.user?.role);
const canEdit = (req) => ['Company Head', 'HR', 'Finance'].includes(req.user?.role);
const canApprove = (req) => ['Company Head', 'Finance'].includes(req.user?.role);
const canManage = (req) => ['Company Head', 'Finance'].includes(req.user?.role);
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

module.exports = {
  isSuperAdmin, isEmployee, canView, canEdit, canApprove, canManage,
  actorOf, targetCompanyId, scopedWhere,
};
