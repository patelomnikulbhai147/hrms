import { type Company, type SubscriptionPlan } from '../data/mockData';

export type SubscriptionStatus = 'Suspended' | 'Overdue' | 'Expiring Soon' | 'Trial Ending' | 'Active';

export interface SubscriptionMetrics {
  totalCompanies: number;
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

export const calculateSubscriptionAnalytics = (companies: Company[], plans: SubscriptionPlan[]): SubscriptionMetrics => {
  const totalCompanies = companies.length;
  let activeSubscriptions = 0;
  let expiringPlans = 0;
  let pendingRenewals = 0;
  let monthlyRevenue = 0;

  companies.forEach(company => {
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
      const planObj = plans.find(p => p.name === company.plan);
      if (planObj) {
        monthlyRevenue += company.billingCycle === 'Yearly' 
          ? Math.round(planObj.priceYearly / 12) 
          : planObj.priceMonthly;
      } else {
        monthlyRevenue += company.subscriptionPrice || 0;
      }
    }
  });

  return {
    totalCompanies,
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
