import React, { useState, useEffect } from 'react';
import { Search, Download, CheckCircle2, XCircle, Clock, Filter, Upload } from 'lucide-react';
import {
  type Employee,
  attendanceRecords as globalAttendance,
  type AttendanceRecord,
  type AttendanceStatus,
  type Role
} from '../data/mockData';
import { Badge, statusBadge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

interface AttendanceProps {
  role: Role;
  activeCompanyId: string;
  attendance: AttendanceRecord[];
  onUpdateAttendance: (attendance: AttendanceRecord[]) => void;
  employees: Employee[];
}

const today = new Date().toISOString().split('T')[0];
const statusOptions: AttendanceStatus[] = ['Present', 'Absent', 'Late', 'Half Day', 'WFH'];

export const Attendance: React.FC<AttendanceProps> = ({
  role,
  activeCompanyId,
  attendance,
  onUpdateAttendance,
  employees
}) => {
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState('');
  const [markModal, setMarkModal] = useState<AttendanceRecord | null>(null);
  const [uploadModal, setUploadModal] = useState(false);

  // Dynamically initialize and sync attendance records for all company employees for the selectedDate
  useEffect(() => {
    const activeCompanyEmployees = employees.filter(e => e.companyId === activeCompanyId);
    let updatedAttendance = [...attendance];
    let changed = false;

    activeCompanyEmployees.forEach(emp => {
      const exists = attendance.some(a => a.employeeId === emp.id && a.date === selectedDate);
      if (!exists) {
        const newRecord: AttendanceRecord = {
          id: `a${Date.now()}-${emp.id}`,
          companyId: activeCompanyId,
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department,
          date: selectedDate,
          clockIn: '',
          clockOut: '',
          hoursWorked: 0,
          status: 'Absent'
        };
        updatedAttendance.push(newRecord);
        changed = true;
      }
    });

    if (changed) {
      onUpdateAttendance(updatedAttendance);
    }
  }, [activeCompanyId, selectedDate, employees, attendance]);

  const scopedRecords = attendance.filter(a => a.companyId === activeCompanyId);

  const filtered = scopedRecords.filter(a => {
    const matchDate = a.date === selectedDate;
    const matchSearch = !search || a.employeeName.toLowerCase().includes(search.toLowerCase()) || a.department.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || a.status === statusFilter;
    return matchDate && matchSearch && matchStatus;
  });

  const todayRecords = scopedRecords.filter(a => a.date === today);
  const present = todayRecords.filter(a => ['Present', 'WFH', 'Half Day'].includes(a.status)).length;
  const absent = todayRecords.filter(a => a.status === 'Absent').length;
  const late = todayRecords.filter(a => a.status === 'Late').length;
  const wfh = todayRecords.filter(a => a.status === 'WFH').length;

  const handleClockIn = () => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setClockInTime(time);
    setClockedIn(true);
  };

  const handleClockOut = () => {
    setClockedIn(false);
  };

  const handleMarkAttendance = (status: AttendanceStatus) => {
    if (!markModal) return;
    onUpdateAttendance(attendance.map(r => r.id === markModal.id ? { ...r, status } : r));
    setMarkModal(null);
  };

  const isEmployee = role === 'Employee';
  const canApprove = role === 'Company Head' || role === 'HR';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Attendance Management</h2>
          <p className="text-xs text-gray-500 mt-0.5">Track and verify daily office check-ins</p>
        </div>
        <div className="flex gap-2">
          {canApprove && (
            <Button variant="outline" icon={<Upload size={14} />} onClick={() => setUploadModal(true)}>Upload Attendance</Button>
          )}
          <Button variant="outline" icon={<Download size={14} />}>Export</Button>
        </div>
      </div>

      {/* Clock In/Out simulator */}
      {isEmployee && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">My Attendance — Today</h3>
              <p className="text-xs text-gray-500 mt-0.5">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-3">
              {clockedIn && <div className="flex items-center gap-1.5 text-emerald-600 text-sm"><Clock size={14} /> Clocked in at {clockInTime}</div>}
              {!clockedIn ? (
                <Button icon={<CheckCircle2 size={14} />} variant="success" onClick={handleClockIn}>Clock In</Button>
              ) : (
                <Button icon={<XCircle size={14} />} variant="danger" onClick={handleClockOut}>Clock Out</Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Present" value={present} icon={<CheckCircle2 size={16} className="text-emerald-600" />} color="bg-emerald-50" sub="Incl. WFH" />
        <StatCard label="Absent" value={absent} icon={<XCircle size={16} className="text-red-500" />} color="bg-red-50" />
        <StatCard label="Late Arrivals" value={late} icon={<Clock size={16} className="text-amber-600" />} color="bg-amber-50" />
        <StatCard label="Work From Home" value={wfh} icon={<CheckCircle2 size={16} className="text-blue-600" />} color="bg-blue-50" />
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Input label="Date" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-40" />
          </div>
          <div className="flex-1 min-w-48">
            <Input placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={14} />} />
          </div>
          <div className="w-44">
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              options={[{ value: '', label: 'All Status' }, ...statusOptions.map(s => ({ value: s, label: s }))]}
            />
          </div>
          <Button variant="outline" icon={<Filter size={14} />} onClick={() => { setSearch(''); setStatusFilter(''); setSelectedDate(today); }}>Clear</Button>
        </div>
      </Card>

      {/* Table */}
      <Card padding={false}>
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">Attendance Records — {selectedDate}</span>
          <span className="text-xs text-gray-500">{filtered.length} records</span>
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
              {canApprove && <Th>Actions</Th>}
            </tr>
          </Thead>
          <Tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-sm text-gray-400">No records for this date</td></tr>
            ) : (
              filtered.map(a => (
                <Tr key={a.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {a.employeeName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <span className="text-xs font-medium text-gray-900">{a.employeeName}</span>
                    </div>
                  </Td>
                  <Td><span className="text-xs text-gray-500">{a.department}</span></Td>
                  <Td><span className="text-xs">{a.date}</span></Td>
                  <Td>
                    <span className={`text-xs font-medium ${a.status === 'Late' ? 'text-amber-600' : 'text-gray-700'}`}>
                      {a.clockIn || '—'}
                    </span>
                  </Td>
                  <Td><span className="text-xs">{a.clockOut || '—'}</span></Td>
                  <Td><span className="text-xs font-medium">{a.hoursWorked > 0 ? `${a.hoursWorked}h` : '—'}</span></Td>
                  <Td><Badge variant={statusBadge(a.status)} dot>{a.status}</Badge></Td>
                  {canApprove && (
                    <Td>
                      <button
                        onClick={() => setMarkModal(a)}
                        className="text-xs px-2 py-0.5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
                      >
                        Update
                      </button>
                    </Td>
                  )}
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Card>

      {/* Late Alerts */}
      {todayRecords.filter(a => a.status === 'Late').length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={15} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-amber-700">Late Arrivals Today</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {todayRecords.filter(a => a.status === 'Late').map(a => (
              <div key={a.id} className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1">
                <span className="text-xs font-medium text-amber-800">{a.employeeName}</span>
                <span className="text-xs text-amber-600">— {a.clockIn}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Mark Attendance Modal */}
      <Modal
        open={!!markModal}
        onClose={() => setMarkModal(null)}
        title="Update Attendance Status"
        size="sm"
      >
        {markModal && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">Update attendance for <strong>{markModal.employeeName}</strong> on {markModal.date}</p>
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map(s => (
                <button
                  key={s}
                  onClick={() => handleMarkAttendance(s)}
                  className={`py-2 text-xs font-medium rounded-md border transition-colors ${
                    markModal.status === s
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setMarkModal(null)}>Cancel</Button>
          </div>
        )}
      </Modal>

      {/* Upload Modal */}
      <Modal
        open={uploadModal}
        onClose={() => setUploadModal(false)}
        title="Upload Attendance Log"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadModal(false)}>Cancel</Button>
            <Button onClick={() => setUploadModal(false)}>Upload</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Upload a biometric CSV attendance log. Rows will automatically verify against active employees.</p>
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-blue-300 cursor-pointer">
            <Upload size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">Click to upload or drag & drop</p>
            <p className="text-xs text-gray-400 mt-1">CSV, XLSX up to 10MB</p>
          </div>
          <button className="text-xs text-blue-600 hover:underline">Download biometric CSV template</button>
        </div>
      </Modal>
    </div>
  );
};
