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

// Branch-aware. Compliance filings are COMPANY-level, so a branch workspace
// resolves to its parent company; the previous company-only grant list held no
// branch ids at all and refused every branch workspace outright.
const ws = require('./workspaceScope');

const companyScopeFor = (req) => ws.companyScopeFor(req);
const targetCompanyId = (req, requested) => ws.targetCompanyId(req, requested);
const scopedWhere = (req) => ws.scopedCompanyWhere(req);

module.exports = { isSuperAdmin, canView, canEdit, canManage, actorOf, targetCompanyId, scopedWhere };
