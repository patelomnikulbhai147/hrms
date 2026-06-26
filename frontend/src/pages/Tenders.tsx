import React, { useState, useEffect, useMemo } from 'react';
import { 
  Briefcase, Building2, Calendar, Clock, CheckCircle2, 
  AlertTriangle, Search, FileSpreadsheet, FileText, Filter, 
  TrendingUp, XCircle, ArrowRight 
} from 'lucide-react';
import { type Role } from '@/types';
import { type UserAccount } from '@/pages/Login';
import { TendersTab } from '@/components/tenders/TendersTab';
import { api } from '@/api/apiClient';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/utils/formatDate';
import { exportRowsToExcel, exportRowsToPDF } from '@/utils/exportUtils';
import { ui } from '@/components/ui/feedback';

interface TendersProps {
  role: Role;
  activeCompanyId: string;
  authProfile?: UserAccount | null;
  companies?: any[];
  onStartMasquerade?: (companyId: string, kind?: 'company' | 'branch', targetPage?: any) => void;
}

// ── TENDERS OVERVIEW (SUPER ADMIN SIMPLIFIED DASHBOARD) ─────────────────────────
const TendersOverview: React.FC<{
  companies: any[];
  onStartMasquerade?: (companyId: string, kind?: 'company' | 'branch', targetPage?: any) => void;
}> = ({ companies, onStartMasquerade }) => {
  const [tenders, setTenders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Simplified Filters state (No Branch, No Status)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadAllTenders = async () => {
    setLoading(true);
    try {
      // Query with ?all=true to get all tenders across all companies
      const data = await api.tenders.getAll('?all=true') || [];
      setTenders(data);
    } catch (err) {
      console.error('Failed to load all tenders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllTenders();
  }, []);

  // Derived lists from companies prop (only parent companies)
  const parentCompanies = useMemo(() => {
    return companies.filter(c => !c.parentCompanyId && c.id);
  }, [companies]);

  // Apply filters to tenders list
  const filteredTenders = useMemo(() => {
    return tenders.filter(t => {
      // Company Filter
      if (selectedCompanyId && String(t.companyId) !== String(selectedCompanyId)) return false;
      
      // Date Range Filter (against closingDate or publishDate)
      const tDate = t.closingDate || t.publishDate;
      if (tDate) {
        if (startDate && tDate < startDate) return false;
        if (endDate && tDate > endDate) return false;
      } else if (startDate || endDate) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match = 
          t.tenderName?.toLowerCase().includes(q) ||
          t.tenderNumber?.toLowerCase().includes(q) ||
          t.clientName?.toLowerCase().includes(q) ||
          t.serviceType?.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [tenders, selectedCompanyId, startDate, endDate, searchQuery]);

  // Compute stats based on filtered tenders (Simplified to 6 essential KPIs)
  const stats = useMemo(() => {
    // 1. Total Companies
    const totalCompanies = parentCompanies.length;

    // 2. Active Company IDs (Companies that have any tenders with status in Live, Submitted, Under Review, Draft)
    const activeCompIds = new Set(
      tenders
        .filter(t => ['Live', 'Submitted', 'Under Review', 'Draft'].includes(t.status))
        .map(t => t.companyId)
        .filter(Boolean)
    );
    
    // Filter active companies to only include those in the current filtered dataset if a company is selected
    const companiesWithActive = parentCompanies.filter(c => {
      if (selectedCompanyId && String(c.id) !== String(selectedCompanyId)) return false;
      return activeCompIds.has(c.id);
    }).length;

    // 3. Companies without active tenders
    const companiesWithoutActive = parentCompanies.filter(c => {
      if (selectedCompanyId && String(c.id) !== String(selectedCompanyId)) return false;
      return !activeCompIds.has(c.id);
    }).length;

    // 4. Total Tenders
    const totalTenders = filteredTenders.length;

    // 5. Live Tenders
    const liveTenders = filteredTenders.filter(t => t.status === 'Live').length;

    // 6. Awarded (Allocated) Tenders (Won status)
    const awardedTenders = filteredTenders.filter(t => t.status === 'Won').length;

    return {
      totalCompanies,
      companiesWithActive,
      companiesWithoutActive,
      totalTenders,
      liveTenders,
      awardedTenders
    };
  }, [filteredTenders, tenders, parentCompanies, selectedCompanyId]);

  // Compute Simplified Company-wise Summary
  const companySummary = useMemo(() => {
    return parentCompanies.map(comp => {
      const compTenders = tenders.filter(t => t.companyId === comp.id);
      const total = compTenders.length;
      const live = compTenders.filter(t => t.status === 'Live').length;
      const awarded = compTenders.filter(t => t.status === 'Won').length;
      
      // Last updated
      const dates = compTenders.map(t => new Date(t.updatedAt || t.createdAt).getTime()).filter(Boolean);
      const lastUpdated = dates.length ? new Date(Math.max(...dates)).toISOString() : null;

      return {
        id: comp.id,
        name: comp.name,
        total, 
        live, 
        awarded, 
        lastUpdated
      };
    }).sort((a, b) => b.total - a.total); // Sort by total tenders count descending
  }, [parentCompanies, tenders]);

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
        { header: 'Total Tenders', key: 'total', width: 15 },
        { header: 'Live Tenders', key: 'live', width: 15 },
        { header: 'Awarded Tenders', key: 'awarded', width: 18 },
        { header: 'Last Updated', key: 'lastUpdated', width: 20, format: (v: any) => v ? formatDate(v) : '—' }
      ];

      if (format === 'excel') {
        exportRowsToExcel(`Tender_Overview_Summary_${stamp}`, cols, companySummary, 'Tender Summary');
      } else {
        exportRowsToPDF(`Tender_Overview_Summary_${stamp}`, 'Tender Platform Overview Summary', cols, companySummary);
      }
    } catch (err: any) {
      ui.toast.error('Export failed: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleCompanyClick = (companyId: string) => {
    if (onStartMasquerade) {
      // Masquerade and immediately open the tenders page
      onStartMasquerade(String(companyId), 'company', 'tenders');
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
          <p className="text-sm text-slate-500 font-semibold">Loading platform tender intelligence...</p>
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
                <KPI label="Companies with Active Tenders" value={stats.companiesWithActive} tone="border-emerald-100 text-emerald-700 hover:border-emerald-300" icon={CheckCircle2} />
                <KPI label="Companies without Active Tenders" value={stats.companiesWithoutActive} tone="border-rose-100 text-rose-700 hover:border-rose-300" icon={AlertTriangle} />
              </div>
            </div>

            {/* Tender Statistics Row */}
            <div>
              <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3">Tender Pipeline</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPI label="Total Tenders" value={stats.totalTenders} tone="border-indigo-100 text-indigo-700 hover:border-indigo-300" icon={Briefcase} />
                <KPI label="Live Tenders" value={stats.liveTenders} tone="border-sky-100 text-sky-700 hover:border-sky-300" icon={TrendingUp} />
                <KPI label="Awarded (Allocated) Tenders" value={stats.awardedTenders} tone="border-emerald-100 text-emerald-700 hover:border-emerald-300" icon={CheckCircle2} />
              </div>
            </div>
          </div>

          {/* Company-wise Simplified Summary Table */}
          <Card className="p-5 bg-white border border-[#DBEAFE] rounded-[14px] shadow-sm">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800">Company-wise Tender Performance</h3>
              <p className="text-xs text-slate-400 mt-0.5">Click any company to enter masquerade mode and manage its specific tenders.</p>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Company Name</Th>
                    <Th>Total Tenders</Th>
                    <Th>Live Tenders</Th>
                    <Th>Awarded Tenders</Th>
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
                      <Td><Badge variant="blue">{comp.live}</Badge></Td>
                      <Td><Badge variant="green">{comp.awarded}</Badge></Td>
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

// ── TENDERS MAIN CONTAINER ───────────────────────────────────────────────────
export const Tenders: React.FC<TendersProps> = ({ 
  role, 
  activeCompanyId, 
  companies = [], 
  onStartMasquerade 
}) => {
  const isSuperAdmin = role === 'Super Admin';
  const canManageCommercial = ['Super Admin', 'Company Head'].includes(role);

  return (
    <div className="space-y-4">
      {/* Custom Title Card */}
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm px-5 py-4 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Briefcase size={18} className="text-indigo-600" /> 
            {isSuperAdmin ? 'Tender Overview' : 'Tender Management'}
          </h2>
          <p className="text-xs text-slate-500">
            {isSuperAdmin 
              ? 'Multi-tenant platform analytics, bidding pipelines, and company summaries.'
              : 'Track business opportunities through the bidding pipeline. Win a tender, then convert it to a contract.'}
          </p>
        </div>
        {isSuperAdmin && (
          <Badge variant="indigo" className="uppercase px-2.5 py-1 font-bold text-[9px] tracking-wider font-sans">Platform Analytics</Badge>
        )}
      </div>

      {isSuperAdmin ? (
        <TendersOverview companies={companies} onStartMasquerade={onStartMasquerade} />
      ) : (
        <TendersTab 
          activeCompanyId={activeCompanyId} 
          canManageCommercial={canManageCommercial} 
          onChanged={() => { /* list self-refreshes */ }} 
        />
      )}
    </div>
  );
};

export default Tenders;
