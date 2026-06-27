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

/**
 * requireCompanyModuleAccess(moduleName, action, opts)
 *   opts = { label?: string, defaults?: { view?: string[], edit?: string[], export?: string[] } }
 *
 * Gate for COMPANY-INTERNAL modules (e.g. Communication Center) that belong to a
 * company rather than to the SaaS platform:
 *   • Super Admin  → REJECTED. The platform admin must not manage a company's
 *                    internal HR communications. This also blocks a Super Admin
 *                    masquerading into a company, whose backend role stays
 *                    'Super Admin' (so direct API/URL calls are rejected too).
 *   • Company Head → full access (always allowed).
 *   • Any other role (HR, Finance, …) → governed by the permission matrix: if the
 *     user has an explicit row for moduleName, that decides; if the row is ABSENT
 *     (e.g. a user created before this module existed), fall back to `opts.defaults`
 *     keyed by canonical action — mirroring the frontend's role-default behaviour
 *     so a newly added module isn't accidentally locked out for everyone.
 *   • Employees / unauthorised roles → REJECTED (no grant, not in defaults).
 *
 * Company-scoping (Company ID isolation) is enforced separately in the controller
 * (resolveCompanyId locks non-Super-Admin callers to their own company).
 *
 * Must run AFTER `protect` (which populates req.user).
 */
exports.requireCompanyModuleAccess = (moduleName, action, opts = {}) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized: authentication required.' });
  const role = req.user.role;
  const label = opts.label || moduleName;
  if (role === 'Super Admin') {
    return res.status(403).json({
      error: `Access Denied: ${label} is a company module and is not available to Super Admin.`,
      yourRole: role,
    });
  }
  if (role === 'Company Head') return next();

  const parsedPerms = (req.user.permissions && req.user.permissions.permissions) || {};
  const modulePerms = parsedPerms[moduleName];
  let allowed;
  if (modulePerms && Object.keys(modulePerms).length) {
    // Explicit matrix row exists → it is authoritative.
    allowed = hasModulePermission(modulePerms, action);
  } else {
    // No row for this (newly added) module → role-default fallback.
    const canonical = ACTION_ALIASES[action] || action;
    const roles = (opts.defaults && opts.defaults[canonical]) || [];
    allowed = roles.includes(role);
  }
  if (allowed) return next();
  return res.status(403).json({
    error: `Access denied. You do not have permission to ${action} in ${label}.`,
    yourRole: role || 'Unknown',
  });
};

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

