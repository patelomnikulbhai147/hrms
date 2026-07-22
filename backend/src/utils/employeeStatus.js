// ── Offboarded-employee exclusion (single source of truth) ───────────────────
// An employee is "offboarded" when their status is one of these. Offboarded
// employees are excluded from all ACTIVE operational modules (attendance,
// payroll generation, leave accrual/carry-forward, shift assignment, active
// counts) but remain in historical/audit/archive views and in dedup/code
// uniqueness checks. Their attendance/payroll/leave records are preserved.
//
// MySQL string columns use a case-insensitive collation (utf8mb4_*_ci), so a
// Prisma `notIn: OFFBOARDED_STATUSES` matches regardless of casing.
const OFFBOARDED_STATUSES = ['Offboarded', 'Archived', 'Resigned', 'Terminated', 'Inactive'];

// Spread into a Prisma `where` for any ACTIVE-employee query, e.g.
//   const where = { ...ACTIVE_EMPLOYEE_WHERE };  where.OR = [...];
// Keeps Active, On Leave, and any non-offboarded status visible.
const ACTIVE_EMPLOYEE_WHERE = { status: { notIn: OFFBOARDED_STATUSES } };

// JS-side predicate for single records already loaded into memory.
const isOffboarded = (status) =>
  OFFBOARDED_STATUSES.some((s) => s.toLowerCase() === String(status || '').toLowerCase());

// ── Locked-record policy (single source of truth) ────────────────────────────
// A PREVIOUS (offboarded) employee is a historical employment record: it is
// read-only for everyone except a Super Admin, who keeps a break-glass override
// for data corrections. To change anything else, HR must re-onboard the person,
// which creates a NEW active record and leaves this one permanently intact.
//
// Returns an error body when the write must be refused, or null when allowed —
// so every controller refuses with the same code and the same wording.
const LOCKED_RECORD_CODE = 'EMPLOYEE_RECORD_LOCKED';

const lockRejection = (status, user, what = 'This employee') => {
  if (!isOffboarded(status)) return null;
  if (user && user.role === 'Super Admin') return null;
  return {
    code: LOCKED_RECORD_CODE,
    error: `${what} has been offboarded. The record is locked and cannot be modified. ` +
      `To make changes, re-onboard the employee first.`,
  };
};

module.exports = {
  OFFBOARDED_STATUSES,
  ACTIVE_EMPLOYEE_WHERE,
  isOffboarded,
  LOCKED_RECORD_CODE,
  lockRejection,
};
