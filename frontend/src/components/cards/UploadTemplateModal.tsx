// ─────────────────────────────────────────────────────────────────────────────
// Upload Custom Template — turn a company's own ID-card artwork into a real
// CardTemplate.
//
// The uploaded image becomes a full-bleed `backgroundImage` element; the usual
// dynamic fields (photo, name, employee id, QR…) are laid on top as ordinary
// elements. That means the design is mapped ONCE in the existing drag/resize
// editor and every employee then renders on it automatically — nothing here is
// per-employee, and none of the export, print or bulk paths need to know that a
// template came from an upload rather than a built-in.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { ui } from '@/components/ui/feedback';
import { ARTWORK_ACCEPT, prepareCardArtwork, prettyBytes, type ArtworkResult } from '@/utils/cardArtwork';
import { CARD_SIZES, cardDimensions, type CardOrientation, type CardSizeId, type CardTemplate, type CardElement } from '@/types/cardDesigner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Persist the built template; the caller owns the API call and the reload. */
  onSave: (t: CardTemplate) => Promise<void>;
}

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

/**
 * The starting field layout placed on top of the artwork. Positions are a
 * sensible first guess only — the whole point of the mapping editor is that the
 * admin drags them where their design expects them. They are laid out down the
 * lower half so they are unlikely to sit on top of a header/logo band.
 */
function starterElements(size: CardSizeId, orientation: CardOrientation, artwork: string, backArtwork: string): CardElement[] {
  const { w, h } = cardDimensions(size, orientation);
  const pad = Math.round(w * 0.08);
  const colW = w - pad * 2;
  const photoW = Math.round(w * 0.36);

  const els: CardElement[] = [
    // Full-bleed artwork, pinned behind everything.
    { id: uid('bg'), type: 'backgroundImage', side: 'front', x: 0, y: 0, w, h, z: 0, src: artwork, style: { objectFit: 'cover' } },
    { id: uid('photo'), type: 'photo', side: 'front', x: Math.round((w - photoW) / 2), y: Math.round(h * 0.26), w: photoW, h: Math.round(photoW * 1.2), z: 2, style: { radius: 8, objectFit: 'cover' } },
    { id: uid('name'), type: 'name', side: 'front', x: pad, y: Math.round(h * 0.62), w: colW, h: 26, z: 2, style: { fontSize: 15, fontWeight: 800, align: 'center' } },
    { id: uid('desig'), type: 'designation', side: 'front', x: pad, y: Math.round(h * 0.69), w: colW, h: 18, z: 2, style: { fontSize: 11, align: 'center' } },
    { id: uid('empid'), type: 'employeeId', side: 'front', x: pad, y: Math.round(h * 0.75), w: colW, h: 18, z: 2, style: { fontSize: 11, fontWeight: 700, align: 'center' } },
    { id: uid('qr'), type: 'qr', side: 'front', x: Math.round((w - 56) / 2), y: Math.round(h * 0.81), w: 56, h: 56, z: 2 },
  ];

  if (backArtwork) {
    els.push(
      { id: uid('bgb'), type: 'backgroundImage', side: 'back', x: 0, y: 0, w, h, z: 0, src: backArtwork, style: { objectFit: 'cover' } },
      { id: uid('bar'), type: 'barcode', side: 'back', x: pad, y: Math.round(h * 0.72), w: colW, h: 44, z: 2 },
    );
  }
  return els;
}

export const UploadTemplateModal: React.FC<Props> = ({ open, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [orientation, setOrientation] = useState<CardOrientation>('portrait');
  const [size, setSize] = useState<CardSizeId>('CR80');
  const [front, setFront] = useState<ArtworkResult | null>(null);
  const [back, setBack] = useState<ArtworkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<'front' | 'back' | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  const reset = () => { setName(''); setOrientation('portrait'); setSize('CR80'); setFront(null); setBack(null); };
  const close = () => { if (busy) return; reset(); onClose(); };

  const pick = async (file: File | undefined, which: 'front' | 'back') => {
    if (!file) return;
    setReading(which);
    try {
      const art = await prepareCardArtwork(file);
      (which === 'front' ? setFront : setBack)(art);
      // Offer the file's own name as the template name — one less thing to type.
      if (which === 'front' && !name) setName(file.name.replace(/\.[^.]+$/, '').slice(0, 60));
      // A landscape image almost certainly means a landscape card.
      if (which === 'front' && art.width && art.height) {
        setOrientation(art.width > art.height ? 'landscape' : 'portrait');
      }
    } catch (e: any) {
      ui.toast.error(e?.message || 'That file could not be used.');
    } finally {
      setReading(null);
    }
  };

  const save = async () => {
    if (!front) { ui.toast.warning('Upload your card design first.'); return; }
    if (!name.trim()) { ui.toast.warning('Give the template a name.'); return; }
    setBusy(true);
    try {
      const tpl: CardTemplate = {
        id: `upload_${Date.now()}`,
        name: name.trim(),
        category: 'Custom',
        size,
        orientation,
        theme: { primary: '#1f2937', secondary: '#4b5563', accent: '#C77E52', text: '#111827', bg: '#ffffff' },
        elements: starterElements(size, orientation, front.dataUrl, back?.dataUrl || ''),
        custom: true,
      };
      await onSave(tpl);
      reset();
      onClose();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not save the template.');
    } finally {
      setBusy(false);
    }
  };

  const Drop: React.FC<{ which: 'front' | 'back'; art: ArtworkResult | null; label: string; hint: string; inputRef: React.RefObject<HTMLInputElement | null> }> =
    ({ which, art, label, hint, inputRef }) => (
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[11px] font-bold text-slate-600">{label}</span>
          {art && <button type="button" onClick={() => (which === 'front' ? setFront : setBack)(null)} className="text-[10px] font-semibold text-rose-600 hover:underline">Remove</button>}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`w-full rounded-xl border-2 border-dashed p-4 text-center transition ${art ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 hover:border-brand-400 bg-slate-50'}`}
        >
          {reading === which ? (
            <span className="inline-flex items-center gap-2 text-[12px] text-slate-500"><Loader2 size={14} className="animate-spin" /> Reading…</span>
          ) : art ? (
            <span className="block">
              <img src={art.dataUrl} alt="" className="mx-auto max-h-28 rounded-lg shadow-sm" />
              <span className="mt-2 block text-[10px] text-slate-500">
                {art.width ? `${art.width}×${art.height}px · ` : 'Vector · '}{prettyBytes(art.storedBytes)}
                {art.downscaled && <span className="text-emerald-600"> · optimised for storage</span>}
              </span>
            </span>
          ) : (
            <span className="block text-[12px] text-slate-500">
              <ImageIcon size={18} className="mx-auto mb-1 text-slate-400" />
              Click to choose a file
              <span className="mt-0.5 block text-[10px] text-slate-400">{hint}</span>
            </span>
          )}
        </button>
        <input ref={inputRef} type="file" accept={ARTWORK_ACCEPT} className="hidden"
          onChange={(e) => { pick(e.target.files?.[0], which); e.currentTarget.value = ''; }} />
      </div>
    );

  return (
    <Modal open={open} onClose={close} title="Upload Custom Template" size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <span className="text-[10px] text-slate-400 hidden sm:block">
            After saving, drag the employee fields onto your design once — every employee then uses it automatically.
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={close} disabled={busy}>Cancel</Button>
            <Button size="sm" icon={<Upload size={13} />} loading={busy} onClick={save} disabled={!front || !name.trim()}>
              Save &amp; Map Fields
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-left">
        <p className="text-[11px] text-slate-500">
          Upload your own card artwork as <strong>PNG, JPG or SVG</strong> (max 10&nbsp;MB). Large images are
          automatically optimised for storage — print quality is unaffected.
          PDF designs are not supported yet; export them as PNG first.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Drop which="front" art={front} label="Front design *" hint="Required" inputRef={frontRef} />
          <Drop which="back" art={back} label="Back design" hint="Optional" inputRef={backRef} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Template Name *" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Company Blue Card" />
          <Select label="Card Orientation" value={orientation} onChange={(e) => setOrientation(e.target.value as CardOrientation)}
            options={[{ value: 'portrait', label: 'Vertical (Portrait)' }, { value: 'landscape', label: 'Horizontal (Landscape)' }]} />
          <Select label="Card Size" value={size} onChange={(e) => setSize(e.target.value as CardSizeId)}
            options={CARD_SIZES.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
      </div>
    </Modal>
  );
};

export default UploadTemplateModal;
