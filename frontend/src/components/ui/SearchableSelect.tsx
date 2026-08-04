// ─────────────────────────────────────────────────────────────────────────────
// SearchableSelect — a type-ahead replacement for a native <select> where the
// option list is long enough that scrolling it is a chore (employees,
// designations, departments, branches).
//
// Deliberately NOT a rewrite of `Select`: the native control is the right thing
// for short, fixed lists (status, period, page size) — it is free, accessible,
// and on mobile it opens the platform picker. This is for the long lists only.
//
// Behaviour the brief asks for, and which the tests pin:
//   • typing filters instantly, case-insensitively, on any substring;
//   • ↑ ↓ move the highlight, Enter selects, Escape closes and restores;
//   • the list is windowed, so 829 employees do not put 829 nodes in the DOM.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { useDismissable } from '@/hooks/useDismissable';

export interface SearchableOption {
  value: string;
  label: string;
  /** Optional second line — e.g. an employee code or department. */
  hint?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  /** Shown when nothing is selected; also the "clear" entry's label. */
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  /** Rendered above the control. */
  label?: string;
  disabled?: boolean;
  /** Max options rendered at once. Beyond this the list scrolls as you type. */
  windowSize?: number;
}

export const SearchableSelect: React.FC<Props> = ({
  value, onChange, options, placeholder = 'All', className = '', ariaLabel, label, disabled, windowSize = 60,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);
  useDismissable(open, close, rootRef);

  const selected = options.find(o => o.value === value) || null;

  // Case-insensitive substring match over both the label and its hint, so an
  // employee is findable by name OR by code.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(q) || (o.hint || '').toLowerCase().includes(q));
  }, [options, query]);

  // Only this many are mounted — the rest are reachable by typing. Keeps a
  // several-hundred-option list from costing hundreds of DOM nodes on open.
  const visible = matches.slice(0, windowSize);
  const hiddenCount = matches.length - visible.length;

  useEffect(() => { setActive(0); }, [query, open]);

  // Keep the highlighted row in view while arrowing through.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const commit = (v: string) => { onChange(v); close(); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); e.preventDefault(); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, visible.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (visible[active]) commit(visible[active].value);
    } else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(visible.length - 1); }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && <label className="block text-[11px] font-bold text-gray-600 mb-1">{label}</label>}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || label || placeholder}
        className="w-full h-8 flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs font-medium text-gray-700 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:opacity-50 transition-all"
      >
        <span className={`flex-1 text-left truncate ${selected ? '' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        {selected && (
          // A span, not a button — a nested <button> is invalid HTML and breaks
          // keyboard traversal.
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear selection"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
          >
            <X size={11} />
          </span>
        )}
        <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50">
            <Search size={12} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type to search…"
              aria-label="Search options"
              className="w-full bg-transparent text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          <div ref={listRef} role="listbox" className="max-h-60 overflow-y-auto py-1">
            <div
              data-idx="-1"
              role="option"
              aria-selected={!value}
              onClick={() => commit('')}
              className={`px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${!value ? 'text-brand-700 bg-brand-50' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {placeholder}
            </div>
            {visible.map((o, i) => (
              <div
                key={o.value}
                data-idx={i}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(o.value)}
                className={`px-2.5 py-1.5 cursor-pointer ${i === active ? 'bg-brand-50' : ''} ${o.value === value ? 'font-bold text-brand-700' : 'text-slate-700'}`}
              >
                <div className="text-xs truncate">{o.label}</div>
                {o.hint && <div className="text-[10px] text-slate-400 truncate">{o.hint}</div>}
              </div>
            ))}
            {!matches.length && (
              <div className="px-2.5 py-3 text-center text-[11px] text-slate-400">No matches for “{query}”</div>
            )}
            {hiddenCount > 0 && (
              <div className="px-2.5 py-1.5 text-center text-[10px] text-slate-400 border-t border-slate-100">
                +{hiddenCount} more — keep typing to narrow
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
