// ─────────────────────────────────────────────────────────────────────────────
// whatsappRequestLogService — Phase 2.5 internal API request history.
//
// Records one row per Meta Cloud API call (connection test / send). Operational
// metadata ONLY — never the access token, verify token, or message body.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../../config/prisma');

// Redact any access_token query param that might appear in an endpoint string,
// so a token can never leak into the history even by accident.
const safeEndpoint = (url) => String(url || '').replace(/access_token=[^&]*/gi, 'access_token=***');

const record = async ({ companyId, operation, endpoint, method, httpStatus, ok, metaMessageId = null, metaErrorCode = null, durationMs = null }) => {
  try {
    return await prisma.whatsAppRequestLog.create({
      data: {
        companyId,
        operation: operation || null,
        endpoint: safeEndpoint(endpoint),
        method: method || null,
        httpStatus: httpStatus ?? null,
        ok: Boolean(ok),
        metaMessageId,
        metaErrorCode: metaErrorCode != null ? String(metaErrorCode) : null,
        durationMs: durationMs ?? null,
      },
    });
  } catch {
    return null; // history is best-effort; never break the operation
  }
};

const list = async (companyId, take = 100) =>
  prisma.whatsAppRequestLog.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take });

module.exports = { record, list, safeEndpoint };
