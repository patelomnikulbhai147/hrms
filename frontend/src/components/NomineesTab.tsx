import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, Pencil, Trash2, Archive, ArchiveRestore, ShieldAlert, Heart, Scale, FileText } from 'lucide-react';
import { api } from '../api/apiClient';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { NomineeForm, NomineeDoc } from './NomineeForm';

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
  const allocColor = Math.abs(total - 100) < 0.01 ? 'bg-emerald-500' : total > 100 ? 'bg-rose-500' : 'bg-amber-500';

  const save = async (nominee: any, pendingDocs: NomineeDoc[]) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await api.nominees.update(editing.id, { ...nominee, employeeId });
        for (const d of pendingDocs) await api.nominees.addDocument(editing.id, d);
      } else {
        await api.nominees.create({ ...nominee, employeeId, documents: pendingDocs });
      }
      flash('ok', editing?.id ? 'Nominee updated.' : 'Nominee added.');
      setEditing(null); await load();
    } catch (e: any) { flash('err', e?.message || 'Save failed.'); }
    finally { setSaving(false); }
  };

  const onDelete = async (n: any) => { if (!window.confirm(`Delete nominee "${n.fullName}"? This cannot be undone.`)) return; try { await api.nominees.remove(n.id); flash('ok', 'Nominee deleted.'); load(); } catch (e: any) { flash('err', e?.message || 'Delete failed.'); } };
  const onArchive = async (n: any) => { try { await api.nominees.archive(n.id); flash('ok', n.status === 'Archived' ? 'Restored.' : 'Archived.'); load(); } catch (e: any) { flash('err', e?.message || 'Action failed.'); } };

  return (
    <div className="space-y-3">
      {toast && <div className={`px-3 py-2 rounded-lg text-xs font-semibold ${toast.k === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{toast.m}</div>}

      {/* Allocation indicator */}
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-slate-700">Total Nomination Allocation</span>
          <span className={`text-xs font-bold ${Math.abs(total - 100) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>{total}% / 100%</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${allocColor} transition-all`} style={{ width: `${Math.min(total, 100)}%` }} /></div>
        {activeNominees.length > 0 && Math.abs(total - 100) >= 0.01 && <p className="text-[10px] text-amber-600 mt-1.5 font-semibold">⚠ Total must equal 100% before nominees are considered complete (currently {total}%).</p>}
        {activeNominees.length === 0 && <p className="text-[10px] text-slate-400 mt-1.5">No nominees added yet.</p>}
      </div>

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
                <span className="shrink-0 text-sm font-extrabold text-indigo-600">{Number(n.percentage)}%</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {n.status === 'Archived' && <Badge variant="gray">Archived</Badge>}
                {n.isEmergencyContact && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5"><ShieldAlert size={10} /> Emergency</span>}
                {n.isDependent && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5"><Heart size={10} /> Dependent</span>}
                {n.isLegalHeir && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5"><Scale size={10} /> Legal Heir</span>}
                {(n.documents?.length > 0) && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5"><FileText size={10} /> {n.documents.length} doc(s)</span>}
              </div>
              {(n.mobile || n.email || n.aadhaar) && <p className="text-[10px] text-slate-400 mt-2 truncate">{[n.mobile, n.email, n.aadhaar && `Aadhaar ${n.aadhaar}`].filter(Boolean).join(' · ')}</p>}
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

      <NomineeForm open={!!editing} initial={editing?.id ? editing : null} existingDocsCount={editing?.documents?.length} saving={saving} onClose={() => setEditing(null)} onSubmit={save} />
    </div>
  );
};

export default NomineesTab;
