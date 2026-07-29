import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  RefreshCw, Search, FileDown, FileSpreadsheet, Printer, Zap, ShieldCheck,
  AlertTriangle, X, Eye, CheckCircle2, XCircle, Activity, CalendarDays,
  History, Landmark,
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
import { BarChart, type BarDatum } from '@/components/subscription/charts';
import { CREDIT_TOOLTIP, creditValue, creditUnit, creditsMeaning } from '@/components/verification/creditTerminology';
import { RechargeCreditsModal } from '@/components/verification/RechargeCreditsModal';

/**
 * Verification Credits — dedicated full page (replaces the old WalletModal
 * popup). Read-only over the SAME endpoints the popup used — the wallet read,
 * the permanent verification register and the recharge history; purchasing
 * still runs through the untouched RechargeCreditsModal payment flow.
 *
 * Credits are a QUOTA, never money: every credit figure renders through
 * creditTerminology and no currency symbol appears against a credit number
 * (recharge AMOUNTS are money and use ₹).
 */

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const PAGE_SIZES = [10, 25, 50, 100];

/** Tenant-facing recharge status labels (mirrors RechargeCreditsModal). */
const ORDER_STATUS_VIEW: Record<string, { label: string; variant: any }> = {
  CREATED: { label: 'Payment Pending', variant: 'warning' },
  ACTIVE: { label: 'Payment Pending', variant: 'warning' },
  PAID: { label: 'Processing', variant: 'blue' },
  FAILED: { label: 'Failed', variant: 'danger' },
  EXPIRED: { label: 'Expired', variant: 'gray' },
  CANCELLED: { label: 'Cancelled', variant: 'gray' },
  USER_DROPPED: { label: 'Cancelled', variant: 'gray' },
  REFUNDED: { label: 'Refunded', variant: 'warning' },
  FLAGGED: { label: 'Under Review', variant: 'warning' },
};
const orderStatusView = (order: any) => {
  if (order.settlementStatus === 'CREDITED') return { label: 'Credits Added', variant: 'green' as const };
  if (order.settlementStatus === 'AWAITING_APPROVAL') return { label: 'Awaiting Approval', variant: 'blue' as const };
  return ORDER_STATUS_VIEW[order.status] || { label: order.status, variant: 'gray' as const };
};

const vStatusLabel = (s: string) =>
  s === 'VERIFIED' ? 'Verified'
  : s === 'FAILED' ? 'Failed'
  : s === 'ERROR' || s === 'NETWORK_ERROR' ? 'Error'
  // Internal states (CREDITS_EXHAUSTED, MANUAL_MODE, …) render as words.
  : String(s || '—').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const vStatusVariant = (s: string): any =>
  s === 'VERIFIED' ? 'green' : s === 'FAILED' || s === 'ERROR' || s === 'NETWORK_ERROR' ? 'danger' : 'warning';

const broadcastWalletUpdate = () => {
  window.dispatchEvent(new CustomEvent('hrms:wallet-updated'));
  try { localStorage.setItem('hrms_wallet_updated', Date.now().toString()); } catch { /* private mode */ }
};

const FIELD =
  'h-10 rounded-xl border border-hairline bg-surface px-3 text-[13px] font-medium text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10';
const LABEL = 'block text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-1';
const SECTION_TITLE = 'text-[14px] font-bold text-ink font-heading tracking-tight';

/** Compact, equal-height summary stat (same pattern as the slot-history page). */
const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: string; icon: React.ReactNode; tone: string; title?: string }> = ({ label, value, sub, icon, tone, title }) => (
  <div className="bg-surface rounded-card border border-hairline shadow-card px-3 py-2.5 flex items-center gap-2.5 min-h-[72px]" title={title}>
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 ${tone}`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted leading-snug">{label}</p>
      <p className="text-[17px] font-bold text-ink font-heading tabular-nums leading-tight whitespace-nowrap">{value}</p>
      {sub && <p className="text-[10px] font-medium text-ink-muted truncate">{sub}</p>}
    </div>
  </div>
);

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Props {
  role?: string | null;
  companyName?: string | null;
}

export const VerificationCredits: React.FC<Props> = ({ role, companyName }) => {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [wallet, setWallet] = useState<any | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [orders, setOrders] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [verifyingRow, setVerifyingRow] = useState<string | null>(null);

  // Filters (verification history)
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination
  const [vPage, setVPage] = useState(1);
  const [vPageSize, setVPageSize] = useState(25);
  const [rPage, setRPage] = useState(1);
  const [rPageSize, setRPageSize] = useState(10);

  const [detail, setDetail] = useState<any | null>(null);

  const allowed = role !== 'Employee';
  const canRecharge = role === 'Company Head' || role === 'HR';
  const canVerifyOrder = role === 'Company Head';

  const load = useCallback(async (silent = false) => {
    if (!allowed) return;
    if (!silent) setState('loading');
    try {
      const walletRes: any = await api.get('/api/verification-credits/wallet');
      const w = walletRes?.data;
      if (!w || typeof w.remainingCredits !== 'number') throw new Error('The verification credit total could not be read.');
      setWallet(w);

      // History + recharges are best-effort: a wallet that loads must still
      // render even if a history call is refused for this role.
      try {
        const histRes: any = await api.bank.verifications({ limit: 200 });
        setStats(histRes?.data?.stats || null);
        setRecords(histRes?.data?.records || []);
        setRecordsTotal(histRes?.data?.total ?? (histRes?.data?.records?.length || 0));
      } catch {
        setStats(null); setRecords([]); setRecordsTotal(0);
      }
      try {
        const rechRes: any = await api.recharge.history({ page: 1, pageSize: 100 });
        setOrders(rechRes?.orders || []);
      } catch {
        setOrders([]);
      }

      setErrMsg('');
      setState('ready');
      setLastUpdated(new Date());
    } catch (e: any) {
      setErrMsg(e?.message || 'Could not load your verification credits.');
      setState('error');
    }
  }, [allowed]);

  useEffect(() => { load(); }, [load]);

  // Stay live: recharges from this browser broadcast hrms:wallet-updated; a
  // Super Admin allocating credits elsewhere is covered by the focus re-read.
  useEffect(() => {
    const onUpdate = (e: any) => {
      if (e.type === 'storage' && e.key !== 'hrms_wallet_updated') return;
      load(true);
    };
    const onFocus = () => load(true);
    window.addEventListener('hrms:wallet-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('hrms:wallet-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  // ── Derived figures ────────────────────────────────────────────────────────
  const remaining = wallet?.remainingCredits ?? 0;
  const used = wallet?.usedCredits ?? 0;
  const total = wallet?.totalCredits ?? 0;
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const exhausted = remaining <= 0 || wallet?.unavailableCode === 'INSUFFICIENT_CREDITS';
  const creditTone = exhausted ? 'bg-red-500' : remaining <= 3 ? 'bg-amber-500' : 'bg-emerald-500';

  const todayUsage = useMemo(() => {
    const today = dayKey(new Date());
    return records.filter((r) => r.createdAt && dayKey(new Date(r.createdAt)) === today).length;
  }, [records]);

  const lastRecharge = useMemo(() => orders.find((o) => o.settlementStatus === 'CREDITED') || null, [orders]);

  const employees = useMemo(
    () => [...new Set(records.map((r) => r.employeeName).filter(Boolean))].sort() as string[],
    [records]
  );

  // ── Charts: last 14 days from the loaded register ──────────────────────────
  const chartDays = useMemo(() => {
    const days: { key: string; label: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push({ key: dayKey(d), label: `${d.getDate()}/${d.getMonth() + 1}` });
    }
    return days;
  }, [lastUpdated]); // eslint-disable-line react-hooks/exhaustive-deps

  const usageChart: BarDatum[] = useMemo(() => chartDays.map((d) => ({
    key: d.key, label: d.label,
    value: records.filter((r) => r.createdAt && dayKey(new Date(r.createdAt)) === d.key).length,
    sub: 'verification attempts',
  })), [chartDays, records]);

  const consumptionChart: BarDatum[] = useMemo(() => chartDays.map((d) => ({
    key: d.key, label: d.label,
    value: records
      .filter((r) => r.status === 'VERIFIED' && r.createdAt && dayKey(new Date(r.createdAt)) === d.key)
      .reduce((a, r) => a + (Number(r.verificationCost) || 0), 0),
    sub: 'credits consumed',
  })), [chartDays, records]);

  // ── Verification history filtering ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    return records.filter((r) => {
      if (employeeFilter !== 'all' && r.employeeName !== employeeFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'FAILED' ? !['FAILED', 'ERROR', 'NETWORK_ERROR'].includes(r.status) : r.status !== statusFilter) return false;
      }
      const at = r.createdAt ? new Date(r.createdAt) : null;
      if (from && (!at || at < from)) return false;
      if (to && (!at || at > to)) return false;
      if (q) {
        const hay = [r.employeeName, r.employeeCode, r.referenceId, r.verificationId, r.bankName, r.ifsc, r.accountHolderName, r.accountNumberMasked]
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, search, employeeFilter, statusFilter, dateFrom, dateTo]);

  const vResetKey = `${search}|${employeeFilter}|${statusFilter}|${dateFrom}|${dateTo}|${vPageSize}`;
  useEffect(() => { setVPage(1); }, [vResetKey]);
  const vTotalPages = Math.max(1, Math.ceil(filtered.length / vPageSize));
  const vCurrent = Math.min(vPage, vTotalPages);
  const vRows = filtered.slice((vCurrent - 1) * vPageSize, vCurrent * vPageSize);

  const rTotalPages = Math.max(1, Math.ceil(orders.length / rPageSize));
  const rCurrent = Math.min(rPage, rTotalPages);
  const rRows = orders.slice((rCurrent - 1) * rPageSize, rCurrent * rPageSize);

  const hasFilters = !!(search || employeeFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo);
  const clearFilters = () => { setSearch(''); setEmployeeFilter('all'); setStatusFilter('all'); setDateFrom(''); setDateTo(''); };

  // ── Invoice + order actions (existing endpoints, unchanged) ────────────────
  const downloadInvoice = async (inv: { id: number; invoiceNo: string }) => {
    try {
      const blob = await api.recharge.downloadInvoice(inv.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${inv.invoiceNo}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not download the invoice.');
    }
  };

  const verifyPendingOrder = async (orderId: string) => {
    setVerifyingRow(orderId);
    try {
      const res: any = await api.recharge.verifyOrder(orderId);
      if (res?.outcome === 'CREDITED' || res?.outcome === 'ALREADY_SETTLED') {
        ui.toast.success('Payment verified — credits added.');
        broadcastWalletUpdate();
      } else if (res?.outcome === 'PENDING') {
        ui.toast.info('The payment is still pending with the gateway.');
      } else {
        ui.toast.warning('The payment did not complete. No credits were added.');
      }
      load(true);
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not verify the payment.');
    } finally {
      setVerifyingRow(null);
    }
  };

  // ── Exports (filtered verification history — matches the on-screen table) ──
  const exportColumns: ExportColumn[] = [
    { header: 'Date', key: 'createdAt', format: (v: any) => formatDateTime(v) },
    { header: 'Employee', key: 'employeeName' },
    { header: 'Employee Code', key: 'employeeCode' },
    { header: 'Verification Type', key: '__type', format: () => 'Bank Verification' },
    { header: 'Credits Used', key: 'verificationCost', format: (v: any) => (v == null ? '' : v) },
    { header: 'Status', key: 'status', format: (v: any) => vStatusLabel(v) },
    { header: 'Reference ID', key: 'referenceId' },
    { header: 'Bank', key: 'bankName' },
  ];
  const exportGuard = (): boolean => {
    if (!filtered.length) { ui.toast.info('There is no data to export for the current view.'); return false; }
    return true;
  };
  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportCsv = () => { if (exportGuard()) exportReportCsv(`Verification_History_${stamp()}`, exportColumns, filtered); };
  const exportExcel = () => { if (exportGuard()) exportRowsToExcel(`Verification_History_${stamp()}`, exportColumns, filtered, 'Verifications'); };

  const printPage = () => {
    if (!exportGuard()) return;
    const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const head = ['Date', 'Employee', 'Type', 'Credits', 'Status', 'Reference ID'].map((h) => `<th>${esc(h)}</th>`).join('');
    const body = filtered.map((r) => `<tr>${[
      formatDateTime(r.createdAt), r.employeeName || '—', 'Bank Verification',
      r.verificationCost ?? '—', vStatusLabel(r.status), r.referenceId || '—',
    ].map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
    const w = window.open('', '_blank', 'width=1100,height=750');
    if (!w) { ui.toast.info('Allow pop-ups to print the report.'); return; }
    w.document.write(`<!doctype html><html><head><title>Verification Credits</title><style>
      body{font-family:Segoe UI,Arial,sans-serif;color:#1e293b;margin:24px}
      h1{font-size:18px;margin:0 0 2px}p{font-size:11px;color:#64748b;margin:0 0 14px}
      table{border-collapse:collapse;width:100%;font-size:10.5px}
      th,td{border:1px solid #e2e8f0;padding:5px 7px;text-align:left}
      th{background:#f8fafc;text-transform:uppercase;font-size:9px;letter-spacing:.04em}
      @media print{body{margin:8mm}}
    </style></head><body>
      <h1>Verification Credits — History</h1>
      <p>${esc(companyName || '')} · Generated ${esc(formatDateTime(new Date()))} · ${filtered.length} verification(s)${hasFilters ? ' · filtered view' : ''} · ${esc(creditValue(remaining))} credits remaining</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  // ── Role gate (mirrors the old dialog: Employee role has no wallet view) ───
  if (!allowed) {
    return (
      <div className="p-6">
        <Card className="max-w-lg mx-auto text-center py-10">
          <ShieldCheck className="w-8 h-8 text-ink-muted mx-auto mb-3" />
          <p className="text-[14px] font-bold text-ink">Access restricted</p>
          <p className="text-[12.5px] font-medium text-ink-secondary mt-1">
            Verification credits are available to your company's management team only.
          </p>
        </Card>
      </div>
    );
  }

  const skeleton = (
    <div className="space-y-5" aria-busy="true">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-surface rounded-card border border-hairline px-3 py-2.5 min-h-[72px] flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-muted animate-pulse shrink-0" />
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
      {/* Page header — actions drop below the title until xl. */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink tracking-tight font-heading">Verification Credits</h2>
          <p className="text-[13px] text-ink-secondary mt-0.5 font-medium" title={CREDIT_TOOLTIP}>
            Bank verification quota, usage analytics and recharge history{companyName ? ` — ${companyName}` : ''}.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => load()} loading={state === 'loading'}>Refresh</Button>
          <Button variant="outline" size="sm" icon={<FileDown size={14} />} onClick={exportCsv} disabled={state !== 'ready'}>Export CSV</Button>
          <Button variant="outline" size="sm" icon={<FileSpreadsheet size={14} />} onClick={exportExcel} disabled={state !== 'ready'}>Export Excel</Button>
          <Button variant="outline" size="sm" icon={<Printer size={14} />} onClick={printPage} disabled={state !== 'ready'}>Print</Button>
          {canRecharge && (
            <Button variant="primary" size="sm" icon={<Zap size={14} />} onClick={() => setRechargeOpen(true)}>Recharge Credits</Button>
          )}
        </div>
      </div>

      {state === 'loading' ? skeleton : state === 'error' ? (
        <Card className="text-center py-10">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-[14px] font-bold text-ink">Could not load verification credits</p>
          <p className="text-[12.5px] font-medium text-ink-secondary mt-1">{errMsg}</p>
          <Button variant="primary" size="sm" className="mt-4" icon={<RefreshCw size={14} />} onClick={() => load()}>Retry</Button>
        </Card>
      ) : (
        <>
          {/* 1 · Summary cards (2 / 3 / 6 across) */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Stat label="Current Credits" value={creditValue(remaining)} icon={<ShieldCheck size={16} />} tone={creditTone}
              sub={creditsMeaning(remaining)} title={CREDIT_TOOLTIP} />
            <Stat label="Credits Used" value={creditValue(used)} icon={<Activity size={16} />} tone="bg-brand-500"
              sub={`of ${creditValue(total)} allocated`} title={CREDIT_TOOLTIP} />
            <Stat label="Successful" value={stats?.verified ?? '—'} icon={<CheckCircle2 size={16} />} tone="bg-emerald-500" sub="Verifications" />
            <Stat label="Failed" value={stats?.failed ?? '—'} icon={<XCircle size={16} />} tone="bg-rose-500" sub="Attempts" />
            <Stat label="Today's Usage" value={todayUsage} icon={<CalendarDays size={16} />} tone="bg-sky-500" sub="Attempts today" />
            <Stat label="Last Recharge" value={lastRecharge ? formatDate(lastRecharge.createdAt) : '—'} icon={<History size={16} />} tone="bg-violet-500"
              sub={lastRecharge ? `+${creditValue(lastRecharge.creditsPurchased)} ${creditUnit(lastRecharge.creditsPurchased)}` : 'No recharges yet'} />
          </div>

          {/* Credit meter + availability notice */}
          <Card>
            <div className="flex items-center justify-between text-[11.5px] font-semibold text-ink-secondary mb-1.5" title={CREDIT_TOOLTIP}>
              <span>{creditValue(used)} used</span>
              <span>{creditValue(remaining)} remaining</span>
            </div>
            <div className="w-full h-2 rounded-full bg-surface-muted overflow-hidden" role="progressbar" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Verification credits used">
              <div className={`h-full ${creditTone} rounded-full transition-all duration-300`} style={{ width: `${usedPct}%` }} />
            </div>
            <p className="text-[11px] font-medium text-ink-muted mt-1.5">
              {usedPct}% of {creditValue(total)} total verification {creditUnit(total)} allocated used
              {lastUpdated ? ` · Last updated ${formatTime(lastUpdated)}` : ''}
            </p>
            {wallet && !wallet.isAvailable && wallet.reason && (
              <p className="text-[12px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 leading-relaxed flex items-start gap-2 mt-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {wallet.reason}
              </p>
            )}
            {role === 'HR' && (
              <p className="text-[11.5px] font-medium text-ink-muted inline-flex items-center gap-1.5 mt-3">
                <ShieldCheck className="w-3.5 h-3.5" /> Purchasing is completed by your Company Head — HR can view history and start a recharge request.
              </p>
            )}
          </Card>

          {/* 2 · Usage analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <p className={SECTION_TITLE}>Verification Usage</p>
              <p className="text-[11.5px] font-medium text-ink-muted mb-3">Verification attempts per day — last 14 days{recordsTotal > records.length ? ` (latest ${records.length} of ${recordsTotal} records)` : ''}</p>
              <BarChart data={usageChart} height={200} format={(n) => `${Math.round(n)} attempts`}
                tickFormat={(n) => (Number.isInteger(n) ? String(n) : '')}
                emptyLabel="No verifications in the last 14 days." />
            </Card>
            <Card>
              <p className={SECTION_TITLE}>Credit Consumption</p>
              <p className="text-[11.5px] font-medium text-ink-muted mb-3">Credits consumed per day (successful verifications) — last 14 days</p>
              <BarChart data={consumptionChart} height={200} format={(n) => `${Math.round(n)} credits`}
                tickFormat={(n) => (Number.isInteger(n) ? String(n) : '')}
                emptyLabel="No credits consumed in the last 14 days." />
            </Card>
          </div>

          {/* 5 · Filters (drive the verification history + exports) */}
          <Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <div className="xl:col-span-2">
                <label className={LABEL}>Search</label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Employee, reference, bank, IFSC…" className={`${FIELD} w-full pl-9`} />
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
                <label className={LABEL}>Employee</label>
                <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className={`${FIELD} w-full cursor-pointer`}>
                  <option value="all">All Employees</option>
                  {employees.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${FIELD} w-full cursor-pointer`}>
                  <option value="all">All</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="FAILED">Failed / Error</option>
                  <option value="PENDING">Pending</option>
                </select>
              </div>
            </div>
            {hasFilters && (
              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[12px] font-medium text-ink-secondary">
                  Showing <span className="font-bold text-ink">{filtered.length}</span> of {records.length} loaded verifications
                </p>
                <Button variant="outline" size="sm" icon={<X size={13} />} onClick={clearFilters}>Clear Filters</Button>
              </div>
            )}
          </Card>

          {/* 3 · Verification history */}
          <Card padding={false}>
            <div className="px-4 pt-4 pb-2">
              <p className={SECTION_TITLE}>Verification History</p>
              <p className="text-[11.5px] font-medium text-ink-muted">Every verification attempt — reading this register never calls the provider and never costs a credit.</p>
            </div>
            {filtered.length === 0 ? (
              <div className="py-14 text-center">
                <ShieldCheck size={26} className="mx-auto text-ink-muted/50 mb-3" />
                <p className="text-[14px] font-bold text-ink">No verifications found.</p>
                <p className="text-[12.5px] font-medium text-ink-secondary mt-1">
                  {hasFilters ? 'No verifications match the current filters.' : 'Verifications run from employee bank details will appear here.'}
                </p>
                {hasFilters && <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>Clear Filters</Button>}
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden lg:block">
                  <Table dense className="border-0 shadow-none rounded-none">
                    <Thead>
                      <Tr>
                        <Th>Date</Th><Th>Employee</Th><Th>Verification Type</Th>
                        <Th className="text-right">Credits Used</Th><Th>Status</Th><Th>Reference ID</Th><Th className="text-right">Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {vRows.map((r) => (
                        <Tr key={r.id} onClick={() => setDetail(r)} className="hover:bg-brand-50/40">
                          <Td className="align-top">
                            <span className="block text-[12.5px] font-semibold text-ink tabular-nums">{formatDate(r.createdAt)}</span>
                            <span className="block text-[11px] font-medium text-ink-muted mt-0.5">{formatTime(r.createdAt)}</span>
                          </Td>
                          <Td className="align-top">
                            <span className="block text-[12.5px] font-semibold text-ink max-w-[170px] truncate" title={r.employeeName || ''}>{r.employeeName || '—'}</span>
                            {r.employeeCode && <span className="block text-[11px] font-medium text-ink-muted mt-0.5">{r.employeeCode}</span>}
                          </Td>
                          <Td className="align-top text-ink-secondary">Bank Verification</Td>
                          <Td className="align-top text-right font-bold tabular-nums">
                            <span title={CREDIT_TOOLTIP}>{r.verificationCost != null ? creditValue(r.verificationCost) : '—'}</span>
                          </Td>
                          <Td className="align-top"><Badge variant={vStatusVariant(r.status)}>{vStatusLabel(r.status)}</Badge></Td>
                          <Td className="align-top">
                            <span className="block text-[11.5px] font-mono font-medium text-ink-secondary max-w-[180px] truncate" title={r.referenceId || ''}>{r.referenceId || '—'}</span>
                          </Td>
                          <Td className="align-top" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end">
                              <button type="button" title="View Details" onClick={() => setDetail(r)}
                                className="p-1.5 rounded-lg text-ink-muted hover:text-brand-600 hover:bg-brand-50 transition-colors"><Eye size={14} /></button>
                            </div>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>

                {/* Tablet / mobile cards */}
                <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
                  {vRows.map((r) => (
                    <button key={r.id} type="button" onClick={() => setDetail(r)}
                      className="text-left rounded-xl border border-hairline bg-surface p-3.5 space-y-2 hover:border-brand-300 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-bold text-ink truncate">{r.employeeName || '—'}</span>
                        <Badge variant={vStatusVariant(r.status)}>{vStatusLabel(r.status)}</Badge>
                      </div>
                      <div className="text-[11.5px] font-medium text-ink-muted space-y-0.5">
                        <p className="tabular-nums">{formatDateTime(r.createdAt)}</p>
                        <p>Bank Verification · {r.verificationCost != null ? `${creditValue(r.verificationCost)} ${creditUnit(r.verificationCost)}` : '—'}</p>
                        {r.referenceId && <p className="font-mono truncate" title={r.referenceId}>{r.referenceId}</p>}
                      </div>
                    </button>
                  ))}
                </div>
                <PaginationBar
                  page={vCurrent} totalPages={vTotalPages} total={filtered.length} pageSize={vPageSize}
                  label="verifications" onChange={setVPage} onPageSizeChange={setVPageSize} pageSizeOptions={PAGE_SIZES}
                />
              </>
            )}
          </Card>

          {/* 4 · Recharge history */}
          <Card padding={false}>
            <div className="px-4 pt-4 pb-2">
              <p className={SECTION_TITLE}>Recharge History</p>
              <p className="text-[11.5px] font-medium text-ink-muted">Online credit purchases with their invoices. Credits are added only after the payment is verified.</p>
            </div>
            {orders.length === 0 ? (
              <div className="py-12 text-center">
                <Landmark size={26} className="mx-auto text-ink-muted/50 mb-3" />
                <p className="text-[14px] font-bold text-ink">No recharges yet.</p>
                <p className="text-[12.5px] font-medium text-ink-secondary mt-1">Your first recharge will appear here with its invoice.</p>
                {canRecharge && (
                  <Button variant="primary" size="sm" className="mt-4" icon={<Zap size={14} />} onClick={() => setRechargeOpen(true)}>Recharge Credits</Button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden lg:block">
                  <Table dense className="border-0 shadow-none rounded-none">
                    <Thead>
                      <Tr>
                        <Th>Date</Th><Th>Order ID</Th><Th className="text-right">Credits Purchased</Th>
                        <Th className="text-right">Amount</Th><Th>Invoice</Th><Th>Status</Th><Th className="text-right">Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {rRows.map((o) => {
                        const sv = orderStatusView(o);
                        const pending = o.settlementStatus !== 'CREDITED' && ['CREATED', 'ACTIVE', 'PAID'].includes(o.status);
                        return (
                          <Tr key={o.orderId}>
                            <Td className="align-top">
                              <span className="block text-[12.5px] font-semibold text-ink tabular-nums">{formatDate(o.createdAt)}</span>
                              <span className="block text-[11px] font-medium text-ink-muted mt-0.5">{formatTime(o.createdAt)}</span>
                            </Td>
                            <Td className="text-[11.5px] font-mono font-medium text-ink-secondary">{o.orderId}</Td>
                            <Td className="text-right font-bold tabular-nums"><span title={CREDIT_TOOLTIP}>+{creditValue(o.creditsPurchased)}</span></Td>
                            <Td className="text-right font-semibold tabular-nums">{inr(o.totalAmount)}</Td>
                            <Td>
                              {o.invoice ? (
                                <button type="button" onClick={() => downloadInvoice(o.invoice)}
                                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
                                  <FileDown size={13} /> {o.invoice.invoiceNo}
                                </button>
                              ) : <span className="text-ink-muted">—</span>}
                            </Td>
                            <Td><Badge variant={sv.variant}>{sv.label}</Badge></Td>
                            <Td className="text-right">
                              {pending && canVerifyOrder && (
                                <Button variant="outline" size="sm" onClick={() => verifyPendingOrder(o.orderId)}
                                  icon={<RefreshCw className={`w-3.5 h-3.5 ${verifyingRow === o.orderId ? 'animate-spin' : ''}`} />}>
                                  Verify now
                                </Button>
                              )}
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </div>

                {/* Tablet / mobile cards */}
                <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
                  {rRows.map((o) => {
                    const sv = orderStatusView(o);
                    const pending = o.settlementStatus !== 'CREDITED' && ['CREATED', 'ACTIVE', 'PAID'].includes(o.status);
                    return (
                      <div key={o.orderId} className="rounded-xl border border-hairline bg-surface p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[15px] font-bold text-ink tabular-nums" title={CREDIT_TOOLTIP}>+{creditValue(o.creditsPurchased)} credits</span>
                          <Badge variant={sv.variant}>{sv.label}</Badge>
                        </div>
                        <div className="text-[11.5px] font-medium text-ink-muted space-y-0.5">
                          <p className="tabular-nums">{formatDateTime(o.createdAt)} · {inr(o.totalAmount)}</p>
                          <p className="font-mono truncate">{o.orderId}</p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          {o.invoice ? (
                            <button type="button" onClick={() => downloadInvoice(o.invoice)}
                              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600">
                              <FileDown size={12} /> {o.invoice.invoiceNo}
                            </button>
                          ) : <span />}
                          {pending && canVerifyOrder && (
                            <Button variant="outline" size="sm" onClick={() => verifyPendingOrder(o.orderId)}
                              icon={<RefreshCw className={`w-3.5 h-3.5 ${verifyingRow === o.orderId ? 'animate-spin' : ''}`} />}>
                              Verify now
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <PaginationBar
                  page={rCurrent} totalPages={rTotalPages} total={orders.length} pageSize={rPageSize}
                  label="recharges" onChange={setRPage} onPageSizeChange={setRPageSize} pageSizeOptions={PAGE_SIZES}
                />
              </>
            )}
          </Card>
        </>
      )}

      {/* Verification record detail */}
      {detail && <VerificationDetail row={detail} onClose={() => setDetail(null)} />}

      {/* Self-service recharge — the SAME untouched payment flow the popup used. */}
      <RechargeCreditsModal
        open={rechargeOpen}
        onClose={() => setRechargeOpen(false)}
        role={role}
        wallet={wallet ? { remainingCredits: wallet.remainingCredits, usedCredits: wallet.usedCredits, totalCredits: wallet.totalCredits } : null}
      />
    </div>
  );
};

// ── Verification record detail slide-over (portalled to <body>) ──────────────
const VerificationDetail: React.FC<{ row: any; onClose: () => void }> = ({ row, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
      <aside role="dialog" aria-label="Verification details"
        className="absolute right-0 top-0 h-full w-full sm:max-w-md bg-surface shadow-2xl border-l border-hairline flex flex-col">
        <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[14.5px] font-bold text-ink font-heading truncate">Verification Details</p>
            <p className="text-[12px] font-medium text-ink-secondary truncate">{row.employeeName || '—'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close details"
            className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors"><X size={17} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Section title="Verification">
            <Item label="Date" value={formatDateTime(row.createdAt)} />
            <Item label="Type" value="Bank Verification" />
            <Item label="Status" value={<Badge variant={vStatusVariant(row.status)}>{vStatusLabel(row.status)}</Badge>} />
            <Item label="Credits Used" value={row.verificationCost != null ? creditValue(row.verificationCost) : '—'} />
            {row.responseTimeMs != null && <Item label="Response Time" value={`${row.responseTimeMs} ms`} />}
          </Section>
          <Section title="Employee">
            <Item label="Name" value={row.employeeName || '—'} />
            {row.employeeCode && <Item label="Code" value={row.employeeCode} />}
          </Section>
          <Section title="Bank Account">
            {row.accountHolderName && <Item label="Account Holder" value={row.accountHolderName} />}
            {row.accountNumberMasked && <Item label="Account" value={<span className="font-mono">{row.accountNumberMasked}</span>} />}
            {row.ifsc && <Item label="IFSC" value={<span className="font-mono">{row.ifsc}</span>} />}
            {row.bankName && <Item label="Bank" value={row.bankName} />}
            {!row.accountHolderName && !row.accountNumberMasked && !row.ifsc && !row.bankName && (
              <p className="text-[12px] font-medium text-ink-muted py-1">Bank details are not visible for your role.</p>
            )}
          </Section>
          <Section title="References">
            <Item label="Reference ID" value={row.referenceId ? <span className="font-mono">{row.referenceId}</span> : '—'} />
            {row.verificationId && <Item label="Verification ID" value={<span className="font-mono">{row.verificationId}</span>} />}
            {row.failureReason && <Item label="Failure Reason" value={row.failureReason} />}
          </Section>
        </div>
      </aside>
    </div>,
    document.body
  );
};

export default VerificationCredits;
