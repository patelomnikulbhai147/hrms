import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { Wallet, TrendingUp, TrendingDown, Building2, AlertTriangle, RefreshCw } from 'lucide-react';

// Field definitions — label order matches the enterprise salary-worksheet spec.
const EARNINGS: [string, string][] = [
  ['basic', 'Basic'], ['hra', 'HRA'], ['da', 'DA'], ['conveyance', 'Conveyance'], ['medical', 'Medical Allowance'],
  ['specialAllowance', 'Special Allowance'], ['educationAllowance', 'Education Allowance'], ['washingAllowance', 'Washing Allowance'],
  ['bonus', 'Bonus'], ['incentive', 'Incentive'], ['overtime', 'Overtime'], ['arrears', 'Arrears'], ['otherEarnings', 'Other Earnings'],
];
const DEDUCTIONS: [string, string][] = [
  ['pf', 'PF'], ['eps', 'EPS'], ['vpf', 'VPF'], ['esi', 'ESI'], ['professionalTax', 'Professional Tax'], ['tds', 'TDS'],
  ['lwf', 'Labour Welfare Fund'], ['advanceRecovery', 'Advance Recovery'], ['loanRecovery', 'Loan Recovery'], ['insurance', 'Insurance'], ['otherDeductions', 'Other Deductions'],
];
const EMPLOYER: [string, string][] = [['employerPf', 'Employer PF'], ['employerEsi', 'Employer ESI']];
const ALL_KEYS = [...EARNINGS, ...DEDUCTIONS, ...EMPLOYER].map(([k]) => k);

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

const AttCell: React.FC<{ label: string; value: any; tone?: string }> = ({ label, value, tone = 'text-slate-800' }) => (
  <div className="rounded-lg border border-slate-150 bg-white px-2 py-1.5 text-center">
    <p className="text-[8.5px] font-bold uppercase tracking-wide text-slate-400 leading-tight">{label}</p>
    <p className={`text-sm font-extrabold ${tone}`}>{value ?? 0}</p>
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
          className="w-24 bg-transparent px-1 py-1 text-[11px] text-right font-semibold text-slate-800 outline-none disabled:text-slate-500" />
      </div>
    </div>
  );
});

interface Props {
  open: boolean;
  payrollId: string | number | null;
  canEdit?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const PayrollWorksheet: React.FC<Props> = ({ open, payrollId, canEdit = false, onClose, onSaved }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  useEffect(() => {
    if (!open || !payrollId) return;
    setLoading(true); setError(''); setOkMsg(''); setData(null);
    api.payroll.worksheet.get(payrollId)
      .then((res: any) => {
        setData(res);
        const f: Record<string, string> = {};
        for (const k of ALL_KEYS) f[k] = String(res.worksheet?.[k] ?? 0);
        setForm(f);
      })
      .catch((e: any) => setError(e?.message || 'Could not load the salary worksheet.'))
      .finally(() => setLoading(false));
  }, [open, payrollId]);

  const editable = !!canEdit && !!data?.meta?.editable;

  // Stable identity so React.memo'd rows only re-render when their own value changes.
  const setField = useCallback((k: string, v: string) => { setForm(p => ({ ...p, [k]: v })); setOkMsg(''); }, []);

  // ── Live recalculation engine ──
  const totals = useMemo(() => {
    const totalEarnings = EARNINGS.reduce((s, [k]) => s + n(form[k]), 0);
    const totalDeductions = DEDUCTIONS.reduce((s, [k]) => s + n(form[k]), 0);
    const grossSalary = totalEarnings;
    const netSalary = totalEarnings - totalDeductions;
    const ctcImpact = grossSalary + n(form.employerPf) + n(form.employerEsi);
    return { totalEarnings, totalDeductions, grossSalary, netSalary, ctcImpact };
  }, [form]);

  const negativeField = ALL_KEYS.find(k => n(form[k]) < 0);
  const nonNumericField = ALL_KEYS.find(k => { const v = form[k]; return v !== '' && v != null && !/^\d*\.?\d*$/.test(String(v)); });
  const overMaxField = ALL_KEYS.find(k => n(form[k]) > MAX_AMOUNT);
  const invalid = !!negativeField || !!nonNumericField || !!overMaxField || totals.netSalary < 0 || totals.totalEarnings <= 0 || totals.totalDeductions > totals.totalEarnings;
  const invalidReason = nonNumericField ? 'Only numbers and decimal values are allowed.'
    : overMaxField ? `Amount exceeds the maximum allowed (₹${MAX_AMOUNT.toLocaleString('en-IN')}).`
    : negativeField ? 'Values cannot be negative.'
    : totals.totalEarnings <= 0 ? 'Total earnings must be greater than zero.'
    : totals.netSalary < 0 ? 'Net salary cannot be negative.'
    : totals.totalDeductions > totals.totalEarnings ? 'Deductions cannot exceed earnings.'
    : '';

  const save = async () => {
    if (!payrollId || invalid) return;
    setSaving(true); setError('');
    try {
      const earnings: any = {}, deductions: any = {}, employer: any = {};
      EARNINGS.forEach(([k]) => earnings[k] = n(form[k]));
      DEDUCTIONS.forEach(([k]) => deductions[k] = n(form[k]));
      EMPLOYER.forEach(([k]) => employer[k] = n(form[k]));
      await api.payroll.worksheet.save(payrollId, { earnings, deductions, employer });
      setOkMsg('Saved. Payroll, payslip, register and reports updated.');
      onSaved?.();
      setTimeout(() => onClose(), 600);
    } catch (e: any) { setError(e?.message || 'Save failed.'); }
    finally { setSaving(false); }
  };

  const emp = data?.employee || {};
  const att = data?.attendance || {};

  return (
    <Modal open={open} onClose={onClose} title="Salary Worksheet" size="xl"
      footer={
        <div className="w-full">
          {/* ── Sticky payroll summary — Gross, Deductions, Net (final payable) ── */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl bg-indigo-50 px-3 py-2 text-indigo-700">
              <p className="text-[9px] font-bold uppercase tracking-wide opacity-80 leading-tight">Gross Salary</p>
              <p className="text-base font-black font-mono leading-tight">{inr(totals.grossSalary)}</p>
            </div>
            <div className="rounded-xl bg-rose-50 px-3 py-2 text-rose-700">
              <p className="text-[9px] font-bold uppercase tracking-wide opacity-80 leading-tight">Total Deductions</p>
              <p className="text-base font-black font-mono leading-tight">{inr(totals.totalDeductions)}</p>
            </div>
            <div className="rounded-xl bg-emerald-100 px-3 py-2 text-emerald-800 ring-2 ring-emerald-400 shadow-sm">
              <p className="text-[9px] font-extrabold uppercase tracking-wide leading-tight">Net Salary · Payable</p>
              <p className="text-lg font-black font-mono leading-tight">{inr(totals.netSalary)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold">
              {invalid ? <span className="text-rose-600 flex items-center gap-1"><AlertTriangle size={12} /> {invalidReason}</span>
                : okMsg ? <span className="text-emerald-600">{okMsg}</span>
                : error ? <span className="text-rose-600">{error}</span>
                : !editable ? <span className="text-amber-600">{data?.meta?.locked ? 'Locked / paid — read only.' : 'You do not have edit access.'}</span>
                : <span className="text-slate-400">Net = Total Earnings − Total Deductions.</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
              {editable && <Button size="sm" loading={saving} disabled={invalid} onClick={save}>Save Worksheet</Button>}
            </div>
          </div>
        </div>
      }>
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Loading worksheet…</div>
      ) : !data ? (
        <div className="py-16 text-center text-xs text-rose-500">{error || 'No data.'}</div>
      ) : (
        <div className="space-y-4">
          {data.meta?.isOutdated && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
              <RefreshCw size={13} /> Attendance changed after this payroll was generated — recalculate from the payroll list to refresh attendance-driven figures.
            </div>
          )}

          {/* ── Employee Information ── */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Employee Information</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-slate-150 bg-slate-50/60 p-3 sm:grid-cols-4">
              <InfoCell label="Employee ID" value={emp.employeeCode} />
              <InfoCell label="Name" value={emp.name} />
              <InfoCell label="Branch" value={emp.branch} />
              <InfoCell label="Department" value={emp.department} />
              <InfoCell label="Designation" value={emp.designation} />
              <InfoCell label="UAN" value={emp.uan} />
              <InfoCell label="ESIC Number" value={emp.esic} />
              <InfoCell label="Payroll Month" value={emp.payrollMonth} />
            </div>
          </div>

          {/* ── Attendance (read-only — managed in the Attendance module) ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Attendance</p>
              <span className="text-[9px] text-slate-400">Source: Attendance module (read-only)</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {/* Mandatory cards always show; the rest appear only when their value > 0. */}
              {([
                { label: 'Month Days', value: att.monthDays, always: true },
                { label: 'Working Days', value: att.workingDays, always: true },
                { label: 'Present', value: att.present, always: true, tone: 'text-emerald-600' },
                { label: 'Weekly Off', value: att.weeklyOff },
                { label: 'Holidays', value: att.holidays },
                { label: 'Absent', value: att.absent, tone: 'text-rose-600' },
                { label: 'CL', value: att.cl },
                { label: 'SL', value: att.sl },
                { label: 'PL', value: att.pl },
                { label: 'Half Days', value: att.halfDays },
                { label: 'LOP', value: att.lop, tone: 'text-rose-600' },
                { label: 'OT Hours', value: att.otHours, tone: 'text-blue-600' },
                { label: 'Payable Days', value: att.payableDays, always: true, tone: 'text-indigo-600' },
              ] as { label: string; value: any; always?: boolean; tone?: string }[])
                .filter(c => c.always || n(c.value) > 0)
                .map(c => <AttCell key={c.label} label={c.label} value={c.value} tone={c.tone} />)}
            </div>
          </div>

          {/* ── Earnings | Deductions ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-150 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-blue-700 mb-2"><TrendingUp size={13} /> Earnings</p>
              <div className="divide-y divide-slate-50">
                {EARNINGS.map(([k, label]) => <MoneyRow key={k} k={k} label={label} value={form[k]} editable={editable} onChange={setField} />)}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-xs font-bold text-blue-800">
                <span>Total Earnings</span><span className="font-mono">{inr(totals.totalEarnings)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-150 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 mb-2"><TrendingDown size={13} /> Deductions</p>
              <div className="divide-y divide-slate-50">
                {DEDUCTIONS.map(([k, label]) => <MoneyRow key={k} k={k} label={label} value={form[k]} editable={editable} onChange={setField} />)}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-xs font-bold text-rose-800">
                <span>Total Deductions</span><span className="font-mono">{inr(totals.totalDeductions)}</span>
              </div>

              <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mt-3 mb-1"><Building2 size={13} /> Employer Contributions <span className="font-normal text-slate-400">(CTC only)</span></p>
              <div className="divide-y divide-slate-50">
                {EMPLOYER.map(([k, label]) => <MoneyRow key={k} k={k} label={label} value={form[k]} editable={editable} onChange={setField} />)}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-[11px] font-bold text-emerald-700">
                <span>Net Salary <span className="font-normal text-slate-400">(Payable Salary)</span></span><span className="font-mono">{inr(totals.netSalary)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default PayrollWorksheet;
