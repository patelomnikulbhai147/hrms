import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign, Search, CheckCircle2, XCircle, Send, Activity, Download
} from 'lucide-react';
import {
  type Employee,
  type PayrollRecord,
  type Role,
  type Company,
  type PayrollStatus
} from '../data/mockData';
import { Badge } from '../components/ui/Badge';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { PayrollWorkflowTable } from '../components/payroll/PayrollWorkflowTable';
import {
  getStatusBadgeVariant,
  dbToUiStatus,
  calculatePayrollStats
} from '../utils/PayrollWorkflowEngine';

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
  const [paymentMethod, setPaymentMethod] = useState<'Bank Transfer' | 'UPI' | 'Cash' | 'Cheque'>('Bank Transfer');
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [confirmPaymentRecord, setConfirmPaymentRecord] = useState<PayrollRecord | null>(null);

  // In-memory activity log registry synced to localStorage
  const [auditLogs, setAuditLogs] = useState<Record<string, AuditLog[]>>({});

  // Dynamic company settings
  const currentCompany = companies.find(c => c.id === activeCompanyId) || companies[0];
  const companyEmployees = useMemo(() => {
    return employees.filter(e => e.companyId === activeCompanyId);
  }, [employees, activeCompanyId]);

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

  // Dynamic salary roster preparation & mapping to strict lowercase status schema
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
        let initialStatus: PayrollStatus = 'draft';
        if (index === 0) initialStatus = 'draft';
        else if (index === 1) initialStatus = 'prepared'; 
        else if (index === 2) initialStatus = 'verified'; 
        else if (index === 3) initialStatus = 'paid'; 

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
          status: initialStatus,
          salary: netSalary,
          payrollStatus: initialStatus,
          paymentStatus: initialStatus === 'paid' ? 'paid' : 'pending',
          payslipGenerated: false
        };
        updatedPayroll.push(newRecord);
        changed = true;
      }
    });

    if (changed) {
      onUpdatePayroll(updatedPayroll);
    }
  }, [activeCompanyId, companyEmployees, monthFilter, payroll, currentCompany]);

  const scopedRecords = useMemo(() => {
    return payroll.filter(p => p.companyId === activeCompanyId);
  }, [payroll, activeCompanyId]);

  // Filters
  const filtered = useMemo(() => {
    return scopedRecords.filter(r => {
      const currentStatus = r.payrollStatus || r.status;
      const q = search.toLowerCase();
      const matchSearch = !q || r.employeeName.toLowerCase().includes(q) || r.department.toLowerCase().includes(q);
      const matchStatus = !statusFilter || currentStatus === statusFilter;
      const matchMonth = !monthFilter || r.month === monthFilter;
      return matchSearch && matchStatus && matchMonth;
    });
  }, [scopedRecords, search, statusFilter, monthFilter]);

  // Dynamic Dashboard card calculations
  const stats = useMemo(() => {
    return calculatePayrollStats(scopedRecords);
  }, [scopedRecords]);

  // Workflow Action: Prepare salary
  const handlePreparePayroll = (record: PayrollRecord) => {
    onUpdatePayroll(payroll.map(r => r.id === record.id ? { 
      ...r, 
      status: 'prepared',
      payrollStatus: 'prepared'
    } : r));
    saveAuditLog(record.id, 'Prepared base salary structures for auditing');
    alert('Payroll record prepared for management auditing.');
  };

  // Workflow Action: Verify salary details (Confirmed inside Auditing Modal)
  const handleVerifyPayrollConfirm = () => {
    if (!auditRecord) return;
    onUpdatePayroll(payroll.map(r => r.id === auditRecord.id ? { 
      ...r, 
      status: 'verified',
      payrollStatus: 'verified'
    } : r));
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
      status: 'paid',
      payrollStatus: 'paid',
      paymentStatus: 'paid',
      processedOn: new Date().toISOString().split('T')[0],
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: paymentMethod,
      paidBy: role === 'Company Head' ? 'Finance Admin (Company Head)' : 'HR Operations Specialist',
    } : r));
    saveAuditLog(confirmPaymentRecord.id, `Payment confirmed via ${paymentMethod}`, paymentRemarks);
    setConfirmPaymentRecord(null);
    setPaymentRemarks('');
    alert('Salary payout marked as paid in corporate accounts ledger.');
  };

  // Workflow Action: Generate Payslip
  const handleGeneratePayslip = (record: PayrollRecord) => {
    onUpdatePayroll(payroll.map(r => r.id === record.id ? { 
      ...r, 
      status: 'payslip_generated',
      payrollStatus: 'payslip_generated',
      payslipGenerated: true
    } : r));
    saveAuditLog(record.id, 'Generated digital payslip receipt');
    alert('Employee payslip generated and archived in secure compliance vault.');
  };

  // Workflow Action: Send Email
  const handleSendEmail = (record: PayrollRecord) => {
    saveAuditLog(record.id, 'Emailed PDF payslip to employee corporate address');
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
          <h2 className="text-base font-semibold text-slate-900">Enterprise Payroll Suite</h2>
          <p className="text-xs text-slate-550 mt-0.5">Manage secure double-verification salary payout pipelines for <strong>{currentCompany.name}</strong></p>
        </div>
      </div>

      {/* Stats Cards Dashboard Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Employees Paid"
          value={stats.paidCount}
          icon={<CheckCircle2 size={16} className="text-emerald-600" />}
          color="bg-emerald-50"
          sub={`₹${(stats.totalPaid / 100000).toFixed(2)}L dispatched`}
        />
        <StatCard
          label="Pending Payments"
          value={stats.pendingCount}
          icon={<Activity size={16} className="text-indigo-600" />}
          color="bg-indigo-50"
          sub={`₹${(stats.totalPending / 100000).toFixed(2)}L queued`}
        />
        <StatCard
          label="Failed Transactions"
          value={stats.failedCount}
          icon={<XCircle size={16} className="text-red-500" />}
          color="bg-red-50"
          sub="Requires clearance"
        />
        <StatCard
          label="Total Payroll Cap"
          value={`₹${(stats.totalCap / 100000).toFixed(2)}L`}
          icon={<DollarSign size={16} className="text-blue-600" />}
          color="bg-blue-50"
          sub={`${monthFilter || 'June'} 2026 cycle`}
        />
      </div>

      {/* Horizontal Progress Summary Bar */}
      <Card className="p-4 shadow-sm bg-white rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Active Employees</span>
            <p className="text-sm font-extrabold text-slate-800">{companyEmployees.length} registered</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Dispatched Salary</span>
            <p className="text-sm font-extrabold text-emerald-600">₹{stats.totalPaid.toLocaleString('en-IN')}</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Awaiting Audit Balance</span>
            <p className="text-sm font-extrabold text-amber-600">₹{stats.totalPending.toLocaleString('en-IN')}</p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-slate-500 uppercase">Verification Progress</span>
              <span className="text-indigo-650">{stats.percent}% Processed</span>
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
      <Card className="p-3 shadow-sm bg-white rounded-xl">
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
                { value: 'draft', label: 'Draft' },
                { value: 'prepared', label: 'Prepared' },
                { value: 'verified', label: 'Verified' },
                { value: 'paid', label: 'Paid' },
                { value: 'payslip_generated', label: 'Payslip Generated' },
                { value: 'failed', label: 'Failed' }
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Unified Table Component */}
      <Card padding={false} className="shadow-sm bg-white rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Monthly Payout Ledger — {monthFilter || 'All Months'} 2026</span>
          <span className="text-[10px] bg-slate-100 font-bold px-2 py-0.5 rounded text-slate-500">{filtered.length} employees listed</span>
        </div>
        <PayrollWorkflowTable
          records={filtered}
          role={role}
          primaryColor={currentCompany.primaryColor || '#3b82f6'}
          onViewPayslip={(r) => setViewPayslip(r)}
          onPrepare={handlePreparePayroll}
          onVerifyClick={handleOpenAuditModal}
          onPayClick={(r) => setConfirmPaymentRecord(r)}
          onPayslipClick={handleGeneratePayslip}
          onDownload={(r) => alert(`Downloading payslip for ${r.employeeName}...`)}
          onSendClick={handleSendEmail}
        />
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
              {auditRecord && (auditRecord.payrollStatus || auditRecord.status) === 'prepared' && (
                <Button
                  onClick={handleVerifyPayrollConfirm}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-sans font-bold text-xs flex items-center gap-1.5 shadow"
                >
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
                  <span className="text-slate-500">Statutory Deductions:</span>
                  <span className="font-semibold text-red-600">-₹{auditRecord.deductions.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t pt-1.5 font-extrabold text-slate-900 text-xs">
                  <span>Net Take-home:</span>
                  <span className="text-indigo-600">₹{auditRecord.netSalary.toLocaleString()}</span>
                </div>
              </div>

              {/* Secure Banking details */}
              <div className="p-3.5 border border-slate-200 rounded-2xl text-[10px] space-y-2 bg-white shadow-xs">
                <h5 className="font-extrabold text-slate-800 border-b pb-1 text-xs uppercase tracking-wider flex items-center gap-1">
                  Disbursement Bank A/C
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
              {(auditRecord.payrollStatus || auditRecord.status) === 'prepared' && (
                <div className="space-y-1 pt-2">
                  <label className="text-[10px] font-bold text-gray-500">Auditing Notes & Remarks *</label>
                  <textarea
                    className="w-full h-16 text-xs border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans resize-none shadow-xs"
                    placeholder="Enter audit remarks..."
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
        title="Confirm Salary Payment"
        size="sm"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" className="font-bold text-xs" onClick={() => setConfirmPaymentRecord(null)}>Cancel</Button>
            <Button onClick={handleConfirmPayment} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md">
              Confirm & Pay
            </Button>
          </div>
        }
      >
        {confirmPaymentRecord && (
          <div className="py-2 space-y-4 font-sans text-slate-800">
            <div className="flex items-center gap-3 border-b pb-2">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 flex-shrink-0">
                <DollarSign size={20} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Disbursement Authorization</p>
                <p className="text-xs text-slate-500 font-medium">Confirm settlement release to accounts ledger.</p>
              </div>
            </div>

            {/* Structured Employee Payout Summary */}
            <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-medium">Employee:</span>
                <span className="font-bold text-slate-900">{confirmPaymentRecord.employeeName}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-medium">Net Salary:</span>
                <span className="font-extrabold text-emerald-600 font-mono">₹{confirmPaymentRecord.netSalary.toLocaleString()}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5 text-left">
              <Select
                label="Payment Method"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                options={[
                  { value: 'Bank Transfer', label: 'Bank Transfer' },
                  { value: 'UPI', label: 'UPI' },
                  { value: 'Cash', label: 'Cash' },
                  { value: 'Cheque', label: 'Cheque' }
                ]}
              />
            </div>

            {/* Remarks Input */}
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Remarks</label>
              <textarea
                className="w-full h-16 text-xs border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans resize-none shadow-xs"
                placeholder="Disbursement memo / notes..."
                value={paymentRemarks}
                onChange={e => setPaymentRemarks(e.target.value)}
              />
            </div>
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
                  <Badge variant={getStatusBadgeVariant(viewPayslip.payrollStatus || viewPayslip.status)}>{dbToUiStatus(viewPayslip.payrollStatus || viewPayslip.status)}</Badge>
                  <p className="text-[10px] text-slate-400 mt-1">{viewPayslip.month} {viewPayslip.year}</p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <h4 className="font-extrabold text-slate-800 uppercase tracking-wide border-b pb-1 text-[10px]">Breakdown Summary</h4>
              
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Basic Salary ({currentCompany.basicPercent || 50}%)</span>
                <span className="font-medium text-slate-800">₹{viewPayslip.basicSalary.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">House Rent / Special Allowances</span>
                <span className="font-medium text-emerald-600">₹{viewPayslip.allowances.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 text-rose-600">
                <span>Deductions</span>
                <span className="font-medium">-₹{viewPayslip.deductions.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2.5 text-sm font-extrabold text-slate-900 border-t border-slate-200">
                <span>Net Take-home</span>
                <span style={{ color: currentCompany.primaryColor || '#3b82f6' }}>₹{viewPayslip.netSalary.toLocaleString()}</span>
              </div>
            </div>

            {viewPayslip.paymentDate && (
              <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-1 text-[9.5px] text-slate-400">
                <p>Payment Settled Date: {viewPayslip.paymentDate}</p>
                <p>Ledger Reference ID: {viewPayslip.id}</p>
                <p>Audited: Verified by HR & cleared by corporate finance board</p>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <Button variant="outline" icon={<Download size={13} />} className="text-xs font-bold" onClick={() => alert('PDF downloaded successfully.')}>Download Receipt</Button>
              <Button variant="outline" icon={<Send size={13} />} className="text-xs font-bold" onClick={() => handleSendEmail(viewPayslip)}>Email Payslip</Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};
