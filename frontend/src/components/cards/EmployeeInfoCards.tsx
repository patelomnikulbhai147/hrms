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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Wallet, CalendarCheck, Palmtree, User, AlertTriangle, RefreshCw } from 'lucide-react';
import type { Employee } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
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

const PAGE = 24;

interface Sources {
  summaries: Map<string, any>;
  balances: Map<string, any>;
  latestPay: Map<string, any>;
}
type Loaded = { sources: Sources; period: { month: string; year: number } };

// One in-flight/settled fetch per workspace, held OUTSIDE the component. A ref
// would be recreated whenever the component remounts (React.StrictMode does this
// on purpose in dev, and switching sections could too), which is precisely when
// the duplicate calls appear. `Refresh` evicts the entry.
const CACHE = new Map<string, Promise<Loaded>>();

async function fetchSources(): Promise<Loaded> {
  // Attendance for "this month". If the current calendar month has no summaries
  // yet (attendance for it has not been posted), fall back to the most recent
  // month that DOES have data — and label it, so a card never shows a silent
  // zero for a month that simply has not happened yet.
  const now = new Date();
  const curMonth = MONTHS[now.getMonth()];
  const curYear = now.getFullYear();
  let sums: any[] = (await api.attendanceSummary.getAll(curMonth, curYear)) || [];
  let period = { month: curMonth, year: curYear };
  if (!sums.length) {
    const all: any[] = (await api.attendanceSummary.getAll()) || [];
    if (all.length) {
      const latest = all.reduce((a, b) =>
        (b.year * 100 + monthIdx(b.month)) > (a.year * 100 + monthIdx(a.month)) ? b : a);
      period = { month: latest.month, year: latest.year };
      sums = all.filter(s => s.month === period.month && s.year === period.year);
    }
  }

  const [bals, pays] = await Promise.all([
    api.leaveBalances.getAll().catch(() => []),
    api.payroll.getAll().catch(() => []),
  ]);

  // Latest payroll cycle per employee → monthly gross → annual CTC.
  const latestPay = new Map<string, any>();
  for (const row of (pays as any[]) || []) {
    const k = String(row.employeeId);
    const rank = num(row.year) * 100 + monthIdx(row.month);
    const cur = latestPay.get(k);
    if (!cur || rank > cur._rank) latestPay.set(k, { ...row, _rank: rank });
  }
  const summaries = new Map<string, any>();
  for (const s of sums) summaries.set(String(s.employeeId), s);
  const balances = new Map<string, any>();
  for (const b of (bals as any[]) || []) balances.set(String(b.employeeId), b);

  return { sources: { summaries, balances, latestPay }, period };
}

export const EmployeeInfoCards: React.FC<Props> = ({ employees, activeCompanyId, onOpenProfile }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<{ month: string; year: number } | null>(null);
  const [sources, setSources] = useState<Sources | null>(null);

  const [branch, setBranch] = useState('');
  const [department, setDepartment] = useState('');
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE);

  // ── exactly one fetch per workspace ─────────────────────────────────────────
  // The employee list is deliberately NOT a dependency: it churns as App refreshes
  // it, which would re-hit three list endpoints for no new information.
  const [reloadTick, setReloadTick] = useState(0);
  useEffect(() => {
    const key = activeCompanyId || '';
    let stale = false;
    setLoading(true); setError(null);

    let p = CACHE.get(key);
    if (!p) { p = fetchSources(); CACHE.set(key, p); }

    p.then(r => { if (stale) return; setSources(r.sources); setPeriod(r.period); setLoading(false); })
      .catch(e => {
        CACHE.delete(key);              // a failed fetch must not be cached
        if (stale) return;
        setError(e?.message || 'Could not load employee information.');
        setLoading(false);
      });

    return () => { stale = true; };
  }, [activeCompanyId, reloadTick]);

  const refresh = () => { CACHE.delete(activeCompanyId || ''); setReloadTick(t => t + 1); };

  // Derived at render time, so employees arriving later are picked up without refetching.
  const metrics = useMemo(() => {
    const m = new Map<string, Metrics>();
    if (!sources) return m;
    for (const e of employees) {
      const k = String(e.id);
      const p = sources.latestPay.get(k);
      // "From Payroll": the cycle's own gross (basic + allowances), annualised.
      // No payroll yet → fall back to the master's monthly gross. Employee.salary
      // is MONTHLY (verified against live payroll rows), which is also how the
      // CTC Report annualises it.
      const ctcAnnual = p ? (num(p.basicSalary) + num(p.allowances)) * 12
        : (num((e as any).salary) ? num((e as any).salary) * 12 : null);
      const ctcSource: Metrics['ctcSource'] = p ? 'payroll' : (num((e as any).salary) ? 'master' : null);

      const s = sources.summaries.get(k);
      // Days the employee was scheduled for: everything the summary accounts for.
      // payableDays already folds in half-days, paid leave, weekly offs and
      // holidays; absent + LWP are the unpaid remainder.
      const scheduled = s ? num(s.payableDays) + num(s.absentDays) + num(s.lwp) : null;

      const b = sources.balances.get(k);
      const leave = b ? num(b.clBalance) + num(b.plBalance) + num(b.slBalance) : null;

      m.set(k, { ctcAnnual, ctcSource, present: s ? num(s.presentDays) : null, scheduled, leave });
    }
    return m;
  }, [employees, sources]);

  const branches = useMemo(() => Array.from(new Set(employees.map(e => (e as any).branchLocation || (e as any).location).filter(Boolean))).sort(), [employees]);
  const departments = useMemo(() => Array.from(new Set(employees.map(e => e.department).filter(Boolean))).sort(), [employees]);

  const filtered = useMemo(() => employees.filter(e => {
    if (branch && (((e as any).branchLocation || (e as any).location) !== branch)) return false;
    if (department && e.department !== department) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (e.name || '').toLowerCase().includes(q)
      || (e.employeeId || '').toLowerCase().includes(q)
      || (e.designation || '').toLowerCase().includes(q);
  }), [employees, branch, department, query]);

  useEffect(() => { setVisible(PAGE); }, [branch, department, query]);

  // Lazy render: reveal the next page when the sentinel scrolls into view.
  // `loading` MUST be a dependency — while it is true the grid (and the sentinel)
  // are not mounted, so the observer would attach to nothing and never re-attach.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (loading || !el || visible >= filtered.length) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(v => Math.min(v + PAGE, filtered.length));
    }, { rootMargin: '240px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible, filtered.length, loading]);

  const shown = filtered.slice(0, visible);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Select label="Branch" value={branch} onChange={e => setBranch(e.target.value)}
            options={[{ value: '', label: 'All branches' }, ...branches.map(b => ({ value: b, label: b }))]} />
          <Select label="Department" value={department} onChange={e => setDepartment(e.target.value)}
            options={[{ value: '', label: 'All departments' }, ...departments.map(d => ({ value: d, label: d }))]} />
          <div className="md:col-span-2">
            <Input label="Employee" icon={<Search size={14} />} placeholder="Search by name, employee ID or designation…"
              value={query} onChange={e => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>Showing <b className="text-slate-700">{shown.length}</b> of {filtered.length} employees</span>
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
      ) : filtered.length === 0 ? (
        <Card><div className="py-16 text-center text-sm text-slate-400">No employees match these filters.</div></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {shown.map(e => <InfoCard key={String(e.id)} employee={e} m={metrics.get(String(e.id))} onOpenProfile={onOpenProfile} />)}
          </div>
          <div ref={sentinel} />
          {visible < filtered.length && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" onClick={() => setVisible(v => Math.min(v + PAGE, filtered.length))}>
                Load {Math.min(PAGE, filtered.length - visible)} more ({filtered.length - visible} remaining)
              </Button>
            </div>
          )}
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
