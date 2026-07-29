// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW — the business answer in one screen.
//
// Four figures and two charts. Nothing else. The nine-tile wall this replaced
// made every number look equally important, which meant none of them read.
// Everything here is live: no figure is computed twice in two places.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Wallet, CalendarClock, AlertTriangle, RefreshCw, TrendingUp, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { Metric, Panel, Loading, inr, inrShort, monthLabelShort, monthLabel, num } from './kit';
import { BarChart, Donut, type BarDatum, type Slice } from './charts';

interface Props {
  /** Jump to another section (the tiles are navigational, not decorative). */
  onGoto?: (tab: string, view?: string) => void;
}

export const OverviewTab: React.FC<Props> = ({ onGoto }) => {
  const [subs, setSubs] = useState<any>({});
  const [bill, setBill] = useState<any>({});
  const [reports, setReports] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, b, r, l] = await Promise.all([
        api.subscriptions.dashboard(),
        api.subscriptionInvoices.dashboard(),
        api.subscriptionInvoices.reports(),
        api.subscriptions.list(),
      ]);
      setSubs(s || {});
      setBill(b || {});
      setReports(r || null);
      setRows(Array.isArray(l) ? l : []);
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Revenue collected per month — last 12 buckets the API reports.
  const revenue: BarDatum[] = useMemo(() => {
    const src = (reports?.revenueByMonth || []) as { month: string; amount: number }[];
    return src.slice(-12).map((m) => ({
      key: m.month,
      label: monthLabelShort(m.month),
      value: Number(m.amount) || 0,
      sub: monthLabel(m.month),
    }));
  }, [reports]);

  // Plan mix across every live company.
  const planMix: Slice[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.plan || 'Free', (counts.get(r.plan || 'Free') || 0) + 1);
    const ORDER = ['Free', 'Starter', 'Professional', 'Enterprise', 'Custom'];
    const known = ORDER.filter((p) => counts.has(p)).map((p) => ({ key: p, label: p, value: counts.get(p)! }));
    const extra = [...counts.keys()].filter((k) => !ORDER.includes(k)).map((k) => ({ key: k, label: k, value: counts.get(k)! }));
    return [...known, ...extra];
  }, [rows]);

  const totalCompanies = rows.length;
  const collectedThisMonth = Number(bill.monthlyRevenue) || 0;
  const mrr = Number(subs.monthlyRevenue) || 0;
  const outstanding = Number(bill.outstanding) || 0;
  const unpaidCount = (Number(bill.pendingInvoices) || 0) + (Number(bill.overdueInvoices) || 0);

  if (loading) return <Loading label="Loading overview…" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
      </div>

      {/* ── The four figures ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric
          label="Active Companies"
          value={num(subs.activeSubscriptions ?? 0)}
          icon={<Building2 size={16} />}
          tone="brand"
          sub={`of ${num(totalCompanies)} on the platform`}
          onClick={() => onGoto?.('companies')}
        />
        <Metric
          label="Monthly Revenue"
          value={inr(collectedThisMonth)}
          icon={<Wallet size={16} />}
          tone="emerald"
          sub={`collected this month · ${inr(mrr)} run-rate`}
          onClick={() => onGoto?.('billing', 'revenue')}
        />
        <Metric
          label="Renewals Due"
          value={num(bill.upcomingRenewals ?? 0)}
          icon={<CalendarClock size={16} />}
          tone="amber"
          sub="in the next 30 days"
          onClick={() => onGoto?.('reports', 'renewals')}
        />
        <Metric
          label="Pending Payments"
          value={inr(outstanding)}
          icon={<AlertTriangle size={16} />}
          tone="rose"
          sub={`${num(unpaidCount)} unpaid invoice${unpaidCount === 1 ? '' : 's'}`}
          onClick={() => onGoto?.('billing', 'pending')}
        />
      </div>

      {/* ── The two charts ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <Panel
          className="xl:col-span-3"
          title="Revenue"
          subtitle="Collected against subscription invoices, by month"
          actions={<span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted"><TrendingUp size={14} />{inr(reports?.totals?.revenue || 0)} total</span>}
        >
          <BarChart
            data={revenue}
            format={inr}
            tickFormat={inrShort}
            height={260}
            emptyLabel="No payments collected yet — revenue appears here once invoices are settled."
          />
        </Panel>

        <Panel
          className="xl:col-span-2"
          title="Plan Distribution"
          subtitle="Companies by subscription plan"
          actions={<PieChart size={14} className="text-ink-muted" />}
        >
          <Donut
            data={planMix}
            size={158}
            centerLabel="Companies"
            centerValue={totalCompanies}
            emptyLabel="No companies yet."
          />
        </Panel>
      </div>
    </div>
  );
};

export default OverviewTab;
