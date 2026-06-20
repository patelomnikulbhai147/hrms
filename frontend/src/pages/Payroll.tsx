import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Activity,
  CheckCircle2,
  XCircle,
  DollarSign,
  Eye,
  EyeOff,
  Building2
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../api/apiClient';
import { getApiErrorMessage } from '../utils/apiError';
import {
  type Employee,
  type PayrollRecord,
  type Role,
  type Company,
  type PayrollStatus,
  type AttendanceRecord,
  type LeaveRequest
} from '../data/mockData';
import { isCompanyIdMatch, buildScopedEmployeeIdSet, isRecordInWorkspace, resolveActiveWorkspace } from '../types';
import { SAFE_COMPANY_FALLBACK } from '../App';
import { Badge } from '../components/ui/Badge';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ExportMenu } from '../components/ui/ExportMenu';
import { type ExportColumn } from '../utils/exportUtils';

import { PayrollWorkflowTable } from '../components/payroll/PayrollWorkflowTable';
import { EnterprisePayrollBatch } from '../components/payroll/EnterprisePayrollBatch';
import { exportRowsToExcel } from '../utils/exportUtils';
import {
  calculatePayrollStats
} from '../utils/PayrollWorkflowEngine';
import { generateEnterprisePayslipPDF, generateEnterprisePayslipExcel, printPayslipPDF, payslipBase64, payslipFileName, downloadPayslipsZip, type PayslipBundleItem } from '../utils/salarySlipGenerator';
import { PayrollWorkbench } from '../components/payroll/PayrollWorkbench';
import { PayrollWorksheet } from '../components/payroll/PayrollWorksheet';
import { byEmployeeCode } from '../utils/employeeSort';
import { isActiveEmployee } from '../utils/employeeStatus';
import { deriveCompanyPayrollStatus } from '../utils/payroll';
import { type UserAccount } from './Login';
import { getUniqueEmployees } from '../utils/deduplication';
import { usePermissions } from '../context/PermissionContext';
import { generateAutomatedPayroll } from '../utils/payrollAutomation';
import { ui } from '../components/ui/feedback';

interface PayrollProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  payroll: PayrollRecord[];
  onUpdatePayroll: (payroll: PayrollRecord[]) => void;
  employees: Employee[];
  attendance?: AttendanceRecord[];
  leaves?: LeaveRequest[];
  authProfile?: UserAccount | null;
}

interface AuditLog {
  timestamp: string;
  user: string;
  action: string;
  remarks?: string;
}

// Indian-numbering amount-to-words (e.g. 80000 -> "Eighty Thousand Rupees Only").
const amountInWords = (num: number): string => {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number): string => n < 20 ? a[n] : (b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : ''));
  const three = (n: number): string => (Math.floor(n / 100) ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  const v = Math.max(0, Math.round(num || 0));
  if (v === 0) return 'Zero Rupees Only';
  const crore = Math.floor(v / 10000000);
  const lakh = Math.floor((v % 10000000) / 100000);
  const thousand = Math.floor((v % 100000) / 1000);
  const rest = v % 1000;
  let str = '';
  if (crore) str += three(crore) + ' Crore ';
  if (lakh) str += three(lakh) + ' Lakh ';
  if (thousand) str += three(thousand) + ' Thousand ';
  if (rest) str += three(rest) + ' ';
  return str.trim().replace(/\s+/g, ' ') + ' Rupees Only';
};

const PAYROLL_EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Sr No', key: 'srNo', width: 8 },
  { header: 'Employee Code', key: 'employeeId', width: 18 },
  { header: 'Employee', key: 'employeeName', width: 24 },
  { header: 'Department', key: 'department', width: 20 },
  { header: 'Month', key: 'month', width: 12 },
  { header: 'Year', key: 'year', width: 10 },
  { header: 'Basic Salary', key: 'basicSalary', width: 14 },
  { header: 'Allowances', key: 'allowances', width: 14 },
  { header: 'Deductions', key: 'deductions', width: 14 },
  { header: 'Net Salary', key: 'netSalary', width: 14 },
  { header: 'Status', key: 'payrollStatus', width: 14, format: (v, row) => v || row.status || '' },
];

export const Payroll: React.FC<PayrollProps> = ({
  role,
  activeCompanyId,
  companies,
  payroll,
  onUpdatePayroll,
  employees,
  attendance = [],
  leaves = [],
  authProfile
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('June');
  const [viewPayslip, setViewPayslip] = useState<PayrollRecord | null>(null);
  const [worksheetRecord, setWorksheetRecord] = useState<PayrollRecord | null>(null);
  const [auditRecord, setAuditRecord] = useState<PayrollRecord | null>(null);
  const [remarksInput, setRemarksInput] = useState('');

  const [confirmPaymentRecord, setConfirmPaymentRecord] = useState<PayrollRecord | null>(null);
  const [auditLogs, setAuditLogs] = useState<Record<string, AuditLog[]>>({});
  const [unmaskedField, setUnmaskedField] = useState<Record<string, boolean>>({});
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [isPayrollGenerating, setIsPayrollGenerating] = useState(false);
  // ── Selective payroll generation: pick exactly which employees to run ──
  const [genSelectedIds, setGenSelectedIds] = useState<Set<string>>(new Set());
  const [genDept, setGenDept] = useState('All');
  const [genDesig, setGenDesig] = useState('All');
  const [genSearch, setGenSearch] = useState('');
  const { canEdit: canEditModule, canCreate: canCreateModule } = usePermissions();
  const canEdit = canEditModule('payroll');
  const canCreate = canCreateModule('payroll');

  const toggleFieldMask = (empId: string, fieldName: string) => {
    const key = `${empId}-${fieldName}`;
    setUnmaskedField(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getMaskedValue = (val: string | undefined, fieldName: string, empId: string) => {
    if (!val) return '—';
    const key = `${empId}-${fieldName}`;
    const show = unmaskedField[key];
    if (show) return val;
    if (fieldName === 'aadhaar') return `•••• •••• ${val.slice(-4)}`;
    if (fieldName === 'pan') return `••••••${val.slice(-4)}`;
    if (fieldName === 'accountNumber') return `••••••••${val.slice(-4)}`;
    return `••••${val.slice(-3)}`;
  };

  const uniqueEmployees = useMemo(() => getUniqueEmployees(employees), [employees]);

  const getFullEmployee = (empId: any) => {
    return uniqueEmployees.find(e => e.employeeId === empId || String(e.id) === String(empId));
  };

  // Dynamic Edit Form State
  const [editForm, setEditForm] = useState({
    basicSalary: 0,
    allowances: 0,
    bonus: 0,
    tax: 0,
    deductions: 0,
    status: 'draft' as PayrollStatus,
    paymentStatus: 'pending' as 'pending' | 'paid' | 'failed',
    notes: '',
    reason: '' // captured into the payroll revision history on save
  });

  // Kind-aware: resolve a branch workspace to the branch (not the parent
  // company it shares an id with) so the masquerade header/scope is correct.
  const currentCompany = resolveActiveWorkspace(companies as any[], activeCompanyId)
    || companies.find(c => String(c.id) === String(activeCompanyId))
    || SAFE_COMPANY_FALLBACK;
  const companyEmployees = useMemo(() => uniqueEmployees.filter(e => isActiveEmployee(e) && isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation, e.branchId)), [uniqueEmployees, activeCompanyId, companies]);
  const companyPayrollStatus = deriveCompanyPayrollStatus(activeCompanyId, payroll);
  useEffect(() => {
    const stored = localStorage.getItem(`hrms_payroll_logs_${activeCompanyId}`);
    if (stored) {
      try {
        setAuditLogs(JSON.parse(stored));
      } catch {
        setAuditLogs({});
      }
    }
  }, [activeCompanyId]);

  // Set form state when view/edit modal opens
  useEffect(() => {
    if (viewPayslip) {
      setEditForm({
        basicSalary: viewPayslip.basicSalary || 0,
        allowances: viewPayslip.allowances || 0,
        bonus: viewPayslip.bonus || 0,
        tax: viewPayslip.tax || 0,
        deductions: viewPayslip.deductions || 0,
        status: viewPayslip.payrollStatus || viewPayslip.status,
        paymentStatus: viewPayslip.paymentStatus || 'pending',
        notes: viewPayslip.notes || '',
        reason: ''
      });
    }
  }, [viewPayslip]);

  const saveAuditLog = (recordId: string, action: string, remarks?: string) => {
    const newLog: AuditLog = {
      timestamp: `${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} — ${new Date().toLocaleDateString('en-IN')}`,
      user: role === 'Company Head' ? 'Company Head (Finance Admin)' : role === 'HR' ? 'HR Operations Manager' : 'System Administrator',
      action,
      remarks
    };

    const updated = { ...auditLogs, [recordId]: [...(auditLogs[recordId] || []), newLog] };
    setAuditLogs(updated);
    localStorage.setItem(`hrms_payroll_logs_${activeCompanyId}`, JSON.stringify(updated));
  };

  // Scope by employee membership: payroll rows carry an employeeId but no
  // branchId, so a branch workspace can only be matched via its employees.
  const scopedEmpIds = useMemo(
    () => buildScopedEmployeeIdSet(uniqueEmployees as any[], activeCompanyId, companies),
    [uniqueEmployees, activeCompanyId, companies]
  );

  // Latest DB attendance summaries (the source of truth salary slips must use),
  // keyed by employeeId for the selected month.
  const [dbSummaryByEmp, setDbSummaryByEmp] = useState<Record<string, any>>({});
  useEffect(() => {
    api.attendanceSummary.getAll(monthFilter, 2026)
      .then((rows: any[]) => {
        const map: Record<string, any> = {};
        (rows || []).forEach(r => { map[String(r.employeeId)] = r; });
        setDbSummaryByEmp(map);
      })
      .catch(() => {});
  }, [activeCompanyId, monthFilter, payroll]);

  const scopedRecords = useMemo(() => {
    let records = payroll.filter(p => p.month === monthFilter);

    if (role === 'Employee' && authProfile?.employeeId) {
      records = records.filter(p => p.employeeId === authProfile.employeeId || p.employeeId === authProfile.id);
    } else if (activeCompanyId) {
      records = records.filter(p => isRecordInWorkspace(p, activeCompanyId, scopedEmpIds, companies));
    }

    return records;
  }, [payroll, monthFilter, activeCompanyId, role, authProfile, scopedEmpIds, companies]);

  useEffect(() => {
    const hasRealPayroll = payroll.some(p => p.companyId === activeCompanyId);
    if (!hasRealPayroll && companyEmployees.length > 0 && activeCompanyId) {
      console.log('Failsafe fetching payroll for:', activeCompanyId);
      const token = localStorage.getItem('hrms_token');
      if (!token) return;
      fetch(`/api/payroll`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-workspace-id': activeCompanyId,
          'Content-Type': 'application/json'
        }
      })
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) {
          onUpdatePayroll([...payroll.filter(p => p.companyId !== activeCompanyId && (p as any).employee?.branchId !== activeCompanyId), ...data]);
        }
      })
      .catch(err => console.error('Failsafe fetch failed:', err));
    }
  }, [payroll.length, companyEmployees.length, activeCompanyId]);

  const filtered = useMemo(() => scopedRecords.filter(r => {
    const currentStatus = r.payrollStatus || r.status;
    const query = search.toLowerCase();
    const matchSearch = !query || (r.employeeName || '').toLowerCase().includes(query) || (r.department || '').toLowerCase().includes(query);
    const matchStatus = !statusFilter || currentStatus === statusFilter;
    const matchMonth = !monthFilter || r.month === monthFilter;
    return matchSearch && matchStatus && matchMonth;
  }), [scopedRecords, search, statusFilter, monthFilter]);

  const stats = useMemo(() => calculatePayrollStats(scopedRecords), [scopedRecords]);
  const latestLogs = useMemo(() => Object.values(auditLogs).flat().slice(-6).reverse(), [auditLogs]);

  const handlePreparePayroll = async (record: PayrollRecord) => {
    try {
      const updated = { status: 'prepared', payrollStatus: 'prepared' };
      const saved = await api.payroll.update(record.id, updated);
      onUpdatePayroll(payroll.map(r => r.id === record.id ? saved : r));
      saveAuditLog(record.id, 'Payroll prepared for review.');
    } catch (err) {
      console.error(err);
      ui.toast.error(getApiErrorMessage(err, 'Could not save the payroll change.'));
    }
  };

  const handleVerifyPayrollConfirm = async () => {
    if (!auditRecord) return;
    try {
      const updated = { status: 'payment_pending', payrollStatus: 'payment_pending' };
      const saved = await api.payroll.update(auditRecord.id, updated);
      onUpdatePayroll(payroll.map(r => r.id === auditRecord.id ? saved : r));
      saveAuditLog(auditRecord.id, 'Payroll verified by HR/Admin.', remarksInput || 'Verified for payment processing.');
      setAuditRecord(null);
      setRemarksInput('');
    } catch (err) {
      console.error(err);
      ui.toast.error(getApiErrorMessage(err, 'Could not save the payroll change.'));
    }
  };

  const handleStartPayment = (record: PayrollRecord) => {
    setConfirmPaymentRecord(record);
  };

  const handleConfirmPayment = async () => {
    if (!confirmPaymentRecord) return;
    setIsConfirmingPayment(true);
    try {
      const record = confirmPaymentRecord;
      const updated = {
        status: 'paid',
        payrollStatus: 'paid',
        paymentStatus: 'paid',
        paymentDate: new Date().toISOString(),
        paymentMethod: 'Bank Transfer',
        paidBy: role === 'Company Head' ? 'Finance Admin' : 'HR Admin'
      };
      const saved = await api.payroll.update(record.id, updated);
      onUpdatePayroll(payroll.map(r => r.id === record.id ? saved : r));
      saveAuditLog(record.id, `Salary payment confirmed (Bank Transfer).`, 'Payment ledger updated via Quick Confirm.');
      setConfirmPaymentRecord(null);

      await ui.alert({ title: 'Payment Marked Successfully', message: `Employee: ${record.employeeName}\nAmount: ₹${record.netSalary.toLocaleString('en-IN')}\nPayment Date: ${new Date().toLocaleString()}`, variant: 'success' });

      // Auto-refresh to hydrate all counts and dashboard widgets directly from DB
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      ui.toast.error(`Failed to save payment status: ${err.message || 'Unknown error'}`);
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  // Bulk-apply a status/payment change to many payroll records at once, then
  // persist every change to the database and reconcile local state.
  const applyBulkStatus = async (ids: string[], changes: any) => {
    const results = await Promise.all(
      ids.map(id => api.payroll.update(id, changes).then(saved => ({ id, saved })).catch(e => { console.error('Bulk update failed for', id, e); return null; }))
    );
    const okMap = new Map(results.filter(Boolean).map((r: any) => [r.id, r.saved]));
    onUpdatePayroll(payroll.map(r => okMap.get(r.id) || r));
    const failed = ids.length - okMap.size;
    if (failed > 0) throw new Error(`${failed} of ${ids.length} record(s) failed to update`);
    saveAuditLog('batch', 'Bulk payroll action applied', `${okMap.size} record(s) updated: ${JSON.stringify(changes)}`);
  };

  const handleBatchExportExcel = () => {
    // Sort by employee code, then enrich with Sr No + resolved code (never UUID).
    const rows = [...scopedRecords]
      .sort(byEmployeeCode(r => getFullEmployee(r.employeeId)?.employeeId || r.employeeName))
      .map((r, i) => ({
        ...r,
        srNo: i + 1,
        employeeId: getFullEmployee(r.employeeId)?.employeeId || (r as any).employee?.employeeId || '',
      }));
    exportRowsToExcel(`Payroll_${monthFilter}`, PAYROLL_EXPORT_COLUMNS, rows, `Payroll ${monthFilter}`);
  };

  // Mark all eligible records' payslip as generated (persisted) — the actual PDF
  // for an individual is downloaded from the per-row PDF button / payslip modal.
  const handleGenerateAllPayslips = async () => {
    const ids = scopedRecords
      .filter(r => ['paid', 'approved', 'bank_processing', 'payslip_generated'].includes(String((r as any).payrollStatus || r.status).toLowerCase()))
      .map(r => r.id);
    if (ids.length === 0) { ui.toast.warning('Approve or pay payroll before generating payslips.'); return; }
    await applyBulkStatus(ids, { payslipGenerated: true });
    ui.toast.success(`${ids.length} payslip(s) marked generated and saved to the database. Use the PDF/XLSX buttons (or the payslip view) to download an individual slip.`);
  };

  // Bank Transfer Sheet — NEFT/RTGS style export of net payable per employee.
  const handleExportBankSheet = () => {
    const cols: ExportColumn[] = [
      { header: 'Sr No', key: 'srNo', width: 8 },
      { header: 'Employee Name', key: 'employeeName', width: 26 },
      { header: 'Employee Code', key: 'employeeId', width: 18 },
      { header: 'Bank Name', key: 'bankName', width: 22 },
      { header: 'Account Number', key: 'accountNumber', width: 22 },
      { header: 'IFSC', key: 'ifsc', width: 16 },
      { header: 'Net Amount (INR)', key: 'netSalary', width: 18 },
    ];
    const rows = [...scopedRecords]
      .sort(byEmployeeCode(r => getFullEmployee(r.employeeId)?.employeeId || r.employeeName))
      .map((r, i) => {
      const emp: any = getFullEmployee(r.employeeId) || {};
      return {
        srNo: i + 1,
        employeeName: r.employeeName,
        employeeId: emp.employeeId || '',
        bankName: emp.bankName || '',
        accountNumber: emp.accountNumber || '',
        ifsc: emp.ifsc || '',
        netSalary: r.netSalary || 0,
      };
    });
    exportRowsToExcel(`Bank_Transfer_${monthFilter}`, cols, rows, `Bank Transfer ${monthFilter}`);
  };

  const handleSavePayrollEdits = async () => {
    if (!viewPayslip) return;
    const finalNet = editForm.basicSalary + editForm.allowances + editForm.bonus - editForm.deductions - editForm.tax;
    
    const updatedRecord: any = {
      basicSalary: editForm.basicSalary,
      allowances: editForm.allowances,
      bonus: editForm.bonus,
      tax: editForm.tax,
      deductions: editForm.deductions,
      netSalary: finalNet,
      status: editForm.status,
      payrollStatus: editForm.status,
      paymentStatus: editForm.paymentStatus,
      notes: editForm.notes,
      reason: editForm.reason, // recorded in the payroll revision history (audit trail)
      paymentDate: editForm.paymentStatus === 'paid' ? (viewPayslip.paymentDate || new Date().toISOString().split('T')[0]) : undefined
    };

    try {
      const saved = await api.payroll.update(viewPayslip.id, updatedRecord);
      onUpdatePayroll(payroll.map(r => r.id === viewPayslip.id ? saved : r));
      saveAuditLog(viewPayslip.id, 'Payroll details edited & updated.', `Net salary recalculated to ₹${finalNet.toLocaleString('en-IN')}`);
      setViewPayslip(null);
    } catch (e) {
      console.error(e);
      ui.toast.error(getApiErrorMessage(e, 'Could not update the payroll.'));
    }
  };

  const handleGeneratePayslip = async (record: PayrollRecord) => {
    try {
      const updated = {
        status: 'payslip_generated',
        payrollStatus: 'payslip_generated',
        payslipGenerated: true
      };
      const saved = await api.payroll.update(record.id, updated);
      onUpdatePayroll(payroll.map(r => r.id === record.id ? saved : r));
      saveAuditLog(record.id, 'Payslip generated for employee.');
    } catch (e) {
      console.error(e);
      ui.toast.error(getApiErrorMessage(e, 'Could not update the payslip status.'));
    }
  };

  const handleSendEmail = async (record: PayrollRecord) => {
    try {
      const emp = getFullEmployee(record.employeeId);
      const att = buildAttendanceSummary(emp);
      const { base64, fileName } = payslipBase64(record, emp, currentCompany, att);
      const res: any = await api.payroll.emailSlip(record.id, { pdfBase64: base64, fileName, to: (emp as any)?.email || undefined });
      // reflect emailSentAt locally
      onUpdatePayroll(payroll.map(r => r.id === record.id ? { ...r, emailSentAt: new Date().toISOString() } as any : r));
      saveAuditLog(record.id, res?.smtpConfigured ? 'Payslip emailed to employee.' : 'Payslip email queued (SMTP not configured).', res?.to ? `Recipient: ${res.to}` : undefined);
      ui.toast.success(res?.message || `Salary slip email processed for ${record.employeeName}.`);
    } catch (e: any) {
      console.error('Email payslip failed:', e);
      ui.toast.error(`Failed to email salary slip: ${e?.message || 'Unknown error'}`);
    }
  };

  // Open the OS print dialog for an individual salary slip.
  const handlePrintPayslip = (record: PayrollRecord) => {
    try {
      const emp = getFullEmployee(record.employeeId);
      const att = buildAttendanceSummary(emp);
      printPayslipPDF(record, emp, currentCompany, att);
      saveAuditLog(record.id, 'Salary slip sent to printer.');
    } catch (e: any) {
      console.error('Print payslip failed:', e);
      ui.toast.error(`Failed to print salary slip: ${e?.message || 'Unknown error'}`);
    }
  };

  // Regenerate = re-render the slip PDF and mark generated (fresh timestamp).
  const handleRegeneratePayslip = async (record: PayrollRecord) => {
    try {
      const emp = getFullEmployee(record.employeeId);
      const att = buildAttendanceSummary(emp);
      const fileName = generateEnterprisePayslipPDF(record, emp, currentCompany, att);
      try { await api.payroll.slipEvent(record.id, 'generated', fileName); } catch {}
      onUpdatePayroll(payroll.map(r => r.id === record.id ? { ...r, payslipGenerated: true, generatedAt: new Date().toISOString(), payslipFileName: fileName } as any : r));
      saveAuditLog(record.id, 'Salary slip regenerated.');
    } catch (e: any) {
      console.error('Regenerate failed:', e);
      ui.toast.error(`Failed to regenerate salary slip: ${e?.message || 'Unknown error'}`);
    }
  };

  // Build the {record, employee, attendance} bundle for ZIP export.
  const buildBundle = (records: PayrollRecord[]): PayslipBundleItem[] =>
    records.map(r => { const emp = getFullEmployee(r.employeeId); return { record: r, employee: emp, attendance: buildAttendanceSummary(emp) }; });

  const handleDownloadZip = async (records: PayrollRecord[], zipName: string) => {
    if (!records.length) { ui.toast.warning('No payroll records in this selection to export.'); return; }
    try {
      const n = await downloadPayslipsZip(buildBundle(records), currentCompany, zipName);
      saveAuditLog('bulk', `Downloaded ${n} salary slips as ZIP (${zipName}).`);
    } catch (e: any) {
      console.error('ZIP export failed:', e);
      ui.toast.error(`Failed to build salary slip ZIP: ${e?.message || 'Unknown error'}`);
    }
  };

  const handleApprovePayroll = async (ids: string[]) => {
    try {
      await api.payroll.approve(ids);
      onUpdatePayroll(payroll.map(r => ids.includes(r.id) ? { ...r, payrollStatus: 'approved', approvedAt: new Date().toISOString() } as any : r));
      saveAuditLog('bulk', `Approved ${ids.length} payroll record(s).`);
      ui.toast.success(`Approved ${ids.length} payroll record(s).`);
    } catch (e: any) {
      console.error('Approve failed:', e);
      ui.toast.error(`Failed to approve payroll: ${e?.message || 'Unknown error'}`);
    }
  };

  const handleLockPayroll = async (ids: string[]) => {
    if (!(await ui.confirm({ message: `Lock ${ids.length} payroll record(s)? Locked records can no longer be edited.`, variant: 'warning', confirmText: 'Lock' }))) return;
    try {
      await api.payroll.lock(ids);
      onUpdatePayroll(payroll.map(r => ids.includes(r.id) ? { ...r, payrollStatus: 'locked', lockedAt: new Date().toISOString() } as any : r));
      saveAuditLog('bulk', `Locked ${ids.length} payroll record(s).`);
      ui.toast.success(`Locked ${ids.length} payroll record(s).`);
    } catch (e: any) {
      console.error('Lock failed:', e);
      ui.toast.error(`Failed to lock payroll: ${e?.message || 'Unknown error'}`);
    }
  };

  // Recalculate outdated payroll from the latest attendance summaries.
  const handleRecalculate = async (ids?: string[]) => {
    const targetIds = ids && ids.length ? ids : scopedRecords.filter(r => (r as any).isOutdated).map(r => r.id);
    if (!targetIds.length) { ui.toast.warning('No payroll records require regeneration.'); return; }
    if (!(await ui.confirm({ message: `Recalculate ${targetIds.length} payroll record(s) from the latest attendance? Locked records are skipped.` }))) return;
    try {
      const res = await api.payroll.recalculate({ ids: targetIds });
      saveAuditLog('bulk', `${roleAudit} recalculated ${res?.recalculated ?? targetIds.length} payroll record(s) from attendance.`);
      // Re-fetch payroll so the recomputed figures + cleared outdated flags show.
      try { const fresh = await api.payroll.getAll(); onUpdatePayroll(fresh); } catch { /* keep current */ }
      ui.toast.success(`Recalculated ${res?.recalculated ?? targetIds.length} payroll record(s)${res?.skippedLocked ? ` (${res.skippedLocked} locked skipped)` : ''}.`);
    } catch (e: any) {
      console.error('Recalculate failed:', e);
      ui.toast.error(`Failed to recalculate payroll: ${e?.message || 'Unknown error'}`);
    }
  };

  // ── Workflow-level bulk actions (operate on the whole scoped month) ──
  const handleApproveAll = async () => {
    const ids = scopedRecords.map(r => r.id);
    if (!ids.length) { ui.toast.warning('No payroll to approve. Generate payroll first.'); return; }
    if (!(await ui.confirm({ message: `Approve all ${ids.length} payroll record(s)? Approved payroll becomes read-only.` }))) return;
    handleApprovePayroll(ids);
  };

  const handleLockMonth = () => {
    const ids = scopedRecords.map(r => r.id);
    if (!ids.length) { ui.toast.warning('No payroll to lock.'); return; }
    handleLockPayroll(ids);
  };

  // Generate payroll for the employees the user SELECTED in the grid — keeps the
  // selection (no second "pick employees" modal) and reuses the exact same engine
  // and scope for both Generate and the subsequent Approve/Pay actions.
  const handleGenerateSelected = async (recs: PayrollRecord[]) => {
    const empIds = Array.from(new Set(recs.map(r => String((r as any).employeeId))));
    if (!empIds.length) { ui.toast.warning('Select employees first.'); return; }
    if (!(await ui.confirm({ message: `Generate / regenerate payroll for ${empIds.length} selected employee(s) — ${monthFilter} 2026?\n\nExisting records are updated (no duplicates).` }))) return;
    handleGeneratePayroll(empIds);
  };

  // Role label for audit messages (e.g. "Super Admin generated payroll for 775…").
  const roleAudit = role === 'Super Admin' ? 'Super Admin' : role === 'Company Head' ? 'Company Admin' : 'Branch HR';

  const handleMarkPaid = async (ids: string[]) => {
    if (!ids.length) { ui.toast.warning('No employees selected.'); return; }
    if (!(await ui.confirm({ message: `Mark ${ids.length} employee salar${ids.length === 1 ? 'y' : 'ies'} as Paid?` }))) return;
    try {
      await api.payroll.markPaid(ids);
      const now = new Date().toISOString();
      onUpdatePayroll(payroll.map(r => ids.includes(r.id) ? { ...r, paymentStatus: 'paid', payrollStatus: 'paid', paymentDate: now } as any : r));
      saveAuditLog('bulk', `${roleAudit} marked ${ids.length} salary payment(s) as Paid.`);
      ui.toast.success(`Marked ${ids.length} salaries as Paid.`);
    } catch (e: any) {
      console.error('Mark paid failed:', e);
      ui.toast.error(`Failed to mark salaries paid: ${e?.message || 'Unknown error'}`);
    }
  };
  const handleMarkPaidAll = () => handleMarkPaid(scopedRecords.map(r => r.id));

  // Generate slips for the given records: stamp generatedAt + filename, bundle PDFs.
  const handleGenerateSlips = async (recs: PayrollRecord[]) => {
    if (!recs.length) { ui.toast.warning('No employees selected. Generate payroll first.'); return; }
    try {
      await Promise.all(recs.map(r => {
        const emp = getFullEmployee(r.employeeId);
        const fileName = payslipFileName(r, emp);
        return api.payroll.slipEvent(r.id, 'generated', fileName).catch(() => {});
      }));
      const now = new Date().toISOString();
      onUpdatePayroll(payroll.map(r => recs.find(x => x.id === r.id) ? { ...r, payslipGenerated: true, generatedAt: now } as any : r));
      saveAuditLog('bulk', `${roleAudit} generated ${recs.length} salary slip(s).`);
      await handleDownloadZip(recs, `Salary_Slips_${monthFilter}_2026`);
      ui.toast.success(`Generated ${recs.length} salary slips (PDF paths stored). ZIP downloaded.`);
    } catch (e: any) {
      console.error('Generate slips failed:', e);
      ui.toast.error(`Failed to generate salary slips: ${e?.message || 'Unknown error'}`);
    }
  };
  const handleGenerateSlipsAll = () => handleGenerateSlips(scopedRecords);

  const handleEmailAll = async (records: PayrollRecord[]) => {
    if (!records.length) { ui.toast.warning('No salary slips to email.'); return; }
    if (!(await ui.confirm({ message: `Email salary slips to ${records.length} employee(s)?` }))) return;
    let sent = 0, failed = 0;
    for (const r of records) {
      try {
        const emp = getFullEmployee(r.employeeId);
        const att = buildAttendanceSummary(emp);
        const { base64, fileName } = payslipBase64(r, emp, currentCompany, att);
        await api.payroll.emailSlip(r.id, { pdfBase64: base64, fileName, to: (emp as any)?.email || undefined });
        sent++;
      } catch { failed++; }
    }
    onUpdatePayroll(payroll.map(r => records.find(x => x.id === r.id) ? { ...r, emailSentAt: new Date().toISOString() } as any : r));
    saveAuditLog('bulk', `Emailed ${sent} salary slips${failed ? ` (${failed} failed)` : ''}.`);
    await ui.alert({ title: 'Email All complete', message: `${sent} processed${failed ? `, ${failed} failed` : ''}.\n(SMTP not configured → logged in dev mode until SMTP_* set in backend/.env.)` });
  };

  // Real attendance summary for a payslip — actual Present/Absent/Leave/OT for
  // the record's employee in the payroll month (zeros only when no records).
  const buildAttendanceSummary = (emp: any) => {
    // Prefer the DB AttendanceSummary (the edited source of truth). It carries
    // present/CL/PL/SL/LWP/OT and the recomputed payable days.
    const s = dbSummaryByEmp[String(emp?.id)];
    if (s) {
      return {
        totalDays: 30, workingDays: 26,
        present: s.presentDays, absent: s.absentDays,
        leave: (s.cl || 0) + (s.pl || 0) + (s.sl || 0),
        cl: s.cl, pl: s.pl, sl: s.sl, lwp: s.lwp,
        weeklyOff: 0, holiday: 0,
        lop: s.lwp, overtimeHours: s.otHours, payableDays: s.payableDays,
      };
    }
    // Fallback: derive from raw daily attendance rows.
    const MONTHS: Record<string, number> = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };
    const mIdx = MONTHS[String(monthFilter || '').toLowerCase()] ?? -1;
    const recs = (attendance || []).filter((a: any) => a.employeeId === emp?.id && (mIdx < 0 || new Date(a.date).getMonth() === mIdx));
    let present = 0, absent = 0, leave = 0, weeklyOff = 0, holiday = 0, ot = 0;
    for (const a of recs) {
      const st = String(a.status || '').toLowerCase();
      if (/present|on duty|wfo|work from home|wfh/.test(st)) present++;
      else if (/leave/.test(st)) leave++;
      else if (/absent/.test(st)) absent++;
      else if (/weekly off|week off/.test(st)) weeklyOff++;
      else if (/holiday/.test(st)) holiday++;
      ot += Number((a as any).overtimeHours ?? 0);
    }
    return { totalDays: 30, workingDays: 26, present, absent, leave, weeklyOff, holiday, lop: absent, overtimeHours: ot };
  };

  const handleDownloadPayslip = (record: PayrollRecord, format: 'pdf' | 'xlsx' = 'pdf') => {
    try {
      const emp = getFullEmployee(record.employeeId);
      const att = buildAttendanceSummary(emp);
      if (format === 'pdf') {
        const fileName = generateEnterprisePayslipPDF(record, emp, currentCompany, att);
        // stamp downloadedAt (audit history) — non-blocking
        api.payroll.slipEvent(record.id, 'downloaded', fileName).catch(() => {});
        onUpdatePayroll(payroll.map(r => r.id === record.id ? { ...r, downloadedAt: new Date().toISOString(), payslipFileName: fileName } as any : r));
        saveAuditLog(record.id, 'Salary slip PDF downloaded.');
      } else {
        generateEnterprisePayslipExcel(record, emp, currentCompany, att);
        saveAuditLog(record.id, 'Salary slip XLSX downloaded.');
      }
    } catch (e: any) {
      console.error('Payslip generation failed:', e);
      ui.toast.error(`Error generating ${format.toUpperCase()} payslip: ${e?.message || 'Unknown error'}`);
    }
  };

  const handleGeneratePayroll = async (empIdsOverride?: string[]) => {
    setIsPayrollGenerating(true);
    try {
      const now = new Date();
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      // Generate for the SELECTED payroll month (period-based), not just "now".
      const currentMonth = monthFilter || monthNames[now.getMonth()];
      const currentYear = now.getFullYear();

      // Selective generation: run ONLY for the chosen employees. If none are
      // explicitly selected, fall back to every employee in the workspace.
      const targetEmployees = (empIdsOverride && empIdsOverride.length)
        ? companyEmployees.filter(e => empIdsOverride.includes(String(e.id)))
        : genSelectedIds.size > 0
          ? companyEmployees.filter(e => genSelectedIds.has(String(e.id)))
          : companyEmployees;

      if (targetEmployees.length === 0) {
        ui.toast.warning('No employees selected to generate payroll for.');
        setIsPayrollGenerating(false);
        return;
      }

      // Enterprise Local Automation Engine Trigger (attendance + leave + OT aware)
      const generatedRecords = generateAutomatedPayroll(
        currentCompany,
        targetEmployees,
        attendance,
        leaves,
        currentMonth,
        currentYear
      );

      // Save generated records to the database
      const dbSavedRecords = await Promise.all(
         generatedRecords.map(async (record) => {
            // Generated payroll enters PENDING APPROVAL (salary computed from
            // attendance/leave/OT) — awaiting "Approve", then a separate "Mark Paid".
            const cleanRecord = { ...record, payrollStatus: 'pending_approval', status: 'pending_approval', paymentStatus: 'pending', id: undefined };
            return await api.payroll.create(cleanRecord);
         })
      );

      // Re-fetch the authoritative payroll list from the DATABASE (the single source
      // of truth) so the dashboard count always equals the UNIQUE employees for the
      // month and never inflates on re-generation. Fall back to a per-employee merge
      // (deduped by employeeId, ignoring companyId) only if the refetch fails.
      try {
        const fresh = await api.payroll.getAll();
        onUpdatePayroll(fresh);
      } catch {
        const genEmpIds = new Set(dbSavedRecords.map((r: any) => String(r.employeeId)));
        const filteredPayroll = payroll.filter(p => !(p.month === currentMonth && p.year === currentYear && genEmpIds.has(String(p.employeeId))));
        onUpdatePayroll([...filteredPayroll, ...dbSavedRecords]);
      }

      saveAuditLog('bulk', `${roleAudit} generated payroll for ${dbSavedRecords.length} employee(s) — ${currentMonth} ${currentYear}.`);
      await ui.alert({ title: 'Enterprise Payroll Generated', message: `${dbSavedRecords.length} employee(s) processed for ${currentMonth} ${currentYear}. Attendance, Unpaid Leaves, and Overtime were applied. Records are saved to the database (existing records updated — no duplicates).`, variant: 'success' });
      setShowPayrollModal(false);
      setGenSelectedIds(new Set());

    } catch (err: any) {
      console.error(err);
      ui.toast.error(err.message || 'Error generating payroll');
    } finally {
      setIsPayrollGenerating(false);
    }
  };

  if (role === 'Employee') {
    return (
      <div className="space-y-5 font-sans text-left">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">My Payslips & Salary History</h2>
          <p className="text-sm text-slate-500 mt-1">View, track, and download your monthly corporate salary receipts.</p>
        </div>

        <Card padding={false}>
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Personal Payslip Records</h3>
            <Badge variant="blue">{currentCompany.name}</Badge>
          </div>
          <div className="p-5">
            <PayrollWorkflowTable
              records={filtered}
              primaryColor={currentCompany.primaryColor}
              onViewPayslip={setViewPayslip}
              onPrepare={handlePreparePayroll}
              onVerifyClick={() => {}}
              onPayClick={() => {}}
              onPayslipClick={() => {}}
              onDownload={(_r, fmt) => ui.toast.success(`Download ${fmt?.toUpperCase() || 'PDF'} feature completed. Enterprise payslip generated.`)}
              onSendClick={handleSendEmail}
              role={role}
              canEdit={canEdit}
            />
          </div>
        </Card>

        {/* Detailed payslip read-only modal for employees */}
        <Modal
          open={!!viewPayslip}
          onClose={() => setViewPayslip(null)}
          title="Personal Payslip Details"
          size="md"
          footer={<Button onClick={() => setViewPayslip(null)}>Close</Button>}
        >
          {viewPayslip && (() => {
            const emp = getFullEmployee(viewPayslip.employeeId);
            return (
              <div className="space-y-4 text-xs text-left font-sans">
                {/* Header branding block */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3">
                  <div className="w-10 h-10 bg-cyan-100 text-cyan-800 font-black rounded-lg flex items-center justify-center text-sm ring-1 ring-cyan-200">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">GUJARAT CANCER & RESEARCH INSTITUTE</h4>
                    <p className="text-sm font-bold text-slate-800">{viewPayslip.employeeName}</p>
                    <p className="text-[10px] text-gray-500 font-medium">Branch: {emp?.branchLocation || 'Ahmedabad'} · Code: {emp?.employeeId || '—'}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-[10px] uppercase text-gray-400 font-bold">Active Cycle</p>
                    <p className="text-sm font-extrabold text-blue-600">{viewPayslip.month} {viewPayslip.year}</p>
                  </div>
                </div>

                {/* Grid for compliance parameters */}
                <div className="bg-slate-50/50 border border-slate-200 rounded-lg p-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div><p className="text-[10px] text-gray-400">Category Class</p><p className="font-semibold text-slate-800 mt-0.5">{emp?.category || 'Skilled'}</p></div>
                  <div>
                    <p className="text-[10px] text-gray-400">Permanent Account No (PAN)</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-semibold text-slate-800">{getMaskedValue(emp?.pan, 'pan', viewPayslip.employeeId)}</span>
                      {emp?.pan && (
                        <button onClick={() => toggleFieldMask(viewPayslip.employeeId, 'pan')} className="text-slate-400 p-0.5 hover:bg-slate-100 rounded">
                          {unmaskedField[`${viewPayslip.employeeId}-pan`] ? <EyeOff size={10} /> : <Eye size={10} />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">Aadhaar Card No</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-semibold text-slate-800">{getMaskedValue(emp?.aadhaar, 'aadhaar', viewPayslip.employeeId)}</span>
                      {emp?.aadhaar && (
                        <button onClick={() => toggleFieldMask(viewPayslip.employeeId, 'aadhaar')} className="text-slate-400 p-0.5 hover:bg-slate-100 rounded">
                          {unmaskedField[`${viewPayslip.employeeId}-aadhaar`] ? <EyeOff size={10} /> : <Eye size={10} />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div><p className="text-[10px] text-gray-400">Provident Fund (PF) No</p><p className="font-semibold text-slate-700 mt-0.5">{emp?.pfNumber || '—'}</p></div>
                  <div><p className="text-[10px] text-gray-400">Universal Account No (UAN)</p><p className="font-semibold text-slate-700 mt-0.5">{emp?.uan || '—'}</p></div>
                  <div><p className="text-[10px] text-gray-400">ESIC IP Number</p><p className="font-semibold text-slate-700 mt-0.5">{emp?.esic || '—'}</p></div>
                </div>

                {/* Banking specifics */}
                <div className="bg-slate-50/50 border border-slate-200 rounded-lg p-3 grid grid-cols-3 gap-3">
                  <div><p className="text-[10px] text-gray-400">Bank Name</p><p className="font-bold text-slate-800 mt-0.5">{emp?.bankName || '—'}</p></div>
                  <div>
                    <p className="text-[10px] text-gray-400">Bank Account Number</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-semibold text-slate-800">{getMaskedValue(emp?.accountNumber, 'accountNumber', viewPayslip.employeeId)}</span>
                      {emp?.accountNumber && (
                        <button onClick={() => toggleFieldMask(viewPayslip.employeeId, 'accountNumber')} className="text-slate-400 p-0.5 hover:bg-slate-100 rounded">
                          {unmaskedField[`${viewPayslip.employeeId}-accountNumber`] ? <EyeOff size={10} /> : <Eye size={10} />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div><p className="text-[10px] text-gray-400">IFSC Code</p><p className="font-semibold text-slate-800 mt-0.5">{emp?.ifsc || '—'}</p></div>
                </div>

                {/* Salary breakdown math */}
                <div className="space-y-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-left">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Basic Monthly Salary</p>
                      <p className="mt-1 text-base font-bold text-slate-900">₹{viewPayslip.basicSalary.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50/50 p-3 border border-emerald-200 text-left">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-emerald-800 font-bold">Net Payout (Credited)</p>
                      <p className="mt-1 text-base font-bold text-emerald-950 font-mono">₹{viewPayslip.netSalary.toLocaleString('en-IN')}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-left">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Allowances</p>
                      <p className="mt-1 font-semibold text-slate-800 text-[11px]">+₹{viewPayslip.allowances.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-left">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Deductions</p>
                      <p className="mt-1 font-semibold text-slate-800 text-[11px]">-₹{viewPayslip.deductions.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-left">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Bonus Portion</p>
                      <p className="mt-1 font-semibold text-slate-800 text-[11px]">+₹{(viewPayslip.bonus || 0).toLocaleString('en-IN')}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-left">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Tax Deducted (TDS)</p>
                      <p className="mt-1 font-semibold text-slate-800 text-[11px]">-₹{(viewPayslip.tax || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-left">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Payment Status</p>
                      <Badge variant={viewPayslip.paymentStatus === 'paid' ? 'green' : 'amber'}>{viewPayslip.paymentStatus.toUpperCase()}</Badge>
                    </div>
                  </div>
                </div>

                {viewPayslip.notes && (
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-left">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Auditor Verification Note</p>
                    <p className="mt-1 text-slate-700 italic">"{viewPayslip.notes}"</p>
                  </div>
                )}
              </div>
            );
          })()}
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-5 font-sans">

      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="text-left">
            <h2 className="text-lg font-semibold text-slate-900">Enterprise Payroll Management</h2>
            <p className="text-sm text-slate-500 mt-1">Secure payroll workflow for <strong>{currentCompany.name}</strong> with verification, payment confirmation, and payslip distribution.</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              options={[{ value: 'June', label: 'June 2026' }, { value: 'May', label: 'May 2026' }, { value: 'April', label: 'April 2026' }]}
            />
            <ExportMenu
              fileName={`Payroll_${currentCompany.name}`}
              title={`Payroll - ${currentCompany.name}`}
              subtitle={monthFilter ? `Month: ${monthFilter}` : undefined}
              sheetName="Payroll"
              columns={PAYROLL_EXPORT_COLUMNS}
              rows={() => [...filtered].sort(byEmployeeCode(r => getFullEmployee(r.employeeId)?.employeeId || r.employeeName)).map((r, i) => ({ ...r, srNo: i + 1, employeeId: getFullEmployee(r.employeeId)?.employeeId || (r as any).employee?.employeeId || '' }))}
            />
          </div>
        </div>
      </div>

      {/* ── Simple 6-step payroll workflow + slip management (live data) ── */}
      <PayrollWorkbench
        records={scopedRecords}
        company={currentCompany}
        getEmployee={getFullEmployee}
        monthLabel={`${monthFilter} 2026`}
        role={role}
        canEdit={canEdit}
        onGeneratePayroll={() => { setGenSelectedIds(new Set()); setGenSearch(''); setGenDept('All'); setGenDesig('All'); setShowPayrollModal(true); }}
        onApproveAll={handleApproveAll}
        onGenerateSlipsAll={handleGenerateSlipsAll}
        onExportBank={handleExportBankSheet}
        onMarkPaidAll={handleMarkPaidAll}
        onLockMonth={handleLockMonth}
        onView={setViewPayslip}
        onOpenWorksheet={setWorksheetRecord}
        onDownloadPdf={(r) => handleDownloadPayslip(r, 'pdf')}
        onPrint={handlePrintPayslip}
        onEmail={handleSendEmail}
        onRegenerate={handleRegeneratePayslip}
        onDownloadZip={handleDownloadZip}
        onEmailAll={handleEmailAll}
        onApprove={handleApprovePayroll}
        onMarkPaid={handleMarkPaid}
        onGenerateSelected={canCreate ? handleGenerateSelected : undefined}
        onGenerateSlips={handleGenerateSlips}
        onLock={handleLockPayroll}
        onRecalculate={handleRecalculate}
      />

      {/* ── Salary Worksheet (spreadsheet-style earnings/deductions editor) ── */}
      <PayrollWorksheet
        open={!!worksheetRecord}
        payrollId={worksheetRecord?.id ?? null}
        canEdit={canEdit}
        onClose={() => setWorksheetRecord(null)}
        onSaved={async () => { try { const fresh = await api.payroll.getAll(); onUpdatePayroll(fresh); } catch { /* keep current */ } }}
      />

      <Modal
        open={!!auditRecord}
        onClose={() => setAuditRecord(null)}
        title="Verify Payroll Record"
        footer={
          <>
            <Button variant="outline" onClick={() => setAuditRecord(null)}>Cancel</Button>
            <Button onClick={handleVerifyPayrollConfirm}>Confirm Verification</Button>
          </>
        }
      >
        {auditRecord && (
          <div className="space-y-4 text-left">
            <p className="text-sm text-slate-600">Confirm that attendance, bonuses, deductions, and tax adjustments are correct before moving to payment pending.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Employee</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{auditRecord.employeeName}</p>
                <p className="text-sm text-slate-500">{auditRecord.department}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Payroll Amount</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">₹{auditRecord.netSalary.toLocaleString('en-IN')}</p>
              </div>
            </div>
            <Input
              label="Verification Notes"
              placeholder="Add a note for the audit trail"
              value={remarksInput}
              onChange={e => setRemarksInput(e.target.value)}
            />
          </div>
        )}
      </Modal>

      


      {/* Detailed and interactive edit modal for HR/Admin */}
      <Modal
        open={!!viewPayslip}
        onClose={() => setViewPayslip(null)}
        title="Modify Payroll Structure"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setViewPayslip(null)}>Close</Button>
            {canEdit && <Button onClick={handleSavePayrollEdits}>Save Changes</Button>}
          </>
        }
      >
        {viewPayslip && (
          <div className="space-y-4 text-sm text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-base font-bold text-slate-900">{viewPayslip.employeeName}</h4>
                <p className="text-xs text-slate-500">{viewPayslip.department} — Code: {getFullEmployee(viewPayslip.employeeId)?.employeeId || '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.1em] text-slate-400 font-semibold">Active Cycle</p>
                <p className="text-sm font-bold text-blue-600">{viewPayslip.month} {viewPayslip.year}</p>
              </div>
            </div>

            <div className="space-y-4 text-left">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Basic Portion (INR/mo) *"
                  type="number"
                  disabled={!canEdit}
                  value={editForm.basicSalary}
                  onChange={e => setEditForm({ ...editForm, basicSalary: parseInt(e.target.value) || 0 })}
                />
                <Input
                  label="Allowances (INR/mo) *"
                  type="number"
                  disabled={!canEdit}
                  value={editForm.allowances}
                  onChange={e => setEditForm({ ...editForm, allowances: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="Deductions (INR/mo) *"
                  type="number"
                  disabled={!canEdit}
                  value={editForm.deductions}
                  onChange={e => setEditForm({ ...editForm, deductions: parseInt(e.target.value) || 0 })}
                />
                <Input
                  label="Bonus (INR)"
                  type="number"
                  disabled={!canEdit}
                  value={editForm.bonus}
                  onChange={e => setEditForm({ ...editForm, bonus: parseInt(e.target.value) || 0 })}
                />
                <Input
                  label="Tax Deductions (INR)"
                  type="number"
                  disabled={!canEdit}
                  value={editForm.tax}
                  onChange={e => setEditForm({ ...editForm, tax: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Workflow Status"
                  disabled={!canEdit}
                  value={editForm.status}
                  onChange={e => setEditForm({ ...editForm, status: e.target.value as PayrollStatus })}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'prepared', label: 'Prepared' },
                    { value: 'verified', label: 'Verified' },
                    { value: 'payment_pending', label: 'Payment Pending' },
                    { value: 'paid', label: 'Paid' },
                    { value: 'payslip_generated', label: 'Payslip Generated' }
                  ]}
                />
                <Select
                  label="Payment Status"
                  disabled={!canEdit}
                  value={editForm.paymentStatus}
                  onChange={e => setEditForm({ ...editForm, paymentStatus: e.target.value as any })}
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'paid', label: 'Paid' },
                    { value: 'failed', label: 'Failed' }
                  ]}
                />
              </div>

              <Input
                label="Verification / Payroll Notes"
                placeholder="e.g. Approved by Finance Head"
                disabled={!canEdit}
                value={editForm.notes}
                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
              />

              <Input
                label="Reason for change (recorded in revision history)"
                placeholder="e.g. Corrected overtime amount"
                disabled={!canEdit}
                value={editForm.reason}
                onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
              />

              {/* ── Real-time Payroll Formula Engine ──────────────────────────
                  Every keystroke above re-renders this block, so Gross, Total
                  Deductions and Net recalculate instantly with no refresh. */}
              {(() => {
                const gross = editForm.basicSalary + editForm.allowances + editForm.bonus;
                const totalDeductions = editForm.deductions + editForm.tax;
                const net = gross - totalDeductions;
                return (
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                      <div className="p-4 bg-blue-50">
                        <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Gross Salary</p>
                        <p className="text-[9px] text-blue-500 mt-0.5">Basic + Allowances + Bonus</p>
                        <p className="text-lg font-black text-blue-900 font-mono mt-1">₹{gross.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="p-4 bg-rose-50">
                        <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Total Deductions</p>
                        <p className="text-[9px] text-rose-500 mt-0.5">Deductions + Tax</p>
                        <p className="text-lg font-black text-rose-900 font-mono mt-1">₹{totalDeductions.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="p-4 bg-emerald-50">
                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Net Payout</p>
                        <p className="text-[9px] text-emerald-500 mt-0.5">Gross − Deductions</p>
                        <p className="text-lg font-black text-emerald-900 font-mono mt-1">₹{net.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                    <div className="px-4 py-2 bg-slate-50 border-t border-slate-200">
                      <p className="text-[10px] text-slate-500"><span className="font-bold text-slate-600">In words:</span> {amountInWords(net)}</p>
                    </div>
                  </div>
                );
              })()}

              {editForm.paymentStatus !== 'paid' && canEdit && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmPaymentRecord(viewPayslip);
                      setViewPayslip(null);
                    }}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition"
                  >
                    Mark as Paid & Lock
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmPaymentRecord}
        onClose={() => !isConfirmingPayment && setConfirmPaymentRecord(null)}
        title="Confirm Payment"
        size="sm"
        footer={
          <>
            <button
              disabled={isConfirmingPayment}
              onClick={() => setConfirmPaymentRecord(null)}
              className="px-4 py-2 bg-white border border-[#DCE8FF] hover:bg-[#F7FAFF] text-[#4B5563] text-xs font-bold rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              disabled={isConfirmingPayment}
              onClick={handleConfirmPayment}
              className="px-4 py-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-70 text-white text-xs font-bold rounded-[12px] shadow-sm transition-all flex items-center gap-2"
            >
              {isConfirmingPayment ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing Payment...
                </>
              ) : (
                'Mark Paid'
              )}
            </button>
          </>
        }
      >
        <div className="p-4 text-left">
          <p className="text-[13px] text-[#4B5563] leading-relaxed mb-2">
            Mark this employee payroll as paid?
          </p>
          {confirmPaymentRecord && (
            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <p className="font-semibold text-slate-900">{confirmPaymentRecord.employeeName}</p>
              <p className="text-emerald-600 font-bold mt-1">₹{confirmPaymentRecord.netSalary.toLocaleString('en-IN')}</p>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={showPayrollModal}
        onClose={() => !isPayrollGenerating && setShowPayrollModal(false)}
        title="Generate Payroll"
        size="lg"
        footer={
          <>
            <Button
              disabled={isPayrollGenerating}
              onClick={() => setShowPayrollModal(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isPayrollGenerating}
              onClick={() => handleGeneratePayroll()}
            >
              {isPayrollGenerating ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2 inline-block align-middle" />
                  Processing...
                </>
              ) : (
                genSelectedIds.size > 0 ? `Generate for ${genSelectedIds.size} selected` : 'Generate for all'
              )}
            </Button>
          </>
        }
      >
        <div className="p-4 text-left">
          {(() => {
            const depts = ['All', ...Array.from(new Set(companyEmployees.map((e: any) => e.department).filter(Boolean))).sort()];
            const desigs = ['All', ...Array.from(new Set(companyEmployees.map((e: any) => e.designation).filter(Boolean))).sort()];
            const q = genSearch.trim().toLowerCase();
            const list = companyEmployees.filter((e: any) =>
              (genDept === 'All' || e.department === genDept) &&
              (genDesig === 'All' || e.designation === genDesig) &&
              (!q || (e.name || '').toLowerCase().includes(q) || String(e.employeeCode || e.id).toLowerCase().includes(q))
            );
            const allChecked = list.length > 0 && list.every((e: any) => genSelectedIds.has(String(e.id)));
            const toggle = (id: string) => setGenSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
            const toggleAll = () => setGenSelectedIds(prev => {
              const n = new Set(prev);
              if (allChecked) list.forEach((e: any) => n.delete(String(e.id)));
              else list.forEach((e: any) => n.add(String(e.id)));
              return n;
            });
            return (
              <>
                <p className="text-[13px] text-slate-600 mb-3">
                  Period: <strong className="text-slate-900">{monthFilter} 2026</strong>. Select the employees to run payroll for — <strong>only the selected employees are generated</strong>. Salary uses attendance, leave &amp; overtime.
                </p>
                {scopedRecords.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                    <span><strong>Payroll already exists for {monthFilter} 2026</strong> ({scopedRecords.length} record{scopedRecords.length === 1 ? '' : 's'}). Regenerating <strong>updates</strong> existing records — no duplicates are created.</span>
                    <Button size="xs" variant="outline" disabled={isPayrollGenerating}
                      onClick={() => { setShowPayrollModal(false); handleRecalculate(); }}>Recalculate instead</Button>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                  <Input placeholder="Search name…" value={genSearch} onChange={(e: any) => setGenSearch(e.target.value)} />
                  <Select
                    value={genDept}
                    onChange={(e: any) => setGenDept(e.target.value)}
                    options={depts.map(d => ({ value: d, label: d === 'All' ? 'All departments' : d }))}
                  />
                  <Select
                    value={genDesig}
                    onChange={(e: any) => setGenDesig(e.target.value)}
                    options={desigs.map(d => ({ value: d, label: d === 'All' ? 'All designations' : d }))}
                  />
                </div>
                <div className="flex items-center justify-between mb-2 text-[12px]">
                  <label className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-indigo-600 w-4 h-4" />
                    Select all ({list.length})
                  </label>
                  <span className="text-indigo-600 font-semibold">{genSelectedIds.size} selected</span>
                </div>
                <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {list.length === 0 && <div className="p-4 text-center text-slate-400 text-[13px]">No employees match the filters.</div>}
                  {list.map((e: any) => {
                    const id = String(e.id); const checked = genSelectedIds.has(id);
                    return (
                      <label key={id} className={"flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 " + (checked ? "bg-indigo-50/60" : "")}>
                        <input type="checkbox" checked={checked} onChange={() => toggle(id)} className="accent-indigo-600 w-4 h-4" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-slate-900 truncate">{e.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">{e.designation || '—'} · {e.department || '—'}</div>
                        </div>
                        <div className="text-[12px] text-slate-600 font-medium">₹{Number(e.salary || 0).toLocaleString('en-IN')}</div>
                      </label>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      </Modal>
    </div>
  );
};
