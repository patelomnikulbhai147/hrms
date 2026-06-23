import React, { useState, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { ui } from '@/components/ui/feedback';
import { MapPin, Layers, History as HistoryIcon, Settings2, Plus, Edit3, Trash2, ShieldCheck, Lock } from 'lucide-react';
import {
  SKILLS, type SkillKey, type StateWage, type WageRates,
  getWageMaster, saveWageMaster, getRevisions, addRevisions, makeRevision,
  getSettings, saveSettings,
} from '@/utils/wageMaster';

interface Props {
  companyId: string;
  branchNames: string[];
  canEdit: boolean;
  performedBy: string;
}

type Tab = 'master' | 'skills' | 'history' | 'settings';
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'master', label: 'State Wage Master', icon: <MapPin size={13} /> },
  { id: 'skills', label: 'Skill Categories', icon: <Layers size={13} /> },
  { id: 'history', label: 'Wage Revision History', icon: <HistoryIcon size={13} /> },
  { id: 'settings', label: 'Wage Compliance Settings', icon: <Settings2 size={13} /> },
];

const emptyRates = (): WageRates => ({ unskilled: 0, semiSkilled: 0, skilled: 0, highlySkilled: 0 });
const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

export const LabourCompliance: React.FC<Props> = ({ companyId, branchNames, canEdit, performedBy }) => {
  const [tab, setTab] = useState<Tab>('master');
  const [rows, setRows] = useState<StateWage[]>(() => getWageMaster(companyId));
  const [revisions, setRevisions] = useState(() => getRevisions(companyId));
  const [settings, setSettings] = useState(() => getSettings(companyId));

  const persistRows = useCallback((next: StateWage[]) => { setRows(next); saveWageMaster(companyId, next); }, [companyId]);

  // ── Add / Edit state modal ──
  const [editing, setEditing] = useState<StateWage | null>(null);
  const [form, setForm] = useState<{ state: string; rates: WageRates; effectiveDate: string; active: boolean }>({ state: '', rates: emptyRates(), effectiveDate: new Date().toISOString().slice(0, 10), active: true });
  const [open, setOpen] = useState(false);

  const openAdd = () => { setEditing(null); setForm({ state: '', rates: emptyRates(), effectiveDate: new Date().toISOString().slice(0, 10), active: true }); setOpen(true); };
  const openEdit = (r: StateWage) => { setEditing(r); setForm({ state: r.state, rates: { ...r.rates }, effectiveDate: r.effectiveDate, active: r.active }); setOpen(true); };

  const saveState = () => {
    if (!form.state.trim()) { ui.toast.error('State name is required.'); return; }
    const dupe = rows.find(r => r.state.toLowerCase() === form.state.trim().toLowerCase() && r.id !== editing?.id);
    if (dupe) { ui.toast.error('A wage rule for that state already exists.'); return; }
    const now = new Date().toISOString();
    if (editing) {
      // Log every changed rate to the revision history.
      const revs = SKILLS.filter(s => (Number(form.rates[s.key]) || 0) !== (Number(editing.rates[s.key]) || 0))
        .map(s => makeRevision({ state: form.state.trim(), skill: s.key, skillLabel: s.label, oldRate: editing.rates[s.key] || 0, newRate: Number(form.rates[s.key]) || 0, effectiveDate: form.effectiveDate, changedBy: performedBy, reason: 'Rate revision' }));
      if (revs.length) { addRevisions(companyId, revs); setRevisions(getRevisions(companyId)); }
      persistRows(rows.map(r => r.id === editing.id ? { ...r, state: form.state.trim(), rates: { ...form.rates }, effectiveDate: form.effectiveDate, active: form.active, updatedAt: now } : r));
      ui.toast.success(`Updated wage rule for ${form.state.trim()}${revs.length ? ` (${revs.length} rate change${revs.length > 1 ? 's' : ''} logged)` : ''}.`);
    } else {
      const created: StateWage = { id: `wm-${Date.now().toString(36)}`, state: form.state.trim(), rates: { ...form.rates }, effectiveDate: form.effectiveDate, active: form.active, updatedAt: now };
      const revs = SKILLS.filter(s => (Number(form.rates[s.key]) || 0) > 0).map(s => makeRevision({ state: created.state, skill: s.key, skillLabel: s.label, oldRate: 0, newRate: Number(form.rates[s.key]) || 0, effectiveDate: form.effectiveDate, changedBy: performedBy, reason: 'Initial rate' }));
      if (revs.length) { addRevisions(companyId, revs); setRevisions(getRevisions(companyId)); }
      persistRows([created, ...rows]);
      ui.toast.success(`Added wage rule for ${created.state}.`);
    }
    setOpen(false);
  };

  const removeState = async (r: StateWage) => {
    if (!(await ui.confirm({ message: `Remove the wage rule for ${r.state}? Revision history is preserved.`, variant: 'danger', confirmText: 'Remove' }))) return;
    persistRows(rows.filter(x => x.id !== r.id));
  };
  const toggleActive = (r: StateWage) => persistRows(rows.map(x => x.id === r.id ? { ...x, active: !x.active, updatedAt: new Date().toISOString() } : x));

  // ── Compliance settings (branch→state map + toggles) ──
  const setBranchState = (branch: string, state: string) => {
    const next = { ...settings, branchStateMap: { ...settings.branchStateMap, [branch]: state } };
    setSettings(next); saveSettings(companyId, next);
  };
  const setToggle = (key: 'enforceCompliance' | 'allowBelowMinimumOverride', val: boolean) => {
    const next = { ...settings, [key]: val }; setSettings(next); saveSettings(companyId, next);
  };
  const stateOptions = useMemo(() => rows.map(r => ({ value: r.state, label: r.state })), [rows]);

  if (!canEdit) {
    // Authorized roles still VIEW; this guard is a belt-and-braces for the rest.
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-gray-100">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5"><ShieldCheck size={14} className="text-indigo-600" /> Labour Compliance — State-Wise Minimum Wages</h3>
        {!canEdit && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Lock size={10} /> View Only</span>}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-4">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>{t.icon}{t.label}</button>
        ))}
      </div>

      {/* ── State Wage Master ── */}
      {tab === 'master' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-slate-500">Minimum wage (₹ / day) per state and skill category. Auto-applied during employee registration based on the branch's state.</p>
            {canEdit && <Button size="sm" icon={<Plus size={13} />} onClick={openAdd}>Add State</Button>}
          </div>
          <div className="overflow-x-auto border border-slate-100 rounded-lg">
            <Table>
              <Thead><Tr><Th>State</Th>{SKILLS.map(s => <Th key={s.key}>{s.label}</Th>)}<Th>Effective</Th><Th>Status</Th>{canEdit && <Th>Actions</Th>}</Tr></Thead>
              <Tbody>
                {rows.length === 0 && <Tr><Td colSpan={canEdit ? 8 : 7}><span className="text-xs text-slate-400">No states configured. Click "Add State".</span></Td></Tr>}
                {rows.map(r => (
                  <Tr key={r.id} className={r.active ? '' : 'opacity-50'}>
                    <Td><span className="font-semibold text-slate-800">{r.state}</span></Td>
                    {SKILLS.map(s => <Td key={s.key}><span className="text-[12px] font-medium text-slate-700 tabular-nums">{inr(r.rates[s.key])}</span></Td>)}
                    <Td><span className="text-[11px] text-slate-500">{r.effectiveDate}</span></Td>
                    <Td>{r.active ? <Badge variant="green">Active</Badge> : <Badge variant="gray">Inactive</Badge>}</Td>
                    {canEdit && (
                      <Td>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 rounded-md border border-slate-200 text-slate-400 hover:text-indigo-600"><Edit3 size={13} /></button>
                          <button onClick={() => toggleActive(r)} title={r.active ? 'Deactivate' : 'Activate'} className="p-1.5 rounded-md border border-slate-200 text-slate-400 hover:text-amber-600"><ShieldCheck size={13} /></button>
                          <button onClick={() => removeState(r)} title="Remove" className="p-1.5 rounded-md border border-slate-200 text-slate-400 hover:text-rose-600"><Trash2 size={13} /></button>
                        </div>
                      </Td>
                    )}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </div>
      )}

      {/* ── Skill Categories (reference) ── */}
      {tab === 'skills' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { k: 'Unskilled', d: 'Manual work needing no special training (helpers, cleaners, loaders).' },
            { k: 'Semi Skilled', d: 'Some training/experience (machine operators, assistants).' },
            { k: 'Skilled', d: 'Trade qualification or significant experience (electricians, fitters, technicians).' },
            { k: 'Highly Skilled', d: 'Specialised expertise / supervisory trade roles (senior technicians, foremen).' },
          ].map(s => (
            <div key={s.k} className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
              <p className="text-xs font-bold text-slate-800">{s.k}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{s.d}</p>
            </div>
          ))}
          <p className="sm:col-span-2 text-[10px] text-slate-400">Skill categories follow the statutory Minimum Wages Act classification and apply across all states. Rates per skill are set per-state in the State Wage Master.</p>
        </div>
      )}

      {/* ── Wage Revision History ── */}
      {tab === 'history' && (
        <div className="overflow-x-auto border border-slate-100 rounded-lg">
          <Table>
            <Thead><Tr><Th>When</Th><Th>State</Th><Th>Skill</Th><Th>Old</Th><Th>New</Th><Th>Effective</Th><Th>By</Th><Th>Reason</Th></Tr></Thead>
            <Tbody>
              {revisions.length === 0 && <Tr><Td colSpan={8}><span className="text-xs text-slate-400">No wage revisions recorded yet.</span></Td></Tr>}
              {revisions.map(r => (
                <Tr key={r.id}>
                  <Td><span className="text-[11px] text-slate-500 whitespace-nowrap">{new Date(r.at).toLocaleString('en-IN')}</span></Td>
                  <Td><span className="font-semibold text-slate-700">{r.state}</span></Td>
                  <Td>{r.skillLabel}</Td>
                  <Td><span className="text-slate-400 line-through">{inr(r.oldRate)}</span></Td>
                  <Td><span className="font-bold text-emerald-600">{inr(r.newRate)}</span></Td>
                  <Td><span className="text-[11px] text-slate-500">{r.effectiveDate}</span></Td>
                  <Td><span className="text-[11px]">{r.changedBy || '—'}</span></Td>
                  <Td><span className="text-[11px] text-slate-500">{r.reason}</span></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {/* ── Wage Compliance Settings ── */}
      {tab === 'settings' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 cursor-pointer">
              <input type="checkbox" disabled={!canEdit} checked={settings.enforceCompliance} onChange={e => setToggle('enforceCompliance', e.target.checked)} className="mt-0.5 accent-indigo-600" />
              <span><span className="text-xs font-bold text-slate-800 block">Enforce minimum-wage compliance</span><span className="text-[11px] text-slate-500">Show a warning when an entered wage is below the state minimum.</span></span>
            </label>
            <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 cursor-pointer">
              <input type="checkbox" disabled={!canEdit} checked={settings.allowBelowMinimumOverride} onChange={e => setToggle('allowBelowMinimumOverride', e.target.checked)} className="mt-0.5 accent-indigo-600" />
              <span><span className="text-xs font-bold text-slate-800 block">Allow override with reason</span><span className="text-[11px] text-slate-500">Permit saving a below-minimum wage when an authorized user records a reason (logged).</span></span>
            </label>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5"><MapPin size={13} className="text-indigo-600" /> Branch → State mapping</p>
            <p className="text-[11px] text-slate-500 mb-2">Branches don't store a state, so map each to its labour-law state. The registration wage panel uses this to auto-fetch the minimum wage.</p>
            {branchNames.length === 0 ? (
              <p className="text-[11px] text-slate-400">No branches in this company.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {branchNames.map(b => (
                  <div key={b} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold text-slate-700 flex-1 truncate">{b}</span>
                    <div className="w-40">
                      <Select disabled={!canEdit} value={settings.branchStateMap[b] || ''} onChange={e => setBranchState(b, e.target.value)} options={[{ value: '', label: '— Select state —' }, ...stateOptions]} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit state modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit Wage Rule — ${editing.state}` : 'Add State Wage Rule'} size="md"
        footer={canEdit && <><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={saveState}>{editing ? 'Save Changes' : 'Add State'}</Button></>}>
        <div className="space-y-3">
          <Input label="State *" value={form.state} disabled={!canEdit} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="e.g. Gujarat" />
          <div className="grid grid-cols-2 gap-3">
            {SKILLS.map(s => (
              <Input key={s.key} label={`${s.label} (₹/day)`} type="number" disabled={!canEdit} value={String(form.rates[s.key] ?? '')} onChange={e => setForm({ ...form, rates: { ...form.rates, [s.key]: Number(e.target.value) || 0 } })} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <Input label="Effective Date" type="date" disabled={!canEdit} value={form.effectiveDate} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} />
            <label className="flex items-center gap-2 pb-2 cursor-pointer"><input type="checkbox" disabled={!canEdit} checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="accent-indigo-600" /><span className="text-xs font-semibold text-slate-700">Active rule</span></label>
          </div>
          {editing && <p className="text-[10px] text-slate-400">Changed rates are recorded in the Wage Revision History with the effective date.</p>}
        </div>
      </Modal>
    </Card>
  );
};

export default LabourCompliance;
