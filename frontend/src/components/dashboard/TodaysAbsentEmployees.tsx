import React, { useEffect, useMemo, useState } from 'react';
import { Search, UserX, ChevronRight, PartyPopper } from 'lucide-react';
import type { Employee, AttendanceRecord, LeaveRequest } from '@/types';
import { api } from '@/api/apiClient';

/**
 * TodaysAbsentEmployees — a single, live, actionable widget that lets a Company
 * Head see exactly who is not at work today without opening the Attendance
 * module. Replaces the earlier Employee-Status / Company-Health cards.
 *
 * Live data: seeds instantly from the already-loaded scoped `attendance` prop,
 * then refreshes from the read-only /attendance endpoint every 60s. It NEVER
 * writes — no attendance/payroll/leave/API/DB/permission logic is changed.
 *
 * "Absent" here means "expected but not working today": explicitly Absent, on
 * Leave, or Half Day. Weekly-Off and Holiday are deliberately excluded — they
 * are legitimate non-working days, not absences, and would otherwise flood the
 * list on a company holiday.
 *
 * There is NO separate "No Punch" category: an employee with no valid
 * attendance for today simply counts as ABSENT, and leaves that count the
 * moment a record appears (biometric sync, import, manual marking or a
 * correction) — the widget then shows whatever status the attendance engine
 * assigned (Present / Late / Half Day / …). This is a DISPLAY rule only; no
 * attendance status, record, rule or API is created or changed here.
 */
interface Props {
  /** Scoped employees for the active company/branch. */
  employees: Employee[];
  /** Scoped attendance (all dates) — instant fallback before the live fetch. */
  attendance: AttendanceRecord[];
  /** Scoped leave requests. */
  leaves: LeaveRequest[];
  /** Today as YYYY-MM-DD (the Asia/Kolkata day the dashboard is using). */
  todayStr: string;
  onNavigate: (page: any) => void;
}

type Category = 'Absent' | 'Leave' | 'Half Day' | 'Unknown';

const PRESENT_STATUSES = ['Present', 'Work From Home', 'On Duty'];
// Shift-specific "at work" outcomes the attendance engine may assign once a
// punch arrives (Late / Early Out / Late Present …). They are recognised, never
// redefined — the engine remains the only thing that decides them.
const AT_WORK = /\b(late|early\s*out|early\s*going|on\s*duty|overtime)\b/i;
const CAT: Record<Category, { badge: string; dot: string; order: number }> = {
  'Absent':   { badge: 'bg-rose-50 text-rose-600 ring-rose-200',      dot: 'bg-rose-500',   order: 0 },
  'Leave':    { badge: 'bg-orange-50 text-orange-600 ring-orange-200', dot: 'bg-orange-500', order: 1 },
  'Half Day': { badge: 'bg-yellow-50 text-yellow-700 ring-yellow-200', dot: 'bg-yellow-500', order: 2 },
  'Unknown':  { badge: 'bg-slate-100 text-slate-600 ring-slate-200',  dot: 'bg-slate-400',  order: 3 },
};
const FILTERS = ['All', 'Absent', 'Leave', 'Half Day'] as const;
const PAGE = 8;

interface Row {
  emp: Employee;
  category: Category;
  reason: string;
  shift?: string;
  lastPunch?: string;
  branch?: string;
}

export const TodaysAbsentEmployees: React.FC<Props> = ({ employees, attendance, leaves, todayStr, onNavigate }) => {
  const [live, setLive] = useState<AttendanceRecord[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');

  const scopedIds = useMemo(() => new Set(employees.map(e => e.id)), [employees]);

  // A stable fingerprint of TODAY's attendance in the app's own state. The array
  // identity changes on every render, so the refresh effect keys off this string
  // instead — it only changes when a record is actually added or edited.
  const todaySignature = useMemo(
    () => attendance.filter(a => a.date === todayStr).map(a => `${a.employeeId}:${a.status}`).sort().join('|'),
    [attendance, todayStr]
  );

  // LIVE RECALCULATION. Read-only fetch on mount, every 60s, whenever the tab
  // regains focus, and whenever the app's own attendance state changes (manual
  // marking, correction, import or biometric sync all flow through it). So an
  // employee drops out of Absent as soon as their record exists — no reload,
  // and without this widget ever writing anything.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await api.attendance.getAll();
        if (active && Array.isArray(data)) setLive(data as AttendanceRecord[]);
      } catch { /* keep prop fallback */ }
    };
    load();
    const id = setInterval(load, 60_000);
    const onFocus = () => { if (document.visibilityState !== 'hidden') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      active = false; clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [todaySignature]);

  const todayRecords = useMemo(() => {
    const source = live ?? attendance;
    const map = new Map<string, AttendanceRecord>();
    source.forEach(a => {
      if (a.date === todayStr && scopedIds.has(a.employeeId)) map.set(a.employeeId, a);
    });
    return map;
  }, [live, attendance, todayStr, scopedIds]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    employees.forEach(emp => {
      if (emp.status !== 'Active' && emp.status !== 'On Leave') return; // skip exited/archived
      const rec = todayRecords.get(emp.id);
      const approvedLeave = leaves.find(l =>
        l.employeeId === emp.id && String(l.status) === 'Approved' && todayStr >= l.fromDate && todayStr <= l.toDate
      );

      let category: Category | null = null;
      let reason = '';
      if (rec) {
        const st = String(rec.status);
        if (PRESENT_STATUSES.includes(st) || AT_WORK.test(st)) return; // at work → not absent
        if (st === 'Weekly Off' || st === 'Holiday') return; // legitimate day off
        if (st === 'Absent') { category = 'Absent'; reason = 'Marked absent'; }
        else if (st === 'Leave') { category = 'Leave'; reason = rec.leaveType || approvedLeave?.leaveType ? `${rec.leaveType || approvedLeave?.leaveType} Leave` : 'On leave'; }
        else if (st === 'Half Day') { category = 'Half Day'; reason = 'Half day'; }
        else { category = 'Unknown'; reason = st; }
      } else if (approvedLeave) {
        category = 'Leave';
        reason = `${approvedLeave.leaveType} Leave`;
      } else {
        // No attendance record yet → ABSENT (no separate "No Punch" bucket).
        // As soon as a punch/import/manual entry creates a record, the branch
        // above takes over and the employee leaves this list automatically.
        category = 'Absent';
        reason = 'No attendance recorded yet';
      }
      if (!category) return;

      out.push({
        emp,
        category,
        reason,
        shift: rec?.shift || undefined,
        lastPunch: rec?.clockOut || rec?.clockIn || undefined,
        branch: emp.branchLocation || undefined,
      });
    });

    // Sort: category order (Absent → Leave → Half Day) then name A→Z.
    return out.sort((a, b) =>
      CAT[a.category].order - CAT[b.category].order || (a.emp.name || '').localeCompare(b.emp.name || '')
    );
  }, [employees, todayRecords, leaves, todayStr]);

  // Present = employees the attendance engine has actually marked as at work
  // today (its own statuses, read as-is — nothing is reclassified).
  const presentCount = useMemo(() => employees.filter(emp => {
    if (emp.status !== 'Active' && emp.status !== 'On Leave') return false;
    const rec = todayRecords.get(emp.id);
    if (!rec) return false;
    const st = String(rec.status);
    return PRESENT_STATUSES.includes(st) || AT_WORK.test(st);
  }).length, [employees, todayRecords]);

  const summary = useMemo(() => ({
    present: presentCount,
    absent: rows.filter(r => r.category === 'Absent').length,
    leave: rows.filter(r => r.category === 'Leave').length,
    halfDay: rows.filter(r => r.category === 'Half Day').length,
  }), [rows, presentCount]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (filter !== 'All' && r.category !== filter) return false;
      if (!q) return true;
      return (
        (r.emp.name || '').toLowerCase().includes(q) ||
        (r.emp.employeeId || '').toLowerCase().includes(q) ||
        (r.emp.department || '').toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  const shown = filtered.slice(0, PAGE);
  const overflow = filtered.length - shown.length;

  const goToAttendance = () => {
    // Non-destructive hint so the Attendance page can open pre-focused on today's
    // absentees if it chooses to read it; harmless if ignored.
    try { localStorage.setItem('hrms_attendance_focus', JSON.stringify({ date: todayStr, status: 'Absent' })); } catch { /* ignore */ }
    onNavigate('attendance');
  };

  const SUMMARY = [
    { label: 'Present', value: summary.present, color: 'text-emerald-600' },
    { label: 'Absent Today', value: summary.absent, color: 'text-rose-600' },
    { label: 'Leave', value: summary.leave, color: 'text-orange-600' },
    { label: 'Half Day', value: summary.halfDay, color: 'text-yellow-700' },
  ];

  return (
    <div className="bg-white rounded-[18px] border border-[#E5E7EB] shadow-sm p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600"><UserX size={16} /></span>
          <h4 className="text-[14px] font-bold text-gray-800">Today's Absent Employees</h4>
        </div>
        <button onClick={goToAttendance} className="text-[11px] font-bold text-[#2563EB] hover:underline flex items-center gap-0.5">
          View All <ChevronRight size={12} />
        </button>
      </div>

      {rows.length === 0 ? (
        /* Empty state — everyone present */
        <div className="flex flex-col items-center justify-center text-center py-10">
          <PartyPopper size={30} className="text-emerald-500 mb-3" />
          <p className="text-[14px] font-bold text-gray-800">🎉 Great News!</p>
          <p className="text-[12px] text-gray-500 mt-1">No employees are absent today. Everyone is present.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            {SUMMARY.map(s => (
              <div key={s.label} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
                <div className={`text-[20px] font-bold leading-none ${s.color}`}>{s.value}</div>
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-1 truncate">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Search + filter chips */}
          <div className="space-y-2 mb-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search name, ID or department…"
                className="w-full h-9 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[12px] text-slate-700 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    filter === f ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[12px] font-semibold text-slate-500">No employees match your search or filter.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {shown.map(r => (
                <div key={r.emp.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                  {/* Avatar */}
                  {r.emp.photo
                    ? <img src={r.emp.photo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    : <span className="w-9 h-9 rounded-full bg-brand-50 text-[#2563EB] flex items-center justify-center text-[12px] font-bold shrink-0">{r.emp.avatar || (r.emp.name || '?').charAt(0)}</span>}
                  {/* Identity */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-bold text-gray-800 truncate">{r.emp.name}</p>
                      <span className="text-[10px] font-mono text-gray-400 shrink-0">{r.emp.employeeId}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">
                      {[r.emp.department, r.emp.designation, r.shift, r.branch].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  {/* Status */}
                  <div className="text-right shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${CAT[r.category].badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${CAT[r.category].dot}`} /> {r.category}
                    </span>
                    <p className="text-[10px] text-gray-400 mt-1 truncate max-w-[130px] ml-auto">
                      {r.reason}{r.lastPunch ? ` · ${r.lastPunch}` : ''}
                    </p>
                  </div>
                </div>
              ))}

              {overflow > 0 && (
                <button
                  onClick={goToAttendance}
                  className="w-full py-2 mt-1 text-[12px] font-semibold text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                >
                  +{overflow} More →
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TodaysAbsentEmployees;
