import React, { useMemo, useEffect, useState } from 'react';
import { Company } from '../types';
import { Building2, ArrowRight, CheckCircle2, ShieldCheck, MapPin, Star, LayoutGrid, Search } from 'lucide-react';
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
  const [query, setQuery] = useState('');

  // Flat list of all selectable workspace cards (for default-selection logic).
  const accessibleWorkspaces = useMemo(() => hierarchy.flatMap(g => g.cards), [hierarchy]);

  const wsName = (w: any) => w?.branchName || w?.name || '';

  const handleEnterWorkspace = async (companyId: string) => {
    if (!companyId) return;
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

  // Apply the search filter per group (keeps grouping intact).
  const filteredHierarchy = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hierarchy;
    return hierarchy
      .map(g => ({
        ...g,
        cards: g.cards.filter((c: any) =>
          wsName(c).toLowerCase().includes(q) || (g.companyName || '').toLowerCase().includes(q)),
      }))
      .filter(g => g.cards.length > 0);
  }, [hierarchy, query]);

  const totalCount = accessibleWorkspaces.length;
  const selectedWs = accessibleWorkspaces.find(w => String(w.id) === String(selectedId)) as any;
  const selectedGroup = hierarchy.find(g => g.cards.some((c: any) => String(c.id) === String(selectedId)));
  const initials = (user.name || user.username || 'U').trim().slice(0, 1).toUpperCase();

  if (isLoading || (companies.length === 0 && isLoading !== false)) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
        <div className="text-slate-400 text-sm font-medium">Loading your workspaces…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-7xl px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Enterprise HRMS</div>
              <div className="text-[11px] text-slate-400">Workspace access</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight hidden sm:block">
              <div className="text-sm font-medium">{user.name || user.username}</div>
              <div className="text-[11px] text-slate-400">{user.role}</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-800 ring-1 ring-white/10 flex items-center justify-center text-sm font-semibold text-indigo-300">
              {initials}
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-6 lg:px-10 py-8 lg:py-10 pb-32">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Select a workspace</h1>
            <p className="text-slate-400 mt-1.5 text-sm">
              Choose the company or branch you want to work in. You have access to{' '}
              <span className="text-slate-200 font-semibold">{totalCount}</span>{' '}
              workspace{totalCount === 1 ? '' : 's'}.
            </p>
          </div>
          {totalCount > 6 && (
            <div className="relative w-full lg:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search workspaces…"
                className="w-full bg-slate-900/70 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50"
              />
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-medium">
            {errorMsg}
          </div>
        )}
        {hierarchyError && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-medium">
            Workspace hierarchy could not be validated: {hierarchyError}
          </div>
        )}

        {/* Do not render the workspace grid until the hierarchy is valid. */}
        {!hierarchyError && (
          <div className="space-y-9">
            {filteredHierarchy.map(group => {
              const sortedBranches = [...group.cards].sort((a: any, b: any) => {
                const isAPrimary = user.companyId === a.id;
                const isBPrimary = user.companyId === b.id;
                if (isAPrimary) return -1;
                if (isBPrimary) return 1;
                return wsName(a).toLowerCase().localeCompare(wsName(b).toLowerCase());
              });

              return (
                <section key={group.companyId}>
                  {/* Group header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 ring-1 ring-white/10 flex items-center justify-center">
                      <Building2 size={16} className="text-slate-300" />
                    </div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                      {group.companyName}
                    </h2>
                    <span className="text-[11px] font-medium text-slate-400 bg-slate-800/80 rounded-full px-2 py-0.5 ring-1 ring-white/5">
                      {group.cards.length} {group.cards.length === 1 ? 'workspace' : 'workspaces'}
                    </span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>

                  {/* Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {sortedBranches.map((workspace: any) => {
                      const isSelected = String(selectedId) === String(workspace.id);
                      const isPrimary = workspace.id === user.companyId;
                      return (
                        <button
                          type="button"
                          key={workspace.id}
                          onClick={() => setSelectedId(workspace.id)}
                          onDoubleClick={() => handleEnterWorkspace(workspace.id)}
                          className={cn(
                            "group relative text-left rounded-2xl p-5 transition-all duration-150 ring-1 focus:outline-none",
                            isSelected
                              ? "bg-indigo-500/10 ring-2 ring-indigo-500 shadow-xl shadow-indigo-900/30"
                              : "bg-slate-900/60 ring-white/10 hover:ring-white/25 hover:bg-slate-800/60"
                          )}
                        >
                          {/* selected check */}
                          <div className={cn(
                            "absolute top-4 right-4 transition-opacity",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}>
                            <CheckCircle2 size={20} className="text-indigo-400" />
                          </div>

                          <div className={cn(
                            "w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-colors",
                            isSelected ? "bg-indigo-500/20 text-indigo-300" : "bg-slate-800 text-slate-400 group-hover:text-slate-200"
                          )}>
                            <MapPin size={20} />
                          </div>

                          <h3 className="text-base font-semibold tracking-tight text-white truncate pr-6">
                            {wsName(workspace)}
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{group.companyName}</p>

                          <div className="mt-4 flex items-center gap-2 min-h-[20px]">
                            {isPrimary && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-300 bg-amber-400/10 ring-1 ring-amber-400/20 rounded-full px-2 py-0.5">
                                <Star size={10} className="fill-amber-300" /> Primary
                              </span>
                            )}
                            <span className={cn(
                              "ml-auto text-xs font-medium transition-colors",
                              isSelected ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-300"
                            )}>
                              {isSelected ? 'Selected' : 'Click to select'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {filteredHierarchy.length === 0 && totalCount > 0 && (
              <div className="text-center text-slate-400 py-16">
                No workspaces match “{query}”.
              </div>
            )}
          </div>
        )}

        {totalCount === 0 && (
          <div className="flex flex-col items-center text-center gap-3 py-20">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 ring-1 ring-white/10 flex items-center justify-center">
              <LayoutGrid size={24} className="text-slate-500" />
            </div>
            <div className="text-slate-200 font-semibold">No workspaces assigned</div>
            <p className="text-slate-400 text-sm max-w-sm">
              Your account doesn’t have access to any company or branch yet. Please contact your administrator.
            </p>
          </div>
        )}
      </main>

      {/* ── Sticky action bar ───────────────────────────────────────────── */}
      {totalCount > 0 && (
        <footer className="fixed bottom-0 inset-x-0 z-10 border-t border-white/5 bg-slate-950/80 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-10 h-20 flex items-center justify-between gap-4">
            <div className="min-w-0">
              {selectedWs ? (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Selected workspace</div>
                  <div className="text-sm font-semibold text-white truncate">
                    {wsName(selectedWs)}
                    {selectedGroup && (
                      <span className="text-slate-400 font-normal"> · {selectedGroup.companyName}</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-400">Choose a workspace to continue</div>
              )}
            </div>
            <button
              onClick={() => handleEnterWorkspace(selectedId)}
              disabled={!selectedId || isEntering}
              className="shrink-0 px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl font-semibold text-sm flex items-center gap-2 shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isEntering ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entering…
                </>
              ) : (
                <>
                  Continue to Dashboard
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};
