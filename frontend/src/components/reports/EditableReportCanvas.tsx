// ─────────────────────────────────────────────────────────────────────────────
// EditableReportCanvas — turns a generated report into a fully EDITABLE document
// (Google-Docs / Word-Online style). Authorized users can edit the document chrome
// (company/branch/title/notes/footer/signatory) AND the data cells (numbers & text)
// directly inside the preview, while every bit of FORMATTING (font, size, alignment,
// borders, row height, column width, header/footer, margins, layout) is preserved —
// only the VALUE inside each editable region changes.
//
// • Save Changes → snapshots an immutable VERSION and writes a per-change AUDIT
//   trail (old value, new value, user, role, date/time, branch, company).
// • Print / PDF snapshot this exact DOM, so they always use the EDITED version.
// • Excel reads the live (edited) cell values, so the export matches the preview.
// • Permission-gated (canEdit). View-only users see the report but cannot edit.
//
// No report generation, calculation, API, payroll/attendance logic, export plumbing
// or company/branch filtering is changed — this only adds the editing layer over the
// existing { meta, columns, rows, summary } contract.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, Printer, FileDown, FileSpreadsheet, Pencil, Eye, RotateCcw, Check, Save, History, ScrollText, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { printNode, nodeToPdf, rowsToExcel } from './reportExport';

interface Col { key: string; label: string; }
interface ReportShape {
  meta?: any; columns: Col[]; rows: any[]; summary?: any;
  reportName?: string; reportKey?: string; category?: string; generatedAt?: string; generatedBy?: string;
}
interface Props {
  report: ReportShape;
  companyId?: string;
  onLog?: (format: string) => void;
  /** Whether the current user may edit (role/scope decided by the parent). */
  canEdit?: boolean;
  userName?: string;
  role?: string;
}

const toNum = (v: any): number | null => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[,₹\s]/g, ''));
  return isNaN(n) ? null : n;
};
const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
const stripHtml = (h: any) => String(h ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

const CHROME_FIELDS = ['companyName', 'branchLine', 'address', 'title', 'headerNote', 'remarks', 'footer', 'signatory'] as const;
const CHROME_LABEL: Record<string, string> = { companyName: 'Company Name', branchLine: 'Branch', address: 'Address', title: 'Report Title', headerNote: 'Header Note', remarks: 'Remarks', footer: 'Footer', signatory: 'Signatory' };

interface AuditEntry { field: string; old: string; new: string; by: string; role: string; at: string; branch: string; company: string; }
interface Version { v: number; label: string; editedBy: string; role: string; at: string; chrome: Record<string, string>; cells: Record<string, string>; branch: string; company: string; }

// Module-level so its identity is STABLE across parent re-renders — otherwise React
// would remount the contentEditable on every render and wipe the user's live edit.
const EditableField: React.FC<{
  id: string; html: string; editMode: boolean; setRef: (id: string, el: HTMLElement | null) => void; onInput: () => void;
  className?: string; style?: React.CSSProperties; placeholder?: string;
}> = React.memo(({ id, html, editMode, setRef, onInput, className, style, placeholder }) => (
  <div
    ref={el => setRef(id, el)}
    contentEditable={editMode}
    suppressContentEditableWarning
    data-ph={placeholder}
    onInput={onInput}
    className={`${className || ''} ${editMode ? 'doc-editable' : ''} outline-none`}
    style={style}
    dangerouslySetInnerHTML={{ __html: html }}
  />
), (a, b) => a.html === b.html && a.editMode === b.editMode && a.placeholder === b.placeholder && a.className === b.className);

// Memoised data cell — same stability contract as EditableField: React skips
// re-rendering when (html, editMode) are unchanged, so a user's in-cell edit is
// never overwritten by a parent re-render. Formatting (border/align/size) is fixed.
const EditableCell: React.FC<{
  html: string; editMode: boolean; row: number; col: string; numeric: boolean;
  onInput: () => void; onKeyDown: (e: React.KeyboardEvent) => void;
}> = React.memo(({ html, editMode, row, col, numeric, onInput, onKeyDown }) => (
  <td
    data-row={row}
    data-col={col}
    {...(editMode ? ({ contentEditable: 'plaintext-only', suppressContentEditableWarning: true, onInput, onKeyDown, className: 'cell-edit outline-none' } as any) : {})}
    style={{ border: '1px solid #e2e8f0', padding: '3px 6px', fontSize: 9.5, textAlign: numeric ? 'right' : 'left', whiteSpace: 'nowrap' }}
    dangerouslySetInnerHTML={{ __html: html }}
  />
), (a, b) => a.html === b.html && a.editMode === b.editMode && a.numeric === b.numeric);

export const EditableReportCanvas: React.FC<Props> = ({ report, companyId, onLog, canEdit = true, userName = '', role = '' }) => {
  const m = report.meta || {};
  const cols = report.columns || [];
  const rows = report.rows || [];
  const baseKey = `${report.reportKey || report.reportName || 'report'}_${companyId || m.name || ''}`;
  const storageKey = `hrms_report_doc_${baseKey}`;
  const versionsKey = `hrms_report_versions_${baseKey}`;
  const auditKey = `hrms_report_audit_${baseKey}`;
  const [resetKey, setResetKey] = useState(0);

  const numericCols = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const c of cols) {
      if (/^(sr|code|empid|employeeid|id)$/i.test(c.key)) { map[c.key] = false; continue; }
      let t = 0, n = 0;
      for (const r of rows) { const v = r[c.key]; if (v == null || v === '') continue; t++; if (toNum(v) != null) n++; }
      map[c.key] = t > 0 && n / t >= 0.7;
    }
    return map;
  }, [report]); // eslint-disable-line react-hooks/exhaustive-deps

  const cellDisplay = useCallback((r: any, c: Col) => {
    const v = r[c.key];
    if (numericCols[c.key] && toNum(v) != null) return toNum(v)!.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return String(v ?? '');
  }, [numericCols]);

  const origChrome = useMemo(() => ({
    companyName: m.name || 'Company Name',
    branchLine: m.branchName ? `${m.branchName} Branch` : '',
    address: m.address || '',
    title: report.reportName || 'Report',
    headerNote: '',
    remarks: '',
    footer: '',
    signatory: m.signatureText || 'Authorized Signatory',
  }), [report]); // eslint-disable-line react-hooks/exhaustive-deps

  // Working draft (chrome + changed cells), seeded ONCE per resetKey so React never
  // overwrites a live edit while typing.
  const draft = useMemo(() => {
    let saved: any = {};
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { saved = {}; }
    return saved;
  }, [storageKey, resetKey]);
  const savedCells: Record<string, string> = draft._cells || {};

  const init = useMemo(() => {
    const ids = [m.cinNumber && `CIN: ${m.cinNumber}`, m.gstNumber && `GST: ${m.gstNumber}`, m.panNumber && `PAN: ${m.panNumber}`].filter(Boolean).join(' &nbsp; ');
    return { ...origChrome, ids, ...Object.fromEntries(CHROME_FIELDS.map(f => [f, draft[f] ?? origChrome[f]])) } as any;
  }, [draft, origChrome]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2D seed of cell HTML — stable across re-renders so edits stick.
  const cellSeeds = useMemo(
    () => rows.map((r, i) => cols.map(c => { const k = `${i}::${c.key}`; return esc(k in savedCells ? savedCells[k] : cellDisplay(r, c)); })),
    [report, draft] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const docRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const [editMode, setEditMode] = useState(!!canEdit);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'excel' | 'print' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [versions, setVersions] = useState<Version[]>(() => { try { return JSON.parse(localStorage.getItem(versionsKey) || '[]'); } catch { return []; } });
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(() => { try { return JSON.parse(localStorage.getItem(auditKey) || '[]'); } catch { return []; } });
  const [panel, setPanel] = useState<'none' | 'versions' | 'audit'>('none');

  useEffect(() => { if (!canEdit) setEditMode(false); }, [canEdit]);

  // Ensure a V1 "Original" baseline exists.
  useEffect(() => {
    if (versions.length === 0) {
      const v1: Version = { v: 1, label: 'Generated Automatically', editedBy: report.generatedBy || 'System', role: 'system', at: report.generatedAt || new Date().toISOString(), chrome: {}, cells: {}, branch: m.branchName || '', company: m.name || '' };
      setVersions([v1]); try { localStorage.setItem(versionsKey, JSON.stringify([v1])); } catch { /* off */ }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setFieldRef = useCallback((id: string, el: HTMLElement | null) => { fieldRefs.current[id] = el; }, []);
  const colByKey = (k: string | null) => cols.find(c => c.key === k);
  const idColKey = useMemo(() => (cols.find(c => /name|^code$|empid|employee/i.test(c.key)) || {}).key, [cols]);
  const rowLabel = (i: number) => { const r = rows[i]; const v = idColKey ? r?.[idColKey] : null; return (v != null && v !== '') ? String(v) : `Row ${i + 1}`; };

  // Read current chrome + changed cells from the live DOM.
  const readChrome = (): Record<string, string> => { const o: Record<string, string> = {}; for (const k of Object.keys(fieldRefs.current)) { const el = fieldRefs.current[k]; if (el) o[k] = el.innerHTML; } return o; };
  const readChangedCells = (): Record<string, string> => {
    const changed: Record<string, string> = {};
    docRef.current?.querySelectorAll('td[data-row]')?.forEach((td) => {
      const i = Number(td.getAttribute('data-row')); const ck = td.getAttribute('data-col');
      if (isNaN(i) || !ck) return;
      const text = (td as HTMLElement).innerText.trim();
      const orig = cellDisplay(rows[i], colByKey(ck)!);
      if (text !== orig) changed[`${i}::${ck}`] = text;
    });
    return changed;
  };
  const readEditedRows = () => {
    const out = rows.map(r => ({ ...r }));
    docRef.current?.querySelectorAll('td[data-row]')?.forEach((td) => {
      const i = Number(td.getAttribute('data-row')); const ck = td.getAttribute('data-col');
      if (!isNaN(i) && ck && out[i]) out[i][ck] = (td as HTMLElement).innerText.trim();
    });
    return out;
  };

  const persistTimer = useRef<any>(null);
  const persistDraft = useCallback(() => {
    setDirty(true);
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ ...readChrome(), _cells: readChangedCells() })); } catch { /* off */ }
    }, 500);
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const exec = (cmd: string, val?: string) => { document.execCommand(cmd, false, val); persistDraft(); };
  const plain = (k: string) => stripHtml(fieldRefs.current[k]?.innerHTML) || stripHtml(init[k]);
  const fileStem = () => (plain('title') || report.reportName || 'Report').replace(/[^a-z0-9]+/gi, '_');

  // ── Exports — all snapshot the EDITED state ──
  const onPrint = () => { if (!docRef.current) return; printNode(docRef.current, plain('title') || report.reportName || 'Report'); onLog?.('PRINT'); };
  const onPdf = async () => {
    if (!docRef.current) return; setBusy('pdf');
    try { await nodeToPdf(docRef.current, fileStem(), cols.length > 7 ? 'landscape' : 'portrait'); onLog?.('PDF'); }
    catch (e: any) { ui.toast.error(e?.message || 'PDF export failed.'); } finally { setBusy(null); }
  };
  const onExcel = () => {
    setBusy('excel');
    try {
      const headerLines = [plain('companyName'), plain('branchLine'), plain('address'), plain('title'), plain('headerNote'), plain('remarks') && `Remarks: ${plain('remarks')}`].filter(Boolean);
      rowsToExcel({ columns: cols, rows: readEditedRows(), fileName: fileStem(), sheetName: (plain('title') || 'Report').slice(0, 28), headerLines });
      onLog?.('EXCEL');
    } catch (e: any) { ui.toast.error(e?.message || 'Excel export failed.'); } finally { setBusy(null); }
  };

  // ── Save Changes → new version + audit trail ──
  const saveChanges = () => {
    const chrome = readChrome();
    const cells = readChangedCells();
    try { localStorage.setItem(storageKey, JSON.stringify({ ...chrome, _cells: cells })); } catch { /* off */ }

    const prev = versions[versions.length - 1];
    const baseChrome = prev?.chrome || {};
    const baseCells = prev?.cells || {};
    const now = new Date();
    const ctx = { by: userName || role || 'User', role: role || '', at: now.toISOString(), branch: m.branchName || '', company: m.name || '' };
    const entries: AuditEntry[] = [];

    for (const f of CHROME_FIELDS) {
      const newV = stripHtml(chrome[f]);
      const oldV = (f in baseChrome) ? stripHtml(baseChrome[f]) : stripHtml(origChrome[f]);
      if (newV !== oldV) entries.push({ field: CHROME_LABEL[f], old: oldV, new: newV, ...ctx });
    }
    const keys = new Set([...Object.keys(cells), ...Object.keys(baseCells)]);
    keys.forEach(key => {
      const [iStr, ck] = key.split('::'); const i = Number(iStr);
      const orig = cellDisplay(rows[i], colByKey(ck)!);
      const newV = key in cells ? cells[key] : orig;
      const oldV = key in baseCells ? baseCells[key] : orig;
      if (newV !== oldV) entries.push({ field: `${rowLabel(i)} · ${colLabel(ck)}`, old: oldV, new: newV, ...ctx });
    });

    if (!entries.length && versions.length > 0) { ui.toast.info?.('No changes to save.'); setDirty(false); return; }

    const version: Version = { v: (versions[versions.length - 1]?.v || 0) + 1, label: `Edited by ${role || 'User'}`, editedBy: ctx.by, role: ctx.role, at: ctx.at, chrome, cells, branch: ctx.branch, company: ctx.company };
    const nextVersions = [...versions, version];
    setVersions(nextVersions);
    const nextAudit = [...entries, ...auditLog].slice(0, 1000);
    setAuditLog(nextAudit);
    try { localStorage.setItem(versionsKey, JSON.stringify(nextVersions)); localStorage.setItem(auditKey, JSON.stringify(nextAudit)); } catch { /* off */ }
    setDirty(false); setSavedAt(now.toLocaleTimeString('en-IN'));
    ui.toast.success(`Saved as Version ${version.v}${entries.length ? ` · ${entries.length} change${entries.length > 1 ? 's' : ''} logged` : ''}.`);
  };
  const colLabel = (k: string | null) => (cols.find(c => c.key === k) || {}).label || k || '';

  const loadVersion = (v: Version) => {
    try { localStorage.setItem(storageKey, JSON.stringify({ ...(v.chrome || {}), _cells: v.cells || {} })); } catch { /* off */ }
    setResetKey(k => k + 1); setDirty(false); setPanel('none');
    ui.toast.success(`Restored Version ${v.v}${v.v === 1 ? ' (Original)' : ''}.`);
  };
  const resetEdits = async () => {
    if (!(await ui.confirm({ message: 'Discard unsaved edits and restore the original report content?', confirmText: 'Reset', variant: 'danger' }))) return;
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setSavedAt(null); setDirty(false); setResetKey(k => k + 1);
  };

  const tbtn = (active: boolean) => `p-1.5 rounded-md border text-slate-600 hover:bg-slate-50 ${active ? 'border-slate-200 bg-white' : 'border-transparent'}`;
  const cellEditable = canEdit && editMode;
  const onCellKey = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }, []);

  return (
    <div className="mt-3 space-y-3" key={resetKey}>
      <style>{`
        .doc-editable:empty:before{content:attr(data-ph);color:#cbd5e1;}
        .doc-editable:hover{background:rgba(99,102,241,0.04);}
        .doc-editable:focus{background:rgba(99,102,241,0.07);border-radius:4px;}
        td.cell-edit:hover{background:rgba(99,102,241,0.06)!important;}
        td.cell-edit:focus{outline:2px solid rgba(99,102,241,0.5);outline-offset:-2px;background:rgba(99,102,241,0.08)!important;}
      `}</style>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 flex flex-wrap items-center gap-2 sticky top-0 z-20">
        <button disabled={!canEdit} onClick={() => setEditMode(e => !e)} className={`flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50 ${editMode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
          {!canEdit ? <><Lock size={13} /> View Only</> : editMode ? <><Pencil size={13} /> Editing</> : <><Eye size={13} /> View</>}
        </button>
        <div className="h-5 w-px bg-slate-200" />
        <div className={`flex items-center gap-1 ${cellEditable ? '' : 'opacity-40 pointer-events-none'}`} onMouseDown={e => e.preventDefault()}>
          <button title="Bold" className={tbtn(true)} onClick={() => exec('bold')}><Bold size={14} /></button>
          <button title="Italic" className={tbtn(true)} onClick={() => exec('italic')}><Italic size={14} /></button>
          <button title="Underline" className={tbtn(true)} onClick={() => exec('underline')}><Underline size={14} /></button>
          <div className="h-5 w-px bg-slate-200 mx-0.5" />
          <button title="Align left" className={tbtn(true)} onClick={() => exec('justifyLeft')}><AlignLeft size={14} /></button>
          <button title="Align center" className={tbtn(true)} onClick={() => exec('justifyCenter')}><AlignCenter size={14} /></button>
          <button title="Align right" className={tbtn(true)} onClick={() => exec('justifyRight')}><AlignRight size={14} /></button>
          <div className="h-5 w-px bg-slate-200 mx-0.5" />
          <button title="Undo" className={tbtn(true)} onClick={() => exec('undo')}><Undo2 size={14} /></button>
          <button title="Redo" className={tbtn(true)} onClick={() => exec('redo')}><Redo2 size={14} /></button>
          <button title="Reset to original" className={tbtn(true)} onClick={resetEdits}><RotateCcw size={14} /></button>
        </div>
        <button onClick={() => setPanel(p => p === 'versions' ? 'none' : 'versions')} className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-md border ${panel === 'versions' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><History size={13} /> Versions <span className="text-[9px] bg-slate-200 rounded-full px-1">{versions.length}</span></button>
        <button onClick={() => setPanel(p => p === 'audit' ? 'none' : 'audit')} className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-md border ${panel === 'audit' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><ScrollText size={13} /> Audit <span className="text-[9px] bg-slate-200 rounded-full px-1">{auditLog.length}</span></button>
        <div className="flex-1" />
        <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">{dirty ? <span className="text-amber-600">● Unsaved edits</span> : savedAt && <><Check size={11} /> Saved {savedAt}</>}</span>
        {canEdit && <Button size="sm" icon={<Save size={13} />} onClick={saveChanges}>Save Changes</Button>}
        <div className="h-5 w-px bg-slate-200" />
        <Button variant="outline" size="sm" icon={<Printer size={13} />} onClick={onPrint}>Print</Button>
        <Button variant="outline" size="sm" icon={<FileSpreadsheet size={13} />} onClick={onExcel} loading={busy === 'excel'}>Excel</Button>
        <Button size="sm" icon={<FileDown size={13} />} onClick={onPdf} loading={busy === 'pdf'}>Export PDF</Button>
      </div>

      {/* Versions panel */}
      {panel === 'versions' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
          <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5"><History size={13} className="text-indigo-600" /> Version History</p>
          <div className="space-y-1.5 max-h-56 overflow-auto">
            {versions.map(v => (
              <div key={v.v} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-slate-800">Version {v.v} {v.v === 1 ? <span className="text-emerald-600">· Original</span> : <span className="text-indigo-600">· {v.label}</span>}</p>
                  <p className="text-[10px] text-slate-400">{v.editedBy} {v.role && v.role !== 'system' ? `(${v.role})` : ''} · {new Date(v.at).toLocaleString('en-IN')}{v.branch ? ` · ${v.branch}` : ''}</p>
                </div>
                <button onClick={() => loadVersion(v)} className="text-[11px] font-bold text-indigo-600 hover:underline shrink-0">Restore</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit panel */}
      {panel === 'audit' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
          <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5"><ScrollText size={13} className="text-indigo-600" /> Audit Trail <span className="text-[10px] font-semibold text-slate-400">({auditLog.length} change{auditLog.length === 1 ? '' : 's'})</span></p>
          {auditLog.length === 0 ? <p className="text-[11px] text-slate-400">No edits recorded yet. Make a change and click Save Changes.</p> : (
            <div className="overflow-auto max-h-64 border border-slate-100 rounded-lg">
              <table className="w-full border-collapse text-[11px]">
                <thead><tr className="bg-slate-50 text-slate-500">{['Field', 'Old', 'New', 'By', 'Role', 'Date / Time', 'Branch', 'Company'].map(h => <th key={h} className="text-left px-2 py-1.5 font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>
                  {auditLog.map((a, i) => (
                    <tr key={i} className="even:bg-slate-50/50">
                      <td className="px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap">{a.field}</td>
                      <td className="px-2 py-1.5 text-rose-600 line-through whitespace-nowrap">{a.old || '—'}</td>
                      <td className="px-2 py-1.5 text-emerald-700 font-semibold whitespace-nowrap">{a.new || '—'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{a.by}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{a.role}</td>
                      <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{new Date(a.at).toLocaleString('en-IN')}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{a.branch || '—'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{a.company || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Editable document (A4-like). THIS node is the export source. */}
      <div className="bg-slate-200/50 rounded-xl border border-slate-200 p-4 overflow-auto" style={{ maxHeight: '74vh' }}>
        <div ref={docRef} className="bg-white mx-auto shadow-lg" style={{ width: '210mm', minHeight: '297mm', padding: '18mm', fontFamily: 'Georgia, "Times New Roman", serif', color: '#1f2937', fontSize: 12 }}>
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 pb-3 mb-4" style={{ borderColor: m.primaryColor || '#4f46e5' }}>
            <div className="flex items-start gap-3">
              {m.logoImage && <img src={m.logoImage} alt="logo" style={{ width: 46, height: 46, objectFit: 'contain' }} />}
              <div>
                <EditableField editMode={cellEditable} setRef={setFieldRef} onInput={persistDraft} id="companyName" html={init.companyName} className="text-[17px] font-extrabold" style={{ color: m.primaryColor || '#1e293b' }} placeholder="Company Name" />
                <EditableField editMode={cellEditable} setRef={setFieldRef} onInput={persistDraft} id="branchLine" html={init.branchLine} className="text-[12px] font-bold text-slate-700" placeholder="" />
                <EditableField editMode={cellEditable} setRef={setFieldRef} onInput={persistDraft} id="address" html={init.address} className="text-[10px] text-slate-500 mt-0.5" placeholder="Company address" />
                {init.ids && <div className="text-[9px] text-slate-400 mt-0.5" dangerouslySetInnerHTML={{ __html: init.ids }} />}
              </div>
            </div>
            <div className="text-right text-[9px] text-slate-400">
              <p>Generated: {report.generatedAt ? new Date(report.generatedAt).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}</p>
              {report.generatedBy && <p>By: {report.generatedBy}</p>}
              <p>{rows.length} record(s)</p>
            </div>
          </div>

          {/* Title + optional header note */}
          <EditableField editMode={cellEditable} setRef={setFieldRef} onInput={persistDraft} id="title" html={init.title} className="text-[15px] font-bold text-center mb-1" placeholder="Report Title" />
          <EditableField editMode={cellEditable} setRef={setFieldRef} onInput={persistDraft} id="headerNote" html={init.headerNote} className="text-[10px] text-slate-500 text-center mb-3 italic" placeholder={cellEditable ? 'Add an optional header note…' : ''} />

          {/* Data table — editable cells (formatting preserved; values only) */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'system-ui, sans-serif' }}>
            <thead>
              <tr>{cols.map(c => (
                <th key={c.key} style={{ border: '1px solid #cbd5e1', background: '#eef2ff', color: '#3730a3', padding: '4px 6px', fontSize: 9.5, textAlign: numericCols[c.key] ? 'right' : 'left', whiteSpace: 'nowrap' }}>{c.label}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((_r, i) => (
                <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                  {cols.map((c, ci) => (
                    <EditableCell key={c.key} html={cellSeeds[i][ci]} editMode={cellEditable} row={i} col={c.key} numeric={!!numericCols[c.key]} onInput={persistDraft} onKeyDown={onCellKey} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Remarks / Notes */}
          <div className="mt-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1" style={{ fontFamily: 'system-ui, sans-serif' }}>Remarks / Notes</p>
            <EditableField editMode={cellEditable} setRef={setFieldRef} onInput={persistDraft} id="remarks" html={init.remarks} className="text-[11px] text-slate-700 min-h-[40px] border border-dashed border-slate-200 rounded p-2" placeholder={cellEditable ? 'Type remarks, notes or additional content here… (formatting supported)' : ''} />
          </div>

          {/* Signature + footer */}
          <div className="mt-10 flex justify-between items-end">
            <EditableField editMode={cellEditable} setRef={setFieldRef} onInput={persistDraft} id="footer" html={init.footer} className="text-[9px] text-slate-400 max-w-[60%]" placeholder={cellEditable ? 'Footer text…' : ''} />
            <div className="text-right">
              <div className="h-[1px] w-40 bg-slate-400 ml-auto mb-1" />
              <EditableField editMode={cellEditable} setRef={setFieldRef} onInput={persistDraft} id="signatory" html={init.signatory} className="text-[10px] font-semibold text-slate-700 text-right" placeholder="Authorized Signatory" />
              <p className="text-[8px] text-slate-400">For {stripHtml(init.companyName)}</p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 px-1">
        {canEdit
          ? 'Click any value — company/branch/title, notes, footer, signatory or a table cell — to edit it. Formatting stays identical; only the value changes. Click Save Changes to snapshot a version and log the edit (who/old/new/when). Print, PDF and Excel always export the edited version.'
          : 'You have view-only access to this report. Editing is restricted to authorized users.'}
      </p>
    </div>
  );
};

export default EditableReportCanvas;
