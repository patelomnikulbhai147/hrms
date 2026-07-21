// ─────────────────────────────────────────────────────────────────────────────
// INVOICE PICKER — the searchable dropdown used for Bill-To customers and for
// item products/services, rendered INSIDE the invoice document.
//
// Design notes that matter here:
//
//  • It is an input, not a <select>. A one-off customer or a free-text service
//    line must still be typeable — typing filters the list, and whatever is typed
//    is committed on blur/Enter if nothing was picked. Selecting a record
//    auto-fills the rest of the row/section.
//  • The list is PORTALED to <body> and positioned from getBoundingClientRect().
//    The invoice is CSS-transform-scaled, and an absolutely-positioned menu inside
//    it would be scaled and clipped by the page frame; a fixed-position portal
//    reads the already-transformed rect, so it lands in the right place at any
//    zoom level.
//  • Only a slice of matches is rendered (MAX_VISIBLE) with an "N more" hint, so
//    thousands of records stay instant without a virtualisation dependency.
//
// Keyboard: ↑/↓ move, Enter selects the highlighted row (or commits typed text),
// Esc closes, Tab/blur commits. Mouse selection works throughout.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search } from 'lucide-react';

export interface PickerOption {
  id: any;
  /** Bold first line. */
  label: string;
  /** Muted second line (GSTIN, HSN/SAC, rate…). */
  sub?: string;
  /** Right-aligned hint (rate, unit…). */
  meta?: string;
  /** Everything searchable, pre-lowercased by the caller for speed. */
  search: string;
}

interface Props {
  /** Current text shown in the field (the picked record's name, or free text). */
  value: string;
  onChange: (v: string) => void;
  onSelect: (opt: PickerOption) => void;
  options: PickerOption[];
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  /** Footer action, e.g. "+ Create New Customer". Omitted when not permitted. */
  createLabel?: string;
  onCreate?: () => void;
  /** Shown when the master list itself is empty. */
  emptyLabel?: string;
  /** Width of the menu; defaults to the field width (min 280px). */
  menuWidth?: number;
}

const MAX_VISIBLE = 60;

export const InvoicePicker: React.FC<Props> = ({
  value, onChange, onSelect, options, placeholder, className, readOnly,
  createLabel, onCreate, emptyLabel = 'No records found.', menuWidth,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // While the menu is open the field shows the QUERY; closed, it shows the value.
  const shown = open ? query : String(value ?? '');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.search.includes(q));
  }, [options, query]);
  const visible = filtered.slice(0, MAX_VISIBLE);
  const overflow = filtered.length - visible.length;

  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: Math.max(menuWidth || r.width, 280) });
  }, [menuWidth]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    // Reposition on scroll/resize — the invoice pane is itself scrollable.
    const on = () => place();
    window.addEventListener('scroll', on, true);
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on, true); window.removeEventListener('resize', on); };
  }, [open, place]);

  // Close on an outside click (the menu lives in a portal, so check both nodes).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inputRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const start = () => { if (readOnly) return; setQuery(''); setActive(0); setOpen(true); };

  const choose = (opt: PickerOption) => { setOpen(false); setQuery(''); onSelect(opt); };

  /** Nothing picked → keep whatever was typed (one-off customer / service line). */
  const commitFreeText = () => {
    if (!open) return;
    setOpen(false);
    if (query.trim() && query !== value) onChange(query);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === 'ArrowDown') { e.preventDefault(); start(); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(visible.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (visible[active]) choose(visible[active]); else commitFreeText();
    } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery(''); }
    else if (e.key === 'Tab') commitFreeText();
  };

  if (readOnly) return <span className={className}>{String(value ?? '')}</span>;

  return (
    <>
      <input
        ref={inputRef}
        className={className}
        value={shown}
        placeholder={placeholder}
        onFocus={start}
        onClick={start}
        onChange={(e) => { if (!open) start(); setQuery(e.target.value); setActive(0); }}
        onKeyDown={onKeyDown}
        onBlur={() => { /* committed via mousedown-outside / Enter / Tab */ }}
        autoComplete="off"
      />
      {open && rect && createPortal(
        <div ref={menuRef}
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 10000 }}
          className="rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-300/40 overflow-hidden font-sans">
          <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <Search size={11} /> {query ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : `${options.length} record${options.length === 1 ? '' : 's'}`}
          </div>

          <div className="max-h-[260px] overflow-y-auto">
            {options.length === 0 && (
              <div className="px-3 py-4 text-center">
                <p className="text-[11px] font-semibold text-slate-500">{emptyLabel}</p>
              </div>
            )}
            {options.length > 0 && visible.length === 0 && (
              <p className="px-3 py-4 text-center text-[11px] text-slate-400">No match for “{query}”.</p>
            )}
            {visible.map((o, i) => (
              <button key={String(o.id)} type="button" data-idx={i}
                // mousedown (not click) so the field's blur cannot beat the choice.
                onMouseDown={(e) => { e.preventDefault(); choose(o); }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors ${i === active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-bold text-slate-800">{o.label}</span>
                  {o.sub && <span className="block truncate text-[10px] text-slate-400">{o.sub}</span>}
                </span>
                {o.meta && <span className="shrink-0 text-[10px] font-semibold text-slate-500">{o.meta}</span>}
              </button>
            ))}
            {overflow > 0 && (
              <p className="px-2.5 py-1.5 text-[10px] text-slate-400">+{overflow} more — keep typing to narrow the list.</p>
            )}
          </div>

          {createLabel && onCreate && (
            <button type="button"
              onMouseDown={(e) => { e.preventDefault(); setOpen(false); setQuery(''); onCreate(); }}
              className="flex w-full items-center gap-1.5 border-t border-slate-100 bg-white px-2.5 py-2 text-[11px] font-bold text-brand-600 hover:bg-brand-50">
              <Plus size={12} /> {createLabel}
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
};

export default InvoicePicker;
