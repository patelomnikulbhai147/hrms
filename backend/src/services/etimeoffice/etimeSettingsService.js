// ─────────────────────────────────────────────────────────────────────────────
// etimeSettingsService — per-company E-TimeOffice connection config (CRUD +
// crypto boundary). The API password is stored ENCRYPTED (AES-256-GCM) and is
// NEVER returned to a client in plaintext (sanitize() exposes only a boolean).
// getDecryptedCreds() is server-side only and used by the sync engine/client.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../../config/prisma');
const { encrypt, decrypt } = require('../../utils/secretCrypto');
const { DEFAULT_BASE_URL } = require('./etimeClient');

// Strip the ciphertext before returning to any client; expose apiPasswordSet.
const sanitize = (c) => {
  if (!c) return c;
  const { apiPassword, ...rest } = c;
  return { ...rest, apiPasswordSet: !!apiPassword };
};

// Load a company's connection (or a safe default shell if none saved yet).
async function get(companyId) {
  const row = await prisma.etimeConnection.findUnique({ where: { companyId } });
  return row || null;
}

async function getOrCreate(companyId) {
  const existing = await prisma.etimeConnection.findUnique({ where: { companyId } });
  if (existing) return existing;
  return prisma.etimeConnection.create({
    data: { companyId, apiBaseUrl: DEFAULT_BASE_URL },
  });
}

// Map an incoming body to editable columns (password handled separately so it
// can be encrypted; a blank/omitted password leaves the stored one unchanged).
function shapeFields(b) {
  const out = {};
  if (b.enabled !== undefined) out.enabled = b.enabled === true || b.enabled === 'true' || b.enabled === 1 || b.enabled === '1';
  if (b.apiBaseUrl !== undefined) out.apiBaseUrl = b.apiBaseUrl ? String(b.apiBaseUrl).trim() : DEFAULT_BASE_URL;
  if (b.corporateId !== undefined) out.corporateId = b.corporateId ? String(b.corporateId).trim() : null;
  if (b.apiUsername !== undefined) out.apiUsername = b.apiUsername ? String(b.apiUsername).trim() : null;
  if (b.empCode !== undefined) out.empCode = b.empCode ? String(b.empCode).trim() : 'ALL';
  // Merged from the retired Attendance Devices module.
  if (b.vendor !== undefined) out.vendor = b.vendor ? String(b.vendor).trim() : 'E-TimeOffice';
  if (b.branchId !== undefined) {
    const n = Number(b.branchId);
    out.branchId = (b.branchId === '' || b.branchId === null || !Number.isFinite(n)) ? null : Math.round(n);
  }
  if (b.deviceSerialNumber !== undefined) out.deviceSerialNumber = b.deviceSerialNumber ? String(b.deviceSerialNumber).trim() : null;
  if (b.deviceLocation !== undefined) out.deviceLocation = b.deviceLocation ? String(b.deviceLocation).trim() : null;
  if (b.syncIntervalMinutes !== undefined) {
    const n = Number(b.syncIntervalMinutes);
    out.syncIntervalMinutes = Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), 1440) : 30;
  }
  if (b.syncWindowDays !== undefined) {
    const n = Number(b.syncWindowDays);
    out.syncWindowDays = Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), 31) : 2;
  }
  return out;
}

async function save(companyId, body) {
  const data = shapeFields(body || {});
  // Encrypt a newly-supplied non-blank password; otherwise leave existing as-is.
  if (body && body.apiPassword !== undefined && String(body.apiPassword).trim() !== '') {
    data.apiPassword = encrypt(String(body.apiPassword));
  }
  const existing = await prisma.etimeConnection.findUnique({ where: { companyId } });
  if (existing) {
    return prisma.etimeConnection.update({ where: { companyId }, data });
  }
  return prisma.etimeConnection.create({
    data: { companyId, apiBaseUrl: DEFAULT_BASE_URL, ...data },
  });
}

// Server-side only: return the connection with the password decrypted, ready to
// hand to etimeClient. Returns null if not configured. Never expose this to HTTP.
async function getDecryptedCreds(companyId) {
  const row = await prisma.etimeConnection.findUnique({ where: { companyId } });
  if (!row) return null;
  return {
    companyId: row.companyId,
    apiBaseUrl: row.apiBaseUrl || DEFAULT_BASE_URL,
    corporateId: row.corporateId || '',
    username: row.apiUsername || '',
    password: row.apiPassword ? decrypt(row.apiPassword) : '',
    empCode: row.empCode || 'ALL',
    _row: row,
  };
}

// Does this connection have the minimum needed to attempt a live call?
const hasCredentials = (row) => !!(row && row.corporateId && row.apiUsername && row.apiPassword);

module.exports = { get, getOrCreate, save, sanitize, getDecryptedCreds, hasCredentials, shapeFields };
