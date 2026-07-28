import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, ShieldCheck, XCircle, Clock } from 'lucide-react';
import { api } from '@/api/apiClient';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/utils/formatDate';
import { CREDIT_TOOLTIP, creditValue, creditsMeaning, creditUnit } from './creditTerminology';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Viewer's role — decides how much of the wallet is shown (§Permissions). */
  role?: string | null;
  companyName?: string | null;
}

interface WalletState {
  /** 1 credit = 1 successful verification, so this is also the verifications left. */
  remainingCredits: number;
  totalCredits: number;
  usedCredits: number;
  walletStatus: string;
  status: string;
  provider?: string;
  environment?: string | null;
  isAvailable: boolean;
  unavailableCode: string | null;
  reason: string;
}

interface Stats {
  total: number;
  verified: number;
  failed: number;
  totalSpend: number;
}

const LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-ink-muted';

/**
 * The workspace's verification credits, as a modal.
 *
 * One credit = one successful verification. Every figure here is a QUOTA of API
 * verification requests, never money — no currency symbol appears anywhere in
 * this dialog, and the underlying API field names (`walletStatus`,
 * `remainingCredits`) are left untouched so no contract changes.
 *
 * Deliberately a modal and not a route: the only credit PAGE in this app
 * (`verification-credits`) is registered `platformOnly` / Super Admin, so for a
 * Company Head or HR this had nowhere legitimate to navigate — it went to
 * Settings, or opened a second tab. Opening a dialog in place removes the
 * navigation entirely, which is what stops the session being disturbed.
 *
 * Reads only endpoints the viewer is already entitled to, and never renders a
 * provider credential — the credits API does not return one.
 */
export const WalletModal: React.FC<Props> = ({ open, onClose, role, companyName }) => {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  /** True only while a re-read is in flight over already-rendered data. */
  const [refreshing, setRefreshing] = useState(false);

  // An employee has no wallet access at all — the dialog never opens for them.
  const allowed = role !== 'Employee';
  // Only Super Admin sees the platform-side gateway detail.
  const showProviderDetail = role === 'Super Admin';

  const load = useCallback(async () => {
    if (!allowed) return;
    setState((prev) => (prev === 'ready' ? prev : 'loading'));
    setRefreshing(true);
    try {
      const walletRes: any = await api.get('/api/verification-credits/wallet');
      const w: WalletState | null = walletRes?.data || null;
      if (!w || typeof w.remainingCredits !== 'number') {
        throw new Error('The verification credit total could not be read.');
      }
      setWallet(w);

      // History is best-effort: a wallet that loads must still render even if the
      // history call is refused for this role.
      try {
        const histRes: any = await api.bank.verifications({ limit: 5 });
        setStats(histRes?.data?.stats || null);
        setRecent(histRes?.data?.records || []);
      } catch {
        setStats(null);
        setRecent([]);
      }

      setError('');
      setState('ready');
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err?.message || 'Could not load your verification credits.');
      setState('error');
    } finally {
      setRefreshing(false);
    }
  }, [allowed]);

  // Load when opened, and stay live while open: a Super Admin allocating credits
  // in another session must show up here without a browser refresh.
  useEffect(() => {
    if (!open) return;
    load();
    const onWalletUpdate = (e: any) => {
      if (e.type === 'storage' && e.key !== 'hrms_wallet_updated') return;
      load();
    };
    window.addEventListener('hrms:wallet-updated', onWalletUpdate);
    window.addEventListener('storage', onWalletUpdate);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('hrms:wallet-updated', onWalletUpdate);
      window.removeEventListener('storage', onWalletUpdate);
      window.removeEventListener('focus', onFocus);
    };
  }, [open, load]);

  const used = wallet?.usedCredits ?? 0;
  const total = wallet?.totalCredits ?? 0;
  const remaining = wallet?.remainingCredits ?? 0;
  // Percentages are derived from the figures the server returned — never assumed.
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  const severity = !wallet
    ? 'slate'
    : remaining <= 0 || wallet.unavailableCode === 'INSUFFICIENT_CREDITS'
    ? 'red'
    : remaining <= 3
    ? 'amber'
    : 'green';

  const TONE = {
    green: { badge: 'green' as const, bar: 'bg-emerald-500', panel: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
    amber: { badge: 'warning' as const, bar: 'bg-amber-500', panel: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
    red: { badge: 'danger' as const, bar: 'bg-red-500', panel: 'bg-red-50 border-red-200', text: 'text-red-700' },
    slate: { badge: 'gray' as const, bar: 'bg-ink-muted', panel: 'bg-surface-muted border-hairline', text: 'text-ink-secondary' },
  }[severity];

  return (
    <Modal
      open={open && allowed}
      onClose={onClose}
      title="Verification Credits"
      subtitle={companyName || undefined}
      size="lg"
    >
      {state === 'loading' ? (
        <div className="py-12 text-center text-ink-secondary">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-brand-500" />
          <p className="text-[13px] font-medium">Loading verification credits…</p>
        </div>
      ) : state === 'error' ? (
        <div className="py-10 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-[13.5px] font-semibold text-ink">{error}</p>
          <p className="text-[12px] text-ink-secondary mt-1.5">No verification credits have been used.</p>
          <Button variant="primary" size="sm" className="mt-4" onClick={load} icon={<RefreshCw className="w-3.5 h-3.5" />}>
            Try again
          </Button>
        </div>
      ) : wallet ? (
        <div className="space-y-5">
          {/* Credits + progress. Never a currency — these are verification quota. */}
          <div className={`rounded-card border p-5 ${TONE.panel}`} title={CREDIT_TOOLTIP}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <span className={LABEL}>Available Verification Credits</span>
                <p className={`text-[32px] font-bold leading-none mt-1.5 font-heading tabular-nums ${TONE.text}`}>
                  {creditValue(remaining)}
                  <span className="text-[13px] font-semibold text-ink-muted ml-1.5 align-middle">
                    {creditUnit(remaining)}
                  </span>
                </p>
                <p className="text-[12px] font-medium text-ink-secondary mt-2">
                  {creditsMeaning(remaining)}
                </p>
              </div>
              <Badge variant={TONE.badge} dot>{wallet.walletStatus || wallet.status}</Badge>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-[11.5px] font-semibold text-ink-secondary mb-1.5">
                <span>{creditValue(used)} used</span>
                <span>{creditValue(remaining)} remaining</span>
              </div>
              <div
                className="w-full h-2 rounded-full bg-surface overflow-hidden"
                role="progressbar"
                aria-valuenow={usedPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Verification credits used"
              >
                <div className={`h-full ${TONE.bar} rounded-full transition-all duration-300`} style={{ width: `${usedPct}%` }} />
              </div>
              <p className="text-[11px] font-medium text-ink-muted mt-1.5">
                {usedPct}% of {creditValue(total)} total verification {creditUnit(total)} allocated used
              </p>
            </div>
          </div>

          {/* Figures */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-4" title={CREDIT_TOOLTIP}>
            <div><span className={LABEL}>Total Credits Allocated</span><p className="text-[14px] font-semibold text-ink mt-1 tabular-nums">{creditValue(total)}</p></div>
            <div><span className={LABEL}>Credits Used</span><p className="text-[14px] font-semibold text-ink mt-1 tabular-nums">{creditValue(used)}</p></div>
            <div><span className={LABEL}>Credits Remaining</span><p className="text-[14px] font-semibold text-ink mt-1 tabular-nums">{creditValue(remaining)}</p></div>
            <div><span className={LABEL}>Credit Status</span><p className="text-[14px] font-semibold text-ink mt-1">{wallet.walletStatus || wallet.status}</p></div>
            {stats && (
              <>
                <div>
                  <span className={LABEL}>Successful</span>
                  <p className="text-[14px] font-semibold text-emerald-700 mt-1 tabular-nums">{stats.verified}</p>
                </div>
                <div>
                  <span className={LABEL}>Failed</span>
                  <p className="text-[14px] font-semibold text-red-700 mt-1 tabular-nums">{stats.failed}</p>
                </div>
              </>
            )}
            <div>
              <span className={LABEL}>Last Verification</span>
              <p className="text-[14px] font-semibold text-ink mt-1">
                {recent[0]?.createdAt ? formatDateTime(recent[0].createdAt) : 'N/A'}
              </p>
            </div>
            {showProviderDetail && (
              <>
                <div><span className={LABEL}>Provider</span><p className="text-[14px] font-semibold text-ink mt-1">{wallet.provider || 'N/A'}</p></div>
                <div><span className={LABEL}>Environment</span><p className="text-[14px] font-semibold text-ink mt-1">{wallet.environment || 'N/A'}</p></div>
              </>
            )}
          </div>

          {!wallet.isAvailable && wallet.reason && (
            <p className="text-[12px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {wallet.reason}
            </p>
          )}

          {/* Recent verification history */}
          <div>
            <h4 className="text-[12px] font-bold text-ink font-heading tracking-tight mb-2.5">Recent Verifications</h4>
            {recent.length === 0 ? (
              <p className="text-[12.5px] font-medium text-ink-secondary bg-surface-muted border border-hairline rounded-xl px-3.5 py-3">
                No verifications have been run for this workspace yet.
              </p>
            ) : (
              <div className="rounded-xl border border-hairline overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left">
                    <thead>
                      <tr className="bg-surface-muted border-b border-hairline">
                        {['Date & Time', 'Employee', 'Module', 'Credits Used', 'Status', 'Reference ID'].map((h) => (
                          <th key={h} scope="col" className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-secondary whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((r) => (
                        <tr key={r.id} className="border-b border-hairline last:border-0">
                          <td className="px-3 py-2.5 text-[12px] font-medium text-ink-secondary whitespace-nowrap tabular-nums">
                            {r.createdAt ? formatDateTime(r.createdAt) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-[12px] font-semibold text-ink truncate max-w-[140px]">{r.employeeName || '—'}</td>
                          <td className="px-3 py-2.5 text-[12px] font-medium text-ink-secondary whitespace-nowrap">Bank Verification</td>
                          <td className="px-3 py-2.5 text-[12px] font-semibold text-ink tabular-nums" title={CREDIT_TOOLTIP}>
                            {r.verificationCost != null ? creditValue(r.verificationCost) : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={r.status === 'VERIFIED' ? 'green' : r.status === 'FAILED' || r.status === 'ERROR' ? 'danger' : 'warning'}>
                              {r.status === 'VERIFIED' ? 'Verified' : r.status === 'ERROR' ? 'Error' : r.status === 'FAILED' ? 'Failed' : r.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-[11.5px] font-mono font-medium text-ink-secondary whitespace-nowrap">{r.referenceId || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[11.5px] font-medium text-ink-muted inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Last updated {lastUpdated ? formatDateTime(lastUpdated.toISOString()) : '—'}
            </p>
            {/* `state` is narrowed to 'ready' in this branch, so the spinner is
                driven by its own flag rather than a comparison TS knows is false. */}
            <Button variant="outline" size="sm" onClick={load} icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />}>
              Refresh
            </Button>
          </div>

          {role === 'HR' && (
            <p className="text-[11.5px] font-medium text-ink-muted inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Read-only — contact your Company Head to add verification credits.
            </p>
          )}
        </div>
      ) : (
        <div className="py-10 text-center text-ink-secondary">
          <XCircle className="w-8 h-8 mx-auto mb-3 text-ink-muted" />
          <p className="text-[13px] font-medium">No verification credits are configured for this workspace.</p>
        </div>
      )}
    </Modal>
  );
};

export default WalletModal;
