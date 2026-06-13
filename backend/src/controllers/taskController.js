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

const allowedIdsFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);

const asArray = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]));
const idStr = (v) => String(v);

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

    const task = await prisma.task.create({
      data: {
        title: String(b.title).trim(),
        description: b.description || null,
        priority: b.priority || 'Medium',
        status: b.status || 'Pending',
        startDate: b.startDate || null,
        dueDate: b.dueDate || null,
        startTime: b.startTime || null,
        endTime: b.endTime || null,
        companyId: companyId ?? null,
        branchId: idParam(b.branchId) ?? null,
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
        await notifyMany(assigneeUserIds, { companyId, branchId: idParam(b.branchId), type: 'task_assigned', title, message: msg, priority: prio });
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
    for (const jf of ['assigneeIds', 'assigneeNames', 'mentions', 'attachments']) {
      if (req.body[jf] !== undefined) data[jf] = asArray(req.body[jf]);
    }

    const task = await prisma.task.update({ where: { id }, data });
    if (req.body.status && req.body.status !== existing.status) {
      await prisma.taskComment.create({ data: { taskId: id, userId: req.user.id, userName: req.user.name || '', message: `Status changed: ${existing.status} → ${req.body.status}`, isStatus: true } });
      if (req.user?.id) await AuditService.logAudit(req.user.id, 'UPDATE_TASK_STATUS', 'Tasks', String(id), { from: existing.status, to: req.body.status, by: req.user.name });
      // Notify the creator AND every assignee that the status changed.
      try {
        const targets = [existing.createdById, ...asArray(existing.assigneeIds)];
        await notifyMany(targets, {
          companyId: existing.companyId, branchId: existing.branchId, type: 'task_status',
          title: 'Task Status Updated',
          message: `"${existing.title}" moved to ${req.body.status} by ${req.user.name || 'a user'}.`,
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
