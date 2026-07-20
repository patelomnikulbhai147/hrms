// ─────────────────────────────────────────────────────────────────────────────
// PLAN ENTITLEMENTS — the single authoritative resolver (backend) for which
// modules/reports a subscription plan unlocks, its usage limits and its pricing.
//
// ⚠️  PLANS ARE NO LONGER HARDCODED. The plan definitions live in the editable
//     master store (services/planStore.js → data/planDefinitions.json), which the
//     Super Admin "Subscription Plans" page edits. This module turns a plan (a
//     plain `Company.plan` string) into concrete entitlements by reading that
//     store — so enabling a module on, say, the FREE plan instantly grants it to
//     every FREE company with NO code change. The static maps below remain ONLY
//     as a seed/fallback for when the store can't be read.
//
// The API stays fully SYNCHRONOUS (the store is file-backed + cached) so existing
// callers (subscriptionMiddleware, attachPlanInfo, report gate) are unchanged.
//
// ⚠️  MIRROR: frontend/src/config/planEntitlements.ts is the presentation-only
//     mirror; the backend is authoritative (attachPlanInfo hands the resolved
//     lists to the client so the mirror rarely has to guess).
//
// Keys in `locked` are PERMISSION KEYS (AppModules), not sidebar page ids.
// ─────────────────────────────────────────────────────────────────────────────
const store = require('./planStore');

const { PREMIUM_MODULES, PAGE_FOR_MODULE, FREE_ALLOWED_REPORTS } = store;

// ── Static seed/fallback (used only if the store is unreadable) ───────────────
const FREE_LOCKED = PREMIUM_MODULES.slice(); // FREE unlocks none of the premium set
const FREE_LOCKED_PAGES = ['custom-report-builder'];

const PLAN_ENTITLEMENTS = {
  Free: { locked: FREE_LOCKED, lockedPages: FREE_LOCKED_PAGES, allowedReports: FREE_ALLOWED_REPORTS, limits: { maxEmployees: 30, maxBranches: 1, maxAdminUsers: 1, storageMB: 500 } },
  Starter: { locked: [], lockedPages: [], allowedReports: null, limits: { maxEmployees: 100, maxBranches: 1, maxAdminUsers: 3, storageMB: 5120 } },
  Professional: { locked: [], lockedPages: [], allowedReports: null, limits: { maxEmployees: 1000, maxBranches: 5, maxAdminUsers: 15, storageMB: 51200 } },
  Enterprise: { locked: [], lockedPages: [], allowedReports: null, limits: { maxEmployees: -1, maxBranches: 999, maxAdminUsers: -1, storageMB: -1 } },
  Custom: { locked: [], lockedPages: [], allowedReports: null, limits: {} },
};

// Legacy pricing map — kept as the fallback if a plan def lacks explicit prices.
const PLAN_PRICING = {
  Free: { quarterly: 0, yearly: 0 },
  Starter: { quarterly: 25, yearly: 20 },
  Professional: { quarterly: 20, yearly: 16 },
  Enterprise: { quarterly: 15, yearly: 12 },
  Custom: null,
};

const PLAN_META = {
  Free: { label: 'Free', range: 'Up to 100 employees', quarterly: 0, yearly: 0 },
  Starter: { label: 'Starter', range: '0–100 employees', quarterly: 25, yearly: 20, yearlySavings: '20%' },
  Professional: { label: 'Professional', range: '101–500 employees', quarterly: 20, yearly: 16, yearlySavings: '20%' },
  Enterprise: { label: 'Enterprise', range: '500+ employees', quarterly: 15, yearly: 12, yearlySavings: '20%' },
  Custom: { label: 'Custom', range: 'Manual pricing', custom: true },
};

const DEFAULT_ENTITLEMENTS = { locked: [], lockedPages: [], allowedReports: null, limits: {} };

function normalizePlan(plan) { return String(plan || '').trim(); }

const cycleKey = (cycle) => (String(cycle || '').toLowerCase() === 'yearly' ? 'yearly' : 'quarterly');

// Convert an editable plan DEFINITION (store shape) into runtime entitlements.
// enabledModules holds the ENABLED premium keys → everything premium NOT enabled
// is locked; a locked module that owns a sidebar page also locks that page.
function defToEntitlements(def) {
  const enabled = new Set(Array.isArray(def.enabledModules) ? def.enabledModules : []);
  const locked = PREMIUM_MODULES.filter((m) => !enabled.has(m));
  const lockedPages = [];
  for (const m of locked) { const pg = PAGE_FOR_MODULE[m]; if (pg) lockedPages.push(pg); }
  const allowedReports = def.enabledReports === 'all' || def.enabledReports == null ? null : (Array.isArray(def.enabledReports) ? def.enabledReports : null);
  const lim = def.limits || {};
  return {
    locked,
    lockedPages,
    allowedReports,
    limits: {
      maxEmployees: lim.employeeLimit ?? -1,
      maxBranches: lim.branchLimit ?? -1,
      maxAdminUsers: lim.adminUserLimit ?? -1,
      storageMB: lim.storageMB ?? -1,
    },
  };
}

// Entitlements for a plan NAME — from the editable store, else the static seed.
function getEntitlements(plan) {
  const p = normalizePlan(plan);
  try {
    const def = store.getPlan(p);
    if (def) return defToEntitlements(def);
  } catch (_) { /* fall through to static seed */ }
  return PLAN_ENTITLEMENTS[p] || DEFAULT_ENTITLEMENTS;
}

// THE centralized resolver. A CUSTOM plan's entitlements come from the company's
// CompanySubscription record (per-company allow-lists); every other plan resolves
// from the editable master store. This is the single place plan → entitlements is
// decided, so no module ever hardcodes `if (plan === 'Free')`.
function resolveEntitlements(plan, sub) {
  const p = normalizePlan(plan);
  if (p === 'Custom' && sub) {
    const enabled = new Set(Array.isArray(sub.customModules) ? sub.customModules : []);
    const locked = PREMIUM_MODULES.filter((m) => !enabled.has(m));
    const lockedPages = [];
    for (const m of locked) { const pg = PAGE_FOR_MODULE[m]; if (pg) lockedPages.push(pg); }
    const cr = sub.customReports;
    const allowedReports = (cr == null || cr === 'all') ? null : (Array.isArray(cr) ? cr : []);
    return {
      locked,
      lockedPages,
      allowedReports,
      limits: {
        maxEmployees: sub.employeeLimit ?? -1,
        maxBranches: sub.branchLimit ?? -1,
        maxAdminUsers: sub.adminUserLimit ?? -1,
        storageMB: sub.storageMB ?? -1,
      },
    };
  }
  return getEntitlements(plan);
}

// ── Pricing engine (per-employee, per billing period) ────────────────────────
// Rate is per employee PER billing period; the master store's plan prices win,
// falling back to the legacy code map. Custom uses the manual per-company rate.
function pricePerEmployee(plan, cycle, customRate) {
  const p = normalizePlan(plan);
  if (p === 'Custom') return Number(customRate) || 0;
  try {
    const def = store.getPlan(p);
    if (def) return Number(cycleKey(cycle) === 'yearly' ? def.priceYearly : def.priceQuarterly) || 0;
  } catch (_) { /* fall through */ }
  const tier = PLAN_PRICING[p];
  return tier ? Number(tier[cycleKey(cycle)]) || 0 : 0;
}

// The authoritative amount for a subscription: employeeCount × rate − discount.
function calcAmount(plan, cycle, employeeCount, customRate, discountPercent) {
  const rate = pricePerEmployee(plan, cycle, customRate);
  const gross = (Number(employeeCount) || 0) * rate;
  const disc = Math.round(gross * ((Number(discountPercent) || 0) / 100));
  return Math.max(0, gross - disc);
}

// Plan catalog for the Super Admin Change-Plan UI — from the editable store.
function getPlanCatalog() {
  try {
    return store.getPlans().map((p) => ({
      key: p.key, label: p.name, range: rangeLabel(p),
      quarterly: p.priceQuarterly, yearly: p.priceYearly,
      custom: !!p.custom, color: p.color, status: p.status,
    }));
  } catch (_) {
    return Object.entries(PLAN_META).map(([key, m]) => ({ key, ...m }));
  }
}

function rangeLabel(p) {
  if (p.custom) return 'Manual pricing';
  const max = p.employeeMax === -1 ? '∞' : p.employeeMax;
  return `${p.employeeMin}–${max} employees`;
}

function isModuleLocked(plan, permKey, sub) { return resolveEntitlements(plan, sub).locked.includes(permKey); }
function getLockedModules(plan, sub) { return [...resolveEntitlements(plan, sub).locked]; }
function getLockedPages(plan, sub) { return [...(resolveEntitlements(plan, sub).lockedPages || [])]; }
function isPageLocked(plan, pageId, sub) { return getLockedPages(plan, sub).includes(pageId); }

function isReportAllowed(plan, reportKey, sub) {
  const allowed = resolveEntitlements(plan, sub).allowedReports;
  if (!allowed) return true;
  return allowed.includes(reportKey);
}

function getAllowedReports(plan, sub) {
  const allowed = resolveEntitlements(plan, sub).allowedReports;
  return allowed ? [...allowed] : null;
}

module.exports = {
  PLAN_ENTITLEMENTS,
  PREMIUM_MODULES,
  PLAN_PRICING,
  PLAN_META,
  getEntitlements,
  resolveEntitlements,
  isModuleLocked,
  getLockedModules,
  getLockedPages,
  isPageLocked,
  isReportAllowed,
  getAllowedReports,
  pricePerEmployee,
  calcAmount,
  getPlanCatalog,
};
