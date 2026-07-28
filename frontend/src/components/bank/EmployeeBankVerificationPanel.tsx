import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldX, ShieldAlert, RefreshCw, FileSearch, ExternalLink } from 'lucide-react';
import { api } from '@/api/apiClient';
import { Modal } from '@/components/ui/Modal';
import { formatDateTime } from '@/utils/formatDate';
import { BankVerificationReport } from './BankVerificationReport';
import { VerificationView, fromRecord, orNA, statusLabel, statusTone } from './bankVerification';

interface Props {
  employee: {
    id?: string | number | null;
    code?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    department?: string | null;
    designation?: string | null;
    branch?: string | null;
    /** Denormalised summary already on the employee row. */
    bankVerificationStatus?: string | null;
    bankVerificationRefId?: string | null;
    bankVerifiedAt?: string | null;
    bankVerifiedBy?: string | null;
    bankVerificationProvider?: string | null;
  };
  companyName?: string | null;
  /** Opens the editor where the (single, paid) verify action lives. */
  onReverify?: () => void;
}

const TONE_CLASS: Record<string, string> = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200',
  slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
};

/**
 * §11 — the employee profile's permanent bank verification state.
 *
 * Reads the stored verification record; it never calls the provider, so opening a
 * profile is free no matter how often it happens. Reverify is delegated upward to
 * the editor, which owns the one paid call site and all of its guards — there is
 * deliberately no second place in the app that can spend a verification credit.
 */
export const EmployeeBankVerificationPanel: React.FC<Props> = ({ employee, companyName, onReverify }) => {
  const [record, setRecord] = useState<VerificationView | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const employeeRef = employee.id ?? employee.code;

  const load = useCallback(async () => {
    if (!employeeRef) return;
    setLoading(true);
    try {
      const res: any = await api.bank.latestVerification(employeeRef);
      setRecord(res?.data ? fromRecord(res.data) : null);
    } catch {
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [employeeRef]);

  useEffect(() => { load(); }, [load]);

  // The stored record wins where there is one; the employee row's summary is the
  // fallback so a profile still shows its verified state while the record loads.
  const status = record?.status || employee.bankVerificationStatus || 'UNVERIFIED';
  const verified = status === 'VERIFIED';
  const tone = TONE_CLASS[statusTone(status)];

  const verifiedAt = record?.verifiedAt || employee.bankVerifiedAt || null;
  const referenceId = record?.referenceId || employee.bankVerificationRefId || null;
  const verifiedBy = record?.verifiedBy || employee.bankVerifiedBy || null;
  const provider = record?.verificationSource || record?.provider || employee.bankVerificationProvider || null;

  const Icon = verified ? ShieldCheck : statusTone(status) === 'red' ? ShieldX : ShieldAlert;

  return (
    <>
      <div className={`rounded-xl border px-4 py-3.5 ${tone}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon className="w-[18px] h-[18px] shrink-0" />
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold leading-tight">
                {verified ? 'Bank Verified' : `Bank Account ${statusLabel(status)}`}
              </p>
              <p className="text-[11.5px] font-medium opacity-80 mt-0.5">
                {verified
                  ? `Verified against ${orNA(provider)}`
                  : 'This account has not been verified against the banking network.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {record && (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold bg-white/80 dark:bg-slate-900/60 border border-current/20 hover:bg-white dark:hover:bg-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <FileSearch className="w-3.5 h-3.5" /> View Full Report
              </button>
            )}
            {onReverify && (
              <button
                type="button"
                onClick={onReverify}
                title="Opens the bank details editor, where a re-verification can be run"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold bg-white/80 dark:bg-slate-900/60 border border-current/20 hover:bg-white dark:hover:bg-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Reverify
                <ExternalLink className="w-3 h-3 opacity-60" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-3.5 pt-3.5 border-t border-current/15">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Verification Status</p>
            <p className="text-[12.5px] font-bold mt-0.5">{statusLabel(status)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Verified At</p>
            <p className="text-[12.5px] font-semibold mt-0.5">{verifiedAt ? formatDateTime(verifiedAt) : 'N/A'}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Reference ID</p>
            <p className="text-[12.5px] font-semibold font-mono mt-0.5 truncate" title={referenceId || undefined}>
              {orNA(referenceId)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Verified By</p>
            <p className="text-[12.5px] font-semibold mt-0.5 truncate" title={verifiedBy || undefined}>
              {orNA(verifiedBy)}
            </p>
          </div>
        </div>
      </div>

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Bank Account Verification"
        size="xl"
      >
        {record && <BankVerificationReport view={record} companyName={companyName} />}
      </Modal>
    </>
  );
};

export default EmployeeBankVerificationPanel;
