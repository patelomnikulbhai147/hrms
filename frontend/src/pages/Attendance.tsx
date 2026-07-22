import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, CheckCircle2, XCircle, Clock, Filter, Upload, Download, Settings, Users, Calendar, Table as TableIcon, FileText, Database, AlertCircle, Save, ChevronDown, ChevronLeft, ChevronRight, Activity, Building2, BarChart3 as BarChart3Icon, Send, Printer, X, Loader2, Check } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend } from 'recharts';
import { type Employee, type AttendanceRecord, type LeaveRequest, type Role, type Company, isCompanyIdMatch, buildScopedEmployeeIdSet, isRecordInWorkspace } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Card, StatCard } from '@/components/ui/Card';
import { Paginated } from '@/components/ui/Paginated';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { getUniqueEmployees } from '@/utils/deduplication';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import { byEmployeeCode } from '@/utils/employeeSort';
import { isActiveEmployee } from '@/utils/employeeStatus';
import { usePermissions } from '@/context/PermissionContext';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { downloadImportGuidePDF, downloadAttendanceReport, exportAttendanceDataset, type ExportFormat } from '@/utils/attendanceExportUtils';
import { attendanceSheetExportColumns } from '@/utils/attendanceSchema';
import { formatDateHeader, statusToCode, MON } from '@/utils/attendanceMatrix';
import { downloadAttendanceMatrix, type MatrixData, type MatrixEmployeeRow } from '@/utils/attendanceMatrixExport';
import {
  type PeriodMode, getPeriodRange, eachDateInRange, resolveStatus, statusCode, bucketOf,
  summarizeEmployeePeriod, summarizeYear,
} from '@/utils/attendancePeriods';
import { AnimatedCounter } from '@/components/common/AnimatedCounter';
import { ui } from '@/components/ui/feedback';
import { AttendanceSheetImport } from '@/components/attendance/AttendanceSheetImport';
interface AttendanceCenterProps {
  role: Role;
  activeCompanyId: string;
  attendance: AttendanceRecord[];
  onUpdateAttendance: (attendance: AttendanceRecord[]) => void;
  employees: Employee[];
  companies: Company[];
  leaves?: LeaveRequest[];
  onRefresh?: () => void;
  /** Navigate to another module — used to open the Attendance Synchronization page. */
  onNavigate?: (page: string) => void;
}

// "Today" in the app/server timezone (Asia/Kolkata), NOT UTC — otherwise, in the
// early-morning IST window, a UTC date would read as yesterday and wrongly block
// the real current day. The server enforces the same cap independently as the
// authority; this is the client-side max selectable attendance date.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const ATTENDANCE_STATUS_OPTIONS = [
  'Present', 'Absent', 'Half Day', 'Weekly Off', 'Holiday',
  'Leave', 'Work From Home', 'On Duty'
];

// The exact set of statuses offered when editing a Weekly Attendance cell. The
// `value` is the stored status (must match resolveStatus/bucketOf); the label
// shows the short code. Any current status can be changed to any of these.
const WEEKLY_CELL_STATUSES: { value: string; label: string; dot: string }[] = [
  { value: 'Present', label: 'Present (P)', dot: 'bg-emerald-500' },
  { value: 'Absent', label: 'Absent (A)', dot: 'bg-rose-500' },
  { value: 'Leave', label: 'Leave (L)', dot: 'bg-brand-500' },
  { value: 'Half Day', label: 'Half Day (HD)', dot: 'bg-orange-500' },
  { value: 'Work From Home', label: 'Work From Home (WFH)', dot: 'bg-brand-500' },
  { value: 'Holiday', label: 'Holiday (H)', dot: 'bg-gray-400' },
  { value: 'Weekly Off', label: 'Weekly Off (WO)', dot: 'bg-slate-300' },
];

/** Audiences the Broadcast panel can address. Mirrors the server's resolver. */
type BroadcastAudience = 'all' | 'branch' | 'role' | 'department' | 'employee';
/** Kept in step with MAX_MESSAGE in notificationController.broadcast. */
const BROADCAST_MAX = 2000;

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
  leaves = [],
  onRefresh,
  onNavigate
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard'|'entry'|'overtime'|'shifts'|'import'|'reports'|'config'>('dashboard');
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Report Filters
  const [reportDept, setReportDept] = useState('');
  const [reportBranch, setReportBranch] = useState('');

  // ── Enterprise period + filters (drive Weekly/Monthly/Yearly/Custom views) ──
  const [periodMode, setPeriodMode] = useState<PeriodMode>('daily');
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterDesignation, setFilterDesignation] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');

  // ── Future-date policy (enterprise rule) ────────────────────────────────────
  // Attendance can NEVER be marked for a date after today, UNLESS the company has
  // explicitly enabled future scheduling in the Config tab (default OFF), bounded
  // by a Maximum Future Days window. `today` is derived from the real clock — no
  // hardcoded dates. The server enforces the same rule independently (defence in
  // depth); this state only drives the read-only UI + the allowance we send along.
  const [futurePolicy, setFuturePolicy] = useState<{ allow: boolean; maxDays: number }>(() => {
    try {
      const raw = localStorage.getItem(`hrms_attendance_future_${activeCompanyId}`);
      if (raw) { const p = JSON.parse(raw); return { allow: !!p.allow, maxDays: Math.max(0, Math.min(30, Number(p.maxDays) || 0)) }; }
    } catch { /* fall through to default */ }
    return { allow: false, maxDays: 0 };
  });
  const updateFuturePolicy = (patch: Partial<{ allow: boolean; maxDays: number }>) => {
    setFuturePolicy(prev => {
      const next = { allow: patch.allow ?? prev.allow, maxDays: Math.max(0, Math.min(30, patch.maxDays ?? prev.maxDays)) };
      try { localStorage.setItem(`hrms_attendance_future_${activeCompanyId}`, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };
  // Latest date a user may edit: today, or today + N when future scheduling is on.
  const maxEditableDate = useMemo(() => {
    if (!futurePolicy.allow || futurePolicy.maxDays <= 0) return today;
    const d = new Date(today); d.setDate(d.getDate() + futurePolicy.maxDays);
    return d.toISOString().split('T')[0];
  }, [futurePolicy]);
  // A date is locked (read-only) when it is after the latest editable date.
  const isFutureLocked = (date: string) => !!date && date > maxEditableDate;
  // Allowance echoed to the server so it applies the identical rule (0 = none).
  const futureDaysParam = futurePolicy.allow ? futurePolicy.maxDays : 0;

  // Export modal
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<PeriodMode>('monthly');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel');
  const [exportScope, setExportScope] = useState<'all'|'company'|'multiple'|'branch'|'department'|'individual'>('all');
  const [exportCompanyIds, setExportCompanyIds] = useState<string[]>([]);

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
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [shiftForm, setShiftForm] = useState({
    name: '', code: '', start: '', end: '', grace: '15 mins', breakTime: '1 hr', otEnabled: true, status: 'Active'
  });
  // Shift roster assignment modal
  const [assignShift, setAssignShift] = useState<any | null>(null);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [assignBusy, setAssignBusy] = useState(false);

  // OT DB State
  const [overtimeData, setOvertimeData] = useState<any[]>([]);

  const [attendanceAnalytics, setAttendanceAnalytics] = useState<any>(null);

  // DB-backed monthly attendance summaries (the materialized roll-up payroll reads).
  // The single source of truth is the raw `attendance` table; this summary is its
  // per-month materialization, recomputed from raw attendance and overlaid on the
  // Monthly grid so a saved correction shows immediately.
  const [dbSummaries, setDbSummaries] = useState<Record<string, any>>({});
  const [summaryRefresh, setSummaryRefresh] = useState(0);
  const SUMMARY_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // Summary month/year follow the VIEWED date. (Previously hardcoded to June 2026,
  // so the monthly Edit always targeted June and other months never refreshed.)
  const summaryDate = new Date(selectedDate);
  const SUMMARY_MONTH = SUMMARY_MONTH_NAMES[isNaN(summaryDate.getTime()) ? new Date().getMonth() : summaryDate.getMonth()];
  const SUMMARY_YEAR = isNaN(summaryDate.getTime()) ? new Date().getFullYear() : summaryDate.getFullYear();
  const loadSummaries = () => api.attendanceSummary.getAll(SUMMARY_MONTH, SUMMARY_YEAR)
    .then((rows: any[]) => {
      const map: Record<string, any> = {};
      (rows || []).forEach(r => { map[String(r.employeeId)] = r; });
      setDbSummaries(map);
    }).catch(() => {});

  useEffect(() => {
    if (activeCompanyId) {
      api.shifts.getAll()
        .then(res => { setShifts(Array.isArray(res) ? res : []); setShiftError(null); })
        .catch(e => { console.error("Failed to load shifts", e); setShiftError(e?.message || 'Failed to load shifts.'); });
      api.overtime.getAll().then(res => setOvertimeData(res)).catch(e => console.error("Failed to load overtime", e));
      api.attendance.getAnalytics(activeCompanyId, today).then(res => setAttendanceAnalytics(res)).catch(console.error);
      loadSummaries();
    }
    // selectedDate is included so the summary reloads when the viewed month changes.
  }, [activeCompanyId, attendance, leaves, employees, summaryRefresh, SUMMARY_MONTH, SUMMARY_YEAR]);

  // ── Edit Attendance (monthly summary) modal ──
  const [editSummary, setEditSummary] = useState<any | null>(null);
  const [summaryForm, setSummaryForm] = useState<any>({ presentDays: 0, absentDays: 0, cl: 0, pl: 0, sl: 0, lwp: 0, halfDays: 0, otHours: 0, shift: '' });
  const [savingSummary, setSavingSummary] = useState(false);

  const openEditSummary = async (employeeId: any, employeeName: string, employeeCode: string) => {
    const s = dbSummaries[String(employeeId)];
    if (!s) { await ui.alert({ message: 'No attendance summary on file for this employee yet. Run "Sync to Payroll" first.' }); return; }
    setEditSummary({ ...s, employeeName, employeeCode });
    setSummaryForm({
      presentDays: s.presentDays ?? 0, absentDays: s.absentDays ?? 0, cl: s.cl ?? 0, pl: s.pl ?? 0,
      sl: s.sl ?? 0, lwp: s.lwp ?? 0, halfDays: s.halfDays ?? 0, otHours: s.otHours ?? 0, shift: s.shift ?? '',
    });
  };

  const payablePreview = (() => {
    const f = summaryForm;
    return Math.round((Number(f.presentDays) + Number(f.halfDays) * 0.5 + Number(f.cl) + Number(f.pl) + Number(f.sl)) * 100) / 100;
  })();

  const saveSummary = async () => {
    if (!editSummary) return;
    setSavingSummary(true);
    const payload = {
      presentDays: Number(summaryForm.presentDays), absentDays: Number(summaryForm.absentDays),
      cl: Number(summaryForm.cl), pl: Number(summaryForm.pl), sl: Number(summaryForm.sl),
      lwp: Number(summaryForm.lwp), halfDays: Number(summaryForm.halfDays), otHours: Number(summaryForm.otHours),
      shift: summaryForm.shift,
    };
    // ── Debug: log record BEFORE update + the payload being sent ──
    console.debug('[Attendance] saveSummary BEFORE', { id: editSummary.id, employee: editSummary.employeeName, before: editSummary, payload });
    try {
      const dbRes = await api.attendanceSummary.update(editSummary.id, payload);
      // ── Debug: log DB response + value-match check ──
      console.debug('[Attendance] saveSummary DB RESPONSE', dbRes);
      console.debug('[Attendance] saveSummary AFTER (UI overlay will show)', { matches: dbRes && Number(dbRes.presentDays) === payload.presentDays });
      setEditSummary(null);
      setSummaryRefresh(x => x + 1);   // reloads dbSummaries → Monthly overlay reflects immediately
      onRefresh?.();                   // refresh app data so dashboard/reports/payroll reflect it with no manual step
      ui.toast.success('Attendance updated. Payroll, dashboard and reports have been recalculated automatically.');
    } catch (e: any) {
      console.error('[Attendance] saveSummary FAILED', e);
      ui.toast.error(e?.message || 'Failed to save attendance summary.');
    } finally {
      setSavingSummary(false);
    }
  };
  
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
  const activeUniqueEmployees = uniqueEmployees.filter(isActiveEmployee).sort(byEmployeeCode(e => e.employeeId));
  const filteredEmployees = activeUniqueEmployees.filter(e => 
    e.name.toLowerCase().includes(empSearch.toLowerCase()) || 
    (e.employeeId && e.employeeId.toLowerCase().includes(empSearch.toLowerCase())) ||
    (e.department && e.department.toLowerCase().includes(empSearch.toLowerCase()))
  );

  const departments = Array.from(new Set(activeUniqueEmployees.map(e => e.department).filter(Boolean)));
  const branches = Array.from(new Set(activeUniqueEmployees.map(e => e.branchLocation).filter((b): b is string => Boolean(b))));
  const designations = Array.from(new Set(activeUniqueEmployees.map(e => (e as any).designation as string).filter((d): d is string => Boolean(d))));

  // ── Broadcast & Notification ───────────────────────────────────────────────
  // The audience choice drives which second selector appears; the server
  // re-resolves the audience itself and re-checks the workspace, so nothing here
  // is trusted for authorisation.
  const [bcAudience, setBcAudience] = useState<BroadcastAudience>('all');
  const [bcTarget, setBcTarget] = useState('');
  const [bcMessage, setBcMessage] = useState('');
  const [bcSending, setBcSending] = useState(false);

  // Branches of the ACTIVE workspace. `companies` carries branches merged in
  // (they are the entries with a parentCompanyId), so this needs no extra fetch.
  const workspaceBranches = useMemo(
    () => (companies as any[]).filter(c => c.parentCompanyId && String(c.parentCompanyId) === String(activeCompanyId)),
    [companies, activeCompanyId],
  );

  const bcTargetOptions = useMemo(() => {
    if (bcAudience === 'branch') return workspaceBranches.map(b => ({ value: String(b.id), label: b.branchName || b.name }));
    if (bcAudience === 'role') return ['HR', 'Company Head', 'Employee'].map(r => ({ value: r, label: r }));
    if (bcAudience === 'department') return departments.map(d => ({ value: d, label: d }));
    if (bcAudience === 'employee') return activeUniqueEmployees.map(e => ({ value: String(e.id), label: `${e.name}${e.employeeId ? ` (${e.employeeId})` : ''}` }));
    return [];
  }, [bcAudience, workspaceBranches, departments, activeUniqueEmployees]);

  const dispatchBroadcast = async () => {
    const message = bcMessage.trim();
    if (!message) { ui.toast.warning('Type a message to broadcast.'); return; }
    if (bcAudience !== 'all' && !bcTarget) { ui.toast.warning('Choose who should receive this.'); return; }

    setBcSending(true);
    try {
      const payload: any = { message, audience: bcAudience, companyId: activeCompanyId };
      if (bcAudience === 'branch') payload.branchId = bcTarget;
      if (bcAudience === 'role') payload.role = bcTarget;
      if (bcAudience === 'department') payload.department = bcTarget;
      if (bcAudience === 'employee') payload.employeeId = bcTarget;

      const res: any = await api.notifications.broadcast(payload);

      // Only clear the form once the server confirms the rows were committed —
      // the success message must never run ahead of the database write.
      setBcMessage('');
      setBcTarget('');
      ui.toast.success(
        `Broadcast sent to ${res?.recipients ?? 0} recipient${res?.recipients === 1 ? '' : 's'}${res?.audience ? ` — ${res.audience}` : ''}.`,
      );
      // Refresh the bell now instead of waiting out the 20s poll.
      window.dispatchEvent(new CustomEvent('hrms:notifications-changed'));
    } catch (err: any) {
      ui.toast.error(getApiErrorMessage(err, 'Could not send the broadcast.'));
    } finally {
      setBcSending(false);
    }
  };

  // Company options for the Company / Multiple-company filters and export scope.
  const companyOptions = useMemo(() => {
    const ids = Array.from(new Set(activeUniqueEmployees.map(e => e.companyId).filter(Boolean)));
    return ids.map(id => ({ value: id, label: companies.find(c => c.id === id)?.name || id }));
  }, [activeUniqueEmployees, companies]);

  // Employees after applying the enterprise filter bar (shared by all period views).
  const periodEmployees = useMemo(() => {
    let list = activeUniqueEmployees;
    if (filterCompany) list = list.filter(e => e.companyId === filterCompany || e.branchId === filterCompany || isCompanyIdMatch(e.companyId, filterCompany, companies, e.branchLocation, e.branchId));
    if (filterBranch) list = list.filter(e => (e.branchLocation || 'Head Office') === filterBranch);
    if (filterDept) list = list.filter(e => e.department === filterDept);
    if (filterDesignation) list = list.filter(e => (e as any).designation === filterDesignation);
    if (filterEmployee) list = list.filter(e => String(e.id) === String(filterEmployee));
    return list;
  }, [activeUniqueEmployees, filterCompany, filterBranch, filterDept, filterDesignation, filterEmployee, companies]);

  // Active period range + the dates it spans.
  const period = useMemo(() => getPeriodRange(periodMode, selectedDate, customStart, customEnd), [periodMode, selectedDate, customStart, customEnd]);
  const periodDates = useMemo(() => eachDateInRange(period.start, period.end), [period]);

  // Pagination reset key — every table paginates 15/page and jumps back to page 1
  // whenever any filter / search / date / period / company / branch changes.
  const attnFilterKey = `${filterCompany}|${filterBranch}|${filterDept}|${filterDesignation}|${filterEmployee}|${selectedDate}|${periodMode}|${customStart}|${customEnd}|${search}|${statusFilter}`;

  // Per-employee summary across the active period (Monthly / Custom / Weekly totals).
  // Always computed LIVE from the raw `attendance` source of truth, so every field
  // (Present/Absent/Leave/Half/WFH/Holiday/WeeklyOff/OT/WorkDays/LOP/Payable) recalcs
  // the instant any day is edited in Daily or Weekly — no manual refresh needed.
  const periodSummaries = useMemo(
    () => periodEmployees.map(e => summarizeEmployeePeriod(e, periodDates, attendance, leaves, overtimeData)),
    [periodEmployees, periodDates, attendance, leaves, overtimeData]
  );

  // Monthly display rows = live computed roll-up, with a saved payroll override
  // (dbSummaries, edited via the Monthly "Edit" modal) overlaid when present. This
  // makes a saved correction reflect immediately while leaving every non-overridden
  // employee fully live from raw attendance. `adjusted` flags an overlaid row.
  const monthlyDisplaySummaries = useMemo(() => {
    if (periodMode !== 'monthly') return periodSummaries;
    return periodSummaries.map(s => {
      const stored = dbSummaries[String(s.employeeId)];
      if (!stored) return s;
      const present = Number(stored.presentDays ?? s.present);
      const absent = Number(stored.absentDays ?? s.absent);
      const leave = Number((stored.cl ?? 0) + (stored.pl ?? 0) + (stored.sl ?? 0)) || s.leave;
      const half = Number(stored.halfDays ?? s.half);
      const lwp = Number(stored.lwp ?? 0);
      const otHours = Number(stored.otHours ?? s.otHours);
      return {
        ...s,
        present, absent, leave, half, otHours,
        lop: absent + lwp,
        payableDays: Math.round((present + half * 0.5 + leave + s.weeklyOff + s.holiday + s.wfh) * 100) / 100,
        adjusted: true,
      } as typeof s & { adjusted?: boolean };
    });
  }, [periodMode, periodSummaries, dbSummaries]);

  // Yearly 12-month aggregate for the analytics view.
  const yearlyData = useMemo(
    () => periodMode === 'yearly' ? summarizeYear(new Date(selectedDate).getFullYear(), periodEmployees, attendance, leaves, overtimeData) : [],
    [periodMode, selectedDate, periodEmployees, attendance, leaves, overtimeData]
  );

  // The anchor date one period AFTER the current one (used to cap forward nav).
  const nextPeriodAnchor = () => {
    const d = new Date(selectedDate);
    if (periodMode === 'weekly') d.setDate(d.getDate() + 7);
    else if (periodMode === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (periodMode === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };
  // Forward navigation is capped at TODAY: you may view the current day/week/
  // month/year (even if it contains future days), but can never advance to a
  // wholly-future period. True unless the next period would START after today.
  const canGoNext = useMemo(
    () => getPeriodRange(periodMode, nextPeriodAnchor(), customStart, customEnd).start <= today,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodMode, selectedDate, customStart, customEnd]
  );

  // Shift the active date by one period (prev/next navigation). Advancing into
  // the future is refused — the max navigable date is always today.
  const shiftPeriod = (dir: 1 | -1) => {
    if (dir === 1 && !canGoNext) return;
    const d = new Date(selectedDate);
    if (periodMode === 'daily') d.setDate(d.getDate() + dir);
    else if (periodMode === 'weekly') d.setDate(d.getDate() + 7 * dir);
    else if (periodMode === 'monthly') d.setMonth(d.getMonth() + dir);
    else if (periodMode === 'yearly') d.setFullYear(d.getFullYear() + dir);
    else { d.setDate(d.getDate() + dir); }
    const next = d.toISOString().split('T')[0];
    // Final guard: never land the anchor on a future-only period.
    if (dir === 1 && getPeriodRange(periodMode, next, customStart, customEnd).start > today) return;
    setSelectedDate(next);
  };
  // Clamp any date input to today (typed/pasted/URL values can exceed the picker max).
  const clampPast = (v: string) => (v && v > today ? today : v);
  
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
      flags: [] as AttendanceRecord['flags']
    };
  });

  const empCodeById = (eid: any) => activeUniqueEmployees.find(e => String(e.id) === String(eid))?.employeeId || '';
  const filteredRecords = dailyRecords.filter(a => {
    const matchSearch = !search || a.employeeName.toLowerCase().includes(search.toLowerCase()) || a.department.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || a.status === statusFilter;
    return matchSearch && matchStatus;
  }).sort(byEmployeeCode((a: any) => empCodeById(a.employeeId)));

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
    if (isFutureLocked(selectedDate)) { ui.toast.warning('Attendance cannot be marked for future dates.'); return; }
    if (selectedIds.length === 0) { ui.toast.warning('Select employees first.'); return; }
    
    const updatedAttendance = [...attendance];
    
    try {
      await Promise.all(selectedIds.map(async id => {
        const existingIdx = updatedAttendance.findIndex(a => a.id === id);
        if (existingIdx >= 0) {
          const updated = { ...updatedAttendance[existingIdx], status: status as any };
          updatedAttendance[existingIdx] = updated;
          // updated.id is numeric for persisted rows and a "new-…" string only for
          // unsaved ones — coerce so numeric ids don't throw on .startsWith.
          if (!String(updated.id).startsWith('new-')) {
            await api.attendance.update(updated.id, { ...updated, source: 'Daily Attendance', allowFutureDays: futureDaysParam });
          }
        } else {
          // Is new
          const rec = dailyRecords.find(r => r.id === id);
          if (rec) {
             const newRec = { ...rec, id: undefined, status: status as any, source: 'Daily Attendance', allowFutureDays: futureDaysParam };
             const dbRes = await api.attendance.create(newRec);
             updatedAttendance.push(dbRes);
          }
        }
      }));
      onUpdateAttendance(updatedAttendance);
      // Keep the materialized monthly summary + payroll in sync with these raw edits.
      const empIds = Array.from(new Set(selectedIds.map(id => {
        const inAtt = updatedAttendance.find(a => String(a.id) === String(id));
        return inAtt?.employeeId ?? dailyRecords.find(r => r.id === id)?.employeeId;
      }).filter(Boolean)));
      if (empIds.length) recalcSummaryAfterEdit(selectedDate, empIds);
      setSelectedIds([]);
      ui.toast.success(`Bulk action successful! ${selectedIds.length} employees marked as ${status}. Saved to the database.`);
    } catch (e) {
      console.error(e);
      ui.toast.error(getApiErrorMessage(e, 'Could not save attendance to the database.'));
    }
  };

  const handleSingleMark = async (id: string, status: string) => {
    if (!isAdmin) return;
    if (isFutureLocked(selectedDate)) { ui.toast.warning('Attendance cannot be marked for future dates.'); return; }
    const updatedAttendance = [...attendance];
    const existingIdx = updatedAttendance.findIndex(a => a.id === id);

    try {
      if (existingIdx >= 0) {
        const updated = { ...updatedAttendance[existingIdx], status: status as any };
        updatedAttendance[existingIdx] = updated;
        // Coerce: numeric ids (persisted rows) must not throw on .startsWith.
        if (!String(updated.id).startsWith('new-')) {
           await api.attendance.update(updated.id, { ...updated, source: 'Daily Attendance', allowFutureDays: futureDaysParam });
        } else {
           const dbRes = await api.attendance.create({...updated, id: undefined, source: 'Daily Attendance', allowFutureDays: futureDaysParam});
           updatedAttendance[existingIdx] = dbRes;
        }
      } else {
        const rec = dailyRecords.find(r => r.id === id);
        if (rec) {
          const dbRes = await api.attendance.create({ ...rec, id: undefined, status: status as any, source: 'Daily Attendance', allowFutureDays: futureDaysParam });
          updatedAttendance.push(dbRes);
        }
      }
      onUpdateAttendance(updatedAttendance);
      // Keep the materialized monthly summary + payroll in sync with this raw edit.
      const empId = (existingIdx >= 0 ? updatedAttendance[existingIdx]?.employeeId : dailyRecords.find(r => r.id === id)?.employeeId);
      if (empId) recalcSummaryAfterEdit(selectedDate, [empId]);
    } catch (e) {
      console.error(e);
      ui.toast.error(getApiErrorMessage(e, 'Could not save attendance to the database.'));
    }
  };

  // ── Weekly grid editing ─────────────────────────────────────────────────────
  // Weekly is now fully editable like Daily/Monthly. It writes to the SAME raw
  // `attendance` records (single source of truth) via the same create/update API,
  // so a change here reflects instantly in the Daily entry grid and the Monthly
  // summary (both derive from `attendance` via resolveStatus/summarizeEmployeePeriod),
  // and — through the server's payroll-outdated flagging — in Payroll, Overtime,
  // Leave and Reports. Editing is gated on the SAME `isAdmin` rule as Daily so the
  // permission model never differs between views.
  // The open cell editor: which cell + the viewport anchor (rect) so the dropdown
  // renders via a portal at a FIXED position below the clicked cell — never clipped
  // by the table's overflow/scroll containers.
  const [cellMenu, setCellMenu] = useState<{ key: string; emp: any; date: string; status: string; top: number; left: number; anchor: HTMLElement } | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);   // cell currently saving

  // Keyboard support for the status dropdown (Up/Down to move, Esc to close;
  // Enter/Space select via native button behaviour).
  const handleCellMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="option"]'));
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[Math.min(idx + 1, items.length - 1)] || items[0])?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (items[Math.max(idx - 1, 0)] || items[items.length - 1])?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); setCellMenu(null); }
  };

  // Smart popup placement: open below the cell, but FLIP ABOVE when there isn't
  // enough room below, and clamp to the viewport so the menu is never cut off —
  // last-row friendly, like Google Sheets / Excel / Airtable.
  const computeCellMenuPos = (rect: DOMRect) => {
    const MENU_W = 208, MENU_H = 296, MARGIN = 8; // w-52; header + 7 options + padding
    const vw = window.innerWidth, vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom, spaceAbove = rect.top;
    let top = (spaceBelow >= MENU_H + MARGIN || spaceBelow >= spaceAbove)
      ? Math.min(rect.bottom + 6, vh - MENU_H - MARGIN)   // below, clamped to viewport
      : rect.top - MENU_H - 6;                            // flip above
    top = Math.max(MARGIN, top);
    let left = rect.left + rect.width / 2 - MENU_W / 2;   // centred on the cell
    left = Math.min(Math.max(MARGIN, left), vw - MENU_W - MARGIN);
    return { top, left };
  };

  // Keep the fixed-position menu anchored to its cell on scroll/resize: recompute
  // its smart position (re-flipping if needed). Close only if the cell scrolls
  // out of view entirely.
  useEffect(() => {
    if (!cellMenu) return;
    const reposition = () => {
      const a = cellMenu.anchor;
      if (!a || !a.isConnected) { setCellMenu(null); return; }
      const rect = a.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) { setCellMenu(null); return; }
      const pos = computeCellMenuPos(rect);
      setCellMenu(cm => (cm ? { ...cm, top: pos.top, left: pos.left } : cm));
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [cellMenu?.key]);
  const [weeklyMsg, setWeeklyMsg] = useState<string>('');
  const flashWeekly = (m: string) => { setWeeklyMsg(m); window.setTimeout(() => setWeeklyMsg(''), 2800); };

  // Skeleton for an employee/date that has no stored row yet — mirrors the Daily
  // `dailyRecords` synthesis so a first-time mark creates a proper record.
  const buildNewRecord = (emp: any, date: string, status: string) => ({
    companyId: emp.companyId, employeeId: emp.id, employeeName: emp.name,
    department: emp.department, branch: emp.branchLocation || 'Head Office',
    date, clockIn: '', clockOut: '', hoursWorked: 0, status, flags: [] as any[],
    source: 'Weekly Attendance',
  });

  // After a raw-attendance edit, re-materialize that month's summary FROM raw
  // attendance (single source of truth) so the Monthly grid overlay and Payroll
  // stay in lock-step. Best-effort: the live computed views already updated from
  // local state, so this never blocks the UI.
  const recalcSummaryAfterEdit = (dateStr: string, empIds: any[]) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;
    const month = SUMMARY_MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    api.attendanceSummary.recompute({ month, year, companyId: activeCompanyId, employeeIds: empIds })
      .then((res: any) => { console.debug('[Attendance] summary recomputed from raw attendance', { month, year, empIds, res }); setSummaryRefresh(x => x + 1); })
      .catch((err: any) => console.debug('[Attendance] summary recompute skipped:', err?.message));
  };

  const markCell = async (emp: any, date: string, status: string) => {
    if (!isAdmin) return;
    if (isFutureLocked(date)) { setCellMenu(null); ui.toast.warning('Attendance cannot be marked for future dates.'); return; }
    setCellMenu(null);
    const existing = attendance.find(a => String(a.employeeId) === String(emp.id) && a.date === date);
    const current = resolveStatus(emp.id, date, attendance, leaves).status;
    // Prevent accidental/redundant overwrite — a no-op selection writes nothing.
    if (existing && status === current) return;
    const key = `${emp.id}|${date}`;
    setSavingCell(key);
    // ── Debug: record BEFORE state (req: log before update) ──
    console.debug('[Attendance] markCell BEFORE', { employee: emp.name, employeeId: emp.id, date, from: current, to: status, existingId: existing?.id ?? '(none → will create)' });
    try {
      let dbRes: any;
      if (existing && !String(existing.id).startsWith('new-')) {
        dbRes = await api.attendance.update(existing.id, { ...existing, status, source: 'Weekly Attendance', allowFutureDays: futureDaysParam });
        onUpdateAttendance(attendance.map(a => a.id === existing.id ? dbRes : a));
      } else {
        dbRes = await api.attendance.create({ ...buildNewRecord(emp, date, status), allowFutureDays: futureDaysParam });
        onUpdateAttendance([...attendance.filter(a => !(String(a.employeeId) === String(emp.id) && a.date === date)), dbRes]);
      }
      // ── Debug: DB response + AFTER state, and value-match check ──
      console.debug('[Attendance] markCell DB RESPONSE', dbRes);
      console.debug('[Attendance] markCell AFTER (UI will show)', { date, persistedStatus: dbRes?.status, matches: dbRes?.status === status });
      recalcSummaryAfterEdit(date, [emp.id]);
      flashWeekly(`${emp.name} · ${formatDate(date)} → ${status}. Saved & synced across Daily, Monthly, Payroll & Reports.`);
    } catch (e) {
      console.error('[Attendance] markCell FAILED', e);
      ui.toast.error(getApiErrorMessage(e, 'Could not save attendance to the database.'));
    } finally {
      setSavingCell(null);
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
      ui.toast.error(getApiErrorMessage(e, 'Could not update attendance status.'));
    }
  };

  const getCurrentColumns = () => {
    if (attendanceMode === 'custom') return customColumns;
    return DEFAULT_MODE_COLUMNS[attendanceMode as keyof typeof DEFAULT_MODE_COLUMNS] || DEFAULT_MODE_COLUMNS.advanced;
  };

  // The Import Template is the SAME matrix workbook as the Excel Export (shared
  // schema: utils/attendanceMatrix), just with sample rows — so an exported file
  // re-imports without any column changes.
  const downloadTemplate = () => {
    downloadAttendanceMatrix(buildTemplateMatrix(), 'Attendance_Import_Template.xlsx')
      .catch((e: any) => ui.toast.error(getApiErrorMessage(e, 'Could not generate the template.')));
  };

  const saveModeConfiguration = () => {
    localStorage.setItem(`hrms_attendance_mode_${activeCompanyId}`, attendanceMode);
    localStorage.setItem(`hrms_attendance_custom_cols_${activeCompanyId}`, JSON.stringify(customColumns));
    ui.toast.success('Attendance Mode Configuration Saved Successfully!\n\nThis configuration will automatically affect Attendance Import, Entry, Reports, and Payroll Calculations for this specific branch/company.');
  };

  const handleOpenShiftModal = (shift?: any) => {
    if (shift) {
      setEditingShiftId(shift.id);
      setShiftForm({ ...shift });
    } else {
      setEditingShiftId(null);
      setShiftForm({ name: '', code: '', start: '09:00', end: '18:00', grace: '15 mins', breakTime: '1 hr', otEnabled: true, status: 'Active' });
    }
    setShowShiftModal(true);
  };

  const handleSaveShift = async () => {
    if (!shiftForm.name?.trim() || !shiftForm.start || !shiftForm.end) {
      ui.toast.error('Please enter a shift name, start time and end time.');
      return;
    }
    try {
      if (editingShiftId) {
        const res = await api.shifts.update(editingShiftId, { ...shiftForm, companyId: activeCompanyId });
        setShifts(shifts.map(s => s.id === editingShiftId ? res : s));
      } else {
        const res = await api.shifts.create({ ...shiftForm, companyId: activeCompanyId });
        setShifts([...shifts, res]);
      }
      setShowShiftModal(false);
    } catch (e: any) {
      console.error(e);
      ui.toast.error(`Failed to save shift: ${e?.message || 'database error'}`);
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (await ui.confirm({ message: "Permanently delete this shift? Employees assigned to it will be unassigned. Use Archive instead to keep history.", variant: 'danger', confirmText: 'Delete Shift' })) {
      try {
        await api.shifts.delete(id);
        setShifts(shifts.filter(s => s.id !== id));
      } catch (e: any) {
        console.error(e);
        ui.toast.error(`Failed to delete shift: ${e?.message || 'database error'}`);
      }
    }
  };

  const handleArchiveShift = async (id: string) => {
    try {
      const res = await api.shifts.archive(id);
      setShifts(shifts.map(s => s.id === id ? res : s));
    } catch (e: any) {
      console.error(e);
      ui.toast.error(`Failed to archive shift: ${e?.message || 'database error'}`);
    }
  };

  const openAssignShift = (shift: any) => {
    setAssignShift(shift);
    const assigned = (employees || [])
      .filter((e: any) => String(e.shiftId) === String(shift.id))
      .map((e: any) => String(e.id));
    setAssignIds(assigned);
  };

  const handleSaveAssignments = async () => {
    if (!assignShift) return;
    setAssignBusy(true);
    try {
      await api.shifts.assign(assignShift.id, assignIds.map(Number));
      setAssignShift(null);
      onRefresh?.();
    } catch (e: any) {
      console.error(e);
      ui.toast.error(`Failed to assign employees: ${e?.message || 'database error'}`);
    } finally {
      setAssignBusy(false);
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
      ui.toast.error('Database error: failed to save overtime');
    }
  };

  const handleDeleteOT = async (id: string) => {
    if (await ui.confirm({ message: "Delete this Overtime Record?", variant: 'danger', confirmText: 'Delete' })) {
      try {
        await api.overtime.delete(id);
        setOvertimeData(overtimeData.filter(o => o.id !== id));
      } catch (e) {
        console.error(e);
        ui.toast.error('Database error: failed to delete overtime');
      }
    }
  };

  const handleStatusOT = async (id: string, newStatus: string) => {
    const target = overtimeData.find(o => o.id === id);
    if (!target) return;
    try {
      // Persist the approve/reject to the database. Previously this only wrote
      // to local state + localStorage, so the overtime status reverted on
      // refresh and payroll never saw the approval.
      await api.overtime.update(id, { ...target, status: newStatus });
      const updatedOT = overtimeData.map(o => o.id === id ? { ...o, status: newStatus } : o);
      setOvertimeData(updatedOT);
      localStorage.setItem(`hrms_overtime_${activeCompanyId}`, JSON.stringify(updatedOT));
    } catch (e) {
      console.error(e);
      ui.toast.error(getApiErrorMessage(e, 'Could not update the overtime status.'));
    }
  };

  const downloadGuide = () => {
    downloadImportGuidePDF();
  };

  // ── Attendance → Payroll synchronization lives on the dedicated Attendance
  //    Synchronization page, reached ONLY from Payroll → Payroll Workflow →
  //    "Sync Attendance" (it is a step of the payroll process, not a module here).

  // ── Build the export dataset — UNIFIED attendance sheet ────────────────────
  // Every period mode exports the SAME 17-column sheet defined by the shared
  // schema (utils/attendanceSchema), one row per employee per date in range. This
  // is byte-for-byte structurally identical to the Import Template, so the file
  // can be edited in Excel and re-imported with no column changes. (The period
  // mode only selects the date range; it never changes the columns.)
  const otHoursFor = (e: Employee, date: string): number =>
    (overtimeData || [])
      .filter((o: any) => String(o.employeeId ?? o.empId) === String(e.id) || (o.empCode && e.employeeId && String(o.empCode) === String(e.employeeId)))
      .filter((o: any) => o.date === date && Number(o.otHours ?? o.overtimeHours ?? 0) > 0)
      .reduce((sum: number, o: any) => sum + Number(o.otHours ?? o.overtimeHours ?? 0), 0);

  const hoursBetween = (inT?: string, outT?: string): number => {
    if (!inT || !outT) return 0;
    const [ih, im] = inT.split(':').map(Number); const [oh, om] = outT.split(':').map(Number);
    if ([ih, im, oh, om].some((n) => Number.isNaN(n))) return 0;
    let mins = (oh * 60 + om) - (ih * 60 + im); if (mins < 0) mins += 24 * 60;
    return Math.round((mins / 60) * 100) / 100;
  };

  const companyNameOf = (e: Employee): string =>
    companies.find((c) => String(c.id) === String(e.companyId) || String(c.id) === String((e as any).branchId))?.name || '';

  const buildSheetRow = (e: Employee, date: string) => {
    const { status, record } = resolveStatus(e.id, date, attendance, leaves);
    const clockIn = record?.clockIn || '';
    const clockOut = record?.clockOut || '';
    const wh = Number(record?.hoursWorked) > 0 ? Number(record?.hoursWorked) : hoursBetween(clockIn, clockOut);
    const ot = otHoursFor(e, date);
    return {
      employeeCode: e.employeeId || '',
      biometricId: (e as any).biometricId || '',
      employeeName: e.name || '',
      company: companyNameOf(e),
      branch: e.branchLocation || 'Head Office',
      department: e.department || '',
      designation: (e as any).designation || '',
      date,
      shift: record?.shift || (e as any).shift || '',
      clockIn,
      clockOut,
      workingHours: wh ? wh.toFixed(2) : '',
      breakHours: '',
      overtimeHours: ot ? ot.toFixed(2) : '',
      status,
      leaveType: record?.leaveType || '',
      remarks: record?.remarks || '',
    };
  };

  const buildExportDataset = (mode: PeriodMode, emps: Employee[]) => {
    const cols = attendanceSheetExportColumns();
    const range = getPeriodRange(mode, selectedDate, customStart, customEnd);
    const dates = mode === 'daily' ? [selectedDate] : eachDateInRange(range.start, range.end);
    const rows: any[] = [];
    emps.forEach((e) => dates.forEach((d) => rows.push(buildSheetRow(e, d))));
    return { rows, cols };
  };

  // ── Report meta + MATRIX dataset — shared by the Excel Export AND the Import
  //    Template (utils/attendanceMatrix schema). Same workbook structure for both;
  //    only the rows differ (real attendance vs. sample), so an exported file
  //    re-imports without any column changes.
  const _pad2 = (n: number) => String(n).padStart(2, '0');
  const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const matrixRow = (e: Employee, i: number, cells: string[], sum: any): MatrixEmployeeRow => ({
    srNo: i + 1,
    employeeCode: e.employeeId || '',
    biometricId: (e as any).biometricId || '',
    employeeName: e.name || '',
    department: e.department || '',
    branch: e.branchLocation || 'Head Office',
    cells,
    summary: {
      present: sum?.present ?? 0, absent: sum?.absent ?? 0, half: sum?.half ?? 0, leave: sum?.leave ?? 0,
      weeklyOff: sum?.weeklyOff ?? 0, holiday: sum?.holiday ?? 0, lateMarks: sum?.lateMarks ?? 0,
      otHours: sum?.otHours ?? 0, payableDays: sum?.payableDays ?? 0,
    },
  });

  const buildMatrixMeta = (mode: PeriodMode, emps: Employee[], range: { start: string; end: string }): MatrixData['meta'] => {
    const compName = (e: Employee) => companies.find((c) => String(c.id) === String(e.companyId) || String(c.id) === String((e as any).branchId))?.name || '';
    const comps = [...new Set(emps.map(compName).filter(Boolean))];
    const brs = [...new Set(emps.map((e) => e.branchLocation || 'Head Office').filter(Boolean))];
    const startY = Number(range.start.slice(0, 4)); const startM = Number(range.start.slice(5, 7));
    return {
      company: exportScope === 'company' ? (companyOptions.find((c) => c.value === filterCompany)?.label || comps[0] || 'Company')
        : comps.length === 1 ? comps[0] : comps.length ? 'Multiple Companies' : 'All Companies',
      branch: filterBranch || (brs.length === 1 ? brs[0] : 'All Branches'),
      department: filterDept || 'All Departments',
      attendanceType: mode.charAt(0).toUpperCase() + mode.slice(1),
      period: `${formatDate(range.start)} – ${formatDate(range.end)}`,
      month: mode === 'yearly' ? String(startY) : `${MONTH_LONG[startM - 1]} ${startY}`,
      generatedOn: formatDateTime(new Date()),
      generatedBy: role,
    };
  };

  const buildMatrixData = (mode: PeriodMode, emps: Employee[]): MatrixData => {
    const range = getPeriodRange(mode, selectedDate, customStart, customEnd);
    const meta = buildMatrixMeta(mode, emps, range);
    if (mode === 'yearly') {
      const year = Number(range.start.slice(0, 4));
      const dateHeaders = MON.slice();
      const rows = emps.map((e, i) => {
        const cells = MON.map((_, mi) => {
          const mDates = eachDateInRange(`${year}-${_pad2(mi + 1)}-01`, `${year}-${_pad2(mi + 1)}-${_pad2(new Date(year, mi + 1, 0).getDate())}`);
          const present = mDates.reduce((n, d) => bucketOf(resolveStatus(e.id, d, attendance, leaves).status) === 'present' ? n + 1 : n, 0);
          return present ? String(present) : '';
        });
        return matrixRow(e, i, cells, summarizeEmployeePeriod(e, eachDateInRange(range.start, range.end), attendance, leaves, overtimeData));
      });
      return { meta, dateHeaders, rows };
    }
    const dates = mode === 'daily' ? [selectedDate] : eachDateInRange(range.start, range.end);
    const dateHeaders = dates.map((d) => formatDateHeader(mode, d));
    const rows = emps.map((e, i) => {
      const cells = dates.map((d) => statusToCode(resolveStatus(e.id, d, attendance, leaves).status));
      return matrixRow(e, i, cells, summarizeEmployeePeriod(e, dates, attendance, leaves, overtimeData));
    });
    return { meta, dateHeaders, rows };
  };

  // Sample workbook for the Import Template — identical structure, demo rows.
  const buildTemplateMatrix = (): MatrixData => {
    const range = getPeriodRange('weekly', selectedDate);
    const dates = eachDateInRange(range.start, range.end);
    const dateHeaders = dates.map((d) => formatDateHeader('weekly', d));
    const demo = [
      { code: 'EMP-001', bio: '1001', name: 'John Doe', dept: 'Operations', br: 'Head Office', pattern: ['P', 'P', 'P', 'HD', 'P', 'WO', 'H'] },
      { code: 'EMP-002', bio: '1002', name: 'Jane Smith', dept: 'Finance', br: 'Head Office', pattern: ['P', 'L', 'P', 'P', 'A', 'WO', 'H'] },
    ];
    const rows = demo.map((d, i) => {
      const cells = dateHeaders.map((_, idx) => d.pattern[idx % d.pattern.length]);
      const c = (x: string) => cells.filter((v) => v === x).length;
      return matrixRow({ employeeId: d.code, name: d.name, department: d.dept, branchLocation: d.br, biometricId: d.bio } as any, i, cells, {
        present: c('P'), absent: c('A'), half: c('HD'), leave: c('L'), weeklyOff: c('WO'), holiday: c('H'), lateMarks: 0, otHours: 0, payableDays: c('P') + c('HD') * 0.5,
      });
    });
    const startM = Number(range.start.slice(5, 7));
    return {
      meta: {
        company: 'Sample Company', branch: 'Head Office', department: 'All Departments', attendanceType: 'Weekly',
        period: `${formatDate(range.start)} – ${formatDate(range.end)}`, month: `${MONTH_LONG[startM - 1]} ${range.start.slice(0, 4)}`,
        generatedOn: formatDateTime(new Date()), generatedBy: role,
      },
      dateHeaders, rows,
    };
  };

  // Resolve which employees belong to the chosen export scope.
  const resolveScopeEmployees = (): Employee[] => {
    let list = activeUniqueEmployees;
    if (exportScope === 'company' && filterCompany) list = list.filter(e => e.companyId === filterCompany || e.branchId === filterCompany);
    else if (exportScope === 'multiple') list = list.filter(e => exportCompanyIds.includes(e.companyId) || exportCompanyIds.includes(e.branchId || ''));
    else if (exportScope === 'branch' && filterBranch) list = list.filter(e => (e.branchLocation || 'Head Office') === filterBranch);
    else if (exportScope === 'department' && filterDept) list = list.filter(e => e.department === filterDept);
    else if (exportScope === 'individual' && filterEmployee) list = list.filter(e => String(e.id) === String(filterEmployee));
    return list;
  };

  const runExport = () => {
    const emps = resolveScopeEmployees();
    if (emps.length === 0) { ui.toast.warning('No employees match the selected scope/filters.'); return; }
    // Excel → the shared MATRIX workbook (report header + full-date columns + P/A/HD
    // codes + summary + legend), identical to the Import Template and re-importable.
    if (exportFormat === 'excel') {
      downloadAttendanceMatrix(buildMatrixData(exportMode, emps), `Attendance_${exportMode.charAt(0).toUpperCase()}${exportMode.slice(1)}_Report.xlsx`)
        .then(() => setExportOpen(false))
        .catch((e: any) => ui.toast.error(getApiErrorMessage(e, 'Excel export failed.')));
      return;
    }
    // CSV / PDF / Print keep the flat human-readable dataset.
    const { rows, cols } = buildExportDataset(exportMode, emps);
    const range = getPeriodRange(exportMode, selectedDate, customStart, customEnd);
    const scopeLabel = exportScope === 'all' ? 'All Companies'
      : exportScope === 'multiple' ? `${exportCompanyIds.length} Companies`
      : exportScope === 'company' ? (companyOptions.find(c => c.value === filterCompany)?.label || 'Company')
      : exportScope === 'branch' ? (filterBranch || 'Branch')
      : exportScope === 'department' ? (filterDept || 'Department')
      : (activeUniqueEmployees.find(e => String(e.id) === String(filterEmployee))?.name || 'Employee');
    const title = `Attendance ${exportMode[0].toUpperCase()}${exportMode.slice(1)} Report`;
    exportAttendanceDataset(title, exportFormat, rows, cols, `${scopeLabel} · ${range.label} · ${emps.length} employee(s)`);
    setExportOpen(false);
  };

  return (
    <div className="space-y-4 font-sans">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Calendar size={20} className="text-brand-600" /> Enterprise Attendance Management Center</h2>
          <p className="text-xs text-slate-500 mt-1">Fully integrated with Payroll Engine, Leave Balances, and Overtime Processing.</p>
        </div>
        <div className="flex gap-2">
           <Button variant="secondary" size="sm" onClick={() => { setExportMode(periodMode === 'daily' ? 'monthly' : periodMode); setExportOpen(true); }}>
             <Download size={14}/> Export
           </Button>
           {/* Attendance is the source of truth. This is the ONLY button that sends
               finalized attendance to payroll — it opens the full-page
               "Attendance → Payroll Synchronization" engine. */}
           {role !== 'Employee' && (
             <Button size="sm" onClick={() => onNavigate?.('attendance-sync')}>
               <Send size={14}/> Push to Payroll Engine
             </Button>
           )}
        </div>
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
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg transition-colors ${activeTab === t.id ? 'bg-white text-brand-700 border-t border-l border-r border-slate-200 shadow-[0_-2px_4px_rgba(0,0,0,0.02)]' : 'text-slate-500 hover:bg-slate-50'}`}
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
              { label: 'Total Employees', sub: 'Active Workforce', value: statTotal, icon: Users, colorClass: 'text-brand-600', bgClass: 'bg-brand-50', gradient: 'from-brand-500 to-brand-600' },
              { label: 'Present Today', sub: '100% of total', value: statPresent, icon: CheckCircle2, colorClass: 'text-emerald-600', bgClass: 'bg-emerald-50', gradient: 'from-emerald-500 to-emerald-600' },
              { label: 'Absent Today', sub: '0% of total', value: statAbsent, icon: XCircle, colorClass: 'text-rose-600', bgClass: 'bg-rose-50', gradient: 'from-rose-500 to-rose-600' },
              { label: 'On Leave', sub: '0% of total', value: statLeave, icon: Calendar, colorClass: 'text-amber-600', bgClass: 'bg-amber-50', gradient: 'from-amber-500 to-amber-600' },
              { label: 'WFH Today', sub: '0% of total', value: statWfh, icon: Building2, colorClass: 'text-brand-600', bgClass: 'bg-brand-50', gradient: 'from-brand-500 to-brand-600' },
              { label: 'Half Day', sub: '0% of total', value: statHalf, icon: Clock, colorClass: 'text-brand-600', bgClass: 'bg-brand-50', gradient: 'from-brand-500 to-brand-600' },
              { label: 'Late Today', sub: '0.0% of total', value: statLate, icon: AlertCircle, colorClass: 'text-pink-600', bgClass: 'bg-pink-50', gradient: 'from-pink-500 to-pink-600' },
              { label: 'Overtime Running', sub: '0% of total', value: statOvertime, icon: Clock, colorClass: 'text-brand-600', bgClass: 'bg-brand-50', gradient: 'from-brand-500 to-brand-600' },
            ].map((kpi, idx) => {
              const pct = statTotal ? Math.round((kpi.value / statTotal) * 100) : 0;
              const subtext = kpi.sub || `${pct}% of total`;
              return (
                <div key={idx} className="bg-white/80 backdrop-blur-xl rounded-[20px] border border-[#E6E0FE] shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-[120px] p-4 group">
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
            <div className="bg-white rounded-[20px] border border-[#E6E0FE] shadow-sm p-5 flex flex-col justify-between">
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
                    <span className="flex items-center gap-1.5 text-gray-600"><span className="w-2 h-2 rounded-full bg-brand-500 shadow-sm"></span> WFH</span>
                    <span className="text-gray-800">{statWfh} ({(statTotal ? Math.round(statWfh/statTotal*100) : 0)}%)</span>
                  </div>
                </div>
              </div>
              <button className="text-[11px] text-brand-600 font-bold mt-5 text-center w-full hover:underline">View Full Report</button>
            </div>

            {/* Department Distribution */}
            <div className="bg-white rounded-[20px] border border-[#E6E0FE] shadow-sm p-5 flex flex-col justify-between">
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
                        <div className="bg-brand-600 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
                {departments.length === 0 && (
                   <div className="text-xs text-gray-400 text-center py-4">No department data available.</div>
                )}
              </div>
              <button className="text-[11px] text-brand-600 font-bold mt-5 text-center w-full hover:underline">View Full Report</button>
            </div>

            {/* Broadcast & Notification */}
            <div className="bg-white rounded-[20px] border border-[#E6E0FE] shadow-sm p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-[14px] font-bold text-gray-800 mb-4">Broadcast & Notification</h3>
              </div>
              <div className="flex flex-col gap-3 flex-1">
                <div>
                  <label htmlFor="bc-audience" className="block text-[11px] font-bold text-gray-600 mb-1">Target Audience</label>
                  <select
                    id="bc-audience"
                    value={bcAudience}
                    onChange={e => { setBcAudience(e.target.value as BroadcastAudience); setBcTarget(''); }}
                    className="w-full text-xs font-medium border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-gray-700 transition-all"
                  >
                    <option value="all">All Staff</option>
                    <option value="branch">Specific Branch</option>
                    <option value="role">By Role</option>
                    <option value="department">Specific Department</option>
                    <option value="employee">Individual Employee</option>
                  </select>
                </div>

                {/* The second selector only exists for audiences that need one. */}
                {bcAudience !== 'all' && (
                  <div>
                    <label htmlFor="bc-target" className="block text-[11px] font-bold text-gray-600 mb-1">
                      {bcAudience === 'branch' ? 'Branch' : bcAudience === 'role' ? 'Role' : bcAudience === 'department' ? 'Department' : 'Employee'}
                    </label>
                    <select
                      id="bc-target"
                      value={bcTarget}
                      onChange={e => setBcTarget(e.target.value)}
                      className="w-full text-xs font-medium border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-gray-700 transition-all"
                    >
                      <option value="">Select…</option>
                      {bcTargetOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="bc-message" className="block text-[11px] font-bold text-gray-600 mb-1">Message</label>
                  <textarea
                    id="bc-message"
                    value={bcMessage}
                    maxLength={BROADCAST_MAX}
                    onChange={e => setBcMessage(e.target.value)}
                    className="w-full text-xs font-medium border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 h-[68px] resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-gray-700 transition-all"
                    placeholder="Type your message here..."
                  />
                  <div className="flex justify-end mt-1">
                    <span className={`text-[10px] font-semibold ${bcMessage.length >= BROADCAST_MAX ? 'text-rose-500' : 'text-gray-400'}`}>
                      {bcMessage.length}/{BROADCAST_MAX}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                onClick={dispatchBroadcast}
                loading={bcSending}
                disabled={!bcMessage.trim() || (bcAudience !== 'all' && !bcTarget)}
                className="w-full text-xs mt-4 bg-brand-600 hover:bg-brand-700 font-bold shadow-md shadow-brand-600/20 flex items-center justify-center gap-2"
              >
                <Send size={14} /> {bcSending ? 'Dispatching…' : 'Dispatch Broadcast'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-[16px] border border-[#E6E0FE] shadow-sm p-4 flex items-center justify-between group hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brand-50 text-brand-600 rounded-xl group-hover:scale-110 transition-transform"><Activity size={18} /></div>
                <div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Today's Attendance Rate</p>
                  <h4 className="text-xl font-black text-gray-900">{statTotal > 0 ? Math.round((statPresent/statTotal)*100) : 0}%</h4>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[16px] border border-[#E6E0FE] shadow-sm p-4 flex items-center justify-between group hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brand-50 text-brand-600 rounded-xl group-hover:scale-110 transition-transform"><Clock size={18} /></div>
                <div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Overtime Hours (Today)</p>
                  <h4 className="text-xl font-black text-gray-900">{statOvertime > 0 ? `${statOvertime * 2}h 00m` : '00h 00m'}</h4>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[16px] border border-[#E6E0FE] shadow-sm p-4 flex items-center justify-between group hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform"><CheckCircle2 size={18} /></div>
                <div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Avg. Check-in Time</p>
                  <h4 className="text-xl font-black text-gray-900">09:02 AM</h4>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[16px] border border-[#E6E0FE] shadow-sm p-4 flex items-center justify-between group hover:shadow-md transition-shadow">
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

      {/* TAB: ENTRY (now a unified Records area driven by the period selector) */}
      {activeTab === 'entry' && (
       <div className="space-y-4 animate-in fade-in">
        {/* Period selector */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
            {(['daily','weekly','monthly','yearly','custom'] as PeriodMode[]).map(m => (
              <button key={m} onClick={() => setPeriodMode(m)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-md capitalize transition-colors ${periodMode === m ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {m}
              </button>
            ))}
          </div>
          {periodMode === 'custom' ? (
            <div className="flex items-center gap-2">
              <Input type="date" max={today} value={customStart} onChange={e => setCustomStart(clampPast(e.target.value))} className="w-36 text-xs h-8" />
              <span className="text-slate-400 text-xs">to</span>
              <Input type="date" max={today} value={customEnd} onChange={e => setCustomEnd(clampPast(e.target.value))} className="w-36 text-xs h-8" />
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => shiftPeriod(-1)} title={`Previous ${periodMode === 'weekly' ? 'week' : periodMode === 'monthly' ? 'month' : periodMode === 'yearly' ? 'year' : 'day'}`} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"><ChevronLeft size={16} /></button>
              <Input type="date" max={today} value={selectedDate} onChange={e => setSelectedDate(clampPast(e.target.value))} className="w-40 text-xs h-8" title="Jump to date" />
              <button onClick={() => shiftPeriod(1)} disabled={!canGoNext} aria-disabled={!canGoNext} title={canGoNext ? `Next ${periodMode === 'weekly' ? 'week' : periodMode === 'monthly' ? 'month' : periodMode === 'yearly' ? 'year' : 'day'}` : 'Future dates are not available'} className={`p-1.5 rounded-md text-slate-500 ${canGoNext ? 'hover:bg-slate-100' : 'opacity-40 cursor-not-allowed'}`}><ChevronRight size={16} /></button>
              <button onClick={() => setSelectedDate(today)} title="Jump to the current period"
                className="ml-1 px-2.5 py-1.5 text-[11px] font-bold rounded-md border border-slate-200 text-brand-700 hover:bg-brand-50">
                {periodMode === 'weekly' ? 'Current Week' : periodMode === 'monthly' ? 'Current Month' : periodMode === 'yearly' ? 'Current Year' : 'Today'}
              </button>
            </div>
          )}
          <span className="text-xs font-bold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">{period.label}</span>
          <div className="ml-auto">
            <Button size="sm" variant="secondary" className="text-[11px]" onClick={() => { setExportMode(periodMode === 'daily' ? 'monthly' : periodMode); setExportOpen(true); }}><Download size={13} className="mr-1" /> Export</Button>
          </div>
        </div>

        {/* Enterprise filter bar */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-end gap-2">
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 mr-1"><Filter size={13} /> Filters</div>
          {companyOptions.length > 1 && (
            <div className="w-40"><Select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} options={[{ value: '', label: 'All Companies' }, ...companyOptions]} className="text-xs h-8" /></div>
          )}
          <div className="w-36"><Select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} options={[{ value: '', label: 'All Branches' }, ...branches.map(b => ({ value: b, label: b }))]} className="text-xs h-8" /></div>
          <div className="w-36"><Select value={filterDept} onChange={e => setFilterDept(e.target.value)} options={[{ value: '', label: 'All Departments' }, ...departments.map(d => ({ value: d, label: d }))]} className="text-xs h-8" /></div>
          <div className="w-36"><Select value={filterDesignation} onChange={e => setFilterDesignation(e.target.value)} options={[{ value: '', label: 'All Designations' }, ...designations.map(d => ({ value: d, label: d }))]} className="text-xs h-8" /></div>
          <div className="w-44"><Select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} options={[{ value: '', label: 'All Employees' }, ...periodEmployees.map(e => ({ value: e.id, label: e.name }))]} className="text-xs h-8" /></div>
          {(filterCompany || filterBranch || filterDept || filterDesignation || filterEmployee) && (
            <button onClick={() => { setFilterCompany(''); setFilterBranch(''); setFilterDept(''); setFilterDesignation(''); setFilterEmployee(''); }} className="h-8 px-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded-md flex items-center gap-1"><X size={12} /> Clear</button>
          )}
          <span className="ml-auto text-[11px] font-bold text-slate-500">{periodEmployees.length} employee(s)</span>
        </div>

        {/* DAILY view — original entry grid (unchanged behaviour) */}
        {periodMode === 'daily' && (
        <Card padding={false} className="overflow-hidden border-slate-200">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 items-center">
              <Input type="date" max={today} value={selectedDate} onChange={e => setSelectedDate(clampPast(e.target.value))} className="w-40 text-xs h-8" />
              <div className="w-48">
                <Input placeholder="Search Employee..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={14}/>} className="text-xs h-8" />
              </div>
              <div className="w-40">
                <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} options={[{value: '', label: 'All Status'}, ...ATTENDANCE_STATUS_OPTIONS.map(s => ({value: s, label: s}))]} className="text-xs h-8" />
              </div>
            </div>
            
            {isAdmin && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={isFutureLocked(selectedDate)} className="h-8 text-[10px] bg-white" onClick={() => handleBulkMark('Present')}><CheckCircle2 size={12} className="mr-1 text-emerald-500"/> Bulk Present</Button>
                <Button size="sm" variant="outline" disabled={isFutureLocked(selectedDate)} className="h-8 text-[10px] bg-white" onClick={() => handleBulkMark('Holiday')}><Calendar size={12} className="mr-1 text-brand-500"/> Bulk Holiday</Button>
              </div>
            )}
          </div>

          <Paginated items={filteredRecords} resetKey={attnFilterKey} label="records">
          {(rows, { startIndex }) => (
          <Table>
            <Thead className="bg-slate-100">
              <tr>
                {isAdmin && <Th className="w-10 text-center"><input type="checkbox" onChange={e => setSelectedIds(e.target.checked ? filteredRecords.map(r => r.id) : [])} checked={selectedIds.length === filteredRecords.length && filteredRecords.length > 0} className="rounded border-slate-300" /></Th>}
                <Th className="text-center">Sr No</Th>
                <Th>Employee</Th>
                <Th>Clock In</Th>
                <Th>Clock Out</Th>
                <Th>Status</Th>
                {isAdmin && <Th className="text-right">Quick Mark</Th>}
              </tr>
            </Thead>
            <Tbody>
              {rows.map((r, i) => (
                <Tr key={r.id} className="hover:bg-slate-50">
                  {isAdmin && <Td className="text-center"><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={e => {
                    if (e.target.checked) setSelectedIds([...selectedIds, r.id]);
                    else setSelectedIds(selectedIds.filter(id => id !== r.id));
                  }} className="rounded border-slate-300 text-brand-600" /></Td>}
                  <Td className="text-center text-[11px] text-slate-400">{startIndex + i + 1}</Td>
                  <Td>
                    <div className="font-bold text-slate-800 text-xs">{r.employeeName}</div>
                    <div className="text-[10px] text-slate-500">{activeUniqueEmployees.find(e => e.id === r.employeeId)?.employeeId ? `${activeUniqueEmployees.find(e => e.id === r.employeeId)?.employeeId} · ` : ''}{r.department}</div>
                  </Td>
                  <Td><span className="text-xs font-mono">{r.clockIn || '--:--'}</span></Td>
                  <Td><span className="text-xs font-mono">{r.clockOut || '--:--'}</span></Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <span className={`px-2 py-1 w-max rounded-full text-[10px] font-bold
                        ${r.status === 'Present' ? 'bg-emerald-100 text-emerald-700' :
                          r.status === 'Absent' ? 'bg-rose-100 text-rose-700' :
                          r.status === 'Leave' ? 'bg-brand-100 text-brand-700' :
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
                        className="text-[10px] border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-brand-500"
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
          )}
          </Paginated>
        </Card>
        )}

        {/* WEEKLY GRID view */}
        {periodMode === 'weekly' && (
          <Card padding={false} className="overflow-hidden border-slate-200">
            <div className="p-3 border-b border-slate-100 bg-slate-50">
              <h4 className="font-bold text-sm text-slate-800">Weekly Attendance Grid</h4>
              <p className="text-[10px] text-slate-500">{period.label} · P=Present A=Absent L=Leave HD=Half WFH=Work From Home H=Holiday WO=Weekly Off{isAdmin ? ' · Click any cell to edit — saves instantly and syncs everywhere.' : ''}</p>
            </div>
            {weeklyMsg && (
              <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 size={13} /> {weeklyMsg}
              </div>
            )}
            <Paginated items={periodEmployees} resetKey={attnFilterKey} label="employees">
            {(rows) => (
            <div className="overflow-x-auto">
              <Table>
                <Thead className="bg-slate-100">
                  <tr>
                    <Th className="sticky left-0 z-20 bg-slate-100 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">Employee</Th>
                    {periodDates.map((d, i) => (
                      <Th key={d} className="text-center whitespace-nowrap">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}<div className="text-[9px] font-normal text-slate-400">{d.slice(5)}</div></Th>
                    ))}
                    <Th className="text-center">Present</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {periodEmployees.length === 0 ? (
                    <Tr><Td colSpan={periodDates.length + 2} className="text-center text-xs text-slate-500 py-8">No employees match the current filters.</Td></Tr>
                  ) : rows.map(emp => {
                    let present = 0;
                    return (
                      <Tr key={emp.id} className="hover:bg-slate-50 group">
                        <Td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]"><div className="font-bold text-slate-800 text-xs">{emp.name}</div><div className="text-[10px] text-slate-500">{emp.department}</div></Td>
                        {periodDates.map(d => {
                          const dateLabel = new Date(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
                          // Future dates are READ-ONLY: greyed "Upcoming" cell, no
                          // click / menu / keyboard / hover — never counted or saved.
                          if (isFutureLocked(d)) {
                            return (
                              <Td key={d} className="text-center">
                                <span aria-disabled="true" title={`Upcoming · ${dateLabel} — future dates are read-only`}
                                  className="inline-block w-9 py-0.5 rounded text-[10px] font-bold bg-slate-50 text-slate-300 cursor-not-allowed select-none">
                                  --
                                </span>
                              </Td>
                            );
                          }
                          const { status, leaveType } = resolveStatus(emp.id, d, attendance, leaves);
                          const bucket = bucketOf(status);
                          if (bucket === 'present') present++;
                          // Color coding: Present=green, Absent=red, Leave=blue,
                          // Half Day=orange, WFH=purple, Holiday=gray, Weekly Off=light gray.
                          const color = bucket === 'present' ? 'bg-emerald-100 text-emerald-700' : bucket === 'absent' ? 'bg-rose-100 text-rose-700' : bucket === 'leave' ? 'bg-brand-100 text-brand-700' : bucket === 'half' ? 'bg-orange-100 text-orange-700' : bucket === 'wfh' ? 'bg-brand-100 text-brand-700' : bucket === 'holiday' ? 'bg-gray-300 text-gray-700' : 'bg-slate-100 text-slate-500';
                          const key = `${emp.id}|${d}`;
                          const isSaving = savingCell === key;
                          const isEditing = cellMenu?.key === key;
                          const fullLabel = `${status}${leaveType ? ` (${leaveType})` : ''} · ${dateLabel}`;
                          return (
                            <Td key={d} className="text-center">
                              <button
                                type="button"
                                disabled={!isAdmin || isSaving}
                                title={isAdmin ? `${fullLabel} — click to edit` : fullLabel}
                                onClick={(e) => {
                                  if (!isAdmin) return;
                                  if (isEditing) { setCellMenu(null); return; }
                                  const anchor = e.currentTarget as HTMLElement;
                                  const pos = computeCellMenuPos(anchor.getBoundingClientRect());
                                  setCellMenu({ key, emp, date: d, status, top: pos.top, left: pos.left, anchor });
                                }}
                                className={`inline-block w-9 py-0.5 rounded text-[10px] font-bold transition-all ${color} ${isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-brand-300' : 'cursor-default'} ${isEditing ? 'ring-2 ring-brand-500' : ''} ${isSaving ? 'opacity-50' : ''}`}
                              >
                                {isSaving ? '…' : statusCode(status)}
                              </button>
                            </Td>
                          );
                        })}
                        <Td className="text-center"><span className="text-xs font-bold text-emerald-600">{present}</span></Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </div>
            )}
            </Paginated>
          </Card>
        )}

        {/* Attendance-status dropdown — rendered in a portal at a fixed position
            anchored to the clicked cell, so it never gets clipped by the table's
            scroll/overflow and always opens cleanly below the cell. */}
        {cellMenu && createPortal(
          <>
            {/* click-away / scroll catcher */}
            <div className="fixed inset-0 z-[1000]" onClick={() => setCellMenu(null)} />
            <div
              role="listbox"
              aria-label="Attendance Status"
              onKeyDown={handleCellMenuKey}
              style={{ position: 'fixed', top: cellMenu.top, left: cellMenu.left, maxHeight: 'calc(100vh - 16px)' }}
              className="z-[1001] w-52 rounded-xl border border-slate-200 bg-white shadow-2xl py-1 overflow-y-auto"
            >
              <div className="px-3 py-2 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100">Attendance Status</div>
              {WEEKLY_CELL_STATUSES.map((opt, idx) => {
                const selected = opt.value === cellMenu.status;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    autoFocus={selected || (idx === 0 && !WEEKLY_CELL_STATUSES.some(o => o.value === cellMenu.status))}
                    onClick={() => markCell(cellMenu.emp, cellMenu.date, opt.value)}
                    className={`w-full flex items-center gap-2.5 text-left px-3 py-2 text-xs transition-colors focus:outline-none hover:bg-brand-50 focus:bg-brand-50 ${selected ? 'font-bold text-brand-600 bg-brand-50/60' : 'text-slate-700'}`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.dot}`} />
                    <span className="flex-1">{opt.label}</span>
                    {selected && <Check size={14} className="text-brand-600" />}
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        )}

        {/* MONTHLY / CUSTOM summary view */}
        {(periodMode === 'monthly' || periodMode === 'custom') && (
          <Card padding={false} className="overflow-hidden border-slate-200">
            <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-800">{periodMode === 'monthly' ? 'Monthly' : 'Custom Range'} Attendance Summary</h4>
                <p className="text-[10px] text-slate-500">{period.label} · {periodDates.length} day(s)</p>
              </div>
            </div>
            <Paginated items={monthlyDisplaySummaries} resetKey={attnFilterKey} label="employees">
            {(rows, { startIndex }) => (
            <div className="overflow-x-auto">
              <Table>
                <Thead className="bg-slate-100">
                  <tr>
                    <Th className="text-center">Sr No</Th>
                    <Th className="sticky left-0 z-20 bg-slate-100 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">Employee</Th>
                    <Th>Dept</Th>
                    <Th className="text-center">P</Th><Th className="text-center">A</Th><Th className="text-center">L</Th>
                    <Th className="text-center">HD</Th><Th className="text-center">WFH</Th><Th className="text-center">H</Th><Th className="text-center">WO</Th>
                    <Th className="text-center">Late</Th><Th className="text-center">OT Hrs</Th>
                    <Th className="text-center">Work Days</Th><Th className="text-center">LOP</Th><Th className="text-center">Payable</Th>
                    {isAdmin && <Th className="text-center sticky right-0 z-20 bg-slate-100 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.15)]">Edit</Th>}
                  </tr>
                </Thead>
                <Tbody>
                  {monthlyDisplaySummaries.length === 0 ? (
                    <Tr><Td colSpan={isAdmin ? 16 : 15} className="text-center text-xs text-slate-500 py-8">No employees match the current filters.</Td></Tr>
                  ) : rows.map((s: any, i: number) => (
                    <Tr key={s.employeeId} className="hover:bg-slate-50 group">
                      <Td className="text-center text-[11px] text-slate-400">{startIndex + i + 1}</Td>
                      <Td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">
                        <div className="font-bold text-slate-800 text-xs flex items-center gap-1">{s.employeeName}{s.adjusted && <span title="Manually adjusted for payroll" className="text-[8px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1 rounded">ADJ</span>}</div>
                        <div className="text-[10px] text-slate-500">{s.employeeCode}</div>
                      </Td>
                      <Td><span className="text-[10px] text-slate-500">{s.department}</span></Td>
                      <Td className="text-center text-xs font-bold text-emerald-600">{s.present}</Td>
                      <Td className="text-center text-xs font-bold text-rose-600">{s.absent}</Td>
                      <Td className="text-center text-xs">{s.leave}</Td>
                      <Td className="text-center text-xs">{s.half}</Td>
                      <Td className="text-center text-xs">{s.wfh}</Td>
                      <Td className="text-center text-xs">{s.holiday}</Td>
                      <Td className="text-center text-xs">{s.weeklyOff}</Td>
                      <Td className="text-center text-xs text-amber-600">{s.lateMarks}</Td>
                      <Td className="text-center text-xs font-bold text-fuchsia-600">{s.otHours}</Td>
                      <Td className="text-center text-xs">{s.workingDays}</Td>
                      <Td className="text-center text-xs font-bold text-rose-500">{s.lop}</Td>
                      <Td className="text-center text-xs font-bold text-brand-600">{s.payableDays}</Td>
                      {isAdmin && (
                        <Td className="text-center sticky right-0 z-10 bg-white group-hover:bg-slate-50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.15)]">
                          {period.start > maxEditableDate ? (
                            <span title="Future period — attendance is read-only" className="text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">Upcoming</span>
                          ) : dbSummaries[String(s.employeeId)]?.locked ? (
                            <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">Month Locked</span>
                          ) : (
                            <button onClick={() => openEditSummary(s.employeeId, s.employeeName, s.employeeCode)}
                              className="text-[10px] font-bold text-brand-700 bg-brand-50 border border-brand-200 px-2 py-1 rounded hover:bg-brand-100 transition-colors">
                              Edit
                            </button>
                          )}
                        </Td>
                      )}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
            )}
            </Paginated>
          </Card>
        )}

        {/* YEARLY analytics view */}
        {periodMode === 'yearly' && (
          <div className="space-y-4">
            <Card>
              <h4 className="font-bold text-sm text-slate-800 mb-1">Yearly Attendance Analytics — {new Date(selectedDate).getFullYear()}</h4>
              <p className="text-[10px] text-slate-500 mb-4">Monthly present / absent / leave totals across {periodEmployees.length} employee(s).</p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearlyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="present" name="Present" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="absent" name="Absent" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="leave" name="Leave" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card padding={false} className="overflow-hidden border-slate-200">
              <Table>
                <Thead className="bg-slate-100"><tr><Th>Month</Th><Th className="text-center">Present</Th><Th className="text-center">Absent</Th><Th className="text-center">Leave</Th><Th className="text-center">Half Day</Th><Th className="text-center">WFH</Th><Th className="text-center">OT Hrs</Th><Th className="text-center">Attendance %</Th></tr></Thead>
                <Tbody>
                  {yearlyData.map(m => {
                    const monthStart = `${new Date(selectedDate).getFullYear()}-${String(m.monthIndex + 1).padStart(2, '0')}-01`;
                    const monthFuture = monthStart > maxEditableDate;
                    return (
                    <Tr key={m.month} className="hover:bg-slate-50">
                      <Td className="font-bold text-xs">{m.month}{monthFuture && <span title="Future month — read-only" className="ml-1.5 text-[8px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-1 rounded align-middle">Upcoming</span>}</Td>
                      <Td className="text-center text-xs text-emerald-600 font-bold">{m.present}</Td>
                      <Td className="text-center text-xs text-rose-600 font-bold">{m.absent}</Td>
                      <Td className="text-center text-xs">{m.leave}</Td>
                      <Td className="text-center text-xs">{m.half}</Td>
                      <Td className="text-center text-xs">{m.wfh}</Td>
                      <Td className="text-center text-xs text-fuchsia-600 font-bold">{m.otHours}</Td>
                      <Td className="text-center text-xs font-bold text-brand-600">{m.attendanceRate}%</Td>
                    </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Card>
          </div>
        )}
       </div>
      )}

      {/* TAB: OVERTIME */}
      {activeTab === 'overtime' && (
        <div className="space-y-4 animate-in fade-in">
          {/* OT Analytics Dashboard */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total OT Hours" value={overtimeData.reduce((acc, curr) => acc + (Number(curr.otHours) || 0), 0).toFixed(1)} icon={<Clock size={16} className="text-slate-600" />} color="bg-slate-50" />
            <StatCard label="Approved OT" value={overtimeData.filter(o => o.status === 'Approved').reduce((acc, curr) => acc + (Number(curr.otHours) || 0), 0).toFixed(1)} icon={<CheckCircle2 size={16} className="text-emerald-600" />} color="bg-emerald-50" />
            <StatCard label="Pending OT" value={overtimeData.filter(o => o.status === 'Pending').reduce((acc, curr) => acc + (Number(curr.otHours) || 0), 0).toFixed(1)} icon={<Clock size={16} className="text-amber-600" />} color="bg-amber-50" />
            <StatCard label="OT Cost (Est.)" value={`₹ ${(overtimeData.filter(o => o.status === 'Approved').reduce((acc, curr) => acc + (Number(curr.otHours) || 0), 0) * 200).toLocaleString()}`} icon={<Database size={16} className="text-brand-600" />} color="bg-brand-50" />
          </div>

          <Card padding={false} className="overflow-hidden border-slate-200">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-sm text-slate-800">Overtime Tracking & Approvals</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Approved OT automatically calculates via Payroll Multipliers.</p>
              </div>
              {isAdmin && <Button size="sm" className="h-8 text-[10px]" onClick={() => handleOpenOTModal()}>Add OT Record</Button>}
            </div>
            <Paginated items={overtimeData} resetKey={activeCompanyId} label="records">
            {(rows) => (
            <Table>
              <Thead><tr><Th>Employee</Th><Th>Date</Th><Th>In/Out Time</Th><Th>OT Hours</Th><Th>Type</Th><Th>Status</Th>{isAdmin && <Th>Actions</Th>}</tr></Thead>
              <Tbody>
                {overtimeData.length === 0 ? (
                  <Tr><Td colSpan={7} className="text-center text-xs text-slate-500 py-8">No Overtime Records Found.</Td></Tr>
                ) : rows.map(ot => (
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
                          <button className="text-[10px] text-brand-600 hover:underline font-bold" onClick={() => handleOpenOTModal(ot)}>Edit</button>
                          <button className="text-[10px] text-rose-600 hover:underline font-bold" onClick={() => handleDeleteOT(ot.id)}>Delete</button>
                        </div>
                      </Td>
                    )}
                  </Tr>
                ))}
              </Tbody>
            </Table>
            )}
            </Paginated>
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
                        className="px-3 py-2 hover:bg-brand-50 cursor-pointer flex flex-col"
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
            <Input type="date" label="Date" max={today} value={otForm.date} onChange={e => setOTForm({...otForm, date: clampPast(e.target.value)})} />
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
          {shiftError && (
            <div className="m-4 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {shiftError}
            </div>
          )}
          <Paginated items={shifts} resetKey={activeCompanyId} label="shifts">
          {(rows) => (
          <Table>
            <Thead><tr><Th>Shift Name</Th><Th>Code</Th><Th>Start Time</Th><Th>End Time</Th><Th>Grace Period</Th><Th>Break Time</Th><Th>Employees</Th><Th>Overtime</Th><Th>Status</Th>{isAdmin && <Th>Actions</Th>}</tr></Thead>
            <Tbody>
              {shifts.length === 0 && !shiftError && (
                <Tr><Td colSpan={isAdmin ? 10 : 9}><span className="text-slate-400 text-xs py-3 block text-center">No shifts defined yet. Click “Create New Shift” to add one.</span></Td></Tr>
              )}
              {rows.map(s => {
                const assignedCount = (employees || []).filter((e: any) => String(e.shiftId) === String(s.id)).length;
                return (
                <Tr key={s.id} className={s.status === 'Archived' ? 'opacity-50' : ''}>
                  <Td><span className="font-bold text-xs">{s.name}</span></Td>
                  <Td><span className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded">{s.code || 'N/A'}</span></Td>
                  <Td><span className="text-xs font-mono">{s.start}</span></Td>
                  <Td><span className="text-xs font-mono">{s.end}</span></Td>
                  <Td><span className="text-[10px] bg-slate-100 px-2 py-1 rounded">{s.grace}</span></Td>
                  <Td><span className="text-[10px] bg-slate-100 px-2 py-1 rounded">{s.breakTime || s.break || '—'}</span></Td>
                  <Td><Badge variant={assignedCount ? 'blue' : 'gray'}>{assignedCount}</Badge></Td>
                  <Td><Badge variant={s.otEnabled ? 'green' : 'gray'}>{s.otEnabled ? 'Eligible' : 'N/A'}</Badge></Td>
                  <Td><Badge variant={s.status === 'Active' ? 'blue' : 'gray'}>{s.status}</Badge></Td>
                  {isAdmin && (
                    <Td>
                      <div className="flex items-center gap-2">
                        <button className="text-[10px] text-brand-600 hover:underline font-bold" onClick={() => openAssignShift(s)}>Assign</button>
                        <button className="text-[10px] text-brand-600 hover:underline font-bold" onClick={() => handleOpenShiftModal(s)}>Edit</button>
                        {s.status !== 'Archived' && <button className="text-[10px] text-amber-600 hover:underline font-bold" onClick={() => handleArchiveShift(s.id)}>Archive</button>}
                        <button className="text-[10px] text-rose-600 hover:underline font-bold" onClick={() => handleDeleteShift(s.id)}>Delete</button>
                      </div>
                    </Td>
                  )}
                </Tr>
                );
              })}
            </Tbody>
          </Table>
          )}
          </Paginated>
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
            <Input label="Break Time" value={shiftForm.breakTime} onChange={e => setShiftForm({...shiftForm, breakTime: e.target.value})} placeholder="e.g. 1 hr" />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">Overtime Eligibility</label>
                <select 
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={shiftForm.status}
                  onChange={e => setShiftForm({...shiftForm, status: e.target.value})}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Archived">Archived</option>
                </select>
             </div>
          </div>
        </div>
      </Modal>

      {/* ASSIGN EMPLOYEES TO SHIFT MODAL */}
      <Modal
        open={!!assignShift}
        onClose={() => setAssignShift(null)}
        title={assignShift ? `Assign Employees — ${assignShift.name}` : ''}
        footer={<>
          <Button variant="outline" onClick={() => setAssignShift(null)}>Cancel</Button>
          <Button loading={assignBusy} onClick={handleSaveAssignments}>Save Assignments ({assignIds.length})</Button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Select the employees who work this shift. Unchecking removes them from the shift.</p>
          <div className="flex items-center justify-between text-[11px]">
            <button className="text-brand-600 font-bold hover:underline" onClick={() => setAssignIds(companyEmployees.map((e: any) => String(e.id)))}>Select all</button>
            <button className="text-slate-500 font-bold hover:underline" onClick={() => setAssignIds([])}>Clear all</button>
          </div>
          <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {companyEmployees.length === 0 && <div className="p-3 text-xs text-slate-400 text-center">No employees in this workspace.</div>}
            {companyEmployees.map((e: any) => {
              const id = String(e.id);
              const checked = assignIds.includes(id);
              return (
                <label key={id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={checked}
                    onChange={() => setAssignIds(prev => checked ? prev.filter(x => x !== id) : [...prev, id])} />
                  <span className="font-semibold text-slate-700">{e.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">{e.employeeId}</span>
                  <span className="ml-auto text-[10px] text-slate-400">{e.department}</span>
                </label>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* TAB: IMPORT */}
      {activeTab === 'import' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="text-xs h-9" onClick={downloadTemplate}><Download size={14} className="mr-2"/> Attendance Template</Button>
            <Button variant="outline" className="text-xs h-9" onClick={downloadGuide}><FileText size={14} className="mr-2"/> Import Guide</Button>
          </div>
          <AttendanceSheetImport role={role} companyId={activeCompanyId} onRefresh={onRefresh} />
        </div>
      )}

      {/* TAB: REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm items-end">
            <div className="w-full md:w-48">
              <Input type="date" label="Report Date" max={today} value={selectedDate} onChange={e => setSelectedDate(clampPast(e.target.value))} />
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
            <StatCard label="Total Employees" value={filteredReportRecords.length} icon={<Users size={16} className="text-slate-600" />} color="bg-slate-50" />
            <StatCard label="Present" value={filteredReportRecords.filter(r => r.status === 'Present').length} icon={<CheckCircle2 size={16} className="text-emerald-600" />} color="bg-emerald-50" />
            <StatCard label="Absent" value={filteredReportRecords.filter(r => r.status === 'Absent').length} icon={<XCircle size={16} className="text-rose-600" />} color="bg-rose-50" />
            <StatCard label="On Leave" value={filteredReportRecords.filter(r => r.status === 'Leave').length} icon={<Calendar size={16} className="text-brand-600" />} color="bg-brand-50" />
            <StatCard label="Late Mark" value={filteredReportRecords.filter(r => r.flags?.includes('Late Mark')).length} icon={<AlertCircle size={16} className="text-amber-600" />} color="bg-amber-50" />
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
                <Paginated items={section.records} resetKey={`${selectedDate}|${reportDept}|${reportBranch}`} label="employees">
                {(rows: any[]) => (
                <Table>
                  <Thead><tr><Th>Employee</Th><Th>Department</Th><Th>In/Out Time</Th><Th>Status</Th></tr></Thead>
                  <Tbody>
                    {rows.map((r: any) => (
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
                )}
                </Paginated>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB: CONFIG / SETTINGS */}
      {activeTab === 'config' && isAdmin && (
        <div className="space-y-4 animate-in fade-in">
          {/* ── Attendance Date Policy (future-date rule) ─────────────────────── */}
          <Card>
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-800">Attendance Date Policy</h3>
              <p className="text-xs text-slate-500">Control whether attendance may be marked for dates after today. Past dates &amp; today are always editable (subject to permissions).</p>
            </div>
            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer">
              <input type="checkbox" className="mt-0.5 rounded border-slate-300 text-brand-600"
                checked={futurePolicy.allow} onChange={e => updateFuturePolicy({ allow: e.target.checked })} />
              <span>
                <span className="block text-sm font-bold text-slate-800">Allow Future Attendance</span>
                <span className="block text-[11px] text-slate-500">Default: OFF. When off, dates after today can never be edited or saved — in any view, for any role.</span>
              </span>
            </label>
            {futurePolicy.allow && (
              <div className="mt-3 flex flex-wrap items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50">
                <span className="text-xs font-bold text-amber-800">Maximum Future Days Allowed</span>
                <div className="w-28">
                  <Select value={String(futurePolicy.maxDays || 1)} onChange={e => updateFuturePolicy({ maxDays: Number(e.target.value) })}
                    options={[1, 3, 7, 30].map(n => ({ value: String(n), label: `${n} day${n > 1 ? 's' : ''}` }))} className="text-xs h-8" />
                </div>
                <span className="text-[11px] text-amber-700">Editable through <b>{formatDate(maxEditableDate)}</b>. The server enforces the same limit.</span>
              </div>
            )}
          </Card>

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
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${attendanceMode === mode.id ? 'border-brand-500 bg-brand-50/50 shadow-sm' : 'border-slate-100 hover:border-slate-300 bg-white'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-slate-800">{mode.label}</span>
                        {attendanceMode === mode.id && <CheckCircle2 size={16} className="text-brand-500" />}
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

      {/* ENTERPRISE EXPORT MODAL */}
      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Attendance"
        footer={<><Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button><Button onClick={runExport} className="flex items-center gap-2"><Download size={14} /> Export</Button></>}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">Period</label>
            <div className="grid grid-cols-5 gap-1.5">
              {(['daily','weekly','monthly','yearly','custom'] as PeriodMode[]).map(m => (
                <button key={m} onClick={() => setExportMode(m)} className={`py-2 text-[11px] font-bold rounded-lg border capitalize ${exportMode === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>{m}</button>
              ))}
            </div>
            {exportMode === 'custom' && (
              <div className="flex items-center gap-2 mt-2">
                <Input type="date" max={today} value={customStart} onChange={e => setCustomStart(clampPast(e.target.value))} className="text-xs h-8" />
                <span className="text-slate-400 text-xs">to</span>
                <Input type="date" max={today} value={customEnd} onChange={e => setCustomEnd(clampPast(e.target.value))} className="text-xs h-8" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">Format</label>
            <div className="grid grid-cols-4 gap-1.5">
              {([['excel','Excel',Download],['pdf','PDF',FileText],['csv','CSV',Database],['print','Print',Printer]] as [ExportFormat,string,any][]).map(([f, label, Icon]) => (
                <button key={f} onClick={() => setExportFormat(f)} className={`py-2 text-[11px] font-bold rounded-lg border flex items-center justify-center gap-1.5 ${exportFormat === f ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}><Icon size={13} /> {label}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">Scope</label>
            <Select value={exportScope} onChange={e => setExportScope(e.target.value as any)} options={[
              { value: 'all', label: 'All Companies' },
              ...(companyOptions.length > 1 ? [{ value: 'multiple', label: 'Multiple Companies' }, { value: 'company', label: 'Single Company' }] : []),
              { value: 'branch', label: 'Branch' },
              { value: 'department', label: 'Department' },
              { value: 'individual', label: 'Individual Employee' },
            ]} className="text-xs h-9" />
          </div>

          {exportScope === 'company' && (
            <Select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} options={[{ value: '', label: 'Select company…' }, ...companyOptions]} className="text-xs h-9" />
          )}
          {exportScope === 'multiple' && (
            <div className="border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-1.5">
              {companyOptions.map(c => (
                <label key={c.value} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={exportCompanyIds.includes(c.value)} onChange={e => setExportCompanyIds(e.target.checked ? [...exportCompanyIds, c.value] : exportCompanyIds.filter(id => id !== c.value))} className="rounded border-slate-300 text-brand-600" />
                  {c.label}
                </label>
              ))}
            </div>
          )}
          {exportScope === 'branch' && (
            <Select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} options={[{ value: '', label: 'Select branch…' }, ...branches.map(b => ({ value: b, label: b }))]} className="text-xs h-9" />
          )}
          {exportScope === 'department' && (
            <Select value={filterDept} onChange={e => setFilterDept(e.target.value)} options={[{ value: '', label: 'Select department…' }, ...departments.map(d => ({ value: d, label: d }))]} className="text-xs h-9" />
          )}
          {exportScope === 'individual' && (
            <Select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} options={[{ value: '', label: 'Select employee…' }, ...activeUniqueEmployees.map(e => ({ value: e.id, label: e.name }))]} className="text-xs h-9" />
          )}

          <p className="text-[10px] text-slate-400">Exports the selected period &amp; scope. Excel/CSV for spreadsheets, PDF for sharing, Print for hard copy.</p>
        </div>
      </Modal>

      {/* Edit Attendance (monthly summary) */}
      <Modal open={!!editSummary} onClose={() => setEditSummary(null)} title="Edit Attendance" size="lg">
        {editSummary && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div>
                <p className="font-bold text-slate-800 text-sm">{editSummary.employeeName}</p>
                <p className="text-[11px] text-slate-500">{editSummary.employeeCode} · {SUMMARY_MONTH} {SUMMARY_YEAR}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Payable Days</p>
                <p className="text-lg font-extrabold text-brand-600">{payablePreview}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['presentDays', 'Present Days'], ['absentDays', 'Absent Days'],
                ['cl', 'CL'], ['pl', 'PL'], ['sl', 'SL'], ['lwp', 'LWP'],
                ['halfDays', 'Half Days'], ['otHours', 'OT Hours'],
              ].map(([key, label]) => (
                <Input key={key} label={label} type="number" step="0.5" min="0"
                  value={String(summaryForm[key])}
                  onChange={e => setSummaryForm({ ...summaryForm, [key]: e.target.value })} />
              ))}
            </div>
            <Select label="Shift" value={summaryForm.shift || ''}
              onChange={e => setSummaryForm({ ...summaryForm, shift: e.target.value })}
              options={[{ value: '', label: '— None —' }, ...shifts.map((s: any) => ({ value: s.name, label: s.name })), { value: 'General', label: 'General' }]} />

            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
              Saving recalculates Payable Days and marks this month's payroll <strong>Requires Regeneration</strong>. The change is recorded in the audit log.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditSummary(null)}>Cancel</Button>
              <Button onClick={saveSummary} disabled={savingSummary}>{savingSummary ? 'Saving…' : 'Save Attendance'}</Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};

