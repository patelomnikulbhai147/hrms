import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldX, ShieldAlert, RefreshCw, FileSearch, ExternalLink } from 'lucide-react';
import { api } from '@/api/apiClient';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
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

/**
 * Tone → the app's plain status shades, which index.css remaps for the dark
 * theme. No `dark:` variants and no opacity modifiers — both would break the
 * theme switch this app implements through `data-theme`.
 */
const TONE = {
  green: { panel: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-600', badge: 'green' as const },
  amber: { panel: 'bg-amber-50 border-amber-200', icon: 'text-amber-600', badge: 'warning' as const },
  red: { panel: 'bg-red-50 border-red-200', icon: 'text-red-600', badge: 'danger' as const },
  slate: { panel: 'bg-surface-muted border-hairline', icon: 'text-ink-muted', badge: 'gray' as const },
};

const LABEL = 'text-[10.5px] font-semibold uppercase tracking-wide text-ink-muted';

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
  const tone = TONE[statusTone(status)];

  const verifiedAt = record?.verifiedAt || employee.bankVerifiedAt || null;
  const referenceId = record?.referenceId || employee.bankVerificationRefId || null;
  const verifiedBy = record?.verifiedBy || employee.bankVerifiedBy || null;
  const provider = record?.verificationSource || record?.provider || employee.bankVerificationProvider || null;

  const Icon = verified ? ShieldCheck : statusTone(status) === 'red' ? ShieldX : ShieldAlert;

  return (
    <>
      <div className={`rounded-card border px-4 py-4 ${tone.panel}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon className={`w-[18px] h-[18px] shrink-0 ${tone.icon}`} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold leading-tight text-ink font-heading">
                {verified ? 'Bank Verified' : `Bank Account ${statusLabel(status)}`}
              </p>
              <p className="text-[12px] font-medium text-ink-secondary mt-1 leading-relaxed">
                {verified
                  ? `Verified against ${orNA(provider)}`
                  : 'This account has not been verified against the banking network.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={tone.badge} dot>{statusLabel(status)}</Badge>
            {record && (
              <Button variant="outline" size="xs" onClick={() => setReportOpen(true)} icon={<FileSearch className="w-3.5 h-3.5" />}>
                View Full Report
              </Button>
            )}
            {onReverify && (
              <Button
                variant="secondary"
                size="xs"
                onClick={onReverify}
                loading={loading}
                title="Opens the bank details editor, where a re-verification can be run"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Reverify <ExternalLink className="w-3 h-3 opacity-70" />
              </Button>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3.5 mt-4 pt-4 border-t border-hairline">
          <div className="min-w-0">
            <dt className={LABEL}>Verification Status</dt>
            <dd className="text-[12.5px] font-semibold text-ink mt-1">{statusLabel(status)}</dd>
          </div>
          <div className="min-w-0">
            <dt className={LABEL}>Verified At</dt>
            <dd className="text-[12.5px] font-semibold text-ink mt-1">{verifiedAt ? formatDateTime(verifiedAt) : 'N/A'}</dd>
          </div>
          <div className="min-w-0">
            <dt className={LABEL}>Reference ID</dt>
            <dd className="text-[12.5px] font-semibold font-mono text-ink mt-1 truncate" title={referenceId || undefined}>
              {orNA(referenceId)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className={LABEL}>Verified By</dt>
            <dd className="text-[12.5px] font-semibold text-ink mt-1 truncate" title={verifiedBy || undefined}>
              {orNA(verifiedBy)}
            </dd>
          </div>
        </dl>
      </div>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Bank Account Verification" size="xl">
        {record && <BankVerificationReport view={record} companyName={companyName} />}
      </Modal>
    </>
  );
};

export default EmployeeBankVerificationPanel;
