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
 *   windowEnd              'YYYY-MM-DD' — the last PAYABLE day (≤ monthEnd)
 *   cutoffDay              day-of-month of windowEnd; 0 when already left
 *   exitDay                the employee's exit date, or null
 *   truncated              true when the exit date cuts this month short
 *   employed               false when the employee left BEFORE this month began
 */
function employmentWindow(emp, month, year) {
  const mi = monthIndexOf(month);
  const y = Number(year);
  const lastDay = new Date(y, mi + 1, 0).getDate();
  const monthStart = `${y}-${pad(mi + 1)}-01`;
  const monthEnd = `${y}-${pad(mi + 1)}-${pad(lastDay)}`;
  const exitDay = toDayString(emp?.exitDate);

  // No exit date, or an exit on/after the month's last day → the full month.
  const truncated = !!exitDay && exitDay < monthEnd;
  const windowEnd = truncated ? exitDay : monthEnd;
  // Left before this month even started → zero payable days. windowEnd is the
  // (earlier) exit day, so every `date <= windowEnd` filter returns nothing.
  const cutoffDay = !truncated ? lastDay
    : exitDay < monthStart ? 0
      : Number(exitDay.slice(8, 10));

  return { monthStart, monthEnd, lastDay, windowEnd, cutoffDay, exitDay, truncated, employed: cutoffDay > 0 };
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
  const { monthStart } = employmentWindow(null, month, year);
  const startedAt = new Date(`${monthStart}T00:00:00.000Z`);
  return {
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
