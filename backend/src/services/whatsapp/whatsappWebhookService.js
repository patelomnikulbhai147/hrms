// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppWebhookService (Phase 5) — ingests Meta WhatsApp Cloud status webhooks
// and drives the delivery lifecycle:  Sent → Delivered → Read  (or → Failed).
//
// It ONLY extends the platform: it updates existing delivery-log rows (by wamid)
// and records raw events in the additive whatsapp_webhook_events table. It never
// sends messages and never touches the queue/automation/Meta-send architecture.
//
// Idempotent: Meta delivers at-least-once, so each (wamid,status) event is unique
// in the DB; a repeat is silently ignored. Status is only ever upgraded, never
// downgraded, so out-of-order events can't regress a message's state.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../../config/prisma');
const { decrypt } = require('../../utils/secretCrypto');

// Lifecycle rank — guards against downgrades when events arrive out of order.
const RANK = { Pending: 0, Queued: 0, Simulated: 0, Processing: 1, Sent: 2, Delivered: 3, Read: 4, Failed: 5 };
const META_TO_STATUS = { sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Failed' };
const TS_FIELD = { Sent: 'sentAt', Delivered: 'deliveredAt', Read: 'readAt', Failed: 'failedAt' };

// Delivery-log statuses strictly BELOW a target status by lifecycle rank. A guarded
// updateMany keyed on `status IN statusesBelow(target)` upgrades atomically and can
// never regress: if a higher state already committed, the WHERE matches zero rows.
const statusesBelow = (target) => Object.keys(RANK).filter((s) => RANK[s] < (RANK[target] || 0));

const toDate = (ts) => { const n = Number(ts); return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date(); };

// GET verification — Meta sends hub.mode/hub.verify_token/hub.challenge. We accept
// the challenge when the token matches ANY company's stored Verify Token (decrypted)
// or the global META_VERIFY_TOKEN env. Returns { ok, challenge, companyId }.
const verifyChallenge = async ({ mode, token, challenge }) => {
  if (mode !== 'subscribe' || !token) return { ok: false };
  // Global env token (optional) — useful for a single-tenant / shared webhook.
  if (process.env.META_VERIFY_TOKEN && token === process.env.META_VERIFY_TOKEN) {
    return { ok: true, challenge };
  }
  // Per-company verify token (encrypted at rest) — match across companies.
  const rows = await prisma.whatsAppSettings.findMany({ where: { verifyToken: { not: null } }, select: { companyId: true, verifyToken: true } });
  for (const r of rows) {
    if (decrypt(r.verifyToken) === token) {
      await prisma.whatsAppSettings.update({ where: { companyId: r.companyId }, data: { webhookVerified: true, webhookFailureReason: null } }).catch(() => {});
      return { ok: true, challenge, companyId: r.companyId };
    }
  }
  return { ok: false };
};

// Resolve which company a webhook belongs to, via the Meta phone_number_id in the
// payload metadata (company isolation is preserved — we only touch that company).
const companyForPhoneNumberId = async (phoneNumberId) => {
  if (!phoneNumberId) return null;
  const s = await prisma.whatsAppSettings.findFirst({ where: { phoneNumberId: String(phoneNumberId) }, select: { companyId: true } });
  return s ? s.companyId : null;
};

// Record one status event idempotently + update the matching delivery log.
const applyStatusEvent = async ({ companyId, wamid, metaStatus, recipient, eventAt, errorCode, errorTitle, raw }) => {
  const status = META_TO_STATUS[String(metaStatus || '').toLowerCase()];
  if (!status || !wamid) return { skipped: 'unmapped' };

  // 1) Idempotent raw-event insert (unique on metaMessageId+status). Pre-check to
  // avoid noisy constraint errors on Meta's at-least-once redelivery; the unique
  // index is still the source of truth for the rare concurrent race.
  const lower = String(metaStatus).toLowerCase();
  const existing = await prisma.whatsAppWebhookEvent.findUnique({ where: { wamid_status: { metaMessageId: wamid, status: lower } } }).catch(() => null);
  if (existing) return { duplicate: true };
  try {
    await prisma.whatsAppWebhookEvent.create({
      data: { companyId, metaMessageId: wamid, status: lower, recipient: recipient || null, eventAt, errorCode: errorCode || null, errorTitle: errorTitle || null, raw: raw ? JSON.stringify(raw) : null },
    });
  } catch (e) {
    if (e && e.code === 'P2002') return { duplicate: true };   // concurrent race
    throw e;
  }

  // 2) ATOMIC upgrade-only update of the delivery log(s) for this wamid.
  //    The status comparison lives INSIDE the SQL WHERE (`status IN below`), so the
  //    guard and the write are a single row-locked statement — no read-modify-write.
  //    Two concurrent events (e.g. Delivered + Read) can therefore never overwrite
  //    each other: whichever commits second only applies if the current status is
  //    still strictly lower, so status/metaStatus only ever move UP the ladder
  //    (Sent → Delivered → Read; Failed is terminal-highest).
  const tsField = TS_FIELD[status];
  const upgradeData = { status, metaStatus: status };
  if (tsField) upgradeData[tsField] = eventAt;
  if (status === 'Failed') {
    upgradeData.failureReason = errorTitle || (errorCode ? `Meta error ${errorCode}` : 'Delivery failed');
    if (errorCode) upgradeData.errorCode = String(errorCode);
  }
  const upgraded = await prisma.whatsAppDeliveryLog.updateMany({
    where: { companyId, metaMessageId: wamid, status: { in: statusesBelow(status) } },
    data: upgradeData,
  });

  // 2b) Out-of-order event that is NOT an upgrade (e.g. a late Delivered arriving
  //     after Read already committed): leave the higher status/metaStatus untouched
  //     but still record THIS event's own timestamp if unset — preserving the full
  //     lifecycle timeline without ever regressing status. Null-guarded so an
  //     existing timestamp is never overwritten.
  let timestamped = 0;
  if (upgraded.count === 0 && tsField) {
    const r = await prisma.whatsAppDeliveryLog.updateMany({
      where: { companyId, metaMessageId: wamid, [tsField]: null },
      data: { [tsField]: eventAt },
    });
    timestamped = r.count;
  }

  // 3) Stamp webhook health on the company settings.
  await prisma.whatsAppSettings.update({ where: { companyId }, data: { lastWebhookAt: new Date(), webhookVerified: true } }).catch(() => {});
  return { ok: true, status, upgraded: upgraded.count > 0, matchedLog: upgraded.count > 0 || timestamped > 0 };
};

// Process a full Meta webhook POST body. Returns a per-event summary (never throws
// to the route — Meta must always get a 200 so it doesn't disable the webhook).
const processWebhook = async (body) => {
  const results = [];
  const entries = (body && Array.isArray(body.entry)) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change.value || {};
      const phoneNumberId = value.metadata && value.metadata.phone_number_id;
      const companyId = await companyForPhoneNumberId(phoneNumberId);
      if (!companyId) { results.push({ skipped: 'unknown-company', phoneNumberId }); continue; }
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const st of statuses) {
        const err = Array.isArray(st.errors) && st.errors[0];
        try {
          const r = await applyStatusEvent({
            companyId, wamid: st.id, metaStatus: st.status, recipient: st.recipient_id,
            eventAt: toDate(st.timestamp),
            errorCode: err && (err.code != null ? String(err.code) : null),
            errorTitle: err && (err.title || err.message || (err.error_data && err.error_data.details)) || null,
            raw: st,
          });
          results.push({ companyId, wamid: st.id, ...r });
        } catch (e) { results.push({ companyId, wamid: st.id, error: e.message }); }
      }
    }
  }
  return results;
};

module.exports = { verifyChallenge, companyForPhoneNumberId, applyStatusEvent, processWebhook, META_TO_STATUS };
