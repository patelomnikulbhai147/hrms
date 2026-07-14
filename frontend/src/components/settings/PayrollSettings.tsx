import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { formatDateTime } from '@/utils/formatDate';
import {
  CalendarClock, Lock, Wallet, Palmtree, History, Save, RotateCcw, Info, ShieldAlert, CheckCircle2,
} from 'lucide-react';
import {
  loadPayrollSettings, savePayrollSettings, loadSettingsHistory, isReadyToLock, ordinal, lockDayLabel, totalAbsencePool,
  type PayrollSettingsData, type LeavePolicy, type SettingsAuditEntry,
} from '@/utils/payrollSettings';

interface Props {
  companyId: any;
  canEdit: boolean;      // Super Admin / Company Head → edit; HR → read-only
  performedBy: string;   // actor label for the audit history
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const dayOptions = DAYS.map((d) => ({ value: String(d), label: ordinal(d) }));
const lockDayOptions = [...dayOptions, { value: 'last', label: 'Last Day of Month' }];

const LEAVE_FIELDS: Array<[keyof LeavePolicy, string]> = [
  ['annual', 'Annual Leave'], ['casual', 'Casual Leave'], ['sick', 'Sick Leave'], ['paid', 'Paid Leave'],
  ['earned', 'Earned Leave'], ['compOff', 'Comp Off'], ['optional', 'Optional Leave'], ['lop', 'LOP'],
];

/**
 * Payroll Settings — the payroll SCHEDULE + leave POLICY configuration for a
 * company (Settings → Payroll Settings). Configuration only: it changes no
 * payroll/attendance/leave calculation, no API and no schema. It persists per
 * company, records a change history (who / old → new / when) and broadcasts a
 * refresh event so open screens update without a manual reload.
 */
export const PayrollSettings: React.FC<Props> = ({ companyId, canEdit, performedBy }) => {
  const [form, setForm] = useState<PayrollSettingsData>(() => loadPayrollSettings(companyId));
  const [saved, setSaved] = useState<PayrollSettingsData>(form);
  const [history, setHistory] = useState<SettingsAuditEntry[]>(() => loadSettingsHistory(companyId));
  const [busy, setBusy] = useState(false);

  // Reload when the active workspace changes.
  useEffect(() => {
    const s = loadPayrollSettings(companyId);
    setForm(s); setSaved(s); setHistory(loadSettingsHistory(companyId));
  }, [companyId]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const set = <K extends keyof PayrollSettingsData>(k: K, v: PayrollSettingsData[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setLeave = (k: keyof LeavePolicy, v: number) => setForm((f) => ({ ...f, leavePolicy: { ...f.leavePolicy, [k]: v } }));

  const readyToLock = useMemo(() => isReadyToLock(form, new Date()), [form]);

  const save = () => {
    if (!canEdit || !dirty) return;
    setBusy(true);
    try {
      const entries = savePayrollSettings(companyId, form, performedBy, new Date().toISOString());
      setSaved(form);
      setHistory((h) => [...entries, ...h].slice(0, 100));
      ui.toast.success(
        entries.length
          ? `Payroll settings saved — ${entries.length} change(s) recorded. Future payroll follows the new schedule.`
          : 'Payroll settings saved.'
      );
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not save payroll settings.');
    } finally { setBusy(false); }
  };

  const reset = () => setForm(saved);

  return (
    <div className="space-y-3 font-sans">
      {!canEdit && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          <span>You have <b>read-only</b> access to Payroll Settings. Only a Company Head or Super Admin can change them.</span>
        </div>
      )}

      {/* ── Payroll Schedule ─────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2 mb-1 pb-2 border-b border-slate-100">
          <CalendarClock size={16} className="text-brand-600" />
          <h3 className="text-sm font-bold text-slate-800">Payroll Schedule</h3>
        </div>
        <p className="text-xs text-slate-500 mb-3">When each month's payroll opens, closes, locks and pays out. Applies to future payroll cycles.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[12px] font-semibold text-slate-600 mb-1.5 block">Payroll Lock Day</label>
            <Select value={String(form.lockDay)} disabled={!canEdit}
              onChange={(e: any) => set('lockDay', e.target.value === 'last' ? 'last' : Number(e.target.value))}
              options={lockDayOptions} />
            <p className="text-[11px] text-slate-400 mt-1">Payroll becomes ready to lock on this day.</p>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-slate-600 mb-1.5 block">Payroll Start Day</label>
            <Select value={String(form.periodStartDay)} disabled={!canEdit}
              onChange={(e: any) => set('periodStartDay', Number(e.target.value))} options={dayOptions} />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-slate-600 mb-1.5 block">Payroll End Day</label>
            <Select value={String(form.periodEndDay)} disabled={!canEdit}
              onChange={(e: any) => set('periodEndDay', Number(e.target.value))} options={dayOptions} />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-slate-600 mb-1.5 block">Salary Payment Day</label>
            <Select value={String(form.salaryPaymentDay)} disabled={!canEdit}
              onChange={(e: any) => set('salaryPaymentDay', Number(e.target.value))} options={dayOptions} />
          </div>

          {/* Auto-lock toggle */}
          <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <Lock size={15} className="text-slate-500" />
              <div>
                <p className="text-[12px] font-semibold text-slate-700">Automatically Lock Payroll</p>
                <p className="text-[11px] text-slate-400">{form.autoLock ? `On — locks on the ${lockDayLabel(form.lockDay)}.` : 'Off — the Company Head locks manually.'}</p>
              </div>
            </div>
            <button type="button" role="switch" aria-checked={form.autoLock} disabled={!canEdit}
              onClick={() => canEdit && set('autoLock', !form.autoLock)}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.autoLock ? 'bg-brand-500' : 'bg-slate-300'} ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.autoLock ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        {/* Schedule summary */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 font-semibold">
            <CalendarClock size={12} /> Period {ordinal(form.periodStartDay)} → {ordinal(form.periodEndDay)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 font-semibold">
            <Wallet size={12} /> Paid on the {ordinal(form.salaryPaymentDay)}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold border ${readyToLock ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
            <Lock size={12} /> Locks on the {lockDayLabel(form.lockDay)} {readyToLock ? '· ready now' : ''}
          </span>
        </div>
      </Card>

      {/* ── Leave Policy ─────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Palmtree size={16} className="text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800">Leave Policy</h3>
            <span className="text-[11px] text-slate-400">Single source of truth — annual entitlement (days) per type.</span>
          </div>
          {/* Total Allowed Absence Pool updates live as you edit (excludes LOP). */}
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
            Total Allowed Absence Pool: {totalAbsencePool(form.leavePolicy)} days
          </span>
        </div>

        {/* Responsive grid — Annual · Casual · Sick · Paid / Earned · Comp Off · Optional · LOP */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {LEAVE_FIELDS.map(([k, label]) => (
            <div key={k}>
              <label className="text-[11px] font-semibold text-slate-600 mb-1 block">{label}</label>
              <Input type="number" min={0} max={365} value={String(form.leavePolicy[k])} disabled={!canEdit}
                onChange={(e) => setLeave(k, Math.max(0, Math.min(365, Number(e.target.value) || 0)))} />
            </div>
          ))}
        </div>

        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] text-blue-700">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>Saving broadcasts a live refresh so open Leave, Payroll, Attendance, Dashboard &amp; Report screens pick up the new policy without a manual reload. Existing calculations are unchanged.</span>
        </div>
      </Card>

      {/* Actions */}
      {canEdit && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={reset} disabled={!dirty || busy}><RotateCcw size={14} className="mr-1.5" /> Reset</Button>
          <Button onClick={save} loading={busy} disabled={!dirty}><Save size={14} className="mr-1.5" /> Save Settings</Button>
        </div>
      )}

      {/* ── Change History (audit) ───────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2 mb-1 pb-2 border-b border-slate-100">
          <History size={16} className="text-slate-500" />
          <h3 className="text-sm font-bold text-slate-800">Change History</h3>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">No changes recorded yet. Saved changes appear here with who changed what, and when.</p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {history.map((h) => (
              <div key={h.id} className="flex items-start gap-3 py-2.5">
                <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-slate-700">
                    <span className="font-semibold">{h.label}</span>{' '}
                    <span className="text-slate-400">changed from</span>{' '}
                    <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[11px]">{h.oldValue}</span>{' '}
                    <span className="text-slate-400">to</span>{' '}
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold">{h.newValue}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">by {h.by} · {formatDateTime(h.at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default PayrollSettings;
