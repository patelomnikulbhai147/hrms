import React from 'react';
import { cn } from '@/utils/cn';
import {
  ChevronRight, Building2, ArrowLeft,
} from 'lucide-react';
import type { Company } from '@/data/mockData';
import type { UserAccount, AppModules } from '@/pages/Login';
import { usePermissions } from '@/context/PermissionContext';
import { getCompanyInitials } from '@/utils/workspaceUtils';
import { MODULE_REGISTRY, type PageId } from '@/config/moduleRegistry';
import type { Role } from '@/data/mockData';

// PageId is defined in the single module registry (config/moduleRegistry) and
// re-exported here so existing importers (App.tsx) keep working unchanged.
export type { PageId };

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  role: Role;
  collapsed: boolean;
  isMasquerading?: boolean;
  onExitMasquerade?: () => void;
  theme?: 'dark' | 'light';
  toggleTheme?: () => void;
  authProfile?: UserAccount | null;
  currentCompany?: Company;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  role,
  collapsed,
  isMasquerading,
  onExitMasquerade,
  currentCompany
}) => {
  const { canView } = usePermissions();

  // Navigation is derived from the single module registry (config/moduleRegistry)
  // — the same source the permission matrices use — so the sidebar and the
  // matrices can never drift out of sync.
  const visibleItems = MODULE_REGISTRY.filter(item => {
    // Modules folded into a parent sidebar entry (e.g. Loans & Compliance now
    // live under "Finance & Compliance") stay out of the nav, but remain in the
    // permission matrices via their registry rows.
    if (item.hideInSidebar) {
      return false;
    }

    // Hide specific modules from Super Admin navigation only
    if (role === 'Super Admin') {
      const excludedIds: string[] = ['tasks', 'attendance-integration', 'audit', 'gallery'];
      if (excludedIds.includes(item.id)) {
        return false;
      }
    }

    // Communication Center is a company-internal HR module — never shown to the
    // Super Admin, including a Super Admin masquerading into a company (only a
    // Super Admin can masquerade, so isMasquerading implies the real user is one).
    if (item.id === 'communication' && (role === 'Super Admin' || isMasquerading)) {
      return false;
    }

    // Rely completely on our central permission context for view access.
    // The registry's `permission` key already folds sub-features onto their
    // parent module (Employee Cards → employees, Attendance Devices → attendance),
    // so gating is identical to before — no dedicated matrix row needed for them.
    // A module may aggregate several sub-modules — show it if the user can VIEW
    // ANY of its `anyPermission` keys (OR-logic); otherwise fall back to the
    // single governing `permission` key.
    const permKeys = (item.anyPermission ?? [item.permission]) as AppModules[];
    const canSee = permKeys.some(k => canView(k));
    return canSee && item.roles.includes(role as Role);
  });

  return (
    <aside className={cn(
      'flex flex-col bg-gradient-to-br from-[#E8F4FF] via-white to-[#E0EFFF] text-[#4B5563] h-full transition-all duration-300 ease-in-out flex-shrink-0 z-20 border-r border-[#E5E7EB] shadow-sm relative',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-[#E5E7EB] relative z-10', collapsed && 'justify-center px-0')}>
        {role === 'Super Admin' && !isMasquerading ? (
          <>
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#4F7CFF] flex items-center justify-center shadow-[0_4px_10px_rgba(79,124,255,0.2)]">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 5v14M13 5v14M6 12h7M13 5c3.5 0 5 1.5 5 3.5S16.5 12 13 12M13 12l4.5 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="6" cy="5" r="1.5" fill="currentColor" />
                <circle cx="6" cy="19" r="1.5" fill="currentColor" />
                <circle cx="13" cy="5" r="1.5" fill="currentColor" />
                <circle cx="13" cy="19" r="1.5" fill="currentColor" />
                <circle cx="13" cy="12" r="1.5" fill="currentColor" />
                <circle cx="17.5" cy="19" r="1.5" fill="currentColor" />
              </svg>
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-bold text-[#111827] leading-tight font-sans tracking-wide">
                  HRMate
                </p>
                <p className="text-[10px] text-[#4F7CFF] mt-0.5 uppercase tracking-widest font-bold">
                  SUPER ADMIN
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div 
              className="flex-shrink-0 w-12 h-12 bg-[#F7FAFF] border border-[#E5EFFF] rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-all overflow-hidden" 
              style={(!currentCompany?.logoImage && currentCompany?.primaryColor) ? { backgroundColor: currentCompany.primaryColor, borderColor: currentCompany.primaryColor } : {}}
            >
              {currentCompany?.logoImage ? (
                <img src={currentCompany.logoImage} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                getCompanyInitials(currentCompany?.name) === '??' ? (
                  <Building2 size={20} className="text-[#4F7CFF]" />
                ) : (
                  <span className="text-[#4F7CFF] font-bold text-sm">{getCompanyInitials(currentCompany?.name)}</span>
                )
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-[#111827] leading-tight font-sans truncate" title={currentCompany?.headerText || currentCompany?.name || 'Company Name'}>
                  {currentCompany?.headerText || currentCompany?.name || 'Company Name'}
                </p>
                <p className="text-[11px] text-[#6B7280] mt-0.5 font-semibold">
                  {isMasquerading ? 'Masquerading' : role}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Prominent Back to Super Admin Button when masquerading */}
      {isMasquerading && (
        <div className="px-4 py-3 border-b border-[#E5E7EB] bg-[#FDF6B2] relative z-10">
          <button
            onClick={onExitMasquerade}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-[#F59E0B] text-white hover:bg-[#D97706] transition-all duration-200 shadow-sm active:scale-[0.97]",
              collapsed && "justify-center px-0"
            )}
            title="Go Back to Super Admin"
          >
            <ArrowLeft size={14} className="flex-shrink-0" />
            {!collapsed && <span>Exit Masquerade</span>}
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-1.5 relative z-10">
        {visibleItems.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            title={collapsed ? item.label : undefined}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold tracking-wide transition-all duration-200 group active:scale-[0.98]',
              currentPage === item.id
                ? 'bg-[#EDF4FF] text-[#4F7CFF]'
                : 'text-[#4B5563] hover:bg-[#D1E0FF]/40 hover:text-[#111827]',
              collapsed && 'justify-center px-0'
            )}
          >
            <span className={cn(
              'flex-shrink-0 transition-transform duration-200 group-hover:scale-110', 
              currentPage === item.id 
                ? 'text-[#4F7CFF]' 
                : 'text-[#6B7280] group-hover:text-[#4F7CFF]'
            )}>{item.icon}</span>
            {!collapsed && (
              <span className="flex-1 text-left min-w-0">
                {item.id === 'payroll' && role === 'Employee' ? 'My Payslips'
                  : item.label}
              </span>
            )}
            {/* Development-status badge — informational only, not clickable. Driven by
                the registry `beta` flag so it stays in sync with the module's in-page
                "Work in Progress" banner and vanishes automatically once the flag is
                removed at production-readiness. Hidden when the rail is collapsed. */}
            {!collapsed && item.beta && (
              <span
                aria-label="Under active development"
                title="Under active development"
                className="flex-shrink-0 inline-flex items-center gap-0.5 rounded-full border border-amber-300/60 bg-amber-100 px-1.5 py-[1px] text-[9px] font-bold leading-none text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/15 dark:text-amber-300"
              >
                <span aria-hidden>🚧</span>Beta
              </span>
            )}
            {!collapsed && currentPage === item.id && <ChevronRight size={14} className="flex-shrink-0 text-[#4F7CFF]/80" />}
          </button>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-4 border-t border-[#E5E7EB] bg-transparent relative z-10 flex flex-col gap-3">
          <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-wider">v3.1.0 — HR SaaS</p>
        </div>
      )}
    </aside>
  );
};
