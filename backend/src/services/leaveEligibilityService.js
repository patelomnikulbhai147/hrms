// ─────────────────────────────────────────────────────────────────────────────
// Leave-type eligibility — ONE rule, read by the form and enforced by the API.
//
// The Log Employee Leave dialog rendered a hardcoded array
// (`['Annual','Sick','Casual','Maternity','Paternity','Unpaid']`) with no
// eligibility concept at all, and leaveController.create validated only the
// BALANCE. So a male employee was offered Maternity Leave, and — more seriously —
// a direct POST of any leave type for any employee was accepted. Hiding the
// option in the dropdown would have fixed the screenshot and none of the problem.
//
// Eligibility lives in the LeaveTypePolicy table, per company, so HR configures
// it. This module owns the defaults, the matching, and the verdict; nothing else
// decides who may take what.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');

/**
 * The seeded master. A company row in `leave_type_policy` overrides the entry
 * with the same `code`; anything not overridden behaves as configured here.
 *
 * `aliases` exist because live data already holds bare names ('Maternity',
 * 'Unpaid') while the UI shows full labels ('Maternity Leave', 'LOP'). Matching
 * has to cover both or enforcement would miss the exact strings people post.
 */
const LEAVE_TYPE_DEFAULTS = [
  { code: 'annual',     label: 'Annual Leave',     eligibleGender: 'All',    aliases: ['annual', 'privilege', 'pl'] },
  { code: 'casual',     label: 'Casual Leave',     eligibleGender: 'All',    aliases: ['casual', 'cl'] },
  { code: 'sick',       label: 'Sick Leave',       eligibleGender: 'All',    aliases: ['sick', 'medical', 'sl'] },
  { code: 'paid',       label: 'Paid Leave',       eligibleGender: 'All',    aliases: ['paid'] },
  { code: 'earned',     label: 'Earned Leave',     eligibleGender: 'All',    aliases: ['earned', 'el'] },
  { code: 'compOff',    label: 'Comp Off',         eligibleGender: 'All',    aliases: ['comp off', 'compoff', 'compensatory off', 'compensatory'] },
  { code: 'optional',   label: 'Optional Leave',   eligibleGender: 'All',    aliases: ['optional', 'floater', 'floating'] },
  { code: 'lop',        label: 'LOP',              eligibleGender: 'All',    aliases: ['lop', 'unpaid', 'lwp', 'loss of pay', 'without pay'] },
  { code: 'bereavement',label: 'Bereavement Leave',eligibleGender: 'All',    aliases: ['bereavement', 'compassionate'] },

  // Gender-specific. These are the reason this module exists.
  { code: 'maternity',  label: 'Maternity Leave',  eligibleGender: 'Female', aliases: ['maternity'] },
  { code: 'pregnancy',  label: 'Pregnancy Leave',  eligibleGender: 'Female', aliases: ['pregnancy', 'prenatal', 'ante natal', 'antenatal'] },
  { code: 'miscarriage',label: 'Miscarriage Leave',eligibleGender: 'Female', aliases: ['miscarriage', 'pregnancy loss'] },
  { code: 'nursing',    label: 'Nursing Leave',    eligibleGender: 'Female', aliases: ['nursing', 'breastfeeding', 'lactation'] },
  // Adoption is Female by default because the statutory 12-week adoption leave
  // under the Maternity Benefit Act is a mother's entitlement. A company that
  // grants it to both parents sets this row's eligibleGender to 'All' — that is
  // exactly the "if policy differentiates" case, and it is configuration, not code.
  { code: 'adoption',   label: 'Adoption Leave',   eligibleGender: 'Female', aliases: ['adoption', 'adoptive'] },
  { code: 'paternity',  label: 'Paternity Leave',  eligibleGender: 'Male',   aliases: ['paternity'] },
];

const GENDERS = ['All', 'Male', 'Female'];

/**
 * Normalise whatever the Employee record holds.
 *
 * Production data is not clean: 713 'Female', 457 'Male', 5 'F', 2 'M' and 16
 * NULL. Comparing raw strings would have let 'F' through as "not Female" and
 * silently blocked five real employees from maternity leave.
 *
 * @returns {'Male'|'Female'|'Other'|null} null = not recorded at all.
 */
function normalizeGender(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'm' || s === 'male' || s === 'man') return 'Male';
  if (s === 'f' || s === 'female' || s === 'woman') return 'Female';
  return 'Other';
}

/** Comparison key for a leave-type name: lowercase, no "leave" suffix, single spaces. */
const norm = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/\bleaves?\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Resolve a branch/company id to the company that owns the policy. */
async function policyCompanyId(companyId) {
  const id = Number(companyId);
  if (!id) return null;
  const branch = await prisma.branch.findUnique({ where: { id }, select: { companyId: true } }).catch(() => null);
  return branch ? branch.companyId : id;
}

/**
 * Every leave type for a company: the defaults, with any configured row applied.
 * Returned in a stable order so the dropdown never reshuffles between reads.
 */
async function listTypes(companyId) {
  const cid = await policyCompanyId(companyId);
  let rows = [];
  if (cid) {
    rows = await prisma.leaveTypePolicy.findMany({ where: { companyId: cid }, orderBy: { sortOrder: 'asc' } })
      .catch(() => []); // table not migrated yet → defaults still work
  }
  const byCode = new Map(rows.map((r) => [r.code, r]));

  const merged = LEAVE_TYPE_DEFAULTS.map((d, i) => {
    const row = byCode.get(d.code);
    return {
      id: row?.id ?? null,
      code: d.code,
      label: row?.label || d.label,
      eligibleGender: GENDERS.includes(row?.eligibleGender) ? row.eligibleGender : d.eligibleGender,
      enabled: row ? !!row.enabled : true,
      sortOrder: row?.sortOrder ?? i,
      isSystem: true,
      aliases: d.aliases,
      configured: !!row,
    };
  });

  // Leave types HR added that are not in the seeded master.
  for (const r of rows) {
    if (LEAVE_TYPE_DEFAULTS.some((d) => d.code === r.code)) continue;
    merged.push({
      id: r.id, code: r.code, label: r.label,
      eligibleGender: GENDERS.includes(r.eligibleGender) ? r.eligibleGender : 'All',
      enabled: !!r.enabled, sortOrder: r.sortOrder, isSystem: false,
      aliases: [], configured: true,
    });
  }

  return merged.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** The master entry a stored leaveType string refers to, or null if unrecognised. */
function matchType(types, leaveType) {
  const n = norm(leaveType);
  if (!n) return null;
  return types.find((t) => norm(t.label) === n || norm(t.code) === n)
    || types.find((t) => (t.aliases || []).some((a) => norm(a) === n))
    || null;
}

/** Does a gender satisfy a type's rule? */
function genderAllows(eligibleGender, gender) {
  if (eligibleGender === 'All') return true;
  return gender === eligibleGender;
}

/**
 * The leave types an employee may apply for.
 * A gender-restricted type is never offered to an employee whose gender is not
 * recorded — granting maternity leave off a blank field would be a guess.
 */
async function eligibleTypesFor(employee) {
  const types = await listTypes(employee.companyId);
  const gender = normalizeGender(employee.gender);
  return types
    .filter((t) => t.enabled)
    .filter((t) => genderAllows(t.eligibleGender, gender))
    .map(({ aliases, ...t }) => t);
}

/**
 * The verdict for one application. Never throws.
 *
 * An UNRECOGNISED leave type is allowed through: companies carry historical and
 * custom type names, and refusing everything not in the master would break leave
 * entry for them. Only a type that IS in the master and IS restricted is refused
 * — the rule is enforced where it is actually configured.
 *
 * @returns {{ok: boolean, message?: string, code?: string, ...}}
 */
async function checkEligibility(employeeId, leaveType) {
  const eid = Number(employeeId);
  if (!eid) return { ok: false, code: 'EMPLOYEE_REQUIRED', message: 'An employee must be selected.' };

  const employee = await prisma.employee.findUnique({
    where: { id: eid },
    select: { id: true, name: true, gender: true, companyId: true },
  });
  if (!employee) return { ok: false, code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found.' };

  const types = await listTypes(employee.companyId);
  const type = matchType(types, leaveType);
  if (!type) {
    return { ok: true, code: 'UNRECOGNISED_TYPE', matched: null, gender: normalizeGender(employee.gender) };
  }

  if (!type.enabled) {
    return {
      ok: false, code: 'TYPE_DISABLED', matched: type.code,
      message: `${type.label} is not enabled for this company.`,
    };
  }

  const gender = normalizeGender(employee.gender);
  if (type.eligibleGender !== 'All' && !gender) {
    return {
      ok: false, code: 'GENDER_NOT_RECORDED', matched: type.code, gender: null,
      // Distinct from a plain refusal on purpose: this is a missing-data problem
      // HR can fix on the employee record, not a policy decision.
      message: `${type.label} is restricted to ${type.eligibleGender} employees, and gender is not recorded for ${employee.name}. Update the employee record first.`,
    };
  }

  if (!genderAllows(type.eligibleGender, gender)) {
    return {
      ok: false, code: 'NOT_ELIGIBLE', matched: type.code, gender,
      message: 'The selected leave type is not eligible for this employee.',
      detail: `${type.label} is available to ${type.eligibleGender} employees only.`,
    };
  }

  return { ok: true, code: 'ELIGIBLE', matched: type.code, gender };
}

module.exports = {
  LEAVE_TYPE_DEFAULTS,
  GENDERS,
  normalizeGender,
  listTypes,
  eligibleTypesFor,
  checkEligibility,
  matchType,
  policyCompanyId,
  _norm: norm,
};
