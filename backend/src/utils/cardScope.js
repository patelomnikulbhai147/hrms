// Company-scope + role helpers for the Employee Card Designer.
// Cards are an HR function; RBAC:
//   view   — Super Admin, Company Head, HR, Manager, Finance
//   edit   — Company Head, HR            (create / edit / duplicate / set-default templates)
//   manage — Company Head, HR            (delete templates)
//   share  — Super Admin only            (make a template available to all companies)
const idParam = require('./idParam');

const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const canView = (req) => ['Super Admin', 'Company Head', 'HR', 'Manager', 'Finance'].includes(req.user?.role);
// Template authoring (create / edit / duplicate / set-default / set-active). Super
// Admin is included so platform admins can build templates inside any workspace.
const canEdit = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);
const canManage = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);
const actorOf = (req) => req.user?.name || req.user?.email || 'System';

// Numbers, not the raw mix of Int companyId + string accessibleCompanyIds — the
// latter made `scope.includes(workspaceId)` false for every company a user can
// access but does not call home, and put strings into Prisma `in` filters against
// an Int column. See utils/companyScope.js.
const { grantedCompanyIds } = require('./companyScope');
const companyScopeFor = (req) => grantedCompanyIds(req);

function readCompanyId(req, requested) {
  const workspaceId = idParam(requested || req.query.companyId || req.headers['x-workspace-id']);
  if (isSuperAdmin(req)) return workspaceId || null;
  const scope = companyScopeFor(req);
  if (workspaceId && scope.includes(workspaceId)) return workspaceId;
  return req.user?.companyId || null;
}

// Reads return the company's OWN templates plus any Super-Admin `shared` ones.
function scopedWhere(req) {
  const workspaceId = idParam(req.query.companyId || req.headers['x-workspace-id']);
  if (isSuperAdmin(req)) return workspaceId ? { OR: [{ companyId: workspaceId }, { shared: true }] } : {};
  const scope = companyScopeFor(req);
  if (workspaceId && !scope.includes(workspaceId)) return null;
  const companyFilter = workspaceId ? { companyId: workspaceId } : { companyId: { in: scope.length ? scope : [-1] } };
  return { OR: [companyFilter, { shared: true }] };
}

module.exports = { isSuperAdmin, canView, canEdit, canManage, actorOf, readCompanyId, scopedWhere };
