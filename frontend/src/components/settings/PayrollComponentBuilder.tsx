// ─────────────────────────────────────────────────────────────────────────────
// Payroll Component Builder — enterprise CRUD for the payroll component master.
//
// Replaces the old prompt-box "Add Component" flow with a full module: a grid
// (View / Edit / Clone / Activate-Deactivate / Archive / Delete) and a large,
// grouped modal form (Basic Info · Category · Calculation · Tax & Statutory ·
// Effective Dates · Status). Fully database-backed via /api/payroll-components —
// no localStorage, no hardcoded components. Company scope travels in the
// x-workspace-id header (set by apiClient).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import {
  Plus, Search, Eye, Edit, Copy, Archive, Trash2, Power, RefreshCw, Layers,
  Wallet, MinusCircle, Receipt, Gift, TrendingUp, Building2, Landmark, Undo2, Settings2, History, X,
} from 'lucide-react';

interface Props { isSuperOrHead: boolean; performedBy?: string; }

// Per-type icon + accent (badges/rows). Falls back to a neutral chip.
const TYPE_META: Record<string, { icon: React.FC<any>; cls: string }> = {
  'Allowance': { icon: Wallet, cls: 'bg-emerald-100 text-emerald-700' },
  'Deduction': { icon: MinusCircle, cls: 'bg-rose-100 text-rose-700' },
  'Reimbursement': { icon: Receipt, cls: 'bg-brand-100 text-brand-700' },
  'Bonus': { icon: Gift, cls: 'bg-amber-100 text-amber-700' },
  'Incentive': { icon: TrendingUp, cls: 'bg-brand-100 text-brand-700' },
  'Employer Contribution': { icon: Building2, cls: 'bg-brand-100 text-brand-700' },
  'Loan': { icon: Landmark, cls: 'bg-orange-100 text-orange-700' },
  'Recovery': { icon: Undo2, cls: 'bg-pink-100 text-pink-700' },
  'Custom': { icon: Settings2, cls: 'bg-slate-100 text-slate-700' },
};
const typeIcon = (t: string) => (TYPE_META[t]?.icon || Layers);
const typeCls = (t: string) => (TYPE_META[t]?.cls || 'bg-slate-100 text-slate-700');

const blank = () => ({
  componentName: '', displayName: '', shortCode: '', description: '',
  componentType: 'Allowance', payrollCategory: 'Fixed', calculationMethod: 'Fixed Amount',
  amount: 0, percentage: 0, formula: '', taxable: 'Taxable', taxablePercent: 0,
  pfApplicable: false, esicApplicable: false, ptApplicable: false, lwfApplicable: false, tdsApplicable: false,
  effectiveFrom: '', effectiveTo: '', status: 'Active', displayOrder: 0,
});

const STATUTORY = [
  { key: 'pfApplicable', label: 'PF Applicable' },
  { key: 'esicApplicable', label: 'ESIC Applicable' },
  { key: 'ptApplicable', label: 'PT Applicable' },
  { key: 'lwfApplicable', label: 'LWF Applicable' },
  { key: 'tdsApplicable', label: 'TDS Applicable' },
];

// A short human description of how a component computes, for the grid "Formula" col.
const calcSummary = (c: any) => {
  switch (c.calculationMethod) {
    case 'Fixed Amount': return `₹ ${Number(c.amount || 0).toLocaleString('en-IN')}`;
    case 'Percentage of Basic': return `${c.percentage || 0}% of Basic`;
    case 'Percentage of Gross': return `${c.percentage || 0}% of Gross`;
    case 'Formula Builder': return c.formula ? `ƒ ${c.formula}` : 'Formula';
    case 'Manual': return 'Manual entry';
    default: return c.calculationMethod;
  }
};

export const PayrollComponentBuilder: React.FC<Props> = ({ isSuperOrHead, performedBy = 'Administrator' }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<any>({ types: [], categories: [], methods: [], taxable: [], statuses: [] });

  // Filters / sort (server-side).
  const [q, setQ] = useState('');
  const [fType, setFType] = useState('All');
  const [fCategory, setFCategory] = useState('All');
  const [fStatus, setFStatus] = useState('All');
  const [sortBy, setSortBy] = useState('displayOrder');
  const [sortDir, setSortDir] = useState('asc');

  // Drawer / modal.
  const [mode, setMode] = useState<'create' | 'edit' | 'view' | null>(null);
  const [draft, setDraft] = useState<any>(blank());
  const [audits, setAudits] = useState<any[]>([]);
  const [viewRow, setViewRow] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.payrollComponents.list({ q, type: fType, category: fCategory, status: fStatus, sortBy, sortDir });
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e, 'Could not load payroll components.'));
    } finally {
      setLoading(false);
    }
  }, [q, fType, fCategory, fStatus, sortBy, sortDir]);

  useEffect(() => { (async () => { try { setMeta(await api.payrollComponents.meta()); } catch { /* enums optional */ } })(); }, []);
  // Debounce the search box; other filters apply immediately.
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const opt = (arr: string[], allLabel: string) => [{ value: 'All', label: allLabel }, ...arr.map((v) => ({ value: v, label: v }))];

  const openCreate = () => { setDraft(blank()); setMode('create'); };
  const openEdit = (row: any) => { setDraft({ ...blank(), ...row }); setMode('edit'); };
  const openView = async (row: any) => {
    setViewRow(row); setMode('view'); setAudits([]);
    try { const full = await api.payrollComponents.getOne(row.id); setViewRow(full); setAudits(full.audits || []); } catch { /* keep row */ }
  };

  const setField = (k: string, v: any) => setDraft((d: any) => ({ ...d, [k]: v }));

  // Client-side pre-checks (server re-validates authoritatively).
  const clientValidate = (d: any): string | null => {
    if (!String(d.componentName || '').trim()) return 'Component Name is required.';
    if (d.calculationMethod === 'Fixed Amount' && Number(d.amount) < 0 && !['Deduction', 'Recovery', 'Loan'].includes(d.componentType))
      return `A ${d.componentType} component cannot have a negative Fixed Amount.`;
    if ((d.calculationMethod === 'Percentage of Basic' || d.calculationMethod === 'Percentage of Gross') && Number(d.percentage) < 0)
      return 'Percentage must be non-negative.';
    if (d.calculationMethod === 'Formula Builder' && !String(d.formula || '').trim()) return 'Enter a formula, or pick another calculation method.';
    if (d.taxable === 'Partially Taxable') { const tp = Number(d.taxablePercent); if (!(tp >= 0 && tp <= 100)) return 'Taxable % must be between 0 and 100.'; }
    return null;
  };

  const save = async () => {
    const err = clientValidate(draft);
    if (err) { ui.toast.error(err); return; }
    setSaving(true);
    try {
      if (mode === 'edit' && draft.id) { await api.payrollComponents.update(draft.id, draft); ui.toast.success('Component updated.'); }
      else { await api.payrollComponents.create(draft); ui.toast.success('Component created.'); }
      setMode(null); await load();
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e, 'Could not save the component.'));
    } finally { setSaving(false); }
  };

  const withBusy = async (id: number, fn: () => Promise<any>) => { setBusyId(id); try { await fn(); await load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setBusyId(null); } };

  const clone = (row: any) => withBusy(row.id, async () => { await api.payrollComponents.clone(row.id); ui.toast.success(`Cloned "${row.componentName}". Edit the copy to customise it.`); });
  const toggle = (row: any) => withBusy(row.id, async () => { const next = row.status === 'Active' ? 'Inactive' : 'Active'; await api.payrollComponents.setStatus(row.id, next); ui.toast.success(`Component ${next === 'Active' ? 'activated' : 'deactivated'}.`); });
  const archive = async (row: any) => {
    const restore = row.status === 'Archived';
    if (!restore && !(await ui.confirm({ message: `Archive "${row.componentName}"? It will be hidden from active use but kept for records.`, confirmText: 'Archive' }))) return;
    withBusy(row.id, async () => { await api.payrollComponents.archive(row.id, restore); ui.toast.success(restore ? 'Component restored.' : 'Component archived.'); });
  };
  const remove = async (row: any) => {
    if (!(await ui.confirm({ message: `Permanently delete "${row.componentName}"? This cannot be undone.`, variant: 'danger', confirmText: 'Delete' }))) return;
    setBusyId(row.id);
    try {
      await api.payrollComponents.remove(row.id);
      ui.toast.success('Component deleted.'); await load();
    } catch (e: any) {
      if (e?.code === 'IN_USE') {
        const archiveIt = await ui.confirm({ message: 'This component is already used in payroll records and cannot be permanently deleted.\n\nArchive it instead?', confirmText: 'Archive', cancelText: 'Cancel' });
        if (archiveIt) { try { await api.payrollComponents.archive(row.id, false); ui.toast.success('Component archived.'); await load(); } catch (e2) { ui.toast.error(getApiErrorMessage(e2)); } }
      } else { ui.toast.error(getApiErrorMessage(e, 'Could not delete the component.')); }
    } finally { setBusyId(null); }
  };

  const statusBadge = (s: string) => s === 'Active'
    ? <Badge variant="green">Active</Badge>
    : s === 'Archived' ? <Badge variant="gray">Archived</Badge> : <Badge variant="amber">Inactive</Badge>;

  const taxBadge = (t: string) => t === 'Taxable'
    ? <span className="text-[10px] font-bold text-rose-600">Taxable</span>
    : t === 'Non-Taxable' ? <span className="text-[10px] font-bold text-emerald-600">Non-Taxable</span>
      : <span className="text-[10px] font-bold text-amber-600">Partial</span>;

  const iconBtn = 'p-1.5 rounded-lg text-slate-400 transition-colors disabled:opacity-40';

  const activeCount = useMemo(() => items.filter((c) => c.status === 'Active').length, [items]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header + Add */}
      <div className="flex flex-wrap justify-between items-end gap-3 border-b border-slate-200 pb-3">
        <div>
          <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Layers size={18} className="text-brand-600" /> Payroll Component Builder</h4>
          <p className="text-xs text-slate-500 mt-1">Create and manage every Allowance, Deduction, Reimbursement, Bonus, Incentive, Contribution, Loan &amp; Recovery. {items.length} components · {activeCount} active.</p>
        </div>
        {isSuperOrHead && <Button size="sm" onClick={openCreate} className="flex items-center gap-1"><Plus size={14} /> Add Component</Button>}
      </div>

      {/* Toolbar — search / filters / sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name / code…" className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 focus:border-brand-500 focus:outline-none" />
        </div>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none">
          {opt(meta.types, 'All Types').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none">
          {opt(meta.categories, 'All Categories').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none">
          {['All', 'Active', 'Inactive', 'Archived'].map((s) => <option key={s} value={s}>{s === 'All' ? 'All Status' : s}</option>)}
        </select>
        <select value={`${sortBy}:${sortDir}`} onChange={(e) => { const [b, d] = e.target.value.split(':'); setSortBy(b); setSortDir(d); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none">
          <option value="displayOrder:asc">Sort: Display Order</option>
          <option value="componentName:asc">Sort: Name (A→Z)</option>
          <option value="componentName:desc">Sort: Name (Z→A)</option>
          <option value="effectiveFrom:desc">Sort: Effective (newest)</option>
          <option value="effectiveFrom:asc">Sort: Effective (oldest)</option>
          <option value="updatedAt:desc">Sort: Recently updated</option>
        </select>
        <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} onClick={load} disabled={loading}>Refresh</Button>
      </div>

      {/* Grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wide">
              <tr>
                <th className="p-3 font-semibold">Component</th>
                <th className="p-3 font-semibold">Type</th>
                <th className="p-3 font-semibold">Category</th>
                <th className="p-3 font-semibold">Formula / Calc</th>
                <th className="p-3 font-semibold text-center">Taxable</th>
                <th className="p-3 font-semibold text-center">Status</th>
                <th className="p-3 font-semibold">Effective From</th>
                <th className="p-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={8} className="p-8 text-center text-slate-400">Loading components…</td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={8} className="p-10 text-center text-slate-400">
                  <Layers size={26} className="mx-auto mb-2 text-slate-300" />
                  No components found. {isSuperOrHead && 'Click “Add Component” to create your first one.'}
                </td></tr>
              )}
              {items.map((c) => {
                const TI = typeIcon(c.componentType);
                const busy = busyId === c.id;
                return (
                  <tr key={c.id} className={`hover:bg-slate-50/60 transition-colors ${c.status === 'Archived' ? 'opacity-60' : ''}`}>
                    <td className="p-3">
                      <p className="font-bold text-slate-800">{c.componentName}</p>
                      {(c.displayName || c.shortCode) && <p className="text-[11px] text-slate-400">{c.displayName || ''}{c.shortCode ? ` · ${c.shortCode}` : ''}</p>}
                    </td>
                    <td className="p-3"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold ${typeCls(c.componentType)}`}><TI size={11} /> {c.componentType}</span></td>
                    <td className="p-3 text-slate-600 text-xs">{c.payrollCategory}</td>
                    <td className="p-3"><span className="font-mono text-[11px] text-slate-600 line-clamp-1 max-w-[220px]" title={calcSummary(c)}>{calcSummary(c)}</span></td>
                    <td className="p-3 text-center">{taxBadge(c.taxable)}</td>
                    <td className="p-3 text-center">{statusBadge(c.status)}</td>
                    <td className="p-3 text-slate-600 text-xs whitespace-nowrap">{c.effectiveFrom ? formatDate(c.effectiveFrom) : '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <button className={`${iconBtn} hover:text-brand-600 hover:bg-brand-50`} title="View" onClick={() => openView(c)}><Eye size={15} /></button>
                        {isSuperOrHead && <>
                          <button className={`${iconBtn} hover:text-brand-600 hover:bg-brand-50`} title="Edit" disabled={busy || c.status === 'Archived'} onClick={() => openEdit(c)}><Edit size={15} /></button>
                          <button className={`${iconBtn} hover:text-brand-600 hover:bg-brand-50`} title="Clone" disabled={busy} onClick={() => clone(c)}><Copy size={15} /></button>
                          <button className={`${iconBtn} ${c.status === 'Active' ? 'hover:text-amber-600 hover:bg-amber-50' : 'hover:text-emerald-600 hover:bg-emerald-50'}`} title={c.status === 'Active' ? 'Deactivate' : 'Activate'} disabled={busy || c.status === 'Archived'} onClick={() => toggle(c)}><Power size={15} /></button>
                          <button className={`${iconBtn} hover:text-slate-700 hover:bg-slate-100`} title={c.status === 'Archived' ? 'Restore' : 'Archive'} disabled={busy} onClick={() => archive(c)}>{c.status === 'Archived' ? <Undo2 size={15} /> : <Archive size={15} />}</button>
                          <button className={`${iconBtn} hover:text-rose-600 hover:bg-rose-50`} title={c.inUse ? 'In use — archive instead' : 'Delete'} disabled={busy} onClick={() => remove(c)}><Trash2 size={15} /></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create / Edit modal ─────────────────────────────────────────────── */}
      {(mode === 'create' || mode === 'edit') && (
        <Modal open onClose={() => setMode(null)} title={`${mode === 'edit' ? 'Edit' : 'New'} Payroll Component`} size="xl"
          footer={<><Button variant="outline" onClick={() => setMode(null)}>Cancel</Button><Button onClick={save} loading={saving} icon={<Plus size={14} />}>{mode === 'edit' ? 'Save Changes' : 'Create Component'}</Button></>}>
          <div className="max-h-[68vh] overflow-y-auto pr-1 space-y-5">
            {/* Basic Information */}
            <Section title="Basic Information" desc="Identify the component. The name must be unique within the company.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input label="Component Name *" value={draft.componentName} onChange={(e: any) => setField('componentName', e.target.value)} placeholder="e.g. Internet Allowance" />
                <Input label="Display Name" value={draft.displayName} onChange={(e: any) => setField('displayName', e.target.value)} placeholder="Shown on the payslip" />
                <Input label="Short Code" value={draft.shortCode} onChange={(e: any) => setField('shortCode', e.target.value)} placeholder="e.g. INTNET (used in formulas)" />
                <Select label="Component Type" value={draft.componentType} onChange={(e: any) => setField('componentType', e.target.value)} options={meta.types.map((v: string) => ({ value: v, label: v }))} />
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-[11px] font-bold text-slate-500">Description</label>
                <textarea value={draft.description} onChange={(e) => setField('description', e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none" placeholder="What is this component for?" />
              </div>
            </Section>

            {/* Category + Calculation */}
            <Section title="Payroll Category & Calculation" desc="How the amount is determined each payroll run.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Select label="Payroll Category" value={draft.payrollCategory} onChange={(e: any) => setField('payrollCategory', e.target.value)} options={meta.categories.map((v: string) => ({ value: v, label: v }))} />
                <Select label="Calculation Method" value={draft.calculationMethod} onChange={(e: any) => setField('calculationMethod', e.target.value)} options={meta.methods.map((v: string) => ({ value: v, label: v }))} />
              </div>
              <div className="mt-3">
                {draft.calculationMethod === 'Fixed Amount' && (
                  <Input label="Fixed Amount (₹)" type="number" value={draft.amount} onChange={(e: any) => setField('amount', e.target.value)} placeholder="0" />
                )}
                {(draft.calculationMethod === 'Percentage of Basic' || draft.calculationMethod === 'Percentage of Gross') && (
                  <Input label={`Percentage (% of ${draft.calculationMethod === 'Percentage of Basic' ? 'Basic' : 'Gross'})`} type="number" value={draft.percentage} onChange={(e: any) => setField('percentage', e.target.value)} placeholder="0" />
                )}
                {draft.calculationMethod === 'Formula Builder' && (
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-slate-500">Formula</label>
                    <textarea value={draft.formula} onChange={(e) => setField('formula', e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 p-2 text-xs font-mono text-slate-700 focus:border-brand-500 focus:outline-none" placeholder="e.g. BASIC * 0.10 + 500" />
                    <p className="mt-1 text-[10px] text-slate-400">Use variables (BASIC, GROSS, CTC) and other component Short Codes with + − * / ( ). Circular references are rejected on save.</p>
                  </div>
                )}
                {draft.calculationMethod === 'Manual' && <p className="text-[11px] text-slate-400 italic">Manual — the amount is entered per employee during payroll processing.</p>}
              </div>
            </Section>

            {/* Tax + Statutory */}
            <Section title="Tax Configuration & Statutory Impact" desc="Taxability and which statutory heads this component affects.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Select label="Taxability" value={draft.taxable} onChange={(e: any) => setField('taxable', e.target.value)} options={meta.taxable.map((v: string) => ({ value: v, label: v }))} />
                {draft.taxable === 'Partially Taxable' && (
                  <Input label="Taxable Portion (%)" type="number" value={draft.taxablePercent} onChange={(e: any) => setField('taxablePercent', e.target.value)} placeholder="0–100" />
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {STATUTORY.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 border border-slate-200 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" className="accent-brand-600 h-4 w-4" checked={!!draft[s.key]} onChange={(e) => setField(s.key, e.target.checked)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </Section>

            {/* Effective dates + Status */}
            <Section title="Effective Dates & Status" desc="When the component applies, and whether it is currently in effect.">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input label="Effective From" type="date" value={draft.effectiveFrom || ''} onChange={(e: any) => setField('effectiveFrom', e.target.value)} />
                <Input label="Effective To" type="date" value={draft.effectiveTo || ''} onChange={(e: any) => setField('effectiveTo', e.target.value)} />
                <Select label="Status" value={draft.status === 'Archived' ? 'Inactive' : draft.status} onChange={(e: any) => setField('status', e.target.value)} options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} />
              </div>
              <div className="mt-2">
                <Input label="Display Order" type="number" value={draft.displayOrder} onChange={(e: any) => setField('displayOrder', e.target.value)} placeholder="0" />
              </div>
            </Section>
          </div>
        </Modal>
      )}

      {/* ── View drawer (read-only + audit trail) ───────────────────────────── */}
      {mode === 'view' && viewRow && (
        <Modal open onClose={() => setMode(null)} title={viewRow.componentName} size="lg"
          footer={<>
            {isSuperOrHead && viewRow.status !== 'Archived' && <Button variant="outline" icon={<Edit size={14} />} onClick={() => { setMode(null); openEdit(viewRow); }}>Edit</Button>}
            <Button onClick={() => setMode(null)}>Close</Button>
          </>}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold ${typeCls(viewRow.componentType)}`}>{React.createElement(typeIcon(viewRow.componentType), { size: 11 })} {viewRow.componentType}</span>
              {statusBadge(viewRow.status)}
              {viewRow.inUse && <Badge variant="blue">In use</Badge>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <Field label="Display Name" value={viewRow.displayName} />
              <Field label="Short Code" value={viewRow.shortCode} />
              <Field label="Category" value={viewRow.payrollCategory} />
              <Field label="Calculation" value={calcSummary(viewRow)} />
              <Field label="Taxability" value={viewRow.taxable === 'Partially Taxable' ? `Partial (${viewRow.taxablePercent}%)` : viewRow.taxable} />
              <Field label="Statutory" value={STATUTORY.filter((s) => viewRow[s.key]).map((s) => s.label.replace(' Applicable', '')).join(', ') || 'None'} />
              <Field label="Effective From" value={viewRow.effectiveFrom ? formatDate(viewRow.effectiveFrom) : '—'} />
              <Field label="Effective To" value={viewRow.effectiveTo ? formatDate(viewRow.effectiveTo) : '—'} />
              <Field label="Display Order" value={String(viewRow.displayOrder ?? 0)} />
            </div>
            {viewRow.description && <div className="text-xs"><p className="font-bold text-slate-500 mb-1">Description</p><p className="text-slate-700">{viewRow.description}</p></div>}

            <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-500 border-t border-slate-100 pt-3">
              <span>Created by <b className="text-slate-700">{viewRow.createdBy || '—'}</b> on {viewRow.createdAt ? formatDateTime(viewRow.createdAt) : '—'}</span>
              <span>Updated by <b className="text-slate-700">{viewRow.updatedBy || '—'}</b> on {viewRow.updatedAt ? formatDateTime(viewRow.updatedAt) : '—'}</span>
            </div>

            {/* Audit trail */}
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2"><History size={13} /> Change History</p>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 text-slate-400 uppercase tracking-wide"><tr><th className="p-2">When</th><th className="p-2">Action</th><th className="p-2">By</th><th className="p-2">Changes</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {audits.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-400">No history yet.</td></tr>}
                    {audits.map((a) => (
                      <tr key={a.id}>
                        <td className="p-2 text-slate-500 whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                        <td className="p-2"><span className="font-bold text-slate-600">{a.action}</span></td>
                        <td className="p-2 text-slate-500">{a.changedBy || '—'}</td>
                        <td className="p-2 text-slate-500"><ChangeSummary raw={a.changes} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Small presentational helpers ──────────────────────────────────────────────
const Section: React.FC<{ title: string; desc?: string; children: React.ReactNode }> = ({ title, desc, children }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
    <p className="text-xs font-extrabold text-slate-700">{title}</p>
    {desc && <p className="text-[10px] text-slate-400 mb-3">{desc}</p>}
    {children}
  </div>
);

const Field: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div><p className="font-bold text-slate-400 uppercase tracking-wide text-[10px]">{label}</p><p className="text-slate-700 mt-0.5">{value || '—'}</p></div>
);

// Render an audit `changes` JSON blob as a compact "field: from → to" list.
const ChangeSummary: React.FC<{ raw?: string }> = ({ raw }) => {
  if (!raw) return <span className="text-slate-300">—</span>;
  let obj: any;
  try { obj = JSON.parse(raw); } catch { return <span>{String(raw).slice(0, 60)}</span>; }
  const entries = Object.entries(obj);
  if (entries.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <span className="text-slate-500">
      {entries.slice(0, 4).map(([k, v]) => (
        <span key={k} className="inline-block mr-2">
          <b className="text-slate-600">{k}</b>{Array.isArray(v) ? `: ${fmt(v[0])} → ${fmt(v[1])}` : `: ${fmt(v)}`}
        </span>
      ))}
      {entries.length > 4 && <span>+{entries.length - 4} more</span>}
    </span>
  );
};
const fmt = (v: any) => v === null || v === undefined || v === '' ? '∅' : String(typeof v === 'boolean' ? (v ? 'yes' : 'no') : v).slice(0, 24);

export default PayrollComponentBuilder;
