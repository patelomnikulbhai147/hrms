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
    // billingCycle rides along so a caller that has to materialise a missing
    // subscription row can seed it from the tenant's onboarding choice.
    select: { id: true, plan: true, billingCycle: true, parentCompanyId: true, onboardingState: true },
  });
  if (!company) return null;
  if (company.parentCompanyId) {
    const head = await prisma.company.findUnique({
      where: { id: Number(company.parentCompanyId) },
      select: { id: true, plan: true, billingCycle: true, onboardingState: true },
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

// SAFETY NET: every active login user of the tenant consumes a slot. Company
// Heads / HR normally hold an Employee profile (User.employeeId set by the
// profile hook + backfill), so they are already inside countTenantEmployees.
// Any active company user WITHOUT a linked profile is counted here so no
// creation path — present or future — can mint hidden, slot-free users.
async function countUnlinkedActiveUsers(companyIds) {
  return prisma.user.count({
    where: {
      companyId: { in: companyIds },
      status: 'Active',
      role: { not: 'Super Admin' },
      employeeId: null,
    },
  });
}

// Purchased add-on slots live on CompanySubscription.extraEmployeeSlots — they
// stack ON TOP of the plan's base limit and never overwrite it. Only a settled
// payment or a Super Admin action writes this column.
async function extraSlotsFor(headId) {
  const row = await prisma.companySubscription
    .findUnique({ where: { companyId: Number(headId) }, select: { extraEmployeeSlots: true } })
    .catch(() => null);
  return Math.max(0, Number(row?.extraEmployeeSlots) || 0);
}

/**
 * The subscription's own seat grant and its purchased add-ons, in one read.
 *
 * NOTE: `subscriptionForPlan` deliberately returns null for every non-Custom
 * plan, so it can NOT be used to read these columns — they must come from the
 * subscription row directly or a standard-plan tenant would silently lose both
 * its purchased seats and its add-on slots.
 */
async function seatSourcesFor(headId) {
  const row = await prisma.companySubscription
    .findUnique({
      where: { companyId: Number(headId) },
      select: { extraEmployeeSlots: true, subscriptionSeats: true },
    })
    .catch(() => null);
  return {
    extraSlots: Math.max(0, Number(row?.extraEmployeeSlots) || 0),
    subscriptionSeats:
      row?.subscriptionSeats == null ? null : Math.max(0, Number(row.subscriptionSeats) || 0),
  };
}

// Full capacity snapshot for a company/branch id. `limit === null` ⇒ unlimited.
// limit = base plan limit + purchased extra slots;
// current = active Employee rows + active login users without a profile.
async function getCapacity(companyId) {
  // ── FAIL CLOSED ────────────────────────────────────────────────────────────
  // This used to return `{ unlimited: true, remaining: Infinity }` whenever the
  // company could not be resolved, which meant ANY unresolvable company/branch
  // id silently bypassed the plan's employee limit through assertCapacity.
  // A limit check must never fail open.
  //
  // Two distinct unresolved cases, deliberately reported differently:
  //   NO_COMPANY_CONTEXT — no company id supplied at all (e.g. a Super Admin,
  //     who has no company of their own). `limit: null` keeps the existing
  //     display behaviour for that account; enforcement still refuses, because
  //     an employee cannot be created without a company.
  //   COMPANY_NOT_FOUND — an id WAS supplied but does not resolve. Capacity is
  //     zero: nothing may be created against a company that does not exist.
  //
  // `resolved: false` is what assertCapacity gates on, so both cases deny.
  const requested = Number(companyId);
  if (!companyId || !Number.isFinite(requested) || requested <= 0) {
    return {
      resolved: false, reason: 'NO_COMPANY_CONTEXT',
      plan: '', baseLimit: null, planBase: null, subscriptionSeats: null, extraSlots: 0,
      limit: null, current: 0, currentEmployees: 0, currentUnlinkedUsers: 0,
      remaining: 0, unlimited: false,
    };
  }
  const head = await resolveHead(companyId);
  if (!head) {
    return {
      resolved: false, reason: 'COMPANY_NOT_FOUND',
      plan: '', baseLimit: 0, planBase: 0, subscriptionSeats: null, extraSlots: 0,
      limit: 0, current: 0, currentEmployees: 0, currentUnlinkedUsers: 0,
      remaining: 0, unlimited: false,
    };
  }
  const sub = await subscriptionForPlan(head.id, head.plan);
  const max = resolveEntitlements(head.plan, sub).limits?.maxEmployees;
  const unlimited = max == null || Number(max) < 0;
  const { extraSlots, subscriptionSeats } = await seatSourcesFor(head.id);
  const ids = await tenantCompanyIds(head.id);
  const [currentEmployees, currentUnlinkedUsers] = await Promise.all([
    countTenantEmployees(ids),
    countUnlinkedActiveUsers(ids),
  ]);
  const current = currentEmployees + currentUnlinkedUsers;
  // Reached only when the company resolved, so this snapshot is authoritative.
  // Base = the seats the SUBSCRIPTION grants. `subscriptionSeats` is what the
  // customer actually bought on this plan and may exceed the plan's code-map
  // base; NULL means "just the plan base" (every pre-migration row). Purchased
  // add-on slots stack ON TOP and are a separate bucket, so a renewal restating
  // the seat count can never consume them.
  const planBase = unlimited ? null : Number(max);
  const seatOverride = subscriptionSeats;
  const baseLimit = unlimited ? null : Math.max(planBase, seatOverride ?? planBase);
  const limit = unlimited ? null : baseLimit + extraSlots;
  return {
    resolved: true,
    reason: null,
    plan: head.plan || '',
    baseLimit,
    planBase,
    subscriptionSeats: seatOverride,
    extraSlots,
    limit,
    current,
    currentEmployees,
    currentUnlinkedUsers,
    remaining: unlimited ? Infinity : Math.max(0, limit - current),
    unlimited,
  };
}

// Guard used by create paths. Returns { ok } or { ok:false, ...402-ish payload }.
// `addCount` lets bulk import ask for N seats at once.
async function assertCapacity(companyId, addCount = 1) {
  const cap = await getCapacity(companyId);
  // Unresolvable company ⇒ DENY with a proper error. Previously this path
  // reported `unlimited` and every plan limit was bypassed.
  if (!cap.resolved) {
    const notFound = cap.reason === 'COMPANY_NOT_FOUND';
    return {
      ok: false,
      cap,
      status: notFound ? 404 : 400,
      body: {
        code: cap.reason,
        error: notFound
          ? 'The company for this request could not be found, so the employee limit cannot be verified.'
          : 'No company was specified for this request, so the employee limit cannot be verified.',
        requestedCompanyId: companyId ?? null,
        requested: addCount,
      },
    };
  }
  if (cap.unlimited) return { ok: true, cap };
  if (cap.current + addCount > cap.limit) {
    return {
      ok: false,
      cap,
      status: 403,
      body: {
        code: 'EMPLOYEE_LIMIT_REACHED',
        error: 'You have reached your employee limit. ' +
          'Please purchase additional employee slots or contact our sales team.',
        plan: cap.plan,
        baseLimit: cap.baseLimit,
        extraSlots: cap.extraSlots,
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

module.exports = {
  resolveHead,
  tenantCompanyIds,
  countTenantEmployees,
  countUnlinkedActiveUsers,
  extraSlotsFor,
  getCapacity,
  assertCapacity,
};
