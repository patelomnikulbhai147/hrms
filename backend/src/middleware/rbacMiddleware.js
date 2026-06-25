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

// Permission model is consolidated to exactly four actions: VIEW, CREATE, EDIT,
// EXPORT. Legacy/compound actions map onto those four so older route guards keep
// working without touching every route:
//   • delete  → edit   (modifying/removing an existing record requires EDIT)
//   • approve → edit   (approving an existing record requires EDIT)
//   • manage  → edit
//   • print   → export (producing output is an EXPORT-class action)
const ACTION_ALIASES = { delete: 'edit', approve: 'edit', manage: 'edit', print: 'export' };
const normalizeAction = (action) => ACTION_ALIASES[action] || action;

exports.requirePermission = (moduleName, action) => {
  const effectiveAction = normalizeAction(action);
  return async (req, res, next) => {
    try {
      // req.user is populated by protect middleware
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (req.user.role === 'Super Admin') {
        return next();
      }

      // Re-fetch user to get latest permissions just in case?
      // protect middleware already fetches user. Let's use req.user.
      const rawPermissions = req.user.permissions || {};
      const parsedPerms = rawPermissions.permissions || {};
      // Authorization is action-based only (view / create / edit / export). The
      // legacy "Access" (moduleAccess) gate and the "Manage" permission have been
      // removed; delete/approve/print are folded into edit/export above.

      // Check granular action permission
      if (parsedPerms[moduleName] !== undefined) {
        if (parsedPerms[moduleName][effectiveAction] === true) {
          return next();
        } else {
          return res.status(403).json({ error: `Access denied. You do not have permission to ${action} in ${moduleName}.` });
        }
      }

      // Default fallback if permissions object is empty or missing
      return res.status(403).json({ error: `Access denied. You do not have permission to ${action} in ${moduleName}.` });

    } catch (error) {
      console.error('RBAC Middleware Error:', error);
      res.status(500).json({ error: 'Internal server error checking permissions' });
    }
  };
};
