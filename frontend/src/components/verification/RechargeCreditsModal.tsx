import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { load } from '@cashfreepayments/cashfree-js';
import {
  RefreshCw, Zap, ShieldCheck, AlertTriangle, CheckCircle2, FileDown, History, ArrowLeft, Clock,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { formatDateTime } from '@/utils/formatDate';
import { creditValue } from './creditTerminology';

interface Props {
  open: boolean;
  onClose: () => void;
  role?: string | null;
  /** Current wallet figures, shown in the dialog header. */
  wallet?: { remainingCredits: number; usedCredits: number; totalCredits: number } | null;
}

interface RechargeConfig {
  enabled: boolean;
  reason: string | null;
  currency: string;
  minRechargeAmount: number;
  maxRechargeAmount: number;
  gstEnabled: boolean;
  gstPercent: number;
  checkoutMode: 'sandbox' | 'production';
  canPurchase: boolean;
  packages: Array<{ id: number; name: string; description?: string | null; amount: number; credits: number; gstAmount: number; totalPayable: number }>;
}

interface Quote {
  baseAmount: number;
  credits: number;
  gstEnabled: boolean;
  gstPercent: number;
  gstAmount: number;
  totalPayable: number;
  currency: string;
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-ink-muted';

/** Tenant-facing status labels. Internal states render as customer language. */
const STATUS_VIEW: Record<string, { label: string; variant: any }> = {
  CREATED: { label: 'Payment Pending', variant: 'warning' },
  ACTIVE: { label: 'Payment Pending', variant: 'warning' },
  PAID: { label: 'Processing', variant: 'blue' },
  FAILED: { label: 'Failed', variant: 'danger' },
  EXPIRED: { label: 'Expired', variant: 'gray' },
  CANCELLED: { label: 'Cancelled', variant: 'gray' },
  USER_DROPPED: { label: 'Cancelled', variant: 'gray' },
  REFUNDED: { label: 'Refunded', variant: 'warning' },
  FLAGGED: { label: 'Under Review', variant: 'warning' },
};
const statusView = (order: any) => {
  if (order.settlementStatus === 'CREDITED') return { label: 'Credits Added', variant: 'green' as const };
  if (order.settlementStatus === 'AWAITING_APPROVAL') return { label: 'Awaiting Approval', variant: 'blue' as const };
  return STATUS_VIEW[order.status] || { label: order.status, variant: 'gray' as const };
};

const broadcastWalletUpdate = () => {
  window.dispatchEvent(new CustomEvent('hrms:wallet-updated'));
  try { localStorage.setItem('hrms_wallet_updated', Date.now().toString()); } catch { /* private mode */ }
};

/**
 * Self-service credit recharge.
 *
 * The customer sees ONLY "amount → credits": the per-credit price, provider
 * cost and margin are internal business settings and never reach this UI —
 * quotes for custom amounts are computed server-side. Payment runs in the
 * Cashfree modal (no redirect; this SPA has no URL router), and after the
 * modal closes the backend verifies the payment with Cashfree before a single
 * credit is added.
 */
export const RechargeCreditsModal: React.FC<Props> = ({ open, onClose, role, wallet }) => {
  const [view, setView] = useState<'form' | 'history' | 'success'>('form');
  const [config, setConfig] = useState<RechargeConfig | null>(null);
  const [configState, setConfigState] = useState<'loading' | 'ready' | 'error'>('loading');

  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const quoteSeq = useRef(0);

  const [paying, setPaying] = useState(false);
  const [payPhase, setPayPhase] = useState('');
  const [result, setResult] = useState<{ credits: number; newBalance: number | null; awaitingApproval: boolean } | null>(null);

  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [verifyingRow, setVerifyingRow] = useState<string | null>(null);

  const canPurchase = config?.canPurchase && role === 'Company Head';

  const loadConfig = useCallback(async () => {
    setConfigState('loading');
    try {
      const cfg = await api.recharge.config();
      setConfig(cfg);
      setConfigState('ready');
    } catch {
      setConfigState('error');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setView('form');
    setSelectedPackage(null);
    setCustomAmount('');
    setQuote(null);
    setQuoteError('');
    setResult(null);
    loadConfig();
  }, [open, loadConfig]);

  // Server-side quote for custom amounts, debounced. Package picks quote from
  // the config payload directly (already computed server-side).
  useEffect(() => {
    if (!open || selectedPackage !== null) return;
    const amount = Number(customAmount);
    if (!customAmount || !Number.isFinite(amount) || amount <= 0) {
      setQuote(null);
      setQuoteError('');
      return;
    }
    const seq = ++quoteSeq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await api.recharge.quote(amount);
        if (quoteSeq.current !== seq) return;
        setQuote(q);
        setQuoteError('');
      } catch (e: any) {
        if (quoteSeq.current !== seq) return;
        setQuote(null);
        setQuoteError(e?.message || 'Could not calculate this amount.');
      } finally {
        if (quoteSeq.current === seq) setQuoting(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [customAmount, selectedPackage, open]);

  const activeQuote: Quote | null = useMemo(() => {
    if (selectedPackage !== null && config) {
      const pkg = config.packages.find((p) => p.id === selectedPackage);
      if (!pkg) return null;
      return {
        baseAmount: pkg.amount,
        credits: pkg.credits,
        gstEnabled: config.gstEnabled,
        gstPercent: config.gstPercent,
        gstAmount: pkg.gstAmount,
        totalPayable: pkg.totalPayable,
        currency: config.currency,
      };
    }
    return quote;
  }, [selectedPackage, config, quote]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await api.recharge.history({ page: 1, pageSize: 25 });
      setHistory(res?.orders || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && view === 'history') loadHistory();
  }, [open, view, loadHistory]);

  const handleVerify = useCallback(async (orderId: string, silent = false) => {
    setVerifyingRow(orderId);
    try {
      const res = await api.recharge.verifyOrder(orderId);
      if (res.outcome === 'CREDITED' || res.outcome === 'ALREADY_SETTLED') {
        broadcastWalletUpdate();
        if (!silent) ui.toast.success('Payment confirmed — the credits have been added to your wallet.');
      } else if (res.outcome === 'AWAITING_APPROVAL') {
        if (!silent) ui.toast.info('Payment received. The credits will be added once the recharge is approved.');
      } else if (!silent) {
        ui.toast.warning('This payment is not confirmed as successful yet.');
      }
      return res;
    } catch (e: any) {
      if (!silent) ui.toast.error(e?.message || 'Could not verify the payment right now.');
      return null;
    } finally {
      setVerifyingRow(null);
    }
  }, []);

  const handlePay = useCallback(async () => {
    if (!activeQuote || paying) return;
    setPaying(true);
    setPayPhase('Creating your secure payment…');
    try {
      const created = await api.recharge.createOrder(
        selectedPackage !== null ? { packageId: selectedPackage } : { amount: Number(customAmount) }
      );
      const { paymentSessionId, checkoutMode, order } = created;
      if (!paymentSessionId) throw new Error('The payment session could not be created.');

      setPayPhase('Opening the payment window…');
      const cashfree = await load({ mode: checkoutMode });
      await cashfree.checkout({ paymentSessionId, redirectTarget: '_modal' });

      // The modal resolving means the user finished or closed it — the ONLY
      // authority on the outcome is our backend's verification with Cashfree.
      setPayPhase('Confirming your payment…');
      const verifyRes = await api.recharge.verifyOrder(order.orderId);
      if (verifyRes.outcome === 'CREDITED' || verifyRes.outcome === 'ALREADY_SETTLED') {
        broadcastWalletUpdate();
        setResult({
          credits: order.creditsPurchased,
          newBalance: verifyRes.wallet?.remainingCredits ?? null,
          awaitingApproval: false,
        });
        setView('success');
      } else if (verifyRes.outcome === 'AWAITING_APPROVAL') {
        setResult({ credits: order.creditsPurchased, newBalance: null, awaitingApproval: true });
        setView('success');
      } else if (verifyRes.outcome === 'PENDING') {
        ui.toast.warning('The payment was not completed. You can retry from Recharge History if you were charged.');
        setView('history');
      } else {
        ui.toast.error('The payment did not go through. No amount will be captured for this attempt.');
      }
    } catch (e: any) {
      ui.toast.error(e?.message || 'The payment could not be started. Please try again.');
    } finally {
      setPaying(false);
      setPayPhase('');
    }
  }, [activeQuote, paying, selectedPackage, customAmount]);

  const downloadInvoice = useCallback(async (inv: { id: number; invoiceNo: string }) => {
    try {
      const blob = await api.recharge.downloadInvoice(inv.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv.invoiceNo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not download the invoice.');
    }
  }, []);

  const remaining = wallet?.remainingCredits ?? null;

  return (
    <Modal
      open={open}
      onClose={paying ? () => {} : onClose}
      title="Recharge Verification Credits"
      subtitle={view === 'history' ? 'Recharge history & invoices' : 'Buy additional verification credits online'}
      size="lg"
    >
      {configState === 'loading' ? (
        <div className="py-12 text-center text-ink-secondary">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-brand-500" />
          <p className="text-[13px] font-medium">Loading recharge options…</p>
        </div>
      ) : configState === 'error' ? (
        <div className="py-10 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-[13.5px] font-semibold text-ink">Could not load the recharge options.</p>
          <Button variant="primary" size="sm" className="mt-4" onClick={loadConfig} icon={<RefreshCw className="w-3.5 h-3.5" />}>Try again</Button>
        </div>
      ) : view === 'success' && result ? (
        <div className="py-8 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
          {result.awaitingApproval ? (
            <>
              <p className="text-[16px] font-bold text-ink font-heading">Payment received</p>
              <p className="text-[13px] font-medium text-ink-secondary max-w-md mx-auto">
                Your payment was successful. {creditValue(result.credits)} verification credits will be added to your
                wallet as soon as the recharge is approved — you will be notified.
              </p>
            </>
          ) : (
            <>
              <p className="text-[16px] font-bold text-ink font-heading">
                {creditValue(result.credits)} verification credits added
              </p>
              {result.newBalance !== null && (
                <p className="text-[13px] font-medium text-ink-secondary">
                  Your wallet now has <span className="font-bold text-emerald-700">{creditValue(result.newBalance)}</span> verification credits available.
                </p>
              )}
            </>
          )}
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setView('history')} icon={<History className="w-3.5 h-3.5" />}>View History & Invoice</Button>
            <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : view === 'history' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={() => setView('form')} icon={<ArrowLeft className="w-3.5 h-3.5" />}>Back to Recharge</Button>
            <Button variant="outline" size="sm" onClick={loadHistory} icon={<RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />}>Refresh</Button>
          </div>
          {historyLoading && history.length === 0 ? (
            <div className="py-10 text-center text-ink-secondary">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-500" />
              <p className="text-[12.5px] font-medium">Loading recharge history…</p>
            </div>
          ) : history.length === 0 ? (
            <p className="text-[12.5px] font-medium text-ink-secondary bg-surface-muted border border-hairline rounded-xl px-3.5 py-3">
              No online recharges yet. Your first recharge will appear here with its invoice.
            </p>
          ) : (
            <div className="rounded-xl border border-hairline overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="bg-surface-muted border-b border-hairline">
                      {['Date', 'Amount Paid', 'Credits', 'Status', 'Order ID', 'Invoice', ''].map((h, i) => (
                        <th key={i} scope="col" className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-secondary whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((o) => {
                      const sv = statusView(o);
                      const pending = o.settlementStatus !== 'CREDITED' && ['CREATED', 'ACTIVE', 'PAID'].includes(o.status);
                      return (
                        <tr key={o.orderId} className="border-b border-hairline last:border-0">
                          <td className="px-3 py-2.5 text-[12px] font-medium text-ink-secondary whitespace-nowrap tabular-nums">{formatDateTime(o.createdAt)}</td>
                          <td className="px-3 py-2.5 text-[12px] font-semibold text-ink tabular-nums">{inr(o.totalAmount)}</td>
                          <td className="px-3 py-2.5 text-[12px] font-semibold text-ink tabular-nums">{creditValue(o.creditsPurchased)}</td>
                          <td className="px-3 py-2.5"><Badge variant={sv.variant}>{sv.label}</Badge></td>
                          <td className="px-3 py-2.5 text-[11.5px] font-mono font-medium text-ink-secondary whitespace-nowrap">{o.orderId}</td>
                          <td className="px-3 py-2.5">
                            {o.invoice ? (
                              <button
                                type="button"
                                onClick={() => downloadInvoice(o.invoice)}
                                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700"
                              >
                                <FileDown className="w-3.5 h-3.5" /> {o.invoice.invoiceNo}
                              </button>
                            ) : (
                              <span className="text-[11.5px] font-medium text-ink-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {pending && canPurchase && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => { await handleVerify(o.orderId); loadHistory(); }}
                                icon={<RefreshCw className={`w-3.5 h-3.5 ${verifyingRow === o.orderId ? 'animate-spin' : ''}`} />}
                              >
                                Verify now
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Wallet snapshot */}
          {wallet && (
            <div className="grid grid-cols-3 gap-x-5 rounded-card border border-hairline bg-surface-muted p-4">
              <div><span className={LABEL}>Available Credits</span><p className="text-[18px] font-bold text-ink mt-1 tabular-nums">{creditValue(wallet.remainingCredits)}</p></div>
              <div><span className={LABEL}>Credits Used</span><p className="text-[18px] font-bold text-ink mt-1 tabular-nums">{creditValue(wallet.usedCredits)}</p></div>
              <div><span className={LABEL}>Total Allocated</span><p className="text-[18px] font-bold text-ink mt-1 tabular-nums">{creditValue(wallet.totalCredits)}</p></div>
            </div>
          )}

          {!config?.enabled ? (
            <div className="py-8 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
              <p className="text-[13.5px] font-semibold text-ink">Online recharge is not available right now.</p>
              <p className="text-[12px] font-medium text-ink-secondary mt-1.5">
                Please contact support to add verification credits to your account.
              </p>
            </div>
          ) : !canPurchase ? (
            <p className="text-[12.5px] font-medium text-ink-secondary bg-surface-muted border border-hairline rounded-xl px-3.5 py-3 inline-flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-px" />
              Only your Company Head can purchase verification credits. You can view the recharge history below.
            </p>
          ) : (
            <>
              {/* Packages */}
              <div>
                <span className={LABEL}>Choose a recharge</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-2">
                  {config.packages.map((p) => {
                    const active = selectedPackage === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedPackage(active ? null : p.id); setCustomAmount(''); setQuote(null); setQuoteError(''); }}
                        className={`rounded-xl border p-3 text-left transition-colors ${active ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-hairline bg-surface hover:border-brand-300'}`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{p.name}</p>
                        <p className="text-[16px] font-bold text-ink mt-0.5 tabular-nums">{inr(p.amount)}</p>
                        <p className="text-[11.5px] font-semibold text-emerald-700 mt-0.5 tabular-nums">{creditValue(p.credits)} credits</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom amount */}
              <div>
                <span className={LABEL}>Or enter a custom amount</span>
                <div className="mt-2 flex items-center gap-2">
                  <div className="relative flex-1 max-w-[220px]">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-muted">₹</span>
                    <input
                      type="number"
                      min={config.minRechargeAmount}
                      max={config.maxRechargeAmount || undefined}
                      value={customAmount}
                      onChange={(e) => { setCustomAmount(e.target.value); setSelectedPackage(null); }}
                      placeholder={String(config.minRechargeAmount)}
                      className="w-full rounded-xl border border-hairline bg-surface pl-7 pr-3 py-2 text-[13px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <p className="text-[11.5px] font-medium text-ink-muted">
                    Min {inr(config.minRechargeAmount)}{config.maxRechargeAmount ? ` · Max ${inr(config.maxRechargeAmount)}` : ''}
                  </p>
                </div>
                {quoteError && <p className="text-[11.5px] font-semibold text-red-600 mt-1.5">{quoteError}</p>}
              </div>

              {/* Live calculation — amount → credits, nothing else */}
              {(activeQuote || quoting) && (
                <div className="rounded-card border border-emerald-200 bg-emerald-50 p-4">
                  {quoting && !activeQuote ? (
                    <p className="text-[12.5px] font-medium text-ink-secondary inline-flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Calculating…
                    </p>
                  ) : activeQuote && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className={LABEL}>You will receive</span>
                        <p className="text-[24px] font-bold text-emerald-700 leading-tight tabular-nums">
                          {creditValue(activeQuote.credits)} <span className="text-[13px] font-semibold">verification credits</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[12px] font-medium text-ink-secondary tabular-nums">Recharge amount: {inr(activeQuote.baseAmount)}</p>
                        {activeQuote.gstEnabled && activeQuote.gstAmount > 0 && (
                          <p className="text-[12px] font-medium text-ink-secondary tabular-nums">GST @ {activeQuote.gstPercent}%: {inr(activeQuote.gstAmount)}</p>
                        )}
                        <p className="text-[14px] font-bold text-ink tabular-nums mt-0.5">Total payable: {inr(activeQuote.totalPayable)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <Button variant="outline" size="sm" onClick={() => setView('history')} icon={<History className="w-3.5 h-3.5" />}>
                  Recharge History
                </Button>
                <Button
                  variant="primary"
                  onClick={handlePay}
                  disabled={!activeQuote || paying}
                  icon={paying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                >
                  {paying ? (payPhase || 'Processing…') : activeQuote ? `Pay ${inr(activeQuote.totalPayable)} Securely` : 'Select an amount'}
                </Button>
              </div>
              <p className="text-[11px] font-medium text-ink-muted inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Payments are processed securely by Cashfree. Credits are added only after the payment is verified.
              </p>
              {paying && (
                <p className="text-[11.5px] font-medium text-ink-secondary inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Keep this window open until the payment completes.
                </p>
              )}
            </>
          )}
          {/* HR / viewers with no purchase rights still get history access */}
          {config?.enabled && !canPurchase && (
            <div>
              <Button variant="outline" size="sm" onClick={() => setView('history')} icon={<History className="w-3.5 h-3.5" />}>
                View Recharge History
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default RechargeCreditsModal;
