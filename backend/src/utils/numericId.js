// ─────────────────────────────────────────────────────────────────────────────
// STRICT NUMERIC IDS FOR PRISMA FILTERS
//
// Prisma's leniency about ids is inconsistent, and that inconsistency is what
// produces "works here, throws there" validation errors:
//
//   { branchId: '5' }                     → OK   (top-level coercion)
//   { OR: [{ branchId: '5' }] }           → THROW  Expected IntNullableFilter,
//                                                  Int or Null, provided String
//   { id: { in: ['1','2'] } }             → OK   (uniform array coerces)
//   { id: { in: [1, 'x'] } }              → THROW  Expected Int, provided String
//   { id: { in: [1, undefined] } }        → THROW  Argument `in` is missing
//
// So a numeric string survives a top-level filter but is rejected the moment the
// same value is nested inside a boolean combinator. Request bodies are JSON —
// ids routinely arrive as strings — so any `where` that puts a request id inside
// OR/AND is a latent 500.
//
// `utils/idParam.js` is deliberately forgiving (it returns non-numeric input
// unchanged, for legacy callers). These helpers are the opposite: they either
// produce a usable positive integer or tell you they could not, so a controller
// can answer with a clear 400 instead of leaking a Prisma validation error.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A database id, or `undefined` when the value cannot be one.
 *
 * Accepts numbers and numeric strings; rejects blank, null, NaN, Infinity,
 * non-integers, zero and negatives (autoincrement ids start at 1). Booleans are
 * rejected too — `Number(true) === 1` would otherwise smuggle in a fake id.
 *
 * @returns {number|undefined}
 */
function toPositiveInt(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return undefined;
  if (typeof value === 'object') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

/** True when the caller actually supplied something (vs. omitted the field). */
const wasSupplied = (value) => value !== undefined && value !== null && value !== '';

/**
 * Clean a list of ids for use in `{ in: [...] }`.
 *
 * Returns the de-duplicated valid ids AND the values that were thrown away, so
 * the caller can log or report them rather than silently narrowing the query —
 * a dropped id means an employee that was asked for but not processed.
 *
 * @returns {{ ids: number[], rejected: any[] }}
 */
function toPositiveIntList(value) {
  const raw = Array.isArray(value) ? value : [value];
  const ids = [];
  const rejected = [];
  const seen = new Set();
  for (const item of raw) {
    const n = toPositiveInt(item);
    if (n === undefined) { rejected.push(item); continue; }
    if (seen.has(n)) continue;
    seen.add(n);
    ids.push(n);
  }
  return { ids, rejected };
}

module.exports = { toPositiveInt, toPositiveIntList, wasSupplied };
