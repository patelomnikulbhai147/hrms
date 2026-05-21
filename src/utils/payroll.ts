import { type PayrollRecord } from '../data/mockData';

const payrollOrder = ['payslip_generated', 'paid', 'verified', 'prepared', 'draft', 'failed'] as const;
export type PayrollWorkflowStatus = (typeof payrollOrder)[number];

const parsePayrollDate = (record: PayrollRecord) => {
  const parsed = new Date(`${record.month} 1 ${record.year}`);
  if (!isNaN(parsed.getTime())) return parsed;
  return new Date(record.year, 0, 1);
};

export const getPayrollRecordStatus = (record: PayrollRecord): PayrollWorkflowStatus => {
  // Support both payrollStatus and status property for backward compatibility
  const currentStatus = record.payrollStatus || record.status;
  if (payrollOrder.includes(currentStatus as any)) {
    return currentStatus as PayrollWorkflowStatus;
  }
  return 'draft';
};

export const getLatestPayrollRecord = (records: PayrollRecord[]) => {
  return [...records].sort((a, b) => {
    const aDate = parsePayrollDate(a).getTime();
    const bDate = parsePayrollDate(b).getTime();
    return bDate - aDate;
  })[0];
};

export const deriveCompanyPayrollStatus = (companyId: string, payrollRecords: PayrollRecord[]) => {
  const companyRecords = payrollRecords.filter(record => record.companyId === companyId);
  if (!companyRecords.length) {
    return { label: 'No Payroll', status: null as PayrollWorkflowStatus | null };
  }

  const latestRecord = getLatestPayrollRecord(companyRecords);
  const latestMonthRecords = companyRecords.filter(record => record.month === latestRecord.month && record.year === latestRecord.year);

  const statusLabelMap: Record<PayrollWorkflowStatus, string> = {
    draft: 'Draft',
    prepared: 'Prepared',
    verified: 'Verified',
    paid: 'Paid',
    payslip_generated: 'Payslip Generated',
    failed: 'Failed'
  };

  for (const status of payrollOrder) {
    if (latestMonthRecords.some(record => getPayrollRecordStatus(record) === status)) {
      return { label: statusLabelMap[status] || status, status };
    }
  }

  return { label: 'No Payroll', status: null };
};

export const getPayrollSummaryCounts = (companyId: string, payrollRecords: PayrollRecord[]) => {
  const companyRecords = payrollRecords.filter(record => record.companyId === companyId);
  return {
    draft: companyRecords.filter(record => getPayrollRecordStatus(record) === 'draft').length,
    prepared: companyRecords.filter(record => getPayrollRecordStatus(record) === 'prepared').length,
    verified: companyRecords.filter(record => getPayrollRecordStatus(record) === 'verified').length,
    paid: companyRecords.filter(record => getPayrollRecordStatus(record) === 'paid').length,
    payslip_generated: companyRecords.filter(record => getPayrollRecordStatus(record) === 'payslip_generated').length,
    failed: companyRecords.filter(record => getPayrollRecordStatus(record) === 'failed').length,
  };
};

export const payrollDisplayLabel = (record: PayrollRecord) => {
  const status = getPayrollRecordStatus(record);
  const statusLabelMap: Record<PayrollWorkflowStatus, string> = {
    draft: 'Draft',
    prepared: 'Prepared',
    verified: 'Verified',
    paid: 'Paid',
    payslip_generated: 'Payslip Generated',
    failed: 'Failed'
  };
  return statusLabelMap[status] || status;
};

export const nextPayrollStage = (current: PayrollWorkflowStatus): PayrollWorkflowStatus => {
  if (current === 'draft') return 'prepared';
  if (current === 'prepared') return 'verified';
  if (current === 'verified') return 'paid';
  if (current === 'paid') return 'payslip_generated';
  if (current === 'failed') return 'prepared';
  return current;
};
