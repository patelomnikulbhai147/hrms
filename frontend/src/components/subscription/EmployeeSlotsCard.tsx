import React, { useCallback, useEffect, useState } from 'react';
import { Users, ChevronRight } from 'lucide-react';
import { api } from '@/api/apiClient';

/**
 * Dashboard KPI card: "Employee Slots Used  98 / 100".
 * Every active user (Company Head, HR, employees) consumes one slot.
 * Clicking navigates to the dedicated Employee Slot History page (which also
 * hosts the Purchase Slots entry point).
 * Hides itself on load failure — never renders a false zero.
 */
export const EmployeeSlotsCard: React.FC = () => {
  const [cap, setCap] = useState<any | null>(null);
  const [failed, setFailed] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await api.employeeSlots.overview();
      setCap(res?.capacity || null);
      setFailed(!res?.capacity);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    loadData();
    const refetch = (e: any) => {
      if (e.type === 'storage' && e.key !== 'hrms_wallet_updated') return;
      loadData();
    };
    window.addEventListener('hrms:slots-updated', refetch);
    window.addEventListener('storage', refetch);
    window.addEventListener('focus', loadData);
    return () => {
      window.removeEventListener('hrms:slots-updated', refetch);
      window.removeEventListener('storage', refetch);
      window.removeEventListener('focus', loadData);
    };
  }, [loadData]);

  if (failed || !cap) return null;

  const full = !cap.unlimited && cap.remaining <= 0;
  const nearFull = !cap.unlimited && !full && cap.limit > 0 && cap.current / cap.limit >= 0.85;
  const tone = full ? 'text-red-700' : nearFull ? 'text-amber-700' : 'text-ink';
  const barTone = full ? 'bg-red-500' : nearFull ? 'bg-amber-500' : 'bg-emerald-500';
  const pct = cap.unlimited || !cap.limit ? 0 : Math.min(100, Math.round((cap.current / cap.limit) * 100));

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('hrms:view-slot-history'))}
      className="w-full text-left bg-surface border border-hairline rounded-card p-4 hover:border-brand-300 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted inline-flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Employee Slots Used
        </span>
        <ChevronRight className="w-4 h-4 text-ink-muted" />
      </div>
      <p className={`text-[22px] font-bold mt-1.5 tabular-nums font-heading ${tone}`}>
        {cap.current}<span className="text-[13px] font-semibold text-ink-muted"> / {cap.unlimited ? '∞' : cap.limit}</span>
      </p>
      {!cap.unlimited && (
        <div className="w-full h-1.5 rounded-full bg-surface-muted overflow-hidden mt-2">
          <div className={`h-full rounded-full ${barTone}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="text-[11px] font-medium text-ink-muted mt-1.5">
        {full
          ? 'Limit reached — purchase additional slots'
          : cap.unlimited
            ? 'Unlimited plan'
            : `${cap.remaining} remaining${cap.extraSlots > 0 ? ` · incl. ${cap.extraSlots} purchased` : ''}`}
      </p>
    </button>
  );
};

export default EmployeeSlotsCard;
