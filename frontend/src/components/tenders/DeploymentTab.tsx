import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, Users, ArrowLeftRight, LogOut } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { api } from '@/api/apiClient';
import { formatDate } from '@/utils/formatDate';
import { ui } from '@/components/ui/feedback';

interface Props {
  activeCompanyId: string;
  role: string;
  onChanged?: () => void;
}

const depStatusVariant = (s: string): any => s === 'Released' ? 'gray' : s === 'Transferred' ? 'amber' : 'green';

export const DeploymentTab: React.FC<Props> = ({ activeCompanyId, role, onChanged }) => {
  const canDeploy = ['Super Admin', 'Company Head', 'HR'].includes(role);
  const [contracts, setContracts] = useState<any[]>([]);
  const [contractId, setContractId] = useState<string>('');
  const [sites, setSites] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [transferDep, setTransferDep] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // contracts + employees (once)
  useEffect(() => {
    (async () => {
      try { const c = await api.contracts.getAll() || []; setContracts(c); if (!contractId && c.length) setContractId(String(c[0].id)); } catch { /* ignore */ }
      try { const e = await api.employees.getAll('?include=all'); const arr = Array.isArray(e) ? e : (e?.data || []); setEmployees(arr.filter((x: any) => String(x.companyId) === String(activeCompanyId) && x.status !== 'Archived')); } catch { /* ignore */ }
    })();
  }, [activeCompanyId]); // eslint-disable-line

  const loadSitesAndDeployments = useCallback(async () => {
    if (!contractId) { setSites([]); setDeployments([]); return; }
    try { setSites(await api.contractSites.getAll(`?contractId=${contractId}`) || []); } catch { setSites([]); }
    try { setDeployments(await api.deployments.getAll(`?contractId=${contractId}`) || []); } catch { setDeployments([]); }
  }, [contractId]);
  useEffect(() => { loadSitesAndDeployments(); }, [loadSitesAndDeployments]);

  const totals = useMemo(() => {
    const required = sites.reduce((s, x) => s + (x.requiredHeadcount || 0), 0);
    const assigned = deployments.filter(d => d.status !== 'Released').length;
    return { required, assigned, vacancies: Math.max(0, required - assigned) };
  }, [sites, deployments]);

  const emptyForm = { employeeId: '', siteId: '', roleAtSite: '', allocationPercent: '100', assignmentDate: new Date().toISOString().split('T')[0] };
  const [form, setForm] = useState<any>(emptyForm);

  const assign = async () => {
    if (!form.employeeId || !form.siteId) { ui.toast.warning('Select both an employee and a site.'); return; }
    setBusy(true);
    try {
      await api.deployments.create({ ...form, employeeId: Number(form.employeeId), siteId: Number(form.siteId), allocationPercent: Number(form.allocationPercent) || 100 });
      ui.toast.success('Employee deployed.'); setAssignOpen(false); setForm(emptyForm); await loadSitesAndDeployments(); onChanged?.();
    } catch (e: any) { ui.toast.error(e?.message || 'Assignment failed.'); }
    finally { setBusy(false); }
  };

  const release = async (d: any) => {
    if (!(await ui.confirm({ message: `Release ${d.employee?.name} from ${d.site?.siteName}?`, confirmText: 'Release', variant: 'warning' }))) return;
    try { await api.deployments.update(d.id, { status: 'Released' }); ui.toast.success('Employee released.'); await loadSitesAndDeployments(); onChanged?.(); }
    catch (e: any) { ui.toast.error(e?.message || 'Release failed.'); }
  };

  const doTransfer = async () => {
    if (!transferDep?.newSiteId) { ui.toast.warning('Select a destination site.'); return; }
    setBusy(true);
    try { await api.deployments.update(transferDep.id, { siteId: Number(transferDep.newSiteId), status: 'Transferred' }); ui.toast.success('Employee transferred.'); setTransferDep(null); await loadSitesAndDeployments(); onChanged?.(); }
    catch (e: any) { ui.toast.error(e?.message || 'Transfer failed.'); }
    finally { setBusy(false); }
  };

  const remove = async (id: any) => {
    if (!(await ui.confirm({ message: 'Remove this deployment record?', confirmText: 'Delete', variant: 'danger' }))) return;
    try { await api.deployments.remove(id); ui.toast.success('Deployment removed.'); await loadSitesAndDeployments(); onChanged?.(); }
    catch (e: any) { ui.toast.error(e?.message || 'Delete failed.'); }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">Deployment</h3>
          <div className="w-64"><Select value={contractId} onChange={e => setContractId(e.target.value)}
            options={[{ value: '', label: contracts.length ? 'Select contract…' : 'No contracts yet' }, ...contracts.map(c => ({ value: String(c.id), label: c.contractName }))]} /></div>
        </div>
        {canDeploy && contractId && sites.length > 0 && <Button icon={<Plus size={15} />} onClick={() => { setForm({ ...emptyForm, siteId: sites[0] ? String(sites[0].id) : '' }); setAssignOpen(true); }}>Assign Employee</Button>}
      </div>

      {/* Headcount summary */}
      {contractId && (
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-center"><p className="text-2xl font-extrabold text-slate-700">{totals.required}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Required</p></div>
          <div className="rounded-xl border border-emerald-150 bg-emerald-50/60 p-3 text-center"><p className="text-2xl font-extrabold text-emerald-600">{totals.assigned}</p><p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500">Assigned</p></div>
          <div className="rounded-xl border border-amber-150 bg-amber-50/60 p-3 text-center"><p className="text-2xl font-extrabold text-amber-600">{totals.vacancies}</p><p className="text-[9px] font-bold uppercase tracking-wider text-amber-500">Vacancies</p></div>
        </div>
      )}

      {!contractId ? (
        <div className="py-12 text-center text-xs text-slate-400">Select a contract to manage deployments.</div>
      ) : deployments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3"><Users className="text-slate-300" size={28} /></div>
          <p className="text-sm font-semibold text-slate-500">No one deployed yet</p>
          <p className="text-xs text-slate-400 mt-1">{sites.length ? (canDeploy ? 'Click "Assign Employee" to deploy staff.' : 'No deployments.') : 'Add sites first (Sites tab), then assign employees.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Employee</Th><Th>Site</Th><Th>Role</Th><Th>Assigned</Th><Th className="text-center">Alloc %</Th><Th>Status</Th><Th>Actions</Th></Tr></Thead>
            <Tbody>
              {deployments.map(d => (
                <Tr key={d.id}>
                  <Td><span className="font-semibold text-slate-800">{d.employee?.name}</span><span className="block text-[10px] text-indigo-600">{d.employee?.employeeId}</span></Td>
                  <Td>{d.site?.siteName || '—'}</Td>
                  <Td>{d.roleAtSite || '—'}</Td>
                  <Td><span className="text-[11px] text-slate-500">{formatDate(d.assignmentDate)}</span></Td>
                  <Td className="text-center">{d.allocationPercent ?? 100}%</Td>
                  <Td><Badge variant={depStatusVariant(d.status)}>{d.status}</Badge></Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {canDeploy && d.status !== 'Released' && <button onClick={() => setTransferDep({ id: d.id, newSiteId: '' })} title="Transfer" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-amber-600 shadow-sm"><ArrowLeftRight size={13} /></button>}
                      {canDeploy && d.status !== 'Released' && <button onClick={() => release(d)} title="Release" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-rose-600 shadow-sm"><LogOut size={13} /></button>}
                      {canDeploy && <button onClick={() => remove(d.id)} title="Delete" className="p-1.5 rounded-md border border-slate-200 bg-white text-rose-400 hover:text-rose-600 shadow-sm"><Trash2 size={13} /></button>}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {/* Assign modal */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign Employee to Site"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button><Button loading={busy} onClick={assign}>Deploy</Button></div>}>
        <div className="space-y-3">
          <Select label="Employee *" value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}
            options={[{ value: '', label: 'Select employee…' }, ...employees.map(e => ({ value: String(e.id), label: `${e.name} (${e.employeeId})` }))]} />
          <Select label="Site *" value={form.siteId} onChange={e => setForm({ ...form, siteId: e.target.value })}
            options={[{ value: '', label: 'Select site…' }, ...sites.map(s => ({ value: String(s.id), label: `${s.siteName} (${s.assignedHeadcount ?? 0}/${s.requiredHeadcount})` }))]} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Role at Site" placeholder="Guard / Supervisor…" value={form.roleAtSite} onChange={e => setForm({ ...form, roleAtSite: e.target.value })} />
            <Input label="Allocation %" type="number" value={form.allocationPercent} onChange={e => setForm({ ...form, allocationPercent: e.target.value })} />
          </div>
          <Input label="Assignment Date" type="date" value={form.assignmentDate} onChange={e => setForm({ ...form, assignmentDate: e.target.value })} />
          <p className="text-[11px] text-slate-400">An employee can be deployed to multiple sites — set Allocation % to split their cost across sites.</p>
        </div>
      </Modal>

      {/* Transfer modal */}
      <Modal open={!!transferDep} onClose={() => setTransferDep(null)} title="Transfer to Another Site"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setTransferDep(null)}>Cancel</Button><Button loading={busy} onClick={doTransfer}>Transfer</Button></div>}>
        <Select label="Destination Site *" value={transferDep?.newSiteId || ''} onChange={e => setTransferDep({ ...transferDep, newSiteId: e.target.value })}
          options={[{ value: '', label: 'Select site…' }, ...sites.map(s => ({ value: String(s.id), label: s.siteName }))]} />
      </Modal>
    </Card>
  );
};

export default DeploymentTab;
