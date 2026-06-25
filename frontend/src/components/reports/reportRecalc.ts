// ─────────────────────────────────────────────────────────────────────────────
//  Live report recalculation engine (spreadsheet-style).
//
//  The report templates render their derived values (grand totals, total
//  earnings, …) from `data.rows` ONCE, at React render time. In-place cell edits
//  are raw DOM mutations (so the user's typing is never wiped by a re-render),
//  which means React never recomputes those derived cells — totals would go stale
//  the moment a value is edited.
//
//  This engine closes that gap WITHOUT changing any business logic: it re-runs the
//  exact same formulas the templates already use, but against the live (edited)
//  DOM, and writes the result back into the derived cells. Because it mirrors the
//  template's own arithmetic, the recomputed value is identical to the original on
//  first load (nothing visibly changes) and only moves when a source value is
//  actually edited.
//
//  It is driven entirely by declarative data-attributes added to the templates, so
//  ANY current or future report opts in simply by tagging its cells — no engine
//  change required:
//    • data-recalc-scope="…"      a boundary that groups source + derived cells
//    • data-cell="FIELD"          a source (editable) numeric value
//    • data-total="FIELD"         a derived cell = Σ of every data-cell=FIELD in scope
//    • data-sum-of="a b c"        a derived cell = sum of those fields in the scope
//
//  Exports are unaffected by design: Print / PDF snapshot this same DOM, and Excel
//  reads the live table — so they pick up the recalculated values for free.
// ─────────────────────────────────────────────────────────────────────────────
import { inr } from './reportExport';

// Parse a displayed numeric cell ("₹ 1,23,456", "12,000.50", "-200") to a number.
// Anything non-numeric → 0, so a blanked cell counts as zero in a sum.
export const parseEditNum = (t: string | null | undefined): number => {
  if (t == null) return 0;
  const cleaned = String(t).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
};

// The scope that owns a derived cell — the nearest [data-recalc-scope] ancestor,
// or the whole report root when a template is single-scoped.
const scopeOf = (el: Element, root: HTMLElement): HTMLElement =>
  (el.closest('[data-recalc-scope]') as HTMLElement | null) || root;

const sel = (field: string) => `[data-cell="${field.replace(/"/g, '')}"]`;

// Recompute every derived cell under `root` from the current (edited) DOM values.
// Skips the cell the user is actively editing so we never fight live typing.
export function recalcReport(root: HTMLElement | null): void {
  if (!root) return;
  const active = (typeof document !== 'undefined' ? document.activeElement : null) as Element | null;
  const write = (el: Element, value: string) => {
    if (el === active) return;                       // don't overwrite a focused cell
    if ((el.textContent || '').trim() !== value) el.textContent = value;
  };

  // Column totals: Σ of every source cell with the same field inside the scope.
  root.querySelectorAll<HTMLElement>('[data-total]').forEach((el) => {
    const field = el.getAttribute('data-total');
    if (!field) return;
    const cells = Array.from(scopeOf(el, root).querySelectorAll<HTMLElement>(sel(field)));
    if (!cells.length) return;
    const sum = cells.reduce((t, c) => t + parseEditNum(c.textContent), 0);
    write(el, inr(sum));
  });

  // Row sums: a derived cell that adds a fixed set of fields within its scope.
  root.querySelectorAll<HTMLElement>('[data-sum-of]').forEach((el) => {
    const fields = (el.getAttribute('data-sum-of') || '').split(/\s+/).filter(Boolean);
    if (!fields.length) return;
    const scope = scopeOf(el, root);
    const sum = fields.reduce((t, f) => {
      const c = scope.querySelector<HTMLElement>(sel(f));
      return t + parseEditNum(c?.textContent);
    }, 0);
    write(el, inr(sum));
  });
}

export default recalcReport;
