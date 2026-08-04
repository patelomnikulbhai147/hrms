// ─────────────────────────────────────────────────────────────────────────────
// Overtime pay — ONE formula, shared by every caller.
//
// Before this existed there were two implementations that quietly disagreed:
//
//   Attendance-Sync preview   hourly = salary / (daysInMonth × 8)
//                             multiplier = company.overtimeRate || 1.5
//   Payroll engine (recalcOne) hourly = salary / (workingDays × 8)
//                             multiplier = policy.overtimeMultiplier || company… || 1.5
//
// So the OT amount a user reviewed on screen was NOT the amount that reached the
// payslip — different denominator (calendar days vs working days) and a different
// multiplier whenever a Deduction Policy was saved. Both now call in here.
//
// Formula:  otAmount = otHours × (monthlyGross / (workingDays × 8)) × multiplier
//
// workingDays (not calendar days) is the denominator because the monthly gross is
// earned over working days — that is the same basis the daily rate uses for
// proration, so an OT hour is priced consistently with a normal worked hour.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OT_MULTIPLIER = 1.5;

/**
 * Resolve the OT multiplier for a scope.
 *
 * A saved Deduction Policy is the single source of truth. Without one we keep the
 * company's own overtimeRate, so a company that configured a custom rate before
 * policies existed is never silently reset to the default.
 *
 * @param {{exists?: boolean, config?: {overtimeMultiplier?: number}}|null} policy
 * @param {{overtimeRate?: number}|null} company
 */
function resolveOvertimeMultiplier(policy, company) {
  const fromPolicy = policy && policy.exists ? Number(policy.config && policy.config.overtimeMultiplier) : 0;
  return fromPolicy || Number(company && company.overtimeRate) || DEFAULT_OT_MULTIPLIER;
}

/**
 * The hourly rate an OT hour is paid at (before the multiplier).
 * Guards workingDays = 0 so a fully-off month cannot divide by zero.
 */
function hourlyRateFor(monthlyGross, workingDays) {
  const gross = Number(monthlyGross) || 0;
  const days = Number(workingDays) || 0;
  return days > 0 ? gross / (days * 8) : 0;
}

/**
 * OT amount in whole rupees.
 *
 * OT is EXTRA hours actually worked, so it is paid on top of gross and is never
 * prorated down by attendance.
 */
function computeOvertimeAmount({ otHours, monthlyGross, workingDays, multiplier }) {
  const hours = Number(otHours) || 0;
  if (hours <= 0) return 0;
  const rate = hourlyRateFor(monthlyGross, workingDays);
  const mult = Number(multiplier) || DEFAULT_OT_MULTIPLIER;
  return Math.round(hours * rate * mult);
}

module.exports = {
  DEFAULT_OT_MULTIPLIER,
  resolveOvertimeMultiplier,
  hourlyRateFor,
  computeOvertimeAmount,
};
