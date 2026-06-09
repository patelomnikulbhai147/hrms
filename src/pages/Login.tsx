import React, { useState } from 'react';
import { User, Lock, Mail, Eye, EyeOff, ShieldCheck, Users, Building2, BarChart3, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import { Company } from '../data/mockData';
import { api } from '../api/apiClient';
import { getAccessibleWorkspaceIds } from '../utils/workspaceUtils';

export interface ModulePermissions {
  view: boolean;
  edit: boolean;
  create: boolean;
  delete: boolean;
}

export type AppModules = 'dashboard' | 'companies' | 'billing' | 'employees' | 'leaves' | 'payroll' | 'attendance' | 'documents' | 'reports' | 'settings' | 'users';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  username: string;
  passwordStr: string;
  role: 'Super Admin' | 'Company Head' | 'HR' | 'Finance' | 'Employee';
  companyId: string;
  accessibleCompanyIds?: string[];
  status: 'Active' | 'Disabled';
  avatar: string;
  employeeId?: string;
  moduleAccess?: Record<AppModules, boolean>;
  permissions?: Record<AppModules, ModulePermissions>;
}

interface LoginProps {
  userAccounts: UserAccount[];
  companies: Company[];
  onLogin: (user: UserAccount, selectedCompanyId?: string) => void;
}

export const Login: React.FC<LoginProps> = ({ userAccounts: _userAccounts, companies, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('hrms_theme', 'light');
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await api.auth.login({ username: username.trim(), password });
      
      if (!response || !response.token || !response.user) {
        setError('Login failed. Invalid response from server.');
        return;
      }

      const matched: UserAccount = response.user;
      localStorage.setItem('hrms_jwt_token', response.token);

      if (matched.status === 'Disabled') {
        setError('This corporate account has been deactivated.');
        return;
      }

      if (matched.role !== 'Super Admin' && matched.companyId) {
        const company = companies.find(c => c.id === matched.companyId);
        if (company) {
          if (company.accountStatus === 'Suspended') {
            setError('Access Suspended: Your corporate workspace has been suspended.');
            return;
          }
          if (company.paymentStatus === 'Expired') {
            setError('Access Expired: Your corporate subscription has expired.');
            return;
          }
          if (company.status === 'Inactive') {
            setError('Access Blocked: Your corporate workspace is currently inactive.');
            return;
          }
        }
      }

      matched.accessibleCompanyIds = getAccessibleWorkspaceIds(matched, companies);
      onLogin(matched, '');
    } catch (err: any) {
      setError(err.message || 'Incorrect access password or user not found. Please try again.');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!username || !newPassword) {
      setError('Please provide your Email address and a New Password.');
      return;
    }

    try {
      await api.auth.forgotPassword({ username: username.trim(), newPassword });
      setSuccessMsg('Your password has been successfully reset! You can now sign in.');
      setIsForgotPassword(false);
      setPassword('');
      setNewPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Ensure the email/username is correct.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 lg:p-8 font-sans relative overflow-hidden bg-transparent">
      
      {/* Premium Animated Fluid Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none bg-[#f1f5f9]">
        <motion.div 
          animate={{ 
            x: [0, 150, 0], 
            y: [0, -100, 0], 
            rotate: [0, 90, 0],
            borderRadius: ["30% 70% 70% 30% / 30% 30% 70% 70%", "60% 40% 30% 70% / 60% 30% 70% 40%", "30% 70% 70% 30% / 30% 30% 70% 70%"]
          }}
          transition={{ repeat: Infinity, duration: 25, ease: "easeInOut" }}
          className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-gradient-to-tr from-blue-300/50 to-indigo-400/50 blur-[80px]"
        />
        <motion.div 
          animate={{ 
            x: [0, -150, 0], 
            y: [0, 150, 0], 
            rotate: [0, -90, 0],
            borderRadius: ["60% 40% 30% 70% / 60% 30% 70% 40%", "30% 70% 70% 30% / 30% 30% 70% 70%", "60% 40% 30% 70% / 60% 30% 70% 40%"]
          }}
          transition={{ repeat: Infinity, duration: 30, ease: "easeInOut" }}
          className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-gradient-to-bl from-purple-300/50 to-fuchsia-300/50 blur-[100px]"
        />
        <motion.div 
          animate={{ 
            x: [0, 100, -50, 0], 
            y: [0, 50, -100, 0], 
            rotate: [0, 180, 360],
            scale: [1, 1.2, 1]
          }}
          transition={{ repeat: Infinity, duration: 35, ease: "easeInOut" }}
          className="absolute top-[20%] left-[40%] w-[40vw] h-[40vw] rounded-full bg-gradient-to-r from-cyan-300/40 to-blue-300/40 blur-[90px]"
        />
        
        {/* Subtle glowing center to ensure contrast */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] rounded-full bg-white/60 blur-[120px]"></div>
      </div>

      {/* Container */}
      <div className="w-full max-w-[1100px] flex flex-col lg:flex-row items-center justify-between relative z-10 gap-10">
        
        {/* Left Side: Branding & Illustration */}
        <div className="lg:w-1/2 flex flex-col items-center justify-center p-8 lg:pr-12 z-10 text-center">
          
          {/* Node Diagram Illustration */}
          <div className="relative w-64 h-64 mb-10 flex items-center justify-center">
            {/* Connecting Lines */}
            <svg className="absolute inset-0 w-full h-full text-indigo-200" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,2"/>
              <line x1="50" y1="50" x2="20" y2="20" stroke="currentColor" strokeWidth="1"/>
              <line x1="50" y1="50" x2="80" y2="20" stroke="currentColor" strokeWidth="1"/>
              <line x1="50" y1="50" x2="20" y2="80" stroke="currentColor" strokeWidth="1"/>
              <line x1="50" y1="50" x2="80" y2="80" stroke="currentColor" strokeWidth="1"/>
              
              <circle cx="50" cy="10" r="1.5" fill="currentColor" />
              <circle cx="90" cy="50" r="1.5" fill="currentColor" />
              <circle cx="50" cy="90" r="1.5" fill="currentColor" />
              <circle cx="10" cy="50" r="1.5" fill="currentColor" />
            </svg>
            
            {/* Center Logo */}
            <div className="w-24 h-24 bg-[#4F7CFF] rounded-3xl flex items-center justify-center shadow-[0_8px_30px_rgba(79,124,255,0.4)] z-10 relative">
              <span className="text-white font-extrabold text-4xl tracking-tight font-heading">HM</span>
            </div>

            {/* Orbiting Nodes */}
            <div className="absolute top-2 left-2 w-10 h-10 bg-[#E0E7FF] rounded-full flex items-center justify-center shadow-sm z-10">
              <Users size={18} className="text-[#4338CA]" />
            </div>
            <div className="absolute top-2 right-2 w-10 h-10 bg-[#D1FAE5] rounded-full flex items-center justify-center shadow-sm z-10">
              <Building2 size={18} className="text-[#059669]" />
            </div>
            <div className="absolute bottom-2 left-2 w-10 h-10 bg-[#F3E8FF] rounded-full flex items-center justify-center shadow-sm z-10">
              <Shield size={18} className="text-[#7E22CE]" />
            </div>
            <div className="absolute bottom-2 right-2 w-10 h-10 bg-[#E0E7FF] rounded-full flex items-center justify-center shadow-sm z-10">
              <BarChart3 size={18} className="text-[#4338CA]" />
            </div>
          </div>
          
          <h1 className="text-[32px] font-extrabold text-[#0F172A] tracking-tight font-heading mb-1">
            HR<span className="text-[#4F7CFF]">Mate</span>
          </h1>
          
          <h2 className="text-[13px] font-bold text-[#1E293B] mb-4 uppercase tracking-wider">Smart HR Management Simplified</h2>
          <p className="text-[#64748B] text-sm leading-relaxed max-w-xs mb-8 mx-auto">
            Manage your employees, payroll, attendance, and more from a single powerful platform.
          </p>
          
        </div>

        {/* Right Side: Login Panel */}
        <div className="lg:w-1/2 flex items-center justify-center w-full relative z-20">
          <div className="w-full max-w-[460px] bg-white/80 backdrop-blur-2xl rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.06)] p-8 sm:p-12 border border-white/60 relative overflow-hidden">
            {/* Shimmering inner highlight */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-white/50 to-white/10 opacity-40 pointer-events-none"></div>
            
            <div className="relative z-10">
            {!isForgotPassword ? (
              <>
                <div className="mb-8">
                  <h3 className="text-[26px] font-extrabold text-[#0F172A] mb-1.5 font-heading tracking-tight">Welcome Back!</h3>
                  <p className="text-[#64748B] text-[13px] font-medium">Sign in to your super admin account</p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-5">
                  {error && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 font-semibold">
                      {error}
                    </div>
                  )}
                  {successMsg && (
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-600 font-semibold">
                      {successMsg}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <div className="relative flex items-center">
                        <span className="absolute left-4 text-[#94A3B8]">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          type="text"
                          required
                          placeholder="Email address"
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                          className="w-full bg-white border border-[#E2E8F0] focus:border-[#4F7CFF] rounded-xl pl-11 pr-4 py-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-[3px] focus:ring-[#4F7CFF]/10 placeholder-[#94A3B8] transition-all font-medium"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="relative flex items-center">
                        <span className="absolute left-4 text-[#94A3B8]">
                          <Lock size={18} strokeWidth={2} />
                        </span>
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="Password"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          className="w-full bg-white border border-[#E2E8F0] focus:border-[#4F7CFF] rounded-xl pl-11 pr-11 py-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-[3px] focus:ring-[#4F7CFF]/10 placeholder-[#94A3B8] transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 text-[#94A3B8] hover:text-[#64748B] transition-colors"
                        >
                          {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 rounded border-[#CBD5E1] text-[#4F7CFF] focus:ring-[#4F7CFF]/20 cursor-pointer" />
                      <span className="text-[13px] text-[#64748B] font-medium group-hover:text-[#475569] transition-colors">Remember me</span>
                    </label>
                    <button 
                      type="button" 
                      onClick={() => { setError(''); setSuccessMsg(''); setIsForgotPassword(true); }}
                      className="text-[13px] text-[#4F7CFF] font-medium hover:text-[#6AA8FF] transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full py-3.5 bg-[#4F7CFF] hover:bg-[#6AA8FF] text-[15px] font-bold text-white rounded-xl shadow-[0_4px_14px_rgba(79,124,255,0.3)] transition-all duration-200 active:scale-[0.98]"
                    >
                      Sign In
                    </button>
                  </div>
                </form>

                <div className="text-center pt-8">
                  <p className="text-[13px] text-[#64748B] font-medium">
                    Don't have an account? <a href="#" className="text-[#4F7CFF] font-bold hover:underline">Contact Support</a>
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="mb-8">
                  <h3 className="text-[26px] font-extrabold text-[#0F172A] mb-1.5 font-heading tracking-tight">Reset Password</h3>
                  <p className="text-[#64748B] text-[13px] font-medium">Enter your email and a new password.</p>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-5">
                  {error && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 font-semibold">
                      {error}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <div className="relative flex items-center">
                        <span className="absolute left-4 text-[#94A3B8]">
                          <Mail size={18} strokeWidth={2} />
                        </span>
                        <input
                          type="text"
                          required
                          placeholder="Email address"
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                          className="w-full bg-white border border-[#E2E8F0] focus:border-[#4F7CFF] rounded-xl pl-11 pr-4 py-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-[3px] focus:ring-[#4F7CFF]/10 placeholder-[#94A3B8] transition-all font-medium"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="relative flex items-center">
                        <span className="absolute left-4 text-[#94A3B8]">
                          <ShieldCheck size={18} strokeWidth={2} />
                        </span>
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="New Password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          className="w-full bg-white border border-[#E2E8F0] focus:border-[#4F7CFF] rounded-xl pl-11 pr-11 py-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-[3px] focus:ring-[#4F7CFF]/10 placeholder-[#94A3B8] transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 text-[#94A3B8] hover:text-[#64748B] transition-colors"
                        >
                          {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 space-y-3">
                    <button
                      type="submit"
                      className="w-full py-3.5 bg-[#4F7CFF] hover:bg-[#6AA8FF] text-[15px] font-bold text-white rounded-xl shadow-[0_4px_14px_rgba(79,124,255,0.3)] transition-all duration-200 active:scale-[0.98]"
                    >
                      Reset Password
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => { setError(''); setIsForgotPassword(false); }}
                      className="w-full py-3.5 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[15px] font-bold text-[#64748B] rounded-xl transition-all duration-200 active:scale-[0.98]"
                    >
                      Back to Sign In
                    </button>
                  </div>
                </form>
              </>
            )}
            </div>
          </div>
        </div>

      </div>
      
    </div>
  );
};
