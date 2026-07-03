// ─────────────────────────────────────────────────────────────────────────────
// etimeClient — the ONLY place that talks to the E-TimeOffice attendance API.
//
// Mirrors the metaCloudClient pattern: native fetch + AbortController timeout +
// a retry policy for TRANSIENT failures only (network timeout / HTTP 429 / 5xx).
// Credentials are passed in already-decrypted by the caller — this module never
// reads settings or the DB, and never logs the password.
//
// Auth (per the E-TimeOffice API docs): Basic auth where the userinfo string is
//   "Corporateid:Username:Password:True"  → Base64 → "Authorization: Basic <b64>".
// Date params use the documented "dd/MM/yyyy" (IN/OUT) / "dd/MM/yyyy_HH:mm" form.
// Base URL is fully configurable per company (never hardcoded beyond a default).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.etimeoffice.com/api/';
const DEFAULT_TIMEOUT_MS = Number(process.env.ETIME_TIMEOUT_MS) || 20000;
const MAX_RETRIES = Number(process.env.ETIME_MAX_RETRIES) || 2;
const RETRY_BASE_MS = Number(process.env.ETIME_RETRY_BASE_MS) || 600;
// Verbose per-call logging (headers/body) is opt-in; the concise one-line outcome
// log is always emitted so a failing sync is diagnosable without guessing.
const DEBUG = process.env.ETIME_DEBUG === 'on';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Never let a secret reach the logs. The URL carries no password, but the query
// string can carry an Empcode — that's fine to log. This strips nothing from the
// URL today; it exists so future URL-embedded secrets are redacted in one place.
const redactUrl = (url) => String(url || '');

// Single structured log line for every outbound call. `phase` = REQUEST | RESULT.
const logCall = (phase, fields) => {
  try {
    const flat = Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
    console.log(`[etime][client][${phase}] ${flat}`);
  } catch { /* logging must never break a sync */ }
};

// Build the "Basic <base64>" header value from the tenant credentials.
const buildAuthHeader = ({ corporateId, username, password }) => {
  const raw = `${corporateId || ''}:${username || ''}:${password || ''}:True`;
  return 'Basic ' + Buffer.from(raw, 'utf8').toString('base64');
};

// Normalise a base URL to exactly one trailing slash so endpoint joining is safe.
const normalizeBase = (base) => {
  const b = String(base || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  return b.endsWith('/') ? b : b + '/';
};

// Format a JS Date as "dd/MM/yyyy" (the IN/OUT endpoint's documented form).
const fmtDate = (d) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Single fetch with a hard timeout. Always RESOLVES to a uniform shape so the
// retry layer can decide uniformly (never throws). Captures the raw response text
// and a few diagnostic headers so a failure can be explained precisely.
const callOnce = async (url, headers) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; }
    catch { body = { _raw: String(text).slice(0, 2000) }; } // non-JSON (HTML error page etc.)
    // Defensive: never assume the response exposes a WHATWG Headers object.
    const getHeader = (name) => {
      try { return res.headers && typeof res.headers.get === 'function' ? res.headers.get(name) : null; }
      catch { return null; }
    };
    const server = getHeader('server') || getHeader('x-powered-by') || null;
    return {
      network: false, ok: res.ok, httpStatus: res.status, body,
      rawText: text || '', bodyEmpty: !text || !String(text).trim(), server,
      durationMs: Date.now() - startedAt,
    };
  } catch (e) {
    return { network: true, timeout: e.name === 'AbortError', error: e.message, ok: false, httpStatus: null, rawText: '', bodyEmpty: true, durationMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
};

// An EMPTY-bodied 5xx from the E-TimeOffice stack (nginx + ASP.NET) is its generic
// response to a request it won't authenticate/authorize — it is deterministic, not
// a transient blip, so retrying it only triples latency. Verified live: dummy creds,
// no auth header, and a bogus path all return the identical empty HTTP 500. A 5xx
// that DOES carry a body may be a genuine transient hiccup, so that still retries.
const isDeterministic500 = (r) =>
  !r.network && typeof r.httpStatus === 'number' && r.httpStatus >= 500 && r.bodyEmpty;

const isTransient = (r) =>
  isDeterministic500(r) ? false
  : (r.network || r.httpStatus === 429 || (typeof r.httpStatus === 'number' && r.httpStatus >= 500));

// fetch + retry (transient only, linear backoff). Auth/4xx and deterministic empty
// 5xx are returned immediately. Every call is logged (concise always, full on DEBUG).
const call = async (url, headers, { retries = MAX_RETRIES, endpoint = '' } = {}) => {
  logCall('REQUEST', { endpoint, url: redactUrl(url), method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS });
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await callOnce(url, headers);
    last.attempts = attempt + 1;
    logCall('RESULT', {
      endpoint, attempt: attempt + 1, httpStatus: last.httpStatus, ok: last.ok,
      network: last.network || undefined, timeout: last.timeout || undefined,
      bodyEmpty: last.bodyEmpty || undefined, server: last.server,
      durationMs: last.durationMs,
      body: DEBUG ? String(last.rawText || '').slice(0, 500) : undefined,
    });
    if (!isTransient(last)) return last;
    if (attempt < retries) await sleep(RETRY_BASE_MS * (attempt + 1));
  }
  return last;
};

// A compact, safe snapshot of the raw response for logs / sync-log persistence /
// the admin UI — so a failure never has to be diagnosed by guessing. Carries no
// secret (the Authorization header is never included here).
const rawOf = (r) => ({
  httpStatus: r.httpStatus ?? null,
  bodyEmpty: !!r.bodyEmpty,
  server: r.server || null,
  bodySnippet: r.rawText ? String(r.rawText).slice(0, 500) : '',
  attempts: r.attempts,
  durationMs: r.durationMs,
});

// Turn a raw call result into a normalised, never-throwing outcome that the sync
// engine and controller can log/branch on uniformly. Every failure carries an
// ACTIONABLE message and a `raw` snapshot of what E-TimeOffice actually returned.
const classify = (r) => {
  const raw = rawOf(r);
  if (r.network) {
    return { ok: false, status: r.timeout ? 'TIMEOUT' : 'NETWORK_ERROR', message: r.timeout ? `Network timeout contacting E-TimeOffice (no response within ${DEFAULT_TIMEOUT_MS / 1000}s). Check the API Base URL and network/firewall.` : `Network error contacting E-TimeOffice: ${r.error}. Check the API Base URL and connectivity.`, httpStatus: null, durationMs: r.durationMs, attempts: r.attempts, raw };
  }
  if (r.httpStatus === 401 || r.httpStatus === 403) {
    return { ok: false, status: 'AUTH_FAILED', message: `E-TimeOffice rejected the credentials (HTTP ${r.httpStatus}). Verify Corporate ID, API Username and API Password, and that API access is enabled for this account.`, httpStatus: r.httpStatus, durationMs: r.durationMs, attempts: r.attempts, body: r.body, raw };
  }
  // E-TimeOffice's stack returns a BARE, empty-bodied 5xx for anything it won't
  // authenticate/authorize (verified live: bad creds, no auth, and bogus paths all
  // return the identical empty HTTP 500). So an empty 5xx is overwhelmingly a
  // credentials / API-access / request problem — NOT a server outage. Say so.
  if (typeof r.httpStatus === 'number' && r.httpStatus >= 500 && r.bodyEmpty) {
    return {
      ok: false,
      status: 'AUTH_OR_CONFIG_ERROR',
      message: `E-TimeOffice returned HTTP ${r.httpStatus} with no error details. For this API that almost always means the Corporate ID / API Username / API Password were rejected, or API access is not enabled for this account. Verify the API credentials in the E-TimeOffice portal (the API login can differ from the web-portal login). Note: a device showing "Connected" in the portal does not by itself grant API access. (Less likely: a temporary E-TimeOffice outage.)`,
      httpStatus: r.httpStatus, durationMs: r.durationMs, attempts: r.attempts, raw,
    };
  }
  if (!r.ok) {
    const detail = r.body && r.body._raw ? ` Response: ${String(r.body._raw).slice(0, 200)}` : '';
    return { ok: false, status: 'HTTP_ERROR', message: `E-TimeOffice returned HTTP ${r.httpStatus}.${detail}`, httpStatus: r.httpStatus, durationMs: r.durationMs, attempts: r.attempts, body: r.body, raw };
  }
  // The API signals logical errors in the body via { Error: true, Msg }.
  if (r.body && r.body.Error === true) {
    return { ok: false, status: 'API_ERROR', message: r.body.Msg || 'E-TimeOffice reported an error.', httpStatus: r.httpStatus, durationMs: r.durationMs, attempts: r.attempts, body: r.body, raw };
  }
  return { ok: true, status: 'OK', httpStatus: r.httpStatus, durationMs: r.durationMs, attempts: r.attempts, body: r.body, raw };
};

/**
 * DownloadInOutPunchData — per-employee, per-day IN/OUT summary. This is the
 * primary sync source: one record per employee per date maps cleanly onto the
 * `attendance` table's one-row-per-(employee,date) model.
 * @returns { ok, status, message?, records: [], httpStatus, durationMs }
 */
async function downloadInOutPunchData(creds, { empCode = 'ALL', fromDate, toDate } = {}) {
  const base = normalizeBase(creds.apiBaseUrl);
  const from = fromDate instanceof Date ? fmtDate(fromDate) : String(fromDate);
  const to = toDate instanceof Date ? fmtDate(toDate) : String(toDate);
  const url = `${base}DownloadInOutPunchData?Empcode=${encodeURIComponent(empCode)}&FromDate=${encodeURIComponent(from)}&ToDate=${encodeURIComponent(to)}`;
  const headers = { Authorization: buildAuthHeader(creds), 'Content-Type': 'application/json' };
  const out = classify(await call(url, headers, { endpoint: 'DownloadInOutPunchData' }));
  const records = out.ok && out.body && Array.isArray(out.body.InOutPunchData) ? out.body.InOutPunchData : [];
  return { ...out, records, window: { from, to } };
}

/**
 * DownloadLastPunchData — incremental raw punches after a cursor (MMyyyy$ID).
 * Kept for future incremental raw-punch capture; returns rows + the new cursor.
 */
async function downloadLastPunchData(creds, { empCode = 'ALL', lastRecord } = {}) {
  const base = normalizeBase(creds.apiBaseUrl);
  const url = `${base}DownloadLastPunchData?Empcode=${encodeURIComponent(empCode)}&LastRecord=${encodeURIComponent(lastRecord || '')}`;
  const headers = { Authorization: buildAuthHeader(creds), 'Content-Type': 'application/json' };
  const out = classify(await call(url, headers, { endpoint: 'DownloadLastPunchData' }));
  const punches = out.ok && out.body && Array.isArray(out.body.PunchData) ? out.body.PunchData : [];
  const maxRecord = out.ok && out.body ? out.body.MaxRecord || null : null;
  return { ...out, punches, maxRecord };
}

/**
 * DownloadPunchData — raw punches (no IN/OUT flag). Provided for completeness.
 */
async function downloadPunchData(creds, { empCode = 'ALL', fromDate, toDate } = {}) {
  const base = normalizeBase(creds.apiBaseUrl);
  const from = fromDate instanceof Date ? `${fmtDate(fromDate)}_00:00` : String(fromDate);
  const to = toDate instanceof Date ? `${fmtDate(toDate)}_00:00` : String(toDate);
  const url = `${base}DownloadPunchData?Empcode=${encodeURIComponent(empCode)}&FromDate=${encodeURIComponent(from)}&ToDate=${encodeURIComponent(to)}`;
  const headers = { Authorization: buildAuthHeader(creds), 'Content-Type': 'application/json' };
  const out = classify(await call(url, headers, { endpoint: 'DownloadPunchData' }));
  const punches = out.ok && Array.isArray(out.body) ? out.body : (out.body && Array.isArray(out.body.PunchData) ? out.body.PunchData : []);
  return { ...out, punches };
}

/**
 * testConnection — a cheap, read-only probe: request today's IN/OUT window. A
 * 2xx with Error=false proves the base URL + credentials are valid.
 */
async function testConnection(creds) {
  const today = new Date();
  const res = await downloadInOutPunchData(creds, { empCode: creds.empCode || 'ALL', fromDate: today, toDate: today });
  if (res.ok) {
    return { ok: true, status: 'CONNECTED', message: 'Connected to E-TimeOffice successfully.', httpStatus: res.httpStatus, durationMs: res.durationMs, sampleCount: res.records.length, raw: res.raw };
  }
  return { ok: false, status: res.status, message: res.message || 'Connection test failed.', httpStatus: res.httpStatus, durationMs: res.durationMs, raw: res.raw };
}

module.exports = {
  DEFAULT_BASE_URL,
  buildAuthHeader,
  fmtDate,
  downloadInOutPunchData,
  downloadLastPunchData,
  downloadPunchData,
  testConnection,
};
