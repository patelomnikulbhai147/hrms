import { useCallback, useEffect, useState } from 'react';
import {
  loadPayrollSettings, totalAbsencePool,
  LEAVE_POLICY_EVENT, PAYROLL_SETTINGS_EVENT, type LeavePolicy,
} from '@/utils/payrollSettings';

/**
 * useLeavePolicy — the SINGLE read-path every module uses for the company leave
 * policy configured in Settings → Payroll Cycle & Leave Policy. No screen keeps
 * its own copy: they all call this hook, which reads the one stored policy and
 * live-refreshes (no manual reload) whenever Settings saves — driven by the
 * broadcast events savePayrollSettings already dispatches (and cross-tab via the
 * native `storage` event).
 *
 * Pass the POLICY company id (resolve a branch to its parent before calling, the
 * same way Settings persists it) so branches and the parent share one policy.
 */
export interface LeavePolicyView {
  policy: LeavePolicy;
  /** Total Allowed Absence Pool — sum of every paid leave type, excluding LOP. */
  totalPool: number;
}

export function useLeavePolicy(companyId: any): LeavePolicyView {
  const read = useCallback(() => loadPayrollSettings(companyId).leavePolicy, [companyId]);
  const [policy, setPolicy] = useState<LeavePolicy>(read);

  useEffect(() => {
    setPolicy(read()); // re-sync when the company/branch context changes
    const refresh = () => setPolicy(loadPayrollSettings(companyId).leavePolicy);
    window.addEventListener(LEAVE_POLICY_EVENT, refresh as EventListener);
    window.addEventListener(PAYROLL_SETTINGS_EVENT, refresh as EventListener);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(LEAVE_POLICY_EVENT, refresh as EventListener);
      window.removeEventListener(PAYROLL_SETTINGS_EVENT, refresh as EventListener);
      window.removeEventListener('storage', refresh);
    };
  }, [companyId, read]);

  return { policy, totalPool: totalAbsencePool(policy) };
}
