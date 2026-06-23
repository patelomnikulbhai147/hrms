import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileSignature, LayoutDashboard, MapPin, Users, RefreshCw } from 'lucide-react';
import { type Role } from '@/types';
import { type UserAccount } from '@/pages/Login';
import { api } from '@/api/apiClient';
import { ContractsTab, effectiveContractStatus } from '@/components/tenders/ContractsTab';
import { SitesTab } from '@/components/tenders/SitesTab';
import { DeploymentTab } from '@/components/tenders/DeploymentTab';
import { RenewalsTab } from '@/components/tenders/RenewalsTab';

interface ContractsProps {
  role: Role;
  activeCompanyId: string;
  authProfile?: UserAccount | null;
}

type TabId = 'dashboard' | 'contracts' | 'sites' | 'deployment' | 'renewals';
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
  { id: 'contracts', label: 'Contracts', icon: <FileSignature size={14} /> },
  { id: 'sites', label: 'Sites', icon: <MapPin size={14} /> },
  { id: 'deployment', label: 'Deployment', icon: <Users size={14} /> },
  { id: 'renewals', label: 'Renewals', icon: <RefreshCw size={14} /> },
];

// ── CONTRACT MANAGEMENT ──────────────────────────────────────────────────────
// Operational workforce execution: contracts, their sites, employee deployment,
// and renewals. This is where attendance & payroll attach — NOT tenders.
export const Contracts: React.FC<ContractsProps> = ({ role, activeCompanyId }) => {
  const canManageCommercial = ['Super Admin', 'Company Head'].includes(role);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [reloadKey, setReloadKey] = useState(0);
  const bumpReload = useCallback(() => setReloadKey(k => k + 1), []);

  const [contracts, setContracts] = useState<any[]>([]);
  const loadSummary = useCallback(async () => {
    try { setContracts(await api.contracts.getAll() || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary, activeCompanyId, reloadKey, tab]);

  const kpis = useMemo(() => {
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
  }, [contracts]);

  const KPI = ({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) => (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-[10px] font-extrabold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-extrabold mt-1">{value}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header + tabs */}
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm">
        <div className="px-5 py-4 border-b border-[#DBEAFE]">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FileSignature size={18} className="text-indigo-600" /> Contract Management</h2>
          <p className="text-xs text-slate-500">Contract execution → sites → employee deployment → attendance → payroll → renewal / closure.</p>
        </div>
        <div className="flex flex-wrap gap-1 px-3 py-2">
          {TABS.map(s => (
            <button key={s.id} onClick={() => setTab(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === s.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>{s.icon}{s.label}</button>
          ))}
        </div>
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
    </div>
  );
};

export default Contracts;
