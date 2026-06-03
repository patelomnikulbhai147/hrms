import React, { useState } from 'react';
import { ShieldCheck, Search, Filter, ShieldAlert, Key, Edit, Trash2, CheckCircle2, XCircle, Power, User, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { type UserAccount, type AppModules, type ModulePermissions } from './Login';
import { type Company } from '../data/mockData';
import { isWorkspaceInherited } from '../utils/workspaceUtils';
import { Badge } from '../components/ui/Badge';
import { cn } from '../utils/cn';
import { usePermissions } from '../context/PermissionContext';
import { api } from '../api/apiClient';

interface UsersProps {
  userAccounts: UserAccount[];
  companies: Company[];
  onUpdateAccounts: (updater: UserAccount[] | ((prev: UserAccount[]) => UserAccount[])) => void;
}

const MODULES_LIST: { id: AppModules; name: string }[] = [
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'companies', name: 'Companies (Super Admin only)' },
  { id: 'billing', name: 'Billing & Subscriptions' },
  { id: 'employees', name: 'Employees' },
  { id: 'leaves', name: 'Leave Management' },
  { id: 'payroll', name: 'Payroll' },
  { id: 'attendance', name: 'Attendance' },
  { id: 'documents', name: 'Documents' },
  { id: 'reports', name: 'Reports' },
  { id: 'settings', name: 'Settings' }
];

const DEFAULT_PERMISSIONS: ModulePermissions = {
  view: true,
  edit: false
};

export const Users: React.FC<UsersProps> = ({ userAccounts, companies, onUpdateAccounts }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  
  const { canEdit: canEditModule, canCreate: canCreateModule, canDelete: canDeleteModule } = usePermissions();
  const canEdit = canEditModule('users');
  const canCreate = canCreateModule('users');
  const canDelete = canDeleteModule('users');

  // Modal state
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);

  const filteredUsers = userAccounts.filter(user => {
    const matchesSearch = (user?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (user?.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (user?.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'All' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleToggleStatus = async (userId: string) => {
    try {
      const user = userAccounts.find(u => u.id === userId);
      if (!user) return;
      const newStatus = user.status === 'Active' ? 'Disabled' : 'Active';
      await api.users.update(userId, { status: newStatus });
      onUpdateAccounts(prev => prev.map(u => {
        if (u.id === userId) {
          return { ...u, status: newStatus };
        }
        return u;
      }));
    } catch (err) {
      console.error('Failed to toggle status:', err);
      alert('Failed to update status. Please try again.');
    }
  };

  const handleOpenPermissions = (user: UserAccount) => {
    setSelectedUser(user);
  };

  const handleCloseModal = () => {
    setSelectedUser(null);
  };

  const handleToggleModuleAccess = (moduleId: AppModules) => {
    if (!selectedUser) return;
    const currentAccess = selectedUser.moduleAccess?.[moduleId] ?? true; // default true if undefined
    
    const updatedUser = { ...selectedUser };
    if (!updatedUser.moduleAccess) updatedUser.moduleAccess = {} as Record<AppModules, boolean>;
    
    updatedUser.moduleAccess[moduleId] = !currentAccess;
    
    setSelectedUser(updatedUser);
  };

  const handleToggleActionPermission = (moduleId: AppModules, action: keyof ModulePermissions) => {
    if (!selectedUser) return;
    
    const updatedUser = { ...selectedUser };
    if (!updatedUser.permissions) updatedUser.permissions = {} as Record<AppModules, ModulePermissions>;
    if (!updatedUser.permissions[moduleId]) updatedUser.permissions[moduleId] = { ...DEFAULT_PERMISSIONS };
    
    updatedUser.permissions[moduleId][action] = !updatedUser.permissions[moduleId][action];
    
    setSelectedUser(updatedUser);
  };

  const handleToggleWorkspace = (companyId: string) => {
    if (!selectedUser) return;
    const updatedUser = { ...selectedUser };
    const currentIds = updatedUser.accessibleCompanyIds || [];
    
    if (currentIds.includes(companyId)) {
      updatedUser.accessibleCompanyIds = currentIds.filter(id => id !== companyId);
    } else {
      updatedUser.accessibleCompanyIds = [...currentIds, companyId];
    }
    setSelectedUser(updatedUser);
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    
    try {
      await api.users.update(selectedUser.id, {
        accessibleCompanyIds: selectedUser.accessibleCompanyIds,
        moduleAccess: selectedUser.moduleAccess,
        permissions: selectedUser.permissions
      });
      
      onUpdateAccounts(prev => prev.map(u => u.id === selectedUser.id ? selectedUser : u));
      setSelectedUser(null);
    } catch (err) {
      console.error('Failed to save permissions to backend:', err);
      alert('Failed to save permissions to backend. Please try again.');
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-950 text-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/20 text-white">
                <ShieldCheck size={20} />
              </div>
              User Management & RBAC
            </h1>
            <p className="text-sm text-slate-400 mt-1 font-medium">Enterprise Role-Based Access Control and Global User Governance</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              type="text"
              placeholder="Search by name, email, or login ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>
          
          <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-xl p-1">
            {['All', 'Super Admin', 'Company Head', 'HR', 'Finance', 'Employee'].map(role => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200",
                  roleFilter === role ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-slate-300 hover:bg-slate-800/50"
                )}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl overflow-hidden backdrop-blur-xl shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/50 border-b border-slate-800/60">
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">User</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned Access</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-800/20 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-800 to-slate-700 flex items-center justify-center font-bold text-white shadow-md border border-slate-600/50">
                          {user.avatar || user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">{user.name}</p>
                          <p className="text-[11px] font-medium text-slate-500 mt-0.5">{user.email} • ID: <span className="font-mono text-slate-400">{user.username}</span></p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant={user.role === 'Super Admin' ? 'purple' : user.role === 'Company Head' ? 'indigo' : 'blue'}>
                        {user.role}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1.5">
                        {user.role === 'Super Admin' ? (
                          <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5"><Building2 size={12}/> Global Multi-Tenant Access</span>
                        ) : (
                          <>
                            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5"><Building2 size={12} className="text-blue-400"/> {companies.find(c => c.id === user.companyId)?.name || 'Unknown Base Company'}</span>
                            {user.accessibleCompanyIds && user.accessibleCompanyIds.length > 1 && (
                              <span className="text-[10px] font-medium text-slate-500 ml-4">+ {user.accessibleCompanyIds.length - 1} Additional Branches</span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <Badge variant={user.status === 'Active' ? 'green' : 'red'}>
                        {user.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-right">
                      {canDelete && (
                        <div className="flex items-center justify-end gap-2">
                          {user.role !== 'Super Admin' ? (
                            <button
                              onClick={() => handleToggleStatus(user.id)}
                              className={cn(
                                "p-2 rounded-lg transition-colors shadow-sm border",
                                user.status === 'Active' 
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20" 
                                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                              )}
                              title={user.status === 'Active' ? 'Disable User' : 'Enable User'}
                            >
                              <Power size={16} />
                            </button>
                          ) : (
                            <div className="p-2 flex items-center justify-center text-slate-500" title="Super Admin is protected">
                              <ShieldAlert size={16} />
                            </div>
                          )}
                          
                          <button
                            onClick={() => handleOpenPermissions(user)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow shadow-blue-500/20 flex items-center gap-1.5"
                          >
                            <Key size={14} />
                            RBAC
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-slate-500 font-medium">
                      No users found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RBAC Permissions Modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={handleCloseModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-[#0B1120] border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-slate-800/60 bg-slate-900/40 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-slate-800 to-slate-700 flex items-center justify-center font-bold text-white shadow-md border border-slate-600/50 text-lg">
                    {selectedUser.avatar || selectedUser.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white tracking-tight">{selectedUser.name}</h2>
                    <p className="text-xs font-medium text-blue-400 mt-0.5 flex items-center gap-1.5">
                      <Key size={12} /> Permission Matrix Configuration
                    </p>
                  </div>
                </div>
                <button 
                  onClick={handleCloseModal}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <div className="p-6 overflow-y-auto flex-1 bg-slate-950/50">
                
                {selectedUser.role === 'Super Admin' ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <div className="w-20 h-20 bg-gradient-to-tr from-amber-500/20 to-rose-500/20 border border-amber-500/30 rounded-3xl flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(245,158,11,0.1)]">
                      <ShieldCheck className="text-amber-400" size={40} />
                    </div>
                    <h3 className="text-xl font-black text-white tracking-tight mb-2">Protected System Role</h3>
                    <p className="text-slate-400 max-w-sm mx-auto leading-relaxed text-sm">
                      <strong className="text-amber-400 font-bold">Super Admin</strong> has permanent full system access. Permission controls and workspace limits are securely locked to prevent accidental lockouts.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    
                    {/* Workspace Access Matrix */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-extrabold text-white tracking-wide uppercase flex items-center gap-2">
                          <Building2 size={16} className="text-blue-400" />
                          Workspace Access
                        </h3>
                        <Badge variant="blue">{companies.length} Total</Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {companies.map(company => {
                          const directAssigned = (selectedUser.accessibleCompanyIds || []).includes(company.id) || selectedUser.companyId === company.id;
                          
                          // Compute inheritance for selected user using shared logic
                          const isInherited = isWorkspaceInherited(company.id, selectedUser, companies);
                          
                          const isAssigned = directAssigned || isInherited;
                          
                          return (
                            <button
                              key={company.id}
                              onClick={() => !isInherited && handleToggleWorkspace(company.id)}
                              disabled={isInherited || selectedUser.companyId === company.id}
                              className={cn(
                                "flex flex-col items-start p-4 rounded-xl border transition-all text-left group relative overflow-hidden",
                                isAssigned 
                                  ? (isInherited ? "bg-emerald-500/10 border-emerald-500/30" : "bg-blue-600/15 border-blue-500/40 shadow-inner") 
                                  : "bg-slate-900/40 border-slate-800/60 hover:bg-slate-800/60 hover:border-slate-600",
                                (isInherited || selectedUser.companyId === company.id) && "cursor-default"
                              )}
                            >
                              <div className="flex items-start gap-3 w-full">
                                <div className={cn(
                                  "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors shadow-sm",
                                  isAssigned 
                                    ? (isInherited ? "bg-emerald-500 border-emerald-500 text-white" : "bg-blue-500 border-blue-500 text-white") 
                                    : "bg-slate-800 border-slate-600 text-transparent group-hover:border-slate-500"
                                )}>
                                  <CheckCircle2 size={14} strokeWidth={3} className={cn("transition-transform", isAssigned ? "scale-100" : "scale-0")} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={cn("text-sm font-bold truncate transition-colors", isAssigned ? (isInherited ? "text-emerald-300" : "text-blue-300") : "text-slate-300")}>{company.name}</p>
                                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{company.domain || 'Branch Office'}</p>
                                </div>
                              </div>
                              {isInherited && (
                                <div className="mt-3 w-full border-t border-emerald-500/20 pt-2.5">
                                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
                                    Inherited Access
                                  </span>
                                </div>
                              )}
                              {selectedUser.companyId === company.id && !isInherited && (
                                <div className="mt-3 w-full border-t border-blue-500/20 pt-2.5">
                                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-400">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></div>
                                    Primary Base
                                  </span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-800 to-transparent" />

                    {/* RBAC Modules */}
                    <div>
                      <h3 className="text-sm font-extrabold text-white tracking-wide uppercase flex items-center gap-2 mb-4">
                        <Key size={16} className="text-emerald-400" />
                        Module Permissions
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {MODULES_LIST.map((module) => {
                          const isEnabled = selectedUser.moduleAccess?.[module.id] ?? true;
                          const perms = selectedUser.permissions?.[module.id] || DEFAULT_PERMISSIONS;
                          
                          return (
                            <div key={module.id} className={cn(
                              "rounded-xl border transition-all duration-300 flex flex-col",
                              isEnabled ? "bg-slate-900/40 border-slate-700/50" : "bg-slate-900/20 border-slate-800/40 opacity-60"
                            )}>
                              {/* Module Header Row */}
                              <div className="p-3.5 flex items-center justify-between border-b border-slate-800/40 bg-slate-800/20">
                                <span className={cn("font-bold text-sm tracking-tight", isEnabled ? "text-white" : "text-slate-500 line-through decoration-slate-600/50")}>
                                  {module.name}
                                </span>
                                <button
                                  onClick={() => handleToggleModuleAccess(module.id)}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner",
                                    isEnabled ? "bg-emerald-500" : "bg-slate-700"
                                  )}
                                >
                                  <span className={cn(
                                    "pointer-events-none inline-block h-3 w-3 mt-[1px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                    isEnabled ? "translate-x-3.5" : "translate-x-0.5"
                                  )} />
                                </button>
                              </div>

                              {/* Granular Permissions */}
                              {isEnabled && (
                                <div className="p-3.5 flex items-center gap-3">
                                  {(['view', 'create', 'edit', 'delete'] as Array<keyof ModulePermissions>).map(action => {
                                    const hasAction = perms[action];
                                    return (
                                      <button
                                        key={action} 
                                        onClick={() => handleToggleActionPermission(module.id, action)}
                                        className={cn(
                                          "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border",
                                          hasAction 
                                            ? "bg-slate-800/80 text-white border-slate-600/50 shadow-sm" 
                                            : "bg-slate-900/50 text-slate-500 border-slate-800/50 hover:bg-slate-800/50 hover:text-slate-400"
                                        )}
                                      >
                                        <div className={cn(
                                          "w-1.5 h-1.5 rounded-full",
                                          hasAction ? (action === 'view' ? 'bg-blue-400' : 'bg-emerald-400') : 'bg-slate-600'
                                        )} />
                                        {action}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-800/60 bg-slate-900/80 flex items-center justify-end gap-3 sticky bottom-0">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePermissions}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                >
                  <ShieldCheck size={16} />
                  Save Permission Matrix
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
