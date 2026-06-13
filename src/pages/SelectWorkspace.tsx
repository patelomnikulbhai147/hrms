import React, { useMemo, useEffect, useState } from 'react';
import { Company } from '../types';
import { Building2, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { UserAccount } from './Login';
import { cn } from '../utils/cn';
import { buildWorkspaceHierarchy, logWorkspaceAudit } from '../utils/workspaceUtils';

interface SelectWorkspaceProps {
  companies: Company[];
  onSelect: (companyId: string, kind?: 'company' | 'branch') => void | Promise<void>;
  user: UserAccount;
  isLoading?: boolean;
}

export const SelectWorkspace: React.FC<SelectWorkspaceProps> = ({ companies, onSelect, user, isLoading }) => {
  // Canonical Company -> Branch hierarchy. The backend already enforces RBAC,
  // so we group exactly what the API returned — companies are parent nodes,
  // branches are their children. (No fuzzy name-matching, no branch self-groups.)
  const hierarchy = useMemo(() => buildWorkspaceHierarchy(companies), [companies]);

  const [hierarchyError, setHierarchyError] = useState<string | null>(null);

  // Mandated validation: log Loaded Companies / Branches / Permissions / Rendered
  // Groups and the four counts, and refuse to show a broken hierarchy.
  useEffect(() => {
    if (!companies || companies.length === 0) { setHierarchyError(null); return; }
    try {
      logWorkspaceAudit(user, companies, hierarchy);
      setHierarchyError(null);
    } catch (e: any) {
      setHierarchyError(e.message || 'Workspace hierarchy validation failed.');
    }
  }, [companies, hierarchy, user]);

  const [selectedId, setSelectedId] = useState<string>(user.companyId || '');
  const [isEntering, setIsEntering] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Flat list of all selectable workspace cards (for default-selection logic).
  const accessibleWorkspaces = useMemo(() => hierarchy.flatMap(g => g.cards), [hierarchy]);

  const handleEnterWorkspace = async (companyId: string) => {
    setIsEntering(true);
    setErrorMsg(null);
    try {
      // A branch workspace has a parent company — signal the kind so the shared
      // company/branch id space is resolved unambiguously.
      const ws = accessibleWorkspaces.find(w => String(w.id) === String(companyId)) as any;
      const kind = ws?.parentCompanyId ? 'branch' : 'company';
      await onSelect(companyId, kind);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to enter workspace.');
      setIsEntering(false);
    }
  };

  useEffect(() => {
    // Set initial selection to primary base if not set
    if (!selectedId && accessibleWorkspaces.length > 0) {
      const primary = accessibleWorkspaces.find(w => w.id === user.companyId);
      setSelectedId(primary ? primary.id : accessibleWorkspaces[0].id);
    }
  }, [accessibleWorkspaces, user.companyId, selectedId]);

  if (isLoading || (companies.length === 0 && isLoading !== false)) {
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
          {errorMsg && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm font-medium">
              {errorMsg}
            </div>
          )}
          {hierarchyError && (
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/50 rounded-lg text-amber-400 text-sm font-medium">
              Workspace hierarchy could not be validated: {hierarchyError}
            </div>
          )}
        </div>

        {/* Do not render the workspace grid until the Company -> Branch hierarchy is valid. */}
        {!hierarchyError && (
        <div className="space-y-10">
          {hierarchy.map((group) => {
              const groupName = group.companyName;
              // Sort cards: the user's primary workspace first, then alphabetically.
              const sortedBranches = [...group.cards].sort((a, b) => {
                const isAPrimary = user.companyId === a.id;
                const isBPrimary = user.companyId === b.id;
                if (isAPrimary) return -1;
                if (isBPrimary) return 1;
                const nameA = ((a as any).branchName || a.name || '').toLowerCase();
                const nameB = ((b as any).branchName || b.name || '').toLowerCase();
                return nameA.localeCompare(nameB);
              });

              return (
                <div key={group.companyId} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-700/50">
                    <span className="text-2xl">🏢</span>
                    <h2 className="text-xl font-bold text-white tracking-wide">
                      {groupName} <span className="text-slate-400 font-medium ml-1">({group.cards.length})</span>
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedBranches.map(workspace => {
                      const isSelected = selectedId === workspace.id;
                      const isPrimary = workspace.id === user.companyId;
                      return (
                        <div
                          key={workspace.id}
                          onClick={() => setSelectedId(workspace.id)}
                          className={cn(
                            "cursor-pointer group relative border rounded-xl p-6 text-left transition-all flex flex-col overflow-hidden",
                            isSelected 
                              ? "bg-slate-800/90 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.2)] scale-[1.02]" 
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

                          <div className="flex items-start gap-4 mb-4">
                            <div className={cn(
                              "w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-inner transition-transform",
                              isSelected ? "bg-indigo-500/20 text-indigo-400" : "bg-slate-700/50 text-slate-300 group-hover:bg-slate-600/50"
                            )}>
                              {isPrimary ? '⭐' : '📍'}
                            </div>
                            <div className="pr-8 flex-1">
                              <h3 className={cn("text-lg font-bold mt-2", isSelected ? "text-white" : "text-slate-200")}>
                                {(workspace as any).branchName || workspace.name}
                              </h3>
                            </div>
                          </div>

                          <div className="mt-auto pt-4 border-t border-slate-700/50 flex items-center justify-between">
                            <span className={cn("text-sm font-medium", isSelected ? "text-indigo-400" : "text-slate-400 group-hover:text-slate-300")}>
                              {isSelected ? 'Selected' : 'Select Workspace'}
                            </span>
                            
                            <button
                              disabled={isEntering}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEnterWorkspace(workspace.id);
                              }}
                              className={cn(
                                "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-sm",
                                isSelected 
                                  ? "bg-indigo-500 text-white hover:bg-indigo-600 shadow-indigo-500/20" 
                                  : "bg-slate-700 text-slate-200 hover:bg-slate-600 group-hover:bg-indigo-500/10 group-hover:text-indigo-400",
                                isEntering && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              {isEntering && selectedId === workspace.id ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                <>
                                  Enter
                                  <ArrowRight size={14} />
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
        )}

        <div className="mt-10 flex justify-center">
          <button
            onClick={() => handleEnterWorkspace(selectedId)}
            disabled={!selectedId || isEntering}
            className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-500/25 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEntering ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Entering...
              </>
            ) : (
              <>
                <ShieldCheck size={18} />
                Continue to Dashboard
                <ArrowRight size={18} />
              </>
            )}
          </button>
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
