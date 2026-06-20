import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, ClipboardList, Search, Trash2, MessageSquare, Paperclip, Clock,
  AlertTriangle, CheckCircle2, Circle, X, Send, AtSign
} from 'lucide-react';
import { type Role, type Company, resolveActiveWorkspace } from '@/types';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { type ExportColumn } from '@/utils/exportUtils';
import { type UserAccount } from '@/pages/Login';
import { usePermissions } from '@/context/PermissionContext';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';

interface TaskManagerProps {
  role: Role;
  activeCompanyId: string;
  companies?: Company[];
  authProfile?: UserAccount | null;
}

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const STATUSES = ['Pending', 'In Progress', 'Completed', 'Cancelled', 'Overdue'];
const PRIORITY_VARIANT: Record<string, any> = { Low: 'gray', Medium: 'blue', High: 'amber', Critical: 'red' };
const STATUS_VARIANT: Record<string, any> = { Pending: 'amber', 'In Progress': 'blue', Completed: 'green', Cancelled: 'gray', Overdue: 'red' };

type TabId = 'all' | 'assignedToMe' | 'assignedByMe';

export const TaskManager: React.FC<TaskManagerProps> = ({ role, activeCompanyId, companies = [], authProfile }) => {
  const { canCreate: canCreateMod, canDelete: canDeleteMod, canExport: canExportMod } = usePermissions();
  const canCreate = canCreateMod('tasks');
  const canDelete = canDeleteMod('tasks');
  const canExport = canExportMod('tasks');
  const isEmployee = role === 'Employee';

  const [tasks, setTasks] = useState<any[]>([]);
  const [tab, setTab] = useState<TabId>(isEmployee ? 'assignedToMe' : 'all');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);

  const flash = (kind: 'ok' | 'err', msg: string) => { setToast({ kind, msg }); setTimeout(() => setToast(null), 4000); };

  const myUserId = String(authProfile?.id ?? '');
  const myEmpId = String(authProfile?.employeeId ?? '');

  // @mention is SEARCH-FIRST and SERVER-SIDE: nothing is loaded up front. The
  // backend returns only authorized MANAGEMENT system users (never the 800+
  // employee/staff records), scoped to the caller's company/branch permissions,
  // limited per request — so it scales to thousands of users.
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const RECENT_KEY = 'hrms_recent_assignees';
  const readRecent = (): any[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
  const rememberRecent = (u: any) => {
    try {
      const prev = readRecent().filter((x: any) => String(x.id) !== String(u.id));
      const next = [{ id: u.id, name: u.name, role: u.role, branchName: u.branchName, companyName: u.companyName, branchId: u.branchId, resolvedCompanyId: u.resolvedCompanyId, email: u.email }, ...prev].slice(0, 8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  };

  const loadTasks = useCallback(async () => {
    try { setTasks(await api.tasks.getAll() || []); } catch (e: any) { flash('err', e?.message || 'Failed to load tasks.'); }
  }, []);
  useEffect(() => { loadTasks(); }, [loadTasks, activeCompanyId]);

  const matchMine = (t: any, kind: TabId) => {
    const assignees = (t.assigneeIds || []).map((x: any) => String(x));
    const mineAssigned = assignees.includes(myUserId) || (myEmpId && assignees.includes(myEmpId));
    if (kind === 'assignedToMe') return mineAssigned;
    if (kind === 'assignedByMe') return String(t.createdById) === myUserId;
    return true;
  };

  const filtered = useMemo(() => {
    return tasks
      .filter(t => matchMine(t, tab))
      .filter(t => !statusFilter || t.status === statusFilter)
      .filter(t => !search || (t.title || '').toLowerCase().includes(search.toLowerCase()) || (t.createdByName || '').toLowerCase().includes(search.toLowerCase()));
  }, [tasks, tab, statusFilter, search, myUserId, myEmpId]);

  const stats = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'Pending').length,
    inProgress: tasks.filter(t => t.status === 'In Progress').length,
    completed: tasks.filter(t => t.status === 'Completed').length,
    overdue: tasks.filter(t => t.status === 'Overdue').length,
  }), [tasks]);

  /* ─── create form ─── */
  const emptyForm = { title: '', description: '', priority: 'Medium', status: 'Pending', startDate: '', dueDate: '', startTime: '', endTime: '', assignmentType: 'user', department: '', targetRole: '' };
  const [form, setForm] = useState<any>(emptyForm);
  const [picked, setPicked] = useState<any[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionFocused, setMentionFocused] = useState(false);
  // Workspace scope selectors: Super Admin picks Company + Branch; Company Head
  // may narrow to a branch within their company. HR is already branch-scoped.
  const [scopeCompanyId, setScopeCompanyId] = useState('');
  const [scopeBranchId, setScopeBranchId] = useState('');

  // ── Company / branch registries + display helpers ──
  const parentCompanies = useMemo(() => companies.filter(c => !(c as any).parentCompanyId), [companies]);
  const branchesOfCompany = useCallback((companyId: any) => companies.filter(c => String((c as any).parentCompanyId) === String(companyId)), [companies]);
  const companyNameOf = useCallback((id: any) => parentCompanies.find(c => String(c.id) === String(id))?.name || '—', [parentCompanies]);
  const roleLabel = (r: string) => ({ 'Company Head': 'Company Admin', 'HR': 'HR Admin' } as any)[r] || r;
  const initials = (name: string) => (name || '?').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();

  // Resolve the active workspace KIND-AWARELY. Branch ids overlap company ids
  // (Branch 2 "Bhavnagar" vs Company 2 "HealthPlus"), so a naive
  // companies.find(id===activeCompanyId) returns the wrong entity and the branch
  // dropdown would list a foreign company's branches. resolveActiveWorkspace uses
  // the workspace kind hint to pick the correct branch/company.
  const activeWorkspace = useMemo(
    () => resolveActiveWorkspace(companies as any[], activeCompanyId) || companies.find(c => String(c.id) === String(activeCompanyId)),
    [companies, activeCompanyId]
  );
  // The TOP-LEVEL company this workspace rolls up to (branch → its parent;
  // company → itself). The branch selector only ever lists THIS company's branches.
  const activeParentId = (activeWorkspace as any)?.parentCompanyId || (activeWorkspace as any)?.id || activeCompanyId;
  const branchOptionsForRole = role === 'Super Admin'
    ? (scopeCompanyId ? branchesOfCompany(scopeCompanyId) : [])
    : branchesOfCompany(activeParentId);

  // The stripped search term (a leading "@" is optional, so "@har" → "har").
  const mentionTerm = mentionQuery.replace(/^@+/, '').trim();
  // Typing just "@" surfaces recent users (optional Slack/Jira-style shortcut).
  const showRecent = mentionQuery.trim() === '@';

  // DEBOUNCED SERVER-SIDE SEARCH. We pass the active company/branch scope so the
  // backend returns only users from the correct company & branch (no cross-company
  // or cross-branch leakage). Nothing is fetched until the user types.
  useEffect(() => {
    if (!createOpen) return;
    if (mentionTerm.length < 1) { setMentionResults([]); setSearching(false); return; }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const rows = await api.users.getAssignable({
          search: mentionTerm,
          companyId: scopeCompanyId || undefined,
          branchId: scopeBranchId || undefined,
          limit: 8,
        });
        setMentionResults(rows || []);
      } catch { setMentionResults([]); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(handle);
  }, [mentionTerm, scopeCompanyId, scopeBranchId, createOpen]);

  // Recent users (client cache), filtered to the current company/branch scope so
  // a recent pick from another workspace never leaks in.
  const recentInScope = useMemo(() => {
    return readRecent().filter((u: any) => {
      if (scopeCompanyId && String(u.resolvedCompanyId ?? '') !== String(scopeCompanyId)) return false;
      if (scopeBranchId && !(String(u.branchId) === String(scopeBranchId) || u.branchId == null)) return false;
      return true;
    }).slice(0, 5);
  }, [scopeCompanyId, scopeBranchId, createOpen, mentionQuery]);

  // What the dropdown renders: search results once typing, else recent (on "@").
  const mentionMatches = useMemo(() => {
    const source = mentionTerm.length >= 1 ? mentionResults : (showRecent ? recentInScope : []);
    return source.filter((u: any) => !picked.find(p => p.id === u.id)).slice(0, 8);
  }, [mentionTerm, mentionResults, showRecent, recentInScope, picked]);

  const openCreate = () => {
    setForm(emptyForm); setPicked([]); setMentionQuery(''); setMentionFocused(false);
    // Pre-load the scope from the current workspace so the form opens already
    // filtered to the correct company/branch:
    //   • In a BRANCH workspace (e.g. Vishv → Bhavnagar) → company = Vishv,
    //     branch = Bhavnagar, users = Bhavnagar management users only.
    //   • In a COMPANY workspace → company set (for Super Admin), all branches.
    const ws = activeWorkspace as any;
    const wsIsBranch = !!ws?.parentCompanyId;
    const parentId = wsIsBranch ? ws.parentCompanyId : ws?.id;
    setScopeCompanyId(role === 'Super Admin' && parentId ? String(parentId) : '');
    setScopeBranchId(wsIsBranch ? String(ws.id) : '');
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!form.title.trim()) { flash('err', 'Task title is required.'); return; }
    setBusy(true);
    try {
      await api.tasks.create({
        ...form,
        // Super Admin may target a chosen company; everyone else stays in their
        // own workspace. An optional branch selection narrows the task.
        companyId: (role === 'Super Admin' && scopeCompanyId) ? scopeCompanyId : activeCompanyId,
        branchId: scopeBranchId || undefined,
        assigneeIds: picked.map(p => p.id),
        assigneeNames: picked.map(p => p.name),
        mentions: picked.map(p => '@' + (p.name || '').replace(/\s+/g, '')),
      });
      flash('ok', 'Task created and assignees notified.');
      setCreateOpen(false);
      await loadTasks();
    } catch (e: any) { flash('err', e?.message || 'Create failed.'); }
    finally { setBusy(false); }
  };

  const changeStatus = async (t: any, status: string) => {
    try { await api.tasks.update(t.id, { status }); await loadTasks(); if (detail?.id === t.id) setDetail({ ...detail, status }); }
    catch (e: any) { flash('err', e?.message || 'Update failed.'); }
  };
  const removeTask = async (t: any) => {
    if (!(await ui.confirm({ message: `Delete task "${t.title}"?`, confirmText: 'Delete', variant: 'danger' }))) return;
    try { await api.tasks.remove(t.id); await loadTasks(); flash('ok', 'Task deleted.'); }
    catch (e: any) { flash('err', e?.message || 'Delete failed.'); }
  };

  /* ─── comments ─── */
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  useEffect(() => {
    if (detail?.id) api.tasks.getComments(detail.id).then(setComments).catch(() => setComments([]));
    else setComments([]);
  }, [detail?.id]);
  const postComment = async () => {
    if (!newComment.trim()) return;
    try { await api.tasks.addComment(detail.id, { message: newComment }); setNewComment(''); setComments(await api.tasks.getComments(detail.id)); }
    catch (e: any) { flash('err', e?.message || 'Comment failed.'); }
  };

  /* ─── reports range ─── */
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const reportRows = useMemo(() => {
    const now = new Date('2026-06-13'); let lo: Date | null = null;
    if (range === 'today') { lo = new Date(now); lo.setHours(0, 0, 0, 0); }
    else if (range === 'week') { lo = new Date(now); lo.setDate(lo.getDate() - 7); }
    else if (range === 'month') { lo = new Date(now); lo.setMonth(lo.getMonth() - 1); }
    const cLo = from ? new Date(from) : null, cHi = to ? new Date(to) : null;
    return tasks.filter(t => {
      const d = new Date(t.createdAt);
      if (range === 'custom') return (!cLo || d >= cLo) && (!cHi || d <= cHi);
      return lo ? d >= lo : true;
    }).map(t => ({ ...t, assignees: (t.assigneeNames || []).join(', ') }));
  }, [tasks, range, from, to]);

  const TASK_COLS: ExportColumn[] = [
    { header: 'Title', key: 'title', width: 30 },
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Assignees', key: 'assignees', width: 28 },
    { header: 'Created By', key: 'createdByName', width: 20 },
    { header: 'Start', key: 'startDate', width: 14 },
    { header: 'Due', key: 'dueDate', width: 14 },
  ];

  const TABS: { id: TabId; label: string }[] = isEmployee
    ? [{ id: 'assignedToMe', label: 'My Tasks' }]
    : [{ id: 'all', label: 'All Tasks' }, { id: 'assignedByMe', label: 'Assigned By Me' }, { id: 'assignedToMe', label: 'Assigned To Me' }];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm">
        <div className="px-5 py-4 flex items-center justify-between border-b border-[#DBEAFE]">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><ClipboardList size={18} className="text-indigo-600" /> Task Manager</h2>
            <p className="text-xs text-slate-500">Assign tasks, track completion, and collaborate with comments.</p>
          </div>
          {canCreate && !isEmployee && <Button icon={<Plus size={15} />} onClick={openCreate}>Create Task</Button>}
        </div>
        <div className="flex flex-wrap gap-1 px-3 py-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>{t.label}</button>
          ))}
        </div>
      </div>

      {toast && <div className={`px-4 py-2.5 rounded-lg text-xs font-semibold ${toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{toast.msg}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Tasks" value={stats.total} icon={<ClipboardList size={16} />} color="bg-indigo-500" />
        <StatCard label="Pending" value={stats.pending} icon={<Circle size={16} />} color="bg-amber-500" />
        <StatCard label="In Progress" value={stats.inProgress} icon={<Clock size={16} />} color="bg-blue-500" />
        <StatCard label="Completed" value={stats.completed} icon={<CheckCircle2 size={16} />} color="bg-emerald-500" />
        <StatCard label="Overdue" value={stats.overdue} icon={<AlertTriangle size={16} />} color="bg-rose-500" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-44"><Input icon={<Search size={14} />} placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div className="w-40"><Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} options={[{ value: '', label: 'All Statuses' }, ...STATUSES.map(s => ({ value: s, label: s }))]} /></div>
          </div>
          {canExport && <ExportMenu fileName="Task_Report" title="Task Report" sheetName="Tasks" columns={TASK_COLS} rows={() => filtered.map(t => ({ ...t, assignees: (t.assigneeNames || []).join(', ') }))} />}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <Thead><Tr><Th>Task</Th><Th>Priority</Th><Th>Status</Th><Th>Assignees</Th><Th>Due</Th><Th>Actions</Th></Tr></Thead>
            <Tbody>
              {filtered.length === 0 && <Tr><Td colSpan={6}><span className="text-slate-400 text-xs">No tasks found.</span></Td></Tr>}
              {filtered.map(t => (
                <Tr key={t.id}>
                  <Td>
                    <button onClick={() => setDetail(t)} className="text-left">
                      <span className="font-semibold text-slate-800 hover:text-indigo-600">{t.title}</span>
                      <span className="block text-[10px] text-slate-400">by {t.createdByName}</span>
                    </button>
                  </Td>
                  <Td><Badge variant={PRIORITY_VARIANT[t.priority] || 'gray'}>{t.priority}</Badge></Td>
                  <Td>
                    <select value={t.status} onChange={e => changeStatus(t, e.target.value)} disabled={isEmployee && !(t.assigneeIds || []).map(String).includes(myEmpId) && !(t.assigneeIds || []).map(String).includes(myUserId)}
                      className="text-[11px] font-bold rounded-md border border-slate-200 px-1.5 py-1 bg-white text-slate-700">
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Td>
                  <Td><span className="text-[11px] text-slate-600">{(t.assigneeNames || []).join(', ') || (t.department || t.targetRole || '—')}</span></Td>
                  <Td><span className="text-[11px] text-slate-500">{t.dueDate || '—'}</span></Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setDetail(t)} title="Comments" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-indigo-600 shadow-sm"><MessageSquare size={13} /></button>
                      {canDelete && <button onClick={() => removeTask(t)} title="Delete" className="p-1.5 rounded-md border border-slate-200 bg-white text-rose-400 hover:text-rose-600 shadow-sm"><Trash2 size={13} /></button>}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      </Card>

      {/* Reports */}
      {!isEmployee && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-bold text-slate-800">Task Reports</h3>
            {canExport && <ExportMenu fileName="Task_Range_Report" title="Task Report" sheetName="Tasks" columns={TASK_COLS} rows={() => reportRows} subtitle={`Range: ${range}`} />}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40"><Select label="Range" value={range} onChange={e => setRange(e.target.value as any)} options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This Week' }, { value: 'month', label: 'This Month' }, { value: 'custom', label: 'Custom' }]} /></div>
            {range === 'custom' && <><Input label="From" type="date" value={from} onChange={e => setFrom(e.target.value)} /><Input label="To" type="date" value={to} onChange={e => setTo(e.target.value)} /></>}
            <span className="text-xs text-slate-500 pb-2">{reportRows.length} task(s)</span>
          </div>
        </Card>
      )}

      {/* Create Task Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Task" size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button loading={busy} onClick={submitCreate}>Create Task</Button></div>}>
        <div className="space-y-3">
          <Input label="Task Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Complete June Attendance Verification" />
          <Textarea label="Description" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Select label="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} options={PRIORITIES.map(p => ({ value: p, label: p }))} />
            <Select label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={STATUSES.map(s => ({ value: s, label: s }))} />
            <Input label="Start Date" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            <Input label="Due Date" type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
            <Input label="Start Time" type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
            <Input label="End Time" type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
            <Select label="Assignment Type" value={form.assignmentType} onChange={e => setForm({ ...form, assignmentType: e.target.value })} options={[{ value: 'user', label: 'Single / Multiple Users' }, { value: 'department', label: 'Department' }, { value: 'branch', label: 'Branch' }, { value: 'role', label: 'Role' }]} />
            {form.assignmentType === 'department' && <Input label="Department" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />}
            {form.assignmentType === 'role' && <Select label="Role" value={form.targetRole} onChange={e => setForm({ ...form, targetRole: e.target.value })} options={[{ value: '', label: 'Select…' }, ...['Company Head', 'HR', 'Finance', 'Employee'].map(r => ({ value: r, label: r }))]} />}
          </div>

          {/* Workspace scope (Super Admin: Company + Branch; Company Head: Branch) */}
          {(role === 'Super Admin' || branchOptionsForRole.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg bg-slate-50 border border-slate-100 p-3">
              {role === 'Super Admin' && (
                <Select label="Company" value={scopeCompanyId} onChange={e => { setScopeCompanyId(e.target.value); setScopeBranchId(''); setPicked([]); }}
                  options={[{ value: '', label: 'All Companies' }, ...parentCompanies.map(c => ({ value: String(c.id), label: c.name }))]} />
              )}
              <Select label="Branch" value={scopeBranchId} onChange={e => { setScopeBranchId(e.target.value); setPicked([]); }}
                options={[{ value: '', label: role === 'Super Admin' && !scopeCompanyId ? 'All Branches' : 'All Branches in Scope' }, ...branchOptionsForRole.map(b => ({ value: String(b.id), label: (b as any).branchName || b.name }))]} />
            </div>
          )}

          {/* @mention assignee picker — searches REAL users, never dictionary words */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1"><AtSign size={12} /> Assign / Mention Users</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5 mt-1">
              {picked.map(p => (
                <span key={p.id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  @{(p.name || '').replace(/\s+/g, '')}
                  <button onClick={() => setPicked(picked.filter(x => x.id !== p.id))}><X size={11} /></button>
                </span>
              ))}
            </div>
            <div className="relative">
              {/* Native browser autocomplete/spellcheck disabled so it can never
                  suggest dictionary words like "part / park" over real users. */}
              <Input
                placeholder="Type @ or a name to search users…"
                value={mentionQuery}
                onChange={e => setMentionQuery(e.target.value)}
                onFocus={() => setMentionFocused(true)}
                onBlur={() => setTimeout(() => setMentionFocused(false), 150)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                name="task-mention-search"
              />
              {/* SEARCH-FIRST: the dropdown only appears once the user types (or
                  types "@" for recent). Nothing is shown — or loaded — on focus. */}
              {mentionFocused && (mentionTerm.length >= 1 || showRecent) && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-72 overflow-y-auto">
                  {showRecent && mentionMatches.length > 0 && (
                    <div className="px-3 pt-2 pb-1 text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Recently Assigned</div>
                  )}
                  {searching && mentionTerm.length >= 1 ? (
                    <div className="px-3 py-3 text-[11px] text-slate-400">Searching users…</div>
                  ) : mentionMatches.length === 0 ? (
                    <div className="px-3 py-3 text-[11px] text-slate-400">
                      {mentionTerm.length >= 1
                        ? (scopeBranchId
                            ? `No users matching “${mentionTerm}” in this branch. Try “All Branches in Scope”.`
                            : `No management users matching “${mentionTerm}” in this scope.`)
                        : 'No recent users yet — type a name to search.'}
                    </div>
                  ) : mentionMatches.map(u => (
                    <button key={u.id} type="button" onMouseDown={ev => ev.preventDefault()} onClick={() => { setPicked([...picked, u]); rememberRecent(u); setMentionQuery(''); }}
                      className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-3 border-b border-slate-50 last:border-0">
                      {u.avatar ? (
                        <img src={u.avatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px] font-extrabold flex-shrink-0">{initials(u.name)}</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{u.name}</p>
                        <p className="text-[10px] text-indigo-600 font-semibold truncate">{roleLabel(u.role)}</p>
                        <p className="text-[10px] text-slate-400 truncate">{u.branchName ? `${u.branchName} Branch` : 'Company-wide'} · {u.companyName || companyNameOf(u.resolvedCompanyId ?? u.companyId)}{u.email ? ` · ${u.email}` : ''}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Search authorized management users only
              {scopeBranchId ? ` · ${(branchOptionsForRole.find(b => String(b.id) === scopeBranchId) as any)?.branchName || (branchOptionsForRole.find(b => String(b.id) === scopeBranchId) as any)?.name || 'branch'}` : scopeCompanyId ? ` · ${companyNameOf(scopeCompanyId)}` : ''}
            </p>
          </div>
        </div>
      </Modal>

      {/* Task Detail + Comments */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || 'Task'} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={PRIORITY_VARIANT[detail.priority] || 'gray'}>{detail.priority}</Badge>
              <Badge variant={STATUS_VARIANT[detail.status] || 'gray'}>{detail.status}</Badge>
              {detail.dueDate && <Badge variant="blue">Due {detail.dueDate}</Badge>}
            </div>
            {detail.description && <p className="text-sm text-slate-600">{detail.description}</p>}
            <div className="text-[11px] text-slate-500">
              Assigned to: <span className="font-semibold text-slate-700">{(detail.assigneeNames || []).join(', ') || detail.department || detail.targetRole || '—'}</span> · Created by {detail.createdByName}
            </div>
            <div className="border-t border-slate-100 pt-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1"><MessageSquare size={13} /> Comments</h4>
              <div className="space-y-2 max-h-52 overflow-y-auto mb-2">
                {comments.length === 0 && <p className="text-xs text-slate-400">No comments yet.</p>}
                {comments.map(c => (
                  <div key={c.id} className={`rounded-lg px-3 py-2 text-xs ${c.isStatus ? 'bg-slate-50 text-slate-500 italic' : 'bg-indigo-50/50'}`}>
                    <span className="font-bold text-slate-700">{c.userName || 'User'}</span>
                    <span className="text-[10px] text-slate-400 ml-1.5">{new Date(c.createdAt).toLocaleString('en-IN')}</span>
                    <p className="text-slate-600 mt-0.5">{c.message}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input placeholder="Add a comment…" value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') postComment(); }} />
                <Button size="sm" icon={<Send size={13} />} onClick={postComment}>Post</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TaskManager;
