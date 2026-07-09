// ─────────────────────────────────────────────────────────────────────────────
// Finance & Compliance — a single enterprise module that unifies the former
// "Employee Loan Management" and "Compliance Management" sidebar items into one
// logically-grouped workspace. All employee financial operations (loans, salary
// advances, EMI schedules, approvals) and statutory compliance (filing calendar,
// deductions, challans) live here, with Payroll remaining the engine that
// automatically deducts EMIs and derives statutory amounts.
//
// This is a pure re-organisation: every section reuses the existing, already-live
// components exported from LoanManagement.tsx and CompliancePage.tsx, so no
// functionality, API or permission behaviour changes — it is only regrouped
// behind one sidebar entry with richer sub-navigation.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from 'react';
import {
  LayoutDashboard, HandCoins, Wallet, ShieldCheck, ReceiptText, CheckCircle2,
  BarChart3, Settings as SettingsIcon, Landmark, Bell, Plus, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ui } from '@/components/ui/feedback';
import { DevelopmentBanner } from '@/components/ui/DevelopmentBanner';
import { api } from '@/api/apiClient';
import { getApiErrorMessage } from '@/utils/apiError';
import { usePermissions } from '@/context/PermissionContext';

// Loan sub-components (exported from the existing, unchanged loan module).
import {
  DashboardTab as LoanDashboardTab,
  NewLoanTab,
  LoansTab,
  TypesTab as LoanTypesTab,
  ReportsTab as LoanReportsTab,
  LoanDetailModal,
} from '@/pages/LoanManagement';
// Salary Advances — dedicated advance workspace (built on the loan engine).
import { SalaryAdvancesSection } from '@/pages/SalaryAdvances';
// Compliance sub-components (exported from the existing, unchanged compliance module).
import {
  DashboardTab as ComplianceDashboardTab,
  CalendarTab as ComplianceCalendarTab,
  FilingsTab as ComplianceFilingsTab,
  ReportsTab as ComplianceReportsTab,
  type ComplianceTabId,
} from '@/pages/CompliancePage';
// Documents = full statutory-document repository (replaces the old challan list).

interface Props { role?: string; activeCompanyId?: string; companies?: any[]; }

// NOTE: the generic "Documents" tab was intentionally removed (enterprise
// document architecture). Company-level docs live in Company Profile → Company
// Documents; loan/advance files are attached to each Loan/Advance record; and
// compliance challans belong to their filing. There is no central dumping ground.
type SectionId =
  | 'dashboard' | 'loans' | 'advances' | 'compliance'
  | 'deductions' | 'approvals' | 'reports' | 'settings';

interface SectionDef { id: SectionId; label: string; icon: React.ComponentType<any>; needs: 'loans' | 'compliance' | 'any'; }

const SECTIONS: SectionDef[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, needs: 'any' },
  { id: 'loans', label: 'Employee Loans', icon: HandCoins, needs: 'loans' },
  { id: 'advances', label: 'Salary Advances', icon: Wallet, needs: 'loans' },
  { id: 'compliance', label: 'Compliance', icon: ShieldCheck, needs: 'compliance' },
  { id: 'deductions', label: 'Deductions', icon: ReceiptText, needs: 'compliance' },
  { id: 'approvals', label: 'Approvals', icon: CheckCircle2, needs: 'loans' },
  { id: 'reports', label: 'Reports', icon: BarChart3, needs: 'any' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, needs: 'any' },
];

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`}>{children}</div>
);
const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">{children}</h3>
);
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2 text-[11px] text-slate-600">
    <Info size={13} className="text-brand-500 mt-0.5 shrink-0" /> <span>{children}</span>
  </div>
);

// Segmented (pill) control reused by Compliance & Reports sub-views.
const Segmented: React.FC<{ value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }> = ({ value, onChange, options }) => (
  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
    {options.map((o) => (
      <button key={o.value} onClick={() => onChange(o.value)}
        className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition ${value === o.value ? 'bg-white text-[#6C3CF0] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
        {o.label}
      </button>
    ))}
  </div>
);

export const FinanceCompliance: React.FC<Props> = ({ role = '', activeCompanyId, companies = [] }) => {
  const { canView } = usePermissions();
  const canLoans = canView('loans');
  const canCompliance = canView('compliance');

  const canEdit = ['Company Head', 'HR', 'Finance'].includes(role);
  const canApprove = ['Company Head', 'Finance'].includes(role);
  const canManage = ['Company Head', 'Finance'].includes(role);
  const activeCompany = companies.find((c: any) => String(c.id) === String(activeCompanyId));

  // Only surface sections the user is actually permitted to see.
  const sections = useMemo(() => SECTIONS.filter((s) =>
    s.needs === 'any' ? (canLoans || canCompliance) : s.needs === 'loans' ? canLoans : canCompliance,
  ), [canLoans, canCompliance]);

  const [section, setSection] = useState<SectionId>(sections[0]?.id || 'dashboard');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [loanView, setLoanView] = useState<'list' | 'new'>('list');
  const [advNewToken, setAdvNewToken] = useState(0);
  const [complianceView, setComplianceView] = useState<'calendar' | 'filings'>('filings');
  const [reportsView, setReportsView] = useState<'loans' | 'compliance'>(canLoans ? 'loans' : 'compliance');

  const goTo = (s: SectionId) => { setSection(s); };

  const sendLoanReminders = async () => { try { const r = await api.loans.runReminders(); ui.toast.success(`EMI reminders sent: ${r.sent} of ${r.checked} loan(s).`); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  const sendComplianceReminders = async () => { try { const r = await api.compliance.runReminders(); ui.toast.success(`Compliance reminders sent: ${r.sent} of ${r.checked} filing(s) due.`); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };
  const refreshCalendar = async () => { try { const r = await api.compliance.regenerate(); ui.toast.success(`Compliance calendar refreshed (${r.created} added).`); } catch (e) { ui.toast.error(getApiErrorMessage(e)); } };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="rounded-2xl border border-[#E6E0FE] bg-white px-4 py-3 shadow-sm flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-800"><Landmark size={16} className="text-[#6C3CF0]" /> Finance &amp; Compliance</h2>
          <p className="text-[11px] text-slate-400">Employee loans &amp; advances, statutory filing calendar and payroll-driven deductions — one place — {activeCompany?.name || 'your company'}.</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && canLoans && section !== 'compliance' && section !== 'deductions' && (
            <Button size="sm" variant="outline" icon={<Bell size={14} />} onClick={sendLoanReminders}>EMI Reminders</Button>
          )}
          {canEdit && canCompliance && (section === 'compliance' || section === 'deductions' || section === 'dashboard') && (
            <Button size="sm" variant="outline" icon={<Bell size={14} />} onClick={sendComplianceReminders}>Filing Reminders</Button>
          )}
          {canEdit && canLoans && section === 'loans' && (
            <Button size="sm" icon={<Plus size={14} />} onClick={() => { setSection('loans'); setLoanView('new'); }}>New Loan</Button>
          )}
          {canEdit && canLoans && section === 'advances' && (
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setAdvNewToken((t) => t + 1)}>New Salary Advance</Button>
          )}
        </div>
      </div>

      <DevelopmentBanner
        status="development"
        message="Finance & Compliance is under active development. Loan management, statutory compliance, payroll deductions, filing automation, reports, and government integrations are still being expanded. Existing functionality remains safe to use."
      />

      {/* Sub navigation */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => goTo(s.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${section === s.id ? 'border-[#6C3CF0] text-[#6C3CF0]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon size={14} /> {s.label}
            </button>
          );
        })}
      </div>

      {/* ── Dashboard (unified 4-section IA) ──────────────────────────────────
          Loan-permitted users get the single, decluttered Finance & Compliance
          dashboard (Primary KPIs · Action Required · Recent Activities · Quick
          Actions), which also surfaces compliance actions/filings when the user
          has compliance access. Compliance-only users keep the compliance view. */}
      {section === 'dashboard' && (
        canLoans ? (
          <LoanDashboardTab
            onOpen={(id) => setDetailId(id)}
            onNew={() => { setSection('loans'); setLoanView('new'); }}
            showCompliance={canCompliance}
            onNavigate={(t) => {
              if (t === 'advances') setSection('advances');
              else if (t === 'compliance') { setSection('compliance'); setComplianceView('filings'); }
              else if (t === 'reports') setSection('reports');
              else if (t === 'approvals') setSection('approvals');
              else setSection('loans');
            }}
          />
        ) : canCompliance ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-[#6C3CF0]" /><SectionHeading>Statutory Compliance</SectionHeading></div>
            <ComplianceDashboardTab onGoto={(t: ComplianceTabId) => goTo(t === 'reports' ? 'reports' : 'compliance')} />
          </div>
        ) : null
      )}

      {/* ── Employee Loans (list ↔ new) ──────────────────────────────────────── */}
      {section === 'loans' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Segmented value={loanView} onChange={(v) => setLoanView(v as any)}
              options={[{ value: 'list', label: 'All Loans' }, ...(canEdit ? [{ value: 'new', label: 'New Loan' }] : [])]} />
          </div>
          {loanView === 'new'
            ? <NewLoanTab canEdit={canEdit} companyId={activeCompanyId} onDone={() => setLoanView('list')} onManageTypes={() => setSection('settings')} />
            : <LoansTab canEdit={canEdit} canApprove={canApprove} canManage={canManage} onOpen={(id) => setDetailId(id)} />}
        </div>
      )}

      {/* ── Salary Advances (dedicated advance workspace) ────────────────────── */}
      {section === 'advances' && (
        <div className="space-y-3">
          <Note>
            Salary advances are short-term amounts recovered automatically from payroll. Click
            <b className="mx-1">New Salary Advance</b>, choose one-time or EMI recovery, and on approval the
            recovery schedule is generated and deducted during payroll — reflected on the payslip and in the
            employee's financial history.
          </Note>
          <SalaryAdvancesSection canEdit={canEdit} canApprove={canApprove} canManage={canManage}
            companyId={activeCompanyId} onOpen={(id) => setDetailId(id)} openToken={advNewToken} />
        </div>
      )}

      {/* ── Compliance (calendar ↔ filings) ──────────────────────────────────── */}
      {section === 'compliance' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Segmented value={complianceView} onChange={(v) => setComplianceView(v as any)}
              options={[{ value: 'filings', label: 'Filings' }, { value: 'calendar', label: 'Calendar' }]} />
          </div>
          {complianceView === 'calendar' ? <ComplianceCalendarTab /> : <ComplianceFilingsTab canEdit={canEdit} canManage={canManage} />}
        </div>
      )}

      {/* ── Deductions (statutory, payroll-derived) ──────────────────────────── */}
      {section === 'deductions' && (
        <div className="space-y-3">
          <Note>
            Statutory deductions (PF, ESI, PT, LWF, TDS) are computed automatically during <b>Payroll</b> and reflected on
            employee payslips. The summary below rolls those obligations up by category from the compliance calendar —
            detailed challans, ECR &amp; Form&nbsp;16 live in the <b>Reports</b> module.
          </Note>
          <ComplianceReportsTab company={activeCompany} />
        </div>
      )}

      {/* ── Approvals (loans pending approval) ───────────────────────────────── */}
      {section === 'approvals' && (
        <div className="space-y-3">
          <Note>
            Loan &amp; advance requests awaiting a decision. Approving a request generates its EMI schedule and enables
            automatic payroll deduction. Approve / reject actions require Company Head or Finance rights.
          </Note>
          <LoansTab canEdit={canEdit} canApprove={canApprove} canManage={canManage} onOpen={(id) => setDetailId(id)}
            initialStatus="Pending Approval" emptyLabel="No requests awaiting approval." />
        </div>
      )}

      {/* ── Reports (loan ↔ compliance) ──────────────────────────────────────── */}
      {section === 'reports' && (
        <div className="space-y-3">
          <Segmented value={reportsView} onChange={(v) => setReportsView(v as any)}
            options={[
              ...(canLoans ? [{ value: 'loans', label: 'Loan Reports' }] : []),
              ...(canCompliance ? [{ value: 'compliance', label: 'Compliance Reports' }] : []),
            ]} />
          {reportsView === 'loans' && canLoans
            ? <LoanReportsTab company={activeCompany} />
            : <ComplianceReportsTab company={activeCompany} />}
        </div>
      )}

      {/* ── Settings (loan types + compliance calendar) ──────────────────────── */}
      {section === 'settings' && (
        <div className="space-y-5">
          {canLoans && (
            <div className="space-y-2">
              <SectionHeading>Loan Types</SectionHeading>
              <p className="text-[11px] text-slate-400">Define the loan &amp; advance products employees can request, with default interest and limits.</p>
              <LoanTypesTab canEdit={canEdit} canManage={canManage} />
            </div>
          )}
          {canCompliance && (
            <Card className="space-y-3">
              <SectionHeading>Compliance Calendar</SectionHeading>
              <p className="text-[11px] text-slate-400">Regenerate statutory obligations (PF / ESI / PT / TDS / GST / LWF) and refresh due dates &amp; payroll-derived amounts.</p>
              <div className="flex flex-wrap gap-2">
                {canEdit && <Button size="sm" variant="outline" icon={<Bell size={14} />} onClick={refreshCalendar}>Refresh Calendar</Button>}
                {canEdit && <Button size="sm" variant="outline" icon={<Bell size={14} />} onClick={sendComplianceReminders}>Send Filing Reminders</Button>}
              </div>
            </Card>
          )}
        </div>
      )}

      {detailId != null && <LoanDetailModal id={detailId} onClose={() => setDetailId(null)} canEdit={canEdit} canManage={canManage} />}
    </div>
  );
};

export default FinanceCompliance;
