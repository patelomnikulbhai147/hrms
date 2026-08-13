const crypto = require('crypto');
const prisma = require('../../config/prisma');
const { recordAuditLog } = require('./integrationService');

function verifyWebhookSignature(provider, payload, headers, secret) {
  if (!secret) return true; // If no webhook secret configured, pass verification

  if (provider === 'slack') {
    const slackSignature = headers['x-slack-signature'];
    const timestamp = headers['x-slack-request-timestamp'];
    if (!slackSignature || !timestamp) return false;

    // Reject replay attacks older than 5 minutes
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;

    const sigBasestring = `v0:${timestamp}:${typeof payload === 'string' ? payload : JSON.stringify(payload)}`;
    const mySignature = 'v0=' + crypto.createHmac('sha256', secret).update(sigBasestring).digest('hex');

    return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
  } else {
    // Standard HMAC SHA-256 signature check
    const receivedSig = headers['x-signature'] || headers['x-hub-signature-256'] || headers['signature'];
    if (!receivedSig) return false;

    const expectedSig = crypto.createHmac('sha256', secret).update(typeof payload === 'string' ? payload : JSON.stringify(payload)).digest('hex');
    const cleanReceived = receivedSig.replace(/^sha256=/, '');

    return crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(cleanReceived));
  }
}

async function handleInboundWebhook(companyId, provider, eventId, eventType, payload, headers = {}, rawBody = null) {
  // Idempotency check using eventId if present
  if (eventId) {
    const existing = await prisma.integrationWebhook.findFirst({
      where: {
        companyId: Number(companyId),
        provider,
        eventId
      }
    });

    if (existing) {
      return {
        duplicate: true,
        webhookId: existing.id,
        status: 'DUPLICATE',
        message: `Webhook event ${eventId} was already processed.`
      };
    }
  }

  // Lookup connection
  const conn = await prisma.integrationConnection.findUnique({
    where: { companyId_provider: { companyId: Number(companyId), provider } }
  });

  const webhookSecret = conn?.settings?.webhookSecret || null;
  const isValidSignature = verifyWebhookSignature(provider, rawBody || payload, headers, webhookSecret);

  if (webhookSecret && !isValidSignature) {
    await prisma.integrationWebhook.create({
      data: {
        companyId: Number(companyId),
        connectionId: conn ? conn.id : null,
        provider,
        eventId: eventId || `evt_${Date.now()}`,
        eventType: eventType || 'unknown',
        payload: payload || {},
        signature: headers['x-signature'] || headers['x-slack-signature'] || null,
        status: 'FAILED',
        error: 'Invalid webhook signature'
      }
    });
    throw new Error('Invalid webhook signature verification failure.');
  }

  const webhookRecord = await prisma.integrationWebhook.create({
    data: {
      companyId: Number(companyId),
      connectionId: conn ? conn.id : null,
      provider,
      eventId: eventId || `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      eventType: eventType || 'event',
      payload: payload || {},
      signature: headers['x-signature'] || headers['x-slack-signature'] || null,
      status: 'PROCESSED',
      processedAt: new Date()
    }
  });

  await recordAuditLog(companyId, conn ? conn.id : null, null, 'Webhook Engine', provider, 'WEBHOOK_RECEIVED', 'SUCCESS', {
    webhookId: webhookRecord.id,
    eventType
  });

  return {
    duplicate: false,
    webhookId: webhookRecord.id,
    status: 'PROCESSED',
    message: `Webhook event "${eventType}" processed successfully.`
  };
}

module.exports = {
  verifyWebhookSignature,
  handleInboundWebhook
};
