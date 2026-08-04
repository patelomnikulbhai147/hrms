const prisma = require('../config/prisma');
const AuditService = require('../services/auditService');
const BankVerificationService = require('../services/bankVerificationService');
const BankVerificationFactory = require('../services/bankVerification/BankVerificationFactory');
const VerificationCreditService = require('../services/verificationCreditService');
const { ensureVerificationCredits } = require('../middleware/verificationCreditGuard');
const { resolveWalletCompany, toCompany } = require('../utils/verificationScope');
const { resolveNameMatch } = require('../utils/nameMatch');

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const ACCOUNT_RE = /^\d{9,18}$/;

// Process-lifetime cache for IFSC lookups
const cache = new Map();

// Verifications currently on the wire, keyed company|ifsc|account. Guarantees a
// single paid provider call per account at a time no matter how many clicks,
// tabs or retries arrive (see the guard in verifyAccount).
const VERIFY_IN_FLIGHT = new Set();

// Built-in offline dictionary for common test IFSC codes
const DEMO_IFSC_DATA = {
  HDFC0000001: {
    valid: true,
    ifsc: 'HDFC0000001',
    bankName: 'HDFC Bank',
    bankBranch: 'Ashram Road',
    bankAddress: 'Ground Floor, Navrangpura, Ashram Road',
    bankCity: 'Ahmedabad',
    bankDistrict: 'Ahmedabad',
    bankState: 'Gujarat',
    micr: '380240003',
    swift: 'HDFCINBB',
  },
  HDFC0001234: {
    valid: true,
    ifsc: 'HDFC0001234',
    bankName: 'HDFC Bank',
    bankBranch: 'Ashram Road',
    bankAddress: 'Ground Floor, Navrangpura, Ashram Road',
    bankCity: 'Ahmedabad',
    bankDistrict: 'Ahmedabad',
    bankState: 'Gujarat',
    micr: '380240003',
    swift: 'HDFCINBB',
  },
  SBIN0001234: {
    valid: true,
    ifsc: 'SBIN0001234',
    bankName: 'State Bank of India',
    bankBranch: 'Main Branch',
    bankAddress: 'Nariman Point, Madam Cama Road',
    bankCity: 'Mumbai',
    bankDistrict: 'Mumbai City',
    bankState: 'Maharashtra',
    micr: '400002001',
    swift: 'SBININBB',
  },
  ICIC0000001: {
    valid: true,
    ifsc: 'ICIC0000001',
    bankName: 'ICICI Bank',
    bankBranch: 'Nariman Point',
    bankAddress: 'Free Press House, Nariman Point',
    bankCity: 'Mumbai',
    bankDistrict: 'Mumbai City',
    bankState: 'Maharashtra',
    micr: '400229002',
    swift: 'ICICINBB',
  },
  UTIB0000001: {
    valid: true,
    ifsc: 'UTIB0000001',
    bankName: 'Axis Bank',
    bankBranch: 'Central Branch',
    bankAddress: 'Statesman House, Barakhamba Road',
    bankCity: 'New Delhi',
    bankDistrict: 'New Delhi',
    bankState: 'Delhi',
    micr: '110211001',
    swift: 'AXISINBB',
  },
  PUNB0000001: {
    valid: true,
    ifsc: 'PUNB0000001',
    bankName: 'Punjab National Bank',
    bankBranch: 'Connaught Place',
    bankAddress: 'B-Block, Connaught Place',
    bankCity: 'New Delhi',
    bankDistrict: 'New Delhi',
    bankState: 'Delhi',
    micr: '110024001',
    swift: 'PUNBINBB',
  },
  BARB0000001: {
    valid: true,
    ifsc: 'BARB0000001',
    bankName: 'Bank of Baroda',
    bankBranch: 'Mandvi',
    bankAddress: 'Bank of Baroda Bhavan, Mandvi',
    bankCity: 'Vadodara',
    bankDistrict: 'Vadodara',
    bankState: 'Gujarat',
    micr: '390012001',
    swift: 'BARBINBB',
  }
};

// Initialize cache with demo dictionary
for (const [code, data] of Object.entries(DEMO_IFSC_DATA)) {
  cache.set(code, data);
}

/**
 * Internal helper to resolve IFSC code
 */
async function resolveIfsc(code) {
  const normCode = String(code || '').toUpperCase().trim();
  if (!IFSC_RE.test(normCode)) {
    return { valid: false, status: 400, error: 'Invalid IFSC format. Expected e.g. HDFC0001234.' };
  }
  if (cache.has(normCode)) {
    return { ...cache.get(normCode), status: 200 };
  }

  try {
    const resp = await fetch(`https://ifsc.razorpay.com/${normCode}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (resp.status === 404) {
      return { valid: false, status: 404, error: 'Invalid IFSC Code. Bank details not found.' };
    }
    if (!resp.ok) {
      return { valid: false, status: 502, error: 'IFSC service returned an error. Please enter bank details manually.' };
    }
    const d = await resp.json();
    const out = {
      valid: true,
      ifsc: d.IFSC || normCode,
      bankName: d.BANK || '',
      bankBranch: d.BRANCH || '',
      bankAddress: d.ADDRESS || '',
      bankCity: d.CITY || '',
      bankDistrict: d.DISTRICT || d.CITY || '',
      bankState: d.STATE || '',
      micr: d.MICR || '',
      swift: d.SWIFT || '',
    };
    cache.set(normCode, out);
    return { ...out, status: 200 };
  } catch (e) {
    console.error('ifsc.lookup error:', e.message);
    return { valid: false, status: 502, error: 'IFSC lookup service is temporarily unavailable. Please enter bank details manually.' };
  }
}

/**
 * GET /api/bank/ifsc/:code
 * Resolves an IFSC code to bank + branch details including MICR and SWIFT.
 */
exports.getIfsc = async (req, res) => {
  const code = req.params.code || req.params.ifsc || '';
  const result = await resolveIfsc(code);
  if (!result.valid) {
    return res.status(result.status || 400).json({ valid: false, error: result.error });
  }
  return res.status(200).json(result);
};

/**
 * Roles allowed to see the technical panel and the raw request/response (§6, §16).
 * Everyone else gets the verification record with those fields withheld — not a
 * masked copy, absent entirely, so nothing sensitive is shipped to a client that
 * merely hides it.
 */
const RAW_ACCESS_ROLES = ['Super Admin'];
const TECHNICAL_ACCESS_ROLES = ['Super Admin', 'Company Head', 'HR', 'HR Admin', 'HR Manager', 'Admin'];

const canSeeRaw = (req) => RAW_ACCESS_ROLES.includes(req.user?.role);
const canSeeTechnical = (req) => TECHNICAL_ACCESS_ROLES.includes(req.user?.role);

/**
 * The employee this verification is for, when one is identified. `employeeId` may
 * arrive as a numeric row id or as the employee CODE (both are called
 * "employeeId" in this codebase), so both are accepted.
 *
 * Returns {} when the employee cannot be resolved or sits outside the caller's
 * company — a verification is never enriched with another tenant's employee data.
 */
async function resolveEmployeeContext(req, companyId, employeeIdRaw) {
  if (employeeIdRaw === undefined || employeeIdRaw === null || employeeIdRaw === '') return {};

  const raw = String(employeeIdRaw).trim();
  const numeric = parseInt(raw, 10);
  const isNumericId = Number.isFinite(numeric) && String(numeric) === raw;

  try {
    const emp = await prisma.employee.findFirst({
      where: isNumericId ? { id: numeric } : { employeeId: raw },
      select: {
        id: true, employeeId: true, name: true, email: true, phone: true,
        companyId: true, branchId: true, branchLocation: true,
        department: true, designation: true
      }
    });
    if (!emp) return {};

    // The employee's companyId may itself be a branch id (shared id space), so it
    // is resolved to its parent company before being compared.
    if (Number(toCompany(req, emp.companyId)) !== Number(companyId)) return {};

    return {
      employeeId: emp.id,
      employeeCode: emp.employeeId,
      employeeRecordName: emp.name,
      employeeEmail: emp.email,
      employeePhone: emp.phone,
      branchId: emp.branchId,
      branchName: emp.branchLocation,
      department: emp.department,
      designation: emp.designation
    };
  } catch (e) {
    console.error('[BankController] resolveEmployeeContext failed:', e.message);
    return {};
  }
}

/**
 * Write the verification summary back onto the employee row so the profile can
 * show "Bank Verified" without replaying history (§11). Best-effort: a failure
 * here must never fail a verification that already succeeded and was charged.
 */
async function stampEmployeeVerification(employeeId, payload) {
  if (!employeeId) return;
  try {
    await prisma.employee.update({
      where: { id: parseInt(employeeId, 10) },
      data: payload
    });
  } catch (e) {
    console.error('[BankController] stampEmployeeVerification failed:', e.message);
  }
}

/**
 * Shape a stored record for the client, dropping the technical/raw blocks the
 * caller is not entitled to see.
 */
function presentRecord(record, req) {
  if (!record) return null;
  const technical = canSeeTechnical(req);
  const raw = canSeeRaw(req);

  const {
    rawRequest, rawResponse, httpStatus, requestId, verificationId,
    walletBalanceBefore, walletBalanceAfter, retryCount, environment,
    ...rest
  } = record;

  return {
    ...rest,
    // Bank branch is stored as branchName2 to avoid colliding with the COMPANY
    // branch; the client should never have to know that.
    bankBranch: record.branchName2 ?? null,
    environment,
    ...(technical
      ? { httpStatus, requestId, verificationId, walletBalanceBefore, walletBalanceAfter, retryCount }
      : {}),
    ...(raw ? { rawRequest, rawResponse } : {}),
    permissions: { canSeeTechnical: technical, canSeeRaw: raw }
  };
}

/**
 * POST /api/bank/verify-account
 * Verifies a bank account number against the IFSC.
 * Integrates with configured banking verification provider (RazorpayX, Cashfree, Decentro, Signzy, etc.).
 * Never returns hardcoded static fallback names or 'Not Available' for verified accounts.
 */
exports.verifyAccount = async (req, res) => {
  const { ifsc, accountNumber, employeeId } = req.body || {};
  const normIfsc = String(ifsc || '').toUpperCase().trim();
  const cleanAccount = String(accountNumber || '').replace(/\s+/g, '').trim();

  const actorId = req.user?.id || 'SYSTEM';
  const actorName = req.user?.name || req.user?.email || 'HR Administrator';

  // Logged on every verification attempt. The account number is masked to the
  // last 4 digits, matching how `outgoingProviderRequest` is already masked —
  // logging it in full here defeated that masking on the very same log line.
  const incomingRequest = {
    ifsc: normIfsc,
    accountNumber: cleanAccount ? '***' + String(cleanAccount).slice(-4) : null,
    employeeId,
  };

  // Validate IFSC format
  if (!IFSC_RE.test(normIfsc)) {
    const errObj = {
      verified: false,
      status: 'FAILED',
      error: 'Invalid IFSC format. Expected e.g. HDFC0001234.'
    };
    console.log('[Bank Verification API Debug Log]', JSON.stringify({
      timestamp: new Date().toISOString(),
      incomingFrontendRequest: incomingRequest,
      outgoingProviderRequest: null,
      completeProviderResponse: null,
      parsedBackendResponse: errObj,
      finalJsonSentToFrontend: errObj
    }, null, 2));
    return res.status(400).json(errObj);
  }

  // Validate Account Number length
  if (!ACCOUNT_RE.test(cleanAccount)) {
    const errObj = {
      verified: false,
      status: 'FAILED',
      error: 'Invalid Account Number. Must be between 9 and 18 numeric digits.'
    };
    console.log('[Bank Verification API Debug Log]', JSON.stringify({
      timestamp: new Date().toISOString(),
      incomingFrontendRequest: incomingRequest,
      outgoingProviderRequest: null,
      completeProviderResponse: null,
      parsedBackendResponse: errObj,
      finalJsonSentToFrontend: errObj
    }, null, 2));
    return res.status(400).json(errObj);
  }

  // Check IFSC validity
  const ifscResult = await resolveIfsc(normIfsc);
  if (!ifscResult.valid) {
    const errObj = {
      verified: false,
      status: 'FAILED',
      error: ifscResult.error || 'Invalid IFSC Code. Bank details not found.'
    };
    console.log('[Bank Verification API Debug Log]', JSON.stringify({
      timestamp: new Date().toISOString(),
      incomingFrontendRequest: incomingRequest,
      outgoingProviderRequest: null,
      completeProviderResponse: null,
      parsedBackendResponse: errObj,
      finalJsonSentToFrontend: errObj
    }, null, 2));
    return res.status(ifscResult.status || 404).json(errObj);
  }

  // Multi-Tenant BYO API Verification Flow.
  // Resolved through the SAME helper the wallet endpoint uses (branch workspace →
  // parent company, no company-1 fallback), so the wallet the employee form
  // displays is exactly the wallet this verification checks and debits.
  const tenant = resolveWalletCompany(req);
  if (tenant.error) {
    return res.status(tenant.status || 400).json({ verified: false, status: 'TENANT_UNRESOLVED', error: tenant.error });
  }
  const companyId = tenant.companyId;
  const employeeName = req.body?.employeeName || null;

  // Everything known about WHO and WHERE before the provider is called, so it is
  // attached to the record whichever way the verification ends — a refusal is as
  // much a part of the history as a success.
  const employeeCtx = await resolveEmployeeContext(req, companyId, employeeId);
  const requestTimestamp = new Date();
  const retryCount = parseInt(req.body?.retryCount, 10) || 0;

  const baseRecord = {
    companyId,
    ifsc: normIfsc,
    accountNumber: cleanAccount,
    employeeName: employeeName || employeeCtx.employeeRecordName || null,
    enteredName: employeeName || null,
    employeeId: employeeCtx.employeeId,
    employeeCode: employeeCtx.employeeCode,
    branchId: employeeCtx.branchId,
    branchName: employeeCtx.branchName,
    department: employeeCtx.department,
    designation: employeeCtx.designation,
    employeeEmail: employeeCtx.employeeEmail,
    employeePhone: employeeCtx.employeePhone,
    verifiedById: Number.isFinite(parseInt(actorId, 10)) ? parseInt(actorId, 10) : null,
    verifiedByName: actorName,
    verifiedByRole: req.user?.role || null,
    requestTimestamp,
    retryCount
  };

  // Enforce per-company rate limits (max 30/min, 500/hr)
  try {
    BankVerificationService.checkRateLimit(companyId);
  } catch (rateErr) {
    const errObj = { verified: false, status: 'RATE_LIMITED', error: rateErr.message };
    await BankVerificationService.logVerificationAudit({
      ...baseRecord, provider: 'System', verificationMode: 'API Verification',
      status: 'RATE_LIMITED', errorMessage: rateErr.message,
      responseTimestamp: new Date()
    });
    return res.status(429).json(errObj);
  }

  // Load tenant BYO API settings & check verification mode
  const settings = await BankVerificationService.getSettings(companyId);
  const providerName = settings.provider || 'RazorpayX';

  if (settings.verificationMode === 'Manual' || !settings.isEnabled) {
    const errObj = {
      verified: false,
      status: 'MANUAL_ONLY',
      error: 'API Bank Verification is disabled or set to Manual Mode for this workspace. Please enter bank details manually.'
    };
    await BankVerificationService.logVerificationAudit({
      ...baseRecord, provider: providerName, verificationMode: 'Manual',
      status: 'MANUAL_ONLY', errorMessage: errObj.error,
      environment: settings.environment, responseTimestamp: new Date()
    });
    return res.status(200).json(errObj);
  }

  // Check Verification Credit Wallet balance & availability.
  // The refusal is reported with the code for the condition that actually
  // blocked it — Manual mode and suspension used to be reported as
  // CREDITS_EXHAUSTED, which is how a fully funded wallet came back to the user
  // as "verification balance is exhausted".
  // Delegated to the shared guard so bank verification cannot drift from the
  // rule every other verification module follows. One wallet read: the verdict
  // it returns is reused below rather than re-queried.
  const creditGate = await ensureVerificationCredits({
    req,
    companyId,
    serviceType: 'BANK_VERIFICATION',
    moduleLabel: 'BankVerification',
    employeeId
  });
  const creditStatus = creditGate.creditStatus;
  if (!creditGate.ok) {
    await BankVerificationService.logVerificationAudit({
      ...baseRecord, provider: providerName, verificationMode: creditStatus.verificationMode || 'API Verification',
      status: creditGate.body.status, errorMessage: creditGate.body.message,
      environment: settings.environment, responseTimestamp: new Date(),
      verificationCost: creditStatus.costPerVerification,
      walletBalanceBefore: creditStatus.remainingCredits,
      walletBalanceAfter: creditStatus.remainingCredits
    });
    // Returns BEFORE the provider adapter is even constructed — nothing is sent,
    // nothing is charged.
    return res.status(creditGate.httpStatus).json(creditGate.body);
  }

  // ── Duplicate-request guard ────────────────────────────────────────────────
  // One account, one in-flight verification. A double-clicked button, a retried
  // fetch or two tabs on the same employee would otherwise each reach the paid
  // provider and each debit the wallet. The claim is taken here — after the
  // wallet check, immediately before the only outbound call — and released in
  // the `finally` at the end of this handler, so every exit path frees it.
  const inFlightKey = `${companyId}|${normIfsc}|${cleanAccount}`;
  if (VERIFY_IN_FLIGHT.has(inFlightKey)) {
    return res.status(409).json({
      verified: false,
      status: 'DUPLICATE_REQUEST',
      error: 'A verification for this account is already running. Please wait for it to finish.'
    });
  }
  VERIFY_IN_FLIGHT.add(inFlightKey);

  try {

  // Load decrypted credentials and instantiate provider adapter via Factory
  const credentials = await BankVerificationService.getDecryptedCredentials(companyId);
  const provider = BankVerificationFactory.getProvider(settings, credentials);

  // The outbound payload as recorded (§10). Built here from this controller's own
  // variables rather than captured from the adapter, so no credential can ever
  // reach the stored request log by construction — the account number is masked
  // before it is written.
  const recordedRequest = {
    endpoint: `${settings.provider} / bank-account verification`,
    environment: settings.environment,
    ifsc: normIfsc,
    bank_account: `***${cleanAccount.slice(-4)}`,
    name: employeeName || null
  };

  const startTime = Date.now();
  let result;
  try {
    result = await provider.verifyAccount(normIfsc, cleanAccount, employeeName);
    
    // Explicitly reject verified responses that lack a valid account holder name
    if (result.verified && (!result.accountHolderName || result.accountHolderName.toLowerCase() === 'not available' || result.accountHolderName.trim() === '')) {
      result.verified = false;
      result.status = 'FAILED';
      result.error = 'Unable to Verify Account. Account holder name is missing from the banking provider.';
    }
  } catch (provErr) {
    const duration = Date.now() - startTime;
    const errObj = {
      verified: false,
      status: provErr.code || 'NETWORK_ERROR',
      error: provErr.message || 'Bank verification service is temporarily unreachable or timed out. Please click Retry Verification or use Manual Override.'
    };
    console.log('[Bank Verification API Debug Log]', JSON.stringify({
      timestamp: new Date().toISOString(),
      incomingFrontendRequest: incomingRequest,
      outgoingProviderRequest: { provider: providerName, ifsc: normIfsc, account_number: '***' + cleanAccount.slice(-4) },
      completeProviderResponse: { error: provErr.message || 'TIMEOUT / 503 SERVICE UNAVAILABLE' },
      parsedBackendResponse: errObj,
      finalJsonSentToFrontend: errObj
    }, null, 2));

    await BankVerificationService.logVerificationAudit({
      ...baseRecord, provider: providerName, verificationMode: 'API Verification',
      responseTimeMs: duration, status: errObj.status, errorMessage: errObj.error,
      environment: settings.environment, responseTimestamp: new Date(),
      httpStatus: provErr.status || null,
      verificationCost: creditStatus.costPerVerification,
      walletBalanceBefore: creditStatus.remainingCredits,
      walletBalanceAfter: creditStatus.remainingCredits,
      rawRequest: recordedRequest,
      rawResponse: { error: provErr.message || 'Provider unreachable' }
    });

    if (provErr.status === 503 || provErr.code === 'NETWORK_ERROR') return res.status(503).json(errObj);
    return res.status(502).json(errObj);
  }

  const duration = Date.now() - startTime;

  // If provider returned verification incomplete or failure
  if (!result.verified) {
    console.log('[Bank Verification API Debug Log]', JSON.stringify({
      timestamp: new Date().toISOString(),
      incomingFrontendRequest: incomingRequest,
      outgoingProviderRequest: { provider: providerName, ifsc: normIfsc, account_number: '***' + cleanAccount.slice(-4) },
      completeProviderResponse: result.raw || { verified: false, status: result.status },
      parsedBackendResponse: result,
      finalJsonSentToFrontend: result
    }, null, 2));

    // A declined verification is a full record too: the provider's status code,
    // message and reference are exactly what a tenant needs to raise a query, so
    // they are stored rather than collapsed into an error string.
    const failedRecord = await BankVerificationService.logVerificationAudit({
      ...baseRecord, provider: providerName, verificationMode: 'API Verification',
      responseTimeMs: duration, referenceId: result.referenceId,
      status: result.status || 'FAILED', errorMessage: result.error,
      environment: settings.environment, responseTimestamp: new Date(),
      verificationId: result.verificationId, requestId: result.requestId,
      verificationSource: result.verificationSource,
      accountHolderName: result.accountHolderName,
      bankName: result.bankName, bankBranch: result.branch,
      accountStatus: result.accountStatus, accountStatusCode: result.accountStatusCode,
      verificationMessage: result.verificationMessage || result.error,
      httpStatus: result.httpStatus,
      // Not charged — the wallet is only debited on success, so before and after
      // are the same number and the record says so explicitly.
      verificationCost: 0,
      walletBalanceBefore: creditStatus.remainingCredits,
      walletBalanceAfter: creditStatus.remainingCredits,
      rawRequest: recordedRequest,
      rawResponse: result.raw || { verified: false, status: result.status, error: result.error }
    });
    if (failedRecord) result.recordId = failedRecord.id;

    if (result.status === 'VERIFICATION_INCOMPLETE') {
      await AuditService.logActivity(
        actorId, actorName, 'BANK_VERIFICATION_INCOMPLETE', 'EmployeeBank',
        employeeId || cleanAccount.slice(-4),
        { providerName, ifsc: normIfsc, accountNumber: '***' + cleanAccount.slice(-4), reason: result.error }
      );
    } else {
      await AuditService.logActivity(
        actorId, actorName, 'BANK_VERIFICATION_FAILED', 'EmployeeBank',
        employeeId || cleanAccount.slice(-4),
        { providerName, ifsc: normIfsc, accountNumber: '***' + cleanAccount.slice(-4), reason: result.error }
      );
    }
    return res.status(result.status === 'VERIFICATION_INCOMPLETE' ? 200 : 422).json(result);
  }

  // Enrich successful result with resolved IFSC details
  const responseData = {
    ...result,
    bankName: result.bankName || ifscResult.bankName,
    branch: result.branch || ifscResult.bankBranch,
    city: result.city || ifscResult.bankCity,
    district: result.district || ifscResult.bankDistrict,
    state: result.state || ifscResult.bankState,
    ifsc: result.ifsc || ifscResult.ifsc,
    micr: result.micr || ifscResult.micr,
    swift: result.swift || ifscResult.swift
  };

  const parsedResponse = {
    verified: true,
    status: 'VERIFIED',
    accountHolderName: responseData.accountHolderName,
    bankName: responseData.bankName,
    branch: responseData.branch,
    referenceId: responseData.referenceId
  };

  console.log('[Bank Verification API Debug Log]', JSON.stringify({
    timestamp: new Date().toISOString(),
    incomingFrontendRequest: incomingRequest,
    outgoingProviderRequest: { provider: providerName, ifsc: normIfsc, account_number: '***' + cleanAccount.slice(-4) },
    completeProviderResponse: result.raw || { verified: true, account_holder_name: responseData.accountHolderName },
    parsedBackendResponse: parsedResponse,
    finalJsonSentToFrontend: responseData
  }, null, 2));

  // Name match (§4). The provider's own verdict wins where it gives one; where it
  // does not, the names are compared locally and the record says which it was, so
  // a green "Exact Match" can always be traced to who decided it.
  const nameMatch = resolveNameMatch({
    enteredName: employeeName,
    bankName: responseData.accountHolderName,
    providerResult: result.nameMatchResult,
    providerScore: result.nameMatchScore
  });
  responseData.nameMatch = {
    enteredName: employeeName || null,
    bankName: responseData.accountHolderName || null,
    result: nameMatch.result,
    score: nameMatch.score,
    source: nameMatch.source
  };

  // Atomically deduct the verification fee — ONLY now, after the provider has
  // confirmed the account. A failed, incomplete, or errored verification returns
  // above and never reaches this line, so it is never charged.
  let creditDeductionResult = null;
  try {
    creditDeductionResult = await VerificationCreditService.deductCreditOnSuccess({
      companyId,
      employeeId,
      verificationId: responseData.referenceId,
      provider: providerName,
      referenceId: responseData.referenceId,
      verifiedBy: actorName || 'HR / Employee',
      serviceType: 'BANK_VERIFICATION'
    });
  } catch (deductErr) {
    // The provider was billed but the wallet was not: a revenue leak, not a
    // footnote. The pre-flight balance check makes this reachable only through a
    // race, and it is recorded so it can be reconciled.
    console.error('[Bank Verification] BILLED BUT NOT DEBITED — companyId=%s ref=%s: %s', companyId, responseData.referenceId, deductErr.message);
    await BankVerificationService.logVerificationAudit({
      ...baseRecord, provider: providerName, verificationMode: 'API Verification',
      referenceId: responseData.referenceId, status: 'DEBIT_FAILED', errorMessage: deductErr.message,
      environment: settings.environment, responseTimestamp: new Date(),
      walletBalanceBefore: creditStatus.remainingCredits,
      walletBalanceAfter: creditStatus.remainingCredits
    });
  }

  if (creditDeductionResult && creditDeductionResult.remainingCredits !== undefined) {
    responseData.remainingCredits = creditDeductionResult.remainingCredits;
    responseData.remainingVerifications = creditDeductionResult.remainingVerifications;
    responseData.costPerVerification = creditDeductionResult.costPerVerification;
    responseData.lowCreditAlert = creditDeductionResult.lowCreditAlert;
    responseData.exhaustedAlert = creditDeductionResult.exhaustedAlert;
  }

  // The permanent verification record — written after the debit so the wallet
  // movement it reports is the movement that actually happened.
  const verifiedRecord = await BankVerificationService.logVerificationAudit({
    ...baseRecord,
    provider: providerName,
    verificationMode: 'API Verification',
    responseTimeMs: duration,
    referenceId: responseData.referenceId,
    status: 'VERIFIED',
    environment: settings.environment,
    responseTimestamp: new Date(),
    verificationId: result.verificationId || responseData.referenceId,
    requestId: result.requestId,
    verificationSource: result.verificationSource || providerName,
    accountHolderName: responseData.accountHolderName,
    bankName: responseData.bankName,
    bankBranch: responseData.branch,
    branchAddress: result.branchAddress || ifscResult.bankAddress,
    city: responseData.city,
    district: responseData.district,
    state: responseData.state,
    micr: responseData.micr,
    swift: responseData.swift,
    utr: result.utr,
    accountStatus: result.accountStatus,
    accountStatusCode: result.accountStatusCode,
    verificationMessage: result.verificationMessage,
    nameMatchResult: nameMatch.result,
    nameMatchScore: nameMatch.score,
    nameMatchSource: nameMatch.source,
    httpStatus: result.httpStatus,
    rawRequest: recordedRequest,
    rawResponse: result.raw || { verified: true, account_holder_name: responseData.accountHolderName },
    verificationCost: creditDeductionResult?.costPerVerification ?? creditStatus.costPerVerification,
    walletBalanceBefore: creditStatus.remainingCredits,
    walletBalanceAfter: creditDeductionResult?.remainingCredits ?? creditStatus.remainingCredits
  });

  if (verifiedRecord) {
    responseData.recordId = verifiedRecord.id;
    responseData.verificationRecord = presentRecord(verifiedRecord, req);
  }

  // Stamp the employee so the profile shows the verified state permanently (§11).
  // Only when the verification is tied to an existing employee — during
  // registration the employee does not exist yet and the record is linked later.
  if (employeeCtx.employeeId) {
    await stampEmployeeVerification(employeeCtx.employeeId, {
      accountHolderName: responseData.accountHolderName,
      bankName: responseData.bankName,
      bankBranch: responseData.branch,
      bankCity: responseData.city || undefined,
      bankDistrict: responseData.district || undefined,
      bankState: responseData.state || undefined,
      micr: responseData.micr || undefined,
      swift: responseData.swift || undefined,
      bankVerificationStatus: 'VERIFIED',
      bankVerificationRefId: responseData.referenceId,
      bankVerificationId: result.verificationId || responseData.referenceId,
      bankVerifiedAt: new Date(),
      bankVerifiedBy: actorName,
      bankVerificationProvider: providerName,
      bankVerificationEnvironment: settings.environment,
      bankNameMatchResult: nameMatch.result,
      bankNameMatchScore: nameMatch.score
    });
  }

  await AuditService.logActivity(
    actorId, actorName, 'BANK_ACCOUNT_VERIFIED', 'EmployeeBank',
    employeeId || cleanAccount.slice(-4),
    {
      providerName,
      accountHolderName: responseData.accountHolderName,
      bankName: responseData.bankName,
      ifsc: responseData.ifsc,
      accountNumber: '***' + cleanAccount.slice(-4),
      referenceId: responseData.referenceId,
      verifiedAt: responseData.verifiedAt,
      remainingCredits: responseData.remainingCredits
    }
  );

  return res.status(200).json(responseData);

  } finally {
    // Released on every path — success, provider failure, thrown error — so a
    // failed attempt can never leave the account locked out of retrying.
    VERIFY_IN_FLIGHT.delete(inFlightKey);
  }
};

/**
 * POST /api/bank/log-manual-override
 * Logs when HR or Super Admin enables manual override because API verification was unavailable or failed.
 */
exports.logManualOverride = async (req, res) => {
  const { ifsc, accountNumber, reason, employeeId } = req.body || {};
  const actorId = req.user?.id || 'SYSTEM';
  const actorName = req.user?.name || req.user?.email || 'HR Administrator';
  const cleanAccount = String(accountNumber || '').replace(/\s+/g, '').trim();

  await AuditService.logActivity(
    actorId,
    actorName,
    'BANK_MANUAL_OVERRIDE_ENABLED',
    'EmployeeBank',
    employeeId || (cleanAccount ? cleanAccount.slice(-4) : 'NEW'),
    {
      ifsc: ifsc || 'N/A',
      accountNumber: cleanAccount ? '***' + cleanAccount.slice(-4) : 'N/A',
      reason: reason || 'API verification unavailable or manual override selected'
    }
  );

  await AuditService.logAudit(
    actorId === 'SYSTEM' ? null : actorId,
    'BANK_MANUAL_OVERRIDE_ENABLED',
    'EmployeeBank',
    employeeId || 'NEW',
    { reason, ifsc }
  );

  // A manual override belongs in the same register as every automated
  // verification, and with the same who/where detail: it is the record of a human
  // deciding to bypass verification, which is precisely what an auditor looks for.
  const overrideTenant = resolveWalletCompany(req);
  const overrideCtx = overrideTenant.companyId
    ? await resolveEmployeeContext(req, overrideTenant.companyId, employeeId)
    : {};

  await BankVerificationService.logVerificationAudit({
    companyId: overrideTenant.companyId || null,
    provider: 'Manual Override',
    verificationMode: 'Manual',
    ifsc: ifsc || null,
    accountNumber: cleanAccount || null,
    employeeName: req.body?.employeeName || overrideCtx.employeeRecordName || null,
    enteredName: req.body?.employeeName || null,
    employeeId: overrideCtx.employeeId,
    employeeCode: overrideCtx.employeeCode,
    branchId: overrideCtx.branchId,
    branchName: overrideCtx.branchName,
    department: overrideCtx.department,
    designation: overrideCtx.designation,
    employeeEmail: overrideCtx.employeeEmail,
    employeePhone: overrideCtx.employeePhone,
    verifiedById: Number.isFinite(parseInt(actorId, 10)) ? parseInt(actorId, 10) : null,
    verifiedByName: actorName,
    verifiedByRole: req.user?.role || null,
    requestTimestamp: new Date(),
    responseTimestamp: new Date(),
    verificationCost: 0,
    status: 'MANUAL_OVERRIDE',
    errorMessage: reason || 'Manual override enabled'
  });

  return res.status(200).json({ success: true, message: 'Manual override logged in audit trail.' });
};

/**
 * GET /api/bank/settings
 * Retrieve BYO API bank verification configuration for the current company (tenant) with masked secrets.
 */
exports.getSettings = async (req, res) => {
  try {
    const tenant = resolveWalletCompany(req);
    if (tenant.error) return res.status(tenant.status || 400).json({ success: false, error: tenant.error });
    const settings = await BankVerificationService.getSettings(tenant.companyId);
    return res.status(200).json({ success: true, data: settings });
  } catch (err) {
    console.error('[BankController] getSettings error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/bank/settings
 * Save or update BYO API bank verification configuration for the current company (tenant).
 */
exports.saveSettings = async (req, res) => {
  try {
    const tenant = resolveWalletCompany(req);
    if (tenant.error) return res.status(tenant.status || 400).json({ success: false, error: tenant.error });
    const updated = await BankVerificationService.saveSettings(tenant.companyId, req.body);
    return res.status(200).json({ success: true, message: 'Bank verification settings saved successfully.', data: updated });
  } catch (err) {
    console.error('[BankController] saveSettings error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/bank/test-connection
 * Execute health check against configured verification provider using saved/decrypted BYO API credentials.
 */
exports.testConnection = async (req, res) => {
  try {
    const tenant = resolveWalletCompany(req);
    if (tenant.error) return res.status(tenant.status || 400).json({ ok: false, status: 'unresolved', message: tenant.error });
    const result = await BankVerificationService.testConnection(tenant.companyId);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[BankController] testConnection error:', err.message);
    return res.status(500).json({ ok: false, status: 'unreachable', message: err.message });
  }
};

/**
 * GET /api/bank/audit-logs
 * Retrieve immutable audit history of bank account verifications for the current company (tenant).
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const tenant = resolveWalletCompany(req);
    if (tenant.error) return res.status(tenant.status || 400).json({ success: false, error: tenant.error });
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = await BankVerificationService.getAuditLogs(tenant.companyId, limit);
    return res.status(200).json({ success: true, data: logs });
  } catch (err) {
    console.error('[BankController] getAuditLogs error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/bank/verifications
 * Paginated, filterable verification history for the current workspace (§7).
 * Every row is presented through the caller's permission level.
 */
exports.getVerifications = async (req, res) => {
  try {
    const tenant = resolveWalletCompany(req);
    if (tenant.error) return res.status(tenant.status || 400).json({ success: false, error: tenant.error });

    const { status, employeeId, branchId, startDate, endDate, search, page, limit } = req.query;

    // An employee may only ever see their own verification history. User.employeeId
    // is the Employee row id; an employee account with no linked employee record
    // is scoped to -1 so it matches nothing rather than falling through to the
    // whole company's register.
    const scopedEmployeeId = req.user?.role === 'Employee'
      ? (req.user?.employeeId ?? -1)
      : employeeId;

    const result = await BankVerificationService.getVerifications({
      companyId: tenant.companyId,
      status, employeeId: scopedEmployeeId, branchId, startDate, endDate, search, page, limit
    });

    const [stats] = await Promise.all([
      BankVerificationService.getVerificationStats(tenant.companyId)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...result,
        records: result.records.map((r) => presentRecord(r, req)),
        stats
      }
    });
  } catch (err) {
    console.error('[BankController] getVerifications error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/bank/verifications/:id
 * One stored verification, with the technical/raw blocks included only for the
 * roles entitled to them.
 */
exports.getVerificationById = async (req, res) => {
  try {
    const tenant = resolveWalletCompany(req);
    if (tenant.error) return res.status(tenant.status || 400).json({ success: false, error: tenant.error });

    const record = await BankVerificationService.getVerificationById(tenant.companyId, req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Verification record not found.' });

    if (req.user?.role === 'Employee') {
      const own = Number(req.user?.employeeId);
      if (!Number.isFinite(own) || Number(record.employeeId) !== own) {
        return res.status(403).json({ success: false, error: 'You can only view your own verification record.' });
      }
    }

    return res.status(200).json({ success: true, data: presentRecord(record, req) });
  } catch (err) {
    console.error('[BankController] getVerificationById error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/bank/verifications/latest/:employeeId
 * The stored result an employee profile shows. Reading this NEVER calls the
 * provider and never costs a credit (§15) — re-verification is an explicit action.
 */
exports.getLatestVerification = async (req, res) => {
  try {
    const tenant = resolveWalletCompany(req);
    if (tenant.error) return res.status(tenant.status || 400).json({ success: false, error: tenant.error });

    const ctx = await resolveEmployeeContext(req, tenant.companyId, req.params.employeeId);
    if (!ctx.employeeId) {
      return res.status(200).json({ success: true, data: null });
    }

    const record = await BankVerificationService.getLatestForEmployee(tenant.companyId, ctx.employeeId);
    return res.status(200).json({ success: true, data: record ? presentRecord(record, req) : null });
  } catch (err) {
    console.error('[BankController] getLatestVerification error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/bank/verifications/link
 * Attaches a verification performed during registration to the employee that
 * registration then created. Linkage only — the verification result is untouched.
 */
exports.linkVerification = async (req, res) => {
  try {
    const tenant = resolveWalletCompany(req);
    if (tenant.error) return res.status(tenant.status || 400).json({ success: false, error: tenant.error });

    const { referenceId, employeeId } = req.body || {};
    if (!referenceId || !employeeId) {
      return res.status(400).json({ success: false, error: 'referenceId and employeeId are required.' });
    }

    const ctx = await resolveEmployeeContext(req, tenant.companyId, employeeId);
    if (!ctx.employeeId) return res.status(404).json({ success: false, error: 'Employee not found in this workspace.' });

    const linked = await BankVerificationService.linkVerificationToEmployee({
      companyId: tenant.companyId,
      referenceId,
      employeeId: ctx.employeeId,
      employeeCode: ctx.employeeCode,
      branchId: ctx.branchId,
      branchName: ctx.branchName,
      department: ctx.department,
      designation: ctx.designation
    });

    // Carry the verified state onto the employee too. A verification run during
    // registration happens before the employee row exists, so this is the only
    // point at which the profile can be marked verified — without it, a freshly
    // registered employee would show as unverified despite a paid, successful
    // verification sitting in the register. Copied from the STORED record, so the
    // badge can never claim more than the record supports.
    const record = await BankVerificationService.getLatestForEmployee(tenant.companyId, ctx.employeeId, { referenceId });
    if (record && record.status === 'VERIFIED') {
      await stampEmployeeVerification(ctx.employeeId, {
        bankVerificationStatus: 'VERIFIED',
        bankVerificationRefId: record.referenceId,
        bankVerificationId: record.verificationId || record.referenceId,
        bankVerifiedAt: record.responseTimestamp || record.createdAt,
        bankVerifiedBy: record.verifiedByName,
        bankVerificationProvider: record.provider,
        bankVerificationEnvironment: record.environment,
        bankNameMatchResult: record.nameMatchResult,
        bankNameMatchScore: record.nameMatchScore,
        ...(record.micr ? { micr: record.micr } : {}),
        ...(record.swift ? { swift: record.swift } : {})
      });
    }

    return res.status(200).json({ success: true, linked, verified: record?.status === 'VERIFIED' });
  } catch (err) {
    console.error('[BankController] linkVerification error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/bank/payroll-policy
 * Whether payroll requires a verified bank account before salary transfer (§12),
 * plus the count of active employees that would fail that rule right now.
 */
exports.getPayrollPolicy = async (req, res) => {
  try {
    const tenant = resolveWalletCompany(req);
    if (tenant.error) return res.status(tenant.status || 400).json({ success: false, error: tenant.error });

    const settings = await VerificationCreditService.getSettings(tenant.companyId);
    const companyIds = [tenant.companyId, ...(req.user?.accessibleBranchIds || [])];

    const unverified = await prisma.employee.count({
      where: {
        companyId: { in: companyIds },
        status: 'Active',
        OR: [{ bankVerificationStatus: null }, { bankVerificationStatus: { not: 'VERIFIED' } }]
      }
    }).catch(() => 0);

    return res.status(200).json({
      success: true,
      data: {
        requireVerifiedBankForPayroll: Boolean(settings.requireVerifiedBankForPayroll),
        unverifiedActiveEmployees: unverified
      }
    });
  } catch (err) {
    console.error('[BankController] getPayrollPolicy error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/bank/payroll-policy
 * Turn the payroll verification requirement on or off. Leadership only — this
 * gates salary transfer, so it is not an HR-level toggle.
 */
exports.savePayrollPolicy = async (req, res) => {
  try {
    if (!['Super Admin', 'Company Head'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Only a Company Head or Super Admin can change the payroll verification policy.' });
    }
    const tenant = resolveWalletCompany(req);
    if (tenant.error) return res.status(tenant.status || 400).json({ success: false, error: tenant.error });

    const value = Boolean(req.body?.requireVerifiedBankForPayroll);
    await prisma.verificationSettings.upsert({
      where: { companyId: tenant.companyId },
      update: { requireVerifiedBankForPayroll: value },
      create: { companyId: tenant.companyId, requireVerifiedBankForPayroll: value }
    });

    await AuditService.logAudit(
      req.user?.id || null,
      'BANK_VERIFICATION_PAYROLL_POLICY_CHANGED',
      'VerificationSettings',
      String(tenant.companyId),
      { requireVerifiedBankForPayroll: value }
    );

    return res.status(200).json({ success: true, data: { requireVerifiedBankForPayroll: value } });
  } catch (err) {
    console.error('[BankController] savePayrollPolicy error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

