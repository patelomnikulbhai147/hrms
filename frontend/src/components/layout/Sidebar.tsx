import React from 'react';
import { cn } from '@/utils/cn';
import {
  LayoutDashboard, Users, CalendarDays, DollarSign,
  FileText, BarChart3, Settings, ChevronRight, Building2, ArrowLeft, CreditCard, ShieldCheck, CalendarCheck,
  ClipboardList, Briefcase, History, IdCard, Fingerprint
} from 'lucide-react';
import type { Role, Company } from '@/data/mockData';
import type { UserAccount, AppModules } from '@/pages/Login';
import { usePermissions } from '@/context/PermissionContext';
import { getCompanyInitials } from '@/utils/workspaceUtils';

export type PageId =
  | 'select-workspace' | 'dashboard' | 'companies' | 'employee-cards' | 'employees' | 'leaves' | 'payroll' | 'bonus' | 'attendance'
  | 'attendance-devices' | 'documents' | 'reports' | 'settings' | 'billing' | 'users' | 'tasks' | 'tenders' | 'audit';

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
  { id: 'employee-cards', label: 'Employee Cards', icon: <IdCard size={15} />, roles: ['Company Head', 'HR'] },
  { id: 'attendance', label: 'Attendance', icon: <CalendarCheck size={15} />, roles: ['Company Head', 'HR', 'Finance', 'Employee'] },
  { id: 'attendance-devices', label: 'Attendance Devices', icon: <Fingerprint size={15} />, roles: ['Super Admin', 'Company Head', 'HR'] },
  { id: 'leaves', label: 'Leave Management', icon: <CalendarDays size={15} />, roles: ['Company Head', 'HR'] },
  { id: 'payroll', label: 'Payroll', icon: <DollarSign size={15} />, roles: ['Company Head', 'HR', 'Finance', 'Employee'] },
  // Standalone "Bonus Management" removed — bonuses are now handled inside
  // Employee Management + Payroll. The statutory engine (Form C/D) is retained
  // for compliance but no longer a daily-operations menu item.
  { id: 'documents', label: 'Documents', icon: <FileText size={15} />, roles: ['Company Head', 'HR', 'Finance'] },
  { id: 'reports', label: 'Reports', icon: <BarChart3 size={15} />, roles: ['Super Admin', 'Company Head', 'HR'] },
  { id: 'tasks', label: 'Task Manager', icon: <ClipboardList size={15} />, roles: ['Super Admin', 'Company Head', 'HR', 'Finance', 'Employee'] },
  { id: 'tenders', label: 'Tender Information', icon: <Briefcase size={15} />, roles: ['Super Admin', 'Company Head', 'HR'] },
  // Settings is COMPANY-specific (profile, payroll, branding, departments, roles)
  // — not a platform concern. It is intentionally hidden from the Super Admin
  // root menu; a Super Admin configures a company's settings by entering that
  // company (masquerade), where the role resolves to Company Head and Settings
  // appears. Platform configuration lives under Companies / Subscriptions.
  { id: 'settings', label: 'Settings', icon: <Settings size={15} />, roles: ['Company Head', 'HR', 'Finance', 'Employee'] },
  { id: 'users', label: 'Users', icon: <ShieldCheck size={15} />, roles: ['Super Admin'] },
  { id: 'audit', label: 'Audit Trail', icon: <History size={15} />, roles: ['Super Admin'] },
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
  currentCompany
}) => {
  const { canView } = usePermissions();

  const visibleItems = navItems.filter(item => {
    // Rely completely on our central permission context for view access
    // This accurately handles Super Admin vs regular users, module disabling, and missing module matrices.
    // Employee Cards is a sub-feature of the Employees module — gate it on the
    // same permission so it never needs its own permission-matrix row.
    // Employee Cards and Attendance Devices are sub-features that ride on the
    // Employees / Attendance permission rows (no dedicated permission matrix).
    const permKey = (item.id === 'employee-cards' ? 'employees'
      : item.id === 'attendance-devices' ? 'attendance'
      : item.id === 'bonus' ? 'payroll'
      : item.id) as AppModules;
    return canView(permKey) && item.roles.includes(role);
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
              <span className="flex-1 text-left">
                {item.id === 'payroll' && role === 'Employee' ? 'My Payslips' : item.label}
              </span>
            )}
            {!collapsed && currentPage === item.id && <ChevronRight size={14} className="text-[#4F7CFF]/80" />}
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
