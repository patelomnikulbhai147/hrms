import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, PackagePlus, Trash2, CheckCircle2, XCircle, Users, SlidersHorizontal, Save } from 'lucide-react';
import { api } from '@/api/apiClient';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { formatDateTime } from '@/utils/formatDate';

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Super Admin → Subscription Management → Employee Slots.
 * Slot packs, pending manual requests, per-company usage, manual grant /
 * decrease, and the full slot transaction history.
 */
export const EmployeeSlotAdminTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [packs, setPacks] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [usage, setUsage] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [pkgDraft, setPkgDraft] = useState<{ id?: number; name: string; slots: string; price: string } | null>(null);
  const [adjust, setAdjust] = useState<{ companyId: string; delta: string; reason: string }>({ companyId: '', delta: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [tiers, setTiers] = useState<Array<{ upTo: string; quarterly: string; yearly: string }>>([]);
  const [savingTiers, setSavingTiers] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r, u, t, settings] = await Promise.all([
        api.employeeSlots.admin.packs(),
        api.employeeSlots.admin.requests(),
        api.employeeSlots.admin.usage(),
        api.employeeSlots.admin.transactions(),
        api.planConfig.getSettings(),
      ]);
      setPacks(p || []);
      setRequests(r || []);
      setUsage(u || []);
      setTransactions(t || []);
      setTiers((settings?.slotPricingTiers || []).map((x: any) => ({
        upTo: x.upTo == null ? '' : String(x.upTo),
        quarterly: String(x.quarterly ?? ''),
        yearly: String(x.yearly ?? ''),
      })));
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not load employee slot data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveTiers = async () => {
    setSavingTiers(true);
    try {
      const payload = tiers.map((t) => ({
        upTo: t.upTo === '' ? null : Number(t.upTo),
        quarterly: Number(t.quarterly) || 0,
        yearly: Number(t.yearly) || 0,
      }));
      await api.planConfig.updateSettings({ slotPricingTiers: payload });
      ui.toast.success('Slot pricing saved — new quotes use it immediately.');
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not save the pricing tiers.');
    } finally {
      setSavingTiers(false);
    }
  };

  useEffect(() => { loadAll(); }, [loadAll]);

  const savePack = async () => {
    if (!pkgDraft) return;
    try {
      await api.employeeSlots.admin.savePack({ id: pkgDraft.id, name: pkgDraft.name, slots: Number(pkgDraft.slots), price: Number(pkgDraft.price), isActive: true });
      setPkgDraft(null);
      setPacks(await api.employeeSlots.admin.packs());
      ui.toast.success('Slot pack saved.');
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not save the pack.');
    }
  };

  const removePack = async (p: any) => {
    const yes = await ui.confirm({ title: 'Delete pack', message: `Delete the "${p.name}" slot pack? Past purchases are unaffected.`, variant: 'danger', confirmText: 'Delete' });
    if (!yes) return;
    try {
      await api.employeeSlots.admin.deletePack(p.id);
      setPacks(await api.employeeSlots.admin.packs());
      ui.toast.success('Pack deleted.');
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not delete the pack.');
    }
  };

  const approve = async (r: any) => {
    const yes = await ui.confirm({
      title: 'Approve slot request',
      message: `Grant ${r.slots} additional employee slots to ${r.companyName}?`,
      confirmText: 'Approve & Grant',
    });
    if (!yes) return;
    setBusy(true);
    try {
      const res = await api.employeeSlots.admin.approveRequest(r.id);
      ui.toast.success(`Granted — limit ${res.oldLimit ?? '∞'} → ${res.newLimit ?? '∞'}.`);
      loadAll();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Approval failed.');
    } finally {
      setBusy(false);
    }
  };

  const reject = async (r: any) => {
    const reason = await ui.prompt({ title: 'Reject request', message: `Reason for rejecting ${r.companyName}'s request (shared with the company):` });
    if (reason === null) return;
    try {
      await api.employeeSlots.admin.rejectRequest(r.id, reason || undefined);
      ui.toast.success('Request rejected.');
      loadAll();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Rejection failed.');
    }
  };

  const submitAdjust = async () => {
    const companyId = Number(adjust.companyId);
    const delta = Number(adjust.delta);
    if (!companyId || !delta) { ui.toast.warning('Select a company and enter a non-zero slot change.'); return; }
    if (!adjust.reason.trim()) { ui.toast.warning('A reason is required for manual slot changes.'); return; }
    const yes = await ui.confirm({
      title: 'Manual slot adjustment',
      message: `${delta > 0 ? 'Add' : 'Remove'} ${Math.abs(delta)} slots ${delta > 0 ? 'to' : 'from'} company #${companyId}?`,
      confirmText: 'Apply',
    });
    if (!yes) return;
    setBusy(true);
    try {
      const res = await api.employeeSlots.admin.adjust({ companyId, delta, reason: adjust.reason.trim() });
      ui.toast.success(`Applied — limit ${res.oldLimit ?? '∞'} → ${res.newLimit ?? '∞'}.`);
      setAdjust({ companyId: '', delta: '', reason: '' });
      loadAll();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Adjustment failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold text-slate-800 inline-flex items-center gap-2"><Users className="w-4 h-4" /> Employee Slot Management</p>
        <Button variant="outline" size="sm" onClick={loadAll} icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}>Refresh</Button>
      </div>

      {/* Pending manual requests */}
      {requests.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-[12.5px] font-bold text-amber-800 mb-2">Pending Requests ({requests.length})</p>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                <div className="text-[12.5px] font-semibold text-slate-800">
                  {r.companyName} — {r.packName || `+${r.slots} slots`}
                  <span className="text-[11px] font-medium text-slate-500 ml-2">by {r.requestedBy || '—'} · {formatDateTime(r.createdAt)}</span>
                  {r.reason && <p className="text-[11.5px] font-medium text-slate-500">Note: {r.reason}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="primary" size="sm" onClick={() => approve(r)} disabled={busy} icon={<CheckCircle2 className="w-3.5 h-3.5" />}>Approve</Button>
                  <Button variant="outline" size="sm" onClick={() => reject(r)} disabled={busy} icon={<XCircle className="w-3.5 h-3.5" />}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing tier matrix — the ONLY price source for slot purchases */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <p className="text-[13px] font-bold text-slate-800">Slot Pricing Matrix (per slot, per billing cycle)</p>
        <table className="w-full max-w-2xl text-left">
          <thead><tr className="border-b border-slate-200">
            {['Tier (up to N employees; blank = unlimited)', 'Quarterly ₹/slot', 'Yearly ₹/slot'].map((h) => (
              <th key={h} className="py-1.5 pr-4 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4">
                  <input value={t.upTo} placeholder="∞" onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, upTo: e.target.value } : x))} className="w-28 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]" />
                </td>
                <td className="py-2 pr-4">
                  <input type="number" value={t.quarterly} onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, quarterly: e.target.value } : x))} className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]" />
                </td>
                <td className="py-2 pr-4">
                  <input type="number" value={t.yearly} onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, yearly: e.target.value } : x))} className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] font-medium text-slate-500">
          The tier is chosen by the company's employee limit AFTER the purchase; the rate follows the company's billing cycle. GST (CGST+SGST vs IGST) is decided by the company's billing state vs the platform's registered state in Invoice Settings.
        </p>
        <p className="text-[11px] font-medium text-slate-500 pt-1">
          Slot purchases have no minimum payment amount — the only floor is 5 slots, in multiples of 5.
        </p>
        <Button variant="primary" size="sm" onClick={saveTiers} disabled={savingTiers} icon={<Save className="w-3.5 h-3.5" />}>
          {savingTiers ? 'Saving…' : 'Save Pricing'}
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Packs (quick buttons — slots only; prices always come from the matrix) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold text-slate-800 inline-flex items-center gap-2"><PackagePlus className="w-4 h-4" /> Slot Packs</p>
            <Button variant="outline" size="sm" onClick={() => setPkgDraft({ name: '', slots: '', price: '' })}>Add Pack</Button>
          </div>
          {pkgDraft && (
            <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <label className="text-[11.5px] font-semibold text-slate-600 flex-1">Name
                <input value={pkgDraft.name} onChange={(e) => setPkgDraft({ ...pkgDraft, name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]" />
              </label>
              <label className="text-[11.5px] font-semibold text-slate-600 w-20">Slots
                <input type="number" value={pkgDraft.slots} onChange={(e) => setPkgDraft({ ...pkgDraft, slots: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]" />
              </label>
              <label className="text-[11.5px] font-semibold text-slate-600 w-28">Price (₹)
                <input type="number" value={pkgDraft.price} onChange={(e) => setPkgDraft({ ...pkgDraft, price: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]" />
              </label>
              <Button variant="primary" size="sm" onClick={savePack}>Save</Button>
              <Button variant="outline" size="sm" onClick={() => setPkgDraft(null)}>Cancel</Button>
            </div>
          )}
          <table className="w-full text-left">
            <thead><tr className="border-b border-slate-200">
              {['Quick Button', 'Slots', ''].map((h, i) => <th key={i} className="py-1.5 pr-3 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>)}
            </tr></thead>
            <tbody>
              {packs.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 text-[12.5px] font-semibold text-slate-800">{p.name}{!p.isActive && <Badge variant="gray" className="ml-2">Disabled</Badge>}</td>
                  <td className="py-2 pr-3 text-[12.5px] tabular-nums">+{p.slots}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button onClick={() => setPkgDraft({ id: p.id, name: p.name, slots: String(p.slots), price: String(p.price ?? 0) })} className="text-[11.5px] font-semibold text-slate-600 hover:text-slate-900 mr-3">Edit</button>
                    <button onClick={() => removePack(p)} className="text-[11.5px] font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] font-medium text-slate-500">
            Quick buttons offer preset slot counts; every price is quoted live from the pricing matrix above. Companies can also enter any custom multiple of 5. Totals under ₹500 route to the sales team.
          </p>
        </div>

        {/* Manual adjust */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <p className="text-[13px] font-bold text-slate-800 inline-flex items-center gap-2"><SlidersHorizontal className="w-4 h-4" /> Manual Grant / Decrease</p>
          <label className="text-[11.5px] font-semibold text-slate-600 block">Company
            <select value={adjust.companyId} onChange={(e) => setAdjust({ ...adjust, companyId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]">
              <option value="">Select a company…</option>
              {usage.map((u) => <option key={u.companyId} value={u.companyId}>{u.companyName} ({u.used}/{u.unlimited ? '∞' : u.limit})</option>)}
            </select>
          </label>
          <label className="text-[11.5px] font-semibold text-slate-600 block">Slot change (negative to decrease purchased slots)
            <input type="number" value={adjust.delta} onChange={(e) => setAdjust({ ...adjust, delta: e.target.value })} placeholder="e.g. 10 or -5" className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]" />
          </label>
          <label className="text-[11.5px] font-semibold text-slate-600 block">Reason (required, audited)
            <input value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]" />
          </label>
          <Button variant="primary" size="sm" onClick={submitAdjust} disabled={busy}>Apply Adjustment</Button>
          <p className="text-[11px] font-medium text-slate-500">Adjustments change purchased add-on slots only — the base plan limit is never modified here. Purchased slots cannot go below zero.</p>
        </div>
      </div>

      {/* Usage */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
        <p className="text-[12px] font-bold text-slate-700 mb-2">Slot Usage by Company</p>
        <table className="w-full min-w-[640px] text-left">
          <thead><tr className="border-b border-slate-200">
            {['Company', 'Plan', 'Base Plan', 'Extra Purchased', 'Current Limit', 'Slots Used', 'Remaining'].map((h) => (
              <th key={h} className="py-1.5 pr-4 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {usage.map((u) => (
              <tr key={u.companyId} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-4 text-[12px] font-semibold text-slate-800">{u.companyName}</td>
                <td className="py-1.5 pr-4 text-[12px]">{u.plan}</td>
                <td className="py-1.5 pr-4 text-[12px] tabular-nums">{u.unlimited ? '∞' : u.baseLimit}</td>
                <td className="py-1.5 pr-4 text-[12px] tabular-nums">{u.extraSlots || 0}</td>
                <td className="py-1.5 pr-4 text-[12px] font-semibold tabular-nums">{u.unlimited ? '∞' : u.limit}</td>
                <td className="py-1.5 pr-4 text-[12px] tabular-nums">{u.used}</td>
                <td className={`py-1.5 pr-4 text-[12px] font-semibold tabular-nums ${!u.unlimited && u.remaining === 0 ? 'text-red-600' : 'text-emerald-700'}`}>{u.unlimited ? '∞' : u.remaining}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Transactions */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
        <p className="text-[12px] font-bold text-slate-700 mb-2">Slot Purchase & Change History</p>
        <table className="w-full min-w-[760px] text-left">
          <thead><tr className="border-b border-slate-200">
            {['Date', 'Company', 'Type', 'Slots', 'Amount', 'Limit Change', 'Status', 'By'].map((h) => (
              <th key={h} className="py-1.5 pr-4 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {transactions.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-[12.5px] font-medium text-slate-500">No slot transactions yet.</td></tr>}
            {transactions.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-4 text-[11.5px] font-medium text-slate-500 whitespace-nowrap tabular-nums">{formatDateTime(t.createdAt)}</td>
                <td className="py-1.5 pr-4 text-[12px] font-semibold text-slate-800">{t.companyName}</td>
                <td className="py-1.5 pr-4 text-[12px] whitespace-nowrap">{t.type.replace(/_/g, ' ')}{t.packName ? ` — ${t.packName}` : ''}</td>
                <td className="py-1.5 pr-4 text-[12px] font-semibold tabular-nums">{t.slots > 0 ? `+${t.slots}` : t.slots}</td>
                <td className="py-1.5 pr-4 text-[12px] tabular-nums whitespace-nowrap">{t.amount != null ? inr(t.amount) : '—'}</td>
                <td className="py-1.5 pr-4 text-[12px] tabular-nums whitespace-nowrap">{t.oldLimit != null && t.newLimit != null ? `${t.oldLimit} → ${t.newLimit}` : '—'}</td>
                <td className="py-1.5 pr-4"><Badge variant={t.status === 'REJECTED' ? 'danger' : t.status === 'REQUESTED' ? 'warning' : 'green'}>{t.status}</Badge></td>
                <td className="py-1.5 pr-4 text-[11.5px] font-medium text-slate-600">{t.actionedBy || t.requestedBy || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EmployeeSlotAdminTab;
