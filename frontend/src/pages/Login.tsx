import React, { useState } from 'react';
import { User, Lock, Mail, Eye, EyeOff, ShieldCheck, Users, Building2, BarChart3, Shield, KeyRound, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { Company } from '@/data/mockData';
import { api } from '@/api/apiClient';
import { authStorage } from '@/utils/authStorage';
import { validateEmail } from '@/utils/validation';
import { ZeniaLogo } from '@/components/brand/ZeniaLogo';

export interface ModulePermissions {
  // Canonical 3-action model surfaced in the permission matrix.
  view: boolean;
  edit: boolean;
  export: boolean;
  // Legacy actions — folded into edit/export everywhere (see utils/permissionFold
  // and PermissionContext). Kept OPTIONAL only for backward compatibility with
  // older stored records; never shown in the matrix.
  create?: boolean;
  delete?: boolean;
  approve?: boolean;
  print?: boolean;
  manage?: boolean;
  import?: boolean;
}

export type AppModules = 'dashboard' | 'companies' | 'billing' | 'employees' | 'leaves' | 'payroll' | 'attendance' | 'documents' | 'reports' | 'settings' | 'users' | 'tasks' | 'tenders' | 'contracts' | 'company-profile' | 'communication' | 'audit' | 'invoicing' | 'loans' | 'compliance';

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

  // Security CAPTCHA & Lockout States
  const [captchaInfo, setCaptchaInfo] = useState<any>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [recaptchaWidgetId, setRecaptchaWidgetId] = useState<any>(null);

  const resetForgotFlow = () => {
    setForgotStep('email');
    setForgotEmail('');
    setOtp('');
    setResetToken('');
    setDevOtp('');
    setNewPassword('');
    setError('');
  };

  const loadInternalCaptcha = async () => {
    try {
      const res = await api.auth.getInternalCaptcha();
      setCaptchaId(res.captchaId);
      setCaptchaSvg(res.captchaSvg);
      setCaptchaAnswer('');
    } catch (err) {
      console.error('Failed to load internal CAPTCHA:', err);
    }
  };

  const loadGoogleRecaptcha = (info: any) => {
    const siteKey = info.captchaType === 'google_v2' ? info.googleV2SiteKey : info.googleV3SiteKey;
    if (!siteKey) return;

    if (info.captchaType === 'google_v3') {
      const id = 'recaptcha-v3-script';
      if (!document.getElementById(id)) {
        const script = document.createElement('script');
        script.id = id;
        script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
      }
    } else {
      const id = 'recaptcha-v2-script';
      if (!document.getElementById(id)) {
        const script = document.createElement('script');
        script.id = id;
        script.src = `https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoadCallback&render=explicit`;
        script.async = true;
        script.defer = true;
        (window as any).onRecaptchaLoadCallback = () => {
          renderRecaptchaV2(siteKey);
        };
        document.body.appendChild(script);
      } else if ((window as any).grecaptcha) {
        renderRecaptchaV2(siteKey);
      }
    }
  };

  const renderRecaptchaV2 = (siteKey: string) => {
    setTimeout(() => {
      const container = document.getElementById('recaptcha-v2-container');
      if (container && (window as any).grecaptcha) {
        try {
          if (recaptchaWidgetId !== null) {
            (window as any).grecaptcha.reset(recaptchaWidgetId);
          } else {
            const widgetId = (window as any).grecaptcha.render('recaptcha-v2-container', {
              sitekey: siteKey,
              callback: (token: string) => {
                setCaptchaToken(token);
              },
              'expired-callback': () => {
                setCaptchaToken('');
              }
            });
            setRecaptchaWidgetId(widgetId);
          }
        } catch (e) {
          console.warn('reCAPTCHA render exception:', e);
        }
      }
    }, 300);
  };

  // `forceNew` regenerates the image even if one is already on screen. Pass it
  // after a failed login (the server consumes each captchaId once), but not on
  // email blur — that would wipe a CAPTCHA the user has already typed.
  const checkCaptchaStatus = async (emailAddress: string, forceNew = false) => {
    try {
      const info = await api.auth.getCaptchaStatus({ email: emailAddress.trim() });
      setCaptchaInfo(info);

      if (info.lockedOut) {
        setError(`Too many failed login attempts. Please try again after 10 minutes.`);
      } else {
        if (error.includes('Too many failed login attempts')) {
          setError('');
        }

        if (info.captchaRequired) {
          if (info.captchaType === 'internal') {
            if (forceNew || !captchaId) loadInternalCaptcha();
          } else {
            loadGoogleRecaptcha(info);
          }
        } else {
          setCaptchaAnswer('');
          setCaptchaId('');
          setCaptchaSvg('');
          setCaptchaToken('');
        }
      }
    } catch (err) {
      console.error('Failed to check CAPTCHA status:', err);
    }
  };

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('hrms_theme', 'light');
    // Query default captcha status on mount (alwaysEnabled check)
    checkCaptchaStatus('');
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

    if (captchaInfo?.lockedOut) {
      setError(`Too many failed login attempts. Please try again after 10 minutes.`);
      return;
    }

    let captchaTokenToSend = captchaToken;

    if (captchaInfo?.captchaRequired) {
      if (captchaInfo.captchaType === 'internal') {
        if (!captchaAnswer.trim()) {
          setError('Please enter the CAPTCHA code.');
          return;
        }
      } else if (captchaInfo.captchaType === 'google_v2') {
        if (!captchaToken) {
          setError('Please complete the CAPTCHA verification.');
          return;
        }
      } else if (captchaInfo.captchaType === 'google_v3') {
        const siteKey = captchaInfo.googleV3SiteKey;
        if (siteKey && (window as any).grecaptcha) {
          try {
            captchaTokenToSend = await (window as any).grecaptcha.execute(siteKey, { action: 'login' });
          } catch (e) {
            setError('Google reCAPTCHA verification failed. Please try again.');
            return;
          }
        } else {
          setError('Google reCAPTCHA is loading. Please wait a moment.');
          return;
        }
      }
    }

    setSubmitting(true);

    try {
      const response = await api.auth.login({
        email: trimmedEmail,
        password,
        captchaAnswer: captchaInfo?.captchaRequired && captchaInfo.captchaType === 'internal' ? captchaAnswer : undefined,
        captchaId: captchaInfo?.captchaRequired && captchaInfo.captchaType === 'internal' ? captchaId : undefined,
        captchaToken: captchaInfo?.captchaRequired && captchaInfo.captchaType !== 'internal' ? captchaTokenToSend : undefined
      });

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
      // Refresh CAPTCHA requirements after a failed login. The previous captchaId
      // has been consumed server-side, so a new image is mandatory here.
      checkCaptchaStatus(trimmedEmail, true);
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
    // Desktop: exactly one viewport tall, never scrolls. Below `lg` the panels
    // stack and the page is allowed to scroll — clipping a Sign In button off a
    // phone screen would be worse than a scrollbar.
    <div className="min-h-screen overflow-y-auto lg:h-screen lg:overflow-hidden flex items-center justify-center p-4 lg:p-6 font-sans relative bg-transparent">
      
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
          className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-gradient-to-tr from-brand-300/50 to-brand-500/40 blur-[80px]"
        />
        <motion.div 
          animate={{ 
            x: [0, -150, 0], 
            y: [0, 150, 0], 
            rotate: [0, -90, 0],
            borderRadius: ["60% 40% 30% 70% / 60% 30% 70% 40%", "30% 70% 70% 30% / 30% 30% 70% 70%", "60% 40% 30% 70% / 60% 30% 70% 40%"]
          }}
          transition={{ repeat: Infinity, duration: 30, ease: "easeInOut" }}
          className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-gradient-to-bl from-brand-200/60 to-brand-400/40 blur-[100px]"
        />
        <motion.div 
          animate={{ 
            x: [0, 100, -50, 0], 
            y: [0, 50, -100, 0], 
            rotate: [0, 180, 360],
            scale: [1, 1.2, 1]
          }}
          transition={{ repeat: Infinity, duration: 35, ease: "easeInOut" }}
          className="absolute top-[20%] left-[40%] w-[40vw] h-[40vw] rounded-full bg-gradient-to-r from-brand-100/50 to-brand-300/40 blur-[90px]"
        />
        
        {/* Subtle glowing center to ensure contrast */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] rounded-full bg-white/60 blur-[120px]"></div>
      </div>

      {/* Container */}
      <div className="w-full max-w-[1100px] max-h-full flex flex-col lg:flex-row items-center justify-between relative z-10 gap-8 lg:gap-10">

        {/* Left Side: Branding & Illustration */}
        <div className="lg:w-1/2 flex flex-col items-center justify-center p-4 lg:pr-12 z-10 text-center">

          {/* Node Diagram Illustration */}
          <div className="relative w-52 h-52 xl:w-60 xl:h-60 mb-6 flex items-center justify-center">
            {/* Connecting Lines */}
            <svg className="absolute inset-0 w-full h-full text-brand-200" viewBox="0 0 100 100">
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
            <div className="z-10 relative">
              <ZeniaLogo size={84} radius={220} className="rounded-[22%] shadow-[0_8px_30px_rgba(108,60,240,0.40)]" />
            </div>

            {/* Orbiting Nodes */}
            <div className="absolute top-2 left-2 w-10 h-10 bg-[#EDE9FE] rounded-full flex items-center justify-center shadow-sm z-10">
              <Users size={18} className="text-[#5B2DE6]" />
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
          
          <h1 className="text-[32px] font-bold text-[#111827] tracking-tight font-heading mb-1">
            Zenia<span className="text-[#6C3CF0]">HR</span>
          </h1>

          <h2 className="text-[13px] font-semibold text-[#6B7280] mb-3 uppercase tracking-wider">Smart HR Management Simplified</h2>
          <p className="text-[#6B7280] text-sm leading-relaxed max-w-xs mx-auto">
            Manage your employees, payroll, attendance, and more from a single powerful platform.
          </p>

        </div>

        {/* Right Side: Login Panel */}
        <div className="lg:w-1/2 flex items-center justify-center w-full max-h-full relative z-20">
          {/* On a viewport too short for even the trimmed card (or when a validation
              banner pushes it taller), the CARD scrolls internally rather than the
              page — so the outer `overflow-hidden` can never strand the Sign In
              button off-screen. The cap must be in viewport units: `max-h-full`
              would resolve against an auto-height flex parent and be ignored. */}
          <div className="w-full max-w-[420px] max-h-[calc(100vh-2rem)] lg:max-h-[calc(100vh-3rem)] overflow-y-auto bg-white/80 backdrop-blur-2xl rounded-[28px] shadow-[0_20px_60px_rgba(0,0,0,0.06)] p-6 sm:p-8 border border-white/60 relative">
            {/* Shimmering inner highlight */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-white/50 to-white/10 opacity-40 pointer-events-none"></div>
            
            <div className="relative z-10">
            {!isForgotPassword ? (
              <>
                <div className="mb-[18px]">
                  <h3 className="text-[26px] font-extrabold text-[#111827] mb-1.5 font-heading tracking-tight">Welcome Back!</h3>
                  <p className="text-[#6B7280] text-[13px] font-medium">Sign in to your super admin account</p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-3">
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

                  <div className="space-y-3">
                    <div>
                      <div className="relative flex items-center">
                        <span className="absolute left-4 text-[#9CA3AF]">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          type="email"
                          required
                          placeholder="Email address"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          onBlur={() => checkCaptchaStatus(email)}
                          className="w-full h-11 bg-white border border-[#E5E7EB] focus:border-[#6C3CF0] rounded-xl pl-11 pr-4 text-sm text-[#111827] focus:outline-none focus:ring-[3px] focus:ring-[#6C3CF0]/10 placeholder-[#9CA3AF] transition-all font-medium"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="relative flex items-center">
                        <span className="absolute left-4 text-[#9CA3AF]">
                          <Lock size={18} strokeWidth={2} />
                        </span>
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="Password"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          className="w-full h-11 bg-white border border-[#E5E7EB] focus:border-[#6C3CF0] rounded-xl pl-11 pr-11 text-sm text-[#111827] focus:outline-none focus:ring-[3px] focus:ring-[#6C3CF0]/10 placeholder-[#9CA3AF] transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                        >
                          {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                        </button>
                      </div>
                    </div>

                    {captchaInfo?.captchaRequired && (
                      <div className="space-y-2.5 pt-0.5">
                        <div>
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                            CAPTCHA
                          </label>
                          <div className="flex items-center gap-3 p-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                            {captchaInfo.captchaType === 'internal' ? (
                              <>
                                {/* The generated SVG carries a viewBox, so scaling it to a
                                    48px box in CSS keeps the glyphs sharp and undistorted —
                                    no change to the CAPTCHA generator or its verification. */}
                                <div
                                  dangerouslySetInnerHTML={{ __html: captchaSvg }}
                                  className="shrink-0 rounded-lg overflow-hidden border border-slate-200 [&>svg]:block [&>svg]:h-12 [&>svg]:w-auto"
                                />
                                <button
                                  type="button"
                                  onClick={loadInternalCaptcha}
                                  aria-label="Get a new CAPTCHA code"
                                  className="text-xs font-bold text-[#6C3CF0] hover:text-[#8F6BF5] flex items-center gap-1.5 transition-colors"
                                >
                                  <RefreshCw size={14} strokeWidth={2.5} />
                                  Refresh
                                </button>
                              </>
                            ) : captchaInfo.captchaType === 'google_v2' ? (
                              <div id="recaptcha-v2-container" className="w-full flex justify-center" />
                            ) : (
                              <div className="text-[10px] text-slate-400 leading-tight">
                                Protected by Google reCAPTCHA v3
                              </div>
                            )}
                          </div>
                        </div>

                        {captchaInfo.captchaType === 'internal' && (
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                              Enter CAPTCHA
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Enter the characters above"
                              value={captchaAnswer}
                              onChange={e => setCaptchaAnswer(e.target.value)}
                              className="w-full h-11 bg-white border border-[#E5E7EB] focus:border-[#6C3CF0] rounded-xl px-4 text-sm text-[#111827] focus:outline-none focus:ring-[3px] focus:ring-[#6C3CF0]/10 placeholder-[#9CA3AF] transition-all font-semibold uppercase tracking-wider"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => { setError(''); setSuccessMsg(''); resetForgotFlow(); setForgotEmail(email.trim()); setIsForgotPassword(true); }}
                      className="text-[13px] text-[#6C3CF0] font-medium hover:text-[#8F6BF5] transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <div className="pt-1">
                    <button
                      type="submit"
                      className="btn-tone btn-primary w-full h-11 text-[15px] font-bold rounded-xl active:scale-[0.98]"
                    >
                      Sign In
                    </button>
                  </div>
                </form>

                <div className="text-center pt-4">
                  <p className="text-[13px] text-[#6B7280] font-medium">
                    Don't have an account? <a href="#" className="text-[#6C3CF0] font-bold hover:underline">Contact Support</a>
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="mb-[18px]">
                  <h3 className="text-[26px] font-extrabold text-[#111827] mb-1.5 font-heading tracking-tight">
                    {forgotStep === 'email' && 'Forgot Password'}
                    {forgotStep === 'otp' && 'Verify Code'}
                    {forgotStep === 'reset' && 'Set New Password'}
                  </h3>
                  <p className="text-[#6B7280] text-[13px] font-medium">
                    {forgotStep === 'email' && 'Enter your email to receive a verification code.'}
                    {forgotStep === 'otp' && `We sent a 6-digit code to ${forgotEmail}.`}
                    {forgotStep === 'reset' && 'Choose a strong new password (min 8 characters).'}
                  </p>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-4">
                  {(['email', 'otp', 'reset'] as const).map((s, i) => {
                    const order = { email: 0, otp: 1, reset: 2 };
                    const active = order[forgotStep] >= i;
                    return (
                      <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${active ? 'bg-[#6C3CF0]' : 'bg-[#E5E7EB]'}`} />
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
                  <form onSubmit={handleRequestOtp} className="space-y-3">
                    <div className="relative flex items-center">
                      <span className="absolute left-4 text-[#9CA3AF]"><Mail size={18} strokeWidth={2} /></span>
                      <input
                        type="email"
                        required
                        placeholder="Email address"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        className="w-full bg-white border border-[#E5E7EB] focus:border-[#6C3CF0] rounded-xl pl-11 pr-4 h-11 text-sm text-[#111827] focus:outline-none focus:ring-[3px] focus:ring-[#6C3CF0]/10 placeholder-[#9CA3AF] transition-all font-medium"
                      />
                    </div>
                    <div className="pt-2 space-y-3">
                      <button type="submit" disabled={submitting} className="btn-tone btn-primary w-full h-11 disabled:opacity-60 text-[15px] font-bold rounded-xl active:scale-[0.98]">
                        {submitting ? 'Sending…' : 'Send Verification Code'}
                      </button>
                      <button type="button" onClick={() => { setIsForgotPassword(false); resetForgotFlow(); }} className="w-full h-11 bg-white border border-[#E5E7EB] hover:bg-[#F8FAFC] text-[15px] font-bold text-[#6B7280] rounded-xl transition-all duration-200 active:scale-[0.98]">
                        Back to Sign In
                      </button>
                    </div>
                  </form>
                )}

                {/* Step 2: OTP */}
                {forgotStep === 'otp' && (
                  <form onSubmit={handleVerifyOtp} className="space-y-3">
                    <div className="relative flex items-center">
                      <span className="absolute left-4 text-[#9CA3AF]"><KeyRound size={18} strokeWidth={2} /></span>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit code"
                        value={otp}
                        onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-white border border-[#E5E7EB] focus:border-[#6C3CF0] rounded-xl pl-11 pr-4 h-11 text-sm text-[#111827] tracking-[0.4em] font-semibold focus:outline-none focus:ring-[3px] focus:ring-[#6C3CF0]/10 placeholder-[#9CA3AF] transition-all"
                      />
                    </div>
                    <div className="pt-2 space-y-3">
                      <button type="submit" disabled={submitting} className="btn-tone btn-primary w-full h-11 disabled:opacity-60 text-[15px] font-bold rounded-xl active:scale-[0.98]">
                        {submitting ? 'Verifying…' : 'Verify Code'}
                      </button>
                      <button type="button" onClick={() => { setError(''); setSuccessMsg(''); setOtp(''); handleRequestOtp(new Event('submit') as any); }} className="w-full text-[13px] text-[#6C3CF0] font-semibold hover:text-[#8F6BF5] transition-colors">
                        Resend code
                      </button>
                      <button type="button" onClick={() => { setError(''); setSuccessMsg(''); setForgotStep('email'); }} className="w-full h-11 bg-white border border-[#E5E7EB] hover:bg-[#F8FAFC] text-[14px] font-bold text-[#6B7280] rounded-xl transition-all duration-200 active:scale-[0.98]">
                        Back
                      </button>
                    </div>
                  </form>
                )}

                {/* Step 3: new password */}
                {forgotStep === 'reset' && (
                  <form onSubmit={handleResetPassword} className="space-y-3">
                    <div className="relative flex items-center">
                      <span className="absolute left-4 text-[#9CA3AF]"><ShieldCheck size={18} strokeWidth={2} /></span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="New password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full bg-white border border-[#E5E7EB] focus:border-[#6C3CF0] rounded-xl pl-11 pr-11 h-11 text-sm text-[#111827] focus:outline-none focus:ring-[3px] focus:ring-[#6C3CF0]/10 placeholder-[#9CA3AF] transition-all font-medium"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
                        {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                      </button>
                    </div>
                    <div className="pt-2 space-y-3">
                      <button type="submit" disabled={submitting} className="btn-tone btn-primary w-full h-11 disabled:opacity-60 text-[15px] font-bold rounded-xl active:scale-[0.98]">
                        {submitting ? 'Resetting…' : 'Reset Password'}
                      </button>
                      <button type="button" onClick={() => { setIsForgotPassword(false); resetForgotFlow(); }} className="w-full h-11 bg-white border border-[#E5E7EB] hover:bg-[#F8FAFC] text-[15px] font-bold text-[#6B7280] rounded-xl transition-all duration-200 active:scale-[0.98]">
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
