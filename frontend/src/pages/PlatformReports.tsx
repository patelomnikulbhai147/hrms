// ─────────────────────────────────────────────────────────────────────────────
// PlatformReports — the Super Admin Reports module for a SaaS HRMS.
//
// Super Admin is the PLATFORM administrator, not a company HR operator, so this
// view shows ONLY platform-level analytics: company / branch / user / employee
// COUNTS, subscription & revenue, and growth — never company-operational or
// employee-level confidential data (no names, salaries, bank, attendance, leave,
// documents). All numbers come from GET /api/statistics/platform-reports.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2, GitBranch, Users, UserCheck, CreditCard, DollarSign, TrendingUp,
  RefreshCw, FileDown, FileSpreadsheet, ShieldCheck, BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDateTime } from '@/utils/formatDate';
import { exportRowsToExcel, exportRowsToPDF, type ExportColumn } from '@/utils/exportUtils';

interface PlatformReportsData {
  generatedAt: string;
  companies: { total: number; active: number; inactive: number; archived: number; suspended: number; trial: number; newThisMonth: number };
  branches: { total: number; active: number; suspended: number; archived: number; newThisMonth: number };
  users: { total: number; active: number; activeLast30Days: number; superAdmins: number; companyHeads: number; hrManagers: number; finance: number; employees: number };
  employees: { total: number; active: number; inactive: number; joinedThisMonth: number; leftThisMonth: number; newThisMonth: number };
  subscriptions: { active: number; trial: number; expired: number; planDistribution: { plan: string; count: number }[] };
  revenue: { mrr: number; arr: number; currency: string };
  growth: { newCompaniesThisMonth: number; newBranchesThisMonth: number; newUsersThisMonth: number; newEmployeesThisMonth: number };
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <p className="text-[11px] font-semibold text-slate-400">{label}</p>
    <p className={`text-xl font-extrabold ${tone || 'text-slate-800'}`}>{value}</p>
  </div>
);

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
    <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-700">
      <span className="text-[#4F7CFF]">{icon}</span>{title}
    </h3>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
  </div>
);

interface Props { role?: string; }

export const PlatformReports: React.FC<Props> = () => {
  const [data, setData] = useState<PlatformReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await api.statistics.getPlatformReports()); }
    catch (e) { ui.toast.error(getApiErrorMessage(e) || 'Could not load platform reports.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Flatten every metric into one export table (counts/totals only — no PII).
  const exportRows = useMemo(() => {
    if (!data) return [];
    const d = data;
    return [
      ['Companies', 'Total Registered', d.companies.total],
      ['Companies', 'Active', d.companies.active],
      ['Companies', 'Inactive', d.companies.inactive],
      ['Companies', 'Suspended', d.companies.suspended],
      ['Companies', 'Archived', d.companies.archived],
      ['Companies', 'Trial', d.companies.trial],
      ['Companies', 'New This Month', d.companies.newThisMonth],
      ['Branches', 'Total', d.branches.total],
      ['Branches', 'Active', d.branches.active],
      ['Branches', 'Suspended', d.branches.suspended],
      ['Branches', 'Archived', d.branches.archived],
      ['Branches', 'New This Month', d.branches.newThisMonth],
      ['Users', 'Total', d.users.total],
      ['Users', 'Active', d.users.active],
      ['Users', 'Active (30 days)', d.users.activeLast30Days],
      ['Users', 'Super Admins', d.users.superAdmins],
      ['Users', 'Company Heads', d.users.companyHeads],
      ['Users', 'HR Managers', d.users.hrManagers],
      ['Users', 'Finance', d.users.finance],
      ['Users', 'Employees', d.users.employees],
      ['Employees', 'Total', d.employees.total],
      ['Employees', 'Active', d.employees.active],
      ['Employees', 'Inactive / Exited', d.employees.inactive],
      ['Employees', 'Joined This Month', d.employees.joinedThisMonth],
      ['Employees', 'Left This Month', d.employees.leftThisMonth],
      ['Subscriptions', 'Active', d.subscriptions.active],
      ['Subscriptions', 'Trial', d.subscriptions.trial],
      ['Subscriptions', 'Expired / Overdue', d.subscriptions.expired],
      ...d.subscriptions.planDistribution.map(p => ['Subscriptions', `Plan · ${p.plan}`, p.count] as any),
      ['Revenue', 'MRR (Monthly Recurring)', inr(d.revenue.mrr)],
      ['Revenue', 'ARR (Annual Recurring)', inr(d.revenue.arr)],
      ['Growth', 'New Companies This Month', d.growth.newCompaniesThisMonth],
      ['Growth', 'New Branches This Month', d.growth.newBranchesThisMonth],
      ['Growth', 'New Users This Month', d.growth.newUsersThisMonth],
      ['Growth', 'New Employees This Month', d.growth.newEmployeesThisMonth],
    ].map(([category, metric, value]) => ({ category, metric, value }));
  }, [data]);

  const exportColumns: ExportColumn[] = [
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Metric', key: 'metric', width: 32 },
    { header: 'Value', key: 'value', width: 16 },
  ];
  const onPdf = () => { if (exportRows.length) exportRowsToPDF('Platform_Analytics', 'Platform Analytics Report', exportColumns, exportRows, `Generated ${formatDateTime(data?.generatedAt)}`); };
  const onExcel = () => { if (exportRows.length) exportRowsToExcel('Platform_Analytics', exportColumns, exportRows, 'Platform Analytics'); };

  const maxPlan = Math.max(1, ...(data?.subscriptions.planDistribution.map(p => p.count) || [1]));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#DBEAFE] bg-white px-4 py-3 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-800"><BarChart3 size={16} className="text-[#4F7CFF]" /> Platform Analytics</h2>
          <p className="text-[11px] text-slate-400">SaaS platform reports · {data ? `Generated ${formatDateTime(data.generatedAt)}` : 'Loading…'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={load} loading={loading}>Refresh</Button>
          <Button variant="outline" size="sm" icon={<FileSpreadsheet size={14} />} onClick={onExcel} disabled={!data}>Excel</Button>
          <Button size="sm" icon={<FileDown size={14} />} onClick={onPdf} disabled={!data}>Export PDF</Button>
        </div>
      </div>

      {/* Privacy note */}
      <div className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[11px] text-indigo-700">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        Platform-level analytics only. Employee figures are summary counts — no names, salaries, bank, attendance, leave or document details are ever exposed here.
      </div>

      {loading && !data ? (
        <div className="py-20 text-center text-sm text-slate-500">Loading platform analytics…</div>
      ) : !data ? (
        <div className="py-20 text-center text-sm text-rose-600">No data available.</div>
      ) : (
        <>
          <Section title="Company Analytics" icon={<Building2 size={15} />}>
            <Stat label="Total Registered" value={data.companies.total} />
            <Stat label="Active" value={data.companies.active} tone="text-emerald-600" />
            <Stat label="Inactive" value={data.companies.inactive} tone="text-amber-600" />
            <Stat label="Suspended" value={data.companies.suspended} tone="text-orange-600" />
            <Stat label="Archived" value={data.companies.archived} tone="text-slate-500" />
            <Stat label="Trial" value={data.companies.trial} tone="text-indigo-600" />
            <Stat label="New This Month" value={data.companies.newThisMonth} tone="text-[#4F7CFF]" />
          </Section>

          <Section title="Branch Analytics" icon={<GitBranch size={15} />}>
            <Stat label="Total Branches" value={data.branches.total} />
            <Stat label="Active" value={data.branches.active} tone="text-emerald-600" />
            <Stat label="Suspended" value={data.branches.suspended} tone="text-orange-600" />
            <Stat label="Archived" value={data.branches.archived} tone="text-slate-500" />
            <Stat label="New This Month" value={data.branches.newThisMonth} tone="text-[#4F7CFF]" />
          </Section>

          <Section title="User Statistics" icon={<Users size={15} />}>
            <Stat label="Total Users" value={data.users.total} />
            <Stat label="Active" value={data.users.active} tone="text-emerald-600" />
            <Stat label="Active (30 days)" value={data.users.activeLast30Days} tone="text-[#4F7CFF]" />
            <Stat label="Super Admins" value={data.users.superAdmins} />
            <Stat label="Company Heads" value={data.users.companyHeads} />
            <Stat label="HR Managers" value={data.users.hrManagers} />
            <Stat label="Finance" value={data.users.finance} />
            <Stat label="Employee Users" value={data.users.employees} />
          </Section>

          <Section title="Employee Statistics (counts only)" icon={<UserCheck size={15} />}>
            <Stat label="Total Employees" value={data.employees.total} />
            <Stat label="Active" value={data.employees.active} tone="text-emerald-600" />
            <Stat label="Inactive / Exited" value={data.employees.inactive} tone="text-slate-500" />
            <Stat label="Joined This Month" value={data.employees.joinedThisMonth} tone="text-emerald-600" />
            <Stat label="Left This Month" value={data.employees.leftThisMonth} tone="text-rose-600" />
          </Section>

          <Section title="Subscription Reports" icon={<CreditCard size={15} />}>
            <Stat label="Active Subscriptions" value={data.subscriptions.active} tone="text-emerald-600" />
            <Stat label="Trial" value={data.subscriptions.trial} tone="text-indigo-600" />
            <Stat label="Expired / Overdue" value={data.subscriptions.expired} tone="text-rose-600" />
          </Section>

          {/* Plan distribution + Revenue */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-700"><CreditCard size={15} className="text-[#4F7CFF]" /> Plan-wise Distribution</h3>
              {data.subscriptions.planDistribution.length === 0 ? (
                <p className="text-[11px] text-slate-400">No plan data.</p>
              ) : (
                <div className="space-y-2">
                  {data.subscriptions.planDistribution.map(p => (
                    <div key={p.plan}>
                      <div className="mb-0.5 flex items-center justify-between text-[11px] font-semibold text-slate-600"><span>{p.plan}</span><span>{p.count}</span></div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[#4F7CFF]" style={{ width: `${(p.count / maxPlan) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-700"><DollarSign size={15} className="text-emerald-600" /> Revenue (SaaS)</h3>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="MRR · Monthly Recurring" value={inr(data.revenue.mrr)} tone="text-emerald-600" />
                <Stat label="ARR · Annual Recurring" value={inr(data.revenue.arr)} tone="text-emerald-600" />
              </div>
              <p className="mt-3 text-[10px] text-slate-400">Computed from active subscriptions' plan pricing &amp; billing cycle.</p>
            </div>
          </div>

          <Section title="Growth Reports (this month)" icon={<TrendingUp size={15} />}>
            <Stat label="New Companies" value={data.growth.newCompaniesThisMonth} tone="text-[#4F7CFF]" />
            <Stat label="New Branches" value={data.growth.newBranchesThisMonth} tone="text-[#4F7CFF]" />
            <Stat label="New Users" value={data.growth.newUsersThisMonth} tone="text-[#4F7CFF]" />
            <Stat label="New Employees" value={data.growth.newEmployeesThisMonth} tone="text-[#4F7CFF]" />
          </Section>
        </>
      )}
    </div>
  );
};

export default PlatformReports;
