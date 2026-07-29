/**
 * Cashfree Payment Gateway client (API version 2023-08-01).
 *
 * This is the ONLY file that talks HTTP to the Cashfree PG product. It is a
 * separate merchant application from the Secure ID / Bank Verification suite,
 * so it reads its own env credentials:
 *
 *   CASHFREE_PG_CLIENT_ID / CASHFREE_PG_CLIENT_SECRET
 *   CASHFREE_PG_ENV = sandbox | production   (default sandbox — going live is
 *                                             a deliberate config change)
 *
 * Secrets never leave this process: the frontend only ever receives the
 * payment_session_id, which Cashfree designed to be public.
 */
const crypto = require('crypto');

const API_VERSION = '2023-08-01';
const TIMEOUT_MS = 15000;

class CashfreePgError extends Error {
  constructor(message, { httpStatus = null, code = null, raw = null } = {}) {
    super(message);
    this.name = 'CashfreePgError';
    this.httpStatus = httpStatus;
    this.code = code;
    this.raw = raw;
  }
}

function envMode() {
  const raw = String(process.env.CASHFREE_PG_ENV || 'sandbox').toLowerCase();
  return raw === 'production' || raw === 'prod' ? 'production' : 'sandbox';
}

function baseUrl() {
  if (process.env.CASHFREE_PG_BASE_URL) return process.env.CASHFREE_PG_BASE_URL.replace(/\/$/, '');
  return envMode() === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
}

function credentials() {
  // Environment-paired credentials so going live is a pure config switch
  // (flip CASHFREE_PG_ENV) with both keypairs already in place. The generic
  // CASHFREE_PG_CLIENT_ID/SECRET pair works as a fallback for either mode.
  const prod = envMode() === 'production';
  return {
    clientId:
      (prod ? process.env.CASHFREE_PG_PROD_CLIENT_ID : process.env.CASHFREE_PG_SANDBOX_CLIENT_ID) ||
      process.env.CASHFREE_PG_CLIENT_ID || '',
    clientSecret:
      (prod ? process.env.CASHFREE_PG_PROD_CLIENT_SECRET : process.env.CASHFREE_PG_SANDBOX_CLIENT_SECRET) ||
      process.env.CASHFREE_PG_CLIENT_SECRET || '',
  };
}

function isConfigured() {
  const { clientId, clientSecret } = credentials();
  return Boolean(clientId && clientSecret);
}

/**
 * Diagnostic view of the credential state for the ACTIVE mode — names only,
 * never values. Drives the Super Admin "gateway configured" badge so a missing
 * sandbox keypair is reported as exactly that, not a generic failure.
 */
function configStatus() {
  const mode = envMode();
  const prod = mode === 'production';
  const idVar = prod ? 'CASHFREE_PG_PROD_CLIENT_ID' : 'CASHFREE_PG_SANDBOX_CLIENT_ID';
  const secretVar = prod ? 'CASHFREE_PG_PROD_CLIENT_SECRET' : 'CASHFREE_PG_SANDBOX_CLIENT_SECRET';
  const { clientId, clientSecret } = credentials();
  const missing = [];
  if (!clientId) missing.push(idVar);
  if (!clientSecret) missing.push(secretVar);
  return {
    mode,
    configured: missing.length === 0,
    missing,
    hint: missing.length === 0
      ? null
      : `Cashfree Payment Gateway credentials are not configured for ${mode} mode. Set ${missing.join(' and ')} (or the generic CASHFREE_PG_CLIENT_ID/SECRET pair) in backend/.env and restart the backend. These are Payment Gateway keys — separate from the CASHFREE_PROD_* bank-verification keys.`,
  };
}

function authHeaders() {
  const { clientId, clientSecret } = credentials();
  return {
    'x-client-id': clientId,
    'x-client-secret': clientSecret,
    'x-api-version': API_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function request(method, path, { body = null, retryOnNetworkError = false } = {}) {
  if (!isConfigured()) {
    throw new CashfreePgError('Payment gateway credentials are not configured.', { code: 'PG_NOT_CONFIGURED' });
  }
  const url = `${baseUrl()}${path}`;
  const attempt = async () => {
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) {
      throw new CashfreePgError(
        `Cashfree PG ${method} ${path} failed: ${data?.message || data?.code || res.statusText} (HTTP ${res.status})`,
        { httpStatus: res.status, code: data?.code || data?.type || null, raw: data }
      );
    }
    return data;
  };

  try {
    return await attempt();
  } catch (err) {
    // Retry once on a pure network/timeout failure — but only for idempotent
    // reads. Order creation is safe to surface instead: our orderId is unique,
    // so the caller can retry explicitly without risking a duplicate order.
    const isNetwork = !(err instanceof CashfreePgError) || err.httpStatus === null;
    if (retryOnNetworkError && isNetwork && !(err instanceof CashfreePgError && err.httpStatus)) {
      return await attempt();
    }
    throw err;
  }
}

/**
 * Cashfree requires customer_phone to be a plain valid mobile number. Company
 * records hold phones in many formats ("+91 98765 43210", "0281-2451234",
 * empty) — normalize to the last 10 digits and accept only a valid Indian
 * mobile (starts 6-9); anything else falls back to the neutral placeholder so
 * a malformed phone on file can never block a payment. The phone is purely
 * informational for the gateway — tenant identity lives in our own order row.
 */
function sanitizeCustomerPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(last10) ? last10 : '9999999999';
}

/**
 * Create a PG order. `order_id` is OUR merchant order id (unique in
 * payment_orders), which makes creation replay-safe: Cashfree rejects a
 * duplicate order_id instead of double-charging.
 */
async function createOrder({ orderId, amount, currency = 'INR', customer, note = null, meta = null, expiryMinutes = 30 }) {
  const body = {
    order_id: orderId,
    order_amount: Number(Number(amount).toFixed(2)),
    order_currency: currency,
    customer_details: {
      customer_id: String(customer.id),
      customer_name: customer.name || undefined,
      customer_email: customer.email || undefined,
      customer_phone: sanitizeCustomerPhone(customer.phone),
    },
    order_note: note || undefined,
    order_meta: meta || undefined,
    order_expiry_time: new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
  };
  return request('POST', '/orders', { body });
}

/** Fetch an order — the server-side source of truth for its status. */
async function getOrder(orderId) {
  return request('GET', `/orders/${encodeURIComponent(orderId)}`, { retryOnNetworkError: true });
}

/** All payment attempts against an order (success verification reads these). */
async function getOrderPayments(orderId) {
  return request('GET', `/orders/${encodeURIComponent(orderId)}/payments`, { retryOnNetworkError: true });
}

/** Refunds recorded against an order. */
async function getOrderRefunds(orderId) {
  return request('GET', `/orders/${encodeURIComponent(orderId)}/refunds`, { retryOnNetworkError: true });
}

/**
 * Webhook signature check (2023-08-01 contract):
 *   expected = Base64( HMAC-SHA256( timestamp + rawBody, clientSecret ) )
 * compared timing-safe against the x-webhook-signature header. Requires the
 * EXACT raw request bytes — the webhook route must be mounted before any JSON
 * body parser.
 */
function verifyWebhookSignature({ signature, timestamp, rawBody }) {
  const { clientSecret } = credentials();
  if (!clientSecret || !signature || !timestamp || rawBody == null) return false;
  const payload = String(timestamp) + (Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
  const expected = crypto.createHmac('sha256', clientSecret).update(payload).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  API_VERSION,
  CashfreePgError,
  envMode,
  baseUrl,
  isConfigured,
  configStatus,
  createOrder,
  getOrder,
  getOrderPayments,
  getOrderRefunds,
  verifyWebhookSignature,
};
