import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Users, Wallet, CalendarPlus, CalendarMinus, RotateCcw, ArrowLeftRight,
  History as HistoryIcon, BarChart3, ShieldCheck, FileText, RefreshCw, Settings2, ChevronDown,
  LayoutDashboard, Clock, CheckCircle2, AlertCircle, ArrowRight
} from 'lucide-react';
import {
  type Employee, type LeaveRequest, type Role, type Company,
  buildScopedEmployeeIdSet
} from '@/types';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { type ExportColumn } from '@/utils/exportUtils';
import { formatDate } from '@/utils/formatDate';
import { type UserAccount } from '@/pages/Login';
import { usePermissions } from '@/context/PermissionContext';
import { api } from '@/api/apiClient';
import { getUniqueEmployees } from '@/utils/deduplication';
import { isActiveEmployee } from '@/utils/employeeStatus';
import { Leaves } from '@/pages/Leaves';
import { useDismissable } from '@/hooks/useDismissable';

type TabId = 'dashboard' | 'requests' | 'administration' | 'balances' | 'history' | 'reports' | 'policies';

interface LeaveManagementProps {
  role: Role;
  activeCompanyId: string;
  leaves: LeaveRequest[];
  onUpdateLeaves: (leaves: LeaveRequest[]) => void;
  employees: Employee[];
  companies?: Company[];
  authProfile?: UserAccount | null;
}

const CATS = [
  { value: 'CL', label: 'CL — Casual' },
  { value: 'PL', label: 'PL — Privilege / Annual' },
  { value: 'SL', label: 'SL — Sick' },
];
const num = (n: any) => Math.round((Number(n) || 0) * 100) / 100;

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
  { id: 'requests', label: 'Leave Requests', icon: <FileText size={14} /> },
  { id: 'administration', label: 'Administration', icon: <Users size={14} /> },
  { id: 'balances', label: 'Leave Balances', icon: <Wallet size={14} /> },
  { id: 'history', label: 'History', icon: <HistoryIcon size={14} /> },
  { id: 'reports', label: 'Reports', icon: <BarChart3 size={14} /> },
  { id: 'policies', label: 'Policies & Audit', icon: <ShieldCheck size={14} /> },
];

export const LeaveManagement: React.FC<LeaveManagementProps> = ({
  role, activeCompanyId, leaves, onUpdateLeaves, employees, companies = [], authProfile,
}) => {
  const { canEdit: canEditMod, canExport: canExportMod } = usePermissions();
  const canEdit = canEditMod('leaves');
  const canExport = canExportMod('leaves');

  // Default landing is the Dashboard overview — never auto-open a child sub-tab.
  const [tab, setTab] = useState<TabId>('dashboard');
  const [balances, setBalances] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const flash = (kind: 'ok' | 'err', msg: string) => { setToast({ kind, msg }); setTimeout(() => setToast(null), 4000); };

  // Employees scoped to the active workspace (company or branch).
  const uniqueEmployees = useMemo(() => getUniqueEmployees(employees), [employees]);
  const scopedEmpIds = useMemo(
    () => buildScopedEmployeeIdSet(uniqueEmployees as any[], activeCompanyId, companies as any[]),
    [uniqueEmployees, activeCompanyId, companies]
  );
  const scopedEmployees = useMemo(
    () => uniqueEmployees.filter(e => isActiveEmployee(e) && ((e.id && scopedEmpIds.has(e.id)) || (e.employeeId && scopedEmpIds.has(e.employeeId)))),
    [uniqueEmployees, scopedEmpIds]
  );
  const empById = useMemo(() => {
    const m = new Map<string, Employee>();
    scopedEmployees.forEach(e => { m.set(String(e.id), e); if (e.employeeId) m.set(String(e.employeeId), e); });
    return m;
  }, [scopedEmployees]);

  const loadBalances = useCallback(async () => {
    try { setBalances(await api.leaveBalances.getAll() || []); } catch { /* ignore */ }
  }, []);
  const loadConfig = useCallback(async () => {
    try { setConfig(await api.leaveCredit.get()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadBalances(); loadConfig(); }, [loadBalances, loadConfig, activeCompanyId]);
  useEffect(() => { if (tab === 'policies') { api.leaveAdmin.audit().then(setAuditLog).catch(() => {}); loadConfig(); } }, [tab, loadConfig]);

  // Merge balance rows onto scoped employees so every employee appears.
  const adminRows = useMemo(() => {
    const balByEmp = new Map<string, any>();
    balances.forEach(b => balByEmp.set(String(b.employeeId), b));
    return scopedEmployees.map(e => {
      const b = balByEmp.get(String(e.id)) || {};
      const cl = num(b.clBalance), pl = num(b.plBalance), sl = num(b.slBalance);
      const taken = num(b.clUsed) + num(b.plUsed) + num(b.slUsed);
      return {
        employeeId: e.id,
        employeeCode: e.employeeId || '—',
        employeeName: e.name,
        branch: (e as any).branchLocation || 'Head Office',
        department: e.department || '—',
        cl, pl, sl,
        remaining: num(cl + pl + sl),
        taken: num(taken),
      };
    });
  }, [scopedEmployees, balances]);

  /* ─── action modal state ─────────────────────────────────────────────── */
  type ActionKind = 'grant' | 'deduct' | 'reset' | 'transfer' | 'edit';
  const [action, setAction] = useState<{ kind: ActionKind; row: any } | null>(null);
  const [form, setForm] = useState<any>({});
  const [manageOpen, setManageOpen] = useState(false);
  const manageRef = useRef<HTMLDivElement>(null);
  useDismissable(manageOpen, useCallback(() => setManageOpen(false), []), manageRef);
  const today = () => new Date().toISOString().slice(0, 10);
  const openAction = (kind: ActionKind, row: any) => {
    setForm(kind === 'edit'
      ? { clBalance: row.cl, plBalance: row.pl, slBalance: row.sl }
      : { category: 'CL', days: 1, reason: '', toEmployeeId: '', month: 'June', employeeId: row.employeeId || '', effectiveDate: today() });
    setAction({ kind, row });
  };
  // Standalone "Manage Leave" actions launched from the toolbar dropdown — the
  // employee is chosen inside the modal (row starts empty).
  const openManage = (kind: 'grant' | 'deduct') => {
    setManageOpen(false);
    setForm({ category: 'CL', days: 1, reason: '', effectiveDate: today(), employeeId: '' });
    setAction({ kind, row: { employeeId: '', employeeName: '' } });
  };
  const closeAction = () => { setAction(null); setForm({}); };

  const submitAction = async () => {
    if (!action) return;
    const eid = action.row.employeeId || form.employeeId;
    const empName = action.row.employeeName
      || adminRows.find(r => String(r.employeeId) === String(eid))?.employeeName
      || 'employee';
    setBusy(true);
    try {
      if (action.kind === 'grant') {
        if (!eid) { flash('err', 'Select an employee.'); setBusy(false); return; }
        await api.leaveAdmin.grant({ employeeId: eid, category: form.category, days: Number(form.days), reason: form.reason, effectiveDate: form.effectiveDate });
        flash('ok', `Added ${form.days} ${form.category} credit to ${empName}.`);
      } else if (action.kind === 'deduct') {
        if (!eid) { flash('err', 'Select an employee.'); setBusy(false); return; }
        await api.leaveAdmin.deduct({ employeeId: eid, category: form.category, days: Number(form.days), reason: form.reason, effectiveDate: form.effectiveDate });
        flash('ok', `Deducted ${form.days} ${form.category} credit from ${empName}.`);
      } else if (action.kind === 'reset') {
        await api.leaveAdmin.reset({ employeeId: eid, keepCarryForward: !!form.keepCarryForward });
        flash('ok', `Reset yearly balance for ${action.row.employeeName}.`);
      } else if (action.kind === 'transfer') {
        if (!form.toEmployeeId) { flash('err', 'Select a destination employee.'); setBusy(false); return; }
        await api.leaveAdmin.transfer({ fromEmployeeId: eid, toEmployeeId: form.toEmployeeId, category: form.category, days: Number(form.days), reason: form.reason });
        flash('ok', `Transferred ${form.days} ${form.category}.`);
      } else if (action.kind === 'edit') {
        await api.leaveBalances.update(eid, { clBalance: Number(form.clBalance), plBalance: Number(form.plBalance), slBalance: Number(form.slBalance) });
        flash('ok', `Updated balances for ${action.row.employeeName}.`);
      }
      await loadBalances();
      closeAction();
    } catch (e: any) {
      flash('err', e?.message || 'Action failed.');
    } finally { setBusy(false); }
  };

  /* ─── credits / accrual ──────────────────────────────────────────────── */
  const [cfgForm, setCfgForm] = useState<any>(null);
  useEffect(() => { if (config) setCfgForm({ ...config }); }, [config]);

  const saveConfig = async (extra: any = {}) => {
    setBusy(true);
    try {
      const payload = { ...cfgForm, ...extra };
      await api.leaveCredit.update(payload);
      await loadConfig();
      flash('ok', 'Leave policy saved.');
    } catch (e: any) { flash('err', e?.message || 'Save failed.'); }
    finally { setBusy(false); }
  };

  /* ─── history filters ────────────────────────────────────────────────── */
  const [range, setRange] = useState<'weekly' | 'monthly' | 'yearly' | 'custom'>('monthly');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const scopedLeaves = useMemo(() => {
    return leaves.filter(l => (l.employeeId && scopedEmpIds.has(String(l.employeeId))) || empById.has(String(l.employeeId)));
  }, [leaves, scopedEmpIds, empById]);

  // ── Dashboard overview (derived from already-loaded data; no new API / logic) ──
  const dash = useMemo(() => {
    const byDate = [...scopedLeaves].sort((a, b) => String(b.appliedOn || b.fromDate || '').localeCompare(String(a.appliedOn || a.fromDate || '')));
    const pending = byDate.filter(l => l.status === 'Pending');
    const approved = scopedLeaves.filter(l => l.status === 'Approved');
    const rejected = scopedLeaves.filter(l => l.status === 'Rejected');
    const totalRemaining = adminRows.reduce((t, r) => t + (Number(r.remaining) || 0), 0);
    const totalTaken = adminRows.reduce((t, r) => t + (Number(r.taken) || 0), 0);
    const totalCL = adminRows.reduce((t, r) => t + (Number(r.cl) || 0), 0);
    const totalPL = adminRows.reduce((t, r) => t + (Number(r.pl) || 0), 0);
    const totalSL = adminRows.reduce((t, r) => t + (Number(r.sl) || 0), 0);
    const lowBalance = adminRows.filter(r => (Number(r.remaining) || 0) <= 2).length;
    return {
      total: scopedLeaves.length, pending, approved: approved.length, rejected: rejected.length,
      recent: byDate.slice(0, 6), pendingList: pending.slice(0, 6),
      totalRemaining: num(totalRemaining), totalTaken: num(totalTaken), totalCL: num(totalCL), totalPL: num(totalPL), totalSL: num(totalSL), lowBalance,
    };
  }, [scopedLeaves, adminRows]);
  const historyRows = useMemo(() => {
    const now = new Date('2026-06-13');
    let lo: Date | null = null;
    if (range === 'weekly') { lo = new Date(now); lo.setDate(lo.getDate() - 7); }
    else if (range === 'monthly') { lo = new Date(now); lo.setMonth(lo.getMonth() - 1); }
    else if (range === 'yearly') { lo = new Date(now); lo.setFullYear(lo.getFullYear() - 1); }
    const customLo = from ? new Date(from) : null;
    const customHi = to ? new Date(to) : null;
    return scopedLeaves.filter(l => {
      const d = new Date(l.appliedOn || l.fromDate);
      if (range === 'custom') {
        if (customLo && d < customLo) return false;
        if (customHi && d > customHi) return false;
        return true;
      }
      return lo ? d >= lo : true;
    });
  }, [scopedLeaves, range, from, to]);

  /* ─── reports aggregates ─────────────────────────────────────────────── */
  const reportStats = useMemo(() => {
    const approved = scopedLeaves.filter(l => l.status === 'Approved');
    const totalDays = approved.reduce((s, l) => s + (Number(l.days) || 0), 0);
    const totalRemaining = adminRows.reduce((s, r) => s + r.remaining, 0);
    const totalTaken = adminRows.reduce((s, r) => s + r.taken, 0);
    return { pending: scopedLeaves.filter(l => l.status === 'Pending').length, approvedDays: num(totalDays), totalRemaining: num(totalRemaining), totalTaken: num(totalTaken) };
  }, [scopedLeaves, adminRows]);

  /* ─── export column sets ─────────────────────────────────────────────── */
  const ADMIN_COLS: ExportColumn[] = [
    { header: 'Emp Code', key: 'employeeCode', width: 14 },
    { header: 'Employee', key: 'employeeName', width: 24 },
    { header: 'Branch', key: 'branch', width: 16 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'CL', key: 'cl', width: 8 }, { header: 'PL', key: 'pl', width: 8 }, { header: 'SL', key: 'sl', width: 8 },
    { header: 'Taken', key: 'taken', width: 10 }, { header: 'Remaining', key: 'remaining', width: 12 },
  ];
  const HISTORY_COLS: ExportColumn[] = [
    { header: 'Employee', key: 'employeeName', width: 24 },
    { header: 'Leave Type', key: 'leaveType', width: 16 },
    { header: 'Days', key: 'days', width: 8 },
    { header: 'Applied On', key: 'appliedOn', width: 14 },
    { header: 'From', key: 'fromDate', width: 14 }, { header: 'To', key: 'toDate', width: 14 },
    { header: 'Approved By', key: 'approvedBy', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
  ];

  /* ─── render helpers ─────────────────────────────────────────────────── */
  const ActionBtn = ({ onClick, title, children, danger }: any) => (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded-md border border-slate-200 bg-white shadow-sm transition-colors ${danger ? 'text-rose-400 hover:text-rose-600' : 'text-slate-400 hover:text-indigo-600'}`}>
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Header + tabs */}
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm">
        <div className="px-5 py-4 flex items-center justify-between border-b border-[#DBEAFE]">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Leave Management</h2>
            <p className="text-xs text-slate-500">Dashboard · Requests · Administration · Balances · History · Reports · Policies</p>
          </div>
          <Badge variant="indigo">{scopedEmployees.length} employees in workspace</Badge>
        </div>
        <div className="flex flex-wrap gap-1 px-3 py-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {toast && (
        <div className={`px-4 py-2.5 rounded-lg text-xs font-semibold ${toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Dashboard (default landing — overview only; nothing auto-opens) ── */}
      {tab === 'dashboard' && (() => {
        const statusChip = (s: string) => {
          const map: Record<string, string> = { Pending: 'bg-amber-50 text-amber-700 border-amber-200', Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200', Rejected: 'bg-rose-50 text-rose-700 border-rose-200', Cancelled: 'bg-slate-100 text-slate-500 border-slate-200' };
          return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${map[s] || map.Cancelled}`}>{s}</span>;
        };
        const tiles = [
          { label: 'Total Requests', value: dash.total, icon: <FileText size={16} />, color: 'bg-indigo-500' },
          { label: 'Pending Approvals', value: dash.pending.length, icon: <Clock size={16} />, color: 'bg-amber-500' },
          { label: 'Approved', value: dash.approved, icon: <CheckCircle2 size={16} />, color: 'bg-emerald-500' },
          { label: 'Leave Balance (days)', value: dash.totalRemaining, icon: <Wallet size={16} />, color: 'bg-violet-500' },
          { label: 'Employees', value: scopedEmployees.length, icon: <Users size={16} />, color: 'bg-blue-500' },
        ];
        const fmt = (d: string) => formatDate(d);
        const LeaveRow = ({ l }: { l: LeaveRequest }) => (
          <div className="flex items-center justify-between gap-2 py-2 border-b border-slate-50 last:border-0">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{l.employeeName}</p>
              <p className="text-[10px] text-slate-400">{l.leaveType} · {fmt(l.fromDate)}–{fmt(l.toDate)} · {l.days}d</p>
            </div>
            {statusChip(l.status)}
          </div>
        );
        return (
          <div className="space-y-4">
            {/* Leave Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {tiles.map(t => (
                <div key={t.label} className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm p-3.5 flex items-center gap-3">
                  <span className={`w-10 h-10 rounded-xl text-white flex items-center justify-center ${t.color}`}>{t.icon}</span>
                  <div className="min-w-0"><p className="text-xl font-bold text-slate-800 leading-none">{t.value}</p><p className="text-[10px] text-slate-500 font-semibold mt-1 truncate">{t.label}</p></div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Pending Approvals */}
              <Card>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Clock size={15} className="text-amber-500" /> Pending Approvals <span className="text-[10px] font-bold text-amber-600">({dash.pending.length})</span></h3>
                  <button onClick={() => setTab('requests')} className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1">Review all <ArrowRight size={12} /></button>
                </div>
                {dash.pendingList.length === 0
                  ? <div className="py-8 text-center"><CheckCircle2 size={22} className="mx-auto text-emerald-500 mb-1" /><p className="text-xs font-semibold text-slate-500">No pending leave requests.</p></div>
                  : <div>{dash.pendingList.map(l => <LeaveRow key={l.id} l={l} />)}</div>}
              </Card>

              {/* Recent Requests */}
              <Card>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><HistoryIcon size={15} className="text-slate-500" /> Recent Requests</h3>
                  <button onClick={() => setTab('requests')} className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1">View all <ArrowRight size={12} /></button>
                </div>
                {dash.recent.length === 0
                  ? <div className="py-8 text-center text-xs text-slate-400">No leave requests yet.</div>
                  : <div>{dash.recent.map(l => <LeaveRow key={l.id} l={l} />)}</div>}
              </Card>
            </div>

            {/* Leave Balances Overview */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Wallet size={15} className="text-violet-500" /> Leave Balances Overview</h3>
                <button onClick={() => setTab('administration')} className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1">Open Administration <ArrowRight size={12} /></button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-3"><p className="text-lg font-bold text-blue-700">{dash.totalCL}</p><p className="text-[10px] font-semibold text-blue-600/80">CL Available</p></div>
                <div className="rounded-xl bg-violet-50 border border-violet-100 p-3"><p className="text-lg font-bold text-violet-700">{dash.totalPL}</p><p className="text-[10px] font-semibold text-violet-600/80">PL Available</p></div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3"><p className="text-lg font-bold text-amber-700">{dash.totalSL}</p><p className="text-[10px] font-semibold text-amber-600/80">SL Available</p></div>
                <div className="rounded-xl bg-rose-50 border border-rose-100 p-3"><p className="text-lg font-bold text-rose-700">{dash.totalTaken}</p><p className="text-[10px] font-semibold text-rose-600/80">Days Taken</p></div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><p className="text-lg font-bold text-slate-700 flex items-center justify-center gap-1">{dash.lowBalance > 0 && <AlertCircle size={14} className="text-amber-500" />}{dash.lowBalance}</p><p className="text-[10px] font-semibold text-slate-500">Low Balance (≤2)</p></div>
              </div>
            </Card>

            {/* Quick Actions */}
            <Card>
              <h3 className="text-sm font-bold text-slate-800 mb-3">Quick Actions</h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={<FileText size={13} />} onClick={() => setTab('requests')}>Leave Requests</Button>
                {canEdit && <Button size="sm" variant="outline" icon={<CalendarPlus size={13} />} onClick={() => setTab('administration')}>Manage Balances</Button>}
                <Button size="sm" variant="outline" icon={<Wallet size={13} />} onClick={() => setTab('balances')}>Leave Balances</Button>
                <Button size="sm" variant="outline" icon={<HistoryIcon size={13} />} onClick={() => setTab('history')}>History</Button>
                <Button size="sm" variant="outline" icon={<BarChart3 size={13} />} onClick={() => setTab('reports')}>Reports</Button>
                <Button size="sm" variant="outline" icon={<ShieldCheck size={13} />} onClick={() => setTab('policies')}>Policies &amp; Audit</Button>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* ── Requests (existing module) ── */}
      {tab === 'requests' && (
        <Leaves role={role} activeCompanyId={activeCompanyId} leaves={leaves} onUpdateLeaves={onUpdateLeaves}
          _employees={employees} companies={companies} authProfile={authProfile} />
      )}

      {/* ── Administration ── */}
      {tab === 'administration' && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800">Leave Administration</h3>
            <div className="flex items-center gap-2">
              {canEdit && (
                <div className="relative" ref={manageRef}>
                  <Button size="sm" icon={<CalendarPlus size={13} />} onClick={() => setManageOpen(o => !o)}>
                    Manage Leave <ChevronDown size={13} className="ml-1" />
                  </Button>
                  {manageOpen && (
                    <>
                      <div className="absolute right-0 mt-1 z-20 w-52 rounded-xl border border-slate-200 bg-white shadow-lg py-1">
                        <button onClick={() => openManage('grant')}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
                          <CalendarPlus size={14} /> Add Leave Credit
                        </button>
                        <button onClick={() => openManage('deduct')}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700 transition-colors">
                          <CalendarMinus size={14} /> Deduct Leave Credit
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {canExport && <ExportMenu fileName="Leave_Administration" title="Leave Administration" sheetName="Balances" columns={ADMIN_COLS} rows={() => adminRows} />}
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>Emp Code</Th><Th>Employee</Th><Th>Branch</Th><Th>Department</Th>
                  <Th>CL</Th><Th>PL</Th><Th>SL</Th><Th>Taken</Th><Th>Remaining</Th><Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {adminRows.length === 0 && <Tr><Td colSpan={10}><span className="text-slate-400 text-xs">No employees in this workspace.</span></Td></Tr>}
                {adminRows.map(r => (
                  <Tr key={r.employeeId}>
                    <Td><span className="font-mono text-[11px] text-indigo-700">{r.employeeCode}</span></Td>
                    <Td><span className="font-semibold text-slate-800">{r.employeeName}</span></Td>
                    <Td>{r.branch}</Td><Td>{r.department}</Td>
                    <Td><Badge variant="blue">{r.cl}</Badge></Td>
                    <Td><Badge variant="purple">{r.pl}</Badge></Td>
                    <Td><Badge variant="amber">{r.sl}</Badge></Td>
                    <Td><span className="font-semibold text-rose-600">{r.taken}</span></Td>
                    <Td><span className="font-bold text-emerald-600">{r.remaining}</span></Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        {canEdit && <ActionBtn onClick={() => openAction('grant', r)} title="Grant Leave"><CalendarPlus size={13} /></ActionBtn>}
                        {canEdit && <ActionBtn onClick={() => openAction('deduct', r)} title="Deduct Leave"><CalendarMinus size={13} /></ActionBtn>}
                        {canEdit && <ActionBtn onClick={() => openAction('transfer', r)} title="Transfer Leave"><ArrowLeftRight size={13} /></ActionBtn>}
                        {canEdit && <ActionBtn onClick={() => openAction('edit', r)} title="Edit Balances"><Settings2 size={13} /></ActionBtn>}
                        {canEdit && <ActionBtn onClick={() => openAction('reset', r)} title="Reset Yearly"><RotateCcw size={13} /></ActionBtn>}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Card>
      )}

      {/* ── Balances (wallet) ── */}
      {tab === 'balances' && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800">Employee Leave Wallets</h3>
            <Button size="sm" variant="outline" icon={<RefreshCw size={13} />} onClick={loadBalances}>Refresh</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {adminRows.map(r => (
              <div key={r.employeeId} className="rounded-xl border border-slate-200 p-3.5 bg-gradient-to-br from-white to-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{r.employeeName}</p>
                    <p className="text-[10px] font-mono text-slate-400">{r.employeeCode} · {r.branch}</p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600">{r.remaining} left</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-blue-50 py-1.5"><p className="text-[9px] font-bold text-blue-400 uppercase">CL</p><p className="font-extrabold text-blue-700">{r.cl}</p></div>
                  <div className="rounded-lg bg-violet-50 py-1.5"><p className="text-[9px] font-bold text-violet-400 uppercase">PL</p><p className="font-extrabold text-violet-700">{r.pl}</p></div>
                  <div className="rounded-lg bg-amber-50 py-1.5"><p className="text-[9px] font-bold text-amber-400 uppercase">SL</p><p className="font-extrabold text-amber-700">{r.sl}</p></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── History ── */}
      {tab === 'history' && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-bold text-slate-800">Leave History</h3>
            {canExport && <ExportMenu fileName="Leave_History" title="Leave History" sheetName="History" columns={HISTORY_COLS} rows={() => historyRows} subtitle={`Range: ${range}`} />}
          </div>
          <div className="flex flex-wrap items-end gap-2 mb-4">
            <div className="w-40"><Select label="Range" value={range} onChange={e => setRange(e.target.value as any)} options={[{ value: 'weekly', label: 'Last 7 days' }, { value: 'monthly', label: 'Last month' }, { value: 'yearly', label: 'Last year' }, { value: 'custom', label: 'Custom range' }]} /></div>
            {range === 'custom' && <>
              <Input label="From" type="date" value={from} onChange={e => setFrom(e.target.value)} />
              <Input label="To" type="date" value={to} onChange={e => setTo(e.target.value)} />
            </>}
            <span className="text-xs text-slate-500 pb-2">{historyRows.length} record(s)</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <Thead><Tr><Th>Employee</Th><Th>Leave Type</Th><Th>Days</Th><Th>Applied</Th><Th>Approved By</Th><Th>Status</Th></Tr></Thead>
              <Tbody>
                {historyRows.length === 0 && <Tr><Td colSpan={6}><span className="text-slate-400 text-xs">No leave activity in this range.</span></Td></Tr>}
                {historyRows.map(l => (
                  <Tr key={l.id}>
                    <Td><span className="font-semibold text-slate-800">{l.employeeName}</span></Td>
                    <Td>{l.leaveType}</Td><Td>{l.days}</Td>
                    <Td><span className="text-[11px] text-slate-500">{l.appliedOn || l.fromDate}</span></Td>
                    <Td>{l.approvedBy || '—'}</Td>
                    <Td><Badge variant={l.status === 'Approved' ? 'green' : l.status === 'Rejected' ? 'red' : l.status === 'Cancelled' ? 'gray' : 'amber'}>{l.status}</Badge></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Card>
      )}

      {/* ── Reports ── */}
      {tab === 'reports' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Pending Requests" value={reportStats.pending} icon={<HistoryIcon size={16} />} color="bg-amber-500" />
            <StatCard label="Approved Days" value={reportStats.approvedDays} icon={<CalendarPlus size={16} />} color="bg-blue-500" />
            <StatCard label="Leaves Taken" value={reportStats.totalTaken} icon={<CalendarMinus size={16} />} color="bg-rose-500" />
            <StatCard label="Remaining Balance" value={reportStats.totalRemaining} icon={<Wallet size={16} />} color="bg-emerald-500" />
          </div>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800">Per-Employee Leave Summary</h3>
              {canExport && <ExportMenu fileName="Leave_Report" title="Leave Summary Report" sheetName="Report" columns={ADMIN_COLS} rows={() => adminRows} />}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <Thead><Tr><Th>Employee</Th><Th>Branch</Th><Th>CL</Th><Th>PL</Th><Th>SL</Th><Th>Taken</Th><Th>Remaining</Th></Tr></Thead>
                <Tbody>
                  {adminRows.map(r => (
                    <Tr key={r.employeeId}>
                      <Td><span className="font-semibold text-slate-800">{r.employeeName}</span></Td>
                      <Td>{r.branch}</Td><Td>{r.cl}</Td><Td>{r.pl}</Td><Td>{r.sl}</Td>
                      <Td><span className="text-rose-600 font-semibold">{r.taken}</span></Td>
                      <Td><span className="text-emerald-600 font-bold">{r.remaining}</span></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      {/* ── Policies & Audit ── */}
      {tab === 'policies' && cfgForm && (
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-bold text-slate-800 mb-3">Carry-Forward Policy</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={!!cfgForm.carryForwardEnabled} disabled={!canEdit} onChange={e => setCfgForm({ ...cfgForm, carryForwardEnabled: e.target.checked })} />
                  Allow carry-forward of unused leave
                </label>
                <Input label="Max carry-forward (days)" type="number" value={cfgForm.maxCarryForward ?? 5} onChange={e => setCfgForm({ ...cfgForm, maxCarryForward: e.target.value })} disabled={!canEdit} />
              </div>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2 mt-4">
                <Button size="sm" loading={busy} onClick={() => saveConfig()}>Save Policy</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => api.leaveAdmin.carryForward({ year: 2026 }).then((r: any) => flash('ok', `Carried forward for ${r?.processed ?? 0} employees.`)).catch((e: any) => flash('err', e?.message || 'Carry-forward failed.'))}>Run Carry-Forward → 2027</Button>
              </div>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-bold text-slate-800 mb-3">Audit Log</h3>
            <div className="overflow-x-auto max-h-[420px]">
              <Table>
                <Thead><Tr><Th>When</Th><Th>Action</Th><Th>By</Th><Th>Details</Th></Tr></Thead>
                <Tbody>
                  {auditLog.length === 0 && <Tr><Td colSpan={4}><span className="text-slate-400 text-xs">No audit entries yet.</span></Td></Tr>}
                  {auditLog.map(a => (
                    <Tr key={a.id}>
                      <Td><span className="text-[11px] text-slate-500">{new Date(a.createdAt).toLocaleString('en-IN')}</span></Td>
                      <Td><Badge variant="indigo">{String(a.action).replace(/_/g, ' ')}</Badge></Td>
                      <Td>{a.user} <span className="text-[10px] text-slate-400">({a.role})</span></Td>
                      <Td><span className="text-[11px] text-slate-500">{typeof a.details === 'object' ? Object.entries(a.details).map(([k, v]) => `${k}: ${v}`).join(', ') : a.details}</span></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      {/* ─── Action Modal ─── */}
      <Modal open={!!action} onClose={closeAction}
        title={action ? `${action.kind === 'grant' ? 'Add Leave Credit' : action.kind === 'deduct' ? 'Deduct Leave Credit' : action.kind === 'reset' ? 'Reset Yearly Balance' : action.kind === 'transfer' ? 'Transfer Leave' : 'Edit Balances'}${action.row.employeeName ? ` — ${action.row.employeeName}` : ''}` : ''}
        footer={action && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeAction}>Cancel</Button>
            <Button loading={busy} onClick={submitAction}>{action.kind === 'reset' ? 'Reset' : 'Save'}</Button>
          </div>
        )}>
        {action && (
          <div className="space-y-3">
            {action.kind === 'reset' ? (
              <>
                <p className="text-xs text-slate-600">This zeroes CL/PL/SL balances and used counters for 2026.</p>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={!!form.keepCarryForward} onChange={e => setForm({ ...form, keepCarryForward: e.target.checked })} />
                  Re-seed balances from carry-forward
                </label>
              </>
            ) : action.kind === 'edit' ? (
              <div className="grid grid-cols-3 gap-3">
                <Input label="CL" type="number" value={form.clBalance} onChange={e => setForm({ ...form, clBalance: e.target.value })} />
                <Input label="PL" type="number" value={form.plBalance} onChange={e => setForm({ ...form, plBalance: e.target.value })} />
                <Input label="SL" type="number" value={form.slBalance} onChange={e => setForm({ ...form, slBalance: e.target.value })} />
              </div>
            ) : (
              <>
                {/* Standalone Add/Deduct from the toolbar — pick the employee here. */}
                {(action.kind === 'grant' || action.kind === 'deduct') && !action.row.employeeId && (
                  <Select label="Employee" value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}
                    options={[{ value: '', label: 'Select employee…' }, ...adminRows.map(r => ({ value: String(r.employeeId), label: `${r.employeeName} (${r.employeeCode})` }))]} />
                )}
                <Select label="Leave Type" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={CATS} />
                <Input label="Days" type="number" step="0.5" min="0.5" value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} />
                {action.kind === 'transfer' && (
                  <Select label="Transfer to" value={form.toEmployeeId} onChange={e => setForm({ ...form, toEmployeeId: e.target.value })}
                    options={[{ value: '', label: 'Select employee…' }, ...scopedEmployees.filter(e => String(e.id) !== String(action.row.employeeId)).map(e => ({ value: String(e.id), label: `${e.name} (${e.employeeId})` }))]} />
                )}
                {(action.kind === 'grant' || action.kind === 'deduct') && (
                  <Input label="Effective Date" type="date" value={form.effectiveDate || ''} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} />
                )}
                <Textarea label="Reason / Note" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows={2} />
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LeaveManagement;
