// ─────────────────────────────────────────────────────────────────────────────
// DEMO DATA CONTROLS — dashboard header affordance (company accounts).
//
// Demo data is a ONE-WAY street with exactly three states, and this component
// renders the single control that is valid for the current one:
//
//   never installed  →  [🎯 Load Demo Data]     (canLoadDemoData)
//   installed        →  [🗑 Remove Demo Data]   (canRemoveSampleData)
//   removed          →  nothing, forever        (demoDataRemoved)
//
// The server is the authority: it refuses a second install and refuses any
// install after a removal, so a stale tab can never resurrect demo data.
// Removal deletes ONLY demo records — real company data is untouched.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { Trash2, Loader2, Sparkles } from 'lucide-react';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';

type Mode = 'none' | 'load' | 'remove';

export const RemoveSampleDataButton: React.FC = () => {
  const [mode, setMode] = useState<Mode>('none');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s: any = await api.onboarding.status();
        if (cancelled) return;
        // Removal wins: once removed, neither control is ever shown again.
        if (s?.demoDataRemoved) setMode('none');
        else if (s?.canRemoveSampleData) setMode('remove');
        else if (s?.canLoadDemoData) setMode('load');
        else setMode('none');
      } catch (_) { /* not a company user / transient — keep hidden */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (mode === 'none') return null;

  const onLoad = async () => {
    const ok = await ui.confirm({
      title: 'Load Demo Company Data?',
      message:
        'This will import 30 sample employees, plus attendance, leave, payroll, departments, documents, reports, invoices and tasks.\n\n' +
        'This action can only be performed once.',
      confirmText: 'Load Demo Data',
      cancelText: 'Cancel',
    });
    if (!ok) return;                       // dialog closes, button stays available
    setBusy(true);
    try {
      const res: any = await api.onboarding.loadSample();
      const n = res?.demo?.created ?? 30;
      ui.toast.success(`Demo data loaded — ${n} sample employees added.`);
      setMode('none');                     // the Load button never returns
      // Reload so every view picks up the new data and the header now offers
      // "Remove Demo Data" instead.
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
      setBusy(false);
    }
  };

  const onRemove = async () => {
    const ok = await ui.confirm({
      title: 'Remove Demo Data?',
      message:
        'This will permanently delete all sample employees, attendance, payroll, departments, invoices, reports and demo records.\n\n' +
        'Your company settings and real data are kept. This action cannot be undone, and demo data cannot be loaded again afterwards.',
      confirmText: 'Remove Demo Data',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res: any = await api.onboarding.removeSample();
      const n = res?.removed?.employees ?? 0;
      ui.toast.success(`Demo data removed (${n} sample employees and related records).`);
      setMode('none');
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
      setBusy(false);
    }
  };

  if (mode === 'load') {
    return (
      <button
        onClick={onLoad}
        disabled={busy}
        title="Import a sample company dataset to explore ZeniaHR"
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl border border-brand-200 bg-brand-50 text-brand-700 text-[13px] font-semibold hover:bg-brand-100 transition-colors disabled:opacity-60"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {busy ? 'Loading demo data…' : '🎯 Load Demo Data'}
      </button>
    );
  }

  return (
    <button
      onClick={onRemove}
      disabled={busy}
      title="Permanently remove all demo data"
      className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-[13px] font-semibold hover:bg-rose-100 transition-colors disabled:opacity-60"
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
      {busy ? 'Removing…' : 'Remove Demo Data'}
    </button>
  );
};

export default RemoveSampleDataButton;
