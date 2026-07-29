// ─────────────────────────────────────────────────────────────────────────────
// BILLING — six registers behind one sub-navigation:
//   Payments · Invoices · Refunds · Revenue · Pending · Failed
//
// Every register reads live data that already existed; none of the money maths
// moved into the client. The invoice document, generation, payments, renewals
// and status transitions all still go through the existing endpoints untouched.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet, AlertTriangle, BadgeCheck, Clock, Search, RefreshCw, Plus, FileDown,
  Eye, MoreVertical, Printer, Mail, Copy, RotateCcw, CheckCircle2, Trash2, Ban,
  Settings2, Receipt, Undo2, TrendingUp, XCircle, CreditCard, HandCoins,
} from 'lucide-react';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDateTime } from '@/utils/formatDate';
import { INVOICE_STATUS_VARIANT } from './billing/calc';
import { GenerateInvoiceModal } from './billing/GenerateInvoiceModal';
import { InvoiceSettingsModal } from './billing/InvoiceSettingsModal';
import {
  Metric, Panel, SubNav, Loading, Empty, inr, inrShort, num, shortDate,
  inputCls, exportCsv, monthLabelShort, monthLabel,
} from './kit';
import { BarChart, type BarDatum } from './charts';

type View = 'payments' | 'invoices' | 'refunds' | 'revenue' | 'pending' | 'failed';

interface Props {
  onOpenInvoice?: (invoiceId: string | number) => void;
  /** Deep-link a specific register (Overview tiles navigate straight here). */
  initialView?: View;
}

export const BillingTab: React.FC<Props> = ({ onOpenInvoice, initialView }) => {
  const [view, setView] = useState<View>(initialView || 'invoices');
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});

  useEffect(() => { if (initialView) setView(initialView); }, [initialView]);

  const openInvoice = useCallback((id: number | string) => {
    if (onOpenInvoice) onOpenInvoice(id);
    else window.location.href = `/subscription-invoice/${encodeURIComponent(String(id))}`;
  }, [onOpenInvoice]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try { setSummary(await api.subscriptionInvoices.dashboard() || {}); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  // One-time: companies + tax defaults for the Generate dialog.
  useEffect(() => {
    (async () => {
      try {
        const [c, s] = await Promise.all([api.subscriptions.list(), api.planConfig.getSettings().catch(() => ({}))]);
        setCompanies(Array.isArray(c) ? c : []);
        setSettings(s || {});
      } catch { /* non-fatal — the register still renders */ }
    })();
  }, []);

  const NAV = [
    { key: 'payments', label: 'Payments', icon: <HandCoins size={14} /> },
    { key: 'invoices', label: 'Invoices', icon: <Receipt size={14} /> },
    { key: 'refunds', label: 'Refunds', icon: <Undo2 size={14} /> },
    { key: 'revenue', label: 'Revenue', icon: <TrendingUp size={14} /> },
    { key: 'pending', label: 'Pending', icon: <Clock size={14} /> },
    { key: 'failed', label: 'Failed', icon: <XCircle size={14} /> },
  ];

  return (
    <div className="space-y-5">
      {/* Four figures — the billing headline, not eight tiles of everything. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric label="Total Revenue" value={inr(summary.totalRevenue || 0)} icon={<Wallet size={16} />} tone="brand" sub={`${num(summary.paidInvoices ?? 0)} invoices settled`} />
        <Metric label="Collected This Month" value={inr(summary.monthlyRevenue || 0)} icon={<BadgeCheck size={16} />} tone="emerald" sub={`${inr(summary.annualRevenue || 0)} this year`} />
        <Metric label="Outstanding" value={inr(summary.outstanding || 0)} icon={<AlertTriangle size={16} />} tone="rose" sub={`${num(summary.pendingInvoices ?? 0)} pending · ${num(summary.overdueInvoices ?? 0)} overdue`} onClick={() => setView('pending')} />
        <Metric label="Total Invoices" value={num(summary.totalInvoices ?? 0)} icon={<Receipt size={16} />} tone="slate" sub={`${num(summary.upcomingRenewals ?? 0)} renewals in 30 days`} onClick={() => setView('invoices')} />
      </div>

      {/* Register switch + global actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <SubNav items={NAV} value={view} onChange={(k) => setView(k as View)} />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<Settings2 size={14} />} onClick={() => setShowSettings(true)}>Invoice Settings</Button>
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={loadSummary} loading={loading}>Refresh</Button>
          <Button size="sm" icon={<Plus size={15} />} onClick={() => setGenerating(true)}>Generate Invoice</Button>
        </div>
      </div>

      {view === 'invoices' && <InvoicesView onOpen={openInvoice} onChanged={loadSummary} onGenerate={() => setGenerating(true)} />}
      {view === 'payments' && <PaymentsView onOpen={openInvoice} />}
      {view === 'refunds' && <RefundsView onOpen={openInvoice} />}
      {view === 'revenue' && <RevenueView />}
      {view === 'pending' && <PendingView onOpen={openInvoice} onChanged={loadSummary} />}
      {view === 'failed' && <FailedView />}

      {generating && (
        <GenerateInvoiceModal
          companies={companies}
          settings={settings}
          onClose={() => setGenerating(false)}
          onCreated={(newId?: number | string) => {
            setGenerating(false);
            loadSummary();
            if (newId != null) openInvoice(newId);
          }}
        />
      )}
      {showSettings && <InvoiceSettingsModal onClose={() => setShowSettings(false)} onSaved={loadSummary} />}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// INVOICES — the register, with search/filters and per-row actions.
// ─────────────────────────────────────────────────────────────────────────────
const InvoicesView: React.FC<{ onOpen: (id: any) => void; onChanged: () => void; onGenerate: () => void }> = ({ onOpen, onChanged, onGenerate }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [planF, setPlanF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [cycleF, setCycleF] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.subscriptionInvoices.list({ search, plan: planF, status: statusF, billingCycle: cycleF }) || []); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [search, planF, statusF, cycleF]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const quick = async (fn: () => Promise<any>, msg: string) => {
    setMenuId(null);
    try { await fn(); ui.toast.success(msg); await load(); onChanged(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const printInv = async (r: any) => {
    setMenuId(null);
    try {
      const h = await api.subscriptionInvoices.fetchHtml(r.id);
      const w = window.open('', '_blank', 'width=900,height=1100');
      if (!w) return ui.toast.error('Allow pop-ups to print.');
      w.document.write(h); w.document.close(); w.focus();
      setTimeout(() => w.print(), 350);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  return (
    <div className="space-y-4" onClick={() => menuId && setMenuId(null)}>
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice no, company or email…" className={`${inputCls} pl-9`} />
        </div>
        <select value={planF} onChange={(e) => setPlanF(e.target.value)} className={`${inputCls} lg:w-40`}>
          <option value="all">All plans</option>{['Free', 'Starter', 'Professional', 'Enterprise', 'Custom'].map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={`${inputCls} lg:w-40`}>
          <option value="all">All statuses</option>{['Draft', 'Pending', 'Paid', 'Overdue', 'Cancelled', 'Refunded'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={cycleF} onChange={(e) => setCycleF(e.target.value)} className={`${inputCls} lg:w-36`}>
          <option value="all">All cycles</option><option>Quarterly</option><option>Yearly</option>
        </select>
        <Button variant="outline" size="sm" icon={<FileDown size={14} />} onClick={() => exportCsv('subscription-invoices.csv', [
          ['Invoice No', 'invoiceNo'], ['Company', 'companyName'], ['Plan', 'plan'], ['Cycle', 'billingCycle'],
          ['Employees', 'employeeCount'], ['Subtotal', 'subtotal'], ['GST', 'gstAmount'], ['Grand Total', 'grandTotal'],
          ['Paid', 'amountPaid'], ['Balance', 'balance'], ['Status', 'status'], ['Invoice Date', 'invoiceDate'], ['Due Date', 'dueDate'],
        ], rows)}>Export</Button>
      </div>

      <Panel flush>
        <div className="overflow-x-auto">
          <Table>
            <Thead>
              <Tr>
                <Th>Invoice</Th><Th>Company</Th><Th>Plan</Th><Th>Period</Th>
                <Th>Amount</Th><Th>Paid</Th><Th>Balance</Th><Th>Status</Th><Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {loading ? (
                <Tr><Td colSpan={9}><div className="py-12 text-center text-sm text-ink-muted">Loading invoices…</div></Td></Tr>
              ) : rows.length === 0 ? (
                <Tr><Td colSpan={9}><Empty icon={<Receipt size={22} />} title="No invoices match your filters." hint="Generate the first invoice for a company to get started." action={<Button size="sm" icon={<Plus size={14} />} onClick={onGenerate}>Generate Invoice</Button>} /></Td></Tr>
              ) : rows.map((r) => (
                <Tr key={r.id} onClick={() => onOpen(r.id)} tabIndex={0} className="cursor-pointer transition-colors hover:bg-surface-muted/70 focus:outline-none focus:bg-surface-muted/70">
                  <Td>
                    <div className="font-bold text-brand-700 whitespace-nowrap">{r.invoiceNo}</div>
                    <div className="text-[11px] text-ink-muted">{shortDate(r.invoiceDate)}</div>
                  </Td>
                  <Td>
                    <div className="font-semibold text-ink whitespace-nowrap">{r.companyName}</div>
                    <div className="text-[11px] text-ink-muted">{r.employeeCount} employees</div>
                  </Td>
                  <Td><span className="text-[13px] text-ink-secondary">{r.plan}</span><div className="text-[11px] text-ink-muted">{r.billingCycle}</div></Td>
                  <Td className="text-[12px] text-ink-secondary whitespace-nowrap">{shortDate(r.periodStart)}<br /><span className="text-ink-muted">to {shortDate(r.periodEnd)}</span></Td>
                  <Td className="tabular-nums font-bold text-ink">{inr(r.grandTotal)}<div className="text-[11px] font-medium text-ink-muted">incl. {inr(r.gstAmount)} GST</div></Td>
                  <Td className="tabular-nums text-[13px] text-emerald-600 font-semibold">{r.amountPaid ? inr(r.amountPaid) : '—'}</Td>
                  <Td className="tabular-nums text-[13px] font-semibold">{Number(r.balance) > 0 ? <span className="text-rose-600">{inr(r.balance)}</span> : <span className="text-ink-muted">—</span>}</Td>
                  <Td><Badge variant={INVOICE_STATUS_VARIANT[r.status] || 'gray'} dot>{r.status}</Badge></Td>
                  <Td>
                    <div className="flex items-center gap-1 relative">
                      <button onClick={(e) => { e.stopPropagation(); onOpen(r.id); }} title="View" aria-label="View invoice" className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-hairline text-ink-secondary hover:bg-surface-muted"><Eye size={14} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setMenuId(menuId === r.id ? null : r.id); }} title="More" aria-label="More actions" className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-hairline text-ink-secondary hover:bg-surface-muted"><MoreVertical size={14} /></button>
                      {menuId === r.id && (
                        <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-9 z-30 w-48 rounded-xl border border-hairline bg-surface shadow-card py-1 text-[13px]">
                          <MenuItem icon={<Printer size={13} />} label="Print / Download" onClick={() => printInv(r)} />
                          <MenuItem icon={<Mail size={13} />} label="Email Invoice" onClick={() => quick(() => api.subscriptionInvoices.email(r.id, {}).then((x: any) => { if (x?.devMode) ui.toast.info(x.message); }), 'Invoice emailed.')} />
                          {!['Paid', 'Cancelled', 'Refunded'].includes(r.status) && <MenuItem icon={<CheckCircle2 size={13} />} label="Mark Paid" onClick={() => quick(() => api.subscriptionInvoices.setStatus(r.id, { status: 'Paid' }), 'Marked paid.')} />}
                          <MenuItem icon={<Copy size={13} />} label="Duplicate" onClick={() => quick(() => api.subscriptionInvoices.duplicate(r.id), 'Duplicated.')} />
                          <MenuItem icon={<RotateCcw size={13} />} label="Renew" onClick={() => quick(() => api.subscriptionInvoices.renew(r.id), 'Renewal generated.')} />
                          {!['Cancelled', 'Refunded'].includes(r.status) && (
                            <MenuItem icon={<Undo2 size={13} />} label="Mark Refunded" danger onClick={async () => {
                              setMenuId(null);
                              if (await ui.confirm({ title: 'Mark as refunded?', message: `${r.invoiceNo} will be recorded as refunded.`, confirmText: 'Mark Refunded', variant: 'danger' })) {
                                quick(() => api.subscriptionInvoices.setStatus(r.id, { status: 'Refunded' }), 'Marked refunded.');
                              }
                            }} />
                          )}
                          {!['Cancelled', 'Refunded'].includes(r.status) && (
                            <MenuItem icon={<Ban size={13} />} label="Cancel" danger onClick={async () => {
                              setMenuId(null);
                              if (await ui.confirm({ title: 'Cancel invoice?', message: `Void ${r.invoiceNo}?`, confirmText: 'Cancel Invoice', variant: 'danger' })) {
                                quick(() => api.subscriptionInvoices.setStatus(r.id, { status: 'Cancelled' }), 'Cancelled.');
                              }
                            }} />
                          )}
                          {['Draft', 'Cancelled'].includes(r.status) && (
                            <MenuItem icon={<Trash2 size={13} />} label="Delete" danger onClick={async () => {
                              setMenuId(null);
                              if (await ui.confirm({ title: 'Delete invoice?', message: `${r.invoiceNo} will be permanently removed.`, confirmText: 'Delete', variant: 'danger' })) {
                                quick(() => api.subscriptionInvoices.remove(r.id), 'Deleted.');
                              }
                            }} />
                          )}
                        </div>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      </Panel>
    </div>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-muted ${danger ? 'text-rose-600' : 'text-ink'}`}>{icon}{label}</button>
);

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS — every rupee received, newest first.
// ─────────────────────────────────────────────────────────────────────────────
const PaymentsView: React.FC<{ onOpen: (id: any) => void }> = ({ onOpen }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try { setRows(await api.subscriptionInvoices.allPayments() || []); }
      catch (e) { ui.toast.error(getApiErrorMessage(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.companyName, r.invoiceNo, r.referenceNo, r.method, r.collectedBy].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [rows, search]);

  const total = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  if (loading) return <Loading label="Loading payments…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, invoice, reference or method…" className={`${inputCls} pl-9`} />
        </div>
        <div className="text-[13px] text-ink-secondary font-semibold whitespace-nowrap">
          {num(filtered.length)} payments · <span className="text-ink font-bold tabular-nums">{inr(total)}</span>
        </div>
        <Button variant="outline" size="sm" icon={<FileDown size={14} />} onClick={() => exportCsv('payments.csv', [
          ['Date', 'paidAt'], ['Invoice', 'invoiceNo'], ['Company', 'companyName'], ['Amount', 'amount'],
          ['Method', 'method'], ['Reference', 'referenceNo'], ['Collected By', 'collectedBy'],
        ], filtered)}>Export</Button>
      </div>

      <Panel flush>
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Date</Th><Th>Invoice</Th><Th>Company</Th><Th>Amount</Th><Th>Method</Th><Th>Reference</Th><Th>Collected By</Th><Th>Invoice Status</Th></Tr></Thead>
            <Tbody>
              {filtered.length === 0 ? (
                <Tr><Td colSpan={8}><Empty icon={<HandCoins size={22} />} title="No payments recorded yet." hint="Payments appear here as soon as one is recorded against an invoice." /></Td></Tr>
              ) : filtered.map((r) => (
                <Tr key={r.id} onClick={() => onOpen(r.invoiceId)} tabIndex={0} className="cursor-pointer transition-colors hover:bg-surface-muted/70 focus:outline-none focus:bg-surface-muted/70">
                  <Td className="text-[12.5px] text-ink-secondary whitespace-nowrap">{formatDateTime(r.paidAt)}</Td>
                  <Td><span className="font-bold text-brand-700">{r.invoiceNo}</span></Td>
                  <Td className="font-semibold text-ink">{r.companyName}</Td>
                  <Td className="tabular-nums font-bold text-emerald-600">{inr(r.amount)}</Td>
                  <Td><span className="inline-flex items-center gap-1.5 text-[13px] text-ink-secondary"><CreditCard size={13} className="text-ink-muted" />{r.method || '—'}</span></Td>
                  <Td className="text-[12.5px] text-ink-secondary">{r.referenceNo || '—'}</Td>
                  <Td className="text-[12.5px] text-ink-secondary">{r.collectedBy || '—'}</Td>
                  <Td><Badge variant={INVOICE_STATUS_VARIANT[r.invoiceStatus] || 'gray'} dot>{r.invoiceStatus || '—'}</Badge></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      </Panel>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// REFUNDS — refunded subscription invoices + gateway refunds on credit purchases.
// ─────────────────────────────────────────────────────────────────────────────
const RefundsView: React.FC<{ onOpen: (id: any) => void }> = ({ onOpen }) => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [gateway, setGateway] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, ref] = await Promise.all([
        api.subscriptionInvoices.list({ status: 'Refunded' }).catch(() => []),
        api.recharge.admin.refunds({ pageSize: 100 }).catch(() => null),
      ]);
      setInvoices(Array.isArray(inv) ? inv : []);
      setGateway(Array.isArray(ref?.refunds) ? ref.refunds : []);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading label="Loading refunds…" />;

  const invTotal = invoices.reduce((s, r) => s + (Number(r.grandTotal) || 0), 0);
  const gwTotal = gateway.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const markAdjusted = async (r: any) => {
    try { await api.recharge.admin.markRefundAdjusted(r.id); ui.toast.success('Refund marked adjusted.'); load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  return (
    <div className="space-y-5">
      <Panel flush title="Refunded Subscription Invoices" subtitle={`${num(invoices.length)} invoices · ${inr(invTotal)}`}>
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Invoice</Th><Th>Company</Th><Th>Plan</Th><Th>Amount</Th><Th>Invoice Date</Th><Th>Status</Th></Tr></Thead>
            <Tbody>
              {invoices.length === 0 ? (
                <Tr><Td colSpan={6}><Empty icon={<Undo2 size={22} />} title="No subscription invoice has been refunded." hint="Mark an invoice as refunded from the Invoices register to record one here." /></Td></Tr>
              ) : invoices.map((r) => (
                <Tr key={r.id} onClick={() => onOpen(r.id)} tabIndex={0} className="cursor-pointer transition-colors hover:bg-surface-muted/70">
                  <Td><span className="font-bold text-brand-700">{r.invoiceNo}</span></Td>
                  <Td className="font-semibold text-ink">{r.companyName}</Td>
                  <Td className="text-[13px] text-ink-secondary">{r.plan}</Td>
                  <Td className="tabular-nums font-bold">{inr(r.grandTotal)}</Td>
                  <Td className="text-[13px] text-ink-secondary">{shortDate(r.invoiceDate)}</Td>
                  <Td><Badge variant="purple" dot>Refunded</Badge></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      </Panel>

      <Panel flush title="Payment Gateway Refunds" subtitle={`Verification-credit purchases · ${num(gateway.length)} refunds · ${inr(gwTotal)}`}>
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Refund</Th><Th>Order</Th><Th>Amount</Th><Th>Status</Th><Th>Credits Adjusted</Th><Th>Raised</Th><Th><span className="sr-only">Actions</span></Th></Tr></Thead>
            <Tbody>
              {gateway.length === 0 ? (
                <Tr><Td colSpan={7}><Empty icon={<Undo2 size={22} />} title="No gateway refunds." hint="Refunds raised against credit purchases would appear here." /></Td></Tr>
              ) : gateway.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-semibold text-ink">{r.refundId || `#${r.id}`}</Td>
                  <Td className="text-[12.5px] text-ink-secondary">{r.orderId}</Td>
                  <Td className="tabular-nums font-bold">{inr(r.amount)}</Td>
                  <Td><Badge variant={r.status === 'SUCCESS' ? 'green' : r.status === 'FAILED' ? 'red' : 'amber'} dot>{r.status || '—'}</Badge></Td>
                  <Td>{r.creditsAdjusted ? <Badge variant="green">Adjusted</Badge> : <Badge variant="amber">Pending</Badge>}</Td>
                  <Td className="text-[12.5px] text-ink-secondary whitespace-nowrap">{formatDateTime(r.createdAt)}</Td>
                  <Td>{!r.creditsAdjusted && <Button size="xs" variant="outline" onClick={() => markAdjusted(r)}>Mark Adjusted</Button>}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      </Panel>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE — collected money by month and by year.
// ─────────────────────────────────────────────────────────────────────────────
const RevenueView: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { setData(await api.subscriptionInvoices.reports()); }
      catch (e) { ui.toast.error(getApiErrorMessage(e)); }
      finally { setLoading(false); }
    })();
  }, []);
  if (loading) return <Loading label="Loading revenue…" />;
  if (!data) return null;

  const monthly: BarDatum[] = (data.revenueByMonth || []).slice(-12).map((m: any) => ({
    key: m.month, label: monthLabelShort(m.month), value: Number(m.amount) || 0, sub: monthLabel(m.month),
  }));

  return (
    <div className="space-y-5">
      <Panel title="Revenue by Month" subtitle={`Collected against settled invoices · ${inr(data.totals?.revenue || 0)} lifetime`}>
        <BarChart data={monthly} format={inr} tickFormat={inrShort} height={280} emptyLabel="No revenue collected yet." />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel flush title="Revenue by Year">
          <div className="overflow-x-auto">
            <Table>
              <Thead><Tr><Th>Year</Th><Th>Collected</Th></Tr></Thead>
              <Tbody>
                {(data.revenueByYear || []).length === 0 ? (
                  <Tr><Td colSpan={2}><Empty title="No revenue recorded yet." /></Td></Tr>
                ) : data.revenueByYear.map((y: any) => (
                  <Tr key={y.year}><Td className="font-semibold text-ink tabular-nums">{y.year}</Td><Td className="tabular-nums font-bold">{inr(y.amount)}</Td></Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Panel>

        <Panel flush title="Outstanding by Company" subtitle="Largest unpaid balances first">
          <div className="overflow-x-auto">
            <Table>
              <Thead><Tr><Th>Company</Th><Th>Outstanding</Th></Tr></Thead>
              <Tbody>
                {(data.outstandingByCompany || []).length === 0 ? (
                  <Tr><Td colSpan={2}><Empty icon={<BadgeCheck size={22} />} title="Nothing outstanding." hint="Every invoice is settled." /></Td></Tr>
                ) : data.outstandingByCompany.map((o: any) => (
                  <Tr key={o.company}><Td className="font-medium text-ink">{o.company}</Td><Td className="tabular-nums font-bold text-rose-600">{inr(o.amount)}</Td></Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Panel>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PENDING — everything still owed, oldest first.
// ─────────────────────────────────────────────────────────────────────────────
const PendingView: React.FC<{ onOpen: (id: any) => void; onChanged: () => void }> = ({ onOpen, onChanged }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await api.subscriptionInvoices.list({});
      const list = (Array.isArray(all) ? all : []).filter((r: any) => ['Pending', 'Overdue'].includes(r.status));
      list.sort((a: any, b: any) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime());
      setRows(list);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const markPaid = async (r: any) => {
    try { await api.subscriptionInvoices.setStatus(r.id, { status: 'Paid' }); ui.toast.success(`${r.invoiceNo} marked paid.`); load(); onChanged(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  if (loading) return <Loading label="Loading pending invoices…" />;

  const owed = rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);
  const daysLate = (d: any) => {
    if (!d) return 0;
    return Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  };

  return (
    <Panel flush title="Pending & Overdue" subtitle={`${num(rows.length)} invoices · ${inr(owed)} outstanding`}>
      <div className="overflow-x-auto">
        <Table>
          <Thead><Tr><Th>Invoice</Th><Th>Company</Th><Th>Due</Th><Th>Age</Th><Th>Total</Th><Th>Paid</Th><Th>Balance</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></Tr></Thead>
          <Tbody>
            {rows.length === 0 ? (
              <Tr><Td colSpan={9}><Empty icon={<BadgeCheck size={22} />} title="Nothing pending." hint="Every invoice has been settled." /></Td></Tr>
            ) : rows.map((r) => {
              const late = daysLate(r.dueDate);
              return (
                <Tr key={r.id} onClick={() => onOpen(r.id)} tabIndex={0} className="cursor-pointer transition-colors hover:bg-surface-muted/70">
                  <Td><span className="font-bold text-brand-700">{r.invoiceNo}</span></Td>
                  <Td className="font-semibold text-ink">{r.companyName}</Td>
                  <Td className="text-[13px] text-ink-secondary whitespace-nowrap">{shortDate(r.dueDate)}</Td>
                  <Td>
                    {late > 0
                      ? <span className="text-[12.5px] font-bold text-rose-600 tabular-nums">{late} days late</span>
                      : <span className="text-[12.5px] text-ink-muted tabular-nums">due in {Math.abs(late)} days</span>}
                  </Td>
                  <Td className="tabular-nums font-semibold">{inr(r.grandTotal)}</Td>
                  <Td className="tabular-nums text-[13px] text-emerald-600">{r.amountPaid ? inr(r.amountPaid) : '—'}</Td>
                  <Td className="tabular-nums font-bold text-rose-600">{inr(r.balance)}</Td>
                  <Td><Badge variant={INVOICE_STATUS_VARIANT[r.status] || 'gray'} dot>{r.status}</Badge></Td>
                  <Td><Button size="xs" variant="outline" icon={<CheckCircle2 size={13} />} onClick={(e: any) => { e.stopPropagation(); markPaid(r); }}>Mark Paid</Button></Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </div>
    </Panel>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FAILED — online payment attempts that never settled.
// ─────────────────────────────────────────────────────────────────────────────
const FailedView: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.recharge.admin.orders({ pageSize: 200 });
        const all = Array.isArray(res?.orders) ? res.orders : [];
        setRows(all.filter((o: any) => ['FAILED', 'EXPIRED', 'CANCELLED'].includes(String(o.status))));
      } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <Loading label="Loading failed payments…" />;

  return (
    <Panel
      flush
      title="Failed Payments"
      subtitle={`${num(rows.length)} online payment attempts that did not settle`}
    >
      <div className="overflow-x-auto">
        <Table>
          <Thead><Tr><Th>Order</Th><Th>Company</Th><Th>Amount</Th><Th>Status</Th><Th>Settlement</Th><Th>Attempted</Th></Tr></Thead>
          <Tbody>
            {rows.length === 0 ? (
              <Tr><Td colSpan={6}><Empty icon={<BadgeCheck size={22} />} title="No failed payments." hint="Every online payment attempt has settled successfully." /></Td></Tr>
            ) : rows.map((o) => (
              <Tr key={o.id}>
                <Td><span className="font-semibold text-ink">{o.orderId}</span></Td>
                <Td className="text-[13px] text-ink-secondary">{o.companyName}</Td>
                <Td className="tabular-nums font-semibold">{inr(o.totalAmount ?? o.baseAmount)}</Td>
                <Td><Badge variant="red" dot>{o.status}</Badge></Td>
                <Td className="text-[12.5px] text-ink-secondary">{o.settlementStatus || '—'}</Td>
                <Td className="text-[12.5px] text-ink-secondary whitespace-nowrap">{formatDateTime(o.createdAt)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    </Panel>
  );
};

export default BillingTab;
