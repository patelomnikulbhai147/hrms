// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION MANAGEMENT (Super Admin) — the platform control center.
//
// A 5-tab shell:
//   1. Companies          — every company's subscription (assign/manage plans)
//   2. Subscription Plans — the MASTER CONFIG for what each plan unlocks
//   3. Billing & Invoices — amounts / renewals / outstanding
//   4. Subscription History — global change log
//   5. Plan Settings      — global platform defaults
//
// Companies ASSIGNS plans; Subscription Plans DEFINES them. The plan definitions
// drive the permission engine, so editing a plan re-permissions its companies
// instantly (no code change).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Building2, Users, Wallet, CalendarClock, CalendarRange, BadgeCheck, AlertTriangle,
  TrendingUp, Search, Settings2, Ban, Play, RefreshCw, Crown, ChevronLeft, ChevronRight,
  LayoutGrid, Layers, ReceiptText, History as HistoryIcon, SlidersHorizontal,
} from 'lucide-react';
import { Card, StatCard } from '@/components/ui/Card';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Badge, statusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { inr } from '@/config/subscriptionPricing';
import { PlansTab } from '@/components/subscription/PlansTab';
import { BillingTab } from '@/components/subscription/BillingTab';
import { HistoryTab } from '@/components/subscription/HistoryTab';
import { PlanSettingsTab } from '@/components/subscription/PlanSettingsTab';

interface Props {
  onManage: (companyId: string | number) => void;
}

type TabKey = 'companies' | 'plans' | 'billing' | 'history' | 'settings';
const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'companies', label: 'Companies', icon: <LayoutGrid size={15} /> },
  { key: 'plans', label: 'Subscription Plans', icon: <Layers size={15} /> },
  { key: 'billing', label: 'Billing & Invoices', icon: <ReceiptText size={15} /> },
  { key: 'history', label: 'Subscription History', icon: <HistoryIcon size={15} /> },
  { key: 'settings', label: 'Plan Settings', icon: <SlidersHorizontal size={15} /> },
];

export const SubscriptionManagement: React.FC<Props> = ({ onManage }) => {
  const [tab, setTab] = useState<TabKey>('companies');

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Master header */}
      <div>
        <h1 className="text-xl font-bold text-ink flex items-center gap-2"><Crown size={20} className="text-brand-600" /> Subscription Management</h1>
        <p className="text-sm text-ink-muted mt-0.5">Plans, per-employee pricing, permissions and billing for every company.</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-hairline overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'companies' && <CompaniesTab onManage={onManage} />}
      {tab === 'plans' && <PlansTab />}
      {tab === 'billing' && <BillingTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'settings' && <PlanSettingsTab />}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPANIES TAB — every company's subscription row + KPI cards (Manage/Suspend).
// ─────────────────────────────────────────────────────────────────────────────
const PLAN_VARIANT: Record<string, any> = { Free: 'gray', Starter: 'blue', Professional: 'purple', Enterprise: 'indigo', Custom: 'amber' };
const PAGE_SIZE = 10;

const CompaniesTab: React.FC<Props> = ({ onManage }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const l = await api.subscriptions.list();
      setRows(Array.isArray(l) ? l : []);
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (planFilter !== 'all' && r.plan !== planFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.companyName, r.companyHead, r.companyHeadEmail].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [rows, search, planFilter, statusFilter]);

  const summary = useMemo(() => {
    const now = Date.now();
    let free = 0, paid = 0, quarterly = 0, yearly = 0, active = 0, expired = 0, monthlyRevenue = 0;
    for (const r of filtered) {
      const plan = r.plan || 'Free';
      const cycle = String(r.billingCycle || 'Quarterly').toLowerCase();
      if (plan === 'Free') free++; else paid++;
      if (cycle === 'yearly') yearly++; else quarterly++;
      const isExpired = r.status === 'Expired'
        || (r.renewalDate && new Date(r.renewalDate).getTime() < now)
        || ['Overdue', 'Expired', 'Unpaid'].includes(r.paymentStatus);
      if (isExpired) expired++;
      const isActive = r.status === 'Active' && !isExpired;
      if (isActive) active++;
      if (isActive && plan !== 'Free') {
        const amt = Number(r.amount) || 0;
        monthlyRevenue += cycle === 'yearly' ? amt / 12 : amt / 3;
      }
    }
    monthlyRevenue = Math.round(monthlyRevenue);
    return {
      totalCompanies: filtered.length, freeCompanies: free, paidCompanies: paid,
      quarterlyPlans: quarterly, yearlyPlans: yearly, activeSubscriptions: active,
      expiredPlans: expired, monthlyRevenue, annualRevenue: monthlyRevenue * 12,
    };
  }, [filtered]);

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

  const cards = [
    { label: 'Total Companies', value: summary.totalCompanies, icon: <Building2 size={18} />, color: 'bg-brand-600' },
    { label: 'Free Companies', value: summary.freeCompanies, icon: <Users size={18} />, color: 'bg-slate-500' },
    { label: 'Paid Companies', value: summary.paidCompanies, icon: <BadgeCheck size={18} />, color: 'bg-emerald-500' },
    { label: 'Quarterly Plans', value: summary.quarterlyPlans, icon: <CalendarClock size={18} />, color: 'bg-blue-500' },
    { label: 'Yearly Plans', value: summary.yearlyPlans, icon: <CalendarRange size={18} />, color: 'bg-indigo-500' },
    { label: 'Active Subscriptions', value: summary.activeSubscriptions, icon: <BadgeCheck size={18} />, color: 'bg-emerald-600' },
    { label: 'Expired Plans', value: summary.expiredPlans, icon: <AlertTriangle size={18} />, color: 'bg-rose-500' },
    { label: 'Monthly Revenue', value: inr(summary.monthlyRevenue), icon: <Wallet size={18} />, color: 'bg-amber-500' },
    { label: 'Annual Revenue', value: inr(summary.annualRevenue), icon: <TrendingUp size={18} />, color: 'bg-purple-600' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={load} loading={loading}>Refresh</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {cards.map((c) => <StatCard key={c.label} label={c.label} value={c.value ?? '—'} icon={c.icon} color={c.color} />)}
      </div>

      <Card>
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or head…"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-hairline bg-surface text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10" />
          </div>
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="h-10 px-3 rounded-xl border border-hairline bg-surface text-sm outline-none focus:border-brand-500">
            <option value="all">All plans</option>
            {['Free', 'Starter', 'Professional', 'Enterprise', 'Custom'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 px-3 rounded-xl border border-hairline bg-surface text-sm outline-none focus:border-brand-500">
            <option value="all">All statuses</option>
            {['Active', 'Suspended', 'Expired', 'Cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </Card>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <Table>
            <Thead>
              <Tr>
                <Th>Company</Th><Th>Company Head</Th><Th>Employees</Th><Th>Branches</Th>
                <Th>Plan</Th><Th>Cycle</Th><Th>Price/User</Th><Th>Amount</Th><Th>Status</Th><Th>Renewal</Th><Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {loading ? (
                <Tr><Td colSpan={11}><div className="py-10 text-center text-ink-muted text-sm">Loading subscriptions…</div></Td></Tr>
              ) : pageRows.length === 0 ? (
                <Tr><Td colSpan={11}><div className="py-10 text-center text-ink-muted text-sm">No companies match your filters.</div></Td></Tr>
              ) : pageRows.map((r) => (
                <Tr key={r.companyId}>
                  <Td>
                    <div className="font-semibold text-ink">{r.companyName}</div>
                    <div className="text-[11px] text-ink-muted">{r.companyHeadEmail}</div>
                  </Td>
                  <Td><span className="text-ink-secondary">{r.companyHead}</span></Td>
                  <Td className="tabular-nums">{r.employees}</Td>
                  <Td className="tabular-nums">{r.branches}</Td>
                  <Td><Badge variant={PLAN_VARIANT[r.plan] || 'gray'}>{r.plan === 'Custom' && <Crown size={11} />}{r.plan}</Badge></Td>
                  <Td><span className="text-ink-secondary text-[13px]">{r.billingCycle}</span></Td>
                  <Td className="tabular-nums">{r.plan === 'Free' ? '—' : `${inr(r.pricePerEmployee)}`}</Td>
                  <Td className="tabular-nums font-semibold">{inr(r.amount)}</Td>
                  <Td><Badge variant={statusBadge(r.status)} dot>{r.status}</Badge></Td>
                  <Td><span className="text-[13px] text-ink-secondary">{r.renewalDate ? new Date(r.renewalDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span></Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Button size="xs" variant="outline" icon={<Settings2 size={13} />} onClick={() => onManage(r.companyId)}>Manage</Button>
                      <button
                        onClick={() => toggleStatus(r)}
                        disabled={busyId === r.companyId}
                        title={r.status === 'Suspended' ? 'Activate' : 'Suspend'}
                        className={`h-7 w-7 inline-flex items-center justify-center rounded-lg border transition-colors ${r.status === 'Suspended' ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' : 'border-rose-200 text-rose-600 hover:bg-rose-50'} disabled:opacity-50`}
                      >
                        {r.status === 'Suspended' ? <Play size={13} /> : <Ban size={13} />}
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-hairline text-[13px] text-ink-secondary">
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-hairline disabled:opacity-40 hover:bg-surface-muted"><ChevronLeft size={15} /></button>
              <span className="px-2 tabular-nums">{page} / {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-hairline disabled:opacity-40 hover:bg-surface-muted"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default SubscriptionManagement;
