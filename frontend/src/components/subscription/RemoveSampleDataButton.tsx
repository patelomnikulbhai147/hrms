// ─────────────────────────────────────────────────────────────────────────────
// REMOVE SAMPLE DATA — dashboard affordance (company head).
// Self-contained: checks onboarding status on mount and renders only when this
// company still has removable sample data (usedSampleWorkspace && !removed).
// One-time + irreversible: after removal the button never returns and sample
// data can't be regenerated. Deletes ONLY demo records server-side.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';

export const RemoveSampleDataButton: React.FC = () => {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s: any = await api.onboarding.status();
        if (!cancelled) setShow(!!s?.canRemoveSampleData);
      } catch (_) { /* not a company user / transient — keep hidden */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!show) return null;

  const onRemove = async () => {
    const ok = await ui.confirm({
      title: 'Remove Sample Data',
      message: 'This will permanently remove all demo data from your workspace. This action cannot be undone.',
      confirmText: 'Remove Sample Data',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res: any = await api.onboarding.removeSample();
      const n = res?.removed?.employees ?? 0;
      ui.toast.success(`Sample data removed (${n} demo employees and related records).`);
      setShow(false);
      // Reload so every view reflects the now-empty workspace and the button
      // stays gone (status now reports sampleDataRemoved).
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onRemove}
      disabled={busy}
      title="Permanently remove all demo data"
      className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-[13px] font-semibold hover:bg-rose-100 transition-colors disabled:opacity-60"
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
      {busy ? 'Removing…' : 'Remove Sample Data'}
    </button>
  );
};

export default RemoveSampleDataButton;
