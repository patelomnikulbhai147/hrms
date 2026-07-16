// ─────────────────────────────────────────────────────────────────────────────
// Visual (drag-and-drop) Invoice Designer — Phase 1.
//
// A WYSIWYG canvas: blocks are absolutely positioned on an A4 page and rendered
// with the SAME renderBlockHtml() used by the print/PDF path (canvasDocHtml), so
// preview === PDF. Add from the Blocks Library, drag/resize on the canvas, edit in
// the Properties Panel, and save named layouts per company. Entirely additive —
// invoices only use a layout when it is set Active; otherwise the classic flow
// templates are unchanged.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Save, Trash2, Copy, Eye, Star, Layers, Lock, Unlock, ChevronUp, ChevronDown,
  X, LayoutTemplate, MousePointer2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { resolveBranding } from '@/services/brandingService';
import {
  A4_PAGE, BLOCK_LIBRARY, BLOCK_LABEL, LAYOUT_PRESETS, DEFAULT_LAYOUT, resolveLayout, renderBlockHtml,
  canvasDocHtml, SAMPLE_INVOICE, type InvoiceLayout, type CanvasBlock, type BlockType, type BlockStyle,
} from './invoiceCanvas';

const uid = () => `b_${Math.random().toString(36).slice(2, 9)}`;

// ── Draggable / resizable frame (design-space px; parent is CSS-scaled). ───────
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
const HANDLE: React.CSSProperties = { position: 'absolute', width: 9, height: 9, background: '#fff', border: '1.5px solid #C77E52', borderRadius: 2, zIndex: 5 };
const BlockFrame: React.FC<{ block: CanvasBlock; scale: number; selected: boolean; onSelect: () => void; onChange: (p: Partial<CanvasBlock>) => void; children: React.ReactNode }> = ({ block, scale, selected, onSelect, onChange, children }) => {
  const start = useRef<any>(null);
  const begin = useCallback((handle: Handle, e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault(); onSelect();
    if (block.locked) return;
    start.current = { handle, px: e.clientX, py: e.clientY, x: block.x, y: block.y, w: block.w, h: block.h };
    const move = (ev: PointerEvent) => {
      const s = start.current; if (!s) return;
      const dx = (ev.clientX - s.px) / scale, dy = (ev.clientY - s.py) / scale;
      if (s.handle === 'move') { onChange({ x: Math.round(s.x + dx), y: Math.round(s.y + dy) }); return; }
      let { x, y, w, h } = s; const min = 16;
      if (s.handle.includes('e')) w = Math.max(min, s.w + dx);
      if (s.handle.includes('s')) h = Math.max(min, s.h + dy);
      if (s.handle.includes('w')) { w = Math.max(min, s.w - dx); x = s.x + (s.w - w); }
      if (s.handle.includes('n')) { h = Math.max(min, s.h - dy); y = s.y + (s.h - h); }
      onChange({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    };
    const up = () => { start.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }, [block, scale, onChange, onSelect]);
  const corner = (h: Handle, css: React.CSSProperties): React.CSSProperties => ({ ...HANDLE, ...css, cursor: `${h}-resize` });
  return (
    <div onPointerDown={(e) => begin('move', e)}
      style={{ position: 'absolute', left: block.x, top: block.y, width: block.w, height: block.h, cursor: block.locked ? 'default' : 'move', outline: selected ? '1.5px solid #C77E52' : '1px dashed rgba(79,124,255,0.35)', outlineOffset: 1, boxSizing: 'border-box' }}>
      {children}
      {selected && !block.locked && (['nw', { left: -5, top: -5 }, 'ne', { right: -5, top: -5 }, 'sw', { left: -5, bottom: -5 }, 'se', { right: -5, bottom: -5 }, 'n', { left: '50%', marginLeft: -5, top: -5 }, 's', { left: '50%', marginLeft: -5, bottom: -5 }, 'e', { right: -5, top: '50%', marginTop: -5 }, 'w', { left: -5, top: '50%', marginTop: -5 }] as any[])
        .reduce((acc: any[], cur, i, arr) => (i % 2 === 0 ? [...acc, [cur, arr[i + 1]]] : acc), [])
        .map(([h, css]: any) => <div key={h} onPointerDown={(e) => begin(h, e)} style={corner(h, css)} />)}
    </div>
  );
};

// ── Properties panel field helpers ────────────────────────────────────────────
const Num: React.FC<{ label: string; value: any; onChange: (v: number) => void; step?: number }> = ({ label, value, onChange, step = 1 }) => (
  <label className="flex flex-col gap-1"><span className="text-[10px] font-bold text-slate-500">{label}</span>
    <input type="number" step={step} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-[#C77E52] focus:outline-none" /></label>
);
const Col: React.FC<{ label: string; value?: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <label className="flex flex-col gap-1"><span className="text-[10px] font-bold text-slate-500">{label}</span>
    <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="h-7 w-full cursor-pointer rounded border border-slate-200" /></label>
);

interface Props { company: any; }

export const InvoiceCanvasDesigner: React.FC<Props> = ({ company }) => {
  const [layouts, setLayouts] = useState<any[]>([]);
  const [layout, setLayout] = useState<InvoiceLayout>(() => DEFAULT_LAYOUT());
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(760);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const measure = () => setWrapW(el.clientWidth);
    measure(); const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();
  }, []);

  const loadLayouts = useCallback(async () => {
    try {
      const r = await api.invoicing.listLayouts();
      const rows = r?.layouts || [];
      setLayouts(rows);
      const active = rows.find((x: any) => x.isDefault);
      setActiveId(active ? active.id : null);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  }, []);
  useEffect(() => { loadLayouts(); }, [loadLayouts]);

  const ctx = useMemo(() => ({ inv: SAMPLE_INVOICE, company, branding: resolveBranding(company) }), [company]);
  const scale = Math.min(1, (wrapW - 24) / A4_PAGE.width) * zoom;
  const sel = layout.blocks.find((b) => b.id === selId) || null;

  // ── Block ops ───────────────────────────────────────────────────────────────
  const patchBlock = (id: string, p: Partial<CanvasBlock>) => setLayout((l) => ({ ...l, blocks: l.blocks.map((b) => b.id === id ? { ...b, ...p } : b) }));
  const patchStyle = (id: string, p: Partial<BlockStyle>) => setLayout((l) => ({ ...l, blocks: l.blocks.map((b) => b.id === id ? { ...b, style: { ...b.style, ...p } } : b) }));
  const addBlock = (type: BlockType) => {
    const def = BLOCK_LIBRARY.find((d) => d.type === type)!;
    const maxZ = layout.blocks.reduce((m, b) => Math.max(m, b.z ?? 0), 0);
    const b: CanvasBlock = { id: uid(), type, x: A4_PAGE.margin + 20, y: A4_PAGE.margin + 20, w: def.w, h: def.h, z: maxZ + 1, content: def.content, visible: true };
    setLayout((l) => ({ ...l, blocks: [...l.blocks, b] })); setSelId(b.id);
  };
  const removeBlock = (id: string) => { setLayout((l) => ({ ...l, blocks: l.blocks.filter((b) => b.id !== id) })); if (selId === id) setSelId(null); };
  const duplicateBlock = (id: string) => {
    const b = layout.blocks.find((x) => x.id === id); if (!b) return;
    const copy = { ...b, id: uid(), x: b.x + 16, y: b.y + 16, z: (b.z ?? 0) + 1 };
    setLayout((l) => ({ ...l, blocks: [...l.blocks, copy] })); setSelId(copy.id);
  };
  const bumpZ = (id: string, dir: 1 | -1) => setLayout((l) => ({ ...l, blocks: l.blocks.map((b) => b.id === id ? { ...b, z: (b.z ?? 0) + dir } : b) }));

  // ── Layout ops ──────────────────────────────────────────────────────────────
  const newFromPreset = (presetId: string) => {
    const p = LAYOUT_PRESETS.find((x) => x.id === presetId); if (!p) return;
    setLayout(p.build()); setCurrentId(null); setSelId(null);
  };
  const loadLayout = async (id: number) => {
    try { const r = await api.invoicing.getLayout(id); setLayout(resolveLayout(r.layout)); setCurrentId(id); setSelId(null); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const save = async () => {
    const name = (layout.name || '').trim() || 'Untitled Layout';
    setSaving(true);
    try {
      const saved = await api.invoicing.saveLayout(currentId, { name, layout: { name, page: layout.page, blocks: layout.blocks }, companyId: company?.id });
      setCurrentId(saved.id); await loadLayouts(); ui.toast.success('Layout saved.');
    } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not save the layout.')); }
    finally { setSaving(false); }
  };
  const rename = async () => {
    const name = await ui.prompt({ title: 'Layout name', message: 'Name this layout (e.g. Modern, Export, Retail):', defaultValue: layout.name, confirmText: 'Rename' });
    if (name == null) return;
    setLayout((l) => ({ ...l, name: String(name).trim() || l.name }));
  };
  const setActive = async (makeActive: boolean) => {
    if (!currentId) { ui.toast.warning('Save the layout first.'); return; }
    try { await api.invoicing.setLayoutDefault(currentId, makeActive); await loadLayouts(); ui.toast.success(makeActive ? 'This layout is now ACTIVE — new invoice PDFs use it.' : 'Canvas layout deactivated — invoices revert to the classic templates.'); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const deleteLayout = async () => {
    if (!currentId) return;
    if (!(await ui.confirm({ message: `Delete layout "${layout.name}"?`, variant: 'danger', confirmText: 'Delete' }))) return;
    try { await api.invoicing.deleteLayout(currentId); setCurrentId(null); setLayout(DEFAULT_LAYOUT()); await loadLayouts(); ui.toast.success('Layout deleted.'); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const openPrint = () => {
    const html = canvasDocHtml(SAMPLE_INVOICE, company, layout, { print: true });
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { ui.toast.error('Allow pop-ups to preview the PDF.'); return; }
    w.document.write(html); w.document.close();
  };

  const isActive = currentId != null && currentId === activeId;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><LayoutTemplate size={14} className="text-[#C77E52]" /> Canvas Layouts</div>
        <select value={currentId ?? ''} onChange={(e) => e.target.value ? loadLayout(Number(e.target.value)) : (setLayout(DEFAULT_LAYOUT()), setCurrentId(null))}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-[#C77E52] focus:outline-none">
          <option value="">— New layout —</option>
          {layouts.map((l) => <option key={l.id} value={l.id}>{l.name}{l.isDefault ? '  ★ active' : ''}</option>)}
        </select>
        <select onChange={(e) => { if (e.target.value) { newFromPreset(e.target.value); e.target.value = ''; } }} defaultValue=""
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-[#C77E52] focus:outline-none">
          <option value="">Start from preset…</option>
          {LAYOUT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="text-xs font-bold text-slate-700">{layout.name}</span>
        <button onClick={rename} className="text-[11px] font-semibold text-[#C77E52] hover:underline">rename</button>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" icon={<Eye size={13} />} onClick={openPrint}>Preview PDF</Button>
          <Button size="sm" variant="outline" icon={<Save size={13} />} loading={saving} onClick={save}>Save</Button>
          {isActive
            ? <Button size="sm" variant="outline" icon={<Star size={13} className="fill-amber-400 text-amber-500" />} onClick={() => setActive(false)}>Active — Deactivate</Button>
            : <Button size="sm" icon={<Star size={13} />} onClick={() => setActive(true)}>Set Active</Button>}
          {currentId && <Button size="sm" variant="outline" icon={<Trash2 size={13} />} onClick={deleteLayout}>Delete</Button>}
        </div>
      </div>

      {isActive && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">★ This canvas layout is ACTIVE — new invoice PDFs &amp; previews render from it. Deactivate to revert to the classic flow templates.</div>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[170px_1fr_240px]">
        {/* Blocks Library */}
        <div className="rounded-xl border border-slate-200 bg-white p-2">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-500"><Plus size={13} /> Blocks</p>
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            {BLOCK_LIBRARY.map((d) => (
              <button key={d.type} onClick={() => addBlock(d.type)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-left text-[11px] font-semibold text-slate-600 hover:border-[#C77E52] hover:text-[#C77E52]">
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div ref={wrapRef} className="min-w-0 overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
            <MousePointer2 size={12} /> Click a block to edit · drag to move · handles to resize
            <span className="ml-auto flex items-center gap-1">
              <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} className="rounded border border-slate-200 bg-white px-1.5">−</button>
              <span className="w-10 text-center font-mono">{Math.round(scale * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))} className="rounded border border-slate-200 bg-white px-1.5">+</button>
            </span>
          </div>
          <div style={{ width: A4_PAGE.width * scale, height: A4_PAGE.height * scale, margin: '0 auto' }}>
            <div onPointerDown={() => setSelId(null)}
              style={{ width: A4_PAGE.width, height: A4_PAGE.height, background: layout.page.background || '#fff', position: 'relative', transform: `scale(${scale})`, transformOrigin: '0 0', boxShadow: '0 2px 16px rgba(0,0,0,.12)', overflow: 'hidden' }}>
              {layout.blocks.slice().sort((a, b) => (a.z ?? 0) - (b.z ?? 0)).map((b) => (
                b.visible === false ? null : (
                  <BlockFrame key={b.id} block={b} scale={scale} selected={selId === b.id} onSelect={() => setSelId(b.id)} onChange={(p) => patchBlock(b.id, p)}>
                    <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: renderBlockHtml(b, ctx) }} />
                  </BlockFrame>
                )
              ))}
            </div>
          </div>
        </div>

        {/* Properties Panel */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          {!sel ? (
            <p className="py-8 text-center text-[11px] text-slate-400">Select a block to edit its properties, or add one from the Blocks panel.</p>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600">{BLOCK_LABEL[sel.type] || sel.type}</span>
                <div className="flex items-center gap-1">
                  <button title={sel.locked ? 'Unlock' : 'Lock'} onClick={() => patchBlock(sel.id, { locked: !sel.locked })} className="rounded p-1 hover:bg-slate-100">{sel.locked ? <Lock size={13} className="text-amber-500" /> : <Unlock size={13} className="text-slate-500" />}</button>
                  <button title="Duplicate" onClick={() => duplicateBlock(sel.id)} className="rounded p-1 hover:bg-slate-100"><Copy size={13} className="text-slate-500" /></button>
                  <button title="Delete" onClick={() => removeBlock(sel.id)} className="rounded p-1 hover:bg-rose-50"><Trash2 size={13} className="text-rose-500" /></button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Num label="X" value={sel.x} onChange={(v) => patchBlock(sel.id, { x: v })} />
                <Num label="Y" value={sel.y} onChange={(v) => patchBlock(sel.id, { y: v })} />
                <Num label="Width" value={sel.w} onChange={(v) => patchBlock(sel.id, { w: v })} />
                <Num label="Height" value={sel.h} onChange={(v) => patchBlock(sel.id, { h: v })} />
              </div>

              {(sel.type === 'text' || sel.type === 'custom' || sel.type === 'notes' || sel.type === 'terms' || sel.type === 'image') && (
                <label className="flex flex-col gap-1"><span className="text-[10px] font-bold text-slate-500">{sel.type === 'image' ? 'Image URL / data URI' : 'Content'}</span>
                  <textarea value={sel.content || ''} onChange={(e) => patchBlock(sel.id, { content: e.target.value })} rows={sel.type === 'image' ? 2 : 3} className="w-full rounded-lg border border-slate-200 p-1.5 text-xs focus:border-[#C77E52] focus:outline-none" placeholder={sel.type === 'text' || sel.type === 'custom' ? 'Supports {{invoice_number}}, {{company_name}}, {{grand_total}}…' : ''} /></label>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Num label="Font size" value={sel.style?.fontSize ?? 12} onChange={(v) => patchStyle(sel.id, { fontSize: v })} />
                <Num label="Weight" value={sel.style?.fontWeight ?? 400} step={100} onChange={(v) => patchStyle(sel.id, { fontWeight: v })} />
                <Col label="Text color" value={sel.style?.color} onChange={(v) => patchStyle(sel.id, { color: v })} />
                <Col label="Background" value={sel.style?.background} onChange={(v) => patchStyle(sel.id, { background: v })} />
                <Num label="Padding" value={sel.style?.padding ?? 0} onChange={(v) => patchStyle(sel.id, { padding: v })} />
                <Num label="Radius" value={sel.style?.borderRadius ?? 0} onChange={(v) => patchStyle(sel.id, { borderRadius: v })} />
                <Num label="Border" value={sel.style?.borderWidth ?? 0} onChange={(v) => patchStyle(sel.id, { borderWidth: v })} />
                <Col label="Border color" value={sel.style?.borderColor} onChange={(v) => patchStyle(sel.id, { borderColor: v })} />
              </div>

              <div className="flex items-center gap-1">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button key={a} onClick={() => patchStyle(sel.id, { align: a })} className={`flex-1 rounded-lg border px-2 py-1 text-[10px] font-bold capitalize ${sel.style?.align === a ? 'border-[#C77E52] bg-[#FCF4EE] text-[#C77E52]' : 'border-slate-200 text-slate-500'}`}>{a}</button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <button onClick={() => bumpZ(sel.id, 1)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-slate-700"><ChevronUp size={12} /> Forward</button>
                <button onClick={() => bumpZ(sel.id, -1)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-slate-700"><ChevronDown size={12} /> Back</button>
                <button onClick={() => patchBlock(sel.id, { visible: sel.visible === false })} className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold ${sel.visible === false ? 'border-slate-200 text-slate-400' : 'border-[#C77E52] text-[#C77E52]'}`}>{sel.visible === false ? 'Hidden' : 'Visible'}</button>
              </div>
            </div>
          )}
          <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
            <Layers size={11} className="mr-1 inline" /> {layout.blocks.length} block(s) · A4 {A4_PAGE.width}×{A4_PAGE.height}px
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceCanvasDesigner;
