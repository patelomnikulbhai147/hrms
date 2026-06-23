// ─────────────────────────────────────────────────────────────────────────────
// BusinessReportView — modern, enterprise-grade renderer for INTERNAL business
// reports (non-statutory). Presentation only: it consumes the exact data the
// reports API already returns ({ meta, columns, rows, summary }) and never alters
// values, totals, calculations, exports, or the API. Statutory reports do NOT use
// this view (see reportClassification.isStatutoryReport).
//
// Features: company/branch executive header, KPI summary cards, in-report search,
// click-to-sort columns, group-by with subtotals + a lightweight bar chart,
// column show/hide, and a polished sticky table with a grand-total row.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState, useRef, useCallback } from 'react';
import { Search, ArrowUp, ArrowDown, ChevronsUpDown, Layers, Columns3, X, BarChart3, Building2 } from 'lucide-react';
import { inr } from './reportExport';
import { useDismissable } from '@/hooks/useDismissable';

interface Col { key: string; label: string; }
interface ReportShape {
  meta?: any; columns: Col[]; rows: any[]; summary?: any;
  reportName?: string; category?: string; generatedAt?: string; generatedBy?: string;
}
interface Props { report: ReportShape; }

const MONEY_RE = /salary|pay|amount|gross|net|basic|deduct|bonus|ctc|wage|allowance|earning|gratuity|advance|loan|esi|\bpf\b|tax|₹/i;
const ID_RE = /^(sr|code|empid|employeeid|id)$/i;
const DIM_EXCLUDE = /name|code|email|phone|account|ifsc|uan|pan|aadhaar|number|date|holder|^sr$/i;

const toNum = (v: any): number | null => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[,₹\s]/g, ''));
  return isNaN(n) ? null : n;
};
const fmtMoney = (n: number) => `₹${inr(n)}`;
const fmtNum = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const BusinessReportView: React.FC<Props> = ({ report }) => {
  const cols = report.columns || [];
  const rows = report.rows || [];
  const m = report.meta || {};

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [groupKey, setGroupKey] = useState<string>('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showCols, setShowCols] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);
  useDismissable(showCols, useCallback(() => setShowCols(false), []), colsRef);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // ── Column analysis: which columns are numeric / money / groupable dimensions ──
  const a = useMemo(() => {
    const isNumeric: Record<string, boolean> = {};
    const isMoney: Record<string, boolean> = {};
    for (const c of cols) {
      if (ID_RE.test(c.key)) { isNumeric[c.key] = false; continue; }
      let total = 0, numbers = 0;
      for (const r of rows) { const v = r[c.key]; if (v == null || v === '') continue; total++; if (toNum(v) != null) numbers++; }
      isNumeric[c.key] = total > 0 && numbers / total >= 0.7;
      isMoney[c.key] = isNumeric[c.key] && MONEY_RE.test(c.label);
    }
    const numericCols = cols.filter(c => isNumeric[c.key]);
    const dimCols = cols.filter(c => !isNumeric[c.key] && !DIM_EXCLUDE.test(c.key) && !DIM_EXCLUDE.test(c.label));
    const groupable = dimCols.filter(c => { const s = new Set(rows.map(r => String(r[c.key] ?? ''))); return s.size >= 1 && s.size <= 60; });
    // KPI columns: prefer money columns, then any numeric — up to 4.
    const kpiCols = [...numericCols].sort((x, y) => (isMoney[y.key] ? 1 : 0) - (isMoney[x.key] ? 1 : 0)).slice(0, 4);
    return { isNumeric, isMoney, numericCols, groupable, kpiCols };
  }, [report]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleCols = cols.filter(c => !hidden.has(c.key));

  // ── Search → sort ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => cols.some(c => String(r[c.key] ?? '').toLowerCase().includes(q)));
  }, [rows, search, cols]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    const numeric = a.isNumeric[sortKey];
    return [...filtered].sort((x, y) => {
      if (numeric) return (((toNum(x[sortKey]) ?? -Infinity) - (toNum(y[sortKey]) ?? -Infinity)) * dir);
      return String(x[sortKey] ?? '').localeCompare(String(y[sortKey] ?? '')) * dir;
    });
  }, [filtered, sortKey, sortDir, a]);

  const sumOf = (data: any[], key: string) => data.reduce((t, r) => t + (toNum(r[key]) ?? 0), 0);
  const cell = (r: any, c: Col) => {
    const v = r[c.key];
    if (a.isNumeric[c.key] && toNum(v) != null) return a.isMoney[c.key] ? fmtMoney(toNum(v)!) : fmtNum(toNum(v)!);
    return String(v ?? '');
  };

  // ── Grouping ──
  const groups = useMemo(() => {
    if (!groupKey) return null;
    const map = new Map<string, any[]>();
    for (const r of sorted) { const k = String(r[groupKey] ?? '—') || '—'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(r); }
    return [...map.entries()].sort((x, y) => y[1].length - x[1].length);
  }, [sorted, groupKey]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  const toggleHidden = (key: string) => setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleCollapse = (k: string) => setCollapsed(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // Chart data — group totals on the primary KPI (money) column.
  const chartCol = a.kpiCols[0];
  const chartData = useMemo(() => {
    if (!groups || !chartCol) return [];
    const data = groups.map(([k, rs]) => ({ label: k, value: sumOf(rs, chartCol.key) }));
    const max = Math.max(1, ...data.map(d => Math.abs(d.value)));
    return data.map(d => ({ ...d, pct: Math.round((Math.abs(d.value) / max) * 100) })).slice(0, 12);
  }, [groups, chartCol]);

  const RENDER_CAP = 500;
  const grandCount = sorted.length;

  const kpiCards = [
    { label: 'Total Records', value: grandCount.toLocaleString('en-IN'), accent: 'bg-indigo-500' },
    ...a.kpiCols.map((c, i) => ({
      label: `Total ${c.label}`.replace(/\s*\(₹\)/, ''),
      value: a.isMoney[c.key] ? fmtMoney(sumOf(sorted, c.key)) : fmtNum(sumOf(sorted, c.key)),
      accent: ['bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500'][i % 4],
    })),
  ];
  // Extra KPIs from the report's own summary object (already-aggregated values).
  const summaryEntries = report.summary && typeof report.summary === 'object'
    ? Object.entries(report.summary).filter(([, v]) => typeof v === 'number' || typeof v === 'string').slice(0, 4) : [];

  const SortIcon = ({ k }: { k: string }) => sortKey !== k
    ? <ChevronsUpDown size={11} className="text-slate-300 group-hover:text-slate-400" />
    : sortDir === 'asc' ? <ArrowUp size={11} className="text-indigo-600" /> : <ArrowDown size={11} className="text-indigo-600" />;

  const headerCell = (c: Col) => (
    <th key={c.key} onClick={() => toggleSort(c.key)}
      className={`group sticky top-0 z-10 bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap ${a.isNumeric[c.key] ? 'text-right' : 'text-left'}`}>
      <span className={`inline-flex items-center gap-1 ${a.isNumeric[c.key] ? 'flex-row-reverse' : ''}`}>{c.label}<SortIcon k={c.key} /></span>
    </th>
  );
  const bodyRow = (r: any, i: number) => (
    <tr key={i} className="even:bg-slate-50/60 hover:bg-indigo-50/50 transition-colors">
      {visibleCols.map(c => (
        <td key={c.key} className={`px-3 py-1.5 text-[11.5px] text-slate-700 whitespace-nowrap ${a.isNumeric[c.key] ? 'text-right tabular-nums font-medium' : 'text-left'}`}>{cell(r, c)}</td>
      ))}
    </tr>
  );
  const subtotalRow = (rs: any[], label: string) => (
    <tr className="bg-indigo-50/70 border-t border-indigo-100 font-semibold">
      {visibleCols.map((c, idx) => (
        <td key={c.key} className={`px-3 py-1.5 text-[11px] text-indigo-800 whitespace-nowrap ${a.isNumeric[c.key] ? 'text-right tabular-nums' : 'text-left'}`}>
          {idx === 0 ? label : a.isNumeric[c.key] ? (a.isMoney[c.key] ? fmtMoney(sumOf(rs, c.key)) : fmtNum(sumOf(rs, c.key))) : ''}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="mt-3 space-y-3">
      {/* Executive header */}
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm"><Building2 size={17} /></span>
            <div className="leading-tight">
              <div className="text-sm font-extrabold text-slate-800">{m.name || 'Company'}</div>
              {m.branchName && <div className="text-[12px] font-bold text-slate-600">{m.branchName}</div>}
              <div className="text-[11px] text-slate-500">{report.reportName}{report.category ? ` · ${report.category}` : ''}</div>
            </div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5"><BarChart3 size={10} /> Business Report</span>
            <div className="text-[10px] text-slate-400 mt-1">{report.generatedAt ? `Generated ${new Date(report.generatedAt).toLocaleString('en-IN')}` : ''}{report.generatedBy ? ` · ${report.generatedBy}` : ''}</div>
          </div>
        </div>
      </div>

      {/* KPI summary cards */}
      {(kpiCards.length > 0 || summaryEntries.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {kpiCards.map((k, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex items-center gap-2.5">
              <span className={`w-1.5 h-9 rounded-full ${k.accent}`} />
              <div className="min-w-0">
                <p className="text-base font-bold text-slate-800 leading-none truncate">{k.value}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-1 truncate">{k.label}</p>
              </div>
            </div>
          ))}
          {summaryEntries.map(([key, val]) => (
            <div key={`s-${key}`} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex items-center gap-2.5">
              <span className="w-1.5 h-9 rounded-full bg-slate-400" />
              <div className="min-w-0">
                <p className="text-base font-bold text-slate-800 leading-none truncate">{typeof val === 'number' ? fmtNum(val) : String(val)}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-1 truncate capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar: search · group-by · columns */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search within this report…"
            className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>}
        </div>
        {a.groupable.length > 0 && (
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
            <Layers size={14} className="text-slate-400" />
            <select value={groupKey} onChange={e => { setGroupKey(e.target.value); setCollapsed(new Set()); }} className="text-[12px] text-slate-700 bg-transparent focus:outline-none">
              <option value="">No grouping</option>
              {a.groupable.map(c => <option key={c.key} value={c.key}>Group by {c.label}</option>)}
            </select>
          </div>
        )}
        <div className="relative" ref={colsRef}>
          <button onClick={() => setShowCols(s => !s)} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">
            <Columns3 size={14} /> Columns
          </button>
          {showCols && (
            <div className="absolute right-0 mt-1 z-20 w-52 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg p-1.5">
              {cols.map(c => (
                <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer text-[12px] text-slate-700">
                  <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleHidden(c.key)} className="accent-indigo-600" />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Group analytics chart */}
      {groups && chartCol && chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
          <p className="text-[11px] font-bold text-slate-600 mb-2 flex items-center gap-1.5"><BarChart3 size={13} className="text-indigo-500" /> {chartCol.label} by {a.groupable.find(c => c.key === groupKey)?.label || groupKey}</p>
          <div className="space-y-1.5">
            {chartData.map(d => (
              <div key={d.label} className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 w-28 truncate text-right shrink-0" title={d.label}>{d.label}</span>
                <div className="flex-1 bg-slate-100 rounded h-4 overflow-hidden"><div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded" style={{ width: `${d.pct}%` }} /></div>
                <span className="text-[10px] font-semibold text-slate-700 w-24 text-right shrink-0 tabular-nums">{a.isMoney[chartCol.key] ? fmtMoney(d.value) : fmtNum(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data table */}
      <div className="overflow-auto max-h-[460px] border border-slate-200 rounded-xl bg-white">
        <table className="w-full border-collapse">
          <thead><tr>{visibleCols.map(headerCell)}</tr></thead>
          <tbody>
            {!groups && sorted.slice(0, RENDER_CAP).map(bodyRow)}
            {groups && groups.map(([k, rs]) => {
              const isCollapsed = collapsed.has(k);
              return (
                <React.Fragment key={k}>
                  <tr className="bg-slate-100/80 cursor-pointer" onClick={() => toggleCollapse(k)}>
                    <td colSpan={visibleCols.length} className="px-3 py-1.5 text-[11px] font-bold text-slate-700">
                      <span className="inline-flex items-center gap-1.5">
                        <ChevronsUpDown size={11} className="text-slate-400" />
                        {a.groupable.find(c => c.key === groupKey)?.label || groupKey}: {k}
                        <span className="text-slate-400 font-semibold">({rs.length})</span>
                      </span>
                    </td>
                  </tr>
                  {!isCollapsed && rs.slice(0, RENDER_CAP).map(bodyRow)}
                  {subtotalRow(rs, `Subtotal · ${k}`)}
                </React.Fragment>
              );
            })}
            {/* Grand total */}
            {a.numericCols.length > 0 && (
              <tr className="bg-slate-800 text-white font-bold sticky bottom-0">
                {visibleCols.map((c, idx) => (
                  <td key={c.key} className={`px-3 py-2 text-[11px] whitespace-nowrap ${a.isNumeric[c.key] ? 'text-right tabular-nums' : 'text-left'}`}>
                    {idx === 0 ? `Grand Total (${grandCount})` : a.isNumeric[c.key] ? (a.isMoney[c.key] ? fmtMoney(sumOf(sorted, c.key)) : fmtNum(sumOf(sorted, c.key))) : ''}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!groups && sorted.length > RENDER_CAP && (
        <p className="text-[10px] text-slate-400">Showing first {RENDER_CAP} of {sorted.length} rows on screen · KPIs and totals cover all {grandCount} · full data in the export.</p>
      )}
    </div>
  );
};

export default BusinessReportView;
