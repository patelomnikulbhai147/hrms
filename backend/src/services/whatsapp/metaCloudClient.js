// ─────────────────────────────────────────────────────────────────────────────
// metaCloudClient — the ONLY place that talks to the Meta WhatsApp Cloud API.
//
// Phase 2: real Graph API calls (verifyPhoneNumber + sendText).
// Phase 2.5: production hardening — a retry policy for TRANSIENT failures only
// (network timeout / HTTP 429 / HTTP 5xx), per-call request metadata for the
// API request history, and a best-effort business-verification probe used for
// sandbox-vs-production detection.
//
// Credentials are passed in already-decrypted by the caller — this module never
// reads settings or the DB, and never logs the token. API version is env-driven
// (META_API_VERSION, default v21.0); timeouts via AbortController.
// ─────────────────────────────────────────────────────────────────────────────

const GRAPH_BASE = 'https://graph.facebook.com';
const DEFAULT_TIMEOUT_MS = Number(process.env.META_TIMEOUT_MS) || 15000;
const MAX_RETRIES = Number(process.env.META_MAX_RETRIES) || 2;   // extra attempts
const RETRY_BASE_MS = Number(process.env.META_RETRY_BASE_MS) || 500;

const apiVersion = () => process.env.META_API_VERSION || 'v21.0';

// Normalize a phone number to the E.164 *digits* Meta expects: country code +
// subscriber number, with NO leading '+'. Crucially this PRESERVES the country
// code — it only removes formatting and the call prefixes that would make the
// value fail Meta's allow-list match (the cause of error #131030):
//   • strips spaces, dashes, parentheses, dots
//   • drops a single leading '+'            ("+919876543210" → "919876543210")
//   • drops a leading '00' intl. call prefix ("00919876543210" → "919876543210")
// It never strips the country code and never truncates to the last N digits.
const normalizeNumber = (n) => {
  let s = String(n || '').trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  return s.replace(/[^\d]/g, '');
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Single fetch with a hard timeout. Always RESOLVES (never throws) to a uniform
// shape so the retry layer can decide uniformly.
const callOnce = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    return { network: false, ok: res.ok, httpStatus: res.status, body, durationMs: Date.now() - startedAt };
  } catch (e) {
    return { network: true, timeout: e.name === 'AbortError', error: e.message, httpStatus: null, durationMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
};

// Is a result a TRANSIENT failure worth retrying?
const isTransient = (r) =>
  r.network || r.httpStatus === 429 || (typeof r.httpStatus === 'number' && r.httpStatus >= 500);

// fetch + retry policy. Retries ONLY transient failures (network timeout / 429 /
// 5xx) with linear backoff. Auth / 4xx errors are returned immediately (never
// retried). Returns the last result plus an `attempts` count.
const callGraph = async (url, options = {}, { retries = MAX_RETRIES } = {}) => {
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await callOnce(url, options);
    last.attempts = attempt + 1;
    if (!isTransient(last)) return last;     // success or permanent failure → stop
    if (attempt < retries) await sleep(RETRY_BASE_MS * (attempt + 1));
  }
  return last;
};

// Map a Graph API error payload to one of the well-defined statuses. Never
// returns a generic blob — always a specific status + the Meta message.
const classifyError = (httpStatus, error) => {
  const code = error && error.code;
  const sub = error && error.error_subcode;
  const msg = (error && error.message) || 'Unknown Meta API error.';
  // Auth / token problems (190 = expired/invalid token).
  if (httpStatus === 401 || code === 190) return { status: 'Authentication Failed', message: 'Access token is invalid or expired.', code, sub, tokenExpired: true };
  if (code === 200 || code === 10 || code === 299) return { status: 'Authentication Failed', message: 'The access token lacks the required WhatsApp permissions.', code, sub, tokenExpired: false };
  // Bad object id (phone number id / business id).
  if (httpStatus === 404 || code === 100 || code === 803) return { status: 'Invalid Phone Number ID', message: 'The Phone Number ID was not found or is not accessible with this token.', code, sub };
  // Rate limiting.
  if (code === 4 || code === 80007 || code === 130429 || code === 131048 || httpStatus === 429) return { status: 'Rate Limit', message: 'Meta rate limit reached. Try again shortly.', code, sub };
  // Recipient / re-engagement / undeliverable.
  if (code === 131047) return { status: 'Meta API Error', message: 'Re-engagement required: the recipient must message your WhatsApp number first (24-hour window), or you must use an approved template.', code, sub };
  if (code === 131026 || code === 131051) return { status: 'Meta API Error', message: 'Message undeliverable to this recipient. Confirm the number is on WhatsApp and allowed for your test number.', code, sub };
  if (typeof httpStatus === 'number' && httpStatus >= 500) return { status: 'Meta API Error', message: 'Meta is temporarily unavailable (server error). Please retry shortly.', code, sub };
  return { status: 'Meta API Error', message: msg, code, sub };
};

const reqMeta = (operation, endpoint, method, r, extra = {}) => ({
  operation, endpoint, method,
  httpStatus: r.httpStatus, durationMs: r.durationMs, attempts: r.attempts || 1,
  ok: !!r.ok, ...extra,
});

// Connection test — GET the phone number node. A 200 with an id proves the
// Phone Number ID is valid AND the token can access it.
const verifyPhoneNumber = async ({ phoneNumberId, accessToken }) => {
  const ver = apiVersion();
  const path = `/${ver}/${encodeURIComponent(phoneNumberId)}`;
  const endpoint = `${path}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,platform_type`;
  const r = await callGraph(`${GRAPH_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (r.network) {
    return { ok: false, status: 'Network Error', message: r.timeout ? 'Network timeout contacting Meta.' : `Network error contacting Meta: ${r.error}`, apiVersion: ver, request: reqMeta('connection_test', endpoint, 'GET', r) };
  }
  if (r.ok && r.body && r.body.id) {
    const codeVerified = r.body.code_verification_status === 'VERIFIED';
    return {
      ok: true, status: 'Connected',
      message: `Connected to ${r.body.display_phone_number || 'your WhatsApp number'}${r.body.verified_name ? ` (${r.body.verified_name})` : ''}.`,
      apiVersion: ver, phoneVerified: true, tokenValid: true, tokenExpired: false,
      details: { displayPhoneNumber: r.body.display_phone_number, verifiedName: r.body.verified_name, qualityRating: r.body.quality_rating, codeVerificationStatus: r.body.code_verification_status, codeVerified },
      request: reqMeta('connection_test', endpoint, 'GET', r),
    };
  }
  const c = classifyError(r.httpStatus, r.body && r.body.error);
  return {
    ok: false, status: c.status, message: c.message, apiVersion: ver,
    phoneVerified: false, tokenValid: c.status !== 'Authentication Failed', tokenExpired: !!c.tokenExpired,
    details: { httpStatus: r.httpStatus, errorCode: c.code, errorSubcode: c.sub },
    request: reqMeta('connection_test', endpoint, 'GET', r, { metaErrorCode: c.code }),
  };
};

// Best-effort WABA review status (sandbox vs production signal). Never the main
// gate — failures are swallowed and reported as not-verified.
const verifyBusiness = async ({ wabaId, accessToken }) => {
  if (!wabaId) return { businessVerified: false };
  const ver = apiVersion();
  const endpoint = `/${ver}/${encodeURIComponent(wabaId)}?fields=name,account_review_status`;
  const r = await callGraph(`${GRAPH_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${accessToken}` } }, { retries: 0 });
  if (r.ok && r.body && !r.body.error) {
    return { businessVerified: r.body.account_review_status === 'APPROVED', accountReviewStatus: r.body.account_review_status, name: r.body.name, request: reqMeta('connection_test', endpoint, 'GET', r) };
  }
  return { businessVerified: false, request: reqMeta('connection_test', endpoint, 'GET', r) };
};

// Send a plain text WhatsApp message.
const sendText = async ({ phoneNumberId, accessToken, to, body }) => {
  const ver = apiVersion();
  const endpoint = `/${ver}/${encodeURIComponent(phoneNumberId)}/messages`;
  const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to: normalizeNumber(to), type: 'text', text: { preview_url: false, body } };
  const url = `${GRAPH_BASE}${endpoint}`;
  // Trace the EXACT Graph request (access token lives in the Authorization header
  // and is never logged).
  console.log('[WhatsApp][sendText] POST url=%s payload=%s', url, JSON.stringify(payload));
  const r = await callGraph(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  // Trace the EXACT Graph response: HTTP status, Meta error code, and full body.
  console.log('[WhatsApp][sendText] response httpStatus=%s metaErrorCode=%s body=%s',
    r.httpStatus == null ? '-' : r.httpStatus,
    (r.body && r.body.error && r.body.error.code != null) ? r.body.error.code : '-',
    JSON.stringify(r.network ? { networkError: r.error, timeout: !!r.timeout } : (r.body || {})));

  if (r.network) {
    return { ok: false, status: r.timeout ? 'Network Timeout' : 'Network Error', message: r.timeout ? 'Network timeout contacting Meta.' : `Network error contacting Meta: ${r.error}`, request: reqMeta('send_test', endpoint, 'POST', r) };
  }
  if (r.ok && r.body && Array.isArray(r.body.messages) && r.body.messages[0]) {
    const messageId = r.body.messages[0].id;
    return { ok: true, status: 'Sent', messageId, httpStatus: r.httpStatus, request: reqMeta('send_test', endpoint, 'POST', r, { metaMessageId: messageId }) };
  }
  const c = classifyError(r.httpStatus, r.body && r.body.error);
  return { ok: false, status: c.status, message: c.message, httpStatus: r.httpStatus, errorCode: c.code, errorSubcode: c.sub, tokenExpired: !!c.tokenExpired, request: reqMeta('send_test', endpoint, 'POST', r, { metaErrorCode: c.code }) };
};

// List the WhatsApp Business Account's message templates (Phase 3 — sync).
const listTemplates = async ({ wabaId, accessToken }) => {
  const ver = apiVersion();
  if (!wabaId) return { ok: false, status: 'Invalid Phone Number ID', message: 'WhatsApp Business Account ID is not set.', templates: [] };
  const endpoint = `/${ver}/${encodeURIComponent(wabaId)}/message_templates?fields=name,status,category,language,components,id&limit=200`;
  const r = await callGraph(`${GRAPH_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (r.network) return { ok: false, status: r.timeout ? 'Network Timeout' : 'Network Error', message: r.timeout ? 'Network timeout contacting Meta.' : `Network error contacting Meta: ${r.error}`, templates: [], request: reqMeta('sync_templates', endpoint, 'GET', r) };
  if (r.ok && r.body && Array.isArray(r.body.data)) {
    return { ok: true, status: 'OK', templates: r.body.data, paging: r.body.paging, request: reqMeta('sync_templates', endpoint, 'GET', r) };
  }
  const c = classifyError(r.httpStatus, r.body && r.body.error);
  return { ok: false, status: c.status, message: c.message, tokenExpired: !!c.tokenExpired, templates: [], request: reqMeta('sync_templates', endpoint, 'GET', r, { metaErrorCode: c.code }) };
};

// Send a TEMPLATE message (Phase 3 — template test). `components` is the Meta
// components array (header media + body parameters) already assembled.
const sendTemplate = async ({ phoneNumberId, accessToken, to, name, language, components }) => {
  const ver = apiVersion();
  const endpoint = `/${ver}/${encodeURIComponent(phoneNumberId)}/messages`;
  const template = { name, language: { code: language || 'en' } };
  if (Array.isArray(components) && components.length) template.components = components;
  const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to: normalizeNumber(to), type: 'template', template };
  console.log('[WhatsApp][sendTemplate] POST %s payload=%s', endpoint, JSON.stringify(payload));
  const r = await callGraph(`${GRAPH_BASE}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (r.network) return { ok: false, status: r.timeout ? 'Network Timeout' : 'Network Error', message: r.timeout ? 'Network timeout contacting Meta.' : `Network error contacting Meta: ${r.error}`, request: reqMeta('template_test', endpoint, 'POST', r) };
  if (r.ok && r.body && Array.isArray(r.body.messages) && r.body.messages[0]) {
    const messageId = r.body.messages[0].id;
    return { ok: true, status: 'Sent', messageId, httpStatus: r.httpStatus, request: reqMeta('template_test', endpoint, 'POST', r, { metaMessageId: messageId }) };
  }
  const c = classifyError(r.httpStatus, r.body && r.body.error);
  return { ok: false, status: c.status, message: c.message, httpStatus: r.httpStatus, errorCode: c.code, errorSubcode: c.sub, tokenExpired: !!c.tokenExpired, request: reqMeta('template_test', endpoint, 'POST', r, { metaErrorCode: c.code }) };
};

// Upload a media binary (e.g. a rendered greeting-card PNG) to the WhatsApp Cloud
// Media endpoint and return its Media ID. The Media ID is then referenced as the
// IMAGE header of an approved template (or in a free-form image message). Media
// IDs are tied to the phone number and expire after ~30 days on Meta's side.
//   buffer   — Node Buffer with the file bytes
//   mimeType — e.g. 'image/png' (Meta supports image/png, image/jpeg)
const uploadMedia = async ({ phoneNumberId, accessToken, buffer, mimeType = 'image/png', filename = 'card.png' }) => {
  const ver = apiVersion();
  const endpoint = `/${ver}/${encodeURIComponent(phoneNumberId)}/media`;
  const url = `${GRAPH_BASE}${endpoint}`;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  console.log('[WhatsApp][uploadMedia] POST %s bytes=%s mime=%s', endpoint, buffer ? buffer.length : 0, mimeType);
  // Note: FormData sets its own multipart Content-Type boundary — do NOT set it.
  const r = await callGraph(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form });
  console.log('[WhatsApp][uploadMedia] response httpStatus=%s body=%s',
    r.httpStatus == null ? '-' : r.httpStatus,
    JSON.stringify(r.network ? { networkError: r.error } : (r.body || {})));

  if (r.network) return { ok: false, status: r.timeout ? 'Network Timeout' : 'Network Error', message: r.timeout ? 'Network timeout contacting Meta.' : `Network error contacting Meta: ${r.error}`, request: reqMeta('upload_media', endpoint, 'POST', r) };
  if (r.ok && r.body && r.body.id) {
    return { ok: true, status: 'Uploaded', mediaId: r.body.id, httpStatus: r.httpStatus, request: reqMeta('upload_media', endpoint, 'POST', r, { mediaId: r.body.id }) };
  }
  const c = classifyError(r.httpStatus, r.body && r.body.error);
  return { ok: false, status: c.status, message: c.message, httpStatus: r.httpStatus, errorCode: c.code, errorSubcode: c.sub, tokenExpired: !!c.tokenExpired, request: reqMeta('upload_media', endpoint, 'POST', r, { metaErrorCode: c.code }) };
};

// Build the Meta components array for an approved template that has an IMAGE
// header (and optionally body variables). The image is supplied by Media ID
// (preferred — already uploaded) or by a public link.
const imageHeaderComponents = ({ mediaId, link, bodyParams } = {}) => {
  const components = [];
  if (mediaId || link) {
    const image = mediaId ? { id: mediaId } : { link };
    components.push({ type: 'header', parameters: [{ type: 'image', image }] });
  }
  if (Array.isArray(bodyParams) && bodyParams.length) {
    components.push({ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: String(t) })) });
  }
  return components;
};

// Send a free-form IMAGE message (type:image) by Media ID or link, with an
// optional caption. NOTE: like free-form text, this only DELIVERS inside an open
// 24-hour customer-service window — use an approved image template (sendTemplate
// + imageHeaderComponents) for proactive greetings that must always deliver.
const sendImage = async ({ phoneNumberId, accessToken, to, mediaId, link, caption }) => {
  const ver = apiVersion();
  const endpoint = `/${ver}/${encodeURIComponent(phoneNumberId)}/messages`;
  const image = mediaId ? { id: mediaId } : { link };
  if (caption) image.caption = caption;
  const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to: normalizeNumber(to), type: 'image', image };
  console.log('[WhatsApp][sendImage] POST %s payload=%s', endpoint, JSON.stringify(payload));
  const r = await callGraph(`${GRAPH_BASE}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (r.network) return { ok: false, status: r.timeout ? 'Network Timeout' : 'Network Error', message: r.timeout ? 'Network timeout contacting Meta.' : `Network error contacting Meta: ${r.error}`, request: reqMeta('send_image', endpoint, 'POST', r) };
  if (r.ok && r.body && Array.isArray(r.body.messages) && r.body.messages[0]) {
    const messageId = r.body.messages[0].id;
    return { ok: true, status: 'Sent', messageId, httpStatus: r.httpStatus, request: reqMeta('send_image', endpoint, 'POST', r, { metaMessageId: messageId }) };
  }
  const c = classifyError(r.httpStatus, r.body && r.body.error);
  return { ok: false, status: c.status, message: c.message, httpStatus: r.httpStatus, errorCode: c.code, errorSubcode: c.sub, tokenExpired: !!c.tokenExpired, request: reqMeta('send_image', endpoint, 'POST', r, { metaErrorCode: c.code }) };
};

module.exports = { apiVersion, normalizeNumber, verifyPhoneNumber, verifyBusiness, sendText, sendTemplate, listTemplates, uploadMedia, imageHeaderComponents, sendImage, classifyError, isTransient };
