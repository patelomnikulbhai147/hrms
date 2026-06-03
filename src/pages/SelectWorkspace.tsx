import React, { useMemo } from 'react';
import { Company, Role } from '../types';
import { Building2, ArrowRight } from 'lucide-react';
import type { UserAccount } from './Login';

interface SelectWorkspaceProps {
  companies: Company[];
  onSelect: (companyId: string) => void;
  user: UserAccount;
}

export const SelectWorkspace: React.FC<SelectWorkspaceProps> = ({ companies, onSelect, user }) => {
  const accessibleWorkspaces = useMemo(() => {
    if (user.role === 'Super Admin') {
      return companies;
    }
    
    // Explicit assignments
    const directIds = [user.companyId, ...(user.accessibleCompanyIds || [])].filter(Boolean);
    
    // Compute inheritance matching the RBAC logic
    const idSet = new Set<string>(directIds);
    directIds.forEach(pid => {
      const parent = companies.find(c => c.id === pid);
      if (parent && (pid === 'c-gcri' || parent.isHeadOffice || !parent.parentCompanyId)) {
        companies.filter(c => c.parentCompanyId === pid).forEach(child => idSet.add(child.id));
      }
    });

    const allowedIds = Array.from(idSet);
    return companies.filter(c => allowedIds.includes(c.id));
  }, [companies, user]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-4">Select Workspace</h1>
          <p className="text-slate-400">Choose a company or branch to access its dashboard.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accessibleWorkspaces.map(workspace => (
            <button
              key={workspace.id}
              onClick={() => onSelect(workspace.id)}
              className="group bg-slate-800 border border-slate-700 rounded-xl p-6 text-left hover:border-indigo-500 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all flex flex-col"
            >
              <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Building2 size={24} />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{workspace.name || workspace.branchName}</h3>
              <div className="text-sm text-slate-400 flex-1">
                {workspace.isHeadOffice ? 'Head Office' : 'Branch Office'}
                {workspace.location && ` • ${workspace.location}`}
              </div>
              <div className="mt-4 flex items-center text-indigo-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Access Dashboard <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          ))}
        </div>

        {accessibleWorkspaces.length === 0 && (
          <div className="text-center text-slate-400 bg-slate-800 p-8 rounded-xl border border-slate-700">
            No workspaces assigned to your account. Please contact your administrator.
          </div>
        )}
      </div>
    </div>
  );
};
