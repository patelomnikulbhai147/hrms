// ── "Is this employee at work today?" (single source of truth) ───────────────
// The attendance engine owns the STATUS; this module only classifies the status
// it produced. Nothing here invents, overrides or writes a status.
//
// It exists because the rule had drifted into two different implementations: the
// dashboard's "Present Today" card tested /present/i (so Work From Home and On
// Duty were NOT counted) while Today's Attendance used a status list plus a
// shift-outcome regex (so they were). The two tiles disagreed on the same day,
// which is exactly the mismatch a summary card must never have.

/** Statuses that mean "working today" outright. */
export const PRESENT_STATUSES = ['Present', 'Work From Home', 'On Duty'];

/**
 * Shift-specific "at work" outcomes the engine may assign once a punch arrives
 * (Late, Early Out, Late Present, On Duty, Overtime…). Recognised, never
 * redefined — the engine remains the only thing that decides them.
 */
export const AT_WORK = /\b(late|early\s*out|early\s*going|on\s*duty|overtime)\b/i;

/** True when the status means the employee is at work today. */
export const isAtWork = (status?: string | null): boolean => {
  const st = String(status || '');
  return PRESENT_STATUSES.includes(st) || AT_WORK.test(st);
};

/**
 * True for a legitimate non-working day. These are NOT absences and are excluded
 * from attendance tallies entirely — counting them would flood the absent list
 * every Sunday and on every public holiday.
 */
export const isNonWorkingDay = (status?: string | null): boolean => {
  const st = String(status || '');
  return st === 'Weekly Off' || st === 'Holiday';
};
