/**
 * bankVerification.ts
 *
 * The single shape the Bank Account Verification report renders from, and the
 * adapter that produces it.
 *
 * Two very different objects describe the same verification: the JSON that
 * POST /api/bank/verify-account returns the instant a verification completes, and
 * the row that GET /api/bank/verifications returns forever after. Rendering each
 * one separately is how a screen ends up showing more (or less) than the record it
 * claims to display, so both are normalised here into one `VerificationView` and
 * there is exactly one renderer downstream.
 */

export type VerificationStatus =
  | 'VERIFIED'
  | 'FAILED'
  | 'VERIFICATION_INCOMPLETE'
  | 'NETWORK_ERROR'
  | 'MANUAL_ONLY'
  | 'MANUAL_OVERRIDE'
  | 'RATE_LIMITED'
  | 'INSUFFICIENT_CREDITS'
  | 'DEBIT_FAILED'
  | 'PENDING'
  | 'UNVERIFIED';

export type NameMatchResult = 'EXACT_MATCH' | 'PARTIAL_MATCH' | 'MISMATCH' | 'NOT_COMPARED';

/** What HR typed. Never overwritten with values the bank returned (§2). */
export interface EnteredDetails {
  employeeName?: string | null;
  employeeCode?: string | null;
  accountNumber?: string | null;
  ifsc?: string | null;
  phone?: string | null;
  email?: string | null;
  branch?: string | null;
  department?: string | null;
  designation?: string | null;
}

export interface VerificationView {
  recordId?: number | null;

  // Summary
  status: VerificationStatus;
  verified: boolean;
  verifiedAt?: string | null;
  provider?: string | null;
  verificationSource?: string | null;
  environment?: string | null;
  referenceId?: string | null;
  verificationId?: string | null;
  requestId?: string | null;
  responseTimeMs?: number | null;
  verificationCost?: number | null;
  verifiedBy?: string | null;
  verifiedByRole?: string | null;
  companyName?: string | null;
  branchName?: string | null;

  // What HR entered
  entered: EnteredDetails;

  // What the bank returned
  accountHolderName?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  branchAddress?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  ifsc?: string | null;
  micr?: string | null;
  swift?: string | null;
  utr?: string | null;
  accountStatus?: string | null;
  accountStatusCode?: string | null;
  verificationMessage?: string | null;

  // Name match
  nameMatchResult?: NameMatchResult | null;
  nameMatchScore?: number | null;
  nameMatchSource?: string | null;

  // Technical (present only when the caller is entitled to it)
  httpStatus?: number | null;
  retryCount?: number | null;
  walletBalanceBefore?: number | null;
  walletBalanceAfter?: number | null;
  requestTimestamp?: string | null;
  responseTimestamp?: string | null;
  rawRequest?: any;
  rawResponse?: any;

  errorMessage?: string | null;
  createdAt?: string | null;

  permissions: { canSeeTechnical: boolean; canSeeRaw: boolean };
}

/** Placeholder for any value the provider did not return (§3). */
export const NA = 'N/A';

/** Render a value, or "N/A" — never a blank cell. */
export const orNA = (value: unknown): string => {
  if (value === null || value === undefined) return NA;
  const s = String(value).trim();
  return s === '' ? NA : s;
};

/**
 * Mask an account number to its last 4 digits (§13). Applied at every render
 * site; the backend already stores it masked, but a value arriving straight from
 * the form is still full-length and must never be painted on screen in full.
 */
export const maskAccount = (value?: string | null): string => {
  if (!value) return NA;
  const raw = String(value).trim();
  // Already masked by the server (e.g. "***1853") — pass through untouched.
  if (raw.includes('*')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return NA;
  if (digits.length <= 4) return '****';
  return `${'•'.repeat(Math.min(digits.length - 4, 12))}${digits.slice(-4)}`;
};

const num = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/**
 * Normalise a STORED record (GET /api/bank/verifications…) into the view model.
 */
export function fromRecord(record: any, entered?: EnteredDetails): VerificationView | null {
  if (!record) return null;

  return {
    recordId: record.id ?? null,
    status: (record.status || 'UNVERIFIED') as VerificationStatus,
    verified: record.status === 'VERIFIED',
    verifiedAt: record.responseTimestamp || record.createdAt || null,
    provider: str(record.provider),
    verificationSource: str(record.verificationSource),
    environment: str(record.environment),
    referenceId: str(record.referenceId),
    verificationId: str(record.verificationId),
    requestId: str(record.requestId),
    responseTimeMs: num(record.responseTimeMs),
    verificationCost: num(record.verificationCost),
    verifiedBy: str(record.verifiedByName),
    verifiedByRole: str(record.verifiedByRole),
    companyName: str(record.companyName),
    branchName: str(record.branchName),

    entered: {
      // The stored record is the authority on what was entered at the time —
      // a live form value would misrepresent a historical verification.
      employeeName: str(record.enteredName) || str(record.employeeName) || entered?.employeeName || null,
      employeeCode: str(record.employeeCode) || entered?.employeeCode || null,
      accountNumber: str(record.accountNumberMasked) || entered?.accountNumber || null,
      ifsc: str(record.ifsc) || entered?.ifsc || null,
      phone: str(record.employeePhone) || entered?.phone || null,
      email: str(record.employeeEmail) || entered?.email || null,
      branch: str(record.branchName) || entered?.branch || null,
      department: str(record.department) || entered?.department || null,
      designation: str(record.designation) || entered?.designation || null,
    },

    accountHolderName: str(record.accountHolderName),
    bankName: str(record.bankName),
    bankBranch: str(record.bankBranch) || str(record.branchName2),
    branchAddress: str(record.branchAddress),
    city: str(record.city),
    district: str(record.district),
    state: str(record.state),
    ifsc: str(record.ifsc),
    micr: str(record.micr),
    swift: str(record.swift),
    utr: str(record.utr),
    accountStatus: str(record.accountStatus),
    accountStatusCode: str(record.accountStatusCode),
    verificationMessage: str(record.verificationMessage),

    nameMatchResult: (str(record.nameMatchResult) as NameMatchResult) || null,
    nameMatchScore: num(record.nameMatchScore),
    nameMatchSource: str(record.nameMatchSource),

    httpStatus: num(record.httpStatus),
    retryCount: num(record.retryCount),
    walletBalanceBefore: num(record.walletBalanceBefore),
    walletBalanceAfter: num(record.walletBalanceAfter),
    requestTimestamp: record.requestTimestamp || null,
    responseTimestamp: record.responseTimestamp || null,
    rawRequest: record.rawRequest ?? undefined,
    rawResponse: record.rawResponse ?? undefined,

    errorMessage: str(record.errorMessage),
    createdAt: record.createdAt || null,

    permissions: record.permissions || { canSeeTechnical: false, canSeeRaw: false },
  };
}

/**
 * Normalise a LIVE verify-account response into the view model.
 *
 * When the server also returned the freshly written record, that is preferred —
 * it is the row the history will show, so the screen and the history agree by
 * construction instead of by coincidence.
 */
export function fromVerifyResponse(response: any, entered: EnteredDetails): VerificationView | null {
  if (!response) return null;

  if (response.verificationRecord) {
    const view = fromRecord(response.verificationRecord, entered);
    if (view) {
      // The live response carries the IFSC-enriched bank block; keep whichever
      // side actually has a value rather than letting a null overwrite a name.
      view.bankName = view.bankName || str(response.bankName);
      view.bankBranch = view.bankBranch || str(response.branch);
      view.city = view.city || str(response.city);
      view.district = view.district || str(response.district);
      view.state = view.state || str(response.state);
      view.micr = view.micr || str(response.micr);
      view.swift = view.swift || str(response.swift);
      return view;
    }
  }

  const nameMatch = response.nameMatch || {};

  return {
    recordId: response.recordId ?? null,
    status: (response.status || (response.verified ? 'VERIFIED' : 'FAILED')) as VerificationStatus,
    verified: !!response.verified,
    verifiedAt: response.verifiedAt || null,
    provider: str(response.provider),
    verificationSource: str(response.verificationSource),
    environment: str(response.environment),
    referenceId: str(response.referenceId),
    verificationId: str(response.verificationId),
    requestId: str(response.requestId),
    responseTimeMs: num(response.responseTimeMs),
    verificationCost: num(response.costPerVerification),
    verifiedBy: null,
    verifiedByRole: null,
    companyName: null,
    branchName: entered.branch || null,

    entered,

    accountHolderName: str(response.accountHolderName),
    bankName: str(response.bankName),
    bankBranch: str(response.branch),
    branchAddress: str(response.branchAddress),
    city: str(response.city),
    district: str(response.district),
    state: str(response.state),
    ifsc: str(response.ifsc),
    micr: str(response.micr),
    swift: str(response.swift),
    utr: str(response.utr),
    accountStatus: str(response.accountStatus),
    accountStatusCode: str(response.accountStatusCode),
    verificationMessage: str(response.verificationMessage),

    nameMatchResult: (str(nameMatch.result) as NameMatchResult) || null,
    nameMatchScore: num(nameMatch.score),
    nameMatchSource: str(nameMatch.source),

    httpStatus: num(response.httpStatus),
    retryCount: null,
    walletBalanceBefore: null,
    walletBalanceAfter: num(response.remainingCredits),
    requestTimestamp: null,
    responseTimestamp: response.verifiedAt || null,
    rawRequest: undefined,
    rawResponse: response.raw ?? undefined,

    errorMessage: str(response.error),
    createdAt: response.verifiedAt || null,

    permissions: response.verificationRecord?.permissions || { canSeeTechnical: false, canSeeRaw: false },
  };
}

/** Status → the palette the whole module shares (§1). */
export function statusTone(status?: string | null): 'green' | 'amber' | 'red' | 'slate' {
  switch (status) {
    case 'VERIFIED':
      return 'green';
    case 'VERIFICATION_INCOMPLETE':
    case 'MANUAL_ONLY':
    case 'MANUAL_OVERRIDE':
    case 'PENDING':
    case 'RATE_LIMITED':
      return 'amber';
    case 'FAILED':
    case 'NETWORK_ERROR':
    case 'INSUFFICIENT_CREDITS':
    case 'DEBIT_FAILED':
      return 'red';
    default:
      return 'slate';
  }
}

/** Human label for a status code. */
export function statusLabel(status?: string | null): string {
  switch (status) {
    case 'VERIFIED': return 'Verified';
    case 'FAILED': return 'Failed';
    case 'VERIFICATION_INCOMPLETE': return 'Incomplete';
    case 'NETWORK_ERROR': return 'Network Error';
    case 'MANUAL_ONLY': return 'Manual Mode';
    case 'MANUAL_OVERRIDE': return 'Manual Override';
    case 'RATE_LIMITED': return 'Rate Limited';
    case 'INSUFFICIENT_CREDITS': return 'Insufficient Credits';
    case 'DEBIT_FAILED': return 'Credit Deduction Failed';
    case 'PENDING': return 'Pending';
    case 'UNVERIFIED': return 'Not Verified';
    default: return status ? String(status).replace(/_/g, ' ') : 'Unknown';
  }
}

export function nameMatchTone(result?: string | null): 'green' | 'amber' | 'red' | 'slate' {
  switch (result) {
    case 'EXACT_MATCH': return 'green';
    case 'PARTIAL_MATCH': return 'amber';
    case 'MISMATCH': return 'red';
    default: return 'slate';
  }
}

export function nameMatchLabel(result?: string | null): string {
  switch (result) {
    case 'EXACT_MATCH': return 'Exact Match';
    case 'PARTIAL_MATCH': return 'Partial Match';
    case 'MISMATCH': return 'Mismatch';
    case 'NOT_COMPARED': return 'Not Compared';
    default: return 'Not Available';
  }
}

export interface TimelineStep {
  key: string;
  label: string;
  timestamp?: string | null;
  state: 'done' | 'failed' | 'skipped';
  detail?: string | null;
}

/**
 * The verification story, in order, with a timestamp on every step (§5).
 *
 * Steps carry the timestamps actually recorded. Where a step has no distinct
 * timestamp of its own it shows none rather than borrowing a neighbour's — an
 * invented time on an audit timeline is worse than an absent one.
 */
export function buildTimeline(view: VerificationView): TimelineStep[] {
  const requested = view.requestTimestamp || view.createdAt || null;
  const responded = view.responseTimestamp || view.verifiedAt || null;
  const failed = !view.verified;

  const steps: TimelineStep[] = [
    {
      key: 'submitted',
      label: 'Employee bank details submitted',
      timestamp: requested,
      state: 'done',
      detail: view.entered.ifsc ? `IFSC ${view.entered.ifsc} · A/C ${maskAccount(view.entered.accountNumber)}` : null,
    },
    {
      key: 'request',
      label: `${view.provider || 'Verification'} API request sent`,
      timestamp: requested,
      state: 'done',
      detail: view.environment ? `${view.environment} environment` : null,
    },
    {
      key: 'response',
      label: 'Bank response received',
      timestamp: responded,
      state: failed ? 'failed' : 'done',
      detail: view.responseTimeMs != null ? `${view.responseTimeMs} ms` : null,
    },
    {
      key: 'completed',
      label: failed ? 'Verification could not be completed' : 'Verification completed',
      timestamp: responded,
      state: failed ? 'failed' : 'done',
      detail: failed ? view.errorMessage : view.accountStatus ? `Account status: ${view.accountStatus}` : null,
    },
    {
      key: 'verified',
      label: failed ? 'Employee not verified' : 'Employee verified',
      timestamp: failed ? null : responded,
      state: failed ? 'failed' : 'done',
      detail: failed ? null : view.accountHolderName,
    },
  ];

  return steps;
}
