import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, Search, RefreshCw, ChevronLeft, ChevronRight, Eye, AlertTriangle,
  TrendingUp, Wallet, Gauge, FileSearch, X, Download,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/utils/formatDate';
import { Modal } from '@/components/ui/Modal';
import { BankVerificationReport } from './BankVerificationReport';
import { VerificationView, fromRecord, maskAccount, orNA, statusLabel, statusTone } from './bankVerification';

interface Props {
  companyName?: string | null;
  /** Restrict to one employee — used by the profile's verification history. */
  employeeId?: string | number | null;
  /** Rows per page. */
  pageSize?: number;
}

interface Stats {
  total: number;
  verified: number;
  failed: number;
  successRate: number | null;
  totalSpend: number;
  avgLatencyMs: number | null;
}

const STATUS_FILTERS = [
  'All', 'VERIFIED', 'FAILED', 'VERIFICATION_INCOMPLETE', 'NETWORK_ERROR',
  'MANUAL_OVERRIDE', 'MANUAL_ONLY', 'RATE_LIMITED', 'INSUFFICIENT_CREDITS',
];

/** Status tone → the shared Badge variant, so these chips match every other table. */
const BADGE_VARIANT = { green: 'green', amber: 'warning', red: 'danger', slate: 'gray' } as const;

// Matches the app's field controls (Input.tsx fieldBase): 48px, rounded-xl, tokens.
const FIELD =
  'w-full h-12 px-3.5 rounded-xl border border-hairline bg-surface text-[13px] text-ink ' +
  'placeholder:text-ink-muted transition-colors focus:outline-none focus:border-brand-400 ' +
  'focus:ring-[3px] focus:ring-brand-500/20';
const FIELD_LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-ink-muted block mb-1.5';

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string }> = ({ icon, label, value, hint }) => (
  <div className="bg-surface rounded-card border border-hairline shadow-card px-4 py-4 text-ink">
    <div className="flex items-center gap-2 text-ink-muted mb-2">
      {icon}
      <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
    </div>
    <p className="text-[22px] font-bold text-ink leading-none font-heading tabular-nums">{value}</p>
    {hint && <p className="text-[12px] font-medium text-ink-secondary mt-2 leading-relaxed">{hint}</p>}
  </div>
);

/**
 * §7 — the permanent verification history.
 *
 * Every attempt ever made is listed here, successful or not. Nothing in this
 * screen can delete or edit a record: the API exposes no such operation, and the
 * point of the register is that it cannot be tidied up after the fact.
 */
export const BankVerificationHistory: React.FC<Props> = ({ companyName, employeeId, pageSize = 25 }) => {
  const [records, setRecords] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [detail, setDetail] = useState<VerificationView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setState((prev) => (prev === 'ready' ? prev : 'loading'));
    try {
      const res: any = await api.bank.verifications({
        page, limit: pageSize, status, search: debouncedSearch, startDate, endDate,
        ...(employeeId ? { employeeId } : {}),
      });
      const data = res?.data;
      if (!data) throw new Error('The verification history could not be read.');
      setRecords(data.records || []);
      setStats(data.stats || null);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
      setError('');
      setState('ready');
    } catch (err: any) {
      setError(err?.message || 'Could not load the verification history.');
      setState('error');
    }
  }, [page, pageSize, status, debouncedSearch, startDate, endDate, employeeId]);

  useEffect(() => { load(); }, [load]);

  // Any filter change puts the user back on the first page; staying on page 4 of a
  // freshly narrowed result set shows an empty table that looks like "no records".
  useEffect(() => { setPage(1); }, [status, debouncedSearch, startDate, endDate]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res: any = await api.bank.verification(id);
      if (!res?.data) throw new Error('That verification record could not be found.');
      setDetail(fromRecord(res.data));
    } catch (err: any) {
      ui.toast.error(err?.message || 'Could not open the verification record.');
    } finally {
      setDetailLoading(false);
    }
  };

  /** CSV of the rows currently in view — the same columns, in the same order. */
  const exportCsv = () => {
    if (!records.length) {
      ui.toast.info('There are no records to export.');
      return;
    }
    const header = ['Date', 'Employee', 'Employee ID', 'Status', 'Verified By', 'Provider', 'Reference ID', 'Branch', 'Latency (ms)', 'Cost (INR)'];
    const rows = records.map((r) => [
      r.createdAt ? formatDateTime(r.createdAt) : '',
      r.employeeName || '', r.employeeCode || '', statusLabel(r.status),
      r.verifiedByName || '', r.provider || '', r.referenceId || '',
      r.branchName || '', r.responseTimeMs ?? '', r.verificationCost ?? '',
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Bank_Verification_History_Page_${page}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    ui.toast.success(`Exported ${records.length} record(s)`);
  };

  const filtersActive = useMemo(
    () => status !== 'All' || !!debouncedSearch || !!startDate || !!endDate,
    [status, debouncedSearch, startDate, endDate]
  );

  return (
    <div className="space-y-4">
      {/* Header cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          icon={<FileSearch className="w-3.5 h-3.5" />}
          label="Total Verifications"
          value={stats ? String(stats.total) : '—'}
          hint="Every attempt, permanently retained"
        />
        <StatCard
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="Success Rate"
          value={stats?.successRate != null ? `${stats.successRate}%` : '—'}
          hint={stats ? `${stats.verified} verified · ${stats.failed} failed` : undefined}
        />
        <StatCard
          icon={<Wallet className="w-3.5 h-3.5" />}
          label="Total Spend"
          value={stats ? `₹${stats.totalSpend}` : '—'}
          hint="Charged only on successful verifications"
        />
        <StatCard
          icon={<Gauge className="w-3.5 h-3.5" />}
          label="Avg. Latency"
          value={stats?.avgLatencyMs != null ? `${stats.avgLatencyMs} ms` : '—'}
          hint="Provider response time"
        />
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-card border border-hairline shadow-card p-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1 min-w-0">
            <label htmlFor="bvh-search" className={FIELD_LABEL}>Search</label>
            <div className="relative">
              <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="bvh-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Employee, employee ID, reference ID, bank, IFSC…"
                className={`${FIELD} pl-10`}
              />
            </div>
          </div>

          <div className="w-full lg:w-52">
            <label htmlFor="bvh-status" className={FIELD_LABEL}>Status</label>
            <select id="bvh-status" value={status} onChange={(e) => setStatus(e.target.value)} className={FIELD}>
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All statuses' : statusLabel(s)}</option>
              ))}
            </select>
          </div>

          <div className="w-full lg:w-44">
            <label htmlFor="bvh-from" className={FIELD_LABEL}>From</label>
            <input id="bvh-from" type="date" value={startDate} max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)} className={FIELD} />
          </div>
          <div className="w-full lg:w-44">
            <label htmlFor="bvh-to" className={FIELD_LABEL}>To</label>
            <input id="bvh-to" type="date" value={endDate} min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)} className={FIELD} />
          </div>

          <div className="flex items-center gap-2">
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={() => { setStatus('All'); setSearch(''); setStartDate(''); setEndDate(''); }} icon={<X className="w-3.5 h-3.5" />}>
                Clear
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportCsv} icon={<Download className="w-3.5 h-3.5" />}>
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={load} aria-label="Refresh verification history" title="Refresh"
              icon={<RefreshCw className={`w-4 h-4 ${state === 'loading' ? 'animate-spin' : ''}`} />}>
              <span className="sr-only">Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Table — the only horizontally scrolling element, so the page never scrolls sideways. */}
      <div className="bg-surface rounded-card border border-hairline shadow-card overflow-hidden">
        {state === 'error' ? (
          <div className="p-10 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-ink">{error}</p>
            <Button variant="primary" size="sm" className="mt-4" onClick={load} icon={<RefreshCw className="w-3.5 h-3.5" />}>
              Try again
            </Button>
          </div>
        ) : state === 'loading' && !records.length ? (
          <div className="p-12 text-center text-ink-secondary">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-brand-500" />
            <p className="text-[13px] font-medium">Loading verification history…</p>
          </div>
        ) : !records.length ? (
          <div className="p-12 text-center">
            <ShieldCheck className="w-9 h-9 text-ink-muted mx-auto mb-3" />
            <p className="text-[14px] font-bold text-ink font-heading">
              {filtersActive ? 'No verifications match these filters' : 'No bank verifications yet'}
            </p>
            <p className="text-[12.5px] font-medium text-ink-secondary mt-1.5 max-w-md mx-auto leading-relaxed">
              {filtersActive
                ? 'Clear the filters to see the full register.'
                : 'Every verification your team runs will be permanently recorded here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left">
              <thead>
                <tr className="border-b border-hairline bg-surface-muted">
                  {['Date', 'Employee', 'Status', 'Verified By', 'Provider', 'Reference ID', 'Branch', 'Latency', 'Cost', ''].map((h, i) => (
                    <th
                      key={h || `action-${i}`}
                      scope="col"
                      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary whitespace-nowrap ${
                        h === 'Latency' || h === 'Cost' ? 'text-right' : ''
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-hairline last:border-0 hover:bg-surface-muted transition-colors">
                    <td className="px-4 py-3.5 text-[12.5px] font-medium text-ink-secondary whitespace-nowrap tabular-nums">
                      {r.createdAt ? formatDateTime(r.createdAt) : '—'}
                    </td>
                    <td className="px-4 py-3.5 min-w-[180px]">
                      <p className="text-[13px] font-semibold text-ink truncate max-w-[220px]" title={r.employeeName || ''}>
                        {orNA(r.employeeName)}
                      </p>
                      <p className="text-[11.5px] font-medium text-ink-muted font-mono mt-0.5">
                        {r.employeeCode ? r.employeeCode : maskAccount(r.accountNumberMasked)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant={BADGE_VARIANT[statusTone(r.status)]} dot>{statusLabel(r.status)}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] font-medium text-ink truncate max-w-[150px]" title={r.verifiedByName || ''}>
                      {orNA(r.verifiedByName)}
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] font-medium text-ink-secondary whitespace-nowrap">
                      {orNA(r.provider)}
                    </td>
                    <td className="px-4 py-3.5 text-[12px] font-mono font-medium text-ink-secondary whitespace-nowrap">
                      {orNA(r.referenceId)}
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] font-medium text-ink-secondary truncate max-w-[140px]">
                      {orNA(r.branchName)}
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] font-semibold text-ink text-right whitespace-nowrap tabular-nums">
                      {r.responseTimeMs != null ? `${r.responseTimeMs} ms` : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] font-semibold text-ink text-right whitespace-nowrap tabular-nums">
                      {r.verificationCost != null ? `₹${r.verificationCost}` : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => openDetail(r.id)}
                        disabled={detailLoading}
                        icon={<Eye className="w-3.5 h-3.5" />}
                        aria-label={`View verification ${r.referenceId || r.id}`}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {records.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 border-t border-hairline bg-surface-muted">
            <p className="text-[12px] font-medium text-ink-secondary">
              Page {page} of {totalPages} · {total} record{total === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} icon={<ChevronLeft className="w-3.5 h-3.5" />}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Bank Account Verification"
        subtitle={detail?.referenceId ? `Reference ${detail.referenceId}` : undefined}
        size="xl"
      >
        {detail && <BankVerificationReport view={detail} companyName={companyName} />}
      </Modal>
    </div>
  );
};

export default BankVerificationHistory;
