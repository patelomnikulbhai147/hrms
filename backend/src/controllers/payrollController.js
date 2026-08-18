const prisma = require('../config/prisma');
const otPay = require('../utils/overtimePay');
const { toPositiveInt, toPositiveIntList, wasSupplied } = require('../utils/numericId');

// ─────────────────────────────────────────────────────────────────────────────
// The employee fields the payroll LIST needs to embed.
//
// This used to be `include: { employee: true }` — the whole employee record, all
// ~60 columns including both addresses, on every payroll row. Measured against
// production that was 5.9 MB of a 6.5 MB response (89%): 2,484 payroll rows
// embedding 829 employees, each repeated once per pay period, while the client
// had already loaded the full employee list separately from /employees.
//
// Only four of these are read by the UI (employeeId, name, branchLocation,
// branchId); companyId/department/designation/status are kept because they are
// cheap and are what scoping and grouping key off.
const PAYROLL_EMPLOYEE_FIELDS = {
  id: true, employeeId: true, name: true, companyId: true,
  branchId: true, branchLocation: true, department: true,
  designation: true, status: true,
};

// Coerces a string/number id to an integer PK. Used by update/delete/emailSlip
// below; previously only require()'d inline in one spot, leaving `idParam` undefined
// in the rest of the file (payroll edit/delete 500'd with "idParam is not defined").
const idParam = require('../utils/idParam');
// Branch-aware workspace authorisation. Company ids and branch ids share ONE
// sequence, and `protect` keeps branch grants in a separate list — so a workspace
// can only be authorised through this helper, never through a local array of
// accessibleCompanyIds (see utils/workspaceScope.js).
const { canEnterWorkspace, isSuperAdmin, companyScopeFor } = require('../utils/workspaceScope');
const { OFFBOARDED_STATUSES } = require('../utils/employeeStatus');
// Offboarding salary cut-off — MIN(month end, exitDate). Shared with
// attendanceSummaryService so eligibility and proration can never disagree.
const { employmentWindow, payrollEligibilityWhere } = require('../utils/employmentWindow');

/**
 * Tenant guard for id-driven payroll writes.
 *
 * approve / mark-paid / delete take a raw `ids` array from the request body. A
 * filter of `{ id: { in: ids } }` alone will happily approve, pay or delete
 * ANOTHER tenant's salary rows, so every such query is additionally constrained
 * to the companies the caller can actually reach. Super Admin is unrestricted.
 * Returns an object to spread into `where` (`{}` for Super Admin).
 */
function payrollTenantWhere(req) {
  if (isSuperAdmin(req)) return {};
  const scope = companyScopeFor(req);
  return { companyId: { in: scope.length ? scope : [-1] } };
}

// ── Statutory constants (must match complianceReportController + ecrEngine) ──
// PF is computed on wages capped at the ceiling; ESI applies only up to the
// coverage ceiling and the EMPLOYEE share is a fixed 0.75% (the company's
// configurable `esicRate` is the EMPLOYER share, which the return charges the
// company and is never withheld from the employee).
const PF_WAGE_CEILING = 15000;
const ESI_GROSS_CEILING = 21000;
const ESI_EMP_RATE = 0.75;
const { recurringBonusFor, bonusForPayroll } = require('../utils/bonusCalc');
// Loan → payroll integration: auto-deduct an active loan's EMI when a payroll row
// is (re)computed, settle its installment ledger, and advance the loan status.
// Idempotent — safe on repeated recalc (see services/loanPayroll.js).
const { applyLoanToPayrollRow } = require('../services/loanPayroll');
// Rebuilds a monthly AttendanceSummary from raw Attendance-module rows. Used so a
// payroll recalc always reflects current verified attendance (self-heals a
// missing/stale summary). recompute() preserves locked months.
const attendanceSummaryService = require('../services/attendanceSummaryService');
// Attendance & Salary Deduction Policy — the master calc config. recalcOne
// resolves the effective policy (per company/branch) for the OT multiplier and
// stamps the version used onto the payroll row.
const policyService = require('../services/deductionPolicyService');

// ── Payroll money guard (pre-deployment audit fix) ───────────────────────────
// The create/update endpoints persist a client-supplied `payload` directly. This
// sanitiser enforces the financial invariants at the LAST write choke-point so no
// path can ever store an invalid payroll row:
//   • no monetary field may be negative (basic/allowances/deductions/bonus/tax/OT);
//   • netSalary can NEVER be negative — it is clamped to ≥ 0 (a ₹200 deduction on
//     a ₹0-earnings employee produced net = −200 before this guard);
//   • non-finite / NaN amounts are dropped so the DB never stores garbage.
// Deterministic & idempotent: re-running it yields the same result.
const MONEY_FIELDS = ['basicSalary', 'allowances', 'deductions', 'bonus', 'tax', 'overtime', 'otHours'];
const round2 = (n) => Math.round(n * 100) / 100;
function sanitizePayrollMoney(payload, existing = null) {
  for (const f of MONEY_FIELDS) {
    if (payload[f] === undefined || payload[f] === null || payload[f] === '') continue;
    const n = Number(payload[f]);
    if (!Number.isFinite(n)) { delete payload[f]; continue; } // never persist NaN/Infinity
    payload[f] = round2(Math.max(0, n)); // no negative earnings/deductions
  }
  // Enforce net ≥ 0. Use the value being written, else the existing stored one.
  if (payload.netSalary !== undefined && payload.netSalary !== null && payload.netSalary !== '') {
    const net = Number(payload.netSalary);
    payload.netSalary = Number.isFinite(net) ? round2(Math.max(0, net)) : 0;
  } else if (existing && Number(existing.netSalary) < 0) {
    // A component edit that leaves the stored net negative → repair it in-place.
    payload.netSalary = 0;
  }
  assertPayrollIdentity(payload, existing);
  return payload;
}

/**
 * THE payslip invariant:  netSalary === basicSalary + allowances + bonus − deductions
 *
 * Every payslip, register and statutory report reads these four columns, so a row
 * that breaks the identity is a document whose own figures contradict each other.
 * 5,032 historical rows did exactly that — Basic was stored as a per-DAY rate
 * (monthly ÷ 24) while deductions and net were monthly, which is how payslips
 * ended up showing a net LARGER than the gross on the same row.
 *
 * This deliberately does NOT rewrite the amounts. Silently "correcting" salary is
 * how a reporting bug becomes a payment bug. It records the violation loudly with
 * the row's identity so it is caught in the log on the day it happens, instead of
 * being discovered months later across thousands of finalised records.
 */
function assertPayrollIdentity(payload, existing = null) {
  const pick = (f) => {
    const v = payload[f] !== undefined && payload[f] !== null && payload[f] !== '' ? payload[f] : existing?.[f];
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const basic = pick('basicSalary'), allow = pick('allowances');
  const ded = pick('deductions'), net = pick('netSalary');
  // Only assert when every component is known; a partial edit has nothing to check.
  if ([basic, allow, ded, net].some((v) => v === null)) return;
  const bonus = pick('bonus') || 0;
  const expected = basic + allow + bonus - ded;
  // Net is clamped at 0, so a legitimately negative result is not a violation.
  if (expected < 0 && net === 0) return;
  if (Math.abs(expected - net) > 1) {
    console.error(
      '[payroll] INVARIANT VIOLATED — netSalary does not equal basic + allowances + bonus − deductions.',
      JSON.stringify({
        payrollId: existing?.id ?? payload.id ?? null,
        employeeId: existing?.employeeId ?? payload.employeeId ?? null,
        period: `${existing?.month ?? payload.month ?? '?'} ${existing?.year ?? payload.year ?? '?'}`,
        basicSalary: basic, allowances: allow, bonus, deductions: ded,
        netSalary: net, expectedNet: expected, difference: round2(net - expected),
      })
    );
  }
}
exports.assertPayrollIdentity = assertPayrollIdentity;

// Helper to sync payroll for missing employees
// UNUSED — deliberately. This creates payroll rows, and its only caller was the
// GET list handler, which meant a read request wrote records for whatever period
// the query string named. It is kept (not deleted) because `generate` may want
// this logic, but it must NEVER be called from a read path again.
const syncPayrollForEmployees = async (companyWhere, month, year) => {
  // Offboarded employees are excluded from payroll generation.
  const employeeWhere = { status: { notIn: OFFBOARDED_STATUSES } };
  if (companyWhere) {
    if (typeof companyWhere === 'string') {
      employeeWhere.OR = [
        { companyId: companyWhere },
        { branchId: companyWhere }
      ];
    } else if (companyWhere.in) {
      employeeWhere.OR = [
        { companyId: { in: companyWhere.in } },
        { branchId: { in: companyWhere.in } }
      ];
    }
  }

  const employeesRaw = await prisma.employee.findMany({
    where: employeeWhere
  });

  const companyIds = [...new Set(employeesRaw.map(e => e.companyId).filter(Boolean))];
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } }
  });
  const companyMap = {};
  for (const c of companies) companyMap[c.id] = c;

  const employees = employeesRaw.map(e => ({
    ...e,
    company: companyMap[e.companyId] || null
  }));

  if (!employees.length) return;

  const payrollRecords = await prisma.payroll.findMany({
    where: {
      month,
      year,
      employeeId: { in: employees.map(e => e.id) }
    },
    select: { employeeId: true }
  });

  const existingEmployeeIds = new Set(payrollRecords.map(p => p.employeeId));
  const missingEmployees = employees.filter(e => !existingEmployeeIds.has(e.id) && e.salary > 0);

  if (missingEmployees.length > 0) {
    const promises = missingEmployees.map(async emp => {
      const basicPercent = emp.company?.basicPercent || 50;
      const basicSalary = emp.salary;
      const hra = Math.round(basicSalary * 0.4);
      const special = Math.round(basicSalary * 0.1);
      const allowances = hra + special;
      
      const pfRate = emp.company?.pfRate || 12;
      const esicRate = emp.company?.esicRate || 0.75;
      const profTax = emp.company?.profTaxRate || 200;
      
      const pfDeduction = Math.round(basicSalary * (pfRate / 100));
      const esicDeduction = Math.round(basicSalary * (esicRate / 100));
      const deductions = pfDeduction + esicDeduction + profTax;
      const netSalary = Math.max(0, (basicSalary + allowances) - deductions);

      return prisma.payroll.create({
        data: {
          companyId: emp.companyId,
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department,
          month,
          year,
          basicSalary,
          allowances,
          deductions,
          netSalary,
          payrollStatus: 'draft',
          paymentStatus: 'pending',
          payslipGenerated: false
        }
      })
        // Fold in any active loan EMI on the freshly-created draft (idempotent).
        .then(row => applyLoanToPayrollRow(prisma, row, 'Payroll Engine'))
        .catch(err => {
         console.error("Failed to auto-create draft payroll:", err.message);
      });
    });

    await Promise.allSettled(promises);
  }
};

// ── Attendance-driven payroll computation ────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const daysInMonthOf = (month, year) => {
  const mi = Math.max(0, MONTHS.findIndex(m => m.toLowerCase() === String(month).toLowerCase()));
  return new Date(Number(year), mi + 1, 0).getDate();
};

/**
 * THE SINGLE PAYROLL ENGINE. Recompute one payroll record STRICTLY from its
 * synchronized AttendanceSummary — attendance is NEVER recalculated here, only
 * read. This is the only place salary is computed, so the Salary Worksheet,
 * Salary Slip, register and reports can never disagree.
 *
 * Formula (exactly the Attendance-Synchronization contract):
 *   dailyRate = monthlyGross / workingDays        (workingDays = days − weekly-off − holiday)
 *   grossPay  = dailyRate × payableDays           (⇒ grossPay = monthlyGross × payable/working)
 *   Basic/HRA/Special are SPLIT out of grossPay (they sum to it — never added on top).
 *   Deductions (PF/ESI/PT/…) are applied AFTER grossPay.
 *   Net = grossPay + OT + Bonus − Deductions.
 * Rules honoured: payable = working → full salary; payable = 0 → grossPay = 0 →
 * Basic/HRA/PF/ESI = 0 → Net = 0 (never the full monthly salary).
 */
async function recalcOne(payroll, summary, emp, company) {
  // `emp.salary` is the MONTHLY GROSS (the CTC component being prorated).
  const monthlyGross = emp?.salary || payroll.basicSalary || 0;
  const dim = daysInMonthOf(payroll.month, payroll.year);

  // Resolve the Attendance & Salary Deduction Policy for this employee's scope.
  // The attendance→days math already lives in the synced AttendanceSummary (which
  // honoured the policy); here we only need the OT multiplier and the version to
  // stamp. Defaults (version 0) reproduce the historical 1.5× OT behaviour.
  const effectivePolicy = await policyService
    .resolveEffectivePolicy({ companyId: emp?.companyId ?? payroll.companyId, branchId: emp?.branchId })
    .catch(() => null);
  const policyCfg = effectivePolicy ? effectivePolicy.config : policyService.POLICY_DEFAULTS;
  const policyVersion = effectivePolicy ? effectivePolicy.version : null;

  const present = summary?.presentDays || 0;
  const cl = summary?.cl || 0, pl = summary?.pl || 0, sl = summary?.sl || 0;
  const lwp = summary?.lwp || 0, half = summary?.halfDays || 0, ot = summary?.otHours || 0;
  const weeklyOff = summary?.weeklyOffDays || 0;
  const holiday = summary?.holidayDays || 0;

  // ── Working days = the proration denominator (read from the synced snapshot) ──
  // Fallback chain only for legacy summaries written before the snapshot columns
  // existed: derive from weekly-off/holiday, else days-in-month.
  const workingDays = (summary && summary.workingDays > 0)
    ? summary.workingDays
    : Math.max(0, dim - weeklyOff - holiday) || dim;
  // No summary at all → treat as fully payable (ratio 1) so a manually created
  // row without attendance is not silently zeroed; the sync gate blocks actions.
  // EXCEPT when an exit date truncates the month: "assume a full month" would pay
  // a leaver for days they were not employed, so the fallback is capped at the
  // days they actually worked. A real summary always wins over this estimate.
  const win = employmentWindow(emp, payroll.month, payroll.year);
  const fallbackPayable = win.truncated
    ? Math.max(0, Math.min(workingDays, win.cutoffDay - (summary?.weeklyOffDays || 0)))
    : workingDays;
  const payableDays = summary ? (summary.payableDays || 0) : fallbackPayable;

  // A month cannot pay for more days than it contains. Half-day rounding in the
  // attendance summary pushed payableDays past the calendar on 148 rows — e.g.
  // 31.5 payable days against a 30-day June. Pay was never affected (the ratio
  // below is capped at 1), but the payslip PRINTS this figure, so it is clamped
  // to the days the month actually has. The AttendanceSummary itself is left
  // untouched: it is the attendance record, this is the payslip figure.
  const calendarDays = workingDays + weeklyOff + holiday;
  const payableForSlip = calendarDays > 0 ? Math.min(payableDays, calendarDays) : payableDays;

  const dailyRate = workingDays > 0 ? monthlyGross / workingDays : 0;
  const ratio = workingDays > 0 ? Math.min(1, Math.max(0, payableDays / workingDays)) : 0;
  const grossPay = Math.round(monthlyGross * ratio); // = dailyRate × payableDays (capped at full)

  // ── Split grossPay into earning components (they SUM to grossPay) ──
  const basicPercent = company?.basicPercent || 50;
  const basic = Math.round(grossPay * (basicPercent / 100));
  const hra = Math.round(basic * 0.4);
  const special = Math.max(0, grossPay - basic - hra); // remainder ⇒ basic + hra + special === grossPay

  // OT is EXTRA hours actually worked — paid on top, never prorated down. The
  // multiplier comes from the deduction policy WHEN a policy has been saved
  // (single source of truth); otherwise we keep the company field so a company
  // that set a custom OT rate pre-policy is never silently reset to the default.
  // Shared with the Attendance-Sync preview (utils/overtimePay) so the OT amount
  // the user reviews before pushing is exactly the amount that reaches the payslip.
  const overtimeRate = otPay.resolveOvertimeMultiplier(effectivePolicy, company);
  const hourlyRate = otPay.hourlyRateFor(monthlyGross, workingDays);
  const otAmount = otPay.computeOvertimeAmount({
    otHours: ot, monthlyGross, workingDays, multiplier: overtimeRate,
  });
  const allowances = hra + special + otAmount;

  // ── Deductions applied AFTER gross pay ──
  // These MUST agree with the statutory returns the same app files
  // (complianceReportController: PF_WAGE_CEILING / ESI_GROSS_CEILING /
  // ESI_EMP_RATE, and services/ecrEngine). Anything withheld here that the ECR /
  // ESI return does not declare is money deducted from an employee that is never
  // remitted, so the engine and the return are deliberately kept identical.
  const pfRate = company?.pfRate || 12;
  const profTax = company?.profTaxRate || 200;
  // `company.esicRate` is the EMPLOYER share (schema default 3.25) — it is what
  // the ESI return charges the company. The EMPLOYEE share is the separate
  // statutory 0.75% and is the only ESI that may be withheld from the payslip.
  // PF is computed on wages capped at the statutory ceiling; ESI applies only
  // while gross is within the coverage ceiling.
  const pfWages = Math.min(basic, PF_WAGE_CEILING);
  const pf = Math.round(pfWages * (pfRate / 100));
  const esi = grossPay > 0 && grossPay <= ESI_GROSS_CEILING
    ? Math.round(grossPay * (ESI_EMP_RATE / 100))
    : 0;
  const pt = grossPay > 0 ? profTax : 0;
  const deductions = pf + esi + pt;

  // Bonus = recurring (employee config) + one-time (festival/performance). It is
  // an explicit entitlement, added to net alongside earnings.
  const { total: bonus } = await bonusForPayroll(prisma, emp || { id: payroll.employeeId }, payroll.month, payroll.year);
  // grossPay = Basic + HRA + Special. OT is extra and lives in `allowances`.
  // Net = Basic + Allowances(incl OT) + Bonus − Deductions.
  const net = Math.max(0, (basic + allowances + bonus) - deductions);

  const updated = await prisma.payroll.update({
    where: { id: payroll.id },
    data: {
      basicSalary: basic, allowances, deductions, netSalary: net, bonus,
      overtime: otAmount,
      // Reset the loan portion here; applyLoanToPayrollRow re-adds the current
      // month's EMI on top (keeps the recompute idempotent).
      loanDeduction: 0,
      // Mirror the full synced attendance snapshot onto the payroll row so the
      // slip / register / reports show the exact synchronized figures.
      presentDays: present, clDays: cl, plDays: pl, slDays: sl, lwpDays: lwp,
      halfDays: half, otHours: ot, payableDays: payableForSlip,
      workingDays, weeklyOffDays: weeklyOff, holidayDays: holiday,
      attendanceSyncedAt: summary?.syncedAt || null,
      attendanceSource: summary?.attendanceSource || null,
      // Stamp the policy version this row was computed under (null pre-policy).
      policyVersion,
      isOutdated: false, summarySyncedAt: new Date(),
      notes: `Recalc: ₹${Math.round(dailyRate)}/day × ${payableDays}/${workingDays} payable day(s) (${Math.round(ratio * 100)}%) = gross ₹${grossPay}, ${lwp} LWP, ${ot} OT hr(s)${bonus ? `, bonus ₹${bonus}` : ''}.`,
    },
  });
  // Fold in any active loan EMI + settle the installment ledger (idempotent).
  return applyLoanToPayrollRow(prisma, updated, 'Payroll Engine');
}

// Auto-sync helper: recompute every (unlocked) payroll row for one employee &
// month directly from its AttendanceSummary. Called automatically whenever the
// monthly attendance summary is edited, so payroll/dashboard/reports reflect
// attendance changes WITHOUT a manual "recalculate"/"push" step (Changes #24/#25).
// Locked payroll is left untouched (only an explicit Super-Admin recalc may
// change a locked month). Best-effort: returns count, never throws to the caller
// who should not have their attendance edit fail because of payroll.
async function recalcForEmployeeMonth(employeeId, month, year) {
  const eid = Number(employeeId);
  const records = await prisma.payroll.findMany({
    where: { employeeId: eid, month, year },
    include: { employee: true, company: true },
  });
  if (!records.length) return 0;
  const summary = await prisma.attendanceSummary.findUnique({
    where: { employeeId_month_year: { employeeId: eid, month, year } },
  });
  let n = 0;
  for (const p of records) {
    if (p.payrollStatus === 'locked') continue;
    await recalcOne(p, summary, p.employee, p.company);
    n++;
  }
  return n;
}
exports.recalcForEmployeeMonth = recalcForEmployeeMonth;
// Exported so one-off data-repair scripts can drive THE engine itself rather than
// reimplementing its arithmetic (which is how the two diverged in the first place).
exports.recalcOne = recalcOne;

// POST /api/payroll/recalculate  { ids?, month?, year?, companyId? }
// Re-syncs payroll from AttendanceSummary. Without ids, recalculates every
// outdated record in scope. Locked records are skipped unless Super Admin.
exports.recalculate = async (req, res) => {
  try {
    const isSuper = req.user?.role === 'Super Admin';
    // Company Head has override authority over locked payroll (corrections);
    // Super Admin too. HR cannot recalc locked records.
    const canOverrideLock = isSuper || req.user?.role === 'Company Head';
    // Same normalisation as generate: these ids go into `{ in: [...] }` alongside
    // an OR clause, and a mixed number/string array (or one containing NaN/null)
    // is rejected outright by Prisma.
    const ids = Array.isArray(req.body.ids) ? toPositiveIntList(req.body.ids).ids : null;
    if (Array.isArray(req.body.ids) && req.body.ids.length > 0 && ids.length === 0) {
      return res.status(400).json({ error: 'No valid payroll record ids were supplied.', code: 'NO_VALID_IDS' });
    }

    let where;
    if (ids && ids.length) {
      where = { id: { in: ids } };
      // A list of ids is NOT a permission. Without this clause any payroll:edit
      // user could recalculate — that is, OVERWRITE — another company's payroll
      // rows simply by naming their ids. Same scope rule as the branch below.
      if (!isSuper) {
        const allowed = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
        where.OR = [
          { companyId: { in: allowed } },
          { employee: { branchId: { in: allowed } } },
          { employee: { companyId: { in: allowed } } },
        ];
      }
    } else {
      where = { isOutdated: true };
      if (req.body.month) where.month = req.body.month;
      if (req.body.year) where.year = Number(req.body.year);
      if (!isSuper) {
        const allowed = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
        where.OR = [{ companyId: { in: allowed } }, { employee: { branchId: { in: allowed } } }];
      } else if (wasSupplied(req.body.companyId)) {
        // Number('abc') is NaN, which Prisma rejects — validate instead of relaying it.
        const cid = toPositiveInt(req.body.companyId);
        if (cid === undefined) {
          return res.status(400).json({ error: 'companyId must be a positive whole number.', code: 'INVALID_COMPANY_ID' });
        }
        where.companyId = cid;
      }
    }

    const records = await prisma.payroll.findMany({ where, include: { employee: true, company: true } });
    const pad = (x) => String(x).padStart(2, '0');
    let recalculated = 0, skippedLocked = 0;
    for (const p of records) {
      if (p.payrollStatus === 'locked' && !canOverrideLock) { skippedLocked++; continue; }
      // Rebuild the monthly AttendanceSummary from the raw Attendance module rows
      // so a recalc reflects current verified attendance even if the summary was
      // never generated or is stale — BUT only when raw daily rows actually exist
      // for the month. Recomputing a month with no imported attendance would zero
      // out an existing (possibly seeded/manual) summary, so we skip that case.
      const mi = attendanceSummaryService.monthIndex(p.month);
      const last = new Date(p.year, mi + 1, 0).getDate();
      const rawCount = await prisma.attendance.count({
        where: { employeeId: p.employeeId, date: { gte: `${p.year}-${pad(mi + 1)}-01`, lte: `${p.year}-${pad(mi + 1)}-${pad(last)}` } },
      }).catch(() => 0);
      let summary = null;
      if (rawCount > 0) {
        // recompute() preserves a locked month (returns it unchanged).
        summary = await attendanceSummaryService.recompute(p.employeeId, p.month, p.year).catch(() => null);
      }
      if (!summary) {
        summary = await prisma.attendanceSummary.findUnique({
          where: { employeeId_month_year: { employeeId: p.employeeId, month: p.month, year: p.year } },
        });
      }
      // Snapshot the pre-recalc figures for the audit trail.
      const before = { netSalary: p.netSalary, payableDays: p.payableDays, presentDays: p.presentDays };
      const updated = await recalcOne(p, summary, p.employee, p.company);
      recalculated++;

      // ── Audit every recalculation: who/when + old→new salary + attendance diff,
      // scoped to the employee's company/branch. Best-effort — never fails recalc.
      if (req.user?.id) {
        await prisma.auditLog.create({
          data: {
            userId: req.user.id, action: 'RECALCULATE_PAYROLL', module: 'Payroll', targetId: String(p.id),
            details: JSON.stringify({
              employee: p.employeeName, month: p.month, year: p.year,
              companyId: p.companyId, branchId: p.employee?.branchId ?? null,
              oldSalary: before.netSalary, newSalary: updated?.netSalary ?? before.netSalary,
              attendance: {
                payableDays: { from: before.payableDays, to: updated?.payableDays ?? before.payableDays },
                presentDays: { from: before.presentDays, to: updated?.presentDays ?? before.presentDays },
              },
              by: req.user?.name || req.user?.email || `user#${req.user.id}`,
            }).slice(0, 1500),
          },
        }).catch(() => {});
      }
    }
    res.json({ recalculated, skippedLocked });
  } catch (error) {
    console.error('Error recalculating payroll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { month } = req.query;
    const companyId = require('../utils/idParam')(req.query.companyId || req.headers['x-workspace-id']);
    let whereClause = {};

    // ── Authorisation ────────────────────────────────────────────────────────
    // A caller-supplied workspace is only honoured if the caller may actually
    // enter it. This check previously existed but had an EMPTY body, and the
    // scoped clause below it was then overwritten unconditionally — so any
    // authenticated user could read any company's payroll by naming its id in
    // `?companyId=` or `x-workspace-id`. Every other module refuses this; payroll
    // now refuses it the same way, through the branch-aware shared helper.
    if (companyId != null && !isSuperAdmin(req) && !canEnterWorkspace(req, companyId)) {
      return res.status(403).json({ error: 'You are not authorised to view payroll for this workspace.' });
    }

    const scopeFor = (ids) => ({
      OR: [
        { companyId: { in: ids } },
        { employee: { branchId: { in: ids } } },
        { employee: { companyId: { in: ids } } },
      ],
    });

    if (companyId != null) {
      // Authorised above. Narrow to the one workspace, matching it as a company
      // id or as a branch id — the two share a sequence.
      whereClause = scopeFor([companyId]);
    } else if (req.user && !isSuperAdmin(req)) {
      // No workspace named → everything the caller can reach.
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      whereClause = scopeFor(allowedIds);
    }

    // NOTE: this handler deliberately performs NO writes.
    //
    // It used to call syncPayrollForEmployees(companyId, month || 'June', 2026),
    // which ends in prisma.payroll.create() — so a GET created payroll records,
    // for a period taken verbatim from the query string. `?month=Zzzz` minted a
    // whole payroll cycle named "Zzzz", and `payroll:view` (a read-only grant)
    // was effectively a write permission. Draft creation belongs to the explicit
    // POST /api/payroll/generate, which is permissioned `payroll:create`.

    // Pagination & Filters
    const { page, limit, search, department, status, branch } = req.query;

    // Cycle scope: a payroll cycle is month + year. Filter the SELECT by both when
    // supplied so a caller asking for "July" never receives July of every year on
    // record (which double-counted the roster: 64 employees appeared as 113). The
    // global (month-less) load is unchanged — it still returns the full history.
    if (month) whereClause.month = month;
    if (req.query.year) whereClause.year = Number(req.query.year);

    if (search) {
      whereClause.AND = whereClause.AND || [];
      whereClause.AND.push({
        employee: {
          OR: [
            { name: { contains: search } },
            { employeeId: { contains: search } }
          ]
        }
      });
    }

    if (department) {
      whereClause.AND = whereClause.AND || [];
      whereClause.AND.push({
        employee: {
          OR: [
            { department: department },
            { designation: department }
          ]
        }
      });
    }

    // The payroll table has no `status` column — it has payrollStatus and
    // paymentStatus. Filtering on `status` made Prisma throw, so `?status=` was a
    // 500 rather than a filter.
    if (status) {
      whereClause.payrollStatus = status;
    }

    if (branch) {
      whereClause.AND = whereClause.AND || [];
      whereClause.AND.push({
        employee: { branchLocation: branch }
      });
    }

    // `?employeeId=` was accepted and silently discarded — a request for one
    // employee's payslips returned all 3,342 rows in the workspace. ANDed onto
    // the tenant scope, so naming a foreign employee returns nothing.
    const employeeFilter = idParam(req.query.employeeId);
    if (employeeFilter) {
      whereClause.AND = whereClause.AND || [];
      whereClause.AND.push({ employeeId: employeeFilter });
    }

    if (page && limit) {
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;

      const [data, total] = await Promise.all([
        prisma.payroll.findMany({
          where: whereClause,
          include: { employee: { select: PAYROLL_EMPLOYEE_FIELDS } },
          skip,
          take: limitNum,
          orderBy: { employeeId: 'asc' }
        }),
        prisma.payroll.count({ where: whereClause })
      ]);

      return res.json({
        data,
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      });
    }

    const data = await prisma.payroll.findMany({
      where: whereClause,
      include: { employee: { select: PAYROLL_EMPLOYEE_FIELDS } },
      orderBy: { employeeId: 'asc' }
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.generate = async (req, res) => {
  try {
    const { month, year, role, employeeIds } = req.body;

    // ── Ids: normalise BEFORE they reach Prisma ──────────────────────────────
    // companyId/branchId arrive over JSON and the client types activeCompanyId
    // as a string, so they land here as e.g. "1". Employee.companyId is `Int` and
    // Employee.branchId is `Int?` (plain scalar FK columns — the `company` /
    // `branch` relations are separate fields, so a scalar filter is correct).
    // Prisma coerces a numeric string at the TOP level of a where, but NOT inside
    // an OR/AND block — and the company path below builds an OR. That mismatch is
    // what made "generate by company" throw a PrismaClientValidationError while
    // "generate by branch" (a top-level filter) quietly worked.
    const companyId = toPositiveInt(req.body.companyId);
    const branchId = toPositiveInt(req.body.branchId);

    // A value that was SENT but is not a usable id is a caller error. Answer with
    // a clear 400 rather than letting Prisma raise a raw validation error — or,
    // worse, dropping the filter and generating payroll for a wider scope.
    if (wasSupplied(req.body.companyId) && companyId === undefined) {
      return res.status(400).json({ error: 'companyId must be a positive whole number.', code: 'INVALID_COMPANY_ID' });
    }
    if (wasSupplied(req.body.branchId) && branchId === undefined) {
      return res.status(400).json({ error: 'branchId must be a positive whole number.', code: 'INVALID_BRANCH_ID' });
    }

    if ((!companyId && !branchId) || !month || !year) {
      return res.status(400).json({ error: 'Missing required parameters.' });
    }

    const isBranch = !!branchId && role !== 'Company Head';

    // ── Branch-only generation ───────────────────────────────────────────────
    // BranchPayroll.companyId is a REQUIRED column, so creating a brand-new
    // branch period without a companyId used to fail inside Prisma with
    // "Argument `companyId` is missing" — but only for the FIRST run of a period
    // (a re-run took the upsert's `update` path, which needs no companyId), which
    // is why it stayed hidden. The branch already knows which company it belongs
    // to, so resolve it from the Branch row instead of demanding it from the
    // caller. An explicitly supplied companyId still wins.
    let periodCompanyId = companyId;
    if (isBranch && periodCompanyId === undefined) {
      const branchRow = await prisma.branch.findUnique({ where: { id: branchId }, select: { companyId: true } });
      if (!branchRow) {
        return res.status(404).json({ error: 'Branch not found.', code: 'BRANCH_NOT_FOUND' });
      }
      periodCompanyId = branchRow.companyId;
    }

    // ── The workspace id may be a BRANCH id ──────────────────────────────────
    // Company.id and Branch.id share ONE sequence, and the workspace switcher
    // hands non-Super-Admins a branch — so `companyId` here is routinely a branch
    // id (e.g. OMNIEX is company 18, its Head Office is branch 19, and the client
    // sends 19). The employee filter below already copes with that via
    // `{ branchId: companyId }`, but CompanyPayroll.companyId is a FOREIGN KEY to
    // Company, so a branch id there fails with
    //   "Foreign key constraint violated: `companyId`".
    // Resolve it to the owning company. The payroll rows themselves are already
    // keyed on each employee's real companyId, so this makes the period row agree
    // with its own children instead of pointing at a company that cannot exist.
    if (periodCompanyId !== undefined) {
      const asCompany = await prisma.company.findUnique({ where: { id: periodCompanyId }, select: { id: true } });
      if (!asCompany) {
        const asBranch = await prisma.branch.findUnique({ where: { id: periodCompanyId }, select: { companyId: true } });
        if (!asBranch) {
          return res.status(404).json({ error: 'Workspace not found.', code: 'WORKSPACE_NOT_FOUND' });
        }
        periodCompanyId = asBranch.companyId;
      }
    }

    // Selective generation: when employeeIds is provided, generate ONLY for those
    // employees (still scoped to the workspace below). No employeeIds = every
    // active employee in the workspace (the original bulk behaviour). We no longer
    // hard-block when a period already exists — generate now find-or-creates the
    // period record and APPENDS, so payroll can be run for a few employees now and
    // more later without a 409.

    // Fetch scoped employees.
    // ── Offboarding eligibility ───────────────────────────────────────────────
    // An employee is payable for a month they were employed in for even one day,
    // so a leaver still appears in their EXIT month (prorated to the exit date by
    // the attendance summary) and disappears from the month after. The rule lives
    // in utils/employmentWindow so the roster and the salary maths agree.
    // Scope (company/branch) and eligibility each contain an OR, so they are
    // combined under AND — a bare second `OR` key would overwrite the first.
    const employeeWhere = { AND: [payrollEligibilityWhere(month, year)] };
    if (isBranch) {
      employeeWhere.branchId = branchId;
    } else {
      employeeWhere.AND.push({
        OR: [
          { companyId: companyId },
          { branchId: companyId } // fallback in case branch is passed as companyId
        ],
      });
    }
    // Both ids are numbers by construction above, so this OR can no longer throw.
    // ── Selective generation ─────────────────────────────────────────────────
    // Omitting employeeIds means "every employee in the workspace" (bulk mode).
    // SUPPLYING it means "only these" — so an empty or all-invalid list must not
    // fall through to bulk mode: that would silently generate payroll for the
    // whole company when the caller asked for nobody. It must not reach Prisma as
    // `id: { in: [] }` either — that returns zero rows and surfaces as the
    // misleading "No active employees found".
    if (employeeIds !== undefined && employeeIds !== null) {
      if (!Array.isArray(employeeIds)) {
        return res.status(400).json({ error: 'employeeIds must be an array of employee ids.', code: 'INVALID_EMPLOYEE_IDS' });
      }
      const { ids, rejected } = toPositiveIntList(employeeIds);
      // A dropped id is an employee that was asked for and will NOT be paid, so
      // it is never silently swallowed.
      if (rejected.length && process.env.NODE_ENV !== 'production') {
        console.warn('[payroll.generate] ignoring %d invalid employee id(s): %j', rejected.length, rejected.slice(0, 20));
      }
      if (ids.length === 0) {
        return res.status(400).json({
          error: 'No valid employees were selected for payroll generation.',
          code: 'NO_VALID_EMPLOYEE_IDS',
        });
      }
      employeeWhere.id = { in: ids };
    }

    const employeesRaw = await prisma.employee.findMany({
      where: employeeWhere
    });

    const companyIds = [...new Set(employeesRaw.map(e => e.companyId).filter(Boolean))];
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } }
    });
    const companyMap = {};
    for (const c of companies) companyMap[c.id] = c;

    const employees = employeesRaw.map(e => ({
      ...e,
      company: companyMap[e.companyId] || null
    }));

    if (employees.length === 0) {
      return res.status(400).json({ error: 'No active employees found to generate payroll for.' });
    }


    // ── Wallet Gate (validate + charge, FAIL-CLOSED) ──────────────────────────
    // The wallet is validated and charged BEFORE any payroll row is written, so
    // an insufficient balance can never leave generated records behind. Delta
    // billing: only employees in THIS generation scope never billed for the
    // period are charged (atomic, idempotent per employee+period) — regenerating
    // already-billed employees is ₹0 and passes even on a ₹0 wallet. A
    // wallet-check failure BLOCKS generation: the gate is mandatory, not
    // advisory.
    if (periodCompanyId) {
      const { chargePayrollWallet, insufficientPayload } = require('../services/payrollWalletGuard');
      try {
        const charge = await chargePayrollWallet({
          companyId: periodCompanyId,
          month,
          year,
          employeeIds: employees.map((e) => e.id),
          createdBy: req.user?.name || 'System',
        });
        if (charge.charged) {
          await prisma.auditLog.create({
            data: {
              action: 'WALLET_DEDUCTION',
              module: 'Wallet',
              targetId: charge.assessment.reference,
              details: `Deducted ₹${charge.amount} for ${charge.billedEmployees} new employee(s) — Payroll Generation (${month} ${year}).`,
              userId: req.user?.id || 1,
            },
          }).catch((e) => console.error('[payroll.generate] wallet audit log failed:', e.message));
        }
      } catch (walletErr) {
        if (walletErr.code === 'INSUFFICIENT_WALLET_BALANCE') {
          return res.status(402).json(insufficientPayload(walletErr.assessment));
        }
        console.error('[payroll.generate] wallet gate failed — generation blocked:', walletErr.message);
        return res.status(503).json({
          success: false,
          code: 'WALLET_CHECK_FAILED',
          error: 'Wallet verification service is temporarily unavailable. Payroll generation was blocked — no records were created.',
          detail: walletErr.message,
        });
      }
    }

    let totalAmount = 0;

    const payrollRecordsToCreate = [];

    for (const emp of employees) {
      const basicPercent = emp.company?.basicPercent || 50;
      const basicSalary = emp.salary;
      const hra = Math.round(basicSalary * 0.4);
      const special = Math.round(basicSalary * 0.1);
      const allowances = hra + special;
      
      const pfRate = emp.company?.pfRate || 12;
      const esicRate = emp.company?.esicRate || 0.75;
      const profTax = emp.company?.profTaxRate || 200;
      
      const pfDeduction = Math.round(basicSalary * (pfRate / 100));
      const esicDeduction = Math.round(basicSalary * (esicRate / 100));
      const deductions = pfDeduction + esicDeduction + profTax;
      // Recurring bonus from the employee's config (one-time bonuses are applied
      // separately and picked up on the next recalc). Net includes the bonus.
      const bonus = recurringBonusFor(emp, month, year);
      const netSalary = Math.max(0, (basicSalary + allowances + bonus) - deductions);

      totalAmount += netSalary;

      payrollRecordsToCreate.push({
        companyId: emp.companyId,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        month,
        year,
        basicSalary,
        allowances,
        deductions,
        netSalary,
        bonus,
        overtime: 0,
        // Reset loan portion; the loan hook re-adds this month's EMI after upsert.
        loanDeduction: 0,
        // Workflow: generate → Pending Approval (NOT paid). Approval and payment
        // are separate explicit stages (approve, then mark-paid).
        payrollStatus: 'pending_approval',
        paymentStatus: 'pending',
        payslipGenerated: false,
        paymentDate: new Date().toISOString()
      });
    }

    // Find-or-create the period's parent payroll record so SELECTIVE generation
    // can APPEND employees to an existing period instead of being blocked.
    let result;

    if (isBranch) {
      result = await prisma.branchPayroll.upsert({
        where: { branchId_payrollMonth_payrollYear: { branchId, payrollMonth: month, payrollYear: year } },
        update: { generatedBy: req.user?.name || 'System' },
        create: {
          branchId,
          companyId: periodCompanyId, // resolved from the branch when not supplied
          payrollMonth: month,
          payrollYear: year,
          totalEmployees: 0,
          processedEmployees: 0,
          pendingEmployees: 0,
          totalAmount: 0,
          status: 'Pending',
          generatedBy: req.user?.name || 'System'
        }
      });
      payrollRecordsToCreate.forEach(record => { record.branchPayrollId = String(result.id); });
    } else {
      result = await prisma.companyPayroll.upsert({
        // periodCompanyId, not the raw workspace id — the latter may be a branch.
        where: { companyId_payrollMonth_payrollYear: { companyId: periodCompanyId, payrollMonth: month, payrollYear: year } },
        update: { generatedBy: req.user?.name || 'System' },
        create: {
          companyId: periodCompanyId,
          payrollMonth: month,
          payrollYear: year,
          totalEmployees: 0,
          processedEmployees: 0,
          pendingEmployees: 0,
          totalAmount: 0,
          status: 'Pending',
          generatedBy: req.user?.name || 'System'
        }
      });
      payrollRecordsToCreate.forEach(record => { record.companyPayrollId = String(result.id); });
    }

    // Upsert employee payroll records (idempotent — re-generating updates).
    // A LOCKED row is finalized payroll: re-generating must never quietly revert
    // it to pending_approval / unpaid and clear the lock. Every other mutation
    // path already honours the lock, so generate does too — locked rows are
    // skipped and reported back to the caller.
    const lockedRows = await prisma.payroll.findMany({
      where: {
        payrollStatus: 'locked',
        month, year,
        employeeId: { in: [...new Set(payrollRecordsToCreate.map(r => r.employeeId))] },
      },
      select: { employeeId: true, companyId: true },
    });
    const lockedKeys = new Set(lockedRows.map(r => `${r.employeeId}:${r.companyId}`));
    const lockedEmployeeIds = new Set(lockedRows.map(r => r.employeeId));
    let skippedLockedRows = 0;
    for (const record of payrollRecordsToCreate) {
      if (lockedKeys.has(`${record.employeeId}:${record.companyId}`)) { skippedLockedRows++; continue; }
      const row = await prisma.payroll.upsert({
        where: {
          employeeId_month_year_companyId: {
            employeeId: record.employeeId,
            month: record.month,
            year: record.year,
            companyId: record.companyId
          }
        },
        update: record,
        create: record
      });
      // Auto-deduct any active loan EMI + settle the ledger (idempotent).
      await applyLoanToPayrollRow(prisma, row, req.user?.name || 'Payroll Engine');
    }

    // ── SINGLE ENGINE: prorate every generated row from its attendance snapshot ──
    // The inline seed above only establishes the rows; the ONE payroll engine
    // (recalcOne, via recalcForEmployeeMonth) immediately recomputes salary from
    // the synchronized AttendanceSummary — gross = dailyRate × payableDays — so a
    // generated payslip can NEVER show the full monthly salary when attendance is
    // short. Attendance is recomputed (not marked synced — only the Attendance
    // Synchronization page stamps syncedAt) so figures reflect the latest data.
    const attSvcGen = require('../services/attendanceSummaryService');
    const uniqEmpIds = [...new Set(payrollRecordsToCreate.map(r => r.employeeId))];
    // A recalc failure used to be swallowed by `.catch(console.error)`, so the
    // request still returned 201 "Payroll generated" while the row kept the raw
    // inline SEED values — un-prorated, workingDays/payableDays = 0. Those rows
    // are indistinguishable from real payroll in the UI and can be approved,
    // locked and PAID (verified: 1,975 such rows exist, 800 of them already
    // paid). Failures are now counted and reported back to the caller.
    const recalcFailures = [];
    for (const eid of uniqEmpIds) {
      if (lockedEmployeeIds.has(eid)) continue; // never recompute a locked month
      try {
        await attSvcGen.recompute(eid, month, year);
        await recalcForEmployeeMonth(eid, month, year);
      } catch (e) {
        console.error(`[generate] recalc FAILED for employee ${eid} (${month} ${year}):`, e.message);
        recalcFailures.push({ employeeId: eid, error: e.message });
      }
    }
    // Belt and braces: a row that still has no proration snapshot did not go
    // through the engine, whatever the try/catch saw. Surface it rather than
    // letting an un-prorated seed row pass as generated payroll.
    const unProrated = await prisma.payroll.count({
      where: {
        month, year,
        employeeId: { in: uniqEmpIds },
        workingDays: 0,
      },
    });

    // Recompute the period's totals from ALL its child rows so appends keep the
    // summary accurate.
    const linkWhere = isBranch ? { branchPayrollId: String(result.id) } : { companyPayrollId: String(result.id) };
    const childRows = await prisma.payroll.findMany({ where: linkWhere });
    const sumAmount = childRows.reduce((s, r) => s + (r.netSalary || 0), 0);
    const paidCount = childRows.filter(r => String(r.paymentStatus).toLowerCase() === 'paid').length;
    const parentUpdate = {
      totalEmployees: childRows.length,
      processedEmployees: paidCount,
      pendingEmployees: childRows.length - paidCount,
      totalAmount: sumAmount,
    };
    if (isBranch) {
      await prisma.branchPayroll.update({ where: { id: result.id }, data: parentUpdate });
    } else {
      await prisma.companyPayroll.update({ where: { id: result.id }, data: parentUpdate });
    }

    const generatedCount = payrollRecordsToCreate.length - skippedLockedRows;
    const parts = [`Payroll generated for ${generatedCount} employee(s).`];
    if (skippedLockedRows) parts.push(`${skippedLockedRows} locked record(s) were left unchanged.`);
    if (recalcFailures.length) {
      parts.push(
        `${recalcFailures.length} record(s) could NOT be prorated from attendance and are NOT ready to approve — ` +
        'synchronize attendance and regenerate before paying them.'
      );
    } else if (unProrated > 0) {
      parts.push(
        `${unProrated} record(s) have no attendance snapshot (0 working days) — ` +
        'synchronize attendance and regenerate before approving or paying them.'
      );
    }

    res.status(201).json({
      message: parts.join(' '),
      data: result,
      count: generatedCount,
      skippedLocked: skippedLockedRows,
      // Non-zero means the rows exist but are NOT trustworthy payroll yet.
      recalcFailed: recalcFailures.length,
      recalcFailures: recalcFailures.slice(0, 20),
      unProratedRows: unProrated,
    });
  } catch (error) {
    console.error('Error generating payroll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// ── Bonus inside payroll ─────────────────────────────────────────────────────
// Recompute a payroll row's bonus (recurring + one-time) and net salary in place,
// preserving the already-computed basic/allowances/deductions. Locked rows skip.
async function syncBonusOnPayroll(employeeId, month, year) {
  const rows = await prisma.payroll.findMany({
    where: { employeeId: Number(employeeId), month, year },
    include: { employee: true },
  });
  for (const p of rows) {
    if (p.payrollStatus === 'locked') continue;
    const { total: bonus } = await bonusForPayroll(prisma, p.employee, month, year);
    const netSalary = Math.max(0, (p.basicSalary + p.allowances + bonus) - p.deductions);
    await prisma.payroll.update({ where: { id: p.id }, data: { bonus, netSalary } });
  }
}

// POST /api/payroll/apply-bonus
// Body: { companyId, month, year, scope: 'selected'|'department'|'company',
//         employeeIds?, department?, bonusType, calcMethod, amount?, percent?, reason? }
// Creates a one-time bonus per targeted employee and folds it into payroll.
exports.applyBonus = async (req, res) => {
  try {
    const { companyId, month, year, scope, employeeIds, department,
            bonusType, calcMethod, amount, percent, reason } = req.body;
    if (!companyId || !month || !year || !bonusType) {
      return res.status(400).json({ error: 'companyId, month, year and bonusType are required.' });
    }

    // Resolve target employees by scope.
    const where = { status: { notIn: OFFBOARDED_STATUSES }, OR: [{ companyId: Number(companyId) }, { branchId: Number(companyId) }] };
    if (scope === 'selected') {
      const ids = (Array.isArray(employeeIds) ? employeeIds : []).map(Number).filter(Boolean);
      if (!ids.length) return res.status(400).json({ error: 'No employees selected.' });
      where.id = { in: ids };
    } else if (scope === 'department') {
      if (!department) return res.status(400).json({ error: 'department is required for department scope.' });
      where.department = department;
    }
    const employees = await prisma.employee.findMany({ where });
    if (!employees.length) return res.status(400).json({ error: 'No matching employees found.' });

    const isPercent = String(calcMethod || '').toLowerCase().includes('percent');
    const created = [];
    for (const emp of employees) {
      const resolved = isPercent ? Math.round((Number(emp.salary) || 0) * (Number(percent) || 0) / 100) : Math.round(Number(amount) || 0);
      if (resolved <= 0) continue;
      const row = await prisma.employeeBonus.create({
        data: {
          companyId: emp.companyId, employeeId: emp.id, source: 'payroll',
          bonusType, calcMethod: calcMethod || 'Fixed Amount',
          amount: resolved, percent: isPercent ? Number(percent) : null,
          reason: reason || null, status: 'Active',
          payrollMonth: String(month), payrollYear: Number(year),
          approvedBy: req.user?.id || null, approvedByName: req.user?.name || null,
          approvalDate: new Date(),
          createdBy: req.user?.id || null, createdByName: req.user?.name || null,
        },
      });
      created.push(row);
      await syncBonusOnPayroll(emp.id, month, year);
    }

    res.status(201).json({ message: `Bonus applied to ${created.length} employee(s).`, count: created.length });
  } catch (error) {
    console.error('Error applying bonus', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// POST /api/payroll/remove-bonus  { employeeId, month, year }
// Cancels one-time bonuses for the employee/month and recomputes net.
exports.removeBonus = async (req, res) => {
  try {
    const { employeeId, month, year } = req.body;
    if (!employeeId || !month || !year) {
      return res.status(400).json({ error: 'employeeId, month and year are required.' });
    }
    await prisma.employeeBonus.updateMany({
      where: { employeeId: Number(employeeId), payrollMonth: String(month), payrollYear: Number(year), status: 'Active' },
      data: { status: 'Cancelled' },
    });
    await syncBonusOnPayroll(employeeId, month, year);
    res.json({ message: 'Bonus removed from payroll.' });
  } catch (error) {
    console.error('Error removing bonus', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const { employeeId, month, year, companyId } = req.body;

    // Validation
    if (!employeeId || !month || !year || !companyId) {
      return res.status(400).json({ error: 'Missing required payroll fields: employeeId, month, year, companyId' });
    }

    // Wallet gate — creating a payroll row IS generation, so the single-record
    // path passes the same mandatory gate as bulk generate. Delta billing:
    // ONLY this employee is assessed — already billed for the period (or an
    // existing payroll row) means ₹0 and the create passes.
    {
      const { chargePayrollWallet, insufficientPayload } = require('../services/payrollWalletGuard');
      try {
        await chargePayrollWallet({
          companyId,
          month,
          year,
          employeeIds: [Number(employeeId)],
          createdBy: req.user?.name || 'System',
        });
      } catch (walletErr) {
        if (walletErr.code === 'INSUFFICIENT_WALLET_BALANCE') {
          return res.status(402).json(insufficientPayload(walletErr.assessment));
        }
        console.error('[payroll.create] wallet gate failed — create blocked:', walletErr.message);
        return res.status(503).json({
          success: false,
          code: 'WALLET_CHECK_FAILED',
          error: 'Wallet verification service is temporarily unavailable. Payroll creation was blocked — no record was created.',
          detail: walletErr.message,
        });
      }
    }

    const payload = { ...req.body };
    delete payload.status;
    delete payload.salary;
    delete payload.employee;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.designation;
    delete payload.id;
    // The client generator sends OT as overtimeAmount/overtimeHours, which are NOT
    // columns on Payroll (OT is already folded into `allowances`). Map the hours
    // onto the real `otHours` column and drop the unknown fields so the upsert
    // doesn't fail with "Unknown argument overtimeAmount".
    if (payload.overtimeHours != null && payload.otHours == null) {
      payload.otHours = Number(payload.overtimeHours) || 0;
    }
    delete payload.overtimeHours;
    delete payload.overtimeAmount;

    // Enforce financial invariants (net ≥ 0, no negative amounts) before persisting.
    sanitizePayrollMoney(payload);

    // Prevent duplicates by upserting based on unique constraint
    const data = await prisma.payroll.upsert({
      where: {
        employeeId_month_year_companyId: {
          employeeId,
          month,
          year,
          companyId
        }
      },
      update: payload,
      create: payload
    });
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    // Log the identity of the edit, not its contents — the body is a full salary
    // payload (basic, allowances, deductions, net) and was being written to the
    // server log verbatim on every payroll edit.
    console.log(`[payroll:update] id=${id} by=${req.user?.id ?? '?'} fields=${Object.keys(req.body || {}).join(',')}`);
    const payload = { ...req.body };
    delete payload.status;
    delete payload.salary;
    delete payload.employee;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.designation;
    delete payload.id;
    // `reason` is metadata for the revision log, not a Payroll column.
    const reason = (payload.reason || '').toString();
    delete payload.reason;

    const existingRecord = await prisma.payroll.findUnique({
      where: { id: idParam(id) }
    });

    if (!existingRecord) {
      return res.status(404).json({ error: 'Payroll record not found.' });
    }

    // Tenant guard — the row was fetched by id alone, so confirm it belongs to a
    // company this caller can reach before any edit is applied.
    if (!canEnterWorkspace(req, existingRecord.companyId)) {
      return res.status(403).json({ error: 'You do not have access to this payroll record.' });
    }

    // A LOCKED payroll may only be edited by a Company Head (override authority)
    // or a Super Admin. HR must never edit a locked record.
    if (existingRecord.payrollStatus === 'locked') {
      const role = req.user?.role;
      if (role !== 'Super Admin' && role !== 'Company Head') {
        return res.status(403).json({ error: 'This payroll is locked. Only a Company Head can edit a locked payroll.' });
      }
    }

    if (payload.paymentStatus === 'paid' && existingRecord.paymentStatus === 'paid') {
      return res.status(400).json({ error: 'Payroll already paid.' });
    }

    // ── Revision history (replaces the old hard "lock") ──────────────────────
    // Authorized users may edit payroll at any stage; every amount change is
    // captured as a traceable revision: original → modified, by whom, when, why.
    const REVISION_FIELDS = ['basicSalary', 'allowances', 'deductions', 'netSalary', 'bonus', 'tax'];
    const changes = [];
    for (const f of REVISION_FIELDS) {
      if (payload[f] !== undefined && Number(payload[f]) !== Number(existingRecord[f] ?? 0)) {
        changes.push({ field: f, original: Number(existingRecord[f] ?? 0), modified: Number(payload[f]) });
      }
    }

    // Enforce financial invariants (net ≥ 0, no negative amounts) before persisting.
    sanitizePayrollMoney(payload, existingRecord);

    const data = await prisma.payroll.update({
      where: { id: idParam(id) },
      data: payload
    });

    if (changes.length && req.user?.id) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'REVISE_PAYROLL',
          module: 'Payroll',
          targetId: String(existingRecord.id),
          details: JSON.stringify({
            employee: existingRecord.employeeName,
            by: req.user.name || req.user.email,
            reason: reason || '(no reason given)',
            changes,
          }).slice(0, 1500),
        },
      }).catch(() => {});
    }

    // If marked as paid, update the master tables
    if (payload.paymentStatus === 'paid' && existingRecord.paymentStatus !== 'paid') {
      if (existingRecord.companyPayrollId) {
        await prisma.companyPayroll.update({
          where: { id: existingRecord.companyPayrollId },
          data: {
            processedEmployees: { increment: 1 },
            pendingEmployees: { decrement: 1 }
          }
        });
      }
      
      if (existingRecord.branchPayrollId) {
        await prisma.branchPayroll.update({
          where: { id: existingRecord.branchPayrollId },
          data: {
            processedEmployees: { increment: 1 },
            pendingEmployees: { decrement: 1 }
          }
        });
      }
    }

    res.json(data);
  } catch (error) {
    console.error('Error updating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    // Tenant guard: deleteMany + the caller's company scope, so a payroll row
    // belonging to another tenant is simply not matched (count 0 → 404) instead
    // of being destroyed by id alone.
    const result = await prisma.payroll.deleteMany({
      where: { id: idParam(id), ...payrollTenantWhere(req) },
    });
    if (result.count === 0) return res.status(404).json({ error: 'Payroll record not found.' });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// PATCH /api/payroll/:id/slip-event  { event: 'generated'|'downloaded'|'emailed', fileName? }
// Stamps the relevant payslip-lifecycle timestamp (audit history).
exports.slipEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { event, fileName } = req.body;
    const now = new Date();
    const data = {};
    if (fileName) data.payslipFileName = fileName;
    if (event === 'generated') { data.generatedAt = now; data.payslipGenerated = true; }
    else if (event === 'downloaded') { data.downloadedAt = now; data.downloadCount = { increment: 1 }; }
    else if (event === 'emailed') { data.emailSentAt = now; }
    else return res.status(400).json({ error: 'Unknown slip event.' });
    const updated = await prisma.payroll.update({ where: { id: idParam(id) }, data });
    res.json(updated);
  } catch (error) {
    console.error('Error stamping slip event', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// POST /api/payroll/approve  { ids: string[] }  → approve payroll record(s)
exports.approve = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : (req.params.id ? [req.params.id] : []);
    if (!ids.length) return res.status(400).json({ error: 'No payroll ids provided.' });
    const approvedBy = req.user?.name || req.user?.email || 'Admin';
    const result = await prisma.payroll.updateMany({
      where: { id: { in: ids }, ...payrollTenantWhere(req) },
      data: { payrollStatus: 'approved', approvedAt: new Date(), approvedBy },
    });
    res.json({ approved: result.count });
  } catch (error) {
    console.error('Error approving payroll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// POST /api/payroll/mark-paid  { ids: string[] }  → mark record(s) paid
exports.markPaid = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'No payroll ids provided.' });
    const paidBy = req.user?.name || req.user?.email || 'Admin';
    const result = await prisma.payroll.updateMany({
      where: { id: { in: ids }, ...payrollTenantWhere(req) },
      data: { paymentStatus: 'paid', payrollStatus: 'paid', paymentDate: new Date().toISOString(), paymentMethod: 'Bank Transfer', paidBy },
    });
    res.json({ paid: result.count });
  } catch (error) {
    console.error('Error marking paid', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// Lock/unlock the AttendanceSummary rows matching a set of payroll records.
// `db` is either the prisma client or a transaction client, so callers can run
// the payroll flip and the attendance flip as one atomic unit.
async function setSummaryLock(db, payrollIds, locked) {
  const rows = await db.payroll.findMany({
    where: { id: { in: payrollIds } },
    select: { employeeId: true, month: true, year: true },
  });
  for (const r of rows) {
    await db.attendanceSummary.updateMany({
      where: { employeeId: r.employeeId, month: r.month, year: r.year },
      data: { locked },
    });
  }
}

// POST /api/payroll/lock  { ids, reason? }  → lock ONLY fully-paid record(s)
// Business rule: payroll is NEVER auto-locked and can only be locked once it is
// fully Paid. Unpaid records are rejected/skipped so they stay editable.
exports.lock = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : (req.params.id ? [req.params.id] : []);
    if (!ids.length) return res.status(400).json({ error: 'No payroll ids provided.' });
    const reason = (req.body.reason || '').toString();

    const targets = await prisma.payroll.findMany({
      where: { id: { in: ids } },
      select: { id: true, paymentStatus: true },
    });
    const paidIds = targets.filter(p => String(p.paymentStatus || '').toLowerCase() === 'paid').map(p => p.id);
    const skippedUnpaid = targets.length - paidIds.length;
    if (!paidIds.length) {
      return res.status(400).json({ error: 'Only fully Paid payroll can be locked. None of the selected records are Paid.' });
    }

    // Atomic: if the attendance flip fails, the payroll rows must not stay locked.
    const result = await prisma.$transaction(async (tx) => {
      const r = await tx.payroll.updateMany({
        where: { id: { in: paidIds } },
        data: { payrollStatus: 'locked', lockedAt: new Date() },
      });
      await setSummaryLock(tx, paidIds, true); // block attendance editing for the locked month
      return r;
    });

    if (req.user?.id) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'LOCK_PAYROLL',
          module: 'Payroll',
          targetId: paidIds.join(','),
          details: JSON.stringify({
            by: req.user.name || req.user.email, role: req.user.role,
            reason: reason || '(none)', locked: result.count, skippedUnpaid,
          }).slice(0, 1500),
        },
      }).catch(() => {});
    }
    res.json({ locked: result.count, skippedUnpaid });
  } catch (error) {
    console.error('Error locking payroll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// POST /api/payroll/unlock  { ids, reason? }  → Company Head or Super Admin only.
// HR can NEVER unlock. Reverts a locked record to 'paid' (it was paid before the
// lock) so it becomes editable again for corrections, and reopens its attendance.
exports.unlock = async (req, res) => {
  try {
    const role = req.user?.role;
    if (role !== 'Super Admin' && role !== 'Company Head') {
      return res.status(403).json({ error: 'Only a Company Head or Super Admin can unlock payroll.' });
    }
    const ids = Array.isArray(req.body.ids) ? req.body.ids : (req.params.id ? [req.params.id] : []);
    if (!ids.length) return res.status(400).json({ error: 'No payroll ids provided.' });
    const reason = (req.body.reason || '').toString();

    // Atomic: payroll status, salary-slip invalidation and the attendance reopen
    // either all land or none do.
    const { result, payslipsInvalidated, paidCount } = await prisma.$transaction(async (tx) => {
      const targets = await tx.payroll.findMany({
        where: { id: { in: ids } },
        select: { id: true, payslipGenerated: true, paymentStatus: true },
      });

      const r = await tx.payroll.updateMany({
        where: { id: { in: ids } },
        // The record was Paid before it was locked, so 'paid' is the state it
        // returns to. payslipGenerated is cleared: any slip produced before the
        // unlock is stale the moment payroll can be recalculated.
        // paymentStatus is deliberately untouched — payment history is never
        // destroyed by an unlock; reconciliation is a separate, explicit action.
        data: { payrollStatus: 'paid', lockedAt: null, payslipGenerated: false },
      });

      await setSummaryLock(tx, ids, false);

      return {
        result: r,
        payslipsInvalidated: targets.filter(t => t.payslipGenerated).length,
        paidCount: targets.filter(t => String(t.paymentStatus || '').toLowerCase() === 'paid').length,
      };
    });

    if (req.user?.id) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'UNLOCK_PAYROLL',
          module: 'Payroll',
          targetId: ids.join(','),
          details: JSON.stringify({
            by: req.user.name || req.user.email, role,
            reason: reason || '(none)', unlocked: result.count,
            payslipsInvalidated, paymentsPresent: paidCount,
          }).slice(0, 1500),
        },
      }).catch(() => {});
    }
    // payslipsInvalidated / paymentsPresent let the client tell the user what the
    // unlock actually invalidated instead of guessing.
    res.json({ unlocked: result.count, payslipsInvalidated, paymentsPresent: paidCount });
  } catch (error) {
    console.error('Error unlocking payroll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// POST /api/payroll/:id/email-slip  { pdfBase64, fileName, to? }
// Emails the salary slip (PDF generated client-side) and stamps emailSentAt.
exports.emailSlip = async (req, res) => {
  try {
    const { id } = req.params;
    const { pdfBase64, fileName, to } = req.body;
    const record = await prisma.payroll.findUnique({ where: { id: idParam(id) }, include: { employee: true, company: true } });
    if (!record) return res.status(404).json({ error: 'Payroll record not found.' });

    const recipient = to || record.employee?.email;
    if (!recipient) return res.status(400).json({ error: 'Employee has no email address on file.' });

    const { sendPayslipEmail, isSmtpConfigured } = require('../services/emailService');
    const period = `${record.month} ${record.year}`;
    const result = await sendPayslipEmail({
      to: recipient,
      employeeName: record.employee?.name || record.employeeName,
      period,
      companyName: record.company?.name,
      companyId: record.companyId,          // live Company Profile branding (name + logo)
      pdfBase64,
      fileName: fileName || `${record.employee?.employeeId || 'employee'}_${record.month}_${record.year}_Salary_Slip.pdf`,
    });

    // Stamp emailSentAt regardless of dev-mode (the intent + audit trail is recorded).
    await prisma.payroll.update({ where: { id: idParam(id) }, data: { emailSentAt: new Date() } });

    res.json({
      sent: result.delivered,
      devMode: result.devMode,
      smtpConfigured: isSmtpConfigured(),
      to: recipient,
      message: result.delivered
        ? `Salary slip emailed to ${recipient}.`
        : `SMTP is not configured — email was logged, not delivered. Set SMTP_* in backend/.env to enable real delivery. (Recipient: ${recipient})`,
    });
  } catch (error) {
    console.error('Error emailing slip', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
