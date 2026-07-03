// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppRetryService (Phase 5) — re-sends ONLY transient failures through the
// existing Meta client. It does not change the queue/automation/Meta architecture:
// it reuses metaCloudClient.sendText with the credentials + recipient + rendered
// message already stored on the failed delivery-log row.
//
// Retry policy is configurable via env:
//   WHATSAPP_RETRY_MAX        (default 3)  — max attempts per message
//   transient set / permanent set are fixed to Meta's documented codes.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../../config/prisma');
const settingsService = require('./whatsappSettingsService');
const meta = require('./metaCloudClient');
const requestLog = require('./whatsappRequestLogService');

const MAX_ATTEMPTS = Number(process.env.WHATSAPP_RETRY_MAX) || 3;

// Meta error codes that are SAFE to retry (temporary). Everything else is permanent.
const TRANSIENT_CODES = new Set(['4', '80007', '130429', '131048', '131056', '500', '503', '1', '368']);
// Explicitly NEVER retry these (kept for clarity / classification output).
const PERMANENT_CODES = new Set(['131030', '131026', '131047', '131051', '100', '803', '190', '200', '10', '131008', '131009', '132000', '132001', '132005', '132007', '132012', '132015', '132016', '132068', '132069']);

// Classify a failed log → 'transient' | 'permanent'.
const classify = (log) => {
  const code = log.errorCode != null ? String(log.errorCode) : '';
  const http = log.httpStatus;
  if (code && PERMANENT_CODES.has(code)) return 'permanent';
  if (code && TRANSIENT_CODES.has(code)) return 'transient';
  if (http === 429 || (typeof http === 'number' && http >= 500)) return 'transient';
  // Network/timeouts have no Meta code and no http status → transient.
  if (!code && (http == null)) return 'transient';
  return 'permanent';
};

const policy = () => ({
  maxAttempts: MAX_ATTEMPTS,
  retryOn: ['Network timeout', 'HTTP 429 (rate limit)', 'HTTP 5xx', ...Array.from(TRANSIENT_CODES).map((c) => `Meta #${c}`)],
  neverRetry: ['Invalid number (#131030/#131026)', 'Re-engagement (#131047)', 'Invalid template (#132xxx)', 'Auth/permission (#190/#10)'],
});

// Retry all eligible (transient) failed messages for a company. Returns a summary.
const retryFailed = async (companyId, { logId = null } = {}) => {
  const s = await settingsService.getDecrypted(companyId);
  if (!s.phoneNumberId || !s.permanentAccessToken) return { ok: false, message: 'Meta credentials not configured.', retried: 0, succeeded: 0, skipped: 0 };

  const where = { companyId, status: 'Failed' };
  if (logId) where.id = Number(logId);
  const failed = await prisma.whatsAppDeliveryLog.findMany({ where, orderBy: { id: 'desc' }, take: 200 });

  let retried = 0, succeeded = 0, skipped = 0;
  const detail = [];
  for (const log of failed) {
    if (classify(log) !== 'transient') { skipped++; detail.push({ id: log.id, skipped: 'permanent', code: log.errorCode }); continue; }
    // Cap attempts using the linked queue row (the attempts field exists for this).
    let q = null;
    if (log.queueId) q = await prisma.whatsAppQueue.findUnique({ where: { id: log.queueId } }).catch(() => null);
    if (q && (q.attempts || 0) >= MAX_ATTEMPTS) { skipped++; detail.push({ id: log.id, skipped: 'max-attempts' }); continue; }

    const to = log.actualSentNumber || log.originalNumber;
    const body = log.messagePreview;
    if (!to || !body) { skipped++; detail.push({ id: log.id, skipped: 'missing-recipient-or-body' }); continue; }

    retried++;
    const result = await meta.sendText({ phoneNumberId: s.phoneNumberId, accessToken: s.permanentAccessToken, to, body });
    if (result.request) await requestLog.record({ companyId, ...result.request });
    if (q) await prisma.whatsAppQueue.update({ where: { id: q.id }, data: { attempts: (q.attempts || 0) + 1 } }).catch(() => {});

    if (result.ok) {
      succeeded++;
      await prisma.whatsAppDeliveryLog.update({ where: { id: log.id }, data: { status: 'Sent', metaStatus: 'Sent', sentAt: new Date(), metaMessageId: result.messageId, errorMessage: null, errorCode: null, failureReason: null, httpStatus: result.httpStatus } });
      detail.push({ id: log.id, retried: true, ok: true, wamid: result.messageId });
    } else {
      await prisma.whatsAppDeliveryLog.update({ where: { id: log.id }, data: { errorMessage: result.message, errorCode: result.errorCode != null ? String(result.errorCode) : log.errorCode, httpStatus: result.httpStatus, failureReason: result.message } });
      detail.push({ id: log.id, retried: true, ok: false, code: result.errorCode });
    }
  }
  return { ok: true, retried, succeeded, skipped, detail };
};

module.exports = { classify, policy, retryFailed, MAX_ATTEMPTS, TRANSIENT_CODES, PERMANENT_CODES };
