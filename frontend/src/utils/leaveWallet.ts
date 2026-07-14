// ─────────────────────────────────────────────────────────────────────────────
// leaveWallet — builds an employee's leave wallet 100% dynamically from the
// company Leave Policy (the single source of truth). ONE entry per configured
// leave type, in Settings order. NO hardcoded CL/PL/SL, no per-type switch: the
// wallet is whatever the policy contains, so adding / renaming / removing a leave
// type in Settings is reflected everywhere with zero code change.
// ─────────────────────────────────────────────────────────────────────────────
import { LEAVE_FIELDS, type LeavePolicy } from '@/utils/payrollSettings';

/**
 * Maps a policy key → which approved leave-request types count as "used" against
 * it. This is a usage correlation only (not a display mapping): keys with no
 * matching request type simply show 0 used (full balance). The rendered card
 * label always comes from the policy, never from here.
 */
export const LEAVE_USAGE_MATCH: Record<string, (t: string) => boolean> = {
  annual: (t) => t === 'Annual',
  casual: (t) => t === 'Casual',
  sick: (t) => t === 'Sick',
  lop: (t) => t === 'Unpaid',
};

/** Per-type accent for wallet cards (falls back to slate). Purely cosmetic. */
export const WALLET_TONE: Record<string, 'red' | 'green' | 'blue' | 'purple'> = {
  annual: 'blue', casual: 'green', sick: 'red', paid: 'purple',
  earned: 'blue', optional: 'green', compOff: 'purple', lop: 'red',
};

// ─────────────────────────────────────────────────────────────────────────────
// Soft per-type palette for the compact wallet badges. Light background + darker
// text (never a plain white/grey box). Keyed by policy key; any leave type NOT
// in the map (e.g. a new one a Company Head adds in Settings) falls back to a
// rotating palette by index, so it still renders as a distinct colored card with
// zero code change. Full Tailwind class strings only — no dynamic construction.
// ─────────────────────────────────────────────────────────────────────────────
export interface WalletPalette { bg: string; label: string; value: string; }

const WALLET_PALETTE: Record<string, WalletPalette> = {
  annual:   { bg: 'bg-blue-50 border-blue-100',       label: 'text-blue-500',    value: 'text-blue-700' },     // Soft Blue
  casual:   { bg: 'bg-purple-50 border-purple-100',   label: 'text-purple-500',  value: 'text-purple-700' },   // Soft Purple
  sick:     { bg: 'bg-orange-50 border-orange-100',    label: 'text-orange-500',  value: 'text-orange-700' },   // Soft Orange
  paid:     { bg: 'bg-emerald-50 border-emerald-100',  label: 'text-emerald-500', value: 'text-emerald-700' },  // Soft Green
  earned:   { bg: 'bg-indigo-50 border-indigo-100',   label: 'text-indigo-500',  value: 'text-indigo-700' },   // Soft Indigo
  compOff:  { bg: 'bg-cyan-50 border-cyan-100',       label: 'text-cyan-500',    value: 'text-cyan-700' },     // Soft Cyan
  optional: { bg: 'bg-pink-50 border-pink-100',       label: 'text-pink-500',    value: 'text-pink-700' },     // Soft Pink
  lop:      { bg: 'bg-slate-100 border-slate-200',    label: 'text-slate-400',   value: 'text-slate-600' },    // Soft Gray
};

const WALLET_FALLBACK: WalletPalette[] = [
  { bg: 'bg-teal-50 border-teal-100',     label: 'text-teal-500',   value: 'text-teal-700' },
  { bg: 'bg-rose-50 border-rose-100',     label: 'text-rose-500',   value: 'text-rose-700' },
  { bg: 'bg-amber-50 border-amber-100',   label: 'text-amber-500',  value: 'text-amber-700' },
  { bg: 'bg-sky-50 border-sky-100',       label: 'text-sky-500',    value: 'text-sky-700' },
  { bg: 'bg-violet-50 border-violet-100', label: 'text-violet-500', value: 'text-violet-700' },
];

/** Soft badge palette for a wallet entry. `index` seeds the fallback so unknown
 *  (newly-added) leave types still get a stable, distinct color. */
export const walletPalette = (key: string, index = 0): WalletPalette =>
  WALLET_PALETTE[key] || WALLET_FALLBACK[index % WALLET_FALLBACK.length];

export interface WalletEntry {
  key: string;
  label: string;   // the leave name straight from the policy
  total: number;   // configured allocation
  used: number;    // approved leave taken for this type
  remaining: number;
}

/** An employee's leave wallet: total from policy, used from approved leave. */
export function buildLeaveWallet(
  policy: LeavePolicy,
  approvedLeaves: Array<{ leaveType: string; days: number }>,
): WalletEntry[] {
  return LEAVE_FIELDS.map(({ key, label }) => {
    const total = Number((policy as any)[key]) || 0;
    const match = LEAVE_USAGE_MATCH[key as string];
    const used = match ? approvedLeaves.filter(l => match(l.leaveType)).reduce((s, l) => s + (Number(l.days) || 0), 0) : 0;
    return { key: key as string, label, total, used, remaining: Math.max(0, total - used) };
  });
}

/** Total remaining across every allowance type (LOP excluded — loss of pay). */
export const walletTotalRemaining = (wallet: WalletEntry[]): number =>
  wallet.filter(w => w.key !== 'lop').reduce((s, w) => s + w.remaining, 0);

/** Total used across every allowance type (LOP excluded). */
export const walletTotalUsed = (wallet: WalletEntry[]): number =>
  wallet.filter(w => w.key !== 'lop').reduce((s, w) => s + w.used, 0);

/** True when at least one leave type has a non-zero allocation. */
export const hasConfiguredPolicy = (policy: LeavePolicy): boolean =>
  LEAVE_FIELDS.some(f => (Number((policy as any)[f.key]) || 0) > 0);
