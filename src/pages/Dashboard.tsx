import React, { useMemo, useState, useEffect } from 'react';
import {
  Building2, AlertCircle, FileText, CheckCircle2, Clock, Info,
  Search, Bell, DollarSign, Sparkles, ChevronRight, Users
} from 'lucide-react';
import {
  type Role,
  type Company,
  type Employee,
  type AttendanceRecord,
  type LeaveRequest,
  type PayrollRecord,
  type Document,
  type SubscriptionPlan,
  type Notification,
  isCompanyIdMatch
} from '../data/mockData';
import { deriveCompanyPayrollStatus } from '../utils/payroll';
import {
  calculateSubscriptionAnalytics,
  getSubscriptionAlertsList,
  getDaysRemaining
} from '../utils/subscriptionUtils';
import { Card, StatCard } from '../components/ui/Card';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie
} from 'recharts';

interface DashboardProps {
  role: Role;
  onNavigate: (page: any) => void;
  activeCompanyId: string;
  onStartMasquerade: (companyId: string) => void;
  companies: Company[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  payroll: PayrollRecord[];
  documents: Document[];
  plans: SubscriptionPlan[];
  notifications: Notification[];
  onUpdateNotifications: (updater: Notification[] | ((prev: Notification[]) => Notification[])) => void;
  onUpdateCompanies?: (updater: Company[] | ((prev: Company[]) => Company[])) => void;
  onUpdatePayments?: (updater: any[] | ((prev: any[]) => any[])) => void;
  onUpdateEmployees?: (updater: Employee[] | ((prev: Employee[]) => Employee[])) => void;
  onUpdatePayroll?: (updater: PayrollRecord[] | ((prev: PayrollRecord[]) => PayrollRecord[])) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  role,
  onNavigate,
  activeCompanyId,
  onStartMasquerade,
  companies,
  employees,
  attendance,
  leaves,
  payroll,
  documents,
  plans,
  notifications: _notifications,
  onUpdateNotifications,
  onUpdateCompanies,
  onUpdatePayments
}) => {
  const todayStr = '2026-05-20'; // Anchor mock date

  // Toast feedback state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [rosterTab, setRosterTab] = useState<'Joined' | 'On Leave' | 'Pending Exit'>('Joined');

  // Scoped Data for Company Head / HR roles (supports parent company rollup and local branches)
  const scopedEmployees = employees.filter(e => isCompanyIdMatch(e.companyId, activeCompanyId, companies));
  const scopedAttendance = attendance.filter(a => a.date === todayStr && isCompanyIdMatch(a.companyId, activeCompanyId, companies));
  const scopedPayroll = payroll.filter(p => isCompanyIdMatch(p.companyId, activeCompanyId, companies));
  const scopedDocs = documents.filter(d => isCompanyIdMatch(d.companyId, activeCompanyId, companies));


  const daysLeft = (dateStr?: string) => {
    const diff = getDaysRemaining(dateStr);
    return diff === null ? Infinity : diff;
  };

  // ─── Super Admin Calculations ───
  const analytics = useMemo(() => {
    return calculateSubscriptionAnalytics(companies, plans);
  }, [companies, plans]);

  const totalCompaniesCount = analytics.totalCompanies;
  const activeSubscriptionsCount = analytics.activeSubscriptions;
  const pendingRenewalsCount = analytics.pendingRenewals;
  const monthlyRevenueVal = analytics.monthlyRevenue;
  const expiringThisWeekCount = analytics.expiringPlans;

  // Filter renewal list items
  const renewalAlertsList = useMemo(() => {
    const rawAlerts = getSubscriptionAlertsList(companies);
    return rawAlerts
      .map(alert => {
        const remaining = alert.daysRemaining ?? 0;
        let expiryText = '';
        let statusText: 'Active' | 'Warning' | 'Expired' | 'Trial' = 'Active';
        let actionLabel = 'Renew';

        if (alert.type === 'Suspended') {
          expiryText = 'Suspended';
          statusText = 'Expired';
        } else if (alert.type === 'Overdue') {
          expiryText = remaining < 0 ? 'Expired' : 'Overdue';
          statusText = 'Expired';
          actionLabel = alert.company.paymentStatus === 'Pending' ? 'Verify' : 'Upgrade';
        } else if (alert.type === 'Trial Ending') {
          expiryText = `${remaining}d left`;
          statusText = 'Trial';
        } else if (alert.type === 'Expiring Soon') {
          expiryText = `${remaining} days left`;
          statusText = 'Warning';
        }

        return {
          company: alert.company,
          remaining,
          expiryText,
          statusText,
          actionLabel
        };
      })
      .sort((a, b) => a.remaining - b.remaining);
  }, [companies]);

  // Renewal Alert Handlers
  const handleRenew = (companyId: string) => {
    const target = companies.find(c => c.id === companyId);
    if (!target) return;
    const updated = companies.map(c => {
      if (c.id !== companyId) return c;
      const baseDate = c.renewalDate ? new Date(c.renewalDate + 'T00:00:00') : new Date('2026-05-20');
      const todayVal = new Date('2026-05-20');
      const base = baseDate.getTime() < todayVal.getTime() ? todayVal : baseDate;
      const next = new Date(base);
      if (c.billingCycle === 'Yearly') next.setFullYear(next.getFullYear() + 1);
      else next.setMonth(next.getMonth() + 1);
      return { ...c, paymentStatus: 'Paid' as const, renewalDate: next.toISOString().split('T')[0], accountStatus: 'Active' as const, status: 'Active' as const };
    });
    onUpdateCompanies?.(updated);

    // Audit payment transaction
    const planObj = plans.find(p => p.name === target.plan);
    const price = planObj ? (target.billingCycle === 'Yearly' ? planObj.priceYearly : planObj.priceMonthly) : (target.subscriptionPrice || 0);
    const payment = {
      id: `tx-${Date.now()}`,
      companyId: target.id,
      companyName: target.name,
      amount: price,
      paymentDate: '2026-05-20 12:00',
      invoiceNumber: `INV-2026-${Math.floor(100 + Math.random() * 900)}`,
      planType: target.plan,
      paymentMode: 'Manual' as const,
      transactionStatus: 'Success' as const
    };
    onUpdatePayments?.((prev: any[]) => [payment, ...(prev || [])]);
    showToast(`Subscription successfully renewed for ${target.name}! Invoice recorded.`, 'success');
  };

  const handleSendReminder = (companyId: string) => {
    const target = companies.find(c => c.id === companyId);
    if (!target) return;
    showToast(`Renewal reminder dispatch email successfully sent to ${target.adminName} (${target.adminEmail})!`, 'info');
  };

  const handleSuspend = (companyId: string) => {
    const target = companies.find(c => c.id === companyId);
    if (!target) return;
    const updated = companies.map(c => {
      if (c.id === companyId) {
        return { ...c, accountStatus: 'Suspended' as const, status: 'Inactive' as const, paymentStatus: 'Expired' as const };
      }
      return c;
    });
    onUpdateCompanies?.(updated);
    showToast(`Access suspended for ${target.name} due to license expiration.`, 'warning');
  };

  // Search & Filter Side Card
  const [latestSearch, setLatestSearch] = useState('');
  const [latestFilter, setLatestFilter] = useState<'All' | 'Active' | 'Expired' | 'Trial' | 'Enterprise'>('All');

  const filteredLatestCompanies = useMemo(() => {
    return companies
      .filter(c => {
        const matchSearch = c.name.toLowerCase().includes(latestSearch.toLowerCase()) || c.adminName.toLowerCase().includes(latestSearch.toLowerCase());
        const isExpired = c.paymentStatus === 'Expired' || c.paymentStatus === 'Overdue' || daysLeft(c.renewalDate) < 0;

        if (latestFilter === 'All') return matchSearch;
        if (latestFilter === 'Active') return matchSearch && c.accountStatus === 'Active' && c.paymentStatus === 'Paid';
        if (latestFilter === 'Expired') return matchSearch && isExpired;
        if (latestFilter === 'Trial') return matchSearch && c.paymentStatus === 'Trial Active';
        if (latestFilter === 'Enterprise') return matchSearch && c.plan === 'Enterprise';
        return matchSearch;
      })
      .sort((a, b) => new Date(b.joinDate).getTime() - new Date(a.joinDate).getTime())
      .slice(0, 5);
  }, [companies, latestSearch, latestFilter]);

  // Revenue Overview Chart Data (Computed dynamic MRR from plans state)
  const revenueChartData = useMemo(() => {
    const counts = { Starter: 0, Professional: 0, Enterprise: 0 };
    const sums = { Starter: 0, Professional: 0, Enterprise: 0 };
    companies.filter(c => !c.parentCompanyId).forEach(c => {
      if (c.accountStatus === 'Active' && (c.paymentStatus === 'Paid' || c.paymentStatus === 'Trial Active')) {
        const planObj = plans.find(p => p.name === c.plan);
        const cost = planObj ? (c.billingCycle === 'Yearly' ? Math.round(planObj.priceYearly / 12) : planObj.priceMonthly) : (c.subscriptionPrice || 0);
        if (c.plan === 'Starter' || c.plan === 'Professional' || c.plan === 'Enterprise') {
          counts[c.plan]++;
          sums[c.plan] += cost;
        }
      }
    });
    return [
      { name: 'Starter', 'MRR (₹)': sums.Starter, Clients: counts.Starter },
      { name: 'Professional', 'MRR (₹)': sums.Professional, Clients: counts.Professional },
      { name: 'Enterprise', 'MRR (₹)': sums.Enterprise, Clients: counts.Enterprise }
    ];
  }, [companies, plans]);

  // Company Active vs Expired Breakdown
  const statusPieData = useMemo(() => {
    let active = 0;
    let expired = 0;
    let trial = 0;
    let suspended = 0;
    companies.filter(c => !c.parentCompanyId).forEach(c => {
      const daysRemaining = getDaysRemaining(c.renewalDate);
      if (c.accountStatus === 'Suspended') suspended++;
      else if (c.paymentStatus === 'Expired' || c.paymentStatus === 'Overdue' || (daysRemaining !== null && daysRemaining < 0)) expired++;
      else if (c.paymentStatus === 'Trial Active') trial++;
      else active++;
    });
    return [
      { name: 'Active', value: active, color: '#10b981' },
      { name: 'Trial', value: trial, color: '#64748b' },
      { name: 'Expired', value: expired, color: '#ef4444' },
      { name: 'Suspended', value: suspended, color: '#f59e0b' }
    ];
  }, [companies]);



  // Status Badge variant resolver
  const getSimpleBadgeVariant = (statusText: 'Active' | 'Warning' | 'Expired' | 'Trial') => {
    switch (statusText) {
      case 'Active': return 'green';
      case 'Warning': return 'yellow';
      case 'Expired': return 'red';
      case 'Trial': return 'gray';
      default: return 'gray';
    }
  };



  // ─── Super Admin Dashboard Overhaul ───
  if (role === 'Super Admin') {
    return (
      <div className="space-y-6 relative pb-10">

        {/* Dynamic Expiring Notification Toast Banner */}
        {expiringThisWeekCount > 0 && (
          <div className="bg-indigo-600/10 border border-indigo-200 backdrop-blur-md rounded-2xl p-4.5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600/15 rounded-xl text-indigo-700">
                <Bell size={18} className="animate-bounce" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  Subscription Notice <Sparkles size={13} className="text-amber-500" />
                </h4>
                <p className="text-xs text-gray-600 mt-0.5">
                  Workspaces require active licenses. There are <strong>{expiringThisWeekCount} subscriptions</strong> nearing expiration within 10 days.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const el = document.getElementById('renewal-alerts-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1"
            >
              Resolve Expirations
            </button>
          </div>
        )}

        {/* Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">SaaS Control Center</h1>
            <p className="text-sm text-gray-500 mt-0.5">Central subscription intelligence, real-time renewals, and client onboarding</p>
          </div>
          <div className="text-xs font-semibold px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-700 flex items-center gap-1.5 shadow-sm">
            <Clock size={13} />
            <span>Mock System Time: 2026-05-20 18:50</span>
          </div>
        </div>

        {/* Dynamic Metric Cards (Top cards keeping only important) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="bg-white rounded-2xl border border-gray-150 shadow-xs p-5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Companies</span>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Building2 size={18} />
              </div>
            </div>
            <div className="mt-3.5">
              <h3 className="text-3xl font-extrabold text-gray-900 tracking-tight">{totalCompaniesCount}</h3>
              <p className="text-xs text-gray-500 mt-1">Tenant spaces registered</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-150 shadow-xs p-5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Branches</span>
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Building2 size={18} />
              </div>
            </div>
            <div className="mt-3.5">
              <h3 className="text-3xl font-extrabold text-gray-900 tracking-tight">{analytics.totalBranches}</h3>
              <p className="text-xs text-gray-500 mt-1">Subsidiaries managed</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-150 shadow-xs p-5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Combined Employees</span>
              <div className="p-2.5 bg-violet-50 text-violet-600 rounded-xl">
                <Users size={18} />
              </div>
            </div>
            <div className="mt-3.5">
              <h3 className="text-3xl font-extrabold text-gray-900 tracking-tight">{employees.length}</h3>
              <p className="text-xs text-gray-500 mt-1">Total active workforce</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-150 shadow-xs p-5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Active Subscriptions</span>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle2 size={18} />
              </div>
            </div>
            <div className="mt-3.5">
              <h3 className="text-3xl font-extrabold text-gray-900 tracking-tight">{activeSubscriptionsCount}</h3>
              <p className="text-xs text-emerald-600 font-semibold mt-1">✓ Active Paid & Trial Spaces</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-150 shadow-xs p-5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Renewals Due</span>
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                <AlertCircle size={18} />
              </div>
            </div>
            <div className="mt-3.5">
              <h3 className="text-3xl font-extrabold text-gray-900 tracking-tight">{pendingRenewalsCount}</h3>
              <p className="text-xs text-amber-600 font-semibold mt-1">⚠ Overdue / Pending</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-150 shadow-xs p-5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Monthly Revenue</span>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <DollarSign size={18} />
              </div>
            </div>
            <div className="mt-3.5">
              <h3 className="text-3xl font-extrabold text-gray-900 tracking-tight">₹{monthlyRevenueVal.toLocaleString('en-IN')}</h3>
              <p className="text-xs text-gray-500 mt-1">MRR (Synced from plan prices)</p>
            </div>
          </div>
        </div>

        {/* Premium Split Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

          {/* LEFT SIDE (Stats, Graphs, Renewal Alerts) */}
          <div className="lg:col-span-8 space-y-5">

            {/* Revenue Overview Cards & Graphs */}
            <Card className="rounded-2xl border border-gray-150 shadow-xs p-6 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-base font-extrabold text-gray-900">Revenue & Status Overview</h3>
                  <p className="text-xs text-gray-500 mt-0.5">SaaS monthly subscription distributions & company state</p>
                </div>
                <div className="text-left sm:text-right bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-1.5">
                  <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Total Projected MRR</div>
                  <div className="text-sm font-extrabold text-indigo-700">₹{monthlyRevenueVal.toLocaleString('en-IN')}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">

                {/* Bar Chart of Monthly Revenue */}
                <div className="md:col-span-8">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">MRR by Plan (₹)</span>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: 'rgba(79, 70, 229, 0.04)' }} contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="MRR (₹)" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={35} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Pie Chart of status distributions */}
                <div className="md:col-span-4 flex flex-col items-center border-t md:border-t-0 md:border-l border-gray-150 pt-5 md:pt-0 md:pl-5">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3 w-full text-left md:text-center">License States</span>
                  <div className="h-[120px] w-[120px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={36}
                          outerRadius={50}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {statusPieData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-extrabold text-gray-800">{totalCompaniesCount}</span>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Clients</span>
                    </div>
                  </div>

                  <div className="mt-4 w-full space-y-1.5">
                    {statusPieData.map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-gray-500 font-medium">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                          <span>{d.name}</span>
                        </div>
                        <span className="font-extrabold text-gray-850">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </Card>

            {/* Renewal Alerts Table Section */}
            <Card id="renewal-alerts-section" className="rounded-2xl border border-gray-150 shadow-xs p-6 bg-white overflow-hidden">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-base font-extrabold text-gray-900">Renewal Alerts & License Control</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Actions to renew, remind, or restrict expiring corporate tenants</p>
                </div>
                <button
                  onClick={() => onNavigate('billing')}
                  className="px-3.5 py-1.5 border border-indigo-100 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                >
                  Subscription Panel
                </button>
              </div>

              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-150 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      <th className="py-3 px-6">Company</th>
                      <th className="py-3 px-6">Plan</th>
                      <th className="py-3 px-6">Expiry</th>
                      <th className="py-3 px-6">Status</th>
                      <th className="py-3 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs text-gray-600 bg-white">
                    {renewalAlertsList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 px-6 text-center text-sm text-gray-400 font-medium">
                          🎉 Excellent! No clients expiring in the next 15 days
                        </td>
                      </tr>
                    ) : (
                      renewalAlertsList.map(({ company, expiryText, statusText, actionLabel }) => (
                        <tr key={company.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-xs" style={{ backgroundColor: company.primaryColor || '#4f46e5' }}>
                                {company.logo}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900 text-xs">{company.name}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{company.domain}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-6">
                            <span className="font-semibold text-gray-800">{company.plan}</span>
                            <span className="text-[10px] text-gray-400 block mt-0.5">{company.billingCycle}</span>
                          </td>
                          <td className="py-3.5 px-6 font-semibold">
                            <span className={statusText === 'Expired' ? 'text-red-500' : (statusText === 'Warning' ? 'text-amber-500 animate-pulse' : 'text-gray-700')}>{expiryText}</span>
                            <span className="text-[10px] text-gray-400 block font-normal mt-0.5">{company.renewalDate}</span>
                          </td>
                          <td className="py-3.5 px-6">
                            <Badge variant={getSimpleBadgeVariant(statusText)}>{statusText}</Badge>
                          </td>
                          <td className="py-3.5 px-6 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => handleRenew(company.id)}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition-all shadow-xs flex items-center gap-1"
                              >
                                {actionLabel}
                              </button>
                              <button
                                onClick={() => handleSendReminder(company.id)}
                                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1"
                              >
                                Remind
                              </button>
                              {company.accountStatus !== 'Suspended' && (
                                <button
                                  onClick={() => handleSuspend(company.id)}
                                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1"
                                >
                                  Restrict
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* RIGHT SIDE (Latest Companies List, Quick Actions) */}
          <div className="lg:col-span-4 space-y-5">

            {/* Latest Companies list */}
            <Card className="rounded-2xl border border-gray-150 shadow-xs p-5 bg-white">
              <div className="mb-4">
                <h3 className="text-base font-extrabold text-gray-900">Latest Companies</h3>
                <p className="text-xs text-gray-500 mt-0.5">Most recent onboarded clients</p>
              </div>

              {/* Quick Search & Filters */}
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={latestSearch}
                    onChange={e => setLatestSearch(e.target.value)}
                    placeholder="Search company..."
                    className="w-full pl-8.5 pr-3 py-1.5 border border-gray-200 rounded-xl text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-gray-50/50"
                  />
                </div>

                <div className="flex flex-wrap gap-1">
                  {(['All', 'Active', 'Expired', 'Trial', 'Enterprise'] as const).map(tag => (
                    <button
                      key={tag}
                      onClick={() => setLatestFilter(tag)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${latestFilter === tag
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table / List */}
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {filteredLatestCompanies.length === 0 ? (
                  <p className="text-xs text-gray-400 py-6 text-center">No companies found</p>
                ) : (
                  filteredLatestCompanies.map(c => {
                    const isExp = c.paymentStatus === 'Expired' || c.paymentStatus === 'Overdue' || daysLeft(c.renewalDate) < 0;
                    const computedStatusText = c.accountStatus === 'Suspended' ? 'Expired' : (isExp ? 'Expired' : (c.paymentStatus === 'Trial Active' ? 'Trial' : 'Active'));

                    return (
                      <div key={c.id} className="p-3 border border-gray-100 hover:border-gray-200 bg-white rounded-xl shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-between gap-3">
                        <div className="grow min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900 truncate">{c.name}</span>
                            <Badge variant={getSimpleBadgeVariant(computedStatusText)} className="scale-90 origin-left">{computedStatusText}</Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-1">
                            <span>{c.plan}</span>
                            <span>•</span>
                            <span className="text-indigo-650 font-semibold">{employees.filter(e => e.companyId === c.id).length} Staff</span>
                            <span>•</span>
                            <span>Onboard: {c.joinDate}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => onStartMasquerade(c.id)}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold flex items-center gap-0.5 shrink-0 transition-colors"
                        >
                          Control
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>



          </div>
        </div>

        {/* Global Toast component */}
        {toast && (
          <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4.5 py-3 rounded-xl shadow-lg border transition-all duration-300 transform translate-y-0 ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-250 text-emerald-800' :
            toast.type === 'warning' ? 'bg-rose-50 border-rose-250 text-rose-800' :
              'bg-blue-50 border-blue-250 text-blue-800'
            }`}>
            {toast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />}
            {toast.type === 'warning' && <AlertCircle size={16} className="text-rose-500 flex-shrink-0" />}
            {toast.type === 'info' && <Info size={16} className="text-blue-500 flex-shrink-0" />}
            <span className="text-xs font-bold">{toast.message}</span>
          </div>
        )}

      </div>
    );
  }

  // ─── Company Head Dashboard (Corporate Operations Control) ───
  if (role === 'Company Head') {
    const totalEmployees = scopedEmployees.length;
    const activeEmployeesCount = scopedEmployees.filter(e => e.status === 'Active').length;

    const branches = companies.filter(b => b.parentCompanyId === 'c-gcri');
    const isParentCompany = activeCompanyId === 'c-gcri';

    const [selectedAudience, setSelectedAudience] = useState(isParentCompany ? 'all-gcri' : 'branch');
    const [selectedBranch, setSelectedBranch] = useState(isParentCompany ? 'c-ahmedabad' : activeCompanyId);
    const [selectedDept, setSelectedDept] = useState('all');
    const [selectedRole, setSelectedRole] = useState('all');

    // Filter leaves for this company (supports parent + branches)
    const scopedLeaves = leaves.filter(l => isCompanyIdMatch(l.companyId, activeCompanyId, companies));

    // Employees on leave today
    const onLeaveToday = scopedEmployees.filter(e => {
      if (e.status === 'On Leave') return true;
      return scopedLeaves.some(l => 
        l.employeeId === e.id && 
        l.status === 'Approved' && 
        todayStr >= l.fromDate && 
        todayStr <= l.toDate
      );
    }).length;

    // Attendance pending today: Active employees who have not clocked in, and are not on leave today
    const attendancePending = scopedEmployees.filter(e => {
      if (e.status !== 'Active') return false;
      const hasAttendance = scopedAttendance.some(a => a.employeeId === e.id);
      if (hasAttendance) return false;
      const isOnLeave = scopedLeaves.some(l => 
        l.employeeId === e.id && 
        l.status === 'Approved' && 
        todayStr >= l.fromDate && 
        todayStr <= l.toDate
      );
      return !isOnLeave;
    }).length;

    // Department Distribution (active only)
    const deptCounts = scopedEmployees.filter(e => e.status === 'Active').reduce((acc, emp) => {
      const dept = emp.department || 'Other';
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topDepartments = Object.entries(deptCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Joined Roster feed
    const joinedRoster = [...scopedEmployees]
      .filter(e => e.status === 'Active')
      .sort((a, b) => b.joinDate.localeCompare(a.joinDate));

    // On Leave Roster
    const onLeaveRoster = scopedEmployees.filter(e => {
      if (e.status === 'On Leave') return true;
      return scopedLeaves.some(l => 
        l.employeeId === e.id && 
        l.status === 'Approved' && 
        todayStr >= l.fromDate && 
        todayStr <= l.toDate
      );
    });

    // Pending Exit Roster
    const pendingExitRoster = scopedEmployees.filter(e => e.status === 'Inactive' || e.exitDate);

    // Filtered list
    const activeTabRoster = rosterTab === 'Joined' 
      ? joinedRoster 
      : rosterTab === 'On Leave' 
      ? onLeaveRoster 
      : pendingExitRoster;

    const filteredRosterList = activeTabRoster;

    const companyPayrollStatus = deriveCompanyPayrollStatus(activeCompanyId, payroll);
    const payrollStatusStr = companyPayrollStatus.status ? companyPayrollStatus.label : 'No Payroll';

    const handleSendBroadcast = () => {
      if (!broadcastMsg.trim()) {
        showToast('Please type a message to broadcast.', 'warning');
        return;
      }

      // Calculate Human-readable Audience stamp & scopes
      let audienceDesc = '';
      let targetBranchId = activeCompanyId;
      let targetBranchName = 'All';

      if (selectedAudience === 'all-gcri') {
        audienceDesc = 'All GCRI Staff';
        targetBranchId = 'c-gcri';
        targetBranchName = 'All';
      } else if (selectedAudience === 'branch') {
        const brId = isParentCompany ? selectedBranch : activeCompanyId;
        const brObj = companies.find(c => c.id === brId);
        targetBranchId = brId;
        targetBranchName = brObj ? (brObj.branchName || brObj.name) : 'Branch';
        audienceDesc = `${targetBranchName} Branch Staff`;
      } else if (selectedAudience === 'role-medical') {
        audienceDesc = 'Doctors & Medical Staff';
      } else if (selectedAudience === 'role-nursing') {
        audienceDesc = 'Nursing & Clinical Staff';
      } else if (selectedAudience === 'role-admin') {
        audienceDesc = 'Administrative & Support Staff';
      }

      if (selectedDept !== 'all') {
        audienceDesc += ` (${selectedDept} Dept)`;
      }
      if (selectedRole !== 'all') {
        audienceDesc += ` [Category: ${selectedRole}]`;
      }

      const newNotif = {
        id: `notif-${Date.now()}`,
        companyId: activeCompanyId,
        branchId: targetBranchId,
        branchName: targetBranchName,
        targetAudience: audienceDesc,
        type: 'company',
        message: `Broadcast: ${broadcastMsg}`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        read: false,
        priority: 'high'
      } as any as Notification;

      onUpdateNotifications(prev => [newNotif, ...prev]);
      showToast(`Broadcast dispatch logged for: ${audienceDesc}!`, 'success');
      setBroadcastMsg('');
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Corporate Operations Control</h2>
            <p className="text-xs text-gray-500 mt-0.5">Control company attendance logs, payroll calculations, and standard settings</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Payroll Status:</span>
            <Badge variant={(companyPayrollStatus.status === 'paid' || companyPayrollStatus.status === 'payslip_generated') ? 'green' : 'amber'}>{payrollStatusStr}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Total Employees"
            value={totalEmployees}
            icon={<Building2 size={16} className="text-indigo-600" />}
            color="bg-indigo-50"
            sub="Registered in directory"
          />
          <StatCard
            label="Active Employees"
            value={activeEmployeesCount}
            icon={<CheckCircle2 size={16} className="text-emerald-600" />}
            color="bg-emerald-50"
            sub="Active contract roster"
          />
          <StatCard
            label="On Leave Today"
            value={onLeaveToday}
            icon={<Clock size={16} className="text-amber-600" />}
            color="bg-amber-50"
            sub="Approved leave schedule"
          />
          <StatCard
            label="Attendance Pending"
            value={attendancePending}
            icon={<AlertCircle size={16} className="text-rose-600" />}
            color="bg-rose-50"
            sub="Awaiting clock-in today"
          />
        </div>

        {isParentCompany && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Branch Staff allocations */}
            <Card className="lg:col-span-5">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100 flex items-center gap-1.5">
                <Building2 size={14} className="text-indigo-650" />
                <span>Branch-wise Staff Allocation</span>
              </h3>
              <div className="space-y-4">
                {branches.map(b => {
                  const count = employees.filter(emp => emp.companyId === b.id).length;
                  const pct = totalEmployees > 0 ? (count / totalEmployees) * 100 : 0;
                  return (
                    <div key={b.id} className="group">
                      <div className="flex justify-between text-[11px] font-bold mb-1">
                        <span className="text-gray-800 font-semibold">{b.branchName || b.name}</span>
                        <span className="text-indigo-700 font-extrabold">{count} Staff ({Math.round(pct)}%)</span>
                      </div>
                      <div className="w-full bg-gray-150 h-2 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Branch Payroll Rollups */}
            <Card padding={false} className="lg:col-span-7">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign size={14} className="text-emerald-650" />
                  <span>Branch Payroll Rollup Analytics</span>
                </h3>
                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-extrabold">Consolidated Financials</span>
              </div>
              <Table>
                <Thead>
                  <tr className="text-[10px]">
                    <Th>Branch Location</Th>
                    <Th>Staff Count</Th>
                    <Th>Processed Payroll</Th>
                    <Th>Status</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {branches.map(b => {
                    const count = employees.filter(emp => emp.companyId === b.id).length;
                    const branchPayroll = payroll.filter(p => p.companyId === b.id);
                    const totalSalary = branchPayroll.reduce((sum, p) => sum + (p.netSalary || 0), 0);
                    const derivedStatus = deriveCompanyPayrollStatus(b.id, payroll);

                    return (
                      <Tr key={b.id} className="hover:bg-slate-50/50">
                        <Td>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded text-[9px] font-sans">
                              {b.branchCode || 'BR'}
                            </span>
                            <span className="font-semibold text-gray-900">{b.branchName || b.name}</span>
                          </div>
                        </Td>
                        <Td><span className="text-xs font-bold text-slate-700">{count} staff members</span></Td>
                        <Td><span className="text-xs font-extrabold text-slate-800">₹{totalSalary.toLocaleString('en-IN')}</span></Td>
                        <Td>
                          <Badge variant={derivedStatus.status ? 'green' : 'yellow'}>
                            {derivedStatus.status ? 'Processed' : 'Draft'}
                          </Badge>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <Card padding={false}>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div>
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Workforce Analytics & Roster Insights</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Real-time branch statistics, department spread, and dynamic joinees feed</p>
                </div>
                <button onClick={() => onNavigate('employees')} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 transition-colors">
                  <span>View Full Directory</span>
                  <ChevronRight size={12} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-gray-100 min-h-[300px]">
                {/* LEFT SIDE: Employee Feed & Tabs (Columns: 3/5) */}
                <div className="md:col-span-3 p-4 flex flex-col justify-between">
                  <div>
                    {/* Tab Selection */}
                    <div className="flex items-center gap-1.5 border-b border-gray-100 pb-2 mb-3.5">
                      {(['Joined', 'On Leave', 'Pending Exit'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setRosterTab(tab)}
                          className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${
                            rosterTab === tab
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    {/* Compact Roster Feed List */}
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {filteredRosterList.length === 0 ? (
                        <div className="text-center py-12 text-xs text-gray-400 font-medium">
                          No employees matching filter criteria
                        </div>
                      ) : (
                        filteredRosterList.slice(0, 5).map((e) => (
                          <div
                            key={e.id}
                            className="flex items-center justify-between p-2.5 hover:bg-slate-50 rounded-xl transition-all border border-slate-100 bg-white"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-650 font-sans flex-shrink-0">
                                {e.name.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-800 truncate">{e.name}</p>
                                <p className="text-[10px] text-gray-450 truncate">
                                  {e.designation} • <span className="font-semibold text-gray-500">{e.branchLocation || e.location || 'Ahmedabad'}</span>
                                </p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 pl-2">
                              {rosterTab === 'Joined' && (
                                <span className="text-[9px] px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded">
                                  Joined {e.joinDate}
                                </span>
                              )}
                              {rosterTab === 'On Leave' && (
                                <span className="text-[9px] px-2 py-0.5 bg-amber-50 text-amber-700 font-bold rounded">
                                  Absence Logged
                                </span>
                              )}
                              {rosterTab === 'Pending Exit' && (
                                <span className="text-[9px] px-2 py-0.5 bg-rose-50 text-rose-700 font-bold rounded">
                                  Exit Pending
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {filteredRosterList.length > 5 && (
                    <button
                      onClick={() => onNavigate('employees')}
                      className="w-full mt-3 text-center text-[9px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-wider py-1.5 border-t border-gray-150"
                    >
                      View All {filteredRosterList.length} Roster Records
                    </button>
                  )}
                </div>

                {/* RIGHT SIDE: Dynamic Insights & Department Distribution (Columns: 2/5) */}
                <div className="md:col-span-2 p-4 bg-slate-50/30 flex flex-col justify-center">
                  {/* Department distribution */}
                  <div className="space-y-3.5">
                    <div className="border-b border-gray-100 pb-2">
                      <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                        Department Spread
                      </h4>
                      <p className="text-[8px] text-gray-400 mt-0.5">Distribution across key corporate divisions</p>
                    </div>
                    <div className="space-y-3">
                      {topDepartments.map((dept) => {
                        const pct = activeEmployeesCount > 0 ? (dept.count / activeEmployeesCount) * 100 : 0;
                        return (
                          <div key={dept.name} className="group">
                            <div className="flex justify-between text-[9px] font-bold mb-1">
                              <span className="text-gray-700 truncate max-w-[120px] transition-colors group-hover:text-indigo-600">{dept.name}</span>
                              <span className="text-gray-450">{dept.count} ({Math.round(pct)}%)</span>
                            </div>
                            <div className="w-full bg-gray-150 h-1.5 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${pct}%` }}
                                className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100 flex items-center gap-1">
              <Bell size={13} className="text-indigo-600" />
              <span>Send Broadcast Notification</span>
            </h3>
            <div className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                  Target Audience Scope
                </label>
                <select
                  value={selectedAudience}
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedAudience(val);
                    if (val === 'all-gcri') {
                      setSelectedBranch('all');
                    } else if (val === 'branch') {
                      if (!isParentCompany) {
                        setSelectedBranch(activeCompanyId);
                      } else {
                        setSelectedBranch('c-ahmedabad');
                      }
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none bg-gray-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-sans"
                >
                  {isParentCompany && (
                    <option value="all-gcri">GCRI (All Staff across all centers)</option>
                  )}
                  {isParentCompany ? (
                    <optgroup label="GCRI Subsidiaries & Branches">
                      <option value="branch">Select Specific Branch Staff</option>
                    </optgroup>
                  ) : (
                    <option value="branch">My Local Branch Staff Only</option>
                  )}
                  <optgroup label="Role / Category Scope">
                    <option value="role-medical">Doctors & Medical Staff</option>
                    <option value="role-nursing">Nursing & Clinical Staff</option>
                    <option value="role-admin">Administrative & Support Staff</option>
                  </optgroup>
                </select>
              </div>

              {selectedAudience === 'branch' && isParentCompany && (
                <div className="animate-fade-in text-left">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                    Target Branch Regional Center
                  </label>
                  <select
                    value={selectedBranch}
                    onChange={e => setSelectedBranch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none bg-gray-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-sans font-medium"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.branchName || b.name} ({b.branchCode || 'BR'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-left">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                    Target Department
                  </label>
                  <select
                    value={selectedDept}
                    onChange={e => setSelectedDept(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none bg-gray-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-sans"
                  >
                    <option value="all">All Departments</option>
                    {topDepartments.map(d => (
                      <option key={d.name} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                    Target Role Category
                  </label>
                  <select
                    value={selectedRole}
                    onChange={e => setSelectedRole(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none bg-gray-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-sans"
                  >
                    <option value="all">All Categories</option>
                    <option value="Doctor">Doctors Only</option>
                    <option value="Nurse">Nursing Only</option>
                    <option value="Admin">Admin Staff Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                  Notification Message
                </label>
                <textarea
                  value={broadcastMsg}
                  onChange={e => setBroadcastMsg(e.target.value)}
                  placeholder="Type broadcast message to all scoped roster devices..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white resize-none"
                />
              </div>

              <button
                onClick={handleSendBroadcast}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                <Bell size={13} />
                <span>Dispatch Broadcast</span>
              </button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ─── HR Dashboard (HR Operations Dashboard) ───
  const biometricsUploadCount = attendance.filter(a => a.companyId === activeCompanyId).length;
  const pendingDocsCount = scopedDocs.filter(d => d.status === 'Pending').length;
  const activePayrollEntriesCount = scopedPayroll.length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">HR Operations Dashboard</h2>
        <p className="text-xs text-gray-500 mt-0.5">Biometrics logs upload, employee credentials verification, and contract draft generators</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Attendance Biometrics Records"
          value={biometricsUploadCount}
          icon={<Clock size={16} className="text-indigo-600" />}
          color="bg-indigo-50"
          sub="Biometric log uploads logged"
        />
        <StatCard
          label="Pending Doc Verifications"
          value={pendingDocsCount}
          icon={<AlertCircle size={16} className="text-amber-600" />}
          color="bg-amber-50"
          sub="Aadhaar/PAN pending validations"
        />
        <StatCard
          label="Payroll Active Entries"
          value={activePayrollEntriesCount}
          icon={<FileText size={16} className="text-blue-600" />}
          color="bg-blue-50"
          sub="Current month payroll records"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Scoped Operations Registry</h3>
              <button onClick={() => onNavigate('documents')} className="text-[10px] text-blue-600 hover:underline font-semibold">
                Generate Letters
              </button>
            </div>
            <Table>
              <Thead>
                <tr>
                  <Th>Roster Employee</Th>
                  <Th>Department</Th>
                  <Th>Dossier Status</Th>
                  <Th>Actions</Th>
                </tr>
              </Thead>
              <Tbody>
                {scopedEmployees.map(e => {
                  const empDocs = scopedDocs.filter(d => d.employeeId === e.id);
                  const isVerified = empDocs.length > 0 && empDocs.every(d => d.status === 'Verified');
                  return (
                    <Tr key={e.id} className="hover:bg-gray-50/50">
                      <Td>
                        <div>
                          <p className="text-xs font-semibold text-gray-900">{e.name}</p>
                          <p className="text-[9px] text-gray-400">{e.employeeId}</p>
                        </div>
                      </Td>
                      <Td><span className="text-xs text-gray-650">{e.department}</span></Td>
                      <Td>
                        <Badge variant={isVerified ? 'green' : 'yellow'}>
                          {isVerified ? 'Dossier Cleared' : 'Needs Verification'}
                        </Badge>
                      </Td>
                      <Td>
                        <button
                          onClick={() => onNavigate('documents')}
                          className="text-[10px] px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded animate-hover"
                        >
                          Verify Docs
                        </button>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </Card>
        </div>

        <Card>
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">
            Employee Updates Log
          </h3>
          <div className="space-y-3.5 text-xs text-gray-600">
            {scopedEmployees.slice(0, 3).map(e => (
              <div key={e.id} className="pb-3 border-b border-gray-55 flex items-start gap-2.5 last:pb-0 last:border-0">
                <div className="w-6 h-6 bg-indigo-50 border border-indigo-100 rounded text-indigo-700 flex items-center justify-center font-bold text-[10px]">
                  {e.avatar}
                </div>
                <div>
                  <p className="text-xs text-gray-800 font-semibold leading-normal">{e.name}</p>
                  <p className="text-[10px] text-gray-400">Role: {e.role} · {e.department}</p>
                </div>
              </div>
            ))}
            <div className="pt-2">
              <button
                onClick={() => onNavigate('employees')}
                className="w-full py-1.5 bg-indigo-600 text-white rounded text-[11.5px] font-bold hover:bg-indigo-700 transition-colors shadow-xs"
              >
                Access Staff Registry
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
