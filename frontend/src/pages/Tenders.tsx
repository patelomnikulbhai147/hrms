import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Briefcase, LayoutDashboard, FileText, FileSignature, MapPin, Users, RefreshCw } from 'lucide-react';
import { type Role } from '@/types';
import { type UserAccount } from '@/pages/Login';
import { api } from '@/api/apiClient';
import { TendersTab } from '@/components/tenders/TendersTab';
import { ContractsTab } from '@/components/tenders/ContractsTab';
import { SitesTab } from '@/components/tenders/SitesTab';
import { DeploymentTab } from '@/components/tenders/DeploymentTab';
import { RenewalsTab } from '@/components/tenders/RenewalsTab';

interface TendersProps {
  role: Role;
  activeCompanyId: string;
  authProfile?: UserAccount | null;
}

type TabId = 'dashboard' | 'tenders' | 'contracts' | 'sites' | 'deployment' | 'renewals';
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
  { id: 'tenders', label: 'Tenders', icon: <FileText size={14} /> },
  { id: 'contracts', label: 'Contracts', icon: <FileSignature size={14} /> },
  { id: 'sites', label: 'Sites', icon: <MapPin size={14} /> },
  { id: 'deployment', label: 'Deployment', icon: <Users size={14} /> },
  { id: 'renewals', label: 'Renewals', icon: <RefreshCw size={14} /> },
];

export const Tenders: React.FC<TendersProps> = ({ role, activeCompanyId }) => {
  const canManageCommercial = ['Super Admin', 'Company Head'].includes(role);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [reloadKey, setReloadKey] = useState(0);
  const bumpReload = useCallback(() => setReloadKey(k => k + 1), []);

  // Dashboard summary data
  const [tenders, setTenders] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const loadSummary = useCallback(async () => {
    try { const [t, c] = await Promise.all([api.tenders.getAll(), api.contracts.getAll()]); setTenders(t || []); setContracts(c || []); }
    catch { /* ignore */ }
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary, activeCompanyId, reloadKey, tab]);

  const kpis = useMemo(() => ({
    totalTenders: tenders.length,
    won: tenders.filter(t => t.status === 'Won').length,
    activeContracts: contracts.filter(c => (c.derivedStatus || c.status) === 'Active').length,
    expiringSoon: contracts.filter(c => (c.derivedStatus || c.status) === 'Expiring Soon').length,
    totalSites: contracts.reduce((s, c) => s + (c._count?.sites ?? c.sites?.length ?? 0), 0),
    deployed: contracts.reduce((s, c) => s + (c.assignedHeadcount ?? 0), 0),
    required: contracts.reduce((s, c) => s + (c.requiredHeadcount ?? 0), 0),
  }), [tenders, contracts]);

  const KPI = ({ label, value, tone, sub }: { label: string; value: React.ReactNode; tone: string; sub?: string }) => (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-[10px] font-extrabold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-3xl font-extrabold mt-1">{value}</p>
      {sub && <p className="text-[10px] font-semibold opacity-60 mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm">
        <div className="px-5 py-4 border-b border-[#DBEAFE]">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Briefcase size={18} className="text-indigo-600" /> Tenders &amp; Contracts</h2>
          <p className="text-xs text-slate-500">Tender → Contract → Sites → Deployment lifecycle, integrated with employees, attendance &amp; payroll.</p>
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
            <KPI label="Total Tenders" value={kpis.totalTenders} tone="border-amber-150 bg-gradient-to-br from-amber-50 to-white text-amber-700" />
            <KPI label="Tenders Won" value={kpis.won} tone="border-emerald-150 bg-gradient-to-br from-emerald-50 to-white text-emerald-700" />
            <KPI label="Active Contracts" value={kpis.activeContracts} tone="border-indigo-150 bg-gradient-to-br from-indigo-50 to-white text-indigo-700" />
            <KPI label="Expiring Soon" value={kpis.expiringSoon} tone="border-rose-150 bg-gradient-to-br from-rose-50 to-white text-rose-700" sub="≤ 90 days" />
            <KPI label="Sites" value={kpis.totalSites} tone="border-sky-150 bg-gradient-to-br from-sky-50 to-white text-sky-700" />
            <KPI label="Deployed" value={`${kpis.deployed}/${kpis.required}`} tone="border-slate-200 bg-gradient-to-br from-slate-50 to-white text-slate-700" sub="assigned / required" />
          </div>
          <div className="bg-white rounded-xl border border-[#DBEAFE] p-4">
            <p className="text-sm font-bold text-slate-800 mb-2">Lifecycle</p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
              {['Tender', 'Won', 'Contract', 'Sites', 'Deploy', 'Attendance', 'Payroll', 'Renew / Close'].map((s, i, a) => (
                <React.Fragment key={s}>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">{s}</span>
                  {i < a.length - 1 && <span className="text-slate-300">→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'tenders' && <TendersTab activeCompanyId={activeCompanyId} canManageCommercial={canManageCommercial} onConverted={() => { bumpReload(); setTab('contracts'); }} onChanged={bumpReload} />}
      {tab === 'contracts' && <ContractsTab activeCompanyId={activeCompanyId} canManageCommercial={canManageCommercial} reloadKey={reloadKey} onChanged={bumpReload} />}
      {tab === 'sites' && <SitesTab activeCompanyId={activeCompanyId} canManageCommercial={canManageCommercial} onChanged={bumpReload} />}
      {tab === 'deployment' && <DeploymentTab activeCompanyId={activeCompanyId} role={role} onChanged={bumpReload} />}
      {tab === 'renewals' && <RenewalsTab activeCompanyId={activeCompanyId} canManageCommercial={canManageCommercial} reloadKey={reloadKey} onChanged={bumpReload} />}
    </div>
  );
};

export default Tenders;
