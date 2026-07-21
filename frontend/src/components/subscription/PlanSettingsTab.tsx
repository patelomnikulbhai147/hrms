// Plan Settings tab — global platform defaults (Super Admin). File-backed via
// /api/plan-config/settings. These drive defaults for new companies + billing.
import React, { useEffect, useState, useCallback } from 'react';
import { Settings2, Save, RefreshCw } from 'lucide-react';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <button type="button" onClick={() => onChange(!on)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-slate-300'}`}>
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

export const PlanSettingsTab: React.FC<{ plans?: any[] }> = ({ plans }) => {
  const [form, setForm] = useState<any>(null);
  const [planList, setPlanList] = useState<any[]>(plans || []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([api.planConfig.getSettings(), plans ? Promise.resolve(plans) : api.planConfig.list()]);
      setForm(s); setPlanList(Array.isArray(p) ? p : []);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [plans]);
  useEffect(() => { load(); }, [load]);

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    try { const saved = await api.planConfig.updateSettings(form); setForm(saved); ui.toast.success('Platform settings saved.'); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setSaving(false); }
  };

  if (loading || !form) return <div className="py-16 text-center text-ink-muted text-sm">Loading settings…</div>;

  const inputCls = 'w-full h-10 px-3 rounded-xl border border-hairline bg-surface text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10';
  const labelCls = 'text-[12px] font-semibold text-ink-secondary mb-1 block';

  return (
    <div className="space-y-5 max-w-3xl">
      <SectionHeader title="Plan Settings" subtitle="Global defaults applied across the platform."
        actions={<Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>} />

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-brand-50 text-brand-600"><Settings2 size={15} /></span>
          <div className="font-bold text-ink text-[15px]">Global Configuration</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Default Plan (new companies)</label>
            <select className={inputCls} value={form.defaultPlan} onChange={(e) => set({ defaultPlan: e.target.value })}>
              {planList.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Default Billing Cycle</label>
            <select className={inputCls} value={form.defaultBillingCycle} onChange={(e) => set({ defaultBillingCycle: e.target.value })}>
              <option>Quarterly</option><option>Yearly</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <input className={inputCls} value={form.currency} onChange={(e) => set({ currency: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Tax / GST (%)</label>
            <input type="number" className={inputCls} value={form.taxPercent} onChange={(e) => set({ taxPercent: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>GST Number</label>
            <input className={inputCls} value={form.gstNumber} onChange={(e) => set({ gstNumber: e.target.value })} placeholder="Optional" />
          </div>
          <div>
            <label className={labelCls}>Invoice Prefix</label>
            <input className={inputCls} value={form.invoicePrefix} onChange={(e) => set({ invoicePrefix: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Renewal Reminder (days before)</label>
            <input type="number" className={inputCls} value={form.renewalReminderDays} onChange={(e) => set({ renewalReminderDays: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>Grace Period (days)</label>
            <input type="number" className={inputCls} value={form.gracePeriodDays} onChange={(e) => set({ gracePeriodDays: Number(e.target.value) })} />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between px-3 py-3 rounded-xl border border-hairline bg-surface">
          <div>
            <div className="text-sm font-semibold text-ink">Auto-suspend on expiry</div>
            <div className="text-[11.5px] text-ink-muted">Suspend a company automatically when its subscription expires (after the grace period).</div>
          </div>
          <Toggle on={!!form.autoSuspendOnExpiry} onChange={(v) => set({ autoSuspendOnExpiry: v })} />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button icon={<Save size={15} />} onClick={save} loading={saving}>Save Settings</Button>
      </div>
    </div>
  );
};

export default PlanSettingsTab;
