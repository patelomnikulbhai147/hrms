const prisma = require('../config/prisma');

/**
 * requireSuperAdmin
 *
 * Hard gate — only users whose DB role is exactly 'Super Admin' may proceed.
 * This is intentionally separate from requirePermission so it cannot be
 * bypassed by granting granular permissions to lower-level roles.
 *
 * Must be applied AFTER the `protect` middleware (which populates req.user).
 */
exports.requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: authentication required.' });
  }
  if (req.user.role !== 'Super Admin') {
    return res.status(403).json({
      error: 'Access Denied: This resource is restricted to Super Admin only.',
      requiredRole: 'Super Admin',
      yourRole: req.user.role || 'Unknown'
    });
  }
  return next();
};

/**
 * requireLeadershipAccess
 *
 * Hard module gate for governance modules (Tender Management, Contract
 * Management): only Super Admin and Company Head may access — for ANY action
 * (view/create/edit/delete/approve/export/print). HR, Employees and Branch
 * Managers are blocked at the API regardless of their stored permission matrix,
 * so the modules cannot be reached via direct API/URL calls — not just hidden in
 * the UI.
 *
 * FUTURE DELEGATION POINT: to let a Company Head grant access to another role,
 * extend LEADERSHIP_ROLES or consult an explicit per-user grant here. The default
 * — Super Admin + Company Head only — is intentional and must stay the baseline.
 *
 * Must run AFTER `protect` (which populates req.user).
 */
const LEADERSHIP_ROLES = ['Super Admin', 'Company Head'];
exports.requireLeadershipAccess = (moduleLabel) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized: authentication required.' });
  if (LEADERSHIP_ROLES.includes(req.user.role)) return next();
  return res.status(403).json({
    error: `Access Denied: ${moduleLabel} is restricted to Company Head and Super Admin.`,
    requiredRole: 'Company Head',
    yourRole: req.user.role || 'Unknown',
  });
};

// ── Canonical 3-action permission model: VIEW, EDIT, EXPORT ──────────────────
// Any requested action is normalized to one of these. Legacy actions fold:
//   create / delete / approve / import / manage  → edit
//   print                                        → export
//   read                                         → view
// This keeps existing route guards (requirePermission('x','create')) working
// while the stored matrix only needs view/edit/export, AND keeps OLD permission
// records (with create/delete/approve/import flags) valid without a migration.
const ACTION_ALIASES = {
  create: 'edit', delete: 'edit', approve: 'edit', import: 'edit', manage: 'edit',
  print: 'export', read: 'view',
};

function hasModulePermission(modulePerms, action) {
  const p = modulePerms || {};
  // Effective EDIT = edit OR any folded legacy write action.
  const effEdit = p.edit === true || p.create === true || p.delete === true
    || p.approve === true || p.import === true || p.manage === true;
  // Effective EXPORT = export OR print.
  const effExport = p.export === true || p.print === true;
  // Effective VIEW = explicit view/read OR any other granted action.
  const effAny = p.view === true || p.read === true || effEdit || effExport;

  const canonical = ACTION_ALIASES[action] || action;
  if (canonical === 'view') return effAny;
  if (canonical === 'edit') return effEdit;
  if (canonical === 'export') return effExport;
  // Unknown action — fall back to a direct, conservative check.
  return p[canonical] === true;
}

exports.requirePermission = (moduleName, action) => {
  return async (req, res, next) => {
    try {
      // req.user is populated by protect middleware
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (req.user.role === 'Super Admin') {
        return next();
      }

      const rawPermissions = req.user.permissions || {};
      const parsedPerms = rawPermissions.permissions || {};
      const modulePerms = parsedPerms[moduleName] || {};

      const hasPermission = hasModulePermission(modulePerms, action);

      if (hasPermission) {
        return next();
      }

      return res.status(403).json({ error: `Access denied. You do not have permission to ${action} in ${moduleName}.` });

    } catch (error) {
      console.error('RBAC Middleware Error:', error);
      res.status(500).json({ error: 'Internal server error checking permissions' });
    }
  };
};

