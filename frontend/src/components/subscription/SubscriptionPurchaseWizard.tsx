import React, { useCallback, useEffect, useState } from 'react';
import { load } from '@cashfreepayments/cashfree-js';
import {
  RefreshCw, Zap, ShieldCheck, AlertTriangle, CheckCircle2, ArrowLeft, ArrowRight,
  Users, CalendarDays,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { formatDate } from '@/utils/formatDate';

interface Props {
  open: boolean;
  onClose: () => void;
  role?: string | null;
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-ink-muted';

const STEPS = ['Current Plan', 'Choose Plan', 'Billing Cycle', 'Employees', 'Summary & Pay'];

const CHANGE_LABEL: Record<string, string> = {
  NEW: 'New Subscription',
  UPGRADE: 'Upgrade',
  DOWNGRADE: 'Plan Change',
  RENEWAL: 'Renewal',
  CYCLE_CHANGE: 'Billing Cycle Change',
};

/** Broadcast that the plan changed so every surface refreshes without logout. */
const broadcastPlanUpdate = () => {
  window.dispatchEvent(new CustomEvent('hrms:plan-updated'));
  window.dispatchEvent(new CustomEvent('hrms:slots-updated'));
  window.dispatchEvent(new CustomEvent('hrms:wallet-updated'));
  try { localStorage.setItem('hrms_wallet_updated', Date.now().toString()); } catch { /* private mode */ }
};

/**
 * The complete subscription purchase wizard: current plan → plan selection →
 * billing cycle → employee count → server-priced summary → Cashfree checkout.
 * Every number on screen comes from the server; this dialog never decides a
 * plan, price, discount, GST amount or limit.
 */
export const SubscriptionPurchaseWizard: React.FC<Props> = ({ open, onClose, role }) => {
  const [step, setStep] = useState(0);
  const [ctx, setCtx] = useState<any | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [planKey, setPlanKey] = useState<string>('');
  const [cycle, setCycle] = useState<string>('Quarterly');
  const [seatsInput, setSeatsInput] = useState('');
  const [quote, setQuote] = useState<any | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const quoteSeq = React.useRef(0);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState<any | null>(null);

  const canPurchase = ctx?.canPurchase && role === 'Company Head';

  const loadContext = useCallback(async () => {
    setState((s) => (s === 'ready' ? s : 'loading'));
    try {
      const c = await api.subscriptionPurchase.context();
      setCtx(c);
      setState('ready');
      setCycle(c?.current?.billingCycle || 'Quarterly');
      setSeatsInput(String(Math.max(Number(c?.minEmployees) || 1, 1)));
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setPlanKey('');
    setQuote(null);
    setQuoteError('');
    setSuccess(null);
    loadContext();
  }, [open, loadContext]);

  // Server quote whenever the selection is complete (debounced).
  useEffect(() => {
    if (!open || !planKey || step < 3) return;
    const seats = Number(seatsInput);
    if (!Number.isFinite(seats) || seats < 1) {
      setQuote(null);
      setQuoteError('');
      return;
    }
    const seq = ++quoteSeq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await api.subscriptionPurchase.quote({ planKey, billingCycle: cycle, employeeCount: seats });
        if (quoteSeq.current !== seq) return;
        setQuote(q);
        setQuoteError('');
      } catch (e: any) {
        if (quoteSeq.current !== seq) return;
        setQuote(null);
        setQuoteError(e?.message || 'Could not price this configuration.');
      } finally {
        if (quoteSeq.current === seq) setQuoting(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [open, planKey, cycle, seatsInput, step]);

  const handlePay = useCallback(async () => {
    if (!quote?.ok || paying) return;
    setPaying(true);
    try {
      const created = await api.subscriptionPurchase.createOrder({
        planKey, billingCycle: cycle, employeeCount: quote.employeeCount,
      });
      const cashfree = await load({ mode: created.checkoutMode });
      await cashfree.checkout({ paymentSessionId: created.paymentSessionId, redirectTarget: '_modal' });
      const verify = await api.subscriptionPurchase.verifyOrder(created.order.orderId);
      if (verify.outcome === 'CREDITED' || verify.outcome === 'ALREADY_SETTLED') {
        broadcastPlanUpdate();
        setSuccess({ quote, current: verify.current });
      } else if (verify.outcome === 'PENDING') {
        ui.toast.warning('The payment was not completed. If you were charged, the upgrade will be applied automatically shortly.');
      } else {
        ui.toast.error('The payment did not go through. Your subscription was not changed.');
      }
    } catch (e: any) {
      ui.toast.error(e?.message || 'The purchase could not be started.');
    } finally {
      setPaying(false);
    }
  }, [quote, paying, planKey, cycle]);

  const cur = ctx?.current;
  const selectedPlan = (ctx?.plans || []).find((p: any) => p.key === planKey);
  const minSeats = Math.max(Number(ctx?.minEmployees) || 1, 1);

  const canContinue = () => {
    if (step === 1) return !!selectedPlan?.purchasable;
    if (step === 2) return cycle === 'Quarterly' || cycle === 'Yearly';
    if (step === 3) {
      const n = Number(seatsInput);
      return Number.isInteger(n) && n >= minSeats;
    }
    return true;
  };

  return (
    <Modal
      open={open}
      onClose={paying ? () => {} : onClose}
      title="Upgrade Subscription"
      subtitle={success ? 'Purchase complete' : STEPS[step]}
      size="xl"
    >
      {state === 'loading' ? (
        <div className="py-12 text-center text-ink-secondary">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-brand-500" />
          <p className="text-[13px] font-medium">Loading subscription information…</p>
        </div>
      ) : state === 'error' ? (
        <div className="py-10 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-[13.5px] font-semibold text-ink">Could not load subscription information.</p>
          <Button variant="primary" size="sm" className="mt-4" onClick={loadContext} icon={<RefreshCw className="w-3.5 h-3.5" />}>Try again</Button>
        </div>
      ) : success ? (
        <div className="py-8 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
          <p className="text-[16px] font-bold text-ink font-heading">
            {success.quote.plan.name} ({success.quote.billingCycle}) is now active
          </p>
          <div className="text-[13px] font-medium text-ink-secondary space-y-1">
            <p>Employee limit: <span className="font-bold text-ink">{success.current?.employeeLimit ?? success.quote.newEmployeeLimit ?? '∞'}</span></p>
            <p>Renewal date: <span className="font-bold text-ink">{success.current?.renewalDate ? formatDate(success.current.renewalDate) : formatDate(success.quote.renewalDate)}</span></p>
            {success.quote.includedVerificationCredits > 0 && (
              <p>{success.quote.includedVerificationCredits} verification credits have been added to your wallet.</p>
            )}
          </div>
          <p className="text-[12.5px] font-medium text-emerald-700">
            All plan features are unlocked immediately — no logout required.
          </p>
          <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Step rail */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && <span className="w-4 h-px bg-hairline" />}
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => i < step && setStep(i)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                    i === step ? 'bg-brand-600 text-white'
                    : i < step ? 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                    : 'bg-surface-muted text-ink-muted'
                  }`}
                >
                  {i + 1}. {s}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* ── STEP 1 · Current subscription ─────────────────────────────── */}
          {step === 0 && cur && (
            <div className="space-y-4">
              <div className="rounded-card border border-hairline bg-surface-muted p-5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
                <div><span className={LABEL}>Current Plan</span><p className="text-[15px] font-bold text-ink mt-0.5">{cur.plan}</p></div>
                <div><span className={LABEL}>Billing Cycle</span><p className="text-[15px] font-bold text-ink mt-0.5">{cur.billingCycle}</p></div>
                <div><span className={LABEL}>Renewal Date</span><p className="text-[15px] font-bold text-ink mt-0.5">{cur.renewalDate ? formatDate(cur.renewalDate) : '—'}</p></div>
                <div><span className={LABEL}>Status</span><p className="mt-0.5"><Badge variant={cur.active ? 'green' : 'danger'} dot>{cur.active ? 'Active' : cur.status}</Badge></p></div>
                <div><span className={LABEL}>Employee Limit</span><p className="text-[15px] font-bold text-ink mt-0.5 tabular-nums">{cur.unlimited ? '∞' : cur.employeeLimit}</p></div>
                <div><span className={LABEL}>Employees Used</span><p className="text-[15px] font-bold text-ink mt-0.5 tabular-nums">{cur.employeesUsed}</p></div>
                <div><span className={LABEL}>Extra Slots</span><p className="text-[15px] font-bold text-ink mt-0.5 tabular-nums">{cur.extraSlots}</p></div>
                <div><span className={LABEL}>Verification Credits</span><p className="text-[15px] font-bold text-ink mt-0.5 tabular-nums">{cur.verificationCredits}</p></div>
              </div>
              <div>
                <span className={LABEL}>Current Features</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(cur.enabledModules || []).length === 0
                    ? <p className="text-[12px] font-medium text-ink-secondary">Core HR features only — premium modules are locked on your plan.</p>
                    : cur.enabledModules.map((m: string) => <Badge key={m} variant="blue">{m}</Badge>)}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2 · Plan selection ───────────────────────────────────── */}
          {step === 1 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(ctx?.plans || []).map((p: any) => {
                const active = planKey === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    disabled={!p.purchasable}
                    onClick={() => setPlanKey(p.key)}
                    className={`text-left rounded-card border p-4 transition-all relative ${
                      active ? 'border-brand-500 ring-2 ring-brand-500 bg-brand-50/40'
                      : p.purchasable ? 'border-hairline bg-surface hover:border-brand-300'
                      : 'border-hairline bg-surface-muted opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[14px] font-bold text-ink">{p.name}</p>
                      {p.isCurrent ? <Badge variant="gray">Current Plan</Badge>
                        : p.isPopular ? <Badge variant="purple">Most Popular</Badge>
                        : p.isUpgrade ? <Badge variant="blue">Upgrade</Badge> : null}
                    </div>
                    <p className="text-[11.5px] font-medium text-ink-secondary mb-2 line-clamp-2">{p.description}</p>
                    <p className="text-[16px] font-bold text-ink tabular-nums">
                      {p.pricing.quarterly > 0 ? `${inr(p.pricing.quarterly)}` : 'Free'}
                      {p.pricing.quarterly > 0 && <span className="text-[11px] font-semibold text-ink-muted"> /employee · quarterly</span>}
                    </p>
                    {p.pricing.quarterly > 0 && (
                      <p className="text-[11.5px] font-semibold text-emerald-700 tabular-nums">
                        {inr(p.pricing.yearly)} /employee · yearly
                        {p.pricing.yearlySavingsPercent > 0 && ` (save ${p.pricing.yearlySavingsPercent}%)`}
                      </p>
                    )}
                    <ul className="mt-2.5 space-y-1 text-[11.5px] font-medium text-ink-secondary">
                      <li>• {p.employeeLimit === -1 ? 'Unlimited employees' : `Up to ${p.employeeLimit} employees`}</li>
                      <li>• {p.includedVerificationCredits > 0 ? `${p.includedVerificationCredits} verification credits included` : 'No included credits'}</li>
                      <li>• {p.moduleCount > 0 ? `All ${p.moduleCount} premium modules` : 'Core modules only'}</li>
                      <li>• {p.storageMB === -1 ? 'Unlimited storage' : `${Math.round(p.storageMB / 1024)} GB storage`}</li>
                      <li>• {p.apiCalls === -1 ? 'Unlimited API access' : `${p.apiCalls} API calls`}</li>
                      <li>• {p.supportLevel} support</li>
                    </ul>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── STEP 3 · Billing cycle ────────────────────────────────────── */}
          {step === 2 && selectedPlan && (
            <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
              {[
                { key: 'Quarterly', rate: selectedPlan.pricing.quarterly, note: 'Billed every 3 months' },
                { key: 'Yearly', rate: selectedPlan.pricing.yearly, note: `Billed every 12 months${selectedPlan.pricing.yearlySavingsPercent > 0 ? ` · Save ${selectedPlan.pricing.yearlySavingsPercent}%` : ''}` },
              ].map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCycle(c.key)}
                  className={`text-left rounded-card border p-4 transition-all ${
                    cycle === c.key ? 'border-brand-500 ring-2 ring-brand-500 bg-brand-50/40' : 'border-hairline bg-surface hover:border-brand-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[14px] font-bold text-ink">{c.key}</p>
                    {c.key === 'Yearly' && selectedPlan.pricing.yearlySavingsPercent > 0 && (
                      <Badge variant="green">Save {selectedPlan.pricing.yearlySavingsPercent}%</Badge>
                    )}
                  </div>
                  <p className="text-[16px] font-bold text-ink tabular-nums mt-1">{inr(c.rate)} <span className="text-[11px] font-semibold text-ink-muted">/ employee</span></p>
                  <p className="text-[11.5px] font-medium text-ink-secondary mt-1">{c.note}</p>
                </button>
              ))}
            </div>
          )}

          {/* ── STEP 4 · Employee count ───────────────────────────────────── */}
          {step === 3 && (
            <div className="max-w-xl space-y-4">
              <div className="rounded-card border border-hairline bg-surface-muted p-4 flex items-center gap-3">
                <Users className="w-5 h-5 text-brand-500 shrink-0" />
                <div>
                  <span className={LABEL}>Current Active Users</span>
                  <p className="text-[18px] font-bold text-ink tabular-nums">{ctx?.minEmployees}</p>
                </div>
              </div>
              <div>
                <span className={LABEL}>How many employees do you want to support?</span>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={minSeats}
                    value={seatsInput}
                    onChange={(e) => setSeatsInput(e.target.value)}
                    className="w-36 rounded-xl border border-hairline bg-surface px-3 py-2 text-[14px] font-bold text-ink focus:outline-none focus:ring-2 focus:ring-brand-500 tabular-nums"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[minSeats, ...[100, 125, 150, 200, 250, 500].filter((n) => n > minSeats)].slice(0, 6).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSeatsInput(String(n))}
                        className={`rounded-lg border px-2.5 py-1 text-[12px] font-bold ${Number(seatsInput) === n ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-hairline bg-surface text-ink hover:border-brand-300'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                {Number(seatsInput) < minSeats && seatsInput !== '' && (
                  <p className="text-[11.5px] font-semibold text-red-600 mt-1.5">
                    You cannot purchase fewer than your {minSeats} current active users.
                  </p>
                )}
                {selectedPlan && selectedPlan.employeeLimit !== -1 && Number(seatsInput) > selectedPlan.employeeLimit && (
                  <p className="text-[11.5px] font-semibold text-amber-700 mt-1.5">
                    The {selectedPlan.name} plan supports up to {selectedPlan.employeeLimit} employees — choose a higher plan for more.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 5 · Summary & pay ────────────────────────────────────── */}
          {step === 4 && (
            <div className="max-w-2xl space-y-3">
              {quoting && !quote && (
                <p className="text-[12.5px] font-medium text-ink-secondary inline-flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Calculating…
                </p>
              )}
              {quoteError && <p className="text-[12.5px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3.5 py-3">{quoteError}</p>}
              {quote?.ok && (
                <>
                  <div className="rounded-card border border-hairline bg-surface-muted p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                    <div><span className={LABEL}>Selected Plan</span><p className="text-[13.5px] font-bold text-ink mt-0.5">{quote.plan.name}</p></div>
                    <div><span className={LABEL}>Billing Cycle</span><p className="text-[13.5px] font-bold text-ink mt-0.5">{quote.billingCycle}</p></div>
                    <div><span className={LABEL}>Change</span><p className="mt-0.5"><Badge variant="blue">{CHANGE_LABEL[quote.changeType] || quote.changeType}</Badge></p></div>
                    <div><span className={LABEL}>Employee Limit</span><p className="text-[13.5px] font-bold text-ink mt-0.5 tabular-nums">{quote.newEmployeeLimit ?? '∞'}</p></div>
                    <div><span className={LABEL}>Extra Slots</span><p className="text-[13.5px] font-bold text-ink mt-0.5 tabular-nums">{quote.extraSlots}</p></div>
                    <div><span className={LABEL}>Included Credits</span><p className="text-[13.5px] font-bold text-ink mt-0.5 tabular-nums">{quote.includedVerificationCredits}</p></div>
                    <div className="col-span-2 sm:col-span-3">
                      <span className={LABEL}>Renewal Date</span>
                      <p className="text-[13px] font-bold text-ink mt-0.5 inline-flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-brand-500" /> {formatDate(quote.renewalDate)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-card border border-hairline bg-surface p-4 text-[12.5px] font-medium text-ink-secondary space-y-1 tabular-nums">
                    <div className="flex justify-between"><span>Subtotal ({quote.employeeCount} × {inr(quote.rate)} / {quote.billingCycle.toLowerCase()})</span><span>{inr(quote.subtotal)}</span></div>
                    {quote.discount.amount > 0 && (
                      <div className="flex justify-between text-emerald-700"><span>Discount ({quote.discount.percent}%)</span><span>− {inr(quote.discount.amount)}</span></div>
                    )}
                    {quote.gst.enabled && quote.gst.type === 'CGST_SGST' && (
                      <>
                        <div className="flex justify-between"><span>CGST @ {quote.gst.percent / 2}%</span><span>{inr(quote.gst.cgst)}</span></div>
                        <div className="flex justify-between"><span>SGST @ {quote.gst.percent / 2}%</span><span>{inr(quote.gst.sgst)}</span></div>
                      </>
                    )}
                    {quote.gst.enabled && quote.gst.type === 'IGST' && (
                      <div className="flex justify-between"><span>IGST @ {quote.gst.percent}%</span><span>{inr(quote.gst.igst)}</span></div>
                    )}
                    <div className="flex justify-between border-t border-hairline pt-1.5 text-[15px] font-bold text-ink">
                      <span>Grand Total</span><span>{inr(quote.grandTotal)}</span>
                    </div>
                  </div>

                  {canPurchase ? (
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium text-ink-muted inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" /> Your plan changes only after the payment is verified.
                      </p>
                      <Button
                        variant="primary"
                        onClick={handlePay}
                        disabled={paying || quoting}
                        icon={paying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      >
                        {paying ? 'Processing…' : `Pay ${inr(quote.grandTotal)} Securely`}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[12.5px] font-medium text-ink-secondary bg-surface-muted border border-hairline rounded-xl px-3.5 py-3 inline-flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 shrink-0 mt-px" />
                      Only your Company Head can purchase or change the subscription.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-1 border-t border-hairline">
            <Button
              variant="outline"
              size="sm"
              onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
              disabled={paying}
              icon={<ArrowLeft className="w-3.5 h-3.5" />}
            >
              {step === 0 ? 'Close' : 'Back'}
            </Button>
            {step < STEPS.length - 1 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setStep(step + 1)}
                disabled={!canContinue()}
                icon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                {step === 0 ? 'Upgrade / Renew' : 'Continue'}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default SubscriptionPurchaseWizard;
