import React from 'react';
import { Lock, Crown, Sparkles, PhoneCall, ArrowRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

// Shared upsell copy so the dialog and the full-page block never drift.
const TITLE = 'Upgrade Required';
const message = (moduleLabel?: string) =>
  moduleLabel
    ? `${moduleLabel} is available on Premium plans. Upgrade your subscription to unlock this module.`
    : 'This feature is available on Premium plans. Upgrade your subscription to unlock this module.';

const CONTACT_SALES_MAILTO =
  'mailto:sales@zeniahr.com?subject=ZeniaHR%20Upgrade%20Enquiry&body=I%27d%20like%20to%20upgrade%20my%20ZeniaHR%20plan.';

const defaultContactSales = () => { try { window.location.href = CONTACT_SALES_MAILTO; } catch { /* ignore */ } };

interface UpgradeProps {
  moduleLabel?: string;
  onUpgrade?: () => void;
  onContactSales?: () => void;
}

// ── Dialog: shown when a company user CLICKS a locked sidebar item ──────────────
export const UpgradeRequiredDialog: React.FC<UpgradeProps & { open: boolean; onClose: () => void }> = ({
  open, onClose, moduleLabel, onUpgrade, onContactSales,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title={TITLE}
    size="sm"
    footer={
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 w-full">
        <button onClick={onClose} className="h-10 px-4 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors">
          Maybe Later
        </button>
        <button onClick={() => (onContactSales || defaultContactSales)()} className="h-10 px-4 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center gap-2 transition-colors">
          <PhoneCall size={15} /> Contact Sales
        </button>
        <button onClick={() => onUpgrade?.()} className="h-10 px-4 rounded-xl text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 flex items-center justify-center gap-2 transition-colors shadow-sm">
          <Crown size={15} /> Upgrade Plan
        </button>
      </div>
    }
  >
    <div className="flex items-start gap-3.5 py-1">
      <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
        <Lock size={22} />
      </div>
      <div>
        <p className="text-sm text-slate-700 leading-relaxed">{message(moduleLabel)}</p>
        <p className="text-[12px] text-slate-400 mt-2 flex items-center gap-1.5">
          <Sparkles size={13} className="text-amber-400" /> Unlock Reports, Communication, Invoicing, Finance &amp; Compliance and more.
        </p>
      </div>
    </div>
  </Modal>
);

// ── Full-page block: shown when a locked module is reached by DIRECT URL ────────
export const PremiumRequiredScreen: React.FC<UpgradeProps & { onBack?: () => void }> = ({
  moduleLabel, onUpgrade, onContactSales, onBack,
}) => (
  <div className="flex items-center justify-center min-h-[60vh] p-6">
    <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-3xl shadow-[0_20px_60px_-24px_rgba(16,24,40,0.25)] p-8">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-5">
        <Crown size={30} />
      </div>
      <h1 className="text-xl font-extrabold text-slate-900">Premium Required</h1>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
        {moduleLabel ? <><b>{moduleLabel}</b> is not included in your current plan. </> : null}
        You need to upgrade your subscription to access this module.
      </p>
      <div className="flex flex-col gap-2.5 mt-6">
        <button onClick={() => onUpgrade?.()} className="h-11 rounded-2xl text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 flex items-center justify-center gap-2 transition-colors shadow-sm">
          <Crown size={16} /> Upgrade Plan <ArrowRight size={16} />
        </button>
        <button onClick={() => (onContactSales || defaultContactSales)()} className="h-11 rounded-2xl text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center gap-2 transition-colors">
          <PhoneCall size={15} /> Contact Sales
        </button>
        {onBack && (
          <button onClick={onBack} className="text-[13px] font-bold text-slate-400 hover:text-slate-600 mt-1 transition-colors">
            Go back
          </button>
        )}
      </div>
    </div>
  </div>
);
