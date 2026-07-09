// ── Global third-party integration settings (file-backed, no DB) ─────────────
// The HRMS is installed on-premise per customer. Integration configuration that
// is GLOBAL to the installation (not company-scoped) — e.g. the Google Maps API
// key the installer sets once — is stored in a small JSON file so it needs no
// database schema change and survives restarts. An optional environment variable
// acts as a fallback for fully-headless installs.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'integrations.json');

const DEFAULTS = {
  googleMaps: { apiKey: '', status: 'not_configured', lastVerified: null },
  security: {
    captchaEnabled: true,
    // true  → CAPTCHA on every login attempt.
    // false → CAPTCHA appears only after `failedAttemptsLimit` failures.
    // Toggle in Settings → Security.
    alwaysEnabled: true,
    failedAttemptsLimit: 3,
    lockoutLimit: 5,
    lockoutDuration: 10, // minutes
    captchaType: 'internal', // 'google_v2' | 'google_v3' | 'internal'
    googleV2SiteKey: '',
    googleV2SecretKey: '',
    googleV3SiteKey: '',
    googleV3SecretKey: ''
  }
};

function readAll() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      googleMaps: { ...DEFAULTS.googleMaps, ...(parsed.googleMaps || {}) },
      security: { ...DEFAULTS.security, ...(parsed.security || {}) }
    };
  } catch (_) {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function writeAll(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[integrationSettings] failed to persist:', e.message);
    return false;
  }
}

// ── Google Maps ──────────────────────────────────────────────────────────────
// Resolution order for the effective key: saved file value → env fallback.
function getGoogleMaps() {
  const all = readAll();
  const gm = all.googleMaps || {};
  const envKey = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const apiKey = (gm.apiKey || '').trim() || envKey;
  const savedStatus = gm.status && gm.status !== 'not_configured' ? gm.status : 'unverified';
  return {
    apiKey,
    source: gm.apiKey ? 'settings' : (envKey ? 'env' : 'none'),
    status: apiKey ? savedStatus : 'not_configured',
    lastVerified: gm.lastVerified || null,
  };
}

function setGoogleMaps({ apiKey, status, lastVerified }) {
  const all = readAll();
  all.googleMaps = all.googleMaps || {};
  if (apiKey !== undefined) all.googleMaps.apiKey = String(apiKey || '').trim();
  if (status !== undefined) all.googleMaps.status = status;
  if (lastVerified !== undefined) all.googleMaps.lastVerified = lastVerified;
  writeAll(all);
  return getGoogleMaps();
}

// ── Security Settings (CAPTCHA & Lockout) ───────────────────────────────────
function getSecuritySettings() {
  const all = readAll();
  return all.security || DEFAULTS.security;
}

function setSecuritySettings(settings) {
  const all = readAll();
  all.security = {
    ...DEFAULTS.security,
    ...(all.security || {}),
    ...settings
  };
  writeAll(all);
  return all.security;
}

// First 4 + last 4 characters, middle masked — safe to show an administrator.
function maskKey(key) {
  const k = String(key || '');
  if (!k) return '';
  if (k.length <= 8) return '••••';
  return `${k.slice(0, 4)}••••••${k.slice(-4)}`;
}

module.exports = {
  getGoogleMaps,
  setGoogleMaps,
  getSecuritySettings,
  setSecuritySettings,
  maskKey
};
