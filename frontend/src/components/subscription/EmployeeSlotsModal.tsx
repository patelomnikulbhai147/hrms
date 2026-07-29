import React, { useCallback, useEffect, useState } from 'react';
import { load } from '@cashfreepayments/cashfree-js';
import {
  RefreshCw, Zap, ShieldCheck, AlertTriangle, CheckCircle2, History, Lock,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';

interface Props {
  open: boolean;
  onClose: () => void;
  role?: string | null;
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-ink-muted';

const broadcastLimitUpdate = () => {
  window.dispatchEvent(new CustomEvent('hrms:slots-updated'));
  try { localStorage.setItem('hrms_wallet_updated', Date.now().toString()); } catch { /* private mode */ }
};

/**
 * Employee slot purchase dialog — one overview strip, one slot selector, one
 * pricing summary. Slots are sold in multiples of 5 (minimum 5) and there is
 * NO minimum payment amount: 5 slots at the current rate pays immediately.
 * (A ₹-minimum exists only in the Verification Credit Recharge module.)
 * Billing cycle and pricing are inherited from the active subscription —
 * the client only ever sends a slot count; the server computes everything.
 * The limit itself is only ever raised server-side by a verified payment or a
 * Super Admin. Purchase HISTORY lives on the dedicated Employee Slot History
 * page (hrms:view-slot-history navigates there).
 */
export const EmployeeSlotsModal: React.FC<Props> = ({ open, onClose, role }) => {
  const [view, setView] = useState<'main' | 'success'>('main');
  const [data, setData] = useState<any | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [slotsInput, setSlotsInput] = useState('');
  const [quote, setQuote] = useState<any | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const quoteSeq = React.useRef(0);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<{ slots: number; newLimit: number | null } | null>(null);

  const canPurchase = data?.canPurchase && role === 'Company Head';

  // Full-page slot history (the App closes this dialog and navigates).
  const goHistory = () => window.dispatchEvent(new CustomEvent('hrms:view-slot-history'));

  const loadData = useCallback(async () => {
    setState((s) => (s === 'ready' ? s : 'loading'));
    try {
      setData(await api.employeeSlots.overview());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setView('main');
    setSlotsInput('');
    setQuote(null);
    setQuoteError('');
    setResult(null);
    loadData();
  }, [open, loadData]);

  // Live server-side quote for the entered slot count (debounced). The client
  // sends only the number of slots — tier, rate and GST all come back computed.
  useEffect(() => {
    if (!open) return;
    const n = Number(slotsInput);
    if (!slotsInput || !Number.isFinite(n) || n <= 0) {
      setQuote(null);
      setQuoteError('');
      return;
    }
    const seq = ++quoteSeq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await api.employeeSlots.quote(n);
        if (quoteSeq.current !== seq) return;
        setQuote(q);
        setQuoteError('');
      } catch (e: any) {
        if (quoteSeq.current !== seq) return;
        setQuote(null);
        setQuoteError(e?.message || 'Could not price this slot count.');
      } finally {
        if (quoteSeq.current === seq) setQuoting(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [slotsInput, open]);

  const handleBuy = useCallback(async () => {
    if (!quote?.ok || paying) return;
    setPaying(true);
    try {
      const created = await api.employeeSlots.createOrder({ slots: quote.slots });
      const cashfree = await load({ mode: created.checkoutMode });
      await cashfree.checkout({ paymentSessionId: created.paymentSessionId, redirectTarget: '_modal' });
      const verify = await api.employeeSlots.verifyOrder(created.order.orderId);
      if (verify.outcome === 'CREDITED' || verify.outcome === 'ALREADY_SETTLED') {
        broadcastLimitUpdate();
        setResult({ slots: created.order.creditsPurchased, newLimit: verify.capacity?.limit ?? null });
        setView('success');
        loadData();
      } else if (verify.outcome === 'PENDING') {
        ui.toast.warning('The payment was not completed. Check the Employee Slot History page if you were charged.');
        goHistory();
      } else {
        ui.toast.error('The payment did not go through. No slots were added.');
      }
    } catch (e: any) {
      ui.toast.error(e?.message || 'The purchase could not be started.');
    } finally {
      setPaying(false);
    }
  }, [quote, paying, loadData]);

  const cap = data?.capacity;
  const full = cap && !cap.unlimited && cap.remaining <= 0;
  // Billing cycle & plan are inherited from the active subscription (server-side);
  // this dialog only displays them and never lets the user pick a cycle.
  const sub = data?.subscription;
  const subInactive = !!sub && sub.active === false;

  return (
    <Modal
      open={open}
      onClose={paying ? () => {} : onClose}
      title="Employee Slots"
      subtitle="Purchase additional employee slots"
      size="lg"
    >
      {state === 'loading' ? (
        <div className="py-12 text-center text-ink-secondary">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-brand-500" />
          <p className="text-[13px] font-medium">Loading employee slot information…</p>
        </div>
      ) : state === 'error' ? (
        <div className="py-10 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-[13.5px] font-semibold text-ink">Could not load employee slot information.</p>
          <Button variant="primary" size="sm" className="mt-4" onClick={loadData} icon={<RefreshCw className="w-3.5 h-3.5" />}>Try again</Button>
        </div>
      ) : view === 'success' && result ? (
        <div className="py-8 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
          <p className="text-[16px] font-bold text-ink font-heading">{result.slots} employee slots added</p>
          {result.newLimit !== null && (
            <p className="text-[13px] font-medium text-ink-secondary">
              Your employee limit is now <span className="font-bold text-emerald-700">{result.newLimit}</span>.
            </p>
          )}
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={goHistory} icon={<History className="w-3.5 h-3.5" />}>View History & Invoice</Button>
            <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Overview — current plan, cycle and capacity in ONE strip. */}
          <div className={`rounded-card border p-4 ${full ? 'bg-red-50 border-red-200' : 'bg-surface-muted border-hairline'}`}>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-3">
              <div>
                <span className={LABEL}>Current Plan</span>
                <p className="text-[13.5px] font-bold text-ink mt-0.5">{sub?.plan || cap?.plan || '—'}</p>
              </div>
              <div>
                <span className={LABEL}>Billing Cycle</span>
                <p className="text-[13.5px] font-bold text-ink mt-0.5 inline-flex items-center gap-1">
                  {sub?.billingCycle || '—'}
                  <Lock className="w-3 h-3 text-ink-muted" aria-label="Inherited from your subscription" />
                </p>
              </div>
              <div>
                <span className={LABEL}>Employee Limit</span>
                <p className="text-[13.5px] font-bold text-ink mt-0.5 tabular-nums">{cap?.unlimited ? '∞' : cap?.limit ?? '—'}</p>
              </div>
              <div>
                <span className={LABEL}>Active Employees</span>
                <p className="text-[13.5px] font-bold text-ink mt-0.5 tabular-nums">{cap?.current ?? '—'}</p>
              </div>
              <div>
                <span className={LABEL}>Available Slots</span>
                <p className={`text-[13.5px] font-bold mt-0.5 tabular-nums ${full ? 'text-red-700' : 'text-emerald-700'}`}>
                  {cap?.unlimited ? '∞' : cap?.remaining ?? '—'}
                </p>
              </div>
            </div>
            {full && (
              <p className="text-[12px] font-semibold text-red-700 mt-2.5">
                You have reached your employee limit. Please purchase additional employee slots or contact our sales team.
              </p>
            )}
          </div>

          {subInactive ? (
            /* No active subscription → purchasing is hidden entirely. */
            <div className="rounded-card border border-red-200 bg-red-50 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] font-bold text-red-800">
                {data?.subscriptionExpiredMessage || 'Your subscription has expired. Please renew your subscription before purchasing additional employee slots.'}
              </p>
            </div>
          ) : canPurchase ? (
            <>
              {/* Slot selection — quick buttons + custom multiple-of-5 input. */}
              <div>
                <span className={LABEL}>How many slots do you need?</span>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {(data?.quickOptions?.length ? data.quickOptions.map((o: any) => o.slots) : [5, 10, 15, 20]).map((n: number) => {
                    const active = Number(slotsInput) === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSlotsInput(String(n))}
                        className={`rounded-xl border px-4 py-2 text-[13px] font-bold transition-colors ${active ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500' : 'border-hairline bg-surface text-ink hover:border-brand-300'}`}
                      >
                        +{n}
                      </button>
                    );
                  })}
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={data?.minSlots || 5}
                      step={data?.slotStep || 5}
                      value={slotsInput}
                      onChange={(e) => setSlotsInput(e.target.value)}
                      placeholder="Custom"
                      className="w-28 rounded-xl border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <span className="text-[11.5px] font-medium text-ink-muted">multiples of {data?.slotStep || 5}, min {data?.minSlots || 5}</span>
                  </div>
                </div>
                {quoteError && <p className="text-[11.5px] font-semibold text-red-600 mt-1.5">{quoteError}</p>}
              </div>

              {/* Pricing summary — ONE block: slots · rate · totals · new limit. */}
              {(quoting || quote?.ok) && (
                <div className="rounded-card border border-hairline bg-surface-muted p-4">
                  {quoting && !quote ? (
                    <p className="text-[12.5px] font-medium text-ink-secondary inline-flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Calculating…
                    </p>
                  ) : quote?.ok && (
                    <div className="space-y-3">
                      <div className="text-[12.5px] font-medium text-ink-secondary space-y-1.5 tabular-nums">
                        <div className="flex justify-between">
                          <span>Selected Slots</span><span className="font-bold text-ink">+{quote.slots}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rate per Slot <span className="text-ink-muted">({quote.tier.label} · {quote.subscription?.billingCycle || quote.tier.cycle})</span></span>
                          <span className="font-semibold text-ink">{inr(quote.tier.rate)}</span>
                        </div>
                        <div className="flex justify-between border-t border-hairline pt-1.5">
                          <span>Subtotal ({quote.slots} × {inr(quote.tier.rate)})</span><span>{inr(quote.subtotal)}</span>
                        </div>
                        {quote.gst.enabled && quote.gst.type === 'CGST_SGST' && (
                          <>
                            <div className="flex justify-between"><span>CGST @ {quote.gst.percent / 2}%</span><span>{inr(quote.gst.cgst)}</span></div>
                            <div className="flex justify-between"><span>SGST @ {quote.gst.percent / 2}%</span><span>{inr(quote.gst.sgst)}</span></div>
                          </>
                        )}
                        {quote.gst.enabled && quote.gst.type === 'IGST' && (
                          <div className="flex justify-between"><span>IGST @ {quote.gst.percent}%</span><span>{inr(quote.gst.igst)}</span></div>
                        )}
                        <div className="flex justify-between border-t border-hairline pt-1.5 text-[14px] font-bold text-ink">
                          <span>Grand Total</span><span>{inr(quote.grandTotal)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-700 font-semibold">
                          <span>New Employee Limit</span><span>{quote.currentLimit} → {quote.newLimit}</span>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          variant="primary"
                          onClick={handleBuy}
                          disabled={paying}
                          icon={paying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        >
                          {paying ? 'Processing…' : `Pay ${inr(quote.grandTotal)} Securely`}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-[12.5px] font-medium text-ink-secondary bg-surface-muted border border-hairline rounded-xl px-3.5 py-3 inline-flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-px" />
              Only your Company Head can purchase additional employee slots.
            </p>
          )}

          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" size="sm" onClick={goHistory} icon={<History className="w-3.5 h-3.5" />}>View Slot History</Button>
            <p className="text-[11px] font-medium text-ink-muted inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Slots are added only after the payment is verified.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default EmployeeSlotsModal;
