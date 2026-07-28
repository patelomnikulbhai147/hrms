/**
 * Task Manager — assign tasks and track completion.
 *
 * Role scoping (enforced on the BACKEND, never client-only):
 *   Super Admin   → all tasks (optionally narrowed by ?companyId / x-workspace-id)
 *   Company Head  → tasks within their company (allowedIds)
 *   HR / Finance  → tasks within their assigned branch/company (allowedIds)
 *   Employee      → ONLY tasks they created or that are assigned to them; may not
 *                   create/assign administrative tasks.
 *
 * Standalone tables (Task / TaskComment) — no existing relationship is touched.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const AuditService = require('../services/auditService');
const { notify, notifyMany } = require('../services/notificationService');

// Company-wide grants PLUS the branches the user may enter — a branch id never
// appears in accessibleCompanyIds, so a company-only list refused every branch
// workspace with "outside your workspace".
const { companyScopeFor } = require('../utils/workspaceScope');
const { grantedBranchIds } = require('../utils/companyScope');
const allowedIdsFor = (req) => [...new Set([...companyScopeFor(req), ...grantedBranchIds(req)])];

const asArray = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]));
const idStr = (v) => String(v);

// ── Status workflow ──────────────────────────────────────────────────────────
// "Pending" no longer exists and "Overdue" is never STORED — it is derived by
// the UI from (today > dueDate AND status is neither Completed nor Cancelled).
// Anything else that arrives (legacy clients, old rows) collapses to In Progress.
const TASK_STATUSES = ['In Progress', 'Completed', 'Cancelled'];
const DEFAULT_TASK_STATUS = 'In Progress';
const normalizeStatus = (s) => (TASK_STATUSES.includes(String(s)) ? String(s) : DEFAULT_TASK_STATUS);

// ── Branch scope ─────────────────────────────────────────────────────────────
// Company ids and Branch ids come from ONE shared sequence, so a workspace id is
// resolved against the Branch table FIRST — a branch user's `companyId` IS a
// Branch id. Enforced SERVER-SIDE (the form is never trusted):
//   • Branch user   → the task is pinned to THEIR branch; any other branch = 403.
//   • Company user  → may pick any branch of their own company; a foreign branch
//                     (or another company's) = 403.
//   • Super Admin   → may pick any branch, but it must belong to the company the
//                     task is being created for.
const workspaceOf = async (id) => {
  if (id == null) return null;
  const b = await prisma.branch.findUnique({
    where: { id }, select: { id: true, companyId: true, branchName: true, status: true, isArchived: true },
  });
  if (b) {
    return {
      id: b.id, name: b.branchName, isBranch: true, parentCompanyId: b.companyId,
      active: !b.isArchived && !['Archived', 'Inactive'].includes(String(b.status)),
    };
  }
  const c = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true } });
  return c ? { id: c.id, name: c.name, isBranch: false, parentCompanyId: null, active: true } : null;
};

/**
 * @returns {Promise<{branchId:number|null}|{error:string}>}
 */
const resolveBranchScope = async (req, requestedBranchId, targetCompanyId) => {
  const role = req.user?.role;
  const mine = role === 'Super Admin' ? null : await workspaceOf(req.user?.companyId);

  // Branch user: the branch is implicit and immutable.
  if (mine && mine.isBranch) {
    if (requestedBranchId != null && requestedBranchId !== mine.id) {
      return { error: 'You can only create tasks for your own branch.' };
    }
    return { branchId: mine.id };
  }

  if (requestedBranchId == null) return { branchId: null };

  const branch = await workspaceOf(requestedBranchId);
  if (!branch || !branch.isBranch) {
    return { error: 'The selected branch does not exist.' };
  }
  if (!branch.active) {
    return { error: 'That branch is no longer active.' };
  }
  // The branch must roll up to the company the task is being created for.
  // (Super Admin may pass a branch as the target — resolve it to its parent.)
  let owner = mine ? mine.id : null;
  if (!mine && targetCompanyId != null) {
    const target = await workspaceOf(targetCompanyId);
    owner = target ? (target.parentCompanyId || target.id) : null;
  }
  if (owner != null && branch.parentCompanyId !== owner) {
    return { error: 'You can only assign tasks to branches of your own company.' };
  }
  return { branchId: branch.id };
};

// ── List tasks the caller is allowed to see ──────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const role = req.user?.role;
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let where = {};

    if (role !== 'Super Admin') {
      const allowed = allowedIdsFor(req);
      where.OR = [
        { companyId: { in: allowed } },
        { branchId: { in: allowed } },
      ];
    } else if (companyId) {
      where.OR = [{ companyId }, { branchId: companyId }];
    }

    let tasks = await prisma.task.findMany({ where, orderBy: { createdAt: 'desc' } });

    // Employees only ever see tasks they own or are assigned to — never the
    // whole company's task list.
    if (role === 'Employee') {
      const myUserId = idStr(req.user.id);
      const myEmpId = req.user.employeeId != null ? idStr(req.user.employeeId) : null;
      tasks = tasks.filter(t => {
        const assignees = asArray(t.assigneeIds).map(idStr);
        return idStr(t.createdById) === myUserId
          || assignees.includes(myUserId)
          || (myEmpId && assignees.includes(myEmpId));
      });
    }
    res.json(tasks);
  } catch (e) {
    console.error('task.getAll', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Create a task ────────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    const role = req.user?.role;
    if (role === 'Employee') {
      return res.status(403).json({ error: 'Employees cannot create or assign tasks.' });
    }
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) {
      return res.status(400).json({ error: 'Task title is required.' });
    }

    // Scope the task to the creator's workspace (Super Admin may target any).
    let companyId = idParam(b.companyId || req.headers['x-workspace-id']);
    if (role !== 'Super Admin') {
      const allowed = allowedIdsFor(req);
      if (companyId && !allowed.includes(companyId)) {
        return res.status(403).json({ error: 'You cannot create tasks outside your workspace.' });
      }
      if (!companyId) companyId = req.user.companyId;
    }

    // Branch scope is decided by the SERVER, not by whatever the form posted.
    const scope = await resolveBranchScope(req, idParam(b.branchId) ?? null, companyId);
    if (scope.error) return res.status(403).json({ error: scope.error });
    const branchId = scope.branchId;

    const task = await prisma.task.create({
      data: {
        title: String(b.title).trim(),
        description: b.description || null,
        priority: b.priority || 'Medium',
        status: normalizeStatus(b.status),
        startDate: b.startDate || null,
        dueDate: b.dueDate || null,
        startTime: b.startTime || null,
        endTime: b.endTime || null,
        companyId: companyId ?? null,
        branchId: branchId ?? null,
        createdById: req.user.id,
        createdByName: req.user.name || req.user.email || '',
        createdByRole: role,
        assignmentType: b.assignmentType || 'user',
        assigneeIds: asArray(b.assigneeIds),
        assigneeNames: asArray(b.assigneeNames),
        department: b.department || null,
        targetRole: b.targetRole || null,
        mentions: asArray(b.mentions),
        attachments: asArray(b.attachments),
      },
    });

    // Instant notification: target each assigned user directly (bell + history),
    // plus a company-wide entry so admins see workspace activity.
    try {
      const title = 'New Task Assigned';
      const msg = `Task: "${task.title}" · Assigned by ${task.createdByName}${task.dueDate ? ` · Due ${task.dueDate}` : ''}`;
      const prio = (task.priority || 'medium').toLowerCase();
      const assigneeUserIds = asArray(b.assigneeIds);
      if (assigneeUserIds.length) {
        await notifyMany(assigneeUserIds, { companyId, branchId, type: 'task_assigned', title, message: msg, priority: prio });
      } else {
        await notify({ companyId, type: 'task_assigned', title, message: msg, priority: prio });
      }
    } catch (ne) { console.warn('task notification skipped:', ne.message); }

    if (req.user?.id) await AuditService.logAudit(req.user.id, 'CREATE_TASK', 'Tasks', String(task.id), { title: task.title, assignees: asArray(b.assigneeNames), by: req.user.name });
    res.status(201).json(task);
  } catch (e) {
    console.error('task.create', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Update a task (status / fields) ──────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Task not found.' });

    const role = req.user?.role;
    if (role !== 'Super Admin') {
      const allowed = allowedIdsFor(req);
      const inScope = allowed.includes(existing.companyId) || allowed.includes(existing.branchId);
      const isOwnerOrAssignee = String(existing.createdById) === String(req.user.id)
        || asArray(existing.assigneeIds).map(idStr).includes(idStr(req.user.id));
      // Employees may only update tasks assigned to them (e.g. mark progress).
      if (role === 'Employee' ? !isOwnerOrAssignee : !inScope) {
        return res.status(403).json({ error: 'You do not have access to this task.' });
      }
    }

    const fields = ['title', 'description', 'priority', 'status', 'startDate', 'dueDate', 'startTime', 'endTime', 'department', 'targetRole'];
    const data = {};
    for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
    if (data.status !== undefined) data.status = normalizeStatus(data.status);
    for (const jf of ['assigneeIds', 'assigneeNames', 'mentions', 'attachments']) {
      if (req.body[jf] !== undefined) data[jf] = asArray(req.body[jf]);
    }

    const task = await prisma.task.update({ where: { id }, data });
    const newStatus = data.status;
    if (newStatus && newStatus !== existing.status) {
      await prisma.taskComment.create({ data: { taskId: id, userId: req.user.id, userName: req.user.name || '', message: `Status changed: ${existing.status} → ${newStatus}`, isStatus: true } });
      if (req.user?.id) await AuditService.logAudit(req.user.id, 'UPDATE_TASK_STATUS', 'Tasks', String(id), { from: existing.status, to: newStatus, by: req.user.name });
      // Notify the creator AND every assignee that the status changed.
      try {
        const targets = [existing.createdById, ...asArray(existing.assigneeIds)];
        await notifyMany(targets, {
          companyId: existing.companyId, branchId: existing.branchId, type: 'task_status',
          title: 'Task Status Updated',
          message: `"${existing.title}" moved to ${newStatus} by ${req.user.name || 'a user'}.`,
          priority: 'low',
        });
      } catch (ne) { console.warn('task status notification skipped:', ne.message); }
    }
    res.json(task);
  } catch (e) {
    console.error('task.update', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Delete a task ────────────────────────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Task not found.' });
    const role = req.user?.role;
    if (role === 'Employee') return res.status(403).json({ error: 'Employees cannot delete tasks.' });
    if (role !== 'Super Admin') {
      const allowed = allowedIdsFor(req);
      if (!(allowed.includes(existing.companyId) || allowed.includes(existing.branchId))) {
        return res.status(403).json({ error: 'You do not have access to this task.' });
      }
    }
    await prisma.taskComment.deleteMany({ where: { taskId: id } });
    await prisma.task.delete({ where: { id } });
    if (req.user?.id) await AuditService.logAudit(req.user.id, 'DELETE_TASK', 'Tasks', String(id), { title: existing.title, by: req.user.name });
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('task.remove', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Comments ─────────────────────────────────────────────────────────────────
exports.getComments = async (req, res) => {
  try {
    const taskId = idParam(req.params.id);
    const comments = await prisma.taskComment.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' } });
    res.json(comments);
  } catch (e) {
    console.error('task.getComments', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.addComment = async (req, res) => {
  try {
    const taskId = idParam(req.params.id);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    if (!req.body.message || !String(req.body.message).trim()) {
      return res.status(400).json({ error: 'Comment message is required.' });
    }
    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        userId: req.user?.id ?? null,
        userName: req.user?.name || req.user?.email || '',
        message: String(req.body.message).trim(),
        parentId: idParam(req.body.parentId) ?? null,
      },
    });
    res.status(201).json(comment);
  } catch (e) {
    console.error('task.addComment', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
