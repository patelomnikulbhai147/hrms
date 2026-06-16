import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Briefcase, Plus, FileText, Clock, CheckCircle2, History as HistoryIcon, Trash2, Inbox, Eye, Edit2, Archive, Search, ExternalLink } from 'lucide-react';
import { type Role } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { type UserAccount } from './Login';
import { api } from '../api/apiClient';
import { formatDate } from '../utils/formatDate';

interface TendersProps {
  role: Role;
  activeCompanyId: string;
  authProfile?: UserAccount | null;
}

type SectionId = 'upcoming' | 'live' | 'closed' | 'history' | 'documents';
const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: 'upcoming', label: 'Upcoming Tenders', icon: <Clock size={14} /> },
  { id: 'live', label: 'Live Tenders', icon: <CheckCircle2 size={14} /> },
  { id: 'closed', label: 'Closed Tenders', icon: <Inbox size={14} /> },
  { id: 'history', label: 'Tender History', icon: <HistoryIcon size={14} /> },
  { id: 'documents', label: 'Tender Documents', icon: <FileText size={14} /> },
];
const CATEGORIES = ['Government', 'Private', 'HR Service', 'Recruitment', 'Vendor'];
const STATUSES = ['Upcoming', 'Live', 'Closed', 'Archived'];

const statusVariant = (s: string): any => s === 'Live' ? 'green' : s === 'Closed' ? 'gray' : s === 'Archived' ? 'gray' : 'amber';

export const Tenders: React.FC<TendersProps> = ({ role, activeCompanyId }) => {
  const canManage = ['Super Admin', 'Company Head', 'HR'].includes(role);
  const [tenders, setTenders] = useState<any[]>([]);
  const [section, setSection] = useState<SectionId>('upcoming');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<any>(null);
  const [viewTender, setViewTender] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const flash = (kind: 'ok' | 'err', msg: string) => { setToast({ kind, msg }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => { try { setTenders(await api.tenders.getAll() || []); } catch { /* ignore */ } }, []);
  useEffect(() => { load(); }, [load, activeCompanyId]);

  const inSection = (t: any) => {
    if (section === 'upcoming') return t.status === 'Upcoming';
    if (section === 'live') return t.status === 'Live';
    if (section === 'closed') return t.status === 'Closed';
    if (section === 'documents') return !!t.documentPath;
    return true; // history = all (incl. archived)
  };
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenders.filter(t => inSection(t)
      && (!catFilter || t.category === catFilter)
      && (!q || `${t.tenderName} ${t.tenderNumber || ''} ${t.department || ''}`.toLowerCase().includes(q)));
  }, [tenders, section, search, catFilter]);

  const emptyForm = { tenderNumber: '', tenderName: '', department: '', tenderValue: '', publishDate: '', closingDate: '', status: 'Upcoming', category: 'Government', documentPath: '', notes: '' };
  const [form, setForm] = useState<any>(emptyForm);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setCreateOpen(true); };
  const openEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      tenderNumber: t.tenderNumber || '', tenderName: t.tenderName || '', department: t.department || '',
      tenderValue: t.tenderValue || '', publishDate: (t.publishDate || '').slice(0, 10), closingDate: (t.closingDate || '').slice(0, 10),
      status: t.status || 'Upcoming', category: t.category || 'Government', documentPath: t.documentPath || '', notes: t.notes || '',
    });
    setCreateOpen(true);
  };

  const submit = async () => {
    if (!form.tenderName.trim()) { flash('err', 'Tender name is required.'); return; }
    setBusy(true);
    try {
      if (editingId) { await api.tenders.update(editingId, form); flash('ok', 'Tender updated.'); }
      else { await api.tenders.create({ ...form, companyId: activeCompanyId }); flash('ok', 'Tender created.'); }
      setCreateOpen(false); setEditingId(null); setForm(emptyForm); await load();
    } catch (e: any) { flash('err', e?.message || 'Save failed.'); }
    finally { setBusy(false); }
  };

  const archive = async (t: any) => {
    if (!window.confirm(`Archive tender "${t.tenderName}"? It will move to Tender History.`)) return;
    try { await api.tenders.update(t.id, { status: 'Archived' }); flash('ok', 'Tender archived.'); await load(); }
    catch (e: any) { flash('err', e?.message || 'Archive failed.'); }
  };
  const remove = async (id: any) => {
    if (!window.confirm('Permanently delete this tender? Use Archive to keep history instead.')) return;
    try { await api.tenders.remove(id); flash('ok', 'Tender deleted.'); await load(); }
    catch (e: any) { flash('err', e?.message || 'Delete failed.'); }
  };

  const counts = useMemo(() => ({
    upcoming: tenders.filter(t => t.status === 'Upcoming').length,
    live: tenders.filter(t => t.status === 'Live').length,
    closed: tenders.filter(t => t.status === 'Closed').length,
  }), [tenders]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm">
        <div className="px-5 py-4 flex items-center justify-between border-b border-[#DBEAFE]">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Briefcase size={18} className="text-indigo-600" /> Tender Information</h2>
            <p className="text-xs text-slate-500">Track tenders end-to-end — create, edit, monitor status and archive across Government, Private, HR Service, Recruitment &amp; Vendor categories.</p>
          </div>
          {canManage && <Button icon={<Plus size={15} />} onClick={openCreate}>Add Tender</Button>}
        </div>
        <div className="flex flex-wrap gap-1 px-3 py-2">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${section === s.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>{s.icon}{s.label}</button>
          ))}
        </div>
      </div>

      {toast && <div className={`px-4 py-2.5 rounded-lg text-xs font-semibold ${toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{toast.msg}</div>}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#DBEAFE] bg-gradient-to-br from-amber-50 to-white p-4">
          <p className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider">Upcoming Tenders</p>
          <p className="text-3xl font-extrabold text-amber-600 mt-1">{counts.upcoming}</p>
        </div>
        <div className="rounded-xl border border-[#DBEAFE] bg-gradient-to-br from-emerald-50 to-white p-4">
          <p className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider">Live Tenders</p>
          <p className="text-3xl font-extrabold text-emerald-600 mt-1">{counts.live}</p>
        </div>
        <div className="rounded-xl border border-[#DBEAFE] bg-white p-4">
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Closed Tenders</p>
          <p className="text-3xl font-extrabold text-slate-600 mt-1">{counts.closed}</p>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-800">{SECTIONS.find(s => s.id === section)?.label}</h3>
          <div className="flex items-center gap-2">
            <Input icon={<Search size={14} />} placeholder="Search tenders…" value={search} onChange={e => setSearch(e.target.value)} />
            <div className="w-40"><Select value={catFilter} onChange={e => setCatFilter(e.target.value)} options={[{ value: '', label: 'All categories' }, ...CATEGORIES.map(c => ({ value: c, label: c }))]} /></div>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3"><Inbox className="text-slate-300" size={28} /></div>
            <p className="text-sm font-semibold text-slate-500">No tenders in this view</p>
            <p className="text-xs text-slate-400 mt-1">{canManage ? 'Click “Add Tender” to create one, or adjust your search/filters.' : 'Adjust your search or filters.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Thead><Tr><Th>Tender No</Th><Th>Name</Th><Th>Category</Th><Th>Department</Th><Th>Value</Th><Th>Closing</Th><Th>Status</Th><Th>Actions</Th></Tr></Thead>
              <Tbody>
                {rows.map(t => (
                  <Tr key={t.id}>
                    <Td><span className="font-mono text-[11px] text-indigo-700">{t.tenderNumber || '—'}</span></Td>
                    <Td><span className="font-semibold text-slate-800">{t.tenderName}</span></Td>
                    <Td>{t.category && <Badge variant="indigo">{t.category}</Badge>}</Td>
                    <Td>{t.department || '—'}</Td>
                    <Td>{t.tenderValue ? `₹${Number(t.tenderValue).toLocaleString('en-IN')}` : '—'}</Td>
                    <Td><span className="text-[11px] text-slate-500">{formatDate(t.closingDate)}</span></Td>
                    <Td><Badge variant={statusVariant(t.status)}>{t.status}</Badge></Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setViewTender(t)} title="View" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-indigo-600 shadow-sm"><Eye size={13} /></button>
                        {canManage && <button onClick={() => openEdit(t)} title="Edit" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600 shadow-sm"><Edit2 size={13} /></button>}
                        {canManage && t.status !== 'Archived' && <button onClick={() => archive(t)} title="Archive" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-amber-600 shadow-sm"><Archive size={13} /></button>}
                        {canManage && <button onClick={() => remove(t.id)} title="Delete" className="p-1.5 rounded-md border border-slate-200 bg-white text-rose-400 hover:text-rose-600 shadow-sm"><Trash2 size={13} /></button>}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        )}
      </Card>

      {/* Create / Edit */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setEditingId(null); }} title={editingId ? 'Edit Tender' : 'Add Tender'}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setCreateOpen(false); setEditingId(null); }}>Cancel</Button><Button loading={busy} onClick={submit}>{editingId ? 'Update Tender' : 'Save Tender'}</Button></div>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Tender Number" value={form.tenderNumber} onChange={e => setForm({ ...form, tenderNumber: e.target.value })} />
            <Input label="Tender Name *" value={form.tenderName} onChange={e => setForm({ ...form, tenderName: e.target.value })} />
            <Select label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
            <Input label="Department" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
            <Input label="Tender Value (₹)" type="number" value={form.tenderValue} onChange={e => setForm({ ...form, tenderValue: e.target.value })} />
            <Select label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={STATUSES.map(s => ({ value: s, label: s }))} />
            <Input label="Publish Date" type="date" value={form.publishDate} onChange={e => setForm({ ...form, publishDate: e.target.value })} />
            <Input label="Closing Date" type="date" value={form.closingDate} onChange={e => setForm({ ...form, closingDate: e.target.value })} />
          </div>
          <Input label="Document Link / Attachment URL" placeholder="https://… or document reference" value={form.documentPath} onChange={e => setForm({ ...form, documentPath: e.target.value })} />
          <Textarea label="Notes" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>

      {/* View detail */}
      <Modal open={!!viewTender} onClose={() => setViewTender(null)} title={viewTender?.tenderName || 'Tender'}
        footer={<div className="flex justify-end"><Button variant="outline" onClick={() => setViewTender(null)}>Close</Button></div>}>
        {viewTender && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Badge variant={statusVariant(viewTender.status)}>{viewTender.status}</Badge>{viewTender.category && <Badge variant="indigo">{viewTender.category}</Badge>}</div>
            {[
              ['Tender Number', viewTender.tenderNumber || '—'],
              ['Department', viewTender.department || '—'],
              ['Value', viewTender.tenderValue ? `₹${Number(viewTender.tenderValue).toLocaleString('en-IN')}` : '—'],
              ['Publish Date', formatDate(viewTender.publishDate)],
              ['Closing Date', formatDate(viewTender.closingDate)],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-xs text-slate-500 font-semibold">{k}</span><span className="text-xs text-slate-800 font-bold">{v}</span></div>
            ))}
            {viewTender.documentPath && (
              <a href={viewTender.documentPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline pt-1"><ExternalLink size={13} /> Open attachment</a>
            )}
            {viewTender.notes && <div className="pt-2"><p className="text-[10px] text-slate-400 uppercase font-bold">Notes</p><p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{viewTender.notes}</p></div>}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Tenders;
