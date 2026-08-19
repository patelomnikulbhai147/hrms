/**
 * Notifications — persisted, role/workspace-scoped, with read/clear actions.
 *
 * Visibility for a request:
 *   Super Admin → everything (optionally narrowed by ?companyId)
 *   others      → notifications targeted at THEM (userId), plus company/branch-wide
 *                 notifications (userId null) for a company/branch they can access.
 *
 * The PK is an Int, so ids from the URL/body are always coerced (the previous
 * version compared a string id to an Int column and silently failed).
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

// Numbers. accessibleCompanyIds holds STRINGS, so the old inline spread produced
// [1, "1", "2", "11"]: `includes(2)` was false and Prisma `in` filters compared
// strings to an Int column. See utils/companyScope.js.
const { grantedCompanyIds, canReachCompany } = require('../utils/companyScope');
const { ACTIVE_EMPLOYEE_WHERE } = require('../utils/employeeStatus');
const allowedIdsFor = (req) => grantedCompanyIds(req);

function scopeWhere(req) {
  const role = req.user?.role;
  if (role === 'Super Admin') {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    return companyId ? { OR: [{ companyId }, { userId: req.user.id }] } : {};
  }
  const allowed = allowedIdsFor(req);
  return {
    OR: [
      // Addressed to me personally.
      { userId: req.user.id },
      // Audience-wide. A row is "global" only when it names NEITHER a company nor
      // a branch — the previous `{ companyId: null }` clause ignored branchId, so
      // a branch-targeted broadcast (companyId null, branchId set) would have been
      // delivered to every user in every tenant.
      {
        AND: [
          { userId: null },
          {
            OR: [
              { branchId: { in: allowed } },
              { AND: [{ branchId: null }, { companyId: { in: allowed } }] },
              { AND: [{ branchId: null }, { companyId: null }] },
            ],
          },
        ],
      },
    ],
  };
}

// Can this caller see/act on this specific row? Used to stop one tenant marking
// read or deleting another tenant's notification by guessing its (sequential) id.
async function assertOwned(req, id) {
  const row = await prisma.notification.findFirst({ where: { AND: [{ id }, scopeWhere(req)] } });
  return row;
}

exports.getAll = async (req, res) => {
  try {
    const take = Math.min(200, Number(req.query.limit) || 100);
    const data = await prisma.notification.findMany({
      where: scopeWhere(req),
      orderBy: { createdAt: 'desc' },
      take,
    });
    res.json(data);
  } catch (error) {
    console.error('notif.getAll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const b = req.body || {};
    const companyId = idParam(b.companyId) ?? null;
    const branchId = idParam(b.branchId) ?? null;
    const userId = idParam(b.userId) ?? null;

    // Tenant guard. Legitimate internal notifications are created through
    // services/notificationService.js (notify/notifyMany), never this HTTP handler,
    // which spread the body verbatim and so let ANY authenticated caller inject
    // into another tenant's bell by posting a foreign companyId/branchId/userId.
    // Super Admin (canReachCompany returns true) is unaffected.
    if (!req.user || req.user.role !== 'Super Admin') {
      // A company/branch-addressed row must land in a workspace the caller reaches.
      if (companyId != null && !canReachCompany(req, companyId)) {
        return res.status(403).json({ error: 'You do not have access to this workspace.' });
      }
      if (branchId != null && !canReachCompany(req, branchId)) {
        return res.status(403).json({ error: 'You do not have access to this workspace.' });
      }
      // A user-addressed row is delivered by userId regardless of companyId, so the
      // recipient MUST belong to a workspace the caller can reach — otherwise the
      // notification surfaces in a foreign user's bell.
      if (userId != null) {
        const target = await prisma.user.findUnique({
          where: { id: userId },
          select: { companyId: true, branchId: true },
        });
        const reachable = target && (
          (target.companyId != null && canReachCompany(req, target.companyId)) ||
          (target.branchId != null && canReachCompany(req, target.branchId))
        );
        if (!reachable) return res.status(403).json({ error: 'You do not have access to this recipient.' });
      }
      // A row with no company, no branch AND no user is a platform-wide broadcast
      // (scopeWhere delivers company-less/branch-less/user-less rows to everyone).
      // Only Super Admin may post one.
      if (companyId == null && branchId == null && userId == null) {
        return res.status(403).json({ error: 'Only a platform administrator can post a global notification.' });
      }
    }

    const data = await prisma.notification.create({
      data: {
        companyId,
        userId,
        branchId,
        type: b.type || 'system',
        title: b.title || null,
        message: b.message || '',
        priority: b.priority || 'medium',
        read: !!b.read,
        status: b.read ? 'read' : 'unread',
        timestamp: b.timestamp || new Date().toISOString(),
      },
    });
    res.status(201).json(data);
  } catch (error) {
    console.error('notif.create', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// ── Broadcast ────────────────────────────────────────────────────────────────
// POST /api/notifications/broadcast
//   { message, title?, audience, department?, branchId?, employeeId?, priority? }
//
// Every audience fans out to ONE ROW PER RECIPIENT (userId set). The alternative
// — a single shared row with userId null, as the rest of this table uses — cannot
// carry per-user read state: the `read` flag lives on the row, so the first person
// to open a shared broadcast would mark it read for the whole company. Per-recipient
// rows also give each user their own delete, and match how a broadcast is expected
// to behave (delivered to the people who exist when it is sent, like an email).
//
// Recipients are resolved to LOGINS, via User.employeeId for the employee-based
// audiences. Not every employee has a login, so the response always reports the
// true `recipients` count and a dispatch that reached nobody is a 422, never a
// success toast over an empty delivery.
const { resolveBroadcastScope, narrowToBranch, employeeWhere, userWhere } = require('../utils/broadcastScope');
const MAX_MESSAGE = 2000;

// Human labels for the audience values. "all" reads differently depending on who
// is sending — for a branch user it genuinely is only their branch — so the label
// is chosen from the scope rather than hardcoded next to the value.
const audienceLabel = (value, scope) => {
  if (value === 'all') return scope.branchId ? 'All Employees (Current Branch)' : 'All Branches';
  if (value === 'branch') return 'Specific Branch';
  if (value === 'role') return scope.branchId ? 'By Role (Current Branch)' : 'By Role';
  if (value === 'department') return scope.branchId ? 'Specific Department (Current Branch)' : 'Specific Department';
  return scope.branchId ? 'Individual Employee (Current Branch)' : 'Individual Employee';
};

/**
 * GET /api/notifications/broadcast-options
 *
 * The audiences, branches, roles, departments and employees THIS caller may
 * target. The UI renders exactly what comes back and invents nothing, so a
 * branch user is never shown a branch selector in the first place — and because
 * both this and the send endpoint resolve scope through the same helper, the
 * menu can never offer something the send would reject.
 */
exports.broadcastOptions = async (req, res) => {
  try {
    const scope = await resolveBroadcastScope(req, req.query.companyId ?? req.headers['x-workspace-id']);
    if (!scope.ok) return res.status(scope.status).json(scope.body);

    // Employees drive BOTH the employee picker and the department/role lists, so
    // one query feeds all three and they can never disagree about who exists.
    const employees = await prisma.employee.findMany({
      // employeeWhere knows that employees record their branch in `branchId`
      // while carrying the PARENT company in `companyId`; ACTIVE_EMPLOYEE_WHERE
      // is the single source of truth for "still employed", so this picker can
      // never drift from the roster the rest of the app shows.
      where: { ...employeeWhere(scope), ...ACTIVE_EMPLOYEE_WHERE },
      select: { id: true, name: true, employeeId: true, department: true, companyId: true, branchId: true },
      orderBy: { name: 'asc' },
    });

    // Roles are the ones that ACTUALLY EXIST in reach — not a hardcoded list, so
    // a workspace with no Finance user never offers "Finance".
    const users = await prisma.user.findMany({
      where: userWhere(scope),
      select: { role: true },
    });

    const branchName = (id) => scope.branches.find((b) => String(b.id) === String(id))?.name || null;

    res.json({
      scope: {
        isBranchUser: scope.isBranchUser,
        companyId: scope.companyId,
        branchId: scope.branchId,
        branchName: scope.branchName,
      },
      audiences: scope.audiences.map((value) => ({ value, label: audienceLabel(value, scope) })),
      branches: scope.branches,
      roles: [...new Set(users.map((u) => u.role).filter(Boolean))].sort(),
      // Tagged with the branch so the UI can cascade Branch → Department without
      // another round trip.
      departments: [...new Map(
        employees
          .filter((e) => e.department)
          .map((e) => [`${e.branchId || e.companyId}::${e.department}`, {
            name: e.department,
            branchId: e.branchId || (scope.branches.some((b) => b.id === e.companyId) ? e.companyId : null),
          }])
      ).values()].sort((a, b) => a.name.localeCompare(b.name)),
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        code: e.employeeId || null,
        department: e.department || null,
        branchId: e.branchId || (scope.branches.some((b) => b.id === e.companyId) ? e.companyId : null),
        branchName: branchName(e.branchId || e.companyId),
      })),
    });
  } catch (error) {
    console.error('notif.broadcastOptions', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.broadcast = async (req, res) => {
  const tag = `[notif:broadcast] by=${req.user?.id ?? '?'} (${req.user?.role || 'unknown'})`;
  try {
    const b = req.body || {};
    const message = String(b.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required.' });
    if (message.length > MAX_MESSAGE) {
      return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE} characters).` });
    }

    // Scope FIRST, from the database — see utils/broadcastScope.js. Everything
    // below narrows this; nothing below can widen it.
    const scope = await resolveBroadcastScope(req, b.companyId ?? req.headers['x-workspace-id']);
    if (!scope.ok) {
      console.warn(`${tag} REJECTED ${scope.status}: ${scope.body.error}`);
      return res.status(scope.status).json(scope.body);
    }

    const audience = String(b.audience || 'all');
    if (!scope.audiences.includes(audience)) {
      // The branch user reaching for "branch" lands here — including via DevTools
      // or curl, because this check does not consult the UI in any way.
      console.warn(`${tag} REJECTED 403: audience "${audience}" not permitted in this scope`);
      return res.status(403).json({
        error: scope.branchId
          ? 'Branch users can only broadcast within their own branch.'
          : `Audience "${audience}" is not available for your workspace.`,
      });
    }

    // Optional Branch → Department/Employee cascade for company senders. A branch
    // sender's scope is already a single branch, so a posted branchId can only
    // ever re-select that same branch (narrowToBranch rejects anything else).
    let targetIds = scope.scopeIds;
    let targetBranchId = scope.branchId;
    let targetBranchName = scope.branchName;

    if (audience === 'branch' || (b.branchId && audience !== 'all')) {
      const narrowed = narrowToBranch(scope, b.branchId);
      if (!narrowed.ok) {
        console.warn(`${tag} REJECTED ${narrowed.status}: branch ${b.branchId} outside scope [${scope.scopeIds}]`);
        return res.status(narrowed.status).json(narrowed.body);
      }
      targetIds = narrowed.scopeIds;
      targetBranchId = narrowed.branchId;
      targetBranchName = scope.branches.find((x) => x.id === narrowed.branchId)?.name || scope.branchName;
    }

    let userIds = [];
    let label = audienceLabel(audience, scope);
    let targetDepartment = null;
    let targetRole = null;

    // `narrowBranch` is the branch this dispatch is pinned to (null = the whole
    // company). Both where-builders take it, so employees and users are selected
    // by their own storage shape rather than one shared, wrong filter.
    const narrowBranch = audience === 'branch' ? targetBranchId : (b.branchId ? targetBranchId : null);

    if (audience === 'all') {
      const users = await prisma.user.findMany({ where: userWhere(scope, narrowBranch), select: { id: true } });
      userIds = users.map((u) => u.id);
      label = scope.branchId ? `All Staff — ${scope.branchName}` : 'All Staff (all branches)';
    } else if (audience === 'branch') {
      const users = await prisma.user.findMany({ where: userWhere(scope, targetBranchId), select: { id: true } });
      userIds = users.map((u) => u.id);
      label = `Branch — ${targetBranchName || targetBranchId}`;
    } else if (audience === 'role') {
      targetRole = String(b.role || '').trim();
      if (!targetRole) return res.status(400).json({ error: 'Select a role.' });
      const users = await prisma.user.findMany({
        where: { ...userWhere(scope, narrowBranch), role: targetRole },
        select: { id: true },
      });
      userIds = users.map((u) => u.id);
      label = `${targetRole} team${targetBranchName ? ` — ${targetBranchName}` : ''}`;
    } else if (audience === 'department') {
      targetDepartment = String(b.department || '').trim();
      if (!targetDepartment) return res.status(400).json({ error: 'Select a department.' });
      const emps = await prisma.employee.findMany({
        where: { ...employeeWhere(scope, narrowBranch), ...ACTIVE_EMPLOYEE_WHERE, department: targetDepartment },
        select: { id: true },
      });
      userIds = await usersForEmployees(emps.map((e) => e.id));
      label = `Department — ${targetDepartment}${targetBranchName ? ` (${targetBranchName})` : ''}`;
    } else if (audience === 'employee') {
      const empId = idParam(b.employeeId);
      if (!empId) return res.status(400).json({ error: 'Select an employee.' });
      // Re-select the employee THROUGH the scope filter rather than fetching them
      // and then comparing ids by hand: membership is decided by the same query
      // that built the picker, so an employee who is not in scope is simply not
      // found. (Comparing emp.companyId to the scope ids was wrong here — every
      // employee carries the PARENT company id, so a sibling-branch employee
      // would have passed that test.)
      const emp = await prisma.employee.findFirst({
        where: { ...employeeWhere(scope, narrowBranch), id: empId },
        select: { id: true, name: true },
      });
      if (!emp) {
        console.warn(`${tag} REJECTED 403: employee ${empId} outside scope`);
        return res.status(403).json({ error: 'That employee is outside your workspace.' });
      }
      userIds = await usersForEmployees([emp.id]);
      label = emp.name || `Employee ${empId}`;
    }

    userIds = [...new Set(userIds)];
    if (!userIds.length) {
      // Deliberately NOT a 201. Persisting rows nobody can see would show the
      // dispatcher a success toast over a message that reached no one.
      console.warn(`${tag} no recipients for audience=${audience} scope=[${targetIds}]`);
      return res.status(422).json({
        error: 'Nobody in that audience has a login yet, so the message was not sent.',
        code: 'NO_RECIPIENTS',
        recipients: 0,
      });
    }

    const base = {
      type: 'broadcast',
      title: String(b.title || '').trim() || 'Broadcast',
      message,
      priority: b.priority || 'medium',
      read: false,
      status: 'unread',
      timestamp: new Date().toISOString(),
      // Provenance, denormalised onto every delivered row.
      senderId: req.user.id,
      senderName: req.user.name || req.user.email || null,
      senderRole: req.user.role || null,
      senderBranchId: scope.isBranchUser ? scope.branchId : null,
      targetType: audience,
      targetBranchId: targetBranchId ?? null,
      targetBranchName: targetBranchName ?? null,
      targetDepartment,
      targetRole,
    };

    // companyId is the workspace the recipient reads it in: the branch when one
    // was targeted, otherwise the parent company. The bell filters on this.
    const rows = userIds.map((userId) => ({
      ...base,
      companyId: targetBranchId ?? scope.companyId,
      branchId: targetBranchId ?? null,
      userId,
    }));
    const result = await prisma.notification.createMany({ data: rows });

    // Read back what was actually committed, so the caller gets real database ids
    // rather than an optimistic guess, and so a partial write cannot read as full.
    const saved = await prisma.notification.findMany({
      where: { type: 'broadcast', userId: req.user.id, timestamp: base.timestamp },
      orderBy: { id: 'desc' },
    });

    console.log(`${tag} committed audience=${audience} recipients=${result.count} scope=[${targetIds}]`);
    res.status(201).json({
      created: result.count,
      recipients: result.count,
      audience: label,
      // Only what THIS caller should see in their own bell.
      notifications: saved,
    });
  } catch (error) {
    console.error(`${tag} FAILED`, error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// Employees → the user logins attached to them. Kept separate because the link is
// User.employeeId (there is no relation on Employee), so this is the only correct
// direction to traverse it.
async function usersForEmployees(employeeIds) {
  if (!employeeIds.length) return [];
  const users = await prisma.user.findMany({
    where: { employeeId: { in: employeeIds }, status: 'Active' },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// Mark one notification read/unread.
exports.update = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!(await assertOwned(req, id))) return res.status(404).json({ error: 'Notification not found.' });
    const read = req.body.read !== undefined ? !!req.body.read : true;
    const data = await prisma.notification.update({
      where: { id },
      data: { read, status: read ? 'read' : 'unread' },
    });
    res.json(data);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Notification not found.' });
    console.error('notif.update', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// Mark ALL of the caller's notifications read.
exports.markAllRead = async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: scopeWhere(req),
      data: { read: true, status: 'read' },
    });
    res.json({ updated: result.count });
  } catch (error) {
    console.error('notif.markAllRead', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.scopeWhere = scopeWhere;

exports.delete = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!(await assertOwned(req, id))) return res.status(404).json({ error: 'Notification not found.' });
    await prisma.notification.delete({ where: { id } });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Notification not found.' });
    console.error('notif.delete', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// Delete several at once: body { ids: [...] }.
exports.deleteMany = async (req, res) => {
  try {
    const ids = (req.body.ids || []).map(idParam).filter((x) => x != null);
    if (!ids.length) return res.status(400).json({ error: 'No ids supplied.' });
    // Intersect with what the caller can actually see — an unscoped deleteMany
    // let any authenticated user delete any tenant's notifications by id.
    const result = await prisma.notification.deleteMany({
      where: { AND: [{ id: { in: ids } }, scopeWhere(req)] },
    });
    res.json({ deleted: result.count });
  } catch (error) {
    console.error('notif.deleteMany', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// Clear ALL of the caller's notifications.
exports.clearAll = async (req, res) => {
  try {
    const result = await prisma.notification.deleteMany({ where: scopeWhere(req) });
    res.json({ deleted: result.count });
  } catch (error) {
    console.error('notif.clearAll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
