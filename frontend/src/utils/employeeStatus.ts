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
