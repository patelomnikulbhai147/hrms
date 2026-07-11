/**
 * Payroll Employee Salary Worksheet — controller (ENHANCEMENT LAYER).
 *
 * Reads/writes the granular salary breakdown in `payroll_worksheet`. On save it
 * ALSO mirrors the derived aggregates back onto the existing `Payroll` row
 * (basicSalary / allowances / bonus / deductions / tax / netSalary) so the
 * existing payslip, salary register, reports and dashboard stay correct — the
 * database remains the single source of truth and everything stays in sync.
 *
 * It never alters payroll calculation logic, generation, approval, locking,
 * attendance, leave, PF/ESI engines, or any other module.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { LEGACY_DEDUCTION_COLUMNS, listDeductionComponents, labelFor } = require('../services/deductionCatalog');

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };

// Maximum allowed value for any single payroll component (₹10,00,00,000 = 10 crore).
const MAX_AMOUNT = 100000000;

// Strict numeric validation — rejects scientific notation (3232e20), alphabetic
// input, NaN, Infinity, negatives and over-limit values. Returns a clear error.
function strictAmount(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: 0 };
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t === '') return { ok: true, value: 0 };
    if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, error: 'Only numbers and decimal values are allowed.' };
  } else if (typeof raw !== 'number') {
    return { ok: false, error: 'Invalid payroll amount.' };
  }
  const v = Number(raw);
  if (!Number.isFinite(v)) return { ok: false, error: 'Invalid payroll amount.' };
  if (v < 0) return { ok: false, error: 'Payroll amounts cannot be negative.' };
  if (v > MAX_AMOUNT) return { ok: false, error: `Amount exceeds the maximum allowed (₹${MAX_AMOUNT.toLocaleString('en-IN')}).` };
  return { ok: true, value: Math.round(v * 100) / 100 };
}
const actorName = (req) => req.user?.name || req.user?.email || (req.user?.id ? `user#${req.user.id}` : 'system');
const isSuperAdmin = (req) => req.user?.role === 'Super Admin';

const EARNING_FIELDS = ['basic', 'hra', 'da', 'conveyance', 'medical', 'specialAllowance', 'educationAllowance', 'washingAllowance', 'bonus', 'incentive', 'overtime', 'arrears', 'otherEarnings'];
// Legacy deduction COLUMNS. Still written on every save so anything reading the
// table directly keeps working — but they are no longer the source of truth.
// The full, dynamic deduction set lives in `deductionsJson`; see deductionCatalog.
const DEDUCTION_FIELDS = LEGACY_DEDUCTION_COLUMNS;
const EMPLOYER_FIELDS = ['employerPf', 'employerEsi'];
const ALL_FIELDS = [...EARNING_FIELDS, ...DEDUCTION_FIELDS, ...EMPLOYER_FIELDS];

const sum = (obj, keys) => keys.reduce((s, k) => s + num(obj[k]), 0);

/** Sum of a [{key,label,amount}] deduction list. */
const sumDeductions = (list) => Math.round((list || []).reduce((s, d) => s + num(d.amount), 0) * 100) / 100;

/**
 * Totals from earnings + the DYNAMIC deduction list (not the legacy columns), so
 * a component that has no column — LWP, Food, a custom one — still counts.
 */
function computeTotals(ws, deductions) {
  const totalEarnings = sum(ws, EARNING_FIELDS);
  const totalDeductions = sumDeductions(deductions);
  const grossSalary = totalEarnings;
  const netSalary = Math.round((totalEarnings - totalDeductions) * 100) / 100;
  const ctcImpact = Math.round((grossSalary + num(ws.employerPf) + num(ws.employerEsi)) * 100) / 100;
  return { totalEarnings, totalDeductions, grossSalary, netSalary, ctcImpact };
}

/** Deduction list → { key: amount } for the legacy columns only. */
function legacyColumnValues(deductions) {
  const out = {};
  for (const col of LEGACY_DEDUCTION_COLUMNS) out[col] = 0;
  for (const d of deductions || []) if (out[d.key] !== undefined) out[d.key] = num(d.amount);
  return out;
}

/**
 * Read a stored worksheet row's deductions. `deductionsJson` is authoritative;
 * a row written before this column existed falls back to its legacy columns.
 */
function readDeductions(row, components) {
  if (row.deductionsJson) {
    try {
      const parsed = JSON.parse(row.deductionsJson);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(d => ({
          key: String(d.key),
          // Prefer the stored label: an already-issued payslip must not be
          // rewritten by a later rename in the Component Builder.
          label: d.label || labelFor(components, String(d.key)),
          amount: num(d.amount),
        }));
      }
    } catch { /* fall through to the legacy columns */ }
  }
  return LEGACY_DEDUCTION_COLUMNS
    .map(col => ({ key: col, label: labelFor(components, col), amount: num(row[col]) }));
}

// Verify the requester may access this employee's payroll (company/branch scope).
function inScope(req, emp) {
  if (isSuperAdmin(req)) return true;
  const scope = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || []), ...(req.user?.accessibleBranchIds || [])].filter(Boolean).map(Number);
  return scope.includes(Number(emp?.companyId)) || (emp?.branchId && scope.includes(Number(emp.branchId)));
}

async function loadContext(req) {
  const payrollId = idParam(req.params.id);
  const payroll = await prisma.payroll.findUnique({ where: { id: payrollId } });
  if (!payroll) return { error: { code: 404, msg: 'Payroll record not found.' } };
  const employee = await prisma.employee.findUnique({ where: { id: payroll.employeeId } });
  if (employee && !inScope(req, employee)) return { error: { code: 403, msg: 'You do not have access to this employee.' } };
  const company = await prisma.company.findUnique({ where: { id: payroll.companyId } }).catch(() => null);
  const summary = await prisma.attendanceSummary.findFirst({ where: { employeeId: payroll.employeeId, month: payroll.month, year: payroll.year } }).catch(() => null);
  return { payrollId, payroll, employee, company, summary };
}

/**
 * First-open seed, derived from the aggregate Payroll row. The seed MUST total
 * exactly `Payroll.deductions`, otherwise opening the worksheet would silently
 * restate an employee's net pay.
 *
 * Convention (shared with the payslip): `Payroll.deductions` is the total of ALL
 * deduction components, TDS included. `Payroll.tax` duplicates the TDS component
 * for reporting; it is never added on top.
 *
 * Two defects previously broke that invariant, both fixed here:
 *   1. TDS was excluded from `knownDed` but included in the total → the seed
 *      overstated deductions by the TDS amount (12 rows).
 *   2. The residual was clamped at 0, so when the derived statutory floor
 *      exceeded the stored total the seed overstated it (24 rows). We now
 *      withhold the statutory lines we cannot justify instead of inventing a
 *      total, exactly as the payslip does.
 */
function deriveDefault(payroll, company) {
  const basic = num(payroll.basicSalary);
  const allowances = num(payroll.allowances);
  const bonus = num(payroll.bonus);
  const hra = Math.round(basic * 0.4);
  const specialAllowance = Math.max(0, Math.round((allowances - hra) * 100) / 100); // remainder so hra+special == allowances

  const pfRate = company?.pfRate ?? 12;
  const esicRate = company?.esicRate ?? 0.75;
  const profTax = company?.profTaxRate ?? 200;
  const pf = Math.round(basic * (pfRate / 100));
  const esi = Math.round(basic * (esicRate / 100));
  const tds = num(payroll.tax);
  const loanRecovery = num(payroll.loanDeduction); // a real stored column
  const total = num(payroll.deductions);

  // TDS and the loan EMI are stored facts; PF/ESI/PT are derived from rates.
  const stored = tds + loanRecovery;
  const statutory = pf + esi + profTax;
  const residual = Math.round((total - statutory - stored) * 100) / 100;

  let ded;
  if (residual < -0.5) {
    // The derived statutory floor exceeds what payroll actually deducted. We
    // cannot know which of PF/ESI/PT was waived or pro-rated, so we show only
    // what is stored and pool the rest under one honest, editable line. The
    // user itemises it in the worksheet; nothing is fabricated on their behalf.
    ded = {
      pf: 0, eps: 0, vpf: 0, esi: 0, professionalTax: 0, tds, lwf: 0,
      advanceRecovery: 0, loanRecovery, insurance: 0,
      otherDeductions: Math.round((total - stored) * 100) / 100,
    };
  } else {
    ded = {
      pf, eps: 0, vpf: 0, esi, professionalTax: profTax, tds, lwf: 0,
      advanceRecovery: 0, loanRecovery, insurance: 0,
      otherDeductions: residual, // the unexplained remainder — NOT labelled LWP
    };
  }

  const ws = {
    basic, hra, da: 0, conveyance: 0, medical: 0, specialAllowance, educationAllowance: 0, washingAllowance: 0,
    bonus, incentive: 0, overtime: 0, arrears: 0, otherEarnings: 0,
    ...ded,
    employerPf: Math.round(basic * (pfRate / 100)),
    employerEsi: Math.round((basic + allowances) * 0.0325),
  };
  return { ws, ded };
}

// Exported for tests: the seed must total exactly Payroll.deductions.
exports._deriveDefault = deriveDefault;
exports._computeTotals = computeTotals;

function attendanceBlock(payroll, summary) {
  // Days-in-month for the payroll period.
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const mi = MONTHS.indexOf(payroll.month);
  const monthDays = mi >= 0 ? new Date(payroll.year, mi + 1, 0).getDate() : 30;
  const present = num(summary?.presentDays ?? payroll.presentDays);
  const cl = num(summary?.cl ?? payroll.clDays);
  const sl = num(summary?.sl ?? payroll.slDays);
  const pl = num(summary?.pl ?? payroll.plDays);
  const half = num(summary?.halfDays ?? payroll.halfDays);
  const lop = num(summary?.lwp ?? payroll.lwpDays);
  const ot = num(summary?.otHours ?? payroll.otHours);
  const payable = num(summary?.payableDays ?? payroll.payableDays);
  const absent = num(summary?.absentDays ?? Math.max(0, monthDays - present - cl - sl - pl - half - lop));
  return { monthDays, weeklyOff: null, holidays: null, workingDays: payable || monthDays, present, absent, cl, sl, pl, halfDays: half, lop, otHours: ot, payableDays: payable, locked: !!summary?.locked };
}

function employeeBlock(payroll, employee) {
  return {
    employeeCode: employee?.employeeId || '—',
    name: payroll.employeeName || employee?.name || '—',
    branch: employee?.branchLocation || '—',
    department: payroll.department || employee?.department || '—',
    designation: employee?.designation || '—',
    uan: employee?.uan || '—',
    esic: employee?.esiNumber || '—',
    payrollMonth: `${payroll.month} ${payroll.year}`,
  };
}

// GET /api/payroll/:id/worksheet
exports.get = async (req, res) => {
  try {
    const ctx = await loadContext(req);
    if (ctx.error) return res.status(ctx.error.code).json({ error: ctx.error.msg });
    const { payroll, employee, company, summary } = ctx;

    // Active deduction components for this company: built-ins + Component Builder.
    const components = await listDeductionComponents(prisma, payroll.companyId);

    const rows = await prisma.$queryRawUnsafe('SELECT * FROM payroll_worksheet WHERE payrollId = ?', payroll.id);
    let worksheet, stored;
    if (rows.length) {
      const r = rows[0];
      worksheet = {};
      for (const f of ALL_FIELDS) worksheet[f] = num(r[f]);
      stored = readDeductions(r, components);
      Object.assign(worksheet, computeTotals(worksheet, stored), { _derived: false, updatedAt: r.updatedAt, updatedBy: r.updatedBy });
    } else {
      const d = deriveDefault(payroll, company);
      worksheet = { ...d.ws, ...computeTotals(d.ws, Object.entries(d.ded).map(([k, v]) => ({ key: k, amount: v }))), _derived: true };
      stored = Object.entries(d.ded).map(([k, v]) => ({ key: k, label: labelFor(components, k), amount: num(v) }));
    }

    // The full deduction set the worksheet renders: every active component, with
    // the amount held for this payroll (0 when the component does not apply).
    // Components that were saved but are no longer active are appended so an
    // archived component's money never vanishes from an issued worksheet.
    const byKey = new Map(stored.map(d => [d.key, d]));
    const deductions = components.map(c => ({
      key: c.key,
      label: c.label,
      amount: num(byKey.get(c.key)?.amount),
      editable: c.editable,
      system: c.system,
    }));
    for (const d of stored) {
      if (!components.some(c => c.key === d.key) && num(d.amount) > 0) {
        deductions.push({ key: d.key, label: d.label, amount: num(d.amount), editable: true, system: false, archived: true });
      }
    }

    const locked = String(payroll.payrollStatus).toLowerCase() === 'locked' || String(payroll.paymentStatus).toLowerCase() === 'paid' || !!payroll.lockedAt;
    res.json({
      payrollId: payroll.id,
      employee: employeeBlock(payroll, employee),
      attendance: attendanceBlock(payroll, summary),
      worksheet,
      deductions,
      deductionComponents: components,
      meta: {
        payrollStatus: payroll.payrollStatus,
        paymentStatus: payroll.paymentStatus,
        isOutdated: !!payroll.isOutdated,
        locked,
        editable: !locked || isSuperAdmin(req),
      },
    });
  } catch (e) { console.error('worksheet.get', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// PUT /api/payroll/:id/worksheet
exports.save = async (req, res) => {
  try {
    const ctx = await loadContext(req);
    if (ctx.error) return res.status(ctx.error.code).json({ error: ctx.error.msg });
    const { payroll, company } = ctx;

    // Protect finalized payroll — only Super Admin may edit a locked/paid record.
    const locked = String(payroll.payrollStatus).toLowerCase() === 'locked' || String(payroll.paymentStatus).toLowerCase() === 'paid' || !!payroll.lockedAt;
    if (locked && !isSuperAdmin(req)) return res.status(400).json({ error: 'This payroll is locked or already paid and cannot be edited.' });

    const body = req.body || {};
    const components = await listDeductionComponents(prisma, payroll.companyId);
    const knownKeys = new Set(components.map(c => c.key));

    // ── Deductions: a dynamic {key: amount} map or [{key,label,amount}] list ──
    // Legacy callers that posted `deductions: { pf: 1, esi: 2, … }` keep working:
    // those keys are a subset of the catalog, so the same path handles both.
    const rawDed = body.deductions || {};
    const entries = Array.isArray(rawDed)
      ? rawDed.map(d => [String(d.key), d.amount])
      : Object.entries(rawDed);

    const deductions = [];
    for (const [key, amount] of entries) {
      if (!knownKeys.has(key)) {
        return res.status(400).json({ error: `Unknown deduction component "${key}". Add it in Settings → Payroll → Component Builder.` });
      }
      const r = strictAmount(amount);
      if (!r.ok) return res.status(400).json({ error: `${labelFor(components, key)}: ${r.error}` });
      deductions.push({ key, label: labelFor(components, key), amount: r.value });
    }

    // ── Strict numeric validation of earnings + employer fields ──
    const ws = {};
    const input = { ...(body.earnings || {}), ...(body.employer || {}) };
    for (const f of [...EARNING_FIELDS, ...EMPLOYER_FIELDS]) {
      const r = strictAmount(input[f] !== undefined ? input[f] : body[f]);
      if (!r.ok) return res.status(400).json({ error: `${f}: ${r.error}` });
      ws[f] = r.value;
    }
    // Mirror the dynamic list into the legacy columns it covers.
    Object.assign(ws, legacyColumnValues(deductions));

    const totals = computeTotals(ws, deductions);
    if (totals.netSalary < 0) return res.status(400).json({ error: `Net salary cannot be negative (earnings ₹${totals.totalEarnings} − deductions ₹${totals.totalDeductions}).` });
    if (totals.totalEarnings <= 0) return res.status(400).json({ error: 'Total earnings must be greater than zero.' });
    // PF/ESI sanity: statutory deductions should not exceed gross.
    if (totals.totalDeductions > totals.totalEarnings) return res.status(400).json({ error: 'Total deductions cannot exceed total earnings.' });

    const merged = { ...ws, ...totals };
    // Persist only the components that actually apply. A zero row carries no
    // information and would resurrect the "every row always present" problem.
    const persisted = deductions.filter(d => num(d.amount) > 0.005);
    const deductionsJson = JSON.stringify(persisted);

    // Previous worksheet (for audit diff).
    const prevRows = await prisma.$queryRawUnsafe('SELECT * FROM payroll_worksheet WHERE payrollId = ?', payroll.id);
    const previous = prevRows[0] || null;

    // Upsert the worksheet row.
    const cols = [...ALL_FIELDS, 'totalEarnings', 'totalDeductions', 'grossSalary', 'netSalary', 'ctcImpact'];
    const insertCols = ['payrollId', 'employeeId', 'companyId', 'month', 'year', ...cols, 'deductionsJson', 'createdBy', 'updatedBy'];
    const insertVals = [payroll.id, payroll.employeeId, payroll.companyId, payroll.month, payroll.year, ...cols.map(c => merged[c]), deductionsJson, actorName(req), actorName(req)];
    const updateClause = [...cols.map(c => `${c} = VALUES(${c})`), 'deductionsJson = VALUES(deductionsJson)', 'updatedBy = VALUES(updatedBy)'].join(', ');
    await prisma.$executeRawUnsafe(
      `INSERT INTO payroll_worksheet (${insertCols.join(',')}) VALUES (${insertCols.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE ${updateClause}`,
      ...insertVals
    );

    // ── Mirror derived aggregates back onto the existing Payroll row (keeps the
    //    rest of the payroll system — payslip / register / reports — in sync). ──
    const aggBasic = num(merged.basic);
    const aggBonus = num(merged.bonus);
    const aggAllowances = Math.round((totals.totalEarnings - aggBasic - aggBonus) * 100) / 100;
    const aggTax = num(merged.tds);
    // `Payroll.deductions` is the TOTAL of every component, TDS included — the
    // convention the payslip, register and reports already assume. It previously
    // subtracted TDS here, which would have made a saved worksheet disagree with
    // the slip generated from it. `tax` duplicates the TDS line for reporting.
    const aggDeductions = totals.totalDeductions;
    await prisma.payroll.update({
      where: { id: payroll.id },
      data: {
        basicSalary: aggBasic,
        allowances: aggAllowances,
        bonus: aggBonus,
        tax: aggTax,
        deductions: aggDeductions,
        netSalary: totals.netSalary,
      },
    });

    // ── Audit trail (worksheet-level + existing payroll revision history) ──
    await prisma.$executeRawUnsafe(
      'INSERT INTO payroll_worksheet_audit_logs (payrollId, employeeId, month, year, action, performedBy, performedById, previousValues, newValues) VALUES (?,?,?,?,?,?,?,?,?)',
      payroll.id, payroll.employeeId, payroll.month, payroll.year, previous ? 'UPDATE' : 'CREATE', actorName(req), req.user?.id || null,
      previous ? JSON.stringify(previous).slice(0, 12000) : null,
      JSON.stringify(merged).slice(0, 12000),
    ).catch(() => {});
    if (req.user?.id) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id, action: 'REVISE_PAYROLL', module: 'Payroll', targetId: String(payroll.id),
          details: JSON.stringify({ employee: payroll.employeeName, by: actorName(req), source: 'Salary Worksheet', net: totals.netSalary, gross: totals.grossSalary }).slice(0, 1500),
        },
      }).catch(() => {});
    }

    res.json({
      message: 'Salary worksheet saved.',
      worksheet: { ...merged, _derived: false },
      deductions: persisted,
      payroll: { id: payroll.id, basicSalary: aggBasic, allowances: aggAllowances, bonus: aggBonus, tax: aggTax, deductions: aggDeductions, netSalary: totals.netSalary },
    });
  } catch (e) { console.error('worksheet.save', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

/**
 * GET /api/payroll/deduction-components
 * Active deduction components for the caller's company: built-ins plus anything
 * defined in Settings → Payroll → Component Builder. The worksheet, payslip and
 * reports all render from this list, so adding a component here surfaces it
 * everywhere with no code change.
 */
exports.deductionComponents = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']) || req.user?.companyId;
    const list = await listDeductionComponents(prisma, companyId);
    res.json(list);
  } catch (e) { console.error('worksheet.deductionComponents', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// GET /api/payroll/:id/worksheet/audit
exports.audit = async (req, res) => {
  try {
    const ctx = await loadContext(req);
    if (ctx.error) return res.status(ctx.error.code).json({ error: ctx.error.msg });
    const logs = await prisma.$queryRawUnsafe('SELECT id, action, performedBy, performedById, createdAt FROM payroll_worksheet_audit_logs WHERE payrollId = ? ORDER BY id DESC LIMIT 100', ctx.payroll.id);
    res.json(logs);
  } catch (e) { console.error('worksheet.audit', e); res.status(500).json({ error: e.message || 'Server error' }); }
};
