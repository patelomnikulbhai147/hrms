import React, { useState } from 'react';
import { ShieldCheck, Lock, User, Sparkles, Building2 } from 'lucide-react';
import { Company } from '../data/mockData';
import { motion } from 'framer-motion';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  username: string; // login ID
  passwordStr: string;
  role: 'Super Admin' | 'Company Head' | 'HR' | 'Finance' | 'Employee';
  companyId: string;
  accessibleCompanyIds?: string[];
  status: 'Active' | 'Disabled';
  avatar: string;
  employeeId?: string;
}

interface LoginProps {
  userAccounts: UserAccount[];
  companies: Company[];
  onLogin: (user: UserAccount, selectedCompanyId?: string) => void;
}

export const Login: React.FC<LoginProps> = ({ userAccounts, companies, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pendingUser, setPendingUser] = useState<UserAccount | null>(null);


  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Search for a matching account
    const matched = userAccounts.find(
      acc => acc.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!matched) {
      setError('Login ID not registered in SaaS directory.');
      return;
    }

    if (matched.passwordStr !== password) {
      setError('Incorrect access password. Please try again.');
      return;
    }

    if (matched.status === 'Disabled') {
      setError('This corporate account has been deactivated. Please contact your administrator.');
      return;
    }

    // Tenant/Company active subscription block logic (skip for Super Admin platform owners)
    if (matched.role !== 'Super Admin' && matched.companyId) {
      const company = companies.find(c => c.id === matched.companyId);
      if (company) {
        if (company.accountStatus === 'Suspended') {
          setError('Access Suspended: Your corporate workspace has been suspended. Please contact your billing administrator.');
          return;
        }
        if (company.paymentStatus === 'Expired') {
          setError('Access Expired: Your corporate subscription has expired. Please contact your billing administrator.');
          return;
        }
        if (company.status === 'Inactive') {
          setError('Access Blocked: Your corporate workspace is currently inactive. Please contact your administrator.');
          return;
        }
      }
    }

    // Success
    // Check if user has multiple workspaces assigned
    if (matched.accessibleCompanyIds && matched.accessibleCompanyIds.length > 1) {
      setPendingUser(matched);
      return;
    }
    
    // Single workspace or Super Admin
    onLogin(matched, matched.companyId);
  };

  const handleQuickSelect = (acc: UserAccount) => {
    setUsername(acc.username);
    setPassword(acc.passwordStr);
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Dynamic Animated Glassy Orbs in Background */}
      <motion.div
        animate={{
          scale: [1, 1.25, 1],
          x: [0, 40, 0],
          y: [0, -40, 0],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute top-1/4 left-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1.25, 1, 1.25],
          x: [0, -40, 0],
          y: [0, 40, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl"
      />

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', duration: 0.8, bounce: 0.1 }}
        className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl relative z-10 space-y-6"
      >
        {pendingUser ? (
          <div className="space-y-5">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 bg-gradient-to-tr from-indigo-500 to-purple-650 rounded-xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/20">
                <Building2 size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-white tracking-tight font-heading">Choose Workspace</h1>
                <p className="text-xs text-slate-400 mt-1">Select a company or branch to manage</p>
              </div>
            </div>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {pendingUser.accessibleCompanyIds?.map(compId => {
                const comp = companies.find(c => c.id === compId);
                if (!comp) return null;
                return (
                  <button
                    key={compId}
                    onClick={() => onLogin(pendingUser, compId)}
                    className="w-full p-3 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900/80 flex items-center gap-3 transition-all active:scale-[0.98] group"
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-md overflow-hidden bg-slate-900" style={!comp.logoImage ? { backgroundColor: comp.primaryColor || '#3b82f6' } : {}}>
                      {comp.logoImage ? (
                        <img src={comp.logoImage} alt="Logo" className="w-full h-full object-contain p-0.5" />
                      ) : (
                        comp.logo || comp.name.substring(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-100 truncate">{comp.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{comp.isHeadOffice ? 'Parent Headquarters' : comp.branchName ? `Branch: ${comp.branchName}` : 'Corporate Workspace'}</p>
                    </div>
                    <div className="text-slate-500 group-hover:text-indigo-400 transition-colors">
                      <Sparkles size={14} />
                    </div>
                  </button>
                );
              })}
            </div>
            
            <div className="pt-2 text-center">
               <button onClick={() => setPendingUser(null)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                 Cancel & Return to Login
               </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-blue-500 to-indigo-650 rounded-xl flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
            <Building2 size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight font-heading">SaaS HRMS Platform</h1>
            <p className="text-xs text-slate-400 mt-1">Operational Multi-Company Workspace</p>
          </div>
        </div>

        {/* Demo Quick-Select Panel */}
        <div className="bg-slate-950/40 border border-slate-850/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-blue-400 uppercase tracking-wider">
            <Sparkles size={11} className="animate-pulse" />
            <span>SaaS Demo Helper Accounts</span>
          </div>
          <div className="grid grid-cols-1 gap-2 max-h-[170px] overflow-y-auto pr-1">
            {userAccounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => handleQuickSelect(acc)}
                className={`text-[11px] text-left px-3 py-2 rounded-xl bg-slate-900 border hover:border-blue-500/40 flex items-center justify-between transition-all active:scale-[0.98] ${
                  acc.status === 'Disabled' 
                    ? 'border-rose-955/40 text-slate-500 line-through font-medium' 
                    : 'border-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-800/30'
                }`}
                title={acc.status === 'Disabled' ? 'Account Deactivated' : undefined}
              >
                <span className="font-semibold">{acc.name} ({acc.role === 'Super Admin' ? 'Platform Owner' : acc.role})</span>
                <span className="text-[10px] font-mono text-slate-500 font-bold">
                  {acc.status === 'Disabled' ? 'DEACTIVATED' : `ID: ${acc.username}`}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/30 rounded-xl text-[11px] text-rose-300 font-semibold leading-normal">
              {error}
            </div>
          )}

          <div className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Login ID / Username</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                  <User size={13} />
                </span>
                <input
                  type="text"
                  required
                  placeholder="Enter login ID"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 focus:border-blue-500/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 placeholder-slate-600 transition-all duration-150"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Access Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                  <Lock size={13} />
                </span>
                <input
                  type="password"
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 focus:border-blue-500/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 placeholder-slate-600 transition-all duration-150"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-650 hover:from-blue-500 hover:to-indigo-600 text-xs font-bold text-white rounded-xl shadow-lg shadow-blue-500/15 transition-all duration-200 active:scale-[0.98]"
            >
              <ShieldCheck size={14} className="inline mr-1.5" />
              <span>Authenticate Session</span>
            </button>
          </div>
        </form>

        <div className="text-center pt-2">
          <p className="text-[10px] text-slate-500 font-mono">Platform Authentication Core v3.3.0</p>
        </div>
        </>
        )}
      </motion.div>
    </div>
  );
};
