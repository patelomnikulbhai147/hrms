import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { resolveBranding } from '@/services/brandingService';
import { CanvasElement, InvoiceDesign, invoiceDocHtml, SAMPLE_INVOICE, DEFAULT_COLUMNS } from './invoiceTemplate';
import { CANVAS_TEMPLATES } from './canvasTemplates';
import {
  Type, Image as ImageIcon, Building2, User, Table2, Sigma, 
  Landmark, PenTool, FileText, StickyNote, QrCode, Barcode, Stamp,
  Square, Circle, Minus, LayoutTemplate, Plus, Layers, 
  Settings, AlignLeft, AlignCenter, AlignRight, Save, RotateCcw,
  Printer, ZoomIn, ZoomOut, Maximize2, MousePointer2, Copy, Trash2, ArrowUp, ArrowDown,
  Upload, Grid
} from 'lucide-react';
import { qrDataUrl } from '@/utils/cardCodes';

const A4_W = 794;
const A4_H = 1123;
const GRID_SIZE = 10;

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// ── Left Sidebar Element Library ──
const ELEMENT_TOOLS = [
  { type: 'text', label: 'Text', icon: Type, default: { w: 200, h: 40, content: 'Enter text...', fontSize: 14 } },
  { type: 'image', label: 'Image', icon: ImageIcon, default: { w: 150, h: 150, bg: '#e5e7eb' } },
  { type: 'logo', label: 'Company Logo', icon: Building2, default: { w: 180, h: 60 } },
  { type: 'companyDetails', label: 'Company Details', icon: Building2, default: { w: 250, h: 100, fontSize: 12 } },
  { type: 'customerDetails', label: 'Customer Details', icon: User, default: { w: 250, h: 100, fontSize: 12 } },
  { type: 'itemTable', label: 'Item Table', icon: Table2, default: { w: A4_W - 80, h: 150 } },
  { type: 'totals', label: 'Totals', icon: Sigma, default: { w: 250, h: 120 } },
  { type: 'bankDetails', label: 'Bank Details', icon: Landmark, default: { w: 250, h: 80, fontSize: 12 } },
  { type: 'signature', label: 'Signature', icon: PenTool, default: { w: 150, h: 80 } },
  { type: 'terms', label: 'Terms & Cond.', icon: FileText, default: { w: 300, h: 60, fontSize: 10 } },
  { type: 'notes', label: 'Notes', icon: StickyNote, default: { w: 300, h: 60, fontSize: 10 } },
  { type: 'qr', label: 'QR Code', icon: QrCode, default: { w: 100, h: 100 } },
  { type: 'barcode', label: 'Barcode', icon: Barcode, default: { w: 150, h: 50 } },
  { type: 'stamp', label: 'Company Stamp', icon: Stamp, default: { w: 100, h: 100, opacity: 0.8 } },
  { type: 'rect', label: 'Rectangle', icon: Square, default: { w: 100, h: 100, bg: '#f1f5f9', borderWidth: 1, borderColor: '#d1d5db', borderStyle: 'solid' } },
  { type: 'circle', label: 'Circle', icon: Circle, default: { w: 100, h: 100, bg: '#f1f5f9', borderWidth: 1, borderColor: '#d1d5db', borderStyle: 'solid' } },
  { type: 'line', label: 'Divider Line', icon: Minus, default: { w: 200, h: 10, borderWidth: 1, borderColor: '#000', borderStyle: 'solid' } },
  { type: 'text', label: 'Watermark', icon: Type, default: { w: A4_W - 80, h: 200, content: 'WATERMARK', fontSize: 120, opacity: 0.1, color: '#000000', textAlign: 'center' } },
  { type: 'text', label: 'Page Number', icon: Type, default: { w: 100, h: 30, content: 'Page {{PageNumber}} of {{TotalPages}}', fontSize: 10, textAlign: 'right' } },
  { type: 'text', label: 'Custom Field', icon: Type, default: { w: 200, h: 30, content: '{{CustomField1}}', fontSize: 12 } },
];

export function checkOverlap(el1: CanvasElement, el2: CanvasElement): boolean {
  if (el1.id === el2.id) return false;
  return (
    el1.x < el2.x + el2.w &&
    el1.x + el1.w > el2.x &&
    el1.y < el2.y + el2.h &&
    el1.y + el1.h > el2.y
  );
}

export function autoFixLayout(elements: CanvasElement[]): CanvasElement[] {
    let els = elements.map(el => ({ ...el }));
    const margin = 20;
    
    // Pass 1: Clamp bounds
    els = els.map(next => {
        next.w = Math.max(20, Math.min(next.w || 20, A4_W - margin * 2));
        next.h = Math.max(20, Math.min(next.h || 20, A4_H - margin * 2));
        if (next.type === 'itemTable') next.w = Math.min(next.w, A4_W - margin * 2);
        next.x = Math.max(margin, Math.min(next.x || margin, A4_W - margin - next.w));
        next.y = Math.max(margin, Math.min(next.y || margin, A4_H - margin - next.h));
        return next;
    });

    // Pass 2: Resolve overlaps (Push down)
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 50) {
        changed = false;
        iterations++;
        els.sort((a, b) => a.y - b.y);
        
        for (let i = 0; i < els.length; i++) {
            for (let j = i + 1; j < els.length; j++) {
                const a = els[i];
                const b = els[j];
                if (checkOverlap(a, b)) {
                    b.y = a.y + a.h + 10;
                    
                    // Pass 3: Re-clamp b's bounds if pushed off page
                    if (b.y + b.h > A4_H - margin) {
                         b.y = Math.max(margin, A4_H - margin - b.h);
                    }
                    changed = true;
                }
            }
        }
    }
    return els;
}

export const CanvasInvoiceDesigner: React.FC<{ company: any; canManage: boolean; seedLayout?: any }> = ({ company, canManage, seedLayout }) => {
  const [settings, setSettings] = useState<any>(null);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.8);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [guides, setGuides] = useState<{ h: number | null, v: number | null }>({ h: null, v: null });
  
  // Tabs for Left Sidebar
  const [sidebarTab, setSidebarTab] = useState<'elements'|'saved'>('elements');
  const [savedLayouts, setSavedLayouts] = useState<any[]>([]);
  
  // Custom Template Save Modal
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState('Custom');
  const [saveVisibility, setSaveVisibility] = useState('Company');
  const [saveDescription, setSaveDescription] = useState('');
  
  // History for Undo/Redo
  const [history, setHistory] = useState<CanvasElement[][]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  
  const qrData = React.useMemo(() => qrDataUrl(SAMPLE_INVOICE.invoiceNumber, 200), []);

  useEffect(() => {
    (async () => {
      try { 
        if (seedLayout) {
          // If we received a seed layout from Classic, we initialize the canvas with its elements translated
          // Wait, Classic template is a flat InvoiceDesign object. We need to convert it to CanvasElements.
          // For now, if seedLayout is passed, we load it. If it has a sourceDesign, we translate it.
          let convertedEls: CanvasElement[] = [];
          if (seedLayout.sourceDesign) {
             const sd = seedLayout.sourceDesign;
             convertedEls = [
               { id: generateId(), type: 'logo', name: 'Logo', x: 20, y: 20, w: 150, h: 60, rotation: 0, opacity: 1, visible: sd.header.showLogo, locked: false, zIndex: 1 },
               { id: generateId(), type: 'companyDetails', name: 'Company Details', x: 20, y: 90, w: 250, h: 100, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 2, fontSize: sd.font.size },
               { id: generateId(), type: 'customerDetails', name: 'Bill To', x: 20, y: 210, w: 250, h: 120, rotation: 0, opacity: 1, visible: sd.customer.showBillTo, locked: false, zIndex: 3, fontSize: sd.font.size },
               { id: generateId(), type: 'text', name: 'Title', x: A4_W - 250, y: 20, w: 230, h: 40, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 4, content: sd.title || 'TAX INVOICE', fontSize: 24, align: 'right' },
               { id: generateId(), type: 'itemTable', name: 'Items Table', x: 20, y: 350, w: A4_W - 40, h: 150, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 5 },
               { id: generateId(), type: 'totals', name: 'Totals', x: A4_W - 270, y: 520, w: 250, h: 140, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 6 },
               { id: generateId(), type: 'bankDetails', name: 'Bank Details', x: 20, y: 700, w: 250, h: 100, rotation: 0, opacity: 1, visible: sd.footer.showBank, locked: false, zIndex: 7, fontSize: sd.font.size },
               { id: generateId(), type: 'terms', name: 'Terms', x: 20, y: 820, w: 350, h: 80, rotation: 0, opacity: 1, visible: sd.footer.showTerms, locked: false, zIndex: 8, fontSize: sd.font.size - 2 },
               { id: generateId(), type: 'signature', name: 'Signature', x: A4_W - 220, y: 950, w: 200, h: 80, rotation: 0, opacity: 1, visible: sd.footer.showSignature, locked: false, zIndex: 9 },
             ];
          } else {
             convertedEls = seedLayout.elements || seedLayout.blocks || [];
          }
          const fixedEls = autoFixLayout(convertedEls);
          setElements(fixedEls);
          commitHistory(fixedEls, true);
        } else {
          // If no seed, load the active Default layout from invoice_layouts, if any.
          const s = await api.invoicing.getSettings(); 
          setSettings(s); 
          const activeLayout = (await api.invoicing.listLayouts()).find((l: any) => l.isDefault);
          
          if (activeLayout && activeLayout.layout && activeLayout.layout.blocks) {
            const fixedEls = autoFixLayout(activeLayout.layout.blocks);
            setElements(fixedEls);
            commitHistory(fixedEls, true);
          } else {
            const initial: CanvasElement[] = [];
            setElements(initial);
            commitHistory(initial, true);
          }
        }
      }
      catch (e) { ui.toast.error(getApiErrorMessage(e)); }
      finally { setLoading(false); }
    })();
    loadSavedLayouts();
  }, []);

  const loadSavedLayouts = async () => {
    try {
      const layouts = await api.invoicing.listLayouts();
      setSavedLayouts(layouts);
    } catch (e) { console.error('Failed to load saved layouts', e); }
  };

  const commitHistory = (newEls: CanvasElement[], replace = false) => {
    if (replace) {
      setHistory([newEls]);
      setHistoryIdx(0);
    } else {
      const nextHistory = history.slice(0, historyIdx + 1);
      nextHistory.push(JSON.parse(JSON.stringify(newEls)));
      setHistory(nextHistory);
      setHistoryIdx(nextHistory.length - 1);
    }
  };

  const undo = () => {
    if (historyIdx > 0) {
      setHistoryIdx(i => i - 1);
      setElements(JSON.parse(JSON.stringify(history[historyIdx - 1])));
    }
  };

  const redo = () => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx(i => i + 1);
      setElements(JSON.parse(JSON.stringify(history[historyIdx + 1])));
    }
  };

  const addElement = (tool: any) => {
    const el: CanvasElement = {
      id: generateId(),
      type: tool.type,
      name: tool.label,
      x: 100, y: 100,
      w: tool.default.w, h: tool.default.h,
      rotation: 0, opacity: 1, visible: true, locked: false,
      zIndex: elements.length + 1,
      ...tool.default
    };
    const newEls = [...elements, el];
    setElements(newEls);
    commitHistory(newEls);
    setSelectedId(el.id);
  };

  const addCustomSection = async () => {
    const name = await ui.prompt({ title: 'New Custom Section', message: 'Enter a name for this section (e.g., Shipping Details, Warranty)' });
    if (!name) return;
    const el: CanvasElement = {
      id: generateId(),
      type: 'customSection',
      name: name,
      content: `<strong>${name}</strong><br/>[Content Here]`,
      x: 100, y: 100, w: 250, h: 80,
      rotation: 0, opacity: 1, visible: true, locked: false,
      zIndex: elements.length + 1,
      fontSize: 12,
      borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'solid', padding: 8
    };
    const newEls = [...elements, el];
    setElements(newEls);
    commitHistory(newEls);
    setSelectedId(el.id);
  };

  const addImageUpload = async () => {
    const url = await ui.prompt({ title: 'Image URL', message: 'Enter image URL (Base64 or http)' });
    if (!url) return;
    const el: CanvasElement = {
      id: generateId(), type: 'image', name: 'Uploaded Image',
      x: 100, y: 100, w: 150, h: 150,
      rotation: 0, opacity: 1, visible: true, locked: false,
      zIndex: elements.length + 1, content: url // Using content field for image src
    };
    const newEls = [...elements, el];
    setElements(newEls);
    commitHistory(newEls);
    setSelectedId(el.id);
  };

  const loadTemplate = (tplData: any) => {
    let tplEls: CanvasElement[] = [];
    let designState: any = null;
    if (Array.isArray(tplData)) {
      tplEls = tplData;
    } else if (tplData && tplData.blocks) {
      tplEls = tplData.blocks;
      designState = tplData.designState;
    }
    
    // Make deep copy and ensure new IDs to avoid reference issues
    let newEls = JSON.parse(JSON.stringify(tplEls)).map((e: any) => ({ ...e, id: generateId() }));
    newEls = autoFixLayout(newEls); // Apply Auto-Fix Engine immediately
    setElements(newEls);
    commitHistory(newEls, true);
    
    if (designState) {
      setSettings((s: any) => {
        let d = s?.designJson;
        if (typeof d === 'string') {
           try { d = JSON.parse(d); } catch { d = null; }
        }
        return {
          ...(s || {}),
          designJson: JSON.stringify({
            ...(d || {}),
            colors: designState.colors || d?.colors,
            font: designState.font || d?.font,
            layout: designState.layout || d?.layout,
          })
        };
      });
    }

    setSelectedId(null);
    ui.toast.success('Template loaded!');
  };

  const saveAsCustomTemplate = () => {
    setSaveName('');
    setSaveCategory('Custom');
    setSaveDescription('');
    setIsSaveModalOpen(true);
  };

  const submitSaveTemplate = async () => {
    if (!saveName.trim()) {
      ui.toast.error('Template name is required.');
      return;
    }
    try {
      let d = settings?.designJson;
      if (typeof d === 'string') {
         try { d = JSON.parse(d); } catch { d = null; }
      }
      const layoutData = {
        blocks: elements,
        designState: {
          colors: d?.colors,
          font: d?.font,
          layout: d?.layout
        },
        isCanvas: true,
        category: saveCategory,
        visibility: saveVisibility,
        description: saveDescription
      };
      await api.invoicing.saveLayout(null, { name: saveName, layout: layoutData });
      ui.toast.success('Custom template saved!');
      setIsSaveModalOpen(false);
      loadSavedLayouts();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  const deleteCustomTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await ui.confirm('Delete this template?')) return;
    try {
      await api.invoicing.deleteLayout(id);
      loadSavedLayouts();
    } catch (err) { ui.toast.error(getApiErrorMessage(err)); }
  };

  const duplicateTemplate = async (layout: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      let parsed = layout.layout;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      await api.invoicing.saveLayout(null, { name: `${layout.name} Copy`, layout: parsed });
      ui.toast.success('Template duplicated!');
      loadSavedLayouts();
    } catch (err) { ui.toast.error(getApiErrorMessage(err)); }
  };

  const renameTemplate = async (layout: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = await ui.prompt({ title: 'Rename Template', message: 'Enter a new name for this template:', defaultValue: layout.name });
    if (!newName) return;
    try {
      let parsed = layout.layout;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      await api.invoicing.saveLayout(layout.id, { name: newName, layout: parsed });
      ui.toast.success('Template renamed!');
      loadSavedLayouts();
    } catch (err) { ui.toast.error(getApiErrorMessage(err)); }
  };

  const setDefaultTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.invoicing.setLayoutDefault(id, true);
      ui.toast.success('Set as default template!');
      loadSavedLayouts();
    } catch (err) { ui.toast.error(getApiErrorMessage(err)); }
  };

  const updateElement = (id: string, changes: Partial<CanvasElement>, finalize = true) => {
    setElements(els => {
      const current = els.find(e => e.id === id);
      if (!current) return els;
      const next = { ...current, ...changes };
      
      // Central Boundary Engine
      const margin = 20;
      next.w = Math.max(20, Math.min(next.w || 20, A4_W - margin * 2));
      next.h = Math.max(20, Math.min(next.h || 20, A4_H - margin * 2));
      
      // Special rule: Item Table must not exceed printable margins
      if (next.type === 'itemTable') {
        next.w = Math.min(next.w, A4_W - margin * 2);
      }
      
      next.x = Math.max(margin, Math.min(next.x || margin, A4_W - margin - next.w));
      next.y = Math.max(margin, Math.min(next.y || margin, A4_H - margin - next.h));
      
      // Collision Prevention Engine (Solid Body Mechanics)
      const isOverlap = els.some(other => other.id !== id && checkOverlap(other, next));
      if (isOverlap) {
         return els; // Prevent placement, acts like an invisible solid wall
      }
      
      return els.map(e => e.id === id ? next : e);
    });
    if (finalize) {}
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const newEls = elements.filter(e => e.id !== selectedId);
    setElements(newEls);
    commitHistory(newEls);
    setSelectedId(null);
  };

  const duplicateSelected = () => {
    if (!selectedId) return;
    const src = elements.find(e => e.id === selectedId);
    if (!src) return;
    const el = { ...src, id: generateId(), x: src.x + 20, y: src.y + 20, zIndex: elements.length + 1 };
    const newEls = [...elements, el];
    setElements(newEls);
    commitHistory(newEls);
    setSelectedId(el.id);
  };

  // Keyboard support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      else if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { 
        // don't delete if editing an input
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'SELECT') return;
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyIdx, history, selectedId, elements]);



  const previewHTML = () => {
    const design: InvoiceDesign = { isCanvas: true, template: 'canvas', title: 'TAX INVOICE', paper: 'A4', orientation: 'portrait', elements, 
        colors: {} as any, font: {} as any, layout: {} as any, totals: {} as any, header: {} as any, customer: {} as any, footer: {} as any, columns: [], tableBorders: false, altRows: false, altRowColor: '', totalsPosition: 'right' };
    return invoiceDocHtml(SAMPLE_INVOICE, company, design, { print: false, qrDataUrl: qrData });
  };

  const generateSample = () => {
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (w) { w.document.write(previewHTML()); w.document.close(); }
  };

  if (loading) return <Card><div className="p-4 text-center">Loading Designer...</div></Card>;

  const selectedElement = elements.find(e => e.id === selectedId);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between p-2 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={undo} disabled={historyIdx <= 0} icon={<RotateCcw size={14} />} title="Undo (Ctrl+Z)" />
          <Button size="sm" variant="outline" onClick={redo} disabled={historyIdx >= history.length - 1} icon={<RotateCcw size={14} className="rotate-180" />} title="Redo (Ctrl+Y)" />
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <Button size="sm" variant="outline" onClick={() => setShowGrid(!showGrid)}>{showGrid ? 'Hide Grid' : 'Show Grid'}</Button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(2)))} className="p-1 text-slate-500 hover:text-brand-600" title="Zoom out"><ZoomOut size={13} /></button>
          <span className="text-xs font-bold w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2.0, +(z + 0.1).toFixed(2)))} className="p-1 text-slate-500 hover:text-brand-600" title="Zoom in"><ZoomIn size={13} /></button>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <Button size="sm" variant="outline" icon={<Printer size={13} />} onClick={generateSample}>Preview PDF</Button>
          <Button size="sm" icon={<Save size={13} />} disabled={!canManage} onClick={saveAsCustomTemplate}>Save Template</Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar (Tabs & Library) ── */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="flex border-b border-slate-200">
            <button className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider ${sidebarTab === 'elements' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-slate-500'}`} onClick={() => setSidebarTab('elements')}>Blocks</button>
            <button className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider ${sidebarTab === 'saved' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-slate-500'}`} onClick={() => setSidebarTab('saved')}>Saved Templates</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
            {sidebarTab === 'elements' && (
              <>
                {ELEMENT_TOOLS.map(t => (
                  <button key={t.type} onClick={() => addElement(t)} disabled={!canManage} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 text-left transition-all">
                    <div className="w-8 h-8 rounded bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><t.icon size={16} /></div>
                    <span className="text-sm font-semibold text-slate-700">{t.label}</span>
                  </button>
                ))}
                <div className="h-px bg-slate-200 my-2" />
                <button onClick={addCustomSection} disabled={!canManage} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 text-left transition-all">
                  <div className="w-8 h-8 rounded bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Plus size={16} /></div>
                  <span className="text-sm font-semibold text-brand-700">Custom Section</span>
                </button>
                <button onClick={addImageUpload} disabled={!canManage} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 text-left transition-all">
                  <div className="w-8 h-8 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><Upload size={16} /></div>
                  <span className="text-sm font-semibold text-emerald-700">Upload Image</span>
                </button>
              </>
            )}
            {sidebarTab === 'saved' && (
              <div className="grid grid-cols-1 gap-3">
                {savedLayouts.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center p-4">No custom templates saved yet. Click "Save as Template" to add one.</p>
                ) : savedLayouts.map(layout => {
                  let parsedLayout: any = {};
                  let meta: any = {};
                  try {
                    if (layout.layout) {
                      const l = layout.layout;
                      meta = l;
                      parsedLayout = l;
                    }
                  } catch (e) {}
                  return (
                    <div key={layout.id} className="flex flex-col p-2 rounded-lg hover:bg-slate-50 border border-slate-200 hover:border-brand-300 transition-all text-left bg-white shadow-sm group">
                      <div className="flex gap-2">
                        <div className="w-16 aspect-[1/1.4] rounded bg-slate-100 relative overflow-hidden border border-slate-200 shrink-0 cursor-pointer" onClick={() => loadTemplate(parsedLayout)}>
                          <div className="absolute inset-0 opacity-20 bg-brand-600" />
                          <div className="absolute top-1 left-1 right-1 h-2 bg-white opacity-80 rounded-[1px]" />
                          <div className="absolute top-4 left-1 right-1 h-8 bg-white opacity-80 rounded-[1px]" />
                        </div>
                        <div className="flex-1 flex flex-col justify-between overflow-hidden">
                          <button onClick={() => loadTemplate(parsedLayout)} disabled={!canManage} className="text-left w-full">
                            <p className="text-sm font-bold text-slate-800 truncate">{layout.name}</p>
                            <p className="text-[10px] text-slate-500 uppercase">{meta.category || 'Custom'} • {meta.visibility || 'Company'}</p>
                          </button>
                          
                          <div className="flex gap-1 mt-2">
                             <button onClick={(e) => setDefaultTemplate(layout.id, e)} className={`flex-1 text-[10px] p-1 rounded font-bold border transition-all ${layout.isDefault ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`} title={layout.isDefault ? "Current Default" : "Set as Default"}>
                               {layout.isDefault ? 'Active' : 'Set Active'}
                             </button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Action Menu row (shows on hover) */}
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => loadTemplate(parsedLayout)} className="text-[10px] font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1"><PenTool size={10}/> Edit</button>
                         <div className="flex gap-1">
                           <button onClick={(e) => duplicateTemplate(layout, e)} className="p-1 text-slate-400 hover:text-brand-600 rounded hover:bg-brand-50" title="Duplicate"><Copy size={12} /></button>
                           <button onClick={(e) => renameTemplate(layout, e)} className="p-1 text-slate-400 hover:text-orange-500 rounded hover:bg-orange-50" title="Rename"><Type size={12} /></button>
                           <button onClick={(e) => deleteCustomTemplate(layout.id, e)} className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50" title="Delete"><Trash2 size={12} /></button>
                         </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Center Canvas Area ── */}
        <div className="flex-1 bg-slate-200 overflow-auto relative p-8 flex justify-center items-start" 
             onPointerDown={(e) => { if (e.target === e.currentTarget || e.target === containerRef.current) setSelectedId(null); }}>
          <div ref={containerRef} style={{ width: A4_W, height: A4_H, transform: `scale(${zoom})`, transformOrigin: 'top center', backgroundColor: '#fff', position: 'relative', boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            backgroundImage: showGrid ? `linear-gradient(to right, #f1f5f9 1px, transparent 1px), linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)` : 'none',
            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`
           }}>
             {/* Safe Margins overlay */}
             <div className="absolute inset-0 pointer-events-none border-[20px] border-transparent border-t-red-100/30 border-b-red-100/30 border-l-red-100/30 border-r-red-100/30" />
             
             {elements.map(el => (
                <DraggableElement key={el.id} element={el} isSelected={selectedId === el.id} canManage={canManage} zoom={zoom}
                  onSelect={() => setSelectedId(el.id)}
                  onChange={(changes:any) => updateElement(el.id, changes, false)}
                  onCommit={() => commitHistory(elements)}
                  brand={resolveBranding(company)}
                  qrData={qrData}
                  company={company}
                  allElements={elements}
                  setGuides={setGuides}
                  containerRef={containerRef}
                />
             ))}

             {/* Alignment Guides */}
             {guides.v !== null && <div className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none z-50" style={{ left: guides.v }} />}
             {guides.h !== null && <div className="absolute left-0 right-0 h-px bg-red-500 pointer-events-none z-50" style={{ top: guides.h }} />}
          </div>
        </div>

        {/* ── Right Sidebar (Properties & Layers) ── */}
        <div className="w-72 bg-white border-l border-slate-200 flex flex-col shrink-0">
          {selectedElement ? (
             <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-slate-800 text-sm">Properties</h3>
                  <div className="flex gap-1">
                    <button onClick={duplicateSelected} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Duplicate"><Copy size={14} /></button>
                    <button onClick={deleteSelected} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>

                {/* Geometry */}
                <div className="grid grid-cols-2 gap-2">
                  <NumInput label="X" value={selectedElement.x} onChange={(v:number) => updateElement(selectedId!, { x: v })} onCommit={() => commitHistory(elements)} />
                  <NumInput label="Y" value={selectedElement.y} onChange={(v:number) => updateElement(selectedId!, { y: v })} onCommit={() => commitHistory(elements)} />
                  <NumInput label="W" value={selectedElement.w} onChange={(v:number) => updateElement(selectedId!, { w: v })} onCommit={() => commitHistory(elements)} />
                  <NumInput label="H" value={selectedElement.h} onChange={(v:number) => updateElement(selectedId!, { h: v })} onCommit={() => commitHistory(elements)} />
                </div>

                {/* Content for Text/Custom */}
                {(selectedElement.type === 'text' || selectedElement.type === 'customSection') && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Content (HTML allowed)</label>
                    <textarea className="w-full mt-1 border border-slate-200 rounded p-2 text-xs" rows={4} value={selectedElement.content || ''} onChange={e => { updateElement(selectedId!, { content: e.target.value }); commitHistory(elements); }} />
                  </div>
                )}
                
                {/* Image properties */}
                {(selectedElement.type === 'image' || selectedElement.type === 'logo' || selectedElement.type === 'signature') && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Image Source (URL)</label>
                    <input type="text" className="w-full mt-1 border border-slate-200 rounded p-2 text-xs" placeholder="Leave empty for default" value={selectedElement.content || ''} onChange={e => { updateElement(selectedId!, { content: e.target.value }); commitHistory(elements); }} />
                  </div>
                )}

                {/* Typography */}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Typography</label>
                  <div className="grid grid-cols-2 gap-2">
                    <NumInput label="Font Size" value={selectedElement.fontSize || 12} onChange={(v:number) => { updateElement(selectedId!, { fontSize: v }); commitHistory(elements); }} />
                    <TextInput label="Color" type="color" value={selectedElement.color || '#000000'} onChange={(v:string) => { updateElement(selectedId!, { color: v }); commitHistory(elements); }} />
                  </div>
                  <div className="flex gap-1 bg-slate-50 p-1 rounded border border-slate-200">
                    <button className={`flex-1 p-1 rounded flex justify-center ${selectedElement.textAlign === 'left' ? 'bg-white shadow-sm' : ''}`} onClick={() => { updateElement(selectedId!, { textAlign: 'left' }); commitHistory(elements); }}><AlignLeft size={14} /></button>
                    <button className={`flex-1 p-1 rounded flex justify-center ${selectedElement.textAlign === 'center' ? 'bg-white shadow-sm' : ''}`} onClick={() => { updateElement(selectedId!, { textAlign: 'center' }); commitHistory(elements); }}><AlignCenter size={14} /></button>
                    <button className={`flex-1 p-1 rounded flex justify-center ${selectedElement.textAlign === 'right' ? 'bg-white shadow-sm' : ''}`} onClick={() => { updateElement(selectedId!, { textAlign: 'right' }); commitHistory(elements); }}><AlignRight size={14} /></button>
                  </div>
                </div>

                {/* Appearance */}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Appearance</label>
                  <div className="grid grid-cols-2 gap-2">
                    <TextInput label="Background" type="color" value={selectedElement.bg || '#ffffff'} onChange={(v:string) => { updateElement(selectedId!, { bg: v }); commitHistory(elements); }} />
                    <TextInput label="Border" type="color" value={selectedElement.borderColor || '#000000'} onChange={(v:string) => { updateElement(selectedId!, { borderColor: v }); commitHistory(elements); }} />
                    <NumInput label="Border W" value={selectedElement.borderWidth || 0} onChange={(v:number) => { updateElement(selectedId!, { borderWidth: v }); commitHistory(elements); }} />
                    <NumInput label="Radius" value={selectedElement.borderRadius || 0} onChange={(v:number) => { updateElement(selectedId!, { borderRadius: v }); commitHistory(elements); }} />
                    <NumInput label="Opacity" value={selectedElement.opacity ?? 1} step={0.1} max={1} min={0} onChange={(v:number) => { updateElement(selectedId!, { opacity: v }); commitHistory(elements); }} />
                  </div>
                </div>
                
                {/* Specifics (Table Cols) */}
                {selectedElement.type === 'itemTable' && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Columns</label>
                    {(selectedElement.tableCols || DEFAULT_COLUMNS).map((c, i) => (
                      <div key={c.key} className="flex items-center gap-2">
                        <input type="checkbox" checked={c.visible} onChange={e => {
                          const cols = [...(selectedElement.tableCols || DEFAULT_COLUMNS)];
                          cols[i] = { ...cols[i], visible: e.target.checked };
                          updateElement(selectedId!, { tableCols: cols });
                          commitHistory(elements);
                        }} />
                        <span className="text-xs">{c.label}</span>
                      </div>
                    ))}
                  </div>
                )}
             </div>
          ) : (
             <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-8 text-center">
               Select an element on the canvas to view its properties.
             </div>
          )}

          {/* Layers Panel (Bottom Half) */}
          <div className="h-1/3 min-h-[200px] border-t border-slate-200 bg-slate-50 p-3 flex flex-col">
            <h3 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2"><Layers size={14} /> Layers</h3>
            <div className="flex-1 overflow-y-auto space-y-1">
              {[...elements].sort((a,b) => b.zIndex - a.zIndex).map((el, i) => (
                <div key={el.id} onClick={() => setSelectedId(el.id)} className={`flex items-center gap-2 p-1.5 rounded cursor-pointer text-xs ${selectedId === el.id ? 'bg-brand-100 text-brand-800' : 'hover:bg-slate-200 text-slate-700'}`}>
                  <span className="flex-1 truncate">{el.name}</span>
                  <div className="flex flex-col gap-0.5">
                    <button className="text-slate-400 hover:text-slate-800" onClick={(e) => { e.stopPropagation(); updateElement(el.id, { zIndex: el.zIndex + 1 }); commitHistory(elements); }}><ArrowUp size={10} /></button>
                    <button className="text-slate-400 hover:text-slate-800" onClick={(e) => { e.stopPropagation(); updateElement(el.id, { zIndex: el.zIndex - 1 }); commitHistory(elements); }}><ArrowDown size={10} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Save Template Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Save Custom Template</h3>
              <button onClick={() => setIsSaveModalOpen(false)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Template Name</label>
                <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="e.g. Acme Corp Contract" className="w-full border border-slate-300 rounded p-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select value={saveCategory} onChange={e => setSaveCategory(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm focus:border-brand-500 outline-none">
                  <option value="Custom">Custom</option>
                  <option value="Business">Business</option>
                  <option value="Retail">Retail</option>
                  <option value="Service">Service</option>
                  <option value="Logistics">Logistics</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Visibility</label>
                <select value={saveVisibility} onChange={e => setSaveVisibility(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm focus:border-brand-500 outline-none">
                  <option value="Private">Private</option>
                  <option value="Company">Company</option>
                  <option value="Global">Global (Super Admin only)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description (Optional)</label>
                <textarea value={saveDescription} onChange={e => setSaveDescription(e.target.value)} placeholder="Briefly describe this template..." rows={3} className="w-full border border-slate-300 rounded p-2 text-sm focus:border-brand-500 outline-none" />
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsSaveModalOpen(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={submitSaveTemplate}>Save Template</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Subcomponents ──

const NumInput = ({ label, value, onChange, onCommit, step = 1, min, max }: any) => (
  <div className="flex flex-col">
    <label className="text-[9px] text-slate-400 uppercase">{label}</label>
    <input type="number" value={value} step={step} min={min} max={max} className="border border-slate-200 rounded p-1 text-xs" 
      onChange={e => onChange(Number(e.target.value))} onBlur={onCommit} />
  </div>
);

const TextInput = ({ label, value, type="text", onChange, onCommit }: any) => (
  <div className="flex flex-col">
    <label className="text-[9px] text-slate-400 uppercase">{label}</label>
    <input type={type} value={value} className="border border-slate-200 rounded p-1 text-xs" 
      onChange={e => onChange(e.target.value)} onBlur={onCommit} />
  </div>
);

// ── Draggable Element ──
const DraggableElement = ({ element, isSelected, canManage, zoom, onSelect, onChange, onCommit, brand, company, qrData, allElements, setGuides, containerRef }: any) => {
  const [isDragging, setIsDragging] = useState(false);
  
  const getPointerCoords = (e: React.PointerEvent | PointerEvent) => {
    if (!containerRef?.current) return { x: e.clientX / zoom, y: e.clientY / zoom };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom
    };
  };
  
  // Quick generic pointer handler for move/resize
  const handlePointerDown = (e: React.PointerEvent, action: 'move' | 'resize', dir?: string) => {
    if (!canManage) return;
    e.stopPropagation();
    onSelect();
    setIsDragging(true);
    
    const startCoords = getPointerCoords(e);
    
    // capture initial state
    const initX = element.x;
    const initY = element.y;
    const initW = element.w;
    const initH = element.h;

    const onPointerMove = (ev: PointerEvent) => {
      const currentCoords = getPointerCoords(ev);
      const dx = currentCoords.x - startCoords.x;
      const dy = currentCoords.y - startCoords.y;
      
      let x = initX, y = initY, w = initW, h = initH;
      let guideH: number | null = null;
      let guideV: number | null = null;
      const SNAP_DIST = 5;
      
      if (action === 'move') {
        x = initX + dx;
        y = initY + dy;
        
        // Smart Alignment Snapping
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const pageCenterX = A4_W / 2;
        const pageCenterY = A4_H / 2;
        
        // Snap to center
        if (Math.abs(centerX - pageCenterX) < SNAP_DIST) { x = pageCenterX - w / 2; guideV = pageCenterX; }
        if (Math.abs(centerY - pageCenterY) < SNAP_DIST) { y = pageCenterY - h / 2; guideH = pageCenterY; }
        
        // Snap to margins
        if (Math.abs(x - 20) < SNAP_DIST) { x = 20; guideV = 20; }
        if (Math.abs(x + w - (A4_W - 20)) < SNAP_DIST) { x = A4_W - 20 - w; guideV = A4_W - 20; }
        if (Math.abs(y - 20) < SNAP_DIST) { y = 20; guideH = 20; }
        if (Math.abs(y + h - (A4_H - 20)) < SNAP_DIST) { y = A4_H - 20 - h; guideH = A4_H - 20; }
        
        // Snap to other elements
        if (allElements) {
          allElements.forEach((el: any) => {
            if (el.id === element.id) return;
            if (Math.abs(x - el.x) < SNAP_DIST) { x = el.x; guideV = el.x; }
            if (Math.abs(y - el.y) < SNAP_DIST) { y = el.y; guideH = el.y; }
            if (Math.abs(x + w - (el.x + el.w)) < SNAP_DIST) { x = el.x + el.w - w; guideV = el.x + el.w; }
            if (Math.abs(y + h - (el.y + el.h)) < SNAP_DIST) { y = el.y + el.h - h; guideH = el.y + el.h; }
          });
        }
        
        // Clamp move to boundaries (Safe Margin = 20px)
        x = Math.max(20, Math.min(x, A4_W - 20 - w));
        y = Math.max(20, Math.min(y, A4_H - 20 - h));
      } else if (action === 'resize' && dir) {
        if (dir.includes('e')) {
           w = initW + dx;
           w = Math.min(w, A4_W - 20 - initX);
        }
        if (dir.includes('s')) {
           h = initH + dy;
           h = Math.min(h, A4_H - 20 - initY);
        }
        if (dir.includes('w')) {
           let newX = initX + dx;
           newX = Math.max(20, newX);
           w = initW + (initX - newX);
           x = newX;
        }
        if (dir.includes('n')) {
           let newY = initY + dy;
           newY = Math.max(20, newY);
           h = initH + (initY - newY);
           y = newY;
        }
      }
      
      w = Math.max(20, w);
      h = Math.max(20, h);
      
      if (setGuides) setGuides((prev: any) => (prev?.h === guideH && prev?.v === guideV) ? prev : { h: guideH, v: guideV });
      onChange({ x, y, w, h });
    };
    
    const onPointerUp = () => {
      setIsDragging(false);
      if (setGuides) setGuides({ h: null, v: null });
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      onCommit(); // save to history
    };
    
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const elStyle: React.CSSProperties = {
    position: 'absolute',
    left: element.x, top: element.y, width: element.w, height: element.h,
    zIndex: element.zIndex,
    transform: `rotate(${element.rotation || 0}deg)`,
    opacity: element.opacity,
    fontFamily: element.fontFamily, fontSize: element.fontSize,
    color: element.color, textAlign: element.textAlign,
    backgroundColor: element.bg,
    borderWidth: element.borderWidth, borderColor: element.borderColor, borderStyle: element.borderStyle,
    borderRadius: element.borderRadius, padding: element.padding,
    cursor: canManage ? 'move' : 'default',
    wordWrap: 'break-word', overflow: 'hidden',
    boxShadow: isSelected ? '0 0 0 2px #6c3cf0' : 'none'
  };

  if (element.type === 'circle') elStyle.borderRadius = '50%';
  if (element.type === 'line') {
    elStyle.height = 0;
    elStyle.overflow = 'visible';
    elStyle.borderTopWidth = element.borderWidth || 1;
    elStyle.borderTopColor = element.borderColor || '#000';
    elStyle.borderTopStyle = element.borderStyle || 'solid';
    elStyle.borderWidth = 0;
  }

  // Generate preview content internally to match what invoiceDocHtml does roughly for the editor
  let content = null;
  switch (element.type) {
    case 'text':
    case 'customSection':
      content = <div dangerouslySetInnerHTML={{ __html: (element.content || '').replace(/\n/g, '<br/>') }} />;
      break;
    case 'image':
      content = element.content ? <img src={element.content} className="w-full h-full object-contain" /> : <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-400">[Image]</div>;
      break;
    case 'stamp':
      content = <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-400">[Stamp]</div>;
      break;
    case 'logo': {
      const isUrl = brand.logo && (brand.logo.includes('/') || brand.logo.includes('.') || brand.logo.startsWith('data:'));
      content = (brand.hasLogo && isUrl) 
        ? <img src={brand.logo} className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> 
        : <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold rounded text-center p-2">{brand.logo && brand.logo.length <= 4 ? brand.logo : '[Company Logo]'}</div>;
      break;
    }
    case 'signature': {
      const isSigUrl = brand.signature && (brand.signature.includes('/') || brand.signature.includes('.') || brand.signature.startsWith('data:'));
      content = (brand.hasSignature && isSigUrl) 
        ? <img src={brand.signature} className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> 
        : <div className="w-full h-full border border-dashed flex items-center justify-center text-slate-400 text-xs text-center p-2">[Signature]</div>;
      break;
    }
    case 'qr':
      content = <img src={qrData} className="w-full h-full object-contain" />;
      break;
    case 'barcode':
      content = <div className="w-full h-full border border-dashed flex items-center justify-center">|||||||||||||||</div>;
      break;
    case 'companyDetails':
      content = <div><strong>{company?.name || 'Company Name'}</strong><br/>{company?.address || 'Address'}</div>;
      break;
    case 'customerDetails':
      content = <div><strong>Customer Name</strong><br/>Customer Address</div>;
      break;
    case 'itemTable':
      content = <div className="w-full h-full border border-dashed bg-slate-50 flex items-center justify-center">[Item Table Preview]</div>;
      break;
    case 'totals':
      content = <div className="w-full h-full border border-dashed bg-slate-50 flex flex-col justify-end items-end p-2 text-sm"><div>Subtotal: ₹0.00</div><div><strong>Grand Total: ₹0.00</strong></div></div>;
      break;
    case 'bankDetails':
      content = <div><strong>Bank Details</strong><br/>HDFC Bank<br/>A/C: XXXX</div>;
      break;
    case 'terms':
      content = <div><strong>Terms & Conditions</strong><br/>Payment due 30 days</div>;
      break;
    case 'notes':
      content = <div><strong>Notes</strong><br/>Thank you!</div>;
      break;
  }

  const Handle = ({ dir, style }: any) => (
    <div onPointerDown={e => handlePointerDown(e, 'resize', dir)}
         style={{ position: 'absolute', width: 8, height: 8, background: '#fff', border: '1px solid #6c3cf0', borderRadius: '50%', ...style }} />
  );

  return (
    <div style={elStyle} onPointerDown={e => handlePointerDown(e, 'move')}>
      {content}
      {/* Resize handles */}
      {isSelected && canManage && (
        <>
          <Handle dir="nw" style={{ top: -4, left: -4, cursor: 'nwse-resize' }} />
          <Handle dir="n" style={{ top: -4, left: '50%', marginLeft: -4, cursor: 'ns-resize' }} />
          <Handle dir="ne" style={{ top: -4, right: -4, cursor: 'nesw-resize' }} />
          <Handle dir="w" style={{ top: '50%', marginTop: -4, left: -4, cursor: 'ew-resize' }} />
          <Handle dir="e" style={{ top: '50%', marginTop: -4, right: -4, cursor: 'ew-resize' }} />
          <Handle dir="sw" style={{ bottom: -4, left: -4, cursor: 'nesw-resize' }} />
          <Handle dir="s" style={{ bottom: -4, left: '50%', marginLeft: -4, cursor: 'ns-resize' }} />
          <Handle dir="se" style={{ bottom: -4, right: -4, cursor: 'nwse-resize' }} />
        </>
      )}
    </div>
  );
};

export default CanvasInvoiceDesigner;
