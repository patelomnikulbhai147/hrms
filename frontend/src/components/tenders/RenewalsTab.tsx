import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, CalendarPlus, XCircle, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { api } from '@/api/apiClient';
import { formatDate } from '@/utils/formatDate';
import { ui } from '@/components/ui/feedback';

interface Props {
  activeCompanyId: string;
  canManageCommercial: boolean;
  reloadKey?: number;
  onChanged?: () => void;
}

const daysBetween = (endDate?: string) => {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
};
const alertTone = (d: number | null) => {
  if (d == null) return null;
  if (d < 0) return { label: 'Expired', variant: 'red' as const };
  if (d <= 30) return { label: '30 days', variant: 'red' as const };
  if (d <= 60) return { label: '60 days', variant: 'amber' as const };
  if (d <= 90) return { label: '90 days', variant: 'amber' as const };
  return null;
};

export const RenewalsTab: React.FC<Props> = ({ activeCompanyId, canManageCommercial, reloadKey, onChanged }) => {
  const [contracts, setContracts] = useState<any[]>([]);
  const load = useCallback(async () => { try { setContracts(await api.contracts.getAll() || []); } catch { /* ignore */ } }, []);
  useEffect(() => { load(); }, [load, activeCompanyId, reloadKey]);

  // Contracts needing attention: expiring within 90 days or already expired, not closed.
  const rows = useMemo(() => contracts
    .filter(c => (c.derivedStatus || c.status) !== 'Closed')
    .map(c => ({ ...c, days: daysBetween(c.endDate) }))
    .filter(c => c.days != null && c.days <= 90)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0)), [contracts]);

  const extend = async (c: any, mode: 'Renew' | 'Extend') => {
    const base = c.endDate && !isNaN(new Date(c.endDate).getTime()) ? new Date(c.endDate) : new Date();
    const suggest = new Date(base.getTime()); suggest.setFullYear(suggest.getFullYear() + 1);
    const def = suggest.toISOString().split('T')[0];
    const newEnd = await ui.prompt({ message: `${mode} "${c.contractName}" — new end date (YYYY-MM-DD):`, defaultValue: def });
    if (!newEnd) return;
    try { await api.contracts.update(c.id, { endDate: newEnd, status: 'Active' }); ui.toast.success(`Contract ${mode.toLowerCase()}ed to ${newEnd}.`); await load(); onChanged?.(); }
    catch (e: any) { ui.toast.error(e?.message || `${mode} failed.`); }
  };
  const close = async (c: any) => {
    if (!(await ui.confirm({ message: `Close contract "${c.contractName}"? It moves out of active tracking.`, confirmText: 'Close', variant: 'warning' }))) return;
    try { await api.contracts.update(c.id, { status: 'Closed' }); ui.toast.success('Contract closed.'); await load(); onChanged?.(); }
    catch (e: any) { ui.toast.error(e?.message || 'Close failed.'); }
  };

  const exportColumns = [
    { header: 'Contract No', key: 'contractNumber', width: 16 },
    { header: 'Contract', key: 'contractName', width: 28 },
    { header: 'Client', key: 'clientName', width: 22 },
    { header: 'End Date', key: 'endDate', width: 14, format: (v: any) => formatDate(v) },
    { header: 'Days Left', key: 'days', width: 12 },
    { header: 'Status', key: 'derivedStatus', width: 14 },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><RefreshCw size={15} className="text-indigo-600" /> Renewals &amp; Alerts</h3>
        <ExportMenu fileName="Expiring_Contracts" title="Expiring Contracts Report" sheetName="Renewals" columns={exportColumns} rows={() => rows} />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-3"><RefreshCw className="text-emerald-300" size={28} /></div>
          <p className="text-sm font-semibold text-slate-500">No contracts need renewal</p>
          <p className="text-xs text-slate-400 mt-1">Nothing expires in the next 90 days.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Contract</Th><Th>Client</Th><Th>End Date</Th><Th className="text-center">Days Left</Th><Th>Alert</Th><Th>Actions</Th></Tr></Thead>
            <Tbody>
              {rows.map(c => {
                const tone = alertTone(c.days);
                return (
                  <Tr key={c.id}>
                    <Td><span className="font-semibold text-slate-800">{c.contractName}</span><span className="block font-mono text-[10px] text-indigo-600">{c.contractNumber || ''}</span></Td>
                    <Td>{c.clientName || '—'}</Td>
                    <Td><span className="text-[11px] text-slate-500">{formatDate(c.endDate)}</span></Td>
                    <Td className="text-center"><span className={`text-xs font-extrabold ${c.days < 0 ? 'text-rose-600' : c.days <= 30 ? 'text-rose-600' : c.days <= 60 ? 'text-amber-600' : 'text-amber-500'}`}>{c.days < 0 ? `${Math.abs(c.days)}d ago` : `${c.days}d`}</span></Td>
                    <Td>{tone && <Badge variant={tone.variant} dot><AlertTriangle size={10} className="inline mr-0.5" />{tone.label}</Badge>}</Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        {canManageCommercial && <button onClick={() => extend(c, 'Renew')} title="Renew" className="p-1.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 shadow-sm"><RefreshCw size={13} /></button>}
                        {canManageCommercial && <button onClick={() => extend(c, 'Extend')} title="Extend" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600 shadow-sm"><CalendarPlus size={13} /></button>}
                        {canManageCommercial && <button onClick={() => close(c)} title="Close" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-rose-600 shadow-sm"><XCircle size={13} /></button>}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </div>
      )}
    </Card>
  );
};

export default RenewalsTab;
