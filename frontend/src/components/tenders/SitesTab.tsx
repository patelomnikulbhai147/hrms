import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';

interface Props {
  activeCompanyId: string;
  canManageCommercial: boolean;
  onChanged?: () => void;
}

export const SitesTab: React.FC<Props> = ({ activeCompanyId, canManageCommercial, onChanged }) => {
  const [contracts, setContracts] = useState<any[]>([]);
  const [contractId, setContractId] = useState<string>('');
  const [sites, setSites] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const loadContracts = useCallback(async () => {
    try { const c = await api.contracts.getAll() || []; setContracts(c); if (!contractId && c.length) setContractId(String(c[0].id)); }
    catch { /* ignore */ }
  }, [contractId]);
  useEffect(() => { loadContracts(); }, [activeCompanyId]); // eslint-disable-line

  const loadSites = useCallback(async () => {
    if (!contractId) { setSites([]); return; }
    try { setSites(await api.contractSites.getAll(`?contractId=${contractId}`) || []); } catch { setSites([]); }
  }, [contractId]);
  useEffect(() => { loadSites(); }, [loadSites]);

  const emptyForm = { siteName: '', siteAddress: '', siteSupervisor: '', requiredHeadcount: '' };
  const [form, setForm] = useState<any>(emptyForm);
  const openCreate = () => { setEditingId(null); setForm(emptyForm); setCreateOpen(true); };
  const openEdit = (s: any) => { setEditingId(s.id); setForm({ siteName: s.siteName || '', siteAddress: s.siteAddress || '', siteSupervisor: s.siteSupervisor || '', requiredHeadcount: s.requiredHeadcount || '' }); setCreateOpen(true); };

  const submit = async () => {
    if (!form.siteName.trim()) { ui.toast.warning('Site name is required.'); return; }
    if (!contractId) { ui.toast.warning('Select a contract first.'); return; }
    setBusy(true);
    try {
      if (editingId) { await api.contractSites.update(editingId, form); ui.toast.success('Site updated.'); }
      else { await api.contractSites.create({ ...form, contractId: Number(contractId) }); ui.toast.success('Site added.'); }
      setCreateOpen(false); setEditingId(null); setForm(emptyForm); await loadSites(); onChanged?.();
    } catch (e: any) { ui.toast.error(e?.message || 'Save failed.'); }
    finally { setBusy(false); }
  };

  const remove = async (id: any) => {
    if (!(await ui.confirm({ message: 'Delete this site? Its deployments will also be removed.', confirmText: 'Delete', variant: 'danger' }))) return;
    try { await api.contractSites.remove(id); ui.toast.success('Site deleted.'); await loadSites(); onChanged?.(); }
    catch (e: any) { ui.toast.error(e?.message || 'Delete failed.'); }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">Sites</h3>
          <div className="w-64"><Select value={contractId} onChange={e => setContractId(e.target.value)}
            options={[{ value: '', label: contracts.length ? 'Select contract…' : 'No contracts yet' }, ...contracts.map(c => ({ value: String(c.id), label: c.contractName }))]} /></div>
        </div>
        {canManageCommercial && contractId && <Button icon={<Plus size={15} />} onClick={openCreate}>Add Site</Button>}
      </div>

      {!contractId ? (
        <div className="py-12 text-center text-xs text-slate-400">Select a contract to manage its sites.</div>
      ) : sites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3"><MapPin className="text-slate-300" size={28} /></div>
          <p className="text-sm font-semibold text-slate-500">No sites for this contract</p>
          <p className="text-xs text-slate-400 mt-1">{canManageCommercial ? 'Click "Add Site" to create one.' : 'No sites to show.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Site Name</Th><Th>Address</Th><Th>Supervisor</Th><Th className="text-center">Required</Th><Th className="text-center">Assigned</Th><Th className="text-center">Vacancies</Th><Th>Actions</Th></Tr></Thead>
            <Tbody>
              {sites.map(s => (
                <Tr key={s.id}>
                  <Td><span className="font-semibold text-slate-800">{s.siteName}</span></Td>
                  <Td><span className="text-[11px] text-slate-500">{s.siteAddress || '—'}</span></Td>
                  <Td>{s.siteSupervisor || '—'}</Td>
                  <Td className="text-center font-bold text-slate-700">{s.requiredHeadcount}</Td>
                  <Td className="text-center font-bold text-emerald-600">{s.assignedHeadcount ?? 0}</Td>
                  <Td className="text-center"><Badge variant={(s.vacancies ?? 0) > 0 ? 'amber' : 'green'}>{s.vacancies ?? 0}</Badge></Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {canManageCommercial && <button onClick={() => openEdit(s)} title="Edit" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600 shadow-sm"><Edit2 size={13} /></button>}
                      {canManageCommercial && <button onClick={() => remove(s.id)} title="Delete" className="p-1.5 rounded-md border border-slate-200 bg-white text-rose-400 hover:text-rose-600 shadow-sm"><Trash2 size={13} /></button>}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setEditingId(null); }} title={editingId ? 'Edit Site' : 'Add Site'}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setCreateOpen(false); setEditingId(null); }}>Cancel</Button><Button loading={busy} onClick={submit}>{editingId ? 'Update Site' : 'Save Site'}</Button></div>}>
        <div className="space-y-3">
          <Input label="Site Name *" value={form.siteName} onChange={e => setForm({ ...form, siteName: e.target.value })} />
          <Textarea label="Site Address" rows={2} value={form.siteAddress} onChange={e => setForm({ ...form, siteAddress: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Site Supervisor" value={form.siteSupervisor} onChange={e => setForm({ ...form, siteSupervisor: e.target.value })} />
            <Input label="Required Headcount" type="number" value={form.requiredHeadcount} onChange={e => setForm({ ...form, requiredHeadcount: e.target.value })} />
          </div>
        </div>
      </Modal>
    </Card>
  );
};

export default SitesTab;
