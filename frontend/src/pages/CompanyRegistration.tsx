import React, { useState, useEffect } from 'react';
import {
  Building2, Mail, Phone, Briefcase, Users, Globe, MapPin, User, Lock, Smartphone,
  Eye, EyeOff, ShieldCheck, RefreshCw, ArrowRight, ArrowLeft, CheckCircle2, PartyPopper, Sparkles, Rocket,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '@/api/apiClient';
import { authStorage } from '@/utils/authStorage';
import { validateEmail } from '@/utils/validation';
import { ZeniaLogo } from '@/components/brand/ZeniaLogo';
import type { UserAccount } from '@/pages/Login';

interface CompanyRegistrationProps {
  onBack: () => void;
  /** Auto-login into the freshly created workspace. */
  onRegistered: (user: UserAccount, token: string) => void;
}

const INDUSTRIES = ['Information Technology', 'Manufacturing', 'Retail & E-commerce', 'Healthcare', 'Finance & Banking', 'Construction', 'Education', 'Hospitality', 'Logistics', 'Security Services', 'Consulting', 'Other'];
const COMPANY_SIZES = ['1–10', '11–25', '26–50', '51–100', '101–250', '251–500', '500+'];
const COUNTRIES = ['India', 'United States', 'United Kingdom', 'United Arab Emirates', 'Singapore', 'Australia', 'Canada', 'Other'];

const BROWN = '#C67B49';
const NAVY = '#16284A';

export const CompanyRegistration: React.FC<CompanyRegistrationProps> = ({ onBack, onRegistered }) => {
  const [phase, setPhase] = useState<'form' | 'otp' | 'success'>('form');
  const [step, setStep] = useState(1); // 1..4
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form data
  const [company, setCompany] = useState({ name: '', email: '', phone: '', industry: '', companySize: '', country: 'India', state: '', city: '' });
  const [head, setHead] = useState({ name: '', email: '', mobile: '', password: '', confirmPassword: '' });
  const [branch, setBranch] = useState({ branchName: 'Head Office', address: '' });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

  // CAPTCHA (internal SVG — same system as login)
  const [captchaId, setCaptchaId] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  // OTP
  const [verificationToken, setVerificationToken] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [otp, setOtp] = useState('');

  // Auto-login payload from verify
  const [createdUser, setCreatedUser] = useState<UserAccount | null>(null);
  const [createdToken, setCreatedToken] = useState('');

  const loadCaptcha = async () => {
    try {
      const res = await api.auth.getInternalCaptcha();
      setCaptchaId(res.captchaId);
      setCaptchaSvg(res.captchaSvg);
      setCaptchaAnswer('');
    } catch (e) {
      console.error('Failed to load CAPTCHA', e);
    }
  };

  // Load a CAPTCHA when the user reaches the final step.
  useEffect(() => {
    if (phase === 'form' && step === 4 && !captchaId) loadCaptcha();
  }, [phase, step, captchaId]);

  const cx = (field: keyof typeof company, v: string) => setCompany(c => ({ ...c, [field]: v }));
  const hx = (field: keyof typeof head, v: string) => setHead(h => ({ ...h, [field]: v }));

  // ── Per-step validation ──
  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!company.name.trim()) return 'Please enter your company name.';
      const ec = validateEmail(company.email.trim());
      if (!ec.isValid) return ec.error || 'Please enter a valid company email.';
      if (!company.phone.trim()) return 'Please enter a company phone number.';
      if (!company.industry) return 'Please select an industry.';
      if (!company.companySize) return 'Please select a company size.';
      if (!company.country) return 'Please select a country.';
      if (!company.state.trim()) return 'Please enter a state.';
      if (!company.city.trim()) return 'Please enter a city.';
    }
    if (s === 2) {
      if (!head.name.trim()) return "Please enter the Company Head's full name.";
      const ec = validateEmail(head.email.trim());
      if (!ec.isValid) return ec.error || 'Please enter a valid email.';
      if (head.mobile.replace(/\D/g, '').length < 7) return 'Please enter a valid mobile number.';
      if (head.password.length < 8) return 'Password must be at least 8 characters long.';
      if (!/[A-Za-z]/.test(head.password) || !/[0-9]/.test(head.password)) return 'Password must include both letters and numbers.';
      if (head.password !== head.confirmPassword) return 'Password and confirmation do not match.';
    }
    if (s === 3) {
      if (!branch.branchName.trim()) return 'Please enter a branch name.';
      if (!branch.address.trim()) return 'Please enter the head office address.';
    }
    if (s === 4) {
      if (!acceptedTerms || !acceptedPrivacy) return 'Please accept the Terms & Conditions and Privacy Policy.';
      if (!captchaAnswer.trim()) return 'Please enter the CAPTCHA characters.';
    }
    return null;
  };

  const next = () => {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError('');
    setStep(s => Math.min(4, s + 1));
  };
  const back = () => { setError(''); setStep(s => Math.max(1, s - 1)); };

  // ── Step 4 → send OTP ──
  const handleCreateAccount = async () => {
    const err = validateStep(4);
    if (err) { setError(err); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await api.auth.registerCompanyStart({
        company, head: { name: head.name, email: head.email, mobile: head.mobile, password: head.password },
        confirmPassword: head.confirmPassword,
        branch,
        acceptedTerms, acceptedPrivacy,
        captchaId, captchaAnswer,
      });
      setVerificationToken(res.verificationToken);
      if (res.devOtp) setDevOtp(res.devOtp);
      setPhase('otp');
    } catch (e: any) {
      setError(e.message || 'We could not start your registration. Please try again.');
      // A consumed/expired CAPTCHA must be refreshed for the next attempt.
      loadCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  // ── OTP → verify → provision ──
  const handleVerify = async () => {
    if (otp.trim().length < 6) { setError('Please enter the 6-digit verification code.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await api.auth.registerCompanyVerify({ verificationToken, otp: otp.trim() });
      if (!res?.token || !res?.user) { setError('Registration failed. Invalid response from server.'); return; }
      setCreatedUser(res.user);
      setCreatedToken(res.token);
      setPhase('success');
    } catch (e: any) {
      setError(e.message || 'Verification failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const enterApp = () => {
    if (!createdUser || !createdToken) return;
    // Session-only auth, identical to the Login page.
    authStorage.setRemember(false);
    authStorage.set('hrms_jwt_token', createdToken);
    onRegistered(createdUser, createdToken);
  };

  // ── Shared presentation tokens ──
  const inputBase =
    'w-full h-12 bg-white border border-[#E9E9EC] rounded-2xl text-sm text-slate-900 placeholder-slate-400 ' +
    'shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus:outline-none focus:border-[#C67B49] focus:ring-[3px] focus:ring-[#C67B49]/15 transition-all font-medium';
  const primaryBtn =
    'h-12 px-6 rounded-2xl text-[15px] font-bold text-white bg-[#16284A] hover:bg-[#20365C] flex items-center justify-center gap-2 ' +
    'transition-all duration-200 active:scale-[0.98] disabled:opacity-60 shadow-[0_14px_28px_-10px_rgba(22,40,74,0.5)]';
  const ghostBtn =
    'h-12 px-5 rounded-2xl text-[15px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]';
  const iconL = 'absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none';
  const withIcon = `${inputBase} pl-11 pr-4`;

  const Field: React.FC<{ children: React.ReactNode; icon: React.ReactNode }> = ({ children, icon }) => (
    <div className="relative">
      <span className={iconL}>{icon}</span>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 font-sans"
      style={{ background: 'linear-gradient(120deg,#e9e3d9 0%,#e3e6ea 44%,#d7dce2 100%)' }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }}
        className="w-full max-w-[560px] bg-white/95 backdrop-blur-2xl rounded-[28px] shadow-[0_30px_80px_-24px_rgba(16,24,40,0.28)] border border-white/70 overflow-hidden max-h-[calc(100dvh-2rem)] flex flex-col"
      >
        {/* Header */}
        <div className="px-7 pt-6 pb-4 border-b border-slate-100 flex items-center gap-3">
          <ZeniaLogo size={40} radius={220} className="rounded-[24%] shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-[19px] font-extrabold tracking-tight leading-none">
              <span style={{ color: NAVY }}>Zenia</span><span style={{ color: BROWN }}>HR</span>
            </h1>
            <p className="text-[12px] text-slate-500 font-medium mt-0.5">Create your free workspace</p>
          </div>
          {phase === 'form' && (
            <span className="text-[11px] font-bold text-slate-400 bg-slate-100 rounded-full px-2.5 py-1">Step {step} / 4</span>
          )}
        </div>

        {/* Progress */}
        {phase === 'form' && (
          <div className="flex items-center gap-1.5 px-7 pt-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-1.5 flex-1 rounded-full transition-colors" style={{ backgroundColor: step >= i ? BROWN : '#E2E8F0' }} />
            ))}
          </div>
        )}

        <div className="px-7 py-5 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 font-semibold">{error}</div>
          )}

          {/* ─── FORM ─── */}
          {phase === 'form' && (
            <>
              {step === 1 && (
                <div className="space-y-3">
                  <h2 className="text-[16px] font-bold text-slate-900 mb-1">Company Information</h2>
                  <Field icon={<Building2 size={17} />}><input className={withIcon} placeholder="Company name" value={company.name} onChange={e => cx('name', e.target.value)} /></Field>
                  <Field icon={<Mail size={17} />}><input type="email" className={withIcon} placeholder="Company email" value={company.email} onChange={e => cx('email', e.target.value)} /></Field>
                  <Field icon={<Phone size={17} />}><input className={withIcon} placeholder="Company phone" value={company.phone} onChange={e => cx('phone', e.target.value)} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field icon={<Briefcase size={17} />}><select className={`${withIcon} appearance-none`} value={company.industry} onChange={e => cx('industry', e.target.value)}><option value="">Industry</option>{INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}</select></Field>
                    <Field icon={<Users size={17} />}><select className={`${withIcon} appearance-none`} value={company.companySize} onChange={e => cx('companySize', e.target.value)}><option value="">Company size</option>{COMPANY_SIZES.map(i => <option key={i} value={i}>{i} employees</option>)}</select></Field>
                  </div>
                  <Field icon={<Globe size={17} />}><select className={`${withIcon} appearance-none`} value={company.country} onChange={e => cx('country', e.target.value)}><option value="">Country</option>{COUNTRIES.map(i => <option key={i} value={i}>{i}</option>)}</select></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field icon={<MapPin size={17} />}><input className={withIcon} placeholder="State" value={company.state} onChange={e => cx('state', e.target.value)} /></Field>
                    <Field icon={<MapPin size={17} />}><input className={withIcon} placeholder="City" value={company.city} onChange={e => cx('city', e.target.value)} /></Field>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <h2 className="text-[16px] font-bold text-slate-900 mb-1">Company Head Account</h2>
                  <p className="text-[12px] text-slate-500 -mt-1 mb-1">This becomes your admin login for the workspace.</p>
                  <Field icon={<User size={17} />}><input className={withIcon} placeholder="Full name" value={head.name} onChange={e => hx('name', e.target.value)} /></Field>
                  <Field icon={<Mail size={17} />}><input type="email" className={withIcon} placeholder="Email (your login)" value={head.email} onChange={e => hx('email', e.target.value)} /></Field>
                  <Field icon={<Smartphone size={17} />}><input className={withIcon} placeholder="Mobile number" value={head.mobile} onChange={e => hx('mobile', e.target.value)} /></Field>
                  <div className="relative">
                    <span className={iconL}><Lock size={17} /></span>
                    <input type={showPassword ? 'text' : 'password'} className={`${withIcon} pr-11`} placeholder="Password (min 8, letters + numbers)" value={head.password} onChange={e => hx('password', e.target.value)} />
                    <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                  </div>
                  <Field icon={<Lock size={17} />}><input type={showPassword ? 'text' : 'password'} className={withIcon} placeholder="Confirm password" value={head.confirmPassword} onChange={e => hx('confirmPassword', e.target.value)} /></Field>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <h2 className="text-[16px] font-bold text-slate-900 mb-1">Head Office</h2>
                  <p className="text-[12px] text-slate-500 -mt-1 mb-1">Your first branch. You can add more later.</p>
                  <Field icon={<Building2 size={17} />}><input className={withIcon} placeholder="Branch name" value={branch.branchName} onChange={e => setBranch(b => ({ ...b, branchName: e.target.value }))} /></Field>
                  <div className="relative">
                    <span className="absolute left-3.5 top-4 text-slate-400 pointer-events-none"><MapPin size={17} /></span>
                    <textarea rows={3} className={`${inputBase} h-auto pl-11 pr-4 py-3 resize-none`} placeholder="Head office address" value={branch.address} onChange={e => setBranch(b => ({ ...b, address: e.target.value }))} />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <h2 className="text-[16px] font-bold text-slate-900 mb-1">Almost done</h2>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)} className="mt-0.5 accent-[#16284A] w-4 h-4" />
                    <span className="text-[13px] text-slate-600">I agree to the <a href="#" className="font-bold" style={{ color: BROWN }}>Terms &amp; Conditions</a>.</span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={acceptedPrivacy} onChange={e => setAcceptedPrivacy(e.target.checked)} className="mt-0.5 accent-[#16284A] w-4 h-4" />
                    <span className="text-[13px] text-slate-600">I agree to the <a href="#" className="font-bold" style={{ color: BROWN }}>Privacy Policy</a>.</span>
                  </label>

                  <div className="pt-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Security check</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div dangerouslySetInnerHTML={{ __html: captchaSvg }} aria-label="CAPTCHA image" className="h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden [&>svg]:block [&>svg]:h-9 [&>svg]:w-auto" />
                      <button type="button" onClick={loadCaptcha} className="h-12 rounded-2xl bg-white border border-[#E9E9EC] flex items-center justify-center gap-2 text-[14px] font-bold hover:bg-[#F8F1EB]" style={{ color: BROWN }}><RefreshCw size={15} strokeWidth={2.5} />Refresh</button>
                    </div>
                    <Field icon={<ShieldCheck size={17} />}>
                      <input className={`${withIcon} mt-3 uppercase tracking-wider`} placeholder="Enter the characters above" value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)} />
                    </Field>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── OTP ─── */}
          {phase === 'otp' && (
            <div className="space-y-4 text-center py-2">
              <div className="w-14 h-14 rounded-2xl bg-[#EEF4FF] flex items-center justify-center mx-auto"><Mail size={26} className="text-[#16284A]" /></div>
              <div>
                <h2 className="text-[18px] font-bold text-slate-900">Verify your email</h2>
                <p className="text-[13px] text-slate-500 mt-1">We sent a 6-digit code to <b>{company.email}</b>.</p>
              </div>
              {devOtp && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 font-semibold">
                  Dev mode (no email configured) — your code is <span className="font-mono text-sm tracking-widest">{devOtp}</span>
                </div>
              )}
              <input inputMode="numeric" maxLength={6} className={`${inputBase} text-center text-2xl tracking-[0.5em] font-bold`} placeholder="000000" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} />
              <button onClick={handleVerify} disabled={submitting} className={`${primaryBtn} w-full`}>{submitting ? 'Verifying…' : 'Verify & Create Account'}<ArrowRight size={18} /></button>
              <button onClick={() => { setError(''); setOtp(''); setPhase('form'); setStep(4); }} className="text-[13px] font-semibold" style={{ color: BROWN }}>Back to form</button>
            </div>
          )}

          {/* ─── SUCCESS ─── */}
          {phase === 'success' && (
            <div className="space-y-5 text-center py-3">
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
                <PartyPopper size={30} className="text-emerald-600" />
              </motion.div>
              <div>
                <h2 className="text-[22px] font-extrabold text-slate-900 flex items-center justify-center gap-2">🎉 Welcome to ZeniaHR</h2>
                <p className="text-[14px] text-slate-500 mt-1.5">Your <b>Free</b> workspace has been created successfully.</p>
              </div>
              <div className="flex flex-col gap-2.5 pt-1">
                <button onClick={enterApp} className={`${primaryBtn} w-full`}><Rocket size={17} />Go to Dashboard</button>
                <button onClick={enterApp} className={`${ghostBtn} w-full`}><Sparkles size={16} />Explore Features</button>
                <button onClick={enterApp} className="text-[13px] font-bold" style={{ color: BROWN }}>Upgrade Plan</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav (form only) */}
        {phase === 'form' && (
          <div className="px-7 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <button onClick={step === 1 ? onBack : back} className={ghostBtn}><ArrowLeft size={17} />{step === 1 ? 'Sign In' : 'Back'}</button>
            {step < 4
              ? <button onClick={next} className={primaryBtn}>Continue<ArrowRight size={18} /></button>
              : <button onClick={handleCreateAccount} disabled={submitting} className={primaryBtn}>{submitting ? 'Creating…' : 'Create Account'}<CheckCircle2 size={18} /></button>}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default CompanyRegistration;
