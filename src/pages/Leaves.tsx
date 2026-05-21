import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Calendar, Clock, CheckCircle2, ChevronDown, ChevronUp, BarChart3, Award } from 'lucide-react';
import {
  type Employee,
  type LeaveRequest,
  type LeaveType,
  type LeaveStatus,
  type Role
} from '../data/mockData';
import { Badge, statusBadge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { validateName } from '../utils/validation';
import { type UserAccount } from './Login';

interface LeavesProps {
  role: Role;
  activeCompanyId: string;
  leaves: LeaveRequest[];
  onUpdateLeaves: (leaves: LeaveRequest[]) => void;
  _employees: Employee[];
  authProfile?: UserAccount | null;
}

const leaveTypes: LeaveType[] = ['Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid'];
const leaveStatuses: LeaveStatus[] = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

export const Leaves: React.FC<LeavesProps> = ({
  role,
  activeCompanyId,
  leaves,
  onUpdateLeaves,
  _employees,
  authProfile
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [viewLeave, setViewLeave] = useState<LeaveRequest | null>(null);
  const [editLeave, setEditLeave] = useState<LeaveRequest | null>(null);
  const [nameError, setNameError] = useState('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const todayStr = '2026-05-20'; // Standard system anchor date

  // Dynamic Allowed Leaves limits
  const ALLOWED_SICK = 8;
  const ALLOWED_CASUAL = 6;
  const ALLOWED_ANNUAL = 4;
  const TOTAL_ALLOWED = ALLOWED_SICK + ALLOWED_CASUAL + ALLOWED_ANNUAL;

  const [form, setForm] = useState({
    employeeName: '',
    department: 'Engineering',
    leaveType: 'Annual' as LeaveType,
    fromDate: todayStr,
    toDate: todayStr,
    reason: '',
  });

  const [editForm, setEditForm] = useState({
    leaveType: 'Annual' as LeaveType,
    fromDate: todayStr,
    toDate: todayStr,
    reason: '',
    status: 'Pending' as LeaveStatus,
  });

  useEffect(() => {
    if (!addOpen) {
      setNameError('');
    }
  }, [addOpen]);

  // Set form state when edit modal opens
  useEffect(() => {
    if (editLeave) {
      setEditForm({
        leaveType: editLeave.leaveType,
        fromDate: editLeave.fromDate,
        toDate: editLeave.toDate,
        reason: editLeave.reason || '',
        status: editLeave.status,
      });
    }
  }, [editLeave]);

  const calcDays = (from: string, to: string): number => {
    if (!from || !to) return 0;
    const diff = new Date(to).getTime() - new Date(from).getTime();
    return Math.max(1, Math.floor(diff / 86400000) + 1);
  };

  // 1. Role-based isolation & scoping
  const companyLeaves = useMemo(() => {
    const isCompany = leaves.filter(l => l.companyId === activeCompanyId);
    if (role === 'Employee') {
      return isCompany.filter(
        l => l.employeeId === authProfile?.employeeId || l.employeeName.toLowerCase() === authProfile?.name?.toLowerCase()
      );
    }
    return isCompany;
  }, [leaves, activeCompanyId, role, authProfile]);

  const filtered = useMemo(() => {
    return companyLeaves.filter(l => {
      const q = search.toLowerCase();
      const matchSearch = !q || l.employeeName.toLowerCase().includes(q) || l.department.toLowerCase().includes(q);
      const matchType = !typeFilter || l.leaveType === typeFilter;
      const matchStatus = !statusFilter || l.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    });
  }, [companyLeaves, search, typeFilter, statusFilter]);

  // 2. Real-time Allowed vs Used Balance calculations for each employee
  const employeeLeaveSummaries = useMemo(() => {
    const companyEmployees = _employees.filter(e => e.companyId === activeCompanyId);
    return companyEmployees.map(emp => {
      const empLeaves = leaves.filter(
        l => (l.employeeId === emp.id || l.employeeName.toLowerCase() === emp.name.toLowerCase()) && 
             l.companyId === activeCompanyId &&
             l.status === 'Approved'
      );
      const sickUsed = empLeaves.filter(l => l.leaveType === 'Sick').reduce((sum, l) => sum + l.days, 0);
      const casualUsed = empLeaves.filter(l => l.leaveType === 'Casual').reduce((sum, l) => sum + l.days, 0);
      const annualUsed = empLeaves.filter(l => l.leaveType === 'Annual').reduce((sum, l) => sum + l.days, 0);
      const otherUsed = empLeaves.filter(l => !['Sick', 'Casual', 'Annual'].includes(l.leaveType)).reduce((sum, l) => sum + l.days, 0);
      const totalUsed = sickUsed + casualUsed + annualUsed + otherUsed;
      const remaining = Math.max(0, TOTAL_ALLOWED - totalUsed);

      const sortedLeaves = [...empLeaves].sort((a, b) => new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime());
      const lastLeave = sortedLeaves.length > 0 ? `${sortedLeaves[0].fromDate} (${sortedLeaves[0].leaveType})` : 'None';

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        sickUsed,
        casualUsed,
        annualUsed,
        totalUsed,
        remaining,
        lastLeave
      };
    });
  }, [leaves, _employees, activeCompanyId]);

  // 3. Dynamic top metric card counts
  const totalCount = companyLeaves.length;
  const sickDaysTotal = useMemo(() => {
    return companyLeaves.filter(l => l.leaveType === 'Sick' && l.status === 'Approved').reduce((acc, l) => acc + l.days, 0);
  }, [companyLeaves]);

  const casualDaysTotal = useMemo(() => {
    return companyLeaves.filter(l => l.leaveType === 'Casual' && l.status === 'Approved').reduce((acc, l) => acc + l.days, 0);
  }, [companyLeaves]);

  const onLeaveTodayCount = useMemo(() => {
    return companyLeaves.filter(
      l => l.status === 'Approved' && todayStr >= l.fromDate && todayStr <= l.toDate
    ).length;
  }, [companyLeaves, todayStr]);

  // 4. Leave Analytics computations
  const analytics = useMemo(() => {
    const approvedLeaves = companyLeaves.filter(l => l.status === 'Approved');

    // Most Used Leave Type
    const countsByType: Record<string, number> = {};
    approvedLeaves.forEach(l => {
      countsByType[l.leaveType] = (countsByType[l.leaveType] || 0) + l.days;
    });
    let mostUsedType = 'None';
    let maxTypeDays = 0;
    Object.entries(countsByType).forEach(([type, days]) => {
      if (days > maxTypeDays) {
        maxTypeDays = days;
        mostUsedType = type;
      }
    });

    // Employee with highest leave count
    const countsByEmp: Record<string, number> = {};
    approvedLeaves.forEach(l => {
      countsByEmp[l.employeeName] = (countsByEmp[l.employeeName] || 0) + l.days;
    });
    let topEmployeeName = 'None';
    let topEmployeeDays = 0;
    Object.entries(countsByEmp).forEach(([name, days]) => {
      if (days > topEmployeeDays) {
        topEmployeeDays = days;
        topEmployeeName = name;
      }
    });

    // Department with highest count
    const countsByDept: Record<string, number> = {};
    approvedLeaves.forEach(l => {
      countsByDept[l.department] = (countsByDept[l.department] || 0) + l.days;
    });
    let topDeptName = 'None';
    let topDeptDays = 0;
    Object.entries(countsByDept).forEach(([dept, days]) => {
      if (days > topDeptDays) {
        topDeptDays = days;
        topDeptName = dept;
      }
    });

    // Monthly leave summary (Approved this month)
    const monthlyApprovedCount = approvedLeaves.filter(
      l => l.fromDate.includes('-05-') || l.fromDate.includes('-06-')
    ).length;

    return {
      mostUsedType: mostUsedType !== 'None' ? `${mostUsedType} (${maxTypeDays} days)` : 'None',
      topEmployee: topEmployeeName !== 'None' ? `${topEmployeeName} (${topEmployeeDays} days)` : 'None',
      topDept: topDeptName !== 'None' ? `${topDeptName} (${topDeptDays} days)` : 'None',
      monthlySummary: `${monthlyApprovedCount} approved request(s) this cycle`
    };
  }, [companyLeaves]);

  // Operations
  const handleApply = () => {
    const err = validateName(form.employeeName).error;
    if (err) {
      alert('Error: Please resolve validation errors before logging leave.');
      return;
    }

    const matchingEmp = _employees.find(
      e => e.companyId === activeCompanyId && e.name.toLowerCase() === form.employeeName.toLowerCase()
    );

    const newLeave: LeaveRequest = {
      id: `l${Date.now()}`,
      companyId: activeCompanyId,
      employeeId: matchingEmp ? matchingEmp.id : `e${Date.now()}`,
      employeeName: form.employeeName,
      department: matchingEmp ? matchingEmp.department : form.department,
      leaveType: form.leaveType,
      fromDate: form.fromDate,
      toDate: form.toDate,
      days: calcDays(form.fromDate, form.toDate),
      reason: form.reason,
      status: 'Pending',
      appliedOn: todayStr,
    };

    onUpdateLeaves([newLeave, ...leaves]);
    setAddOpen(false);
    setForm({ employeeName: '', department: 'Engineering', leaveType: 'Annual', fromDate: todayStr, toDate: todayStr, reason: '' });
    setNameError('');
    alert('Leave request submitted successfully.');
  };

  const handleSaveEdit = () => {
    if (!editLeave) return;
    const computedDays = calcDays(editForm.fromDate, editForm.toDate);
    const updated: LeaveRequest = {
      ...editLeave,
      leaveType: editForm.leaveType,
      fromDate: editForm.fromDate,
      toDate: editForm.toDate,
      days: computedDays,
      reason: editForm.reason,
      status: editForm.status,
    };
    onUpdateLeaves(leaves.map(l => (l.id === editLeave.id ? updated : l)));
    setEditLeave(null);
    alert('Leave request updated successfully.');
  };

  const handleQuickStatus = (leaveId: string, nextStatus: LeaveStatus) => {
    onUpdateLeaves(leaves.map(l => (l.id === leaveId ? { ...l, status: nextStatus } : l)));
    alert(`Leave status updated to ${nextStatus}.`);
  };

  const isHR = role === 'HR' || role === 'Company Head' || role === 'Super Admin';

  return (
    <div className="space-y-4 font-sans text-left">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Leave Tracker</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Log and track employee leave rosters and scheduled company absences
          </p>
        </div>
        {isHR && (
          <Button icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>
            Log Leave Absence
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Requests" value={totalCount} icon={<Calendar size={16} className="text-blue-600" />} color="bg-blue-50" />
        <StatCard label="Sick Leave Days" value={sickDaysTotal} icon={<Clock size={16} className="text-red-500" />} color="bg-red-50" />
        <StatCard label="Casual Leave Days" value={casualDaysTotal} icon={<CheckCircle2 size={16} className="text-emerald-600" />} color="bg-emerald-50" />
        <StatCard label="On Leave Today" value={onLeaveTodayCount} icon={<Calendar size={16} className="text-purple-600" />} color="bg-purple-50" />
      </div>

      {/* Leave Analytics Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 border border-slate-100 shadow-sm bg-slate-50/50">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} className="text-blue-600" />
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Leave Analytics Summary</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white p-2.5 rounded-lg border border-gray-150 shadow-sm">
              <p className="text-[10px] text-gray-400 font-medium">Most Used Leave Category</p>
              <p className="font-bold text-gray-900 mt-0.5">{analytics.mostUsedType}</p>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-gray-150 shadow-sm">
              <p className="text-[10px] text-gray-400 font-medium">Top High-Absence Department</p>
              <p className="font-bold text-gray-900 mt-0.5">{analytics.topDept}</p>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-gray-150 shadow-sm">
              <p className="text-[10px] text-gray-400 font-medium">Highest Absence Employee</p>
              <p className="font-bold text-gray-900 mt-0.5">{analytics.topEmployee}</p>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-gray-150 shadow-sm">
              <p className="text-[10px] text-gray-400 font-medium">Cycle Approved Count</p>
              <p className="font-bold text-gray-900 mt-0.5">{analytics.monthlySummary}</p>
            </div>
          </div>
        </Card>

        {/* Dynamic Allowed Rules details panel */}
        <Card className="p-4 border border-slate-100 shadow-sm bg-slate-50/50">
          <div className="flex items-center gap-2 mb-3">
            <Award size={16} className="text-emerald-600" />
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Corporate Allowed Leave Caps</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-gray-150">
              <span className="text-gray-600 font-medium">Sick Leave Cap (Annual)</span>
              <span className="font-bold text-gray-800">8 Days</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-gray-150">
              <span className="text-gray-600 font-medium">Casual Leave Cap (Annual)</span>
              <span className="font-bold text-gray-800">6 Days</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-gray-150">
              <span className="text-gray-600 font-medium">Annual Leave Cap (Annual)</span>
              <span className="font-bold text-gray-800">4 Days</span>
            </div>
            <div className="flex items-center justify-between py-1 bg-emerald-50 px-2 rounded font-semibold text-emerald-800">
              <span>Total Allowed Absence Pool</span>
              <span>18 Days per Annum</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter panel */}
      <Card>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-48">
            <Input placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={14} />} />
          </div>
          <div className="w-36">
            <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              options={[{ value: '', label: 'All Types' }, ...leaveTypes.map(t => ({ value: t, label: t }))]}
            />
          </div>
          <div className="w-36">
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              options={[{ value: '', label: 'All Status' }, ...leaveStatuses.map(s => ({ value: s, label: s }))]}
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding={false}>
        <Table>
          <Thead>
            <tr>
              <Th>Balance</Th>
              <Th>Employee</Th>
              <Th>Leave Category</Th>
              <Th>From Date</Th>
              <Th>To Date</Th>
              <Th>Total Days</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-sm text-gray-400">No leave records registered</td></tr>
            ) : (
              filtered.map(l => {
                const empSummary = employeeLeaveSummaries.find(
                  s => s.employeeName.toLowerCase() === l.employeeName.toLowerCase()
                );
                return (
                  <React.Fragment key={l.id}>
                    <Tr className="hover:bg-gray-50/50">
                      <Td>
                        <button
                          onClick={() => setExpandedRowId(expandedRowId === l.id ? null : l.id)}
                          className="p-1 hover:bg-gray-100 rounded text-gray-500"
                          title="Toggle Allowed vs Used Balances"
                        >
                          {expandedRowId === l.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </Td>
                      <Td>
                        <div onClick={() => setExpandedRowId(expandedRowId === l.id ? null : l.id)} className="cursor-pointer">
                          <p className="text-xs font-semibold text-gray-900 hover:text-blue-600 transition">{l.employeeName}</p>
                          <p className="text-[10px] text-gray-400">{l.department}</p>
                        </div>
                      </Td>
                      <Td><Badge variant={l.leaveType === 'Sick' ? 'danger' : l.leaveType === 'Casual' ? 'success' : 'blue'}>{l.leaveType}</Badge></Td>
                      <Td><span className="text-xs font-medium text-gray-700">{l.fromDate}</span></Td>
                      <Td><span className="text-xs font-medium text-gray-700">{l.toDate}</span></Td>
                      <Td><span className="text-xs font-bold text-gray-900">{l.days}d</span></Td>
                      <Td>
                        <Badge variant={statusBadge(l.status)} dot>{l.status}</Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5 text-[10px] font-sans">
                          <button
                            onClick={() => setViewLeave(l)}
                            className="px-2 py-0.5 bg-gray-150 hover:bg-gray-200 text-gray-700 font-bold rounded"
                            title="View Reason Details"
                          >
                            View
                          </button>
                          {isHR && (
                            <>
                              <button
                                onClick={() => setEditLeave(l)}
                                className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold rounded"
                                title="Edit Request Details"
                              >
                                Edit
                              </button>
                              {l.status === 'Pending' && (
                                <>
                                  <button
                                    onClick={() => handleQuickStatus(l.id, 'Approved')}
                                    className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold rounded"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleQuickStatus(l.id, 'Rejected')}
                                    className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {l.status === 'Approved' && (
                                <button
                                  onClick={() => handleQuickStatus(l.id, 'Cancelled')}
                                  className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-600 font-bold rounded"
                                >
                                  Cancel
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </Td>
                    </Tr>
                    {/* Expandable leave breakdown and statistics card row */}
                    {expandedRowId === l.id && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={8} className="px-6 py-3.5 border-t border-b border-gray-150">
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 text-left text-xs">
                            <div className="bg-white p-2.5 rounded-lg border border-gray-150 shadow-sm">
                              <p className="text-[10px] text-gray-500 font-medium">Sick Leaves Used</p>
                              <p className="text-xs font-bold text-red-600 mt-1">{empSummary?.sickUsed || 0} / {ALLOWED_SICK} days</p>
                            </div>
                            <div className="bg-white p-2.5 rounded-lg border border-gray-150 shadow-sm">
                              <p className="text-[10px] text-gray-500 font-medium">Casual Leaves Used</p>
                              <p className="text-xs font-bold text-emerald-600 mt-1">{empSummary?.casualUsed || 0} / {ALLOWED_CASUAL} days</p>
                            </div>
                            <div className="bg-white p-2.5 rounded-lg border border-gray-150 shadow-sm">
                              <p className="text-[10px] text-gray-500 font-medium">Annual Leaves Used</p>
                              <p className="text-xs font-bold text-blue-600 mt-1">{empSummary?.annualUsed || 0} / {ALLOWED_ANNUAL} days</p>
                            </div>
                            <div className="bg-white p-2.5 rounded-lg border border-gray-150 shadow-sm">
                              <p className="text-[10px] text-gray-500 font-medium">Dynamic Absence Pool</p>
                              <p className="text-xs font-bold text-gray-900 mt-1">Used: {empSummary?.totalUsed || 0} | Rem: {empSummary?.remaining || 0} days</p>
                            </div>
                            <div className="bg-white p-2.5 rounded-lg border border-gray-150 shadow-sm">
                              <p className="text-[10px] text-gray-500 font-medium">Last Absence Taken</p>
                              <p className="text-xs font-semibold text-gray-800 mt-1">{empSummary?.lastLeave || 'None'}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </Tbody>
        </Table>
      </Card>

      {/* View Leave Reason Modal */}
      <Modal open={!!viewLeave} onClose={() => setViewLeave(null)} title="Leave Request Dossier Detail" size="sm">
        {viewLeave && (
          <div className="space-y-3 text-xs text-left">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-[10px] text-gray-400">Employee Name</p><p className="font-semibold mt-0.5 text-gray-900">{viewLeave.employeeName}</p></div>
              <div><p className="text-[10px] text-gray-400">Department</p><p className="font-semibold mt-0.5">{viewLeave.department}</p></div>
              <div><p className="text-[10px] text-gray-400">Category</p><Badge variant="blue" className="mt-0.5">{viewLeave.leaveType}</Badge></div>
              <div><p className="text-[10px] text-gray-400">Duration</p><p className="font-semibold mt-0.5 text-gray-900">{viewLeave.days} days</p></div>
              <div><p className="text-[10px] text-gray-400">From Date</p><p className="font-semibold mt-0.5">{viewLeave.fromDate}</p></div>
              <div><p className="text-[10px] text-gray-400">To Date</p><p className="font-semibold mt-0.5">{viewLeave.toDate}</p></div>
            </div>
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-[10px] text-gray-400 mb-1">Reason Statement</p>
              <p className="text-xs text-gray-700 leading-relaxed">{viewLeave.reason || 'No explanation specified.'}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Apply Leave Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Log Employee Leave Absence"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleApply} 
              disabled={
                !form.employeeName || 
                !form.fromDate || 
                !form.toDate || 
                !form.reason || 
                !!nameError
              }
            >
              Log Leave
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-left">
          <Input 
            label="Employee Name *" 
            placeholder="e.g. Arjun Mehta" 
            value={form.employeeName} 
            onChange={e => {
              const clean = e.target.value.replace(/[^a-zA-Z\s]/g, '');
              setForm({ ...form, employeeName: clean });
              setNameError(validateName(clean).error);
            }} 
            error={nameError}
            success={form.employeeName !== '' && !nameError}
          />
          <Select label="Leave Category *" value={form.leaveType} onChange={e => setForm({ ...form, leaveType: e.target.value as LeaveType })}
            options={leaveTypes.map(t => ({ value: t, label: t }))}
          />
          <div className="grid grid-cols-2 gap-3 text-left">
            <Input label="From Date *" type="date" value={form.fromDate} onChange={e => setForm({ ...form, fromDate: e.target.value })} />
            <Input label="To Date *" type="date" value={form.toDate} onChange={e => setForm({ ...form, toDate: e.target.value })} />
          </div>
          {form.fromDate && form.toDate && (
            <div className="p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700 font-semibold text-left">
              Computed Duration: {calcDays(form.fromDate, form.toDate)} day(s)
            </div>
          )}
          <Textarea label="Reason for Leave *" placeholder="Please explain leave reason..." value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
        </div>
      </Modal>

      {/* Edit Leave Modal */}
      <Modal
        open={!!editLeave}
        onClose={() => setEditLeave(null)}
        title="Modify Employee Leave Absence"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditLeave(null)}>Cancel</Button>
            <Button 
              onClick={handleSaveEdit} 
              disabled={
                !editForm.fromDate || 
                !editForm.toDate || 
                !editForm.reason
              }
            >
              Save Changes
            </Button>
          </>
        }
      >
        {editLeave && (
          <div className="space-y-3 text-left">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-gray-150 text-xs">
              <p className="text-gray-500 font-medium">Modifying Absence Profile for:</p>
              <p className="font-bold text-gray-900 mt-0.5">{editLeave.employeeName} ({editLeave.department})</p>
            </div>
            
            <Select label="Leave Category *" value={editForm.leaveType} onChange={e => setEditForm({ ...editForm, leaveType: e.target.value as LeaveType })}
              options={leaveTypes.map(t => ({ value: t, label: t }))}
            />
            
            <div className="grid grid-cols-2 gap-3 text-left">
              <Input label="From Date *" type="date" value={editForm.fromDate} onChange={e => setEditForm({ ...editForm, fromDate: e.target.value })} />
              <Input label="To Date *" type="date" value={editForm.toDate} onChange={e => setEditForm({ ...editForm, toDate: e.target.value })} />
            </div>

            {editForm.fromDate && editForm.toDate && (
              <div className="p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700 font-semibold text-left">
                Recalculated Duration: {calcDays(editForm.fromDate, editForm.toDate)} day(s)
              </div>
            )}

            <Select label="Workflow Status *" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value as LeaveStatus })}
              options={leaveStatuses.map(s => ({ value: s, label: s }))}
            />

            <Textarea label="Reason for Leave *" value={editForm.reason} onChange={e => setEditForm({ ...editForm, reason: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
};
