// ─────────────────────────────────────────────────────────────────────────────
// AddressSection — the ONE standard structured address used by every employee
// registration workflow (Register Master Employee + Quick Add → Complete Profile).
//
// This is the better-designed Quick Add address (Present / Permanent with a
// "Same as Present" toggle and discrete fields) promoted to a shared component so
// both workflows collect IDENTICAL data and future changes happen in one place.
//
// Data model is UNCHANGED: both flows still persist the joined `presentAddress`
// and `permanentAddress` strings into the same Employee master columns (via
// buildAddressString). The structured fields are the editing surface only.
//   • Present address fields use the 'p_' prefix, permanent uses 'q_'.
//   • Keys: <pfx>line1, line2, area, landmark, city, district, state, country, pincode
//   • sameAsPresent (boolean) mirrors present → permanent.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { Input } from '@/components/ui/Input';
import { MapPin, Copy } from 'lucide-react';

export const ADDRESS_PARTS = ['line1', 'line2', 'area', 'landmark', 'city', 'district', 'state', 'country', 'pincode'] as const;
export type AddressPart = typeof ADDRESS_PARTS[number];
export type AddressPrefix = 'p_' | 'q_';

// Present-address fields that are mandatory (mirrors the Quick Add onboarding checklist).
export const REQUIRED_ADDRESS_PARTS: AddressPart[] = ['line1', 'city', 'district', 'state', 'country', 'pincode'];

// Blank structured-address state — spread into a form's initial state so both
// workflows start with the same keys.
export const BLANK_ADDRESS_VALUES: Record<string, any> = {
  sameAsPresent: false,
  ...Object.fromEntries((['p_', 'q_'] as AddressPrefix[]).flatMap(p => ADDRESS_PARTS.map(k => [p + k, '']))),
};

const joinParts = (...xs: any[]) => xs.map(x => String(x ?? '').trim()).filter(Boolean).join(', ');

// Join one structured address into the single string the Employee master schema
// stores — so the DB mapping is identical across both workflows.
export function buildAddressString(values: Record<string, any>, pfx: AddressPrefix): string {
  return joinParts(...ADDRESS_PARTS.map(p => values[pfx + p]));
}

// Structured object form (used by the onboarding selfProfile payload).
export function buildAddressObject(values: Record<string, any>, pfx: AddressPrefix): Record<AddressPart, string> {
  return Object.fromEntries(ADDRESS_PARTS.map(p => [p, values[pfx + p] || ''])) as Record<AddressPart, string>;
}

const PART_LABEL: Record<AddressPart, string> = {
  line1: 'Address Line 1', line2: 'Address Line 2', area: 'Area / Locality', landmark: 'Landmark',
  city: 'City', district: 'District', state: 'State', country: 'Country', pincode: 'PIN Code',
};

// Validate the (required) PRESENT address; returns prefixed error keys e.g.
// { p_city: 'City is required' } so callers can render per-field errors + focus.
export function validatePresentAddress(values: Record<string, any>): Record<string, string> {
  const e: Record<string, string> = {};
  for (const p of REQUIRED_ADDRESS_PARTS) {
    if (!String(values['p_' + p] ?? '').trim()) e['p_' + p] = `${PART_LABEL[p]} is required`;
  }
  if (values['p_pincode'] && !/^\d{6}$/.test(String(values['p_pincode']).trim())) e['p_pincode'] = 'PIN Code must be 6 digits';
  return e;
}

const Grid: React.FC<{
  pfx: AddressPrefix; values: Record<string, any>; onChange: (k: string, v: any) => void;
  errors?: Record<string, string>; disabled?: boolean; requiredMark: boolean;
}> = ({ pfx, values, onChange, errors, disabled, requiredMark }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {ADDRESS_PARTS.map(part => {
      const required = REQUIRED_ADDRESS_PARTS.includes(part);
      const isPin = part === 'pincode';
      return (
        <Input
          key={part}
          id={`field-${pfx}${part}`}
          label={`${PART_LABEL[part]}${requiredMark && required ? ' *' : ''}`}
          className={isPin ? 'font-mono' : undefined}
          value={values[pfx + part] || ''}
          disabled={disabled}
          error={errors?.[pfx + part]}
          onChange={e => onChange(pfx + part, isPin ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
        />
      );
    })}
  </div>
);

interface Props {
  /** The form/draft state object holding the p_ and q_ prefixed keys + sameAsPresent. */
  values: Record<string, any>;
  /** Called with (key, value) for each change — adapt to setForm/set/setField. */
  onChange: (key: string, value: any) => void;
  /** Optional prefixed per-field errors (e.g. { p_city: '...' }). */
  errors?: Record<string, string>;
  disabled?: boolean;
}

// Standard Present + Permanent address with a "Same as Present" toggle. Reused by
// both employee-registration workflows so they collect identical data.
export const AddressSection: React.FC<Props> = ({ values, onChange, errors, disabled }) => {
  const same = !!values.sameAsPresent;
  return (
    <div className="space-y-5">
      <div>
        <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><MapPin size={14} className="text-[#4F7CFF]" /> Present Address</h4>
        <Grid pfx="p_" values={values} onChange={onChange} errors={errors} disabled={disabled} requiredMark />
      </div>
      <div>
        <h4 className="mb-2 flex items-center gap-2 text-xs font-extrabold text-slate-700"><MapPin size={14} className="text-[#4F7CFF]" /> Permanent Address</h4>
        <label className="mb-3 flex w-fit items-center gap-2 text-[11px] font-semibold text-indigo-600 cursor-pointer">
          <input type="checkbox" checked={same} disabled={disabled} onChange={e => onChange('sameAsPresent', e.target.checked)} />
          <Copy size={12} /> Same as Present Address
        </label>
        {same
          ? <p className="text-[11px] text-slate-400">Permanent address will mirror the present address above.</p>
          : <Grid pfx="q_" values={values} onChange={onChange} errors={errors} disabled={disabled} requiredMark={false} />}
      </div>
    </div>
  );
};

export default AddressSection;
