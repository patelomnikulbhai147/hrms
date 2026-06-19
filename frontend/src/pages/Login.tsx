import React, { useState } from 'react';
import { User, Lock, Mail, Eye, EyeOff, ShieldCheck, Users, Building2, BarChart3, Shield, KeyRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { Company } from '../data/mockData';
import { api } from '../api/apiClient';
import { authStorage } from '../utils/authStorage';
import { validateEmail } from '../utils/validation';

export interface ModulePermissions {
  view: boolean;
  edit: boolean;
  create: boolean;
  delete: boolean;
  export: boolean;
  approve: boolean;
  print: boolean;
  manage: boolean;
}

export type AppModules = 'dashboard' | 'companies' | 'billing' | 'employees' | 'leaves' | 'payroll' | 'attendance' | 'documents' | 'reports' | 'settings' | 'users' | 'tasks' | 'tenders';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  username: string;
  passwordStr: string;
  password?: string;
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
  sessionMessage?: string | null;
}

export const Login: React.FC<LoginProps> = ({ userAccounts: _userAccounts, companies, onLogin, sessionMessage }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // Forgot-password OTP workflow
  const [forgotStep, setForgotStep] = useState<'email' | 'otp' | 'reset'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetForgotFlow = () => {
    setForgotStep('email');
    setForgotEmail('');
    setOtp('');
    setResetToken('');
    setDevOtp('');
    setNewPassword('');
    setError('');
  };

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('hrms_theme', 'light');
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Email-only authentication: the login field accepts a valid email address.
    const trimmedEmail = email.trim();
    const emailCheck = validateEmail(trimmedEmail);
    if (!emailCheck.isValid) {
      setError(emailCheck.error || 'Please enter a valid email address.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.auth.login({ email: trimmedEmail, password });

      if (!response || !response.token || !response.user) {
        setError('Login failed. Invalid response from server.');
        return;
      }

      const matched: UserAccount = response.user;
      // Session-only auth: the login is valid for this browser session and ends
      // on browser close or after the inactivity timeout (no permanent login).
      authStorage.setRemember(false);
      authStorage.set('hrms_jwt_token', response.token);

      if (matched.status && matched.status.toLowerCase() !== 'active') {
        setError('This account is not active. Please contact your administrator.');
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

      onLogin(matched, '');
    } catch (err: any) {
      setError(err.message || 'Incorrect access password or user not found. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 1 — request the OTP code.
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!forgotEmail.trim()) {
      setError('Please enter your registered email address.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.auth.forgotPassword({ email: forgotEmail.trim() });
      setSuccessMsg(res.message || 'If an active account exists, a verification code has been sent.');
      // Dev convenience: when SMTP isn't configured the backend returns the code.
      if (res.devOtp) setDevOtp(res.devOtp);
      setForgotStep('otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send the verification code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2 — verify the OTP, obtain a reset token.
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!otp.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.auth.verifyOtp({ email: forgotEmail.trim(), otp: otp.trim() });
      setResetToken(res.resetToken);
      setSuccessMsg('Code verified. Choose a new password.');
      setForgotStep('reset');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 3 — set the new password.
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters long.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.auth.resetPassword({ resetToken, newPassword });
      setIsForgotPassword(false);
      resetForgotFlow();
      setPassword('');
      setSuccessMsg(res.message || 'Your password has been reset successfully. You can now sign in.');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please restart the process.');
    } finally {
      setSubmitting(false);
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
                  {sessionMessage && !error && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-semibold">
                      {sessionMessage}
                    </div>
                  )}
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
                          type="email"
                          required
                          placeholder="Email address"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
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

                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => { setError(''); setSuccessMsg(''); resetForgotFlow(); setForgotEmail(email.trim()); setIsForgotPassword(true); }}
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
                  <h3 className="text-[26px] font-extrabold text-[#0F172A] mb-1.5 font-heading tracking-tight">
                    {forgotStep === 'email' && 'Forgot Password'}
                    {forgotStep === 'otp' && 'Verify Code'}
                    {forgotStep === 'reset' && 'Set New Password'}
                  </h3>
                  <p className="text-[#64748B] text-[13px] font-medium">
                    {forgotStep === 'email' && 'Enter your email to receive a verification code.'}
                    {forgotStep === 'otp' && `We sent a 6-digit code to ${forgotEmail}.`}
                    {forgotStep === 'reset' && 'Choose a strong new password (min 8 characters).'}
                  </p>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-6">
                  {(['email', 'otp', 'reset'] as const).map((s, i) => {
                    const order = { email: 0, otp: 1, reset: 2 };
                    const active = order[forgotStep] >= i;
                    return (
                      <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${active ? 'bg-[#4F7CFF]' : 'bg-[#E2E8F0]'}`} />
                    );
                  })}
                </div>

                {error && (
                  <div className="p-3 mb-4 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 font-semibold">
                    {error}
                  </div>
                )}
                {successMsg && (
                  <div className="p-3 mb-4 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-600 font-semibold">
                    {successMsg}
                  </div>
                )}
                {devOtp && forgotStep === 'otp' && (
                  <div className="p-3 mb-4 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 font-semibold">
                    Dev mode (no email configured) — your code is <span className="font-mono text-sm tracking-widest">{devOtp}</span>
                  </div>
                )}

                {/* Step 1: email */}
                {forgotStep === 'email' && (
                  <form onSubmit={handleRequestOtp} className="space-y-5">
                    <div className="relative flex items-center">
                      <span className="absolute left-4 text-[#94A3B8]"><Mail size={18} strokeWidth={2} /></span>
                      <input
                        type="email"
                        required
                        placeholder="Email address"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        className="w-full bg-white border border-[#E2E8F0] focus:border-[#4F7CFF] rounded-xl pl-11 pr-4 py-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-[3px] focus:ring-[#4F7CFF]/10 placeholder-[#94A3B8] transition-all font-medium"
                      />
                    </div>
                    <div className="pt-2 space-y-3">
                      <button type="submit" disabled={submitting} className="w-full py-3.5 bg-[#4F7CFF] hover:bg-[#6AA8FF] disabled:opacity-60 text-[15px] font-bold text-white rounded-xl shadow-[0_4px_14px_rgba(79,124,255,0.3)] transition-all duration-200 active:scale-[0.98]">
                        {submitting ? 'Sending…' : 'Send Verification Code'}
                      </button>
                      <button type="button" onClick={() => { setIsForgotPassword(false); resetForgotFlow(); }} className="w-full py-3.5 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[15px] font-bold text-[#64748B] rounded-xl transition-all duration-200 active:scale-[0.98]">
                        Back to Sign In
                      </button>
                    </div>
                  </form>
                )}

                {/* Step 2: OTP */}
                {forgotStep === 'otp' && (
                  <form onSubmit={handleVerifyOtp} className="space-y-5">
                    <div className="relative flex items-center">
                      <span className="absolute left-4 text-[#94A3B8]"><KeyRound size={18} strokeWidth={2} /></span>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit code"
                        value={otp}
                        onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-white border border-[#E2E8F0] focus:border-[#4F7CFF] rounded-xl pl-11 pr-4 py-3.5 text-sm text-[#0F172A] tracking-[0.4em] font-semibold focus:outline-none focus:ring-[3px] focus:ring-[#4F7CFF]/10 placeholder-[#94A3B8] transition-all"
                      />
                    </div>
                    <div className="pt-2 space-y-3">
                      <button type="submit" disabled={submitting} className="w-full py-3.5 bg-[#4F7CFF] hover:bg-[#6AA8FF] disabled:opacity-60 text-[15px] font-bold text-white rounded-xl shadow-[0_4px_14px_rgba(79,124,255,0.3)] transition-all duration-200 active:scale-[0.98]">
                        {submitting ? 'Verifying…' : 'Verify Code'}
                      </button>
                      <button type="button" onClick={() => { setError(''); setSuccessMsg(''); setOtp(''); handleRequestOtp(new Event('submit') as any); }} className="w-full text-[13px] text-[#4F7CFF] font-semibold hover:text-[#6AA8FF] transition-colors">
                        Resend code
                      </button>
                      <button type="button" onClick={() => { setError(''); setSuccessMsg(''); setForgotStep('email'); }} className="w-full py-3 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[14px] font-bold text-[#64748B] rounded-xl transition-all duration-200 active:scale-[0.98]">
                        Back
                      </button>
                    </div>
                  </form>
                )}

                {/* Step 3: new password */}
                {forgotStep === 'reset' && (
                  <form onSubmit={handleResetPassword} className="space-y-5">
                    <div className="relative flex items-center">
                      <span className="absolute left-4 text-[#94A3B8]"><ShieldCheck size={18} strokeWidth={2} /></span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="New password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full bg-white border border-[#E2E8F0] focus:border-[#4F7CFF] rounded-xl pl-11 pr-11 py-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-[3px] focus:ring-[#4F7CFF]/10 placeholder-[#94A3B8] transition-all font-medium"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 text-[#94A3B8] hover:text-[#64748B] transition-colors">
                        {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                      </button>
                    </div>
                    <div className="pt-2 space-y-3">
                      <button type="submit" disabled={submitting} className="w-full py-3.5 bg-[#4F7CFF] hover:bg-[#6AA8FF] disabled:opacity-60 text-[15px] font-bold text-white rounded-xl shadow-[0_4px_14px_rgba(79,124,255,0.3)] transition-all duration-200 active:scale-[0.98]">
                        {submitting ? 'Resetting…' : 'Reset Password'}
                      </button>
                      <button type="button" onClick={() => { setIsForgotPassword(false); resetForgotFlow(); }} className="w-full py-3.5 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[15px] font-bold text-[#64748B] rounded-xl transition-all duration-200 active:scale-[0.98]">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
            </div>
          </div>
        </div>

      </div>
      
    </div>
  );
};
