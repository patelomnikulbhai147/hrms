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

// Real, writable scalar columns on Employee (excludes relations + the id PK).
const EMPLOYEE_SCALARS = (() => {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Employee');
  const names = new Set(
    model.fields
      .filter((f) => f.kind === 'scalar' && f.name !== 'id')
      .map((f) => f.name)
  );
  // companyId / branchId / shiftId are FK scalars Prisma exposes for writes.
  ['companyId', 'branchId', 'shiftId'].forEach((k) => names.add(k));
  return names;
})();

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
    if (EMPLOYEE_SCALARS.has(key)) out[key] = value;
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

module.exports = { prepareEmployeeWriteData, EMPLOYEE_SCALARS };
