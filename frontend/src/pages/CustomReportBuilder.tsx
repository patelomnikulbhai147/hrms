// ─────────────────────────────────────────────────────────────────────────────
// Custom Report Builder — a drag & drop report designer.
//
// Left: searchable, categorised field tree (drag OR click to add). Center: the
// column canvas (drag to reorder, rename, remove) above a LIVE preview that
// re-runs automatically as the design changes — flat OR grouped with per-group
// subtotals, optional chart, and conditional-formatting colours. Right: per-column
// properties, a NESTED AND/OR filter builder, multi-column sort, grouping,
// calculated (formula) columns, totals, charts and report options.
//
// Phase 2 also adds: version history, scheduled email delivery, Word export.
//
// All data comes from the injection-safe backend engine (/api/custom-reports),
// which enforces company isolation + role field-visibility. This file never
// touches the standard reports — it is a wholly additive module.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Wand2, Plus, Search, X, GripVertical, ArrowUp, ArrowDown, Filter, ArrowUpDown,
  Sigma, Settings2, Save, Copy, Trash2, Download, Printer, RefreshCw, ChevronLeft,
  FileSpreadsheet, FileText, LayoutTemplate, Eye, AlertTriangle, Layers, Calculator,
  BarChart3, PieChart, LineChart, Palette, History, CalendarClock, Send, MoreVertical,
  FileType, Clock, RotateCcw, Mail,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { exportRowsToExcel, exportReportCsv, exportRowsToPDF } from '@/utils/exportUtils';
import type { Role } from '@/data/mockData';

type FieldMeta = { key: string; label: string; type: 'string' | 'number' | 'date' | 'boolean'; category: string; sensitive?: boolean; aggregatable?: boolean };
type SourceMeta = { key: string; label: string; module: string; fields: FieldMeta[] };
type OperatorMeta = { op: string; label: string };
type Meta = { sources: SourceMeta[]; operators: Record<string, OperatorMeta[]>; templates: { key: string; name: string; module: string; description: string }[] };

type Condition = { field: string; op: string; value?: any; value2?: any };
type FilterNode = { logic: 'AND' | 'OR'; conditions: Array<Condition | FilterNode> };
type SortRule = { field: string; dir: 'asc' | 'desc' };
type CalcCol = { key: string; label: string; expr: string; format?: string };
type FormatRule = { op: string; value?: string; value2?: string; color?: string; bg?: string; bold?: boolean };
type ColumnCfg = { header?: string; align?: string; width?: number; rules?: FormatRule[] };
type ChartCfg = { type: 'none' | 'bar' | 'pie' | 'line'; categoryField?: string; valueField?: string; agg: 'sum' | 'avg' | 'count' };
type Schedule = { enabled: boolean; freq: 'daily' | 'weekly' | 'monthly'; time: string; weekday: number; day: number; recipients: string[]; format: 'csv' | 'excel'; lastRunAt?: string | null; lastResult?: string };
type ReportConfig = {
  source: string;
  fields: string[];
  columns: Record<string, ColumnCfg>;
  filters: FilterNode;
  sorts: SortRule[];
  group: string[];
  summary: Record<string, string[]>;
  calculated: CalcCol[];
  chart?: ChartCfg;
};
type SavedReport = { id: string; name: string; description: string; visibility: string; ownerName?: string; config: ReportConfig; schedule?: Schedule | null; updatedAt?: string };

const EMPTY_CONFIG = (source: string): ReportConfig => ({ source, fields: [], columns: {}, filters: { logic: 'AND', conditions: [] }, sorts: [], group: [], summary: {}, calculated: [], chart: { type: 'none', agg: 'sum' } });
const PREVIEW_LIMIT = 50;
const EXPORT_LIMIT = 5000;
const isNode = (x: any): x is FilterNode => x && Array.isArray(x.conditions);

const fmt = (v: any, type: string) => {
  if (v === null || v === undefined || v === '') return '';
  if (type === 'number') { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(v); }
  return String(v);
};

// Conditional-formatting: first matching rule wins → inline style for a cell.
const matchRule = (r: FormatRule, v: any, type: string): boolean => {
  if (type === 'number') {
    const n = Number(v), a = Number(r.value), b = Number(r.value2);
    switch (r.op) { case 'gt': return n > a; case 'gte': return n >= a; case 'lt': return n < a; case 'lte': return n <= a; case 'eq': return n === a; case 'ne': return n !== a; case 'between': return n >= a && n <= b; default: return false; }
  }
  const s = String(v ?? '').toLowerCase(), rv = String(r.value ?? '').toLowerCase();
  switch (r.op) { case 'eq': return s === rv; case 'ne': return s !== rv; case 'contains': return s.includes(rv); case 'empty': return s === ''; default: return false; }
};
const cellStyle = (col: any, v: any): React.CSSProperties | undefined => {
  const rules: FormatRule[] = col?.rules || [];
  for (const r of rules) if (matchRule(r, v, col.type)) return { color: r.color || undefined, background: r.bg || undefined, fontWeight: r.bold ? 700 : undefined };
  return undefined;
};
const styleToCss = (s?: React.CSSProperties) => !s ? '' : `${s.color ? `color:${s.color};` : ''}${s.background ? `background:${s.background};` : ''}${s.fontWeight ? `font-weight:${s.fontWeight};` : ''}`;

interface Props { role: Role; activeCompanyId: string; companies: any[]; authProfile?: any; }

export const CustomReportBuilder: React.FC<Props> = ({ role, activeCompanyId, authProfile }) => {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [view, setView] = useState<'list' | 'design'>('list');
  const [loadingList, setLoadingList] = useState(true);

  const [reportId, setReportId] = useState<string | null>(null);
  const [name, setName] = useState('Untitled Report');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [config, setConfig] = useState<ReportConfig>(EMPTY_CONFIG('employee'));
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'column' | 'filters' | 'sort' | 'group' | 'calc' | 'chart' | 'options'>('column');

  const [preview, setPreview] = useState<any | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showChart, setShowChart] = useState(true);
  const [modal, setModal] = useState<null | 'schedule' | 'history'>(null);

  const source = useMemo(() => meta?.sources.find(s => s.key === config.source) || null, [meta, config.source]);
  const fieldOf = useCallback((key: string) => source?.fields.find(f => f.key === key) || null, [source]);
  const calcOf = useCallback((key: string) => config.calculated.find(c => c.key === key) || null, [config.calculated]);
  const labelOf = useCallback((key: string) => fieldOf(key)?.label || calcOf(key)?.label || key, [fieldOf, calcOf]);

  const categories = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cats: Record<string, FieldMeta[]> = {};
    (source?.fields || []).forEach(f => {
      if (q && !f.label.toLowerCase().includes(q) && !f.category.toLowerCase().includes(q)) return;
      (cats[f.category] = cats[f.category] || []).push(f);
    });
    return cats;
  }, [source, search]);

  useEffect(() => {
    (async () => {
      try { setMeta(await api.customReports.meta()); }
      catch (e: any) { ui.toast.error(`Could not load report fields: ${e?.message || 'error'}`); }
    })();
  }, []);
  const loadList = useCallback(async () => {
    setLoadingList(true);
    try { const list = await api.customReports.list(activeCompanyId); setSaved(Array.isArray(list) ? list : []); }
    catch { setSaved([]); } finally { setLoadingList(false); }
  }, [activeCompanyId]);
  useEffect(() => { loadList(); }, [loadList]);

  // ── live preview (debounced) ──
  const runPreview = useCallback(async (cfg: ReportConfig, pg: number) => {
    if (!cfg.fields.length && !cfg.calculated.length) { setPreview(null); return; }
    setPreviewing(true);
    try {
      // Grouped reports scan more rows so subtotals are meaningful.
      const limit = cfg.group?.length ? 2000 : PREVIEW_LIMIT;
      const res = await api.customReports.run({ companyId: activeCompanyId, config: { ...cfg, page: pg, limit } });
      if (res?.error) setPreview({ columns: [], rows: [], total: 0, summary: null, warnings: [res.error] });
      else setPreview(res);
    } catch (e: any) { setPreview({ columns: [], rows: [], total: 0, summary: null, warnings: [e?.message || 'Failed to run report'] }); }
    finally { setPreviewing(false); }
  }, [activeCompanyId]);

  const cfgKey = JSON.stringify({ s: config.source, f: config.fields, fl: config.filters, so: config.sorts, su: config.summary, g: config.group, cc: config.calculated, co: config.columns });
  useEffect(() => {
    if (view !== 'design') return;
    const t = setTimeout(() => runPreview(config, page), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey, page, view]);

  // ── config mutators ──
  const patchCfg = (patch: Partial<ReportConfig>) => setConfig(c => ({ ...c, ...patch }));
  const addField = (key: string) => setConfig(c => (c.fields.includes(key) ? c : { ...c, fields: [...c.fields, key] }));
  const removeField = (key: string) => setConfig(c => ({ ...c, fields: c.fields.filter(f => f !== key), summary: omit(c.summary, key), columns: omit(c.columns, key), sorts: c.sorts.filter(s => s.field !== key), group: c.group.filter(g => g !== key) }));
  const moveField = (from: number, to: number) => setConfig(c => { if (to < 0 || to >= c.fields.length) return c; const f = [...c.fields]; const [m] = f.splice(from, 1); f.splice(to, 0, m); return { ...c, fields: f }; });
  const setColumn = (key: string, patch: any) => setConfig(c => ({ ...c, columns: { ...c.columns, [key]: { ...c.columns[key], ...patch } } }));
  const toggleSummary = (key: string) => setConfig(c => ({ ...c, summary: c.summary[key] ? omit(c.summary, key) : { ...c.summary, [key]: ['sum'] } }));
  const toggleGroup = (key: string) => setConfig(c => ({ ...c, group: c.group.includes(key) ? c.group.filter(g => g !== key) : [...c.group, key] }));

  // ── start / open ──
  const resetSchedule = () => setSchedule(null);
  const startNew = (sourceKey: string) => {
    setReportId(null); setName('Untitled Report'); setDescription(''); setVisibility('private'); resetSchedule();
    setConfig(EMPTY_CONFIG(sourceKey)); setActiveField(null); setPage(1); setPreview(null); setRightTab('column'); setView('design');
  };
  const hydrateConfig = (c: any): ReportConfig => ({ ...EMPTY_CONFIG(c?.source || 'employee'), ...c, chart: c?.chart || { type: 'none', agg: 'sum' }, calculated: Array.isArray(c?.calculated) ? c.calculated : [], group: Array.isArray(c?.group) ? c.group : [], filters: c?.filters?.conditions ? c.filters : { logic: 'AND', conditions: [] } });
  const openTemplate = async (key: string) => {
    try {
      const t = await api.customReports.template(key);
      setReportId(null); setName(t.name); setDescription(t.description || ''); setVisibility('private'); resetSchedule();
      setConfig(hydrateConfig(t.config)); setActiveField(t.config.fields?.[0] || null); setPage(1); setRightTab('column'); setView('design');
    } catch (e: any) { ui.toast.error(`Could not open template: ${e?.message || 'error'}`); }
  };
  const openReport = async (id: string) => {
    try {
      const r = await api.customReports.get(id);
      setReportId(r.id); setName(r.name); setDescription(r.description || ''); setVisibility(r.visibility || 'private'); setSchedule(r.schedule || null);
      setConfig(hydrateConfig(r.config)); setActiveField(r.config.fields?.[0] || null); setPage(1); setRightTab('column'); setView('design');
    } catch (e: any) { ui.toast.error(`Could not open report: ${e?.message || 'error'}`); }
  };

  // ── save / duplicate / delete ──
  const save = async (asNew = false) => {
    if (!name.trim()) { ui.toast.warning('Give the report a name first.'); return; }
    if (!config.fields.length && !config.calculated.length) { ui.toast.warning('Add at least one field before saving.'); return; }
    try {
      const body = { companyId: activeCompanyId, name: name.trim(), description, visibility, config };
      if (reportId && !asNew) { const r = await api.customReports.update(reportId, body); ui.toast.success('Report saved.'); setReportId(r.id); }
      else { const r = await api.customReports.create(body); ui.toast.success('Report saved.'); setReportId(r.id); }
      loadList();
    } catch (e: any) { ui.toast.error(`Save failed: ${e?.message || 'error'}`); }
  };
  const duplicate = async (id: string) => { try { await api.customReports.duplicate(id); ui.toast.success('Report duplicated.'); loadList(); } catch (e: any) { ui.toast.error(e?.message || 'Duplicate failed'); } };
  const remove = async (r: SavedReport) => {
    if (!(await ui.confirm({ title: 'Delete report', message: `Delete "${r.name}"? This cannot be undone.`, confirmText: 'Delete', variant: 'danger' }))) return;
    try { await api.customReports.remove(r.id); ui.toast.success('Report deleted.'); loadList(); } catch (e: any) { ui.toast.error(e?.message || 'Delete failed'); }
  };

  // ── export ──
  const flattenForExport = (res: any): { cols: any[]; rows: any[] } => {
    if (res.grouped) {
      const cols = [{ key: '__group', header: 'Group', type: 'string', align: 'left' }, ...res.columns];
      const rows: any[] = [];
      for (const g of res.groups || []) for (const row of g.rows || []) rows.push({ ...row, __group: g.label });
      return { cols, rows };
    }
    return { cols: res.columns, rows: res.rows };
  };
  const doExport = async (kind: 'excel' | 'csv' | 'pdf' | 'word' | 'print') => {
    setExportOpen(false);
    if (!config.fields.length && !config.calculated.length) { ui.toast.warning('Nothing to export yet.'); return; }
    try {
      ui.toast.info('Preparing export…');
      const res = await api.customReports.run({ companyId: activeCompanyId, config: { ...config, page: 1, limit: EXPORT_LIMIT } });
      if (res?.error) { ui.toast.error(res.error); return; }
      const { cols, rows } = flattenForExport(res);
      const total = res.grouped ? (res.grandTotals?.count ?? rows.length) : (res.total ?? rows.length);
      if (kind === 'print' || kind === 'word') { renderDoc(cols, rows, total, kind); if (kind === 'word') ui.toast.success(`Exported ${rows.length} row(s).`); return; }
      const exportCols = cols.map((c: any, i: number) => ({ header: c.header, key: `c${i}`, width: 18 }));
      const exportRows = rows.map((r: any) => { const o: any = {}; cols.forEach((c: any, i: number) => { o[`c${i}`] = fmt(r[c.key], c.type); }); return o; });
      const fileBase = (name || 'Custom_Report').replace(/[^\w\-]+/g, '_');
      if (kind === 'excel') exportRowsToExcel(fileBase, exportCols, exportRows, name.slice(0, 28) || 'Report');
      else if (kind === 'csv') exportReportCsv(fileBase, exportCols as any, exportRows);
      else if (kind === 'pdf') exportRowsToPDF(fileBase, name, exportCols as any, exportRows);
      ui.toast.success(`Exported ${rows.length} row(s).`);
    } catch (e: any) { ui.toast.error(`Export failed: ${e?.message || 'error'}`); }
  };
  // Print OR Word — both are HTML; Word is downloaded as a .doc the client opens.
  const renderDoc = (cols: any[], rows: any[], total: number, kind: 'print' | 'word') => {
    const th = cols.map(c => `<th style="text-align:${c.align}">${escapeHtml(c.header)}</th>`).join('');
    const trs = rows.map(r => `<tr>${cols.map(c => { const st = styleToCss(cellStyle(c, r[c.key])); return `<td style="text-align:${c.align};${st}">${escapeHtml(fmt(r[c.key], c.type))}</td>`; }).join('')}</tr>`).join('');
    const html = `<html><head><meta charset="utf-8"><title>${escapeHtml(name)}</title><style>
      body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#0f172a}
      h1{font-size:18px;margin:0 0 4px} .sub{color:#64748b;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #e2e8f0;padding:6px 8px} th{background:#16284a;color:#fff}
      tr:nth-child(even) td{background:#f8fafc}
    </style></head><body><h1>${escapeHtml(name)}</h1>
      <div class="sub">${escapeHtml(description || '')} · ${total} record(s) · Generated ${new Date().toLocaleString('en-IN')}</div>
      <table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
    if (kind === 'word') {
      const blob = new Blob(['﻿', html], { type: 'application/msword' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(name || 'Custom_Report').replace(/[^\w\-]+/g, '_')}.doc`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else {
      const w = window.open('', '_blank'); if (!w) return; w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    }
  };

  // ── send now (uses saved report) ──
  const sendNow = async () => {
    setMoreOpen(false);
    if (!reportId) { ui.toast.warning('Save the report first, then send.'); return; }
    const to = schedule?.recipients?.length ? schedule.recipients : [];
    if (!to.length) { setModal('schedule'); ui.toast.info('Add recipients in the schedule first.'); return; }
    try { const out = await api.customReports.sendNow(reportId, { recipients: to, format: schedule?.format || 'excel' }); ui.toast.success(out.devMode ? `Prepared (dev mode — SMTP off): ${out.rows} rows` : `Emailed ${out.rows} row(s) to ${to.length} recipient(s).`); }
    catch (e: any) { ui.toast.error(`Send failed: ${e?.message || 'error'}`); }
  };

  if (!meta) return <div className="p-8 text-slate-500">Loading report designer…</div>;

  // ══════════════════════════════ LIST / GALLERY VIEW ══════════════════════════
  if (view === 'list') {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2"><Wand2 size={20} className="text-brand-600" /> Custom Report Builder</h1>
            <p className="text-sm text-slate-500 mt-0.5">Design your own reports by dragging fields — no code. Filter, group, calculate, chart, schedule and export.</p>
          </div>
          <div className="flex items-center gap-2">
            <select onChange={e => { if (e.target.value) startNew(e.target.value); e.target.value = ''; }} value=""
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 bg-white">
              <option value="">+ New Report from…</option>
              {meta.sources.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <Card>
          <div className="flex items-center gap-2 mb-3"><LayoutTemplate size={16} className="text-brand-600" /><h2 className="text-sm font-bold text-slate-800">Templates — start from a ready-made report</h2></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {meta.templates.map(t => (
              <button key={t.key} onClick={() => openTemplate(t.key)}
                className="text-left rounded-xl border border-slate-200 hover:border-brand-400 hover:shadow-sm transition p-3 bg-white group">
                <div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-800 group-hover:text-brand-700">{t.name}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.module}</span></div>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold text-slate-800 mb-3">Saved Reports</h2>
          {loadingList ? <div className="text-sm text-slate-400 py-6 text-center">Loading…</div>
            : !saved.length ? <div className="text-sm text-slate-400 py-8 text-center">No saved reports yet. Start from a template or create a new one.</div>
              : <div className="divide-y divide-slate-100">
                {saved.map(r => (
                  <div key={r.id} className="flex items-center justify-between py-2.5 gap-3">
                    <button onClick={() => openReport(r.id)} className="flex-1 text-left min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate flex items-center gap-2">{r.name}
                        {r.schedule?.enabled && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5"><CalendarClock size={11} />{r.schedule.freq}</span>}</div>
                      <div className="text-xs text-slate-400 truncate">{r.description || '—'} · {r.visibility}{r.ownerName ? ` · ${r.ownerName}` : ''}</div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openReport(r.id)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title="Open"><Eye size={15} /></button>
                      <button onClick={() => duplicate(r.id)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title="Duplicate"><Copy size={15} /></button>
                      <button onClick={() => remove(r)} className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500" title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>}
        </Card>
      </div>
    );
  }

  // ══════════════════════════════ DESIGNER VIEW ════════════════════════════════
  const activeMeta = activeField ? fieldOf(activeField) : null;
  const activeCalc = activeField ? calcOf(activeField) : null;
  const activeCol = activeField ? { ...(preview?.columns || []).find((c: any) => c.key === activeField), type: activeMeta?.type || (activeCalc ? 'number' : 'string') } : null;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] min-h-[560px]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-200">
        <button onClick={() => setView('list')} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600" title="Back to reports"><ChevronLeft size={18} /></button>
        <input value={name} onChange={e => setName(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 min-w-[180px]" placeholder="Report name" />
        <select value={config.source} onChange={e => { if (e.target.value !== config.source) setConfig(EMPTY_CONFIG(e.target.value)); }}
          className="h-9 rounded-lg border border-slate-300 px-2 text-sm text-slate-700 bg-white" title="Data source">
          {meta.sources.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div className="flex-1" />
        {previewing && <span className="text-xs text-slate-400 flex items-center gap-1"><RefreshCw size={12} className="animate-spin" /> preview…</span>}
        <Button size="sm" variant="secondary" onClick={() => runPreview(config, page)}><RefreshCw size={14} className="mr-1" />Preview</Button>
        <div className="relative">
          <Button size="sm" variant="secondary" onClick={() => setExportOpen(o => !o)}><Download size={14} className="mr-1" />Export</Button>
          {exportOpen && (
            <div className="absolute right-0 mt-1 z-20 w-40 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-sm">
              <button onClick={() => doExport('excel')} className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2"><FileSpreadsheet size={14} className="text-emerald-600" />Excel</button>
              <button onClick={() => doExport('csv')} className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2"><FileText size={14} className="text-slate-500" />CSV</button>
              <button onClick={() => doExport('pdf')} className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2"><FileText size={14} className="text-rose-600" />PDF</button>
              <button onClick={() => doExport('word')} className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2"><FileType size={14} className="text-blue-600" />Word</button>
              <button onClick={() => doExport('print')} className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2"><Printer size={14} className="text-slate-500" />Print</button>
            </div>
          )}
        </div>
        {reportId && <Button size="sm" variant="secondary" onClick={() => save(true)}><Copy size={14} className="mr-1" />Save As</Button>}
        <Button size="sm" onClick={() => save(false)}><Save size={14} className="mr-1" />Save</Button>
        <div className="relative">
          <button onClick={() => setMoreOpen(o => !o)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600" title="More"><MoreVertical size={18} /></button>
          {moreOpen && (
            <div className="absolute right-0 mt-1 z-20 w-52 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-sm">
              <button disabled={!reportId} onClick={() => { setMoreOpen(false); setModal('schedule'); }} className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40"><CalendarClock size={14} className="text-brand-600" />Schedule &amp; email…</button>
              <button disabled={!reportId} onClick={sendNow} className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40"><Send size={14} className="text-emerald-600" />Send now</button>
              <button disabled={!reportId} onClick={() => { setMoreOpen(false); setModal('history'); }} className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40"><History size={14} className="text-slate-500" />Version history…</button>
              {!reportId && <div className="px-3 py-1.5 text-[11px] text-slate-400">Save the report to unlock these.</div>}
            </div>
          )}
        </div>
      </div>

      {/* 3-panel body */}
      <div className="flex-1 grid grid-cols-[230px_1fr_272px] gap-3 pt-3 min-h-0">
        {/* LEFT — field tree */}
        <div className="flex flex-col min-h-0 rounded-xl border border-slate-200 bg-white">
          <div className="p-2 border-b border-slate-100">
            <div className="relative"><Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search fields…" className="w-full h-8 pl-7 pr-2 rounded-md border border-slate-200 text-xs" /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {Object.entries(categories).map(([cat, fields]) => (
              <div key={cat}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 px-1 mb-1">{cat}</div>
                <div className="space-y-0.5">
                  {fields.map(f => {
                    const used = config.fields.includes(f.key);
                    return (
                      <div key={f.key} draggable onDragStart={e => e.dataTransfer.setData('text/field', f.key)}
                        onClick={() => addField(f.key)}
                        className={`group flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-grab active:cursor-grabbing select-none ${used ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50 text-slate-700'}`}
                        title={f.sensitive ? 'Restricted field (role-gated)' : 'Drag to canvas, or click to add'}>
                        <GripVertical size={12} className="text-slate-300 group-hover:text-slate-400" />
                        <span className="flex-1 truncate">{f.label}</span>
                        {f.sensitive && <span className="text-[9px] text-amber-500">●</span>}
                        {used ? <span className="text-brand-400">✓</span> : <Plus size={12} className="opacity-0 group-hover:opacity-100 text-slate-400" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {!Object.keys(categories).length && <div className="text-xs text-slate-400 p-2">No fields match “{search}”.</div>}
          </div>
        </div>

        {/* CENTER — canvas + chart + live preview */}
        <div className="flex flex-col min-h-0 rounded-xl border border-slate-200 bg-white">
          {/* column canvas (drop target) */}
          <div onDragOver={e => { e.preventDefault(); }} onDrop={e => { const k = e.dataTransfer.getData('text/field'); if (k) addField(k); }}
            className="p-2 border-b border-slate-100 min-h-[52px]">
            {!config.fields.length && !config.calculated.length ? (
              <div className="text-xs text-slate-400 flex items-center gap-2 justify-center py-3 border-2 border-dashed border-slate-200 rounded-lg">
                <Plus size={14} /> Drag fields here (or click them) to build your columns
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {config.fields.map((key, i) => (
                  <div key={key} draggable onDragStart={() => setDragIdx(i)} onDragOver={e => e.preventDefault()}
                    onDrop={() => { if (dragIdx !== null && dragIdx !== i) moveField(dragIdx, i); setDragIdx(null); }}
                    onClick={() => { setActiveField(key); setRightTab('column'); }}
                    className={`flex items-center gap-1 pl-2 pr-1 py-1 rounded-md text-xs cursor-pointer border ${activeField === key ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'} ${config.group.includes(key) ? 'ring-1 ring-indigo-300' : ''}`}>
                    <GripVertical size={11} className="text-slate-300" />
                    <span className="truncate max-w-[120px]">{config.columns[key]?.header || fieldOf(key)?.label || key}</span>
                    <button onClick={e => { e.stopPropagation(); removeField(key); }} className="p-0.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-500"><X size={11} /></button>
                  </div>
                ))}
                {config.calculated.map(c => (
                  <div key={c.key} onClick={() => { setActiveField(c.key); setRightTab('calc'); }}
                    className={`flex items-center gap-1 pl-2 pr-1 py-1 rounded-md text-xs cursor-pointer border ${activeField === c.key ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-violet-200 bg-violet-50/50 text-violet-700 hover:border-violet-300'}`} title={`= ${c.expr}`}>
                    <Calculator size={11} />
                    <span className="truncate max-w-[120px]">{c.label}</span>
                    <button onClick={e => { e.stopPropagation(); setConfig(cc => ({ ...cc, calculated: cc.calculated.filter(x => x.key !== c.key), summary: omit(cc.summary, c.key) })); }} className="p-0.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-500"><X size={11} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* chart */}
          {config.chart && config.chart.type !== 'none' && config.chart.categoryField && showChart && (
            <div className="border-b border-slate-100 p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1"><BarChart3 size={12} />Chart</div>
                <button onClick={() => setShowChart(false)} className="text-[11px] text-slate-400 hover:text-slate-600">Hide</button>
              </div>
              <ChartPanel config={config} activeCompanyId={activeCompanyId} labelOf={labelOf} />
            </div>
          )}
          {config.chart && config.chart.type !== 'none' && config.chart.categoryField && !showChart && (
            <button onClick={() => setShowChart(true)} className="text-[11px] text-brand-600 px-3 py-1 border-b border-slate-100 text-left">Show chart</button>
          )}

          {/* live preview table */}
          <div className="flex-1 overflow-auto">
            {!config.fields.length && !config.calculated.length ? (
              <div className="h-full grid place-items-center text-sm text-slate-300">Live preview appears here</div>
            ) : preview && preview.columns?.length ? (
              preview.grouped ? <GroupedTable preview={preview} /> : <FlatTable preview={preview} />
            ) : <div className="h-full grid place-items-center text-sm text-slate-300">{previewing ? 'Running…' : 'No preview'}</div>}
          </div>

          {/* footer */}
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span>{preview ? `${(preview.total ?? 0).toLocaleString('en-IN')} record(s)${preview.grouped ? ` · ${preview.groups?.length || 0} group(s)` : ''}` : '—'}</span>
              {preview?.warnings?.length ? <span className="flex items-center gap-1 text-amber-600" title={preview.warnings.join('\n')}><AlertTriangle size={12} />{preview.warnings.length} note(s)</span> : null}
            </div>
            {preview && !preview.grouped && preview.total > PREVIEW_LIMIT && (
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-2 py-0.5 rounded border border-slate-200 disabled:opacity-40">Prev</button>
                <span>Page {page} / {Math.ceil(preview.total / PREVIEW_LIMIT)}</span>
                <button disabled={page >= Math.ceil(preview.total / PREVIEW_LIMIT)} onClick={() => setPage(p => p + 1)} className="px-2 py-0.5 rounded border border-slate-200 disabled:opacity-40">Next</button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — properties */}
        <div className="flex flex-col min-h-0 rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap border-b border-slate-100 text-[11px] font-semibold">
            {([['column', Settings2, 'Column'], ['filters', Filter, 'Filter'], ['sort', ArrowUpDown, 'Sort'], ['group', Layers, 'Group'], ['calc', Calculator, 'Formula'], ['chart', PieChart, 'Chart'], ['options', Sigma, 'Setup']] as const).map(([t, Icon, label]) => (
              <button key={t} onClick={() => setRightTab(t)} className={`flex-1 min-w-[52px] py-2 flex flex-col items-center gap-0.5 ${rightTab === t ? 'text-brand-700 border-b-2 border-brand-500 bg-brand-50/50' : 'text-slate-500 hover:bg-slate-50'}`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3 text-sm">
            {rightTab === 'column' && (activeMeta || activeCalc ? (
              <ColumnPanel activeKey={activeField!} meta={activeMeta} calc={activeCalc} col={config.columns[activeField!] || {}} type={activeCol?.type || 'string'}
                onCol={(p: any) => setColumn(activeField!, p)}
                onMove={(d: number) => { const i = config.fields.indexOf(activeField!); moveField(i, i + d); }}
                canSummary={(activeCol?.type === 'number')} summaryOn={!!config.summary[activeField!]} onToggleSummary={() => toggleSummary(activeField!)}
                grouped={config.group.includes(activeField!)} onToggleGroup={() => toggleGroup(activeField!)}
                onRemove={() => activeMeta ? removeField(activeField!) : setConfig(cc => ({ ...cc, calculated: cc.calculated.filter(x => x.key !== activeField), summary: omit(cc.summary, activeField!) }))} />
            ) : <div className="text-xs text-slate-400">Click a column chip to edit its header, alignment, totals and colour rules.</div>)}

            {rightTab === 'filters' && <FiltersPanel node={config.filters} source={source} operators={meta.operators} chosen={config.fields} onChange={f => patchCfg({ filters: f })} />}
            {rightTab === 'sort' && <SortPanel config={config} source={source} onChange={s => patchCfg({ sorts: s })} />}
            {rightTab === 'group' && <GroupPanel config={config} labelOf={labelOf} onToggle={toggleGroup} />}
            {rightTab === 'calc' && <CalcPanel config={config} source={source} activeKey={activeField} onChange={(cc, ak) => { patchCfg({ calculated: cc }); if (ak) setActiveField(ak); }} />}
            {rightTab === 'chart' && <ChartConfigPanel config={config} labelOf={labelOf} onChange={ch => patchCfg({ chart: ch })} />}
            {rightTab === 'options' && (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-600">Who can see this saved report
                  <select value={visibility} onChange={e => setVisibility(e.target.value)} className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2 text-sm bg-white">
                    <option value="private">Private (only me)</option><option value="company">Everyone in the company</option></select></label>
                <label className="block text-xs font-semibold text-slate-600">Description
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-sm" /></label>
                <div className="rounded-lg border border-slate-200 p-2.5 text-xs text-slate-500 space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-slate-600"><CalendarClock size={13} className="text-brand-600" />Scheduled email</div>
                  <div>{schedule?.enabled ? `${schedule.freq} at ${schedule.time} → ${schedule.recipients.length} recipient(s)` : 'Not scheduled.'}</div>
                  <button disabled={!reportId} onClick={() => setModal('schedule')} className="text-brand-600 font-semibold disabled:opacity-40">{schedule?.enabled ? 'Edit schedule' : 'Set up schedule'} →</button>
                  {!reportId && <div className="text-[11px] text-slate-400">Save the report first.</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {modal === 'schedule' && reportId && (
        <ScheduleModal reportId={reportId} initial={schedule} defaultEmail={authProfile?.email} onClose={() => setModal(null)}
          onSaved={(s) => { setSchedule(s); setModal(null); loadList(); }} />
      )}
      {modal === 'history' && reportId && (
        <VersionsModal reportId={reportId} onClose={() => setModal(null)}
          onRestored={(cfg) => { setConfig(hydrateConfig(cfg)); setModal(null); ui.toast.success('Report restored to selected version.'); }} />
      )}
    </div>
  );
};

// ── Preview tables ────────────────────────────────────────────────────────────
const FlatTable: React.FC<{ preview: any }> = ({ preview }) => (
  <table className="w-full text-xs border-collapse">
    <thead className="sticky top-0 z-10"><tr className="bg-slate-800 text-white">
      {preview.columns.map((c: any) => <th key={c.key} className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ textAlign: c.align }}>{c.header}</th>)}
    </tr></thead>
    <tbody>
      {preview.rows.map((r: any, ri: number) => (
        <tr key={ri} className={ri % 2 ? 'bg-slate-50' : ''}>
          {preview.columns.map((c: any) => <td key={c.key} className="px-2 py-1 border-b border-slate-100 whitespace-nowrap" style={{ textAlign: c.align, ...cellStyle(c, r[c.key]) }}>{fmt(r[c.key], c.type)}</td>)}
        </tr>
      ))}
      {!preview.rows.length && <tr><td colSpan={preview.columns.length} className="text-center text-slate-400 py-8">No records match the current filters.</td></tr>}
      {preview.summary && Object.keys(preview.summary.fields || {}).length > 0 && (
        <tr className="bg-brand-50 font-bold text-brand-800 border-t-2 border-brand-200">
          {preview.columns.map((c: any, ci: number) => { const s = preview.summary.fields[c.key]; return <td key={c.key} className="px-2 py-1.5 whitespace-nowrap" style={{ textAlign: c.align }}>{ci === 0 && !s ? 'Total' : s ? `Σ ${fmt(s.sum, 'number')}` : ''}</td>; })}
        </tr>
      )}
    </tbody>
  </table>
);

const GroupedTable: React.FC<{ preview: any }> = ({ preview }) => {
  const cols = preview.columns;
  const grand = preview.grandTotals?.fields || {};
  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 z-10"><tr className="bg-slate-800 text-white">
        {cols.map((c: any) => <th key={c.key} className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ textAlign: c.align }}>{c.header}</th>)}
      </tr></thead>
      <tbody>
        {preview.groups.map((g: any, gi: number) => (
          <React.Fragment key={gi}>
            <tr className="bg-indigo-50 text-indigo-800 font-bold border-y border-indigo-100"><td colSpan={cols.length} className="px-2 py-1.5">{g.label} <span className="font-normal text-indigo-500">· {g.count} record(s)</span></td></tr>
            {g.rows.map((r: any, ri: number) => (
              <tr key={ri} className={ri % 2 ? 'bg-slate-50' : ''}>
                {cols.map((c: any) => <td key={c.key} className="px-2 py-1 border-b border-slate-100 whitespace-nowrap" style={{ textAlign: c.align, ...cellStyle(c, r[c.key]) }}>{fmt(r[c.key], c.type)}</td>)}
              </tr>
            ))}
            {Object.keys(g.subtotals || {}).length > 0 && (
              <tr className="bg-indigo-50/60 font-semibold text-indigo-700">
                {cols.map((c: any, ci: number) => { const s = g.subtotals[c.key]; return <td key={c.key} className="px-2 py-1 whitespace-nowrap" style={{ textAlign: c.align }}>{ci === 0 && !s ? 'Subtotal' : s ? `Σ ${fmt(s.sum, 'number')}` : ''}</td>; })}
              </tr>
            )}
          </React.Fragment>
        ))}
        <tr className="bg-brand-100 font-extrabold text-brand-900 border-t-2 border-brand-300">
          {cols.map((c: any, ci: number) => { const s = grand[c.key]; return <td key={c.key} className="px-2 py-1.5 whitespace-nowrap" style={{ textAlign: c.align }}>{ci === 0 && !s ? `Grand total · ${preview.grandTotals?.count || 0}` : s ? `Σ ${fmt(s.sum, 'number')}` : ''}</td>; })}
        </tr>
      </tbody>
    </table>
  );
};

// ── Column properties (incl. conditional formatting rules) ────────────────────
const ColumnPanel: React.FC<any> = ({ activeKey, meta, calc, col, type, onCol, onMove, canSummary, summaryOn, onToggleSummary, grouped, onToggleGroup, onRemove }) => {
  const rules: FormatRule[] = col.rules || [];
  const setRule = (i: number, patch: Partial<FormatRule>) => onCol({ rules: rules.map((r, ri) => ri === i ? { ...r, ...patch } : r) });
  const addRule = () => onCol({ rules: [...rules, { op: type === 'number' ? 'gt' : 'contains', value: '', color: '#b91c1c', bg: '' }] });
  const delRule = (i: number) => onCol({ rules: rules.filter((_, ri) => ri !== i) });
  const ops = type === 'number' ? [['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['eq', '='], ['ne', '≠'], ['between', 'between']] : [['contains', 'contains'], ['eq', 'is'], ['ne', 'is not'], ['empty', 'is empty']];
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">Selected column</div>
      <div className="font-bold text-slate-800 flex items-center gap-1">{calc && <Calculator size={13} className="text-violet-600" />}{meta?.label || calc?.label}</div>
      <label className="block text-xs font-semibold text-slate-600">Header
        <input value={col.header ?? (meta?.label || calc?.label || '')} onChange={e => onCol({ header: e.target.value })} className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2 text-sm" /></label>
      <label className="block text-xs font-semibold text-slate-600">Alignment
        <select value={col.align || (type === 'number' ? 'right' : 'left')} onChange={e => onCol({ align: e.target.value })} className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2 text-sm bg-white">
          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      {meta && (
        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => onMove(-1)} className="flex-1 h-8 rounded-md border border-slate-200 text-xs hover:bg-slate-50 flex items-center justify-center gap-1"><ArrowUp size={13} />Move left</button>
          <button onClick={() => onMove(1)} className="flex-1 h-8 rounded-md border border-slate-200 text-xs hover:bg-slate-50 flex items-center justify-center gap-1"><ArrowDown size={13} />Move right</button>
        </div>
      )}
      {canSummary && <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 pt-1"><input type="checkbox" checked={summaryOn} onChange={onToggleSummary} />Show column total (Σ)</label>}
      {meta && <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={grouped} onChange={onToggleGroup} />Group rows by this column</label>}

      {/* conditional formatting */}
      <div className="pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between mb-1"><span className="text-xs font-bold text-slate-600 flex items-center gap-1"><Palette size={12} />Colour rules</span>
          <button onClick={addRule} className="text-xs font-semibold text-brand-600 flex items-center gap-1"><Plus size={12} />Add</button></div>
        {!rules.length && <div className="text-[11px] text-slate-400">Highlight cells that match a condition (e.g. Net Salary &gt; 50000 → green).</div>}
        {rules.map((r, i) => (
          <div key={i} className="rounded-md border border-slate-200 p-1.5 mt-1.5 space-y-1 bg-slate-50/50">
            <div className="flex items-center gap-1">
              <select value={r.op} onChange={e => setRule(i, { op: e.target.value })} className="h-7 rounded border border-slate-200 px-1 text-[11px] bg-white flex-1">
                {ops.map(([o, l]) => <option key={o} value={o}>{l}</option>)}
              </select>
              {!['empty'].includes(r.op) && <input value={r.value ?? ''} onChange={e => setRule(i, { value: e.target.value })} placeholder="value" className="h-7 w-16 rounded border border-slate-200 px-1 text-[11px]" />}
              {r.op === 'between' && <input value={r.value2 ?? ''} onChange={e => setRule(i, { value2: e.target.value })} placeholder="to" className="h-7 w-14 rounded border border-slate-200 px-1 text-[11px]" />}
              <button onClick={() => delRule(i)} className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-500"><X size={11} /></button>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <label className="flex items-center gap-1">Text<input type="color" value={r.color || '#000000'} onChange={e => setRule(i, { color: e.target.value })} className="h-6 w-7 rounded border border-slate-200" /></label>
              <label className="flex items-center gap-1">Fill<input type="color" value={r.bg || '#ffffff'} onChange={e => setRule(i, { bg: e.target.value })} className="h-6 w-7 rounded border border-slate-200" /></label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!r.bold} onChange={e => setRule(i, { bold: e.target.checked })} />Bold</label>
            </div>
          </div>
        ))}
      </div>
      <button onClick={onRemove} className="w-full h-8 rounded-md border border-rose-200 text-rose-600 text-xs hover:bg-rose-50 flex items-center justify-center gap-1"><Trash2 size={13} />Remove column</button>
    </div>
  );
};

// ── Nested AND/OR filter builder ──────────────────────────────────────────────
const FiltersPanel: React.FC<{ node: FilterNode; source: SourceMeta | null; operators: Record<string, OperatorMeta[]>; chosen: string[]; onChange: (n: FilterNode) => void }> = ({ node, source, operators, chosen, onChange }) => {
  return (
    <div>
      <div className="text-xs text-slate-400 mb-2">Build conditions — combine with AND/OR, and nest groups for complex logic.</div>
      <FilterNodeEditor node={node} source={source} operators={operators} chosen={chosen} onChange={onChange} depth={0} />
    </div>
  );
};
const FilterNodeEditor: React.FC<{ node: FilterNode; source: SourceMeta | null; operators: Record<string, OperatorMeta[]>; chosen: string[]; onChange: (n: FilterNode) => void; onRemove?: () => void; depth: number }> = ({ node, source, operators, chosen, onChange, onRemove, depth }) => {
  const fields = source?.fields || [];
  const opsFor = (key: string) => { const f = fields.find(x => x.key === key); return f ? operators[f.type] || [] : []; };
  const typeOf = (key: string) => fields.find(x => x.key === key)?.type;
  const first = chosen[0] || fields[0]?.key;
  const setItem = (i: number, item: any) => onChange({ ...node, conditions: node.conditions.map((c, ci) => ci === i ? item : c) });
  const delItem = (i: number) => onChange({ ...node, conditions: node.conditions.filter((_, ci) => ci !== i) });
  const addCond = () => { if (!first) return; onChange({ ...node, conditions: [...node.conditions, { field: first, op: opsFor(first)[0]?.op || 'equals', value: '' }] }); };
  const addGroup = () => onChange({ ...node, conditions: [...node.conditions, { logic: 'AND', conditions: [] }] });
  const needsValue = (op: string) => !['isEmpty', 'notEmpty', 'isTrue', 'isFalse'].includes(op);
  const needsTwo = (op: string) => op === 'between';
  return (
    <div className={`rounded-lg ${depth ? 'border border-slate-200 p-2 bg-slate-50/40' : ''} space-y-2`}>
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px] font-bold">
          {(['AND', 'OR'] as const).map(l => <button key={l} onClick={() => onChange({ ...node, logic: l })} className={`px-2.5 py-1 ${node.logic === l ? 'bg-brand-600 text-white' : 'text-slate-500'}`}>{l}</button>)}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addCond} className="text-xs font-semibold text-brand-600 flex items-center gap-1"><Plus size={13} />Filter</button>
          {depth < 2 && <button onClick={addGroup} className="text-xs font-semibold text-indigo-600 flex items-center gap-1"><Layers size={12} />Group</button>}
          {onRemove && <button onClick={onRemove} className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-500"><X size={12} /></button>}
        </div>
      </div>
      {!node.conditions.length && <div className="text-xs text-slate-400 py-1">No conditions — shows every record in your company.</div>}
      {node.conditions.map((c, i) => isNode(c) ? (
        <FilterNodeEditor key={i} node={c} source={source} operators={operators} chosen={chosen} depth={depth + 1} onChange={n => setItem(i, n)} onRemove={() => delItem(i)} />
      ) : (
        <div key={i} className="rounded-lg border border-slate-200 p-2 space-y-1.5 bg-white">
          <div className="flex items-center gap-1">
            <select value={c.field} onChange={e => { const nf = e.target.value; setItem(i, { field: nf, op: opsFor(nf)[0]?.op || 'equals', value: '' }); }} className="flex-1 h-7 rounded border border-slate-200 px-1 text-xs bg-white">
              {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <button onClick={() => delItem(i)} className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-500"><X size={12} /></button>
          </div>
          <select value={c.op} onChange={e => setItem(i, { ...c, op: e.target.value })} className="w-full h-7 rounded border border-slate-200 px-1 text-xs bg-white">
            {opsFor(c.field).map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
          </select>
          {needsValue(c.op) && (
            <div className="flex items-center gap-1">
              <input type={typeOf(c.field) === 'number' ? 'number' : typeOf(c.field) === 'date' ? 'date' : 'text'} value={c.value ?? ''} onChange={e => setItem(i, { ...c, value: e.target.value })} placeholder="value" className="flex-1 h-7 rounded border border-slate-200 px-1.5 text-xs" />
              {needsTwo(c.op) && <input type={typeOf(c.field) === 'number' ? 'number' : typeOf(c.field) === 'date' ? 'date' : 'text'} value={c.value2 ?? ''} onChange={e => setItem(i, { ...c, value2: e.target.value })} placeholder="and" className="flex-1 h-7 rounded border border-slate-200 px-1.5 text-xs" />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Sort ──────────────────────────────────────────────────────────────────────
const SortPanel: React.FC<{ config: ReportConfig; source: SourceMeta | null; onChange: (s: SortRule[]) => void }> = ({ config, source, onChange }) => {
  const fields = source?.fields || [];
  const add = () => { const first = config.fields[0] || fields[0]?.key; if (!first) return; onChange([...config.sorts, { field: first, dir: 'asc' }]); };
  const set = (i: number, patch: Partial<SortRule>) => onChange(config.sorts.map((s, si) => si === i ? { ...s, ...patch } : s));
  const del = (i: number) => onChange(config.sorts.filter((_, si) => si !== i));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><span className="text-xs text-slate-400">Multi-column sort (top = primary)</span>
        <button onClick={add} className="text-xs font-semibold text-brand-600 flex items-center gap-1"><Plus size={13} />Add sort</button></div>
      {!config.sorts.length && <div className="text-xs text-slate-400 py-2">Default order.</div>}
      {config.sorts.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <select value={s.field} onChange={e => set(i, { field: e.target.value })} className="flex-1 h-7 rounded border border-slate-200 px-1 text-xs bg-white">
            {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <select value={s.dir} onChange={e => set(i, { dir: e.target.value as any })} className="h-7 rounded border border-slate-200 px-1 text-xs bg-white"><option value="asc">↑ Asc</option><option value="desc">↓ Desc</option></select>
          <button onClick={() => del(i)} className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-500"><X size={12} /></button>
        </div>
      ))}
    </div>
  );
};

// ── Group ─────────────────────────────────────────────────────────────────────
const GroupPanel: React.FC<{ config: ReportConfig; labelOf: (k: string) => string; onToggle: (k: string) => void }> = ({ config, labelOf, onToggle }) => (
  <div className="space-y-2">
    <div className="text-xs text-slate-400">Group rows by one or more columns. Each group shows its own subtotals, and a grand total is added at the bottom.</div>
    {!config.fields.length && <div className="text-xs text-slate-400 py-2">Add columns first.</div>}
    {config.fields.map(k => (
      <label key={k} className="flex items-center gap-2 text-xs font-semibold text-slate-700 py-1">
        <input type="checkbox" checked={config.group.includes(k)} onChange={() => onToggle(k)} />{labelOf(k)}
        {config.group.includes(k) && <span className="text-[10px] text-indigo-500">grouped #{config.group.indexOf(k) + 1}</span>}
      </label>
    ))}
    {!!config.group.length && <div className="text-[11px] text-slate-400 pt-1">Tip: enable “Show column total (Σ)” on numeric columns to control which totals appear per group.</div>}
  </div>
);

// ── Calculated columns ────────────────────────────────────────────────────────
const CalcPanel: React.FC<{ config: ReportConfig; source: SourceMeta | null; activeKey: string | null; onChange: (calcs: CalcCol[], active?: string) => void }> = ({ config, source, activeKey, onChange }) => {
  const numFields = (source?.fields || []).filter(f => f.type === 'number');
  const editing = config.calculated.find(c => c.key === activeKey) || null;
  const [draftLabel, setDraftLabel] = useState(''); const [draftExpr, setDraftExpr] = useState('');
  useEffect(() => { if (editing) { setDraftLabel(editing.label); setDraftExpr(editing.expr); } }, [editing?.key]); // eslint-disable-line
  const insert = (k: string) => setDraftExpr(e => `${e}{${k}}`);
  const commit = () => {
    if (!draftLabel.trim() || !draftExpr.trim()) { ui.toast.warning('Give the column a name and a formula.'); return; }
    if (editing) onChange(config.calculated.map(c => c.key === editing.key ? { ...c, label: draftLabel.trim(), expr: draftExpr.trim() } : c), editing.key);
    else { const key = `calc.${Date.now().toString(36)}`; onChange([...config.calculated, { key, label: draftLabel.trim(), expr: draftExpr.trim() }], key); }
    if (!editing) { setDraftLabel(''); setDraftExpr(''); }
    ui.toast.success('Calculated column applied.');
  };
  const newOne = () => { setDraftLabel(''); setDraftExpr(''); onChange(config.calculated, undefined); };
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">Build a column from a formula over numeric fields — e.g. <code className="bg-slate-100 px-1 rounded">{'{Basic} + {Allowances} - {Deductions}'}</code>. Operators + − × ÷ ( ) and abs/round/min/max are supported.</div>
      {config.calculated.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {config.calculated.map(c => (
            <button key={c.key} onClick={() => onChange(config.calculated, c.key)} className={`text-[11px] rounded-md px-2 py-1 border ${activeKey === c.key ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{c.label}</button>
          ))}
          <button onClick={newOne} className="text-[11px] rounded-md px-2 py-1 border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center gap-1"><Plus size={11} />New</button>
        </div>
      )}
      <label className="block text-xs font-semibold text-slate-600">Column name
        <input value={draftLabel} onChange={e => setDraftLabel(e.target.value)} placeholder="e.g. Gross Pay" className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2 text-sm" /></label>
      <label className="block text-xs font-semibold text-slate-600">Formula
        <textarea value={draftExpr} onChange={e => setDraftExpr(e.target.value)} rows={2} placeholder="{pay.basicSalary} + {pay.allowances}" className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono" /></label>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Insert a field</div>
        <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
          {numFields.map(f => <button key={f.key} onClick={() => insert(f.key)} className="text-[11px] rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-brand-50 hover:border-brand-300">{f.label}</button>)}
          {!numFields.length && <span className="text-[11px] text-slate-400">No numeric fields in this source.</span>}
        </div>
      </div>
      <Button size="sm" onClick={commit} className="w-full"><Calculator size={14} className="mr-1" />{editing ? 'Update column' : 'Add calculated column'}</Button>
    </div>
  );
};

// ── Chart configuration ───────────────────────────────────────────────────────
const ChartConfigPanel: React.FC<{ config: ReportConfig; labelOf: (k: string) => string; onChange: (c: ChartCfg) => void }> = ({ config, labelOf, onChange }) => {
  const chart = config.chart || { type: 'none', agg: 'sum' };
  const catFields = config.fields;                                   // any chosen field can be a category
  const valFields = [...config.fields, ...config.calculated.map(c => c.key)];
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">Visualise your report. The chart aggregates the whole matching set (not just the current page).</div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Chart type</div>
        <div className="grid grid-cols-4 gap-1">
          {([['none', X, 'None'], ['bar', BarChart3, 'Bar'], ['pie', PieChart, 'Pie'], ['line', LineChart, 'Line']] as const).map(([t, Icon, l]) => (
            <button key={t} onClick={() => onChange({ ...chart, type: t as any })} className={`h-12 rounded-md border flex flex-col items-center justify-center gap-0.5 text-[10px] ${chart.type === t ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><Icon size={14} />{l}</button>
          ))}
        </div>
      </div>
      {chart.type !== 'none' && (
        <>
          <label className="block text-xs font-semibold text-slate-600">Category (X)
            <select value={chart.categoryField || ''} onChange={e => onChange({ ...chart, categoryField: e.target.value })} className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2 text-sm bg-white">
              <option value="">Select a column…</option>{catFields.map(k => <option key={k} value={k}>{labelOf(k)}</option>)}</select></label>
          <label className="block text-xs font-semibold text-slate-600">Value (Y)
            <select value={chart.valueField || ''} onChange={e => onChange({ ...chart, valueField: e.target.value })} className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2 text-sm bg-white">
              <option value="">Record count</option>{valFields.map(k => <option key={k} value={k}>{labelOf(k)}</option>)}</select></label>
          {chart.valueField && (
            <label className="block text-xs font-semibold text-slate-600">Aggregate
              <select value={chart.agg} onChange={e => onChange({ ...chart, agg: e.target.value as any })} className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2 text-sm bg-white">
                <option value="sum">Sum</option><option value="avg">Average</option><option value="count">Count</option></select></label>
          )}
          <div className="text-[11px] text-slate-400">The chart appears above the preview table.</div>
        </>
      )}
    </div>
  );
};

// ── Chart renderer (self-contained SVG; no external chart library) ────────────
const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'];
const ChartPanel: React.FC<{ config: ReportConfig; activeCompanyId: string; labelOf: (k: string) => string }> = ({ config, activeCompanyId, labelOf }) => {
  const chart = config.chart!;
  const [data, setData] = useState<{ label: string; value: number }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const key = JSON.stringify({ c: chart, s: config.source, f: config.filters, cc: config.calculated });
  useEffect(() => {
    let alive = true;
    (async () => {
      setErr(null);
      if (!chart.categoryField) { setData([]); return; }
      try {
        const derived = { source: config.source, fields: [chart.categoryField], group: [chart.categoryField], calculated: config.calculated, filters: config.filters, summary: chart.valueField ? { [chart.valueField]: ['sum'] } : {}, limit: 5000 };
        const res = await api.customReports.run({ companyId: activeCompanyId, config: derived });
        if (!alive) return;
        if (res?.error) { setErr(res.error); setData([]); return; }
        const groups = res.groups || [];
        const rows = groups.map((g: any) => {
          let value = g.count;
          if (chart.valueField) { const s = g.subtotals?.[chart.valueField]; value = s ? (chart.agg === 'avg' ? s.avg : chart.agg === 'count' ? g.count : s.sum) : 0; }
          return { label: g.label, value: Number(value) || 0 };
        }).sort((a: any, b: any) => b.value - a.value).slice(0, 10);
        setData(rows);
      } catch (e: any) { if (alive) { setErr(e?.message || 'chart error'); setData([]); } }
    })();
    return () => { alive = false; };
  }, [key, activeCompanyId]); // eslint-disable-line
  if (err) return <div className="text-xs text-amber-600">Chart: {err}</div>;
  if (!data) return <div className="text-xs text-slate-400">Loading chart…</div>;
  if (!data.length) return <div className="text-xs text-slate-400">No data to chart.</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  if (chart.type === 'bar') {
    return (
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-28 truncate text-slate-600" title={d.label}>{d.label}</span>
            <div className="flex-1 bg-slate-100 rounded h-4 overflow-hidden"><div style={{ width: `${(d.value / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} className="h-full rounded" /></div>
            <span className="w-16 text-right tabular-nums text-slate-700">{fmt(d.value, 'number')}</span>
          </div>
        ))}
      </div>
    );
  }
  if (chart.type === 'line') {
    const W = 480, H = 120, pad = 6;
    const step = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
    const pts = data.map((d, i) => `${pad + i * step},${H - pad - (d.value / max) * (H - pad * 2)}`).join(' ');
    return (
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H + 26}`} className="w-full max-w-full" style={{ minWidth: 320 }}>
          <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth={2} />
          {data.map((d, i) => <circle key={i} cx={pad + i * step} cy={H - pad - (d.value / max) * (H - pad * 2)} r={2.5} fill="#6366f1" />)}
          {data.map((d, i) => <text key={i} x={pad + i * step} y={H + 12} fontSize={8} textAnchor="middle" fill="#64748b">{d.label.slice(0, 8)}</text>)}
        </svg>
      </div>
    );
  }
  // pie
  const R = 54, C = 60; let acc = 0;
  const arcs = data.map((d, i) => {
    const frac = d.value / total; const a0 = acc * 2 * Math.PI; acc += frac; const a1 = acc * 2 * Math.PI;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = C + R * Math.sin(a0), y0 = C - R * Math.cos(a0), x1 = C + R * Math.sin(a1), y1 = C - R * Math.cos(a1);
    return <path key={i} d={`M${C},${C} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`} fill={PALETTE[i % PALETTE.length]} />;
  });
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 120 120" className="w-28 h-28 shrink-0">{arcs}</svg>
      <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1 truncate"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="truncate text-slate-600" title={d.label}>{d.label}</span><span className="ml-auto tabular-nums text-slate-500">{Math.round((d.value / total) * 100)}%</span></div>
        ))}
      </div>
    </div>
  );
};

// ── Schedule modal ────────────────────────────────────────────────────────────
const ScheduleModal: React.FC<{ reportId: string; initial: Schedule | null; defaultEmail?: string; onClose: () => void; onSaved: (s: Schedule | null) => void }> = ({ reportId, initial, defaultEmail, onClose, onSaved }) => {
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [freq, setFreq] = useState<Schedule['freq']>(initial?.freq || 'monthly');
  const [time, setTime] = useState(initial?.time || '09:00');
  const [weekday, setWeekday] = useState(initial?.weekday ?? 1);
  const [day, setDay] = useState(initial?.day ?? 1);
  const [format, setFormat] = useState<Schedule['format']>(initial?.format || 'excel');
  const [recipients, setRecipients] = useState((initial?.recipients || (defaultEmail ? [defaultEmail] : [])).join(', '));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const list = recipients.split(/[,\n;]/).map(s => s.trim()).filter(s => s.includes('@'));
    if (enabled && !list.length) { ui.toast.warning('Add at least one recipient email.'); return; }
    setBusy(true);
    try {
      const schedule = enabled ? { enabled: true, freq, time, weekday, day, recipients: list, format } as Schedule : null;
      const r = await api.customReports.setSchedule(reportId, schedule);
      ui.toast.success(enabled ? 'Schedule saved — reports will be emailed automatically.' : 'Schedule turned off.');
      onSaved(r.schedule || null);
    } catch (e: any) { ui.toast.error(e?.message || 'Could not save schedule'); } finally { setBusy(false); }
  };
  const sendTest = async () => {
    const list = recipients.split(/[,\n;]/).map(s => s.trim()).filter(s => s.includes('@'));
    if (!list.length) { ui.toast.warning('Add a recipient first.'); return; }
    try { const out = await api.customReports.sendNow(reportId, { recipients: list, format }); ui.toast.success(out.devMode ? `Prepared (dev mode — SMTP off): ${out.rows} rows` : `Test emailed ${out.rows} row(s).`); }
    catch (e: any) { ui.toast.error(e?.message || 'Send failed'); }
  };
  return (
    <Modal open onClose={onClose} title="Schedule & email report" size="md">
      <div className="space-y-3 text-sm">
        <label className="flex items-center gap-2 font-semibold text-slate-700"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Email this report automatically</label>
        {enabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-600">Frequency
                <select value={freq} onChange={e => setFreq(e.target.value as any)} className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2 bg-white text-sm"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
              <label className="block text-xs font-semibold text-slate-600">Time
                <input type="time" value={time} onChange={e => setTime(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2 text-sm" /></label>
            </div>
            {freq === 'weekly' && (
              <label className="block text-xs font-semibold text-slate-600">Day of week
                <select value={weekday} onChange={e => setWeekday(Number(e.target.value))} className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2 bg-white text-sm">{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={i} value={i}>{d}</option>)}</select></label>
            )}
            {freq === 'monthly' && (
              <label className="block text-xs font-semibold text-slate-600">Day of month (1–28)
                <input type="number" min={1} max={28} value={day} onChange={e => setDay(Number(e.target.value))} className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2 text-sm" /></label>
            )}
            <label className="block text-xs font-semibold text-slate-600">Recipients (comma-separated)
              <textarea value={recipients} onChange={e => setRecipients(e.target.value)} rows={2} placeholder="hr@company.com, finance@company.com" className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-sm" /></label>
            <label className="block text-xs font-semibold text-slate-600">Attachment format
              <select value={format} onChange={e => setFormat(e.target.value as any)} className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2 bg-white text-sm"><option value="excel">Excel</option><option value="csv">CSV</option></select></label>
            {initial?.lastResult && <div className="text-[11px] text-slate-400 flex items-center gap-1"><Clock size={11} />Last run: {initial.lastResult}{initial.lastRunAt ? ` · ${new Date(initial.lastRunAt).toLocaleString('en-IN')}` : ''}</div>}
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 mt-4">
        <Button variant="secondary" size="sm" onClick={sendTest}><Mail size={14} className="mr-1" />Send test now</Button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save schedule'}</Button>
        </div>
      </div>
    </Modal>
  );
};

// ── Version history modal ─────────────────────────────────────────────────────
const VersionsModal: React.FC<{ reportId: string; onClose: () => void; onRestored: (cfg: any) => void }> = ({ reportId, onClose, onRestored }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { (async () => { try { setRows(await api.customReports.versions(reportId)); } catch { setRows([]); } })(); }, [reportId]);
  const restore = async (v: any) => {
    if (!(await ui.confirm({ title: 'Restore version', message: `Restore this report to the version saved ${new Date(v.createdAt).toLocaleString('en-IN')}? The current version is kept in history.`, confirmText: 'Restore' }))) return;
    try { const r = await api.customReports.restoreVersion(reportId, v.id); onRestored(r.config); } catch (e: any) { ui.toast.error(e?.message || 'Restore failed'); }
  };
  return (
    <Modal open onClose={onClose} title="Version history" size="md">
      <div className="text-xs text-slate-400 mb-2">Every save keeps a snapshot (last 20). Restore any point — the current design is snapshotted first, so nothing is lost.</div>
      {!rows ? <div className="text-sm text-slate-400 py-6 text-center">Loading…</div>
        : !rows.length ? <div className="text-sm text-slate-400 py-8 text-center">No history yet — versions appear here after you edit and re-save this report.</div>
          : <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {rows.map(v => (
              <div key={v.id} className="flex items-center justify-between py-2 gap-3">
                <div className="min-w-0"><div className="text-sm font-semibold text-slate-700 truncate">{v.name || 'Untitled'}</div>
                  <div className="text-[11px] text-slate-400">{new Date(v.createdAt).toLocaleString('en-IN')}{v.savedByName ? ` · ${v.savedByName}` : ''}</div></div>
                <button onClick={() => restore(v)} className="text-xs font-semibold text-brand-600 flex items-center gap-1 shrink-0 hover:text-brand-700"><RotateCcw size={13} />Restore</button>
              </div>
            ))}
          </div>}
    </Modal>
  );
};

// ── helpers ───────────────────────────────────────────────────────────────────
function omit<T extends Record<string, any>>(obj: T, key: string): T { const o = { ...obj }; delete o[key]; return o; }
function escapeHtml(s: any) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }

export default CustomReportBuilder;
