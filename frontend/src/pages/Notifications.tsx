import React, { useMemo, useState } from 'react';
import {
  Bell, Search, Check, CheckCheck, Archive, Trash2, ArrowUpRight, Info,
  ShieldCheck, Wallet, CalendarClock, FileText, Clock, Settings2,
} from 'lucide-react';
import { type Notification, type Role, type Company, isCompanyIdMatch } from '@/types';
import { type PageId } from '@/config/moduleRegistry';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { formatDate } from '@/utils/formatDate';
import { getApiErrorMessage } from '@/utils/apiError';

interface Props {
  notifications: Notification[];
  onUpdateNotifications: (updater: Notification[] | ((prev: Notification[]) => Notification[])) => void;
  activeCompanyId: string;
  companies: Company[];
  role: Role;
  onNavigate: (page: PageId) => void;
}

type Category = 'compliance' | 'payroll' | 'attendance' | 'leave' | 'documents' | 'system';

// Statutory / document keyword sets — used to bucket the generic `company` /
// `system` notification types (which the DB does not sub-categorise) into the
// finer filter tabs WITHOUT touching notification generation or storage.
const COMPLIANCE_KW = /\bgst\b|\bpf\b|provident|\besic?\b|professional\s*tax|\bpt\b|\btan\b|\bpan\b|labour|licen[cs]e|statutory|challan|filing|compliance|\btds\b|lwf/i;
const DOCUMENT_KW = /document|aadhaar|certificate|expir|renew|passport|\bkyc\b/i;

/** Derive a filter category from the notification's type + message. */
function categoryOf(n: Notification): Category {
  if (n.type === 'leave') return 'leave';
  if (n.type === 'payroll') return 'payroll';
  if (n.type === 'attendance') return 'attendance';
  // `company` / `system` → refine by keyword (compliance wins over documents so
  // "labour license" reads as compliance, not a document).
  if (COMPLIANCE_KW.test(n.message)) return 'compliance';
  if (DOCUMENT_KW.test(n.message)) return 'documents';
  return 'system';
}

/** Which module a notification should open when clicked (null = no target). */
function targetPageOf(n: Notification): PageId | null {
  const cat = categoryOf(n);
  const m = n.message.toLowerCase();
  switch (cat) {
    case 'leave': return 'leaves';
    case 'payroll': return 'payroll';
    case 'attendance': return 'attendance';
    case 'documents': return 'documents';
    case 'compliance':
      // Statutory *settings* (PF / ESI / PT) open Settings; filings/registrations
      // (GST / TDS / TAN / labour license) open Finance & Compliance.
      if (/\bpf\b|provident|\besic?\b|professional\s*tax|\bpt\b/.test(m)) return 'settings';
      return 'finance-compliance';
    default: return null; // pure system notice — nothing to open
  }
}

const CAT_META: Record<Category, { label: string; icon: React.ReactNode; tone: string }> = {
  compliance: { label: 'Compliance', icon: <ShieldCheck size={13} />, tone: 'text-indigo-600 bg-indigo-50' },
  payroll: { label: 'Payroll', icon: <Wallet size={13} />, tone: 'text-violet-600 bg-violet-50' },
  attendance: { label: 'Attendance', icon: <CalendarClock size={13} />, tone: 'text-sky-600 bg-sky-50' },
  leave: { label: 'Leave', icon: <Clock size={13} />, tone: 'text-amber-600 bg-amber-50' },
  documents: { label: 'Documents', icon: <FileText size={13} />, tone: 'text-emerald-600 bg-emerald-50' },
  system: { label: 'System', icon: <Settings2 size={13} />, tone: 'text-slate-500 bg-slate-100' },
};

type StatusFilter = 'all' | 'unread' | 'read' | Category | 'archived';
const ARCHIVE_KEY = 'hrms_archived_notifications';

const loadArchived = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]')); } catch { return new Set(); }
};
const saveArchived = (s: Set<string>) => { try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...s])); } catch { /* ignore */ } };

export const Notifications: React.FC<Props> = ({ notifications, onUpdateNotifications, activeCompanyId, companies, role, onNavigate }) => {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [range, setRange] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [archived, setArchived] = useState<Set<string>>(loadArchived);

  // ── Company / branch isolation ──
  // Non-Super-Admins only ever see their current company/branch workspace's
  // notifications (plus global ones with no companyId). Super Admin sees all.
  const scoped = useMemo(() => {
    const base = role === 'Super Admin'
      ? notifications
      : notifications.filter(n => !n.companyId || isCompanyIdMatch(n.companyId, activeCompanyId, companies as any[]));
    return [...base].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  }, [notifications, role, activeCompanyId, companies]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, unread: 0, read: 0, archived: 0, compliance: 0, payroll: 0, attendance: 0, leave: 0, documents: 0, system: 0 };
    for (const n of scoped) {
      if (archived.has(n.id)) { c.archived++; continue; }
      c.all++;
      c[n.read ? 'read' : 'unread']++;
      c[categoryOf(n)]++;
    }
    return c;
  }, [scoped, archived]);

  const rangeCutoff = useMemo(() => {
    if (range === 'all') return null;
    const now = new Date();
    const d = new Date(now);
    if (range === 'today') d.setHours(0, 0, 0, 0);
    else if (range === '7d') d.setDate(d.getDate() - 7);
    else if (range === '30d') d.setDate(d.getDate() - 30);
    return d;
  }, [range]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter(n => {
      const isArchived = archived.has(n.id);
      if (status === 'archived') { if (!isArchived) return false; }
      else {
        if (isArchived) return false; // hide archived from every other view
        if (status === 'unread' && n.read) return false;
        if (status === 'read' && !n.read) return false;
        if (status !== 'all' && status !== 'unread' && status !== 'read' && categoryOf(n) !== status) return false;
      }
      if (priority !== 'all' && n.priority !== priority) return false;
      if (rangeCutoff && new Date(n.timestamp) < rangeCutoff) return false;
      if (q && !n.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [scoped, status, priority, rangeCutoff, search, archived]);

  const markRead = (n: Notification) => {
    if (n.read) return;
    onUpdateNotifications(prev => prev.map(i => i.id === n.id ? { ...i, read: true } : i));
    api.notifications.markRead(n.id).catch(() => {});
  };

  const markAllRead = () => {
    onUpdateNotifications(prev => prev.map(i => ({ ...i, read: true })));
    api.notifications.markAllRead().catch(() => {});
  };

  const toggleArchive = (n: Notification) => {
    setArchived(prev => {
      const next = new Set(prev);
      if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
      saveArchived(next);
      return next;
    });
  };

  const remove = async (n: Notification) => {
    if (!(await ui.confirm({ message: 'Delete this notification?', variant: 'danger', confirmText: 'Delete' }))) return;
    try {
      await api.notifications.delete(n.id);
      onUpdateNotifications(prev => prev.filter(i => i.id !== n.id));
      if (archived.has(n.id)) toggleArchive(n);
    } catch (e: any) { ui.toast.error(getApiErrorMessage(e, 'Could not delete the notification.')); }
  };

  // Click a row → mark read, then open the related module.
  const openNotification = (n: Notification) => {
    markRead(n);
    const page = targetPageOf(n);
    if (page) onNavigate(page);
  };

  const TABS: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' }, { id: 'unread', label: 'Unread' }, { id: 'read', label: 'Read' },
    { id: 'compliance', label: 'Compliance' }, { id: 'payroll', label: 'Payroll' }, { id: 'attendance', label: 'Attendance' },
    { id: 'leave', label: 'Leave' }, { id: 'documents', label: 'Documents' }, { id: 'system', label: 'System' },
    { id: 'archived', label: 'Archived' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600"><Bell size={17} /></span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
            <p className="text-xs text-slate-500">{counts.unread} unread · {counts.all} total</p>
          </div>
        </div>
        <Button size="sm" variant="outline" icon={<CheckCheck size={14} />} onClick={markAllRead} disabled={counts.unread === 0}>Mark All Read</Button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setStatus(t.id)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${status === t.id ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600'}`}>
            {t.label}
            {counts[t.id as string] > 0 && <span className={`ml-1.5 ${status === t.id ? 'text-white/80' : 'text-slate-400'}`}>{counts[t.id as string]}</span>}
          </button>
        ))}
      </div>

      {/* Search + secondary filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Input icon={<Search size={14} />} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notifications…" />
        </div>
        <div className="w-40">
          <Select label="Priority" value={priority} onChange={e => setPriority(e.target.value as any)}
            options={[{ value: 'all', label: 'All Priorities' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} />
        </div>
        <div className="w-40">
          <Select label="Date" value={range} onChange={e => setRange(e.target.value as any)}
            options={[{ value: 'all', label: 'All Time' }, { value: 'today', label: 'Today' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }]} />
        </div>
      </div>

      {/* List */}
      <Card padding={false}>
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Bell size={26} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">No notifications match your filters.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(n => {
              const cat = categoryOf(n);
              const meta = CAT_META[cat];
              const target = targetPageOf(n);
              const isArchived = archived.has(n.id);
              return (
                <li key={n.id} className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50/70 ${!n.read ? 'bg-brand-50/30' : ''}`}>
                  <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${meta.tone}`}>{meta.icon || <Info size={14} />}</span>
                  <button onClick={() => openNotification(n)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                      <p className={`text-[13px] ${n.read ? 'font-medium text-slate-600' : 'font-bold text-slate-800'}`}>{n.message}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-400">
                      <span className={`rounded px-1.5 py-0.5 ${meta.tone}`}>{meta.label}</span>
                      <Badge variant={n.priority === 'high' ? 'red' : n.priority === 'medium' ? 'amber' : 'gray'}>{n.priority}</Badge>
                      <span>{n.timestamp ? formatDate(n.timestamp) : ''}</span>
                      {target && <span className="inline-flex items-center gap-0.5 text-brand-500">Open module <ArrowUpRight size={10} /></span>}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {!n.read && (
                      <button onClick={() => markRead(n)} title="Mark read" className="rounded-md p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"><Check size={14} /></button>
                    )}
                    <button onClick={() => toggleArchive(n)} title={isArchived ? 'Unarchive' : 'Archive'} className={`rounded-md p-1.5 hover:bg-slate-100 ${isArchived ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600'}`}><Archive size={14} /></button>
                    <button onClick={() => remove(n)} title="Delete" className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default Notifications;
