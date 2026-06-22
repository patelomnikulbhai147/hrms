import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, Inbox, Eye, Edit2, Search, ExternalLink, Send, ArrowRightCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { api } from '@/api/apiClient';
import { formatDate } from '@/utils/formatDate';
import { ui } from '@/components/ui/feedback';

const TENDER_REPORT_COLS = [
  { header: 'Tender No', key: 'tenderNumber', width: 16 },
  { header: 'Name', key: 'tenderName', width: 28 },
  { header: 'Client', key: 'clientName', width: 22 },
  { header: 'Service', key: 'serviceType', width: 16 },
  { header: 'Value', key: 'tenderValue', width: 14 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'End Date', key: 'endDate', width: 14, format: (v: any) => formatDate(v) },
];

const TENDER_STATUSES = ['Draft', 'Submitted', 'Under Review', 'Won', 'Lost', 'Cancelled'];
const CATEGORIES = ['Government', 'Private', 'HR Service', 'Recruitment', 'Vendor'];
const statusVariant = (s: string): any =>
  s === 'Won' ? 'green' : s === 'Lost' || s === 'Cancelled' ? 'red' : s === 'Under Review' ? 'indigo' : s === 'Submitted' ? 'blue' : 'amber';

interface Props {
  activeCompanyId: string;
  canManageCommercial: boolean;
  onConverted?: () => void;
  onChanged?: () => void;
}

export const TendersTab: React.FC<Props> = ({ activeCompanyId, canManageCommercial, onConverted, onChanged }) => {
  const [tenders, setTenders] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<any>(null);
  const [viewTender, setViewTender] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => { try { setTenders(await api.tenders.getAll() || []); } catch { /* ignore */ } }, []);
  useEffect(() => { load(); }, [load, activeCompanyId]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenders.filter(t =>
      (!statusFilter || t.status === statusFilter) &&
      (!q || `${t.tenderName} ${t.tenderNumber || ''} ${t.clientName || ''} ${t.serviceType || ''}`.toLowerCase().includes(q)));
  }, [tenders, search, statusFilter]);

  const emptyForm = { tenderNumber: '', tenderName: '', clientName: '', serviceType: '', category: 'Government', tenderValue: '', startDate: '', endDate: '', closingDate: '', status: 'Draft', documentPath: '', remarks: '' };
  const [form, setForm] = useState<any>(emptyForm);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setCreateOpen(true); };
  const openEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      tenderNumber: t.tenderNumber || '', tenderName: t.tenderName || '', clientName: t.clientName || '', serviceType: t.serviceType || '',
      category: t.category || 'Government', tenderValue: t.tenderValue || '',
      startDate: (t.startDate || '').slice(0, 10), endDate: (t.endDate || '').slice(0, 10), closingDate: (t.closingDate || '').slice(0, 10),
      status: t.status || 'Draft', documentPath: t.documentPath || '', remarks: t.remarks || t.notes || '',
    });
    setCreateOpen(true);
  };

  const submit = async () => {
    if (!form.tenderName.trim()) { ui.toast.warning('Tender name is required.'); return; }
    setBusy(true);
    try {
      if (editingId) { await api.tenders.update(editingId, form); ui.toast.success('Tender updated.'); }
      else { await api.tenders.create({ ...form, companyId: activeCompanyId }); ui.toast.success('Tender created.'); }
      setCreateOpen(false); setEditingId(null); setForm(emptyForm); await load(); onChanged?.();
    } catch (e: any) { ui.toast.error(e?.message || 'Save failed.'); }
    finally { setBusy(false); }
  };

  const setStatus = async (t: any, status: string) => {
    try { await api.tenders.update(t.id, { status }); ui.toast.success(`Tender marked ${status}.`); await load(); onChanged?.(); }
    catch (e: any) { ui.toast.error(e?.message || 'Update failed.'); }
  };

  const convert = async (t: any) => {
    if (!(await ui.confirm({ title: 'Convert to Contract', message: `Create a contract from won tender "${t.tenderName}"? The contract is auto-filled from the tender.`, confirmText: 'Convert' }))) return;
    try {
      const res = await api.tenders.convert(t.id);
      ui.toast.success(res?.alreadyConverted ? 'Tender already had a contract — opened it.' : 'Contract created from tender.');
      await load(); onConverted?.();
    } catch (e: any) { ui.toast.error(e?.message || 'Conversion failed.'); }
  };

  const remove = async (id: any) => {
    if (!(await ui.confirm({ message: 'Permanently delete this tender?', confirmText: 'Delete', variant: 'danger' }))) return;
    try { await api.tenders.remove(id); ui.toast.success('Tender deleted.'); await load(); onChanged?.(); }
    catch (e: any) { ui.toast.error(e?.message || 'Delete failed.'); }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-slate-800">Tenders</h3>
        <div className="flex items-center gap-2">
          <Input icon={<Search size={14} />} placeholder="Search tenders…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="w-40"><Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} options={[{ value: '', label: 'All statuses' }, ...TENDER_STATUSES.map(s => ({ value: s, label: s }))]} /></div>
          <ExportMenu fileName="Tender_Report" title="Tender Report" sheetName="Tenders" columns={TENDER_REPORT_COLS} rows={() => rows} />
          {canManageCommercial && <Button icon={<Plus size={15} />} onClick={openCreate}>Add Tender</Button>}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3"><Inbox className="text-slate-300" size={28} /></div>
          <p className="text-sm font-semibold text-slate-500">No tenders yet</p>
          <p className="text-xs text-slate-400 mt-1">{canManageCommercial ? 'Click "Add Tender" to create one.' : 'No tenders to show.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Tender No</Th><Th>Name</Th><Th>Client</Th><Th>Service</Th><Th>Value</Th><Th>End Date</Th><Th>Status</Th><Th>Actions</Th></Tr></Thead>
            <Tbody>
              {rows.map(t => (
                <Tr key={t.id}>
                  <Td><span className="font-mono text-[11px] text-indigo-700">{t.tenderNumber || '—'}</span></Td>
                  <Td><span className="font-semibold text-slate-800">{t.tenderName}</span></Td>
                  <Td>{t.clientName || '—'}</Td>
                  <Td>{t.serviceType ? <Badge variant="indigo">{t.serviceType}</Badge> : '—'}</Td>
                  <Td>{t.tenderValue ? `₹${Number(t.tenderValue).toLocaleString('en-IN')}` : '—'}</Td>
                  <Td><span className="text-[11px] text-slate-500">{formatDate(t.endDate || t.closingDate)}</span></Td>
                  <Td><Badge variant={statusVariant(t.status)}>{t.status}</Badge>{t.convertedContractId && <span className="ml-1 text-[9px] font-bold text-emerald-600">✓ Contract</span>}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setViewTender(t)} title="View" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-indigo-600 shadow-sm"><Eye size={13} /></button>
                      {canManageCommercial && <button onClick={() => openEdit(t)} title="Edit" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600 shadow-sm"><Edit2 size={13} /></button>}
                      {canManageCommercial && t.status === 'Draft' && <button onClick={() => setStatus(t, 'Submitted')} title="Submit" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600 shadow-sm"><Send size={13} /></button>}
                      {canManageCommercial && t.status === 'Won' && !t.convertedContractId && <button onClick={() => convert(t)} title="Convert to Contract" className="p-1.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 shadow-sm"><ArrowRightCircle size={13} /></button>}
                      {canManageCommercial && <button onClick={() => remove(t.id)} title="Delete" className="p-1.5 rounded-md border border-slate-200 bg-white text-rose-400 hover:text-rose-600 shadow-sm"><Trash2 size={13} /></button>}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {/* Create / Edit */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setEditingId(null); }} title={editingId ? 'Edit Tender' : 'Add Tender'}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setCreateOpen(false); setEditingId(null); }}>Cancel</Button><Button loading={busy} onClick={submit}>{editingId ? 'Update Tender' : 'Save Tender'}</Button></div>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Tender Number" value={form.tenderNumber} onChange={e => setForm({ ...form, tenderNumber: e.target.value })} />
            <Input label="Tender Name *" value={form.tenderName} onChange={e => setForm({ ...form, tenderName: e.target.value })} />
            <Input label="Client Name" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} />
            <Input label="Service Type" placeholder="Security / Housekeeping / Manpower…" value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })} />
            <Select label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
            <Input label="Tender Value (₹)" type="number" value={form.tenderValue} onChange={e => setForm({ ...form, tenderValue: e.target.value })} />
            <Input label="Start Date" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            <Input label="End Date" type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
            <Input label="Closing Date" type="date" value={form.closingDate} onChange={e => setForm({ ...form, closingDate: e.target.value })} />
            <Select label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={TENDER_STATUSES.map(s => ({ value: s, label: s }))} />
          </div>
          <Input label="Document Link / Attachment URL" placeholder="https://… or document reference" value={form.documentPath} onChange={e => setForm({ ...form, documentPath: e.target.value })} />
          <Textarea label="Remarks" rows={2} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
        </div>
      </Modal>

      {/* View detail */}
      <Modal open={!!viewTender} onClose={() => setViewTender(null)} title={viewTender?.tenderName || 'Tender'}
        footer={<div className="flex justify-end gap-2">
          {viewTender && canManageCommercial && viewTender.status === 'Won' && !viewTender.convertedContractId &&
            <Button icon={<ArrowRightCircle size={14} />} onClick={() => { const t = viewTender; setViewTender(null); convert(t); }}>Convert to Contract</Button>}
          <Button variant="outline" onClick={() => setViewTender(null)}>Close</Button>
        </div>}>
        {viewTender && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Badge variant={statusVariant(viewTender.status)}>{viewTender.status}</Badge>{viewTender.serviceType && <Badge variant="indigo">{viewTender.serviceType}</Badge>}</div>
            {[
              ['Tender Number', viewTender.tenderNumber || '—'],
              ['Client', viewTender.clientName || '—'],
              ['Value', viewTender.tenderValue ? `₹${Number(viewTender.tenderValue).toLocaleString('en-IN')}` : '—'],
              ['Start Date', formatDate(viewTender.startDate)],
              ['End Date', formatDate(viewTender.endDate || viewTender.closingDate)],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-xs text-slate-500 font-semibold">{k}</span><span className="text-xs text-slate-800 font-bold">{v}</span></div>
            ))}
            {viewTender.documentPath && (
              <a href={viewTender.documentPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline pt-1"><ExternalLink size={13} /> Open attachment</a>
            )}
            {(viewTender.remarks || viewTender.notes) && <div className="pt-2"><p className="text-[10px] text-slate-400 uppercase font-bold">Remarks</p><p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{viewTender.remarks || viewTender.notes}</p></div>}
          </div>
        )}
      </Modal>
    </Card>
  );
};

export default TendersTab;
