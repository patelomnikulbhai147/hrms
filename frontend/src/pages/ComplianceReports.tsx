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
import { formatDateTime } from '@/utils/formatDate';
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

  // ── Super Admin Configuration Dialog States ──
  const [configOpen, setConfigOpen] = useState(false);
  const [configReportKey, setConfigReportKey] = useState<string>('');
  const [configMode, setConfigMode] = useState<'preview' | 'generate'>('preview');
  
  const [coMode, setCoMode] = useState<'single' | 'selected' | 'all'>('single');
  const [singleCoId, setSingleCoId] = useState<string>('');
  const [selectedCoIds, setSelectedCoIds] = useState<string[]>([]);
  const [selectedBrs, setSelectedBrs] = useState<string[]>([]);
  
  const [dtPreset, setDtPreset] = useState<string>('this_month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  
  const [cfgDept, setCfgDept] = useState<string>('');
  const [cfgEmpId, setCfgEmpId] = useState<string>('');
  const [cfgDesig, setCfgDesig] = useState<string>('');
  const [cfgStatus, setCfgStatus] = useState<string>('');
  const [cfgPayrollMonth, setCfgPayrollMonth] = useState<string>('');
  const [cfgLeaveType, setCfgLeaveType] = useState<string>('');
  const [cfgContract, setCfgContract] = useState<string>('');
  const [cfgTender, setCfgTender] = useState<string>('');

  const [coSearch, setCoSearch] = useState('');
  const [coOpen, setCoOpen] = useState(false);
  const [brSearch, setBrSearch] = useState('');
  
  const [allBranches, setAllBranches] = useState<any[]>([]);
  const [validationErr, setValidationErr] = useState<string>('');

  // Load branches for Super Admin company grouping
  useEffect(() => {
    if (isSuperAdmin) {
      api.branches.getAll()
        .then(data => setAllBranches(Array.isArray(data) ? data : []))
        .catch(err => console.error('Failed to load branches:', err));
    }
  }, [isSuperAdmin]);

  const activeCompanies = useMemo(() => 
    (companies || []).filter((c: any) => !c.parentCompanyId && c.status !== 'Archived' && !c.isArchived),
    [companies]
  );

  const filteredBranches = useMemo(() => {
    if (coMode === 'single') {
      if (!singleCoId) return [];
      return allBranches.filter(b => String(b.companyId) === String(singleCoId));
    } else if (coMode === 'selected') {
      return allBranches.filter(b => selectedCoIds.includes(String(b.companyId)));
    } else {
      return allBranches;
    }
  }, [allBranches, coMode, singleCoId, selectedCoIds]);

  const branchesByCompany = useMemo(() => {
    const g: Record<string, any[]> = {};
    filteredBranches.forEach(b => {
      const coName = b.parentCompanyName || b.company?.name || 'Unknown Company';
      (g[coName] = g[coName] || []).push(b);
    });
    return g;
  }, [filteredBranches]);

  const getDatesForPreset = (preset: string) => {
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    const formatDateStr = (d: Date) => d.toISOString().split('T')[0];

    switch (preset) {
      case 'today':
        return { start: formatDateStr(today), end: formatDateStr(today) };
      case 'yesterday':
        return { start: formatDateStr(yest), end: formatDateStr(yest) };
      case 'this_week': {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(today.setDate(diff));
        const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
        return { start: formatDateStr(monday), end: formatDateStr(sunday) };
      }
      case 'this_month': {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return { start: formatDateStr(firstDay), end: formatDateStr(lastDay) };
      }
      default:
        return { start: '', end: '' };
    }
  };

  const handlePresetChange = (preset: string) => {
    setDtPreset(preset);
    if (preset !== 'custom') {
      const dates = getDatesForPreset(preset);
      setCustomStart(dates.start);
      setCustomEnd(dates.end);
    }
  };

  const isFilterApplicable = (filterName: string, reportKeyStr: string) => {
    const r = catalog.find(x => x.key === reportKeyStr);
    if (!r) return false;
    const cat = r.category;
    const key = r.key;

    switch (filterName) {
      case 'department':
        return r.filters?.includes('department') || ['Payroll Reports', 'Attendance Reports', 'Leave Reports', 'Employee Reports', 'Document Reports', 'Compliance Reports', 'Statutory Registers', 'Wage Reports', 'Bonus Reports'].includes(cat);
      case 'employee':
        return r.filters?.includes('employee') || ['Payroll Reports', 'Attendance Reports', 'Leave Reports', 'Employee Reports', 'Document Reports', 'Tax Reports', 'Gratuity & Settlement', 'Bonus Reports', 'Wage Reports'].includes(cat);
      case 'designation':
        return ['Employee Reports', 'Document Reports'].includes(cat);
      case 'status':
        return ['Employee Reports', 'Leave Reports', 'Attendance Reports'].includes(cat);
      case 'payrollMonth':
        return ['Payroll Reports', 'Bonus Reports', 'PF Reports', 'ESI Reports', 'Tax Reports'].includes(cat);
      case 'attendancePeriod':
        return ['Attendance Reports'].includes(cat);
      case 'leaveType':
        return ['Leave Reports'].includes(cat);
      case 'contract':
        return key.includes('contract') || r.label.toLowerCase().includes('contract');
      case 'tender':
        return key.includes('tender') || r.label.toLowerCase().includes('tender');
      default:
        return false;
    }
  };

  const openConfigForReport = (key: string, actMode: 'preview' | 'generate') => {
    setConfigReportKey(key);
    setConfigMode(actMode);
    setValidationErr('');
    
    setCoMode('single');
    setSingleCoId(isSuperAdmin ? '' : String(activeCompanyId || authProfile?.companyId || ''));
    setSelectedCoIds([]);
    setSelectedBrs([]);
    setDtPreset('this_month');
    const dates = getDatesForPreset('this_month');
    setCustomStart(dates.start);
    setCustomEnd(dates.end);
    
    setCfgDept('');
    setCfgEmpId('');
    setCfgDesig('');
    setCfgStatus('');
    setCfgPayrollMonth('');
    setCfgLeaveType('');
    setCfgContract('');
    setCfgTender('');
    
    setCoSearch('');
    setCoOpen(false);
    
    setConfigOpen(true);
  };

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
  const [search, setSearch] = useState('');
  const [openCat, setOpenCat] = useState<string | null>(null);
  const q = search.trim().toLowerCase();

  const matchReport = useCallback((r: any) =>
    !q || [r.label, r.category, r.key].some(v => String(v || '').toLowerCase().includes(q)), [q]);

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

  useEffect(() => { if (!openCat) { const first = orderedCategories(Object.keys(grouped))[0]; if (first) setOpenCat(first); } }, [grouped]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCatOpen = (cat: string) => (q ? true : openCat === cat);
  const toggleCat = (cat: string) => setOpenCat(prev => (prev === cat ? null : cat));

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
    if (isSuperAdmin) {
      openConfigForReport(selectedKey, 'generate');
      return;
    }
    setBusy(true); setReport(null);
    try {
      const wageExtras = selected?.category === 'Wage Reports'
        ? { wageRules: exportWageRules(wageCompanyId), branchStateMap: getWageSettings(wageCompanyId).branchStateMap }
        : {};
      const r = await api.complianceReports.generate({ reportKey: selectedKey, companyId: companyId || undefined, branch: branch || undefined, department: department || undefined, startDate: startDate || undefined, endDate: endDate || undefined, employeeId: employeeId || undefined, ...wageExtras } as any);
      setReport(r);
      if (!r.canExport) flash('err', 'No data for the selected filters.');
    } catch (e: any) { flash('err', e?.message || 'Generation failed.'); } finally { setBusy(false); }
  };

  // ── Multi-Company Fetch and Merge Handler for Super Admin ──
  const handleGenerateConfigured = async () => {
    let targetCos: Company[] = [];
    if (coMode === 'single') {
      const co = activeCompanies.find(c => String(c.id) === String(singleCoId));
      if (co) targetCos = [co];
    } else if (coMode === 'selected') {
      targetCos = activeCompanies.filter(c => selectedCoIds.includes(String(c.id)));
    } else {
      targetCos = activeCompanies;
    }
    
    if (targetCos.length === 0) {
      setValidationErr('Select at least one company.');
      return;
    }
    
    if (dtPreset === 'custom' && (!customStart || !customEnd)) {
      setValidationErr('Enter both start and end dates.');
      return;
    }
    if (customStart && customEnd && new Date(customStart) > new Date(customEnd)) {
      setValidationErr('Start date cannot be after end date.');
      return;
    }
    
    setConfigOpen(false);
    setValidationErr('');
    
    const tpl = templateForKey(configReportKey);
    if (coMode === 'single' && tpl) {
      setCompanyId(singleCoId);
      openTemplate(tpl, catalog.find(r => r.key === configReportKey)?.label || tpl.catalogNames[0]);
      return;
    }
    
    setSelectedKey(configReportKey);
    setReport(null);
    setMode('generate');
    setBusy(true);
    
    try {
      const promises = targetCos.map(async (co) => {
        const wageExtras = selected?.category === 'Wage Reports'
          ? { wageRules: exportWageRules(String(co.id)), branchStateMap: getWageSettings(String(co.id)).branchStateMap }
          : {};
          
        return api.complianceReports.generate({
          reportKey: configReportKey,
          companyId: String(co.id),
          branch: selectedBrs.length > 0 ? selectedBrs.join(',') : undefined,
          department: cfgDept || undefined,
          startDate: customStart || undefined,
          endDate: customEnd || undefined,
          employeeId: cfgEmpId || undefined,
          designation: cfgDesig || undefined,
          status: cfgStatus || undefined,
          payrollMonth: cfgPayrollMonth || undefined,
          leaveType: cfgLeaveType || undefined,
          contract: cfgContract || undefined,
          tender: cfgTender || undefined,
          ...wageExtras
        } as any).catch(err => {
          console.error(`Failed to generate for company ${co.name}:`, err);
          return { error: err.message, meta: { name: co.name }, columns: [], rows: [] };
        });
      });
      
      const results = await Promise.all(promises);
      
      const columns = results.find(r => r.columns && r.columns.length > 0)?.columns || [];
      const mergedRows: any[] = [];
      const mergedWarnings: string[] = [];
      const companyResults: any[] = [];
      
      results.forEach((r, idx) => {
        const co = targetCos[idx];
        if (r.error) {
          mergedWarnings.push(`Company ${co.name}: ${r.error}`);
        } else {
          if (r.rows && r.rows.length > 0) {
            r.rows.forEach((row: any) => {
              mergedRows.push({
                ...row,
                _companyId: co.id,
                _companyName: co.name,
                _companyCode: (co as any).companyCode || ''
              });
            });
          }
          if (r.warnings) {
            r.warnings.forEach((w: string) => {
              if (!w.includes('No records match')) {
                mergedWarnings.push(`${co.name}: ${w}`);
              }
            });
          }
        }
        
        companyResults.push({
          company: co,
          meta: r.meta,
          rows: r.rows || [],
          summary: r.summary || null,
          warnings: r.warnings || []
        });
      });
      
      const label = catalog.find(x => x.key === configReportKey)?.label || 'Report';
      
      const finalReport = {
        reportKey: configReportKey,
        reportName: label,
        category: catalog.find(x => x.key === configReportKey)?.category || '',
        generatedAt: new Date().toISOString(),
        generatedBy: authProfile?.name || authProfile?.email || 'Super Admin',
        columns,
        rows: mergedRows,
        warnings: Array.from(new Set(mergedWarnings)),
        canExport: mergedRows.length > 0,
        isMultiCompany: coMode !== 'single',
        companyResults
      };
      
      setReport(finalReport);
      if (mergedRows.length === 0) {
        flash('err', 'No data found for the selected company/companies.');
      }
    } catch (err: any) {
      flash('err', err.message || 'Generation failed.');
    } finally {
      setBusy(false);
    }
  };

  const filtersMeta = () => ({
    branch: coMode === 'single' ? branch : selectedBrs.join(','),
    department: coMode === 'single' ? department : cfgDept,
    startDate: coMode === 'single' ? startDate : customStart,
    endDate: coMode === 'single' ? endDate : customEnd,
    employeeId: coMode === 'single' ? employeeId : cfgEmpId
  });

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
    const csv = '﻿' + [header, ...lines].join('\r\n');
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
        const genLine = `Generated: ${new Date(report.generatedAt).toLocaleString('en-IN')}${report.generatedBy ? `  ·  By: ${report.generatedBy}` : ''}`;
        doc.text(genLine, 14, footY);
        doc.text(`Page ${d.pageNumber} of ${page}`, W - 14, footY, { align: 'right' });
      },
    });
    const endY = (doc as any).lastAutoTable?.finalY || y + 20;
    const sy = Math.min(endY + 18, doc.internal.pageSize.getHeight() - 16);
    doc.setDrawColor(150); doc.line(W - 70, sy, W - 14, sy);
    doc.setFontSize(8); doc.setTextColor(60); doc.text(m.signatureText || 'Authorized Signatory', W - 14, sy + 5, { align: 'right' });
    doc.save(`${report.reportName.replace(/[^a-z0-9]+/gi, '_')}.pdf`);
    api.complianceReports.logDownload({ reportKey: report.reportKey, reportName: report.reportName, format: 'PDF', companyId, filters: filtersMeta(), rowCount: report.rows.length }).catch(() => {});
  };

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

  // ── Multi-Company Grouped Export Handlers ──
  const groupedRows = useMemo(() => {
    if (!report || !report.isMultiCompany) return {};
    const groups: Record<string, any[]> = {};
    report.rows.forEach((row: any) => {
      const key = row._companyName || 'Unknown Company';
      (groups[key] = groups[key] || []).push(row);
    });
    return groups;
  }, [report]);

  const computeTotals = (rows: any[], columns: any[]) => {
    const totals: Record<string, number | string> = {};
    columns.forEach((col, idx) => {
      if (idx === 0) {
        totals[col.key] = '';
        return;
      }
      const isNumeric = rows.some(row => typeof row[col.key] === 'number' || (!isNaN(Number(row[col.key])) && row[col.key] !== ''));
      if (isNumeric) {
        const sum = rows.reduce((acc, row) => {
          const val = Number(row[col.key]);
          return acc + (isNaN(val) ? 0 : val);
        }, 0);
        totals[col.key] = Math.round(sum * 100) / 100;
      } else {
        totals[col.key] = '';
      }
    });
    return totals;
  };

  const companySubtotals = useMemo(() => {
    if (!report || !report.isMultiCompany) return {};
    const subtotals: Record<string, any> = {};
    Object.entries(groupedRows).forEach(([coName, rows]) => {
      subtotals[coName] = computeTotals(rows, report.columns);
    });
    return subtotals;
  }, [groupedRows, report]);

  const grandTotal = useMemo(() => {
    if (!report || !report.isMultiCompany) return {};
    return computeTotals(report.rows, report.columns);
  }, [report]);

  const exportExcelMulti = async () => {
    if (!report?.rows?.length) return;
    const XLSX = await import('xlsx');
    const data: any[] = [];
    
    Object.entries(groupedRows).forEach(([coName, rows]) => {
      const headerRow: any = {};
      report.columns.forEach((c: any, idx: number) => {
        headerRow[c.label] = idx === 0 ? `Company: ${coName}` : '';
      });
      data.push(headerRow);
      
      rows.forEach((row: any) => {
        const r: any = {};
        report.columns.forEach((c: any) => {
          r[c.label] = row[c.key];
        });
        data.push(r);
      });
      
      const sub = companySubtotals[coName];
      const subtotalRow: any = {};
      report.columns.forEach((c: any, idx: number) => {
        subtotalRow[c.label] = idx === 0 ? 'Company Subtotal' : sub[c.key];
      });
      data.push(subtotalRow);
      data.push({});
    });
    
    const grandTotalRow: any = {};
    report.columns.forEach((c: any, idx: number) => {
      grandTotalRow[c.label] = idx === 0 ? 'Grand Total' : grandTotal[c.key];
    });
    data.push(grandTotalRow);
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${report.reportName.replace(/[^a-z0-9]+/gi, '_')}_Combined.xlsx`);
    api.complianceReports.logDownload({ reportKey: report.reportKey, reportName: report.reportName, format: 'EXCEL', companyId: String(activeCompanyId), filters: filtersMeta(), rowCount: report.rows.length }).catch(() => {});
  };

  const exportCsvMulti = () => {
    if (!report?.rows?.length) return;
    const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const header = report.columns.map((c: any) => esc(c.label)).join(',');
    const lines: string[] = [header];
    
    Object.entries(groupedRows).forEach(([coName, rows]) => {
      lines.push(esc(`Company: ${coName}`) + ','.repeat(report.columns.length - 1));
      rows.forEach((row: any) => {
        lines.push(report.columns.map((c: any) => esc(row[c.key])).join(','));
      });
      const sub = companySubtotals[coName];
      lines.push(report.columns.map((c: any, idx: number) => esc(idx === 0 ? 'Company Subtotal' : sub[c.key])).join(','));
      lines.push('');
    });
    
    lines.push(report.columns.map((c: any, idx: number) => esc(idx === 0 ? 'Grand Total' : grandTotal[c.key])).join(','));
    
    const csv = '﻿' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${report.reportName.replace(/[^a-z0-9]+/gi, '_')}_Combined.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    api.complianceReports.logDownload({ reportKey: report.reportKey, reportName: report.reportName, format: 'CSV', companyId: String(activeCompanyId), filters: filtersMeta(), rowCount: report.rows.length }).catch(() => {});
  };

  const exportPdfMulti = async () => {
    if (!report?.rows?.length) return;
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: report.columns.length > 7 ? 'landscape' : 'portrait' });
    const W = doc.internal.pageSize.getWidth();
    let y = 15;
    
    doc.setFontSize(14); doc.setTextColor(20); doc.text('Super Admin Executive Report', 14, y); y += 6;
    doc.setFontSize(11); doc.setTextColor(60); doc.text(report.reportName, 14, y);
    doc.setFontSize(8); doc.setTextColor(90); doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString('en-IN')}`, W - 14, y, { align: 'right' }); y += 5;
    doc.setDrawColor(200); doc.line(14, y, W - 14, y); y += 6;
    
    const body: any[] = [];
    const specialRows: Record<number, 'header' | 'subtotal' | 'grandtotal'> = {};
    
    Object.entries(groupedRows).forEach(([coName, rows]) => {
      const headerIndex = body.length;
      specialRows[headerIndex] = 'header';
      const headerRow = Array(report.columns.length).fill('');
      headerRow[0] = `Company: ${coName}`;
      body.push(headerRow);
      
      rows.forEach((row: any) => {
        body.push(report.columns.map((c: any) => row[c.key] ?? ''));
      });
      
      const subIndex = body.length;
      specialRows[subIndex] = 'subtotal';
      const sub = companySubtotals[coName];
      body.push(report.columns.map((c: any, idx: number) => idx === 0 ? 'Company Subtotal' : (sub[c.key] ?? '')));
    });
    
    const grandIndex = body.length;
    specialRows[grandIndex] = 'grandtotal';
    body.push(report.columns.map((c: any, idx: number) => idx === 0 ? 'Grand Total' : (grandTotal[c.key] ?? '')));
    
    autoTable(doc, {
      startY: y,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [79, 70, 229] },
      head: [report.columns.map((c: any) => c.label)],
      body: body,
      didParseCell: (dataCell: any) => {
        const rowIndex = dataCell.row.index;
        if (specialRows[rowIndex] === 'header') {
          dataCell.cell.styles.fillColor = [226, 232, 240];
          dataCell.cell.styles.fontStyle = 'bold';
          dataCell.cell.styles.textColor = 30;
        } else if (specialRows[rowIndex] === 'subtotal') {
          dataCell.cell.styles.fillColor = [248, 250, 252];
          dataCell.cell.styles.fontStyle = 'bold';
          dataCell.cell.styles.textColor = 70;
        } else if (specialRows[rowIndex] === 'grandtotal') {
          dataCell.cell.styles.fillColor = [238, 242, 255];
          dataCell.cell.styles.fontStyle = 'bold';
          dataCell.cell.styles.textColor = [49, 46, 129];
        }
      },
      didDrawPage: (d: any) => {
        const page = doc.getNumberOfPages();
        const footY = doc.internal.pageSize.getHeight() - 6;
        doc.setFontSize(7); doc.setTextColor(120);
        const genLine = `Generated: ${new Date(report.generatedAt).toLocaleString('en-IN')}${report.generatedBy ? `  ·  By: ${report.generatedBy}` : ''}`;
        doc.text(genLine, 14, footY);
        doc.text(`Page ${d.pageNumber} of ${page}`, W - 14, footY, { align: 'right' });
      },
    });
    
    doc.save(`${report.reportName.replace(/[^a-z0-9]+/gi, '_')}_Combined.pdf`);
    api.complianceReports.logDownload({ reportKey: report.reportKey, reportName: report.reportName, format: 'PDF', companyId: String(activeCompanyId), filters: filtersMeta(), rowCount: report.rows.length }).catch(() => {});
  };

  const printReportMulti = () => {
    if (!report?.rows?.length) return;
    const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const head = report.columns.map((c: any) => `<th>${esc(c.label)}</th>`).join('');
    
    let bodyHtml = '';
    Object.entries(groupedRows).forEach(([coName, rows]) => {
      bodyHtml += `<tr class="co-hdr"><td colspan="${report.columns.length}"><strong>Company: ${esc(coName)}</strong></td></tr>`;
      rows.forEach((row: any) => {
        bodyHtml += `<tr>${report.columns.map((c: any) => `<td>${esc(row[c.key])}</td>`).join('')}</tr>`;
      });
      const sub = companySubtotals[coName];
      bodyHtml += `<tr class="sub-hdr">${report.columns.map((c: any, idx: number) => `<td><strong>${idx === 0 ? 'Company Subtotal' : esc(sub[c.key])}</strong></td>`).join('')}</tr>`;
    });
    
    bodyHtml += `<tr class="grand-hdr">${report.columns.map((c: any, idx: number) => `<td><strong>${idx === 0 ? 'Grand Total' : esc(grandTotal[c.key])}</strong></td>`).join('')}</tr>`;
    const genLine = `Generated: ${new Date(report.generatedAt).toLocaleString('en-IN')}${report.generatedBy ? ' &nbsp;·&nbsp; By: ' + esc(report.generatedBy) : ''}`;
    
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.reportName)}</title>
      <style>
        *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:24px;font-size:12px}
        .hdr{border-bottom:1px solid #cbd5e1;padding-bottom:10px;margin-bottom:6px}
        .co{font-size:16px;font-weight:700;margin:0}
        .rt{font-size:13px;font-weight:700;margin:10px 0 8px}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;font-size:10px}
        thead th{background:#4f46e5;color:#fff}
        .co-hdr td{background:#e2e8f0;font-size:11px}
        .sub-hdr td{background:#f8fafc;font-size:10px}
        .grand-hdr td{background:#eef2ff;font-size:11px;border-top:2px double #818cf8}
        @media print{body{margin:10mm}}
      </style></head><body>
      <div class="hdr">
        <p class="co">Super Admin Executive Report</p>
        <div class="rt">${esc(report.reportName)}</div>
      </div>
      <table><thead><tr>${head}</tr></thead><tbody>${bodyHtml}</tbody></table>
      <div style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:6px;font-size:10px;color:#475569">${genLine} &nbsp;·&nbsp; ${report.rows.length} record(s)</div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
      
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to print this report.'); return; }
    w.document.write(html); w.document.close();
    api.complianceReports.logDownload({ reportKey: report.reportKey, reportName: report.reportName, format: 'PRINT', companyId: String(activeCompanyId), filters: filtersMeta(), rowCount: report.rows.length }).catch(() => {});
  };

  // const openAudit = async () => { setShowAudit(s => !s); if (!showAudit) { try { setAudit(await api.complianceReports.audit() || []); } catch { setAudit([]); } } };

  // Reusable report card (used by Favourites and each category section).
  const renderReportCard = (r: any) => {
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
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="flex-1 text-[10px] h-7" icon={<Eye size={11} />} onClick={() => isSuperAdmin ? openConfigForReport(r.key, 'preview') : openTemplate(tpl, r.label)}>Preview</Button>
            <Button size="sm" className="flex-1 text-[10px] h-7" icon={<Zap size={11} />} onClick={() => isSuperAdmin ? openConfigForReport(r.key, 'generate') : openTemplate(tpl, r.label)}>Generate</Button>
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
          <Button variant="outline" size="sm" className="flex-1 text-[10px] h-7" icon={<Eye size={11} />} onClick={() => isSuperAdmin ? openConfigForReport(r.key, 'preview') : openPreview(r.key)} disabled={r.status === 'coming'}>Preview</Button>
          <Button size="sm" className="flex-1 text-[10px] h-7" icon={<Zap size={11} />} onClick={() => isSuperAdmin ? openConfigForReport(r.key, 'generate') : goGenerate(r.key)} disabled={!r.available}>Generate</Button>
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
        </div>
      </div>

      {toast && <div className={`px-4 py-2.5 rounded-lg text-xs font-semibold ${toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{toast.msg}</div>}

      {/* ─────────────── TEMPLATE GALLERY ─────────────── */}
      {mode === 'gallery' && (
        <div className="space-y-4">
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

          {metrics.recent.length > 0 && (
            <Card>
              <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><History size={15} className="text-slate-500" /> Recently Generated</h3>
              <div className="flex flex-wrap gap-2">
                {metrics.recent.map(rc => (
                  <button key={rc.key} onClick={() => isSuperAdmin ? openConfigForReport(rc.key, 'generate') : goGenerate(rc.key)} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 rounded-full px-3 py-1.5 transition-colors">
                    <FileText size={11} /> {rc.label}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {favReports.length > 0 && (
            <Card>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Star size={15} className="text-amber-400" fill="currentColor" /> Favourite Reports <span className="text-[10px] font-bold text-slate-400">({favReports.length})</span></h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{favReports.map(renderReportCard)}</div>
            </Card>
          )}

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
                {!report.isMultiCompany && (
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                    <button onClick={() => setPreviewMode('document')} className={`px-2.5 py-1.5 text-[11px] font-semibold ${previewMode === 'document' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Document</button>
                    <button onClick={() => setPreviewMode('data')} className={`px-2.5 py-1.5 text-[11px] font-semibold ${previewMode === 'data' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Data</button>
                  </div>
                )}
                {(previewMode === 'data' || report.isMultiCompany) && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" icon={<Printer size={13} />} onClick={report.isMultiCompany ? printReportMulti : printReport}>Print</Button>
                    <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={report.isMultiCompany ? exportExcelMulti : exportExcel}>Excel</Button>
                    <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={report.isMultiCompany ? exportPdfMulti : exportPdf}>PDF</Button>
                    <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={report.isMultiCompany ? exportCsvMulti : exportCsv}>CSV</Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Filters Area */}
          {isSuperAdmin ? (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 mb-4 text-xs shadow-sm">
              <p className="font-bold text-indigo-950 flex items-center gap-1.5 mb-2">
                <ShieldCheck size={14} className="text-indigo-600" /> Executive Report Scope
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-700">
                <div className="space-y-1 bg-white p-2.5 rounded-lg border border-indigo-100/50">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase">Tenant Scope</p>
                  <p className="font-semibold text-slate-800">
                    {coMode === 'single' 
                      ? `Single Company: ${activeCompanies.find(c => String(c.id) === String(singleCoId))?.name || 'None'}` 
                      : coMode === 'selected' 
                        ? `${selectedCoIds.length} Selected Companies` 
                        : 'All Active Companies (Entire Platform)'}
                  </p>
                  {selectedBrs.length > 0 && (
                    <p className="text-[10px] mt-1 text-slate-500">
                      <strong>Branches:</strong> {selectedBrs.join(', ')}
                    </p>
                  )}
                </div>
                <div className="space-y-1 bg-white p-2.5 rounded-lg border border-indigo-100/50">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase">Period &amp; Date Range</p>
                  <p className="font-semibold text-slate-800 capitalize">{dtPreset.replace('_', ' ')}</p>
                  <p className="text-[10px] text-slate-500">{customStart} to {customEnd}</p>
                </div>
              </div>
              
              {(cfgDept || cfgEmpId || cfgDesig || cfgStatus || cfgPayrollMonth || cfgLeaveType || cfgContract || cfgTender) && (
                <div className="mt-2.5 bg-white p-2.5 rounded-lg border border-indigo-100/50 space-y-1">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase">Applied Filters</p>
                  <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-slate-600">
                    {cfgDept && <span>Dept: {cfgDept}</span>}
                    {cfgEmpId && <span>Emp ID: {cfgEmpId}</span>}
                    {cfgDesig && <span>Designation: {cfgDesig}</span>}
                    {cfgStatus && <span>Status: {cfgStatus}</span>}
                    {cfgPayrollMonth && <span>Month: {cfgPayrollMonth}</span>}
                    {cfgLeaveType && <span>Leave: {cfgLeaveType}</span>}
                    {cfgContract && <span>Contract: {cfgContract}</span>}
                    {cfgTender && <span>Tender: {cfgTender}</span>}
                  </div>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button 
                  onClick={() => openConfigForReport(selectedKey || catalog[0]?.key, 'generate')}
                  className="flex-1 text-[10px] h-8 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50/50 font-bold rounded-lg px-3 flex items-center justify-center gap-1.5 transition-colors"
                >
                  Modify Scope &amp; Filters
                </button>
                <button 
                  onClick={handleGenerateConfigured}
                  className="flex-1 text-[10px] h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg px-3 flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  Regenerate Report
                </button>
              </div>
            </div>
          ) : (
            (() => {
              const f: string[] = selected?.filters || ['dateRange', 'branch', 'department', 'employee'];
              const fyOptions = [2026, 2025, 2024].map(y => ({ value: String(y), label: `FY ${y}-${String(y + 1).slice(2)}` }));
              return (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-1">
                  {f.includes('financialYear') && <Select label="Financial Year" value={startDate ? startDate.slice(0, 4) : ''} onChange={e => { const y = e.target.value; setStartDate(y ? `${y}-04-01` : ''); setEndDate(y ? `${Number(y) + 1}-03-31` : ''); }} options={[{ value: '', label: 'Select FY…' }, ...fyOptions]} />}
                  {f.includes('branch') && <Select label="Branch" value={branch} onChange={e => setBranch(e.target.value)} options={[{ value: '', label: 'All branches' }, ...branchOptions.map(b => ({ value: b, label: b }))]} />}
                  {f.includes('department') && <Select label="Department" value={department} onChange={e => setDepartment(e.target.value)} options={[{ value: '', label: 'All departments' }, ...deptOptions.map(d => ({ value: d, label: d }))]} />}
                  {f.includes('dateRange') && <Input label="From Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />}
                  {f.includes('dateRange') && <Input label="To Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />}
                  {f.includes('employee') && <Select label="Employee" value={employeeId} onChange={e => setEmployeeId(e.target.value)} options={[{ value: '', label: 'All employees' }, ...employees.map(e => ({ value: String(e.id), label: `${e.name} (${e.employeeId})` }))]} />}
                </div>
              );
            })()
          )}
          
          {!isSuperAdmin && selected && <p className="text-[10px] text-slate-400 mb-3">Showing only the filters relevant to <strong>{selected.label}</strong>.</p>}
          <Button icon={<Eye size={14} />} loading={busy} disabled={!selected?.available} onClick={isSuperAdmin ? () => openConfigForReport(selectedKey || catalog[0]?.key, 'generate') : generate}>
            {isSuperAdmin ? 'Configure & Generate' : 'Generate & Preview'}
          </Button>

          {/* Warnings */}
          {report?.warnings?.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800 space-y-1">
              {report.warnings.map((w: string, i: number) => <div key={i} className="flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />{w}</div>)}
            </div>
          )}

          {/* Preview Canvas */}
          {report && report.rows.length > 0 && (
            report.isMultiCompany ? (
              <div className="mt-4 space-y-3">
                <div className="text-[11px] text-slate-500 flex items-center justify-between flex-wrap gap-2 bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-2.5">
                  <span>
                    <strong>{report.rows.length}</strong> record(s) across <strong>{Object.keys(groupedRows).length}</strong> companies · generated {formatDateTime(report.generatedAt)}{report.generatedBy ? ` · by ${report.generatedBy}` : ''}
                  </span>
                  <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full text-[10px] tracking-wider uppercase">
                    Executive Multi-Company View
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[480px] border border-[#DBEAFE] rounded-xl shadow-sm bg-white">
                  <Table>
                    <Thead>
                      <Tr className="bg-indigo-600">
                        {report.columns.map((c: any) => <Th key={c.key} className="text-white font-bold text-xs py-3">{c.label}</Th>)}
                      </Tr>
                    </Thead>
                    <Tbody>
                      {Object.entries(groupedRows).map(([coName, rows]) => {
                        const sub = companySubtotals[coName];
                        return (
                          <React.Fragment key={coName}>
                            <Tr className="bg-slate-100 font-bold border-t border-b border-slate-200/80">
                              <Td colSpan={report.columns.length} className="py-2.5 px-3 text-slate-800 font-extrabold text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="w-1.5 h-3.5 bg-indigo-600 rounded"></span>
                                  Company: {coName}
                                </div>
                              </Td>
                            </Tr>
                            
                            {rows.map((row: any, i: number) => (
                              <Tr key={i} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                                {report.columns.map((c: any) => (
                                  <Td key={c.key} className="text-[11px] text-slate-600 py-2">
                                    {typeof row[c.key] === 'number' ? row[c.key].toLocaleString('en-IN') : String(row[c.key] ?? '')}
                                  </Td>
                                ))}
                              </Tr>
                            ))}
                            
                            <Tr className="bg-slate-50/60 font-semibold border-b border-slate-200">
                              {report.columns.map((c: any, idx: number) => (
                                <Td key={c.key} className="text-[11px] font-bold text-slate-700 py-2.5">
                                  {idx === 0 
                                    ? 'Company Subtotal' 
                                    : (sub[c.key] !== '' && typeof sub[c.key] === 'number' ? sub[c.key].toLocaleString('en-IN') : sub[c.key])}
                                </Td>
                              ))}
                            </Tr>
                          </React.Fragment>
                        );
                      })}
                      
                      <Tr className="bg-indigo-50 font-bold border-t-2 border-double border-indigo-200">
                        {report.columns.map((c: any, idx: number) => (
                          <Td key={c.key} className="text-xs font-extrabold text-indigo-950 py-3.5">
                            {idx === 0 
                              ? 'Grand Total' 
                              : (grandTotal[c.key] !== '' && typeof grandTotal[c.key] === 'number' ? grandTotal[c.key].toLocaleString('en-IN') : grandTotal[c.key])}
                          </Td>
                        ))}
                      </Tr>
                    </Tbody>
                  </Table>
                </div>
              </div>
            ) : (
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
                <div className="text-[11px] text-slate-500 mb-1.5">{report.rows.length} record(s) · generated {formatDateTime(report.generatedAt)}{report.generatedBy ? ` · by ${report.generatedBy}` : ''} · <span className="font-semibold text-slate-600">statutory format</span></div>
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
              <Tbody>{audit.map(a => (<Tr key={a.id}><Td><span className="text-[11px]">{formatDateTime(a.createdAt)}</span></Td><Td><Badge variant={a.action === 'DOWNLOAD' ? 'blue' : 'gray'}>{a.action}</Badge></Td><Td>{a.reportName}</Td><Td>{a.format || '—'}</Td><Td>{a.rowCount}</Td><Td>{a.performedByName || '—'}</Td></Tr>))}</Tbody></Table></div>
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

      {/* ─────────────── SUPER ADMIN REPORT CONFIGURATION DIALOG ─────────────── */}
      <Modal 
        open={configOpen} 
        onClose={() => setConfigOpen(false)} 
        title={`Report Configuration - ${catalog.find(r => r.key === configReportKey)?.label || templateForKey(configReportKey)?.catalogNames[0] || 'Configure Report'}`} 
        size="lg"
      >
        <div className="space-y-4 text-slate-700">
          <p className="text-xs text-slate-500 border-b border-slate-150 pb-2">
            Configure company scope, branches, period, and additional parameters to generate this executive report.
          </p>

          {validationErr && (
            <div className="bg-rose-50 text-rose-700 border border-rose-200 px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
              <AlertTriangle size={14} className="flex-shrink-0" /> {validationErr}
            </div>
          )}

          {/* Company Selection Mode */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">Company Scope</label>
            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-semibold">
                <input 
                  type="radio" 
                  name="coMode" 
                  checked={coMode === 'single'} 
                  onChange={() => { setCoMode('single'); setSelectedCoIds([]); setSelectedBrs([]); }} 
                  className="text-indigo-600 focus:ring-indigo-500" 
                />
                Single Company
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-semibold">
                <input 
                  type="radio" 
                  name="coMode" 
                  checked={coMode === 'selected'} 
                  onChange={() => { setCoMode('selected'); setSingleCoId(''); setSelectedBrs([]); }} 
                  className="text-indigo-600 focus:ring-indigo-500" 
                />
                Selected Companies
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-semibold">
                <input 
                  type="radio" 
                  name="coMode" 
                  checked={coMode === 'all'} 
                  onChange={() => { setCoMode('all'); setSingleCoId(''); setSelectedCoIds([]); setSelectedBrs([]); }} 
                  className="text-indigo-600 focus:ring-indigo-500" 
                />
                All Companies
              </label>
            </div>
          </div>

          {/* Searchable Single Dropdown */}
          {coMode === 'single' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">Select Company</label>
              <div className="relative">
                <div 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white cursor-pointer flex justify-between items-center shadow-sm"
                  onClick={() => setCoOpen(!coOpen)}
                >
                  <span className={singleCoId ? 'text-slate-800 font-semibold' : 'text-slate-400'}>
                    {singleCoId 
                      ? activeCompanies.find(c => String(c.id) === String(singleCoId))?.name || 'Select company...'
                      : 'Select company...'
                    }
                  </span>
                  <ChevronDown size={14} className="text-slate-400" />
                </div>
                
                {coOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 flex flex-col">
                    <div className="p-2 border-b border-slate-100 bg-slate-50">
                      <input
                        type="text"
                        value={coSearch}
                        onChange={e => setCoSearch(e.target.value)}
                        placeholder="Search company by name or code..."
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                    <div className="overflow-y-auto flex-1 max-h-48 divide-y divide-slate-50">
                      {activeCompanies.filter(c => 
                        c.name.toLowerCase().includes(coSearch.toLowerCase().trim()) || 
                        ((c as any).companyCode || '').toLowerCase().includes(coSearch.toLowerCase().trim())
                      ).length === 0 ? (
                        <div className="p-3 text-xs text-slate-400 text-center">No active companies found</div>
                      ) : (
                        activeCompanies.filter(c => 
                          c.name.toLowerCase().includes(coSearch.toLowerCase().trim()) || 
                          ((c as any).companyCode || '').toLowerCase().includes(coSearch.toLowerCase().trim())
                        ).map(c => (
                          <div
                            key={c.id}
                            className={`px-3 py-2 text-xs hover:bg-indigo-50 cursor-pointer flex justify-between items-center transition-colors ${String(c.id) === String(singleCoId) ? 'bg-indigo-50 font-bold text-indigo-700' : 'text-slate-700'}`}
                            onClick={() => {
                              setSingleCoId(String(c.id));
                              setCoOpen(false);
                              setCoSearch('');
                            }}
                          >
                            <span>{c.name}</span>
                            {(c as any).companyCode && <span className="text-[10px] text-slate-400 font-normal bg-slate-100 px-1.5 py-0.5 rounded">Code: {(c as any).companyCode}</span>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Searchable Multi-Select Dropdown with Checkboxes and Chips */}
          {coMode === 'selected' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">Select Companies</label>
              <div className="relative">
                <div 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white cursor-pointer flex justify-between items-center shadow-sm"
                  onClick={() => setCoOpen(!coOpen)}
                >
                  <span className="text-slate-400">
                    {selectedCoIds.length > 0 
                      ? `${selectedCoIds.length} company/companies selected`
                      : 'Select companies...'
                    }
                  </span>
                  <ChevronDown size={14} className="text-slate-400" />
                </div>
                
                {coOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 flex flex-col">
                    <div className="p-2 border-b border-slate-100 bg-slate-50">
                      <input
                        type="text"
                        value={coSearch}
                        onChange={e => setCoSearch(e.target.value)}
                        placeholder="Search company by name or code..."
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                    <div className="overflow-y-auto flex-1 max-h-48 divide-y divide-slate-50">
                      {activeCompanies.filter(c => 
                        c.name.toLowerCase().includes(coSearch.toLowerCase().trim()) || 
                        ((c as any).companyCode || '').toLowerCase().includes(coSearch.toLowerCase().trim())
                      ).length === 0 ? (
                        <div className="p-3 text-xs text-slate-400 text-center">No active companies found</div>
                      ) : (
                        activeCompanies.filter(c => 
                          c.name.toLowerCase().includes(coSearch.toLowerCase().trim()) || 
                          ((c as any).companyCode || '').toLowerCase().includes(coSearch.toLowerCase().trim())
                        ).map(c => {
                          const isChecked = selectedCoIds.includes(String(c.id));
                          return (
                            <div
                              key={c.id}
                              className="px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer flex items-center gap-2 text-slate-700 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isChecked) {
                                  setSelectedCoIds(selectedCoIds.filter(id => id !== String(c.id)));
                                } else {
                                  setSelectedCoIds([...selectedCoIds, String(c.id)]);
                                }
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <div className="flex-1 flex justify-between items-center">
                                <span>{c.name}</span>
                                {(c as any).companyCode && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Code: {(c as any).companyCode}</span>}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {selectedCoIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                  {selectedCoIds.map(id => {
                    const co = activeCompanies.find(c => String(c.id) === String(id));
                    if (!co) return null;
                    return (
                      <span key={id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2.5 py-0.5 rounded-full border border-indigo-150 font-bold shadow-sm">
                        <span>{co.name}</span>
                        <button 
                          onClick={() => setSelectedCoIds(selectedCoIds.filter(x => x !== id))}
                          className="hover:text-indigo-900 hover:bg-indigo-100 rounded-full p-0.5 transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Grouped Branch Selection Section */}
          {filteredBranches.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">Branch Filter (Optional)</label>
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 max-h-48 overflow-y-auto space-y-3 shadow-inner">
                {Object.entries(branchesByCompany).map(([coName, brs]) => (
                  <div key={coName} className="space-y-1 bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
                    <p className="text-[9px] font-extrabold text-indigo-600 uppercase tracking-widest border-b border-indigo-50 pb-1 mb-1.5">{coName}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {brs.map(br => {
                        const name = br.branchName || br.name;
                        const isChecked = selectedBrs.includes(name);
                        return (
                          <label key={br.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:text-slate-950 transition-colors">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedBrs([...selectedBrs, name]);
                                } else {
                                  setSelectedBrs(selectedBrs.filter(x => x !== name));
                                }
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="font-semibold">{name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Date Filters Section */}
          <div className="space-y-2 border-t border-slate-150 pt-3">
            <label className="block text-xs font-bold text-slate-800">Period &amp; Dates</label>
            <div className="flex flex-wrap gap-2 text-xs">
              {['today', 'yesterday', 'this_week', 'this_month', 'custom'].map(preset => (
                <button
                  key={preset}
                  onClick={() => handlePresetChange(preset)}
                  className={`px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all shadow-sm ${dtPreset === preset ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  {preset.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </button>
              ))}
            </div>

            {dtPreset === 'custom' && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <Input 
                  label="From Date" 
                  type="date" 
                  value={customStart} 
                  onChange={e => setCustomStart(e.target.value)} 
                />
                <Input 
                  label="To Date" 
                  type="date" 
                  value={customEnd} 
                  onChange={e => setCustomEnd(e.target.value)} 
                />
              </div>
            )}
          </div>

          {/* Additional Filters Section */}
          {(isFilterApplicable('department', configReportKey) || 
            isFilterApplicable('employee', configReportKey) || 
            isFilterApplicable('designation', configReportKey) || 
            isFilterApplicable('status', configReportKey) || 
            isFilterApplicable('payrollMonth', configReportKey) || 
            isFilterApplicable('leaveType', configReportKey) || 
            isFilterApplicable('contract', configReportKey) || 
            isFilterApplicable('tender', configReportKey)) && (
            <div className="space-y-3 border-t border-slate-150 pt-3">
              <label className="block text-xs font-bold text-slate-800">Additional Filters</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {isFilterApplicable('department', configReportKey) && (
                  <Select 
                    label="Department" 
                    value={cfgDept} 
                    onChange={e => setCfgDept(e.target.value)} 
                    options={[{ value: '', label: 'All Departments' }, ...deptOptions.map(d => ({ value: d, label: d }))]} 
                  />
                )}
                {isFilterApplicable('employee', configReportKey) && (
                  <Select 
                    label="Employee" 
                    value={cfgEmpId} 
                    onChange={e => setCfgEmpId(e.target.value)} 
                    options={[{ value: '', label: 'All Employees' }, ...employees.map(e => ({ value: String(e.id), label: `${e.name} (${e.employeeId})` }))]} 
                  />
                )}
                {isFilterApplicable('designation', configReportKey) && (
                  <Input 
                    label="Designation" 
                    value={cfgDesig} 
                    onChange={e => setCfgDesig(e.target.value)} 
                    placeholder="Enter designation..."
                  />
                )}
                {isFilterApplicable('status', configReportKey) && (
                  <Select 
                    label="Status" 
                    value={cfgStatus} 
                    onChange={e => setCfgStatus(e.target.value)} 
                    options={[
                      { value: '', label: 'All Statuses' },
                      { value: 'Active', label: 'Active Only' },
                      { value: 'Inactive', label: 'Inactive / Suspended' }
                    ]} 
                  />
                )}
                {isFilterApplicable('payrollMonth', configReportKey) && (
                  <Input 
                    label="Payroll Month" 
                    type="month"
                    value={cfgPayrollMonth} 
                    onChange={e => setCfgPayrollMonth(e.target.value)} 
                  />
                )}
                {isFilterApplicable('leaveType', configReportKey) && (
                  <Select 
                    label="Leave Type" 
                    value={cfgLeaveType} 
                    onChange={e => setCfgLeaveType(e.target.value)} 
                    options={[
                      { value: '', label: 'All Leave Types' },
                      { value: 'CL', label: 'Casual Leave (CL)' },
                      { value: 'SL', label: 'Sick Leave (SL)' },
                      { value: 'PL', label: 'Privilege Leave (PL)' },
                      { value: 'LWP', label: 'Leave Without Pay (LWP)' }
                    ]} 
                  />
                )}
                {isFilterApplicable('contract', configReportKey) && (
                  <Input 
                    label="Contract Reference" 
                    value={cfgContract} 
                    onChange={e => setCfgContract(e.target.value)} 
                    placeholder="Enter contract reference/ID..."
                  />
                )}
                {isFilterApplicable('tender', configReportKey) && (
                  <Input 
                    label="Tender Reference" 
                    value={cfgTender} 
                    onChange={e => setCfgTender(e.target.value)} 
                    placeholder="Enter tender reference/ID..."
                  />
                )}
              </div>
            </div>
          )}

          {/* Modal Buttons */}
          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-150">
            <button
              onClick={() => setConfigOpen(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-lg transition-colors shadow-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerateConfigured}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm flex items-center gap-1"
            >
              <Zap size={14} /> {configMode === 'preview' ? 'Confirm & Preview' : 'Confirm & Generate'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ComplianceReports;
