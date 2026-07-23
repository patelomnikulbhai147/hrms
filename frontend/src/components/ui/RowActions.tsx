// ─────────────────────────────────────────────────────────────────────────────
// RowActions — the standard control set for a data-table "Actions" column.
//
// This is NOT a new design. Most tables in the app (Documents, Employees,
// Company Profile…) already render row actions as small bordered icon buttons;
// a handful still used bare `hover:underline` text links, which gave a ~10px
// click target and looked nothing like the rest of the app. This extracts the
// existing convention into one component so the two styles converge instead of
// becoming three.
//
// Responsive by design — one markup, three presentations:
//   < sm   icon only        (label collapses; the tooltip/aria-label carries it)
//   sm–lg  icon only, wider tap target
//   ≥ lg   icon + label
// The label is hidden with CSS rather than unmounted, so it is always present
// for screen readers and the button never changes identity across breakpoints.
//
// Accessibility: every button carries an aria-label even when the visible text
// is hidden, is reachable by Tab, shows a focus-visible ring, and is a real
// <button type="button"> so Enter/Space activate it for free.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import type { LucideIcon } from 'lucide-react';

/** Semantic intent, not a colour name — the palette can change centrally. */
export type RowActionTone = 'info' | 'primary' | 'edit' | 'warning' | 'danger' | 'success' | 'neutral';

// A note on hue spacing, because it is easy to undo by accident:
// this app's BRAND colour is orange (~41° OKLCH hue). Using `primary` for one
// action and `edit` (orange-600, also ~41°) for the next made two adjacent
// buttons literally the same colour, with `warning` (amber, 58°) a third
// near-match — the colour coding carried no information at all. `info` (blue,
// ~250°) is therefore the tone for the non-destructive primary row action, which
// keeps all four buttons far apart on the wheel: 250 / 41 / 58 / 18.
const TONES: Record<RowActionTone, string> = {
  // border / text / hover-bg / hover-border, per tone.
  info:    'border-slate-200 text-blue-600 hover:text-blue-700 hover:bg-blue-50 hover:border-blue-200 focus-visible:ring-blue-500/30',
  primary: 'border-slate-200 text-brand-600 hover:text-brand-700 hover:bg-brand-50 hover:border-brand-200 focus-visible:ring-brand-500/30',
  edit:    'border-slate-200 text-orange-600 hover:text-orange-700 hover:bg-orange-50 hover:border-orange-200 focus-visible:ring-orange-500/30',
  warning: 'border-slate-200 text-amber-600 hover:text-amber-700 hover:bg-amber-50 hover:border-amber-200 focus-visible:ring-amber-500/30',
  danger:  'border-slate-200 text-rose-600 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 focus-visible:ring-rose-500/30',
  success: 'border-slate-200 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 focus-visible:ring-emerald-500/30',
  neutral: 'border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-100 hover:border-slate-300 focus-visible:ring-slate-400/30',
};

export interface RowActionProps {
  icon: LucideIcon;
  /** Visible at ≥lg, and the accessible name / tooltip at every size. */
  label: string;
  onClick: () => void;
  tone?: RowActionTone;
  disabled?: boolean;
  /**
   * Longer hover text. Defaults to `label` — set it when the label alone is
   * ambiguous ("Assign" → "Assign employees to this shift").
   */
  tooltip?: string;
  /** Force icon-only even on wide screens (for very dense tables). */
  iconOnly?: boolean;
}

export const RowAction: React.FC<RowActionProps> = ({
  icon: Icon, label, onClick, tone = 'primary', disabled, tooltip, iconOnly,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={tooltip || label}
    aria-label={label}
    className={[
      'inline-flex items-center justify-center gap-1.5 shrink-0',
      // Equal height everywhere; width grows only when a label is shown.
      iconOnly ? 'h-7 w-7' : 'h-7 w-7 lg:w-auto lg:px-2.5',
      'rounded-lg border bg-white',
      'text-[11px] font-semibold leading-none',
      'cursor-pointer transition-all duration-150 ease-out',
      'hover:shadow-sm active:scale-[0.97]',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
      'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:bg-white',
      TONES[tone],
    ].join(' ')}
  >
    <Icon size={13} className="shrink-0" aria-hidden="true" />
    {!iconOnly && <span className="hidden lg:inline whitespace-nowrap">{label}</span>}
  </button>
);

/**
 * Container for a row's actions. Keeps spacing identical across every table and
 * stops the group from wrapping mid-row on narrow screens.
 */
export const RowActions: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex items-center gap-1.5 ${className}`}>{children}</div>
);

export default RowActions;
