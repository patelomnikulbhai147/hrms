import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/api/apiClient';
import { ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';
import { CREDIT_TOOLTIP, creditValue, creditsMeaning, creditUnit } from './creditTerminology';

/**
 * Remaining API-verification credits for the active workspace.
 *
 * One credit = one successful verification, so the credit figure IS the number
 * of verifications left; no second, converted figure is shown. Credits are a
 * QUOTA, not money — this card renders no currency. Reads the same endpoint
 * every verification screen reads, so the figure on the dashboard and the figure
 * that decides whether a verification may run can never disagree. Presentation
 * only — it enforces nothing; the server does that on every request.
 *
 * Severity follows the remaining credits:
 *   0            → verification disabled (red)
 *   < 10         → red
 *   < 20         → orange
 *   otherwise    → healthy
 */
interface Wallet {
  /** 1 credit = 1 successful verification, so this is also the verifications left. */
  remainingCredits: number;
  isAvailable: boolean;
  unavailableCode: 'MANUAL_MODE' | 'SUSPENDED' | 'INSUFFICIENT_CREDITS' | null;
  reason: string;
}

interface Props {
  /** Opens the verification-credits dialog when the viewer is allowed to. */
  onViewWallet?: () => void;
}

export const VerificationCreditsCard: React.FC<Props> = ({ onViewWallet }) => {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res: any = await api.get('/api/verification-credits/wallet');
      const w = res?.data;
      if (!w || typeof w.remainingCredits !== 'number') throw new Error('unreadable');
      setWallet(w);
      setFailed(false);
    } catch {
      // Credits that cannot be read are NOT credits at zero — the card hides
      // rather than inventing an alarming number.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    const onUpdate = (e: any) => {
      if (e.type === 'storage' && e.key !== 'hrms_wallet_updated') return;
      load();
    };
    window.addEventListener('hrms:wallet-updated', onUpdate);
    window.addEventListener('storage', onUpdate);

    // The in-app events above only fire for changes THIS browser made. Credits
    // can also change from outside this session entirely — a Super Admin
    // allocating credits from the Credit Management portal is the common case —
    // and the card would then keep showing a stale figure (often a stale zero)
    // until the page was reloaded by hand. Re-reading when the tab regains focus
    // or becomes visible covers that without polling the server continuously.
    const refreshIfVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.removeEventListener('hrms:wallet-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [load]);

  if (failed || !wallet) return null;

  const credits = wallet.remainingCredits;
  const exhausted = credits <= 0 || wallet.unavailableCode === 'INSUFFICIENT_CREDITS';
  const severity = exhausted || credits < 10 ? 'red' : credits < 20 ? 'orange' : 'ok';

  const tone = {
    red: { ring: 'border-rose-200', chipBg: 'bg-rose-50 text-rose-700 border-rose-200', icon: 'bg-rose-50 text-rose-600', value: 'text-rose-700' },
    orange: { ring: 'border-amber-200', chipBg: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'bg-amber-50 text-amber-600', value: 'text-amber-700' },
    ok: { ring: 'border-[#E5E7EB]', chipBg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'bg-emerald-50 text-emerald-600', value: 'text-gray-900' },
  }[severity];

  return (
    <div className={`bg-white rounded-[18px] border ${tone.ring} shadow-sm p-5 hover:shadow-md transition-shadow`} title={CREDIT_TOOLTIP}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex gap-3 items-center min-w-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tone.icon}`}>
            {exhausted ? <XCircle size={18} strokeWidth={2.5} /> : severity === 'orange' ? <AlertTriangle size={18} strokeWidth={2.5} /> : <ShieldCheck size={18} strokeWidth={2.5} />}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-gray-500">Remaining Verification Credits</p>
            <h3 className={`text-[28px] font-bold leading-tight mt-1 ${tone.value}`}>
              {creditValue(credits)} <span className="text-[13px] font-semibold text-gray-400">{creditUnit(credits)}</span>
            </h3>
            <p className="text-[11px] font-medium text-gray-500 mt-1">
              {creditsMeaning(credits)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {exhausted ? (
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${tone.chipBg}`}>
              <XCircle size={12} /> Verification Disabled
            </span>
          ) : severity === 'orange' || severity === 'red' ? (
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${tone.chipBg}`}>
              <AlertTriangle size={12} /> Low Credits
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${tone.chipBg}`}>
              <ShieldCheck size={12} /> Active
            </span>
          )}
          {onViewWallet && (
            <button
              type="button"
              onClick={onViewWallet}
              title={CREDIT_TOOLTIP}
              className="text-[11px] font-bold text-brand-600 hover:text-brand-700 hover:underline underline-offset-2 transition-colors"
            >
              View Verification Credits
            </button>
          )}
        </div>
      </div>

      {exhausted && (
        <p className="text-[11.5px] font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-3 leading-relaxed">
          API verification is blocked until more verification credits are added. Employee records can still be created and saved with bank details entered manually.
        </p>
      )}
    </div>
  );
};
