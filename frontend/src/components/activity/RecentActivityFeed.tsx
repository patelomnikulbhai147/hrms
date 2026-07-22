import React, { useMemo, useState } from 'react';
import { Search, Sparkles, ChevronDown, ChevronRight, CheckCircle2, ArrowRight, History as HistoryIcon } from 'lucide-react';
import {
  describeAudit, relativeTime, aiSummary, matchesSearch,
  type AuditEntry, type AuditView, type Tone,
} from '@/utils/auditFormat';
import { formatDateTime } from '@/utils/formatDate';

interface Props {
  entries: AuditEntry[];
  loading?: boolean;
  onViewAll?: () => void;
  title?: string;
  /**
   * How many of the latest activities the card shows. The card is a PREVIEW of
   * the audit log — the full record lives in Company Profile ▸ Audit Timeline,
   * which is what "View All" opens. There is deliberately no in-card "Show more":
   * two controls that do nearly the same thing only make the card harder to read.
   */
  limit?: number;
}

// tone → emoji-badge ring/background (colour families the dark theme retints).
const TONE_BADGE: Record<Tone, string> = {
  green: 'bg-emerald-50 ring-emerald-200', blue: 'bg-blue-50 ring-blue-200',
  red: 'bg-red-50 ring-red-200', orange: 'bg-orange-50 ring-orange-200',
  purple: 'bg-brand-50 ring-brand-200', gray: 'bg-slate-100 ring-slate-200',
  teal: 'bg-teal-50 ring-teal-200',
};
const TONE_DOT: Record<Tone, string> = {
  green: 'bg-emerald-500', blue: 'bg-blue-500', red: 'bg-red-500',
  orange: 'bg-orange-500', purple: 'bg-brand-500', gray: 'bg-slate-400', teal: 'bg-teal-500',
};

type Row = AuditEntry & { view: AuditView };

/**
 * RecentActivityFeed — the business-readable "Activity Center". Consumes the raw
 * audit rows the API already returns and, via utils/auditFormat, renders each as a
 * plain-English card (emoji, one-line narrative, "Changes made" bullets, before→
 * after diffs, relative time, expandable details). No backend/API/schema change —
 * purely how activities are displayed. A Company Head understands each in seconds.
 */
export const RecentActivityFeed: React.FC<Props> = ({ entries, loading, onViewAll, title = 'Recent Activities', limit = 8 }) => {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const rows: Row[] = useMemo(() => entries.map((e) => ({ ...e, view: describeAudit(e) })), [entries]);
  const digest = useMemo(() => aiSummary(entries), [entries]);

  // Always show the latest activities from every module in chronological order;
  // the search box narrows across all activity types (no category selection).
  const filtered = useMemo(
    () => rows.filter((r) => matchesSearch(r, r.view, query)),
    [rows, query]
  );
  const shown = filtered.slice(0, limit);
  const toggle = (id: number) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {/* A real <button>: keyboard-operable (Enter/Space) and focus-visible for
            free. `cursor-pointer` is explicit — this project has no global
            `button { cursor: pointer }`, so without it the browser default arrow
            cursor makes the control read as plain, dead text. The padding gives
            it a hit area you can actually aim at rather than 11px of glyph. */}
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            aria-label="View the full audit timeline in Company Profile"
            className="inline-flex items-center gap-0.5 -mr-1.5 px-1.5 py-1 rounded-lg cursor-pointer text-[11px] font-bold text-brand-600 hover:text-brand-700 hover:bg-brand-50 hover:underline active:scale-[0.97] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            View All <ChevronRight size={12} />
          </button>
        )}
      </div>

      {/* AI "Today's Summary" */}
      {!loading && digest.length > 0 && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/60 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={13} className="text-brand-600" />
            <span className="text-[11px] font-bold text-brand-700 uppercase tracking-wide">Today's Summary</span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
            {digest.map((d, i) => (
              <li key={i} className="text-[12px] text-slate-700 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-brand-500 shrink-0" /> {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Search — matches across every activity type; no category selection */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search activities…"
          className="w-full h-9 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[12px] text-slate-700 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        />
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-2.5">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl shimmer-skeleton" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <HistoryIcon size={24} className="text-slate-300 mb-2" />
          <p className="text-[12px] font-semibold text-slate-500">No recent activities available.</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Activities from all modules will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Preview only — no overflow footer. The single "View All" in the
              header is the one way to reach the rest, on the dedicated page. */}
          {shown.map((r) => <ActivityCard key={r.id} row={r} open={expanded.has(r.id)} onToggle={() => toggle(r.id)} />)}
        </div>
      )}
    </div>
  );
};

// ── one activity card ────────────────────────────────────────────────────────
const ActivityCard: React.FC<{ row: Row; open: boolean; onToggle: () => void }> = ({ row, open, onToggle }) => {
  const { view } = row;
  const actor = (() => { try { return (JSON.parse(row.details || '{}') || {}).by; } catch { return undefined; } })() || row.actorName;

  return (
    <div className="rounded-xl border border-slate-200 hover:border-slate-300 transition-colors overflow-hidden">
      <button onClick={onToggle} className="w-full text-left flex items-start gap-3 p-3">
        <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[16px] ring-1 ${TONE_BADGE[view.tone]}`}>
          {view.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-bold text-slate-800 leading-tight">{view.title}</p>
            <span className="shrink-0 text-[10px] text-slate-400 whitespace-nowrap mt-0.5">{relativeTime(row.createdAt)}</span>
          </div>
          <p className="text-[12px] text-slate-600 mt-0.5 leading-snug">{view.narrative}</p>

          {/* Changes made (collapsed preview: up to 3) */}
          {!open && view.changeBullets.length > 0 && (
            <p className="text-[11px] text-slate-400 mt-1 truncate">
              Changed: {view.changeBullets.slice(0, 3).join(', ')}{view.changeBullets.length > 3 ? ` +${view.changeBullets.length - 3} more` : ''}
            </p>
          )}
          {!open && (view.changeBullets.length > 0 || view.diffs.length > 0 || view.rows.length > 0) && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 mt-1">
              View Details <ChevronDown size={12} />
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pl-[3.75rem] space-y-3 animate-in fade-in">
          {/* Changes made bullets */}
          {view.changeBullets.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Changes made</p>
              <ul className="space-y-0.5">
                {view.changeBullets.map((b, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-[12px] text-slate-700">
                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Before → After diffs */}
          {view.diffs.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 divide-y divide-slate-100 overflow-hidden">
              {view.diffs.map((d, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] flex-wrap">
                  <span className="font-semibold text-slate-700 min-w-[90px]">{d.field}</span>
                  <span className={`px-1.5 py-0.5 rounded ${d.oldEmpty ? 'text-slate-400 italic' : 'bg-red-50 text-red-600'}`}>
                    {d.oldEmpty ? 'Not Available' : d.oldValue}
                  </span>
                  <ArrowRight size={12} className="text-slate-400" />
                  <span className={`px-1.5 py-0.5 rounded font-semibold ${d.newEmpty ? 'text-slate-400 italic' : 'bg-emerald-50 text-emerald-700'}`}>
                    {d.newEmpty ? 'Cleared' : d.newValue}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Detail rows */}
          {view.rows.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {view.rows.map((r, i) => (
                <div key={i} className="text-[12px]">
                  <span className="text-slate-400">{r.label}</span>
                  <div className={`text-slate-800 font-semibold ${r.mono ? 'font-mono' : ''}`}>{r.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Meta footer */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-slate-100 text-[12px]">
            <div><span className="text-slate-400">Updated By</span><div className="text-slate-800 font-semibold">{actor}{row.actorRole ? ` · ${row.actorRole}` : ''}</div></div>
            <div><span className="text-slate-400">Affected Module</span><div className="text-slate-800 font-semibold">{view.moduleLabel}</div></div>
            <div className="col-span-2"><span className="text-slate-400">When</span><div className="text-slate-800 font-semibold">{formatDateTime(row.createdAt)}</div></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecentActivityFeed;
