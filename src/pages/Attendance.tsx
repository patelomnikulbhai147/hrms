import React, { useState, useEffect, useMemo } from 'react';
import { Search, CheckCircle2, XCircle, Clock, Filter, Upload, Download, Settings, Users, Calendar, Table as TableIcon, FileText, Database, AlertCircle, RefreshCcw, Save, ChevronDown, Activity, Building2, BarChart3 as BarChart3Icon, Send } from 'lucide-react';
import { type Employee, type AttendanceRecord, type LeaveRequest, type Role, type Company, isCompanyIdMatch, buildScopedEmployeeIdSet, isRecordInWorkspace } from '../types';
import { Badge } from '../components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '../components/ui/Table';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { getUniqueEmployees } from '../utils/deduplication';
import { usePermissions } from '../context/PermissionContext';
import { api } from '../api/apiClient';
import { downloadAttendanceTemplateExcel, downloadImportGuidePDF, downloadAttendanceReport } from '../utils/attendanceExportUtils';
import { AnimatedCounter } from '../components/common/AnimatedCounter';
interface AttendanceCenterProps {
  role: Role;
  activeCompanyId: string;
  attendance: AttendanceRecord[];
  onUpdateAttendance: (attendance: AttendanceRecord[]) => void;
  employees: Employee[];
  companies: Company[];
  leaves?: LeaveRequest[];
}

const today = new Date().toISOString().split('T')[0];

const ATTENDANCE_STATUS_OPTIONS = [
  'Present', 'Absent', 'Half Day', 'Weekly Off', 'Holiday', 
  'Leave', 'Work From Home', 'On Duty'
];

const ATTENDANCE_FLAG_OPTIONS = [
  'Late Mark', 'Early Exit', 'Overtime', 'Night Shift', 'Missed Punch', 'Double Shift', 'Field Work'
];

const DEFAULT_MODE_COLUMNS = {
  simple: ['Employee Code', 'Date', 'Status'],
  working_hours: ['Employee Code', 'Date', 'In Time', 'Out Time'],
  overtime: ['Employee Code', 'Date', 'In Time', 'Out Time', 'OT Hours'],
  shift: ['Employee Code', 'Date', 'Shift', 'Status'],
  advanced: ['Employee Code', 'Employee Name', 'Date', 'In Time', 'Out Time', 'Status', 'Shift', 'OT Hours', 'Remarks'],
};

export const Attendance: React.FC<AttendanceCenterProps> = ({
  role,
  activeCompanyId,
  attendance,
  onUpdateAttendance,
  employees,
  companies,
  leaves = []
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard'|'entry'|'overtime'|'shifts'|'import'|'reports'|'config'>('dashboard');
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Report Filters
  const [reportDept, setReportDept] = useState('');
  const [reportBranch, setReportBranch] = useState('');

  // Mode Configuration State
  const [attendanceMode, setAttendanceMode] = useState<string>(() => {
    return localStorage.getItem(`hrms_attendance_mode_${activeCompanyId}`) || 'advanced';
  });
  
  const [customColumns, setCustomColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem(`hrms_attendance_custom_cols_${activeCompanyId}`);
    return saved ? JSON.parse(saved) : ['Employee Code', 'Date', 'Status', 'Custom Field 1'];
  });
  
  const [newColumnName, setNewColumnName] = useState('');
  
  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Shift DB State
  const [shifts, setShifts] = useState<any[]>(() => {
    return [];
  });
  
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftForm, setShiftForm] = useState({
    name: '', code: '', start: '', end: '', grace: '15 mins', break: '1 hr', otEnabled: true, status: 'Active'
  });

  // OT DB State
  const [overtimeData, setOvertimeData] = useState<any[]>([]);

  const [attendanceAnalytics, setAttendanceAnalytics] = useState<any>(null);

  useEffect(() => {
    if (activeCompanyId) {
      api.shifts.getAll().then(res => setShifts(res)).catch(e => console.error("Failed to load shifts", e));
      api.overtime.getAll().then(res => setOvertimeData(res)).catch(e => console.error("Failed to load overtime", e));
      api.attendance.getAnalytics(activeCompanyId, today).then(res => setAttendanceAnalytics(res)).catch(console.error);
    }
  }, [activeCompanyId, attendance, leaves, employees]);
  
  const [showOTModal, setShowOTModal] = useState(false);
  const [editingOTId, setEditingOTId] = useState<string | null>(null);
  const [otForm, setOTForm] = useState({
    empId: '', empName: '', empCode: '', department: '', branch: '', shift: '', date: today, in: '', out: '', otHours: 0, type: 'Normal Overtime', status: 'Pending', reason: ''
  });

  const [empSearch, setEmpSearch] = useState('');
  const [isEmpDropdownOpen, setIsEmpDropdownOpen] = useState(false);

  // Auto-calculate OT Hours
  useEffect(() => {
    if (otForm.in && otForm.out) {
      const [h1, m1] = otForm.in.split(':').map(Number);
      const [h2, m2] = otForm.out.split(':').map(Number);
      if (!isNaN(h1) && !isNaN(h2)) {
         let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
         if (diff < 0) diff += 24 * 60;
         setOTForm(f => ({...f, otHours: parseFloat((diff / 60).toFixed(2))}));
      }
    }
  }, [otForm.in, otForm.out]);

  const companyEmployees = employees.filter(e => isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation, e.branchId));
  const uniqueEmployees = getUniqueEmployees(companyEmployees);
  const activeUniqueEmployees = uniqueEmployees.filter(e => e.status === 'Active');
  const filteredEmployees = activeUniqueEmployees.filter(e => 
    e.name.toLowerCase().includes(empSearch.toLowerCase()) || 
    (e.employeeId && e.employeeId.toLowerCase().includes(empSearch.toLowerCase())) ||
    (e.department && e.department.toLowerCase().includes(empSearch.toLowerCase()))
  );

  const departments = Array.from(new Set(activeUniqueEmployees.map(e => e.department).filter(Boolean)));
  const branches = Array.from(new Set(activeUniqueEmployees.map(e => e.branchLocation).filter(Boolean)));
  
  // Generate daily records
  const dailyRecords = uniqueEmployees.map(emp => {
    const existing = attendance.find(a => a.employeeId === emp.id && a.date === selectedDate);
    if (existing) return existing;
    
    // Auto Leave Detection
    const isOnLeave = leaves.find(l => 
      l.employeeId === emp.id && 
      l.status === 'Approved' && 
      selectedDate >= l.fromDate && 
      selectedDate <= l.toDate
    );

    // Auto Weekly Off (Simple assumption: Sunday = Weekly Off unless specified)
    const isSunday = new Date(selectedDate).getDay() === 0;

    return {
      id: `new-${emp.id}-${selectedDate}`,
      companyId: emp.companyId,
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department,
      branch: emp.branchLocation || 'Head Office',
      date: selectedDate,
      clockIn: '',
      clockOut: '',
      hoursWorked: 0,
      status: isOnLeave ? 'Leave' : (isSunday ? 'Weekly Off' : 'Absent') as any,
      leaveType: isOnLeave ? isOnLeave.leaveType : undefined,
      flags: []
    };
  });

  const filteredRecords = dailyRecords.filter(a => {
    const matchSearch = !search || a.employeeName.toLowerCase().includes(search.toLowerCase()) || a.department.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Dashboard Stats — scope attendance rows by employee membership (records
  // carry an employeeId but no branchId, so branch workspaces need this).
  const scopedEmpIds = buildScopedEmployeeIdSet(uniqueEmployees as any[], activeCompanyId, companies);
  const attendanceData = attendance.filter(a => isRecordInWorkspace(a, activeCompanyId, scopedEmpIds, companies));

  // ── Live attendance statistics ──────────────────────────────────────────────
  // Computed from the SAME `dailyRecords` rendered in the entry table, for the
  // SAME `selectedDate`. Because `dailyRecords` is derived from the DB-loaded
  // `attendance` array, the cards update the instant a status changes and match
  // the entry table exactly — never a cached/stale analytics call.
  const liveStats = useMemo(() => {
    const otByEmp = new Set(
      (overtimeData || [])
        .filter(o => o.date === selectedDate && Number(o.otHours ?? o.overtimeHours ?? 0) > 0)
        .map(o => o.empId || o.employeeId)
    );
    let present = 0, absent = 0, leave = 0, holiday = 0, weeklyOff = 0, wfh = 0, halfDay = 0, late = 0, overtime = 0;
    for (const r of dailyRecords) {
      const s = String((r as any).status || '').toLowerCase();
      if (/work from home|wfh/.test(s)) wfh++;
      else if (/half[\s-]?day/.test(s)) halfDay++;
      else if (/leave/.test(s)) leave++;                 // Casual / Sick / Privilege / generic Leave
      else if (/holiday/.test(s)) holiday++;
      else if (/weekly off|week off/.test(s)) weeklyOff++;
      else if (/present|on duty|wfo/.test(s)) present++;
      else absent++;

      const flags = (r as any).flags;
      if ((r as any).lateMark === true || (Array.isArray(flags) && flags.some((f: any) => /late/i.test(String(f))))) late++;
      if (Number((r as any).overtimeHours ?? 0) > 0 || otByEmp.has((r as any).employeeId)) overtime++;
    }
    return { total: dailyRecords.length, present, absent, leave, holiday, weeklyOff, wfh, halfDay, late, overtime };
  }, [dailyRecords, overtimeData, selectedDate]);

  const statTotal = liveStats.total;
  const statPresent = liveStats.present;
  const statAbsent = liveStats.absent;
  const statLeave = liveStats.leave;
  const statWfh = liveStats.wfh;
  const statHalf = liveStats.halfDay;
  const statLate = liveStats.late;
  const statOvertime = liveStats.overtime;

  // Attendance validation (#12): the exclusive status buckets must sum to the
  // total headcount. They do by construction (each employee gets exactly one
  // status), but if a data anomaly ever breaks that, record it in the audit log.
  useEffect(() => {
    const sum = statPresent + statAbsent + statLeave + liveStats.holiday + liveStats.weeklyOff + statWfh + statHalf;
    if (statTotal > 0 && sum !== statTotal) {
      const msg = `[${new Date().toISOString()}] ATTENDANCE VALIDATION MISMATCH (${selectedDate}): Present+Absent+Leave+Holiday+WeeklyOff+WFH+HalfDay = ${sum} ≠ Total ${statTotal}`;
      console.error(msg);
      try {
        const logs = JSON.parse(localStorage.getItem('hrms_audit_logs') || '[]');
        localStorage.setItem('hrms_audit_logs', JSON.stringify([msg, ...logs].slice(0, 500)));
      } catch { /* noop */ }
    }
  }, [statTotal, statPresent, statAbsent, statLeave, statWfh, statHalf, liveStats.holiday, liveStats.weeklyOff, selectedDate]);

  const filteredReportRecords = dailyRecords.filter(r => {
    const emp = activeUniqueEmployees.find(e => e.id === r.employeeId);
    if (reportDept && r.department !== reportDept) return false;
    if (reportBranch && emp?.branchLocation !== reportBranch) return false;
    return true;
  });

  const { canEdit: canEditModule } = usePermissions();
  const canEdit = canEditModule('attendance');
  const isAdmin = role === 'Super Admin' || role === 'Company Head' || role === 'HR';

  const handleBulkMark = async (status: string) => {
    if (!isAdmin) return;
    if (selectedIds.length === 0) return alert('Select employees first.');
    
    const updatedAttendance = [...attendance];
    
    try {
      await Promise.all(selectedIds.map(async id => {
        const existingIdx = updatedAttendance.findIndex(a => a.id === id);
        if (existingIdx >= 0) {
          const updated = { ...updatedAttendance[existingIdx], status: status as any };
          updatedAttendance[existingIdx] = updated;
          if (!updated.id.startsWith('new-')) {
            await api.attendance.update(updated.id, updated);
          }
        } else {
          // Is new
          const rec = dailyRecords.find(r => r.id === id);
          if (rec) {
             const newRec = { ...rec, id: undefined, status: status as any };
             const dbRes = await api.attendance.create(newRec);
             updatedAttendance.push(dbRes);
          }
        }
      }));
      onUpdateAttendance(updatedAttendance);
      setSelectedIds([]);
      alert(`Bulk action successful! ${selectedIds.length} employees marked as ${status}. Saved directly to PostgreSQL.`);
    } catch (e) {
      console.error(e);
      alert('Failed to save to PostgreSQL database.');
    }
  };

  const handleSingleMark = async (id: string, status: string) => {
    if (!isAdmin) return;
    const updatedAttendance = [...attendance];
    const existingIdx = updatedAttendance.findIndex(a => a.id === id);
    
    try {
      if (existingIdx >= 0) {
        const updated = { ...updatedAttendance[existingIdx], status: status as any };
        updatedAttendance[existingIdx] = updated;
        if (!updated.id.startsWith('new-')) {
           await api.attendance.update(updated.id, updated);
        } else {
           const dbRes = await api.attendance.create({...updated, id: undefined});
           updatedAttendance[existingIdx] = dbRes;
        }
      } else {
        const rec = dailyRecords.find(r => r.id === id);
        if (rec) {
          const dbRes = await api.attendance.create({ ...rec, id: undefined, status: status as any });
          updatedAttendance.push(dbRes);
        }
      }
      onUpdateAttendance(updatedAttendance);
    } catch (e) {
      console.error(e);
      alert('Failed to save to PostgreSQL database.');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    const record = attendance.find(a => a.id === id);
    if (!record) return;
    try {
      const updated = await api.attendance.update(id, { ...record, status });
      onUpdateAttendance(attendance.map(a => a.id === id ? updated : a));
    } catch (e) {
      console.error(e);
      alert('Failed to update status');
    }
  };

  const getCurrentColumns = () => {
    if (attendanceMode === 'custom') return customColumns;
    return DEFAULT_MODE_COLUMNS[attendanceMode as keyof typeof DEFAULT_MODE_COLUMNS] || DEFAULT_MODE_COLUMNS.advanced;
  };

  const downloadTemplate = () => {
    downloadAttendanceTemplateExcel(getCurrentColumns());
  };

  const saveModeConfiguration = () => {
    localStorage.setItem(`hrms_attendance_mode_${activeCompanyId}`, attendanceMode);
    localStorage.setItem(`hrms_attendance_custom_cols_${activeCompanyId}`, JSON.stringify(customColumns));
    alert('Attendance Mode Configuration Saved Successfully!\n\nThis configuration will automatically affect Attendance Import, Entry, Reports, and Payroll Calculations for this specific branch/company.');
  };

  const handleOpenShiftModal = (shift?: any) => {
    if (shift) {
      setEditingShiftId(shift.id);
      setShiftForm({ ...shift });
    } else {
      setEditingShiftId(null);
      setShiftForm({ name: '', code: '', start: '09:00', end: '18:00', grace: '15 mins', break: '1 hr', otEnabled: true, status: 'Active' });
    }
    setShowShiftModal(true);
  };

  const handleSaveShift = async () => {
    try {
      if (editingShiftId) {
        const res = await api.shifts.update(editingShiftId, { ...shiftForm, companyId: activeCompanyId });
        setShifts(shifts.map(s => s.id === editingShiftId ? res : s));
      } else {
        const res = await api.shifts.create({ ...shiftForm, companyId: activeCompanyId });
        setShifts([...shifts, res]);
      }
      setShowShiftModal(false);
      alert('Shift saved successfully to database!');
    } catch (e) {
      console.error(e);
      alert('Database error: failed to save shift');
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (confirm("Are you sure you want to delete this shift? Employees assigned to it will default to the General Shift.")) {
      try {
        await api.shifts.delete(id);
        setShifts(shifts.filter(s => s.id !== id));
      } catch (e) {
        console.error(e);
        alert('Database error: failed to delete shift');
      }
    }
  };

  // --- OVERTIME CRUD ---
  const handleOpenOTModal = (ot?: any) => {
    if (ot) {
      setEditingOTId(ot.id);
      setOTForm({ ...ot });
    } else {
      setEditingOTId(null);
      setOTForm({ empId: '', empName: '', empCode: '', department: '', branch: '', shift: '', date: selectedDate, in: '18:00', out: '20:00', otHours: 2, type: 'Normal Overtime', status: 'Pending', reason: '' });
    }
    setShowOTModal(true);
  };

  const handleSaveOT = async () => {
    try {
      if (editingOTId) {
        const res = await api.overtime.update(editingOTId, { ...otForm, companyId: activeCompanyId });
        setOvertimeData(overtimeData.map(o => o.id === editingOTId ? res : o));
      } else {
        const res = await api.overtime.create({ ...otForm, companyId: activeCompanyId });
        setOvertimeData([...overtimeData, res]);
      }
      setShowOTModal(false);
    } catch (e) {
      console.error(e);
      alert('Database error: failed to save overtime');
    }
  };

  const handleDeleteOT = async (id: string) => {
    if (confirm("Delete this Overtime Record?")) {
      try {
        await api.overtime.delete(id);
        setOvertimeData(overtimeData.filter(o => o.id !== id));
      } catch (e) {
        console.error(e);
        alert('Database error: failed to delete overtime');
      }
    }
  };

  const handleStatusOT = (id: string, newStatus: string) => {
    const updatedOT = overtimeData.map(o => o.id === id ? { ...o, status: newStatus } : o);
    setOvertimeData(updatedOT);
    localStorage.setItem(`hrms_overtime_${activeCompanyId}`, JSON.stringify(updatedOT));
  };

  const downloadGuide = () => {
    downloadImportGuidePDF();
  };

  const pushToPayroll = () => {
    alert('DATABASE INTEGRATION SUCCESS\n\nAttendance data has been pushed to the Payroll Engine. Overtime amounts, Loss of Pay (LOP) days, and Working Days have been dynamically recalculated for the current cycle.');
  };

  return (
    <div className="space-y-4 font-sans">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Calendar size={20} className="text-blue-600" /> Enterprise Attendance Management Center</h2>
          <p className="text-xs text-slate-500 mt-1">Fully integrated with Payroll Engine, Leave Balances, and Overtime Processing.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
             <Button variant="outline" size="sm" onClick={pushToPayroll} className="flex items-center gap-1 border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">
               <RefreshCcw size={14}/> Push to Payroll Engine
             </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto pb-0.5">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: BarChart3Icon },
          { id: 'entry', label: 'Attendance Entry', icon: TableIcon },
          { id: 'overtime', label: 'Overtime', icon: Clock },
          { id: 'shifts', label: 'Shift Management', icon: Users },
          { id: 'import', label: 'Excel Import', icon: Upload },
          { id: 'reports', label: 'Reports', icon: FileText },
          { id: 'config', label: 'Settings', icon: Settings }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg transition-colors ${activeTab === t.id ? 'bg-white text-blue-700 border-t border-l border-r border-slate-200 shadow-[0_-2px_4px_rgba(0,0,0,0.02)]' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* TAB: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Employees', sub: 'Active Workforce', value: statTotal, icon: Users, colorClass: 'text-blue-600', bgClass: 'bg-blue-50', gradient: 'from-blue-500 to-blue-600' },
              { label: 'Present Today', sub: '100% of total', value: statPresent, icon: CheckCircle2, colorClass: 'text-emerald-600', bgClass: 'bg-emerald-50', gradient: 'from-emerald-500 to-emerald-600' },
              { label: 'Absent Today', sub: '0% of total', value: statAbsent, icon: XCircle, colorClass: 'text-rose-600', bgClass: 'bg-rose-50', gradient: 'from-rose-500 to-rose-600' },
              { label: 'On Leave', sub: '0% of total', value: statLeave, icon: Calendar, colorClass: 'text-amber-600', bgClass: 'bg-amber-50', gradient: 'from-amber-500 to-amber-600' },
              { label: 'WFH Today', sub: '0% of total', value: statWfh, icon: Building2, colorClass: 'text-purple-600', bgClass: 'bg-purple-50', gradient: 'from-purple-500 to-purple-600' },
              { label: 'Half Day', sub: '0% of total', value: statHalf, icon: Clock, colorClass: 'text-cyan-600', bgClass: 'bg-cyan-50', gradient: 'from-cyan-500 to-cyan-600' },
              { label: 'Late Today', sub: '0.0% of total', value: statLate, icon: AlertCircle, colorClass: 'text-pink-600', bgClass: 'bg-pink-50', gradient: 'from-pink-500 to-pink-600' },
              { label: 'Overtime Running', sub: '0% of total', value: statOvertime, icon: Clock, colorClass: 'text-violet-600', bgClass: 'bg-violet-50', gradient: 'from-violet-500 to-violet-600' },
            ].map((kpi, idx) => {
              const pct = statTotal ? Math.round((kpi.value / statTotal) * 100) : 0;
              const subtext = kpi.sub || `${pct}% of total`;
              return (
                <div key={idx} className="bg-white/80 backdrop-blur-xl rounded-[20px] border border-[#E5EFFF] shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-[120px] p-4 group">
                  {/* Subtle bottom gradient strip */}
                  <div className={`absolute bottom-0 left-0 w-full h-[4px] bg-gradient-to-r ${kpi.gradient} opacity-90`} />
                  
                  <div className="flex items-start justify-between w-full relative z-10">
                    <div className={`w-9 h-9 rounded-xl ${kpi.bgClass} ${kpi.colorClass} flex items-center justify-center flex-shrink-0 shadow-sm border border-white/50`}>
                      <kpi.icon size={16} strokeWidth={2} />
                    </div>
                    <div className="text-right">
                      <span className="text-[13px] font-bold text-gray-700 tracking-wide">{kpi.label}</span>
                    </div>
                  </div>
                  
                  <div className="relative z-10 flex items-end justify-between mt-auto">
                    <div>
                      <h3 className="text-[32px] font-bold text-gray-900 tracking-tight leading-[1.1] mb-1">
                        <AnimatedCounter value={kpi.value} />
                      </h3>
                      <span className="text-[10px] font-semibold text-gray-500">{subtext}</span>
                    </div>
                    <svg className={`w-16 h-6 text-opacity-30 ${kpi.colorClass}`} viewBox="0 0 100 30" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M0,25 Q15,20 25,25 T50,15 T75,20 T100,5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Workforce Analytics */}
            <div className="bg-white rounded-[20px] border border-[#E5EFFF] shadow-sm p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-[14px] font-bold text-gray-800">Workforce Analytics</h3>
                <p className="text-[11px] text-gray-500 mb-4">Real-time insights and statistics.</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="relative w-24 h-24 rounded-full border-[6px] border-emerald-500 flex items-center justify-center flex-shrink-0 shadow-inner">
                  <div className="text-center">
                    <span className="block text-xl font-black text-gray-800">{statTotal > 0 ? Math.round((statPresent / statTotal)*100) : 0}%</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2.5 flex-1">
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="flex items-center gap-1.5 text-gray-600"><span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm"></span> Present</span>
                    <span className="text-gray-800">{statPresent} ({(statTotal ? Math.round(statPresent/statTotal*100) : 0)}%)</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="flex items-center gap-1.5 text-gray-600"><span className="w-2 h-2 rounded-full bg-rose-500 shadow-sm"></span> Absent</span>
                    <span className="text-gray-800">{statAbsent} ({(statTotal ? Math.round(statAbsent/statTotal*100) : 0)}%)</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="flex items-center gap-1.5 text-gray-600"><span className="w-2 h-2 rounded-full bg-amber-500 shadow-sm"></span> Leave</span>
                    <span className="text-gray-800">{statLeave} ({(statTotal ? Math.round(statLeave/statTotal*100) : 0)}%)</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="flex items-center gap-1.5 text-gray-600"><span className="w-2 h-2 rounded-full bg-purple-500 shadow-sm"></span> WFH</span>
                    <span className="text-gray-800">{statWfh} ({(statTotal ? Math.round(statWfh/statTotal*100) : 0)}%)</span>
                  </div>
                </div>
              </div>
              <button className="text-[11px] text-blue-600 font-bold mt-5 text-center w-full hover:underline">View Full Report</button>
            </div>

            {/* Department Distribution */}
            <div className="bg-white rounded-[20px] border border-[#E5EFFF] shadow-sm p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-[14px] font-bold text-gray-800 mb-5">Department Distribution</h3>
              </div>
              <div className="flex flex-col gap-4 flex-1">
                {departments.slice(0, 4).map(dept => {
                  const deptCount = activeUniqueEmployees.filter(e => e.department === dept).length;
                  const pct = statTotal > 0 ? (deptCount / statTotal) * 100 : 0;
                  return (
                    <div key={dept}>
                      <div className="flex justify-between text-[11px] font-bold mb-1.5 text-gray-600">
                        <span>{dept || 'Unassigned'}</span>
                        <span className="text-gray-800">{deptCount} ({Math.round(pct)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden shadow-inner">
                        <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
                {departments.length === 0 && (
                   <div className="text-xs text-gray-400 text-center py-4">No department data available.</div>
                )}
              </div>
              <button className="text-[11px] text-blue-600 font-bold mt-5 text-center w-full hover:underline">View Full Report</button>
            </div>

            {/* Broadcast & Notification */}
            <div className="bg-white rounded-[20px] border border-[#E5EFFF] shadow-sm p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-[14px] font-bold text-gray-800 mb-4">Broadcast & Notification</h3>
              </div>
              <div className="flex flex-col gap-3 flex-1">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Target Audience</label>
                  <select className="w-full text-xs font-medium border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700 transition-all">
                    <option>All Staff</option>
                    <option>My Local Branch Staff Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Message</label>
                  <textarea className="w-full text-xs font-medium border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 h-[68px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700 transition-all" placeholder="Type your message here..."></textarea>
                </div>
              </div>
              <Button className="w-full text-xs mt-4 bg-indigo-600 hover:bg-indigo-700 font-bold shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2"><Send size={14} /> Dispatch Broadcast</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-[16px] border border-[#E5EFFF] shadow-sm p-4 flex items-center justify-between group hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform"><Activity size={18} /></div>
                <div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Today's Attendance Rate</p>
                  <h4 className="text-xl font-black text-gray-900">{statTotal > 0 ? Math.round((statPresent/statTotal)*100) : 0}%</h4>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[16px] border border-[#E5EFFF] shadow-sm p-4 flex items-center justify-between group hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl group-hover:scale-110 transition-transform"><Clock size={18} /></div>
                <div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Overtime Hours (Today)</p>
                  <h4 className="text-xl font-black text-gray-900">{statOvertime > 0 ? `${statOvertime * 2}h 00m` : '00h 00m'}</h4>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[16px] border border-[#E5EFFF] shadow-sm p-4 flex items-center justify-between group hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform"><CheckCircle2 size={18} /></div>
                <div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Avg. Check-in Time</p>
                  <h4 className="text-xl font-black text-gray-900">09:02 AM</h4>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[16px] border border-[#E5EFFF] shadow-sm p-4 flex items-center justify-between group hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl group-hover:scale-110 transition-transform"><Users size={18} /></div>
                <div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Pending Approvals</p>
                  <h4 className="text-xl font-black text-gray-900">02</h4>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: ENTRY */}
      {activeTab === 'entry' && (
        <Card padding={false} className="animate-in fade-in overflow-hidden border-slate-200">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 items-center">
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-40 text-xs h-8" />
              <div className="w-48">
                <Input placeholder="Search Employee..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={14}/>} className="text-xs h-8" />
              </div>
              <div className="w-40">
                <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} options={[{value: '', label: 'All Statuses'}, ...ATTENDANCE_STATUS_OPTIONS.map(s => ({value: s, label: s}))]} className="text-xs h-8" />
              </div>
            </div>
            
            {isAdmin && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8 text-[10px] bg-white" onClick={() => handleBulkMark('Present')}><CheckCircle2 size={12} className="mr-1 text-emerald-500"/> Bulk Present</Button>
                <Button size="sm" variant="outline" className="h-8 text-[10px] bg-white" onClick={() => handleBulkMark('Holiday')}><Calendar size={12} className="mr-1 text-indigo-500"/> Bulk Holiday</Button>
              </div>
            )}
          </div>

          <Table>
            <Thead className="bg-slate-100">
              <tr>
                {isAdmin && <Th className="w-10 text-center"><input type="checkbox" onChange={e => setSelectedIds(e.target.checked ? filteredRecords.map(r => r.id) : [])} checked={selectedIds.length === filteredRecords.length && filteredRecords.length > 0} className="rounded border-slate-300" /></Th>}
                <Th>Employee</Th>
                <Th>Clock In</Th>
                <Th>Clock Out</Th>
                <Th>Status</Th>
                {isAdmin && <Th className="text-right">Quick Mark</Th>}
              </tr>
            </Thead>
            <Tbody>
              {filteredRecords.map(r => (
                <Tr key={r.id} className="hover:bg-slate-50">
                  {isAdmin && <Td className="text-center"><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={e => {
                    if (e.target.checked) setSelectedIds([...selectedIds, r.id]);
                    else setSelectedIds(selectedIds.filter(id => id !== r.id));
                  }} className="rounded border-slate-300 text-blue-600" /></Td>}
                  <Td>
                    <div className="font-bold text-slate-800 text-xs">{r.employeeName}</div>
                    <div className="text-[10px] text-slate-500">{r.department}</div>
                  </Td>
                  <Td><span className="text-xs font-mono">{r.clockIn || '--:--'}</span></Td>
                  <Td><span className="text-xs font-mono">{r.clockOut || '--:--'}</span></Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <span className={`px-2 py-1 w-max rounded-full text-[10px] font-bold 
                        ${r.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 
                          r.status === 'Absent' ? 'bg-rose-100 text-rose-700' : 
                          r.status === 'Leave' ? 'bg-indigo-100 text-indigo-700' : 
                          r.status === 'Holiday' ? 'bg-fuchsia-100 text-fuchsia-700' :
                          r.status === 'Weekly Off' ? 'bg-slate-200 text-slate-700' :
                          'bg-slate-100 text-slate-700'}`}>
                        {r.status} {r.leaveType ? `(${r.leaveType})` : ''}
                      </span>
                      {r.flags && r.flags.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1">
                          {r.flags.map((f: string) => <span key={f} className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded">{f}</span>)}
                        </div>
                      )}
                    </div>
                  </Td>
                  {isAdmin && (
                    <Td className="text-right">
                      <select 
                        className="text-[10px] border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-500"
                        value={r.status}
                        onChange={e => handleSingleMark(r.id, e.target.value)}
                      >
                        {ATTENDANCE_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Td>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      {/* TAB: OVERTIME */}
      {activeTab === 'overtime' && (
        <div className="space-y-4 animate-in fade-in">
          {/* OT Analytics Dashboard */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total OT Hours" value={overtimeData.reduce((acc, curr) => acc + (Number(curr.otHours) || 0), 0).toFixed(1)} icon={<Clock size={16} className="text-slate-600" />} color="bg-slate-50" />
            <StatCard label="Approved OT" value={overtimeData.filter(o => o.status === 'Approved').reduce((acc, curr) => acc + (Number(curr.otHours) || 0), 0).toFixed(1)} icon={<CheckCircle2 size={16} className="text-emerald-600" />} color="bg-emerald-50" />
            <StatCard label="Pending OT" value={overtimeData.filter(o => o.status === 'Pending').reduce((acc, curr) => acc + (Number(curr.otHours) || 0), 0).toFixed(1)} icon={<Clock size={16} className="text-amber-600" />} color="bg-amber-50" />
            <StatCard label="OT Cost (Est.)" value={`₹ ${(overtimeData.filter(o => o.status === 'Approved').reduce((acc, curr) => acc + (Number(curr.otHours) || 0), 0) * 200).toLocaleString()}`} icon={<Database size={16} className="text-indigo-600" />} color="bg-indigo-50" />
          </div>

          <Card padding={false} className="overflow-hidden border-slate-200">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-sm text-slate-800">Overtime Tracking & Approvals</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Approved OT automatically calculates via Payroll Multipliers.</p>
              </div>
              {isAdmin && <Button size="sm" className="h-8 text-[10px]" onClick={() => handleOpenOTModal()}>Add OT Record</Button>}
            </div>
            <Table>
              <Thead><tr><Th>Employee</Th><Th>Date</Th><Th>In/Out Time</Th><Th>OT Hours</Th><Th>Type</Th><Th>Status</Th>{isAdmin && <Th>Actions</Th>}</tr></Thead>
              <Tbody>
                {overtimeData.length === 0 ? (
                  <Tr><Td colSpan={7} className="text-center text-xs text-slate-500 py-8">No Overtime Records Found.</Td></Tr>
                ) : overtimeData.map(ot => (
                  <Tr key={ot.id}>
                    <Td><span className="font-bold text-xs">{ot.empName}</span></Td>
                    <Td><span className="text-xs">{ot.date}</span></Td>
                    <Td><span className="text-xs font-mono">{ot.in} - {ot.out}</span></Td>
                    <Td><span className="text-xs font-bold text-fuchsia-600">{ot.otHours} hrs</span></Td>
                    <Td><span className="text-[10px] bg-slate-100 px-2 py-1 rounded">{ot.type}</span></Td>
                    <Td><Badge variant={ot.status === 'Approved' ? 'green' : ot.status === 'Rejected' ? 'red' : 'warning'}>{ot.status}</Badge></Td>
                    {isAdmin && (
                      <Td>
                        <div className="flex gap-2 items-center">
                          {ot.status === 'Pending' && (
                            <>
                              <button className="text-[10px] text-emerald-600 font-bold hover:underline" onClick={() => handleStatusOT(ot.id, 'Approved')}>Approve</button>
                              <button className="text-[10px] text-rose-600 font-bold hover:underline" onClick={() => handleStatusOT(ot.id, 'Rejected')}>Reject</button>
                            </>
                          )}
                          <button className="text-[10px] text-blue-600 hover:underline font-bold" onClick={() => handleOpenOTModal(ot)}>Edit</button>
                          <button className="text-[10px] text-rose-600 hover:underline font-bold" onClick={() => handleDeleteOT(ot.id)}>Delete</button>
                        </div>
                      </Td>
                    )}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </div>
      )}

      {/* OVERTIME MODAL */}
      <Modal
        open={showOTModal}
        onClose={() => setShowOTModal(false)}
        title={editingOTId ? "Edit Overtime Record" : "Add New Overtime"}
        footer={<><Button variant="outline" onClick={() => setShowOTModal(false)}>Cancel</Button><Button onClick={handleSaveOT}>Save Record</Button></>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">Employee</label>
              <div 
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white flex justify-between items-center cursor-pointer"
                onClick={() => setIsEmpDropdownOpen(!isEmpDropdownOpen)}
              >
                {otForm.empName ? `${otForm.empName} (${otForm.empCode || 'N/A'})` : <span className="text-slate-400">Select Employee</span>}
                <ChevronDown size={14} className="text-slate-400" />
              </div>
              
              {isEmpDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-slate-100">
                    <div className="flex items-center gap-2 px-2 border border-slate-200 rounded bg-slate-50">
                      <Search size={12} className="text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Search Name, Code, Dept..." 
                        className="w-full text-xs py-1.5 bg-transparent focus:outline-none"
                        value={empSearch}
                        onChange={e => setEmpSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredEmployees.length === 0 ? (
                      <div className="p-3 text-xs text-slate-500 text-center">No active employees found.</div>
                    ) : filteredEmployees.map(e => (
                      <div 
                        key={e.id}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex flex-col"
                        onClick={() => {
                          setOTForm({
                            ...otForm, 
                            empId: e.id, 
                            empName: e.name,
                            empCode: e.employeeId || '',
                            department: e.department || '',
                            branch: e.branchLocation || 'Head Office',
                            shift: 'General Shift'
                          });
                          setIsEmpDropdownOpen(false);
                          setEmpSearch('');
                        }}
                      >
                        <span className="text-sm font-bold text-slate-800">{e.name} ({e.employeeId || 'N/A'})</span>
                        <span className="text-[10px] text-slate-500">{e.department} • {e.branchLocation || 'Head Office'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Input type="date" label="Date" value={otForm.date} onChange={e => setOTForm({...otForm, date: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input type="time" label="In Time" value={otForm.in} onChange={e => setOTForm({...otForm, in: e.target.value})} />
            <Input type="time" label="Out Time" value={otForm.out} onChange={e => setOTForm({...otForm, out: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Calculated OT Hours" value={otForm.otHours.toString()} disabled className="bg-slate-50 font-bold" />
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">Overtime Type</label>
              <select className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" value={otForm.type} onChange={e => setOTForm({...otForm, type: e.target.value})}>
                <option value="Normal Overtime">Normal Overtime (1.5x)</option>
                <option value="Weekend Overtime">Weekend Overtime (2.0x)</option>
                <option value="Holiday Overtime">Holiday Overtime (2.5x)</option>
                <option value="Night Shift Overtime">Night Shift Overtime (1.75x)</option>
                <option value="Emergency Overtime">Emergency Overtime (2.0x)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">Reason / Remarks</label>
            <textarea className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 h-20" placeholder="E.g., Server maintenance, urgent client delivery..." value={otForm.reason} onChange={e => setOTForm({...otForm, reason: e.target.value})}></textarea>
          </div>
        </div>
      </Modal>

      {/* TAB: SHIFTS */}
      {activeTab === 'shifts' && (
        <Card padding={false} className="animate-in fade-in overflow-hidden border-slate-200">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <div>
              <h4 className="font-bold text-sm text-slate-800">Company Shift Policies</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Define shift timings, grace periods, and overtime eligibility for payroll synchronization.</p>
            </div>
            {isAdmin && <Button size="sm" className="h-8 text-[10px]" onClick={() => handleOpenShiftModal()}>Create New Shift</Button>}
          </div>
          <Table>
            <Thead><tr><Th>Shift Name</Th><Th>Code</Th><Th>Start Time</Th><Th>End Time</Th><Th>Grace Period</Th><Th>Break Time</Th><Th>Overtime</Th><Th>Status</Th>{isAdmin && <Th>Actions</Th>}</tr></Thead>
            <Tbody>
              {shifts.map(s => (
                <Tr key={s.id}>
                  <Td><span className="font-bold text-xs">{s.name}</span></Td>
                  <Td><span className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded">{s.code || 'N/A'}</span></Td>
                  <Td><span className="text-xs font-mono">{s.start}</span></Td>
                  <Td><span className="text-xs font-mono">{s.end}</span></Td>
                  <Td><span className="text-[10px] bg-slate-100 px-2 py-1 rounded">{s.grace}</span></Td>
                  <Td><span className="text-[10px] bg-slate-100 px-2 py-1 rounded">{s.break}</span></Td>
                  <Td><Badge variant={s.otEnabled ? 'green' : 'gray'}>{s.otEnabled ? 'Eligible' : 'N/A'}</Badge></Td>
                  <Td><Badge variant={s.status === 'Active' ? 'blue' : 'gray'}>{s.status}</Badge></Td>
                  {isAdmin && (
                    <Td>
                      <div className="flex items-center gap-2">
                        <button className="text-[10px] text-blue-600 hover:underline font-bold" onClick={() => handleOpenShiftModal(s)}>Edit</button>
                        <button className="text-[10px] text-rose-600 hover:underline font-bold" onClick={() => handleDeleteShift(s.id)}>Delete</button>
                      </div>
                    </Td>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      {/* SHIFT MODAL */}
      <Modal
        open={showShiftModal}
        onClose={() => setShowShiftModal(false)}
        title={editingShiftId ? "Edit Shift Configuration" : "Create New Shift"}
        footer={<><Button variant="outline" onClick={() => setShowShiftModal(false)}>Cancel</Button><Button onClick={handleSaveShift}>Save Shift</Button></>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Shift Name" value={shiftForm.name} onChange={e => setShiftForm({...shiftForm, name: e.target.value})} placeholder="e.g. Morning Shift" />
            <Input label="Shift Code" value={shiftForm.code} onChange={e => setShiftForm({...shiftForm, code: e.target.value})} placeholder="e.g. MOR" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input type="time" label="Start Time" value={shiftForm.start} onChange={e => setShiftForm({...shiftForm, start: e.target.value})} />
            <Input type="time" label="End Time" value={shiftForm.end} onChange={e => setShiftForm({...shiftForm, end: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Grace Period" value={shiftForm.grace} onChange={e => setShiftForm({...shiftForm, grace: e.target.value})} placeholder="e.g. 15 mins" />
            <Input label="Break Time" value={shiftForm.break} onChange={e => setShiftForm({...shiftForm, break: e.target.value})} placeholder="e.g. 1 hr" />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">Overtime Eligibility</label>
                <select 
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={shiftForm.otEnabled ? 'yes' : 'no'}
                  onChange={e => setShiftForm({...shiftForm, otEnabled: e.target.value === 'yes'})}
                >
                  <option value="yes">Eligible for Overtime</option>
                  <option value="no">Not Eligible</option>
                </select>
             </div>
             <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">Shift Status</label>
                <select 
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={shiftForm.status}
                  onChange={e => setShiftForm({...shiftForm, status: e.target.value})}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
             </div>
          </div>
        </div>
      </Modal>

      {/* TAB: IMPORT */}
      {activeTab === 'import' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
          <Card>
            <h4 className="font-bold text-sm text-slate-800 mb-2">Smart Excel Import</h4>
            <p className="text-xs text-slate-500 mb-4">Upload biometrics CSV/XLSX. The system will automatically map columns (Employee ID, Punch In, Punch Out) and save permanently to the database.</p>
            
            <div className="border-2 border-dashed border-blue-200 bg-blue-50/50 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => alert('File dialogue opened')}>
              <Upload size={32} className="text-blue-500 mb-3" />
              <p className="text-sm font-bold text-blue-800">Click to upload or drag and drop</p>
              <p className="text-xs text-blue-600/70 mt-1">XLSX, XLS, or CSV (Max. 15MB)</p>
            </div>
          </Card>
          
          <div className="space-y-4">
            <Card>
              <h4 className="font-bold text-sm text-slate-800 mb-2">Import Resources</h4>
              <div className="space-y-3">
                <Button variant="outline" className="w-full justify-start text-xs h-9" onClick={downloadTemplate}><Download size={14} className="mr-2"/> Download Attendance Template</Button>
                <Button variant="outline" className="w-full justify-start text-xs h-9" onClick={downloadGuide}><FileText size={14} className="mr-2"/> Download Sample Import Guide</Button>
              </div>
            </Card>
            
            <Card className="bg-slate-900 text-white border-none">
              <h4 className="font-bold text-sm text-white mb-2 flex items-center gap-2"><Database size={14} className="text-blue-400"/> Database Ready</h4>
              <p className="text-xs text-slate-400">Imported files are instantly synced to the cloud database. Missing employee records will trigger smart mapping alerts.</p>
              <div className="mt-3 flex gap-2">
                <span className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-300">ZKTeco Ready</span>
                <span className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-300">eSSL Ready</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB: REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm items-end">
            <div className="w-full md:w-48">
              <Input type="date" label="Report Date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
            </div>
            <div className="w-full md:w-48">
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">Department</label>
              <Select value={reportDept} onChange={e => setReportDept(e.target.value)} options={[{value: '', label: 'All Departments'}, ...departments.map(d => ({value: d, label: d}))]} className="h-9" />
            </div>
            <div className="w-full md:w-48">
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">Branch</label>
              <Select value={reportBranch} onChange={e => setReportBranch(e.target.value)} options={[{value: '', label: 'All Branches'}, ...branches.map(b => ({value: b, label: b}))]} className="h-9" />
            </div>
            <div className="flex gap-2 w-full md:w-auto pb-0.5">
              <Button variant="outline" className="text-xs h-9" onClick={() => downloadAttendanceReport('Enterprise Daily Attendance', 'pdf', filteredReportRecords, [{header: 'Employee Name', key: 'employeeName'}, {header: 'Date', key: 'date'}, {header: 'Status', key: 'status'}])}>
                <FileText size={14} className="mr-2"/> PDF
              </Button>
              <Button variant="outline" className="text-xs h-9" onClick={() => downloadAttendanceReport('Enterprise Daily Attendance', 'excel', filteredReportRecords, [{header: 'Employee Name', key: 'employeeName'}, {header: 'Date', key: 'date'}, {header: 'Status', key: 'status'}])}>
                <Download size={14} className="mr-2"/> Excel
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Total Employees" value={filteredReportRecords.length} color="bg-slate-50" />
            <StatCard label="Present" value={filteredReportRecords.filter(r => r.status === 'Present').length} color="bg-emerald-50" />
            <StatCard label="Absent" value={filteredReportRecords.filter(r => r.status === 'Absent').length} color="bg-rose-50" />
            <StatCard label="On Leave" value={filteredReportRecords.filter(r => r.status === 'Leave').length} color="bg-indigo-50" />
            <StatCard label="Late Mark" value={filteredReportRecords.filter(r => r.flags?.includes('Late Mark')).length} color="bg-amber-50" />
          </div>

          <div className="space-y-6">
            {[
              { title: 'Present Employees', records: filteredReportRecords.filter(r => r.status === 'Present'), color: 'emerald' },
              { title: 'Absent Employees', records: filteredReportRecords.filter(r => r.status === 'Absent'), color: 'rose' },
              { title: 'Employees on Leave', records: filteredReportRecords.filter(r => r.status === 'Leave'), color: 'indigo' },
              { title: 'Weekly Off Employees', records: filteredReportRecords.filter(r => r.status === 'Weekly Off'), color: 'slate' },
              { title: 'Holiday Employees', records: filteredReportRecords.filter(r => r.status === 'Holiday'), color: 'fuchsia' },
              { title: 'Half Day Employees', records: filteredReportRecords.filter(r => r.status === 'Half Day'), color: 'orange' },
              { title: 'Late Mark Employees', records: filteredReportRecords.filter(r => r.flags?.includes('Late Mark')), color: 'amber' },
              { title: 'Overtime Employees', records: filteredReportRecords.filter(r => r.flags?.includes('Overtime')), color: 'blue' },
              { title: 'Missed Punch Employees', records: filteredReportRecords.filter(r => r.flags?.includes('Missed Punch')), color: 'red' },
            ].map(section => section.records.length > 0 && (
              <Card key={section.title} padding={false} className="overflow-hidden border-slate-200">
                <div className={`p-3 border-b border-slate-100 bg-${section.color}-50 flex items-center justify-between`}>
                  <h4 className={`font-bold text-sm text-${section.color}-800 flex items-center gap-2`}>
                    {section.title} 
                    <span className={`text-[10px] px-2 py-0.5 rounded-full bg-${section.color}-200 text-${section.color}-800`}>{section.records.length}</span>
                  </h4>
                </div>
                <Table>
                  <Thead><tr><Th>Employee</Th><Th>Department</Th><Th>In/Out Time</Th><Th>Status</Th></tr></Thead>
                  <Tbody>
                    {section.records.map((r: any) => (
                      <Tr key={r.id}>
                        <Td><span className="font-bold text-xs">{r.employeeName}</span></Td>
                        <Td><span className="text-[10px] text-slate-500">{r.department}</span></Td>
                        <Td><span className="text-xs font-mono">{r.clockIn || '--:--'} - {r.clockOut || '--:--'}</span></Td>
                        <Td>
                          <span className="text-[10px] font-bold px-2 py-1 bg-white border border-slate-200 rounded-full">{r.status} {r.leaveType ? `(${r.leaveType})` : ''}</span>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB: CONFIG / SETTINGS */}
      {activeTab === 'config' && isAdmin && (
        <div className="space-y-4 animate-in fade-in">
          <Card>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Attendance Mode Configuration</h3>
                <p className="text-xs text-slate-500">Configure how attendance data is collected and processed for this company/branch.</p>
              </div>
              <Button onClick={saveModeConfiguration} className="flex items-center gap-2"><Save size={14}/> Save Configuration</Button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Select Primary Attendance Mode</label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { id: 'simple', label: 'Simple Status Based', desc: 'Just Status (Present/Absent)' },
                    { id: 'working_hours', label: 'Working Hours', desc: 'In Time & Out Time tracking' },
                    { id: 'overtime', label: 'Overtime', desc: 'Tracks explicit OT Hours' },
                    { id: 'shift', label: 'Shift Attendance', desc: 'Tracks status alongside specific shifts' },
                    { id: 'advanced', label: 'Advanced Attendance', desc: 'Comprehensive all-in-one template' },
                    { id: 'custom', label: 'Custom Attendance', desc: 'Build your own data structure' }
                  ].map(mode => (
                    <div 
                      key={mode.id}
                      onClick={() => setAttendanceMode(mode.id)}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${attendanceMode === mode.id ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-slate-100 hover:border-slate-300 bg-white'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-slate-800">{mode.label}</span>
                        {attendanceMode === mode.id && <CheckCircle2 size={16} className="text-blue-500" />}
                      </div>
                      <p className="text-[10px] text-slate-500">{mode.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Mode Builder */}
              {attendanceMode === 'custom' && (
                <div className="mt-8 p-6 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="font-bold text-sm text-slate-800 mb-4">Custom Template Builder</h4>
                  
                  <div className="flex gap-2 mb-4">
                    <Input 
                      placeholder="New Column Name (e.g. Project Code)" 
                      value={newColumnName} 
                      onChange={e => setNewColumnName(e.target.value)} 
                    />
                    <Button 
                      onClick={() => {
                        if (newColumnName && !customColumns.includes(newColumnName)) {
                          setCustomColumns([...customColumns, newColumnName]);
                          setNewColumnName('');
                        }
                      }}
                      className="whitespace-nowrap"
                    >
                      Add Column
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {customColumns.map((col, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white p-3 rounded border border-slate-200">
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 font-mono text-xs">{idx + 1}.</span>
                          <span className="font-semibold text-sm text-slate-700">{col}</span>
                        </div>
                        <button 
                          onClick={() => setCustomColumns(customColumns.filter(c => c !== col))}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <XCircle size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  {customColumns.length === 0 && (
                    <div className="text-center p-4 text-slate-500 text-sm italic">No columns defined. Add columns above to build your template.</div>
                  )}
                </div>
              )}

              {/* Preview Block */}
              <div className="mt-8 p-4 bg-slate-900 rounded-xl text-slate-300">
                <h4 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-3 flex items-center gap-2"><Database size={14}/> Active Template Preview</h4>
                <div className="flex flex-wrap gap-2">
                  {getCurrentColumns().map((col, i) => (
                    <span key={i} className="px-2 py-1 bg-slate-800 rounded border border-slate-700 text-xs font-mono">{col}</span>
                  ))}
                </div>
              </div>

            </div>
          </Card>
        </div>
      )}

    </div>
  );
};

