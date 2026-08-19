const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const leaveService = require('../services/leaveService');
const leaveEligibility = require('../services/leaveEligibilityService');
const AuditService = require('../services/auditService');
const { notify } = require('../services/notificationService');

// The login user (if any) linked to an employee record — so leave decisions can
// be delivered straight to that employee's notification bell.
async function userIdForEmployee(employeeId) {
  if (!employeeId) return null;
  const u = await prisma.user.findFirst({ where: { employeeId: Number(employeeId) }, select: { id: true } }).catch(() => null);
  return u ? u.id : null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthNameOf = (dateStr) => {
  const d = new Date(dateStr);
  return isNaN(d) ? MONTHS[5] : MONTHS[d.getMonth()];
};
const yearOf = (dateStr) => {
  const d = new Date(dateStr);
  return isNaN(d) ? leaveService.DEFAULT_YEAR : d.getFullYear();
};

// Flag the employee's payroll for the leave month as needing regeneration.
async function markPayrollOutdated(employeeId, month, year) {
  try {
    await prisma.payroll.updateMany({
      where: { employeeId: Number(employeeId), month, year: Number(year) },
      data: { isOutdated: true },
    });
  } catch (e) { console.error('markPayrollOutdated failed:', e.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCOPE — the one place that decides which leave rows a request may see.
//
// SECURITY FIX. The previous version built a grant-restricted filter and then,
// whenever `?companyId` was supplied, REPLACED it outright:
//
//     if (companyId) { whereClause = { OR: [{ companyId }, …] } }   // ← no check
//
// so the requested company was trusted without ever asking whether the caller
// could reach it. Verified against live data: a company-1 Company Head calling
// `?companyId=13` received 861 leave records belonging to company 13 — a
// cross-tenant leak, reachable from the URL bar. A named workspace must now pass
// canReachCompany, and the grant filter is never discarded.
// ─────────────────────────────────────────────────────────────────────────────
const { canReachCompany, grantedCompanyIds, grantedBranchIds } = require('../utils/companyScope');

function leaveScopeWhere(req) {
  const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
  const isSA = req.user?.role === 'Super Admin';

  if (isSA) {
    // Super Admin may name any workspace; with none named they see everything.
    return companyId
      ? { ok: true, where: { OR: [{ companyId }, { employee: { branchId: companyId } }, { employee: { companyId } }] } }
      : { ok: true, where: {} };
  }

  const allowed = [...new Set([...grantedCompanyIds(req), ...grantedBranchIds(req)])];
  if (companyId) {
    if (!canReachCompany(req, companyId)) {
      return { ok: false, status: 403, body: { error: 'Not your workspace.' } };
    }
    return { ok: true, where: { OR: [{ companyId }, { employee: { branchId: companyId } }, { employee: { companyId } }] } };
  }
  return {
    ok: true,
    where: {
      OR: [
        { companyId: { in: allowed } },
        { employee: { branchId: { in: allowed } } },
        { employee: { companyId: { in: allowed } } },
      ],
    },
  };
}

// Ownership check for a single leave record accessed BY ID (update/delete/etc).
// Mirrors leaveScopeWhere's OR exactly: the caller must be able to reach the
// row's own companyId, or the employee's branch/parent company. Without this a
// user could approve/edit/delete ANOTHER tenant's leave by naming its id.
async function canReachLeave(req, leave) {
  if (req.user?.role === 'Super Admin') return true;
  if (leave.companyId != null && canReachCompany(req, leave.companyId)) return true;
  const emp = leave.employee ||
    (leave.employeeId
      ? await prisma.employee.findUnique({ where: { id: leave.employeeId }, select: { companyId: true, branchId: true } })
      : null);
  if (!emp) return false;
  return (emp.companyId != null && canReachCompany(req, emp.companyId)) ||
         (emp.branchId != null && canReachCompany(req, emp.branchId));
}

exports.getAll = async (req, res) => {
  try {
    const scoped = leaveScopeWhere(req);
    if (!scoped.ok) {
      console.warn(`[leaves:getAll] REJECTED ${scoped.status} by=${req.user?.id} companyId=${req.query.companyId}`);
      return res.status(scoped.status).json(scoped.body);
    }
    // Row filters were accepted and silently discarded here, so `?status=Approved`
    // returned every leave request in the workspace. `paginated` below honours
    // them; this aggregate endpoint now does too. ANDed onto the tenant scope, so
    // a filter can only ever narrow what the caller may already see.
    const filters = [];
    if (req.query.status) filters.push({ status: String(req.query.status) });
    if (req.query.leaveType) filters.push({ leaveType: String(req.query.leaveType) });
    if (req.query.department) filters.push({ department: String(req.query.department) });
    const employeeId = idParam(req.query.employeeId);
    if (employeeId) filters.push({ employeeId });
    if (req.query.from) filters.push({ toDate: { gte: String(req.query.from) } });
    if (req.query.to) filters.push({ fromDate: { lte: String(req.query.to) } });

    const where = filters.length ? { AND: [scoped.where, ...filters] } : scoped.where;
    const data = await prisma.leaveRequest.findMany({ where });
    res.json(data);
  } catch (error) {
    console.error('Error fetching', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leaves/paginated — SERVER-SIDE page for the Leave Requests table.
//
// Filters, sorting and paging all execute in the DATABASE, so the browser holds
// one page rather than the whole history. `getAll` above is retained for the
// aggregate consumers (dashboard totals, balance summaries) that genuinely need
// every row; the table no longer uses it.
//
// Sorting is whitelisted, never interpolated: `sort` selects from a fixed map,
// so no caller-supplied string reaches the query builder.
// ─────────────────────────────────────────────────────────────────────────────
const LEAVE_SORTS = {
  latest:   [{ fromDate: 'desc' }, { id: 'desc' }],
  oldest:   [{ fromDate: 'asc' }, { id: 'asc' }],
  employee: [{ employeeName: 'asc' }, { fromDate: 'desc' }],
  type:     [{ leaveType: 'asc' }, { fromDate: 'desc' }],
  status:   [{ status: 'asc' }, { fromDate: 'desc' }],
};
const MAX_LEAVE_LIMIT = 100;

exports.paginated = async (req, res) => {
  const tag = `[leaves:paginated] by=${req.user?.id ?? '?'} (${req.user?.role || 'unknown'})`;
  const startedAt = Date.now();
  try {
    const scoped = leaveScopeWhere(req);
    if (!scoped.ok) {
      console.warn(`${tag} REJECTED ${scoped.status}: ${scoped.body.error}`);
      return res.status(scoped.status).json(scoped.body);
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    // `export=all` lifts the page cap for an explicit export of the CURRENT
    // FILTER — the one sanctioned way to receive more than a page.
    const wantsAll = String(req.query.export || '') === 'all';
    const limit = wantsAll
      ? Math.max(1, Number(req.query.limit) || 5000)
      : Math.min(MAX_LEAVE_LIMIT, Math.max(1, Number(req.query.limit) || 10));

    const and = [scoped.where];
    const search = String(req.query.search || '').trim();
    if (search) {
      and.push({ OR: [
        { employeeName: { contains: search } },
        { department: { contains: search } },
        { leaveType: { contains: search } },
        { reason: { contains: search } },
      ] });
    }
    if (req.query.status) and.push({ status: String(req.query.status) });
    if (req.query.leaveType) and.push({ leaveType: String(req.query.leaveType) });
    if (req.query.department) and.push({ department: String(req.query.department) });
    // Branch lives on the EMPLOYEE (leave rows have no branch column), so it is
    // filtered through the relation rather than a copied string.
    if (req.query.branch) and.push({ employee: { branchLocation: String(req.query.branch) } });
    // Date range overlaps the request, so a leave spanning the window is included
    // even when it neither starts nor ends inside it.
    if (req.query.from) and.push({ toDate: { gte: String(req.query.from) } });
    if (req.query.to) and.push({ fromDate: { lte: String(req.query.to) } });

    const where = { AND: and };
    const orderBy = LEAVE_SORTS[String(req.query.sort || 'latest')] || LEAVE_SORTS.latest;

    const [total, rows] = await Promise.all([
      prisma.leaveRequest.count({ where }),
      prisma.leaveRequest.findMany({
        where,
        orderBy,
        skip: wantsAll ? 0 : (page - 1) * limit,
        take: limit,
        // The table shows the employee's code and branch; including them here
        // avoids the client needing the whole employee roster to render a page.
        include: { employee: { select: { employeeId: true, branchLocation: true, designation: true } } },
      }),
    ]);

    const data = rows.map(r => ({
      ...r,
      employeeCode: r.employee?.employeeId || null,
      branch: r.employee?.branchLocation || null,
      designation: r.employee?.designation || null,
      employee: undefined,
    }));

    console.log(`${tag} page=${page} limit=${limit} returned=${data.length}/${total} in ${Date.now() - startedAt}ms`);
    res.json({ data, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    console.error(`${tag} FAILED after ${Date.now() - startedAt}ms`, error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

/** Distinct filter values in scope, so the dropdowns need no full dataset. */
exports.filterOptions = async (req, res) => {
  try {
    const scoped = leaveScopeWhere(req);
    if (!scoped.ok) return res.status(scoped.status).json(scoped.body);
    const rows = await prisma.leaveRequest.findMany({
      where: scoped.where,
      select: { leaveType: true, status: true, department: true, employee: { select: { branchLocation: true } } },
    });
    const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort();
    res.json({
      leaveTypes: uniq(rows.map(r => r.leaveType)),
      statuses: uniq(rows.map(r => r.status)),
      departments: uniq(rows.map(r => r.department)),
      branches: uniq(rows.map(r => r.employee?.branchLocation)),
    });
  } catch (error) {
    console.error('[leaves:filterOptions] FAILED', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const body = { ...req.body };
    const employeeId = Number(body.employeeId);
    const days = Number(body.days) || 0;
    const year = yearOf(body.fromDate);

    // Tenant guard: the leave must be filed against an employee in the caller's
    // workspace, and companyId is DERIVED from that employee — never trusted from
    // the client body (which could name another tenant). Foreign/unknown → 404.
    const owner = Number.isFinite(employeeId)
      ? await prisma.employee.findUnique({ where: { id: employeeId }, select: { companyId: true, branchId: true, name: true, department: true } })
      : null;
    if (!owner) return res.status(404).json({ error: 'Employee not found.' });
    if (!(await canReachLeave(req, { companyId: owner.companyId, employee: owner }))) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    body.companyId = owner.companyId;
    if (!body.employeeName) body.employeeName = owner.name;
    if (!body.department) body.department = owner.department;
    // appliedOn is a required column with no DB default; default it to today so a
    // client that omits it can't 500 the request.
    if (!body.appliedOn) body.appliedOn = new Date().toISOString().slice(0, 10);
    delete body.allowLWP; // control flag, not a column

    // ── Gender-based eligibility — enforced HERE, not in the dropdown ────────
    // Hiding Maternity Leave from a male employee's form is presentation. This
    // is the rule: a direct POST of { leaveType: 'Maternity Leave' } for a male
    // employee is refused whatever the client did or did not render.
    const eligibility = await leaveEligibility.checkEligibility(employeeId, body.leaveType);
    if (!eligibility.ok) {
      // `success/message` is the contract the leave form reads; `error` is kept
      // because every other endpoint in this app reports failures that way and
      // the shared getApiErrorMessage helper looks for it.
      return res.status(400).json({
        success: false,
        message: eligibility.message,
        error: eligibility.message,
        detail: eligibility.detail,
        code: eligibility.code,
      });
    }

    // Balance validation: CL/PL/SL cannot be requested beyond available balance.
    // LWP and special types (maternity etc.) are always allowed.
    const v = await leaveService.validate(employeeId, body.leaveType, days, year);
    if (!v.ok && !body.allowLWP) {
      return res.status(409).json({ error: v.message, available: v.available, category: v.category });
    }
    body.paidDays = v.paidDays;
    body.lwpDays = v.lwpDays;

    const data = await prisma.leaveRequest.create({ data: body });
    // Notify HR / admins (company-wide) that a leave request needs action.
    try {
      await notify({
        companyId: data.companyId, type: 'leave_request', title: 'New Leave Request',
        message: `${data.employeeName} applied for ${data.leaveType} (${data.days} day${data.days === 1 ? '' : 's'}) from ${data.fromDate}.`,
        priority: 'medium',
      });
    } catch (e) { /* non-fatal */ }
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const patch = { ...req.body };
    // A non-numeric id reached Prisma as the string "undefined" and came back as
    // a 500. It is a bad request, and it should say so. Number.isFinite, not
    // truthiness: idParam passes a non-numeric value through UNCHANGED, so
    // "undefined" is a truthy string that sails past a !leaveId check.
    const leaveId = idParam(id);
    if (!Number.isFinite(leaveId)) return res.status(400).json({ success: false, error: 'A valid leave request id is required.', message: 'A valid leave request id is required.' });
    const existing = await prisma.leaveRequest.findUnique({ where: { id: leaveId } });
    if (!existing) return res.status(404).json({ error: 'Leave request not found' });
    // Tenant guard: a leave request outside the caller's workspace is reported
    // as not found (never approve/reject/edit another tenant's leave by id).
    if (!(await canReachLeave(req, existing))) return res.status(404).json({ error: 'Leave request not found' });

    const month = monthNameOf(existing.fromDate);
    const year = yearOf(existing.fromDate);
    const newStatus = patch.status;

    // ── Eligibility on edit ─────────────────────────────────────────────────
    // A record that predates the policy (or was created before this rule
    // existed) stays VISIBLE for audit — getAll never filters. What it must not
    // do is move forward: no re-dating, no re-assigning, and above all no
    // approval, which is what turns it into paid days.
    //
    // Rejecting or cancelling is always allowed: that is how HR clears an
    // ineligible record, and blocking it would leave it stuck forever.
    const clearing = ['Rejected', 'Cancelled'].includes(newStatus);
    if (!clearing) {
      const targetEmployee = patch.employeeId !== undefined ? patch.employeeId : existing.employeeId;
      const targetType = patch.leaveType !== undefined ? patch.leaveType : existing.leaveType;
      const eligibility = await leaveEligibility.checkEligibility(targetEmployee, targetType);
      if (!eligibility.ok) {
        return res.status(400).json({
          success: false,
          message: eligibility.message,
          error: eligibility.message,
          detail: eligibility.detail,
          code: eligibility.code,
          hint: 'This record can still be rejected or cancelled.',
        });
      }
    }
    const wasApproved = existing.status === 'Approved';
    const actor = req.user || {};

    // ── Transition: → Approved : deduct balance, split LWP, flag payroll ──
    if (newStatus === 'Approved' && !wasApproved) {
      const { paidDays, lwpDays } = await leaveService.deduct(existing.employeeId, existing.leaveType, existing.days, year);
      patch.paidDays = paidDays;
      patch.lwpDays = lwpDays;
      if (!patch.approvedOn) patch.approvedOn = new Date().toISOString().slice(0, 10);
      if (!patch.approvedBy && actor.name) patch.approvedBy = actor.name;
      await markPayrollOutdated(existing.employeeId, month, year);
      if (actor.id) {
        await AuditService.logAudit(actor.id, 'APPROVE_LEAVE', 'Leaves', String(existing.id), {
          employee: existing.employeeName, type: existing.leaveType, days: existing.days,
          paidDays, lwpDays, month, year, by: actor.name, role: actor.role,
        });
      }
    }

    // ── Transition: Approved → Rejected/Cancelled/Pending : restore balance ──
    if (wasApproved && newStatus && ['Rejected', 'Cancelled', 'Pending'].includes(newStatus)) {
      await leaveService.restore(existing.employeeId, existing.leaveType, existing.paidDays, year);
      patch.paidDays = 0;
      patch.lwpDays = 0;
      await markPayrollOutdated(existing.employeeId, month, year);
      if (actor.id) {
        await AuditService.logAudit(actor.id, 'REVERSE_LEAVE', 'Leaves', String(existing.id), {
          employee: existing.employeeName, type: existing.leaveType, restored: existing.paidDays,
          newStatus, by: actor.name, role: actor.role,
        });
      }
    }

    const data = await prisma.leaveRequest.update({ where: { id: leaveId }, data: patch });

    // Notify the employee when their request is approved or rejected.
    if (newStatus && newStatus !== existing.status && ['Approved', 'Rejected'].includes(newStatus)) {
      try {
        const empUserId = await userIdForEmployee(existing.employeeId);
        await notify({
          userId: empUserId, companyId: existing.companyId, type: newStatus === 'Approved' ? 'leave_approved' : 'leave_rejected',
          title: newStatus === 'Approved' ? 'Leave Approved' : 'Leave Rejected',
          message: `Your ${existing.leaveType} leave (${existing.days} day${existing.days === 1 ? '' : 's'}) from ${existing.fromDate} was ${newStatus.toLowerCase()}${actor.name ? ` by ${actor.name}` : ''}.`,
          priority: newStatus === 'Rejected' ? 'high' : 'medium',
        });
      } catch (e) { /* non-fatal */ }
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
    const leaveId = idParam(id);
    if (!Number.isFinite(leaveId)) return res.status(400).json({ success: false, error: 'A valid leave request id is required.', message: 'A valid leave request id is required.' });
    const existing = await prisma.leaveRequest.findUnique({ where: { id: leaveId } });
    // Tenant guard: refuse to delete (and silently restore the balance of)
    // another tenant's leave. Foreign id → not found.
    if (existing && !(await canReachLeave(req, existing))) return res.status(404).json({ error: 'Leave request not found' });
    // Restore balance if a still-approved leave is deleted.
    if (existing && existing.status === 'Approved' && existing.paidDays > 0) {
      await leaveService.restore(existing.employeeId, existing.leaveType, existing.paidDays, yearOf(existing.fromDate));
    }
    await prisma.leaveRequest.delete({ where: { id: leaveId } });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
