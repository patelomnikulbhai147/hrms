import React, { useMemo, useRef, useState } from 'react';

interface Props {
  label?: string;
  value: string;
  options: string[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  /** Called when the value changes (selecting an option OR typing a custom value). */
  onChange: (value: string) => void;
  /** Called when a brand-new (custom) value is committed, so it can be persisted. */
  onCreate?: (value: string) => void;
  /**
   * When false, the field is STRICT: the user may search and pick from `options`
   * but cannot commit a value that isn't in the list (no "+ Add", free text reverts
   * on blur). Used e.g. for Nationality, where manual entry is Super-Admin only.
   * Defaults to true (free typing + create allowed).
   */
  allowCustom?: boolean;
}

/**
 * Searchable + creatable combobox.
 *  - shows all options, filters as you type (keyboard search / autocomplete),
 *  - lets you pick an existing option,
 *  - lets you type a custom value that isn't in the list and keep it,
 *  - commits custom values via onCreate (for DB reuse).
 * Validation is the parent's job (only "not empty" is required) — any typed text
 * is accepted as the value.
 */
export const CreatableSelect: React.FC<Props> = ({ label, value, options, placeholder, error, disabled, onChange, onCreate, allowCustom = true }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    const list = ql ? options.filter(o => o.toLowerCase().includes(ql)) : options;
    return list.slice(0, 100);
  }, [options, q]);

  const existsExact = !!q && options.some(o => o.toLowerCase() === q.toLowerCase());
  const showCreate = allowCustom && !!q && !existsExact;

  const commit = (val: string, isNew: boolean) => {
    const v = val.trim();
    onChange(v);
    if (isNew && v && onCreate) onCreate(v);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1 + (showCreate ? 1 : 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (showCreate && active >= filtered.length) commit(q, true);
      else if (filtered[active]) commit(filtered[active], false);
      else if (q && (allowCustom || existsExact)) commit(q, !existsExact);
    } else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="flex flex-col gap-1.5 w-full relative">
      {label && <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{label}</label>}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={open ? query : value}
          placeholder={placeholder || 'Select or type…'}
          onFocus={() => { setQuery(value || ''); setActive(0); setOpen(true); }}
          onChange={e => { setQuery(e.target.value); if (allowCustom) onChange(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => {
            // Commit a free-typed custom value (manual entry) on blur — only when
            // custom entry is allowed. In strict mode unmatched text is discarded
            // and the field reverts to the last selected value.
            const typed = (query || '').trim();
            if (allowCustom && open && typed && !options.some(o => o.toLowerCase() === typed.toLowerCase())) {
              onChange(typed);
              if (onCreate) onCreate(typed);
            }
            setOpen(false);
          }, 150)}
          className={`w-full rounded-xl border bg-slate-900/40 backdrop-blur-md px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed ${error ? 'border-rose-500/50' : 'border-slate-800'}`}
        />
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </div>
      {open && !disabled && (
        <div className="absolute z-50 top-full mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
          {filtered.length === 0 && !showCreate && <div className="px-3 py-2 text-xs text-slate-500">{allowCustom ? 'No matches — keep typing to add a new one.' : 'No matches found.'}</div>}
          {filtered.map((o, i) => (
            <button key={o} type="button" onMouseDown={() => commit(o, false)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${i === active ? 'bg-slate-800 text-blue-300' : 'text-slate-200 hover:bg-slate-800'} ${o === value ? 'font-semibold' : ''}`}>
              {o}
            </button>
          ))}
          {showCreate && (
            <button type="button" onMouseDown={() => commit(q, true)}
              className={`w-full text-left px-3 py-2 text-xs border-t border-slate-800 ${active >= filtered.length ? 'bg-slate-800 text-emerald-300' : 'text-emerald-400 hover:bg-slate-800'}`}>
              + Add “{q}”
            </button>
          )}
        </div>
      )}
      {error && <p className="text-[11px] text-rose-450 font-bold">{error}</p>}
    </div>
  );
};

export default CreatableSelect;
