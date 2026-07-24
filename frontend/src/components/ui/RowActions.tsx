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
// CURRENT SHAPE: `<RowActions>` renders ONE three-dot overflow menu (see
// RowActionMenu at the foot of this file). Call sites still nest `<RowAction>`
// children; those are read for their props rather than rendered as buttons.
//
// An earlier revision rendered the children as an inline strip of icon buttons,
// sized by container query (`@[1100px]/table:`) so labels appeared only when the
// table had room. That narrowed the problem but could not solve it: even
// icon-only, four buttons are ~150px of Actions column, and a wide table (the
// 11-column Overtime grid) has no room to give — so the column stayed squeezed
// and the last buttons stayed clipped. One 28px control removes the demand
// entirely, which is why the strip was retired rather than tuned again.
//
// `RowAction` is still exported and still renders a standalone button, for the
// toolbar/inline uses that are not inside a `<RowActions>` group.
//
// Accessibility: every control carries an aria-label, is reachable by Tab, shows
// a focus-visible ring, and is a real <button type="button"> so Enter/Space
// activate it for free. The menu adds ↑/↓/Home/End/Escape.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, type LucideIcon } from 'lucide-react';
import { useDismissable } from '@/hooks/useDismissable';

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
      // Equal height everywhere; width grows only when a label is actually shown.
      iconOnly ? 'h-7 w-7' : 'h-7 w-7 @[1100px]/table:w-auto @[1100px]/table:px-2.5 2xl:w-auto 2xl:px-2.5',
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
    {!iconOnly && <span className="hidden @[1100px]/table:inline 2xl:inline whitespace-nowrap">{label}</span>}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// THE OVERFLOW MENU — one three-dot control per row, SAP/Workday/Zoho style.
//
// WHY THIS REPLACED THE INLINE BUTTON STRIP
// A row of 3-5 bordered icon buttons is 110-190px of Actions column. On a 1366px
// screen with a 256px sidebar, a wide table (the Overtime grid has 11 columns)
// simply has nowhere to put that, so the column was squeezed and the last
// buttons were clipped — worse on the final rows, where a downward menu would
// also fall outside the scroll container. Collapsing to ONE 28px button removes
// ~150px of demand per row, which is what actually fixes the clipping; pinning
// or widening only moved the problem around.
//
// THREE THINGS MAKE IT SAFE INSIDE A SCROLLING TABLE
//   1. It renders in a PORTAL to <body>, so the table's `overflow-x-auto`
//      wrapper (and the Card's `overflow-hidden`) cannot clip it.
//   2. It FLIPS ABOVE the button when there is not enough room below, and is
//      clamped to the viewport on both axes — the last-row case.
//   3. The panel is only mounted while open, so a 200-row table renders 200
//      buttons and ZERO menus.
//
// Keyboard: Enter/Space open; ↑/↓ move; Home/End jump; Escape closes and returns
// focus to the button; Tab closes. Disabled items are skipped by the arrows.
// ─────────────────────────────────────────────────────────────────────────────

/** Resolved action, extracted from a <RowAction> child or supplied directly. */
export interface RowActionItem {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: RowActionTone;
  disabled?: boolean;
  tooltip?: string;
}

/** Menu-item text colour per tone (the buttons' border/bg styling doesn't apply). */
const MENU_TONES: Record<RowActionTone, string> = {
  info:    'text-blue-600 hover:bg-blue-50',
  primary: 'text-brand-600 hover:bg-brand-50',
  edit:    'text-orange-600 hover:bg-orange-50',
  warning: 'text-amber-600 hover:bg-amber-50',
  danger:  'text-rose-600 hover:bg-rose-50',
  success: 'text-emerald-600 hover:bg-emerald-50',
  neutral: 'text-slate-600 hover:bg-slate-100',
};

const MENU_W = 208;      // w-52
const ITEM_H = 34;       // used only to pick a side before the first measure
const GAP = 6;

export const RowActionMenu: React.FC<{
  items: RowActionItem[];
  className?: string;
  /** Overrides the button tooltip / accessible name. */
  label?: string;
}> = ({ items, className = '', label = 'More actions' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, [wrapRef, menuRef]);

  const enabledIdx = items.map((it, i) => (it.disabled ? -1 : i)).filter(i => i >= 0);

  /** Choose a side and clamp to the viewport. */
  const place = useCallback((measuredH?: number) => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const h = measuredH ?? items.length * ITEM_H + 8;
    const below = window.innerHeight - b.bottom - GAP;
    const above = b.top - GAP;
    // Flip up only when below genuinely cannot hold it AND above is roomier.
    const flip = below < h && above > below;
    const top = flip ? Math.max(8, b.top - GAP - h) : Math.min(b.bottom + GAP, window.innerHeight - h - 8);
    const left = Math.min(Math.max(8, b.right - MENU_W), window.innerWidth - MENU_W - 8);
    setPos({ top: Math.max(8, top), left });
  }, [items.length]);

  // Re-place once the real height is known, so a menu whose estimate was wrong
  // still lands fully on screen.
  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    place(menuRef.current.offsetHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A fixed panel would be stranded by any scroll/resize → close instead.
  useEffect(() => {
    if (!open) return;
    const dismiss = () => setOpen(false);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  // Focus the first enabled item when the menu opens (keyboard entry point).
  useEffect(() => {
    if (open && pos) itemRefs.current[enabledIdx[0] ?? 0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos]);

  const toggle = () => {
    if (!open) place();
    setOpen(o => !o);
  };

  const run = (it: RowActionItem) => {
    if (it.disabled) return;
    setOpen(false);
    it.onClick();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const cur = itemRefs.current.findIndex(el => el === document.activeElement);
    const posInEnabled = enabledIdx.indexOf(cur);
    const focusAt = (i: number) => itemRefs.current[enabledIdx[i]]?.focus();

    if (e.key === 'ArrowDown') { e.preventDefault(); focusAt((posInEnabled + 1) % enabledIdx.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt((posInEnabled - 1 + enabledIdx.length) % enabledIdx.length); }
    else if (e.key === 'Home') { e.preventDefault(); focusAt(0); }
    else if (e.key === 'End') { e.preventDefault(); focusAt(enabledIdx.length - 1); }
    else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); btnRef.current?.focus(); }
  };

  if (!items.length) return <span className="text-slate-300">—</span>;

  return (
    <div ref={wrapRef} className={`flex items-center justify-end ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          'inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-lg border bg-white',
          'border-slate-200 text-slate-500 cursor-pointer',
          'transition-all duration-150 ease-out',
          'hover:text-brand-600 hover:bg-brand-50 hover:border-brand-200 hover:shadow-sm active:scale-[0.97]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand-500/30',
          open ? 'text-brand-600 bg-brand-50 border-brand-200' : '',
        ].join(' ')}
      >
        <MoreVertical size={15} aria-hidden="true" />
      </button>

      {/* Mounted ONLY while open — no menu markup for closed rows. */}
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKey}
          style={{ top: pos.top, left: pos.left, width: MENU_W }}
          className="fixed z-[60] rounded-xl border border-slate-200 bg-white shadow-xl py-1 outline-none"
        >
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <button
                key={`${it.label}-${i}`}
                ref={el => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                title={it.tooltip || it.label}
                onClick={() => run(it)}
                className={[
                  'w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-left',
                  'transition-colors focus:outline-none focus-visible:bg-slate-100',
                  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                  MENU_TONES[it.tone || 'neutral'],
                ].join(' ')}
              >
                <Icon size={14} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{it.label}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
};

/**
 * Flatten `<RowActions>` children into plain action descriptors.
 *
 * Call sites write conditional actions as `{cond && <RowAction/>}` and grouped
 * ones inside a fragment, so this walks fragments and drops falsy nodes —
 * otherwise a `<>Approve Reject</>` pair would arrive as one unusable child.
 */
function collectActions(children: React.ReactNode, out: RowActionItem[] = []): RowActionItem[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      collectActions((child.props as any).children, out);
      return;
    }
    if (child.type === RowAction) {
      const p = child.props as RowActionProps;
      out.push({ icon: p.icon, label: p.label, onClick: p.onClick, tone: p.tone, disabled: p.disabled, tooltip: p.tooltip });
    }
  });
  return out;
}

/**
 * Container for a row's actions — now ONE three-dot menu rather than a strip of
 * buttons.
 *
 * Every existing call site keeps working unchanged: it still nests `<RowAction>`
 * children, which are read for their props instead of being rendered as buttons.
 * That is deliberate — it converges every table on a single row-action pattern
 * without touching (or risking) the handlers, permissions and conditional logic
 * at each site.
 */
export const RowActions: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const items = collectActions(children);
  return <RowActionMenu items={items} className={className} />;
};

export default RowActions;
