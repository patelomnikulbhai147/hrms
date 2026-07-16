/**
 * customReportEngine — turns a saved report CONFIG (JSON) into a safe, paginated
 * result set. It is the ONLY place that talks to the data models, and it does so
 * exclusively through the allowlisted [[customReportRegistry]] descriptors:
 *
 *   • Every field / operator / sort / group the client sends is a registry KEY —
 *     unknown keys are dropped, never interpolated. No SQL is ever built from user
 *     input, so the builder cannot be used for injection.
 *   • Company isolation (RULE 5): the base model's companyId is forced into the
 *     WHERE from the caller's own scope; a user can never widen it via the config.
 *   • Role field-visibility: `sensitive` fields (salary / bank / PAN / Aadhaar /
 *     PF / ESI) are stripped for roles that may not see them — in SELECT, WHERE,
 *     ORDER BY, calculated columns and the summary alike.
 *   • Server-side pagination + a hard row cap keep 100k-row datasets responsive.
 *
 * Phase 2 adds — still entirely within the allowlist:
 *   • Calculated columns: a SAFE arithmetic formula over other numeric field KEYS
 *     ([[customReportFormula]] — no eval), computed per row after fetch.
 *   • Grouping + per-group subtotals + grand totals, computed over the whole
 *     matched set (capped) so joined-relation numerics total correctly too.
 *
 * Existing report logic is untouched — this only reads via Prisma.
 */
const { getSource, OPERATORS, canSeeSensitive } = require('./customReportRegistry');
const { compile } = require('./customReportFormula');

const MAX_LIMIT = 50000;        // absolute ceiling for a flat paginated fetch
const GROUP_SCAN_CAP = 20000;   // rows scanned in-memory for grouped subtotals
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const nest = (path, leaf) => path.reduceRight((acc, key) => ({ [key]: acc }), leaf);
const getByPath = (row, path) => path.reduce((o, k) => (o == null ? o : o[k]), row);

function selectFromPaths(paths) {
  const root = {};
  for (const path of paths) {
    let node = root;
    path.forEach((key, i) => {
      if (i === path.length - 1) { if (node[key] !== undefined && node[key] !== true) return; node[key] = true; }
      else { if (!node[key] || node[key] === true) node[key] = { select: {} }; node = node[key].select; }
    });
  }
  return root;
}

function coerce(field, v) {
  if (v == null) return v;
  if (field.type === 'number') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  if (field.type === 'date') { if (field.datetime) { const d = new Date(v); return isNaN(d) ? null : d; } return String(v); }
  if (field.type === 'boolean') return v === true || v === 'true' || v === 1 || v === '1';
  return String(v);
}

function leafFor(field, op, value, value2) {
  const allowed = new Set((OPERATORS[field.type] || []).map((o) => o.op));
  if (!allowed.has(op)) return null;
  const c = (v) => coerce(field, v);
  switch (op) {
    case 'equals': return { equals: c(value) };
    case 'on': return { equals: c(value) };
    case 'notEquals': return { not: c(value) };
    case 'contains': return { contains: String(value) };
    case 'startsWith': return { startsWith: String(value) };
    case 'endsWith': return { endsWith: String(value) };
    case 'in': return { in: (Array.isArray(value) ? value : String(value).split(',')).map((v) => String(v).trim()).filter(Boolean) };
    case 'gt': case 'after': return { gt: c(value) };
    case 'gte': return { gte: c(value) };
    case 'lt': case 'before': return { lt: c(value) };
    case 'lte': return { lte: c(value) };
    case 'between': { const a = c(value), b = c(value2); if (a == null && b == null) return null; return { gte: a, lte: b }; }
    case 'isTrue': return { equals: true };
    case 'isFalse': return { equals: false };
    default: return null;
  }
}

function conditionNode(source, cond, role) {
  const field = source.fields.find((x) => x.key === cond.field);
  if (!field) return null;
  if (field.sensitive && !canSeeSensitive(role)) return null;
  if (cond.op === 'isEmpty') return { OR: [nest(field.path, { equals: '' }), nest(field.path, { equals: null })] };
  if (cond.op === 'notEmpty') return { AND: [nest(field.path, { not: '' }), nest(field.path, { not: null })] };
  const leaf = leafFor(field, cond.op, cond.value, cond.value2);
  return leaf ? nest(field.path, leaf) : null;
}

// Recursively assemble the WHERE tree from the (possibly nested) filter groups.
function buildFilterWhere(source, node, role) {
  if (!node || !Array.isArray(node.conditions) || !node.conditions.length) return null;
  const logic = node.logic === 'OR' ? 'OR' : 'AND';
  const parts = [];
  for (const c of node.conditions) {
    const built = c && Array.isArray(c.conditions) ? buildFilterWhere(source, c, role) : conditionNode(source, c, role);
    if (built) parts.push(built);
  }
  return parts.length ? { [logic]: parts } : null;
}

function buildOrderBy(source, sorts, role) {
  const orders = [];
  for (const s of Array.isArray(sorts) ? sorts : []) {
    const field = source.fields.find((x) => x.key === s.field);
    if (!field || (field.sensitive && !canSeeSensitive(role))) continue;
    orders.push(nest(field.path, s.dir === 'desc' ? 'desc' : 'asc'));
  }
  if (!orders.length) orders.push(nest(source.defaultSort, 'asc'));
  return orders;
}

// ── Calculated columns: compile each safe formula, role-gate its field refs ────
// Returns { calcs:[{key,label,format,align,evaluate}], refFields:[descriptor], warnings }
function resolveCalcs(source, config, role, warnings) {
  const raw = Array.isArray(config?.calculated) ? config.calculated : [];
  const calcs = [];
  const refFields = [];
  const seen = new Set();
  for (const c of raw) {
    const key = String(c?.key || '').trim();
    if (!key || seen.has(key)) continue;
    let compiled;
    try { compiled = compile(c?.expr || ''); }
    catch (e) { warnings.push(`Calculated column "${c?.label || key}" ignored: ${e.message}.`); continue; }
    // Every referenced key must be a real, permitted, numeric field.
    let ok = true;
    for (const refKey of compiled.refs) {
      const fld = source.fields.find((x) => x.key === refKey);
      if (!fld) { warnings.push(`Calculated column "${c?.label || key}" references unknown field "${refKey}".`); ok = false; break; }
      if (fld.sensitive && !canSeeSensitive(role)) { warnings.push(`Calculated column "${c?.label || key}" uses a restricted field — hidden for your role.`); ok = false; break; }
      if (fld.type !== 'number') { warnings.push(`Calculated column "${c?.label || key}" can only use numeric fields ("${fld.label}" is not).`); ok = false; break; }
      if (!refFields.find((r) => r.key === fld.key)) refFields.push(fld);
    }
    if (!ok) continue;
    seen.add(key);
    calcs.push({ key, label: String(c?.label || key), format: c?.format || null, align: c?.align || 'right', evaluate: compiled.evaluate, refKeys: compiled.refs });
  }
  return { calcs, refFields };
}

// In-memory numeric aggregation over a set of flattened rows.
function aggregateRows(rows, numKeys) {
  const acc = {}; numKeys.forEach((k) => (acc[k] = { sum: 0, min: Infinity, max: -Infinity, count: 0 }));
  for (const row of rows) {
    for (const k of numKeys) {
      const v = Number(row[k]);
      if (Number.isFinite(v)) { const a = acc[k]; a.sum += v; a.count++; if (v < a.min) a.min = v; if (v > a.max) a.max = v; }
    }
  }
  const out = {};
  for (const k of numKeys) { const a = acc[k]; out[k] = { sum: r2(a.sum), avg: a.count ? r2(a.sum / a.count) : 0, min: a.count ? r2(a.min) : 0, max: a.count ? r2(a.max) : 0 }; }
  return out;
}

/**
 * Run a report config and return a result set. Two shapes:
 *  • flat:    { columns, rows, total, page, limit, summary, group, warnings }
 *  • grouped: { grouped:true, columns, groups:[{keyValues,label,count,rows,subtotals}],
 *              grandTotals, total, scanned, truncated, group, warnings }
 */
async function runReport(prisma, config, ctx) {
  const warnings = [];
  const source = getSource(config?.source);
  if (!source) return { error: 'Unknown or unavailable data source.' };
  const role = ctx?.role || '';
  const scopeIds = (ctx?.companyIds || []).map(Number).filter(Boolean);
  if (!scopeIds.length) return { error: 'No company in scope.' };

  // ── Chosen display fields (drop unknown / not-permitted) ──
  const requested = Array.isArray(config?.fields) ? config.fields : [];
  const chosen = [];
  for (const key of requested) {
    const field = source.fields.find((x) => x.key === key);
    if (!field) { warnings.push(`Ignored unknown field "${key}".`); continue; }
    if (field.sensitive && !canSeeSensitive(role)) { warnings.push(`Hidden restricted field "${field.label}".`); continue; }
    if (!chosen.find((c) => c.key === field.key)) chosen.push(field);
  }

  // ── Calculated columns ──
  const { calcs, refFields } = resolveCalcs(source, config, role, warnings);
  if (!chosen.length && !calcs.length) {
    return { columns: [], rows: [], total: 0, page: 1, limit: 0, summary: null, warnings: ['Select at least one field to preview the report.'] };
  }

  // ── SELECT: chosen + sort fields + calc-referenced fields ──
  const sortFields = (Array.isArray(config?.sorts) ? config.sorts : [])
    .map((s) => source.fields.find((x) => x.key === s.field)).filter(Boolean)
    .filter((fld) => !(fld.sensitive && !canSeeSensitive(role)));
  const groupFields = (Array.isArray(config?.group) ? config.group : [])
    .map((k) => source.fields.find((x) => x.key === k)).filter(Boolean)
    .filter((fld) => !(fld.sensitive && !canSeeSensitive(role)));
  const valueFields = dedupeByKey([...chosen, ...refFields]);   // fields needed to build row values
  const select = selectFromPaths([...valueFields, ...sortFields, ...groupFields].map((fld) => fld.path));

  // ── WHERE: forced company scope AND the user filter tree ──
  const companyScope = nest(source.companyPath, { in: scopeIds });
  const filterWhere = buildFilterWhere(source, config?.filters, role);
  const where = filterWhere ? { AND: [companyScope, filterWhere] } : companyScope;
  const orderBy = buildOrderBy(source, config?.sorts, role);
  const model = prisma[source.model];

  // Flatten a fetched record → { fieldKey: value }, then apply calc columns.
  const flatten = (rec) => {
    const out = {};
    for (const fld of valueFields) out[fld.key] = getByPath(rec, fld.path);
    for (const c of calcs) out[c.key] = r2(c.evaluate(out));
    return out;
  };

  // Resolved column descriptors (chosen + calculated), with presentation overrides.
  const overrides = config?.columns || {};
  const columns = [
    ...chosen.map((fld) => ({
      key: fld.key, type: fld.type,
      header: overrides[fld.key]?.header || fld.label,
      width: overrides[fld.key]?.width || null,
      align: overrides[fld.key]?.align || (fld.type === 'number' ? 'right' : 'left'),
      format: overrides[fld.key]?.format || null,
      rules: Array.isArray(overrides[fld.key]?.rules) ? overrides[fld.key].rules : null,
    })),
    ...calcs.map((c) => ({
      key: c.key, type: 'number', calculated: true,
      header: overrides[c.key]?.header || c.label,
      width: overrides[c.key]?.width || null,
      align: overrides[c.key]?.align || c.align || 'right',
      format: overrides[c.key]?.format || c.format || null,
      rules: Array.isArray(overrides[c.key]?.rules) ? overrides[c.key].rules : null,
    })),
  ];

  // Numeric keys eligible for totals = numeric display fields + calc columns.
  const numericKeys = [
    ...chosen.filter((f) => f.type === 'number').map((f) => f.key),
    ...calcs.map((c) => c.key),
  ];
  const summaryOn = (config?.summary && typeof config.summary === 'object') ? config.summary : null;

  // ══════════════════════════ GROUPED MODE ══════════════════════════
  if (groupFields.length) {
    const scanCap = Math.min(parseInt(config?.limit, 10) || GROUP_SCAN_CAP, GROUP_SCAN_CAP);
    const [records, total] = await Promise.all([
      model.findMany({ where, select, orderBy, take: scanCap }),
      model.count({ where }),
    ]);
    const truncated = total > records.length;
    const rows = records.map(flatten);
    // Subtotal keys: whatever the user flagged in summary, else every numeric key.
    const subKeys = summaryOn ? numericKeys.filter((k) => summaryOn[k]) : numericKeys;
    const keyOf = (row) => groupFields.map((gf) => row[gf.key] ?? '—');
    const map = new Map();
    for (const row of rows) {
      const kv = keyOf(row);
      const id = kv.join(' ▸ ');
      if (!map.has(id)) map.set(id, { keyValues: kv, rows: [] });
      map.get(id).rows.push(row);
    }
    const ROWS_PER_GROUP_CAP = 500;   // keep the payload bounded on huge groups
    const groups = [...map.values()].map((g) => ({
      keyValues: g.keyValues,
      label: g.keyValues.map((v) => (v === '' || v == null ? '—' : String(v))).join(' ▸ '),
      count: g.rows.length,
      subtotals: aggregateRows(g.rows, subKeys),
      rows: g.rows.slice(0, ROWS_PER_GROUP_CAP),
      rowsTruncated: g.rows.length > ROWS_PER_GROUP_CAP,
    })).sort((a, b) => a.label.localeCompare(b.label));
    const grandTotals = { count: rows.length, fields: aggregateRows(rows, subKeys) };
    if (truncated) warnings.push(`Grouped totals are computed over the first ${records.length.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} matching records (increase filters to narrow the set).`);
    return { grouped: true, columns, groups, grandTotals, group: groupFields.map((f) => f.key), total, scanned: records.length, truncated, warnings };
  }

  // ══════════════════════════ FLAT MODE ══════════════════════════
  const page = Math.max(1, parseInt(config?.page, 10) || 1);
  let limit = parseInt(config?.limit, 10) || 50;
  limit = Math.min(Math.max(1, limit), MAX_LIMIT);
  const skip = (page - 1) * limit;

  const [records, total] = await Promise.all([
    model.findMany({ where, select, orderBy, skip, take: limit }),
    model.count({ where }),
  ]);
  const rows = records.map(flatten);

  // ── Summary aggregates ──
  let summary = null;
  if (summaryOn) {
    const fields = {};
    // Base-model numeric scalars → exact full-set aggregate via Prisma.
    const numericBase = chosen.filter((fld) => fld.type === 'number' && fld.agg && fld.path.length === 1 && summaryOn[fld.key]);
    if (numericBase.length) {
      const agg = { _sum: {}, _avg: {}, _min: {}, _max: {} };
      for (const fld of numericBase) { const col = fld.path[0]; agg._sum[col] = true; agg._avg[col] = true; agg._min[col] = true; agg._max[col] = true; }
      const res = await model.aggregate({ where, ...agg });
      for (const fld of numericBase) { const col = fld.path[0]; fields[fld.key] = { sum: r2(res._sum?.[col]), avg: r2(res._avg?.[col]), min: r2(res._min?.[col]), max: r2(res._max?.[col]) }; }
    }
    // Joined numerics + calculated columns → page-only totals (documented).
    const pageKeys = numericKeys.filter((k) => summaryOn[k] && !fields[k]);
    if (pageKeys.length) {
      const pageAgg = aggregateRows(rows, pageKeys);
      for (const k of pageKeys) fields[k] = pageAgg[k];
      warnings.push('Totals for joined / calculated columns are computed on the current page. Add a Group to total the whole set.');
    }
    summary = { count: total, fields };
  }

  return { columns, rows, total, page, limit, summary, group: [], warnings };
}

function dedupeByKey(arr) { const seen = new Set(); const out = []; for (const x of arr) { if (seen.has(x.key)) continue; seen.add(x.key); out.push(x); } return out; }

module.exports = { runReport, MAX_LIMIT };
