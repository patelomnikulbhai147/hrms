const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
      const permissions = req.user.permissions;
      
      // If moduleAccess is explicitly false, deny
      if (permissions && permissions.moduleAccess && permissions.moduleAccess[moduleName] === false) {
        return res.status(403).json({ error: `Access denied. You do not have permission to access ${moduleName}.` });
      }

      // Check granular action permission
      if (permissions && permissions.permissions && permissions.permissions[moduleName] !== undefined) {
        if (permissions.permissions[moduleName][action] === true) {
          return next();
        } else {
          return res.status(403).json({ error: `Access denied. You do not have permission to ${action} in ${moduleName}.` });
        }
      }

      // Fallbacks if permissions object is empty (legacy users)
      if (action === 'view') {
        return next(); // Default view is generally true for legacy
      }
      
      if (req.user.role === 'Company Head' || req.user.role === 'HR') {
        // Broad access for Heads/HRs
        return next();
      }

      if (req.user.role === 'Employee' && (moduleName === 'leaves' || moduleName === 'attendance' || moduleName === 'settings')) {
         if (action === 'create' || action === 'edit') return next();
      }

      return res.status(403).json({ error: `Access denied. You do not have permission to ${action} in ${moduleName}.` });

    } catch (error) {
      console.error('RBAC Middleware Error:', error);
      res.status(500).json({ error: 'Internal server error checking permissions' });
    }
  };
};
