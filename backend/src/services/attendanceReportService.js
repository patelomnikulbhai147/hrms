/**
 * ONE aggregation engine behind BOTH attendance reports.
 *
 * Workforce Analytics and Department Attendance are two projections of the same
 * underlying tally. Computing them separately would let the department totals
 * drift from the workforce totals — the classic "two reports, same question,
 * different answers" defect. So the whole period is aggregated once here, and
 * each endpoint selects the slices it needs.
 *
 * SCOPING IS BY EMPLOYEE ID, DELIBERATELY.
 * Attendance rows carry `companyId` plus a free-text `branch` NAME, while the
 * Employee table carries a real `branchId`. Filtering attendance by branch name
 * would depend on a string matching the Branch table exactly — it does not, in
 * general. So the in-scope employees are resolved first (by real ids), and
 * attendance is then filtered by `employeeId IN (...)`. That also makes branch
 * confinement airtight: an employee outside the caller's scope has no id in the
 * list, so none of their rows can appear in any total, chart or drill-down.
 *
 * Classification is delegated to utils/attendanceStatus.js, the mirror of the
 * frontend classifier, so these reports reconcile with the dashboard cards.
 */
const prisma = require('../config/prisma');
const { classify, hasLateFlag, hasEarlyExitFlag } = require('../utils/attendanceStatus');
const { ACTIVE_EMPLOYEE_WHERE } = require('../utils/employeeStatus');
const { canReachCompany, grantedCompanyIds, grantedBranchIds } = require('../utils/companyScope');

/** An empty bucket set. Kept in one place so every row has identical keys. */
const emptyTally = () => ({
  present: 0, wfh: 0, halfDay: 0, leave: 0, absent: 0, nonWorking: 0,
  late: 0, earlyExit: 0, records: 0,
});

/**
 * Attendance % = (full days + half a day for each half day) / working days.
 * Non-working days (Weekly Off / Holiday) are excluded from the denominator —
 * counting them would drag every percentage down by the weekend.
 */
function attendancePercent(t) {
  const workingRecords = t.present + t.wfh + t.halfDay + t.leave + t.absent;
  if (!workingRecords) return 0;
  const credited = t.present + t.wfh + t.halfDay * 0.5;
  return Math.round((credited / workingRecords) * 1000) / 10;
}

const addRow = (t, row) => {
  const bucket = classify(row.status);
  t[bucket] += 1;
  t.records += 1;
  if (hasLateFlag(row.flags)) t.late += 1;
  if (hasEarlyExitFlag(row.flags)) t.earlyExit += 1;
};

/** ISO week key (e.g. "2026-W30") — stable and sortable. */
function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return dateStr;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;              // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNum + 3);      // nearest Thursday
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target - firstThursday) / 86400000 - 3) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Resolve which employees the caller may report on.
 * Returns { ok:false, status, body } or { ok:true, employees, scope }.
 */
async function resolveReportScope(req, query) {
  const workspaceRaw = query.companyId ?? req.headers['x-workspace-id'] ?? req.user?.companyId;
  const workspaceId = Number(workspaceRaw);
  if (!Number.isFinite(workspaceId) || !workspaceId) {
    return { ok: false, status: 400, body: { error: 'Company context required.' } };
  }

  const isSA = req.user?.role === 'Super Admin';
  if (!isSA && !canReachCompany(req, workspaceId)) {
    return { ok: false, status: 403, body: { error: 'Not your workspace.' } };
  }

  // The workspace may itself be a BRANCH — company and branch ids share one
  // sequence, so the only way to know is to look it up.
  const branch = await prisma.branch.findUnique({
    where: { id: workspaceId },
    select: { id: true, companyId: true, branchName: true },
  }).catch(() => null);

  const where = branch
    ? { companyId: branch.companyId, branchId: branch.id }
    : { companyId: workspaceId };

  // A user granted only SPECIFIC branches of a company must not see the rest of
  // it, even when they name the parent company id.
  if (!isSA && !branch) {
    const heldBranches = grantedBranchIds(req);
    const companyWide = grantedCompanyIds(req).includes(workspaceId);
    if (!companyWide && heldBranches.length) where.branchId = { in: heldBranches };
  }

  // An explicit branch filter from the UI narrows further — never widens, since
  // it is applied on top of the scope already established above.
  const askedBranch = Number(query.branchId);
  if (Number.isFinite(askedBranch) && askedBranch) {
    if (!isSA && !canReachCompany(req, askedBranch)) {
      return { ok: false, status: 403, body: { error: 'That branch is outside your workspace.' } };
    }
    const b = await prisma.branch.findUnique({ where: { id: askedBranch }, select: { id: true, companyId: true, branchName: true } });
    if (!b || (!branch && b.companyId !== workspaceId)) {
      return { ok: false, status: 403, body: { error: 'That branch is outside your workspace.' } };
    }
    where.companyId = b.companyId;
    where.branchId = b.id;
  }

  if (query.department) where.department = String(query.department);

  const employees = await prisma.employee.findMany({
    where: { ...where, ...ACTIVE_EMPLOYEE_WHERE },
    select: { id: true, name: true, employeeId: true, department: true, branchId: true, designation: true },
    orderBy: { name: 'asc' },
  });

  const branchRows = await prisma.branch.findMany({
    where: { companyId: branch ? branch.companyId : workspaceId },
    select: { id: true, branchName: true },
  });
  const branchName = (id) => branchRows.find((b) => b.id === id)?.branchName || null;

  return {
    ok: true,
    employees,
    scope: {
      workspaceId,
      companyId: branch ? branch.companyId : workspaceId,
      branchId: where.branchId && typeof where.branchId === 'number' ? where.branchId : (branch?.id ?? null),
      branchName: branch?.branchName || (typeof where.branchId === 'number' ? branchName(where.branchId) : null),
      department: query.department || null,
      branches: branchRows.map((b) => ({ id: b.id, name: b.branchName })),
    },
    branchName,
  };
}

/** Default range: the current month, when the caller supplies none. */
function normaliseRange(query) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(query.from || '')) ? String(query.from) : monthStart;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(query.to || '')) ? String(query.to) : today;
  return from <= to ? { from, to } : { from: to, to: from };
}

/**
 * Build the full aggregate for a scope + range. Everything either report needs.
 */
async function buildReport(req, query) {
  const scoped = await resolveReportScope(req, query);
  if (!scoped.ok) return scoped;

  const { from, to } = normaliseRange(query);
  const { employees, scope, branchName } = scoped;
  const empIds = employees.map((e) => e.id);

  // No employees in scope: return a well-formed empty report rather than an
  // error, so the UI shows an honest empty state instead of a failure.
  if (!empIds.length) {
    return {
      ok: true, report: {
        range: { from, to }, scope, totals: { ...emptyTally(), employees: 0, attendancePercent: 0, overtimeHours: 0 },
        daily: [], weekly: [], monthly: [], byDepartment: [], byEmployee: [],
      },
    };
  }

  const [records, overtime] = await Promise.all([
    prisma.attendance.findMany({
      where: { employeeId: { in: empIds }, date: { gte: from, lte: to } },
      select: { employeeId: true, date: true, status: true, flags: true, hoursWorked: true },
    }),
    // Approved overtime only — pending/rejected hours are not worked-and-owed.
    prisma.overtime.findMany({
      where: { employeeId: { in: empIds }, date: { gte: from, lte: to }, status: 'Approved' },
      select: { employeeId: true, otHours: true },
    }),
  ]);

  const otByEmp = new Map();
  let overtimeHours = 0;
  for (const o of overtime) {
    const h = Number(o.otHours) || 0;
    overtimeHours += h;
    otByEmp.set(o.employeeId, (otByEmp.get(o.employeeId) || 0) + h);
  }

  const empById = new Map(employees.map((e) => [e.id, e]));
  const totals = emptyTally();
  const byDate = new Map();
  const byWeek = new Map();
  const byMonth = new Map();
  const byDept = new Map();
  const byEmp = new Map();

  const bucketFor = (map, key) => {
    if (!map.has(key)) map.set(key, emptyTally());
    return map.get(key);
  };

  for (const r of records) {
    const emp = empById.get(r.employeeId);
    if (!emp) continue;                       // outside scope — cannot happen, but never trust it
    addRow(totals, r);
    addRow(bucketFor(byDate, r.date), r);
    addRow(bucketFor(byWeek, weekKey(r.date)), r);
    addRow(bucketFor(byMonth, r.date.slice(0, 7)), r);
    addRow(bucketFor(byDept, emp.department || 'Unassigned'), r);
    addRow(bucketFor(byEmp, r.employeeId), r);
  }

  const series = (map) => [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, t]) => ({ key, ...t, attendancePercent: attendancePercent(t) }));

  const deptHeadcount = new Map();
  employees.forEach((e) => {
    const d = e.department || 'Unassigned';
    deptHeadcount.set(d, (deptHeadcount.get(d) || 0) + 1);
  });

  return {
    ok: true,
    report: {
      range: { from, to },
      scope,
      totals: {
        ...totals,
        employees: employees.length,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        attendancePercent: attendancePercent(totals),
      },
      daily: series(byDate),
      weekly: series(byWeek),
      monthly: series(byMonth),
      byDepartment: [...byDept.entries()]
        .map(([department, t]) => ({
          department,
          employees: deptHeadcount.get(department) || 0,
          ...t,
          attendancePercent: attendancePercent(t),
        }))
        .sort((a, b) => b.records - a.records),
      byEmployee: employees.map((e) => {
        const t = byEmp.get(e.id) || emptyTally();
        return {
          employeeId: e.id,
          code: e.employeeId || null,
          name: e.name,
          department: e.department || 'Unassigned',
          designation: e.designation || null,
          branch: branchName ? branchName(e.branchId) : null,
          ...t,
          overtimeHours: Math.round((otByEmp.get(e.id) || 0) * 100) / 100,
          attendancePercent: attendancePercent(t),
        };
      }).sort((a, b) => b.records - a.records || a.name.localeCompare(b.name)),
    },
  };
}

module.exports = { buildReport, attendancePercent, emptyTally, weekKey };
