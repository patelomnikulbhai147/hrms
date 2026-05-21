import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Activity,
  CheckCircle2,
  XCircle,
  DollarSign
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
  calculatePayrollStats,
  payrollStatusConfig
} from '../utils/PayrollWorkflowEngine';
import { type UserAccount } from './Login';

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

  const currentCompany = companies.find(c => c.id === activeCompanyId) || companies[0];
  const companyEmployees = useMemo(() => employees.filter(e => e.companyId === activeCompanyId), [employees, activeCompanyId]);

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

  useEffect(() => {
    if (role === 'Employee') return; // Skip automatic seeding for employee personnel
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

        let initialStatus: PayrollStatus = 'draft';
        if (index === 1) initialStatus = 'prepared';
        if (index === 2) initialStatus = 'payment_pending';
        if (index === 3) initialStatus = 'paid';

        updatedPayroll.push({
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
        });
        changed = true;
      }
    });
    if (changed) onUpdatePayroll(updatedPayroll);
  }, [activeCompanyId, companyEmployees, monthFilter, payroll, currentCompany, onUpdatePayroll, role]);

  const scopedRecords = useMemo(() => {
    if (role === 'Employee' && authProfile?.employeeId) {
      return payroll.filter(p => p.employeeId === authProfile.employeeId);
    }
    return payroll.filter(p => p.companyId === activeCompanyId);
  }, [payroll, role, activeCompanyId, authProfile]);

  const filtered = useMemo(() => scopedRecords.filter(r => {
    const currentStatus = r.payrollStatus || r.status;
    const query = search.toLowerCase();
    const matchSearch = !query || r.employeeName.toLowerCase().includes(query) || r.department.toLowerCase().includes(query);
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

  const handleConfirmPayment = () => {
    if (!confirmPaymentRecord) return;
    onUpdatePayroll(payroll.map(r => r.id === confirmPaymentRecord.id ? {
      ...r,
      status: 'paid',
      payrollStatus: 'paid',
      paymentStatus: 'paid',
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod,
      paidBy: role === 'Company Head' ? 'Finance Admin' : 'HR Admin'
    } : r));
    saveAuditLog(confirmPaymentRecord.id, `Salary payment confirmed (${paymentMethod}).`, paymentRemarks || 'Payment ledger updated.');
    setConfirmPaymentRecord(null);
    setPaymentRemarks('');
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
    saveAuditLog(record.id, 'Payslip sent by email.');
    alert('Payslip delivery queued for the upcoming email dispatch.');
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

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Basic Salary</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">₹{viewPayslip.basicSalary.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50/50 p-4 border border-emerald-100">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-emerald-800 font-bold">Net Salary (Payout)</p>
                    <p className="mt-1 text-lg font-bold text-emerald-900">₹{viewPayslip.netSalary.toLocaleString('en-IN')}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Allowances</p>
                    <p className="mt-1 font-semibold text-slate-800">₹{viewPayslip.allowances.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Deductions</p>
                    <p className="mt-1 font-semibold text-slate-800">₹{viewPayslip.deductions.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">One-time Bonus</p>
                    <p className="mt-1 font-semibold text-slate-800">₹{(viewPayslip.bonus || 0).toLocaleString('en-IN')}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Tax Deductions</p>
                    <p className="mt-1 font-semibold text-slate-800">₹{(viewPayslip.tax || 0).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Payment Status</p>
                    <p className="mt-1 font-bold text-slate-800 capitalize">{viewPayslip.paymentStatus}</p>
                  </div>
                </div>

                {viewPayslip.notes && (
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Verification Notes</p>
                    <p className="mt-1 text-slate-700 italic">"{viewPayslip.notes}"</p>
                  </div>
                )}
              </div>
            </div>
          )}
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
                <p className="text-3xl font-semibold text-slate-900">{companyEmployees.length}</p>
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
                <p className="text-sm text-slate-500">Current payroll health, pending approvals, and payment readiness.</p>
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
            onPayClick={record => {
              setConfirmPaymentRecord(record);
            }}
            onPayslipClick={handleGeneratePayslip}
            onDownload={() => alert('Download feature is connected to client-side compliance services.')}
            onSendClick={handleSendEmail}
            role={role}
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

      <Modal
        open={!!confirmPaymentRecord}
        onClose={() => setConfirmPaymentRecord(null)}
        title="Confirm Salary Payment"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmPaymentRecord(null)}>Cancel</Button>
            <Button onClick={handleConfirmPayment}>Confirm Payment</Button>
          </>
        }
      >
        {confirmPaymentRecord && (
          <div className="space-y-4 text-left">
            <p className="text-sm text-slate-600">Record the completed salary payment details and preserve the transaction reference for compliance.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Employee</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{confirmPaymentRecord.employeeName}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Amount</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">₹{confirmPaymentRecord.netSalary.toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Month</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{confirmPaymentRecord.month}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Year</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{confirmPaymentRecord.year}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Payment Method"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                options={[
                  { value: 'Bank Transfer', label: 'Bank Transfer' },
                  { value: 'UPI', label: 'UPI' },
                  { value: 'Cheque', label: 'Cheque' },
                  { value: 'Cash', label: 'Cash' }
                ]}
              />
              <Input
                label="Transaction Reference"
                placeholder="Enter transaction ID or reference"
                value={paymentRemarks}
                onChange={e => setPaymentRemarks(e.target.value)}
              />
            </div>
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
            <Button onClick={handleSavePayrollEdits}>Save Changes</Button>
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
                  value={editForm.basicSalary}
                  onChange={e => setEditForm({ ...editForm, basicSalary: parseInt(e.target.value) || 0 })}
                />
                <Input
                  label="Allowances (INR/mo) *"
                  type="number"
                  value={editForm.allowances}
                  onChange={e => setEditForm({ ...editForm, allowances: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="Deductions (INR/mo) *"
                  type="number"
                  value={editForm.deductions}
                  onChange={e => setEditForm({ ...editForm, deductions: parseInt(e.target.value) || 0 })}
                />
                <Input
                  label="Bonus (INR)"
                  type="number"
                  value={editForm.bonus}
                  onChange={e => setEditForm({ ...editForm, bonus: parseInt(e.target.value) || 0 })}
                />
                <Input
                  label="Tax Deductions (INR)"
                  type="number"
                  value={editForm.tax}
                  onChange={e => setEditForm({ ...editForm, tax: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Workflow Status"
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

              {editForm.paymentStatus !== 'paid' && (
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
