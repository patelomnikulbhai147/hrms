// ─────────────────────────────────────────────────────────────────────────────
// Multi-tenant privacy gate.
//
// The Super Admin is the PLATFORM administrator, NOT the HR administrator of every
// company. Employee PII (profiles, salary, payroll, attendance, leave, documents,
// nominees, …) belongs exclusively to the company. This middleware blocks a Super
// Admin from those APIs UNLESS an active, audited Support Session exists — that is
// the only controlled way into a company's HR environment. Company Head / HR /
// Employee roles are unaffected (their own RBAC + company scope still apply).
//
// Must run AFTER `protect` (which populates req.user).
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');

// The newest still-open session for a Super Admin, auto-expiring stale ones.
async function activeSupportSession(superAdminId) {
  if (!superAdminId) return null;
  const s = await prisma.supportSession.findFirst({
    where: { superAdminId: Number(superAdminId), status: 'active', endedAt: null },
    orderBy: { id: 'desc' },
  });
  if (!s) return null;
  if (s.expiresAt && new Date(s.expiresAt) < new Date()) {
    await prisma.supportSession
      .update({ where: { id: s.id }, data: { status: 'expired', endedAt: new Date() } })
      .catch(() => {});
    return null;
  }
  return s;
}

// Gate factory. `moduleLabel` is used only for the audit-trail entry.
const blockSuperAdminPII = (moduleLabel) => async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized: authentication required.' });

    // Only the platform admin is restricted here; company users pass straight to
    // their own RBAC / tenant-scope checks.
    if (req.user.role !== 'Super Admin') return next();

    const session = await activeSupportSession(req.user.id);
    if (!session) {
      return res.status(403).json({
        error:
          'Multi-tenant privacy: the platform administrator cannot access company HR data directly. Start an audited Support Session to assist this company.',
        code: 'SUPPORT_SESSION_REQUIRED',
      });
    }

    // Audit EVERY state-changing action performed during a support session.
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      prisma.supportSession
        .update({ where: { id: session.id }, data: { actionCount: { increment: 1 } } })
        .catch(() => {});
      prisma.auditLog
        .create({
          data: {
            userId: req.user.id,
            action: `SUPPORT_${req.method}`,
            module: moduleLabel || 'SupportSession',
            targetId: String(session.id),
            details: JSON.stringify({ path: req.originalUrl, companyId: session.companyId }),
          },
        })
        .catch(() => {});
    }
    return next();
  } catch (e) {
    console.error('supportSessionGate error:', e.message);
    return res.status(500).json({ error: 'Server error during the access check.' });
  }
};

module.exports = { blockSuperAdminPII, activeSupportSession };
