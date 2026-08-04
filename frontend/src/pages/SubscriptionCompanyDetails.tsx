// ─────────────────────────────────────────────────────────────────────────────
// COMPANY SUBSCRIPTION DETAILS — everything about ONE company, in eight sections:
//   Subscription · Employee Slots · Verification Credits · Billing · Invoices ·
//   Payment History · Usage · Audit Logs
//
// Opened by clicking a row in Subscription Management → Companies. Replaces the
// old "Manage Subscription" screen, which showed the plan editor and little else
// — everything an operator needed to answer "what is going on with this account?"
// lived on four different pages.
//
// Business rules are unchanged: the plan change still posts to the same endpoint,
// the amount is still computed live from headcount × the catalog rate, and the
// per-company slot / credit / invoice data is read from the same APIs that back
// their own admin screens.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, Save, Crown, Sparkles, Building2, Users2, ShieldCheck, Wallet,
  Receipt, HandCoins, Gauge, History, LayoutGrid, RefreshCw, CalendarClock,
  Ban, Play, Mail, Smartphone, CalendarDays, ArrowRight, TrendingUp,
} from 'lucide-react';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Badge, statusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDateTime } from '@/utils/formatDate';
import {
  Panel, SubNav, Metric, Loading, Empty, Field, inr, num, shortDate,
  inputCls, labelCls, PLAN_VARIANT,
} from '@/components/subscription/kit';
import { INVOICE_STATUS_VARIANT } from '@/components/subscription/billing/calc';

type Section = 'subscription' | 'slots' | 'credits' | 'billing' | 'invoices' | 'payments' | 'usage' | 'audit';

const SECTIONS = [
  { key: 'subscription', label: 'Subscription', icon: <Crown size={14} /> },
  { key: 'slots', label: 'Employee Slots', icon: <LayoutGrid size={14} /> },
  { key: 'credits', label: 'Verification Credits', icon: <ShieldCheck size={14} /> },
  { key: 'billing', label: 'Billing', icon: <Wallet size={14} /> },
  { key: 'invoices', label: 'Invoices', icon: <Receipt size={14} /> },
  { key: 'payments', label: 'Payment History', icon: <HandCoins size={14} /> },
  { key: 'usage', label: 'Usage', icon: <Gauge size={14} /> },
  { key: 'audit', label: 'Audit Logs', icon: <History size={14} /> },
];

interface Props {
  companyId: string | number;
  onBack: () => void;
  onSaved?: () => void;
  onOpenInvoice?: (invoiceId: string | number) => void;
}

export const SubscriptionCompanyDetails: React.FC<Props> = ({ companyId, onBack, onSaved, onOpenInvoice }) => {
  const [section, setSection] = useState<Section>('subscription');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Sources
  const [data, setData] = useState<any>(null);            // /subscriptions/:id
  const [catalog, setCatalog] = useState<any[]>([]);       // live plan catalog
  const [billing, setBilling] = useState<any>(null);       // /subscription-invoices/company/:id
  const [slots, setSlots] = useState<any>(null);           // slot usage row
  const [slotTx, setSlotTx] = useState<any[]>([]);         // slot transactions
  const [credits, setCredits] = useState<any>(null);       // verification wallet
  const [audit, setAudit] = useState<any[]>([]);           // platform audit log

  // Editable subscription form
  const [plan, setPlan] = useState('Free');
  const [cycle, setCycle] = useState('Quarterly');
  const [discount, setDiscount] = useState(0);
  const [renewalDate, setRenewalDate] = useState('');
  const [reason, setReason] = useState('');

  // Manual slot grant / decrease for this company
  const [slotDelta, setSlotDelta] = useState('');
  const [slotReason, setSlotReason] = useState('');
  const [slotBusy, setSlotBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const cid = Number(companyId);
    try {
      const [d, cat, bill, usage, tx, cred, logs] = await Promise.all([
        api.subscriptions.get(companyId),
        api.subscriptions.catalog().catch(() => null),
        api.subscriptionInvoices.companyBilling(companyId).catch(() => null),
        api.employeeSlots.admin.usage().catch(() => []),
        api.employeeSlots.admin.transactions().catch(() => []),
        api.get(`/super-admin/verification-credits/companies/${cid}`).then((r: any) => r.data).catch(() => null),
        api.audit.getAll('?module=Subscriptions&limit=500').catch(() => []),
      ]);

      setData(d);
      if (cat?.plans?.length) setCatalog(cat.plans);
      setBilling(bill);
      setSlots((Array.isArray(usage) ? usage : []).find((u: any) => Number(u.companyId) === cid) || null);
      setSlotTx((Array.isArray(tx) ? tx : []).filter((t: any) => Number(t.companyId) === cid));
      setCredits(cred);
      // Subscription audit rows stamp targetId with the company id. The module
      // filter is what makes this safe — targetId alone is not unique platform-wide.
      setAudit((Array.isArray(logs) ? logs : []).filter((l: any) => String(l.targetId) === String(cid)));

      const s = d.subscription || {};
      setPlan(d.plan);
      setCycle(d.billingCycle);
      setDiscount(s.discountPercent || 0);
      setRenewalDate(s.renewalDate ? String(s.renewalDate).slice(0, 10) : '');
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const employees = data?.employees ?? 0;

  // Live rate from the editable catalog (Custom keeps its manually-set rate).
  const liveRate = useMemo(() => {
    if (plan === 'Custom') return Number(data?.subscription?.pricePerEmployee) || 0;
    const p = catalog.find((c: any) => c.key === plan);
    if (p) return Number(cycle === 'Yearly' ? p.yearly : p.quarterly) || 0;
    return Number(data?.pricePerEmployee) || 0;
  }, [plan, cycle, catalog, data]);

  const liveAmount = useMemo(() => {
    const gross = (Number(employees) || 0) * liveRate;
    return Math.max(0, gross - Math.round(gross * ((Number(discount) || 0) / 100)));
  }, [employees, liveRate, discount]);

  const dirty = !!data && (
    plan !== data.plan
    || cycle !== data.billingCycle
    || (data.subscription?.discountPercent || 0) !== Number(discount)
    || (data.subscription?.renewalDate ? String(data.subscription.renewalDate).slice(0, 10) : '') !== renewalDate
  );

  const save = async () => {
    setSaving(true);
    try {
      await api.subscriptions.update(companyId, {
        plan, billingCycle: cycle,
        discountPercent: Number(discount) || 0,
        renewalDate: renewalDate || null,
        reason: reason || undefined,
      });
      ui.toast.success('Subscription updated — the company is re-permissioned immediately.');
      setReason('');
      await load();
      onSaved?.();
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  /** Adjust purchased add-on slots. Same audited endpoint as the platform-wide
   *  slot admin — the base plan limit is never touched here. */
  const adjustSlots = async () => {
    const delta = Number(slotDelta);
    if (!delta) { ui.toast.warning('Enter a non-zero slot change.'); return; }
    if (!slotReason.trim()) { ui.toast.warning('A reason is required for manual slot changes.'); return; }
    const ok = await ui.confirm({
      title: 'Manual slot adjustment',
      message: `${delta > 0 ? 'Add' : 'Remove'} ${Math.abs(delta)} slots ${delta > 0 ? 'to' : 'from'} ${data.companyName}?`,
      confirmText: 'Apply',
    });
    if (!ok) return;
    setSlotBusy(true);
    try {
      const res = await api.employeeSlots.admin.adjust({ companyId: Number(companyId), delta, reason: slotReason.trim() });
      ui.toast.success(`Applied — limit ${res.oldLimit ?? '∞'} → ${res.newLimit ?? '∞'}.`);
      setSlotDelta(''); setSlotReason('');
      await load();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setSlotBusy(false); }
  };

  const toggleStatus = async () => {
    const suspend = data.status !== 'Suspended';
    const ok = await ui.confirm({
      title: suspend ? 'Suspend subscription?' : 'Activate subscription?',
      message: suspend
        ? `Suspending will block ${data.companyName}'s users from signing in until re-activated.`
        : `Re-activate ${data.companyName}'s workspace access.`,
      confirmText: suspend ? 'Suspend' : 'Activate',
      variant: suspend ? 'danger' : 'primary',
    });
    if (!ok) return;
    try {
      if (suspend) await api.subscriptions.suspend(companyId); else await api.subscriptions.activate(companyId);
      ui.toast.success(`${data.companyName} ${suspend ? 'suspended' : 'activated'}.`);
      load();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  if (loading) return <div className="p-6"><Loading label="Loading company…" /></div>;
  if (!data) return <div className="p-6 text-[13px] text-ink-muted">Subscription not found.</div>;

  const outstanding = Number(billing?.outstanding) || 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1180px] mx-auto">
      {/* ── Header ── */}
      <button onClick={onBack} className="flex items-center gap-1 text-[13px] font-bold text-ink-secondary hover:text-brand-600 transition">
        <ChevronLeft size={17} /> Back to Companies
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-brand-50 text-brand-600 flex-shrink-0">
            <Building2 size={22} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-ink font-heading tracking-tight truncate">{data.companyName}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant={PLAN_VARIANT[data.plan] || 'gray'}>{data.plan === 'Custom' && <Crown size={11} />}{data.plan}</Badge>
              <Badge variant={statusBadge(data.status)} dot>{data.status}</Badge>
              <span className="text-[12px] text-ink-muted">{data.billingCycle} billing</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
          <Button
            variant="outline"
            size="sm"
            icon={data.status === 'Suspended' ? <Play size={14} /> : <Ban size={14} />}
            onClick={toggleStatus}
          >
            {data.status === 'Suspended' ? 'Activate' : 'Suspend'}
          </Button>
        </div>
      </div>

      {/* ── At-a-glance figures ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric label="Employees" value={num(employees)} icon={<Users2 size={16} />} tone="brand" sub={`${num(data.branches)} branches`} />
        <Metric label="Period Amount" value={inr(data.amount)} icon={<Wallet size={16} />} tone="emerald" sub={`${inr(data.pricePerEmployee)} per user`} />
        <Metric label="Outstanding" value={inr(outstanding)} icon={<Receipt size={16} />} tone={outstanding > 0 ? 'rose' : 'slate'} sub={`${num(billing?.invoices?.length || 0)} invoices`} />
        <Metric label="Renewal" value={shortDate(data.renewalDate)} icon={<CalendarClock size={16} />} tone="amber" sub={data.billingCycle} />
      </div>

      {/* ── Section navigation ── */}
      <SubNav items={SECTIONS} value={section} onChange={(k) => setSection(k as Section)} />

      {/* ── 1. SUBSCRIPTION ── */}
      {section === 'subscription' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Panel title="Company" className="lg:col-span-1">
            <dl>
              <Field label="Company Head" value={data.companyHead} />
              <Field label="Email" value={<span className="inline-flex items-center gap-1.5"><Mail size={13} className="text-ink-muted" />{data.companyHeadEmail || '—'}</span>} />
              <Field label="Mobile" value={<span className="inline-flex items-center gap-1.5"><Smartphone size={13} className="text-ink-muted" />{data.companyMobile || '—'}</span>} />
              <Field label="Customer Since" value={<span className="inline-flex items-center gap-1.5"><CalendarDays size={13} className="text-ink-muted" />{shortDate(data.createdDate)}</span>} />
            </dl>
          </Panel>

          <Panel
            title="Change Plan"
            subtitle="The amount is always recalculated from live headcount — it is never typed in."
            className="lg:col-span-2"
            actions={<Button size="sm" icon={<Save size={14} />} onClick={save} loading={saving} disabled={!dirty}>Save Changes</Button>}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Plan</label>
                <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inputCls}>
                  {catalog.length === 0
                    ? <option value={plan}>{plan}</option>
                    : catalog.map((p: any) => <option key={p.key} value={p.key}>{p.label || p.key}{p.range ? ` — ${p.range}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Billing Cycle</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Quarterly', 'Yearly'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCycle(c)}
                      className={`h-10 rounded-xl border text-[13px] font-bold transition-colors ${cycle === c ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-hairline text-ink-secondary hover:bg-surface-muted'}`}
                    >{c}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Discount %</label>
                <input type="number" min={0} max={100} value={discount} onChange={(e) => setDiscount(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Renewal Date</label>
                <input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} className={inputCls} />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Reason (recorded in history)</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Upgraded on customer request" className={inputCls} />
              </div>
            </div>

            {/* Live calculation */}
            <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50/50 px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-brand-700 uppercase tracking-wider">
                  <Sparkles size={12} /> Auto-calculated
                </div>
                <div className="text-[12.5px] text-ink-secondary mt-1">
                  {plan === 'Free'
                    ? 'Free plan — no charge.'
                    : <>{num(employees)} employees × {inr(liveRate)}{discount ? ` less ${discount}%` : ''}</>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[26px] font-bold text-ink tabular-nums leading-none font-heading">{inr(liveAmount)}</div>
                <div className="text-[11px] text-ink-muted mt-1">per {cycle === 'Yearly' ? 'year' : 'quarter'}</div>
              </div>
            </div>
          </Panel>

          <Panel flush title="Plan Change History" className="lg:col-span-3">
            <div className="overflow-x-auto">
              <Table>
                <Thead><Tr><Th>Date</Th><Th>Change</Th><Th>Amount</Th><Th>Changed By</Th><Th>Reason</Th></Tr></Thead>
                <Tbody>
                  {(data.history || []).length === 0 ? (
                    <Tr><Td colSpan={5}><Empty icon={<History size={22} />} title="No plan changes recorded yet." /></Td></Tr>
                  ) : data.history.map((h: any) => (
                    <Tr key={h.id}>
                      <Td className="text-[12.5px] text-ink-secondary whitespace-nowrap">{formatDateTime(h.createdAt)}</Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="gray">{h.oldPlan || '—'}</Badge>
                          <ArrowRight size={12} className="text-ink-muted" />
                          <Badge variant={PLAN_VARIANT[h.newPlan] || 'blue'}>{h.newPlan || '—'}</Badge>
                        </div>
                        {h.oldCycle !== h.newCycle && (h.oldCycle || h.newCycle) && (
                          <div className="text-[11px] text-ink-muted mt-1">{h.oldCycle} → {h.newCycle}</div>
                        )}
                      </Td>
                      <Td className="tabular-nums text-[12.5px] whitespace-nowrap">
                        {h.oldAmount != null || h.newAmount != null
                          ? <span className="text-ink-secondary">{inr(h.oldAmount || 0)} → <span className="font-bold text-ink">{inr(h.newAmount || 0)}</span></span>
                          : '—'}
                      </Td>
                      <Td className="text-[12.5px] text-ink-secondary">{h.changedBy || '—'}</Td>
                      <Td className="text-[12.5px] text-ink-secondary"><span className="block max-w-[280px] truncate" title={h.reason || ''}>{h.reason || '—'}</span></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </Panel>
        </div>
      )}

      {/* ── 2. EMPLOYEE SLOTS ── */}
      {section === 'slots' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Metric label="Base Plan Seats" value={slots?.unlimited ? '∞' : num(slots?.baseLimit ?? 0)} icon={<LayoutGrid size={16} />} tone="slate" />
            <Metric label="Extra Purchased" value={num(slots?.extraSlots ?? 0)} icon={<TrendingUp size={16} />} tone="brand" />
            <Metric label="Current Limit" value={slots?.unlimited ? '∞' : num(slots?.limit ?? 0)} icon={<Users2 size={16} />} tone="emerald" />
            <Metric
              label="Remaining"
              value={slots?.unlimited ? '∞' : num(slots?.remaining ?? 0)}
              icon={<Gauge size={16} />}
              tone={!slots?.unlimited && Number(slots?.remaining) === 0 ? 'rose' : 'amber'}
              sub={`${num(slots?.used ?? 0)} in use`}
            />
          </div>

          {/* Manual grant / decrease for THIS company (audited, reason required).
              Same endpoint the platform-wide slot admin used. */}
          <Panel title="Grant or Reduce Slots" subtitle="Adjusts purchased add-on slots only — the base plan limit is never changed here.">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <label className={labelCls}>Slot change</label>
                <input
                  type="number"
                  className={inputCls}
                  value={slotDelta}
                  onChange={(e) => setSlotDelta(e.target.value)}
                  placeholder="e.g. 10 or -5"
                />
              </div>
              <div className="flex-1 min-w-[240px]">
                <label className={labelCls}>Reason (required, audited)</label>
                <input className={inputCls} value={slotReason} onChange={(e) => setSlotReason(e.target.value)} placeholder="e.g. Goodwill grant after billing issue" />
              </div>
              <Button size="sm" onClick={adjustSlots} loading={slotBusy}>Apply Adjustment</Button>
            </div>
          </Panel>

          <Panel flush title="Slot Purchases & Adjustments" subtitle="Every change to this company's seat allowance">
            <div className="overflow-x-auto">
              <Table>
                <Thead><Tr><Th>Date</Th><Th>Type</Th><Th>Slots</Th><Th>Amount</Th><Th>Limit Change</Th><Th>Status</Th><Th>By</Th></Tr></Thead>
                <Tbody>
                  {slotTx.length === 0 ? (
                    <Tr><Td colSpan={7}><Empty icon={<LayoutGrid size={22} />} title="No slot transactions." hint="This company is running on its base plan allowance." /></Td></Tr>
                  ) : slotTx.map((t) => (
                    <Tr key={t.id}>
                      <Td className="text-[12.5px] text-ink-secondary whitespace-nowrap">{formatDateTime(t.createdAt)}</Td>
                      <Td className="text-[12.5px] text-ink-secondary">{String(t.type || '').replace(/_/g, ' ')}{t.packName ? ` — ${t.packName}` : ''}</Td>
                      <Td className="tabular-nums font-semibold">{Number(t.slots) > 0 ? `+${t.slots}` : t.slots}</Td>
                      <Td className="tabular-nums">{t.amount != null ? inr(t.amount) : '—'}</Td>
                      <Td className="tabular-nums text-[12.5px] text-ink-secondary">{t.oldLimit != null && t.newLimit != null ? `${t.oldLimit} → ${t.newLimit}` : '—'}</Td>
                      <Td><Badge variant={t.status === 'REJECTED' ? 'red' : t.status === 'REQUESTED' ? 'amber' : 'green'} dot>{t.status}</Badge></Td>
                      <Td className="text-[12.5px] text-ink-secondary">{t.actionedBy || t.requestedBy || '—'}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </Panel>
        </div>
      )}

      {/* ── 3. VERIFICATION CREDITS ── */}
      {section === 'credits' && (
        <div className="space-y-5">
          {!credits ? (
            <Panel><Empty icon={<ShieldCheck size={22} />} title="No verification wallet for this company." hint="A wallet is created the first time credits are allocated or purchased." /></Panel>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Metric label="Allocated" value={num(credits.allocatedCredits)} icon={<ShieldCheck size={16} />} tone="brand" />
                <Metric label="Used" value={num(credits.usedCredits)} icon={<Gauge size={16} />} tone="slate" />
                <Metric
                  label="Remaining"
                  value={num(credits.remainingCredits)}
                  icon={<Wallet size={16} />}
                  tone={Number(credits.remainingCredits) <= 0 ? 'rose' : 'emerald'}
                  sub={`${num(credits.remainingVerifications)} verifications left`}
                />
                <Metric label="Wallet Status" value={credits.status} icon={<Sparkles size={16} />} tone={credits.status === 'Active' ? 'emerald' : 'amber'} />
              </div>

              <Panel title="Wallet Configuration">
                <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6">
                  <Field label="Provider" value={credits.provider} />
                  <Field label="Verification Mode" value={credits.verificationMode} />
                  <Field label="Cost per Verification" value={`${num(credits.costPerVerification)} credit${Number(credits.costPerVerification) === 1 ? '' : 's'}`} />
                  <Field label="Company Code" value={credits.companyCode || '—'} />
                  <Field label="GSTIN" value={credits.gstNumber || '—'} />
                  <Field label="Credits Expire" value={credits.expiryDate ? shortDate(credits.expiryDate) : 'No expiry'} />
                </dl>
                <p className="text-[12px] text-ink-muted mt-4">
                  Credits are a quota, not money — one credit buys one verification and they are never converted back to currency.
                  Allocation and suspension are performed from the Verification Credits module.
                </p>
              </Panel>
            </>
          )}
        </div>
      )}

      {/* ── 4. BILLING ── */}
      {section === 'billing' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Panel title="Current Billing">
            <dl>
              <Field label="Plan" value={<Badge variant={PLAN_VARIANT[data.plan] || 'gray'}>{data.plan}</Badge>} />
              <Field label="Billing Cycle" value={data.billingCycle} />
              <Field label="Rate per Employee" value={inr(data.pricePerEmployee)} />
              <Field label="Discount" value={`${data.discountPercent || 0}%`} />
              <Field label="Amount per Period" value={<span className="text-[16px] font-bold">{inr(data.amount)}</span>} />
            </dl>
          </Panel>
          <Panel title="Account Standing">
            <dl>
              <Field label="Payment Status" value={<Badge variant={statusBadge(data.billing?.paymentStatus || data.paymentStatus)}>{data.billing?.paymentStatus || data.paymentStatus || '—'}</Badge>} />
              <Field label="Subscription Status" value={<Badge variant={statusBadge(data.status)} dot>{data.status}</Badge>} />
              <Field label="Next Renewal" value={shortDate(billing?.upcomingRenewal || data.renewalDate)} />
              <Field
                label="Outstanding"
                value={outstanding > 0
                  ? <span className="text-[16px] font-bold text-rose-600">{inr(outstanding)}</span>
                  : <Badge variant="green">Fully settled</Badge>}
              />
              <Field label="Invoices Raised" value={num(billing?.invoices?.length || 0)} />
            </dl>
          </Panel>
        </div>
      )}

      {/* ── 5. INVOICES ── */}
      {section === 'invoices' && (
        <Panel flush title="Invoices" subtitle={`${num(billing?.invoices?.length || 0)} invoices raised for this company`}>
          <div className="overflow-x-auto">
            <Table>
              <Thead><Tr><Th>Invoice</Th><Th>Period</Th><Th>Employees</Th><Th>Amount</Th><Th>Paid</Th><Th>Balance</Th><Th>Status</Th></Tr></Thead>
              <Tbody>
                {!(billing?.invoices || []).length ? (
                  <Tr><Td colSpan={7}><Empty icon={<Receipt size={22} />} title="No invoices yet." hint="Generate one from Billing → Invoices." /></Td></Tr>
                ) : billing.invoices.map((i: any) => (
                  <Tr
                    key={i.id}
                    onClick={() => onOpenInvoice?.(i.id)}
                    tabIndex={0}
                    className={onOpenInvoice ? 'cursor-pointer transition-colors hover:bg-surface-muted/70' : ''}
                  >
                    <Td>
                      <div className="font-bold text-brand-700">{i.invoiceNo}</div>
                      <div className="text-[11px] text-ink-muted">{shortDate(i.invoiceDate)}</div>
                    </Td>
                    <Td className="text-[12.5px] text-ink-secondary whitespace-nowrap">{shortDate(i.periodStart)}<br /><span className="text-ink-muted">to {shortDate(i.periodEnd)}</span></Td>
                    <Td className="tabular-nums">{i.employeeCount}</Td>
                    <Td className="tabular-nums font-bold">{inr(i.grandTotal)}</Td>
                    <Td className="tabular-nums text-[13px] text-emerald-600">{i.amountPaid ? inr(i.amountPaid) : '—'}</Td>
                    <Td className="tabular-nums text-[13px] font-semibold">{Number(i.balance) > 0 ? <span className="text-rose-600">{inr(i.balance)}</span> : <span className="text-ink-muted">—</span>}</Td>
                    <Td><Badge variant={INVOICE_STATUS_VARIANT[i.status] || 'gray'} dot>{i.status}</Badge></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Panel>
      )}

      {/* ── 6. PAYMENT HISTORY ── */}
      {section === 'payments' && (
        <Panel
          flush
          title="Payment History"
          subtitle={`${num(billing?.payments?.length || 0)} payments · ${inr((billing?.payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0))} received`}
        >
          <div className="overflow-x-auto">
            <Table>
              <Thead><Tr><Th>Date</Th><Th>Amount</Th><Th>Method</Th><Th>Reference</Th><Th>Collected By</Th><Th>Notes</Th></Tr></Thead>
              <Tbody>
                {!(billing?.payments || []).length ? (
                  <Tr><Td colSpan={6}><Empty icon={<HandCoins size={22} />} title="No payments recorded." hint="Payments appear here as soon as one is recorded against an invoice." /></Td></Tr>
                ) : billing.payments.map((p: any) => (
                  <Tr key={p.id}>
                    <Td className="text-[12.5px] text-ink-secondary whitespace-nowrap">{formatDateTime(p.paidAt)}</Td>
                    <Td className="tabular-nums font-bold text-emerald-600">{inr(p.amount)}</Td>
                    <Td className="text-[13px] text-ink-secondary">{p.method || '—'}</Td>
                    <Td className="text-[12.5px] text-ink-secondary">{p.referenceNo || '—'}</Td>
                    <Td className="text-[12.5px] text-ink-secondary">{p.collectedBy || '—'}</Td>
                    <Td className="text-[12.5px] text-ink-secondary"><span className="block max-w-[220px] truncate" title={p.notes || ''}>{p.notes || '—'}</span></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Panel>
      )}

      {/* ── 7. USAGE ── */}
      {section === 'usage' && (
        <div className="space-y-5">
          <Panel title="Consumption Against Plan Limits" subtitle="What this company is actually using versus what its plan allows">
            <div className="space-y-4">
              <UsageBar label="Employees" used={Number(slots?.used ?? employees)} limit={slots?.unlimited ? null : Number(slots?.limit ?? data.subscription?.employeeLimit ?? 0) || null} />
              <UsageBar label="Branches" used={Number(data.branches) || 0} limit={data.subscription?.branchLimit ?? null} />
              <UsageBar label="Verification Credits" used={Number(credits?.usedCredits) || 0} limit={Number(credits?.allocatedCredits) || null} unit="credits" />
            </div>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel title="Configured Limits" subtitle="Overrides set on this company's subscription record">
              <dl>
                <Field label="Employee Limit" value={data.subscription?.employeeLimit ?? 'Plan default'} />
                <Field label="Branch Limit" value={data.subscription?.branchLimit ?? 'Plan default'} />
                <Field label="Storage (MB)" value={data.subscription?.storageMB ?? 'Plan default'} />
                <Field label="Admin Users" value={data.subscription?.adminUserLimit ?? 'Plan default'} />
              </dl>
            </Panel>
            <Panel title="Seat Utilisation">
              <dl>
                <Field label="Base Plan Seats" value={slots?.unlimited ? 'Unlimited' : num(slots?.baseLimit ?? 0)} />
                <Field label="Purchased Add-ons" value={num(slots?.extraSlots ?? 0)} />
                <Field label="Effective Limit" value={slots?.unlimited ? 'Unlimited' : num(slots?.limit ?? 0)} />
                <Field label="Seats In Use" value={num(slots?.used ?? employees)} />
                <Field label="Seats Remaining" value={slots?.unlimited ? 'Unlimited' : num(slots?.remaining ?? 0)} />
              </dl>
            </Panel>
          </div>
        </div>
      )}

      {/* ── 8. AUDIT LOGS ── */}
      {section === 'audit' && (
        <Panel flush title="Audit Logs" subtitle="Every subscription action taken on this company, newest first">
          <div className="overflow-x-auto">
            <Table>
              <Thead><Tr><Th>When</Th><Th>Action</Th><Th>Performed By</Th><Th>Details</Th></Tr></Thead>
              <Tbody>
                {audit.length === 0 ? (
                  <Tr><Td colSpan={4}><Empty icon={<History size={22} />} title="No audited subscription actions yet." hint="Plan changes, suspensions and activations are recorded here." /></Td></Tr>
                ) : audit.map((l) => (
                  <Tr key={l.id}>
                    <Td className="text-[12.5px] text-ink-secondary whitespace-nowrap">{formatDateTime(l.createdAt)}</Td>
                    <Td><span className="text-[12.5px] font-bold text-ink">{String(l.action || '').replace(/_/g, ' ')}</span></Td>
                    <Td className="text-[12.5px] text-ink-secondary">{l.actorName}{l.actorRole ? <span className="text-ink-muted"> · {l.actorRole}</span> : null}</Td>
                    <Td className="text-[12px] text-ink-secondary">
                      <span className="block max-w-[420px] truncate" title={typeof l.details === 'string' ? l.details : JSON.stringify(l.details || {})}>
                        {formatAuditDetails(l.details)}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Panel>
      )}
    </div>
  );
};

/** The audit `details` payload is heterogeneous — render it as readable pairs. */
function formatAuditDetails(details: any): string {
  if (!details) return '—';
  let obj = details;
  if (typeof details === 'string') {
    try { obj = JSON.parse(details); } catch { return details; }
  }
  if (typeof obj !== 'object') return String(obj);
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()}: ${v}`)
    .join(' · ') || '—';
}

const UsageBar: React.FC<{ label: string; used: number; limit: number | null; unit?: string }> = ({ label, used, limit, unit }) => {
  const unlimited = limit == null || limit < 0;
  const ratio = unlimited || limit === 0 ? 0 : Math.min(1, used / limit);
  const tone = ratio >= 1 ? 'bg-rose-500' : ratio >= 0.85 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        <span className="text-[12.5px] text-ink-secondary tabular-nums">
          {num(used)} <span className="text-ink-muted">/ {unlimited ? '∞' : num(limit!)}{unit ? ` ${unit}` : ''}</span>
          {!unlimited && limit! > 0 && <span className="text-ink-muted"> · {Math.round(ratio * 100)}%</span>}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-muted overflow-hidden">
        <div className={`h-full rounded-full ${unlimited ? 'bg-slate-300' : tone}`} style={{ width: unlimited ? '100%' : `${Math.max(2, ratio * 100)}%` }} />
      </div>
    </div>
  );
};

export default SubscriptionCompanyDetails;
