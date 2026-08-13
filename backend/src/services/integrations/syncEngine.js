const prisma = require('../../config/prisma');
const { recordAuditLog } = require('./integrationService');
const googleService = require('./googleIntegrationService');
const slackService = require('./slackIntegrationService');
const sapService = require('./sapIntegrationService');
const tallyService = require('./tallyIntegrationService');

async function triggerSync(companyId, provider, syncType = 'Manual', userId = null, userEmail = null) {
  const connection = await prisma.integrationConnection.findUnique({
    where: { companyId_provider: { companyId: Number(companyId), provider } }
  });

  if (!connection) {
    throw new Error(`Integration connection for provider "${provider}" does not exist.`);
  }

  // Create initial sync log entry with status RUNNING
  const syncLog = await prisma.integrationSyncLog.create({
    data: {
      companyId: Number(companyId),
      connectionId: connection.id,
      provider,
      syncType,
      status: 'RUNNING',
      startedAt: new Date(),
      createdBy: userId ? Number(userId) : null
    }
  });

  // Mark connection as Syncing
  await prisma.integrationConnection.update({
    where: { id: connection.id },
    data: { status: 'Syncing' }
  });

  await recordAuditLog(companyId, connection.id, userId, userEmail, provider, 'SYNC_STARTED', 'SUCCESS', {
    syncLogId: syncLog.id,
    syncType
  });

  try {
    let result = { recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, recordsFailed: 0, summary: '' };

    switch (provider) {
      case 'google_workspace':
        result = await googleService.syncWorkspaceData(companyId);
        break;
      case 'slack':
        result = await slackService.syncSlackData(companyId);
        break;
      case 'sap':
        result = await sapService.syncSapData(companyId);
        break;
      case 'tally':
        result = await tallyService.syncTallyData(companyId);
        break;
      default:
        throw new Error(`Unsupported sync provider: ${provider}`);
    }

    const completedAt = new Date();
    const finalSyncLog = await prisma.integrationSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'SUCCESS',
        completedAt,
        recordsProcessed: result.recordsProcessed || 0,
        recordsCreated: result.recordsCreated || 0,
        recordsUpdated: result.recordsUpdated || 0,
        recordsFailed: result.recordsFailed || 0,
        details: result
      }
    });

    await recordAuditLog(companyId, connection.id, userId, userEmail, provider, 'SYNC_COMPLETED', 'SUCCESS', {
      syncLogId: syncLog.id,
      recordsProcessed: result.recordsProcessed,
      summary: result.summary
    });

    return finalSyncLog;
  } catch (syncError) {
    const completedAt = new Date();
    const failedSyncLog = await prisma.integrationSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'FAILED',
        completedAt,
        error: syncError.message
      }
    });

    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        status: 'Error',
        lastSyncAt: completedAt,
        lastSyncStatus: 'FAILED',
        lastSyncError: syncError.message
      }
    });

    await recordAuditLog(companyId, connection.id, userId, userEmail, provider, 'SYNC_FAILED', 'FAILURE', {
      syncLogId: syncLog.id,
      error: syncError.message
    });

    throw syncError;
  }
}

module.exports = {
  triggerSync
};
