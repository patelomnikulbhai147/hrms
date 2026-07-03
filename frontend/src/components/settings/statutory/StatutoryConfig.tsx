// ─────────────────────────────────────────────────────────────────────────────
// StatutoryConfig — full configuration workspaces for the statutory compliance
// modules that previously rendered a "<X> Module Engine" placeholder inside the
// PayrollComplianceEngine (ESIC, Professional Tax, Labour Welfare Fund, Overtime).
//
// Every module shares ONE layout (ConfigModuleShell) so users learn a single
// interface: Header + Status badge, then tabs — Overview · Configuration · Rules ·
// Validation · Preview · History — plus a Save / Reset action bar. Persistence is
// the engine's existing per-company localStorage model (unchanged); this file only
// owns the UI, validation and the before-save preview calculators.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { formatDateTime } from '@/utils/formatDate';
import {
  ShieldCheck, Activity, Scale, Landmark, CheckCircle2, AlertTriangle, XCircle,
  Save, RotateCcw, Plus, Trash2, History as HistoryIcon, Info, Calculator,
} from 'lucide-react';

// ── Small shared primitives ──────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500';

// A labelled control with contextual help + inline error. Wrap any input/select.
const Field: React.FC<{ label: string; hint?: string; error?: string; children: React.ReactNode }> = ({ label, hint, error, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
    {children}
    {error ? <p className="text-[10px] text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle size={10} /> {error}</p>
      : hint ? <p className="text-[10px] text-slate-400 mt-1 leading-snug">{hint}</p> : null}
  </div>
);

const StatusBadge: React.FC<{ enabled: boolean }> = ({ enabled }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
    {enabled ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {enabled ? 'Active' : 'Inactive'}
  </span>
);

export type Issue = { level: 'error' | 'warning'; msg: string };

// ── The reusable module shell ────────────────────────────────────────────────

const TABS = ['overview', 'configuration', 'rules', 'validation', 'preview', 'history'] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview', configuration: 'Configuration', rules: 'Rules',
  validation: 'Validation', preview: 'Preview', history: 'History',
};

export interface OverviewItem { label: string; value: React.ReactNode }

export interface ConfigModuleShellProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  enabled: boolean;
  canEdit: boolean;
  overview: OverviewItem[];
  issues: Issue[];
  historyCount: number;
  onSave: () => void;
  onReset: () => void;
  saving?: boolean;
  children: (tab: Tab) => React.ReactNode;
}

export const ConfigModuleShell: React.FC<ConfigModuleShellProps> = ({
  icon: Icon, title, description, enabled, canEdit, overview, issues, historyCount, onSave, onReset, saving, children,
}) => {
  const [tab, setTab] = useState<Tab>('overview');
  const errorCount = issues.filter(i => i.level === 'error').length;
  const warnCount = issues.filter(i => i.level === 'warning').length;

  const badgeFor = (t: Tab): React.ReactNode => {
    if (t === 'validation' && (errorCount || warnCount)) {
      return <span className={`ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${errorCount ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{errorCount || warnCount}</span>;
    }
    if (t === 'history' && historyCount) return <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{historyCount}</span>;
    return null;
  };

  return (
    <div className="animate-in fade-in duration-300">
      {/* Module header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Icon size={20} /></div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-800 text-lg leading-tight">{title}</h4>
              <StatusBadge enabled={enabled} />
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">{description}</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 mt-3 mb-4">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center ${tab === t ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            {TAB_LABEL[t]}{badgeFor(t)}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="min-h-[280px]">
        {tab === 'overview' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {overview.map((o, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{o.label}</p>
                <p className="text-sm font-bold text-slate-800 mt-1 break-words">{o.value}</p>
              </div>
            ))}
          </div>
        ) : children(tab)}
      </div>

      {/* Action bar */}
      {canEdit && (
        <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-200">
          <Button variant="outline" size="sm" icon={<RotateCcw size={13} />} onClick={onReset}>Reset</Button>
          <Button size="sm" icon={<Save size={13} />} loading={saving} disabled={errorCount > 0}
            onClick={onSave} title={errorCount > 0 ? 'Resolve validation errors first' : undefined}>
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
};

// ── Shared tab renderers ─────────────────────────────────────────────────────

export const ValidationTab: React.FC<{ issues: Issue[] }> = ({ issues }) => {
  if (!issues.length) {
    return (
      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <CheckCircle2 className="text-emerald-600" size={22} />
        <div><p className="text-sm font-bold text-emerald-700">All checks passed</p><p className="text-xs text-emerald-600">This configuration is valid and safe to save.</p></div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {issues.map((i, idx) => (
        <div key={idx} className={`flex items-start gap-3 rounded-xl p-3 border ${i.level === 'error' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
          {i.level === 'error' ? <XCircle className="text-rose-500 mt-0.5 shrink-0" size={16} /> : <AlertTriangle className="text-amber-500 mt-0.5 shrink-0" size={16} />}
          <p className={`text-xs font-semibold ${i.level === 'error' ? 'text-rose-700' : 'text-amber-700'}`}>{i.msg}</p>
        </div>
      ))}
    </div>
  );
};

export const HistoryTab: React.FC<{ history: any[]; canEdit: boolean; onRollback: (entry: any) => void }> = ({ history, canEdit, onRollback }) => {
  if (!history.length) {
    return <div className="text-center py-12 text-slate-400"><HistoryIcon size={36} className="mx-auto mb-2 text-slate-200" /><p className="text-sm">No saved versions yet. Your first save will appear here.</p></div>;
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
          <tr><th className="p-3">Version</th><th className="p-3">Changed By</th><th className="p-3">Date</th><th className="p-3">Reason</th><th className="p-3 text-right">Action</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {history.map((h, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="p-3 font-bold text-slate-800">v{h.version}{idx === 0 && <span className="ml-1.5 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">CURRENT</span>}</td>
              <td className="p-3 text-slate-600">{h.changedBy}</td>
              <td className="p-3 text-slate-500 whitespace-nowrap">{h.date ? formatDateTime(h.date) : '—'}</td>
              <td className="p-3 text-slate-600">{h.reason || '—'}</td>
              <td className="p-3 text-right">
                {canEdit && idx !== 0 && (
                  <button className="text-[11px] font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1" onClick={() => onRollback(h)}>
                    <RotateCcw size={12} /> Rollback
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// A simple, functional rule list — "IF <field> <op> <value> THEN <action>".
export const RulesTab: React.FC<{ rules: any[]; canEdit: boolean; onChange: (rules: any[]) => void; fieldLabel: string }> = ({ rules, canEdit, onChange, fieldLabel }) => {
  const add = () => onChange([...(rules || []), { id: `r${rules.length + 1}_${rules.length}`, field: fieldLabel, op: 'lte', value: 0, action: 'apply' }]);
  const update = (idx: number, patch: any) => onChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const remove = (idx: number) => onChange(rules.filter((_, i) => i !== idx));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 flex items-center gap-1.5"><Info size={13} className="text-blue-500" /> Rules are evaluated top-to-bottom; the first match decides applicability.</p>
        {canEdit && <Button size="sm" variant="outline" icon={<Plus size={13} />} onClick={add}>Add Rule</Button>}
      </div>
      {(!rules || rules.length === 0) && <div className="text-center py-8 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">No rules defined. The base configuration applies to everyone.</div>}
      {(rules || []).map((r, idx) => (
        <div key={r.id || idx} className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl p-3">
          <span className="text-[11px] font-bold text-slate-400">IF</span>
          <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded">{r.field || fieldLabel}</span>
          <select disabled={!canEdit} value={r.op} onChange={e => update(idx, { op: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 disabled:bg-slate-50">
            <option value="lte">≤ (less or equal)</option>
            <option value="lt">&lt; (less than)</option>
            <option value="gt">&gt; (greater than)</option>
            <option value="gte">≥ (greater or equal)</option>
            <option value="eq">= (equals)</option>
          </select>
          <input type="number" disabled={!canEdit} value={r.value} onChange={e => update(idx, { value: Number(e.target.value) })} className="w-28 text-xs border border-slate-200 rounded-lg px-2 py-1.5 disabled:bg-slate-50" />
          <span className="text-[11px] font-bold text-slate-400">THEN</span>
          <select disabled={!canEdit} value={r.action} onChange={e => update(idx, { action: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 disabled:bg-slate-50">
            <option value="apply">Apply</option>
            <option value="skip">Do not apply</option>
          </select>
          {canEdit && <button className="ml-auto p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50" onClick={() => remove(idx)}><Trash2 size={14} /></button>}
        </div>
      ))}
    </div>
  );
};

// Preview result stat row.
const PreviewStat: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone = 'text-slate-800' }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
    <p className={`text-lg font-black mt-1 ${tone}`}>{value}</p>
  </div>
);

const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;

// ── Pure preview calculators (exported for reuse/testing) ─────────────────────

export function calcEsic(gross: number, cfg: any) {
  const g = Number(gross) || 0;
  const ceiling = Number(cfg.wageLimit) || 0;
  if (!cfg.enabled) return { applicable: false, employee: 0, employer: 0, total: 0, note: 'ESIC is disabled for this company.' };
  const applicable = ceiling <= 0 ? true : g <= ceiling;
  if (!applicable) return { applicable: false, employee: 0, employer: 0, total: 0, note: `Gross ${inr(g)} exceeds the wage ceiling ${inr(ceiling)} — ESIC is not applicable.` };
  const round = (n: number) => (cfg.roundOff === 'none' ? Math.round(n * 100) / 100 : Math.round(n));
  const employee = round(g * (Number(cfg.employeePct) || 0) / 100);
  const employer = round(g * (Number(cfg.employerPct) || 0) / 100);
  return { applicable: true, employee, employer, total: employee + employer, note: 'ESIC is applicable for this wage.' };
}

export function calcPt(gross: number, cfg: any) {
  const g = Number(gross) || 0;
  if (!cfg.enabled) return { amount: 0, note: 'Professional Tax is disabled.' };
  const amount = Number(cfg.amount) || 0;
  return { amount, note: `${cfg.state || 'State'} · ${cfg.frequency || 'Monthly'} · applied on gross ${inr(g)}.` };
}

export function calcLwf(cfg: any) {
  if (!cfg.enabled) return { employee: 0, employer: 0, total: 0, note: 'Labour Welfare Fund is disabled.' };
  const employee = Number(cfg.employeeContrib) || 0;
  const employer = Number(cfg.employerContrib) || 0;
  return { employee, employer, total: employee + employer, note: `${cfg.state || 'State'} · ${cfg.frequency || 'Half-Yearly'} contribution.` };
}

export function calcOt(hours: number, hourlyRate: number, type: 'normal' | 'holiday' | 'weekend', cfg: any) {
  const h = Number(hours) || 0;
  const rate = Number(hourlyRate) || 0;
  const mult = type === 'holiday' ? (Number(cfg.holidayMultiplier) || 1) : type === 'weekend' ? (Number(cfg.weekendMultiplier) || 1) : (Number(cfg.multiplier) || 1);
  const pay = h * rate * mult;
  const overCap = cfg.maxPerDay && h > Number(cfg.maxPerDay);
  return { mult, pay, overCap, note: overCap ? `Warning: ${h}h exceeds the ${cfg.maxPerDay}h/day cap.` : `${type} overtime at ${mult}× rate.` };
}

// ── Validators ───────────────────────────────────────────────────────────────

const pctIssue = (v: any, label: string): Issue | null => {
  const n = Number(v);
  if (v === '' || v === null || Number.isNaN(n)) return { level: 'error', msg: `${label} is missing or not a number.` };
  if (n < 0 || n > 100) return { level: 'error', msg: `${label} (${v}) must be between 0 and 100.` };
  return null;
};
const dupRuleIssue = (rules: any[]): Issue | null => {
  const seen = new Set<string>();
  for (const r of rules || []) {
    const k = `${r.op}:${r.value}`;
    if (seen.has(k)) return { level: 'warning', msg: `Duplicate rule detected (${r.op} ${r.value}). Only the first will take effect.` };
    seen.add(k);
  }
  return null;
};
const compact = (arr: (Issue | null)[]): Issue[] => arr.filter(Boolean) as Issue[];

export function validateEsic(cfg: any): Issue[] {
  return compact([
    pctIssue(cfg.employeePct, 'Employee contribution %'),
    pctIssue(cfg.employerPct, 'Employer contribution %'),
    (!cfg.wageLimit || Number(cfg.wageLimit) <= 0) ? { level: 'error', msg: 'Salary (wage) ceiling is missing.' } : null,
    !cfg.effectiveDate ? { level: 'error', msg: 'Effective date is missing.' } : null,
    dupRuleIssue(cfg.rules),
  ]);
}
export function validatePt(cfg: any): Issue[] {
  return compact([
    (cfg.amount === '' || Number.isNaN(Number(cfg.amount)) || Number(cfg.amount) < 0) ? { level: 'error', msg: 'Tax amount is missing or invalid.' } : null,
    !cfg.state ? { level: 'error', msg: 'State selection is missing.' } : null,
    !cfg.effectiveDate ? { level: 'warning', msg: 'No effective date set — defaults to today.' } : null,
    dupRuleIssue(cfg.rules),
  ]);
}
export function validateLwf(cfg: any): Issue[] {
  return compact([
    (Number(cfg.employeeContrib) < 0 || Number.isNaN(Number(cfg.employeeContrib))) ? { level: 'error', msg: 'Employee share is invalid.' } : null,
    (Number(cfg.employerContrib) < 0 || Number.isNaN(Number(cfg.employerContrib))) ? { level: 'error', msg: 'Employer share is invalid.' } : null,
    !cfg.state ? { level: 'error', msg: 'State selection is missing.' } : null,
    !cfg.frequency ? { level: 'warning', msg: 'Contribution frequency not set.' } : null,
  ]);
}
export function validateOvertime(cfg: any): Issue[] {
  return compact([
    (Number(cfg.multiplier) < 1 || Number.isNaN(Number(cfg.multiplier))) ? { level: 'warning', msg: 'Standard OT multiplier is below 1× — most statutes require ≥ 2×.' } : null,
    (!cfg.maxPerDay || Number(cfg.maxPerDay) <= 0) ? { level: 'warning', msg: 'No maximum OT hours/day cap set.' } : null,
    (Number(cfg.holidayMultiplier) < 1) ? { level: 'error', msg: 'Holiday multiplier must be at least 1×.' } : null,
  ]);
}

const STATES = ['Maharashtra', 'Gujarat', 'Karnataka', 'Tamil Nadu', 'Delhi', 'West Bengal', 'Telangana', 'Madhya Pradesh', 'Haryana', 'Punjab'];
const FREQ = [{ value: 'Monthly', label: 'Monthly' }, { value: 'Quarterly', label: 'Quarterly' }, { value: 'Half-Yearly', label: 'Half-Yearly' }, { value: 'Annual', label: 'Annual' }];

// ── Module: ESIC ─────────────────────────────────────────────────────────────

interface ModuleProps {
  cfg: any;
  canEdit: boolean;
  onChange: (patch: any) => void;   // shallow-merge into the module's config
  onSave: (reason?: string) => void;
  onReset: () => void;
  onRollback: (snapshot: any) => void;
  saving?: boolean;
}

export const EsicSettings: React.FC<ModuleProps> = ({ cfg, canEdit, onChange, onSave, onReset, onRollback, saving }) => {
  const issues = useMemo(() => validateEsic(cfg), [cfg]);
  const [sample, setSample] = useState('18500');
  const preview = useMemo(() => calcEsic(Number(sample), cfg), [sample, cfg]);
  const history = cfg.history || [];

  const overview: OverviewItem[] = [
    { label: 'Current Status', value: cfg.enabled ? 'Active' : 'Inactive' },
    { label: 'Last Modified', value: history[0]?.date ? formatDateTime(history[0].date) : 'Never' },
    { label: 'Effective Date', value: cfg.effectiveDate || '—' },
    { label: 'Rule Version', value: `v${history[0]?.version || 1}` },
    { label: 'Companies Using', value: '1 (this company)' },
    { label: 'Wage Ceiling', value: inr(Number(cfg.wageLimit) || 0) },
  ];

  return (
    <ConfigModuleShell icon={ShieldCheck} title="ESIC Settings" enabled={!!cfg.enabled} canEdit={canEdit}
      description="Configure all Employee State Insurance rules used throughout Payroll."
      overview={overview} issues={issues} historyCount={history.length}
      saving={saving} onSave={() => onSave()} onReset={onReset}>
      {(tab) => (
        <>
          {tab === 'configuration' && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-blue-600 h-4 w-4" checked={!!cfg.enabled} disabled={!canEdit} onChange={e => onChange({ enabled: e.target.checked })} />
                <span className="text-xs font-semibold text-slate-700">Enable ESIC deductions for this company</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Effective From" hint="Date from which these rates apply to payroll runs.">
                  <input type="date" className={inputCls} value={cfg.effectiveDate || ''} disabled={!canEdit} onChange={e => onChange({ effectiveDate: e.target.value })} />
                </Field>
                <Field label="Salary (Wage) Ceiling ₹" hint="ESIC applies only when monthly gross is at or below this. Statutory ceiling is ₹21,000.">
                  <input type="number" className={inputCls} value={cfg.wageLimit} disabled={!canEdit} onChange={e => onChange({ wageLimit: Number(e.target.value) })} />
                </Field>
                <Field label="Employee Contribution %" hint="Statutory rate is 0.75% of gross wages.">
                  <input type="number" step="0.01" className={inputCls} value={cfg.employeePct} disabled={!canEdit} onChange={e => onChange({ employeePct: Number(e.target.value) })} />
                </Field>
                <Field label="Employer Contribution %" hint="Statutory rate is 3.25% of gross wages.">
                  <input type="number" step="0.01" className={inputCls} value={cfg.employerPct} disabled={!canEdit} onChange={e => onChange({ employerPct: Number(e.target.value) })} />
                </Field>
                <Field label="Round Off" hint="How computed contributions are rounded on the payslip.">
                  <select className={inputCls} value={cfg.roundOff || 'nearest'} disabled={!canEdit} onChange={e => onChange({ roundOff: e.target.value })}>
                    <option value="nearest">Nearest rupee</option>
                    <option value="none">No rounding (paise)</option>
                  </select>
                </Field>
                <Field label="Calculation Frequency">
                  <select className={inputCls} value={cfg.frequency || 'Monthly'} disabled={!canEdit} onChange={e => onChange({ frequency: e.target.value })}>
                    {FREQ.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </Field>
                <Field label="ESIC Registration Number" hint="17-digit employer code issued by ESIC.">
                  <input className={inputCls} value={cfg.regNo || ''} disabled={!canEdit} onChange={e => onChange({ regNo: e.target.value })} />
                </Field>
                <Field label="Applicable Employee Types" hint="Comma-separated, e.g. Permanent, Contract. Blank = all.">
                  <input className={inputCls} value={cfg.employeeTypes || ''} disabled={!canEdit} placeholder="All employee types" onChange={e => onChange({ employeeTypes: e.target.value })} />
                </Field>
              </div>
            </div>
          )}
          {tab === 'rules' && <RulesTab rules={cfg.rules || []} canEdit={canEdit} fieldLabel="Gross Salary" onChange={r => onChange({ rules: r })} />}
          {tab === 'validation' && <ValidationTab issues={issues} />}
          {tab === 'preview' && (
            <div className="space-y-4">
              <Field label="Sample Gross Salary ₹" hint="Enter a wage to preview the deduction before saving.">
                <input type="number" className={`${inputCls} max-w-xs`} value={sample} onChange={e => setSample(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <PreviewStat label="Employee" value={inr(preview.employee)} tone="text-rose-600" />
                <PreviewStat label="Employer" value={inr(preview.employer)} tone="text-blue-600" />
                <PreviewStat label="Total Deduction" value={inr(preview.total)} tone="text-slate-900" />
                <PreviewStat label="Applicable" value={preview.applicable ? 'Yes' : 'No'} tone={preview.applicable ? 'text-emerald-600' : 'text-slate-400'} />
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-1.5"><Calculator size={13} className="text-blue-500" /> {preview.note}</p>
            </div>
          )}
          {tab === 'history' && <HistoryTab history={history} canEdit={canEdit} onRollback={onRollback} />}
        </>
      )}
    </ConfigModuleShell>
  );
};

// ── Module: Professional Tax ─────────────────────────────────────────────────

export const PtSettings: React.FC<ModuleProps> = ({ cfg, canEdit, onChange, onSave, onReset, onRollback, saving }) => {
  const issues = useMemo(() => validatePt(cfg), [cfg]);
  const [sample, setSample] = useState('25000');
  const preview = useMemo(() => calcPt(Number(sample), cfg), [sample, cfg]);
  const history = cfg.history || [];
  const overview: OverviewItem[] = [
    { label: 'Current Status', value: cfg.enabled ? 'Active' : 'Inactive' },
    { label: 'State', value: cfg.state || '—' },
    { label: 'Monthly Amount', value: inr(Number(cfg.amount) || 0) },
    { label: 'Frequency', value: cfg.frequency || 'Monthly' },
    { label: 'Rule Version', value: `v${history[0]?.version || 1}` },
    { label: 'Last Modified', value: history[0]?.date ? formatDateTime(history[0].date) : 'Never' },
  ];
  return (
    <ConfigModuleShell icon={Landmark} title="Professional Tax Settings" enabled={!!cfg.enabled} canEdit={canEdit}
      description="State-wise Professional Tax slabs and deduction rules applied in Payroll."
      overview={overview} issues={issues} historyCount={history.length} saving={saving} onSave={() => onSave()} onReset={onReset}>
      {(tab) => (
        <>
          {tab === 'configuration' && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-blue-600 h-4 w-4" checked={!!cfg.enabled} disabled={!canEdit} onChange={e => onChange({ enabled: e.target.checked })} />
                <span className="text-xs font-semibold text-slate-700">Enable Professional Tax deductions</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="State" hint="PT is levied by the state government; slabs vary by state.">
                  <select className={inputCls} value={cfg.state || ''} disabled={!canEdit} onChange={e => onChange({ state: e.target.value })}>
                    <option value="">Select state…</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Monthly Tax Amount ₹" hint="Flat monthly PT for the applicable slab (e.g. ₹200 in Maharashtra).">
                  <input type="number" className={inputCls} value={cfg.amount} disabled={!canEdit} onChange={e => onChange({ amount: Number(e.target.value) })} />
                </Field>
                <Field label="Effective From">
                  <input type="date" className={inputCls} value={cfg.effectiveDate || ''} disabled={!canEdit} onChange={e => onChange({ effectiveDate: e.target.value })} />
                </Field>
                <Field label="Calculation Frequency">
                  <select className={inputCls} value={cfg.frequency || 'Monthly'} disabled={!canEdit} onChange={e => onChange({ frequency: e.target.value })}>
                    {FREQ.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </Field>
                <label className="flex items-center gap-2 cursor-pointer md:col-span-2">
                  <input type="checkbox" className="accent-blue-600 h-4 w-4" checked={!!cfg.genderRules} disabled={!canEdit} onChange={e => onChange({ genderRules: e.target.checked })} />
                  <span className="text-xs font-semibold text-slate-700">Apply gender-based exemptions (where the state allows)</span>
                </label>
              </div>
            </div>
          )}
          {tab === 'rules' && <RulesTab rules={cfg.rules || []} canEdit={canEdit} fieldLabel="Monthly Gross" onChange={r => onChange({ rules: r })} />}
          {tab === 'validation' && <ValidationTab issues={issues} />}
          {tab === 'preview' && (
            <div className="space-y-4">
              <Field label="Sample Gross Salary ₹"><input type="number" className={`${inputCls} max-w-xs`} value={sample} onChange={e => setSample(e.target.value)} /></Field>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <PreviewStat label="PT Deduction" value={inr(preview.amount)} tone="text-rose-600" />
                <PreviewStat label="Frequency" value={cfg.frequency || 'Monthly'} />
                <PreviewStat label="State" value={cfg.state || '—'} />
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-1.5"><Calculator size={13} className="text-blue-500" /> {preview.note}</p>
            </div>
          )}
          {tab === 'history' && <HistoryTab history={history} canEdit={canEdit} onRollback={onRollback} />}
        </>
      )}
    </ConfigModuleShell>
  );
};

// ── Module: Labour Welfare Fund ──────────────────────────────────────────────

export const LwfSettings: React.FC<ModuleProps> = ({ cfg, canEdit, onChange, onSave, onReset, onRollback, saving }) => {
  const issues = useMemo(() => validateLwf(cfg), [cfg]);
  const preview = useMemo(() => calcLwf(cfg), [cfg]);
  const history = cfg.history || [];
  const overview: OverviewItem[] = [
    { label: 'Current Status', value: cfg.enabled ? 'Active' : 'Inactive' },
    { label: 'State', value: cfg.state || '—' },
    { label: 'Employee Share', value: inr(Number(cfg.employeeContrib) || 0) },
    { label: 'Employer Share', value: inr(Number(cfg.employerContrib) || 0) },
    { label: 'Frequency', value: cfg.frequency || 'Half-Yearly' },
    { label: 'Rule Version', value: `v${history[0]?.version || 1}` },
  ];
  return (
    <ConfigModuleShell icon={Scale} title="Labour Welfare Fund Settings" enabled={!!cfg.enabled} canEdit={canEdit}
      description="Employee and employer LWF contribution rules and deduction frequency."
      overview={overview} issues={issues} historyCount={history.length} saving={saving} onSave={() => onSave()} onReset={onReset}>
      {(tab) => (
        <>
          {tab === 'configuration' && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-blue-600 h-4 w-4" checked={!!cfg.enabled} disabled={!canEdit} onChange={e => onChange({ enabled: e.target.checked })} />
                <span className="text-xs font-semibold text-slate-700">Enable Labour Welfare Fund deductions</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="State" hint="LWF is state-specific; contribution amounts and frequency are set by each state's board.">
                  <select className={inputCls} value={cfg.state || ''} disabled={!canEdit} onChange={e => onChange({ state: e.target.value })}>
                    <option value="">Select state…</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Contribution Frequency" hint="How often LWF is deducted (commonly half-yearly).">
                  <select className={inputCls} value={cfg.frequency || 'Half-Yearly'} disabled={!canEdit} onChange={e => onChange({ frequency: e.target.value })}>
                    {FREQ.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </Field>
                <Field label="Employee Share ₹" hint="Fixed amount deducted from the employee each cycle.">
                  <input type="number" className={inputCls} value={cfg.employeeContrib} disabled={!canEdit} onChange={e => onChange({ employeeContrib: Number(e.target.value) })} />
                </Field>
                <Field label="Employer Share ₹" hint="Fixed amount contributed by the employer each cycle.">
                  <input type="number" className={inputCls} value={cfg.employerContrib} disabled={!canEdit} onChange={e => onChange({ employerContrib: Number(e.target.value) })} />
                </Field>
              </div>
            </div>
          )}
          {tab === 'rules' && <RulesTab rules={cfg.rules || []} canEdit={canEdit} fieldLabel="Monthly Gross" onChange={r => onChange({ rules: r })} />}
          {tab === 'validation' && <ValidationTab issues={issues} />}
          {tab === 'preview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <PreviewStat label="Employee Share" value={inr(preview.employee)} tone="text-rose-600" />
                <PreviewStat label="Employer Share" value={inr(preview.employer)} tone="text-blue-600" />
                <PreviewStat label={`Total / ${cfg.frequency || 'cycle'}`} value={inr(preview.total)} tone="text-slate-900" />
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-1.5"><Calculator size={13} className="text-blue-500" /> {preview.note}</p>
            </div>
          )}
          {tab === 'history' && <HistoryTab history={history} canEdit={canEdit} onRollback={onRollback} />}
        </>
      )}
    </ConfigModuleShell>
  );
};

// ── Module: Overtime ─────────────────────────────────────────────────────────

export const OvertimeSettings: React.FC<ModuleProps> = ({ cfg, canEdit, onChange, onSave, onReset, onRollback, saving }) => {
  const issues = useMemo(() => validateOvertime(cfg), [cfg]);
  const [hrs, setHrs] = useState('3');
  const [rate, setRate] = useState('150');
  const [type, setType] = useState<'normal' | 'holiday' | 'weekend'>('normal');
  const preview = useMemo(() => calcOt(Number(hrs), Number(rate), type, cfg), [hrs, rate, type, cfg]);
  const history = cfg.history || [];
  const overview: OverviewItem[] = [
    { label: 'Current Status', value: cfg.enabled ? 'Active' : 'Inactive' },
    { label: 'Standard Multiplier', value: `${cfg.multiplier || 1}×` },
    { label: 'Holiday Multiplier', value: `${cfg.holidayMultiplier || 1}×` },
    { label: 'Weekend Multiplier', value: `${cfg.weekendMultiplier || 1}×` },
    { label: 'Max OT / Day', value: `${cfg.maxPerDay || 0} h` },
    { label: 'Max OT / Month', value: `${cfg.maxPerMonth || 0} h` },
  ];
  return (
    <ConfigModuleShell icon={Activity} title="Overtime Settings" enabled={!!cfg.enabled} canEdit={canEdit}
      description="Overtime multipliers, hour caps, and holiday/weekend rules used to compute OT pay."
      overview={overview} issues={issues} historyCount={history.length} saving={saving} onSave={() => onSave()} onReset={onReset}>
      {(tab) => (
        <>
          {tab === 'configuration' && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-blue-600 h-4 w-4" checked={!!cfg.enabled} disabled={!canEdit} onChange={e => onChange({ enabled: e.target.checked })} />
                <span className="text-xs font-semibold text-slate-700">Enable overtime pay computation</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Standard OT Multiplier" hint="Multiplier on the hourly rate for regular overtime (statute usually ≥ 2×).">
                  <input type="number" step="0.1" className={inputCls} value={cfg.multiplier} disabled={!canEdit} onChange={e => onChange({ multiplier: Number(e.target.value) })} />
                </Field>
                <Field label="Holiday OT Multiplier" hint="Rate for work on public/company holidays.">
                  <input type="number" step="0.1" className={inputCls} value={cfg.holidayMultiplier} disabled={!canEdit} onChange={e => onChange({ holidayMultiplier: Number(e.target.value) })} />
                </Field>
                <Field label="Weekend OT Multiplier" hint="Rate for work on weekly-off days.">
                  <input type="number" step="0.1" className={inputCls} value={cfg.weekendMultiplier} disabled={!canEdit} onChange={e => onChange({ weekendMultiplier: Number(e.target.value) })} />
                </Field>
                <Field label="Max OT Hours / Day" hint="Daily cap; hours beyond this flag a compliance warning.">
                  <input type="number" className={inputCls} value={cfg.maxPerDay} disabled={!canEdit} onChange={e => onChange({ maxPerDay: Number(e.target.value) })} />
                </Field>
                <Field label="Max OT Hours / Month" hint="Monthly cap per employee.">
                  <input type="number" className={inputCls} value={cfg.maxPerMonth} disabled={!canEdit} onChange={e => onChange({ maxPerMonth: Number(e.target.value) })} />
                </Field>
              </div>
            </div>
          )}
          {tab === 'rules' && <RulesTab rules={cfg.rules || []} canEdit={canEdit} fieldLabel="OT Hours/Day" onChange={r => onChange({ rules: r })} />}
          {tab === 'validation' && <ValidationTab issues={issues} />}
          {tab === 'preview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="OT Hours"><input type="number" className={inputCls} value={hrs} onChange={e => setHrs(e.target.value)} /></Field>
                <Field label="Hourly Rate ₹"><input type="number" className={inputCls} value={rate} onChange={e => setRate(e.target.value)} /></Field>
                <Field label="OT Type">
                  <select className={inputCls} value={type} onChange={e => setType(e.target.value as any)}>
                    <option value="normal">Normal day</option>
                    <option value="holiday">Holiday</option>
                    <option value="weekend">Weekend</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <PreviewStat label="Applied Multiplier" value={`${preview.mult}×`} />
                <PreviewStat label="Overtime Pay" value={inr(preview.pay)} tone="text-emerald-600" />
                <PreviewStat label="Within Cap" value={preview.overCap ? 'No' : 'Yes'} tone={preview.overCap ? 'text-rose-600' : 'text-emerald-600'} />
              </div>
              <p className={`text-xs flex items-center gap-1.5 ${preview.overCap ? 'text-rose-600' : 'text-slate-500'}`}><Calculator size={13} /> {preview.note}</p>
            </div>
          )}
          {tab === 'history' && <HistoryTab history={history} canEdit={canEdit} onRollback={onRollback} />}
        </>
      )}
    </ConfigModuleShell>
  );
};
