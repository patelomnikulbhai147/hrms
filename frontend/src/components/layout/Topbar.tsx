import React, { useState } from 'react';
import { getApiErrorMessage } from '../../utils/apiError';
import { Menu, Bell, ChevronDown, ChevronRight, LogOut, ShieldAlert, X, Sun, Moon, Building2, Search, MapPin, Star, History, KeyRound, CheckCircle2 } from 'lucide-react';
import { type Role, type Company, type Notification } from '../../data/mockData';
import { type UserAccount } from '../../pages/Login';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/apiClient';
import { buildWorkspaceHierarchy } from '../../utils/workspaceUtils';
import { resolveActiveWorkspace } from '../../types';


interface TopbarProps {
  onToggleSidebar: () => void;
  role: Role;
  onRoleChange: (role: Role) => void;
  onCompanyChange?: (companyId: string, kind?: 'company' | 'branch') => void;
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

  // ── Self-service "Change Password" modal ──────────────────────────────────
  const [cpwOpen, setCpwOpen] = useState(false);
  const [cpwCurrent, setCpwCurrent] = useState('');
  const [cpwNew, setCpwNew] = useState('');
  const [cpwConfirm, setCpwConfirm] = useState('');
  const [cpwShow, setCpwShow] = useState(false);
  const [cpwBusy, setCpwBusy] = useState(false);
  const [cpwError, setCpwError] = useState('');
  const [cpwDone, setCpwDone] = useState(false);

  const openChangePassword = () => {
    setProfileOpen(false);
    setCpwCurrent(''); setCpwNew(''); setCpwConfirm(''); setCpwShow(false);
    setCpwError(''); setCpwDone(false); setCpwBusy(false); setCpwOpen(true);
  };

  const handleChangePassword = async () => {
    setCpwError('');
    if (!cpwCurrent) { setCpwError('Please enter your current password.'); return; }
    if (cpwNew.length < 8) { setCpwError('Your new password must be at least 8 characters long.'); return; }
    if (cpwNew !== cpwConfirm) { setCpwError('New passwords do not match.'); return; }
    if (cpwNew === cpwCurrent) { setCpwError('Your new password must be different from your current one.'); return; }
    setCpwBusy(true);
    try {
      await api.auth.changePassword({ currentPassword: cpwCurrent, newPassword: cpwNew });
      setCpwDone(true);
    } catch (err) {
      setCpwError(getApiErrorMessage(err, 'Could not change your password.'));
    } finally {
      setCpwBusy(false);
    }
  };
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [wsSearchTerm, setWsSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: prev[groupName] === false ? true : false }));
  };

  // If masquerading, role is forced to Company Head
  const activeRole = isMasquerading ? 'Company Head' : role;
  // Loose (String) compare so a branch workspace resolves whether activeCompanyId
  // is a number (fresh click) or a string (rehydrated from localStorage).
  const currentCompany = (resolveActiveWorkspace(companies as any[], activeCompanyId) as any) || companies.find(c => String(c.id) === String(activeCompanyId));
  // When the active workspace is a branch, resolve its parent company so the
  // header can render the "Company → Branch" breadcrumb.
  const activeParentCompany = (currentCompany as any)?.parentCompanyId
    ? companies.find(c => String(c.id) === String((currentCompany as any).parentCompanyId))
    : null;
  const isBranchWorkspace = !!(currentCompany as any)?.parentCompanyId;
  const branchLabel = (currentCompany as any)?.branchName || currentCompany?.name;

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
            <span className="tracking-tight text-[11px] text-amber-500">Viewing workspace as Super Admin (Masquerade Mode){currentCompany?.name ? <> — {isBranchWorkspace && activeParentCompany ? <strong className="text-amber-400 font-extrabold">{activeParentCompany.name} → {branchLabel} Branch</strong> : <strong className="text-amber-400 font-extrabold">{currentCompany.name}</strong>}</> : null}</span>
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
          {isMasquerading && isBranchWorkspace && activeParentCompany ? (
            <span className="font-extrabold text-white truncate font-heading text-base tracking-tight flex items-center gap-1.5">
              <span className="text-slate-400">{activeParentCompany.name}</span>
              <ChevronRight size={15} className="text-slate-500 flex-shrink-0" />
              <span>{branchLabel} Branch</span>
            </span>
          ) : (
            <span className="font-extrabold text-white truncate font-heading text-base tracking-tight">
              {isMasquerading ? `SaaS Control Center — ${currentCompany?.name}` : pageTitle}
            </span>
          )}
        </div>

        {/* Fixed Company Name Badge in Navbar (Mobile only or if multiple disabled) */}
        {companies.length <= 1 && currentCompany && (
          <div className="ml-2 px-4 py-2 bg-white border border-[#DCE8FF] hover:bg-[#F7FAFF] text-[#1F2937] text-[13px] font-bold rounded-2xl flex items-center gap-2.5 shadow-sm transition-all cursor-default">
            <Building2 size={16} className="text-[#4F7CFF]" />
            <span>{(currentCompany as any).branchName || currentCompany.name}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">

          {/* Masquerade Workspace Switcher (Company / Branch) */}
          {isMasquerading && onCompanyChange && (
            <div className="relative">
              <button
                onClick={() => { setWorkspaceOpen(p => !p); setNotifOpen(false); setProfileOpen(false); }}
                className="flex items-center gap-2.5 px-4 py-2 bg-white hover:bg-[#F7FAFF] border border-[#DCE8FF] rounded-2xl text-[13px] font-bold text-[#1F2937] transition-all active:scale-95 shadow-sm"
                title="Switch workspace"
              >
                <Building2 size={16} className="text-[#4F7CFF]" />
                <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Workspace:</span>
                <span className="max-w-[140px] truncate">{currentCompany?.name || 'Select'}</span>
                <ChevronDown size={16} className="text-[#6B7280]" />
              </button>

              <AnimatePresence>
                {workspaceOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-72 bg-white border border-[#E5EFFF] rounded-2xl shadow-xl py-2 z-50 overflow-hidden"
                  >
                    <div className="max-h-80 overflow-y-auto custom-scrollbar">
                      {/* Companies (head offices / parents) */}
                      <div className="px-4 pt-2 pb-1">
                        <span className="text-[10px] font-extrabold text-[#6B7280] uppercase tracking-wider">Companies</span>
                      </div>
                      {companies.filter(c => !c.parentCompanyId).map(comp => {
                        // Kind-aware: a company is "current" only when the active
                        // workspace is a COMPANY with this id — never when a branch
                        // sharing the same numeric id is open (id collision).
                        const isCurrent = String(comp.id) === String(activeCompanyId) && !isBranchWorkspace;
                        const childBranches = companies
                          .filter(b => b.parentCompanyId === comp.id)
                          .sort((a, b) => (((a as any).branchNo ?? a.id) as number) - (((b as any).branchNo ?? b.id) as number));
                        return (
                          <React.Fragment key={comp.id}>
                            <button
                              onClick={() => { if (!isCurrent) onCompanyChange(comp.id, 'company'); setWorkspaceOpen(false); }}
                              className={cn('w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition-colors hover:bg-[#F7FAFF]', isCurrent ? 'bg-[#EDF4FF] text-[#4F7CFF] font-bold' : 'text-[#1F2937] font-semibold')}
                            >
                              <span className="flex items-center gap-2 truncate pr-2"><Building2 size={13} className="text-[#4F7CFF] flex-shrink-0" />{comp.name}</span>
                              {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-[#4F7CFF] flex-shrink-0" />}
                            </button>
                            {childBranches.length > 0 && (
                              <div className="pl-3">
                                {childBranches.map(br => {
                                  // Kind-aware branch highlight: current only when a
                                  // BRANCH workspace with this id is open.
                                  const brCurrent = String(br.id) === String(activeCompanyId) && isBranchWorkspace;
                                  return (
                                    <button
                                      key={br.id}
                                      onClick={() => { if (!brCurrent) onCompanyChange(br.id, 'branch'); setWorkspaceOpen(false); }}
                                      className={cn('w-full text-left pl-6 pr-4 py-2 text-[11px] flex items-center justify-between transition-colors hover:bg-[#F7FAFF] border-l-2 border-[#E5EFFF] ml-3', brCurrent ? 'text-[#4F7CFF] font-bold bg-[#F7FAFF]' : 'text-[#4B5563] font-medium')}
                                    >
                                      <span className="truncate pr-2">↳ {(br as any).branchName || br.name}</span>
                                      {brCurrent && <div className="w-1.5 h-1.5 rounded-full bg-[#4F7CFF] flex-shrink-0" />}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Workspace Switcher */}
          {companies.length > 1 && activeRole !== 'Super Admin' && !isMasquerading && (
            <div className="relative">
              <button
                onClick={() => { setWorkspaceOpen(p => !p); setNotifOpen(false); setProfileOpen(false); }}
                className="flex items-center gap-2.5 px-4 py-2 bg-white hover:bg-[#F7FAFF] border border-[#DCE8FF] rounded-2xl text-[13px] font-bold text-[#1F2937] transition-all active:scale-95 shadow-sm"
              >
                <Building2 size={16} className="text-[#4F7CFF]" />
                <span className="max-w-[120px] truncate">{(currentCompany as any)?.branchName || currentCompany?.name || 'Switch Workspace'}</span>
                <ChevronDown size={16} className="text-[#6B7280]" />
              </button>
              
              <AnimatePresence>
                {workspaceOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-72 bg-white border border-[#E5EFFF] rounded-2xl shadow-2xl py-1 z-50 overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b border-[#E5EFFF] flex flex-col gap-2 bg-[#F8FAFC]">
                      <div className="flex items-center gap-2 px-1">
                        <History size={13} className="text-[#64748B]" />
                        <span className="text-[10px] font-extrabold text-[#64748B] uppercase tracking-wider">Switch Workspace</span>
                      </div>
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <input
                          type="text"
                          placeholder="Search workspaces..."
                          value={wsSearchTerm}
                          onChange={e => setWsSearchTerm(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E2E8F0] rounded-lg text-[11px] font-semibold text-[#334155] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4F7CFF]/20 focus:border-[#4F7CFF] transition-all shadow-sm"
                        />
                      </div>
                    </div>
                    
                    <div className="max-h-[320px] overflow-y-auto custom-scrollbar pb-1">
                      {(() => {
                        // Canonical Company -> Branch hierarchy (companies are parents,
                        // branches are children). Filter by the search term but keep a
                        // company group whenever the company OR any of its branches match.
                        const term = wsSearchTerm.toLowerCase();
                        const hierarchy = buildWorkspaceHierarchy(companies)
                          .map(group => {
                            const companyMatch = group.companyName.toLowerCase().includes(term);
                            const cards = companyMatch
                              ? group.cards
                              : group.cards.filter(c =>
                                  ((c as any).branchName || c.name || '').toLowerCase().includes(term)
                                );
                            return { ...group, cards };
                          })
                          .filter(group => group.cards.length > 0);

                        if (hierarchy.length === 0) {
                          return (
                            <div className="py-6 text-center text-slate-500 flex flex-col items-center">
                              <Search size={20} className="text-slate-300 mb-2" />
                              <span className="text-[11px] font-semibold">No workspaces found</span>
                            </div>
                          );
                        }

                        return hierarchy.map((group) => {
                          const groupName = group.companyName;
                          const isExpanded = expandedGroups[groupName] !== false; // Default true

                          // Sort branches: primary first, then alphabetically
                          const sortedBranches = [...group.cards].sort((a, b) => {
                            const isAPrimary = authProfile?.companyId === a.id;
                            const isBPrimary = authProfile?.companyId === b.id;
                            if (isAPrimary) return -1;
                            if (isBPrimary) return 1;
                            // Branch listings sort by branchNo ascending (per-company sequence).
                            return (((a as any).branchNo ?? a.id) as number) - (((b as any).branchNo ?? b.id) as number);
                          });
                          return (
                            <div key={group.companyId} className="mb-1">
                              <button
                                onClick={() => toggleGroup(groupName)}
                                className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#F1F5F9] transition-colors group border-b border-[#F1F5F9] last:border-0"
                              >
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <span className="text-[14px]">🏢</span>
                                  <span className="text-[12px] font-bold text-[#334155] truncate tracking-wide">{groupName} ({group.cards.length})</span>
                                </div>
                                <div className="flex items-center flex-shrink-0">
                                  <ChevronRight size={14} className={cn("text-[#94A3B8] transition-transform duration-200", isExpanded && "rotate-90")} />
                                </div>
                              </button>
                              
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="py-1 space-y-0.5">
                                      {sortedBranches.map((comp) => {
                                        const isCurrent = comp.id === activeCompanyId;
                                        const isPrimary = authProfile?.companyId === comp.id;
                                        return (
                                          <button
                                            key={comp.id}
                                            onClick={() => {
                                              if (onCompanyChange && !isCurrent) {
                                                onCompanyChange(comp.id, (comp as any).parentCompanyId ? 'branch' : 'company');
                                              }
                                              setWorkspaceOpen(false);
                                              setWsSearchTerm('');
                                            }}
                                            className={cn(
                                              "w-full text-left px-4 py-2 text-[12px] flex items-center justify-between transition-all group",
                                              isCurrent ? "bg-[#EFF6FF] text-[#2563EB] font-bold" : "text-[#475569] font-medium hover:bg-[#F8FAFC] hover:text-[#0F172A]"
                                            )}
                                          >
                                            <div className="flex items-center gap-2 overflow-hidden">
                                              <span className="text-[13px]">{isPrimary ? '⭐' : '📍'}</span>
                                              <span className="truncate">{(comp as any).branchName || comp.name}</span>
                                            </div>
                                            {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] flex-shrink-0 shadow-[0_0_6px_rgba(59,130,246,0.6)]" />}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        });
                      })()}
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
                    <div className="flex items-center gap-2">
                      {unread > 0 && <Badge variant="blue">{unread} new</Badge>}
                      {companyNotifs.some(n => !n.read) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); api.notifications.markAllRead().then(() => onUpdateNotifications(prev => prev.map(i => ({ ...i, read: true })))).catch(() => {}); }}
                          className="text-[10px] font-bold text-blue-400 hover:text-blue-300" title="Mark all as read"
                        >Mark all read</button>
                      )}
                      {companyNotifs.length > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); if (!window.confirm('Clear all notifications?')) return; api.notifications.clearAll().then(() => onUpdateNotifications([])).catch(() => {}); }}
                          className="text-[10px] font-bold text-rose-400 hover:text-rose-300" title="Clear all notifications"
                        >Clear all</button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                    {companyNotifs.length === 0 ? (
                      <p className="p-5 text-center text-xs text-slate-500 font-medium">No recent alerts</p>
                    ) : (
                      companyNotifs.slice(0, 8).map(n => (
                        <div
                          key={n.id}
                          onClick={() => { if (!n.read) { api.notifications.markRead(n.id).then(() => onUpdateNotifications(prev => prev.map(i => i.id === n.id ? { ...i, read: true } : i))).catch(() => {}); } }}
                          className={cn('px-4 py-3 hover:bg-slate-850/45 flex items-start justify-between gap-3 transition-colors cursor-pointer', !n.read && 'bg-blue-955/20')}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0 relative', n.priority === 'high' ? 'bg-rose-500' : n.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-500')}>
                              {!n.read && (n.priority === 'high' || n.priority === 'medium') && (
                                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-current" />
                              )}
                            </div>
                            <div className="min-w-0">
                              {(n as any).title && <p className={cn('text-[11px] font-bold break-words', !n.read ? 'text-white' : 'text-slate-400')}>{(n as any).title}</p>}
                              <p className="text-[11px] text-slate-300 leading-relaxed font-medium break-words">{n.message}</p>
                              <p className="text-[9px] text-slate-500 mt-1 font-semibold">{n.timestamp ? new Date(n.timestamp).toLocaleString('en-IN') : ''}</p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              api.notifications.delete(n.id).then(() => onUpdateNotifications(prev => prev.filter(item => item.id !== n.id))).catch((err: any) => alert(getApiErrorMessage(err, 'Could not delete the notification.')));
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
                    onClick={openChangePassword}
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-800/60 flex items-center gap-2 font-semibold transition-all"
                  >
                    <KeyRound size={13} />
                    <span>Change Password</span>
                  </button>
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

      {/* Change Password (self-service) modal */}
      {cpwOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !cpwBusy && setCpwOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <KeyRound size={18} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] font-black text-slate-900">Change Password</h3>
                <p className="text-[12px] text-slate-500 font-medium">{userName}</p>
              </div>
              <button onClick={() => !cpwBusy && setCpwOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            {cpwDone ? (
              <div className="px-6 py-8 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={28} className="text-emerald-500" />
                </div>
                <h4 className="text-[15px] font-black text-slate-900">Password changed successfully</h4>
                <p className="text-[13px] text-slate-500 mt-1">Your new password is active now. Use it the next time you sign in.</p>
                <button onClick={() => setCpwOpen(false)} className="mt-5 w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[13px] font-bold transition-all">Done</button>
              </div>
            ) : (
              <div className="px-6 py-5">
                <label className="block text-[12px] font-bold text-slate-600 mb-1.5">Current password</label>
                <input type={cpwShow ? 'text' : 'password'} value={cpwCurrent} onChange={e => setCpwCurrent(e.target.value)} placeholder="Your current password"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" autoFocus />
                <label className="block text-[12px] font-bold text-slate-600 mb-1.5 mt-4">New password</label>
                <input type={cpwShow ? 'text' : 'password'} value={cpwNew} onChange={e => setCpwNew(e.target.value)} placeholder="At least 8 characters"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
                <label className="block text-[12px] font-bold text-slate-600 mb-1.5 mt-4">Confirm new password</label>
                <input type={cpwShow ? 'text' : 'password'} value={cpwConfirm} onChange={e => setCpwConfirm(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleChangePassword(); }} placeholder="Re-enter the new password"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
                <button type="button" onClick={() => setCpwShow(s => !s)} className="mt-2 text-[12px] font-bold text-slate-500 hover:text-slate-700">
                  {cpwShow ? 'Hide' : 'Show'} passwords
                </button>
                {cpwError && (
                  <div className="mt-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-[12px] font-semibold text-red-600">{cpwError}</div>
                )}
                <div className="flex items-center justify-end gap-2 mt-5">
                  <button onClick={() => setCpwOpen(false)} disabled={cpwBusy} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 disabled:opacity-50">Cancel</button>
                  <button onClick={handleChangePassword} disabled={cpwBusy}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all shadow-sm disabled:opacity-60">
                    {cpwBusy ? 'Saving…' : 'Update Password'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
