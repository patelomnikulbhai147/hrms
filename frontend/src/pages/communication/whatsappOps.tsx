// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Operations (Phase 5) — the enterprise control surfaces that complete
// the WhatsApp platform, all consuming the existing/extended backend:
//   • WhatsAppHealthTab     — health dashboard, production readiness, webhook
//                             diagnostics, retry policy, queue monitor, audit.
//   • WhatsAppExplorerTab   — delivery analytics, message search, the message
//                             inspector (lifecycle timeline + webhook events) and
//                             a per-employee conversation viewer.
//   • WhatsAppWidget        — compact dashboard widget.
// Nothing here changes the queue / automation / Meta / delivery-log architecture.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Search, Eye, X,
  Webhook, Send, Clock, History, Inbox, Gauge, Zap, MessageCircle, ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDateTime } from '@/utils/formatDate';

const statusVariant = (st: string): any => ({ Sent: 'blue', Delivered: 'purple', Read: 'green', Failed: 'red', Pending: 'amber', Processing: 'blue', Simulated: 'gray', Queued: 'gray' } as any)[st] || 'gray';
const selCls = 'rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] focus:border-[#C77E52] focus:outline-none';
const fmt = (d: any) => (d ? formatDateTime(d) : '—');

const HealthPill: React.FC<{ label: string; ok: boolean; value?: string }> = ({ label, ok, value }) => (
  <div className={`flex items-center justify-between rounded-xl border px-3 py-2 ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
    <span className="text-[11px] font-semibold text-slate-600">{label}</span>
    <span className={`flex items-center gap-1 text-[11px] font-bold ${ok ? 'text-emerald-700' : 'text-slate-400'}`}>
      {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{value || (ok ? 'OK' : 'No')}
    </span>
  </div>
);
const StatCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; tone?: string }> = ({ label, value, icon, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${tone || 'bg-slate-100 text-slate-500'}`}>{icon}</div>
    <p className="text-2xl font-extrabold text-slate-800">{value}</p>
    <p className="text-[11px] font-semibold text-slate-400">{label}</p>
  </div>
);

// ── Health, Webhook Diagnostics, Production Readiness, Queue Monitor, Audit ────
export const WhatsAppHealthTab: React.FC = () => {
  const [hd, setHd] = useState<any>(null);
  const [policy, setPolicy] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [queue, setQueue] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [h, p, s, q, a] = await Promise.all([
        api.communication.whatsapp.webhookHealth().catch(() => null),
        api.communication.whatsapp.retryPolicy().catch(() => null),
        api.communication.whatsapp.settings.get().catch(() => null),
        api.communication.whatsapp.queueMonitor().catch(() => null),
        api.communication.audit.list('whatsapp').catch(() => []),
      ]);
      setHd(h); setPolicy(p); setSettings(s); setQueue(q); setAudit(Array.isArray(a) ? a : []);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const retry = async () => {
    setBusy(true);
    try { const r = await api.communication.whatsapp.retry(); ui.toast.success(`Retry complete — ${r.succeeded}/${r.retried} succeeded, ${r.skipped} skipped.`); await load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const h = hd?.health || {};
  const webhookCallbackUrl = (settings?.webhookUrl) || `${window.location.origin.replace(/:\d+$/, ':5000')}/api/whatsapp/webhook`;

  if (loading) return <div className="py-16 text-center text-sm text-slate-500">Loading WhatsApp health…</div>;

  return (
    <div className="space-y-4">
      {/* Production readiness banner */}
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3 ${hd?.productionReady ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <p className={`flex items-center gap-2 text-sm font-extrabold ${hd?.productionReady ? 'text-emerald-800' : 'text-amber-800'}`}>
          <ShieldCheck size={16} /> {hd?.productionReady ? 'Production Ready' : 'Not Production Ready'}
        </p>
        <Button size="sm" variant="outline" icon={<RefreshCw size={13} />} onClick={() => { setLoading(true); load(); }}>Refresh</Button>
      </div>

      {/* Company WhatsApp Health Dashboard */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><Activity size={14} className="text-emerald-600" /> Company WhatsApp Health</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <HealthPill label="Meta Connected" ok={!!h.metaConnected} />
          <HealthPill label="Webhook Connected" ok={!!h.webhookConnected} />
          <HealthPill label="Phone Verified" ok={!!h.phoneVerified} />
          <HealthPill label="Business Verified" ok={!!h.businessVerified} />
          <HealthPill label="Access Token Valid" ok={!!h.tokenValid} />
          <HealthPill label="Webhook Receiving Events" ok={!!h.webhookReceiving} />
          <HealthPill label="Quality Rating" ok={!!h.qualityRating} value={h.qualityRating || 'N/A'} />
          <HealthPill label="Messaging Limit" ok={!!h.messagingLimitTier} value={h.messagingLimitTier || 'N/A'} />
          <HealthPill label="Environment" ok={h.environment === 'production'} value={h.environment || 'unconfigured'} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="text-slate-400">Last Successful API Call: </span><span className="font-bold text-slate-700">{fmt(h.lastSuccessfulApiCall)}</span></div>
          <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="text-slate-400">Last Webhook Event: </span><span className="font-bold text-slate-700">{fmt(h.lastWebhookAt)}</span></div>
        </div>
      </div>

      {/* Production Readiness checklist */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><ListChecks size={14} className="text-brand-600" /> Production Readiness Checklist</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(hd?.checklist || []).map((c: any) => (
            <div key={c.key} className="flex items-center gap-2 text-[12px]">
              {c.ok ? <CheckCircle2 size={15} className="text-emerald-600" /> : <XCircle size={15} className="text-slate-300" />}
              <span className={c.ok ? 'font-semibold text-slate-700' : 'text-slate-400'}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Webhook Diagnostics */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><Webhook size={14} className="text-brand-600" /> Webhook Diagnostics</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <HealthPill label="Verification Handshake" ok={!!h.webhookConnected} value={h.webhookConnected ? 'Verified' : 'Pending'} />
          <HealthPill label="Receiving Events" ok={!!h.webhookReceiving} />
          <HealthPill label="Verify Token Set" ok={!!settings?.hasVerifyToken} />
        </div>
        <div className="mt-3 space-y-2 text-[11px]">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-slate-400">Callback URL (set this in Meta → WhatsApp → Configuration → Webhook)</p>
            <p className="mt-0.5 font-mono break-all font-bold text-slate-700">{webhookCallbackUrl}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">Webhook events recorded: <b>{hd?.webhookEventCount ?? 0}</b>{h.webhookFailureReason ? <span className="text-rose-600"> · Last failure: {h.webhookFailureReason}</span> : ''}</div>
          {(hd?.recentEvents || []).length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-500"><tr>{['Status', 'wamid', 'Recipient', 'At'].map(x => <th key={x} className="px-2 py-1.5 text-left font-bold">{x}</th>)}</tr></thead>
                <tbody>
                  {hd.recentEvents.map((e: any) => (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="px-2 py-1"><Badge variant={statusVariant(e.status[0]?.toUpperCase() + e.status.slice(1))}>{e.status}</Badge></td>
                      <td className="px-2 py-1 font-mono">{e.metaMessageId ? `${String(e.metaMessageId).slice(0, 18)}…` : '—'}</td>
                      <td className="px-2 py-1">{e.recipient || '—'}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{fmt(e.eventAt || e.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Queue Monitor + Retry policy */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><Inbox size={14} className="text-amber-600" /> Queue Monitor</p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(queue?.buckets || {}).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                <p className="text-lg font-extrabold text-slate-800">{v as any}</p><p className="text-[10px] font-semibold text-slate-400">{k}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Worker: <Badge variant="green">{queue?.worker?.status || 'Ready'}</Badge> <span className="text-slate-400">({queue?.worker?.mode})</span></span>
            <span className="text-slate-400">Est. processing: {queue?.estimatedProcessingMs != null ? `${Math.round((queue.estimatedProcessingMs) / 1000)}s` : '—'}</span>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">{queue?.worker?.note}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><Zap size={14} className="text-rose-600" /> Retry Engine</p>
            <Button size="sm" icon={<RefreshCw size={13} />} disabled={busy} onClick={retry}>{busy ? 'Retrying…' : 'Retry Transient Failures'}</Button>
          </div>
          <p className="text-[11px] text-slate-500">Max attempts: <b>{policy?.maxAttempts ?? '—'}</b></p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-emerald-600">Retries</p>
          <p className="text-[11px] text-slate-500">{(policy?.retryOn || []).join(' · ')}</p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-rose-600">Never retries</p>
          <p className="text-[11px] text-slate-500">{(policy?.neverRetry || []).join(' · ')}</p>
        </div>
      </div>

      {/* Enterprise Audit */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><History size={14} className="text-slate-600" /> WhatsApp Audit Trail</p>
        {audit.length === 0 ? <p className="py-6 text-center text-[11px] text-slate-400">No WhatsApp activity recorded yet.</p>
          : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {audit.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-1.5 text-[11px]">
                  <div className="min-w-0"><span className="font-bold text-slate-700">{a.action}</span>{a.detail && <span className="text-slate-500"> · {a.detail}</span>}<p className="truncate text-[10px] text-slate-400">{a.actorName}</p></div>
                  <span className="whitespace-nowrap text-[10px] text-slate-400">{fmt(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
};

// ── Analytics + Search + Inspector + Conversation ─────────────────────────────
const TIMELINE_STAGES = ['Queued', 'Sent', 'Delivered', 'Read', 'Failed'];
export const WhatsAppExplorerTab: React.FC = () => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [filters, setFilters] = useState({ employee: '', mobile: '', wamid: '', template: '', status: 'All', from: '', to: '' });

  const loadAnalytics = async () => { try { setAnalytics(await api.communication.whatsapp.analytics()); } catch { /* */ } };
  const search = async () => {
    setLoading(true);
    try { setRows(await api.communication.whatsapp.messagesSearch(filters as any)); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadAnalytics(); search(); const t = setInterval(() => { loadAnalytics(); }, 30000); return () => clearInterval(t); /* eslint-disable-next-line */ }, []);

  const openDetail = async (id: any) => {
    try { setDetail(await api.communication.whatsapp.messageDetail(id)); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };

  const a = analytics?.today || {};
  return (
    <div className="space-y-4">
      {/* Delivery analytics (today) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Messages Today" value={analytics ? a.messages ?? 0 : '—'} icon={<MessageCircle size={16} />} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label="Delivered" value={analytics ? a.delivered ?? 0 : '—'} icon={<CheckCircle2 size={16} />} tone="bg-brand-50 text-brand-600" />
        <StatCard label="Read" value={analytics ? a.read ?? 0 : '—'} icon={<Eye size={16} />} tone="bg-teal-50 text-teal-600" />
        <StatCard label="Failed" value={analytics ? a.failed ?? 0 : '—'} icon={<AlertTriangle size={16} />} tone="bg-rose-50 text-rose-600" />
        <StatCard label="Pending" value={analytics ? analytics.pending ?? 0 : '—'} icon={<Clock size={16} />} tone="bg-amber-50 text-amber-600" />
        <StatCard label="Success Rate" value={analytics ? `${a.successRate ?? 0}%` : '—'} icon={<Gauge size={16} />} tone="bg-brand-50 text-brand-600" />
        <StatCard label="Read Rate" value={analytics ? `${a.readRate ?? 0}%` : '—'} icon={<Activity size={16} />} tone="bg-brand-50 text-brand-600" />
        <StatCard label="Avg Delivery" value={analytics ? (a.avgDeliverySeconds != null ? `${a.avgDeliverySeconds}s` : '—') : '—'} icon={<Zap size={16} />} tone="bg-slate-100 text-slate-500" />
      </div>

      {/* Search */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><Search size={14} className="text-[#C77E52]" /> Message Search</p>
        <div className="flex flex-wrap items-end gap-2">
          {([['employee', 'Employee'], ['mobile', 'Mobile'], ['wamid', 'Meta Message ID'], ['template', 'Template']] as const).map(([k, label]) => (
            <div key={k} className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
              <input value={(filters as any)[k]} onChange={e => setFilters(f => ({ ...f, [k]: e.target.value }))} className={selCls} placeholder="…" /></div>
          ))}
          <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Status</span>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className={selCls}>{['All', 'Sent', 'Delivered', 'Read', 'Failed', 'Pending', 'Simulated'].map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">From</span><input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} className={selCls} /></div>
          <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">To</span><input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} className={selCls} /></div>
          <Button size="sm" icon={<Search size={13} />} onClick={search}>Search</Button>
          <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { setFilters({ employee: '', mobile: '', wamid: '', template: '', status: 'All', from: '', to: '' }); setTimeout(search, 0); }}>Clear</Button>
        </div>
      </div>

      {/* Results */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5"><p className="text-xs font-extrabold text-slate-700">Messages <span className="text-[10px] font-semibold text-slate-400">({rows.length})</span></p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>{['Employee', 'Template', 'Recipient', 'Status', 'Meta Message ID', 'Created', 'Action'].map(h => <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">Loading…</td></tr>
                : rows.length === 0 ? <tr><td colSpan={7} className="px-3 py-12 text-center text-slate-400">No messages match your search.</td></tr>
                  : rows.map(l => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-700">{l.employeeName || '—'}</td>
                      <td className="px-3 py-2">{l.templateName || '—'}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{l.actualSentNumber || l.originalNumber || '—'}</td>
                      <td className="px-3 py-2"><Badge variant={statusVariant(l.status)}>{l.status}</Badge></td>
                      <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{l.metaMessageId ? `${String(l.metaMessageId).slice(0, 20)}…` : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmt(l.createdAt)}</td>
                      <td className="px-3 py-2"><button onClick={() => openDetail(l.id)} className="text-[10px] font-bold text-emerald-600 hover:underline">Inspect</button></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Message Inspector drawer */}
      {detail && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setDetail(null)} />
          <div className="relative h-full w-full max-w-lg overflow-y-auto border-l border-slate-200 bg-white shadow-2xl animate-slide-in-right">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-extrabold text-slate-800">Message Inspector</p>
              <button onClick={() => setDetail(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="space-y-4 p-4 text-[12px]">
              {/* Lifecycle timeline */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Lifecycle</p>
                <div className="space-y-0">
                  {TIMELINE_STAGES.map((stage) => {
                    const t = (detail.timeline || []).find((x: any) => x.stage === stage);
                    const done = !!(t && t.at);
                    const isFail = stage === 'Failed';
                    if (isFail && !done) return null;
                    return (
                      <div key={stage} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`flex h-5 w-5 items-center justify-center rounded-full ${done ? (isFail ? 'bg-rose-500' : 'bg-emerald-500') : 'bg-slate-200'}`}>{done ? <CheckCircle2 size={12} className="text-white" /> : <Clock size={11} className="text-slate-400" />}</div>
                          {stage !== 'Read' && <div className={`h-6 w-0.5 ${done ? 'bg-emerald-200' : 'bg-slate-150'}`} />}
                        </div>
                        <div className="pb-2"><p className={`font-bold ${done ? 'text-slate-700' : 'text-slate-400'}`}>{stage}</p><p className="text-[10px] text-slate-400">{done ? fmt(t.at) : 'Pending'}</p></div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Facts */}
              <div className="grid grid-cols-2 gap-y-2">
                <Fact k="Employee" v={detail.log?.employeeName} /><Fact k="Company" v={detail.company} />
                <Fact k="Branch" v={detail.log?.branch} /><Fact k="Queue ID" v={detail.queue ? `#${detail.queue.id}` : '—'} />
                <Fact k="Automation Rule" v={detail.automationRule?.name} /><Fact k="Retry Count" v={String(detail.retryCount ?? 0)} />
                <Fact k="Status" v={<Badge variant={statusVariant(detail.log?.status)}>{detail.log?.status}</Badge>} />
                <Fact k="Dev Mode" v={detail.log?.developmentMode ? 'Yes' : 'No'} />
              </div>
              <div><p className="text-slate-400">Meta Message ID (wamid)</p><p className="font-mono break-all text-[11px] font-bold text-slate-700">{detail.log?.metaMessageId || '—'}</p></div>
              {detail.log?.failureReason && <div><p className="text-slate-400">Failure</p><p className="font-semibold text-rose-600">{detail.log.failureReason}{detail.log.errorCode ? ` (#${detail.log.errorCode})` : ''}</p></div>}
              {/* API response (http status) */}
              <div><p className="text-slate-400">API Response</p><p className="font-semibold text-slate-700">HTTP {detail.log?.httpStatus ?? '—'} · {detail.log?.provider || 'simulated'}</p></div>
              {/* Webhook events */}
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Webhook Events ({(detail.webhookEvents || []).length})</p>
                {(detail.webhookEvents || []).length === 0 ? <p className="text-[11px] text-slate-400">No webhook events received yet.</p>
                  : (detail.webhookEvents || []).map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1 text-[11px]">
                      <Badge variant={statusVariant(e.status[0]?.toUpperCase() + e.status.slice(1))}>{e.status}</Badge>
                      <span className="text-[10px] text-slate-400">{fmt(e.eventAt || e.createdAt)}</span>
                    </div>
                  ))}
              </div>
              {detail.log?.messagePreview && <div><p className="text-slate-400">Message</p><div className="mt-1 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-800">{detail.log.messagePreview}</div></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
const Fact: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex items-start justify-between gap-2 pr-3"><span className="text-slate-400">{k}</span><span className="text-right font-semibold text-slate-700">{v || '—'}</span></div>
);

// ── Compact dashboard widget ──────────────────────────────────────────────────
export const WhatsAppWidget: React.FC = () => {
  const [a, setA] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [nextRun, setNextRun] = useState<string>('—');
  useEffect(() => {
    (async () => {
      try {
        const [an, h, rules] = await Promise.all([
          api.communication.whatsapp.analytics().catch(() => null),
          api.communication.whatsapp.webhookHealth().catch(() => null),
          api.communication.automation.rules().catch(() => []),
        ]);
        setA(an); setHealth(h);
        const active = (Array.isArray(rules) ? rules : []).filter((r: any) => String(r.status || '').toLowerCase() === 'active');
        if (active.length) { const r = active[0]; setNextRun(`${r.name} · ${r.triggerType || 'daily'}${r.scheduleTime ? ` ${r.scheduleTime}` : ''}`); }
      } catch { /* */ }
    })();
  }, []);
  const t = a?.today || {};
  const connected = !!health?.health?.metaConnected;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><MessageCircle size={14} className="text-emerald-600" /> WhatsApp</p>
        <Badge variant={connected ? 'green' : 'gray'}>{connected ? 'Connected' : 'Not Connected'}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Today', t.messages ?? 0], ['Delivered', t.delivered ?? 0], ['Read', t.read ?? 0], ['Pending', a?.pending ?? 0], ['Failed', t.failed ?? 0], ['Success', `${t.successRate ?? 0}%`]].map(([k, v]) => (
          <div key={k as string} className="rounded-lg bg-slate-50 px-2 py-1.5"><p className="text-base font-extrabold text-slate-800">{v as any}</p><p className="text-[9px] font-semibold text-slate-400">{k as string}</p></div>
        ))}
      </div>
      <p className="mt-3 truncate text-[10px] text-slate-400"><Clock size={10} className="mr-1 inline" />Next automation: {nextRun}</p>
    </div>
  );
};
