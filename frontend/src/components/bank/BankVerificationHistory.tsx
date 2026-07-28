import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, Search, RefreshCw, ChevronLeft, ChevronRight, Eye, AlertTriangle,
  TrendingUp, Wallet, Gauge, FileSearch, X, Download,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
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

const CHIP_TONE: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  amber: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800',
  slate: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string }> = ({ icon, label, value, hint }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3.5 shadow-sm">
    <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 mb-1.5">
      {icon}
      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em]">{label}</span>
    </div>
    <p className="text-[20px] font-extrabold text-slate-900 dark:text-slate-100 leading-none">{value}</p>
    {hint && <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">{hint}</p>}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1 min-w-0">
            <label htmlFor="bvh-search" className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">
              Search
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="bvh-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Employee, employee ID, reference ID, bank, IFSC…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
            </div>
          </div>

          <div className="w-full lg:w-52">
            <label htmlFor="bvh-status" className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">
              Status
            </label>
            <select
              id="bvh-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All statuses' : statusLabel(s)}</option>
              ))}
            </select>
          </div>

          <div className="w-full lg:w-40">
            <label htmlFor="bvh-from" className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">From</label>
            <input
              id="bvh-from" type="date" value={startDate} max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          <div className="w-full lg:w-40">
            <label htmlFor="bvh-to" className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">To</label>
            <input
              id="bvh-to" type="date" value={endDate} min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          <div className="flex items-center gap-2">
            {filtersActive && (
              <button
                type="button"
                onClick={() => { setStatus('All'); setSearch(''); setStartDate(''); setEndDate(''); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              type="button"
              onClick={load}
              title="Refresh"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${state === 'loading' ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Table — the only horizontally scrolling element, so the page never scrolls sideways. */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {state === 'error' ? (
          <div className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12.5px] font-semibold bg-brand-600 hover:bg-brand-700 text-white transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Try again
            </button>
          </div>
        ) : state === 'loading' && !records.length ? (
          <div className="p-10 text-center text-slate-500 dark:text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-brand-500" />
            <p className="text-[13px] font-medium">Loading verification history…</p>
          </div>
        ) : !records.length ? (
          <div className="p-10 text-center">
            <ShieldCheck className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-[14px] font-bold text-slate-700 dark:text-slate-200">
              {filtersActive ? 'No verifications match these filters' : 'No bank verifications yet'}
            </p>
            <p className="text-[12.5px] font-medium text-slate-500 dark:text-slate-400 mt-1">
              {filtersActive
                ? 'Clear the filters to see the full register.'
                : 'Every verification your team runs will be permanently recorded here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                  {['Date', 'Employee', 'Status', 'Verified By', 'Provider', 'Reference ID', 'Branch', 'Latency', 'Cost', ''].map((h, i) => (
                    <th
                      key={h || `a${i}`}
                      className={`px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400 whitespace-nowrap ${
                        h === 'Latency' || h === 'Cost' ? 'text-right' : ''
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const tone = CHIP_TONE[statusTone(r.status)];
                  return (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-[12.5px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {r.createdAt ? formatDateTime(r.createdAt) : '—'}
                      </td>
                      <td className="px-4 py-3 min-w-[180px]">
                        <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100 truncate max-w-[220px]" title={r.employeeName || ''}>
                          {orNA(r.employeeName)}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 font-mono">
                          {r.employeeCode ? r.employeeCode : maskAccount(r.accountNumberMasked)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap ${tone}`}>
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[150px]" title={r.verifiedByName || ''}>
                        {orNA(r.verifiedByName)}
                      </td>
                      <td className="px-4 py-3 text-[12.5px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {orNA(r.provider)}
                      </td>
                      <td className="px-4 py-3 text-[12px] font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {orNA(r.referenceId)}
                      </td>
                      <td className="px-4 py-3 text-[12.5px] font-medium text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
                        {orNA(r.branchName)}
                      </td>
                      <td className="px-4 py-3 text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 text-right whitespace-nowrap">
                        {r.responseTimeMs != null ? `${r.responseTimeMs} ms` : '—'}
                      </td>
                      <td className="px-4 py-3 text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 text-right whitespace-nowrap">
                        {r.verificationCost != null ? `₹${r.verificationCost}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openDetail(r.id)}
                          disabled={detailLoading}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {records.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40">
            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
              Page {page} of {totalPages} · {total} record{total === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
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
