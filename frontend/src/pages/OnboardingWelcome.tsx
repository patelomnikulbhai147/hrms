// ─────────────────────────────────────────────────────────────────────────────
// FIRST-LOGIN ONBOARDING GATE
//
// Shown once, immediately after a NEW company's first login, before the
// dashboard. The user must EXPLICITLY choose: pick an option and press Continue,
// or press Cancel. Nothing here closes itself.
//
// There is deliberately no timer, no auto-advance, no backdrop-click dismissal
// and no Escape handler — the screen stays until the user acts, and only then
// does `onDone` navigate on. (The historic "flashes and vanishes" bug was NOT in
// this component: App.tsx rebuilt the auth profile when the users list hydrated
// and dropped the `onboarding` field, which closed the gate from the outside.)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { BarChart3, FilePlus2, ArrowRight, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { ZeniaLogo } from '@/components/brand/ZeniaLogo';
import { Button } from '@/components/ui/Button';

// Colours come from the ZeniaHR design tokens (--color-brand-* → the brand
// orange) via Tailwind utilities and the shared <Button>. The screen previously
// hardcoded a navy hex for the CTA and the second card's icon, which read as a
// disabled control and did not belong to the design system.

type Choice = 'sample' | 'blank';

interface Props {
  userName?: string;
  /** Called after the choice is saved (and demo data generated for 'sample'). */
  onDone: () => void | Promise<void>;
}

export const OnboardingWelcome: React.FC<Props> = ({ userName, onDone }) => {
  // Nothing is pre-selected: the user must make a deliberate choice.
  const [choice, setChoice] = useState<Choice | null>(null);
  const [busy, setBusy] = useState<'continue' | 'cancel' | null>(null);

  const submit = async (value: Choice | 'cancelled', kind: 'continue' | 'cancel') => {
    if (busy) return;
    setBusy(kind);
    try {
      const res: any = await api.onboarding.choose(value);
      if (value === 'sample') {
        const n = res?.demo?.created ?? 30;
        ui.toast.success(`Demo data loaded — ${n} sample employees added.`);
        // The app hydrated its employee / attendance / payroll caches at LOGIN,
        // i.e. before this data existed. A client-side transition would land on a
        // dashboard still rendering that empty snapshot (all zeros) even though
        // the seed succeeded. A full document load re-hydrates every module.
        window.location.assign('/dashboard');
        return;
      }
      if (value === 'blank') ui.toast.success('Your empty workspace is ready.');
      await onDone();
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
      setBusy(null);           // stay on screen so the user can retry
    }
  };

  const Option: React.FC<{ id: Choice; icon: React.ReactNode; emoji: string; title: string; desc: string; badge?: string }> =
    ({ id, icon, emoji, title, desc, badge }) => {
      const active = choice === id;
      return (
        <button
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => setChoice(id)}
          disabled={!!busy}
          className={`relative w-full text-left rounded-2xl border-2 p-4 flex gap-3.5 items-start transition-all duration-150 disabled:opacity-70 ${
            active
              ? 'border-brand-500 bg-brand-50 shadow-[0_10px_30px_-16px_rgba(199,126,82,0.65)]'
              : 'border-slate-200 bg-white hover:border-brand-300 hover:shadow-[0_10px_28px_-20px_rgba(16,24,40,0.45)]'
          }`}
        >
          {/* Radio indicator */}
          <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 grid place-items-center transition-colors ${
            active ? 'border-brand-600 bg-brand-600' : 'border-slate-300 bg-white'
          }`}>
            {active && <Check size={12} className="text-white" strokeWidth={3} />}
          </span>

          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2 flex-wrap">
              {/* Both cards share ONE icon treatment (brand orange + white glyph)
                  so neither option reads as secondary or disabled. */}
              <span className="h-8 w-8 rounded-xl grid place-items-center shrink-0 bg-brand-600 text-white">
                {icon}
              </span>
              <span className="text-[15px] font-extrabold text-slate-900">{emoji} {title}</span>
              {badge && (
                <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-brand-600 text-white">{badge}</span>
              )}
            </span>
            <span className="block text-[12.5px] leading-relaxed text-slate-500 mt-1.5">{desc}</span>
          </span>
        </button>
      );
    };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 font-sans"
      style={{ background: 'linear-gradient(120deg,#e9e3d9 0%,#e3e6ea 44%,#d7dce2 100%)' }}>
      <motion.div
        role="dialog" aria-modal="true" aria-labelledby="onb-title"
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }}
        className="w-full max-w-[620px] bg-white/95 backdrop-blur-2xl rounded-[28px] shadow-[0_30px_80px_-24px_rgba(16,24,40,0.3)] border border-white/70 overflow-hidden"
      >
        <div className="px-8 pt-8 pb-5 text-center">
          <div className="flex justify-center mb-4"><ZeniaLogo size={46} radius={220} className="rounded-[24%]" /></div>
          <h1 id="onb-title" className="text-[24px] font-extrabold tracking-tight text-slate-900">Welcome to ZeniaHR!</h1>
          <p className="text-[14px] text-slate-500 mt-1.5">
            {userName ? `Hi ${userName.split(' ')[0]}, how` : 'How'} would you like to start?
          </p>
        </div>

        <div className="px-8 space-y-3" role="radiogroup" aria-label="How would you like to start?">
          <Option
            id="sample" badge="Recommended" emoji="📊" icon={<BarChart3 size={17} />}
            title="Start with Demo Data"
            desc="Experience ZeniaHR with 30 sample employees, attendance, payroll, departments, reports, invoices and realistic sample data."
          />
          <Option
            id="blank" emoji="🆕" icon={<FilePlus2 size={17} />}
            title="Start with an Empty Workspace"
            desc="Begin with a completely blank company and add your own employees and data."
          />
        </div>

        {/* Actions — the shared <Button> carries the ZeniaHR primary tone (brand
            orange gradient, white label, hover/active states, focus ring), so the
            CTA can never drift from the rest of the app.
            Genuinely-disabled Continue (nothing picked yet) is overridden to a
            light-grey/grey-text state rather than a faded orange, so "disabled"
            and "enabled" are never confusable. */}
        <div className="px-8 pt-6 pb-4 flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => submit('cancelled', 'cancel')}
            disabled={!!busy}
            loading={busy === 'cancel'}
            className="rounded-2xl px-5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={() => choice && submit(choice, 'continue')}
            disabled={!choice || !!busy}
            loading={busy === 'continue'}
            className="rounded-2xl px-6 disabled:opacity-100 disabled:bg-slate-100 disabled:bg-none disabled:text-slate-400 disabled:border-slate-200"
          >
            {busy === 'continue'
              ? (choice === 'sample' ? 'Loading demo data…' : 'Setting up…')
              : <>Continue <ArrowRight size={16} /></>}
          </Button>
        </div>

        <div className="px-8 pb-7 text-center text-[12px] text-slate-400">
          You can load demo data later from your dashboard. This choice is shown only once.
        </div>
      </motion.div>
    </div>
  );
};

export default OnboardingWelcome;
