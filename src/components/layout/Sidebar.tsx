import React from 'react';
import { cn } from '../../utils/cn';
import {
  LayoutDashboard, Users, CalendarDays, DollarSign,
  FileText, BarChart3, Settings, ChevronRight, Building2, ArrowLeft, CreditCard, ShieldCheck
} from 'lucide-react';
import type { Role } from '../types';
import type { UserAccount, AppModules } from '../../pages/Login';
import type { Company } from '../types';
import { usePermissions } from '../../context/PermissionContext';
import { getCompanyInitials } from '../../utils/workspaceUtils';

export type PageId =
  | 'select-workspace' | 'dashboard' | 'companies' | 'employees' | 'leaves' | 'payroll' | 'attendance'
  | 'documents' | 'reports' | 'settings' | 'billing' | 'users';

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ReactNode;
  roles: Role[];
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} />, roles: ['Super Admin', 'Company Head', 'HR', 'Finance'] },
  { id: 'companies', label: 'Companies', icon: <Building2 size={15} />, roles: ['Super Admin'] },
  { id: 'billing', label: 'SaaS Subscriptions', icon: <CreditCard size={15} />, roles: ['Super Admin'] },
  { id: 'employees', label: 'Employees', icon: <Users size={15} />, roles: ['Company Head', 'HR', 'Finance'] },
  { id: 'leaves', label: 'Leave Management', icon: <CalendarDays size={15} />, roles: ['Company Head', 'HR'] },
  { id: 'payroll', label: 'Payroll', icon: <DollarSign size={15} />, roles: ['Company Head', 'HR', 'Finance', 'Employee'] },
  { id: 'documents', label: 'Documents', icon: <FileText size={15} />, roles: ['Company Head', 'HR', 'Finance'] },
  { id: 'reports', label: 'Reports', icon: <BarChart3 size={15} />, roles: ['Company Head', 'HR', 'Finance'] },
  { id: 'settings', label: 'Settings', icon: <Settings size={15} />, roles: ['Super Admin', 'Company Head', 'HR', 'Finance', 'Employee'] },
  { id: 'users', label: 'Users', icon: <ShieldCheck size={15} />, roles: ['Super Admin'] },
];

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
  theme = 'dark',
  toggleTheme,
  authProfile,
  currentCompany
}) => {
  const { canView } = usePermissions();

  const visibleItems = navItems.filter(item => {
    // Rely completely on our central permission context for view access
    // This accurately handles Super Admin vs regular users, module disabling, and missing module matrices
    return canView(item.id as AppModules) && item.roles.includes(role);
  });

  return (
    <aside className={cn(
      'flex flex-col bg-[#080b11] text-slate-100 h-full transition-all duration-300 ease-in-out flex-shrink-0 z-20 border-r border-slate-900/60 shadow-2xl relative',
      collapsed ? 'w-14' : 'w-56'
    )}>
      {/* Dynamic Radial Ambient Glow in background */}
      <div className="absolute top-0 left-0 w-full h-40 bg-radial-gradient from-blue-500/5 to-transparent pointer-events-none" />

      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-slate-900/60 relative z-10', collapsed && 'justify-center px-0')}>
        {role === 'Super Admin' && !isMasquerading ? (
          <>
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.4)] border border-white/20 backdrop-blur-md relative overflow-hidden">
              <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity" />
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.5)]" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                <p className="text-[15px] font-bold text-white leading-tight font-sans tracking-wide">
                  HRMate
                </p>
                <p className="text-[9px] text-indigo-300 mt-0.5 uppercase tracking-[0.15em] font-bold">
                  SUPER ADMIN
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/10 active:scale-95 transition-all overflow-hidden" style={!currentCompany?.logoImage ? { backgroundColor: currentCompany?.primaryColor || '#4f46e5' } : {}}>
              {currentCompany?.logoImage ? (
                <img src={currentCompany.logoImage} alt="Logo" className="w-full h-full object-contain p-0.5" />
              ) : (
                <span className="text-white font-bold text-xs">{getCompanyInitials(currentCompany?.name)}</span>
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold text-white leading-tight font-sans tracking-tight uppercase truncate" title={currentCompany?.headerText || currentCompany?.name || 'SaaS HRMS'}>
                  {currentCompany?.headerText || currentCompany?.name || 'SaaS HRMS'}
                </p>
                <p className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider font-extrabold">
                  {isMasquerading ? 'Masquerading' : role}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Prominent Back to Super Admin Button when masquerading */}
      {isMasquerading && (
        <div className="px-3 py-2.5 border-b border-slate-900/60 bg-amber-500/5 relative z-10">
          <button
            onClick={onExitMasquerade}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 transition-all duration-200 shadow-md shadow-amber-950/40 active:scale-[0.97]",
              collapsed && "justify-center px-0"
            )}
            title="Go Back to Super Admin"
          >
            <ArrowLeft size={13} className="flex-shrink-0" />
            {!collapsed && <span>Exit Masquerade</span>}
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-1 relative z-10">
        {visibleItems.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            title={collapsed ? item.label : undefined}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all duration-200 group active:scale-[0.98]',
              currentPage === item.id
                ? 'bg-gradient-to-r from-blue-600/90 to-indigo-600/90 text-white shadow-lg shadow-blue-500/10 border border-blue-500/10'
                : 'text-slate-500 hover:bg-slate-900/40 hover:text-slate-100 hover:pl-4',
              collapsed && 'justify-center px-0 hover:pl-0'
            )}
          >
            <span className={cn('flex-shrink-0 transition-transform duration-200 group-hover:scale-110', currentPage === item.id ? 'text-white' : 'text-slate-400')}>{item.icon}</span>
            {!collapsed && (
              <span className="flex-1 text-left">
                {item.id === 'payroll' && role === 'Employee' ? 'My Payslips' : item.label}
              </span>
            )}
            {!collapsed && currentPage === item.id && <ChevronRight size={11} className="text-blue-200 animate-pulse" />}
          </button>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-slate-900/60 bg-slate-950/20 relative z-10 flex flex-col gap-3">
          <p className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider">v3.1.0 — HR SaaS</p>
          <div className="flex items-center gap-2.5">
            <div 
              onClick={toggleTheme}
              className="w-9 h-5 bg-slate-800 rounded-full p-0.5 flex items-center relative cursor-pointer border border-slate-700 shadow-inner hover:border-blue-500/50 transition-all active:scale-95 group"
            >
              <div 
                className={cn(
                  "w-4 h-4 rounded-full absolute transition-all duration-300 shadow-sm", 
                  theme === 'light' ? 'left-4 bg-amber-400' : 'left-0.5 bg-slate-300'
                )}
              />
              <div className="w-full flex justify-between px-1 text-[8px] text-slate-500 relative z-10 pointer-events-none transition-opacity">
                <span className={cn("transition-opacity duration-300", theme === 'light' ? 'opacity-100' : 'opacity-0')}>☀️</span>
                <span className={cn("transition-opacity duration-300", theme === 'dark' ? 'opacity-100' : 'opacity-0')}>🌙</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
