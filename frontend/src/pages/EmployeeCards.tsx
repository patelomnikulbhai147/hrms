// ─────────────────────────────────────────────────────────────────────────────
// Employee Cards — a template-based card studio that REPLACES the old single
// fixed design while preserving all of its behaviour (company-tree scoping,
// per-employee branding, active-employee filtering). HR can pick from 20
// built-in templates in the gallery, preview live against any employee, and
// bulk-generate print-ready PDF / PNG / ZIP / QR.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import {
  IdCard, Search, Download, Printer, Layers, QrCode, LayoutGrid,
  FileImage, FileArchive, Users, Contact, Upload,
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
import { CardTemplateEditor } from '@/components/cards/CardTemplateEditor';
import { TemplateGallery } from '@/components/cards/TemplateGallery';
import { UploadTemplateModal } from '@/components/cards/UploadTemplateModal';
import { EmployeeInfoCards } from '@/components/cards/EmployeeInfoCards';
import { cardDimensions } from '@/types/cardDesigner';
import type { CardTemplate, CardSide } from '@/types/cardDesigner';
import { BUILTIN_BY_ID, DEFAULT_TEMPLATE_ID, cloneTemplate } from '@/data/cardTemplates';
import {
  loadTemplates, saveCustomTemplate, removeCustomTemplate, setDefaultTemplate, setTemplateShared,
  getActiveTemplateId, setActiveTemplateId,
  type TemplateSet,
} from '@/store/cardTemplateStore';
import {
  exportCardsPdf, exportCardsZip, exportCardPng, exportQrZip, printCards,
  type CardItem, type SideMode, type PdfLayout,
} from '@/utils/cardExport';

interface Props {
  role: Role; activeCompanyId: string; companies: Company[]; employees: Employee[];
  /** Opens the real employee profile in the Employees module. */
  onOpenProfile?: (employeeId: string) => void;
}
/** The two sections of the module. Information Cards = dashboard summary; ID Cards = the printable studio. */
type Section = 'info' | 'id';
type Tab = 'generate' | 'templates';

export const EmployeeCards: React.FC<Props> = ({ role, activeCompanyId, companies, employees, onOpenProfile }) => {
  const { canView } = usePermissions();
  const isSuperAdmin = role === 'Super Admin';
  // Template authoring (Edit / Duplicate / Save) — Super Admin, Company Head, HR.
  const canEdit = isSuperAdmin || ['Company Head', 'HR'].includes(role);

  const [section, setSection] = useState<Section>('info');
  // The Information Cards tab fetches once; keep it mounted after the first visit
  // so switching back is instant and never refetches.
  const [infoVisited, setInfoVisited] = useState(true);
  const [tab, setTab] = useState<Tab>('generate');
  const [tset, setTset] = useState<TemplateSet>({ builtins: [], custom: [], all: [], defaultId: DEFAULT_TEMPLATE_ID });
  const [selectedTemplate, setSelectedTemplate] = useState<CardTemplate>(BUILTIN_BY_ID[DEFAULT_TEMPLATE_ID]);
  const [previewTpl, setPreviewTpl] = useState<CardTemplate | null>(null);
  const [editingTpl, setEditingTpl] = useState<CardTemplate | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Employee selection
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [bulkIds, setBulkIds] = useState<string[]>([]);

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
  // Only Department is offered as a filter here; branch/designation/type lists
  // went with the scope selector they existed to populate.
  const departments = useMemo(() => Array.from(new Set(scoped.map((e) => e.department).filter(Boolean))).sort(), [scoped]);

  const filtered = useMemo(() => scoped.filter((e) => {
    if (deptFilter && e.department !== deptFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.name || '').toLowerCase().includes(q) || (e.employeeId || '').toLowerCase().includes(q) || (e.designation || '').toLowerCase().includes(q);
  }), [scoped, deptFilter, search]);

  const previewEmp = useMemo(() => scoped.find((e) => String(e.id) === String(selectedId)) || filtered[0] || scoped[0], [scoped, filtered, selectedId]);

  // Which employees a generation run targets: whatever is ticked in the list.
  // Nothing ticked → the employee currently previewed, so "Generate" always has
  // an obvious subject. Bulk runs are done by narrowing with the Search /
  // Department filters and pressing "Select all".
  const targets = useMemo(
    () => (bulkIds.length ? scoped.filter((e) => bulkIds.includes(String(e.id))) : (previewEmp ? [previewEmp] : [])),
    [scoped, bulkIds, previewEmp]
  );

  // Resolve THE active template for this company: the persisted active id wins,
  // then the custom default, then the shipped default — so Generate & Preview and
  // the gallery always agree on a single active design. Re-runs when the workspace
  // changes so each company shows its own active template.
  useEffect(() => { (async () => {
    const s = await loadTemplates(); setTset(s);
    const activeId = await getActiveTemplateId(activeCompanyId);
    const resolved = (activeId && s.all.find((t) => t.id === activeId))
      || s.all.find((t) => t.id === s.defaultId)
      || BUILTIN_BY_ID[DEFAULT_TEMPLATE_ID];
    setSelectedTemplate(resolved);
  })(); }, [activeCompanyId]);
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
  // PNG follows the same "Sides" choice as the other exports. 'both' writes two
  // files rather than silently dropping one — the old toggle could only ever
  // produce a single side, and which one was not obvious from the screen.
  const doPng = async () => {
    if (!previewEmp) return;
    const { branding, companyId } = brandFor(previewEmp);
    const sides: CardSide[] = sideMode === 'both' ? ['front', 'back'] : [sideMode];
    setBusy('png');
    try {
      for (const s of sides) {
        await exportCardPng(selectedTemplate, { employee: previewEmp, branding, companyId }, s, `${(previewEmp.employeeId || 'employee')}-${s}.png`);
      }
    } catch (e: any) { ui.toast.error(e?.message || 'error'); } finally { setBusy(null); }
  };

  // ── template actions ─────────────────────────────────────────────────────────
  // Apply = make this the company's single ACTIVE template. Confirms, persists to
  // the DB, then refreshes Generate & Preview (which shows only the active template)
  // and the gallery "In Use" badge. Only Company Head / HR may change it.
  const applyTemplate = async (t: CardTemplate) => {
    if (!t) return;
    if (t.id === selectedTemplate?.id) { setPreviewTpl(null); setTab('generate'); return; } // already active
    if (!canEdit) { ui.toast.warning('You do not have permission to change the active template.'); return; }
    const confirmed = await ui.confirm({
      title: 'Change Active Template',
      message: `Are you sure you want to make “${t.name}” the active Employee ID Card template?`,
      confirmText: 'Apply Template',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;
    const prev = selectedTemplate;
    setSelectedTemplate(t);          // optimistic: label + gallery badge + preview update at once
    setPreviewTpl(null);
    setTab('generate');              // refresh Generate & Preview to the new active template
    try {
      await setActiveTemplateId(activeCompanyId, t.id);
      ui.toast.success(`“${t.name}” is now the active template.`);
    } catch (e: any) {
      setSelectedTemplate(prev);     // revert if the server rejected the change
      ui.toast.error(e?.message || 'Could not set the active template.');
    }
  };
  const previewOf = (t: CardTemplate) => setPreviewTpl(t);
  // Open the dedicated Template Editor on a working copy (never edits the gallery
  // in place). Editing a template does NOT change the active template.
  const editTpl = (t: CardTemplate) => { setPreviewTpl(null); setEditingTpl(cloneTemplate(t)); };

  // Upload a company's own artwork as a new template, then drop the admin
  // straight into the mapping editor — the design is useless until the dynamic
  // fields sit where it expects them, so making that a separate step the user
  // has to discover would be a trap.
  const saveUploadedTpl = async (t: CardTemplate) => {
    const saved = await saveCustomTemplate(t);
    const s = await reload();
    const fresh = s.all.find((x) => x.dbId === saved.dbId || x.id === saved.id) || saved;
    ui.toast.success('Template uploaded — now drag the fields onto your design.');
    setEditingTpl(cloneTemplate(fresh));
  };
  // After a save: refresh the gallery and, if the ACTIVE template was edited in
  // place, adopt its new design in Generate & Preview — without changing which
  // template is active.
  const onTemplateSaved = async (saved: CardTemplate) => {
    const s = await reload();
    const fresh = s.all.find((t) => t.id === saved.id) || saved;
    if (selectedTemplate && (selectedTemplate.id === saved.id || (selectedTemplate.dbId != null && selectedTemplate.dbId === saved.dbId))) {
      setSelectedTemplate(fresh);
    }
    setEditingTpl(cloneTemplate(fresh)); // keep editing the saved template (now with its dbId)
  };
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

  // Contain a template inside a fixed box (like object-fit: contain) so portrait
  // and landscape cards share one box, centred, never cropped or stretched — the
  // renderer derives the scale from each template's own dimensions/orientation
  // (cardDimensions), never from hardcoded per-card sizes.
  const fitScale = (t: CardTemplate, boxW: number, boxH: number) => { const d = cardDimensions(t.size, t.orientation); return Math.min(boxW / d.w, boxH / d.h); };
  const pv = previewEmp ? brandFor(previewEmp) : { branding: {}, companyId: undefined as any };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'generate', label: 'Generate & Preview', icon: <QrCode size={14} /> },
    { id: 'templates', label: 'Template Gallery', icon: <LayoutGrid size={14} /> },
  ];
  const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'info', label: 'Employee Information Cards', icon: <Contact size={14} /> },
    { id: 'id', label: 'Employee ID Cards', icon: <IdCard size={14} /> },
  ];
  const isId = section === 'id';

  // Falls back to the Employees module when the host page supplied no handler.
  const openProfile = (employeeId: string) => {
    if (onOpenProfile) return onOpenProfile(employeeId);
    ui.toast.info('Open the Employees module to view this profile.');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-[14px] border border-[#F7E3D3] shadow-sm">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#F7E3D3]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600"><IdCard size={20} /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Employee Cards</h2>
              <p className="text-xs text-slate-500">
                {isId
                  ? `Choose a template, customise it, preview live and generate print-ready cards — ${brand?.name || 'your company'}.`
                  : `Summary of every active employee — salary, attendance and leave at a glance — ${brand?.name || 'your company'}.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="indigo">{scoped.length} employees</Badge>
            {isId && <Button size="sm" variant="outline" icon={<LayoutGrid size={14} />} onClick={() => setTab('templates')}>Choose Template</Button>}
          </div>
        </div>

        {/* ── The two sections of this module ── */}
        <div className="px-5 pt-2 flex flex-wrap gap-1">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => { setSection(s.id); if (s.id === 'info') setInfoVisited(true); }}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-t-lg nav-tab ${section === s.id ? 'nav-tab-active' : ''}`}>
              {s.icon}{s.label}
            </button>
          ))}
        </div>

        {/* ID-card sub-tabs (unchanged) */}
        {isId && (
          <div className="px-5 py-2 flex flex-wrap gap-1 border-t border-slate-100">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 text-xs seg-tab ${tab === t.id ? 'seg-tab-active' : ''}`}>{t.icon}{t.label}</button>
            ))}
            <div className="ml-auto flex items-center gap-2 py-1">
              <span className="text-[11px] text-slate-400">Active template:</span>
              <span className="text-[11px] font-bold text-slate-700">{selectedTemplate?.name}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── EMPLOYEE INFORMATION CARDS ──
          Kept mounted once visited so switching sections never refetches. */}
      {infoVisited && (
        <div style={{ display: isId ? 'none' : undefined }}>
          <EmployeeInfoCards employees={scoped} activeCompanyId={activeCompanyId} onOpenProfile={openProfile} />
        </div>
      )}

      {isId && <>
      <DevelopmentBanner status="development" message="Employee ID Cards is under active development. Additional card templates, branding options, QR enhancements, and bulk generation features are currently being implemented. Existing functionality is safe to use." />

      {/* ── GENERATE & PREVIEW (2 panels) ──
          Shows ONLY the active template. Template switching lives in the gallery. */}
      {tab === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-4">
          {/* Left: filter the roster, tick who gets a card */}
          <Card>
            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-600"><Users size={14} className="text-brand-600" /> Employees</div>
            {/* Search + Department narrow the list; the tick boxes decide who is
                generated. "Select all" applies to whatever the filters left. */}
            <div className="space-y-2 mb-3">
              <Input icon={<Search size={14} />} placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} options={[{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span>{bulkIds.length || (previewEmp ? 1 : 0)} selected</span>
              <button className="text-[#C77E52] font-semibold" onClick={() => setBulkIds(bulkIds.length ? [] : filtered.map((e) => String(e.id)))}>{bulkIds.length ? 'Clear' : 'Select all'}</button>
            </div>
            <div className="max-h-[460px] overflow-y-auto space-y-1">
              {filtered.length === 0 && <p className="text-xs text-slate-400 py-6 text-center">No employees match.</p>}
              {filtered.map((e) => {
                const id = String(e.id); const isSel = String(previewEmp?.id) === id;
                return (
                  <div key={id} onClick={() => setSelectedId(id)} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer ${isSel ? 'bg-brand-50 border-brand-200' : 'border-transparent hover:bg-slate-50'}`}>
                    <input type="checkbox" checked={bulkIds.includes(id)} onClick={(ev) => ev.stopPropagation()} onChange={() => setBulkIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{e.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{e.employeeId} · {e.designation}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Right: live preview + generation */}
          <Card>
            {/* No Front/Back toggle here: the preview below always shows BOTH
                sides, so the toggle changed nothing on screen. The one thing it
                did affect — which side the PNG export produced — now follows the
                "Sides" control below, so there is a single place to choose. */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600"><QrCode size={14} className="text-brand-600" /> Live Preview <span className="font-normal text-slate-400 truncate max-w-[160px]">· {selectedTemplate?.name}</span></div>
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
                {(['front', 'back', 'both'] as SideMode[]).map((s) => <button key={s} onClick={() => setSideMode(s)} className={`px-2 py-1 rounded-lg border font-semibold capitalize ${sideMode === s ? 'border-[#C77E52] text-[#C77E52] bg-[#FCF4EE]' : 'border-slate-200 text-slate-500'}`}>{s}</button>)}
                <span className="text-slate-400 font-bold ml-2">Layout</span>
                {([['card', 'Card'], ['sheet', 'A4 Sheet'], ['duplex', 'Duplex']] as [PdfLayout, string][]).map(([v, l]) => <button key={v} onClick={() => setPdfLayout(v)} className={`px-2 py-1 rounded-lg border font-semibold ${pdfLayout === v ? 'border-[#C77E52] text-[#C77E52] bg-[#FCF4EE]' : 'border-slate-200 text-slate-500'}`}>{l}</button>)}
              </div>

              {progress && <div className="text-[11px] text-slate-500">Generating {progress.done}/{progress.total}… <div className="mt-1 h-1.5 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-[#C77E52]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div></div>}

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              Use a built-in design, or upload your own and map the employee fields onto it once.
            </p>
            {canEdit && (
              <Button size="sm" icon={<Upload size={13} />} onClick={() => setUploadOpen(true)}>Upload Custom Template</Button>
            )}
          </div>
          <TemplateGallery templates={tset.all} activeId={selectedTemplate?.id} sample={previewEmp} branding={pv.branding} companyId={pv.companyId}
            canEdit={canEdit} isSuperAdmin={isSuperAdmin}
            onUse={applyTemplate} onPreview={previewOf} onEdit={editTpl} onDuplicate={duplicateTpl} onDelete={deleteTpl} onSetDefault={makeDefault} onShare={shareTpl} />
        </div>
      )}

      <UploadTemplateModal open={uploadOpen} onClose={() => setUploadOpen(false)} onSave={saveUploadedTpl} />

      </>}

      {/* Dedicated Template Editor (full page) — opened from the gallery Edit button.
          Editing never changes the active template; that stays a Use Template action. */}
      {editingTpl && (
        <CardTemplateEditor
          template={editingTpl}
          employee={previewEmp}
          branding={pv.branding}
          companyId={pv.companyId}
          canEdit={canEdit}
          onClose={() => setEditingTpl(null)}
          onSaved={onTemplateSaved}
        />
      )}

      {/* Preview modal */}
      {previewTpl && (
        <Modal open onClose={() => setPreviewTpl(null)} title={previewTpl.name} size="lg"
          footer={<><Button variant="outline" size="sm" onClick={() => setPreviewTpl(null)}>Close</Button>{previewTpl.id === selectedTemplate?.id ? <Button size="sm" disabled>In Use</Button> : <Button size="sm" onClick={() => applyTemplate(previewTpl)}>Apply Template</Button>}</>}>
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
