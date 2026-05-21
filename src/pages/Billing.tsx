import React, { useState } from 'react';
import { 
  CreditCard, Search, Filter, ShieldAlert, CheckCircle2, AlertTriangle, 
  XCircle, Edit3, Plus, ArrowUpRight, DollarSign, Users, RefreshCw, 
  Calendar, FileText, Download, UserCheck, Play, Pause, ChevronRight,
  Building2
} from 'lucide-react';
import { Company, SubscriptionPlan, PaymentRecord } from '../data/mockData';
import { Button } from '../components/ui/Button';

interface BillingProps {
  companies: Company[];
  onUpdateCompanies: (updater: Company[] | ((prev: Company[]) => Company[])) => void;
  plans: SubscriptionPlan[];
  onUpdatePlans: (updater: SubscriptionPlan[] | ((prev: SubscriptionPlan[]) => SubscriptionPlan[])) => void;
  payments: PaymentRecord[];
  onUpdatePayments: (updater: PaymentRecord[] | ((prev: PaymentRecord[]) => PaymentRecord[])) => void;
}

export const Billing: React.FC<BillingProps> = ({
  companies,
  onUpdateCompanies,
  plans,
  onUpdatePlans,
  payments,
  onUpdatePayments
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'payments' | 'alerts'>('overview');
  
  // Filters and search states
  const [companySearch, setCompanySearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Modals state
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [changingPlanCompany, setChangingPlanCompany] = useState<Company | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState<Company | null>(null);
  const [renewalConfirmCompany, setRenewalConfirmCompany] = useState<Company | null>(null);
  const [renewalStep, setRenewalStep] = useState<1 | 2>(1);
  
  // Form states
  const [newRenewalDate, setNewRenewalDate] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [renewalPlan, setRenewalPlan] = useState<'Starter' | 'Professional' | 'Enterprise'>('Starter');
  const [renewalCycle, setRenewalCycle] = useState<'Monthly' | 'Yearly'>('Monthly');

  const planPricing = React.useMemo(() => {
    const pricing: Record<string, { Monthly: number; Yearly: number }> = {};
    plans.forEach(p => {
      pricing[p.name] = {
        Monthly: p.priceMonthly,
        Yearly: p.priceYearly
      };
    });
    const defaultPricing = {
      Starter: { Monthly: 1999, Yearly: 19999 },
      Professional: { Monthly: 4999, Yearly: 49999 },
      Enterprise: { Monthly: 12999, Yearly: 129999 }
    };
    return {
      Starter: pricing.Starter || defaultPricing.Starter,
      Professional: pricing.Professional || defaultPricing.Professional,
      Enterprise: pricing.Enterprise || defaultPricing.Enterprise
    };
  }, [plans]);

  const getPlanBadge = (planName: string) => {
    const name = planName || 'Starter';
    if (name === 'Enterprise') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-gradient-to-r from-purple-100 to-amber-100 text-purple-800 border border-purple-200/50 shadow-xs uppercase tracking-wide">
          👑 {name}
        </span>
      );
    }
    if (name === 'Professional' || name === 'Growth') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wide">
          Professional
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wide">
        Starter
      </span>
    );
  };

  // Date and math helper utilities
  const today = new Date('2026-05-20'); // Mock system date
  const formatIsoDate = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatDisplayDate = (dateString: string | undefined | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getDaysBetweenSafe = (d1: Date, d2: Date) => {
    const start = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
    const end = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getNowTimestampDisplay = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${formatIsoDate(now)} ${hours}:${minutes}`;
  };

  // Centralized alert generator function
  const getSubscriptionAlerts = () => {
    const alertsList: {
      company: Company;
      type: 'Suspended' | 'Overdue' | 'Expiring Soon' | 'Trial Ending';
      message: string;
      daysRemaining: number | null;
      badgeColor: string;
      textColor: string;
      bgColor: string;
      borderColor: string;
    }[] = [];

    companies.forEach(c => {
      if (!c) return;

      const isSuspended = c.accountStatus === 'Suspended';
      const isOverdueState = c.paymentStatus === 'Overdue' || c.paymentStatus === 'Expired';
      
      let daysLeft: number | null = null;
      if (c.renewalDate) {
        const renDate = new Date(c.renewalDate);
        daysLeft = getDaysBetweenSafe(today, renDate);
      }

      // 1. Suspended
      if (isSuspended) {
        alertsList.push({
          company: c,
          type: 'Suspended',
          message: 'Account suspended due to outstanding payment or administrative action.',
          daysRemaining: daysLeft,
          badgeColor: 'bg-rose-100 text-rose-700 border-rose-200',
          textColor: 'text-rose-700',
          bgColor: 'bg-rose-50/50',
          borderColor: 'border-rose-100'
        });
      }
      // 2. Overdue (paymentStatus is Overdue/Expired, or renewal date is in the past and not suspended)
      else if (isOverdueState || (daysLeft !== null && daysLeft < 0)) {
        alertsList.push({
          company: c,
          type: 'Overdue',
          message: `Payment overdue. Subscription elapsed on ${formatDisplayDate(c.renewalDate)}.`,
          daysRemaining: daysLeft,
          badgeColor: 'bg-amber-100 text-amber-700 border-amber-200',
          textColor: 'text-amber-700',
          bgColor: 'bg-amber-50/50',
          borderColor: 'border-amber-100'
        });
      }
      // 3. Trial Ending
      else if (c.paymentStatus === 'Trial Active' && daysLeft !== null && daysLeft >= 0 && daysLeft <= 10) {
        alertsList.push({
          company: c,
          type: 'Trial Ending',
          message: `Trial tier ends in ${daysLeft} days. Workspace will be restricted upon expiration.`,
          daysRemaining: daysLeft,
          badgeColor: 'bg-indigo-100 text-indigo-700 border-indigo-200',
          textColor: 'text-indigo-700',
          bgColor: 'bg-indigo-50/50',
          borderColor: 'border-indigo-100'
        });
      }
      // 4. Expiring Soon
      else if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 10) {
        alertsList.push({
          company: c,
          type: 'Expiring Soon',
          message: `Subscription renewal coming up in ${daysLeft} days.`,
          daysRemaining: daysLeft,
          badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
          textColor: 'text-blue-700',
          bgColor: 'bg-blue-50/50',
          borderColor: 'border-blue-100'
        });
      }
      // 5. Pending Payment
      else if (c.paymentStatus === 'Pending') {
        alertsList.push({
          company: c,
          type: 'Overdue',
          message: 'Payment invoice generated and pending approval.',
          daysRemaining: daysLeft,
          badgeColor: 'bg-amber-100 text-amber-700 border-amber-200',
          textColor: 'text-amber-700',
          bgColor: 'bg-amber-50/50',
          borderColor: 'border-amber-100'
        });
      }
    });

    return alertsList;
  };

  const dynamicAlerts = getSubscriptionAlerts();
  const alertCount = dynamicAlerts.length;

  // ─── SaaS Metrics Calculations ──────────────────────────────────────────────
  const activePlansCount = companies.filter(c => c && (c.paymentStatus === 'Paid' || c.paymentStatus === 'Trial Active')).length;
  const pendingPaymentsCount = dynamicAlerts.filter(a => a.type === 'Overdue').length;
  const expiringCount = dynamicAlerts.filter(a => a.type === 'Expiring Soon' || a.type === 'Trial Ending').length;

  // Calculate MRR safely
  const mrr = companies.reduce((sum, c) => {
    if (c && c.accountStatus === 'Active' && (c.paymentStatus === 'Paid' || c.paymentStatus === 'Trial Active')) {
      if (c.billingCycle === 'Yearly') {
        return sum + Math.round((c.subscriptionPrice || 0) / 12);
      }
      return sum + (c.subscriptionPrice || 0);
    }
    return sum;
  }, 0);

  // Total Lifetime Revenue safely
  const totalRevenue = (payments || [])
    .filter(p => p && p.transactionStatus === 'Success')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  // ─── Event Handlers ──────────────────────────────────────────────────────────
  const toggleCompanyStatus = (companyId: string) => {
    onUpdateCompanies(prev => prev.map(c => {
      if (c.id === companyId) {
        const nextStatus = c.accountStatus === 'Active' ? 'Suspended' : 'Active';
        return { 
          ...c, 
          accountStatus: nextStatus,
          status: nextStatus === 'Suspended' ? 'Inactive' : 'Active'
        };
      }
      return c;
    }));
  };

  const performRenewal = (
    company: Company, 
    chosenPlan: 'Starter' | 'Professional' | 'Enterprise',
    chosenCycle: 'Monthly' | 'Yearly',
    calculatedPrice: number,
    calculatedDate: string
  ) => {
    const transactionId = `tx${Date.now()}`;
    const invoiceNo = `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    const newRecord: PaymentRecord = {
      id: transactionId,
      companyId: company.id,
      companyName: company.name,
      amount: calculatedPrice,
      paymentDate: getNowTimestampDisplay(),
      invoiceNumber: invoiceNo,
      planType: chosenPlan,
      paymentMode: 'Manual',
      transactionStatus: 'Success'
    };

    onUpdateCompanies(prev => prev.map(c => c.id === company.id ? {
      ...c,
      plan: chosenPlan,
      billingCycle: chosenCycle,
      subscriptionPrice: calculatedPrice,
      renewalDate: calculatedDate,
      paymentStatus: 'Paid',
      accountStatus: 'Active',
      status: 'Active'
    } : c));

    onUpdatePayments(prevTx => [newRecord, ...prevTx]);
    setSuccessMessage(`Subscription renewed successfully — Next renewal: ${formatDisplayDate(calculatedDate)}`);
    setRenewalConfirmCompany(null);
    setRenewalStep(1);
    setTimeout(() => setSuccessMessage(''), 4500);
  };

  const handleQuickExtend = (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    if (!company) return;

    const normalizedPlan = ((company.plan as string) === 'Growth' ? 'Professional' : company.plan) as 'Starter' | 'Professional' | 'Enterprise';
    const initialPlan = normalizedPlan || 'Starter';
    const initialCycle = company.billingCycle === 'Yearly' ? 'Yearly' : 'Monthly';

    setRenewalConfirmCompany(company);
    setRenewalStep(1);
    setRenewalPlan(initialPlan);
    setRenewalCycle(initialCycle);
    
    // Auto calculate extended date (30 days/365 days from active expiration or from today if expired/overdue)
    const days = initialCycle === 'Yearly' ? 365 : 30;
    const baseDate = company.renewalDate ? new Date(company.renewalDate) : new Date('2026-05-20');
    const todayVal = new Date('2026-05-20');
    const base = baseDate.getTime() < todayVal.getTime() ? todayVal : baseDate;
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    
    setNewRenewalDate(formatIsoDate(next));
    setSuccessMessage('');
  };

  const updateRenewalState = (plan: 'Starter' | 'Professional' | 'Enterprise', cycle: 'Monthly' | 'Yearly') => {
    setRenewalPlan(plan);
    setRenewalCycle(cycle);
    if (!renewalConfirmCompany) return;
    const days = cycle === 'Yearly' ? 365 : 30;
    const baseDate = renewalConfirmCompany.renewalDate ? new Date(renewalConfirmCompany.renewalDate) : new Date('2026-05-20');
    const todayVal = new Date('2026-05-20');
    const base = baseDate.getTime() < todayVal.getTime() ? todayVal : baseDate;
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    setNewRenewalDate(formatIsoDate(next));
  };

  const handleSavePlanSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    onUpdatePlans(prev => prev.map(p => p.id === editingPlan.id ? editingPlan : p));
    setEditingPlan(null);
  };

  const handleChangePlanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changingPlanCompany) return;
    
    const selectedPlan = plans.find(p => p.id === selectedPlanId);
    if (!selectedPlan) return;

    onUpdateCompanies(prev => prev.map(c => {
      if (c.id === changingPlanCompany.id) {
        return {
          ...c,
          plan: selectedPlan.name as any,
          subscriptionPrice: selectedPlan.priceMonthly,
          paymentStatus: 'Paid'
        };
      }
      return c;
    }));

    setChangingPlanCompany(null);
  };

  const handleExportPayments = () => {
    const headers = ['Invoice Number', 'Company Name', 'Plan Type', 'Amount', 'Date', 'Mode', 'Status'];
    const rows = payments.map(p => [
      p.invoiceNumber,
      p.companyName,
      p.planType,
      `₹${p.amount}`,
      p.paymentDate,
      p.paymentMode,
      p.transactionStatus
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `CoreHR_Transactions_Export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered companies safely safeguarded against missing fields
  const filteredCompanies = companies.filter(c => {
    if (!c) return false;
    const matchSearch = (c.name || '').toLowerCase().includes(companySearch.toLowerCase()) || 
                        (c.adminName || '').toLowerCase().includes(companySearch.toLowerCase());
    const matchPlan = !planFilter || (c.plan || '').toLowerCase() === planFilter.toLowerCase();
    const matchStatus = !statusFilter || (c.paymentStatus || '').toLowerCase() === statusFilter.toLowerCase();
    return matchSearch && matchPlan && matchStatus;
  });

  return (
    <div className="space-y-6">
      
      {/* ─── Metric Highlights ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
        <div className="bg-gradient-to-tr from-white to-slate-50 p-5 rounded-3xl shadow-md border border-gray-100 flex flex-col justify-between">
          <div className="flex items-start justify-between text-gray-500">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Monthly Recurring Revenue</div>
              <div className="mt-2 text-3xl font-extrabold text-gray-900">₹{mrr.toLocaleString('en-IN')}</div>
              <div className="mt-1 text-sm text-gray-500">Projected monthly run-rate</div>
            </div>
            <div className="text-blue-600 bg-blue-50 rounded-lg p-2">
              <DollarSign size={22} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="text-sm font-semibold text-green-600 flex items-center gap-2">
              <ArrowUpRight size={14} /> <span>+12.4%</span>
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="h-2 bg-green-400 rounded-full" style={{ width: '46%' }} />
            </div>
            <div className="text-xs text-gray-400">vs last month</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-md border border-gray-100 flex flex-col justify-between">
          <div className="flex items-start justify-between text-gray-500">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total SaaS Revenue</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">₹{totalRevenue.toLocaleString('en-IN')}</div>
              <div className="mt-1 text-sm text-gray-500">All processed transactions</div>
            </div>
            <div className="text-emerald-600 bg-emerald-50 rounded-lg p-2">
              <ArrowUpRight size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-md border border-gray-100 flex flex-col justify-between">
          <div className="flex items-start justify-between text-gray-500">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active Subscriptions</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{activePlansCount} <span className="text-sm font-medium text-gray-400">/ {companies.length}</span></div>
              <div className="mt-1 text-sm text-gray-500">Paid or trial workspaces</div>
            </div>
            <div className="text-indigo-600 bg-indigo-50 rounded-lg p-2">
              <UserCheck size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-md border border-gray-100 flex flex-col justify-between">
          <div className="flex items-start justify-between text-gray-500">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pending / Overdue</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{pendingPaymentsCount}</div>
              <div className="mt-1 text-sm text-rose-500 font-medium">Requires immediate renewal</div>
            </div>
            <div className="text-amber-600 bg-amber-50 rounded-lg p-2">
              <AlertTriangle size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-md border border-gray-100 flex flex-col justify-between">
          <div className="flex items-start justify-between text-gray-500">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expiring in 10 Days</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{expiringCount}</div>
              <div className="mt-1 text-sm text-gray-500">Pending renewals</div>
            </div>
            <div className="text-rose-600 bg-rose-50 rounded-lg p-2">
              <Calendar size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Premium Tab Bar ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
            activeTab === 'overview' 
              ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Building2 size={16} />
          Company Billing & Accounts
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
            activeTab === 'plans' 
              ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <CreditCard size={16} />
          Subscription Plans
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
            activeTab === 'payments' 
              ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <FileText size={16} />
          Payment Transactions
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 relative ${
            activeTab === 'alerts' 
              ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <ShieldAlert size={16} />
          Renewal Alerts
          {alertCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold animate-pulse">
              {alertCount}
            </span>
          )}
        </button>
      </div>

      {/* ─── TAB CONTENT: OVERVIEW (COMPANIES GRID/TABLE) ────────────────────── */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Controls */}
          <div className="p-6 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1 max-w-xl relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Search companies, domain, or admin..."
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-gray-400" />
                <select
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none bg-white text-gray-600"
                >
                  <option value="">All Plans</option>
                  {plans.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none bg-white text-gray-600"
              >
                <option value="">All Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Overdue">Overdue</option>
                <option value="Expired">Expired</option>
                <option value="Trial Active">Trial Active</option>
              </select>

              <Button
                onClick={handleExportPayments}
                className="py-2 px-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 font-semibold rounded-xl text-sm flex items-center gap-2"
              >
                <Download size={14} /> Export
              </Button>
            </div>
          </div>

          {successMessage && (
            <div className="mx-6 mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
              {successMessage}
            </div>
          )}

          {/* Companies as Workspace Cards */}
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCompanies.map(comp => {
              const renDate = comp.renewalDate ? new Date(comp.renewalDate) : today;
              const daysLeft = comp.renewalDate ? getDaysBetweenSafe(today, renDate) : null;
              const isSoon = daysLeft !== null ? (daysLeft <= 10 && daysLeft >= 0) : false;

              const statusBadge = () => {
                switch (comp.paymentStatus) {
                  case 'Paid': return 'bg-emerald-50 text-emerald-700';
                  case 'Pending': return 'bg-amber-50 text-amber-700';
                  case 'Overdue': return 'bg-rose-50 text-rose-700';
                  case 'Trial Active': return 'bg-sky-50 text-sky-700';
                  default: return 'bg-gray-100 text-gray-700';
                }
              };

              return (
                <div key={comp.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white text-sm shadow" style={{ backgroundColor: comp.primaryColor || '#3b82f6' }}>{comp.logo}</div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-gray-900 truncate">{comp.name}</h4>
                          <p className="text-xs text-gray-500 truncate">{comp.domain} • {comp.adminEmail}</p>
                        </div>

                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusBadge()}`}>
                          {comp.paymentStatus}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-4">
                        <div className="text-sm text-gray-700">
                          <div className="font-medium flex items-center gap-1.5">
                            {getPlanBadge(comp.plan)}
                          </div>
                          <div className="text-xs text-gray-500 font-semibold mt-1">
                            ₹{(comp.subscriptionPrice || 0).toLocaleString('en-IN')} / {comp.billingCycle === 'Yearly' ? 'year' : 'month'}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-800">Renewal</div>
                          <div className="text-xs text-gray-500">{formatDisplayDate(comp.renewalDate) || '—'}{isSoon ? <span className="ml-2 text-amber-600 font-semibold">• {daysLeft}d</span> : null}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setSelectedPlanId(plans.find(p => p.name === comp.plan)?.id || plans[0].id); setChangingPlanCompany(comp); }}
                            className="px-3 py-1 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Manage
                          </button>
                          <button
                            onClick={() => handleQuickExtend(comp.id)}
                            className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-lg text-sm"
                          >
                            Renew
                          </button>
                          <button
                            onClick={() => toggleCompanyStatus(comp.id)}
                            className="px-3 py-1 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                          >
                            {comp.accountStatus === 'Active' ? 'Suspend' : 'Activate'}
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowInvoiceModal(comp)}
                            className="text-sm text-gray-500 hover:text-gray-800"
                            title="View latest invoice"
                          >
                            View Invoice
                          </button>
                          <ChevronRight size={16} className="text-gray-300" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB CONTENT: PLANS MANAGEMENT ───────────────────────────────────── */}
      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {plans.map(plan => (
            <div key={plan.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between hover:shadow-lg transition-all duration-300">
              <div>
                <div className="flex justify-between items-start">
                  <h4 className="text-xl font-bold text-gray-800">{plan.name}</h4>
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                    SaaS Tier
                  </span>
                </div>
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold text-gray-800">₹{plan.priceMonthly}</span>
                  <span className="text-gray-400 text-sm ml-1">/ month</span>
                </div>
                
                {/* Plan parameters */}
                <ul className="mt-6 space-y-3.5 text-sm text-gray-600 border-t border-gray-50 pt-5">
                  <li className="flex items-center gap-2.5">
                    <Users size={16} className="text-blue-500" />
                    <span>Up to <strong>{plan.employeeLimit === 9999 ? 'Unlimited' : plan.employeeLimit}</strong> Active Employees</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <UserCheck size={16} className="text-blue-500" />
                    <span>Up to <strong>{plan.hrLimit === 9999 ? 'Unlimited' : plan.hrLimit}</strong> HR Admins</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CreditCard size={16} className="text-blue-500" />
                    <span><strong>{plan.storageLimit}</strong> Secure Document Vault</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 size={16} className={plan.payrollAccess ? 'text-emerald-500' : 'text-gray-300'} />
                    <span className={plan.payrollAccess ? 'text-gray-700' : 'text-gray-400 line-through'}>
                      Payroll Processing & Payslips
                    </span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 size={16} className={plan.documentAccess ? 'text-emerald-500' : 'text-gray-300'} />
                    <span className={plan.documentAccess ? 'text-gray-700' : 'text-gray-400 line-through'}>
                      HR Templates & Letter Systems
                    </span>
                  </li>
                </ul>
              </div>

              <div className="mt-8">
                <Button
                  onClick={() => setEditingPlan(plan)}
                  className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <Edit3 size={15} />
                  Adjust Plan Thresholds
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── TAB CONTENT: TRANSACTION HISTORIES ──────────────────────────────── */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h4 className="font-bold text-gray-800">SaaS Transaction History</h4>
              <p className="text-xs text-gray-400">Exportable payment receipts ledger</p>
            </div>
            
            <Button
              onClick={handleExportPayments}
              className="py-2 px-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
            >
              <Download size={14} />
              Export Records (CSV)
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Invoice ID</th>
                  <th className="py-4 px-6">Company Name</th>
                  <th className="py-4 px-6">Pricing Tier</th>
                  <th className="py-4 px-6">Transaction Date</th>
                  <th className="py-4 px-6">Payment Mode</th>
                  <th className="py-4 px-6">Amount</th>
                  <th className="py-4 px-6 text-right">Gateway Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-600">
                {payments.map(pay => (
                  <tr key={pay.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6 font-mono text-xs font-semibold text-gray-500">
                      {pay.invoiceNumber}
                    </td>
                    <td className="py-4 px-6 font-semibold text-gray-800">
                      {pay.companyName}
                    </td>
                    <td className="py-4 px-6">
                      {pay.planType}
                    </td>
                    <td className="py-4 px-6 text-xs text-gray-400">
                      {pay.paymentDate}
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                        {pay.paymentMode}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-bold text-gray-800">
                      ₹{pay.amount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        pay.transactionStatus === 'Success' ? 'bg-emerald-50 text-emerald-700' :
                        pay.transactionStatus === 'Failed' ? 'bg-rose-50 text-rose-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {pay.transactionStatus === 'Success' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {pay.transactionStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB CONTENT: RENEWAL & EXPIRE ALERTS ──────────────────────────────── */}
      {activeTab === 'alerts' && (
        <div className="space-y-4 font-sans text-left">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between">
            <div>
              <h4 className="font-bold text-gray-800 text-lg animate-in fade-in duration-200">Subscription Alerts & Action Center</h4>
              <p className="text-xs text-gray-400 mt-1">Real-time status tracking for trial expirations, unpaid invoices, and administrative holds.</p>
            </div>
            {alertCount > 0 && (
              <span className="px-3 py-1 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold rounded-full animate-pulse">
                {alertCount} Alerts Pending
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4">
            {dynamicAlerts.map(alertItem => {
              const comp = alertItem.company;
              const isSusp = comp.accountStatus === 'Suspended';
              
              return (
                <div 
                  key={`${comp.id}-${alertItem.type}`} 
                  className={`p-5 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all duration-200 hover:shadow-md ${alertItem.bgColor} ${alertItem.borderColor}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl flex items-center justify-center ${alertItem.badgeColor} border`}>
                      {alertItem.type === 'Suspended' ? (
                        <XCircle size={22} />
                      ) : alertItem.type === 'Overdue' ? (
                        <AlertTriangle size={22} />
                      ) : (
                        <ShieldAlert size={22} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center flex-wrap gap-2">
                        <h5 className="font-bold text-gray-800 text-base">{comp.name}</h5>
                        <span className="text-xs text-gray-400">({comp.domain})</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${alertItem.badgeColor}`}>
                          {alertItem.type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                        {alertItem.message} Workspace access is currently {isSusp ? 'fully locked' : 'restricted'} for corporate operations.
                      </p>
                      
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="px-2.5 py-1 bg-white border border-gray-150 text-gray-600 rounded-lg">
                          Plan: <strong className="text-gray-800">{comp.plan}</strong>
                        </span>
                        <span className="px-2.5 py-1 bg-white border border-gray-150 text-gray-600 rounded-lg">
                          Price: <strong className="text-gray-800">₹{comp.subscriptionPrice?.toLocaleString('en-IN')}/mo</strong>
                        </span>
                        {comp.renewalDate && (
                          <span className="px-2.5 py-1 bg-white border border-gray-150 text-gray-650 text-gray-600 rounded-lg">
                            Elapsed Date: <strong className="text-gray-800">{formatDisplayDate(comp.renewalDate)}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:self-center">
                    <button
                      onClick={() => {
                        alert(`Successfully dispatched billing notification & billing invoice copy to ${comp.adminEmail}!`);
                      }}
                      className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Send Reminder
                    </button>

                    <button
                      onClick={() => setActiveTab('overview')}
                      className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      View Billing
                    </button>

                    <button
                      onClick={() => toggleCompanyStatus(comp.id)}
                      className={`px-3.5 py-2 border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isSusp 
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent'
                          : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                      }`}
                    >
                      {isSusp ? 'Reactivate Access' : 'Suspend Access'}
                    </button>

                    <button
                      onClick={() => handleQuickExtend(comp.id)}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer animate-pulse"
                    >
                      Renew Plan
                    </button>
                  </div>
                </div>
              );
            })}

            {alertCount === 0 && (
              <div className="bg-emerald-50/30 rounded-3xl border border-emerald-100/50 p-12 text-center flex flex-col items-center justify-center text-gray-500 animate-in fade-in duration-300 w-full col-span-full">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 size={36} />
                </div>
                <h5 className="font-bold text-emerald-800 text-lg">All Accounts in Good Standing</h5>
                <p className="text-xs text-emerald-600/70 max-w-sm mt-1 leading-relaxed">
                  No overdue renewals, trial expiration events, or administrative holds detected. All tenant portals are operational.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL: CHANGE SUBSCRIPTION PLAN ─────────────────────────────────── */}
      {changingPlanCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h4 className="font-bold text-gray-800">Change Subscription Plan</h4>
              <button 
                onClick={() => setChangingPlanCompany(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleChangePlanSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Company Name
                </label>
                <p className="mt-1 font-bold text-gray-700">{changingPlanCompany.name}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Current Active Plan
                </label>
                <p className="mt-1 font-medium text-gray-600">{changingPlanCompany.plan}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Select New Pricing Tier
                </label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ₹{p.priceMonthly}/mo (Max {p.employeeLimit === 9999 ? 'Unlimited' : p.employeeLimit} employees)
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-50">
                <Button
                  type="button"
                  onClick={() => setChangingPlanCompany(null)}
                  className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold"
                >
                  Confirm Plan Switch
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: DOUBLE RENEWAL CONFIRMATION FLOW ────────────────────────── */}
      {renewalConfirmCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-200 text-left">
            {renewalStep === 1 ? (
              // STEP 1 — FIRST CONFIRMATION MODAL
              <div className="flex flex-col h-full font-sans">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-gray-800 text-lg">Confirm Subscription Renewal?</h4>
                    <p className="text-xs text-gray-500 mt-1">Review plan tier, billing cycle duration, and calculated cost.</p>
                  </div>
                  <button
                    onClick={() => { setRenewalConfirmCompany(null); setRenewalStep(1); }}
                    className="text-gray-400 hover:text-gray-600 bg-transparent border-none text-base cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  {/* Select Subscription Plan Dropdown */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Select Subscription Plan
                    </label>
                    <select
                      value={renewalPlan}
                      onChange={(e) => updateRenewalState(e.target.value as any, renewalCycle)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="Starter">Starter Plan (₹1,999/mo | ₹19,999/yr)</option>
                      <option value="Professional">Professional Plan (₹4,999/mo | ₹49,999/yr)</option>
                      <option value="Enterprise">Enterprise Plan (₹12,999/mo | ₹1,29,999/yr)</option>
                    </select>
                  </div>

                  {/* Billing Duration Options */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      Billing Duration
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => updateRenewalState(renewalPlan, 'Monthly')}
                        className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border text-center transition-all ${
                          renewalCycle === 'Monthly'
                            ? 'border-blue-600 bg-blue-50/50 text-blue-900 shadow-sm ring-1 ring-blue-500'
                            : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                        }`}
                      >
                        <span className="font-bold text-sm">Monthly Plan</span>
                        <span className="text-[10px] text-gray-400 mt-1">Adds 30 Days</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => updateRenewalState(renewalPlan, 'Yearly')}
                        className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border text-center transition-all relative overflow-hidden ${
                          renewalCycle === 'Yearly'
                            ? 'border-blue-600 bg-blue-50/50 text-blue-900 shadow-sm ring-1 ring-blue-500'
                            : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                        }`}
                      >
                        <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-amber-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-bl-lg uppercase tracking-wide">
                          Save ~16%
                        </div>
                        <span className="font-bold text-sm">Annual Plan</span>
                        <span className="text-[10px] text-gray-400 mt-1">Adds 365 Days</span>
                      </button>
                    </div>
                  </div>

                  {/* Calculated Pricing Metrics & Dates */}
                  <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div>
                      <p className="font-semibold text-gray-400 uppercase tracking-wider text-[9px]">Calculated Cost</p>
                      <p className="mt-1 font-bold text-blue-600 text-sm font-mono">
                        ₹{planPricing[renewalPlan][renewalCycle === 'Yearly' ? 'Yearly' : 'Monthly'].toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-400 uppercase tracking-wider text-[9px]">Duration</p>
                      <p className="mt-1 font-bold text-gray-800 text-sm">
                        {renewalCycle === 'Yearly' ? '365 Days' : '30 Days'}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-400 uppercase tracking-wider text-[9px]">Billing Cycle</p>
                      <p className="mt-1 font-bold text-gray-800 text-sm">
                        {renewalCycle === 'Yearly' ? 'Annual' : 'Monthly'}
                      </p>
                    </div>
                  </div>

                  {/* DUPLICATE RENEWAL CHECK */}
                  {renewalConfirmCompany.renewalDate && (() => {
                    const todayVal = new Date('2026-05-20');
                    const renDate = new Date(renewalConfirmCompany.renewalDate);
                    const isActive = renDate.getTime() > todayVal.getTime();
                    
                    if (isActive) {
                      return (
                        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3">
                          <span className="text-rose-600 text-base leading-none">❌</span>
                          <div>
                            <p className="text-xs font-bold text-rose-800">Subscription already active until {formatDisplayDate(renewalConfirmCompany.renewalDate)}</p>
                            <p className="text-[10px] text-rose-600 mt-0.5">To prevent duplicate charges, manual renewals are locked for active accounts.</p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="text-xs text-gray-600">
                    <p className="font-semibold text-gray-800">Target Renewal Extension Date</p>
                    <input
                      type="date"
                      value={newRenewalDate}
                      onChange={(e) => setNewRenewalDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                    />
                  </div>
                </div>

                <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
                  <button
                    type="button"
                    onClick={() => { setRenewalConfirmCompany(null); setRenewalStep(1); }}
                    className="px-4.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={renewalConfirmCompany.renewalDate ? new Date(renewalConfirmCompany.renewalDate).getTime() > new Date('2026-05-20').getTime() : false}
                    onClick={() => setRenewalStep(2)}
                    className="px-4.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : (
              // STEP 2 — FINAL BILLING CONFIRMATION
              <div className="flex flex-col h-full font-sans">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-gray-800 text-lg">Final Billing Confirmation</h4>
                    <p className="text-xs text-gray-500 mt-1">Second security verification before executing manual plan renewal.</p>
                  </div>
                  <button
                    onClick={() => { setRenewalConfirmCompany(null); setRenewalStep(1); }}
                    className="text-gray-400 hover:text-gray-600 bg-transparent border-none text-base cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-amber-800">You are about to renew:</p>
                      <p className="text-sm font-bold text-gray-800 mt-1">{renewalConfirmCompany.name}</p>
                    </div>
                  </div>

                  <div className="text-xs text-gray-600 space-y-2">
                    <p className="font-bold text-gray-700 uppercase tracking-wider text-[10px]">Executing this action will instantly:</p>
                    <ul className="list-disc pl-4 space-y-1.5 text-gray-655 text-gray-600">
                      <li>Configure subscription plan to <strong className="text-gray-800">{renewalPlan} ({renewalCycle === 'Yearly' ? 'Annual' : 'Monthly'})</strong></li>
                      <li>Extend subscription renewal date to <strong className="text-gray-800">{formatDisplayDate(newRenewalDate)}</strong></li>
                      <li>Generate payment and manual ledger entries in transaction database</li>
                      <li>Increment lifetime billing revenue by <strong className="text-blue-600">₹{planPricing[renewalPlan][renewalCycle === 'Yearly' ? 'Yearly' : 'Monthly'].toLocaleString('en-IN')}</strong></li>
                      <li>Re-activate all locked corporate HR/employee dashboard portals</li>
                    </ul>
                  </div>
                </div>

                <div className="p-6 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <button
                    type="button"
                    onClick={() => setRenewalStep(1)}
                    className="px-4.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (renewalConfirmCompany) {
                        const cost = planPricing[renewalPlan][renewalCycle === 'Yearly' ? 'Yearly' : 'Monthly'];
                        performRenewal(renewalConfirmCompany, renewalPlan, renewalCycle, cost, newRenewalDate);
                      }
                    }}
                    className="px-4.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Confirm Renewal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL: ADJUST PLAN PARAMETERS ─────────────────────────────────── */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h4 className="font-bold text-gray-800">Edit Plan Thresholds ({editingPlan.name})</h4>
              <button 
                onClick={() => setEditingPlan(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSavePlanSettings} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Monthly Price (₹)
                  </label>
                  <input
                    type="number"
                    value={editingPlan.priceMonthly}
                    onChange={(e) => setEditingPlan({ ...editingPlan, priceMonthly: Number(e.target.value) })}
                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Yearly Price (₹)
                  </label>
                  <input
                    type="number"
                    value={editingPlan.priceYearly}
                    onChange={(e) => setEditingPlan({ ...editingPlan, priceYearly: Number(e.target.value) })}
                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Employee Capacity Limit
                  </label>
                  <input
                    type="number"
                    value={editingPlan.employeeLimit}
                    onChange={(e) => setEditingPlan({ ...editingPlan, employeeLimit: Number(e.target.value) })}
                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    HR Admin Limit
                  </label>
                  <input
                    type="number"
                    value={editingPlan.hrLimit}
                    onChange={(e) => setEditingPlan({ ...editingPlan, hrLimit: Number(e.target.value) })}
                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Storage Capacity limit
                </label>
                <input
                  type="text"
                  value={editingPlan.storageLimit}
                  onChange={(e) => setEditingPlan({ ...editingPlan, storageLimit: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPlan.payrollAccess}
                    onChange={(e) => setEditingPlan({ ...editingPlan, payrollAccess: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="text-sm font-semibold text-gray-700">Enable Payroll module access</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPlan.documentAccess}
                    onChange={(e) => setEditingPlan({ ...editingPlan, documentAccess: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="text-sm font-semibold text-gray-700">Enable Custom Letter Templates access</span>
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-50">
                <Button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold"
                >
                  Save Settings
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: VIEW LATEST INVOICE ───────────────────────────────────── */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-gray-800">Latest Invoice — {showInvoiceModal.name}</h4>
                <p className="text-xs text-gray-400">Recent billing activity for this workspace</p>
              </div>
              <button onClick={() => setShowInvoiceModal(null)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            <div className="p-6">
              {(() => {
                const latest = payments.find(p => p.companyId === showInvoiceModal.id);
                if (!latest) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      No invoices found for this company.
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-gray-500">Invoice</div>
                        <div className="font-semibold text-gray-800">{latest.invoiceNumber}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Amount</div>
                        <div className="font-bold text-gray-900">₹{latest.amount.toLocaleString('en-IN')}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <div className="text-xs text-gray-400">Company</div>
                        <div className="font-medium text-gray-800">{latest.companyName}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Date</div>
                        <div className="font-medium text-gray-800">{latest.paymentDate}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Plan</div>
                        <div className="font-medium text-gray-800">{latest.planType}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Status</div>
                        <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${latest.transactionStatus === 'Success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {latest.transactionStatus}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 flex items-center justify-end gap-3">
                      <Button onClick={() => { setShowInvoiceModal(null); }} className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-sm">Close</Button>
                      <Button onClick={() => { /* future: download invoice PDF */ }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm">Download PDF</Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
