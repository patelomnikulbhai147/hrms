// ─────────────────────────────────────────────────────────────────────────────
// Template Gallery — browse built-in + company templates, see front & back
// previews, and act (Preview / Use / Duplicate / Edit / Set Default / Delete).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from 'react';
import { Eye, Check, Copy, Pencil, Star, Trash2, Share2, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CardCanvas } from './CardCanvas';
import type { CardTemplate } from '@/types/cardDesigner';
import { cardDimensions } from '@/types/cardDesigner';
import { TEMPLATE_CATEGORIES } from '@/data/cardTemplates';

interface Props {
  templates: CardTemplate[];
  activeId?: string;
  sample: any;
  branding: any;
  companyId?: number | string;
  canEdit: boolean;
  isSuperAdmin?: boolean;
  onPreview: (t: CardTemplate) => void;
  onUse: (t: CardTemplate) => void;
  onDuplicate: (t: CardTemplate) => void;
  onEdit: (t: CardTemplate) => void;
  onDelete?: (t: CardTemplate) => void;
  onSetDefault?: (t: CardTemplate) => void;
  onShare?: (t: CardTemplate) => void;
}

// Every thumbnail is contained (object-fit: contain style) inside one fixed box
// so portrait, CR80 and landscape "info" cards share consistent dimensions,
// stay centred, and are never cropped, stretched or rotated.
const Thumb: React.FC<{ t: CardTemplate; side: 'front' | 'back'; sample: any; branding: any; companyId?: any; boxW: number; boxH: number }> = ({ t, side, sample, branding, companyId, boxW, boxH }) => {
  const dims = cardDimensions(t.size, t.orientation);
  const scale = Math.min(boxW / dims.w, boxH / dims.h);
  return (
    <div style={{ width: boxW, height: boxH }} className="flex items-center justify-center">
      <CardCanvas template={t} side={side} employee={sample} branding={branding} companyId={companyId} sample scale={scale} style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.12)', borderRadius: 8 }} />
    </div>
  );
};

export const TemplateGallery: React.FC<Props> = ({ templates, activeId, sample, branding, companyId, canEdit, isSuperAdmin, onPreview, onUse, onDuplicate, onEdit, onDelete, onSetDefault, onShare }) => {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const cats = useMemo(() => ['All', ...TEMPLATE_CATEGORIES], []);

  const shown = useMemo(() => templates.filter((t) => {
    if (cat !== 'All' && (t.category || 'Custom') !== cat) return false;
    if (q && !`${t.name} ${t.category}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [templates, cat, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-[#6C3CF0] outline-none" />
        </div>
        <div className="flex flex-wrap gap-1">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border ${cat === c ? 'bg-[#6C3CF0] text-white border-[#6C3CF0]' : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'}`}>{c}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {shown.map((t) => (
          <div key={t.id} className={`rounded-2xl border bg-white p-3 transition ${activeId === t.id ? 'border-[#6C3CF0] ring-1 ring-[#6C3CF0]/30' : 'border-slate-200 hover:border-slate-300'}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-800 truncate flex items-center gap-1.5">{t.name}{t.isDefault && <Star size={12} className="text-amber-500 fill-amber-400" />}</p>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{t.category} · {t.size}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {t.custom ? <Badge variant="indigo">Custom</Badge> : <Badge variant="gray">Built-in</Badge>}
                {t.shared && <Badge variant="green">Shared</Badge>}
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 p-3">
              <div className="text-center">
                <Thumb t={t} side="front" sample={sample} branding={branding} companyId={companyId} boxW={118} boxH={92} />
                <p className="mt-1 text-[9px] text-slate-400 font-bold uppercase">Front</p>
              </div>
              <div className="text-center">
                <Thumb t={t} side="back" sample={sample} branding={branding} companyId={companyId} boxW={118} boxH={92} />
                <p className="mt-1 text-[9px] text-slate-400 font-bold uppercase">Back</p>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Button size="sm" icon={<Check size={13} />} onClick={() => onUse(t)}>Use</Button>
              <Button size="sm" variant="outline" icon={<Eye size={13} />} onClick={() => onPreview(t)}>Preview</Button>
              {canEdit && <Button size="sm" variant="outline" icon={<Pencil size={13} />} onClick={() => onEdit(t)}>Edit</Button>}
              {canEdit && <Button size="sm" variant="outline" icon={<Copy size={13} />} onClick={() => onDuplicate(t)}>Duplicate</Button>}
              {canEdit && t.custom && onSetDefault && !t.isDefault && <button title="Set as default" onClick={() => onSetDefault(t)} className="p-1.5 rounded-lg hover:bg-amber-50"><Star size={14} className="text-amber-500" /></button>}
              {isSuperAdmin && t.custom && onShare && <button title={t.shared ? 'Unshare' : 'Share to all companies'} onClick={() => onShare(t)} className="p-1.5 rounded-lg hover:bg-emerald-50"><Share2 size={14} className={t.shared ? 'text-emerald-600' : 'text-slate-400'} /></button>}
              {canEdit && t.custom && onDelete && <button title="Delete" onClick={() => onDelete(t)} className="p-1.5 rounded-lg hover:bg-rose-50"><Trash2 size={14} className="text-rose-600" /></button>}
            </div>
          </div>
        ))}
        {shown.length === 0 && <p className="col-span-full text-center text-xs text-slate-400 py-10">No templates match your search.</p>}
      </div>
    </div>
  );
};

export default TemplateGallery;
