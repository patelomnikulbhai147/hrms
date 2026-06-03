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
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Dynamic hierarchy resolution: automatically grant access to all child branches
    const allowedIds = [user.companyId, ...(user.accessibleCompanyIds || [])].filter(Boolean);
    if (allowedIds.length > 0) {
      const branches = await prisma.branch.findMany({
        where: { companyId: { in: allowedIds } }
      });
      const branchIds = branches.map(b => b.id);
      user.accessibleCompanyIds = Array.from(new Set([...(user.accessibleCompanyIds || []), ...branchIds]));
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};
