// Subscription History tab — global, append-only log of every plan/cycle change
// and suspend/activate across all companies.
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { History, RefreshCw, Search, ArrowRight } from 'lucide-react';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { inr } from '@/config/subscriptionPricing';

export const HistoryTab: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.subscriptions.allHistory(); setRows(Array.isArray(r) ? r : []); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.companyName, r.changedBy, r.oldPlan, r.newPlan, r.reason].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [rows, search]);

  return (
    <div className="space-y-5">
      <SectionHeader title="Subscription History" subtitle="Every plan change, cycle change and status action — platform-wide."
        actions={<Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={load} loading={loading}>Refresh</Button>} />

      <Card>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, admin or reason…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-hairline bg-surface text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10" />
        </div>
      </Card>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <Table>
            <Thead>
              <Tr><Th>Company</Th><Th>Change</Th><Th>Amount</Th><Th>Changed By</Th><Th>Reason</Th><Th>Date</Th></Tr>
            </Thead>
            <Tbody>
              {loading ? (
                <Tr><Td colSpan={6}><div className="py-10 text-center text-ink-muted text-sm">Loading history…</div></Td></Tr>
              ) : filtered.length === 0 ? (
                <Tr><Td colSpan={6}><div className="py-10 text-center text-ink-muted text-sm flex flex-col items-center gap-2"><History size={22} className="text-ink-muted/50" />No subscription changes recorded yet.</div></Td></Tr>
              ) : filtered.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-semibold text-ink">{r.companyName || `#${r.companyId}`}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5 text-[13px]">
                      <Badge variant="gray">{r.oldPlan || '—'}</Badge>
                      <ArrowRight size={12} className="text-ink-muted" />
                      <Badge variant={r.newPlan === 'Free' ? 'gray' : 'blue'}>{r.newPlan || '—'}</Badge>
                    </div>
                    {(r.oldCycle || r.newCycle) && r.oldCycle !== r.newCycle && (
                      <div className="text-[11px] text-ink-muted mt-0.5">{r.oldCycle} → {r.newCycle}</div>
                    )}
                  </Td>
                  <Td className="tabular-nums text-[13px]">
                    {(r.oldAmount != null || r.newAmount != null) ? (
                      <span className="text-ink-secondary">{inr(r.oldAmount || 0)} → <span className="font-semibold text-ink">{inr(r.newAmount || 0)}</span></span>
                    ) : '—'}
                  </Td>
                  <Td className="text-[13px] text-ink-secondary">{r.changedBy || '—'}</Td>
                  <Td className="text-[13px] text-ink-secondary"><span className="block max-w-[260px] truncate" title={r.reason || ''}>{r.reason || '—'}</span></Td>
                  <Td className="text-[13px] text-ink-secondary whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default HistoryTab;
