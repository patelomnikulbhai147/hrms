/**
 * v1 Mobile Auth controller (Flutter).
 *
 * Endpoints (mounted at /api/v1/auth):
 *   POST /login        — accept mobile / employeeId / email → create OTP session
 *   POST /verify-otp   — verify OTP → issue access + refresh tokens + user profile
 *   POST /refresh      — exchange a refresh token for a new access token
 *   POST /logout       — end the session (client discards tokens; audited)
 *   GET  /me           — current authenticated user (Bearer access token)
 *
 * Fully additive. The access token is identical in shape to the existing web token
 * (`{ id }` signed with JWT_SECRET) so it works with every existing protected API.
 */
const prisma = require('../config/prisma');
const { resolveUser, buildProfile } = require('./authService');
const otp = require('./otpService');
const jwtSvc = require('./jwtService');

const ok = (res, data) => res.json({ success: true, ...data });
const fail = (res, status, code, message) => res.status(status).json({ success: false, code, message });

// Best-effort login audit (never blocks auth).
async function audit({ userId, identifier, success, reason, req }) {
  try {
    await prisma.loginAudit.create({
      data: {
        userId: userId || null,
        email: String(identifier || 'mobile').slice(0, 190),
        success: !!success,
        reason: reason || null,
        ipAddress: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
      },
    });
  } catch (_) { /* ignore */ }
}

// POST /api/v1/auth/login — identifier in, OTP session out (no SMS in dev mode).
exports.login = async (req, res) => {
  try {
    const resolved = await resolveUser(req.body || {});
    if (resolved.error) {
      await audit({ identifier: (req.body && (req.body.mobile || req.body.employeeId || req.body.email)) || '', success: false, reason: resolved.error.code, req });
      return fail(res, resolved.error.status, resolved.error.code, resolved.error.message);
    }
    const { user, employee } = resolved;
    const session = await otp.createSession({ identifier: req.body.mobile || req.body.employeeId || req.body.email || '', userId: user.id, mobile: employee?.phone });
    await audit({ userId: user.id, identifier: user.email, success: true, reason: 'OTP_GENERATED', req });

    const payload = {
      message: 'OTP Generated',
      otpRequired: true,
      otpLength: session.otpLength,
      sessionId: session.sessionId,
      expiresInMinutes: session.expiresInMinutes,
      otpMode: otp.OTP_MODE,
    };
    // Development convenience: surface a usable OTP (any N-digit code also works).
    if (otp.isDev()) {
      payload.devOtp = session.devOtp;
      payload.devNote = `OTP_MODE=development — enter any ${session.otpLength}-digit code to log in. No SMS is sent.`;
    }
    return ok(res, payload);
  } catch (e) {
    console.error('[v1 auth] login error:', e.message);
    return fail(res, 500, 'SERVER_ERROR', 'Could not start login. Please try again.');
  }
};

// POST /api/v1/auth/verify-otp — verify and mint tokens + profile.
exports.verifyOtp = async (req, res) => {
  try {
    const { sessionId, otp: code } = req.body || {};
    const result = await otp.verifySession(sessionId, code);
    if (!result.ok) {
      await audit({ identifier: sessionId, success: false, reason: result.code, req });
      return fail(res, result.status, result.code, result.message);
    }

    const user = await prisma.user.findUnique({ where: { id: result.userId } });
    if (!user) return fail(res, 404, 'USER_NOT_FOUND', 'Account not found.');
    if (String(user.status || '').toLowerCase() !== 'active') return fail(res, 403, 'ACCOUNT_INACTIVE', 'Account inactive. Please contact your administrator.');

    const employee = user.employeeId ? await prisma.employee.findUnique({ where: { id: user.employeeId } }).catch(() => null) : null;
    const profile = await buildProfile(user, employee);

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
    await audit({ userId: user.id, identifier: user.email, success: true, reason: 'MOBILE_LOGIN', req });

    return ok(res, {
      accessToken: jwtSvc.signAccessToken(user.id),
      refreshToken: jwtSvc.signRefreshToken(user.id),
      tokenType: 'Bearer',
      expiresIn: jwtSvc.accessTokenExpiresIn(),
      refreshExpiresIn: jwtSvc.refreshTokenExpiresIn(),
      user: profile,
    });
  } catch (e) {
    console.error('[v1 auth] verify-otp error:', e.message);
    return fail(res, 500, 'SERVER_ERROR', 'Could not verify the code. Please try again.');
  }
};

// POST /api/v1/auth/refresh — new access token from a valid refresh token.
exports.refresh = async (req, res) => {
  try {
    const token = req.body?.refreshToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return fail(res, 400, 'REFRESH_TOKEN_REQUIRED', 'A refresh token is required.');
    let decoded;
    try { decoded = jwtSvc.verifyRefreshToken(token); }
    catch { return fail(res, 401, 'REFRESH_TOKEN_INVALID', 'Your session has expired. Please sign in again.'); }
    if (decoded.type !== 'refresh') return fail(res, 401, 'REFRESH_TOKEN_INVALID', 'Invalid refresh token.');

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return fail(res, 404, 'USER_NOT_FOUND', 'Account not found.');
    if (String(user.status || '').toLowerCase() !== 'active') return fail(res, 403, 'ACCOUNT_INACTIVE', 'Account inactive.');

    return ok(res, {
      accessToken: jwtSvc.signAccessToken(user.id),
      tokenType: 'Bearer',
      expiresIn: jwtSvc.accessTokenExpiresIn(),
    });
  } catch (e) {
    console.error('[v1 auth] refresh error:', e.message);
    return fail(res, 500, 'SERVER_ERROR', 'Could not refresh the session.');
  }
};

// POST /api/v1/auth/logout — stateless; client discards tokens. Audited.
exports.logout = async (req, res) => {
  try {
    // Consume any outstanding OTP sessions for the user (defensive).
    if (req.user?.id) {
      await prisma.mobileOtpSession.updateMany({ where: { userId: req.user.id, consumed: false }, data: { consumed: true } }).catch(() => {});
      await audit({ userId: req.user.id, identifier: req.user.email, success: true, reason: 'MOBILE_LOGOUT', req });
    }
    return ok(res, { message: 'Logged out.' });
  } catch (e) {
    return ok(res, { message: 'Logged out.' });
  }
};

// GET /api/v1/auth/me — current authenticated user (uses existing `protect`).
exports.me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return fail(res, 404, 'USER_NOT_FOUND', 'Account not found.');
    const employee = user.employeeId ? await prisma.employee.findUnique({ where: { id: user.employeeId } }).catch(() => null) : null;
    return ok(res, { user: await buildProfile(user, employee) });
  } catch (e) {
    console.error('[v1 auth] me error:', e.message);
    return fail(res, 500, 'SERVER_ERROR', 'Could not load your profile.');
  }
};
