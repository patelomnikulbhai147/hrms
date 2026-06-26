import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  FileSignature, LayoutDashboard, MapPin, Users, RefreshCw, 
  Building2, DollarSign, Calendar, Clock, CheckCircle2, 
  AlertTriangle, Search, FileSpreadsheet, FileText, Filter, 
  TrendingUp, XCircle, ArrowRight 
} from 'lucide-react';
import { type Role } from '@/types';
import { type UserAccount } from '@/pages/Login';
import { api } from '@/api/apiClient';
import { ContractsTab, effectiveContractStatus } from '@/components/tenders/ContractsTab';
import { SitesTab } from '@/components/tenders/SitesTab';
import { DeploymentTab } from '@/components/tenders/DeploymentTab';
import { RenewalsTab } from '@/components/tenders/RenewalsTab';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/utils/formatDate';
import { exportRowsToExcel, exportRowsToPDF } from '@/utils/exportUtils';
import { ui } from '@/components/ui/feedback';

interface ContractsProps {
  role: Role;
  activeCompanyId: string;
  authProfile?: UserAccount | null;
  companies?: any[];
  onStartMasquerade?: (companyId: string, kind?: 'company' | 'branch', targetPage?: any) => void;
}

type TabId = 'dashboard' | 'contracts' | 'sites' | 'deployment' | 'renewals';
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
  { id: 'contracts', label: 'Contracts', icon: <FileSignature size={14} /> },
  { id: 'sites', label: 'Sites', icon: <MapPin size={14} /> },
  { id: 'deployment', label: 'Deployment', icon: <Users size={14} /> },
  { id: 'renewals', label: 'Renewals', icon: <RefreshCw size={14} /> },
];

// ── CONTRACTS OVERVIEW (SUPER ADMIN SIMPLIFIED DASHBOARD) ───────────────────────
const ContractsOverview: React.FC<{
  companies: any[];
  onStartMasquerade?: (companyId: string, kind?: 'company' | 'branch', targetPage?: any) => void;
}> = ({ companies, onStartMasquerade }) => {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Simplified Filters state (No Branch, No Status)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadAllContracts = async () => {
    setLoading(true);
    try {
      // Query all contracts (Super Admin getAll returns all contracts across companies if no companyId is set)
      const data = await api.contracts.getAll() || [];
      setContracts(data);
    } catch (err) {
      console.error('Failed to load all contracts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllContracts();
  }, []);

  // Derived lists from companies prop (only parent companies)
  const parentCompanies = useMemo(() => {
    return companies.filter(c => !c.parentCompanyId && c.id);
  }, [companies]);

  // Apply filters to contracts list
  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      // Company Filter
      if (selectedCompanyId && String(c.companyId) !== String(selectedCompanyId)) return false;

      // Date Range Filter (against startDate / endDate)
      if (startDate && c.startDate && c.startDate < startDate) return false;
      if (endDate && c.endDate && c.endDate > endDate) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match = 
          c.contractName?.toLowerCase().includes(q) ||
          c.contractNumber?.toLowerCase().includes(q) ||
          c.clientName?.toLowerCase().includes(q) ||
          c.notes?.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [contracts, selectedCompanyId, startDate, endDate, searchQuery]);

  // Compute stats based on filtered contracts (Simplified to 6 essential KPIs)
  const stats = useMemo(() => {
    // 1. Total Companies
    const totalCompanies = parentCompanies.length;

    // 2. Companies Having Contracts (parent companies with at least one contract in the database)
    const companiesWithContracts = parentCompanies.filter(comp => {
      if (selectedCompanyId && String(comp.id) !== String(selectedCompanyId)) return false;
      return contracts.some(c => c.companyId === comp.id);
    }).length;

    // 3. Companies Without Contracts
    const companiesWithoutContracts = parentCompanies.filter(comp => {
      if (selectedCompanyId && String(comp.id) !== String(selectedCompanyId)) return false;
      return !contracts.some(c => c.companyId === comp.id);
    }).length;

    // 4. Total Contracts
    const totalContracts = filteredContracts.length;

    // 5. Active Contracts (effectiveContractStatus is Active)
    const activeContracts = filteredContracts.filter(c => effectiveContractStatus(c) === 'Active').length;

    // 6. Running Contracts (operational/active or expiring soon - not closed/cancelled/expired)
    const runningContracts = filteredContracts.filter(c => 
      ['Active', 'Expiring Soon'].includes(effectiveContractStatus(c))
    ).length;

    return {
      totalCompanies,
      companiesHaving: companiesWithContracts,
      companiesWithout: companiesWithoutContracts,
      totalContracts,
      activeContracts,
      runningContracts
    };
  }, [filteredContracts, contracts, parentCompanies, selectedCompanyId]);

  // Group by Company for Simplified Summary Table
  const companySummary = useMemo(() => {
    return parentCompanies.map(comp => {
      const compContracts = contracts.filter(c => c.companyId === comp.id);
      const total = compContracts.length;
      const active = compContracts.filter(c => effectiveContractStatus(c) === 'Active').length;
      const running = compContracts.filter(c => ['Active', 'Expiring Soon'].includes(effectiveContractStatus(c))).length;
      
      const dates = compContracts.map(c => new Date(c.updatedAt || c.createdAt).getTime()).filter(Boolean);
      const lastUpdated = dates.length ? new Date(Math.max(...dates)).toISOString() : null;

      return {
        id: comp.id,
        name: comp.name,
        total, 
        active, 
        running, 
        lastUpdated
      };
    }).sort((a, b) => b.total - a.total); // Sort by total contracts count descending
  }, [parentCompanies, contracts]);

  // Simplified Exports including only the simplified columns
  const handleExport = (format: 'excel' | 'pdf') => {
    try {
      if (!companySummary.length) {
        ui.toast.info('No summary data to export.');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const cols = [
        { header: 'Company Name', key: 'name', width: 35 },
        { header: 'Total Contracts', key: 'total', width: 15 },
        { header: 'Active Contracts', key: 'active', width: 18 },
        { header: 'Running Contracts', key: 'running', width: 18 },
        { header: 'Last Updated', key: 'lastUpdated', width: 20, format: (v: any) => v ? formatDate(v) : '—' }
      ];

      if (format === 'excel') {
        exportRowsToExcel(`Contract_Overview_Summary_${stamp}`, cols, companySummary, 'Contract Summary');
      } else {
        exportRowsToPDF(`Contract_Overview_Summary_${stamp}`, 'Contract Platform Overview Summary', cols, companySummary);
      }
    } catch (err: any) {
      ui.toast.error('Export failed: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleCompanyClick = (companyId: string) => {
    if (onStartMasquerade) {
      // Masquerade and immediately open the contracts page
      onStartMasquerade(String(companyId), 'company', 'contracts');
    }
  };

  const KPI = ({ label, value, tone, icon: Icon }: { label: string; value: React.ReactNode; tone: string; icon: any }) => (
    <div className={`rounded-2xl border p-6 shadow-sm transition-all hover:scale-[1.01] bg-white flex items-center justify-between min-h-[120px] ${tone}`}>
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider opacity-80">{label}</p>
        <p className="text-4xl font-black tracking-tight">{value}</p>
      </div>
      <div className="p-3.5 rounded-xl bg-white/70 shadow-inner flex items-center justify-center">
        <Icon size={24} className="opacity-90" />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Simplified Filters Section */}
      <Card className="p-5 bg-white border border-[#DBEAFE] rounded-[14px] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Overview Filtering</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={<FileSpreadsheet size={13} />} onClick={() => handleExport('excel')}>Excel Summary</Button>
            <Button variant="outline" size="sm" icon={<FileText size={13} />} onClick={() => handleExport('pdf')}>PDF Summary</Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Select 
            label="Company" 
            value={selectedCompanyId} 
            onChange={e => setSelectedCompanyId(e.target.value)}
            options={[
              { value: '', label: 'All Companies' },
              ...parentCompanies.map(c => ({ value: String(c.id), label: c.name }))
            ]}
          />
          <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <Input label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <Input label="Search Keyword" icon={<Search size={14} />} placeholder="Search name/client..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-[#DBEAFE] rounded-[14px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
          <p className="text-sm text-slate-500 font-semibold">Loading platform contract intelligence...</p>
        </div>
      ) : (
        <>
          {/* Simplified Dashboard Cards Section */}
          <div className="space-y-6">
            {/* Company Statistics Row */}
            <div>
              <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3">Company Insights</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPI label="Total Companies" value={stats.totalCompanies} tone="border-indigo-100 text-indigo-700 hover:border-indigo-300" icon={Building2} />
                <KPI label="Companies Having Contracts" value={stats.companiesHaving} tone="border-emerald-100 text-emerald-700 hover:border-emerald-300" icon={CheckCircle2} />
                <KPI label="Companies Without Contracts" value={stats.companiesWithout} tone="border-rose-100 text-rose-700 hover:border-rose-300" icon={AlertTriangle} />
              </div>
            </div>

            {/* Contract Statistics Row */}
            <div>
              <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3">Contract Pipeline</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPI label="Total Contracts" value={stats.totalContracts} tone="border-indigo-100 text-indigo-700 hover:border-indigo-300" icon={FileSignature} />
                <KPI label="Active Contracts" value={stats.activeContracts} tone="border-sky-100 text-sky-700 hover:border-sky-300" icon={TrendingUp} />
                <KPI label="Running Contracts" value={stats.runningContracts} tone="border-emerald-100 text-emerald-700 hover:border-emerald-300" icon={CheckCircle2} />
              </div>
            </div>
          </div>

          {/* Company-wise Simplified Summary Table */}
          <Card className="p-5 bg-white border border-[#DBEAFE] rounded-[14px] shadow-sm">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800">Company-wise Contract Performance</h3>
              <p className="text-xs text-slate-400 mt-0.5">Click any company to enter masquerade mode and manage its specific contracts, sites, and deployments.</p>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Company Name</Th>
                    <Th>Total Contracts</Th>
                    <Th>Active Contracts</Th>
                    <Th>Running Contracts</Th>
                    <Th>Last Updated</Th>
                    <Th className="text-right">Action</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {companySummary.map(comp => (
                    <Tr key={comp.id} className="hover:bg-indigo-50/20 cursor-pointer" onClick={() => handleCompanyClick(comp.id)}>
                      <Td className="font-semibold text-slate-800 flex items-center gap-2 py-3.5">
                        <Building2 size={13} className="text-slate-400" />
                        {comp.name}
                      </Td>
                      <Td className="font-bold text-slate-700">{comp.total}</Td>
                      <Td><Badge variant="blue">{comp.active}</Badge></Td>
                      <Td><Badge variant="green">{comp.running}</Badge></Td>
                      <Td className="text-xs text-slate-400">{comp.lastUpdated ? formatDate(comp.lastUpdated) : '—'}</Td>
                      <Td className="text-right">
                        <button className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg flex items-center gap-1.5 ml-auto shadow-sm transition-colors">
                          Open Company <ArrowRight size={10} />
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

// ── CONTRACTS MAIN CONTAINER ──────────────────────────────────────────────────
export const Contracts: React.FC<ContractsProps> = ({ 
  role, 
  activeCompanyId, 
  companies = [], 
  onStartMasquerade 
}) => {
  const isSuperAdmin = role === 'Super Admin';
  const canManageCommercial = ['Super Admin', 'Company Head'].includes(role);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [reloadKey, setReloadKey] = useState(0);
  const bumpReload = useCallback(() => setReloadKey(k => k + 1), []);

  const [contracts, setContracts] = useState<any[]>([]);
  const loadSummary = useCallback(async () => {
    try { setContracts(await api.contracts.getAll() || []); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) {
      loadSummary();
    }
  }, [loadSummary, activeCompanyId, reloadKey, tab, isSuperAdmin]);

  const kpis = useMemo(() => {
    if (isSuperAdmin) return { active: 0, expiring: 0, expired: 0, closed: 0, totalValue: 0, activeSites: 0 };
    const by = (s: string) => contracts.filter(c => effectiveContractStatus(c) === s).length;
    const activeContracts = contracts.filter(c => effectiveContractStatus(c) === 'Active');
    return {
      active: by('Active'),
      expiring: by('Expiring Soon'),
      expired: by('Expired'),
      closed: by('Closed'),
      totalValue: contracts.reduce((s, c) => s + (Number(c.contractValue) || 0), 0),
      activeSites: activeContracts.reduce((s, c) => s + (c._count?.sites ?? c.sites?.length ?? 0), 0),
    };
  }, [contracts, isSuperAdmin]);

  const KPI = ({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) => (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-[10px] font-extrabold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-extrabold mt-1">{value}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Custom Title Card */}
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm px-5 py-4 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileSignature size={18} className="text-indigo-600" />
            {isSuperAdmin ? 'Contract Overview' : 'Contract Management'}
          </h2>
          <p className="text-xs text-slate-500">
            {isSuperAdmin 
              ? 'Multi-tenant platform contract monitoring, renewals tracking, and company summaries.'
              : 'Contract execution → sites → employee deployment → attendance → payroll → renewal / closure.'}
          </p>
        </div>
        {isSuperAdmin && (
          <Badge variant="indigo" className="uppercase px-2.5 py-1 font-bold text-[9px] tracking-wider">Platform Analytics</Badge>
        )}
      </div>

      {isSuperAdmin ? (
        <ContractsOverview companies={companies} onStartMasquerade={onStartMasquerade} />
      ) : (
        <>
          {/* Tabs header */}
          <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm flex flex-wrap gap-1 px-3 py-2">
            {TABS.map(s => (
              <button key={s.id} onClick={() => setTab(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === s.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>{s.icon}{s.label}</button>
            ))}
          </div>

          {/* Dashboard */}
          {tab === 'dashboard' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPI label="Active Contracts" value={kpis.active} tone="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-700" />
                <KPI label="Expiring Contracts" value={kpis.expiring} tone="border-amber-200 bg-gradient-to-br from-amber-50 to-white text-amber-700" />
                <KPI label="Expired Contracts" value={kpis.expired} tone="border-rose-200 bg-gradient-to-br from-rose-50 to-white text-rose-700" />
                <KPI label="Closed Contracts" value={kpis.closed} tone="border-slate-200 bg-gradient-to-br from-slate-50 to-white text-slate-600" />
                <KPI label="Total Contract Value" value={`₹${kpis.totalValue.toLocaleString('en-IN')}`} tone="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white text-indigo-700" />
                <KPI label="Active Sites" value={kpis.activeSites} tone="border-sky-200 bg-gradient-to-br from-sky-50 to-white text-sky-700" />
              </div>
              <div className="bg-white rounded-xl border border-[#DBEAFE] p-4">
                <p className="text-sm font-bold text-slate-800 mb-2">Execution Lifecycle</p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                  {['Contract', 'Sites', 'Deploy', 'Attendance', 'Payroll', 'Renew / Close'].map((s, i, a) => (
                    <React.Fragment key={s}>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">{s}</span>
                      {i < a.length - 1 && <span className="text-slate-300">→</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'contracts' && <ContractsTab activeCompanyId={activeCompanyId} canManageCommercial={canManageCommercial} reloadKey={reloadKey} onChanged={bumpReload} />}
          {tab === 'sites' && <SitesTab activeCompanyId={activeCompanyId} canManageCommercial={canManageCommercial} onChanged={bumpReload} />}
          {tab === 'deployment' && <DeploymentTab activeCompanyId={activeCompanyId} role={role} onChanged={bumpReload} />}
          {tab === 'renewals' && <RenewalsTab activeCompanyId={activeCompanyId} canManageCommercial={canManageCommercial} reloadKey={reloadKey} onChanged={bumpReload} />}
        </>
      )}
    </div>
  );
};

export default Contracts;
