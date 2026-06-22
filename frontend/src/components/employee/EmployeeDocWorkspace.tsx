import React, { useMemo } from 'react';
import { Eye, Download, CheckCircle2, XCircle, Trash2, StickyNote, UploadCloud, FileText, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import {
  REQUIRED_DOCS, TOTAL_REQUIRED, DOC_CATEGORY_ORDER, matchRequiredKey, categoryOf,
  complianceBadgeVariant, type ComplianceStatus,
} from '@/utils/documentConfig';

interface Props {
  open: boolean;
  onClose: () => void;
  employee: any | null;
  documents: any[];
  onUpdateDocuments: (docs: any[]) => void;
  canEdit: boolean;
  role: string;
  onPreview: (doc: any) => void;
  onUpload: (employeeId: string) => void;
}

export const EmployeeDocWorkspace: React.FC<Props> = ({
  open, onClose, employee, documents, onUpdateDocuments, canEdit, role, onPreview, onUpload,
}) => {
  const empDocs = useMemo(() => (employee ? documents.filter(d => d.employeeId === employee.id) : []), [documents, employee]);

  const { sections, uploaded, verifiedCount, missing, status } = useMemo(() => {
    // Required slots, resolved against the employee's documents.
    const slots = REQUIRED_DOCS.map(req => {
      const matches = empDocs.filter(d => matchRequiredKey(d) === req.key);
      const empScan = (req.key === 'aadhaar' && !!employee?.aadhaarUpload) || (req.key === 'pan' && !!employee?.panUpload);
      const doc = matches[0] || null;
      const present = matches.length > 0 || empScan;
      const verified = matches.some(d => d.status === 'Verified');
      const rejected = matches.length > 0 && matches.every(d => d.status === 'Rejected');
      return { req, doc, present, verified, rejected };
    });
    const uploaded = slots.filter(s => s.present).length;
    const verifiedCount = slots.filter(s => s.verified).length;
    const rejectedCount = slots.filter(s => s.rejected).length;
    const missing = TOTAL_REQUIRED - uploaded;
    let status: ComplianceStatus;
    if (rejectedCount > 0) status = 'Action Required';
    else if (uploaded === TOTAL_REQUIRED && verifiedCount === TOTAL_REQUIRED) status = 'Verified';
    else if (verifiedCount > 0) status = 'Partially Verified';
    else status = 'Pending';

    // Group required slots by category; collect extra (non-required) docs too.
    const requiredKeys = new Set(REQUIRED_DOCS.map(r => r.key));
    const extras = empDocs.filter(d => { const k = matchRequiredKey(d); return !k || !requiredKeys.has(k); });
    const sections = DOC_CATEGORY_ORDER.map(cat => ({
      cat,
      slots: slots.filter(s => s.req.category === cat),
      extras: extras.filter(d => categoryOf(d) === cat),
    })).filter(s => s.slots.length || s.extras.length);

    return { sections, uploaded, verifiedCount, missing, status };
  }, [empDocs, employee]);

  if (!employee) return null;

  const setStatus = async (doc: any, next: 'Verified' | 'Rejected') => {
    let remarks = doc.remarks;
    if (next === 'Rejected') {
      const r = await ui.prompt({ message: `Reason for rejecting "${doc.name}" (optional):`, defaultValue: doc.remarks || '' });
      if (r === null) return;
      remarks = r || doc.remarks;
    }
    try {
      const saved = await api.documents.update(doc.id, { status: next, remarks });
      onUpdateDocuments(documents.map(d => d.id === doc.id ? saved : d));
      ui.toast.success(`Document ${next === 'Verified' ? 'verified' : 'rejected'}.`);
    } catch (e: any) { ui.toast.error(e?.message || 'Could not update the document.'); }
  };

  const addNote = async (doc: any) => {
    const r = await ui.prompt({ message: `Notes for "${doc.name}":`, defaultValue: doc.remarks || '' });
    if (r === null) return;
    try {
      const saved = await api.documents.update(doc.id, { remarks: r });
      onUpdateDocuments(documents.map(d => d.id === doc.id ? saved : d));
      ui.toast.success('Note saved.');
    } catch (e: any) { ui.toast.error(e?.message || 'Could not save the note.'); }
  };

  const removeDoc = async (doc: any) => {
    const ok = await ui.confirm({ title: 'Delete Document', message: `Delete "${doc.name}"? This cannot be undone.`, confirmText: 'Delete', variant: 'danger' });
    if (!ok) return;
    try {
      await api.documents.delete(doc.id);
      onUpdateDocuments(documents.filter(d => d.id !== doc.id));
      ui.toast.success('Document deleted.');
    } catch (e: any) { ui.toast.error(e?.message || 'Could not delete the document.'); }
  };

  const download = (doc: any) => {
    if (doc.fileData) {
      const a = document.createElement('a'); a.href = doc.fileData; a.download = doc.name || 'document';
      document.body.appendChild(a); a.click(); a.remove();
    } else if (doc.url) { window.open(doc.url, '_blank', 'noopener'); }
    else ui.toast.info('No file attached to download.');
  };

  const canVerify = canEdit && (role === 'Company Head' || role === 'HR' || role === 'Super Admin');

  const docRow = (doc: any) => (
    <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <FileText size={15} className="text-slate-400 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-800 truncate">{doc.name}</p>
        <p className="text-[10px] text-slate-400">{doc.type} · {doc.uploadedOn}{doc.remarks ? ` · ${doc.remarks}` : ''}</p>
      </div>
      <Badge variant={doc.status === 'Verified' ? 'green' : doc.status === 'Rejected' ? 'red' : 'amber'} dot>{doc.status}</Badge>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onPreview(doc)} title="Preview" className="w-6 h-6 rounded border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center"><Eye size={12} /></button>
        <button onClick={() => download(doc)} title="Download" className="w-6 h-6 rounded border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center"><Download size={12} /></button>
        {canVerify && doc.status !== 'Verified' && <button onClick={() => setStatus(doc, 'Verified')} title="Verify" className="w-6 h-6 rounded border border-slate-200 text-emerald-600 hover:bg-emerald-50 flex items-center justify-center"><CheckCircle2 size={12} /></button>}
        {canVerify && doc.status !== 'Rejected' && <button onClick={() => setStatus(doc, 'Rejected')} title="Reject" className="w-6 h-6 rounded border border-slate-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center"><XCircle size={12} /></button>}
        {canEdit && <button onClick={() => addNote(doc)} title="Add note" className="w-6 h-6 rounded border border-slate-200 text-amber-600 hover:bg-amber-50 flex items-center justify-center"><StickyNote size={12} /></button>}
        {canEdit && <button onClick={() => removeDoc(doc)} title="Delete" className="w-6 h-6 rounded border border-slate-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center"><Trash2 size={12} /></button>}
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Employee Document Workspace"
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-slate-500">{uploaded}/{TOTAL_REQUIRED} required uploaded · {verifiedCount} verified · {missing} missing</span>
          {canEdit && <Button icon={<UploadCloud size={14} />} onClick={() => onUpload(employee.id)}>Upload / Bulk Upload</Button>}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Employee header */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-700">{employee.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <p className="text-sm font-bold text-slate-900">{employee.name}</p>
              <p className="text-[11px] text-slate-500">{employee.employeeId} · {employee.department || '—'} · {employee.designation || 'Staff'}</p>
            </div>
          </div>
          <div className="text-right">
            <Badge variant={complianceBadgeVariant(status)} dot>{status}</Badge>
            <div className="mt-1.5 w-40 bg-slate-100 rounded-full h-1.5 overflow-hidden ml-auto">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.round((uploaded / TOTAL_REQUIRED) * 100)}%` }} />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{Math.round((uploaded / TOTAL_REQUIRED) * 100)}% complete</p>
          </div>
        </div>

        {/* Category sections */}
        {sections.map(section => (
          <div key={section.cat}>
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-indigo-500" /> {section.cat} Documents
            </p>
            <div className="space-y-2">
              {section.slots.map(s => s.doc ? docRow(s.doc) : (
                <div key={s.req.key} className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-3 py-2">
                  <FileText size={15} className="text-slate-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-500">{s.req.label}</p>
                    <p className="text-[10px] text-rose-400">{s.present ? 'On employee record (not in vault)' : 'Required · not uploaded'}</p>
                  </div>
                  <Badge variant={s.present ? 'amber' : 'red'} dot>{s.present ? 'Pending' : 'Missing'}</Badge>
                  {canEdit && <button onClick={() => onUpload(employee.id)} title="Upload" className="w-6 h-6 rounded border border-slate-200 text-indigo-600 hover:bg-indigo-50 flex items-center justify-center"><UploadCloud size={12} /></button>}
                </div>
              ))}
              {section.extras.map(docRow)}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};
