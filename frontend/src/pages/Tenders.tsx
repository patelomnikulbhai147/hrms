import React from 'react';
import { Briefcase } from 'lucide-react';
import { type Role } from '@/types';
import { type UserAccount } from '@/pages/Login';
import { TendersTab } from '@/components/tenders/TendersTab';

interface TendersProps {
  role: Role;
  activeCompanyId: string;
  authProfile?: UserAccount | null;
}

// ── TENDER MANAGEMENT ────────────────────────────────────────────────────────
// Business-opportunity pipeline ONLY (Live → Submitted → Won/Lost). Tenders do
// NOT drive attendance or payroll — winning one creates a Contract (separate
// module) which owns sites, deployment, attendance and payroll.
export const Tenders: React.FC<TendersProps> = ({ role, activeCompanyId }) => {
  // Commercial actions (create/edit/delete tender, edit tender value) are limited
  // to Super Admin + Company Head. HR is view-only on tenders.
  const canManageCommercial = ['Super Admin', 'Company Head'].includes(role);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[14px] border border-[#DBEAFE] shadow-sm px-5 py-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Briefcase size={18} className="text-indigo-600" /> Tender Management</h2>
        <p className="text-xs text-slate-500">Track business opportunities through the bidding pipeline. Win a tender, then convert it to a contract.</p>
      </div>

      <TendersTab activeCompanyId={activeCompanyId} canManageCommercial={canManageCommercial} onChanged={() => { /* list self-refreshes */ }} />
    </div>
  );
};

export default Tenders;
