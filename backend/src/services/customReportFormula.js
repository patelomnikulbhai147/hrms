/**
 * customReportFormula — a SAFE arithmetic evaluator for calculated columns.
 *
 * A calculated column's expression may reference other columns by their registry
 * key wrapped in braces — e.g.  `{pay.basicSalary} + {pay.allowances} - {pay.deductions}`.
 * The expression is tokenised, compiled to RPN with a shunting-yard parser, and
 * evaluated per row over the already-fetched numeric values. There is NO `eval`,
 * `Function`, template interpolation or property access — only numbers, the four
 * operators, parentheses, unary minus and a small allowlist of math functions can
 * appear, so a formula can never execute arbitrary code or read anything outside
 * the row values passed in. Field tokens are validated against the report's field
 * allowlist by the caller before compile.
 */

const FUNCS = {
  abs: Math.abs, round: (x) => Math.round(x), floor: Math.floor, ceil: Math.ceil,
  min: Math.min, max: Math.max, sqrt: (x) => Math.sqrt(Math.max(0, x)),
  // round to n decimals: round2(x) etc. handled as round(x*100)/100 by the user;
  // we also expose a 2-arg round.
};
const FUNC_ARITY = { abs: 1, round: 1, floor: 1, ceil: 1, min: 2, max: 2, sqrt: 1 };

const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, 'u-': 3, '^': 4 };
const RIGHT = { '^': true, 'u-': true };

// Tokenise. Returns { tokens, refs } or throws on an illegal character.
function tokenize(expr) {
  const tokens = [];
  const refs = new Set();
  let i = 0;
  const s = String(expr || '');
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue; }
    if (ch === '{') { // {field.key}
      const end = s.indexOf('}', i);
      if (end === -1) throw new Error('Unclosed { in formula');
      const key = s.slice(i + 1, end).trim();
      if (!/^[\w.]+$/.test(key)) throw new Error(`Illegal field reference "${key}"`);
      tokens.push({ t: 'ref', v: key }); refs.add(key); i = end + 1; continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const num = Number(s.slice(i, j));
      if (!Number.isFinite(num)) throw new Error(`Bad number near "${s.slice(i, j)}"`);
      tokens.push({ t: 'num', v: num }); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(ch)) { // function name
      let j = i + 1;
      while (j < s.length && /[a-zA-Z_0-9]/.test(s[j])) j++;
      const name = s.slice(i, j).toLowerCase();
      if (!FUNCS[name]) throw new Error(`Unknown function "${name}"`);
      tokens.push({ t: 'func', v: name }); i = j; continue;
    }
    if ('+-*/%^(),'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    throw new Error(`Illegal character "${ch}" in formula`);
  }
  return { tokens, refs: [...refs] };
}

// Shunting-yard → RPN, with unary-minus detection.
function toRPN(tokens) {
  const out = [], ops = [];
  let prev = null;
  for (const tk of tokens) {
    if (tk.t === 'num' || tk.t === 'ref') { out.push(tk); prev = tk; continue; }
    if (tk.t === 'func') { ops.push(tk); prev = tk; continue; }
    if (tk.t === 'op') {
      if (tk.v === ',') {
        while (ops.length && !(ops[ops.length - 1].t === 'op' && ops[ops.length - 1].v === '(')) out.push(ops.pop());
        if (!ops.length) throw new Error('Misplaced comma in formula');
        prev = tk; continue;
      }
      if (tk.v === '(') { ops.push(tk); prev = tk; continue; }
      if (tk.v === ')') {
        while (ops.length && !(ops[ops.length - 1].t === 'op' && ops[ops.length - 1].v === '(')) out.push(ops.pop());
        if (!ops.length) throw new Error('Unbalanced ) in formula');
        ops.pop(); // discard '('
        if (ops.length && ops[ops.length - 1].t === 'func') out.push(ops.pop());
        prev = tk; continue;
      }
      // operator: decide unary minus
      let op = tk.v;
      const unary = op === '-' && (!prev || (prev.t === 'op' && prev.v !== ')'));
      if (unary) op = 'u-';
      const p = PREC[op];
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t !== 'op' || top.v === '(') break;
        const topOp = top.v === '-' && top.unary ? 'u-' : top.v;
        const tp = PREC[topOp];
        if (tp > p || (tp === p && !RIGHT[op])) out.push(ops.pop()); else break;
      }
      ops.push({ t: 'op', v: op === 'u-' ? '-' : op, unary, rpnOp: op });
      prev = tk; continue;
    }
  }
  while (ops.length) { const o = ops.pop(); if (o.v === '(') throw new Error('Unbalanced ( in formula'); out.push(o); }
  return out;
}

/**
 * Compile a formula string once. Returns { evaluate(rowValues), refs } where
 * rowValues is a { fieldKey: number } map. Throws on syntax errors so the caller
 * can reject a bad calculated column at save/run time.
 */
function compile(expr) {
  const { tokens, refs } = tokenize(expr);
  if (!tokens.length) throw new Error('Empty formula');
  const rpn = toRPN(tokens);
  const evaluate = (vals) => {
    const st = [];
    for (const tk of rpn) {
      if (tk.t === 'num') { st.push(tk.v); continue; }
      if (tk.t === 'ref') { const n = Number(vals?.[tk.v]); st.push(Number.isFinite(n) ? n : 0); continue; }
      if (tk.t === 'func') {
        const arity = FUNC_ARITY[tk.v] || 1;
        const args = []; for (let k = 0; k < arity; k++) args.unshift(st.pop() ?? 0);
        st.push(Number(FUNCS[tk.v](...args)) || 0); continue;
      }
      if (tk.t === 'op') {
        const o = tk.rpnOp || tk.v;
        if (o === 'u-') { st.push(-(st.pop() ?? 0)); continue; }
        const b = st.pop() ?? 0, a = st.pop() ?? 0;
        let r = 0;
        switch (o) {
          case '+': r = a + b; break;
          case '-': r = a - b; break;
          case '*': r = a * b; break;
          case '/': r = b === 0 ? 0 : a / b; break;
          case '%': r = b === 0 ? 0 : a % b; break;
          case '^': r = Math.pow(a, b); break;
          default: r = 0;
        }
        st.push(Number.isFinite(r) ? r : 0); continue;
      }
    }
    const out = st.pop();
    return Number.isFinite(out) ? out : 0;
  };
  return { evaluate, refs };
}

module.exports = { compile, tokenize };
