import React, { useMemo, useEffect, useState } from 'react';
import { Company } from '@/types';
import { Building2, ArrowRight, MapPin, Star, LayoutGrid, Search } from 'lucide-react';
import type { UserAccount } from '@/pages/Login';
import { cn } from '@/utils/cn';
import { buildWorkspaceHierarchy, logWorkspaceAudit } from '@/utils/workspaceUtils';
import { ZeniaLogo } from '@/components/brand/ZeniaLogo';

// Header brand mark. Renders a custom branding image when one exists, and always
// falls back to the default ZeniaHR logo so the header is never broken/blank/missing.
// Fixed 36×36 box (object-contain) so the logo never stretches and the header
// layout doesn't shift while an image loads.
const BrandLogo: React.FC<{ src?: string }> = ({ src }) => {
  const [failed, setFailed] = useState(false);
  const useImg = !!src && !failed;
  return (
    <div className="w-9 h-9 shrink-0 flex items-center justify-center">
      {useImg ? (
        <img
          src={src}
          alt="ZeniaHR logo"
          className="w-full h-full object-contain rounded-xl bg-white ring-1 ring-slate-200 shadow-sm"
          onError={() => setFailed(true)}
        />
      ) : (
        <ZeniaLogo size={36} radius={200} className="w-full h-full rounded-xl shadow-sm ring-1 ring-black/[0.06]" />
      )}
    </div>
  );
};

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
  const [collapsedCompanies, setCollapsedCompanies] = useState<Record<string, boolean>>({});

  // Flat list of all selectable workspace cards (for default-selection logic).
  const accessibleWorkspaces = useMemo(() => hierarchy.flatMap(g => g.cards), [hierarchy]);

  // Resolved, branch-aware set of workspace ids the user may enter. Contains a
  // COMPANY id only for company-level access — so a branch-only user can never
  // enter the company (its header stays a plain, non-clickable label).
  const accessibleIds = useMemo(
    () => ((user.accessibleCompanyIds as string[]) || []).map(String),
    [user],
  );
  const canEnterCompany = (companyId: string | number) => accessibleIds.includes(String(companyId));

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

  const toggleCompany = (companyId: string) => {
    setCollapsedCompanies(prev => ({
      ...prev,
      [companyId]: !prev[companyId],
    }));
  };

  const totalCount = accessibleWorkspaces.length;
  const selectedWs = accessibleWorkspaces.find(w => String(w.id) === String(selectedId)) as any;
  const selectedGroup = hierarchy.find(g => g.cards.some((c: any) => String(c.id) === String(selectedId)));
  const initials = (user.name || user.username || 'U').trim().slice(0, 1).toUpperCase();

  // Header branding source: a custom logo image from the user's primary company
  // if one is set, otherwise the default ZeniaHR mark (handled by BrandLogo).
  const brandLogoSrc = (companies.find(c => String(c.id) === String(user.companyId)) as any)?.logoImage || undefined;

  if (isLoading || (companies.length === 0 && isLoading !== false)) {
    return (
      <div className="min-h-screen bg-gradient-to-tr from-[#FAF8F5] via-white to-[#F6F3EE] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-[#B8743C]/20 border-t-[#B8743C] rounded-full animate-spin" />
        <div className="text-[#6B7280] text-xs font-bold uppercase tracking-wider">Loading your workspaces…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-tr from-[#FAF8F5] via-white to-[#F6F3EE] text-[#1E2A44] font-sans antialiased">
      {/* ── Top Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[#ECECEC] bg-white/80 backdrop-blur-md shadow-sm">
        <div className="mx-auto w-full max-w-7xl px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo src={brandLogoSrc} />
            <div className="leading-tight min-w-0">
              <div className="text-sm font-bold tracking-tight text-[#1E2A44] truncate">Enterprise HRMS</div>
              <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider truncate">Workspace Access</div>
            </div>
          </div>
          <div className="flex items-center gap-3 select-none cursor-pointer group">
            <div className="text-right leading-tight hidden sm:block">
              <div className="text-sm font-semibold text-[#1E2A44] group-hover:text-[#B8743C] transition-colors duration-200">
                {user.name || user.username}
              </div>
              <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                {user.role}
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-[#F8F1EA] border border-[#ECECEC] flex items-center justify-center text-sm font-bold text-[#B8743C] shadow-sm transition-transform duration-200 group-hover:scale-105">
              {initials}
            </div>
            <svg 
              className="w-4 h-4 text-[#6B7280] transition-transform duration-200 group-hover:translate-y-0.5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </header>

      {/* ── Main content body ─────────────────────────────────────────────── */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-8 py-10 pb-36">
        
        {/* Title and Search box area */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[#ECECEC] mb-8">
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight text-[#1E2A44]">Select a workspace</h1>
            <p className="text-[#6B7280] mt-2 text-sm font-medium">
              Choose the company or branch you want to work in. You have access to{' '}
              <span className="text-[#B8743C] font-semibold">{totalCount}</span> workspace{totalCount === 1 ? '' : 's'}.
            </p>
          </div>
          
          {totalCount > 0 && (
            <div className="relative w-full md:w-80 shadow-[0_2px_8px_rgba(0,0,0,0.02)] rounded-full">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search workspaces..."
                className="w-full bg-white border border-[#ECECEC] rounded-full pl-11 pr-4 py-2.5 text-sm text-[#1E2A44] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#B8743C]/20 focus:border-[#B8743C] transition-all duration-200"
              />
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold uppercase tracking-wider shadow-sm">
            ⚠️ {errorMsg}
          </div>
        )}
        {hierarchyError && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold uppercase tracking-wider shadow-sm">
            ⚠️ Workspace hierarchy could not be validated: {hierarchyError}
          </div>
        )}

        {/* Do not render the workspace grid until the hierarchy is valid. */}
        {!hierarchyError && (
          <div className="space-y-8">
            {filteredHierarchy.map(group => {
              const isCollapsed = !!collapsedCompanies[group.companyId];
              const sortedBranches = [...group.cards].sort((a: any, b: any) => {
                const isAPrimary = user.companyId === a.id;
                const isBPrimary = user.companyId === b.id;
                if (isAPrimary) return -1;
                if (isBPrimary) return 1;
                return wsName(a).toLowerCase().localeCompare(wsName(b).toLowerCase());
              });

              // Company-level access → the company itself is enterable.
              const companyAccess = !group.isCompanyOnly && canEnterCompany(group.companyId);

              return (
                <section key={group.companyId} className="transition-all duration-300">
                  {/* Group Header */}
                  <div 
                    onClick={() => toggleCompany(group.companyId)}
                    className="flex items-center justify-between gap-4 py-3 cursor-pointer group/header select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#F8F1EA] border border-[#ECECEC] flex items-center justify-center text-[#B8743C] transition-all duration-300 group-hover/header:bg-[#B8743C] group-hover/header:text-white">
                        <Building2 size={16} />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        {companyAccess ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation(); // Avoid triggering collapse toggle
                              handleEnterWorkspace(group.companyId);
                            }}
                            title="Open the company workspace (consolidated, all branches)"
                            className="group/comp flex items-center gap-2 text-left"
                          >
                            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1E2A44] group-hover/comp:text-[#B8743C] transition-colors duration-200">
                              {group.companyName}
                            </h2>
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-[#B8743C] opacity-0 group-hover/comp:opacity-100 transition-opacity duration-200">
                              (Enter <ArrowRight size={10} strokeWidth={2.5} />)
                            </span>
                          </button>
                        ) : (
                          <h2 className="text-sm font-bold uppercase tracking-wider text-[#1E2A44]">
                            {group.companyName}
                          </h2>
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#B8743C] bg-[#F8F1EA] border border-[#ECECEC] rounded-full px-2 py-0.5 whitespace-nowrap">
                          {group.cards.length} {group.cards.length === 1 ? 'Workspace' : 'Workspaces'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-px bg-[#ECECEC] flex-1" />
                      <svg 
                        className={cn(
                          "w-5 h-5 text-[#6B7280] transition-transform duration-300",
                          isCollapsed ? "" : "rotate-180"
                        )}
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor" 
                        strokeWidth="2.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Cards Grid */}
                  <div className={cn(
                    "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 transition-all duration-300 overflow-hidden",
                    isCollapsed ? "max-h-0 opacity-0 py-0" : "max-h-[1000px] opacity-100 py-3"
                  )}>
                    {sortedBranches.map((workspace: any) => {
                      const isSelected = String(selectedId) === String(workspace.id);
                      const isPrimary = workspace.id === user.companyId;
                      
                      // Curated professional colors mapping:
                      // Deep Navy (#1E2A44), Bronze (#B8743C), Slate (#4F6D9C), Indigo (#6B5EDB)
                      const colors = [
                        { bg: 'bg-[#1E2A44]/[0.06]', text: 'text-[#1E2A44]' },
                        { bg: 'bg-[#B8743C]/[0.08]', text: 'text-[#B8743C]' },
                        { bg: 'bg-[#4F6D9C]/[0.08]', text: 'text-[#4F6D9C]' },
                        { bg: 'bg-[#6B5EDB]/[0.08]', text: 'text-[#6B5EDB]' },
                      ];
                      const colorIndex = Math.abs(parseInt(String(workspace.id)) || 0) % colors.length;
                      const cardColor = colors[colorIndex];

                      return (
                        <div
                          key={workspace.id}
                          onClick={() => setSelectedId(workspace.id)}
                          onDoubleClick={() => handleEnterWorkspace(workspace.id)}
                          className={cn(
                            "group relative text-left rounded-[18px] p-5 transition-all duration-300 border bg-white cursor-pointer select-none",
                            isSelected
                              ? "border-[#B8743C] shadow-[0_8px_20px_rgba(184,116,60,0.12)] -translate-y-1"
                              : "border-[#ECECEC] shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-[#B8743C]/50 hover:shadow-[0_8px_20px_rgba(0,0,0,0.04)] hover:-translate-y-1"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-300",
                              isSelected ? "bg-[#B8743C] text-white" : cardColor.bg + " " + cardColor.text
                            )}>
                              <MapPin size={18} />
                            </div>

                            {isSelected ? (
                              <div className="w-5 h-5 rounded-full bg-[#B8743C] flex items-center justify-center text-white shadow-sm animate-fade-in">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            ) : isPrimary ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[#B8743C] bg-[#F8F1EA] border border-[#B8743C]/20 rounded-full px-2 py-0.5">
                                <Star size={8} className="fill-[#B8743C] text-[#B8743C]" /> Primary
                              </span>
                            ) : null}
                          </div>

                          <h3 className="text-sm font-bold tracking-tight text-[#1E2A44] truncate group-hover:text-[#B8743C] transition-colors duration-200">
                            {wsName(workspace)}
                          </h3>
                          <p className="text-[11px] font-semibold text-[#6B7280] mt-0.5 truncate uppercase tracking-wider">
                            {group.companyName}
                          </p>

                          <div className="mt-6 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
                            <span className={cn(
                              "transition-colors duration-200",
                              isSelected ? "text-[#B8743C]" : "text-[#6B7280] group-hover:text-[#1E2A44]"
                            )}>
                              {isSelected ? "Selected" : "Click to select"}
                            </span>
                            
                            <span className={cn(
                              "transition-all duration-300 flex items-center gap-0.5",
                              isSelected 
                                ? "text-[#B8743C] translate-x-0" 
                                : "text-[#B8743C] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0"
                            )}>
                              Select <ArrowRight size={12} strokeWidth={2.5} />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {filteredHierarchy.length === 0 && totalCount > 0 && (
              <div className="text-center text-[#6B7280] py-16 text-sm font-semibold uppercase tracking-wider">
                No workspaces match “{query}”.
              </div>
            )}
          </div>
        )}

        {totalCount === 0 && (
          <div className="flex flex-col items-center text-center gap-4 py-20">
            <div className="w-14 h-14 rounded-2xl bg-white border border-[#ECECEC] shadow-sm flex items-center justify-center text-[#6B7280]">
              <LayoutGrid size={24} />
            </div>
            <div className="text-[#1E2A44] font-bold text-lg">No workspaces assigned</div>
            <p className="text-[#6B7280] text-sm max-w-sm font-medium">
              Your account doesn’t have access to any company or branch yet. Please contact your administrator.
            </p>
          </div>
        )}
      </main>

      {/* ── Sticky action bar footer ────────────────────────────────────── */}
      {totalCount > 0 && (
        <footer className="fixed bottom-0 inset-x-0 z-40 border-t border-[#ECECEC] bg-white/85 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
          <div className="mx-auto w-full max-w-7xl px-8 h-20 flex items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[#B8743C] text-sm animate-pulse">✨</span>
                <div className="text-xs font-bold uppercase tracking-wider text-[#1E2A44] truncate">
                  {selectedWs ? wsName(selectedWs) : "Choose a workspace to continue"}
                </div>
              </div>
              <div className="text-[11px] font-medium text-[#6B7280] mt-0.5">
                {selectedWs && selectedGroup ? `Consolidated under ${selectedGroup.companyName}. ` : ""}You can switch between workspaces anytime.
              </div>
            </div>
            <button
              onClick={() => handleEnterWorkspace(selectedId)}
              disabled={!selectedId || isEntering}
              className="shrink-0 px-6 py-3.5 bg-gradient-to-r from-[#B8743C] to-[#995E2F] hover:from-[#c28148] hover:to-[#a86a37] text-white rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_4px_12px_rgba(184,116,60,0.20)] hover:shadow-[0_6px_20px_rgba(184,116,60,0.30)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none"
            >
              {isEntering ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entering…
                </>
              ) : (
                <>
                  Continue to Dashboard
                  <ArrowRight size={14} strokeWidth={2.5} />
                </>
              )}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};
