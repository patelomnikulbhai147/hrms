const jwt = require('jsonwebtoken');
const { resolveAccess } = require('../utils/accessScope');
const auditContext = require('../utils/auditContext');

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

    // ---- Account and tenant must both still be live --------------------------
    // A deactivated user, or a user belonging to an ARCHIVED company, previously
    // kept a fully working session: their token still authenticated and every
    // endpoint answered 200 (with empty results, so nothing leaked — but the
    // session should not exist at all). Super Admin is exempt: the platform owner
    // must still be able to administer an archived tenant.
    if (user.role !== 'Super Admin') {
      if (user.status && String(user.status).toLowerCase() !== 'active') {
        return res.status(401).json({ error: 'This account is no longer active.', code: 'ACCOUNT_INACTIVE' });
      }
      if (user.companyId != null) {
        // companyId may hold a COMPANY or a BRANCH id (one shared sequence), so
        // check both, and treat "not found" as live rather than locking someone
        // out on a lookup miss.
        const [co, br] = await Promise.all([
          prisma.company.findUnique({ where: { id: user.companyId }, select: { status: true, isArchived: true } }).catch(() => null),
          prisma.branch.findUnique({ where: { id: user.companyId }, select: { isArchived: true, companyId: true } }).catch(() => null),
        ]);
        const parent = br
          ? await prisma.company.findUnique({ where: { id: br.companyId }, select: { status: true, isArchived: true } }).catch(() => null)
          : null;
        const dead = (c) => !!c && (c.isArchived === true || String(c.status || '').toLowerCase() === 'archived');
        if (dead(co) || (br && br.isArchived === true) || dead(parent)) {
          return res.status(403).json({
            error: 'This workspace has been archived. Please contact your administrator.',
            code: 'WORKSPACE_ARCHIVED',
          });
        }
      }
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
      const [companies, branches] = await Promise.all([
        prisma.company.findMany({ select: { id: true } }),
        prisma.branch.findMany({ select: { id: true, companyId: true } }),
      ]);
      // branchId → parent companyId. Modules whose data has no branch column
      // (e.g. Invoice masters) resolve a branch workspace to its parent company
      // so a branch user's reads and writes land in the same, FK-valid company.
      user.branchCompanyMap = Object.fromEntries(branches.map((b) => [b.id, b.companyId]));
      if (user.role === 'Super Admin') {
        user.accessibleBranchIds = [];
      } else {
        const raw = [user.companyId, ...(Array.isArray(user.accessibleCompanyIds) ? user.accessibleCompanyIds : [])];
        const { branchIds, companyWideIds } = resolveAccess(raw, companies, branches);
        user.accessibleBranchIds = branchIds.map(Number);
        user.accessibleCompanyIds = companyWideIds.map(Number);
      }
    } catch (scopeErr) {
      console.error('RBAC scope resolution failed (non-fatal):', scopeErr.message);
      user.accessibleBranchIds = [];
      user.accessibleCompanyIds = [];
      user.branchCompanyMap = {};
    }

    // Custom-domain isolation: a request arriving on a mapped tenant host may
    // only be served to users of THAT company (Super Admin exempt). The host
    // → company mapping was resolved by customDomainHost middleware.
    if (req.customDomain && user.role !== 'Super Admin') {
      const { resolveHead } = require('../services/employeeLimitService');
      const head = await resolveHead(user.companyId).catch(() => null);
      if (!head || head.id !== req.customDomain.companyId) {
        return res.status(403).json({ error: 'This account does not belong to this workspace domain.' });
      }
    }

    req.user = user;
    // Record the actor for the global audit-trail middleware (who did what).
    auditContext.setUser(user);
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};

exports.portalProtect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    if (decoded.scope !== 'portal') {
      return res.status(403).json({ error: 'Invalid token scope' });
    }

    const prisma = require('../config/prisma');
    const user = await prisma.portalUser.findUnique({ where: { id: decoded.id } });
    
    if (!user || user.status !== 'Active') {
      return res.status(401).json({ error: 'Portal user not found or inactive' });
    }

    req.portalUser = user;
    next();
  } catch (error) {
    console.error('Portal Auth Middleware Error:', error);
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};
