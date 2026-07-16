import React, { useState } from 'react';
import {
  Lock, Mail, Eye, EyeOff, ShieldCheck, Users, BarChart3, KeyRound, RefreshCw,
  CalendarDays, Wallet, FileText, Zap, ArrowRight, Globe, ChevronDown,
} from 'lucide-react';
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

// Six nodes on a REGULAR hexagon (60° apart, equal radius) centred on the logo —
// perfectly symmetric, equal distance/spacing. top/left are % of the square stage,
// each card is translate(-50%,-50%) so the value is its centre.
const FEATURES: { key: string; Icon: React.ComponentType<any>; color: string; bg: string; top: string; left: string }[] = [
  { key: 'Employees', Icon: Users, color: '#EE7A2E', bg: '#FDEBDD', top: '14%', left: '29%' },   // upper-left
  { key: 'Attendance', Icon: CalendarDays, color: '#16A34A', bg: '#DCFCE7', top: '14%', left: '71%' },  // upper-right
  { key: 'Payroll', Icon: ShieldCheck, color: '#3B82F6', bg: '#DBEAFE', top: '50%', left: '8%' },   // left
  { key: 'Reports', Icon: BarChart3, color: '#8B5CF6', bg: '#EDE9FE', top: '50%', left: '92%' },  // right
  { key: 'Finance', Icon: Wallet, color: '#F1801C', bg: '#FEEAD5', top: '86%', left: '29%' },   // lower-left
  { key: 'Documents', Icon: FileText, color: '#0EA5E9', bg: '#E0F2FE', top: '86%', left: '71%' },  // lower-right
];

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

  // Presentation-only: language selector + optional office-photo backdrop.
  const [language, setLanguage] = useState('EN');
  const [langOpen, setLangOpen] = useState(false);
  const [bgReady, setBgReady] = useState(false);

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

  // ── Shared presentation tokens (login-scoped only) ──────────────────────────
  const BROWN = '#C67B49';       // brand accent — wordmark "HR", links
  const NAVY = '#16284A';        // primary action (Sign In)
  const inputBase =
    // Height compresses with viewport height so short / display-scaled desktops
    // (e.g. 1366×768 @ 125%) never push the card into an inner scrollbar. Caps at
    // 56px (h-14) so normal screens look identical to before.
    'w-full h-[clamp(46px,6.4vh,56px)] bg-white border border-[#E9E9EC] rounded-2xl text-sm text-slate-900 ' +
    'placeholder-slate-400 shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus:outline-none ' +
    'focus:border-[#C67B49] focus:ring-[3px] focus:ring-[#C67B49]/15 transition-all font-medium';
  const primaryBtn =
    // `bg-[#16284A]` also keeps `text-white` white — index.css neutralises text-white
    // unless the element owns a bg-/from- class. Deep navy per the reference.
    'w-full h-[clamp(46px,6.4vh,56px)] rounded-2xl text-[15px] font-bold text-white bg-[#16284A] hover:bg-[#20365C] ' +
    'flex items-center justify-center gap-2 relative transition-all duration-200 hover:-translate-y-0.5 ' +
    'active:scale-[0.98] disabled:opacity-60 disabled:hover:translate-y-0 ' +
    'shadow-[0_14px_28px_-10px_rgba(22,40,74,0.5)] hover:shadow-[0_18px_34px_-10px_rgba(22,40,74,0.55)]';

  const IconTile: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 pointer-events-none">
      {children}
    </div>
  );

  return (
    // Desktop: exactly one viewport tall, never scrolls. Below `lg` the panels
    // stack and the page is allowed to scroll — clipping a Sign In button off a
    // phone screen would be worse than a scrollbar.
    <div className="min-h-screen overflow-y-auto lg:h-screen lg:supports-[height:100dvh]:h-[100dvh] lg:overflow-hidden flex items-center justify-center p-4 lg:p-[clamp(12px,2vh,24px)] font-sans relative">

      {/* ── Blurred office backdrop ──────────────────────────────────────────
          A premium ambient "bright office" is painted in CSS so the page is
          self-contained. Drop a real photo at /login-office.jpg (public/) and it
          fades in on top automatically — no code change needed. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* CSS ambient office (always present, acts as the fallback) — a cool-grey
            corporate interior warmed by daylight from the left window. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(65% 85% at 6% 28%, rgba(255,235,198,0.85) 0%, rgba(255,235,198,0) 46%),' +   // warm window, left
              'radial-gradient(38% 46% at 3% 80%, rgba(150,180,120,0.24) 0%, rgba(150,180,120,0) 55%),' +   // plant hint, lower-left
              'radial-gradient(88% 88% at 84% 18%, rgba(205,215,227,0.6) 0%, rgba(205,215,227,0) 55%),' +   // cool light, upper-right
              'linear-gradient(120deg,#e9e3d9 0%,#e3e6ea 44%,#d7dce2 100%)',                                 // warm → cool grey base
          }}
        />
        {/* Soft window-light bokeh — kept faint for a realistic, not flashy, blur */}
        <div className="absolute top-[10%] left-[6%] w-40 h-40 rounded-full bg-white/40 blur-3xl" />
        <div className="absolute top-[30%] left-[24%] w-24 h-24 rounded-full bg-amber-100/40 blur-2xl" />
        <div className="absolute bottom-[14%] left-[46%] w-52 h-52 rounded-full bg-white/30 blur-3xl" />
        {/* Premium corporate-office scene — only a LIGHT depth-of-field blur so the
            office (windows, desks, plants, cabins) stays recognizable. Lazy; fades
            in on load, ambient shows meanwhile. */}
        <img
          src="/login-office.jpg"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          onLoad={() => setBgReady(true)}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${bgReady ? 'opacity-100' : 'opacity-0'}`}
        />
        {/* Very light translucent veil for readability (≈4%) — do not wash out */}
        <div className="absolute inset-0 bg-white/[0.04]" />
        {/* Subtle warm light glow from the left, behind the branding */}
        <div
          className="absolute inset-y-0 left-0 w-[58%]"
          style={{ background: 'radial-gradient(60% 70% at 6% 42%, rgba(255,226,172,0.30) 0%, rgba(255,226,172,0) 70%)' }}
        />
        {/* Gentle centre lift behind the logo (keeps branding legible) */}
        <div className="absolute top-1/2 left-[26%] -translate-x-1/2 -translate-y-1/2 w-[46vw] h-[46vw] rounded-full bg-white/20 blur-[120px]" />
        {/* Soft edge vignette for depth */}
        <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 180px 40px rgba(60,70,90,0.12)' }} />
      </div>

      {/* Container */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-[1120px] max-h-full flex flex-col lg:flex-row items-center justify-between relative z-10 gap-10 lg:gap-8"
      >

        {/* ── Left Side: Branding & Illustration ─────────────────────────────── */}
        <div className="lg:w-1/2 flex flex-col items-center justify-center text-center px-2">

          {/* Showcase stage — desktop only. Orbit rings/lines removed; only the
              centre logo card + pedestal and the floating feature cards remain. */}
          <div className="hidden lg:block relative w-[340px] h-[340px] xl:w-[400px] xl:h-[400px] mb-2">

            {/* Feature nodes */}
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.key}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5"
                style={{ top: f.top, left: f.left }}
                animate={{ y: [0, -7, 0] }}
                transition={{ duration: 4.5 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.25 }}
                whileHover={{ scale: 1.06 }}
              >
                <div
                  className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-[0_8px_20px_-8px_rgba(16,24,40,0.22)] ring-1 ring-black/[0.03]"
                  style={{ backgroundColor: f.bg }}
                >
                  <f.Icon size={22} style={{ color: f.color }} strokeWidth={2.2} />
                </div>
                <span className="text-[12px] font-semibold text-slate-700 whitespace-nowrap">{f.key}</span>
              </motion.div>
            ))}

            {/* Central brand showcase — square logo tile (no outer circle) on a soft pedestal */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
              <ZeniaLogo size={116} radius={220} className="rounded-[24%] shadow-[0_16px_44px_-16px_rgba(199,126,82,0.38)] ring-1 ring-black/[0.05]" />
              {/* Pedestal — soft light, low intensity */}
              <div className="relative -mt-1">
                <div className="w-[104px] h-[22px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(240,203,174,0.55),rgba(240,203,174,0)_70%)] blur-[2px]" />
                <div className="w-[72px] h-2 mx-auto -mt-3 rounded-full bg-amber-200/30 blur-md" />
              </div>
            </div>
          </div>

          {/* Compact brand mark — mobile only */}
          <div className="lg:hidden mb-4">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-[0_10px_30px_-14px_rgba(199,126,82,0.35)] ring-1 ring-black/[0.04]">
              <ZeniaLogo size={52} radius={220} className="rounded-[24%]" />
            </div>
          </div>

          {/* Subtle premium frosted-glass panel behind the branding text for
              readability — extends outward via negative insets so it reads as
              padded glass WITHOUT moving any element. Floating cards excluded. */}
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-8 -inset-y-6 rounded-[22px] border border-white/25 bg-white/[0.12] shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
              style={{ backdropFilter: 'blur(15px)', WebkitBackdropFilter: 'blur(15px)' }}
            />
            <div className="relative">
          <h1
            className="text-[34px] leading-none font-bold tracking-tight font-heading mb-2"
            style={{ textShadow: '0 1px 2px rgba(255,255,255,0.9), 0 2px 10px rgba(255,255,255,0.7)' }}
          >
            {/* One seamless wordmark: adjacent spans, no gap. Zenia=navy, HR=bronze. */}
            <span style={{ color: NAVY }}>Zenia</span><span style={{ color: BROWN }}>HR</span>
          </h1>
          <h2
            className="text-[15px] font-semibold text-slate-700 mb-3"
            style={{ textShadow: '0 1px 6px rgba(255,255,255,0.75)' }}
          >
            Smart HR Management Simplified
          </h2>
          <p
            className="text-slate-700 text-sm leading-relaxed max-w-sm mx-auto mb-6"
            style={{ textShadow: '0 1px 6px rgba(255,255,255,0.7)' }}
          >
            Manage your employees, payroll, attendance, and more from a single powerful platform.
          </p>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              { Icon: ShieldCheck, color: '#2563EB', l1: 'Secure', l2: '& Reliable' },
              { Icon: Zap, color: '#F1801C', l1: 'Fast', l2: '& Efficient' },
              { Icon: BarChart3, color: '#8B5CF6', l1: 'Data', l2: '& Insights' },
            ].map((b) => (
              <div key={b.l1} className="flex items-center gap-2.5 bg-white/85 backdrop-blur border border-white/70 rounded-2xl px-4 py-2.5 shadow-[0_6px_18px_-10px_rgba(16,24,40,0.25)]">
                <b.Icon size={20} style={{ color: b.color }} strokeWidth={2.3} />
                <div className="text-left leading-tight">
                  <div className="text-[13px] font-bold" style={{ color: b.color }}>{b.l1}</div>
                  <div className="text-[12px] font-semibold text-slate-600">{b.l2}</div>
                </div>
              </div>
            ))}
          </div>
            </div>{/* /branding glass content */}
          </div>{/* /branding glass panel */}
        </div>

        {/* ── Right Side: Login Panel ────────────────────────────────────────── */}
        <div className="lg:w-1/2 flex items-center justify-center w-full max-h-full relative z-20">
          <div className="w-full max-w-[452px] max-h-[calc(100dvh-1.5rem)] lg:max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white/90 backdrop-blur-2xl rounded-[32px] shadow-[0_30px_80px_-24px_rgba(16,24,40,0.25)] p-[clamp(20px,3.2vh,32px)] border border-white/70 relative">
            <div className="relative z-10">
              {!isForgotPassword ? (
                <>
                  {/* Language selector (top-right) — decorative dot grid removed. */}
                  <div className="flex items-start justify-end mb-2">
                    <div className="relative">

                      {langOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
                          <ul
                            role="listbox"
                            className="absolute right-0 mt-1.5 z-20 w-32 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-[13px] font-medium text-slate-700"
                          >

                          </ul>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mb-[clamp(12px,2.2vh,20px)]">
                    <h3 className="text-[28px] font-extrabold text-slate-900 mb-1 font-heading tracking-tight flex items-center gap-2">
                      Welcome back! <span className="inline-block" aria-hidden="true">👋</span>
                    </h3>
                    <p className="text-slate-500 text-[14px] font-medium">Sign in to your super admin account</p>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="space-y-[clamp(10px,1.6vh,14px)]">
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

                    {/* Email */}
                    <div className="relative">
                      <IconTile><Mail size={18} strokeWidth={2} /></IconTile>
                      <input
                        type="email"
                        required
                        aria-label="Email address"
                        placeholder="Enter your email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        onBlur={() => checkCaptchaStatus(email)}
                        className={`${inputBase} pl-[60px] pr-4`}
                      />
                    </div>

                    {/* Password */}
                    <div className="relative">
                      <IconTile><Lock size={18} strokeWidth={2} /></IconTile>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        aria-label="Password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className={`${inputBase} pl-[60px] pr-12`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                      </button>
                    </div>

                    {/* CAPTCHA — appears only when the backend requires it */}
                    {captchaInfo?.captchaRequired && (
                      <div className="space-y-2.5 pt-0.5">
                        <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider block">
                          CAPTCHA
                        </label>
                        {captchaInfo.captchaType === 'internal' ? (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              {/* The generated SVG carries a viewBox, so scaling it in CSS
                                keeps the glyphs sharp — no change to the generator. */}
                              <div
                                dangerouslySetInnerHTML={{ __html: captchaSvg }}
                                aria-label="CAPTCHA image"
                                className="h-[clamp(46px,6.4vh,56px)] rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden [&>svg]:block [&>svg]:h-9 [&>svg]:w-auto"
                              />
                              <button
                                type="button"
                                onClick={loadInternalCaptcha}
                                aria-label="Get a new CAPTCHA code"
                                className="h-[clamp(46px,6.4vh,56px)] rounded-2xl bg-white border border-[#E9E9EC] flex items-center justify-center gap-2 text-[14px] font-bold hover:bg-[#F8F1EB] transition-colors"
                                style={{ color: BROWN }}
                              >
                                <RefreshCw size={16} strokeWidth={2.5} />
                                Refresh
                              </button>
                            </div>
                            <div className="relative">
                              <IconTile><ShieldCheck size={18} strokeWidth={2} /></IconTile>
                              <input
                                type="text"
                                required
                                aria-label="Enter the CAPTCHA characters"
                                placeholder="Enter the characters above"
                                value={captchaAnswer}
                                onChange={e => setCaptchaAnswer(e.target.value)}
                                className={`${inputBase} pl-[60px] pr-4 uppercase tracking-wider`}
                              />
                            </div>
                          </>
                        ) : captchaInfo.captchaType === 'google_v2' ? (
                          <div className="p-1.5 bg-slate-50 border border-slate-200 rounded-2xl">
                            <div id="recaptcha-v2-container" className="w-full flex justify-center" />
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 leading-tight p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                            Protected by Google reCAPTCHA v3
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-end pt-0.5">
                      <button
                        type="button"
                        onClick={() => { setError(''); setSuccessMsg(''); resetForgotFlow(); setForgotEmail(email.trim()); setIsForgotPassword(true); }}
                        className="text-[13px] font-semibold transition-colors hover:opacity-80"
                        style={{ color: BROWN }}
                      >
                        Forgot password?
                      </button>
                    </div>

                    <div className="pt-1">
                      <button type="submit" disabled={submitting} className={primaryBtn}>
                        <Lock size={18} strokeWidth={2.5} />
                        {submitting ? 'Signing In…' : 'Sign In'}
                        <ArrowRight size={18} strokeWidth={2.5} className="absolute right-5" />
                      </button>
                    </div>
                  </form>

                  <div className="text-center pt-[clamp(12px,2.2vh,20px)]">
                    <p className="text-[13px] text-slate-500 font-medium">
                      Don't have an account? <a href="#" className="font-bold hover:underline" style={{ color: BROWN }}>Contact Support</a>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-[18px]">
                    <h3 className="text-[26px] font-extrabold text-slate-900 mb-1.5 font-heading tracking-tight">
                      {forgotStep === 'email' && 'Forgot Password'}
                      {forgotStep === 'otp' && 'Verify Code'}
                      {forgotStep === 'reset' && 'Set New Password'}
                    </h3>
                    <p className="text-slate-500 text-[13px] font-medium">
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
                        <div key={s} className="h-1.5 flex-1 rounded-full transition-colors" style={{ backgroundColor: active ? BROWN : '#E2E8F0' }} />
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
                      <div className="relative">
                        <IconTile><Mail size={18} strokeWidth={2} /></IconTile>
                        <input
                          type="email"
                          required
                          aria-label="Registered email address"
                          placeholder="Email address"
                          value={forgotEmail}
                          onChange={e => setForgotEmail(e.target.value)}
                          className={`${inputBase} pl-[60px] pr-4`}
                        />
                      </div>
                      <div className="pt-2 space-y-3">
                        <button type="submit" disabled={submitting} className={primaryBtn}>
                          {submitting ? 'Sending…' : 'Send Verification Code'}
                        </button>
                        <button type="button" onClick={() => { setIsForgotPassword(false); resetForgotFlow(); }} className="w-full h-12 bg-white border border-slate-200 hover:bg-slate-50 text-[15px] font-bold text-slate-600 rounded-2xl transition-all duration-200 active:scale-[0.98]">
                          Back to Sign In
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Step 2: OTP */}
                  {forgotStep === 'otp' && (
                    <form onSubmit={handleVerifyOtp} className="space-y-3">
                      <div className="relative">
                        <IconTile><KeyRound size={18} strokeWidth={2} /></IconTile>
                        <input
                          type="text"
                          required
                          inputMode="numeric"
                          maxLength={6}
                          aria-label="6-digit verification code"
                          placeholder="6-digit code"
                          value={otp}
                          onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                          className={`${inputBase} pl-[60px] pr-4 tracking-[0.4em] font-semibold`}
                        />
                      </div>
                      <div className="pt-2 space-y-3">
                        <button type="submit" disabled={submitting} className={primaryBtn}>
                          {submitting ? 'Verifying…' : 'Verify Code'}
                        </button>
                        <button type="button" onClick={() => { setError(''); setSuccessMsg(''); setOtp(''); handleRequestOtp(new Event('submit') as any); }} className="w-full text-[13px] font-semibold transition-colors hover:opacity-80" style={{ color: BROWN }}>
                          Resend code
                        </button>
                        <button type="button" onClick={() => { setError(''); setSuccessMsg(''); setForgotStep('email'); }} className="w-full h-12 bg-white border border-slate-200 hover:bg-slate-50 text-[14px] font-bold text-slate-600 rounded-2xl transition-all duration-200 active:scale-[0.98]">
                          Back
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Step 3: new password */}
                  {forgotStep === 'reset' && (
                    <form onSubmit={handleResetPassword} className="space-y-3">
                      <div className="relative">
                        <IconTile><ShieldCheck size={18} strokeWidth={2} /></IconTile>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          aria-label="New password"
                          placeholder="New password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          className={`${inputBase} pl-[60px] pr-12`}
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                          {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                        </button>
                      </div>
                      <div className="pt-2 space-y-3">
                        <button type="submit" disabled={submitting} className={primaryBtn}>
                          {submitting ? 'Resetting…' : 'Reset Password'}
                        </button>
                        <button type="button" onClick={() => { setIsForgotPassword(false); resetForgotFlow(); }} className="w-full h-12 bg-white border border-slate-200 hover:bg-slate-50 text-[15px] font-bold text-slate-600 rounded-2xl transition-all duration-200 active:scale-[0.98]">
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

      </motion.div>

    </div>
  );
};
