import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, Trash2, Ban, Play, Globe } from 'lucide-react';
import { api } from '@/api/apiClient';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { formatDateTime } from '@/utils/formatDate';

const STATUS_BADGE: Record<string, any> = {
  PENDING_DNS: 'warning', DNS_VERIFIED: 'blue', SSL_PENDING: 'warning',
  SSL_ISSUED: 'blue', ACTIVE: 'green', FAILED: 'danger', DISABLED: 'gray',
};

/** Super Admin → Subscription Management → White Label: fleet view of every
 *  custom-domain mapping with disable / re-enable / force-reverify / delete. */
export const WhiteLabelTab: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.customDomain.admin.mappings() || []);
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not load domain mappings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const act = async (id: number, fn: () => Promise<any>, okMsg: string) => {
    setBusyId(id);
    try {
      await fn();
      ui.toast.success(okMsg);
      loadAll();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (m: any) => {
    const ok = await ui.confirm({
      title: 'Delete domain mapping?',
      message: `${m.domain} (${m.companyName}) will stop routing immediately. The company can add a domain again later.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (ok) act(m.id, () => api.customDomain.admin.remove(m.id), 'Mapping deleted.');
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-bold text-slate-800 inline-flex items-center gap-2">
          <Globe className="w-4 h-4" /> Custom Domain Mappings <Badge variant="purple">🧪 Beta</Badge>
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => act(0, () => api.customDomain.admin.renewSweep(), 'SSL renewal sweep completed.')} icon={<ShieldCheck className="w-3.5 h-3.5" />}>Run SSL Renewal Sweep</Button>
          <Button variant="outline" size="sm" onClick={loadAll} icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}>Refresh</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-[12.5px] font-medium text-slate-500 py-8 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[12.5px] font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3">
          No custom domains have been configured by any company yet.
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead><tr className="bg-slate-50 border-b border-slate-200">
                {['Company', 'Domain', 'Status', 'SSL', 'Verified', 'Last Checked', 'SSL Renewal', 'Actions'].map((h) => (
                  <th key={h} className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2.5 text-[12px] font-semibold text-slate-800 whitespace-nowrap">{m.companyName} <span className="text-slate-400 font-medium">· {m.companyPlan}</span></td>
                    <td className="px-3 py-2.5 text-[12px] font-bold tabular-nums whitespace-nowrap">{m.domain}</td>
                    <td className="px-3 py-2.5"><Badge variant={STATUS_BADGE[m.status] || 'gray'} dot>{m.status}</Badge></td>
                    <td className="px-3 py-2.5"><Badge variant={m.sslStatus === 'ISSUED' ? 'green' : m.sslStatus === 'RENEWAL_FAILED' ? 'danger' : 'gray'}>{m.sslStatus}</Badge></td>
                    <td className="px-3 py-2.5 text-[11.5px] font-medium text-slate-600 whitespace-nowrap">{m.dnsVerifiedAt ? formatDateTime(m.dnsVerifiedAt) : '—'}</td>
                    <td className="px-3 py-2.5 text-[11.5px] font-medium text-slate-600 whitespace-nowrap">{m.dnsCheckedAt ? formatDateTime(m.dnsCheckedAt) : '—'}</td>
                    <td className="px-3 py-2.5 text-[11.5px] font-medium text-slate-600 whitespace-nowrap">{m.sslExpiresAt ? formatDateTime(m.sslExpiresAt) : '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" disabled={busyId === m.id} onClick={() => act(m.id, () => api.customDomain.admin.reverify(m.id), 'Re-verification completed.')} icon={<RefreshCw className="w-3 h-3" />}>Reverify</Button>
                        {m.status === 'DISABLED' ? (
                          <Button variant="outline" size="sm" disabled={busyId === m.id} onClick={() => act(m.id, () => api.customDomain.admin.enable(m.id), 'Mapping re-enabled.')} icon={<Play className="w-3 h-3 text-emerald-600" />}>Enable</Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled={busyId === m.id} onClick={() => act(m.id, () => api.customDomain.admin.disable(m.id), 'Mapping disabled.')} icon={<Ban className="w-3 h-3 text-amber-600" />}>Disable</Button>
                        )}
                        <Button variant="outline" size="sm" disabled={busyId === m.id} onClick={() => handleDelete(m)} icon={<Trash2 className="w-3 h-3 text-red-500" />}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhiteLabelTab;
