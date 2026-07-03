// ─────────────────────────────────────────────────────────────────────────────
// Support Sessions — the only audited way a Super Admin may enter a company's HR
// environment for support. Every session records who/which company/why/when and
// every action taken during it. Super Admin only (gated at the route layer).
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { activeSupportSession } = require('../middleware/supportSessionGate');

const SESSION_MAX_MINUTES = Number(process.env.SUPPORT_SESSION_MINUTES) || 60;

const clientIp = (req) =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;

function sendError(res, e, label) {
  console.error(label, e);
  if (e && e.code === 'P2025') return res.status(404).json({ error: 'Support session not found.' });
  return res.status(500).json({ error: (e && e.message) || 'Server error.' });
}

// GET /api/support-sessions/active — the caller's current open session (or null).
exports.getActive = async (req, res) => {
  try {
    const session = await activeSupportSession(req.user.id);
    res.json(session || null);
  } catch (e) { sendError(res, e, 'supportSession.getActive'); }
};

// POST /api/support-sessions — start a session. Body: { companyId, reason, ticketNumber? }
exports.startSession = async (req, res) => {
  try {
    const companyId = idParam(req.body.companyId);
    const reason = (req.body.reason || '').trim();
    const ticketNumber = (req.body.ticketNumber || '').trim() || null;

    if (!companyId) return res.status(400).json({ error: 'A company is required to start a support session.' });
    if (!reason) return res.status(400).json({ error: 'A reason is required to start a support session.' });

    const company = await prisma.company.findUnique({ where: { id: companyId } }).catch(() => null);
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    // Close any prior open session for this admin (one active session at a time).
    await prisma.supportSession.updateMany({
      where: { superAdminId: Number(req.user.id), status: 'active', endedAt: null },
      data: { status: 'ended', endedAt: new Date() },
    });

    const expiresAt = new Date(Date.now() + SESSION_MAX_MINUTES * 60 * 1000);
    const session = await prisma.supportSession.create({
      data: {
        companyId,
        companyName: company.name || null,
        superAdminId: Number(req.user.id),
        superAdminName: req.user.name || req.user.email || null,
        reason,
        ticketNumber,
        status: 'active',
        expiresAt,
        ipAddress: clientIp(req),
        userAgent: req.headers['user-agent'] || null,
      },
    });

    // Audit the session start.
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'SUPPORT_SESSION_START',
        module: 'SupportSession',
        targetId: String(company.id),
        details: JSON.stringify({ sessionId: session.id, company: company.name, reason, ticketNumber }),
      },
    }).catch(() => {});

    res.status(201).json(session);
  } catch (e) { sendError(res, e, 'supportSession.startSession'); }
};

// POST /api/support-sessions/end — end the caller's active session (or one by id).
exports.endSession = async (req, res) => {
  try {
    let session;
    const id = idParam(req.body.id || req.params.id);
    if (id) {
      session = await prisma.supportSession.findUnique({ where: { id } });
      if (session && session.superAdminId !== Number(req.user.id)) {
        return res.status(403).json({ error: 'You can only end your own support session.' });
      }
    } else {
      session = await activeSupportSession(req.user.id);
    }
    if (!session) return res.json({ message: 'No active support session.' });

    const ended = await prisma.supportSession.update({
      where: { id: session.id },
      data: { status: 'ended', endedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'SUPPORT_SESSION_END',
        module: 'SupportSession',
        targetId: String(session.companyId),
        details: JSON.stringify({ sessionId: session.id, actionCount: ended.actionCount }),
      },
    }).catch(() => {});

    res.json(ended);
  } catch (e) { sendError(res, e, 'supportSession.endSession'); }
};

// GET /api/support-sessions — audit history (optionally ?companyId=).
exports.listSessions = async (req, res) => {
  try {
    const where = {};
    const companyId = idParam(req.query.companyId);
    if (companyId) where.companyId = companyId;
    const sessions = await prisma.supportSession.findMany({
      where,
      orderBy: { id: 'desc' },
      take: Math.min(Number(req.query.limit) || 100, 500),
    });
    res.json(sessions);
  } catch (e) { sendError(res, e, 'supportSession.listSessions'); }
};
