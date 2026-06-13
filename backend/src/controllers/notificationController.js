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

const allowedIdsFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);

function scopeWhere(req) {
  const role = req.user?.role;
  if (role === 'Super Admin') {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    return companyId ? { OR: [{ companyId }, { userId: req.user.id }] } : {};
  }
  const allowed = allowedIdsFor(req);
  return {
    OR: [
      { userId: req.user.id },
      { AND: [{ userId: null }, { OR: [{ companyId: { in: allowed } }, { branchId: { in: allowed } }, { companyId: null }] }] },
    ],
  };
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

// Mark one notification read/unread.
exports.update = async (req, res) => {
  try {
    const id = idParam(req.params.id);
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
    const result = await prisma.notification.deleteMany({ where: { id: { in: ids } } });
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
