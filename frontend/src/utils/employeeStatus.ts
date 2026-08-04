// ── Offboarded-employee exclusion (frontend single source of truth) ──────────
// Mirrors backend/src/utils/employeeStatus.js. An employee is "offboarded" when
// their status is one of these. Offboarded employees are hidden from active
// operational UI (attendance, payroll, leave, shift, tasks, selection dropdowns,
// bulk actions, active counts) but remain visible in the Offboarding module,
// Archive section, Historical Reports, and Employee History/Audit views.
export const OFFBOARDED_STATUSES = ['Offboarded', 'Archived', 'Resigned', 'Terminated', 'Inactive'];

const offboardedSet = new Set(OFFBOARDED_STATUSES.map((s) => s.toLowerCase()));

/** True when a status string represents an offboarded employee (case-insensitive). */
export const isOffboarded = (status?: string | null): boolean =>
  offboardedSet.has(String(status || '').toLowerCase());

/** True when an employee should appear in active operational modules. */
export const isActiveEmployee = (emp?: { status?: string | null } | null): boolean =>
  !!emp && !isOffboarded(emp.status);

/**
 * Locked-record policy — mirrors `lockRejection` in the backend util.
 *
 * A PREVIOUS (offboarded) employee is a historical employment record: view and
 * download stay open, but every write (edit, delete, salary, attendance,
 * department/designation, personal, bank, document upload) is blocked. HR gets
 * the record back by re-onboarding, which creates a NEW active record.
 *
 * Super Admin keeps a break-glass override for data corrections; the server
 * enforces the same exception, so this is a UI mirror of the rule, never the
 * rule itself.
 */
export const isRecordLocked = (
  emp?: { status?: string | null } | null,
  role?: string | null,
): boolean => !!emp && isOffboarded(emp.status) && role !== 'Super Admin';

/** The banner/refusal wording, kept identical everywhere it is shown. */
export const LOCKED_RECORD_MESSAGE =
  'This employee has been offboarded. Employee details are locked and cannot be modified. ' +
  'To make changes, first re-onboard the employee.';
