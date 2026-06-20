import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, Pencil, Trash2, Archive, ArchiveRestore, ShieldAlert, FileText, Eye, Download } from 'lucide-react';
import { api } from '../api/apiClient';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { NomineeForm, NomineeDoc } from './NomineeForm';
import { ui } from './ui/feedback';

interface Props { employeeId: string | number; employeeName?: string; role: string; }

export const NomineesTab: React.FC<Props> = ({ employeeId, employeeName, role }) => {
  const canEdit = ['Super Admin', 'Company Head', 'HR'].includes(role);
  const [nominees, setNominees] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ k: 'ok' | 'err'; m: string } | null>(null);
  const flash = (k: 'ok' | 'err', m: string) => { setToast({ k, m }); setTimeout(() => setToast(null), 3500); };

  const [editing, setEditing] = useState<any | null>(null); // {id:null} = add, nominee = edit, null = closed
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try { const r = await api.nominees.list(employeeId); setNominees(r.nominees || []); setTotal(r.totalPercentage || 0); }
    catch (e: any) { flash('err', e?.message || 'Could not load nominees.'); }
    finally { setLoading(false); }
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  const activeNominees = nominees.filter(n => n.status !== 'Archived');
  const multi = activeNominees.length > 1; // percentage allocation only matters with 2+ nominees
  const allocColor = Math.abs(total - 100) < 0.01 ? 'bg-emerald-500' : total > 100 ? 'bg-rose-500' : 'bg-amber-500';

  // Convert a stored data-URL into a Blob so it can be previewed/downloaded reliably.
  const dataUrlToBlob = (dataUrl: string) => {
    const [meta, b64] = dataUrl.split(',');
    const mime = (meta.match(/:(.*?);/) || [])[1] || 'application/octet-stream';
    const bin = atob(b64 || '');
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };
  const viewDoc = async (docId: number) => {
    try { const d = await api.nominees.getDocument(docId); window.open(URL.createObjectURL(dataUrlToBlob(d.fileData)), '_blank'); }
    catch (e: any) { flash('err', e?.message || 'Could not open document.'); }
  };
  const downloadDoc = async (docId: number) => {
    try {
      const d = await api.nominees.getDocument(docId);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(dataUrlToBlob(d.fileData));
      a.download = d.fileName || `${d.docType || 'document'}`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e: any) { flash('err', e?.message || 'Could not download document.'); }
  };
  const deleteDoc = async (docId: number) => {
    if (!(await ui.confirm({ message: 'Delete this document?', variant: 'danger', confirmText: 'Delete' }))) return;
    try { await api.nominees.removeDocument(docId); flash('ok', 'Document removed.'); load(); }
    catch (e: any) { flash('err', e?.message || 'Could not delete document.'); }
  };

  const save = async (nominee: any, pendingDocs: NomineeDoc[]) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await api.nominees.update(editing.id, { ...nominee, employeeId });
        for (const d of pendingDocs) await api.nominees.addDocument(editing.id, d);
      } else {
        // 1→2 transition: the lone nominee implicitly holds 100%. Reduce its share
        // first so the new nominee fits and the total stays at 100%.
        if (activeNominees.length === 1 && Number(activeNominees[0].percentage) >= 100 && Number(nominee.percentage) < 100) {
          await api.nominees.update(activeNominees[0].id, { ...activeNominees[0], percentage: 100 - Number(nominee.percentage), employeeId });
        }
        await api.nominees.create({ ...nominee, employeeId, documents: pendingDocs });
      }
      flash('ok', editing?.id ? 'Nominee updated.' : 'Nominee added.');
      setEditing(null); await load();
    } catch (e: any) { flash('err', e?.message || 'Save failed.'); }
    finally { setSaving(false); }
  };

  const onDelete = async (n: any) => { if (!(await ui.confirm({ message: `Delete nominee "${n.fullName}"? This cannot be undone.`, variant: 'danger', confirmText: 'Delete' }))) return; try { await api.nominees.remove(n.id); flash('ok', 'Nominee deleted.'); load(); } catch (e: any) { flash('err', e?.message || 'Delete failed.'); } };
  const onArchive = async (n: any) => { try { await api.nominees.archive(n.id); flash('ok', n.status === 'Archived' ? 'Restored.' : 'Archived.'); load(); } catch (e: any) { flash('err', e?.message || 'Action failed.'); } };

  return (
    <div className="space-y-3">
      {toast && <div className={`px-3 py-2 rounded-lg text-xs font-semibold ${toast.k === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{toast.m}</div>}

      {/* Allocation indicator — only relevant when an employee has multiple nominees. */}
      {multi && (
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-700">Total Nomination Allocation</span>
            <span className={`text-xs font-bold ${Math.abs(total - 100) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>{total}% / 100%</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${allocColor} transition-all`} style={{ width: `${Math.min(total, 100)}%` }} /></div>
          {Math.abs(total - 100) >= 0.01 && <p className="text-[10px] text-amber-600 mt-1.5 font-semibold">⚠ Total must equal 100% across all nominees (currently {total}%).</p>}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-800">Nominees {employeeName ? <span className="text-slate-400 font-normal">· {employeeName}</span> : ''}</h4>
        {canEdit && <Button size="sm" icon={<UserPlus size={13} />} onClick={() => setEditing({ id: null })}>Add Nominee</Button>}
      </div>

      {loading ? <div className="py-8 text-center text-xs text-slate-400">Loading…</div> : nominees.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl">
          <p className="text-xs font-semibold text-slate-500">No nominees on file.</p>
          {canEdit && <p className="text-[11px] text-slate-400 mt-1">Click “Add Nominee” to register one.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {nominees.map(n => (
            <div key={n.id} className={`rounded-xl border p-3 ${n.status === 'Archived' ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{n.fullName}</p>
                  <p className="text-[11px] text-slate-500">{n.relationship}{n.dob ? ` · DOB ${n.dob}` : ''}{n.gender ? ` · ${n.gender}` : ''}</p>
                </div>
                {multi && <span className="shrink-0 text-sm font-extrabold text-indigo-600">{Number(n.percentage)}%</span>}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {n.status === 'Archived' && <Badge variant="gray">Archived</Badge>}
                {n.isEmergencyContact && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5"><ShieldAlert size={10} /> Emergency</span>}
                {(n.documents?.length > 0) && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5"><FileText size={10} /> {n.documents.length} doc(s)</span>}
              </div>
              {(n.mobile || n.email || n.aadhaar) && <p className="text-[10px] text-slate-400 mt-2 truncate">{[n.mobile, n.email, n.aadhaar && `Aadhaar ${n.aadhaar}`].filter(Boolean).join(' · ')}</p>}
              {n.documents?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {n.documents.map((d: any) => (
                    <div key={d.id} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                      <FileText size={11} className="text-slate-400 shrink-0" />
                      <span className="text-[10px] font-semibold text-slate-600 shrink-0">{d.docType}</span>
                      <span className="text-[10px] text-slate-400 truncate flex-1">{d.fileName}</span>
                      <button title="View" onClick={() => viewDoc(d.id)} className="text-slate-400 hover:text-blue-600 shrink-0"><Eye size={12} /></button>
                      <button title="Download" onClick={() => downloadDoc(d.id)} className="text-slate-400 hover:text-emerald-600 shrink-0"><Download size={12} /></button>
                      {canEdit && <button title="Delete" onClick={() => deleteDoc(d.id)} className="text-slate-400 hover:text-rose-600 shrink-0"><Trash2 size={12} /></button>}
                    </div>
                  ))}
                </div>
              )}
              {canEdit && (
                <div className="flex gap-1.5 mt-2.5 pt-2 border-t border-slate-100">
                  <button onClick={() => setEditing(n)} className="flex items-center gap-1 text-[10px] font-bold text-blue-700 hover:bg-blue-50 px-2 py-1 rounded"><Pencil size={11} /> Edit</button>
                  <button onClick={() => onArchive(n)} className="flex items-center gap-1 text-[10px] font-bold text-amber-700 hover:bg-amber-50 px-2 py-1 rounded">{n.status === 'Archived' ? <><ArchiveRestore size={11} /> Restore</> : <><Archive size={11} /> Archive</>}</button>
                  <button onClick={() => onDelete(n)} className="flex items-center gap-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50 px-2 py-1 rounded ml-auto"><Trash2 size={11} /> Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <NomineeForm open={!!editing} initial={editing?.id ? editing : null} nomineeCount={activeNominees.filter(n => n.id !== editing?.id).length} saving={saving} onClose={() => setEditing(null)} onSubmit={save} />
    </div>
  );
};

export default NomineesTab;
