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

// Card templates are COMPANY-level, so a BRANCH workspace resolves to its parent
// company (ws.targetCompanyId / ws.scopedCompanyWhere) instead of being refused —
// branch ids are never present in the company grant list.
const ws = require('./workspaceScope');

function readCompanyId(req, requested) {
  return ws.targetCompanyId(req, requested);
}

// Reads return the company's OWN templates plus any Super-Admin `shared` ones.
function scopedWhere(req) {
  const companyFilter = ws.scopedCompanyWhere(req);
  if (companyFilter === null) return null;
  // `{}` = unrestricted (Super Admin with no workspace named).
  if (!Object.keys(companyFilter).length) return {};
  return { OR: [companyFilter, { shared: true }] };
}

module.exports = { isSuperAdmin, canView, canEdit, canManage, actorOf, readCompanyId, scopedWhere };
