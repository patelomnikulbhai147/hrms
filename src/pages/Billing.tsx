import React, { useState } from 'react';
import {
  CreditCard, Search, Filter, ShieldAlert, CheckCircle2, AlertTriangle,
  XCircle, Edit3, ArrowUpRight, DollarSign, Users,
  FileText, Download, UserCheck,
  Building2, Plus, Trash2
} from 'lucide-react';
import { Company, SubscriptionPlan, PaymentRecord, Employee } from '../data/mockData';
import { type UserAccount } from './Login';
import { Button } from '../components/ui/Button';
import {
  calculateSubscriptionAnalytics,
  getSubscriptionAlertsList,
  getDaysRemaining
} from '../utils/subscriptionUtils';

interface BillingProps {
  companies: Company[];
  onUpdateCompanies: (updater: Company[] | ((prev: Company[]) => Company[])) => void;
  plans: SubscriptionPlan[];
  onUpdatePlans: (updater: SubscriptionPlan[] | ((prev: SubscriptionPlan[]) => SubscriptionPlan[])) => void;
  payments: PaymentRecord[];
  onUpdatePayments: (updater: PaymentRecord[] | ((prev: PaymentRecord[]) => PaymentRecord[])) => void;
  employees: Employee[];
  onUpdateEmployees: (updater: Employee[] | ((prev: Employee[]) => Employee[])) => void;
  userAccounts: UserAccount[];
  onUpdateAccounts: (updater: UserAccount[] | ((prev: UserAccount[]) => UserAccount[])) => void;
  onStartMasquerade: (companyId: string) => void;
}

export const Billing: React.FC<BillingProps> = ({
  companies,
  onUpdateCompanies,
  plans,
  onUpdatePlans,
  payments,
  onUpdatePayments,
  employees,
  onUpdateEmployees,
  userAccounts,
  onUpdateAccounts,
  onStartMasquerade
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'payments' | 'alerts'>('overview');

  // Paywall, commercial pricing & alert state parameters
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallParentCompany, setPaywallParentCompany] = useState<Company | null>(null);
  const globalBranchPrice = 999;
  const [successMessage, setSuccessMessage] = useState('');

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
  // Branch Management state
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Company | null>(null);
  const [parentCompanyIdForBranch, setParentCompanyIdForBranch] = useState<string>('');
  const [branchForm, setBranchForm] = useState({
    name: '',
    branchCode: '',
    location: '',
    email: '',
    phone: '',
    adminName: '',
    employeeCapacity: 200,
    status: 'Active' as 'Active' | 'Inactive',
    pfRate: 12,
    esicRate: 3.25,
    basicPercent: 50,
    profTaxRate: 200,
    overtimeRate: 1.5,
    enableBroadcasts: true,
    enableSystemAlerts: true
  });

  const handleOpenCreateBranch = (parentId: string) => {
    setEditingBranch(null);
    setParentCompanyIdForBranch(parentId);
    setBranchForm({
      name: '',
      branchCode: '',
      location: '',
      email: '',
      phone: '',
      adminName: '',
      employeeCapacity: 200,
      status: 'Active',
      pfRate: 12,
      esicRate: 3.25,
      basicPercent: 50,
      profTaxRate: 200,
      overtimeRate: 1.5,
      enableBroadcasts: true,
      enableSystemAlerts: true
    });
    setBranchModalOpen(true);
  };

  const handleOpenEditBranch = (branch: Company) => {
    setEditingBranch(branch);
    setParentCompanyIdForBranch(branch.parentCompanyId || 'c-gcri');
    setBranchForm({
      name: branch.name,
      branchCode: branch.branchCode || '',
      location: branch.address || '',
      email: branch.email || branch.adminEmail || '',
      phone: branch.phone || '',
      adminName: branch.adminName || '',
      employeeCapacity: branch.employeeCapacity || 200,
      status: branch.status === 'Active' ? 'Active' : 'Inactive',
      pfRate: branch.pfRate || 12,
      esicRate: branch.esicRate || 3.25,
      basicPercent: branch.basicPercent || 50,
      profTaxRate: branch.profTaxRate || 200,
      overtimeRate: branch.overtimeRate || 1.5,
      enableBroadcasts: true,
      enableSystemAlerts: true
    });
    setBranchModalOpen(true);
  };

  const handleRemoveBranch = (branchId: string) => {
    const branch = companies.find(c => c.id === branchId);
    if (!branch) return;

    const confirmDelete = confirm(`Are you sure you want to remove the branch "${branch.branchName || branch.name}"?\n\nThis will NOT delete employees, payroll history, or documents permanently.`);
    if (!confirmDelete) return;

    // Ask for reassignment or archive
    const reassign = confirm(`Employee Reassignment Confirmation:\n\nClick OK to reassign all "${branch.name}" employees to the Parent Head Office (GCRI Ahmedabad).\n\nClick Cancel to mark them as Inactive (Archived) but preserve their records.`);
    
    if (reassign) {
      const updated = employees.map(emp => {
        if (emp.companyId === branchId) {
          return { ...emp, companyId: 'c-gcri', branchLocation: 'Ahmedabad' };
        }
        return emp;
      });
      onUpdateEmployees(updated);
    } else {
      const updated = employees.map(emp => {
        if (emp.companyId === branchId) {
          return { ...emp, status: 'Inactive' as const };
        }
        return emp;
      });
      onUpdateEmployees(updated);
    }

    // Delete company/branch
    const nextCompanies = companies.filter(c => c.id !== branchId);
    onUpdateCompanies(nextCompanies);
    alert('Branch removed successfully. Employees, payroll records, and documents were preserved.');
  };

  const handleToggleBranchStatus = (branchId: string, current: 'Active' | 'Inactive' | 'Pending') => {
    const nextStatus = current === 'Active' ? 'Inactive' : 'Active';
    onUpdateCompanies(prev => prev.map(c => c.id === branchId ? { ...c, status: nextStatus, accountStatus: nextStatus === 'Inactive' ? 'Suspended' : 'Active' } : c));
  };

  const handleBuyBranchLicense = (parentId: string) => {
    const parent = companies.find(c => c.id === parentId);
    if (!parent) return;

    const updatedCompanies = companies.map(c => {
      if (c.id === parentId) {
        return {
          ...c,
          purchasedAdditionalBranches: (c.purchasedAdditionalBranches || 0) + 1
        };
      }
      return c;
    });
    
    const newTx: PaymentRecord = {
      id: `inv-${Date.now()}`,
      companyId: parent.id,
      companyName: parent.name,
      amount: globalBranchPrice,
      paymentDate: new Date().toISOString().split('T')[0],
      invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      planType: `${parent.plan} Plan - Branch License Add-On`,
      paymentMode: 'Card',
      transactionStatus: 'Success'
    };

    onUpdateCompanies(updatedCompanies);
    onUpdatePayments([newTx, ...payments]);

    setSuccessMessage(`Branch License Add-On (₹${globalBranchPrice}) purchased successfully! Deployment quota upgraded.`);
    setTimeout(() => setSuccessMessage(''), 5000);
    setPaywallOpen(false);
  };

  const handleUpdateBranchCapacity = (branchId: string, cap: number) => {
    onUpdateCompanies(prev => prev.map(c => c.id === branchId ? { ...c, employeeCapacity: cap } : c));
    setSuccessMessage('Branch employee capacity customized successfully.');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleUpdateBranchRenewal = (branchId: string, date: string) => {
    onUpdateCompanies(prev => prev.map(c => c.id === branchId ? { ...c, branchRenewalDate: date } : c));
    setSuccessMessage('Branch renewal date adjusted successfully.');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleToggleBranchLicenseStatus = (branchId: string, current: string) => {
    const nextStatus = current === 'Active License' ? 'Suspended' : 'Active License';
    onUpdateCompanies(prev => prev.map(c => c.id === branchId ? { ...c, branchLicenseStatus: nextStatus as any } : c));
    setSuccessMessage(`Branch license status changed to ${nextStatus}.`);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleSaveBranch = () => {
    if (!branchForm.name || !branchForm.branchCode || !branchForm.email || !branchForm.adminName) {
      alert('Please fill in all strictly required fields (Branch Name, Branch Code, Branch Email, and Branch Admin).');
      return;
    }
    
    if (editingBranch) {
      // Edit mode
      const updatedCompanies = companies.map(c => {
        if (c.id === editingBranch.id) {
          return {
            ...c,
            name: branchForm.name,
            branchName: branchForm.name.replace(/^GCRI\s+/, ''),
            branchCode: branchForm.branchCode,
            location: branchForm.location,
            address: branchForm.location,
            email: branchForm.email,
            adminEmail: branchForm.email,
            phone: branchForm.phone,
            adminName: branchForm.adminName,
            employeeCapacity: Number(branchForm.employeeCapacity) || 200,
            status: branchForm.status,
            pfRate: Number(branchForm.pfRate) || 12,
            esicRate: Number(branchForm.esicRate) || 3.25,
            basicPercent: Number(branchForm.basicPercent) || 50,
            profTaxRate: Number(branchForm.profTaxRate) || 200,
            overtimeRate: Number(branchForm.overtimeRate) || 1.5,
          };
        }
        return c;
      });
      onUpdateCompanies(updatedCompanies);
      alert('Branch updated successfully.');
    } else {
      // Quota limit validation
      const parentCompany = companies.find(c => c.id === (parentCompanyIdForBranch || 'c-gcri'));
      if (parentCompany) {
        const parentPlan = plans.find(p => p.name === parentCompany.plan) || plans[2];
        const includedBranchLimit = parentPlan.includedBranchLimit;
        const purchasedAdditionalBranches = parentCompany.purchasedAdditionalBranches || 0;
        const currentBranches = companies.filter(c => c.parentCompanyId === parentCompany.id);
        
        if (currentBranches.length >= includedBranchLimit + purchasedAdditionalBranches) {
          // Block deployment & trigger paywall
          setPaywallParentCompany(parentCompany);
          setPaywallOpen(true);
          setBranchModalOpen(false);
          return;
        }
      }

      // Create mode
      const newId = `c-br-${Date.now()}`;
      const newBranchObj: Company = {
        id: newId,
        parentCompanyId: parentCompanyIdForBranch || 'c-gcri',
        name: branchForm.name,
        branchName: branchForm.name.replace(/^GCRI\s+/, ''),
        branchCode: branchForm.branchCode,
        domain: `${branchForm.name.toLowerCase().replace(/\s+/g, '')}.gcri.in`,
        adminName: branchForm.adminName,
        adminEmail: branchForm.email,
        phone: branchForm.phone,
        industry: 'Healthcare & Research',
        status: branchForm.status,
        employeeCount: 0,
        joinDate: new Date().toISOString().split('T')[0],
        plan: 'Enterprise',
        logo: 'GC',
        pfRate: Number(branchForm.pfRate) || 12,
        esicRate: Number(branchForm.esicRate) || 3.25,
        basicPercent: Number(branchForm.basicPercent) || 50,
        profTaxRate: Number(branchForm.profTaxRate) || 200,
        overtimeRate: Number(branchForm.overtimeRate) || 1.5,
        address: branchForm.location,
        email: branchForm.email,
        primaryColor: '#6366f1',
        headerText: `${branchForm.name.toUpperCase()} REGIONAL CENTER`,
        footerText: `${branchForm.name} · Subsidiary of Gujarat Cancer Research Institute`,
        signatureText: `${branchForm.adminName}, Branch Director`,
        themeStyle: 'Modern',
        paymentStatus: 'Trial Active',
        renewalDate: '2027-12-31',
        subscriptionPrice: 0,
        billingCycle: 'Monthly',
        accountStatus: 'Active',
        branchLicenseStatus: 'Active License',
        branchRenewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        employeeCapacity: Number(branchForm.employeeCapacity) || 200,
        payrollLoad: 0,
        storageUsed: '0.1 GB',
        activeHrUsers: 1,
        monthlyUsage: 10,
        branchPriceAddon: 999
      };

      // Auto provision Branch Admin user account!
      const newAdminUser: UserAccount = {
        id: `u-ba-${Date.now()}`,
        name: branchForm.adminName,
        email: branchForm.email,
        username: branchForm.email.split('@')[0],
        passwordStr: 'welcome123',
        role: 'Company Head',
        companyId: newId,
        status: 'Active',
        avatar: branchForm.adminName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      };

      onUpdateAccounts([...userAccounts, newAdminUser]);
      onUpdateCompanies([...companies, newBranchObj]);
      alert(`Branch created successfully.\n\nGenerated Branch Admin Account:\nLogin ID: ${newAdminUser.username}\nPassword: ${newAdminUser.passwordStr}`);
    }
    
    setBranchModalOpen(false);
  };

  // Form states
  const [newRenewalDate, setNewRenewalDate] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');

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

  const getNowTimestampDisplay = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${formatIsoDate(now)} ${hours}:${minutes}`;
  };

  const dynamicAlerts = getSubscriptionAlertsList(companies);
  const alertCount = dynamicAlerts.length;
  const parentCompanies = companies.filter(c => !c.parentCompanyId);

  // ─── SaaS Metrics Calculations ──────────────────────────────────────────────
  const analytics = calculateSubscriptionAnalytics(companies, plans);

  const activePlansCount = analytics.activeSubscriptions;
  const pendingPaymentsCount = analytics.pendingRenewals;
  const mrr = analytics.monthlyRevenue;

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
    if (c.parentCompanyId) return false;
    const matchSearch = (c.name || '').toLowerCase().includes(companySearch.toLowerCase()) ||
      (c.adminName || '').toLowerCase().includes(companySearch.toLowerCase());
    const matchPlan = !planFilter || (c.plan || '').toLowerCase() === planFilter.toLowerCase();
    const matchStatus = !statusFilter || (c.paymentStatus || '').toLowerCase() === statusFilter.toLowerCase();
    return matchSearch && matchPlan && matchStatus;
  });

  return (
    <div className="space-y-6">
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-250 text-emerald-800 rounded-2xl text-xs flex items-center gap-2.5 shadow-sm animate-pulse">
          <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* ─── Metric Highlights ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
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
              <div className="mt-2 text-2xl font-bold text-gray-900">{activePlansCount} <span className="text-sm font-medium text-gray-400">/ {parentCompanies.length}</span></div>
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

      </div>

      {/* ─── Premium Tab Bar ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${activeTab === 'overview'
            ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
        >
          <Building2 size={16} />
          Company Billing & Accounts
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${activeTab === 'plans'
            ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
        >
          <CreditCard size={16} />
          Subscription Plans
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${activeTab === 'payments'
            ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
        >
          <FileText size={16} />
          Payment Transactions
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 relative ${activeTab === 'alerts'
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

          {/* Companies as Workspace Cards */}
          <div className="p-6 space-y-6">
            {filteredCompanies.map(comp => {
              const compBranches = companies.filter(c => c.parentCompanyId === comp.id);
              const branchIds = [comp.id, ...compBranches.map(b => b.id)];
              const parentEmployeesCount = employees.filter(emp => emp.companyId === comp.id).length;
              const totalWorkforce = employees.filter(emp => branchIds.includes(emp.companyId)).length;

              const daysLeft = getDaysRemaining(comp.renewalDate);
              const isSoon = daysLeft !== null ? (daysLeft <= 10 && daysLeft >= 0) : false;

              const compPlan = plans.find(p => p.name === comp.plan) || plans[0];
              const includedBranchLimit = compPlan.includedBranchLimit || 0;
              const purchasedAdditionalBranches = comp.purchasedAdditionalBranches || 0;
              const allowedBranchLimit = includedBranchLimit + purchasedAdditionalBranches;
              const isSingleCompanyMode = allowedBranchLimit === 0;

              const statusBadge = () => {
                switch (comp.paymentStatus) {
                  case 'Paid': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
                  case 'Pending': return 'bg-amber-50 text-amber-700 border border-amber-100';
                  case 'Overdue': return 'bg-rose-50 text-rose-700 border border-rose-100';
                  case 'Trial Active': return 'bg-sky-50 text-sky-700 border border-sky-100';
                  default: return 'bg-gray-100 text-gray-700 border border-gray-200';
                }
              };

              return (
                <div key={comp.id} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  {/* Parent Company Header */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-white text-lg shadow-sm" style={{ backgroundColor: comp.primaryColor || '#3b82f6' }}>
                        {comp.logo}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-bold text-gray-900">{comp.name}</h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase tracking-wider">Parent Company</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">{comp.domain} • Admin: {comp.adminName} ({comp.adminEmail})</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-bold ${statusBadge()}`}>
                        {comp.paymentStatus}
                      </span>
                      <button
                        onClick={() => { setSelectedPlanId(plans.find(p => p.name === comp.plan)?.id || plans[0].id); setChangingPlanCompany(comp); }}
                        className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                      >
                        Change Plan
                      </button>
                      <button
                        onClick={() => handleQuickExtend(comp.id)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs"
                      >
                        Renew Subscription
                      </button>
                    </div>
                  </div>

                  {/* High-Fidelity Combined Summary Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-5 bg-slate-50/50 rounded-2xl px-5 mt-5 border border-slate-100/50">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Subscription Tier</div>
                      <div className="mt-1 flex items-center gap-2">
                        {getPlanBadge(comp.plan)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Combined Workforce</div>
                      <div className="mt-1 text-sm font-extrabold text-slate-800">
                        {totalWorkforce} <span className="text-[10px] font-normal text-slate-500">Employees (Head Office: {parentEmployeesCount})</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Subsidiary Branches</div>
                      <div className="mt-1 text-sm font-extrabold text-slate-800">
                        {isSingleCompanyMode ? (
                          <span className="text-slate-400 font-normal text-xs">Disabled (Single Office)</span>
                        ) : (
                          <span>
                            {compBranches.length} <span className="text-[10px] font-normal text-slate-500">Active (Quota: {allowedBranchLimit})</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Consolidated Renewal</div>
                      <div className="mt-1 text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <span>{formatDisplayDate(comp.renewalDate) || '—'}</span>
                        {isSoon && <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">Expires in {daysLeft}d</span>}
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Layout Adaptation */}
                  {isSingleCompanyMode ? (
                    <div className="mt-6 p-4 rounded-2xl bg-amber-50 border border-amber-100/60 text-amber-800 flex items-start gap-3">
                      <AlertTriangle size={18} className="mt-0.5 text-amber-600 flex-shrink-0" />
                      <div className="text-xs space-y-1">
                        <div className="font-bold">⭐ Startup Mode Enabled</div>
                        <p className="text-amber-700/90 leading-relaxed">
                          Your workspace is operating under a simple Single-Office framework because you are on the <strong>{comp.plan} Plan</strong>. Subsidiary branches, regional billing pipelines, and multi-branch management systems are cleanly hidden. Upgrade your plan to Professional or Enterprise to unlock multi-branch SaaS capabilities instantly!
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Branches Directory Panel */}
                      <div className="mt-6 border-t border-slate-100 pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Building2 size={16} className="text-indigo-600" />
                            <h4 className="font-bold text-gray-800 text-sm">Branches Directory ({comp.name} subsidiary network)</h4>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {/* Super Admin Branch license buying option */}
                            <button
                              onClick={() => handleBuyBranchLicense(comp.id)}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 rounded-xl text-xs font-bold transition-all shadow-xs"
                            >
                              <Plus size={13} /> Buy Branch License (₹{globalBranchPrice}/mo)
                            </button>
                            <button
                              onClick={() => handleOpenCreateBranch(comp.id)}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100"
                            >
                              <Plus size={14} /> Deploy Branch Portal
                            </button>
                          </div>
                        </div>

                        <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100/50 text-[11px] text-indigo-800 mb-4 flex items-center justify-between">
                          <span>
                            <strong>Quota Details:</strong> Your plan includes <strong>{includedBranchLimit}</strong> branch{includedBranchLimit !== 1 ? 'es' : ''}. You have purchased <strong>{purchasedAdditionalBranches}</strong> additional paid license{purchasedAdditionalBranches !== 1 ? 's' : ''}. Total allowance: <strong>{allowedBranchLimit} branches</strong>. Deployed: <strong>{compBranches.length} branches</strong>.
                          </span>
                          <span className="font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                            {allowedBranchLimit - compBranches.length} slots free
                          </span>
                        </div>

                        {compBranches.length === 0 ? (
                          <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                            No branches deployed yet for this workspace. Click "Deploy Branch Portal" to onboard one.
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-slate-100 rounded-2xl shadow-xs">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-100">
                                  <th className="px-4 py-3.5">Branch details</th>
                                  <th className="px-4 py-3.5">Code & Domain</th>
                                  <th className="px-4 py-3.5">Admin officer</th>
                                  <th className="px-4 py-3.5">License & Fee</th>
                                  <th className="px-4 py-3.5">Operational portal status</th>
                                  <th className="px-4 py-3.5 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                                {compBranches.map((br, index) => {
                                  const isSuspended = br.status === 'Inactive' || br.accountStatus === 'Suspended';
                                  const isPaidAddon = index >= includedBranchLimit;
                                  
                                  const licenseLabel = br.branchLicenseStatus || (isPaidAddon ? 'Active License' : 'Active License');
                                  const renewalDateStr = br.branchRenewalDate || '2027-05-22';
                                  const currentLicensePrice = isPaidAddon ? `₹${globalBranchPrice}/mo` : 'Included';

                                  return (
                                    <tr key={br.id} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-4 py-3.5">
                                        <div className="font-bold text-slate-900">{br.name}</div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">{br.address || ''}</div>
                                      </td>
                                      <td className="px-4 py-3.5">
                                        <div className="font-mono text-[10px] text-indigo-600 bg-indigo-50/50 px-1.5 py-0.5 rounded inline-block font-bold">{br.branchCode || 'BR'}</div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">{br.domain}</div>
                                      </td>
                                      <td className="px-4 py-3.5">
                                        <div className="font-medium text-slate-800">{br.adminName}</div>
                                        <div className="text-[10px] text-slate-400">{br.adminEmail}</div>
                                      </td>
                                      <td className="px-4 py-3.5">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            licenseLabel === 'Suspended' 
                                              ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                                              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                          }`}>
                                            {licenseLabel}
                                          </span>
                                        </div>
                                        <div className="text-[9px] text-slate-400 mt-1">Cost: {currentLicensePrice}</div>
                                      </td>
                                      <td className="px-4 py-3.5">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${isSuspended ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                                          {isSuspended ? 'Portal Suspended' : 'Portal Active'}
                                        </span>
                                        <div className="text-[9px] text-slate-400 mt-1">Renewal: {formatDisplayDate(renewalDateStr)}</div>
                                      </td>
                                      <td className="px-4 py-3.5">
                                        <div className="flex items-center justify-end gap-1.5">
                                          <button
                                            onClick={() => onStartMasquerade(br.id)}
                                            className="px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-[10px] transition-colors"
                                          >
                                            Masquerade
                                          </button>
                                          <button
                                            onClick={() => handleOpenEditBranch(br)}
                                            className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors"
                                            title="Edit Branch Settings"
                                          >
                                            <Edit3 size={11} />
                                          </button>
                                          
                                          {/* Super Admin billing switches */}
                                          <button
                                            onClick={() => handleToggleBranchLicenseStatus(br.id, licenseLabel)}
                                            className={`px-2 py-1.5 border rounded-lg font-bold text-[10px] transition-colors ${
                                              licenseLabel === 'Suspended' 
                                                ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' 
                                                : 'border-amber-200 text-amber-700 hover:bg-amber-50'
                                            }`}
                                            title="Lock/Unlock License Status"
                                          >
                                            {licenseLabel === 'Suspended' ? 'Enable License' : 'Block License'}
                                          </button>
                                          
                                          <button
                                            onClick={() => handleToggleBranchStatus(br.id, br.status as any)}
                                            className={`px-2 py-1.5 border rounded-lg font-bold text-[10px] transition-colors ${isSuspended ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-rose-200 text-rose-700 hover:bg-rose-50'}`}
                                          >
                                            {isSuspended ? 'Activate Portal' : 'Suspend Portal'}
                                          </button>
                                          <button
                                            onClick={() => handleRemoveBranch(br.id)}
                                            className="p-1.5 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors"
                                            title="Remove Branch"
                                          >
                                            <Trash2 size={11} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Branch Resource Utilization Analytics */}
                      <div className="mt-8 border-t border-slate-100 pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Users size={16} className="text-emerald-600" />
                            <h4 className="font-bold text-gray-800 text-sm">Branch Usage Telemetry & Resource Analytics</h4>
                          </div>
                        </div>

                        {compBranches.length === 0 ? (
                          <div className="text-center py-6 text-slate-400 text-xs">
                            No branch usage analytics available. Onboard portals to monitor live load metrics.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {compBranches.map(br => {
                              const brEmployeesCount = employees.filter(emp => emp.companyId === br.id).length;
                              const capacity = br.employeeCapacity || 200;
                              const capacityPercent = Math.min(100, Math.round((brEmployeesCount / capacity) * 100));
                              
                              const activeHr = br.activeHrUsers || 2;
                              const payroll = br.payrollLoad || 185000;
                              const storage = br.storageUsed || '3.4 GB';
                              const rawUsage = br.monthlyUsage || 70;

                              return (
                                <div key={br.id} className="border border-slate-100 rounded-2xl p-4 bg-slate-50/30 hover:bg-slate-50 transition-colors">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="font-bold text-slate-900 text-xs">{br.name} Usage Overview</div>
                                    <span className="text-[10px] font-extrabold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                      Usage: {rawUsage}%
                                    </span>
                                  </div>

                                  <div className="space-y-3.5 text-[11px] text-slate-600">
                                    {/* Capacity Progress Bar */}
                                    <div>
                                      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                                        <span>Workforce Capacity ({brEmployeesCount} / {capacity} staff)</span>
                                        <span className="font-bold text-slate-700">{capacityPercent}%</span>
                                      </div>
                                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div 
                                          className={`h-full rounded-full transition-all duration-500 ${
                                            capacityPercent > 85 ? 'bg-rose-500' : capacityPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                                          }`} 
                                          style={{ width: `${capacityPercent}%` }}
                                        />
                                      </div>
                                    </div>

                                    {/* Sub details metrics */}
                                    <div className="grid grid-cols-3 gap-2 text-center pt-1">
                                      <div className="bg-white border border-slate-100 p-2 rounded-xl">
                                        <div className="text-[9px] text-slate-400 uppercase font-bold">HR Administrators</div>
                                        <div className="font-extrabold text-slate-800 text-xs mt-0.5">{activeHr} accounts</div>
                                      </div>
                                      <div className="bg-white border border-slate-100 p-2 rounded-xl">
                                        <div className="text-[9px] text-slate-400 uppercase font-bold">Payroll Volume</div>
                                        <div className="font-extrabold text-emerald-700 text-xs mt-0.5">₹{payroll.toLocaleString('en-IN')}</div>
                                      </div>
                                      <div className="bg-white border border-slate-100 p-2 rounded-xl">
                                        <div className="text-[9px] text-slate-400 uppercase font-bold">Storage Loaded</div>
                                        <div className="font-extrabold text-slate-800 text-xs mt-0.5">{storage}</div>
                                      </div>
                                    </div>

                                    {/* Super Admin Inline adjust capacity input */}
                                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-slate-400 font-bold">Renewal override:</span>
                                        <input 
                                          type="date"
                                          defaultValue={br.branchRenewalDate || '2027-05-22'}
                                          onChange={(e) => handleUpdateBranchRenewal(br.id, e.target.value)}
                                          className="text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-white text-slate-700 focus:outline-none"
                                        />
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-slate-400 font-bold">Limit ceiling:</span>
                                        <input 
                                          type="number"
                                          defaultValue={capacity}
                                          onBlur={(e) => handleUpdateBranchCapacity(br.id, Number(e.target.value) || 200)}
                                          className="w-14 text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-white text-slate-700 text-center focus:outline-none font-bold"
                                        />
                                      </div>
                                    </div>

                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Invoices and Stats Bar */}
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div>
                      Unified price: <strong className="text-slate-800">₹{(comp.subscriptionPrice || 0).toLocaleString('en-IN')}</strong> / {comp.billingCycle === 'Yearly' ? 'year' : 'month'}
                      {!isSingleCompanyMode && compBranches.length > includedBranchLimit && (
                        <span className="ml-2 text-indigo-600 font-bold">
                          + ₹{((compBranches.length - includedBranchLimit) * globalBranchPrice).toLocaleString('en-IN')}/mo add-ons
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setShowInvoiceModal(comp)}
                        className="text-indigo-600 hover:text-indigo-800 font-bold transition-colors"
                      >
                        View Latest Payment Receipt
                      </button>
                      <span className="text-slate-300">|</span>
                      <span>Next renewal: {formatDisplayDate(comp.renewalDate)}</span>
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
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${pay.transactionStatus === 'Success' ? 'bg-emerald-50 text-emerald-700' :
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
                      className={`px-3.5 py-2 border rounded-xl text-xs font-bold transition-all cursor-pointer ${isSusp
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
                        className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border text-center transition-all ${renewalCycle === 'Monthly'
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
                        className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border text-center transition-all relative overflow-hidden ${renewalCycle === 'Yearly'
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

      {/* ─── MODAL: DEPLOY BRANCH PORTAL / statutory payroll setup ────────── */}
      {branchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-200 my-8">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h4 className="font-bold text-gray-800 text-lg">
                  {editingBranch ? 'Edit Regional Branch Parameters' : 'Deploy Subsidiary Branch Portal'}
                </h4>
                <p className="text-xs text-gray-500 mt-1">Configure workspace boundaries, regional capacity, and statutory payroll rates.</p>
              </div>
              <button
                onClick={() => setBranchModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 bg-transparent border-none text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
              {/* General details */}
              <div className="space-y-4">
                <h5 className="font-bold text-xs text-indigo-600 uppercase tracking-wider">1. General Subsidiary Profiles</h5>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Branch Name</label>
                    <input
                      type="text"
                      placeholder="e.g. GCRI Rajkot"
                      value={branchForm.name}
                      onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Branch Code (3-4 Letters)</label>
                    <input
                      type="text"
                      placeholder="e.g. RAJ"
                      value={branchForm.branchCode}
                      onChange={(e) => setBranchForm({ ...branchForm, branchCode: e.target.value.toUpperCase() })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Branch Admin Officer</label>
                    <input
                      type="text"
                      placeholder="Full Name"
                      value={branchForm.adminName}
                      onChange={(e) => setBranchForm({ ...branchForm, adminName: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Branch Contact Email</label>
                    <input
                      type="email"
                      placeholder="admin@gcri.in"
                      value={branchForm.email}
                      onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Branch Contact Phone</label>
                    <input
                      type="text"
                      placeholder="+91 XXXXX XXXXX"
                      value={branchForm.phone}
                      onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Physical Location Address</label>
                    <input
                      type="text"
                      placeholder="Rajkot, Gujarat"
                      value={branchForm.location}
                      onChange={(e) => setBranchForm({ ...branchForm, location: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Threshold limits */}
              <div className="space-y-4 border-t border-slate-100 pt-5">
                <h5 className="font-bold text-xs text-indigo-600 uppercase tracking-wider">2. Regional Limits & Settings</h5>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Employee Capacity Limit</label>
                    <input
                      type="number"
                      value={branchForm.employeeCapacity}
                      onChange={(e) => setBranchForm({ ...branchForm, employeeCapacity: Number(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">System Status</label>
                    <select
                      value={branchForm.status}
                      onChange={(e) => setBranchForm({ ...branchForm, status: e.target.value as any })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="Active">Active (Live Portal)</option>
                      <option value="Inactive">Inactive (Suspended)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-600">
                    <input
                      type="checkbox"
                      checked={branchForm.enableBroadcasts}
                      onChange={(e) => setBranchForm({ ...branchForm, enableBroadcasts: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span>Allow regional administrative broadcasts</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-600">
                    <input
                      type="checkbox"
                      checked={branchForm.enableSystemAlerts}
                      onChange={(e) => setBranchForm({ ...branchForm, enableSystemAlerts: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span>Allow automatic system payroll alerts</span>
                  </label>
                </div>
              </div>

              {/* Statutory parameters */}
              <div className="space-y-4 border-t border-slate-100 pt-5">
                <h5 className="font-bold text-xs text-indigo-600 uppercase tracking-wider">3. Statutory Payroll Parameters Override</h5>
                
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">PF Contribution Rate (%)</label>
                    <input
                      type="number"
                      value={branchForm.pfRate}
                      onChange={(e) => setBranchForm({ ...branchForm, pfRate: Number(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">ESIC Contribution (%)</label>
                    <input
                      type="number"
                      value={branchForm.esicRate}
                      onChange={(e) => setBranchForm({ ...branchForm, esicRate: Number(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Basic Salary % of Gross</label>
                    <input
                      type="number"
                      value={branchForm.basicPercent}
                      onChange={(e) => setBranchForm({ ...branchForm, basicPercent: Number(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Professional Tax (₹/mo)</label>
                    <input
                      type="number"
                      value={branchForm.profTaxRate}
                      onChange={(e) => setBranchForm({ ...branchForm, profTaxRate: Number(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Overtime Multiplier (e.g. 1.5x)</label>
                    <input
                      type="number"
                      value={branchForm.overtimeRate}
                      onChange={(e) => setBranchForm({ ...branchForm, overtimeRate: Number(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
              <button
                type="button"
                onClick={() => setBranchModalOpen(false)}
                className="px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBranch}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
              >
                {editingBranch ? 'Save Branch Settings' : 'Deploy Branch Workspace'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─── MODAL: BRANCH LICENSE UPGRADE PAYWALL ────────────────────────── */}
      {paywallOpen && paywallParentCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <ShieldAlert size={22} className="animate-pulse" />
                </span>
                <div>
                  <h4 className="font-extrabold text-gray-900 text-base">Subscription Plan Quota Exceeded</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Scale Your Subsidiary Branch Network</p>
                </div>
              </div>
              <button 
                onClick={() => setPaywallOpen(false)} 
                className="text-gray-400 hover:text-gray-600 bg-transparent border-none text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="text-center py-4 bg-indigo-50/20 rounded-2xl border border-indigo-100/50">
                <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Current Limit Reached</div>
                <div className="text-4xl font-extrabold text-slate-800 mt-1">
                  {companies.filter(c => c.parentCompanyId === paywallParentCompany.id).length} / {(plans.find(p => p.name === paywallParentCompany.plan)?.includedBranchLimit || 0) + (paywallParentCompany.purchasedAdditionalBranches || 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Subsidiary branches successfully deployed</div>
              </div>

              <div className="space-y-4">
                <h5 className="font-bold text-xs text-indigo-600 uppercase tracking-wider">Upgrade Options</h5>
                
                {/* Add-on option */}
                <div className="p-4 border-2 border-indigo-500 rounded-2xl bg-indigo-50/30 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                      Buy Individual Branch Add-on
                      <span className="bg-indigo-600 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">Popular</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Instantly increase your subsidiary portal count by <strong>1 branch</strong>. You can configure and deploy immediately. Billed as ₹999/month.
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-extrabold text-indigo-700">₹{globalBranchPrice}</div>
                    <div className="text-[9px] text-slate-400">/ month</div>
                    <button
                      onClick={() => handleBuyBranchLicense(paywallParentCompany.id)}
                      className="mt-3.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
                    >
                      Buy Add-On
                    </button>
                  </div>
                </div>

                {/* Plan Tier Upgrade Option */}
                <div className="p-4 border border-slate-200 rounded-2xl hover:border-slate-300 transition-colors flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-bold text-sm text-slate-800">Change Base Pricing Plan</div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Adjust your base corporate tier (Starter: 0 branches, Professional: 1 branch, Enterprise: 2 branches) to scale high-tier boundaries.
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 self-center">
                    <button
                      onClick={() => {
                        setPaywallOpen(false);
                        setSelectedPlanId(plans.find(p => p.name === paywallParentCompany.plan)?.id || plans[0].id);
                        setChangingPlanCompany(paywallParentCompany);
                      }}
                      className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Change Plan
                    </button>
                  </div>
                </div>

              </div>

              <div className="text-[10px] text-slate-400 text-center leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                🔒 Secured Stripe & Razorpay Payment pipelines. Commercial branches are subject to unified regional security boundaries, automatic compliance checks, and SLA processing guarantees.
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
              <button
                type="button"
                onClick={() => setPaywallOpen(false)}
                className="px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
