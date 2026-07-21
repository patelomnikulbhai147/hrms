/**
 * EPFO ECR (Electronic Challan cum Return) generation engine.
 *
 * PURE, ISOLATED domain logic — no DB access, no Express, no side effects. The
 * controller feeds it already-loaded employee + payroll rows; this module only
 * validates eligibility, computes each member's PF figures, and formats the
 * official EPFO ECR text file. It touches NOTHING in payroll / attendance /
 * employee / existing-report code.
 *
 * ECR text format (EPFO ECR 2.0): one line per member, fields separated by the
 * literal delimiter `#~#`, in this fixed order (11 columns):
 *   1  UAN                     (12-digit Universal Account Number)
 *   2  Member Name
 *   3  Gross Wages
 *   4  EPF Wages               (wage on which EPF is computed)
 *   5  EPS Wages               (pension wage, capped at the statutory ceiling)
 *   6  EDLI Wages              (capped at the statutory ceiling)
 *   7  EPF Contribution        (employee share = pfRate% of EPF wages)
 *   8  EPS Contribution        (8.33% of EPS wages)
 *   9  EPF-EPS Diff            (employer EPF share = EPF contri − EPS contri)
 *   10 NCP Days                (Non-Contributing Period days = LWP days)
 *   11 Refund of Advances      (0 unless a refund applies)
 */

const ECR_DELIMITER = '#~#';
// Statutory EPFO ceilings / rates (as of the current EPF scheme). Kept as named
// constants so they are explicit and auditable.
const EPF_WAGE_CEILING = 15000; // ₹ ceiling for EPS/EDLI (and default EPF base)
const DEFAULT_EPF_RATE = 12;    // employee EPF % (overridable per company.pfRate)
const EPS_RATE = 8.33;          // % of EPS wages routed to pension

const r0 = (n) => Math.round(Number(n) || 0); // EPFO rounds each figure to ₹1
const blank = (v) => v == null || String(v).trim() === '' || String(v).trim() === '-';

/**
 * Compute the EPFO figures for a single member from their payroll row.
 * @param {object} p  { basicSalary, allowances, lwpDays }
 * @param {number} pfRate employee EPF percentage (default 12)
 */
function computeMemberFigures(p, pfRate = DEFAULT_EPF_RATE) {
  const basic = Math.max(0, Number(p.basicSalary) || 0);
  const allowances = Math.max(0, Number(p.allowances) || 0);
  const grossWages = r0(basic + allowances);

  // EPF/EPS/EDLI wages: the statutory ceiling caps the base. Establishments that
  // contribute on full wages still cap EPS/EDLI at the ceiling.
  const epfWages = r0(Math.min(basic, EPF_WAGE_CEILING));
  const epsWages = r0(Math.min(basic, EPF_WAGE_CEILING));
  const edliWages = r0(Math.min(basic, EPF_WAGE_CEILING));

  const epfContri = r0((epfWages * (Number(pfRate) || DEFAULT_EPF_RATE)) / 100);
  const epsContri = r0((epsWages * EPS_RATE) / 100);
  const epfEpsDiff = Math.max(0, epfContri - epsContri); // employer EPF (3.67%)

  const ncpDays = Math.max(0, r0(p.lwpDays));
  const refundOfAdvances = 0;

  return { grossWages, epfWages, epsWages, edliWages, epfContri, epsContri, epfEpsDiff, ncpDays, refundOfAdvances };
}

/**
 * Validate a single employee for ECR inclusion. Returns { eligible, reason }.
 * `payroll` is the matching Payroll row for the period (or null/undefined).
 */
function validateMember(emp, payroll) {
  // Active-employee check (status is a free-text column; treat anything not
  // clearly active as ineligible for a monthly return).
  const status = String(emp.status || '').toLowerCase();
  if (status && !/active/.test(status)) return { eligible: false, reason: 'Employee is not Active' };
  if (!payroll) return { eligible: false, reason: 'Payroll Missing for the selected period' };
  const basic = Number(payroll.basicSalary) || 0;
  if (basic <= 0 && !(Number(payroll.netSalary) > 0)) return { eligible: false, reason: 'Salary/Wages missing in payroll' };
  if (blank(emp.uan)) return { eligible: false, reason: 'Missing UAN' };
  if (blank(emp.pfNumber)) return { eligible: false, reason: 'Missing PF Number' };
  // A member with a UAN + PF number is treated as PF-applicable.
  return { eligible: true, reason: null };
}

/**
 * Build the ECR result for a set of employees + their payroll map.
 * @param {Array} employees  employee rows (must include: id, name, status, uan, pfNumber, employeeId)
 * @param {Map}   payrollByEmpId  Map<employeeId, payrollRow>
 * @param {object} opts { pfRate }
 * @returns { members, errors, summary }
 */
function buildEcr(employees, payrollByEmpId, opts = {}) {
  const pfRate = Number(opts.pfRate) || DEFAULT_EPF_RATE;
  const members = [];   // eligible → included in the file
  const errors = [];    // excluded → { name, code, reason }
  const warnings = [];  // included but noteworthy → { name, code, note }
  let missingUan = 0, missingPf = 0;

  for (const emp of employees) {
    const payroll = payrollByEmpId.get(emp.id);
    const { eligible, reason } = validateMember(emp, payroll);
    if (!eligible) {
      if (reason === 'Missing UAN') missingUan++;
      if (reason === 'Missing PF Number') missingPf++;
      errors.push({ name: emp.name || '—', code: emp.employeeId || '—', reason });
      continue;
    }
    const fig = computeMemberFigures(payroll, pfRate);
    // Non-blocking data-quality warnings (still included in the file).
    if (String(payroll.payrollStatus || '').toLowerCase() === 'draft') {
      warnings.push({ name: emp.name, code: emp.employeeId, note: 'Payroll is still in draft (not approved)' });
    }
    if (!/^\d{12}$/.test(String(emp.uan).trim())) {
      warnings.push({ name: emp.name, code: emp.employeeId, note: 'UAN is not a 12-digit number' });
    }
    members.push({
      employeeId: emp.employeeId,
      uan: String(emp.uan).trim(),
      name: (emp.name || '').trim(),
      ...fig,
    });
  }

  const totals = members.reduce((t, m) => {
    t.epfWages += m.epfWages; t.epsWages += m.epsWages; t.grossWages += m.grossWages;
    t.epfContri += m.epfContri; t.epsContri += m.epsContri; t.epfEpsDiff += m.epfEpsDiff;
    return t;
  }, { epfWages: 0, epsWages: 0, grossWages: 0, epfContri: 0, epsContri: 0, epfEpsDiff: 0 });

  const summary = {
    totalEmployees: employees.length,
    eligibleEmployees: members.length,
    excludedEmployees: errors.length,
    missingUan,
    missingPf,
    warningCount: warnings.length,
    errorCount: errors.length,
    totals,
  };

  return { members, errors, warnings, summary };
}

/** Format one member object into an ECR line. */
function memberToLine(m) {
  return [
    m.uan,
    m.name,
    m.grossWages,
    m.epfWages,
    m.epsWages,
    m.edliWages,
    m.epfContri,
    m.epsContri,
    m.epfEpsDiff,
    m.ncpDays,
    m.refundOfAdvances,
  ].join(ECR_DELIMITER);
}

/** Build the full ECR text file body (newline-separated member lines). */
function buildEcrFileContent(members) {
  return members.map(memberToLine).join('\n');
}

/** Safe ECR filename, e.g. ECR_TNMAS12345_June_2026.txt */
function ecrFileName({ pfCode, month, year }) {
  const safe = (s) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  const est = safe(pfCode) || 'ESTABLISHMENT';
  return `ECR_${est}_${safe(month)}_${safe(year)}.txt`;
}

module.exports = {
  ECR_DELIMITER,
  EPF_WAGE_CEILING,
  DEFAULT_EPF_RATE,
  EPS_RATE,
  computeMemberFigures,
  validateMember,
  buildEcr,
  memberToLine,
  buildEcrFileContent,
  ecrFileName,
};
