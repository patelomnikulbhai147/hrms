const prisma = require('../config/prisma');

// GET /api/audit  — global activity log (who / what / when), newest first.
// Optional filters: ?module=Employee  &  ?limit=200
exports.getAll = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const where = {};
    if (req.query.module) where.module = req.query.module;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    res.json(
      logs.map((l) => ({
        id: l.id,
        action: l.action,
        module: l.module,
        targetId: l.targetId,
        details: l.details,
        createdAt: l.createdAt,
        actorName: (l.user && (l.user.name || l.user.email)) || 'System',
        actorRole: (l.user && l.user.role) || '',
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
