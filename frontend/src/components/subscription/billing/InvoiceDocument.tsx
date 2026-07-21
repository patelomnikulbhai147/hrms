// ─────────────────────────────────────────────────────────────────────────────
// INVOICE DOCUMENT — WYSIWYG inline editing (Super Admin → Billing & Invoices).
//
// ONE invoice, always visible. "Edit Invoice" turns the values ON the document
// into editable fields in place — there is no separate edit form or edit page.
// Calculated figures (taxable, GST, CGST/SGST/IGST, round-off, grand total,
// balance, amount in words) are NEVER typeable; they re-derive instantly from
// invoiceEditorCalc as you type.
//
// SCOPE: presentation/editing only. The calculation engine, billing logic, DB,
// APIs and payment workflow are untouched — this renders and saves through the
// exact same endpoints as before.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Undo2, Redo2, Save, X, CheckCircle2, Lock, Unlock, History, AlertTriangle, Loader2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { computeInvoiceFromItems, validateInvoice, normalizeItem, blankItem, type LineItem, type ComputedInvoice } from './invoiceEditorCalc';

interface Props {
  invoiceId: number | string;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  /** Fired after a successful save so the page can refresh status/PDF. */
  onSaved?: (invoice: any) => void;
}

interface EditorDoc {
  invoiceNo: string; invoiceDate: string; dueDate: string;
  periodStart: string; periodEnd: string;
  companyName: string; billingAddress: string; gstin: string; pan: string;
  contactPerson: string; companyEmail: string; companyPhone: string;
  notes: string; terms: string; bankDetails: string;
  lineItems: LineItem[];
  interState: boolean; roundOffEnabled: boolean;
}

const A4_W = 794;
const GST_RATES = [0, 5, 12, 18, 28];
const dayStr = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : '');
const money = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (v: any) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// ── Inline field primitives ─────────────────────────────────────────────────
// In view mode they render as plain document text; in edit mode they become
// borderless in-place inputs with a dotted affordance. Controlled inputs (not
// contentEditable) so the caret never jumps while totals recompute live.
const editBox = 'bg-amber-50/60 outline-none rounded-[3px] px-0.5 -mx-0.5 border-b border-dotted border-amber-500 focus:bg-white focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500';

const Txt: React.FC<{ value: string; onChange: (v: string) => void; editing: boolean; minCh?: number; className?: string; placeholder?: string; align?: 'left' | 'right' | 'center' }> =
  ({ value, onChange, editing, minCh = 6, className = '', placeholder = '—', align = 'left' }) => {
    if (!editing) return <span className={className}>{value || <span className="text-slate-300">{placeholder}</span>}</span>;
    return (
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: `${Math.max(minCh, String(value || '').length + 1)}ch`, textAlign: align }}
        className={`${editBox} ${className}`}
      />
    );
  };

const Area: React.FC<{ value: string; onChange: (v: string) => void; editing: boolean; className?: string; placeholder?: string; rows?: number }> =
  ({ value, onChange, editing, className = '', placeholder = '—', rows }) => {
    if (!editing) return <span className={`whitespace-pre-line ${className}`}>{value || <span className="text-slate-300">{placeholder}</span>}</span>;
    const r = rows || Math.max(2, String(value || '').split('\n').length);
    return <textarea value={value} rows={r} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${editBox} w-full resize-y ${className}`} />;
  };

const DateF: React.FC<{ value: string; onChange: (v: string) => void; editing: boolean }> = ({ value, onChange, editing }) => {
  if (!editing) return <>{dt(value)}</>;
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={`${editBox} w-[130px]`} />;
};

const Num: React.FC<{ value: number; onChange: (v: number) => void; editing: boolean; max?: number; w?: string }> =
  ({ value, onChange, editing, max, w = 'w-[62px]' }) => {
    if (!editing) return <>{value}</>;
    return <input type="number" min={0} max={max} step="any" value={value} onChange={(e) => onChange(Number(e.target.value))} className={`${editBox} ${w} text-right`} />;
  };

export const InvoiceDocument: React.FC<Props> = ({ invoiceId, editing, onEditingChange, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [issuer, setIssuer] = useState<any>({});
  const [locked, setLocked] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [showAudit, setShowAudit] = useState(false);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [hoverRow, setHoverRow] = useState<number | null>(null);

  // Undo / Redo
  const [past, setPast] = useState<EditorDoc[]>([]);
  const [doc, setDoc] = useState<EditorDoc | null>(null);
  const [future, setFuture] = useState<EditorDoc[]>([]);
  const [baseline, setBaseline] = useState<EditorDoc | null>(null);

  const apply = useCallback((mutate: (d: EditorDoc) => EditorDoc) => {
    setDoc((cur) => { if (!cur) return cur; setPast((p) => [...p.slice(-59), cur]); setFuture([]); return mutate(cur); });
  }, []);
  const setField = (k: keyof EditorDoc, v: any) => apply((d) => ({ ...d, [k]: v }));

  const undo = useCallback(() => setPast((p) => {
    if (!p.length) return p;
    const prev = p[p.length - 1];
    setDoc((cur) => { if (cur) setFuture((f) => [cur, ...f]); return prev; });
    return p.slice(0, -1);
  }), []);
  const redo = useCallback(() => setFuture((f) => {
    if (!f.length) return f;
    const nxt = f[0];
    setDoc((cur) => { if (cur) setPast((p) => [...p, cur]); return nxt; });
    return f.slice(1);
  }), []);

  // Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) while editing.
  useEffect(() => {
    if (!editing || locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, locked, undo, redo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        api.subscriptionInvoices.getEditor(invoiceId),
        api.subscriptionInvoices.getSettings().catch(() => ({})),
      ]);
      const inv = r.invoice || {};
      const d: EditorDoc = {
        invoiceNo: inv.invoiceNo || '', invoiceDate: dayStr(inv.invoiceDate), dueDate: dayStr(inv.dueDate),
        periodStart: dayStr(inv.periodStart), periodEnd: dayStr(inv.periodEnd),
        companyName: inv.companyName || '', billingAddress: inv.billingAddress || '',
        gstin: inv.gstin || '', pan: inv.pan || '',
        contactPerson: inv.contactPerson || inv.companyHead || '', companyEmail: inv.companyEmail || '',
        companyPhone: inv.companyPhone || '', notes: inv.notes || '', terms: inv.terms || '',
        bankDetails: inv.bankDetails || '',
        lineItems: (r.lineItems || []).map((x: any, i: number) => normalizeItem(x, i)),
        interState: !!inv.interState, roundOffEnabled: true,
      };
      setInvoice(inv); setIssuer(s || {}); setDoc(d); setBaseline(d); setPast([]); setFuture([]); setLocked(!!r.locked);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [invoiceId]);
  useEffect(() => { load(); }, [load]);

  const loadAudit = useCallback(async () => {
    try { const r = await api.subscriptionInvoices.editorAudit(invoiceId); setAuditRows(r?.audit || []); } catch { setAuditRows([]); }
  }, [invoiceId]);
  useEffect(() => { if (showAudit) loadAudit(); }, [showAudit, loadAudit]);

  // ── LIVE totals — the single source of every displayed amount ──
  const c: ComputedInvoice | null = useMemo(() => (doc ? computeInvoiceFromItems({
    lineItems: doc.lineItems, interState: doc.interState, roundOffEnabled: doc.roundOffEnabled, amountPaid: invoice?.amountPaid || 0,
  }) : null), [doc, invoice?.amountPaid]);

  const errors = useMemo(() => (doc ? validateInvoice({ lineItems: doc.lineItems, invoiceNo: doc.invoiceNo, invoiceDate: doc.invoiceDate }) : []), [doc]);
  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(baseline), [doc, baseline]);

  // ── item ops ──
  const patchItem = (i: number, p: Partial<LineItem>) => apply((d) => ({ ...d, lineItems: d.lineItems.map((it, x) => (x === i ? { ...it, ...p } : it)) }));
  const addItem = () => apply((d) => ({ ...d, lineItems: [...d.lineItems, blankItem(d.lineItems.length + 1)] }));
  const removeItem = (i: number) => apply((d) => ({ ...d, lineItems: d.lineItems.filter((_, x) => x !== i) }));
  const dupItem = (i: number) => apply((d) => { const n = [...d.lineItems]; n.splice(i + 1, 0, { ...d.lineItems[i], id: `it-${Date.now()}-${i}` }); return { ...d, lineItems: n }; });

  // ── save / finalize / unlock (same endpoints as before) ──
  const persist = async (extra: any = {}, okMsg = 'Invoice saved.') => {
    if (!doc) return null;
    if (errors.length) { ui.toast.error(errors[0]); return null; }
    setBusy(true);
    try {
      const r = await api.subscriptionInvoices.saveEditor(invoiceId, { ...doc, ...extra });
      setInvoice(r.invoice); setBaseline(doc); setPast([]); setFuture([]);
      ui.toast.success(`${okMsg}${r.changed ? ` ${r.changed} change(s) recorded.` : ''}`);
      onSaved?.(r.invoice);
      if (showAudit) loadAudit();
      return r.invoice;
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); return null; }
    finally { setBusy(false); }
  };
  const saveDraft = () => persist({ status: 'Draft' }, 'Draft saved.');
  const saveChanges = async () => { const s = await persist({}, 'Changes saved.'); if (s) onEditingChange(false); };
  const cancelEdit = async () => {
    if (dirty && !(await ui.confirm({ title: 'Discard changes?', message: 'Unsaved edits to this invoice will be lost.', confirmText: 'Discard', variant: 'danger' }))) return;
    setDoc(baseline); setPast([]); setFuture([]); onEditingChange(false);
  };
  const markFinal = async () => {
    if (!(await ui.confirm({ title: 'Mark this invoice final?', message: 'The invoice will be issued. It stays editable until paid or cancelled.', confirmText: 'Mark Final' }))) return;
    if (dirty && !(await persist({}, 'Changes saved.'))) return;
    setBusy(true);
    try { const inv = await api.subscriptionInvoices.finalize(invoiceId, {}); setInvoice(inv); ui.toast.success('Invoice marked final.'); onSaved?.(inv); onEditingChange(false); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  };
  const doUnlock = async () => {
    if (!unlockReason.trim()) { ui.toast.error('Enter a reason to unlock this invoice.'); return; }
    setBusy(true);
    try { await api.subscriptionInvoices.unlock(invoiceId, { reason: unlockReason.trim() }); setLocked(false); setShowUnlock(false); setUnlockReason(''); ui.toast.success('Invoice unlocked for editing.'); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="py-24 text-center text-ink-muted text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Loading invoice…</div>;
  if (!doc || !c) return <div className="py-24 text-center text-ink-muted text-sm">Invoice could not be loaded.</div>;

  const ed = editing && !locked;                       // fields are live
  const showDisc = ed || c.items.some((i) => i.discountPercent > 0);
  const iss: any = issuer || {};
  const issuerLines = [iss.addressLine1, iss.addressLine2, [iss.city, iss.state, iss.pincode].filter(Boolean).join(', ')].filter(Boolean);

  return (
    <div className="space-y-3">
      {/* Contextual edit bar — appears only while editing, above the document */}
      {editing && (
        <div className="sticky top-0 z-30 mx-auto flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-surface/95 backdrop-blur px-3 py-2 shadow-sm" style={{ maxWidth: A4_W }}>
          <span className="text-[13px] font-bold text-ink">Editing invoice</span>
          {dirty && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Unsaved</span>}
          <div className="h-5 w-px bg-hairline mx-1" />
          <button onClick={undo} disabled={!past.length || locked} title="Undo (Ctrl+Z)" className="h-8 w-8 grid place-items-center rounded-lg border border-hairline text-ink-secondary disabled:opacity-40 hover:bg-surface-muted"><Undo2 size={14} /></button>
          <button onClick={redo} disabled={!future.length || locked} title="Redo (Ctrl+Y)" className="h-8 w-8 grid place-items-center rounded-lg border border-hairline text-ink-secondary disabled:opacity-40 hover:bg-surface-muted"><Redo2 size={14} /></button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" icon={<History size={14} />} onClick={() => setShowAudit((s) => !s)}>Audit</Button>
          {locked ? (
            <Button size="sm" icon={<Unlock size={14} />} onClick={() => setShowUnlock(true)}>Unlock Invoice</Button>
          ) : (
            <>
              <Button variant="outline" size="sm" icon={<X size={14} />} onClick={cancelEdit} disabled={busy}>Cancel</Button>
              <Button variant="outline" size="sm" icon={<Save size={14} />} onClick={saveDraft} disabled={busy || !!errors.length}>Save Draft</Button>
              <Button size="sm" icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} onClick={saveChanges} disabled={busy || !!errors.length}>Save Changes</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" icon={<CheckCircle2 size={14} />} onClick={markFinal} disabled={busy || !!errors.length}>Mark Final</Button>
            </>
          )}
        </div>
      )}

      {editing && locked && (
        <div className="mx-auto rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800 flex items-center gap-2" style={{ maxWidth: A4_W }}>
          <Lock size={15} /> This invoice is <b>{invoice?.status}</b> and is locked. Use <b>Unlock Invoice</b> (audited) to edit.
        </div>
      )}
      {editing && showUnlock && (
        <div className="mx-auto rounded-xl border border-hairline p-3 flex flex-wrap items-end gap-2" style={{ maxWidth: A4_W }}>
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Reason for unlocking (required)</label>
            <input className="w-full h-9 px-3 rounded-xl border border-hairline bg-surface text-sm outline-none focus:border-brand-500" value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} placeholder="e.g. Correcting the GST rate after client confirmation" />
          </div>
          <Button size="sm" onClick={doUnlock} disabled={busy}>Confirm Unlock</Button>
          <Button size="sm" variant="outline" onClick={() => setShowUnlock(false)}>Cancel</Button>
        </div>
      )}
      {editing && errors.length > 0 && (
        <div className="mx-auto rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5" style={{ maxWidth: A4_W }}>
          <p className="text-[12px] font-bold text-rose-800 flex items-center gap-1.5"><AlertTriangle size={13} /> {errors.length} issue(s) to fix before saving</p>
          <ul className="text-[11px] text-rose-700 mt-1 space-y-0.5">{errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}</ul>
        </div>
      )}

      {/* ══════════════ THE INVOICE DOCUMENT ══════════════ */}
      <div className="mx-auto bg-white text-[#111] shadow-[0_10px_40px_rgba(15,23,42,.18)]"
        style={{ width: A4_W, minHeight: 1123, border: '1px solid #111', fontSize: 11.5, lineHeight: 1.45 }}>

        {/* Header: issuer + TAX INVOICE meta */}
        <div className="flex border-b border-[#111]">
          <div className="flex-1 p-3 border-r border-[#111]">
            <div className="flex items-center gap-2.5">
              {iss.logo
                ? <img src={iss.logo} alt="" className="h-11 w-11 object-contain" />
                : <div className="h-11 w-11 rounded grid place-items-center text-white font-extrabold text-lg" style={{ background: iss.accent || '#4f46e5' }}>{(iss.name || 'Z').charAt(0)}</div>}
              <div>
                <h1 className="font-extrabold text-[15px] leading-tight">{iss.legalName || iss.name || 'ZeniaHR'}</h1>
                {iss.tagline && <div className="text-[10px] text-[#555]">{iss.tagline}</div>}
              </div>
            </div>
            <div className="mt-2 text-[10.5px] text-[#333] space-y-[1px]">
              {issuerLines.map((l: string, i: number) => <div key={i}>{l}</div>)}
              {iss.phone && <div><span className="text-[#777]">Phone:</span> {iss.phone}</div>}
              {iss.email && <div><span className="text-[#777]">Email:</span> {iss.email}</div>}
              {iss.gstin && <div><span className="text-[#777]">GSTIN:</span> {iss.gstin}</div>}
              {iss.pan && <div><span className="text-[#777]">PAN:</span> {iss.pan}</div>}
            </div>
          </div>
          <div className="w-[300px]">
            <div className="text-center font-extrabold tracking-[0.12em] text-[13px] py-1.5 text-white" style={{ background: iss.accent || '#4f46e5' }}>TAX INVOICE</div>
            <table className="w-full text-[10.5px]">
              <tbody>
                <tr><td className="px-2 py-[3px] text-[#777] w-[42%]">Invoice No.</td><td className="px-2 py-[3px] font-bold"><Txt value={doc.invoiceNo} onChange={(v) => setField('invoiceNo', v)} editing={ed} minCh={12} /></td></tr>
                <tr><td className="px-2 py-[3px] text-[#777]">Invoice Date</td><td className="px-2 py-[3px]"><DateF value={doc.invoiceDate} onChange={(v) => setField('invoiceDate', v)} editing={ed} /></td></tr>
                <tr><td className="px-2 py-[3px] text-[#777]">Due Date</td><td className="px-2 py-[3px]"><DateF value={doc.dueDate} onChange={(v) => setField('dueDate', v)} editing={ed} /></td></tr>
                <tr><td className="px-2 py-[3px] text-[#777]">Billing Period</td><td className="px-2 py-[3px]">
                  <DateF value={doc.periodStart} onChange={(v) => setField('periodStart', v)} editing={ed} /> <span className="text-[#777]">–</span> <DateF value={doc.periodEnd} onChange={(v) => setField('periodEnd', v)} editing={ed} />
                </td></tr>
                <tr><td className="px-2 py-[3px] text-[#777]">Subscription</td><td className="px-2 py-[3px]">{invoice?.plan} · {invoice?.billingCycle}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Bill To + Subscription details */}
        <div className="flex border-b border-[#111]">
          <div className="flex-1 p-3 border-r border-[#111]">
            <div className="text-[9.5px] font-extrabold tracking-wider text-[#777] mb-1">BILL TO</div>
            <div className="font-extrabold text-[12.5px]"><Txt value={doc.companyName} onChange={(v) => setField('companyName', v)} editing={ed} minCh={20} placeholder="Company name" /></div>
            <div className="text-[10.5px] mt-0.5"><Area value={doc.billingAddress} onChange={(v) => setField('billingAddress', v)} editing={ed} placeholder="Billing address" /></div>
            <div className="text-[10.5px] mt-1 space-y-[1px]">
              <div><span className="text-[#777]">Contact Person:</span> <Txt value={doc.contactPerson} onChange={(v) => setField('contactPerson', v)} editing={ed} minCh={10} /></div>
              <div><span className="text-[#777]">Email:</span> <Txt value={doc.companyEmail} onChange={(v) => setField('companyEmail', v)} editing={ed} minCh={14} /></div>
              <div><span className="text-[#777]">Phone:</span> <Txt value={doc.companyPhone} onChange={(v) => setField('companyPhone', v)} editing={ed} minCh={10} /></div>
              <div><span className="text-[#777]">GSTIN:</span> <Txt value={doc.gstin} onChange={(v) => setField('gstin', v)} editing={ed} minCh={14} /></div>
              <div><span className="text-[#777]">PAN:</span> <Txt value={doc.pan} onChange={(v) => setField('pan', v)} editing={ed} minCh={10} /></div>
            </div>
          </div>
          <div className="w-[300px] p-3 text-[10.5px]">
            <div className="text-[9.5px] font-extrabold tracking-wider text-[#777] mb-1">SUBSCRIPTION DETAILS</div>
            <div><span className="text-[#777]">Plan:</span> <b>{invoice?.plan}</b></div>
            <div><span className="text-[#777]">Billing Cycle:</span> {invoice?.billingCycle}</div>
            <div><span className="text-[#777]">Employee Count:</span> {invoice?.employeeCount}</div>
            <div><span className="text-[#777]">Subscription Start:</span> {dt(doc.periodStart)}</div>
            <div><span className="text-[#777]">Subscription End:</span> {dt(doc.periodEnd)}</div>
          </div>
        </div>

        {/* Item table — every cell editable in place */}
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="bg-[#f1f5f9] text-[9.5px] uppercase tracking-wide">
              <th className="border-b border-[#111] px-1.5 py-1.5 text-left w-[5%]">Sr</th>
              <th className="border-b border-[#111] px-1.5 py-1.5 text-left">Description</th>
              <th className="border-b border-[#111] px-1.5 py-1.5 text-center w-[10%]">HSN/SAC</th>
              <th className="border-b border-[#111] px-1.5 py-1.5 text-center w-[7%]">Qty</th>
              <th className="border-b border-[#111] px-1.5 py-1.5 text-right w-[11%]">Rate</th>
              {showDisc && <th className="border-b border-[#111] px-1.5 py-1.5 text-right w-[8%]">Disc %</th>}
              <th className="border-b border-[#111] px-1.5 py-1.5 text-right w-[12%]">Taxable</th>
              <th className="border-b border-[#111] px-1.5 py-1.5 text-center w-[8%]">GST %</th>
              <th className="border-b border-[#111] px-1.5 py-1.5 text-right w-[11%]">GST Amt</th>
              <th className="border-b border-[#111] px-1.5 py-1.5 text-right w-[12%]">Total</th>
            </tr>
          </thead>
          <tbody>
            {c.items.map((it, i) => (
              <tr key={it.id} className="border-b border-[#e5e7eb] relative group" onMouseEnter={() => setHoverRow(i)} onMouseLeave={() => setHoverRow(null)}>
                <td className="px-1.5 py-1.5 align-top text-center">{i + 1}</td>
                <td className="px-1.5 py-1.5 align-top">
                  {ed
                    ? <input value={it.description} placeholder="Item description" onChange={(e) => patchItem(i, { description: e.target.value })} className={`${editBox} w-full font-semibold`} />
                    : <span className="font-semibold">{it.description || <span className="text-slate-300">—</span>}</span>}
                </td>
                <td className="px-1.5 py-1.5 align-top text-center"><Txt value={it.hsn} onChange={(v) => patchItem(i, { hsn: v })} editing={ed} minCh={6} align="center" /></td>
                <td className="px-1.5 py-1.5 align-top text-center"><Num value={it.quantity} onChange={(v) => patchItem(i, { quantity: v })} editing={ed} w="w-[54px]" /></td>
                <td className="px-1.5 py-1.5 align-top text-right">{ed ? <Num value={it.rate} onChange={(v) => patchItem(i, { rate: v })} editing w="w-[78px]" /> : money(it.rate)}</td>
                {showDisc && <td className="px-1.5 py-1.5 align-top text-right">{ed ? <Num value={it.discountPercent} onChange={(v) => patchItem(i, { discountPercent: v })} editing max={100} w="w-[54px]" /> : (it.discountPercent || 0)}</td>}
                <td className="px-1.5 py-1.5 align-top text-right tabular-nums">{money(it.taxable)}</td>
                <td className="px-1.5 py-1.5 align-top text-center">
                  {ed
                    ? <select value={it.taxPercent} onChange={(e) => patchItem(i, { taxPercent: Number(e.target.value) })} className={`${editBox} w-[58px] text-center cursor-pointer`}>
                        {GST_RATES.concat(GST_RATES.includes(it.taxPercent) ? [] : [it.taxPercent]).sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r}%</option>)}
                      </select>
                    : `${it.taxPercent}%`}
                </td>
                <td className="px-1.5 py-1.5 align-top text-right tabular-nums">{money(it.gstAmount)}</td>
                <td className="px-1.5 py-1.5 align-top text-right tabular-nums font-bold">
                  {money(it.total)}
                  {ed && hoverRow === i && (
                    <span className="absolute right-[-64px] top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button onClick={() => dupItem(i)} title="Duplicate row" className="h-6 w-6 grid place-items-center rounded border border-hairline bg-white text-slate-500 hover:text-brand-600 shadow-sm"><Copy size={12} /></button>
                      <button onClick={() => removeItem(i)} title="Delete row" className="h-6 w-6 grid place-items-center rounded border border-hairline bg-white text-rose-500 hover:bg-rose-50 shadow-sm"><Trash2 size={12} /></button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {c.items.length === 0 && <tr><td colSpan={showDisc ? 10 : 9} className="px-2 py-6 text-center text-slate-400">No items yet.</td></tr>}
          </tbody>
        </table>
        {ed && (
          <button onClick={addItem} className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 border-b border-[#e5e7eb]">
            <Plus size={13} /> Add Row
          </button>
        )}

        {/* Words + totals (all calculated — never editable) */}
        <div className="flex border-t border-[#111]">
          <div className="flex-1 p-3 border-r border-[#111]">
            <div className="text-[9.5px] font-extrabold tracking-wider text-[#777]">AMOUNT CHARGEABLE (IN WORDS)</div>
            <div className="font-extrabold text-[11px] mt-0.5 capitalize">{c.amountInWords}</div>
            {ed && (
              <div className="mt-3 flex items-center gap-4 text-[10px] text-[#555]">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={doc.interState} onChange={(e) => setField('interState', e.target.checked)} />Inter-state (IGST)</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={doc.roundOffEnabled} onChange={(e) => setField('roundOffEnabled', e.target.checked)} />Round off</label>
              </div>
            )}
          </div>
          <table className="w-[300px] text-[10.5px] self-start">
            <tbody>
              <TotRow label="Sub Total" value={money(c.subtotal)} />
              {!!c.discountAmount && <TotRow label={`Discount (${c.discountPercent}%)`} value={`− ${money(c.discountAmount)}`} cls="text-emerald-600" />}
              <TotRow label="Taxable Value" value={money(c.taxable)} />
              {c.interState
                ? <TotRow label={`IGST (${c.gstPercent}%)`} value={money(c.igst)} />
                : <><TotRow label={`CGST (${c.gstPercent / 2}%)`} value={money(c.cgst)} /><TotRow label={`SGST (${c.gstPercent / 2}%)`} value={money(c.sgst)} /></>}
              {!!c.roundOff && <TotRow label="Round Off" value={`${c.roundOff < 0 ? '− ' : ''}${money(Math.abs(c.roundOff))}`} />}
              <tr style={{ background: iss.accent || '#4f46e5' }} className="text-white font-extrabold">
                <td className="px-2 py-1.5">GRAND TOTAL</td><td className="px-2 py-1.5 text-right tabular-nums">{money(c.grandTotal)}</td>
              </tr>
              {!!c.amountPaid && <TotRow label="Amount Paid" value={money(c.amountPaid)} />}
              {!!c.amountPaid && <TotRow label="Balance Due" value={money(c.outstanding)} cls="font-bold text-rose-600" />}
            </tbody>
          </table>
        </div>

        {/* Bank + terms + notes */}
        <div className="flex border-t border-[#111]">
          <div className="flex-1 p-3 border-r border-[#111] text-[10.5px]">
            <div className="text-[9.5px] font-extrabold tracking-wider text-[#777] mb-1">BANK DETAILS</div>
            <Area value={doc.bankDetails} onChange={(v) => setField('bankDetails', v)} editing={ed}
              placeholder={[iss.bankAccountName, iss.bankName, iss.bankAccountNumber, iss.bankIfsc].filter(Boolean).join(' • ') || 'Account name • Bank • A/C no • IFSC'} />
          </div>
          <div className="w-[300px] p-3 text-[10.5px]">
            <div className="text-[9.5px] font-extrabold tracking-wider text-[#777] mb-1">TERMS &amp; CONDITIONS</div>
            <Area value={doc.terms} onChange={(v) => setField('terms', v)} editing={ed} placeholder={iss.terms || 'Payment terms…'} />
          </div>
        </div>
        <div className="p-3 border-t border-[#111] text-[10.5px]">
          <div className="text-[9.5px] font-extrabold tracking-wider text-[#777] mb-1">NOTES</div>
          <Area value={doc.notes} onChange={(v) => setField('notes', v)} editing={ed} placeholder="Notes for the customer…" />
        </div>
        <div className="flex justify-end p-3 pt-8 border-t border-[#111]">
          <div className="text-center text-[10.5px]">
            <div className="border-t border-[#111] pt-1 w-[180px]">For <b>{iss.legalName || iss.name || 'ZeniaHR'}</b><div className="text-[#777] mt-4">Authorised Signatory</div></div>
          </div>
        </div>
      </div>

      {/* Audit trail */}
      {editing && showAudit && (
        <div className="mx-auto rounded-xl border border-hairline overflow-hidden" style={{ maxWidth: A4_W }}>
          <div className="px-4 py-2.5 bg-surface-muted border-b border-hairline"><p className="text-[13px] font-bold text-ink flex items-center gap-1.5"><History size={14} /> Edit History</p></div>
          {auditRows.length === 0 ? <p className="py-6 text-center text-ink-muted text-[13px]">No edits recorded yet.</p> : (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-surface-muted/60 text-[10px] uppercase tracking-wide text-ink-muted">
                  <tr><th className="px-3 py-2 text-left">Field</th><th className="px-3 py-2 text-left">From</th><th className="px-3 py-2 text-left">To</th><th className="px-3 py-2 text-left">Action</th><th className="px-3 py-2 text-left">By</th><th className="px-3 py-2 text-left">When</th></tr>
                </thead>
                <tbody>
                  {auditRows.map((a) => (
                    <tr key={a.id} className="border-t border-hairline">
                      <td className="px-3 py-1.5 font-semibold text-ink">{a.field}</td>
                      <td className="px-3 py-1.5 text-ink-muted line-through max-w-[150px] truncate">{a.oldValue || '—'}</td>
                      <td className="px-3 py-1.5 text-emerald-700 font-semibold max-w-[150px] truncate">{a.newValue || '—'}</td>
                      <td className="px-3 py-1.5">{a.action}</td>
                      <td className="px-3 py-1.5">{a.changedBy || '—'}</td>
                      <td className="px-3 py-1.5 text-ink-muted whitespace-nowrap">{new Date(a.createdAt).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const TotRow: React.FC<{ label: string; value: string; cls?: string }> = ({ label, value, cls = '' }) => (
  <tr className="border-b border-[#e5e7eb]"><td className="px-2 py-1 text-[#555]">{label}</td><td className={`px-2 py-1 text-right tabular-nums ${cls}`}>{value}</td></tr>
);

export default InvoiceDocument;
