import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  LayoutDashboard, HandCoins, FilePlus2, ListChecks, Tags, BarChart3, Plus, Search, Eye,
  CheckCircle2, XCircle, Send, Banknote, Clock, AlertTriangle, TrendingUp, IndianRupee,
  Trash2, Download, Printer, Ban, Calculator, Bell, Wallet, ShieldCheck, ArrowRight,
  Pencil, Copy, Files,
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
import { RecordAttachments } from '@/components/finance/RecordAttachments';

interface Props { role?: string; activeCompanyId?: string; companies?: any[]; }

// Attachment types a loan / salary advance record can carry. Files stay attached
// to THAT record only (enterprise document architecture — no central dumping
// ground). Covers both loan and advance document sets.
const LOAN_ATTACHMENT_CATEGORIES = [
  'Loan Agreement', 'Employee Consent', 'EMI Schedule', 'Approval Letter',
  'Advance Approval Letter', 'Employee Request', 'Recovery Schedule', 'HR Approval',
  'Supporting Document',
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const inr = (n: any) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const INTEREST_TYPES = ['Flat', 'Reducing', 'None'];

const STATUS_VARIANT: Record<string, any> = {
  Draft: 'gray', 'Pending Approval': 'yellow', Approved: 'blue', Rejected: 'red',
  Disbursed: 'blue', Running: 'green', Completed: 'green', Closed: 'gray',
};
const statusBadge = (s: string) => <Badge variant={STATUS_VARIANT[s] || 'gray'}>{s}</Badge>;

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'create', label: 'New Loan', icon: FilePlus2 },
  { id: 'drafts', label: 'Drafts', icon: Files },
  { id: 'loans', label: 'All Loans', icon: ListChecks },
  { id: 'types', label: 'Loan Types', icon: Tags },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
] as const;
type TabId = typeof TABS[number]['id'];

export const LoanManagement: React.FC<Props> = ({ role = '', activeCompanyId, companies = [] }) => {
  const canEdit = ['Company Head', 'HR', 'Finance'].includes(role);
  const canApprove = ['Company Head', 'Finance'].includes(role);
  const canManage = ['Company Head', 'Finance'].includes(role);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [detailId, setDetailId] = useState<number | null>(null);
  // When set, the New Loan tab opens that draft for continued editing instead of a
  // blank form. Cleared whenever a fresh loan is started.
  const [editLoanId, setEditLoanId] = useState<number | null>(null);
  const activeCompany = companies.find((c: any) => String(c.id) === String(activeCompanyId));
  const startNewLoan = () => { setEditLoanId(null); setTab('create'); };
  const editLoan = (id: number) => { setEditLoanId(id); setTab('create'); };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="rounded-2xl border border-[#E6E0FE] bg-white px-4 py-3 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-800"><HandCoins size={16} className="text-[#6C3CF0]" /> Employee Loan Management</h2>
          <p className="text-[11px] text-slate-400">Loans &amp; advances, EMI schedules, approvals and automatic payroll deduction — {activeCompany?.name || 'your company'}.</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && <Button size="sm" variant="outline" icon={<Bell size={14} />} onClick={async () => { try { const r = await api.loans.runReminders(); ui.toast.success(`EMI reminders sent: ${r.sent} of ${r.checked} loan(s).`); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } }}>Send Reminders</Button>}
          {canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={startNewLoan}>New Loan</Button>}
        </div>
      </div>

      <DevelopmentBanner
        status="development"
        message="Employee Loan Management is under active development. Loan requests, approvals, the EMI schedule and automatic payroll deduction are live; reports export, employee self-service portal and multi-channel (SMS/WhatsApp/email) delivery are still being expanded."
      />

      {/* Sub navigation */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-[#6C3CF0] text-[#6C3CF0]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'dashboard' && <DashboardTab onOpen={(id) => setDetailId(id)} onNew={startNewLoan} />}
      {tab === 'create' && <NewLoanTab canEdit={canEdit} companyId={activeCompanyId} editId={editLoanId}
        onDone={() => { const wasEdit = editLoanId != null; setEditLoanId(null); setTab(wasEdit ? 'drafts' : 'loans'); }}
        onManageTypes={() => setTab('types')} />}
      {tab === 'drafts' && <LoansTab canEdit={canEdit} canApprove={canApprove} canManage={canManage} onOpen={(id) => setDetailId(id)} onEdit={editLoan} initialStatus="Draft" lockStatus emptyLabel="No drafts yet — click “New Loan”, fill the form and choose “Save as Draft”." />}
      {tab === 'loans' && <LoansTab canEdit={canEdit} canApprove={canApprove} canManage={canManage} onOpen={(id) => setDetailId(id)} onEdit={editLoan} />}
      {tab === 'types' && <TypesTab canEdit={canEdit} canManage={canManage} />}
      {tab === 'reports' && <ReportsTab company={activeCompany} />}

      {detailId != null && <LoanDetailModal id={detailId} onClose={() => setDetailId(null)} canEdit={canEdit} canManage={canManage} />}
    </div>
  );
};

// ── KPI card ────────────────────────────────────────────────────────────────
const Kpi: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; tone?: string }> = ({ label, value, icon, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${tone || 'bg-[#F3F0FF] text-[#6C3CF0]'}`}>{icon}</div>
    <p className="text-xl font-extrabold text-slate-800">{value}</p>
    <p className="text-[11px] font-semibold text-slate-400">{label}</p>
  </div>
);
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`}>{children}</div>
);

// ── Dashboard building blocks ─────────────────────────────────────────────────
const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode; hint?: string }> = ({ icon, children, hint }) => (
  <div className="flex items-center gap-2">
    <span className="text-slate-400">{icon}</span>
    <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">{children}</h3>
    {hint && <span className="text-[11px] font-medium text-slate-300">· {hint}</span>}
  </div>
);
// A single row inside a Recent-Activity card (loan / advance / compliance filing).
const ActivityCard: React.FC<{ icon: React.ReactNode; title: string; empty?: string; children?: React.ReactNode }> = ({ icon, title, empty, children }) => (
  <Card className="!p-0 overflow-hidden">
    <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
      <span className="text-slate-400">{icon}</span>
      <p className="text-xs font-extrabold text-slate-700">{title}</p>
    </div>
    <div className="divide-y divide-slate-50">
      {children || <p className="px-4 py-6 text-center text-[11px] text-slate-400">{empty || 'Nothing yet.'}</p>}
    </div>
  </Card>
);
const QuickAction: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button onClick={onClick} className="group flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#6C3CF0] hover:shadow-sm">
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F3F0FF] text-[#6C3CF0] transition group-hover:bg-[#6C3CF0] group-hover:text-white">{icon}</span>
    <span className="text-xs font-bold text-slate-700">{label}</span>
  </button>
);

// ── Dashboard ─────────────────────────────────────────────────────────────────
// A salary advance is a loan whose type name contains "advance" (same rule the
// Salary Advances workspace uses), so the loan feed already carries both.
const isAdvance = (name?: string) => /advance/i.test(String(name || ''));

export type FinanceNav = 'loans' | 'advances' | 'compliance' | 'reports' | 'approvals';

export const DashboardTab: React.FC<{
  onOpen: (id: number) => void;
  onNew: () => void;
  onNavigate?: (target: FinanceNav) => void;
  showCompliance?: boolean;
}> = ({ onOpen, onNew, onNavigate, showCompliance }) => {
  const [d, setD] = useState<any>(null);
  const [comp, setComp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setD(await api.loans.dashboard()); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } })(); }, []);
  // Compliance data is optional context — fetched only when the workspace grants
  // compliance access, and silently skipped otherwise (no error, no coupling).
  useEffect(() => { if (!showCompliance) return; (async () => { try { setComp(await api.compliance.dashboard()); } catch { /* compliance optional */ } })(); }, [showCompliance]);

  const k = d?.kpis || {};
  const recent: any[] = d?.recent || [];
  const recentLoans = recent.filter((l) => !isAdvance(l.loanTypeName));
  const recentAdvances = recent.filter((l) => isAdvance(l.loanTypeName));
  const overdueCount = k.overdueLoans ?? 0;
  const pendingCount = k.pendingApprovals ?? 0;
  const emiThisMonth = k.emiThisMonth ?? 0;
  const complianceUpcoming = comp?.kpis?.upcoming ?? 0;
  const complianceFilings: any[] = (comp?.recentOverdue?.length ? comp.recentOverdue : comp?.upcoming) || [];

  // Section 2 — only surface items that genuinely need action.
  const actions = [
    pendingCount > 0 && { key: 'appr', tone: 'bg-amber-50 text-amber-600', icon: <Clock size={15} />, label: 'Pending Loan Approvals', desc: `${pendingCount} request${pendingCount > 1 ? 's' : ''} awaiting a decision`, count: pendingCount, go: () => onNavigate?.('approvals') },
    overdueCount > 0 && { key: 'over', tone: 'bg-rose-50 text-rose-600', icon: <AlertTriangle size={15} />, label: 'Overdue EMI', desc: `${overdueCount} active loan${overdueCount > 1 ? 's' : ''} with a past-due installment`, count: overdueCount, go: () => onNavigate?.('loans') },
    showCompliance && complianceUpcoming > 0 && { key: 'comp', tone: 'bg-brand-50 text-brand-600', icon: <ShieldCheck size={15} />, label: 'Upcoming Compliance Filings', desc: `${complianceUpcoming} filing${complianceUpcoming > 1 ? 's' : ''} due within 30 days`, count: complianceUpcoming, go: () => onNavigate?.('compliance') },
  ].filter(Boolean) as { key: string; tone: string; icon: React.ReactNode; label: string; desc: string; count: number; go: () => void }[];

  const loanRow = (l: any) => (
    <button key={l.id} onClick={() => onOpen(l.id)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-xs hover:bg-slate-50">
      <span className="min-w-0 truncate font-semibold text-slate-700">{l.loanNumber} · {l.employeeName}</span>
      <span className="flex shrink-0 items-center gap-2 text-slate-500">{inr(l.principalAmount)} {statusBadge(l.status)}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      {/* ── Section 1 · Primary KPIs (4) ─────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionTitle icon={<LayoutDashboard size={14} />}>Primary KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Active Loans" value={loading ? '—' : k.totalActiveLoans ?? 0} icon={<HandCoins size={16} />} />
          <Kpi label="Pending Approvals" value={loading ? '—' : pendingCount} icon={<Clock size={16} />} tone="bg-amber-50 text-amber-600" />
          <Kpi label="Total Outstanding" value={loading ? '—' : inr(k.totalOutstanding)} icon={<TrendingUp size={16} />} tone="bg-orange-50 text-orange-600" />
          <Kpi label="EMI Deducted (This Month)" value={loading ? '—' : inr(emiThisMonth)} icon={<IndianRupee size={16} />} tone="bg-brand-50 text-brand-600" />
        </div>
      </section>

      {/* ── Intelligent alert · replaces the "Overdue Loans" KPI (hidden at 0) ─── */}
      {overdueCount > 0 && (
        <button onClick={() => onNavigate?.('loans')} className="flex w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left transition hover:bg-rose-100/70">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600"><AlertTriangle size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-rose-700">Overdue Loan Cases</span>
            <span className="block text-[11px] text-rose-600/80">{overdueCount} loan{overdueCount > 1 ? 's' : ''} require immediate attention.</span>
          </span>
          {onNavigate && <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-rose-600">View Details <ArrowRight size={13} /></span>}
        </button>
      )}

      {/* ── Section 2 · Action Required (only what needs action) ─────────────── */}
      <section className="space-y-2">
        <SectionTitle icon={<ListChecks size={14} />}>Action Required</SectionTitle>
        <Card className="!p-0 divide-y divide-slate-100">
          {loading ? (
            <p className="px-4 py-6 text-center text-[11px] text-slate-400">Loading…</p>
          ) : actions.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-6 text-xs text-slate-400"><CheckCircle2 size={15} className="text-emerald-500" /> You're all caught up — nothing needs attention right now.</div>
          ) : actions.map((a) => (
            <button key={a.key} onClick={a.go} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.tone}`}>{a.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-slate-700">{a.label}</span>
                <span className="block text-[11px] text-slate-400">{a.desc}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold text-slate-600">{a.count}</span>
                {onNavigate && <ArrowRight size={14} className="text-slate-300" />}
              </span>
            </button>
          ))}
        </Card>
      </section>

      {/* ── Section 3 · Recent Activities ───────────────────────────────────── */}
      <section className="space-y-2">
        <SectionTitle icon={<Clock size={14} />}>Recent Activities</SectionTitle>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ActivityCard icon={<HandCoins size={14} />} title="Recent Loans" empty="No loans yet.">
            {recentLoans.length > 0 ? recentLoans.map(loanRow) : undefined}
          </ActivityCard>
          <ActivityCard icon={<Wallet size={14} />} title="Recent Salary Advances" empty="No salary advances yet.">
            {recentAdvances.length > 0 ? recentAdvances.map(loanRow) : undefined}
          </ActivityCard>
          <ActivityCard icon={<IndianRupee size={14} />} title="Recent EMI Deductions" empty="No EMI deducted this month.">
            {emiThisMonth > 0 ? (
              <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="font-semibold text-slate-700">Deducted from payroll this month</span>
                <span className="font-extrabold text-slate-800">{inr(emiThisMonth)}</span>
              </div>
            ) : undefined}
          </ActivityCard>
          {showCompliance && (
            <ActivityCard icon={<ShieldCheck size={14} />} title="Recent Compliance Actions" empty="No recent compliance activity.">
              {complianceFilings.length > 0 ? complianceFilings.slice(0, 6).map((f: any, i: number) => (
                <div key={f.id ?? i} className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs">
                  <span className="min-w-0 truncate font-semibold text-slate-700">{f.title || f.formName || f.name || f.category || 'Filing'}</span>
                  <span className="shrink-0 text-slate-400">{f.dueDate ? formatDate(f.dueDate) : (f.category || '')}</span>
                </div>
              )) : undefined}
            </ActivityCard>
          )}
        </div>
      </section>

      {/* ── Section 4 · Quick Actions ───────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionTitle icon={<Plus size={14} />}>Quick Actions</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickAction icon={<HandCoins size={18} />} label="New Loan" onClick={onNew} />
          {onNavigate && <QuickAction icon={<Wallet size={18} />} label="Salary Advance" onClick={() => onNavigate('advances')} />}
          {onNavigate && showCompliance && <QuickAction icon={<ShieldCheck size={18} />} label="Compliance Filing" onClick={() => onNavigate('compliance')} />}
          {onNavigate && <QuickAction icon={<BarChart3 size={18} />} label="Reports" onClick={() => onNavigate('reports')} />}
        </div>
      </section>
    </div>
  );
};

// ── New Loan (request + live EMI preview) ─────────────────────────────────────
const blankLoanForm = () => {
  const now = new Date();
  return {
    employeeId: '', loanTypeId: '', loanTypeName: 'Loan',
    principalAmount: '', tenureMonths: 12, interestType: 'Flat', interestRate: 0,
    deductionStartMonth: MONTHS[now.getMonth()], deductionStartYear: now.getFullYear(),
    approvalAuthority: '', remarks: '', purpose: '',
  };
};

export const NewLoanTab: React.FC<{ canEdit: boolean; companyId?: string; editId?: number | null; onDone: () => void; onManageTypes?: () => void }> = ({ canEdit, companyId, editId = null, onDone, onManageTypes }) => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [typesLoaded, setTypesLoaded] = useState(false);
  const [form, setForm] = useState<any>(blankLoanForm);
  const [editStatus, setEditStatus] = useState<string | null>(null); // status of the loan being edited
  const [preview, setPreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try { const e = await api.employees.getAll(); setEmployees(Array.isArray(e) ? e : (e?.employees || e?.data || [])); } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not load employees.')); }
      // Surface real failures instead of silently showing an empty dropdown.
      try { setTypes(await api.loans.listTypes() || []); } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not load loan types.')); } finally { setTypesLoaded(true); }
    })();
  }, []);

  // Continue-editing: hydrate the form from an existing draft (or reset to blank
  // when starting a new loan). Only Draft / Pending Approval loans are editable.
  useEffect(() => {
    if (!editId) { setForm(blankLoanForm()); setEditStatus(null); return; }
    (async () => {
      try {
        const l = await api.loans.get(editId);
        setForm({
          employeeId: String(l.employeeId || ''), loanTypeId: l.loanTypeId ? String(l.loanTypeId) : '', loanTypeName: l.loanTypeName || 'Loan',
          principalAmount: l.principalAmount ?? '', tenureMonths: l.tenureMonths ?? 12, interestType: l.interestType || 'Flat', interestRate: l.interestRate ?? 0,
          deductionStartMonth: l.deductionStartMonth || MONTHS[new Date().getMonth()], deductionStartYear: l.deductionStartYear ?? new Date().getFullYear(),
          approvalAuthority: l.approvalAuthority || '', remarks: l.remarks || '', purpose: l.purpose || '',
        });
        setEditStatus(l.status);
      } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not load the draft.')); }
    })();
  }, [editId]);

  // Only ACTIVE loan types are selectable when creating a loan.
  const activeTypes = useMemo(() => types.filter((t) => t.active !== false), [types]);

  // Live EMI preview (debounced) whenever terms change.
  useEffect(() => {
    const amt = Number(form.principalAmount) || 0;
    if (amt <= 0 || !form.tenureMonths) { setPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        setPreview(await api.loans.previewEmi({
          principalAmount: amt, tenureMonths: Number(form.tenureMonths), interestType: form.interestType,
          interestRate: Number(form.interestRate) || 0, deductionStartMonth: form.deductionStartMonth, deductionStartYear: Number(form.deductionStartYear),
        }));
      } catch { /* preview optional */ }
    }, 350);
    return () => clearTimeout(t);
  }, [form.principalAmount, form.tenureMonths, form.interestType, form.interestRate, form.deductionStartMonth, form.deductionStartYear]);

  const onType = (id: string) => {
    const t = types.find((x) => String(x.id) === String(id));
    setForm((f: any) => ({ ...f, loanTypeId: id, loanTypeName: t?.name || 'Loan', interestType: t?.defaultInterestType || f.interestType, interestRate: t?.defaultInterestRate ?? f.interestRate }));
  };

  const submit = async (asDraft: boolean) => {
    if (!form.employeeId) return ui.toast.warning('Select an employee.');
    if (!(Number(form.principalAmount) > 0)) return ui.toast.warning('Enter a loan amount greater than zero.');
    setSaving(true);
    try {
      if (editId) {
        // Save the edited terms first, then submit if requested (Draft → Pending).
        await api.loans.update(editId, { ...form });
        if (!asDraft && editStatus === 'Draft') await api.loans.setStatus(editId, 'submit');
        ui.toast.success(asDraft ? 'Draft updated.' : 'Loan submitted for approval.');
      } else {
        await api.loans.create({ ...form, companyId, submit: !asDraft, status: asDraft ? 'Draft' : 'Pending Approval' });
        ui.toast.success(asDraft ? 'Loan saved as draft.' : 'Loan submitted for approval.');
      }
      onDone();
    } catch (e) { ui.toast.error(getApiErrorMessage(e, 'Could not save the loan.')); } finally { setSaving(false); }
  };
  const isPending = editId && editStatus === 'Pending Approval';

  if (!canEdit) return <Card><p className="text-xs text-slate-400">You do not have permission to create loans.</p></Card>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">{editId ? 'Edit Loan' : 'Loan Details'}</h3>
          {editId && editStatus && <span className="flex items-center gap-1.5 text-[11px] text-slate-400">Editing {statusBadge(editStatus)}</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Employee" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            options={[{ value: '', label: 'Select employee…' }, ...employees.map((e) => ({ value: String(e.id), label: `${e.name}${e.employeeId ? ` (${e.employeeId})` : ''}` }))]} />
          {typesLoaded && activeTypes.length === 0 ? (
            <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5"><AlertTriangle size={13} /> No loan types available</p>
              <p className="text-[11px] text-amber-600 mt-0.5">Configure at least one active loan type before creating a loan.</p>
              {onManageTypes && <button type="button" onClick={onManageTypes} className="mt-1.5 text-[11px] font-bold text-[#6C3CF0] hover:underline">Go to Loan Type Settings →</button>}
            </div>
          ) : (
            <Select label="Loan Type" value={form.loanTypeId} onChange={(e) => onType(e.target.value)}
              options={[{ value: '', label: 'Select type…' }, ...activeTypes.map((t) => ({ value: String(t.id), label: t.name }))]} />
          )}
          <Input label="Loan Amount (₹)" type="number" value={form.principalAmount} onChange={(e) => setForm({ ...form, principalAmount: e.target.value })} />
          <Input label="No. of Installments (months)" type="number" value={form.tenureMonths} onChange={(e) => setForm({ ...form, tenureMonths: e.target.value })} />
          <Select label="Interest Type" value={form.interestType} onChange={(e) => setForm({ ...form, interestType: e.target.value })}
            options={INTEREST_TYPES.map((t) => ({ value: t, label: t }))} />
          <Input label="Interest Rate (% p.a.)" type="number" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} disabled={form.interestType === 'None'} />
          <Select label="Deduction Start Month" value={form.deductionStartMonth} onChange={(e) => setForm({ ...form, deductionStartMonth: e.target.value })}
            options={MONTHS.map((m) => ({ value: m, label: m }))} />
          <Input label="Deduction Start Year" type="number" value={form.deductionStartYear} onChange={(e) => setForm({ ...form, deductionStartYear: e.target.value })} />
          <Input label="Approval Authority" value={form.approvalAuthority} onChange={(e) => setForm({ ...form, approvalAuthority: e.target.value })} placeholder="e.g. Finance Head" />
          <Input label="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" loading={saving} onClick={() => submit(true)}>{isPending ? 'Save Changes' : editId ? 'Save Draft' : 'Save as Draft'}</Button>
          {!isPending && <Button size="sm" icon={<Send size={13} />} loading={saving} onClick={() => submit(false)}>Submit for Approval</Button>}
          <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-3"><Calculator size={14} /> EMI Preview</h3>
        {!preview ? <p className="text-xs text-slate-400 py-6 text-center">Enter an amount &amp; tenure to preview the EMI.</p> : (
          <div className="space-y-2 text-sm">
            <Row label="Monthly EMI" value={inr(preview.emiAmount)} strong />
            <Row label="Principal" value={inr(form.principalAmount)} />
            <Row label="Total Interest" value={inr(preview.totalInterest)} />
            <Row label="Total Payable" value={inr(preview.totalPayable)} strong />
            <Row label="Installments" value={`${form.tenureMonths} month(s)`} />
            <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-slate-100">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-50 text-slate-500"><tr><th className="p-1.5 text-left">#</th><th className="p-1.5 text-left">Period</th><th className="p-1.5 text-right">EMI</th><th className="p-1.5 text-right">Balance</th></tr></thead>
                <tbody>
                  {(preview.schedule || []).map((s: any) => (
                    <tr key={s.seq} className="border-t border-slate-50"><td className="p-1.5">{s.seq}</td><td className="p-1.5">{s.periodMonth.slice(0, 3)} {s.periodYear}</td><td className="p-1.5 text-right">{inr(s.emiAmount)}</td><td className="p-1.5 text-right">{inr(s.closingBalance)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
const Row: React.FC<{ label: string; value: React.ReactNode; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex items-center justify-between"><span className="text-slate-500 text-xs">{label}</span><span className={`tabular-nums ${strong ? 'font-extrabold text-slate-800' : 'font-semibold text-slate-700'}`}>{value}</span></div>
);

// ── All Loans (table + workflow actions) ──────────────────────────────────────
export const LoansTab: React.FC<{
  canEdit: boolean; canApprove: boolean; canManage: boolean; onOpen: (id: number) => void;
  /** Open a Draft / Pending loan in the form to continue editing. */
  onEdit?: (id: number) => void;
  /** Seed the status filter (e.g. 'Pending Approval' for the Approvals view). */
  initialStatus?: string;
  /** Hide the status dropdown and pin the list to `initialStatus` (e.g. the Drafts list). */
  lockStatus?: boolean;
  /** Client-side filter: only show loans whose type name contains this (e.g. 'advance'). */
  typeContains?: string;
  /** Optional empty-state message override. */
  emptyLabel?: string;
}> = ({ canEdit, canApprove, canManage, onOpen, onEdit, initialStatus = '', lockStatus, typeContains, emptyLabel }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.loans.list({ status, q }); setRows(r?.loans || []); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); }
  }, [status, q]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const shown = useMemo(
    () => typeContains ? rows.filter((l) => String(l.loanTypeName || '').toLowerCase().includes(typeContains.toLowerCase())) : rows,
    [rows, typeContains],
  );

  const act = async (id: number, action: string) => {
    let extra: any = {};
    if (action === 'reject') { const reason = await ui.prompt({ title: 'Reject loan', message: 'Reason for rejection:', confirmText: 'Reject' }); if (reason == null) return; extra.reason = reason; }
    if (action === 'close') { const ok = await ui.confirm({ message: 'Force-close this loan? Remaining EMIs will stop deducting.', variant: 'danger', confirmText: 'Close' }); if (!ok) return; }
    try { await api.loans.setStatus(id, action, extra); ui.toast.success('Loan updated.'); load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const del = async (id: number) => { if (!(await ui.confirm({ message: 'Delete this loan? This can only be done for Draft/Rejected loans.', variant: 'danger', confirmText: 'Delete' }))) return; try { await api.loans.remove(id); ui.toast.success('Loan deleted.'); load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  const dup = async (id: number) => { try { await api.loans.duplicate(id); ui.toast.success('Draft copy created.'); load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee or loan #…" className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-[#6C3CF0] outline-none" /></div>
        {!lockStatus && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="text-xs rounded-lg border border-slate-200 px-2 py-2">
            <option value="">All statuses</option>
            {['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Disbursed', 'Running', 'Completed', 'Closed'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr>
            {['Loan #', 'Employee', 'Type', 'Principal', 'EMI', 'Tenure', 'Status', 'Actions'].map((h) => <th key={h} className="p-2.5 text-left font-bold whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="p-6 text-center text-slate-400">Loading…</td></tr>
              : shown.length === 0 ? <tr><td colSpan={8} className="p-6 text-center text-slate-400">{emptyLabel || 'No loans found.'}</td></tr>
                : shown.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-2.5 font-semibold text-slate-700">{l.loanNumber}</td>
                    <td className="p-2.5">{l.employeeName}</td>
                    <td className="p-2.5">{l.loanTypeName}</td>
                    <td className="p-2.5 tabular-nums">{inr(l.principalAmount)}</td>
                    <td className="p-2.5 tabular-nums">{inr(l.emiAmount)}</td>
                    <td className="p-2.5">{l.tenureMonths}m</td>
                    <td className="p-2.5">{statusBadge(l.status)}</td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-1">
                        <IconBtn title="View" onClick={() => onOpen(l.id)}><Eye size={14} /></IconBtn>
                        {canEdit && onEdit && ['Draft', 'Pending Approval'].includes(l.status) && <IconBtn title={l.status === 'Draft' ? 'Continue editing' : 'Edit'} onClick={() => onEdit(l.id)}><Pencil size={14} className="text-brand-600" /></IconBtn>}
                        {canEdit && l.status === 'Draft' && <IconBtn title="Submit" onClick={() => act(l.id, 'submit')}><Send size={14} className="text-brand-600" /></IconBtn>}
                        {canEdit && <IconBtn title="Duplicate" onClick={() => dup(l.id)}><Copy size={14} className="text-brand-600" /></IconBtn>}
                        {canApprove && l.status === 'Pending Approval' && <IconBtn title="Approve" onClick={() => act(l.id, 'approve')}><CheckCircle2 size={14} className="text-emerald-600" /></IconBtn>}
                        {canApprove && l.status === 'Pending Approval' && <IconBtn title="Reject" onClick={() => act(l.id, 'reject')}><XCircle size={14} className="text-rose-600" /></IconBtn>}
                        {(canApprove || canEdit) && l.status === 'Approved' && <IconBtn title="Disburse" onClick={() => act(l.id, 'disburse')}><Banknote size={14} className="text-emerald-600" /></IconBtn>}
                        {canManage && ['Approved', 'Disbursed', 'Running'].includes(l.status) && <IconBtn title="Close" onClick={() => act(l.id, 'close')}><Ban size={14} className="text-slate-500" /></IconBtn>}
                        {canManage && ['Draft', 'Rejected'].includes(l.status) && <IconBtn title="Delete" onClick={() => del(l.id)}><Trash2 size={14} className="text-rose-600" /></IconBtn>}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
const IconBtn: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button title={title} onClick={onClick} className="p-1.5 rounded-lg hover:bg-slate-100 transition">{children}</button>
);

// ── Loan Types ────────────────────────────────────────────────────────────────
export const TypesTab: React.FC<{ canEdit: boolean; canManage: boolean }> = ({ canEdit, canManage }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const load = async () => { setLoading(true); try { setRows(await api.loans.listTypes() || []); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name?.trim()) return ui.toast.warning('Name is required.');
    try { await api.loans.saveType(editing.id || null, editing); ui.toast.success('Loan type saved.'); setEditing(null); load(); } catch (e) { ui.toast.error(getApiErrorMessage(e)); }
  };
  const del = async (t: any) => { if (!(await ui.confirm({ message: `Delete loan type "${t.name}"?`, variant: 'danger', confirmText: 'Delete' }))) return; try { await api.loans.deleteType(t.id); ui.toast.success('Deleted.'); load(); } catch (e: any) { ui.toast.error(getApiErrorMessage(e)); load(); } };

  return (
    <div className="space-y-3">
      {canEdit && <div className="flex justify-end"><Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing({ name: '', defaultInterestType: 'Flat', defaultInterestRate: 0, active: true })}>Add Loan Type</Button></div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? <p className="text-xs text-slate-400 p-4">Loading…</p> : rows.map((t) => (
          <Card key={t.id} className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-800 flex items-center gap-2">{t.name} {!t.active && <Badge variant="gray">Inactive</Badge>} {t.isSystem && <Badge variant="blue">System</Badge>}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{t.defaultInterestType} · {t.defaultInterestRate || 0}% p.a.{t.code ? ` · ${t.code}` : ''}</p>
            </div>
            {canEdit && <div className="flex gap-1">
              <IconBtn title="Edit" onClick={() => setEditing(t)}><Eye size={14} /></IconBtn>
              {canManage && <IconBtn title="Delete" onClick={() => del(t)}><Trash2 size={14} className="text-rose-600" /></IconBtn>}
            </div>}
          </Card>
        ))}
      </div>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? 'Edit Loan Type' : 'New Loan Type'} size="md"
          footer={<><Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Input label="Code" value={editing.code || ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
            <Select label="Default Interest Type" value={editing.defaultInterestType} onChange={(e) => setEditing({ ...editing, defaultInterestType: e.target.value })} options={INTEREST_TYPES.map((t) => ({ value: t, label: t }))} />
            <Input label="Default Rate (% p.a.)" type="number" value={editing.defaultInterestRate ?? 0} onChange={(e) => setEditing({ ...editing, defaultInterestRate: Number(e.target.value) })} />
            <Input label="Max Amount (0 = unlimited)" type="number" value={editing.maxAmount ?? 0} onChange={(e) => setEditing({ ...editing, maxAmount: Number(e.target.value) })} />
            <Input label="Max Tenure Months (0 = unlimited)" type="number" value={editing.maxTenureMonths ?? 0} onChange={(e) => setEditing({ ...editing, maxTenureMonths: Number(e.target.value) })} />
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Active</label>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Reports ───────────────────────────────────────────────────────────────────
const REPORT_KEYS = [
  { key: 'summary', label: 'Loan Summary' },
  { key: 'ledger', label: 'Loan Ledger' },
  { key: 'outstanding', label: 'Outstanding Report' },
  { key: 'monthly', label: 'Monthly Deduction' },
  { key: 'completed', label: 'Completed Loans' },
  { key: 'interest', label: 'Interest Report' },
];
export const ReportsTab: React.FC<{ company?: any }> = ({ company }) => {
  const [key, setKey] = useState('summary');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = async (k: string) => { setLoading(true); try { setData(await api.loans.report(k)); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } finally { setLoading(false); } };
  useEffect(() => { load(key); }, [key]);

  const exportCsv = () => {
    if (!data) return;
    const lines = [data.columns.join(','), ...data.rows.map((r: any[]) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `loan-${key}.csv`; a.click();
  };
  const printReport = () => {
    if (!data) return;
    const w = window.open('', '_blank'); if (!w) return;
    const head = `<h2 style="font-family:Arial">${company?.name || 'Company'} — ${REPORT_KEYS.find((r) => r.key === key)?.label}</h2>`;
    const thead = `<tr>${data.columns.map((c: string) => `<th style="border:1px solid #333;padding:4px;background:#f1f5f9">${c}</th>`).join('')}</tr>`;
    const body = data.rows.map((r: any[]) => `<tr>${r.map((c) => `<td style="border:1px solid #333;padding:4px">${c ?? ''}</td>`).join('')}</tr>`).join('');
    w.document.write(`<html><body style="font-family:Arial">${head}<table style="border-collapse:collapse;font-size:11px;width:100%">${thead}${body}</table></body></html>`);
    w.document.close(); w.print();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={key} onChange={(e) => setKey(e.target.value)} className="text-xs rounded-lg border border-slate-200 px-2 py-2">
          {REPORT_KEYS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <div className="flex-1" />
        <Button size="sm" variant="outline" icon={<Download size={13} />} onClick={exportCsv} disabled={!data?.rows?.length}>CSV</Button>
        <Button size="sm" variant="outline" icon={<Printer size={13} />} onClick={printReport} disabled={!data?.rows?.length}>Print / PDF</Button>
      </div>
      {data?.summary && Object.keys(data.summary).length > 0 && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {Object.entries(data.summary).map(([k, v]) => <span key={k} className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-600">{k}: <b className="text-slate-800">{typeof v === 'number' && k.toLowerCase().includes('total') ? inr(v) : String(v)}</b></span>)}
        </div>
      )}
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50 text-slate-500"><tr>{(data?.columns || []).map((c: string) => <th key={c} className="p-2 text-left font-bold whitespace-nowrap">{c}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td className="p-6 text-center text-slate-400">Loading…</td></tr>
              : (data?.rows || []).length === 0 ? <tr><td className="p-6 text-center text-slate-400">No data.</td></tr>
                : data.rows.map((r: any[], i: number) => <tr key={i} className="border-t border-slate-100">{r.map((c, j) => <td key={j} className="p-2 whitespace-nowrap tabular-nums">{typeof c === 'number' && j >= 3 ? c.toLocaleString('en-IN') : String(c ?? '')}</td>)}</tr>)}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

// ── Loan detail (schedule + audit) ────────────────────────────────────────────
export const LoanDetailModal: React.FC<{ id: number; onClose: () => void; canEdit?: boolean; canManage?: boolean }> = ({ id, onClose, canEdit = false, canManage = false }) => {
  const [loan, setLoan] = useState<any>(null);
  useEffect(() => { (async () => { try { setLoan(await api.loans.get(id)); } catch (e) { ui.toast.error(getApiErrorMessage(e)); onClose(); } })(); }, [id]);
  if (!loan) return null;
  const d = loan.derived || {};
  const isAdvance = /advance/i.test(loan.loanTypeName || '');
  return (
    <Modal open onClose={onClose} title={`${loan.loanNumber} · ${loan.employeeName}`} subtitle={`${loan.loanTypeName} · ${loan.status}`} size="lg"
      footer={<Button size="sm" onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Stat label="Principal" value={inr(loan.principalAmount)} />
          <Stat label="EMI" value={inr(loan.emiAmount)} />
          <Stat label="Total Payable" value={inr(loan.totalPayable)} />
          <Stat label="Interest" value={`${loan.interestType} ${loan.interestRate || 0}%`} />
          <Stat label="Paid" value={`${d.installmentsPaid || 0}/${d.installmentsTotal || loan.tenureMonths}`} />
          <Stat label="Outstanding" value={inr(d.outstandingPayable)} />
          <Stat label="Next Due" value={d.nextDueMonth || '—'} />
          <Stat label="Last Deducted" value={d.lastDeductionMonth || '—'} />
        </div>

        <div>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">EMI Schedule (Ledger)</p>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50 text-slate-500 sticky top-0"><tr>{['#', 'Period', 'EMI', 'Principal', 'Interest', 'Balance', 'Status'].map((h) => <th key={h} className="p-1.5 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {(loan.installments || []).map((s: any) => (
                  <tr key={s.id} className="border-t border-slate-50">
                    <td className="p-1.5">{s.seq}</td><td className="p-1.5">{s.periodMonth.slice(0, 3)} {s.periodYear}</td>
                    <td className="p-1.5 tabular-nums">{inr(s.emiAmount)}</td><td className="p-1.5 tabular-nums">{inr(s.principalComponent)}</td>
                    <td className="p-1.5 tabular-nums">{inr(s.interestComponent)}</td><td className="p-1.5 tabular-nums">{inr(s.closingBalance)}</td>
                    <td className="p-1.5">{s.status === 'Paid' ? <Badge variant="green">Paid</Badge> : <Badge variant="gray">Pending</Badge>}</td>
                  </tr>
                ))}
                {(!loan.installments || loan.installments.length === 0) && <tr><td colSpan={7} className="p-3 text-center text-slate-400">Schedule generates on approval.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {loan.purpose && <p className="text-xs text-slate-500"><b>{isAdvance ? 'Reason' : 'Purpose'}:</b> {loan.purpose}</p>}
        {loan.remarks && <p className="text-xs text-slate-500"><b>Remarks:</b> {loan.remarks}</p>}

        {/* Attachments — files that belong to THIS loan/advance only. */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
          <RecordAttachments
            source={isAdvance ? 'Advance' : 'Loan'}
            altSources={isAdvance ? ['Loan'] : ['Advance']}
            sourceRef={loan.id}
            canEdit={canEdit}
            canDelete={canManage}
            categories={LOAN_ATTACHMENT_CATEGORIES}
            employeeId={loan.employeeId}
            employeeName={loan.employeeName}
            title={isAdvance ? 'Advance Attachments' : 'Loan Attachments'}
          />
        </div>

        <div>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Activity</p>
          <div className="space-y-1">
            {(loan.audit || []).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between text-[11px] text-slate-500">
                <span><b className="text-slate-700">{a.action}</b> {a.fromStatus ? `${a.fromStatus} → ${a.toStatus}` : ''} {a.details ? `· ${a.details}` : ''}</span>
                <span>{formatDate(a.createdAt)}{a.performedBy ? ` · ${a.performedBy}` : ''}</span>
              </div>
            ))}
            {(!loan.audit || loan.audit.length === 0) && <p className="text-[11px] text-slate-400">No activity yet.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
};
const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-100 bg-slate-50 p-2"><p className="text-[9px] uppercase font-bold text-slate-400">{label}</p><p className="text-xs font-bold text-slate-800 mt-0.5">{value}</p></div>
);

export default LoanManagement;
