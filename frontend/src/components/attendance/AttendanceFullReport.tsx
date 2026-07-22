// ─────────────────────────────────────────────────────────────────────────────
// The "View Full Report" destination for the Attendance dashboard.
//
// ONE component serves both cards. Workforce Analytics and Department
// Distribution are two views of the same aggregate — the server computes them
// from a single tally (services/attendanceReportService.js) precisely so their
// numbers cannot disagree — so rendering them from two separate components would
// re-introduce, in the UI, the drift the backend was built to prevent. `variant`
// selects which sections appear and which one leads.
//
// Everything shown here comes from the server: scope, branch confinement, date
// range and every metric. Nothing is recomputed client-side, so what the report
// shows is what the database holds.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { AlertTriangle, RefreshCcw, Users, TrendingUp, Building2, Clock } from 'lucide-react';

export type ReportVariant = 'workforce' | 'department';

interface Tally {
  present: number; wfh: number; halfDay: number; leave: number; absent: number;
  nonWorking: number; late: number; earlyExit: number; records: number;
  attendancePercent: number;
}
interface SeriesPoint extends Tally { key: string }
interface DeptRow extends Tally { department: string; employees: number }
interface EmpRow extends Tally {
  employeeId: number; code: string | null; name: string; department: string;
  designation: string | null; branch: string | null; overtimeHours: number;
}
interface ReportPayload {
  range: { from: string; to: string };
  scope: {
    workspaceId: number; companyId: number; branchId: number | null; branchName: string | null;
    department: string | null; branches: { id: number; name: string }[];
  };
  totals: Tally & { employees: number; overtimeHours: number };
  daily: SeriesPoint[];
  weekly?: SeriesPoint[];
  monthly?: SeriesPoint[];
  byDepartment: DeptRow[];
  byEmployee?: EmpRow[];
  employees?: EmpRow[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  variant: ReportVariant;
  companyId: any;
  /** Date range carried over from the dashboard, so filters are preserved. */
  from: string;
  to: string;
  companyLabel?: string;
}

const pct = (n: number) => `${Number(n ?? 0).toFixed(1)}%`;

/** Colour per bucket — one definition, reused by every chart and legend. */
const BUCKETS = [
  { key: 'present', label: 'Present', cls: 'bg-emerald-500', text: 'text-emerald-600' },
  { key: 'absent', label: 'Absent', cls: 'bg-rose-500', text: 'text-rose-600' },
  { key: 'leave', label: 'Leave', cls: 'bg-amber-500', text: 'text-amber-600' },
  { key: 'halfDay', label: 'Half Day', cls: 'bg-sky-500', text: 'text-sky-600' },
  { key: 'wfh', label: 'WFH', cls: 'bg-brand-500', text: 'text-brand-600' },
] as const;

/** A pure-CSS stacked bar. No chart library is added for this. */
const StackedBar: React.FC<{ row: Tally; height?: string }> = ({ row, height = 'h-2' }) => {
  const total = BUCKETS.reduce((s, b) => s + (row[b.key] || 0), 0) || 1;
  return (
    <div className={`w-full ${height} rounded-full overflow-hidden bg-slate-100 flex`}>
      {BUCKETS.map(b => {
        const v = row[b.key] || 0;
        if (!v) return null;
        return <div key={b.key} className={b.cls} style={{ width: `${(v / total) * 100}%` }} title={`${b.label}: ${v}`} />;
      })}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode; tone?: string }> =
  ({ label, value, sub, icon, tone = 'text-slate-900' }) => (
  <div className="bg-white rounded-2xl border border-[#E6E0FE] shadow-sm p-4">
    <div className="flex items-center justify-between mb-1">
      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      {icon}
    </div>
    <h4 className={`text-2xl font-black ${tone}`}>{value}</h4>
    {sub && <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{sub}</p>}
  </div>
);

export const AttendanceFullReport: React.FC<Props> = ({
  open, onClose, variant, companyId, from, to, companyLabel,
}) => {
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local range so the report can be re-filtered without leaving it. Seeded from
  // the dashboard's range, which is what "filters preserved" means here.
  const [range, setRange] = useState({ from, to });
  const [branchId, setBranchId] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  useEffect(() => { if (open) setRange({ from, to }); }, [open, from, to]);

  const load = useCallback(async () => {
    if (!open || !companyId) return;
    setLoading(true);
    setError(null);
    try {
      const params: any = { companyId, from: range.from, to: range.to };
      if (branchId) params.branchId = branchId;
      const res = variant === 'department'
        ? await api.attendance.departmentReport(params)
        : await api.attendance.workforceReport(params);
      setData(res);
    } catch (e: any) {
      // Surfaced, never swallowed — a failed report must say so rather than
      // render an empty one that reads as "no attendance".
      setError(getApiErrorMessage(e, 'Could not load the report.'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [open, companyId, range.from, range.to, branchId, variant]);

  useEffect(() => { load(); }, [load]);

  const employees: EmpRow[] = useMemo(
    () => (data?.byEmployee || data?.employees || []).filter(e => !deptFilter || e.department === deptFilter),
    [data, deptFilter],
  );

  const t = data?.totals;
  const isDept = variant === 'department';
  const title = isDept ? 'Department Attendance Report' : 'Workforce Analytics Report';

  const scopeLabel = data?.scope.branchName
    ? `${companyLabel || 'Company'} → ${data.scope.branchName}`
    : (companyLabel || 'All branches');

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="page"
      pageMaxWidth={1320}
      title={title}
      subtitle={`${range.from} to ${range.to} · ${scopeLabel}`}
      breadcrumbs={[{ label: 'Attendance' }, { label: title }]}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[11px] text-slate-500 font-semibold">
            {loading ? 'Loading…' : t ? `${t.employees} employees · ${t.records} attendance records` : ''}
          </span>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      }
    >
      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label htmlFor="rep-from" className="block text-[10px] font-bold text-slate-600 uppercase mb-1">From</label>
          <input id="rep-from" type="date" value={range.from} max={range.to}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white" />
        </div>
        <div>
          <label htmlFor="rep-to" className="block text-[10px] font-bold text-slate-600 uppercase mb-1">To</label>
          <input id="rep-to" type="date" value={range.to} min={range.from}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white" />
        </div>
        {/* Branch picker only when the server says this user has branches to
            choose between — a branch-confined user never sees it. */}
        {!!data?.scope.branches?.length && !data?.scope.branchId && (
          <div>
            <label htmlFor="rep-branch" className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Branch</label>
            <select id="rep-branch" value={branchId} onChange={e => setBranchId(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white min-w-[160px]">
              <option value="">All branches</option>
              {data.scope.branches.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
            </select>
          </div>
        )}
        {!!data?.byDepartment.length && (
          <div>
            <label htmlFor="rep-dept" className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Department</label>
            <select id="rep-dept" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white min-w-[160px]">
              <option value="">All departments</option>
              {data.byDepartment.map(d => <option key={d.department} value={d.department}>{d.department}</option>)}
            </select>
          </div>
        )}
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-[34px] gap-1.5">
          <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
        <div className="ml-auto">
          <ExportMenu
            disabled={loading || !employees.length}
            fileName={isDept ? 'Department_Attendance_Report' : 'Workforce_Analytics_Report'}
            title={title}
            subtitle={`${range.from} to ${range.to} · ${scopeLabel}`}
            sheetName={isDept ? 'Departments' : 'Workforce'}
            columns={isDept
              ? [
                { header: 'Department', key: 'department' },
                { header: 'Employees', key: 'employees' },
                { header: 'Present', key: 'present' },
                { header: 'Absent', key: 'absent' },
                { header: 'Leave', key: 'leave' },
                { header: 'Half Day', key: 'halfDay' },
                { header: 'WFH', key: 'wfh' },
                { header: 'Attendance %', key: 'attendancePercent' },
              ]
              : [
                { header: 'Code', key: 'code' },
                { header: 'Employee', key: 'name' },
                { header: 'Department', key: 'department' },
                { header: 'Branch', key: 'branch' },
                { header: 'Present', key: 'present' },
                { header: 'Absent', key: 'absent' },
                { header: 'Leave', key: 'leave' },
                { header: 'Half Day', key: 'halfDay' },
                { header: 'WFH', key: 'wfh' },
                { header: 'Late', key: 'late' },
                { header: 'Early Exit', key: 'earlyExit' },
                { header: 'OT Hours', key: 'overtimeHours' },
                { header: 'Attendance %', key: 'attendancePercent' },
              ]}
            rows={() => (isDept ? (data?.byDepartment || []) : employees)}
          />
        </div>
      </div>

      {/* ── Error / loading / empty ─────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 mb-5">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-bold">This report could not be loaded.</p>
            <p className="text-[11px] font-medium">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={load} className="ml-auto">Retry</Button>
        </div>
      )}

      {loading && !data && (
        <div className="py-16 text-center text-sm text-slate-500 font-semibold">Loading attendance analytics…</div>
      )}

      {data && !error && (
        <>
          {/* ── Headline metrics ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
            <StatCard label="Attendance %" value={pct(t!.attendancePercent)} sub={`${t!.records} records`}
              icon={<TrendingUp size={15} className="text-emerald-500" />} tone="text-emerald-600" />
            <StatCard label="Employees" value={t!.employees} sub="in scope"
              icon={<Users size={15} className="text-brand-500" />} />
            <StatCard label="Present" value={t!.present} tone="text-emerald-600" />
            <StatCard label="Absent" value={t!.absent} tone="text-rose-600" />
            <StatCard label="Leave" value={t!.leave} tone="text-amber-600" />
            <StatCard label="Half Day" value={t!.halfDay} tone="text-sky-600" />
            <StatCard label="Work From Home" value={t!.wfh} tone="text-brand-600" />
            <StatCard label="Late Arrivals" value={t!.late} tone="text-orange-600" />
            <StatCard label="Early Exits" value={t!.earlyExit} tone="text-orange-600" />
            <StatCard label="Overtime" value={`${t!.overtimeHours}h`} sub="approved only"
              icon={<Clock size={15} className="text-brand-500" />} />
            <StatCard label="Weekly Off / Holiday" value={t!.nonWorking} sub="excluded from %" tone="text-slate-500" />
          </div>

          {/* ── Legend ─────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            {BUCKETS.map(b => (
              <span key={b.key} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                <span className={`w-2.5 h-2.5 rounded-full ${b.cls}`} /> {b.label}
              </span>
            ))}
          </div>

          {/* ── Department breakdown (leads the Department variant) ─────── */}
          <section className={isDept ? 'mb-6' : 'mb-6 order-2'}>
            <h3 className="text-[13px] font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Building2 size={15} className="text-brand-500" /> Department Breakdown
            </h3>
            <div className="overflow-x-auto rounded-xl border border-[#E6E0FE]">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {['Department', 'Employees', 'Present', 'Absent', 'Leave', 'Half Day', 'WFH', 'Attendance %', 'Distribution'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byDepartment.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400 font-semibold">No attendance in this period.</td></tr>
                  )}
                  {data.byDepartment.map(d => (
                    <tr key={d.department}
                      className={`hover:bg-brand-50/40 cursor-pointer ${deptFilter === d.department ? 'bg-brand-50' : ''}`}
                      onClick={() => setDeptFilter(deptFilter === d.department ? '' : d.department)}
                      title="Click to drill down to this department's employees">
                      <td className="px-3 py-2 font-bold text-slate-800">{d.department}</td>
                      <td className="px-3 py-2">{d.employees}</td>
                      <td className="px-3 py-2 text-emerald-600 font-semibold">{d.present}</td>
                      <td className="px-3 py-2 text-rose-600 font-semibold">{d.absent}</td>
                      <td className="px-3 py-2 text-amber-600 font-semibold">{d.leave}</td>
                      <td className="px-3 py-2 text-sky-600 font-semibold">{d.halfDay}</td>
                      <td className="px-3 py-2 text-brand-600 font-semibold">{d.wfh}</td>
                      <td className="px-3 py-2 font-bold">{pct(d.attendancePercent)}</td>
                      <td className="px-3 py-2 min-w-[140px]"><StackedBar row={d} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Trends ─────────────────────────────────────────────────── */}
          <section className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {([
              ['Daily Trend', data.daily],
              ['Weekly Trend', data.weekly],
              ['Monthly Trend', data.monthly],
            ] as const).filter(([, s]) => !!s).map(([label, s]) => (
              <div key={label} className="bg-white rounded-2xl border border-[#E6E0FE] shadow-sm p-4">
                <h4 className="text-[12px] font-bold text-slate-800 mb-3">{label}</h4>
                {(!s || s.length === 0) ? (
                  <p className="text-[11px] text-slate-400 font-semibold py-6 text-center">No data in this period.</p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                    {s!.map(p => (
                      <div key={p.key}>
                        <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                          <span>{p.key}</span>
                          <span className="text-slate-800">{pct(p.attendancePercent)}</span>
                        </div>
                        <StackedBar row={p} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>

          {/* ── Employee breakdown / drill-down ────────────────────────── */}
          <section>
            <h3 className="text-[13px] font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Users size={15} className="text-brand-500" />
              Employee Breakdown
              {deptFilter && (
                <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                  {deptFilter}
                  <button onClick={() => setDeptFilter('')} className="ml-1.5 hover:text-brand-800" aria-label="Clear department filter">×</button>
                </span>
              )}
              <span className="text-[10px] font-semibold text-slate-400">({employees.length})</span>
            </h3>
            <div className="overflow-x-auto rounded-xl border border-[#E6E0FE] max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10">
                  <tr>
                    {['Code', 'Employee', 'Department', 'Branch', 'Present', 'Absent', 'Leave', 'Half Day', 'WFH', 'Late', 'Early Exit', 'OT (h)', 'Attendance %'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.length === 0 && (
                    <tr><td colSpan={13} className="px-3 py-8 text-center text-slate-400 font-semibold">No employees match this filter.</td></tr>
                  )}
                  {employees.map(e => (
                    <tr key={e.employeeId} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{e.code || '—'}</td>
                      <td className="px-3 py-2 font-bold text-slate-800 whitespace-nowrap">{e.name}</td>
                      <td className="px-3 py-2 text-slate-600">{e.department}</td>
                      <td className="px-3 py-2 text-slate-600">{e.branch || '—'}</td>
                      <td className="px-3 py-2 text-emerald-600 font-semibold">{e.present}</td>
                      <td className="px-3 py-2 text-rose-600 font-semibold">{e.absent}</td>
                      <td className="px-3 py-2 text-amber-600 font-semibold">{e.leave}</td>
                      <td className="px-3 py-2 text-sky-600 font-semibold">{e.halfDay}</td>
                      <td className="px-3 py-2 text-brand-600 font-semibold">{e.wfh}</td>
                      <td className="px-3 py-2 text-orange-600 font-semibold">{e.late}</td>
                      <td className="px-3 py-2 text-orange-600 font-semibold">{e.earlyExit}</td>
                      <td className="px-3 py-2 font-semibold">{e.overtimeHours ?? 0}</td>
                      <td className="px-3 py-2 font-bold">{pct(e.attendancePercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Modal>
  );
};

export default AttendanceFullReport;
