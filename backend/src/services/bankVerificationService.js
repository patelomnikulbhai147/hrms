/**
 * bankVerificationService.js
 * Manages tenant-specific bank verification settings, server-side credential encryption/decryption,
 * credential masking for UI, connection health checks, per-tenant rate limiting, and immutable audit logs.
 */

const prisma = require('../config/prisma');
const { encrypt, decrypt, isEncrypted } = require('../utils/secretCrypto');
const BankVerificationFactory = require('./bankVerification/BankVerificationFactory');

// In-memory rate limiting counters per company
// Format: { [companyId_window]: { count: number, resetTime: number } }
const rateLimitStore = new Map();

function maskSecret(val) {
  if (!val || typeof val !== 'string' || val.trim() === '') return null;
  const str = val.trim();
  if (str.length <= 6) return '******';
  return `${str.slice(0, 4)}*******************${str.slice(-3)}`;
}

// Key names that must never reach the database, however they are spelled or
// nested. Matched case-insensitively as a substring, so `x-client-secret`,
// `clientSecret`, and `CF_SECRET` are all caught by 'secret'.
const SECRET_KEY_PATTERNS = [
  'secret', 'password', 'authorization', 'auth', 'token', 'apikey', 'api_key',
  'x-client-id', 'clientid', 'client_id', 'credential', 'signature', 'private'
];

// Keys holding a full account number, replaced with a last-4 mask (§13).
const ACCOUNT_KEY_PATTERNS = ['bank_account', 'accountnumber', 'account_number'];

const isSecretKey = (key) => {
  const k = String(key).toLowerCase();
  return SECRET_KEY_PATTERNS.some((p) => k.includes(p));
};

const isAccountKey = (key) => {
  const k = String(key).toLowerCase();
  return ACCOUNT_KEY_PATTERNS.some((p) => k.includes(p));
};

/**
 * Deep-copy a request/response payload with credentials removed and account
 * numbers masked, so a stored raw payload can be shown to an administrator
 * without ever exposing an API secret.
 *
 * Applied to BOTH directions. The response body is not assumed to be
 * secret-free: providers echo request fields back, and a payload we did not
 * write is exactly the one worth filtering.
 */
function redactPayload(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > 8) return '[TRUNCATED]';

  if (Array.isArray(value)) return value.slice(0, 200).map((v) => redactPayload(v, depth + 1));

  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (isSecretKey(key)) {
        out[key] = '[REDACTED]';
      } else if (isAccountKey(key) && val) {
        const digits = String(val).replace(/\s+/g, '');
        out[key] = digits.length > 4 ? `***${digits.slice(-4)}` : '****';
      } else {
        out[key] = redactPayload(val, depth + 1);
      }
    }
    return out;
  }

  if (typeof value === 'string') return value.slice(0, 4000);
  return value;
}

class BankVerificationService {
  /**
   * The provider/environment the PLATFORM is configured to use, from the server
   * environment. Credentials are chosen by environment (CASHFREE_PROD_* vs
   * CASHFREE_SANDBOX_*), so the environment must be resolved from where those
   * credentials actually live — not from a per-company row a company user can no
   * longer even see. A row left on the "Sandbox" default while only production
   * credentials exist is exactly how a fully-configured gateway reports
   * "Sandbox credentials not configured."
   *
   * Explicit env vars win; otherwise the environment is inferred from whichever
   * credential set is present.
   */
  static globalProviderConfig() {
    const provider = String(process.env.BANK_VERIFICATION_PROVIDER || '').trim();
    const environment = String(process.env.BANK_VERIFICATION_ENVIRONMENT || '').trim();
    const apiBaseUrl = String(process.env.BANK_VERIFICATION_API_BASE_URL || '').trim();

    const hasProd = !!String(process.env.CASHFREE_PROD_CLIENT_ID || '').trim();
    const hasSandbox = !!String(process.env.CASHFREE_SANDBOX_CLIENT_ID || '').trim();

    return {
      provider: provider || (hasProd || hasSandbox ? 'Cashfree' : ''),
      environment: environment || (hasProd ? 'Production' : hasSandbox ? 'Sandbox' : ''),
      apiBaseUrl: apiBaseUrl || ''
    };
  }

  /**
   * Apply the platform configuration over a company's stored row. Only touched
   * when the company uses Global credentials (the only mode the UI offers); a
   * company running its own BYO credentials keeps its own provider/environment.
   */
  static applyGlobalProviderConfig(settings = {}) {
    if (settings.credentialSource === 'Company') return settings;
    const g = this.globalProviderConfig();
    return {
      ...settings,
      provider: g.provider || settings.provider,
      environment: g.environment || settings.environment,
      apiBaseUrl: settings.apiBaseUrl || g.apiBaseUrl || null
    };
  }

  /**
   * Get settings for a company with secrets masked for safe client display
   */
  static async getSettings(companyId) {
    const cid = parseInt(companyId, 10) || 0;
    const settings = await prisma.companyBankVerificationSettings.findUnique({
      where: { companyId: cid }
    });

    if (!settings) {
      return this.applyGlobalProviderConfig({
        companyId: cid,
        verificationMode: 'Manual',
        provider: 'RazorpayX',
        credentialSource: 'Global',
        authenticationType: 'Bearer Token',
        apiBaseUrl: null,
        apiKeyMasked: null,
        apiSecretMasked: null,
        bearerTokenMasked: null,
        clientIdMasked: null,
        clientSecretMasked: null,
        webhookSecretMasked: null,
        environment: 'Sandbox',
        isEnabled: false,
        lastConnectionStatus: null,
        lastConnectionCheckedAt: null,
        hasApiKey: false,
        hasApiSecret: false,
        hasBearerToken: false,
        hasClientId: false,
        hasClientSecret: false
      });
    }

    const decApiKey = decrypt(settings.apiKeyEncrypted);
    const decApiSecret = decrypt(settings.apiSecretEncrypted);
    const decBearer = decrypt(settings.bearerTokenEncrypted);
    const decClientId = decrypt(settings.clientIdEncrypted);
    const decClientSecret = decrypt(settings.clientSecretEncrypted);
    const decWebhook = decrypt(settings.webhookSecretEncrypted);

    return this.applyGlobalProviderConfig({
      id: settings.id,
      companyId: settings.companyId,
      verificationMode: settings.verificationMode || 'Manual',
      provider: settings.provider || 'RazorpayX',
      credentialSource: settings.credentialSource || 'Global',
      authenticationType: settings.authenticationType || 'Bearer Token',
      apiBaseUrl: settings.apiBaseUrl,
      apiKeyMasked: maskSecret(decApiKey),
      apiSecretMasked: maskSecret(decApiSecret),
      bearerTokenMasked: maskSecret(decBearer),
      clientIdMasked: maskSecret(decClientId),
      clientSecretMasked: maskSecret(decClientSecret),
      webhookSecretMasked: maskSecret(decWebhook),
      environment: settings.environment || 'Sandbox',
      isEnabled: Boolean(settings.isEnabled),
      lastConnectionStatus: settings.lastConnectionStatus,
      lastConnectionCheckedAt: settings.lastConnectionCheckedAt,
      hasApiKey: !!decApiKey,
      hasApiSecret: !!decApiSecret,
      hasBearerToken: !!decBearer,
      hasClientId: !!decClientId,
      hasClientSecret: !!decClientSecret
    });
  }

  /**
   * Save or update BYO API settings for a company.
   * Preserves existing secrets if the user submits masked values (e.g. ***) or empty strings when updating.
   */
  static async saveSettings(companyId, data = {}) {
    const cid = parseInt(companyId, 10) || 0;
    if (!cid) throw new Error('Valid companyId is required to save bank verification settings.');

    const existing = await prisma.companyBankVerificationSettings.findUnique({
      where: { companyId: cid }
    });

    // Helper to determine if we should encrypt new value or keep existing ciphertext
    const processSecret = (incomingVal, existingEncrypted) => {
      if (incomingVal === undefined || incomingVal === null) return existingEncrypted || null;
      const str = String(incomingVal).trim();
      if (str === '') return existingEncrypted || null;
      // If incoming value looks like a mask (contains **** or is unchanged mask), keep existing
      if (str.includes('****')) return existingEncrypted || null;
      // Otherwise, encrypt the new plaintext credential
      return encrypt(str);
    };

    const apiKeyEncrypted = processSecret(data.apiKey, existing?.apiKeyEncrypted);
    const apiSecretEncrypted = processSecret(data.apiSecret, existing?.apiSecretEncrypted);
    const bearerTokenEncrypted = processSecret(data.bearerToken, existing?.bearerTokenEncrypted);
    const clientIdEncrypted = processSecret(data.clientId, existing?.clientIdEncrypted);
    const clientSecretEncrypted = processSecret(data.clientSecret, existing?.clientSecretEncrypted);
    const webhookSecretEncrypted = processSecret(data.webhookSecret, existing?.webhookSecretEncrypted);

    const upsertData = {
      companyId: cid,
      verificationMode: data.verificationMode || existing?.verificationMode || 'Manual',
      provider: data.provider || existing?.provider || 'RazorpayX',
      credentialSource: data.credentialSource || existing?.credentialSource || 'Global',
      authenticationType: data.authenticationType || existing?.authenticationType || 'Bearer Token',
      apiBaseUrl: data.apiBaseUrl !== undefined ? (data.apiBaseUrl ? String(data.apiBaseUrl).trim() : null) : existing?.apiBaseUrl,
      apiKeyEncrypted,
      apiSecretEncrypted,
      bearerTokenEncrypted,
      clientIdEncrypted,
      clientSecretEncrypted,
      webhookSecretEncrypted,
      environment: data.environment || existing?.environment || 'Sandbox',
      isEnabled: data.isEnabled !== undefined ? Boolean(data.isEnabled) : (existing ? Boolean(existing.isEnabled) : false)
    };

    await prisma.companyBankVerificationSettings.upsert({
      where: { companyId: cid },
      update: upsertData,
      create: upsertData
    });

    await prisma.verificationSettings.upsert({
      where: { companyId: cid },
      update: {
        verificationMode: upsertData.verificationMode,
        provider: upsertData.provider,
        status: upsertData.isEnabled ? 'Connected' : 'Disconnected'
      },
      create: {
        companyId: cid,
        verificationMode: upsertData.verificationMode,
        provider: upsertData.provider,
        status: upsertData.isEnabled ? 'Connected' : 'Disconnected',
        // 1 verification credit = 1 successful API verification. Persisted for
        // schema compatibility only; the verification flow no longer reads it.
        costPerVerification: 1
      }
    });

    return this.getSettings(cid);
  }

  /**
   * Get decrypted credentials for internal backend API execution
   */
  static async getDecryptedCredentials(companyId) {
    const cid = parseInt(companyId, 10) || 0;
    const settings = await prisma.companyBankVerificationSettings.findUnique({
      where: { companyId: cid }
    });
    if (!settings) return {};

    return {
      credentialSource: settings.credentialSource || 'Global',
      apiKey: decrypt(settings.apiKeyEncrypted),
      apiSecret: decrypt(settings.apiSecretEncrypted),
      bearerToken: decrypt(settings.bearerTokenEncrypted),
      clientId: decrypt(settings.clientIdEncrypted),
      clientSecret: decrypt(settings.clientSecretEncrypted),
      webhookSecret: decrypt(settings.webhookSecretEncrypted)
    };
  }

  /**
   * Test Connection feature: tests health of configured provider credentials
   */
  static async testConnection(companyId) {
    const cid = parseInt(companyId, 10) || 0;
    const settings = await prisma.companyBankVerificationSettings.findUnique({
      where: { companyId: cid }
    });
    if (!settings) {
      return { ok: false, status: 'failed', message: 'No verification settings configured for this company.' };
    }

    const credentials = await this.getDecryptedCredentials(cid);
    // Health-check the gateway that verification will ACTUALLY use.
    const provider = BankVerificationFactory.getProvider(this.applyGlobalProviderConfig(settings), credentials);
    const result = await provider.healthCheck();

    await prisma.companyBankVerificationSettings.update({
      where: { companyId: cid },
      data: {
        lastConnectionStatus: result.status || (result.ok ? 'connected' : 'failed'),
        lastConnectionCheckedAt: new Date()
      }
    });

    return result;
  }

  /**
   * Rate limiting: enforce per-company limits (max 30/min, max 500/hr)
   */
  static checkRateLimit(companyId) {
    const cid = parseInt(companyId, 10) || 0;
    const now = Date.now();
    const minKey = `${cid}_min`;
    const hrKey = `${cid}_hr`;

    // Clean up expired buckets or initialize
    if (!rateLimitStore.has(minKey) || rateLimitStore.get(minKey).resetTime <= now) {
      rateLimitStore.set(minKey, { count: 0, resetTime: now + 60000 });
    }
    if (!rateLimitStore.has(hrKey) || rateLimitStore.get(hrKey).resetTime <= now) {
      rateLimitStore.set(hrKey, { count: 0, resetTime: now + 3600000 });
    }

    const minBucket = rateLimitStore.get(minKey);
    const hrBucket = rateLimitStore.get(hrKey);

    if (minBucket.count >= 30) {
      const err = new Error('Rate limit exceeded: Maximum 30 verification requests per minute per company.');
      err.status = 429;
      err.code = 'RATE_LIMIT_EXCEEDED';
      throw err;
    }
    if (hrBucket.count >= 500) {
      const err = new Error('Rate limit exceeded: Maximum 500 verification requests per hour per company.');
      err.status = 429;
      err.code = 'RATE_LIMIT_EXCEEDED';
      throw err;
    }

    minBucket.count++;
    hrBucket.count++;
    return true;
  }

  /**
   * Log an immutable verification audit record.
   *
   * Never records a plaintext secret or a full account number: the account is
   * stored masked to its last 4 digits, and `rawRequest` / `rawResponse` are put
   * through `redactPayload` before they are written.
   *
   * The first block of parameters is the original signature and behaves exactly
   * as before; everything after it is the enterprise verification record and is
   * optional, so existing call sites (rate-limit, manual-override, credit
   * refusals) keep working untouched.
   *
   * Returns the created row, so a caller that needs the record id — to link it to
   * an employee, or to hand the user a receipt — can have it. Failures are still
   * swallowed: an audit-write problem must never fail a verification the provider
   * already performed and the wallet already paid for.
   */
  static async logVerificationAudit({
    companyId,
    provider,
    verificationMode = 'API Verification',
    ifsc,
    accountNumber,
    employeeName,
    referenceId,
    responseTimeMs,
    status,
    errorMessage,
    // ── enterprise record (all optional) ────────────────────────────────────
    employeeId,
    employeeCode,
    branchId,
    branchName,
    department,
    designation,
    employeeEmail,
    employeePhone,
    verifiedById,
    verifiedByName,
    verifiedByRole,
    environment,
    verificationId,
    requestId,
    verificationSource,
    accountHolderName,
    bankName,
    bankBranch,
    branchAddress,
    city,
    district,
    state,
    micr,
    swift,
    utr,
    accountStatus,
    accountStatusCode,
    verificationMessage,
    enteredName,
    nameMatchResult,
    nameMatchScore,
    nameMatchSource,
    requestTimestamp,
    responseTimestamp,
    httpStatus,
    retryCount,
    rawRequest,
    rawResponse,
    verificationCost,
    walletBalanceBefore,
    walletBalanceAfter
  }) {
    try {
      const cid = parseInt(companyId, 10) || 0;
      const cleanAccount = String(accountNumber || '').replace(/\s+/g, '').trim();
      const masked = cleanAccount ? `***${cleanAccount.slice(-4)}` : null;

      const int = (v) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
      };
      const str = (v, max = 191) => (v === undefined || v === null || v === '' ? null : String(v).trim().slice(0, max));

      return await prisma.bankVerificationAuditLog.create({
        data: {
          companyId: cid,
          provider: provider || 'Unknown',
          verificationMode,
          ifsc: ifsc ? String(ifsc).toUpperCase().trim() : null,
          accountNumberMasked: masked,
          employeeName: employeeName ? String(employeeName).trim() : null,
          referenceId: referenceId || null,
          responseTimeMs: responseTimeMs ? parseInt(responseTimeMs, 10) : null,
          status: status || 'UNKNOWN',
          errorMessage: errorMessage ? String(errorMessage).slice(0, 1000) : null,

          employeeId: int(employeeId),
          employeeCode: str(employeeCode, 64),
          branchId: int(branchId),
          branchName: str(branchName),
          department: str(department),
          designation: str(designation),
          employeeEmail: str(employeeEmail),
          employeePhone: str(employeePhone, 32),
          verifiedById: int(verifiedById),
          verifiedByName: str(verifiedByName),
          verifiedByRole: str(verifiedByRole, 64),

          environment: str(environment, 32),
          verificationId: str(verificationId),
          requestId: str(requestId),
          verificationSource: str(verificationSource, 64),

          accountHolderName: str(accountHolderName),
          bankName: str(bankName),
          branchName2: str(bankBranch),
          branchAddress: branchAddress ? String(branchAddress).slice(0, 2000) : null,
          city: str(city, 128),
          district: str(district, 128),
          state: str(state, 128),
          micr: str(micr, 32),
          swift: str(swift, 32),
          utr: str(utr, 64),
          accountStatus: str(accountStatus, 64),
          accountStatusCode: str(accountStatusCode, 64),
          verificationMessage: verificationMessage ? String(verificationMessage).slice(0, 2000) : null,

          enteredName: str(enteredName),
          nameMatchResult: str(nameMatchResult, 32),
          nameMatchScore: int(nameMatchScore),
          nameMatchSource: str(nameMatchSource, 32),

          requestTimestamp: requestTimestamp ? new Date(requestTimestamp) : null,
          responseTimestamp: responseTimestamp ? new Date(responseTimestamp) : null,
          httpStatus: int(httpStatus),
          retryCount: int(retryCount) || 0,
          rawRequest: rawRequest ? redactPayload(rawRequest) : undefined,
          rawResponse: rawResponse ? redactPayload(rawResponse) : undefined,

          verificationCost: int(verificationCost),
          walletBalanceBefore: int(walletBalanceBefore),
          walletBalanceAfter: int(walletBalanceAfter)
        }
      });
    } catch (e) {
      console.error('[BankVerificationService] Failed to record audit log:', e.message);
      return null;
    }
  }

  /**
   * Retrieve recent verification audit logs for a company
   */
  static async getAuditLogs(companyId, limit = 50) {
    const cid = parseInt(companyId, 10) || 0;
    return prisma.bankVerificationAuditLog.findMany({
      where: { companyId: cid },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit, 10) || 50, 200)
    });
  }

  /**
   * Paginated, filterable verification history (§7).
   * Records are only ever read here — this module never updates or deletes one.
   */
  static async getVerifications({
    companyId,
    status = null,
    employeeId = null,
    branchId = null,
    startDate = null,
    endDate = null,
    search = null,
    page = 1,
    limit = 25
  } = {}) {
    const cid = parseInt(companyId, 10) || 0;
    const where = { companyId: cid };

    if (status && status !== 'All') where.status = status;
    if (employeeId) where.employeeId = parseInt(employeeId, 10);
    if (branchId) where.branchId = parseInt(branchId, 10);
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        // An end date with no time means "up to the end of that day", otherwise a
        // filter for today silently excludes everything verified today.
        const end = new Date(endDate);
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    if (search && String(search).trim()) {
      const q = String(search).trim();
      where.OR = [
        { employeeName: { contains: q } },
        { employeeCode: { contains: q } },
        { referenceId: { contains: q } },
        { verificationId: { contains: q } },
        { accountHolderName: { contains: q } },
        { bankName: { contains: q } },
        { ifsc: { contains: q } },
        { accountNumberMasked: { contains: q } }
      ];
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * take;

    const [total, rows] = await Promise.all([
      prisma.bankVerificationAuditLog.count({ where }),
      prisma.bankVerificationAuditLog.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take
      })
    ]);

    return { total, page: parseInt(page, 10) || 1, limit: take, totalPages: Math.ceil(total / take) || 1, records: rows };
  }

  /** Aggregate counters for the history header cards. */
  static async getVerificationStats(companyId) {
    const cid = parseInt(companyId, 10) || 0;
    const [total, verified, failed, spend] = await Promise.all([
      prisma.bankVerificationAuditLog.count({ where: { companyId: cid } }),
      prisma.bankVerificationAuditLog.count({ where: { companyId: cid, status: 'VERIFIED' } }),
      prisma.bankVerificationAuditLog.count({ where: { companyId: cid, status: { in: ['FAILED', 'ERROR', 'NETWORK_ERROR'] } } }),
      prisma.bankVerificationAuditLog.aggregate({
        where: { companyId: cid, status: 'VERIFIED' },
        _sum: { verificationCost: true },
        _avg: { responseTimeMs: true }
      })
    ]);

    return {
      total,
      verified,
      failed,
      // Success rate over ALL attempts; with no attempts there is no rate to
      // report, and claiming 100% would be an invented statistic.
      successRate: total > 0 ? parseFloat(((verified / total) * 100).toFixed(1)) : null,
      totalSpend: spend?._sum?.verificationCost || 0,
      avgLatencyMs: spend?._avg?.responseTimeMs ? Math.round(spend._avg.responseTimeMs) : null
    };
  }

  /** A single verification record, scoped to the company that owns it. */
  static async getVerificationById(companyId, id) {
    const cid = parseInt(companyId, 10) || 0;
    const rid = parseInt(id, 10) || 0;
    const record = await prisma.bankVerificationAuditLog.findUnique({ where: { id: rid } });
    if (!record || record.companyId !== cid) return null;
    return record;
  }

  /**
   * Latest verification for an employee — the stored result the profile and the
   * employee form reuse instead of calling the provider again (§15).
   */
  static async getLatestForEmployee(companyId, employeeId, { referenceId = null } = {}) {
    const cid = parseInt(companyId, 10) || 0;
    const eid = parseInt(employeeId, 10) || null;
    if (!eid && !referenceId) return null;

    return prisma.bankVerificationAuditLog.findFirst({
      where: {
        companyId: cid,
        ...(eid ? { employeeId: eid } : { referenceId: String(referenceId) })
      },
      orderBy: { id: 'desc' }
    });
  }

  /**
   * Attach an employee to a verification recorded before that employee existed.
   * Registration verifies the account first and creates the employee afterwards,
   * so the record is written with employeeId = null and linked here once the id
   * exists. Only the linkage columns are written — the verification result itself
   * is never rewritten.
   */
  static async linkVerificationToEmployee({ companyId, referenceId, employeeId, employeeCode, branchId, branchName, department, designation }) {
    const cid = parseInt(companyId, 10) || 0;
    const eid = parseInt(employeeId, 10) || 0;
    if (!cid || !eid || !referenceId) return 0;

    try {
      const res = await prisma.bankVerificationAuditLog.updateMany({
        where: { companyId: cid, referenceId: String(referenceId), employeeId: null },
        data: {
          employeeId: eid,
          employeeCode: employeeCode ? String(employeeCode).slice(0, 64) : undefined,
          branchId: branchId ? parseInt(branchId, 10) : undefined,
          branchName: branchName ? String(branchName).slice(0, 191) : undefined,
          department: department ? String(department).slice(0, 191) : undefined,
          designation: designation ? String(designation).slice(0, 191) : undefined
        }
      });
      return res.count;
    } catch (e) {
      console.error('[BankVerificationService] linkVerificationToEmployee failed:', e.message);
      return 0;
    }
  }
}

module.exports = BankVerificationService;
module.exports.redactPayload = redactPayload;
