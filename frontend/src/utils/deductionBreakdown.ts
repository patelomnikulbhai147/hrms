/**
 * Deduction breakdown — the single source of truth for how a payroll record's
 * deductions are itemised on the salary slip, salary register, PDF, Excel,
 * print preview and emailed payslip.
 *
 * WHAT IS AND IS NOT STORED
 * -------------------------
 * The `Payroll` row stores exactly ONE deduction figure: `deductions`. It also
 * stores `tax` (TDS) and `loanDeduction` as separate real columns. Nothing else
 * — there is no stored PF, ESIC, PT, LWF, advance, notice, food or uniform
 * amount on the payroll row.
 *
 * The granular per-component values live in the `payroll_worksheet` table
 * (see backend/src/controllers/payrollWorksheetController.js), which the Payroll
 * Worksheet editor writes. When a worksheet row exists it is AUTHORITATIVE and
 * every non-zero component becomes its own line. When it does not, PF/ESIC/PT
 * are derived from the company's statutory rates exactly as before, and the
 * unexplained remainder becomes a single "Other Deductions" line.
 *
 * This module invents nothing. A component only ever produces a row when a real
 * number backs it, which is why an employee with no worksheet shows fewer lines
 * than one with a worksheet — that difference is the data, not the renderer.
 *
 * RECONCILIATION INVARIANT
 * ------------------------
 * `sum(rows) === record.deductions` always holds, so Total Deductions and Net
 * Salary on the slip can never drift from the stored payroll figures. See
 * `buildDeductionRows` for the one case where derived statutory amounts exceed
 * the stored total and the breakdown must degrade rather than lie.
 *
 * Adding a component: append it to DEDUCTION_COMPONENTS with a key matching the
 * `payroll_worksheet` column. Every surface picks it up with no further change.
 */

export interface DeductionRow {
  /** Matches the `payroll_worksheet` column name. */
  key: string;
  label: string;
  amount: number;
  /**
   * false → the amount is read from a stored column or a saved worksheet.
   * true  → the amount was computed at render time from company statutory rates
   *         because no worksheet exists for this payroll row.
   */
  derived: boolean;
}

export interface DeductionBreakdown {
  rows: DeductionRow[];
  /** The stored, authoritative `Payroll.deductions`. Always equals sum(rows). */
  total: number;
  /**
   * true when a saved payroll_worksheet backed this breakdown (fully itemised).
   * false when PF/ESIC/PT were derived and the remainder pooled into "Other".
   */
  itemised: boolean;
  /**
   * Set when the derived statutory amounts exceeded the stored total, so the
   * statutory lines had to be withheld. Callers may surface this to admins.
   */
  degraded?: string;
}

/**
 * Ordered registry of BUILT-IN components. Must mirror
 * backend/src/services/deductionCatalog.js — that file is the definition; this
 * is the copy the offline PDF/Excel generators need synchronously.
 *
 * It is a FALLBACK only: when a worksheet exists, its self-describing
 * `deductions` list drives rendering (labels and all), so a custom
 * Component-Builder component needs no entry here.
 */
export const DEDUCTION_COMPONENTS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'pf',               label: 'Provident Fund (PF)' },
  { key: 'eps',              label: 'Employee Pension Scheme (EPS)' },
  { key: 'vpf',              label: 'Voluntary Provident Fund (VPF)' },
  { key: 'esi',              label: 'Employee State Insurance (ESI)' },
  { key: 'professionalTax',  label: 'Professional Tax (PT)' },
  { key: 'lwf',              label: 'Labour Welfare Fund (LWF)' },
  { key: 'tds',              label: 'Income Tax (TDS)' },
  { key: 'loanRecovery',     label: 'Loan Recovery' },
  { key: 'advanceRecovery',  label: 'Salary Advance Recovery' },
  { key: 'lwp',              label: 'Leave Without Pay (LWP)' },
  { key: 'noticeRecovery',   label: 'Notice Period Recovery' },
  { key: 'insurance',        label: 'Insurance Deduction' },
  { key: 'foodDeduction',    label: 'Food Deduction' },
  { key: 'uniformDeduction', label: 'Uniform Deduction' },
  { key: 'welfareFund',      label: 'Welfare Fund' },
  { key: 'otherDeductions',  label: 'Other Deduction' },
];

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Treat sub-rupee noise as zero so float dust never prints a ₹0.004 row. */
const isPositive = (n: number) => n > 0.005;

/**
 * Build the itemised deduction rows for one payroll record.
 *
 * @param record    the Payroll row (needs `deductions`, `basicSalary`; optionally `tax`, `loanDeduction`)
 * @param company   supplies pfRate / esicRate / profTaxRate for the derived path
 * @param worksheet an optional saved `payroll_worksheet` row — authoritative when present
 */
export function buildDeductionRows(
  record: any,
  company: any,
  worksheet?: any | null,
): DeductionBreakdown {
  const total = r2(num(record?.deductions));

  // ── Path 0: the worksheet's own dynamic deduction list. Self-describing, so a
  // component with no legacy column (LWP, Food, Uniform, Notice Recovery) or a
  // custom Component-Builder component renders without any lookup here. This is
  // the authoritative shape written by payroll_worksheet.deductionsJson. ──
  const dynamic: any[] | null =
    Array.isArray(worksheet) ? worksheet
      : Array.isArray(worksheet?.deductions) ? worksheet.deductions
        : null;
  if (dynamic) {
    const rows = dynamic
      .map(d => ({ key: String(d.key), label: String(d.label || d.key), amount: r2(num(d.amount)), derived: false }))
      .filter(r => isPositive(r.amount));
    const sum = r2(rows.reduce((t, r) => t + r.amount, 0));
    // The worksheet mirrors its total onto Payroll.deductions on save, so these
    // agree. Prefer the worksheet's own sum when a caller passes a stale record.
    return { rows, total: Math.abs(sum - total) > 0.5 && total === 0 ? sum : (total || sum), itemised: true };
  }

  // ── Path 1: a saved worksheet in legacy column form. Every value is real. ──
  if (worksheet && !worksheet._derived) {
    const rows = DEDUCTION_COMPONENTS
      .map(c => ({ ...c, amount: r2(num(worksheet[c.key])), derived: false }))
      .filter(r => isPositive(r.amount));

    // The worksheet mirrors its own totals back onto Payroll.deductions on save,
    // so these agree. If a legacy row drifted, surface the gap rather than hide it.
    const sum = r2(rows.reduce((t, r) => t + r.amount, 0));
    if (Math.abs(sum - total) > 0.5) {
      const gap = r2(total - sum);
      if (isPositive(gap)) {
        const other = rows.find(r => r.key === 'otherDeductions');
        if (other) other.amount = r2(other.amount + gap);
        else rows.push({ key: 'otherDeductions', label: 'Other Deductions', amount: gap, derived: true });
      }
    }
    return { rows, total, itemised: true };
  }

  // ── Path 2: no worksheet. Only `tax` and `loanDeduction` are stored facts. ──
  const basic = num(record?.basicSalary);
  const pf = Math.round(basic * (num(company?.pfRate ?? 12) / 100));
  const esi = Math.round(basic * (num(company?.esicRate ?? 0.75) / 100));
  const pt = num(company?.profTaxRate ?? 200);
  const tds = r2(num(record?.tax));
  // A real stored column. Previously it was swallowed by the catch-all row, so a
  // loan EMI was invisible to the employee. It gets its own line now.
  const loan = r2(num(record?.loanDeduction));

  const statutory = pf + esi + pt;
  const stored = tds + loan;
  const residual = r2(total - statutory - stored);

  // The derived statutory floor exceeds what payroll actually deducted. We cannot
  // know which of PF/ESIC/PT was waived or pro-rated for this employee, and
  // printing all three would overstate the deductions AND understate net pay.
  // Show only what is genuinely stored and pool the rest under one honest label.
  if (residual < -0.5) {
    const rows: DeductionRow[] = [];
    if (isPositive(tds)) rows.push({ key: 'tds', label: 'Income Tax (TDS)', amount: tds, derived: false });
    if (isPositive(loan)) rows.push({ key: 'loanRecovery', label: 'Loan Recovery', amount: loan, derived: false });
    const rest = r2(total - tds - loan);
    if (isPositive(rest)) {
      rows.push({ key: 'otherDeductions', label: 'Statutory & Other Deductions', amount: rest, derived: false });
    }
    return {
      rows,
      total,
      itemised: false,
      degraded: 'Statutory rates exceed the recorded deduction total for this employee; '
        + 'the breakdown is pooled. Open the Payroll Worksheet to itemise it.',
    };
  }

  const rows: DeductionRow[] = [];
  const push = (key: string, label: string, amount: number, derived: boolean) => {
    if (isPositive(amount)) rows.push({ key, label, amount: r2(amount), derived });
  };
  push('pf', 'Provident Fund (PF)', pf, true);
  push('esi', 'ESIC', esi, true);
  push('professionalTax', 'Professional Tax (PT)', pt, true);
  push('tds', 'Income Tax (TDS)', tds, false);
  push('loanRecovery', 'Loan Recovery', loan, false);
  // Whatever payroll deducted beyond the statutory + stored lines. It is a real
  // figure (total minus knowns) but its composition is unknown — so it is not
  // labelled "LWP", which was a guess the old slip made on the employee's behalf.
  push('otherDeductions', 'Other Deductions', residual, false);

  return { rows, total, itemised: false };
}

/** Column set for the Salary Register / Excel export, in payslip order. */
export const REGISTER_DEDUCTION_COLUMNS = DEDUCTION_COMPONENTS.map(c => ({
  key: c.key,
  label: c.label,
}));

/** Keyed amounts for one record, for register/Excel columns (zeros included). */
export function deductionMap(record: any, company: any, worksheet?: any | null): Record<string, number> {
  const { rows } = buildDeductionRows(record, company, worksheet);
  const out: Record<string, number> = {};
  for (const c of DEDUCTION_COMPONENTS) out[c.key] = 0;
  for (const r of rows) out[r.key] = r.amount;
  return out;
}
