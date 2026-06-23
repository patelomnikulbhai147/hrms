import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart3, FileText, Download, Eye, AlertTriangle, History, ChevronRight, ChevronDown, Search, X, Printer, LayoutGrid, Zap, Sparkles, Star, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { type Role, type Company } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { type UserAccount } from '@/pages/Login';
import { api } from '@/api/apiClient';
import { formatDate } from '@/utils/formatDate';
import { templateForKey, type TemplateDef } from '@/components/reports/templateRegistry';
import { ReportTemplateViewer } from '@/components/reports/ReportTemplateViewer';
import { isStatutoryReport } from '@/components/reports/reportClassification';
import { BusinessReportView } from '@/components/reports/BusinessReportView';
import { EditableReportCanvas } from '@/components/reports/EditableReportCanvas';
import { exportWageRules, getSettings as getWageSettings } from '@/utils/wageMaster';

interface Props { role: Role; activeCompanyId: string; companies?: Company[]; authProfile?: UserAccount | null; }

// The 10 master categories, in the order they should appear under Reports.
// Any category returned by the catalog that isn't listed here falls to the end.
const CATEGORY_ORDER = [
  'Payroll Reports', 'Attendance Reports', 'Leave Reports', 'Employee Reports', 'Document Reports',
  'Compliance Reports', 'Statutory Registers', 'PF Reports', 'ESI Reports', 'Tax Reports',
  'Gratuity & Settlement', 'Bonus Reports', 'Wage Reports',
];
const orderedCategories = (cats: string[]) => {
  const rank = (c: string) => { const i = CATEGORY_ORDER.indexOf(c); return i === -1 ? CATEGORY_ORDER.length : i; };
  return [...cats].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};

export const ComplianceReports: React.FC<Props> = ({ role, activeCompanyId, companies = [], authProfile }) => {
  const isSuperAdmin = role === 'Super Admin';
  const [catalog, setCatalog] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [companyId, setCompanyId] = useState<string>(isSuperAdmin ? '' : String(activeCompanyId || authProfile?.companyId || ''));
  // The top-right scope selector is the MASTER filter. For non-Super-Admins the
  // report scope must always follow the live active workspace (company OR branch),
  // never a one-time snapshot of the user's home company — otherwise switching to
  // a branch leaves reports showing the whole company. (Super Admin uses the picker.)
  useEffect(() => {
    if (!isSuperAdmin) setCompanyId(String(activeCompanyId || authProfile?.companyId || ''));
  }, [activeCompanyId, isSuperAdmin, authProfile]);
  const [branch, setBranch] = useState(''); const [department, setDepartment] = useState('');
  const [startDate, setStartDate] = useState(''); const [endDate, setEndDate] = useState(''); const [employeeId, setEmployeeId] = useState('');
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [audit, setAudit] = useState<any[]>([]);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const flash = (k: 'ok' | 'err', m: string) => { setToast({ kind: k, msg: m }); setTimeout(() => setToast(null), 4000); };

  // Template gallery (landing) vs. live-generate mode + demo preview state.
  const [mode, setMode] = useState<'gallery' | 'generate'>('gallery');
  // Preview presentation: editable Document canvas (default) vs the analytical Data view.
  const [previewMode, setPreviewMode] = useState<'document' | 'data'>('document');
  const [previewKey, setPreviewKey] = useState<string>('');
  const [previewReport, setPreviewReport] = useState<any>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  // Active faithful-template viewer (Form 16 / Salary Register / Salary Slip).
  const [templateView, setTemplateView] = useState<{ def: TemplateDef; name: string; autoAction?: 'pdf' | 'excel' | 'print' | null } | null>(null);
  const openTemplate = (def: TemplateDef, name: string, autoAction?: 'pdf' | 'excel' | 'print' | null) => setTemplateView({ def, name, autoAction });

  const openPreview = async (key: string) => {
    setPreviewKey(key); setPreviewReport(null); setPreviewBusy(true);
    try { setPreviewReport(await api.complianceReports.preview(key)); }
    catch (e: any) { flash('err', e?.message || 'Preview unavailable.'); setPreviewKey(''); }
    finally { setPreviewBusy(false); }
  };
  const goGenerate = (key: string) => { setSelectedKey(key); setReport(null); setMode('generate'); };

  // Favourites (local, per-browser) + Report Center metrics.
  const [favs, setFavs] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('hrms_report_favs') || '[]'); } catch { return []; } });
  const toggleFav = (key: string) => setFavs(prev => { const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]; localStorage.setItem('hrms_report_favs', JSON.stringify(next)); return next; });

  const loadCatalog = useCallback(async () => { try { setCatalog(await api.complianceReports.catalog() || []); } catch { setCatalog([]); } }, []);
  const loadAuditQuiet = useCallback(async () => { try { setAudit(await api.complianceReports.audit() || []); } catch { /* non-blocking */ } }, []);
  const loadEmployees = useCallback(async () => { try { const e = await api.employees.getAll(); setEmployees(Array.isArray(e) ? e : (e?.employees || [])); } catch { setEmployees([]); } }, []);
  useEffect(() => { loadCatalog(); loadEmployees(); loadAuditQuiet(); }, [loadCatalog, loadEmployees, loadAuditQuiet]);

  const companyOptions = useMemo(() => (companies || []).filter((c: any) => !c.parentCompanyId && c.status !== 'Archived' && !c.isArchived).map((c: any) => ({ value: String(c.id), label: c.name })), [companies]);
  const deptOptions = useMemo(() => Array.from(new Set(employees.map(e => e.department).filter(Boolean))).sort(), [employees]);
  const branchOptions = useMemo(() => Array.from(new Set(employees.map(e => e.branchLocation).filter(Boolean))).sort(), [employees]);
  const grouped = useMemo(() => { const g: Record<string, any[]> = {}; catalog.forEach(r => { (g[r.category] = g[r.category] || []).push(r); }); return g; }, [catalog]);
  const selected = catalog.find(r => r.key === selectedKey);

  // ── Reports navigation: accordion categories + real-time search (UI only) ─────
  // `openCat` drives accordion mode (one category open at a time). While a search
  // term is active, matching categories auto-expand and `openCat` is ignored.
  const [search, setSearch] = useState('');
  const [openCat, setOpenCat] = useState<string | null>(null);
  const q = search.trim().toLowerCase();

  // A report matches if the term appears in its name, category or key (the key
  // mirrors the name, e.g. "salary_register"). Kept precise so "Salary" returns
  // salary reports — not every payroll report whose prose happens to say "salary".
  const matchReport = useCallback((r: any) =>
    !q || [r.label, r.category, r.key].some(v => String(v || '').toLowerCase().includes(q)), [q]);

  // Categories to show, each with only its matching reports. When the term matches
  // a category's name (e.g. "PF"), the whole category is kept so the user can browse it.
  const visibleCats = useMemo(() => {
    const out: { cat: string; reports: any[]; total: number }[] = [];
    for (const cat of orderedCategories(Object.keys(grouped))) {
      const all = grouped[cat];
      const reports = q ? all.filter(matchReport) : all;
      if (q && reports.length === 0 && cat.toLowerCase().includes(q)) { out.push({ cat, reports: all, total: all.length }); continue; }
      if (reports.length) out.push({ cat, reports, total: all.length });
    }
    return out;
  }, [grouped, q, matchReport]);

  // Default the accordion to the first category once the catalog loads.
  useEffect(() => { if (!openCat) { const first = orderedCategories(Object.keys(grouped))[0]; if (first) setOpenCat(first); } }, [grouped]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCatOpen = (cat: string) => (q ? true : openCat === cat);
  const toggleCat = (cat: string) => setOpenCat(prev => (prev === cat ? null : cat));

  // Highlight the active search term inside a report name.
  const hl = (text: string) => {
    const term = search.trim();
    if (!term) return text;
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return text;
    return (<>{text.slice(0, idx)}<mark className="bg-amber-200 text-slate-900 rounded px-0.5">{text.slice(idx, idx + term.length)}</mark>{text.slice(idx + term.length)}</>);
  };

  // ── Report Center metrics (Phase 2) ──────────────────────────────────────────
  const STATUTORY_CATS = ['Compliance Reports', 'Statutory Registers', 'PF Reports', 'ESI Reports', 'Tax Reports'];
  const metrics = useMemo(() => {
    const todayStr = new Date().toDateString();
    const gens = (audit || []).filter((a: any) => a.action === 'GENERATE');
    const generatedToday = gens.filter((a: any) => { try { return new Date(a.createdAt).toDateString() === todayStr; } catch { return false; } }).length;
    const recent: { key: string; label: string; when: string }[] = [];
    const seen = new Set<string>();
    for (const a of gens) { if (seen.has(a.reportKey)) continue; seen.add(a.reportKey); recent.push({ key: a.reportKey, label: a.reportName, when: a.createdAt }); if (recent.length >= 6) break; }
    return {
      total: catalog.length,
      available: catalog.filter((c: any) => c.status === 'available').length,
      generatedToday,
      compliance: catalog.filter((c: any) => STATUTORY_CATS.includes(c.category)).length,
      recent,
    };
  }, [catalog, audit]);
  const favReports = useMemo(() => catalog.filter((c: any) => favs.includes(c.key)), [catalog, favs]);
  // Wage-master scope = the TOP company that owns the Labour Compliance settings.
  const wageCompanyId = useMemo(() => {
    const cid = companyId || String(authProfile?.companyId || activeCompanyId || '');
    const c = (companies || []).find((x: any) => String(x.id) === String(cid));
    return String((c as any)?.parentCompanyId || cid);
  }, [companyId, activeCompanyId, authProfile, companies]);

  // Reset operational filters when the selected report changes, so a filter that is
  // hidden for the new report can never silently carry over from the previous one.
  useEffect(() => { setBranch(''); setDepartment(''); setEmployeeId(''); setStartDate(''); setEndDate(''); }, [selectedKey]);

  const generate = async () => {
    if (!selectedKey) return flash('err', 'Select a report.');
    if (isSuperAdmin && !companyId) return flash('err', 'Select a company.');
    setBusy(true); setReport(null);
    try {
      // Wage Reports also receive the (client-side) State Wage Master + branch→state
      // map so the backend can compute minimum-wage figures. Ignored by every other report.
      const wageExtras = selected?.category === 'Wage Reports'
        ? { wageRules: exportWageRules(wageCompanyId), branchStateMap: getWageSettings(wageCompanyId).branchStateMap }
        : {};
      const r = await api.complianceReports.generate({ reportKey: selectedKey, companyId: companyId || undefined, branch: branch || undefined, department: department || undefined, startDate: startDate || undefined, endDate: endDate || undefined, employeeId: employeeId || undefined, ...wageExtras } as any);
      setReport(r);
      if (!r.canExport) flash('err', 'No data for the selected filters.');
    } catch (e: any) { flash('err', e?.message || 'Generation failed.'); } finally { setBusy(false); }
  };

  const filtersMeta = () => ({ branch, department, startDate, endDate, employeeId });

  const exportExcel = async () => {
    if (!report?.rows?.length) return;
    const XLSX = await import('xlsx');
    const data = report.rows.map((row: any) => { const o: any = {}; report.columns.forEach((c: any) => { o[c.label] = row[c.key]; }); return o; });
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${report.reportName.replace(/[^a-z0-9]+/gi, '_')}.xlsx`);
    api.complianceReports.logDownload({ reportKey: report.reportKey, reportName: report.reportName, format: 'EXCEL', companyId, filters: filtersMeta(), rowCount: report.rows.length }).catch(() => {});
  };

  const exportCsv = () => {
    if (!report?.rows?.length) return;
    const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const header = report.columns.map((c: any) => esc(c.label)).join(',');
    const lines = report.rows.map((row: any) => report.columns.map((c: any) => esc(row[c.key])).join(','));
    const csv = '﻿' + [header, ...lines].join('\r\n'); // BOM so Excel reads UTF-8
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${report.reportName.replace(/[^a-z0-9]+/gi, '_')}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    api.complianceReports.logDownload({ reportKey: report.reportKey, reportName: report.reportName, format: 'CSV', companyId, filters: filtersMeta(), rowCount: report.rows.length }).catch(() => {});
  };

  const exportPdf = async () => {
    if (!report?.rows?.length) return;
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: report.columns.length > 7 ? 'landscape' : 'portrait' });
    const W = doc.internal.pageSize.getWidth();
    const m = report.meta || {};
    let y = 12;
    if (m.logoImage) { try { doc.addImage(m.logoImage, 'PNG', 14, 8, 16, 16); } catch { /* ignore bad image */ } }
    doc.setFontSize(13); doc.setTextColor(20); doc.text(m.name || 'Company', m.logoImage ? 34 : 14, y); y += 5;
    // Branch identification line — only when the report scope is branch-specific.
    if (m.branchName) { doc.setFontSize(10); doc.setTextColor(40); doc.text(String(m.branchName), m.logoImage ? 34 : 14, y); y += 4; }
    doc.setFontSize(8); doc.setTextColor(90);
    if (m.address) { doc.text(String(m.address).slice(0, 110), m.logoImage ? 34 : 14, y); y += 4; }
    const ids = [m.cinNumber && `CIN: ${m.cinNumber}`, m.gstNumber && `GST: ${m.gstNumber}`, m.panNumber && `PAN: ${m.panNumber}`].filter(Boolean).join('   ');
    if (ids) { doc.text(ids, m.logoImage ? 34 : 14, y); y += 4; }
    doc.setDrawColor(200); doc.line(14, y, W - 14, y); y += 5;
    doc.setFontSize(11); doc.setTextColor(20); doc.text(report.reportName, 14, y);
    doc.setFontSize(8); doc.setTextColor(90); doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString('en-IN')}`, W - 14, y, { align: 'right' }); y += 3;

    autoTable(doc, {
      startY: y + 2, styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [79, 70, 229] },
      head: [report.columns.map((c: any) => c.label)],
      body: report.rows.map((row: any) => report.columns.map((c: any) => row[c.key] ?? '')),
      didDrawPage: (d: any) => {
        const page = doc.getNumberOfPages();
        const footY = doc.internal.pageSize.getHeight() - 6;
        doc.setFontSize(7); doc.setTextColor(120);
        // Footer: generated date/time + generated-by user (req #7), page number.
        const genLine = `Generated: ${new Date(report.generatedAt).toLocaleString('en-IN')}${report.generatedBy ? `  ·  By: ${report.generatedBy}` : ''}`;
        doc.text(genLine, 14, footY);
        doc.text(`Page ${d.pageNumber} of ${page}`, W - 14, footY, { align: 'right' });
      },
    });
    // Signature area
    const endY = (doc as any).lastAutoTable?.finalY || y + 20;
    const sy = Math.min(endY + 18, doc.internal.pageSize.getHeight() - 16);
    doc.setDrawColor(150); doc.line(W - 70, sy, W - 14, sy);
    doc.setFontSize(8); doc.setTextColor(60); doc.text(m.signatureText || 'Authorized Signatory', W - 14, sy + 5, { align: 'right' });
    doc.save(`${report.reportName.replace(/[^a-z0-9]+/gi, '_')}.pdf`);
    api.complianceReports.logDownload({ reportKey: report.reportKey, reportName: report.reportName, format: 'PDF', companyId, filters: filtersMeta(), rowCount: report.rows.length }).catch(() => {});
  };

  // Print — opens a branded, print-ready window. Uses the same live report data
  // (no static files), with the company header and a generated-on / generated-by
  // footer, then triggers the browser print dialog.
  const printReport = () => {
    if (!report?.rows?.length) return;
    const m = report.meta || {};
    const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const ids = [m.cinNumber && `CIN: ${m.cinNumber}`, m.gstNumber && `GST: ${m.gstNumber}`, m.panNumber && `PAN: ${m.panNumber}`].filter(Boolean).map(esc).join(' &nbsp; ');
    const head = report.columns.map((c: any) => `<th>${esc(c.label)}</th>`).join('');
    const body = report.rows.map((row: any) => `<tr>${report.columns.map((c: any) => `<td>${esc(row[c.key])}</td>`).join('')}</tr>`).join('');
    const genLine = `Generated: ${new Date(report.generatedAt).toLocaleString('en-IN')}${report.generatedBy ? ' &nbsp;·&nbsp; By: ' + esc(report.generatedBy) : ''}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.reportName)}</title>
      <style>
        *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:24px;font-size:12px}
        .hdr{display:flex;align-items:center;gap:12px;border-bottom:1px solid #cbd5e1;padding-bottom:10px;margin-bottom:6px}
        .hdr img{width:46px;height:46px;object-fit:contain}
        .co{font-size:16px;font-weight:700;margin:0}
        .meta{font-size:10px;color:#475569;margin-top:2px}
        .rt{font-size:13px;font-weight:700;margin:10px 0 8px}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;font-size:10px}
        thead th{background:#4f46e5;color:#fff}
        tfoot td{border:none;font-size:10px;color:#475569;padding-top:10px}
        .sign{margin-top:48px;text-align:right;font-size:11px}
        @media print{body{margin:10mm}}
      </style></head><body>
      <div class="hdr">${m.logoImage ? `<img src="${esc(m.logoImage)}" alt="logo"/>` : ''}
        <div><p class="co">${esc(m.name || 'Company')}</p>
        ${m.branchName ? `<div class="meta" style="font-weight:700;color:#1f2937;font-size:11px">${esc(m.branchName)}</div>` : ''}
        ${m.address ? `<div class="meta">${esc(m.address)}</div>` : ''}
        ${ids ? `<div class="meta">${ids}</div>` : ''}</div>
      </div>
      <div class="rt">${esc(report.reportName)}</div>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      <div class="sign">______________________<br/>${esc(m.signatureText || 'Authorized Signatory')}</div>
      <div style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:6px;font-size:10px;color:#475569">${genLine} &nbsp;·&nbsp; ${report.rows.length} record(s)</div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { flash('err', 'Allow pop-ups to print this report.'); return; }
    w.document.write(html); w.document.close();
    api.complianceReports.logDownload({ reportKey: report.reportKey, reportName: report.reportName, format: 'PRINT', companyId, filters: filtersMeta(), rowCount: report.rows.length }).catch(() => {});
  };

  const openAudit = async () => { setShowAudit(s => !s); if (!showAudit) { try { setAudit(await api.complianceReports.audit() || []); } catch { setAudit([]); } } };

  // Reusable report card (used by Favourites and each category section).
  const renderReportCard = (r: any) => {
    // Reports with a pixel-faithful template (Form 16 / Salary Register / Salary
    // Slip) open the dedicated template viewer with the full action set; their
    // Preview === PDF === Print. Everything else keeps the generic table flow.
    const tpl = templateForKey(r.key);
    if (tpl) {
      const isFav = favs.includes(r.key);
      return (
        <div key={r.key} className="rounded-xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/40 p-3 flex flex-col gap-2 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-slate-800 leading-snug">{hl(r.label)}</p>
            <button onClick={() => toggleFav(r.key)} title={isFav ? 'Remove favourite' : 'Add to favourites'} className={`shrink-0 ${isFav ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}`}><Star size={14} fill={isFav ? 'currentColor' : 'none'} /></button>
          </div>
          <span className="self-start text-[8px] font-bold uppercase tracking-wider border rounded-full px-1.5 py-0.5 bg-emerald-100 text-emerald-700 border-emerald-200">Live Template</span>
          <p className="text-[10px] text-slate-500 leading-snug flex-1 min-h-[26px]">{tpl.description}</p>
          {/* Cards expose only Preview + Generate. Print/Excel/PDF live in the
              viewer toolbar after the report is opened (enterprise UI standard). */}
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="flex-1 text-[10px] h-7" icon={<Eye size={11} />} onClick={() => openTemplate(tpl, r.label)}>Preview</Button>
            <Button size="sm" className="flex-1 text-[10px] h-7" icon={<Zap size={11} />} onClick={() => openTemplate(tpl, r.label)}>Generate</Button>
          </div>
        </div>
      );
    }
    const badge = r.status === 'available'
      ? { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Template Available' }
      : r.status === 'coming'
        ? { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Coming Soon' }
        : { cls: 'bg-slate-100 text-slate-500 border-slate-200', label: 'Requires Setup' };
    const isFav = favs.includes(r.key);
    return (
      <div key={r.key} className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-bold text-slate-800 leading-snug">{hl(r.label)}</p>
          <button onClick={() => toggleFav(r.key)} title={isFav ? 'Remove favourite' : 'Add to favourites'} className={`shrink-0 ${isFav ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}`}><Star size={14} fill={isFav ? 'currentColor' : 'none'} /></button>
        </div>
        <span className={`self-start text-[8px] font-bold uppercase tracking-wider border rounded-full px-1.5 py-0.5 ${badge.cls}`}>{badge.label}</span>
        <p className="text-[10px] text-slate-500 leading-snug flex-1 min-h-[26px]">{r.description}</p>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="flex-1 text-[10px] h-7" icon={<Eye size={11} />} onClick={() => openPreview(r.key)} disabled={r.status === 'coming'}>Preview</Button>
          <Button size="sm" className="flex-1 text-[10px] h-7" icon={<Zap size={11} />} onClick={() => goGenerate(r.key)} disabled={!r.available}>Generate</Button>
        </div>
      </div>
    );
  };

  const STAT_TILES = (m: typeof metrics) => ([
    { label: 'Total Reports', value: m.total, icon: <FileText size={15} />, color: 'bg-indigo-500' },
    { label: 'Available', value: m.available, icon: <CheckCircle2 size={15} />, color: 'bg-emerald-500' },
    { label: 'Generated Today', value: m.generatedToday, icon: <Zap size={15} />, color: 'bg-blue-500' },
    { label: 'Compliance', value: m.compliance, icon: <ShieldCheck size={15} />, color: 'bg-violet-500' },
    { label: 'Recent', value: m.recent.length, icon: <History size={15} />, color: 'bg-slate-500' },
    { label: 'Favourites', value: favReports.length, icon: <Star size={15} />, color: 'bg-amber-500' },
  ]);

  // ── A faithful template is open → render its dedicated viewer (Preview / PDF /
  //    Excel / Print of the exact government layout), replacing the catalog. ──
  if (templateView) {
    const cid = companyId || String(activeCompanyId || authProfile?.companyId || '');
    return (
      <ReportTemplateViewer
        def={templateView.def}
        reportName={templateView.name}
        companyId={cid}
        autoAction={templateView.autoAction}
        canEdit={['Super Admin', 'Company Head', 'HR'].includes(role)}
        userName={authProfile?.name || authProfile?.email || role}
        role={role}
        onClose={() => setTemplateView(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><BarChart3 size={18} className="text-indigo-600" /> Reports</h2>
          <p className="text-xs text-slate-500">{catalog.length} reports across {Object.keys(grouped).length} categories — browse sample templates, or generate live from your HRMS data.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button onClick={() => setMode('gallery')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${mode === 'gallery' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><LayoutGrid size={13} /> Template Gallery</button>
            <button onClick={() => setMode('generate')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${mode === 'generate' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><Zap size={13} /> Generate</button>
          </div>
          <Button variant="outline" size="sm" icon={<History size={13} />} onClick={openAudit}>{showAudit ? 'Hide' : 'Audit Log'}</Button>
        </div>
      </div>

      {toast && <div className={`px-4 py-2.5 rounded-lg text-xs font-semibold ${toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{toast.msg}</div>}

      {/* ─────────────── TEMPLATE GALLERY ─────────────── */}
      {mode === 'gallery' && (
        <div className="space-y-4">
          {/* Phase 2 — Report Center stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {STAT_TILES(metrics).map(t => (
              <div key={t.label} className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm p-3 flex items-center gap-3">
                <span className={`w-9 h-9 rounded-xl text-white flex items-center justify-center ${t.color}`}>{t.icon}</span>
                <div className="min-w-0">
                  <p className="text-lg font-bold text-slate-800 leading-none">{t.value}</p>
                  <p className="text-[10px] text-slate-500 font-semibold mt-1 truncate">{t.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Recently generated */}
          {metrics.recent.length > 0 && (
            <Card>
              <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><History size={15} className="text-slate-500" /> Recently Generated</h3>
              <div className="flex flex-wrap gap-2">
                {metrics.recent.map(rc => (
                  <button key={rc.key} onClick={() => goGenerate(rc.key)} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 rounded-full px-3 py-1.5 transition-colors">
                    <FileText size={11} /> {rc.label}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Favourites */}
          {favReports.length > 0 && (
            <Card>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Star size={15} className="text-amber-400" fill="currentColor" /> Favourite Reports <span className="text-[10px] font-bold text-slate-400">({favReports.length})</span></h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{favReports.map(renderReportCard)}</div>
            </Card>
          )}

          {/* Search bar — real-time, filters by name / category / keywords */}
          <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm p-2.5 flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search reports by name, category or keyword — e.g. Salary, Bonus, PF, Attendance…"
                className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
              />
              {search && (
                <button onClick={() => setSearch('')} title="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={15} /></button>
              )}
            </div>
            {q && <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap pr-1">{visibleCats.reduce((n, c) => n + c.reports.length, 0)} match(es)</span>}
          </div>

          {/* Categories — accordion (one open at a time; all matches open while searching) */}
          {visibleCats.length === 0 ? (
            <Card>
              <div className="py-12 text-center">
                <Search size={28} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-600">No matching reports found.</p>
                <p className="text-[11px] text-slate-400 mt-1">Try a different name, category, or keyword{search ? <> — or <button onClick={() => setSearch('')} className="text-indigo-600 font-semibold hover:underline">clear the search</button></> : '.'}</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {visibleCats.map(({ cat, reports, total }) => {
                const open = isCatOpen(cat);
                return (
                  <div key={cat} className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm overflow-hidden">
                    <button
                      onClick={() => toggleCat(cat)}
                      aria-expanded={open}
                      className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50/70 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                        <ChevronDown size={16} className={`text-indigo-600 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
                        <FileText size={15} className="text-indigo-600" /> {cat}
                        <span className="text-[10px] font-bold text-slate-400">({q ? `${reports.length}/${total}` : total})</span>
                      </span>
                      {!open && <span className="text-[10px] font-semibold text-slate-400">{reports.length} report{reports.length === 1 ? '' : 's'}</span>}
                    </button>
                    <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 px-4 pb-4 pt-0.5">
                          {reports.map(renderReportCard)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────── GENERATE (live data) ─────────────── */}
      {mode === 'generate' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Report catalog */}
        <Card className="lg:col-span-1">
          <h3 className="text-sm font-bold text-slate-800 mb-2">Reports</h3>
          <div className="max-h-[560px] overflow-y-auto space-y-3 pr-1">
            {orderedCategories(Object.keys(grouped)).map(cat => (
              <div key={cat}>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">{cat}</p>
                <div className="space-y-0.5">
                  {grouped[cat].map(r => (
                    <button key={r.key} disabled={!r.available} onClick={() => { setSelectedKey(r.key); setReport(null); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${selectedKey === r.key ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold' : r.available ? 'hover:bg-slate-50 border border-transparent text-slate-700' : 'text-slate-300 cursor-not-allowed'}`}>
                      <span className="flex items-center gap-1.5"><FileText size={12} />{r.label}</span>
                      {r.available ? <ChevronRight size={12} /> : <span className="text-[9px] font-bold text-amber-500">SOON</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Filters + preview */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800">{selected ? selected.label : 'Select a report'}</h3>
            {report?.canExport && (
              <div className="flex items-center gap-2">
                {/* Document (editable) vs Data (analytics) preview */}
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  <button onClick={() => setPreviewMode('document')} className={`px-2.5 py-1.5 text-[11px] font-semibold ${previewMode === 'document' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Document</button>
                  <button onClick={() => setPreviewMode('data')} className={`px-2.5 py-1.5 text-[11px] font-semibold ${previewMode === 'data' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Data</button>
                </div>
                {/* Quick (non-edited) exports for the data view; the Document view has its own edit-aware exports */}
                {previewMode === 'data' && <div className="flex gap-2"><Button variant="outline" size="sm" icon={<Printer size={13} />} onClick={printReport}>Print</Button><Button variant="outline" size="sm" icon={<Download size={13} />} onClick={exportExcel}>Excel</Button><Button variant="outline" size="sm" icon={<Download size={13} />} onClick={exportPdf}>PDF</Button><Button variant="outline" size="sm" icon={<Download size={13} />} onClick={exportCsv}>CSV</Button></div>}
              </div>
            )}
          </div>

          {/* Filters — Phase 5: only the filters relevant to the selected report */}
          {(() => {
            const f: string[] = selected?.filters || ['dateRange', 'branch', 'department', 'employee'];
            const fyOptions = [2026, 2025, 2024].map(y => ({ value: String(y), label: `FY ${y}-${String(y + 1).slice(2)}` }));
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-1">
                {isSuperAdmin && <Select label="Company" value={companyId} onChange={e => setCompanyId(e.target.value)} options={[{ value: '', label: 'Select company…' }, ...companyOptions]} />}
                {f.includes('financialYear') && <Select label="Financial Year" value={startDate ? startDate.slice(0, 4) : ''} onChange={e => { const y = e.target.value; setStartDate(y ? `${y}-04-01` : ''); setEndDate(y ? `${Number(y) + 1}-03-31` : ''); }} options={[{ value: '', label: 'Select FY…' }, ...fyOptions]} />}
                {f.includes('branch') && <Select label="Branch" value={branch} onChange={e => setBranch(e.target.value)} options={[{ value: '', label: 'All branches' }, ...branchOptions.map(b => ({ value: b, label: b }))]} />}
                {f.includes('department') && <Select label="Department" value={department} onChange={e => setDepartment(e.target.value)} options={[{ value: '', label: 'All departments' }, ...deptOptions.map(d => ({ value: d, label: d }))]} />}
                {f.includes('dateRange') && <Input label="From Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />}
                {f.includes('dateRange') && <Input label="To Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />}
                {f.includes('employee') && <Select label="Employee" value={employeeId} onChange={e => setEmployeeId(e.target.value)} options={[{ value: '', label: 'All employees' }, ...employees.map(e => ({ value: String(e.id), label: `${e.name} (${e.employeeId})` }))]} />}
              </div>
            );
          })()}
          {selected && <p className="text-[10px] text-slate-400 mb-3">Showing only the filters relevant to <strong>{selected.label}</strong>.</p>}
          <Button icon={<Eye size={14} />} loading={busy} disabled={!selected?.available} onClick={generate}>Generate &amp; Preview</Button>

          {/* Warnings */}
          {report?.warnings?.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800 space-y-1">
              {report.warnings.map((w: string, i: number) => <div key={i} className="flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />{w}</div>)}
            </div>
          )}

          {/* Preview — DOCUMENT mode is an editable, export-faithful document canvas;
              DATA mode keeps the analytical view (modern for internal, table for statutory). */}
          {report && report.rows.length > 0 && (
            previewMode === 'document' ? (
              <EditableReportCanvas
                report={report}
                companyId={companyId || String(authProfile?.companyId || activeCompanyId || '')}
                canEdit={['Super Admin', 'Company Head', 'HR'].includes(role)}
                userName={authProfile?.name || authProfile?.email || role}
                role={role}
                onLog={(format) => api.complianceReports.logDownload({ reportKey: report.reportKey, reportName: report.reportName, format, companyId, filters: filtersMeta(), rowCount: report.rows.length }).catch(() => {})}
              />
            ) : isStatutoryReport(report.reportKey, report.category) ? (
            <div className="mt-3">
              <div className="text-[11px] text-slate-500 mb-1.5">{report.rows.length} record(s) · generated {new Date(report.generatedAt).toLocaleString('en-IN')}{report.generatedBy ? ` · by ${report.generatedBy}` : ''} · <span className="font-semibold text-slate-600">statutory format</span></div>
              <div className="overflow-x-auto max-h-[420px] border border-slate-100 rounded-lg">
                <Table>
                  <Thead><Tr>{report.columns.map((c: any) => <Th key={c.key}>{c.label}</Th>)}</Tr></Thead>
                  <Tbody>{report.rows.slice(0, 300).map((row: any, i: number) => (<Tr key={i}>{report.columns.map((c: any) => <Td key={c.key}><span className="text-[11px]">{String(row[c.key] ?? '')}</span></Td>)}</Tr>))}</Tbody>
                </Table>
              </div>
              {report.rows.length > 300 && <p className="text-[10px] text-slate-400 mt-1">Showing first 300 rows in preview · full data in the export.</p>}
            </div>
            ) : (
              <BusinessReportView report={report} />
            )
          )}
        </Card>
      </div>
      )}

      {/* Audit log */}
      {showAudit && (
        <Card>
          <h3 className="text-sm font-bold text-slate-800 mb-2">Report Audit Trail</h3>
          {audit.length === 0 ? <div className="py-6 text-center text-xs text-slate-400">No activity yet.</div> : (
            <div className="overflow-x-auto max-h-[360px]"><Table><Thead><Tr><Th>When</Th><Th>Action</Th><Th>Report</Th><Th>Format</Th><Th>Rows</Th><Th>By</Th></Tr></Thead>
              <Tbody>{audit.map(a => (<Tr key={a.id}><Td><span className="text-[11px]">{formatDate(a.createdAt)} {new Date(a.createdAt).toLocaleTimeString('en-IN')}</span></Td><Td><Badge variant={a.action === 'DOWNLOAD' ? 'blue' : 'gray'}>{a.action}</Badge></Td><Td>{a.reportName}</Td><Td>{a.format || '—'}</Td><Td>{a.rowCount}</Td><Td>{a.performedByName || '—'}</Td></Tr>))}</Tbody></Table></div>
          )}
        </Card>
      )}

      {/* ─────────────── SAMPLE PREVIEW (demo data) ─────────────── */}
      <Modal open={!!previewKey} onClose={() => { setPreviewKey(''); setPreviewReport(null); }} title="Sample Preview" size="xl">
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-bold text-amber-800">
            <Sparkles size={14} /> SAMPLE PREVIEW · DEMO DATA — layout shown using the <strong>VISHV ENTERPRISE</strong> demo company. Your real data is never modified. Use <strong>Generate</strong> for live reports.
          </div>
          {previewBusy && <div className="py-12 text-center text-xs text-slate-400">Loading sample…</div>}
          {!previewBusy && previewReport && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{previewReport.reportName}</h3>
                  <p className="text-[10px] text-slate-500">{previewReport.category} · {previewReport.meta?.name || 'VISHV ENTERPRISE'} · {previewReport.rows?.length || 0} sample row(s)</p>
                </div>
                <Button size="sm" icon={<Zap size={12} />} onClick={() => { setPreviewKey(''); goGenerate(previewReport.reportKey); }}>Generate Live</Button>
              </div>
              {previewReport.rows?.length > 0 ? (
                <div className="overflow-x-auto max-h-[440px] border border-slate-100 rounded-lg">
                  <Table>
                    <Thead><Tr>{previewReport.columns.map((c: any) => <Th key={c.key}>{c.label}</Th>)}</Tr></Thead>
                    <Tbody>{previewReport.rows.slice(0, 100).map((row: any, i: number) => (<Tr key={i}>{previewReport.columns.map((c: any) => <Td key={c.key}><span className="text-[11px]">{String(row[c.key] ?? '')}</span></Td>)}</Tr>))}</Tbody>
                  </Table>
                </div>
              ) : (
                <div className="py-10 text-center">
                  <p className="text-xs font-semibold text-slate-500">No sample rows for this report.</p>
                  <p className="text-[11px] text-slate-400 mt-1">{previewReport.warnings?.find((w: string) => !w.includes('SAMPLE PREVIEW')) || 'This report needs source data to be captured first.'}</p>
                </div>
              )}
              {previewReport.columns?.length > 0 && (
                <div className="text-[10px] text-slate-400">Columns: {previewReport.columns.map((c: any) => c.label).join(' · ')}</div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default ComplianceReports;
