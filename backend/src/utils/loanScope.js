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

// Branch-aware scope (see utils/workspaceScope.js): company grants PLUS the
// parent company of every branch the user may enter.
const ws = require('./workspaceScope');
const companyScopeFor = (req) => ws.companyScopeFor(req);

// Can the caller create/read data for this company? Super Admin → any; others →
// only companies inside their scope (home + accessible + branch parents).
const canAccessCompany = (req, companyId) => {
  const cid = idParam(companyId);
  if (!cid) return false;
  if (isSuperAdmin(req)) return true;
  return ws.canEnterWorkspace(req, cid);
};

// Which company a WRITE targets. A non–Super-Admin who named a workspace they can
// reach WRITES INTO IT — identical to how `scopedWhere`/`readCompanyId` READ — so a
// loan created inside an accessible company/workspace lands in, and stays visible
// from, that same workspace. Falls back to the home company when none is named.
// (Before this, writes pinned to the home company while reads followed the active
// workspace, so a loan a multi-company Company Head created in another accessible
// company was saved under their home company and then vanished from the list.)
function targetCompanyId(req, requested) {
  return ws.targetCompanyId(req, requested);
}

// The concrete company the CURRENT view/scope resolves to — i.e. the workspace
// the user actually selected (x-workspace-id / ?companyId), validated against
// their allowed scope, falling back to their home company. This is deliberately
// aligned with `scopedWhere` so that any per-company auto-provisioning (e.g.
// seeding default loan types) targets the SAME company the read is filtered by.
// Without this, a multi-company user viewing company B would read B's (empty)
// list while the seeder provisioned their home company A — an empty dropdown.
function readCompanyId(req, requested) {
  return ws.targetCompanyId(req, requested);
}

// Company-scoped WHERE for reads (null → unauthorised workspace). Loans are
// COMPANY-level, so a branch workspace resolves to its parent company instead of
// being refused — branch ids never appear in the company grant list.
const scopedWhere = (req) => ws.scopedCompanyWhere(req);

module.exports = {
  isSuperAdmin, isEmployee, canView, canEdit, canApprove, canManage,
  actorOf, targetCompanyId, readCompanyId, scopedWhere,
  companyScopeFor, canAccessCompany,
};
