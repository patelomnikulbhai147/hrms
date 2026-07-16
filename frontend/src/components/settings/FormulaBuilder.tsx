// ─────────────────────────────────────────────────────────────────────────────
// FormulaBuilder — the professional Payroll Formula Builder UI (Settings →
// Statutory Payroll Rules → Formula Builder). Replaces the old read-only "code
// terminal" cards + prompt() flow with editable cards: view / edit / live
// validation / live preview / save-with-confirm / version history + rollback /
// reset-to-default / search.
//
// It edits the same localStorage-backed `formulas` config the engine already
// used (via the parent's onCommit). It changes NO payroll calculation, engine,
// API, DB schema or business logic — only the editing experience.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { formatDateTime } from '@/utils/formatDate';
import {
  Plus, Search, Pencil, Save, RotateCcw, Trash2, History, Eye, EyeOff,
  CheckCircle2, AlertTriangle, Undo2, FunctionSquare, ShieldAlert, Calculator, X,
} from 'lucide-react';
import {
  KNOWN_VARIABLES, FUNCTIONS, labelFor, tokenOf, validateFormula, extractDependencies,
  findCircular, buildPreviewContext, evalFormula, prettyExpr, type FormulaLike,
} from '@/utils/formulaEngine';

interface Props {
  formulas: FormulaLike[];
  canEdit: boolean;          // Super Admin / Company Head → edit; HR → read-only
  performedBy: string;
  onCommit: (next: FormulaLike[], auditAction?: string) => void;
}

interface Draft { target: string; expression: string; description: string; status: string; reason: string; }

const NEW = '__new__';
const DEFAULT_FORMULAS: Record<string, string> = {
  Basic: 'CTC * 0.50', HRA: 'Basic * 0.40', DA: 'Basic * 0.20', PF: 'Basic * 0.12', ESI: 'Gross * 0.0075',
};

const OPERATORS: Array<[string, string]> = [
  ['+', ' + '], ['−', ' - '], ['×', ' * '], ['÷', ' / '], ['(', '('], [')', ')'],
];
const rupees = (n: number | null) => (n === null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`);

export const FormulaBuilder: React.FC<Props> = ({ formulas, canEdit, performedBy, onCommit }) => {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ target: '', expression: '', description: '', status: 'Active', reason: '' });
  const [sampleCTC, setSampleCTC] = useState(600000);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const exprRef = useRef<HTMLTextAreaElement>(null);

  const list = formulas || [];
  const allNames = useMemo(() => list.map((f) => f.target), [list]);
  const isNew = editingId === NEW;

  // Preview list with the in-progress draft applied (so preview/validation are live).
  const listForPreview = useMemo(() => {
    if (!editingId) return list;
    if (isNew) return [...list, { id: NEW, target: draft.target, expression: draft.expression }];
    return list.map((f) => (f.id === editingId ? { ...f, target: draft.target, expression: draft.expression } : f));
  }, [list, editingId, isNew, draft.target, draft.expression]);

  const ctx = useMemo(() => buildPreviewContext(listForPreview, sampleCTC), [listForPreview, sampleCTC]);

  const draftValidation = useMemo(() => {
    if (!editingId) return null;
    if (!draft.target.trim()) return { ok: false, message: 'Component name is required.' };
    const base = validateFormula(draft.expression, allNames.filter((_, i) => list[i]?.id !== editingId));
    if (!base.ok) return base;
    const cyc = findCircular(listForPreview);
    if (cyc && cyc.map(tokenOf).includes(tokenOf(draft.target))) return { ok: false, message: `Circular dependency: ${cyc.join(' → ')}` };
    return { ok: true, message: 'Valid formula' };
  }, [editingId, draft.target, draft.expression, allNames, list, listForPreview]);

  const draftPreview = useMemo(() => (editingId ? evalFormula(draft.expression, ctx) : null), [editingId, draft.expression, ctx]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f) =>
      f.target.toLowerCase().includes(q) || (f.expression || '').toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q));
  }, [list, search]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const startEdit = (f: FormulaLike) => {
    setEditingId(f.id);
    setDraft({ target: f.target, expression: f.expression, description: f.description || '', status: f.status || 'Active', reason: '' });
    setPreviewId(null);
  };
  const startNew = () => {
    setEditingId(NEW);
    setDraft({ target: '', expression: '', description: '', status: 'Active', reason: '' });
  };
  const cancelEdit = () => setEditingId(null);

  const insert = (text: string) => {
    const el = exprRef.current;
    const cur = draft.expression || '';
    if (!el) { setDraft((d) => ({ ...d, expression: cur + text })); return; }
    const s = el.selectionStart ?? cur.length;
    const e = el.selectionEnd ?? cur.length;
    const val = cur.slice(0, s) + text + cur.slice(e);
    setDraft((d) => ({ ...d, expression: val }));
    requestAnimationFrame(() => { try { el.focus(); const pos = s + text.length; el.setSelectionRange(pos, pos); } catch { /* noop */ } });
  };

  const versionsOf = (f: FormulaLike): any[] =>
    (f.history && f.history.length)
      ? f.history
      : (f.expression ? [{ version: 1, expression: f.expression, description: f.description, changedBy: f.createdBy || 'Super Admin', date: f.createdAt || '', reason: 'Initial version' }] : []);

  const saveDraft = async () => {
    if (!canEdit || !editingId) return;
    const v = draftValidation;
    if (!v || !v.ok) { ui.toast.error(v?.message || 'Please fix the formula first.'); return; }

    const preview = evalFormula(draft.expression, ctx);
    const ok = await ui.confirm({
      message:
        `Save Formula — please confirm\n\n` +
        `${draft.target}  =  ${prettyExpr(draft.expression)}\n\n` +
        `Preview · Sample CTC ₹${sampleCTC.toLocaleString('en-IN')}  →  ${rupees(preview)}\n\n` +
        `This is recorded in the change history and audit log.`,
      confirmText: 'Save Formula',
      cancelText: 'Keep Editing',
    });
    if (!ok) return;

    const now = new Date().toISOString();
    let next: FormulaLike[];
    if (isNew) {
      const entry = { version: 1, expression: draft.expression, description: draft.description, changedBy: performedBy, date: now, reason: draft.reason || 'Created' };
      next = [...list, { id: `f${Date.now()}`, target: draft.target.trim(), expression: draft.expression, description: draft.description, status: draft.status, createdBy: performedBy, createdAt: now, history: [entry] }];
    } else {
      next = list.map((f) => {
        if (f.id !== editingId) return f;
        const prev = versionsOf(f);
        const topV = prev[0]?.version || 0;
        const entry = { version: topV + 1, expression: draft.expression, description: draft.description, changedBy: performedBy, date: now, reason: draft.reason || 'Formula updated' };
        return { ...f, target: draft.target.trim(), expression: draft.expression, description: draft.description, status: draft.status, history: [entry, ...prev] };
      });
    }
    onCommit(next, `${isNew ? 'Created' : 'Updated'} formula "${draft.target.trim()}"`);
    ui.toast.success('Formula saved.');
    setEditingId(null);
  };

  const remove = async (f: FormulaLike) => {
    if (!canEdit) return;
    if (!(await ui.confirm({ message: `Delete the formula for "${f.target}"?\n\nThis removes the rule from the builder. It can be re-created later.`, variant: 'danger', confirmText: 'Delete' }))) return;
    onCommit(list.filter((x) => x.id !== f.id), `Deleted formula "${f.target}"`);
    ui.toast.success('Formula deleted.');
  };

  const restoreDefault = async (f: FormulaLike) => {
    if (!canEdit) return;
    const def = DEFAULT_FORMULAS[tokenOf(f.target)];
    if (!def) { ui.toast.info('No system default is defined for this component.'); return; }
    if (!(await ui.confirm({ message: `Restore the default formula for "${f.target}"?\n\n${f.target} = ${prettyExpr(def)}`, confirmText: 'Restore Default' }))) return;
    const now = new Date().toISOString();
    const next = list.map((x) => {
      if (x.id !== f.id) return x;
      const prev = versionsOf(x);
      const entry = { version: (prev[0]?.version || 0) + 1, expression: def, description: x.description, changedBy: performedBy, date: now, reason: 'Reset to system default' };
      return { ...x, expression: def, history: [entry, ...prev] };
    });
    onCommit(next, `Reset formula "${f.target}" to default`);
    ui.toast.success('Default formula restored.');
  };

  const rollback = async (f: FormulaLike, entry: any) => {
    if (!canEdit) return;
    if (!(await ui.confirm({ message: `Roll "${f.target}" back to version v${entry.version}?\n\n${f.target} = ${prettyExpr(entry.expression)}`, confirmText: 'Rollback' }))) return;
    const now = new Date().toISOString();
    const next = list.map((x) => {
      if (x.id !== f.id) return x;
      const prev = versionsOf(x);
      const ne = { version: (prev[0]?.version || 0) + 1, expression: entry.expression, description: entry.description ?? x.description, changedBy: performedBy, date: now, reason: `Rolled back to v${entry.version}` };
      return { ...x, expression: entry.expression, description: entry.description ?? x.description, history: [ne, ...prev] };
    });
    onCommit(next, `Rolled back formula "${f.target}" to v${entry.version}`);
    ui.toast.success(`Rolled back to v${entry.version}.`);
    setHistoryId(null);
  };

  // ── Render helpers ───────────────────────────────────────────────────────────
  const StatusBadge: React.FC<{ s?: string }> = ({ s }) => (
    (s || 'Active') === 'Active'
      ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><CheckCircle2 size={11} /> Active</span>
      : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">Inactive</span>
  );

  const editCard = (f?: FormulaLike) => {
    const v = draftValidation;
    return (
      <div className="rounded-2xl border-2 border-brand-200 bg-white shadow-sm p-4 ring-4 ring-brand-500/5">
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-600"><Pencil size={12} /> {isNew ? 'New Formula' : 'Editing'}</span>
          <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
        </div>

        {/* Component name */}
        <label className="block text-[11px] font-bold text-slate-500 mb-1">Component Name</label>
        <input
          value={draft.target}
          onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))}
          placeholder="e.g. Special Allowance"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15 mb-3"
        />

        {/* Formula */}
        <label className="block text-[11px] font-bold text-slate-500 mb-1">Formula</label>
        <textarea
          ref={exprRef}
          value={draft.expression}
          onChange={(e) => setDraft((d) => ({ ...d, expression: e.target.value }))}
          rows={2}
          placeholder="e.g. CTC * 0.50"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
        />

        {/* Variable + operator + function palette */}
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {KNOWN_VARIABLES.map((tok) => (
              <button key={tok} onClick={() => insert(tok)} className="px-2 py-1 rounded-md bg-brand-50 text-brand-700 border border-brand-100 text-[11px] font-semibold hover:bg-brand-100 transition-colors">{labelFor(tok)}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {OPERATORS.map(([label, ins]) => (
              <button key={label} onClick={() => insert(ins)} className="w-8 h-7 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[13px] font-bold hover:bg-slate-200 transition-colors">{label}</button>
            ))}
            {FUNCTIONS.map((fn) => (
              <button key={fn} onClick={() => insert(`${fn}(`)} className="px-2 h-7 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold hover:bg-slate-200 transition-colors">{fn}()</button>
            ))}
          </div>
        </div>

        {/* Live validation */}
        <div className="mt-3">
          {v?.ok
            ? <p className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600"><CheckCircle2 size={14} /> {v.message}</p>
            : <p className="flex items-center gap-1.5 text-[12px] font-semibold text-rose-600"><AlertTriangle size={14} /> {v?.message}</p>}
        </div>

        {/* Live preview */}
        <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Calculator size={12} /> Preview · CTC ₹{sampleCTC.toLocaleString('en-IN')}</span>
          <span className="text-[14px] font-extrabold text-slate-800">{rupees(draftPreview)}</span>
        </div>

        {/* Description + reason + status */}
        <div className="grid grid-cols-1 gap-2 mt-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Description</label>
            <input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="What is this component for?" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-700 focus:border-brand-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Reason for change</label>
              <input value={draft.reason} onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))} placeholder="Optional — logged in history" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-700 focus:border-brand-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Status</label>
              <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-700 focus:border-brand-500 focus:outline-none">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={cancelEdit}>Cancel</Button>
          <Button size="sm" onClick={saveDraft} disabled={!v?.ok} icon={<Save size={14} />}>Save Formula</Button>
        </div>
      </div>
    );
  };

  const viewCard = (f: FormulaLike) => {
    const deps = extractDependencies(f.expression, allNames);
    const val = evalFormula(f.expression, ctx);
    const versions = versionsOf(f);
    const hasDefault = !!DEFAULT_FORMULAS[tokenOf(f.target)];
    const showPreview = previewId === f.id;
    return (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 flex flex-col hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Component</p>
            <h5 className="text-[15px] font-extrabold text-slate-800 truncate">{f.target}</h5>
          </div>
          <StatusBadge s={f.status} />
        </div>

        {/* Formula box (clean, not a dev terminal) */}
        <div className="rounded-lg bg-brand-50/60 border border-brand-100 px-3 py-2 flex items-center gap-2">
          <FunctionSquare size={15} className="text-brand-500 shrink-0" />
          <span className="font-mono text-[13px] text-slate-800 truncate" title={f.expression}>{prettyExpr(f.expression) || '—'}</span>
        </div>

        {f.description && <p className="text-[12px] text-slate-500 mt-2 leading-snug">{f.description}</p>}

        {/* Depends on */}
        {deps.length > 0 && (
          <div className="mt-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Depends On</p>
            <div className="flex flex-wrap gap-1">
              {deps.map((d) => <span key={d} className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{labelFor(d)}</span>)}
            </div>
          </div>
        )}

        {/* Preview panel */}
        {showPreview && (
          <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 animate-in fade-in">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5"><Calculator size={12} /> Sample Employee</p>
            <div className="flex items-center justify-between text-[12px]"><span className="text-slate-500">CTC</span><span className="font-semibold text-slate-700">₹{sampleCTC.toLocaleString('en-IN')}</span></div>
            <div className="flex items-center justify-between text-[12px]"><span className="text-slate-500 font-mono">{prettyExpr(f.expression)}</span></div>
            <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-200"><span className="text-[12px] font-bold text-slate-600">{f.target}</span><span className="text-[15px] font-extrabold text-brand-700">{rupees(val)}</span></div>
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1 flex-wrap">
          <button onClick={() => setPreviewId(showPreview ? null : f.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-slate-600 hover:bg-slate-100">
            {showPreview ? <EyeOff size={13} /> : <Eye size={13} />} Preview
          </button>
          <button onClick={() => setHistoryId(f.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-slate-600 hover:bg-slate-100">
            <History size={13} /> History{versions.length ? ` (${versions.length})` : ''}
          </button>
          {canEdit && <>
            <button onClick={() => startEdit(f)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-brand-600 hover:bg-brand-50"><Pencil size={13} /> Edit</button>
            {hasDefault && <button onClick={() => restoreDefault(f)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-slate-600 hover:bg-slate-100"><RotateCcw size={13} /> Reset</button>}
            <button onClick={() => remove(f)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-rose-600 hover:bg-rose-50 ml-auto"><Trash2 size={13} /></button>
          </>}
        </div>
      </div>
    );
  };

  const historyFormula = historyId ? list.find((f) => f.id === historyId) : null;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-end gap-3 border-b border-slate-200 pb-3">
        <div>
          <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2"><FunctionSquare size={18} className="text-brand-600" /> Formula Builder</h4>
          <p className="text-xs text-slate-500 mt-1">Configure how each salary component is calculated — with live validation, preview, history and rollback. {list.length} formula{list.length === 1 ? '' : 's'}.</p>
        </div>
        {canEdit && <Button size="sm" onClick={startNew} icon={<Plus size={14} />} disabled={editingId === NEW}>Add Formula</Button>}
      </div>

      {/* Read-only banner */}
      {!canEdit && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          <span>You have <b>read-only</b> access to payroll formulas. Only a Company Head or Super Admin can edit them.</span>
        </div>
      )}

      {/* Toolbar — search + sample CTC */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Basic, HRA, PF, Bonus, Tax…" className="w-64 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 focus:border-brand-500 focus:outline-none" />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
          <span className="text-[11px] font-semibold text-slate-500">Preview sample CTC</span>
          <span className="text-slate-400 text-xs">₹</span>
          <input type="number" min={0} value={sampleCTC} onChange={(e) => setSampleCTC(Math.max(0, Number(e.target.value) || 0))} className="w-28 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none" />
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isNew && editCard()}
        {filtered.length === 0 && !isNew && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <FunctionSquare size={26} className="mx-auto mb-2 text-slate-300" />
            {list.length === 0 ? 'No formulas configured yet.' : 'No formulas match your search.'}
            {canEdit && list.length === 0 && ' Click “Add Formula” to create the first one.'}
          </div>
        )}
        {filtered.map((f) => (
          <React.Fragment key={f.id}>{editingId === f.id ? editCard(f) : viewCard(f)}</React.Fragment>
        ))}
      </div>

      {/* Version history modal */}
      {historyFormula && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setHistoryId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h5 className="text-sm font-bold text-slate-800 flex items-center gap-2"><History size={15} className="text-brand-600" /> Version History — {historyFormula.target}</h5>
              <button onClick={() => setHistoryId(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {versionsOf(historyFormula).length === 0 && <p className="text-center text-xs text-slate-400 py-6">No history recorded yet.</p>}
              {versionsOf(historyFormula).map((h: any, i: number) => (
                <div key={i} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-slate-700">Version {h.version}{i === 0 && <span className="ml-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">Current</span>}</span>
                    {canEdit && i !== 0 && <button onClick={() => rollback(historyFormula, h)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline"><Undo2 size={12} /> Rollback</button>}
                  </div>
                  <div className="mt-1.5 font-mono text-[12px] text-slate-700 bg-slate-50 border border-slate-100 rounded px-2 py-1">{prettyExpr(h.expression)}</div>
                  <p className="text-[10px] text-slate-400 mt-1.5">{h.reason || 'Updated'} · by <b className="text-slate-600">{h.changedBy || '—'}</b>{h.date ? ` · ${formatDateTime(h.date)}` : ''}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormulaBuilder;
