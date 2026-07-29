// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS — six configuration panels behind one sub-navigation:
//   GST · Payment Gateway · Invoice Template · Billing Rules · Pricing Matrix · Coupons
//
// Every panel writes to a store that already existed:
//   • GST / Billing Rules / Pricing Matrix / Coupons → /api/plan-config/settings
//   • Payment Gateway                                → /api/super-admin/verification-credits/recharge/settings
//   • Invoice Template                               → /api/subscription-invoices/settings
//
// Gateway credentials are never rendered — the backend returns configuration
// STATUS only (which keys are present), never their values.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from 'react';
import {
  Receipt, CreditCard, FileText, Scale, Grid3x3, TicketPercent, Save,
  RefreshCw, Plus, Trash2, ShieldCheck, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { Panel, SubNav, Loading, Empty, inputCls, labelCls, Toggle, inr } from './kit';
import { InvoiceSettingsModal } from './billing/InvoiceSettingsModal';

type View = 'gst' | 'gateway' | 'template' | 'rules' | 'pricing' | 'coupons';

const NAV = [
  { key: 'gst', label: 'GST', icon: <Receipt size={14} /> },
  { key: 'gateway', label: 'Payment Gateway', icon: <CreditCard size={14} /> },
  { key: 'template', label: 'Invoice Template', icon: <FileText size={14} /> },
  { key: 'rules', label: 'Billing Rules', icon: <Scale size={14} /> },
  { key: 'pricing', label: 'Pricing Matrix', icon: <Grid3x3 size={14} /> },
  { key: 'coupons', label: 'Coupons', icon: <TicketPercent size={14} /> },
];

export const SettingsTab: React.FC = () => {
  const [view, setView] = useState<View>('gst');
  return (
    <div className="space-y-5">
      <SubNav items={NAV} value={view} onChange={(k) => setView(k as View)} />
      {view === 'gst' && <GstPanel />}
      {view === 'gateway' && <GatewayPanel />}
      {view === 'template' && <TemplatePanel />}
      {view === 'rules' && <RulesPanel />}
      {view === 'pricing' && <><PricingPanel /><SlotPacksPanel /></>}
      {view === 'coupons' && <CouponsPanel />}
    </div>
  );
};

// ── Shared platform-settings hook (/api/plan-config/settings) ────────────────
function usePlatformSettings() {
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setForm(await api.planConfig.getSettings()); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  /** Saves a PATCH — the store merges, so one panel can never wipe another's keys. */
  const save = async (patch: any, msg = 'Settings saved.') => {
    setSaving(true);
    try { setForm(await api.planConfig.updateSettings(patch)); ui.toast.success(msg); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setSaving(false); }
  };

  return { form, set, save, loading, saving, reload: load };
}

const PanelActions: React.FC<{ onReload: () => void; onSave: () => void; saving: boolean }> = ({ onReload, onSave, saving }) => (
  <>
    <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={onReload}>Refresh</Button>
    <Button size="sm" icon={<Save size={14} />} onClick={onSave} loading={saving}>Save</Button>
  </>
);

// ── 1. GST ───────────────────────────────────────────────────────────────────
const GstPanel: React.FC = () => {
  const { form, set, save, loading, saving, reload } = usePlatformSettings();
  if (loading || !form) return <Loading label="Loading GST settings…" />;

  return (
    <Panel
      title="GST & Tax"
      subtitle="Applied to every subscription invoice. CGST/SGST vs IGST is decided by the company's billing state against the platform's registered state."
      actions={<PanelActions onReload={reload} saving={saving} onSave={() => save({
        taxPercent: Number(form.taxPercent) || 0,
        gstNumber: form.gstNumber || '',
        currency: form.currency || 'INR',
      }, 'GST settings saved.')} />}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
        <div>
          <label className={labelCls}>GST Rate (%)</label>
          <input type="number" min={0} max={100} className={inputCls} value={form.taxPercent ?? 18} onChange={(e) => set({ taxPercent: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>Platform GSTIN</label>
          <input className={inputCls} value={form.gstNumber || ''} onChange={(e) => set({ gstNumber: e.target.value })} placeholder="e.g. 24ABCDE1234F1Z5" />
        </div>
        <div>
          <label className={labelCls}>Currency</label>
          <input className={inputCls} value={form.currency || 'INR'} onChange={(e) => set({ currency: e.target.value })} />
        </div>
      </div>
      <p className="text-[12px] text-ink-muted mt-4 flex items-start gap-2 max-w-3xl">
        <ShieldCheck size={14} className="mt-0.5 flex-shrink-0" />
        The GST rate here is the default applied when an invoice is generated. An individual invoice can still carry its own rate, and historical invoices keep the rate they were raised with.
      </p>
    </Panel>
  );
};

// ── 2. PAYMENT GATEWAY ───────────────────────────────────────────────────────
const GatewayPanel: React.FC = () => {
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setForm(await api.recharge.admin.settings()); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.recharge.admin.updateSettings({
        enableOnlineRecharge: !!form.enableOnlineRecharge,
        gstEnabled: !!form.gstEnabled,
        gstPercent: Number(form.gstPercent) || 0,
        currency: form.currency || 'INR',
        minRechargeAmount: Number(form.minRechargeAmount) || 0,
        maxRechargeAmount: Number(form.maxRechargeAmount) || 0,
        autoCreditAllocation: !!form.autoCreditAllocation,
        roundOffPolicy: form.roundOffPolicy || 'ROUND',
      });
      setForm(saved);
      ui.toast.success('Payment gateway settings saved.');
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setSaving(false); }
  };

  if (loading || !form) return <Loading label="Loading gateway settings…" />;

  return (
    <div className="space-y-5">
      <Panel
        title="Payment Gateway"
        subtitle="Online collection for self-service purchases (Cashfree)."
        actions={<PanelActions onReload={load} saving={saving} onSave={save} />}
      >
        {/* Connection status — read-only. Credentials are never sent to the browser. */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-hairline bg-surface-muted mb-5 flex-wrap">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center justify-center h-9 w-9 rounded-xl ${form.gatewayConfigured ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              {form.gatewayConfigured ? <ShieldCheck size={17} /> : <AlertTriangle size={17} />}
            </span>
            <div>
              <div className="text-[13.5px] font-bold text-ink">
                {form.gatewayConfigured ? 'Gateway connected' : 'Gateway not configured'}
              </div>
              <div className="text-[12px] text-ink-muted">
                {form.gatewayConfigured
                  ? 'Credentials are held server-side and are never exposed to this screen.'
                  : 'Set the gateway credentials in the server environment to enable online collection.'}
              </div>
            </div>
          </div>
          <Badge variant={form.gatewayConfigured ? 'green' : 'amber'} dot>{String(form.gatewayMode || 'UNKNOWN').toUpperCase()}</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Currency</label>
            <input className={inputCls} value={form.currency || 'INR'} onChange={(e) => set({ currency: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>GST on Purchases (%)</label>
            <input type="number" min={0} max={100} className={inputCls} value={form.gstPercent ?? 18} onChange={(e) => set({ gstPercent: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>Round-off Policy</label>
            <select className={inputCls} value={form.roundOffPolicy || 'ROUND'} onChange={(e) => set({ roundOffPolicy: e.target.value })}>
              <option value="ROUND">Round to nearest</option>
              <option value="FLOOR">Always round down</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Minimum Purchase (₹)</label>
            <input type="number" min={0} className={inputCls} value={form.minRechargeAmount ?? 0} onChange={(e) => set({ minRechargeAmount: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>Maximum Purchase (₹)</label>
            <input type="number" min={0} className={inputCls} value={form.maxRechargeAmount ?? 0} onChange={(e) => set({ maxRechargeAmount: Number(e.target.value) })} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <SettingRow
            title="Accept online payments"
            hint="When off, companies are routed to the sales team instead of a payment page."
            on={!!form.enableOnlineRecharge}
            onChange={(v) => set({ enableOnlineRecharge: v })}
          />
          <SettingRow
            title="Charge GST on purchases"
            hint="Adds GST to the online purchase total at the rate above."
            on={!!form.gstEnabled}
            onChange={(v) => set({ gstEnabled: v })}
          />
          <SettingRow
            title="Auto-allocate on settlement"
            hint="Credit the purchase automatically once the gateway confirms settlement."
            on={!!form.autoCreditAllocation}
            onChange={(v) => set({ autoCreditAllocation: v })}
          />
        </div>
      </Panel>
    </div>
  );
};

const SettingRow: React.FC<{ title: string; hint: string; on: boolean; onChange: (v: boolean) => void }> = ({ title, hint, on, onChange }) => (
  <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-hairline bg-surface">
    <div className="min-w-0">
      <div className="text-[13.5px] font-semibold text-ink">{title}</div>
      <div className="text-[12px] text-ink-muted">{hint}</div>
    </div>
    <Toggle on={on} onChange={onChange} />
  </div>
);

// ── 3. INVOICE TEMPLATE ──────────────────────────────────────────────────────
const TemplatePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSettings(await api.subscriptionInvoices.getSettings()); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading label="Loading invoice template…" />;
  const s = settings || {};

  return (
    <>
      <Panel
        title="Invoice Template"
        subtitle="The issuer identity, bank details and branding printed on every subscription tax invoice."
        actions={
          <>
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
            <Button size="sm" icon={<ExternalLink size={14} />} onClick={() => setOpen(true)}>Edit Template</Button>
          </>
        }
      >
        <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6">
          {[
            ['Legal Name', s.legalName || s.companyName],
            ['GSTIN', s.gstin],
            ['PAN', s.pan],
            ['Invoice Prefix', s.invoicePrefix],
            ['Email', s.email],
            ['Phone', s.phone],
            ['Website', s.website],
            ['Bank', s.bankName],
            ['UPI ID', s.upiId],
            ['Signatory', s.signatoryName],
            ['Payment Terms', s.paymentTerms],
            ['Address', s.address],
          ].map(([label, value]) => (
            <div key={label as string} className="py-2.5 border-b border-hairline">
              <dt className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">{label as string}</dt>
              <dd className="text-[13.5px] font-semibold text-ink mt-0.5 break-words">{(value as string) || '—'}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[12px] text-ink-muted mt-4 flex items-start gap-2">
          <FileText size={14} className="mt-0.5 flex-shrink-0" />
          The template is rendered once on the server, so the on-screen preview, the printed PDF and the emailed copy are always the same document.
        </p>
      </Panel>
      {open && <InvoiceSettingsModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </>
  );
};

// ── 4. BILLING RULES ─────────────────────────────────────────────────────────
const RulesPanel: React.FC = () => {
  const { form, set, save, loading, saving, reload } = usePlatformSettings();
  const [plans, setPlans] = useState<any[]>([]);
  useEffect(() => { api.planConfig.list().then((p: any) => setPlans(Array.isArray(p) ? p : [])).catch(() => {}); }, []);

  if (loading || !form) return <Loading label="Loading billing rules…" />;

  return (
    <Panel
      title="Billing Rules"
      subtitle="Defaults applied to new companies and to every renewal cycle."
      actions={<PanelActions onReload={reload} saving={saving} onSave={() => save({
        defaultPlan: form.defaultPlan,
        defaultBillingCycle: form.defaultBillingCycle,
        invoicePrefix: form.invoicePrefix,
        renewalReminderDays: Number(form.renewalReminderDays) || 0,
        gracePeriodDays: Number(form.gracePeriodDays) || 0,
        autoSuspendOnExpiry: !!form.autoSuspendOnExpiry,
      }, 'Billing rules saved.')} />}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Default Plan (new companies)</label>
          <select className={inputCls} value={form.defaultPlan} onChange={(e) => set({ defaultPlan: e.target.value })}>
            {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Default Billing Cycle</label>
          <select className={inputCls} value={form.defaultBillingCycle} onChange={(e) => set({ defaultBillingCycle: e.target.value })}>
            <option>Quarterly</option><option>Yearly</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Invoice Number Prefix</label>
          <input className={inputCls} value={form.invoicePrefix || ''} onChange={(e) => set({ invoicePrefix: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Renewal Reminder (days before)</label>
          <input type="number" min={0} className={inputCls} value={form.renewalReminderDays ?? 7} onChange={(e) => set({ renewalReminderDays: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>Grace Period (days)</label>
          <input type="number" min={0} className={inputCls} value={form.gracePeriodDays ?? 7} onChange={(e) => set({ gracePeriodDays: Number(e.target.value) })} />
        </div>
      </div>
      <div className="mt-4">
        <SettingRow
          title="Auto-suspend on expiry"
          hint="Suspend a company automatically once its subscription expires and the grace period has passed."
          on={!!form.autoSuspendOnExpiry}
          onChange={(v) => set({ autoSuspendOnExpiry: v })}
        />
      </div>
    </Panel>
  );
};

// ── 5. PRICING MATRIX ────────────────────────────────────────────────────────
const PricingPanel: React.FC = () => {
  const { form, set, save, loading, saving, reload } = usePlatformSettings();
  if (loading || !form) return <Loading label="Loading pricing matrix…" />;

  const tiers: any[] = Array.isArray(form.slotPricingTiers) ? form.slotPricingTiers : [];
  const setTier = (i: number, patch: any) => set({ slotPricingTiers: tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const addTier = () => set({ slotPricingTiers: [...tiers, { upTo: null, quarterly: 0, yearly: 0 }] });
  const removeTier = (i: number) => set({ slotPricingTiers: tiers.filter((_, j) => j !== i) });

  return (
    <Panel
      title="Pricing Matrix"
      subtitle="Per-slot add-on pricing. The tier is chosen by the company's employee limit AFTER the purchase; the rate follows its billing cycle."
      actions={<PanelActions onReload={reload} saving={saving} onSave={() => save({
        slotPricingTiers: tiers.map((t) => ({
          upTo: t.upTo === '' || t.upTo == null ? null : Number(t.upTo),
          quarterly: Number(t.quarterly) || 0,
          yearly: Number(t.yearly) || 0,
        })),
      }, 'Pricing matrix saved — new quotes use it immediately.')} />}
    >
      <div className="overflow-x-auto">
        <table className="w-full max-w-3xl text-left">
          <thead>
            <tr className="border-b border-hairline">
              {['Up to N employees', 'Quarterly ₹ / slot', 'Yearly ₹ / slot', ''].map((h, i) => (
                <th key={i} className="py-2 pr-4 text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.length === 0 ? (
              <tr><td colSpan={4}><Empty title="No pricing tiers configured." hint="Add a tier to start quoting slot purchases." /></td></tr>
            ) : tiers.map((t, i) => (
              <tr key={i} className="border-b border-hairline last:border-0">
                <td className="py-2.5 pr-4">
                  <input
                    value={t.upTo == null ? '' : t.upTo}
                    placeholder="∞ (top tier)"
                    onChange={(e) => setTier(i, { upTo: e.target.value === '' ? null : e.target.value })}
                    className={`${inputCls} w-40`}
                  />
                </td>
                <td className="py-2.5 pr-4"><input type="number" min={0} value={t.quarterly ?? 0} onChange={(e) => setTier(i, { quarterly: e.target.value })} className={`${inputCls} w-32`} /></td>
                <td className="py-2.5 pr-4"><input type="number" min={0} value={t.yearly ?? 0} onChange={(e) => setTier(i, { yearly: e.target.value })} className={`${inputCls} w-32`} /></td>
                <td className="py-2.5">
                  <button onClick={() => removeTier(i)} aria-label="Remove tier" className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-4 mt-5">
        <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={addTier}>Add Tier</Button>
        <p className="text-[12px] text-ink-muted flex-1 min-w-[240px]">
          Slot purchases have no minimum payment amount — the only floor is 5 slots, in multiples of 5.
        </p>
      </div>
    </Panel>
  );
};

// ── Slot packs + the manual-request queue ────────────────────────────────────
// These are slot commerce administration and live beside the pricing they use.
// (They were previously a top-level tab; the actions are unchanged.)
const SlotPacksPanel: React.FC = () => {
  const [packs, setPacks] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [draft, setDraft] = useState<{ id?: number; name: string; slots: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        api.employeeSlots.admin.packs().catch(() => []),
        api.employeeSlots.admin.requests().catch(() => []),
      ]);
      setPacks(Array.isArray(p) ? p : []);
      setRequests(Array.isArray(r) ? r : []);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const savePack = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await api.employeeSlots.admin.savePack({ id: draft.id, name: draft.name, slots: Number(draft.slots), isActive: true });
      setDraft(null);
      await load();
      ui.toast.success('Slot pack saved.');
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const removePack = async (p: any) => {
    if (!await ui.confirm({ title: 'Delete pack', message: `Delete the "${p.name}" quick button? Past purchases are unaffected.`, variant: 'danger', confirmText: 'Delete' })) return;
    try { await api.employeeSlots.admin.deletePack(p.id); await load(); ui.toast.success('Pack deleted.'); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  const approve = async (r: any) => {
    if (!await ui.confirm({ title: 'Approve slot request', message: `Grant ${r.slots} additional employee slots to ${r.companyName}?`, confirmText: 'Approve & Grant' })) return;
    setBusy(true);
    try {
      const res = await api.employeeSlots.admin.approveRequest(r.id);
      ui.toast.success(`Granted — limit ${res.oldLimit ?? '∞'} → ${res.newLimit ?? '∞'}.`);
      await load();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const reject = async (r: any) => {
    const reason = await ui.prompt({ title: 'Reject request', message: `Reason for rejecting ${r.companyName}'s request (shared with the company):` });
    if (reason === null) return;
    try { await api.employeeSlots.admin.rejectRequest(r.id, reason || undefined); await load(); ui.toast.success('Request rejected.'); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  return (
    <>
      {requests.length > 0 && (
        <Panel title={`Pending Slot Requests (${requests.length})`} subtitle="Companies waiting on a manual seat grant">
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50/60">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold text-ink">{r.companyName} — {r.packName || `+${r.slots} slots`}</div>
                  <div className="text-[11.5px] text-ink-muted">requested by {r.requestedBy || '—'}{r.reason ? ` · ${r.reason}` : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => approve(r)} disabled={busy}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => reject(r)} disabled={busy}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel
        title="Slot Packs"
        subtitle="Preset quick-buy buttons. Every price is quoted live from the matrix above — packs only choose the slot count."
        actions={<Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => setDraft({ name: '', slots: '' })}>Add Pack</Button>}
      >
        {draft && (
          <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-hairline bg-surface-muted/60 mb-4">
            <div className="flex-1 min-w-[180px]">
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. +50 seats" />
            </div>
            <div className="w-32">
              <label className={labelCls}>Slots</label>
              <input type="number" min={0} className={inputCls} value={draft.slots} onChange={(e) => setDraft({ ...draft, slots: e.target.value })} />
            </div>
            <Button size="sm" onClick={savePack} loading={busy}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        )}

        {packs.length === 0 ? (
          <Empty icon={<Grid3x3 size={22} />} title="No slot packs configured." hint="Companies can still buy any custom multiple of 5 seats." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {packs.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-hairline bg-surface">
                <div>
                  <div className="text-[13px] font-bold text-ink">{p.name}</div>
                  <div className="text-[11.5px] text-ink-muted tabular-nums">+{p.slots} slots{!p.isActive && ' · disabled'}</div>
                </div>
                <button onClick={() => setDraft({ id: p.id, name: p.name, slots: String(p.slots) })} className="text-[11.5px] font-semibold text-ink-secondary hover:text-ink">Edit</button>
                <button onClick={() => removePack(p)} aria-label={`Delete ${p.name}`} className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
};

// ── 6. COUPONS ───────────────────────────────────────────────────────────────
const CouponsPanel: React.FC = () => {
  const { form, set, save, loading, saving, reload } = usePlatformSettings();
  if (loading || !form) return <Loading label="Loading coupons…" />;

  const coupons: any[] = Array.isArray(form.coupons) ? form.coupons : [];
  const setC = (i: number, patch: any) => set({ coupons: coupons.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const add = () => set({ coupons: [...coupons, { code: '', description: '', discountPercent: 10, appliesTo: 'All', validUntil: '', active: true }] });
  const remove = (i: number) => set({ coupons: coupons.filter((_, j) => j !== i) });

  return (
    <Panel
      title="Coupons"
      subtitle="The discount codes your sales team may quote."
      actions={<PanelActions onReload={reload} saving={saving} onSave={() => save({
        coupons: coupons
          .filter((c) => String(c.code || '').trim())
          .map((c) => ({
            code: String(c.code).trim().toUpperCase(),
            description: c.description || '',
            discountPercent: Math.max(0, Math.min(100, Number(c.discountPercent) || 0)),
            appliesTo: c.appliesTo || 'All',
            validUntil: c.validUntil || '',
            active: !!c.active,
          })),
      }, 'Coupons saved.')} />}
    >
      {/* Honesty note: this release manages the coupon REGISTRY. Discounts are
          still applied through the per-company discount field — no pricing rule
          was changed. */}
      <div className="flex items-start gap-2 p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 mb-5">
        <AlertTriangle size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-[12.5px] text-ink-secondary">
          Coupons are maintained here as the approved list. Applying one to a company is still done by setting that company's
          <span className="font-semibold text-ink"> discount %</span> on its subscription — the pricing engine was deliberately left unchanged.
        </p>
      </div>

      {coupons.length === 0 ? (
        <Empty
          icon={<TicketPercent size={22} />}
          title="No coupons defined."
          hint="Add the codes your team is allowed to offer, with the discount each one carries."
          action={<Button size="sm" icon={<Plus size={14} />} onClick={add}>Add Coupon</Button>}
        />
      ) : (
        <div className="space-y-3">
          {coupons.map((c, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 rounded-xl border border-hairline bg-surface-muted/50">
              <div className="md:col-span-2">
                <label className={labelCls}>Code</label>
                <input className={inputCls} value={c.code || ''} onChange={(e) => setC(i, { code: e.target.value.toUpperCase() })} placeholder="WELCOME10" />
              </div>
              <div className="md:col-span-4">
                <label className={labelCls}>Description</label>
                <input className={inputCls} value={c.description || ''} onChange={(e) => setC(i, { description: e.target.value })} placeholder="First-year new customer offer" />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Discount %</label>
                <input type="number" min={0} max={100} className={inputCls} value={c.discountPercent ?? 0} onChange={(e) => setC(i, { discountPercent: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Valid Until</label>
                <input type="date" className={inputCls} value={c.validUntil || ''} onChange={(e) => setC(i, { validUntil: e.target.value })} />
              </div>
              <div className="md:col-span-2 flex items-center justify-between gap-2 pb-1">
                <label className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-secondary">
                  <Toggle on={!!c.active} onChange={(v) => setC(i, { active: v })} /> Active
                </label>
                <button onClick={() => remove(i)} aria-label="Remove coupon" className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={add}>Add Coupon</Button>
        </div>
      )}
    </Panel>
  );
};

export default SettingsTab;
