import React, { useCallback, useEffect, useState } from 'react';
import {
  Globe, RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2, Copy, Trash2, Plus, Save, FlaskConical,
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { formatDateTime } from '@/utils/formatDate';

interface Props { role?: string | null }

const LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-ink-muted';

const STATUS_LABEL: Record<string, string> = {
  PENDING_DNS: 'Pending DNS',
  DNS_VERIFIED: 'DNS Verified',
  SSL_PENDING: 'SSL Pending',
  SSL_ISSUED: 'SSL Issued',
  ACTIVE: 'Active',
  FAILED: 'Failed',
  DISABLED: 'Disabled',
};
const STATUS_BADGE: Record<string, any> = {
  PENDING_DNS: 'warning', DNS_VERIFIED: 'blue', SSL_PENDING: 'warning',
  SSL_ISSUED: 'blue', ACTIVE: 'green', FAILED: 'danger', DISABLED: 'gray',
};
const STATUS_FLOW = ['PENDING_DNS', 'DNS_VERIFIED', 'SSL_PENDING', 'SSL_ISSUED', 'ACTIVE'];

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    ui.toast.success('Copied to clipboard.');
  } catch {
    ui.toast.error('Could not copy — please copy manually.');
  }
};

/**
 * 🧪 Custom Domain (Beta) — map the workspace to the company's own domain
 * (hr.company.com), with DNS instructions, verification, automatic SSL and
 * white-label branding. Company Head manages; HR is read-only (enforced
 * server-side too).
 */
export const CustomDomain: React.FC<Props> = ({ role }) => {
  const [data, setData] = useState<any | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'upgrade' | 'denied' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [busy, setBusy] = useState<'' | 'add' | 'verify' | 'remove' | 'wl' | 'health'>('');
  const [wl, setWl] = useState<any>({});
  const [health, setHealth] = useState<any | null>(null);

  const canManage = data?.canManage && role === 'Company Head';
  const mapping = data?.mapping;

  const loadData = useCallback(async () => {
    setState((s) => (s === 'ready' ? s : 'loading'));
    try {
      const d = await api.customDomain.overview();
      setData(d);
      setWl(d?.whiteLabel || {});
      setState('ready');
    } catch (e: any) {
      const msg = String(e?.message || '');
      // Distinguish the real failure instead of one generic message.
      if (/premium plan|upgrade your subscription/i.test(msg)) setState('upgrade');
      else if (/do not have access|only a company head/i.test(msg)) { setErrMsg(msg); setState('denied'); }
      else { setErrMsg(msg || 'The server could not be reached.'); setState('error'); }
    }
  }, []);

  const runHealthCheck = useCallback(async () => {
    setBusy('health');
    try {
      setHealth(await api.customDomain.health());
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not run the health check.');
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = async () => {
    if (!domainInput.trim() || busy) return;
    setBusy('add');
    try {
      await api.customDomain.addDomain(domainInput.trim());
      ui.toast.success('Domain added. Create the DNS records below, then click Verify.');
      setDomainInput('');
      loadData();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not add the domain.');
    } finally {
      setBusy('');
    }
  };

  const handleVerify = async (refresh = false) => {
    if (busy) return;
    setBusy('verify');
    try {
      const res = refresh ? await api.customDomain.refresh() : await api.customDomain.verify();
      if (res?.mapping?.status === 'ACTIVE') ui.toast.success('Your custom domain is ACTIVE. 🎉');
      else if (res?.dns?.ok) ui.toast.success('DNS verified. SSL provisioning is in progress.');
      else ui.toast.warning('DNS is not pointing at us yet. Changes can take up to 24–48 hours to propagate.');
      loadData();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Verification failed.');
    } finally {
      setBusy('');
    }
  };

  const handleRemove = async () => {
    if (busy) return;
    const okRemove = await ui.confirm({
      title: 'Remove custom domain?',
      message: `${mapping?.domain} will stop routing to your workspace immediately. You can add a domain again later.`,
      confirmText: 'Remove Domain',
      variant: 'danger',
    });
    if (!okRemove) return;
    setBusy('remove');
    try {
      await api.customDomain.remove();
      ui.toast.success('Custom domain removed.');
      loadData();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not remove the domain.');
    } finally {
      setBusy('');
    }
  };

  const handleSaveWl = async () => {
    if (busy) return;
    setBusy('wl');
    try {
      await api.customDomain.saveWhiteLabel(wl);
      ui.toast.success('White-label settings saved.');
      loadData();
    } catch (e: any) {
      ui.toast.error(e?.message || 'Could not save white-label settings.');
    } finally {
      setBusy('');
    }
  };

  const instructions = data?.instructions;
  const flowIdx = mapping ? STATUS_FLOW.indexOf(mapping.status) : -1;

  const wlField = (key: string, label: string, placeholder = '', type: 'text' | 'email' = 'text') => (
    <div>
      <span className={LABEL}>{label}</span>
      <input
        type={type}
        value={wl?.[key] ?? ''}
        disabled={!canManage}
        placeholder={placeholder}
        onChange={(e) => setWl({ ...wl, [key]: e.target.value })}
        className="mt-1 w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-[12.5px] font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
      />
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-[1000px] mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Globe className="w-6 h-6 text-brand-500" />
        <div>
          <h1 className="text-[20px] font-bold text-ink font-heading inline-flex items-center gap-2">
            Custom Domain <Badge variant="purple"><FlaskConical className="w-3 h-3" /> Beta</Badge>
          </h1>
          <p className="text-[12.5px] font-medium text-ink-secondary">
            Access your workspace on your own domain — hr.yourcompany.com instead of app.zeniahr.com.
          </p>
        </div>
      </div>

      <p className="text-[12px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
        🧪 {data?.betaNotice || 'Custom Domain is currently in Beta. Some advanced branding features will be added in future updates.'}
      </p>

      {state === 'loading' ? (
        /* Skeleton loader — mirrors the page layout while fetching */
        <div className="space-y-4 animate-pulse" aria-busy="true">
          {[36, 160, 120].map((h, i) => (
            <div key={i} className="rounded-card border border-hairline bg-surface-muted" style={{ height: h }} />
          ))}
        </div>
      ) : state === 'upgrade' ? (
        /* Plan does not include Custom Domain → upgrade card, no config controls */
        <div className="rounded-card border border-brand-200 bg-brand-50/40 p-6 text-center space-y-3">
          <Globe className="w-8 h-8 text-brand-500 mx-auto" />
          <p className="text-[15px] font-bold text-ink">Custom Domain is a premium feature</p>
          <p className="text-[12.5px] font-medium text-ink-secondary max-w-md mx-auto">
            Custom Domain (Beta) is included with every paid plan. Upgrade your subscription to run ZeniaHR on your own domain.
          </p>
          <Button variant="primary" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('hrms:upgrade-plan'))}>Upgrade Plan</Button>
        </div>
      ) : state === 'denied' ? (
        <p className="text-[13px] font-semibold text-ink bg-surface-muted border border-hairline rounded-xl px-4 py-3 inline-flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> {errMsg || 'Only your Company Head can access custom domain settings.'}
        </p>
      ) : state === 'error' ? (
        <div className="py-10 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-[13.5px] font-semibold text-ink">Could not load custom domain settings.</p>
          {errMsg && <p className="text-[12px] font-medium text-ink-secondary mt-1">{errMsg}</p>}
          <Button variant="primary" size="sm" className="mt-4" onClick={loadData} icon={<RefreshCw className="w-3.5 h-3.5" />}>Retry</Button>
        </div>
      ) : (
        <>
          {!mapping ? (
            /* Step 2–3: explain + enter the domain */
            <div className="rounded-card border border-hairline bg-surface p-5 space-y-4">
              <div>
                <p className="text-[14px] font-bold text-ink mb-1">How it works</p>
                <ol className="text-[12.5px] font-medium text-ink-secondary space-y-1 list-decimal list-inside">
                  <li>Enter a subdomain you own, e.g. <span className="font-bold text-ink">hr.yourcompany.com</span>, <span className="font-semibold">employees.yourcompany.com</span> or <span className="font-semibold">portal.yourcompany.com</span>.</li>
                  <li>Create the DNS records we show you (a copy-paste CNAME).</li>
                  <li>Click Verify — we check DNS, issue the SSL certificate automatically, and activate the domain.</li>
                  <li>Your team logs in at your domain with your logo and colors. SSL is renewed automatically — you never handle certificates.</li>
                </ol>
              </div>
              {canManage ? (
                <div className="flex items-center gap-2">
                  <input
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder="hr.yourcompany.com"
                    className="w-72 rounded-xl border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <Button variant="primary" size="sm" onClick={handleAdd} disabled={busy === 'add'} icon={busy === 'add' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}>
                    {busy === 'add' ? 'Adding…' : 'Add Domain'}
                  </Button>
                </div>
              ) : (
                <p className="text-[12.5px] font-medium text-ink-secondary inline-flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Only your Company Head can add a custom domain. You have read-only access.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Status card */}
              <div className="rounded-card border border-hairline bg-surface p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className={LABEL}>Your Domain</span>
                    <p className="text-[18px] font-bold text-ink tabular-nums">{mapping.domain}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_BADGE[mapping.status] || 'gray'} dot>{STATUS_LABEL[mapping.status] || mapping.status}</Badge>
                    <Badge variant={mapping.sslStatus === 'ISSUED' ? 'green' : mapping.sslStatus === 'RENEWAL_FAILED' ? 'danger' : 'gray'}>
                      SSL: {mapping.sslStatus === 'ISSUED' ? 'Issued' : mapping.sslStatus === 'PENDING' ? 'Pending' : mapping.sslStatus === 'RENEWAL_FAILED' ? 'Renewal Failed' : '—'}
                    </Badge>
                  </div>
                </div>

                {/* Status rail */}
                <div className="flex items-center gap-1 flex-wrap">
                  {STATUS_FLOW.map((s, i) => (
                    <React.Fragment key={s}>
                      {i > 0 && <span className={`w-5 h-px ${i <= flowIdx ? 'bg-emerald-400' : 'bg-hairline'}`} />}
                      <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${i < flowIdx ? 'bg-emerald-50 text-emerald-700' : i === flowIdx ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-muted'}`}>
                        {STATUS_LABEL[s]}
                      </span>
                    </React.Fragment>
                  ))}
                </div>

                {mapping.status === 'ACTIVE' && (
                  <p className="text-[12.5px] font-semibold text-emerald-700 inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Your workspace is live at <a className="underline" href={`https://${mapping.domain}`} target="_blank" rel="noreferrer">https://{mapping.domain}</a>
                  </p>
                )}
                {mapping.lastError && mapping.status !== 'ACTIVE' && (
                  <p className="text-[12px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{mapping.lastError}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-medium text-ink-muted">
                  {mapping.dnsCheckedAt && <span>Last checked: {formatDateTime(mapping.dnsCheckedAt)}</span>}
                  {mapping.sslExpiresAt && <span>· SSL renews before: {formatDateTime(mapping.sslExpiresAt)}</span>}
                </div>

                <div className="flex flex-wrap gap-2">
                  {canManage && (
                    <Button variant="primary" size="sm" onClick={() => handleVerify(false)} disabled={busy === 'verify'} icon={busy === 'verify' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}>
                      {busy === 'verify' ? 'Checking…' : 'Verify'}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleVerify(true)} disabled={busy === 'verify'} icon={<RefreshCw className="w-3.5 h-3.5" />}>Refresh Status</Button>
                  {canManage && (
                    <Button variant="outline" size="sm" onClick={handleRemove} disabled={busy === 'remove'} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}>Remove Domain</Button>
                  )}
                </div>
              </div>

              {/* Workspace URLs */}
              <div className="rounded-card border border-hairline bg-surface p-5 grid sm:grid-cols-2 gap-4">
                <div>
                  <span className={LABEL}>Current Workspace URL</span>
                  <p className="text-[13px] font-bold text-ink tabular-nums mt-0.5">https://app.zeniahr.com</p>
                </div>
                <div>
                  <span className={LABEL}>{mapping.status === 'ACTIVE' ? 'Your Custom Domain' : 'Future Custom Domain'}</span>
                  <p className="text-[13px] font-bold text-brand-700 tabular-nums mt-0.5">https://{mapping.domain}</p>
                </div>
              </div>

              {/* Domain health */}
              <div className="rounded-card border border-hairline bg-surface p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-bold text-ink">Domain Health</p>
                  <Button variant="outline" size="sm" onClick={runHealthCheck} disabled={busy === 'health'} icon={busy === 'health' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}>
                    {busy === 'health' ? 'Checking…' : 'Run Health Check'}
                  </Button>
                </div>
                {health ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[12px] font-medium">
                    <div><span className={LABEL}>Overall</span><p className="mt-0.5"><Badge variant={health.healthStatus === 'HEALTHY' ? 'green' : health.healthStatus === 'DEGRADED' ? 'warning' : 'danger'} dot>{health.healthStatus}</Badge></p></div>
                    <div><span className={LABEL}>DNS</span><p className="mt-0.5"><Badge variant={health.health?.dns?.ok ? 'green' : 'danger'}>{health.health?.dns?.ok ? 'Resolving to us' : 'Not resolving'}</Badge></p></div>
                    <div><span className={LABEL}>SSL</span><p className="mt-0.5"><Badge variant={health.health?.ssl?.status === 'ISSUED' ? 'green' : 'warning'}>{health.health?.ssl?.status}{health.health?.ssl?.daysToExpiry != null ? ` · ${health.health.ssl.daysToExpiry}d left` : ''}</Badge></p></div>
                    <div><span className={LABEL}>HTTPS</span><p className="mt-0.5"><Badge variant={health.health?.https?.reachable ? 'green' : 'danger'}>{health.health?.https?.reachable ? `Reachable (${health.health.https.statusCode}${health.health?.https?.responseTimeMs != null ? ` · ${health.health.https.responseTimeMs}ms` : ''})` : health.health?.https?.error || 'Unreachable'}</Badge></p></div>
                    {health.health?.https?.redirect && (
                      <div className="sm:col-span-2"><span className={LABEL}>Redirect</span><p className="text-ink-secondary mt-0.5 break-all">{health.health.https.redirect}</p></div>
                    )}
                    {health.health?.securityHeaders && (
                      <div className="sm:col-span-2 lg:col-span-4">
                        <span className={LABEL}>Security Headers</span>
                        <p className="text-ink-secondary mt-0.5">
                          HSTS: {health.health.securityHeaders.strictTransportSecurity ? '✓' : '—'} · X-Content-Type-Options: {health.health.securityHeaders.xContentTypeOptions ? '✓' : '—'} · X-Frame-Options: {health.health.securityHeaders.xFrameOptions ? '✓' : '—'} · CSP: {health.health.securityHeaders.contentSecurityPolicy ? '✓' : '—'}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[12px] font-medium text-ink-secondary">
                    Checks DNS, SSL, HTTPS reachability, redirects, response time, certificate expiry and security headers. The platform also monitors this automatically and notifies you if the domain degrades.
                  </p>
                )}
              </div>

              {/* DNS instructions */}
              {instructions && mapping.status !== 'ACTIVE' && (
                <div className="rounded-card border border-hairline bg-surface p-5 space-y-3">
                  <p className="text-[14px] font-bold text-ink">DNS records to create at your domain provider</p>
                  <div className="rounded-xl border border-hairline overflow-hidden">
                    <table className="w-full text-left">
                      <thead><tr className="bg-surface-muted border-b border-hairline">
                        {['Type', 'Host', 'Value', ''].map((h, i) => <th key={i} className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-secondary">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        <tr className="border-b border-hairline">
                          <td className="px-3 py-2.5 text-[12px] font-bold">CNAME</td>
                          <td className="px-3 py-2.5 text-[12px] font-semibold tabular-nums">{instructions.cname.host}</td>
                          <td className="px-3 py-2.5 text-[12px] font-semibold tabular-nums">{instructions.cname.target}</td>
                          <td className="px-3 py-2.5"><button type="button" onClick={() => copyText(instructions.cname.target)} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700"><Copy className="w-3.5 h-3.5" /> Copy</button></td>
                        </tr>
                        {instructions.aRecord && (
                          <tr className="border-b border-hairline">
                            <td className="px-3 py-2.5 text-[12px] font-bold">A <span className="font-medium text-ink-muted">(alternative)</span></td>
                            <td className="px-3 py-2.5 text-[12px] font-semibold tabular-nums">{instructions.aRecord.host}</td>
                            <td className="px-3 py-2.5 text-[12px] font-semibold tabular-nums">{instructions.aRecord.target}</td>
                            <td className="px-3 py-2.5"><button type="button" onClick={() => copyText(instructions.aRecord.target)} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700"><Copy className="w-3.5 h-3.5" /> Copy</button></td>
                          </tr>
                        )}
                        <tr>
                          <td className="px-3 py-2.5 text-[12px] font-bold">TXT <span className="font-medium text-ink-muted">(ownership)</span></td>
                          <td className="px-3 py-2.5 text-[12px] font-semibold tabular-nums break-all">{instructions.txt.host}</td>
                          <td className="px-3 py-2.5 text-[12px] font-semibold tabular-nums break-all">{instructions.txt.value}</td>
                          <td className="px-3 py-2.5"><button type="button" onClick={() => copyText(instructions.txt.value)} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700"><Copy className="w-3.5 h-3.5" /> Copy</button></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11.5px] font-medium text-ink-muted">
                    DNS changes can take up to 24–48 hours to propagate. SSL is issued and renewed automatically once DNS is verified — you never upload a certificate.
                  </p>
                </div>
              )}
            </>
          )}

          {/* White label options */}
          <div className="rounded-card border border-hairline bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-bold text-ink">White Label</p>
              <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={!!wl?.enabled}
                  disabled={!canManage}
                  onChange={(e) => setWl({ ...wl, enabled: e.target.checked })}
                  className="w-4 h-4 accent-[var(--brand-600,#7c3aed)]"
                />
                Enable white-label branding
              </label>
            </div>
            <p className="text-[12px] font-medium text-ink-secondary">
              With white label enabled, your custom-domain login page shows your logo, name and colors — with no ZeniaHR branding.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {wlField('logoUrl', 'Company Logo URL', 'https://…/logo.png')}
              {wlField('faviconUrl', 'Favicon URL', 'https://…/favicon.ico')}
              {wlField('primaryColor', 'Primary Color', '#16284A')}
              {wlField('secondaryColor', 'Secondary Color', '#C67B49')}
              {wlField('loginBackground', 'Login Background Image URL', 'https://…/background.jpg')}
              {wlField('supportEmail', 'Support Email', 'support@yourcompany.com', 'email')}
              {wlField('supportPhone', 'Support Phone', '+91 …')}
              {wlField('footerText', 'Footer Text', '© Your Company')}
            </div>
            {canManage && (
              <Button variant="primary" size="sm" onClick={handleSaveWl} disabled={busy === 'wl'} icon={busy === 'wl' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}>
                {busy === 'wl' ? 'Saving…' : 'Save White Label Settings'}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CustomDomain;
