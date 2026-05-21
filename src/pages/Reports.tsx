import React, { useState } from 'react';
import { Download, Calendar, DollarSign, Users } from 'lucide-react';
import {
  type Employee,
  type AttendanceRecord,
  type LeaveRequest,
  type PayrollRecord,
  type Role,
  type Company
} from '../data/mockData';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { Badge, statusBadge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';

interface ReportsProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  payroll: PayrollRecord[];
  leaves: LeaveRequest[];
}

type ReportType = 'attendance' | 'payroll' | 'leave';

export const Reports: React.FC<ReportsProps> = ({
  role,
  activeCompanyId,
  companies,
  employees,
  attendance,
  payroll,
  leaves
}) => {
  const [activeReport, setActiveReport] = useState<ReportType>('attendance');
  const [monthFilter, setMonthFilter] = useState('June');
  const [deptFilter, setDeptFilter] = useState('');

  // Scoped datasets derived from reactive props
  const companyEmployees = employees.filter(e => e.companyId === activeCompanyId);
  const companyAttendance = attendance.filter(a => a.companyId === activeCompanyId);
  const companyPayroll = payroll.filter(p => p.companyId === activeCompanyId);
  const companyLeaves = leaves.filter(l => l.companyId === activeCompanyId);

  // Load active company branding
  const currentCompany = companies.find(c => c.id === activeCompanyId) || companies[0];

  const depts = [...new Set(companyEmployees.map(e => e.department))];
  
  // Calculate summary stats
  const totalPayroll = companyPayroll.reduce((s, r) => s + r.netSalary, 0);
  const activeStaffCount = companyEmployees.filter(e => e.status === 'Active').length;
  const pendingLeavesCount = companyLeaves.filter(l => l.status === 'Pending').length;
  const presentRate = companyAttendance.length > 0 
    ? Math.round((companyAttendance.filter(a => ['Present', 'WFH', 'Half Day'].includes(a.status)).length / companyAttendance.length) * 100)
    : 100;

  const reportCards = [
    { id: 'attendance' as ReportType, label: 'Attendance Report', icon: <Users size={18} className="text-blue-600" />, color: 'bg-blue-50 border-blue-200', desc: 'Daily punch-in summaries and hours' },
    { id: 'payroll' as ReportType, label: 'Payroll Report', icon: <DollarSign size={18} className="text-emerald-600" />, color: 'bg-emerald-50 border-emerald-200', desc: 'Salary processing and pay components' },
    { id: 'leave' as ReportType, label: 'Leave Report', icon: <Calendar size={18} className="text-indigo-600" />, color: 'bg-indigo-50 border-indigo-200', desc: 'Leave requests and pending balances' },
  ];

  const hexToRgbA = (hex: string, alpha: number) => {
    let c = hex.substring(1).split('');
    if(c.length === 3){
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    const r = parseInt(c.slice(0, 2).join(''), 16);
    const g = parseInt(c.slice(2, 4).join(''), 16);
    const b = parseInt(c.slice(4, 6).join(''), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Operational Reports</h2>
          <p className="text-xs text-gray-505 mt-0.5">Generate and download compliance reports for <strong>{currentCompany.name}</strong></p>
        </div>
        <Button variant="outline" icon={<Download size={14} />}>Export All</Button>
      </div>

      {/* Summary KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Monthly Payroll Cap" value={`₹${(totalPayroll / 100000).toFixed(2)}L`} icon={<DollarSign size={16} className="text-emerald-600" />} color="bg-emerald-50" />
        <StatCard label="Attendance Rate" value={`${presentRate}%`} icon={<Users size={16} className="text-blue-600" />} color="bg-blue-50" sub="Present punch-ins today" />
        <StatCard label="Awaiting Leaves" value={pendingLeavesCount} icon={<Calendar size={16} className="text-indigo-600" />} color="bg-indigo-50" />
        <StatCard label="Active Personnel" value={activeStaffCount} icon={<Users size={16} className="text-purple-600" />} color="bg-purple-50" />
      </div>

      {/* Report Selector grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {reportCards.map(r => {
          const isSelected = activeReport === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setActiveReport(r.id)}
              className="p-3 rounded-lg border text-left transition-colors font-sans"
              style={{
                borderColor: isSelected ? currentCompany.primaryColor : undefined,
                backgroundColor: isSelected ? hexToRgbA(currentCompany.primaryColor || '#3b82f6', 0.08) : undefined,
                boxShadow: isSelected ? `0 0 0 1px ${hexToRgbA(currentCompany.primaryColor || '#3b82f6', 0.25)}` : undefined
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                {React.cloneElement(r.icon, { style: { color: isSelected ? currentCompany.primaryColor : undefined } })}
                <span className="text-xs font-bold text-gray-905">{r.label}</span>
              </div>
              <p className="text-[10px] text-gray-500">{r.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-gray-500">Report Filter:</span>
          <div className="w-36">
            <Select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
              options={['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August'].map(m => ({ value: m, label: m }))}
            />
          </div>
          {(activeReport === 'attendance' || activeReport === 'payroll') && (
            <div className="w-44">
              <Select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                options={[{ value: '', label: 'All Departments' }, ...depts.map(d => ({ value: d, label: d }))]}
              />
            </div>
          )}
          <Button variant="outline" icon={<Download size={13} />}>Download PDF</Button>
          <Button variant="outline" icon={<Download size={13} />}>Download Excel</Button>
        </div>
      </Card>

      {/* Report Tables */}
      {activeReport === 'attendance' && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-900">Attendance Log — {monthFilter} 2026</h3>
            <span className="text-[10px] text-gray-400 font-bold uppercase">{currentCompany.name}</span>
          </div>
          <Table>
            <Thead>
              <tr>
                <Th>Employee</Th>
                <Th>Department</Th>
                <Th>Date</Th>
                <Th>Clock In</Th>
                <Th>Clock Out</Th>
                <Th>Hours</Th>
                <Th>Status</Th>
              </tr>
            </Thead>
            <Tbody>
              {companyAttendance.filter(a => !deptFilter || a.department === deptFilter).map(a => (
                <Tr key={a.id}>
                  <Td><span className="text-xs font-semibold text-gray-800">{a.employeeName}</span></Td>
                  <Td><span className="text-xs text-gray-500">{a.department}</span></Td>
                  <Td><span className="text-xs">{a.date}</span></Td>
                  <Td><span className="text-xs font-medium text-gray-700">{a.clockIn || '—'}</span></Td>
                  <Td><span className="text-xs">{a.clockOut || '—'}</span></Td>
                  <Td><span className="text-xs font-medium">{a.hoursWorked > 0 ? `${a.hoursWorked}h` : '—'}</span></Td>
                  <Td><Badge variant={statusBadge(a.status)} dot>{a.status}</Badge></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      {activeReport === 'payroll' && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-900">Payroll Cycle Report — {monthFilter} 2026</h3>
            <span className="text-[10px] text-gray-400 font-bold uppercase">{currentCompany.name}</span>
          </div>
          <Table>
            <Thead>
              <tr>
                <Th>Employee</Th>
                <Th>Department</Th>
                <Th>Basic</Th>
                <Th>Allowances</Th>
                <Th>Deductions</Th>
                <Th>Net Salary</Th>
                <Th>Status</Th>
                <Th>Payment Date</Th>
              </tr>
            </Thead>
            <Tbody>
              {companyPayroll.filter(r => !deptFilter || r.department === deptFilter).map(r => (
                <Tr key={r.id}>
                  <Td><span className="text-xs font-semibold text-gray-800">{r.employeeName}</span></Td>
                  <Td><span className="text-xs text-gray-500">{r.department}</span></Td>
                  <Td><span className="text-xs">₹{r.basicSalary.toLocaleString()}</span></Td>
                  <Td><span className="text-xs text-emerald-600">+₹{r.allowances.toLocaleString()}</span></Td>
                  <Td><span className="text-xs text-red-500">-₹{r.deductions.toLocaleString()}</span></Td>
                  <Td><span className="text-xs font-bold text-gray-900">₹{r.netSalary.toLocaleString()}</span></Td>
                  <Td><Badge variant={statusBadge(r.status)}>{r.status}</Badge></Td>
                  <Td><span className="text-xs text-gray-500">{r.paymentDate ?? '—'}</span></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-6 text-xs font-bold text-gray-900">
            <span className="text-gray-500 font-semibold">Net Payout:</span>
            <span style={{ color: currentCompany.primaryColor }}>₹{companyPayroll.reduce((s, r) => s + r.netSalary, 0).toLocaleString()}</span>
          </div>
        </Card>
      )}

      {activeReport === 'leave' && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-900">Staff Leave Summary — {monthFilter} 2026</h3>
            <span className="text-[10px] text-gray-400 font-bold uppercase">{currentCompany.name}</span>
          </div>
          <Table>
            <Thead>
              <tr>
                <Th>Employee</Th>
                <Th>Department</Th>
                <Th>Leave Type</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th>Days</Th>
                <Th>Status</Th>
                <Th>Approved By</Th>
              </tr>
            </Thead>
            <Tbody>
              {companyLeaves.map(l => (
                <Tr key={l.id}>
                  <Td><span className="text-xs font-semibold text-gray-800">{l.employeeName}</span></Td>
                  <Td><span className="text-xs text-gray-500">{l.department}</span></Td>
                  <Td><Badge variant="blue">{l.leaveType}</Badge></Td>
                  <Td><span className="text-xs">{l.fromDate}</span></Td>
                  <Td><span className="text-xs">{l.toDate}</span></Td>
                  <Td><span className="text-xs font-semibold">{l.days}d</span></Td>
                  <Td><Badge variant={statusBadge(l.status)} dot>{l.status}</Badge></Td>
                  <Td><span className="text-xs text-gray-500">{l.approvedBy ?? '—'}</span></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}
    </div>
  );
};
