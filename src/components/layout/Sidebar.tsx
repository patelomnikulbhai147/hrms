import React from 'react';
import { cn } from '../../utils/cn';
import {
  LayoutDashboard, Users, CalendarDays, DollarSign,
  FileText, BarChart3, Settings, ChevronRight, Building2, ArrowLeft, CreditCard
} from 'lucide-react';
import type { Role } from '../../data/mockData';

export type PageId =
  | 'dashboard' | 'companies' | 'employees' | 'leaves' | 'payroll' | 'attendance'
  | 'documents' | 'reports' | 'settings' | 'billing';

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
];

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  role: Role;
  collapsed: boolean;
  isMasquerading?: boolean;
  onExitMasquerade?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  role,
  collapsed,
  isMasquerading,
  onExitMasquerade
}) => {
  const visibleItems = navItems.filter(item => item.roles.includes(role));

  return (
    <aside className={cn(
      'flex flex-col bg-[#080b11] text-slate-100 h-full transition-all duration-300 ease-in-out flex-shrink-0 z-20 border-r border-slate-900/60 shadow-2xl relative',
      collapsed ? 'w-14' : 'w-56'
    )}>
      {/* Dynamic Radial Ambient Glow in background */}
      <div className="absolute top-0 left-0 w-full h-40 bg-radial-gradient from-blue-500/5 to-transparent pointer-events-none" />

      {/* Logo */}
      <div className={cn('flex items-center gap-2.5 px-4 py-5 border-b border-slate-900/60 relative z-10', collapsed && 'justify-center px-0')}>
        <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/10 active:scale-95 transition-all">
          <Building2 size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-xs font-extrabold text-white leading-tight font-sans tracking-tight uppercase">SaaS HRMS</p>
            <p className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider font-extrabold">
              {isMasquerading ? 'Masquerading' : role}
            </p>
          </div>
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
        <div className="px-4 py-3 border-t border-slate-900/60 bg-slate-950/20 relative z-10">
          <p className="text-[9px] text-slate-600 font-extrabold uppercase tracking-wider">v3.1.0 — HR SaaS</p>
        </div>
      )}
    </aside>
  );
};
