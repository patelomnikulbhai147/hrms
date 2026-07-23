import { useEffect, useState } from 'react';
import { api } from '@/api/apiClient';

/**
 * useEligibleLeaveTypes — the leave types ONE employee may apply for.
 *
 * The Log Employee Leave dialog used to render a hardcoded array, so every
 * employee was offered every type, Maternity Leave included. Eligibility depends
 * on who the leave is for, so it cannot be resolved once for the whole screen —
 * this refetches whenever the selected employee changes.
 *
 * This is presentation only. The identical rule is enforced in
 * leaveController.create/update, so a request that skips the form is still
 * refused; if this hook fails to load, the caller falls back to the full list
 * and the server remains the authority rather than the user being locked out.
 */
export interface EligibleLeaveType {
  code: string;
  label: string;
  eligibleGender: 'All' | 'Male' | 'Female' | string;
  enabled: boolean;
  sortOrder: number;
}

export interface EligibleLeaveTypesView {
  types: EligibleLeaveType[];
  /** Normalised 'Male' | 'Female' | 'Other', or null when not recorded. */
  gender: string | null;
  genderRecorded: boolean;
  loading: boolean;
  /** Set when the lookup failed — the caller should not silently show nothing. */
  error: string | null;
}

const EMPTY: EligibleLeaveTypesView = {
  types: [], gender: null, genderRecorded: false, loading: false, error: null,
};

export function useEligibleLeaveTypes(employeeId: any): EligibleLeaveTypesView {
  const [view, setView] = useState<EligibleLeaveTypesView>(EMPTY);

  useEffect(() => {
    if (!employeeId) { setView(EMPTY); return; }
    let cancelled = false;
    setView((v) => ({ ...v, loading: true, error: null }));
    api.leaveTypes.eligible(employeeId)
      .then((res: any) => {
        if (cancelled) return;
        setView({
          types: Array.isArray(res?.types) ? res.types : [],
          gender: res?.gender ?? null,
          genderRecorded: !!res?.genderRecorded,
          loading: false,
          error: null,
        });
      })
      .catch((e: any) => {
        if (cancelled) return;
        console.error('[leave] eligible leave types failed', e);
        setView({ ...EMPTY, error: e?.message || 'Could not load eligible leave types.' });
      });
    return () => { cancelled = true; };
  }, [employeeId]);

  return view;
}
