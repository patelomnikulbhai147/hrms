// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Communication Workflow — Event → Template Mapping, Master Library
// browse/copy, and the Communication Health card.
//
// Company Head / HR configure ONE template per event, once. Saving an enabled
// mapping syncs the canonical automation rule server-side, so the EXISTING
// scheduler/engine deliver it automatically. An enabled event with no template is
// shown as a RED warning and never sends a generic message.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Save, Copy, Sparkles, ShieldCheck, Mail, MessageCircle, Layers, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select, Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { usePermissions } from '@/context/PermissionContext';
import { getApiErrorMessage } from '@/utils/apiError';

// A company template matches an event when its category matches an alias.
const CATEGORY_ALIASES: Record<string, string[]> = {
  birthday: ['Birthday', 'Birthday Wishes'],
  anniversary: ['Work Anniversary'],
  joining: ['Joining Anniversary', 'Welcome Messages'],
  promotion: ['Promotion', 'Promotion Congratulations'],
  confirmation: ['Confirmation'],
  leave_approved: ['Leave'],
  attendance: ['Attendance'],
  payroll: ['Payroll', 'Salary Credited'],
  payslip: ['Payslip', 'Payslip Available'],
  loan: ['Loan'],
  compliance: ['Compliance'],
  festival: ['Festival', 'Festival Greetings'],
  holiday: ['Holiday'],
  announcement: ['Announcement', 'Company Announcements'],
  custom: ['Custom', 'Custom Templates'],
};
const MODE_LABEL: Record<string, string> = { scheduled: 'Auto (scheduler)', event: 'On event', date: 'On date', manual: 'Manual / broadcast' };
const MODE_TONE: Record<string, string> = { scheduled: 'green', event: 'blue', date: 'amber', manual: 'gray' };

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <button type="button" disabled={disabled} onClick={() => !disabled && onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

// Small gradient chip preview from a template's stored design theme.
const themeOf = (t: any) => { try { const l = typeof t?.layout === 'string' ? JSON.parse(t.layout) : t?.layout; return (l && l.theme) || {}; } catch { return {}; } };
const Swatch: React.FC<{ t: any }> = ({ t }) => {
  const th = themeOf(t);
  return <span className="inline-flex h-5 w-8 items-center justify-center rounded text-[11px]" style={{ background: th.background || 'linear-gradient(135deg,#e2e8f0,#cbd5e1)', color: th.text || '#1e293b' }}>{th.emoji || '🎉'}</span>;
};

// ══════════════════════════════════════════════════════════════════════════════
// Communication Health card (Dashboard — Step 8)
// ══════════════════════════════════════════════════════════════════════════════
export const CommunicationHealthCard: React.FC<{ onConfigure?: () => void }> = ({ onConfigure }) => {
  const [h, setH] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setH(await api.communication.health()); } catch { /* silent */ } finally { setLoading(false); } })(); }, []);
  const Item: React.FC<{ label: string; value: any; tone?: string }> = ({ label, value, tone }) => (
    <div className="flex flex-col rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-lg font-extrabold ${tone || 'text-slate-700'}`}>{loading ? '—' : value}</span>
    </div>
  );
  const healthy = h?.healthy;
  return (
    <div className={`rounded-2xl border bg-white p-4 ${healthy === false ? 'border-rose-200' : 'border-slate-200'}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-800"><ShieldCheck size={16} className="text-[#4F7CFF]" /> Communication Health</h3>
        {!loading && (healthy ? <Badge variant="green">All configured</Badge> : <Badge variant="red">Action needed</Badge>)}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Item label="Configured Templates" value={h?.configuredTemplates ?? 0} />
        <Item label="Missing Templates" value={h?.missingTemplates ?? 0} tone={(h?.missingTemplates ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'} />
        <Item label="Automation Enabled" value={h?.automationEnabled ?? 0} tone="text-emerald-600" />
        <Item label="Automation Disabled" value={h?.automationDisabled ?? 0} tone="text-slate-500" />
        <Item label="WhatsApp" value={h?.whatsappConnected ? 'Connected' : 'Not Connected'} tone={h?.whatsappConnected ? 'text-emerald-600' : 'text-rose-600'} />
        <Item label="Email" value={h?.emailConnected ? 'Connected' : 'Not Connected'} tone={h?.emailConnected ? 'text-emerald-600' : 'text-slate-500'} />
        <Item label="Upcoming Events" value={h?.upcomingEvents ?? 0} tone="text-indigo-600" />
        <Item label="Events Covered" value={`${(h?.automationEnabled ?? 0)}/${h?.totalEvents ?? 15}`} />
      </div>
      {!loading && (h?.missingTemplates ?? 0) > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
          <span className="flex items-center gap-2 text-xs font-bold text-rose-700"><AlertTriangle size={14} /> {h.missingTemplates} enabled event(s) have no template — they will not send.</span>
          {onConfigure && <button onClick={onConfigure} className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-700">Fix now</button>}
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// Event → Template Mapping (Step 3 — the workflow spine)
// ══════════════════════════════════════════════════════════════════════════════
export const EventMappingTab: React.FC = () => {
  const { canEdit } = usePermissions();
  const editable = canEdit('communication');
  const [events, setEvents] = useState<any[]>([]);
  const [festivals, setFestivals] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [validation, setValidation] = useState<any>({ issues: [] });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [showFestivals, setShowFestivals] = useState(false);

  const load = async () => {
    try {
      const [em, tpls, val] = await Promise.all([api.communication.eventMappings(), api.communication.templates.list(), api.communication.mappingValidation()]);
      setEvents(em.events || []); setFestivals(em.festivals || []); setMappings(em.mappings || []);
      setTemplates((tpls || []).filter((t: any) => (t.libraryState || 'enabled') !== 'archived'));
      setValidation(val || { issues: [] });
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const mapFor = (eventKey: string, festivalKey = '') => mappings.find((m) => m.eventKey === eventKey && (m.festivalKey || '') === festivalKey) || {};
  const templatesFor = (eventKey: string) => {
    const aliases = CATEGORY_ALIASES[eventKey] || [];
    const matched = templates.filter((t) => aliases.includes(t.category));
    return matched.length ? matched : templates; // fall back to all if none in-category
  };

  const save = async (eventKey: string, patch: any, festivalKey = '') => {
    if (!editable) return;
    const cur = mapFor(eventKey, festivalKey);
    const body = {
      festivalKey,
      hrmateTemplateId: patch.hrmateTemplateId !== undefined ? patch.hrmateTemplateId : (cur.hrmateTemplateId ?? null),
      enabled: patch.enabled !== undefined ? patch.enabled : !!cur.enabled,
      whatsappEnabled: patch.whatsappEnabled !== undefined ? patch.whatsappEnabled : (cur.whatsappEnabled ?? true),
      emailEnabled: patch.emailEnabled !== undefined ? patch.emailEnabled : (cur.emailEnabled ?? false),
    };
    setSavingKey(`${eventKey}:${festivalKey}`);
    try {
      await api.communication.saveEventMapping(eventKey, body);
      const [em, val] = await Promise.all([api.communication.eventMappings(), api.communication.mappingValidation()]);
      setMappings(em.mappings || []); setValidation(val || { issues: [] });
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setSavingKey(''); }
  };

  const issues = validation.issues || [];

  const Row: React.FC<{ eventKey: string; label: string; mode?: string; festivalKey?: string }> = ({ eventKey, label, mode, festivalKey = '' }) => {
    const m = mapFor(eventKey, festivalKey);
    const opts = templatesFor(eventKey);
    const missing = !!m.enabled && !m.hrmateTemplateId;
    const busy = savingKey === `${eventKey}:${festivalKey}`;
    const selected = templates.find((t) => t.id === m.hrmateTemplateId);
    return (
      <div className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center ${missing ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-white'}`}>
        <div className="flex min-w-[190px] items-center gap-2">
          {selected ? <Swatch t={selected} /> : <span className="inline-flex h-5 w-8 items-center justify-center rounded bg-slate-100 text-[11px] text-slate-400">–</span>}
          <div>
            <div className="text-xs font-bold text-slate-800">{label}</div>
            {mode && <Badge variant={MODE_TONE[mode] as any}>{MODE_LABEL[mode] || mode}</Badge>}
          </div>
        </div>
        <div className="flex-1">
          <Select value={m.hrmateTemplateId ? String(m.hrmateTemplateId) : ''} disabled={!editable || busy}
            onChange={(e) => save(eventKey, { hrmateTemplateId: e.target.value ? Number(e.target.value) : null }, festivalKey)}
            options={[{ value: '', label: '— Select a template —' }, ...opts.map((t) => ({ value: String(t.id), label: `${t.title} (${t.category})` }))]} />
          {missing && <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-rose-600"><AlertTriangle size={12} /> {label} template missing — no generic message will be sent.</div>}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500" title="WhatsApp channel"><MessageCircle size={13} className="text-emerald-600" /><Toggle checked={m.whatsappEnabled ?? true} disabled={!editable || busy} onChange={(v) => save(eventKey, { whatsappEnabled: v }, festivalKey)} /></label>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500" title="Email channel"><Mail size={13} className="text-blue-600" /><Toggle checked={!!m.emailEnabled} disabled={!editable || busy} onChange={(v) => save(eventKey, { emailEnabled: v }, festivalKey)} /></label>
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600" title="Automation on/off"><span>{m.enabled ? 'On' : 'Off'}</span><Toggle checked={!!m.enabled} disabled={!editable || busy} onChange={(v) => save(eventKey, { enabled: v }, festivalKey)} /></label>
        </div>
      </div>
    );
  };

  if (loading) return <div className="py-12 text-center text-sm text-slate-500">Loading event mapping…</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-bold text-violet-800"><Sparkles size={16} /> Choose ONE template per event, once. Enabled events send automatically through your existing WhatsApp automation — no manual template picking, ever.</p>
      </div>

      {issues.length > 0 ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
          <p className="mb-1 flex items-center gap-2 text-xs font-extrabold text-rose-700"><AlertTriangle size={15} /> {issues.length} configuration issue(s) — enabled events without a template will NOT send:</p>
          <ul className="ml-6 list-disc text-[11px] font-semibold text-rose-700">{issues.map((i: any) => <li key={i.eventKey}>{i.title}: {i.message}</li>)}</ul>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={15} /> Every enabled event has a template mapped. Automation is ready.</div>
      )}

      {!editable && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">View-only — you need the Communication “edit” permission to change mappings.</div>}

      <div className="space-y-2">
        {events.filter((e) => e.key !== 'festival').map((e) => <Row key={e.key} eventKey={e.key} label={e.label} mode={e.mode} />)}
      </div>

      {/* Festivals — sub-events under the Festival category */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <button onClick={() => setShowFestivals((s) => !s)} className="flex w-full items-center justify-between px-4 py-3 text-xs font-extrabold text-slate-700">
          <span className="flex items-center gap-2"><Layers size={15} className="text-orange-500" /> Festival Greetings — map a template per festival ({festivals.length})</span>
          <span className="text-slate-400">{showFestivals ? '▲' : '▼'}</span>
        </button>
        {showFestivals && (
          <div className="space-y-2 border-t border-slate-100 p-3">
            {festivals.map((f) => <Row key={f.key} eventKey="festival" festivalKey={f.key} label={`${f.emoji || '🎉'} ${f.label}`} />)}
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// Master Library browse + copy + Company Library states (Steps 1 & 2)
// ══════════════════════════════════════════════════════════════════════════════
export const MasterLibraryTab: React.FC = () => {
  const { canEdit } = usePermissions();
  const editable = canEdit('communication');
  const [masters, setMasters] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(0);
  const [view, setView] = useState<'master' | 'mine'>('master');

  const load = async () => {
    try {
      const [ms, cs, my] = await Promise.all([api.communication.master.list(), api.communication.master.categories(), api.communication.templates.list()]);
      setMasters(Array.isArray(ms) ? ms : []); setCats(Array.isArray(cs) ? cs : []); setMine(Array.isArray(my) ? my : []);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const copiedMasterIds = useMemo(() => new Set(mine.map((t) => t.masterTemplateId).filter(Boolean)), [mine]);
  const shown = masters.filter((m) => (cat === 'All' || m.category === cat) && (!q || m.title.toLowerCase().includes(q.toLowerCase())));

  const copy = async (m: any) => {
    if (!editable) return;
    setBusy(m.id);
    try { await api.communication.copyFromMaster(m.id); ui.toast.success(`Copied “${m.title}” into your library.`); await load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setBusy(0); }
  };
  const setState = async (t: any, state: string) => {
    if (!editable) return;
    setBusy(t.id);
    try { await api.communication.setLibraryState(t.id, state); ui.toast.success(`Template ${state}.`); await load(); }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setBusy(0); }
  };

  if (loading) return <div className="py-12 text-center text-sm text-slate-500">Loading library…</div>;

  const MasterCard: React.FC<{ m: any }> = ({ m }) => {
    const th = themeOf(m);
    const already = copiedMasterIds.has(m.id);
    return (
      <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex h-20 items-center justify-center text-2xl" style={{ background: th.background || 'linear-gradient(135deg,#eef2ff,#e2e8f0)', color: th.text || '#1e293b' }}>{th.emoji || '🎉'}</div>
        <div className="flex flex-1 flex-col gap-1 p-2.5">
          <div className="text-xs font-bold text-slate-800 line-clamp-1">{m.title}</div>
          <div className="flex items-center gap-1"><Badge variant="gray">{m.category}</Badge>{m.festivalKey && <Badge variant="amber">{m.festivalKey}</Badge>}</div>
          <div className="mt-auto pt-1.5">
            {already
              ? <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><CheckCircle2 size={13} /> In your library</span>
              : <button disabled={!editable || busy === m.id} onClick={() => copy(m)} className="flex w-full items-center justify-center gap-1 rounded-lg border border-[#4F7CFF] px-2 py-1 text-[11px] font-bold text-[#4F7CFF] hover:bg-blue-50 disabled:opacity-50"><Copy size={12} /> {busy === m.id ? 'Copying…' : 'Copy to my library'}</button>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
          <button onClick={() => setView('master')} className={`rounded-lg px-3 py-1.5 ${view === 'master' ? 'bg-white text-[#4F7CFF] shadow-sm' : 'text-slate-500'}`}>Master Library ({masters.length})</button>
          <button onClick={() => setView('mine')} className={`rounded-lg px-3 py-1.5 ${view === 'mine' ? 'bg-white text-[#4F7CFF] shadow-sm' : 'text-slate-500'}`}>My Templates ({mine.length})</button>
        </div>
        {view === 'master' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><Search size={14} className="absolute left-2 top-2.5 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" className="rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-xs" /></div>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold">
              <option value="All">All categories</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>

      {view === 'master' ? (
        <>
          <p className="text-[11px] font-semibold text-slate-500">Browse the professional Master Library and copy templates into your company. The master catalogue is managed by the platform and never changes your copies.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{shown.map((m) => <MasterCard key={m.id} m={m} />)}</div>
          {shown.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No templates match.</div>}
        </>
      ) : (
        <div className="space-y-2">
          {mine.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No company templates yet — copy some from the Master Library.</div>}
          {mine.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <Swatch t={t} />
              <div className="flex-1"><div className="text-xs font-bold text-slate-800">{t.title}</div><div className="flex items-center gap-1"><Badge variant="gray">{t.category}</Badge>{t.masterTemplateId && <Badge variant="blue">from master</Badge>}<Badge variant={(t.libraryState || 'enabled') === 'enabled' ? 'green' : (t.libraryState === 'archived' ? 'red' : 'amber')}>{t.libraryState || 'enabled'}</Badge></div></div>
              {editable && (
                <div className="flex items-center gap-1">
                  {(t.libraryState || 'enabled') !== 'enabled' && <button disabled={busy === t.id} onClick={() => setState(t, 'enabled')} className="rounded-lg border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Enable</button>}
                  {(t.libraryState || 'enabled') === 'enabled' && <button disabled={busy === t.id} onClick={() => setState(t, 'disabled')} className="rounded-lg border border-amber-200 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50">Disable</button>}
                  {t.libraryState !== 'archived' && <button disabled={busy === t.id} onClick={() => setState(t, 'archived')} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50">Archive</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
