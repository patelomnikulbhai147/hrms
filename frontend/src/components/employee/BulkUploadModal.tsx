import React, { useMemo, useRef, useState } from 'react';
import { UploadCloud, X, FileText, CheckCircle2, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import {
  DOC_ACCEPT, readFileAsBase64, guessTypeFromName, matchRequiredKey,
  REQUIRED_DOCS, TOTAL_REQUIRED, DOC_CATEGORY_ORDER, complianceBadgeVariant,
  type UploadedFile, type ComplianceStatus,
} from '@/utils/documentConfig';

const DOC_TYPE_OPTIONS = [
  ...REQUIRED_DOCS.map(r => r.label),
  'Passport', 'Driving License', 'Voter ID', 'Cancelled Cheque', 'ESIC Documents',
  'PF Documents', 'Medical Documents', 'Custom Document',
];

type QueueItem = {
  id: string;
  file: UploadedFile;
  type: string;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
};

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
  employees: any[];
  initialEmployeeId?: string | null;
  companyId: string;
  documents: any[];
  role: string;
  onUploaded: (savedDocs: any[]) => void;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({
  open, onClose, employees, initialEmployeeId, companyId, documents, role, onUploaded,
}) => {
  const [empId, setEmpId] = useState<string>(initialEmployeeId || '');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep the selected employee in sync when opened from a specific row.
  React.useEffect(() => { if (open) setEmpId(initialEmployeeId || ''); }, [open, initialEmployeeId]);
  React.useEffect(() => { if (!open) { setQueue([]); setBusy(false); } }, [open]);

  // Compare as strings — the <Select> emits String(e.id), while e.id /
  // d.employeeId may be numeric, so a strict === would miss the match.
  const emp = useMemo(() => employees.find(e => String(e.id) === String(empId)), [employees, empId]);
  const empDocs = useMemo(() => documents.filter(d => String(d.employeeId) === String(empId)), [documents, empId]);

  // An existing document of the same required slot (or exact type) — used to
  // auto-version on upload instead of creating a duplicate.
  const existingForType = (type: string) => {
    const slot = matchRequiredKey({ type });
    return empDocs.find(d => (slot && matchRequiredKey(d) === slot) || (d.type || '').toLowerCase() === type.toLowerCase());
  };

  // ── Required-document checklist for the selected employee (Issue 1) ──
  // Resolves each required slot against the employee's vault documents and the
  // identity scans stored directly on the employee record (Aadhaar / PAN).
  const checklist = useMemo(() => {
    if (!emp) return null;
    const slots = REQUIRED_DOCS.map(req => {
      const matches = empDocs.filter(d => matchRequiredKey(d) === req.key);
      const empScan = (req.key === 'aadhaar' && !!emp.aadhaarUpload) || (req.key === 'pan' && !!emp.panUpload);
      const present = matches.length > 0 || empScan;
      const verified = matches.some(d => d.status === 'Verified');
      return { req, present, verified };
    });
    const uploaded = slots.filter(s => s.present).length;
    const verifiedCount = slots.filter(s => s.verified).length;
    const missing = TOTAL_REQUIRED - uploaded;
    let status: ComplianceStatus;
    if (uploaded === TOTAL_REQUIRED && verifiedCount === TOTAL_REQUIRED) status = 'Verified';
    else if (verifiedCount > 0) status = 'Partially Verified';
    else status = 'Pending';
    // Group the required slots by category for display.
    const groups = DOC_CATEGORY_ORDER
      .map(cat => ({ cat, items: slots.filter(s => s.req.category === cat) }))
      .filter(g => g.items.length);
    return { slots, uploaded, verifiedCount, missing, status, groups };
  }, [emp, empDocs]);

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const added: QueueItem[] = [];
    for (const f of arr) {
      try {
        const uf = await readFileAsBase64(f);
        const type = guessTypeFromName(uf.fileName);
        added.push({ id: `${uf.fileName}-${Math.round(uf.size.length + added.length)}-${added.length}`, file: uf, type, status: 'queued' });
      } catch (e: any) {
        ui.toast.error(`${f.name}: ${e?.message || 'could not be read'}`);
      }
    }
    if (added.length) setQueue(prev => [...prev, ...added]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const updateItem = (id: string, patch: Partial<QueueItem>) => setQueue(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q));
  const removeItem = (id: string) => setQueue(prev => prev.filter(q => q.id !== id));

  const doneCount = queue.filter(q => q.status === 'done').length;
  // How many queued files will update an existing document (silent versioning).
  const replacingCount = useMemo(
    () => queue.filter(q => q.status !== 'done' && !!existingForType(q.type)).length,
    [queue, empDocs],
  );

  const uploadAll = async () => {
    if (!empId) { ui.toast.warning('Select an employee first.'); return; }
    if (!queue.length) { ui.toast.warning('Add at least one file.'); return; }
    // Confirm only when necessary — i.e. some uploads will replace an existing
    // document of the same type (versioning), so the user is never surprised.
    if (replacingCount > 0) {
      const ok = await ui.confirm({
        title: 'Update existing documents?',
        message: `${replacingCount} file(s) match a document already on record and will replace the existing version. The rest will be added as new. Continue?`,
        confirmText: 'Upload',
      });
      if (!ok) return;
    }
    setBusy(true);
    const saved: any[] = [];
    const uploadedBy = role === 'HR' ? 'HR Manager' : role === 'Super Admin' ? 'Super Admin' : 'Company Head';
    for (const item of queue) {
      if (item.status === 'done') continue;
      updateItem(item.id, { status: 'uploading', error: undefined });
      try {
        const base = {
          companyId: emp?.companyId || companyId,
          branchId: (emp as any)?.branchId ?? undefined,
          name: item.file.fileName,
          type: item.type,
          employeeId: empId,
          employeeName: emp?.name || 'Employee',
          uploadedBy,
          uploadedOn: new Date().toISOString().split('T')[0],
          size: item.file.size,
          status: 'Pending',
          fileData: item.file.dataUrl,
          mimeType: item.file.mimeType,
        };
        // Auto-version: replace the existing doc of this type if present.
        const existing = existingForType(item.type);
        const res = existing ? await api.documents.update(existing.id, base) : await api.documents.create(base);
        saved.push(res);
        updateItem(item.id, { status: 'done' });
      } catch (e: any) {
        updateItem(item.id, { status: 'error', error: e?.message || 'upload failed' });
      }
    }
    setBusy(false);
    if (saved.length) {
      onUploaded(saved);
      ui.toast.success(`${saved.length} document(s) uploaded for ${emp?.name || 'employee'}.`);
    }
    const failed = queue.filter(q => q.status === 'error').length;
    if (!failed) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bulk Document Upload"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-slate-500">{queue.length ? `${doneCount}/${queue.length} uploaded` : 'No files added yet'}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
            <Button icon={<UploadCloud size={14} />} onClick={uploadAll} disabled={busy || !queue.length || !empId}>
              {busy ? 'Uploading…' : `Upload ${queue.length || ''} file${queue.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Employee</label>
          <Select value={empId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEmpId(e.target.value)}
            options={[{ value: '', label: 'Select employee…' }, ...employees.map(e => ({ value: String(e.id), label: `${e.name} (${e.employeeId})` }))]} />
        </div>

        {/* Upload summary + required-document checklist (shown once an employee is picked) */}
        {checklist && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { label: 'Required', value: TOTAL_REQUIRED, tone: 'text-slate-800' },
                { label: 'Uploaded', value: checklist.uploaded, tone: 'text-emerald-600' },
                { label: 'New Selected', value: queue.length, tone: 'text-indigo-600' },
                { label: 'Missing', value: checklist.missing, tone: checklist.missing > 0 ? 'text-rose-600' : 'text-slate-300' },
              ].map(s => (
                <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center">
                  <p className={`text-sm font-extrabold ${s.tone}`}>{s.value}</p>
                  <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
                </div>
              ))}
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center flex flex-col items-center justify-center">
                <Badge variant={complianceBadgeVariant(checklist.status)} dot>{checklist.status}</Badge>
                <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">Verification</p>
              </div>
            </div>

            {/* Required documents grouped by category */}
            <div className="space-y-2">
              {checklist.groups.map(group => (
                <div key={group.cat}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <ShieldCheck size={11} className="text-indigo-500" /> {group.cat} Documents
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map(s => (
                      <span key={s.req.key}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          s.verified ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : s.present ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-rose-200 bg-rose-50 text-rose-600'}`}>
                        {s.verified ? <CheckCircle2 size={10} /> : s.present ? <Loader2 size={10} /> : <AlertTriangle size={10} />}
                        {s.req.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Drop zone — multi-file */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${dragOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}
        >
          <UploadCloud size={26} className="mx-auto text-indigo-500 mb-2" />
          <p className="text-sm font-semibold text-slate-700">Drag &amp; drop multiple files here</p>
          <p className="text-[11px] text-slate-400 mt-0.5">or click to browse · JPG, PNG, PDF, DOC, DOCX · max 5 MB each</p>
          <input ref={inputRef} type="file" multiple accept={DOC_ACCEPT} className="hidden"
            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {/* Overall progress */}
        {queue.length > 0 && (
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.round((doneCount / queue.length) * 100)}%` }} />
          </div>
        )}

        {/* File queue — File Name · Document Type · Remove · Status (Issue 2: no Replace) */}
        {queue.length > 0 && (
          <div className="max-h-72 overflow-y-auto space-y-2">
            {queue.map(item => {
              const willReplace = item.status !== 'done' && !!existingForType(item.type);
              return (
                <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <FileText size={15} className="text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 truncate">{item.file.fileName}</p>
                    <p className="text-[10px] text-slate-400">
                      {item.file.size}
                      {willReplace ? ' · updates existing' : ''}
                      {item.error ? ` · ${item.error}` : ''}
                    </p>
                  </div>
                  <select value={item.type} onChange={e => updateItem(item.id, { type: e.target.value })}
                    disabled={busy}
                    className="text-[11px] rounded-md border border-slate-200 px-1.5 py-1 outline-none focus:border-indigo-400 max-w-[150px]">
                    {DOC_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span className="w-5 text-center shrink-0">
                    {item.status === 'done' ? <CheckCircle2 size={15} className="text-emerald-500" />
                      : item.status === 'uploading' ? <Loader2 size={15} className="text-indigo-500 animate-spin" />
                      : item.status === 'error' ? <AlertTriangle size={15} className="text-rose-500" />
                      : <button onClick={() => removeItem(item.id)} disabled={busy} title="Remove file" className="text-slate-300 hover:text-rose-500"><X size={14} /></button>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
