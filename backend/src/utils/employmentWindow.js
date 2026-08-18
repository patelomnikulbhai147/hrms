// ─────────────────────────────────────────────────────────────────────────────
// OFFBOARDING SALARY CUT-OFF — the single source of truth for the question
// "which days of this payroll month was this employee actually employed for?"
//
//   Payroll Start = first day of the payroll month
//   Payroll End   = MIN(last day of the payroll month, Employee.exitDate)
//
// The exit day itself is INCLUSIVE — an employee who leaves on 15 July is paid
// for 1–15 July. Nothing dated after the exit day may reach payroll: not
// attendance, not leave, not a holiday, not a weekly off, not overtime.
//
// Everything that clamps a payroll period to an exit date goes through here, so
// the attendance summary, the payroll engine and the eligibility roster can
// never disagree about where an employment ends.
//
// ── Why the exit date is read in UTC ────────────────────────────────────────
// `Employee.exitDate` is a Prisma DateTime fed from an HTML date input, so a
// date-only value ("2026-07-15") round-trips as 2026-07-15T00:00:00.000Z.
// Reading the UTC parts returns the day HR actually typed; reading local parts
// would shift it a day west of Greenwich and silently underpay by one day.
// ─────────────────────────────────────────────────────────────────────────────
const { OFFBOARDED_STATUSES, isOffboarded } = require('./employeeStatus');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');

const monthIndexOf = (name) =>
  Math.max(0, MONTHS.findIndex((m) => m.toLowerCase() === String(name).toLowerCase()));

/** A Date / ISO string → 'YYYY-MM-DD' in UTC, or null when unusable. */
function toDayString(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * The payroll window for one employee in one month.
 *
 * `emp` may be null — then the month's own bounds are returned, which is how
 * callers that only need the calendar (e.g. the eligibility filter) use it.
 *
 * Returns:
 *   monthStart / monthEnd  'YYYY-MM-DD' bounds of the payroll month
 *   lastDay                days in the payroll month
 *   windowStart            'YYYY-MM-DD' — the first PAYABLE day (≥ monthStart)
 *   windowEnd              'YYYY-MM-DD' — the last PAYABLE day (≤ monthEnd)
 *   startDay               day-of-month of windowStart (lastDay+1 = joins later)
 *   cutoffDay              day-of-month of windowEnd; 0 when already left
 *   joinDay / exitDay      the employee's dates, or null
 *   truncatedStart         true when the JOIN date cuts this month's start
 *   truncated              true when the EXIT date cuts this month short
 *   employed               false when the employment does not touch this month
 *                          (left before it began, or joins only after it ends)
 */
function employmentWindow(emp, month, year) {
  const mi = monthIndexOf(month);
  const y = Number(year);
  const lastDay = new Date(y, mi + 1, 0).getDate();
  const monthStart = `${y}-${pad(mi + 1)}-01`;
  const monthEnd = `${y}-${pad(mi + 1)}-${pad(lastDay)}`;
  const exitDay = toDayString(emp?.exitDate);
  // ── Joining cut-off (symmetric to the exit cut-off) ───────────────────────
  // Nothing dated BEFORE the join day may be paid: not a weekly off, not a
  // holiday, not leave. A mid-month joiner used to receive paid weekly-off
  // credit for Sundays before they were employed. The join day is INCLUSIVE.
  const joinDay = toDayString(emp?.joinDate);
  const truncatedStart = !!joinDay && joinDay > monthStart;
  const windowStart = truncatedStart ? (joinDay <= monthEnd ? joinDay : monthEnd) : monthStart;
  const startDay = !truncatedStart ? 1
    : joinDay > monthEnd ? lastDay + 1 // joins only after this month → no payable days
      : Number(joinDay.slice(8, 10));

  // No exit date, or an exit on/after the month's last day → the full month.
  const truncated = !!exitDay && exitDay < monthEnd;
  const windowEnd = truncated ? exitDay : monthEnd;
  // Left before this month even started → zero payable days. windowEnd is the
  // (earlier) exit day, so every `date <= windowEnd` filter returns nothing.
  const cutoffDay = !truncated ? lastDay
    : exitDay < monthStart ? 0
      : Number(exitDay.slice(8, 10));

  return {
    monthStart, monthEnd, lastDay,
    windowStart, windowEnd, startDay, cutoffDay,
    joinDay, exitDay, truncatedStart, truncated,
    employed: cutoffDay >= startDay && cutoffDay > 0,
  };
}

/**
 * May this employee be paid for this month at all?
 *
 * The EXIT DATE decides, not the status flag. Someone who resigns in June with a
 * 10 August last working day is flipped to 'Resigned' immediately but is still
 * employed — and must still be paid — through June, July and 1–10 August. Status
 * only decides the fallback: an offboarded record with NO exit date cannot be
 * placed on a timeline, so it stays excluded exactly as before.
 */
function isPayrollEligible(emp, month, year) {
  const w = employmentWindow(emp, month, year);
  if (!w.employed) return false;                 // exit date precedes this month
  if (!isOffboarded(emp?.status)) return true;   // still on the active roster
  return !!w.exitDay;                            // offboarded → needs a dated exit
}

/**
 * The same rule as a Prisma `where` fragment, for roster queries.
 * Combine with AND — it contains its own OR.
 */
function payrollEligibilityWhere(month, year) {
  const { monthStart, monthEnd } = employmentWindow(null, month, year);
  const startedAt = new Date(`${monthStart}T00:00:00.000Z`);
  const endedAt = new Date(`${monthEnd}T23:59:59.999Z`);
  return {
    // Employment must have STARTED by the month's end — an employee joining in
    // a later month has zero payable days here and must not enter the roster.
    joinDate: { lte: endedAt },
    OR: [
      // On the active roster and no exit on file.
      { status: { notIn: OFFBOARDED_STATUSES }, exitDate: null },
      // Anyone — active or offboarded — whose employment reaches into this month.
      { exitDate: { gte: startedAt } },
    ],
  };
}

module.exports = {
  MONTHS,
  monthIndexOf,
  toDayString,
  employmentWindow,
  isPayrollEligible,
  payrollEligibilityWhere,
};
