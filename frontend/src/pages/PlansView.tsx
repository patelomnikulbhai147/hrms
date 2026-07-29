// ─────────────────────────────────────────────────────────────────────────────
// VIEW PLANS (company-facing) — all subscription plans with capacity, pricing,
// features, modules and reports. A company user can review and request an
// upgrade; the actual plan change is applied by a Super Admin (which then
// re-permissions the company live, no logout).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Crown, Users, ArrowLeft, Loader2, Sparkles, BadgeCheck } from 'lucide-react';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { inr } from '@/config/subscriptionPricing';

interface Props {
  onBack?: () => void;
}

const PLAN_ACCENT: Record<string, string> = {
  Free: '#64748b', Starter: '#3b82f6', Professional: '#8b5cf6', Enterprise: '#4f46e5', Custom: '#d97706',
};

const capacityLabel = (p: any): string => {
  if (p.custom) return 'Custom capacity';
  const max = p.employeeMax === -1 || p.employeeMax == null ? null : p.employeeMax;
  const lim = p.limits?.employeeLimit;
  const cap = lim === -1 ? null : (lim ?? max);
  return cap == null ? 'Unlimited employees' : `Up to ${cap} employees`;
};

export const PlansView: React.FC<Props> = ({ onBack }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<'quarterly' | 'yearly'>('yearly');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.onboarding.plans();
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) ui.toast.error(getApiErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const currentPlan = data?.currentPlan || 'Free';
  const plans: any[] = useMemo(() => Array.isArray(data?.plans) ? data.plans : [], [data]);

  // Opens the global self-service purchase wizard (plan → cycle → employees →
  // server-priced summary → Cashfree checkout). The wizard enforces who can pay.
  const requestUpgrade = (_p: any) => {
    window.dispatchEvent(new CustomEvent('hrms:upgrade-plan'));
  };

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3 mb-1">
        {onBack && (
          <button onClick={onBack} className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><ArrowLeft size={17} /></button>
        )}
        <div>
          <h1 className="text-xl font-bold text-ink flex items-center gap-2"><Crown size={20} className="text-brand-600" /> Subscription Plans</h1>
          <p className="text-sm text-ink-muted mt-0.5">Choose the plan that fits your team. Prices are per employee, per billing period.</p>
        </div>
      </div>

      {/* Billing cycle toggle */}
      <div className="flex justify-center my-5">
        <div className="inline-flex items-center bg-slate-100 rounded-full p-1 text-sm font-semibold">
          {(['quarterly', 'yearly'] as const).map((c) => (
            <button key={c} onClick={() => setCycle(c)}
              className={`px-4 py-1.5 rounded-full capitalize transition-colors ${cycle === c ? 'bg-white shadow text-brand-700' : 'text-slate-500'}`}>
              {c}{c === 'yearly' && <span className="ml-1 text-[11px] text-emerald-600 font-bold">save 20%</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-ink-muted"><Loader2 className="animate-spin mr-2" size={20} /> Loading plans…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = String(p.key) === String(currentPlan);
            const accent = PLAN_ACCENT[p.key] || p.color || '#64748b';
            const price = p.custom ? null : (cycle === 'yearly' ? p.priceYearly : p.priceQuarterly);
            return (
              <div key={p.key}
                className={`relative rounded-3xl border bg-white p-6 flex flex-col ${isCurrent ? 'border-brand-500 ring-2 ring-brand-500/15' : 'border-slate-200'}`}>
                {isCurrent && (
                  <span className="absolute top-5 right-5 inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 bg-brand-50 rounded-full px-2.5 py-1"><BadgeCheck size={12} /> Current Plan</span>
                )}
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white mb-3" style={{ background: accent }}>
                  {p.custom ? <Sparkles size={20} /> : <Crown size={20} />}
                </div>
                <h3 className="text-[18px] font-extrabold text-slate-900">{p.name}</h3>
                <p className="text-[12.5px] text-slate-500 mt-1 min-h-[34px]">{p.description}</p>

                <div className="mt-3 mb-1">
                  {p.custom ? (
                    <div className="text-[22px] font-extrabold text-slate-900">Custom</div>
                  ) : (
                    <div className="flex items-end gap-1">
                      <span className="text-[26px] font-extrabold text-slate-900">{inr(price || 0)}</span>
                      <span className="text-[12px] text-slate-400 mb-1">/emp/{cycle === 'yearly' ? 'yr' : 'qtr'}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 mb-3">
                  <Users size={15} className="text-slate-400" /> {capacityLabel(p)}
                </div>

                <ul className="space-y-1.5 text-[13px] text-slate-600 flex-1">
                  <li className="flex items-start gap-2"><Check size={15} className="text-emerald-500 mt-0.5 shrink-0" />
                    {p.reportsAll ? 'All reports included' : `${p.reportCount ?? 0} reports included`}</li>
                  <li className="flex items-start gap-2"><Check size={15} className="text-emerald-500 mt-0.5 shrink-0" />
                    {p.modules?.length ? `${p.modules.length} premium module${p.modules.length > 1 ? 's' : ''}: ${p.modules.slice(0, 3).join(', ')}${p.modules.length > 3 ? '…' : ''}` : 'Core HR modules'}</li>
                  {(p.features || []).slice(0, 4).map((f: string) => (
                    <li key={f} className="flex items-start gap-2"><Check size={15} className="text-emerald-500 mt-0.5 shrink-0" />{f}</li>
                  ))}
                </ul>

                <button
                  disabled={isCurrent}
                  onClick={() => requestUpgrade(p)}
                  className={`mt-5 h-11 rounded-2xl text-[14px] font-bold flex items-center justify-center gap-2 transition-all ${
                    isCurrent ? 'bg-slate-100 text-slate-400 cursor-default' : 'text-white active:scale-[0.98]'
                  }`}
                  style={isCurrent ? undefined : { background: accent }}>
                  {isCurrent ? 'Current Plan' : <>Upgrade Now</>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlansView;
