import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Users, CalendarClock, CalendarCheck, XCircle, Clock, Database, Wallet,
  CheckCircle2, RefreshCcw, Loader2, Search, ArrowLeft, ArrowRight, X,
  AlertTriangle, Building2, CalendarDays, ChevronRight, ChevronDown, ChevronUp,
  ShieldCheck, FileSpreadsheet, Send,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { ui } from '@/components/ui/feedback';
import {
  type Employee, type Company, type Role, type AttendanceRecord,
  type LeaveRequest, type PayrollRecord,
} from '@/data/mockData';
import type { UserAccount } from '@/pages/Login';
import { isCompanyIdMatch, resolveActiveWorkspace } from '@/types';
import { getUniqueEmployees } from '@/utils/deduplication';
import { isActiveEmployee } from '@/utils/employeeStatus';
import { usePermissions } from '@/context/PermissionContext';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { type ExportColumn } from '@/utils/exportUtils';

interface AttendanceSyncProps {
  role: Role;
  activeCompanyId: string;
  companies: Company[];
  employees: Employee[];
  attendance?: AttendanceRecord[];
  leaves?: LeaveRequest[];
  payroll?: PayrollRecord[];
  authProfile?: UserAccount | null;
  /** Navigate to another module (Attendance / Salary Worksheet). */
  onNavigate?: (page: string) => void;
  /** Re-hydrate app-wide data after a successful write. */
  onRefresh?: () => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const num1 = (n: number) => (Number(n) || 0).toFixed(1);

// Map a raw attendance status → coarse bucket (mirrors the backend syncPayroll
// engine so the page's calendar/derived figures match what gets written).
const bucketOf = (status: any): 'present' | 'wfh' | 'half' | 'leave' | 'holiday' | 'weeklyOff' | 'absent' => {
  const s = String(status || '').toLowerCase();
  if (/work from home|wfh/.test(s)) return 'wfh';
  if (/half[\s-]?day/.test(s)) return 'half';
  if (/leave/.test(s)) return 'leave';
  if (/holiday/.test(s)) return 'holiday';
  if (/weekly off|week off/.test(s)) return 'weeklyOff';
  if (/present|on duty|wfo/.test(s)) return 'present';
  return 'absent';
};

const BUCKET_STYLE: Record<string, { bg: string; label: string }> = {
  present: { bg: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Present' },
  wfh: { bg: 'bg-blue-100 text-blue-700 border-blue-200', label: 'WFH' },
  half: { bg: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Half Day' },
  leave: { bg: 'bg-brand-100 text-brand-700 border-brand-200', label: 'Paid Leave' },
  holiday: { bg: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200', label: 'Holiday' },
  weeklyOff: { bg: 'bg-slate-100 text-slate-600 border-slate-200', label: 'Weekly Off' },
  absent: { bg: 'bg-rose-100 text-rose-700 border-rose-200', label: 'Absent' },
};

// Human labels for the derived payroll status.
const PAYROLL_STATUS_LABEL: Record<string, string> = {
  not_generated: 'Not Generated', draft: 'Draft', prepared: 'Prepared', verified: 'Verified',
  pending_approval: 'Pending Approval', payment_pending: 'Payment Pending', approved: 'Approved',
  paid: 'Paid', payslip_generated: 'Payslip Ready', locked: 'Locked', failed: 'Failed',
};

// Phase-1 employee status — data-completeness of the attendance snapshot.
type SyncStatus = 'Ready' | 'Incomplete' | 'Attendance Missing' | 'No Attendance';

interface ViewRow {
  employeeId: any;
  code: string;
  employeeName: string;
  department: string;
  branch: string;
  daysInMonth: number;
  workingDays: number;   // Phase-1 basis for Daily Salary = calendar days in month
  present: number;
  weeklyOff: number;
  holiday: number;
  paidLeave: number;
  unpaidLeave: number;
  halfDay: number;
  absent: number;
  lop: number;
  payableDays: number;
  otHours: number;
  otAmount: number;
  lopDeduction: number;
  salary: number;          // Monthly Salary (from DB)
  dailySalary: number;     // salary ÷ workingDays
  payableSalary: number;   // dailySalary × payableDays  (NO PF/ESIC/PT/net — Phase 1)
  recordedDays: number;
  attendanceStatus: SyncStatus;
  payrollStatus: string;
}

export const AttendanceSync: React.FC<AttendanceSyncProps> = ({
  role, activeCompanyId, companies, employees, attendance = [], leaves = [], payroll = [],
  onNavigate, onRefresh,
}) => {
  const { canEdit: canEditModule } = usePermissions();
  const canWrite = canEditModule('payroll');

  // If this engine was opened from the Payroll Workflow's "Push to Payroll" button,
  // capture (and clear) the return flag once on entry, so a successful push routes
  // back to Payroll — and a later entry from the Attendance module never inherits it.
  const pushReturnRef = useRef<string | null>(null);
  useEffect(() => {
    try { pushReturnRef.current = sessionStorage.getItem('hrms_push_return'); sessionStorage.removeItem('hrms_push_return'); } catch { /* ignore */ }
  }, []);

  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());

  const [filterBranch, setFilterBranch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof ViewRow>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [detail, setDetail] = useState<ViewRow | null>(null);

  const monthName = MONTH_NAMES[month - 1];
  const monthPrefix = `${year}-${pad2(month)}`;
  const monthLabel = `${monthName} ${year}`;

  const currentCompany = resolveActiveWorkspace(companies as any[], activeCompanyId)
    || companies.find(c => String(c.id) === String(activeCompanyId));
  const activeIsBranch = !!(currentCompany as any)?.parentCompanyId && !(currentCompany as any)?.isHeadOffice;

  // Employees scoped to the active workspace — powers the filter dropdowns.
  const scopedEmployees = useMemo(() => {
    const uniq = getUniqueEmployees(employees).filter(isActiveEmployee);
    if (!activeCompanyId) return uniq;
    return uniq.filter(e => isCompanyIdMatch(e.companyId, activeCompanyId, companies, e.branchLocation, e.branchId));
  }, [employees, activeCompanyId, companies]);

  const empById = useMemo(() => {
    const m = new Map<string, Employee>();
    scopedEmployees.forEach(e => m.set(String(e.id), e));
    employees.forEach(e => { if (!m.has(String(e.id))) m.set(String(e.id), e); });
    return m;
  }, [scopedEmployees, employees]);

  const branchOptions = useMemo(
    () => Array.from(new Set(scopedEmployees.map(e => e.branchLocation || 'Head Office'))).filter(Boolean).sort(),
    [scopedEmployees]);
  const deptOptions = useMemo(
    () => Array.from(new Set(scopedEmployees.map(e => e.department).filter(Boolean))).sort(),
    [scopedEmployees]);

  // Payroll status for an employee in the selected period (DB-driven).
  const payStatusFor = useCallback((empId: any): string => {
    const rec = payroll.find(p =>
      String((p as any).employeeId) === String(empId)
      && [monthName, String(month), monthPrefix].includes(String(p.month))
      && Number(p.year) === Number(year));
    if (!rec) return 'not_generated';
    return String((rec as any).payrollStatus || (rec as any).status || 'draft');
  }, [payroll, monthName, month, monthPrefix, year]);

  // Count of raw attendance rows recorded for an employee in the month.
  const recordedDaysFor = useCallback((empId: any): number =>
    attendance.filter(a => String((a as any).employeeId) === String(empId) && String((a as any).date).startsWith(monthPrefix)).length,
    [attendance, monthPrefix]);

  // Approved UNPAID-leave (LWP) days that overlap this month, from the DB leaves.
  // Paid leave already comes from the sync engine; this isolates the unpaid portion
  // (leaveType flagged unpaid / without-pay, or an explicit lwpDays figure).
  const daysInThisMonth = new Date(year, month, 0).getDate();
  const unpaidLeaveDaysFor = useCallback((empId: any): number => {
    const monthStart = `${monthPrefix}-01`;
    const monthEnd = `${monthPrefix}-${pad2(daysInThisMonth)}`;
    return leaves.reduce((sum, l: any) => {
      if (String(l.employeeId) !== String(empId) || String(l.status) !== 'Approved') return sum;
      const isUnpaid = Number(l.lwpDays) > 0 || /lwp|unpaid|without\s*pay|loss\s*of\s*pay/i.test(String(l.leaveType || ''));
      if (!isUnpaid) return sum;
      const from = String(l.fromDate) > monthStart ? String(l.fromDate) : monthStart;
      const to = String(l.toDate) < monthEnd ? String(l.toDate) : monthEnd;
      if (from > to) return sum;
      const overlap = Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
      return sum + Math.max(0, Number(l.lwpDays) > 0 ? Math.min(overlap, Number(l.lwpDays)) : overlap);
    }, 0);
  }, [leaves, monthPrefix, daysInThisMonth]);

  // Expected working (non-Sunday) days ELAPSED so far in the selected month — the
  // yardstick for the completeness Status. Future months → 0; past → all; current →
  // up to today. Purely calendar-derived (no hardcoded values).
  const expectedWorkingElapsed = useMemo(() => {
    const isFuture = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);
    const isPast = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
    const elapsed = isFuture ? 0 : isPast ? daysInThisMonth : Math.min(now.getDate(), daysInThisMonth);
    let working = 0;
    for (let d = 1; d <= elapsed; d++) if (new Date(year, month - 1, d).getDay() !== 0) working++;
    return working;
  }, [year, month, daysInThisMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load the dry-run preview from the ONE payroll-sync engine ──────────────
  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDone(null);
    try {
      const res = await api.attendance.syncPayroll({
        companyId: activeCompanyId || undefined,
        month, year, dryRun: true,
      });
      setPreview(res);
    } catch (e: any) {
      setPreview(null);
      setError(getApiErrorMessage(e, 'Could not compute the attendance preview.'));
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, month, year]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  // Join backend rows with employee master + local attendance/payroll → view rows.
  const allRows: ViewRow[] = useMemo(() => {
    const rows: any[] = preview?.rows || [];
    return rows.map(r => {
      const emp = empById.get(String(r.employeeId));
      const daysInMonth = Number(r.daysInMonth) || new Date(year, month, 0).getDate();
      const weeklyOff = Number(r.weeklyOff) || 0;
      const holiday = Number(r.holiday) || 0;
      // ── Working-days model (enterprise standard) ──────────────────────────────
      // Working Days = Calendar Days − Weekly Off − Company Holidays (never exceeds
      // calendar days). Weekly-off/holiday are DB-derived per employee (weekly-off
      // policy + holiday calendar), so this is fully data-driven.
      const workingDays = Math.max(0, daysInMonth - weeklyOff - holiday);
      const present = Number(r.present) || 0;
      const paidLeave = Number(r.leave) || 0;
      const halfDay = Number(r.half) || 0;
      const salary = Number(r.salary) || 0;
      // Payable Days = Present + Paid Leave + (Half Day × 0.5), clamped to Working
      // Days. Weekly-off/holiday are NOT added (they are excluded from the divisor
      // instead → paid implicitly). Absent + Unpaid Leave are the LOP portion.
      const payableDays = Math.min(workingDays, present + paidLeave + halfDay * 0.5);
      const lop = Math.max(0, workingDays - payableDays); // LOP = Working − Payable
      // Daily Salary = Monthly Salary ÷ Working Days; Payable Salary = Daily × Payable.
      const dailySalary = workingDays > 0 ? salary / workingDays : 0;
      const payableSalary = Math.round(dailySalary * payableDays);
      const absent = Number(r.lopDays) || 0;
      const unpaidLeave = unpaidLeaveDaysFor(r.employeeId);

      const recordedDays = recordedDaysFor(r.employeeId);
      const empLeaves = leaves.some((l: any) => String(l.employeeId) === String(r.employeeId) && String(l.status) === 'Approved');
      const attendanceStatus: SyncStatus =
        recordedDays === 0
          ? (empLeaves ? 'Attendance Missing' : 'No Attendance')
          : expectedWorkingElapsed > 0 && recordedDays >= expectedWorkingElapsed
            ? 'Ready'
            : recordedDays >= Math.ceil(expectedWorkingElapsed * 0.5)
              ? 'Incomplete'
              : 'Attendance Missing';

      return {
        employeeId: r.employeeId,
        code: (emp as any)?.employeeId || '—',
        employeeName: r.employeeName || (emp as any)?.name || '—',
        department: r.department || (emp as any)?.department || 'General',
        branch: (emp as any)?.branchLocation || 'Head Office',
        daysInMonth,
        workingDays,
        present,
        weeklyOff,
        holiday,
        paidLeave,
        unpaidLeave,
        halfDay,
        absent,
        lop,
        payableDays,
        otHours: Number(r.otHours) || 0,
        otAmount: Number(r.otAmount) || 0,
        lopDeduction: Number(r.lopDeduction) || 0,
        salary,
        dailySalary,
        payableSalary,
        recordedDays,
        attendanceStatus,
        payrollStatus: payStatusFor(r.employeeId),
      };
    });
  }, [preview, empById, recordedDaysFor, unpaidLeaveDaysFor, payStatusFor, leaves, expectedWorkingElapsed, month, year]);

  // Apply header filters + search.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(r => {
      if (filterBranch && r.branch !== filterBranch) return false;
      if (filterDept && r.department !== filterDept) return false;
      if (filterEmployee && String(r.employeeId) !== String(filterEmployee)) return false;
      if (q && !(`${r.code} ${r.employeeName} ${r.department} ${r.branch}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [allRows, filterBranch, filterDept, filterEmployee, search]);

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      const av = a[sortKey] as any, bv = b[sortKey] as any;
      let r: number;
      if (typeof av === 'number' && typeof bv === 'number') r = av - bv;
      else r = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? r : -r;
    });
    return arr;
  }, [filteredRows, sortKey, sortDir]);

  // Summary totals across the FILTERED set (man-day framing + Phase-1 payable ₹).
  const totals = useMemo(() => filteredRows.reduce((acc, r) => ({
    employees: acc.employees + 1,
    present: acc.present + r.present,
    absent: acc.absent + r.absent,
    weeklyOff: acc.weeklyOff + r.weeklyOff,
    holiday: acc.holiday + r.holiday,
    payableDays: acc.payableDays + r.payableDays,
    lop: acc.lop + r.lop,
    paidLeave: acc.paidLeave + r.paidLeave,
    unpaidLeave: acc.unpaidLeave + r.unpaidLeave,
    halfDay: acc.halfDay + r.halfDay,
    otHours: acc.otHours + r.otHours,
    otAmount: acc.otAmount + r.otAmount,
    payableSalary: acc.payableSalary + r.payableSalary,
  }), { employees: 0, present: 0, absent: 0, weeklyOff: 0, holiday: 0, payableDays: 0, lop: 0, paidLeave: 0, unpaidLeave: 0, halfDay: 0, otHours: 0, otAmount: 0, payableSalary: 0 }),
    [filteredRows]);

  // Calendar-level facts for the period (single values for the summary cards).
  const monthDays = daysInThisMonth;
  const sundayCount = useMemo(() => {
    let c = 0;
    for (let d = 1; d <= monthDays; d++) if (new Date(year, month - 1, d).getDay() === 0) c++;
    return c;
  }, [monthDays, year, month]);
  // Company holidays for the period = the representative (max) holiday count across
  // employees in scope (holidays are company-wide; DB-derived from attendance).
  const periodHolidays = useMemo(
    () => filteredRows.reduce((mx, r) => Math.max(mx, r.holiday), 0),
    [filteredRows]);
  // Period Working Days = Calendar − Weekly Off − Holidays (never exceeds calendar).
  const periodWorkingDays = Math.max(0, monthDays - sundayCount - periodHolidays);

  const toggleSort = (key: keyof ViewRow) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // ── Validation before writing to payroll ──────────────────────────────────
  const buildValidation = (): { errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!preview || (preview.count || 0) === 0) errors.push('No employees are in scope for this period. Check the workspace and month.');
    if (!month || !year) errors.push('Select a valid payroll month and year before synchronizing.');

    const totalRecorded = allRows.reduce((s, r) => s + r.recordedDays, 0);
    if (allRows.length > 0 && totalRecorded === 0)
      errors.push(`No attendance records were found for ${monthLabel}. Import or record attendance before synchronizing.`);

    const lockedCount = allRows.filter(r => r.payrollStatus === 'locked').length;
    if (lockedCount > 0)
      errors.push(`Payroll for ${monthLabel} is locked for ${lockedCount} employee(s). Unlock the month in Payroll before re-synchronizing.`);

    // Optional company policy: attendance must be locked/closed before sync.
    const requiresLock = !!(currentCompany as any)?.requireAttendanceLockBeforeSync;
    const monthClosed = !!(currentCompany as any)?.attendanceClosedMonths?.includes?.(monthPrefix);
    if (requiresLock && !monthClosed)
      errors.push(`Company policy requires attendance for ${monthLabel} to be locked before it can be written to payroll.`);

    const already = allRows.filter(r => r.payrollStatus !== 'not_generated' && r.payrollStatus !== 'locked').length;
    if (already > 0)
      warnings.push(`Payroll already exists for ${already} employee(s) this month — re-pushing recomputes their attendance snapshot (no duplicate records are created).`);

    const incomplete = allRows.filter(r => r.attendanceStatus !== 'Ready').length;
    if (incomplete > 0)
      warnings.push(`${incomplete} employee(s) do not yet have a "Ready" attendance status (missing/partial daily punches). Their unrecorded working days will be treated as Absent (LOP) in the snapshot.`);

    return { errors, warnings };
  };
  const validation = useMemo(buildValidation, [preview, allRows, month, year, monthLabel, monthPrefix, currentCompany]);

  // ── PUSH TO PAYROLL ENGINE — transfer the finalized calculation to Payroll ──
  // Sends the EXACT reviewed per-employee values (payable days, estimated salary)
  // to the backend, which writes them VERBATIM into the Payroll module as one
  // draft batch. Payroll does NOT recalculate — gross = net = the estimated salary
  // shown here. Idempotent (no duplicate rows); blocked if a payroll batch already
  // exists for the period (→ Replace confirmation).
  const buildPushRows = () => sortedRows.map(r => ({
    employeeId: r.employeeId, employeeCode: r.code, employeeName: r.employeeName,
    department: r.department, branch: r.branch,
    monthlySalary: r.salary, workingDays: r.workingDays,
    present: r.present, paidLeave: r.paidLeave, unpaidLeave: r.unpaidLeave,
    halfDay: r.halfDay, otHours: r.otHours, weeklyOff: r.weeklyOff, holiday: r.holiday,
    payableDays: r.payableDays, dailySalary: r.dailySalary, payableSalary: r.payableSalary,
    attendanceStatus: r.attendanceStatus,
  }));

  const doPush = async (replace: boolean) => {
    setCommitting(true);
    try {
      const res = await api.attendance.pushToPayroll({
        companyId: activeCompanyId || undefined,
        month: monthName, year, rows: buildPushRows(), replace,
      });
      setDone(res);
      onRefresh?.();
      // When opened from the Payroll Workflow's "Push to Payroll" button, return
      // there automatically so the payroll counts/list/summary/progress refresh.
      if (pushReturnRef.current === 'payroll' && onNavigate) {
        pushReturnRef.current = null;
        ui.toast.success('Attendance successfully pushed to Payroll. Payroll records have been generated.');
        onNavigate('payroll');
      }
    } catch (e: any) {
      // Wallet gate refused BEFORE any payroll row was written.
      if (e?.data?.code === 'INSUFFICIENT_WALLET_BALANCE') {
        const inr = (v: any) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
        await ui.alert({
          title: 'Insufficient Payroll Wallet Balance',
          variant: 'danger',
          message:
            `Push to payroll was blocked — no payroll records were created.\n\n` +
            `Available balance: ${inr(e.data.walletBalance)}\n` +
            `Required for this payroll: ${inr(e.data.requiredAmount)}\n` +
            `Shortfall: ${inr(e.data.shortfall)}\n\n` +
            `Recharge the Payroll Wallet (Dashboard → Payroll Wallet) and try again.`,
        });
      // Duplicate payroll for the period → offer to replace the existing batch.
      } else if (e?.status === 409 || e?.data?.error === 'PAYROLL_EXISTS') {
        const ok = await ui.confirm({
          title: 'Payroll already generated',
          message: `${e?.data?.message || `Payroll already generated for ${monthLabel}.`}\n\nDo you want to REPLACE the existing payroll for ${monthLabel} with the current attendance calculation? Existing draft payroll for this period will be overwritten (no duplicates are created).`,
          variant: 'warning',
          confirmText: 'Replace Existing Payroll',
          cancelText: 'Cancel',
        });
        if (ok) return doPush(true);
      } else {
        ui.toast.error(getApiErrorMessage(e, 'Failed to push attendance to payroll.'));
      }
    } finally {
      setCommitting(false);
    }
  };

  const handlePush = async () => {
    if (!canWrite) { ui.toast.error('You do not have permission to push attendance to payroll.'); return; }
    const { errors, warnings } = validation;
    if (errors.length) {
      await ui.alert({
        title: 'Cannot generate payroll yet',
        message: 'Please resolve the following before pushing to the Payroll Engine:\n\n• ' + errors.join('\n• '),
        variant: 'danger',
      });
      return;
    }
    const proceed = await ui.confirm({
      title: 'Push to Payroll Engine',
      message:
        `Generate payroll for ${totals.employees} employee(s) for ${monthLabel} using the reviewed attendance calculation?\n\n`
        + (warnings.length ? '⚠ ' + warnings.join('\n⚠ ') + '\n\n' : '')
        + `Estimated Payroll: ${inr(totals.payableSalary)}. The exact payable days and estimated salary shown here are transferred to Payroll as-is — Payroll does NOT recalculate.`,
      variant: warnings.length ? 'warning' : 'info',
      confirmText: 'Push to Payroll Engine',
      cancelText: 'Cancel',
    });
    if (!proceed) return;
    await doPush(false);
  };

  // ── REFRESH CALCULATION — real attendance recalculation engine ────────────
  // STEP 1–10: read the payroll period → fetch that period's attendance (scoped
  // to the user's company/branch/employee) → recompute the company calendar +
  // per-employee attendance → payable days → payable salary → refresh the grid &
  // summary cards → PERSIST the recomputed snapshot (payroll calculation table,
  // AttendanceSummary) WITHOUT overwriting attendance and WITHOUT generating
  // payroll (`markSynced:false` = recalc, not the official "push") → show result.
  // Idempotent (upsert per employee/month → no duplicates); always uses the LATEST
  // attendance, so clicking again after an attendance edit recalculates everything.
  const handleRefresh = async () => {
    if (!canWrite) { ui.toast.error('You do not have permission to recalculate attendance.'); return; }
    if (!month || !year) { ui.toast.error('Select a valid payroll month and year.'); return; }
    setLoading(true);
    setError(null);
    setDone(null);
    try {
      // Recompute from the latest attendance for THIS payroll period + persist the
      // calculation snapshot. Server scopes by the requester's role & workspace.
      const res: any = await api.attendance.syncPayroll({
        companyId: activeCompanyId || undefined,
        month, year, dryRun: false, snapshotOnly: true, markSynced: false,
      });
      // Re-pull so the grid + cards reflect the freshly persisted calculation.
      const previewRes = await api.attendance.syncPayroll({
        companyId: activeCompanyId || undefined, month, year, dryRun: true,
      });
      setPreview(previewRes);
      onRefresh?.();

      // STEP 10 — result summary (attendance records actually read this period).
      const empIds = new Set((res?.rows || []).map((r: any) => String(r.employeeId)));
      const recordsRead = attendance.filter(a =>
        empIds.has(String((a as any).employeeId)) && String((a as any).date).startsWith(monthPrefix)).length;
      const processed = Number(res?.processed) || empIds.size;
      const updated = Number(res?.synced) || processed;
      await ui.alert({
        title: '✅ Attendance recalculated successfully',
        message:
          `Payroll Period: ${monthLabel}\n`
          + `Employees Processed: ${processed}\n`
          + `Attendance Records Read: ${recordsRead}\n`
          + `Payroll Updated: ${updated} Employee(s)\n\n`
          + `Calculations were refreshed from the latest attendance. No payroll was generated and attendance records were not modified.`,
      });
    } catch (e: any) {
      setError(getApiErrorMessage(e, 'Could not recalculate attendance.'));
      ui.toast.error(getApiErrorMessage(e, 'Could not recalculate attendance.'));
    } finally {
      setLoading(false);
    }
  };

  const exportColumns: ExportColumn[] = [
    { header: 'Sr No', key: 'srNo', width: 8 },
    { header: 'Employee Code', key: 'code', width: 16 },
    { header: 'Employee Name', key: 'employeeName', width: 24 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Branch', key: 'branch', width: 18 },
    { header: 'Monthly Salary', key: 'salary', width: 14 },
    { header: 'Working Days', key: 'workingDays', width: 12 },
    { header: 'Present', key: 'present', width: 10 },
    { header: 'Weekly Off', key: 'weeklyOff', width: 10 },
    { header: 'Holiday', key: 'holiday', width: 10 },
    { header: 'Paid Leave', key: 'paidLeave', width: 10 },
    { header: 'Unpaid Leave', key: 'unpaidLeave', width: 12 },
    { header: 'Half Day', key: 'halfDay', width: 10 },
    { header: 'Absent', key: 'absent', width: 10 },
    { header: 'Overtime', key: 'otHours', width: 10 },
    { header: 'Payable Days', key: 'payableDays', width: 12 },
    { header: 'Daily Salary', key: 'dailySalary', width: 12 },
    { header: 'Payable Salary', key: 'payableSalary', width: 14 },
    { header: 'Status', key: 'attendanceStatus', width: 16 },
  ];
  const exportRows = () => sortedRows.map((r, i) => ({
    ...r, srNo: i + 1, dailySalary: Math.round(r.dailySalary),
  }));

  // Step 1 — Company Summary cards (fully live / DB-driven values).
  const cards = [
    { label: 'Calendar Days', value: String(monthDays), sub: `${monthName} ${year}`, icon: <CalendarClock size={18} />, tint: 'bg-indigo-100 text-indigo-600' },
    { label: 'Working Days', value: String(periodWorkingDays), sub: `${monthDays} − ${sundayCount} WO − ${periodHolidays} Hol`, icon: <CalendarClock size={18} />, tint: 'bg-sky-100 text-sky-600' },
    { label: 'Weekly Off', value: String(sundayCount), sub: 'Days this month', icon: <CalendarDays size={18} />, tint: 'bg-slate-100 text-slate-500' },
    { label: 'Holidays', value: String(periodHolidays), sub: 'Company holidays', icon: <CalendarCheck size={18} />, tint: 'bg-fuchsia-100 text-fuchsia-600' },
    { label: 'Present', value: String(totals.present), sub: 'Man-days present', icon: <CalendarCheck size={18} />, tint: 'bg-emerald-100 text-emerald-600' },
    { label: 'Absent', value: String(totals.absent), sub: 'Loss of pay', icon: <XCircle size={18} />, tint: 'bg-rose-100 text-rose-600' },
    { label: 'Paid Leave', value: String(totals.paidLeave), sub: 'Approved leave', icon: <CalendarDays size={18} />, tint: 'bg-blue-100 text-blue-600' },
    { label: 'Half Days', value: String(totals.halfDay), sub: 'Half-day count', icon: <Clock size={18} />, tint: 'bg-orange-100 text-orange-600' },
    { label: 'Overtime', value: num1(totals.otHours), sub: 'Approved OT hrs', icon: <Clock size={18} />, tint: 'bg-fuchsia-100 text-fuchsia-600' },
    { label: 'Payable Days', value: num1(totals.payableDays), sub: 'To be paid', icon: <CheckCircle2 size={18} />, tint: 'bg-teal-100 text-teal-600' },
    { label: 'Est. Payroll Amount', value: inr(totals.payableSalary), sub: 'Sum of payable ₹', icon: <Wallet size={18} />, tint: 'bg-brand-100 text-brand-600' },
  ];

  const WORKFLOW_STEPS = ['Attendance', 'Company Summary', 'Employee Calculation', 'Review', 'Push to Payroll Engine', 'Payroll Snapshot'];
  const activeStepIdx = done ? 5 : 1;

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          {/* Breadcrumb — Attendance is the source of truth; this page pushes its
              finalized figures into the Payroll Snapshot (Phase 1). */}
          <nav className="flex items-center gap-1 text-[12px] font-semibold text-ink-secondary mb-1.5" aria-label="Breadcrumb">
            <button
              onClick={() => onNavigate?.('attendance')}
              className="inline-flex items-center gap-1 hover:text-brand-600 transition-colors"
            >
              <ArrowLeft size={13} /> Attendance
            </button>
            <ChevronRight size={13} className="text-ink-muted" />
            <span className="text-ink">Payroll Synchronization</span>
          </nav>
          <h1 className="text-xl font-bold text-ink font-heading tracking-tight flex items-center gap-2">
            <RefreshCcw size={20} className="text-brand-600" /> Attendance → Payroll Synchronization
          </h1>
          <p className="text-[13px] text-ink-secondary mt-1 max-w-3xl">
            Attendance is the source of truth. Review each employee's finalized attendance, payable days and payable salary, then push the snapshot to the Payroll Engine. <span className="font-semibold text-ink-secondary">Phase 1 — no PF, ESIC, PT, deductions or net salary are calculated here.</span>
          </p>
          {currentCompany && (
            <p className="text-[11px] text-ink-muted mt-1 font-medium">
              {activeIsBranch ? 'Branch' : 'Company'}: <span className="text-ink-secondary font-semibold">{currentCompany.name}</span> · Period: <span className="text-ink-secondary font-semibold">{monthLabel}</span>
            </p>
          )}
        </div>

        {/* Top-right controls */}
        <div className="flex flex-wrap items-end gap-2.5 xl:justify-end">
          <div className="w-[130px]">
            <Select label="Month" value={String(month)} onChange={e => setMonth(Number(e.target.value))}
              options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))} className="h-9 text-[13px]" />
          </div>
          <div className="w-[92px]">
            <Select label="Year" value={String(year)} onChange={e => setYear(Number(e.target.value))}
              options={[year - 1, year, year + 1].map(y => ({ value: String(y), label: String(y) }))} className="h-9 text-[13px]" />
          </div>
          <div className="w-[150px]">
            <Select label="Branch" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
              options={[{ value: '', label: 'All Branches' }, ...branchOptions.map(b => ({ value: b, label: b }))]} className="h-9 text-[13px]" />
          </div>
          <div className="w-[150px]">
            <Select label="Department" value={filterDept} onChange={e => setFilterDept(e.target.value)}
              options={[{ value: '', label: 'All Departments' }, ...deptOptions.map(d => ({ value: d, label: d }))]} className="h-9 text-[13px]" />
          </div>
          <div className="w-[170px]">
            <Select label="Employee" value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}
              options={[{ value: '', label: 'All Employees' }, ...scopedEmployees.map(e => ({ value: String(e.id), label: e.name }))]} className="h-9 text-[13px]" />
          </div>
          <Button variant="outline" size="sm" onClick={loadPreview} loading={loading} className="h-9">
            <RefreshCcw size={14} /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Workflow strip ─────────────────────────────────────────────── */}
      <div className="bg-surface border border-hairline rounded-card shadow-card px-4 py-3 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {WORKFLOW_STEPS.map((step, i) => (
            <React.Fragment key={step}>
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
                i === activeStepIdx ? 'bg-brand-100 text-brand-700'
                  : i < activeStepIdx ? 'text-emerald-600' : 'text-ink-muted'
              }`}>
                {i < activeStepIdx && <CheckCircle2 size={12} />}
                {step}
              </div>
              {i < WORKFLOW_STEPS.length - 1 && <ChevronRight size={13} className="text-ink-muted flex-shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Success banner ─────────────────────────────────────────────── */}
      {done && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-card shadow-card p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={22} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold text-emerald-800">Payroll generated successfully.</h3>
              {/* Report what the payroll ENGINE produced, not the pre-engine
                  estimate. `netTotal` / `overtimeTotal` come back from the push
                  after PF/ESI/PT and overtime have been applied; `totalAmount` is
                  only the attendance-derived figure reviewed above. */}
              <ul className="mt-2 space-y-1 text-[13px] text-emerald-700 font-medium">
                <li>• {Number(done.employees) || 0} Employee(s)</li>
                {done.netTotal != null ? (
                  <li>• Net Payroll {inr(Number(done.netTotal) || 0)} <span className="text-emerald-600/80">(estimate before deductions {inr(Number(done.totalAmount) || 0)})</span></li>
                ) : (
                  <li>• Estimated Payroll {inr(Number(done.totalAmount) || 0)}</li>
                )}
                {Number(done.overtimeTotal) > 0 && (
                  <li>• Overtime {inr(Number(done.overtimeTotal))} across {Number(done.otHoursTotal) || 0} hr(s) — included in net pay.</li>
                )}
                <li>• {done.replaced ? 'Existing payroll replaced' : 'Payroll batch created'} for {monthLabel}.</li>
                <li>• Salary calculated by the payroll engine from the synced attendance (overtime, PF, ESIC & PT applied).</li>
                {Number(done.failed) > 0 && (
                  <li className="text-amber-700">• {Number(done.failed)} employee(s) could not be calculated and are flagged for recalculation.</li>
                )}
              </ul>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" onClick={() => onNavigate?.('payroll')}>
                  Go to Payroll <ArrowRight size={14} />
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setDone(null); loadPreview(); }}>
                  Review Again
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Validation banner ──────────────────────────────────────────── */}
      {!done && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="space-y-2">
          {validation.errors.map((msg, i) => (
            <div key={`e${i}`} className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[12.5px] font-medium text-rose-700">
              <XCircle size={15} className="flex-shrink-0 mt-0.5" /> <span>{msg}</span>
            </div>
          ))}
          {validation.warnings.map((msg, i) => (
            <div key={`w${i}`} className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[12.5px] font-medium text-amber-700">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> <span>{msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Step 1 — Company Summary cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {cards.map(c => (
          <div key={c.label} className="min-w-0 bg-surface border border-hairline rounded-card shadow-card p-3.5 flex flex-col gap-1.5 transition-shadow hover:shadow-card-hover">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${c.tint}`}>{c.icon}</span>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary truncate" title={c.label}>{c.label}</p>
            <p className="text-lg font-bold text-ink font-heading tracking-tight tabular-nums leading-none truncate" title={c.value}>{c.value}</p>
            <p className="text-[10.5px] text-ink-muted font-medium truncate" title={c.sub}>{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="w-full sm:w-80">
          <Input icon={<Search size={15} />} placeholder="Search code, name, department, branch…"
            value={search} onChange={e => setSearch(e.target.value)} className="h-9 text-[13px]" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-ink-muted">{sortedRows.length} employee(s)</span>
          <ExportMenu
            columns={exportColumns}
            rows={exportRows}
            fileName={`Attendance_Sync_${monthName}_${year}`}
            title={`Attendance Synchronization — ${monthLabel}`}
            subtitle={currentCompany?.name}
            sheetName="Attendance Sync"
            size="sm"
            disabled={loading || sortedRows.length === 0}
          />
        </div>
      </div>

      {/* ── Step 2 — Employee table (DESKTOP: essential columns, NO horizontal
             scroll). Secondary figures live in the row drawer. ─────────────── */}
      <div className="hidden md:block">
        {/* table-fixed + colgroup makes the table lay out to exactly the
            container width — every column (incl. Action) stays fully visible
            with NO horizontal scroll. Long text columns truncate; full values
            remain available in the row drawer (View). Padding is compacted for
            this instance only so the fixed columns keep breathing room. */}
        <Table className="[&_th]:px-2.5 [&_td]:px-2.5 [&>table]:table-fixed">
          <colgroup>
            <col style={{ width: '104px' }} />{/* Emp Code */}
            <col />{/* Employee Name — absorbs remaining width */}
            <col style={{ width: '110px' }} />{/* Department */}
            <col style={{ width: '118px' }} />{/* Monthly Salary */}
            <col style={{ width: '66px' }} />{/* Working */}
            <col style={{ width: '66px' }} />{/* Present */}
            <col style={{ width: '72px' }} />{/* Payable */}
            <col style={{ width: '120px' }} />{/* Payable Salary */}
            <col style={{ width: '146px' }} />{/* Status */}
            <col style={{ width: '86px' }} />{/* Action */}
          </colgroup>
          <Thead>
            <tr>
              <SortTh label="Emp Code" col="code" {...{ sortKey, sortDir, toggleSort }} />
              <SortTh label="Employee Name" col="employeeName" {...{ sortKey, sortDir, toggleSort }} />
              <SortTh label="Department" col="department" {...{ sortKey, sortDir, toggleSort }} />
              <SortTh label="Monthly Salary" col="salary" align="right" {...{ sortKey, sortDir, toggleSort }} />
              <SortTh label="Working" col="workingDays" align="center" {...{ sortKey, sortDir, toggleSort }} />
              <SortTh label="Present" col="present" align="center" {...{ sortKey, sortDir, toggleSort }} />
              <SortTh label="Payable" col="payableDays" align="center" {...{ sortKey, sortDir, toggleSort }} />
              <SortTh label="Payable Salary" col="payableSalary" align="right" {...{ sortKey, sortDir, toggleSort }} />
              <SortTh label="Status" col="attendanceStatus" align="center" {...{ sortKey, sortDir, toggleSort }} />
              <Th className="text-center">Action</Th>
            </tr>
          </Thead>
          <Tbody>
            {loading ? (
              <Tr><Td colSpan={10} className="text-center py-10 text-ink-secondary">
                <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Computing attendance for {monthLabel}…</span>
              </Td></Tr>
            ) : error ? (
              <Tr><Td colSpan={10} className="text-center py-10 text-rose-600">{error}</Td></Tr>
            ) : sortedRows.length === 0 ? (
              <Tr><Td colSpan={10} className="text-center py-10 text-ink-secondary">No employees match the current filters for {monthLabel}.</Td></Tr>
            ) : sortedRows.map(r => (
              <Tr key={String(r.employeeId)} onClick={() => setDetail(r)}>
                <Td className="font-bold text-ink">{r.code}</Td>
                <Td className="font-semibold text-ink truncate">{r.employeeName}</Td>
                <Td className="text-ink-secondary truncate">{r.department}</Td>
                <Td className="text-right tabular-nums text-ink-secondary">{inr(r.salary)}</Td>
                <Td className="text-center tabular-nums">{r.workingDays}</Td>
                <Td className="text-center tabular-nums text-emerald-600 font-semibold">{r.present}</Td>
                <Td className="text-center tabular-nums font-bold text-ink">{num1(r.payableDays)}</Td>
                <Td className="text-right tabular-nums font-bold text-teal-700">{inr(r.payableSalary)}</Td>
                <Td className="text-center">
                  <Badge
                    variant={r.attendanceStatus === 'Ready' ? 'green' : r.attendanceStatus === 'No Attendance' ? 'red' : 'amber'}
                    dot
                  >
                    {r.attendanceStatus}
                  </Badge>
                </Td>
                <Td className="text-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDetail(r); }}
                    className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-100 transition-colors"
                  >
                    View <ChevronRight size={13} />
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>

      {/* ── Step 2 — MOBILE / small screens: cards instead of a wide table ── */}
      <div className="md:hidden space-y-2.5">
        {loading ? (
          <div className="text-center py-10 text-ink-secondary">
            <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Computing attendance…</span>
          </div>
        ) : error ? (
          <div className="text-center py-10 text-rose-600">{error}</div>
        ) : sortedRows.length === 0 ? (
          <div className="text-center py-10 text-ink-secondary">No employees match the current filters for {monthLabel}.</div>
        ) : sortedRows.map(r => (
          <button
            key={String(r.employeeId)}
            onClick={() => setDetail(r)}
            className="w-full text-left bg-surface border border-hairline rounded-card shadow-card p-3.5 active:bg-surface-muted transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-ink truncate">{r.employeeName}</p>
                <p className="text-[12px] text-ink-secondary truncate">{r.code} · {r.department}</p>
              </div>
              <Badge
                variant={r.attendanceStatus === 'Ready' ? 'green' : r.attendanceStatus === 'No Attendance' ? 'red' : 'amber'}
                dot
              >
                {r.attendanceStatus}
              </Badge>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3">
              <MobileStat label="Working" value={String(r.workingDays)} />
              <MobileStat label="Present" value={String(r.present)} tone="text-emerald-600" />
              <MobileStat label="Payable" value={num1(r.payableDays)} />
              <MobileStat label="Payable ₹" value={inr(r.payableSalary)} tone="text-teal-700" />
            </div>
            <div className="mt-2.5 flex items-center justify-between border-t border-hairline pt-2">
              <span className="text-[12px] text-ink-secondary">Monthly {inr(r.salary)}</span>
              <span className="inline-flex items-center gap-1 text-[12px] font-bold text-brand-700">View details <ChevronRight size={13} /></span>
            </div>
          </button>
        ))}
      </div>

      {/* ── Detail side panel ──────────────────────────────────────────── */}
      {detail && (
        <DetailPanel
          row={detail}
          monthLabel={monthLabel}
          monthPrefix={monthPrefix}
          month={month}
          year={year}
          attendance={attendance}
          leaves={leaves}
          onClose={() => setDetail(null)}
        />
      )}

      {/* ── Sticky action bar — bottom summary + Phase-1 actions ─────────── */}
      <div className="sticky bottom-0 z-30 border border-hairline rounded-card bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="px-4 md:px-5 py-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 min-w-0">
            <BottomStat label="Employees" value={String(totals.employees)} />
            <BottomStat label="Working Days" value={String(periodWorkingDays)} />
            <BottomStat label="Payable Days" value={num1(totals.payableDays)} />
            <BottomStat label="Estimated Payroll Amount" value={inr(totals.payableSalary)} accent />
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => onNavigate?.('attendance')} disabled={committing}>
              Cancel
            </Button>
            <Button variant="secondary" size="sm" onClick={handleRefresh} loading={loading} disabled={committing || !!done}>
              <RefreshCcw size={14} /> Refresh Calculation
            </Button>
            <Button size="sm" onClick={handlePush} loading={committing}
              disabled={loading || !!done || !canWrite || !preview || (preview?.count || 0) === 0 || validation.errors.length > 0}>
              <Send size={14} /> Push to Payroll Engine
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Bottom-bar summary stat ──────────────────────────────────────────────────
const BottomStat: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted whitespace-nowrap">{label}</p>
    <p className={`text-[15px] font-bold tabular-nums leading-none mt-0.5 ${accent ? 'text-teal-700' : 'text-ink'}`}>{value}</p>
  </div>
);

// ── Mobile card stat ─────────────────────────────────────────────────────────
const MobileStat: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone }) => (
  <div className="min-w-0">
    <p className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-muted truncate">{label}</p>
    <p className={`text-[13px] font-bold tabular-nums leading-tight truncate ${tone || 'text-ink'}`} title={value}>{value}</p>
  </div>
);

// ── Sortable table header cell ───────────────────────────────────────────────
const SortTh: React.FC<{
  label: string; col: keyof ViewRow; align?: 'left' | 'center' | 'right';
  sortKey: keyof ViewRow; sortDir: 'asc' | 'desc'; toggleSort: (k: keyof ViewRow) => void;
  className?: string;
}> = ({ label, col, align = 'left', sortKey, sortDir, toggleSort, className }) => {
  const active = sortKey === col;
  const alignCls = align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start';
  return (
    <Th className={`${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'} ${className || ''}`}>
      <button type="button" onClick={() => toggleSort(col)}
        className={`inline-flex items-center gap-1 w-full ${alignCls} hover:text-brand-600 transition-colors ${active ? 'text-brand-600' : ''}`}>
        {label}
        {active ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDownIcon />}
      </button>
    </Th>
  );
};

const ChevronsUpDownIcon: React.FC = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-ink-muted/50">
    <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
  </svg>
);

// ── Employee detail slide-over ───────────────────────────────────────────────
const DetailPanel: React.FC<{
  row: ViewRow; monthLabel: string; monthPrefix: string; month: number; year: number;
  attendance: AttendanceRecord[]; leaves: LeaveRequest[]; onClose: () => void;
}> = ({ row, monthLabel, monthPrefix, month, year, attendance, leaves, onClose }) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const allDates = Array.from({ length: daysInMonth }, (_, i) => `${monthPrefix}-${pad2(i + 1)}`);

  const attByDate = useMemo(() => {
    const m = new Map<string, any>();
    attendance.forEach(a => {
      if (String((a as any).employeeId) === String(row.employeeId)) m.set(String((a as any).date), a);
    });
    return m;
  }, [attendance, row.employeeId]);

  const empLeaves = useMemo(() => leaves.filter(l =>
    String((l as any).employeeId) === String(row.employeeId)
    && String((l as any).status) === 'Approved'
    && String((l as any).toDate) >= `${monthPrefix}-01`
    && String((l as any).fromDate) <= `${monthPrefix}-${pad2(daysInMonth)}`),
    [leaves, row.employeeId, monthPrefix, daysInMonth]);

  const dayBucket = (date: string): string => {
    const rec = attByDate.get(date);
    if (rec) return bucketOf(rec.status);
    const onLeave = empLeaves.find(l => date >= String((l as any).fromDate) && date <= String((l as any).toDate));
    if (onLeave) return 'leave';
    return new Date(date).getDay() === 0 ? 'weeklyOff' : 'absent';
  };

  const source = useMemo(() => {
    const rec = Array.from(attByDate.values())[0] as any;
    return rec?.source || rec?.importSource || rec?.method || (attByDate.size > 0 ? 'Attendance Records (DB)' : 'System Computed');
  }, [attByDate]);

  // Recorded raw punches for the month, newest-first (the Attendance History list).
  const recordedHistory = useMemo(() =>
    Array.from(attByDate.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, rec]) => ({ date, status: String((rec as any).status || 'Present'), bucket: bucketOf((rec as any).status) })),
    [attByDate]);

  const leadingBlanks = new Date(`${monthPrefix}-01`).getDay();

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-surface shadow-2xl border-l border-hairline flex flex-col">
        {/* header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-hairline">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-ink truncate">{row.employeeName}</h3>
            <p className="text-[12px] text-ink-secondary font-medium truncate">
              {row.code} · {row.department} · {row.branch}
            </p>
            <p className="text-[11px] text-ink-muted mt-0.5">{monthLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Payable salary (Phase 1 — attendance-driven only, NO deductions/net) */}
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-ink-secondary mb-2 flex items-center gap-1.5"><Wallet size={13} className="text-brand-600" /> Payable Salary</h4>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Monthly Salary" value={inr(row.salary)} />
              <Metric label="Working Days" value={String(row.workingDays)} />
              <Metric label="Daily Salary" value={inr(row.dailySalary)} />
              <Metric label="Payable Days" value={num1(row.payableDays)} tone="teal" />
              <Metric label="LOP Days" value={num1(row.lop)} tone="rose" />
              <Metric label="Payable Salary" value={inr(row.payableSalary)} tone="teal" />
            </div>
            <p className="mt-2 text-[11px] text-ink-muted font-medium">
              {inr(row.salary)} ÷ {row.workingDays} = {inr(row.dailySalary)} × {num1(row.payableDays)} = <span className="font-bold text-teal-700">{inr(row.payableSalary)}</span> · LOP = {row.workingDays} − {num1(row.payableDays)} = <span className="font-bold text-rose-600">{num1(row.lop)}</span>
            </p>
          </section>

          {/* Attendance breakdown */}
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-ink-secondary mb-2 flex items-center gap-1.5"><CalendarCheck size={13} className="text-brand-600" /> Attendance Breakdown</h4>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Working" value={String(row.workingDays)} />
              <Metric label="Present" value={String(row.present)} tone="emerald" />
              <Metric label="Weekly Off" value={String(row.weeklyOff)} />
              <Metric label="Holiday" value={String(row.holiday)} />
              <Metric label="Paid Leave" value={String(row.paidLeave)} tone="blue" />
              <Metric label="Unpaid Leave" value={String(row.unpaidLeave)} tone="orange" />
              <Metric label="Half Day" value={String(row.halfDay)} tone="orange" />
              <Metric label="Absent" value={String(row.absent)} tone="rose" />
              <Metric label="Overtime" value={num1(row.otHours)} tone="fuchsia" />
            </div>
          </section>

          {/* Daily calendar */}
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-ink-secondary mb-2 flex items-center gap-1.5"><CalendarDays size={13} className="text-brand-600" /> Daily Attendance</h4>
            <div className="grid grid-cols-7 gap-1 text-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="text-[10px] font-bold text-ink-muted py-1">{d}</div>
              ))}
              {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
              {allDates.map(date => {
                const b = dayBucket(date);
                const st = BUCKET_STYLE[b];
                const day = Number(date.slice(-2));
                return (
                  <div key={date} title={`${date} · ${st.label}`}
                    className={`aspect-square rounded-md border flex items-center justify-center text-[11px] font-semibold ${st.bg}`}>
                    {day}
                  </div>
                );
              })}
            </div>
            {/* legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
              {Object.values(BUCKET_STYLE).map(s => (
                <span key={s.label} className="inline-flex items-center gap-1 text-[10px] text-ink-secondary font-medium">
                  <span className={`w-2.5 h-2.5 rounded-sm border ${s.bg}`} /> {s.label}
                </span>
              ))}
            </div>
          </section>

          {/* Leave details */}
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-ink-secondary mb-2 flex items-center gap-1.5"><CalendarDays size={13} className="text-brand-600" /> Approved Leave</h4>
            {empLeaves.length === 0 ? (
              <p className="text-[12px] text-ink-muted">No approved leave overlapping {monthLabel}.</p>
            ) : (
              <div className="space-y-1.5">
                {empLeaves.map((l: any, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-muted border border-hairline text-[12px]">
                    <span className="font-semibold text-ink">{l.leaveType || l.type || 'Leave'}</span>
                    <span className="text-ink-secondary">{l.fromDate} → {l.toDate}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Attendance history — the recorded raw punches for the month (DB rows) */}
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-ink-secondary mb-2 flex items-center gap-1.5"><Clock size={13} className="text-brand-600" /> Attendance History</h4>
            {recordedHistory.length === 0 ? (
              <p className="text-[12px] text-ink-muted">No attendance was recorded for {monthLabel} — days are inferred (Weekly Off / Absent).</p>
            ) : (
              <div className="max-h-52 overflow-y-auto rounded-lg border border-hairline divide-y divide-hairline">
                {recordedHistory.map((h) => {
                  const st = BUCKET_STYLE[h.bucket];
                  return (
                    <div key={h.date} className="flex items-center justify-between px-3 py-1.5 text-[12px]">
                      <span className="font-medium text-ink-secondary tabular-nums">{h.date}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold border ${st.bg}`}>{h.status}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Source + payroll status */}
          <section className="grid grid-cols-2 gap-2">
            <Metric label="Attendance Source" value={String(source)} />
            <Metric label="Attendance Status" value={row.attendanceStatus}
              tone={row.attendanceStatus === 'Ready' ? 'emerald' : row.attendanceStatus === 'No Attendance' ? 'rose' : 'orange'} />
            <Metric label="Recorded Days" value={`${row.recordedDays} / ${row.workingDays}`} />
            <Metric label="Payroll Status" value={PAYROLL_STATUS_LABEL[row.payrollStatus] || row.payrollStatus} />
          </section>
        </div>

        <div className="px-5 py-3 border-t border-hairline">
          <Button variant="outline" size="sm" className="w-full" onClick={onClose}>Close</Button>
        </div>
      </aside>
    </>
  );
};

const Metric: React.FC<{ label: string; value: string; tone?: 'rose' | 'emerald' | 'blue' | 'orange' | 'fuchsia' | 'brand' | 'teal' }> = ({ label, value, tone }) => {
  const toneCls = tone === 'rose' ? 'text-rose-600' : tone === 'emerald' ? 'text-emerald-600'
    : tone === 'blue' ? 'text-blue-600' : tone === 'orange' ? 'text-orange-600'
    : tone === 'fuchsia' ? 'text-fuchsia-600' : tone === 'brand' ? 'text-brand-600'
    : tone === 'teal' ? 'text-teal-700' : 'text-ink';
  return (
    <div className="px-3 py-2 rounded-lg bg-surface-muted border border-hairline min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted truncate">{label}</p>
      <p className={`text-[13px] font-bold tabular-nums truncate ${toneCls}`} title={value}>{value}</p>
    </div>
  );
};

export default AttendanceSync;
