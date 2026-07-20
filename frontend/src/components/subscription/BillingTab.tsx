// ─────────────────────────────────────────────────────────────────────────────
// BILLING & INVOICES (Super Admin) — the master billing center. Real, persisted
// GST invoices per company subscription: 8 KPI cards, search + filters, a full
// invoice register with per-row actions, invoice generation, A4 preview/print/
// email, payments, renewals, and billing reports (revenue / outstanding / GST).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Wallet, TrendingUp, CalendarRange, AlertTriangle, BadgeCheck, Clock, Ban,
  CalendarClock, Search, RefreshCw, Plus, FileDown, Eye, MoreVertical, Printer,
  Mail, Copy, RotateCcw, CheckCircle2, Trash2, FileBarChart2, LayoutList,
} from 'lucide-react';
import { Card, StatCard, SectionHeader } from '@/components/ui/Card';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { inr } from '@/config/subscriptionPricing';
import { INVOICE_STATUS_VARIANT, RENEWAL_VARIANT } from './billing/calc';
import { GenerateInvoiceModal } from './billing/GenerateInvoiceModal';
import { InvoiceDetailModal } from './billing/InvoiceDetailModal';

const shortDate = (d: any) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

export const BillingTab: React.FC = () => {
  const [view, setView] = useState<'invoices' | 'reports'>('invoices');
  const [summary, setSummary] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);

  // filters
  const [search, setSearch] = useState('');
  const [planF, setPlanF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [cycleF, setCycleF] = useState('all');
  const [monthF, setMonthF] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, list] = await Promise.all([
        api.subscriptionInvoices.dashboard(),
        api.subscriptionInvoices.list({ search, plan: planF, status: statusF, billingCycle: cycleF, month: monthF }),
      ]);
      setSummary(dash || {});
      setRows(Array.isArray(list) ? list : []);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [search, planF, statusF, cycleF, monthF]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  // one-time: companies (for Generate) + platform settings (tax defaults)
  useEffect(() => {
    (async () => {
      try { const [c, s] = await Promise.all([api.subscriptions.list(), api.planConfig.getSettings().catch(() => ({}))]); setCompanies(Array.isArray(c) ? c : []); setSettings(s || {}); } catch { /* non-fatal */ }
    })();
  }, []);

  // month options from current rows
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { const d = new Date(r.invoiceDate); set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); });
    return [...set].sort().reverse();
  }, [rows]);

  const cards = [
    { label: 'Total Revenue', value: inr(summary.totalRevenue || 0), icon: <Wallet size={18} />, color: 'bg-brand-600' },
    { label: 'Monthly Revenue', value: inr(summary.monthlyRevenue || 0), icon: <CalendarClock size={18} />, color: 'bg-blue-500' },
    { label: 'Annual Revenue', value: inr(summary.annualRevenue || 0), icon: <TrendingUp size={18} />, color: 'bg-purple-600' },
    { label: 'Outstanding', value: inr(summary.outstanding || 0), icon: <AlertTriangle size={18} />, color: 'bg-rose-500' },
    { label: 'Paid Invoices', value: summary.paidInvoices ?? 0, icon: <BadgeCheck size={18} />, color: 'bg-emerald-500' },
    { label: 'Pending Invoices', value: summary.pendingInvoices ?? 0, icon: <Clock size={18} />, color: 'bg-amber-500' },
    { label: 'Overdue Invoices', value: summary.overdueInvoices ?? 0, icon: <Ban size={18} />, color: 'bg-red-600' },
    { label: 'Upcoming Renewals', value: summary.upcomingRenewals ?? 0, icon: <CalendarRange size={18} />, color: 'bg-indigo-500' },
  ];

  // ── row actions ──
  const quick = async (fn: () => Promise<any>, msg: string) => {
    setMenuId(null);
    try { await fn(); ui.toast.success(msg); await load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const markPaid = (r: any) => quick(() => api.subscriptionInvoices.setStatus(r.id, { status: 'Paid' }), 'Marked paid.');
  const emailInv = (r: any) => quick(() => api.subscriptionInvoices.email(r.id, {}).then((x: any) => { if (x?.devMode) ui.toast.info(x.message); }), 'Invoice emailed.');
  const duplicate = (r: any) => quick(() => api.subscriptionInvoices.duplicate(r.id), 'Duplicated.');
  const renew = (r: any) => quick(() => api.subscriptionInvoices.renew(r.id), 'Renewal generated.');
  const cancel = async (r: any) => { if (await ui.confirm({ title: 'Cancel invoice?', message: `Void ${r.invoiceNo}?`, confirmText: 'Cancel Invoice', variant: 'danger' })) quick(() => api.subscriptionInvoices.setStatus(r.id, { status: 'Cancelled' }), 'Cancelled.'); };
  const del = async (r: any) => { if (await ui.confirm({ title: 'Delete invoice?', message: `${r.invoiceNo} will be permanently removed.`, confirmText: 'Delete', variant: 'danger' })) quick(() => api.subscriptionInvoices.remove(r.id), 'Deleted.'); };
  const printInv = async (r: any) => {
    setMenuId(null);
    try { const h = await api.subscriptionInvoices.fetchHtml(r.id); const w = window.open('', '_blank', 'width=900,height=1100'); if (!w) return ui.toast.error('Allow pop-ups to print.'); w.document.write(h); w.document.close(); w.focus(); setTimeout(() => w.print(), 350); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  // ── exports ──
  const exportCSV = () => {
    const cols = ['invoiceNo', 'companyName', 'companyHead', 'plan', 'billingCycle', 'employeeCount', 'pricePerEmployee', 'subtotal', 'discountAmount', 'gstPercent', 'gstAmount', 'grandTotal', 'amountPaid', 'balance', 'status', 'invoiceDate', 'dueDate'];
    const head = cols.join(',');
    const body = rows.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob(`${head}\n${body}`, 'subscription-invoices.csv', 'text/csv');
  };
  const exportExcel = () => {
    const cols = [['Invoice No', 'invoiceNo'], ['Company', 'companyName'], ['Head', 'companyHead'], ['Plan', 'plan'], ['Cycle', 'billingCycle'], ['Employees', 'employeeCount'], ['Price/Emp', 'pricePerEmployee'], ['Subtotal', 'subtotal'], ['Discount', 'discountAmount'], ['GST %', 'gstPercent'], ['GST Amt', 'gstAmount'], ['Grand Total', 'grandTotal'], ['Paid', 'amountPaid'], ['Balance', 'balance'], ['Status', 'status'], ['Invoice Date', 'invoiceDate'], ['Due Date', 'dueDate']];
    const th = cols.map((c) => `<th>${c[0]}</th>`).join('');
    const trs = rows.map((r) => `<tr>${cols.map((c) => `<td>${String(r[c[1]] ?? '')}</td>`).join('')}</tr>`).join('');
    downloadBlob(`<table border="1">${`<tr>${th}</tr>`}${trs}</table>`, 'subscription-invoices.xls', 'application/vnd.ms-excel');
  };

  const selectCls = 'h-10 px-3 rounded-xl border border-hairline bg-surface text-sm outline-none focus:border-brand-500';

  return (
    <div className="space-y-5" onClick={() => menuId && setMenuId(null)}>
      <SectionHeader
        title="Billing & Invoices"
        subtitle="Real GST invoices for every company subscription — generate, collect, renew and report."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-hairline overflow-hidden">
              <button onClick={() => setView('invoices')} className={`px-3 h-9 text-[13px] font-semibold flex items-center gap-1.5 ${view === 'invoices' ? 'bg-brand-600 text-white' : 'text-ink-secondary'}`}><LayoutList size={14} />Invoices</button>
              <button onClick={() => setView('reports')} className={`px-3 h-9 text-[13px] font-semibold flex items-center gap-1.5 ${view === 'reports' ? 'bg-brand-600 text-white' : 'text-ink-secondary'}`}><FileBarChart2 size={14} />Reports</button>
            </div>
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={load} loading={loading}>Refresh</Button>
            <Button size="sm" icon={<Plus size={15} />} onClick={() => setGenerating(true)}>Generate Invoice</Button>
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} color={c.color} />)}
      </div>

      {view === 'reports' ? (
        <ReportsView />
      ) : (
        <>
          {/* Filters */}
          <Card>
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice no, company or email…" className="w-full h-10 pl-9 pr-3 rounded-xl border border-hairline bg-surface text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10" />
              </div>
              <select value={planF} onChange={(e) => setPlanF(e.target.value)} className={selectCls}>
                <option value="all">All plans</option>{['Free', 'Starter', 'Professional', 'Enterprise', 'Custom'].map((p) => <option key={p}>{p}</option>)}
              </select>
              <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={selectCls}>
                <option value="all">All statuses</option>{['Draft', 'Pending', 'Paid', 'Overdue', 'Cancelled', 'Refunded'].map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={cycleF} onChange={(e) => setCycleF(e.target.value)} className={selectCls}>
                <option value="all">All cycles</option><option>Quarterly</option><option>Yearly</option>
              </select>
              <select value={monthF} onChange={(e) => setMonthF(e.target.value)} className={selectCls}>
                <option value="all">All months</option>{monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" icon={<FileDown size={14} />} onClick={exportCSV}>CSV</Button>
                <Button variant="outline" size="sm" icon={<FileDown size={14} />} onClick={exportExcel}>Excel</Button>
              </div>
            </div>
          </Card>

          {/* Invoice register */}
          <Card padding={false}>
            <div className="overflow-x-auto">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Invoice No</Th><Th>Company</Th><Th>Plan</Th><Th>Cycle</Th><Th>Emp</Th><Th>Rate</Th>
                    <Th>Subtotal</Th><Th>GST</Th><Th>Disc</Th><Th>Grand Total</Th><Th>Invoice / Due</Th>
                    <Th>Payment</Th><Th>Renewal</Th><Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {loading ? (
                    <Tr><Td colSpan={14}><div className="py-10 text-center text-ink-muted text-sm">Loading invoices…</div></Td></Tr>
                  ) : rows.length === 0 ? (
                    <Tr><Td colSpan={14}><div className="py-12 text-center text-ink-muted text-sm flex flex-col items-center gap-2"><Wallet size={22} className="opacity-40" />No invoices yet. Click <b>Generate Invoice</b> to create the first one.</div></Td></Tr>
                  ) : rows.map((r) => (
                    <Tr key={r.id}>
                      <Td><button onClick={() => setDetailId(r.id)} className="font-bold text-brand-700 hover:underline">{r.invoiceNo}</button></Td>
                      <Td><div className="font-semibold text-ink whitespace-nowrap">{r.companyName}</div><div className="text-[11px] text-ink-muted">{r.companyHead}</div></Td>
                      <Td>{r.plan}</Td>
                      <Td className="text-[13px] text-ink-secondary">{r.billingCycle}</Td>
                      <Td className="tabular-nums">{r.employeeCount}</Td>
                      <Td className="tabular-nums">{inr(r.pricePerEmployee)}</Td>
                      <Td className="tabular-nums">{inr(r.subtotal)}</Td>
                      <Td className="tabular-nums text-[13px]">{inr(r.gstAmount)}<span className="text-ink-muted text-[11px]"> ({r.gstPercent}%)</span></Td>
                      <Td className="tabular-nums text-emerald-600 text-[13px]">{r.discountAmount ? `− ${inr(r.discountAmount)}` : '—'}</Td>
                      <Td className="tabular-nums font-bold">{inr(r.grandTotal)}</Td>
                      <Td className="text-[12px] text-ink-secondary whitespace-nowrap">{shortDate(r.invoiceDate)}<br /><span className="text-ink-muted">due {shortDate(r.dueDate)}</span></Td>
                      <Td><Badge variant={INVOICE_STATUS_VARIANT[r.status] || 'gray'} dot>{r.status}</Badge></Td>
                      <Td><Badge variant={RENEWAL_VARIANT[r.renewalStatus] || 'gray'}>{r.renewalStatus}</Badge></Td>
                      <Td>
                        <div className="flex items-center gap-1 relative">
                          <button onClick={() => setDetailId(r.id)} title="View" className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-hairline text-ink-secondary hover:bg-surface-muted"><Eye size={14} /></button>
                          <button onClick={(e) => { e.stopPropagation(); setMenuId(menuId === r.id ? null : r.id); }} title="More" className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-hairline text-ink-secondary hover:bg-surface-muted"><MoreVertical size={14} /></button>
                          {menuId === r.id && (
                            <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-8 z-30 w-48 rounded-xl border border-hairline bg-surface shadow-lg py-1 text-[13px]">
                              <MenuItem icon={<Printer size={13} />} label="Print / Download" onClick={() => printInv(r)} />
                              <MenuItem icon={<Mail size={13} />} label="Email Invoice" onClick={() => emailInv(r)} />
                              {!['Paid', 'Cancelled', 'Refunded'].includes(r.status) && <MenuItem icon={<CheckCircle2 size={13} />} label="Mark Paid" onClick={() => markPaid(r)} />}
                              <MenuItem icon={<Copy size={13} />} label="Duplicate" onClick={() => duplicate(r)} />
                              <MenuItem icon={<RotateCcw size={13} />} label="Renew" onClick={() => renew(r)} />
                              {!['Cancelled', 'Refunded'].includes(r.status) && <MenuItem icon={<Ban size={13} />} label="Cancel" onClick={() => cancel(r)} danger />}
                              {['Draft', 'Cancelled'].includes(r.status) && <MenuItem icon={<Trash2 size={13} />} label="Delete" onClick={() => del(r)} danger />}
                            </div>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </Card>
        </>
      )}

      {generating && <GenerateInvoiceModal companies={companies} settings={settings} onClose={() => setGenerating(false)} onCreated={() => { setGenerating(false); load(); }} />}
      {detailId != null && <InvoiceDetailModal invoiceId={detailId} onClose={() => setDetailId(null)} onChanged={load} />}
    </div>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-muted ${danger ? 'text-rose-600' : 'text-ink'}`}>{icon}{label}</button>
);

// ── Reports view — revenue / outstanding / GST summary / register ────────────
const ReportsView: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setData(await api.subscriptionInvoices.reports()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } })(); }, []);
  if (loading) return <div className="py-16 text-center text-ink-muted text-sm">Loading billing reports…</div>;
  if (!data) return null;
  const g = data.gstSummary || {};
  const maxRev = Math.max(1, ...(data.revenueByMonth || []).map((m: any) => m.amount));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* GST summary */}
      <Card>
        <SectionHeader title="GST Summary" subtitle="Across all non-cancelled invoices" />
        <div className="grid grid-cols-2 gap-3 mt-2">
          {[['Taxable Value', g.taxable], ['CGST', g.cgst], ['SGST', g.sgst], ['IGST', g.igst], ['Total GST', g.gst], ['Grand Total', g.grand]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border border-hairline p-3">
              <div className="text-[11px] text-ink-muted uppercase tracking-wide">{l as string}</div>
              <div className="text-lg font-bold text-ink tabular-nums mt-0.5">{inr(Number(v) || 0)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Revenue by month */}
      <Card>
        <SectionHeader title="Monthly Revenue" subtitle={`Collected · ${inr(data.totals?.revenue || 0)} total`} />
        <div className="space-y-2 mt-2">
          {(data.revenueByMonth || []).length === 0 ? <div className="text-sm text-ink-muted py-4">No revenue recorded yet.</div> :
            (data.revenueByMonth || []).slice(-8).map((m: any) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="text-[12px] text-ink-secondary w-16 tabular-nums">{m.month}</span>
                <div className="flex-1 h-3 rounded-full bg-surface-muted overflow-hidden"><div className="h-full bg-brand-500 rounded-full" style={{ width: `${(m.amount / maxRev) * 100}%` }} /></div>
                <span className="text-[12px] font-semibold text-ink tabular-nums w-20 text-right">{inr(m.amount)}</span>
              </div>
            ))}
        </div>
      </Card>

      {/* Outstanding by company */}
      <Card padding={false} className="lg:col-span-2">
        <div className="px-5 pt-5"><SectionHeader title="Outstanding by Company" /></div>
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Company</Th><Th>Outstanding</Th></Tr></Thead>
            <Tbody>
              {(data.outstandingByCompany || []).length === 0 ? (
                <Tr><Td colSpan={2}><div className="py-6 text-center text-ink-muted text-sm">Nothing outstanding — all settled.</div></Td></Tr>
              ) : data.outstandingByCompany.map((o: any) => (
                <Tr key={o.company}><Td className="font-medium text-ink">{o.company}</Td><Td className="tabular-nums font-semibold text-rose-600">{inr(o.amount)}</Td></Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default BillingTab;
