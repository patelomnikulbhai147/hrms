import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign, Download, Search, CheckCircle2, XCircle, Eye, FileText,
  ShieldCheck, Activity, Send
} from 'lucide-react';
import {
  type Employee,
  type PayrollRecord,
  type Role,
  type Company,
  type PayrollStatus
} from '../data/mockData';
import { Badge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

interface PayrollProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  payroll: PayrollRecord[];
  onUpdatePayroll: (payroll: PayrollRecord[]) => void;
  employees: Employee[];
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
  employees
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('June');

  // Modal view states
  const [viewPayslip, setViewPayslip] = useState<PayrollRecord | null>(null);
  const [auditRecord, setAuditRecord] = useState<PayrollRecord | null>(null);
  const [remarksInput, setRemarksInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Bank Transfer' | 'UPI' | 'Corporate Payout'>('Bank Transfer');
  const [confirmPaymentRecord, setConfirmPaymentRecord] = useState<PayrollRecord | null>(null);

  // In-memory activity log registry synced to localStorage
  const [auditLogs, setAuditLogs] = useState<Record<string, AuditLog[]>>({});

  // Dynamic company settings
  const currentCompany = companies.find(c => c.id === activeCompanyId) || companies[0];
  const companyEmployees = useMemo(() => {
    return employees.filter(e => e.companyId === activeCompanyId);
  }, [employees, activeCompanyId]);

  // Map database status to friendly enterprise statuses & colors
  const dbToUiStatus = (status: PayrollStatus): string => {
    switch (status) {
      case 'Draft': return 'Draft';
      case 'Pending': return 'Prepared';
      case 'Processing': return 'Verified';
      case 'Overdue': return 'Payment Pending';
      case 'Paid': return 'Paid';
      case 'Generated': return 'Payslip Generated';
      case 'Failed': return 'Failed';
      default: return status;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Draft': return 'gray';
      case 'Prepared': return 'blue';
      case 'Verified': return 'indigo';
      case 'Payment Pending': return 'yellow';
      case 'Paid': return 'green';
      case 'Payslip Generated': return 'purple';
      case 'Failed': return 'red';
      default: return 'gray';
    }
  };

  // Synchronize dynamic activity logs
  useEffect(() => {
    const stored = localStorage.getItem(`hrms_payroll_logs_${activeCompanyId}`);
    if (stored) {
      try {
        setAuditLogs(JSON.parse(stored));
      } catch (err) {
        setAuditLogs({});
      }
    }
  }, [activeCompanyId]);

  const saveAuditLog = (recordId: string, action: string, remarks?: string) => {
    const newLog: AuditLog = {
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date().toLocaleDateString('en-IN'),
      user: role === 'Company Head' ? 'Company Head (Finance Admin)' : 'HR Operations Manager',
      action,
      remarks
    };

    const updated = {
      ...auditLogs,
      [recordId]: [...(auditLogs[recordId] || []), newLog]
    };
    setAuditLogs(updated);
    localStorage.setItem(`hrms_payroll_logs_${activeCompanyId}`, JSON.stringify(updated));
  };

  // Dynamic salary roster preparation & mapping
  useEffect(() => {
    let updatedPayroll = [...payroll];
    let changed = false;

    companyEmployees.forEach((emp, index) => {
      const month = monthFilter || 'June';
      const exists = payroll.some(p => p.employeeId === emp.id && p.month === month && p.year === 2026);
      if (!exists) {
        const basicPercent = currentCompany.basicPercent || 50;
        const ctcMonthly = Math.round(emp.salary / 12);
        const basicSalary = Math.round(ctcMonthly * (basicPercent / 100));
        
        const hra = Math.round(basicSalary * 0.4);
        const special = Math.max(0, ctcMonthly - basicSalary - hra);
        const allowances = hra + special;

        const pfRate = currentCompany.pfRate || 12;
        const esicRate = currentCompany.esicRate || 0.75;
        const profTax = currentCompany.profTaxRate || 200;

        const pfDeduction = Math.round(basicSalary * (pfRate / 100));
        const esicDeduction = Math.round(basicSalary * (esicRate / 100));
        const deductions = pfDeduction + esicDeduction + profTax;
        const netSalary = ctcMonthly - deductions;

        // Populate a realistic corporate state distribution initially for verification demo!
        let initialStatus: PayrollStatus = 'Draft';
        if (index === 0) initialStatus = 'Draft';
        else if (index === 1) initialStatus = 'Pending'; // Maps to Prepared
        else if (index === 2) initialStatus = 'Processing'; // Maps to Verified
        else if (index === 3) initialStatus = 'Paid'; // Maps to Paid

        const newRecord: PayrollRecord = {
          id: `p${Date.now()}-${emp.id}`,
          companyId: activeCompanyId,
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department,
          month,
          year: 2026,
          basicSalary,
          allowances,
          deductions,
          netSalary,
          status: initialStatus
        };
        updatedPayroll.push(newRecord);
        changed = true;
      }
    });

    if (changed) {
      onUpdatePayroll(updatedPayroll);
    }
  }, [activeCompanyId, companyEmployees, monthFilter, payroll, currentCompany]);

  const scopedRecords = payroll.filter(p => p.companyId === activeCompanyId);
  const canProcess = role === 'Company Head' || role === 'HR';

  // Filters
  const filtered = scopedRecords.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.employeeName.toLowerCase().includes(q) || r.department.toLowerCase().includes(q);
    const matchStatus = !statusFilter || dbToUiStatus(r.status) === statusFilter;
    const matchMonth = !monthFilter || r.month === monthFilter;
    return matchSearch && matchStatus && matchMonth;
  });

  // Dynamic Dashboard card calculations
  const stats = useMemo(() => {
    const paidRecords = scopedRecords.filter(r => r.status === 'Paid' || r.status === 'Generated');
    const pendingRecords = scopedRecords.filter(r => r.status !== 'Paid' && r.status !== 'Generated' && r.status !== 'Failed');
    const failedRecords = scopedRecords.filter(r => r.status === 'Failed');

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
  }, [scopedRecords]);

  // Workflow Action: Prepare salary
  const handlePreparePayroll = (id: string) => {
    onUpdatePayroll(payroll.map(r => r.id === id ? { ...r, status: 'Pending' } : r));
    saveAuditLog(id, 'Prepared base salary structures for auditing');
    alert('Payroll record prepared for management auditing.');
  };

  // Workflow Action: Verify salary details (Confirmed inside Auditing Modal)
  const handleVerifyPayrollConfirm = () => {
    if (!auditRecord) return;
    onUpdatePayroll(payroll.map(r => r.id === auditRecord.id ? { ...r, status: 'Processing' } : r));
    saveAuditLog(auditRecord.id, 'Audited and verified payroll calculations', remarksInput);
    setAuditRecord(null);
    setRemarksInput('');
    alert('Payroll successfully verified and queued for payment dispatch.');
  };

  // Workflow Action: Confirm salary payment
  const handleConfirmPayment = () => {
    if (!confirmPaymentRecord) return;
    onUpdatePayroll(payroll.map(r => r.id === confirmPaymentRecord.id ? {
      ...r,
      status: 'Paid',
      processedOn: new Date().toISOString().split('T')[0],
      paymentDate: new Date().toISOString().split('T')[0],
    } : r));
    saveAuditLog(confirmPaymentRecord.id, `Payment confirmed via ${paymentMethod}`);
    setConfirmPaymentRecord(null);
    alert('Salary payout marked as paid in corporate accounts ledger.');
  };

  // Workflow Action: Generate Payslip
  const handleGeneratePayslip = (id: string) => {
    onUpdatePayroll(payroll.map(r => r.id === id ? { ...r, status: 'Generated' } : r));
    saveAuditLog(id, 'Generated digital payslip receipt');
    alert('Employee payslip generated and archived in secure compliance vault.');
  };

  // Workflow Action: Send Email
  const handleSendEmail = (id: string) => {
    saveAuditLog(id, 'Emailed PDF payslip to employee corporate address');
    alert('Payslip successfully emailed to employee.');
  };

  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);

  // Dynamic targeting modal action
  const handleOpenAuditModal = (record: PayrollRecord) => {
    setAuditRecord(record);
    setIsVerificationModalOpen(true);
  };

  return (
    <div className="space-y-4 font-sans">
      
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Enterprise Payroll Suite</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage secure double-verification salary payout pipelines for <strong>{currentCompany.name}</strong></p>
        </div>
      </div>

      {/* Stats Cards Dashboard Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="Employees Paid"
          value={stats.paidCount}
          icon={<CheckCircle2 size={16} className="text-emerald-600" />}
          color="bg-emerald-50/50 border border-emerald-100/50"
          sub={`₹${(stats.totalPaid / 100000).toFixed(2)}L dispatched`}
        />
        <StatCard
          label="Pending Payments"
          value={stats.pendingCount}
          icon={<Activity size={16} className="text-indigo-600" />}
          color="bg-indigo-50/50 border border-indigo-100/50"
          sub={`₹${(stats.totalPending / 100000).toFixed(2)}L queued`}
        />
        <StatCard
          label="Failed Transactions"
          value={stats.failedCount}
          icon={<XCircle size={16} className="text-red-500" />}
          color="bg-red-50/50 border border-red-100/50"
          sub="Requires clearance"
        />
        <StatCard
          label="Total Payroll Cap"
          value={`₹${(stats.totalCap / 100000).toFixed(2)}L`}
          icon={<DollarSign size={16} className="text-blue-600" />}
          color="bg-blue-50/50 border border-blue-100/50"
          sub={`${monthFilter || 'June'} 2026 cycle`}
        />
      </div>

      {/* Horizontal Progress Summary Bar */}
      <Card className="border border-slate-150 p-4 shadow-sm bg-white rounded-3xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Active Employees</span>
            <p className="text-sm font-extrabold text-slate-800">{companyEmployees.length} registered</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Dispatched Salary</span>
            <p className="text-sm font-extrabold text-emerald-600">₹{stats.totalPaid.toLocaleString()}</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Awaiting Audit Balance</span>
            <p className="text-sm font-extrabold text-amber-600">₹{stats.totalPending.toLocaleString()}</p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-slate-500 uppercase">Verification Progress</span>
              <span className="text-indigo-600">{stats.percent}% Processed</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${stats.percent}%` }}
              ></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Roster Filters */}
      <Card className="border border-slate-150 p-3.5 shadow-sm bg-white rounded-2xl">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-48">
            <Input placeholder="Search employee or department..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={14} />} />
          </div>
          <div className="w-40">
            <Select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              options={['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => ({ value: m, label: m || 'All Months' }))}
            />
          </div>
          <div className="w-40">
            <Select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'Draft', label: 'Draft' },
                { value: 'Prepared', label: 'Prepared' },
                { value: 'Verified', label: 'Verified' },
                { value: 'Payment Pending', label: 'Payment Pending' },
                { value: 'Paid', label: 'Paid' },
                { value: 'Payslip Generated', label: 'Payslip Generated' },
                { value: 'Failed', label: 'Failed' }
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Interactive Compact Table Grid */}
      <Card padding={false} className="border border-slate-150 shadow-sm bg-white rounded-3xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Monthly Payout Ledger — {monthFilter || 'All Months'} 2026</span>
          <span className="text-[10px] bg-slate-100 font-bold px-2 py-0.5 rounded text-slate-500">{filtered.length} employees listed</span>
        </div>
        <div className="overflow-x-auto max-h-[480px]">
          <Table>
            <Thead>
              <tr>
                <Th>Employee</Th>
                <Th>Department</Th>
                <Th>Basic Portion</Th>
                <Th>Allowances</Th>
                <Th>Deductions</Th>
                <Th>Net Salary</Th>
                <Th>Workflow Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-xs text-gray-400">No payroll records found for company roster</td></tr>
              ) : (
                filtered.map(r => {
                  const uiStatus = dbToUiStatus(r.status);
                  const isLocked = r.status !== 'Generated';

                  return (
                    <Tr key={r.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full text-white flex items-center justify-center text-[10px] font-extrabold flex-shrink-0 shadow-xs"
                            style={{ backgroundColor: currentCompany.primaryColor || '#3b82f6' }}
                          >
                            {r.employeeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-900 leading-none">{r.employeeName}</span>
                            <p className="text-[9px] text-slate-400 mt-0.5">Billing Month: {r.month}</p>
                          </div>
                        </div>
                      </Td>
                      <Td><span className="text-xs text-slate-600 font-medium">{r.department}</span></Td>
                      <Td><span className="text-xs text-slate-700 font-mono">₹{r.basicSalary.toLocaleString()}</span></Td>
                      <Td><span className="text-xs text-emerald-600 font-mono font-bold">+₹{r.allowances.toLocaleString()}</span></Td>
                      <Td><span className="text-xs text-red-500 font-mono">-₹{r.deductions.toLocaleString()}</span></Td>
                      <Td><span className="text-xs font-extrabold text-slate-900 font-mono">₹{r.netSalary.toLocaleString()}</span></Td>
                      <Td>
                        <Badge variant={getStatusBadgeVariant(uiStatus)}>
                          {uiStatus}
                        </Badge>
                      </Td>
                      <Td>
                      <div className="flex items-center justify-end gap-1.5">
                        
                        {/* 1. View Audit Logs & Details Chip */}
                        <button
                          onClick={() => handleOpenAuditModal(r)}
                          className="text-[10px] px-2.5 py-1 font-bold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl transition-all shadow-xs flex items-center gap-0.5"
                          title="View Ledger & Audit Logs"
                        >
                          <Eye size={10} />
                          View
                        </button>

                        {/* 2. HR Prepares salary */}
                        {canProcess && r.status === 'Draft' && (
                          <button
                            onClick={() => handlePreparePayroll(r.id)}
                            className="text-[10px] px-2.5 py-1 font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl transition-all shadow-xs"
                          >
                            Prepare
                          </button>
                        )}

                        {/* 3. Verify Payroll */}
                        {canProcess && r.status === 'Pending' && (
                          <button
                            onClick={() => handleOpenAuditModal(r)}
                            className="text-[10px] px-2.5 py-1 font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl transition-all shadow-xs flex items-center gap-0.5"
                          >
                            <ShieldCheck size={10} />
                            Verify
                          </button>
                        )}

                        {/* 4. Confirm Payment */}
                        {canProcess && r.status === 'Processing' && (
                          <button
                            onClick={() => setConfirmPaymentRecord(r)}
                            className="text-[10px] px-2.5 py-1 font-bold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-xl transition-all shadow-xs flex items-center gap-0.5"
                          >
                            <DollarSign size={10} />
                            Pay
                          </button>
                        )}

                        {/* 5. Generate Payslip */}
                        {canProcess && r.status === 'Paid' && (
                          <button
                            onClick={() => handleGeneratePayslip(r.id)}
                            className="text-[10px] px-2.5 py-1 font-bold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 rounded-xl transition-all shadow-xs flex items-center gap-0.5"
                          >
                            <FileText size={10} />
                            Payslip
                          </button>
                        )}

                        {/* Status Locked Actions: Payslip Generation */}
                        <div className="flex items-center gap-1 pl-1.5 border-l border-slate-100">
                          {/* Locked Payslip Preview */}
                          <button
                            onClick={() => setViewPayslip(r)}
                            disabled={isLocked}
                            className="p-1 rounded-lg transition-all disabled:opacity-30 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 disabled:hover:bg-transparent"
                            title={!isLocked ? 'View Payslip' : 'Payslip locked until Payment and Generation'}
                          >
                            <FileText size={13} />
                          </button>
                          
                          {/* Locked Download PDF */}
                          <button
                            onClick={() => alert('Downloading corporate payslip receipt...')}
                            disabled={isLocked}
                            className="p-1 rounded-lg transition-all disabled:opacity-30 text-slate-400 hover:text-emerald-600 hover:bg-slate-50"
                            title={!isLocked ? 'Download PDF' : 'Download locked'}
                          >
                            <Download size={13} />
                          </button>

                          {/* Locked Send Email */}
                          <button
                            onClick={() => handleSendEmail(r.id)}
                            disabled={isLocked}
                            className="p-1 rounded-lg transition-all disabled:opacity-30 text-slate-400 hover:text-indigo-600 hover:bg-slate-50"
                            title={!isLocked ? 'Send Email' : 'Email locked'}
                          >
                            <Send size={13} />
                          </button>
                        </div>

                      </div>
                    </Td>
                    </Tr>
                  );
                })
              )}
            </Tbody>
          </Table>
        </div>
      </Card>

      {/* ─── MODAL 1: HIGH-FIDELITY PAYROLL VERIFICATION & AUDIT LOGS ───────── */}
      <Modal
        open={isVerificationModalOpen}
        onClose={() => {
          setIsVerificationModalOpen(false);
          setAuditRecord(null);
          setRemarksInput('');
        }}
        title="Double-Verification Payroll Audit Dashboard"
        size="md"
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-[10px] text-slate-400 italic font-sans">Audit-ready enterprise records</span>
            <div className="flex gap-2">
              <Button variant="outline" className="font-sans font-bold text-xs" onClick={() => {
                setIsVerificationModalOpen(false);
                setAuditRecord(null);
              }}>
                Close
              </Button>
              {auditRecord && auditRecord.status === 'Pending' && (
                <Button
                  onClick={() => {
                    handleVerifyPayrollConfirm();
                    setIsVerificationModalOpen(false);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-sans font-bold text-xs flex items-center gap-1.5 shadow"
                >
                  <ShieldCheck size={14} />
                  Confirm & Verify Payroll
                </Button>
              )}
            </div>
          </div>
        }
      >
        {auditRecord && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 font-sans">
            
            {/* Left Column: Breakdown details & Banking */}
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                    {auditRecord.employeeName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{auditRecord.employeeName}</h4>
                    <p className="text-[9px] text-slate-400">{auditRecord.department} · {auditRecord.month} 2026</p>
                  </div>
                </div>
              </div>

              {/* Salary Breakdown Summary */}
              <div className="p-3.5 border border-slate-200 rounded-2xl text-[10.5px] space-y-2 bg-white shadow-xs">
                <h5 className="font-extrabold text-slate-800 border-b pb-1 text-xs uppercase tracking-wider flex items-center gap-1">
                  <DollarSign size={13} className="text-emerald-600" />
                  Salary Breakdown Summary
                </h5>
                <div className="flex justify-between">
                  <span className="text-slate-500">Basic Portion:</span>
                  <span className="font-semibold text-slate-800">₹{auditRecord.basicSalary.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">HRA & Allowances:</span>
                  <span className="font-semibold text-emerald-600">+₹{auditRecord.allowances.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Statutory Deductions (PF/ESIC/Tax):</span>
                  <span className="font-semibold text-red-600">-₹{auditRecord.deductions.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t pt-1.5 font-extrabold text-slate-900 text-xs">
                  <span>Net In-hand Take-home:</span>
                  <span className="text-indigo-600">₹{auditRecord.netSalary.toLocaleString()}</span>
                </div>
              </div>

              {/* Secure Banking details */}
              <div className="p-3.5 border border-slate-200 rounded-2xl text-[10px] space-y-2 bg-white shadow-xs">
                <h5 className="font-extrabold text-slate-800 border-b pb-1 text-xs uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck size={13} className="text-indigo-600" />
                  Employee Disbursement Bank A/C
                </h5>
                <div className="flex justify-between">
                  <span className="text-slate-500">Disbursement Method:</span>
                  <span className="font-semibold text-slate-800">Bank Direct Payout</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Clearing Bank:</span>
                  <span className="font-semibold text-slate-800">HDFC Bank Ltd.</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Masked Account:</span>
                  <span className="font-bold text-slate-700 font-mono">******4819</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">IFSC Code:</span>
                  <span className="font-bold text-slate-700 font-mono">HDFC0001092</span>
                </div>
              </div>
            </div>

            {/* Right Column: Activity audit logs & Remarks */}
            <div className="space-y-4 flex flex-col justify-between h-full">
              
              {/* Verification logs registry */}
              <div className="p-3.5 border border-slate-200 rounded-2xl space-y-2.5 bg-slate-50/50 flex-1 shadow-inner">
                <h5 className="font-extrabold text-slate-800 border-b pb-1 text-xs uppercase tracking-wider flex items-center gap-1">
                  <Activity size={13} className="text-indigo-500" />
                  Verification logs registry
                </h5>

                <div className="space-y-3.5 max-h-[220px] overflow-auto pr-1">
                  <div className="flex gap-2.5 text-[10px] items-start border-l-2 border-indigo-600 pl-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1"></div>
                    <div className="space-y-0.5">
                      <p className="font-bold text-slate-800">HR Pipeline Initialized</p>
                      <p className="text-slate-400">System generated June payroll draft cycle</p>
                    </div>
                  </div>

                  {auditRecord.status !== 'Draft' && (
                    <div className="flex gap-2.5 text-[10px] items-start border-l-2 border-indigo-600 pl-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1"></div>
                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-800">Prepared by HR Generalist</p>
                        <p className="text-slate-400">Completed structural salary checking logs</p>
                      </div>
                    </div>
                  )}

                  {auditRecord.status !== 'Draft' && auditRecord.status !== 'Pending' && (
                    <div className="flex gap-2.5 text-[10px] items-start border-l-2 border-indigo-600 pl-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1"></div>
                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-800">Verified by HR Manager</p>
                        <p className="text-slate-400">Cleared banking metadata checks</p>
                      </div>
                    </div>
                  )}

                  {(auditLogs[auditRecord.id] || []).map((log, index) => (
                    <div key={index} className="flex gap-2.5 text-[10px] items-start border-l-2 border-indigo-600 pl-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1"></div>
                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-800">{log.action}</p>
                        <p className="text-slate-400">{log.timestamp} · by {log.user}</p>
                        {log.remarks && <p className="text-indigo-600 italic bg-indigo-50 px-1 py-0.5 rounded mt-0.5">Note: "{log.remarks}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remarks Area */}
              {auditRecord.status === 'Pending' && (
                <div className="space-y-1 pt-2">
                  <label className="text-[10px] font-bold text-gray-500">Auditing Notes & Remarks *</label>
                  <textarea
                    className="w-full h-16 text-xs border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans resize-none shadow-xs"
                    placeholder="Enter audit remarks e.g. Tax declarations reviewed..."
                    value={remarksInput}
                    onChange={e => setRemarksInput(e.target.value)}
                  />
                </div>
              )}

            </div>

          </div>
        )}
      </Modal>

      {/* ─── MODAL 2: CONFIRM PAYMENT POPUP ──────────────────────────────────── */}
      <Modal
        open={!!confirmPaymentRecord}
        onClose={() => setConfirmPaymentRecord(null)}
        title="Finance Ledger Payment Confirmation"
        size="sm"
        footer={
          <>
            <Button variant="outline" className="font-bold text-xs" onClick={() => setConfirmPaymentRecord(null)}>Cancel</Button>
            <Button onClick={handleConfirmPayment} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow">
              Confirm Disbursement
            </Button>
          </>
        }
      >
        {confirmPaymentRecord && (
          <div className="text-center py-2 space-y-3 font-sans">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
              <DollarSign size={20} />
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-slate-750">
                Confirm salary payment disbursement completed for:
              </p>
              <p className="text-sm font-extrabold text-slate-900">{confirmPaymentRecord.employeeName}</p>
              <p className="text-xs font-extrabold text-indigo-600">Disbursing Net In-hand Take-home: ₹{confirmPaymentRecord.netSalary.toLocaleString()}</p>
            </div>

            <div className="pt-2.5 text-left space-y-2">
              <Select
                label="Clearance Payment Mode"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                options={[
                  { value: 'Bank Transfer', label: 'Direct Corporate Bank Transfer' },
                  { value: 'UPI', label: 'UPI Payout Gateway' },
                  { value: 'Corporate Payout', label: 'Corporate Card Disbursement' }
                ]}
              />
            </div>

            <p className="text-[10px] text-slate-400 italic">
              This action confirms that corporate funds have cleared from bank vaults. Digital payslip generation unlocks instantly upon payment confirmation.
            </p>
          </div>
        )}
      </Modal>

      {/* ─── MODAL 3: PAYSLIP PREVIEW DETAILS ────────────────────────────────── */}
      <Modal open={!!viewPayslip} onClose={() => setViewPayslip(null)} title="Payslip Details Receipt" size="md">
        {viewPayslip && (
          <div className="space-y-4 font-sans">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-150">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{viewPayslip.employeeName}</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">{viewPayslip.department}</p>
                </div>
                <div className="text-right">
                  <Badge variant={getStatusBadgeVariant(dbToUiStatus(viewPayslip.status))}>{dbToUiStatus(viewPayslip.status)}</Badge>
                  <p className="text-[10px] text-slate-400 mt-1">{viewPayslip.month} {viewPayslip.year}</p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <h4 className="font-extrabold text-slate-800 uppercase tracking-wide border-b pb-1 text-[10px]">Breakdown Summary</h4>
              
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Basic Salary ({currentCompany.basicPercent}%)</span>
                <span className="font-medium text-slate-800">₹{viewPayslip.basicSalary.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">House Rent / Special Allowances</span>
                <span className="font-medium text-emerald-600">₹{viewPayslip.allowances.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 text-red-600">
                <span>Deductions (Provident Fund + Taxes)</span>
                <span className="font-medium">-₹{viewPayslip.deductions.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2.5 text-sm font-extrabold text-slate-900 border-t border-slate-200">
                <span>Net Credited Take-home</span>
                <span style={{ color: currentCompany.primaryColor || '#3b82f6' }}>₹{viewPayslip.netSalary.toLocaleString()}</span>
              </div>
            </div>

            {viewPayslip.paymentDate && (
              <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-1 text-[9.5px] text-slate-450">
                <p>Payment Settled Date: {viewPayslip.paymentDate}</p>
                <p>Ledger Reference ID: {viewPayslip.id}</p>
                <p>Audited: Verified by HR & cleared by corporate finance board</p>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <Button variant="outline" icon={<Download size={13} />} className="text-xs font-bold" onClick={() => alert('PDF downloaded successfully.')}>Download Receipt</Button>
              <Button variant="outline" icon={<Send size={13} />} className="text-xs font-bold" onClick={() => handleSendEmail(viewPayslip.id)}>Email Payslip</Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};
