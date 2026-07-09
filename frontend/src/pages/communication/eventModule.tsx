// ─────────────────────────────────────────────────────────────────────────────
// Communication Event Module — the REUSABLE enterprise engine.
//
// One generic component (`CommunicationEventModule`) renders a complete, live
// communication surface for ANY occasion: summary cards, today's recipients,
// upcoming (30 days), sent history (from real WhatsApp delivery logs), a details
// drawer, a placeholder-accurate preview, manual send (with confirmation),
// filters, export (PDF / Excel / CSV), an automation panel and an audit trail.
//
// It NEVER changes the backend: it consumes the existing employee DB, automation
// rules/runs, delivery logs, queue, templates and the (additive) audit endpoint.
// Only the per-event CONFIG (data source + template) changes — so Birthday,
// Work Anniversary, Festival, Holiday, Announcements, Salary, Payslip, Leave and
// Attendance all run on this same engine with zero duplication.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import {
  Cake, Award, PartyPopper, CalendarDays, Megaphone, Banknote, FileText, CheckCircle2,
  Clock, Send, Eye, X, Search, Download, FileSpreadsheet, RefreshCw, Activity, History,
  AlertTriangle, CalendarClock, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ui } from '@/components/ui/feedback';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import { exportRowsToExcel, exportRowsToPDF, type ExportColumn } from '@/utils/exportUtils';

// ── Event configuration registry ──────────────────────────────────────────────
export type RecipientMode = 'employee-dob' | 'employee-joindate' | 'holiday' | 'none';
export interface EventConfig {
  key: string;                 // matches automation rule eventType + log keyword
  label: string;               // "Birthday Wishes"
  noun: string;                // "birthday wish"
  recipientMode: RecipientMode;
  templateCategory: string;    // Communication template category
  defaultTemplate: string;     // fallback message body (with {{placeholders}})
  logKeyword: string;          // substring used to isolate this event in delivery logs
  accent: keyof typeof ACCENTS;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

// Literal Tailwind classes per accent (kept literal so the JIT compiler keeps them).
const ACCENTS = {
  pink:    { icon: 'bg-pink-50 text-pink-600',     chip: 'bg-pink-50 text-pink-600',     soft: 'from-pink-50/60',    ring: 'border-pink-100' },
  indigo:  { icon: 'bg-brand-50 text-brand-600', chip: 'bg-brand-50 text-brand-600', soft: 'from-brand-50/60',  ring: 'border-brand-100' },
  orange:  { icon: 'bg-orange-50 text-orange-600', chip: 'bg-orange-50 text-orange-600', soft: 'from-orange-50/60',  ring: 'border-orange-100' },
  teal:    { icon: 'bg-teal-50 text-teal-600',     chip: 'bg-teal-50 text-teal-600',     soft: 'from-teal-50/60',    ring: 'border-teal-100' },
  violet:  { icon: 'bg-brand-50 text-brand-600', chip: 'bg-brand-50 text-brand-600', soft: 'from-brand-50/60',  ring: 'border-brand-100' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', chip: 'bg-emerald-50 text-emerald-600', soft: 'from-emerald-50/60', ring: 'border-emerald-100' },
  cyan:    { icon: 'bg-brand-50 text-brand-600',     chip: 'bg-brand-50 text-brand-600',     soft: 'from-brand-50/60',    ring: 'border-brand-100' },
  blue:    { icon: 'bg-brand-50 text-brand-600',     chip: 'bg-brand-50 text-brand-600',     soft: 'from-brand-50/60',    ring: 'border-brand-100' },
  amber:   { icon: 'bg-amber-50 text-amber-600',   chip: 'bg-amber-50 text-amber-600',   soft: 'from-amber-50/60',   ring: 'border-amber-100' },
} as const;

export const EVENT_CONFIGS: Record<string, EventConfig> = {
  birthday:    { key: 'birthday',    label: 'Birthday Wishes',      noun: 'birthday wish',       recipientMode: 'employee-dob',      templateCategory: 'Birthday Wishes',     logKeyword: 'birthday',   accent: 'pink',    icon: Cake,        defaultTemplate: 'Dear {{employee_name}}, the entire {{company_name}} family wishes you a very Happy Birthday! 🎂🎉' },
  anniversary: { key: 'anniversary', label: 'Work Anniversary',     noun: 'anniversary wish',    recipientMode: 'employee-joindate', templateCategory: 'Work Anniversary',    logKeyword: 'anniversar', accent: 'indigo',  icon: Award,       defaultTemplate: 'Congratulations {{employee_name}} on completing {{years_of_service}} year(s) with {{company_name}}! 🎉' },
  festival:    { key: 'festival',    label: 'Festival Greetings',   noun: 'festival greeting',   recipientMode: 'holiday',           templateCategory: 'Festival Greetings',  logKeyword: 'festival',   accent: 'orange',  icon: PartyPopper, defaultTemplate: 'Warm festival greetings to you and your family from {{company_name}}!' },
  holiday:     { key: 'holiday',     label: 'Holiday Greetings',    noun: 'holiday greeting',    recipientMode: 'holiday',           templateCategory: 'Festival Greetings',  logKeyword: 'holiday',    accent: 'teal',    icon: CalendarDays, defaultTemplate: 'Wishing you a restful holiday from {{company_name}}!' },
  announcement:{ key: 'announcement',label: 'Company Announcements',noun: 'announcement',        recipientMode: 'none',              templateCategory: 'Company Announcements',logKeyword: 'announce',   accent: 'violet',  icon: Megaphone,   defaultTemplate: 'Hello {{employee_name}}, an important update from {{company_name}}.' },
  salary:      { key: 'salary_credited',     label: 'Salary Credited',      noun: 'salary notification', recipientMode: 'none',              templateCategory: 'Salary Credited',     logKeyword: 'salary',     accent: 'emerald', icon: Banknote,    defaultTemplate: 'Hi {{employee_name}}, your salary has been credited. Regards, {{company_name}}.' },
  payslip:     { key: 'payslip',             label: 'Payslip Available',    noun: 'payslip notification',recipientMode: 'none',              templateCategory: 'Payslip Available',   logKeyword: 'payslip',    accent: 'cyan',    icon: FileText,    defaultTemplate: 'Hi {{employee_name}}, your latest payslip is now available. {{company_name}}.' },
  leave:       { key: 'leave_approved',      label: 'Leave Approved',       noun: 'leave notification',  recipientMode: 'none',              templateCategory: 'Custom Templates',    logKeyword: 'leave',      accent: 'blue',    icon: CheckCircle2, defaultTemplate: 'Hi {{employee_name}}, your leave request has been approved. {{company_name}}.' },
  attendance:  { key: 'attendance_reminder', label: 'Attendance Reminder',  noun: 'attendance reminder', recipientMode: 'none',              templateCategory: 'Custom Templates',    logKeyword: 'attendance', accent: 'amber',   icon: Clock,       defaultTemplate: 'Hi {{employee_name}}, this is a friendly attendance reminder from {{company_name}}.' },
};

export interface Branding { companyName: string; logo?: string }

// ── Date / formatting helpers ─────────────────────────────────────────────────
const occurrenceDays = (dateLike: any): number | null => {
  const d = new Date(dateLike); if (isNaN(d.getTime())) return null;
  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let occ = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (occ < today) occ = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
  return Math.round((occ.getTime() - today.getTime()) / 86400000);
};
const yearsOfService = (joinLike: any): number | null => {
  const d = new Date(joinLike); if (isNaN(d.getTime())) return null;
  const now = new Date(); let occYear = now.getFullYear();
  const occ = new Date(occYear, d.getMonth(), d.getDate());
  if (occ < new Date(now.getFullYear(), now.getMonth(), now.getDate())) occYear += 1;
  return Math.max(0, occYear - d.getFullYear());
};
const fmtTime12 = (hhmm?: string): string => {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return '';
  let h = parseInt(m[1], 10); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${m[2]} ${ap}`;
};
const TRIGGER_LABELS: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
  employee_birthday: 'On each employee birthday', employee_anniversary: 'On each work anniversary',
  specific_date: 'On a specific date', company_holiday: 'On company holidays', manual: 'Manual', api: 'Via API',
};
const triggerLabel = (t?: string): string => TRIGGER_LABELS[String(t || '')] || (t ? String(t) : 'Daily');
const empPhoto = (e: any): string => e?.avatar || e?.photoUpload || e?.photo || '';
const empBranch = (e: any): string => e?.branch?.name || e?.branchName || e?.branchLocation || e?.location || '';
const initials = (name: string): string => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const statusVariant = (st: string): any => st === 'Sent' ? 'green' : st === 'Failed' ? 'red' : st === 'Processing' ? 'blue' : st === 'Simulated' ? 'purple' : 'gray';
const isToday = (d: any) => { const x = new Date(d); const n = new Date(); return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth() && x.getDate() === n.getDate(); };

// ── CSV export (matches the Excel/PDF column contract) ────────────────────────
const csvCell = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const exportRowsToCSV = (fileName: string, columns: ExportColumn[], rows: any[]) => {
  const head = columns.map(c => csvCell(c.header)).join(',');
  const body = rows.map(r => columns.map(c => { const raw = r[c.key]; return csvCell(c.format ? c.format(raw, r) : raw); }).join(',')).join('\n');
  const blob = new Blob([`${head}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `${fileName}.csv`; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
};

// ── Small presentational helpers ──────────────────────────────────────────────
const SummaryCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; tone?: string }> = ({ label, value, icon, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${tone || 'bg-slate-100 text-slate-500'}`}>{icon}</div>
    <p className="text-2xl font-extrabold text-slate-800">{value}</p>
    <p className="text-[11px] font-semibold text-slate-400">{label}</p>
  </div>
);
const Empty: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
    <div className="mb-2 text-slate-300">{icon}</div>
    <p className="text-sm font-bold text-slate-600">{title}</p>
    {subtitle && <p className="mt-1 max-w-md whitespace-pre-line text-[11px] text-slate-400">{subtitle}</p>}
  </div>
);
const ExportBar: React.FC<{ columns: ExportColumn[]; rows: () => any[]; fileName: string; title: string; subtitle?: string; disabled?: boolean }> = ({ columns, rows, fileName, title, subtitle, disabled }) => {
  const run = (fmt: 'pdf' | 'excel' | 'csv') => {
    const data = rows();
    if (!data.length) { ui.toast.info('There is no data to export for the current view.'); return; }
    const stamp = formatDate(new Date() as any).replace(/[ ,:]/g, '-');
    const name = `${fileName}_${stamp}`;
    try {
      if (fmt === 'pdf') exportRowsToPDF(name, title, columns, data, subtitle);
      else if (fmt === 'excel') exportRowsToExcel(name, columns, data, title.slice(0, 28));
      else exportRowsToCSV(name, columns, data);
    } catch (e: any) { ui.toast.error('Export failed: ' + (e?.message || 'Unknown error')); }
  };
  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" disabled={disabled} icon={<FileText size={13} />} onClick={() => run('pdf')}>PDF</Button>
      <Button size="sm" variant="outline" disabled={disabled} icon={<FileSpreadsheet size={13} />} onClick={() => run('excel')}>Excel</Button>
      <Button size="sm" variant="outline" disabled={disabled} icon={<Download size={13} />} onClick={() => run('csv')}>CSV</Button>
    </div>
  );
};

// ── WhatsApp-style preview ────────────────────────────────────────────────────
const WhatsAppPreview: React.FC<{ branding: Branding; message: string; caption?: string }> = ({ branding, message, caption }) => (
  <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-[#e5ddd5]">
    <div className="flex items-center gap-2 bg-[#075E54] px-3 py-2 text-white">
      {branding.logo
        ? <img src={branding.logo} alt="logo" className="h-7 w-7 rounded-full bg-white object-contain" />
        : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">{initials(branding.companyName)}</div>}
      <div className="min-w-0"><p className="truncate text-xs font-bold">{branding.companyName}</p><p className="text-[9px] text-emerald-100">business account</p></div>
    </div>
    <div className="space-y-1.5 p-3" style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '12px 12px' }}>
      <div className="ml-auto max-w-[88%] rounded-lg rounded-tr-sm bg-[#dcf8c6] p-2 shadow-sm">
        <p className="whitespace-pre-wrap text-[11px] leading-snug text-slate-800">{message}</p>
        {caption && <p className="mt-1 border-t border-black/5 pt-1 text-[10px] italic text-slate-600">{caption}</p>}
        <p className="mt-1 text-right text-[8px] text-slate-500">{formatDateTime(new Date() as any)} ✓✓</p>
      </div>
    </div>
  </div>
);

// ── The reusable engine ───────────────────────────────────────────────────────
export const CommunicationEventModule: React.FC<{ config: EventConfig; branding: Branding }> = ({ config, branding }) => {
  const Icon = config.icon;
  const accent = ACCENTS[config.accent];
  const isEmployeeMode = config.recipientMode === 'employee-dob' || config.recipientMode === 'employee-joindate';
  const dateField = config.recipientMode === 'employee-joindate' ? 'joinDate' : 'dob';

  const [employees, setEmployees] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [tplId, setTplId] = useState<string>('');           // selected template (preview/use)
  const [preview, setPreview] = useState<{ name: string; message: string } | null>(null);
  // The actual rendered card image (identical to what is sent over WhatsApp).
  const [previewImg, setPreviewImg] = useState<{ loading: boolean; dataUrl?: string; error?: string }>({ loading: false });
  const [scheduler, setScheduler] = useState<any>(null);   // backend auto-scheduler status + per-rule next run
  const [details, setDetails] = useState<any>(null);
  // Filters
  const [fBranch, setFBranch] = useState('All');
  const [fDept, setFDept] = useState('All');
  const [fEmp, setFEmp] = useState('');
  const [fStatus, setFStatus] = useState('All');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  const load = async () => {
    try {
      const [emps, rl, rn, lg, q, tpl, hol, au, sch] = await Promise.all([
        isEmployeeMode ? api.employees.getAll().catch(() => []) : Promise.resolve([]),
        api.communication.automation.rules().catch(() => []),
        api.communication.automation.runs().catch(() => []),
        api.communication.whatsapp.logs().catch(() => []),
        api.communication.whatsapp.queue().catch(() => []),
        api.communication.templates.list(config.templateCategory).catch(() => []),
        config.recipientMode === 'holiday' ? api.communication.holidays.list().catch(() => []) : Promise.resolve([]),
        api.communication.audit.list(config.key).catch(() => []),
        api.communication.automation.scheduler().catch(() => null),
      ]);
      setScheduler(sch || null);
      setEmployees(Array.isArray(emps) ? emps : ((emps as any)?.data || []));
      setRules(Array.isArray(rl) ? rl : []);
      setRuns(Array.isArray(rn) ? rn : []);
      setLogs(Array.isArray(lg) ? lg : []);
      setQueue(Array.isArray(q) ? q : []);
      setTemplates(Array.isArray(tpl) ? tpl : []);
      setHolidays(Array.isArray(hol) ? hol : []);
      setAudit(Array.isArray(au) ? au : []);
    } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  };
  // Live auto-refresh so the page reflects recipients / schedules / logs as they change.
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [config.key]);

  const logAudit = (action: string, target?: { id?: any; name?: string }, detail = '') => {
    api.communication.audit.log({ eventType: config.key, action, targetId: target?.id ?? null, targetName: target?.name || '', detail }).then(() => load()).catch(() => {});
  };

  // ── Derived: automation rule + latest run ───────────────────────────────────
  const rule = useMemo(() => rules.find(r => r.eventType === config.key) || null, [rules, config.key]);
  const automationActive = !!rule && String(rule.status || '').toLowerCase() === 'active';
  const latestRun = useMemo(() => runs.filter(r => rule && r.ruleId === rule.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null, [runs, rule]);
  // Backend auto-scheduler status + this rule's computed next run.
  const schedulerOn = !!(scheduler && scheduler.scheduler && scheduler.scheduler.enabled);
  const ruleSchedule = useMemo(() => (scheduler && scheduler.rules ? scheduler.rules.find((x: any) => rule && x.id === rule.id) : null) || null, [scheduler, rule]);

  // ── Derived: event-scoped delivery logs + queue ─────────────────────────────
  const templateIds = useMemo(() => new Set(templates.map(t => t.id)), [templates]);
  // ID-matching is only reliable for a dedicated category; the shared "Custom
  // Templates" bucket is too broad, so those events match on the keyword only.
  const useIdMatch = config.templateCategory !== 'Custom Templates';
  const matchesEvent = (row: any) => {
    const kw = config.logKeyword.toLowerCase();
    const byName = `${row.templateName || ''} ${row.category || ''} ${row.eventType || ''}`.toLowerCase().includes(kw);
    const byId = useIdMatch && row.templateId && templateIds.has(row.templateId);
    return byName || byId;
  };
  const eventLogs = useMemo(() => logs.filter(matchesEvent).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [logs, templateIds]);
  const eventQueue = useMemo(() => queue.filter(matchesEvent), [queue, templateIds]);

  // ── Derived: recipients (employee modes) / occasions (holiday mode) ─────────
  const recipients = useMemo<any[]>(() => {
    if (config.recipientMode === 'holiday') {
      return holidays.filter(h => h.date).map(h => ({ id: h.id, name: h.name, department: h.category || '', branch: '', date: h.date, days: occurrenceDays(h.date), years: null }))
        .filter(r => r.days != null);
    }
    if (!isEmployeeMode) return [];
    return employees
      .filter(e => (e?.status ? String(e.status).toLowerCase() === 'active' : true) && e?.[dateField])
      .map(e => ({
        id: e.id, name: e.name, employeeId: e.employeeId || e.id, department: e.department || '',
        designation: e.designation || '', branch: empBranch(e), photo: empPhoto(e),
        date: e[dateField], days: occurrenceDays(e[dateField]),
        years: config.recipientMode === 'employee-joindate' ? yearsOfService(e[dateField]) : null,
      }))
      .filter(r => r.days != null);
  }, [employees, holidays, config.recipientMode, dateField]);

  // Filter option sources.
  const branchOpts = useMemo(() => Array.from(new Set(recipients.map(r => r.branch).filter(Boolean))).sort(), [recipients]);
  const deptOpts = useMemo(() => Array.from(new Set(recipients.map(r => r.department).filter(Boolean))).sort(), [recipients]);

  const passFilters = (r: any) =>
    (fBranch === 'All' || r.branch === fBranch) &&
    (fDept === 'All' || r.department === fDept) &&
    (!fEmp.trim() || String(r.name || '').toLowerCase().includes(fEmp.trim().toLowerCase()));

  const todays = useMemo(() => recipients.filter(r => r.days === 0 && passFilters(r)).sort((a, b) => String(a.name).localeCompare(String(b.name))), [recipients, fBranch, fDept, fEmp]);
  const upcoming = useMemo(() => recipients.filter(r => (r.days ?? 99) > 0 && (r.days ?? 99) <= 30 && passFilters(r)).sort((a, b) => (a.days as number) - (b.days as number)), [recipients, fBranch, fDept, fEmp]);

  // Sent history with all filters applied.
  const history = useMemo(() => eventLogs.filter(l => {
    if (fStatus !== 'All' && String(l.status || '') !== fStatus) return false;
    if (fEmp.trim() && !String(l.employeeName || '').toLowerCase().includes(fEmp.trim().toLowerCase())) return false;
    if (fFrom) { const d = new Date(l.createdAt); if (d < new Date(fFrom + 'T00:00:00')) return false; }
    if (fTo) { const d = new Date(l.createdAt); if (d > new Date(fTo + 'T23:59:59')) return false; }
    return true;
  }), [eventLogs, fStatus, fEmp, fFrom, fTo]);

  // ── Summary metrics ─────────────────────────────────────────────────────────
  const sentTotal = eventLogs.filter(l => l.status === 'Sent').length;
  const failedTotal = eventLogs.filter(l => l.status === 'Failed').length;
  const sentToday = eventLogs.filter(l => l.status === 'Sent' && isToday(l.createdAt)).length;
  const pendingQueue = eventQueue.filter(r => ['Pending', 'Processing'].includes(String(r.status || ''))).length;
  const successRate = (sentTotal + failedTotal) > 0 ? Math.round((sentTotal / (sentTotal + failedTotal)) * 100) : 0;

  // Today's send status for a recipient (matched in today's event logs).
  const sentTodayFor = (name: string) => eventLogs.find(l => isToday(l.createdAt) && String(l.employeeName || '').toLowerCase() === String(name || '').toLowerCase()) || null;

  // ── Message rendering (placeholder replacement) ─────────────────────────────
  const activeTemplate = useMemo(() => templates.find(t => String(t.id) === tplId) || templates[0] || null, [templates, tplId]);
  const renderMessage = (r: any): string => {
    const body = activeTemplate?.body || config.defaultTemplate;
    return String(body)
      .replace(/\{\{\s*employee_name\s*\}\}/gi, r?.name || 'Employee')
      .replace(/\{\{\s*company_name\s*\}\}/gi, branding.companyName || 'our company')
      .replace(/\{\{\s*designation\s*\}\}/gi, r?.designation || '')
      .replace(/\{\{\s*department\s*\}\}/gi, r?.department || '')
      .replace(/\{\{\s*years_of_service\s*\}\}/gi, r?.years != null ? String(r.years) : '')
      .replace(/\{\{\s*\w+\s*\}\}/g, '').replace(/\s{2,}/g, ' ').trim();
  };

  const openPreview = (r: any) => {
    setPreview({ name: r.name, message: renderMessage(r) });
    logAudit('Preview', { id: r.id, name: r.name });
    // Render the EXACT image the recipient will receive (employee modes only).
    if (isEmployeeMode && activeTemplate?.id && r?.id) {
      setPreviewImg({ loading: true });
      api.communication.whatsapp.imagePreview({ templateId: activeTemplate.id, employeeId: r.id })
        .then((res: any) => setPreviewImg({ loading: false, dataUrl: res?.dataUrl }))
        .catch((e: any) => setPreviewImg({ loading: false, error: getApiErrorMessage(e) }));
    } else {
      setPreviewImg({ loading: false });
    }
  };

  // Manual send. For employee events this RENDERS a personalized greeting-card PNG
  // and sends it as an approved WhatsApp IMAGE template (the new sending mechanism).
  // Holiday / auto-resolved modes keep routing through the existing automation rule
  // (the automation engine / queue are never modified).
  const canManualSend = isEmployeeMode ? !!activeTemplate?.id : automationActive;
  const manualSend = async (r?: any) => {
    // Holiday / non-employee modes → unchanged automation-rule path.
    if (!isEmployeeMode || !activeTemplate?.id) {
      if (!rule) { ui.toast.info(`Create a ${config.label} automation rule first (Automation Rules tab).`); return; }
      setBusy(true);
      try {
        const res: any = await api.communication.automation.execute(rule.id, 'send');
        const s = res?.summary || {};
        const sent = s.sentMessages ?? 0, failed = s.failedMessages ?? 0, eligible = s.eligibleRecipients ?? 0;
        logAudit('Manual Send', r ? { id: r.id, name: r.name } : undefined, `${sent} sent${failed ? `, ${failed} failed` : ''}`);
        if (sent && !failed) ui.toast.success(`${config.label}: ${sent} message${sent === 1 ? '' : 's'} sent over WhatsApp.`);
        else if (sent) ui.toast.info(`${sent} sent, ${failed} failed.`);
        else ui.toast.error(eligible === 0 ? 'Nothing sent — no eligible recipients.' : `Nothing sent${failed ? ` — ${failed} failed` : ''}.`);
        await load();
      } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
      finally { setBusy(false); }
      return;
    }

    // Employee events → real image pipeline (render → upload → image template).
    const targets = r ? [r] : todays;
    if (!targets.length) { ui.toast.info(`No ${config.label.toLowerCase()} recipients to send to.`); return; }
    if (r) {
      const already = sentTodayFor(r.name);
      if (already) {
        const ok = await ui.confirm({ title: 'Send another message?', message: `This employee has already received today's ${config.noun}.\nGenerate and send a fresh image again?`, confirmText: 'Send Again' });
        if (!ok) return;
      }
    } else {
      const ok = await ui.confirm({ title: `Send ${config.label}?`, message: `Generate and send a personalized image card to ${targets.length} recipient(s) over WhatsApp?`, confirmText: 'Send' });
      if (!ok) return;
    }
    setBusy(true);
    let sent = 0, failed = 0, lastErr = '';
    try {
      for (const t of targets) {
        try {
          const res: any = await api.communication.whatsapp.imageSend({ templateId: activeTemplate.id, employeeId: t.id });
          if (res?.ok) sent++; else { failed++; lastErr = res?.message || lastErr; }
        } catch (e) { failed++; lastErr = getApiErrorMessage(e); }
      }
      logAudit('Manual Send', r ? { id: r.id, name: r.name } : undefined, `${sent} image${sent === 1 ? '' : 's'} sent${failed ? `, ${failed} failed` : ''}`);
      if (sent && !failed) ui.toast.success(`${config.label}: ${sent} image${sent === 1 ? '' : 's'} sent over WhatsApp.`);
      else if (sent) ui.toast.info(`${sent} sent, ${failed} failed${lastErr ? ` — ${lastErr}` : ''}.`);
      else ui.toast.error(`Send failed${lastErr ? ` — ${lastErr}` : ''}.`);
      await load();
    } finally { setBusy(false); }
  };

  // Retry a failed delivery (re-runs the rule; logged as Retry).
  const retry = async (l: any) => {
    if (!rule) { ui.toast.info('No automation rule configured to retry through.'); return; }
    const ok = await ui.confirm({ title: 'Retry delivery?', message: `Re-run ${config.label} to retry failed messages?`, confirmText: 'Retry' });
    if (!ok) return;
    setBusy(true);
    try {
      const res: any = await api.communication.automation.execute(rule.id, 'send');
      const s = res?.summary || {};
      const sent = s.sentMessages ?? 0, failed = s.failedMessages ?? 0;
      logAudit('Retry', { id: l.employeeId, name: l.employeeName }, `log #${l.id} · ${sent} sent${failed ? `, ${failed} failed` : ''}`);
      ui.toast[sent ? 'success' : 'info'](`Retry: ${sent} sent${failed ? `, ${failed} failed` : ''}.`);
      await load();
    }
    catch (e) { ui.toast.error(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const onTemplateChange = (id: string) => { setTplId(id); const t = templates.find(x => String(x.id) === id); logAudit('Template Change', undefined, t ? t.title : 'default'); };

  // Queue row matched to a delivery log (for retry count in the details drawer).
  const queueFor = (l: any) => queue.find(q => q.id === l.queueId) || null;

  // ── Export column contracts ─────────────────────────────────────────────────
  const historyExport = (): any[] => history.map(l => ({
    employee: l.employeeName || '—', template: l.templateName || (activeTemplate?.title || '—'), channel: 'WhatsApp',
    sentAt: formatDateTime(l.createdAt), status: l.status, wamid: l.metaMessageId || '—', error: l.errorMessage || '',
  }));
  const HISTORY_COLS: ExportColumn[] = [
    { header: 'Employee', key: 'employee', width: 22 }, { header: 'Template', key: 'template', width: 24 },
    { header: 'Channel', key: 'channel', width: 12 }, { header: 'Sent Date & Time', key: 'sentAt', width: 22 },
    { header: 'Status', key: 'status', width: 12 }, { header: 'Meta Message ID', key: 'wamid', width: 30 },
    { header: 'Error', key: 'error', width: 28 },
  ];

  return (
    <div className="space-y-4">
      {/* Automation status banner */}
      {automationActive ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-extrabold text-emerald-800">🟢 {config.label} Automation Active</p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-emerald-700">
            <li>Automatic detection is enabled.</li>
            <li>Messages are sent according to the configured Automation Rule “{rule?.name}”.</li>
            <li>Next Scheduled Run: {triggerLabel(rule?.triggerType)}{rule?.scheduleTime ? ` at ${fmtTime12(rule.scheduleTime)}` : ''}.</li>
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-extrabold text-slate-700">⚪ {config.label} Automation Disabled</p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-slate-500">
            <li>Automation is currently disabled.</li>
            <li>Enable an Automation Rule to automatically send {config.label.toLowerCase()}.</li>
          </ul>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label={isEmployeeMode ? "Today's Birthdays".replace('Birthdays', config.recipientMode === 'employee-joindate' ? 'Anniversaries' : 'Birthdays') : "Today"} value={loading ? '—' : todays.length} icon={<Icon size={16} />} tone={accent.icon} />
        <SummaryCard label="Upcoming (30 Days)" value={loading ? '—' : upcoming.length} icon={<CalendarClock size={16} />} tone="bg-brand-50 text-brand-600" />
        <SummaryCard label="Messages Sent Today" value={loading ? '—' : sentToday} icon={<Send size={16} />} tone="bg-emerald-50 text-emerald-600" />
        <SummaryCard label="Pending Queue" value={loading ? '—' : pendingQueue} icon={<Clock size={16} />} tone="bg-amber-50 text-amber-600" />
        <SummaryCard label="Failed Messages" value={loading ? '—' : failedTotal} icon={<AlertTriangle size={16} />} tone="bg-rose-50 text-rose-600" />
        <SummaryCard label="Success Rate" value={loading ? '—' : `${successRate}%`} icon={<Activity size={16} />} tone="bg-teal-50 text-teal-600" />
      </div>

      {/* Toolbar: template selector + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500">Template</span>
          <select value={tplId} onChange={e => onTemplateChange(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] focus:border-[#6C3CF0] focus:outline-none">
            <option value="">{templates[0]?.title || 'Default template'}</option>
            {templates.map(t => <option key={t.id} value={String(t.id)}>{t.title}</option>)}
          </select>
        </div>
        <Button size="sm" variant="outline" icon={<RefreshCw size={13} />} onClick={() => { setLoading(true); load(); }}>Refresh</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        {isEmployeeMode && (
          <>
            <Filter label="Branch"><select value={fBranch} onChange={e => setFBranch(e.target.value)} className={selCls}><option>All</option>{branchOpts.map(b => <option key={b}>{b}</option>)}</select></Filter>
            <Filter label="Department"><select value={fDept} onChange={e => setFDept(e.target.value)} className={selCls}><option>All</option>{deptOpts.map(d => <option key={d}>{d}</option>)}</select></Filter>
          </>
        )}
        <Filter label="Employee"><div className="relative"><Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" /><input value={fEmp} onChange={e => setFEmp(e.target.value)} placeholder="Search name…" className={`${selCls} pl-7`} /></div></Filter>
        <Filter label="Status"><select value={fStatus} onChange={e => setFStatus(e.target.value)} className={selCls}>{['All', 'Sent', 'Failed', 'Pending', 'Processing', 'Simulated'].map(s => <option key={s}>{s}</option>)}</select></Filter>
        <Filter label="From"><input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} className={selCls} /></Filter>
        <Filter label="To"><input type="date" value={fTo} onChange={e => setFTo(e.target.value)} className={selCls} /></Filter>
        {(fBranch !== 'All' || fDept !== 'All' || fEmp || fStatus !== 'All' || fFrom || fTo) &&
          <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { setFBranch('All'); setFDept('All'); setFEmp(''); setFStatus('All'); setFFrom(''); setFTo(''); }}>Clear</Button>}
      </div>

      {/* Today's recipients */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><Icon size={14} className={accent.icon.split(' ')[1]} /> Today{todays.length > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${accent.chip}`}>{todays.length}</span>}</p>
          {todays.length > 0 && <Button size="sm" icon={<Send size={13} />} disabled={busy || !canManualSend} onClick={() => manualSend()}>{busy ? 'Sending…' : `Send ${config.label}`}</Button>}
        </div>
        {loading ? <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
          : !isEmployeeMode && config.recipientMode === 'none' ? <Empty icon={<Users size={22} />} title="Recipients are resolved automatically." subtitle={`When the ${config.label} rule runs, recipients are selected by the automation engine and appear in the Sent History below.`} />
            : todays.length === 0 ? <Empty icon={<Icon size={22} />} title={`No ${config.label.toLowerCase()} today.`} subtitle={`${config.label} will automatically be sent when ${isEmployeeMode ? 'an employee event' : 'an occasion'} is detected.`} />
              : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {todays.map(r => {
                    const sent = sentTodayFor(r.name);
                    return (
                      <div key={r.id} className={`rounded-xl border bg-gradient-to-br to-white p-3 ${accent.ring} ${accent.soft}`}>
                        <div className="flex items-center gap-3">
                          {(r as any).photo
                            ? <img src={(r as any).photo} alt={r.name} className="h-11 w-11 rounded-full object-cover" />
                            : <div className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${accent.chip}`}>{initials(r.name)}</div>}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-800">{r.name}</p>
                            <p className="truncate text-[11px] text-slate-500">{isEmployeeMode ? <>#{(r as any).employeeId} · {r.designation || '—'}</> : (r.department || '—')}</p>
                          </div>
                        </div>
                        {isEmployeeMode && <p className="mt-1 truncate text-[10px] text-slate-400">{r.department || '—'}{r.branch ? ` · ${r.branch}` : ''}</p>}
                        <div className="mt-2 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">{config.recipientMode === 'employee-joindate' ? '🎖️' : '🎂'} {formatDate(r.date)}{r.years != null ? ` · ${r.years} yr` : ''}</span>
                          {sent ? <Badge variant={statusVariant(sent.status)}>{sent.status}</Badge> : <Badge variant="gray">Not sent</Badge>}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="outline" icon={<Eye size={12} />} onClick={() => openPreview(r)}>Preview</Button>
                          <Button size="sm" variant="outline" icon={<Send size={12} />} disabled={busy || !canManualSend} onClick={() => manualSend(r)}>Send Again</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
      </div>

      {/* Upcoming */}
      {isEmployeeMode || config.recipientMode === 'holiday' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><CalendarClock size={14} className="text-brand-500" /> Upcoming <span className="text-[10px] font-semibold text-slate-400">(next 30 days)</span></p>
          {loading ? <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
            : upcoming.length === 0 ? <Empty icon={<CalendarClock size={22} />} title="No upcoming events in the next 30 days." />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500"><tr>{['Employee', 'Department', 'Branch', config.recipientMode === 'employee-joindate' ? 'Anniversary' : 'Birthday', 'Days Remaining'].map(h => <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>
                      {upcoming.map(r => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-semibold text-slate-700">{r.name}</td>
                          <td className="px-3 py-2 text-slate-500">{r.department || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{r.branch || '—'}</td>
                          <td className="px-3 py-2">{formatDate(r.date)}</td>
                          <td className="px-3 py-2"><Badge variant={r.days === 1 ? 'amber' : 'blue'}>{r.days === 1 ? 'Tomorrow' : `${r.days} days`}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </div>
      ) : null}

      {/* Sent History */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><History size={14} className="text-emerald-600" /> Sent History <span className="text-[10px] font-semibold text-slate-400">({history.length})</span></p>
          <ExportBar columns={HISTORY_COLS} rows={historyExport} fileName={`${config.label.replace(/\s+/g, '_')}_History`} title={`${config.label} — Sent History`} subtitle={branding.companyName} disabled={loading || history.length === 0} />
        </div>
        {loading ? <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
          : history.length === 0 ? <Empty icon={<History size={22} />} title={`No ${config.label.toLowerCase()} have been sent yet.`} subtitle={`Once automation sends ${config.label.toLowerCase()}, the history will appear here.`} />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500"><tr>{['Employee', 'Template', 'Channel', 'Sent Date & Time', 'Status', 'Meta Message ID', 'Action'].map(h => <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody>
                    {history.map(l => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold text-slate-700">{l.employeeName || '—'}</td>
                        <td className="px-3 py-2">{l.templateName || (activeTemplate?.title || '—')}</td>
                        <td className="px-3 py-2"><Badge variant="green">WhatsApp</Badge></td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(l.createdAt)}</td>
                        <td className="px-3 py-2"><Badge variant={statusVariant(l.status)}>{l.status}</Badge></td>
                        <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{l.metaMessageId ? `${String(l.metaMessageId).slice(0, 22)}…` : '—'}</td>
                        <td className="px-3 py-2"><button onClick={() => setDetails(l)} className="text-[10px] font-bold text-emerald-600 hover:underline">View Details</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>

      {/* Automation Information + Audit Trail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><Activity size={14} className="text-brand-600" /> Automation Information</p>
          <dl className="grid grid-cols-2 gap-y-2 text-[11px]">
            <Info k="Automation Status" v={automationActive ? <Badge variant="green">Active</Badge> : <Badge variant="gray">Disabled</Badge>} />
            <Info k="Auto-Scheduler" v={schedulerOn ? <Badge variant="green">Running (every min)</Badge> : <Badge variant="gray">Off</Badge>} />
            <Info k="Last Run" v={latestRun ? formatDateTime(latestRun.createdAt) : (rule?.lastRunAt ? formatDateTime(rule.lastRunAt) : '—')} />
            <Info k="Next Scheduled Run" v={automationActive ? (ruleSchedule?.nextRunAt || `${triggerLabel(rule?.triggerType)}${rule?.scheduleTime ? ` at ${fmtTime12(rule.scheduleTime)}` : ''}`) : '—'} />
            <Info k="Employees Checked" v={latestRun ? latestRun.recipientsEvaluated : '—'} />
            <Info k="Recipients Found" v={latestRun ? latestRun.eligibleRecipients : '—'} />
            <Info k="Messages Queued" v={latestRun ? latestRun.queuedMessages : '—'} />
            <Info k="Messages Sent" v={sentTotal} />
            <Info k="Failed" v={failedTotal} />
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-slate-700"><History size={14} className="text-slate-600" /> Audit Trail</p>
          {auditTrail(audit, latestRun ? runs.filter(r => rule && r.ruleId === rule.id) : []).length === 0
            ? <Empty icon={<History size={22} />} title="No activity yet." subtitle="Preview, manual sends, retries, template changes and automatic runs appear here." />
            : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {auditTrail(audit, runs.filter(r => rule && r.ruleId === rule.id)).map((a, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-1.5 text-[11px]">
                    <div className="min-w-0">
                      <span className="font-bold text-slate-700">{a.action}</span>
                      {a.targetName && <span className="text-slate-500"> · {a.targetName}</span>}
                      <p className="truncate text-[10px] text-slate-400">{a.actorName}</p>
                    </div>
                    <span className="whitespace-nowrap text-[10px] text-slate-400">{formatDateTime(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* Preview modal */}
      {preview && (
        <Modal open={!!preview} onClose={() => { setPreview(null); setPreviewImg({ loading: false }); }} title={`${config.label} Preview`} size="md"
          footer={<Button variant="outline" onClick={() => { setPreview(null); setPreviewImg({ loading: false }); }}>Close</Button>}>
          <div className="space-y-3">
            <div className="text-[11px]"><span className="text-slate-400">Employee</span><p className="font-bold">{preview.name}</p></div>
            {/* The actual image card that will be delivered (rendered server-side, identical to the WhatsApp message). */}
            {isEmployeeMode && (
              previewImg.loading
                ? <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">Rendering image…</div>
                : previewImg.dataUrl
                  ? <img src={previewImg.dataUrl} alt="WhatsApp card preview" className="mx-auto w-full max-w-xs rounded-xl border border-slate-200 shadow-sm" />
                  : previewImg.error
                    ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-700">Image preview unavailable: {previewImg.error}</div>
                    : null
            )}
            {activeTemplate?.whatsappCaption && <WhatsAppPreview branding={branding} message={preview.message} caption={activeTemplate?.whatsappCaption} />}
            <p className="text-center text-[10px] text-slate-400">This is exactly the image the employee receives over WhatsApp (rendered from the selected template).</p>
          </div>
        </Modal>
      )}

      {/* View Details drawer */}
      {details && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setDetails(null)} />
          <div className="relative h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-2xl animate-slide-in-right">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-extrabold text-slate-800">Delivery Details</p>
              <button onClick={() => setDetails(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="space-y-3 p-4 text-[12px]">
              <Detail k="Employee" v={details.employeeName || '—'} />
              <Detail k="Template" v={details.templateName || (activeTemplate?.title || '—')} />
              <Detail k="Channel" v="WhatsApp (Meta Cloud API)" />
              <Detail k="Queue ID" v={details.queueId ? `#${details.queueId}` : '—'} />
              <Detail k="Meta Message ID" v={details.metaMessageId || '—'} mono />
              <Detail k="Sent Time" v={formatDateTime(details.createdAt)} />
              <Detail k="Delivery Status" v={<Badge variant={statusVariant(details.status)}>{details.status}</Badge>} />
              <Detail k="Retry Count" v={String(queueFor(details)?.attempts ?? 0)} />
              <Detail k="Development Mode" v={details.developmentMode ? 'Yes (redirected to test number)' : 'No (live)'} />
              {details.errorMessage && <Detail k="Error" v={<span className="text-rose-600">{details.errorMessage}{details.errorCode ? ` (#${details.errorCode})` : ''}</span>} />}
              {details.messagePreview && (
                <div><p className="mb-1 text-slate-400">Message</p><div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-800">{details.messagePreview}</div></div>
              )}
              {details.status === 'Failed' && <Button size="sm" icon={<RefreshCw size={13} />} disabled={busy} onClick={() => retry(details)}>Retry Delivery</Button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Filter field wrapper + shared input class.
const selCls = 'rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] focus:border-[#6C3CF0] focus:outline-none';
const Filter: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>{children}</div>
);
const Info: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <><dt className="text-slate-400">{k}</dt><dd className="text-right font-bold text-slate-700">{v}</dd></>
);
const Detail: React.FC<{ k: string; v: React.ReactNode; mono?: boolean }> = ({ k, v, mono }) => (
  <div className="flex items-start justify-between gap-3"><span className="text-slate-400">{k}</span><span className={`text-right font-semibold text-slate-700 ${mono ? 'font-mono break-all text-[11px]' : ''}`}>{v}</span></div>
);

// Merge the (additive) communication audit entries with automation runs (automatic
// sends), newest first — a unified, faithful activity trail.
function auditTrail(audit: any[], eventRuns: any[]) {
  const fromAudit = (audit || []).map(a => ({ action: a.action, targetName: a.targetName, actorName: a.actorName || 'System', createdAt: a.createdAt }));
  const fromRuns = (eventRuns || []).map(r => ({ action: r.mode === 'preview' ? 'Automation Preview' : r.mode === 'dry_run' ? 'Automation Dry-Run' : 'Automatic Send', targetName: `${r.queuedMessages ?? 0} queued · ${r.eligibleRecipients ?? 0} eligible`, actorName: 'Automation Engine', createdAt: r.createdAt }));
  return [...fromAudit, ...fromRuns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 60);
}

export default CommunicationEventModule;
