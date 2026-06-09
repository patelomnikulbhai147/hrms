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

      // Re-fetch user to get latest permissions just in case? 
      // protect middleware already fetches user. Let's use req.user.
      const rawPermissions = req.user.permissions || {};
      const parsedPerms = rawPermissions.permissions || {};
      const moduleAccess = rawPermissions.moduleAccess || {};
      
      // If moduleAccess is explicitly false, deny
      if (moduleAccess[moduleName] === false) {
        return res.status(403).json({ error: `Access denied. You do not have permission to access ${moduleName}.` });
      }

      // Check granular action permission
      if (parsedPerms[moduleName] !== undefined) {
        if (parsedPerms[moduleName][action] === true) {
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
