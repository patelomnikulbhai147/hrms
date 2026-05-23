import React, { useState } from 'react';
import { Menu, Bell, ChevronDown, LogOut, ShieldAlert, X } from 'lucide-react';
import { type Role, type Company, type Notification } from '../../data/mockData';
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
  notifications: Notification[];
  onUpdateNotifications: (updater: Notification[] | ((prev: Notification[]) => Notification[])) => void;
}

import React, { useState } from 'react';
import { Menu, Bell, ChevronDown, LogOut, ShieldAlert, X } from 'lucide-react';
import { type Role, type Company, type Notification } from '../../data/mockData';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { motion, AnimatePresence } from 'framer-motion';

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
  notifications: Notification[];
  onUpdateNotifications: (updater: Notification[] | ((prev: Notification[]) => Notification[])) => void;
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
  companies,
  notifications,
  onUpdateNotifications
}) => {
  if (false as boolean) {
    console.log(onRoleChange, onCompanyChange);
  }
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
    <div className="flex flex-col flex-shrink-0 z-30 sticky top-0">
      {/* Masquerade Alert Banner */}
      {isMasquerading && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-amber-950 px-4 py-2 text-xs font-semibold flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2">
            <ShieldAlert size={15} className="animate-bounce" />
            <span>Active Masquerade: Managing HR environment for <strong>{currentCompany?.name}</strong>.</span>
          </div>
          <button
            onClick={onExitMasquerade}
            className="bg-amber-950 hover:bg-amber-900 text-white px-3 py-1 rounded-lg transition-all text-[10px] font-bold shadow active:scale-95"
          >
            Exit Masquerade
          </button>
        </div>
      )}

      <header className="flex items-center h-14 px-5 border-b border-slate-200/60 bg-white/80 backdrop-blur-md gap-4 relative">
        <button onClick={onToggleSidebar} className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg active:scale-90 transition-all">
          <Menu size={18} />
        </button>

        <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0">
          <span className="font-extrabold text-slate-800 truncate font-heading text-base tracking-tight">
            {isMasquerading ? `SaaS Control Center — ${currentCompany?.name}` : pageTitle}
          </span>
        </div>

        {/* Fixed Company Name Badge in Navbar for Company Head and HR */}
        {(activeRole === 'Company Head' || activeRole === 'HR') && currentCompany && (
          <div className="ml-2 px-3 py-1 bg-gradient-to-r from-blue-50/70 to-indigo-50/70 border border-blue-100 text-blue-700 text-xs font-bold rounded-full flex items-center gap-2 shadow-sm select-none">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-[10px] uppercase tracking-wider text-blue-500 font-extrabold">Company:</span> {currentCompany.name}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setNotifOpen(p => !p); setProfileOpen(false); }}
              className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all active:scale-95"
            >
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute top-1 right-1 h-4 w-4 bg-rose-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold animate-pulse shadow">
                  {unread}
                </span>
              )}
            </button>

            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-100 rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Notifications</span>
                    <Badge variant="blue">{unread} new</Badge>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {companyNotifs.length === 0 ? (
                      <p className="p-5 text-center text-xs text-slate-400 font-medium">No recent alerts</p>
                    ) : (
                      companyNotifs.slice(0, 5).map(n => (
                        <div key={n.id} className={cn('px-4 py-3 hover:bg-slate-50/50 flex items-start justify-between gap-3 transition-colors', !n.read && 'bg-blue-50/30')}>
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0 relative', n.priority === 'high' ? 'bg-rose-500' : n.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-300')}>
                              {(n.priority === 'high' || n.priority === 'medium') && (
                                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-current" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-600 leading-relaxed font-medium break-words">{n.message}</p>
                              <p className="text-[9px] text-slate-400 mt-1 font-semibold">{n.timestamp}</p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateNotifications(prev => prev.filter(item => item.id !== n.id));
                            }}
                            title="Delete notification"
                            className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-1 rounded-md transition-all flex-shrink-0"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User Profile info */}
          <div className="relative">
            <button
              onClick={() => { setProfileOpen(p => !p); setNotifOpen(false); }}
              className="flex items-center gap-2 p-1 text-slate-700 hover:bg-slate-100/60 rounded-xl transition-all active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-extrabold font-sans shadow-md shadow-blue-500/10">
                {userAvatar}
              </div>
              <ChevronDown size={14} className="text-slate-400" />
            </button>

            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-100 rounded-xl shadow-2xl py-1 z-50 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                    <p className="text-xs font-extrabold text-slate-800 truncate leading-tight font-sans">{userName}</p>
                    <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mt-1">{activeRole}</p>
                  </div>
                  <button
                    onClick={handleLogoutAction}
                    className="w-full text-left px-4 py-2.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 font-semibold transition-all"
                  >
                    <LogOut size={13} />
                    <span>Logout</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>
    </div>
  );
};
