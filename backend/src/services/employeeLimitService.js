// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE-LIMIT SERVICE — the single authoritative resolver for a company's
// subscription employee cap and its live headcount.
//
// The cap is per TENANT (head office + all its branches), resolved from the plan
// via planEntitlements (Custom-aware). FREE = 100. A limit of -1 means unlimited.
// Every employee-creation path (create / bulk / temp→real) calls
// assertCapacity() so the limit is enforced on the backend, not just the UI.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');
const { ACTIVE_EMPLOYEE_WHERE } = require('../utils/employeeStatus');
const { resolveEntitlements } = require('./planEntitlements');
const { subscriptionForPlan } = require('../middleware/subscriptionMiddleware');

// Resolve the head-office company id for any company/branch id. Branches are
// Company rows with parentCompanyId set; the plan + limit live on the head.
async function resolveHead(companyId) {
  const id = Number(companyId);
  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, plan: true, parentCompanyId: true, onboardingState: true },
  });
  if (!company) return null;
  if (company.parentCompanyId) {
    const head = await prisma.company.findUnique({
      where: { id: Number(company.parentCompanyId) },
      select: { id: true, plan: true, onboardingState: true },
    });
    if (head) return head;
  }
  return company;
}

// Every company id that shares this tenant's headcount = head + its branches.
async function tenantCompanyIds(headId) {
  const branches = await prisma.company.findMany({
    where: { parentCompanyId: Number(headId) },
    select: { id: true },
  });
  return [Number(headId), ...branches.map((b) => b.id)];
}

// Live active headcount across the whole tenant (offboarded excluded — matches
// the counts shown elsewhere and the "current employees" the plan gates on).
async function countTenantEmployees(companyIds) {
  return prisma.employee.count({ where: { companyId: { in: companyIds }, ...ACTIVE_EMPLOYEE_WHERE } });
}

// Full capacity snapshot for a company/branch id. `limit === null` ⇒ unlimited.
async function getCapacity(companyId) {
  const head = await resolveHead(companyId);
  if (!head) return { plan: '', limit: null, current: 0, remaining: Infinity, unlimited: true };
  const sub = await subscriptionForPlan(head.id, head.plan);
  const max = resolveEntitlements(head.plan, sub).limits?.maxEmployees;
  const unlimited = max == null || Number(max) < 0;
  const ids = await tenantCompanyIds(head.id);
  const current = await countTenantEmployees(ids);
  const limit = unlimited ? null : Number(max);
  return {
    plan: head.plan || '',
    limit,
    current,
    remaining: unlimited ? Infinity : Math.max(0, limit - current),
    unlimited,
  };
}

// Guard used by create paths. Returns { ok } or { ok:false, ...402-ish payload }.
// `addCount` lets bulk import ask for N seats at once.
async function assertCapacity(companyId, addCount = 1) {
  const cap = await getCapacity(companyId);
  if (cap.unlimited) return { ok: true, cap };
  if (cap.current + addCount > cap.limit) {
    return {
      ok: false,
      cap,
      status: 403,
      body: {
        code: 'EMPLOYEE_LIMIT_REACHED',
        error: `Your ${cap.plan} plan allows up to ${cap.limit} active employees. ` +
          `You currently have ${cap.current}. To add more employees, please upgrade your subscription plan.`,
        plan: cap.plan,
        limit: cap.limit,
        current: cap.current,
        remaining: cap.remaining,
        // How many MORE employees still fit — what the importer reports back.
        availableSlots: cap.remaining,
        requested: addCount,
      },
    };
  }
  return { ok: true, cap };
}

module.exports = { resolveHead, tenantCompanyIds, countTenantEmployees, getCapacity, assertCapacity };
