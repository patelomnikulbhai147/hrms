// ─────────────────────────────────────────────────────────────────────────────
// whatsappValidation — Phase 2.5 credential format validation.
//
// Rejects OBVIOUSLY invalid values BEFORE any Meta API call is attempted, so a
// typo doesn't burn a network round-trip or produce a confusing Meta error. Only
// fields actually present (non-empty) in the payload are checked — blank secret
// fields mean "keep the stored value" and are skipped.
// ─────────────────────────────────────────────────────────────────────────────

const has = (v) => typeof v === 'string' && v.trim() !== '';

// Meta object ids are numeric strings (typically 15–16 digits). Accept 8–25 to
// be tolerant of future id widths without allowing free text.
const ID_RE = /^\d{8,25}$/;

const isHttpsUrl = (v) => {
  try { const u = new URL(String(v).trim()); return u.protocol === 'https:'; } catch { return false; }
};

// Returns { ok, errors } where errors is { field: message }.
const validateCredentials = (body = {}) => {
  const e = {};

  if (has(body.metaBusinessId) && !ID_RE.test(body.metaBusinessId.trim()))
    e.metaBusinessId = 'Business ID must be a 8–25 digit number.';

  if (has(body.whatsappBusinessAccountId) && !ID_RE.test(body.whatsappBusinessAccountId.trim()))
    e.whatsappBusinessAccountId = 'WhatsApp Business Account ID must be a 8–25 digit number.';

  if (has(body.phoneNumberId) && !ID_RE.test(body.phoneNumberId.trim()))
    e.phoneNumberId = 'Phone Number ID must be a 8–25 digit number.';

  if (has(body.webhookUrl) && !isHttpsUrl(body.webhookUrl))
    e.webhookUrl = 'Webhook URL must be a valid https:// URL.';

  // Secrets are only present when the user typed a NEW value.
  if (has(body.verifyToken)) {
    const t = body.verifyToken.trim();
    if (t.length < 6) e.verifyToken = 'Verify Token must be at least 6 characters.';
    else if (/\s/.test(t)) e.verifyToken = 'Verify Token must not contain spaces.';
  }

  if (has(body.permanentAccessToken)) {
    const t = body.permanentAccessToken.trim();
    if (t.length < 30) e.permanentAccessToken = 'Access Token looks too short — paste the full Permanent Access Token.';
    else if (/\s/.test(t)) e.permanentAccessToken = 'Access Token must not contain spaces.';
  }

  // Developer test number, if provided, should look like an E.164-ish number.
  if (has(body.developerTestNumber)) {
    const digits = body.developerTestNumber.replace(/[^\d]/g, '');
    if (digits.length < 10 || digits.length > 15) e.developerTestNumber = 'Enter a valid phone number with country code (e.g. +9198XXXXXXXX).';
  }

  return { ok: Object.keys(e).length === 0, errors: e };
};

module.exports = { validateCredentials, ID_RE, isHttpsUrl };
