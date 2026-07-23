const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { grantedCompanyIds, grantedBranchIds, canReachCompany } = require('../utils/companyScope');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ─────────────────────────────────────────────────────────────────────────────
// Overtime → AttendanceSummary → Payroll: the link that was missing.
//
// The payroll worksheet resolves its Attendance Summary as `summary || computed`
// — the STORED AttendanceSummary wins over the live figures. Nothing recomputed
// that stored row when an overtime record was approved, so newly-approved hours
// stayed invisible to Payroll until somebody happened to re-run Attendance
// Synchronization. Measured on real data: 5 employee-months had approved
// overtime with `summary.otHours = 0` and therefore `payroll.overtime = 0`.
//
// Approving overtime is the event that changes the payable hours, so approving
// it is what must refresh the snapshot. This runs on every write that can move
// the APPROVED total for an employee-month — create, edit, approve/reject and
// delete — and it is idempotent: recompute derives the total from the Overtime
// table rather than adding a delta, so running it twice cannot double-count.
//
// A locked month is left alone (attendanceSummaryService.recompute refuses to
// overwrite one) and locked payroll is skipped by the engine, so a closed pay
// period never moves.
// ─────────────────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' → { month: 'July', year: 2026 } | null */
function periodOf(date) {
  const m = /^(\d{4})-(\d{2})/.exec(String(date || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const name = MONTH_NAMES[Number(m[2]) - 1];
  return name && year ? { month: name, year } : null;
}

/**
 * Refresh the attendance snapshot + payroll for every period the given dates
 * touch. An edit that MOVES an entry between months passes both dates, so the
 * month it left is corrected as well as the one it joined.
 *
 * Never throws: an overtime record that saved correctly must not report failure
 * because a downstream recompute had a problem. The outcome is returned so the
 * caller can put it in the response, and any failure is logged in full — the
 * one thing this must never do is fail silently.
 */
async function syncOvertimeToPayroll(employeeId, dates, context = {}) {
  const eid = idParam(employeeId);
  const results = [];
  if (!eid) return results;

  const periods = new Map();
  for (const d of dates.filter(Boolean)) {
    const p = periodOf(d);
    if (p) periods.set(`${p.month}|${p.year}`, p);
  }

  const attSvc = require('../services/attendanceSummaryService');
  const payrollCtrl = require('./payrollController'); // lazy — avoids a require cycle

  for (const { month, year } of periods.values()) {
    const started = Date.now();
    try {
      // 1) Canonical snapshot — otHours is re-derived from APPROVED rows only.
      const summary = await attSvc.recompute(eid, month, year);
      // 2) One engine: OT amount, gross split, PF/ESI/PT, net. Skips locked rows.
      const recalculated = await payrollCtrl.recalcForEmployeeMonth(eid, month, year);
      results.push({
        month, year, ok: true,
        otHours: summary?.otHours ?? 0,
        payrollRowsRecalculated: recalculated,
        ms: Date.now() - started,
      });
    } catch (err) {
      // Everything needed to diagnose it, per incident-response requirements.
      const approved = await prisma.overtime
        .aggregate({ where: { employeeId: eid, status: 'Approved' }, _sum: { otHours: true } })
        .catch(() => null);
      const payroll = await prisma.payroll
        .findFirst({ where: { employeeId: eid, month, year }, select: { id: true, otHours: true, overtime: true } })
        .catch(() => null);
      console.error('[overtime→payroll] SYNC FAILED', JSON.stringify({
        employeeId: eid,
        overtimeRecordId: context.overtimeId ?? null,
        trigger: context.trigger || 'unknown',
        payrollMonth: `${month} ${year}`,
        approvedHoursOnRecord: approved?._sum?.otHours ?? null,
        payrollId: payroll?.id ?? null,
        hoursImported: payroll?.otHours ?? null,
        otAmount: payroll?.overtime ?? null,
        sqlErrorCode: err?.code ?? null,
        meta: err?.meta ?? null,
        message: err?.message,
        timestamp: new Date().toISOString(),
      }));
      console.error(err?.stack || err);
      results.push({ month, year, ok: false, error: err?.message || 'sync failed' });
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// The Overtime form and the Overtime table have never agreed on field names.
// The client posts { empId, empName, empCode, in, out }; the model requires
// { employeeId, employeeName, employeeCode, inTime, outTime }. `create` passed
// req.body straight to Prisma, so EVERY overtime entry failed in production with
// "Argument `employeeName` is missing" — 500 on every attempt, the only
// recurring error in the live logs.
//
// Normalising here (rather than renaming the form fields) fixes it for clients
// already deployed in browsers, and accepts both spellings so a later frontend
// change cannot break it again.
const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');

function toOvertimeRow(body, user) {
  const b = body || {};
  const employeeId = idParam(pick(b.employeeId, b.empId));
  const companyId = idParam(pick(b.companyId, user?.companyId));
  const otHours = Number(pick(b.otHours, 0)) || 0;
  return {
    companyId,
    employeeId,
    employeeName: String(pick(b.employeeName, b.empName) || '').trim(),
    employeeCode: pick(b.employeeCode, b.empCode) || null,
    department: b.department || null,
    branch: b.branch || null,
    shift: b.shift || null,
    date: String(pick(b.date) || ''),
    inTime: String(pick(b.inTime, b.in) || ''),
    outTime: String(pick(b.outTime, b.out) || ''),
    otHours,
    type: String(pick(b.type) || 'Normal Overtime'),
    reason: b.reason || null,
    remarks: b.remarks || null,
    status: b.status || 'Pending',
  };
}

// Echo the legacy aliases back so the existing Overtime table — which renders
// `ot.empName` — keeps working without a frontend deploy.
const shapeOvertime = (row) => ({
  ...row,
  empId: row.employeeId,
  empName: row.employeeName,
  empCode: row.employeeCode,
  in: row.inTime,
  out: row.outTime,
});

/**
 * The tenant scope for a request, as a Prisma `where`.
 *
 * Shared by the flat list and the grouped summary so the two can never disagree
 * about which records a user may see — a grouped view that scoped differently
 * would show totals built from rows the flat list hides.
 *
 * @returns {{ where: object } | { forbidden: true }}
 */
function scopeWhere(req) {
  const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
  const whereClause = {};

  if (req.user && req.user.role !== 'Super Admin') {
    // Mirror the create check: a user granted only certain BRANCHES of a
    // company must still see the overtime raised for employees in them, even
    // though the row itself is stamped with the parent company id.
    const branchIds = grantedBranchIds(req);
    whereClause.OR = [
      { companyId: { in: grantedCompanyIds(req) } },
      ...(branchIds.length ? [{ employee: { branchId: { in: branchIds } } }] : []),
    ];
    if (companyId) {
      if (!canReachCompany(req, companyId)) return { forbidden: true };
      delete whereClause.OR;
      // The requested workspace may be a BRANCH. Overtime rows are stamped with
      // the PARENT company id (the model has no branchId), so filtering by the
      // branch id directly would match nothing — a branch user would see an
      // empty overtime list. Match on the employee's branch instead.
      // branchCompanyMap is built by authMiddleware: branch id → parent company.
      const isBranch = !!(req.user.branchCompanyMap || {})[companyId];
      if (isBranch) whereClause.employee = { branchId: companyId };
      else whereClause.companyId = companyId;
    }
  } else if (companyId) {
    whereClause.companyId = companyId;
  }
  return { where: whereClause };
}

exports.getAll = async (req, res) => {
  try {
    const scope = scopeWhere(req);
    if (scope.forbidden) return res.status(403).json({ error: 'Unauthorized' });

    const data = await prisma.overtime.findMany({ where: scope.where });
    res.json(data.map(shapeOvertime));
  } catch (error) {
    console.error('Error fetching overtimes', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/overtime/summary — ONE ROW PER EMPLOYEE.
//
// The grouping is a presentation of the same rows, computed on the server so the
// figures HR approves against come from the database rather than from whatever
// subset a paginated table happened to have in memory. The individual Overtime
// records are never merged, rewritten or deleted; every entry is returned inside
// its employee's `entries` so the expanded row shows them all.
//
// Payroll is NOT fed from this endpoint. It reads the Overtime table directly
// (attendanceSummaryService.recompute → recalcOne). What this reports is whether
// those two agree, per employee-month:
//
//   Synced        payroll.otHours == approved hours for every month
//   Outdated      a payroll row exists but its hours differ (approval after sync)
//   Not in payroll approved hours exist with no payroll row for that month yet
// ─────────────────────────────────────────────────────────────────────────────

/** Working days when no attendance snapshot exists yet: calendar days − Sundays. */
function fallbackWorkingDays(year, monthIndex) {
  const days = new Date(year, monthIndex + 1, 0).getDate();
  let sundays = 0;
  for (let d = 1; d <= days; d++) if (new Date(year, monthIndex, d).getDay() === 0) sundays++;
  return Math.max(1, days - sundays);
}

const isApproved = (s) => String(s || '').trim().toLowerCase() === 'approved';
const isRejected = (s) => String(s || '').trim().toLowerCase() === 'rejected';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

exports.summary = async (req, res) => {
  try {
    const scope = scopeWhere(req);
    if (scope.forbidden) return res.status(403).json({ error: 'Unauthorized' });

    const rows = await prisma.overtime.findMany({
      where: scope.where,
      orderBy: { date: 'desc' },
      include: {
        employee: {
          select: {
            id: true, name: true, employeeId: true, department: true,
            branchLocation: true, salary: true, companyId: true, branchId: true,
          },
        },
      },
    });
    if (!rows.length) return res.json({ employees: [], totals: emptyTotals() });

    // ── Group. Every record keeps its own identity inside its employee. ────────
    const groups = new Map();
    for (const r of rows) {
      let g = groups.get(r.employeeId);
      if (!g) {
        g = {
          employeeId: r.employeeId,
          name: r.employee?.name || r.employeeName,
          employeeCode: r.employee?.employeeId || r.employeeCode || null,
          department: r.employee?.department || r.department || null,
          branch: r.employee?.branchLocation || r.branch || null,
          companyId: r.companyId,
          branchId: r.employee?.branchId ?? null,
          salary: Number(r.employee?.salary) || 0,
          totalHours: 0, approvedHours: 0, pendingHours: 0, rejectedHours: 0,
          records: 0, lastDate: null, firstDate: null,
          entries: [],
          months: [],
        };
        groups.set(r.employeeId, g);
      }
      const h = Number(r.otHours) || 0;
      g.totalHours += h;
      if (isApproved(r.status)) g.approvedHours += h;
      else if (isRejected(r.status)) g.rejectedHours += h;
      else g.pendingHours += h;
      g.records++;
      if (!g.lastDate || r.date > g.lastDate) g.lastDate = r.date;
      if (!g.firstDate || r.date < g.firstDate) g.firstDate = r.date;
      g.entries.push(shapeOvertime({ ...r, employee: undefined }));
    }

    // ── Approved hours per employee-month — the figure payroll must match. ────
    const perMonth = new Map(); // `${employeeId}|${month}|${year}` → hours
    for (const r of rows) {
      if (!isApproved(r.status)) continue;
      const p = periodOf(r.date);
      if (!p) continue;
      const k = `${r.employeeId}|${p.month}|${p.year}`;
      perMonth.set(k, (perMonth.get(k) || 0) + (Number(r.otHours) || 0));
    }

    const empIds = [...groups.keys()];
    const [payrolls, summaries, companies] = await Promise.all([
      prisma.payroll.findMany({
        where: { employeeId: { in: empIds } },
        select: { employeeId: true, month: true, year: true, otHours: true, overtime: true, payrollStatus: true },
      }),
      prisma.attendanceSummary.findMany({
        where: { employeeId: { in: empIds } },
        select: { employeeId: true, month: true, year: true, otHours: true, workingDays: true },
      }),
      prisma.company.findMany({
        where: { id: { in: [...new Set([...groups.values()].map((g) => g.companyId))] } },
        select: { id: true, overtimeRate: true },
      }),
    ]);

    const payrollBy = new Map();
    for (const p of payrolls) {
      const k = `${p.employeeId}|${p.month}|${p.year}`;
      const c = payrollBy.get(k) || { otHours: 0, overtime: 0, locked: false, rows: 0 };
      c.otHours += Number(p.otHours) || 0;
      c.overtime += Number(p.overtime) || 0;
      c.locked = c.locked || p.payrollStatus === 'locked';
      c.rows++;
      payrollBy.set(k, c);
    }
    const summaryBy = new Map(summaries.map((s) => [`${s.employeeId}|${s.month}|${s.year}`, s]));
    const companyBy = new Map(companies.map((c) => [c.id, c]));

    // The OT multiplier lives on the Deduction Policy — resolved once per
    // company|branch scope, not once per employee.
    const policySvc = require('../services/deductionPolicyService');
    const policyCache = new Map();
    for (const key of new Set([...groups.values()].map((g) => `${g.companyId}|${g.branchId ?? ''}`))) {
      const [cid, bid] = key.split('|');
      policyCache.set(key, await policySvc
        .resolveEffectivePolicy({ companyId: Number(cid), branchId: bid === '' ? null : Number(bid) })
        .catch(() => null));
    }

    const otPay = require('../utils/overtimePay');

    for (const g of groups.values()) {
      const multiplier = otPay.resolveOvertimeMultiplier(
        policyCache.get(`${g.companyId}|${g.branchId ?? ''}`),
        companyBy.get(g.companyId),
      );
      let amount = 0;
      let synced = 0, outdated = 0, missing = 0, locked = 0;

      for (const [k, approvedHours] of perMonth) {
        const [eid, month, year] = k.split('|');
        if (Number(eid) !== g.employeeId) continue;
        const yr = Number(year);
        const snap = summaryBy.get(k);
        const pay = payrollBy.get(k);
        const workingDays = Number(snap?.workingDays) > 0
          ? Number(snap.workingDays)
          : fallbackWorkingDays(yr, MONTH_NAMES.indexOf(month));

        // What the engine WOULD pay for these hours, by the shared formula.
        const expected = otPay.computeOvertimeAmount({
          otHours: approvedHours, monthlyGross: g.salary, workingDays, multiplier,
        });

        // A LOCKED payroll month that disagrees is reported as its own state, not
        // as "Outdated". Pushing cannot repair it — the engine deliberately skips
        // locked rows so a closed pay period only moves through an explicit,
        // audited correction — so telling HR to push would be telling them to do
        // something that does nothing. Measured on real data: an employee with
        // 13 approved hours across four months had three of them locked.
        let status;
        if (!pay) { status = 'Not in payroll'; missing++; }
        else if (Math.abs((pay.otHours || 0) - approvedHours) < 0.01) { status = 'Synced'; synced++; }
        else if (pay.locked) { status = 'Locked'; locked++; }
        else { status = 'Outdated'; outdated++; }

        // Where payroll has already paid these hours its own figure is the truth;
        // elsewhere the engine formula shows what a push would produce. A locked
        // month keeps its paid figure — that is the money that actually left.
        amount += (status === 'Synced' || status === 'Locked') ? (pay.overtime || 0) : expected;

        g.months.push({
          month, year: yr,
          approvedHours: round2(approvedHours),
          summaryOtHours: snap ? round2(snap.otHours) : null,
          payrollOtHours: pay ? round2(pay.otHours) : null,
          payrollOtAmount: pay ? Math.round(pay.overtime || 0) : null,
          expectedOtAmount: expected,
          payrollLocked: !!pay?.locked,
          status,
        });
      }

      g.months.sort((a, b) => (b.year - a.year) || (MONTH_NAMES.indexOf(b.month) - MONTH_NAMES.indexOf(a.month)));
      g.otAmount = Math.round(amount);
      g.multiplier = multiplier;
      // Worst state wins, and the two states HR can act on are named first.
      g.payrollStatus = g.approvedHours <= 0
        ? 'No approved OT'
        : outdated ? 'Outdated'
        : missing ? 'Not in payroll'
        : locked ? 'Locked'
        : synced ? 'Synced' : 'No approved OT';
      g.lockedMonths = locked;
      g.totalHours = round2(g.totalHours);
      g.approvedHours = round2(g.approvedHours);
      g.pendingHours = round2(g.pendingHours);
      g.rejectedHours = round2(g.rejectedHours);
      delete g.branchId;
    }

    const employees = [...groups.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const totals = employees.reduce((t, g) => ({
      employees: t.employees + 1,
      records: t.records + g.records,
      totalHours: round2(t.totalHours + g.totalHours),
      approvedHours: round2(t.approvedHours + g.approvedHours),
      pendingHours: round2(t.pendingHours + g.pendingHours),
      rejectedHours: round2(t.rejectedHours + g.rejectedHours),
      otAmount: t.otAmount + g.otAmount,
      synced: t.synced + (g.payrollStatus === 'Synced' ? 1 : 0),
      needsPush: t.needsPush + (g.payrollStatus === 'Outdated' || g.payrollStatus === 'Not in payroll' ? 1 : 0),
    }), emptyTotals());

    res.json({ employees, totals });
  } catch (error) {
    console.error('Error building overtime summary', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

function emptyTotals() {
  return { employees: 0, records: 0, totalHours: 0, approvedHours: 0, pendingHours: 0, rejectedHours: 0, otAmount: 0, synced: 0, needsPush: 0 };
}

/**
 * POST /api/overtime/push-to-payroll  { employeeId, month?, year? }
 *
 * Runs the SAME sync the approval hook runs — recompute the attendance snapshot
 * from APPROVED overtime rows, then re-run the payroll engine. It exists so HR
 * can repair an employee whose payroll predates the approval hook; it introduces
 * no second formula and sets no value by hand, so pushing twice cannot
 * double-count and pushing an employee with nothing approved simply writes zero.
 */
exports.pushToPayroll = async (req, res) => {
  try {
    const employeeId = idParam(req.body?.employeeId);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required.' });

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, companyId: true, branchId: true },
    });
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });
    if (req.user && req.user.role !== 'Super Admin') {
      const reachable = canReachCompany(req, employee.companyId)
        || (employee.branchId != null && canReachCompany(req, employee.branchId));
      if (!reachable) return res.status(403).json({ error: 'Not your workspace.' });
    }

    // Every month this employee has ANY overtime in — not just approved ones, so
    // a month whose approval was revoked also stops being paid.
    const rows = await prisma.overtime.findMany({
      where: { employeeId }, select: { date: true, otHours: true, status: true },
    });
    if (!rows.length) return res.status(400).json({ error: 'This employee has no overtime records.' });

    let dates = rows.map((r) => r.date);
    const month = req.body?.month, year = req.body?.year ? Number(req.body.year) : null;
    if (month && year) {
      dates = dates.filter((d) => { const p = periodOf(d); return p && p.month === month && p.year === year; });
      if (!dates.length) return res.status(400).json({ error: `No overtime records in ${month} ${year}.` });
    }

    const started = Date.now();
    const results = await syncOvertimeToPayroll(employeeId, dates, { trigger: 'manual-push' });
    const approvedHours = rows.filter((r) => isApproved(r.status)).reduce((s, r) => s + (Number(r.otHours) || 0), 0);
    const failed = results.filter((r) => !r.ok);

    // A locked payroll month is skipped by the engine, so the snapshot moves and
    // the money does not. Say so explicitly — a silent "pushed" on a locked month
    // would read as success when nothing was paid.
    const lockedPeriods = [];
    for (const r of results.filter((x) => x.ok)) {
      const pay = await prisma.payroll.findFirst({
        where: { employeeId, month: r.month, year: r.year },
        select: { otHours: true, payrollStatus: true },
      });
      if (pay?.payrollStatus === 'locked' && Math.abs((pay.otHours || 0) - (r.otHours || 0)) >= 0.01) {
        lockedPeriods.push({ month: r.month, year: r.year, approvedHours: r.otHours, payrollOtHours: pay.otHours });
      }
    }

    res.status(failed.length ? 207 : 200).json({
      employeeId, employeeName: employee.name,
      approvedHours: round2(approvedHours),
      periods: results,
      periodsPushed: results.filter((r) => r.ok).length,
      failed: failed.length,
      lockedPeriods,
      ms: Date.now() - started,
    });
  } catch (error) {
    console.error('Error pushing overtime to payroll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const row = toOvertimeRow(req.body, req.user);

    // Validate explicitly so a bad entry is a 400 the user can act on, not a 500.
    const missing = ['companyId', 'employeeId', 'employeeName', 'date', 'inTime', 'outTime']
      .filter((k) => row[k] === null || row[k] === undefined || row[k] === '');
    if (missing.length) {
      return res.status(400).json({
        error: `Missing required overtime details: ${missing.join(', ')}.`,
        fields: missing,
      });
    }

    // Authorise against the EMPLOYEE, not just the company id on the payload.
    //
    // resolveAccess (authMiddleware) demotes a company to branch-level access
    // whenever the user is granted specific branches of it: a Company Head with
    // branches 7 and 8 of company 2 gets accessibleBranchIds [7,8] and company 2
    // is NOT in accessibleCompanyIds. Overtime rows only carry companyId, so a
    // company-level check refused every entry for a branch the user genuinely
    // administers. Verified in production — raising overtime for an employee in
    // branch 7 of company 2 returned 403.
    const employee = await prisma.employee.findUnique({
      where: { id: row.employeeId },
      select: { id: true, companyId: true, branchId: true },
    });
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });

    const reachable = canReachCompany(req, employee.companyId)
      || (employee.branchId != null && canReachCompany(req, employee.branchId));
    if (!reachable) return res.status(403).json({ error: 'Not your workspace.' });

    // Keep the stored companyId consistent with the employee it belongs to,
    // rather than trusting whatever the client posted.
    row.companyId = employee.companyId;

    const data = await prisma.overtime.create({ data: row });
    // A record created already-Approved (bulk import, or an admin approving at
    // entry) must reach payroll immediately, not wait for a later sync.
    const payrollSync = await syncOvertimeToPayroll(data.employeeId, [data.date], {
      overtimeId: data.id, trigger: 'create',
    });
    res.status(201).json({ ...shapeOvertime(data), payrollSync });
  } catch (error) {
    console.error('Error creating overtime', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// Which request-body keys (including legacy aliases) map onto which column.
// Used so an update writes ONLY what the caller actually sent.
const UPDATE_FIELDS = {
  employeeId: ['employeeId', 'empId'],
  employeeName: ['employeeName', 'empName'],
  employeeCode: ['employeeCode', 'empCode'],
  department: ['department'],
  branch: ['branch'],
  shift: ['shift'],
  date: ['date'],
  inTime: ['inTime', 'in'],
  outTime: ['outTime', 'out'],
  otHours: ['otHours'],
  type: ['type'],
  reason: ['reason'],
  remarks: ['remarks'],
  status: ['status'],
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};

    // Build the patch from the keys PRESENT in the request — never from a
    // normalised full row.
    //
    // This used to call toOvertimeRow(), which fills in defaults for everything
    // the caller omitted (otHours → 0, type → 'Normal Overtime'), then dropped
    // only null/undefined/''. Zero survives that filter, so approving an entry —
    // a status-only PUT { status: 'Approved' } — silently rewrote otHours to 0
    // and reset the OT type. The hours vanished at the exact moment the record
    // became eligible for pay, so approved overtime was always worth ₹0.
    const data = {};
    for (const [column, aliases] of Object.entries(UPDATE_FIELDS)) {
      const key = aliases.find((a) => Object.prototype.hasOwnProperty.call(b, a));
      if (key === undefined) continue;             // not supplied → leave untouched
      const raw = b[key];
      if (raw === undefined) continue;

      if (column === 'employeeId') {
        const v = idParam(raw);
        if (v !== undefined && v !== null) data[column] = v;
      } else if (column === 'otHours') {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ error: 'Overtime hours must be a non-negative number.', fields: ['otHours'] });
        }
        data[column] = n;
      } else if (['employeeName', 'date', 'inTime', 'outTime', 'type', 'status'].includes(column)) {
        // Required columns — reject a blank rather than writing one.
        const v = String(raw ?? '').trim();
        if (v === '') {
          return res.status(400).json({ error: `${column} cannot be blank.`, fields: [column] });
        }
        data[column] = v;
      } else {
        data[column] = raw === '' ? null : raw;     // optional text columns
      }
    }
    // companyId is deliberately absent from UPDATE_FIELDS — an entry is never
    // re-homed to another company by an edit.

    if (!Object.keys(data).length) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    // Authorise against the EXISTING row before touching it, so an id from
    // another tenant cannot be edited by guessing it.
    const current = await prisma.overtime.findUnique({
      where: { id: idParam(id) },
      select: { id: true, companyId: true, employeeId: true, date: true, status: true, otHours: true, employee: { select: { branchId: true } } },
    });
    if (!current) return res.status(404).json({ error: 'Overtime entry not found.' });
    if (req.user && req.user.role !== 'Super Admin') {
      const reachable = canReachCompany(req, current.companyId)
        || (current.employee?.branchId != null && canReachCompany(req, current.employee.branchId));
      if (!reachable) return res.status(403).json({ error: 'Not your workspace.' });
    }

    const updated = await prisma.overtime.update({ where: { id: idParam(id) }, data });

    // THE approval hook. Approving (or un-approving, re-dating, re-hosting to a
    // different employee, or changing the hours) all move an employee-month's
    // approved total, so every one of them refreshes the snapshot and payroll.
    // Both the OLD and NEW date/employee are passed, so an entry moved between
    // months or people corrects the period it left as well as the one it joined.
    const payrollSync = await syncOvertimeToPayroll(updated.employeeId, [current.date, updated.date], {
      overtimeId: updated.id, trigger: `update:${current.status}->${updated.status}`,
    });
    if (current.employeeId !== updated.employeeId) {
      payrollSync.push(...await syncOvertimeToPayroll(current.employeeId, [current.date], {
        overtimeId: updated.id, trigger: 'update:reassigned-from',
      }));
    }
    res.json({ ...shapeOvertime(updated), payrollSync });
  } catch (error) {
    console.error('Error updating overtime', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    // Same ownership check as update — deleting by a guessed id must not reach
    // another tenant's overtime.
    const current = await prisma.overtime.findUnique({
      where: { id: idParam(id) },
      select: { id: true, companyId: true, employeeId: true, date: true, status: true, employee: { select: { branchId: true } } },
    });
    if (!current) return res.status(404).json({ error: 'Overtime entry not found.' });
    if (req.user && req.user.role !== 'Super Admin') {
      const reachable = canReachCompany(req, current.companyId)
        || (current.employee?.branchId != null && canReachCompany(req, current.employee.branchId));
      if (!reachable) return res.status(403).json({ error: 'Not your workspace.' });
    }
    await prisma.overtime.delete({ where: { id: idParam(id) } });
    // Deleting APPROVED overtime removes paid hours — payroll must stop paying
    // them, so the snapshot is rebuilt the same way as on approval.
    const payrollSync = await syncOvertimeToPayroll(current.employeeId, [current.date], {
      overtimeId: current.id, trigger: 'delete',
    });
    res.json({ message: 'Deleted successfully', payrollSync });
  } catch (error) {
    console.error('Error deleting overtime', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
