// ─────────────────────────────────────────────────────────────────────────────
// TASK STATUS — the single source of truth for the Task Manager status workflow.
//
// "Pending" no longer exists. A task is created as "In Progress" and only ever
// moves to "Completed" or "Cancelled".
//
// "Overdue" is NEVER stored and never manually selectable — it is DERIVED:
//     today > dueDate  AND  status ≠ Completed  AND  status ≠ Cancelled
// so a task becomes overdue on its own the day after it is due, and stops being
// overdue the moment it is completed or cancelled.
// ─────────────────────────────────────────────────────────────────────────────

/** The only statuses a user may pick. */
export const TASK_STATUSES = ['In Progress', 'Completed', 'Cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const OVERDUE_STATUS = 'Overdue';
export const DEFAULT_TASK_STATUS: TaskStatus = 'In Progress';

/** Filter options (calculated Overdue included) — "All Status" is added by the UI. */
export const TASK_FILTER_STATUSES: string[] = [...TASK_STATUSES, OVERDUE_STATUS];

export const TASK_STATUS_VARIANT: Record<string, any> = {
  'In Progress': 'blue',
  Completed: 'green',
  Cancelled: 'gray',
  [OVERDUE_STATUS]: 'red',
};

/**
 * Map any stored value onto a selectable status. Legacy rows ("Pending", and the
 * old manually-set "Overdue") therefore read as "In Progress" even if a record
 * somehow escaped the data migration.
 */
export const normalizeTaskStatus = (status: any): TaskStatus =>
  (TASK_STATUSES as readonly string[]).includes(String(status)) ? (String(status) as TaskStatus) : DEFAULT_TASK_STATUS;

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** true when the task is past its due date and still open. */
export const isTaskOverdue = (task: any, now: Date = new Date()): boolean => {
  const status = normalizeTaskStatus(task?.status);
  if (status === 'Completed' || status === 'Cancelled') return false;
  if (!task?.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return startOfDay(now).getTime() > startOfDay(due).getTime();
};

/** What the user SEES: the stored status, upgraded to "Overdue" when it applies. */
export const effectiveTaskStatus = (task: any, now: Date = new Date()): string =>
  (isTaskOverdue(task, now) ? OVERDUE_STATUS : normalizeTaskStatus(task?.status));
