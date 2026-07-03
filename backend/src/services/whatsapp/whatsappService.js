// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppService — the facade that Phase 2 will wire to the Meta WhatsApp
// Business Cloud API. In Phase 1 it NEVER performs a network call: sendMessage()
// only enqueues + logs a simulated delivery, and testConfiguration() validates
// the local settings and reports readiness.
//
// Mirrors the emailService contract: methods return a structured result and
// NEVER throw, so callers decide how to surface outcomes.
//
//   Phase 2 TODO: implement `callMetaCloudApi()` using settings.phoneNumberId +
//   settings.permanentAccessToken, then have sendMessage() invoke it when
//   developmentMode is OFF and Meta is configured. No other file needs to change.
// ─────────────────────────────────────────────────────────────────────────────

const settingsService = require('./whatsappSettingsService');
const templateService = require('./whatsappTemplateService');
const queueService = require('./whatsappQueueService');
const placeholders = require('./whatsappPlaceholders');
const meta = require('./metaCloudClient');
const requestLog = require('./whatsappRequestLogService');

// The fixed connectivity-test message (kept for the delivery-log snapshot).
const TEST_MESSAGE = 'Hello from HRMate! WhatsApp Cloud API integration is working successfully.';

// "Send Test Message" delivers an APPROVED TEMPLATE (default Meta hello_world),
// EXACTLY like the Meta Dashboard "Send Message" button. Why this matters: a
// free-form TEXT message is accepted by Meta (HTTP 200 + wamid) but is only
// DELIVERED inside an open 24-hour customer-service window (i.e. the user messaged
// you first). With no open window the text is silently NOT delivered — which is
// exactly why the Dashboard (a template) was delivered while HRMate's text send
// returned 200 yet never arrived. A template can always open a conversation, so it
// delivers. Configurable via env.
const TEST_TEMPLATE_NAME = process.env.WHATSAPP_TEST_TEMPLATE || 'hello_world';
const TEST_TEMPLATE_LANG = process.env.WHATSAPP_TEST_TEMPLATE_LANG || 'en_US';

// Default country code applied ONLY when a Developer Test Number is saved as a
// bare national number (no '+', no '00', no leading country code). Meta's
// allow-list stores recipients in full international form (e.g. 919773271029), so
// a 10-digit national number like 9773271029 fails the allow-list match with
// error #131030. Configurable via env; defaults to '91' (India).
const DEFAULT_COUNTRY_CODE = String(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').replace(/[^\d]/g, '');

/**
 * Resolve the test recipient to full international (E.164) digits Meta expects.
 *  - If the entered number already carries a country code (typed with '+' or a
 *    '00' intl. prefix, or is already longer than a national subscriber number),
 *    it is preserved untouched.
 *  - A bare national number (optionally with a single trunk '0') gets the default
 *    country code prepended, so 9773271029 → 919773271029.
 * Returns { raw, normalized, prepended, defaultCountryCode }.
 */
const resolveTestRecipient = (raw) => {
  const compact = String(raw || '').trim().replace(/[\s\-().]/g, '');
  const hadCountryCode = compact.startsWith('+') || compact.startsWith('00');
  let digits = meta.normalizeNumber(raw); // strips +, 00, separators; preserves CC
  let prepended = false;
  if (!hadCountryCode && DEFAULT_COUNTRY_CODE) {
    const national = digits.replace(/^0+/, ''); // drop a national trunk '0'
    if (national.length > 0 && national.length <= 10) {
      digits = DEFAULT_COUNTRY_CODE + national;
      prepended = true;
    }
  }
  return { raw, normalized: digits, prepended, defaultCountryCode: DEFAULT_COUNTRY_CODE };
};

// Is the integration actually live? (enabled AND not dev-mode AND Meta configured)
const isLive = (settings) =>
  Boolean(settings && settings.enabled && !settings.developmentMode && settingsService.isMetaConfigured(settings));

/**
 * Send (Phase 1 = SIMULATE) a WhatsApp message.
 * Returns { simulated, queued, delivered, developmentMode, resolvedNumber, error }.
 *  - simulated        — always true in Phase 1 (no real API call)
 *  - queued           — a queue row was created
 *  - delivered        — always false in Phase 1
 *  - developmentMode  — whether the company is in dev mode (recipient redirected)
 */
const sendMessage = async ({ companyId, employee = {}, template = {}, company = {}, originalNumber }) => {
  try {
    const settings = await settingsService.getOrCreate(companyId);
    const message = templateService.buildMessage(template, employee, company);
    const route = queueService.resolveRecipient(settings, originalNumber || employee.mobile || employee.phone);

    // Phase 1: enqueue + log only. The Meta API is intentionally NOT called.
    await queueService.enqueue({ companyId, settings, employee, template, originalNumber: route.originalNumber, message });
    await queueService.writeLog({ companyId, settings, employee, template, originalNumber: route.originalNumber, status: 'Simulated' });

    return {
      simulated: true,
      queued: true,
      delivered: false,
      developmentMode: Boolean(settings.developmentMode),
      resolvedNumber: route.resolvedNumber,
      error: null,
    };
  } catch (error) {
    return { simulated: true, queued: false, delivered: false, developmentMode: true, resolvedNumber: '', error: error.message };
  }
};

// A built-in sample employee + company used by the test full-flow (no real PII).
const SAMPLE_EMPLOYEE = { name: 'OM PATEL', designation: 'Software Developer', department: 'Engineering', joinDate: '2022-06-01', mobile: '9898989898' };
const DEFAULT_TEST_BODY = 'Hello {{employee_name}}, warm wishes from {{company_name}}! You joined our {{department}} team on {{joining_date}}. Sent on {{today_date}}.';

/**
 * "Test WhatsApp Configuration" — Phase 1.5 FULL-FLOW simulation.
 * Generates a sample employee, applies a template, replaces placeholders, creates
 * a queue record, writes a delivery log, and returns the final generated message
 * plus the redirected recipient. NEVER calls an external API.
 * Returns { ok, message, simulated, details }.
 */
const testConfiguration = async (companyId) => {
  const startedAt = Date.now();
  try {
    const settings = await settingsService.getOrCreate(companyId);

    if (!settings.enabled) {
      return { ok: false, simulated: false, message: 'Enable WhatsApp Communication first, then run the test.', details: { enabled: false } };
    }

    const devMode = Boolean(settings.developmentMode);

    // Production mode requested but Phase 2 Meta client not implemented yet.
    if (!devMode) {
      if (!settingsService.isMetaConfigured(settings)) {
        return { ok: false, simulated: false, message: 'Development Mode is OFF but Meta credentials are not configured. Meta API integration is pending (Phase 2).', details: { developmentMode: false, metaConfigured: false } };
      }
      return { ok: false, simulated: false, message: 'Meta API integration is pending. Live sending arrives in Phase 2.', details: { developmentMode: false, metaConfigured: true, live: isLive(settings) } };
    }

    if (!settings.developerTestNumber) {
      return { ok: false, simulated: false, message: 'Development Mode is ON but no Developer Test Number is set. Save a test number first.', details: { developmentMode: true } };
    }

    // 1) Sample employee + company.
    const sampleEmployee = { ...SAMPLE_EMPLOYEE };
    const company = (await getCompanyName(companyId)) || { name: 'Your Company' };

    // 2) Pick a WhatsApp-compatible template if the company has one, else a built-in.
    const waTemplates = await templateService.listWhatsAppTemplates(companyId).catch(() => []);
    const template = (waTemplates && waTemplates[0]) || { id: null, title: 'WhatsApp Configuration Test', body: DEFAULT_TEST_BODY, whatsappRichText: false, whatsappCaption: '' };

    // 3) Replace placeholders → final generated message.
    const built = templateService.buildMessage(template, sampleEmployee, company);
    const finalMessage = built.body || placeholders.render(DEFAULT_TEST_BODY, sampleEmployee, company);

    // 4) Resolve recipient (dev mode → developer test number).
    const route = queueService.resolveRecipient(settings, sampleEmployee.mobile);

    // 5) Create a queue record (simulated; never drained).
    const queued = await queueService.enqueue({
      companyId, settings, employee: sampleEmployee, template,
      originalNumber: sampleEmployee.mobile,
      message: { ...built, body: finalMessage },
    });

    // 6) Write a delivery log linked to the queue row, with the preview + timing.
    const processingMs = Date.now() - startedAt;
    await queueService.writeLog({
      companyId, settings, employee: sampleEmployee, template,
      originalNumber: sampleEmployee.mobile, status: 'Simulated',
      queueId: queued.id, messagePreview: finalMessage, processingMs,
    });

    // 7) Return the final generated message + redirected recipient.
    return {
      ok: true,
      simulated: true,
      message: 'WhatsApp integration is configured correctly. Meta API integration is pending.',
      details: {
        developmentMode: true,
        sampleEmployee: sampleEmployee.name,
        templateUsed: template.title,
        finalMessage,
        caption: built.caption || '',
        originalRecipient: route.originalNumber,
        redirectedTo: route.resolvedNumber,
        queueId: queued.id,
        processingMs,
      },
    };
  } catch (error) {
    return { ok: false, simulated: false, message: 'Test failed.', details: { error: error.message } };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — REAL Meta Cloud API operations.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Connection test — validate credentials and verify Meta connectivity.
 * Returns { ok, status, message, details } where status is one of:
 *   Connected / Authentication Failed / Invalid Phone Number ID / Invalid Token /
 *   Network Error / Rate Limit / Meta API Error.
 * Persists the outcome on the settings row so diagnostics show live status.
 */
// Token-expiry-specific message (never a generic failure for expired tokens).
const TOKEN_EXPIRED_MESSAGE = 'Your Meta Access Token appears to be expired or invalid. Please generate a new Permanent Access Token.';

const testConnection = async (companyId) => {
  const now = new Date();
  try {
    const s = await settingsService.getDecrypted(companyId);
    if (!s.phoneNumberId) {
      await settingsService.recordConnection(companyId, { connectionStatus: 'Invalid Phone Number ID', phoneVerified: false, lastTestedAt: now, lastFailureAt: now, lastError: 'Phone Number ID not set' });
      return { ok: false, status: 'Invalid Phone Number ID', message: 'Phone Number ID is not set. Enter it and save first.' };
    }
    if (!s.permanentAccessToken) {
      await settingsService.recordConnection(companyId, { connectionStatus: 'Invalid Token', tokenValid: false, lastTestedAt: now, lastFailureAt: now, lastError: 'Access Token not set' });
      return { ok: false, status: 'Invalid Token', message: 'Access Token is not set. Enter it and save first.' };
    }

    const result = await meta.verifyPhoneNumber({ phoneNumberId: s.phoneNumberId, accessToken: s.permanentAccessToken });
    if (result.request) await requestLog.record({ companyId, ...result.request });

    // On success, probe the WABA review status (best-effort) for sandbox/prod.
    let businessVerified = false, accountReviewStatus;
    if (result.ok && s.whatsappBusinessAccountId) {
      const biz = await meta.verifyBusiness({ wabaId: s.whatsappBusinessAccountId, accessToken: s.permanentAccessToken });
      businessVerified = !!biz.businessVerified;
      accountReviewStatus = biz.accountReviewStatus;
      if (biz.request) await requestLog.record({ companyId, ...biz.request });
    }
    const codeVerified = !!(result.details && result.details.codeVerified);
    const environment = result.ok ? ((businessVerified || codeVerified) ? 'production' : 'sandbox') : undefined;
    const isAuthFail = result.status === 'Authentication Failed' || result.status === 'Invalid Token';

    await settingsService.recordConnection(companyId, {
      connectionStatus: result.status,
      phoneVerified: !!result.phoneVerified,
      tokenValid: !!result.tokenValid,
      businessVerified,
      tokenExpired: !!result.tokenExpired,
      environment,
      apiVersion: result.apiVersion,
      lastTestedAt: now,
      lastConnectedAt: result.ok ? now : undefined,
      lastSuccessAt: result.ok ? now : undefined,
      lastFailureAt: result.ok ? undefined : now,
      lastError: result.ok ? null : result.message,
      lastHttpStatus: result.details && result.details.httpStatus != null ? result.details.httpStatus : null,
      lastMetaErrorCode: result.details && result.details.errorCode != null ? String(result.details.errorCode) : null,
    });

    return {
      ok: result.ok,
      status: result.status,
      message: result.tokenExpired ? TOKEN_EXPIRED_MESSAGE : result.message,
      tokenExpired: !!result.tokenExpired,
      environment,
      businessVerified,
      accountReviewStatus,
      details: result.details,
      apiVersion: result.apiVersion,
      attempts: result.request && result.request.attempts,
    };
  } catch (error) {
    await settingsService.recordConnection(companyId, { connectionStatus: 'Meta API Error', lastTestedAt: now, lastFailureAt: now, lastError: error.message });
    return { ok: false, status: 'Meta API Error', message: error.message };
  }
};

/**
 * Send Test Message — the ONE real message (Phase 2 goal). Sends the fixed text
 * to the configured Developer Test Number via the Meta Cloud API. Bypasses the
 * queue, scheduler, templates and placeholder engine by design. Writes a real
 * delivery-log entry (Meta message id on success; error code / HTTP status on
 * failure). Never throws.
 */
const sendTestMessage = async (companyId) => {
  const startedAt = Date.now();
  try {
    const s = await settingsService.getDecrypted(companyId);
    if (!s.enabled) return { ok: false, status: 'Disabled', message: 'Enable WhatsApp Communication first.' };
    if (!s.developerTestNumber) return { ok: false, status: 'No Test Number', message: 'Set a Developer Test Number first.' };
    if (!s.phoneNumberId || !s.permanentAccessToken) return { ok: false, status: 'Not Configured', message: 'Configure Phone Number ID and Access Token first.' };

    // ── Recipient resolution (single source of truth) ─────────────────────────
    // "Send Test Message" is a CONNECTIVITY test: it always targets the company's
    // own Developer Test Number. In Development Mode this is mandatory — we never
    // read an employee mobile or any other source here. The number is resolved to
    // full international (E.164) form so it matches Meta's allow-list (#131030).
    const devMode = !!s.developmentMode;
    const recipient = resolveTestRecipient(s.developerTestNumber);
    const to = recipient.normalized;
    console.log(
      '[WhatsApp][send-test] companyId=%s rawDeveloperTestNumber=%j normalized=%j countryCodePrepended=%j defaultCountryCode=%j developmentMode=%j phoneNumberId=%j wabaId=%j → to=%j',
      companyId, recipient.raw, recipient.normalized, recipient.prepended, recipient.defaultCountryCode,
      devMode, s.phoneNumberId, s.whatsappBusinessAccountId, to);

    // Send the approved hello_world template (same payload as the Meta Dashboard),
    // NOT a free-form text — so the message is actually delivered, not just accepted.
    const preview = `Template: ${TEST_TEMPLATE_NAME} (${TEST_TEMPLATE_LANG})`;
    const result = await meta.sendTemplate({ phoneNumberId: s.phoneNumberId, accessToken: s.permanentAccessToken, to, name: TEST_TEMPLATE_NAME, language: TEST_TEMPLATE_LANG, components: [] });
    const processingMs = Date.now() - startedAt;
    if (result.request) await requestLog.record({ companyId, ...result.request });
    const now = new Date();

    if (result.ok) {
      await queueService.writeMetaLog({
        companyId, settings: s, to, status: 'Sent',
        metaMessageId: result.messageId, messagePreview: preview,
        httpStatus: result.httpStatus, processingMs,
      });
      await settingsService.recordConnection(companyId, { lastSuccessAt: now, lastError: null, lastMetaErrorCode: null, lastHttpStatus: result.httpStatus != null ? result.httpStatus : null });
      return { ok: true, status: 'Sent', message: `Template "${TEST_TEMPLATE_NAME}" sent! Check WhatsApp on your Developer Test Number.`, details: { metaMessageId: result.messageId, to, provider: 'Meta Cloud API', template: TEST_TEMPLATE_NAME } };
    }

    await queueService.writeMetaLog({
      companyId, settings: s, to, status: 'Failed',
      errorMessage: result.message, errorCode: result.errorCode, httpStatus: result.httpStatus,
      messagePreview: preview, processingMs,
    });
    await settingsService.recordConnection(companyId, {
      lastFailureAt: now, lastError: result.message,
      lastHttpStatus: result.httpStatus != null ? result.httpStatus : null,
      lastMetaErrorCode: result.errorCode != null ? String(result.errorCode) : null,
      tokenExpired: !!result.tokenExpired,
      ...(result.tokenExpired ? { tokenValid: false } : {}),
    });
    return { ok: false, status: result.status, message: result.tokenExpired ? TOKEN_EXPIRED_MESSAGE : result.message, tokenExpired: !!result.tokenExpired, details: { httpStatus: result.httpStatus, errorCode: result.errorCode, errorSubcode: result.errorSubcode, to } };
  } catch (error) {
    return { ok: false, status: 'Meta API Error', message: error.message };
  }
};

/**
 * Live diagnostics for the UI — Meta Connected / Phone Verified / Token Valid /
 * Webhook Configured / API Version, plus credential-presence indicators.
 */
const diagnostics = async (companyId) => {
  const s = await settingsService.getOrCreate(companyId);
  const ver = s.apiVersion || meta.apiVersion();
  const webhookConfigured = Boolean(s.verifyToken && s.webhookUrl);

  const connection = [
    { key: 'connected', label: 'Meta Connected', ok: s.connectionStatus === 'Connected', value: s.connectionStatus || 'Not Connected' },
    { key: 'phoneVerified', label: 'Phone Number Verified', ok: !!s.phoneVerified, value: s.phoneVerified ? 'Verified' : 'Not Verified' },
    { key: 'tokenValid', label: 'Access Token Valid', ok: !!s.tokenValid, value: s.tokenValid ? 'Valid' : 'Not Validated' },
    { key: 'webhook', label: 'Webhook Configured', ok: webhookConfigured, value: webhookConfigured ? 'Configured' : 'Not Configured' },
    { key: 'apiVersion', label: 'API Version', ok: true, value: ver },
  ];

  // Production-readiness checklist — all must pass to be "Production Ready".
  const checklist = [
    { key: 'connected', label: 'Meta Connected', ok: s.connectionStatus === 'Connected' },
    { key: 'businessVerified', label: 'Business Verified', ok: !!s.businessVerified },
    { key: 'phoneVerified', label: 'Phone Verified', ok: !!s.phoneVerified },
    { key: 'webhookVerified', label: 'Webhook Verified', ok: webhookConfigured },
    { key: 'tokenValid', label: 'Access Token Valid', ok: !!s.tokenValid },
    { key: 'testNumber', label: 'Developer Test Number Configured', ok: !!(s.developerTestNumber && String(s.developerTestNumber).trim()) },
  ];
  const productionReady = checklist.every((c) => c.ok);

  const stat = (v) => ({ configured: !!(v && String(v).trim()), status: v && String(v).trim() ? 'Configured' : 'Not Configured' });
  const items = [
    { key: 'metaBusinessId', label: 'Meta Business ID', ...stat(s.metaBusinessId) },
    { key: 'phoneNumberId', label: 'Phone Number ID', ...stat(s.phoneNumberId) },
    { key: 'permanentAccessToken', label: 'Access Token', ...stat(s.permanentAccessToken) },
    { key: 'verifyToken', label: 'Verify Token', ...stat(s.verifyToken) },
    { key: 'webhookUrl', label: 'Webhook URL', ...stat(s.webhookUrl) },
  ];

  // Environment: explicit once a connection test ran, else inferred from creds.
  const environment = s.environment || (settingsService.isMetaConfigured(s) ? 'sandbox' : 'unconfigured');

  return {
    connection, items, checklist, productionReady,
    environment,
    environmentLabel: environment === 'production' ? 'Production Environment' : environment === 'sandbox' ? 'Sandbox / Test Environment' : 'Not Configured',
    tokenExpired: !!s.tokenExpired,
    metaConfigured: settingsService.isMetaConfigured(s),
    connectionStatus: s.connectionStatus,
    enabled: !!s.enabled,
    developmentMode: !!s.developmentMode,
    apiVersion: ver,
    health: {
      lastTestedAt: s.lastTestedAt,
      lastSuccessAt: s.lastSuccessAt,
      lastFailureAt: s.lastFailureAt,
      lastError: s.lastError,
      lastHttpStatus: s.lastHttpStatus,
      lastMetaErrorCode: s.lastMetaErrorCode,
    },
    lastConnectedAt: s.lastConnectedAt,
  };
};

// API request history (operational metadata only).
const requestHistory = (companyId, take = 100) => requestLog.list(companyId, take);

// Lightweight company lookup (name only) for the test full-flow. Never throws.
const getCompanyName = async (companyId) => {
  try {
    const prisma = require('../../config/prisma');
    const c = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, displayName: true, tradeName: true, legalName: true } });
    return c || null;
  } catch { return null; }
};

module.exports = { isLive, sendMessage, testConfiguration, testConnection, sendTestMessage, diagnostics, requestHistory, resolveTestRecipient, DEFAULT_COUNTRY_CODE, TEST_MESSAGE };
