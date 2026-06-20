import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '@/api/apiClient';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { History as HistoryIcon, RefreshCw, ShieldCheck } from 'lucide-react';

interface AuditEntry {
  id: number;
  action: string;
  module: string;
  targetId: string;
  details?: string;
  createdAt: string;
  actorName: string;
  actorRole: string;
}

const actionVariant = (action: string): any => {
  const a = action.toUpperCase();
  if (a.startsWith('CREATE')) return 'green';
  if (a.startsWith('DELETE') || a.includes('REVERSE')) return 'red';
  if (a.startsWith('UPDATE') || a.startsWith('UPSERT')) return 'blue';
  if (a.includes('APPROVE') || a.includes('PAID')) return 'indigo';
  return 'gray';
};

const fmt = (iso: string) => {
  try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
};

/**
 * Global Audit Trail — who changed what, when. Backed by GET /api/audit, which
 * aggregates every audited create/update/delete across the platform (the audit
 * rows are written automatically by the Prisma audit middleware).
 */
export const AuditTrail: React.FC<{ role?: string }> = ({ role }) => {
  const isDenied = !!role && role !== 'Super Admin';
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState('All');

  const load = useCallback(async () => {
    if (isDenied) { setLoading(false); return; }
    setLoading(true);
    try { setLogs(await api.audit.getAll('?limit=300') || []); }
    catch { setLogs([]); }
    finally { setLoading(false); }
  }, [isDenied]);

  useEffect(() => { load(); }, [load]);

  const modules = useMemo(
    () => ['All', ...Array.from(new Set(logs.map(l => l.module).filter(Boolean))).sort()],
    [logs]
  );
  const filtered = useMemo(
    () => logs.filter(l => moduleFilter === 'All' || l.module === moduleFilter),
    [logs, moduleFilter]
  );

  if (isDenied) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldCheck className="text-rose-500 w-10 h-10 mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Access Denied</h2>
        <p className="text-sm text-slate-500 max-w-sm mt-1">Global audit logs are restricted to the Super Admin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Audit Trail</h2>
            <p className="text-sm text-slate-500">Who changed what, and when — across every module.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={moduleFilter}
            onChange={(e: any) => setModuleFilter(e.target.value)}
            options={modules.map(m => ({ value: m, label: m === 'All' ? 'All modules' : m }))}
          />
          <Button variant="outline" onClick={load}>
            <RefreshCw size={15} className="mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 text-sm font-semibold">When</th>
              <th className="px-4 py-3 text-sm font-semibold">Who</th>
              <th className="px-4 py-3 text-sm font-semibold">Action</th>
              <th className="px-4 py-3 text-sm font-semibold">Module</th>
              <th className="px-4 py-3 text-sm font-semibold">Record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">Loading audit trail…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">
                <HistoryIcon size={22} className="mx-auto mb-2 text-slate-300" /> No audit records yet.
              </td></tr>
            )}
            {!loading && filtered.map(l => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-sm text-slate-500 whitespace-nowrap">{fmt(l.createdAt)}</td>
                <td className="px-4 py-2.5">
                  <div className="text-sm font-medium text-slate-900">{l.actorName}</div>
                  {l.actorRole && <div className="text-xs text-slate-400">{l.actorRole}</div>}
                </td>
                <td className="px-4 py-2.5"><Badge variant={actionVariant(l.action)}>{l.action.replace(/_/g, ' ')}</Badge></td>
                <td className="px-4 py-2.5 text-sm text-slate-700">{l.module}</td>
                <td className="px-4 py-2.5 text-sm text-slate-500">{l.targetId ? `#${l.targetId}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && <p className="text-xs text-slate-400">Showing {filtered.length} of {logs.length} most-recent entries.</p>}
    </div>
  );
};
