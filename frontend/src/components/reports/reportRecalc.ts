// ─────────────────────────────────────────────────────────────────────────────
//  Live report recalculation engine (spreadsheet-style, dependency-driven).
//
//  Report templates render their derived values (net pay, PF/ESI splits, grand
//  totals …) from `data.rows` ONCE, at React render time. In-place cell edits are
//  raw DOM mutations (so the user's typing is never wiped by a re-render), which
//  means React never recomputes those derived cells — they'd go stale the moment a
//  source value is edited.
//
//  This engine closes that gap WITHOUT changing any business logic. It is driven
//  entirely by declarative data-attributes on the templates, so ANY current or
//  future report opts in simply by tagging its cells — no engine change required:
//
//    • data-recalc-scope="…"   a boundary that groups source + derived cells and
//                              owns the column totals (a table, a department group,
//                              or a single slip).
//    • data-row                a record boundary for per-row formulas (a <tr>, or a
//                              whole slip). If absent, the scope acts as the row.
//    • data-cell="FIELD"       a named numeric value. SOURCE (editable) when it has
//                              no data-formula; DERIVED (read-only) when it does.
//    • data-formula="EXPR"     EXPR over sibling field names (+ scope constants) —
//                              e.g. "basic + allowances + bonus - deductions - tax".
//    • data-sum-of="a b c"     shorthand for data-formula="a + b + c".
//    • data-total="FIELD"      column total = Σ of every data-cell=FIELD in scope.
//    • data-total-formula="E"  a footer cell derived from OTHER totals in the scope.
//    • data-const='{"k":n}'    constants on a [data-recalc-scope] usable in formulas
//                              (e.g. statutory rates {"pfRate":12,...}).
//
//  ── The baseline-offset principle (why nothing changes on first load) ──────────
//  Real payroll data does not always reconcile to the few columns shown (net may
//  bundle components the register never prints). So a derived cell is NOT shown as
//  `formula(inputs)` — that would rewrite every value the instant a report opens
//  and break DB-reconciled totals. Instead, at load we capture
//        offset = displayedValue − formula(loadedInputs)
//  and thereafter render  formula(currentInputs) + offset.  On first load
//  currentInputs == loadedInputs, so the cell shows EXACTLY the backend value; an
//  edit then moves it by precisely the delta the formula implies (Excel-like),
//  while the unexplained residual is preserved. For linear/piecewise-linear payroll
//  formulas (sums, differences, capped %s) this delta is exact.
//
//  Exports are unaffected by design: Print / PDF snapshot this same DOM and Excel
//  reads the live table — so they all pick up the recalculated values for free.
// ─────────────────────────────────────────────────────────────────────────────
import { inr } from './reportExport';

// ── number parsing ───────────────────────────────────────────────────────────
// Parse a displayed numeric cell ("₹ 1,23,456", "12,000.50", "-200", "—") → number.
// Anything non-numeric → 0, so a blanked cell counts as zero in a sum.
export const parseEditNum = (t: string | null | undefined): number => {
  if (t == null) return 0;
  const cleaned = String(t).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
};

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const clampSafe = (n: number): number => (n > MAX_SAFE ? MAX_SAFE : n < -MAX_SAFE ? -MAX_SAFE : n);

// ── tiny safe formula parser/evaluator (no eval) ─────────────────────────────
// Recursive-descent over: + - * / unary-minus, parens, numbers, identifiers and
// function calls min/max/round/floor/ceil/abs/clamp. Parsed ASTs are cached per
// expression string. Identifiers resolve via a caller-supplied lookup.
type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'op'; op: string; a: Node; b: Node }
  | { t: 'neg'; a: Node }
  | { t: 'fn'; name: string; args: Node[] };

const FUNCS: Record<string, (a: number[]) => number> = {
  min: a => Math.min(...a), max: a => Math.max(...a),
  round: a => Math.round(a[0]), floor: a => Math.floor(a[0]), ceil: a => Math.ceil(a[0]),
  abs: a => Math.abs(a[0]),
  clamp: a => Math.min(Math.max(a[0], a[1]), a[2]),
};

const astCache = new Map<string, Node | null>();

function parseFormula(expr: string): Node | null {
  if (astCache.has(expr)) return astCache.get(expr)!;
  const toks = expr.match(/\d+\.?\d*|[A-Za-z_][A-Za-z0-9_]*|[+\-*/(),]/g) || [];
  let i = 0;
  const peek = () => toks[i];
  const eat = () => toks[i++];
  let ast: Node | null = null;
  try {
    const parseExpr = (): Node => {
      let n = parseTerm();
      while (peek() === '+' || peek() === '-') { const op = eat(); n = { t: 'op', op, a: n, b: parseTerm() }; }
      return n;
    };
    const parseTerm = (): Node => {
      let n = parseFactor();
      while (peek() === '*' || peek() === '/') { const op = eat(); n = { t: 'op', op, a: n, b: parseFactor() }; }
      return n;
    };
    const parseFactor = (): Node => {
      if (peek() === '-') { eat(); return { t: 'neg', a: parseFactor() }; }
      return parsePrimary();
    };
    const parsePrimary = (): Node => {
      const tk = eat();
      if (tk === '(') { const n = parseExpr(); if (eat() !== ')') throw new Error('unbalanced'); return n; }
      if (tk == null) throw new Error('unexpected end');
      if (/^\d/.test(tk)) return { t: 'num', v: Number(tk) };
      if (peek() === '(') { // function call
        eat();
        const args: Node[] = [];
        if (peek() !== ')') { args.push(parseExpr()); while (peek() === ',') { eat(); args.push(parseExpr()); } }
        if (eat() !== ')') throw new Error('unbalanced fn');
        return { t: 'fn', name: tk.toLowerCase(), args };
      }
      return { t: 'var', name: tk };
    };
    ast = parseExpr();
    if (i !== toks.length) throw new Error('trailing tokens');
  } catch { ast = null; }
  astCache.set(expr, ast);
  return ast;
}

function evalNode(n: Node, resolve: (name: string) => number): number {
  switch (n.t) {
    case 'num': return n.v;
    case 'var': return resolve(n.name);
    case 'neg': return -evalNode(n.a, resolve);
    case 'op': {
      const a = evalNode(n.a, resolve), b = evalNode(n.b, resolve);
      return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : (b === 0 ? 0 : a / b);
    }
    case 'fn': {
      const fn = FUNCS[n.name]; if (!fn) return 0;
      return fn(n.args.map(x => evalNode(x, resolve)));
    }
  }
}

/** Evaluate a formula string with a variable resolver. NaN/Infinity → 0. */
export function evalFormula(expr: string, resolve: (name: string) => number): number {
  const ast = parseFormula(expr); if (!ast) return 0;
  const v = evalNode(ast, resolve);
  return isFinite(v) ? clampSafe(v) : 0;
}

/** Field names a formula reads — used to build the per-row dependency graph. */
function formulaVars(expr: string): string[] {
  const ast = parseFormula(expr); if (!ast) return [];
  const out = new Set<string>();
  const walk = (n: Node) => {
    if (n.t === 'var') out.add(n.name);
    else if (n.t === 'op') { walk(n.a); walk(n.b); }
    else if (n.t === 'neg') walk(n.a);
    else if (n.t === 'fn') n.args.forEach(walk);
  };
  walk(ast);
  return [...out];
}

// ── DOM helpers ──────────────────────────────────────────────────────────────
const scopeOf = (el: Element, root: HTMLElement): HTMLElement =>
  (el.closest('[data-recalc-scope]') as HTMLElement | null) || root;
// The record boundary owning per-row formulas: nearest [data-row], else the scope.
const rowOf = (el: Element, root: HTMLElement): HTMLElement =>
  (el.closest('[data-row]') as HTMLElement | null) || scopeOf(el, root);
const sel = (field: string) => `[data-cell="${field.replace(/"/g, '')}"]`;

// Constants declared on the nearest [data-const]-bearing scope ancestor.
function constsFor(el: Element, root: HTMLElement): Record<string, number> {
  const host = (el.closest('[data-const]') as HTMLElement | null);
  const raw = host?.getAttribute('data-const') || (root.getAttribute('data-const') || '');
  if (!raw) return {};
  try { const o = JSON.parse(raw); const out: Record<string, number> = {}; for (const k in o) out[k] = Number(o[k]) || 0; return out; }
  catch { return {}; }
}

// Normalise data-sum-of → an equivalent data-formula expression.
const formulaOf = (el: HTMLElement): string | null => {
  const f = el.getAttribute('data-formula');
  if (f) return f;
  const s = el.getAttribute('data-sum-of');
  if (s) { const fs = s.split(/\s+/).filter(Boolean); return fs.length ? fs.join(' + ') : null; }
  return null;
};

export interface RecalcIssue { type: 'circular' | 'negative' | 'overflow'; field: string; }

// Resolver for a derived cell: read sibling source/derived values within the row,
// then fall back to scope constants, else 0.
function rowResolver(row: HTMLElement, consts: Record<string, number>) {
  return (name: string): number => {
    if (name in consts) return consts[name];
    const c = row.querySelector<HTMLElement>(sel(name));
    if (c) return parseEditNum(c.textContent);
    return 0;
  };
}

// ── baseline offsets ─────────────────────────────────────────────────────────
// Capture, once per data load, the residual between each derived cell's displayed
// (backend) value and its formula over the loaded inputs. Stored on the element so
// recompute renders `formula(current) + offset` → backend value on load, exact
// deltas thereafter. MUST run on freshly-loaded data, before any edits are applied.
export function initBaselines(root: HTMLElement | null): void {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('[data-formula],[data-sum-of]').forEach(el => {
    const expr = formulaOf(el); if (!expr) return;
    const row = rowOf(el, root);
    const consts = constsFor(el, root);
    const base = evalFormula(expr, rowResolver(row, consts));
    const shown = parseEditNum(el.textContent);
    el.dataset.recalcBase = String(shown - base);
    el.setAttribute('data-derived', '1');
  });
}

/** Forget captured offsets (call when fresh data is about to be initialised). */
export function clearBaselines(root: HTMLElement | null): void {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('[data-recalc-base]').forEach(el => { delete el.dataset.recalcBase; });
}

// ── core recompute ───────────────────────────────────────────────────────────
const writeCell = (el: Element, value: string, active: Element | null): void => {
  if (el === active) return;                          // never fight a focused cell
  if ((el.textContent || '').trim() !== value) el.textContent = value;
};

// Recompute every derived (data-formula / data-sum-of) cell inside one row, in
// dependency order, applying the baseline offset. Returns any validation issues.
function recalcRow(row: HTMLElement, root: HTMLElement, active: Element | null, issues: RecalcIssue[]): void {
  const derived = Array.from(row.querySelectorAll<HTMLElement>('[data-formula],[data-sum-of]'));
  if (!derived.length) return;
  const consts = constsFor(row, root);
  // Map field → element for the derived cells so we can order by dependency.
  const byField = new Map<string, HTMLElement>();
  derived.forEach(el => { const f = el.getAttribute('data-cell'); if (f) byField.set(f, el); });

  // Topological sort: a derived field depends on the derived fields it references.
  const order: HTMLElement[] = [];
  const state = new Map<HTMLElement, 0 | 1 | 2>(); // 0 unseen,1 visiting,2 done
  const visit = (el: HTMLElement) => {
    const st = state.get(el);
    if (st === 2) return;
    if (st === 1) { // cycle — break it, flag the field
      issues.push({ type: 'circular', field: el.getAttribute('data-cell') || '?' });
      return;
    }
    state.set(el, 1);
    const expr = formulaOf(el);
    if (expr) formulaVars(expr).forEach(v => { const dep = byField.get(v); if (dep && dep !== el) visit(dep); });
    state.set(el, 2);
    order.push(el);
  };
  derived.forEach(visit);

  for (const el of order) {
    const expr = formulaOf(el); if (!expr) continue;
    const offset = Number(el.dataset.recalcBase || 0);
    let v = evalFormula(expr, rowResolver(row, consts)) + offset;
    const field = el.getAttribute('data-cell') || el.getAttribute('data-total') || '?';
    if (Math.abs(v) >= MAX_SAFE) { v = clampSafe(v); issues.push({ type: 'overflow', field }); }
    if (v < 0 && el.hasAttribute('data-nonneg')) { issues.push({ type: 'negative', field }); }
    writeCell(el, inr(v), active);
  }
}

// Recompute column totals and total-formulas within one scope.
function recalcScopeTotals(scope: HTMLElement, root: HTMLElement, active: Element | null): void {
  scope.querySelectorAll<HTMLElement>('[data-total]').forEach(el => {
    if (scopeOf(el, root) !== scope) return;          // belongs to a nested scope
    const field = el.getAttribute('data-total'); if (!field) return;
    const cells = Array.from(scope.querySelectorAll<HTMLElement>(sel(field)));
    if (!cells.length) return;
    const sum = cells.reduce((t, c) => t + parseEditNum(c.textContent), 0);
    writeCell(el, inr(clampSafe(sum)), active);
  });
  // Footer cells derived from the scope's totals (e.g. grand net = grand earnings − grand deductions).
  scope.querySelectorAll<HTMLElement>('[data-total-formula]').forEach(el => {
    if (scopeOf(el, root) !== scope) return;
    const expr = el.getAttribute('data-total-formula'); if (!expr) return;
    const resolve = (name: string): number => {
      const tcell = scope.querySelector<HTMLElement>(`[data-total="${name.replace(/"/g, '')}"]`);
      return tcell ? parseEditNum(tcell.textContent) : 0;
    };
    writeCell(el, inr(clampSafe(evalFormula(expr, resolve))), active);
  });
}

/**
 * Targeted recompute after a single edit: the edited cell's row, then the totals
 * of every enclosing scope. This is the fast path — it touches only what the edit
 * can affect, not the whole report.
 */
export function recalcFrom(editedEl: Element | null, root: HTMLElement | null): RecalcIssue[] {
  if (!root || !editedEl) return [];
  const active = (typeof document !== 'undefined' ? document.activeElement : null) as Element | null;
  const issues: RecalcIssue[] = [];
  const row = rowOf(editedEl, root);
  recalcRow(row, root, active, issues);
  // Walk up every scope boundary that contains the row and re-foot its totals.
  let scope: HTMLElement | null = scopeOf(editedEl, root);
  const seen = new Set<HTMLElement>();
  while (scope && !seen.has(scope)) {
    seen.add(scope);
    recalcScopeTotals(scope, root, active);
    const parent = scope.parentElement?.closest('[data-recalc-scope]') as HTMLElement | null;
    scope = parent && parent !== scope ? parent : (scope === root ? null : root);
  }
  return issues;
}

/**
 * Full recompute of every derived cell + total under `root`. Used on initial load
 * (after initBaselines) and after re-applying saved edits. Skips the focused cell.
 */
export function recalcReport(root: HTMLElement | null): RecalcIssue[] {
  if (!root) return [];
  const active = (typeof document !== 'undefined' ? document.activeElement : null) as Element | null;
  const issues: RecalcIssue[] = [];

  // Per-row derived cells. A "row" is each [data-row]; if a template declares none,
  // fall back to the legacy behaviour (whole report is a single row/scope).
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-row]'));
  if (rows.length) rows.forEach(r => recalcRow(r, root, active, issues));
  else recalcRow(root, root, active, issues);

  // Then every scope's column totals (innermost-first so nested groups settle).
  const scopes = Array.from(root.querySelectorAll<HTMLElement>('[data-recalc-scope]'));
  (scopes.length ? scopes : [root]).forEach(s => recalcScopeTotals(s, root, active));
  if (root.querySelector('[data-total],[data-total-formula]') && !scopes.includes(root)) recalcScopeTotals(root, root, active);
  return issues;
}

export default recalcReport;
