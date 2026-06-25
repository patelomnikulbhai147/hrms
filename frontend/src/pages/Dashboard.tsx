import React, { useMemo, useState, useEffect } from 'react';
import {
  Building2, AlertCircle, FileText, CheckCircle2, Clock, Info,
  Search, Bell, DollarSign, Sparkles, ChevronRight, Users, Archive,
  Wallet, Calendar, UserPlus, FileUp, BarChart2, Activity
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
  isCompanyIdMatch,
  resolveActiveWorkspace
} from '@/types';
import { deriveCompanyPayrollStatus } from '@/utils/payroll';
import {
  calculateSubscriptionAnalytics,
  getSubscriptionAlertsList,
  getDaysRemaining
} from '@/utils/subscriptionUtils';
import { getCompanyInitials } from '@/utils/workspaceUtils';
import { getUniqueEmployees } from '@/utils/deduplication';
import { api, type SuperAdminStats } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { ui } from '@/components/ui/feedback';
import { Card, StatCard } from '@/components/ui/Card';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { TaskTenderWidgets } from '@/components/dashboard/TaskTenderWidgets';
import { Badge } from '@/components/ui/Badge';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area
} from 'recharts';
import { motion } from 'framer-motion';

const AnimatedCounter: React.FC<{ value: number; duration?: number }> = ({ value, duration = 800 }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setCount(Math.floor(progress * value));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setCount(value);
      }
    };
    window.requestAnimationFrame(step);
  }, [value, duration]);

  return <span>{count.toLocaleString('en-IN')}</span>;
};

interface DashboardProps {
  role: Role;
  onNavigate: (page: any) => void;
  activeCompanyId: string;
  onStartMasquerade: (companyId: string, kind?: 'company' | 'branch') => void;
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
  superAdminStats?: SuperAdminStats | null;
}

const Loading: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-[400px] p-6 bg-white rounded-2xl shadow-sm border border-gray-100 animate-pulse text-center">
    <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-650 rounded-full animate-spin mb-4" />
    <p className="text-xs text-gray-500 font-bold tracking-wide">Hydrating Secure SaaS Environment...</p>
  </div>
);



export const Dashboard: React.FC<DashboardProps> = ({
  role,
  onNavigate,
  activeCompanyId,
  onStartMasquerade,
  companies: rawCompanies,
  employees: rawEmployees,
  attendance: rawAttendance,
  leaves: rawLeaves,
  payroll: rawPayroll,
  documents: rawDocuments,
  plans: rawPlans,
  notifications: _notifications,
  onUpdateNotifications,
  onUpdateCompanies,
  onUpdatePayments,
  superAdminStats
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // Fallback defaults for safety (Shadowing original variables to prevent runtime crashes)
  const companies = rawCompanies || [];
  const employees = getUniqueEmployees(rawEmployees || []);
  const attendance = rawAttendance || [];
  const leaves = rawLeaves || [];
  const payroll = rawPayroll || [];
  const documents = rawDocuments || [];
  const plans = rawPlans || [];
  const notifications = _notifications || [];

  // Find current company context first to prevent TDZ error.
  // Loose (String) compare: activeCompanyId may arrive as a number (fresh click)
  // or a string (rehydrated from localStorage) — both must resolve the same
  // workspace, otherwise a branch loses its context after a reload.
  const currentCompany = resolveActiveWorkspace(companies as any[], activeCompanyId) || companies.find(c => String(c.id) === String(activeCompanyId));
  // Branch context: the active workspace is a branch when it has a parent
  // company. Used to scope the dashboard and render the "Company → Branch"
  // breadcrumb / branch-specific title.
  const activeParentCompany = currentCompany?.parentCompanyId
    ? companies.find(c => String(c.id) === String(currentCompany.parentCompanyId))
    : null;
  const isBranchWorkspace = !!currentCompany?.parentCompanyId;
  const branchTitle = isBranchWorkspace
    ? `${(currentCompany as any).branchName || currentCompany?.name} Branch Dashboard`
    : `${currentCompany?.name || 'Company'} Dashboard`;

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

  const isParentCompany = !currentCompany?.parentCompanyId;
  const [selectedAudience, setSelectedAudience] = useState(isParentCompany ? 'all' : 'branch');
  const [selectedBranch, setSelectedBranch] = useState(isParentCompany ? '' : activeCompanyId);
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');

  useEffect(() => {
    setSelectedAudience(isParentCompany ? 'all' : 'branch');
    setSelectedBranch(isParentCompany ? '' : activeCompanyId);
  }, [activeCompanyId, isParentCompany]);

  useEffect(() => {
    if (companies.length > 0 && role !== 'Super Admin' && !currentCompany) {
      onNavigate('companies');
    }
  }, [companies, role, currentCompany, onNavigate]);

  // Scoped Data for Company Head / HR roles (supports parent company rollup and local branches)
  const rawScopedEmployees = employees.filter(e => isCompanyIdMatch(e.companyId, activeCompanyId, companies as any[], e.branchLocation, e.branchId));
  const scopedEmployees = rawScopedEmployees.filter(e => e.status !== 'Archived' && e.status !== 'Terminated');
  const scopedAttendance = attendance.filter(a => a.date === todayStr && isCompanyIdMatch(a.companyId, activeCompanyId, companies as any[]));
  const scopedPayroll = payroll.filter(p => isCompanyIdMatch(p.companyId, activeCompanyId, companies as any[], undefined, p.employee?.branchId));
  const scopedDocs = documents.filter(d => isCompanyIdMatch(d.companyId, activeCompanyId, companies as any[]));


  const daysLeft = (dateStr?: string) => {
    const diff = getDaysRemaining(dateStr);
    return diff === null ? Infinity : diff;
  };

  // ─── Super Admin Calculations ───
  const analytics = useMemo(() => {
    return calculateSubscriptionAnalytics(companies, plans);
  }, [companies, plans]);

  // ─── All Super Admin KPI cards read from the single source of truth ───
  // (SuperAdminStatisticsService via /api/statistics/super-admin). Client-side
  // analytics are used only as a pre-load fallback until stats arrive.
  const globalActiveEmployeesCount = superAdminStats?.combinedEmployees ?? 0;
  const offboardedCompaniesCount = superAdminStats?.offboardedCompanies ?? 0;
  const totalCompaniesCount = superAdminStats?.totalCompanies ?? 0;
  const totalBranchesCount = superAdminStats?.totalBranches ?? 0;
  const activeSubscriptionsCount = superAdminStats?.activeSubscriptions ?? 0;
  const monthlyRevenueVal = superAdminStats?.monthlyRevenue ?? 0;
  const pendingRenewalsCount = analytics.pendingRenewals;
  const expiringThisWeekCount = analytics.expiringPlans;

  // Connectivity validation log: API count -> Dashboard count (must match DB).
  useEffect(() => {
    if (!superAdminStats) return;
    console.log('[SuperAdminStats][API->Dashboard]', {
      totalCompanies: totalCompaniesCount,
      totalBranches: totalBranchesCount,
      combinedEmployees: globalActiveEmployeesCount,
      activeSubscriptions: activeSubscriptionsCount,
      offboardedCompanies: offboardedCompaniesCount,
      monthlyRevenue: monthlyRevenueVal,
    });
  }, [superAdminStats]);

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
      const baseDate = c.renewalDate ? new Date(c.renewalDate + 'T00:00:00') : new Date();
      const todayVal = new Date();
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
      paymentDate: new Date().toISOString().replace('T', ' ').substring(0, 16),
      invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      planType: target.plan,
      paymentMode: 'Manual' as const,
      transactionStatus: 'Success' as const
    };

    // Persist to the database so the renewal survives refresh/relogin. Branches
    // live in the Branch table (only `status` is a branch column); parent
    // companies take the full set of subscription columns. `renewalDate` is a
    // frontend-only display field with no backing column, so it is never sent.
    if (target.parentCompanyId) {
      api.branches.update(companyId, { status: 'Active' })
        .catch(err => { console.error(err); ui.toast.error(getApiErrorMessage(err, 'Could not save the renewal to the database.')); });
    } else {
      api.companies.update(companyId, { paymentStatus: 'Paid', accountStatus: 'Active', status: 'Active' })
        .catch(err => { console.error(err); ui.toast.error(getApiErrorMessage(err, 'Could not save the renewal to the database.')); });
      // Invoice is recorded against the parent company (PaymentRecord.companyId
      // is a Company FK; the saved row carries its real DB id back into state).
      api.payments.create(payment)
        .then((saved: any) => onUpdatePayments?.((prev: any[]) => [saved, ...(prev || [])]))
        .catch(err => { console.error(err); ui.toast.error(getApiErrorMessage(err, 'Could not save the payment record.')); });
    }
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
    // Persist the suspension so it survives refresh/relogin (mirrors the
    // Companies page status toggle). Branches only accept `status`; parent
    // companies accept the account/payment status columns too.
    if (target.parentCompanyId) {
      api.branches.update(companyId, { status: 'Inactive' })
        .catch(err => { console.error(err); ui.toast.error(getApiErrorMessage(err, 'Could not save the suspension to the database.')); });
    } else {
      api.companies.update(companyId, { accountStatus: 'Suspended', status: 'Inactive', paymentStatus: 'Expired' })
        .catch(err => { console.error(err); ui.toast.error(getApiErrorMessage(err, 'Could not save the suspension to the database.')); });
    }
    showToast(`Access suspended for ${target.name} due to license expiration.`, 'warning');
  };

  // Search & Filter Side Card
  const [latestSearch, setLatestSearch] = useState('');
  const [latestFilter, setLatestFilter] = useState<'All' | 'Active' | 'Expired' | 'Trial' | 'Enterprise'>('All');

  const filteredLatestCompanies = useMemo(() => {
    return companies
      .filter(c => {
        const matchSearch = c.name?.toLowerCase().includes(latestSearch.toLowerCase()) || c.adminName?.toLowerCase().includes(latestSearch.toLowerCase());
        const isExpired = c.accountStatus === 'Suspended' || c.paymentStatus === 'Expired' || c.paymentStatus === 'Overdue' || daysLeft(c.renewalDate) < 0 || c.status === 'Inactive' || c.status === 'Archived';

        if (latestFilter === 'All') return matchSearch;
        if (latestFilter === 'Active') return matchSearch && c.accountStatus === 'Active' && c.paymentStatus === 'Paid';
        if (latestFilter === 'Expired') return matchSearch && isExpired;
        if (latestFilter === 'Trial') return matchSearch && c.paymentStatus === 'Trial Active';
        if (latestFilter === 'Enterprise') return matchSearch && c.plan === 'Enterprise';
        return matchSearch;
      })
      .sort((a, b) => new Date(b.joinDate).getTime() - new Date(a.joinDate).getTime());
  }, [companies, latestSearch, latestFilter]);

  // Revenue Overview Chart Data (Computed dynamic MRR from plans state)
  const revenueChartData = useMemo(() => {
    const counts = { Starter: 0, Professional: 0, Enterprise: 0 };
    const sums = { Starter: 0, Professional: 0, Enterprise: 0 };
    companies.filter(c => !c.parentCompanyId).forEach(c => {
      if (c.status !== 'Archived' && c.accountStatus === 'Active' && (c.paymentStatus === 'Paid' || c.paymentStatus === 'Trial Active')) {
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

  const statusPieData = useMemo(() => {
    const active = superAdminStats?.activeSubscriptions ?? 0;
    const suspended = superAdminStats?.suspendedAccounts ?? 0;
    // Calculate remaining expired/trial roughly from DB if needed, or stick to front-end for trial/expired since backend doesn't provide them yet.
    // Actually, backend now gives us activeCompanies and activeSubscriptions.
    // To strictly avoid duplicate counts, we will rely on superAdminStats.
    // If we only have active and suspended from backend, we map them directly.
    return [
      { name: 'Active', value: superAdminStats?.activeCompanies ?? 0, color: '#10b981' },
      { name: 'Suspended', value: suspended, color: '#f59e0b' }
    ];
  }, [superAdminStats]);



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



  // The Super Admin dashboard is driven by live superAdminStats counts (each with
  // a `?? 0` fallback), NOT the companies array, so it must render even when the
  // platform has no companies yet (fresh / empty database). Gating on
  // `companies.length` here caused the dashboard to hang on the loading spinner
  // forever once the database was empty.
  if (role !== 'Super Admin' && !companies.length) {
    return <Loading />;
  }

  if (role !== 'Super Admin' && !currentCompany) {
    return <Loading />;
  }

  // ─── Super Admin Dashboard Overhaul ───
  if (role === 'Super Admin') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="space-y-6 relative pb-10"
      >

        {/* Dynamic Expiring Notification Toast Banner */}
        {expiringThisWeekCount > 0 && (
          <div className="bg-indigo-650/5 border border-indigo-150 backdrop-blur-md rounded-2xl p-4.5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600/15 rounded-xl text-indigo-700">
                <Bell size={18} className="animate-bounce" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 font-heading">
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
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight font-heading">SaaS Control Center</h1>
            <p className="text-sm text-gray-500 mt-0.5">Central subscription intelligence, real-time renewals, and client onboarding</p>
          </div>
        </div>

        {/* Dynamic Metric Cards (Top cards keeping only important) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-slate-100 shadow-sm p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Companies</span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Building2 size={16} />
              </div>
            </div>
            <div className="mt-3.5">
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight font-heading">
                <AnimatedCounter value={totalCompaniesCount} />
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">Tenant spaces registered</p>
            </div>
          </div>

          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-slate-100 shadow-sm p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Branches</span>
              <div className="p-2 bg-sky-50 text-sky-600 rounded-lg">
                <Building2 size={16} />
              </div>
            </div>
            <div className="mt-3.5">
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight font-heading">
                <AnimatedCounter value={totalBranchesCount} />
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">Subsidiaries managed</p>
            </div>
          </div>

          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-slate-100 shadow-sm p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Combined Employees</span>
              <div className="p-2 bg-violet-50 text-violet-600 rounded-lg">
                <Users size={16} />
              </div>
            </div>
            <div className="mt-3.5">
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight font-heading">
                <AnimatedCounter value={globalActiveEmployeesCount} />
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">Total workforce on record</p>
            </div>
          </div>

          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-slate-100 shadow-sm p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Subscriptions</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div className="mt-3.5">
              <h3 className="text-2xl font-extrabold text-slate-905 tracking-tight font-heading">
                <AnimatedCounter value={activeSubscriptionsCount} />
              </h3>
              <p className="text-[10px] text-emerald-600 font-semibold mt-1">✓ Active Spaces</p>
            </div>
          </div>

          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-slate-100 shadow-sm p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Offboarded Companies</span>
              <div className="p-2 bg-slate-50 text-slate-600 rounded-lg">
                <Archive size={16} />
              </div>
            </div>
            <div className="mt-3.5">
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight font-heading">
                <AnimatedCounter value={offboardedCompaniesCount} />
              </h3>
              <p className="text-[10px] text-slate-500 font-semibold mt-1">Offboarded / Archived</p>
            </div>
          </div>

          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-slate-100 shadow-sm p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Monthly Revenue</span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <DollarSign size={16} />
              </div>
            </div>
            <div className="mt-3.5">
              <h3 className="text-2xl font-extrabold text-indigo-650 tracking-tight font-heading">
                ₹<AnimatedCounter value={monthlyRevenueVal} />
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">MRR (Synced from plan prices)</p>
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
                              <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center font-bold text-white text-xs shadow-xs" style={!company.logoImage ? { backgroundColor: company.primaryColor || '#4f46e5' } : {}}>
                                {company.logoImage ? (
                                  <img src={company.logoImage} alt="Logo" className="w-full h-full object-contain p-0.5" />
                                ) : (
                                  getCompanyInitials(company.name)
                                )}
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
                            <span className="text-indigo-650 font-semibold">{c.parentCompanyId ? employees.filter(e => isCompanyIdMatch(e.companyId, c.id, companies, e.branchLocation, e.branchId)).length : (c.employeeCount || 0)} Staff</span>
                            <span>•</span>
                            <span>Onboard: {c.joinDate}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => onStartMasquerade(c.id, c.parentCompanyId ? 'branch' : 'company')}
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

      </motion.div>
    );
  }

  // ─── Company Head Dashboard (Corporate Operations Control) ───
  if (role === 'Company Head') {
    const totalEmployees = scopedEmployees.length;
    const activeEmployeesCount = currentCompany?.employeeCount || 0;

    const branches = companies.filter(b => b.parentCompanyId === activeCompanyId);

    // Filter leaves for this company (supports parent + branches)
    const scopedLeaves = leaves.filter(l => isCompanyIdMatch(l.companyId, activeCompanyId, companies as any[]));

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

    const presentToday = totalEmployees - onLeaveToday - (attendancePending || 0);

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

    // ─── Live widget datasets — every value below is derived from real DB
    // records scoped to this branch/company. No hardcoded, mock or demo data. ───
    const scopedEmpIds = new Set(rawScopedEmployees.map(e => e.id));

    // 1. Total Employees = COUNT(employee_records) assigned to this scope.
    const totalEmployeesLive = rawScopedEmployees.length;

    // 2. Present Today = COUNT(attendance WHERE date = today AND status = Present).
    const presentTodayLive = attendance.filter(a =>
      a.date === todayStr && /present/i.test(String(a.status)) && scopedEmpIds.has(a.employeeId)
    ).length;

    // 3. Pending Leaves (scoped to this branch/company).
    const scopedLeavesLive = leaves.filter(l =>
      scopedEmpIds.has(l.employeeId) || isCompanyIdMatch(l.companyId, activeCompanyId, companies as any[])
    );
    const pendingLeavesLive = scopedLeavesLive.filter(l => String(l.status) === 'Pending').length;

    // 4. Payroll This Month = sum of actual payroll net salaries in scope.
    const payrollThisMonthLive = scopedPayroll.reduce((acc, p) => acc + (p.netSalary || 0), 0);

    // 5. Employee Growth = cumulative headcount by joining month (last 6 months).
    const growthData = (() => {
      const now = new Date(todayStr);
      const rows: { name: string; count: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const label = new Date(now.getFullYear(), now.getMonth() - i, 1)
          .toLocaleString('en-US', { month: 'short' });
        const count = rawScopedEmployees.filter(e => e.joinDate && new Date(e.joinDate) <= monthEnd).length;
        rows.push({ name: label, count });
      }
      return rows;
    })();

    // 6 & 7. Department Distribution + Top Departments = GROUP BY department.
    const DEPT_COLORS = ['#2563EB', '#8B5CF6', '#10B981', '#F59E0B', '#06B6D4', '#EC4899', '#64748B', '#0D9488'];
    const deptDistribution = Object.entries(
      rawScopedEmployees.reduce((acc, e) => {
        const d = e.department || 'Other';
        acc[d] = (acc[d] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    )
      .map(([name, value], i) => ({ name, value, color: DEPT_COLORS[i % DEPT_COLORS.length] }))
      .sort((a, b) => b.value - a.value);
    const deptTotalLive = deptDistribution.reduce((s, d) => s + d.value, 0) || 1;
    const topDeptsLive = deptDistribution.slice(0, 5);

    // 8. Attendance Trend = present count per day for the last 14 days (real attendance).
    const attendanceTrendLive = (() => {
      const now = new Date(todayStr);
      const rows: { name: string; present: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const present = attendance.filter(a =>
          a.date === ds && /present/i.test(String(a.status)) && scopedEmpIds.has(a.employeeId)
        ).length;
        rows.push({ name: `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-US', { month: 'short' })}`, present });
      }
      return rows;
    })();

    // 9. Pending Approvals = pending leaves + pending document requests + exit clearances.
    const pendingDocsLive = scopedDocs.filter(d => String(d.status) === 'Pending').length;
    const exitClearancesLive = rawScopedEmployees.filter(e =>
      e.status === 'Inactive' || (e.exitDate && e.status !== 'Archived')
    ).length;

    // 10. Recent Activities = real record events (joins, leaves, payroll, documents).
    const recentActivitiesLive = (() => {
      type Act = { kind: 'employee' | 'leave' | 'payroll' | 'document'; title: string; sub: string; ts: number };
      const acts: Act[] = [];
      rawScopedEmployees.forEach(e => {
        if (e.joinDate) acts.push({ kind: 'employee', title: `${e.name} joined`, sub: e.department ? `${e.department} team` : 'New employee', ts: new Date(e.joinDate).getTime() });
      });
      scopedLeavesLive.forEach(l => {
        acts.push({ kind: 'leave', title: `${l.employeeName || 'Employee'} ${String(l.status) === 'Pending' ? 'requested' : String(l.status).toLowerCase()} ${l.leaveType || 'leave'}`, sub: l.days ? `${l.days} day(s)` : 'Leave request', ts: new Date(l.appliedOn || l.fromDate || todayStr).getTime() });
      });
      scopedPayroll.forEach((p: any) => {
        if (p.netSalary) acts.push({ kind: 'payroll', title: `Payroll processed${p.employeeName ? ` for ${p.employeeName}` : ''}`, sub: `Net ₹${(p.netSalary || 0).toLocaleString('en-IN')}`, ts: new Date(p.createdAt || p.payDate || todayStr).getTime() });
      });
      scopedDocs.forEach((d: any) => {
        acts.push({ kind: 'document', title: `Document ${d.name || ''}`.trim(), sub: d.status ? `Status: ${d.status}` : (d.uploadedBy ? `By ${d.uploadedBy}` : 'Uploaded'), ts: new Date(d.uploadedOn || d.createdAt || todayStr).getTime() });
      });
      return acts.filter(a => !isNaN(a.ts)).sort((a, b) => b.ts - a.ts).slice(0, 5);
    })();

    const relativeTime = (ts: number): string => {
      const diff = Date.now() - ts;
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      return `${days}d ago`;
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="space-y-6 pb-10 font-sans"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">{branchTitle}</h2>
            {isBranchWorkspace && activeParentCompany && (
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1D4ED8] mt-0.5">
                <span className="text-slate-500">{activeParentCompany.name}</span>
                <ChevronRight size={13} className="text-slate-400" />
                <span>{(currentCompany as any).branchName || currentCompany?.name} Branch</span>
              </div>
            )}
            <p className="text-[13px] text-gray-500 mt-0.5">
              {isBranchWorkspace
                ? `Showing data for the ${(currentCompany as any).branchName || currentCompany?.name} branch only.`
                : "Here's what's happening in your organization today."}
            </p>
          </div>
          {/* <div className="flex items-center gap-3">
            <div className="bg-white border border-gray-200 shadow-sm rounded-lg px-3 py-2 text-[12px] font-medium text-gray-700 flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors">
              <Calendar size={14} className="text-gray-400" />
              May 01 - May 31, 2025
              <ChevronRight size={14} className="text-gray-400 rotate-90 ml-2" />
            </div>
            <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-2.5 text-gray-600 relative cursor-pointer hover:bg-gray-50 transition-colors">
              <Bell size={16} />
              <span className="absolute top-2 right-2.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white"></span>
            </div>
          </div> */}
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Total Employees */}
          <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5 hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center">
                  <Users size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-gray-500">Total Employees</p>
                  <h3 className="text-[28px] font-bold text-gray-900 leading-tight mt-1"><AnimatedCounter value={totalEmployeesLive} /></h3>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-end mt-4">
              {(() => {
                const delta = growthData[5].count - growthData[4].count;
                return (
                  <span className={`text-[11px] font-semibold flex items-center gap-1 ${delta >= 0 ? 'text-[#10B981]' : 'text-rose-500'}`}>
                    {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)} <span className="text-gray-400 font-medium">vs last month</span>
                  </span>
                );
              })()}
              <span className="text-[11px] font-medium text-gray-400">{scopedEmployees.length} active</span>
            </div>
          </div>

          {/* Present Today */}
          <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5 hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-[#10B981] flex items-center justify-center">
                  <CheckCircle2 size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-gray-500">Present Today</p>
                  <h3 className="text-[28px] font-bold text-gray-900 leading-tight mt-1"><AnimatedCounter value={presentTodayLive} /></h3>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-end mt-4">
              <span className="text-[11px] font-medium text-gray-500">{scopedEmployees.length > 0 ? Math.round((presentTodayLive / scopedEmployees.length) * 100) : 0}% of active</span>
              <span className="text-[11px] font-medium text-gray-400">{todayStr}</span>
            </div>
          </div>

          {/* Pending Leaves */}
          <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5 hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-amber-50 text-[#F59E0B] flex items-center justify-center">
                  <UserPlus size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-gray-500">Pending Leaves</p>
                  <h3 className="text-[28px] font-bold text-gray-900 leading-tight mt-1"><AnimatedCounter value={pendingLeavesLive} /></h3>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-end mt-4">
              <span className="text-[11px] font-medium text-gray-500">{pendingLeavesLive} Awaiting Approval</span>
              <span onClick={() => onNavigate('leaves')} className="text-[11px] font-semibold text-[#2563EB] cursor-pointer hover:underline">Review</span>
            </div>
          </div>

          {/* Payroll This Month */}
          <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5 hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-purple-50 text-[#8B5CF6] flex items-center justify-center">
                  <Wallet size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-gray-500">Payroll This Month</p>
                  <h3 className="text-[24px] font-bold text-gray-900 leading-tight mt-1 truncate max-w-[150px]">₹ {(payrollThisMonthLive / 100000).toFixed(1)}L</h3>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-end mt-4">
              <span onClick={() => onNavigate('payroll')} className="text-[11px] font-semibold text-[#2563EB] cursor-pointer hover:underline">View Summary</span>
              <svg className="w-20 h-6 text-[#8B5CF6]" viewBox="0 0 100 30" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M0,25 Q15,25 25,20 T50,15 T75,10 T100,5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        {/* Task Manager + Tender Information widgets (added below statistics cards) */}
        {/* This dashboard block renders only for Company Head (leadership) — tenders allowed. */}
        <TaskTenderWidgets activeCompanyId={activeCompanyId} onNavigate={onNavigate} canViewTenders />

        {/* Main Analytics Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column (Charts) */}
          <div className="lg:col-span-2 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Employee Growth Chart */}
              <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5 h-[320px] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[14px] font-bold text-gray-800">Employee Growth <span className="text-gray-500 font-medium">(Last 6 Months)</span></h3>
                  <select className="text-[11px] border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 outline-none hover:border-gray-300">
                    <option>This Year</option>
                  </select>
                </div>
                <div className="flex-1 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={growthData} margin={{ top: 15, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} domain={['dataMin - 10', 'auto']} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Area type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" activeDot={{ r: 6, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Department Distribution */}
              <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5 h-[320px] flex flex-col">
                <h3 className="text-[14px] font-bold text-gray-800 mb-2">Department Distribution</h3>
                <div className="flex-1 flex flex-col items-center justify-center relative mt-2">
                  <div className="w-full h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={deptDistribution.length ? deptDistribution : [{ name: 'No Data', value: 1, color: '#E2E8F0' }]}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {(deptDistribution.length ? deptDistribution : [{ name: 'No Data', value: 1, color: '#E2E8F0' }]).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4 px-2">
                    {deptDistribution.length === 0 ? (
                      <span className="text-[11px] font-medium text-gray-400">No employee records in scope</span>
                    ) : deptDistribution.map(d => (
                      <div key={d.name} className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></span>
                        <span>{d.name} ({d.value})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Top Departments (Horizontal Bars) */}
              <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-[14px] font-bold text-gray-800">Top Departments</h3>
                  <span className="text-[11px] font-bold text-[#2563EB] cursor-pointer hover:underline">View Full Report</span>
                </div>
                <div className="space-y-4">
                  {topDeptsLive.length === 0 ? (
                    <p className="text-[12px] text-gray-400 font-medium py-4 text-center">No employee records in scope</p>
                  ) : topDeptsLive.map((dept, i) => {
                    const pct = Math.round((dept.value / deptTotalLive) * 100);
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-[11px] font-bold mb-1.5 text-gray-700">
                          <span>{dept.name}</span>
                          <span>{dept.value} <span className="text-gray-400 font-medium">({pct}%)</span></span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: dept.color }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Attendance Trend */}
              <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-[14px] font-bold text-gray-800">Attendance Trend <span className="text-gray-500 font-medium">(Last 14 Days)</span></h3>
                  <div className="flex gap-3 text-[10px] font-semibold">
                    <span className="flex items-center gap-1 text-gray-600"><span className="w-3 h-0.5 bg-[#2563EB]"></span> Present (count)</span>
                  </div>
                </div>
                <div className="w-full h-[180px] mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={attendanceTrendLive} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorAtt" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B' }} dy={10} interval={2} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Area type="monotone" dataKey="present" stroke="#2563EB" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAtt)" activeDot={{ r: 5, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            {/* Pending Approvals */}
            <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[14px] font-bold text-gray-800">Pending Approvals</h3>
                <span onClick={() => onNavigate('leaves')} className="text-[11px] font-bold text-[#2563EB] cursor-pointer hover:underline">View All</span>
              </div>
              <div className="space-y-4">
                <div onClick={() => onNavigate('leaves')} className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-50 text-orange-500 rounded-lg"><Calendar size={16} strokeWidth={2.5} /></div>
                    <span className="text-[12px] font-semibold text-gray-700">Leave Requests</span>
                  </div>
                  <span className="text-[13px] font-bold text-gray-900">{pendingLeavesLive.toString().padStart(2, '0')}</span>
                </div>
                <div onClick={() => onNavigate('documents')} className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 text-[#2563EB] rounded-lg"><FileText size={16} strokeWidth={2.5} /></div>
                    <span className="text-[12px] font-semibold text-gray-700">Document Requests</span>
                  </div>
                  <span className="text-[13px] font-bold text-gray-900">{pendingDocsLive.toString().padStart(2, '0')}</span>
                </div>
                <div onClick={() => onNavigate('employees')} className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-pink-50 text-pink-500 rounded-lg"><Archive size={16} strokeWidth={2.5} /></div>
                    <span className="text-[12px] font-semibold text-gray-700">Exit Clearances</span>
                  </div>
                  <span className="text-[13px] font-bold text-gray-900">{exitClearancesLive.toString().padStart(2, '0')}</span>
                </div>
              </div>
            </div>

            {/* Recent Activities */}
            <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[14px] font-bold text-gray-800">Recent Activities</h3>
                <span onClick={() => onNavigate('reports')} className="text-[11px] font-bold text-[#2563EB] cursor-pointer hover:underline">View All</span>
              </div>
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[13px] before:-translate-x-px before:h-full before:w-[2px] before:bg-slate-100">
                {recentActivitiesLive.length === 0 ? (
                  <p className="text-[12px] text-gray-400 font-medium py-4">No recent activity for this workspace</p>
                ) : recentActivitiesLive.map((act, i) => {
                  const style = {
                    employee: { bg: 'bg-blue-50', text: 'text-[#2563EB]', Icon: Users },
                    payroll: { bg: 'bg-purple-50', text: 'text-[#8B5CF6]', Icon: Wallet },
                    leave: { bg: 'bg-amber-50', text: 'text-[#F59E0B]', Icon: Calendar },
                    document: { bg: 'bg-emerald-50', text: 'text-[#10B981]', Icon: FileText },
                  }[act.kind];
                  const Icon = style.Icon;
                  return (
                    <div key={i} className="relative flex items-start gap-4">
                      <div className={`w-7 h-7 rounded-full ${style.bg} border-[3px] border-white flex items-center justify-center z-10 ${style.text} shadow-sm`}><Icon size={12} strokeWidth={3} /></div>
                      <div className="flex-1 pb-1">
                        <p className="text-[12px] font-semibold text-gray-800">{act.title}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{act.sub} <span className="float-right text-gray-400">{relativeTime(act.ts)}</span></p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[14px] font-bold text-gray-800">Notifications</h3>
                <span onClick={() => onNavigate('reports')} className="text-[11px] font-bold text-[#2563EB] cursor-pointer hover:underline">View All</span>
              </div>
              <div className="space-y-3.5">
                {(() => {
                  const scopedNotifs = (notifications || []).filter(n =>
                    !n.companyId || isCompanyIdMatch(n.companyId, activeCompanyId, companies as any[])
                  ).slice(0, 5);
                  if (scopedNotifs.length === 0) {
                    return <p className="text-[12px] text-gray-400 font-medium">No notifications</p>;
                  }
                  return scopedNotifs.map(n => (
                    <div key={n.id} className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-md ${n.priority === 'high' ? 'text-rose-500 bg-rose-50' : n.priority === 'medium' ? 'text-amber-500 bg-amber-50' : 'text-gray-400 bg-gray-50'}`}><Info size={14} strokeWidth={2.5} /></div>
                      <p className="text-[12px] text-gray-700 font-medium truncate">{n.message}</p>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-4">
          <h3 className="text-[15px] font-bold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <button onClick={() => onNavigate('employees')} className="bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#2563EB]/30 rounded-[16px] p-3.5 flex items-center justify-center sm:justify-start gap-3 transition-all group">
              <div className="p-2 bg-blue-50 text-[#2563EB] rounded-xl group-hover:scale-110 transition-transform"><UserPlus size={18} strokeWidth={2.5} /></div>
              <span className="text-[12px] font-bold text-gray-700 hidden sm:block">Add Employee</span>
            </button>
            <button onClick={() => onNavigate('attendance')} className="bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#10B981]/30 rounded-[16px] p-3.5 flex items-center justify-center sm:justify-start gap-3 transition-all group">
              <div className="p-2 bg-emerald-50 text-[#10B981] rounded-xl group-hover:scale-110 transition-transform"><CheckCircle2 size={18} strokeWidth={2.5} /></div>
              <span className="text-[12px] font-bold text-gray-700 hidden sm:block">Mark Attendance</span>
            </button>
            <button onClick={() => onNavigate('leaves')} className="bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#F59E0B]/30 rounded-[16px] p-3.5 flex items-center justify-center sm:justify-start gap-3 transition-all group">
              <div className="p-2 bg-amber-50 text-[#F59E0B] rounded-xl group-hover:scale-110 transition-transform"><Clock size={18} strokeWidth={2.5} /></div>
              <span className="text-[12px] font-bold text-gray-700 hidden sm:block">Approve Leave</span>
            </button>
            <button onClick={() => onNavigate('payroll')} className="bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#8B5CF6]/30 rounded-[16px] p-3.5 flex items-center justify-center sm:justify-start gap-3 transition-all group">
              <div className="p-2 bg-purple-50 text-[#8B5CF6] rounded-xl group-hover:scale-110 transition-transform"><Wallet size={18} strokeWidth={2.5} /></div>
              <span className="text-[12px] font-bold text-gray-700 hidden sm:block">Run Payroll</span>
            </button>
            <button onClick={() => onNavigate('documents')} className="bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#0D9488]/30 rounded-[16px] p-3.5 flex items-center justify-center sm:justify-start gap-3 transition-all group">
              <div className="p-2 bg-teal-50 text-[#0D9488] rounded-xl group-hover:scale-110 transition-transform"><FileUp size={18} strokeWidth={2.5} /></div>
              <span className="text-[12px] font-bold text-gray-700 hidden sm:block">Upload Document</span>
            </button>
            <button onClick={() => onNavigate('reports')} className="bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#4F46E5]/30 rounded-[16px] p-3.5 flex items-center justify-center sm:justify-start gap-3 transition-all group">
              <div className="p-2 bg-indigo-50 text-[#4F46E5] rounded-xl group-hover:scale-110 transition-transform"><BarChart2 size={18} strokeWidth={2.5} /></div>
              <span className="text-[12px] font-bold text-gray-700 hidden sm:block">View Reports</span>
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ─── HR Dashboard (HR Operations Dashboard) ───
  const biometricsUploadCount = attendance.filter(a => a.companyId === activeCompanyId).length;
  const pendingDocsCount = scopedDocs.filter(d => d.status === 'Pending').length;
  const activePayrollEntriesCount = scopedPayroll.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-base font-bold text-slate-800 font-heading">HR Operations Dashboard</h2>
        <p className="text-xs text-slate-500 mt-0.5">Biometrics logs upload, employee credentials verification, and contract draft generators</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Attendance Biometrics Records"
          value={<AnimatedCounter value={biometricsUploadCount} />}
          icon={<Clock size={16} className="text-indigo-650" />}
          color="bg-indigo-50/60"
          sub="Biometric log uploads logged"
        />
        <StatCard
          label="Pending Doc Verifications"
          value={<AnimatedCounter value={pendingDocsCount} />}
          icon={<AlertCircle size={16} className="text-amber-600" />}
          color="bg-amber-50/60"
          sub="Aadhaar/PAN pending validations"
        />
        <StatCard
          label="Payroll Active Entries"
          value={<AnimatedCounter value={activePayrollEntriesCount} />}
          icon={<FileText size={16} className="text-sky-600" />}
          color="bg-sky-50/60"
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
    </motion.div>
  );
};
