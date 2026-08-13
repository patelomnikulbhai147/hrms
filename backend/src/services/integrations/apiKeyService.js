const crypto = require('crypto');
const prisma = require('../../config/prisma');
const { recordAuditLog } = require('./integrationService');

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function maskApiKey(rawKey) {
  if (!rawKey || rawKey.length <= 12) return 'zen_live_****';
  const prefix = rawKey.slice(0, 8);
  const suffix = rawKey.slice(-4);
  return `${prefix}...${suffix}`;
}

async function createApiKey(companyId, name, scopes = ['read', 'write'], expiresAt = null, rateLimit = 1000, userId = null, userEmail = null) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('API Key name is required.');
  }

  // Generate random 32-byte hexadecimal secret prefixed with zen_live_
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const rawApiKey = `zen_live_${randomBytes}`;
  const keyHash = hashApiKey(rawApiKey);
  const keyMask = maskApiKey(rawApiKey);

  const apiKeyRecord = await prisma.integrationApiKey.create({
    data: {
      companyId: Number(companyId),
      name: name.trim(),
      keyHash,
      keyMask,
      scopes: Array.isArray(scopes) ? scopes : ['read'],
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: 'ACTIVE',
      rateLimit: Number(rateLimit) || 1000,
      createdBy: userId ? Number(userId) : null
    }
  });

  await recordAuditLog(companyId, null, userId, userEmail, 'api_key', 'API_KEY_CREATED', 'SUCCESS', {
    keyId: apiKeyRecord.id,
    keyName: name,
    keyMask
  });

  // Return rawApiKey ONLY ONCE upon creation. Future reads return keyMask.
  return {
    id: apiKeyRecord.id,
    companyId: apiKeyRecord.companyId,
    name: apiKeyRecord.name,
    rawApiKey,
    keyMask: apiKeyRecord.keyMask,
    scopes: apiKeyRecord.scopes,
    expiresAt: apiKeyRecord.expiresAt,
    status: apiKeyRecord.status,
    rateLimit: apiKeyRecord.rateLimit,
    createdAt: apiKeyRecord.createdAt
  };
}

async function listApiKeys(companyId) {
  const keys = await prisma.integrationApiKey.findMany({
    where: { companyId: Number(companyId) },
    orderBy: { createdAt: 'desc' }
  });

  return keys.map(k => ({
    id: k.id,
    companyId: k.companyId,
    name: k.name,
    keyMask: k.keyMask,
    scopes: k.scopes,
    expiresAt: k.expiresAt,
    status: k.status,
    rateLimit: k.rateLimit,
    lastUsedAt: k.lastUsedAt,
    createdAt: k.createdAt
  }));
}

async function revokeApiKey(companyId, keyId, userId = null, userEmail = null) {
  const existing = await prisma.integrationApiKey.findFirst({
    where: { id: Number(keyId), companyId: Number(companyId) }
  });

  if (!existing) {
    throw new Error('API Key not found or does not belong to this company.');
  }

  const updated = await prisma.integrationApiKey.update({
    where: { id: existing.id },
    data: { status: 'REVOKED' }
  });

  await recordAuditLog(companyId, null, userId, userEmail, 'api_key', 'API_KEY_REVOKED', 'SUCCESS', {
    keyId: existing.id,
    keyMask: existing.keyMask
  });

  return updated;
}

async function verifyApiKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;

  const keyHash = hashApiKey(rawKey);
  const keyRecord = await prisma.integrationApiKey.findUnique({
    where: { keyHash }
  });

  if (!keyRecord || keyRecord.status !== 'ACTIVE') {
    return null;
  }

  if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
    // Key has expired
    await prisma.integrationApiKey.update({
      where: { id: keyRecord.id },
      data: { status: 'EXPIRED' }
    });
    return null;
  }

  // Update lastUsedAt timestamp asynchronously
  prisma.integrationApiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() }
  }).catch(err => console.error('[ApiKeyService] Failed to update lastUsedAt:', err.message));

  return keyRecord;
}

module.exports = {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
  hashApiKey,
  maskApiKey
};
