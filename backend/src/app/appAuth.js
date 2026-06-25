/**
 * Mobile App authentication primitives (/api/app/*) — SEPARATE from the website
 * auth. App tokens are keyed to a TemporaryEmployee (the onboarding identity), not
 * a website User. The existing web `protect` middleware and User auth are untouched.
 *
 * OTP sessions are kept in-memory (short 5-minute window). Registration PROGRESS is
 * persisted on the TemporaryEmployee record, so nothing is lost on app restart.
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { fail } = require('./appResponse');

const SECRET = process.env.JWT_SECRET;
const ACCESS_EXPIRY = process.env.APP_ACCESS_TOKEN_EXPIRY || '12h';
const REFRESH_EXPIRY = process.env.APP_REFRESH_TOKEN_EXPIRY || '30d';
const OTP_MODE = (process.env.OTP_MODE || 'development').toLowerCase();
const OTP_LENGTH = Number(process.env.OTP_LENGTH || 4);
const OTP_TTL_SEC = Number(process.env.OTP_EXPIRY_SECONDS || 300);

const digitsOf = (m) => String(m == null ? '' : m).replace(/\D/g, '');
const isDev = () => OTP_MODE !== 'production';

// ── In-memory OTP sessions ───────────────────────────────────────────────────
const otpSessions = new Map(); // sessionId -> { tempId, mobile, expiresAt, attempts }

function createOtpSession(tempId, mobile) {
  const sessionId = crypto.randomBytes(16).toString('hex');
  otpSessions.set(sessionId, { tempId, mobile, expiresAt: Date.now() + OTP_TTL_SEC * 1000, attempts: 0 });
  return { sessionId, otpLength: OTP_LENGTH, expiresIn: OTP_TTL_SEC, devOtp: isDev() ? '1'.repeat(OTP_LENGTH) : null };
}

function verifyOtpSession(sessionId, otp) {
  const s = otpSessions.get(sessionId);
  if (!s) return { ok: false, code: 'INVALID_SESSION', message: 'Invalid or expired session. Please request a new OTP.' };
  if (Date.now() > s.expiresAt) { otpSessions.delete(sessionId); return { ok: false, code: 'OTP_EXPIRED', message: 'OTP expired. Please request a new one.' }; }
  if (s.attempts >= 5) { otpSessions.delete(sessionId); return { ok: false, code: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts. Please request a new OTP.' }; }
  const code = String(otp == null ? '' : otp).trim();
  const valid = isDev() ? new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code) : false; // production: wire real SMS verification
  if (!valid) { s.attempts += 1; return { ok: false, code: 'INVALID_OTP', message: isDev() ? `Enter any ${OTP_LENGTH}-digit code.` : 'Incorrect OTP.' }; }
  otpSessions.delete(sessionId);
  return { ok: true, tempId: s.tempId };
}

// ── Tokens ───────────────────────────────────────────────────────────────────
const signAccess = (tempId) => jwt.sign({ tempId, kind: 'app' }, SECRET, { expiresIn: ACCESS_EXPIRY });
const signRefresh = (tempId) => jwt.sign({ tempId, kind: 'app-refresh' }, SECRET, { expiresIn: REFRESH_EXPIRY });
function verifyRefresh(token) { const d = jwt.verify(token, SECRET); if (d.kind !== 'app-refresh') throw new Error('Invalid refresh token'); return d; }

function expirySeconds(exp) {
  if (/^\d+$/.test(String(exp))) return Number(exp);
  const m = String(exp).match(/^(\d+)\s*([smhd])$/i); if (!m) return 3600;
  const n = Number(m[1]); return { s: n, m: n * 60, h: n * 3600, d: n * 86400 }[m[2].toLowerCase()];
}

// ── Middleware ───────────────────────────────────────────────────────────────
// appProtect: verify an app access token → load the TemporaryEmployee (+ converted
// Employee if approved) into req.appCtx.
async function appProtect(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return fail(res, 'Not authorized — no token provided.', { status: 401, code: 'NO_TOKEN' });
    let decoded;
    try { decoded = jwt.verify(token, SECRET); } catch { return fail(res, 'Session expired. Please log in again.', { status: 401, code: 'TOKEN_INVALID' }); }
    if (decoded.kind !== 'app') return fail(res, 'Invalid access token.', { status: 401, code: 'TOKEN_INVALID' });
    const temp = await prisma.temporaryEmployee.findUnique({ where: { id: decoded.tempId } }).catch(() => null);
    if (!temp) return fail(res, 'Account not found.', { status: 404, code: 'ACCOUNT_NOT_FOUND' });
    let employee = null;
    if (temp.convertedEmployeeId) employee = await prisma.employee.findUnique({ where: { id: temp.convertedEmployeeId } }).catch(() => null);
    req.appCtx = { temp, employee };
    next();
  } catch (e) {
    return fail(res, 'Authorization failed.', { status: 401, code: 'AUTH_ERROR' });
  }
}

// requireApproved: gate dashboard endpoints to approved (converted) employees only.
function requireApproved(req, res, next) {
  const { temp, employee } = req.appCtx || {};
  if (!temp || temp.status !== 'Converted' || !employee) {
    return fail(res, 'Dashboard is available only after HR approval.', { status: 403, code: 'NOT_APPROVED' });
  }
  next();
}

module.exports = {
  createOtpSession, verifyOtpSession, signAccess, signRefresh, verifyRefresh,
  appProtect, requireApproved, digitsOf, isDev,
  OTP_LENGTH, OTP_MODE, accessExpirySeconds: () => expirySeconds(ACCESS_EXPIRY), refreshExpirySeconds: () => expirySeconds(REFRESH_EXPIRY),
};
