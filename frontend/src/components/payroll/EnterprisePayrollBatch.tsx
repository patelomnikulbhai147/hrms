import React, { useMemo, useState } from 'react';
import { CheckSquare, Square, Loader2, FileSpreadsheet, PlayCircle, BadgeCheck, Landmark, Wallet, Lock } from 'lucide-react';
import type { PayrollRecord, Employee, AttendanceRecord, Company } from '@/types';
import { ui } from '@/components/ui/feedback';

// ── New enterprise payroll workflow ──────────────────────────────────────────
export type PayrollStage = 'draft' | 'generated' | 'approved' | 'bank_processing' | 'paid' | 'locked';

const STAGE_ORDER: PayrollStage[] = ['draft', 'generated', 'approved', 'bank_processing', 'paid', 'locked'];
const STAGE_LABEL: Record<PayrollStage, string> = {
  draft: 'DRAFT', generated: 'GENERATED', approved: 'APPROVED',
  bank_processing: 'BANK PROCESSING', paid: 'PAID', locked: 'LOCKED',
};
const STAGE_CLASS: Record<PayrollStage, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  generated: 'bg-blue-50 text-blue-700 border-blue-200',
  approved: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  bank_processing: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  locked: 'bg-slate-800 text-white border-slate-700',
};

// Map any legacy status string onto the new 6-stage workflow.
export const normalizeStage = (r: PayrollRecord): PayrollStage => {
  const s = String((r as any).payrollStatus || r.status || 'draft').toLowerCase();
  if (s === 'locked') return 'locked';
  if (s === 'paid' || s === 'payslip_generated') return 'paid';
  if (s === 'bank_processing') return 'bank_processing';
  if (s === 'approved' || s === 'verified') return 'approved';
  if (s === 'generated' || s === 'prepared') return 'generated';
  return 'draft';
};

const MONTH_INDEX: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

interface Props {
  records: PayrollRecord[];
  employees: Employee[];
  attendance?: AttendanceRecord[];
  company: Company | any;
  month: string;
  canEdit: boolean;
  // Persists status/payment changes for the given record ids to the database.
  onApply: (ids: string[], changes: Partial<PayrollRecord> & Record<string, any>) => Promise<void>;
  onExportExcel: () => void;
  onGenerateAll: () => Promise<void>;
  onGenerateAllPayslips: () => Promise<void>;
  onExportBankSheet: () => void;
}

export const EnterprisePayrollBatch: React.FC<Props> = ({
  records, employees, attendance = [], company, month, canEdit, onApply, onExportExcel,
  onGenerateAll, onGenerateAllPayslips, onExportBankSheet,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [topBusy, setTopBusy] = useState<string | null>(null);

  const empById = useMemo(() => {
    const m = new Map<string, Employee>();
    employees.forEach(e => { if (e.id) m.set(e.id, e); if ((e as any).employeeId) m.set((e as any).employeeId, e); });
    return m;
  }, [employees]);

  const monthIdx = MONTH_INDEX[String(month || '').toLowerCase()] ?? -1;

  // Live attendance summary per employee for the payroll month.
  const attendanceFor = (empId: string) => {
    const recs = attendance.filter(a => a.employeeId === empId && (monthIdx < 0 || new Date(a.date).getMonth() === monthIdx));
    let present = 0, absent = 0, leave = 0, ot = 0;
    for (const a of recs) {
      const s = String(a.status || '').toLowerCase();
      if (/present|on duty|wfo|work from home|wfh/.test(s)) present++;
      else if (/leave/.test(s)) leave++;
      else if (/absent/.test(s)) absent++;
      ot += Number((a as any).overtimeHours ?? 0);
    }
    return { present, absent, leave, ot };
  };

  // Header counts.
  const header = useMemo(() => {
    let generated = 0, approved = 0, paid = 0;
    for (const r of records) {
      const st = normalizeStage(r);
      if (st === 'paid' || st === 'locked') paid++;
      if (st === 'approved' || st === 'bank_processing' || st === 'paid' || st === 'locked') approved++;
      if (st !== 'draft') generated++;
    }
    return { total: records.length, generated, approved, paid };
  }, [records]);

  // Statutory / compliance summary (uses active company rates + record values).
  const compliance = useMemo(() => {
    const pfRate = (company?.pfRate ?? 12) / 100;
    const esicRate = (company?.esicRate ?? 0.75) / 100;
    const pt = company?.profTaxRate ?? 200;
    let totalGross = 0, totalNet = 0, pf = 0, esic = 0, ptTotal = 0, tds = 0;
    for (const r of records) {
      const gross = (r.basicSalary || 0) + (r.allowances || 0) + ((r as any).bonus || 0);
      totalGross += gross;
      totalNet += r.netSalary || 0;
      pf += Math.round((r.basicSalary || 0) * pfRate);
      esic += Math.round((r.basicSalary || 0) * esicRate);
      ptTotal += pt;
      tds += (r as any).tax || 0;
    }
    return { totalGross, totalNet, pf, esic, pt: ptTotal, tds };
  }, [records, company]);

  // Rows that are locked cannot be re-staged.
  const selectableIds = useMemo(() => records.filter(r => normalizeStage(r) !== 'locked').map(r => r.id), [records]);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  };
  const toggleOne = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const runBulk = async (label: string, changes: Record<string, any>, filterStage?: PayrollStage[]) => {
    let ids = [...selected];
    if (filterStage) {
      const byId = new Map(records.map(r => [r.id, r]));
      ids = ids.filter(id => { const r = byId.get(id); return r && filterStage.includes(normalizeStage(r)); });
    }
    if (ids.length === 0) { ui.toast.warning(`No eligible selected rows for "${label}".`); return; }
    setBusy(label);
    try {
      await onApply(ids, changes);
      setSelected(new Set());
    } catch (e: any) {
      console.error(e);
      ui.toast.error(`${label} failed: ${e?.message || 'server error'}`);
    } finally {
      setBusy(null);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  // ── Period-based "All" actions ──────────────────────────────────────────────
  const idsByStage = (stages: PayrollStage[]) => records.filter(r => stages.includes(normalizeStage(r))).map(r => r.id);

  const runTop = async (label: string, fn: () => Promise<void> | void) => {
    setTopBusy(label);
    try { await fn(); }
    catch (e: any) { console.error(e); ui.toast.error(`${label} failed: ${e?.message || 'server error'}`); }
    finally { setTopBusy(null); }
  };

  const approveAll = () => runTop('Approve All', async () => {
    const generated = records.filter(r => normalizeStage(r) === 'generated');
    if (!generated.length) { ui.toast.warning('No payroll in GENERATED stage. Run "Generate All Payroll" first.'); return; }
    // Validation (#): salary must be calculated before approval.
    const errors = generated.filter(r => !(Number(r.netSalary) > 0)).map(r => `• ${r.employeeName}: salary not calculated`);
    if (errors.length) { await ui.alert({ title: 'Error', message: `Cannot approve — resolve these first:\n\n${errors.join('\n')}`, variant: 'error' }); return; }
    // Warn (not block) when attendance is missing for the month.
    const noAtt = generated.filter(r => { const e = empById.get(r.employeeId); const a = attendanceFor(e?.id || r.employeeId); return a.present + a.absent + a.leave === 0; });
    if (noAtt.length && !(await ui.confirm({ message: `${noAtt.length} employee(s) have no attendance records for ${month}.\nNet salary is calculated, but attendance is not synced. Approve anyway?` }))) return;
    await onApply(generated.map(r => r.id), { payrollStatus: 'approved', status: 'approved' });
  });

  const markAllPaid = () => runTop('Mark All Paid', async () => {
    const ids = idsByStage(['approved', 'bank_processing']);
    if (!ids.length) { ui.toast.warning('No approved payroll to pay. Approve payroll first.'); return; }
    await onApply(ids, { payrollStatus: 'paid', status: 'paid', paymentStatus: 'paid', paymentDate: today });
  });

  const lockMonth = () => runTop('Lock Month', async () => {
    const ids = idsByStage(['paid']);
    if (!ids.length) { ui.toast.warning('Only PAID payroll can be locked. Mark payroll paid first.'); return; }
    if (!(await ui.confirm({ message: `Lock ${ids.length} paid record(s) for ${month}? Locked rows cannot be re-staged.`, variant: 'danger', confirmText: 'Lock' }))) return;
    await onApply(ids, { payrollStatus: 'locked', status: 'locked' });
  });

  const TopBtn = ({ id, label, onClick, tone, disabled, title }: any) => (
    <button
      onClick={onClick}
      disabled={!canEdit || !!topBusy || disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${tone}`}
    >
      {topBusy === id && <Loader2 size={13} className="animate-spin" />}
      {label}
    </button>
  );

  const BulkBtn = ({ id, icon, label, onClick, disabled }: any) => (
    <button
      onClick={onClick}
      disabled={!canEdit || !!busy || selected.size === 0 || disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
    >
      {busy === id ? <Loader2 size={13} className="animate-spin" /> : icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* ── Period-based Top Actions (monthly batch workflow) ──────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-3">
        <span className="text-[11px] font-bold text-[#1D4ED8] uppercase tracking-wider mr-1">Monthly Batch:</span>
        <TopBtn id="Generate All Payroll" label="Generate All Payroll" onClick={() => runTop('Generate All Payroll', onGenerateAll)}
          tone="bg-[#2563EB] text-white border-[#2563EB] hover:bg-[#1D4ED8]" />
        <TopBtn id="Approve All" label="Approve All" onClick={approveAll}
          tone="bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50" />
        <TopBtn id="Generate All Payslips" label="Generate All Payslips" onClick={() => runTop('Generate All Payslips', onGenerateAllPayslips)}
          tone="bg-white text-slate-700 border-slate-200 hover:bg-slate-50" />
        <TopBtn id="zip" label="Download All Payslips ZIP" onClick={() => {}} disabled
          title="Bulk ZIP export requires the ZIP module (not yet installed) — use per-row PDF/XLSX for now."
          tone="bg-white text-slate-400 border-slate-200" />
        <TopBtn id="Export Bank Transfer Sheet" label="Export Bank Transfer Sheet" onClick={() => runTop('Export Bank Transfer Sheet', onExportBankSheet)}
          tone="bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50" />
        <TopBtn id="Mark All Paid" label="Mark All Paid" onClick={markAllPaid}
          tone="bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50" />
        <TopBtn id="Lock Month" label="Lock Month" onClick={lockMonth}
          tone="bg-slate-800 text-white border-slate-700 hover:bg-slate-900" />
      </div>

      {/* ── Payroll Month Header ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#DBEAFE] bg-gradient-to-r from-[#EFF6FF] to-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold text-[#2563EB] uppercase tracking-wider">Payroll Month</p>
            <p className="text-2xl font-extrabold text-slate-800">{month} {new Date().getFullYear()}</p>
          </div>
          <div className="flex gap-6">
            {[
              { label: 'Total Employees', value: header.total },
              { label: 'Generated', value: header.generated },
              { label: 'Approved', value: header.approved },
              { label: 'Paid', value: header.paid },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-extrabold text-slate-800 leading-none">{s.value}</p>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Compliance Summary Dashboard ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Payroll', value: compliance.totalNet, color: 'text-blue-700 bg-blue-50 border-blue-200' },
          { label: 'Gross', value: compliance.totalGross, color: 'text-slate-700 bg-slate-50 border-slate-200' },
          { label: 'PF Liability', value: compliance.pf, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
          { label: 'ESIC Liability', value: compliance.esic, color: 'text-cyan-700 bg-cyan-50 border-cyan-200' },
          { label: 'Professional Tax', value: compliance.pt, color: 'text-amber-700 bg-amber-50 border-amber-200' },
          { label: 'TDS', value: compliance.tds, color: 'text-rose-700 bg-rose-50 border-rose-200' },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border p-3 ${c.color}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{c.label}</p>
            <p className="text-base font-extrabold font-mono mt-1">{inr(c.value)}</p>
          </div>
        ))}
      </div>

      {/* ── Bulk Action Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <span className="text-xs font-bold text-slate-500 mr-1">{selected.size} selected</span>
        <BulkBtn id="Generate Payroll" icon={<PlayCircle size={13} className="text-blue-600" />} label="Generate Payroll"
          onClick={() => runBulk('Generate Payroll', { payrollStatus: 'generated', status: 'generated' }, ['draft'])} />
        <BulkBtn id="Approve Payroll" icon={<BadgeCheck size={13} className="text-indigo-600" />} label="Approve Payroll"
          onClick={() => runBulk('Approve Payroll', { payrollStatus: 'approved', status: 'approved' }, ['generated'])} />
        <BulkBtn id="Bank Processing" icon={<Landmark size={13} className="text-amber-600" />} label="Bank Processing"
          onClick={() => runBulk('Bank Processing', { payrollStatus: 'bank_processing', status: 'bank_processing' }, ['approved'])} />
        <BulkBtn id="Mark Paid" icon={<Wallet size={13} className="text-emerald-600" />} label="Mark Paid"
          onClick={() => runBulk('Mark Paid', { payrollStatus: 'paid', status: 'paid', paymentStatus: 'paid', paymentDate: today }, ['approved', 'bank_processing'])} />
        <BulkBtn id="Lock" icon={<Lock size={13} className="text-slate-700" />} label="Lock"
          onClick={async () => { if (await ui.confirm({ message: 'Lock the selected payroll rows? Locked rows cannot be re-staged here.', variant: 'danger', confirmText: 'Lock' })) runBulk('Lock', { payrollStatus: 'locked', status: 'locked' }, ['paid']); }} />
        <div className="ml-auto">
          <button onClick={onExportExcel} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition-all">
            <FileSpreadsheet size={13} /> Export Excel
          </button>
        </div>
      </div>

      {/* ── Batch Table ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4 w-10">
                <button onClick={toggleAll} disabled={selectableIds.length === 0} title="Select All">
                  {allSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} className="text-slate-400" />}
                </button>
              </th>
              <th className="py-3 px-3">Employee</th>
              <th className="py-3 px-3">Stage</th>
              <th className="py-3 px-3 text-center">Present</th>
              <th className="py-3 px-3 text-center">Absent</th>
              <th className="py-3 px-3 text-center">Leave</th>
              <th className="py-3 px-3 text-center">OT Hrs</th>
              <th className="py-3 px-3 text-right">Gross</th>
              <th className="py-3 px-3 text-right">Deductions</th>
              <th className="py-3 px-3 text-right">Net Salary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {records.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-10 text-slate-400">No payroll records for {month}.</td></tr>
            ) : records.map(r => {
              const stage = normalizeStage(r);
              const emp = empById.get(r.employeeId);
              const att = attendanceFor(emp?.id || r.employeeId);
              const gross = (r.basicSalary || 0) + (r.allowances || 0) + ((r as any).bonus || 0);
              const deductions = (r.deductions || 0) + ((r as any).tax || 0);
              const isLocked = stage === 'locked';
              return (
                <tr key={r.id} className={`hover:bg-slate-50/60 ${selected.has(r.id) ? 'bg-blue-50/40' : ''}`}>
                  <td className="py-2.5 px-4">
                    <button onClick={() => toggleOne(r.id)} disabled={isLocked} title={isLocked ? 'Locked' : 'Select'}>
                      {selected.has(r.id)
                        ? <CheckSquare size={15} className="text-blue-600" />
                        : <Square size={15} className={isLocked ? 'text-slate-200' : 'text-slate-400'} />}
                    </button>
                  </td>
                  <td className="py-2.5 px-3">
                    <p className="font-bold text-slate-800">{r.employeeName}</p>
                    <p className="text-[10px] text-slate-400">{emp?.employeeId || '—'} · {r.department}</p>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${STAGE_CLASS[stage]}`}>
                      {isLocked && <Lock size={9} />}{STAGE_LABEL[stage]}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-semibold text-emerald-700">{att.present}</td>
                  <td className="py-2.5 px-3 text-center font-semibold text-rose-600">{att.absent}</td>
                  <td className="py-2.5 px-3 text-center font-semibold text-amber-600">{att.leave}</td>
                  <td className="py-2.5 px-3 text-center font-semibold text-violet-600">{att.ot}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-700">{inr(gross)}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-rose-600">{inr(deductions)}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{inr(r.netSalary || 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Workflow legend */}
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
        <span className="font-bold">Workflow:</span>
        {STAGE_ORDER.map((s, i) => (
          <React.Fragment key={s}>
            <span className={`px-2 py-0.5 rounded border ${STAGE_CLASS[s]}`}>{STAGE_LABEL[s]}</span>
            {i < STAGE_ORDER.length - 1 && <span className="text-slate-300">→</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
