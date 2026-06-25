/**
 * Mobile App — Authentication controller (/api/app/auth/*).
 * Authenticates ONLY employees whose mobile is linked to a Temporary Employee ID.
 */
const prisma = require('../config/prisma');
const { ok, fail } = require('./appResponse');
const A = require('./appAuth');
const H = require('./appHelpers');

// Resolve a TemporaryEmployee by mobile (exact, then digit-normalised).
async function findTempByMobile(mobileRaw) {
  const mobile = String(mobileRaw || '').trim();
  if (!mobile) return null;
  const exact = await prisma.temporaryEmployee.findFirst({ where: { mobile } }).catch(() => null);
  if (exact) return exact;
  const digits = A.digitsOf(mobile);
  if (digits.length < 6) return null;
  const all = await prisma.temporaryEmployee.findMany({ select: { id: true, mobile: true } });
  const hit = all.find((t) => A.digitsOf(t.mobile) === digits);
  return hit ? prisma.temporaryEmployee.findUnique({ where: { id: hit.id } }) : null;
}

// POST /api/app/auth/login — { mobile }
exports.login = async (req, res) => {
  try {
    const mobile = String(req.body?.mobile || '').trim();
    if (!mobile) return fail(res, 'Mobile number is required.', { status: 400, code: 'MOBILE_REQUIRED' });
    const temp = await findTempByMobile(mobile);
    if (!temp) return fail(res, 'Employee not found.', { status: 404, code: 'EMPLOYEE_NOT_FOUND' });

    const session = A.createOtpSession(temp.id, temp.mobile);
    const data = { sessionId: session.sessionId, otpRequired: true, otpLength: session.otpLength, expiresIn: session.expiresIn };
    if (A.isDev()) { data.otpMode = 'development'; data.devOtp = session.devOtp; data.devNote = `Enter any ${session.otpLength}-digit code. No SMS is sent.`; }
    return ok(res, data, 'OTP generated.');
  } catch (e) {
    console.error('[app auth] login:', e.message);
    return fail(res, 'Could not start login. Please try again.', { status: 500, code: 'SERVER_ERROR' });
  }
};

// POST /api/app/auth/verify-otp — { sessionId, otp }
exports.verifyOtp = async (req, res) => {
  try {
    const { sessionId, otp } = req.body || {};
    const result = A.verifyOtpSession(sessionId, otp);
    if (!result.ok) return fail(res, result.message, { status: result.code === 'TOO_MANY_ATTEMPTS' ? 429 : 400, code: result.code });
    const temp = await prisma.temporaryEmployee.findUnique({ where: { id: result.tempId } });
    if (!temp) return fail(res, 'Account not found.', { status: 404, code: 'ACCOUNT_NOT_FOUND' });

    return ok(res, {
      accessToken: A.signAccess(temp.id),
      refreshToken: A.signRefresh(temp.id),
      tokenType: 'Bearer',
      expiresIn: A.accessExpirySeconds(),
      refreshExpiresIn: A.refreshExpirySeconds(),
      registrationCompleted: H.registrationCompleted(temp),
      currentStep: H.currentStep(temp),
      approvalStatus: H.approvalStatus(temp),
    }, 'OTP verified.');
  } catch (e) {
    console.error('[app auth] verify-otp:', e.message);
    return fail(res, 'Could not verify the OTP. Please try again.', { status: 500, code: 'SERVER_ERROR' });
  }
};

// POST /api/app/auth/refresh — { refreshToken }
exports.refresh = async (req, res) => {
  try {
    const token = req.body?.refreshToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return fail(res, 'A refresh token is required.', { status: 400, code: 'REFRESH_TOKEN_REQUIRED' });
    let decoded;
    try { decoded = A.verifyRefresh(token); } catch { return fail(res, 'Session expired. Please log in again.', { status: 401, code: 'REFRESH_TOKEN_INVALID' }); }
    const temp = await prisma.temporaryEmployee.findUnique({ where: { id: decoded.tempId } });
    if (!temp) return fail(res, 'Account not found.', { status: 404, code: 'ACCOUNT_NOT_FOUND' });
    return ok(res, { accessToken: A.signAccess(temp.id), tokenType: 'Bearer', expiresIn: A.accessExpirySeconds() }, 'Token refreshed.');
  } catch (e) {
    return fail(res, 'Could not refresh the session.', { status: 500, code: 'SERVER_ERROR' });
  }
};

// POST /api/app/auth/logout — stateless (client discards tokens).
exports.logout = async (_req, res) => ok(res, {}, 'Logged out.');

// GET /api/app/auth/session — splash/resume driver.
exports.session = async (req, res) => {
  try {
    const { temp } = req.appCtx;
    return ok(res, {
      loggedIn: true,
      registrationCompleted: H.registrationCompleted(temp),
      currentStep: H.currentStep(temp),
      completionPercentage: H.completionPercentage(temp),
      approvalStatus: H.approvalStatus(temp),
    }, 'Session active.');
  } catch (e) {
    return fail(res, 'Could not load the session.', { status: 500, code: 'SERVER_ERROR' });
  }
};

// GET /api/app/auth/me — current onboarding identity.
exports.me = async (req, res) => {
  try {
    const { temp, employee } = req.appCtx;
    return ok(res, {
      tempEmployeeId: temp.tempEmployeeId,
      name: temp.name,
      mobile: temp.mobile,
      email: temp.email,
      branch: temp.branchLocation,
      approvalStatus: H.approvalStatus(temp),
      registrationCompleted: H.registrationCompleted(temp),
      currentStep: H.currentStep(temp),
      completionPercentage: H.completionPercentage(temp),
      employeeId: employee?.employeeId || null,
      isApproved: temp.status === 'Converted',
    }, 'Profile loaded.');
  } catch (e) {
    return fail(res, 'Could not load the profile.', { status: 500, code: 'SERVER_ERROR' });
  }
};
