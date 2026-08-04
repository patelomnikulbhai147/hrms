// ─────────────────────────────────────────────────────────────────────────────
// PLANS — the master configuration for what every plan costs and unlocks.
//
// Editing a plan here re-permissions every company on it on their next request,
// with no code change: the permission engine reads these records live. Plans are
// stored in the backend plan master store (backend/data/planDefinitions.json).
//
// The editor covers, in order: Plan Information · Billing Cycles & Pricing ·
// Employee Limits · Verification Credits · Module Access · Report Access ·
// Usage Limits · Features.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Pencil, Trash2, Crown, Check, Lock, RefreshCw, Users2, FileBarChart2,
  Building, HardDrive, Save, X, Sparkles, ShieldCheck, CalendarRange, Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { Panel, Loading, Empty, inr, num, inputCls, labelCls, Toggle } from './kit';

const numOrDash = (n: any) => (n === -1 || n === '-1' ? 'Unlimited' : (n === null || n === undefined || n === '' ? '—' : n));

interface Meta {
  modules: { key: string; label: string; premium: boolean }[];
  premiumModules: string[];
  features: { key: string; label: string }[];
  limits: { key: string; label: string }[];
  reports: { key: string; label: string; category: string }[];
  reportGroups: { category: string; items: { key: string; label: string }[] }[];
  billingCycles?: string[];
}

export const PlansTab: React.FC = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([api.planConfig.list(), api.planConfig.metadata()]);
      setPlans(Array.isArray(p) ? p : []);
      setMeta(m);
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (plan: any) => {
    const ok = await ui.confirm({
      title: `Delete "${plan.name}"?`,
      message: 'This plan will be removed. Companies must be moved to another plan first.',
      confirmText: 'Delete', variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.planConfig.remove(plan.key);
      ui.toast.success(`${plan.name} deleted.`);
      load();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  if (editing || creating) {
    return (
      <PlanEditor
        meta={meta!}
        plan={editing}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={() => { setEditing(null); setCreating(false); load(); }}
      />
    );
  }

  if (loading) return <Loading label="Loading plans…" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-[13px] text-ink-secondary max-w-2xl">
          The master configuration for pricing and entitlements. Editing a plan updates every company on it immediately.
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
          <Button size="sm" icon={<Plus size={15} />} onClick={() => setCreating(true)}>Create Plan</Button>
        </div>
      </div>

      {plans.length === 0 ? (
        <Empty icon={<Sparkles size={22} />} title="No plans configured." action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>Create Plan</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map((p) => {
            const enabledModules = (p.enabledModules || []).length;
            const totalPremium = meta?.premiumModules?.length ?? 8;
            const reportsAll = p.enabledReports === 'all';
            const reportCount = reportsAll ? (meta?.reports?.length ?? 0) : (Array.isArray(p.enabledReports) ? p.enabledReports.length : 0);
            const activeFeatures = Object.values(p.features || {}).filter(Boolean).length;
            return (
              <div key={p.key} className="bg-surface rounded-card border border-hairline shadow-card overflow-hidden flex flex-col transition-[box-shadow,transform,border-color] duration-200 hover:shadow-card-hover hover:-translate-y-0.5">
                <div className="h-1 w-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                <div className="p-5 flex-1 flex flex-col">
                  {/* Identity */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-white flex-shrink-0" style={{ backgroundColor: p.color }}>
                        {p.custom ? <Crown size={17} /> : <Sparkles size={17} />}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-ink leading-tight truncate font-heading">{p.name}</div>
                        <div className="text-[11.5px] text-ink-muted">
                          {p.custom ? 'Manual pricing' : `${p.employeeMin}–${p.employeeMax === -1 ? '∞' : p.employeeMax} employees`}
                        </div>
                      </div>
                    </div>
                    <Badge variant={p.status === 'Active' ? 'green' : 'gray'} dot>{p.status}</Badge>
                  </div>

                  {/* Fixed height keeps the price blocks aligned across the row
                      however long each description is. */}
                  <p className="text-[12.5px] text-ink-secondary mt-3 line-clamp-2 min-h-[36px]">{p.description || ''}</p>

                  {/* Pricing by cycle */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-hairline px-3 py-2.5">
                      <div className="text-[22px] font-bold text-ink leading-none font-heading">{p.custom ? '—' : inr(p.priceQuarterly)}</div>
                      <div className="text-[9.5px] text-ink-muted uppercase tracking-wide mt-1 whitespace-nowrap">per user · quarter</div>
                    </div>
                    <div className="rounded-xl border border-hairline px-3 py-2.5">
                      <div className="text-[22px] font-bold text-emerald-600 leading-none font-heading">{p.custom ? '—' : inr(p.priceYearly)}</div>
                      <div className="text-[9.5px] text-ink-muted uppercase tracking-wide mt-1 whitespace-nowrap">per user · year</div>
                    </div>
                  </div>

                  {/* What it unlocks */}
                  <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
                    <Stat icon={<Check size={13} />} label={`${enabledModules}/${totalPremium} premium modules`} />
                    <Stat icon={<FileBarChart2 size={13} />} label={reportsAll ? 'All reports' : `${reportCount} reports`} />
                    <Stat icon={<Users2 size={13} />} label={`${numOrDash(p.limits?.employeeLimit)} employees`} />
                    <Stat icon={<Building size={13} />} label={`${numOrDash(p.limits?.branchLimit)} branches`} />
                    <Stat icon={<ShieldCheck size={13} />} label={`${num(p.includedVerificationCredits || 0)} credits`} />
                    <Stat icon={<HardDrive size={13} />} label={`${numOrDash(p.limits?.storageMB)} MB`} />
                  </div>

                  {/* Adoption + actions */}
                  <div className="mt-auto pt-4 flex items-center justify-between border-t border-hairline mt-4">
                    <span className="text-[11.5px] text-ink-muted">
                      {p.companyCount || 0} compan{(p.companyCount || 0) === 1 ? 'y' : 'ies'} · {activeFeatures} feature{activeFeatures === 1 ? '' : 's'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button size="xs" variant="outline" icon={<Pencil size={13} />} onClick={() => setEditing(p)}>Edit</Button>
                      {!p.isSystem && (
                        <button onClick={() => del(p)} title="Delete plan" aria-label={`Delete ${p.name}`} className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-1.5 text-ink-secondary min-w-0">
    <span className="text-brand-600 flex-shrink-0">{icon}</span>
    <span className="truncate">{label}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// PLAN EDITOR
// ─────────────────────────────────────────────────────────────────────────────
const PALETTE = ['#64748b', '#3b82f6', '#8b5cf6', '#4f46e5', '#d97706', '#059669', '#dc2626', '#0891b2'];

const PlanEditor: React.FC<{ meta: Meta; plan: any | null; onClose: () => void; onSaved: () => void }> = ({ meta, plan, onClose, onSaved }) => {
  const isNew = !plan;
  const [form, setForm] = useState<any>(() => plan ? JSON.parse(JSON.stringify(plan)) : {
    name: '', description: '', status: 'Active', color: '#3b82f6', displayOrder: 99,
    employeeMin: 0, employeeMax: -1, priceQuarterly: 0, priceYearly: 0, discountPercent: 0,
    includedVerificationCredits: 0,
    enabledModules: [...(meta.premiumModules || [])], enabledReports: 'all',
    limits: meta.limits.reduce((a: any, l) => ((a[l.key] = -1), a), {}),
    features: meta.features.reduce((a: any, f) => ((a[f.key] = true), a), {}),
  });
  const [saving, setSaving] = useState(false);

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const setLimit = (k: string, v: any) => setForm((f: any) => ({ ...f, limits: { ...f.limits, [k]: v === '' ? '' : Number(v) } }));
  const setFeature = (k: string, v: boolean) => setForm((f: any) => ({ ...f, features: { ...f.features, [k]: v } }));

  const reportsAll = form.enabledReports === 'all';
  const enabledReportSet = useMemo(() => new Set(reportsAll ? [] : (form.enabledReports || [])), [form.enabledReports, reportsAll]);
  const enabledModuleSet = useMemo(() => new Set(form.enabledModules || []), [form.enabledModules]);

  const toggleModule = (key: string) => setForm((f: any) => {
    const s = new Set(f.enabledModules || []);
    s.has(key) ? s.delete(key) : s.add(key);
    return { ...f, enabledModules: [...s] };
  });
  const toggleReport = (key: string) => setForm((f: any) => {
    const cur = f.enabledReports === 'all' ? meta.reports.map((r) => r.key) : [...(f.enabledReports || [])];
    const s = new Set(cur);
    s.has(key) ? s.delete(key) : s.add(key);
    return { ...f, enabledReports: [...s] };
  });
  const setAllReports = (all: boolean) => set({ enabledReports: all ? 'all' : [] });
  const toggleReportGroup = (items: { key: string }[], on: boolean) => setForm((f: any) => {
    const cur = f.enabledReports === 'all' ? meta.reports.map((r) => r.key) : [...(f.enabledReports || [])];
    const s = new Set(cur);
    items.forEach((it) => (on ? s.add(it.key) : s.delete(it.key)));
    return { ...f, enabledReports: [...s] };
  });

  // Yearly saving vs paying quarterly for a full year — shown live in the editor.
  const yearlySaving = useMemo(() => {
    const q = Number(form.priceQuarterly) || 0;
    const y = Number(form.priceYearly) || 0;
    if (!q || !y) return 0;
    const annualIfQuarterly = q * 4;
    const annualIfYearly = y * 4; // both rates are per user, per billing period
    return annualIfQuarterly > 0 ? Math.round(((annualIfQuarterly - annualIfYearly) / annualIfQuarterly) * 100) : 0;
  }, [form.priceQuarterly, form.priceYearly]);

  const save = async () => {
    if (!String(form.name || '').trim()) { ui.toast.error('Plan name is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name, description: form.description, status: form.status, color: form.color,
        displayOrder: Number(form.displayOrder) || 99,
        employeeMin: Number(form.employeeMin) || 0,
        employeeMax: form.employeeMax === '' ? -1 : Number(form.employeeMax),
        priceQuarterly: Number(form.priceQuarterly) || 0,
        priceYearly: Number(form.priceYearly) || 0,
        discountPercent: Number(form.discountPercent) || 0,
        includedVerificationCredits: Math.max(0, Number(form.includedVerificationCredits) || 0),
        enabledModules: form.enabledModules,
        enabledReports: form.enabledReports,
        limits: Object.fromEntries(Object.entries(form.limits).map(([k, v]) => [k, v === '' ? -1 : Number(v)])),
        features: form.features,
      };
      if (isNew) await api.planConfig.create({ ...payload, key: form.name.trim() });
      else await api.planConfig.update(plan.key, payload);
      ui.toast.success(isNew ? 'Plan created.' : `${form.name} updated — companies re-permissioned live.`);
      onSaved();
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      variant="page"
      title={isNew ? 'Create Plan' : `Edit Plan — ${plan.name}`}
      subtitle="Configure what this plan costs and unlocks. Changes apply to every company on the plan immediately."
      breadcrumbs={[{ label: 'Plans', onClick: onClose }, { label: isNew ? 'New Plan' : plan.name }]}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" icon={<X size={15} />} onClick={onClose}>Cancel</Button>
          <Button icon={<Save size={15} />} onClick={save} loading={saving}>{isNew ? 'Create Plan' : 'Save Changes'}</Button>
        </div>
      }
    >
      <div className="space-y-5 max-w-5xl mx-auto">
        {/* ── Plan Information ── */}
        <Section title="Plan Information" icon={<Sparkles size={15} />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Plan Name{plan?.isSystem && ' (locked)'}</label>
              <input className={inputCls} value={form.name} disabled={plan?.isSystem} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Growth" />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={form.status} onChange={(e) => set({ status: e.target.value })}>
                <option>Active</option><option>Inactive</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Description</label>
              <input className={inputCls} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Short summary shown on the plan card" />
            </div>
            <div>
              <label className={labelCls}>Display Order</label>
              <input type="number" className={inputCls} value={form.displayOrder} onChange={(e) => set({ displayOrder: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Colour</label>
              <div className="flex items-center gap-2 h-10">
                {PALETTE.map((c) => (
                  <button key={c} onClick={() => set({ color: c })} aria-label={`Colour ${c}`} className={`h-7 w-7 rounded-full border-2 transition ${form.color === c ? 'border-ink scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ── Billing Cycles & Pricing ── */}
        <Section title="Billing Cycles" icon={<CalendarRange size={15} />} hint="The per-user rate charged for each billing period. A company on this plan is billed for its active headcount at the rate of the cycle it is on.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Quarterly (₹ / user / quarter)</label>
              <input type="number" min={0} className={inputCls} value={form.priceQuarterly} onChange={(e) => set({ priceQuarterly: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Yearly (₹ / user / year)</label>
              <input type="number" min={0} className={inputCls} value={form.priceYearly} onChange={(e) => set({ priceYearly: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Standard Discount (%)</label>
              <input type="number" min={0} max={100} className={inputCls} value={form.discountPercent} onChange={(e) => set({ discountPercent: e.target.value })} />
            </div>
          </div>
          {yearlySaving > 0 && (
            <p className="text-[12.5px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 mt-4 inline-flex items-center gap-2">
              <Wallet size={14} /> Yearly is {yearlySaving}% cheaper than paying quarterly for the same period.
            </p>
          )}
        </Section>

        {/* ── Employee Limits ── */}
        <Section title="Employee Limits" icon={<Users2 size={15} />} hint="The headcount band this plan is sold for, and the hard seat cap enforced on the company. Use -1 for unlimited.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Band — Minimum</label>
              <input type="number" className={inputCls} value={form.employeeMin} onChange={(e) => set({ employeeMin: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Band — Maximum (-1 = ∞)</label>
              <input type="number" className={inputCls} value={form.employeeMax} onChange={(e) => set({ employeeMax: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Enforced Seat Limit</label>
              <input type="number" className={inputCls} value={form.limits?.employeeLimit ?? -1} onChange={(e) => setLimit('employeeLimit', e.target.value)} />
            </div>
          </div>
        </Section>

        {/* ── Verification Credits ── */}
        <Section title="Verification Credits" icon={<ShieldCheck size={15} />} hint="Bank-verification credits granted with every paid purchase or renewal of this plan. One credit = one verification.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Included Credits</label>
              <input type="number" min={0} className={inputCls} value={form.includedVerificationCredits ?? 0} onChange={(e) => set({ includedVerificationCredits: e.target.value })} />
            </div>
            <div className="md:col-span-2 flex items-end">
              <p className="text-[12.5px] text-ink-muted pb-2.5">
                Companies can top up beyond this allowance at any time; purchased credits never expire and are tracked separately from the included grant.
              </p>
            </div>
          </div>
        </Section>

        {/* ── Module Access ── */}
        <Section title="Module Access" icon={<Check size={15} />} hint="Core modules are always on. Toggle premium modules to include them in this plan.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {meta.modules.map((m) => {
              const on = !m.premium || enabledModuleSet.has(m.key);
              return (
                <div key={m.key} className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border ${on ? 'border-brand-200 bg-brand-50/40' : 'border-hairline bg-surface'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13.5px] text-ink truncate">{m.label}</span>
                    {!m.premium
                      ? <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 rounded px-1.5 py-0.5"><Lock size={9} />Core</span>
                      : <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-100 rounded px-1.5 py-0.5">Premium</span>}
                  </div>
                  <Toggle on={on} disabled={!m.premium} onChange={() => toggleModule(m.key)} />
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Report Access ── */}
        <Section
          title="Report Access"
          icon={<FileBarChart2 size={15} />}
          hint="Choose which reports this plan can generate."
          right={<label className="flex items-center gap-2 text-[12px] font-semibold text-ink-secondary cursor-pointer"><Toggle on={reportsAll} onChange={setAllReports} /> All reports</label>}
        >
          {reportsAll ? (
            <p className="text-[13px] text-ink-muted py-1">All {meta.reports.length} reports are enabled for this plan.</p>
          ) : (
            <div className="space-y-4">
              {meta.reportGroups.map((g) => {
                const allOn = g.items.every((it) => enabledReportSet.has(it.key));
                return (
                  <div key={g.category}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11.5px] font-bold text-ink uppercase tracking-wider">{g.category}</span>
                      <button className="text-[11.5px] text-brand-600 font-semibold hover:underline" onClick={() => toggleReportGroup(g.items, !allOn)}>
                        {allOn ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {g.items.map((it) => {
                        const on = enabledReportSet.has(it.key);
                        return (
                          <button key={it.key} onClick={() => toggleReport(it.key)} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-[12.5px] transition ${on ? 'border-brand-300 bg-brand-50 text-ink' : 'border-hairline bg-surface text-ink-secondary hover:bg-surface-muted'}`}>
                            <span className={`h-4 w-4 rounded flex items-center justify-center flex-shrink-0 ${on ? 'bg-brand-600 text-white' : 'border border-slate-300'}`}>{on && <Check size={11} />}</span>
                            <span className="truncate">{it.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── Usage Limits ── */}
        <Section title="Usage Limits" icon={<HardDrive size={15} />} hint="Use -1 for unlimited.">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {meta.limits.map((l) => (
              <div key={l.key}>
                <label className={labelCls}>{l.label}</label>
                <input type="number" className={inputCls} value={form.limits?.[l.key] ?? -1} onChange={(e) => setLimit(l.key, e.target.value)} />
              </div>
            ))}
          </div>
        </Section>

        {/* ── Features ── */}
        <Section title="Features" icon={<Sparkles size={15} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {meta.features.map((f) => (
              <div key={f.key} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-hairline bg-surface">
                <span className="text-[13.5px] text-ink">{f.label}</span>
                <Toggle on={!!form.features?.[f.key]} onChange={(v) => setFeature(f.key, v)} />
              </div>
            ))}
          </div>
        </Section>
      </div>
    </Modal>
  );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; hint?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, hint, right, children }) => (
  <Panel>
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="inline-flex items-center justify-center h-8 w-8 rounded-xl bg-brand-50 text-brand-600 flex-shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="font-bold text-ink text-[15px] leading-tight font-heading">{title}</div>
          {hint && <div className="text-[12px] text-ink-muted mt-0.5">{hint}</div>}
        </div>
      </div>
      {right}
    </div>
    {children}
  </Panel>
);

export default PlansTab;
