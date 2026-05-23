import { type Company, type SubscriptionPlan, PLAN_LIMITS } from '../data/mockData';

export type SubscriptionStatus = 'Suspended' | 'Overdue' | 'Expiring Soon' | 'Trial Ending' | 'Active';

export interface SubscriptionMetrics {
  totalCompanies: number;
  totalBranches: number;
  activeSubscriptions: number;
  expiringPlans: number;
  pendingRenewals: number;
  monthlyRevenue: number;
}
export interface SubscriptionAlert {
  company: Company;
  type: SubscriptionStatus;
  message: string;
  daysRemaining: number | null;
  badgeColor: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
}

export const anchorTodayStr = '2026-05-20';
export const anchorToday = new Date(anchorTodayStr);

export const getDaysRemaining = (expiryDateStr?: string): number | null => {
  if (!expiryDateStr) return null;
  const now = new Date(anchorTodayStr);
  const expiry = new Date(expiryDateStr + 'T00:00:00');
  if (isNaN(expiry.getTime())) return null;
  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const calculateSubscriptionStatus = (company: Company): SubscriptionStatus => {
  if (company.accountStatus === 'Suspended') {
    return 'Suspended';
  }

  const daysLeft = getDaysRemaining(company.renewalDate);
  const isOverdueState = company.paymentStatus === 'Overdue' || company.paymentStatus === 'Expired';

  if (isOverdueState || (daysLeft !== null && daysLeft < 0)) {
    return 'Overdue';
  }

  if (company.paymentStatus === 'Trial Active' && daysLeft !== null && daysLeft >= 0 && daysLeft <= 10) {
    return 'Trial Ending';
  }

  if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 10) {
    return 'Expiring Soon';
  }

  return 'Active';
};

export const calculateSubscriptionAnalytics = (companies: Company[], _plans: SubscriptionPlan[]): SubscriptionMetrics => {
  const parentCompanies = companies.filter(c => !c.parentCompanyId);
  const totalCompanies = parentCompanies.length;
  const totalBranches = companies.filter(c => !!c.parentCompanyId).length;
  let activeSubscriptions = 0;
  let expiringPlans = 0;
  let pendingRenewals = 0;
  let monthlyRevenue = 0;

  parentCompanies.forEach(company => {
    if (!company) return;

    // Active means accountStatus === 'Active' and paymentStatus is Paid or Trial Active
    const isActiveOrTrial = company.accountStatus === 'Active' &&
      (company.paymentStatus === 'Paid' || company.paymentStatus === 'Trial Active');

    if (isActiveOrTrial) {
      activeSubscriptions++;
    }

    const status = calculateSubscriptionStatus(company);

    if (status === 'Expiring Soon' || status === 'Trial Ending') {
      expiringPlans++;
    }

    if (status === 'Overdue' || company.paymentStatus === 'Pending') {
      pendingRenewals++;
    }

    // Revenue calculation
    if (isActiveOrTrial) {
      monthlyRevenue += company.subscriptionPrice || 0;
    }
  });

  return {
    totalCompanies,
    totalBranches,
    activeSubscriptions,
    expiringPlans,
    pendingRenewals,
    monthlyRevenue
  };
};

export const getSubscriptionAlert = (company: Company): SubscriptionAlert | null => {
  const type = calculateSubscriptionStatus(company);
  if (type === 'Active') return null;

  const daysLeft = getDaysRemaining(company.renewalDate);

  let message = '';
  let badgeColor = '';
  let textColor = '';
  let bgColor = '';
  let borderColor = '';

  const displayDate = company.renewalDate
    ? new Date(company.renewalDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';

  switch (type) {
    case 'Suspended':
      message = 'Account suspended due to outstanding payment or administrative action.';
      badgeColor = 'bg-rose-100 text-rose-700 border-rose-200';
      textColor = 'text-rose-700';
      bgColor = 'bg-rose-50/50';
      borderColor = 'border-rose-100';
      break;
    case 'Overdue':
      if (company.paymentStatus === 'Pending') {
        message = 'Payment invoice generated and pending approval.';
      } else {
        message = `Payment overdue. Subscription elapsed on ${displayDate || 'N/A'}.`;
      }
      badgeColor = 'bg-amber-100 text-amber-700 border-amber-200';
      textColor = 'text-amber-700';
      bgColor = 'bg-amber-50/50';
      borderColor = 'border-amber-100';
      break;
    case 'Trial Ending':
      message = `Trial tier ends in ${daysLeft} days. Workspace will be restricted upon expiration.`;
      badgeColor = 'bg-indigo-100 text-indigo-700 border-indigo-200';
      textColor = 'text-indigo-700';
      bgColor = 'bg-indigo-50/50';
      borderColor = 'border-indigo-100';
      break;
    case 'Expiring Soon':
      message = `Subscription renewal coming up in ${daysLeft} days.`;
      badgeColor = 'bg-blue-100 text-blue-700 border-blue-200';
      textColor = 'text-blue-700';
      bgColor = 'bg-blue-50/50';
      borderColor = 'border-blue-100';
      break;
  }

  return {
    company,
    type,
    message,
    daysRemaining: daysLeft,
    badgeColor,
    textColor,
    bgColor,
    borderColor
  };
};

export const getSubscriptionAlertsList = (companies: Company[]): SubscriptionAlert[] => {
  const alerts: SubscriptionAlert[] = [];
  companies.forEach(c => {
    if (!c) return;
    const alert = getSubscriptionAlert(c);
    if (alert) alerts.push(alert);
  });
  return alerts;
};

export interface BranchBillingResult {
  includedSlots: number;
  paidSlots: number;
  activeBranchesCount: number;
  activeLicensedBranchesCount: number;
  addOnTotals: number;
  unifiedMonthlyBilling: number;
  updatedCompanies: Company[];
}

export const calculateBranchBilling = (
  companiesList: Company[],
  parentId: string,
  plansList?: SubscriptionPlan[]
): BranchBillingResult => {
  const plans = plansList || [
    { id: 'sp1', name: 'Starter', priceMonthly: 1999, priceYearly: 19999, employeeLimit: PLAN_LIMITS.Starter.employees, hrLimit: PLAN_LIMITS.Starter.hrAdmins, storageLimit: '5 GB', payrollAccess: true, documentAccess: false, includedBranchLimit: 0 },
    { id: 'sp2', name: 'Professional', priceMonthly: 4999, priceYearly: 49999, employeeLimit: PLAN_LIMITS.Professional.employees, hrLimit: PLAN_LIMITS.Professional.hrAdmins, storageLimit: '25 GB', payrollAccess: true, documentAccess: true, includedBranchLimit: 1 },
    { id: 'sp3', name: 'Enterprise', priceMonthly: 12999, priceYearly: 129999, employeeLimit: PLAN_LIMITS.Enterprise.employees, hrLimit: PLAN_LIMITS.Enterprise.hrAdmins, storageLimit: '100 GB', payrollAccess: true, documentAccess: true, includedBranchLimit: 2 }
  ];

  const parent = companiesList.find(c => c.id === parentId);
  if (!parent) {
    return {
      includedSlots: 1,
      paidSlots: 0,
      activeBranchesCount: 0,
      activeLicensedBranchesCount: 0,
      addOnTotals: 0,
      unifiedMonthlyBilling: 0,
      updatedCompanies: companiesList
    };
  }

  const parentPlan = plans.find(p => p.name === parent.plan);
  const basePlanPrice = parentPlan ? parentPlan.priceMonthly : 12999;
  const includedSlots = 1;

  const parentBranches = companiesList.filter(c => c.parentCompanyId === parentId);

  let activeLicensedCount = 0;
  let activeBranchesCount = 0;

  const updatedBranches = parentBranches.map(br => {
    const isLicenseActive = br.branchLicenseActive !== false && br.branchLicenseStatus !== 'Suspended';
    const isPortalActive = br.status === 'Active' && br.accountStatus !== 'Suspended' && br.branchPortalActive !== false;

    if (isPortalActive) activeBranchesCount++;
    activeLicensedCount++;

    let billingIncluded = false;
    let baseCost = 0;

    if (activeLicensedCount <= includedSlots) {
      billingIncluded = true;
      baseCost = 0;
    } else {
      billingIncluded = false;
      baseCost = 999;
    }

    const capacity = br.licensedEmployeeLimit || br.employeeCapacity || 200;
    const monthlyCost = baseCost;

    return {
      ...br,
      branchLicenseActive: isLicenseActive,
      branchPortalActive: isPortalActive,
      licensedEmployeeLimit: capacity,
      employeeCapacity: capacity,
      monthlyBranchCost: monthlyCost,
      billingIncluded,
      branchLicenseStatus: isLicenseActive ? 'Active License' as const : 'Suspended' as const,
      status: isPortalActive ? 'Active' as const : 'Inactive' as const,
      accountStatus: isPortalActive ? 'Active' as const : 'Suspended' as const,
    };
  });

  const activeLicensedBranchesCount = parentBranches.length;
  const paidSlots = Math.max(0, parentBranches.length - includedSlots);
  const addOnTotals = paidSlots * 999;
  const unifiedMonthlyBilling = basePlanPrice + addOnTotals;

  const updatedCompanies = companiesList.map(c => {
    if (c.id === parentId) {
      return {
        ...c,
        subscriptionPrice: unifiedMonthlyBilling
      };
    }
    const updatedBr = updatedBranches.find(br => br.id === c.id);
    if (updatedBr) {
      return updatedBr;
    }
    return c;
  });

  // Debug logging
  console.log(`[central-billing] Recalculating for parent ID: ${parentId}`);
  console.log(`- Included slots: ${includedSlots}, Paid slots: ${paidSlots}`);
  console.log(`- Active branches: ${activeBranchesCount}, Active licensed branches: ${activeLicensedBranchesCount}`);
  console.log(`- Add-on monthly totals: ₹${addOnTotals}, Unified billing monthly total: ₹${unifiedMonthlyBilling}`);

  return {
    includedSlots,
    paidSlots,
    activeBranchesCount,
    activeLicensedBranchesCount,
    addOnTotals,
    unifiedMonthlyBilling,
    updatedCompanies
  };
};
