import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Users, FileCheck2, CheckCircle2, Wallet, TrendingUp, TrendingDown,
  IndianRupee, Landmark, ShieldCheck, Receipt, Percent, Banknote,
  Eye, Download, Printer, Mail, RefreshCw, MoreVertical, Archive, Search, FileArchive
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

// ── Status → badge mapping ────────────────────────────────────────────────
const payrollStatusBadge = (status?: string): { label: string; variant: any } => {
  const s = String(status || 'draft').toLowerCase();
  if (s === 'approved') return { label: 'Approved', variant: 'green' };
  if (s === 'locked') return { label: 'Locked', variant: 'gray' };
  if (s === 'paid' || s === 'payslip_generated') return { label: 'Generated', variant: 'blue' };
  if (s === 'prepared' || s === 'verified' || s === 'payment_pending') return { label: 'Generated', variant: 'blue' };
  return { label: 'Draft', variant: 'yellow' };
};
const paymentStatusBadge = (status?: string): { label: string; variant: any } => {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'paid') return { label: 'Paid', variant: 'green' };
  if (s === 'processing' || s === 'payment_pending') return { label: 'Processing', variant: 'blue' };
  if (s === 'failed') return { label: 'Failed', variant: 'red' };
  return { label: 'Pending', variant: 'yellow' };
};

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

interface SalarySlipCenterProps {
  records: any[];
  company: any;
  getEmployee: (empId: string) => any;
  monthLabel: string;
  onView: (r: any) => void;
  onDownloadPdf: (r: any) => void;
  onPrint: (r: any) => void;
  onEmail: (r: any) => void;
  onRegenerate: (r: any) => void;
  onDownloadZip: (records: any[], zipName: string) => void;
  onApprove?: (ids: string[]) => void;
  onLock?: (ids: string[]) => void;
  getAttendance?: (empId: string) => { present: number; leave: number };
  canEdit?: boolean;
}

export const SalarySlipCenter: React.FC<SalarySlipCenterProps> = ({
  records, company, getEmployee, monthLabel,
  onView, onDownloadPdf, onPrint, onEmail, onRegenerate, onDownloadZip, onApprove, onLock, getAttendance, canEdit = true,
}) => {
  const [branchFilter, setBranchFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Resolve display fields (code, branch, dept) per record from the employee.
  const rows = useMemo(() => records.map(r => {
    const emp = getEmployee(r.employeeId);
    const att = getAttendance ? getAttendance(r.employeeId) : { present: 0, leave: 0 };
    return {
      r,
      code: emp?.employeeId || '—',
      name: r.employeeName || emp?.name || '—',
      branch: emp?.branchLocation || r.employee?.branchLocation || 'Head Office',
      dept: r.department || emp?.department || '—',
      present: att.present,
      leave: att.leave,
      gross: (r.basicSalary || 0) + (r.allowances || 0) + (r.bonus || 0),
      deductions: (r.deductions || 0) + (r.tax || 0),
    };
  }), [records, getEmployee, getAttendance]);

  const branches = useMemo(() => Array.from(new Set(rows.map(x => x.branch).filter(Boolean))).sort(), [rows]);
  const depts = useMemo(() => Array.from(new Set(rows.map(x => x.dept).filter(Boolean))).sort(), [rows]);

  const filteredRows = useMemo(() => rows.filter(x => {
    const q = empSearch.toLowerCase();
    return (!branchFilter || x.branch === branchFilter)
      && (!deptFilter || x.dept === deptFilter)
      && (!q || x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q));
  }), [rows, branchFilter, deptFilter, empSearch]);

  // ── 12 live dashboard metrics ─────────────────────────────────────────────
  const m = useMemo(() => {
    const pfRate = company?.pfRate ?? 12;
    const esicRate = company?.esicRate ?? 0.75;
    const ptRate = company?.profTaxRate ?? 200;
    let gross = 0, deductions = 0, net = 0, pf = 0, esic = 0, pt = 0, tds = 0;
    let generated = 0, approved = 0, paid = 0;
    for (const r of records) {
      const basic = r.basicSalary || 0;
      gross += basic + (r.allowances || 0) + (r.bonus || 0);
      deductions += (r.deductions || 0) + (r.tax || 0);
      net += r.netSalary || 0;
      pf += Math.round(basic * (pfRate / 100));
      esic += Math.round(basic * (esicRate / 100));
      pt += ptRate;
      tds += r.tax || 0;
      const ps = String(r.payrollStatus || r.status || '').toLowerCase();
      if (r.payslipGenerated || r.generatedAt || ['payslip_generated', 'approved', 'paid'].includes(ps)) generated++;
      if (ps === 'approved' || r.approvedAt) approved++;
      if (String(r.paymentStatus).toLowerCase() === 'paid' || ps === 'paid') paid++;
    }
    return { total: records.length, generated, approved, paid, gross, deductions, net, pf, esic, pt, tds };
  }, [records, company]);

  const cards: { label: string; value: string; icon: React.ReactNode; tone: string }[] = [
    { label: 'Total Employees', value: String(m.total), icon: <Users size={16} />, tone: 'text-slate-600 bg-slate-50' },
    { label: 'Payroll Generated', value: String(m.generated), icon: <FileCheck2 size={16} />, tone: 'text-blue-600 bg-blue-50' },
    { label: 'Payroll Approved', value: String(m.approved), icon: <CheckCircle2 size={16} />, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Payroll Paid', value: String(m.paid), icon: <Wallet size={16} />, tone: 'text-green-600 bg-green-50' },
    { label: 'Gross Payroll', value: inr(m.gross), icon: <TrendingUp size={16} />, tone: 'text-indigo-600 bg-indigo-50' },
    { label: 'Total Deductions', value: inr(m.deductions), icon: <TrendingDown size={16} />, tone: 'text-rose-600 bg-rose-50' },
    { label: 'Net Payroll', value: inr(m.net), icon: <IndianRupee size={16} />, tone: 'text-violet-600 bg-violet-50' },
    { label: 'PF Liability', value: inr(m.pf), icon: <Landmark size={16} />, tone: 'text-cyan-600 bg-cyan-50' },
    { label: 'ESIC Liability', value: inr(m.esic), icon: <ShieldCheck size={16} />, tone: 'text-teal-600 bg-teal-50' },
    { label: 'Professional Tax', value: inr(m.pt), icon: <Receipt size={16} />, tone: 'text-amber-600 bg-amber-50' },
    { label: 'TDS', value: inr(m.tds), icon: <Percent size={16} />, tone: 'text-orange-600 bg-orange-50' },
    { label: 'Bank Payable', value: inr(m.net), icon: <Banknote size={16} />, tone: 'text-fuchsia-600 bg-fuchsia-50' },
  ];

  const allSelected = filteredRows.length > 0 && filteredRows.every(x => selected.has(x.r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filteredRows.map(x => x.r.id)));
  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedRecords = () => filteredRows.filter(x => selected.has(x.r.id)).map(x => x.r);

  const safe = (s: string) => String(s || '').replace(/[^a-zA-Z0-9]+/g, '_');

  return (
    <div className="space-y-4">
      {/* ── 12 Dashboard Cards ── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {cards.map(c => (
          <div key={c.label} className="rounded-xl border border-slate-150 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{c.label}</span>
              <span className={`p-1.5 rounded-lg ${c.tone}`}>{c.icon}</span>
            </div>
            <p className="mt-2 text-lg font-extrabold text-slate-900 tracking-tight">{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── Salary Slip Management ── */}
      <Card padding={false}>
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-left">
            <h3 className="text-sm font-bold text-slate-900">Salary Slip Center — {monthLabel}</h3>
            <p className="text-[11px] text-slate-500">Preview, download, print, email or regenerate any slip individually — or export in bulk.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => onDownloadZip(records, `All_Salary_Slips_${safe(monthLabel)}`)}>
              <FileArchive size={13} className="mr-1" /> Download All ZIP
            </Button>
            <Button variant="outline" onClick={() => { const recs = selectedRecords(); recs.length ? onDownloadZip(recs, `Selected_Salary_Slips_${safe(monthLabel)}`) : alert('Select at least one employee.'); }}>
              <FileArchive size={13} className="mr-1" /> Selected ZIP ({selected.size})
            </Button>
            {canEdit && onApprove && (
              <Button variant="outline" onClick={() => { const ids = Array.from(selected); ids.length ? onApprove(ids) : alert('Select records to approve.'); }}>
                <CheckCircle2 size={13} className="mr-1" /> Approve
              </Button>
            )}
            {canEdit && onLock && (
              <Button variant="outline" onClick={() => { const ids = Array.from(selected); ids.length ? onLock(ids) : alert('Select records to lock.'); }}>
                <Archive size={13} className="mr-1" /> Lock
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search code / name…"
              className="w-52 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-indigo-400" />
          </div>
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs outline-none focus:border-indigo-400">
            <option value="">All Branches</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-xs outline-none focus:border-indigo-400">
            <option value="">All Departments</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {branchFilter && (
            <Button variant="ghost" onClick={() => onDownloadZip(filteredRows.map(x => x.r), `${safe(branchFilter)}_Salary_Slips_${safe(monthLabel)}`)}>
              <FileArchive size={13} className="mr-1" /> Branch ZIP
            </Button>
          )}
          {deptFilter && (
            <Button variant="ghost" onClick={() => onDownloadZip(filteredRows.map(x => x.r), `${safe(deptFilter)}_Salary_Slips_${safe(monthLabel)}`)}>
              <FileArchive size={13} className="mr-1" /> Department ZIP
            </Button>
          )}
          <span className="ml-auto text-[11px] text-slate-400">{filteredRows.length} of {rows.length} employees</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto" ref={menuRef}>
          <table className="w-full text-left text-xs">
            <thead className="bg-white text-[10px] uppercase tracking-wider text-slate-400">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-2.5"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-slate-300" /></th>
                <th className="px-2 py-2.5 text-center">Sr</th>
                <th className="px-2 py-2.5">Employee Code</th>
                <th className="px-2 py-2.5">Employee Name</th>
                <th className="px-2 py-2.5">Branch</th>
                <th className="px-2 py-2.5">Department</th>
                <th className="px-2 py-2.5 text-center">Present</th>
                <th className="px-2 py-2.5 text-center">Leave</th>
                <th className="px-2 py-2.5 text-right">Gross</th>
                <th className="px-2 py-2.5 text-right">Deductions</th>
                <th className="px-2 py-2.5 text-right">Net Salary</th>
                <th className="px-2 py-2.5">Payroll Status</th>
                <th className="px-2 py-2.5">Payment</th>
                <th className="px-2 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredRows.length === 0 ? (
                <tr><td colSpan={14} className="px-4 py-10 text-center text-slate-400">No salary slips match the current filters.</td></tr>
              ) : filteredRows.map((x, i) => {
                const pb = payrollStatusBadge(x.r.payrollStatus || x.r.status);
                const yb = paymentStatusBadge(x.r.paymentStatus);
                return (
                  <tr key={x.r.id} className={`hover:bg-slate-50/60 ${selected.has(x.r.id) ? 'bg-indigo-50/40' : ''}`}>
                    <td className="px-3 py-2"><input type="checkbox" checked={selected.has(x.r.id)} onChange={() => toggleOne(x.r.id)} className="rounded border-slate-300" /></td>
                    <td className="px-2 py-2 text-center text-slate-400">{i + 1}</td>
                    <td className="px-2 py-2 font-bold text-slate-800">{x.code}</td>
                    <td className="px-2 py-2 font-semibold text-slate-900">{x.name}</td>
                    <td className="px-2 py-2 text-slate-600">{x.branch}</td>
                    <td className="px-2 py-2 text-slate-600">{x.dept}</td>
                    <td className="px-2 py-2 text-center text-slate-600">{x.present}</td>
                    <td className="px-2 py-2 text-center text-slate-600">{x.leave}</td>
                    <td className="px-2 py-2 text-right text-slate-600">{inr(x.gross)}</td>
                    <td className="px-2 py-2 text-right text-slate-600">{inr(x.deductions)}</td>
                    <td className="px-2 py-2 text-right font-semibold text-slate-900">{inr(x.r.netSalary)}</td>
                    <td className="px-2 py-2"><Badge variant={pb.variant}>{pb.label}</Badge></td>
                    <td className="px-2 py-2"><Badge variant={yb.variant}>{yb.label}</Badge></td>
                    <td className="px-2 py-2">
                      <div className="relative flex items-center justify-center gap-1">
                        <button title="View Salary Slip" onClick={() => onView(x.r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"><Eye size={14} /></button>
                        <button title="Download PDF" onClick={() => onDownloadPdf(x.r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"><Download size={14} /></button>
                        <button title="More actions" onClick={() => setOpenMenu(openMenu === x.r.id ? null : x.r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><MoreVertical size={14} /></button>
                        {openMenu === x.r.id && (
                          <div className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-slate-150 bg-white py-1 shadow-lg">
                            <button onClick={() => { setOpenMenu(null); onView(x.r); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><Eye size={13} /> View Salary Slip</button>
                            <button onClick={() => { setOpenMenu(null); onDownloadPdf(x.r); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><Download size={13} /> Download PDF</button>
                            <button onClick={() => { setOpenMenu(null); onPrint(x.r); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><Printer size={13} /> Print Salary Slip</button>
                            <button onClick={() => { setOpenMenu(null); onEmail(x.r); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><Mail size={13} /> Email Salary Slip</button>
                            <button onClick={() => { setOpenMenu(null); onRegenerate(x.r); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><RefreshCw size={13} /> Regenerate Slip</button>
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
      </Card>
    </div>
  );
};
