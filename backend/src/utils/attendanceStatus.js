/**
 * BACKEND MIRROR of frontend/src/utils/attendanceStatus.ts.
 *
 * The reports must reconcile with the dashboard cards to the exact employee, so
 * both sides have to classify a status identically. Keeping one copy per runtime
 * (rather than re-deriving the rule in SQL) is the same pattern this codebase
 * already uses for fieldFormats.ts ↔ fieldValidators.js and employeeStatus.ts ↔
 * employeeStatus.js.
 *
 * IF YOU CHANGE A RULE HERE, CHANGE IT IN THE .ts FILE TOO — a divergence shows
 * up as a report whose totals disagree with the tile the user clicked to open it,
 * which is precisely the bug this module was originally written to end.
 *
 * Verified against live data — the statuses actually present are:
 *   Present (101,340) · Weekly Off (19,573) · Leave (8,647) · Absent (4,739)
 *   Holiday (4,699) · Half Day (3,378) · Work From Home (1)
 */

/** Statuses that mean "working today" outright. */
const PRESENT_STATUSES = ['Present', 'Work From Home', 'On Duty'];

/**
 * Shift-specific "at work" outcomes the engine may assign once a punch arrives.
 * Recognised, never redefined — the attendance engine remains the only thing
 * that decides them.
 */
const AT_WORK = /\b(late|early\s*out|early\s*going|on\s*duty|overtime)\b/i;

/** True when the status means the employee is at work. */
const isAtWork = (status) => {
  const st = String(status || '');
  return PRESENT_STATUSES.includes(st) || AT_WORK.test(st);
};

/**
 * True for a legitimate non-working day. These are NOT absences and are excluded
 * from attendance tallies entirely — counting them would flood the absent column
 * every Sunday and on every public holiday.
 */
const isNonWorkingDay = (status) => {
  const st = String(status || '');
  return st === 'Weekly Off' || st === 'Holiday';
};

/** Work-from-home specifically (a subset of "at work"). */
const isWfh = (status) => String(status || '') === 'Work From Home';

/** Half day — counted as half a present day in the attendance percentage. */
const isHalfDay = (status) => /half\s*day/i.test(String(status || ''));

/** On approved leave. */
const isLeave = (status) => /^leave$/i.test(String(status || '')) || /on\s*leave/i.test(String(status || ''));

/**
 * Late / early-exit live in the `flags` JSON array, NOT in the status — verified
 * against live rows (e.g. { status: "Present", flags: ["Late"] }). The stored
 * spellings vary ("Late", "Late Mark"), so these match loosely rather than
 * comparing against a fixed list that silently misses a variant.
 */
const flagList = (flags) => (Array.isArray(flags) ? flags.map((f) => String(f)) : []);
const hasLateFlag = (flags) => flagList(flags).some((f) => /late/i.test(f));
const hasEarlyExitFlag = (flags) => flagList(flags).some((f) => /early/i.test(f));

/**
 * Classify one attendance row into exactly ONE bucket, so the buckets always sum
 * to the number of rows counted and a percentage can never exceed 100.
 * Returns: 'present' | 'wfh' | 'halfDay' | 'leave' | 'absent' | 'nonWorking'
 */
function classify(status) {
  if (isNonWorkingDay(status)) return 'nonWorking';
  if (isHalfDay(status)) return 'halfDay';
  if (isWfh(status)) return 'wfh';
  if (isLeave(status)) return 'leave';
  if (isAtWork(status)) return 'present';
  return 'absent';
}

module.exports = {
  PRESENT_STATUSES,
  AT_WORK,
  isAtWork,
  isNonWorkingDay,
  isWfh,
  isHalfDay,
  isLeave,
  hasLateFlag,
  hasEarlyExitFlag,
  classify,
};
