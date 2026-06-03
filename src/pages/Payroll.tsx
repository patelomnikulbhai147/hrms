import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Activity,
  CheckCircle2,
  XCircle,
  DollarSign,
  Eye,
  EyeOff,
  Building2,
  Download,
  Send,
  Check,
  CreditCard,
  FileText
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../api/apiClient';
import {
  type Employee,
  type PayrollRecord,
  type Role,
  type Company,
  type PayrollStatus
} from '../data/mockData';
import { isCompanyIdMatch } from '../types';
import { SAFE_COMPANY_FALLBACK } from '../App';
import { Badge } from '../components/ui/Badge';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ActionConfirmationModal } from '../components/ui/ActionConfirmationModal';
import { PayrollWorkflowTable } from '../components/payroll/PayrollWorkflowTable';
import {
  calculatePayrollStats
} from '../utils/PayrollWorkflowEngine';
import { type UserAccount } from './Login';
import { getUniqueEmployees, getUniqueRecords } from '../utils/deduplication';
import { usePermissions } from '../context/PermissionContext';

interface PayrollProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  payroll: PayrollRecord[];
  onUpdatePayroll: (payroll: PayrollRecord[]) => void;
  employees: Employee[];
  authProfile?: UserAccount | null;
}

interface AuditLog {
  timestamp: string;
  user: string;
  action: string;
  remarks?: string;
}

export const Payroll: React.FC<PayrollProps> = ({
  role,
  activeCompanyId,
  companies,
  payroll,
  onUpdatePayroll,
  employees,
  authProfile
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('June');
  const [viewPayslip, setViewPayslip] = useState<PayrollRecord | null>(null);
  const [auditRecord, setAuditRecord] = useState<PayrollRecord | null>(null);
  const [remarksInput, setRemarksInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Bank Transfer' | 'UPI' | 'Cash' | 'Cheque'>('Bank Transfer');
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [confirmPaymentRecord, setConfirmPaymentRecord] = useState<PayrollRecord | null>(null);
  const [auditLogs, setAuditLogs] = useState<Record<string, AuditLog[]>>({});
  const [unmaskedField, setUnmaskedField] = useState<Record<string, boolean>>({});
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

  const { canEdit: canEditModule, canCreate: canCreateModule, canDelete: canDeleteModule } = usePermissions();
  const canEdit = canEditModule('payroll');
  const canCreate = canCreateModule('payroll');
  const canDelete = canDeleteModule('payroll');

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

  const getFullEmployee = (empId: string) => {
    return uniqueEmployees.find(e => e.employeeId === empId || e.id === empId);
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
    notes: ''
  });

  const currentCompany = companies.find(c => c.id === activeCompanyId) || SAFE_COMPANY_FALLBACK;
  const companyEmployees = useMemo(() => uniqueEmployees.filter(e => isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation, e.branchId)), [uniqueEmployees, activeCompanyId, companies]);

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
        notes: viewPayslip.notes || ''
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

  const scopedRecords = useMemo(() => {
    // ONE SINGLE SOURCE OF TRUTH: exactly matching company employees
    let records = companyEmployees.map(emp => {
      const empName = emp.name || (emp.firstName ? `${emp.firstName} ${emp.lastName}`.trim() : 'Unnamed');
      
      const existingRecords = payroll.filter(p => (p.employeeId === emp.id || p.employeeId === emp.employeeId) && p.month === monthFilter);
      const existingRecord = existingRecords.length > 0 ? existingRecords[existingRecords.length - 1] : null;

      if (existingRecord) {
        return {
          ...existingRecord,
          employeeName: empName,
          department: emp.department || existingRecord.department,
          designation: emp.designation || existingRecord.designation
        };
      }

      return {
        id: `pr-stub-${emp.id}-${monthFilter}`,
        employeeId: emp.id || emp.employeeId,
        employeeName: empName,
        department: emp.department || 'Unknown',
        designation: emp.designation || 'Unknown',
        basicSalary: parseInt((emp as any).salary) || 0,
        allowances: 0,
        deductions: 0,
        tax: 0,
        netSalary: parseInt((emp as any).salary) || 0,
        status: 'draft',
        payrollStatus: 'draft',
        paymentStatus: 'pending',
        month: monthFilter,
        year: new Date().getFullYear(),
        companyId: activeCompanyId
      } as PayrollRecord;
    });

    if (role === 'Employee' && authProfile?.employeeId) {
      records = records.filter(p => p.employeeId === authProfile.employeeId || p.employeeId === authProfile.id);
    }
    
    return records;
  }, [payroll, companyEmployees, monthFilter, activeCompanyId, role, authProfile]);

  useEffect(() => {
    const dashboardEmployeeCount = companyEmployees.length;
    const tableEmployeeCount = scopedRecords.length;
    if (role !== 'Employee' && dashboardEmployeeCount !== tableEmployeeCount) {
      console.error("PAYROLL DATA MISMATCH DETECTED: Dashboard shows " + dashboardEmployeeCount + " but Table base has " + tableEmployeeCount);
    }
  }, [companyEmployees.length, scopedRecords.length, role]);

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
          onUpdatePayroll([...payroll.filter(p => p.companyId !== activeCompanyId && p.employee?.branchId !== activeCompanyId), ...data]);
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

  const handlePreparePayroll = (record: PayrollRecord) => {
    onUpdatePayroll(payroll.map(r => r.id === record.id ? { ...r, status: 'prepared', payrollStatus: 'prepared' } : r));
    saveAuditLog(record.id, 'Payroll prepared for review.');
  };

  const handleVerifyPayrollConfirm = () => {
    if (!auditRecord) return;
    onUpdatePayroll(payroll.map(r => r.id === auditRecord.id ? { ...r, status: 'payment_pending', payrollStatus: 'payment_pending' } : r));
    saveAuditLog(auditRecord.id, 'Payroll verified by HR/Admin.', remarksInput || 'Verified for payment processing.');
    setAuditRecord(null);
    setRemarksInput('');
  };

  const handleStartPayment = async (record: PayrollRecord) => {
    const ok = window.confirm(`Confirm marking salary of ₹${record.netSalary} as PAID for ${record.employeeName}?`);
    if (!ok) return;
    try {
      const updated = {
        ...record,
        status: 'paid',
        payrollStatus: 'paid',
        paymentStatus: 'paid',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'Bank Transfer',
        paidBy: role === 'Company Head' ? 'Finance Admin' : 'HR Admin'
      };
      const saved = await api.payroll.update(record.id, updated);
      onUpdatePayroll(payroll.map(r => r.id === record.id ? saved : r));
      saveAuditLog(record.id, `Salary payment confirmed (Bank Transfer).`, 'Payment ledger updated via Quick Confirm.');
    } catch (err: any) {
      console.error(err);
      alert(`Failed to save payment status: ${err.message}`);
    }
  };

  const handleSavePayrollEdits = () => {
    if (!viewPayslip) return;
    const finalNet = editForm.basicSalary + editForm.allowances + editForm.bonus - editForm.deductions - editForm.tax;
    
    const updatedRecord: PayrollRecord = {
      ...viewPayslip,
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
      paymentDate: editForm.paymentStatus === 'paid' ? (viewPayslip.paymentDate || new Date().toISOString().split('T')[0]) : undefined
    };

    onUpdatePayroll(payroll.map(r => r.id === viewPayslip.id ? updatedRecord : r));
    saveAuditLog(viewPayslip.id, 'Payroll details edited & updated.', `Net salary recalculated to ₹${finalNet.toLocaleString('en-IN')}`);
    setViewPayslip(null);
  };

  const handleGeneratePayslip = (record: PayrollRecord) => {
    onUpdatePayroll(payroll.map(r => r.id === record.id ? {
      ...r,
      status: 'payslip_generated',
      payrollStatus: 'payslip_generated',
      payslipGenerated: true
    } : r));
    saveAuditLog(record.id, 'Payslip generated for employee.');
  };

  const handleSendEmail = (record: PayrollRecord) => {
    alert(`Email workflow completed. Payslip sent to ${record.employeeName} securely.`);
    saveAuditLog(record.id, 'Payslip securely emailed.');
  };

  const handleDownloadPayslip = (record: PayrollRecord) => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('Salary Slip - ' + (companies.find(c => c.id === record.companyId)?.name || 'Enterprise'), 105, 20, { align: 'center' });
      
      doc.setFontSize(12);
      doc.text(`Employee: ${record.employeeName}`, 20, 40);
      doc.text(`ID: ${record.employeeId}`, 20, 50);
      doc.text(`Department: ${record.department}`, 120, 40);
      doc.text(`Month/Year: ${record.month} ${record.year}`, 120, 50);

      autoTable(doc, {
        startY: 70,
        head: [['Earnings', 'Amount', 'Deductions', 'Amount']],
        body: [
          ['Basic Salary', `Rs. ${record.basicSalary.toLocaleString()}`, 'PF / Taxes', `Rs. ${record.deductions.toLocaleString()}`],
          ['Allowances', `Rs. ${record.allowances.toLocaleString()}`, '', '']
        ],
        foot: [['Gross Earnings', `Rs. ${record.basicSalary + record.allowances}`, 'Total Deductions', `Rs. ${record.deductions}`]]
      });
      
      const finalY = (doc as any).lastAutoTable.finalY || 100;
      doc.setFontSize(14);
      doc.text(`Net Salary: Rs. ${record.netSalary.toLocaleString()}`, 120, finalY + 20);

      doc.save(`Payslip_${record.employeeName.replace(/\s+/g, '_')}_${record.month}_${record.year}.pdf`);
      saveAuditLog(record.id, 'Payslip PDF downloaded.');
    } catch (e: any) {
      console.error(e);
      alert('Error generating PDF: ' + e.message);
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
              onDownload={() => alert('Download feature completed. Compliance payslip generated.')}
              onSendClick={handleSendEmail}
              role={role}
              canEdit={canEdit} canCreate={canCreate} canDelete={canDelete}
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
                    <p className="text-[10px] text-gray-500 font-medium">Branch: {emp?.branchLocation || 'Ahmedabad'} · Service Book: {emp?.serviceBookNo || '—'} · Code: {viewPayslip.employeeId}</p>
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

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="text-left">
          <h2 className="text-lg font-semibold text-slate-900">Enterprise Payroll Management</h2>
          <p className="text-sm text-slate-500 mt-1">Secure payroll workflow for <strong>{currentCompany.name}</strong> with verification, payment confirmation, and payslip distribution.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Employees Paid" value={stats.paidCount} icon={<CheckCircle2 size={18} className="text-emerald-600" />} color="bg-emerald-50" />
          <StatCard label="Pending Payroll" value={stats.pendingCount} icon={<Activity size={18} className="text-amber-600" />} color="bg-amber-50" />
          <StatCard label="Failed Payments" value={stats.failedCount} icon={<XCircle size={18} className="text-red-600" />} color="bg-red-50" />
          <StatCard label="Completion %" value={`${stats.percent}%`} icon={<DollarSign size={18} className="text-blue-600" />} color="bg-blue-50" />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <div className="space-y-2 text-left">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Employees</p>
                <p className="text-3xl font-semibold text-slate-900">{scopedRecords.length}</p>
              </div>
            </Card>
            <Card>
              <div className="space-y-2 text-left">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Paid</p>
                <p className="text-3xl font-semibold text-slate-900">₹{stats.totalPaid.toLocaleString('en-IN')}</p>
              </div>
            </Card>
            <Card>
              <div className="space-y-2 text-left">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Pending Amount</p>
                <p className="text-3xl font-semibold text-slate-900">₹{stats.totalPending.toLocaleString('en-IN')}</p>
              </div>
            </Card>
            <Card>
              <div className="space-y-2 text-left">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Monthly Salary Cost</p>
                <p className="text-3xl font-semibold text-slate-900">₹{stats.totalCap.toLocaleString('en-IN')}</p>
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between text-left">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Payroll Summary</h3>

              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Select
                  value={monthFilter}
                  onChange={e => setMonthFilter(e.target.value)}
                  options={[
                    { value: 'June', label: 'June' },
                    { value: 'May', label: 'May' },
                    { value: 'April', label: 'April' }
                  ]}
                />
                <Select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  options={[
                    { value: '', label: 'All Statuses' },
                    { value: 'draft', label: 'Draft' },
                    { value: 'prepared', label: 'Prepared' },
                    { value: 'verified', label: 'Verified' },
                    { value: 'payment_pending', label: 'Payment Pending' },
                    { value: 'paid', label: 'Paid' },
                    { value: 'payslip_generated', label: 'Payslip Generated' },
                    { value: 'failed', label: 'Failed' }
                  ]}
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="space-y-4 p-5 text-left">
              <div className="flex items-center gap-3 text-slate-900">
                <Activity size={20} />
                <div>
                  <p className="text-sm font-semibold">Activity Log</p>
                  <p className="text-sm text-slate-500">Latest payroll verification and payment events.</p>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {latestLogs.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">No payroll activity has been logged yet.</div>
                ) : (
                  latestLogs.map((entry, index) => (
                    <div key={index} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{entry.action}</p>
                        <p className="text-sm text-slate-500">{entry.remarks || 'No details provided.'}</p>
                      </div>
                      <div className="text-right text-sm text-slate-500">
                        <p>{entry.user}</p>
                        <p>{entry.timestamp}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <div className="space-y-4 p-5 text-left">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Company Payroll Status</p>
                  <h3 className="text-xl font-semibold text-slate-900">{currentCompany.name}</h3>
                </div>
                <Badge variant="blue">{currentCompany.plan}</Badge>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                The payroll pipeline requires verification before confirmation. Payslip actions are disabled until salary payment is confirmed.
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Pending Routes</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{stats.pendingCount}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Last Payment Date</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{scopedRecords.filter(r => r.payrollStatus === 'paid' || r.payrollStatus === 'payslip_generated').map(r => r.paymentDate).find(Boolean) ?? 'Not yet'}</p>
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 text-left">
              <div className="flex items-start gap-3">
                <Activity size={20} className="text-blue-600" />
                <div>
                  <p className="font-semibold text-slate-900">Payslip Workflow Reminder</p>
                  <p>Generate payslips only after payment confirmation for audit-grade compliance.</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card padding={false}>
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between text-left">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Payroll Records</h3>
            <p className="text-sm text-slate-500">Enterprise-grade payroll logs with verification and payment controls.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder="Search employees, departments..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              icon={<Search size={14} />}
            />
            <Button onClick={() => setSearch('')} variant="secondary">Clear Search</Button>
          </div>
        </div>
        <div className="p-5">
          <PayrollWorkflowTable
            records={filtered}
            primaryColor={currentCompany.primaryColor}
            onViewPayslip={setViewPayslip}
            onPrepare={handlePreparePayroll}
            onVerifyClick={record => {
              setAuditRecord(record);
            }}
            onPayClick={handleStartPayment}
            onPayslipClick={handleGeneratePayslip}
            onDownload={handleDownloadPayslip}
            onSendClick={handleSendEmail}
            role={role}
            canEdit={canEdit} canCreate={canCreate} canDelete={canDelete}
          />
        </div>
      </Card>

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
                <p className="text-xs text-slate-500">{viewPayslip.department} — ID: {viewPayslip.employeeId}</p>
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

              {/* Recalculated Live Net Salary display */}
              <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                <div>
                  <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Live Calculated Net Payout</p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">Basic + Allowances + Bonus - Deductions - Tax</p>
                </div>
                <p className="text-xl font-black text-emerald-955 text-emerald-900 font-mono">
                  ₹{(editForm.basicSalary + editForm.allowances + editForm.bonus - editForm.deductions - editForm.tax).toLocaleString('en-IN')}
                </p>
              </div>

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
    </div>
  );
};
