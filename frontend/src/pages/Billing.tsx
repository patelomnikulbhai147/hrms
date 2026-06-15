import React, { useState } from 'react';
import { getApiErrorMessage } from '../utils/apiError';
import { cn } from '../utils/cn';
import {
  CreditCard, Search, Filter, ShieldAlert, CheckCircle2, AlertTriangle,
  XCircle, Edit3, ArrowUpRight, DollarSign, Users,
  FileText, UserCheck,
  Building2, Plus, Trash2,
  Globe, ShieldCheck, Ban, PauseCircle, Rocket, MinusCircle, Building
} from 'lucide-react';
import { Company, SubscriptionPlan, PaymentRecord, Employee } from '../data/mockData';
import { type UserAccount } from './Login';
import { Button } from '../components/ui/Button';
import { ExportMenu } from '../components/ui/ExportMenu';
import { type ExportColumn } from '../utils/exportUtils';
import { calculateSubscriptionAnalytics, getSubscriptionAlertsList, getDaysRemaining, calculateBranchBilling } from '../utils/subscriptionUtils';

const PAYMENT_EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Invoice Number', key: 'invoiceNumber', width: 20 },
  { header: 'Company Name', key: 'companyName', width: 28 },
  { header: 'Plan Type', key: 'planType', width: 16 },
  { header: 'Billing Cycle', key: 'billingCycle', width: 14, format: v => v || 'Monthly' },
  { header: 'Amount', key: 'amount', width: 14, format: v => `Rs. ${v}` },
  { header: 'Date', key: 'paymentDate', width: 14 },
  { header: 'Mode', key: 'paymentMode', width: 14 },
  { header: 'Status', key: 'transactionStatus', width: 14 },
];
import { getUniqueEmployees } from '../utils/deduplication';
import { usePermissions } from '../context/PermissionContext';
import { api } from '../api/apiClient';

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
  onStartMasquerade: (companyId: string, kind?: 'company' | 'branch') => void;
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
  const uniqueEmployees = React.useMemo(() => getUniqueEmployees(employees), [employees]);

  const { canEdit: canEditModule } = usePermissions();
  const canEdit = canEditModule('billing');

  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'payments' | 'alerts'>('overview');

  // Paywall, commercial pricing & alert state parameters
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallParentCompany, setPaywallParentCompany] = useState<Company | null>(null);
  if (paywallParentCompany === undefined) {
    setPaywallParentCompany(null);
  }
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
      name: branch.name || branch.branchName || '',
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

  const syncAndRecalculateBilling = (currentCompanies: Company[], parentId: string): Company[] => {
    return calculateBranchBilling(currentCompanies, parentId, plans).updatedCompanies;
  };

  const handleRemoveBranch = (branchId: string) => {
    const branch = companies.find(c => c.id === branchId);
    if (!branch) return;

    const parentId = branch.parentCompanyId;
    if (!parentId) {
      alert('Cannot remove this branch: its parent company could not be determined.');
      return;
    }

    const confirmDelete = confirm(`Are you sure you want to remove the branch "${branch.branchName || branch.name}"?\n\nThis will NOT delete employees, payroll history, or documents permanently.`);
    if (!confirmDelete) return;

    const reassign = confirm(`Employee Reassignment Confirmation:\n\nClick OK to reassign all "${branch.name}" employees to the Parent Head Office.\n\nClick Cancel to mark them as Inactive (Archived) but preserve their records.`);

    // Employees belonging to this branch (the list is DB-hydrated, so matching by
    // companyId === branchId targets the real rows). Each change is persisted via
    // the API; the local cache update + branch removal only happen after the DB
    // confirms, so the operation survives refresh/relogin instead of reverting.
    const affected = uniqueEmployees.filter(emp => emp.companyId === branchId);

    const empWrites = reassign
      // Reassign to the parent head office and detach from the branch.
      ? affected.map(emp => api.employees.update(emp.id, { companyId: parentId, branchId: null }))
      // Preserve records but archive (offboard) them.
      : affected.map(emp => api.employees.update(emp.id, { status: 'Archived' }));

    Promise.all(empWrites)
      // Archive the branch row itself (soft remove — preserves payroll/documents).
      .then(() => api.branches.archive(branchId))
      .then(() => {
        const updatedEmployees = uniqueEmployees.map(emp => {
          if (emp.companyId !== branchId) return emp;
          return reassign
            ? { ...emp, companyId: parentId, branchId: null as any }
            : { ...emp, status: 'Archived' as const };
        });
        onUpdateEmployees(updatedEmployees);

        const nextCompanies = companies.filter(c => c.id !== branchId);
        const finalized = syncAndRecalculateBilling(nextCompanies, parentId);
        onUpdateCompanies(finalized);
        alert('Branch removed successfully. Employees, payroll records, and documents were preserved.');
      })
      .catch(err => {
        console.error(err);
        alert(getApiErrorMessage(err, 'Could not remove the branch. No changes were saved.'));
      });
  };

  const handleToggleBranchStatus = (branchId: string, current: 'Active' | 'Inactive' | 'Pending') => {
    const branch = companies.find(c => c.id === branchId);
    if (!branch || !branch.parentCompanyId) return;

    const nextStatus = current === 'Active' ? 'Inactive' : 'Active';
    const updated = companies.map(c => c.id === branchId ? {
      ...c,
      status: nextStatus as any,
      accountStatus: nextStatus === 'Inactive' ? 'Suspended' : 'Active' as any,
      branchPortalActive: nextStatus === 'Active'
    } : c);

    // Persist the real Branch.status column to the database; the local billing
    // recalc is only applied after the DB confirms, so a suspended/activated
    // branch survives refresh instead of reverting.
    api.branches.update(branchId, { status: nextStatus }).then(() => {
      const finalized = syncAndRecalculateBilling(updated, branch.parentCompanyId!);
      onUpdateCompanies(finalized);
    }).catch(err => {
      console.error(err);
      alert(getApiErrorMessage(err, 'Could not update the branch status.'));
    });
  };

  const handleAdjustBranchSlots = (parentId: string, action: 'add' | 'remove') => {
    const parent = companies.find(c => c.id === parentId);
    if (!parent) return;

    if (action === 'add') {
      handleOpenCreateBranch(parentId);
      return;
    }

    const parentBranches = companies.filter(c => c.parentCompanyId === parentId);
    if (parentBranches.length <= 1) {
      alert("No additional paid slots are currently active to remove. The base plan includes 1 free branch slot automatically.");
      return;
    }

    const lastBranch = parentBranches[parentBranches.length - 1];
    const confirmRemove = confirm(`To remove a branch license slot, the corresponding deployed branch must be deleted.\n\nAre you sure you want to remove the last deployed branch "${lastBranch.branchName || lastBranch.name}" to release the slot?`);
    if (!confirmRemove) return;

    handleRemoveBranch(lastBranch.id);
  };

  const handleUpdateBranchCapacity = (branchId: string, cap: number) => {
    const branch = companies.find(c => c.id === branchId);
    if (!branch || !branch.parentCompanyId) return;

    const updated = companies.map(c => {
      if (c.id === branchId) {
        return {
          ...c,
          licensedEmployeeLimit: cap,
          employeeCapacity: cap
        };
      }
      return c;
    });

    // Persist the real Branch.employeeCapacity column; apply the local billing
    // recalc only after the DB confirms so the new capacity survives refresh.
    api.branches.update(branchId, { employeeCapacity: cap }).then(() => {
      const finalized = syncAndRecalculateBilling(updated, branch.parentCompanyId!);
      onUpdateCompanies(finalized);
      setSuccessMessage(`Branch employee capacity adjusted to ${cap} employees.`);
      setTimeout(() => setSuccessMessage(''), 3000);
    }).catch(err => {
      console.error(err);
      alert(getApiErrorMessage(err, 'Could not update the branch capacity.'));
    });
  };

  const handleUpdateBranchRenewal = (branchId: string, date: string) => {
    const branch = companies.find(c => c.id === branchId);
    if (!branch || !branch.parentCompanyId) return;

    const updated = companies.map(c => c.id === branchId ? { ...c, branchRenewalDate: date } : c);
    const finalized = syncAndRecalculateBilling(updated, branch.parentCompanyId);
    onUpdateCompanies(finalized);
    setSuccessMessage('Branch renewal date adjusted successfully.');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleToggleBranchLicenseStatus = (branchId: string, current: string) => {
    const branch = companies.find(c => c.id === branchId);
    if (!branch || !branch.parentCompanyId) return;

    const nextStatus = current === 'Active License' ? 'Suspended' : 'Active License';
    const nextIsActive = nextStatus === 'Active License';

    const updated = companies.map(c => c.id === branchId ? {
      ...c,
      branchLicenseStatus: nextStatus as any,
      branchLicenseActive: nextIsActive
    } : c);

    const finalized = syncAndRecalculateBilling(updated, branch.parentCompanyId);
    onUpdateCompanies(finalized);
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
      api.branches.update(editingBranch.id, {
        branchName: branchForm.name.replace(/^GCRI\s+/, ''),
        branchCode: branchForm.branchCode,
        location: branchForm.location,
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
      }).then(() => {
        const finalized = syncAndRecalculateBilling(updatedCompanies, editingBranch.parentCompanyId || 'c-gcri');
        onUpdateCompanies(finalized);
        alert('Branch updated successfully.');
      }).catch(err => {
        console.error(err);
        alert(getApiErrorMessage(err, 'Could not update the branch.'));
      });
    } else {
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
        branchPriceAddon: 999,
        branchLicenseActive: true,
        branchPortalActive: true,
        licensedEmployeeLimit: Number(branchForm.employeeCapacity) || 200,
        monthlyBranchCost: 0,
        billingIncluded: true
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

      Promise.all([
        api.branches.create(newBranchObj).catch(e => { console.error("Branch create error:", e); throw e; }),
        api.users.create({ ...newAdminUser, password: newAdminUser.passwordStr }).catch(e => { console.error("User create error:", e); throw e; })
      ]).then(() => {
        onUpdateAccounts([...userAccounts, newAdminUser]);
        const finalized = syncAndRecalculateBilling([...companies, newBranchObj], parentCompanyIdForBranch || 'c-gcri');
        onUpdateCompanies(finalized);
        alert(`Branch created successfully.\n\nGenerated Branch Admin Account:\nLogin ID: ${newAdminUser.username}\nPassword: ${newAdminUser.passwordStr}`);
      }).catch(err => {
        console.error(err);
        alert(getApiErrorMessage(err, 'Could not create the branch.'));
      });
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
    const target = companies.find(c => c.id === companyId);
    if (!target) return;
    const nextStatus = target.accountStatus === 'Active' ? 'Suspended' : 'Active';
    const nextEntityStatus = nextStatus === 'Suspended' ? 'Inactive' : 'Active';

    onUpdateCompanies(prev => prev.map(c => c.id === companyId
      ? { ...c, accountStatus: nextStatus, status: nextEntityStatus }
      : c));

    // Persist the status change so it survives refresh/relogin. The billing list
    // only shows parent companies, but guard for branches just in case (branches
    // only accept `status`; companies accept accountStatus too).
    const persist = target.parentCompanyId
      ? api.branches.update(companyId, { status: nextEntityStatus })
      : api.companies.update(companyId, { accountStatus: nextStatus, status: nextEntityStatus });
    persist.catch(err => { console.error(err); alert(getApiErrorMessage(err, 'Could not update the company status.')); });
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

    const targetPlan = plans.find(p => p.name === chosenPlan);
    const updated: Company[] = companies.map(c => c.id === company.id ? {
      ...c,
      plan: chosenPlan,
      billingCycle: chosenCycle,
      subscriptionPrice: calculatedPrice,
      priceMonthly: targetPlan ? targetPlan.priceMonthly : c.priceMonthly,
      priceYearly: targetPlan ? targetPlan.priceYearly : c.priceYearly,
      renewalDate: calculatedDate,
      paymentStatus: 'Paid' as const,
      accountStatus: 'Active' as const,
      status: 'Active' as const
    } : c);

    const finalized = syncAndRecalculateBilling(updated, company.id);
    onUpdateCompanies(finalized);

    // Persist the renewed plan/pricing/status to the company record so it
    // survives refresh/relogin. Previously only the payment was saved while the
    // company's plan & status reverted on reload. `renewalDate` is intentionally
    // omitted (frontend-only display field with no backing Company column).
    if (!company.parentCompanyId) {
      api.companies.update(company.id, {
        plan: chosenPlan,
        billingCycle: chosenCycle,
        subscriptionPrice: calculatedPrice,
        priceMonthly: targetPlan ? targetPlan.priceMonthly : company.priceMonthly,
        priceYearly: targetPlan ? targetPlan.priceYearly : company.priceYearly,
        paymentStatus: 'Paid',
        accountStatus: 'Active',
        status: 'Active'
      }).catch((err: any) => { console.error(err); alert(getApiErrorMessage(err, 'Could not save the renewal to the database.')); });
    }

    api.payments.create(newRecord).then(saved => onUpdatePayments(prevTx => [saved, ...prevTx])).catch((err: any) => alert(getApiErrorMessage(err, 'Could not save the payment record.')));
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

    const finalizedPlan = { ...editingPlan };
    if (finalizedPlan.name === 'Enterprise') {
      finalizedPlan.employeeLimit = 'Unlimited';
      finalizedPlan.hrLimit = 'Unlimited';
    } else {
      if (finalizedPlan.name === 'Starter') {
        if (!finalizedPlan.employeeLimit || finalizedPlan.employeeLimit === 'Unlimited' || finalizedPlan.employeeLimit <= 0) {
          finalizedPlan.employeeLimit = 100;
        }
        if (!finalizedPlan.hrLimit || finalizedPlan.hrLimit === 'Unlimited' || finalizedPlan.hrLimit <= 0) {
          finalizedPlan.hrLimit = 3;
        }
      } else if (finalizedPlan.name === 'Professional') {
        if (!finalizedPlan.employeeLimit || finalizedPlan.employeeLimit === 'Unlimited' || finalizedPlan.employeeLimit <= 0) {
          finalizedPlan.employeeLimit = 1000;
        }
        if (!finalizedPlan.hrLimit || finalizedPlan.hrLimit === 'Unlimited' || finalizedPlan.hrLimit <= 0) {
          finalizedPlan.hrLimit = 15;
        }
      }
    }

    api.plans.update(finalizedPlan.id, finalizedPlan).then(() => {
      api.plans.update(finalizedPlan.id, finalizedPlan).then(saved => onUpdatePlans(prev => prev.map(p => p.id === finalizedPlan.id ? saved : p))).catch((err: any) => alert(getApiErrorMessage(err, 'Could not update the plan.')));
      setEditingPlan(null);
    }).catch(console.error);
  };

  const handleChangePlanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changingPlanCompany) return;

    const selectedPlan = plans.find(p => p.id === selectedPlanId);
    if (!selectedPlan) return;

    const updated: Company[] = companies.map(c => {
      if (c.id === changingPlanCompany.id) {
        return {
          ...c,
          plan: selectedPlan.name as any,
          priceMonthly: selectedPlan.priceMonthly,
          priceYearly: selectedPlan.priceYearly,
          subscriptionPrice: selectedPlan.priceMonthly,
          paymentStatus: 'Paid' as const
        };
      }
      return c;
    });

    const finalized = syncAndRecalculateBilling(updated, changingPlanCompany.id);
    onUpdateCompanies(finalized);

    // Persist the new plan/pricing to the company record so the change survives
    // refresh/relogin. Previously only the payment was saved while the company's
    // plan reverted on reload.
    if (!changingPlanCompany.parentCompanyId) {
      api.companies.update(changingPlanCompany.id, {
        plan: selectedPlan.name as any,
        priceMonthly: selectedPlan.priceMonthly,
        priceYearly: selectedPlan.priceYearly,
        subscriptionPrice: selectedPlan.priceMonthly,
        paymentStatus: 'Paid'
      }).catch((err: any) => { console.error(err); alert(getApiErrorMessage(err, 'Could not save the plan change to the database.')); });
    }

    const newRecord = {
      id: `tx${Date.now()}`,
      companyId: changingPlanCompany.id,
      companyName: changingPlanCompany.name,
      amount: selectedPlan.priceMonthly,
      paymentDate: getNowTimestampDisplay(),
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      planType: selectedPlan.name as any,
      billingCycle: 'Monthly',
      paymentMode: 'System Change' as const,
      transactionStatus: 'Success' as const
    };
    api.payments.create(newRecord).then(saved => onUpdatePayments(prev => [saved, ...prev])).catch(console.error);

    setChangingPlanCompany(null);
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
    <div className="relative min-h-screen">
      {/* Soft Frosted Background blobs exclusively for Billing section */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-5%] right-[-2%] w-[600px] h-[600px] bg-[#F3F0FF] rounded-full blur-[120px] opacity-70"></div>
        <div className="absolute bottom-[-5%] left-[-2%] w-[500px] h-[500px] bg-[#F0F6FF] rounded-full blur-[120px] opacity-70"></div>
      </div>
      
      <div className="relative z-10 space-y-6 pb-12">
        {successMessage && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-[16px] text-xs flex items-center gap-2.5 shadow-sm animate-pulse">
            <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
            <span className="font-semibold">{successMessage}</span>
          </div>
        )}

        {/* ─── Metric Highlights ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white p-5 rounded-[16px] border border-[#E2E8F0] shadow-[0_4px_20px_rgba(15,23,42,0.05)] flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Monthly Recurring Revenue</div>
                <div className="mt-2 text-3xl font-extrabold text-[#0F172A] tracking-tight">₹{mrr.toLocaleString('en-IN')}</div>
                <div className="mt-1 text-[11px] text-[#64748B]">Projected monthly run-rate</div>
              </div>
              <div className="text-[#6D5DFC] bg-[#F3F0FF] border border-[#E9D5FF] rounded-xl p-2.5">
                <DollarSign size={20} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                <ArrowUpRight size={12} /> <span>+12.4%</span>
              </div>
              <div className="flex-1 bg-[#F1F5F9] rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '46%' }} />
              </div>
              <div className="text-[10px] text-[#64748B]">vs last month</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-[16px] border border-[#E2E8F0] shadow-[0_4px_20px_rgba(15,23,42,0.05)] flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Total SaaS Revenue</div>
                <div className="mt-2 text-3xl font-extrabold text-[#0F172A] tracking-tight">₹{totalRevenue.toLocaleString('en-IN')}</div>
                <div className="mt-1 text-[11px] text-[#64748B]">All processed transactions</div>
              </div>
              <div className="text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                <ArrowUpRight size={20} />
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-[16px] border border-[#E2E8F0] shadow-[0_4px_20px_rgba(15,23,42,0.05)] flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Active Subscriptions</div>
                <div className="mt-2 text-3xl font-extrabold text-[#0F172A] tracking-tight">
                  {activePlansCount} <span className="text-sm font-medium text-[#64748B]">/ {parentCompanies.length}</span>
                </div>
                <div className="mt-1 text-[11px] text-[#64748B]">Paid or trial workspaces</div>
              </div>
              <div className="text-[#3B82F6] bg-[#F0F6FF] border border-[#DBEAFE] rounded-xl p-2.5">
                <UserCheck size={20} />
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-[16px] border border-[#E2E8F0] shadow-[0_4px_20px_rgba(15,23,42,0.05)] flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Pending / Overdue</div>
                <div className="mt-2 text-3xl font-extrabold text-[#0F172A] tracking-tight">{pendingPaymentsCount}</div>
                <div className="mt-1 text-[11px] text-rose-500 font-medium">Requires immediate renewal</div>
              </div>
              <div className="text-rose-500 bg-rose-50 border border-rose-100 rounded-xl p-2.5 animate-pulse">
                <AlertTriangle size={20} />
              </div>
            </div>
          </div>
        </div>

      {/* ─── Premium Tab Bar ────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] shadow-sm rounded-2xl p-2 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={cn(
            "px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 cursor-pointer",
            activeTab === 'overview'
              ? 'bg-gradient-to-r from-[#6D5DFC] to-[#7C6BFF] text-white shadow-[0_4px_12px_rgba(109,93,252,0.25)]'
              : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
          )}
        >
          <Building2 size={14} />
          Company Billing & Accounts
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={cn(
            "px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 cursor-pointer",
            activeTab === 'plans'
              ? 'bg-gradient-to-r from-[#6D5DFC] to-[#7C6BFF] text-white shadow-[0_4px_12px_rgba(109,93,252,0.25)]'
              : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
          )}
        >
          <CreditCard size={14} />
          Subscription Plans
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={cn(
            "px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 cursor-pointer",
            activeTab === 'payments'
              ? 'bg-gradient-to-r from-[#6D5DFC] to-[#7C6BFF] text-white shadow-[0_4px_12px_rgba(109,93,252,0.25)]'
              : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
          )}
        >
          <FileText size={14} />
          Payment Transactions
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={cn(
            "px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 relative cursor-pointer",
            activeTab === 'alerts'
              ? 'bg-gradient-to-r from-[#6D5DFC] to-[#7C6BFF] text-white shadow-[0_4px_12px_rgba(109,93,252,0.25)]'
              : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
          )}
        >
          <ShieldAlert size={14} />
          Renewal Alerts
          {alertCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white rounded-full text-[9px] flex items-center justify-center font-black animate-pulse shadow-sm">
              {alertCount}
            </span>
          )}
        </button>
      </div>

      {/* ─── TAB CONTENT: OVERVIEW (COMPANIES GRID/TABLE) ────────────────────── */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-[16px] border border-[#E2E8F0] shadow-sm overflow-hidden">

          {/* Controls */}
          <div className="p-6 border-b border-[#E2E8F0] flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#F8FAFC]/50">
            <div className="flex-1 max-w-xl relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748B]">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Search companies, domain, or admin..."
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-xs focus:ring-1 focus:ring-[#6D5DFC] focus:border-[#6D5DFC] outline-none shadow-sm transition-all"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-[#64748B]" />
                <select
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className="border border-white/5 rounded-xl px-3 py-2 text-xs outline-none bg-slate-900 text-slate-200 focus:border-indigo-500/50 cursor-pointer"
                >
                  <option value="">All Plans</option>
                  {plans.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-white/5 rounded-xl px-3 py-2 text-xs outline-none bg-slate-900 text-slate-200 focus:border-indigo-500/50 cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Overdue">Overdue</option>
                <option value="Expired">Expired</option>
                <option value="Trial Active">Trial Active</option>
              </select>

              <ExportMenu
                fileName="Billing_Transactions"
                title="Billing Transactions"
                sheetName="Transactions"
                columns={PAYMENT_EXPORT_COLUMNS}
                rows={() => payments}
                size="sm"
              />
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

              const includedBranchLimit = 1;
              const purchasedAdditionalBranches = Math.max(compBranches.length - includedBranchLimit, 0);
              const allowedBranchLimit = includedBranchLimit + purchasedAdditionalBranches;
              const isSingleCompanyMode = false;

              const statusBadge = () => {
                switch (comp.paymentStatus) {
                  case 'Paid': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]';
                  case 'Pending': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.15)]';
                  case 'Overdue': return 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.15)]';
                  case 'Trial Active': return 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-[0_0_8px_rgba(14,165,233,0.15)]';
                  default: return 'bg-slate-800/50 text-slate-400 border border-slate-700/50';
                }
              };

              return (
                <div key={comp.id} className="bg-white p-6 border border-[#E2E8F0] rounded-[24px] hover:shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition-all duration-300 relative overflow-hidden mb-6 text-left">
                  {/* Parent Company Header */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#E2E8F0]">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-white text-lg shadow-md border border-black/5" style={{ backgroundColor: comp.primaryColor || '#6D5DFC' }}>
                        {comp.logo}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl font-extrabold text-[#0F172A] tracking-tight">{comp.name}</h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-[#F3F0FF] text-[#6D5DFC] border border-[#E9D5FF] uppercase tracking-wider">Parent Company</span>
                        </div>
                        <p className="text-xs text-[#64748B] mt-1">{comp.domain} • Admin: {comp.adminName} ({comp.adminEmail})</p>
                      </div>

                      {/* Subscription Tier restored in top metrics/info section */}
                      <div className="ml-6 pl-6 border-l border-[#E2E8F0] text-left">
                        <div className="text-[9px] uppercase font-bold text-[#64748B] tracking-wider">Subscription Tier</div>
                        <div className="mt-1 flex items-center gap-2">
                          {getPlanBadge(comp.plan)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-bold ${statusBadge()}`}>
                        {comp.paymentStatus}
                      </span>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => { setSelectedPlanId(plans.find(p => p.name === comp.plan)?.id || plans[0].id); setChangingPlanCompany(comp); }}
                            className="px-4 py-2 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#64748B] rounded-xl text-xs font-bold transition-colors cursor-pointer"
                          >
                            Change Plan
                          </button>
                          <button
                            onClick={() => handleQuickExtend(comp.id)}
                            className="px-4 py-2 bg-gradient-to-r from-[#6D5DFC] to-[#7C6BFF] hover:from-[#5b4be8] hover:to-[#6a58f0] text-white font-bold rounded-xl text-xs transition-colors shadow-[0_4px_12px_rgba(109,93,252,0.25)] cursor-pointer"
                          >
                            Renew Subscription
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* High-Fidelity Combined Summary Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-5 bg-[#F8FAFC]/50 rounded-2xl px-5 mt-5 border border-[#E2E8F0]">
                    <div>
                      <div className="text-[9px] uppercase font-bold text-[#64748B] tracking-wider">Subscription Plan</div>
                      <div className="mt-1 flex items-center gap-2">
                        {getPlanBadge(comp.plan)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase font-bold text-[#64748B] tracking-wider">Combined Workforce</div>
                      <div className="mt-1 text-sm font-extrabold text-[#0F172A]">
                        {totalWorkforce} <span className="text-[10px] font-normal text-[#64748B]">Employees (Head Office: {parentEmployeesCount})</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase font-bold text-[#64748B] tracking-wider">Subsidiary Branches</div>
                      <div className="mt-1 text-sm font-extrabold text-[#0F172A]">
                        {isSingleCompanyMode ? (
                          <span className="text-[#64748B] font-normal text-xs">Disabled (Single Office)</span>
                        ) : (
                          <span>
                            {compBranches.length} <span className="text-[10px] font-normal text-[#64748B]">Active (Quota: {allowedBranchLimit})</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase font-bold text-[#64748B] tracking-wider">Consolidated Renewal</div>
                      <div className="mt-1 text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                        <span>{formatDisplayDate(comp.renewalDate) || '—'}</span>
                        {isSoon && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 text-[10px] font-bold border border-amber-200 shadow-sm animate-pulse">Expires in {daysLeft}d</span>}
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Layout Adaptation */}
                  {isSingleCompanyMode ? (
                    <div className="mt-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-3">
                      <AlertTriangle size={18} className="mt-0.5 text-amber-600 flex-shrink-0" />
                      <div className="text-xs space-y-1">
                        <div className="font-bold">⭐ Startup Mode Enabled</div>
                        <p className="text-amber-700 leading-relaxed">
                          Your workspace is operating under a simple Single-Office framework because you are on the <strong>{comp.plan} Plan</strong>. Subsidiary branches, regional billing pipelines, and multi-branch management systems are cleanly hidden. Upgrade your plan to Professional or Enterprise to unlock multi-branch SaaS capabilities instantly!
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Branches Directory Panel */}
                      <div className="mt-6 border-t border-[#E2E8F0] pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Building2 size={16} className="text-[#6D5DFC]" />
                            <h4 className="font-extrabold text-[#0F172A] text-sm">Branches Directory ({comp.name} subsidiary network)</h4>
                          </div>
                        </div>

                        {/* Frosted Glass Title Header */}
                        <div className="flex items-center gap-2 mb-4 mt-8">
                          <Building size={16} className="text-[#3B82F6]" />
                          <h3 className="text-[15px] font-bold text-slate-800">Branches Directory</h3>
                          <span className="text-[13px] text-slate-500 font-medium">(vishv enterprise subsidiary network)</span>
                        </div>

                        {/* Frosted Glass License Allocation Summary Bar */}
                        <div className="bg-[#F5FAFF] border border-[#E6EEF7] rounded-[14px] p-5 mb-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 shadow-sm">
                          <div>
                            <h4 className="text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider mb-3">Manage Branch License Allocations</h4>
                            <div className="flex items-center gap-8 text-[12px]">
                              <div>
                                <p className="text-slate-500 uppercase text-[10px] mb-0.5">Included Slots</p>
                                <p className="font-bold text-slate-800">{includedBranchLimit} free slots</p>
                              </div>
                              <div>
                                <p className="text-slate-500 uppercase text-[10px] mb-0.5">Purchased Slots</p>
                                <p className="font-bold text-slate-800">{purchasedAdditionalBranches} paid slots</p>
                              </div>
                              <div>
                                <p className="text-slate-500 uppercase text-[10px] mb-0.5">Total Allowance</p>
                                <p className="font-bold text-slate-800">{allowedBranchLimit} branch(es)</p>
                              </div>
                              <div>
                                <p className="text-[#3B82F6] uppercase text-[10px] mb-0.5 font-semibold">Active Slots</p>
                                <p className="font-bold text-[#3B82F6]">
                                  {compBranches.filter(b => {
                                    const isSuspended = b.status === 'Inactive' || b.accountStatus === 'Suspended';
                                    const licenseLabel = b.branchLicenseStatus || 'Active License';
                                    return !isSuspended && licenseLabel !== 'Suspended';
                                  }).length} / {compBranches.length} deployed
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {canEdit && (
                              <>
                                <button
                                  onClick={() => handleAdjustBranchSlots(comp.id, 'remove')}
                                  disabled={purchasedAdditionalBranches <= 0}
                                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 rounded-full text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <MinusCircle size={14} className="text-slate-400" /> Remove Slot
                                </button>
                                <button
                                  onClick={() => handleAdjustBranchSlots(comp.id, 'add')}
                                  className="px-4 py-2 bg-white border border-[#3B82F6] hover:bg-blue-50 text-[#3B82F6] rounded-full text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <Plus size={14} /> Add Slot (+₹999/mo)
                                </button>
                                <button
                                  onClick={() => handleOpenCreateBranch(comp.id)}
                                  className="px-5 py-2 bg-[#3B82F6] hover:bg-blue-600 text-white rounded-full text-[12px] font-medium flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                                >
                                  <Rocket size={14} /> Deploy Branch
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {compBranches.length === 0 ? (
                          <div className="text-center py-8 border border-dashed border-[#CBD5E1] rounded-[14px] text-[#64748B] text-xs bg-[#F8FAFC]">
                            No branches deployed yet for this workspace. Click "Deploy Branch Portal" to onboard one.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            {compBranches.map((br, index) => {
                              const isSuspended = br.status === 'Inactive' || br.accountStatus === 'Suspended';
                              const isPaidAddon = index >= includedBranchLimit;

                              const licenseLabel = br.branchLicenseStatus || (isPaidAddon ? 'Active License' : 'Active License');
                              const renewalDateStr = br.branchRenewalDate || '2027-05-22';
                              const currentLicensePrice = isPaidAddon ? `₹${globalBranchPrice}/mo` : 'Included';
                              
                              return (
                                <div key={br.id} className="bg-white/80 backdrop-blur-sm border border-[#E6EEF7] rounded-[14px] p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow">
                                  
                                  {/* Top Section */}
                                  <div className="flex justify-between items-start mb-5 pb-4 border-b border-[#E6EEF7]">
                                    <div className="flex items-center gap-3">
                                      <span className="font-bold text-[#3B82F6] bg-[#EFF6FF] px-3 py-1.5 rounded-full border border-[#DBEAFE] text-[11px] uppercase">
                                        {br.branchCode || 'BR'}
                                      </span>
                                      <div>
                                        <h4 className="text-[16px] font-bold text-slate-800">{br.branchName || br.name}</h4>
                                        <p className="text-[10px] text-slate-500 mt-0.5">{br.domain}</p>
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5 items-end">
                                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold ${
                                        licenseLabel === 'Suspended'
                                          ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm'
                                          : 'bg-[#EFF6FF] text-[#3B82F6] border border-[#DBEAFE] shadow-sm'
                                      }`}>
                                        <ShieldCheck size={12} /> {licenseLabel}
                                      </span>
                                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold ${
                                        isSuspended
                                          ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                          : 'bg-[#ECFDF5] text-[#14B8A6] border border-[#A7F3D0]'
                                      }`}>
                                        <Globe size={12} /> {isSuspended ? 'Portal Suspended' : 'Portal Active'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Middle Section */}
                                  <div className="grid grid-cols-2 gap-4 mb-5">
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Admin Officer</p>
                                      <p className="text-[13px] font-bold text-slate-800 truncate">{br.adminName || 'Unassigned'}</p>
                                      <p className="text-[12px] text-slate-500 mt-0.5 truncate">{br.adminEmail}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">License Cost & Renewal</p>
                                      <p className="text-[13px] font-bold text-slate-800">{currentLicensePrice}</p>
                                      <p className="text-[12px] text-slate-500 mt-0.5">Next: {formatDisplayDate(renewalDateStr)}</p>
                                    </div>
                                  </div>

                                  {/* Bottom Section (Actions) */}
                                  <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-[#E6EEF7]">
                                    {canEdit && (
                                      <>
                                        <button
                                          onClick={() => onStartMasquerade(br.id, 'branch')}
                                          className="px-4 py-2.5 bg-[#3B82F6] hover:bg-blue-600 text-white rounded-md text-[12px] font-medium transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                                        >
                                          <Users size={14} className="opacity-80" /> Masquerade
                                        </button>
                                        <button
                                          onClick={() => handleToggleBranchLicenseStatus(br.id, licenseLabel)}
                                          className={`px-4 py-2.5 bg-white border hover:bg-slate-50 rounded-md text-[12px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                                            licenseLabel === 'Suspended' ? 'border-emerald-200 text-emerald-600' : 'border-slate-200 text-slate-600'
                                          }`}
                                          title="Lock/Unlock License Status"
                                        >
                                          {licenseLabel === 'Suspended' ? (
                                            <><ShieldCheck size={14} className="text-emerald-500" /> Enable License</>
                                          ) : (
                                            <><Ban size={14} className="text-slate-400" /> Block License</>
                                          )}
                                        </button>
                                        <button
                                          onClick={() => handleToggleBranchStatus(br.id, br.status as any)}
                                          className={`px-4 py-2.5 bg-white border rounded-md text-[12px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                                            isSuspended ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' : 'border-[#FEF3C7] hover:bg-[#FFFBEB] text-[#D97706]'
                                          }`}
                                        >
                                          {isSuspended ? (
                                            <><Globe size={14} /> Activate Portal</>
                                          ) : (
                                            <><PauseCircle size={14} /> Suspend Portal</>
                                          )}
                                        </button>
                                        
                                        <div className="flex-1"></div>
                                        
                                        <button
                                          onClick={() => handleOpenEditBranch(br)}
                                          className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-md transition-colors cursor-pointer"
                                          title="Edit Branch Settings"
                                        >
                                          <Edit3 size={14} />
                                        </button>
                                        <button
                                          onClick={() => handleRemoveBranch(br.id)}
                                          className="p-2 bg-white border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-md transition-colors cursor-pointer"
                                          title="Remove Branch"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Branch Resource Utilization Analytics */}
                      <div className="mt-8 border-t border-[#E2E8F0] pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Users size={16} className="text-emerald-500" />
                            <h4 className="font-extrabold text-[#0F172A] text-sm">Branch Usage Telemetry & Resource Analytics</h4>
                          </div>
                        </div>

                        {compBranches.length === 0 ? (
                          <div className="text-center py-6 text-[#64748B] text-xs">
                            No branch usage analytics available. Onboard portals to monitor live load metrics.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {compBranches.map(br => {
                              const uniqueEmployees = getUniqueEmployees(employees);
                              const brEmployeesCount = br.employeeCount || uniqueEmployees.filter(emp => emp.companyId === br.id || (emp as any).branchId === br.id).length;
                              const capacity = br.employeeCapacity || 200;
                              const capacityPercent = Math.min(100, Math.round((brEmployeesCount / capacity) * 100));

                              const activeHr = br.activeHrUsers || 2;
                              const payroll = br.payrollLoad || 185000;
                              const storage = br.storageUsed || '3.4 GB';

                              return (
                                <div key={br.id} className="bg-white border border-[#E2E8F0] shadow-sm rounded-[20px] p-4 transition-all duration-300">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="font-bold text-[#0F172A] text-xs">{br.name} Usage Overview</div>
                                    <span className="text-[10px] font-bold bg-[#F0F6FF] text-[#3B82F6] border border-[#DBEAFE] px-2.5 py-0.5 rounded-full shadow-sm">
                                      Usage: {capacityPercent}%
                                    </span>
                                  </div>

                                  <div className="space-y-3.5 text-[11px] text-[#64748B]">
                                    {/* Capacity Progress Bar */}
                                    <div>
                                      <div className="flex justify-between text-[10px] text-[#64748B] mb-1">
                                        <span>Workforce Capacity ({brEmployeesCount} / {capacity} staff)</span>
                                        <span className="font-bold text-[#0F172A]">{capacityPercent}%</span>
                                      </div>
                                      <div className="w-full bg-[#F1F5F9] rounded-full h-1.5 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-500 ${capacityPercent > 85 ? 'bg-rose-500' : capacityPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`}
                                          style={{ width: `${capacityPercent}%` }}
                                        />
                                      </div>
                                    </div>

                                    {/* Sub details metrics */}
                                    <div className="grid grid-cols-3 gap-2 text-center pt-1">
                                      <div className="bg-white border border-[#E2E8F0] p-2 rounded-xl shadow-sm">
                                        <div className="text-[8px] text-[#64748B] uppercase font-bold">HR Administrators</div>
                                        <div className="font-extrabold text-[#0F172A] text-xs mt-0.5">{activeHr} accounts</div>
                                      </div>
                                      <div className="bg-white border border-[#E2E8F0] p-2 rounded-xl shadow-sm">
                                        <div className="text-[8px] text-[#64748B] uppercase font-bold">Payroll Volume</div>
                                        <div className="font-extrabold text-emerald-600 text-xs mt-0.5">₹{payroll.toLocaleString('en-IN')}</div>
                                      </div>
                                      <div className="bg-white border border-[#E2E8F0] p-2 rounded-xl shadow-sm">
                                        <div className="text-[8px] text-[#64748B] uppercase font-bold">Storage Loaded</div>
                                        <div className="font-extrabold text-[#0F172A] text-xs mt-0.5">{storage}</div>
                                      </div>
                                    </div>

                                    {/* Super Admin Inline adjust capacity input */}
                                    <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-3">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] text-[#64748B] font-bold uppercase">Renewal override:</span>
                                        <input
                                          type="date"
                                          defaultValue={br.branchRenewalDate || '2027-05-22'}
                                          disabled={!canEdit}
                                          onChange={(e) => handleUpdateBranchRenewal(br.id, e.target.value)}
                                          className="text-[10px] border border-[#E2E8F0] rounded px-1.5 py-0.5 bg-white text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#6D5DFC] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] text-[#64748B] font-bold uppercase">Limit:</span>
                                        <span className="text-[10px] font-extrabold text-[#6D5DFC] bg-[#F3F0FF] border border-[#E9D5FF] px-2 py-0.5 rounded-lg shadow-sm">
                                          {capacity} staff
                                        </span>

                                        {/* Capacity Controlled Upgrade Options */}
                                        {canEdit && (
                                          <div className="flex items-center gap-1 ml-1">
                                            {capacity === 200 && (
                                              <>
                                                <button
                                                  onClick={() => handleUpdateBranchCapacity(br.id, 500)}
                                                  className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[9px] font-bold transition-colors cursor-pointer"
                                                  title="Upgrade limit to 500 employees (+₹1,499/mo)"
                                                >
                                                  +500
                                                </button>
                                                <button
                                                  onClick={() => handleUpdateBranchCapacity(br.id, 1000)}
                                                  className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[9px] font-bold transition-colors cursor-pointer"
                                                  title="Upgrade limit to 1000 employees (+₹2,999/mo)"
                                                >
                                                  +1000
                                                </button>
                                              </>
                                            )}
                                            {capacity === 500 && (
                                              <>
                                                <button
                                                  onClick={() => handleUpdateBranchCapacity(br.id, 200)}
                                                  className="px-1.5 py-0.5 bg-white hover:bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] rounded text-[9px] font-bold transition-colors cursor-pointer"
                                                  title="Downgrade limit to 200 employees (Free base capacity)"
                                                >
                                                  -200
                                                </button>
                                                <button
                                                  onClick={() => handleUpdateBranchCapacity(br.id, 1000)}
                                                  className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[9px] font-bold transition-colors cursor-pointer"
                                                  title="Upgrade limit to 1000 employees (+₹2,999/mo)"
                                                >
                                                  +1000
                                                </button>
                                              </>
                                            )}
                                            {capacity === 1000 && (
                                              <>
                                                <button
                                                  onClick={() => handleUpdateBranchCapacity(br.id, 200)}
                                                  className="px-1.5 py-0.5 bg-white hover:bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] rounded text-[9px] font-bold transition-colors cursor-pointer"
                                                  title="Downgrade limit to 200 employees (Free base capacity)"
                                                >
                                                  -200
                                                </button>
                                                <button
                                                  onClick={() => handleUpdateBranchCapacity(br.id, 500)}
                                                  className="px-1.5 py-0.5 bg-white hover:bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] rounded text-[9px] font-bold transition-colors cursor-pointer"
                                                  title="Downgrade limit to 500 employees (+₹1,499/mo)"
                                                >
                                                  -500
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        )}
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
                  <div className="mt-6 pt-4 border-t border-[#E2E8F0] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-[#64748B]">
                    <div>
                      {(() => {
                        const basePrice = (comp.billingCycle === 'Yearly' ? comp.priceYearly : comp.priceMonthly) || 
                                          (comp.plan === 'Enterprise' ? (comp.billingCycle === 'Yearly' ? 249900 : 24990) : 
                                           comp.plan === 'Professional' ? (comp.billingCycle === 'Yearly' ? 99900 : 9990) : 0);
                        const totalBranchAddonCost = Math.max(compBranches.length - 1, 0) * 999;
                        const displayPrice = comp.subscriptionPrice > 0 ? comp.subscriptionPrice : (basePrice + totalBranchAddonCost);
                        
                        return (
                          <>
                            Unified price: <strong className="text-[#0F172A]">₹{displayPrice.toLocaleString('en-IN')}</strong> / {comp.billingCycle === 'Yearly' ? 'year' : 'month'}
                            {!isSingleCompanyMode && compBranches.length > 0 && totalBranchAddonCost > 0 && (
                              <span className="ml-2 text-[#6D5DFC] bg-[#F3F0FF] border border-[#E9D5FF] px-2.5 py-0.5 rounded-full font-bold shadow-sm">
                                Includes ₹{totalBranchAddonCost.toLocaleString('en-IN')}/mo add-ons
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setShowInvoiceModal(comp)}
                        className="text-[#6D5DFC] hover:text-[#5b4be8] font-bold transition-colors cursor-pointer"
                      >
                        View Latest Payment Receipt
                      </button>
                      <span className="text-[#E2E8F0]">|</span>
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
        <div className="space-y-6">
          {plans.map(plan => {
            let planColor = '#3b82f6';
            let planIcon = <Users size={24} />;
            let isEnterprise = plan.name === 'Enterprise';

            if (plan.name === 'Professional') {
              planColor = '#8b5cf6';
              planIcon = <CreditCard size={24} />;
            } else if (isEnterprise) {
              planColor = '#10b981';
              planIcon = <CheckCircle2 size={24} />;
            }

            return (
              <div key={plan.id} className="bg-white p-6 border border-[#E2E8F0] rounded-[24px] hover:shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition-all duration-300 relative overflow-hidden text-left mb-6">
                {/* Plan Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-white shadow-md border border-black/5" style={{ backgroundColor: planColor }}>
                      {planIcon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xl font-extrabold text-[#0F172A] tracking-tight">{plan.name}</h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-[#F3F0FF] text-[#6D5DFC] border border-[#E9D5FF] uppercase tracking-wider">
                          {isEnterprise ? '👑 Enterprise' : 'SaaS Tier'}
                        </span>
                      </div>
                      <p className="text-xs text-[#64748B] mt-1">SaaS Platform Subscription Tier</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="text-right hidden sm:block">
                      <div className="text-[9px] uppercase font-bold text-[#64748B] tracking-wider">Monthly Billing</div>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold text-[#0F172A]">₹{plan.priceMonthly.toLocaleString('en-IN')}</span>
                        <span className="text-[10px] text-[#64748B]">/mo</span>
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => setEditingPlan(plan)}
                        className="px-4 py-2 border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#64748B] rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Edit3 size={13} /> Adjust Thresholds
                      </button>
                    )}
                  </div>
                </div>

                {/* High-Fidelity Combined Summary Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-5 bg-[#F8FAFC]/50 rounded-2xl px-5 mt-5 border border-[#E2E8F0]">
                  <div>
                    <div className="text-[9px] uppercase font-bold text-[#64748B] tracking-wider">Included Workforce</div>
                    <div className="mt-1 text-sm font-extrabold text-[#0F172A] flex items-center gap-1.5">
                      <Users size={13} className="text-[#6D5DFC]" />
                      {plan.employeeLimit === 'Unlimited' ? 'Unlimited' : plan.employeeLimit} <span className="text-[10px] font-normal text-[#64748B]">Active Employees</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase font-bold text-[#64748B] tracking-wider">Management Quota</div>
                    <div className="mt-1 text-sm font-extrabold text-[#0F172A] flex items-center gap-1.5">
                      <UserCheck size={13} className="text-[#6D5DFC]" />
                      {plan.hrLimit === 'Unlimited' ? 'Unlimited' : plan.hrLimit} <span className="text-[10px] font-normal text-[#64748B]">HR Admins</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase font-bold text-[#64748B] tracking-wider">Secure Storage</div>
                    <div className="mt-1 text-sm font-extrabold text-[#0F172A] flex items-center gap-1.5">
                      <CreditCard size={13} className="text-[#6D5DFC]" />
                      {plan.storageLimit} <span className="text-[10px] font-normal text-[#64748B]">Vault</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase font-bold text-[#64748B] tracking-wider">Payroll Processing</div>
                    <div className="mt-1 text-sm font-extrabold flex items-center gap-1.5">
                      {plan.payrollAccess ? (
                        <>
                          <CheckCircle2 size={13} className="text-emerald-500" />
                          <span className="text-[#0F172A]">Active</span>
                        </>
                      ) : (
                        <>
                          <XCircle size={13} className="text-[#64748B]" />
                          <span className="text-[#64748B]">Unavailable</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Additional Features Panel */}
                <div className="mt-5 pt-5 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4">
                  <div className="text-xs font-bold text-[#64748B] flex items-center gap-1.5">
                    <CheckCircle2 size={13} className={plan.documentAccess ? 'text-emerald-500' : 'text-[#94A3B8]'} />
                    <span className={plan.documentAccess ? 'text-[#0F172A]' : 'text-[#94A3B8] line-through'}>
                      Advanced HR Templates & Letter Systems Included
                    </span>
                  </div>
                  
                  <div className="text-right sm:hidden">
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-lg font-extrabold text-[#0F172A]">₹{plan.priceMonthly.toLocaleString('en-IN')}</span>
                      <span className="text-[10px] text-[#64748B]">/mo</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── TAB CONTENT: TRANSACTION HISTORIES ──────────────────────────────── */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-[24px] border border-[#E2E8F0] overflow-hidden shadow-sm">
          <div className="p-6 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-4 text-left">
            <div>
              <h4 className="font-extrabold text-[#0F172A] text-lg">SaaS Transaction History</h4>
              <p className="text-xs text-[#64748B] mt-0.5">Exportable payment receipts ledger</p>
            </div>

            <ExportMenu
              fileName="Billing_Transactions"
              title="SaaS Transaction History"
              sheetName="Transactions"
              columns={PAYMENT_EXPORT_COLUMNS}
              rows={() => payments}
              size="sm"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  <th className="py-4 px-6">Invoice ID</th>
                  <th className="py-4 px-6">Company Name</th>
                  <th className="py-4 px-6">Pricing Tier</th>
                  <th className="py-4 px-6">Billing Cycle</th>
                  <th className="py-4 px-6">Transaction Date</th>
                  <th className="py-4 px-6">Payment Mode</th>
                  <th className="py-4 px-6">Amount</th>
                  <th className="py-4 px-6 text-right">Gateway Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-sm text-[#0F172A] bg-transparent">
                {payments.map(pay => (
                  <tr key={pay.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-4 px-6 font-mono text-xs font-semibold text-[#6D5DFC]">
                      {pay.invoiceNumber}
                    </td>
                    <td className="py-4 px-6 font-bold text-[#0F172A]">
                      {pay.companyName}
                    </td>
                    <td className="py-4 px-6 text-xs text-[#64748B]">
                      {pay.planType}
                    </td>
                    <td className="py-4 px-6 text-xs text-[#64748B] font-medium">
                      {pay.billingCycle || 'Monthly'}
                    </td>
                    <td className="py-4 px-6 text-xs text-[#64748B]">
                      {pay.paymentDate}
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] text-xs font-medium">
                        {pay.paymentMode}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-extrabold text-[#0F172A]">
                      ₹{pay.amount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${pay.transactionStatus === 'Success' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                        pay.transactionStatus === 'Failed' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                          'bg-slate-50 text-slate-600 border-slate-200'
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
          <div className="bg-white rounded-[24px] shadow-sm border border-[#E2E8F0] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 className="font-extrabold text-[#0F172A] text-lg">Subscription Alerts & Action Center</h4>
              <p className="text-xs text-[#64748B] mt-1">Real-time status tracking for trial expirations, unpaid invoices, and administrative holds.</p>
            </div>
            {alertCount > 0 && (
              <span className="px-3 py-1 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold rounded-full animate-pulse shadow-sm whitespace-nowrap">
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
                  className={`p-5 rounded-[20px] border flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all duration-300 hover:shadow-md bg-white ${alertItem.borderColor || 'border-[#E2E8F0]'}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-2xl flex items-center justify-center ${alertItem.badgeColor} border shadow-sm`}>
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
                        <h5 className="font-extrabold text-[#0F172A] text-base">{comp.name}</h5>
                        <span className="text-xs text-[#64748B]">({comp.domain})</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${alertItem.badgeColor}`}>
                          {alertItem.type}
                        </span>
                      </div>
                      <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">
                        {alertItem.message} Workspace access is currently {isSusp ? 'fully locked' : 'restricted'} for corporate operations.
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="px-2.5 py-1 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] rounded-lg shadow-sm">
                          Plan: <strong className="text-[#0F172A]">{comp.plan}</strong>
                        </span>
                        <span className="px-2.5 py-1 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] rounded-lg shadow-sm">
                          Price: <strong className="text-[#0F172A]">₹{comp.subscriptionPrice?.toLocaleString('en-IN')}/mo</strong>
                        </span>
                        {comp.renewalDate && (
                          <span className="px-2.5 py-1 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] rounded-lg shadow-sm">
                            Elapsed Date: <strong className="text-[#0F172A]">{formatDisplayDate(comp.renewalDate)}</strong>
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
                      className="px-3.5 py-2 bg-white hover:bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                    >
                      Send Reminder
                    </button>

                    <button
                      onClick={() => setActiveTab('overview')}
                      className="px-3.5 py-2 bg-white hover:bg-[#F8FAFC] text-[#0F172A] border border-[#E2E8F0] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                    >
                      View Billing
                    </button>

                    {canEdit && (
                      <button
                        onClick={() => toggleCompanyStatus(comp.id)}
                        className={`px-3.5 py-2 border rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm ${isSusp
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                          }`}
                      >
                        {isSusp ? 'Reactivate Access' : 'Suspend Access'}
                      </button>
                    )}

                    {canEdit && (
                      <button
                        onClick={() => handleQuickExtend(comp.id)}
                        className="px-3.5 py-2 bg-gradient-to-r from-[#6D5DFC] to-[#7C6BFF] hover:from-[#5b4be8] hover:to-[#6a58f0] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-[0_4px_12px_rgba(109,93,252,0.25)]"
                      >
                        Renew Plan
                      </button>
                    )}
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
                      {p.name} — ₹{p.priceMonthly}/mo (Max {p.employeeLimit === 'Unlimited' ? 'Unlimited' : p.employeeLimit} employees)
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
                  {editingPlan.name === 'Enterprise' ? (
                    <input
                      type="text"
                      disabled
                      value="Unlimited"
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-400 font-bold outline-none cursor-not-allowed"
                    />
                  ) : (
                    <input
                      type="number"
                      value={editingPlan.employeeLimit === 'Unlimited' ? '' : editingPlan.employeeLimit}
                      onChange={(e) => setEditingPlan({ ...editingPlan, employeeLimit: e.target.value === '' ? 0 : Number(e.target.value) })}
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    HR Admin Limit
                  </label>
                  {editingPlan.name === 'Enterprise' ? (
                    <input
                      type="text"
                      disabled
                      value="Unlimited"
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-400 font-bold outline-none cursor-not-allowed"
                    />
                  ) : (
                    <input
                      type="number"
                      value={editingPlan.hrLimit === 'Unlimited' ? '' : editingPlan.hrLimit}
                      onChange={(e) => setEditingPlan({ ...editingPlan, hrLimit: e.target.value === '' ? 0 : Number(e.target.value) })}
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
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
                  {canEdit ? 'Cancel' : 'Close'}
                </Button>
                {canEdit && (
                  <Button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold"
                  >
                    Save Settings
                  </Button>
                )}
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
                      onClick={() => handleAdjustBranchSlots(paywallParentCompany.id, 'add')}
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
    </div>
  );
};
