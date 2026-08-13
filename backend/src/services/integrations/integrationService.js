const prisma = require('../../config/prisma');
const { encrypt, decrypt, isEncrypted } = require('../../utils/secretCrypto');

const AVAILABLE_PROVIDERS = [
  {
    id: 'google_workspace',
    name: 'Google Workspace',
    category: 'Productivity & Directory',
    description: 'Sync Google Calendar meetings, Drive documents, and Workspace user directory.',
    icon: 'G',
    authType: 'OAuth2',
    color: 'text-blue-500 bg-blue-50 border-blue-200'
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'Communication',
    description: 'Broadcast real-time leave, attendance, payroll, and workflow notifications to Slack channels.',
    icon: '#',
    authType: 'OAuth2',
    color: 'text-purple-500 bg-purple-50 border-purple-200'
  },
  {
    id: 'sap',
    name: 'SAP ERP',
    category: 'Enterprise ERP',
    description: 'Bidirectional synchronization of employee records, financial ledgers, and invoice data with SAP.',
    icon: 'S',
    authType: 'API_Key_OData',
    color: 'text-blue-700 bg-blue-50 border-blue-300'
  },
  {
    id: 'tally',
    name: 'Tally Prime',
    category: 'Accounting & Payroll',
    description: 'Automated export of payroll vouchers, attendance records, and master data to Tally Prime.',
    icon: 'T',
    authType: 'XML_HTTP',
    color: 'text-amber-500 bg-amber-50 border-amber-200'
  }
];

async function recordAuditLog(companyId, connectionId, userId, userEmail, provider, action, result, metadata = {}) {
  try {
    await prisma.integrationAuditLog.create({
      data: {
        companyId: Number(companyId),
        connectionId: connectionId ? Number(connectionId) : null,
        userId: userId ? Number(userId) : null,
        userEmail: userEmail || null,
        provider,
        action,
        result,
        metadata
      }
    });
  } catch (err) {
    console.error('[IntegrationAuditLog] Failed to record log:', err.message);
  }
}

async function getAllIntegrations(companyId) {
  const connections = await prisma.integrationConnection.findMany({
    where: { companyId: Number(companyId) },
    include: {
      syncLogs: {
        take: 1,
        orderBy: { startedAt: 'desc' }
      }
    }
  });

  const connectionMap = new Map(connections.map(c => [c.provider, c]));

  return AVAILABLE_PROVIDERS.map(provider => {
    const conn = connectionMap.get(provider.id);
    let status = 'Not Configured';
    let accountEmail = null;
    let accountName = null;
    let lastSyncAt = null;
    let lastSyncStatus = null;
    let syncEnabled = true;
    let syncFrequency = 'Hourly';
    let syncDirection = 'Bidirectional';

    if (conn) {
      status = conn.status || 'Disconnected';
      accountEmail = conn.accountEmail;
      accountName = conn.accountName;
      lastSyncAt = conn.lastSyncAt;
      lastSyncStatus = conn.lastSyncStatus;
      syncEnabled = conn.syncEnabled;
      syncFrequency = conn.syncFrequency;
      syncDirection = conn.syncDirection;
    }

    return {
      ...provider,
      connectionId: conn ? conn.id : null,
      status,
      accountEmail,
      accountName,
      lastSyncAt,
      lastSyncStatus,
      syncEnabled,
      syncFrequency,
      syncDirection,
      createdAt: conn ? conn.createdAt : null,
      updatedAt: conn ? conn.updatedAt : null
    };
  });
}

async function getIntegrationDetails(companyId, provider) {
  const conn = await prisma.integrationConnection.findUnique({
    where: {
      companyId_provider: {
        companyId: Number(companyId),
        provider
      }
    },
    include: {
      syncLogs: {
        take: 10,
        orderBy: { startedAt: 'desc' }
      },
      fieldMappings: true,
      auditLogs: {
        take: 10,
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  const providerMeta = AVAILABLE_PROVIDERS.find(p => p.id === provider) || {
    id: provider,
    name: provider,
    category: 'Custom',
    description: 'Custom integration provider'
  };

  if (!conn) {
    return {
      ...providerMeta,
      connectionId: null,
      status: 'Not Configured',
      syncEnabled: false,
      credentialsConfigured: false,
      settings: {},
      syncLogs: [],
      fieldMappings: [],
      auditLogs: []
    };
  }

  // Mask credentials so raw secrets are NEVER exposed to frontend
  let maskedCredentials = {};
  if (conn.credentials && typeof conn.credentials === 'object') {
    Object.keys(conn.credentials).forEach(key => {
      const val = conn.credentials[key];
      if (typeof val === 'string' && val.length > 0) {
        if (val.length <= 4) {
          maskedCredentials[key] = '****';
        } else {
          maskedCredentials[key] = '************' + val.slice(-4);
        }
      } else {
        maskedCredentials[key] = val;
      }
    });
  }

  return {
    ...providerMeta,
    connectionId: conn.id,
    status: conn.status,
    syncEnabled: conn.syncEnabled,
    syncFrequency: conn.syncFrequency,
    syncDirection: conn.syncDirection,
    accountEmail: conn.accountEmail,
    accountName: conn.accountName,
    lastSyncAt: conn.lastSyncAt,
    lastSyncStatus: conn.lastSyncStatus,
    lastSyncError: conn.lastSyncError,
    settings: conn.settings || {},
    credentialsMasked: maskedCredentials,
    credentialsConfigured: !!conn.credentials,
    syncLogs: conn.syncLogs,
    fieldMappings: conn.fieldMappings,
    auditLogs: conn.auditLogs,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt
  };
}

async function saveIntegrationCredentials(companyId, provider, rawCredentials, settings = {}, userId = null, userEmail = null) {
  // Encrypt credentials before saving to database
  const encryptedCredentials = {};
  if (rawCredentials && typeof rawCredentials === 'object') {
    Object.keys(rawCredentials).forEach(k => {
      const val = rawCredentials[k];
      if (val && typeof val === 'string') {
        encryptedCredentials[k] = isEncrypted(val) ? val : encrypt(val);
      } else {
        encryptedCredentials[k] = val;
      }
    });
  }

  const existing = await prisma.integrationConnection.findUnique({
    where: { companyId_provider: { companyId: Number(companyId), provider } }
  });

  let connection;
  if (existing) {
    connection = await prisma.integrationConnection.update({
      where: { id: existing.id },
      data: {
        credentials: encryptedCredentials,
        settings: settings || existing.settings,
        updatedBy: userId ? Number(userId) : undefined,
        updatedAt: new Date()
      }
    });
  } else {
    connection = await prisma.integrationConnection.create({
      data: {
        companyId: Number(companyId),
        provider,
        status: 'Disconnected',
        credentials: encryptedCredentials,
        settings: settings || {},
        createdBy: userId ? Number(userId) : null
      }
    });
  }

  await recordAuditLog(companyId, connection.id, userId, userEmail, provider, 'CREDENTIAL_UPDATED', 'SUCCESS', {
    updatedFields: Object.keys(rawCredentials || {})
  });

  return connection;
}

async function disconnectIntegration(companyId, provider, userId = null, userEmail = null) {
  const conn = await prisma.integrationConnection.findUnique({
    where: { companyId_provider: { companyId: Number(companyId), provider } }
  });

  if (!conn) {
    throw new Error(`No integration connection found for provider: ${provider}`);
  }

  const updated = await prisma.integrationConnection.update({
    where: { id: conn.id },
    data: {
      status: 'Disconnected',
      accountEmail: null,
      accountName: null,
      credentials: null,
      updatedBy: userId ? Number(userId) : undefined
    }
  });

  await recordAuditLog(companyId, conn.id, userId, userEmail, provider, 'DISCONNECTED', 'SUCCESS');

  return updated;
}

module.exports = {
  AVAILABLE_PROVIDERS,
  recordAuditLog,
  getAllIntegrations,
  getIntegrationDetails,
  saveIntegrationCredentials,
  disconnectIntegration
};
