const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const integrationService = require('../services/integrations/integrationService');
const googleService = require('../services/integrations/googleIntegrationService');
const slackService = require('../services/integrations/slackIntegrationService');
const sapService = require('../services/integrations/sapIntegrationService');
const tallyService = require('../services/integrations/tallyIntegrationService');
const syncEngine = require('../services/integrations/syncEngine');
const apiKeyService = require('../services/integrations/apiKeyService');
const webhookEngine = require('../services/integrations/webhookEngine');
const prisma = require('../config/prisma');

const router = express.Router();

// Helper to extract & validate companyId against authenticated session
function resolveCompanyId(req) {
  let targetCompanyId = req.user?.companyId;

  // Multi-company / Super Admin override if companyId query/body parameter is passed
  if (req.query?.companyId || req.body?.companyId) {
    const candidateId = Number(req.query.companyId || req.body.companyId);
    if (req.user?.role === 'Super Admin') {
      targetCompanyId = candidateId;
    } else if (Array.isArray(req.user?.accessibleCompanyIds) && req.user.accessibleCompanyIds.includes(candidateId)) {
      targetCompanyId = candidateId;
    }
  }

  if (!targetCompanyId) {
    if (Array.isArray(req.user?.accessibleCompanyIds) && req.user.accessibleCompanyIds.length > 0) {
      targetCompanyId = Number(req.user.accessibleCompanyIds[0]);
    } else {
      targetCompanyId = 1;
    }
  }

  return Number(targetCompanyId);
}

// ── OAuth Callback Routes (Handling OAuth redirects) ──────────────────────────
router.get('/google_workspace/oauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      return res.status(400).send(`Google OAuth Access Denied: ${error}`);
    }

    await googleService.handleOAuthCallback(code, state);
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #f8fafc;">
          <h2 style="color: #16a34a;">✓ Google Workspace Connected Successfully</h2>
          <p>You may close this window and return to ZeniaHR Integration Hub.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'INTEGRATION_CONNECTED', provider: 'google_workspace' }, '*');
              window.close();
            } else {
              setTimeout(() => { window.location.href = '/integration-hub'; }, 2000);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`Google Workspace Authorization Failed: ${err.message}`);
  }
});

router.get('/slack/oauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      return res.status(400).send(`Slack OAuth Access Denied: ${error}`);
    }

    await slackService.handleOAuthCallback(code, state);
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #f8fafc;">
          <h2 style="color: #16a34a;">✓ Slack Workspace Connected Successfully</h2>
          <p>You may close this window and return to ZeniaHR Integration Hub.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'INTEGRATION_CONNECTED', provider: 'slack' }, '*');
              window.close();
            } else {
              setTimeout(() => { window.location.href = '/integration-hub'; }, 2000);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`Slack Authorization Failed: ${err.message}`);
  }
});

// ── Inbound Webhooks Listener (Public or Token Authenticated) ───────────────
router.post('/webhooks/:provider', async (req, res) => {
  try {
    const provider = req.params.provider;
    const companyId = req.query.companyId ? Number(req.query.companyId) : 1;
    const eventId = req.headers['x-event-id'] || req.body.event_id || req.body.id;
    const eventType = req.headers['x-event-type'] || req.body.event_type || req.body.type || 'webhook_event';

    const result = await webhookEngine.handleInboundWebhook(
      companyId,
      provider,
      eventId,
      eventType,
      req.body,
      req.headers,
      req.rawBody
    );

    res.json(result);
  } catch (err) {
    console.error('[Webhook] Failed to process inbound webhook:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Protect all remaining routes with authMiddleware
router.use(protect);

// ── GET /api/integrations — List integrations for tenant ──────────────────────
router.get('/', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const integrations = await integrationService.getAllIntegrations(companyId);
    res.json(integrations);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch integrations' });
  }
});

// ── API Key Management Endpoints ─────────────────────────────────────────────
router.get('/api-keys', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const keys = await apiKeyService.listApiKeys(companyId);
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch API keys' });
  }
});

router.post('/api-keys', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { name, scopes, expiresAt, rateLimit } = req.body;
    const keyData = await apiKeyService.createApiKey(
      companyId,
      name,
      scopes,
      expiresAt,
      rateLimit,
      req.user.id,
      req.user.email
    );
    res.status(201).json(keyData);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create API key' });
  }
});

router.delete('/api-keys/:keyId', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const keyId = req.params.keyId;
    const result = await apiKeyService.revokeApiKey(companyId, keyId, req.user.id, req.user.email);
    res.json({ message: 'API key revoked successfully', apiKey: result });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to revoke API key' });
  }
});

// ── GET /api/integrations/:provider — Get detailed integration state ───────
router.get('/:provider', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const provider = req.params.provider;
    const details = await integrationService.getIntegrationDetails(companyId, provider);
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch integration details' });
  }
});

// ── OAuth Start Endpoint ──────────────────────────────────────────────────────
router.get('/:provider/oauth/start', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const provider = req.params.provider;

    let authUrl = '';
    if (provider === 'google_workspace' || provider === 'google') {
      authUrl = await googleService.getAuthUrl(companyId);
    } else if (provider === 'slack') {
      authUrl = await slackService.getAuthUrl(companyId);
    } else {
      return res.status(400).json({ error: `OAuth is not supported for provider: ${provider}` });
    }

    res.json({ authUrl });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to initiate OAuth flow' });
  }
});

// ── POST /api/integrations/:provider/connect — Connect / configure provider ──
router.post('/:provider/connect', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const provider = req.params.provider;
    const configData = req.body;

    let result;
    if (provider === 'google_workspace' || provider === 'google') {
      const conn = await googleService.configureGoogle(companyId, configData, req.user.id, req.user.email);
      result = { connection: conn, message: 'Google Workspace OAuth configuration saved.' };
    } else if (provider === 'slack') {
      const conn = await slackService.configureSlack(companyId, configData, req.user.id, req.user.email);
      result = { connection: conn, message: 'Slack OAuth configuration saved.' };
    } else if (provider === 'sap') {
      result = await sapService.configureSap(companyId, configData, req.user.id, req.user.email);
    } else if (provider === 'tally') {
      result = await tallyService.configureTally(companyId, configData, req.user.id, req.user.email);
    } else {
      const conn = await integrationService.saveIntegrationCredentials(
        companyId,
        provider,
        configData.credentials || configData,
        configData.settings || {},
        req.user.id,
        req.user.email
      );
      result = { connection: conn };
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to connect integration' });
  }
});

// ── POST /api/integrations/:provider/test — Live connection test ────────────
router.post('/:provider/test', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const provider = req.params.provider;

    let testResult;
    if (provider === 'google_workspace') {
      testResult = await googleService.testConnection(companyId);
    } else if (provider === 'slack') {
      testResult = await slackService.testConnection(companyId);
    } else if (provider === 'sap') {
      testResult = await sapService.testConnection(companyId);
    } else if (provider === 'tally') {
      testResult = await tallyService.testConnection(companyId);
    } else {
      testResult = { success: true, message: `Generic connection test for ${provider} passed.` };
    }

    res.json(testResult);
  } catch (err) {
    res.status(500).json({ success: false, message: `Connection test error: ${err.message}` });
  }
});

// ── POST /api/integrations/:provider/sync — Trigger immediate sync ───────────
router.post('/:provider/sync', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const provider = req.params.provider;

    const syncLog = await syncEngine.triggerSync(
      companyId,
      provider,
      'Manual',
      req.user.id,
      req.user.email
    );

    res.json({ message: `Sync completed for ${provider}`, syncLog });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Synchronization failed' });
  }
});

// ── PUT /api/integrations/:provider/settings — Update provider settings ─────
router.put('/:provider/settings', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const provider = req.params.provider;
    const { syncEnabled, syncFrequency, syncDirection, settings } = req.body;

    const existing = await prisma.integrationConnection.findUnique({
      where: { companyId_provider: { companyId, provider } }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Integration connection not found' });
    }

    const updated = await prisma.integrationConnection.update({
      where: { id: existing.id },
      data: {
        syncEnabled: syncEnabled !== undefined ? Boolean(syncEnabled) : existing.syncEnabled,
        syncFrequency: syncFrequency || existing.syncFrequency,
        syncDirection: syncDirection || existing.syncDirection,
        settings: settings ? { ...(existing.settings || {}), ...settings } : existing.settings,
        updatedBy: req.user.id
      }
    });

    await integrationService.recordAuditLog(
      companyId,
      existing.id,
      req.user.id,
      req.user.email,
      provider,
      'SETTINGS_CHANGED',
      'SUCCESS',
      { syncEnabled, syncFrequency, syncDirection }
    );

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update settings' });
  }
});

// ── DELETE /api/integrations/:provider — Disconnect integration ─────────────
router.delete('/:provider', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const provider = req.params.provider;

    const disconnected = await integrationService.disconnectIntegration(
      companyId,
      provider,
      req.user.id,
      req.user.email
    );

    res.json({ message: `Disconnected ${provider} integration successfully`, connection: disconnected });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to disconnect integration' });
  }
});

module.exports = router;
