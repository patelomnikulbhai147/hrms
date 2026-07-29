import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw, IndianRupee, TrendingUp, PackagePlus, Save, Trash2, CheckCircle2, FileDown, AlertTriangle, Settings2, ListOrdered, Undo2,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { formatDateTime } from '@/utils/formatDate';

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const ORDER_BADGE: Record<string, any> = {
  PAID: 'green', ACTIVE: 'warning', CREATED: 'warning', FAILED: 'danger', EXPIRED: 'gray',
  CANCELLED: 'gray', USER_DROPPED: 'gray', REFUNDED: 'warning', FLAGGED: 'danger',
};

/**
 * Super Admin → Payments & Pricing panel for the self-service recharge system.
 * The ONLY surface where provider cost / margin figures are rendered — every
 * endpoint behind it is hard-gated to Super Admin on the server.
 */
export const RechargeAdminPanel: React.FC = () => {
  const [section, setSection] = useState<'overview' | 'orders' | 'settings' | 'refunds'>('overview');
  const [loading, setLoading] = useState(false);

  const [dash, setDash] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderFilter, setOrderFilter] = useState<{ status: string; search: string }>({ status: '', search: '' });
  const [settings, setSettings] = useState<any | null>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [pkgDraft, setPkgDraft] = useState<{ id?: number; name: string; amount: string } | null>(null);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [d, o, s, p, r] = await Promise.all([
        api.recharge.admin.dashboard(),
        api.recharge.admin.orders({ page: 1, pageSize: 50, ...(orderFilter.status ? { status: orderFilter.status } : {}), ...(orderFilter.search ? { search: orderFilter.search } : {}) }),
        api.recharge.admin.settings(),
        api.recharge.admin.packages(),
        api.recharge.admin.refunds({ page: 1, pageSize: 50 }),
      ]);
      setDash(d);
      setOrders(o?.orders || []);
      setSettings(s);
      setPackages(p || []);
      setRefunds(r?.refunds || []);
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not load payment data.');
    } finally {
      setLoading(false);
    }
  }, [orderFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const updated = await api.recharge.admin.updateSettings({
        enableOnlineRecharge: settings.enableOnlineRecharge,
        sellingPricePerCredit: Number(settings.sellingPricePerCredit),
        providerCostPerCredit: Number(settings.providerCostPerCredit),
        minRechargeAmount: Number(settings.minRechargeAmount),
        maxRechargeAmount: Number(settings.maxRechargeAmount),
        gstEnabled: settings.gstEnabled,
        gstPercent: Number(settings.gstPercent),
        autoCreditAllocation: settings.autoCreditAllocation,
        roundOffPolicy: settings.roundOffPolicy,
      });
      setSettings(updated);
      ui.toast.success('Recharge pricing settings saved.');
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not save the settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const savePkg = async () => {
    if (!pkgDraft) return;
    try {
      await api.recharge.admin.savePackage({ id: pkgDraft.id, name: pkgDraft.name, amount: Number(pkgDraft.amount), isActive: true });
      setPkgDraft(null);
      setPackages(await api.recharge.admin.packages());
      ui.toast.success('Package saved.');
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not save the package.');
    }
  };

  const removePkg = async (pkg: any) => {
    const yes = await ui.confirm({ title: 'Delete package', message: `Delete the "${pkg.name}" recharge package? Existing orders are not affected.`, variant: 'danger', confirmText: 'Delete' });
    if (!yes) return;
    try {
      await api.recharge.admin.deletePackage(pkg.id);
      setPackages(await api.recharge.admin.packages());
      ui.toast.success('Package deleted.');
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not delete the package.');
    }
  };

  const approveOrder = async (o: any) => {
    const yes = await ui.confirm({
      title: 'Approve recharge',
      message: `Add ${o.creditsPurchased} verification credits to ${o.companyName} for paid order ${o.orderId}?`,
      confirmText: 'Approve & Add Credits',
    });
    if (!yes) return;
    setBusyOrder(o.orderId);
    try {
      await api.recharge.admin.approveOrder(o.orderId);
      ui.toast.success('Credits allocated.');
      loadAll();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Approval failed.');
    } finally {
      setBusyOrder(null);
    }
  };

  const reverifyOrder = async (o: any) => {
    setBusyOrder(o.orderId);
    try {
      const res = await api.recharge.admin.reverifyOrder(o.orderId);
      ui.toast.info(`Verification result: ${res.outcome}`);
      loadAll();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Re-verification failed.');
    } finally {
      setBusyOrder(null);
    }
  };

  const markRefundHandled = async (r: any) => {
    const yes = await ui.confirm({
      title: 'Mark refund as handled',
      message: 'Confirm you have reviewed this refund and made any manual credit adjustment needed. (Credits are never removed automatically.)',
      confirmText: 'Mark Handled',
    });
    if (!yes) return;
    try {
      await api.recharge.admin.markRefundAdjusted(r.id);
      setRefunds((await api.recharge.admin.refunds({ page: 1, pageSize: 50 }))?.refunds || []);
      ui.toast.success('Refund marked as handled.');
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not update the refund.');
    }
  };

  const Kpi = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] font-medium text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );

  const SectionBtn = ({ id, icon, label }: { id: typeof section; icon: React.ReactNode; label: string }) => (
    <button
      onClick={() => setSection(id)}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold transition ${
        section === id ? 'bg-[#C77E52] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SectionBtn id="overview" icon={<TrendingUp className="w-3.5 h-3.5" />} label="Revenue Overview" />
          <SectionBtn id="orders" icon={<ListOrdered className="w-3.5 h-3.5" />} label={`Payment Orders${dash?.awaitingApproval ? ` (${dash.awaitingApproval} to approve)` : ''}`} />
          <SectionBtn id="settings" icon={<Settings2 className="w-3.5 h-3.5" />} label="Pricing & Packages" />
          <SectionBtn id="refunds" icon={<Undo2 className="w-3.5 h-3.5" />} label={`Refunds (${refunds.length})`} />
        </div>
        <Button variant="outline" size="sm" onClick={loadAll} icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}>Refresh</Button>
      </div>

      {section === 'overview' && dash && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Total Revenue" value={inr(dash.totalRevenue)} sub={`${dash.settledOrders} settled orders`} />
            <Kpi label="Platform Margin" value={inr(dash.totalMargin)} sub="revenue − provider cost" />
            <Kpi label="Credits Sold" value={Number(dash.creditsSold).toLocaleString('en-IN')} />
            <Kpi label="GST Collected" value={inr(dash.totalGstCollected)} />
            <Kpi label="Today" value={inr(dash.todayRevenue)} sub={`${dash.todayOrders} orders`} />
            <Kpi label="This Month" value={inr(dash.monthRevenue)} sub={`${dash.monthOrders} orders`} />
            <Kpi label="Pending / Failed" value={`${dash.pendingOrders} / ${dash.failedOrders}`} sub={dash.flaggedOrders ? `${dash.flaggedOrders} flagged` : undefined} />
            <Kpi label="Refunds" value={`${dash.refunds.count}`} sub={inr(dash.refunds.amount)} />
          </div>

          {dash.monthlyRevenue?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
              <p className="text-[12px] font-bold text-slate-700 mb-2">Monthly Revenue (last 12 months)</p>
              <table className="w-full min-w-[520px] text-left">
                <thead><tr className="border-b border-slate-200">
                  {['Month', 'Orders', 'Credits', 'Revenue', 'Margin'].map((h) => <th key={h} className="py-1.5 pr-4 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>)}
                </tr></thead>
                <tbody>{dash.monthlyRevenue.map((m: any) => (
                  <tr key={m.month} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pr-4 text-[12px] font-semibold text-slate-800">{m.month}</td>
                    <td className="py-1.5 pr-4 text-[12px] tabular-nums">{m.orders}</td>
                    <td className="py-1.5 pr-4 text-[12px] tabular-nums">{m.credits.toLocaleString('en-IN')}</td>
                    <td className="py-1.5 pr-4 text-[12px] font-semibold tabular-nums">{inr(m.revenue)}</td>
                    <td className="py-1.5 pr-4 text-[12px] font-semibold text-emerald-700 tabular-nums">{inr(m.margin)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {dash.topCompanies?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
              <p className="text-[12px] font-bold text-slate-700 mb-2">Top Purchasing Companies</p>
              <table className="w-full min-w-[480px] text-left">
                <thead><tr className="border-b border-slate-200">
                  {['Company', 'Orders', 'Credits Purchased', 'Revenue'].map((h) => <th key={h} className="py-1.5 pr-4 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>)}
                </tr></thead>
                <tbody>{dash.topCompanies.map((c: any) => (
                  <tr key={c.companyId} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pr-4 text-[12px] font-semibold text-slate-800">{c.companyName}</td>
                    <td className="py-1.5 pr-4 text-[12px] tabular-nums">{c.orders}</td>
                    <td className="py-1.5 pr-4 text-[12px] tabular-nums">{c.credits.toLocaleString('en-IN')}</td>
                    <td className="py-1.5 pr-4 text-[12px] font-semibold tabular-nums">{inr(c.revenue)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === 'orders' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={orderFilter.status}
              onChange={(e) => setOrderFilter((f) => ({ ...f, status: e.target.value }))}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] font-medium"
            >
              <option value="">All statuses</option>
              {['ACTIVE', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'FLAGGED'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              value={orderFilter.search}
              onChange={(e) => setOrderFilter((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search order / payment / user…"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] font-medium w-64"
            />
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left">
                <thead><tr className="bg-slate-50 border-b border-slate-200">
                  {['Date', 'Company', 'Order ID', 'Amount', 'Credits', 'Margin', 'Status', 'Settlement', 'Actions'].map((h) => (
                    <th key={h} className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-[12.5px] font-medium text-slate-500">No payment orders yet.</td></tr>
                  )}
                  {orders.map((o) => (
                    <tr key={o.orderId} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2.5 text-[11.5px] font-medium text-slate-500 whitespace-nowrap tabular-nums">{formatDateTime(o.createdAt)}</td>
                      <td className="px-3 py-2.5 text-[12px] font-semibold text-slate-800 truncate max-w-[160px]">{o.companyName}</td>
                      <td className="px-3 py-2.5 text-[11px] font-mono text-slate-600 whitespace-nowrap">{o.orderId}</td>
                      <td className="px-3 py-2.5 text-[12px] font-semibold tabular-nums whitespace-nowrap">{inr(o.totalAmount)}</td>
                      <td className="px-3 py-2.5 text-[12px] tabular-nums">{o.creditsPurchased}</td>
                      <td className="px-3 py-2.5 text-[12px] font-semibold text-emerald-700 tabular-nums whitespace-nowrap">{inr(o.marginAmount)}</td>
                      <td className="px-3 py-2.5"><Badge variant={ORDER_BADGE[o.status] || 'gray'}>{o.status}</Badge></td>
                      <td className="px-3 py-2.5"><Badge variant={o.settlementStatus === 'CREDITED' ? 'green' : o.settlementStatus === 'AWAITING_APPROVAL' ? 'blue' : 'gray'}>{o.settlementStatus}</Badge></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {o.settlementStatus === 'AWAITING_APPROVAL' && (
                            <Button variant="primary" size="sm" onClick={() => approveOrder(o)} disabled={busyOrder === o.orderId} icon={<CheckCircle2 className="w-3.5 h-3.5" />}>Approve</Button>
                          )}
                          {o.settlementStatus !== 'CREDITED' && ['CREATED', 'ACTIVE', 'PAID'].includes(o.status) && (
                            <Button variant="outline" size="sm" onClick={() => reverifyOrder(o)} disabled={busyOrder === o.orderId} icon={<RefreshCw className={`w-3.5 h-3.5 ${busyOrder === o.orderId ? 'animate-spin' : ''}`} />}>Re-verify</Button>
                          )}
                          {o.settlementStatus === 'CREDITED' && !o.invoiceId && (
                            <Button variant="outline" size="sm" onClick={async () => { try { await api.recharge.admin.regenerateInvoice(o.orderId); ui.toast.success('Invoice generated.'); loadAll(); } catch (e: any) { ui.toast.error(e?.message || 'Failed.'); } }} icon={<FileDown className="w-3.5 h-3.5" />}>Invoice</Button>
                          )}
                          {o.status === 'FLAGGED' && (
                            <span title={o.flagReason || 'Flagged'}><AlertTriangle className="w-4 h-4 text-red-500" /></span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {section === 'settings' && settings && (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-slate-800 inline-flex items-center gap-2"><IndianRupee className="w-4 h-4" /> Verification Pricing</p>
              <Badge variant={settings.gatewayConfigured ? 'green' : 'danger'}>
                {settings.gatewayConfigured ? `Gateway Configured (${settings.gatewayMode})` : 'Gateway not configured'}
              </Badge>
            </div>
            {!settings.gatewayConfigured && (
              <div className="text-[11.5px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
                <p className="font-semibold">Cashfree Payment Gateway credentials are not configured.</p>
                <p>
                  {settings.gatewayStatus?.hint ||
                    `Add the ${settings.gatewayMode === 'production' ? 'production' : 'sandbox'} Payment Gateway keypair to backend/.env and restart the backend.`}
                </p>
                <p className="text-red-600">
                  Online recharge stays unavailable to companies until the gateway is configured, even with the toggle below switched on.
                </p>
              </div>
            )}
            <label className="flex items-center justify-between gap-3 text-[12.5px] font-semibold text-slate-700">
              Enable Online Recharge
              <input type="checkbox" checked={!!settings.enableOnlineRecharge} onChange={(e) => setSettings({ ...settings, enableOnlineRecharge: e.target.checked })} className="w-4 h-4 accent-[#C77E52]" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['sellingPricePerCredit', 'Selling Price / Verification (₹)'],
                ['providerCostPerCredit', 'Provider Cost / Verification (₹) — internal'],
                ['minRechargeAmount', 'Minimum Recharge (₹)'],
                ['maxRechargeAmount', 'Maximum Recharge (₹)'],
                ['gstPercent', 'GST %'],
              ].map(([key, label]) => (
                <label key={key} className="text-[11.5px] font-semibold text-slate-600">
                  {label}
                  <input
                    type="number"
                    step="0.01"
                    value={settings[key] ?? ''}
                    onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] font-medium"
                  />
                </label>
              ))}
              <label className="text-[11.5px] font-semibold text-slate-600">
                Round-off Policy
                <select value={settings.roundOffPolicy} onChange={(e) => setSettings({ ...settings, roundOffPolicy: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] font-medium">
                  <option value="FLOOR">Floor (round credits down)</option>
                  <option value="ROUND">Round to nearest</option>
                </select>
              </label>
            </div>
            <label className="flex items-center justify-between gap-3 text-[12.5px] font-semibold text-slate-700">
              GST Enabled
              <input type="checkbox" checked={!!settings.gstEnabled} onChange={(e) => setSettings({ ...settings, gstEnabled: e.target.checked })} className="w-4 h-4 accent-[#C77E52]" />
            </label>
            <label className="flex items-center justify-between gap-3 text-[12.5px] font-semibold text-slate-700">
              Automatic Credit Allocation
              <input type="checkbox" checked={!!settings.autoCreditAllocation} onChange={(e) => setSettings({ ...settings, autoCreditAllocation: e.target.checked })} className="w-4 h-4 accent-[#C77E52]" />
            </label>
            {!settings.autoCreditAllocation && (
              <p className="text-[11.5px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Manual mode: paid recharges wait in Payment Orders for your approval before credits are added.
              </p>
            )}
            <Button variant="primary" onClick={saveSettings} disabled={savingSettings} icon={<Save className="w-4 h-4" />}>
              {savingSettings ? 'Saving…' : 'Save Pricing Settings'}
            </Button>
            <p className="text-[11px] font-medium text-slate-500">
              Company users only ever see “amount → credits”. The selling price, provider cost and margin never appear in company-facing screens.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-slate-800 inline-flex items-center gap-2"><PackagePlus className="w-4 h-4" /> Recharge Packages</p>
              <Button variant="outline" size="sm" onClick={() => setPkgDraft({ name: '', amount: '' })}>Add Package</Button>
            </div>
            {pkgDraft && (
              <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <label className="text-[11.5px] font-semibold text-slate-600 flex-1">
                  Name
                  <input value={pkgDraft.name} onChange={(e) => setPkgDraft({ ...pkgDraft, name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]" />
                </label>
                <label className="text-[11.5px] font-semibold text-slate-600 w-32">
                  Amount (₹)
                  <input type="number" value={pkgDraft.amount} onChange={(e) => setPkgDraft({ ...pkgDraft, amount: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]" />
                </label>
                <Button variant="primary" size="sm" onClick={savePkg}>Save</Button>
                <Button variant="outline" size="sm" onClick={() => setPkgDraft(null)}>Cancel</Button>
              </div>
            )}
            <table className="w-full text-left">
              <thead><tr className="border-b border-slate-200">
                {['Package', 'Amount', 'Credits at current price', ''].map((h, i) => <th key={i} className="py-1.5 pr-3 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>)}
              </tr></thead>
              <tbody>
                {packages.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 text-[12.5px] font-semibold text-slate-800">{p.name}</td>
                    <td className="py-2 pr-3 text-[12.5px] tabular-nums">{inr(p.amount)}</td>
                    <td className="py-2 pr-3 text-[12.5px] font-semibold text-emerald-700 tabular-nums">
                      {settings.sellingPricePerCredit > 0 ? Math.floor(p.amount / settings.sellingPricePerCredit).toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button onClick={() => setPkgDraft({ id: p.id, name: p.name, amount: String(p.amount) })} className="text-[11.5px] font-semibold text-slate-600 hover:text-slate-900 mr-3">Edit</button>
                      <button onClick={() => removePkg(p)} className="text-[11.5px] font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] font-medium text-slate-500">
              Packages store an amount only — the credit count always follows the current selling price, so a price change updates every package consistently.
            </p>
          </div>
        </div>
      )}

      {section === 'refunds' && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead><tr className="bg-slate-50 border-b border-slate-200">
                {['Date', 'Order ID', 'Company', 'Amount', 'Gateway Status', 'Handled', ''].map((h, i) => (
                  <th key={i} className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {refunds.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-[12.5px] font-medium text-slate-500">No refunds recorded. Gateway refunds appear here and NEVER remove credits automatically.</td></tr>
                )}
                {refunds.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2.5 text-[11.5px] font-medium text-slate-500 whitespace-nowrap tabular-nums">{formatDateTime(r.createdAt)}</td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-slate-600 whitespace-nowrap">{r.orderId}</td>
                    <td className="px-3 py-2.5 text-[12px] font-semibold text-slate-800">#{r.companyId}</td>
                    <td className="px-3 py-2.5 text-[12px] font-semibold tabular-nums">{inr(r.amount)}</td>
                    <td className="px-3 py-2.5"><Badge variant="warning">{r.status}</Badge></td>
                    <td className="px-3 py-2.5">
                      {r.creditsAdjusted
                        ? <Badge variant="green">Handled by {r.adjustedBy || '—'}</Badge>
                        : <Badge variant="danger">Needs review</Badge>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {!r.creditsAdjusted && (
                        <Button variant="outline" size="sm" onClick={() => markRefundHandled(r)}>Mark Handled</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default RechargeAdminPanel;
