const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const auditContext = require('../utils/auditContext');

const MOBILE_JWT_SECRET = process.env.MOBILE_JWT_SECRET || (process.env.JWT_SECRET + '_mobile_app_secret');

const protectMobileBase = async (req, res, next, allowedRoles) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, MOBILE_JWT_SECRET);
    
    // Ensure this token came from a mobile session
    if (!decoded.mobileSessionId) {
       return res.status(401).json({ error: 'Not authorized, invalid token type for mobile access' });
    }

    const session = await prisma.mobileSession.findUnique({
        where: { id: decoded.mobileSessionId }
    });

    if (!session || !session.isActive) {
        return res.status(401).json({ error: 'Not authorized, mobile session expired or revoked', code: 'SESSION_REVOKED' });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Role check
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: `Access denied. Valid roles: ${allowedRoles.join(', ')}`, code: 'ROLE_NOT_AUTHORIZED' });
    }

    // Status check
    if (user.status && String(user.status).toLowerCase() !== 'active') {
      return res.status(401).json({ error: 'This account is no longer active.', code: 'ACCOUNT_INACTIVE' });
    }

    // Tenant check
    if (user.companyId != null) {
      const co = await prisma.company.findUnique({ where: { id: user.companyId }, select: { status: true, isArchived: true, accountStatus: true } }).catch(() => null);
      if (co) {
          if (co.isArchived === true || String(co.status || '').toLowerCase() === 'archived') {
            return res.status(403).json({ error: 'This workspace has been archived.', code: 'WORKSPACE_ARCHIVED' });
          }
          if (String(co.accountStatus || '').toLowerCase() !== 'active') {
            return res.status(403).json({ error: 'This workspace account is suspended.', code: 'WORKSPACE_SUSPENDED' });
          }
      }
    }

    // Update lastActiveAt for session tracking (fire and forget for performance)
    prisma.mobileSession.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() }
    }).catch(e => console.error('Failed to update mobile session lastActiveAt:', e.message));

    req.user = user;
    req.mobileSession = session;
    auditContext.setUser(user);
    next();
  } catch (error) {
    console.error('Mobile Auth Middleware Error:', error.message);
    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};

exports.protectMobile = (req, res, next) => protectMobileBase(req, res, next, ['Company Head', 'HR']);
exports.protectMobileEmployee = (req, res, next) => protectMobileBase(req, res, next, ['Company Head', 'HR', 'Employee', 'Staff']);
