import React, { useState } from 'react';
import {
  ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Clock, User,
  Landmark, Copy, Download, Printer, FileJson, RefreshCw, ChevronDown,
  Terminal, ArrowDown, Info,
} from 'lucide-react';
import { ui } from '@/components/ui/feedback';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
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

/**
 * Status tone → the app's own semantic classes.
 *
 * Only PLAIN Tailwind status shades are used (`bg-emerald-50`, `text-emerald-700`,
 * `border-emerald-200`). That is deliberate: index.css remaps exactly those shades
 * for the dark theme, so the whole module follows `data-theme` with no `dark:`
 * variants of its own. An opacity variant (`bg-emerald-50/60`) is NOT remapped and
 * would render as a pale tint on the dark canvas — so none are used here.
 */
const TONE = {
  green: {
    badge: 'green' as const,
    tile: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    panel: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  amber: {
    badge: 'warning' as const,
    tile: 'bg-amber-50 border-amber-200 text-amber-600',
    panel: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  red: {
    badge: 'danger' as const,
    tile: 'bg-red-50 border-red-200 text-red-600',
    panel: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
  slate: {
    badge: 'gray' as const,
    tile: 'bg-surface-muted border-hairline text-ink-muted',
    panel: 'bg-surface-muted border-hairline',
    text: 'text-ink-secondary',
    dot: 'bg-ink-muted',
  },
} as const;

// One card shape for the whole module, matching components/ui/Card.
const CARD = 'bg-surface rounded-card border border-hairline shadow-card text-ink';
const LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-ink-muted';
const VALUE = 'text-[13.5px] font-semibold text-ink break-words';

/** A label/value pair. Never renders an empty cell — absent values read "N/A" (§3). */
const Field: React.FC<{ label: string; value?: unknown; mono?: boolean; title?: string }> = ({ label, value, mono, title }) => {
  const text = orNA(value);
  const missing = text === 'N/A';
  return (
    <div className="min-w-0">
      <span className={`${LABEL} block mb-1.5`}>{label}</span>
      <p
        className={`${VALUE} ${mono && !missing ? 'font-mono' : ''} ${missing ? 'text-ink-muted font-medium' : ''}`}
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
}> = ({ title, icon, subtitle, children }) => (
  <section className={`${CARD} p-5 lg:p-6`}>
    <header className="flex items-start gap-2.5 mb-5">
      <span className="text-ink-muted shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <h4 className="text-[13px] font-bold text-ink tracking-tight font-heading">{title}</h4>
        {subtitle && <p className="text-[12px] text-ink-secondary mt-0.5 font-medium leading-relaxed">{subtitle}</p>}
      </div>
    </header>
    {children}
  </section>
);

export const BankVerificationReport: React.FC<Props> = ({ view, companyName, onReverify, reverifying, compact }) => {
  const [showRaw, setShowRaw] = useState<'request' | 'response' | null>(null);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [busy, setBusy] = useState<'pdf' | null>(null);

  const tone = TONE[statusTone(view.status)];
  const matchTone = TONE[nameMatchTone(view.nameMatchResult)];
  const timeline = buildTimeline(view);

  const StatusIcon = view.verified ? ShieldCheck : statusTone(view.status) === 'red' ? XCircle : AlertTriangle;

  const copy = async (value: string | null | undefined, label: string) => {
    const ok = await copyText(value);
    if (ok) ui.toast.success(`${label} copied`);
    else ui.toast.error(`Could not copy the ${label.toLowerCase()}`);
  };

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
      <section className={`${CARD} overflow-hidden`}>
        <header className={`flex flex-wrap items-start justify-between gap-4 px-5 lg:px-6 py-5 border-b border-hairline ${tone.panel}`}>
          <div className="flex items-start gap-3.5 min-w-0">
            <span className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${tone.tile}`}>
              <StatusIcon className="w-[22px] h-[22px]" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[17px] font-bold tracking-tight text-ink font-heading">
                {view.verified ? 'Bank Account Verified' : `Verification ${statusLabel(view.status)}`}
              </h3>
              <p className="text-[12.5px] font-medium mt-1 text-ink-secondary leading-relaxed">
                {view.verified
                  ? `Validated by ${view.verificationSource || view.provider || 'the verification provider'}`
                  : view.errorMessage || view.verificationMessage || 'This account could not be validated.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={tone.badge} dot className="text-[11px] px-3 py-1">
              {statusLabel(view.status)}
            </Badge>
            {view.environment && <Badge variant="blue">{view.environment}</Badge>}
          </div>
        </header>

        <div className="px-5 lg:px-6 py-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-5">
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
        <footer className="flex flex-wrap items-center gap-2 px-5 lg:px-6 py-4 border-t border-hairline bg-surface-muted">
          <Button variant="secondary" size="sm" onClick={handlePdf} loading={busy === 'pdf'} icon={<Download className="w-3.5 h-3.5" />}>
            Download PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} icon={<Printer className="w-3.5 h-3.5" />}>
            Print Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { exportVerificationJson(view); ui.toast.success('Verification exported as JSON'); }}
            icon={<FileJson className="w-3.5 h-3.5" />}
          >
            Export JSON
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!view.referenceId}
            onClick={() => copy(view.referenceId, 'Reference ID')}
            icon={<Copy className="w-3.5 h-3.5" />}
          >
            Copy Reference ID
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!view.verificationId}
            onClick={() => copy(view.verificationId, 'Verification ID')}
            icon={<Copy className="w-3.5 h-3.5" />}
          >
            Copy Verification ID
          </Button>

          {onReverify && (
            <Button
              variant="primary"
              size="sm"
              className="ml-auto"
              onClick={onReverify}
              loading={reverifying}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              {reverifying ? 'Re-verifying…' : 'Reverify'}
            </Button>
          )}
        </footer>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ── 2. What HR entered ────────────────────────────────────────── */}
        <SectionCard
          title="Employee Entered Details"
          icon={<User className="w-4 h-4" />}
          subtitle="Exactly as submitted — never overwritten by the bank response."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
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
            <div className="sm:col-span-2">
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
            <div className="flex-1 rounded-xl border border-hairline bg-surface-muted px-4 py-3.5">
              <span className={`${LABEL} block mb-1.5`}>Employee Name (entered)</span>
              <p className={VALUE}>{orNA(view.entered.employeeName)}</p>
            </div>
            <div className="flex items-center justify-center shrink-0" aria-hidden="true">
              <ArrowDown className="w-4 h-4 text-ink-muted -rotate-90 sm:rotate-0 lg:rotate-0" />
            </div>
            <div className="flex-1 rounded-xl border border-hairline bg-surface-muted px-4 py-3.5">
              <span className={`${LABEL} block mb-1.5`}>Bank Account Holder Name</span>
              <p className={VALUE}>{orNA(view.accountHolderName)}</p>
            </div>
          </div>

          <div className={`lg:w-72 shrink-0 rounded-xl border px-5 py-5 flex flex-col justify-center items-center text-center ${matchTone.panel}`}>
            <span className={`${LABEL} mb-2`}>Match Result</span>
            <Badge variant={matchTone.badge} dot>{nameMatchLabel(view.nameMatchResult)}</Badge>

            {view.nameMatchScore != null ? (
              <>
                <p className={`text-[32px] font-extrabold leading-none mt-3.5 font-heading tabular-nums ${matchTone.text}`}>
                  {view.nameMatchScore}%
                </p>
                <div
                  className="w-full h-1.5 rounded-full bg-surface mt-3 overflow-hidden"
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
              <p className="text-[12px] font-medium text-ink-secondary mt-3 leading-relaxed">
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
                      <span className="absolute left-[11px] top-6 bottom-0 w-px bg-hairline" aria-hidden="true" />
                    )}
                    <span className={`relative z-[1] mt-0.5 w-[23px] h-[23px] rounded-full border flex items-center justify-center shrink-0 ${stepTone.tile}`}>
                      {step.state === 'failed'
                        ? <XCircle className="w-3.5 h-3.5" />
                        : <CheckCircle2 className="w-3.5 h-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-ink">{step.label}</p>
                        {step.detail && (
                          <p className="text-[12px] font-medium text-ink-secondary mt-1 break-words">{step.detail}</p>
                        )}
                      </div>
                      <span className="text-[12px] font-semibold text-ink-muted whitespace-nowrap shrink-0 tabular-nums">
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
            <section className={CARD}>
              <button
                type="button"
                onClick={() => setTechnicalOpen((v) => !v)}
                aria-expanded={technicalOpen}
                className="w-full flex items-center justify-between gap-3 p-5 lg:p-6 text-left rounded-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25 transition-colors hover:bg-surface-muted"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Terminal className="w-4 h-4 text-ink-muted shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold text-ink tracking-tight font-heading">Technical Details</span>
                    <span className="block text-[12px] text-ink-secondary mt-0.5 font-medium">
                      Administrator view — API credentials are never included.
                    </span>
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-ink-muted shrink-0 transition-transform duration-200 ${technicalOpen ? 'rotate-180' : ''}`} />
              </button>

              {technicalOpen && (
                <div className="px-5 lg:px-6 pb-5 lg:pb-6 space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-5 border-t border-hairline pt-5">
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowRaw(showRaw === 'request' ? null : 'request')}
                          icon={<Terminal className="w-3.5 h-3.5" />}
                        >
                          {showRaw === 'request' ? 'Hide' : 'View'} Raw Request
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowRaw(showRaw === 'response' ? null : 'response')}
                          icon={<Terminal className="w-3.5 h-3.5" />}
                        >
                          {showRaw === 'response' ? 'Hide' : 'View'} Raw Response
                        </Button>
                      </div>

                      {showRaw && (
                        <div className="rounded-xl border border-hairline overflow-hidden">
                          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-surface-muted border-b border-hairline">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                              {showRaw === 'request' ? 'Outbound Request' : 'Provider Response'}
                            </span>
                            <span className="text-[11px] font-semibold text-amber-700 inline-flex items-center gap-1.5">
                              <Info className="w-3 h-3" /> Credentials redacted · account masked
                            </span>
                          </div>
                          <pre className="p-4 text-[11.5px] leading-relaxed text-ink font-mono overflow-x-auto max-h-80 bg-canvas">
{JSON.stringify(showRaw === 'request' ? view.rawRequest ?? null : view.rawResponse ?? null, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[12px] font-medium text-ink-secondary flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      Raw request and response payloads are visible to Super Admin only.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default BankVerificationReport;
