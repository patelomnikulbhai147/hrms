import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/Input';
import { SmartInput } from '@/components/ui/SmartInput';
import { api } from '@/api/apiClient';
import { usePermissions } from '@/context/PermissionContext';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Unlock, Building2, ShieldCheck, Ticket, Globe, Database, Activity, Info, ExternalLink, Clock } from 'lucide-react';
import { BankVerificationReport } from '@/components/bank/BankVerificationReport';
import { VerificationView, EnteredDetails, fromVerifyResponse, fromRecord } from '@/components/bank/bankVerification';
import { CREDIT_TOOLTIP, creditValue, creditUnit, creditsMeaning } from '@/components/verification/creditTerminology';

export interface BankData {
  accountHolderName?: string;
  accountNumber?: string;
  confirmAccountNumber?: string; // UI-only, never persisted unless needed
  ifsc?: string;
  bankName?: string;
  bankBranch?: string;
  bankAddress?: string;
  bankCity?: string;
  bankDistrict?: string;
  bankState?: string;
  micr?: string;
  swift?: string;
  verificationStatus?: 'VERIFIED' | 'FAILED' | 'NETWORK_ERROR' | 'UNVERIFIED';
  verificationReferenceId?: string;
  verifiedAt?: string;
  manualOverride?: boolean;
}

interface Props {
  data: BankData;
  onChange: (patch: Partial<BankData>) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  /**
   * Who this bank account belongs to. Entirely optional — every caller that
   * omits it keeps the previous behaviour. When supplied it does three things:
   * the verification record is filed against the employee, the name match has a
   * name to compare against, and the report can show the entered details section.
   */
  employee?: {
    id?: string | number | null;
    code?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    department?: string | null;
    designation?: string | null;
    branch?: string | null;
  };
  companyName?: string | null;
}

/**
 * Live wallet state for the signed-in workspace, exactly as
 * GET /api/verification-credits/wallet returns it. `isAvailable` is the server's
 * verdict on whether a verification can run right now, and `unavailableCode`
 * says which condition blocks it — the screen renders that verdict rather than
 * inferring one from the credit figure.
 */
interface WalletStatus {
  companyId: number;
  /** 1 credit = 1 successful verification, so this is also the verifications left. */
  remainingCredits: number;
  totalCredits: number;
  usedCredits: number;
  walletStatus: string;
  status: string;
  provider?: string;
  environment?: string | null;
  verificationMode?: string;
  isAvailable: boolean;
  unavailableCode: 'MANUAL_MODE' | 'SUSPENDED' | 'INSUFFICIENT_CREDITS' | null;
  reason: string;
}

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;

/** Shown on every verification control that is disabled for lack of credits. */
const NO_CREDITS_TOOLTIP = 'No verification credits available.';

/** Two mutually exclusive verification methods, rendered as a radio group. */
const VERIFICATION_METHODS: Array<{
  value: 'API' | 'MANUAL';
  manual: boolean;
  label: string;
  hint: string;
  recommended?: boolean;
}> = [
  {
    value: 'API',
    manual: false,
    label: 'Verify Bank Account',
    hint: 'Validate account holder & branch against the banking API.',
    recommended: true,
  },
  {
    value: 'MANUAL',
    manual: true,
    label: 'Add Manually (No API Verification)',
    hint: 'Enter bank details yourself. No verification tokens are used.',
  },
];

function formatVerifiedAt(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).replace(',', '');
  } catch {
    return isoString;
  }
}

/**
 * Enterprise Bank Details Section with Smart Auto-Fill & Verification.
 * - Initially requires ONLY: IFSC Code, Account Number, Confirm Account Number.
 * - Debounces IFSC lookup (400ms) to auto-populate Bank Name, Branch, City, State, MICR, SWIFT.
 * - Auto-triggers account verification once IFSC is valid & matching Account Numbers are entered.
 * - Displays an enterprise-grade Verification Card on success.
 * - Handles Failure, Network Timeout (with Retry), and Super Admin / HR Manual Override.
 */
export const BankDetails: React.FC<Props> = ({ data, onChange, errors = {}, disabled, employee, companyName }) => {
  const [ifscStatus, setIfscStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    data.ifsc && data.bankName ? 'success' : 'idle'
  );
  const [ifscErrorMsg, setIfscErrorMsg] = useState('');

  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'verifying' | 'verified' | 'failed' | 'network_error' | 'incomplete'>(
    data.verificationStatus === 'VERIFIED' && data.accountHolderName && data.accountHolderName !== 'Not Available' && data.accountHolderName !== 'N/A' && data.accountHolderName.trim() !== ''
      ? 'verified'
      : (data.verificationStatus === 'VERIFICATION_INCOMPLETE' as any) || (data.verificationStatus === 'VERIFIED' && (!data.accountHolderName || data.accountHolderName === 'Not Available' || data.accountHolderName === 'N/A'))
      ? 'incomplete'
      : 'idle'
  );
  const [verifyErrorMsg, setVerifyErrorMsg] = useState('');
  const [manual, setManual] = useState<boolean>(!!data.manualOverride);
  // The full verification record backing the enterprise report. Populated from a
  // live verification, or hydrated from the STORED record when an already-verified
  // employee is opened — reading it costs nothing and calls no provider (§15).
  const [verificationView, setVerificationView] = useState<VerificationView | null>(null);
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  // A wallet that has not loaded is NOT a wallet with no money. These are kept
  // apart so a slow or failed balance lookup can never be rendered as
  // "balance exhausted".
  const [walletState, setWalletState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [walletError, setWalletError] = useState('');
  const walletLoadedOnce = useRef(false);

  const fetchWallet = useCallback(async () => {
    setWalletState(prev => (prev === 'ready' ? prev : 'loading'));
    try {
      const res: any = await api.get('/api/verification-credits/wallet');
      const w: WalletStatus | null = res?.data || null;
      if (!w || typeof w.remainingCredits !== 'number') {
        throw new Error('The verification wallet returned an unreadable balance.');
      }
      setWallet(w);
      setWalletError('');
      setWalletState('ready');
      // A workspace with automated verification switched off starts on Manual —
      // but only as the initial default. Later refreshes must not overrule the
      // method the user has since chosen.
      if (!walletLoadedOnce.current) {
        walletLoadedOnce.current = true;
        if (w.unavailableCode === 'MANUAL_MODE') setManual(true);
      }
    } catch (err: any) {
      setWalletError(err?.message || 'Could not load the verification balance.');
      setWalletState('error');
    }
  }, []);

  useEffect(() => {
    fetchWallet();

    const handleWalletUpdate = (e: any) => {
      if (e.type === 'storage' && e.key !== 'hrms_wallet_updated') return;
      fetchWallet();
    };

    window.addEventListener('hrms:wallet-updated', handleWalletUpdate);
    window.addEventListener('storage', handleWalletUpdate);

    return () => {
      window.removeEventListener('hrms:wallet-updated', handleWalletUpdate);
      window.removeEventListener('storage', handleWalletUpdate);
    };
  }, [fetchWallet]);

  // Every figure below comes from the credits API. 1 credit = 1 successful
  // verification, so `remainingCredits` is also the number of verifications
  // left — there is no second figure to derive.
  const walletReady = walletState === 'ready' && !!wallet;
  const remainingCredits = wallet?.remainingCredits ?? 0;
  const apiAvailable = walletReady && !!wallet?.isAvailable;

  const ifscTimer = useRef<any>(null);
  // True while a verification request is on the wire. A ref, not state, so a
  // second click in the same tick can never slip past it.
  const verifyInFlight = useRef(false);
  const lastIfscLookup = useRef<string>(data.ifsc && data.bankName ? String(data.ifsc).toUpperCase() : '');
  const lastVerifiedKey = useRef<string>(
    data.verificationStatus === 'VERIFIED' ? `${String(data.ifsc).toUpperCase()}_${data.accountNumber}` : ''
  );

  // Clean raw inputs for validation
  const cleanIfsc = String(data.ifsc || '').toUpperCase().trim();
  const cleanAccount = String(data.accountNumber || '').replace(/\D/g, '').trim();
  const cleanConfirm = String(data.confirmAccountNumber || '').replace(/\D/g, '').trim();

  const acctMismatch = !!cleanAccount && !!cleanConfirm && cleanAccount !== cleanConfirm;
  const isAccountValid = ACCOUNT_RE.test(cleanAccount);
  const isIfscValid = IFSC_RE.test(cleanIfsc);
  // Confirmation must actually MATCH — an empty confirm box is not a match, so
  // it must not enable the (paid) Verify action.
  const confirmMatches = cleanConfirm.length > 0 && cleanConfirm === cleanAccount;

  // The identity of the account currently typed in. Verification is valid for
  // exactly one of these — change either half and the previous result no longer
  // describes what is on screen.
  const currentKey = `${cleanIfsc}_${cleanAccount}`;
  // Bank details were verified earlier and have since been edited. Purely a
  // local observation: it NEVER triggers a call, it only asks the user to verify
  // again before saving.
  const changedSinceVerified = !!lastVerifiedKey.current && lastVerifiedKey.current !== currentKey;
  // The wallet cannot fund a verification. Disables every verification
  // affordance here; the server enforces the same rule independently, so this is
  // a courtesy to the user, never the protection itself.
  const creditsExhausted = walletReady && wallet?.unavailableCode === 'INSUFFICIENT_CREDITS';
  const isVerifiedForCurrent = verifyStatus === 'verified' && lastVerifiedKey.current === currentKey;

  // What HR entered, for the report's "Employee Entered Details" panel (§2).
  // Built from the employee context and the form — never from the bank response,
  // which is what keeps the two columns of the report independent.
  const enteredDetails: EnteredDetails = {
    employeeName: employee?.name || null,
    employeeCode: employee?.code || (employee?.id != null ? String(employee.id) : null),
    accountNumber: cleanAccount || null,
    ifsc: cleanIfsc || null,
    phone: employee?.phone || null,
    email: employee?.email || null,
    branch: employee?.branch || null,
    department: employee?.department || null,
    designation: employee?.designation || null,
  };

  // 1. Run IFSC Lookup
  const runIfscLookup = async (code: string) => {
    setIfscStatus('loading');
    setIfscErrorMsg('');
    try {
      const r: any = await api.bank.ifscLookup(code);
      if (r && r.valid) {
        lastIfscLookup.current = code;
        setIfscStatus('success');
        onChange({
          ifsc: r.ifsc,
          bankName: r.bankName,
          bankBranch: r.bankBranch,
          bankAddress: r.bankAddress,
          bankCity: r.bankCity,
          bankDistrict: r.bankDistrict,
          bankState: r.bankState,
          micr: r.micr,
          swift: r.swift,
        });
      } else {
        setIfscStatus('error');
        setIfscErrorMsg(r?.error || 'Invalid IFSC Code. Bank details not found.');
      }
    } catch (e: any) {
      setIfscStatus('error');
      setIfscErrorMsg(e?.message || 'Failed to fetch bank details for this IFSC.');
    }
  };

  const onIfscChange = (val: string) => {
    const code = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    onChange({
      ifsc: code,
      // Clear previously fetched details on IFSC change unless manual override is active
      ...(manual ? {} : {
        bankName: '',
        bankBranch: '',
        bankAddress: '',
        bankCity: '',
        bankDistrict: '',
        bankState: '',
        micr: '',
        swift: '',
        accountHolderName: '',
        verificationStatus: 'UNVERIFIED',
        verificationReferenceId: '',
        verifiedAt: '',
      })
    });

    if (verifyStatus === 'verified' && !manual) {
      setVerifyStatus('idle');
      lastVerifiedKey.current = '';
    }

    if (ifscTimer.current) clearTimeout(ifscTimer.current);
    if (IFSC_RE.test(code)) {
      if (code === lastIfscLookup.current && data.bankName) {
        setIfscStatus('success');
        return;
      }
      ifscTimer.current = setTimeout(() => runIfscLookup(code), 400);
    } else {
      setIfscStatus(code.length > 0 ? 'error' : 'idle');
      setIfscErrorMsg(code.length > 0 && code.length < 11 ? 'IFSC code must be 11 characters (e.g., HDFC0001234)' : '');
    }
  };

  const onAccountChange = (val: string) => {
    const num = val.replace(/\D/g, '');
    onChange({
      accountNumber: num,
      ...(manual ? {} : {
        verificationStatus: 'UNVERIFIED',
        verificationReferenceId: '',
        verifiedAt: '',
        accountHolderName: '',
      })
    });
    if (verifyStatus === 'verified' && !manual) {
      setVerifyStatus('idle');
      lastVerifiedKey.current = '';
    }
  };

  const onConfirmAccountChange = (val: string) => {
    const num = val.replace(/\D/g, '');
    onChange({ confirmAccountNumber: num });
  };

  // 2. Account Verification — MANUAL ONLY.
  //
  //    This is the single call site for the paid Cashfree API and it is reached
  //    from exactly one place: the user clicking Verify / Reverify / Retry. It is
  //    deliberately NOT wired to any effect, watcher, change/blur handler,
  //    validation pass, mount, or save — a verification costs real money and
  //    debits the workspace wallet, so it happens only when a person asks for it.
  const runVerification = async () => {
    if (disabled || manual || !apiAvailable) return;
    if (!isIfscValid || !isAccountValid || acctMismatch || !confirmMatches) return;
    // Guard against a double click / double submit landing two paid calls. The
    // ref (not state) is what makes this reliable — it updates synchronously.
    if (verifyInFlight.current) return;
    if (lastVerifiedKey.current === currentKey && verifyStatus === 'verified') return;

    verifyInFlight.current = true;
    setVerifyStatus('verifying');
    setVerifyErrorMsg('');
    try {
      const res: any = await api.bank.verifyAccount({
        ifsc: cleanIfsc,
        accountNumber: cleanAccount,
        // The EMPLOYEE's name is what the bank name-match compares against. Falls
        // back to the form's account-holder field so a caller that passes no
        // employee context behaves exactly as before.
        employeeName: employee?.name || data.accountHolderName || '',
        ...(employee?.id != null || employee?.code ? { employeeId: (employee?.id ?? employee?.code) as any } : {}),
      });

      if (res && res.verified && res.accountHolderName && res.accountHolderName !== 'Not Available' && res.accountHolderName !== 'N/A' && res.accountHolderName.trim() !== '') {
        lastVerifiedKey.current = currentKey;
        setVerifyStatus('verified');
        setVerificationView(fromVerifyResponse(res, enteredDetails));
        // Re-read the wallet from the server rather than patching a number into
        // local state, so the balance, the verifications left, and the
        // availability verdict all come from the row that was just debited.
        fetchWallet();
        window.dispatchEvent(new CustomEvent('hrms:wallet-updated'));
        localStorage.setItem('hrms_wallet_updated', Date.now().toString());
        onChange({
          accountHolderName: res.accountHolderName,
          bankName: res.bankName || data.bankName,
          bankBranch: res.branch || data.bankBranch,
          bankCity: res.city || data.bankCity,
          bankDistrict: res.district || data.bankDistrict,
          bankState: res.state || data.bankState,
          ifsc: res.ifsc || cleanIfsc,
          micr: res.micr || data.micr,
          swift: res.swift || data.swift,
          verificationStatus: 'VERIFIED',
          verificationReferenceId: res.referenceId,
          verifiedAt: res.verifiedAt,
        });
      } else {
        lastVerifiedKey.current = '';
        // A failed attempt must not leave the previous success's report on screen.
        setVerificationView(null);
        if (res?.status === 'NETWORK_ERROR') {
          setVerifyStatus('network_error');
        } else if (res?.status === 'VERIFICATION_INCOMPLETE' || (res && res.verified && (!res.accountHolderName || res.accountHolderName === 'Not Available' || res.accountHolderName === 'N/A'))) {
          setVerifyStatus('incomplete');
        } else {
          setVerifyStatus('failed');
        }
        setVerifyErrorMsg(res?.error || 'Account number is active, but account holder name is unavailable from the banking provider.');
        onChange({
          accountHolderName: undefined,
          verificationStatus: res?.status || 'VERIFICATION_INCOMPLETE'
        });
      }
    } catch (e: any) {
      lastVerifiedKey.current = '';
      setVerificationView(null);
      if (e?.isNetworkError || e?.status === 503 || e?.status === 502) {
        setVerifyStatus('network_error');
        onChange({ verificationStatus: 'NETWORK_ERROR' });
      } else {
        setVerifyStatus('failed');
        onChange({ verificationStatus: 'FAILED' });
      }
      setVerifyErrorMsg(e?.message || 'Network error during bank account verification.');
      // 402 = the server declined on wallet grounds (balance, mode, suspension).
      // Re-read the wallet so the banner states the server's actual reason.
      if (e?.status === 402) fetchWallet();
    } finally {
      verifyInFlight.current = false;
    }
  };

  /**
   * Deliberate re-check of an account that is already verified. Clears the
   * "already verified for this key" short-circuit inside runVerification so the
   * single call it makes is not skipped. Still one call, still user-initiated.
   */
  const reverify = () => {
    if (verifyInFlight.current) return;
    lastVerifiedKey.current = '';
    runVerification();
  };

  // NOTE: there is deliberately no effect here that starts a verification.
  // Typing an IFSC / account number, blurring a field, re-rendering, mounting,
  // editing an existing employee or saving the form must never reach the paid
  // API. The ONLY trigger is the Verify / Reverify / Retry button's onClick.

  // Hydrate the report for an employee that was verified previously. This is a
  // READ of the stored record — it never contacts the provider and never costs a
  // credit, which is precisely why an already-verified employee opens with the
  // full report instead of an invitation to pay for the same answer twice.
  useEffect(() => {
    const employeeRef = employee?.id ?? employee?.code;
    if (!employeeRef || verificationView) return;
    if (data.verificationStatus !== 'VERIFIED') return;

    let cancelled = false;
    (async () => {
      try {
        const res: any = await api.bank.latestVerification(employeeRef);
        if (cancelled || !res?.data) return;
        setVerificationView(fromRecord(res.data, enteredDetails));
      } catch {
        // No stored record is not an error: the section simply falls back to the
        // compact verified summary built from the form's own values.
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, employee?.code, data.verificationStatus]);

  /**
   * Switch verification method. Never clears already-entered values — only the
   * verification flag/status is touched, and VERIFIED is kept when it still holds.
   */
  const changeMethod = (nextManual: boolean) => {
    if (disabled || nextManual === manual) return;
    setManual(nextManual);
    setVerifyErrorMsg('');

    if (nextManual) {
      onChange({ manualOverride: true });
      return;
    }

    const alreadyVerified = data.verificationStatus === 'VERIFIED' && verifyStatus === 'verified';
    if (!alreadyVerified) setVerifyStatus('idle');
    onChange({
      manualOverride: false,
      ...(alreadyVerified ? {} : { verificationStatus: 'UNVERIFIED' }),
    });
  };

  // Verification is offered when the inputs are valid AND the server says this
  // workspace can currently run one (funded for at least one verification at the
  // configured price, API mode on, not suspended).
  const canVerifyNow =
    !disabled &&
    !manual &&
    isIfscValid &&
    isAccountValid &&
    confirmMatches &&
    verifyStatus !== 'verifying' &&
    apiAvailable;

  // Why the Verify button is unavailable, in the server's words where the server
  // is the one refusing.
  const blockedReason = manual
    ? ''
    : walletState === 'loading'
    ? 'Checking your verification balance…'
    : walletState === 'error'
    ? walletError
    : !apiAvailable
    ? wallet?.reason || ''
    : !isIfscValid
    ? 'Enter a valid 11-character IFSC to verify.'
    : !isAccountValid
    ? 'Enter a valid account number (9–18 digits) to verify.'
    : !confirmMatches
    ? 'Re-enter the same account number in Confirm Account Number to verify.'
    : '';

  // The pointer to Settings is only offered to someone who can actually open it —
  // an HR user without Settings access would be sent to a door they can't unlock.
  const { canView } = usePermissions();
  const canOpenSettings = canView('settings');

  /**
   * Opens Settings → Integrations → Bank Verification in a NEW TAB. Deliberately
   * not an in-app navigation: this section sits inside a part-filled employee
   * registration form, and routing away from it would discard everything typed so
   * far just to read a setting.
   */
  const openBankVerificationSettings = () => {
    window.open('/settings?tab=integrations', '_blank', 'noopener,noreferrer');
  };

  const enableManualOverride = async () => {
    setManual(true);
    onChange({ manualOverride: true, verificationStatus: 'UNVERIFIED' });
    try {
      await api.bank.logManualOverride({
        ifsc: cleanIfsc,
        accountNumber: cleanAccount,
        reason: 'HR/Admin enabled manual override in UI',
      });
    } catch (_) {
      // Ignore background audit log network error
    }
  };

  /**
   * What the report renders. The stored/live record is always preferred; when
   * there isn't one — an employee verified before this module existed, or a
   * caller that passes no employee context — the form's own values are shown and
   * everything the form cannot know (verification id, latency, cost, wallet
   * movement) reads "N/A" rather than being invented.
   */
  const reportView: VerificationView | null =
    verificationView ||
    (verifyStatus === 'verified'
      ? {
          recordId: null,
          status: 'VERIFIED',
          verified: true,
          verifiedAt: data.verifiedAt || null,
          provider: wallet?.provider || null,
          verificationSource: wallet?.provider || null,
          environment: wallet?.environment || null,
          referenceId: data.verificationReferenceId || null,
          verificationId: null,
          requestId: null,
          responseTimeMs: null,
          verificationCost: null,
          verifiedBy: null,
          verifiedByRole: null,
          companyName: companyName || null,
          branchName: employee?.branch || null,
          entered: enteredDetails,
          accountHolderName: data.accountHolderName || null,
          bankName: data.bankName || null,
          bankBranch: data.bankBranch || null,
          branchAddress: data.bankAddress || null,
          city: data.bankCity || null,
          district: data.bankDistrict || null,
          state: data.bankState || null,
          ifsc: data.ifsc || null,
          micr: data.micr || null,
          swift: data.swift || null,
          utr: null,
          accountStatus: null,
          accountStatusCode: null,
          verificationMessage: null,
          nameMatchResult: null,
          nameMatchScore: null,
          nameMatchSource: null,
          httpStatus: null,
          retryCount: null,
          walletBalanceBefore: null,
          walletBalanceAfter: null,
          requestTimestamp: null,
          responseTimestamp: data.verifiedAt || null,
          errorMessage: null,
          createdAt: data.verifiedAt || null,
          permissions: { canSeeTechnical: false, canSeeRaw: false },
        }
      : null);

  return (

    <div className="space-y-4 border-t border-slate-200 pt-4 mt-6">
      {/* Header Description */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-brand-600" />
          <h4 className="text-sm font-bold text-slate-800">Bank Account Verification</h4>
        </div>
        {manual && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
            <Unlock className="w-3.5 h-3.5" /> Manual Entry Enabled
          </span>
        )}
      </div>

      {/* Verification Method & Credit Wallet Selector Card */}
      <div className="bg-slate-50 border border-slate-200 p-4 lg:p-5 rounded-xl space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <span id="bank-verification-method-label" className="text-[12px] font-bold text-slate-600 uppercase tracking-wide">
              Verification Method
            </span>
            <div
              role="radiogroup"
              aria-labelledby="bank-verification-method-label"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2"
            >
              {VERIFICATION_METHODS.map(opt => {
                const selected = manual === opt.manual;
                return (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-2.5 px-3.5 py-3 rounded-lg border shadow-sm transition-all ${
                      selected
                        ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-500/20'
                        : 'border-slate-300 bg-white hover:border-slate-400'
                    } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <input
                      type="radio"
                      name="bank-verification-method"
                      value={opt.value}
                      checked={selected}
                      disabled={disabled}
                      onChange={() => changeMethod(opt.manual)}
                      className="mt-0.5 w-4 h-4 shrink-0 accent-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed"
                    />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-bold text-slate-800 leading-snug">
                        {opt.label}
                        {opt.recommended && (
                          <span className="ml-1.5 align-middle inline-block text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                            Recommended
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] font-medium text-slate-500 leading-relaxed mt-1">{opt.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs" title={CREDIT_TOOLTIP}>
            <Ticket className="w-4 h-4 text-brand-600" />
            <span className="text-slate-600 font-semibold">Available Verification Credits:</span>
            {walletState === 'loading' && (
              <span className="font-bold px-2.5 py-1 rounded-md shadow-sm bg-slate-100 text-slate-500 border border-slate-200 inline-flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" /> Checking…
              </span>
            )}
            {walletState === 'error' && (
              <span className="font-bold px-2.5 py-1 rounded-md shadow-sm bg-slate-100 text-slate-500 border border-slate-200">
                Unavailable
              </span>
            )}
            {walletReady && (
              <>
                <span className={`font-bold px-2.5 py-1 rounded-md shadow-sm ${
                  remainingCredits >= 2 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  remainingCredits >= 1 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {creditValue(remainingCredits)} {creditUnit(remainingCredits)}
                </span>
                <span className="text-slate-500 font-medium">
                  = {creditsMeaning(remainingCredits)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Credits that could not be read are reported as exactly that — never as
            credits exhausted. */}
        {!manual && walletState === 'error' && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-900 font-semibold shadow-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed flex-1">
              {walletError || 'Could not load your verification credits.'} No verification credits have been used.
            </span>
            <button
              type="button"
              onClick={fetchWallet}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {/* Credits exhausted. Every verification affordance is disabled while this
            is showing — and the server refuses independently, so a button
            re-enabled in devtools still reaches nothing. Employee registration
            itself is unaffected: only verification is blocked. */}
        {!manual && walletReady && wallet?.unavailableCode === 'INSUFFICIENT_CREDITS' && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg shadow-sm">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h5 className="text-[13px] font-bold text-red-900">Verification Credits Exhausted</h5>
                <p className="text-[12px] font-medium text-red-800 mt-1 leading-relaxed">
                  Your organization has no API verification credits remaining.
                  {' '}Please ask your administrator to add more verification credits — each credit allows one verification.
                </p>
                <p className="text-[12px] font-medium text-red-800 mt-1.5 leading-relaxed">
                  You can still save this employee — switch to <strong>"Add Manually"</strong> to enter the bank details yourself.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Automated verification is switched off (or suspended) for this
            workspace. A single compact line: it is a state to be aware of, not a
            failure, so it must not occupy a banner's worth of the form. The
            credit figure is read from the server — it is never a literal. */}
        {!manual && walletReady && (wallet?.unavailableCode === 'MANUAL_MODE' || wallet?.unavailableCode === 'SUSPENDED') && (
          <div className="min-h-[36px] px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-amber-900">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="font-semibold">
              {wallet?.unavailableCode === 'SUSPENDED'
                ? 'Automated verification is suspended for this workspace.'
                : 'Automated verification is disabled for this workspace.'}
            </span>
            <span className="font-medium text-amber-800">
              {wallet?.unavailableCode === 'SUSPENDED'
                ? 'Contact your administrator to restore it.'
                : 'Enable it in Settings → Bank Verification.'}
            </span>
            <span className="font-medium text-amber-800" title={CREDIT_TOOLTIP}>
              Your {creditValue(remainingCredits)} verification {creditUnit(remainingCredits)} remain available.
            </span>
            {wallet?.unavailableCode === 'MANUAL_MODE' && canOpenSettings && (
              <button
                type="button"
                onClick={openBankVerificationSettings}
                className="ml-auto shrink-0 inline-flex items-center gap-1 font-bold text-amber-800 underline underline-offset-2 decoration-amber-300 hover:text-amber-900 hover:decoration-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 rounded transition-colors"
              >
                Open Settings <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {!manual && apiAvailable && (
          <div className="flex flex-col gap-4 mt-2">
            <p className="text-[12px] text-slate-500 font-medium" title={CREDIT_TOOLTIP}>
              Using <strong className="text-brand-600">{wallet?.provider}</strong>. A valid IFSC with matching account numbers verifies the account and consumes <strong className="text-slate-700">1 verification credit</strong>, deducted only when verification succeeds. You have <strong className="text-slate-700">{creditValue(remainingCredits)}</strong> verification {creditUnit(remainingCredits)} remaining.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-[12px] font-semibold bg-white border border-slate-200 px-4 py-3 rounded-lg shadow-sm w-fit">
              {wallet?.environment && (
                <>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Globe className="w-4 h-4 text-blue-500" />
                    <span className="uppercase tracking-wide text-[10px] font-bold">Environment:</span>
                    <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">{wallet.environment}</span>
                  </div>
                  <div className="w-px h-5 bg-slate-200 hidden sm:block" />
                </>
              )}
              <div className="flex items-center gap-2 text-slate-600">
                <Database className="w-4 h-4 text-indigo-500" />
                <span className="uppercase tracking-wide text-[10px] font-bold">Provider:</span>
                <span className="text-indigo-700">{wallet?.provider}</span>
              </div>
              <div className="w-px h-5 bg-slate-200 hidden sm:block" />
              <div className="flex items-center gap-2 text-slate-600">
                <Activity className="w-4 h-4 text-emerald-500" />
                <span className="uppercase tracking-wide text-[10px] font-bold">Status:</span>
                <span className="text-emerald-700 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {wallet?.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Manual is a deliberate choice, not a problem — so it reads as
            information (neutral slate), never as a warning, and it replaces the
            API-disabled alert rather than stacking with it. */}
        {manual && (
          <div className="min-h-[32px] px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-2 text-[11.5px] font-medium text-slate-600">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Manual entry selected. No verification tokens will be consumed.</span>
          </div>
        )}
      </div>

      {/* Mandatory Initial Inputs: ONLY IFSC, Account Number, Confirm Account Number */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Input
            id="field-ifsc"
            label="IFSC Code *"
            placeholder="e.g. HDFC0001234"
            className="font-mono uppercase transition-all duration-200 focus:ring-2 focus:ring-brand-500/20"
            value={data.ifsc || ''}
            disabled={disabled}
            onChange={e => onIfscChange(e.target.value)}
            error={errors.ifsc || (ifscStatus === 'error' ? ifscErrorMsg : '')}
          />
          {ifscStatus === 'loading' && (
            <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mt-1 animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin text-brand-400" /> Fetching branch details...
            </p>
          )}
          {ifscStatus === 'success' && !errors.ifsc && (
            <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> IFSC Valid & Resolved
            </p>
          )}
        </div>

        <div>
          <SmartInput
            id="field-accountNumber"
            type="bankAccount"
            label="Account Number *"
            required
            className="font-mono transition-all duration-200 focus:ring-2 focus:ring-brand-500/20"
            placeholder="9 to 18 digits"
            value={data.accountNumber || ''}
            disabled={disabled}
            externalError={errors.accountNumber || (!isAccountValid && cleanAccount.length > 0 ? 'Must be 9-18 digits' : '')}
            onValueChange={onAccountChange}
          />
        </div>

        <div>
          <SmartInput
            id="field-confirmAccountNumber"
            type="bankAccount"
            label="Confirm Account Number *"
            required
            className="font-mono transition-all duration-200 focus:ring-2 focus:ring-brand-500/20"
            placeholder="Re-enter Account No."
            value={data.confirmAccountNumber || ''}
            disabled={disabled}
            externalError={acctMismatch ? 'Account numbers do not match.' : errors.confirmAccountNumber}
            onValueChange={onConfirmAccountChange}
          />
        </div>
      </div>

      {/* Bank details edited after a successful verification. Stated, never acted
          on — the earlier result is cleared locally and the user decides when to
          spend another verification. */}
      {!manual && !disabled && changedSinceVerified && verifyStatus !== 'verifying' && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-amber-900">Verification required</p>
            <p className="text-[12px] font-medium text-amber-800 mt-0.5">
              Bank details have changed. Please verify again before saving.
            </p>
          </div>
        </div>
      )}

      {/* Verify Account action — the ONLY path to the paid API. Hidden once the
          account on screen is the one that was verified; the verified card below
          carries Reverify for a deliberate re-check. */}
      {!manual && !disabled && !isVerifiedForCurrent && (
        <div className="flex flex-wrap items-center gap-3">
          {/* The wrapper keeps the tooltip reachable: a disabled button swallows
              pointer events, so `title` on the button alone would never show. */}
          <span title={creditsExhausted ? NO_CREDITS_TOOLTIP : (!canVerifyNow ? blockedReason : undefined)}>
          <button
            type="button"
            onClick={runVerification}
            disabled={!canVerifyNow}
            title={creditsExhausted ? NO_CREDITS_TOOLTIP : undefined}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-[14px] font-semibold bg-brand-600 hover:bg-brand-700 text-white transition-all shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            {verifyStatus === 'verifying' ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Verifying...</>
            ) : verifyStatus === 'failed' || verifyStatus === 'network_error' || verifyStatus === 'incomplete' ? (
              <><RefreshCw className="w-4 h-4" /> Retry Verification</>
            ) : (
              <><ShieldCheck className="w-4 h-4" /> Verify Account</>
            )}
          </button>
          </span>
          {verifyStatus !== 'verifying' && (
            !canVerifyNow && !!blockedReason ? (
              <span className="text-[12px] text-slate-500 font-medium">{blockedReason}</span>
            ) : canVerifyNow && !changedSinceVerified ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-700">
                <Clock className="w-3.5 h-3.5" /> Verification pending — no verification credits are used until you click Verify.
              </span>
            ) : null
          )}
        </div>
      )}

      {/* Verification Loading State */}
      {verifyStatus === 'verifying' && (
        <div className="rounded-[16px] border border-gray-200 bg-white p-5 flex items-center gap-4 shadow-sm">
          <RefreshCw className="w-6 h-6 text-brand-500 animate-spin flex-shrink-0" />
          <div>
            <p className="text-[15px] font-bold text-gray-900">Verifying bank account...</p>
            <p className="text-[13px] text-gray-600 font-medium mt-0.5">Connecting to banking partner to validate account holder and IFSC details.</p>
          </div>
        </div>
      )}

      {/* Verification Failure Card */}
      {verifyStatus === 'failed' && !manual && (
        <div className="rounded-[16px] border border-[#FCA5A5] bg-[#FEF2F2] p-5 lg:p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <XCircle className="w-[22px] h-[22px] text-[#B91C1C] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h5 className="text-[18px] font-bold text-[#B91C1C]">Unable to Verify Account</h5>
              <p className="text-[14px] font-medium text-[#7F1D1D] mt-1 leading-relaxed">
                {verifyErrorMsg || 'Bank verification is currently unavailable for this workspace. Please use Manual Entry or contact your administrator.'}
              </p>
              
              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#FCA5A5]/40 pt-5">
                <div>
                  <span className="text-[12px] font-semibold text-gray-600 block uppercase tracking-wide">Account Holder</span>
                  <span className="font-bold text-gray-900 text-[14px] mt-1 block truncate">Not Verified</span>
                </div>
                <div className="text-right">
                  <span className="text-[12px] font-semibold text-gray-600 block uppercase tracking-wide">Verification Status</span>
                  <span className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full bg-[#FEE2E2] border border-[#FCA5A5] text-[#B91C1C] text-[12px] font-bold shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-[#B91C1C]"></span> Verification Failed
                  </span>
                </div>
              </div>
            </div>
          </div>
          {!disabled && (
            <div className="flex justify-end pt-5 mt-2">
              <button
                type="button"
                onClick={enableManualOverride}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-[14px] font-semibold bg-[#D97706] hover:bg-[#B45309] text-white transition-all shadow-sm hover:shadow active:scale-[0.98]"
              >
                <Unlock className="w-4 h-4" /> Unlock Manual Entry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Network Failure / Service Unavailable Card */}
      {verifyStatus === 'network_error' && !manual && (
        <div className="rounded-[16px] border border-[#F59E0B] bg-[#FFFBEB] p-5 lg:p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-[22px] h-[22px] text-[#92400E] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h5 className="text-[18px] font-bold text-[#92400E]">Network Failure / Service Unavailable</h5>
              <p className="text-[14px] font-medium text-[#92400E] mt-1 leading-relaxed">
                {verifyErrorMsg || 'We could not connect to the verification service. Please try again later.'}
              </p>
            </div>
          </div>
          {!disabled && (
            <div className="flex items-center justify-end gap-3 pt-5 mt-2">
              {/* Retry is a verification like any other — it obeys the same
                  credit gate, so an exhausted wallet cannot be retried around. */}
              <button
                type="button"
                onClick={runVerification}
                disabled={!canVerifyNow}
                title={creditsExhausted ? NO_CREDITS_TOOLTIP : undefined}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-[14px] font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              >
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
              <button
                type="button"
                onClick={enableManualOverride}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-[14px] font-semibold bg-[#D97706] hover:bg-[#B45309] text-white transition-all shadow-sm hover:shadow active:scale-[0.98]"
              >
                <Unlock className="w-4 h-4" /> Enable Manual Entry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Verification Incomplete Card (Provider does not return account holder name) */}
      {verifyStatus === 'incomplete' && !manual && (
        <div className="rounded-[16px] border border-[#F59E0B] bg-[#FFFBEB] p-5 lg:p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-[22px] h-[22px] text-[#92400E] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h5 className="text-[18px] font-bold text-[#92400E]">Verification Incomplete</h5>
              <p className="text-[14px] font-medium text-[#92400E] mt-1 leading-relaxed">
                {verifyErrorMsg || 'Account is active, but account holder name is unavailable from the banking provider.'}
              </p>
              
              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#F59E0B]/30 pt-5">
                <div>
                  <span className="text-[12px] font-semibold text-gray-600 block uppercase tracking-wide">Account Holder</span>
                  <span className="font-bold text-gray-900 text-[14px] mt-1 block truncate">Unavailable</span>
                </div>
                <div className="text-right">
                  <span className="text-[12px] font-semibold text-gray-600 block uppercase tracking-wide">Verification Status</span>
                  <span className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full bg-[#FEF3C7] border border-[#F59E0B] text-[#92400E] text-[12px] font-bold shadow-sm">
                    ⚠ Incomplete
                  </span>
                </div>
              </div>
            </div>
          </div>
          {!disabled && (
            <div className="flex justify-end pt-5 mt-2">
              <button
                type="button"
                onClick={enableManualOverride}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-[14px] font-semibold bg-[#D97706] hover:bg-[#B45309] text-white transition-all shadow-sm hover:shadow active:scale-[0.98]"
              >
                <Unlock className="w-4 h-4" /> Unlock Manual Entry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Manual Override Active Alert & Inputs */}
      {manual && (
        <div className="rounded-[16px] border border-[#F59E0B] bg-[#FFFBEB] p-5 lg:p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#F59E0B]/30">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-[18px] h-[18px] text-[#92400E]" />
              <span className="text-[15px] font-bold text-[#92400E]">Manual entry enabled. Details are saved exactly as entered.</span>
            </div>
            <span className="text-[11px] font-bold tracking-wider text-[#92400E] bg-[#FEF3C7] px-2.5 py-1 rounded-md border border-[#F59E0B]/50 uppercase">
              Audited Action
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input
              id="field-accountHolderName"
              label="Account Holder Name *"
              placeholder="Full Name as per bank records"
              value={data.accountHolderName || ''}
              disabled={disabled}
              onChange={e => onChange({ accountHolderName: e.target.value })}
              error={errors.accountHolderName}
            />
            <Input
              label="Bank Name *"
              placeholder="e.g. HDFC Bank"
              value={data.bankName || ''}
              disabled={disabled}
              onChange={e => onChange({ bankName: e.target.value })}
              error={errors.bankName}
            />
            <Input
              label="Branch Name"
              placeholder="e.g. Ashram Road"
              value={data.bankBranch || ''}
              disabled={disabled}
              onChange={e => onChange({ bankBranch: e.target.value })}
            />
            <Input
              label="City"
              placeholder="e.g. Ahmedabad"
              value={data.bankCity || ''}
              disabled={disabled}
              onChange={e => onChange({ bankCity: e.target.value })}
            />
            <Input
              label="District"
              placeholder="e.g. Ahmedabad"
              value={data.bankDistrict || ''}
              disabled={disabled}
              onChange={e => onChange({ bankDistrict: e.target.value })}
            />
            <Input
              label="State"
              placeholder="e.g. Gujarat"
              value={data.bankState || ''}
              disabled={disabled}
              onChange={e => onChange({ bankState: e.target.value })}
            />
            <Input
              label="MICR Code (Optional)"
              placeholder="e.g. 380240003"
              className="font-mono"
              value={data.micr || ''}
              disabled={disabled}
              onChange={e => onChange({ micr: e.target.value })}
            />
            <Input
              label="SWIFT Code (Optional)"
              placeholder="e.g. HDFCINBB"
              className="font-mono uppercase"
              value={data.swift || ''}
              disabled={disabled}
              onChange={e => onChange({ swift: e.target.value.toUpperCase() })}
            />
          </div>
        </div>
      )}

      {/* Enterprise verification report — summary, entered details, bank result,
          name match, timeline, technical panel and the export actions (§1–§6, §8).
          Reverify is passed through so the ONLY paid trigger remains a click. */}
      {verifyStatus === 'verified' && !manual && reportView && (
        <BankVerificationReport
          view={reportView}
          companyName={companyName}
          onReverify={!disabled && apiAvailable ? reverify : undefined}
        />
      )}

    </div>
  );
};

export default BankDetails;
