// ─────────────────────────────────────────────────────────────────────────────
// RecordAttachments — a compact, reusable "files attached to ONE record" panel.
// Enterprise document architecture: instead of a central generic Documents tab,
// each record (a Loan, a Salary Advance, later a compliance filing) owns its own
// attachments. Backed by the /api/compliance-documents store, scoped by
// source + sourceRef so files stay attached ONLY to that record. Supports
// drag-and-drop upload, preview, download and delete with role gating.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Paperclip, UploadCloud, FileText, Eye, Download, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDate } from '@/utils/formatDate';

interface Props {
  /** The primary source tag written on new attachments (e.g. 'Loan', 'Advance'). */
  source: string;
  /** Extra source tags to ALSO include when listing (e.g. list both Loan & Advance). */
  altSources?: string[];
  /** The owning record id — attachments are filtered to this. */
  sourceRef: string | number;
  canEdit: boolean;
  canDelete: boolean;
  /** Attachment category options for this record type. */
  categories: string[];
  employeeId?: number | string | null;
  employeeName?: string | null;
  title?: string;
}

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,application/pdf,image/*';
const fmtBytes = (n: number) => (!n ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const readFile = (file: File): Promise<{ fileData: string; fileName: string; mimeType: string; size: string }> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ fileData: String(r.result), fileName: file.name, mimeType: file.type, size: fmtBytes(file.size) });
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export const RecordAttachments: React.FC<Props> = ({ source, altSources = [], sourceRef, canEdit, canDelete, categories, employeeId, employeeName, title = 'Attachments' }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ file: any; name: string; category: string; expiryDate: string } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const sourceQuery = useMemo(() => [source, ...altSources].join(','), [source, altSources]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.complianceDocuments.list({ source: sourceQuery, sourceRef: String(sourceRef) }) || []); }
    catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not load attachments.')); }
    finally { setLoading(false); }
  }, [sourceQuery, sourceRef]);
  useEffect(() => { load(); }, [load]);

  const pick = async (file?: File | null) => {
    if (!file) return;
    try {
      const f = await readFile(file);
      setPending({ file: f, name: file.name.replace(/\.[^.]+$/, ''), category: categories[0] || 'Supporting Document', expiryDate: '' });
    } catch { ui.toast.error('Could not read that file.'); }
  };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDrag(false); if (canEdit) pick(e.dataTransfer.files?.[0]); };

  const attach = async () => {
    if (!pending) return;
    if (!pending.name.trim()) return ui.toast.warning('Give the attachment a name.');
    setBusy(true);
    try {
      await api.complianceDocuments.create({
        name: pending.name.trim(), category: pending.category, source, sourceRef: String(sourceRef),
        employeeId: employeeId || null, employeeName: employeeName || null, expiryDate: pending.expiryDate || null,
        fileData: pending.file.fileData, fileName: pending.file.fileName, mimeType: pending.file.mimeType, size: pending.file.size,
      });
      ui.toast.success('Attachment added.');
      setPending(null); load();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const download = async (row: any) => {
    try {
      const full = await api.complianceDocuments.getOne(row.id);
      if (full.fileData) { const a = document.createElement('a'); a.href = full.fileData; a.download = full.fileName || full.name; a.click(); }
      else ui.toast.warning('No file attached.');
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const preview = async (row: any) => {
    try {
      const full = await api.complianceDocuments.getOne(row.id);
      if (!full.fileData) return ui.toast.warning('No file attached.');
      const w = window.open('', '_blank'); if (!w) return;
      w.document.write(`<title>${full.name}</title><body style="margin:0"><iframe src="${full.fileData}" style="border:0;width:100vw;height:100vh"></iframe></body>`);
      w.document.close();
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const remove = async (row: any) => {
    if (!(await ui.confirm({ message: `Remove "${row.name}"?`, variant: 'danger', confirmText: 'Remove' }))) return;
    try { await api.complianceDocuments.remove(row.id); ui.toast.success('Attachment removed.'); load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5"><Paperclip size={13} /> {title}{rows.length ? <span className="text-slate-400 font-semibold normal-case">· {rows.length}</span> : null}</p>
        {canEdit && !pending && <Button size="sm" variant="outline" icon={<UploadCloud size={13} />} onClick={() => fileInput.current?.click()}>Add File</Button>}
        <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {/* Drag-and-drop zone (edit only, when not mid-upload) */}
      {canEdit && !pending && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          className={`mb-2 cursor-pointer rounded-xl border border-dashed px-3 py-3 text-center transition ${drag ? 'border-[#4F7CFF] bg-[#EDF4FF]' : 'border-slate-200 hover:border-[#4F7CFF]/60'}`}>
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5"><UploadCloud size={14} className="text-[#4F7CFF]" /> Drag &amp; drop a file here, or click to browse (PDF, DOCX, XLSX, JPG, PNG)</p>
        </div>
      )}

      {/* Pending upload form */}
      {pending && (
        <div className="mb-2 rounded-xl border border-[#DBEAFE] bg-[#F7FAFF] p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-600"><FileText size={14} className="text-[#4F7CFF]" /> <span className="font-semibold truncate">{pending.file.fileName}</span> <span className="text-slate-400">· {pending.file.size}</span>
            <button className="ml-auto text-slate-400 hover:text-rose-500" onClick={() => setPending(null)}><X size={14} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input label="Name" value={pending.name} onChange={(e) => setPending({ ...pending, name: e.target.value })} />
            <Select label="Type" value={pending.category} onChange={(e) => setPending({ ...pending, category: e.target.value })} options={categories.map((c) => ({ value: c, label: c }))} />
            <Input label="Expiry (optional)" type="date" value={pending.expiryDate} onChange={(e) => setPending({ ...pending, expiryDate: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button size="sm" loading={busy} onClick={attach}>Attach</Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? <p className="text-[11px] text-slate-400 py-2">Loading…</p>
        : rows.length === 0 ? (
          !pending && <p className="text-[11px] text-slate-400 py-3 text-center rounded-lg bg-slate-50">No attachments yet.{canEdit ? ' Drag a file above to add the first one.' : ''}</p>
        ) : (
          <div className="space-y-1">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs hover:bg-slate-50">
                <FileText size={14} className="text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-700 truncate" title={r.name}>{r.name}</p>
                  <p className="text-[10px] text-slate-400">{r.category}{r.size ? ` · ${r.size}` : ''}{r.expiryDate ? ` · expires ${formatDate(r.expiryDate)}` : ''}</p>
                </div>
                {r.expiryState === 'Expired' && <Badge variant="red">Expired</Badge>}
                {r.expiryState === 'Expiring Soon' && <Badge variant="yellow">Expiring</Badge>}
                <button title="Preview" onClick={() => preview(r)} className="p-1.5 rounded-lg hover:bg-slate-100"><Eye size={13} className="text-slate-500" /></button>
                <button title="Download" onClick={() => download(r)} className="p-1.5 rounded-lg hover:bg-slate-100"><Download size={13} className="text-slate-500" /></button>
                {canDelete && <button title="Remove" onClick={() => remove(r)} className="p-1.5 rounded-lg hover:bg-rose-50"><Trash2 size={13} className="text-rose-600" /></button>}
              </div>
            ))}
          </div>
        )}
    </div>
  );
};

export default RecordAttachments;
