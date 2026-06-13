const jwt = require('jsonwebtoken');

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

    // Child branches a user can reach, derived from their company-level access.
    // CRITICAL: these are kept in a SEPARATE field and are NOT merged into
    // accessibleCompanyIds. Branch ids share the company id space (e.g. Vishv's
    // branch #2 collides with company #2 "HealthPlus"), so merging them would let
    // a `companyId IN (...)` filter match a foreign company — a cross-company data
    // leak. Controllers scope on companyId via accessibleCompanyIds; branch rows
    // are already reachable because branch employees carry their parent companyId.
    const companyScope = [user.companyId, ...(user.accessibleCompanyIds || [])].filter(Boolean);
    if (companyScope.length > 0) {
      const branches = await prisma.branch.findMany({ where: { companyId: { in: companyScope } } });
      user.accessibleBranchIds = branches.map(b => b.id);
    } else {
      user.accessibleBranchIds = [];
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};
