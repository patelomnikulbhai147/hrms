import React, { useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { api } from '@/api/apiClient';

export interface BankData {
  accountHolderName?: string;
  accountNumber?: string;
  confirmAccountNumber?: string; // UI-only, never persisted
  ifsc?: string;
  bankName?: string;
  bankBranch?: string;
  bankAddress?: string;
  bankCity?: string;
  bankDistrict?: string;
  bankState?: string;
}

interface Props {
  data: BankData;
  onChange: (patch: Partial<BankData>) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Smart bank-details entry. The user types an IFSC; the bank/branch/city/
 * district/state are auto-fetched and shown in a verification card (read-only).
 * A manual fallback appears only if the lookup fails. The raw values are pushed
 * to the parent form via onChange and stored as-is.
 */
export const BankDetails: React.FC<Props> = ({ data, onChange, errors = {}, disabled }) => {
  const [status, setStatus] = useState<'idle' | 'verifying' | 'verified' | 'error'>(
    data.ifsc && data.bankName ? 'verified' : 'idle'
  );
  const [statusMsg, setStatusMsg] = useState('');
  const [manual, setManual] = useState(false);
  const timer = useRef<any>(null);
  const lastLookup = useRef<string>(data.ifsc && data.bankName ? String(data.ifsc).toUpperCase() : '');

  const runLookup = async (code: string) => {
    setStatus('verifying');
    setStatusMsg('Verifying IFSC...');
    try {
      const r = await api.ifsc.lookup(code);
      if (r && r.valid) {
        lastLookup.current = code;
        setManual(false);
        setStatus('verified');
        onChange({
          ifsc: r.ifsc, bankName: r.bankName, bankBranch: r.bankBranch, bankAddress: r.bankAddress,
          bankCity: r.bankCity, bankDistrict: r.bankDistrict, bankState: r.bankState,
        });
      } else {
        setStatus('error');
        setStatusMsg(r?.error || 'Invalid IFSC Code. Bank details not found.');
      }
    } catch (e: any) {
      setStatus('error');
      setStatusMsg(e?.message || 'Invalid IFSC Code. Bank details not found.');
    }
  };

  const onIfscChange = (val: string) => {
    const code = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    onChange({ ifsc: code });
    if (timer.current) clearTimeout(timer.current);
    if (IFSC_RE.test(code)) {
      if (code === lastLookup.current && data.bankName) { setStatus('verified'); return; }
      timer.current = setTimeout(() => runLookup(code), 500);
    } else {
      setStatus('idle');
      setStatusMsg('');
    }
  };

  const acctMismatch = !!data.accountNumber && !!data.confirmAccountNumber && data.accountNumber !== data.confirmAccountNumber;

  return (
    <div className="space-y-3 border-t border-slate-700/50 pt-3">
      <div className="grid grid-cols-2 gap-3">
        <Input id="field-accountHolderName" label="Account Holder Name" value={data.accountHolderName || ''} disabled={disabled}
          onChange={e => onChange({ accountHolderName: e.target.value })} error={errors.accountHolderName} />
        <Input id="field-ifsc" label="IFSC Code *" placeholder="e.g. SBIN0001234" className="font-mono" value={data.ifsc || ''} disabled={disabled}
          onChange={e => onIfscChange(e.target.value)} error={errors.ifsc} />
        <Input id="field-accountNumber" label="Account Number *" className="font-mono" value={data.accountNumber || ''} disabled={disabled}
          onChange={e => onChange({ accountNumber: e.target.value.replace(/\D/g, '') })} error={errors.accountNumber} />
        <Input id="field-confirmAccountNumber" label="Confirm Account Number *" className="font-mono" value={data.confirmAccountNumber || ''} disabled={disabled}
          onChange={e => onChange({ confirmAccountNumber: e.target.value.replace(/\D/g, '') })}
          error={acctMismatch ? 'Account numbers do not match.' : errors.confirmAccountNumber} />
      </div>

      {/* Real-time IFSC status */}
      {status !== 'idle' && (
        <p className={`text-[11px] font-semibold ${status === 'verifying' ? 'text-slate-400' : status === 'verified' ? 'text-emerald-600' : 'text-rose-600'}`}>
          {status === 'verifying' && 'Verifying IFSC…'}
          {status === 'verified' && '✓ IFSC Verified Successfully'}
          {status === 'error' && `❌ ${statusMsg}`}
        </p>
      )}

      {/* Bank Information verification card */}
      {status === 'verified' && data.bankName && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-extrabold text-emerald-700 uppercase tracking-wide">🏦 Bank Information</p>
            <span className="text-[10px] font-bold text-emerald-700 bg-white border border-emerald-300 rounded-full px-2 py-0.5">✓ Verified</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            {([['Bank Name', data.bankName], ['Branch', data.bankBranch], ['IFSC', data.ifsc], ['City', data.bankCity], ['District', data.bankDistrict], ['State', data.bankState]] as [string, string | undefined][]).map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <span className="text-slate-500">{k}</span>
                <span className="font-semibold text-slate-800">{v || '—'}</span>
              </div>
            ))}
            {data.bankAddress && (
              <div className="col-span-2 flex flex-col">
                <span className="text-slate-500">Address</span>
                <span className="font-semibold text-slate-800">{data.bankAddress}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual fallback — only after a failed lookup */}
      {status === 'error' && !manual && !disabled && (
        <button type="button" onClick={() => setManual(true)} className="text-[11px] font-semibold text-blue-600 hover:underline">
          Enter Bank Details Manually
        </button>
      )}
      {manual && (
        <div className="grid grid-cols-2 gap-3">
          <Input label="Bank Name" value={data.bankName || ''} disabled={disabled} onChange={e => onChange({ bankName: e.target.value })} error={errors.bankName} />
          <Input label="Branch Name" value={data.bankBranch || ''} disabled={disabled} onChange={e => onChange({ bankBranch: e.target.value })} />
          <Input label="City" value={data.bankCity || ''} disabled={disabled} onChange={e => onChange({ bankCity: e.target.value })} />
          <Input label="District" value={data.bankDistrict || ''} disabled={disabled} onChange={e => onChange({ bankDistrict: e.target.value })} />
          <Input label="State" value={data.bankState || ''} disabled={disabled} onChange={e => onChange({ bankState: e.target.value })} />
        </div>
      )}
    </div>
  );
};

export default BankDetails;
