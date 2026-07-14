import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '@/api/apiClient';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {
  ShieldCheck, RefreshCw, Search, History as HistoryIcon, Activity,
  Plus, Pencil, Trash2, Archive, RotateCcw, Upload, Download, IndianRupee,
  CalendarCheck, Palmtree, Settings as SettingsIcon, KeyRound, LogOut, CheckCircle2, Info, ArrowDown,
} from 'lucide-react';
import { formatTime } from '@/utils/formatDate';
import {
  describeAudit, dateBucket, matchesSearch, BUCKET_ORDER, FILTER_CATEGORIES,
  type AuditEntry, type AuditView, type IconKey, type Tone, type DateBucket,
} from '@/utils/auditFormat';

// icon-key → lucide component (presentation only; the mapping lives here, the
// data/tone/title logic lives in utils/auditFormat).
const ICONS: Record<IconKey, React.ComponentType<any>> = {
  create: Plus, update: Pencil, delete: Trash2, archive: Archive, restore: RotateCcw,
  import: Upload, export: Download, payroll: IndianRupee, attendance: CalendarCheck,
  leave: Palmtree, settings: SettingsIcon, permission: ShieldCheck, login: KeyRound,
  logout: LogOut, approve: CheckCircle2, info: Info,
};

// tone → badge classes (uses the same colour families the dark theme retints, so
// both light and dark render correctly).
const TONE_BADGE: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200',
  blue: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200',
  red: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  orange: 'bg-orange-50 text-orange-600 ring-1 ring-orange-200',
  purple: 'bg-brand-50 text-brand-600 ring-1 ring-brand-200',
  gray: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
  teal: 'bg-teal-50 text-teal-600 ring-1 ring-teal-200',
};
const TONE_RAIL: Record<Tone, string> = {
  green: 'bg-emerald-400', blue: 'bg-blue-400', red: 'bg-red-400', orange: 'bg-orange-400',
  purple: 'bg-brand-400', gray: 'bg-slate-300', teal: 'bg-teal-400',
};

const PAGE_STEP = 40;

type Row = AuditEntry & { view: AuditView; bucket: DateBucket };

/**
 * Enterprise Activity Timeline — the human-readable presentation of the global
 * audit log. It consumes the EXACT rows GET /api/audit already returns and, via
 * utils/auditFormat, renders meaningful timeline cards (icons, field-by-field
 * diffs, plain-English summaries) instead of raw JSON. No backend / API / schema
 * change — purely how the logs are displayed.
 */
export const AuditTrail: React.FC<{ role?: string }> = ({ role }) => {
  const isDenied = !!role && role !== 'Super Admin';
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState('All');
  const [category, setCategory] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_STEP);

  const load = useCallback(async () => {
    if (isDenied) { setLoading(false); return; }
    setLoading(true);
    try { setLogs(await api.audit.getAll('?limit=300') || []); }
    catch { setLogs([]); }
    finally { setLoading(false); }
  }, [isDenied]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setVisible(PAGE_STEP); }, [moduleFilter, category, query]);

  // Decorate every row once (title, icon, tone, diffs, bucket).
  const rows: Row[] = useMemo(
    () => logs.map((l) => ({ ...l, view: describeAudit(l), bucket: dateBucket(l.createdAt) })),
    [logs]
  );

  const modules = useMemo(
    () => ['All', ...Array.from(new Set(logs.map((l) => l.module).filter(Boolean))).sort()],
    [logs]
  );

  // Summary stats (Total / Today / This Week / This Month).
  const stats = useMemo(() => {
    const inSet = (b: DateBucket, set: DateBucket[]) => set.includes(b);
    return {
      total: rows.length,
      today: rows.filter((r) => r.bucket === 'Today').length,
      week: rows.filter((r) => inSet(r.bucket, ['Today', 'Yesterday', 'Last Week'])).length,
      month: rows.filter((r) => inSet(r.bucket, ['Today', 'Yesterday', 'Last Week', 'Last Month'])).length,
    };
  }, [rows]);

  const filtered = useMemo(
    () => rows.filter((r) =>
      (moduleFilter === 'All' || r.module === moduleFilter) &&
      (category === 'All' || r.view.categories.includes(category)) &&
      matchesSearch(r, r.view, query)
    ),
    [rows, moduleFilter, category, query]
  );

  const shown = filtered.slice(0, visible);
  // Group the shown slice by date bucket, preserving bucket order.
  const grouped = useMemo(() => {
    const map = new Map<DateBucket, Row[]>();
    for (const r of shown) { const arr = map.get(r.bucket) || []; arr.push(r); map.set(r.bucket, arr); }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, items: map.get(b)! }));
  }, [shown]);

  if (isDenied) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldCheck className="text-rose-500 w-10 h-10 mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Access Denied</h2>
        <p className="text-sm text-slate-500 max-w-sm mt-1">Global activity history is restricted to the Super Admin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
            <Activity size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Activity History</h2>
            <p className="text-sm text-slate-500">Every change across the platform — who did what, and when.</p>
          </div>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw size={15} className="mr-1.5" /> Refresh</Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Activities', value: stats.total, tone: 'bg-brand-50 text-brand-600' },
          { label: "Today", value: stats.today, tone: 'bg-emerald-50 text-emerald-600' },
          { label: 'This Week', value: stats.week, tone: 'bg-blue-50 text-blue-600' },
          { label: 'This Month', value: stats.month, tone: 'bg-orange-50 text-orange-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">{s.value.toLocaleString('en-IN')}</p>
            </div>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.tone}`}><Activity size={16} /></div>
          </div>
        ))}
      </div>

      {/* Toolbar: search + module + category chips */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <Input
              icon={<Search size={15} />}
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              placeholder="Search by employee, user, action, module or value…"
            />
          </div>
          <div className="sm:w-52">
            <Select
              value={moduleFilter}
              onChange={(e: any) => setModuleFilter(e.target.value)}
              options={modules.map((m) => ({ value: m, label: m === 'All' ? 'All modules' : m }))}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTER_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                category === c
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl shimmer-skeleton" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-200">
          <HistoryIcon size={30} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-600">No activity available.</p>
          <p className="text-xs text-slate-400 mt-1">
            {logs.length ? 'No activities match your search or filters.' : 'Activity will appear here as changes are made.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.bucket}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{g.bucket}</h3>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{g.items.length}</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <div className="space-y-3">
                {g.items.map((r) => <ActivityCard key={r.id} row={r} />)}
              </div>
            </div>
          ))}

          {visible < filtered.length && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_STEP)}>
                Load more ({filtered.length - visible} remaining)
              </Button>
            </div>
          )}
          <p className="text-center text-xs text-slate-400">
            Showing {Math.min(visible, filtered.length)} of {filtered.length}
            {filtered.length !== logs.length ? ` (filtered from ${logs.length})` : ''}
          </p>
        </div>
      )}
    </div>
  );
};

// ── one timeline card ────────────────────────────────────────────────────────
const ActivityCard: React.FC<{ row: Row }> = ({ row }) => {
  const { view } = row;
  const Icon = ICONS[view.iconKey] || Info;
  const by = (() => { try { return (JSON.parse(row.details || '{}') || {}).by; } catch { return undefined; } })();
  const actor = by || row.actorName;

  return (
    <div className="relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-4 pl-5">
      <span className={`absolute left-0 top-4 bottom-4 w-1 rounded-full ${TONE_RAIL[view.tone]}`} />
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${TONE_BADGE[view.tone]}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          {/* Title + timestamp */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 leading-tight">{view.title}</p>
              {view.subject && <p className="text-[13px] text-slate-600 mt-0.5 truncate">{view.subject}</p>}
            </div>
            <span className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap mt-0.5">{formatTime(row.createdAt)}</span>
          </div>

          {/* Detail rows */}
          {view.rows.length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
              {view.rows.map((d, i) => (
                <div key={i} className="text-[12px]">
                  <span className="text-slate-400">{d.label}: </span>
                  <span className={`text-slate-700 font-semibold ${d.mono ? 'font-mono' : ''}`}>{d.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Field-by-field diffs (old → new) */}
          {view.diffs.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 divide-y divide-slate-100 overflow-hidden">
              {view.diffs.map((d, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 text-[12px] flex-wrap">
                  <span className="font-semibold text-slate-700 min-w-[110px]">{d.field}</span>
                  <span className={`px-2 py-0.5 rounded-md ${d.oldEmpty ? 'text-slate-400 italic' : 'bg-red-50 text-red-600'}`}>
                    {d.oldEmpty ? `No ${d.field}` : d.oldValue}
                  </span>
                  <ArrowDown size={13} className="text-slate-400 rotate-[-90deg]" />
                  <span className={`px-2 py-0.5 rounded-md font-semibold ${d.newEmpty ? 'text-slate-400 italic' : 'bg-emerald-50 text-emerald-700'}`}>
                    {d.newEmpty ? 'Cleared' : d.newValue}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Footer: actor + role */}
          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100">
            <div className="w-5 h-5 rounded-full bg-brand-50 text-brand-600 text-[9px] font-bold flex items-center justify-center">
              {String(actor).slice(0, 1).toUpperCase()}
            </div>
            <span className="text-[11px] text-slate-500">
              by <span className="font-semibold text-slate-700">{actor}</span>
              {row.actorRole ? ` · ${row.actorRole}` : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
