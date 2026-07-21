/**
 * Sanitize an employee create/update payload before it reaches Prisma.
 *
 * The employee edit form spreads the whole record (plus helper-only fields such
 * as `confirmAccountNumber` and `codeMode`) into the request body. Prisma rejects
 * any key that isn't a real column, so we whitelist to the Employee model's own
 * scalar fields (read from Prisma's schema metadata — never hand-maintained) and
 * coerce the bonus config fields to their column types.
 */
const { Prisma } = require('@prisma/client');

// SYSTEM columns the client may never write. The edit form spreads the WHOLE
// record it loaded into the request body, so it echoes `id`, `createdAt` and
// `updatedAt` straight back. `updatedAt` is `@updatedAt`, but Prisma only fills
// it in when the caller does NOT supply it — an explicit value wins. The result
// on production: every save wrote the row's OWN stale timestamp back, so
// `updatedAt` never advanced (employee #8 still read 2026-06-16 after four
// successful saves today) and "when was this record last changed?" became
// unanswerable for audit, sync and support. Writing `createdAt` is worse still:
// a client could rewrite a record's history.
const SYSTEM_COLUMNS = new Set(['id', 'createdAt', 'updatedAt']);

// Real, writable scalar columns on Employee (excludes relations, the id PK and
// the system timestamps above), each mapped to its Prisma scalar TYPE
// (Int / Float / DateTime / Boolean / …). Read from the schema metadata so it
// can never drift from the actual columns.
const EMPLOYEE_FIELD_TYPES = (() => {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Employee');
  const map = new Map();
  model.fields
    .filter((f) => f.kind === 'scalar' && !SYSTEM_COLUMNS.has(f.name))
    .forEach((f) => map.set(f.name, f.type));
  // companyId / branchId / shiftId are FK scalars Prisma exposes for writes.
  // (They're already scalar in the datamodel, but assert their Int type here so
  // the coercion below always applies even if the introspection shape changes.)
  ['companyId', 'branchId', 'shiftId'].forEach((k) => { if (!map.has(k)) map.set(k, 'Int'); });
  return map;
})();

// Backward-compatible export: the set of valid column names.
const EMPLOYEE_SCALARS = new Set(EMPLOYEE_FIELD_TYPES.keys());

// Required (non-nullable) scalar columns. A coerced-to-null value for one of these
// (e.g. a non-numeric salary, a blank required date) must NOT be sent as explicit
// null — Prisma rejects it with a cryptic relation error. We OMIT the key instead
// so the column default applies on create and the existing value is preserved on
// update; `applyCreateDefaults` supplies a value for the ones with no DB default.
const EMPLOYEE_REQUIRED = (() => {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Employee');
  const set = new Set(
    model.fields
      .filter((f) => f.kind === 'scalar' && f.isRequired && !f.isId && !f.isUpdatedAt)
      .map((f) => f.name)
  );
  set.add('companyId');
  return set;
})();

const toIntOrNull = (v) => {
  if (v === undefined) return undefined;          // leave untouched (partial update)
  if (v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
};

const toDateOrNull = (v) => {
  if (v === undefined) return undefined;          // leave untouched (partial update)
  if (v === null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toNumberOrNull = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Returns a NEW object containing only valid Employee columns, with the bonus
 * config fields coerced. Mutates nothing the caller passed in.
 */
function prepareEmployeeWriteData(data) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (!EMPLOYEE_FIELD_TYPES.has(key)) continue;
    // Coerce each value to the column's real Prisma type. Prisma performs NO
    // implicit string→Int/Float/DateTime coercion, so a workspace-layer string id
    // (companyId "16"), a text salary ("25000"), or an ISO date string reaches the
    // client as the wrong type and blows up the whole write with a cryptic
    // "Invalid `prisma.employee.upsert()` invocation". Normalising here — the single
    // chokepoint every create/update path funnels through — fixes it everywhere.
    const type = EMPLOYEE_FIELD_TYPES.get(key);
    let coerced;
    if (type === 'Int') coerced = toIntOrNull(value);
    else if (type === 'Float') coerced = toNumberOrNull(value);
    else if (type === 'DateTime') coerced = toDateOrNull(value);
    else if (type === 'Boolean') coerced = (value === true || value === 'true' || value === 1 || value === '1');
    else coerced = value;                           // String / Json — pass through
    // A required column can never take an explicit null (Prisma rejects it). When
    // the input didn't coerce to a usable value, drop the key so the DB default /
    // create-default fills it and existing data survives on update.
    if (coerced === null && EMPLOYEE_REQUIRED.has(key)) continue;
    out[key] = coerced;
  }

  // Bonus configuration coercion (only when the key was actually provided).
  if ('bonusApplicable' in out) {
    out.bonusApplicable = out.bonusApplicable === true || out.bonusApplicable === 'true' || out.bonusApplicable === 1;
  }
  if ('bonusValue' in out) out.bonusValue = toNumberOrNull(out.bonusValue);
  if ('bonusEffectiveDate' in out) out.bonusEffectiveDate = toDateOrNull(out.bonusEffectiveDate);
  if ('bonusEndDate' in out) out.bonusEndDate = toDateOrNull(out.bonusEndDate);
  // Blank type/method/notes → null for tidy storage.
  for (const k of ['bonusType', 'bonusCalcMethod', 'bonusNotes']) {
    if (k in out && (out[k] === '' || out[k] === undefined)) out[k] = null;
  }
  // If bonus is not applicable, clear the dependent fields so stale values never
  // leak into payroll.
  if (out.bonusApplicable === false) {
    Object.assign(out, {
      bonusType: null, bonusCalcMethod: null, bonusValue: null,
      bonusEffectiveDate: null, bonusEndDate: null, bonusNotes: null,
    });
  }

  return out;
}

/**
 * Fill required, no-DB-default columns so a CREATE never crashes with a raw
 * "Argument `email` must not be null". Apply ONLY to a create payload (never to an
 * update patch — that would overwrite existing data with blanks). companyId and
 * employeeId are guaranteed by the caller's validation, so they're left alone.
 * Returns a NEW object; mutates nothing.
 */
function applyCreateDefaults(payload) {
  const out = { ...payload };
  if (out.name == null || out.name === '') out.name = out.employeeId ? String(out.employeeId) : 'Unnamed';
  if (out.email == null) out.email = '';
  if (out.department == null || out.department === '') out.department = 'General';
  if (out.designation == null || out.designation === '') out.designation = 'Staff';
  if (out.joinDate == null) out.joinDate = new Date();
  return out;
}

/**
 * Translate a Prisma write error into a short, human-readable reason for the
 * per-row import log. Falls back to the raw message (never the giant invocation
 * dump — that's `e.message`; we prefer `e.code`-driven text).
 */
function describePrismaWriteError(e) {
  const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(', ') : (e?.meta?.target || '');
  switch (e?.code) {
    case 'P2002': return `Duplicate value for ${target || 'a unique field'} — already exists`;
    case 'P2003': return `Related record not found for ${e?.meta?.field_name || 'a linked field'} (check company/branch/shift mapping)`;
    case 'P2000': return `Value too long for ${e?.meta?.column_name || 'a field'}`;
    case 'P2011': return `Missing required value for ${target || 'a required field'}`;
    case 'P2025': return 'Record to update was not found';
    default: break;
  }
  // Prisma validation errors (bad type / missing arg) come without a code but with
  // a multi-line invocation dump — surface only the concise trailing reason.
  const msg = String(e?.message || 'Database error');
  const m = msg.match(/Argument `?\w+`?[^\n]*|Invalid value[^\n]*|Expected[^\n]*/);
  return (m ? m[0] : msg.split('\n').pop() || 'Database error').trim().slice(0, 200);
}

module.exports = { prepareEmployeeWriteData, applyCreateDefaults, describePrismaWriteError, EMPLOYEE_SCALARS };
