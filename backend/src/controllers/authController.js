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
  const { passwordHash, password, permissions: rawPermissions, ...rest } = user;
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

// Find a user by email or username.
// NOTE: MySQL string comparisons are case-insensitive by default (collation
// utf8mb4_*_ci), so no `mode: 'insensitive'` is needed — that option is a
// PostgreSQL-only Prisma feature and throws on the MySQL connector. Email is
// also normalized to lowercase before lookup.
const findUserByLogin = async (identifier) => {
  const email = normalizeEmail(identifier);
  const username = normalizeIdentifier(identifier);
  return prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: email } },
        { username: { equals: username } },
      ],
    },
  });
};

// ----------------------------------------------------------------------------
// Login
// ----------------------------------------------------------------------------

exports.login = async (req, res) => {
  const rawIdentifier = req.body.username || req.body.email;
  const { password, rememberMe } = req.body;

  try {
    if (!rawIdentifier || !password) {
      return res
        .status(400)
        .json({ error: 'Please provide your email/username and password.' });
    }

    const user = await findUserByLogin(rawIdentifier);

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

    const isMatch = await bcrypt.compare(password, user.passwordHash || '');
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
// Forgot password — step 1: request OTP
// ----------------------------------------------------------------------------

exports.forgotPassword = async (req, res) => {
  const identifier = req.body.email || req.body.username;
  try {
    if (!identifier) {
      return res.status(400).json({ error: 'Please provide your registered email address.' });
    }

    const user = await findUserByLogin(identifier);

    // Always respond the same way to prevent account enumeration.
    const genericResponse = {
      message:
        'If an active account exists for that address, a verification code has been sent.',
    };

    if (!user || !isActive(user.status)) {
      return res.json(genericResponse);
    }

    // Generate a 6-digit OTP, store only its hash.
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate any prior outstanding tokens for this user.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumed: false },
      data: { consumed: true },
    });

    await prisma.passwordResetToken.create({
      data: { userId: user.id, email: user.email, otpHash, expiresAt },
    });

    const delivery = await sendOtpEmail(user.email, otp, user.name);

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

    // In dev mode (no SMTP configured) return the OTP so the flow is testable.
    const payload = { ...genericResponse };
    if (delivery.devMode && process.env.NODE_ENV !== 'production') {
      payload.devOtp = otp;
      payload.devNote = 'SMTP not configured — OTP returned for development only.';
    }
    return res.json(payload);
  } catch (error) {
    console.error('Forgot Password Error:', error);
    return res.status(500).json({ error: 'Server error while requesting a reset code.' });
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
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
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
        data: { passwordHash, password: 'REDACTED' },
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
