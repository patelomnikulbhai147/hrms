import React, { useMemo, useState, useEffect } from 'react';
import {
  Building2, Calendar, AlertCircle, FileText, CheckCircle2, Clock, Info,
  Search, Bell, DollarSign, Sparkles
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
  notifications
} from '../data/mockData';
import { deriveCompanyPayrollStatus } from '../utils/payroll';
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

  // Scoped Data for Company Head / HR roles
  const scopedEmployees = employees.filter(e => e.companyId === activeCompanyId);
  const scopedAttendance = attendance.filter(a => a.date === todayStr && a.companyId === activeCompanyId);
  const scopedPayroll = payroll.filter(p => p.companyId === activeCompanyId);
  const scopedDocs = documents.filter(d => d.companyId === activeCompanyId);
  const scopedNotifications = notifications.filter(n => n.companyId === activeCompanyId);

  const daysLeft = (dateStr?: string) => {
    if (!dateStr) return Infinity;
    const now = new Date('2026-05-20');
    const d = new Date(dateStr + 'T00:00:00');
    const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // ─── Super Admin Calculations ───
  const totalCompaniesCount = companies.length;

  const activeSubscriptionsCount = companies.filter(
    c => c.accountStatus === 'Active' && (c.paymentStatus === 'Paid' || c.paymentStatus === 'Trial Active')
  ).length;

  const pendingRenewalsCount = companies.filter(
    c => c.accountStatus !== 'Suspended' && daysLeft(c.renewalDate) <= 7 && daysLeft(c.renewalDate) >= 0
  ).length;

  // Dynanically sync monthly subscription income from plans data only
  const monthlyRevenueVal = companies.reduce((sum, c) => {
    if (c.accountStatus === 'Active' && (c.paymentStatus === 'Paid' || c.paymentStatus === 'Trial Active')) {
      const planObj = plans.find(p => p.name === c.plan);
      if (planObj) {
        return sum + (c.billingCycle === 'Yearly' ? Math.round(planObj.priceYearly / 12) : planObj.priceMonthly);
      }
      return sum + (c.subscriptionPrice || 0);
    }
    return sum;
  }, 0);

  // Filter renewal list items
  const renewalAlertsList = useMemo(() => {
    return companies
      .map(c => {
        const remaining = daysLeft(c.renewalDate);
        let expiryText = '';
        let statusText: 'Active' | 'Warning' | 'Expired' | 'Trial' = 'Active';
        let actionLabel = 'Renew';

        if (c.accountStatus === 'Suspended') {
          expiryText = 'Suspended';
          statusText = 'Expired';
        } else if (remaining < 0) {
          expiryText = 'Expired';
          statusText = 'Expired';
          actionLabel = 'Upgrade';
        } else if (c.paymentStatus === 'Trial Active') {
          expiryText = `${remaining}d left`;
          statusText = 'Trial';
        } else if (remaining <= 7) {
          expiryText = `${remaining} days left`;
          statusText = 'Warning';
        } else if (remaining <= 15) {
          expiryText = `${remaining} days left`;
          statusText = 'Warning';
        } else {
          expiryText = `${remaining} days left`;
          statusText = 'Active';
        }

        return {
          company: c,
          remaining,
          expiryText,
          statusText,
          actionLabel
        };
      })
      .filter(item => item.remaining <= 15 || item.company.paymentStatus === 'Expired' || item.company.paymentStatus === 'Overdue' || item.company.accountStatus === 'Suspended')
      .sort((a, b) => a.remaining - b.remaining);
  }, [companies]);

  // Renewal banner alerts
  const expiringThisWeekCount = useMemo(() => {
    return companies.filter(c => c.accountStatus !== 'Suspended' && daysLeft(c.renewalDate) <= 7 && daysLeft(c.renewalDate) >= 0).length;
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
    companies.forEach(c => {
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
    companies.forEach(c => {
      if (c.accountStatus === 'Suspended') suspended++;
      else if (c.paymentStatus === 'Expired' || c.paymentStatus === 'Overdue' || daysLeft(c.renewalDate) < 0) expired++;
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

  const statusBadge = (statusText: string) => {
    switch (statusText) {
      case 'Active': return 'green';
      case 'Inactive': return 'gray';
      case 'On Leave': return 'yellow';
      case 'Terminated': return 'red';
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
                  Workspaces require active licenses. There are <strong>{expiringThisWeekCount} subscriptions</strong> nearing expiration within 7 days.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <p className="text-xs text-amber-600 font-semibold mt-1">⚠ Expiring within 7 Days</p>
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
    const presentToday = scopedEmployees.filter(e =>
      e.status === 'Active' &&
      scopedAttendance.some(a => a.employeeId === e.id && (a.status === 'Present' || a.status === 'Late' || a.status === 'WFH'))
    ).length;

    const absentToday = scopedEmployees.filter(e =>
      e.status === 'Active' &&
      (scopedAttendance.some(a => a.employeeId === e.id && a.status === 'Absent') ||
        !scopedAttendance.some(a => a.employeeId === e.id))
    ).length;

    const onLeaveToday = scopedEmployees.filter(e => e.status === 'On Leave').length;

    const companyPayrollStatus = deriveCompanyPayrollStatus(activeCompanyId, payroll);
    const payrollStatusStr = companyPayrollStatus.status ? companyPayrollStatus.label : 'No Payroll';

    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Corporate Operations Control</h2>
          <p className="text-xs text-gray-500 mt-0.5">Control company attendance logs, payroll calculations, and standard settings</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Present Employees"
            value={presentToday}
            icon={<CheckCircle2 size={16} className="text-emerald-600" />}
            color="bg-emerald-50"
            sub="Checked-in today"
          />
          <StatCard
            label="Absent Employees"
            value={absentToday}
            icon={<AlertCircle size={16} className="text-red-500" />}
            color="bg-red-50"
            sub="Unregistered biometrics"
          />
          <StatCard
            label="Employees on Leave"
            value={onLeaveToday}
            icon={<Calendar size={16} className="text-amber-600" />}
            color="bg-amber-50"
            sub="Authorized leave schedule"
          />
          <StatCard
            label="Payroll Process Status"
            value={payrollStatusStr}
            icon={<FileText size={16} className="text-blue-600" />}
            color={companyPayrollStatus.status === 'failed' ? 'bg-red-50' : 'bg-blue-50'}
            sub="Latest payroll stage"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <Card padding={false}>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Company Employee List</h3>
                <button onClick={() => onNavigate('employees')} className="text-[10px] text-blue-600 hover:underline font-semibold">
                  View Roster
                </button>
              </div>
              <Table>
                <Thead>
                  <tr>
                    <Th>Employee</Th>
                    <Th>Designation</Th>
                    <Th>Joining Date</Th>
                    <Th>Location</Th>
                    <Th>Status</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {scopedEmployees.slice(0, 4).map(e => (
                    <Tr key={e.id} className="hover:bg-gray-50/50">
                      <Td>
                        <span className="text-xs font-semibold text-gray-900">{e.name}</span>
                      </Td>
                      <Td><span className="text-xs text-gray-650">{e.designation}</span></Td>
                      <Td><span className="text-xs text-gray-655">{e.joinDate}</span></Td>
                      <Td><span className="text-xs text-gray-655">{e.location}</span></Td>
                      <Td><Badge variant={statusBadge(e.status) as any}>{e.status}</Badge></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Card>
          </div>

          <Card>
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100 flex items-center gap-1">
              <Info size={13} className="text-blue-600" />
              <span>Company Notifications</span>
            </h3>
            <div className="space-y-3">
              {scopedNotifications.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No recent alerts logged</p>
              ) : (
                scopedNotifications.slice(0, 4).map((notif: Notification) => (
                  <div key={notif.id} className="p-2.5 bg-slate-50 border border-slate-100 rounded-md space-y-1">
                    <p className="text-xs text-gray-700 font-medium leading-relaxed">{notif.message}</p>
                    <div className="flex justify-between items-center text-[9px] text-gray-400 font-mono">
                      <span>{notif.timestamp}</span>
                      <span className="uppercase text-blue-650 font-bold">{notif.type}</span>
                    </div>
                  </div>
                ))
              )}
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
