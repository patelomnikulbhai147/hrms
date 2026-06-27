const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { sendOtpEmail } = require('../services/emailService');

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET;

// Login session token. Remember Me extends the lifetime so the session
// survives a browser restart; a normal login gets a short-lived token.
const generateToken = (id, rememberMe) => {
  const expiresIn = rememberMe
    ? process.env.JWT_REMEMBER_EXPIRES_IN || '30d'
    : process.env.JWT_EXPIRES_IN || '12h';
  return jwt.sign({ id }, JWT_SECRET, { expiresIn });
};

// Short-lived token proving the user passed OTP verification. Scoped with a
// purpose so it can never be used as a normal session token.
const generateResetToken = (id) =>
  jwt.sign({ id, purpose: 'password_reset' }, JWT_SECRET, {
    expiresIn: process.env.RESET_TOKEN_EXPIRES_IN || '15m',
  });

const normalizeEmail = (value) => (value || '').trim().toLowerCase();
const normalizeIdentifier = (value) => (value || '').trim();

// Build a safe, client-facing user object (never leak password material).
const toSafeUser = (user) => {
  const { passwordHash, permissions: rawPermissions, ...rest } = user;
  const parsedPerms = rawPermissions || {};
  return {
    ...rest,
    permissions: parsedPerms.permissions || {},
    moduleAccess: parsedPerms.moduleAccess || {},
  };
};

const recordLogin = async ({ userId, email, success, reason, req }) => {
  try {
    await prisma.loginAudit.create({
      data: {
        userId: userId || null,
        email: email || 'unknown',
        success,
        reason: reason || null,
        ipAddress:
          (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
          req.socket?.remoteAddress ||
          null,
        userAgent: req.headers['user-agent'] || null,
      },
    });
  } catch (err) {
    // Audit logging must never block authentication.
    console.error('Failed to write LoginAudit:', err.message);
  }
};

// Map a non-active status to a specific, user-friendly message.
const statusMessage = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'suspended':
      return 'Your account has been suspended. Please contact your administrator.';
    case 'archived':
      return 'Your account has been archived and is no longer active.';
    case 'inactive':
    case 'disabled':
      return 'Your account is inactive. Please contact your administrator.';
    default:
      return 'Your account is not active. Please contact your administrator.';
  }
};

const isActive = (status) => (status || '').toLowerCase() === 'active';

// Find a user by EMAIL only. Username-based authentication has been removed —
// the login identifier must be a valid email address.
// NOTE: MySQL string comparisons are case-insensitive by default (collation
// utf8mb4_*_ci), so no `mode: 'insensitive'` is needed on the MySQL connector.
// Email is also normalized to lowercase before lookup.
const findUserByLogin = async (identifier) => {
  const email = normalizeEmail(identifier);
  return prisma.user.findFirst({
    where: { email: { equals: email } },
  });
};

// ----------------------------------------------------------------------------
// Login
// ----------------------------------------------------------------------------

exports.login = async (req, res) => {
  // Email-only authentication. The legacy `username` key is still read so an
  // older cached client cannot hard-break, but the value is always treated as
  // an email address by findUserByLogin (username lookup has been removed).
  const rawIdentifier = req.body.email || req.body.username;
  const { password, rememberMe } = req.body;

  try {
    if (!rawIdentifier || !password) {
      return res
        .status(400)
        .json({ error: 'Please provide your email and password.' });
    }

    const user = await findUserByLogin(rawIdentifier);

    // --- AUTH DEBUG: user lookup ---------------------------------------------
    // Never logs the plaintext password or the full hash — only enough to trace
    // which field auth uses and why a login passed/failed. bcrypt hashes always
    // start with "$2a$"/"$2b$"; a value that doesn't is NOT a bcrypt hash (e.g.
    // someone pasted a plaintext password into passwordHash in phpMyAdmin).
    console.log('[AUTH] login attempt:', {
      identifier: rawIdentifier,
      userFound: !!user,
      userId: user?.id,
    });

    if (!user) {
      await recordLogin({
        email: normalizeEmail(rawIdentifier),
        success: false,
        reason: 'USER_NOT_FOUND',
        req,
      });
      // Generic message — do not reveal whether the account exists.
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Validate account status before checking the password so suspended/archived
    // users get a clear, specific reason.
    if (!isActive(user.status)) {
      await recordLogin({
        userId: user.id,
        email: user.email,
        success: false,
        reason: `STATUS_${(user.status || 'UNKNOWN').toUpperCase()}`,
        req,
      });
      return res.status(403).json({ error: statusMessage(user.status) });
    }

    // --- AUTH DEBUG: hash loaded ---------------------------------------------
    const hash = user.passwordHash || '';
    const looksLikeBcrypt = /^\$2[aby]\$/.test(hash);
    console.log('[AUTH] passwordHash loaded:', {
      userId: user.id,
      hashPresent: !!hash,
      hashPrefix: hash.slice(0, 7),          // e.g. "$2a$10$" — safe, identifies the algorithm
      looksLikeBcrypt,
    });
    if (!looksLikeBcrypt) {
      // Defensive: a non-bcrypt passwordHash means the column was hand-edited with
      // a plaintext value. bcrypt.compare would just return false forever.
      console.warn('[AUTH] passwordHash is NOT a bcrypt hash — login will fail. '
        + 'Set the password via the app or scripts/setUserPassword.js, never by typing plaintext into passwordHash.');
    }

    // Authentication is bcrypt(plaintext, passwordHash). The plain `password`
    // column is NEVER read here — passwordHash is the single source of truth.
    const isMatch = await bcrypt.compare(password, hash);
    console.log('[AUTH] bcrypt.compare result:', { userId: user.id, isMatch });
    if (!isMatch) {
      await recordLogin({
        userId: user.id,
        email: user.email,
        success: false,
        reason: 'BAD_PASSWORD',
        req,
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Success — stamp last login and audit it.
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await recordLogin({
      userId: user.id,
      email: user.email,
      success: true,
      reason: rememberMe ? 'LOGIN_REMEMBER' : 'LOGIN',
      req,
    });

    return res.json({
      message: 'Login successful',
      token: generateToken(user.id, Boolean(rememberMe)),
      rememberMe: Boolean(rememberMe),
      user: toSafeUser(user),
    });
  } catch (error) {
    // Detailed server-side logging for login failures.
    console.error('[LOGIN ERROR]', {
      identifier: rawIdentifier,
      name: error?.name,
      code: error?.code,            // Prisma error code (e.g. P2021, P2002)
      message: error?.message,
      meta: error?.meta,
    });
    await recordLogin({
      email: normalizeEmail(rawIdentifier),
      success: false,
      reason: `SERVER_ERROR:${error?.code || error?.name || 'UNKNOWN'}`,
      req,
    }).catch(() => {});

    const payload = { error: 'Server error during login. Please try again.' };
    // In non-production, surface the exact backend error to speed up debugging.
    if (process.env.NODE_ENV !== 'production') {
      payload.debug = { name: error?.name, code: error?.code, message: error?.message };
    }
    return res.status(500).json(payload);
  }
};

// ----------------------------------------------------------------------------
// Current user
// ----------------------------------------------------------------------------

exports.getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json(toSafeUser(user));
  } catch (error) {
    console.error('GetMe Error:', error);
    return res.status(500).json({ error: 'Server error fetching user details.' });
  }
};

// ----------------------------------------------------------------------------
// Change own password (authenticated self-service)
//   Verifies the CURRENT password (bcrypt) before setting a new one. The new
//   password is bcrypt-hashed and written ONLY to passwordHash — the single
//   source of truth. The old hash is overwritten, so the old password stops
//   working immediately and the new one works immediately.
// ----------------------------------------------------------------------------
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id; // set by `protect` middleware from the JWT
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Please provide your current and new password.' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Your new password must be at least 8 characters long.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'Your new password must be different from your current password.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    console.log('[CHANGE-PW] request:', { userId, username: user.username });
    const currentOk = await bcrypt.compare(currentPassword, user.passwordHash || '');
    console.log('[CHANGE-PW] current password verify:', { userId, isMatch: currentOk });
    if (!currentOk) {
      return res.status(401).json({ error: 'Your current password is incorrect.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    console.log('[CHANGE-PW] passwordHash updated in MySQL:', { userId, newHashPrefix: passwordHash.slice(0, 7) });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CHANGE_PASSWORD',
        module: 'Auth',
        targetId: String(user.id),
        details: JSON.stringify({ self: true }),
      },
    }).catch((err) => console.error('Failed to write audit log:', err.message));

    return res.json({ message: 'Your password has been changed successfully. Use your new password next time you sign in.' });
  } catch (error) {
    console.error('ChangePassword Error:', error);
    return res.status(500).json({ error: 'Server error while changing your password. Please try again.' });
  }
};

// ----------------------------------------------------------------------------
// Forgot password — step 1: request OTP
// ----------------------------------------------------------------------------

const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

exports.forgotPassword = async (req, res) => {
  const identifier = req.body.email || req.body.username;
  try {
    if (!identifier) {
      return res.status(400).json({ error: 'Please enter your registered email address.' });
    }

    const user = await findUserByLogin(identifier);

    // The product spec asks for a clear "not registered" message (chosen over
    // anti-enumeration). Inactive accounts get a specific status message.
    if (!user) {
      return res.status(404).json({ error: 'Email address is not registered.' });
    }
    if (!isActive(user.status)) {
      return res.status(403).json({ error: statusMessage(user.status) });
    }

    // Resend throttle — a new code may be requested only every 60 seconds. The
    // most recent request (regardless of state) sets the clock.
    const latest = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (latest) {
      const elapsed = (Date.now() - new Date(latest.createdAt).getTime()) / 1000;
      if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
        const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed);
        return res.status(429).json({
          error: `Please wait ${wait} second(s) before requesting another code.`,
          retryAfter: wait,
        });
      }
    }

    // Generate a 6-digit OTP, store only its bcrypt hash.
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate any prior outstanding tokens — only the newest code stays valid.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumed: false },
      data: { consumed: true },
    });

    const created = await prisma.passwordResetToken.create({
      data: { userId: user.id, email: user.email, otpHash, expiresAt },
    });

    const delivery = await sendOtpEmail(user.email, otp, user.name, OTP_EXPIRY_MINUTES);

    // SMTP is configured but the provider rejected the message — be honest and
    // void the just-created code so the user can safely retry.
    if (!delivery.delivered && delivery.configured) {
      await prisma.passwordResetToken.update({
        where: { id: created.id },
        data: { consumed: true },
      }).catch(() => {});
      return res.status(502).json({
        error: 'We could not send the verification email right now. Please try again in a few minutes.',
      });
    }

    await prisma.loginAudit.create({
      data: {
        userId: user.id,
        email: user.email,
        success: true,
        reason: 'OTP_REQUESTED',
        ipAddress: req.socket?.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
      },
    }).catch(() => {});

    const payload = { message: `A verification code has been sent to ${user.email}.` };
    // Dev convenience: when SMTP is NOT configured, return the OTP so the flow is
    // testable locally. Never happens once SMTP env vars are set or in production.
    if (delivery.devMode && !delivery.configured && process.env.NODE_ENV !== 'production') {
      payload.devOtp = otp;
      payload.devNote = 'SMTP not configured — OTP returned for development only.';
    }
    return res.json(payload);
  } catch (error) {
    console.error('Forgot Password Error:', error);
    return res.status(500).json({ error: 'Server error while requesting a reset code. Please try again.' });
  }
};

// ----------------------------------------------------------------------------
// Forgot password — step 2: verify OTP
// ----------------------------------------------------------------------------

exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  try {
    if (!email || !otp) {
      return res.status(400).json({ error: 'Please provide your email and the verification code.' });
    }

    const user = await findUserByLogin(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }

    const token = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, consumed: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      return res.status(400).json({ error: 'No active reset request found. Please request a new code.' });
    }

    if (token.expiresAt < new Date()) {
      await prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { consumed: true },
      });
      return res.status(400).json({ error: 'Your verification code has expired. Please request a new one.' });
    }

    if (token.attempts >= 5) {
      await prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { consumed: true },
      });
      return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }

    const matches = await bcrypt.compare(String(otp).trim(), token.otpHash);
    if (!matches) {
      await prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      const remaining = 5 - (token.attempts + 1);
      return res.status(400).json({
        error:
          remaining > 0
            ? `Incorrect verification code. ${remaining} attempt(s) remaining.`
            : 'Incorrect verification code. Please request a new one.',
      });
    }

    // OTP verified — issue a short-lived reset token that gates step 3.
    // The reset request stays un-consumed until the password is actually reset.
    const resetToken = generateResetToken(user.id);
    return res.json({ message: 'Code verified.', resetToken });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    return res.status(500).json({ error: 'Server error while verifying the code.' });
  }
};

// ----------------------------------------------------------------------------
// Forgot password — step 3: reset password
// ----------------------------------------------------------------------------

exports.resetPassword = async (req, res) => {
  const { resetToken, newPassword } = req.body;
  try {
    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: 'A reset token and new password are required.' });
    }
    // Strong-password policy: 8+ chars with upper, lower, number and special char.
    const pw = String(newPassword);
    const strong = pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
    if (!strong) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Your reset session has expired. Please start over.' });
    }

    if (decoded.purpose !== 'password_reset') {
      return res.status(401).json({ error: 'Invalid reset token.' });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    // Require an outstanding (un-consumed, unexpired) reset request to exist.
    const token = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, consumed: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Your reset request has expired. Please start over.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      // Consume every outstanding token for this user.
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, consumed: false },
        data: { consumed: true },
      }),
    ]);

    await prisma.loginAudit.create({
      data: {
        userId: user.id,
        email: user.email,
        success: true,
        reason: 'PASSWORD_RESET',
        ipAddress: req.socket?.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
      },
    }).catch(() => {});

    return res.json({ message: 'Your password has been reset successfully. You can now sign in.' });
  } catch (error) {
    console.error('Reset Password Error:', error);
    return res.status(500).json({ error: 'Server error while resetting your password.' });
  }
};
