// ─────────────────────────────────────────────────────────────────────────────
// Public Meta WhatsApp webhook (Phase 5). Mounted at /api/whatsapp — NO auth,
// because Meta's servers call it directly. Company isolation is enforced inside
// the service by resolving the company from the payload's phone_number_id.
//   GET  /api/whatsapp/webhook  → verification handshake (hub.challenge)
//   POST /api/whatsapp/webhook  → delivery status events (sent/delivered/read/failed)
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const webhook = require('../services/whatsapp/whatsappWebhookService');

// Verification — echo hub.challenge when the verify token matches.
router.get('/webhook', async (req, res) => {
  try {
    const r = await webhook.verifyChallenge({
      mode: req.query['hub.mode'],
      token: req.query['hub.verify_token'],
      challenge: req.query['hub.challenge'],
    });
    if (r.ok) return res.status(200).send(String(r.challenge ?? ''));
    return res.sendStatus(403);
  } catch (e) {
    console.error('whatsapp.webhook.verify', e);
    return res.sendStatus(403);
  }
});

// Status events — ALWAYS reply 200 quickly so Meta keeps the subscription active.
router.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const results = await webhook.processWebhook(req.body);
    if (results && results.length) console.log('[WhatsApp][webhook] processed %d event(s):', results.length, JSON.stringify(results));
  } catch (e) {
    console.error('whatsapp.webhook.process', e);
  }
});

module.exports = router;
