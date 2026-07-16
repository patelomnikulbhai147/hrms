import React from 'react';
import { cn } from '@/utils/cn';
import { ArrowLeft } from 'lucide-react';
import type { Company } from '@/data/mockData';
import type { UserAccount, AppModules } from '@/pages/Login';
import { usePermissions } from '@/context/PermissionContext';
import { ZeniaLogo, BRAND_NAME } from '@/components/brand/ZeniaLogo';
import { CompanyBrand } from '@/components/brand/CompanyBrand';
import { resolveWorkspaceBranding } from '@/services/brandingService';
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
  /** Full company+branch list and the active workspace id — the sidebar resolves
   *  the owning company's branding from these (see resolveWorkspaceBranding). */
  companies?: Company[];
  activeCompanyId?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  role,
  collapsed,
  isMasquerading,
  onExitMasquerade,
  companies,
  activeCompanyId,
}) => {
  const { canView } = usePermissions();

  const branding = React.useMemo(
    () => resolveWorkspaceBranding(companies as any[], activeCompanyId),
    [companies, activeCompanyId],
  );

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
      'flex flex-col h-full transition-all duration-300 ease-in-out flex-shrink-0 z-20 relative',
      'bg-gradient-to-b from-[#1E293B] to-[#161F2E] text-slate-300',
      'shadow-[1px_0_0_rgba(15,23,42,0.06)]',
      collapsed ? 'w-[68px]' : 'w-64'
    )}>
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 h-[72px] border-b border-white/10 relative z-10', collapsed && 'justify-center px-0')}>
        {role === 'Super Admin' && !isMasquerading ? (
          <>
            <ZeniaLogo size={38} radius={220} className="rounded-[22%] shadow-[0_4px_14px_rgba(0,0,0,0.3)]" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-bold text-[#FFFFFF] leading-tight font-heading tracking-tight">
                  {BRAND_NAME}
                </p>
                <p className="text-[10px] text-brand-300 mt-0.5 uppercase tracking-widest font-bold">
                  SUPER ADMIN
                </p>
              </div>
            )}
          </>
        ) : (
          <CompanyBrand
            name={branding.name}
            logo={branding.logo}
            role={isMasquerading ? 'Masquerading' : role}
            compact={collapsed}
            tone="onDark"
          />
        )}
      </div>

      {/* Prominent Back to Super Admin Button when masquerading */}
      {isMasquerading && (
        <div className="px-3 py-3 border-b border-white/10 bg-amber-500/10 relative z-10">
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
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 relative z-10 sidebar-scroll">
        {visibleItems.map(item => {
          const active = currentPage === item.id;
          return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            title={collapsed ? item.label : undefined}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] tracking-tight transition-all duration-200 group active:scale-[0.98] relative',
              active
                ? 'bg-[#C77E52] text-white font-semibold shadow-[0_6px_16px_-4px_rgba(199,126,82,0.55)]'
                : 'text-[#E2E8F0] font-medium hover:bg-[rgba(199,126,82,0.15)] hover:text-white',
              collapsed && 'justify-center px-0'
            )}
          >
            <span className={cn(
              'flex-shrink-0 transition-all duration-200 group-hover:scale-105',
              active ? 'text-white' : 'text-[#CBD5E1] group-hover:text-[#E0996A]'
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
                className="flex-shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-[1px] text-[9px] font-bold leading-none bg-[#FDE68A] text-[#92400E]"
              >
                <span aria-hidden>🚧</span>Beta
              </span>
            )}
          </button>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-4 border-t border-white/10 bg-transparent relative z-10 flex flex-col gap-3">
          <p className="text-[10px] text-slate-500 font-bold tracking-wider">{BRAND_NAME}</p>
        </div>
      )}
    </aside>
  );
};
