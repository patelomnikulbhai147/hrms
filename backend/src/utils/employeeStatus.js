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

module.exports = { OFFBOARDED_STATUSES, ACTIVE_EMPLOYEE_WHERE, isOffboarded };
