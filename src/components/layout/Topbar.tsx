import React, { useState } from 'react';
import { Menu, Bell, ChevronDown, LogOut, ShieldAlert } from 'lucide-react';
import { notifications, type Role, type Company } from '../../data/mockData';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';

interface TopbarProps {
  onToggleSidebar: () => void;
  role: Role;
  onRoleChange: (role: Role) => void;
  onCompanyChange?: (companyId: string) => void;
  activeCompanyId: string;
  isMasquerading: boolean;
  onExitMasquerade: () => void;
  userName: string;
  userAvatar: string;
  pageTitle: string;
  companies: Company[];
}

export const Topbar: React.FC<TopbarProps> = ({
  onToggleSidebar,
  role,
  onRoleChange,
  onCompanyChange,
  activeCompanyId,
  isMasquerading,
  onExitMasquerade,
  userName,
  userAvatar,
  pageTitle,
  companies
}) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // If masquerading, role is forced to Company Head
  const activeRole = isMasquerading ? 'Company Head' : role;
  const currentCompany = companies.find(c => c.id === activeCompanyId);

  // Filter notifications by company if not Super Admin
  const companyNotifs = activeRole === 'Super Admin'
    ? notifications
    : notifications.filter(n => !n.companyId || n.companyId === activeCompanyId);
  const unread = companyNotifs.filter(n => !n.read).length;

  const handleLogoutAction = () => {
    localStorage.removeItem('hrms_auth');
    localStorage.removeItem('hrms_profile');
    window.location.reload(); // Hard refresh clean reset auth wrapper
  };

  return (
    <div className="flex flex-col flex-shrink-0 z-30">
      {/* Masquerade Alert Banner */}
      {isMasquerading && (
        <div className="bg-amber-500 text-amber-950 px-4 py-1.5 text-xs font-semibold flex items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={14} className="animate-pulse" />
            <span>Active Masquerade: Viewing and managing HR records for <strong>{currentCompany?.name}</strong>.</span>
          </div>
          <button
            onClick={onExitMasquerade}
            className="bg-amber-950 text-white px-2 py-0.5 rounded hover:bg-amber-900 transition-colors text-[10px] font-bold"
          >
            Exit Masquerade
          </button>
        </div>
      )}

      <header className="flex items-center h-13 px-4 border-b border-gray-200 bg-white gap-3 relative">
        <button onClick={onToggleSidebar} className="text-gray-500 hover:text-gray-700 p-1 rounded">
          <Menu size={18} />
        </button>

        <div className="flex items-center gap-2 text-sm text-gray-500 min-w-0">
          <span className="font-semibold text-gray-900 truncate font-sans">
            {isMasquerading ? `SaaS Control Center — ${currentCompany?.name}` : pageTitle}
          </span>
        </div>

        {/* Fixed Company Name Badge in Navbar for Company Head and HR */}
        {(activeRole === 'Company Head' || activeRole === 'HR') && currentCompany && (
          <div className="ml-2 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold rounded-md flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
            Company: {currentCompany.name}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setNotifOpen(p => !p); setProfileOpen(false); }}
              className="relative p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            >
              <Bell size={17} />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold leading-none">
                  {unread}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">Notifications</span>
                  <Badge variant="blue">{unread} new</Badge>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                  {companyNotifs.length === 0 ? (
                    <p className="p-4 text-center text-xs text-gray-400">No recent alerts</p>
                  ) : (
                    companyNotifs.slice(0, 5).map(n => (
                      <div key={n.id} className={cn('px-4 py-2.5 hover:bg-gray-50 cursor-pointer', !n.read && 'bg-blue-50/50')}>
                        <div className="flex items-start gap-2">
                          <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0', n.priority === 'high' ? 'bg-red-500' : n.priority === 'medium' ? 'bg-amber-500' : 'bg-gray-300')} />
                          <div>
                            <p className="text-[11px] text-gray-700 leading-relaxed">{n.message}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{n.timestamp}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile info */}
          <div className="relative">
            <button
              onClick={() => { setProfileOpen(p => !p); setNotifOpen(false); }}
              className="flex items-center gap-1.5 p-1 text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold font-sans">
                {userAvatar}
              </div>
              <ChevronDown size={14} className="text-gray-400" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-xs font-bold text-gray-900 truncate">{userName}</p>
                  <p className="text-[9px] text-gray-400 uppercase font-semibold">{activeRole}</p>
                </div>
                <button
                  onClick={handleLogoutAction}
                  className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-1.5 transition-colors"
                >
                  <LogOut size={13} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </div>
  );
};
