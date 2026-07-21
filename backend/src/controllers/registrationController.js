// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC COMPANY SELF-REGISTRATION (FREE plan) — two stateless, unauthenticated
// endpoints:
//
//   POST /api/auth/register-company/start   validate + CAPTCHA + email OTP
//   POST /api/auth/register-company/verify   check OTP → provision → auto-login
//
// No new DB table: the pending registration lives inside a short-lived signed
// JWT (`verificationToken`). The head's password is embedded ONLY as its bcrypt
// hash — never plaintext — and the OTP only as its bcrypt hash. This mirrors the
// stateless HMAC pattern already used by the internal CAPTCHA.
// ─────────────────────────────────────────────────────────────────────────────
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { sendOtpEmail } = require('../services/emailService');
const { provisionFreeCompany } = require('../services/companyProvisioning');
const { getLockedModules, getLockedPages, getAllowedReports, getEntitlements } = require('../services/planEntitlements');

const JWT_SECRET = process.env.JWT_SECRET;
const REG_PURPOSE = 'company_registration';
const OTP_EXPIRY_MINUTES = 10;

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same client-facing shape as authController.toSafeUser so the auto-login
// response is interchangeable with a normal login.
const toSafeUser = (user) => {
  const { passwordHash, permissions: rawPermissions, ...rest } = user;
  const parsed = rawPermissions || {};
  return { ...rest, permissions: parsed.permissions || {}, moduleAccess: parsed.moduleAccess || {} };
};

const generateSessionToken = (id) =>
  jwt.sign({ id }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });

// Verify an internal SVG CAPTCHA answer against its signed captchaId. Same HMAC
// scheme as authController.generateInternalCaptcha (`hash.expiresAt`).
function verifyInternalCaptcha(captchaId, captchaAnswer) {
  if (isBlank(captchaId) || isBlank(captchaAnswer)) return false;
  const parts = String(captchaId).split('.');
  if (parts.length !== 2) return false;
  const [hash, expiresAtStr] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(String(captchaAnswer).trim().toUpperCase() + '.' + expiresAt)
    .digest('hex');
  // Constant-time compare.
  const a = Buffer.from(hash);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Step 1: validate everything, send the OTP, return the signed token ────────
exports.registerCompanyStart = async (req, res) => {
  try {
    const b = req.body || {};
    const company = b.company || {};
    const head = b.head || {};
    const branch = b.branch || {};

    // ── Required fields ──
    const missing = [];
    if (isBlank(company.name)) missing.push('Company name');
    if (isBlank(company.email)) missing.push('Company email');
    if (isBlank(head.name)) missing.push('Company Head full name');
    if (isBlank(head.email)) missing.push('Company Head email');
    if (isBlank(head.mobile)) missing.push('Company Head mobile number');
    if (isBlank(head.password)) missing.push('Password');
    if (missing.length) {
      return res.status(400).json({ error: `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required.`, code: 'REQUIRED_MISSING' });
    }

    const companyEmail = String(company.email).trim().toLowerCase();
    const headEmail = String(head.email).trim().toLowerCase();
    const password = String(head.password);

    // ── Format / strength ──
    if (!EMAIL_RE.test(companyEmail)) return res.status(400).json({ error: 'Please enter a valid company email address.', code: 'VALIDATION' });
    if (!EMAIL_RE.test(headEmail)) return res.status(400).json({ error: 'Please enter a valid Company Head email address.', code: 'VALIDATION' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters long.', code: 'VALIDATION' });
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'Password must include both letters and numbers.', code: 'VALIDATION' });
    if (!isBlank(b.confirmPassword) && String(b.confirmPassword) !== password) {
      return res.status(400).json({ error: 'Password and confirmation do not match.', code: 'VALIDATION' });
    }
    if (b.acceptedTerms !== true || b.acceptedPrivacy !== true) {
      return res.status(400).json({ error: 'You must accept the Terms & Conditions and Privacy Policy.', code: 'TERMS_REQUIRED' });
    }

    // ── CAPTCHA (internal SVG) ──
    if (!verifyInternalCaptcha(b.captchaId, b.captchaAnswer)) {
      return res.status(400).json({ error: 'Invalid CAPTCHA. Please enter the correct characters.', code: 'CAPTCHA_FAILED' });
    }

    // ── Duplicate account guard (the login identifier is the head email) ──
    const existing = await prisma.user.findFirst({ where: { email: headEmail }, select: { id: true } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.', code: 'DUPLICATE' });
    }

    // ── Generate + email the OTP; embed the pending registration in a signed token ──
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const [passwordHash, otpHash] = await Promise.all([bcrypt.hash(password, 10), bcrypt.hash(otp, 10)]);

    const verificationToken = jwt.sign(
      {
        purpose: REG_PURPOSE,
        otpHash,
        reg: {
          company: {
            name: String(company.name).trim(),
            email: companyEmail,
            phone: isBlank(company.phone) ? '' : String(company.phone).trim(),
            industry: isBlank(company.industry) ? '' : String(company.industry).trim(),
            country: isBlank(company.country) ? '' : String(company.country).trim(),
            state: isBlank(company.state) ? '' : String(company.state).trim(),
            city: isBlank(company.city) ? '' : String(company.city).trim(),
          },
          head: { name: String(head.name).trim(), email: headEmail, mobile: String(head.mobile).trim(), passwordHash },
          branch: {
            branchName: isBlank(branch.branchName) ? 'Head Office' : String(branch.branchName).trim(),
            address: isBlank(branch.address) ? '' : String(branch.address).trim(),
          },
        },
      },
      JWT_SECRET,
      { expiresIn: `${OTP_EXPIRY_MINUTES}m` }
    );

    const delivery = await sendOtpEmail(companyEmail, otp, head.name, OTP_EXPIRY_MINUTES);

    // SMTP configured but the provider rejected → be honest, don't pretend it sent.
    if (!delivery.delivered && delivery.configured) {
      return res.status(502).json({ error: 'We could not send the verification email right now. Please try again in a few minutes.' });
    }

    const payload = {
      message: `A verification code has been sent to ${companyEmail}.`,
      verificationToken,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    };
    // Dev convenience: when SMTP is NOT configured, return the OTP so the flow is
    // testable locally (never happens once SMTP env vars are set or in production).
    if (delivery.devMode && !delivery.configured && process.env.NODE_ENV !== 'production') {
      payload.devOtp = otp;
      payload.devNote = 'SMTP not configured — OTP returned for development only.';
    }
    return res.json(payload);
  } catch (error) {
    console.error('[REGISTER START ERROR]', error);
    return res.status(500).json({ error: 'Server error while starting registration. Please try again.' });
  }
};

// ── Step 2: verify the OTP, provision the workspace, auto-login ───────────────
exports.registerCompanyVerify = async (req, res) => {
  try {
    const { verificationToken, otp } = req.body || {};
    if (isBlank(verificationToken) || isBlank(otp)) {
      return res.status(400).json({ error: 'The verification code is required.', code: 'REQUIRED_MISSING' });
    }

    let decoded;
    try {
      decoded = jwt.verify(verificationToken, JWT_SECRET);
    } catch (_) {
      return res.status(401).json({ error: 'Your verification session has expired. Please start again.', code: 'EXPIRED' });
    }
    if (decoded.purpose !== REG_PURPOSE || !decoded.reg || !decoded.otpHash) {
      return res.status(400).json({ error: 'Invalid verification token.', code: 'INVALID_TOKEN' });
    }

    const otpOk = await bcrypt.compare(String(otp).trim(), decoded.otpHash);
    if (!otpOk) {
      return res.status(400).json({ error: 'Incorrect verification code. Please check your email and try again.', code: 'OTP_INVALID' });
    }

    // ── Provision the whole workspace ──
    let created;
    try {
      created = await provisionFreeCompany(decoded.reg);
    } catch (err) {
      if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message, code: 'DUPLICATE' });
      if (err.code === 'REQUIRED_MISSING') return res.status(400).json({ error: err.message, code: 'REQUIRED_MISSING' });
      console.error('[REGISTER PROVISION ERROR]', err);
      return res.status(500).json({ error: 'We could not create your workspace. Please try again.' });
    }

    // ── Auto-login: same response shape as POST /api/auth/login ──
    const safeUser = toSafeUser(created.head);
    safeUser.plan = created.company.plan;
    safeUser.lockedModules = getLockedModules(created.company.plan);
    safeUser.lockedPages = getLockedPages(created.company.plan);
    safeUser.allowedReports = getAllowedReports(created.company.plan);
    // A brand-new FREE workspace: seat usage + the un-onboarded ledger, so the
    // first-login onboarding gate shows immediately (no /auth/me round-trip flash).
    const lim = getEntitlements(created.company.plan).limits || {};
    safeUser.employeeLimit = (lim.maxEmployees == null || lim.maxEmployees < 0) ? null : lim.maxEmployees;
    safeUser.employeeCount = 0;
    safeUser.onboarding = { firstLoginCompleted: false, onboardingCompleted: false, usedSampleWorkspace: false, sampleDataRemoved: false, choice: null };

    return res.status(201).json({
      message: 'Welcome to ZeniaHR! Your free workspace has been created.',
      token: generateSessionToken(created.head.id),
      user: safeUser,
      company: { id: created.company.id, name: created.company.name, plan: created.company.plan },
    });
  } catch (error) {
    console.error('[REGISTER VERIFY ERROR]', error);
    return res.status(500).json({ error: 'Server error while completing registration. Please try again.' });
  }
};
