// ─────────────────────────────────────────────────────────────────────────────
// PLAN MASTER STORE — the single, EDITABLE source of truth for every subscription
// plan's modules, reports, limits, features and pricing.
//
// File-backed (backend/data/planDefinitions.json), NOT a DB table — on purpose.
// This install has a documented history of data loss from schema drift (see the
// header of planEntitlements.js and the FREE-registration feature), so the master
// plan config ships with ZERO schema migration and is deploy-safe. It follows the
// exact same pattern as integrationSettings.js (integrations.json).
//
// WHY THIS MATTERS: the Super Admin "Subscription Plans" page edits these records.
// The permission engine (planEntitlements.js) reads its entitlements FROM here, so
// enabling a module on the FREE plan instantly grants it to every FREE company —
// with no code change. That is the whole point of this redesign.
//
// A tiny in-memory cache makes the engine's synchronous API fast; every write
// busts it, so edits take effect on the very next request.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'planDefinitions.json');

// ── Module catalog ───────────────────────────────────────────────────────────
// Every company-facing module, keyed by its PERMISSION KEY (AppModules) — the
// same keys the sidebar/matrices and the plan middleware use. `premium: true`
// marks the modules that are actually plan-GATEABLE (a server-side plan gate is
// mounted on their routes). Core modules are always-on and cannot be disabled by
// a plan (no gate is mounted on them) — the editor shows them locked-on.
const MODULE_CATALOG = [
  { key: 'dashboard', label: 'Dashboard', premium: false },
  { key: 'employees', label: 'Employees', premium: false },
  { key: 'attendance', label: 'Attendance', premium: false },
  { key: 'leaves', label: 'Leave Management', premium: false },
  { key: 'payroll', label: 'Payroll', premium: false },
  { key: 'documents', label: 'Documents', premium: false },
  { key: 'reports', label: 'Reports', premium: false }, // module open; per-report gating below
  { key: 'company-profile', label: 'Company Profile', premium: false },
  { key: 'settings', label: 'Settings', premium: false },
  { key: 'invoicing', label: 'Invoice Management', premium: true },
  { key: 'loans', label: 'Employee Loans', premium: true },
  { key: 'compliance', label: 'Statutory Compliance', premium: true },
  { key: 'custom-reports', label: 'Custom Report Builder', premium: true },
  { key: 'communication', label: 'Communication Center', premium: true },
  { key: 'tasks', label: 'Task Manager', premium: true },
  { key: 'tenders', label: 'Tender Management', premium: true },
  { key: 'contracts', label: 'Contract Management', premium: true },
  { key: 'custom-domain', label: 'Custom Domain (Beta)', premium: true },
];

// The plan-GATEABLE (premium) module keys — the ONLY ones a plan can lock/unlock.
const PREMIUM_MODULES = MODULE_CATALOG.filter((m) => m.premium).map((m) => m.key);

// Sidebar page ids that ride an otherwise-unlocked permission key and therefore
// need their own lock. custom-report-builder rides on the `reports` perm, so it
// is locked whenever the synthetic 'custom-reports' module is not enabled.
const PAGE_FOR_MODULE = { 'custom-reports': 'custom-report-builder', 'custom-domain': 'custom-domain' };

// FREE plan's default allow-list of generatable reports (keys are the literal
// report catalog keys in complianceReportController). Seed value only — editable.
const FREE_ALLOWED_REPORTS = [
  'salary_register', 'salary_slip', 'payroll_summary', 'pf_register',
  'leave_register', 'esi_register', 'bonus_register', 'wage_register',
];

// Feature flags a plan can toggle (forward-looking; surfaced to the profile).
const FEATURE_CATALOG = [
  { key: 'aiEnabled', label: 'AI Assistant' },
  { key: 'biometric', label: 'Biometric Attendance' },
  { key: 'payroll', label: 'Payroll Processing' },
  { key: 'geoAttendance', label: 'Geo Attendance' },
  { key: 'shiftManagement', label: 'Shift Management' },
  { key: 'customBranding', label: 'Custom Branding' },
  { key: 'whiteLabel', label: 'White Label' },
  { key: 'communicationCenter', label: 'Communication Center' },
  { key: 'documentOcr', label: 'Document OCR' },
];

// Usage limits a plan can configure (-1 = unlimited). Surfaced in the editor.
const LIMIT_CATALOG = [
  { key: 'employeeLimit', label: 'Employees' },
  { key: 'branchLimit', label: 'Branches' },
  { key: 'adminUserLimit', label: 'Admin Users' },
  { key: 'storageMB', label: 'Storage (MB)' },
  { key: 'apiCalls', label: 'API Calls / month' },
  { key: 'whatsappMessages', label: 'WhatsApp Messages / month' },
  { key: 'documents', label: 'Documents' },
  { key: 'mobileUsers', label: 'Mobile Users' },
];

const allFeaturesOn = () => FEATURE_CATALOG.reduce((a, f) => ((a[f.key] = true), a), {});
const freeFeatures = () => ({
  aiEnabled: false, biometric: false, payroll: true, geoAttendance: false,
  shiftManagement: false, customBranding: false, whiteLabel: false,
  communicationCenter: false, documentOcr: false,
});

// ── Seed plans (mirror the historical code map exactly) ──────────────────────
// enabledModules = the PREMIUM keys this plan unlocks (core modules are implicit).
// enabledReports = 'all' | array of report keys.
function seedPlans() {
  return [
    {
      key: 'Free', name: 'Free', description: 'Free forever — core HR, attendance & payroll for small teams.',
      status: 'Active', isSystem: true, color: '#64748b', displayOrder: 1,
      employeeMin: 0, employeeMax: 100, priceQuarterly: 0, priceYearly: 0, discountPercent: 0,
      enabledModules: [], enabledReports: FREE_ALLOWED_REPORTS.slice(),
      limits: { employeeLimit: 100, branchLimit: 1, adminUserLimit: 1, storageMB: 500, apiCalls: -1, whatsappMessages: 0, documents: 100, mobileUsers: 100 },
      features: freeFeatures(),
    },
    {
      key: 'Starter', name: 'Starter', description: 'Everything unlocked for growing teams.',
      status: 'Active', isSystem: true, color: '#3b82f6', displayOrder: 2,
      employeeMin: 0, employeeMax: 100, priceQuarterly: 25, priceYearly: 20, discountPercent: 0,
      includedVerificationCredits: 100,
      enabledModules: PREMIUM_MODULES.slice(), enabledReports: 'all',
      limits: { employeeLimit: 100, branchLimit: 1, adminUserLimit: 3, storageMB: 5120, apiCalls: -1, whatsappMessages: 1000, documents: -1, mobileUsers: 100 },
      features: allFeaturesOn(),
    },
    {
      key: 'Professional', name: 'Professional', description: 'Multi-branch, higher limits, full compliance.',
      status: 'Active', isSystem: true, color: '#8b5cf6', displayOrder: 3,
      employeeMin: 101, employeeMax: 500, priceQuarterly: 20, priceYearly: 16, discountPercent: 0,
      includedVerificationCredits: 250,
      enabledModules: PREMIUM_MODULES.slice(), enabledReports: 'all',
      limits: { employeeLimit: 1000, branchLimit: 5, adminUserLimit: 15, storageMB: 51200, apiCalls: -1, whatsappMessages: -1, documents: -1, mobileUsers: 1000 },
      features: allFeaturesOn(),
    },
    {
      key: 'Enterprise', name: 'Enterprise', description: 'Unlimited scale, white-label and every feature.',
      status: 'Active', isSystem: true, color: '#4f46e5', displayOrder: 4,
      employeeMin: 500, employeeMax: -1, priceQuarterly: 15, priceYearly: 12, discountPercent: 0,
      includedVerificationCredits: 500,
      enabledModules: PREMIUM_MODULES.slice(), enabledReports: 'all',
      limits: { employeeLimit: -1, branchLimit: -1, adminUserLimit: -1, storageMB: -1, apiCalls: -1, whatsappMessages: -1, documents: -1, mobileUsers: -1 },
      features: allFeaturesOn(),
    },
    {
      key: 'Custom', name: 'Custom', description: 'Bespoke pricing & entitlements — configured per company.',
      status: 'Active', isSystem: true, color: '#d97706', displayOrder: 5, custom: true,
      employeeMin: 0, employeeMax: -1, priceQuarterly: 0, priceYearly: 0, discountPercent: 0,
      enabledModules: PREMIUM_MODULES.slice(), enabledReports: 'all',
      limits: { employeeLimit: -1, branchLimit: -1, adminUserLimit: -1, storageMB: -1, apiCalls: -1, whatsappMessages: -1, documents: -1, mobileUsers: -1 },
      features: allFeaturesOn(),
    },
  ];
}

// ── Global platform settings (Plan Settings tab) ─────────────────────────────
const DEFAULT_SETTINGS = {
  defaultPlan: 'Free',
  defaultBillingCycle: 'Quarterly',
  currency: 'INR',
  taxPercent: 18,
  gstNumber: '',
  invoicePrefix: 'INV',
  renewalReminderDays: 7,
  gracePeriodDays: 7,
  autoSuspendOnExpiry: false,
  // Employee slot add-on pricing matrix (per slot, per billing cycle). The
  // applicable tier is chosen by the company's employee limit AFTER adding the
  // requested slots; `upTo: null` = the open-ended top tier. Editable via the
  // Plan Settings endpoint — never hardcode these rates in business logic.
  slotPricingTiers: [
    { upTo: 100, quarterly: 25, yearly: 20 },
    { upTo: 500, quarterly: 20, yearly: 16 },
    { upTo: null, quarterly: 15, yearly: 12 },
  ],
};

// ── File IO + cache ──────────────────────────────────────────────────────────
let _cache = null; // { plans: [...], settings: {...} }

function normalizePlan(p) {
  const feat = { ...allFeaturesOn(), ...(p.features || {}) }; // fill missing feature flags
  return {
    key: String(p.key),
    name: p.name || p.key,
    description: p.description || '',
    status: p.status === 'Inactive' ? 'Inactive' : 'Active',
    isSystem: !!p.isSystem,
    custom: !!p.custom,
    color: p.color || '#64748b',
    displayOrder: Number.isFinite(p.displayOrder) ? p.displayOrder : 99,
    employeeMin: Number(p.employeeMin) || 0,
    employeeMax: p.employeeMax === undefined || p.employeeMax === null ? -1 : Number(p.employeeMax),
    priceQuarterly: Number(p.priceQuarterly) || 0,
    priceYearly: Number(p.priceYearly) || 0,
    discountPercent: Number(p.discountPercent) || 0,
    // Verification credits granted on every paid subscription purchase/renewal.
    includedVerificationCredits: Math.max(0, Number(p.includedVerificationCredits) || 0),
    // Only premium keys are meaningful; keep the intersection so a stale/edited
    // list can never accidentally "enable" a non-gateable key.
    enabledModules: Array.isArray(p.enabledModules) ? p.enabledModules.filter((k) => PREMIUM_MODULES.includes(k)) : [],
    enabledReports: p.enabledReports === 'all' || p.enabledReports == null ? 'all' : (Array.isArray(p.enabledReports) ? p.enabledReports : 'all'),
    limits: { ...(p.limits || {}) },
    features: feat,
  };
}

function readRaw() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const plans = Array.isArray(parsed.plans) ? parsed.plans.map(normalizePlan) : seedPlans().map(normalizePlan);
    const settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
    return { plans, settings };
  } catch (_) {
    // First boot / missing file → seed from the historical code map and persist.
    const seeded = { plans: seedPlans().map(normalizePlan), settings: { ...DEFAULT_SETTINGS } };
    writeRaw(seeded);
    return seeded;
  }
}

function writeRaw(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[planStore] failed to persist:', e.message);
    return false;
  }
}

function load() {
  if (!_cache) _cache = readRaw();
  return _cache;
}

/** Force the cache to re-read from disk (call after any external file change). */
function reload() { _cache = null; return load(); }

// ── Public API ───────────────────────────────────────────────────────────────
function getPlans() { return load().plans.slice().sort((a, b) => a.displayOrder - b.displayOrder); }

function getPlan(key) {
  const k = String(key || '').trim();
  return load().plans.find((p) => p.key.toLowerCase() === k.toLowerCase()) || null;
}

function getSettings() { return { ...load().settings }; }

function saveSettings(patch) {
  const data = load();
  data.settings = { ...DEFAULT_SETTINGS, ...data.settings, ...(patch || {}) };
  writeRaw(data);
  _cache = null; // bust
  return getSettings();
}

/** Create or update a plan by key. Returns the normalized plan. */
function upsertPlan(input) {
  const data = load();
  const norm = normalizePlan(input);
  const idx = data.plans.findIndex((p) => p.key.toLowerCase() === norm.key.toLowerCase());
  if (idx >= 0) {
    // Preserve immutable flags on system plans (can't be un-systemed or re-keyed).
    norm.isSystem = data.plans[idx].isSystem || norm.isSystem;
    if (data.plans[idx].isSystem) { norm.key = data.plans[idx].key; norm.custom = data.plans[idx].custom; }
    data.plans[idx] = norm;
  } else {
    data.plans.push(norm);
  }
  writeRaw(data);
  _cache = null; // bust so the engine sees the change on the next request
  return norm;
}

/** Delete a NON-system plan by key. Returns false if missing or a system plan. */
function deletePlan(key) {
  const data = load();
  const idx = data.plans.findIndex((p) => p.key.toLowerCase() === String(key).toLowerCase());
  if (idx < 0 || data.plans[idx].isSystem) return false;
  data.plans.splice(idx, 1);
  writeRaw(data);
  _cache = null;
  return true;
}

module.exports = {
  MODULE_CATALOG,
  PREMIUM_MODULES,
  PAGE_FOR_MODULE,
  FEATURE_CATALOG,
  LIMIT_CATALOG,
  FREE_ALLOWED_REPORTS,
  DEFAULT_SETTINGS,
  getPlans,
  getPlan,
  getSettings,
  saveSettings,
  upsertPlan,
  deletePlan,
  reload,
  seedPlans,
};
