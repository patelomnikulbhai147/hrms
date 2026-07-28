// ─────────────────────────────────────────────────────────────────────────────
// Verification credit enforcement — the single gate every API-based verification
// must pass before a provider is contacted.
//
// One implementation, one wallet read. Bank account verification uses it today;
// PAN / Aadhaar / GST / CIN / Licence / Passport / Voter ID and anything added
// later use it by passing their own serviceType — no module name is hardcoded
// here, and no module may re-implement the check.
//
// The rule it enforces: a provider call is only ever made when the workspace's
// wallet can fund it. Blocked attempts cost nothing, contact no provider, create
// no success record, and are written to the audit trail.
// ─────────────────────────────────────────────────────────────────────────────
const VerificationCreditService = require('../services/verificationCreditService');
const AuditService = require('../services/auditService');

// Wallet verdict → stable, client-facing error code. `unavailableCode` is the
// wallet's vocabulary; these are the API's.
const BLOCK_CODES = {
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_VERIFICATION_CREDITS',
  SUSPENDED: 'VERIFICATION_SUSPENDED',
  MANUAL_MODE: 'MANUAL_VERIFICATION_MODE',
};

// Legacy `status` values, preserved so existing clients keep working unchanged.
const LEGACY_STATUS = {
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  SUSPENDED: 'SUSPENDED',
  MANUAL_MODE: 'MANUAL_ONLY',
};

const DEFAULT_MESSAGE =
  'Verification credits have been exhausted. Please contact your administrator or purchase additional credits.';

/**
 * Read the workspace's verification wallet ONCE and return the verdict.
 * Resolution of which wallet (company / parent company / branch) belongs to the
 * wallet service — this never reaches around it.
 */
async function evaluateCredits(companyId, serviceType = 'BANK_VERIFICATION') {
  return VerificationCreditService.checkCredits(companyId, serviceType);
}

/** Shape the refusal. Body carries BOTH the new contract and the legacy fields. */
function buildBlockResponse(creditStatus) {
  const key = creditStatus.unavailableCode || 'INSUFFICIENT_CREDITS';
  return {
    httpStatus: 402,
    body: {
      success: false,
      code: BLOCK_CODES[key] || BLOCK_CODES.INSUFFICIENT_CREDITS,
      message: creditStatus.reason || DEFAULT_MESSAGE,
      // ── Legacy fields (unchanged clients keep reading these) ──
      verified: false,
      status: LEGACY_STATUS[key] || LEGACY_STATUS.INSUFFICIENT_CREDITS,
      error: creditStatus.reason || DEFAULT_MESSAGE,
      remainingCredits: creditStatus.remainingCredits,
      remainingVerifications: creditStatus.remainingVerifications,
      costPerVerification: creditStatus.costPerVerification,
    },
  };
}

/**
 * Record a blocked attempt. Deliberately provider-agnostic: no provider name is
 * written because no provider was contacted — the request never left the system.
 */
async function logBlockedAttempt({ req, companyId, serviceType, moduleLabel, employeeId, creditStatus }) {
  const key = creditStatus.unavailableCode || 'INSUFFICIENT_CREDITS';
  try {
    await AuditService.logAudit(
      req?.user?.id || null,
      'VERIFICATION_BLOCKED',
      moduleLabel || serviceType || 'Verification',
      employeeId ? String(employeeId) : String(companyId),
      {
        event: 'Verification Blocked',
        reason: key === 'INSUFFICIENT_CREDITS' ? 'Insufficient Verification Credits' : creditStatus.reason,
        code: BLOCK_CODES[key] || BLOCK_CODES.INSUFFICIENT_CREDITS,
        module: moduleLabel || serviceType,
        serviceType,
        companyId,
        branchId: req?.headers?.['x-workspace-kind'] === 'branch' ? req.headers['x-workspace-id'] : null,
        employeeId: employeeId || null,
        requestedBy: req?.user?.name || req?.user?.email || 'Unknown',
        requestedByUserId: req?.user?.id || null,
        remainingCredits: creditStatus.remainingCredits,
        costPerVerification: creditStatus.costPerVerification,
        timestamp: new Date().toISOString(),
      }
    );
  } catch (e) {
    // Never let an audit failure decide whether a verification runs.
    console.error('[verificationCreditGuard] audit log failed:', e.message);
  }
}

/**
 * Programmatic guard for controllers that already resolved their own companyId.
 *
 * Returns `{ ok: true, creditStatus }` when the verification may proceed, or
 * `{ ok: false, creditStatus, httpStatus, body }` when it must not — the caller
 * simply returns that response. The wallet is read exactly once; pass the
 * returned creditStatus on rather than checking again.
 */
async function ensureVerificationCredits({
  req,
  companyId,
  serviceType = 'BANK_VERIFICATION',
  moduleLabel,
  employeeId = null,
}) {
  const creditStatus = await evaluateCredits(companyId, serviceType);
  if (creditStatus.isAvailable) return { ok: true, creditStatus };

  await logBlockedAttempt({ req, companyId, serviceType, moduleLabel, employeeId, creditStatus });
  const { httpStatus, body } = buildBlockResponse(creditStatus);
  return { ok: false, creditStatus, httpStatus, body };
}

/**
 * Express middleware form, for verification routes added later. Mount it in
 * front of the handler and the handler can trust `req.verificationCredits`
 * without reading the wallet again:
 *
 *   router.post('/verify-pan',
 *     requireVerificationCredits('PAN_VERIFICATION', 'PANVerification'),
 *     controller.verifyPan);
 */
const requireVerificationCredits = (serviceType = 'BANK_VERIFICATION', moduleLabel) => async (req, res, next) => {
  try {
    const companyId =
      req.user?.companyId || req.body?.companyId || req.query?.companyId || req.headers['x-workspace-id'];
    const result = await ensureVerificationCredits({
      req,
      companyId,
      serviceType,
      moduleLabel,
      employeeId: req.body?.employeeId || null,
    });
    if (!result.ok) return res.status(result.httpStatus).json(result.body);
    req.verificationCredits = result.creditStatus;
    return next();
  } catch (e) {
    console.error('[verificationCreditGuard] error:', e.message);
    // Fail CLOSED: if the wallet cannot be evaluated, no paid call is made.
    return res.status(402).json({
      success: false,
      code: 'VERIFICATION_CREDITS_UNAVAILABLE',
      message: 'Verification credits could not be confirmed, so the request was not sent to the provider.',
      verified: false,
      status: 'INSUFFICIENT_CREDITS',
      error: 'Verification credits could not be confirmed, so the request was not sent to the provider.',
    });
  }
};

module.exports = {
  BLOCK_CODES,
  ensureVerificationCredits,
  requireVerificationCredits,
  buildBlockResponse,
  logBlockedAttempt,
};
