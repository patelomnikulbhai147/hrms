/**
 * secretCrypto — symmetric encryption for secrets stored at rest (e.g. device
 * vendor API passwords). Uses AES-256-GCM with a key derived from a server
 * secret. This is reversible (unlike password hashing) because the stored value
 * must be usable as an API credential later.
 *
 * Key source: DEVICE_CRED_SECRET if set, else JWT_SECRET, else a dev fallback.
 * Ciphertext format (string): "enc:v1:<ivB64>:<tagB64>:<dataB64>".
 */
const crypto = require('crypto');

const RAW_SECRET =
  process.env.DEVICE_CRED_SECRET ||
  process.env.JWT_SECRET ||
  'hrms_dev_device_credential_fallback_secret';

// Derive a stable 32-byte key from whatever secret length is provided.
const KEY = crypto.createHash('sha256').update(String(RAW_SECRET)).digest();
const PREFIX = 'enc:v1:';

/** Encrypt a plaintext string. Returns null for empty/nullish input. */
function encrypt(plain) {
  if (plain === undefined || plain === null || String(plain) === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/** Decrypt a value produced by encrypt(). Returns '' on any failure/empty. */
function decrypt(payload) {
  if (!payload || typeof payload !== 'string' || !payload.startsWith(PREFIX)) return '';
  try {
    const [, , ivB64, tagB64, dataB64] = payload.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** True when a value looks like our ciphertext (already encrypted). */
const isEncrypted = (v) => typeof v === 'string' && v.startsWith(PREFIX);

module.exports = { encrypt, decrypt, isEncrypted };
