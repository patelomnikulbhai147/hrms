import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft, Users, TrendingUp, IndianRupee, Building2, Layers, CalendarClock,
  CreditCard, ShieldCheck, History, Save, RefreshCw, FlaskConical,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { authStorage } from '@/utils/authStorage';
import { getApiErrorMessage } from '@/utils/apiError';

interface Props {
  /** Companies already loaded by the parent Billing page (used for the non-super fallback). */
  companies: any[];
  onBack: () => void;
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const STATUS_OPTIONS = ['Active', 'Suspended', 'Cancelled'];
const PAYMENT_OPTIONS = ['Paid', 'Pending', 'Overdue'];

/**
 * NEW Employee-Based Subscription System (Beta).
 *
 * A completely separate page from the existing Billing/Subscription module — it
 * reads only the new `/api/employee-subscription` endpoints and never touches the
 * production subscription system. Billing model:
 *   monthly = peakEmployeeCount × employeePrice + purchasedBranchSlots × branchPrice − discount
 */
export const EmployeeSubscription: React.FC<Props> = ({ companies, onBack }) => {
  const role = useMemo(() => {
    try { return JSON.parse(authStorage.get('hrms_profile') || '{}').role || ''; } catch { return ''; }
  }, []);
  const isSuper = role === 'Super Admin';

  const [boards, setBoards] = useState<any[]>([]);     // all companies (super) or [own] (others)
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Global default pricing (Super Admin)
  const [defEmp, setDefEmp] = useState('');
  const [defBranch, setDefBranch] = useState('');
  const [defReason, setDefReason] = useState('');

  // Per-company override form (Super Admin)
  const emptyOverride = { employeePrice: '', branchPrice: '', peakEmployeeCount: '', purchasedBranchSlots: '', discountPercent: '', status: 'Active', paymentStatus: 'Pending', validUntil: '', reason: '' };
  const [ovr, setOvr] = useState<any>(emptyOverride);

  const selected = useMemo(() => boards.find(b => b.companyId === selectedId) || null, [boards, selectedId]);

  const loadAudit = useCallback(async (companyId?: number | null) => {
    try { setAudit(await api.employeeSubscription.getAudit(companyId || undefined) || []); } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await api.employeeSubscription.getConfig().catch(() => null);
      if (cfg) { setDefEmp(String(cfg.employeePrice)); setDefBranch(String(cfg.branchPrice)); }

      let list: any[] = [];
      if (isSuper) {
        list = await api.employeeSubscription.list().catch(() => []);
      } else {
        // Non-super fallback: only a real (numeric) backend company id works.
        const own = companies.find(c => /^\d+$/.test(String(c.id)));
        if (own) { const d = await api.employeeSubscription.getDashboard(own.id).catch(() => null); if (d) list = [d]; }
      }
      setBoards(list);
      setSelectedId(prev => (prev && list.some(b => b.companyId === prev)) ? prev : (list[0]?.companyId ?? null));
      await loadAudit(null);
    } catch (e: any) { ui.toast.error(getApiErrorMessage(e, 'Could not load subscription data.')); }
    finally { setLoading(false); }
  }, [isSuper, companies, loadAudit]);

  useEffect(() => { load(); }, [load]);

  // Hydrate the override form whenever the selected company changes.
  useEffect(() => {
    if (!selected) { setOvr(emptyOverride); return; }
    setOvr({
      employeePrice: selected.usesGlobalEmployeePrice ? '' : String(selected.employeePrice),
      branchPrice: selected.usesGlobalBranchPrice ? '' : String(selected.branchPrice),
      peakEmployeeCount: String(selected.peakEmployeeCount),
      purchasedBranchSlots: String(selected.purchasedBranchSlots),
      discountPercent: String(selected.discountPercent || 0),
      status: selected.status || 'Active',
      paymentStatus: selected.paymentStatus || 'Pending',
      validUntil: selected.validUntil ? String(selected.validUntil).slice(0, 10) : '',
      reason: '',
    });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveDefaults = async () => {
    if (!isSuper) return;
    setBusy(true);
    try {
      await api.employeeSubscription.updateConfig({ employeePrice: Number(defEmp), branchPrice: Number(defBranch), reason: defReason || 'Global default pricing update' });
      setDefReason('');
      ui.toast.success('Global default pricing updated.');
      await load();
    } catch (e: any) { ui.toast.error(getApiErrorMessage(e, 'Could not update defaults.')); }
    finally { setBusy(false); }
  };

  const saveOverride = async () => {
    if (!isSuper || !selected) return;
    setBusy(true);
    try {
      await api.employeeSubscription.update(selected.companyId, {
        employeePrice: ovr.employeePrice === '' ? null : Number(ovr.employeePrice),
        branchPrice: ovr.branchPrice === '' ? null : Number(ovr.branchPrice),
        peakEmployeeCount: ovr.peakEmployeeCount,
        purchasedBranchSlots: ovr.purchasedBranchSlots,
        discountPercent: ovr.discountPercent,
        status: ovr.status,
        paymentStatus: ovr.paymentStatus,
        validUntil: ovr.validUntil || null,
        reason: ovr.reason || 'Subscription update',
      });
      ui.toast.success(`Subscription updated for ${selected.companyName}.`);
      await load(); await loadAudit(null);
    } catch (e: any) { ui.toast.error(getApiErrorMessage(e, 'Could not update subscription.')); }
    finally { setBusy(false); }
  };

  const Stat: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; tone?: string; hint?: string }> = ({ icon, label, value, tone = 'text-slate-700', hint }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{icon}{label}</div>
      <p className={`mt-1.5 text-2xl font-extrabold ${tone}`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition"><ChevronLeft size={15} /> Back to Subscription</button>
          <div className="h-4 w-px bg-slate-200" />
          <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-800"><FlaskConical size={17} className="text-indigo-600" /> Employee-Based Subscription
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-700">Beta</span>
          </h2>
        </div>
        <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} onClick={load} loading={loading}>Refresh</Button>
      </div>

      <p className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3.5 py-2 text-[11px] text-indigo-700">
        <strong>Beta / development model.</strong> This runs alongside — and does not affect — the current production subscription system.
        Monthly charge = <strong>Peak Active Employees × Employee Price</strong> + <strong>Purchased Branch Slots × Branch Price</strong> − discount.
      </p>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading subscription data…</div>
      ) : boards.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">No companies available for the beta subscription view.</div>
      ) : (
        <>
          {/* Company selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500">Company:</span>
            <select value={selectedId ?? ''} onChange={e => setSelectedId(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              {boards.map(b => <option key={b.companyId} value={b.companyId}>{b.companyName}</option>)}
            </select>
            {selected && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selected.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : selected.status === 'Suspended' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{selected.status}</span>
            )}
          </div>

          {selected && (
            <>
              {/* Dashboard */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <Stat icon={<Users size={12} />} label="Current Active" value={selected.currentActiveEmployees} hint="status = Active only" />
                <Stat icon={<TrendingUp size={12} />} label="Peak Activated" value={selected.peakEmployeeCount} tone="text-indigo-700" hint="never auto-decreases" />
                <Stat icon={<IndianRupee size={12} />} label="Employee Price" value={inr(selected.employeePrice)} hint={selected.usesGlobalEmployeePrice ? 'global default' : 'company override'} />
                <Stat icon={<IndianRupee size={12} />} label="Employee Charges" value={inr(selected.employeeCharges)} tone="text-slate-800" />
                <Stat icon={<Layers size={12} />} label="Purchased Slots" value={selected.purchasedBranchSlots} />
                <Stat icon={<Building2 size={12} />} label="Used Slots" value={selected.usedBranchSlots} />
                <Stat icon={<Layers size={12} />} label="Remaining Slots" value={selected.remainingBranchSlots} tone={selected.remainingBranchSlots <= 0 ? 'text-rose-600' : 'text-emerald-600'} />
                <Stat icon={<IndianRupee size={12} />} label="Branch Price" value={inr(selected.branchPrice)} hint={selected.usesGlobalBranchPrice ? 'global default' : 'company override'} />
                <Stat icon={<IndianRupee size={12} />} label="Branch Charges" value={inr(selected.branchCharges)} tone="text-slate-800" />
                <Stat icon={<CalendarClock size={12} />} label="Expiry" value={selected.validUntil ? String(selected.validUntil).slice(0, 10) : '—'} />
                <Stat icon={<CreditCard size={12} />} label="Payment" value={selected.paymentStatus} tone={selected.paymentStatus === 'Paid' ? 'text-emerald-600' : selected.paymentStatus === 'Overdue' ? 'text-rose-600' : 'text-amber-600'} />
                <Stat icon={<IndianRupee size={12} />} label="Total Monthly" value={inr(selected.totalMonthly)} tone="text-indigo-700" hint={selected.discountAmount ? `after −${inr(selected.discountAmount)} discount` : undefined} />
              </div>

              {/* Formula breakdown */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-600">
                <span className="font-bold text-slate-700">{selected.peakEmployeeCount}</span> × {inr(selected.employeePrice)} +{' '}
                <span className="font-bold text-slate-700">{selected.purchasedBranchSlots}</span> × {inr(selected.branchPrice)}
                {selected.discountPercent ? <> − {selected.discountPercent}% discount</> : null} ={' '}
                <span className="font-extrabold text-indigo-700">{inr(selected.totalMonthly)}</span> / month
              </div>

              {/* Super Admin controls */}
              {isSuper ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Global defaults */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3"><ShieldCheck size={15} className="text-indigo-600" /> Global Default Pricing</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Default Employee Price (₹)" type="number" value={defEmp} onChange={e => setDefEmp(e.target.value)} />
                      <Input label="Default Branch Price (₹)" type="number" value={defBranch} onChange={e => setDefBranch(e.target.value)} />
                    </div>
                    <Input label="Reason (for audit)" value={defReason} onChange={e => setDefReason(e.target.value)} placeholder="Why is the default changing?" />
                    <div className="flex justify-end mt-3"><Button size="sm" icon={<Save size={13} />} loading={busy} onClick={saveDefaults}>Save Defaults</Button></div>
                    <p className="text-[10px] text-slate-400 mt-2">Applies to every company that has no per-company override.</p>
                  </div>

                  {/* Company override */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3"><Building2 size={15} className="text-indigo-600" /> {selected.companyName} — Overrides</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Employee Price (blank = default)" type="number" value={ovr.employeePrice} onChange={e => setOvr({ ...ovr, employeePrice: e.target.value })} placeholder={`${selected.defaults.employeePrice}`} />
                      <Input label="Branch Price (blank = default)" type="number" value={ovr.branchPrice} onChange={e => setOvr({ ...ovr, branchPrice: e.target.value })} placeholder={`${selected.defaults.branchPrice}`} />
                      <Input label="Peak Employee Count (manual)" type="number" value={ovr.peakEmployeeCount} onChange={e => setOvr({ ...ovr, peakEmployeeCount: e.target.value })} />
                      <Input label="Purchased Branch Slots" type="number" value={ovr.purchasedBranchSlots} onChange={e => setOvr({ ...ovr, purchasedBranchSlots: e.target.value })} />
                      <Input label="Discount (%)" type="number" value={ovr.discountPercent} onChange={e => setOvr({ ...ovr, discountPercent: e.target.value })} />
                      <Input label="Valid Until" type="date" value={ovr.validUntil} onChange={e => setOvr({ ...ovr, validUntil: e.target.value })} />
                      <Select label="Status" value={ovr.status} onChange={e => setOvr({ ...ovr, status: e.target.value })} options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))} />
                      <Select label="Payment Status" value={ovr.paymentStatus} onChange={e => setOvr({ ...ovr, paymentStatus: e.target.value })} options={PAYMENT_OPTIONS.map(s => ({ value: s, label: s }))} />
                    </div>
                    <Input label="Reason (for audit)" value={ovr.reason} onChange={e => setOvr({ ...ovr, reason: e.target.value })} placeholder="Why is this changing?" />
                    <div className="flex justify-end mt-3"><Button size="sm" icon={<Save size={13} />} loading={busy} onClick={saveOverride}>Save Changes</Button></div>
                    <p className="text-[10px] text-slate-400 mt-2">Per-company pricing is isolated — changing one company never affects another.</p>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-[11px] text-slate-500">Pricing, branch-slot allocation and subscription settings are managed by the Super Admin.</p>
              )}

              {/* Audit trail */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3"><History size={15} className="text-indigo-600" /> Billing Audit Trail</h3>
                {audit.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">No billing changes recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead><tr className="text-[10px] uppercase tracking-wider text-slate-400">
                        <th className="py-1.5 pr-3">Date</th><th className="py-1.5 pr-3">Company</th><th className="py-1.5 pr-3">Field</th><th className="py-1.5 pr-3">Old → New</th><th className="py-1.5 pr-3">By</th><th className="py-1.5">Reason</th>
                      </tr></thead>
                      <tbody>
                        {audit.slice(0, 50).map(a => (
                          <tr key={a.id} className="border-t border-slate-100">
                            <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{String(a.createdAt).slice(0, 10)}</td>
                            <td className="py-1.5 pr-3 text-slate-700">{a.companyName || '—'}</td>
                            <td className="py-1.5 pr-3 font-semibold text-slate-700">{a.field}</td>
                            <td className="py-1.5 pr-3 text-slate-600"><span className="text-rose-500">{a.oldValue ?? '—'}</span> → <span className="text-emerald-600">{a.newValue ?? '—'}</span></td>
                            <td className="py-1.5 pr-3 text-slate-500">{a.changedBy || '—'}</td>
                            <td className="py-1.5 text-slate-500">{a.reason || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default EmployeeSubscription;
