import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Users, FileCheck2, CheckCircle2, Wallet, Clock, IndianRupee,
  Calculator, ShieldCheck, FileText, Banknote, Lock, Unlock,
  Eye, Download, Printer, Mail, RefreshCw, MoreVertical, Search, FileArchive, Send, FileSpreadsheet,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { byEmployeeCode } from '@/utils/employeeSort';
import { formatDate } from '@/utils/formatDate';

// ── Payment status (only Pending / Approved / Paid) ───────────────────────
// Enterprise payroll workflow: Draft → Pending Approval → Approved → Paid.
// Approval and payment are SEPARATE stages (approved ≠ paid), and payroll is
// never marked paid automatically — only the explicit "Mark Paid" action sets it.
const paymentBadge = (r: any): { label: string; variant: any } => {
  const pay = String(r.paymentStatus || '').toLowerCase();
  const pr = String(r.payrollStatus || r.status || '').toLowerCase();
  if (pay === 'paid' || pr === 'paid') return { label: 'Paid', variant: 'green' };
  if (pr === 'approved' || r.approvedAt) return { label: 'Approved', variant: 'blue' };
  if (pr === 'draft') return { label: 'Draft', variant: 'gray' };
  return { label: 'Pending Approval', variant: 'yellow' };
};

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const inrShort = (n: number) => {
  const v = Math.round(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN')}`;
};

interface Props {
  records: any[];
  company: any;
  getEmployee: (id: any) => any;
  monthLabel: string;
  role?: string;
  canEdit?: boolean;
  // selection-scoped bulk actions
  onApprove?: (ids: string[]) => void;
  onMarkPaid?: (ids: string[]) => void;
  onGenerateSelected?: (records: any[]) => void;
  onGenerateSlips?: (records: any[]) => void;
  onLock?: (ids: string[]) => void;
  onUnlock?: (ids: string[]) => void;
  /** Which lock action is in flight, so the button can show a spinner. */
  lockBusy?: 'lock' | 'unlock' | null;
  onRecalculate?: (ids?: string[]) => void;
  // ── Synchronize Attendance step (Step 1 — runs before Generate Payroll) ──
  /** ONE combined action: fetch attendance → recalculate → snapshot → LOP/OT →
   *  write to payroll → refresh. Replaces the old two-button (Recalculate + Sync)
   *  flow. Owned by Payroll (validate + progress + summary + audit + API). */
  onSynchronizeAttendance?: () => void;
  /** Last successful synchronization for the selected month — powers the "Last
   *  Synchronized" line and gates Generate Payroll (null = not yet synced). */
  attendanceRecalc?: { at: string; by: string; employees: number; records: number } | null;
  /** True while the synchronize operation is in flight (spinner on the button). */
  attendanceRecalcBusy?: boolean;
  /** Whether the current user may synchronize attendance (Employees cannot). */
  canRecalcAttendance?: boolean;
  // workflow step actions
  onGeneratePayroll: () => void;
  onApproveAll: () => void;
  onGenerateSlipsAll: () => void;
  onExportBank: () => void;
  onMarkPaidAll: () => void;
  onLockMonth: () => void;
  // per-employee slip actions
  onView: (r: any) => void;
  onOpenWorksheet?: (r: any) => void;
  onDownloadPdf: (r: any) => void;
  onPrint: (r: any) => void;
  onEmail: (r: any) => void;
  onRegenerate: (r: any) => void;
  // bulk
  onDownloadZip: (records: any[], zipName: string) => void;
  onEmailAll: (records: any[]) => void;
}

export const PayrollWorkbench: React.FC<Props> = ({
  records, company, getEmployee, monthLabel, role, canEdit = true,
  onGeneratePayroll, onApproveAll, onGenerateSlipsAll, onExportBank, onMarkPaidAll, onLockMonth,
  onView, onOpenWorksheet, onDownloadPdf, onPrint, onEmail, onRegenerate, onDownloadZip, onEmailAll,
  onApprove, onMarkPaid, onGenerateSelected, onGenerateSlips, onLock, onUnlock, onRecalculate, lockBusy = null,
  onSynchronizeAttendance, attendanceRecalc = null, attendanceRecalcBusy = false, canRecalcAttendance = false,
}) => {
  const [companyFilter, setCompanyFilter] = useState(() => sessionStorage.getItem('payroll_company') || '');
  const [branchFilter, setBranchFilter] = useState(() => sessionStorage.getItem('payroll_branch') || '');
  const [deptFilter, setDeptFilter] = useState(() => sessionStorage.getItem('payroll_dept') || '');
  const [search, setSearch] = useState(() => sessionStorage.getItem('payroll_search') || '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuWrap = useRef<HTMLDivElement>(null);

  // ── Role → permissions (Super Admin / Company Admin / Branch Admin-HR) ──
  const r = String(role || '').toLowerCase();
  const isSuper = r.includes('super');
  const isCompanyAdmin = !isSuper && (r.includes('company') || r.includes('admin'));
  const isBranchAdmin = !isSuper && !isCompanyAdmin; // HR / Branch
  const roleLabel = isSuper ? 'Super Admin' : isCompanyAdmin ? 'Company Admin' : 'Branch Admin / HR';
  const perms = {
    approve: canEdit && (isSuper || isCompanyAdmin),     // branch admin cannot approve
    lock: canEdit && (isSuper || isCompanyAdmin),
    unlock: canEdit && isSuper,
    generate: canEdit,
    generateSlips: canEdit,
    markPaid: canEdit,
    download: true,
    email: canEdit,
    recalc: canEdit && (isSuper || isCompanyAdmin || isBranchAdmin),
    filterCompany: isSuper,
    filterBranch: isSuper || isCompanyAdmin,
  };

  // Records whose attendance changed after generation → need regeneration.
  const outdatedRecords = useMemo(() => (records || []).filter((x: any) => x.isOutdated), [records]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuWrap.current && !menuWrap.current.contains(e.target as Node)) setOpenMenu(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const rows = useMemo(() => records.map(r => {
    const emp = getEmployee(r.employeeId);
    // Attendance figures are read STRAIGHT from the stored payroll row (written by
    // Attendance Synchronization → Push to Payroll Engine). Payroll never
    // recalculates them here — it only displays the finalized values.
    const workingDays = Number((r as any).workingDays) || 0;
    const monthly = Number(emp?.salary) || 0; // full monthly gross (source: employee)
    return {
      r,
      code: emp?.employeeId || '—',
      name: r.employeeName || emp?.name || '—',
      branch: emp?.branchLocation || r.employee?.branchLocation || 'Head Office',
      dept: r.department || emp?.department || '—',
      monthly,
      workingDays,
      present: Number((r as any).presentDays) || 0,
      payable: Number((r as any).payableDays) || 0,
      // Daily salary is a display derivation of stored values (monthly ÷ working),
      // matching the Attendance page — it does NOT re-derive payable/net salary.
      daily: workingDays > 0 ? monthly / workingDays : 0,
      gross: (r.basicSalary || 0) + (r.allowances || 0) + (r.bonus || 0),
      // Overtime & Bonus are broken out as their own columns (both are already
      // part of gross — overtime sits inside allowances, bonus is added on top).
      overtime: (r as any).overtime || 0,
      bonus: r.bonus || 0,
      deductions: (r.deductions || 0) + (r.tax || 0),
      net: r.netSalary || 0,
    };
  }).sort(byEmployeeCode(x => x.code)), [records, getEmployee]);

  const companies = useMemo(() => Array.from(new Set([company?.name].filter(Boolean))), [company]);
  const branches = useMemo(() => Array.from(new Set(rows.map(x => x.branch).filter(Boolean))).sort(), [rows]);
  const depts = useMemo(() => Array.from(new Set(rows.map(x => x.dept).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => rows.filter(x => {
    const q = search.toLowerCase();
    return (!companyFilter || company?.name === companyFilter)
      && (!branchFilter || x.branch === branchFilter)
      && (!deptFilter || x.dept === deptFilter)
      && (!q || x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q));
  }), [rows, companyFilter, branchFilter, deptFilter, search, company]);

  // Pagination over `filtered`, the client's own scoped set.
  //
  // This used to fetch each page from GET /payroll?page=… . That server query
  // scopes by companyId, while the client scopes with isRecordInWorkspace() —
  // and the two disagree: on a branch workspace the server returned 777 rows
  // where the client's `records` held 774. The table therefore showed rows that
  // were absent from `filtered`, so "select all" could never tick them.
  //
  // App already loads the whole payroll list into state and passes it as
  // `records`, so paginating it here costs no memory and drops a request per
  // page. One dataset now backs the rows, the totals and the selection.
  const [page, setPage] = useState(() => Number(sessionStorage.getItem('payroll_page')) || 1);
  const limit = 15;
  const totalRows = filtered.length;
  const isTableLoading = false;

  useEffect(() => {
    sessionStorage.setItem('payroll_company', companyFilter);
    sessionStorage.setItem('payroll_branch', branchFilter);
    sessionStorage.setItem('payroll_dept', deptFilter);
    sessionStorage.setItem('payroll_search', search);
    sessionStorage.setItem('payroll_page', String(page));
  }, [companyFilter, branchFilter, deptFilter, search, page]);

  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    setPage(1);
  }, [search, deptFilter, branchFilter, companyFilter]);

  // Clamp the page if the filtered set shrank beneath the current offset
  // (e.g. a restored sessionStorage page that no longer exists).
  const pageCount = Math.max(1, Math.ceil(totalRows / limit));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paginatedRows = useMemo(
    () => filtered.slice((page - 1) * limit, page * limit),
    [filtered, page, limit],
  );

  // ── selection ────────────────────────────────────────────────────────────
  // Selection is over the whole FILTERED dataset, not the visible page. The
  // table paginates server-side (15 rows), but `filtered` already holds every
  // matching record client-side — `records` is the month- and workspace-scoped
  // payroll list — so "select all" needs no extra fetch. Only ids are stored.
  //
  // Selection deliberately survives page changes; it is cleared only when the
  // filters change (see the filter guards below), because ids outside the new
  // filter would otherwise sit invisibly in the set and feed the bulk actions.
  useEffect(() => {
    setSelected(new Set());
  }, [search, deptFilter, branchFilter, companyFilter]);

  const filteredIds = useMemo(() => filtered.map(x => x.r.id), [filtered]);
  const selectedIds = useMemo(
    // Guard against ids left over from a wider filter.
    () => filteredIds.filter(id => selected.has(id)),
    [filteredIds, selected],
  );
  const selCountAll = filteredIds.length;
  const allSelected = selCountAll > 0 && selectedIds.length === selCountAll;
  const someSelected = selectedIds.length > 0;

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filteredIds));
  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Bulk actions must see every selected record, not just the ones on screen.
  const selectedRecords = useMemo(
    () => filtered.filter(x => selected.has(x.r.id)).map(x => x.r),
    [filtered, selected],
  );
  const clearSel = () => setSelected(new Set());

  // A filter change discards the selection. Confirm first when something is
  // selected, and restore the previous value if the user backs out.
  const guardFilterChange = async (apply: () => void) => {
    if (selected.size > 0) {
      const ok = await ui.confirm({
        title: 'Change filter?',
        message: 'Changing filters will clear the current employee selection. Continue?',
        confirmText: 'Yes',
        cancelText: 'Cancel',
      });
      if (!ok) return;
    }
    apply();
  };

  // ── Status pipeline: Draft → Generated → Approved → Paid ──────────────────
  // Counts are CUMULATIVE (a later stage implies the earlier ones are done), so
  // a freshly generated record (payrollStatus = 'pending_approval') counts as
  // Generated immediately, and shows up as "awaiting approval" on the Approve card.
  const m = useMemo(() => {
    let generated = 0, pendingApproval = 0, approved = 0, paid = 0, amount = 0;
    for (const r of records) {
      const pr = String(r.payrollStatus || r.status || '').toLowerCase();
      const pay = String(r.paymentStatus || '').toLowerCase();
      const isPaid = pay === 'paid' || pr === 'paid';
      const isApproved = isPaid || pr === 'approved' || pr === 'locked' || !!r.approvedAt;
      // Generated = a payroll record exists past Draft (pending_approval and beyond).
      const isGenerated = isApproved || (!!pr && pr !== 'draft') || r.payslipGenerated || !!r.generatedAt;
      if (isGenerated) generated++;
      if (isGenerated && !isApproved) pendingApproval++; // generated but not yet approved
      if (isApproved) approved++;
      if (isPaid) paid++;
      amount += r.netSalary || 0;
    }
    return { employees: records.length, generated, pendingApproval, approved, paid, pending: records.length - paid, amount };
  }, [records]);

  const cards = [
    { label: 'Employees', value: String(m.employees), icon: <Users size={16} />, tone: 'text-slate-600 bg-slate-100' },
    { label: 'Generated', value: String(m.generated), icon: <FileCheck2 size={16} />, tone: 'text-brand-600 bg-brand-50' },
    { label: 'Approved', value: String(m.approved), icon: <CheckCircle2 size={16} />, tone: 'text-brand-600 bg-brand-50' },
    { label: 'Paid', value: String(m.paid), icon: <Wallet size={16} />, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Pending', value: String(m.pending), icon: <Clock size={16} />, tone: 'text-amber-600 bg-amber-50' },
    { label: 'Payroll Amount', value: inrShort(m.amount), icon: <IndianRupee size={16} />, tone: 'text-brand-600 bg-brand-50' },
  ];

  // ── workflow step state ────────────────────────────────────────────────
  const total = records.length;
  const allGenerated = total > 0 && m.generated >= total;
  // Approve step is "done" when every generated record has been approved (nothing
  // left pending). It is NOT done just because 0 are approved before generation.
  const approveDone = m.generated > 0 && m.pendingApproval === 0;
  const allPaid = total > 0 && m.paid >= total;
  const anyLocked = records.some(r => String(r.payrollStatus).toLowerCase() === 'locked' || r.lockedAt);
  const lockedIds = records.filter(r => String(r.payrollStatus).toLowerCase() === 'locked' || r.lockedAt).map(r => r.id);
  // Only fully-PAID payroll may be locked; Company Head / Super Admin can unlock.
  const canOverrideLock = role === 'Company Head' || role === 'Super Admin';

  // ── Single workflow that respects the grid selection ──────────────────────
  // With rows selected → the action targets ONLY those employees. With nothing
  // selected → it falls back to the current filtered/whole-month set.
  //
  // Button labels stay SHORT and constant. The live scope is surfaced by the
  // `scoped` badge on each card (and by the sticky banner over the grid), never
  // baked into the label — a "(774 Selected)" suffix blows the grid column out
  // to its min-content width and breaks the card layout.
  //
  // `scoped: true` marks the steps whose action is actually narrowed by the grid
  // selection. Attendance Verification has no action, and Lock/Unlock always
  // spans the whole month — badging either would misstate what the button does.
  const selCount = selectedIds.length;
  const hasSel = selCount > 0;
  const genAction = () => (selCount > 0 && onGenerateSelected ? onGenerateSelected(selectedRecords) : onGeneratePayroll());
  const approveAction = () => (selCount > 0 && onApprove ? onApprove(selectedIds) : onApproveAll());
  const slipsAction = () => (selCount > 0 && onGenerateSlips ? onGenerateSlips(selectedRecords) : onGenerateSlipsAll());
  const payAction = () => (selCount > 0 && onMarkPaid ? onMarkPaid(selectedIds) : onMarkPaidAll());

  // ── Locked-month workflow (enterprise standard) ───────────────────────────
  // Once the month is locked, editing/generation/approval/recalculation are
  // frozen (steps 1–3), while Salary Slips (view/print/download) and Salary
  // Payment (bank sheet / history) stay AVAILABLE (steps 4–5). This changes only
  // the post-lock workflow presentation — no payroll/attendance/leave calc, no API.
  const monthLocked = anyLocked;
  const lockedRec = monthLocked
    ? (records.find(r => r.lockedAt) || records.find(r => String(r.payrollStatus).toLowerCase() === 'locked'))
    : null;
  const lockedOn = lockedRec?.lockedAt || null;
  // No `lockedBy` column exists (schema unchanged); fall back to the approver, then
  // to the authority that can lock — never fabricate a specific name.
  const lockedBy = lockedRec?.lockedBy || lockedRec?.approvedBy || null;
  const downloadAllSlips = () => onDownloadZip(filtered.map(x => x.r), `${branchFilter || deptFilter || 'All'}_Salary_Slips_${safe(monthLabel)}`);

  // ── Synchronize Attendance gate (enterprise workflow order) ────────────────
  // Generate Payroll unlocks only after attendance has been SYNCHRONIZED for this
  // month AND that snapshot is still current. `outdatedRecords` (DB-driven: any
  // later attendance/leave edit flags the payroll row `isOutdated`) is the reset
  // signal — when set, the green "Synchronized" badge clears and the button
  // re-enables, so payroll is never generated from a stale snapshot.
  const attRecalcDone = !!attendanceRecalc;
  const attChanged = outdatedRecords.length > 0;
  const attSynced = attRecalcDone && !attChanged;
  const attReady = total > 0 && attSynced;
  // After generation, any attendance change flags records "outdated" → approval is
  // blocked until payroll is re-synchronized / regenerated.
  const approveBlocked = attChanged;

  const steps: any[] = [
    // Step 1 — Synchronize Attendance is the first, mandatory step. ONE action
    // fetches attendance, recalculates, snapshots, computes LOP/OT and writes to
    // payroll. Rendered specially (green badge when synced) in the card body.
    { key: 'attRecalc', title: 'Synchronize Attendance', icon: <RefreshCw size={15} />, done: attSynced,
      status: monthLocked ? 'Locked'
        : attChanged ? 'Attendance changed — re-sync'
          : attSynced ? 'Attendance Synchronized'
            : 'Pending',
      subStatus: !monthLocked && attSynced && attendanceRecalc ? `Last: ${formatDate(attendanceRecalc.at)} · by ${attendanceRecalc.by}` : undefined,
      locked: monthLocked, lockedHint: 'Payroll month is locked. Unlock the month before synchronizing attendance.',
      scoped: false },
    { key: 'generate', title: 'Generate Payroll', icon: <Calculator size={15} />, done: allGenerated,
      status: monthLocked ? 'Locked' : (!attReady ? 'Synchronize attendance first' : (allGenerated ? 'Generated' : `${m.generated}/${total}`)),
      locked: monthLocked, scoped: !monthLocked,
      // Disabled (not hidden) until attendance is synchronized, so the required
      // workflow order is visible and enforced.
      btn: !monthLocked && perms.generate
        ? (attReady
            ? { label: 'Generate Payroll', onClick: genAction }
            : { label: 'Generate Payroll', onClick: () => {}, disabled: true, hint: 'Synchronize attendance before generating payroll.' })
        : false },
    { key: 'approve', title: 'Approve Payroll', icon: <ShieldCheck size={15} />, done: approveDone,
      // Show records AWAITING approval (generated, not yet approved) so the card
      // immediately reflects freshly generated payroll. "Approved" when none pending.
      // Approval is BLOCKED while attendance changed after generation (outdated).
      status: monthLocked ? 'Locked' : (approveBlocked ? 'Attendance changed — regenerate' : (!perms.approve ? 'No access' : approveDone ? 'Approved' : m.pendingApproval > 0 ? `${m.pendingApproval}/${total || 0} to approve` : 'Pending')),
      locked: monthLocked, scoped: !monthLocked,
      btn: !monthLocked && perms.approve
        ? (approveBlocked
            ? { label: 'Approve Payroll', onClick: () => {}, disabled: true, hint: 'Attendance changed since payroll was generated. Re-synchronize attendance & regenerate payroll before approving.' }
            : { label: 'Approve Payroll', onClick: approveAction })
        : false },
    { key: 'slips', title: monthLocked ? 'Salary Slips' : 'Generate Salary Slips', icon: <FileText size={15} />, done: allGenerated,
      status: monthLocked ? 'Available' : (allGenerated ? 'Slips Ready' : 'Pending'),
      scoped: !monthLocked,
      // After lock, generation is frozen but download/view/print stay available.
      btn: monthLocked
        ? (perms.download && { label: 'Download All', onClick: downloadAllSlips, tone: 'download' as const })
        : (perms.generateSlips && { label: 'Generate Slips', onClick: slipsAction }) },
    { key: 'pay', title: 'Salary Payment', icon: <Banknote size={15} />, done: allPaid,
      status: monthLocked ? 'Available' : (allPaid ? 'Paid' : `${m.paid}/${total || 0} paid`),
      scoped: false, btn: null },
    { key: 'lock', title: monthLocked ? 'Payroll Locked' : 'Lock Month', icon: monthLocked ? <Lock size={15} /> : <Lock size={15} />, done: monthLocked, scoped: false,
      // Locking is only allowed once the month is fully Paid; before that the
      // step stays open and the button is withheld. A locked month can be
      // reopened by a Company Head / Super Admin (override authority).
      status: monthLocked ? (lockedOn ? `Locked on ${formatDate(lockedOn)}` : 'Locked') : (allPaid ? 'Ready to lock' : 'Pay first'),
      subStatus: monthLocked ? (lockedBy ? `by ${lockedBy}` : 'by Company Head / Super Admin') : undefined,
      lockedBadge: monthLocked,
      btn: monthLocked
        ? (canOverrideLock && onUnlock && { label: 'Unlock Month', onClick: () => onUnlock(lockedIds), tone: 'unlock' as const })
        : (perms.lock && allPaid && { label: 'Lock Month', onClick: onLockMonth, tone: 'lock' as const }) },
  ];
  const activeIdx = steps.findIndex(s => !s.done);

  const safe = (s: string) => String(s || '').replace(/[^a-zA-Z0-9]+/g, '_');

  return (
    <div className="space-y-4">
      {/* ── 6 cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(c => (
          <div key={c.label} className="rounded-2xl border border-slate-150 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{c.label}</span>
              <span className={`p-1.5 rounded-lg ${c.tone}`}>{c.icon}</span>
            </div>
            <p className="mt-2.5 text-2xl font-extrabold text-slate-900 tracking-tight">{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── 6-step workflow (Attendance Recalculation is Step 1) ── */}
      <Card padding={false}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Payroll Workflow — {monthLabel}</h3>
            <p className="text-[11px] text-slate-500">
              {selCount > 0
                ? <>Actions apply to the <strong>{selCount} selected employee{selCount === 1 ? '' : 's'}</strong>. Clear the selection to act on the whole month.</>
                : <>Select rows below to scope actions to specific employees — otherwise each step applies to <strong>all employees</strong> this month.</>}
              {anyLocked ? ' This month is locked.' : ''}
            </p>
          </div>
        </div>
        {/* `auto-rows-fr` keeps every card the same height once the strip wraps —
            Salary Payment stacks two buttons and would otherwise set a taller row. */}
        <div className="grid auto-rows-fr grid-cols-1 gap-2 p-4 md:grid-cols-3 xl:grid-cols-6">
          {steps.map((s, i) => {
            const isActive = i === activeIdx;
            return (
              // `min-w-0` is load-bearing: a grid item defaults to min-width:auto,
              // so a long nowrap label would push the column past its track and
              // break the row. With min-w-0 the card holds its share and the
              // label truncates inside it instead.
              <div key={s.key} className={`min-w-0 rounded-xl border p-3 flex flex-col gap-2 ${s.done ? 'border-emerald-200 bg-emerald-50/40' : isActive ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-2">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? 'bg-emerald-600 text-white' : isActive ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {s.done ? '✓' : i + 1}
                  </span>
                  <span className="text-slate-500">{s.icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold text-slate-800 leading-tight" title={s.title}>{s.title}</p>
                  <p className={`truncate text-[10px] font-semibold mt-0.5 flex items-center gap-1 ${s.lockedBadge || s.done ? 'text-emerald-600' : s.locked ? 'text-slate-400' : isActive ? 'text-brand-600' : 'text-slate-400'}`} title={s.status}>
                    {(s.locked || s.lockedBadge) && <Lock size={9} className="shrink-0" />}
                    <span className="truncate">{s.status}</span>
                  </p>
                  {s.subStatus && <p className="truncate text-[10px] text-slate-400 mt-0.5" title={s.subStatus}>{s.subStatus}</p>}
                  {/* Step 6 — green "Payroll Locked" badge (enterprise standard). */}
                  {s.lockedBadge && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      <CheckCircle2 size={10} className="shrink-0" /> Payroll Locked
                    </span>
                  )}
                  {s.scoped && hasSel && (
                    <span className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      <span className="truncate">{selCount} Selected</span>
                    </span>
                  )}
                </div>
                {s.key === 'pay' ? (
                  perms.markPaid && (
                    <div className="mt-auto flex flex-col gap-1.5">
                      {/* Bank sheet download stays available after lock. */}
                      <Button size="sm" variant="secondary" className="w-full" onClick={onExportBank}>
                        <Banknote size={12} className="mr-1 shrink-0" /><span className="truncate">Bank Sheet</span>
                      </Button>
                      {/* Mark Paid is a mutation — frozen once the month is locked. */}
                      {!monthLocked && (
                        <Button size="sm" variant="success" className="w-full" onClick={payAction}>
                          <span className="truncate">Mark Paid</span>
                        </Button>
                      )}
                    </div>
                  )
                ) : s.key === 'attRecalc' ? (
                  // ── ONE combined action ── When attendance is synchronized AND
                  // still current, show a green "Attendance Synchronized" badge and
                  // no button. Otherwise show the single purple "Synchronize
                  // Attendance" button. It re-enables automatically when attendance
                  // changes (attSynced is cleared by outdatedRecords above).
                  s.locked ? (
                    <div className="mt-auto" title={s.lockedHint || 'Payroll month is locked.'}>
                      <div className="flex w-full cursor-not-allowed select-none items-center justify-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 text-[11px] font-bold text-slate-400">
                        <Lock size={11} className="shrink-0" /> Locked
                      </div>
                    </div>
                  ) : attSynced ? (
                    <div className="mt-auto flex w-full items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 size={12} className="shrink-0" /> Attendance Synchronized
                    </div>
                  ) : (canRecalcAttendance && onSynchronizeAttendance) ? (
                    <Button
                      size="sm"
                      variant="primary"
                      loading={attendanceRecalcBusy}
                      icon={<RefreshCw size={12} className="shrink-0" />}
                      className="mt-auto w-full"
                      onClick={onSynchronizeAttendance}
                    >
                      <span className="truncate">Synchronize Attendance</span>
                    </Button>
                  ) : <div className="mt-auto h-[1px]" />
                ) : s.locked ? (
                  // Steps after lock: disabled control + tooltip (step-specific hint
                  // when provided, e.g. Synchronize Attendance's unlock guidance).
                  <div className="mt-auto" title={s.lockedHint || 'Payroll month is locked.'}>
                    <div className="flex w-full cursor-not-allowed select-none items-center justify-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 text-[11px] font-bold text-slate-400">
                      <Lock size={11} className="shrink-0" /> Locked
                    </div>
                  </div>
                ) : s.btn && (s.btn as any).disabled ? (
                  // Gated action (Generate before recalc, Approve while outdated):
                  // shown disabled with the reason on hover — the required order stays
                  // visible and enforced rather than the button silently vanishing.
                  <div className="mt-auto" title={(s.btn as any).hint}>
                    <div className="flex w-full cursor-not-allowed select-none items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-[11px] font-bold text-slate-400">
                      <span className="truncate">{(s.btn as any).label}</span>
                    </div>
                  </div>
                ) : s.btn ? (
                  // Lock/Unlock carries its own colour language: unlocking a month
                  // is destructive (danger), locking it confirms (success), download
                  // is neutral-secondary, recalc is primary. Other steps are primary
                  // while active.
                  <Button
                    size="sm"
                    variant={
                      (s.btn as any).tone === 'unlock' ? 'danger'
                        : (s.btn as any).tone === 'lock' ? 'success'
                          : (s.btn as any).tone === 'download' ? 'secondary'
                            : (s.btn as any).tone === 'recalc' ? 'primary'
                              : isActive ? 'primary' : 'outline'
                    }
                    loading={(s.key === 'lock' && lockBusy === (s.btn as any).tone) || (s.key === 'attRecalc' && attendanceRecalcBusy)}
                    icon={(s.btn as any).tone === 'unlock' ? <Unlock size={12} className="shrink-0" /> : (s.btn as any).tone === 'lock' ? <Lock size={12} className="shrink-0" /> : (s.btn as any).tone === 'download' ? <Download size={12} className="shrink-0" /> : (s.btn as any).tone === 'recalc' ? <RefreshCw size={12} className="shrink-0" /> : undefined}
                    className="mt-auto w-full"
                    onClick={s.btn.onClick}
                  >
                    <span className="truncate">{s.btn.label}</span>
                  </Button>
                ) : <div className="mt-auto h-[1px]" />}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Role-based filters ── */}
      <Card padding={false}>
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-700">{roleLabel}</span>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…"
                className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-brand-400" />
            </div>
            {perms.filterCompany && (
              <select value={companyFilter} onChange={e => { const v = e.target.value; guardFilterChange(() => setCompanyFilter(v)); }} className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs outline-none focus:border-brand-400">
                <option value="">All Companies</option>
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {perms.filterBranch && (
              <select value={branchFilter} onChange={e => { const v = e.target.value; guardFilterChange(() => setBranchFilter(v)); }} className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs outline-none focus:border-brand-400">
                <option value="">All Branches</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
            <select value={deptFilter} onChange={e => { const v = e.target.value; guardFilterChange(() => setDeptFilter(v)); }} className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs outline-none focus:border-brand-400">
              <option value="">All Departments</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {perms.download && (
              <Button size="sm" variant="secondary" onClick={() => onDownloadZip(filtered.map(x => x.r), `${branchFilter || deptFilter || 'All'}_Salary_Slips_${safe(monthLabel)}`)}>
                <FileArchive size={13} className="mr-1" /> Download Slips ZIP{branchFilter || deptFilter ? ' (filtered)' : ' (all)'}
              </Button>
            )}
            {perms.email && (
              <Button size="sm" variant="secondary" onClick={() => onEmailAll(filtered.map(x => x.r))}>
                <Send size={13} className="mr-1" /> Email All Slips
              </Button>
            )}
          </div>
        </div>

        {/* ── Attendance changed → payroll needs regeneration ── */}
        {outdatedRecords.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
            <div className="flex items-center gap-2 text-amber-800">
              <RefreshCw size={14} className="text-amber-600" />
              <span className="text-xs font-bold">Attendance Updated — Payroll Regeneration Required</span>
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">{outdatedRecords.length} record(s)</span>
            </div>
            {perms.recalc && onRecalculate && !monthLocked ? (
              // Regenerating overwrites computed payroll — amber, not primary.
              <Button size="sm" variant="warning" onClick={() => onRecalculate(outdatedRecords.map((x: any) => x.id))}>
                <Calculator size={13} className="mr-1" /> Recalculate Payroll
              </Button>
            ) : monthLocked ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400" title="Payroll month is locked.">
                <Lock size={12} /> Recalculation locked
              </span>
            ) : null}
          </div>
        )}

        {/* ── Selection status (feedback only — the Payroll Workflow cards above run
            the actions, scoped to this selection). NOT a duplicate action bar. ── */}
        {someSelected && (
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50 px-4 py-2">
            <CheckCircle2 size={14} className="text-brand-600" />
            <span className="text-xs font-bold text-brand-700">
              {allSelected
                ? `All ${selCountAll} employee${selCountAll === 1 ? '' : 's'} are selected.`
                : `${selectedIds.length} of ${selCountAll} employee${selCountAll === 1 ? '' : 's'} selected.`}
            </span>
            {!allSelected && selCountAll > selectedIds.length && (
              <button onClick={() => setSelected(new Set(filteredIds))} className="text-[11px] font-bold text-brand-600 underline hover:text-brand-700">
                Select all {selCountAll}
              </button>
            )}
            <span className="text-[11px] text-brand-500">The <strong>Payroll Workflow</strong> actions above will apply to the selected employees.</span>
            <button onClick={clearSel} className="ml-auto text-[11px] font-semibold text-slate-500 underline hover:text-slate-700">Clear Selection</button>
          </div>
        )}

        {/* ── Employee table ── */}
        <div className="overflow-x-auto" ref={menuWrap}>
          <table className="w-full text-left text-xs">
            <thead className="bg-white text-[10px] uppercase tracking-wider text-slate-400">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-2.5 text-center"><input type="checkbox" aria-label="Select All" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={toggleAll} className="rounded border-slate-300" /></th>
                <th className="px-3 py-2.5 text-center">Sr No</th>
                <th className="px-2 py-2.5">Employee ID</th>
                <th className="px-2 py-2.5">Employee Name</th>
                <th className="px-2 py-2.5">Branch</th>
                <th className="px-2 py-2.5">Department</th>
                <th className="px-2 py-2.5 text-right">Monthly Salary</th>
                <th className="px-2 py-2.5 text-center">Working</th>
                <th className="px-2 py-2.5 text-center">Present</th>
                <th className="px-2 py-2.5 text-center">Payable</th>
                <th className="px-2 py-2.5 text-right">Daily Salary</th>
                <th className="px-2 py-2.5 text-right">Gross Salary</th>
                <th className="px-2 py-2.5 text-right">Overtime</th>
                <th className="px-2 py-2.5 text-right">Bonus</th>
                <th className="px-2 py-2.5 text-right">Deductions</th>
                <th className="px-2 py-2.5 text-right">Net Salary</th>
                <th className="px-2 py-2.5">Payment Status</th>
                <th className="px-2 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isTableLoading ? (
                <tr>
                  <td colSpan={18} className="px-4 py-10 text-center text-slate-500 text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-600"></div>
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr><td colSpan={18} className="px-4 py-10 text-center text-slate-400">No payroll records. Run “Generate Payroll” to begin.</td></tr>
              ) : paginatedRows.map((x, i) => {
                const pb = paymentBadge(x.r);
                const sel = selected.has(x.r.id);
                // A "pending" row is an eligible employee from Employee Management
                // that has no generated payroll yet (roster placeholder). It shows
                // as Not Generated with dashes and no slip actions — selecting it
                // and running Generate Payroll creates its real record.
                const pending = !!(x.r as any).__pending;
                return (
                  <tr key={x.r.id} className={`hover:bg-slate-50/60 ${sel ? 'bg-brand-50/50' : ''} ${pending ? 'bg-slate-50/40' : ''}`}>
                    <td className="px-3 py-2 text-center"><input type="checkbox" checked={sel} onChange={() => toggleOne(x.r.id)} className="rounded border-slate-300" /></td>
                    <td className="px-3 py-2 text-center text-slate-400">{(page - 1) * limit + i + 1}</td>
                    <td className="px-2 py-2 font-bold text-slate-800">{x.code}</td>
                    <td className="px-2 py-2 font-semibold text-slate-900">
                      {onOpenWorksheet
                        ? <button title={pending ? 'Open Salary Worksheet (Draft)' : 'Open Salary Worksheet'} onClick={() => onOpenWorksheet(x.r)} className="text-left hover:text-brand-600 hover:underline">{x.name}</button>
                        : x.name}
                    </td>
                    <td className="px-2 py-2 text-slate-600">{x.branch}</td>
                    <td className="px-2 py-2 text-slate-600">{x.dept}</td>
                    <td className="px-2 py-2 text-right text-slate-700">{pending ? '—' : inr(x.monthly)}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-slate-700">{pending ? '—' : x.workingDays}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-emerald-600 font-semibold">{pending ? '—' : x.present}</td>
                    <td className="px-2 py-2 text-center tabular-nums font-bold text-slate-900">{pending ? '—' : x.payable}</td>
                    <td className="px-2 py-2 text-right text-slate-600">{pending ? '—' : inr(x.daily)}</td>
                    <td className="px-2 py-2 text-right text-slate-700">{pending ? '—' : inr(x.gross)}</td>
                    <td className="px-2 py-2 text-right text-brand-600">{pending ? '—' : (x.overtime ? inr(x.overtime) : '—')}</td>
                    <td className={`px-2 py-2 text-right font-semibold ${!pending && x.bonus ? 'text-amber-600' : 'text-slate-400'}`}>{pending ? '—' : (x.bonus ? inr(x.bonus) : '—')}</td>
                    <td className="px-2 py-2 text-right text-rose-600">{pending ? '—' : inr(x.deductions)}</td>
                    <td className="px-2 py-2 text-right font-bold text-slate-900">{pending ? '—' : inr(x.net)}</td>
                    <td className="px-2 py-2">{pending ? <Badge variant="gray">Not Generated</Badge> : <Badge variant={pb.variant}>{pb.label}</Badge>}</td>
                    <td className="px-2 py-2">
                      {pending ? (
                        <div className="flex items-center justify-center gap-1">
                          {onOpenWorksheet && <button title="Open Salary Worksheet (Draft)" onClick={() => onOpenWorksheet(x.r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-600"><FileSpreadsheet size={14} /></button>}
                        </div>
                      ) : (
                      <div className="relative flex items-center justify-center gap-1">
                        {onOpenWorksheet && <button title="Open Salary Worksheet" onClick={() => onOpenWorksheet(x.r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-600"><FileSpreadsheet size={14} /></button>}
                        <button title="View Salary Slip" onClick={() => onView(x.r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand-600"><Eye size={14} /></button>
                        <button title="Download PDF" onClick={() => onDownloadPdf(x.r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"><Download size={14} /></button>
                        <button title="More" onClick={() => setOpenMenu(openMenu === x.r.id ? null : x.r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><MoreVertical size={14} /></button>
                        {openMenu === x.r.id && (
                          <div className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-slate-150 bg-white py-1 shadow-lg">
                            {[
                              ...(onOpenWorksheet ? [{ ic: <FileSpreadsheet size={13} />, label: 'Open Salary Worksheet', fn: () => onOpenWorksheet(x.r) }] : []),
                              { ic: <Eye size={13} />, label: 'View Salary Slip', fn: () => onView(x.r) },
                              { ic: <Download size={13} />, label: 'Download PDF', fn: () => onDownloadPdf(x.r) },
                              { ic: <Printer size={13} />, label: 'Print Slip', fn: () => onPrint(x.r) },
                              { ic: <Mail size={13} />, label: 'Email Slip', fn: () => onEmail(x.r) },
                              // Regeneration is a mutation — hidden once the row is locked.
                              ...((String(x.r.payrollStatus).toLowerCase() === 'locked' || x.r.lockedAt)
                                ? []
                                : [{ ic: <RefreshCw size={13} />, label: 'Regenerate Slip', fn: () => onRegenerate(x.r) }]),
                            ].map(a => (
                              <button key={a.label} onClick={() => { setOpenMenu(null); a.fn(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">{a.ic} {a.label}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Pagination Controls */}
        {totalRows > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50 rounded-b-xl flex-wrap gap-3">
            <span className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-700">{(page - 1) * limit + 1}</span> to <span className="font-bold text-slate-700">{Math.min(page * limit, totalRows)}</span> of <span className="font-bold text-slate-700">{totalRows}</span> payroll records
            </span>
            <div className="flex items-center gap-4">
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="text-xs py-1 px-3"
                >
                  <span className="sm:hidden">Previous</span>
                  <span className="hidden sm:inline">&lt;&lt; Previous</span>
                </Button>
                <div className="flex items-center px-2">
                  <span className="text-xs text-slate-500">Page {page} of {Math.max(1, Math.ceil(totalRows / limit))}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(Math.ceil(totalRows / limit), p + 1))}
                  disabled={page >= Math.ceil(totalRows / limit)}
                  className="text-xs py-1 px-3"
                >
                  <span className="sm:hidden">Next</span>
                  <span className="hidden sm:inline">Next &gt;&gt;</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
