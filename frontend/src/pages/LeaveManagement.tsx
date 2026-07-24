import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Users, Wallet, CalendarPlus, CalendarMinus, RotateCcw, ArrowLeftRight,
  History as HistoryIcon, BarChart3, ShieldCheck, FileText, RefreshCw, ChevronDown,
  LayoutDashboard, Clock, CheckCircle2, ArrowRight, Pencil
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
import { RowActionMenu, type RowActionTone } from '@/components/ui/RowActions';
import { PaginationBar } from '@/components/ui/Paginated';
import { Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { type ExportColumn } from '@/utils/exportUtils';
import { formatDate } from '@/utils/formatDate';
import { type UserAccount } from '@/pages/Login';
import { usePermissions } from '@/context/PermissionContext';
import { api } from '@/api/apiClient';
import { getUniqueEmployees } from '@/utils/deduplication';
import { isActiveEmployee } from '@/utils/employeeStatus';
import { Leaves } from '@/pages/Leaves';
import { useDismissable } from '@/hooks/useDismissable';
import { useLeavePolicy } from '@/hooks/useLeavePolicy';
import { buildLeaveWallet, walletTotalRemaining, walletTotalUsed, hasConfiguredPolicy, walletPalette } from '@/utils/leaveWallet';

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

/* ────────────────────────────────────────────────────────────────────────────
 * RowActionsMenu — enterprise overflow-menu for the Leave Administration table.
 * Collapses the old 5-button row into a primary "Edit" (desktop) + a three-dot
 * "More" menu holding every action (SAP / Workday / Zoho-style). Purely a
 * presentation change: it just calls onAction(kind, row) — the SAME handler the
 * old inline buttons used, so no calculation / balance / API / permission logic
 * changes. Rendered via a portal so the table's overflow-x wrapper can't clip it.
 * ──────────────────────────────────────────────────────────────────────────── */
type RowActionKind = 'grant' | 'deduct' | 'reset' | 'transfer' | 'edit';
// Icons are passed as COMPONENTS and tones as semantic names, which is the
// shared menu's contract — it owns the icon size and the colour mapping so every
// table's menu looks identical. Edit is now a plain menu item at every width:
// with no inline button beside the menu there is nothing for it to duplicate.
const ROW_MENU_ITEMS: Array<{ kind: RowActionKind; label: string; icon: LucideIcon; tone: RowActionTone }> = [
  { kind: 'edit',     label: 'Edit Leave',          icon: Pencil,         tone: 'edit' },
  { kind: 'grant',    label: 'Credit Leave',        icon: CalendarPlus,   tone: 'success' },
  { kind: 'deduct',   label: 'Debit Leave',         icon: CalendarMinus,  tone: 'danger' },
  { kind: 'transfer', label: 'Adjust Balance',      icon: ArrowLeftRight, tone: 'primary' },
  { kind: 'reset',    label: 'Reset Leave Balance', icon: RotateCcw,      tone: 'warning' },
];

const RowActionsMenu: React.FC<{
  row: any;
  canEdit: boolean;
  onAction: (kind: RowActionKind, row: any) => void;
}> = ({ row, canEdit, onAction }) => {
  if (!canEdit) return <span className="text-slate-300">—</span>;
  // Delegates to the SHARED menu (components/ui/RowActions). This file used to
  // carry its own portal/positioning/dismissal copy; that logic now lives in one
  // place, so the flip-up, viewport clamping and arrow-key navigation added
  // there apply here too. The action list and handler are unchanged.
  return (
    <RowActionMenu
      items={ROW_MENU_ITEMS.map(it => ({
        icon: it.icon,
        label: it.label,
        tone: it.tone,
        onClick: () => onAction(it.kind, row),
      }))}
    />
  );
};

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

  // Leave policy = single source of truth. Resolve a branch to its parent so both
  // share one policy, then read it live (auto-refreshes when Settings saves).
  const policyCompanyId = useMemo(() => {
    const c = companies.find((x: any) => String(x.id) === String(activeCompanyId));
    return String((c as any)?.parentCompanyId || activeCompanyId);
  }, [companies, activeCompanyId]);
  const { policy: leavePolicy } = useLeavePolicy(policyCompanyId);
  const hasLeavePolicy = useMemo(() => hasConfiguredPolicy(leavePolicy), [leavePolicy]);

  // Merge balance rows onto scoped employees so every employee appears. Each row
  // also carries a DYNAMIC wallet built from the policy (total) + that employee's
  // approved leave (used) — the CL/PL/SL columns below are the legacy backend
  // balance model (unchanged); the wallet cards render the full policy.
  const adminRows = useMemo(() => {
    const balByEmp = new Map<string, any>();
    balances.forEach(b => balByEmp.set(String(b.employeeId), b));
    const todayStr = new Date().toISOString().slice(0, 10);
    return scopedEmployees.map(e => {
      const b = balByEmp.get(String(e.id)) || {};
      const cl = num(b.clBalance), pl = num(b.plBalance), sl = num(b.slBalance);
      const taken = num(b.clUsed) + num(b.plUsed) + num(b.slUsed);
      const mine = (l: any) =>
        String(l.employeeId) === String(e.id) || (l.employeeName || '').toLowerCase() === (e.name || '').toLowerCase();
      const approved = leaves.filter(l => mine(l) && l.status === 'Approved');
      const wallet = buildLeaveWallet(leavePolicy, approved);
      // Dynamic summary — scales to whatever leave types the policy contains.
      // Allocation & Used exclude LOP (loss of pay is not an entitlement).
      const totalAllocation = wallet.filter(w => w.key !== 'lop').reduce((s, w) => s + (Number(w.total) || 0), 0);
      const walletRemaining = walletTotalRemaining(wallet);
      const walletUsed = walletTotalUsed(wallet);
      const pendingCount = leaves.filter(l => mine(l) && l.status === 'Pending').length;
      // Current status from already-loaded approved leave covering today. Weekly
      // Off / Holiday need a calendar source not loaded here, so we surface the
      // states we can derive truthfully: On Leave / Half Day / Present.
      const onLeave = approved.find(l => {
        const f = String(l.fromDate || '').slice(0, 10), t = String(l.toDate || '').slice(0, 10);
        return f && t && f <= todayStr && todayStr <= t;
      });
      const currentStatus = onLeave ? (Number(onLeave.days) > 0 && Number(onLeave.days) < 1 ? 'Half Day' : 'On Leave') : 'Present';
      return {
        employeeId: e.id,
        employeeCode: e.employeeId || '—',
        employeeName: e.name,
        branch: (e as any).branchLocation || 'Head Office',
        department: e.department || '—',
        cl, pl, sl,
        remaining: num(cl + pl + sl),
        taken: num(taken),
        wallet,
        totalAllocation: num(totalAllocation),
        walletUsed: num(walletUsed),
        walletRemaining,
        pendingCount,
        currentStatus,
      };
    });
  }, [scopedEmployees, balances, leaves, leavePolicy]);

  /* ─── Leave Administration: SERVER-SIDE paginated roster ───────────────────
   * The table used to render `adminRows` — every employee in the workspace,
   * assembled in the browser from the full employee, balance and leave sets. At
   * 826 employees that is ~826 wallet builds and an O(employees × leaves) scan on
   * every render. This fetches ONE PAGE from the database instead.
   *
   * `adminRows` deliberately survives for the Dashboard aggregates, the Leave
   * Balances tab and Export, which are whole-company figures — pointing those at
   * a 10-row page would silently turn company totals into page totals.
   *
   * Entitlement (Total Allocation / Used / Remaining) is still computed HERE,
   * because the leave policy lives in localStorage and the server cannot read it
   * (see leaveAdministrationController). Only the 10 rows on screen are built.
   * ──────────────────────────────────────────────────────────────────────── */
  const ROSTER_PAGE_SIZES = [10, 25, 50, 100];
  // Filters + page survive an edit/navigate round trip. sessionStorage holds a
  // few scalars only — never records (see the no-large-datasets rule).
  interface RosterView {
    page: number; limit: number; search: string;
    branch: string; department: string; status: string; leaveType: string;
  }
  const rosterStateKey = `hrms_leaveadmin_view_${activeCompanyId}`;
  const [rosterView, setRosterView] = useState<RosterView>(() => {
    const fallback: RosterView = { page: 1, limit: 10, search: '', branch: '', department: '', status: '', leaveType: '' };
    try {
      const raw = sessionStorage.getItem(`hrms_leaveadmin_view_${activeCompanyId}`);
      return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch { return fallback; }
  });
  const [roster, setRoster] = useState<{ data: any[]; total: number; totalPages: number } | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterOptions, setRosterOptions] = useState<{ departments: string[]; branches: string[]; leaveTypes: string[] }>(
    { departments: [], branches: [], leaveTypes: [] });
  // Debounced copy of the search box, so typing costs one request, not one per key.
  const [searchInput, setSearchInput] = useState(rosterView.search);

  useEffect(() => {
    try { sessionStorage.setItem(rosterStateKey, JSON.stringify(rosterView)); } catch { /* quota */ }
  }, [rosterStateKey, rosterView]);

  // Switching workspace must NOT carry the previous company's filters — a branch
  // or department from company A does not exist in company B, so the table would
  // come back empty and look broken. Load that workspace's own saved view, or a
  // clean one. The ref keeps this to an actual change, not every render.
  const lastCompanyRef = useRef(activeCompanyId);
  useEffect(() => {
    if (String(lastCompanyRef.current) === String(activeCompanyId)) return;
    lastCompanyRef.current = activeCompanyId;
    const fresh: RosterView = { page: 1, limit: 10, search: '', branch: '', department: '', status: '', leaveType: '' };
    let next = fresh;
    try {
      const raw = sessionStorage.getItem(`hrms_leaveadmin_view_${activeCompanyId}`);
      if (raw) next = { ...fresh, ...JSON.parse(raw) };
    } catch { /* fall back to fresh */ }
    setRosterView(next);
    setSearchInput(next.search);
  }, [activeCompanyId]);

  const [balancesSearch, setBalancesSearch] = useState('');
  const [balancesPage, setBalancesPage] = useState(1);
  const [balancesPageSize, setBalancesPageSize] = useState(12);

  // Client-side pagination for the Reports tab
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsPageSize, setReportsPageSize] = useState(10);
  
  const reportsTotal = adminRows.length;
  const reportsTotalPages = Math.max(1, Math.ceil(reportsTotal / reportsPageSize));

  // Reset reports page on workspace change
  useEffect(() => { setReportsPage(1); }, [activeCompanyId, reportsPageSize]);

  const currentReportsPage = Math.min(reportsPage, reportsTotalPages);
  const reportsStartIndex = (currentReportsPage - 1) * reportsPageSize;
  const paginatedReports = adminRows.slice(reportsStartIndex, reportsStartIndex + reportsPageSize);

  // Client-side pagination for Audit Log
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);
  const auditTotal = auditLog.length;
  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / auditPageSize));
  
  useEffect(() => { setAuditPage(1); }, [auditPageSize]);

  const currentAuditPage = Math.min(auditPage, auditTotalPages);
  const auditStartIndex = (currentAuditPage - 1) * auditPageSize;
  const paginatedAuditLog = auditLog.slice(auditStartIndex, auditStartIndex + auditPageSize);

  const filteredBalances = useMemo(() => {
    let list = adminRows;
    if (balancesSearch.trim()) {
      const q = balancesSearch.toLowerCase();
      list = list.filter(r =>
        (r.employeeName || '').toLowerCase().includes(q) ||
        (r.employeeCode || '').toLowerCase().includes(q) ||
        (r.department || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [adminRows, balancesSearch]);

  const balancesTotal = filteredBalances.length;
  const balancesTotalPages = Math.max(1, Math.ceil(balancesTotal / balancesPageSize));

  // Reset to page 1 on filter or workspace change
  useEffect(() => { setBalancesPage(1); }, [balancesSearch, balancesPageSize, activeCompanyId]);

  const currentBalancesPage = Math.min(balancesPage, balancesTotalPages);
  const balancesStartIndex = (currentBalancesPage - 1) * balancesPageSize;
  const paginatedBalances = filteredBalances.slice(balancesStartIndex, balancesStartIndex + balancesPageSize);

  useEffect(() => {
    const t = setTimeout(() => setRosterView(v => (v.search === searchInput ? v : { ...v, search: searchInput, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const patchRoster = useCallback((patch: Partial<RosterView>) => setRosterView(v => ({ ...v, ...patch })), []);

  const loadRoster = useCallback(async () => {
    if (!activeCompanyId) return;
    setRosterLoading(true);
    setRosterError(null);
    try {
      const res: any = await api.leaveAdmin.roster({ companyId: activeCompanyId, ...rosterView });
      setRoster({ data: res?.data || [], total: res?.total || 0, totalPages: res?.totalPages || 1 });
    } catch (e: any) {
      // A failed page must say so — an empty table would read as "no employees".
      setRosterError(e?.data?.error || e?.message || 'Could not load the roster.');
      setRoster(null);
    } finally {
      setRosterLoading(false);
    }
  }, [activeCompanyId, rosterView]);

  useEffect(() => { if (tab === 'administration') loadRoster(); }, [tab, loadRoster]);
  useEffect(() => {
    if (!activeCompanyId) return;
    api.leaveAdmin.filterOptions(activeCompanyId)
      .then((o: any) => setRosterOptions({ departments: o?.departments || [], branches: o?.branches || [], leaveTypes: o?.leaveTypes || [] }))
      .catch(() => {});
  }, [activeCompanyId]);

  /** The page's rows, with the entitlement wallet built from the local policy. */
  const rosterRows = useMemo(() => (roster?.data || []).map((r: any) => {
    // Inject the employee's DB balances into the policy before calculating.
    // This allows manual grants, deducts, and accruals to actually display in the UI.
    const customPolicy = {
      ...leavePolicy,
      cl: r.cl,
      pl: r.pl,
      sl: r.sl,
    };
    const wallet = buildLeaveWallet(customPolicy as any, r.approvedLeaves || []);
    const totalAllocation = wallet.filter(w => w.key !== 'lop').reduce((s, w) => s + (Number(w.total) || 0), 0);
    return {
      ...r,
      wallet,
      totalAllocation: num(totalAllocation),
      walletUsed: num(walletTotalUsed(wallet)),
      walletRemaining: walletTotalRemaining(wallet),
      remaining: num(r.cl + r.pl + r.sl),
    };
  }), [roster, leavePolicy]);

  /* ─── action modal state ─────────────────────────────────────────────── */
  type ActionKind = 'grant' | 'deduct' | 'reset' | 'transfer' | 'edit';
  const [action, setAction] = useState<{ kind: ActionKind; row: any } | null>(null);
  // Read-only per-employee Leave Wallet breakdown (opened from the table — keeps
  // the individual leave types OUT of the main table).
  const [walletDetail, setWalletDetail] = useState<any | null>(null);
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
    const eid = action.row.id || action.row.employeeId || form.employeeId;
    const empName = action.row.employeeName
      || adminRows.find(r => String(r.id) === String(eid))?.employeeName
      || 'employee';
    setBusy(true);
    try {
      if (action.kind === 'grant') {
        if (!action.row.employeeId) {
          // Global grant
          const res: any = await api.leaveAdmin.grantBulk({ 
            category: form.category, 
            days: Number(form.days), 
            reason: form.reason, 
            effectiveDate: form.effectiveDate,
            allowDuplicate: form.allowDuplicate,
            companyId: activeCompanyId,
            ...rosterView
          });
          flash('ok', `Added ${form.days} ${form.category} credit to ${res.processed} employees.`);
        } else {
          if (!eid) { flash('err', 'Select an employee.'); setBusy(false); return; }
          await api.leaveAdmin.grant({ employeeId: eid, category: form.category, days: Number(form.days), reason: form.reason, effectiveDate: form.effectiveDate });
          flash('ok', `Added ${form.days} ${form.category} credit to ${empName}.`);
        }
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
      // Refresh BOTH sources: `balances` feeds the dashboard/wallets, `roster` is
      // the paginated table the user is looking at. Reloading the current page
      // (rather than resetting to page 1) is what keeps their place after an edit.
      await Promise.all([loadBalances(), loadRoster()]);
      closeAction();
    } catch (e: any) {
      if (e?.data?.isDuplicate) {
        setForm(f => ({ ...f, showDuplicateOverride: true, duplicateMessage: e.data.error }));
      } else {
        flash('err', e?.message || e?.data?.error || 'Action failed.');
      }
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
    { header: 'Total Allocation', key: 'totalAllocation', width: 16 },
    { header: 'Leave Used', key: 'walletUsed', width: 12 },
    { header: 'Leave Remaining', key: 'walletRemaining', width: 16 },
    { header: 'Pending Requests', key: 'pendingCount', width: 16 },
    { header: 'Current Status', key: 'currentStatus', width: 14 },
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


  return (
    <div className="space-y-4">
      {/* Header + tabs */}
      <div className="bg-white rounded-[14px] border border-[#E6E0FE] shadow-sm">
        <div className="px-5 py-4 flex items-center justify-between border-b border-[#E6E0FE]">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Leave Management</h2>
            <p className="text-xs text-slate-500">Dashboard · Requests · Administration · Balances · History · Reports · Policies</p>
          </div>
          <Badge variant="indigo">{scopedEmployees.length} employees in workspace</Badge>
        </div>
        <div className="flex flex-wrap gap-1 px-3 py-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 seg-tab text-xs ${tab === t.id ? 'seg-tab-active' : ''}`}>
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
          { label: 'Total Requests', value: dash.total, icon: <FileText size={16} />, color: 'bg-brand-500' },
          { label: 'Pending Approvals', value: dash.pending.length, icon: <Clock size={16} />, color: 'bg-amber-500' },
          { label: 'Approved', value: dash.approved, icon: <CheckCircle2 size={16} />, color: 'bg-emerald-500' },
          { label: 'Employees', value: scopedEmployees.length, icon: <Users size={16} />, color: 'bg-brand-500' },
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {tiles.map(t => (
                <div key={t.label} className="bg-white rounded-[14px] border border-[#E6E0FE] shadow-sm p-3.5 flex items-center gap-3">
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
                  <button onClick={() => setTab('requests')} className="text-[11px] font-bold text-brand-600 hover:underline flex items-center gap-1">Review all <ArrowRight size={12} /></button>
                </div>
                {dash.pendingList.length === 0
                  ? <div className="py-8 text-center"><CheckCircle2 size={22} className="mx-auto text-emerald-500 mb-1" /><p className="text-xs font-semibold text-slate-500">No pending leave requests.</p></div>
                  : <div>{dash.pendingList.map(l => <LeaveRow key={l.id} l={l} />)}</div>}
              </Card>

              {/* Recent Requests */}
              <Card>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><HistoryIcon size={15} className="text-slate-500" /> Recent Requests</h3>
                  <button onClick={() => setTab('requests')} className="text-[11px] font-bold text-brand-600 hover:underline flex items-center gap-1">View all <ArrowRight size={12} /></button>
                </div>
                {dash.recent.length === 0
                  ? <div className="py-8 text-center text-xs text-slate-400">No leave requests yet.</div>
                  : <div>{dash.recent.map(l => <LeaveRow key={l.id} l={l} />)}</div>}
              </Card>
            </div>

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
        <Card className="!overflow-visible">
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
          {/* ── Filters. Every one is applied in the DATABASE, so they compose
                 with pagination: narrowing the list resets to page 1 and the
                 total reflects the filter. ── */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex items-center gap-2 px-2 h-8 border border-slate-200 rounded-lg bg-white">
              <Search size={12} className="text-slate-400" />
              <input
                type="text"
                placeholder="Search employee, code, department…"
                className="w-60 text-xs bg-transparent focus:outline-none"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                aria-label="Search employees"
              />
            </div>
            <select value={rosterView.branch} onChange={e => patchRoster({ branch: e.target.value, page: 1 })}
              aria-label="Filter by branch"
              className="h-8 text-xs font-medium border border-slate-200 rounded-lg px-2 bg-white text-slate-700">
              <option value="">All branches</option>
              {rosterOptions.branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={rosterView.department} onChange={e => patchRoster({ department: e.target.value, page: 1 })}
              aria-label="Filter by department"
              className="h-8 text-xs font-medium border border-slate-200 rounded-lg px-2 bg-white text-slate-700">
              <option value="">All departments</option>
              {rosterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={rosterView.status} onChange={e => patchRoster({ status: e.target.value, page: 1 })}
              aria-label="Filter by status"
              className="h-8 text-xs font-medium border border-slate-200 rounded-lg px-2 bg-white text-slate-700">
              <option value="">All statuses</option>
              <option value="Present">Present</option>
              <option value="On Leave">On Leave</option>
            </select>
            {rosterOptions.leaveTypes.length > 0 && (
              <select value={rosterView.leaveType} onChange={e => patchRoster({ leaveType: e.target.value, page: 1 })}
                aria-label="Filter by leave type"
                className="h-8 text-xs font-medium border border-slate-200 rounded-lg px-2 bg-white text-slate-700">
                <option value="">All leave types</option>
                {rosterOptions.leaveTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {(rosterView.search || rosterView.branch || rosterView.department || rosterView.status || rosterView.leaveType) && (
              <button
                onClick={() => { setSearchInput(''); setRosterView(v => ({ ...v, search: '', branch: '', department: '', status: '', leaveType: '', page: 1 })); }}
                className="h-8 px-2.5 text-[11px] font-bold text-slate-500 hover:text-brand-600 rounded-lg border border-slate-200 bg-white"
              >Clear filters</button>
            )}
            {rosterLoading && <span className="text-[11px] font-semibold text-slate-400">Loading…</span>}
          </div>

          {rosterError && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-700 flex items-center justify-between gap-3">
              <span>{rosterError}</span>
              <button onClick={loadRoster} className="underline hover:text-rose-900">Retry</button>
            </div>
          )}

          {/* `dense` trims cell padding from 16px to 10px a side — 9 columns × 12px
              of reclaimed width, which is most of what stopped the Employee column
              fitting. The Table component owns its own overflow, so the extra
              wrapper that used to sit here (a second nested scroll container) is
              gone. */}
          <Table dense>
              <Thead>
                <Tr>
                  {/* Employee carries the code beneath the name — that removed a
                      whole column, and it is the identity users scan for, so it
                      gets the widest allocation and never truncates. */}
                  <Th className="min-w-[220px] sticky left-0 z-20 bg-surface-muted pl-4 md:pl-6 shadow-[1px_0_0_0_#e2e8f0]">Employee</Th>
                  <Th className="min-w-[150px]">Branch</Th>
                  <Th className="min-w-[120px]">Department</Th>
                  <Th className="text-center">Total Allocation</Th>
                  <Th className="text-center">Leave Used</Th>
                  <Th className="text-center">Leave Remaining</Th>
                  <Th className="text-center">Pending</Th>
                  <Th className="text-center">Status</Th>
                  <Th className="w-[80px] text-right sticky right-0 z-20 bg-surface-muted pr-4 md:pr-6 shadow-[-1px_0_0_0_#e2e8f0]">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {!roster && !rosterError && (
                  <Tr><Td colSpan={9}><span className="text-slate-400 text-xs">Loading employees…</span></Td></Tr>
                )}
                {roster && rosterRows.length === 0 && (
                  <Tr><Td colSpan={9}><span className="text-slate-400 text-xs">
                    {rosterView.search || rosterView.branch || rosterView.department || rosterView.status || rosterView.leaveType
                      ? 'No employees match these filters.'
                      : 'No employees in this workspace.'}
                  </span></Td></Tr>
                )}
                {rosterRows.map(r => {
                  // Remaining entitlement health: green >50%, yellow 20–50%, red <20%.
                  const pct = r.totalAllocation > 0 ? (r.walletRemaining / r.totalAllocation) * 100 : 0;
                  const remTone = pct >= 50 ? 'text-emerald-600' : pct >= 20 ? 'text-amber-600' : 'text-rose-600';
                  const statusTone: Record<string, string> = {
                    Present: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    'On Leave': 'bg-amber-50 text-amber-700 border-amber-200',
                    'Half Day': 'bg-sky-50 text-sky-700 border-sky-200',
                    'Weekly Off': 'bg-slate-100 text-slate-500 border-slate-200',
                    Holiday: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                  };
                  return (
                    <Tr key={r.employeeId}>
                      <Td className="sticky left-0 z-10 bg-white pl-4 md:pl-6 shadow-[1px_0_0_0_#e2e8f0]">
                        {/* Name + code in one cell. Clicking the name opens the
                            full per-type Leave Wallet breakdown (kept out of the
                            main table). */}
                        <button onClick={() => setWalletDetail(r)}
                          className="text-left group">
                          <span className="block font-semibold text-slate-800 group-hover:text-brand-600 group-hover:underline">{r.employeeName}</span>
                          <span className="block font-mono text-[10px] text-brand-700">{r.employeeCode}</span>
                        </button>
                      </Td>
                      <Td>{r.branch}</Td><Td>{r.department}</Td>
                      {/* "days" is stated once in the header, not repeated in every
                          cell — that repetition cost ~35px per numeric column. */}
                      <Td className="text-center"><span className="font-semibold text-slate-700">{r.totalAllocation}</span></Td>
                      <Td className="text-center"><span className="font-semibold text-rose-600">{r.walletUsed}</span></Td>
                      <Td className="text-center"><span className={`font-bold ${remTone}`}>{r.walletRemaining}</span></Td>
                      <Td className="text-center">
                        {r.pendingCount > 0
                          ? <Badge variant="amber">{r.pendingCount}</Badge>
                          : <span className="text-slate-300">—</span>}
                      </Td>
                      <Td className="text-center">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone[r.currentStatus] || statusTone.Present}`}>{r.currentStatus}</span>
                      </Td>
                      <Td className="text-right sticky right-0 z-10 bg-white pr-4 md:pr-6 shadow-[-1px_0_0_0_#e2e8f0]">
                        <RowActionsMenu row={r} canEdit={canEdit} onAction={openAction} />
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>

            {/* Server-side pagination. The SHARED PaginationBar — the same control
                the rest of the HRMS uses — driven by the server's page/total
                rather than by slicing a local array. */}
            {roster && (
              <PaginationBar
                page={rosterView.page}
                totalPages={roster.totalPages}
                total={roster.total}
                pageSize={rosterView.limit}
                label="employees"
                onChange={(p) => patchRoster({ page: p })}
                onPageSizeChange={(size) => patchRoster({ limit: size, page: 1 })}
                pageSizeOptions={ROSTER_PAGE_SIZES}
              />
            )}
        </Card>
      )}

      {/* ── Balances (wallet) ── */}
      {tab === 'balances' && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold text-slate-800">Employee Leave Wallets</h3>
            <div className="flex items-center gap-3">
              <div className="w-64"><Input icon={<Search size={14} />} placeholder="Search wallets..." value={balancesSearch} onChange={e => setBalancesSearch(e.target.value)} /></div>
              <Button size="sm" variant="outline" icon={<RefreshCw size={13} />} onClick={loadBalances}>Refresh</Button>
            </div>
          </div>
          {/* Employee Leave Wallets — rendered 100% dynamically from the company
              Leave Policy: ONE card per configured leave type, in Settings order,
              showing Remaining / Total. Add / rename / remove a type in Settings
              and every wallet reflects it live. No hardcoded CL / PL / SL. */}
          {!hasLeavePolicy ? (
            <p className="text-sm font-semibold text-slate-500 py-6 text-center">No leave policy configured.</p>
          ) : filteredBalances.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                <Search size={24} className="text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-1">No employees found.</p>
              <p className="text-xs text-slate-500 mb-4">Try adjusting your search or filters.</p>
              <Button size="sm" variant="outline" onClick={() => setBalancesSearch('')}>Reset Filters</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {paginatedBalances.map(r => (
                  <div key={r.employeeId} className="rounded-xl border border-slate-200 p-3.5 bg-gradient-to-br from-white to-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                      <p className="font-bold text-slate-800 text-sm">{r.employeeName}</p>
                      <p className="text-[10px] font-mono text-slate-400">{r.employeeCode} · {r.branch} · {r.department}</p>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600 whitespace-nowrap">{r.walletRemaining} left</span>
                  </div>
                  {/* Compact, equal-size badge grid: 2 / 3 / 4 boxes per row on
                      mobile / tablet / desktop. Uniform padding, radius & font so
                      every box is identical regardless of how many leave types
                      the policy contains. */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                    {r.wallet.map((w, i) => {
                      const c = walletPalette(w.key, i);
                      return (
                        <div key={w.key} className={`rounded-md border px-1.5 py-1 text-center ${c.bg}`}>
                          <p className={`text-[9px] font-semibold leading-tight truncate ${c.label}`} title={w.label}>{w.label}</p>
                          <p className={`text-[11px] font-bold leading-tight mt-0.5 ${c.value}`}>{w.key === 'lop' ? `${w.used}` : `${w.remaining} / ${w.total}`}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
              
              {balancesTotal > 0 && (
                <PaginationBar
                  page={currentBalancesPage}
                  totalPages={balancesTotalPages}
                  total={balancesTotal}
                  pageSize={balancesPageSize}
                  label="employees"
                  onChange={setBalancesPage}
                  onPageSizeChange={setBalancesPageSize}
                  pageSizeOptions={[10, 12, 24, 48, 100]}
                />
              )}
            </div>
          )}
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
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Pending Requests" value={reportStats.pending} icon={<HistoryIcon size={16} />} color="bg-amber-500" />
            <StatCard label="Approved Days" value={reportStats.approvedDays} icon={<CalendarPlus size={16} />} color="bg-brand-500" />
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
                  {paginatedReports.map(r => (
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
            
            {reportsTotal > 0 && (
              <PaginationBar
                page={currentReportsPage}
                totalPages={reportsTotalPages}
                total={reportsTotal}
                pageSize={reportsPageSize}
                label="employees"
                onChange={setReportsPage}
                onPageSizeChange={setReportsPageSize}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            )}
          </Card>
        </div>
      )}

      {/* ── Policies & Audit ── */}
      {tab === 'policies' && cfgForm && (
        <div className="space-y-4">


          <Card>
            <h3 className="text-sm font-bold text-slate-800 mb-3">Audit Log</h3>
            <div className="overflow-x-auto">
              <Table>
                <Thead><Tr><Th>When</Th><Th>Action</Th><Th>By</Th><Th>Details</Th></Tr></Thead>
                <Tbody>
                  {auditLog.length === 0 ? (
                    <Tr>
                      <Td colSpan={4}>
                        <div className="py-12 text-center flex flex-col items-center">
                          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                            <ShieldCheck size={24} className="text-slate-300" />
                          </div>
                          <p className="text-sm font-semibold text-slate-700 mb-1">No audit records found.</p>
                          <p className="text-xs text-slate-500">Action history will appear here once leave activities are performed.</p>
                        </div>
                      </Td>
                    </Tr>
                  ) : (
                    paginatedAuditLog.map(a => (
                      <Tr key={a.id}>
                        <Td><span className="text-[11px] text-slate-500">{new Date(a.createdAt).toLocaleString('en-IN')}</span></Td>
                        <Td><Badge variant="indigo">{String(a.action).replace(/_/g, ' ')}</Badge></Td>
                        <Td>{a.user} <span className="text-[10px] text-slate-400">({a.role})</span></Td>
                        <Td><span className="text-[11px] text-slate-500">{typeof a.details === 'object' ? Object.entries(a.details).map(([k, v]) => `${k}: ${v}`).join(', ') : a.details}</span></Td>
                      </Tr>
                    ))
                  )}
                </Tbody>
              </Table>
            </div>
            
            {auditTotal > 0 && (
              <PaginationBar
                page={currentAuditPage}
                totalPages={auditTotalPages}
                total={auditTotal}
                pageSize={auditPageSize}
                label="audit records"
                onChange={setAuditPage}
                onPageSizeChange={setAuditPageSize}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            )}
          </Card>
        </div>
      )}

      {/* ─── Leave Wallet detail (per-type breakdown, read-only) ─── */}
      <Modal open={!!walletDetail} onClose={() => setWalletDetail(null)}
        title={walletDetail ? `Leave Wallet — ${walletDetail.employeeName}` : 'Leave Wallet'}
        footer={<Button variant="outline" onClick={() => setWalletDetail(null)}>Close</Button>}>
        {walletDetail && (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-150 pb-2 text-xs">
              <span className="font-semibold text-slate-500">{walletDetail.employeeCode} · {walletDetail.branch} · {walletDetail.department}</span>
              <span className="font-bold text-emerald-600">{walletDetail.walletRemaining} of {walletDetail.totalAllocation} days left</span>
            </div>
            {/* One colored badge per configured leave type — fully dynamic. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {walletDetail.wallet.map((w: any, i: number) => {
                const c = walletPalette(w.key, i);
                return (
                  <div key={w.key} className={`rounded-lg border px-2.5 py-2 text-center ${c.bg}`}>
                    <p className={`text-[10px] font-semibold truncate ${c.label}`} title={w.label}>{w.label}</p>
                    <p className={`text-sm font-bold mt-0.5 ${c.value}`}>{w.key === 'lop' ? `${w.used}` : `${w.remaining} / ${w.total}`}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400">Balances come live from the company Leave Policy. Allocation &amp; Remaining exclude LOP.</p>
          </div>
        )}
      </Modal>

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
                {/* Standalone Deduct from the toolbar — pick the employee here. */}
                {action.kind === 'deduct' && !action.row.employeeId && (
                  <Select label="Employee" value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}
                    options={[{ value: '', label: 'Select employee…' }, ...adminRows.map(r => ({ value: String(r.employeeId), label: `${r.employeeName} (${r.employeeCode})` }))]} />
                )}
                {/* Standalone Grant from the toolbar — applies globally to filtered employees. */}
                {action.kind === 'grant' && !action.row.employeeId && (
                  <>
                    <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-xs mb-2 border border-blue-100 shadow-sm">
                      This leave credit will be applied to all eligible employees based on the selected company, branch, and policy.<br/><br/>
                      <strong>This action will credit {form.days || 1} days of {form.category || 'Leave'} to {roster?.total || 0} employees.</strong>
                    </div>
                    {form.showDuplicateOverride && (
                      <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-xs mb-2 border border-amber-200">
                        <label className="flex items-center gap-2 font-semibold">
                          <input type="checkbox" checked={!!form.allowDuplicate} onChange={e => setForm({ ...form, allowDuplicate: e.target.checked })} />
                          {form.duplicateMessage || 'A similar credit was given today. Allow duplicate?'}
                        </label>
                      </div>
                    )}
                  </>
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
