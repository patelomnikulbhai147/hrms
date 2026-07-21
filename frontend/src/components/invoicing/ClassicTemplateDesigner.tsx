// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE GALLERY — Invoice Management → Templates & Branding.
//
// Every invoice skin a company can print is listed here, in three sources:
//
//   1. SYSTEM DEFAULT — the built-in A4 service invoice. It is not hardcoded into
//      the print path any more than a saved template is: it is the entry that
//      applies when NO saved layout is marked default, and "Set as Default" on it
//      simply clears the active layout (the Restore Default action).
//   2. YOUR TEMPLATES — rows from invoice_layouts, fully manageable.
//   3. MASTER LIBRARY — the read-only built-in designs, used as a starting point.
//
// The preview panel renders through the SAME renderInvoiceHtml the invoice
// preview and the PDF use, so gallery preview === invoice preview === PDF.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { SAMPLE_INVOICE } from './invoiceTemplate';
import { renderInvoiceHtml, openInvoiceWindow, printInvoiceDocument, downloadFile, slugify, SYSTEM_TEMPLATE_NAME, SYSTEM_TEMPLATE_CATEGORY } from './invoiceRender';
import { MASTER_TEMPLATES, CATEGORIES, TemplateDef } from './constants/masterTemplates';
import { CheckCircle2, Printer, Download, Copy, Trash2, Pencil, RotateCcw, Star, Eye } from 'lucide-react';
import { qrDataUrl } from '@/utils/cardCodes';

/** A gallery entry, whatever its source. `layout: null` = the built-in default. */
interface GalleryItem {
  key: string;
  id: string | number | null;   // invoice_layouts id, when saved
  name: string;
  category: string;
  source: 'system' | 'saved' | 'master';
  layout: any | null;           // { blocks } for element templates; null = default
  thumbColor: string;
  isDefault: boolean;
}

const SYSTEM_KEY = 'system-default';

export const ClassicTemplateDesigner: React.FC<{ company: any; canManage: boolean; onUseTemplate?: (layout: any) => void }> = ({ company, canManage, onUseTemplate }) => {
  const [selectedKey, setSelectedKey] = useState<string>(SYSTEM_KEY);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qrData, setQrData] = useState<string>('');
  const [saved, setSaved] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  const loadSaved = useCallback(async () => {
    try {
      const r = await api.invoicing.listLayouts();
      setSaved(Array.isArray(r?.layouts) ? r.layouts : []);
    } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not load your saved templates.')); }
  }, []);

  useEffect(() => {
    setQrData(qrDataUrl(SAMPLE_INVOICE.invoiceNumber, 200));
    (async () => {
      try {
        const [s] = await Promise.all([api.invoicing.getSettings().catch(() => null), loadSaved()]);
        setSettings(s);
      } finally { setLoading(false); }
    })();
  }, [company?.id, loadSaved]);

  // Another tab (the visual designer) may add/rename/delete templates.
  useEffect(() => {
    const onChanged = () => { loadSaved(); };
    window.addEventListener('hrms:invoice-templates-changed', onChanged);
    return () => window.removeEventListener('hrms:invoice-templates-changed', onChanged);
  }, [loadSaved]);

  const parseLayout = (l: any) => {
    let p = l?.layout;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
    return p;
  };

  const hasActiveSaved = saved.some((l) => l.isDefault);

  const items: GalleryItem[] = useMemo(() => {
    const system: GalleryItem = {
      key: SYSTEM_KEY, id: null, name: SYSTEM_TEMPLATE_NAME, category: SYSTEM_TEMPLATE_CATEGORY,
      source: 'system', layout: null, thumbColor: '#1f2937',
      // The built-in applies precisely when no saved template is active.
      isDefault: !hasActiveSaved,
    };
    const mine: GalleryItem[] = saved.map((l) => ({
      key: `saved-${l.id}`, id: l.id, name: l.name || 'Untitled', category: 'Your Templates',
      source: 'saved', layout: parseLayout(l), thumbColor: '#C77E52', isDefault: !!l.isDefault,
    }));
    const master: GalleryItem[] = MASTER_TEMPLATES.map((t: TemplateDef) => ({
      key: `master-${t.id}`, id: null, name: t.name, category: t.category,
      source: 'master', layout: { blocks: t.elements }, thumbColor: t.thumbnailColor, isDefault: false,
    }));
    return [system, ...mine, ...master];
  }, [saved, hasActiveSaved]);

  const selected = items.find((i) => i.key === selectedKey) || items[0];

  // ONE renderer for the preview, the print window, the export and the PDF.
  const htmlFor = (item: GalleryItem, print = false) =>
    renderInvoiceHtml(SAMPLE_INVOICE, company, undefined, item.layout, { print, qrDataUrl: qrData }, settings);

  const previewHtml = selected ? htmlFor(selected) : '';

  // ── Actions ────────────────────────────────────────────────────────────────
  // Printed through the same hidden-iframe path as a real invoice, so the sheet
  // is identical and the dialog can never wedge the app (a same-origin popup
  // shares this tab's renderer process — that was the freeze).
  const printPreview = async (item: GalleryItem) => {
    setBusy(true);
    try { await printInvoiceDocument(htmlFor(item, true)); }
    catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not open the print preview.')); }
    finally { setBusy(false); }
  };

  const openPreview = (item: GalleryItem) => {
    if (!openInvoiceWindow(htmlFor(item, false))) ui.toast.error('Allow pop-ups for this site to open the preview.');
  };

  /** Element templates export their portable JSON spec; the built-in has no spec
   *  to export, so it exports the rendered A4 document instead. */
  const exportTemplate = (item: GalleryItem) => {
    const base = slugify(item.name);
    if (item.layout) {
      downloadFile(`invoice-template-${base}.json`,
        JSON.stringify({ name: item.name, category: item.category, layout: item.layout }, null, 2),
        'application/json');
      ui.toast.success('Template exported as JSON.');
    } else {
      downloadFile(`invoice-template-${base}.html`, htmlFor(item, true), 'text/html');
      ui.toast.success('Template exported as a printable HTML document.');
    }
  };

  const editTemplate = (item: GalleryItem) => {
    if (!onUseTemplate) return;
    // A saved template opens attached to its row, so Save updates it instead of
    // creating a copy. Master templates open as a new, unsaved design.
    onUseTemplate(item.source === 'saved'
      ? { elements: item.layout?.blocks || [], styleRoles: item.layout?.styleRoles, templateId: item.id, name: item.name }
      : { elements: item.layout?.blocks || [] });
  };

  const duplicateTemplate = async (item: GalleryItem) => {
    if (!item.layout) return;
    setBusy(true);
    try {
      await api.invoicing.saveLayout(null, { name: `${item.name} (Copy)`, layout: item.layout });
      await loadSaved();
      window.dispatchEvent(new CustomEvent('hrms:invoice-templates-changed'));
      ui.toast.success('Template duplicated into Your Templates.');
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setBusy(false); }
  };

  const setDefault = async (item: GalleryItem) => {
    setBusy(true);
    try {
      if (item.source === 'system') {
        // Restore the built-in: clear whichever saved layout is currently active.
        const active = saved.find((l) => l.isDefault);
        if (active) await api.invoicing.setLayoutDefault(active.id, false);
        ui.toast.success('Restored the built-in default. New invoices use the Standard Service Invoice.');
      } else if (item.id != null) {
        await api.invoicing.setLayoutDefault(item.id, true);
        ui.toast.success(`"${item.name}" is now the default. New invoices will use it.`);
      } else {
        // A master template must exist as a saved row before it can be default.
        const created = await api.invoicing.saveLayout(null, { name: item.name, layout: item.layout });
        await api.invoicing.setLayoutDefault(created.id, true);
        ui.toast.success(`"${item.name}" was added to Your Templates and set as default.`);
      }
      await loadSaved();
      window.dispatchEvent(new CustomEvent('hrms:invoice-templates-changed'));
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setBusy(false); }
  };

  const deleteTemplate = async (item: GalleryItem) => {
    if (item.source !== 'saved' || item.id == null) return;
    if (!await ui.confirm({ title: 'Delete template', message: `Delete "${item.name}"? Invoices already generated are not affected.`, confirmText: 'Delete', variant: 'danger' })) return;
    setBusy(true);
    try {
      await api.invoicing.deleteLayout(item.id);
      if (selectedKey === item.key) setSelectedKey(SYSTEM_KEY);
      await loadSaved();
      window.dispatchEvent(new CustomEvent('hrms:invoice-templates-changed'));
      ui.toast.success('Template deleted.');
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setBusy(false); }
  };

  if (loading || !selected) return <Card><div className="p-4 text-center">Loading Template Gallery…</div></Card>;

  const savedItems = items.filter((i) => i.source === 'saved');
  const masterItems = items.filter((i) => i.source === 'master' && (activeCategory === 'All' || i.category === activeCategory));
  const systemItem = items[0];

  // A real miniature of the document, rendered by the same renderer as the page.
  // Only the Default + Your Templates get one — mounting 30 more iframes for the
  // master library would cost far more than the flat swatch is worth.
  const Thumb: React.FC<{ item: GalleryItem; live: boolean }> = ({ item, live }) => {
    if (!live) return <div className="w-full aspect-[3/4] rounded mb-2 shadow-sm" style={{ backgroundColor: item.thumbColor }} />;
    const W = 794, H = 1123, scale = 130 / W;
    return (
      <div className="relative w-full aspect-[3/4] rounded mb-2 shadow-sm overflow-hidden bg-white border border-slate-200">
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
          <iframe srcDoc={htmlFor(item)} title={`${item.name} thumbnail`} style={{ width: W, height: H, border: 0 }} />
        </div>
      </div>
    );
  };

  const Tile: React.FC<{ item: GalleryItem; live?: boolean }> = ({ item, live = false }) => (
    <button onClick={() => setSelectedKey(item.key)}
      className={`relative flex flex-col items-center p-3 rounded-lg border transition-all text-left ${selected.key === item.key ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'}`}>
      {item.isDefault && (
        <span className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-emerald-700">
          <Star size={8} className="fill-emerald-600 text-emerald-600" /> Default
        </span>
      )}
      <Thumb item={item} live={live} />
      <span className="text-xs font-bold text-slate-800 w-full text-center">{item.name}</span>
      <span className="text-[9px] font-semibold text-slate-400 w-full text-center">{item.category}</span>
    </button>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
      {/* Action bar — everything acts on the SELECTED template. */}
      <div className="flex items-center justify-between gap-2 p-2 bg-white border-b border-slate-200 shrink-0">
        <div className="ml-2 min-w-0">
          <h2 className="font-bold text-slate-800 truncate">
            {selected.name}
            {selected.isDefault && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-emerald-700">Default</span>}
          </h2>
          <p className="text-[10px] text-slate-400">
            {selected.source === 'system' ? 'Built-in template — always available, cannot be deleted.'
              : selected.source === 'saved' ? 'Your template — fully editable.'
                : 'Master library template — read-only; duplicate or edit it to customise.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button size="sm" variant="outline" icon={<Eye size={13} />} onClick={() => openPreview(selected)}>Preview</Button>
          <Button size="sm" variant="outline" icon={<Printer size={13} />} onClick={() => printPreview(selected)}>Print Preview</Button>
          <Button size="sm" variant="outline" icon={<Download size={13} />} onClick={() => exportTemplate(selected)}>Export</Button>
          {selected.layout && canManage && (
            <>
              <Button size="sm" variant="outline" icon={<Pencil size={13} />} onClick={() => editTemplate(selected)}>Edit</Button>
              <Button size="sm" variant="outline" icon={<Copy size={13} />} disabled={busy} onClick={() => duplicateTemplate(selected)}>Duplicate</Button>
            </>
          )}
          {selected.source === 'saved' && canManage && (
            <Button size="sm" variant="outline" icon={<Trash2 size={13} />} disabled={busy} onClick={() => deleteTemplate(selected)}>Delete</Button>
          )}
          {canManage && !selected.isDefault && (
            <Button size="sm" icon={selected.source === 'system' ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />} disabled={busy} onClick={() => setDefault(selected)}>
              {selected.source === 'system' ? 'Restore Default' : 'Set as Default'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: the gallery */}
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-100 bg-slate-50">
            <select
              className="w-full text-xs p-1.5 border border-slate-200 rounded text-slate-700 bg-white outline-none"
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-6">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Default</h3>
              <div className="grid grid-cols-2 gap-3"><Tile item={systemItem} live /></div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Your Templates ({savedItems.length})</h3>
              {savedItems.length === 0
                ? <p className="px-1 text-[11px] text-slate-400">None yet — edit or duplicate a master template to create one.</p>
                : <div className="grid grid-cols-2 gap-3">{savedItems.map(i => <Tile key={i.key} item={i} live />)}</div>}
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Master Library</h3>
              <div className="grid grid-cols-2 gap-3">{masterItems.map(i => <Tile key={i.key} item={i} />)}</div>
            </div>
          </div>
        </div>

        {/* Right: live preview — the exact document that will print. */}
        <div className="flex-1 bg-slate-200/50 p-4 overflow-y-auto flex justify-center">
          <div className="bg-white shadow-xl shadow-slate-200/50 rounded" style={{ width: '794px', minHeight: '1123px' }}>
            <iframe srcDoc={previewHtml} className="w-full h-full border-0 pointer-events-none rounded" style={{ minHeight: '1123px' }} title="Preview" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassicTemplateDesigner;
