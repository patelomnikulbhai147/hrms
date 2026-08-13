const axios = require('axios');
const prisma = require('../../config/prisma');
const { encrypt, decrypt } = require('../../utils/secretCrypto');
const { recordAuditLog } = require('./integrationService');

async function getSlackConfig(companyId) {
  let clientId = process.env.SLACK_CLIENT_ID || '';
  let clientSecret = process.env.SLACK_CLIENT_SECRET || '';
  let redirectUri = process.env.SLACK_REDIRECT_URI || 'http://localhost:5000/api/integrations/slack/oauth/callback';

  if (!clientId || !clientSecret) {
    const conn = await prisma.integrationConnection.findUnique({
      where: { companyId_provider: { companyId: Number(companyId), provider: 'slack' } }
    });
    if (conn && conn.settings) {
      if (conn.settings.clientId) clientId = conn.settings.clientId;
      if (conn.settings.clientSecret) {
        clientSecret = typeof conn.settings.clientSecret === 'string' && conn.settings.clientSecret.startsWith('enc:')
          ? decrypt(conn.settings.clientSecret)
          : conn.settings.clientSecret;
      }
      if (conn.settings.redirectUri) redirectUri = conn.settings.redirectUri;
    }
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    isConfigured: Boolean(clientId && clientSecret)
  };
}

const SLACK_SCOPES = [
  'chat:write',
  'chat:write.public',
  'channels:read',
  'users:read'
];

async function isConfigured(companyId = 1) {
  const config = await getSlackConfig(companyId);
  return config.isConfigured;
}

async function getAuthUrl(companyId) {
  const config = await getSlackConfig(companyId);
  if (!config.isConfigured) {
    throw new Error('Slack OAuth credentials (Client ID and Client Secret) are not configured. Please open Settings and configure OAuth credentials.');
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: SLACK_SCOPES.join(','),
    redirect_uri: config.redirectUri,
    state: JSON.stringify({ companyId: Number(companyId) })
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

async function handleOAuthCallback(code, stateStr, userId = null) {
  let stateObj = {};
  try {
    stateObj = JSON.parse(stateStr || '{}');
  } catch {
    stateObj = {};
  }

  const companyId = Number(stateObj.companyId) || 1;
  const config = await getSlackConfig(companyId);

  if (!config.isConfigured) {
    throw new Error('Slack OAuth configuration missing on server.');
  }

  // Token exchange with Slack API
  const tokenRes = await axios.post('https://slack.com/api/oauth.v2.access', new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri
  }).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  if (!tokenRes.data.ok) {
    throw new Error(`Slack OAuth error: ${tokenRes.data.error || 'Failed to exchange authorization code.'}`);
  }

  const data = tokenRes.data;
  const botAccessToken = data.access_token;
  const teamName = data.team ? data.team.name : 'Slack Workspace';
  const teamId = data.team ? data.team.id : '';
  const authedUser = data.authed_user ? data.authed_user.id : '';

  const encryptedCredentials = {
    botToken: encrypt(botAccessToken),
    teamId,
    authedUser,
    botUserId: data.bot_user_id
  };

  const connection = await prisma.integrationConnection.upsert({
    where: {
      companyId_provider: {
        companyId,
        provider: 'slack'
      }
    },
    update: {
      status: 'Connected',
      accountName: teamName,
      accountEmail: `${teamName} (${teamId})`,
      credentials: encryptedCredentials,
      lastSyncError: null,
      updatedAt: new Date()
    },
    create: {
      companyId,
      provider: 'slack',
      status: 'Connected',
      accountName: teamName,
      accountEmail: `${teamName} (${teamId})`,
      credentials: encryptedCredentials
    }
  });

  await recordAuditLog(companyId, connection.id, userId, teamName, 'slack', 'CONNECTED', 'SUCCESS', {
    teamName,
    teamId
  });

  return connection;
}

async function testConnection(companyId) {
  const config = await getSlackConfig(companyId);

  const conn = await prisma.integrationConnection.findUnique({
    where: { companyId_provider: { companyId: Number(companyId), provider: 'slack' } }
  });

  if (!conn || conn.status !== 'Connected' || !conn.credentials) {
    return {
      success: false,
      configured: config.isConfigured,
      message: 'Slack is not connected for this workspace. Please click "Connect Account" to pair your Slack workspace.'
    };
  }

  const rawBotToken = conn.credentials.botToken ? decrypt(conn.credentials.botToken) : null;
  if (!rawBotToken) {
    return {
      success: false,
      configured: config.isConfigured,
      message: 'Slack bot token is missing or corrupted. Re-authorization required.'
    };
  }

  try {
    const authTest = await axios.post('https://slack.com/api/auth.test', {}, {
      headers: { Authorization: `Bearer ${rawBotToken}` }
    });

    if (!authTest.data.ok) {
      return {
        success: false,
        configured: config.isConfigured,
        message: `Slack authentication check failed: ${authTest.data.error}`
      };
    }

    return {
      success: true,
      configured: config.isConfigured,
      message: `Slack connection active for workspace "${authTest.data.team}" (Bot: @${authTest.data.user}).`,
      details: {
        team: authTest.data.team,
        user: authTest.data.user,
        teamId: authTest.data.team_id
      }
    };
  } catch (err) {
    return {
      success: false,
      configured: config.isConfigured,
      message: `Failed to connect to Slack API: ${err.message}`
    };
  }
}

async function sendNotification(companyId, channel, title, text, blocks = null) {
  const conn = await prisma.integrationConnection.findUnique({
    where: { companyId_provider: { companyId: Number(companyId), provider: 'slack' } }
  });

  if (!conn || conn.status !== 'Connected' || !conn.credentials) {
    throw new Error('Slack connection is not active.');
  }

  const rawBotToken = decrypt(conn.credentials.botToken);
  if (!rawBotToken) throw new Error('Slack bot token is invalid.');

  const payload = {
    channel: channel || conn.settings?.defaultChannel || '#general',
    text: `*${title}*\n${text}`,
    blocks: blocks || [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${title}*\n${text}` }
      }
    ]
  };

  const res = await axios.post('https://slack.com/api/chat.postMessage', payload, {
    headers: { Authorization: `Bearer ${rawBotToken}` }
  });

  if (!res.data.ok) {
    throw new Error(`Slack notification error: ${res.data.error}`);
  }

  return res.data;
}

async function syncSlackData(companyId) {
  const conn = await prisma.integrationConnection.findUnique({
    where: { companyId_provider: { companyId: Number(companyId), provider: 'slack' } }
  });

  if (!conn || conn.status !== 'Connected') {
    throw new Error('Slack is not connected.');
  }

  const testRes = await testConnection(companyId);
  if (!testRes.success) {
    await prisma.integrationConnection.update({
      where: { id: conn.id },
      data: { lastSyncAt: new Date(), lastSyncStatus: 'FAILED', lastSyncError: testRes.message }
    });
    throw new Error(testRes.message);
  }

  await prisma.integrationConnection.update({
    where: { id: conn.id },
    data: { lastSyncAt: new Date(), lastSyncStatus: 'SUCCESS', lastSyncError: null }
  });

  return {
    recordsProcessed: 1,
    recordsCreated: 0,
    recordsUpdated: 1,
    recordsFailed: 0,
    summary: `Verified connection with Slack workspace (${conn.accountName}).`
  };
}

async function configureSlack(companyId, configData, userId = null, userEmail = null) {
  const { clientId, clientSecret, redirectUri, defaultChannel } = configData;

  const existing = await prisma.integrationConnection.findUnique({
    where: { companyId_provider: { companyId: Number(companyId), provider: 'slack' } }
  });

  const settings = {
    ...(existing?.settings || {}),
    clientId: clientId || '',
    clientSecret: clientSecret ? encrypt(clientSecret) : existing?.settings?.clientSecret || '',
    redirectUri: redirectUri || 'http://localhost:5000/api/integrations/slack/oauth/callback',
    defaultChannel: defaultChannel || '#general'
  };

  let connection;
  if (existing) {
    connection = await prisma.integrationConnection.update({
      where: { id: existing.id },
      data: { settings, updatedAt: new Date() }
    });
  } else {
    connection = await prisma.integrationConnection.create({
      data: {
        companyId: Number(companyId),
        provider: 'slack',
        status: 'Not Configured',
        settings
      }
    });
  }

  await recordAuditLog(companyId, connection.id, userId, userEmail, 'slack', 'SETTINGS_CHANGED', 'SUCCESS', {
    clientId: clientId ? 'configured' : 'not_configured'
  });

  return connection;
}

module.exports = {
  getSlackConfig,
  isConfigured,
  getAuthUrl,
  handleOAuthCallback,
  testConnection,
  sendNotification,
  syncSlackData,
  configureSlack
};
