import React, { useState } from 'react';
import {
  RefreshCw, CheckCircle2, Loader2, AlertTriangle, XCircle,
  CalendarClock, CalendarCheck, Wallet, ChevronDown, ChevronUp, ArrowRight,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

/**
 * SyncAttendanceModal — the single-action "Synchronize Attendance → Payroll"
 * experience. It renders three phases of ONE logical operation:
 *   1. Progress   — a live stepper while the combined sync call runs.
 *   2. Success    — a summary (employees / working / present / payable / LOP).
 *   3. Partial    — "N synced · M failed" with an expandable failure list, when
 *                   some employees failed (the backend continues past failures).
 * It is purely presentational: the orchestration (validate → sync → recalc →
 * write → refresh) lives in the Payroll page and drives `phase`/`result`/`error`.
 */

export interface SyncResult {
  processed: number;
  synced: number;
  failed: number;
  failures: { employeeId: number | string; employeeName: string; department?: string | null; reason: string }[];
  workingDays: number;
  present: number;
  payableDays: number;
  lop: number;
}

interface Props {
  open: boolean;
  /** 0-based index of the currently-running step (steps below); >= steps.length = done. */
  phase: number;
  result: SyncResult | null;
  error: string | null;
  monthLabel: string;
  onClose: () => void;
  /** Optional: open the full-page detailed attendance report. */
  onViewDetailedReport?: () => void;
  /** Live server-side progress (employees processed / total), when available. */
  progress?: { processed: number; total: number } | null;
  /** Cancel the in-flight run — the server stops dispatching new employees. */
  onCancel?: () => void;
  cancelling?: boolean;
  /** Set when the server confirmed the run was cancelled. */
  cancelled?: { attempted: number; total: number } | null;
}

// The visible steps of the combined operation. The single backend call performs
// all of them atomically; the stepper advances through the compute phases while
// the request is in flight, then completes when payroll has been refreshed.
export const SYNC_STEPS = [
  'Fetching attendance',
  'Calculating payable days',
  'Calculating overtime',
  'Calculating LOP',
  'Writing to payroll',
  'Refreshing payroll records',
];

const num = (n: number) => (Number(n) || 0).toLocaleString('en-IN');
const num1 = (n: number) => (Number(n) || 0).toFixed(1);

export const SyncAttendanceModal: React.FC<Props> = ({
  open, phase, result, error, monthLabel, onClose, onViewDetailedReport,
  progress, onCancel, cancelling, cancelled,
}) => {
  const [showFailures, setShowFailures] = useState(false);
  const done = !!result;
  const running = !done && !error && !cancelled;
  const partial = !!result && result.failed > 0;

  const footer = running ? (
    <div className="flex w-full items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-[12px] font-semibold text-ink-secondary">
        <Loader2 size={14} className="animate-spin text-brand-600" />
        {cancelling ? 'Cancelling — finishing the current employee…' : 'Synchronization in progress.'}
      </span>
      {onCancel && (
        <Button size="sm" variant="outline" onClick={onCancel} disabled={!!cancelling}>
          {cancelling ? 'Cancelling…' : 'Cancel'}
        </Button>
      )}
    </div>
  ) : (
    <div className="flex w-full items-center justify-between gap-2">
      {onViewDetailedReport && done ? (
        <button
          onClick={onViewDetailedReport}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:text-brand-800 transition-colors"
        >
          View detailed report <ArrowRight size={13} />
        </button>
      ) : <span />}
      <Button size="sm" onClick={onClose}>Done</Button>
    </div>
  );

  return (
    <Modal
      open={open}
      // While running, X routes to Cancel (a real server-side cancel) instead of
      // silently hiding a still-running job; once finished/cancelled it closes.
      onClose={running ? (onCancel || (() => {})) : onClose}
      title="Synchronize Attendance to Payroll"
      size="md"
      footer={footer}
    >
      <div className="space-y-4">
        {/* ── Progress stepper ─────────────────────────────────────────── */}
        {running && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw size={16} className="text-brand-600 animate-spin" />
              <p className="text-[14px] font-bold text-ink">Synchronizing attendance…</p>
            </div>
            <ul className="space-y-2">
              {SYNC_STEPS.map((label, i) => {
                const state = i < phase ? 'done' : i === phase ? 'active' : 'pending';
                return (
                  <li key={label} className="flex items-center gap-2.5 text-[13px]">
                    {state === 'done' ? (
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                    ) : state === 'active' ? (
                      <Loader2 size={16} className="text-brand-600 animate-spin shrink-0" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-200" />
                    )}
                    <span className={
                      state === 'done' ? 'font-semibold text-emerald-700'
                        : state === 'active' ? 'font-semibold text-ink'
                          : 'text-ink-muted'
                    }>{label}</span>
                  </li>
                );
              })}
            </ul>
            {progress && progress.total > 0 && (
              <div className="mt-3">
                <p className="text-[12px] font-bold text-ink tabular-nums">
                  Employees processed: {progress.processed.toLocaleString('en-IN')} / {progress.total.toLocaleString('en-IN')}
                </p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all"
                    style={{ width: `${Math.min(100, Math.round((progress.processed / progress.total) * 100))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Cancelled ────────────────────────────────────────────────── */}
        {cancelled && !result && (
          <div className="rounded-card border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={22} className="text-amber-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-amber-800">Synchronization cancelled.</p>
                <p className="mt-1 text-[13px] text-amber-700">
                  {cancelled.attempted} of {cancelled.total} employee(s) were synchronized before cancellation.
                  Each employee is written atomically, so no payroll record was corrupted.
                </p>
                <p className="mt-2 text-[12px] text-amber-600">
                  Run Synchronize Attendance again to complete the remaining employees — re-running updates, never duplicates.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && !result && (
          <div className="rounded-card border border-rose-200 bg-rose-50 p-4">
            <div className="flex items-start gap-3">
              <XCircle size={22} className="text-rose-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-rose-800">Synchronization failed</p>
                <p className="mt-1 text-[13px] text-rose-700 break-words">{error}</p>
                <p className="mt-2 text-[12px] text-rose-600">No payroll values were changed. Please retry.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Success / partial summary ────────────────────────────────── */}
        {result && (
          <div className="space-y-4">
            <div className={`rounded-card border p-4 ${partial ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-start gap-3">
                {partial
                  ? <AlertTriangle size={22} className="text-amber-500 shrink-0" />
                  : <CheckCircle2 size={22} className="text-emerald-500 shrink-0" />}
                <div className="min-w-0">
                  <p className={`text-[14px] font-bold ${partial ? 'text-amber-800' : 'text-emerald-800'}`}>
                    {partial ? 'Attendance synchronized with some errors.' : 'Attendance synchronized successfully.'}
                  </p>
                  <p className={`mt-0.5 text-[12px] font-semibold ${partial ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {result.processed} employee(s) processed
                    {partial && <> · {result.synced} successful · {result.failed} failed</>}
                    {' · '}{monthLabel}
                  </p>
                </div>
              </div>
            </div>

            {/* Live totals from the synchronized snapshot (fully DB-driven). */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Metric icon={<CalendarClock size={15} />} label="Working Days" value={num(result.workingDays)} tint="bg-indigo-50 text-indigo-600" />
              <Metric icon={<CalendarCheck size={15} />} label="Present Days" value={num(result.present)} tint="bg-emerald-50 text-emerald-600" />
              <Metric icon={<CheckCircle2 size={15} />} label="Payable Days" value={num1(result.payableDays)} tint="bg-teal-50 text-teal-600" />
              <Metric icon={<Wallet size={15} />} label="LOP Days" value={num(result.lop)} tint="bg-rose-50 text-rose-600" />
            </div>

            <p className="text-[13px] font-semibold text-ink text-center">
              Payroll updated successfully.
            </p>

            {/* Failed employees — expandable "View Details". */}
            {partial && (
              <div className="rounded-card border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setShowFailures(s => !s)}
                  className="flex w-full items-center justify-between gap-2 bg-slate-50 px-3 py-2.5 text-[12px] font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle size={13} className="text-amber-500" />
                    {result.failed} employee(s) could not be synchronized
                  </span>
                  {showFailures ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {showFailures && (
                  <ul className="max-h-44 divide-y divide-slate-100 overflow-y-auto">
                    {result.failures.map((f, i) => (
                      <li key={`${f.employeeId}-${i}`} className="px-3 py-2 text-[12px]">
                        <p className="font-semibold text-ink truncate">
                          {f.employeeName}
                          {f.department ? <span className="text-ink-muted font-normal"> · {f.department}</span> : null}
                        </p>
                        <p className="text-rose-600 truncate" title={f.reason}>{f.reason}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: string; tint: string }> = ({ icon, label, value, tint }) => (
  <div className="rounded-card border border-slate-100 bg-white p-2.5 text-center">
    <span className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg ${tint}`}>{icon}</span>
    <p className="text-[16px] font-bold text-ink tabular-nums leading-none">{value}</p>
    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
  </div>
);
