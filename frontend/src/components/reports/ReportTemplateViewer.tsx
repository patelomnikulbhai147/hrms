import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, Printer, FileDown, FileSpreadsheet, RefreshCw, AlertTriangle, Pencil, Save, Lock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { type TemplateDef } from './templateRegistry';
import { type ReportData } from './templates/types';
import { printNode, nodeToPdf, rowsToExcel } from './reportExport';

interface Props {
  def: TemplateDef;
  reportName: string;
  companyId: string;
  onClose: () => void;
  /** Optional action to auto-fire once live data has loaded (from a card button). */
  autoAction?: 'pdf' | 'excel' | 'print' | null;
  /** Permission to edit report content (Super Admin / Company Head / HR). */
  canEdit?: boolean;
  userName?: string;
  role?: string;
}

// Stable index-path key for an editable leaf, relative to the captured root, so
// edits re-attach to the same cell across re-renders of the same report.
const leafPath = (root: HTMLElement, el: HTMLElement): string => {
  const parts: number[] = [];
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    const par: HTMLElement | null = n.parentElement;
    if (!par) break;
    parts.unshift(Array.prototype.indexOf.call(par.children, n));
    n = par;
  }
  return parts.join('.');
};

// A purely numeric value (currency/percent/thousands/decimal/negative) — these
// cells must reject letters so a salary can never become text.
const isNumericText = (t: string): boolean => /^[₹$€£\s]*-?\d[\d,]*(\.\d+)?\s*%?$/.test(String(t || '').trim());
// Characters allowed while typing inside a numeric cell.
const NUMERIC_CHAR = /[0-9.,\-]/;

// True text-leaf cells: an element with text and NO element children (so editing
// changes content only — never the table/row/column structure). SVG is excluded.
const isEditableLeaf = (el: Element): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('svg')) return false;
  if (el.querySelector('*')) return false;            // has child elements → container, skip
  if (el.closest('[data-noedit]')) return false;      // the Remarks block manages itself
  return (el.textContent || '').trim().length > 0;
};

const CUR_YEAR = 2026;
const YEARS = [CUR_YEAR, CUR_YEAR - 1, CUR_YEAR - 2, CUR_YEAR - 3];

// Full-page viewer: loads LIVE data for the report, renders the matching template
// (the on-screen PREVIEW), and exports the very same node to PDF / Print, plus an
// Excel of the underlying rows. Preview === PDF === Print by construction.
export const ReportTemplateViewer: React.FC<Props> = ({ def, reportName, companyId, onClose, autoAction, canEdit = false, userName = '' }) => {
  const [year, setYear] = useState<number>(CUR_YEAR);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'print' | 'excel' | null>(null);
  const [editMode, setEditMode] = useState<boolean>(canEdit);
  const [dirty, setDirty] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  // Editable Remarks/Notes appended to the captured node — persisted per report.
  const notesKey = `hrms_report_notes_${def.reportKey}_${companyId}`;
  const initialNotes = useRef<string>((() => { try { return localStorage.getItem(notesKey) || ''; } catch { return ''; } })());

  // In-place content edits to the prescribed template (numbers/text/headers/footer)
  // — content only, layout fixed. Keyed by report+company+year; each entry stores
  // the original + edited text so a stale edit never lands on changed live data.
  const editsKey = `hrms_report_tpl_edits_${def.reportKey}_${companyId}_${year}`;
  const readEdits = (): Record<string, { o: string; v: string }> => { try { return JSON.parse(localStorage.getItem(editsKey) || '{}') || {}; } catch { return {}; } };
  const saveTimer = useRef<number | null>(null);

  // Collect the current editable leaves in document order.
  const editableLeaves = (): HTMLElement[] => {
    const root = printRef.current; if (!root) return [];
    return Array.from(root.querySelectorAll('*')).filter(isEditableLeaf) as HTMLElement[];
  };

  // Originals snapshot (path → pre-edit text), captured at wire time so a saved
  // edit always records the TRUE original even after the cell shows the new value.
  const originalsRef = useRef<Record<string, string>>({});
  const lastDataRef = useRef<ReportData | null>(null);

  // Wire up / tear down contentEditable on every text leaf when data renders or the
  // edit toggle flips, and re-apply any saved edits (only where the original text
  // still matches, so regenerated data is never clobbered by a stale edit).
  useEffect(() => {
    const root = printRef.current; if (!root || !data) return;
    if (lastDataRef.current !== data) { originalsRef.current = {}; lastDataRef.current = data; } // fresh data → reset originals
    const edits = readEdits();
    const leaves = editableLeaves();
    leaves.forEach(el => {
      const key = leafPath(root, el);
      const saved = edits[key];
      const cur = (el.textContent || '').trim();
      // Capture the original BEFORE any saved edit is applied (saved.o is the truth
      // when present; otherwise the current freshly-rendered value is the original).
      if (!(key in originalsRef.current)) originalsRef.current[key] = saved?.o ?? cur;
      if (saved && saved.o === cur && saved.v !== saved.o) el.textContent = saved.v;
      if (canEdit && editMode) {
        el.setAttribute('contenteditable', 'plaintext-only');
        (el.style as any).cursor = 'text';
        el.setAttribute('data-editable', '1');
        // Mark numeric cells so they only accept numbers (no letters/symbols).
        el.setAttribute('data-numeric', isNumericText(el.textContent || '') ? '1' : '0');
      } else {
        el.removeAttribute('contenteditable');
        el.removeAttribute('data-editable');
        el.removeAttribute('data-numeric');
      }
    });
    return () => { leaves.forEach(el => el.removeAttribute('contenteditable')); };
  }, [data, editMode, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist edits (debounced) as the user types directly in the report.
  const onReportInput = (e: React.FormEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (!canEdit || !editMode || !t.getAttribute('data-editable')) return;
    setDirty(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => persistEdits(), 500);
  };
  // Block Enter (no multi-line / row break) and, in numeric cells, reject any
  // character that isn't a digit / comma / dot / minus — a salary stays a number.
  const onReportKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (!t.getAttribute || !t.getAttribute('data-editable')) return;
    if (e.key === 'Enter') { e.preventDefault(); return; }
    if (t.getAttribute('data-numeric') === '1' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key.length === 1 && !NUMERIC_CHAR.test(e.key)) e.preventDefault(); // single printable, non-numeric → block
    }
  };
  // Sanitise pasted content: numeric cells keep digits only; all cells stay single-line.
  const onReportPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (!t.getAttribute || !t.getAttribute('data-editable')) return;
    const raw = (e.clipboardData?.getData('text') || '').replace(/[\r\n]+/g, ' ');
    const clean = t.getAttribute('data-numeric') === '1' ? raw.replace(/[^0-9.,\-]/g, '') : raw;
    e.preventDefault();
    try { document.execCommand('insertText', false, clean); } catch { /* noop */ }
    setDirty(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => persistEdits(), 500);
  };

  const persistEdits = () => {
    const root = printRef.current; if (!root) return;
    const next: Record<string, { o: string; v: string }> = {};
    editableLeaves().forEach(el => {
      const key = leafPath(root, el);
      const cur = (el.textContent || '').trim();
      // Original comes from the snapshot taken at wire time (never the live, possibly
      // already-edited, text) so a real change is always detected and recorded.
      const orig = key in originalsRef.current ? originalsRef.current[key] : cur;
      if (cur !== orig) next[key] = { o: orig, v: cur };
    });
    try { localStorage.setItem(editsKey, JSON.stringify(next)); } catch { /* storage off */ }
  };

  const saveChanges = () => {
    persistEdits();
    setDirty(false);
    api.complianceReports.logDownload({ reportKey: def.reportKey, reportName, format: 'EDIT', companyId, rowCount: data?.rows?.length || 0 }).catch(() => {});
    ui.toast.success(`Changes saved${userName ? ` by ${userName}` : ''}. Print, PDF & Excel will use the edited version.`);
  };
  const resetEdits = () => {
    try { localStorage.removeItem(editsKey); } catch { /* */ }
    setDirty(false);
    load();
    ui.toast.info('Reverted to the original generated report.');
  };

  // Read the rendered (edited) table as a grid so Excel matches the on-screen
  // report exactly — same number of columns/rows, edited values included.
  const editedGrid = (): { header: string[]; rows: string[][] } | null => {
    const root = printRef.current; if (!root) return null;
    const tables = Array.from(root.querySelectorAll('table'));
    const table = tables.sort((a, b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length)[0];
    if (!table) return null;
    const trs = Array.from(table.querySelectorAll('tr'));
    if (!trs.length) return null;
    const cellsOf = (tr: HTMLTableRowElement) => Array.from(tr.querySelectorAll('th,td')).map(c => (c.textContent || '').trim());
    const header = cellsOf(trs[0]);
    const rows = trs.slice(1).map(cellsOf);
    return { header, rows };
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.complianceReports.generate({ reportKey: def.reportKey, companyId, year });
      setData({ ...res, filters: { year } });
    } catch (e: any) {
      setError(e?.message || 'Failed to generate report.');
      setData(null);
    } finally { setLoading(false); }
  }, [def.reportKey, companyId, year]);

  useEffect(() => { load(); }, [load]);

  const Template = def.component;
  const hasRows = !!data && (data.rows?.length || 0) > 0;

  const logDownload = (format: string) =>
    api.complianceReports.logDownload({ reportKey: def.reportKey, reportName, format, companyId, rowCount: data?.rows?.length || 0 }).catch(() => {});

  const onPrint = () => { if (printRef.current) { printNode(printRef.current, reportName); logDownload('PRINT'); } };
  const onPdf = async () => {
    if (!printRef.current) return;
    setBusy('pdf');
    try { await nodeToPdf(printRef.current, `${def.fileStem}_${year}`, def.orientation); logDownload('PDF'); }
    catch (e: any) { ui.toast.error(e?.message || 'PDF export failed.'); }
    finally { setBusy(null); }
  };
  const onExcel = () => {
    if (!data) return;
    setBusy('excel');
    try {
      // Use the EDITED on-screen table when available so Excel === edited preview;
      // fall back to the canonical columns/rows when no table/edit is present.
      const grid = editedGrid();
      const branchLine = data.meta?.branchName ? `Branch: ${data.meta.branchName}` : '';
      const headerLines = [data.meta?.name || '', data.meta?.address || '', branchLine, `${reportName} — ${year}`].filter(Boolean);
      if (grid && grid.header.length) {
        rowsToExcel({
          columns: grid.header.map((h, i) => ({ key: String(i), label: h })),
          rows: grid.rows.map(r => Object.fromEntries(r.map((c, i) => [String(i), c]))),
          fileName: `${def.fileStem}_${year}`, sheetName: reportName, headerLines,
        });
      } else {
        rowsToExcel({ columns: data.columns, rows: data.rows, fileName: `${def.fileStem}_${year}`, sheetName: reportName, headerLines });
      }
      logDownload('EXCEL');
    } catch (e: any) { ui.toast.error(e?.message || 'Excel export failed.'); }
    finally { setBusy(null); }
  };

  // Fire the card-requested action once, after live data + the template DOM exist.
  const autoFired = useRef(false);
  useEffect(() => {
    if (autoFired.current || !autoAction || loading || !hasRows) return;
    autoFired.current = true;
    const t = setTimeout(() => {
      if (autoAction === 'pdf') onPdf();
      else if (autoAction === 'print') onPrint();
      else if (autoAction === 'excel') onExcel();
    }, 200);
    return () => clearTimeout(t);
  }, [autoAction, loading, hasRows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4 animate-fade-in">
      <style>{`.report-notes-editable:empty:before{content:attr(data-ph);color:#cbd5e1;} .report-notes-editable:focus{background:rgba(99,102,241,0.06);border-radius:4px;}`}</style>
      {/* Toolbar */}
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition"><ChevronLeft size={15} /> Back to Reports</button>
          <div>
            <h2 className="text-sm font-extrabold text-slate-800">{reportName}</h2>
            <p className="text-[11px] text-slate-400">{def.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-28"><Select value={String(year)} onChange={e => setYear(Number(e.target.value))} options={YEARS.map(y => ({ value: String(y), label: `Year ${y}` }))} /></div>
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={load}>Generate</Button>
          {canEdit ? (
            <>
              <button
                onClick={() => setEditMode(m => !m)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${editMode ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                title={editMode ? 'Editing on — click cells to edit' : 'Turn on editing'}
              >
                <Pencil size={13} /> {editMode ? 'Editing' : 'Edit'}
              </button>
              <Button variant="outline" size="sm" icon={<Save size={14} />} onClick={saveChanges} disabled={!hasRows} className={dirty ? 'ring-2 ring-indigo-300' : ''}>Save Changes</Button>
              {dirty && <button onClick={resetEdits} title="Discard edits, restore original" className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600"><RotateCcw size={12} /> Revert</button>}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200" title="You have view-only access"><Lock size={12} /> View Only</span>
          )}
          <Button variant="outline" size="sm" icon={<Printer size={14} />} onClick={onPrint} disabled={!hasRows}>Print</Button>
          <Button variant="outline" size="sm" icon={<FileSpreadsheet size={14} />} onClick={onExcel} disabled={!hasRows || busy === 'excel'}>Excel</Button>
          <Button size="sm" icon={<FileDown size={14} />} onClick={onPdf} loading={busy === 'pdf'} disabled={!hasRows}>Export PDF</Button>
        </div>
      </div>

      {/* Editing hint */}
      {canEdit && editMode && hasRows && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2 flex items-center gap-2 text-[11px] text-indigo-700">
          <Pencil size={13} className="shrink-0" /> Click any value, header or footer to edit it directly — layout and totals stay intact. <strong>Save Changes</strong> so Print, PDF and Excel use the edited version.
        </div>
      )}

      {/* Warnings */}
      {data?.warnings && data.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="text-[11px] text-amber-700 space-y-0.5">{data.warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
        </div>
      )}

      {/* Preview surface */}
      <div className="bg-slate-200/60 rounded-[14px] border border-slate-200 p-4 overflow-auto" style={{ maxHeight: '70vh' }}>
        {loading ? (
          <div className="py-20 text-center text-sm text-slate-500">Generating report from live data…</div>
        ) : error ? (
          <div className="py-20 text-center text-sm text-rose-600">{error}</div>
        ) : (
          <div className="shadow-lg" style={{ width: 'fit-content', margin: '0 auto' }}>
            {/* The single source of truth for preview, print and PDF. In-place edits
                bubble here (onInput) and are captured by every export. */}
            <div ref={printRef} onInput={onReportInput} onKeyDown={onReportKeyDown} onPaste={onReportPaste}>
              {data && <Template data={data} />}
              {/* Editable Remarks / Notes — appended below the prescribed form (does
                  NOT alter the statutory layout) and captured in the PDF / Print. */}
              {data && (
                <div data-noedit className="bg-white border-t border-slate-200" style={{ padding: '10px 16px', fontFamily: 'system-ui, sans-serif' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Remarks / Notes</p>
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    data-ph="Add remarks or notes to include in the PDF / print…"
                    onInput={e => { try { localStorage.setItem(notesKey, (e.target as HTMLElement).innerHTML); } catch { /* storage off */ } }}
                    className="report-notes-editable text-[11px] text-slate-700 outline-none"
                    style={{ minHeight: 34 }}
                    dangerouslySetInnerHTML={{ __html: initialNotes.current }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportTemplateViewer;
