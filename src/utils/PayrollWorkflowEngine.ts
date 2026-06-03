import { type PayrollRecord, type PayrollStatus } from '../types';

export const payrollStatusConfig = {
  draft: {
    label: 'Draft',
    badgeVariant: 'gray' as const,
    description: 'Initial salary calculations prepared in draft state.'
  },
  prepared: {
    label: 'Prepared',
    badgeVariant: 'blue' as const,
    description: 'Salary structures compiled and queued for management audit.'
  },
  verified: {
    label: 'Verified',
    badgeVariant: 'orange' as const,
    description: 'Payroll audited and verified by management for payment release.'
  },
  payment_pending: {
    label: 'Payment Pending',
    badgeVariant: 'yellow' as const,
    description: 'Payroll verified and awaiting payment confirmation from finance.'
  },
  paid: {
    label: 'Paid',
    badgeVariant: 'green' as const,
    description: 'Salary payment settled successfully in corporate ledger.'
  },
  payslip_generated: {
    label: 'Payslip Generated',
    badgeVariant: 'purple' as const,
    description: 'Digital compliance payslip generated and archived.'
  },
  failed: {
    label: 'Failed',
    badgeVariant: 'red' as const,
    description: 'Payment transaction failed. Requires manual clearance.'
  }
};

export const getStatusBadgeVariant = (status: PayrollStatus) => {
  return payrollStatusConfig[status]?.badgeVariant || 'gray';
};

export const dbToUiStatus = (status: PayrollStatus): string => {
  return payrollStatusConfig[status]?.label || status;
};

// Centralized dynamic metric calculator for dashboards and progress indicators
export const calculatePayrollStats = (scopedRecords: PayrollRecord[]) => {
  const paidRecords = scopedRecords.filter(r => r.payrollStatus === 'paid' || r.payrollStatus === 'payslip_generated');
  const pendingRecords = scopedRecords.filter(r => r.payrollStatus !== 'paid' && r.payrollStatus !== 'payslip_generated' && r.payrollStatus !== 'failed');
  const failedRecords = scopedRecords.filter(r => r.payrollStatus === 'failed');

  const totalSalaryPaid = paidRecords.reduce((sum, r) => sum + r.netSalary, 0);
  const totalSalaryPending = pendingRecords.reduce((sum, r) => sum + r.netSalary, 0);
  const totalSalaryCap = scopedRecords.reduce((sum, r) => sum + r.netSalary, 0);

  const processedPercent = scopedRecords.length > 0
    ? Math.round((paidRecords.length / scopedRecords.length) * 100)
    : 0;

  return {
    paidCount: paidRecords.length,
    pendingCount: pendingRecords.length,
    failedCount: failedRecords.length,
    totalPaid: totalSalaryPaid,
    totalPending: totalSalaryPending,
    totalCap: totalSalaryCap,
    percent: processedPercent
  };
};
