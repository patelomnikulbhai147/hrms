import React, { useState } from 'react';
import {
  ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Clock, User,
  Landmark, Copy, Download, Printer, FileJson, RefreshCw, ChevronDown,
  Terminal, ArrowDown, Info,
} from 'lucide-react';
import { ui } from '@/components/ui/feedback';
import { formatDateTime } from '@/utils/formatDate';
import {
  VerificationView, buildTimeline, maskAccount, nameMatchLabel, nameMatchTone,
  orNA, statusLabel, statusTone,
} from './bankVerification';
import {
  copyText, downloadVerificationPdf, exportVerificationJson, printVerificationReport,
} from './bankVerificationExport';

interface Props {
  view: VerificationView;
  companyName?: string | null;
  /** Rendered as the Reverify action when supplied (§11). */
  onReverify?: () => void;
  reverifying?: boolean;
  /** Hides the timeline + technical panel for tight embeds (e.g. a profile card). */
  compact?: boolean;
}

/** Tone → the exact classes used across the module, so colour never drifts. */
const TONE = {
  green: {
    border: 'border-emerald-300 dark:border-emerald-700',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-800 dark:text-emerald-200',
    chipBg: 'bg-emerald-600',
    icon: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  amber: {
    border: 'border-amber-300 dark:border-amber-700',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-900 dark:text-amber-200',
    chipBg: 'bg-amber-600',
    icon: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  red: {
    border: 'border-red-300 dark:border-red-800',
    bg: 'bg-red-50 dark:bg-red-950/40',
    text: 'text-red-800 dark:text-red-200',
    chipBg: 'bg-red-600',
    icon: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
  },
  slate: {
    border: 'border-slate-300 dark:border-slate-700',
    bg: 'bg-slate-50 dark:bg-slate-900/60',
    text: 'text-slate-700 dark:text-slate-300',
    chipBg: 'bg-slate-600',
    icon: 'text-slate-500 dark:text-slate-400',
    dot: 'bg-slate-400',
  },
} as const;

const CARD = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm';
const SECTION_TITLE = 'text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400';
const LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const VALUE = 'text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 break-words';

/** A label/value pair. Never renders an empty cell — absent values read "N/A" (§3). */
const Field: React.FC<{ label: string; value?: unknown; mono?: boolean; title?: string }> = ({ label, value, mono, title }) => {
  const text = orNA(value);
  const missing = text === 'N/A';
  return (
    <div className="min-w-0">
      <span className={`${LABEL} block mb-1`}>{label}</span>
      <p
        className={`${VALUE} ${mono && !missing ? 'font-mono' : ''} ${missing ? 'text-slate-400 dark:text-slate-500 font-medium' : ''}`}
        title={title || (missing ? undefined : text)}
      >
        {text}
      </p>
    </div>
  );
};

const SectionCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}> = ({ title, icon, subtitle, children, action }) => (
  <div className={`${CARD} p-5`}>
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-slate-400 dark:text-slate-500 shrink-0">{icon}</span>
        <div className="min-w-0">
          <h4 className={SECTION_TITLE}>{title}</h4>
          {subtitle && <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
    {children}
  </div>
);

const CopyButton: React.FC<{ value?: string | null; label: string }> = ({ value, label }) => {
  const disabled = !value;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async () => {
        const ok = await copyText(value);
        if (ok) ui.toast.success(`${label} copied`);
        else ui.toast.error(`Could not copy the ${label.toLowerCase()}`);
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <Copy className="w-3.5 h-3.5" /> {label}
    </button>
  );
};

export const BankVerificationReport: React.FC<Props> = ({ view, companyName, onReverify, reverifying, compact }) => {
  const [showRaw, setShowRaw] = useState<'request' | 'response' | null>(null);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [busy, setBusy] = useState<'pdf' | null>(null);

  const tone = TONE[statusTone(view.status)];
  const matchTone = TONE[nameMatchTone(view.nameMatchResult)];
  const timeline = buildTimeline(view);

  const StatusIcon = view.verified ? ShieldCheck : statusTone(view.status) === 'red' ? XCircle : AlertTriangle;

  const handlePdf = async () => {
    setBusy('pdf');
    try {
      await downloadVerificationPdf(view, companyName);
      ui.toast.success('Verification report downloaded');
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not generate the PDF report.');
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = () => {
    const opened = printVerificationReport(view, companyName);
    if (!opened) ui.toast.error('The print window was blocked by the browser. Allow pop-ups for this site and try again.');
  };

  return (
    <div className="space-y-4">
      {/* ── 1. Verification summary ─────────────────────────────────────── */}
      <div className={`rounded-2xl border ${tone.border} ${tone.bg} p-5 lg:p-6 shadow-sm`}>
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-current/10">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className={`w-11 h-11 rounded-xl bg-white/70 dark:bg-black/20 border ${tone.border} flex items-center justify-center shrink-0`}>
              <StatusIcon className={`w-[22px] h-[22px] ${tone.icon}`} />
            </div>
            <div className="min-w-0">
              <h3 className={`text-[18px] font-bold tracking-tight ${tone.text}`}>
                {view.verified ? 'Bank Account Verified' : `Verification ${statusLabel(view.status)}`}
              </h3>
              <p className={`text-[12.5px] font-medium mt-0.5 ${tone.text} opacity-80`}>
                {view.verified
                  ? `Validated by ${view.verificationSource || view.provider || 'the verification provider'}`
                  : view.errorMessage || view.verificationMessage || 'This account could not be validated.'}
              </p>
            </div>
          </div>

          <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white ${tone.chipBg} rounded-full px-3.5 py-1.5 shadow-sm shrink-0`}>
            {view.verified ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-2 h-2 rounded-full bg-white/90" />}
            {statusLabel(view.status)}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-5 pt-5">
          <Field label="Verified At" value={view.verifiedAt ? formatDateTime(view.verifiedAt) : null} />
          <Field label="Provider" value={view.verificationSource || view.provider} />
          <Field label="Environment" value={view.environment} />
          <Field label="Reference ID" value={view.referenceId} mono />
          <Field label="Verification ID" value={view.verificationId} mono />
          <Field label="Request ID" value={view.requestId} mono />
          <Field label="API Response Time" value={view.responseTimeMs != null ? `${view.responseTimeMs} ms` : null} />
          <Field label="Verification Cost" value={view.verificationCost != null ? `₹${view.verificationCost}` : null} />
          <Field label="Verified By" value={view.verifiedBy} />
          <Field label="Company" value={companyName || view.companyName} />
          <Field label="Branch" value={view.branchName} />
        </div>

        {/* ── 8. Actions ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 pt-5 mt-5 border-t border-current/10">
          <button
            type="button"
            onClick={handlePdf}
            disabled={busy === 'pdf'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {busy === 'pdf' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download PDF
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Printer className="w-3.5 h-3.5" /> Print Report
          </button>
          <button
            type="button"
            onClick={() => {
              exportVerificationJson(view);
              ui.toast.success('Verification exported as JSON');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <FileJson className="w-3.5 h-3.5" /> Export JSON
          </button>
          <CopyButton value={view.referenceId} label="Copy Reference ID" />
          <CopyButton value={view.verificationId} label="Copy Verification ID" />

          {onReverify && (
            <button
              type="button"
              onClick={onReverify}
              disabled={reverifying}
              className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11.5px] font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-sm disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reverifying ? 'animate-spin' : ''}`} />
              {reverifying ? 'Re-verifying…' : 'Reverify'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ── 2. What HR entered ────────────────────────────────────────── */}
        <SectionCard
          title="Employee Entered Details"
          icon={<User className="w-4 h-4" />}
          subtitle="Exactly as submitted — never overwritten by the bank response."
        >
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <Field label="Employee Name" value={view.entered.employeeName} />
            <Field label="Employee ID" value={view.entered.employeeCode} mono />
            <Field label="Account Number" value={maskAccount(view.entered.accountNumber)} mono />
            <Field label="IFSC Code" value={view.entered.ifsc} mono />
            <Field label="Phone Number" value={view.entered.phone} mono />
            <Field label="Email" value={view.entered.email} />
            <Field label="Branch" value={view.entered.branch} />
            <Field label="Department" value={view.entered.department} />
            <Field label="Designation" value={view.entered.designation} />
          </div>
        </SectionCard>

        {/* ── 3. What the bank returned ─────────────────────────────────── */}
        <SectionCard
          title="Bank Verification Result"
          icon={<Landmark className="w-4 h-4" />}
          subtitle="Every field returned by the verification provider."
        >
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <Field label="Account Holder Name" value={view.accountHolderName} />
            <Field label="Bank Name" value={view.bankName} />
            <Field label="Branch Name" value={view.bankBranch} />
            <Field label="Branch Address" value={view.branchAddress} />
            <Field label="City" value={view.city} />
            <Field label="District" value={view.district} />
            <Field label="State" value={view.state} />
            <Field label="IFSC" value={view.ifsc} mono />
            <Field label="MICR Code" value={view.micr} mono />
            <Field label="SWIFT Code" value={view.swift} mono />
            <Field label="UTR" value={view.utr} mono />
            <Field label="Account Status" value={view.accountStatus} />
            <Field label="Account Status Code" value={view.accountStatusCode} mono />
            <Field label="Verification Source" value={view.verificationSource} />
            <div className="col-span-2">
              <Field label="Verification Message" value={view.verificationMessage || view.errorMessage} />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── 4. Name match ──────────────────────────────────────────────── */}
      <SectionCard
        title="Name Match"
        icon={<ShieldCheck className="w-4 h-4" />}
        subtitle={
          view.nameMatchSource === 'PROVIDER'
            ? 'Verdict supplied by the verification provider.'
            : view.nameMatchSource === 'COMPUTED'
            ? 'Compared by ZeniaHR — the provider returned no verdict.'
            : undefined
        }
      >
        <div className="flex flex-col lg:flex-row lg:items-stretch gap-4">
          <div className="flex-1 flex flex-col sm:flex-row lg:flex-col items-stretch gap-3">
            <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
              <span className={`${LABEL} block mb-1`}>Employee Name (entered)</span>
              <p className={VALUE}>{orNA(view.entered.employeeName)}</p>
            </div>
            <div className="flex items-center justify-center shrink-0">
              <ArrowDown className="w-4 h-4 text-slate-400 rotate-[-90deg] sm:rotate-0 lg:rotate-0" />
            </div>
            <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
              <span className={`${LABEL} block mb-1`}>Bank Account Holder Name</span>
              <p className={VALUE}>{orNA(view.accountHolderName)}</p>
            </div>
          </div>

          <div className={`lg:w-72 shrink-0 rounded-xl border ${matchTone.border} ${matchTone.bg} px-5 py-4 flex flex-col justify-center items-center text-center`}>
            <span className={`${LABEL} mb-1.5`}>Match Result</span>
            <span className={`inline-flex items-center gap-1.5 text-[13px] font-bold ${matchTone.text}`}>
              <span className={`w-2 h-2 rounded-full ${matchTone.dot}`} />
              {nameMatchLabel(view.nameMatchResult)}
            </span>

            {view.nameMatchScore != null ? (
              <>
                <p className={`text-[30px] font-extrabold leading-none mt-3 ${matchTone.text}`}>{view.nameMatchScore}%</p>
                <div
                  className="w-full h-1.5 rounded-full bg-white/70 dark:bg-black/30 mt-2.5 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={view.nameMatchScore}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Name match percentage"
                >
                  <div className={`h-full ${matchTone.dot} rounded-full transition-all`} style={{ width: `${Math.min(100, Math.max(0, view.nameMatchScore))}%` }} />
                </div>
              </>
            ) : (
              <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400 mt-3">
                No match percentage was returned for this verification.
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      {!compact && (
        <>
          {/* ── 5. Timeline ────────────────────────────────────────────── */}
          <SectionCard title="Verification Timeline" icon={<Clock className="w-4 h-4" />}>
            <ol className="relative">
              {timeline.map((step, index) => {
                const stepTone = step.state === 'failed' ? TONE.red : TONE.green;
                const isLast = index === timeline.length - 1;
                return (
                  <li key={step.key} className="relative flex gap-4 pb-5 last:pb-0">
                    {!isLast && (
                      <span className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
                    )}
                    <span
                      className={`relative z-[1] mt-0.5 w-[23px] h-[23px] rounded-full border-2 ${stepTone.border} ${stepTone.bg} flex items-center justify-center shrink-0`}
                    >
                      {step.state === 'failed' ? (
                        <XCircle className={`w-3.5 h-3.5 ${stepTone.icon}`} />
                      ) : (
                        <CheckCircle2 className={`w-3.5 h-3.5 ${stepTone.icon}`} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">{step.label}</p>
                        {step.detail && (
                          <p className="text-[11.5px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 break-words">{step.detail}</p>
                        )}
                      </div>
                      <span className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                        {step.timestamp ? formatDateTime(step.timestamp) : '—'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </SectionCard>

          {/* ── 6. Technical details (privileged roles only) ───────────── */}
          {view.permissions?.canSeeTechnical && (
            <div className={CARD}>
              <button
                type="button"
                onClick={() => setTechnicalOpen((v) => !v)}
                aria-expanded={technicalOpen}
                className="w-full flex items-center justify-between gap-3 p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-2xl"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Terminal className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span className="min-w-0">
                    <span className={`${SECTION_TITLE} block`}>Technical Details</span>
                    <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
                      Administrator view — API credentials are never included.
                    </span>
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${technicalOpen ? 'rotate-180' : ''}`} />
              </button>

              {technicalOpen && (
                <div className="px-5 pb-5 space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <Field label="Provider" value={view.provider} />
                    <Field label="Environment" value={view.environment} />
                    <Field label="API Latency" value={view.responseTimeMs != null ? `${view.responseTimeMs} ms` : null} />
                    <Field label="Response Code" value={view.httpStatus} mono />
                    <Field label="Request ID" value={view.requestId} mono />
                    <Field label="Reference ID" value={view.referenceId} mono />
                    <Field label="Verification ID" value={view.verificationId} mono />
                    <Field label="Retry Count" value={view.retryCount} />
                    <Field label="Wallet Debit" value={view.verificationCost != null ? `₹${view.verificationCost}` : null} />
                    <Field label="Balance Before" value={view.walletBalanceBefore != null ? `₹${view.walletBalanceBefore}` : null} />
                    <Field label="Balance After" value={view.walletBalanceAfter != null ? `₹${view.walletBalanceAfter}` : null} />
                    <Field label="Request Sent" value={view.requestTimestamp ? formatDateTime(view.requestTimestamp) : null} />
                    <Field label="Response Received" value={view.responseTimestamp ? formatDateTime(view.responseTimestamp) : null} />
                  </div>

                  {view.permissions?.canSeeRaw ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setShowRaw(showRaw === 'request' ? null : 'request')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          <Terminal className="w-3.5 h-3.5" /> {showRaw === 'request' ? 'Hide' : 'View'} Raw Request
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRaw(showRaw === 'response' ? null : 'response')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          <Terminal className="w-3.5 h-3.5" /> {showRaw === 'response' ? 'Hide' : 'View'} Raw Response
                        </button>
                      </div>

                      {showRaw && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-900 overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                              {showRaw === 'request' ? 'Outbound Request' : 'Provider Response'}
                            </span>
                            <span className="text-[10.5px] font-semibold text-amber-300/90 inline-flex items-center gap-1.5">
                              <Info className="w-3 h-3" /> Credentials redacted · account masked
                            </span>
                          </div>
                          <pre className="p-4 text-[11.5px] leading-relaxed text-emerald-200 font-mono overflow-x-auto max-h-80">
{JSON.stringify(showRaw === 'request' ? view.rawRequest ?? null : view.rawResponse ?? null, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11.5px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      Raw request and response payloads are visible to Super Admin only.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BankVerificationReport;
