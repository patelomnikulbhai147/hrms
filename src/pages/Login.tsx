import React, { useState } from 'react';
import { ShieldCheck, Lock, User, Sparkles, Building2 } from 'lucide-react';
import { Button } from '../components/ui/Button';

import { Company } from '../data/mockData';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  username: string; // login ID
  passwordStr: string;
  role: 'Super Admin' | 'Company Head' | 'HR';
  companyId: string;
  status: 'Active' | 'Disabled';
  avatar: string;
}

interface LoginProps {
  userAccounts: UserAccount[];
  companies: Company[];
  onLogin: (user: UserAccount) => void;
}

export const Login: React.FC<LoginProps> = ({ userAccounts, companies, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

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
    onLogin(matched);
  };

  const handleQuickSelect = (acc: UserAccount) => {
    setUsername(acc.username);
    setPassword(acc.passwordStr);
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />

      {/* Main card */}
      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl relative z-10 space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto shadow-md shadow-blue-500/20">
            <Building2 size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">SaaS HRMS Platform</h1>
            <p className="text-xs text-slate-400 mt-1">Operational Multi-Company Workspace</p>
          </div>
        </div>

        {/* Demo Quick-Select Panel */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-blue-400 uppercase tracking-wider">
            <Sparkles size={11} className="animate-pulse" />
            <span>SaaS Demo Helper Accounts</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {userAccounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => handleQuickSelect(acc)}
                className={`text-[11px] text-left px-2.5 py-1.5 rounded-lg bg-slate-900 border hover:border-blue-500/40 flex items-center justify-between transition-all ${
                  acc.status === 'Disabled' 
                    ? 'border-red-900/40 text-slate-500 line-through' 
                    : 'border-slate-800 text-slate-300 hover:text-white'
                }`}
                title={acc.status === 'Disabled' ? 'Account Deactivated' : undefined}
              >
                <span>{acc.name} ({acc.role === 'Super Admin' ? 'Platform Owner' : acc.role})</span>
                <span className="text-[10px] font-mono text-slate-500">
                  {acc.status === 'Disabled' ? 'DEACTIVATED' : `ID: ${acc.username}`}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          {error && (
            <div className="p-2.5 bg-red-950/80 border border-red-800/40 rounded-lg text-[11px] text-red-300 leading-normal">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Login ID / Username</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-500">
                  <User size={13} />
                </span>
                <input
                  type="text"
                  required
                  placeholder="Enter login ID"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 focus:border-blue-500 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:outline-none placeholder-slate-600 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Access Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-500">
                  <Lock size={13} />
                </span>
                <input
                  type="password"
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 focus:border-blue-500 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:outline-none placeholder-slate-600 transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white rounded-lg shadow-lg shadow-blue-600/10 transition-colors flex items-center justify-center gap-1.5"
            >
              <ShieldCheck size={14} />
              <span>Authenticate Session</span>
            </button>
          </div>
        </form>

        <div className="text-center">
          <p className="text-[10px] text-slate-500 font-mono">Platform Authentication Core v3.3.0</p>
        </div>
      </div>
    </div>
  );
};
