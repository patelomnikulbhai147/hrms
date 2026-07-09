// ─────────────────────────────────────────────────────────────────────────────
// Employee Card Designer — a template-based card studio that REPLACES the old
// single fixed design while preserving all of its behaviour (company-tree
// scoping, per-employee branding, active-employee filtering). HR can pick from
// 20 built-in templates, customise them in a drag-and-drop designer, preview
// live against any employee, and bulk-generate print-ready PDF / PNG / ZIP / QR.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import {
  IdCard, Search, Download, Printer, Layers, QrCode, LayoutGrid, Pencil, FileDown,
  Plus, Upload, FileImage, FileArchive, Check, Users,
} from 'lucide-react';
import type { Role, Company, Employee } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ui } from '@/components/ui/feedback';
import { DevelopmentBanner } from '@/components/ui/DevelopmentBanner';
import { usePermissions } from '@/context/PermissionContext';
import { isActiveEmployee } from '@/utils/employeeStatus';
import { resolveBranding } from '@/services/brandingService';
import { CardCanvas } from '@/components/cards/CardCanvas';
import { CardDesigner } from '@/components/cards/CardDesigner';
import { TemplateGallery } from '@/components/cards/TemplateGallery';
import { cardDimensions } from '@/types/cardDesigner';
import type { CardTemplate, CardSide } from '@/types/cardDesigner';
import { BUILTIN_BY_ID, DEFAULT_TEMPLATE_ID, cloneTemplate } from '@/data/cardTemplates';
import {
  loadTemplates, saveCustomTemplate, removeCustomTemplate, setDefaultTemplate, setTemplateShared,
  exportTemplateJson, parseImportedTemplate, type TemplateSet,
} from '@/store/cardTemplateStore';
import {
  exportCardsPdf, exportCardsZip, exportCardPng, exportQrZip, printCards,
  type CardItem, type SideMode, type PdfLayout,
} from '@/utils/cardExport';

interface Props { role: Role; activeCompanyId: string; companies: Company[]; employees: Employee[]; }
type Tab = 'generate' | 'templates' | 'designer';
type ScopeMode = 'selected' | 'department' | 'branch' | 'designation' | 'employmentType' | 'all';

const blankTemplate = (): CardTemplate => cloneTemplate({ ...BUILTIN_BY_ID['minimal-white'], id: `new_${Date.now()}`, name: 'Untitled Template', category: 'Custom', custom: true });

export const EmployeeCards: React.FC<Props> = ({ role, activeCompanyId, companies, employees }) => {
  const { canView } = usePermissions();
  const canEdit = ['Company Head', 'HR'].includes(role);
  const isSuperAdmin = role === 'Super Admin';

  const [tab, setTab] = useState<Tab>('generate');
  const [tset, setTset] = useState<TemplateSet>({ builtins: [], custom: [], all: [], defaultId: DEFAULT_TEMPLATE_ID });
  const [selectedTemplate, setSelectedTemplate] = useState<CardTemplate>(BUILTIN_BY_ID[DEFAULT_TEMPLATE_ID]);
  const [working, setWorking] = useState<CardTemplate | null>(null);
  const [previewTpl, setPreviewTpl] = useState<CardTemplate | null>(null);
  const [side, setSide] = useState<CardSide>('front');
  const [saving, setSaving] = useState(false);

  // Employee selection
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [scopeMode, setScopeMode] = useState<ScopeMode>('selected');
  const [scopeValue, setScopeValue] = useState('');

  // Generation options
  const [sideMode, setSideMode] = useState<SideMode>('both');
  const [pdfLayout, setPdfLayout] = useState<PdfLayout>('card');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // ── company-tree scoping (preserved from the original page) ──────────────────
  const company = useMemo(() => companies.find((c) => String(c.id) === String(activeCompanyId)) || companies[0], [companies, activeCompanyId]);
  const rootCompany = useMemo(() => (company?.parentCompanyId ? companies.find((c) => String(c.id) === String(company.parentCompanyId)) : company) || company, [companies, company]);
  const brand = rootCompany || company;
  const treeIds = useMemo(() => { const root = rootCompany || company; const set = new Set<string>(); if (root) set.add(String(root.id)); companies.forEach((c) => { if (root && String(c.parentCompanyId) === String(root.id)) set.add(String(c.id)); }); return set; }, [companies, rootCompany, company]);
  const treeBranchNames = useMemo(() => { const s = new Set<string>(); companies.forEach((c) => { if (!treeIds.has(String(c.id))) return; if ((c as any).branchName) s.add((c as any).branchName.toUpperCase().trim()); if (c.name) s.add(c.name.toUpperCase().trim()); }); return s; }, [companies, treeIds]);
  const belongsToTree = (e: Employee) => {
    if (e.companyId != null && treeIds.has(String(e.companyId))) return true;
    if ((e as any).branchId != null && treeIds.has(String((e as any).branchId))) return true;
    const bl = (e.branchLocation || '').toUpperCase().trim();
    return !!bl && treeBranchNames.has(bl);
  };
  const resolveCompany = (e: Employee): Company => {
    const own = companies.find((c) => String(c.id) === String(e.companyId)) || ((e as any).branchId ? companies.find((c) => String(c.id) === String((e as any).branchId)) : undefined);
    if (!own) return brand as Company;
    return own.parentCompanyId ? (companies.find((c) => String(c.id) === String(own.parentCompanyId)) || own) : own;
  };
  const brandFor = (e: Employee) => {
    const comp = resolveCompany(e); const b = resolveBranding(comp);
    return { branding: { companyName: b.companyName, logo: b.logo, tagline: (comp as any)?.tagline || (comp as any)?.slogan || '', watermarkImage: b.watermarkImage, signature: b.seal || b.signature, primaryColor: b.primaryColor }, companyId: comp?.id as any };
  };

  const scoped = useMemo(() => (employees || []).filter((e) => isActiveEmployee(e) && belongsToTree(e)), /* eslint-disable-next-line */ [employees, treeIds, treeBranchNames]);
  const departments = useMemo(() => Array.from(new Set(scoped.map((e) => e.department).filter(Boolean))).sort(), [scoped]);
  const branches = useMemo(() => Array.from(new Set(scoped.map((e) => (e as any).branchLocation || (e as any).location).filter(Boolean))).sort(), [scoped]);
  const designations = useMemo(() => Array.from(new Set(scoped.map((e) => e.designation).filter(Boolean))).sort(), [scoped]);
  const empTypes = useMemo(() => Array.from(new Set(scoped.map((e) => (e as any).employmentType || (e as any).category).filter(Boolean))).sort(), [scoped]);

  const filtered = useMemo(() => scoped.filter((e) => {
    if (deptFilter && e.department !== deptFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.name || '').toLowerCase().includes(q) || (e.employeeId || '').toLowerCase().includes(q) || (e.designation || '').toLowerCase().includes(q);
  }), [scoped, deptFilter, search]);

  const previewEmp = useMemo(() => scoped.find((e) => String(e.id) === String(selectedId)) || filtered[0] || scoped[0], [scoped, filtered, selectedId]);

  // Which employees a generation run targets, per the selected scope.
  const targets = useMemo(() => {
    switch (scopeMode) {
      case 'all': return scoped;
      case 'department': return scoped.filter((e) => e.department === scopeValue);
      case 'branch': return scoped.filter((e) => ((e as any).branchLocation || (e as any).location) === scopeValue);
      case 'designation': return scoped.filter((e) => e.designation === scopeValue);
      case 'employmentType': return scoped.filter((e) => ((e as any).employmentType || (e as any).category) === scopeValue);
      case 'selected':
      default: return bulkIds.length ? scoped.filter((e) => bulkIds.includes(String(e.id))) : (previewEmp ? [previewEmp] : []);
    }
  }, [scopeMode, scopeValue, scoped, bulkIds, previewEmp]);

  useEffect(() => { (async () => { const s = await loadTemplates(); setTset(s); const def = s.all.find((t) => t.id === s.defaultId) || BUILTIN_BY_ID[DEFAULT_TEMPLATE_ID]; setSelectedTemplate(def); })(); }, []);
  const reload = async () => { const s = await loadTemplates(); setTset(s); return s; };

  if (!canView('employees')) {
    return <Card><div className="py-12 text-center text-sm text-slate-500">You do not have permission to view Employee Cards.</div></Card>;
  }

  const toItems = (list: Employee[]): CardItem[] => list.map((e) => { const { branding, companyId } = brandFor(e); return { employee: e, branding, companyId }; });
  const withProgress = async (label: string, fn: (onp: (d: number, t: number) => void) => Promise<void>) => {
    setBusy(label); setProgress({ done: 0, total: targets.length });
    try { await fn((done, total) => setProgress({ done, total })); ui.toast.success('Done.'); }
    catch (e: any) { ui.toast.error(`Failed: ${e?.message || 'error'}`); }
    finally { setBusy(null); setProgress(null); }
  };

  const guardTargets = () => { if (!targets.length) { ui.toast.warning('No employees in the current selection.'); return false; } if (!selectedTemplate) { ui.toast.warning('Choose a template first.'); return false; } return true; };

  const doPdf = () => guardTargets() && withProgress('pdf', (onp) => exportCardsPdf(selectedTemplate, toItems(targets), { sideMode, layout: pdfLayout, fileName: `employee-cards-${selectedTemplate.id}.pdf`, onProgress: onp }));
  const doZip = () => guardTargets() && withProgress('zip', (onp) => exportCardsZip(selectedTemplate, toItems(targets), { sideMode, fileName: 'employee-cards.zip', onProgress: onp }));
  const doQrZip = () => guardTargets() && withProgress('qr', (onp) => exportQrZip(toItems(targets), 'employee-qr-codes.zip', onp));
  const doPrint = () => guardTargets() && withProgress('print', (onp) => printCards(selectedTemplate, toItems(targets), { sideMode, layout: pdfLayout, onProgress: onp }));
  const doPng = async () => { if (!previewEmp) return; const { branding, companyId } = brandFor(previewEmp); setBusy('png'); try { await exportCardPng(selectedTemplate, { employee: previewEmp, branding, companyId }, side, `${(previewEmp.employeeId || 'employee')}-${side}.png`); } catch (e: any) { ui.toast.error(e?.message || 'error'); } finally { setBusy(null); } };

  // ── template actions ─────────────────────────────────────────────────────────
  const useTpl = (t: CardTemplate) => { setSelectedTemplate(t); setTab('generate'); ui.toast.success(`Template “${t.name}” selected.`); };
  const editTpl = (t: CardTemplate) => { setWorking(cloneTemplate(t)); setTab('designer'); };
  const previewOf = (t: CardTemplate) => setPreviewTpl(t);
  const duplicateTpl = async (t: CardTemplate) => {
    if (!canEdit) return;
    const copy = { ...cloneTemplate(t), id: `new_${Date.now()}`, name: `${t.name} (Copy)`, category: 'Custom', custom: true, dbId: undefined, isDefault: false, shared: false };
    try { const saved = await saveCustomTemplate(copy); await reload(); setSelectedTemplate(saved); ui.toast.success('Template duplicated.'); }
    catch (e: any) { ui.toast.error(e?.message || 'Could not duplicate.'); }
  };
  const deleteTpl = async (t: CardTemplate) => {
    if (!t.dbId) return;
    if (!(await ui.confirm({ message: `Delete template “${t.name}”?`, variant: 'danger', confirmText: 'Delete' }))) return;
    try { await removeCustomTemplate(t.dbId); await reload(); ui.toast.success('Template deleted.'); }
    catch (e: any) { ui.toast.error(e?.message || 'Could not delete.'); }
  };
  const makeDefault = async (t: CardTemplate) => { if (!t.dbId) return; try { await setDefaultTemplate(t.dbId); await reload(); ui.toast.success(`“${t.name}” is now the default template.`); } catch (e: any) { ui.toast.error(e?.message || 'error'); } };
  const shareTpl = async (t: CardTemplate) => { if (!t.dbId) return; try { await setTemplateShared(t.dbId, !t.shared); await reload(); ui.toast.success(t.shared ? 'Unshared.' : 'Shared to all companies.'); } catch (e: any) { ui.toast.error(e?.message || 'error'); } };

  const saveWorking = async () => {
    if (!working) return;
    setSaving(true);
    try { const saved = await saveCustomTemplate(working); const s = await reload(); setSelectedTemplate(saved); setWorking(cloneTemplate(saved)); void s; ui.toast.success('Template saved.'); }
    catch (e: any) { ui.toast.error(e?.message || 'Could not save the template.'); }
    finally { setSaving(false); }
  };
  const importTemplate = (file?: File | null) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { try { const t = parseImportedTemplate(JSON.parse(String(r.result))); if (!t) return ui.toast.error('Not a valid card template file.'); setWorking(t); setTab('designer'); ui.toast.success('Template imported — review and save.'); } catch { ui.toast.error('Could not read that file.'); } };
    r.readAsText(file);
  };

  // Contain a template inside a fixed box (like object-fit: contain) so portrait
  // and landscape cards share one box, centred, never cropped or stretched — the
  // renderer derives the scale from each template's own dimensions/orientation
  // (cardDimensions), never from hardcoded per-card sizes.
  const fitScale = (t: CardTemplate, boxW: number, boxH: number) => { const d = cardDimensions(t.size, t.orientation); return Math.min(boxW / d.w, boxH / d.h); };
  const pv = previewEmp ? brandFor(previewEmp) : { branding: {}, companyId: undefined as any };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'generate', label: 'Generate & Preview', icon: <QrCode size={14} /> },
    { id: 'templates', label: 'Template Gallery', icon: <LayoutGrid size={14} /> },
    { id: 'designer', label: 'Designer', icon: <Pencil size={14} /> },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-[14px] border border-[#E6E0FE] shadow-sm">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E0FE]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600"><IdCard size={20} /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Employee Card Designer</h2>
              <p className="text-xs text-slate-500">Choose a template, customise it, preview live and generate print-ready cards — {brand?.name || 'your company'}.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="indigo">{scoped.length} employees</Badge>
            <Button size="sm" variant="outline" icon={<LayoutGrid size={14} />} onClick={() => setTab('templates')}>Choose Template</Button>
          </div>
        </div>
        <div className="px-5 py-2 flex flex-wrap gap-1 border-b border-slate-100">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg ${tab === t.id ? 'bg-[#F3F0FF] text-[#6C3CF0]' : 'text-slate-500 hover:text-slate-700'}`}>{t.icon}{t.label}</button>
          ))}
          <div className="ml-auto flex items-center gap-2 py-1">
            <span className="text-[11px] text-slate-400">Active template:</span>
            <span className="text-[11px] font-bold text-slate-700">{selectedTemplate?.name}</span>
          </div>
        </div>
      </div>

      <DevelopmentBanner status="development" message="Employee Cards is under active development. Additional card templates, branding options, QR enhancements, and bulk generation features are currently being implemented. Existing functionality is safe to use." />

      {/* ── GENERATE & PREVIEW (3 panels) ── */}
      {tab === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr_1.4fr] gap-4">
          {/* Left: employees + scope */}
          <Card>
            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-600"><Users size={14} className="text-brand-600" /> Employees</div>
            <div className="space-y-2 mb-3">
              <Select value={scopeMode} onChange={(e) => { setScopeMode(e.target.value as ScopeMode); setScopeValue(''); }}
                options={[
                  { value: 'selected', label: 'Selected employees' },
                  { value: 'department', label: 'By Department' },
                  { value: 'branch', label: 'By Branch' },
                  { value: 'designation', label: 'By Designation' },
                  { value: 'employmentType', label: 'By Employment Type' },
                  { value: 'all', label: 'All Employees' },
                ]} />
              {scopeMode === 'department' && <Select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} options={[{ value: '', label: 'Choose department…' }, ...departments.map((d) => ({ value: d, label: d }))]} />}
              {scopeMode === 'branch' && <Select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} options={[{ value: '', label: 'Choose branch…' }, ...branches.map((d) => ({ value: d, label: d }))]} />}
              {scopeMode === 'designation' && <Select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} options={[{ value: '', label: 'Choose designation…' }, ...designations.map((d) => ({ value: d, label: d }))]} />}
              {scopeMode === 'employmentType' && <Select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} options={[{ value: '', label: 'Choose type…' }, ...empTypes.map((d) => ({ value: d, label: d }))]} />}
              <Input icon={<Search size={14} />} placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)} />
              {scopeMode === 'selected' && <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} options={[{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]} />}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span>{scopeMode === 'selected' ? `${bulkIds.length || (previewEmp ? 1 : 0)} selected` : `${targets.length} in scope`}</span>
              {scopeMode === 'selected' && <button className="text-[#6C3CF0] font-semibold" onClick={() => setBulkIds(bulkIds.length ? [] : filtered.map((e) => String(e.id)))}>{bulkIds.length ? 'Clear' : 'Select all'}</button>}
            </div>
            <div className="max-h-[460px] overflow-y-auto space-y-1">
              {filtered.length === 0 && <p className="text-xs text-slate-400 py-6 text-center">No employees match.</p>}
              {filtered.map((e) => {
                const id = String(e.id); const isSel = String(previewEmp?.id) === id;
                return (
                  <div key={id} onClick={() => setSelectedId(id)} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer ${isSel ? 'bg-brand-50 border-brand-200' : 'border-transparent hover:bg-slate-50'}`}>
                    {scopeMode === 'selected' && <input type="checkbox" checked={bulkIds.includes(id)} onClick={(ev) => ev.stopPropagation()} onChange={() => setBulkIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])} />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{e.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{e.employeeId} · {e.designation}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Middle: template chooser (compare) — fills the panel height and
              scrolls independently; the Live Preview on the right stays put. */}
          <Card className="flex flex-col min-h-[480px] max-h-[760px]">
            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-600 flex-shrink-0"><LayoutGrid size={14} className="text-brand-600" /> Templates <span className="text-slate-400 font-normal">· click to apply</span></div>
            <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-2 pr-1 auto-rows-min content-start">
              {tset.all.map((t) => (
                <button key={t.id} onClick={() => setSelectedTemplate(t)} className={`rounded-xl border p-2 text-left transition ${selectedTemplate?.id === t.id ? 'border-[#6C3CF0] ring-1 ring-[#6C3CF0]/30 bg-[#F3F0FF]' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center justify-center bg-slate-50 rounded-lg p-2 h-[104px] overflow-hidden">
                    <CardCanvas template={t} side="front" employee={previewEmp} branding={pv.branding} companyId={pv.companyId} sample scale={fitScale(t, 140, 88)} style={{ boxShadow: '0 1px 5px rgba(0,0,0,.12)', borderRadius: 6 }} />
                  </div>
                  <p className="mt-1.5 text-[10px] font-bold text-slate-700 truncate flex items-center gap-1">{selectedTemplate?.id === t.id && <Check size={10} className="text-[#6C3CF0]" />}{t.name}</p>
                  <p className="text-[9px] text-slate-400">{t.category}{t.custom ? ' · Custom' : ''}</p>
                </button>
              ))}
            </div>
          </Card>

          {/* Right: live preview + generation */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600"><QrCode size={14} className="text-brand-600" /> Live Preview</div>
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                {(['front', 'back'] as const).map((s) => <button key={s} onClick={() => setSide(s)} className={`px-2.5 py-1 text-[11px] font-bold ${side === s ? 'bg-[#6C3CF0] text-white' : 'text-slate-500'}`}>{s === 'front' ? 'Front' : 'Back'}</button>)}
              </div>
            </div>
            {!previewEmp ? <div className="py-16 text-center text-sm text-slate-400">Select an employee to preview.</div> : (
              <div className="flex flex-wrap items-center justify-center gap-4 py-4 px-2 bg-slate-50 rounded-xl">
                <div className="text-center"><CardCanvas template={selectedTemplate} side="front" employee={previewEmp} branding={pv.branding} companyId={pv.companyId} scale={fitScale(selectedTemplate, 320, 300)} style={{ boxShadow: '0 6px 22px rgba(0,0,0,.16)', borderRadius: 10 }} /><p className="mt-1.5 text-[10px] font-bold text-slate-400 uppercase">Front</p></div>
                <div className="text-center"><CardCanvas template={selectedTemplate} side="back" employee={previewEmp} branding={pv.branding} companyId={pv.companyId} scale={fitScale(selectedTemplate, 320, 300)} style={{ boxShadow: '0 6px 22px rgba(0,0,0,.16)', borderRadius: 10 }} /><p className="mt-1.5 text-[10px] font-bold text-slate-400 uppercase">Back</p></div>
              </div>
            )}

            {/* Generation options */}
            <div className="mt-3 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-slate-400 font-bold">Sides</span>
                {(['front', 'back', 'both'] as SideMode[]).map((s) => <button key={s} onClick={() => setSideMode(s)} className={`px-2 py-1 rounded-lg border font-semibold capitalize ${sideMode === s ? 'border-[#6C3CF0] text-[#6C3CF0] bg-[#F3F0FF]' : 'border-slate-200 text-slate-500'}`}>{s}</button>)}
                <span className="text-slate-400 font-bold ml-2">Layout</span>
                {([['card', 'Card'], ['sheet', 'A4 Sheet'], ['duplex', 'Duplex']] as [PdfLayout, string][]).map(([v, l]) => <button key={v} onClick={() => setPdfLayout(v)} className={`px-2 py-1 rounded-lg border font-semibold ${pdfLayout === v ? 'border-[#6C3CF0] text-[#6C3CF0] bg-[#F3F0FF]' : 'border-slate-200 text-slate-500'}`}>{l}</button>)}
              </div>

              {progress && <div className="text-[11px] text-slate-500">Generating {progress.done}/{progress.total}… <div className="mt-1 h-1.5 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-[#6C3CF0]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div></div>}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={<Download size={13} />} loading={busy === 'pdf'} onClick={doPdf}>PDF{targets.length > 1 ? ` (${targets.length})` : ''}</Button>
                <Button size="sm" variant="outline" icon={<Printer size={13} />} loading={busy === 'print'} onClick={doPrint}>Print</Button>
                <Button size="sm" variant="outline" icon={<FileImage size={13} />} loading={busy === 'png'} onClick={doPng}>PNG</Button>
                <Button size="sm" variant="outline" icon={<FileArchive size={13} />} loading={busy === 'zip'} onClick={doZip}>ZIP</Button>
                <Button size="sm" variant="outline" icon={<QrCode size={13} />} loading={busy === 'qr'} onClick={doQrZip}>QR Codes</Button>
                <Button size="sm" variant="outline" icon={<Layers size={13} />} loading={busy === 'pdf'} onClick={doPdf}>Bulk Generate</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── TEMPLATE GALLERY ── */}
      {tab === 'templates' && (
        <div className="space-y-3">
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<Plus size={14} />} onClick={() => { setWorking(blankTemplate()); setTab('designer'); }}>New Blank Template</Button>
              <label className="inline-flex">
                <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { importTemplate(e.target.files?.[0]); e.target.value = ''; }} />
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-600 hover:border-[#6C3CF0] cursor-pointer"><Upload size={14} /> Import Template</span>
              </label>
            </div>
          )}
          <TemplateGallery templates={tset.all} activeId={selectedTemplate?.id} sample={previewEmp} branding={pv.branding} companyId={pv.companyId}
            canEdit={canEdit} isSuperAdmin={isSuperAdmin}
            onUse={useTpl} onPreview={previewOf} onEdit={editTpl} onDuplicate={duplicateTpl} onDelete={deleteTpl} onSetDefault={makeDefault} onShare={shareTpl} />
        </div>
      )}

      {/* ── DESIGNER ── */}
      {tab === 'designer' && (
        working ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Editing <b className="text-slate-700">{working.name}</b>{working.dbId ? '' : ' (unsaved — Save to keep it)'} </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" icon={<FileDown size={13} />} onClick={() => exportTemplateJson(working)}>Export JSON</Button>
                <Button size="sm" variant="outline" onClick={() => { setWorking(null); setTab('templates'); }}>Close</Button>
              </div>
            </div>
            <CardDesigner template={working} onChange={setWorking} employee={previewEmp} branding={pv.branding} companyId={pv.companyId} onSave={saveWorking} saving={saving} canEdit={canEdit} />
          </div>
        ) : (
          <Card><div className="py-16 text-center text-sm text-slate-400">Pick a template to edit from the <button className="text-[#6C3CF0] font-bold" onClick={() => setTab('templates')}>Template Gallery</button>, or create a new blank one.</div></Card>
        )
      )}

      {/* Preview modal */}
      {previewTpl && (
        <Modal open onClose={() => setPreviewTpl(null)} title={previewTpl.name} size="lg"
          footer={<><Button variant="outline" size="sm" onClick={() => setPreviewTpl(null)}>Close</Button>{canEdit && <Button variant="outline" size="sm" onClick={() => { editTpl(previewTpl); setPreviewTpl(null); }}>Edit</Button>}<Button size="sm" onClick={() => { useTpl(previewTpl); setPreviewTpl(null); }}>Use Template</Button></>}>
          <div className="flex flex-wrap items-center justify-center gap-6 py-4">
            <div className="text-center"><CardCanvas template={previewTpl} side="front" employee={previewEmp} branding={pv.branding} companyId={pv.companyId} sample scale={fitScale(previewTpl, 380, 360)} style={{ boxShadow: '0 8px 30px rgba(0,0,0,.2)', borderRadius: 12 }} /><p className="mt-2 text-[11px] font-bold text-slate-400 uppercase">Front</p></div>
            <div className="text-center"><CardCanvas template={previewTpl} side="back" employee={previewEmp} branding={pv.branding} companyId={pv.companyId} sample scale={fitScale(previewTpl, 380, 360)} style={{ boxShadow: '0 8px 30px rgba(0,0,0,.2)', borderRadius: 12 }} /><p className="mt-2 text-[11px] font-bold text-slate-400 uppercase">Back</p></div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default EmployeeCards;
