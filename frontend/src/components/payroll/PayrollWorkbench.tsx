import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Users, FileCheck2, CheckCircle2, Wallet, Clock, IndianRupee,
  CalendarCheck, Calculator, ShieldCheck, FileText, Banknote, Lock,
  Eye, Download, Printer, Mail, RefreshCw, MoreVertical, Search, FileArchive, Send,
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { byEmployeeCode } from '../../utils/employeeSort';

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
  onGenerateSlips?: (records: any[]) => void;
  onLock?: (ids: string[]) => void;
  onRecalculate?: (ids?: string[]) => void;
  // workflow step actions
  onGeneratePayroll: () => void;
  onApproveAll: () => void;
  onGenerateSlipsAll: () => void;
  onExportBank: () => void;
  onMarkPaidAll: () => void;
  onLockMonth: () => void;
  // per-employee slip actions
  onView: (r: any) => void;
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
  onView, onDownloadPdf, onPrint, onEmail, onRegenerate, onDownloadZip, onEmailAll,
  onApprove, onMarkPaid, onGenerateSlips, onLock, onRecalculate,
}) => {
  const [companyFilter, setCompanyFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');
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
    return {
      r,
      code: emp?.employeeId || '—',
      name: r.employeeName || emp?.name || '—',
      branch: emp?.branchLocation || r.employee?.branchLocation || 'Head Office',
      dept: r.department || emp?.department || '—',
      gross: (r.basicSalary || 0) + (r.allowances || 0) + (r.bonus || 0),
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

  // ── selection ──
  const filteredIds = filtered.map(x => x.r.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));
  const someSelected = filteredIds.some(id => selected.has(id));
  const toggleAll = () => setSelected(prev => {
    const n = new Set(prev);
    if (allSelected) filteredIds.forEach(id => n.delete(id));
    else filteredIds.forEach(id => n.add(id));
    return n;
  });
  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedRecords = filtered.filter(x => selected.has(x.r.id)).map(x => x.r);
  const selectedIds = selectedRecords.map(r => r.id);
  const clearSel = () => setSelected(new Set());

  // ── 6 dashboard cards ──────────────────────────────────────────────────
  const m = useMemo(() => {
    let generated = 0, approved = 0, paid = 0, amount = 0;
    for (const r of records) {
      const pr = String(r.payrollStatus || r.status || '').toLowerCase();
      const pay = String(r.paymentStatus || '').toLowerCase();
      if (r.payslipGenerated || r.generatedAt || ['payslip_generated', 'approved', 'paid'].includes(pr)) generated++;
      if (pr === 'approved' || r.approvedAt) approved++;
      if (pay === 'paid' || pr === 'paid') paid++;
      amount += r.netSalary || 0;
    }
    return { employees: records.length, generated, approved, paid, pending: records.length - paid, amount };
  }, [records]);

  const cards = [
    { label: 'Employees', value: String(m.employees), icon: <Users size={16} />, tone: 'text-slate-600 bg-slate-100' },
    { label: 'Generated', value: String(m.generated), icon: <FileCheck2 size={16} />, tone: 'text-blue-600 bg-blue-50' },
    { label: 'Approved', value: String(m.approved), icon: <CheckCircle2 size={16} />, tone: 'text-indigo-600 bg-indigo-50' },
    { label: 'Paid', value: String(m.paid), icon: <Wallet size={16} />, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Pending', value: String(m.pending), icon: <Clock size={16} />, tone: 'text-amber-600 bg-amber-50' },
    { label: 'Payroll Amount', value: inrShort(m.amount), icon: <IndianRupee size={16} />, tone: 'text-violet-600 bg-violet-50' },
  ];

  // ── workflow step state ────────────────────────────────────────────────
  const total = records.length;
  const allGenerated = total > 0 && m.generated >= total;
  const allApproved = total > 0 && m.approved >= total;
  const allPaid = total > 0 && m.paid >= total;
  const anyLocked = records.some(r => String(r.payrollStatus).toLowerCase() === 'locked' || r.lockedAt);

  const steps = [
    { key: 'attendance', title: 'Attendance Verification', icon: <CalendarCheck size={15} />, done: total > 0, status: total > 0 ? 'Attendance Ready' : 'No data',
      btn: null as any },
    { key: 'generate', title: 'Generate Payroll', icon: <Calculator size={15} />, done: allGenerated, status: allGenerated ? 'Generated' : (total > 0 ? `${m.generated}/${total}` : 'Pending'),
      btn: perms.generate && { label: 'Generate Payroll', onClick: onGeneratePayroll } },
    { key: 'approve', title: 'Approve Payroll', icon: <ShieldCheck size={15} />, done: allApproved, status: allApproved ? 'Approved' : (perms.approve ? `${m.approved}/${total || 0}` : 'No access'),
      // Permission-based, not lock-based: authorized users may approve at any time
      // (the hard lock is removed; revision history tracks any later change).
      btn: perms.approve && { label: 'Approve Payroll', onClick: onApproveAll } },
    { key: 'slips', title: 'Generate Salary Slips', icon: <FileText size={15} />, done: allGenerated, status: allGenerated ? 'Slips Ready' : 'Pending',
      btn: perms.generateSlips && { label: 'Generate Salary Slips', onClick: onGenerateSlipsAll } },
    { key: 'pay', title: 'Salary Payment', icon: <Banknote size={15} />, done: allPaid, status: allPaid ? 'Paid' : `${m.paid}/${total || 0} paid`,
      btn: null },
    { key: 'lock', title: 'Lock Month', icon: <Lock size={15} />, done: anyLocked, status: anyLocked ? 'Locked' : 'Open',
      btn: perms.lock && !anyLocked && { label: 'Lock Month', onClick: onLockMonth } },
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

      {/* ── 6-step workflow ── */}
      <Card padding={false}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Payroll Workflow — {monthLabel}</h3>
            <p className="text-[11px] text-slate-500">Run payroll in 6 clear steps. {anyLocked ? 'This month is locked.' : 'Complete each step in order.'}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 p-4 md:grid-cols-3 xl:grid-cols-6">
          {steps.map((s, i) => {
            const isActive = i === activeIdx;
            return (
              <div key={s.key} className={`rounded-xl border p-3 flex flex-col gap-2 ${s.done ? 'border-emerald-200 bg-emerald-50/40' : isActive ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-150 bg-white'}`}>
                <div className="flex items-center gap-2">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? 'bg-emerald-600 text-white' : isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {s.done ? '✓' : i + 1}
                  </span>
                  <span className="text-slate-500">{s.icon}</span>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-800 leading-tight">{s.title}</p>
                  <p className={`text-[10px] font-semibold mt-0.5 ${s.done ? 'text-emerald-600' : isActive ? 'text-indigo-600' : 'text-slate-400'}`}>{s.status}</p>
                </div>
                {s.key === 'pay' ? (
                  perms.markPaid && (
                    <div className="mt-auto flex flex-col gap-1.5">
                      <Button size="sm" variant="outline" onClick={onExportBank}><Banknote size={12} className="mr-1" />Bank Sheet</Button>
                      <Button size="sm" variant="primary" onClick={onMarkPaidAll}>Mark Paid</Button>
                    </div>
                  )
                ) : s.btn ? (
                  <Button size="sm" variant={isActive ? 'primary' : 'outline'} className="mt-auto" onClick={s.btn.onClick}>{s.btn.label}</Button>
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
            <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">{roleLabel}</span>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…"
                className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-indigo-400" />
            </div>
            {perms.filterCompany && (
              <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs outline-none focus:border-indigo-400">
                <option value="">All Companies</option>
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {perms.filterBranch && (
              <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs outline-none focus:border-indigo-400">
                <option value="">All Branches</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs outline-none focus:border-indigo-400">
              <option value="">All Departments</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {perms.download && (
              <Button size="sm" variant="outline" onClick={() => onDownloadZip(filtered.map(x => x.r), `${branchFilter || deptFilter || 'All'}_Salary_Slips_${safe(monthLabel)}`)}>
                <FileArchive size={13} className="mr-1" /> Download Slips ZIP{branchFilter || deptFilter ? ' (filtered)' : ' (all)'}
              </Button>
            )}
            {perms.email && (
              <Button size="sm" variant="outline" onClick={() => onEmailAll(filtered.map(x => x.r))}>
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
            {perms.recalc && onRecalculate && (
              <Button size="sm" onClick={() => onRecalculate(outdatedRecords.map((x: any) => x.id))}>
                <Calculator size={13} className="mr-1" /> Recalculate Payroll
              </Button>
            )}
          </div>
        )}

        {/* ── Selection bulk-action bar (role-gated) ── */}
        {someSelected && (
          <div className="flex flex-wrap items-center gap-2 border-b border-indigo-100 bg-indigo-50 px-4 py-2.5">
            <span className="text-xs font-bold text-indigo-700">{selectedIds.length} Employee{selectedIds.length === 1 ? '' : 's'} Selected</span>
            <span className="text-indigo-300">|</span>
            {perms.generateSlips && onGenerateSlips && (
              <Button size="sm" variant="outline" onClick={() => onGenerateSlips(selectedRecords)}><FileText size={12} className="mr-1" />Generate Slips</Button>
            )}
            {perms.approve && onApprove && (
              <Button size="sm" variant="outline" onClick={() => onApprove(selectedIds)}><ShieldCheck size={12} className="mr-1" />Approve Payroll</Button>
            )}
            {perms.markPaid && onMarkPaid && (
              <Button size="sm" variant="outline" onClick={() => onMarkPaid(selectedIds)}><Wallet size={12} className="mr-1" />Mark Paid</Button>
            )}
            {perms.download && (
              <Button size="sm" variant="outline" onClick={() => onDownloadZip(selectedRecords, `Selected_Salary_Slips_${safe(monthLabel)}`)}><FileArchive size={12} className="mr-1" />Download Slips</Button>
            )}
            {perms.email && (
              <Button size="sm" variant="outline" onClick={() => onEmailAll(selectedRecords)}><Send size={12} className="mr-1" />Email Slips</Button>
            )}
            <button onClick={clearSel} className="ml-auto text-[11px] font-semibold text-slate-500 underline hover:text-slate-700">Clear selection</button>
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
                <th className="px-2 py-2.5 text-right">Gross Salary</th>
                <th className="px-2 py-2.5 text-right">Deductions</th>
                <th className="px-2 py-2.5 text-right">Net Salary</th>
                <th className="px-2 py-2.5">Payment Status</th>
                <th className="px-2 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">No payroll records. Run “Generate Payroll” to begin.</td></tr>
              ) : filtered.map((x, i) => {
                const pb = paymentBadge(x.r);
                const sel = selected.has(x.r.id);
                return (
                  <tr key={x.r.id} className={`hover:bg-slate-50/60 ${sel ? 'bg-indigo-50/50' : ''}`}>
                    <td className="px-3 py-2 text-center"><input type="checkbox" checked={sel} onChange={() => toggleOne(x.r.id)} className="rounded border-slate-300" /></td>
                    <td className="px-3 py-2 text-center text-slate-400">{i + 1}</td>
                    <td className="px-2 py-2 font-bold text-slate-800">{x.code}</td>
                    <td className="px-2 py-2 font-semibold text-slate-900">{x.name}</td>
                    <td className="px-2 py-2 text-slate-600">{x.branch}</td>
                    <td className="px-2 py-2 text-slate-600">{x.dept}</td>
                    <td className="px-2 py-2 text-right text-slate-700">{inr(x.gross)}</td>
                    <td className="px-2 py-2 text-right text-rose-600">{inr(x.deductions)}</td>
                    <td className="px-2 py-2 text-right font-bold text-slate-900">{inr(x.net)}</td>
                    <td className="px-2 py-2"><Badge variant={pb.variant}>{pb.label}</Badge></td>
                    <td className="px-2 py-2">
                      <div className="relative flex items-center justify-center gap-1">
                        <button title="View Salary Slip" onClick={() => onView(x.r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"><Eye size={14} /></button>
                        <button title="Download PDF" onClick={() => onDownloadPdf(x.r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"><Download size={14} /></button>
                        <button title="More" onClick={() => setOpenMenu(openMenu === x.r.id ? null : x.r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><MoreVertical size={14} /></button>
                        {openMenu === x.r.id && (
                          <div className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-slate-150 bg-white py-1 shadow-lg">
                            {[
                              { ic: <Eye size={13} />, label: 'View Salary Slip', fn: () => onView(x.r) },
                              { ic: <Download size={13} />, label: 'Download PDF', fn: () => onDownloadPdf(x.r) },
                              { ic: <Printer size={13} />, label: 'Print Slip', fn: () => onPrint(x.r) },
                              { ic: <Mail size={13} />, label: 'Email Slip', fn: () => onEmail(x.r) },
                              { ic: <RefreshCw size={13} />, label: 'Regenerate Slip', fn: () => onRegenerate(x.r) },
                            ].map(a => (
                              <button key={a.label} onClick={() => { setOpenMenu(null); a.fn(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">{a.ic} {a.label}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">{filtered.length} of {rows.length} employees</div>
      </Card>
    </div>
  );
};
