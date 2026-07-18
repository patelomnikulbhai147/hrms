// ─────────────────────────────────────────────────────────────────────────────
// PLAN ENTITLEMENTS — the single authoritative source of truth (backend) for
// which modules a subscription plan unlocks and its usage limits.
//
// Kept as a CODE MAP (not a DB table) on purpose: this install has a history of
// data loss from schema drift, so the FREE self-registration feature ships with
// ZERO schema migration. `Company.plan` (a plain string) is the only per-tenant
// input; this map turns it into entitlements.
//
// ⚠️  MIRROR: frontend/src/config/planEntitlements.ts must be kept in sync with
//     this file. Same concept, two files — the only intentional duplication.
//
// Keys in `locked` are PERMISSION KEYS (AppModules), not sidebar page ids, so a
// sub-feature that rides on a parent key (Custom Report Builder → `reports`) is
// locked together with its parent automatically.
// ─────────────────────────────────────────────────────────────────────────────

// Premium modules a FREE workspace cannot use. Everything NOT listed here is
// unlocked (dashboard, employees, attendance, leaves, payroll, documents,
// company-profile, settings, users, billing, companies, audit).
//
// NOTE: the Reports MODULE is intentionally NOT locked — FREE users can open
// Reports, but only a subset of individual reports is generatable (see
// FREE_ALLOWED_REPORTS + isReportAllowed). The Custom Report Builder is a
// separate premium module locked via the synthetic 'custom-reports' key (it
// shares the 'reports' permission key, so it can't be locked by that alone).
const FREE_LOCKED = [
  'communication',   // Communication Center
  'tasks',           // Task Manager
  'tenders',         // Tender Management
  'contracts',       // Contract Management
  'invoicing',       // Invoice Management
  'loans',           // Employee Loans (Finance & Compliance)
  'compliance',      // Statutory Compliance (Finance & Compliance)
  'custom-reports',  // Custom Report Builder (synthetic gate key; NOT an AppModules perm)
];

// Sidebar PAGE ids locked for FREE that can't be expressed via a permission key
// (Custom Report Builder's permission is `reports`, which is unlocked). The
// frontend sidebar / route-guard lock these page ids in addition to `locked`.
const FREE_LOCKED_PAGES = ['custom-report-builder'];

// FREE plan: the ONLY compliance reports that may be generated. Keys are the
// literal REPORTS registry keys in complianceReportController.js. Every other
// report is visible but returns 403 on generate. To change what FREE can run,
// edit THIS list (and its frontend mirror) — no other code changes needed.
const FREE_ALLOWED_REPORTS = [
  'salary_register',  // Salary Register
  'salary_slip',      // Salary Slip
  'payroll_summary',  // Payroll Summary
  'pf_register',      // PF Report
  'leave_register',   // Leave Report
  'esi_register',     // ESIC Report
  'bonus_register',   // Bonus Report
  'wage_register',    // Wage Report
];

// name → entitlements. Paid tiers unlock everything (locked: [], allowedReports:
// null = ALL reports), preserving existing behavior exactly. Only FREE restricts.
const PLAN_ENTITLEMENTS = {
  Free: {
    locked: FREE_LOCKED,
    lockedPages: FREE_LOCKED_PAGES,
    allowedReports: FREE_ALLOWED_REPORTS, // an allow-list → all others locked
    limits: { maxEmployees: 25, maxBranches: 1, maxAdminUsers: 1, storageMB: 500 },
  },
  Starter: { locked: [], lockedPages: [], allowedReports: null, limits: { maxEmployees: 100, maxBranches: 1, maxAdminUsers: 3, storageMB: 5120 } },
  Professional: { locked: [], lockedPages: [], allowedReports: null, limits: { maxEmployees: 1000, maxBranches: 5, maxAdminUsers: 15, storageMB: 51200 } },
  Enterprise: { locked: [], lockedPages: [], allowedReports: null, limits: { maxEmployees: -1, maxBranches: 999, maxAdminUsers: -1, storageMB: -1 } },
};

// Unknown / unset plan → treat as UNRESTRICTED. A paid customer whose plan string
// doesn't match must never be accidentally locked out; only an explicit "Free"
// (or any future plan we add to the map with a `locked` list) restricts access.
// allowedReports: null means "all reports allowed".
const DEFAULT_ENTITLEMENTS = { locked: [], lockedPages: [], allowedReports: null, limits: {} };

function normalizePlan(plan) {
  return String(plan || '').trim();
}

function getEntitlements(plan) {
  return PLAN_ENTITLEMENTS[normalizePlan(plan)] || DEFAULT_ENTITLEMENTS;
}

// Is a given permission key locked for this plan?
function isModuleLocked(plan, permKey) {
  return getEntitlements(plan).locked.includes(permKey);
}

// The list of locked permission keys for a plan (handed to the frontend so the
// sidebar/route-guard have an authoritative copy alongside their own mirror).
function getLockedModules(plan) {
  return [...getEntitlements(plan).locked];
}

// Sidebar page ids locked for a plan beyond the permission-key locks (e.g. Custom
// Report Builder, which shares the unlocked `reports` permission key).
function getLockedPages(plan) {
  return [...(getEntitlements(plan).lockedPages || [])];
}

function isPageLocked(plan, pageId) {
  return getLockedPages(plan).includes(pageId);
}

// Per-report gate. `allowedReports === null` (paid/unknown plans) → every report
// is allowed. Otherwise only the listed report keys may be generated.
function isReportAllowed(plan, reportKey) {
  const allowed = getEntitlements(plan).allowedReports;
  if (!allowed) return true;          // null/undefined → all reports allowed
  return allowed.includes(reportKey);
}

// The allow-list for a plan (null = all). Handed to the frontend as an
// authoritative copy for report-card locking.
function getAllowedReports(plan) {
  const allowed = getEntitlements(plan).allowedReports;
  return allowed ? [...allowed] : null;
}

module.exports = {
  PLAN_ENTITLEMENTS,
  getEntitlements,
  isModuleLocked,
  getLockedModules,
  getLockedPages,
  isPageLocked,
  isReportAllowed,
  getAllowedReports,
};
