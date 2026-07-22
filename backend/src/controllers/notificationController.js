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
    const data = await prisma.notification.create({
      data: {
        companyId: idParam(b.companyId) ?? null,
        userId: idParam(b.userId) ?? null,
        branchId: idParam(b.branchId) ?? null,
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
const BROADCASTERS = ['Super Admin', 'Company Head', 'HR', 'Admin'];
const MAX_MESSAGE = 2000;

exports.broadcast = async (req, res) => {
  const tag = `[notif:broadcast] by=${req.user?.id ?? '?'} (${req.user?.role || 'unknown'})`;
  try {
    if (!BROADCASTERS.includes(req.user?.role)) {
      console.warn(`${tag} REJECTED 403: role may not broadcast`);
      return res.status(403).json({ error: 'You are not allowed to send broadcasts.' });
    }

    const b = req.body || {};
    const message = String(b.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required.' });
    if (message.length > MAX_MESSAGE) {
      return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE} characters).` });
    }

    const audience = String(b.audience || 'all');
    const isSA = req.user.role === 'Super Admin';
    const allowed = allowedIdsFor(req);

    // The workspace being broadcast into. A Super Admin may name any company;
    // everyone else is confined to a workspace they already have access to.
    const companyId = idParam(b.companyId ?? req.headers['x-workspace-id'] ?? req.user.companyId);
    if (!companyId) return res.status(400).json({ error: 'Company context required.' });
    if (!canReachCompany(req, companyId)) {
      console.warn(`${tag} REJECTED 403: company ${companyId} outside grants [${allowed}]`);
      return res.status(403).json({ error: 'Not your workspace.' });
    }

    const base = {
      type: 'broadcast',
      title: String(b.title || '').trim() || 'Broadcast',
      message,
      priority: b.priority || 'medium',
      read: false,
      status: 'unread',
      timestamp: new Date().toISOString(),
    };

    // The workspaces this broadcast may reach: the SELECTED company plus its own
    // branches — NOT everything the sender happens to have access to. A Company
    // Head with grants over several companies broadcasting "All Staff" into one
    // of them must not spray the others. Branch ids are read from the Branch
    // table rather than inferred, because company and branch ids share a single
    // sequence and cannot be told apart by value.
    //
    // Access to `companyId` was already established above; a branch that the
    // Branch table says belongs to it is therefore in scope too, whether or not
    // the sender's grant list happens to enumerate that branch separately (it
    // usually does not — grants list companies, and branch staff carry the branch
    // id as their companyId).
    const ownBranches = (await prisma.branch.findMany({ where: { companyId }, select: { id: true } })).map((x) => x.id);
    const scope = [companyId, ...ownBranches];
    let userIds = [];
    let label = 'All Staff';
    let branchId = null;

    if (audience === 'all') {
      const users = await prisma.user.findMany({
        where: { companyId: { in: scope }, status: 'Active' },
        select: { id: true },
      });
      userIds = users.map((u) => u.id);
    } else if (audience === 'branch') {
      branchId = idParam(b.branchId);
      if (!branchId) return res.status(400).json({ error: 'Select a branch.' });
      if (!canReachCompany(req, branchId)) return res.status(403).json({ error: 'Not your branch.' });
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      // A branch member is either a user whose workspace IS the branch, or one
      // explicitly scoped to it via User.branchId.
      const users = await prisma.user.findMany({
        where: { status: 'Active', OR: [{ companyId: branchId }, { branchId }] },
        select: { id: true },
      });
      userIds = users.map((u) => u.id);
      label = `Branch — ${branch?.branchName || branchId}`;
    } else if (audience === 'role') {
      const target = String(b.role || '').trim();
      if (!target) return res.status(400).json({ error: 'Select a role.' });
      const users = await prisma.user.findMany({
        where: { role: target, companyId: { in: scope }, status: 'Active' },
        select: { id: true },
      });
      userIds = users.map((u) => u.id);
      label = `${target} team`;
    } else if (audience === 'department') {
      const dept = String(b.department || '').trim();
      if (!dept) return res.status(400).json({ error: 'Select a department.' });
      const emps = await prisma.employee.findMany({
        where: { department: dept, companyId: { in: scope } },
        select: { id: true },
      });
      userIds = await usersForEmployees(emps.map((e) => e.id));
      label = `Department — ${dept}`;
    } else if (audience === 'employee') {
      const empId = idParam(b.employeeId);
      if (!empId) return res.status(400).json({ error: 'Select an employee.' });
      const emp = await prisma.employee.findUnique({ where: { id: empId }, select: { id: true, companyId: true, name: true } });
      if (!emp) return res.status(404).json({ error: 'Employee not found.' });
      if (!canReachCompany(req, emp.companyId)) return res.status(403).json({ error: 'Not your employee.' });
      userIds = await usersForEmployees([emp.id]);
      label = emp.name || `Employee ${empId}`;
    } else {
      return res.status(400).json({ error: `Unknown audience "${audience}".` });
    }

    userIds = [...new Set(userIds)];
    if (!userIds.length) {
      // Deliberately NOT a 201. Persisting rows nobody can see would show the
      // dispatcher a success toast over a message that reached no one.
      console.warn(`${tag} no recipients for audience=${audience} company=${companyId}`);
      return res.status(422).json({
        error: 'Nobody in that audience has a login yet, so the message was not sent.',
        code: 'NO_RECIPIENTS',
        recipients: 0,
      });
    }

    const rows = userIds.map((userId) => ({ ...base, companyId, branchId, userId }));
    const result = await prisma.notification.createMany({ data: rows });

    // Read back what was actually committed, so the caller gets real database ids
    // rather than an optimistic guess, and so a partial write cannot read as full.
    const saved = await prisma.notification.findMany({
      where: { type: 'broadcast', companyId, timestamp: base.timestamp },
      orderBy: { id: 'desc' },
    });

    console.log(`${tag} committed audience=${audience} recipients=${result.count} company=${companyId}`);
    res.status(201).json({
      created: result.count,
      recipients: result.count,
      audience: label,
      // Only what THIS caller should see in their own bell.
      notifications: saved.filter((n) => n.userId === req.user.id),
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
