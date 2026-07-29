// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE LIMIT REACHED — slot purchase / upgrade dialog.
// Shown whenever a company hits its employee slot limit (base plan + purchased
// add-on slots) on any create path. Primary action: purchase additional slot
// packs (opens the Employee Slots dialog); upgrading the plan remains offered.
// Portaled to document.body so App's page-transform wrapper can't clip it.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Crown, ArrowRight, X, Users } from 'lucide-react';

interface Props {
  open: boolean;
  plan?: string;
  limit?: number | null;
  current?: number | null;
  onUpgrade: () => void;
  onViewPlans: () => void;
  onClose: () => void;
}

export const EmployeeLimitDialog: React.FC<Props> = ({ open, plan = 'FREE', limit = 100, current, onUpgrade, onViewPlans, onClose }) => {
  if (!open) return null;
  const planLabel = (plan || 'FREE').toUpperCase();
  const onPurchaseSlots = () => {
    onClose();
    // Global listener in App opens the Employee Slots purchase dialog.
    window.dispatchEvent(new CustomEvent('hrms:purchase-slots'));
  };
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[460px] bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-lg p-1"><X size={18} /></button>
        <div className="px-7 pt-8 pb-2 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={30} className="text-amber-500" />
          </div>
          <h2 className="text-[20px] font-extrabold text-slate-900">Employee Limit Reached</h2>
          <p className="text-[14px] text-slate-500 mt-2 leading-relaxed">
            You have reached your employee limit
            {typeof current === 'number' && limit != null ? (
              <> — your <span className="font-bold text-slate-700">{planLabel}</span> plan currently allows{' '}
              <span className="font-bold text-slate-700">{limit}</span> slots and{' '}
              <span className="font-bold text-slate-700">{current}</span> are in use</>
            ) : null}.
            <br />Please purchase additional employee slots or contact our sales team.
          </p>
        </div>
        <div className="px-7 py-6 flex flex-col gap-2.5">
          <button onClick={onPurchaseSlots} className="h-12 rounded-2xl bg-[#16284A] hover:bg-[#20365C] text-white text-[15px] font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
            <Users size={17} /> Purchase Additional Slots
          </button>
          <button onClick={onUpgrade} className="h-12 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[15px] font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
            <Crown size={17} /> Upgrade Plan
          </button>
          <button onClick={onViewPlans} className="h-11 rounded-2xl text-slate-500 hover:text-slate-700 text-[14px] font-semibold flex items-center justify-center gap-1.5 transition-colors">
            View Plans <ArrowRight size={15} />
          </button>
          <button onClick={onClose} className="h-10 rounded-2xl text-slate-400 hover:text-slate-600 text-[13.5px] font-semibold transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default EmployeeLimitDialog;
