// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION MANAGEMENT (Super Admin) — the master control center for every
// company's plan, pricing, status, renewals and history.
//
// ONE CompanySubscription row per company. The plan tier is mirrored onto
// Company.plan so the existing permission engine (planEntitlements +
// subscriptionMiddleware) stays the single enforcement source of truth — a plan
// change here instantly changes what the company's APIs allow (no logout).
//
// Pricing is per-employee-per-billing-period (planEntitlements.calcAmount);
// amounts are ALWAYS computed live from the current active headcount, never
// entered manually.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');
const AuditService = require('../services/auditService');
const { ACTIVE_EMPLOYEE_WHERE } = require('../utils/employeeStatus');
const {
  calcAmount, pricePerEmployee, getPlanCatalog, PLAN_META, PREMIUM_MODULES,
} = require('../services/planEntitlements');
const { BILLING_CYCLES, normalizeBillingCycle } = require('../utils/billingCycle');

const actorOf = (req) => req.user?.name || req.user?.email || 'Super Admin';
const VALID_PLANS = ['Free', 'Starter', 'Professional', 'Enterprise', 'Custom'];
const VALID_CYCLES = BILLING_CYCLES;
const HEAD_OFFICE_WHERE = { parentCompanyId: null }; // top-level companies only (branches excluded)

// ── Helpers ──────────────────────────────────────────────────────────────────
// Lazily materialise the subscription row. The cycle is SEEDED FROM the company
// row (mirrored there at onboarding) rather than hardcoded, so a company that
// signed up Yearly but whose best-effort subscription insert lost a race does
// not silently reappear as Quarterly and start pricing slot packs at the
// quarterly rate.
async function getOrCreateSubscription(companyId, companyPlan, companyCycle) {
  let sub = await prisma.companySubscription.findUnique({ where: { companyId: Number(companyId) } });
  if (!sub) {
    sub = await prisma.companySubscription.create({
      data: {
        companyId: Number(companyId),
        plan: companyPlan || 'Free',
        billingCycle: normalizeBillingCycle(companyCycle),
        status: 'Active',
      },
    });
  }
  return sub;
}

const countActiveEmployees = (companyId) => prisma.employee.count({ where: { companyId: Number(companyId), ...ACTIVE_EMPLOYEE_WHERE } });
const countUsedBranches = (companyId) => prisma.branch.count({ where: { companyId: Number(companyId), isArchived: false } });

async function findCompanyHead(companyId) {
  return prisma.user.findFirst({
    where: { companyId: Number(companyId), role: 'Company Head' },
    select: { name: true, email: true }, orderBy: { id: 'asc' },
  });
}

// The monthly-equivalent of a billing-period amount (Quarterly period = 3 months).
const monthlyEquiv = (amount, cycle) => (String(cycle).toLowerCase() === 'yearly' ? amount / 12 : amount / 3);

// Build one company's subscription row (live amount from active headcount).
function buildRow(company, sub, activeCount, branchCount, head) {
  const plan = sub.plan || company.plan || 'Free';
  const cycle = sub.billingCycle || 'Quarterly';
  const rate = pricePerEmployee(plan, cycle, sub.pricePerEmployee);
  const amount = calcAmount(plan, cycle, activeCount, sub.pricePerEmployee, sub.discountPercent);
  return {
    companyId: company.id,
    companyName: company.name,
    companyHead: head?.name || company.adminName || '—',
    companyHeadEmail: head?.email || company.adminEmail || '',
    companyMobile: company.phone || company.contactNumber || '',
    createdDate: company.joinDate,
    employees: activeCount,
    branches: branchCount,
    plan,
    billingCycle: cycle,
    pricePerEmployee: rate,
    discountPercent: sub.discountPercent || 0,
    amount,
    status: sub.status || 'Active',
    paymentStatus: company.paymentStatus,
    renewalDate: sub.renewalDate,
  };
}

// ── GET /api/subscriptions/dashboard — summary cards ─────────────────────────
exports.dashboard = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      where: { ...HEAD_OFFICE_WHERE, isArchived: false },
      select: { id: true, name: true, plan: true, paymentStatus: true, adminName: true, adminEmail: true, phone: true, contactNumber: true, joinDate: true },
    });
    const subs = await prisma.companySubscription.findMany();
    const subByCompany = new Map(subs.map((s) => [s.companyId, s]));
    const empGroups = await prisma.employee.groupBy({ by: ['companyId'], where: ACTIVE_EMPLOYEE_WHERE, _count: { _all: true } });
    const empByCompany = new Map(empGroups.map((g) => [g.companyId, g._count._all]));

    let totalCompanies = 0, freeCompanies = 0, paidCompanies = 0, quarterly = 0, yearly = 0;
    let activeSubs = 0, expired = 0, monthlyRevenue = 0;
    const now = new Date();

    for (const c of companies) {
      totalCompanies++;
      const sub = subByCompany.get(c.id) || { plan: c.plan || 'Free', billingCycle: 'Quarterly', status: 'Active', discountPercent: 0, pricePerEmployee: null, renewalDate: null };
      const plan = sub.plan || c.plan || 'Free';
      const cycle = sub.billingCycle || 'Quarterly';
      if (plan === 'Free') freeCompanies++; else paidCompanies++;
      if (String(cycle).toLowerCase() === 'yearly') yearly++; else quarterly++;
      const isExpired = sub.status === 'Expired' || (sub.renewalDate && new Date(sub.renewalDate) < now) || ['Overdue', 'Expired', 'Unpaid'].includes(c.paymentStatus);
      if (isExpired) expired++;
      const active = sub.status === 'Active' && !isExpired;
      if (active) activeSubs++;
      // Revenue only from active, paid (non-free) subscriptions.
      if (active && plan !== 'Free') {
        const amount = calcAmount(plan, cycle, empByCompany.get(c.id) || 0, sub.pricePerEmployee, sub.discountPercent);
        monthlyRevenue += monthlyEquiv(amount, cycle);
      }
    }
    monthlyRevenue = Math.round(monthlyRevenue);
    return res.json({
      totalCompanies, freeCompanies, paidCompanies,
      quarterlyPlans: quarterly, yearlyPlans: yearly,
      activeSubscriptions: activeSubs, expiredPlans: expired,
      monthlyRevenue, annualRevenue: monthlyRevenue * 12,
      currency: 'INR',
      generatedAt: now.toISOString(),
    });
  } catch (e) {
    console.error('[subscriptions.dashboard]', e);
    return res.status(500).json({ error: 'Failed to load subscription dashboard.' });
  }
};

// ── GET /api/subscriptions — every company's subscription row ────────────────
exports.list = async (req, res) => {
  try {
    // Valid companies only: top-level (branches excluded) and not archived/soft-deleted.
    // MUST match the dashboard filter exactly so the table and the summary cards are
    // computed from one and the same dataset (single source of truth).
    const companies = await prisma.company.findMany({
      where: { ...HEAD_OFFICE_WHERE, isArchived: false },
      select: { id: true, name: true, plan: true, paymentStatus: true, status: true, adminName: true, adminEmail: true, phone: true, contactNumber: true, joinDate: true },
      orderBy: { name: 'asc' },
    });
    const ids = companies.map((c) => c.id);
    const [subs, empGroups, branchGroups, heads] = await Promise.all([
      prisma.companySubscription.findMany({ where: { companyId: { in: ids } } }),
      prisma.employee.groupBy({ by: ['companyId'], where: { companyId: { in: ids }, ...ACTIVE_EMPLOYEE_WHERE }, _count: { _all: true } }),
      prisma.branch.groupBy({ by: ['companyId'], where: { companyId: { in: ids }, isArchived: false }, _count: { _all: true } }),
      prisma.user.findMany({ where: { companyId: { in: ids }, role: 'Company Head' }, select: { companyId: true, name: true, email: true }, orderBy: { id: 'asc' } }),
    ]);
    const subBy = new Map(subs.map((s) => [s.companyId, s]));
    const empBy = new Map(empGroups.map((g) => [g.companyId, g._count._all]));
    const brBy = new Map(branchGroups.map((g) => [g.companyId, g._count._all]));
    const headBy = new Map();
    for (const h of heads) if (!headBy.has(h.companyId)) headBy.set(h.companyId, h);

    const rows = companies.map((c) => {
      const sub = subBy.get(c.id) || { plan: c.plan || 'Free', billingCycle: 'Quarterly', status: 'Active', discountPercent: 0, pricePerEmployee: null, renewalDate: null };
      return buildRow(c, sub, empBy.get(c.id) || 0, brBy.get(c.id) || 0, headBy.get(c.id));
    });
    return res.json(rows);
  } catch (e) {
    console.error('[subscriptions.list]', e);
    return res.status(500).json({ error: 'Failed to load subscriptions.' });
  }
};

// ── GET /api/subscriptions/catalog — plan tiers + pricing (for the UI) ───────
exports.catalog = (req, res) => res.json({ plans: getPlanCatalog(), premiumModules: PREMIUM_MODULES });

// ── GET /api/subscriptions/:companyId — manage detail ────────────────────────
exports.getOne = async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    const sub = await getOrCreateSubscription(companyId, company.plan, company.billingCycle);
    const [activeCount, branchCount, head, history] = await Promise.all([
      countActiveEmployees(companyId), countUsedBranches(companyId), findCompanyHead(companyId),
      prisma.subscriptionHistory.findMany({ where: { companyId }, orderBy: { id: 'desc' }, take: 100 }),
    ]);
    const row = buildRow(company, sub, activeCount, branchCount, head);
    return res.json({
      ...row,
      subscription: sub,        // raw record (custom overrides, limits, etc.)
      history,
      billing: {                // lighter billing view
        currentAmount: row.amount,
        billingCycle: row.billingCycle,
        renewalDate: sub.renewalDate,
        status: sub.status,
        paymentStatus: company.paymentStatus,
        outstanding: ['Overdue', 'Expired', 'Unpaid'].includes(company.paymentStatus),
        upcomingRenewal: sub.renewalDate,
      },
    });
  } catch (e) {
    console.error('[subscriptions.getOne]', e);
    return res.status(500).json({ error: 'Failed to load subscription.' });
  }
};

// ── PUT /api/subscriptions/:companyId — change plan / cycle / custom config ───
exports.update = async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const b = req.body || {};
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    const plan = VALID_PLANS.includes(b.plan) ? b.plan : company.plan;
    const billingCycle = VALID_CYCLES.includes(b.billingCycle) ? b.billingCycle : undefined;
    if (b.plan && !VALID_PLANS.includes(b.plan)) return res.status(400).json({ error: 'Invalid plan.' });

    const before = await getOrCreateSubscription(companyId, company.plan, company.billingCycle);
    const activeCount = await countActiveEmployees(companyId);
    const oldAmount = calcAmount(before.plan, before.billingCycle, activeCount, before.pricePerEmployee, before.discountPercent);

    // Build the update payload.
    const data = { plan };
    if (billingCycle) data.billingCycle = billingCycle;
    if (b.discountPercent !== undefined) data.discountPercent = Math.max(0, Math.min(100, Number(b.discountPercent) || 0));
    if (b.renewalDate !== undefined) data.renewalDate = b.renewalDate ? new Date(b.renewalDate) : null;
    // Custom-only fields.
    if (plan === 'Custom') {
      if (b.pricePerEmployee !== undefined) data.pricePerEmployee = Number(b.pricePerEmployee) || 0;
      if (b.employeeLimit !== undefined) data.employeeLimit = b.employeeLimit === null ? null : Number(b.employeeLimit);
      if (b.branchLimit !== undefined) data.branchLimit = b.branchLimit === null ? null : Number(b.branchLimit);
      if (b.storageMB !== undefined) data.storageMB = b.storageMB === null ? null : Number(b.storageMB);
      if (b.adminUserLimit !== undefined) data.adminUserLimit = b.adminUserLimit === null ? null : Number(b.adminUserLimit);
      if (b.customModules !== undefined) data.customModules = Array.isArray(b.customModules) ? b.customModules : [];
      if (b.customReports !== undefined) data.customReports = b.customReports; // array | "all" | null
      if (b.customFeatures !== undefined) data.customFeatures = b.customFeatures;
    } else {
      // Leaving Custom → clear the manual price so standard tier pricing applies.
      data.pricePerEmployee = null;
    }

    const after = await prisma.companySubscription.update({ where: { companyId }, data });
    const newAmount = calcAmount(after.plan, after.billingCycle, activeCount, after.pricePerEmployee, after.discountPercent);

    // ── Mirror the plan onto the Company row (single enforcement source of truth).
    // paymentStatus stays "active" so the tenant keeps portal access: Free →
    // 'Trial Active', paid → 'Paid'. (Suspension is a separate action.)
    // The billing cycle is mirrored too: the subscription owns it, but the legacy
    // Company column feeds exports and reseeds a lost subscription row, so the two
    // must never disagree. Switching Quarterly↔Yearly here is all it takes for
    // FUTURE slot purchases to price on the new cycle — they read it live.
    await prisma.company.update({
      where: { id: companyId },
      data: {
        plan: after.plan,
        paymentStatus: after.plan === 'Free' ? 'Trial Active' : 'Paid',
        billingCycle: after.billingCycle,
      },
    });

    // ── History + audit ──
    if (before.plan !== after.plan || before.billingCycle !== after.billingCycle || oldAmount !== newAmount) {
      await prisma.subscriptionHistory.create({
        data: {
          companyId, companyName: company.name, changedBy: actorOf(req),
          oldPlan: before.plan, newPlan: after.plan,
          oldCycle: before.billingCycle, newCycle: after.billingCycle,
          oldAmount, newAmount, reason: b.reason || 'Plan updated by Super Admin',
        },
      }).catch(() => {});
    }
    if (req.user?.id) {
      AuditService.logAudit(req.user.id, 'CHANGE_SUBSCRIPTION', 'Subscriptions', String(companyId), {
        company: company.name, oldPlan: before.plan, newPlan: after.plan, cycle: after.billingCycle, amount: newAmount, by: actorOf(req),
      }).catch(() => {});
    }

    const [branchCount, head] = await Promise.all([countUsedBranches(companyId), findCompanyHead(companyId)]);
    return res.json(buildRow({ ...company, plan: after.plan }, after, activeCount, branchCount, head));
  } catch (e) {
    console.error('[subscriptions.update]', e);
    return res.status(500).json({ error: 'Failed to update subscription.' });
  }
};

// ── POST /api/subscriptions/:companyId/suspend | /activate ───────────────────
async function setStatus(req, res, status, accountStatus) {
  try {
    const companyId = Number(req.params.companyId);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    await getOrCreateSubscription(companyId, company.plan, company.billingCycle);
    const sub = await prisma.companySubscription.update({ where: { companyId }, data: { status } });
    await prisma.company.update({ where: { id: companyId }, data: { accountStatus } });
    await prisma.subscriptionHistory.create({
      data: {
        companyId, companyName: company.name, changedBy: actorOf(req),
        oldPlan: sub.plan, newPlan: sub.plan, reason: (req.body && req.body.reason) || `Subscription ${status.toLowerCase()} by Super Admin`,
      },
    }).catch(() => {});
    if (req.user?.id) {
      AuditService.logAudit(req.user.id, status === 'Suspended' ? 'SUSPEND_SUBSCRIPTION' : 'ACTIVATE_SUBSCRIPTION', 'Subscriptions', String(companyId), { company: company.name, by: actorOf(req) }).catch(() => {});
    }
    return res.json({ companyId, status: sub.status, accountStatus });
  } catch (e) {
    console.error('[subscriptions.setStatus]', e);
    return res.status(500).json({ error: 'Failed to change subscription status.' });
  }
}
exports.suspend = (req, res) => setStatus(req, res, 'Suspended', 'Suspended');
exports.activate = (req, res) => setStatus(req, res, 'Active', 'Active');

// ── GET /api/subscriptions/history/all — global change history (all companies) ─
exports.allHistory = async (req, res) => {
  try {
    const rows = await prisma.subscriptionHistory.findMany({ orderBy: { id: 'desc' }, take: 500 });
    return res.json(rows);
  } catch (e) {
    console.error('[subscriptions.allHistory]', e);
    return res.status(500).json({ error: 'Failed to load subscription history.' });
  }
};

// ── GET /api/subscriptions/billing/all — global billing view (all companies) ──
// Lighter billing (per the agreed scope): amount / cycle / renewal / status /
// outstanding for every company, plus a summary. Full invoice generation deferred.
exports.billing = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      where: { ...HEAD_OFFICE_WHERE, isArchived: false },
      select: { id: true, name: true, plan: true, paymentStatus: true, adminName: true, adminEmail: true, phone: true, contactNumber: true, joinDate: true },
      orderBy: { name: 'asc' },
    });
    const ids = companies.map((c) => c.id);
    const [subs, empGroups, heads] = await Promise.all([
      prisma.companySubscription.findMany({ where: { companyId: { in: ids } } }),
      prisma.employee.groupBy({ by: ['companyId'], where: { companyId: { in: ids }, ...ACTIVE_EMPLOYEE_WHERE }, _count: { _all: true } }),
      prisma.user.findMany({ where: { companyId: { in: ids }, role: 'Company Head' }, select: { companyId: true, name: true, email: true }, orderBy: { id: 'asc' } }),
    ]);
    const subBy = new Map(subs.map((s) => [s.companyId, s]));
    const empBy = new Map(empGroups.map((g) => [g.companyId, g._count._all]));
    const headBy = new Map();
    for (const h of heads) if (!headBy.has(h.companyId)) headBy.set(h.companyId, h);
    const now = new Date();

    let billed = 0, outstanding = 0, paidCount = 0, pendingCount = 0;
    const invoices = companies.map((c) => {
      const sub = subBy.get(c.id) || { plan: c.plan || 'Free', billingCycle: 'Quarterly', status: 'Active', discountPercent: 0, pricePerEmployee: null, renewalDate: null };
      const row = buildRow(c, sub, empBy.get(c.id) || 0, 0, headBy.get(c.id));
      const isPaidPlan = row.plan !== 'Free';
      const isOutstanding = isPaidPlan && (['Overdue', 'Expired', 'Unpaid', 'Pending'].includes(c.paymentStatus) || (sub.renewalDate && new Date(sub.renewalDate) < now));
      if (isPaidPlan) { billed += row.amount; if (isOutstanding) { outstanding += row.amount; pendingCount++; } else { paidCount++; } }
      return {
        companyId: c.id, companyName: c.companyName || c.name, companyHead: row.companyHead,
        plan: row.plan, billingCycle: row.billingCycle, amount: row.amount,
        status: row.status, paymentStatus: c.paymentStatus || (isPaidPlan ? 'Paid' : 'Trial Active'),
        renewalDate: row.renewalDate, outstanding: isOutstanding,
      };
    });
    return res.json({
      summary: { totalBilled: billed, outstanding, paidCount, pendingCount, currency: 'INR' },
      invoices,
    });
  } catch (e) {
    console.error('[subscriptions.billing]', e);
    return res.status(500).json({ error: 'Failed to load billing.' });
  }
};

// ── GET /api/subscriptions/:companyId/history ────────────────────────────────
exports.history = async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const rows = await prisma.subscriptionHistory.findMany({ where: { companyId }, orderBy: { id: 'desc' }, take: 200 });
    return res.json(rows);
  } catch (e) {
    console.error('[subscriptions.history]', e);
    return res.status(500).json({ error: 'Failed to load history.' });
  }
};
