const axios = require('axios');
const prisma = require('../../config/prisma');
const { encrypt, decrypt } = require('../../utils/secretCrypto');
const { recordAuditLog } = require('./integrationService');

async function getGoogleConfig(companyId) {
  let clientId = process.env.GOOGLE_CLIENT_ID || '';
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  let redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/integrations/google_workspace/oauth/callback';

  if (!clientId || !clientSecret) {
    const conn = await prisma.integrationConnection.findUnique({
      where: { companyId_provider: { companyId: Number(companyId), provider: 'google_workspace' } }
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

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/admin.directory.user.readonly'
];

async function isConfigured(companyId = 1) {
  const config = await getGoogleConfig(companyId);
  return config.isConfigured;
}

async function getAuthUrl(companyId) {
  const config = await getGoogleConfig(companyId);
  if (!config.isConfigured) {
    throw new Error('Google Workspace OAuth credentials (Client ID and Client Secret) are not configured. Please open Settings and configure OAuth credentials.');
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: JSON.stringify({ companyId: Number(companyId) })
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function handleOAuthCallback(code, stateStr, userId = null) {
  let stateObj = {};
  try {
    stateObj = JSON.parse(stateStr || '{}');
  } catch {
    stateObj = {};
  }

  const companyId = Number(stateObj.companyId) || 1;
  const config = await getGoogleConfig(companyId);

  if (!config.isConfigured) {
    throw new Error('Google Workspace OAuth configuration missing on server.');
  }

  // Exchange code for tokens
  const tokenRes = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code'
  }).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const { access_token, refresh_token, expires_in } = tokenRes.data;

  // Fetch User Info
  const userRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` }
  });

  const profile = userRes.data || {};
  const accountEmail = profile.email || 'workspace-user@google.com';
  const accountName = profile.name || profile.given_name || 'Google Workspace User';

  const encryptedTokens = {
    accessToken: encrypt(access_token),
    refreshToken: refresh_token ? encrypt(refresh_token) : null,
    expiresAt: Date.now() + (expires_in * 1000)
  };

  const connection = await prisma.integrationConnection.upsert({
    where: {
      companyId_provider: {
        companyId,
        provider: 'google_workspace'
      }
    },
    update: {
      status: 'Connected',
      accountEmail,
      accountName,
      credentials: encryptedTokens,
      lastSyncError: null,
      updatedAt: new Date()
    },
    create: {
      companyId,
      provider: 'google_workspace',
      status: 'Connected',
      accountEmail,
      accountName,
      credentials: encryptedTokens
    }
  });

  await recordAuditLog(companyId, connection.id, userId, accountEmail, 'google_workspace', 'CONNECTED', 'SUCCESS', {
    accountEmail,
    accountName
  });

  return connection;
}

async function getValidAccessToken(connection) {
  if (!connection || !connection.credentials) {
    throw new Error('No Google Workspace credentials found for connection.');
  }

  const creds = connection.credentials;
  const rawAccessToken = decrypt(creds.accessToken);
  const rawRefreshToken = creds.refreshToken ? decrypt(creds.refreshToken) : null;
  const expiresAt = creds.expiresAt || 0;

  if (rawAccessToken && expiresAt > Date.now() + 120000) {
    return rawAccessToken;
  }

  if (!rawRefreshToken) {
    throw new Error('Google Workspace access token expired and no refresh token is available. Re-authentication required.');
  }

  const config = await getGoogleConfig(connection.companyId);
  if (!config.isConfigured) {
    throw new Error('Server missing Google Client ID / Secret to refresh token.');
  }

  try {
    const refreshRes = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: rawRefreshToken,
      grant_type: 'refresh_token'
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const newAccessToken = refreshRes.data.access_token;
    const newExpiresIn = refreshRes.data.expires_in || 3600;

    const updatedCreds = {
      ...creds,
      accessToken: encrypt(newAccessToken),
      expiresAt: Date.now() + (newExpiresIn * 1000)
    };

    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { credentials: updatedCreds }
    });

    return newAccessToken;
  } catch (refreshErr) {
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { status: 'Authentication Required', lastSyncError: 'Token refresh failed: ' + refreshErr.message }
    });
    throw new Error(`Google OAuth refresh failed: ${refreshErr.message}. Re-authorization required.`);
  }
}

async function testConnection(companyId) {
  const config = await getGoogleConfig(companyId);

  const conn = await prisma.integrationConnection.findUnique({
    where: { companyId_provider: { companyId: Number(companyId), provider: 'google_workspace' } }
  });

  if (!config.isConfigured) {
    return {
      success: false,
      configured: false,
      message: 'Google Workspace OAuth is not configured on the server. Please enter Client ID and Client Secret in Integration Settings.'
    };
  }

  if (!conn || conn.status !== 'Connected' || !conn.credentials) {
    return {
      success: false,
      configured: true,
      message: 'Google Workspace account is not connected for this company. Please click "Connect Account" to authenticate.'
    };
  }

  try {
    const token = await getValidAccessToken(conn);
    const res = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });

    return {
      success: true,
      configured: true,
      message: `Successfully authenticated with Google Workspace account (${res.data.email || conn.accountEmail}).`,
      details: {
        accountEmail: res.data.email || conn.accountEmail,
        name: res.data.name || conn.accountName
      }
    };
  } catch (err) {
    return {
      success: false,
      configured: true,
      message: `Google Workspace API connection test failed: ${err.response?.data?.error?.message || err.message}`
    };
  }
}

async function syncWorkspaceData(companyId) {
  const conn = await prisma.integrationConnection.findUnique({
    where: { companyId_provider: { companyId: Number(companyId), provider: 'google_workspace' } }
  });

  if (!conn || conn.status !== 'Connected') {
    throw new Error('Google Workspace is not connected. Cannot perform sync.');
  }

  const token = await getValidAccessToken(conn);

  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  try {
    const userRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    recordsProcessed = 1;
    recordsUpdated = 1;

    await prisma.integrationConnection.update({
      where: { id: conn.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        lastSyncError: null
      }
    });

    return {
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      recordsFailed: 0,
      summary: `Synced Google Workspace account (${userRes.data.email || conn.accountEmail}).`
    };
  } catch (err) {
    await prisma.integrationConnection.update({
      where: { id: conn.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'FAILED',
        lastSyncError: err.message
      }
    });
    throw err;
  }
}

async function configureGoogle(companyId, configData, userId = null, userEmail = null) {
  const { clientId, clientSecret, redirectUri } = configData;

  const existing = await prisma.integrationConnection.findUnique({
    where: { companyId_provider: { companyId: Number(companyId), provider: 'google_workspace' } }
  });

  const settings = {
    ...(existing?.settings || {}),
    clientId: clientId || '',
    clientSecret: clientSecret ? encrypt(clientSecret) : existing?.settings?.clientSecret || '',
    redirectUri: redirectUri || 'http://localhost:5000/api/integrations/google_workspace/oauth/callback'
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
        provider: 'google_workspace',
        status: 'Not Configured',
        settings
      }
    });
  }

  await recordAuditLog(companyId, connection.id, userId, userEmail, 'google_workspace', 'SETTINGS_CHANGED', 'SUCCESS', {
    clientId: clientId ? 'configured' : 'not_configured'
  });

  return connection;
}

module.exports = {
  getGoogleConfig,
  isConfigured,
  getAuthUrl,
  handleOAuthCallback,
  testConnection,
  syncWorkspaceData,
  getValidAccessToken,
  configureGoogle
};
