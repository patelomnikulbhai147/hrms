import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { CREDIT_TOOLTIP, creditValue, creditsMeaning } from '@/components/verification/creditTerminology';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Lock,
  Activity,
  UserCheck,
  FileText
} from 'lucide-react';
import { BankVerificationHistory } from '@/components/bank/BankVerificationHistory';
import { PayrollVerificationPolicy } from '@/components/bank/PayrollVerificationPolicy';

interface BankVerificationSettingsProps {
  companyId: string;
  canEdit?: boolean;
  /** Shown on exported/printed verification reports. */
  companyName?: string | null;
  /** Passed through to the payroll policy control for labelling only. */
  role?: string | null;
}

/**
 * Live verification state for this workspace, exactly as
 * GET /api/verification-credits/wallet returns it. This is the ONLY source the
 * screen reads: mode, remaining credits and the server's own verdict on whether
 * a verification can run right now.
 */
interface WalletStatus {
  /** 1 credit = 1 successful verification, so this is also the verifications left. */
  remainingCredits: number;
  totalCredits: number;
  usedCredits: number;
  walletStatus: string;
  status: string;
  provider?: string;
  verificationMode?: string;
  isAvailable: boolean;
  unavailableCode: 'MANUAL_MODE' | 'SUSPENDED' | 'INSUFFICIENT_CREDITS' | null;
  reason: string;
}

/** Every spelling the backend accepts as "automated verification is on". */
const API_MODES = ['API', 'API Verification', 'Fetch by API'];

/**
 * Bank Verification — company-facing settings.
 *
 * The provider, endpoint and API credentials are configured ONCE, centrally, by
 * the platform administrator and are never exposed here: a company user's only
 * decision is whether automated verification runs for their workspace. That is a
 * single toggle, which writes the verification MODE through the existing
 * /api/verification-credits/settings endpoint (which in turn keeps the bank
 * verification settings table in sync). No credential ever reaches this screen,
 * so none can be read or edited from it.
 */
export const BankVerificationSettings: React.FC<BankVerificationSettingsProps> = ({
  companyId,
  canEdit = true,
  companyName,
  role
}) => {
  const [activeTab, setActiveTab] = useState<'verification' | 'audit'>('verification');
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);


  const [requestingCredits, setRequestingCredits] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestedAmount, setRequestedAmount] = useState(50);
  const [creditRemarks, setCreditRemarks] = useState('');

  const fetchWallet = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await api.get('/api/verification-credits/wallet', { params: { companyId } });
      const w: WalletStatus | null = res?.data || null;
      if (!w || typeof w.remainingCredits !== 'number') {
        throw new Error('The verification credit total could not be read.');
      }
      setWallet(w);
      setLoadError('');
    } catch (err: any) {
      console.error('Failed to load verification credits:', err);
      setLoadError(err?.message || 'Could not load bank verification settings.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // The audit tab now renders BankVerificationHistory, which owns its own
  // fetching, filtering and pagination — the flat 50-row list this component used
  // to hold has no remaining reader.

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const apiEnabled = API_MODES.includes(wallet?.verificationMode || '');
  const remainingCredits = wallet?.remainingCredits ?? 0;
  // A platform-level suspension is NOT something a company user can toggle their
  // way out of, so it is stated plainly rather than hidden behind a switch that
  // would appear to work and then change nothing.
  const suspended = wallet?.walletStatus === 'Suspended' || wallet?.status === 'Suspended';
  // 1 credit = 1 verification, so "cannot verify" is simply "no credits left".
  const underfunded = apiEnabled && remainingCredits < 1;

  /**
   * The single control on this screen. Writes ONLY the verification mode — never
   * the wallet/API status, which is the platform admin's to set, and never a
   * credential.
   */
  const toggleApiVerification = async (next: boolean) => {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      await api.put('/api/verification-credits/settings', {
        companyId,
        verificationMode: next ? 'API Verification' : 'Manual'
      });
      await fetchWallet();
      // Any open employee-registration form re-reads its wallet on this signal.
      window.dispatchEvent(new CustomEvent('hrms:wallet-updated'));
      localStorage.setItem('hrms_wallet_updated', Date.now().toString());
      ui.toast.success(
        next
          ? 'API verification enabled. Employee registration will verify bank accounts automatically.'
          : 'Manual entry mode enabled. No API calls will be made and no credits will be used.'
      );
    } catch (err: any) {
      // Leaves the toggle showing the server's actual state — it is re-derived
      // from the wallet, so a rejected change can never look like it applied.
      ui.toast.error(err?.message || 'Could not update the verification mode.');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestingCredits(true);
    try {
      const res = await api.post('/api/verification-credits/request-credits', {
        companyId,
        credits: requestedAmount,
        remarks: creditRemarks
      });
      ui.toast.success(res?.data?.message || 'Verification credit request submitted to Super Admin successfully.');
      setShowRequestModal(false);
      setCreditRemarks('');
      fetchWallet();
    } catch (err: any) {
      ui.toast.error(err?.message || 'Could not submit the verification credit request.');
    } finally {
      setRequestingCredits(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    const s = String(status || '').toUpperCase();
    if (s === 'CONNECTED' || s === 'VERIFIED' || s === 'SUCCESS' || status === 'connected') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 size={13} className="text-emerald-600" />
          {status || 'Connected'}
        </span>
      );
    }
    if (s === 'VERIFICATION_INCOMPLETE' || s === 'MANUAL_ONLY' || s === 'MANUAL_OVERRIDE') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
          <AlertTriangle size={13} className="text-amber-600" />
          {status}
        </span>
      );
    }
    if (s === 'RATE_LIMITED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300">
          <Activity size={13} className="text-orange-600" />
          Rate Limited
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
        <XCircle size={13} className="text-rose-600" />
        {status || 'Disconnected / Failed'}
      </span>
    );
  };

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <RefreshCw size={24} className="animate-spin mx-auto text-brand-600 mb-2" />
        <p className="text-sm text-gray-500">Loading bank verification settings…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden border border-indigo-500/20">
        <div className="absolute right-0 top-0 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-brand-600 flex items-center justify-center shadow-lg shrink-0">
              <ShieldCheck size={26} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white tracking-tight">Bank Verification</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Centrally Managed
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                The verification provider and its credentials are configured once for the whole platform and stay encrypted on the server. Choose whether this workspace verifies bank accounts automatically.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            <button
              type="button"
              onClick={() => setActiveTab('verification')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'verification'
                  ? 'bg-white text-slate-900 shadow-md font-bold'
                  : 'bg-white/10 text-slate-200 hover:bg-white/20'
              }`}
            >
              <ShieldCheck size={14} />
              Verification
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'bg-white text-slate-900 shadow-md font-bold'
                  : 'bg-white/10 text-slate-200 hover:bg-white/20'
              }`}
            >
              <Activity size={14} />
              Audit Trail
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'verification' && (
        <>
          {loadError && (
            <Card className="p-4 border-amber-200 bg-amber-50">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-amber-900">
                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                <span className="flex-1">{loadError}</span>
                <Button type="button" variant="outline" size="sm" onClick={fetchWallet} className="gap-1.5 text-xs">
                  <RefreshCw size={13} /> Retry
                </Button>
              </div>
            </Card>
          )}

          {wallet && (
            <Card className="p-6 border-slate-200 shadow-sm space-y-5">
              {/* The one control */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${apiEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {apiEnabled ? <ShieldCheck size={22} /> : <UserCheck size={22} />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Enable API Verification</h3>
                    <p className="text-xs text-slate-500 mt-0.5 max-w-xl leading-relaxed">
                      When on, employee bank accounts are verified against the banking API during registration. When off, bank details are entered manually.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-bold ${apiEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {saving ? 'SAVING…' : apiEnabled ? 'ON' : 'OFF'}
                  </span>
                  <label className={`relative inline-flex items-center ${canEdit && !saving ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label="Enable API verification"
                      checked={apiEnabled}
                      disabled={!canEdit || saving}
                      onChange={(e) => toggleApiVerification(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-1 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              {/* Resulting state — what the toggle actually means for the workspace. */}
              {apiEnabled ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-emerald-900">API Verification Enabled</h4>
                      <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                        Using global verification configuration.
                      </p>
                      <p className="text-xs text-emerald-900 font-semibold mt-1" title={CREDIT_TOOLTIP}>
                        Remaining Verification Credits: {creditValue(remainingCredits)}
                        <span className="font-medium text-emerald-800">
                          {' '}— {creditsMeaning(remainingCredits)}. One credit is deducted only when a verification succeeds.
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start gap-2.5">
                    <UserCheck size={18} className="text-slate-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-800">Manual Entry Mode Enabled</h4>
                      <ul className="text-xs text-slate-600 mt-1 space-y-0.5 leading-relaxed">
                        <li>Bank verification is disabled.</li>
                        <li>No API calls will be made.</li>
                        <li title={CREDIT_TOOLTIP}>Verification credits remain untouched — {creditValue(remainingCredits)} remaining.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Conditions the toggle alone cannot resolve. */}
              {suspended && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-2.5">
                  <XCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-rose-900">Verification suspended by the platform administrator</h4>
                    <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                      Automated verification stays unavailable for this workspace until the suspension is lifted, regardless of this setting. Please contact support.
                    </p>
                  </div>
                </div>
              )}

              {underfunded && !suspended && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center gap-3">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                  <p className="text-xs font-semibold text-amber-900 flex-1 min-w-[16rem] leading-relaxed" title={CREDIT_TOOLTIP}>
                    No verification credits remaining. Registration falls back to manual entry until more verification credits are added — each credit allows one verification.
                  </p>
                  <Button
                    type="button"
                    onClick={() => setShowRequestModal(true)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-sm px-4 py-2"
                  >
                    Request Verification Credits
                  </Button>
                </div>
              )}

              {/* Credit summary + the only other action a company user has. */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs" title={CREDIT_TOOLTIP}>
                  <span className="text-slate-500 font-medium">
                    Credits Used <strong className="text-slate-700">{creditValue(wallet.usedCredits)}</strong> of{' '}
                    <strong className="text-slate-700">{creditValue(wallet.totalCredits)}</strong> total credits allocated
                  </span>
                  <span className="text-slate-500 font-medium">
                    Credit status: <strong className="text-slate-700">{wallet.walletStatus}</strong>
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRequestModal(true)}
                  className="gap-1.5 text-xs font-semibold"
                >
                  + Request Verification Credits
                </Button>
              </div>

              {/* States the security posture in the place a company user would
                  otherwise go looking for credential fields. */}
              <div className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
                <Lock size={13} className="text-slate-400 shrink-0 mt-0.5" />
                <span>
                  The verification provider and API credentials are managed centrally by the platform administrator and remain encrypted on the server. They cannot be viewed or edited from this workspace.
                </span>
              </div>

              {!canEdit && (
                <p className="text-[11px] font-semibold text-slate-500">
                  You have read-only access to this setting. Ask your Company Head to change it.
                </p>
              )}
            </Card>
          )}
        </>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 pb-1">
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 shrink-0">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">Verification Audit History</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Every verification attempt ever made, permanently retained. Records are never edited or deleted;
                account numbers are masked and API credentials are never stored.
              </p>
            </div>
          </div>

          {/* The full register: filters, per-record detail, name match, timeline,
              technical panel and exports. Replaces the flat table this tab used to
              show — same immutable data, read through the enterprise report. */}
          <BankVerificationHistory companyName={companyName} />

          {/* Payroll protection policy (§12) — leadership only. */}
          <PayrollVerificationPolicy role={role} />
        </div>
      )}

      {/* Request Credits Modal Popup */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Request Verification Credits</h3>
                  <p className="text-xs text-slate-500">Ask the Super Admin to allocate more verification credits</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowRequestModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
            </div>

            <form onSubmit={handleRequestCredits} className="space-y-4 text-sm">
              <div>
                <label
                  htmlFor="requested-verification-credits"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1"
                  title={CREDIT_TOOLTIP}
                >
                  Verification Credits Requested
                </label>
                <select
                  id="requested-verification-credits"
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(parseInt(e.target.value, 10))}
                  title={CREDIT_TOOLTIP}
                  aria-describedby="requested-verification-credits-help"
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={20}>20 Verification Credits</option>
                  <option value={50}>50 Verification Credits (Standard Pack)</option>
                  <option value={100}>100 Verification Credits (Pro Pack)</option>
                  <option value={250}>250 Verification Credits (Enterprise Pack)</option>
                  <option value={500}>500 Verification Credits</option>
                </select>
                <p id="requested-verification-credits-help" className="text-[11px] font-medium text-slate-500 mt-1.5 leading-relaxed">
                  One verification credit allows one successful API verification — credits are a
                  verification quota, not money. Requesting {requestedAmount.toLocaleString()} credits
                  asks for exactly {requestedAmount.toLocaleString()} verification{requestedAmount === 1 ? '' : 's'}.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Remarks / Note for Admin</label>
                <textarea
                  rows={3}
                  value={creditRemarks}
                  onChange={(e) => setCreditRemarks(e.target.value)}
                  placeholder="E.g., High recruitment volume expected this month..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-normal text-slate-700 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={requestingCredits}
                  className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-semibold text-xs transition shadow-md disabled:opacity-50"
                >
                  {requestingCredits ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
