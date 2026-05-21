import { type Company, type PayrollRecord } from '../data/mockData';

const payrollOrder = ['Paid', 'Overdue', 'Processing', 'Generated', 'Draft', 'Failed'] as const;
export type PayrollWorkflowStatus = (typeof payrollOrder)[number];

const parsePayrollDate = (record: PayrollRecord) => {
  const parsed = new Date(`${record.month} 1 ${record.year}`);
  if (!isNaN(parsed.getTime())) return parsed;
  return new Date(record.year, 0, 1);
};

export const getPayrollRecordStatus = (record: PayrollRecord, now = new Date()): PayrollWorkflowStatus => {
  if (record.status === 'Failed') return 'Failed';
  if (record.status === 'Paid') return 'Paid';
  if (record.status === 'Processing') return 'Processing';
  if (record.status === 'Generated') return 'Generated';

  if (record.status === 'Draft') {
    const dueDate = record.dueDate ? new Date(record.dueDate) : new Date(parsePayrollDate(record).getFullYear(), parsePayrollDate(record).getMonth() + 1, 7);
    if (now > dueDate) return 'Overdue';
    return 'Draft';
  }

  return 'Draft';
};

export const getLatestPayrollRecord = (records: PayrollRecord[]) => {
  return [...records].sort((a, b) => {
    const aDate = parsePayrollDate(a).getTime();
    const bDate = parsePayrollDate(b).getTime();
    return bDate - aDate;
  })[0];
};

export const deriveCompanyPayrollStatus = (companyId: string, payrollRecords: PayrollRecord[], now = new Date()) => {
  const companyRecords = payrollRecords.filter(record => record.companyId === companyId);
  if (!companyRecords.length) {
    return { label: 'No Payroll', status: null as PayrollWorkflowStatus | null };
  }

  const latestRecord = getLatestPayrollRecord(companyRecords);
  const latestMonthRecords = companyRecords.filter(record => record.month === latestRecord.month && record.year === latestRecord.year);

  for (const status of payrollOrder) {
    if (latestMonthRecords.some(record => getPayrollRecordStatus(record, now) === status)) {
      return { label: status === 'Draft' ? 'Draft' : status, status };
    }
  }

  return { label: 'No Payroll', status: null };
};

export const getPayrollSummaryCounts = (companyId: string, payrollRecords: PayrollRecord[]) => {
  const companyRecords = payrollRecords.filter(record => record.companyId === companyId);
  return {
    draft: companyRecords.filter(record => getPayrollRecordStatus(record) === 'Draft').length,
    processing: companyRecords.filter(record => getPayrollRecordStatus(record) === 'Processing').length,
    generated: companyRecords.filter(record => getPayrollRecordStatus(record) === 'Generated').length,
    paid: companyRecords.filter(record => getPayrollRecordStatus(record) === 'Paid').length,
    overdue: companyRecords.filter(record => getPayrollRecordStatus(record) === 'Overdue').length,
    failed: companyRecords.filter(record => getPayrollRecordStatus(record) === 'Failed').length,
  };
};

export const payrollDisplayLabel = (record: PayrollRecord) => getPayrollRecordStatus(record);

export const nextPayrollStage = (current: PayrollWorkflowStatus) => {
  if (current === 'Draft') return 'Processing';
  if (current === 'Processing') return 'Generated';
  if (current === 'Generated') return 'Paid';
  if (current === 'Failed') return 'Processing';
  return current;
};
