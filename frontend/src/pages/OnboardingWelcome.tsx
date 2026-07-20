// ─────────────────────────────────────────────────────────────────────────────
// FIRST-LOGIN ONBOARDING GATE
// Shown once, immediately after a NEW company's first login, before the
// dashboard. The company head picks "Sample Workspace" (30 demo employees, so
// every feature has data to explore) or "Blank Workspace" (start from scratch).
// The choice is recorded server-side so this never appears again.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { BarChart3, FilePlus2, ArrowRight, Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { ZeniaLogo } from '@/components/brand/ZeniaLogo';

const NAVY = '#16284A';
const BROWN = '#C67B49';

interface Props {
  userName?: string;
  /** Called after the choice is saved (and demo data generated for 'sample'). */
  onDone: () => void | Promise<void>;
}

export const OnboardingWelcome: React.FC<Props> = ({ userName, onDone }) => {
  const [busy, setBusy] = useState<'blank' | 'sample' | null>(null);

  const choose = async (choice: 'blank' | 'sample') => {
    if (busy) return;
    setBusy(choice);
    try {
      const res: any = await api.onboarding.choose(choice);
      if (choice === 'sample') {
        const n = res?.demo?.created ?? 30;
        ui.toast.success(`Sample workspace ready — ${n} demo employees added.`);
      } else {
        ui.toast.success('Your blank workspace is ready.');
      }
      await onDone();
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
      setBusy(null);
    }
  };

  const Card: React.FC<{
    id: 'blank' | 'sample'; icon: React.ReactNode; badge?: string; emoji: string;
    title: string; desc: string; cta: string; primary?: boolean;
  }> = ({ id, icon, badge, emoji, title, desc, cta, primary }) => (
    <button
      onClick={() => choose(id)}
      disabled={!!busy}
      className={`group relative text-left rounded-3xl border p-6 flex flex-col transition-all duration-200 disabled:opacity-70 ${
        primary
          ? 'border-[#C67B49]/40 bg-gradient-to-br from-[#FBF3EC] to-white hover:border-[#C67B49] hover:shadow-[0_20px_45px_-20px_rgba(198,123,73,0.55)]'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-[0_20px_45px_-24px_rgba(16,24,40,0.35)]'
      } ${busy && busy !== id ? 'pointer-events-none' : ''}`}
    >
      {badge && (
        <span className="absolute top-5 right-5 text-[11px] font-bold text-white rounded-full px-2.5 py-1" style={{ background: BROWN }}>{badge}</span>
      )}
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${primary ? 'text-white' : 'text-white'}`} style={{ background: primary ? BROWN : NAVY }}>
        {icon}
      </div>
      <h3 className="text-[17px] font-extrabold text-slate-900 flex items-center gap-1.5">{emoji} {title}</h3>
      <p className="text-[13px] leading-relaxed text-slate-500 mt-1.5 flex-1">{desc}</p>
      <span className={`mt-5 inline-flex items-center justify-center gap-2 h-11 rounded-2xl text-[14px] font-bold text-white transition-all ${primary ? '' : ''}`}
        style={{ background: primary ? NAVY : '#334155' }}>
        {busy === id ? <Loader2 size={17} className="animate-spin" /> : (id === 'sample' ? <Sparkles size={16} /> : <CheckCircle2 size={16} />)}
        {busy === id ? (id === 'sample' ? 'Building your workspace…' : 'Setting up…') : cta}
        {!busy && <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />}
      </span>
    </button>
  );

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 font-sans"
      style={{ background: 'linear-gradient(120deg,#e9e3d9 0%,#e3e6ea 44%,#d7dce2 100%)' }}>
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }}
        className="w-full max-w-[720px] bg-white/95 backdrop-blur-2xl rounded-[28px] shadow-[0_30px_80px_-24px_rgba(16,24,40,0.3)] border border-white/70 overflow-hidden"
      >
        <div className="px-8 pt-8 pb-6 text-center">
          <div className="flex justify-center mb-4"><ZeniaLogo size={46} radius={220} className="rounded-[24%]" /></div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-slate-900">🎉 Welcome to ZeniaHR</h1>
          <p className="text-[14px] text-slate-500 mt-1.5 max-w-md mx-auto">
            {userName ? `Hi ${userName.split(' ')[0]}, welcome` : 'Welcome'} to your new HR workspace. Choose how you would like to start your journey.
          </p>
        </div>
        <div className="px-8 pb-8 grid md:grid-cols-2 gap-4">
          <Card
            id="sample" primary badge="Recommended" emoji="📊"
            icon={<BarChart3 size={22} />}
            title="Explore with Sample Data"
            desc="Populate your workspace with 30 realistic demo employees, departments and designations so you can see how every feature works before using it with your real team."
            cta="Use Sample Workspace"
          />
          <Card
            id="blank" emoji="🆕"
            icon={<FilePlus2 size={22} />}
            title="Start with a Blank Workspace"
            desc="Start with an empty workspace and configure your company from scratch — add your own employees, attendance and payroll when you're ready."
            cta="Start Blank Workspace"
          />
        </div>
        <div className="px-8 pb-6 -mt-2 text-center text-[12px] text-slate-400">
          You can remove sample data later from your dashboard. This choice is shown only once.
        </div>
      </motion.div>
    </div>
  );
};

export default OnboardingWelcome;
