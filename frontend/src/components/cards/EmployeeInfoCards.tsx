// ─────────────────────────────────────────────────────────────────────────────
// Employee Information Cards — the dashboard-style summary section of the
// Employee Cards module. NOT a printable ID card: it is a read-only roster of
// "who is this person and where do they stand this month".
//
// Every figure is read from an existing module. Nothing is stored here, and no
// table is created:
//   • Employee master   → photo, name, code, department, designation
//   • Payroll           → Annual CTC (12 × the latest cycle's gross)
//   • AttendanceSummary → present days for the month (the documented single
//                         source of truth that payroll and slips also read)
//   • LeaveBalance      → available leave (CL + PL + SL, same as Leave Mgmt)
//
// Three list calls are made once, on first open, and cached for the lifetime of
// the page. Cards render incrementally so a thousand-employee company does not
// paint a thousand nodes at once.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { Search, Wallet, CalendarCheck, Palmtree, User, AlertTriangle, RefreshCw } from 'lucide-react';
import type { Employee } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { PaginationBar } from '@/components/ui/Paginated';
import { api } from '@/api/apiClient';

interface Props {
  /** Already scoped to the active company tree + active employees by the page. */
  employees: Employee[];
  activeCompanyId: string;
  /** Opens the real employee profile (Employees module). */
  onOpenProfile: (employeeId: string) => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthIdx = (m: string) => MONTHS.findIndex(x => x.toLowerCase() === String(m).toLowerCase());

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
/** Trim a float like 21.0 → "21" but keep 20.5. */
const days = (n: number) => (Math.round(n * 10) / 10).toString();

interface Metrics {
  ctcAnnual: number | null;
  ctcSource: 'payroll' | 'master' | null;
  present: number | null;
  scheduled: number | null;
  leave: number | null;
}

/**
 * Default page size = 20 cards, which is exactly 5 rows on the desktop 4-up
 * grid. The grid stays responsive, so the same 20 cards are 10 rows on a
 * 2-up tablet and 20 on a phone — the SERVER cannot know the viewport, so the
 * page size is a card count, not a literal row count.
 */
const DEFAULT_LIMIT = 20;

/** Filter/paging state that survives opening a profile and coming back. */
interface ViewState {
  page: number; limit: number; branch: string; department: string; query: string;
}
const DEFAULT_VIEW: ViewState = { page: 1, limit: DEFAULT_LIMIT, branch: '', department: '', query: '' };

// Session-scoped so returning from an employee profile restores the exact view.
// Tiny by design — a handful of strings and two numbers, never records.
const viewKey = (companyId: string) => `hrms_cards_view_${companyId || 'na'}`;
const loadView = (companyId: string): ViewState => {
  try {
    const raw = sessionStorage.getItem(viewKey(companyId));
    return raw ? { ...DEFAULT_VIEW, ...JSON.parse(raw) } : { ...DEFAULT_VIEW };
  } catch { return { ...DEFAULT_VIEW }; }
};
const saveView = (companyId: string, v: ViewState) => {
  try { sessionStorage.setItem(viewKey(companyId), JSON.stringify(v)); } catch { /* private mode */ }
};

/** Build a card's metrics from the records the server joined onto the row. */
function metricsFor(row: any): Metrics {
  const p = row.latestPayroll;
  // "From Payroll": the cycle's own gross (basic + allowances), annualised.
  // No payroll yet → fall back to the master's monthly gross. Employee.salary
  // is MONTHLY, which is also how the CTC Report annualises it.
  const ctcAnnual = p ? (num(p.basicSalary) + num(p.allowances)) * 12
    : (num(row.salary) ? num(row.salary) * 12 : null);
  const ctcSource: Metrics['ctcSource'] = p ? 'payroll' : (num(row.salary) ? 'master' : null);

  const s = row.attendanceSummary;
  // Days the employee was scheduled for: everything the summary accounts for.
  // payableDays already folds in half-days, paid leave, weekly offs and
  // holidays; absent + LWP are the unpaid remainder.
  const scheduled = s ? num(s.payableDays) + num(s.absentDays) + num(s.lwp) : null;

  const b = row.leaveBalance;
  const leave = b ? num(b.clBalance) + num(b.plBalance) + num(b.slBalance) : null;

  return { ctcAnnual, ctcSource, present: s ? num(s.presentDays) : null, scheduled, leave };
}

export const EmployeeInfoCards: React.FC<Props> = ({ employees, activeCompanyId, onOpenProfile }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<{ month: string; year: number } | null>(null);

  // One restore on mount, so a return from a profile lands on the same page with
  // the same filters rather than resetting to page 1.
  const [view, setView] = useState<ViewState>(() => loadView(activeCompanyId));
  const { page, limit, branch, department, query } = view;
  const patch = (p: Partial<ViewState>) => setView(v => ({ ...v, ...p }));
  // Any filter change restarts at page 1 — page 7 of the old result set is
  // meaningless against a new one.
  const setFilter = (p: Partial<ViewState>) => patch({ ...p, page: 1 });

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => { saveView(activeCompanyId, view); }, [activeCompanyId, view]);

  // Typing must not fire a request per keystroke; everything else is immediate.
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // ── the only fetch: one page of cards, metrics already joined ───────────────
  useEffect(() => {
    let stale = false;
    setLoading(true); setError(null);
    api.employees.getCards({
      page, limit, companyId: activeCompanyId,
      search: debouncedQuery, branch, department,
    })
      .then((res: any) => {
        if (stale) return;
        setRows(Array.isArray(res?.data) ? res.data : []);
        setTotal(res?.total || 0);
        setTotalPages(Math.max(1, res?.totalPages || 1));
        setPeriod(res?.period || null);
        setLoading(false);
      })
      .catch(e => {
        if (stale) return;
        setError(e?.message || 'Could not load employee information.');
        setLoading(false);
      });
    return () => { stale = true; };
  }, [activeCompanyId, page, limit, debouncedQuery, branch, department, reloadTick]);

  // The server clamps nothing for us: deleting/filtering can leave the current
  // page beyond the end, which would render an empty grid with rows available.
  useEffect(() => {
    if (!loading && page > totalPages) patch({ page: totalPages });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, page, totalPages]);

  const refresh = () => setReloadTick(t => t + 1);

  // Filter dropdown options come from the roster the page already holds — no
  // extra request, and the list of branches/departments does not paginate.
  const branches = useMemo(() => Array.from(new Set(employees.map(e => (e as any).branchLocation || (e as any).location).filter(Boolean))).sort(), [employees]);
  const departments = useMemo(() => Array.from(new Set(employees.map(e => e.department).filter(Boolean))).sort(), [employees]);

  const metrics = useMemo(() => {
    const m = new Map<string, Metrics>();
    for (const row of rows) m.set(String(row.id), metricsFor(row));
    return m;
  }, [rows]);


  return (
    <div className="space-y-3">
      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Select label="Branch" value={branch} onChange={e => setFilter({ branch: e.target.value })}
            options={[{ value: '', label: 'All branches' }, ...branches.map(b => ({ value: b, label: b }))]} />
          <Select label="Department" value={department} onChange={e => setFilter({ department: e.target.value })}
            options={[{ value: '', label: 'All departments' }, ...departments.map(d => ({ value: d, label: d }))]} />
          <div className="md:col-span-2">
            <Input label="Employee" icon={<Search size={14} />} placeholder="Search by name, employee ID or designation…"
              value={query} onChange={e => setFilter({ query: e.target.value })} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>Showing <b className="text-slate-700">{rows.length}</b> of {total} employees</span>
          <div className="flex items-center gap-3">
            {period && (
              <span title="Attendance is shown for the most recent month that has attendance data.">
                Attendance for <b className="text-slate-700">{period.month} {period.year}</b>
              </span>
            )}
            <button onClick={refresh} disabled={loading}
              className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700 disabled:text-slate-300"
              title="Re-read payroll, attendance and leave balances">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </Card>

      {error && (
        <Card>
          <div className="flex items-center gap-2 py-6 justify-center text-sm text-rose-600">
            <AlertTriangle size={16} /> {error}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><div className="h-[268px] animate-pulse rounded-xl bg-slate-100" /></Card>
          ))}
        </div>
      ) : total === 0 ? (
        <Card><div className="py-16 text-center text-sm text-slate-400">No employees match these filters.</div></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {rows.map(e => <InfoCard key={String(e.id)} employee={e} m={metrics.get(String(e.id))} onOpenProfile={onOpenProfile} />)}
          </div>
          {/* The shared bar, driven by the server's page metadata. Always shown
              (even on a single page) so the rows-per-page control stays reachable. */}
          <Card padding={false} className="overflow-hidden">
            <PaginationBar
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={limit}
              label="employees"
              onChange={p => patch({ page: p })}
              onPageSizeChange={size => patch({ limit: size, page: 1 })}
            />
          </Card>
        </>
      )}
    </div>
  );
};

// ── one employee ─────────────────────────────────────────────────────────────
const InfoCard: React.FC<{ employee: Employee; m?: Metrics; onOpenProfile: (id: string) => void }> = ({ employee: e, m, onOpenProfile }) => {
  const photo = (e as any).photoUpload || (e as any).photo || '';
  const initials = (e.name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col items-center text-center shadow-sm transition hover:border-brand-200 hover:shadow-md">
      {photo ? (
        <img src={photo} alt={e.name} className="h-16 w-16 rounded-full object-cover ring-2 ring-brand-100" />
      ) : (
        <div className="h-16 w-16 rounded-full bg-brand-50 text-brand-600 ring-2 ring-brand-100 flex items-center justify-center text-sm font-extrabold">{initials}</div>
      )}

      <p className="mt-2.5 w-full truncate text-sm font-bold text-slate-800" title={e.name}>{e.name}</p>
      <p className="w-full truncate font-mono text-[11px] text-slate-500">{e.employeeId || '—'}</p>
      <p className="mt-1 w-full truncate text-[11px] font-semibold text-slate-600" title={e.department}>{e.department || '—'}</p>
      <p className="w-full truncate text-[11px] text-slate-400" title={e.designation}>{e.designation || '—'}</p>

      <div className="mt-3 w-full space-y-1.5 border-t border-slate-100 pt-3">
        <Stat
          icon={<Wallet size={13} className="text-brand-500" />}
          label="CTC"
          value={m?.ctcAnnual != null ? `${inr(m.ctcAnnual)} / yr` : 'Not set'}
          muted={m?.ctcAnnual == null}
          title={m?.ctcSource === 'payroll' ? 'Annual CTC — 12 × the latest payroll cycle gross (basic + allowances).'
            : m?.ctcSource === 'master' ? 'Annual CTC — 12 × the monthly salary on the employee master (no payroll run yet).'
              : 'No salary recorded for this employee.'}
        />
        <Stat
          icon={<CalendarCheck size={13} className="text-emerald-500" />}
          label="Present"
          value={m?.present != null ? `${days(m.present)} / ${days(m.scheduled ?? m.present)} Days` : 'No data'}
          muted={m?.present == null}
          title="Present days out of the days accounted for in the month (payable + absent + LWP)."
        />
        <Stat
          icon={<Palmtree size={13} className="text-amber-500" />}
          label="Leave"
          value={m?.leave != null ? `${days(m.leave)} Days` : 'No data'}
          muted={m?.leave == null}
          title="Total available leave — CL + PL + SL balance."
        />
      </div>

      <Button variant="outline" size="sm" className="mt-3 w-full" icon={<User size={13} />} onClick={() => onOpenProfile(String(e.id))}>
        View Profile
      </Button>
    </div>
  );
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; muted?: boolean; title?: string }> = ({ icon, label, value, muted, title }) => (
  <div className="flex items-center justify-between gap-2" title={title}>
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">{icon}{label}</span>
    <span className={`truncate text-[11px] font-bold ${muted ? 'text-slate-300' : 'text-slate-800'}`}>{value}</span>
  </div>
);

export default EmployeeInfoCards;
