import React, { useState } from 'react';
import { ShieldCheck, Search, Filter, ShieldAlert, Key, Edit, Trash2, CheckCircle2, XCircle, Power, User, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { type UserAccount, type AppModules, type ModulePermissions } from './Login';
import { type Company } from '../data/mockData';
import { Badge } from '../components/ui/Badge';
import { cn } from '../utils/cn';

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
  create: false,
  edit: false,
  delete: false,
  export: false,
  approve: false
};

export const Users: React.FC<UsersProps> = ({ userAccounts, companies, onUpdateAccounts }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  
  // Modal state
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);

  const filteredUsers = userAccounts.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'All' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleToggleStatus = (userId: string) => {
    onUpdateAccounts(prev => prev.map(u => {
      if (u.id === userId) {
        return { ...u, status: u.status === 'Active' ? 'Disabled' : 'Active' };
      }
      return u;
    }));
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

  const handleSavePermissions = () => {
    if (!selectedUser) return;
    
    onUpdateAccounts(prev => prev.map(u => u.id === selectedUser.id ? selectedUser : u));
    setSelectedUser(null);
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
                      <div className="flex items-center justify-end gap-2">
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
                        
                        <button
                          onClick={() => handleOpenPermissions(user)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow shadow-blue-500/20 flex items-center gap-1.5"
                        >
                          <Key size={14} />
                          RBAC
                        </button>
                      </div>
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
              <div className="p-6 overflow-y-auto flex-1">
                
                {selectedUser.role === 'Super Admin' && (
                  <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                    <ShieldAlert className="text-rose-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="text-sm font-bold text-rose-400">Super Admin Override</p>
                      <p className="text-xs text-rose-300/80 mt-1">This user is a Super Admin. They inherently possess full system access regardless of the toggles below. Modifying these permissions will only take effect if their role is downgraded.</p>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {MODULES_LIST.map((module) => {
                    const isEnabled = selectedUser.moduleAccess?.[module.id] ?? true;
                    const perms = selectedUser.permissions?.[module.id] || DEFAULT_PERMISSIONS;
                    
                    return (
                      <div key={module.id} className={cn(
                        "rounded-xl border transition-all duration-300 overflow-hidden",
                        isEnabled ? "bg-slate-900/30 border-slate-700/50" : "bg-slate-900/10 border-slate-800/40 opacity-75"
                      )}>
                        {/* Module Header Row */}
                        <div className="p-4 flex items-center justify-between border-b border-slate-800/40 bg-slate-900/20">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleToggleModuleAccess(module.id)}
                              className={cn(
                                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner",
                                isEnabled ? "bg-blue-500" : "bg-slate-700"
                              )}
                            >
                              <span className={cn(
                                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                isEnabled ? "translate-x-4" : "translate-x-0"
                              )} />
                            </button>
                            <span className={cn("font-bold text-sm", isEnabled ? "text-slate-200" : "text-slate-500 line-through decoration-slate-600/50")}>
                              {module.name}
                            </span>
                          </div>
                          {!isEnabled && (
                            <Badge variant="red">Access Blocked</Badge>
                          )}
                        </div>

                        {/* Granular Permissions (Only show if enabled) */}
                        {isEnabled && (
                          <div className="p-4 bg-slate-950/20 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                            {(['view', 'create', 'edit', 'delete', 'export', 'approve'] as Array<keyof ModulePermissions>).map(action => {
                              // Some actions don't make sense for all modules, but for generic RBAC we show them
                              const hasAction = perms[action];
                              
                              return (
                                <label key={action} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-800/60 bg-slate-900/40 cursor-pointer hover:bg-slate-800/60 transition-colors group">
                                  <div className="relative flex items-center">
                                    <input
                                      type="checkbox"
                                      className="peer sr-only"
                                      checked={hasAction}
                                      onChange={() => handleToggleActionPermission(module.id, action)}
                                    />
                                    <div className={cn(
                                      "w-4 h-4 rounded border flex items-center justify-center transition-all",
                                      hasAction 
                                        ? "bg-blue-500 border-blue-500 text-white" 
                                        : "bg-slate-800 border-slate-600 text-transparent group-hover:border-slate-500"
                                    )}>
                                      <CheckCircle2 size={12} strokeWidth={3} className={cn("transition-transform", hasAction ? "scale-100" : "scale-0")} />
                                    </div>
                                  </div>
                                  <span className="text-[11px] font-bold text-slate-300 capitalize">{action}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
