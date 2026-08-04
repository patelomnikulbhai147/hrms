import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

// Reusable CLIENT-SIDE pagination wrapper. Renders exactly the caller's table
// (via the render-prop) plus a First / Prev / page-numbers / Next / Last control
// bar underneath — only when there is more than one page. Each instance owns its
// own page state, so multiple tables on a page paginate independently.
//
// Reset behaviour: pass a `resetKey` built from the active filters/search/date.
// Whenever it changes the view jumps back to page 1 (and shows the first slice).
// The default page size is 15.

export const DEFAULT_PAGE_SIZE = 15;

interface PaginatedProps<T> {
  items: T[];
  pageSize?: number;
  /** When this value changes, pagination resets to page 1 (filters/search/date). */
  resetKey?: unknown;
  /** Noun shown in "Showing X to Y of Z {label}". */
  label?: string;
  /** Render the rows for the current page. `startIndex` = global index of the first row (for Sr No). */
  children: (pageItems: T[], meta: { page: number; startIndex: number }) => React.ReactNode;
}

export function Paginated<T>({ items, pageSize = DEFAULT_PAGE_SIZE, resetKey, label = 'records', children }: PaginatedProps<T>) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Filters/search/date changed → back to the first page.
  useEffect(() => { setPage(1); }, [resetKey]);
  // If the list shrank below the current page, clamp into range.
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const current = Math.min(page, totalPages);
  const startIndex = (current - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  return (
    <>
      {children(pageItems, { page: current, startIndex })}
      {total > pageSize && (
        <PaginationBar page={current} totalPages={totalPages} total={total} pageSize={pageSize} label={label} onChange={setPage} />
      )}
    </>
  );
}

/** Page-size choices offered by the "Rows per page" selector. */
export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  label: string;
  onChange: (page: number) => void;
  /** Supply to show the "Rows per page" selector. Omit to hide it. */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** Renders "Rows per page" as "Rows" etc. — purely cosmetic. */
  pageSizeLabel?: string;
}

/**
 * PaginationBar — the shared pagination control for the whole HRMS.
 *
 * Used two ways:
 *  • through `<Paginated>` for client-side lists (it owns the slicing), and
 *  • directly, driven by a server-side `{page, limit, total, totalPages}`
 *    response — which is how the Employee Cards grid uses it.
 *
 * Responsive by design: numbered page buttons are the desktop affordance and are
 * hidden below `sm`, where the bar collapses to Prev · "Page x of y" · Next. The
 * First/Last jumps stay available on tablet and up.
 */
export const PaginationBar: React.FC<PaginationBarProps> = ({
  page, totalPages, total, pageSize, label, onChange,
  onPageSizeChange, pageSizeOptions = PAGE_SIZE_OPTIONS, pageSizeLabel = 'Rows per page',
}) => {
  const go = (p: number) => onChange(Math.min(totalPages, Math.max(1, p)));
  // An empty result set should read "0 of 0", not "1 to 0".
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // A window of up to 5 page numbers centred on the current page.
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, Math.min(start, end - windowSize + 1));
  const numbers: number[] = [];
  for (let i = start; i <= end; i++) numbers.push(i);

  return (
    <nav
      aria-label="Pagination"
      className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50 flex-wrap gap-3"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-500 font-medium">
          Showing <span className="font-bold text-slate-700">{from}</span>–<span className="font-bold text-slate-700">{to}</span> of <span className="font-bold text-slate-700">{total}</span> {label}
          {/* Page x of y is the only position indicator on mobile, where the
              numbered buttons are hidden — so it is never itself hidden. */}
          <span className="hidden sm:inline"> · Page <span className="font-bold text-slate-700">{page}</span> of <span className="font-bold text-slate-700">{totalPages}</span></span>
        </span>
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span className="hidden sm:inline">{pageSizeLabel}:</span>
            <select
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              aria-label={pageSizeLabel}
              className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
            >
              {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <Button variant="outline" size="sm" className="hidden md:inline-flex text-xs py-1 px-2" onClick={() => go(1)} disabled={page === 1} title="First page">« First</Button>
        <Button variant="outline" size="sm" className="text-xs py-1 px-2" onClick={() => go(page - 1)} disabled={page === 1} title="Previous page">‹ Prev</Button>

        {/* Mobile: a single compact position readout replaces the numbers. */}
        <span className="sm:hidden px-2 text-xs font-semibold text-slate-600 tabular-nums">Page {page} of {totalPages}</span>

        <span className="hidden sm:flex items-center gap-1">
          {start > 1 && <span className="px-1 text-xs text-slate-400 select-none">…</span>}
          {numbers.map(n => (
            <button
              key={n}
              onClick={() => go(n)}
              aria-current={n === page ? 'page' : undefined}
              aria-label={`Page ${n}`}
              className={`min-w-[28px] h-7 rounded-md text-xs font-semibold transition-colors ${n === page ? 'bg-brand-600 text-white' : 'text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
            >
              {n}
            </button>
          ))}
          {end < totalPages && <span className="px-1 text-xs text-slate-400 select-none">…</span>}
        </span>

        <Button variant="outline" size="sm" className="text-xs py-1 px-2" onClick={() => go(page + 1)} disabled={page >= totalPages} title="Next page">Next ›</Button>
        <Button variant="outline" size="sm" className="hidden md:inline-flex text-xs py-1 px-2" onClick={() => go(totalPages)} disabled={page >= totalPages} title="Last page">Last »</Button>
      </div>
    </nav>
  );
};
