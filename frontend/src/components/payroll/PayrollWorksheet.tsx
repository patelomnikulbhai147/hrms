import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { formatDate } from '@/utils/formatDate';
import {
  TrendingUp, TrendingDown, Building2, AlertTriangle, RefreshCw,
  Save, CheckCircle2, FileText, Printer, Download, BadgeCheck,
  ArrowLeft, ChevronRight, Home, Users, Calculator,
} from 'lucide-react';

// Field definitions — label order matches the enterprise salary-worksheet spec.
const EARNINGS: [string, string][] = [
  ['basic', 'Basic'], ['hra', 'HRA'], ['da', 'DA'], ['conveyance', 'Conveyance'], ['medical', 'Medical Allowance'],
  ['specialAllowance', 'Special Allowance'], ['educationAllowance', 'Education Allowance'], ['washingAllowance', 'Washing Allowance'],
  ['bonus', 'Bonus'], ['incentive', 'Incentive'], ['overtime', 'Overtime'], ['arrears', 'Arrears'], ['otherEarnings', 'Other Earnings'],
];
// Deductions are NO LONGER a fixed list. They come from the server as the active
// components for this company (built-ins + Settings → Payroll → Component
// Builder), each with its own key, label and editability. Adding a component in
// settings makes it appear here — and on every payslip — with no code change.
type DeductionRow = { key: string; label: string; amount: number; editable?: boolean; system?: boolean; archived?: boolean };

const EMPLOYER: [string, string][] = [['employerPf', 'Employer PF'], ['employerEsi', 'Employer ESI']];
const STATIC_KEYS = [...EARNINGS, ...EMPLOYER].map(([k]) => k);

const inr = (n: number) => `₹${Math.round((n || 0) as number).toLocaleString('en-IN')}`;
const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// Maximum payroll amount for any single component (₹10,00,00,000 = 10 crore).
const MAX_AMOUNT = 100000000;

// Keep only digits and a single decimal point — strips letters, 'e'/scientific
// notation, '+', '-', and stray symbols as the user types.
const sanitizeAmount = (raw: string): string => {
  if (raw == null) return '';
  let s = String(raw).replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, ''); // at most one '.'
  return s;
};

// ── Presentational cells, defined at MODULE scope so their component identity is
//    stable across renders. (Defining them inside the parent recreated the type
//    on every keystroke, which remounted the inputs and stole focus.) ──
const InfoCell: React.FC<{ label: string; value: any }> = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    <p className="text-xs font-semibold text-slate-800 truncate">{value ?? '—'}</p>
  </div>
);

const AttCell: React.FC<{ label: string; value: any; tone?: string }> = ({ label, value, tone = 'text-slate-800' }) => {
  // Numbers render large; short status/source text (e.g. "Not Loaded",
  // "Attendance module") and the "--" placeholder render a touch smaller so they
  // fit the same compact cell without changing the card's layout.
  const isText = typeof value === 'string' && (value === '--' || Number.isNaN(Number(value)));
  return (
    <div className="rounded-lg border border-slate-150 bg-white px-2 py-1.5 text-center">
      <p className="text-[8.5px] font-bold uppercase tracking-wide text-slate-400 leading-tight">{label}</p>
      <p className={`${isText ? 'text-[11px]' : 'text-sm'} font-extrabold leading-tight ${tone}`}>{value ?? 0}</p>
    </div>
  );
};

// Bottom-summary tile.
const SummaryTile: React.FC<{ label: string; value: string; tone?: string; strong?: boolean }> = ({ label, value, tone = 'bg-slate-50 text-slate-800 border-slate-150', strong }) => (
  <div className={`rounded-xl border px-3 py-2.5 ${tone} ${strong ? 'ring-2 ring-emerald-400 shadow-sm' : ''}`}>
    <p className="text-[9px] font-bold uppercase tracking-wide opacity-80 leading-tight">{label}</p>
    <p className={`font-black font-mono leading-tight ${strong ? 'text-lg' : 'text-base'}`}>{value}</p>
  </div>
);

// Enter → jump to the next editable money field (mouse-free mass editing).
const focusNextWsInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-ws-input]')).filter(el => !el.disabled);
  const i = inputs.indexOf(e.currentTarget);
  if (i >= 0 && inputs[i + 1]) inputs[i + 1].focus();
};

const MoneyRow: React.FC<{ k: string; label: string; value: string; editable: boolean; onChange: (k: string, v: string) => void }> = React.memo(({ k, label, value, editable, onChange }) => {
  const handle = (raw: string) => {
    const clean = sanitizeAmount(raw);
    if (clean !== '' && clean !== '.' && Number(clean) > MAX_AMOUNT) return; // reject over-limit keystrokes
    onChange(k, clean);
  };
  const over = n(value) > MAX_AMOUNT;
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <label className="text-[11px] text-slate-600 truncate">{label}</label>
      <div className={`flex items-center rounded-lg border px-1.5 ${over || n(value) < 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'}`}>
        <span className="text-[10px] text-slate-400">₹</span>
        {/* type=text + inputMode=decimal: numeric keypad on mobile, no 'e'/+/- semantics */}
        <input type="text" inputMode="decimal" autoComplete="off" data-ws-input value={value ?? ''} disabled={!editable}
          onChange={e => handle(e.target.value)} onKeyDown={focusNextWsInput}
          className="w-28 bg-transparent px-1 py-1 text-[11px] text-right font-semibold text-slate-800 outline-none disabled:text-slate-500" />
      </div>
    </div>
  );
});

interface Props {
  payrollId: string | number | null;
  canEdit?: boolean;
  /** Returns to the Payroll list (browser stays on the Payroll page). */
  onBack: () => void;
  onSaved?: () => void;
  /** The payroll list record — powers the header status/approval chips and
   *  the action buttons. Optional so the worksheet still renders standalone. */
  record?: any;
  /** Header/footer action wiring. Each is optional — the button only renders
   *  when its handler is supplied. These call the SAME parent handlers the
   *  payroll list uses, so no business logic / API changes here. */
  onRecalculate?: (record: any) => void | Promise<void>;
  onApprove?: (record: any) => void | Promise<void>;
  onGenerateSlip?: (record: any) => void | Promise<void>;
  onMarkPaid?: (record: any) => void | Promise<void>;
  onPrint?: (record: any) => void;
  onDownloadPdf?: (record: any) => void;
  /** DRAFT mode — the employee has no generated payroll yet. Supplies the full
   *  employee profile + the recalculated attendance summary so the worksheet
   *  opens as a Draft preview WITHOUT any payroll record or API lookup. */
  draftEmployee?: any;
  draftAttendance?: any;
  /** Generate payroll for this employee from within the Draft worksheet (reuses
   *  the normal generation engine — no formula change). */
  onGenerateDraft?: (record: any) => void | Promise<void>;
  /** Shortcut when the employee has no salary structure (e.g. open Employees). */
  onAssignSalary?: (record: any) => void;
}

export const PayrollWorksheet: React.FC<Props> = ({
  payrollId, canEdit = false, onBack, onSaved, record,
  onRecalculate, onApprove, onGenerateSlip, onMarkPaid, onPrint, onDownloadPdf,
  draftEmployee, draftAttendance, onGenerateDraft, onAssignSalary,
}) => {
  // Draft mode: an employee with no generated payroll record yet (roster
  // placeholder). Opens a read-only preview built from client-side data.
  const isDraft = !!record?.__pending;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  // The company's active deduction components, in payslip order.
  const [deductionRows, setDeductionRows] = useState<DeductionRow[]>([]);
  // Hide components that are zero AND not being edited, so a slip with three
  // deductions doesn't render sixteen empty rows. Toggleable — an admin adding a
  // deduction needs to see the zero rows to type into them.
  const [showZeroRows, setShowZeroRows] = useState(false);

  // Loadable so post-action refreshes (approve, recalc…) re-pull the worksheet.
  const load = useCallback(() => {
    if (!payrollId) return;
    // ── DRAFT: employee has no generated payroll yet ──────────────────────────
    // Build the worksheet from the employee profile + recalculated attendance
    // already on the client — NO API call, NO payroll computation. The salary
    // structure shows the stored monthly salary as an indicative Basic; the real
    // component breakdown is computed only when the user clicks Generate Payroll.
    if (record?.__pending) {
      const emp = draftEmployee || {};
      const att = draftAttendance || {};
      const salary = Number(emp.salary) || 0;
      setData({
        employee: {
          name: emp.name, employeeCode: emp.employeeId, designation: emp.designation,
          department: emp.department, branch: emp.branchLocation || emp.branch,
          uan: emp.uan, esic: emp.esic || emp.esicNumber,
        },
        attendance: {
          present: att.presentDays, absent: att.absentDays, cl: att.cl, sl: att.sl, pl: att.pl,
          halfDays: att.halfDays, lop: att.lwp, otHours: att.otHours, payableDays: att.payableDays,
        },
        worksheet: {}, deductions: [],
        meta: { editable: false, locked: false, isOutdated: false, draft: true },
      });
      const f: Record<string, string> = {};
      for (const k of STATIC_KEYS) f[k] = '0';
      f.basic = String(salary);
      setForm(f);
      // Load the company's active deduction components so the Deductions section
      // is never empty — every applicable line renders at ₹0 in a draft.
      setDeductionRows([]); // clear any prior employee's rows while loading
      const cid = (record as any)?.companyId ?? emp.companyId;
      api.payroll.worksheet.deductionComponents(cid)
        .then((comps: any[]) => setDeductionRows((comps || []).map((c: any) => ({ key: c.key, label: c.label, amount: 0, editable: c.editable, system: c.system }))))
        .catch(() => setDeductionRows([]));
      setError(''); setOkMsg(''); setLoading(false);
      return;
    }
    setLoading(true); setError(''); setOkMsg(''); setData(null);
    api.payroll.worksheet.get(payrollId)
      .then((res: any) => {
        setData(res);
        const rows: DeductionRow[] = res.deductions || [];
        setDeductionRows(rows);
        const f: Record<string, string> = {};
        for (const k of STATIC_KEYS) f[k] = String(res.worksheet?.[k] ?? 0);
        for (const d of rows) f[d.key] = String(d.amount ?? 0);
        setForm(f);
      })
      .catch((e: any) => setError(e?.message || 'Could not load the salary worksheet.'))
      .finally(() => setLoading(false));
  }, [payrollId, record, draftEmployee, draftAttendance]);

  const generateDraft = async () => {
    if (!onGenerateDraft || !record) return;
    setGenBusy(true);
    try { await onGenerateDraft(record); } finally { setGenBusy(false); }
  };

  useEffect(() => { if (payrollId) load(); }, [payrollId, load]);

  const editable = !!canEdit && !!data?.meta?.editable;
  const allKeys = useMemo(() => [...STATIC_KEYS, ...deductionRows.map(d => d.key)], [deductionRows]);

  // Stable identity so React.memo'd rows only re-render when their own value changes.
  const setField = useCallback((k: string, v: string) => { setForm(p => ({ ...p, [k]: v })); setOkMsg(''); }, []);

  // ── Live recalculation engine ──
  // Editing any earning/deduction re-derives every summary total in the SAME
  // render — no refetch, no page refresh.
  const totals = useMemo(() => {
    const totalEarnings = EARNINGS.reduce((s, [k]) => s + n(form[k]), 0);
    const totalDeductions = deductionRows.reduce((s, d) => s + n(form[d.key]), 0);
    const employerContribution = n(form.employerPf) + n(form.employerEsi);
    const grossSalary = totalEarnings;
    const netSalary = totalEarnings - totalDeductions;
    const ctcImpact = grossSalary + employerContribution;
    return { totalEarnings, totalDeductions, employerContribution, grossSalary, netSalary, ctcImpact };
  }, [form, deductionRows]);

  // Rows to render: non-zero always; zero rows only when the user asks, or when
  // the worksheet is editable and they've opened the full component list.
  // In a Draft (nothing computed yet) show EVERY applicable component at ₹0 so the
  // section is never empty; otherwise hide zero rows unless the user expands them.
  const visibleDeductions = useMemo(
    () => deductionRows.filter(d => isDraft || showZeroRows || n(form[d.key]) > 0 || d.archived),
    [deductionRows, form, showZeroRows, isDraft],
  );

  const negativeField = allKeys.find(k => n(form[k]) < 0);
  const nonNumericField = allKeys.find(k => { const v = form[k]; return v !== '' && v != null && !/^\d*\.?\d*$/.test(String(v)); });
  const overMaxField = allKeys.find(k => n(form[k]) > MAX_AMOUNT);
  const invalid = !!negativeField || !!nonNumericField || !!overMaxField || totals.netSalary < 0 || totals.totalEarnings <= 0 || totals.totalDeductions > totals.totalEarnings;
  const invalidReason = nonNumericField ? 'Only numbers and decimal values are allowed.'
    : overMaxField ? `Amount exceeds the maximum allowed (₹${MAX_AMOUNT.toLocaleString('en-IN')}).`
    : negativeField ? 'Values cannot be negative.'
    : totals.totalEarnings <= 0 ? 'Total earnings must be greater than zero.'
    : totals.netSalary < 0 ? 'Net Salary is negative. Please review earnings and deductions before approval.'
    : totals.totalDeductions > totals.totalEarnings ? 'Deductions cannot exceed earnings.'
    : '';

  const save = async () => {
    if (!payrollId || invalid) return;
    setSaving(true); setError('');
    try {
      const earnings: any = {}, deductions: any = {}, employer: any = {};
      EARNINGS.forEach(([k]) => earnings[k] = n(form[k]));
      // Send every component (zeros included) — the server persists only the
      // non-zero ones, so clearing a deduction removes its row rather than
      // leaving a stale value behind.
      deductionRows.forEach(d => deductions[d.key] = n(form[d.key]));
      EMPLOYER.forEach(([k]) => employer[k] = n(form[k]));
      await api.payroll.worksheet.save(payrollId, { earnings, deductions, employer });
      setOkMsg('Draft saved. Payroll, payslip, register and reports updated.');
      onSaved?.();
      load(); // refresh meta/amounts, stay on the page
    } catch (e: any) { setError(e?.message || 'Save failed.'); }
    finally { setSaving(false); }
  };

  // Run a parent action, then refresh the worksheet + payroll list so the header
  // status and figures reflect the new state. The parent owns confirms/toasts.
  const runAction = async (name: string, fn?: (r: any) => void | Promise<void>) => {
    if (!fn || !record) return;
    setBusyAction(name); setError('');
    try {
      await fn(record);
      onSaved?.();
      load();
    } catch (e: any) { setError(e?.message || 'Action failed.'); }
    finally { setBusyAction(''); }
  };

  const emp = data?.employee || {};
  const att = data?.attendance || {};

  // ── Verified-attendance gate ──
  // `meta.hasAttendance` is authoritative: the backend sets it true only when the
  // Attendance module holds records for THIS company · employee · month (never a
  // cached payroll snapshot). Fall back to a value heuristic for older responses.
  const hasAttendanceData = [att.present, att.cl, att.pl, att.sl, att.halfDays, att.lop, att.otHours, att.payableDays].some((v: any) => n(v) > 0);
  const hasAttendance = data?.meta?.hasAttendance != null ? !!data.meta.hasAttendance : hasAttendanceData;
  // Salary cannot be generated/approved/saved/printed until verified attendance
  // exists. Drafts are exempt (they are a pre-generation preview).
  const attendanceMissing = !isDraft && !!data && !hasAttendance;
  const noSalaryStructure = !!data && totals.totalEarnings <= 0;

  // ── Header status derivation (presentation only) ──
  const rawStatus = String(record?.payrollStatus || record?.status || '').toLowerCase();
  const approved = rawStatus === 'approved' || rawStatus === 'paid';
  const paid = String(record?.paymentStatus || '').toLowerCase() === 'paid';

  // ── Attendance-synchronization gate ──
  // The backend stamps meta.synced=true only after Attendance Synchronization has
  // written this month to payroll. Until then, forward payroll actions (Approve /
  // Generate Slip / Print / Download / Save) are disabled. Already approved/paid
  // (historical) payroll is exempt so old slips stay printable.
  const notSynced = !isDraft && !!data && data?.meta?.synced === false;
  const syncBlocked = notSynced && !approved && !paid;
  // Any condition that blocks salary write/finalize actions.
  const actionBlocked = attendanceMissing || syncBlocked;
  const statusChip = (label: string, tone: string) => (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}`}>{label}</span>
  );

  const monthLabel = emp.payrollMonth || (record ? `${record.month} ${record.year}` : '');
  const statusLabel = record?.paymentStatus === 'paid' || paid ? 'Paid' : approved ? 'Approved' : 'Draft';
  const generatedOn = record?.processedOn ? formatDate(record.processedOn) : '—';

  // ── Dedicated FULL PAGE (no modal) ──────────────────────────────────────────
  // Renders as the normal-flow center content inside the app's <main> scroll area,
  // so the sidebar + top navigation stay visible and the PAGE scrolls naturally —
  // there is no nested/internal scroll region. Presentation only: the load / save /
  // recalc / approve / slip handlers, totals and validation are unchanged.
  return (
    <div className="space-y-4 font-sans pb-10">
      {/* ── Page header card: breadcrumb · identity · status · actions ──
          A normal in-flow block (no sticky, no negative margins) so the page
          starts directly under the application header with the app's standard
          content padding — no reserved/overlapping vertical space. */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {/* Breadcrumb — Payroll › Salary Worksheet › Employee › Month */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-400">
          <Home size={12} className="text-slate-300" />
          <button onClick={onBack} className="transition-colors hover:text-brand-600">Payroll</button>
          <ChevronRight size={11} className="text-slate-300" />
          <button onClick={onBack} className="transition-colors hover:text-brand-600">Salary Worksheet</button>
          <ChevronRight size={11} className="text-slate-300" />
          <span className="text-slate-700">{emp.name || record?.employeeName || 'Employee'}</span>
          {monthLabel && <><ChevronRight size={11} className="text-slate-300" /><span>{monthLabel}</span></>}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* Identity + status */}
          <div className="flex min-w-0 items-start gap-3">
            <button onClick={onBack} className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:border-brand-300 hover:text-brand-600">
              <ArrowLeft size={14} /> Back
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-extrabold leading-tight text-slate-800">{emp.name || record?.employeeName || '—'}</h2>
              <p className="truncate text-[11px] font-semibold text-slate-500">
                {[emp.employeeCode, emp.designation, emp.department, emp.branch, monthLabel].filter(Boolean).join(' · ') || '—'}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {isDraft
                  ? statusChip('Draft · Not Generated', 'bg-amber-50 text-amber-700 border-amber-200')
                  : statusChip(statusLabel, paid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : approved ? 'bg-brand-50 text-brand-700 border-brand-200' : 'bg-amber-50 text-amber-700 border-amber-200')}
                {!isDraft && statusChip(approved ? 'Approval: Approved' : 'Approval: Pending', approved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200')}
                {record?.payslipGenerated && statusChip('Slip Generated', 'bg-indigo-50 text-indigo-700 border-indigo-200')}
                {!isDraft && !editable && data && statusChip(data?.meta?.locked ? 'Locked / Read-only' : 'Read-only', 'bg-slate-100 text-slate-500 border-slate-200')}
                {!isDraft && <span className="text-[10px] font-semibold text-slate-400">Generated: {generatedOn}</span>}
              </div>
            </div>
          </div>

          {/* Live net payable + action buttons (Back · Save Draft · Recalculate ·
              Approve · Generate Salary Slip · Mark Paid · Print · Download PDF) */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className={`rounded-xl px-3 py-1.5 ${totals.netSalary < 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'}`}>
              <span className="text-[9px] font-extrabold uppercase tracking-wide">{isDraft ? 'Indicative Net' : 'Net Payable'}</span>
              <span className="ml-2 text-base font-black font-mono">{inr(totals.netSalary)}</span>
            </div>
            {isDraft ? (
              // No payroll record yet — the only action is to generate it (slip /
              // approve / mark-paid all require a generated record).
              canEdit && onGenerateDraft && (
                <Button size="sm" icon={<Calculator size={13} />} loading={genBusy} onClick={generateDraft}>Generate Payroll</Button>
              )
            ) : (
              <>
                {editable && (
                  <Button size="sm" icon={<Save size={13} />} loading={saving} disabled={invalid || actionBlocked} onClick={save}>Save Draft</Button>
                )}
                {onRecalculate && (
                  <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} loading={busyAction === 'recalc'} onClick={() => runAction('recalc', onRecalculate)}>{attendanceMissing ? 'Recalculate Attendance' : 'Recalculate'}</Button>
                )}
                {canEdit && onApprove && !approved && (
                  <Button variant="outline" size="sm" icon={<CheckCircle2 size={13} />} loading={busyAction === 'approve'} disabled={actionBlocked} onClick={() => runAction('approve', onApprove)}>Approve</Button>
                )}
                {canEdit && onGenerateSlip && (
                  <Button variant="outline" size="sm" icon={<FileText size={13} />} loading={busyAction === 'slip'} disabled={actionBlocked} onClick={() => runAction('slip', onGenerateSlip)}>Generate Salary Slip</Button>
                )}
                {canEdit && onMarkPaid && approved && !paid && (
                  <Button variant="outline" size="sm" icon={<BadgeCheck size={13} />} loading={busyAction === 'paid'} disabled={actionBlocked} onClick={() => runAction('paid', onMarkPaid)}>Mark Paid</Button>
                )}
                {onPrint && <Button variant="outline" size="sm" icon={<Printer size={13} />} disabled={actionBlocked} onClick={() => record && onPrint(record)}>Print</Button>}
                {onDownloadPdf && <Button variant="outline" size="sm" icon={<Download size={13} />} disabled={actionBlocked} onClick={() => record && onDownloadPdf(record)}>Download PDF</Button>}
              </>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-slate-400">Loading worksheet…</div>
      ) : !data ? (
        <div className="py-20 text-center text-xs text-rose-500">{error || 'No data.'}</div>
      ) : (
        <>
          {/* ── Draft (payroll not generated yet) notice ── */}
          {data?.meta?.draft && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 shadow-sm">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-extrabold">Payroll not generated yet — Draft preview</p>
                <p className="text-xs font-semibold text-amber-700">Showing this employee's profile, recalculated attendance and salary structure. Earnings &amp; deductions are computed and saved when you click <b>Generate Payroll</b>.</p>
              </div>
            </div>
          )}

          {/* ── Top warning banner — negative net or any blocking validation.
              Suppressed in Draft (read-only preview; figures aren't saved). ── */}
          {!isDraft && invalid && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-rose-800 shadow-sm">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-500" />
              <div>
                <p className="text-sm font-extrabold">{totals.netSalary < 0 ? 'Net Salary is negative' : 'This worksheet needs attention'}</p>
                <p className="text-xs font-semibold text-rose-600">{invalidReason}</p>
              </div>
            </div>
          )}

          {error && !invalid && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">{error}</div>
          )}
          {okMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">{okMsg}</div>
          )}

          {data.meta?.isOutdated && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
              <RefreshCw size={13} /> Attendance changed after this payroll was generated — use Recalculate to refresh attendance-driven figures.
            </div>
          )}

          {/* Verified attendance missing — salary generation is blocked. */}
          {attendanceMissing && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-extrabold">No verified attendance for this payroll month</p>
                  <p className="text-xs font-semibold text-amber-700">Salary is not calculated from missing attendance. Load attendance from the Attendance module, then payroll will recompute automatically.</p>
                </div>
              </div>
              {onRecalculate && (
                <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} loading={busyAction === 'recalc'} onClick={() => runAction('recalc', onRecalculate)}>Recalculate Attendance</Button>
              )}
            </div>
          )}

          {/* Attendance NOT synchronized — salary actions blocked until the
              Attendance Synchronization step writes this month to payroll. */}
          {syncBlocked && !attendanceMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 shadow-sm">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-extrabold">Attendance has not been synchronized for this payroll month.</p>
                <p className="text-xs font-semibold text-amber-700">Open <b>Payroll → Attendance Synchronization</b>, review the figures and click <b>Confirm &amp; Write to Payroll</b>. Approve, Generate Salary Slip, Print and Download stay disabled until then.</p>
              </div>
            </div>
          )}

          {/* ── 1 · Employee Information ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500"><Users size={13} className="text-brand-600" /> 1 · Employee Information</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-slate-150 bg-slate-50/60 p-3 sm:grid-cols-3 lg:grid-cols-6">
              <InfoCell label="Employee Name" value={emp.name || record?.employeeName} />
              <InfoCell label="Employee ID" value={emp.employeeCode} />
              <InfoCell label="Designation" value={emp.designation} />
              <InfoCell label="Department" value={emp.department} />
              <InfoCell label="Branch" value={emp.branch} />
              <InfoCell label="Payroll Month" value={monthLabel} />
              <InfoCell label="Payroll Status" value={isDraft ? 'Draft — Not Generated' : statusLabel} />
              <InfoCell label="Generated" value={isDraft ? 'Not generated' : generatedOn} />
              <InfoCell label="UAN" value={emp.uan} />
              <InfoCell label="ESIC Number" value={emp.esic} />
            </div>
          </section>

          {/* ── 2 · Attendance Summary (read-only — managed in Attendance module) ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">2 · Attendance Summary</h3>
              <span className="text-[9px] text-slate-400">Source: Attendance module (read-only)</span>
            </div>
            {/* The COMPLETE Attendance Summary is ALWAYS shown — never hidden or
                collapsed — so the user sees exactly what payroll will read. When
                verified attendance exists, every field shows its live value from
                the Attendance module; when it does not, the same layout renders a
                "--" placeholder for each figure, an "Attendance Status: Not
                Loaded" and a reason + Recalculate action below. Presentation only:
                Paid Leave = CL+SL+PL and Unpaid Leave = LOP are display roll-ups
                of the same source figures; no payroll value is changed here. */}
            {(() => {
              const DASH = '--';
              // Live value when verified attendance exists, else the placeholder.
              const v = (val: any) => (hasAttendance && val != null ? val : DASH);
              const paidLeave = hasAttendance ? n(att.cl) + n(att.sl) + n(att.pl) : DASH;
              const cells: { label: string; value: any; tone?: string }[] = [
                // Month Days is a calendar fact — shown even without attendance.
                { label: 'Month Days', value: att.monthDays != null ? att.monthDays : DASH },
                { label: 'Working Days', value: v(att.workingDays) },
                { label: 'Weekly Off', value: v(att.weeklyOff) },
                { label: 'Holidays', value: v(att.holidays) },
                { label: 'Present', value: v(att.present), tone: 'text-emerald-600' },
                { label: 'Half Days', value: v(att.halfDays) },
                { label: 'Paid Leave', value: paidLeave, tone: 'text-emerald-600' },
                { label: 'Unpaid Leave', value: v(att.lop), tone: 'text-rose-600' },
                { label: 'Absent', value: v(att.absent), tone: 'text-rose-600' },
                { label: 'Overtime', value: v(att.otHours), tone: 'text-brand-600' },
                { label: 'Payable Days', value: v(att.payableDays), tone: 'text-brand-600' },
                { label: 'Attendance Status', value: att.locked ? 'Locked' : (att.attendanceStatus || (hasAttendance ? 'Verified' : 'Not Loaded')), tone: att.synced ? 'text-emerald-600' : hasAttendance ? 'text-emerald-600' : 'text-amber-600' },
                { label: 'Attendance Source', value: att.attendanceSource || (hasAttendance ? 'Attendance module' : DASH) },
              ];
              return (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                  {cells.map(c => <AttCell key={c.label} label={c.label} value={c.value} tone={c.tone} />)}
                </div>
              );
            })()}
            {!hasAttendance && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12px] font-semibold text-amber-800">
                <span className="flex items-center gap-2"><AlertTriangle size={15} className="shrink-0 text-amber-500" /> Reason: No verified attendance found for this payroll month.{!isDraft && ' Salary actions stay disabled until attendance is loaded.'}</span>
                {!isDraft && onRecalculate && (
                  <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} loading={busyAction === 'recalc'} onClick={() => runAction('recalc', onRecalculate)}>Recalculate Attendance</Button>
                )}
              </div>
            )}
          </section>

          {/* ── 3 · Earnings | 4 · Deductions (two-column desktop/laptop, single
              column tablet, stacked mobile) ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 3 · Earnings */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-brand-700"><TrendingUp size={13} /> 3 · Earnings</h3>
              {noSalaryStructure && (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-semibold text-amber-700">
                  <span className="flex items-center gap-1.5"><AlertTriangle size={13} className="shrink-0 text-amber-500" /> No salary structure assigned.</span>
                  {onAssignSalary && <button onClick={() => onAssignSalary(record)} className="rounded-md bg-amber-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-amber-700">Assign Salary</button>}
                </div>
              )}
              <div className="divide-y divide-slate-50">
                {EARNINGS.map(([k, label]) => <MoneyRow key={k} k={k} label={label} value={form[k]} editable={editable} onChange={setField} />)}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-xs font-bold text-brand-800">
                <span>Total Earnings</span><span className="font-mono">{inr(totals.totalEarnings)}</span>
              </div>
            </section>

            {/* 4 · Deductions */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-rose-700"><TrendingDown size={13} /> 4 · Deductions</h3>
                {/* Zero rows are hidden by default; an admin adding a deduction
                    reveals the full component list to type into it. */}
                <button
                  type="button"
                  onClick={() => setShowZeroRows(v => !v)}
                  className="text-[10px] font-bold text-brand-600 underline hover:text-brand-700"
                >
                  {showZeroRows
                    ? 'Hide unused components'
                    : `Show all ${deductionRows.length} components`}
                </button>
              </div>
              <div className="divide-y divide-slate-50">
                {visibleDeductions.map(d => (
                  <MoneyRow
                    key={d.key}
                    k={d.key}
                    label={d.label + (d.archived ? ' (archived)' : '')}
                    value={form[d.key]}
                    editable={editable && d.editable !== false}
                    onChange={setField}
                  />
                ))}
                {visibleDeductions.length === 0 && (
                  <p className="py-3 text-center text-[11px] text-slate-400">No deductions for this employee.</p>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-xs font-bold text-rose-800">
                <span>Total Deductions</span><span className="font-mono">{inr(totals.totalDeductions)}</span>
              </div>
            </section>
          </div>

          {/* ── 5 · Employer Contribution (CTC only) ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-600"><Building2 size={13} /> 5 · Employer Contribution <span className="font-normal normal-case tracking-normal text-slate-400">(CTC only)</span></h3>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {EMPLOYER.map(([k, label]) => <MoneyRow key={k} k={k} label={label} value={form[k]} editable={editable} onChange={setField} />)}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-[11px] font-bold text-slate-700">
              <span>Total Employer Contribution</span><span className="font-mono">{inr(totals.employerContribution)}</span>
            </div>
          </section>

          {/* ── 6 · Payroll Summary ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">6 · Payroll Summary</h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
              <SummaryTile label="Gross Salary" value={inr(totals.grossSalary)} tone="bg-brand-50 text-brand-700 border-brand-100" />
              <SummaryTile label="Total Earnings" value={inr(totals.totalEarnings)} tone="bg-brand-50 text-brand-700 border-brand-100" />
              <SummaryTile label="Total Deductions" value={inr(totals.totalDeductions)} tone="bg-rose-50 text-rose-700 border-rose-100" />
              <SummaryTile label="Employer Contribution" value={inr(totals.employerContribution)} tone="bg-slate-50 text-slate-700 border-slate-150" />
              <SummaryTile label="Net Salary" value={inr(totals.netSalary)} tone={totals.netSalary < 0 ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'} strong />
              <SummaryTile label="CTC" value={inr(totals.ctcImpact)} tone="bg-indigo-50 text-indigo-700 border-indigo-100" />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Net Salary = Total Earnings − Total Deductions · CTC = Gross + Employer Contribution.</p>
          </section>
        </>
      )}
    </div>
  );
};

export default PayrollWorksheet;
