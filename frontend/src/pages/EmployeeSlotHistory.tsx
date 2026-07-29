import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  RefreshCw, Search, FileDown, FileSpreadsheet, Printer, Zap, History,
  Users, Layers, PlusCircle, IndianRupee, CalendarDays, ShieldCheck,
  AlertTriangle, X, Eye, ChevronRight,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { Card } from '@/components/ui/Card';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PaginationBar } from '@/components/ui/Paginated';
import { ui } from '@/components/ui/feedback';
import { formatDate, formatDateTime, formatTime } from '@/utils/formatDate';
import { exportRowsToExcel, exportReportCsv, type ExportColumn } from '@/utils/exportUtils';

/**
 * Employee Slot History — dedicated full page (replaces the cramped table that
 * used to live inside the Employee Slots purchase dialog). Read-only over the
 * existing GET /api/employee-slots/history endpoint: summary cards, filters,
 * exports, client-side pagination and a detail side panel per transaction.
 * Purchasing still happens in the global purchase dialog (hrms:purchase-slots).
 */

const TX_LABEL: Record<string, string> = {
  ONLINE_PURCHASE: 'Online Purchase',
  MANUAL_REQUEST: 'Manual Request',
  MANUAL_GRANT: 'Added by Support',
  MANUAL_ADJUST: 'Adjusted by Support',
  SUBSCRIPTION_CHANGE: 'Subscription Change',
};
const TX_BADGE: Record<string, any> = {
  ONLINE_PURCHASE: 'purple', MANUAL_REQUEST: 'blue', MANUAL_GRANT: 'indigo',
  MANUAL_ADJUST: 'orange', SUBSCRIPTION_CHANGE: 'blue',
};
const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Completed', APPROVED: 'Approved', REQUESTED: 'Awaiting Approval', REJECTED: 'Rejected',
};
const STATUS_BADGE: Record<string, any> = {
  COMPLETED: 'green', APPROVED: 'green', REQUESTED: 'warning', REJECTED: 'danger',
};

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const PAGE_SIZES = [10, 25, 50, 100];

const txId = (h: any) => h.orderId || `TXN-${h.id}`;
const txType = (h: any) => TX_LABEL[h.type] || h.type;
const txCreatedBy = (h: any) => h.requestedBy || h.actionedBy || (h.type === 'ONLINE_PURCHASE' ? 'Company Head' : 'System');
const txMethod = (h: any) =>
  h.payment?.paymentMethod
    ? String(h.payment.paymentMethod).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : h.orderId ? 'Online (Cashfree)' : 'Manual / Support';
const txNotes = (h: any) => h.reason || h.packName || '';

const FIELD =
  'h-10 rounded-xl border border-hairline bg-surface px-3 text-[13px] font-medium text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10';
const LABEL = 'block text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-1';

/** Compact, equal-height summary stat — icon beside the value, one tight row. */
const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: string; icon: React.ReactNode; tone: string }> = ({ label, value, sub, icon, tone }) => (
  <div className="bg-surface rounded-card border border-hairline shadow-card px-3 py-2.5 flex items-center gap-2.5 min-h-[72px]">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 ${tone}`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted leading-snug">{label}</p>
      <p className="text-[17px] font-bold text-ink font-heading tabular-nums leading-tight whitespace-nowrap">{value}</p>
      {sub && <p className="text-[10px] font-medium text-ink-muted truncate">{sub}</p>}
    </div>
  </div>
);

interface Props {
  role?: string | null;
}

export const EmployeeSlotHistory: React.FC<Props> = ({ role }) => {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [capacity, setCapacity] = useState<any | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [rows, setRows] = useState<any[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Detail side panel
  const [detail, setDetail] = useState<any | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setState('loading');
    try {
      const res = await api.employeeSlots.history();
      setCapacity(res?.capacity || null);
      setSummary(res?.summary || null);
      setRows(Array.isArray(res?.history) ? res.history : []);
      setState('ready');
    } catch (e: any) {
      setErrMsg(e?.message || 'Could not load slot history.');
      setState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A settled purchase elsewhere (e.g. from the purchase dialog) refreshes the page.
  useEffect(() => {
    const refetch = () => load(true);
    window.addEventListener('hrms:slots-updated', refetch);
    return () => window.removeEventListener('hrms:slots-updated', refetch);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    const list = rows.filter((h) => {
      if (typeFilter !== 'all' && h.type !== typeFilter) return false;
      if (statusFilter !== 'all' && h.status !== statusFilter) return false;
      const at = new Date(h.createdAt);
      if (from && at < from) return false;
      if (to && at > to) return false;
      if (q) {
        const hay = [
          txId(h), txType(h), STATUS_LABEL[h.status] || h.status, txCreatedBy(h),
          txNotes(h), h.invoice?.invoiceNo, txMethod(h), String(h.slots),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Rows arrive newest-first from the server.
    return sort === 'oldest' ? [...list].reverse() : list;
  }, [rows, search, typeFilter, statusFilter, dateFrom, dateTo, sort]);

  const resetKey = `${search}|${typeFilter}|${statusFilter}|${dateFrom}|${dateTo}|${sort}|${pageSize}`;
  useEffect(() => { setPage(1); }, [resetKey]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * pageSize, current * pageSize);

  const hasFilters = !!(search || typeFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo);
  const clearFilters = () => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setDateFrom(''); setDateTo(''); };

  // ── Invoice actions ────────────────────────────────────────────────────────
  const fetchInvoiceBlob = async (inv: { id: number }) => api.recharge.downloadInvoice(inv.id);

  const downloadInvoice = async (inv: { id: number; invoiceNo: string }) => {
    try {
      const blob = await fetchInvoiceBlob(inv);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv.invoiceNo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not download the invoice.');
    }
  };

  const printInvoice = async (inv: { id: number; invoiceNo: string }) => {
    try {
      const blob = await fetchInvoiceBlob(inv);
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) { ui.toast.info('Allow pop-ups to print the invoice.'); return; }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not open the invoice.');
    }
  };

  // ── Exports (current filtered view, matching the on-screen table) ──────────
  const exportColumns: ExportColumn[] = [
    { header: 'Date', key: 'createdAt', format: (v: any) => formatDateTime(v) },
    { header: 'Transaction ID', key: 'id', format: (_: any, r: any) => txId(r) },
    { header: 'Type', key: 'type', format: (_: any, r: any) => txType(r) },
    { header: 'Slots Added', key: 'slots' },
    { header: 'Previous Limit', key: 'oldLimit', format: (v: any) => (v == null ? '' : v) },
    { header: 'New Limit', key: 'newLimit', format: (v: any) => (v == null ? '' : v) },
    { header: 'Amount', key: 'amount', format: (v: any) => (v == null ? '' : Number(v)) },
    { header: 'Payment Method', key: 'payment', format: (_: any, r: any) => txMethod(r) },
    { header: 'Invoice', key: 'invoice.invoiceNo' },
    { header: 'Status', key: 'status', format: (v: any) => STATUS_LABEL[v] || v },
    { header: 'Created By', key: 'requestedBy', format: (_: any, r: any) => txCreatedBy(r) },
    { header: 'Notes', key: 'reason', format: (_: any, r: any) => txNotes(r) },
  ];

  const exportGuard = (): boolean => {
    if (!filtered.length) { ui.toast.info('There is no data to export for the current view.'); return false; }
    return true;
  };
  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportCsv = () => { if (exportGuard()) exportReportCsv(`Employee_Slot_History_${stamp()}`, exportColumns, filtered); };
  const exportExcel = () => { if (exportGuard()) exportRowsToExcel(`Employee_Slot_History_${stamp()}`, exportColumns, filtered, 'Slot History'); };

  const printPage = () => {
    if (!exportGuard()) return;
    const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const head = exportColumns.map((c) => `<th>${esc(c.header)}</th>`).join('');
    const body = filtered.map((r) => `<tr>${[
      formatDateTime(r.createdAt), txId(r), txType(r), r.slots,
      r.oldLimit ?? '—', r.newLimit ?? '—', r.amount != null ? inr(r.amount) : '—',
      txMethod(r), r.invoice?.invoiceNo || '—', STATUS_LABEL[r.status] || r.status,
      txCreatedBy(r), txNotes(r) || '—',
    ].map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
    const w = window.open('', '_blank', 'width=1100,height=750');
    if (!w) { ui.toast.info('Allow pop-ups to print the report.'); return; }
    w.document.write(`<!doctype html><html><head><title>Employee Slot History</title><style>
      body{font-family:Segoe UI,Arial,sans-serif;color:#1e293b;margin:24px}
      h1{font-size:18px;margin:0 0 2px}p{font-size:11px;color:#64748b;margin:0 0 14px}
      table{border-collapse:collapse;width:100%;font-size:10.5px}
      th,td{border:1px solid #e2e8f0;padding:5px 7px;text-align:left}
      th{background:#f8fafc;text-transform:uppercase;font-size:9px;letter-spacing:.04em}
      @media print{body{margin:8mm}}
    </style></head><body>
      <h1>Employee Slot History</h1>
      <p>Generated ${esc(formatDateTime(new Date()))} · ${filtered.length} transaction(s)${hasFilters ? ' · filtered view' : ''}</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  // ── Role gate (mirrors the backend: Employee role has no access) ───────────
  if (role === 'Employee') {
    return (
      <div className="p-6">
        <Card className="max-w-lg mx-auto text-center py-10">
          <ShieldCheck className="w-8 h-8 text-ink-muted mx-auto mb-3" />
          <p className="text-[14px] font-bold text-ink">Access restricted</p>
          <p className="text-[12.5px] font-medium text-ink-secondary mt-1">
            Employee slot history is available to your company's management team only.
          </p>
        </Card>
      </div>
    );
  }

  const skeleton = (
    <div className="space-y-5" aria-busy="true">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-surface rounded-card border border-hairline px-3.5 py-3 min-h-[72px] flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-16 rounded bg-surface-muted animate-pulse" />
              <div className="h-5 w-12 rounded bg-surface-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <div className="bg-surface rounded-card border border-hairline p-5 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 rounded-lg bg-surface-muted animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Page header — actions drop to their own row below xl so the title is
          never squeezed into a narrow column beside five buttons. */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink tracking-tight font-heading">Employee Slot History</h2>
          <p className="text-[13px] text-ink-secondary mt-0.5 font-medium">View all employee slot purchases, upgrades, and limit changes.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => load()} loading={state === 'loading'}>Refresh</Button>
          <Button variant="outline" size="sm" icon={<FileDown size={14} />} onClick={exportCsv} disabled={state !== 'ready'}>Export CSV</Button>
          <Button variant="outline" size="sm" icon={<FileSpreadsheet size={14} />} onClick={exportExcel} disabled={state !== 'ready'}>Export Excel</Button>
          <Button variant="outline" size="sm" icon={<Printer size={14} />} onClick={printPage} disabled={state !== 'ready'}>Print</Button>
          {role === 'Company Head' && (
            <Button variant="primary" size="sm" icon={<Zap size={14} />} onClick={() => window.dispatchEvent(new CustomEvent('hrms:purchase-slots'))}>
              Purchase Slots
            </Button>
          )}
        </div>
      </div>

      {state === 'loading' ? skeleton : state === 'error' ? (
        <Card className="text-center py-10">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-[14px] font-bold text-ink">Could not load slot history</p>
          <p className="text-[12.5px] font-medium text-ink-secondary mt-1">{errMsg}</p>
          <Button variant="primary" size="sm" className="mt-4" icon={<RefreshCw size={14} />} onClick={() => load()}>Retry</Button>
        </Card>
      ) : (
        <>
          {/* Summary cards — compact single-row stats (2 / 3 / 6 across) */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Stat label="Employee Limit" value={capacity?.unlimited ? '∞' : (capacity?.limit ?? '—')} icon={<Layers size={16} />} tone="bg-brand-500"
              sub={capacity && !capacity.unlimited ? `Base ${capacity.baseLimit}${capacity.extraSlots > 0 ? ` + ${capacity.extraSlots}` : ''}` : 'Unlimited plan'} />
            <Stat label="Active Employees" value={capacity?.current ?? '—'} icon={<Users size={16} />} tone="bg-sky-500" sub="1 slot per user" />
            <Stat label="Available Slots" value={capacity?.unlimited ? '∞' : (capacity?.remaining ?? '—')} icon={<PlusCircle size={16} />} tone="bg-emerald-500" sub="Remaining" />
            <Stat label="Purchased Slots" value={summary?.totalPurchasedSlots ?? 0} icon={<History size={16} />} tone="bg-violet-500" sub="Settled only" />
            <Stat label="Amount Spent" value={inr(summary?.totalAmountSpent || 0)} icon={<IndianRupee size={16} />} tone="bg-amber-500" sub="All purchases" />
            <Stat label="Last Purchase" value={summary?.lastPurchaseAt ? formatDate(summary.lastPurchaseAt) : '—'} icon={<CalendarDays size={16} />} tone="bg-rose-500" sub="Most recent" />
          </div>

          {/* Filters */}
          <Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <div className="xl:col-span-2">
                <label className={LABEL}>Search</label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Transaction ID, invoice, notes…" className={`${FIELD} w-full pl-9`} />
                </div>
              </div>
              <div>
                <label className={LABEL}>From</label>
                <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className={`${FIELD} w-full`} />
              </div>
              <div>
                <label className={LABEL}>To</label>
                <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className={`${FIELD} w-full`} />
              </div>
              <div>
                <label className={LABEL}>Transaction Type</label>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${FIELD} w-full cursor-pointer`}>
                  <option value="all">All Types</option>
                  {Object.entries(TX_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={LABEL}>Status</label>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${FIELD} w-full cursor-pointer`}>
                    <option value="all">All</option>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className={LABEL}>Sort</label>
                  <select value={sort} onChange={(e) => setSort(e.target.value as any)} className={`${FIELD} w-full cursor-pointer`}>
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                  </select>
                </div>
              </div>
            </div>
            {hasFilters && (
              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[12px] font-medium text-ink-secondary">
                  Showing <span className="font-bold text-ink">{filtered.length}</span> of {rows.length} transactions
                </p>
                <Button variant="outline" size="sm" icon={<X size={13} />} onClick={clearFilters}>Clear Filters</Button>
              </div>
            )}
          </Card>

          {/* Table */}
          <Card padding={false}>
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <History size={26} className="mx-auto text-ink-muted/50 mb-3" />
                <p className="text-[14px] font-bold text-ink">No slot history found.</p>
                <p className="text-[12.5px] font-medium text-ink-secondary mt-1">
                  {hasFilters
                    ? 'No transactions match the current filters.'
                    : 'Slot purchases and limit changes will appear here.'}
                </p>
                {hasFilters ? (
                  <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>Clear Filters</Button>
                ) : role === 'Company Head' ? (
                  <Button variant="primary" size="sm" className="mt-4" icon={<Zap size={14} />} onClick={() => window.dispatchEvent(new CustomEvent('hrms:purchase-slots'))}>
                    Purchase Employee Slots
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                {/* Desktop table — 8 combined columns, fits without horizontal
                    scroll on standard desktop widths. Nothing was dropped:
                    creator rides under the date, notes under the type, invoice
                    under the transaction id, method under the amount. */}
                <div className="hidden lg:block">
                  <Table dense className="border-0 shadow-none rounded-none">
                    <Thead>
                      <Tr>
                        <Th>Date</Th><Th>Transaction</Th><Th>Type</Th>
                        <Th className="text-right">Slots</Th><Th className="text-center">Limit Change</Th>
                        <Th className="text-right">Payment</Th><Th>Status</Th><Th className="text-right">Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {pageRows.map((h) => (
                        <Tr key={h.id} onClick={() => setDetail(h)} className="hover:bg-brand-50/40">
                          <Td className="align-top">
                            <span className="block text-[12.5px] font-semibold text-ink tabular-nums">{formatDate(h.createdAt)}</span>
                            <span className="block text-[11px] font-medium text-ink-muted mt-0.5 max-w-[150px] truncate" title={txCreatedBy(h)}>
                              {formatTime(h.createdAt)} · {txCreatedBy(h)}
                            </span>
                          </Td>
                          <Td className="align-top">
                            <span className="block text-[12px] font-semibold text-ink tabular-nums">{txId(h)}</span>
                            {h.invoice ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); downloadInvoice(h.invoice); }}
                                className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                              >
                                <FileDown size={11} /> {h.invoice.invoiceNo}
                              </button>
                            ) : (
                              <span className="block text-[11px] font-medium text-ink-muted mt-0.5">No invoice</span>
                            )}
                          </Td>
                          <Td className="align-top">
                            <Badge variant={TX_BADGE[h.type] || 'gray'}>{txType(h)}</Badge>
                            {txNotes(h) && (
                              <span className="block text-[11px] font-medium text-ink-muted mt-1 max-w-[170px] truncate" title={txNotes(h)}>{txNotes(h)}</span>
                            )}
                          </Td>
                          <Td className={`align-top text-right font-bold tabular-nums ${h.slots > 0 ? 'text-emerald-700' : h.slots < 0 ? 'text-red-700' : 'text-ink-muted'}`}>
                            {h.slots > 0 ? `+${h.slots}` : h.slots}
                          </Td>
                          <Td className="align-top text-center tabular-nums">
                            {h.oldLimit != null || h.newLimit != null ? (
                              <span className="text-[12.5px]">
                                <span className="text-ink-secondary">{h.oldLimit ?? '—'}</span>
                                <span className="text-ink-muted mx-1">→</span>
                                <span className="font-semibold text-ink">{h.newLimit ?? '—'}</span>
                              </span>
                            ) : <span className="text-ink-muted">—</span>}
                          </Td>
                          <Td className="align-top text-right">
                            <span className="block text-[12.5px] font-semibold text-ink tabular-nums">{h.amount != null ? inr(h.amount) : '—'}</span>
                            <span className="block text-[11px] font-medium text-ink-muted mt-0.5">{txMethod(h)}</span>
                          </Td>
                          <Td className="align-top"><Badge variant={STATUS_BADGE[h.status] || 'gray'}>{STATUS_LABEL[h.status] || h.status}</Badge></Td>
                          <Td className="align-top" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5">
                              <button type="button" title="View Details" onClick={() => setDetail(h)}
                                className="p-1.5 rounded-lg text-ink-muted hover:text-brand-600 hover:bg-brand-50 transition-colors"><Eye size={14} /></button>
                              {h.invoice && (
                                <>
                                  <button type="button" title="Download Invoice" onClick={() => downloadInvoice(h.invoice)}
                                    className="p-1.5 rounded-lg text-ink-muted hover:text-brand-600 hover:bg-brand-50 transition-colors"><FileDown size={14} /></button>
                                  <button type="button" title="Print Invoice" onClick={() => printInvoice(h.invoice)}
                                    className="p-1.5 rounded-lg text-ink-muted hover:text-brand-600 hover:bg-brand-50 transition-colors"><Printer size={14} /></button>
                                </>
                              )}
                            </div>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>

                {/* Tablet / mobile — transaction cards instead of a scrolling table. */}
                <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
                  {pageRows.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setDetail(h)}
                      className="text-left rounded-xl border border-hairline bg-surface p-3.5 space-y-2 hover:border-brand-300 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={TX_BADGE[h.type] || 'gray'}>{txType(h)}</Badge>
                        <Badge variant={STATUS_BADGE[h.status] || 'gray'}>{STATUS_LABEL[h.status] || h.status}</Badge>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`text-[17px] font-bold tabular-nums ${h.slots > 0 ? 'text-emerald-700' : h.slots < 0 ? 'text-red-700' : 'text-ink-muted'}`}>
                          {h.slots > 0 ? `+${h.slots}` : h.slots} slots
                        </span>
                        {(h.oldLimit != null || h.newLimit != null) && (
                          <span className="text-[12px] font-medium tabular-nums text-ink-secondary">{h.oldLimit ?? '—'} → <span className="font-semibold text-ink">{h.newLimit ?? '—'}</span></span>
                        )}
                      </div>
                      <div className="text-[11.5px] font-medium text-ink-muted space-y-0.5">
                        <p className="tabular-nums">{txId(h)} · {formatDateTime(h.createdAt)}</p>
                        <p className="truncate">{h.amount != null ? `${inr(h.amount)} · ` : ''}{txMethod(h)} · by {txCreatedBy(h)}</p>
                        {txNotes(h) && <p className="truncate" title={txNotes(h)}>{txNotes(h)}</p>}
                      </div>
                      {h.invoice && (
                        <span
                          role="link"
                          onClick={(e) => { e.stopPropagation(); downloadInvoice(h.invoice); }}
                          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600"
                        >
                          <FileDown size={12} /> {h.invoice.invoiceNo}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <PaginationBar
                  page={current}
                  totalPages={totalPages}
                  total={filtered.length}
                  pageSize={pageSize}
                  label="transactions"
                  onChange={setPage}
                  onPageSizeChange={(n) => setPageSize(n)}
                  pageSizeOptions={PAGE_SIZES}
                />
              </>
            )}
          </Card>
        </>
      )}

      {/* Detail side panel */}
      {detail && (
        <DetailPanel
          row={detail}
          onClose={() => setDetail(null)}
          onDownloadInvoice={downloadInvoice}
          onPrintInvoice={printInvoice}
        />
      )}
    </div>
  );
};

// ── Transaction detail slide-over ────────────────────────────────────────────
// Portalled to <body> so the page transform never clips the overlay (see the
// same fix in Modal.tsx).
const DetailPanel: React.FC<{
  row: any;
  onClose: () => void;
  onDownloadInvoice: (inv: any) => void;
  onPrintInvoice: (inv: any) => void;
}> = ({ row, onClose, onDownloadInvoice, onPrintInvoice }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pay = row.payment;
  const Item = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-[12px] font-medium text-ink-muted shrink-0">{label}</span>
      <span className="text-[12.5px] font-semibold text-ink text-right break-all">{value ?? '—'}</span>
    </div>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-xl border border-hairline bg-surface-muted/50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-1.5">{title}</p>
      {children}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Transaction details"
        className="absolute right-0 top-0 h-full w-full sm:max-w-md bg-surface shadow-2xl border-l border-hairline flex flex-col"
      >
        <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[14.5px] font-bold text-ink font-heading truncate">Transaction Details</p>
            <p className="text-[12px] font-medium text-ink-secondary truncate tabular-nums">{txId(row)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close details"
            className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors"><X size={17} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Section title="Purchase Details">
            <Item label="Date" value={formatDateTime(row.createdAt)} />
            <Item label="Type" value={<Badge variant={TX_BADGE[row.type] || 'gray'}>{txType(row)}</Badge>} />
            {row.packName && <Item label="Pack" value={row.packName} />}
            <Item label="Slots" value={<span className={row.slots > 0 ? 'text-emerald-700' : row.slots < 0 ? 'text-red-700' : ''}>{row.slots > 0 ? `+${row.slots}` : row.slots}</span>} />
            <Item label="Status" value={<Badge variant={STATUS_BADGE[row.status] || 'gray'}>{STATUS_LABEL[row.status] || row.status}</Badge>} />
            <Item label="Amount" value={row.amount != null ? inr(row.amount) : '—'} />
          </Section>

          <Section title="Slot Changes">
            <div className="flex items-center justify-center gap-3 py-2">
              <span className="text-[18px] font-bold text-ink-secondary tabular-nums">{row.oldLimit ?? '—'}</span>
              <ChevronRight size={16} className="text-ink-muted" />
              <span className="text-[18px] font-bold text-emerald-700 tabular-nums">{row.newLimit ?? '—'}</span>
            </div>
            <p className="text-[11.5px] font-medium text-ink-muted text-center">Employee limit before → after this transaction</p>
          </Section>

          {pay && (
            <Section title="Payment Information">
              <Item label="Payment Method" value={txMethod(row)} />
              <Item label="Order Status" value={pay.status} />
              {pay.cfPaymentId && <Item label="Gateway Payment ID" value={pay.cfPaymentId} />}
              <Item label="Gateway Reference" value={row.orderId} />
              {pay.bankReference && <Item label="Bank Reference" value={pay.bankReference} />}
              {pay.paymentTime && <Item label="Paid At" value={formatDateTime(pay.paymentTime)} />}
              {pay.creditedAt && <Item label="Slots Credited At" value={formatDateTime(pay.creditedAt)} />}
            </Section>
          )}

          {pay && (
            <Section title="Tax Details">
              <Item label="Subtotal" value={inr(pay.baseAmount)} />
              {pay.gstEnabled && <Item label={`GST @ ${pay.gstPercent}%`} value={inr(pay.gstAmount)} />}
              <Item label="Grand Total" value={<span className="text-[13.5px]">{inr(pay.totalAmount)}</span>} />
            </Section>
          )}

          <Section title="Invoice">
            {row.invoice ? (
              <div className="flex items-center justify-between gap-3 py-1">
                <span className="text-[12.5px] font-semibold text-ink tabular-nums">{row.invoice.invoiceNo}</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" icon={<FileDown size={13} />} onClick={() => onDownloadInvoice(row.invoice)}>Download</Button>
                  <Button variant="outline" size="sm" icon={<Printer size={13} />} onClick={() => onPrintInvoice(row.invoice)}>Print</Button>
                </div>
              </div>
            ) : (
              <p className="text-[12px] font-medium text-ink-muted py-1">No invoice for this transaction.</p>
            )}
          </Section>

          <Section title="Audit Log">
            <Item label="Created By" value={txCreatedBy(row)} />
            {row.actionedBy && <Item label="Actioned By" value={row.actionedBy} />}
            <Item label="Created At" value={formatDateTime(row.createdAt)} />
            {row.updatedAt && row.updatedAt !== row.createdAt && <Item label="Last Updated" value={formatDateTime(row.updatedAt)} />}
            {row.reason && <Item label="Notes" value={row.reason} />}
          </Section>
        </div>
      </aside>
    </div>,
    document.body
  );
};

export default EmployeeSlotHistory;
