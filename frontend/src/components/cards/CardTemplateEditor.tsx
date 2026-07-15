// ─────────────────────────────────────────────────────────────────────────────
// CardTemplateEditor — a DEDICATED full-page wrapper around <CardDesigner> that
// adds the professional editor chrome: Undo / Redo / Reset, Preview, Version
// History (restore) and the Save / Save As New / Cancel actions. It owns the
// working `draft` and never touches the gallery or the active-template selection
// (editing a template does NOT make it active — that stays a Use Template action).
//
// Reuses the existing drag/resize/align designer (CardDesigner) and renderer
// (CardCanvas) — no new design engine. Versions are snapshotted inside the
// template spec (JSON), so there is no schema change.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useRef, useState } from 'react';
import { Undo2, Redo2, RotateCcw, History, Eye, Save, Copy, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { CardDesigner } from './CardDesigner';
import { CardCanvas } from './CardCanvas';
import type { CardTemplate } from '@/types/cardDesigner';
import { cardDimensions } from '@/types/cardDesigner';
import { cloneTemplate } from '@/data/cardTemplates';
import { saveCustomTemplate } from '@/store/cardTemplateStore';
import { formatDate } from '@/utils/formatDate';

// A saved snapshot kept in template.versions (design only — never nested versions).
interface TplVersion {
  v: number;
  name: string;
  at: string;
  design: Pick<CardTemplate, 'theme' | 'frontBg' | 'backBg' | 'elements' | 'size' | 'orientation'>;
}

interface Props {
  template: CardTemplate;
  employee: any; branding: any; companyId?: number | string;
  canEdit: boolean;
  onClose: () => void;
  /** Parent reloads the gallery; asNew=true when a brand-new template was created. */
  onSaved: (saved: CardTemplate, opts: { asNew: boolean }) => void;
}

const versionsOf = (t: CardTemplate): TplVersion[] => ((t as any).versions as TplVersion[]) || [];

export const CardTemplateEditor: React.FC<Props> = ({ template, employee, branding, companyId, canEdit, onClose, onSaved }) => {
  const original = useMemo(() => cloneTemplate(template), [template]);
  const [draft, setDraft] = useState<CardTemplate>(() => cloneTemplate(template));
  const [past, setPast] = useState<CardTemplate[]>([]);
  const [future, setFuture] = useState<CardTemplate[]>([]);
  const [saving, setSaving] = useState<null | 'save' | 'saveAs'>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const dirtyRef = useRef(false);
  // Coalesce a continuous burst of designer edits (a drag fires onChange on every
  // pointermove) into ONE undo step, captured 500ms after the burst settles.
  const burst = useRef<{ base: CardTemplate | null; timer: any }>({ base: null, timer: null });

  const pushPast = (base: CardTemplate) => setPast((p) => [...p.slice(-59), base]);
  const flushBurst = () => {
    if (burst.current.timer) { clearTimeout(burst.current.timer); burst.current.timer = null; }
    if (burst.current.base) { pushPast(burst.current.base); burst.current.base = null; }
  };

  // Continuous edits from the designer.
  const onChange = (next: CardTemplate) => {
    if (!burst.current.base) burst.current.base = draft;
    if (burst.current.timer) clearTimeout(burst.current.timer);
    burst.current.timer = setTimeout(() => {
      if (burst.current.base) { pushPast(burst.current.base); burst.current.base = null; }
      burst.current.timer = null;
    }, 500);
    setDraft(next); setFuture([]); dirtyRef.current = true;
  };

  // Discrete, immediately-recorded change (reset / restore version).
  const commit = (next: CardTemplate) => {
    flushBurst(); pushPast(draft); setDraft(next); setFuture([]); dirtyRef.current = true;
  };

  const undo = () => {
    // A pending burst's base IS the previous state — undo straight to it.
    if (burst.current.base) {
      if (burst.current.timer) { clearTimeout(burst.current.timer); burst.current.timer = null; }
      const base = burst.current.base; burst.current.base = null;
      setFuture((f) => [draft, ...f].slice(0, 60)); setDraft(base); dirtyRef.current = true; return;
    }
    if (!past.length) return;
    const prev = past[past.length - 1];
    setFuture((f) => [draft, ...f].slice(0, 60));
    setPast((p) => p.slice(0, -1));
    setDraft(prev); dirtyRef.current = true;
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setPast((p) => [...p.slice(-59), draft]);
    setFuture((f) => f.slice(1));
    setDraft(next); dirtyRef.current = true;
  };

  // Append a version snapshot (design only) — capped, newest first.
  const buildVersioned = (base: CardTemplate): CardTemplate => {
    const prev = versionsOf(base);
    const nextV = (prev[0]?.v || 0) + 1;
    const snap: TplVersion = {
      v: nextV, name: `${base.name} V${nextV}`, at: new Date().toISOString(),
      design: { theme: base.theme, frontBg: base.frontBg, backBg: base.backBg, elements: base.elements, size: base.size, orientation: base.orientation },
    };
    return { ...base, versions: [snap, ...prev].slice(0, 8) } as any;
  };

  const persist = async (base: CardTemplate, asNew: boolean, label: string) => {
    setSaving(asNew ? 'saveAs' : 'save');
    try {
      const saved = await saveCustomTemplate(buildVersioned(base));
      setDraft(cloneTemplate(saved)); // adopt the new dbId so further Saves update in place
      setPast([]); setFuture([]); dirtyRef.current = false;
      ui.toast.success(label);
      onSaved(saved, { asNew });
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not save the template.');
    } finally { setSaving(null); }
  };

  // Save: a custom template updates in place; a built-in becomes a new custom copy.
  const doSave = async () => {
    if (!canEdit) return; flushBurst();
    const fromBuiltin = !draft.dbId;
    await persist(
      { ...draft, custom: true, builtinId: draft.builtinId || (fromBuiltin ? draft.id : undefined) },
      fromBuiltin,
      fromBuiltin ? 'Saved as a new custom template.' : 'Template saved.',
    );
  };

  // Save As New: always create a fresh custom template.
  const doSaveAs = async () => {
    if (!canEdit) return; flushBurst();
    const name = await ui.prompt({ title: 'Save As New Template', message: 'Name for the new template:', defaultValue: `${draft.name} (Copy)`, confirmText: 'Create' });
    if (name == null) return;
    const finalName = String(name).trim() || `${draft.name} (Copy)`;
    await persist(
      { ...draft, name: finalName, id: `new_${Date.now()}`, dbId: undefined, custom: true, isDefault: false, shared: false, builtinId: draft.builtinId || (!draft.dbId ? draft.id : undefined) } as CardTemplate,
      true, 'Saved as a new template.',
    );
  };

  const doReset = async () => {
    if (!dirtyRef.current) { ui.toast.info('No changes to reset.'); return; }
    if (!(await ui.confirm({ title: 'Reset changes', message: 'Discard all changes and restore the template to its last-loaded state?', confirmText: 'Reset', variant: 'warning' }))) return;
    commit(cloneTemplate(original)); dirtyRef.current = false;
  };

  const restoreVersion = (ver: TplVersion) => {
    commit({ ...draft, ...ver.design });
    setShowVersions(false);
    ui.toast.success(`Restored ${ver.name}.`);
  };

  const guardedClose = async () => {
    if (dirtyRef.current && !(await ui.confirm({ title: 'Discard changes?', message: 'You have unsaved changes. Close the editor without saving?', confirmText: 'Discard', variant: 'danger' }))) return;
    onClose();
  };

  const versions = versionsOf(draft);
  const dims = cardDimensions(draft.size, draft.orientation);
  const pvScale = Math.min(1.4, 380 / dims.h, 300 / dims.w);

  const footer = (
    <div className="flex-1 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="outline" icon={<Undo2 size={13} />} disabled={!past.length && !burst.current.base} onClick={undo}>Undo</Button>
        <Button size="sm" variant="outline" icon={<Redo2 size={13} />} disabled={!future.length} onClick={redo}>Redo</Button>
        <Button size="sm" variant="outline" icon={<RotateCcw size={13} />} onClick={doReset}>Reset</Button>
        <Button size="sm" variant="outline" icon={<History size={13} />} onClick={() => setShowVersions(true)}>Version History{versions.length ? ` (${versions.length})` : ''}</Button>
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="outline" icon={<Eye size={13} />} onClick={() => setPreviewOpen(true)}>Preview</Button>
        <Button size="sm" variant="outline" onClick={guardedClose}>Cancel</Button>
        {canEdit && <Button size="sm" variant="outline" icon={<Copy size={13} />} loading={saving === 'saveAs'} onClick={doSaveAs}>Save As New</Button>}
        {canEdit && <Button size="sm" icon={<Save size={13} />} loading={saving === 'save'} onClick={doSave}>Save</Button>}
      </div>
    </div>
  );

  return (
    <Modal open variant="page" onClose={guardedClose} pageMaxWidth={1240}
      title={`Edit Template — ${draft.name}`}
      subtitle={canEdit ? 'Design the front & back, arrange fields, then Save. Editing does not change the active template.' : 'Read-only preview — you do not have permission to edit templates.'}
      breadcrumbs={[{ label: 'Employee Cards' }, { label: 'Template Editor' }]}
      footer={footer}>
      <CardDesigner template={draft} onChange={onChange} employee={employee} branding={branding} companyId={companyId}
        onSave={doSave} saving={saving === 'save'} canEdit={canEdit} />

      {/* Version history */}
      {showVersions && (
        <Modal open onClose={() => setShowVersions(false)} title="Version History" size="md"
          footer={<Button variant="outline" size="sm" onClick={() => setShowVersions(false)}>Close</Button>}>
          {versions.length === 0
            ? <p className="py-8 text-center text-sm text-slate-400">No saved versions yet. Each time you Save, a new version is captured here so you can restore it later.</p>
            : (
              <div className="space-y-1.5 max-h-[52vh] overflow-y-auto">
                {versions.map((ver) => (
                  <div key={ver.v} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{ver.name}</p>
                      <p className="text-[10px] text-slate-400">{formatDate(ver.at)} · {ver.design.elements?.length ?? 0} elements</p>
                    </div>
                    {canEdit && <Button size="sm" variant="outline" onClick={() => restoreVersion(ver)}>Restore</Button>}
                  </div>
                ))}
              </div>
            )}
        </Modal>
      )}

      {/* Clean preview */}
      {previewOpen && (
        <Modal open onClose={() => setPreviewOpen(false)} title={`Preview — ${draft.name}`} size="lg"
          footer={<Button variant="outline" size="sm" icon={<X size={13} />} onClick={() => setPreviewOpen(false)}>Close</Button>}>
          <div className="flex flex-wrap items-center justify-center gap-6 py-4">
            <div className="text-center">
              <CardCanvas template={draft} side="front" employee={employee} branding={branding} companyId={companyId} scale={pvScale} style={{ boxShadow: '0 8px 30px rgba(0,0,0,.2)', borderRadius: 12 }} />
              <p className="mt-2 text-[11px] font-bold text-slate-400 uppercase">Front</p>
            </div>
            <div className="text-center">
              <CardCanvas template={draft} side="back" employee={employee} branding={branding} companyId={companyId} scale={pvScale} style={{ boxShadow: '0 8px 30px rgba(0,0,0,.2)', borderRadius: 12 }} />
              <p className="mt-2 text-[11px] font-bold text-slate-400 uppercase">Back</p>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
};

export default CardTemplateEditor;
