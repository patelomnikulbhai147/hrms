import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, Clock, Filter, CheckCircle2 } from 'lucide-react';
import {
  type Employee,
  leaveRequests as globalLeaves,
  type LeaveRequest,
  type LeaveType,
  type Role
} from '../data/mockData';
import { Badge, statusBadge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { validateName } from '../utils/validation';

interface LeavesProps {
  role: Role;
  activeCompanyId: string;
  leaves: LeaveRequest[];
  onUpdateLeaves: (leaves: LeaveRequest[]) => void;
  employees: Employee[];
}

const leaveTypes: LeaveType[] = ['Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid'];

export const Leaves: React.FC<LeavesProps> = ({
  role,
  activeCompanyId,
  leaves,
  onUpdateLeaves,
  employees
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [viewLeave, setViewLeave] = useState<LeaveRequest | null>(null);
  const [nameError, setNameError] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    employeeName: '',
    department: 'Engineering',
    leaveType: 'Annual' as LeaveType,
    fromDate: todayStr,
    toDate: todayStr,
    reason: '',
  });

  useEffect(() => {
    if (!addOpen) {
      setNameError('');
    }
  }, [addOpen]);

  const companyLeaves = leaves.filter(l => l.companyId === activeCompanyId);

  const filtered = companyLeaves.filter(l => {
    const q = search.toLowerCase();
    const matchSearch = !q || l.employeeName.toLowerCase().includes(q) || l.department.toLowerCase().includes(q);
    const matchType = !typeFilter || l.leaveType === typeFilter;
    const matchStatus = !statusFilter || l.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  // Derived counts
  const totalCount = companyLeaves.length;
  const sickCount = companyLeaves.filter(l => l.leaveType === 'Sick' && l.status === 'Approved').length;
  const casualCount = companyLeaves.filter(l => l.leaveType === 'Casual' && l.status === 'Approved').length;
  const onLeaveTodayCount = companyLeaves.filter(
    l => l.status === 'Approved' && todayStr >= l.fromDate && todayStr <= l.toDate
  ).length;

  const calcDays = (from: string, to: string): number => {
    if (!from || !to) return 0;
    const diff = new Date(to).getTime() - new Date(from).getTime();
    return Math.max(1, Math.floor(diff / 86400000) + 1);
  };

  const handleApply = () => {
    const err = validateName(form.employeeName).error;
    if (err) {
      alert('Error: Please resolve validation errors before logging leave.');
      return;
    }

    const newLeave: LeaveRequest = {
      id: `l${Date.now()}`,
      companyId: activeCompanyId,
      employeeId: `e${Date.now()}`,
      employeeName: form.employeeName,
      department: form.department || 'Engineering',
      leaveType: form.leaveType,
      fromDate: form.fromDate,
      toDate: form.toDate,
      days: calcDays(form.fromDate, form.toDate),
      reason: form.reason,
      status: 'Approved', // Auto-approved since this system is strictly for tracking!
      appliedOn: todayStr,
    };
    onUpdateLeaves([newLeave, ...leaves]);
    setAddOpen(false);
    setForm({ employeeName: '', department: 'Engineering', leaveType: 'Annual', fromDate: todayStr, toDate: todayStr, reason: '' });
    setNameError('');
    alert('Leave record logged successfully.');
  };

  const isHR = role === 'HR';

  return (
    <div className="space-y-4">
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
        <StatCard label="Total Registered Absence Records" value={totalCount} icon={<Calendar size={16} className="text-blue-600" />} color="bg-blue-50" />
        <StatCard label="Sick Leaves Tracked" value={sickCount} icon={<Clock size={16} className="text-red-500" />} color="bg-red-50" />
        <StatCard label="Casual Leaves Tracked" value={casualCount} icon={<CheckCircle2 size={16} className="text-emerald-600" />} color="bg-emerald-50" />
        <StatCard label="On Leave Today" value={onLeaveTodayCount} icon={<Calendar size={16} className="text-purple-600" />} color="bg-purple-50" />
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
              options={[{ value: '', label: 'All Status' }, { value: 'Approved', label: 'Approved' }, { value: 'Pending', label: 'Pending' }]}
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding={false}>
        <Table>
          <Thead>
            <tr>
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
              <tr><td colSpan={7} className="text-center py-8 text-sm text-gray-400">No leave records registered</td></tr>
            ) : (
              filtered.map(l => (
                <Tr key={l.id} className="hover:bg-gray-50/50">
                  <Td>
                    <div>
                      <p className="text-xs font-semibold text-gray-900">{l.employeeName}</p>
                      <p className="text-[10px] text-gray-400">{l.department}</p>
                    </div>
                  </Td>
                  <Td><Badge variant="blue">{l.leaveType}</Badge></Td>
                  <Td><span className="text-xs font-medium text-gray-700">{l.fromDate}</span></Td>
                  <Td><span className="text-xs font-medium text-gray-700">{l.toDate}</span></Td>
                  <Td><span className="text-xs font-bold text-gray-900">{l.days}d</span></Td>
                  <Td>
                    <Badge variant={statusBadge(l.status)} dot>{l.status}</Badge>
                  </Td>
                  <Td>
                    <button
                      onClick={() => setViewLeave(l)}
                      className="text-[10px] px-2.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded"
                    >
                      View Reason
                    </button>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Card>

      {/* View Leave Reason Modal */}
      <Modal open={!!viewLeave} onClose={() => setViewLeave(null)} title="Leave Request Detail" size="sm">
        {viewLeave && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><p className="text-[10px] text-gray-400">Employee Name</p><p className="font-semibold mt-0.5 text-gray-900">{viewLeave.employeeName}</p></div>
              <div><p className="text-[10px] text-gray-400">Department</p><p className="font-semibold mt-0.5">{viewLeave.department}</p></div>
              <div><p className="text-[10px] text-gray-400">Category</p><Badge variant="blue" className="mt-0.5">{viewLeave.leaveType}</Badge></div>
              <div><p className="text-[10px] text-gray-400">Duration</p><p className="font-semibold mt-0.5 text-gray-900">{viewLeave.days} days</p></div>
              <div><p className="text-[10px] text-gray-400">From</p><p className="font-semibold mt-0.5">{viewLeave.fromDate}</p></div>
              <div><p className="text-[10px] text-gray-400">To</p><p className="font-semibold mt-0.5">{viewLeave.toDate}</p></div>
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
            placeholder="e.g. Rajesh Kumar" 
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
            <div className="p-2 bg-blue-50 rounded text-xs text-blue-700 font-semibold text-left">
              Computed Duration: {calcDays(form.fromDate, form.toDate)} day(s)
            </div>
          )}
          <Textarea label="Reason for Leave *" placeholder="Please explain leave reason..." value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
};
