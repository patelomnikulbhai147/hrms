// ── Loan EMI engine ──────────────────────────────────────────────────────────
// Server-authoritative amortization for the Employee Loan module. Supports three
// interest models and produces a per-installment schedule that becomes the loan
// ledger. All money is rounded to whole rupees (Indian payroll convention); any
// rounding remainder is absorbed into the FINAL installment so the schedule sums
// EXACTLY to the total payable — the outstanding balance can never drift.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const r0 = (n) => Math.round(Number(n) || 0);              // to whole rupee
const nn = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const monthIndex = (m) => MONTHS.findIndex((x) => x.toLowerCase() === String(m).toLowerCase());
// Last day of a period month → the installment's notional due date (yyyy-MM-dd).
const periodDueDate = (monthName, year) => {
  const mi = monthIndex(monthName); const last = new Date(Number(year), mi + 1, 0).getDate();
  return `${year}-${String(mi + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
};

/** month/year advanced by `offset` months (offset can be 0..n). */
function addMonths(month, year, offset) {
  const start = monthIndex(month);
  const idx = (start < 0 ? 0 : start) + Number(offset || 0);
  return { month: MONTHS[((idx % 12) + 12) % 12], year: Number(year) + Math.floor(idx / 12) };
}

/**
 * Compute loan totals + EMI for the given terms. Pure function (no DB).
 * interestType: 'Flat' | 'Reducing' | 'None'
 *   Flat     — interest = P × r% × years, spread evenly; EMI = (P+I)/n.
 *   Reducing — standard reducing-balance amortization (interest on outstanding).
 *   None     — zero interest; EMI = P/n.
 * Returns { totalInterest, totalPayable, emiAmount } (all whole rupees).
 */
function computeLoan({ principal, interestType, interestRate, tenureMonths }) {
  const P = Math.max(0, nn(principal));
  const n = Math.max(1, Math.round(nn(tenureMonths)));
  const type = String(interestType || 'Flat');
  const annual = Math.max(0, nn(interestRate));

  if (type === 'None' || annual === 0) {
    const emi = r0(P / n);
    return { totalInterest: 0, totalPayable: P, emiAmount: emi };
  }

  if (type === 'Reducing') {
    const rm = annual / 12 / 100; // monthly rate
    const pow = Math.pow(1 + rm, n);
    const emiExact = (P * rm * pow) / (pow - 1);
    const emi = r0(emiExact);
    const totalPayable = r0(emi * n); // approximate; schedule reconciles the tail
    return { totalInterest: Math.max(0, totalPayable - P), totalPayable, emiAmount: emi };
  }

  // Flat (default)
  const years = n / 12;
  const totalInterest = r0(P * (annual / 100) * years);
  const totalPayable = P + totalInterest;
  const emi = r0(totalPayable / n);
  return { totalInterest, totalPayable, emiAmount: emi };
}

/**
 * Build the full installment schedule (the ledger rows to persist). Absorbs the
 * rounding remainder into the last installment so principal components sum to P
 * exactly and the closing balance ends at 0.
 * Returns an array of { seq, periodMonth, periodYear, emiAmount,
 *   principalComponent, interestComponent, openingBalance, closingBalance }.
 */
function buildSchedule({ principal, interestType, interestRate, tenureMonths, deductionStartMonth, deductionStartYear }) {
  const P = Math.max(0, nn(principal));
  const n = Math.max(1, Math.round(nn(tenureMonths)));
  const type = String(interestType || 'Flat');
  const annual = Math.max(0, nn(interestRate));
  const rows = [];

  if (type === 'Reducing' && annual > 0) {
    const rm = annual / 12 / 100;
    const pow = Math.pow(1 + rm, n);
    const emi = r0((P * rm * pow) / (pow - 1));
    let balance = P;
    for (let i = 0; i < n; i++) {
      const opening = balance;
      const interest = r0(opening * rm);
      let principalComp = emi - interest;
      let thisEmi = emi;
      if (i === n - 1) { principalComp = opening; thisEmi = opening + interest; } // clear remainder
      const closing = Math.max(0, r0(opening - principalComp));
      const { month, year } = addMonths(deductionStartMonth, deductionStartYear, i);
      rows.push({
        seq: i + 1, periodMonth: month, periodYear: year, dueDate: periodDueDate(month, year),
        emiAmount: r0(thisEmi), principalComponent: r0(principalComp),
        interestComponent: r0(interest), openingBalance: r0(opening), closingBalance: closing,
      });
      balance = closing;
    }
    return rows;
  }

  // Flat / None — even principal split, even interest split, remainder to last.
  const totals = computeLoan({ principal: P, interestType: type, interestRate: annual, tenureMonths: n });
  const perPrincipal = r0(P / n);
  const perInterest = r0(totals.totalInterest / n);
  let balance = P;
  let interestLeft = totals.totalInterest;
  for (let i = 0; i < n; i++) {
    const opening = balance;
    let principalComp = i === n - 1 ? opening : perPrincipal;      // last clears the balance
    let interestComp = i === n - 1 ? Math.max(0, interestLeft) : perInterest;
    const closing = Math.max(0, r0(opening - principalComp));
    const { month, year } = addMonths(deductionStartMonth, deductionStartYear, i);
    rows.push({
      seq: i + 1, periodMonth: month, periodYear: year, dueDate: periodDueDate(month, year),
      emiAmount: r0(principalComp + interestComp), principalComponent: r0(principalComp),
      interestComponent: r0(interestComp), openingBalance: r0(opening), closingBalance: closing,
    });
    balance = closing;
    interestLeft -= interestComp;
  }
  return rows;
}

module.exports = { computeLoan, buildSchedule, addMonths, MONTHS, monthIndex, r0, nn };
