import React from 'react';
import { cn } from '../../utils/cn';
import {
  LayoutDashboard, Users, Clock, CalendarDays, DollarSign,
  FileText, BarChart3, Settings, ChevronRight, Building2, ArrowLeft, CreditCard
} from 'lucide-react';
import type { Role } from '../../data/mockData';

export type PageId =
  | 'dashboard' | 'companies' | 'employees' | 'leaves' | 'payroll'
  | 'documents' | 'reports' | 'settings' | 'billing';

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ReactNode;
  roles: Role[];
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, roles: ['Super Admin', 'Company Head', 'HR'] },
  { id: 'companies', label: 'Companies', icon: <Building2 size={16} />, roles: ['Super Admin'] },
  { id: 'billing', label: 'SaaS Subscriptions', icon: <CreditCard size={16} />, roles: ['Super Admin'] },
  { id: 'employees', label: 'Employees', icon: <Users size={16} />, roles: ['Company Head', 'HR'] },
  { id: 'leaves', label: 'Leave Management', icon: <CalendarDays size={16} />, roles: ['Company Head', 'HR'] },
  { id: 'payroll', label: 'Payroll', icon: <DollarSign size={16} />, roles: ['Company Head', 'HR'] },
  { id: 'documents', label: 'Documents', icon: <FileText size={16} />, roles: ['Company Head', 'HR'] },
  { id: 'reports', label: 'Reports', icon: <BarChart3 size={16} />, roles: ['Company Head', 'HR'] },
  { id: 'settings', label: 'Settings', icon: <Settings size={16} />, roles: ['Super Admin', 'Company Head', 'HR'] },
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
      'flex flex-col bg-gray-900 text-gray-100 h-full transition-all duration-200 flex-shrink-0 z-20',
      collapsed ? 'w-14' : 'w-52'
    )}>
      {/* Logo */}
      <div className={cn('flex items-center gap-2.5 px-3 py-4 border-b border-gray-800', collapsed && 'justify-center px-0')}>
        <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center">
          <Building2 size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-sm font-bold text-white leading-tight font-sans">SaaS HRMS</p>
            <p className="text-[9px] text-gray-400 mt-0.5 uppercase tracking-wider">
              {isMasquerading ? 'Masquerading' : role}
            </p>
          </div>
        )}
      </div>

      {/* Prominent Back to Super Admin Button when masquerading */}
      {isMasquerading && (
        <div className="px-2 py-2 border-b border-gray-800 bg-amber-600/20">
          <button
            onClick={onExitMasquerade}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-bold bg-amber-600 text-white hover:bg-amber-500 transition-colors shadow-sm",
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
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleItems.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            title={collapsed ? item.label : undefined}
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors group',
              currentPage === item.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100',
              collapsed && 'justify-center px-0'
            )}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!collapsed && <span className="flex-1 text-left text-xs font-medium">{item.label}</span>}
            {!collapsed && currentPage === item.id && <ChevronRight size={12} className="text-blue-300" />}
          </button>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-3 py-3 border-t border-gray-800">
          <p className="text-[10px] text-gray-500">v3.1.0 — HR SaaS</p>
        </div>
      )}
    </aside>
  );
};
