// ─────────────────────────────────────────────────────────────────────────────
// formulaEngine — client-side helpers for the Payroll Formula Builder UI ONLY.
//
// Powers validation, dependency extraction, circular-reference detection and a
// safe *sample* preview evaluator for the configuration/editing experience. It
// does NOT run real payroll — the authoritative payroll engine stays in the
// backend. No API / DB / schema involvement; pure functions over strings.
// ─────────────────────────────────────────────────────────────────────────────

export interface FormulaLike {
  id: string;
  target: string;
  expression: string;
  description?: string;
  status?: string;
  createdBy?: string;
  createdAt?: string;
  history?: any[];
}

// Canonical single-token variables available inside a formula. Display labels may
// differ (see VARIABLE_LABELS) but the token used in expressions is spaceless.
export const KNOWN_VARIABLES = [
  'CTC', 'Basic', 'HRA', 'DA', 'Bonus', 'Overtime', 'Gross', 'Net',
  'LOP', 'LeaveDeduction', 'Tax', 'PF', 'ESI',
];
export const VARIABLE_LABELS: Record<string, string> = { LeaveDeduction: 'Leave Deduction' };
export const FUNCTIONS = ['Round', 'Min', 'Max', 'If'];

export const labelFor = (token: string) => VARIABLE_LABELS[token] || token;
export const tokenOf = (name: string) => (name || '').replace(/\s+/g, '');

// ── Tokenizer ────────────────────────────────────────────────────────────────
type Tok = { t: 'num' | 'id' | 'op' | 'paren' | 'comma'; v: string };
const OPS2 = ['>=', '<=', '==', '!='];
const OPS1 = ['>', '<', '+', '-', '*', '/'];

const tokenize = (src: string): Tok[] => {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '(' || c === ')') { out.push({ t: 'paren', v: c }); i++; continue; }
    if (c === ',') { out.push({ t: 'comma', v: ',' }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: 'num', v: src.slice(i, j) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if (OPS1.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}"`);
  }
  return out;
};

// ── Parser (recursive descent → AST) ─────────────────────────────────────────
type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'call'; name: string; args: Node[] }
  | { k: 'unary'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node };

const parse = (src: string): Node => {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = () => toks[p++];
  const expect = (v: string) => {
    const t = toks[p];
    if (!t || t.v !== v) throw new Error(v === ')' ? 'Missing closing bracket )' : `Expected "${v}"`);
    p++;
  };

  const expr = (): Node => comparison();
  const comparison = (): Node => {
    let a = add();
    while (peek() && peek().t === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes(peek().v)) {
      const op = eat().v; a = { k: 'bin', op, a, b: add() };
    }
    return a;
  };
  const add = (): Node => {
    let a = mul();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) { const op = eat().v; a = { k: 'bin', op, a, b: mul() }; }
    return a;
  };
  const mul = (): Node => {
    let a = unary();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) { const op = eat().v; a = { k: 'bin', op, a, b: unary() }; }
    return a;
  };
  const unary = (): Node => {
    if (peek() && peek().t === 'op' && peek().v === '-') { eat(); return { k: 'unary', a: unary() }; }
    if (peek() && peek().t === 'op' && peek().v === '+') { eat(); return unary(); }
    return primary();
  };
  const primary = (): Node => {
    const t = peek();
    if (!t) throw new Error('Unexpected end of formula');
    if (t.t === 'num') { eat(); return { k: 'num', v: parseFloat(t.v) }; }
    if (t.t === 'paren' && t.v === '(') { eat(); const e = expr(); expect(')'); return e; }
    if (t.t === 'id') {
      eat();
      if (peek() && peek().t === 'paren' && peek().v === '(') {
        eat();
        const args: Node[] = [];
        if (!(peek() && peek().v === ')')) {
          args.push(expr());
          while (peek() && peek().t === 'comma') { eat(); args.push(expr()); }
        }
        expect(')');
        return { k: 'call', name: t.v, args };
      }
      return { k: 'var', name: t.v };
    }
    if (t.t === 'paren' && t.v === ')') throw new Error('Unbalanced bracket )');
    throw new Error(`Unexpected token "${t.v}"`);
  };

  const node = expr();
  if (p < toks.length) throw new Error(`Unexpected token "${toks[p].v}"`);
  return node;
};

const collect = (n: Node, acc: { vars: Set<string>; funcs: Set<string> }): void => {
  switch (n.k) {
    case 'num': return;
    case 'var': acc.vars.add(n.name); return;
    case 'unary': collect(n.a, acc); return;
    case 'bin': collect(n.a, acc); collect(n.b, acc); return;
    case 'call': acc.funcs.add(n.name); n.args.forEach((a) => collect(a, acc)); return;
  }
};

const evalNode = (n: Node, ctx: Record<string, number>): number => {
  switch (n.k) {
    case 'num': return n.v;
    case 'var': return Number(ctx[n.name] ?? 0);
    case 'unary': return -evalNode(n.a, ctx);
    case 'bin': {
      const a = evalNode(n.a, ctx), b = evalNode(n.b, ctx);
      switch (n.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? 0 : a / b;
        case '>': return a > b ? 1 : 0;
        case '<': return a < b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '==': return a === b ? 1 : 0;
        case '!=': return a !== b ? 1 : 0;
        default: return 0;
      }
    }
    case 'call': {
      const args = n.args.map((x) => evalNode(x, ctx));
      switch (n.name) {
        case 'Round': return Math.round(args[0] ?? 0);
        case 'Min': return Math.min(...(args.length ? args : [0]));
        case 'Max': return Math.max(...(args.length ? args : [0]));
        case 'If': return (args[0] ? args[1] : args[2]) ?? 0;
        default: throw new Error(`Unknown function "${n.name}()"`);
      }
    }
  }
};

// ── Public API ───────────────────────────────────────────────────────────────

/** Validate a formula against the known variables + the other component names. */
export const validateFormula = (expr: string, otherNames: string[]): { ok: boolean; message: string } => {
  const trimmed = (expr || '').trim();
  if (!trimmed) return { ok: false, message: 'Formula is empty.' };
  let ast: Node;
  try {
    ast = parse(trimmed);
  } catch (e: any) {
    const m = String(e?.message || 'Invalid formula');
    if (/bracket/i.test(m)) return { ok: false, message: 'Missing or unbalanced bracket ( ).' };
    return { ok: false, message: m };
  }
  const acc = { vars: new Set<string>(), funcs: new Set<string>() };
  collect(ast, acc);
  const known = new Set<string>([...KNOWN_VARIABLES, ...otherNames.map(tokenOf)]);
  for (const v of acc.vars) if (!known.has(v)) return { ok: false, message: `Unknown variable: ${labelFor(v)}` };
  for (const f of acc.funcs) if (!FUNCTIONS.includes(f)) return { ok: false, message: `Unknown function: ${f}()` };
  return { ok: true, message: 'Valid formula' };
};

/** Variables/components a formula depends on (for the "Depends On" chips). */
export const extractDependencies = (expr: string, allNames: string[]): string[] => {
  let ast: Node;
  try { ast = parse(expr); } catch { return []; }
  const acc = { vars: new Set<string>(), funcs: new Set<string>() };
  collect(ast, acc);
  const known = new Set<string>([...KNOWN_VARIABLES, ...allNames.map(tokenOf)]);
  return [...acc.vars].filter((v) => known.has(v));
};

/** Detect a circular chain among the formula targets; returns the cycle or null. */
export const findCircular = (formulas: FormulaLike[]): string[] | null => {
  const nameByToken = new Map<string, string>();
  formulas.forEach((f) => nameByToken.set(tokenOf(f.target), f.target));
  const deps = new Map<string, string[]>();
  formulas.forEach((f) => {
    let d: string[] = [];
    try {
      const acc = { vars: new Set<string>(), funcs: new Set<string>() };
      collect(parse(f.expression || '0'), acc);
      d = [...acc.vars].filter((v) => nameByToken.has(v));
    } catch { d = []; }
    deps.set(tokenOf(f.target), d);
  });

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  let cycle: string[] | null = null;

  const dfs = (u: string) => {
    if (cycle) return;
    color.set(u, GRAY); stack.push(u);
    for (const v of deps.get(u) || []) {
      if (cycle) break;
      const cv = color.get(v) ?? WHITE;
      if (cv === GRAY) { const idx = stack.indexOf(v); cycle = [...stack.slice(idx), v].map((t) => nameByToken.get(t) || t); break; }
      if (cv === WHITE) dfs(v);
    }
    color.set(u, BLACK); stack.pop();
  };
  for (const t of deps.keys()) { if (cycle) break; if ((color.get(t) ?? WHITE) === WHITE) dfs(t); }
  return cycle;
};

/**
 * Build a sample evaluation context: seed CTC and iterate the formulas a few
 * passes so short dependency chains (CTC → Basic → HRA/PF) resolve. Variables
 * not produced by a formula default to 0.
 */
export const buildPreviewContext = (formulas: FormulaLike[], sampleCTC: number): Record<string, number> => {
  const ctx: Record<string, number> = {};
  KNOWN_VARIABLES.forEach((v) => { ctx[v] = 0; });
  ctx.CTC = sampleCTC;
  for (let pass = 0; pass < formulas.length + 2; pass++) {
    formulas.forEach((f) => {
      try { ctx[tokenOf(f.target)] = evalNode(parse(f.expression || '0'), ctx); } catch { /* skip invalid */ }
    });
  }
  return ctx;
};

/** Evaluate a single expression against a context; null if it cannot evaluate. */
export const evalFormula = (expr: string, ctx: Record<string, number>): number | null => {
  try { return evalNode(parse(expr), ctx); } catch { return null; }
};

/** Human-friendly rendering: × ÷ and spaced labels (display only). */
export const prettyExpr = (expr: string): string =>
  (expr || '')
    .replace(/\bLeaveDeduction\b/g, 'Leave Deduction')
    .replace(/\*/g, ' × ')
    .replace(/\//g, ' ÷ ')
    .replace(/\s+/g, ' ')
    .trim();
