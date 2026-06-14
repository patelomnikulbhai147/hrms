import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Calendar, Clock, CheckCircle2, ChevronDown, ChevronUp, BarChart3, Award } from 'lucide-react';
import {
  type Employee,
  type LeaveRequest,
  type LeaveType,
  type LeaveStatus,
  type Role,
  type Company,
  isCompanyIdMatch,
  buildScopedEmployeeIdSet
} from '../types';
import { Badge, statusBadge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { type UserAccount } from './Login';
import { getUniqueEmployees, getUniqueRecords } from '../utils/deduplication';
import { byEmployeeCode } from '../utils/employeeSort';
import { ExportMenu } from '../components/ui/ExportMenu';
import { type ExportColumn } from '../utils/exportUtils';
import { usePermissions } from '../context/PermissionContext';
import { api } from '../api/apiClient';
import { getApiErrorMessage } from '../utils/apiError';

const LEAVE_EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Employee', key: 'employeeName', width: 24 },
  { header: 'Department', key: 'department', width: 20 },
  { header: 'Leave Type', key: 'leaveType', width: 16 },
  { header: 'From Date', key: 'fromDate', width: 14 },
  { header: 'To Date', key: 'toDate', width: 14 },
  { header: 'Days', key: 'days', width: 10 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Reason', key: 'reason', width: 36 },
];

interface LeavesProps {
  role: Role;
  activeCompanyId: string;
  leaves: LeaveRequest[];
  onUpdateLeaves: (leaves: LeaveRequest[]) => void;
  _employees: Employee[];
  companies?: Company[];
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
  companies = [],
  authProfile
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [viewLeave, setViewLeave] = useState<LeaveRequest | null>(null);
  const [editLeave, setEditLeave] = useState<LeaveRequest | null>(null);
  const [nameError, setNameError] = useState('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // States for searchable autocomplete selector
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);

  // Real per-employee leave wallets (CL/PL/SL) from the backend, keyed by employeeId.
  const [walletByEmp, setWalletByEmp] = useState<Record<string, any>>({});
  useEffect(() => {
    let alive = true;
    api.leaveBalances.getAll()
      .then((rows: any[]) => {
        if (!alive) return;
        const map: Record<string, any> = {};
        (rows || []).forEach(r => { map[String(r.employeeId)] = r; });
        setWalletByEmp(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeCompanyId, leaves.length]);

  // Map a leave-type label to a wallet category (CL/PL/SL), 'LWP', or null (special, always allowed).
  const categoryOfType = (t: string): 'CL' | 'PL' | 'SL' | 'LWP' | null => {
    const s = String(t || '').toLowerCase();
    if (/unpaid|lwp|without pay/.test(s)) return 'LWP';
    if (/casual/.test(s)) return 'CL';
    if (/sick|medical/.test(s)) return 'SL';
    if (/annual|privilege|earned/.test(s)) return 'PL';
    return null;
  };
  // Available balance for a leave-type for an employee; Infinity = no balance limit.
  const balanceForType = (empId: any, t: string): number => {
    const cat = categoryOfType(t);
    if (cat === 'LWP' || cat === null) return Infinity;
    const w = walletByEmp[String(empId)];
    if (!w) return Infinity; // wallet not loaded yet → don't block
    return cat === 'CL' ? w.clBalance : cat === 'PL' ? w.plBalance : w.slBalance;
  };

  const { canEdit: canEditModule, canCreate: canCreateModule } = usePermissions();
  const canEdit = canEditModule('leaves');
  const canCreate = canCreateModule('leaves');

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
      setSearchQuery('');
      setShowDropdown(false);
      setSelectedEmp(null);
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

  const uniqueEmployees = useMemo(() => getUniqueEmployees(_employees), [_employees]);
  const uniqueLeaves = useMemo(() => getUniqueRecords(leaves, [l => l.id]), [leaves]);

  // Single source of truth: the set of employee ids in this workspace. Leave
  // records carry an employeeId but no branchId, so scoping by employee
  // membership is the only reliable way to filter a branch workspace.
  const scopedEmpIds = useMemo(
    () => buildScopedEmployeeIdSet(uniqueEmployees as any[], activeCompanyId, companies),
    [uniqueEmployees, activeCompanyId, companies]
  );

  // 1. Role-based isolation & scoping
  const companyLeaves = useMemo(() => {
    const isCompany = uniqueLeaves.filter(l => {
      const emp = uniqueEmployees.find(e => e.id === l.employeeId || e.name.toLowerCase() === l.employeeName.toLowerCase());
      return (l.employeeId && scopedEmpIds.has(l.employeeId)) ||
        (emp?.id && scopedEmpIds.has(emp.id)) ||
        isCompanyIdMatch(l.companyId, activeCompanyId, companies, emp?.branchLocation, emp?.branchId);
    });
    if (role === 'Employee') {
      return isCompany.filter(
        l => l.employeeId === authProfile?.employeeId || l.employeeName.toLowerCase() === authProfile?.name?.toLowerCase()
      );
    }
    return isCompany;
  }, [uniqueLeaves, activeCompanyId, role, authProfile, uniqueEmployees]);

  const filtered = useMemo(() => {
    return companyLeaves.filter(l => {
      const q = search.toLowerCase();
      const matchSearch = !q || l.employeeName.toLowerCase().includes(q) || l.department.toLowerCase().includes(q);
      const matchType = !typeFilter || l.leaveType === typeFilter;
      const matchStatus = !statusFilter || l.status === statusFilter;
      
      let matchBranch = true;
      if (branchFilter) {
        const emp = uniqueEmployees.find(e => e.id === l.employeeId || e.name.toLowerCase() === l.employeeName.toLowerCase());
        matchBranch = emp ? (emp.branchLocation || '').toUpperCase() === branchFilter.toUpperCase() : false;
      }
      
      return matchSearch && matchType && matchStatus && matchBranch;
    }).sort(byEmployeeCode(l => uniqueEmployees.find(e => String(e.id) === String(l.employeeId) || e.name?.toLowerCase() === l.employeeName?.toLowerCase())?.employeeId || l.employeeName));
  }, [companyLeaves, search, typeFilter, statusFilter, branchFilter, _employees, uniqueEmployees]);

  // 2. Real-time Allowed vs Used Balance calculations for each employee
  const employeeLeaveSummaries = useMemo(() => {
    const companyEmployees = uniqueEmployees.filter(e =>
      (e.id && scopedEmpIds.has(e.id)) || isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation, e.branchId)
    );
    return companyEmployees.map(emp => {
      const empLeaves = uniqueLeaves.filter(
        l => (l.employeeId === emp.id || l.employeeName.toLowerCase() === emp.name.toLowerCase()) &&
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
  }, [uniqueLeaves, uniqueEmployees, activeCompanyId]);

  // 2b. Real-time Allowed vs Used Balance calculations for the currently selected employee in Log modal
  const selectedEmpLeaves = useMemo(() => {
    if (!selectedEmp) return null;
    const empLeaves = uniqueLeaves.filter(
      l => (l.employeeId === selectedEmp.id || l.employeeName.toLowerCase() === selectedEmp.name.toLowerCase()) &&
           l.status === 'Approved'
    );
    const sickUsed = empLeaves.filter(l => l.leaveType === 'Sick').reduce((sum, l) => sum + l.days, 0);
    const casualUsed = empLeaves.filter(l => l.leaveType === 'Casual').reduce((sum, l) => sum + l.days, 0);
    const annualUsed = empLeaves.filter(l => l.leaveType === 'Annual').reduce((sum, l) => sum + l.days, 0);
    const otherUsed = empLeaves.filter(l => !['Sick', 'Casual', 'Annual'].includes(l.leaveType)).reduce((sum, l) => sum + l.days, 0);
    const totalUsed = sickUsed + casualUsed + annualUsed + otherUsed;
    const remaining = Math.max(0, TOTAL_ALLOWED - totalUsed);

    return {
      sickUsed,
      casualUsed,
      annualUsed,
      otherUsed,
      totalUsed,
      remaining
    };
  }, [uniqueLeaves, selectedEmp, activeCompanyId]);

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
  const handleApply = async () => {
    if (!selectedEmp) {
      setNameError('Please select a valid employee from the autocomplete search.');
      alert('Error: Please select a valid employee from the autocomplete search.');
      return;
    }

    const reqDays = calcDays(form.fromDate, form.toDate);
    // Client-side balance guard (the server enforces it too): block CL/PL/SL beyond balance.
    const cat = categoryOfType(form.leaveType);
    const available = balanceForType(selectedEmp.id, form.leaveType);
    if (cat && cat !== 'LWP' && reqDays > available) {
      const label = cat === 'CL' ? 'Casual' : cat === 'PL' ? 'Privilege' : 'Sick';
      alert(`Insufficient ${label} Leave Balance (available ${available}, requested ${reqDays}).\n\nUse "Unpaid (LWP)" if this leave must be taken without balance.`);
      return;
    }

    const newLeave: LeaveRequest = {
      id: `l${Date.now()}`,
      companyId: selectedEmp.companyId || activeCompanyId,
      employeeId: selectedEmp.id,
      employeeName: selectedEmp.name,
      department: selectedEmp.department,
      leaveType: form.leaveType,
      fromDate: form.fromDate,
      toDate: form.toDate,
      days: reqDays,
      reason: form.reason,
      status: 'Pending',
      appliedOn: todayStr,
    };

    try {
      const saved = await api.leaves.create(newLeave);
      onUpdateLeaves([saved, ...leaves]);
      setAddOpen(false);
      setForm({ employeeName: '', department: 'Engineering', leaveType: 'Annual', fromDate: todayStr, toDate: todayStr, reason: '' });
      setNameError('');
      setSelectedEmp(null);
      setSearchQuery('');
      alert('Leave request submitted successfully.');
    } catch (e: any) {
      // Surface the server's balance rejection (409) verbatim.
      alert(e?.message || 'Failed to save leave request to server.');
    }
  };

  const handleSaveEdit = async () => {
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
    try {
      const saved = await api.leaves.update(updated.id, updated);
      onUpdateLeaves(leaves.map(l => (l.id === editLeave.id ? saved : l)));
      setEditLeave(null);
      alert('Leave request updated successfully.');
    } catch (e) {
      alert(getApiErrorMessage(e, 'Could not update the leave request.'));
    }
  };

  const handleQuickStatus = async (leaveId: string, nextStatus: LeaveStatus) => {
    const target = leaves.find(l => l.id === leaveId);
    if (!target) return;
    const updated = { ...target, status: nextStatus };
    try {
      const saved = await api.leaves.update(leaveId, updated);
      onUpdateLeaves(leaves.map(l => (l.id === leaveId ? saved : l)));
      alert(`Leave status updated to ${nextStatus}.`);
    } catch (e) {
      alert(getApiErrorMessage(e, 'Could not update the leave status.'));
    }
  };

  const isHR = role === 'HR' || role === 'Company Head' || role === 'Super Admin';

  return (
    <div className="space-y-4 font-sans text-left">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Leave Tracker</h2>
          <p className="text-xs text-slate-400 mt-1">
            Log and track employee leave rosters and scheduled company absences
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            fileName="Leaves"
            title="Leave Report"
            sheetName="Leaves"
            columns={LEAVE_EXPORT_COLUMNS}
            rows={() => filtered}
          />
          {isHR && canCreate && (
            <Button icon={<Plus size={14} />} onClick={() => setAddOpen(true)} className="gradient-btn-indigo border-none shadow-lg shadow-indigo-500/25">
              Log Leave Absence
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Requests" value={totalCount} icon={<Calendar size={20} className="text-blue-400" />} color="bg-blue-500/10 border border-blue-500/20" />
        <StatCard label="Sick Leave Days" value={sickDaysTotal} icon={<Clock size={20} className="text-rose-400" />} color="bg-rose-500/10 border border-rose-500/20" />
        <StatCard label="Casual Leave Days" value={casualDaysTotal} icon={<CheckCircle2 size={20} className="text-emerald-400" />} color="bg-emerald-500/10 border border-emerald-500/20" />
        <StatCard label="On Leave Today" value={onLeaveTodayCount} icon={<Calendar size={20} className="text-purple-400" />} color="bg-purple-500/10 border border-purple-500/20" />
      </div>

      {/* Leave Analytics Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="p-5 border border-white/5 bg-slate-900/40 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-indigo-400" />
            <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">Leave Analytics Summary</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 shadow-sm transition-all hover:bg-slate-800">
              <p className="text-[9px] text-slate-450 font-extrabold uppercase tracking-wider">Most Used Leave Category</p>
              <p className="font-bold text-white mt-1.5">{analytics.mostUsedType}</p>
            </div>
            <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 shadow-sm transition-all hover:bg-slate-800">
              <p className="text-[9px] text-slate-450 font-extrabold uppercase tracking-wider">Top High-Absence Department</p>
              <p className="font-bold text-white mt-1.5">{analytics.topDept}</p>
            </div>
            <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 shadow-sm transition-all hover:bg-slate-800">
              <p className="text-[9px] text-slate-450 font-extrabold uppercase tracking-wider">Highest Absence Employee</p>
              <p className="font-bold text-white mt-1.5">{analytics.topEmployee}</p>
            </div>
            <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 shadow-sm transition-all hover:bg-slate-800">
              <p className="text-[9px] text-slate-450 font-extrabold uppercase tracking-wider">Cycle Approved Count</p>
              <p className="font-bold text-white mt-1.5">{analytics.monthlySummary}</p>
            </div>
          </div>
        </Card>

        {/* Dynamic Allowed Rules details panel */}
        <Card className="p-5 border border-white/5 bg-slate-900/40 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center gap-2 mb-4">
            <Award size={16} className="text-emerald-400" />
            <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">Corporate Allowed Leave Caps</h3>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-white/5">
              <span className="text-slate-400 font-medium">Sick Leave Cap (Annual)</span>
              <span className="font-bold text-white">8 Days</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-white/5">
              <span className="text-slate-400 font-medium">Casual Leave Cap (Annual)</span>
              <span className="font-bold text-white">6 Days</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-white/5">
              <span className="text-slate-400 font-medium">Annual Leave Cap (Annual)</span>
              <span className="font-bold text-white">4 Days</span>
            </div>
            <div className="flex items-center justify-between py-2 bg-emerald-500/10 px-3 rounded-xl border border-emerald-500/20 font-bold text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)] mt-2">
              <span className="uppercase tracking-wider text-[10px]">Total Allowed Absence Pool</span>
              <span className="text-xs">18 Days per Annum</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter panel */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Input placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={14} />} />
          
          <Select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            options={[
              { value: '', label: 'All Branches' },
              { value: 'AHMEDABAD', label: 'Ahmedabad' },
              { value: 'RAJKOT', label: 'Rajkot' },
              { value: 'BHAVNAGAR', label: 'Bhavnagar' },
              { value: 'SIDDHPUR', label: 'Siddhpur' }
            ]}
          />
          
          <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            options={[{ value: '', label: 'All Types' }, ...leaveTypes.map(t => ({ value: t, label: t }))]}
          />
          
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            options={[{ value: '', label: 'All Status' }, ...leaveStatuses.map(s => ({ value: s, label: s }))]}
          />
        </div>
      </Card>

      {/* Table */}
      <Card padding={false}>
        <Table>
          <Thead>
            <tr>
              <Th className="text-center">Sr No</Th>
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
              <tr><td colSpan={9} className="text-center py-12 text-sm text-slate-500">No leave records registered</td></tr>
            ) : (
              filtered.map((l, idx) => {
                const empSummary = employeeLeaveSummaries.find(
                  s => s.employeeName.toLowerCase() === l.employeeName.toLowerCase()
                );
                const empCode = uniqueEmployees.find(e => e.id === l.employeeId || e.name?.toLowerCase() === l.employeeName?.toLowerCase())?.employeeId;
                return (
                  <React.Fragment key={l.id}>
                    <Tr className="hover:bg-white/[0.02] transition-colors border-b border-white/5">
                      <Td className="text-center text-[11px] text-slate-400">{idx + 1}</Td>
                      <Td>
                        <button
                          onClick={() => setExpandedRowId(expandedRowId === l.id ? null : l.id)}
                          className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition-colors cursor-pointer"
                          title="Toggle Allowed vs Used Balances"
                        >
                          {expandedRowId === l.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </Td>
                      <Td>
                        <div onClick={() => setExpandedRowId(expandedRowId === l.id ? null : l.id)} className="cursor-pointer group">
                          <p className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors">{l.employeeName}</p>
                          <p className="text-[10px] text-slate-450 mt-0.5">{empCode ? `${empCode} · ` : ''}{l.department}</p>
                        </div>
                      </Td>
                      <Td><Badge variant={l.leaveType === 'Sick' ? 'danger' : l.leaveType === 'Casual' ? 'success' : 'blue'}>{l.leaveType}</Badge></Td>
                      <Td><span className="text-xs font-medium text-slate-300">{l.fromDate}</span></Td>
                      <Td><span className="text-xs font-medium text-slate-300">{l.toDate}</span></Td>
                      <Td><span className="text-xs font-extrabold text-white">{l.days}d</span></Td>
                      <Td>
                        <Badge variant={statusBadge(l.status)} dot>{l.status}</Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2 text-[10px] font-sans">
                          <button
                            onClick={() => setViewLeave(l)}
                            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 font-bold rounded-lg transition-colors cursor-pointer"
                            title="View Reason Details"
                          >
                            View
                          </button>
                          {isHR && canCreate && (
                            <>
                              <button
                                onClick={() => setEditLeave(l)}
                                className="px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 font-bold rounded-lg transition-colors cursor-pointer"
                                title="Edit Request Details"
                              >
                                Edit
                              </button>
                              {l.status === 'Pending' && (
                                <>
                                  <button
                                    onClick={() => handleQuickStatus(l.id, 'Approved')}
                                    className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 font-bold rounded-lg transition-colors cursor-pointer"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleQuickStatus(l.id, 'Rejected')}
                                    className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 font-bold rounded-lg transition-colors cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {l.status === 'Approved' && (
                                <button
                                  onClick={() => handleQuickStatus(l.id, 'Cancelled')}
                                  className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 font-bold rounded-lg transition-colors cursor-pointer"
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
                      <tr className="bg-slate-900/30">
                        <td colSpan={9} className="px-6 py-4 border-b border-white/5">
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-left text-xs">
                            <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 shadow-sm">
                              <p className="text-[9px] text-slate-450 font-extrabold uppercase tracking-wider">Sick Leaves Used</p>
                              <p className="text-xs font-bold text-rose-400 mt-1.5">{empSummary?.sickUsed || 0} / {ALLOWED_SICK} days</p>
                            </div>
                            <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 shadow-sm">
                              <p className="text-[9px] text-slate-450 font-extrabold uppercase tracking-wider">Casual Leaves Used</p>
                              <p className="text-xs font-bold text-emerald-400 mt-1.5">{empSummary?.casualUsed || 0} / {ALLOWED_CASUAL} days</p>
                            </div>
                            <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 shadow-sm">
                              <p className="text-[9px] text-slate-450 font-extrabold uppercase tracking-wider">Annual Leaves Used</p>
                              <p className="text-xs font-bold text-blue-400 mt-1.5">{empSummary?.annualUsed || 0} / {ALLOWED_ANNUAL} days</p>
                            </div>
                            <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 shadow-sm">
                              <p className="text-[9px] text-slate-450 font-extrabold uppercase tracking-wider">Dynamic Absence Pool</p>
                              <p className="text-xs font-bold text-white mt-1.5">Used: {empSummary?.totalUsed || 0} | Rem: {empSummary?.remaining || 0} days</p>
                            </div>
                            <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 shadow-sm">
                              <p className="text-[9px] text-slate-450 font-extrabold uppercase tracking-wider">Last Absence Taken</p>
                              <p className="text-xs font-semibold text-slate-300 mt-1.5">{empSummary?.lastLeave || 'None'}</p>
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
            {canEdit && (
              <Button 
                onClick={handleApply} 
                disabled={
                  !canEdit ||
                  !selectedEmp || 
                  !form.fromDate || 
                  !form.toDate || 
                  !form.reason
                }
              >
                Log Leave
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-3.5 text-left font-sans">
          {/* Autocomplete Search input */}
          <div className="relative">
            <Input 
              label="Search Roster Employee *" 
              placeholder="Type Employee Code, Full Name, Designation..." 
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
                setSelectedEmp(null);
                setForm(prev => ({ ...prev, employeeName: '' }));
                setNameError('');
              }}
              onFocus={() => setShowDropdown(true)}
              disabled={!canEdit}
              error={nameError}
              success={!!selectedEmp}
            />
            
            {showDropdown && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {(() => {
                  const q = searchQuery.toLowerCase().trim();
                  const matches = uniqueEmployees.filter(emp => {
                    if (!((emp.id && scopedEmpIds.has(emp.id)) || isCompanyIdMatch(emp.companyId, activeCompanyId, companies, emp.branchLocation, emp.branchId))) return false;
                    if (!q) return true; // show all under current tenant when focused
                    return (
                      emp.name.toLowerCase().includes(q) ||
                      emp.employeeId.toLowerCase().includes(q) ||
                      (emp.branchLocation || '').toLowerCase().includes(q) ||
                      (emp.designation || '').toLowerCase().includes(q)
                    );
                  });

                  if (matches.length === 0) {
                    return (
                      <div className="p-3 text-center text-xs text-slate-400">
                        No matching employee found in this branch roster
                      </div>
                    );
                  }

                  return matches.map(emp => (
                    <div
                      key={emp.id}
                      onClick={() => {
                        setSelectedEmp(emp);
                        setForm(prev => ({
                          ...prev,
                          employeeName: emp.name,
                          department: emp.department
                        }));
                        setSearchQuery(`${emp.name} (${emp.employeeId})`);
                        setShowDropdown(false);
                        setNameError('');
                      }}
                      className="p-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 text-left text-xs"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800">{emp.name}</span>
                        <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono font-bold">{emp.employeeId}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 flex gap-2">
                        <span>{emp.designation}</span>
                        <span>•</span>
                        <span>{emp.department}</span>
                        <span>•</span>
                        <span className="font-semibold text-slate-600">{emp.branchLocation || 'Ahmedabad'}</span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Dynamic Leave Balance Ratios Panel */}
          {selectedEmp && (() => {
            const w = walletByEmp[String(selectedEmp.id)];
            const cl = w ? w.clBalance : '—', pl = w ? w.plBalance : '—', sl = w ? w.slBalance : '—';
            return (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-slate-150 pb-1.5">
                  <span className="font-bold text-slate-800">Leave Wallet — available balance</span>
                  <span className="text-[10px] text-slate-500 font-semibold">{(selectedEmp as any).employeeId || ''} · {selectedEmp.department}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className={`bg-white p-2 rounded border text-center ${Number(cl) <= 0 ? 'border-red-200' : 'border-slate-150'}`}>
                    <p className="text-[9px] text-gray-400 font-medium">Casual (CL)</p>
                    <p className={`font-bold mt-0.5 ${Number(cl) <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{cl}d</p>
                  </div>
                  <div className={`bg-white p-2 rounded border text-center ${Number(pl) <= 0 ? 'border-red-200' : 'border-slate-150'}`}>
                    <p className="text-[9px] text-gray-400 font-medium">Privilege (PL)</p>
                    <p className={`font-bold mt-0.5 ${Number(pl) <= 0 ? 'text-red-600' : 'text-blue-600'}`}>{pl}d</p>
                  </div>
                  <div className={`bg-white p-2 rounded border text-center ${Number(sl) <= 0 ? 'border-red-200' : 'border-slate-150'}`}>
                    <p className="text-[9px] text-gray-400 font-medium">Sick (SL)</p>
                    <p className={`font-bold mt-0.5 ${Number(sl) <= 0 ? 'text-red-600' : 'text-purple-700'}`}>{sl}d</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">Zero-balance categories are disabled. Take leave beyond balance as <strong>Unpaid (LWP)</strong>.</p>
              </div>
            );
          })()}

          <Select label="Leave Category *" disabled={!canEdit} value={form.leaveType} onChange={e => setForm({ ...form, leaveType: e.target.value as LeaveType })}
            options={leaveTypes.map(type => {
              const cat = categoryOfType(type);
              const bal = selectedEmp ? balanceForType(selectedEmp.id, type) : Infinity;
              const blocked = !!cat && cat !== 'LWP' && bal <= 0;
              return { value: type, label: blocked ? `${type} (0 balance)` : type, disabled: blocked };
            })} />
          {selectedEmp && (() => {
            const cat = categoryOfType(form.leaveType);
            const bal = balanceForType(selectedEmp.id, form.leaveType);
            const reqDays = calcDays(form.fromDate, form.toDate);
            if (cat && cat !== 'LWP' && reqDays > bal) {
              const label = cat === 'CL' ? 'Casual' : cat === 'PL' ? 'Privilege' : 'Sick';
              return <p className="text-[11px] font-bold text-red-600">Insufficient {label} Leave Balance — available {bal === Infinity ? '∞' : bal}, requested {reqDays}.</p>;
            }
            return null;
          })()}

          <div className="grid grid-cols-2 gap-3">
            <Input label="From Date *" type="date" disabled={!canEdit} value={form.fromDate} onChange={e => setForm({ ...form, fromDate: e.target.value })} />
            <Input label="To Date *" type="date" disabled={!canEdit} value={form.toDate} onChange={e => setForm({ ...form, toDate: e.target.value })} />
          </div>

          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60 mb-2">
            <p className="text-xs text-slate-300">Total Duration: <strong className="text-blue-400">{calcDays(form.fromDate, form.toDate)} days</strong></p>
          </div>

          <Textarea label="Reason for Leave *" disabled={!canEdit} placeholder="Please explain leave reason..." value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
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
            {canEdit && (
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
            )}
          </>
        }
      >
        {editLeave && (
          <div className="space-y-3 text-left">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-gray-150 text-xs">
              <p className="text-gray-500 font-medium">Modifying Absence Profile for:</p>
              <p className="font-bold text-gray-900 mt-0.5">{editLeave.employeeName} ({editLeave.department})</p>
            </div>
            
            <Select label="Leave Category *" disabled={!canEdit} value={editForm.leaveType} onChange={e => setEditForm({ ...editForm, leaveType: e.target.value as LeaveType })}
              options={leaveTypes.map(type => ({ value: type, label: type }))} />

            <div className="grid grid-cols-2 gap-3">
              <Input label="From Date *" type="date" disabled={!canEdit} value={editForm.fromDate} onChange={e => setEditForm({ ...editForm, fromDate: e.target.value })} />
              <Input label="To Date *" type="date" disabled={!canEdit} value={editForm.toDate} onChange={e => setEditForm({ ...editForm, toDate: e.target.value })} />
            </div>

            <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60 mb-2">
              <p className="text-xs text-slate-300">Total Duration: <strong className="text-blue-400">{calcDays(editForm.fromDate, editForm.toDate)} days</strong></p>
            </div>

            <Select label="Workflow Status *" disabled={!canEdit} value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value as LeaveStatus })}
              options={leaveStatuses.map(s => ({ value: s, label: s }))}
            />

            <Textarea label="Reason for Leave *" value={editForm.reason} onChange={e => setEditForm({ ...editForm, reason: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
};
