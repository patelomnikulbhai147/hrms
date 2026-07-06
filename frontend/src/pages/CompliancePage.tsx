import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  LayoutDashboard, ShieldCheck, CalendarDays, ListChecks, FolderOpen, BarChart3, Plus, Search,
  CheckCircle2, AlertTriangle, Clock, Upload, Download, Trash2, Ban, RefreshCw, FileText, IndianRupee,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ui } from '@/components/ui/feedback';
import { DevelopmentBanner } from '@/components/ui/DevelopmentBanner';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDate } from '@/utils/formatDate';

interface Props { role?: string; activeCompanyId?: string; companies?: any[]; }
const inr = (n: any) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const CATEGORIES = ['PF', 'ESI', 'PT', 'TDS', 'GST', 'LWF', 'Bonus', 'Gratuity', 'Factory Act', 'Labour License', 'Custom'];
const STATUS_VARIANT: Record<string, any> = { Pending: 'yellow', Overdue: 'red', Filed: 'green', Waived: 'gray' };
const statusBadge = (s: string) => <Badge variant={STATUS_VARIANT[s] || 'gray'}>{s}</Badge>;

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'calendar', label: 'Compliance Calendar', icon: CalendarDays },
  { id: 'filings', label: 'Filings', icon: ListChecks },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
] as const;
type TabId = typeof TABS[number]['id'];

export const CompliancePage: React.FC<Props> = ({ role = '', activeCompanyId, companies = [] }) => {
  const canEdit = ['Company Head', 'HR', 'Finance'].includes(role);
  const canManage = ['Company Head', 'Finance'].includes(role);
  const [tab, setTab] = useState<TabId>('dashboard');
  const activeCompany = companies.find((c: any) => String(c.id) === String(activeCompanyId));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="rounded-2xl border border-[#DBEAFE] bg-white px-4 py-3 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-800"><ShieldCheck size={16} className="text-[#4F7CFF]" /> Compliance Management</h2>
          <p className="text-[11px] text-slate-400">Statutory filing calendar, due-date tracking &amp; challans — PF · ESI · PT · TDS · GST · LWF — {activeCompany?.name || 'your company'}.</p>
        </div>
      </div>

      <DevelopmentBanner status="development" message="Compliance Management is under active development. The statutory filing calendar (PF/ESI/PT/TDS/GST/LWF), due-date tracking, status, challan upload and payroll-derived amounts are live; auto-reminders, government e-filing integrations and the full statutory report suite are still being expanded (detailed challans are in the Reports module)." />

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => { const Icon = t.icon; return (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-[#4F7CFF] text-[#4F7CFF]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon size={14} /> {t.label}
          </button>
        ); })}
      </div>

      {tab === 'dashboard' && <DashboardTab onGoto={setTab} />}
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'filings' && <FilingsTab canEdit={canEdit} canManage={canManage} />}
      {tab === 'documents' && <DocumentsTab />}
      {tab === 'reports' && <ReportsTab company={activeCompany} />}
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; tone?: string }> = ({ label, value, icon, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${tone || 'bg-[#EDF4FF] text-[#4F7CFF]'}`}>{icon}</div>
    <p className="text-xl font-extrabold text-slate-800">{value}</p>
    <p className="text-[11px] font-semibold text-slate-400">{label}</p>
  </div>
);
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`}>{children}</div>
);
const dueChip = (dueDate: string) => {
  const days = Math.round((new Date(dueDate).getTime() - Date.now()) / 864e5);
  if (days < 0) return <span className="text-rose-600 font-bold">{-days}d overdue</span>;
  if (days === 0) return <span className="text-orange-600 font-bold">due today</span>;
  return <span className={days <= 7 ? 'text-orange-500 font-semibold' : 'text-slate-400'}>in {days}d</span>;
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
const DashboardTab: React.FC<{ onGoto: (t: TabId) => void }> = ({ onGoto }) => {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setD(await api.compliance.dashboard()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } })(); }, []);
  const k = d?.kpis || {};
  const cats = d?.byCategory || {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Upcoming (30d)" value={loading ? '—' : k.upcoming ?? 0} icon={<Clock size={16} />} tone="bg-sky-50 text-sky-600" />
        <Kpi label="Overdue" value={loading ? '—' : k.overdue ?? 0} icon={<AlertTriangle size={16} />} tone="bg-rose-50 text-rose-600" />
        <Kpi label="Pending" value={loading ? '—' : k.pendingTotal ?? 0} icon={<ListChecks size={16} />} tone="bg-amber-50 text-amber-600" />
        <Kpi label="Filed" value={loading ? '—' : k.filedTotal ?? 0} icon={<CheckCircle2 size={16} />} tone="bg-emerald-50 text-emerald-600" />
        <Kpi label="Pending Amount" value={loading ? '—' : inr(k.pendingAmount)} icon={<IndianRupee size={16} />} tone="bg-indigo-50 text-indigo-600" />
      </div>

      <Card>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Statutory Categories (pending)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {CATEGORIES.filter((c) => cats[c]).map((c) => (
            <button key={c} onClick={() => onGoto('filings')} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-left hover:border-[#4F7CFF] transition">
              <p className="text-[10px] font-bold uppercase text-slate-400">{c}</p>
              <p className="text-lg font-extrabold text-slate-800">{cats[c].pending}</p>
              <p className="text-[10px] text-slate-500">{inr(cats[c].amount)}</p>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Upcoming Due</h3>
          <div className="space-y-1">
            {(d?.upcoming || []).map((f: any) => (
              <div key={f.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg hover:bg-slate-50">
                <span className="font-semibold text-slate-700 truncate">{f.category} · {f.periodLabel}</span>
                <span className="flex items-center gap-2 shrink-0 text-[11px]">{f.amount ? inr(f.amount) : ''} {dueChip(f.dueDate)} {statusBadge(f.status)}</span>
              </div>
            ))}
            {(!d?.upcoming || d.upcoming.length === 0) && <p className="text-xs text-slate-400 py-4 text-center">Nothing due in the next 30 days. 🎉</p>}
          </div>
        </Card>
        <Card>
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 text-rose-600">Overdue</h3>
          <div className="space-y-1">
            {(d?.recentOverdue || []).map((f: any) => (
              <div key={f.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg hover:bg-slate-50">
                <span className="font-semibold text-slate-700 truncate">{f.category} · {f.periodLabel}</span>
                <span className="flex items-center gap-2 shrink-0 text-[11px]">{f.amount ? inr(f.amount) : ''} {dueChip(f.dueDate)}</span>
              </div>
            ))}
            {(!d?.recentOverdue || d.recentOverdue.length === 0) && <p className="text-xs text-slate-400 py-4 text-center">No overdue filings. ✅</p>}
          </div>
        </Card>
      </div>
    </div>
  );
};

// ── Calendar (by-due-date list for a month) ───────────────────────────────────
const CalendarTab: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { setLoading(true); try { const r = await api.compliance.listFilings({ year }); setRows(r?.filings || []); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } })(); }, [year]);
  const byMonth = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const f of rows) { const key = f.dueDate.slice(0, 7); (m[key] ||= []).push(f); }
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setYear(year - 1)}>‹ {year - 1}</Button>
        <span className="text-sm font-extrabold text-slate-700">{year}</span>
        <Button size="sm" variant="outline" onClick={() => setYear(year + 1)}>{year + 1} ›</Button>
      </div>
      {loading ? <Card><p className="text-xs text-slate-400">Loading…</p></Card>
        : byMonth.length === 0 ? <Card><p className="text-xs text-slate-400 text-center py-6">No filings for {year}.</p></Card>
          : byMonth.map(([month, items]) => (
            <Card key={month}>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">{new Date(month + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</h3>
              <div className="space-y-1">
                {items.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((f) => (
                  <div key={f.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                    <span className="flex items-center gap-2"><span className="w-9 text-slate-400 tabular-nums">{f.dueDate.slice(8)}</span><span className="font-semibold text-slate-700">{f.category} · {f.title}</span></span>
                    <span className="flex items-center gap-2 text-[11px]">{f.amount ? inr(f.amount) : ''} {dueChip(f.dueDate)} {statusBadge(f.status)}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
    </div>
  );
};

// ── Filings (table + actions) ─────────────────────────────────────────────────
const FilingsTab: React.FC<{ canEdit: boolean; canManage: boolean }> = ({ canEdit, canManage }) => {
  const now = new Date();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [fileModal, setFileModal] = useState<any | null>(null);
  const [addModal, setAddModal] = useState<any | null>(null);

  const load = useCallback(async () => { setLoading(true); try { const r = await api.compliance.listFilings({ category, status, year }); setRows(r?.filings || []); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } }, [category, status, year]);
  useEffect(() => { load(); }, [load]);

  const doStatus = async (id: number, action: string, extra: any = {}) => { try { await api.compliance.setFilingStatus(id, action, extra); ui.toast.success('Updated.'); load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  const waive = async (f: any) => { if (!(await ui.confirm({ message: `Mark ${f.category} ${f.periodLabel} as Not Applicable / Waived?`, confirmText: 'Waive' }))) return; doStatus(f.id, 'waive'); };
  const del = async (f: any) => { if (!(await ui.confirm({ message: `Delete this filing? ${f.autoGenerated ? '(It will regenerate on the next calendar refresh.)' : ''}`, variant: 'danger', confirmText: 'Delete' }))) return; try { await api.compliance.deleteFiling(f.id); ui.toast.success('Deleted.'); load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  const uploadChallan = (f: any) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/pdf,image/*';
    input.onchange = () => { const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = async () => { try { await api.compliance.uploadChallan(f.id, { fileData: reader.result, fileName: file.name, mimeType: file.type }); ui.toast.success('Challan uploaded.'); load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } }; reader.readAsDataURL(file); };
    input.click();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="text-xs rounded-lg border border-slate-200 px-2 py-2"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="text-xs rounded-lg border border-slate-200 px-2 py-2"><option value="">All statuses</option>{['Pending', 'Overdue', 'Filed', 'Waived'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="text-xs rounded-lg border border-slate-200 px-2 py-2">{[year - 1, year, year + 1, now.getFullYear()].filter((v, i, a) => a.indexOf(v) === i).sort().map((y) => <option key={y} value={y}>{y}</option>)}</select>
        <div className="flex-1" />
        {canEdit && <Button size="sm" variant="outline" icon={<RefreshCw size={13} />} onClick={async () => { try { const r = await api.compliance.regenerate(); ui.toast.success(`Calendar refreshed (${r.created} added).`); load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } }}>Refresh Calendar</Button>}
        {canEdit && <Button size="sm" icon={<Plus size={13} />} onClick={() => setAddModal({ category: 'Custom', title: '', frequency: 'One-Time', periodYear: year, periodMonth: 0, dueDate: `${year}-12-31`, amount: 0 })}>Add Filing</Button>}
      </div>

      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr>{['Category', 'Title', 'Period', 'Due Date', 'Amount', 'Status', 'Actions'].map((h) => <th key={h} className="p-2.5 text-left font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="p-6 text-center text-slate-400">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-slate-400">No filings. Try "Refresh Calendar".</td></tr>
                : rows.map((f) => (
                  <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-2.5 font-semibold text-slate-700">{f.category}</td>
                    <td className="p-2.5">{f.title}</td>
                    <td className="p-2.5">{f.periodLabel}</td>
                    <td className="p-2.5 whitespace-nowrap">{formatDate(f.dueDate)} <span className="ml-1 text-[10px]">{f.status !== 'Filed' && f.status !== 'Waived' ? dueChip(f.dueDate) : ''}</span></td>
                    <td className="p-2.5 tabular-nums">{f.amount ? inr(f.amount) : '—'}</td>
                    <td className="p-2.5">{statusBadge(f.status)} {f.hasChallan && <FileText size={12} className="inline text-emerald-600 ml-1" />}</td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-1">
                        {canEdit && (f.status === 'Pending' || f.status === 'Overdue') && <IconBtn title="Mark Filed" onClick={() => setFileModal({ ...f })}><CheckCircle2 size={14} className="text-emerald-600" /></IconBtn>}
                        {canEdit && <IconBtn title="Upload Challan" onClick={() => uploadChallan(f)}><Upload size={14} className="text-slate-500" /></IconBtn>}
                        {canEdit && f.status === 'Filed' && <IconBtn title="Reopen" onClick={() => doStatus(f.id, 'reopen')}><RefreshCw size={14} className="text-slate-500" /></IconBtn>}
                        {canManage && (f.status === 'Pending' || f.status === 'Overdue') && <IconBtn title="Waive / N.A." onClick={() => waive(f)}><Ban size={14} className="text-slate-400" /></IconBtn>}
                        {canManage && <IconBtn title="Delete" onClick={() => del(f)}><Trash2 size={14} className="text-rose-600" /></IconBtn>}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </Card>

      {fileModal && <FileModal filing={fileModal} onClose={() => setFileModal(null)} onDone={() => { setFileModal(null); load(); }} />}
      {addModal && <AddFilingModal draft={addModal} onClose={() => setAddModal(null)} onDone={() => { setAddModal(null); load(); }} />}
    </div>
  );
};
const IconBtn: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button title={title} onClick={onClick} className="p-1.5 rounded-lg hover:bg-slate-100 transition">{children}</button>
);

const FileModal: React.FC<{ filing: any; onClose: () => void; onDone: () => void }> = ({ filing, onClose, onDone }) => {
  const [filedDate, setFiledDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNumber, setRef] = useState('');
  const [amount, setAmount] = useState(filing.amount || 0);
  const save = async () => { try { await api.compliance.setFilingStatus(filing.id, 'file', { filedDate, referenceNumber, amount: Number(amount) }); ui.toast.success('Marked as filed.'); onDone(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  return (
    <Modal open onClose={onClose} title={`Mark Filed · ${filing.category} ${filing.periodLabel}`} size="md" footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save}>Mark Filed</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Filed Date" type="date" value={filedDate} onChange={(e) => setFiledDate(e.target.value)} />
        <Input label="Amount Paid (₹)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Challan / ARN / Ack. No." value={referenceNumber} onChange={(e) => setRef(e.target.value)} className="sm:col-span-2" />
      </div>
    </Modal>
  );
};

const AddFilingModal: React.FC<{ draft: any; onClose: () => void; onDone: () => void }> = ({ draft, onClose, onDone }) => {
  const [f, setF] = useState<any>(draft);
  const save = async () => { if (!f.title?.trim()) return ui.toast.warning('Title is required.'); try { await api.compliance.saveFiling(null, f); ui.toast.success('Filing added.'); onDone(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  return (
    <Modal open onClose={onClose} title="Add Compliance Filing" size="md" footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save}>Add</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
        <Select label="Frequency" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })} options={['Monthly', 'Quarterly', 'Half-Yearly', 'Annual', 'One-Time'].map((x) => ({ value: x, label: x }))} />
        <Input label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="sm:col-span-2" />
        <Input label="Period Label" value={f.periodLabel || ''} onChange={(e) => setF({ ...f, periodLabel: e.target.value })} placeholder="e.g. Jul 2026" />
        <Input label="Due Date" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        <Input label="Amount (₹)" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} />
        <Input label="Assigned To" value={f.assignedTo || ''} onChange={(e) => setF({ ...f, assignedTo: e.target.value })} />
      </div>
    </Modal>
  );
};

// ── Documents (challans) ──────────────────────────────────────────────────────
const DocumentsTab: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { const r = await api.compliance.listFilings({}); setRows((r?.filings || []).filter((f: any) => f.hasChallan)); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } })(); }, []);
  const download = async (f: any) => { try { const full = await api.compliance.getFiling(f.id); if (!full.challanFileData) return ui.toast.warning('No file.'); const a = document.createElement('a'); a.href = full.challanFileData; a.download = full.challanFileName || 'challan'; a.click(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  return (
    <Card>
      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Uploaded Challans &amp; Documents</h3>
      {loading ? <p className="text-xs text-slate-400">Loading…</p>
        : rows.length === 0 ? <p className="text-xs text-slate-400 text-center py-6">No challans uploaded yet. Upload one from the Filings tab.</p>
          : <div className="space-y-1">
            {rows.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-xs py-2 border-b border-slate-50 last:border-0">
                <span className="flex items-center gap-2"><FileText size={14} className="text-emerald-600" /><span className="font-semibold text-slate-700">{f.category} · {f.periodLabel}</span><span className="text-slate-400">{f.challanFileName}</span></span>
                <Button size="sm" variant="outline" icon={<Download size={13} />} onClick={() => download(f)}>Download</Button>
              </div>
            ))}
          </div>}
    </Card>
  );
};

// ── Reports (compliance summary + CSV; detailed challans live in Reports mod) ──
const ReportsTab: React.FC<{ company?: any }> = ({ company }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { const r = await api.compliance.listFilings({}); setRows(r?.filings || []); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } })(); }, []);
  const summary = useMemo(() => {
    const m: Record<string, any> = {};
    for (const f of rows) { const s = (m[f.category] ||= { category: f.category, pending: 0, overdue: 0, filed: 0, amount: 0 }); if (f.status === 'Overdue') s.overdue++; else if (f.status === 'Filed') s.filed++; else if (f.status === 'Pending') s.pending++; s.amount += f.amount || 0; }
    return Object.values(m);
  }, [rows]);
  const exportCsv = () => {
    const cols = ['Category', 'Pending', 'Overdue', 'Filed', 'Total Amount'];
    const lines = [cols.join(','), ...summary.map((s: any) => [s.category, s.pending, s.overdue, s.filed, Math.round(s.amount)].join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'compliance-summary.csv'; a.click();
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-slate-400 flex-1">Statutory summary from the filing calendar. Detailed PF/ESI/PT challans, Form 16, ECR &amp; the full statutory register suite are in the <b>Reports</b> module.</p>
        <Button size="sm" variant="outline" icon={<Download size={13} />} onClick={exportCsv} disabled={!summary.length}>Export CSV</Button>
      </div>
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr>{['Category', 'Pending', 'Overdue', 'Filed', 'Total Amount'].map((h) => <th key={h} className="p-2.5 text-left font-bold">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="p-6 text-center text-slate-400">Loading…</td></tr>
              : summary.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-slate-400">No data.</td></tr>
                : summary.map((s: any) => (
                  <tr key={s.category} className="border-t border-slate-100">
                    <td className="p-2.5 font-semibold text-slate-700">{s.category}</td>
                    <td className="p-2.5">{s.pending}</td>
                    <td className="p-2.5 text-rose-600">{s.overdue}</td>
                    <td className="p-2.5 text-emerald-600">{s.filed}</td>
                    <td className="p-2.5 tabular-nums">{inr(s.amount)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default CompliancePage;
