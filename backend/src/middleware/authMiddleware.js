const jwt = require('jsonwebtoken');
const { resolveAccess } = require('../utils/accessScope');

exports.protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const prisma = require('../config/prisma');
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // ---- Branch-aware RBAC scope --------------------------------------------
    // A user's grant set (companyId + accessibleCompanyIds) mixes COMPANY and
    // BRANCH ids (they share an id space). resolveAccess turns it into:
    //   accessibleBranchIds – the exact branches the user may enter, and
    //   companyWideIds       – the companies they own in FULL.
    // We then OVERRIDE accessibleCompanyIds with the company-wide set, so every
    // controller that scopes by `companyId IN accessibleCompanyIds` enforces
    // branch-level access automatically: assigning a single branch (e.g. Rajkot)
    // no longer pulls in its siblings, because the parent company is only kept
    // when the user has NO specific branch of it. Super Admin is unrestricted.
    //
    // Guarded: a scope-resolution failure must NEVER become a 401 (that would
    // lock the user out of every request). On error we fail CLOSED to the user's
    // own primary workspace only.
    try {
      if (user.role === 'Super Admin') {
        user.accessibleBranchIds = [];
      } else {
        const [companies, branches] = await Promise.all([
          prisma.company.findMany({ select: { id: true } }),
          prisma.branch.findMany({ select: { id: true, companyId: true } }),
        ]);
        const raw = [user.companyId, ...(Array.isArray(user.accessibleCompanyIds) ? user.accessibleCompanyIds : [])];
        const { branchIds, companyWideIds } = resolveAccess(raw, companies, branches);
        user.accessibleBranchIds = branchIds.map(Number);
        user.accessibleCompanyIds = companyWideIds.map(Number);
      }
    } catch (scopeErr) {
      console.error('RBAC scope resolution failed (non-fatal):', scopeErr.message);
      user.accessibleBranchIds = [];
      user.accessibleCompanyIds = [];
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};
