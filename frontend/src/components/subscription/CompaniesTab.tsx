// ─────────────────────────────────────────────────────────────────────────────
// COMPANIES — one row per company, seven columns, nothing else.
//
// The old table carried eleven columns (head, branches, cycle, price/user,
// amount…) which pushed the two numbers an operator actually acts on — seats
// used and money owed — off the right edge. Everything dropped from here is
// still one click away on the company's detail page.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, RefreshCw, Ban, Play, ChevronLeft, ChevronRight, ChevronRight as Caret,
  Building2, Crown, FileDown,
} from 'lucide-react';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Badge, statusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { Panel, Empty, inr, inputCls, shortDate, PLAN_VARIANT, exportCsv } from './kit';

const PAGE_SIZE = 12;

interface Props { onOpen: (companyId: string | number) => void }

export const CompaniesTab: React.FC<Props> = ({ onOpen }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [usage, setUsage] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, u, inv] = await Promise.all([
        api.subscriptions.list(),
        api.employeeSlots.admin.usage().catch(() => []),
        api.subscriptionInvoices.list({}).catch(() => []),
      ]);
      setRows(Array.isArray(l) ? l : []);
      setUsage(Array.isArray(u) ? u : []);
      setInvoices(Array.isArray(inv) ? inv : []);
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Seat limit per company (base plan limit + purchased add-on slots).
  const seatsBy = useMemo(() => {
    const m = new Map<number, { limit: number | null; used: number }>();
    for (const u of usage) m.set(Number(u.companyId), { limit: u.unlimited ? null : Number(u.limit), used: Number(u.used) || 0 });
    return m;
  }, [usage]);

  // Outstanding money per company — summed from the live invoice register so the
  // figure here and the one in Billing can never disagree.
  const owedBy = useMemo(() => {
    const m = new Map<number, number>();
    for (const i of invoices) {
      if (!['Pending', 'Overdue'].includes(i.status)) continue;
      const bal = Number(i.balance ?? (Number(i.grandTotal) || 0) - (Number(i.amountPaid) || 0)) || 0;
      if (bal <= 0) continue;
      m.set(Number(i.companyId), (m.get(Number(i.companyId)) || 0) + bal);
    }
    return m;
  }, [invoices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (planFilter !== 'all' && r.plan !== planFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.companyName, r.companyHead, r.companyHeadEmail].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [rows, search, planFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, planFilter, statusFilter]);

  const toggleStatus = async (r: any) => {
    const suspend = r.status !== 'Suspended';
    const ok = await ui.confirm({
      title: suspend ? 'Suspend subscription?' : 'Activate subscription?',
      message: suspend
        ? `Suspending will block ${r.companyName}'s users from signing in and making changes until re-activated.`
        : `Re-activate ${r.companyName}'s workspace access.`,
      confirmText: suspend ? 'Suspend' : 'Activate',
      variant: suspend ? 'danger' : 'primary',
    });
    if (!ok) return;
    setBusyId(r.companyId);
    try {
      if (suspend) await api.subscriptions.suspend(r.companyId); else await api.subscriptions.activate(r.companyId);
      ui.toast.success(`${r.companyName} ${suspend ? 'suspended' : 'activated'}.`);
      await load();
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const exportRows = () => exportCsv('companies.csv', [
    ['Company', 'companyName'], ['Head', 'companyHead'], ['Plan', 'plan'], ['Cycle', 'billingCycle'],
    ['Employees', 'employees'], ['Status', 'status'], ['Renewal', 'renewalDate'], ['Amount', 'amount'],
  ], filtered);

  return (
    <div className="space-y-5">
      {/* Filters — one row, above the table. */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, head or email…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className={`${inputCls} lg:w-40`}>
          <option value="all">All plans</option>
          {['Free', 'Starter', 'Professional', 'Enterprise', 'Custom'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls} lg:w-40`}>
          <option value="all">All statuses</option>
          {['Active', 'Suspended', 'Expired', 'Cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<FileDown size={14} />} onClick={exportRows}>Export</Button>
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={load} loading={loading}>Refresh</Button>
        </div>
      </div>

      <Panel flush>
        <div className="overflow-x-auto">
          <Table>
            <Thead>
              <Tr>
                <Th>Company</Th>
                <Th>Plan</Th>
                <Th>Employees Used</Th>
                <Th>Renewal</Th>
                <Th>Status</Th>
                <Th>Outstanding</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {loading ? (
                <Tr><Td colSpan={7}><div className="py-12 text-center text-ink-muted text-sm">Loading companies…</div></Td></Tr>
              ) : pageRows.length === 0 ? (
                <Tr><Td colSpan={7}><Empty icon={<Building2 size={22} />} title="No companies match your filters." hint="Clear the search or pick a different plan/status." /></Td></Tr>
              ) : pageRows.map((r) => {
                const seats = seatsBy.get(Number(r.companyId));
                const used = seats?.used ?? r.employees ?? 0;
                const limit = seats ? seats.limit : null;
                const ratio = limit && limit > 0 ? Math.min(1, used / limit) : 0;
                const owed = owedBy.get(Number(r.companyId)) || 0;
                return (
                  <Tr
                    key={r.companyId}
                    onClick={() => onOpen(r.companyId)}
                    tabIndex={0}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r.companyId); }
                    }}
                    aria-label={`Open ${r.companyName}`}
                    className="cursor-pointer transition-colors hover:bg-surface-muted/70 focus:outline-none focus:bg-surface-muted/70"
                  >
                    <Td>
                      <div className="font-semibold text-ink leading-tight">{r.companyName}</div>
                      <div className="text-[11.5px] text-ink-muted truncate max-w-[220px]">{r.companyHeadEmail || r.companyHead}</div>
                    </Td>
                    <Td>
                      <Badge variant={PLAN_VARIANT[r.plan] || 'gray'}>{r.plan === 'Custom' && <Crown size={11} />}{r.plan}</Badge>
                      <div className="text-[11px] text-ink-muted mt-1">{r.billingCycle}</div>
                    </Td>
                    <Td>
                      <div className="text-[13px] font-semibold text-ink tabular-nums">
                        {used}<span className="text-ink-muted font-medium"> / {limit == null ? '∞' : limit}</span>
                      </div>
                      {limit != null && limit > 0 && (
                        <div className="mt-1 h-1.5 w-24 rounded-full bg-surface-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${ratio >= 1 ? 'bg-rose-500' : ratio >= 0.85 ? 'bg-amber-500' : 'bg-brand-500'}`}
                            style={{ width: `${Math.max(3, ratio * 100)}%` }}
                          />
                        </div>
                      )}
                    </Td>
                    <Td><span className="text-[13px] text-ink-secondary whitespace-nowrap">{shortDate(r.renewalDate)}</span></Td>
                    <Td><Badge variant={statusBadge(r.status)} dot>{r.status}</Badge></Td>
                    <Td>
                      {owed > 0
                        ? <span className="text-[13px] font-bold text-rose-600 tabular-nums">{inr(owed)}</span>
                        : <span className="text-[13px] text-ink-muted tabular-nums">—</span>}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleStatus(r); }}
                          disabled={busyId === r.companyId}
                          title={r.status === 'Suspended' ? 'Activate' : 'Suspend'}
                          aria-label={r.status === 'Suspended' ? 'Activate subscription' : 'Suspend subscription'}
                          className={`h-8 w-8 inline-flex items-center justify-center rounded-lg border transition-colors disabled:opacity-50 ${
                            r.status === 'Suspended'
                              ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                              : 'border-rose-200 text-rose-600 hover:bg-rose-50'}`}
                        >
                          {r.status === 'Suspended' ? <Play size={14} /> : <Ban size={14} />}
                        </button>
                        <span className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-ink-muted"><Caret size={16} /></span>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </div>

        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-hairline text-[12.5px] text-ink-secondary">
            <span className="tabular-nums">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page" className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-hairline disabled:opacity-40 hover:bg-surface-muted"><ChevronLeft size={15} /></button>
              <span className="px-2 tabular-nums">{page} / {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page" className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-hairline disabled:opacity-40 hover:bg-surface-muted"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
};

export default CompaniesTab;
