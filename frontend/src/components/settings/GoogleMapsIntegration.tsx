import React, { useEffect, useState } from 'react';
import { MapPin, CheckCircle2, XCircle, Loader2, ShieldCheck, PlugZap } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDateTime } from '@/utils/formatDate';
import { resetGoogleMaps } from '@/utils/googleMaps';

interface MapsConfig {
  configured: boolean;
  source: 'settings' | 'env' | 'none';
  status: 'connected' | 'failed' | 'unverified' | 'not_configured';
  lastVerified: string | null;
  keyPreview: string;
}

const STATUS_META: Record<MapsConfig['status'], { label: string; cls: string }> = {
  connected:      { label: 'Connected',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed:         { label: 'Connection failed', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  unverified:     { label: 'Not tested yet',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  not_configured: { label: 'Not configured',  cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

/**
 * Super-Admin-only Google Maps integration control (System Settings → Third Party
 * Integrations). The installer sets the key here ONCE; every company then uses the
 * "Select on Google Map" picker with no further configuration.
 */
export const GoogleMapsIntegration: React.FC = () => {
  const [cfg, setCfg] = useState<MapsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await api.systemSettings.googleMaps.get();
      setCfg(data);
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      setSaving(true);
      const data = await api.systemSettings.googleMaps.update({ apiKey: apiKey.trim() });
      setCfg(data);
      setApiKey('');
      resetGoogleMaps(); // force the picker to pick up the new key
      ui.toast.success(data?.message || 'Google Maps settings saved.');
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    try {
      setTesting(true);
      // Test the value being typed if present, else the saved key.
      const res = await api.systemSettings.googleMaps.test(apiKey.trim() ? { apiKey: apiKey.trim() } : undefined);
      setCfg(prev => ({ ...(prev as MapsConfig), status: res.status, lastVerified: res.lastVerified, configured: res.configured, keyPreview: res.keyPreview, source: res.source }));
      if (res.ok) ui.toast.success(res.message || 'Google Maps connected.');
      else ui.toast.error(res.message || 'Connection failed.');
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  const status = cfg?.status || 'not_configured';
  const sm = STATUS_META[status];

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <MapPin size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Google Maps</h3>
              {!loading && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${sm.cls}`}>
                  {status === 'connected' ? <CheckCircle2 size={11} /> : status === 'failed' ? <XCircle size={11} /> : null}
                  {sm.label}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
              Powers the “Select on Google Map” address picker across every company. Configure the key
              once here — company users never need any setup.
            </p>

            {loading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="animate-spin" size={16} /> Loading…</div>
            ) : (
              <div className="mt-4 space-y-3 max-w-xl">
                {/* Current key (masked) */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-slate-500">Current key:</span>
                  <span className="font-mono font-semibold text-slate-700">{cfg?.keyPreview || '— none —'}</span>
                  {cfg?.source === 'env' && (
                    <span className="text-[10px] text-slate-400">(from server environment)</span>
                  )}
                  {cfg?.lastVerified && (
                    <span className="text-[11px] text-slate-400">Last verified: {formatDateTime(cfg.lastVerified)}</span>
                  )}
                </div>

                {/* Enter / replace key */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    {cfg?.configured ? 'Replace API Key' : 'Google Maps API Key'}
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={cfg?.configured ? 'Enter a new key to replace the existing one' : 'Paste the Google Maps API key'}
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" onClick={save} loading={saving} disabled={saving || (!apiKey.trim() && !cfg?.configured)} icon={<ShieldCheck size={14} />}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={test} loading={testing} disabled={testing || (!apiKey.trim() && !cfg?.configured)} icon={<PlugZap size={14} />}>
                    Test Connection
                  </Button>
                  {apiKey.trim() && (
                    <span className="text-[11px] text-slate-400">A saved key is required before company users can use the map.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default GoogleMapsIntegration;
