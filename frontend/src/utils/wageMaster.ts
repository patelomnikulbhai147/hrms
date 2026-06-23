// ─────────────────────────────────────────────────────────────────────────────
// State-Wise Minimum Wage master — a self-contained, frontend-only compliance
// store (localStorage). It does NOT touch payroll/attendance/employee APIs, the
// database, or any existing calculation; it is an advisory + reference layer the
// Labour Compliance settings and the employee registration wage panel read from.
//
// Per-company keyed, so each company maintains its own wage rules + branch→state
// map. Authorized users (Super Admin / Company Head / HR) edit it in Settings →
// Labour Compliance. Every rate change is recorded in the revision history.
// ─────────────────────────────────────────────────────────────────────────────

export type SkillKey = 'unskilled' | 'semiSkilled' | 'skilled' | 'highlySkilled';

// Canonical comparison key — case-insensitive, whitespace-tolerant. Company,
// branch and state names are compared via norm() so "Ahmedabad", "AHMEDABAD",
// " ahmedabad " all resolve identically. DISPLAY names are never altered; only
// the comparison/lookup key is normalized.
export const norm = (v?: string | null): string => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// Master list of Indian states/UTs for the manual state-selection fallback, so a
// user can always pick a state even when no branch→state mapping exists.
export const INDIAN_STATES: string[] = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh',
  'Andaman and Nicobar Islands', 'Dadra and Nagar Haveli and Daman and Diu', 'Lakshadweep',
];

export const SKILLS: { key: SkillKey; label: string }[] = [
  { key: 'unskilled', label: 'Unskilled' },
  { key: 'semiSkilled', label: 'Semi Skilled' },
  { key: 'skilled', label: 'Skilled' },
  { key: 'highlySkilled', label: 'Highly Skilled' },
];

export type WageRates = Record<SkillKey, number>;

export interface StateWage {
  id: string;
  state: string;
  rates: WageRates;          // ₹ per DAY (the labour-law basis)
  effectiveDate: string;     // ISO date the rule takes effect
  active: boolean;
  updatedAt: string;
}

export interface WageRevision {
  id: string;
  state: string;
  skill: SkillKey;
  skillLabel: string;
  oldRate: number;
  newRate: number;
  effectiveDate: string;
  changedBy: string;
  reason: string;
  at: string;
}

export interface WageSettings {
  // Maps a branch (by its branchLocation / name) to a state, since branches don't
  // store a state. Used to auto-resolve the applicable wage rule for an employee.
  branchStateMap: Record<string, string>;
  allowBelowMinimumOverride: boolean;   // when true, below-minimum wages can be saved with a reason
  enforceCompliance: boolean;           // when true, show compliance warnings
}

export interface WageOverrideLog {
  id: string;
  employeeName: string;
  branch: string;
  state: string;
  skill: SkillKey;
  governmentMinimum: number;
  enteredWage: number;
  wageType: string;
  reason: string;
  overriddenBy: string;
  at: string;
  event?: 'below_minimum' | 'manual_state';   // defaults to below_minimum for legacy entries
  autoState?: string;                          // the auto-mapped state at the time (for manual_state events)
}

const K = (base: string, companyId: string) => `hrms_${base}_${companyId || 'default'}`;
const read = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};
const write = (key: string, val: unknown) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage off */ } };

// Seed example states (matches the labour-law illustration). Used the first time
// a company opens the module; fully editable afterwards.
const SEED: Omit<StateWage, 'id' | 'updatedAt'>[] = [
  { state: 'Gujarat', rates: { unskilled: 550, semiSkilled: 650, skilled: 850, highlySkilled: 1200 }, effectiveDate: '2026-04-01', active: true },
  { state: 'Maharashtra', rates: { unskilled: 600, semiSkilled: 700, skilled: 950, highlySkilled: 1300 }, effectiveDate: '2026-04-01', active: true },
  { state: 'Delhi', rates: { unskilled: 700, semiSkilled: 850, skilled: 1100, highlySkilled: 1500 }, effectiveDate: '2026-04-01', active: true },
  { state: 'Karnataka', rates: { unskilled: 580, semiSkilled: 680, skilled: 900, highlySkilled: 1250 }, effectiveDate: '2026-04-01', active: true },
  { state: 'Tamil Nadu', rates: { unskilled: 560, semiSkilled: 660, skilled: 870, highlySkilled: 1220 }, effectiveDate: '2026-04-01', active: true },
];

let _idc = 0;
const newId = () => `wm-${Date.now().toString(36)}-${(_idc++).toString(36)}`;

export function getWageMaster(companyId: string): StateWage[] {
  const key = K('state_wage_master', companyId);
  const existing = read<StateWage[] | null>(key, null);
  if (existing && Array.isArray(existing)) return existing;
  const seeded: StateWage[] = SEED.map(s => ({ ...s, id: newId(), updatedAt: new Date().toISOString() }));
  write(key, seeded);
  return seeded;
}
export function saveWageMaster(companyId: string, rows: StateWage[]): void { write(K('state_wage_master', companyId), rows); }

export function getRevisions(companyId: string): WageRevision[] { return read<WageRevision[]>(K('wage_revisions', companyId), []); }
export function addRevisions(companyId: string, revs: WageRevision[]): void {
  if (!revs.length) return;
  const all = [...revs, ...getRevisions(companyId)].slice(0, 500);
  write(K('wage_revisions', companyId), all);
}
export const makeRevision = (r: Omit<WageRevision, 'id' | 'at'>): WageRevision => ({ ...r, id: newId(), at: new Date().toISOString() });

const DEFAULT_SETTINGS: WageSettings = { branchStateMap: {}, allowBelowMinimumOverride: true, enforceCompliance: true };
export function getSettings(companyId: string): WageSettings { return { ...DEFAULT_SETTINGS, ...read<Partial<WageSettings>>(K('wage_settings', companyId), {}) }; }
export function saveSettings(companyId: string, s: WageSettings): void { write(K('wage_settings', companyId), s); }

export function getOverrideLog(companyId: string): WageOverrideLog[] { return read<WageOverrideLog[]>(K('wage_overrides', companyId), []); }
export function logOverride(companyId: string, entry: Omit<WageOverrideLog, 'id' | 'at'>): void {
  const all = [{ event: 'below_minimum' as const, ...entry, id: newId(), at: new Date().toISOString() }, ...getOverrideLog(companyId)].slice(0, 500);
  write(K('wage_overrides', companyId), all);
}

/** Record a manual state selection (when auto-mapping was absent or overridden). */
export function logStateOverride(companyId: string, entry: { employeeName?: string; branch?: string; autoState?: string; state: string; selectedBy: string }): void {
  logOverride(companyId, {
    employeeName: entry.employeeName || '—', branch: entry.branch || '—', state: entry.state,
    skill: 'unskilled', governmentMinimum: 0, enteredWage: 0, wageType: '—',
    reason: entry.autoState ? `State manually changed from "${entry.autoState}" to "${entry.state}".` : `State manually selected: "${entry.state}" (no branch mapping).`,
    overriddenBy: entry.selectedBy, event: 'manual_state', autoState: entry.autoState || '',
  });
}

/**
 * Resolve the state for a branch via the configured map. Matching is
 * case-insensitive and whitespace-tolerant (norm), with a partial fallback so
 * "Ahmedabad Branch" still resolves a map keyed by "Ahmedabad" (and vice-versa).
 * Returns '' when nothing matches — callers then offer manual state selection.
 */
export function resolveStateForBranch(companyId: string, branch?: string): string {
  if (!branch) return '';
  const map = getSettings(companyId).branchStateMap || {};
  const nb = norm(branch);
  // 1) exact normalized match
  const exact = Object.keys(map).find(k => norm(k) === nb);
  if (exact) return map[exact];
  // 2) partial match (branch contains the mapped key, or the key contains the branch)
  const partial = Object.keys(map).find(k => { const nk = norm(k); return nk && (nb.includes(nk) || nk.includes(nb)); });
  return partial ? map[partial] : '';
}

/** Active states that have a wage rule configured, in display form (for dropdowns). */
export function listConfiguredStates(companyId: string): string[] {
  return getWageMaster(companyId).filter(r => r.active).map(r => r.state);
}

/** Export the ACTIVE wage rules as { State: { unskilled, ... } } for report generation. */
export function exportWageRules(companyId: string): Record<string, WageRates> {
  const out: Record<string, WageRates> = {};
  for (const r of getWageMaster(companyId)) { if (r.active) out[r.state] = { ...r.rates }; }
  return out;
}

/** The active minimum wage (₹/day) for a state + skill, or null if not configured. */
export function resolveMinimumWage(companyId: string, state: string, skill: SkillKey): number | null {
  if (!state || !skill) return null;
  const row = getWageMaster(companyId).find(r => r.active && norm(r.state) === norm(state));
  if (!row) return null;
  const v = row.rates[skill];
  return typeof v === 'number' && !isNaN(v) ? v : null;
}
