import React, { useState } from 'react';
import { Menu, Bell, ChevronDown, LogOut, ShieldAlert, X, Sun, Moon, Building2 } from 'lucide-react';
import { type Role, type Company, type Notification } from '../types';
import { type UserAccount } from '../../pages/Login';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/apiClient';
import { getCompanyInitials } from '../../utils/workspaceUtils';

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
  theme: 'light' | 'dark' | 'system';
  toggleTheme: () => void;
  authProfile: UserAccount | null;
  onLogout?: () => void;
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
  onUpdateNotifications,
  theme = 'dark',
  toggleTheme,
  authProfile,
  onLogout
}) => {

  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  // If masquerading, role is forced to Company Head
  const activeRole = isMasquerading ? 'Company Head' : role;
  const currentCompany = companies.find(c => c.id === activeCompanyId);

  // Filter notifications by company if not Super Admin
  const companyNotifs = activeRole === 'Super Admin'
    ? notifications
    : notifications.filter(n => !n.companyId || n.companyId === activeCompanyId);
  const unread = companyNotifs.filter(n => !n.read).length;

  const handleLogoutAction = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem('hrms_auth');
      localStorage.removeItem('hrms_profile');
      localStorage.removeItem('hrms_jwt_token');
      window.location.reload(); // Hard refresh clean reset auth wrapper
    }
  };

  return (
    <div className="flex flex-col flex-shrink-0 z-30 sticky top-0">
      {/* Masquerade Alert Banner */}
      {isMasquerading && (
        <div className="bg-[#361905] border-b border-amber-900/40 text-amber-500 px-4 py-1.5 text-xs font-bold flex items-center justify-between gap-3 shadow-lg select-none">
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={14} className="animate-pulse text-amber-500" />
            <span className="tracking-tight text-[11px] text-amber-500">Active Tenant Masquerade: Viewing HR workspace for <strong className="text-amber-400 font-extrabold">{currentCompany?.name}</strong></span>
          </div>
          <button
            onClick={onExitMasquerade}
            className="bg-amber-600 hover:bg-amber-500 border border-amber-500 text-white px-3 py-0.5 rounded-lg transition-all text-[9px] font-extrabold uppercase tracking-wider shadow active:scale-95"
          >
            Exit Session
          </button>
        </div>
      )}

      <header className="flex items-center h-14 px-5 border-b border-slate-800/80 bg-slate-950/45 backdrop-blur-xl gap-4 relative text-white">
        <button onClick={onToggleSidebar} className="text-slate-400 hover:text-white hover:bg-slate-800/60 p-1.5 rounded-lg active:scale-90 transition-all">
          <Menu size={18} />
        </button>

        <div className="flex items-center gap-2 text-sm text-slate-300 min-w-0">
          <span className="font-extrabold text-white truncate font-heading text-base tracking-tight">
            {isMasquerading ? `SaaS Control Center — ${currentCompany?.name}` : pageTitle}
          </span>
        </div>

        {/* Fixed Company Name Badge in Navbar for Company Head and HR */}
        {(activeRole === 'Company Head' || activeRole === 'HR') && currentCompany && (
          <div className="ml-2 px-3 py-1 bg-gradient-to-r from-blue-950/40 to-indigo-950/40 border border-blue-900/60 text-blue-300 text-xs font-bold rounded-full flex items-center gap-2 shadow-sm select-none">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-[10px] uppercase tracking-wider text-blue-400 font-extrabold">Company:</span> {currentCompany.name}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          
          {/* Workspace Switcher */}
          {authProfile && activeRole !== 'Super Admin' && authProfile.accessibleCompanyIds && authProfile.accessibleCompanyIds.length > 1 && !isMasquerading && (
            <div className="relative">
              <button
                onClick={() => { setWorkspaceOpen(p => !p); setNotifOpen(false); setProfileOpen(false); }}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-xs font-bold text-slate-200 transition-all active:scale-95 shadow-sm"
              >
                <Building2 size={14} className="text-indigo-400" />
                <span className="max-w-[120px] truncate">{currentCompany?.name || 'Switch Workspace'}</span>
                <ChevronDown size={14} className="text-slate-500" />
              </button>
              
              <AnimatePresence>
                {workspaceOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-800/80 rounded-2xl shadow-2xl py-2 z-50 overflow-hidden"
                  >
                    <div className="px-4 py-2 border-b border-slate-800/80 mb-1">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Switch Workspace</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                      {authProfile.accessibleCompanyIds.map(id => {
                        const comp = companies.find(c => c.id === id);
                        if (!comp) return null;
                        const isCurrent = id === activeCompanyId;
                        return (
                          <button
                            key={id}
                            onClick={() => {
                              if (onCompanyChange && !isCurrent) {
                                onCompanyChange(id);
                              }
                              setWorkspaceOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition-colors hover:bg-slate-800/60",
                              isCurrent ? "bg-indigo-500/10 text-indigo-300 font-bold" : "text-slate-300 font-medium"
                            )}
                          >
                            <span className="truncate pr-2">{comp.name}</span>
                            {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Theme Toggle */}
          {toggleTheme && (
            <button
              onClick={toggleTheme}
              className="relative p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 rounded-lg transition-all active:scale-95 group"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              <div className="relative w-4.5 h-4.5 flex items-center justify-center">
                <Sun 
                  size={18} 
                  className={cn(
                    "absolute transition-all duration-500",
                    theme === 'dark' ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100 text-amber-500 drop-shadow-md"
                  )} 
                />
                <Moon 
                  size={18} 
                  className={cn(
                    "absolute transition-all duration-500",
                    theme === 'light' ? "opacity-0 -rotate-90 scale-50" : "opacity-100 rotate-0 scale-100 text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]"
                  )} 
                />
              </div>
            </button>
          )}

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setNotifOpen(p => !p); setProfileOpen(false); setWorkspaceOpen(false); }}
              className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg transition-all active:scale-95"
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
                  className="absolute right-0 top-full mt-2 w-85 bg-slate-900 border border-slate-800/80 rounded-2xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
                    <span className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">Notifications</span>
                    <Badge variant="blue">{unread} new</Badge>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                    {companyNotifs.length === 0 ? (
                      <p className="p-5 text-center text-xs text-slate-500 font-medium">No recent alerts</p>
                    ) : (
                      companyNotifs.slice(0, 5).map(n => (
                        <div key={n.id} className={cn('px-4 py-3 hover:bg-slate-850/45 flex items-start justify-between gap-3 transition-colors', !n.read && 'bg-blue-955/20')}>
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0 relative', n.priority === 'high' ? 'bg-rose-500' : n.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-500')}>
                              {(n.priority === 'high' || n.priority === 'medium') && (
                                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-current" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-300 leading-relaxed font-medium break-words">{n.message}</p>
                              <p className="text-[9px] text-slate-500 mt-1 font-semibold">{n.timestamp}</p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              api.notifications.delete(n.id).then(() => onUpdateNotifications(prev => prev.filter(item => item.id !== n.id))).catch(() => alert('Failed to delete notification from DB'));
                            }}
                            title="Delete notification"
                            className="text-slate-500 hover:text-rose-400 hover:bg-rose-955/40 p-1 rounded-md transition-all flex-shrink-0"
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
              onClick={() => { setProfileOpen(p => !p); setNotifOpen(false); setWorkspaceOpen(false); }}
              className="flex items-center gap-2 p-1 text-slate-300 hover:bg-slate-800/60 rounded-xl transition-all active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-extrabold font-sans shadow-lg shadow-blue-500/20">
                {userAvatar}
              </div>
              <ChevronDown size={14} className="text-slate-500" />
            </button>

            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-800/80 rounded-2xl shadow-2xl py-1 z-50 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-950/40">
                    <p className="text-xs font-extrabold text-slate-200 truncate leading-tight font-sans">{userName}</p>
                    <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mt-1">{activeRole}</p>
                  </div>
                  <button
                    onClick={handleLogoutAction}
                    className="w-full text-left px-4 py-2.5 text-xs text-rose-400 hover:bg-rose-955/40 flex items-center gap-2 font-semibold transition-all"
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
