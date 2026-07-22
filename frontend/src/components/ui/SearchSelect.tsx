import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDismissable } from '@/hooks/useDismissable';

export interface SearchSelectOption {
  value: string;
  label: string;
}

interface Props {
  /** Selected value. `''` means "no filter" and shows `allLabel`. */
  value: string;
  onChange: (value: string) => void;
  /** Selectable options, WITHOUT the reset row — that is `allLabel`. */
  options: SearchSelectOption[];
  /** Label for the always-present reset row (value `''`). */
  allLabel?: string;
  label?: string;
  placeholder?: string;
  /** Shown when the query matches nothing, e.g. "No departments found." */
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  /** Accessible name for the control when there is no visible `label`. */
  ariaLabel?: string;
}

/**
 * SearchSelect — a searchable single-select combobox (GitHub/Slack style).
 *
 * Why a custom control rather than the native <Select>: a native <select> can
 * only be searched by typing the first characters of an option, which breaks
 * down the moment a company has 100+ departments. Here the query matches
 * anywhere in the label and the list narrows as you type.
 *
 * Geometry/typography intentionally mirror `Input`/`Select` (h-12, rounded-xl,
 * hairline border, text-sm) so it drops into an existing filter row without
 * shifting the grid.
 *
 * Accessibility: the input is a real `combobox` wired to a `listbox` via
 * aria-controls/aria-activedescendant, so screen readers announce the active
 * option while arrow keys move it. Enter commits, Escape closes, Tab leaves.
 */
export const SearchSelect: React.FC<Props> = ({
  value,
  onChange,
  options,
  allLabel = 'All',
  label,
  placeholder,
  emptyText = 'No results found.',
  disabled,
  className,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Stable id so aria-activedescendant/option ids never collide when several
  // of these render in the same filter row.
  const idRef = useRef(`ss-${Math.random().toString(36).slice(2, 9)}`);
  const listId = `${idRef.current}-list`;

  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);
  useDismissable(open, close, containerRef);

  const selectedLabel = value ? (options.find(o => o.value === value)?.label ?? value) : '';

  // The reset row is always first, so index 0 is "clear the filter" and the
  // rest of the list keeps its natural order. Filtering is a single pass over
  // the options and is memoised on (options, query) — typing re-runs it once,
  // not once per keystroke per row.
  const rows: SearchSelectOption[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
    return q ? matches : [{ value: '', label: allLabel }, ...matches];
  }, [options, query, allLabel]);

  // Keep the highlight in range whenever the result set shrinks under it.
  useEffect(() => { setActive(a => (a >= rows.length ? 0 : a)); }, [rows.length]);

  // Follow the highlight with the scroll container so keyboard navigation
  // never walks the selection out of view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const commit = useCallback((val: string) => {
    onChange(val);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }, [onChange]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setActive(0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); openList(); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive(a => (rows.length ? (a + 1) % rows.length : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive(a => (rows.length ? (a - 1 + rows.length) % rows.length : 0));
        break;
      case 'Home':
        e.preventDefault(); setActive(0);
        break;
      case 'End':
        e.preventDefault(); setActive(Math.max(0, rows.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (rows[active]) commit(rows[active].value);
        break;
      case 'Escape':
        // Stop here so an enclosing modal/drawer doesn't also close.
        e.preventDefault(); e.stopPropagation();
        close();
        break;
      case 'Tab':
        close();
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn('relative flex flex-col gap-1.5 w-full', className)}>
      {label && <label className="text-[12px] font-semibold text-ink-secondary">{label}</label>}

      <div className="relative w-full">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `${idRef.current}-opt-${active}` : undefined}
          aria-label={ariaLabel || label}
          autoComplete="off"
          disabled={disabled}
          // Closed, the field reads as a select showing the current choice;
          // open, it becomes the search box.
          value={open ? query : selectedLabel}
          placeholder={open ? (placeholder || 'Type to search…') : allLabel}
          onMouseDown={() => { if (!open) openList(); }}
          onFocus={openList}
          onChange={e => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full h-12 rounded-xl border border-hairline bg-surface pl-9.5 pr-9 text-sm text-ink cursor-pointer',
            'placeholder:text-ink-muted transition-[border-color,box-shadow] duration-150',
            'focus:outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/15',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            !open && !value && 'text-ink-muted',
          )}
        />

        {/* Clear (×) once a department is picked; chevron otherwise. Only one
            occupies the slot, so the field width never jumps. */}
        {value && !disabled ? (
          <button
            type="button"
            aria-label="Clear filter"
            onClick={() => { commit(''); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-ink-muted cursor-pointer hover:text-ink hover:bg-surface-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown
            size={16}
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none transition-transform duration-150',
              open && 'rotate-180',
            )}
          />
        )}
      </div>

      {open && !disabled && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel || label}
          className="absolute z-50 top-full left-0 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-hairline bg-surface shadow-lg py-1 animate-pop-in"
        >
          {rows.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-[12px] text-ink-muted">{emptyText}</p>
          ) : (
            rows.map((o, i) => (
              <Option
                key={`${o.value}-${i}`}
                id={`${idRef.current}-opt-${i}`}
                option={o}
                active={i === active}
                selected={o.value === value}
                onHover={setActive}
                onPick={commit}
                index={i}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Memoised row. With 100+ departments this keeps a keystroke or an arrow-key
 * move from re-rendering every option — only the two rows whose `active`
 * changed actually repaint.
 */
const Option = React.memo<{
  id: string;
  index: number;
  option: SearchSelectOption;
  active: boolean;
  selected: boolean;
  onHover: (i: number) => void;
  onPick: (v: string) => void;
}>(({ id, index, option, active, selected, onHover, onPick }) => (
  <div
    id={id}
    role="option"
    aria-selected={selected}
    data-active={active || undefined}
    // mousedown, not click: fires before the input's blur so the pick lands.
    onMouseDown={e => { e.preventDefault(); onPick(option.value); }}
    onMouseEnter={() => onHover(index)}
    className={cn(
      'flex items-center justify-between gap-2 px-3.5 py-2 text-sm cursor-pointer transition-colors',
      active ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-surface-muted',
      selected && 'font-semibold',
    )}
  >
    <span className="truncate">{option.label}</span>
    {selected && <Check size={14} className="shrink-0 text-brand-600" />}
  </div>
));
Option.displayName = 'SearchSelectOption';

export default SearchSelect;
