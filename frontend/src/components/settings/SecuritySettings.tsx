import React, { useEffect, useState } from 'react';
import { ShieldAlert, CheckCircle2, Loader2, ShieldCheck, KeyRound } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
import { getApiErrorMessage } from '@/utils/apiError';

interface SecurityConfig {
  captchaEnabled: boolean;
  alwaysEnabled: boolean;
  failedAttemptsLimit: number;
  lockoutLimit: number;
  lockoutDuration: number;
  captchaType: 'internal' | 'google_v2' | 'google_v3';
  googleV2SiteKey: string;
  googleV2SecretKey: string;
  googleV2SecretKeyMasked?: string;
  googleV3SiteKey: string;
  googleV3SecretKey: string;
  googleV3SecretKeyMasked?: string;
}

export const SecuritySettings: React.FC = () => {
  const [cfg, setCfg] = useState<SecurityConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await api.systemSettings.security.get();
      setCfg(data);
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = (field: keyof SecurityConfig) => {
    if (!cfg) return;
    setCfg({
      ...cfg,
      [field]: !cfg[field],
    });
  };

  const handleInputChange = (field: keyof SecurityConfig, value: any) => {
    if (!cfg) return;
    setCfg({
      ...cfg,
      [field]: value,
    });
  };

  const save = async () => {
    if (!cfg) return;

    // Basic validation
    if (cfg.captchaEnabled) {
      if (cfg.captchaType === 'google_v2') {
        if (!cfg.googleV2SiteKey.trim() || (!cfg.googleV2SecretKey.trim() && cfg.googleV2SecretKeyMasked === '')) {
          ui.toast.warning('Google reCAPTCHA v2 requires both a Site Key and a Secret Key.');
          return;
        }
      } else if (cfg.captchaType === 'google_v3') {
        if (!cfg.googleV3SiteKey.trim() || (!cfg.googleV3SecretKey.trim() && cfg.googleV3SecretKeyMasked === '')) {
          ui.toast.warning('Google reCAPTCHA v3 requires both a Site Key and a Secret Key.');
          return;
        }
      }
    }

    try {
      setSaving(true);
      
      const payload: Partial<SecurityConfig> = { ...cfg };
      // Replace mask placeholder with empty so server knows to retain current key
      if (payload.googleV2SecretKey === payload.googleV2SecretKeyMasked) {
        payload.googleV2SecretKey = '••••';
      }
      if (payload.googleV3SecretKey === payload.googleV3SecretKeyMasked) {
        payload.googleV3SecretKey = '••••';
      }

      const data = await api.systemSettings.security.update(payload);
      setCfg(data);
      ui.toast.success(data?.message || 'Security settings updated successfully.');
    } catch (e) {
      ui.toast.error(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <div className="p-6 flex items-center justify-center text-sm text-slate-400">
          <Loader2 className="animate-spin mr-2" size={16} /> Loading Security Settings…
        </div>
      </Card>
    );
  }

  if (!cfg) return null;

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <ShieldAlert size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Security Settings (CAPTCHA & Account Lockout)</h3>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                cfg.captchaEnabled 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}>
                {cfg.captchaEnabled ? <CheckCircle2 size={11} /> : null}
                {cfg.captchaEnabled ? 'Protection Active' : 'Protection Disabled'}
              </span>
            </div>
            <p className="text-xs text-gray-550 mt-0.5 max-w-2xl">
              Protect the HRMS login page against brute-force attacks and bot scanning. Configure CAPTCHA challenge criteria and lockout parameters below.
            </p>

            <div className="mt-6 space-y-6 max-w-2xl">
              {/* Row 1: Enable / Always Enable */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4 border-b border-slate-100">
                <div className="flex items-start justify-between p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100">
                  <div className="pr-4">
                    <label htmlFor="captchaEnabled" className="text-xs font-bold text-slate-700 block cursor-pointer">Enable Login CAPTCHA</label>
                    <span className="text-[11px] text-slate-400 leading-relaxed block mt-0.5">Enforces CAPTCHA checks on login attempts depending on settings.</span>
                  </div>
                  <button
                    id="captchaEnabled"
                    onClick={() => handleToggle('captchaEnabled')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      cfg.captchaEnabled ? 'bg-brand-600' : 'bg-slate-200'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      cfg.captchaEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                <div className="flex items-start justify-between p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100">
                  <div className="pr-4">
                    <label htmlFor="alwaysEnabled" className="text-xs font-bold text-slate-700 block cursor-pointer">Always Show CAPTCHA</label>
                    <span className="text-[11px] text-slate-400 leading-relaxed block mt-0.5">Challenges users immediately on loading the page before any credentials verify.</span>
                  </div>
                  <button
                    id="alwaysEnabled"
                    disabled={!cfg.captchaEnabled}
                    onClick={() => handleToggle('alwaysEnabled')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      !cfg.captchaEnabled ? 'bg-slate-100 cursor-not-allowed' : cfg.alwaysEnabled ? 'bg-brand-600' : 'bg-slate-200'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      cfg.alwaysEnabled && cfg.captchaEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>

              {cfg.captchaEnabled && (
                <>
                  {/* Row 2: Failed Attempts & Lockouts */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                        Challenge after failed tries
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={cfg.failedAttemptsLimit}
                        onChange={e => handleInputChange('failedAttemptsLimit', Math.max(1, parseInt(e.target.value) || 0))}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
                      />
                      <span className="text-[10px] text-slate-400">Default: 3 attempts.</span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                        Lock account after failed tries
                      </label>
                      <input
                        type="number"
                        min={2}
                        max={20}
                        value={cfg.lockoutLimit}
                        onChange={e => handleInputChange('lockoutLimit', Math.max(1, parseInt(e.target.value) || 0))}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
                      />
                      <span className="text-[10px] text-slate-400">Default: 5 attempts.</span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                        Lock Duration (Minutes)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={cfg.lockoutDuration}
                        onChange={e => handleInputChange('lockoutDuration', Math.max(1, parseInt(e.target.value) || 0))}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
                      />
                      <span className="text-[10px] text-slate-400">Default: 10 mins.</span>
                    </div>
                  </div>

                  {/* Row 3: CAPTCHA Type Selection */}
                  <div className="flex flex-col gap-2 pt-2">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                      CAPTCHA Provider / Type
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { id: 'internal', title: 'Internal CAPTCHA', desc: 'Self-hosted offline, no external APIs' },
                        { id: 'google_v2', title: 'reCAPTCHA v2', desc: 'Google "I\'m not a robot" checkbox' },
                        { id: 'google_v3', title: 'reCAPTCHA v3', desc: 'Invisible passive user assessment' }
                      ].map(type => (
                        <div
                          key={type.id}
                          onClick={() => handleInputChange('captchaType', type.id)}
                          className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                            cfg.captchaType === type.id
                              ? 'border-brand-600 bg-brand-50/20'
                              : 'border-slate-250 hover:border-slate-400 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="captchaType"
                              checked={cfg.captchaType === type.id}
                              onChange={() => {}}
                              className="accent-brand-600"
                            />
                            <span className="text-xs font-bold text-slate-800">{type.title}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 block leading-relaxed">{type.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* reCAPTCHA v2 keys */}
                  {cfg.captchaType === 'google_v2' && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Google reCAPTCHA v2 Site Key</label>
                        <input
                          type="text"
                          value={cfg.googleV2SiteKey}
                          onChange={e => handleInputChange('googleV2SiteKey', e.target.value)}
                          placeholder="Paste reCAPTCHA v2 site key"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-850 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Google reCAPTCHA v2 Secret Key</label>
                        <input
                          type="password"
                          value={cfg.googleV2SecretKey === '••••' ? '' : cfg.googleV2SecretKey}
                          onChange={e => handleInputChange('googleV2SecretKey', e.target.value)}
                          placeholder={cfg.googleV2SecretKeyMasked || 'Paste reCAPTCHA v2 secret key'}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-850 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
                        />
                      </div>
                    </div>
                  )}

                  {/* reCAPTCHA v3 keys */}
                  {cfg.captchaType === 'google_v3' && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Google reCAPTCHA v3 Site Key</label>
                        <input
                          type="text"
                          value={cfg.googleV3SiteKey}
                          onChange={e => handleInputChange('googleV3SiteKey', e.target.value)}
                          placeholder="Paste reCAPTCHA v3 site key"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-850 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Google reCAPTCHA v3 Secret Key</label>
                        <input
                          type="password"
                          value={cfg.googleV3SecretKey === '••••' ? '' : cfg.googleV3SecretKey}
                          onChange={e => handleInputChange('googleV3SecretKey', e.target.value)}
                          placeholder={cfg.googleV3SecretKeyMasked || 'Paste reCAPTCHA v3 secret key'}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-850 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <Button size="sm" onClick={save} loading={saving} disabled={saving} icon={<ShieldCheck size={14} />}>
                  Save Settings
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
