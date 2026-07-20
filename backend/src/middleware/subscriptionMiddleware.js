const prisma = require('../config/prisma');
const { isModuleLocked } = require('../services/planEntitlements');

// Load the CompanySubscription record ONLY for a Custom plan (its per-company
// module/report allow-lists drive enforcement). Standard plans resolve entirely
// from Company.plan + the code map, so we skip the extra query for them.
async function subscriptionForPlan(companyId, plan) {
  if (String(plan) !== 'Custom') return null;
  return prisma.companySubscription.findUnique({ where: { companyId: Number(companyId) } }).catch(() => null);
}

// ===========================================================================
//  SUBSCRIPTION / PLAN GATE.
//
//  Enforces, server-side, that a company on a restricted plan (e.g. FREE)
//  cannot reach a premium module's API — for ANY method (reads included), so a
//  locked module never exposes data. This is the "subscription active → module
//  allowed" step of the enforcement order:
//
//     protect (auth)  →  readOnly (company active)  →  requirePlanModule (this)
//                     →  rbac (permission)          →  execute
//
//  Apply AFTER `protect` on a premium module's router/mount. Keyed by the
//  module's PERMISSION KEY (AppModules), matching planEntitlements.js.
// ===========================================================================

// Resolve the company in context exactly like readOnlyMiddleware: the active
// workspace header, then the request body, then the user's own company; a branch
// id resolves to its parent company.
async function resolveCompany(req) {
  const raw = req.headers['x-workspace-id']
    || (req.body && req.body.companyId)
    || (req.user && req.user.companyId);
  const id = Number(raw);
  if (!id) return null;
  let company = await prisma.company.findUnique({ where: { id } });
  if (!company) {
    const branch = await prisma.branch.findUnique({ where: { id } }).catch(() => null);
    if (branch) company = await prisma.company.findUnique({ where: { id: branch.companyId } });
  }
  return company;
}

function requirePlanModule(permKey) {
  return async function planGate(req, res, next) {
    try {
      // Super Admin is never plan-limited — they administer every tenant.
      if (req.user && req.user.role === 'Super Admin') return next();

      const company = await resolveCompany(req);
      // No resolvable company → let downstream auth/permission guards decide.
      if (!company) return next();

      const sub = await subscriptionForPlan(company.id, company.plan);
      if (isModuleLocked(company.plan, permKey, sub)) {
        return res.status(403).json({
          code: 'PLAN_UPGRADE_REQUIRED',
          module: permKey,
          plan: company.plan,
          error: 'This feature is available on a premium plan. Upgrade your subscription to unlock this module.',
        });
      }
      return next();
    } catch (_) {
      // Never hard-fail the platform on a guard error; downstream guards still run.
      return next();
    }
  };
}

module.exports = { requirePlanModule, resolveCompany, subscriptionForPlan };
