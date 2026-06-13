import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Briefcase, Plus, FileText, Clock, CheckCircle2, History as HistoryIcon, Trash2, Inbox } from 'lucide-react';
import { type Role } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { type UserAccount } from './Login';
import { api } from '../api/apiClient';

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

export const Tenders: React.FC<TendersProps> = ({ role, activeCompanyId }) => {
  const canManage = ['Super Admin', 'Company Head', 'HR'].includes(role);
  const [tenders, setTenders] = useState<any[]>([]);
  const [section, setSection] = useState<SectionId>('upcoming');
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const flash = (kind: 'ok' | 'err', msg: string) => { setToast({ kind, msg }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => { try { setTenders(await api.tenders.getAll() || []); } catch { /* ignore */ } }, []);
  useEffect(() => { load(); }, [load, activeCompanyId]);

  const inSection = (t: any) => {
    if (section === 'upcoming') return t.status === 'Upcoming';
    if (section === 'live') return t.status === 'Live';
    if (section === 'closed') return t.status === 'Closed';
    if (section === 'documents') return !!t.documentPath;
    return true; // history = all
  };
  const rows = useMemo(() => tenders.filter(inSection), [tenders, section]);

  const emptyForm = { tenderNumber: '', tenderName: '', department: '', tenderValue: '', publishDate: '', closingDate: '', status: 'Upcoming', category: 'Government', notes: '' };
  const [form, setForm] = useState<any>(emptyForm);
  const submit = async () => {
    if (!form.tenderName.trim()) { flash('err', 'Tender name is required.'); return; }
    setBusy(true);
    try { await api.tenders.create({ ...form, companyId: activeCompanyId }); flash('ok', 'Tender added.'); setCreateOpen(false); setForm(emptyForm); await load(); }
    catch (e: any) { flash('err', e?.message || 'Create failed.'); }
    finally { setBusy(false); }
  };
  const remove = async (id: any) => { if (!window.confirm('Delete this tender?')) return; try { await api.tenders.remove(id); await load(); } catch (e: any) { flash('err', e?.message || 'Delete failed.'); } };

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
            <p className="text-xs text-slate-500">Future-ready tender management. No live tender API integration yet — placeholder data only.</p>
          </div>
          {canManage && <Button icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>Add Tender</Button>}
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
        <div className="rounded-xl border border-[#DBEAFE] bg-gradient-to-br from-indigo-50 to-white p-4">
          <p className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider">Upcoming Tenders</p>
          <p className="text-3xl font-extrabold text-indigo-700 mt-1">{counts.upcoming}</p>
          {counts.upcoming === 0 && <p className="text-[11px] text-slate-400 mt-1">No Upcoming Tenders Available</p>}
        </div>
        <div className="rounded-xl border border-[#DBEAFE] bg-white p-4">
          <p className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider">Live Tenders</p>
          <p className="text-3xl font-extrabold text-emerald-600 mt-1">{counts.live}</p>
        </div>
        <div className="rounded-xl border border-[#DBEAFE] bg-white p-4">
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Closed Tenders</p>
          <p className="text-3xl font-extrabold text-slate-600 mt-1">{counts.closed}</p>
        </div>
      </div>

      <Card>
        <h3 className="text-sm font-bold text-slate-800 mb-3">{SECTIONS.find(s => s.id === section)?.label}</h3>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3"><Inbox className="text-slate-300" size={28} /></div>
            <p className="text-sm font-semibold text-slate-500">No Tender Data Available</p>
            <p className="text-xs text-slate-400 mt-1">No live tender API integration yet. {canManage ? 'Add placeholder tenders to populate this section.' : ''}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Thead><Tr><Th>Tender No</Th><Th>Name</Th><Th>Category</Th><Th>Department</Th><Th>Value</Th><Th>Closing</Th><Th>Status</Th>{canManage && <Th>Actions</Th>}</Tr></Thead>
              <Tbody>
                {rows.map(t => (
                  <Tr key={t.id}>
                    <Td><span className="font-mono text-[11px] text-indigo-700">{t.tenderNumber || '—'}</span></Td>
                    <Td><span className="font-semibold text-slate-800">{t.tenderName}</span></Td>
                    <Td>{t.category && <Badge variant="indigo">{t.category}</Badge>}</Td>
                    <Td>{t.department || '—'}</Td>
                    <Td>{t.tenderValue ? `₹${Number(t.tenderValue).toLocaleString('en-IN')}` : '—'}</Td>
                    <Td><span className="text-[11px] text-slate-500">{t.closingDate || '—'}</span></Td>
                    <Td><Badge variant={t.status === 'Live' ? 'green' : t.status === 'Closed' ? 'gray' : 'amber'}>{t.status}</Badge></Td>
                    {canManage && <Td><button onClick={() => remove(t.id)} className="p-1.5 rounded-md border border-slate-200 bg-white text-rose-400 hover:text-rose-600 shadow-sm"><Trash2 size={13} /></button></Td>}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        )}
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-700">
          <strong>Roadmap:</strong> Government · Private · HR Service · Recruitment · Vendor tenders, plus automatic tender notifications — coming in a future release.
        </div>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Tender (Placeholder)"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button loading={busy} onClick={submit}>Save Tender</Button></div>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Tender Number" value={form.tenderNumber} onChange={e => setForm({ ...form, tenderNumber: e.target.value })} />
            <Input label="Tender Name *" value={form.tenderName} onChange={e => setForm({ ...form, tenderName: e.target.value })} />
            <Select label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
            <Input label="Department" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
            <Input label="Tender Value (₹)" type="number" value={form.tenderValue} onChange={e => setForm({ ...form, tenderValue: e.target.value })} />
            <Select label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={['Upcoming', 'Live', 'Closed'].map(s => ({ value: s, label: s }))} />
            <Input label="Publish Date" type="date" value={form.publishDate} onChange={e => setForm({ ...form, publishDate: e.target.value })} />
            <Input label="Closing Date" type="date" value={form.closingDate} onChange={e => setForm({ ...form, closingDate: e.target.value })} />
          </div>
          <Textarea label="Notes" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
};

export default Tenders;
