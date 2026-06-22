// ── Bonus calculation for payroll ───────────────────────────────────────────
// Two bonus sources feed a payroll row:
//   1. RECURRING — configured on the Employee record (Monthly/Quarterly/etc.).
//      Auto-included by payroll generation/recalc per the cadence rules below.
//   2. ONE-TIME — Festival/Performance/Custom bonuses applied to a specific
//      month via the "apply bonus" actions; stored in the employee_bonuses table.
// Keeping them separate means an attendance-driven recalc never clobbers a
// manually-applied festival/performance bonus.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthIndex = (month) => MONTHS.findIndex((m) => m.toLowerCase() === String(month).toLowerCase());

/**
 * Recurring bonus configured on the employee, for a given payroll month.
 * Returns 0 when not applicable, outside the effective window, or not a payout
 * month for the configured cadence. Pure function (no DB).
 */
function recurringBonusFor(emp, month, year) {
  if (!emp || !emp.bonusApplicable) return 0;
  const value = Number(emp.bonusValue) || 0;
  if (value <= 0) return 0;

  const mi = monthIndex(month);
  if (mi < 0) return 0;
  const monthNum = mi + 1; // 1..12
  const periodDate = new Date(Number(year), mi, 15); // mid-month reference

  // Respect the effective / end window.
  if (emp.bonusEffectiveDate && periodDate < new Date(emp.bonusEffectiveDate)) return 0;
  if (emp.bonusEndDate && periodDate > new Date(emp.bonusEndDate)) return 0;

  const type = String(emp.bonusType || '').toLowerCase();
  let applies;
  switch (type) {
    case 'monthly': applies = true; break;
    case 'quarterly': applies = [3, 6, 9, 12].includes(monthNum); break;
    case 'half-yearly': applies = [6, 12].includes(monthNum); break;
    case 'yearly': {
      // Payout month = the configured effective-date month, else March (FY end).
      const payoutMonth = emp.bonusEffectiveDate ? new Date(emp.bonusEffectiveDate).getMonth() + 1 : 3;
      applies = monthNum === payoutMonth;
      break;
    }
    // Festival / Performance / Custom are one-time — never auto-recur.
    default: applies = false;
  }
  if (!applies) return 0;

  const method = String(emp.bonusCalcMethod || '').toLowerCase();
  const base = Number(emp.salary) || 0;
  return method.includes('percent') ? Math.round(base * (value / 100)) : Math.round(value);
}

/**
 * Sum of active ONE-TIME bonuses applied to this employee for the month/year.
 * Async (queries employee_bonuses).
 */
async function oneTimeBonusFor(prisma, employeeId, month, year) {
  const rows = await prisma.employeeBonus.findMany({
    where: {
      employeeId: Number(employeeId),
      payrollMonth: String(month),
      payrollYear: Number(year),
      status: 'Active',
    },
    select: { amount: true },
  });
  return rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}

/**
 * Total bonus (recurring + one-time) to fold into a payroll row's net salary.
 */
async function bonusForPayroll(prisma, emp, month, year) {
  const recurring = recurringBonusFor(emp, month, year);
  const oneTime = await oneTimeBonusFor(prisma, emp.id, month, year);
  return { recurring, oneTime, total: recurring + oneTime };
}

module.exports = { recurringBonusFor, oneTimeBonusFor, bonusForPayroll, MONTHS };
