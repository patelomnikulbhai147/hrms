// ─────────────────────────────────────────────────────────────────────────────
// REPORTS — seven business reports behind one sub-navigation:
//   Revenue · Growth · Renewals · Expired Plans · Verification Credit Sales ·
//   Employee Slot Sales · GST
//
// Each report is a projection of data the platform already holds. Nothing is
// recomputed against a different rule than the screen it came from — revenue
// comes from the billing engine, renewals from the subscription rows, credit and
// slot sales from their own settled-order ledgers.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, Users2, CalendarClock, CalendarX2, ShieldCheck, LayoutGrid,
  Receipt, FileDown, RefreshCw, BadgeCheck,
} from 'lucide-react';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Badge, statusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDateTime } from '@/utils/formatDate';
import {
  Metric, Panel, SubNav, Loading, Empty, inr, inrShort, num, shortDate,
  exportCsv, monthLabelShort, monthLabel, PLAN_VARIANT,
} from './kit';
import { BarChart, type BarDatum } from './charts';

type View = 'revenue' | 'growth' | 'renewals' | 'expired' | 'credits' | 'slots' | 'gst';

const NAV = [
  { key: 'revenue', label: 'Revenue', icon: <TrendingUp size={14} /> },
  { key: 'growth', label: 'Growth', icon: <Users2 size={14} /> },
  { key: 'renewals', label: 'Renewals', icon: <CalendarClock size={14} /> },
  { key: 'expired', label: 'Expired Plans', icon: <CalendarX2 size={14} /> },
  { key: 'credits', label: 'Verification Credit Sales', icon: <ShieldCheck size={14} /> },
  { key: 'slots', label: 'Employee Slot Sales', icon: <LayoutGrid size={14} /> },
  { key: 'gst', label: 'GST', icon: <Receipt size={14} /> },
];

export const ReportsTab: React.FC<{ initialView?: View }> = ({ initialView }) => {
  const [view, setView] = useState<View>(initialView || 'revenue');
  useEffect(() => { if (initialView) setView(initialView); }, [initialView]);

  return (
    <div className="space-y-5">
      <SubNav items={NAV} value={view} onChange={(k) => setView(k as View)} />
      {view === 'revenue' && <RevenueReport />}
      {view === 'growth' && <GrowthReport />}
      {view === 'renewals' && <RenewalsReport />}
      {view === 'expired' && <ExpiredReport />}
      {view === 'credits' && <CreditSalesReport />}
      {view === 'slots' && <SlotSalesReport />}
      {view === 'gst' && <GstReport />}
    </div>
  );
};

// ── Shared loader hook ───────────────────────────────────────────────────────
function useReport<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetcher()); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

const Toolbar: React.FC<{ onRefresh: () => void; onExport?: () => void }> = ({ onRefresh, onExport }) => (
  <div className="flex items-center justify-end gap-2">
    {onExport && <Button variant="outline" size="sm" icon={<FileDown size={14} />} onClick={onExport}>Export</Button>}
    <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={onRefresh}>Refresh</Button>
  </div>
);

// ── 1. REVENUE ───────────────────────────────────────────────────────────────
const RevenueReport: React.FC = () => {
  const { data, loading, reload } = useReport<any>(() => api.subscriptionInvoices.reports());
  if (loading) return <Loading label="Loading revenue report…" />;
  if (!data) return null;

  const monthly: BarDatum[] = (data.revenueByMonth || []).slice(-12).map((m: any) => ({
    key: m.month, label: monthLabelShort(m.month), value: Number(m.amount) || 0, sub: monthLabel(m.month),
  }));
  const collected = Number(data.totals?.revenue) || 0;
  const invoiced = Number(data.gstSummary?.grand) || 0;

  return (
    <div className="space-y-5">
      <Toolbar onRefresh={reload} onExport={() => exportCsv('revenue-by-month.csv', [['Month', 'month'], ['Collected', 'amount']], data.revenueByMonth || [])} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Metric label="Collected" value={inr(collected)} icon={<BadgeCheck size={16} />} tone="emerald" sub={`${num(data.totals?.paid ?? 0)} settled invoices`} />
        <Metric label="Invoiced" value={inr(invoiced)} icon={<Receipt size={16} />} tone="brand" sub={`${num(data.totals?.invoices ?? 0)} invoices raised`} />
        <Metric label="Yet to Collect" value={inr(Math.max(0, invoiced - collected))} icon={<TrendingUp size={16} />} tone="amber" sub="invoiced but unsettled" />
      </div>
      <Panel title="Collected by Month">
        <BarChart data={monthly} format={inr} tickFormat={inrShort} height={280} emptyLabel="No revenue collected yet." />
      </Panel>
      <Panel flush title="By Year">
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Year</Th><Th>Collected</Th></Tr></Thead>
            <Tbody>
              {(data.revenueByYear || []).length === 0
                ? <Tr><Td colSpan={2}><Empty title="No revenue recorded yet." /></Td></Tr>
                : data.revenueByYear.map((y: any) => (
                  <Tr key={y.year}><Td className="font-semibold text-ink tabular-nums">{y.year}</Td><Td className="tabular-nums font-bold">{inr(y.amount)}</Td></Tr>
                ))}
            </Tbody>
          </Table>
        </div>
      </Panel>
    </div>
  );
};

// ── 2. GROWTH ────────────────────────────────────────────────────────────────
const GrowthReport: React.FC = () => {
  const { data, loading, reload } = useReport<any[]>(async () => {
    const l = await api.subscriptions.list();
    return Array.isArray(l) ? l : [];
  });
  const rows = data || [];

  const byMonth = useMemo(() => {
    const m = new Map<string, { total: number; paid: number }>();
    for (const r of rows) {
      if (!r.createdDate) continue;
      const d = new Date(r.createdDate);
      if (isNaN(d.getTime())) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cur = m.get(k) || { total: 0, paid: 0 };
      cur.total += 1;
      if (r.plan !== 'Free') cur.paid += 1;
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  if (loading) return <Loading label="Loading growth report…" />;

  const chart: BarDatum[] = byMonth.slice(-12).map(([k, v]) => ({
    key: k, label: monthLabelShort(k), value: v.total, sub: `${monthLabel(k)} · ${v.paid} paid`,
  }));
  const paid = rows.filter((r) => r.plan !== 'Free').length;
  const active = rows.filter((r) => r.status === 'Active').length;
  const last30 = rows.filter((r) => r.createdDate && Date.now() - new Date(r.createdDate).getTime() < 30 * 864e5).length;

  return (
    <div className="space-y-5">
      <Toolbar onRefresh={reload} onExport={() => exportCsv('growth-by-month.csv', [['Month', 'month'], ['New Companies', 'total'], ['Paid', 'paid']], byMonth.map(([month, v]) => ({ month, ...v })))} />
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Metric label="Total Companies" value={num(rows.length)} icon={<Users2 size={16} />} tone="brand" />
        <Metric label="Active" value={num(active)} icon={<BadgeCheck size={16} />} tone="emerald" sub={`${rows.length ? Math.round((active / rows.length) * 100) : 0}% of the base`} />
        <Metric label="Paid Companies" value={num(paid)} icon={<TrendingUp size={16} />} tone="amber" sub={`${num(rows.length - paid)} on Free`} />
        <Metric label="Joined (30 days)" value={num(last30)} icon={<CalendarClock size={16} />} tone="slate" />
      </div>
      <Panel title="New Companies by Month" subtitle="Sign-ups per month, paid conversions in the tooltip">
        <BarChart data={chart} format={(n) => `${n} companies`} tickFormat={(n) => String(Math.round(n))} height={280} emptyLabel="No sign-up history available." />
      </Panel>
    </div>
  );
};

// ── 3. RENEWALS ──────────────────────────────────────────────────────────────
const RenewalsReport: React.FC = () => {
  const { data, loading, reload } = useReport<any[]>(async () => {
    const l = await api.subscriptions.list();
    return Array.isArray(l) ? l : [];
  });
  const rows = data || [];

  const buckets = useMemo(() => {
    const now = Date.now();
    const out = { overdue: [] as any[], d30: [] as any[], d60: [] as any[], d90: [] as any[] };
    for (const r of rows) {
      if (!r.renewalDate) continue;
      const days = Math.ceil((new Date(r.renewalDate).getTime() - now) / 864e5);
      if (days < 0) out.overdue.push({ ...r, days });
      else if (days <= 30) out.d30.push({ ...r, days });
      else if (days <= 60) out.d60.push({ ...r, days });
      else if (days <= 90) out.d90.push({ ...r, days });
    }
    return out;
  }, [rows]);

  if (loading) return <Loading label="Loading renewals…" />;

  const upcoming = [...buckets.overdue, ...buckets.d30, ...buckets.d60, ...buckets.d90].sort((a, b) => a.days - b.days);

  return (
    <div className="space-y-5">
      <Toolbar onRefresh={reload} onExport={() => exportCsv('renewals.csv', [['Company', 'companyName'], ['Plan', 'plan'], ['Cycle', 'billingCycle'], ['Renewal', 'renewalDate'], ['Amount', 'amount'], ['Days', 'days']], upcoming)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric label="Past Due" value={num(buckets.overdue.length)} icon={<CalendarX2 size={16} />} tone="rose" />
        <Metric label="Next 30 Days" value={num(buckets.d30.length)} icon={<CalendarClock size={16} />} tone="amber" />
        <Metric label="31–60 Days" value={num(buckets.d60.length)} icon={<CalendarClock size={16} />} tone="brand" />
        <Metric label="61–90 Days" value={num(buckets.d90.length)} icon={<CalendarClock size={16} />} tone="slate" />
      </div>
      <Panel flush title="Renewal Schedule" subtitle="Soonest first — past-due renewals at the top">
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Company</Th><Th>Plan</Th><Th>Cycle</Th><Th>Renewal Date</Th><Th>When</Th><Th>Amount</Th></Tr></Thead>
            <Tbody>
              {upcoming.length === 0
                ? <Tr><Td colSpan={6}><Empty icon={<CalendarClock size={22} />} title="No renewals scheduled." hint="Set a renewal date on a company's subscription to see it here." /></Td></Tr>
                : upcoming.map((r) => (
                  <Tr key={r.companyId}>
                    <Td className="font-semibold text-ink">{r.companyName}</Td>
                    <Td><Badge variant={PLAN_VARIANT[r.plan] || 'gray'}>{r.plan}</Badge></Td>
                    <Td className="text-[13px] text-ink-secondary">{r.billingCycle}</Td>
                    <Td className="text-[13px] text-ink-secondary whitespace-nowrap">{shortDate(r.renewalDate)}</Td>
                    <Td>
                      {r.days < 0
                        ? <span className="text-[12.5px] font-bold text-rose-600">{Math.abs(r.days)} days overdue</span>
                        : <span className="text-[12.5px] font-semibold text-ink-secondary">in {r.days} days</span>}
                    </Td>
                    <Td className="tabular-nums font-semibold">{inr(r.amount)}</Td>
                  </Tr>
                ))}
            </Tbody>
          </Table>
        </div>
      </Panel>
    </div>
  );
};

// ── 4. EXPIRED PLANS ─────────────────────────────────────────────────────────
const ExpiredReport: React.FC = () => {
  const { data, loading, reload } = useReport<any[]>(async () => {
    const l = await api.subscriptions.list();
    return Array.isArray(l) ? l : [];
  });
  const rows = data || [];

  const expired = useMemo(() => {
    const now = Date.now();
    return rows
      .filter((r) => r.status === 'Expired'
        || (r.renewalDate && new Date(r.renewalDate).getTime() < now)
        || ['Overdue', 'Expired', 'Unpaid'].includes(r.paymentStatus))
      .map((r) => ({ ...r, daysExpired: r.renewalDate ? Math.floor((now - new Date(r.renewalDate).getTime()) / 864e5) : null }))
      .sort((a, b) => (b.daysExpired ?? 0) - (a.daysExpired ?? 0));
  }, [rows]);

  if (loading) return <Loading label="Loading expired plans…" />;

  const lostValue = expired.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <div className="space-y-5">
      <Toolbar onRefresh={reload} onExport={() => exportCsv('expired-plans.csv', [['Company', 'companyName'], ['Plan', 'plan'], ['Renewal', 'renewalDate'], ['Days Expired', 'daysExpired'], ['Amount', 'amount'], ['Status', 'status']], expired)} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Metric label="Expired Plans" value={num(expired.length)} icon={<CalendarX2 size={16} />} tone="rose" />
        <Metric label="Value at Risk" value={inr(lostValue)} icon={<TrendingUp size={16} />} tone="amber" sub="per billing period" />
        <Metric label="Still Active" value={num(rows.length - expired.length)} icon={<BadgeCheck size={16} />} tone="emerald" />
      </div>
      <Panel flush title="Expired & Lapsed Subscriptions" subtitle="Longest lapsed first">
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Company</Th><Th>Plan</Th><Th>Expired On</Th><Th>Lapsed</Th><Th>Period Value</Th><Th>Status</Th></Tr></Thead>
            <Tbody>
              {expired.length === 0
                ? <Tr><Td colSpan={6}><Empty icon={<BadgeCheck size={22} />} title="No expired plans." hint="Every subscription is current." /></Td></Tr>
                : expired.map((r) => (
                  <Tr key={r.companyId}>
                    <Td className="font-semibold text-ink">{r.companyName}</Td>
                    <Td><Badge variant={PLAN_VARIANT[r.plan] || 'gray'}>{r.plan}</Badge></Td>
                    <Td className="text-[13px] text-ink-secondary whitespace-nowrap">{shortDate(r.renewalDate)}</Td>
                    <Td className="text-[12.5px] font-semibold text-rose-600 tabular-nums">{r.daysExpired != null && r.daysExpired > 0 ? `${r.daysExpired} days` : '—'}</Td>
                    <Td className="tabular-nums font-semibold">{inr(r.amount)}</Td>
                    <Td><Badge variant={statusBadge(r.status)} dot>{r.status}</Badge></Td>
                  </Tr>
                ))}
            </Tbody>
          </Table>
        </div>
      </Panel>
    </div>
  );
};

// ── 5. VERIFICATION CREDIT SALES ─────────────────────────────────────────────
const CreditSalesReport: React.FC = () => {
  const { data, loading, reload } = useReport<any>(() => api.recharge.admin.dashboard());
  if (loading) return <Loading label="Loading credit sales…" />;
  if (!data) return null;

  const monthly: BarDatum[] = (data.monthlyRevenue || []).slice(-12).map((m: any) => ({
    key: m.month, label: monthLabelShort(m.month), value: Number(m.revenue) || 0,
    sub: `${monthLabel(m.month)} · ${num(m.credits)} credits · ${num(m.orders)} orders`,
  }));

  return (
    <div className="space-y-5">
      <Toolbar onRefresh={reload} onExport={() => exportCsv('credit-sales-by-month.csv', [['Month', 'month'], ['Revenue', 'revenue'], ['Credits', 'credits'], ['Orders', 'orders']], data.monthlyRevenue || [])} />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric label="Credit Revenue" value={inr(data.totalRevenue || 0)} icon={<ShieldCheck size={16} />} tone="brand" sub={`${num(data.settledOrders ?? 0)} settled orders`} />
        <Metric label="Credits Sold" value={num(data.creditsSold ?? 0)} icon={<BadgeCheck size={16} />} tone="emerald" />
        <Metric label="This Month" value={inr(data.monthRevenue || 0)} icon={<CalendarClock size={16} />} tone="amber" sub={`${num(data.monthOrders ?? 0)} orders`} />
        <Metric label="GST Collected" value={inr(data.totalGstCollected || 0)} icon={<Receipt size={16} />} tone="slate" sub={`${inr(data.totalCollected || 0)} gross`} />
      </div>
      <Panel title="Credit Revenue by Month">
        <BarChart data={monthly} format={inr} tickFormat={inrShort} height={260} emptyLabel="No credit purchases settled yet." />
      </Panel>
      <Panel flush title="Top Companies by Credit Spend">
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Company</Th><Th>Revenue</Th><Th>Credits</Th><Th>Orders</Th></Tr></Thead>
            <Tbody>
              {(data.topCompanies || []).length === 0
                ? <Tr><Td colSpan={4}><Empty icon={<ShieldCheck size={22} />} title="No credit purchases yet." /></Td></Tr>
                : data.topCompanies.map((c: any) => (
                  <Tr key={c.companyId}>
                    <Td className="font-semibold text-ink">{c.companyName}</Td>
                    <Td className="tabular-nums font-bold">{inr(c.revenue)}</Td>
                    <Td className="tabular-nums">{num(c.credits)}</Td>
                    <Td className="tabular-nums">{num(c.orders)}</Td>
                  </Tr>
                ))}
            </Tbody>
          </Table>
        </div>
      </Panel>
    </div>
  );
};

// ── 6. EMPLOYEE SLOT SALES ───────────────────────────────────────────────────
const SlotSalesReport: React.FC = () => {
  const { data, loading, reload } = useReport<any[]>(async () => {
    const t = await api.employeeSlots.admin.transactions();
    return Array.isArray(t) ? t : [];
  });
  const rows = data || [];

  const sales = useMemo(() => rows.filter((r) => Number(r.amount) > 0 && r.status !== 'REJECTED'), [rows]);
  const byMonth = useMemo(() => {
    const m = new Map<string, { revenue: number; slots: number; orders: number }>();
    for (const r of sales) {
      const d = new Date(r.createdAt);
      if (isNaN(d.getTime())) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cur = m.get(k) || { revenue: 0, slots: 0, orders: 0 };
      cur.revenue += Number(r.amount) || 0;
      cur.slots += Number(r.slots) || 0;
      cur.orders += 1;
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [sales]);

  if (loading) return <Loading label="Loading slot sales…" />;

  const revenue = sales.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const slots = sales.reduce((s, r) => s + Math.max(0, Number(r.slots) || 0), 0);
  const chart: BarDatum[] = byMonth.slice(-12).map(([k, v]) => ({
    key: k, label: monthLabelShort(k), value: v.revenue, sub: `${monthLabel(k)} · ${num(v.slots)} slots · ${num(v.orders)} orders`,
  }));

  return (
    <div className="space-y-5">
      <Toolbar onRefresh={reload} onExport={() => exportCsv('slot-sales.csv', [['Date', 'createdAt'], ['Company', 'companyName'], ['Type', 'type'], ['Slots', 'slots'], ['Amount', 'amount'], ['Status', 'status']], sales)} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Metric label="Slot Revenue" value={inr(revenue)} icon={<LayoutGrid size={16} />} tone="brand" sub={`${num(sales.length)} paid transactions`} />
        <Metric label="Slots Sold" value={num(slots)} icon={<Users2 size={16} />} tone="emerald" />
        <Metric label="All Transactions" value={num(rows.length)} icon={<Receipt size={16} />} tone="slate" sub="including manual grants" />
      </div>
      <Panel title="Slot Revenue by Month">
        <BarChart data={chart} format={inr} tickFormat={inrShort} height={260} emptyLabel="No paid slot purchases yet." />
      </Panel>
      <Panel flush title="Slot Transactions" subtitle="Purchases, grants and decreases across every company">
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Date</Th><Th>Company</Th><Th>Type</Th><Th>Slots</Th><Th>Amount</Th><Th>Limit Change</Th><Th>Status</Th></Tr></Thead>
            <Tbody>
              {rows.length === 0
                ? <Tr><Td colSpan={7}><Empty icon={<LayoutGrid size={22} />} title="No slot transactions yet." /></Td></Tr>
                : rows.slice(0, 100).map((t) => (
                  <Tr key={t.id}>
                    <Td className="text-[12.5px] text-ink-secondary whitespace-nowrap">{formatDateTime(t.createdAt)}</Td>
                    <Td className="font-semibold text-ink">{t.companyName}</Td>
                    <Td className="text-[12.5px] text-ink-secondary">{String(t.type || '').replace(/_/g, ' ')}{t.packName ? ` — ${t.packName}` : ''}</Td>
                    <Td className="tabular-nums font-semibold">{Number(t.slots) > 0 ? `+${t.slots}` : t.slots}</Td>
                    <Td className="tabular-nums">{t.amount != null ? inr(t.amount) : '—'}</Td>
                    <Td className="tabular-nums text-[12.5px] text-ink-secondary">{t.oldLimit != null && t.newLimit != null ? `${t.oldLimit} → ${t.newLimit}` : '—'}</Td>
                    <Td><Badge variant={t.status === 'REJECTED' ? 'red' : t.status === 'REQUESTED' ? 'amber' : 'green'} dot>{t.status}</Badge></Td>
                  </Tr>
                ))}
            </Tbody>
          </Table>
        </div>
      </Panel>
    </div>
  );
};

// ── 7. GST ───────────────────────────────────────────────────────────────────
const GstReport: React.FC = () => {
  const { data, loading, reload } = useReport<any>(() => api.subscriptionInvoices.reports());
  if (loading) return <Loading label="Loading GST report…" />;
  if (!data) return null;
  const g = data.gstSummary || {};
  const register = (data.register || []).filter((r: any) => r.status !== 'Cancelled');

  return (
    <div className="space-y-5">
      <Toolbar onRefresh={reload} onExport={() => exportCsv('gst-register.csv', [
        ['Invoice No', 'invoiceNo'], ['Date', 'invoiceDate'], ['Company', 'companyName'], ['GSTIN', 'gstin'],
        ['Taxable', 'subtotal'], ['Discount', 'discountAmount'], ['GST %', 'gstPercent'],
        ['CGST', 'cgst'], ['SGST', 'sgst'], ['IGST', 'igst'], ['Total GST', 'gstAmount'], ['Grand Total', 'grandTotal'],
      ], register)} />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          ['Taxable Value', g.taxable], ['CGST', g.cgst], ['SGST', g.sgst],
          ['IGST', g.igst], ['Total GST', g.gst], ['Invoiced', g.grand],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-surface rounded-card border border-hairline shadow-card p-4">
            <div className="text-[10.5px] font-bold text-ink-muted uppercase tracking-wider">{label as string}</div>
            <div className="text-[19px] font-bold text-ink tabular-nums mt-1 font-heading">{inr(Number(value) || 0)}</div>
          </div>
        ))}
      </div>

      <Panel flush title="GST Register" subtitle={`${num(register.length)} non-cancelled invoices`}>
        <div className="overflow-x-auto">
          <Table>
            <Thead>
              <Tr>
                <Th>Invoice</Th><Th>Date</Th><Th>Company</Th><Th>GSTIN</Th><Th>Taxable</Th>
                <Th>GST %</Th><Th>CGST</Th><Th>SGST</Th><Th>IGST</Th><Th>Total</Th>
              </Tr>
            </Thead>
            <Tbody>
              {register.length === 0
                ? <Tr><Td colSpan={10}><Empty icon={<Receipt size={22} />} title="No invoices to report." /></Td></Tr>
                : register.map((r: any) => (
                  <Tr key={r.id}>
                    <Td><span className="font-bold text-brand-700">{r.invoiceNo}</span></Td>
                    <Td className="text-[12.5px] text-ink-secondary whitespace-nowrap">{shortDate(r.invoiceDate)}</Td>
                    <Td className="font-semibold text-ink">{r.companyName}</Td>
                    <Td className="text-[12px] text-ink-secondary">{r.gstin || '—'}</Td>
                    <Td className="tabular-nums">{inr((Number(r.subtotal) || 0) - (Number(r.discountAmount) || 0))}</Td>
                    <Td className="tabular-nums text-[12.5px]">{r.gstPercent}%</Td>
                    <Td className="tabular-nums text-[12.5px]">{r.cgst ? inr(r.cgst) : '—'}</Td>
                    <Td className="tabular-nums text-[12.5px]">{r.sgst ? inr(r.sgst) : '—'}</Td>
                    <Td className="tabular-nums text-[12.5px]">{r.igst ? inr(r.igst) : '—'}</Td>
                    <Td className="tabular-nums font-bold">{inr(r.grandTotal)}</Td>
                  </Tr>
                ))}
            </Tbody>
          </Table>
        </div>
      </Panel>
    </div>
  );
};

export default ReportsTab;
