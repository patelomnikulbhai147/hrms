import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { resolveBranding } from '@/services/brandingService';
import {
  CanvasElement, InvoiceDesign, invoiceDocHtml, SAMPLE_INVOICE, DEFAULT_COLUMNS,
  isTextEditable, textPropOf, getElementText, canvasTextHtml, TOTALS_ROWS, totalsLabel,
  resolvePadding,
} from './invoiceTemplate';
import { RichTextToolbar } from './RichTextToolbar';
import {
  canvasTextCss, normalizeRichHtml, pickTypography, resolveStyleRoles,
  STYLE_ROLES, BORDER_STYLES, type StyleRoleMap,
} from './richText';
import {
  Type, Image as ImageIcon, Building2, User, Table2, Sigma,
  Landmark, PenTool, FileText, StickyNote, QrCode, Barcode, Stamp, Wallet,
  Square, Circle, Minus, Plus, Layers, Save, RotateCcw,
  Printer, ZoomIn, ZoomOut, Copy, Trash2, ArrowUp, ArrowDown,
  Upload, Pencil, Eye, Check, X, AlertTriangle, Star, ArrowLeft
} from 'lucide-react';
import { formatDate } from '@/utils/formatDate';
import { qrDataUrl } from '@/utils/cardCodes';
import {
  A4_W, A4_H, MARGIN, GRID_SIZE,
  clampRect, snapTo, minEdge, maxEdge, freeAxes, minSizeFor, autoFixLayout, elementsOutsidePage,
} from './canvasBounds';

export { autoFixLayout };

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

/** Temporary save-path tracing (canvas → payload → response). Flip to false to
 *  silence; kept behind console.debug so it is invisible unless the dev console
 *  filters for verbose. */
const DEBUG_SAVE = true;

/** Template names are shown in tabs, galleries and the print label, so cap them. */
const MAX_TEMPLATE_NAME = 100;

/** Case-insensitive, trimmed name key for duplicate detection. */
const nameKey = (s: any) => String(s ?? '').trim().toLowerCase();

// ── Left Sidebar Element Library ──
const ELEMENT_TOOLS = [
  { type: 'text', label: 'Text', icon: Type, default: { w: 200, h: 40, content: 'Enter text...', fontSize: 14 } },
  { type: 'image', label: 'Image', icon: ImageIcon, default: { w: 150, h: 150, bg: '#e5e7eb' } },
  { type: 'logo', label: 'Company Logo', icon: Building2, default: { w: 180, h: 60 } },
  { type: 'companyDetails', label: 'Company Details', icon: Building2, default: { w: 250, h: 100, fontSize: 12 } },
  { type: 'customerDetails', label: 'Customer Details', icon: User, default: { w: 250, h: 100, fontSize: 12 } },
  { type: 'itemTable', label: 'Item Table', icon: Table2, default: { w: A4_W - 80, h: 150 } },
  { type: 'totals', label: 'Totals', icon: Sigma, default: { w: 250, h: 120 } },
  // Bank Details / Payment Info are no longer offered: Payment Details were
  // removed from the invoice layout, so a placed block would print nothing.
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

/** What an inline editor starts with when the block has no stored text yet.
 *  Tokens keep the block data-driven after the first edit — a user who only
 *  appends a line to Bank Details still gets the invoice's real bank details. */
function seedTextFor(el: CanvasElement): string {
  switch (el.type) {
    case 'companyDetails':  return `<strong>{{CompanyName}}</strong><br/>{{CompanyAddress}}`;
    case 'customerDetails': return `<strong>{{CustomerName}}</strong><br/>{{CustomerAddress}}`;
    case 'bankDetails':     return `<strong>Bank Details</strong><br/>{{BankDetails}}`;
    case 'paymentInfo':     return `<strong>Payment Information</strong><br/>Payment Mode: {{PaymentMode}}<br/>UPI ID: {{UpiId}}`;
    case 'terms':           return `<strong>Terms &amp; Conditions</strong><br/>{{Terms}}`;
    case 'notes':           return `<strong>Notes</strong><br/>{{Notes}}`;
    case 'signature':       return `Authorized Signatory`;
    case 'stamp':           return `Company Stamp`;
    default:                return '';
  }
}

function plainTextOf(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Layer label follows the text the user typed. Tokens are stripped first, so a
 *  block left at its `{{CompanyName}}` seed keeps its original layer name. */
function layerNameFromText(html: string): string {
  const line = plainTextOf(html)
    .replace(/\{\{\s*\w+\s*\}\}/g, ' ')
    .split('\n').map(s => s.trim()).find(Boolean) || '';
  return line.length > 28 ? `${line.slice(0, 28)}…` : line;
}

/** Pure: apply a change to one element and re-assert the page boundary.
 *  `current` is passed as the bleed reference, so a full-bleed banner keeps its
 *  edge-to-edge freedom while ordinary elements stay inside the safe area. */
function applyChange(els: CanvasElement[], id: string, changes: Partial<CanvasElement>): CanvasElement[] {
  const current = els.find(e => e.id === id);
  if (!current) return els;
  const merged = { ...current, ...changes } as CanvasElement;
  const next = { ...merged, ...clampRect(merged, current, minSizeFor(merged.type)) };
  return els.map(e => (e.id === id ? next : e));
}

export const CanvasInvoiceDesigner: React.FC<{ 
  company: any; 
  canManage: boolean; 
  seedLayout?: any; 
  onSaveLayout?: (data: any) => Promise<void>; 
  onCancel?: () => void;
  isGalleryMode?: boolean;
}> = ({ company, canManage, seedLayout, onSaveLayout, onCancel, isGalleryMode }) => {
  const [settings, setSettings] = useState<any>(null);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  // Multi-select. The LAST id is the primary: it drives the Properties panel,
  // inline editing and drag. Block-scope formatting hits every id in the list.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Typography copied by the Format Painter, waiting for a target click. */
  const [painter, setPainter] = useState<Partial<CanvasElement> | null>(null);
  const [styleRoles, setStyleRoles] = useState<StyleRoleMap>(() => resolveStyleRoles(null));
  const [showSource, setShowSource] = useState(false);

  /** Replace the whole selection with one element (or clear it). */
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
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
  const [saveStatus, setSaveStatus] = useState('Active');
  const [saveMakeDefault, setSaveMakeDefault] = useState(false);
  const [saveSaving, setSaveSaving] = useState(false);
  const [saveIntent, setSaveIntent] = useState<'draft' | 'active'>('draft');
  // The id of the saved template currently open for editing. Non-null → Save
  // UPDATES that row instead of creating a duplicate (Step 7).
  const [editingTemplateId, setEditingTemplateId] = useState<string | number | null>(null);
  // The existing template a save collided with. When set, the dialog shows the
  // Rename / Open / Save-as-Copy / Overwrite options instead of a bare error.
  const [dupClash, setDupClash] = useState<any | null>(null);
  // The row to flash in the Saved Templates list right after a successful save.
  const [highlightTemplateId, setHighlightTemplateId] = useState<string | number | null>(null);
  const saveNameRef = useRef<HTMLInputElement>(null);
  
  // History for Undo/Redo
  const [history, setHistory] = useState<CanvasElement[][]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  // Live mirrors of state. A drag installs its pointermove/pointerup listeners once,
  // so anything those closures read from `elements` / `historyIdx` would be frozen at
  // the value present when the drag STARTED. That is why history used to record the
  // pre-drag positions and undo appeared to do nothing.
  const elementsRef = useRef<CanvasElement[]>([]);
  const historyRef = useRef<CanvasElement[][]>([]);
  const historyIdxRef = useRef(-1);
  // The inline text editor owns the keyboard while it is open; the window-level
  // shortcut handler reads this ref rather than a stale closure over `editingId`.
  const editingIdRef = useRef<string | null>(null);
  // The live contentEditable node, so the toolbar can run commands against the
  // caret without stealing focus from it.
  const editorRef = useRef<HTMLDivElement | null>(null);
  // The block's text as it was when this edit session opened. `finishEditing`
  // compares against THIS, not against the live value — the toolbar syncs the
  // live value on every command, so comparing against it would always find them
  // equal and never push a history entry.
  const editStartHtmlRef = useRef<string>('');
  elementsRef.current = elements;
  historyRef.current = history;
  historyIdxRef.current = historyIdx;
  editingIdRef.current = editingId;

  // Canvas nodes + layer rows, for "scroll the selection into view" both ways.
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const layerRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
               { id: generateId(), type: 'text', name: 'Title', x: A4_W - 250, y: 20, w: 230, h: 40, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 4, content: sd.title || 'TAX INVOICE', fontSize: 24, textAlign: 'right' },
               { id: generateId(), type: 'itemTable', name: 'Items Table', x: 20, y: 350, w: A4_W - 40, h: 150, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 5 },
               { id: generateId(), type: 'totals', name: 'Totals', x: A4_W - 270, y: 520, w: 250, h: 140, rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 6 },
               // No Bank Details block: Payment Details were removed from the
               // layout. Terms moves up into the space it used to occupy.
               { id: generateId(), type: 'terms', name: 'Terms', x: 20, y: 700, w: 350, h: 80, rotation: 0, opacity: 1, visible: sd.footer.showTerms, locked: false, zIndex: 8, fontSize: sd.font.size - 2 },
               { id: generateId(), type: 'signature', name: 'Signature', x: A4_W - 220, y: 950, w: 200, h: 80, rotation: 0, opacity: 1, visible: sd.footer.showSignature, locked: false, zIndex: 9 },
             ];
          } else {
             convertedEls = seedLayout.elements || seedLayout.blocks || [];
          }
          setStyleRoles(resolveStyleRoles(seedLayout.styleRoles));
          const fixedEls = autoFixLayout(convertedEls);
          setElements(fixedEls);
          commitHistory(fixedEls, true);
          // Opened via "Edit" on a SAVED template → stay attached to that row so
          // Save updates it. Seeded from a master template → a new design.
          if (seedLayout.templateId != null) {
            setEditingTemplateId(seedLayout.templateId);
            if (seedLayout.name) setSaveName(String(seedLayout.name));
          }
          // Settings are needed by the preview/print path in this mode too.
          try { setSettings(await api.invoicing.getSettings()); } catch { /* preview still renders */ }
        } else {
          // If no seed, load the active Default layout from invoice_layouts, if any.
          const s = await api.invoicing.getSettings();
          setSettings(s);
          // list() returns { layouts: [...] } — unwrap it (this used to read the
          // object as an array, so .find crashed and nothing loaded).
          const activeLayout = ((await api.invoicing.listLayouts())?.layouts || []).find((l: any) => l.isDefault);

          if (activeLayout && activeLayout.layout && activeLayout.layout.blocks) {
            setEditingTemplateId(activeLayout.id);
            setStyleRoles(resolveStyleRoles(activeLayout.layout.styleRoles));
            const fixedEls = autoFixLayout<CanvasElement>(activeLayout.layout.blocks);
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
      // The endpoint returns { layouts: [...] }; store the ARRAY. Storing the
      // wrapper object was why the Saved Templates tab was always empty.
      const r = await api.invoicing.listLayouts();
      setSavedLayouts(r?.layouts || []);
    } catch (e) { console.error('Failed to load saved layouts', e); }
  };

  /** Tell any open Create-Invoice editor / invoice list to reload templates, so
   *  a save/rename/delete/set-default shows up there with no page refresh. */
  const broadcastTemplatesChanged = () => {
    try { window.dispatchEvent(new CustomEvent('hrms:invoice-templates-changed')); } catch { /* SSR / older browser */ }
  };

  /** Push a snapshot. Reads through refs so a drag's pointerup closure commits the
   *  elements as they are NOW, not as they were when the drag began. */
  const commitHistory = useCallback((newEls?: CanvasElement[], replace = false) => {
    const snapshot: CanvasElement[] = JSON.parse(JSON.stringify(newEls ?? elementsRef.current));
    if (replace) {
      historyRef.current = [snapshot];
      historyIdxRef.current = 0;
    } else {
      const nextHistory = historyRef.current.slice(0, historyIdxRef.current + 1);
      nextHistory.push(snapshot);
      historyRef.current = nextHistory;
      historyIdxRef.current = nextHistory.length - 1;
    }
    setHistory(historyRef.current);
    setHistoryIdx(historyIdxRef.current);
  }, []);

  const restore = (idx: number) => {
    const snapshot: CanvasElement[] = JSON.parse(JSON.stringify(historyRef.current[idx]));
    historyIdxRef.current = idx;
    elementsRef.current = snapshot;
    setHistoryIdx(idx);
    setElements(snapshot);
  };

  const undo = () => { if (historyIdxRef.current > 0) restore(historyIdxRef.current - 1); };
  const redo = () => { if (historyIdxRef.current < historyRef.current.length - 1) restore(historyIdxRef.current + 1); };

  /** The default typography a freshly-added block inherits. `tool.default` wins,
   *  so the Watermark keeps its 120px / 10% opacity and the Page Number its
   *  right alignment. */
  const roleDefaultsFor = (type: string): Partial<CanvasElement> => {
    if (type === 'itemTable') return styleRoles.table as Partial<CanvasElement>;
    if (type === 'totals') return styleRoles.totals as Partial<CanvasElement>;
    if (type === 'terms' || type === 'notes') return styleRoles.footer as Partial<CanvasElement>;
    if (isTextEditable(type as CanvasElement['type'])) return styleRoles.body as Partial<CanvasElement>;
    return {};
  };

  const addElement = (tool: any) => {
    // Clamp on insert: the Item Table and Watermark are 714px wide, so at x=100
    // they used to hang 40px past the right edge and be clipped from the PDF.
    const el: CanvasElement = {
      id: generateId(),
      type: tool.type,
      name: tool.label,
      rotation: 0, opacity: 1, visible: true, locked: false,
      zIndex: elements.length + 1,
      ...roleDefaultsFor(tool.type),
      ...tool.default,
      ...clampRect({ x: 100, y: 100, w: tool.default.w, h: tool.default.h }),
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
      ...clampRect({ x: 100, y: 100, w: 250, h: 80 }),
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
      ...clampRect({ x: 100, y: 100, w: 150, h: 150 }),
      rotation: 0, opacity: 1, visible: true, locked: false,
      zIndex: elements.length + 1, content: url // Using content field for image src
    };
    const newEls = [...elements, el];
    setElements(newEls);
    commitHistory(newEls);
    setSelectedId(el.id);
  };

  /**
   * Load a template's design onto the canvas.
   *
   * `row` is the saved-layout row (`{ id, name, layout }`) when editing an
   * existing template — its id is remembered so the next Save UPDATES it rather
   * than creating a duplicate (Step 7). Loading a master/classic template (no
   * row) clears the editing id, so Save creates a fresh template.
   */
  const loadTemplate = (tplData: any, row?: any) => {
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
    setStyleRoles(resolveStyleRoles(tplData?.styleRoles));
    setElements(newEls);
    commitHistory(newEls, true);

    // Remember which saved template this is (if any), and seed the Save dialog
    // fields from its stored metadata so re-saving keeps name/category/etc.
    if (row?.id != null) {
      setEditingTemplateId(row.id);
      setSaveName(row.name || tplData?.name || '');
      setSaveCategory(tplData?.category || 'Custom');
      setSaveVisibility(tplData?.visibility || 'Company');
      setSaveDescription(tplData?.description || '');
      setSaveStatus(tplData?.status || 'Active');
      setSaveMakeDefault(!!row.isDefault);
    } else {
      setEditingTemplateId(null);
    }

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
    ui.toast.success(row?.id != null ? 'Template opened for editing.' : 'Template loaded!');
  };

  const saveAsCustomTemplate = () => {
    // Editing an existing template keeps its metadata (loadTemplate seeded it);
    // a brand-new save starts blank.
    if (editingTemplateId == null) {
      setSaveName('');
      setSaveCategory('Custom');
      setSaveVisibility('Company');
      setSaveDescription('');
      setSaveStatus('Active');
      setSaveMakeDefault(false);
    }
    setDupClash(null);
    setIsSaveModalOpen(true);
  };

  /** The in-memory row (company-scoped list) whose name matches `name`, ignoring
   *  the template being edited. This is the real-time / pre-flight check — the
   *  backend 409 remains the final guard against a race with another session. */
  const findNameClash = (name: string): any | null => {
    const key = nameKey(name);
    if (!key) return null;
    return savedLayouts.find(l => String(l.id) !== String(editingTemplateId ?? '') && nameKey(l.name) === key) || null;
  };

  /** "Base", "Base (Copy)", "Base (Copy 2)", … — the first name not already taken.
   *  An existing "(Copy N)" suffix on the source is stripped so copies don't nest. */
  const nextCopyName = (base: string): string => {
    const root = base.replace(/\s*\(Copy(?:\s+\d+)?\)\s*$/i, '').trim() || base.trim();
    const taken = new Set(savedLayouts.map(l => nameKey(l.name)));
    let candidate = `${root} (Copy)`;
    let n = 2;
    while (taken.has(nameKey(candidate))) { candidate = `${root} (Copy ${n})`; n++; }
    return candidate;
  };

  /** Build the layout JSON that IS the template — canvas blocks + styles + meta.
   *  Never returns null: the blocks are the live `elements` array. */
  const buildLayoutData = () => {
    let d = settings?.designJson;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
    return {
      blocks: elements,
      designState: { colors: d?.colors, font: d?.font, layout: d?.layout },
      // Typography defaults per document role. Absent from older layouts, in
      // which case `resolveStyleRoles` supplies the built-ins on load.
      styleRoles,
      isCanvas: true,
      category: saveCategory,
      visibility: saveVisibility,
      description: saveDescription,
      status: saveStatus,
    };
  };

  /** The actual persistence. `targetId` = null → create; an id → update/overwrite
   *  that row. `nameToUse` is already trimmed. `isRetry` prevents a loop when an
   *  update that hit a stale id auto-falls-back to a create. */
  const persistTemplate = async (targetId: string | number | null, nameToUse: string, isRetry = false) => {
    // The layout must contain at least one element — never persist an empty design.
    if (!elements.length) {
      ui.toast.error('Add at least one element to the canvas before saving the template.');
      return;
    }
    // Elements must be inside the printable area (else the PDF would clip them).
    const stray = elementsOutsidePage(elements);
    if (stray.length) {
      setSelectedId(stray[0].id);
      ui.toast.error('One or more elements are outside the printable area. Move them inside the page before saving.');
      return;
    }
    const layoutData = buildLayoutData();
    if (DEBUG_SAVE) console.debug('[template-save] →', { targetId, name: nameToUse, blocks: layoutData.blocks.length, isRetry });
    setSaveSaving(true);
    try {
      if (onSaveLayout) {
        await onSaveLayout({ name: nameToUse, layout: layoutData, status: saveIntent === 'active' ? 'Active' : 'Draft' });
        setEditingTemplateId(targetId ?? null);
        setDupClash(null);
        setIsSaveModalOpen(false);
        ui.toast.success('Template saved successfully.');
        return;
      }
      
      // `saveLayout(id,…)` PUTs when id is set, POSTs when null.
      const saved = await api.invoicing.saveLayout(targetId ?? null, { name: nameToUse, layout: layoutData });
      if (DEBUG_SAVE) console.debug('[template-save] ✓ saved', saved?.id);
      const savedId = saved?.id ?? targetId;
      // Set-as-default is a separate endpoint (it unsets the previous default).
      if (saveMakeDefault && savedId != null) {
        await api.invoicing.setLayoutDefault(savedId, true);
      }
      setEditingTemplateId(savedId ?? null);
      setDupClash(null);
      setIsSaveModalOpen(false);
      ui.toast.success('Template saved successfully.');
      await loadSavedLayouts();
      broadcastTemplatesChanged();
      // Surface + flash the row so the user sees where it landed (Step 9).
      setSidebarTab('saved');
      setHighlightTemplateId(savedId ?? null);
    } catch (e: any) {
      if (DEBUG_SAVE) console.debug('[template-save] ✗', { status: e?.status, code: e?.code, message: e?.message });
      // The tracked template is gone (deleted elsewhere / workspace changed): the
      // backend asks us to create instead, so the user's design is never lost.
      if (!isRetry && targetId != null && (e?.code === 'LAYOUT_GONE' || e?.status === 404)) {
        setEditingTemplateId(null);
        return persistTemplate(null, nameToUse, true);
      }
      // Another session may have taken the name between our check and this write.
      // Turn that 409 into the same resolve-options dialog.
      if (e?.code === 'DUPLICATE_NAME' || e?.status === 409) {
        setDupClash(findNameClash(nameToUse) || { id: null, name: nameToUse });
      } else {
        // Backend already sends actionable messages; getApiErrorMessage surfaces
        // them and falls back to a friendly generic (never a raw internal error).
        ui.toast.error(getApiErrorMessage(e, 'An unexpected error occurred while saving the template. Please try again.'));
      }
    } finally { setSaveSaving(false); }
  };

  /** Save button. Validates, then either persists or opens the resolve dialog.
   *  `editingTemplateId` is only trusted as an UPDATE target when it still refers
   *  to a template in the current (company-scoped) list — otherwise the save
   *  becomes a CREATE, so a stale id can never trigger "Layout not found". */
  const submitSaveTemplate = () => {
    const name = saveName.trim();
    if (!name) { ui.toast.error('Please enter a template name.'); saveNameRef.current?.focus(); return; }
    if (name.length > MAX_TEMPLATE_NAME) { ui.toast.error(`Template name must be ${MAX_TEMPLATE_NAME} characters or fewer.`); return; }
    if (!elements.length) { ui.toast.error('Add at least one element to the canvas before saving the template.'); return; }
    const clash = findNameClash(name);
    if (clash) { setDupClash(clash); return; }   // → resolve options (Rename/Open/Copy/Overwrite)
    const targetId = editingTemplateId != null && savedLayouts.some(l => String(l.id) === String(editingTemplateId))
      ? editingTemplateId
      : null;
    persistTemplate(targetId, name);
  };

  // ── Duplicate-name resolution options ──
  const resolveRename = () => { setDupClash(null); setTimeout(() => { saveNameRef.current?.focus(); saveNameRef.current?.select(); }, 0); };

  const resolveOpenExisting = () => {
    const row = dupClash && savedLayouts.find(l => String(l.id) === String(dupClash.id));
    setDupClash(null);
    setIsSaveModalOpen(false);
    if (row) loadTemplate(row.layout, row);
  };

  const resolveSaveAsCopy = () => {
    const copy = nextCopyName(saveName.trim());
    setSaveName(copy);
    persistTemplate(null, copy);   // always a NEW template
  };

  const resolveOverwrite = async () => {
    if (dupClash?.id == null) return;
    if (!await ui.confirm({ title: 'Overwrite existing template', message: 'This will replace the existing template. Continue?', confirmText: 'Yes, overwrite', variant: 'danger' })) return;
    persistTemplate(dupClash.id, saveName.trim());   // update the EXISTING row
  };

  const deleteCustomTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await ui.confirm('Delete this template? Invoices already generated are not affected.')) return;
    try {
      await api.invoicing.deleteLayout(id);
      // Closing the template we were editing detaches Save from the deleted row.
      if (String(editingTemplateId) === String(id)) setEditingTemplateId(null);
      await loadSavedLayouts();
      broadcastTemplatesChanged();
      ui.toast.success('Template deleted.');
    } catch (err) { ui.toast.error(getApiErrorMessage(err)); }
  };

  const duplicateTemplate = async (layout: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      let parsed = layout.layout;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      // "(Copy)" matches the enterprise convention; the backend still guards
      // against a clash if a copy already exists.
      await api.invoicing.saveLayout(null, { name: `${layout.name} (Copy)`, layout: parsed });
      ui.toast.success('Template duplicated!');
      await loadSavedLayouts();
      broadcastTemplatesChanged();
    } catch (err) { ui.toast.error(getApiErrorMessage(err)); }
  };

  const renameTemplate = async (layout: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = await ui.prompt({ title: 'Rename Template', message: 'Enter a new name for this template:', defaultValue: layout.name });
    if (!newName || newName.trim() === layout.name) return;
    try {
      let parsed = layout.layout;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      await api.invoicing.saveLayout(layout.id, { name: newName.trim(), layout: parsed });
      ui.toast.success('Template renamed!');
      await loadSavedLayouts();
      broadcastTemplatesChanged();
    } catch (err) { ui.toast.error(getApiErrorMessage(err)); }
  };

  const setDefaultTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.invoicing.setLayoutDefault(id, true);
      ui.toast.success('Set as default template! New invoices will use it.');
      await loadSavedLayouts();
      broadcastTemplatesChanged();
    } catch (err) { ui.toast.error(getApiErrorMessage(err)); }
  };

  /** Open a saved template in a new tab, rendered exactly as it will print. */
  const previewTemplate = (layout: any, e: React.MouseEvent) => {
    e.stopPropagation();
    let parsed = layout.layout;
    if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { parsed = null; } }
    const blocks = parsed?.blocks || [];
    const design: InvoiceDesign = { isCanvas: true, template: 'canvas', title: 'TAX INVOICE', paper: 'A4', orientation: 'portrait', elements: blocks,
      colors: {} as any, font: {} as any, layout: {} as any, totals: {} as any, header: {} as any, customer: {} as any, footer: {} as any, columns: [], tableBorders: false, altRows: false, altRowColor: '', totalsPosition: 'right' };
    const html = invoiceDocHtml(SAMPLE_INVOICE, company, design, { print: false, qrDataUrl: qrData });
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (w) { w.document.write(html); w.document.close(); }
  };

  /**
   * The single mutation path for an element. Boundary is re-asserted on every
   * change (clampRect), so x/y/w/h can never leave the page.
   *
   * There used to be a "Collision Prevention Engine" here that returned the
   * elements array UNCHANGED whenever the new rect overlapped any other element.
   * Because overlap is normal in invoice layouts (a logo sits on the banner, a
   * title sits on a header bar), it silently rejected drags, resizes, z-order
   * changes, text edits and colour changes for most elements. That was Bug 1.
   * Professional editors allow overlap; z-order decides what is on top.
   */
  const updateElement = (id: string, changes: Partial<CanvasElement>, finalize = true) =>
    updateElements([id], changes, finalize);

  /** The multi-element form. Each id still funnels through `applyChange`, so the
   *  page boundary is re-asserted per element exactly as for a single edit. */
  const updateElements = (ids: string[], changes: Partial<CanvasElement>, finalize = true) => {
    let next = elementsRef.current;
    for (const id of ids) next = applyChange(next, id, changes);
    if (next === elementsRef.current) return;
    elementsRef.current = next;
    setElements(next);
    if (finalize) commitHistory(next);
  };

  /** Block-scope formatting from the toolbar / properties panel. Applies to the
   *  whole selection, so "select three headings, hit Bold" does what it says. */
  const styleSelected = (changes: Partial<CanvasElement>, finalize = true) => {
    const targets = selectedIds.filter(id => {
      const el = elementsRef.current.find(e => e.id === id);
      return el && !el.locked;
    });
    if (targets.length) updateElements(targets, changes, finalize);
  };

  /**
   * Canvas / Layers click. Ctrl or Shift extends the selection; a plain click
   * replaces it. When the Format Painter is armed, the click paints instead of
   * selecting — one shot, then it disarms.
   */
  const selectElement = (id: string, additive = false) => {
    if (painter) {
      const el = elementsRef.current.find(e => e.id === id);
      if (el && !el.locked) { updateElement(id, painter); ui.toast.success('Formatting applied'); }
      setPainter(null);
      setSelectedId(id);
      return;
    }
    if (!additive) { setSelectedId(id); return; }
    setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };

  const toggleFormatPainter = () => {
    if (painter) { setPainter(null); return; }
    const src = elementsRef.current.find(e => e.id === selectedId);
    if (!src) return;
    setPainter(pickTypography(src) as Partial<CanvasElement>);
    ui.toast.info('Format copied — click another block to apply it');
  };

  /** Enter inline text editing. The element is NOT recreated: only `editingId`
   *  changes, so geometry, typography, rotation and z-order are untouched. */
  const startEditing = (id: string | null = selectedId) => {
    if (!id || !canManage) return;
    const el = elementsRef.current.find(e => e.id === id);
    if (!el || el.locked || !isTextEditable(el.type)) return;
    editStartHtmlRef.current = getElementText(el);
    setSelectedId(id);
    setEditingId(id);
  };

  const cancelEditing = () => setEditingId(null);

  /** Properties-panel text field. Keystrokes are not history entries; the blur is. */
  const setElementText = (el: CanvasElement, html: string) =>
    updateElement(el.id, { [textPropOf(el.type)]: html } as Partial<CanvasElement>, false);

  const commitElementText = (id: string) => {
    const el = elementsRef.current.find(e => e.id === id);
    if (!el) return;
    const label = layerNameFromText(getElementText(el));
    updateElement(id, (label ? { name: label } : {}) as Partial<CanvasElement>);
  };

  /** A toolbar command ran against the open editor. Toolbar buttons suppress the
   *  blur (they must, or the selection dies), so nothing else would pull the new
   *  markup back into state — and saving mid-edit would drop the formatting. */
  const syncEditorHtml = () => {
    const id = editingIdRef.current;
    const node = editorRef.current;
    if (!id || !node) return;
    const el = elementsRef.current.find(e => e.id === id);
    if (el) setElementText(el, normalizeRichHtml(node.innerHTML));
  };

  /** Commit one edit session as a single history entry. */
  const finishEditing = (id: string, html: string) => {
    setEditingId(null);
    const el = elementsRef.current.find(e => e.id === id);
    if (!el) return;
    const prop = textPropOf(el.type);
    if (editStartHtmlRef.current === html) return;   // nothing changed → no history noise
    const changes: Partial<CanvasElement> = { [prop]: html } as any;
    const label = layerNameFromText(html);
    if (label) changes.name = label;
    updateElement(id, changes);
  };

  /** Insert a `{{Token}}` at the caret, or append it to the block's text. */
  const insertToken = (token: string) => {
    const placeholder = `{{${token}}}`;
    if (editingId && editorRef.current) {
      editorRef.current.focus();
      document.execCommand('insertText', false, placeholder);
      syncEditorHtml();
      return;
    }
    const el = elementsRef.current.find(e => e.id === selectedId);
    if (!el) return;
    const current = getElementText(el);
    updateElement(el.id, { [textPropOf(el.type)]: current ? `${current} ${placeholder}` : placeholder } as Partial<CanvasElement>);
  };

  const deleteSelected = () => {
    if (!selectedIds.length) return;
    const doomed = new Set(selectedIds);
    const newEls = elements.filter(e => !doomed.has(e.id));
    setElements(newEls);
    commitHistory(newEls);
    setSelectedId(null);
  };

  const duplicateSelected = () => {
    if (!selectedId) return;
    const src = elements.find(e => e.id === selectedId);
    if (!src) return;
    // Offset the copy, but never off the page.
    const el = { ...src, id: generateId(), ...clampRect({ ...src, x: src.x + 20, y: src.y + 20 }), zIndex: elements.length + 1 };
    const newEls = [...elements, el];
    setElements(newEls);
    commitHistory(newEls);
    setSelectedId(el.id);
  };

  const ARROWS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };

  // Keyboard support
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      const t = el?.tagName;
      // A contentEditable div is a DIV — without this check, Backspace inside the
      // inline text editor would delete the whole element.
      return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || !!el?.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // The inline editor handles its own keys (Enter/Escape) and the browser's
      // native undo stack; designer shortcuts stay out of its way entirely.
      if (editingIdRef.current) return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return; }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); return; }
      if (typing()) return;
      if (e.key === 'Escape' && painter) { setPainter(null); return; }
      if (e.key === 'Enter' && selectedId) { e.preventDefault(); startEditing(selectedId); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); return; }

      // Arrow-key nudge, applied to every selected element. 1px, ×10 with Shift,
      // snapped to the grid when it is on. clampRect absorbs the move at the page
      // edge, so pressing Left against the left boundary is simply a no-op.
      const delta = ARROWS[e.key];
      if (delta && selectedIds.length && canManage) {
        const movable = selectedIds
          .map(id => elementsRef.current.find(x => x.id === id))
          .filter((el): el is CanvasElement => !!el && !el.locked);
        if (!movable.length) return;
        e.preventDefault();
        const step = (showGrid ? GRID_SIZE : 1) * (e.shiftKey ? 10 : 1);
        // Each element moves from its OWN origin, so a nudge never collapses a
        // multi-selection onto one point.
        let next = elementsRef.current;
        for (const el of movable) {
          next = applyChange(next, el.id, { x: el.x + delta[0] * step, y: el.y + delta[1] * step });
        }
        elementsRef.current = next;
        setElements(next);
        commitHistory(next);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds, canManage, showGrid, painter]);

  // Keep the canvas and the Layers list showing the same selection.
  useEffect(() => {
    if (!selectedId) return;
    nodeRefs.current[selectedId]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    layerRefs.current[selectedId]?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  // A freshly-saved template flashes in the Saved Templates list, then settles.
  useEffect(() => {
    if (highlightTemplateId == null) return;
    const t1 = setTimeout(() => layerRefs.current[`tpl-${highlightTemplateId}`]?.scrollIntoView({ block: 'nearest' }), 60);
    const t2 = setTimeout(() => setHighlightTemplateId(null), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [highlightTemplateId]);



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
  const selectionLocked = !canManage || !!selectedElement?.locked;
  /** A per-side padding box falls back to the uniform `padding` — exactly as
   *  `resolvePadding` does for the renderer, so the number you see is the
   *  number that prints. */
  const padOf = (el: CanvasElement, side: 'Top' | 'Right' | 'Bottom' | 'Left') =>
    (el as any)[`padding${side}`] ?? el.padding ?? 0;

  // Real-time name validation for the Save dialog (company-scoped, case-insensitive,
  // ignoring the template being edited so "Corporate Blue" can re-save as itself).
  const nameTrimmed = saveName.trim();
  const liveNameClash = isSaveModalOpen ? findNameClash(nameTrimmed) : null;
  const nameTooLong = saveName.length > MAX_TEMPLATE_NAME;
  const nameValid = !!nameTrimmed && !liveNameClash && !nameTooLong;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
      {/* The rich-text rules the PRINT document applies under `.el`, applied here
          under `.zh-rt`. Tailwind's preflight kills list markers and <b>/<i>
          defaults; without re-stating them the canvas and the PDF disagree about
          every bullet list and underline. One source, two scopes. */}
      <style dangerouslySetInnerHTML={{ __html: canvasTextCss('.zh-rt') }} />

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between p-2 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          {isGalleryMode && onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="mr-2 text-slate-500 hover:text-slate-700">
              <ArrowLeft size={16} className="mr-1" /> Back
            </Button>
          )}
          {saveName && (
            <div className="flex items-center gap-2 border-r border-slate-200 pr-3 mr-1">
              <span className="font-extrabold text-xs text-slate-800 truncate max-w-[180px]">{saveName}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                {editingTemplateId ? 'EDITING TEMPLATE' : 'TEMPLATE BUILDER'}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1 border-r border-slate-200 pr-3 mr-1">
            <Button size="sm" variant="outline" onClick={undo} disabled={historyIdx <= 0} icon={<RotateCcw size={14} />} title="Undo (Ctrl+Z)" />
            <Button size="sm" variant="outline" onClick={redo} disabled={historyIdx >= history.length - 1} icon={<RotateCcw size={14} className="rotate-180" />} title="Redo (Ctrl+Y)" />
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowGrid(!showGrid)}>{showGrid ? 'Hide Grid' : 'Show Grid'}</Button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(2)))} className="p-1 text-slate-500 hover:text-brand-600" title="Zoom out"><ZoomOut size={13} /></button>
          <span className="text-xs font-bold w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2.0, +(z + 0.1).toFixed(2)))} className="p-1 text-slate-500 hover:text-brand-600" title="Zoom in"><ZoomIn size={13} /></button>
          <div className="h-6 w-px bg-slate-200 mx-1" />
          <Button size="sm" variant="outline" icon={<Printer size={13} />} onClick={generateSample}>Preview PDF</Button>
          {isGalleryMode ? (
            <>
              <Button size="sm" variant="outline" onClick={() => { setSaveIntent('draft'); setIsSaveModalOpen(true); }} className="gap-2 shadow-sm h-8" disabled={!canManage}>
                <Save size={14} /> Save Draft
              </Button>
              <Button size="sm" onClick={() => { setSaveIntent('active'); setIsSaveModalOpen(true); }} className="bg-brand-600 hover:bg-brand-700 text-white gap-2 px-4 shadow-sm h-8" disabled={!canManage}>
                <Save size={14} /> Save & Activate
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setIsSaveModalOpen(true)} className="bg-brand-600 hover:bg-brand-700 text-white gap-2 px-4 shadow-sm h-8" disabled={!canManage}>
              <Save size={14} /> Save Template
            </Button>
          )}
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
                {/* Keyed by label, not type: Text / Watermark / Page Number /
                    Custom Field are all `type: 'text'`. */}
                {ELEMENT_TOOLS.map(t => (
                  <button key={t.label} onClick={() => addElement(t)} disabled={!canManage} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 text-left transition-all">
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
                  <p className="text-xs text-slate-500 text-center p-4">No custom templates saved yet. Design a layout and click "Save Template" to add one.</p>
                ) : savedLayouts.map(layout => {
                  // The backend already parsed layoutJson → `layout.layout` is the
                  // { blocks, category, visibility, description, status } object.
                  const meta: any = layout.layout || {};
                  const isEditing = String(editingTemplateId) === String(layout.id);
                  const isHighlighted = String(highlightTemplateId) === String(layout.id);
                  const isDraft = meta.status === 'Draft';
                  return (
                    <div key={layout.id} ref={n => { layerRefs.current[`tpl-${layout.id}`] = n; }}
                      className={`flex flex-col p-2 rounded-lg border text-left bg-white shadow-sm group transition-all duration-500 ${isHighlighted ? 'border-emerald-400 ring-2 ring-emerald-300 bg-emerald-50/60' : isEditing ? 'border-brand-400 ring-1 ring-brand-300' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'}`}>
                      <div className="flex gap-2">
                        <div className="w-16 aspect-[1/1.4] rounded bg-slate-100 relative overflow-hidden border border-slate-200 shrink-0 cursor-pointer" onClick={() => loadTemplate(meta, layout)} title="Open for editing">
                          <div className="absolute inset-0 opacity-20 bg-brand-600" />
                          <div className="absolute top-1 left-1 right-1 h-2 bg-white opacity-80 rounded-[1px]" />
                          <div className="absolute top-4 left-1 right-1 h-8 bg-white opacity-80 rounded-[1px]" />
                        </div>
                        <div className="flex-1 flex flex-col justify-between overflow-hidden">
                          <button onClick={() => loadTemplate(meta, layout)} disabled={!canManage} className="text-left w-full">
                            <div className="flex items-center gap-1 flex-wrap">
                              <p className="text-sm font-bold text-slate-800 truncate max-w-[110px]">{layout.name}</p>
                              {layout.isDefault && <span className="flex items-center gap-0.5 text-[8px] font-bold px-1 py-px rounded bg-amber-100 text-amber-700 uppercase"><Star size={7} className="fill-amber-500 text-amber-500" /> Default</span>}
                              {isDraft && <span className="text-[8px] font-bold px-1 py-px rounded bg-amber-100 text-amber-700 uppercase">Draft</span>}
                            </div>
                            <p className="text-[10px] text-slate-500 uppercase truncate">{meta.category || 'Custom'} • {meta.visibility || 'Company'}</p>
                            <p className="text-[9px] text-slate-400 truncate">Updated {formatDate(layout.updatedAt)}{layout.createdBy ? ` • ${layout.createdBy}` : ''}</p>
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
                         <button onClick={() => loadTemplate(meta, layout)} className="text-[10px] font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1"><PenTool size={10}/> Edit</button>
                         <div className="flex gap-1">
                           <button onClick={(e) => previewTemplate(layout, e)} className="p-1 text-slate-400 hover:text-emerald-600 rounded hover:bg-emerald-50" title="Preview"><Eye size={12} /></button>
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
             onPointerDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
          {/* Zoom wrapper. The page itself keeps its true 794×1123 coordinate space;
              only this wrapper takes the scaled footprint, so the scroll container can
              actually reach the page at 125% / 150% instead of clipping it. Element
              coordinates are never touched by zoom. */}
          <div style={{ width: A4_W * zoom, height: A4_H * zoom, flex: '0 0 auto' }}>
            <div ref={containerRef}
              // An element's pointerdown calls preventDefault() to stop native drags,
              // which also suppresses the focus change that would blur an open editor.
              // Blur it here, before that handler runs, so clicking away always saves.
              onPointerDownCapture={(e) => {
                if (editingIdRef.current && !(e.target as HTMLElement).isContentEditable) {
                  (document.activeElement as HTMLElement | null)?.blur?.();
                }
              }}
              onPointerDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
              style={{ width: A4_W, height: A4_H, transform: `scale(${zoom})`, transformOrigin: 'top left', backgroundColor: '#fff', position: 'relative', boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                backgroundImage: showGrid ? `linear-gradient(to right, #f1f5f9 1px, transparent 1px), linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)` : 'none',
                backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`
              }}>
               {/* Safe-area guide (20px). Not a clipping edge — see canvasBounds.ts. */}
               <div className="absolute pointer-events-none border border-dashed border-red-300/60"
                    style={{ left: MARGIN, top: MARGIN, right: MARGIN, bottom: MARGIN }} />

               {elements.map(el => (
                  <DraggableElement key={el.id} element={el} isSelected={selectedIds.includes(el.id)} isPrimary={selectedId === el.id} canManage={canManage} zoom={zoom}
                    snap={showGrid}
                    isEditing={editingId === el.id}
                    painting={!!painter}
                    editorRef={editorRef}
                    onStartEdit={() => startEditing(el.id)}
                    onFinishEdit={(html: string) => finishEditing(el.id, html)}
                    onCancelEdit={cancelEditing}
                    nodeRef={(n: HTMLDivElement | null) => { nodeRefs.current[el.id] = n; }}
                    onSelect={(additive: boolean) => selectElement(el.id, additive)}
                    onChange={(changes:any) => updateElement(el.id, changes, false)}
                    onCommit={() => commitHistory()}
                    brand={resolveBranding(company)}
                    qrData={qrData}
                    company={company}
                    allElements={elements}
                    setGuides={setGuides}
                    containerRef={containerRef}
                  />
               ))}

               {/* Alignment Guides — above the selected element (which renders at 9999). */}
               {guides.v !== null && <div className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none" style={{ left: guides.v, zIndex: 10001 }} />}
               {guides.h !== null && <div className="absolute left-0 right-0 h-px bg-red-500 pointer-events-none" style={{ top: guides.h, zIndex: 10001 }} />}
            </div>
          </div>
        </div>

        {/* ── Right Sidebar (Properties & Layers) ── */}
        <div className="w-72 bg-white border-l border-slate-200 flex flex-col shrink-0">
          {selectedElement ? (
             <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">Properties</h3>
                    {selectedIds.length > 1 && (
                      <p className="text-[10px] text-brand-600 font-semibold">{selectedIds.length} blocks selected</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {isTextEditable(selectedElement.type) && (
                      <button onClick={() => startEditing(selectedElement.id)} disabled={selectionLocked}
                        className="p-1.5 rounded hover:bg-brand-50 text-brand-600 disabled:opacity-40" title="Edit text (double-click or Enter)"><Pencil size={14} /></button>
                    )}
                    <button onClick={duplicateSelected} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Duplicate"><Copy size={14} /></button>
                    <button onClick={deleteSelected} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>

                {selectedIds.length > 1 && (
                  <p className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded p-2">
                    Typography changes apply to all selected blocks. Ctrl/Shift + click to add or remove one.
                  </p>
                )}

                {/* ── Rich text ── */}
                {isTextEditable(selectedElement.type) && (
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <RichTextToolbar
                      element={selectedElement}
                      targetCount={selectedIds.length}
                      disabled={selectionLocked}
                      editorRef={editorRef}
                      editing={editingId === selectedElement.id}
                      onStyle={changes => styleSelected(changes)}
                      onSetText={html => updateElement(selectedElement.id, { [textPropOf(selectedElement.type)]: html } as Partial<CanvasElement>)}
                      onEditorInput={syncEditorHtml}
                      onInsertToken={insertToken}
                      formatPainterActive={!!painter}
                      onToggleFormatPainter={toggleFormatPainter}
                    />

                    <div className="flex items-center justify-between">
                      <button onClick={() => startEditing(selectedElement.id)} disabled={selectionLocked}
                        className="text-[10px] font-bold text-brand-600 hover:text-brand-800 disabled:opacity-40 flex items-center gap-1">
                        <Pencil size={10} /> Edit on canvas
                      </button>
                      <button onClick={() => setShowSource(s => !s)}
                        className="text-[10px] font-bold text-slate-400 hover:text-slate-700">
                        {showSource ? 'Hide' : 'Show'} HTML source
                      </button>
                    </div>

                    {/* The escape hatch. The toolbar writes this same value, so a
                        power user can hand-tune markup or paste in {{tokens}}. */}
                    {showSource && (
                      <textarea className="w-full border border-slate-200 rounded p-2 text-[11px] font-mono" rows={4}
                        placeholder={seedTextFor(selectedElement) || 'Enter text...'}
                        value={getElementText(selectedElement)}
                        onChange={e => setElementText(selectedElement, e.target.value)}
                        onBlur={() => commitElementText(selectedElement.id)} />
                    )}
                  </div>
                )}

                {/* Image properties */}
                {(selectedElement.type === 'image' || selectedElement.type === 'logo' || selectedElement.type === 'signature') && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Image Source (URL)</label>
                    <input type="text" className="w-full mt-1 border border-slate-200 rounded p-2 text-xs" placeholder="Leave empty for default" value={selectedElement.content || ''} onChange={e => { updateElement(selectedId!, { content: e.target.value }); commitHistory(elements); }} />
                  </div>
                )}

                {/* Position, size, rotation, opacity */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Position &amp; Size</label>
                  <div className="grid grid-cols-2 gap-2">
                    <NumInput label="X" value={selectedElement.x} onChange={(v:number) => updateElement(selectedId!, { x: v })} onCommit={() => commitHistory(elements)} />
                    <NumInput label="Y" value={selectedElement.y} onChange={(v:number) => updateElement(selectedId!, { y: v })} onCommit={() => commitHistory(elements)} />
                    <NumInput label="W" value={selectedElement.w} onChange={(v:number) => updateElement(selectedId!, { w: v })} onCommit={() => commitHistory(elements)} />
                    <NumInput label="H" value={selectedElement.h} onChange={(v:number) => updateElement(selectedId!, { h: v })} onCommit={() => commitHistory(elements)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumInput label="Rotation °" value={selectedElement.rotation || 0} min={0} max={360}
                      onChange={(v:number) => styleSelected({ rotation: Math.max(0, Math.min(360, v)) } as any, false)} onCommit={() => commitHistory()} />
                    <NumInput label="Opacity" value={selectedElement.opacity ?? 1} step={0.05} max={1} min={0}
                      onChange={(v:number) => styleSelected({ opacity: Math.max(0, Math.min(1, v)) }, false)} onCommit={() => commitHistory()} />
                  </div>
                  <input type="range" min={0} max={360} value={selectedElement.rotation || 0} className="w-full accent-brand-600"
                    onChange={e => styleSelected({ rotation: Number(e.target.value) } as any, false)}
                    onPointerUp={() => commitHistory()} />
                </div>

                {/* Box: border, radius, padding */}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Background, Border &amp; Padding</label>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Text blocks also get this as "Highlight" in the toolbar; it is
                        the one `bg` property either way. Shapes only have it here. */}
                    <TextInput label="Background" type="color" value={selectedElement.bg || '#ffffff'} onChange={(v:string) => styleSelected({ bg: v })} />
                    <TextInput label="Border Color" type="color" value={selectedElement.borderColor || '#000000'} onChange={(v:string) => styleSelected({ borderColor: v })} />
                    <NumInput label="Border W" min={0} value={selectedElement.borderWidth || 0} onChange={(v:number) => styleSelected({ borderWidth: Math.max(0, v) }, false)} onCommit={() => commitHistory()} />
                    <div className="flex flex-col">
                      <label className="text-[9px] text-slate-400 uppercase">Border Style</label>
                      <select className="border border-slate-200 rounded p-1 text-xs bg-white"
                        value={selectedElement.borderStyle || 'none'}
                        onChange={e => styleSelected({ borderStyle: e.target.value })}>
                        {BORDER_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <NumInput label="Radius" min={0} value={selectedElement.borderRadius || 0} onChange={(v:number) => styleSelected({ borderRadius: Math.max(0, v) }, false)} onCommit={() => commitHistory()} />
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(['Top', 'Right', 'Bottom', 'Left'] as const).map(side => (
                      <NumInput key={side} label={side.slice(0, 1)} min={0} value={padOf(selectedElement, side)}
                        onChange={(v:number) => styleSelected({ [`padding${side}`]: Math.max(0, v) } as Partial<CanvasElement>, false)}
                        onCommit={() => commitHistory()} />
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-400">Padding: top / right / bottom / left (px)</p>
                </div>

                {/* Totals labels. The amounts stay computed; only the label text is yours. */}
                {selectedElement.type === 'totals' && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Row Labels</label>
                    {TOTALS_ROWS.map(row => (
                      <input key={row.key} type="text" className="w-full border border-slate-200 rounded p-1 text-xs"
                        placeholder={row.label}
                        value={selectedElement.totalsLabels?.[row.key] ?? ''}
                        onChange={e => updateElement(selectedId!, { totalsLabels: { ...(selectedElement.totalsLabels || {}), [row.key]: e.target.value } }, false)}
                        onBlur={() => commitHistory()} />
                    ))}
                  </div>
                )}

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

                {/* Default styles per document role. Saved with the template, so a
                    reopened layout writes new blocks in the same typography. */}
                <div className="space-y-1.5 border-t border-slate-100 pt-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Default Styles</label>
                  {STYLE_ROLES.map(({ key, label }) => {
                    const role = styleRoles[key];
                    return (
                      <div key={key} className="flex items-center justify-between gap-2 border border-slate-200 rounded p-1.5">
                        <span className="text-[11px] text-slate-700 truncate"
                          style={{ fontFamily: role.fontFamily, fontWeight: role.fontWeight as any, color: role.color }}>
                          {label} <span className="text-slate-400 font-normal">· {role.fontSize}px</span>
                        </span>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => styleSelected(role as Partial<CanvasElement>)} disabled={selectionLocked}
                            className="text-[9px] font-bold px-1.5 py-1 rounded bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40"
                            title={`Apply the ${label} style to the selection`}>Apply</button>
                          <button onClick={() => { setStyleRoles(r => ({ ...r, [key]: pickTypography(selectedElement) })); ui.toast.success(`${label} default updated`); }}
                            className="text-[9px] font-bold px-1.5 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                            title={`Save this block's typography as the ${label} default`}>Set</button>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[9px] text-slate-400">Saved with the template. New blocks start from these.</p>
                </div>
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
              {[...elements].sort((a,b) => b.zIndex - a.zIndex).map((el) => (
                <div key={el.id} ref={n => { layerRefs.current[el.id] = n; }}
                  onClick={e => selectElement(el.id, e.ctrlKey || e.metaKey || e.shiftKey)}
                  className={`flex items-center gap-2 p-1.5 rounded cursor-pointer text-xs ${selectedIds.includes(el.id) ? 'bg-brand-100 text-brand-800 ring-1 ring-brand-300' : 'hover:bg-slate-200 text-slate-700'}`}>
                  <span className="flex-1 truncate">{el.name}</span>
                  <div className="flex flex-col gap-0.5">
                    <button className="text-slate-400 hover:text-slate-800" onClick={(e) => { e.stopPropagation(); updateElement(el.id, { zIndex: el.zIndex + 1 }); }}><ArrowUp size={10} /></button>
                    <button className="text-slate-400 hover:text-slate-800" onClick={(e) => { e.stopPropagation(); updateElement(el.id, { zIndex: el.zIndex - 1 }); }}><ArrowDown size={10} /></button>
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
              <h3 className="font-bold text-slate-800">{editingTemplateId != null ? 'Update Template' : 'Save Custom Template'}</h3>
              <button onClick={() => setIsSaveModalOpen(false)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Template Name <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input ref={saveNameRef} type="text" value={saveName} maxLength={MAX_TEMPLATE_NAME}
                    onChange={e => { setSaveName(e.target.value); if (dupClash) setDupClash(null); }}
                    placeholder="e.g. Corporate Blue GST"
                    onKeyDown={e => { if (e.key === 'Enter' && !dupClash) submitSaveTemplate(); }}
                    className={`w-full border rounded p-2 pr-24 text-sm outline-none focus:ring-1 ${liveNameClash ? 'border-red-400 focus:border-red-500 focus:ring-red-400' : nameTrimmed ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-400' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500'}`} autoFocus />
                  {/* Live status while typing: Available / Already Exists. */}
                  {nameTrimmed && !nameTooLong && (
                    <span className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-bold ${liveNameClash ? 'text-red-500' : 'text-emerald-600'}`}>
                      {liveNameClash ? <><X size={12} /> Already Exists</> : <><Check size={12} /> Available</>}
                    </span>
                  )}
                </div>
                {nameTooLong
                  ? <p className="mt-1 text-[10px] text-red-500">Maximum {MAX_TEMPLATE_NAME} characters.</p>
                  : <p className="mt-1 text-[10px] text-slate-400">{saveName.length}/{MAX_TEMPLATE_NAME} · duplicates are checked within this company only.</p>}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description (Optional)</label>
                <textarea value={saveDescription} onChange={e => setSaveDescription(e.target.value)} placeholder="e.g. Modern invoice for GST customers." rows={2} className="w-full border border-slate-300 rounded p-2 text-sm focus:border-brand-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                  <select value={saveStatus} onChange={e => setSaveStatus(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm focus:border-brand-500 outline-none">
                    <option value="Active">Active</option>
                    <option value="Draft">Draft</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Available For</label>
                <select value={saveVisibility} onChange={e => setSaveVisibility(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-sm focus:border-brand-500 outline-none">
                  <option value="Company">This Company Only</option>
                  <option value="Branches">All Branches</option>
                  <option value="Private">Private (only me)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 cursor-pointer">
                <input type="checkbox" checked={saveMakeDefault} onChange={e => setSaveMakeDefault(e.target.checked)} className="accent-brand-600" />
                <span className="text-xs">
                  <span className="font-bold text-slate-700">Set as default template</span>
                  <span className="block text-[10px] text-slate-500">New invoices will use this template automatically.</span>
                </span>
              </label>
            </div>
            {/* Duplicate-name resolution — shown in place of the normal footer when
                a save collides with an existing template. Fields above stay intact
                so "Rename" simply returns the cursor to the name box. */}
            {dupClash ? (
              <div className="px-5 py-4 bg-amber-50 border-t border-amber-200 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900">
                    A template named <b>“{dupClash.name || saveName.trim()}”</b> already exists. What would you like to do?
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={resolveRename}>Rename Template</Button>
                  {dupClash.id != null
                    ? <Button variant="outline" size="sm" onClick={resolveOpenExisting}>Open Existing</Button>
                    : <span />}
                  <Button variant="outline" size="sm" disabled={saveSaving} onClick={resolveSaveAsCopy}>Save as Copy</Button>
                  {canManage && dupClash.id != null
                    ? <Button variant="danger" size="sm" disabled={saveSaving} onClick={resolveOverwrite}>Overwrite</Button>
                    : <span />}
                </div>
                <button onClick={() => setDupClash(null)} className="w-full text-[11px] font-semibold text-slate-500 hover:text-slate-800 pt-1">Cancel</button>
              </div>
            ) : (
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsSaveModalOpen(false)}>Cancel</Button>
                <Button variant="primary" size="sm" disabled={saveSaving || !nameValid} onClick={submitSaveTemplate}>
                  {saveSaving ? 'Saving...' : (editingTemplateId != null ? 'Update Template' : (isGalleryMode && saveIntent === 'active' ? 'Save & Activate' : 'Save Template'))}
                </Button>
              </div>
            )}
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

// ── Inline text editor ──
// Rendered INSIDE the element's own node, so the element is never recreated: its
// position, size, rotation, opacity, z-order and typography all keep applying.
// Only the text is captured, on blur or Enter (Shift+Enter = newline, Esc = cancel).
const InlineTextEditor = ({ html, onSave, onCancel, editorRef }: {
  html: string; onSave: (h: string) => void; onCancel: () => void;
  editorRef?: React.RefObject<HTMLDivElement | null>;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (editorRef) editorRef.current = node;   // the toolbar formats through this
    node.innerHTML = html;
    node.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);      // typing replaces, clicking places a caret
    sel?.removeAllRanges();
    sel?.addRange(range);
    return () => { if (editorRef) editorRef.current = null; };
  }, []);

  const commit = () => {
    if (settled.current) return;         // Escape already settled it, or blur ran twice
    settled.current = true;
    onSave(normalizeRichHtml(ref.current?.innerHTML || ''));
  };

  return (
    <div
      className="zh-rt"
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      // Swallow the gestures the canvas would otherwise read as drag/select/edit.
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onBlur={commit}
      onPaste={e => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      onKeyDown={e => {
        e.stopPropagation();
        // Enter is a NEW LINE, not a commit: a bullet list needs it to make the
        // next item, and multi-line addresses are the norm here. Ctrl/Cmd+Enter
        // commits, Escape cancels, clicking away commits (blur).
        if (e.key === 'Escape') { e.preventDefault(); settled.current = true; onCancel(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
      }}
      style={{
        width: '100%', height: '100%', overflow: 'auto',
        outline: '2px solid #6c3cf0', outlineOffset: 1,
        background: 'rgba(255,255,255,0.75)',
        cursor: 'text', userSelect: 'text', WebkitUserSelect: 'text',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}
    />
  );
};

// ── Draggable Element ──
const DraggableElement = ({ element, isSelected, isPrimary, canManage, zoom, snap, nodeRef, onSelect, onChange, onCommit, brand, company, qrData, allElements, setGuides, containerRef,
                           isEditing, painting, editorRef, onStartEdit, onFinishEdit, onCancelEdit }: any) => {
  const movable = canManage && !element.locked;
  const editable = movable && isTextEditable(element.type);

  // The page keeps its own 794×1123 coordinate space; `zoom` only scales its visual
  // box. Dividing the pointer offset by the scale converts screen px → page px, so
  // coordinates are identical at 50% and 150%.
  const getPointerCoords = (e: React.PointerEvent | PointerEvent) => {
    if (!containerRef?.current) return { x: e.clientX / zoom, y: e.clientY / zoom };
    const rect = containerRef.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  };

  const handlePointerDown = (e: React.PointerEvent, action: 'move' | 'resize', dir?: string) => {
    if (!canManage) return;
    if (isEditing) return;   // the caret owns the pointer while text is being edited
    e.stopPropagation();
    // Stops the browser starting a native text-selection or image drag. Without
    // this, pressing on a logo/QR/image began an HTML5 drag and the element never
    // followed the cursor — a large part of "dragging does nothing".
    e.preventDefault();
    // Select first: a locked element must still be inspectable in the Properties
    // and Layers panels, it just cannot be moved.
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    onSelect(additive);
    // Extending a selection, or painting formatting onto a block, is not a drag.
    if (element.locked || additive || painting) return;

    const node = e.currentTarget as HTMLElement;
    try { node.setPointerCapture(e.pointerId); } catch { /* not supported */ }

    const startCoords = getPointerCoords(e);
    const initX = element.x, initY = element.y, initW = element.w, initH = element.h;

    // Coalesce to one update per animation frame — a fast mouse fires pointermove
    // far more often than the compositor paints, and each one re-renders the canvas.
    let frame = 0;
    let pending: PointerEvent | null = null;

    const compute = (ev: PointerEvent) => {
      const cur = getPointerCoords(ev);
      const dx = cur.x - startCoords.x;
      const dy = cur.y - startCoords.y;
      const SNAP_DIST = 5;
      let guideH: number | null = null;
      let guideV: number | null = null;
      let rect = { x: initX, y: initY, w: initW, h: initH };

      if (action === 'move') {
        let x = initX + dx;
        let y = initY + dy;
        const w = initW, h = initH;

        if (snap && !ev.altKey) { x = snapTo(x); y = snapTo(y); }

        // Smart alignment snapping (page centre, safe area, sibling edges).
        const pageCenterX = A4_W / 2, pageCenterY = A4_H / 2;
        if (Math.abs(x + w / 2 - pageCenterX) < SNAP_DIST) { x = pageCenterX - w / 2; guideV = pageCenterX; }
        if (Math.abs(y + h / 2 - pageCenterY) < SNAP_DIST) { y = pageCenterY - h / 2; guideH = pageCenterY; }
        if (Math.abs(x - MARGIN) < SNAP_DIST) { x = MARGIN; guideV = MARGIN; }
        if (Math.abs(x + w - (A4_W - MARGIN)) < SNAP_DIST) { x = A4_W - MARGIN - w; guideV = A4_W - MARGIN; }
        if (Math.abs(y - MARGIN) < SNAP_DIST) { y = MARGIN; guideH = MARGIN; }
        if (Math.abs(y + h - (A4_H - MARGIN)) < SNAP_DIST) { y = A4_H - MARGIN - h; guideH = A4_H - MARGIN; }

        (allElements || []).forEach((el: any) => {
          if (el.id === element.id) return;
          if (Math.abs(x - el.x) < SNAP_DIST) { x = el.x; guideV = el.x; }
          if (Math.abs(y - el.y) < SNAP_DIST) { y = el.y; guideH = el.y; }
          if (Math.abs(x + w - (el.x + el.w)) < SNAP_DIST) { x = el.x + el.w - w; guideV = el.x + el.w; }
          if (Math.abs(y + h - (el.y + el.h)) < SNAP_DIST) { y = el.y + el.h - h; guideH = el.y + el.h; }
        });

        rect = { x, y, w, h };
      } else if (action === 'resize' && dir) {
        // Work in edges, then stop the DRAGGED edge at the boundary. The old code
        // derived w from (initX - newX) after clamping newX, which let the opposite
        // edge run off the page.
        let left = initX, top = initY, right = initX + initW, bottom = initY + initH;
        if (dir.includes('e')) right = initX + initW + dx;
        if (dir.includes('w')) left = initX + dx;
        if (dir.includes('s')) bottom = initY + initH + dy;
        if (dir.includes('n')) top = initY + dy;

        if (snap && !ev.altKey) { left = snapTo(left); right = snapTo(right); top = snapTo(top); bottom = snapTo(bottom); }

        // Never smaller than the element's minimum, measured from the anchored edge.
        const min = minSizeFor(element.type);
        if (right - left < min) { if (dir.includes('w')) left = right - min; else right = left + min; }
        if (bottom - top < min) { if (dir.includes('n')) top = bottom - min; else bottom = top + min; }

        // Stop the dragged edge at the page — or at the safe area, for an element
        // that is not already bleeding. `freeAxes` reads the element's CURRENT
        // geometry, so a full-bleed banner resizes to the page edge while ordinary
        // text stops at the margin. Either way it can never grow past the page.
        const { freeX, freeY } = freeAxes(element);
        left = Math.max(left, minEdge(freeX));
        right = Math.min(right, maxEdge(freeX, A4_W));
        top = Math.max(top, minEdge(freeY));
        bottom = Math.min(bottom, maxEdge(freeY, A4_H));

        rect = { x: left, y: top, w: right - left, h: bottom - top };
      }

      // The invariant, asserted one last time regardless of which branch ran.
      const safe = clampRect(rect, element, minSizeFor(element.type));
      if (setGuides) setGuides((prev: any) => (prev?.h === guideH && prev?.v === guideV) ? prev : { h: guideH, v: guideV });
      onChange(safe);
    };

    const onPointerMove = (ev: PointerEvent) => {
      pending = ev;
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; if (pending) compute(pending); });
    };

    const onPointerUp = () => {
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      if (pending) compute(pending);           // never drop the last move
      if (setGuides) setGuides({ h: null, v: null });
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      try { node.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      onCommit(); // one history entry per gesture
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const elStyle: React.CSSProperties = {
    position: 'absolute',
    left: element.x, top: element.y, width: element.w, height: element.h,
    // Selected elements paint above the rest so their handles are always grabbable.
    // This is a RENDER-time lift only: element.zIndex is untouched, so merely
    // clicking a layer can never silently reorder the saved document.
    zIndex: isSelected ? 9999 : element.zIndex,
    transform: `rotate(${element.rotation || 0}deg)`,
    opacity: element.opacity,
    // Every declaration `renderCanvasHtml` emits for this element must be emitted
    // here too, or the canvas lies about the PDF. fontWeight / fontStyle /
    // textDecoration / letterSpacing / lineHeight used to be missing: the print
    // path honoured them, the editor silently ignored them.
    fontFamily: element.fontFamily, fontSize: element.fontSize,
    fontWeight: element.fontWeight as any, fontStyle: element.fontStyle,
    textDecoration: element.textDecoration,
    textTransform: element.textTransform as any,
    letterSpacing: element.letterSpacing !== undefined ? `${element.letterSpacing}px` : undefined,
    lineHeight: element.lineHeight,
    color: element.color, textAlign: element.textAlign,
    backgroundColor: element.bg,
    borderWidth: element.borderWidth, borderColor: element.borderColor, borderStyle: element.borderStyle,
    borderRadius: element.borderRadius,
    padding: resolvePadding(element)?.map((v: number) => `${v}px`).join(' '),
    cursor: isEditing ? 'text' : painting ? 'copy' : !canManage ? 'default' : element.locked ? 'not-allowed' : 'move',
    wordWrap: 'break-word', overflow: 'hidden',
    // A drag must not turn into a text selection or a native image drag — except
    // while the inline editor is open, where selecting text is the whole point.
    userSelect: isEditing ? 'text' : 'none',
    WebkitUserSelect: isEditing ? 'text' : 'none',
    touchAction: isEditing ? 'auto' : 'none',
    // The primary of a multi-selection gets the solid ring — it is the one the
    // Properties panel describes and the one inline editing opens on.
    boxShadow: !isSelected ? 'none' : isPrimary ? '0 0 0 2px #6c3cf0' : '0 0 0 2px #b29bfa'
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

  // A block the user has typed into renders that text, here and in the PDF alike.
  // Untouched blocks keep their data-driven default.
  const storedText = isTextEditable(element.type) ? getElementText(element) : '';
  const hasText = storedText.trim() !== '';
  const textHtml = () => canvasTextHtml(element, SAMPLE_INVOICE, company);

  // Generate preview content internally to match what invoiceDocHtml does roughly for the editor
  let content = null;
  switch (element.type) {
    case 'text':
    case 'customSection':
      content = <div dangerouslySetInnerHTML={{ __html: textHtml() }} />;
      break;
    case 'image':
      content = element.content ? <img src={element.content} draggable={false} className="w-full h-full object-contain" /> : <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-400">[Image]</div>;
      break;
    case 'stamp':
      content = hasText
        ? <div dangerouslySetInnerHTML={{ __html: textHtml() }} />
        : <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-400">[Stamp]</div>;
      break;
    case 'logo': {
      const isUrl = brand.logo && (brand.logo.includes('/') || brand.logo.includes('.') || brand.logo.startsWith('data:'));
      content = (brand.hasLogo && isUrl) 
        ? <img src={brand.logo} draggable={false} className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> 
        : <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold rounded text-center p-2">{brand.logo && brand.logo.length <= 4 ? brand.logo : '[Company Logo]'}</div>;
      break;
    }
    case 'signature': {
      const isSigUrl = brand.signature && (brand.signature.includes('/') || brand.signature.includes('.') || brand.signature.startsWith('data:'));
      const sigImg = (brand.hasSignature && isSigUrl)
        ? <img src={brand.signature} draggable={false} className="w-full object-contain" style={{ height: hasText ? '70%' : '100%' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        : null;
      content = hasText
        ? <>{sigImg}<div dangerouslySetInnerHTML={{ __html: textHtml() }} /></>
        : sigImg || <div className="w-full h-full border border-dashed flex items-center justify-center text-slate-400 text-xs text-center p-2">[Signature]</div>;
      break;
    }
    case 'qr':
      content = <img src={qrData} draggable={false} className="w-full h-full object-contain" />;
      break;
    case 'barcode':
      content = <div className="w-full h-full border border-dashed flex items-center justify-center">|||||||||||||||</div>;
      break;
    case 'companyDetails':
      content = hasText
        ? <div dangerouslySetInnerHTML={{ __html: textHtml() }} />
        : <div><strong>{company?.name || 'Company Name'}</strong><br/>{company?.address || 'Address'}</div>;
      break;
    case 'customerDetails':
      content = hasText
        ? <div dangerouslySetInnerHTML={{ __html: textHtml() }} />
        : <div><strong>Customer Name</strong><br/>Customer Address</div>;
      break;
    case 'itemTable':
      content = <div className="w-full h-full border border-dashed bg-slate-50 flex items-center justify-center">[Item Table Preview]</div>;
      break;
    case 'totals':
      content = <div className="w-full h-full border border-dashed bg-slate-50 flex flex-col justify-end items-end p-2 text-sm"><div>{totalsLabel(element, 'subtotal')}: ₹0.00</div><div><strong>{totalsLabel(element, 'grandTotal')}: ₹0.00</strong></div></div>;
      break;
    case 'bankDetails':
      content = hasText
        ? <div dangerouslySetInnerHTML={{ __html: textHtml() }} />
        : <div><strong>Bank Details</strong><br/>HDFC Bank<br/>A/C: XXXX</div>;
      break;
    case 'paymentInfo':
      // Data-driven default from the sample invoice (real invoices use their own
      // Payment Mode + UPI ID; empty values simply don't render on the invoice).
      content = hasText
        ? <div dangerouslySetInnerHTML={{ __html: textHtml() }} />
        : <div><strong>Payment Information</strong><br/>Payment Mode: {SAMPLE_INVOICE.paymentMode}<br/>UPI ID: {SAMPLE_INVOICE.upiId}</div>;
      break;
    case 'terms':
      content = hasText
        ? <div dangerouslySetInnerHTML={{ __html: textHtml() }} />
        : <div><strong>Terms & Conditions</strong><br/>Payment due 30 days</div>;
      break;
    case 'notes':
      content = hasText
        ? <div dangerouslySetInnerHTML={{ __html: textHtml() }} />
        : <div><strong>Notes</strong><br/>Thank you!</div>;
      break;
  }

  const Handle = ({ dir, style }: any) => (
    <div onPointerDown={e => handlePointerDown(e, 'resize', dir)}
         style={{ position: 'absolute', width: 8, height: 8, background: '#fff', border: '1px solid #6c3cf0', borderRadius: '50%', ...style }} />
  );

  return (
    // `zh-rt` scopes the list/bold/underline rules that the print document
    // applies under `.el` — same declarations, so canvas === PDF.
    <div ref={nodeRef} className="zh-rt" style={elStyle} data-el-id={element.id} data-el-locked={element.locked ? '1' : '0'}
      onPointerDown={e => handlePointerDown(e, 'move')}
      onDoubleClick={e => { if (editable && !isEditing) { e.stopPropagation(); onStartEdit(); } }}
      onDragStart={e => e.preventDefault()}>
      {isEditing
        ? <InlineTextEditor
            html={storedText || seedTextFor(element)}
            editorRef={editorRef}
            onSave={onFinishEdit}
            onCancel={onCancelEdit} />
        : content}
      {/* Resize handles */}
      {isSelected && movable && !isEditing && (
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
