// Company-scope + role helpers for the Compliance Management module.
// view    — Super Admin, Company Head, HR, Finance, Manager, Auditor (read-only)
// create  — Company Head, HR, Finance
// edit    — Company Head, HR, Finance   (mark filed, upload challan, edit)
// manage  — Company Head, Finance        (delete / waive)
const idParam = require('./idParam');

const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const canView = (req) => ['Super Admin', 'Company Head', 'HR', 'Finance', 'Manager', 'Auditor'].includes(req.user?.role);
const canEdit = (req) => ['Company Head', 'HR', 'Finance'].includes(req.user?.role);
const canManage = (req) => ['Company Head', 'Finance'].includes(req.user?.role);
const actorOf = (req) => req.user?.name || req.user?.email || 'System';

const companyScopeFor = (req) => [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);

function targetCompanyId(req, requested) {
  if (isSuperAdmin(req)) return idParam(requested || req.query.companyId || req.headers['x-workspace-id']) || null;
  return req.user?.companyId || null;
}

function scopedWhere(req) {
  const workspaceId = idParam(req.query.companyId || req.headers['x-workspace-id']);
  if (isSuperAdmin(req)) return workspaceId ? { companyId: workspaceId } : {};
  const scope = companyScopeFor(req);
  if (workspaceId && !scope.includes(workspaceId)) return null;
  return { companyId: workspaceId || { in: scope.length ? scope : [-1] } };
}

module.exports = { isSuperAdmin, canView, canEdit, canManage, actorOf, targetCompanyId, scopedWhere };
