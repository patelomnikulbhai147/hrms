// ─────────────────────────────────────────────────────────────────────────────
// CardDesigner — full drag / resize / rotate / align editor for a card template.
// Controlled: parent owns the working `template` and receives every change via
// onChange. Left = field palette + layer list (show/hide); centre = the live
// editable card (front/back); right = properties of the selected element.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from 'react';
import {
  Plus, Eye, EyeOff, Trash2, Save, Copy, RotateCw, AlignLeft, AlignCenter, AlignRight,
  ArrowUp, ArrowDown, Type, Square, Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { CardCanvas } from './CardCanvas';
import type { CardElement, CardElementType, CardTemplate, CardTheme } from '@/types/cardDesigner';
import { cardDimensions, CARD_SIZES, CARD_THEMES, FIELD_CATALOG, FIELD_LABEL } from '@/types/cardDesigner';

interface Props {
  template: CardTemplate;
  onChange: (t: CardTemplate) => void;
  employee: any; branding: any; companyId?: number | string;
  onSave: () => void; saving?: boolean; canEdit: boolean;
}

const uid = () => `el_${Math.random().toString(36).slice(2, 9)}`;

export const CardDesigner: React.FC<Props> = ({ template, onChange, employee, branding, companyId, onSave, saving, canEdit }) => {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [selId, setSelId] = useState<string | null>(null);
  const dims = cardDimensions(template.size, template.orientation);
  const viewScale = Math.min(1.6, 440 / dims.h);

  const els = useMemo(() => template.elements.filter((e) => e.side === side), [template, side]);
  const selected = template.elements.find((e) => e.id === selId) || null;

  // ── mutations ───────────────────────────────────────────────────────────────
  const patch = (t: Partial<CardTemplate>) => onChange({ ...template, ...t });
  const updateEl = (id: string, p: Partial<CardElement>) => patch({ elements: template.elements.map((e) => e.id === id ? { ...e, ...p, style: p.style ? { ...e.style, ...p.style } : e.style } : e) });
  const removeEl = (id: string) => { patch({ elements: template.elements.filter((e) => e.id !== id) }); if (selId === id) setSelId(null); };
  const addEl = (type: CardElementType) => {
    const isImg = ['photo', 'companyLogo', 'signature', 'qr', 'barcode', 'backgroundImage', 'watermark'].includes(type);
    const el: CardElement = {
      id: uid(), type, side, x: Math.round(dims.w * 0.2), y: Math.round(dims.h * 0.2),
      w: isImg ? 80 : Math.round(dims.w * 0.5), h: isImg ? 80 : 28, visible: true,
      text: type === 'text' ? 'Text' : undefined,
      tint: type === 'box' || type === 'divider' ? 'primary' : 'text',
      style: { fontSize: 13, fontWeight: 600, align: 'left' },
      z: template.elements.length,
    };
    patch({ elements: [...template.elements, el] }); setSelId(el.id);
  };
  const duplicateEl = (el: CardElement) => { const c = { ...el, id: uid(), x: el.x + 10, y: el.y + 10 }; patch({ elements: [...template.elements, c] }); setSelId(c.id); };
  const bringZ = (el: CardElement, dir: 1 | -1) => updateEl(el.id, { z: (el.z ?? 0) + dir * 2 });
  const align = (where: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!selected) return;
    if (where === 'left') updateEl(selected.id, { x: 8 });
    if (where === 'center') updateEl(selected.id, { x: Math.round((dims.w - selected.w) / 2) });
    if (where === 'right') updateEl(selected.id, { x: dims.w - selected.w - 8 });
    if (where === 'top') updateEl(selected.id, { y: 8 });
    if (where === 'middle') updateEl(selected.id, { y: Math.round((dims.h - selected.h) / 2) });
    if (where === 'bottom') updateEl(selected.id, { y: dims.h - selected.h - 8 });
  };

  const setTheme = (theme: CardTheme) => patch({ theme });
  const setThemeColor = (key: keyof CardTheme, val: string) => patch({ theme: { ...template.theme, [key]: val } });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr_240px] gap-3">
      {/* ── Left: palette + layers ── */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wide mb-2">Add Field</p>
          <div className="grid grid-cols-2 gap-1 max-h-52 overflow-y-auto pr-1">
            {FIELD_CATALOG.map((f) => (
              <button key={f.type} disabled={!canEdit} onClick={() => addEl(f.type)} title={f.label}
                className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:border-[#4F7CFF] hover:text-[#4F7CFF] disabled:opacity-40 truncate">
                {f.type === 'text' ? <Type size={11} /> : f.type === 'box' ? <Square size={11} /> : f.type === 'divider' ? <Minus size={11} /> : <Plus size={11} />}
                <span className="truncate">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wide mb-2">Layers · {side}</p>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {els.length === 0 && <p className="text-[11px] text-slate-400">No elements on this side.</p>}
            {els.map((el) => (
              <div key={el.id} onClick={() => setSelId(el.id)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer text-[11px] ${selId === el.id ? 'bg-[#EDF4FF] text-[#4F7CFF]' : 'hover:bg-slate-50 text-slate-600'}`}>
                <button onClick={(e) => { e.stopPropagation(); updateEl(el.id, { visible: el.visible === false }); }} className="shrink-0">
                  {el.visible === false ? <EyeOff size={13} className="text-slate-400" /> : <Eye size={13} />}
                </button>
                <span className="flex-1 truncate font-semibold">{el.type === 'text' ? (el.text || 'Text') : FIELD_LABEL[el.type]}</span>
                {canEdit && <button onClick={(e) => { e.stopPropagation(); removeEl(el.id); }}><Trash2 size={12} className="text-slate-300 hover:text-rose-500" /></button>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Centre: editable card ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5">
          <Input value={template.name} onChange={(e) => patch({ name: e.target.value })} className="!py-1.5 text-xs w-40" />
          <Select value={template.size} onChange={(e) => patch({ size: e.target.value as any })} className="!py-1.5 text-xs"
            options={CARD_SIZES.map((s) => ({ value: s.id, label: s.id }))} />
          <Select value={template.orientation} onChange={(e) => patch({ orientation: e.target.value as any })} className="!py-1.5 text-xs"
            options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} />
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {(['front', 'back'] as const).map((s) => (
              <button key={s} onClick={() => setSide(s)} className={`px-3 py-1.5 text-[11px] font-bold ${side === s ? 'bg-[#4F7CFF] text-white' : 'text-slate-500'}`}>{s === 'front' ? 'Front' : 'Back'}</button>
            ))}
          </div>
          <div className="flex-1" />
          {canEdit && <Button size="sm" icon={<Save size={13} />} loading={saving} onClick={onSave}>Save Template</Button>}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-6 flex items-center justify-center min-h-[480px] overflow-auto">
          <CardCanvas template={template} side={side} employee={employee} branding={branding} companyId={companyId}
            scale={viewScale} editing={canEdit} selectedId={selId}
            onSelectElement={setSelId} onChangeElement={updateEl}
            style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.18)', borderRadius: 12 }} />
        </div>

        {/* Theme + colours */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500">Theme</span>
            <select onChange={(e) => { const th = CARD_THEMES.find((t) => t.id === e.target.value); if (th) setTheme(th.theme); }} className="text-[11px] rounded-lg border border-slate-200 px-2 py-1.5">
              <option>Choose…</option>
              {CARD_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            {(['primary', 'secondary', 'accent', 'text', 'bg'] as (keyof CardTheme)[]).map((k) => (
              <label key={k} className="flex flex-col items-center gap-0.5" title={k}>
                <input type="color" value={template.theme[k]} onChange={(e) => setThemeColor(k, e.target.value)} className="w-7 h-7 rounded border border-slate-200 cursor-pointer" />
                <span className="text-[8px] text-slate-400 uppercase">{k.slice(0, 4)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: properties ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wide mb-2">Properties</p>
        {!selected ? <p className="text-[11px] text-slate-400">Select an element on the card to edit it, or add a field from the left.</p> : (
          <div className="space-y-2.5 text-[11px]">
            <p className="font-bold text-slate-700">{selected.type === 'text' ? 'Custom Text' : FIELD_LABEL[selected.type]}</p>

            {selected.type === 'text' && <Input label="Text" value={selected.text || ''} onChange={(e) => updateEl(selected.id, { text: e.target.value })} className="!py-1.5 text-xs" />}

            <div className="grid grid-cols-2 gap-1.5">
              <NumF label="X" v={selected.x} on={(n) => updateEl(selected.id, { x: n })} />
              <NumF label="Y" v={selected.y} on={(n) => updateEl(selected.id, { y: n })} />
              <NumF label="W" v={selected.w} on={(n) => updateEl(selected.id, { w: n })} />
              <NumF label="H" v={selected.h} on={(n) => updateEl(selected.id, { h: n })} />
            </div>

            <div className="flex items-center gap-2">
              <RotateCw size={13} className="text-slate-400" />
              <input type="range" min={0} max={359} value={selected.rotation || 0} onChange={(e) => updateEl(selected.id, { rotation: Number(e.target.value) })} className="flex-1" />
              <span className="w-8 text-right tabular-nums text-slate-500">{selected.rotation || 0}°</span>
            </div>

            {/* Alignment on card */}
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Align</span>
              <IconMini onClick={() => align('left')}><AlignLeft size={13} /></IconMini>
              <IconMini onClick={() => align('center')}><AlignCenter size={13} /></IconMini>
              <IconMini onClick={() => align('right')}><AlignRight size={13} /></IconMini>
              <IconMini onClick={() => align('middle')}><AlignCenter size={13} className="rotate-90" /></IconMini>
            </div>

            {/* Text props */}
            {!['photo', 'companyLogo', 'signature', 'qr', 'barcode', 'backgroundImage', 'divider', 'box'].includes(selected.type) && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <NumF label="Font" v={selected.style?.fontSize || 12} on={(n) => updateEl(selected.id, { style: { fontSize: n } })} />
                  <NumF label="Weight" v={selected.style?.fontWeight || 600} on={(n) => updateEl(selected.id, { style: { fontWeight: n } })} />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">Text</span>
                  <IconMini active={selected.style?.align === 'left'} onClick={() => updateEl(selected.id, { style: { align: 'left' } })}><AlignLeft size={13} /></IconMini>
                  <IconMini active={selected.style?.align === 'center'} onClick={() => updateEl(selected.id, { style: { align: 'center' } })}><AlignCenter size={13} /></IconMini>
                  <IconMini active={selected.style?.align === 'right'} onClick={() => updateEl(selected.id, { style: { align: 'right' } })}><AlignRight size={13} /></IconMini>
                  <label className="ml-1 flex items-center gap-1"><input type="checkbox" checked={!!selected.label} onChange={(e) => updateEl(selected.id, { label: e.target.checked })} />label</label>
                </div>
              </>
            )}

            {/* Colour */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Colour</span>
              <input type="color" value={selected.style?.color || '#0f172a'} onChange={(e) => updateEl(selected.id, { style: { color: e.target.value } })} className="w-7 h-7 rounded border border-slate-200" />
              <select value={selected.tint || 'none'} onChange={(e) => updateEl(selected.id, { tint: e.target.value as any, style: { color: undefined } })} className="text-[10px] rounded border border-slate-200 px-1 py-1 flex-1">
                {['none', 'primary', 'secondary', 'accent', 'text', 'bg'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
              <IconMini onClick={() => bringZ(selected, 1)} title="Bring forward"><ArrowUp size={13} /></IconMini>
              <IconMini onClick={() => bringZ(selected, -1)} title="Send back"><ArrowDown size={13} /></IconMini>
              <IconMini onClick={() => duplicateEl(selected)} title="Duplicate"><Copy size={13} /></IconMini>
              <IconMini onClick={() => updateEl(selected.id, { visible: selected.visible === false })} title="Show/Hide">{selected.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}</IconMini>
              <button onClick={() => removeEl(selected.id)} className="ml-auto p-1.5 rounded-lg hover:bg-rose-50"><Trash2 size={13} className="text-rose-600" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const NumF: React.FC<{ label: string; v: number; on: (n: number) => void }> = ({ label, v, on }) => (
  <label className="flex items-center gap-1 rounded-lg border border-slate-200 px-1.5 py-1">
    <span className="text-slate-400 w-8">{label}</span>
    <input type="number" value={Math.round(v)} onChange={(e) => on(Number(e.target.value))} className="w-full text-[11px] outline-none tabular-nums" />
  </label>
);
const IconMini: React.FC<{ onClick: () => void; children: React.ReactNode; active?: boolean; title?: string }> = ({ onClick, children, active, title }) => (
  <button title={title} onClick={onClick} className={`p-1.5 rounded-lg border ${active ? 'border-[#4F7CFF] text-[#4F7CFF] bg-[#EDF4FF]' : 'border-slate-200 text-slate-500 hover:text-slate-700'}`}>{children}</button>
);

export default CardDesigner;
