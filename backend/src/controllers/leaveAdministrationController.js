/**
 * Leave Administration — SERVER-SIDE paginated roster.
 *
 * Replaces the old "load every employee, every balance and every leave request
 * into the browser, then compute" path. The client now asks for one page and
 * gets only that page's employees, balances and leave rows.
 *
 * ── WHY THIS ENDPOINT DOES NOT RETURN Total Allocation / Remaining ──────────
 * Those columns come from the company LEAVE POLICY, and that policy is stored in
 * the BROWSER (localStorage — see utils/payrollSettings.ts: "pure client-side
 * policy state … with zero database/schema change"). The server genuinely cannot
 * read it, so computing entitlement here would mean inventing a second policy
 * source and shipping numbers that disagree with every other screen.
 *
 * So the split is deliberate:
 *   server → WHICH employees (scope, filters, search, sort, page) + their raw
 *            balance row and their own leave requests
 *   client → the wallet maths, for the 10 rows on screen, using the one policy
 *            it already holds
 *
 * That still satisfies the actual requirement — the browser never loads the full
 * roster, and page/search cost is bounded by `limit`, not by company size.
 * Moving the policy into the database would let this endpoint own the whole row;
 * that is a separate migration touching Settings, payroll and attendance.
 */
const prisma = require('../config/prisma');
const { ACTIVE_EMPLOYEE_WHERE } = require('../utils/employeeStatus');
const { canReachCompany, grantedBranchIds, grantedCompanyIds } = require('../utils/companyScope');

const MAX_LIMIT = 100;
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Which employees may this caller see? Same rule as the attendance reports:
 * resolve the workspace, honour a branch workspace, and confine a user who holds
 * only specific branches. Company and branch ids share one sequence, so the
 * workspace is looked up in `Branch` rather than guessed from its value.
 */
// Declared, then exported — NOT `exports.scopeWhere = async function scopeWhere()`.
// A named function EXPRESSION binds its name only inside its own body, never in
// module scope, so the bare calls in list() and filterOptions() below threw
// "scopeWhere is not defined" and both endpoints 500'd for every role.
async function scopeWhere(req) {
  const raw = req.query.companyId ?? req.body.companyId ?? req.headers['x-workspace-id'] ?? req.user?.companyId;
  const workspaceId = Number(raw);
  if (!Number.isFinite(workspaceId) || !workspaceId) {
    return { ok: false, status: 400, body: { error: 'Company context required.' } };
  }
  const isSA = req.user?.role === 'Super Admin';
  if (!isSA && !canReachCompany(req, workspaceId)) {
    return { ok: false, status: 403, body: { error: 'Not your workspace.' } };
  }

  const branch = await prisma.branch.findUnique({
    where: { id: workspaceId },
    select: { id: true, companyId: true },
  }).catch(() => null);

  const where = branch
    ? { companyId: branch.companyId, branchId: branch.id }
    : { companyId: workspaceId };

  if (!isSA && !branch) {
    const held = grantedBranchIds(req);
    const companyWide = grantedCompanyIds(req).includes(workspaceId);
    if (!companyWide && held.length) where.branchId = { in: held };
  }
  return { ok: true, where, companyId: branch ? branch.companyId : workspaceId };
}
// leaveAdminController imports this symbol, so it must stay on exports too.
exports.scopeWhere = scopeWhere;

exports.list = async (req, res) => {
  const tag = `[leave-admin] by=${req.user?.id ?? '?'} (${req.user?.role || 'unknown'})`;
  const startedAt = Date.now();
  try {
    const scoped = await scopeWhere(req);
    if (!scoped.ok) {
      console.warn(`${tag} REJECTED ${scoped.status}: ${scoped.body.error}`);
      return res.status(scoped.status).json(scoped.body);
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || 10));
    const search = String(req.query.search || '').trim();
    const department = String(req.query.department || '').trim();
    const branchFilter = String(req.query.branch || '').trim();
    const status = String(req.query.status || '').trim();     // Present | On Leave
    const leaveType = String(req.query.leaveType || '').trim();

    // Filters are applied in the DATABASE, so page 2 of a filtered list is still
    // only 10 rows over the wire.
    const where = { ...scoped.where, ...ACTIVE_EMPLOYEE_WHERE };
    if (department) where.department = department;
    if (branchFilter) where.branchLocation = branchFilter;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { employeeId: { contains: search } },
        { department: { contains: search } },
      ];
    }

    const today = todayStr();

    // Status and leave-type narrow by EMPLOYEE ID, resolved from the leave table
    // first. Doing it this way keeps one `where` for both the count and the page,
    // so the total can never disagree with the rows returned.
    if (status || leaveType) {
      const leaveWhere = { companyId: scoped.companyId };
      if (leaveType) leaveWhere.leaveType = leaveType;
      if (status) {
        leaveWhere.status = 'Approved';
        leaveWhere.fromDate = { lte: today };
        leaveWhere.toDate = { gte: today };
      }
      const ids = [...new Set((await prisma.leaveRequest.findMany({
        where: leaveWhere, select: { employeeId: true },
      })).map(r => r.employeeId))];

      if (status === 'Present') {
        // "Present" = NOT on approved leave today.
        where.id = { notIn: ids.length ? ids : [0] };
      } else if (status) {
        where.id = { in: ids.length ? ids : [0] };
      } else if (leaveType) {
        where.id = { in: ids.length ? ids : [0] };
      }
    }

    const [total, employees] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        select: {
          id: true, name: true, employeeId: true, department: true,
          branchLocation: true, branchId: true, designation: true,
        },
        orderBy: [{ name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const ids = employees.map(e => e.id);
    // Balances and leave rows for THIS PAGE only — the queries that used to be
    // "fetch everything" are now bounded by `limit`.
    const [balances, leaveRows] = ids.length
      ? await Promise.all([
          prisma.leaveBalance.findMany({ where: { employeeId: { in: ids } }, orderBy: { year: 'asc' } }),
          prisma.leaveRequest.findMany({
            where: { employeeId: { in: ids }, status: { in: ['Approved', 'Pending'] } },
            select: { employeeId: true, leaveType: true, fromDate: true, toDate: true, days: true, status: true },
          }),
        ])
      : [[], []];

    // Newest year wins when an employee has several balance rows.
    const balByEmp = new Map();
    balances.forEach(b => balByEmp.set(b.employeeId, b));

    const leavesByEmp = new Map();
    leaveRows.forEach(l => {
      if (!leavesByEmp.has(l.employeeId)) leavesByEmp.set(l.employeeId, []);
      leavesByEmp.get(l.employeeId).push(l);
    });

    const data = employees.map(e => {
      const b = balByEmp.get(e.id) || {};
      const mine = leavesByEmp.get(e.id) || [];
      const approved = mine.filter(l => l.status === 'Approved');
      const onLeave = approved.find(l =>
        String(l.fromDate || '').slice(0, 10) <= today && today <= String(l.toDate || '').slice(0, 10));
      return {
        employeeId: e.id,
        employeeCode: e.employeeId || '—',
        employeeName: e.name,
        branch: e.branchLocation || 'Head Office',
        department: e.department || '—',
        designation: e.designation || null,
        // Legacy CL/PL/SL balance model, unchanged.
        cl: Number(b.clBalance) || 0,
        pl: Number(b.plBalance) || 0,
        sl: Number(b.slBalance) || 0,
        taken: (Number(b.clUsed) || 0) + (Number(b.plUsed) || 0) + (Number(b.slUsed) || 0),
        pendingCount: mine.filter(l => l.status === 'Pending').length,
        currentStatus: onLeave
          ? (Number(onLeave.days) > 0 && Number(onLeave.days) < 1 ? 'Half Day' : 'On Leave')
          : 'Present',
        // The client builds the entitlement wallet from these + the local policy.
        approvedLeaves: approved.map(l => ({
          leaveType: l.leaveType, fromDate: l.fromDate, toDate: l.toDate, days: l.days, status: l.status,
        })),
      };
    });

    console.log(`${tag} page=${page} limit=${limit} returned=${data.length}/${total} in ${Date.now() - startedAt}ms`);
    res.json({ data, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    console.error(`${tag} FAILED after ${Date.now() - startedAt}ms`, error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

/**
 * The distinct Branch / Department / Leave-type values PRESENT IN SCOPE, so the
 * filter dropdowns do not need the full roster in the browser either.
 */
exports.filterOptions = async (req, res) => {
  try {
    const scoped = await scopeWhere(req);
    if (!scoped.ok) return res.status(scoped.status).json(scoped.body);

    const [emps, types] = await Promise.all([
      prisma.employee.findMany({
        where: { ...scoped.where, ...ACTIVE_EMPLOYEE_WHERE },
        select: { department: true, branchLocation: true },
      }),
      prisma.leaveRequest.findMany({
        where: { companyId: scoped.companyId },
        select: { leaveType: true },
        distinct: ['leaveType'],
      }),
    ]);

    const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort();
    res.json({
      departments: uniq(emps.map(e => e.department)),
      branches: uniq(emps.map(e => e.branchLocation)),
      leaveTypes: uniq(types.map(t => t.leaveType)),
    });
  } catch (error) {
    console.error('[leave-admin:options] FAILED', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
