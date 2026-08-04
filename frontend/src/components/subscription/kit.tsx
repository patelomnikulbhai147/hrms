// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION MANAGEMENT — shared presentation kit.
//
// One place for the primitives the six sections reuse (metric tiles, panels,
// sub-navigation, empty/loading states, money & date formatting). Keeping them
// here is what makes the module read as ONE product instead of six pages that
// happen to sit behind the same tab bar.
//
// Presentation only — no business rules live in this file.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatDate';

// ── Formatting ───────────────────────────────────────────────────────────────
/** Whole-rupee money, Indian digit grouping. Used for every amount on screen. */
export const inr = (n: any) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/** Compact money for axis ticks and dense tiles (₹1.2L / ₹3.4Cr). */
export const inrShort = (n: any) => {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return `₹${v}`;
};

export const num = (n: any) => Number(n || 0).toLocaleString('en-IN');
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Every date on screen goes through the app's single date formatter. */
export const shortDate = (d: any) => formatDate(d);

/** "2026-07" → "Jul 2026" for month buckets coming back from the API. */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (key: string) => {
  const m = String(key || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return String(key || '');
  const i = Number(m[2]) - 1;
  return i >= 0 && i < 12 ? `${MONTH_NAMES[i]} ${m[1]}` : String(key);
};
export const monthLabelShort = (key: string) => {
  const m = String(key || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return String(key || '');
  const i = Number(m[2]) - 1;
  return i >= 0 && i < 12 ? MONTH_NAMES[i] : String(key);
};

// ── Plan identity ────────────────────────────────────────────────────────────
/** Badge variant per plan tier — one mapping for the whole module. */
export const PLAN_VARIANT: Record<string, any> = {
  Free: 'gray', Starter: 'blue', Professional: 'purple', Enterprise: 'indigo', Custom: 'amber',
};

// ── Metric tile ──────────────────────────────────────────────────────────────
/**
 * The Overview KPI. Deliberately quieter than the old StatCard: label above,
 * figure dominant, one optional supporting line. No coloured icon slab — tone
 * is carried by a small tinted glyph so a row of four tiles reads as a set.
 */
export const Metric: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'brand' | 'emerald' | 'amber' | 'rose' | 'slate';
  sub?: React.ReactNode;
  onClick?: () => void;
}> = ({ label, value, icon, tone = 'brand', sub, onClick }) => {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-surface rounded-card border border-hairline shadow-card p-5',
        'transition-[box-shadow,transform,border-color] duration-200',
        onClick && 'cursor-pointer hover:shadow-card-hover hover:border-brand-200 hover:-translate-y-0.5'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider leading-4">{label}</p>
        <span className={cn('inline-flex items-center justify-center h-8 w-8 rounded-xl flex-shrink-0', tones[tone])}>{icon}</span>
      </div>
      <p className="text-[28px] leading-9 font-bold text-ink font-heading tracking-tight mt-3">{value}</p>
      {sub && <p className="text-[12px] text-ink-muted mt-1 font-medium">{sub}</p>}
    </div>
  );
};

// ── Panel (a titled card) ────────────────────────────────────────────────────
export const Panel: React.FC<{
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Drop the body padding — for panels whose body is a full-bleed table. */
  flush?: boolean;
}> = ({ title, subtitle, actions, children, className, flush }) => (
  <div className={cn('bg-surface rounded-card border border-hairline shadow-card overflow-hidden', className)}>
    {(title || actions) && (
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 flex-wrap">
        <div className="min-w-0">
          {title && <h3 className="text-[15px] font-bold text-ink font-heading tracking-tight">{title}</h3>}
          {subtitle && <p className="text-[12.5px] text-ink-muted mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    )}
    <div className={cn(!flush && 'px-5 pb-5', !title && !flush && 'pt-5')}>{children}</div>
  </div>
);

// ── Sub-navigation (pill segmented control) ──────────────────────────────────
export interface SubNavItem { key: string; label: string; icon?: React.ReactNode; count?: number }

export const SubNav: React.FC<{ items: SubNavItem[]; value: string; onChange: (k: string) => void; className?: string }> = ({ items, value, onChange, className }) => (
  <div className={cn('flex items-center gap-1 p-1 rounded-xl bg-surface-muted border border-hairline overflow-x-auto', className)}>
    {items.map((it) => {
      const on = it.key === value;
      return (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          aria-pressed={on}
          className={cn(
            'flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors',
            on ? 'bg-surface text-brand-700 shadow-sm' : 'text-ink-secondary hover:text-ink'
          )}
        >
          {it.icon}{it.label}
          {typeof it.count === 'number' && (
            <span className={cn('ml-0.5 px-1.5 h-[18px] inline-flex items-center rounded-full text-[10.5px] font-bold tabular-nums',
              on ? 'bg-brand-50 text-brand-700' : 'bg-surface text-ink-muted border border-hairline')}>{it.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

// ── States ───────────────────────────────────────────────────────────────────
export const Loading: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="py-16 text-center text-[13px] text-ink-muted font-medium">{label}</div>
);

export const Empty: React.FC<{ icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }> = ({ icon, title, hint, action }) => (
  <div className="py-14 flex flex-col items-center justify-center text-center gap-2">
    {icon && <span className="text-ink-muted/40">{icon}</span>}
    <p className="text-[13.5px] font-semibold text-ink-secondary">{title}</p>
    {hint && <p className="text-[12.5px] text-ink-muted max-w-sm">{hint}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

// ── Key/value row (detail pages) ─────────────────────────────────────────────
export const Field: React.FC<{ label: string; value: React.ReactNode; className?: string }> = ({ label, value, className }) => (
  <div className={cn('py-2.5 border-b border-hairline last:border-0', className)}>
    <dt className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">{label}</dt>
    <dd className="text-[13.5px] font-semibold text-ink mt-0.5 break-words">{value ?? '—'}</dd>
  </div>
);

// ── Form primitives (shared classes so every input matches) ──────────────────
export const inputCls = 'w-full h-10 px-3 rounded-xl border border-hairline bg-surface text-sm text-ink outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10';
export const labelCls = 'text-[11.5px] font-bold text-ink-secondary uppercase tracking-wider mb-1.5 block';

export const Toggle: React.FC<{ on: boolean; onChange?: (v: boolean) => void; disabled?: boolean }> = ({ on, onChange, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => !disabled && onChange?.(!on)}
    aria-pressed={on}
    className={cn('relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
      on ? 'bg-brand-600' : 'bg-slate-300', disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}
  >
    <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', on ? 'translate-x-4' : 'translate-x-0.5')} />
  </button>
);

// ── Export helper (CSV / Excel), shared by Billing and Reports ───────────────
export function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rows → CSV download. `cols` is [header, key][]. */
export function exportCsv(filename: string, cols: [string, string][], rows: any[]) {
  const head = cols.map((c) => c[0]).join(',');
  const body = rows.map((r) => cols.map((c) => `"${String(r[c[1]] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadBlob(`${head}\n${body}`, filename, 'text/csv');
}
