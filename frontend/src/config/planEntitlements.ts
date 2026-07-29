// ─────────────────────────────────────────────────────────────────────────────
// PLAN ENTITLEMENTS (frontend mirror).
//
// ⚠️  This is the MIRROR of backend/src/services/planEntitlements.js — keep the
//     two in sync. The backend copy is authoritative and enforced on every API
//     call; this copy only drives presentation (sidebar locking + route guard).
//
// Keyed by PERMISSION KEY (AppModules), not sidebar page id, so a sub-feature
// that rides on a parent key (Custom Report Builder → `reports`) is locked with
// its parent automatically.
// ─────────────────────────────────────────────────────────────────────────────
import type { AppModules } from '@/pages/Login';

// Synthetic gate keys (not real AppModules permissions) used to lock modules that
// share an otherwise-unlocked permission key — e.g. Custom Report Builder rides on
// the `reports` permission, which is unlocked for FREE.
type LockKey = AppModules | 'custom-reports' | 'custom-domain';

export interface PlanEntitlements {
  locked: LockKey[];
  lockedPages: string[];              // sidebar page ids locked beyond permission keys
  allowedReports: string[] | null;    // report-key allow-list; null = ALL reports
  limits: {
    maxEmployees: number;   // -1 = unlimited
    maxBranches: number;
    maxAdminUsers: number;  // -1 = unlimited
    storageMB: number;      // -1 = unlimited
  };
}

// Premium modules a FREE workspace cannot use. NOTE: the Reports MODULE is NOT
// locked — FREE users open Reports but can generate only FREE_ALLOWED_REPORTS
// (per-report gating below). Custom Report Builder is locked via 'custom-reports'.
const FREE_LOCKED: LockKey[] = [
  'communication',   // Communication Center
  'tasks',           // Task Manager
  'tenders',         // Tender Management
  'contracts',       // Contract Management
  'invoicing',       // Invoice Management
  'loans',           // Employee Loans (Finance & Compliance)
  'compliance',      // Statutory Compliance (Finance & Compliance)
  'custom-reports',  // Custom Report Builder (synthetic key; shares `reports` perm)
  'custom-domain',   // White Label & Custom Domain (synthetic key; shares `settings` perm)
];

// Sidebar page ids locked for FREE that a permission key can't express.
const FREE_LOCKED_PAGES = ['custom-report-builder', 'custom-domain'];

// ⚠️  MIRROR of backend FREE_ALLOWED_REPORTS — the ONLY compliance reports a FREE
//     plan may generate. Keys are the literal report catalog keys. Keep in sync.
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

export const PLAN_ENTITLEMENTS: Record<string, PlanEntitlements> = {
  Free: { locked: FREE_LOCKED, lockedPages: FREE_LOCKED_PAGES, allowedReports: FREE_ALLOWED_REPORTS, limits: { maxEmployees: 100, maxBranches: 1, maxAdminUsers: 1, storageMB: 500 } },
  // Custom Domain is available on EVERY paid plan (only Free locks it); the SA
  // can still disable it per-plan in the editor — the backend lists then win.
  Starter: { locked: [], lockedPages: [], allowedReports: null, limits: { maxEmployees: 100, maxBranches: 1, maxAdminUsers: 3, storageMB: 5120 } },
  Professional: { locked: [], lockedPages: [], allowedReports: null, limits: { maxEmployees: 1000, maxBranches: 5, maxAdminUsers: 15, storageMB: 51200 } },
  Enterprise: { locked: [], lockedPages: [], allowedReports: null, limits: { maxEmployees: -1, maxBranches: 999, maxAdminUsers: -1, storageMB: -1 } },
  // Custom's real entitlements are per-company and come from the backend
  // (authProfile.lockedModules/lockedPages/allowedReports). This mirror entry is
  // only a fallback → unrestricted. Prefer the *For(user, …) helpers below.
  Custom: { locked: [], lockedPages: [], allowedReports: null, limits: { maxEmployees: -1, maxBranches: -1, maxAdminUsers: -1, storageMB: -1 } },
};

// Unknown / unset plan → UNRESTRICTED (never accidentally lock a paid customer).
const DEFAULT_ENTITLEMENTS: PlanEntitlements = { locked: [], lockedPages: [], allowedReports: null, limits: { maxEmployees: -1, maxBranches: -1, maxAdminUsers: -1, storageMB: -1 } };

export const getEntitlements = (plan?: string | null): PlanEntitlements =>
  PLAN_ENTITLEMENTS[String(plan || '').trim()] || DEFAULT_ENTITLEMENTS;

/** Is a given permission (or synthetic) key locked on this plan? */
export const isModuleLocked = (plan: string | null | undefined, permKey: LockKey): boolean =>
  getEntitlements(plan).locked.includes(permKey);

/** Is a sidebar page id locked beyond its permission key (e.g. custom-report-builder)? */
export const isPageLocked = (plan: string | null | undefined, pageId: string): boolean =>
  getEntitlements(plan).lockedPages.includes(pageId);

/** May this plan generate the given report key? (null allow-list = all reports.) */
export const isReportAllowed = (plan: string | null | undefined, reportKey: string): boolean => {
  const allowed = getEntitlements(plan).allowedReports;
  return !allowed || allowed.includes(reportKey);
};

/** Does this plan restrict reports at all (i.e. show per-report locks)? */
export const hasReportRestrictions = (plan?: string | null): boolean =>
  getEntitlements(plan).allowedReports !== null;

/** Does this plan lock ANY module (i.e. is it a restricted/free tier)? */
export const isRestrictedPlan = (plan?: string | null): boolean =>
  getEntitlements(plan).locked.length > 0 || getEntitlements(plan).allowedReports !== null;

// ── Authoritative, per-user helpers (Custom-aware) ───────────────────────────
// The backend attaches the resolved entitlements to the logged-in user on
// login/getMe (plan + lockedModules/lockedPages/allowedReports). Those are the
// source of truth (they honor CUSTOM per-company config); the plan-keyed mirror
// above is only a fallback when the backend didn't supply them (stale session).
export interface EntitledUser {
  plan?: string;
  lockedModules?: string[];
  lockedPages?: string[];
  allowedReports?: string[] | null;
}

export const moduleLockedFor = (user: EntitledUser | null | undefined, permKey: string): boolean =>
  Array.isArray(user?.lockedModules) ? user!.lockedModules!.includes(permKey) : isModuleLocked(user?.plan, permKey as LockKey);

export const pageLockedFor = (user: EntitledUser | null | undefined, pageId: string): boolean =>
  Array.isArray(user?.lockedPages) ? user!.lockedPages!.includes(pageId) : isPageLocked(user?.plan, pageId);

export const reportAllowedForUser = (user: EntitledUser | null | undefined, reportKey: string): boolean => {
  const allowed = user?.allowedReports;
  if (allowed === undefined) return isReportAllowed(user?.plan, reportKey); // no backend data → mirror
  if (allowed === null) return true;                                        // null = all reports
  return allowed.includes(reportKey);
};
