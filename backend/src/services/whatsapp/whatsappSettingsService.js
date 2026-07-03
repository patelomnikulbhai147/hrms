// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppSettingsService — read / upsert the per-company WhatsApp configuration.
//
// One row per company (whatsapp_settings.companyId is unique). The settings hold
// the connection toggle, Development Mode (default ON), the developer test number,
// and the Meta Cloud API credentials. This service is the single place that knows
// the shape of the settings; controllers and the other WhatsApp services depend
// on it rather than touching Prisma directly.
//
// SECURITY (Phase 2): the Permanent Access Token and Verify Token are stored
// ENCRYPTED at rest (AES-256-GCM via secretCrypto) and are NEVER returned to the
// frontend — getForClient() redacts them to boolean "hasAccessToken" flags.
// Only backend services read the decrypted values via getDecrypted().
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../../config/prisma');
const { encrypt, decrypt } = require('../../utils/secretCrypto');

// Secret fields — encrypted at rest, never sent to the client.
const SECRET_FIELDS = ['permanentAccessToken', 'verifyToken'];

// Plain (non-secret) fields a client may write.
const WRITABLE_FIELDS = [
  'enabled',
  'connectionStatus',
  'developmentMode',
  'developerTestNumber',
  'metaBusinessId',
  'whatsappBusinessAccountId',
  'phoneNumberId',
  'webhookUrl',
  // Image-template integration (additive).
  'imageTemplateDefault',
  'imageTemplateLang',
  'imageTemplateMap',
];

const BOOLEAN_FIELDS = new Set(['enabled', 'developmentMode']);

// Sanitize an incoming body to only the writable plain fields, coercing booleans.
const pick = (body = {}) => {
  const out = {};
  for (const key of WRITABLE_FIELDS) {
    if (body[key] === undefined) continue;
    out[key] = BOOLEAN_FIELDS.has(key) ? Boolean(body[key]) : body[key];
  }
  return out;
};

// Get the company's settings, creating a default row (Development Mode ON) the
// first time it is requested so the UI always has a record to bind to.
const getOrCreate = async (companyId) => {
  const existing = await prisma.whatsAppSettings.findUnique({ where: { companyId } });
  if (existing) return existing;
  return prisma.whatsAppSettings.create({
    data: { companyId, developmentMode: true, enabled: false, connectionStatus: 'not_connected' },
  });
};

// Backend-only: settings with the secret fields DECRYPTED for API use.
const getDecrypted = async (companyId) => {
  const s = await getOrCreate(companyId);
  return {
    ...s,
    permanentAccessToken: decrypt(s.permanentAccessToken) || '',
    verifyToken: decrypt(s.verifyToken) || '',
  };
};

// Client-safe view: strip secrets, expose only presence flags. The frontend must
// never receive the Access Token or Verify Token.
const getForClient = async (companyId) => redactForClient(await getOrCreate(companyId));

const redactForClient = (s) => {
  if (!s) return s;
  const { permanentAccessToken, verifyToken, ...rest } = s;
  return {
    ...rest,
    hasAccessToken: Boolean(permanentAccessToken),
    hasVerifyToken: Boolean(verifyToken),
  };
};

// Update (upsert) the company's settings. Plain fields are sanitized; the two
// secret fields are encrypted, and are only written when the client actually
// sends a NEW non-empty value (so re-saving the form doesn't wipe a stored token
// the UI shows masked).
const update = async (companyId, body = {}) => {
  const data = pick(body);
  for (const key of SECRET_FIELDS) {
    const val = body[key];
    if (typeof val === 'string' && val.trim() && val !== '••••••••') {
      data[key] = encrypt(val.trim());
    }
  }
  return prisma.whatsAppSettings.upsert({
    where: { companyId },
    update: data,
    create: { companyId, developmentMode: true, enabled: false, connectionStatus: 'not_connected', ...data },
  });
};

// Persist the outcome of a connection test (status + live flags + health
// history). Backend-only.
const recordConnection = async (companyId, patch = {}) => {
  const data = {};
  for (const k of ['connectionStatus', 'apiVersion', 'environment', 'lastError', 'lastMetaErrorCode']) if (patch[k] !== undefined) data[k] = patch[k];
  for (const k of ['phoneVerified', 'tokenValid', 'businessVerified', 'tokenExpired']) if (patch[k] !== undefined) data[k] = Boolean(patch[k]);
  for (const k of ['lastHttpStatus']) if (patch[k] !== undefined) data[k] = patch[k];
  for (const k of ['lastConnectedAt', 'lastSuccessAt', 'lastFailureAt', 'lastTestedAt']) if (patch[k] !== undefined) data[k] = patch[k];
  return prisma.whatsAppSettings.update({ where: { companyId }, data }).catch(() => null);
};

// Whether the Meta Cloud API is actually configured (creds present).
const isMetaConfigured = (settings) =>
  Boolean(settings && settings.phoneNumberId && settings.permanentAccessToken && settings.whatsappBusinessAccountId);

module.exports = {
  WRITABLE_FIELDS, SECRET_FIELDS, pick,
  getOrCreate, getDecrypted, getForClient, redactForClient,
  update, recordConnection, isMetaConfigured,
};
