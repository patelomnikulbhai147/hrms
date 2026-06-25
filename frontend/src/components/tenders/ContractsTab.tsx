import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, Eye, Edit2, Search, FileSignature, Download, FileText, Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { api } from '@/api/apiClient';
import { formatDate } from '@/utils/formatDate';
import { ui } from '@/components/ui/feedback';
import { ContractForm } from './ContractForm';

// The effective status used for tabs/cards: a manually-set Closed/Renewed/Draft
// always wins; otherwise the date-derived status (Active/Expiring Soon/Expired).
export const effectiveContractStatus = (c: any): string => {
  if (['Closed', 'Renewed', 'Draft'].includes(c.status)) return c.status;
  return c.derivedStatus || c.status || 'Active';
};

type ContractTab = 'active' | 'expiring' | 'expired' | 'closed' | 'renewed';
const CONTRACT_TABS: { id: ContractTab; label: string; statuses: string[] }[] = [
  { id: 'active', label: 'Active', statuses: ['Active'] },
  { id: 'expiring', label: 'Expiring Soon', statuses: ['Expiring Soon'] },
  { id: 'expired', label: 'Expired', statuses: ['Expired'] },
  { id: 'closed', label: 'Closed', statuses: ['Closed'] },
  { id: 'renewed', label: 'Renewed', statuses: ['Renewed'] },
];
const CONTRACT_REPORT_COLS = [
  { header: 'Contract No', key: 'contractNumber', width: 16 },
  { header: 'Name', key: 'contractName', width: 28 },
  { header: 'Client', key: 'clientName', width: 22 },
  { header: 'Value', key: 'contractValue', width: 14 },
  { header: 'Required', key: 'requiredHeadcount', width: 10 },
  { header: 'Assigned', key: 'assignedHeadcount', width: 10 },
  { header: 'Status', key: 'derivedStatus', width: 14 },
  { header: 'End Date', key: 'endDate', width: 14, format: (v: any) => formatDate(v) },
];
export const contractStatusVariant = (s: string): any =>
  s === 'Active' ? 'green' : s === 'Expiring Soon' ? 'amber' : s === 'Expired' ? 'red' : 'gray';

const money = (v: any) => (v || v === 0) && !isNaN(Number(v)) ? `₹${Number(v).toLocaleString('en-IN')}` : '—';

interface Props {
  activeCompanyId: string;
  canManageCommercial: boolean;
  reloadKey?: number;
  onChanged?: () => void;
}

export const ContractsTab: React.FC<Props> = ({ activeCompanyId, canManageCommercial, reloadKey, onChanged }) => {
  const [contracts, setContracts] = useState<any[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);   // full contract for edit, or null for create
  const [viewId, setViewId] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [cost, setCost] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<ContractTab>('active');

  const load = useCallback(async () => { try { setContracts(await api.contracts.getAll() || []); } catch { /* ignore */ } }, []);
  useEffect(() => { load(); }, [load, activeCompanyId, reloadKey]);
  useEffect(() => {
    if (viewId) {
      api.contracts.getOne(viewId).then(setDetail).catch(() => setDetail(null));
      api.contracts.getCost(viewId).then(setCost).catch(() => setCost(null));
    } else { setDetail(null); setCost(null); }
  }, [viewId]);

  const activeStatuses = useMemo(() => CONTRACT_TABS.find(t => t.id === tab)?.statuses || [], [tab]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter(c =>
      activeStatuses.includes(effectiveContractStatus(c)) &&
      (!q || `${c.contractName} ${c.contractNumber || ''} ${c.clientName || ''}`.toLowerCase().includes(q)));
  }, [contracts, search, activeStatuses]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = async (c: any) => {
    // Fetch the full record (the list payload omits documents/activity to stay light).
    try { setEditing(await api.contracts.getOne(c.id)); }
    catch { setEditing(c); }
    setFormOpen(true);
  };
  const onSaved = async () => { setFormOpen(false); setEditing(null); await load(); onChanged?.(); };
  const closeForm = () => { setFormOpen(false); setEditing(null); };

  const remove = async (id: any) => {
    if (!(await ui.confirm({ message: 'Delete this contract? Its sites and deployments will also be removed.', confirmText: 'Delete', variant: 'danger' }))) return;
    try { await api.contracts.remove(id); ui.toast.success('Contract deleted.'); await load(); onChanged?.(); }
    catch (e: any) { ui.toast.error(e?.message || 'Delete failed.'); }
  };

  const downloadDoc = (d: any) => { const a = document.createElement('a'); a.href = d.dataUrl; a.download = d.name; document.body.appendChild(a); a.click(); a.remove(); };

  if (formOpen) {
    return <ContractForm editing={editing} activeCompanyId={activeCompanyId} onCancel={closeForm} onSaved={onSaved} />;
  }

  const dd = detail?.details || {};

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex flex-wrap gap-1">
        {CONTRACT_TABS.map(t => {
          const n = contracts.filter(c => t.statuses.includes(effectiveContractStatus(c))).length;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>{t.label}<span className="ml-1 opacity-70">({n})</span></button>
          );
        })}
      </div>

      <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-slate-800">{CONTRACT_TABS.find(t => t.id === tab)?.label} Contracts</h3>
        <div className="flex items-center gap-2">
          <Input icon={<Search size={14} />} placeholder="Search contracts…" value={search} onChange={e => setSearch(e.target.value)} />
          <ExportMenu fileName="Contract_Report" title="Contract Report" sheetName="Contracts" columns={CONTRACT_REPORT_COLS} rows={() => rows} />
          {canManageCommercial && <Button icon={<Plus size={15} />} onClick={openCreate}>Add Contract</Button>}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3"><FileSignature className="text-slate-300" size={28} /></div>
          <p className="text-sm font-semibold text-slate-500">No contracts yet</p>
          <p className="text-xs text-slate-400 mt-1">Win a tender and click "Convert to Contract", or add one manually.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Contract No</Th><Th>Name</Th><Th>Client</Th><Th>Value</Th><Th>End Date</Th><Th>Sites</Th><Th>Headcount</Th><Th>Status</Th><Th>Actions</Th></Tr></Thead>
            <Tbody>
              {rows.map(c => (
                <Tr key={c.id}>
                  <Td><span className="font-mono text-[11px] text-indigo-700">{c.contractNumber || '—'}</span></Td>
                  <Td><span className="font-semibold text-slate-800">{c.contractName}</span></Td>
                  <Td>{c.clientName || '—'}</Td>
                  <Td>{money(c.contractValue)}</Td>
                  <Td><span className="text-[11px] text-slate-500">{formatDate(c.endDate)}</span></Td>
                  <Td className="text-center">{c._count?.sites ?? c.sites?.length ?? 0}</Td>
                  <Td><span className="text-[11px] font-bold"><span className="text-emerald-600">{c.assignedHeadcount ?? 0}</span><span className="text-slate-400"> / {c.requiredHeadcount ?? 0}</span></span></Td>
                  <Td><Badge variant={contractStatusVariant(c.derivedStatus || c.status)}>{c.derivedStatus || c.status}</Badge></Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setViewId(c.id)} title="View" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-indigo-600 shadow-sm"><Eye size={13} /></button>
                      {canManageCommercial && <button onClick={() => openEdit(c)} title="Edit" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600 shadow-sm"><Edit2 size={13} /></button>}
                      {canManageCommercial && <button onClick={() => remove(c.id)} title="Delete" className="p-1.5 rounded-md border border-slate-200 bg-white text-rose-400 hover:text-rose-600 shadow-sm"><Trash2 size={13} /></button>}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {/* View detail (enterprise fields + sites + deployments + documents + activity) */}
      <Modal open={!!viewId} onClose={() => setViewId(null)} title={detail?.contractName || 'Contract'} size="lg"
        footer={<div className="flex justify-end gap-2">{canManageCommercial && detail && <Button variant="outline" icon={<Edit2 size={14} />} onClick={() => { setViewId(null); openEdit(detail); }}>Edit</Button>}<Button variant="outline" onClick={() => setViewId(null)}>Close</Button></div>}>
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={contractStatusVariant(detail.derivedStatus || detail.status)}>{detail.derivedStatus || detail.status}</Badge>
              {detail.contractNumber && <span className="font-mono text-[11px] text-indigo-700">{detail.contractNumber}</span>}
              {dd.info?.contractType && <Badge variant="gray">{dd.info.contractType}</Badge>}
              {dd.info?.priority && <Badge variant={dd.info.priority === 'Critical' || dd.info.priority === 'High' ? 'red' : 'gray'}>{dd.info.priority} priority</Badge>}
              {dd.approval?.status && <Badge variant={dd.approval.status === 'Approved' ? 'green' : dd.approval.status === 'Rejected' ? 'red' : 'amber'}>{dd.approval.status}</Badge>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                ['Client', detail.clientName || '—'],
                ['Value', `${dd.info?.currency || ''} ${money(detail.contractValue)}`.trim()],
                ['Start', formatDate(detail.startDate)],
                ['End', formatDate(detail.endDate)],
                ['Contact', dd.client?.contactPerson || '—'],
                ['Mobile', dd.client?.mobile || '—'],
                ['Payment Terms', dd.info?.paymentTerms || '—'],
                ['Owner', dd.info?.owner || '—'],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between border-b border-slate-100 py-1.5"><span className="text-xs text-slate-500 font-semibold">{k}</span><span className="text-xs text-slate-800 font-bold text-right">{v}</span></div>
              ))}
            </div>

            {/* Financial + guarantee snapshot */}
            {(dd.financial || dd.bankGuarantee?.required === 'Yes') && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 grid grid-cols-2 gap-2">
                {dd.financial?.securityDeposit && <div className="flex justify-between"><span className="text-[11px] text-slate-500">Security Deposit</span><span className="text-[11px] font-bold">{money(dd.financial.securityDeposit)}</span></div>}
                {dd.financial?.advancePayment && <div className="flex justify-between"><span className="text-[11px] text-slate-500">Advance</span><span className="text-[11px] font-bold">{money(dd.financial.advancePayment)}</span></div>}
                {dd.financial?.remainingBalance && <div className="flex justify-between"><span className="text-[11px] text-slate-500">Balance</span><span className="text-[11px] font-bold">{money(dd.financial.remainingBalance)}</span></div>}
                {dd.bankGuarantee?.required === 'Yes' && <div className="flex justify-between"><span className="text-[11px] text-slate-500">BG {dd.bankGuarantee.bgNumber || ''}</span><span className="text-[11px] font-bold">{money(dd.bankGuarantee.bgAmount)} · {dd.bankGuarantee.status || '—'}</span></div>}
              </div>
            )}

            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Sites ({detail.sites?.length || 0})</p>
              {detail.sites?.length ? detail.sites.map((s: any) => (
                <div key={s.id} className="flex justify-between text-xs py-1 border-b border-slate-50"><span className="text-slate-700 font-semibold">{s.siteName}</span><span className="text-slate-400">Req. {s.requiredHeadcount}</span></div>
              )) : <p className="text-xs text-slate-400">No sites yet — add them in the Sites tab.</p>}
            </div>

            {cost && (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-indigo-400 uppercase font-bold">Payroll Cost (manpower) · {cost.period}</p>
                  <p className="text-sm font-extrabold text-indigo-700">₹{Number(cost.total || 0).toLocaleString('en-IN')}</p>
                </div>
                {Object.keys(cost.bySite || {}).length > 0 && (
                  <div className="space-y-0.5">
                    {Object.entries(cost.bySite).map(([site, amt]: any) => (
                      <div key={site} className="flex justify-between text-[11px] text-slate-600"><span>{site}</span><span className="font-semibold">₹{Number(amt).toLocaleString('en-IN')}</span></div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Documents */}
            {Array.isArray(detail.documents) && detail.documents.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Documents ({detail.documents.length})</p>
                <div className="space-y-1">
                  {detail.documents.map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-slate-50">
                      <span className="flex items-center gap-1.5 min-w-0"><FileText size={13} className="text-indigo-500 shrink-0" /><span className="truncate text-slate-700">{d.name}</span><span className="text-slate-400 shrink-0">· {d.category}</span></span>
                      <button onClick={() => downloadDoc(d)} title="Download" className="p-1 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-indigo-600 shrink-0"><Download size={12} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Deployed ({detail.deployments?.length || 0})</p>
              {detail.deployments?.length ? detail.deployments.slice(0, 8).map((d: any) => (
                <div key={d.id} className="flex justify-between text-xs py-1 border-b border-slate-50"><span className="text-slate-700">{d.employee?.name} <span className="text-slate-400">· {d.site?.siteName}</span></span><Badge variant={d.status === 'Released' ? 'gray' : d.status === 'Transferred' ? 'amber' : 'green'}>{d.status}</Badge></div>
              )) : <p className="text-xs text-slate-400">No employees deployed yet — assign them in the Deployment tab.</p>}
            </div>

            {/* Activity timeline */}
            {Array.isArray(detail.activity) && detail.activity.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold mb-1 flex items-center gap-1"><Clock size={11} /> Activity</p>
                <div className="space-y-1">
                  {[...detail.activity].reverse().slice(0, 10).map((a: any, i: number) => (
                    <div key={i} className="flex items-start justify-between gap-3 text-[11px] py-1 border-b border-slate-50">
                      <span className="text-slate-700">{a.action}{a.field ? <span className="text-slate-400"> · {a.field}</span> : ''}</span>
                      <span className="text-slate-400 shrink-0 text-right">{a.by} · {formatDate(a.at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
      </Card>
    </div>
  );
};

export default ContractsTab;
