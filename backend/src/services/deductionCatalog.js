/**
 * Deduction component catalog — the ONE definition of what a deduction is.
 *
 * Every surface (Salary Worksheet, Salary Slip, Salary Register, Reports, PDF,
 * Excel, Print, Email) renders deductions from this catalog, so a component can
 * never appear in one place and be missing from another.
 *
 * A component is either:
 *   • BUILT-IN  — the statutory / conventional set below. `key` matches the
 *                 legacy `payroll_worksheet` column where one exists, so the old
 *                 columns keep being written and anything reading them still works.
 *   • CUSTOM    — a row in `payroll_components` (Settings → Payroll → Component
 *                 Builder) with componentType Deduction / Recovery / Loan.
 *                 Keyed `pc_<id>` so it can never collide with a built-in.
 *
 * Adding a component in the Component Builder makes it appear in the worksheet
 * and on every payslip with no code change — that is the whole point of keying
 * off this catalog rather than a hardcoded row list.
 *
 * `legacyColumn` marks the built-ins that have a dedicated worksheet column.
 * Components without one live only in `payroll_worksheet.deductionsJson`.
 */

// Order is the payslip convention: statutory, then recoveries, then catch-all.
const BUILT_IN_DEDUCTIONS = [
  { key: 'pf',              label: 'Provident Fund (PF)',            legacyColumn: 'pf' },
  { key: 'eps',             label: 'Employee Pension Scheme (EPS)',  legacyColumn: 'eps' },
  { key: 'vpf',             label: 'Voluntary Provident Fund (VPF)', legacyColumn: 'vpf' },
  { key: 'esi',             label: 'Employee State Insurance (ESI)', legacyColumn: 'esi' },
  { key: 'professionalTax', label: 'Professional Tax (PT)',          legacyColumn: 'professionalTax' },
  { key: 'lwf',             label: 'Labour Welfare Fund (LWF)',      legacyColumn: 'lwf' },
  { key: 'tds',             label: 'Income Tax (TDS)',               legacyColumn: 'tds' },
  { key: 'loanRecovery',    label: 'Loan Recovery',                  legacyColumn: 'loanRecovery' },
  { key: 'advanceRecovery', label: 'Salary Advance Recovery',        legacyColumn: 'advanceRecovery' },
  { key: 'lwp',             label: 'Leave Without Pay (LWP)',        legacyColumn: null },
  { key: 'noticeRecovery',  label: 'Notice Period Recovery',         legacyColumn: null },
  { key: 'insurance',       label: 'Insurance Deduction',            legacyColumn: 'insurance' },
  { key: 'foodDeduction',   label: 'Food Deduction',                 legacyColumn: null },
  { key: 'uniformDeduction',label: 'Uniform Deduction',              legacyColumn: null },
  { key: 'welfareFund',     label: 'Welfare Fund',                   legacyColumn: null },
  // NOT a bucket. It is a component a company may legitimately use for a one-off
  // deduction. The worksheet never sweeps unexplained money into it — only the
  // first-open seed does, and only because that seed must reconcile to the
  // aggregate `Payroll.deductions` that predates the worksheet.
  { key: 'otherDeductions', label: 'Other Deduction',                legacyColumn: 'otherDeductions' },
];

const BUILT_IN_KEYS = new Set(BUILT_IN_DEDUCTIONS.map(c => c.key));

/** Legacy worksheet columns, in table order. Still written on every save. */
const LEGACY_DEDUCTION_COLUMNS = BUILT_IN_DEDUCTIONS
  .filter(c => c.legacyColumn)
  .map(c => c.legacyColumn);

const CUSTOM_TYPES = ['Deduction', 'Recovery', 'Loan'];

/**
 * Active deduction components for a company: built-ins + Component Builder rows.
 * `system: true` marks a built-in (cannot be deleted, only zeroed).
 */
async function listDeductionComponents(prisma, companyId) {
  const built = BUILT_IN_DEDUCTIONS.map((c, i) => ({
    key: c.key,
    label: c.label,
    system: true,
    editable: true,
    displayOrder: i,
    legacyColumn: c.legacyColumn,
  }));

  let custom = [];
  if (companyId) {
    const rows = await prisma.payrollComponent.findMany({
      where: { companyId: Number(companyId), status: 'Active', componentType: { in: CUSTOM_TYPES } },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    }).catch(() => []);
    custom = rows.map((r, i) => ({
      key: `pc_${r.id}`,
      label: r.displayName || r.componentName,
      system: false,
      // "Manual" / "Fixed Amount" components are typed by a human; formula- and
      // percentage-driven ones are computed, so the worksheet shows them read-only.
      editable: r.calculationMethod === 'Fixed Amount' || r.calculationMethod === 'Manual',
      displayOrder: built.length + (r.displayOrder ?? i),
      legacyColumn: null,
      componentId: r.id,
      componentType: r.componentType,
      calculationMethod: r.calculationMethod,
    }));
  }

  // Built-ins keep their payslip order; custom components follow.
  return [...built, ...custom].sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Label for a key, falling back to the key itself for an unknown/archived one. */
function labelFor(components, key) {
  return components.find(c => c.key === key)?.label || key;
}

module.exports = {
  BUILT_IN_DEDUCTIONS,
  BUILT_IN_KEYS,
  LEGACY_DEDUCTION_COLUMNS,
  CUSTOM_TYPES,
  listDeductionComponents,
  labelFor,
};
