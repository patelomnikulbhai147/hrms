/**
 * payrollSettings — per-company Payroll & Leave POLICY configuration.
 *
 * This is a CONFIGURATION layer only. It stores the payroll schedule (lock day,
 * auto-lock, payroll period, salary payment day) and the leave-policy reference
 * quotas per company, keeps a local change-audit (who / old → new / when), and
 * broadcasts a window event so open screens can refresh. It NEVER touches payroll,
 * attendance or leave CALCULATION, GST, tax, reports or any API — it is pure
 * client-side policy state, persisted in localStorage (like the other Settings
 * engines), with zero database/schema change.
 */

export type LockDay = number | 'last'; // 1–31 or the last calendar day

export interface LeavePolicy {
  annual: number; casual: number; sick: number; paid: number;
  compOff: number; lop: number; optional: number; earned: number;
}

export interface PayrollSettingsData {
  lockDay: LockDay;          // day of month payroll becomes ready to lock
  autoLock: boolean;         // auto-lock on the configured day (vs manual)
  periodStartDay: number;    // payroll period start day (1–31)
  periodEndDay: number;      // payroll period end day (1–31)
  salaryPaymentDay: number;  // salary disbursal day (1–31)
  leavePolicy: LeavePolicy;
}

export interface SettingsAuditEntry {
  id: string;
  at: string;                // ISO timestamp
  by: string;                // actor role/name
  label: string;             // human field name
  oldValue: string;
  newValue: string;
}

// Canonical leave-type metadata — the ONE ordered list every module renders from
// (Annual · Casual · Sick · Paid · Earned · Comp Off · Optional · LOP). Prevents
// each screen keeping its own copy/labels.
export const LEAVE_FIELDS: Array<{ key: keyof LeavePolicy; label: string }> = [
  { key: 'annual', label: 'Annual Leave' },
  { key: 'casual', label: 'Casual Leave' },
  { key: 'sick', label: 'Sick Leave' },
  { key: 'paid', label: 'Paid Leave' },
  { key: 'earned', label: 'Earned Leave' },
  { key: 'compOff', label: 'Comp Off' },
  { key: 'optional', label: 'Optional Leave' },
  { key: 'lop', label: 'LOP' },
];

/** Total Allowed Absence Pool = every paid leave type, EXCLUDING LOP (loss of pay). */
export const totalAbsencePool = (p: LeavePolicy): number =>
  (p.annual || 0) + (p.casual || 0) + (p.sick || 0) + (p.paid || 0) +
  (p.earned || 0) + (p.compOff || 0) + (p.optional || 0);

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettingsData = {
  lockDay: 28,
  autoLock: false,
  periodStartDay: 1,
  periodEndDay: 30,
  salaryPaymentDay: 5,
  leavePolicy: { annual: 12, casual: 12, sick: 8, paid: 12, compOff: 0, lop: 0, optional: 2, earned: 18 },
};

// One window event drives every "no manual reload required" refresh.
export const PAYROLL_SETTINGS_EVENT = 'hrms:payroll-settings-changed';
export const LEAVE_POLICY_EVENT = 'hrms:leave-policy-changed';

const key = (companyId: any) => `hrms_payroll_settings_${companyId ?? 'default'}`;
const histKey = (companyId: any) => `hrms_payroll_settings_history_${companyId ?? 'default'}`;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o : fallback; } catch { return fallback; }
}

/** Load a company's settings, merged over defaults (forward-compatible). */
export function loadPayrollSettings(companyId: any): PayrollSettingsData {
  const stored = safeParse<Partial<PayrollSettingsData>>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(key(companyId)) : null, {}
  );
  return {
    ...DEFAULT_PAYROLL_SETTINGS,
    ...stored,
    leavePolicy: { ...DEFAULT_PAYROLL_SETTINGS.leavePolicy, ...(stored.leavePolicy || {}) },
  };
}

export function loadSettingsHistory(companyId: any): SettingsAuditEntry[] {
  const arr = safeParse<SettingsAuditEntry[]>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(histKey(companyId)) : null, []
  );
  return Array.isArray(arr) ? arr : [];
}

// Human labels + formatters for the audit diff.
const lockDayText = (v: LockDay) => (v === 'last' ? 'Last Day of Month' : ordinal(Number(v)));
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Compute the per-field diffs between two settings objects (business labels).
function diffSettings(prev: PayrollSettingsData, next: PayrollSettingsData): Array<{ label: string; oldValue: string; newValue: string }> {
  const out: Array<{ label: string; oldValue: string; newValue: string }> = [];
  const add = (label: string, o: any, n: any) => { if (String(o) !== String(n)) out.push({ label, oldValue: String(o), newValue: String(n) }); };
  add('Payroll Lock Day', lockDayText(prev.lockDay), lockDayText(next.lockDay));
  add('Automatic Lock', prev.autoLock ? 'On' : 'Off', next.autoLock ? 'On' : 'Off');
  add('Payroll Start Day', ordinal(prev.periodStartDay), ordinal(next.periodStartDay));
  add('Payroll End Day', ordinal(prev.periodEndDay), ordinal(next.periodEndDay));
  add('Salary Payment Day', ordinal(prev.salaryPaymentDay), ordinal(next.salaryPaymentDay));
  const LP: Array<[keyof LeavePolicy, string]> = [
    ['annual', 'Annual Leave'], ['casual', 'Casual Leave'], ['sick', 'Sick Leave'], ['paid', 'Paid Leave'],
    ['compOff', 'Comp Off'], ['lop', 'LOP'], ['optional', 'Optional Leave'], ['earned', 'Earned Leave'],
  ];
  for (const [k, label] of LP) add(label, prev.leavePolicy[k], next.leavePolicy[k]);
  return out;
}

/**
 * Persist settings, append an audit entry per changed field, and broadcast the
 * refresh events. Returns the audit entries that were written (for immediate UI).
 * `stamp` is passed in (Date.now/new Date are avoided in some runtimes) — the
 * caller supplies `new Date().toISOString()`.
 */
export function savePayrollSettings(
  companyId: any, next: PayrollSettingsData, actor: string, stampISO: string
): SettingsAuditEntry[] {
  const prev = loadPayrollSettings(companyId);
  const changes = diffSettings(prev, next);

  try { localStorage.setItem(key(companyId), JSON.stringify(next)); } catch { /* ignore quota */ }

  const newEntries: SettingsAuditEntry[] = changes.map((c, i) => ({
    id: `${stampISO}-${i}`, at: stampISO, by: actor || 'User', label: c.label, oldValue: c.oldValue, newValue: c.newValue,
  }));
  if (newEntries.length) {
    const hist = [...newEntries, ...loadSettingsHistory(companyId)].slice(0, 100);
    try { localStorage.setItem(histKey(companyId), JSON.stringify(hist)); } catch { /* ignore */ }
  }

  // Broadcast so any open screen (Payroll, Leave, Attendance, Dashboard, Reports)
  // can refresh — "no manual reload required".
  const leaveChanged = changes.some((c) => /leave/i.test(c.label));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PAYROLL_SETTINGS_EVENT, { detail: { companyId, settings: next } }));
    if (leaveChanged) window.dispatchEvent(new CustomEvent(LEAVE_POLICY_EVENT, { detail: { companyId, leavePolicy: next.leavePolicy } }));
  }
  return newEntries;
}

/** Is the payroll month ready to lock as of `date` (day-of-month ≥ lock day)? */
export function isReadyToLock(settings: PayrollSettingsData, date: Date): boolean {
  const dom = date.getDate();
  const lastDom = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const lockDom = settings.lockDay === 'last' ? lastDom : Math.min(Number(settings.lockDay) || 28, lastDom);
  return dom >= lockDom;
}

/** Friendly "Payroll locks on the 28th" style label. */
export const lockDayLabel = (v: LockDay) => lockDayText(v);
export { ordinal };
