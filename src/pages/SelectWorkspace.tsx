import React, { useMemo, useEffect, useState } from 'react';
import { Company } from '../types';
import { Building2, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { UserAccount } from './Login';
import { cn } from '../utils/cn';

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

  const [selectedId, setSelectedId] = useState<string>(user.companyId || '');

  useEffect(() => {
    // If companies are loaded and user only has one accessible workspace, auto-select it
    if (companies.length > 0 && accessibleWorkspaces.length === 1) {
      onSelect(accessibleWorkspaces[0].id);
    }
    // Set initial selection to primary base if not set
    if (!selectedId && accessibleWorkspaces.length > 0) {
      const primary = accessibleWorkspaces.find(w => w.id === user.companyId);
      setSelectedId(primary ? primary.id : accessibleWorkspaces[0].id);
    }
  }, [companies.length, accessibleWorkspaces, onSelect, user.companyId, selectedId]);

  if (companies.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="text-slate-400 animate-pulse">Loading workspaces...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-4">Select Workspace</h1>
          <p className="text-slate-400">Choose a company or branch to access its dashboard.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accessibleWorkspaces.map(workspace => {
            const isSelected = selectedId === workspace.id;
            const isPrimary = workspace.id === user.companyId;
            return (
              <button
                key={workspace.id}
                onClick={() => setSelectedId(workspace.id)}
                className={cn(
                  "group relative border rounded-xl p-6 text-left transition-all flex flex-col overflow-hidden",
                  isSelected 
                    ? "bg-slate-800/80 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.2)] scale-[1.02]" 
                    : "bg-slate-800 border-slate-700 hover:border-slate-500 hover:bg-slate-700/50 opacity-80 hover:opacity-100"
                )}
              >
                {isPrimary && (
                  <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[9px] font-bold px-2 py-1 rounded-bl-lg uppercase tracking-wide">
                    Primary Base
                  </div>
                )}
                {isSelected && (
                  <div className="absolute top-4 right-4 text-indigo-400">
                    <CheckCircle2 size={20} className="drop-shadow-md" />
                  </div>
                )}
                <div className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-transform",
                  isSelected ? "bg-indigo-500/20 text-indigo-400" : "bg-slate-700 text-slate-400"
                )}>
                  <Building2 size={24} />
                </div>
                <h3 className={cn("text-xl font-semibold mb-2 pr-6", isSelected ? "text-white" : "text-slate-200")}>
                  {workspace.name || workspace.branchName}
                </h3>
                <div className="text-sm text-slate-400 flex-1">
                  {workspace.isHeadOffice ? 'Head Office' : 'Branch Office'}
                </div>
              </button>
            );
          })}
        </div>

        {accessibleWorkspaces.length > 1 && (
          <div className="mt-10 flex justify-center">
            <button
              onClick={() => onSelect(selectedId)}
              disabled={!selectedId}
              className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-500/25 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldCheck size={18} />
              Continue to Dashboard
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {accessibleWorkspaces.length === 0 && (
          <div className="text-center text-slate-400 bg-slate-800 p-8 rounded-xl border border-slate-700">
            No workspaces assigned to your account. Please contact your administrator.
          </div>
        )}
      </div>
    </div>
  );
};
