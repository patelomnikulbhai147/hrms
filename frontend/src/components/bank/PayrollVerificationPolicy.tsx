import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw, AlertTriangle, Info, Lock } from 'lucide-react';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';

interface Props {
  /**
   * The caller's role, when the surrounding screen knows it. Used only to label
   * the control — the real gate is server-side (POST /api/bank/payroll-policy
   * rejects anyone who is not a Company Head or Super Admin), so a wrong guess
   * here can never grant access it shouldn't.
   */
  role?: string | null;
}

const LEADERSHIP = ['Super Admin', 'Company Head'];

/**
 * §12 — Payroll protection policy.
 *
 * When on, payroll requires a VERIFIED bank account before salary transfer. It is
 * off by default and only a Company Head or Super Admin can change it: it can
 * block a payroll run, so it is not an HR-level switch.
 *
 * Turning it on never rewrites payroll data — it sets a policy that payroll reads.
 */
export const PayrollVerificationPolicy: React.FC<Props> = ({ role }) => {
  // With no role supplied the control stays enabled and the server decides; the
  // alternative — disabling it for everyone — would hide the setting from the
  // very people entitled to change it.
  const canEdit = role == null ? true : LEADERSHIP.includes(String(role));

  const [enabled, setEnabled] = useState(false);
  const [unverified, setUnverified] = useState<number | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState((prev) => (prev === 'ready' ? prev : 'loading'));
    try {
      const res: any = await api.bank.payrollPolicy();
      const data = res?.data;
      if (!data) throw new Error('The payroll verification policy could not be read.');
      setEnabled(!!data.requireVerifiedBankForPayroll);
      setUnverified(typeof data.unverifiedActiveEmployees === 'number' ? data.unverifiedActiveEmployees : null);
      setError('');
      setState('ready');
    } catch (err: any) {
      setError(err?.message || 'Could not load the payroll verification policy.');
      setState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    const next = !enabled;

    // Switching this ON can stop a salary transfer, so the count of employees it
    // would block is stated before it is enabled, not discovered on payday.
    if (next) {
      const confirmed = await ui.confirm({
        title: 'Require verified bank accounts for payroll?',
        message:
          unverified && unverified > 0
            ? `${unverified} active employee${unverified === 1 ? '' : 's'} currently ${unverified === 1 ? 'does' : 'do'} not have a verified bank account. Once this is on, payroll will warn before salary transfer for those employees. Continue?`
            : 'Payroll will require a verified bank account before salary transfer. Continue?',
        confirmText: 'Enable requirement',
        variant: 'primary',
      });
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      await api.bank.savePayrollPolicy(next);
      setEnabled(next);
      ui.toast.success(next ? 'Payroll now requires a verified bank account.' : 'Payroll verification requirement turned off.');
      load();
    } catch (err: any) {
      ui.toast.error(err?.message || 'Could not save the payroll verification policy.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Require verified bank account for payroll</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed max-w-xl">
              When enabled, payroll warns before transferring salary to an employee whose bank account has not been
              verified. Existing payroll records are never altered by this setting.
            </p>

            {state === 'ready' && unverified != null && (
              <p
                className={`text-[11.5px] font-semibold mt-2 inline-flex items-center gap-1.5 ${
                  unverified > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {unverified > 0 ? <AlertTriangle className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
                {unverified > 0
                  ? `${unverified} active employee${unverified === 1 ? '' : 's'} without a verified bank account`
                  : 'All active employees have a verified bank account'}
              </p>
            )}

            {state === 'error' && (
              <p className="text-[11.5px] font-semibold text-amber-700 dark:text-amber-400 mt-2 inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
                <button type="button" onClick={load} className="underline underline-offset-2 ml-1">Retry</button>
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2.5">
          {state === 'loading' ? (
            <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
          ) : (
            <>
              {!canEdit && (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <Lock className="w-3 h-3" /> Leadership only
                </span>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label="Require verified bank account for payroll"
                disabled={!canEdit || saving || state !== 'ready'}
                onClick={toggle}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  enabled ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
                    enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                  style={{ height: 18, width: 18 }}
                />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayrollVerificationPolicy;
