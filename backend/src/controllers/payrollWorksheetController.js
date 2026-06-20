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
const DEDUCTION_FIELDS = ['pf', 'eps', 'vpf', 'esi', 'professionalTax', 'tds', 'lwf', 'advanceRecovery', 'loanRecovery', 'insurance', 'otherDeductions'];
const EMPLOYER_FIELDS = ['employerPf', 'employerEsi'];
const ALL_FIELDS = [...EARNING_FIELDS, ...DEDUCTION_FIELDS, ...EMPLOYER_FIELDS];

const sum = (obj, keys) => keys.reduce((s, k) => s + num(obj[k]), 0);

function computeTotals(ws) {
  const totalEarnings = sum(ws, EARNING_FIELDS);
  const totalDeductions = sum(ws, DEDUCTION_FIELDS);
  const grossSalary = totalEarnings;
  const netSalary = Math.round((totalEarnings - totalDeductions) * 100) / 100;
  const ctcImpact = Math.round((grossSalary + num(ws.employerPf) + num(ws.employerEsi)) * 100) / 100;
  return { totalEarnings, totalDeductions, grossSalary, netSalary, ctcImpact };
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

// Build a sensible default worksheet from the existing Payroll aggregates so the
// first-open totals exactly match the current payslip (no value invented or lost).
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
  const knownDed = pf + esi + profTax;
  const otherDeductions = Math.max(0, Math.round((num(payroll.deductions) - knownDed) * 100) / 100); // absorbs LWP etc.

  const ws = {
    basic, hra, da: 0, conveyance: 0, medical: 0, specialAllowance, educationAllowance: 0, washingAllowance: 0,
    bonus, incentive: 0, overtime: 0, arrears: 0, otherEarnings: 0,
    pf, eps: 0, vpf: 0, esi, professionalTax: profTax, tds, lwf: 0, advanceRecovery: 0, loanRecovery: 0, insurance: 0, otherDeductions,
    employerPf: Math.round(basic * (pfRate / 100)),
    employerEsi: Math.round((basic + allowances) * 0.0325),
  };
  return { ...ws, ...computeTotals(ws), _derived: true };
}

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

    const rows = await prisma.$queryRawUnsafe('SELECT * FROM payroll_worksheet WHERE payrollId = ?', payroll.id);
    let worksheet;
    if (rows.length) {
      const r = rows[0];
      worksheet = {};
      for (const f of ALL_FIELDS) worksheet[f] = num(r[f]);
      Object.assign(worksheet, computeTotals(worksheet), { _derived: false, updatedAt: r.updatedAt, updatedBy: r.updatedBy });
    } else {
      worksheet = deriveDefault(payroll, company);
    }

    const locked = String(payroll.payrollStatus).toLowerCase() === 'locked' || String(payroll.paymentStatus).toLowerCase() === 'paid' || !!payroll.lockedAt;
    res.json({
      payrollId: payroll.id,
      employee: employeeBlock(payroll, employee),
      attendance: attendanceBlock(payroll, summary),
      worksheet,
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
    const input = { ...(body.earnings || {}), ...(body.deductions || {}), ...(body.employer || {}) };

    // ── Strict numeric validation of every field (rejects e-notation, NaN, etc.) ──
    const ws = {};
    for (const f of ALL_FIELDS) {
      const r = strictAmount(input[f] !== undefined ? input[f] : body[f]);
      if (!r.ok) return res.status(400).json({ error: `${f}: ${r.error}` });
      ws[f] = r.value;
    }
    const totals = computeTotals(ws);
    if (totals.netSalary < 0) return res.status(400).json({ error: `Net salary cannot be negative (earnings ₹${totals.totalEarnings} − deductions ₹${totals.totalDeductions}).` });
    if (totals.totalEarnings <= 0) return res.status(400).json({ error: 'Total earnings must be greater than zero.' });
    // PF/ESI sanity: statutory deductions should not exceed gross.
    if (totals.totalDeductions > totals.totalEarnings) return res.status(400).json({ error: 'Total deductions cannot exceed total earnings.' });

    const merged = { ...ws, ...totals };

    // Previous worksheet (for audit diff).
    const prevRows = await prisma.$queryRawUnsafe('SELECT * FROM payroll_worksheet WHERE payrollId = ?', payroll.id);
    const previous = prevRows[0] || null;

    // Upsert the worksheet row.
    const cols = [...ALL_FIELDS, 'totalEarnings', 'totalDeductions', 'grossSalary', 'netSalary', 'ctcImpact'];
    const insertCols = ['payrollId', 'employeeId', 'companyId', 'month', 'year', ...cols, 'createdBy', 'updatedBy'];
    const insertVals = [payroll.id, payroll.employeeId, payroll.companyId, payroll.month, payroll.year, ...cols.map(c => merged[c]), actorName(req), actorName(req)];
    const updateClause = [...cols.map(c => `${c} = VALUES(${c})`), 'updatedBy = VALUES(updatedBy)'].join(', ');
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
    const aggDeductions = Math.round((totals.totalDeductions - aggTax) * 100) / 100;
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
      payroll: { id: payroll.id, basicSalary: aggBasic, allowances: aggAllowances, bonus: aggBonus, tax: aggTax, deductions: aggDeductions, netSalary: totals.netSalary },
    });
  } catch (e) { console.error('worksheet.save', e); res.status(500).json({ error: e.message || 'Server error' }); }
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
