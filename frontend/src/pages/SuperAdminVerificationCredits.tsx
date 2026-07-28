import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, CreditCard, Building2, Users, CheckCircle2, XCircle, AlertTriangle, 
  PlusCircle, MinusCircle, RotateCcw, Ban, Play, FileText, Download, Search, 
  Filter, RefreshCw, ArrowUpRight, DollarSign, Activity, Calendar, Clock, ChevronRight, BarChart3 
} from 'lucide-react';
import { api } from '@/api/apiClient';

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
  remainingCredits: number;
  expiryDate?: string;
  status: 'Active' | 'Suspended' | 'Exhausted';
  costPerVerification: number;
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
  allocatedCredits?: number;
  creditsConsumed: number;
  verificationsTotal?: number;
  verificationsSuccess?: number;
  verificationsFailed?: number;
  successRate?: number;
  revenue?: number;
  verifications?: number;
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

  // Allocation Modal State
  const [showAllocateModal, setShowAllocateModal] = useState<boolean>(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyCreditRow | null>(null);
  const [allocAction, setAllocAction] = useState<'ALLOCATE' | 'ADD' | 'DEDUCT' | 'RESET'>('ALLOCATE');
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dashRes, compRes, ledgRes, auditRes, repRes] = await Promise.allSettled([
        api.get('/super-admin/verification-credits/dashboard'),
        api.get('/super-admin/verification-credits/companies'),
        api.get('/super-admin/verification-credits/transactions', { params: { limit: 50 } }),
        api.get('/super-admin/verification-credits/audit-logs', { params: { limit: 50 } }),
        api.get('/super-admin/verification-credits/reports', { params: { timeframe: reportTimeframe, groupBy: reportGroupBy } })
      ]);

      if (dashRes.status === 'fulfilled') setMetrics(dashRes.value.data);
      if (compRes.status === 'fulfilled') setCompanies(compRes.value.data);
      if (ledgRes.status === 'fulfilled') {
        const ledgData = ledgRes.value.data;
        setLedger(ledgData.transactions || ledgData || []);
      }
      if (auditRes.status === 'fulfilled') setAudits(auditRes.value.data);
      if (repRes.status === 'fulfilled') setReports(repRes.value.data);
    } catch (err) {
      console.error('Failed to load Super Admin verification credit data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [reportTimeframe, reportGroupBy]);

  const handleOpenAllocate = (company: CompanyCreditRow | null, action: 'ALLOCATE' | 'ADD' | 'DEDUCT' | 'RESET' = 'ALLOCATE') => {
    setSelectedCompany(company);
    setAllocAction(action);
    setAllocCredits(action === 'RESET' ? 100 : 50);
    setAllocRemarks(`Super Admin ${action.toLowerCase()} via Credit Management Portal`);
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
      setAllocError('Please enter valid credits.');
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

      window.dispatchEvent(new CustomEvent('hrms:wallet-updated'));
      localStorage.setItem('hrms_wallet_updated', Date.now().toString());

      setShowAllocateModal(false);
      fetchData();
    } catch (err: any) {
      setAllocError(err.message || 'Error saving credit allocation');
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
      fetchData();
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
            <p className="text-sm mt-1 font-semibold" style={{ color: '#C77E52' }}>
              Multi-tenant credit wallet administration, transaction ledger, and automated API billing
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
            onClick={() => handleOpenAllocate(null, 'ALLOCATE')}
            className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-[#C77E52] to-[#E0996A] hover:from-[#E0996A] hover:to-[#C77E52] text-white rounded-xl text-sm font-bold transition shadow-[0_4px_12px_rgba(199,126,82,0.25)] hover:shadow-[0_6px_20px_rgba(199,126,82,0.35)] border border-[#C77E52]/30"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Allocate Credits</span>
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

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Credits Remaining</span>
            <CreditCard className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{metrics?.creditsRemaining?.toLocaleString() || 0}</span>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              {metrics?.totalCreditsSold?.toLocaleString() || 0} Sold
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Credits Used Today</span>
            <Activity className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{metrics?.creditsUsedToday?.toLocaleString() || 0}</span>
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              Real-time Billing
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
              ₹{(metrics?.revenue || 0).toLocaleString()} Est. Rev
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
          <span>Company Wallets ({companies.length})</span>
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
          <span>Credit Ledger</span>
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
          <span>Usage Reports & Revenue</span>
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
                    <th className="py-3 px-4 text-right">Allocated</th>
                    <th className="py-3 px-4 text-right">Used</th>
                    <th className="py-3 px-4 text-right">Remaining</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {loading ? (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-500">Loading company credit balances...</td></tr>
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
                        <td className="py-3 px-4 text-right font-semibold text-slate-700">{comp.allocatedCredits.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-500">{comp.usedCredits.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
                            comp.remainingCredits > 50 ? 'bg-emerald-100 text-emerald-800' :
                            comp.remainingCredits > 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {comp.remainingCredits.toLocaleString()}
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
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              onClick={() => handleOpenAllocate(comp, 'ALLOCATE')}
                              title="Allocate Credits"
                              className="p-1.5 bg-[rgba(199,126,82,0.05)] hover:bg-[rgba(199,126,82,0.15)] text-[#C77E52] rounded-lg transition text-xs font-semibold border border-[#C77E52]/20"
                            >
                              +Alloc
                            </button>
                            <button
                              onClick={() => handleOpenAllocate(comp, 'ADD')}
                              title="Add Credits"
                              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition text-xs font-semibold"
                            >
                              +Add
                            </button>
                            <button
                              onClick={() => handleOpenAllocate(comp, 'DEDUCT')}
                              title="Deduct Credits"
                              className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg transition text-xs font-semibold"
                            >
                              -Ded
                            </button>
                            <button
                              onClick={() => handleOpenAllocate(comp, 'RESET')}
                              title="Reset Balance"
                              className="p-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg transition text-xs font-semibold"
                            >
                              Reset
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
              <h3 className="text-lg font-bold text-slate-900">Global Credit Transaction Ledger</h3>
              <span className="text-xs text-slate-500 font-medium">Immutable audit trail of all token transactions</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">Transaction ID</th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-right">Opening</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-right">Closing</th>
                    <th className="py-3 px-4">Reference / User</th>
                    <th className="py-3 px-4">Date Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {ledger.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-500">No transactions recorded in the ledger yet.</td></tr>
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
                            {tx.transactionType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">{tx.openingBalance}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{tx.credits}</td>
                        <td className="py-3 px-4 text-right font-bold text-[#C77E52]">{tx.closingBalance}</td>
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
          </div>
        )}

        {/* AUDIT LOGS TAB */}
        {activeTab === 'audits' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Bank Verification Request Audit Logs</h3>
              <span className="text-xs text-slate-500 font-medium">Real-time gateway request monitoring</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                  {audits.length === 0 ? (
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

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">{reportGroupBy === 'company' ? 'Company Name' : 'Employee / User'}</th>
                    {reportGroupBy === 'company' && <th className="py-3 px-4">Plan</th>}
                    {reportGroupBy === 'company' && <th className="py-3 px-4 text-right">Allocated</th>}
                    <th className="py-3 px-4 text-right">Credits Consumed</th>
                    {reportGroupBy === 'company' ? (
                      <>
                        <th className="py-3 px-4 text-right">Total Verifications</th>
                        <th className="py-3 px-4 text-right">Success</th>
                        <th className="py-3 px-4 text-right">Failed</th>
                        <th className="py-3 px-4 text-right">Success Rate</th>
                        <th className="py-3 px-4 text-right">Est. Revenue</th>
                      </>
                    ) : (
                      <th className="py-3 px-4 text-right">Total Verifications Executed</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {reports.length === 0 ? (
                    <tr><td colSpan={9} className="py-8 text-center text-slate-500">No usage report data generated for this timeframe.</td></tr>
                  ) : (
                    reports.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {reportGroupBy === 'company' ? row.companyName : row.employeeName}
                          {reportGroupBy === 'company' && <span className="block text-xs font-normal text-slate-400">ID: #{row.companyId}</span>}
                        </td>
                        {reportGroupBy === 'company' && <td className="py-3 px-4 font-medium text-slate-600">{row.plan}</td>}
                        {reportGroupBy === 'company' && <td className="py-3 px-4 text-right font-semibold text-slate-700">{row.allocatedCredits?.toLocaleString()}</td>}
                        <td className="py-3 px-4 text-right font-bold text-[#C77E52]">{row.creditsConsumed.toLocaleString()}</td>
                        {reportGroupBy === 'company' ? (
                          <>
                            <td className="py-3 px-4 text-right font-semibold text-slate-700">{row.verificationsTotal?.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right font-semibold text-emerald-600">{row.verificationsSuccess?.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right font-semibold text-rose-600">{row.verificationsFailed?.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right font-bold text-slate-900">{row.successRate}%</td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-700">₹{row.revenue?.toLocaleString()}</td>
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
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Manage Verification Credits</h3>
                  <p className="text-xs text-slate-500">
                    {selectedCompany ? `Atomic balance adjustment for #${selectedCompany.companyId}: ${selectedCompany.companyName}` : 'Select a company to allocate or adjust verification credits'}
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
                      <span className="text-xs text-[#C77E52] font-bold bg-[rgba(199,126,82,0.05)] border border-[#C77E52]/20 px-2.5 py-1 rounded-lg">
                        {fetchingCompanyBalance ? 'Loading bal...' : selectedCompany.remainingCredits === 0 ? '0 Credits (Exhausted)' : `Current Balance: ${selectedCompany.remainingCredits.toLocaleString()} Credits`}
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
                            <span className="block font-bold text-[#C77E52]">{comp.remainingCredits.toLocaleString()} Credits</span>
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
                  <div className="grid grid-cols-3 gap-2 text-center pt-0.5">
                    <div className="bg-white p-1.5 rounded-lg border border-[#C77E52]/10 shadow-sm">
                      <span className="block text-[10px] text-slate-400 uppercase">Allocated</span>
                      <span className="font-bold text-slate-700">{selectedCompany.allocatedCredits.toLocaleString()}</span>
                    </div>
                    <div className="bg-white p-1.5 rounded-lg border border-[#C77E52]/10 shadow-sm">
                      <span className="block text-[10px] text-slate-400 uppercase">Used</span>
                      <span className="font-bold text-slate-500">{selectedCompany.usedCredits.toLocaleString()}</span>
                    </div>
                    <div className="bg-white p-1.5 rounded-lg border border-[#C77E52]/20 shadow-sm bg-gradient-to-br from-white to-[rgba(199,126,82,0.05)]">
                      <span className="block text-[10px] text-[#C77E52] font-bold uppercase">Current Balance</span>
                      <span className="font-extrabold text-[#C77E52]">{selectedCompany.remainingCredits.toLocaleString()} Credits</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Action Type</label>
                  <select
                    value={allocAction}
                    onChange={(e) => setAllocAction(e.target.value as any)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 focus:ring-2 focus:ring-[#C77E52]"
                  >
                    <option value="ALLOCATE">Allocate Credits (+)</option>
                    <option value="ADD">Add Credits (+)</option>
                    <option value="DEDUCT">Deduct Credits (-)</option>
                    <option value="RESET">Reset Balance (=)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Verification Credits</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={allocCredits}
                    onChange={(e) => setAllocCredits(parseInt(e.target.value, 10) || 0)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-bold text-[#C77E52] focus:ring-2 focus:ring-[#C77E52]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={allocExpiry}
                  onChange={(e) => setAllocExpiry(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-[#C77E52]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Remarks / Audit Note</label>
                <textarea
                  rows={2}
                  value={allocRemarks}
                  onChange={(e) => setAllocRemarks(e.target.value)}
                  placeholder="Reason for allocation or credit adjustment..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-normal text-slate-700 focus:ring-2 focus:ring-[#C77E52]"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAllocateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={allocSubmitting}
                  className="px-5 py-2 bg-gradient-to-r from-[#C77E52] to-[#C77E52] hover:from-[#E0996A] hover:to-[#E0996A] text-white rounded-xl font-semibold text-xs transition shadow-[0_4px_12px_rgba(184,116,60,0.30)] hover:shadow-[0_6px_20px_rgba(184,116,60,0.45)] disabled:opacity-50 border border-[rgba(199,126,82,0.15)]/20"
                >
                  {allocSubmitting ? 'Processing...' : `${allocAction} CREDITS`}
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
