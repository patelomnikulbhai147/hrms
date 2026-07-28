import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Building2, CheckCircle2, AlertTriangle, Ticket,
  PlusCircle, MinusCircle, RotateCcw, FileText, Download, Search,
  RefreshCw, Activity, BarChart3
} from 'lucide-react';
import { api } from '@/api/apiClient';
import { ui } from '@/components/ui/feedback';
// The shared HRMS pagination control — the same bar the Employee list, Reports
// and Companies tables use. Driven here by the server's {page, pageSize, total,
// totalPages} response rather than by slicing an in-memory array.
import { PaginationBar } from '@/components/ui/Paginated';
// Verification credits are a QUOTA of API requests, never money — all wording
// for them lives in one place so no screen can drift back into currency.
import {
  CREDIT_TOOLTIP, creditValue, allocationHelper, ledgerTypeLabel,
} from '@/components/verification/creditTerminology';

/**
 * The three credit actions this screen offers, expressed in the verbs the
 * EXISTING wallet API already accepts (verificationCreditService.allocateCredits).
 * Nothing new is introduced server-side:
 *   ADD    → credits + n, allocated + n      (ledger: Addition)
 *   DEDUCT → credits − n, floored at 0       (ledger: Deduction)
 *   RESET  → credits/allocated = n, used = 0 (ledger: Reset)
 */
type CreditAction = 'ADD' | 'DEDUCT' | 'RESET';

const ACTION_LABEL: Record<CreditAction, string> = {
  ADD: 'Add Verification Credits',
  DEDUCT: 'Remove Verification Credits',
  RESET: 'Reset Verification Credits',
};

/** Rows per page for the two append-only log tables, and the choices offered. */
const DEFAULT_LOG_PAGE_SIZE = 20;
const LOG_PAGE_SIZE_OPTIONS = [20, 50, 100];

interface DashboardMetrics {
  totalCompanies: number;
  companiesUsingApi: number;
  companiesUsingManual: number;
  totalCreditsSold: number;
  creditsRemaining: number;
  creditsUsedToday: number;
  revenue: number;
  apiSuccessRate: number;
}

interface CompanyCreditRow {
  companyId: number;
  companyName: string;
  companyCode?: string;
  gstNumber?: string;
  registrationNumber?: string;
  plan: string;
  provider: string;
  verificationMode: string;
  allocatedCredits: number;
  usedCredits: number;
  /** 1 credit = 1 successful verification, so this is also the verifications left. */
  remainingCredits: number;
  expiryDate?: string;
  status: 'Active' | 'Suspended' | 'Exhausted';
}

interface LedgerTransaction {
  id: number;
  transactionId: string;
  companyId: number;
  companyName?: string;
  companyPlan?: string;
  employeeId?: number;
  serviceType: string;
  transactionType: string;
  credits: number;
  openingBalance: number;
  closingBalance: number;
  provider: string;
  referenceId?: string;
  remarks?: string;
  createdBy?: string;
  verifiedBy?: string;
  createdAt: string;
}

interface AuditLog {
  id: number;
  companyId: number;
  companyName?: string;
  provider: string;
  verificationMode: string;
  ifsc?: string;
  accountNumberMasked?: string;
  employeeName?: string;
  referenceId?: string;
  requestTime: string;
  responseTimeMs?: number;
  status: string;
  errorMessage?: string;
}

interface ReportRow {
  companyId?: number;
  companyName?: string;
  employeeName?: string;
  plan?: string;
  /** Ledger activity inside the selected timeframe. */
  allocatedCredits?: number;
  creditsRemoved?: number;
  creditsConsumed: number;
  /** LIVE lifetime figure, not timeframe activity. */
  creditsRemaining?: number;
  verificationsTotal?: number;
  verificationsSuccess?: number;
  verificationsFailed?: number;
  successRate?: number;
  verifications?: number;
  /**
   * The API still returns an estimated `revenue` figure (credits × a fixed
   * multiplier). It is deliberately NOT rendered: verification credits are a
   * quota, not money, so no monetary column appears in this report.
   */
}

export const SuperAdminVerificationCredits: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'companies' | 'ledger' | 'audits' | 'reports'>('companies');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [companies, setCompanies] = useState<CompanyCreditRow[]>([]);
  const [ledger, setLedger] = useState<LedgerTransaction[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // ── Server-side pagination state ───────────────────────────────────────────
  // Both the Credit Ledger and the Verification Audit Logs are append-only tables
  // that grow forever, so neither is ever fetched whole: the server returns one
  // page and the row count, and these figures drive the shared PaginationBar.
  // Page size lives in component state, which is exactly "remember it while the
  // user stays on the page".
  const [ledgerPage, setLedgerPage] = useState<number>(1);
  const [ledgerPageSize, setLedgerPageSize] = useState<number>(DEFAULT_LOG_PAGE_SIZE);
  const [ledgerTotal, setLedgerTotal] = useState<number>(0);
  const [ledgerTotalPages, setLedgerTotalPages] = useState<number>(1);
  const [ledgerLoading, setLedgerLoading] = useState<boolean>(true);

  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditPageSize, setAuditPageSize] = useState<number>(DEFAULT_LOG_PAGE_SIZE);
  const [auditTotal, setAuditTotal] = useState<number>(0);
  const [auditTotalPages, setAuditTotalPages] = useState<number>(1);
  const [auditLoading, setAuditLoading] = useState<boolean>(true);

  // Allocation Modal State
  const [showAllocateModal, setShowAllocateModal] = useState<boolean>(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyCreditRow | null>(null);
  // Three actions, mapped onto the EXISTING wallet API verbs. `ALLOCATE` and
  // `ADD` were two names for one behaviour (same balance maths, different ledger
  // label), so the UI now offers a single Add.
  const [allocAction, setAllocAction] = useState<CreditAction>('ADD');
  const [allocCredits, setAllocCredits] = useState<number>(100);
  const [allocExpiry, setAllocExpiry] = useState<string>('');
  const [allocRemarks, setAllocRemarks] = useState<string>('');
  const [allocSubmitting, setAllocSubmitting] = useState<boolean>(false);
  const [allocError, setAllocError] = useState<string>('');
  const [companySearchQuery, setCompanySearchQuery] = useState<string>('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState<boolean>(false);
  const [includeInactiveCompanies, setIncludeInactiveCompanies] = useState<boolean>(false);
  const [fetchingCompanyBalance, setFetchingCompanyBalance] = useState<boolean>(false);

  // Report Filter State
  const [reportTimeframe, setReportTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [reportGroupBy, setReportGroupBy] = useState<'company' | 'employee'>('company');

  // Each table owns its own fetch so that paging one of them cannot re-issue the
  // other four requests — and so a new transaction can refresh just the ledger.

  const fetchCore = async () => {
    setLoading(true);
    try {
      const [dashRes, compRes] = await Promise.allSettled([
        api.get('/super-admin/verification-credits/dashboard'),
        api.get('/super-admin/verification-credits/companies'),
      ]);
      if (dashRes.status === 'fulfilled') setMetrics(dashRes.value.data);
      if (compRes.status === 'fulfilled') setCompanies(compRes.value.data);
    } catch (err) {
      console.error('Failed to load Super Admin verification credit data:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * One page of the Credit Ledger. `page`/`pageSize` are sent to the server,
   * which returns only those rows plus the total — nothing is sliced here.
   */
  const fetchLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const res: any = await api.get('/super-admin/verification-credits/transactions', {
        params: { page: ledgerPage, pageSize: ledgerPageSize },
      });
      const data = res?.data || {};
      setLedger(data.transactions || []);
      setLedgerTotal(data.totalRecords ?? data.total ?? 0);
      setLedgerTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('Failed to load the credit ledger page:', err);
    } finally {
      setLedgerLoading(false);
    }
  }, [ledgerPage, ledgerPageSize]);

  /** One page of the Verification Audit Logs, on the same contract. */
  const fetchAudits = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res: any = await api.get('/super-admin/verification-credits/audit-logs', {
        params: { page: auditPage, pageSize: auditPageSize },
      });
      const data = res?.data;
      // This endpoint used to answer with a bare array. During a rolling deploy
      // the frontend can briefly meet the older backend, so both shapes are read
      // — an array is treated as a single complete page rather than as no data.
      if (Array.isArray(data)) {
        setAudits(data);
        setAuditTotal(data.length);
        setAuditTotalPages(1);
      } else {
        setAudits(data?.records || []);
        setAuditTotal(data?.totalRecords ?? data?.total ?? 0);
        setAuditTotalPages(data?.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load the verification audit log page:', err);
    } finally {
      setAuditLoading(false);
    }
  }, [auditPage, auditPageSize]);

  const fetchReports = useCallback(async () => {
    try {
      const res: any = await api.get('/super-admin/verification-credits/reports', {
        params: { timeframe: reportTimeframe, groupBy: reportGroupBy },
      });
      setReports(res?.data || []);
    } catch (err) {
      console.error('Failed to load usage reports:', err);
    }
  }, [reportTimeframe, reportGroupBy]);

  /** Refresh button — every table at once. Paging never calls this. */
  const fetchData = async () => {
    await Promise.allSettled([fetchCore(), fetchLedger(), fetchAudits(), fetchReports()]);
  };

  useEffect(() => { fetchCore(); }, []);
  useEffect(() => { fetchLedger(); }, [fetchLedger]);
  useEffect(() => { fetchAudits(); }, [fetchAudits]);
  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleOpenAllocate = (company: CompanyCreditRow | null, action: CreditAction = 'ADD') => {
    setSelectedCompany(company);
    setAllocAction(action);
    // Reset zeroes the wallet (balance, allocated and used) — there is no amount
    // to choose, which is why its dialog asks only for confirmation.
    setAllocCredits(action === 'RESET' ? 0 : 50);
    setAllocRemarks(`Super Admin ${ACTION_LABEL[action].toLowerCase()} via Credit Management Portal`);
    setAllocError('');
    setCompanySearchQuery('');
    setShowCompanyDropdown(!company);
    setShowAllocateModal(true);
  };

  const handleSelectCompany = async (comp: CompanyCreditRow) => {
    setSelectedCompany(comp);
    setCompanySearchQuery('');
    setShowCompanyDropdown(false);
    setAllocError('');
    setFetchingCompanyBalance(true);

    try {
      const res = await api.get(`/super-admin/verification-credits/companies/${comp.companyId}`);
      setSelectedCompany(res.data);
    } catch (err) {
      console.error('Failed to fetch live company credit details:', err);
    } finally {
      setFetchingCompanyBalance(false);
    }
  };

  const handleSubmitAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !selectedCompany.companyId || selectedCompany.companyName === 'Select Company') {
      setAllocError('Please select a company.');
      return;
    }
    if (allocCredits < 0 || isNaN(allocCredits)) {
      setAllocError('Please enter a valid number of verification credits.');
      return;
    }
    if (allocAction !== 'RESET' && allocCredits === 0) {
      setAllocError('Enter a number of verification credits greater than zero.');
      return;
    }
    // A credit balance can never go negative. The server already floors a
    // deduction at zero; refusing here means the Super Admin is told what will
    // happen instead of silently removing less than they asked for.
    if (allocAction === 'DEDUCT' && allocCredits > (selectedCompany.remainingCredits || 0)) {
      setAllocError(`Cannot remove ${allocCredits.toLocaleString()} verification credits — only ${(selectedCompany.remainingCredits || 0).toLocaleString()} remain.`);
      return;
    }
    if (allocAction === 'DEDUCT' && !String(allocRemarks || '').trim()) {
      setAllocError('A reason is required when removing verification credits.');
      return;
    }
    setAllocSubmitting(true);
    setAllocError('');

    try {
      await api.post('/super-admin/verification-credits/allocate', {
        companyId: selectedCompany.companyId,
        action: allocAction,
        credits: allocCredits,
        expiryDate: allocExpiry || null,
        remarks: allocRemarks,
        provider: selectedCompany.provider
      });

      // Refreshes every open company wallet (employee form, dashboard card) in
      // this tab and in any other tab, then this dashboard's own figures.
      window.dispatchEvent(new CustomEvent('hrms:wallet-updated'));
      localStorage.setItem('hrms_wallet_updated', Date.now().toString());

      setShowAllocateModal(false);
      // Refresh only what this action changed: the wallet balances (dashboard +
      // Companies tab) and the ledger, which just gained a row. The audit log and
      // the usage reports are untouched by a credit adjustment, so they are not
      // re-fetched. The ledger returns to page 1 because the new entry sorts
      // newest-first; if it is already on page 1 the effect would not re-run, so
      // it is fetched directly — either way exactly one request is issued.
      await fetchCore();
      if (ledgerPage === 1) await fetchLedger();
      else setLedgerPage(1);

      const name = selectedCompany.companyName;
      ui.toast.success(
        allocAction === 'ADD'
          ? `${allocCredits.toLocaleString()} verification credits added to ${name}.`
          : allocAction === 'DEDUCT'
          ? `${allocCredits.toLocaleString()} verification credits removed from ${name}.`
          : `Verification credits reset for ${name}.`
      );
    } catch (err: any) {
      setAllocError(err.message || 'Could not save the verification credit change.');
    } finally {
      setAllocSubmitting(false);
    }
  };

  const handleToggleStatus = async (companyId: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'Suspended' ? 'Active' : 'Suspended';
    if (!window.confirm(`Are you sure you want to change this company's verification API status to ${nextStatus}?`)) return;

    try {
      await api.put('/super-admin/verification-credits/company-status', { companyId, status: nextStatus });
      window.dispatchEvent(new CustomEvent('hrms:wallet-updated'));
      localStorage.setItem('hrms_wallet_updated', Date.now().toString());
      // Suspend/Resume changes wallet status only — no ledger or audit row.
      fetchCore();
    } catch (err) {
      console.error('Status toggle error:', err);
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await api.get('/super-admin/verification-credits/export', {
        params: { format: 'csv', timeframe: reportTimeframe, groupBy: reportGroupBy }
      });
      // api.get returns parsed JSON; for CSV export, construct blob from the data
      const blob = new Blob([JSON.stringify(res.data)], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = `verification_credits_${reportGroupBy}_${reportTimeframe}_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const filteredCompanies = companies.filter(c => 
    c.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.provider.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredModalCompanies = companies.filter((comp) => {
    if (!includeInactiveCompanies && comp.status === 'Suspended') return false;
    if (!companySearchQuery.trim()) return true;
    const q = companySearchQuery.toLowerCase();
    return (
      comp.companyName.toLowerCase().includes(q) ||
      comp.companyId.toString().includes(q) ||
      (comp.companyCode && comp.companyCode.toLowerCase().includes(q)) ||
      (comp.gstNumber && comp.gstNumber.toLowerCase().includes(q)) ||
      (comp.registrationNumber && comp.registrationNumber.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-[rgba(199,126,82,0.02)] via-[rgba(199,126,82,0.05)] to-[rgba(199,126,82,0.01)] p-6 rounded-2xl shadow-md border border-[#E0996A] hover:shadow-lg transition-all">
        <div className="flex items-center space-x-4">
          <div className="p-3.5 bg-gradient-to-br from-[#C77E52] to-[#C77E52] text-white rounded-2xl shadow-md border border-[#E0996A]/30 flex-shrink-0">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2.5" style={{ color: '#1E293B' }}>
              <span>Bank Verification Credit Management</span>
              <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-[#C77E52] text-white shadow-sm">Super Admin</span>
            </h1>
            <p className="text-sm mt-1 font-semibold" style={{ color: '#C77E52' }} title={CREDIT_TOOLTIP}>
              One credit = one successful verification · per-company quotas, credit ledger and API usage
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={fetchData} 
            className="flex items-center space-x-2 px-4 py-2 bg-white hover:bg-[rgba(199,126,82,0.05)] rounded-xl text-sm font-bold transition border border-[#E0996A] shadow-sm hover:border-[#C77E52]"
            style={{ color: '#C77E52' }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button 
            onClick={() => handleOpenAllocate(null, 'ADD')}
            className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-[#C77E52] to-[#E0996A] hover:from-[#E0996A] hover:to-[#C77E52] text-white rounded-xl text-sm font-bold transition shadow-[0_4px_12px_rgba(199,126,82,0.25)] hover:shadow-[0_6px_20px_rgba(199,126,82,0.35)] border border-[#C77E52]/30"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Verification Credits</span>
          </button>
        </div>
      </div>

      {/* Dashboard Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Companies</span>
            <Building2 className="w-5 h-5 text-[#C77E52]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{metrics?.totalCompanies || 0}</span>
            <span className="text-xs font-semibold text-[#C77E52] bg-[rgba(199,126,82,0.1)] px-2 py-0.5 rounded-full border border-[#C77E52]/20">
              {metrics?.companiesUsingApi || 0} API / {metrics?.companiesUsingManual || 0} Manual
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition" title={CREDIT_TOOLTIP}>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Credits Remaining</span>
            <Ticket className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{creditValue(metrics?.creditsRemaining)}</span>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              {creditValue(metrics?.totalCreditsSold)} allocated
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition" title={CREDIT_TOOLTIP}>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Credits Used Today</span>
            <Activity className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{creditValue(metrics?.creditsUsedToday)}</span>
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              Live usage
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">API Success Rate</span>
            <CheckCircle2 className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{metrics?.apiSuccessRate || 100}%</span>
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              Verification requests
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-2xl">
        <button
          onClick={() => setActiveTab('companies')}
          className={`flex items-center space-x-2 py-4 px-6 border-b-2 font-semibold text-sm transition ${
            activeTab === 'companies'
              ? 'border-[#C77E52] text-[#C77E52] font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Company Credits ({companies.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center space-x-2 py-4 px-6 border-b-2 font-semibold text-sm transition ${
            activeTab === 'ledger'
              ? 'border-[#C77E52] text-[#C77E52] font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Verification Credit Ledger</span>
        </button>
        <button
          onClick={() => setActiveTab('audits')}
          className={`flex items-center space-x-2 py-4 px-6 border-b-2 font-semibold text-sm transition ${
            activeTab === 'audits'
              ? 'border-[#C77E52] text-[#C77E52] font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Verification Audit Logs</span>
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center space-x-2 py-4 px-6 border-b-2 font-semibold text-sm transition ${
            activeTab === 'reports'
              ? 'border-[#C77E52] text-[#C77E52] font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Verification Usage Reports</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-b-2xl p-6 border border-t-0 border-slate-200 shadow-sm">
        {/* COMPANIES TAB */}
        {activeTab === 'companies' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by company name or provider..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#C77E52] focus:bg-white transition"
                />
              </div>
              <span className="text-xs text-slate-500 font-medium">Showing {filteredCompanies.length} companies</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Plan / Mode</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4 text-right" title={CREDIT_TOOLTIP}>Total Credits Allocated</th>
                    <th className="py-3 px-4 text-right" title={CREDIT_TOOLTIP}>Credits Used</th>
                    <th className="py-3 px-4 text-right" title={CREDIT_TOOLTIP}>Credits Remaining</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {loading ? (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-500">Loading company verification credits…</td></tr>
                  ) : filteredCompanies.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-500">No matching companies found.</td></tr>
                  ) : (
                    filteredCompanies.map((comp) => (
                      <tr key={comp.companyId} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {comp.companyName}
                          <span className="block text-xs font-normal text-slate-400">ID: #{comp.companyId}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[rgba(199,126,82,0.05)] text-[#C77E52] border border-[#C77E52]/20">
                            {comp.plan}
                          </span>
                          <span className="block text-xs font-medium text-slate-500 mt-1">
                            Mode: <span className={comp.verificationMode === 'API' ? 'text-emerald-600 font-semibold' : 'text-slate-600'}>{comp.verificationMode}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">{comp.provider}</td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-700" title={CREDIT_TOOLTIP}>{creditValue(comp.allocatedCredits)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-500" title={CREDIT_TOOLTIP}>{creditValue(comp.usedCredits)}</td>
                        <td className="py-3 px-4 text-right">
                          <span
                            title={CREDIT_TOOLTIP}
                            className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
                              comp.remainingCredits > 50 ? 'bg-emerald-100 text-emerald-800' :
                              comp.remainingCredits > 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {creditValue(comp.remainingCredits)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            comp.status === 'Active' ? 'bg-emerald-100 text-emerald-800' :
                            comp.status === 'Suspended' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {comp.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            {/* Three actions, one purpose each. Every one is
                                Super-Admin-only (this whole page is), disabled
                                while a request is in flight. */}
                            <button
                              onClick={() => handleOpenAllocate(comp, 'ADD')}
                              disabled={allocSubmitting}
                              title="Add verification credits for this company"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition text-xs font-semibold border border-emerald-200 disabled:opacity-50 disabled:pointer-events-none"
                            >
                              <PlusCircle className="w-3.5 h-3.5" /> Add
                            </button>
                            <button
                              onClick={() => handleOpenAllocate(comp, 'DEDUCT')}
                              disabled={allocSubmitting}
                              title="Remove verification credits from this company"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition text-xs font-semibold border border-amber-200 disabled:opacity-50 disabled:pointer-events-none"
                            >
                              <MinusCircle className="w-3.5 h-3.5" /> Remove
                            </button>
                            <button
                              onClick={() => handleOpenAllocate(comp, 'RESET')}
                              disabled={allocSubmitting}
                              title="Reset this company's verification credits"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition text-xs font-semibold border border-slate-200 disabled:opacity-50 disabled:pointer-events-none"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Reset
                            </button>
                            <button
                              onClick={() => handleToggleStatus(comp.companyId, comp.status)}
                              title={comp.status === 'Suspended' ? 'Resume API Access' : 'Suspend API Access'}
                              className={`p-1.5 rounded-lg transition text-xs font-semibold ${
                                comp.status === 'Suspended' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                              }`}
                            >
                              {comp.status === 'Suspended' ? 'Resume' : 'Suspend'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CREDIT LEDGER TAB */}
        {activeTab === 'ledger' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Verification Credit Ledger</h3>
              <span className="text-xs text-slate-500 font-medium" title={CREDIT_TOOLTIP}>Immutable record of every verification credit movement</span>
            </div>
            {/* The table scrolls sideways inside its own box; the pagination bar
                sits below it and never moves with that scroll. */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">Transaction ID</th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-right" title={CREDIT_TOOLTIP}>Credits Before</th>
                    <th className="py-3 px-4 text-right" title={CREDIT_TOOLTIP}>Credits Changed</th>
                    <th className="py-3 px-4 text-right" title={CREDIT_TOOLTIP}>Credits After</th>
                    <th className="py-3 px-4">Reference / User</th>
                    <th className="py-3 px-4">Date Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {ledgerLoading ? (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-500">Loading verification credit entries…</td></tr>
                  ) : ledger.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-500">No verification credit movements recorded yet.</td></tr>
                  ) : (
                    ledger.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/80 transition font-mono text-xs">
                        <td className="py-3 px-4 font-bold text-[#C77E52]">{tx.transactionId}</td>
                        <td className="py-3 px-4 font-sans font-semibold text-slate-900">{tx.companyName || `Company #${tx.companyId}`}</td>
                        <td className="py-3 px-4 font-sans">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            tx.transactionType === 'Allocation' ? 'bg-[rgba(199,126,82,0.05)] text-[#C77E52] border border-[#C77E52]/20' :
                            tx.transactionType === 'Addition' ? 'bg-emerald-100 text-emerald-800' :
                            tx.transactionType === 'Deduction' ? 'bg-amber-100 text-amber-800' :
                            tx.transactionType === 'Reset' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {/* The stored transactionType is left untouched — every
                                historical row keeps its original value — and is
                                mapped to credit wording for display only. */}
                            {ledgerTypeLabel(tx.transactionType)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right" title={CREDIT_TOOLTIP}>{creditValue(tx.openingBalance)}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900" title={CREDIT_TOOLTIP}>{creditValue(tx.credits)}</td>
                        <td className="py-3 px-4 text-right font-bold text-[#C77E52]" title={CREDIT_TOOLTIP}>{creditValue(tx.closingBalance)}</td>
                        <td className="py-3 px-4 font-sans text-xs text-slate-600">
                          {tx.remarks || tx.referenceId || tx.verifiedBy || 'System'}
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-500">{new Date(tx.createdAt).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
              <PaginationBar
                page={ledgerPage}
                totalPages={ledgerTotalPages}
                total={ledgerTotal}
                pageSize={ledgerPageSize}
                label="transactions"
                onChange={setLedgerPage}
                onPageSizeChange={(size) => { setLedgerPageSize(size); setLedgerPage(1); }}
                pageSizeOptions={LOG_PAGE_SIZE_OPTIONS}
              />
            </div>
          </div>
        )}

        {/* AUDIT LOGS TAB */}
        {activeTab === 'audits' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Bank Verification Request Audit Logs</h3>
              <span className="text-xs text-slate-500 font-medium">Real-time gateway request monitoring</span>
            </div>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">IFSC / Account</th>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Reference ID</th>
                    <th className="py-3 px-4 text-right">Time (ms)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditLoading ? (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-500">Loading verification audit logs...</td></tr>
                  ) : audits.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-500">No verification audit logs recorded yet.</td></tr>
                  ) : (
                    audits.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition text-xs">
                        <td className="py-3 px-4 font-semibold text-slate-900">{log.companyName || `Company #${log.companyId}`}</td>
                        <td className="py-3 px-4 text-slate-600">{log.provider}</td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-800">
                          {log.ifsc} / {log.accountNumberMasked || '***'}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{log.employeeName || 'N/A'}</td>
                        <td className="py-3 px-4 font-mono text-[#C77E52] font-semibold">{log.referenceId || 'N/A'}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">{log.responseTimeMs ? `${log.responseTimeMs}ms` : '-'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            log.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' :
                            log.status === 'CREDITS_EXHAUSTED' ? 'bg-amber-100 text-amber-800 font-mono' :
                            log.status === 'RATE_LIMITED' ? 'bg-yellow-100 text-yellow-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{new Date(log.requestTime).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
              <PaginationBar
                page={auditPage}
                totalPages={auditTotalPages}
                total={auditTotal}
                pageSize={auditPageSize}
                label="records"
                onChange={setAuditPage}
                onPageSizeChange={(size) => { setAuditPageSize(size); setAuditPage(1); }}
                pageSizeOptions={LOG_PAGE_SIZE_OPTIONS}
              />
            </div>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-600 uppercase">Timeframe:</span>
                  <select
                    value={reportTimeframe}
                    onChange={(e) => setReportTimeframe(e.target.value as any)}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    <option value="daily">Daily (24 Hours)</option>
                    <option value="weekly">Weekly (7 Days)</option>
                    <option value="monthly">Monthly (30 Days)</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-600 uppercase">Group By:</span>
                  <select
                    value={reportGroupBy}
                    onChange={(e) => setReportGroupBy(e.target.value as any)}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    <option value="company">Company Wise</option>
                    <option value="employee">Employee Wise</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleExportCSV}
                className="flex items-center space-x-2 px-4 py-1.5 bg-gradient-to-r from-[#C77E52] to-[#C77E52] hover:from-[#E0996A] hover:to-[#C77E52] text-white rounded-lg text-xs font-semibold transition shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Report (CSV)</span>
              </button>
            </div>

            <p className="text-[11.5px] font-medium text-slate-500 leading-relaxed">
              One verification credit = one successful API verification, so <strong className="text-slate-700">Credits Used</strong> and{' '}
              <strong className="text-slate-700">Successful Verifications</strong> are the same count. Credits Added, Removed and Used
              cover the selected timeframe; <strong className="text-slate-700">Credits Remaining</strong> is the company&rsquo;s live total.
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">{reportGroupBy === 'company' ? 'Company Name' : 'Employee / User'}</th>
                    {reportGroupBy === 'company' && <th className="py-3 px-4">Plan</th>}
                    {reportGroupBy === 'company' && <th className="py-3 px-4 text-right" title={CREDIT_TOOLTIP}>Credits Added</th>}
                    {reportGroupBy === 'company' && <th className="py-3 px-4 text-right" title={CREDIT_TOOLTIP}>Credits Removed</th>}
                    <th className="py-3 px-4 text-right" title={CREDIT_TOOLTIP}>Credits Used</th>
                    {reportGroupBy === 'company' ? (
                      <>
                        <th className="py-3 px-4 text-right" title="Live figure — the company's current verification credits, not activity within the selected timeframe.">Credits Remaining</th>
                        <th className="py-3 px-4 text-right" title="Each successful verification uses exactly 1 credit, so this matches Credits Used.">Successful Verifications</th>
                        <th className="py-3 px-4 text-right">Failed</th>
                        <th className="py-3 px-4 text-right">Success Rate</th>
                      </>
                    ) : (
                      <th className="py-3 px-4 text-right">Total Verifications Executed</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {reports.length === 0 ? (
                    <tr><td colSpan={9} className="py-8 text-center text-slate-500">No verification usage recorded for this timeframe.</td></tr>
                  ) : (
                    reports.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {reportGroupBy === 'company' ? row.companyName : row.employeeName}
                          {reportGroupBy === 'company' && <span className="block text-xs font-normal text-slate-400">ID: #{row.companyId}</span>}
                        </td>
                        {reportGroupBy === 'company' && <td className="py-3 px-4 font-medium text-slate-600">{row.plan}</td>}
                        {reportGroupBy === 'company' && <td className="py-3 px-4 text-right font-semibold text-emerald-700" title={CREDIT_TOOLTIP}>{creditValue(row.allocatedCredits)}</td>}
                        {reportGroupBy === 'company' && <td className="py-3 px-4 text-right font-semibold text-amber-700" title={CREDIT_TOOLTIP}>{creditValue(row.creditsRemoved)}</td>}
                        <td className="py-3 px-4 text-right font-bold text-[#C77E52]" title={CREDIT_TOOLTIP}>{creditValue(row.creditsConsumed)}</td>
                        {reportGroupBy === 'company' ? (
                          <>
                            <td className="py-3 px-4 text-right font-semibold text-slate-700" title={CREDIT_TOOLTIP}>{creditValue(row.creditsRemaining)}</td>
                            <td className="py-3 px-4 text-right font-semibold text-emerald-600">{row.verificationsSuccess?.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right font-semibold text-rose-600">{row.verificationsFailed?.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right font-bold text-slate-900">{row.successRate}%</td>
                          </>
                        ) : (
                          <td className="py-3 px-4 text-right font-semibold text-slate-700">{row.verifications?.toLocaleString()}</td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Allocate Credits Modal Popup */}
      {showAllocateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-[rgba(199,126,82,0.05)] text-[#C77E52] rounded-xl border border-[#C77E52]/20 shadow-sm">
                  <Ticket className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{ACTION_LABEL[allocAction]}</h3>
                  <p className="text-xs text-slate-500">
                    {selectedCompany ? `#${selectedCompany.companyId} · ${selectedCompany.companyName}` : 'Select a company first'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setShowAllocateModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
            </div>

            {allocError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{allocError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitAllocation} className="space-y-4 text-sm">
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Select Company (Enterprise)</label>
                  <label className="flex items-center space-x-1.5 text-xs text-slate-500 cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={includeInactiveCompanies}
                      onChange={(e) => setIncludeInactiveCompanies(e.target.checked)}
                      className="rounded border-slate-300 text-[#C77E52] focus:ring-[#C77E52]"
                    />
                    <span>Include Inactive</span>
                  </label>
                </div>

                <div 
                  onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 flex justify-between items-center cursor-pointer hover:border-[#C77E52] transition shadow-sm"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Building2 className="w-4 h-4 text-[#C77E52] flex-shrink-0" />
                    <span className="truncate">
                      {selectedCompany ? `${selectedCompany.companyName} (${selectedCompany.plan})` : 'Search & Select Company...'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {selectedCompany && (
                      <span className="text-xs text-[#C77E52] font-bold bg-[rgba(199,126,82,0.05)] border border-[#C77E52]/20 px-2.5 py-1 rounded-lg" title={CREDIT_TOOLTIP}>
                        {fetchingCompanyBalance
                          ? 'Loading credits…'
                          : selectedCompany.remainingCredits === 0
                          ? '0 Verification Credits (Exhausted)'
                          : `Available Verification Credits: ${creditValue(selectedCompany.remainingCredits)}`}
                      </span>
                    )}
                    <span className="text-slate-400 text-xs">▼</span>
                  </div>
                </div>

                {showCompanyDropdown && (
                  <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto p-2 space-y-1">
                    <div className="sticky top-0 bg-white pb-2 border-b border-slate-100">
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          placeholder="Search Name, Code, ID, or GST..."
                          value={companySearchQuery}
                          onChange={(e) => setCompanySearchQuery(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#C77E52] focus:bg-white"
                          autoFocus
                        />
                      </div>
                    </div>
                    {filteredModalCompanies.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">No matching companies found.</div>
                    ) : (
                      filteredModalCompanies.map((comp) => (
                        <div
                          key={comp.companyId}
                          onClick={() => handleSelectCompany(comp)}
                          className={`p-2.5 rounded-lg cursor-pointer transition flex items-center justify-between text-xs ${
                            selectedCompany?.companyId === comp.companyId
                              ? 'bg-[rgba(199,126,82,0.05)] text-[#C77E52] font-bold border border-[#C77E52]/20'
                              : 'hover:bg-slate-50 text-slate-700 font-medium'
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-slate-900">{comp.companyName}</div>
                            <div className="text-[10px] text-slate-400">ID: #{comp.companyId} {comp.companyCode ? `• Code: ${comp.companyCode}` : ''} {comp.gstNumber ? `• GST: ${comp.gstNumber}` : ''}</div>
                          </div>
                          <div className="text-right">
                            <span className="block font-bold text-[#C77E52]" title={CREDIT_TOOLTIP}>{creditValue(comp.remainingCredits)} Credits</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded ${comp.status === 'Active' ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>{comp.status}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {selectedCompany && (
                <div className="p-3.5 bg-[rgba(199,126,82,0.05)]/60 border border-[#C77E52]/20 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-800 border-b border-[#C77E52]/15 pb-1.5">
                    <span>{selectedCompany.companyName} (ID: #{selectedCompany.companyId})</span>
                    <span className="text-[#C77E52]">{selectedCompany.verificationMode} Mode ({selectedCompany.status})</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-0.5" title={CREDIT_TOOLTIP}>
                    <div className="bg-white p-1.5 rounded-lg border border-[#C77E52]/10 shadow-sm">
                      <span className="block text-[10px] text-slate-400 uppercase">Total Credits Allocated</span>
                      <span className="font-bold text-slate-700">{creditValue(selectedCompany.allocatedCredits)}</span>
                    </div>
                    <div className="bg-white p-1.5 rounded-lg border border-[#C77E52]/10 shadow-sm">
                      <span className="block text-[10px] text-slate-400 uppercase">Credits Used</span>
                      <span className="font-bold text-slate-500">{creditValue(selectedCompany.usedCredits)}</span>
                    </div>
                    <div className="bg-white p-1.5 rounded-lg border border-[#C77E52]/20 shadow-sm bg-gradient-to-br from-white to-[rgba(199,126,82,0.05)]">
                      <span className="block text-[10px] text-[#C77E52] font-bold uppercase">Credits Remaining</span>
                      <span className="font-extrabold text-[#C77E52]">{creditValue(selectedCompany.remainingCredits)}</span>
                    </div>
                  </div>
                  <p className="text-[10.5px] font-medium text-slate-500 leading-relaxed pt-0.5">
                    One verification credit = one successful API verification. This company can
                    perform <strong className="text-slate-700">{creditValue(selectedCompany.remainingCredits)}</strong>{' '}
                    more verification{selectedCompany.remainingCredits === 1 ? '' : 's'}.
                  </p>
                </div>
              )}

              {/* RESET asks for confirmation only — there is no amount to pick,
                  because the wallet returns to zero on every counter. */}
              {allocAction === 'RESET' ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-900 leading-relaxed">
                    <p className="font-bold">
                      You are about to reset this company's verification credits. This action should only be used by Super Admin.
                    </p>
                    <p className="mt-1.5 font-medium text-rose-800">
                      Credits remaining, total credits allocated and credits used all return to zero, and a Verification Credits Reset entry is written to the ledger. Verification stays blocked until credits are added again.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="verification-credit-amount"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1"
                      title={CREDIT_TOOLTIP}
                    >
                      {allocAction === 'ADD' ? 'Verification Credits to Add' : 'Verification Credits to Remove'}
                    </label>
                    <div className="relative">
                      <input
                        id="verification-credit-amount"
                        type="number"
                        min="1"
                        max={allocAction === 'DEDUCT' ? (selectedCompany?.remainingCredits ?? undefined) : undefined}
                        required
                        placeholder="Enter number of verification credits"
                        title={CREDIT_TOOLTIP}
                        aria-describedby="verification-credit-help"
                        value={allocCredits}
                        onChange={(e) => setAllocCredits(parseInt(e.target.value, 10) || 0)}
                        className="w-full p-2.5 pr-[7.5rem] bg-white border border-slate-300 rounded-xl font-bold text-[#C77E52] focus:ring-2 focus:ring-[#C77E52]"
                      />
                      {/* The unit sits inside the field so the number can never be
                          read as an amount of money. */}
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        Verification Credits
                      </span>
                    </div>

                    {/* Spells out, in the tenant's own configured cost, exactly what
                        the number just typed buys. */}
                    <p id="verification-credit-help" className="text-[11px] font-medium text-slate-500 mt-1.5 leading-relaxed">
                      {allocAction === 'ADD'
                        ? allocationHelper(allocCredits)
                        : `Removes ${creditValue(allocCredits)} verification ${allocCredits === 1 ? 'credit' : 'credits'}, and therefore ${creditValue(allocCredits)} verification ${allocCredits === 1 ? 'request' : 'requests'}, from this company. ${creditValue(selectedCompany?.remainingCredits)} are currently available, and the total can never fall below zero.`}
                    </p>
                  </div>

                  {allocAction === 'ADD' && (
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Expiry Date (Optional)</label>
                      <input
                        type="date"
                        value={allocExpiry}
                        onChange={(e) => setAllocExpiry(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-[#C77E52]"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                      {allocAction === 'ADD' ? 'Remarks (Optional)' : 'Reason'}
                    </label>
                    <textarea
                      rows={2}
                      required={allocAction === 'DEDUCT'}
                      value={allocRemarks}
                      onChange={(e) => setAllocRemarks(e.target.value)}
                      placeholder={allocAction === 'ADD' ? 'Why these verification credits are being added…' : 'Why these verification credits are being removed…'}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-normal text-slate-700 focus:ring-2 focus:ring-[#C77E52]"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAllocateModal(false)}
                  disabled={allocSubmitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={allocSubmitting}
                  className={`px-5 py-2 text-white rounded-xl font-semibold text-xs transition shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5 ${
                    allocAction === 'RESET'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : allocAction === 'DEDUCT'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-gradient-to-r from-[#C77E52] to-[#E0996A] hover:from-[#E0996A] hover:to-[#C77E52] border border-[#C77E52]/30'
                  }`}
                >
                  {allocSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {allocSubmitting ? 'Processing…' : ACTION_LABEL[allocAction]}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminVerificationCredits;
