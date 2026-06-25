/**
 * OTP session service for the v1 mobile auth module.
 *
 *  • OTP_MODE=development (default): NO SMS is sent. A session is created and any
 *    numeric OTP of the configured length (default 4) verifies it — so the Flutter
 *    OTP screen works end-to-end without a real provider. The dev OTP is also
 *    returned in the login response for convenience.
 *  • OTP_MODE=production: a random OTP is generated, hashed + stored, and sent via
 *    the configured SMS provider (wire up sendSms() below). The SAME verify
 *    endpoint then checks the real OTP — the Flutter contract never changes.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../config/prisma');

const OTP_MODE = (process.env.OTP_MODE || 'development').toLowerCase();
const OTP_LENGTH = Number(process.env.OTP_LENGTH || 4);
const OTP_EXPIRY_MIN = parseExpiryMinutes(process.env.OTP_EXPIRY || '5m');

function parseExpiryMinutes(v) {
  const m = String(v).match(/^(\d+)\s*([smhd])?$/i);
  if (!m) return 5;
  const n = Number(m[1]);
  switch ((m[2] || 'm').toLowerCase()) {
    case 's': return Math.max(1, Math.round(n / 60));
    case 'h': return n * 60;
    case 'd': return n * 1440;
    default: return n; // minutes
  }
}

const isDev = () => OTP_MODE !== 'production';
const newSessionId = () => crypto.randomBytes(16).toString('hex');
const randomOtp = () => {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return String(crypto.randomInt(min, max + 1));
};

// Placeholder SMS sender — wire your provider here for production.
async function sendSms(mobile, otp) {
  // e.g. Twilio / MSG91 / Gupshup using process.env.SMS_PROVIDER + SMS_API_KEY.
  console.log(`[otp] (production) would SMS ${mobile}: code ${otp}`);
  return { sent: true, provider: process.env.SMS_PROVIDER || 'none' };
}

// Create an OTP session for a resolved user. Returns { sessionId, otpLength, devOtp? }.
async function createSession({ identifier, userId, mobile }) {
  const sessionId = newSessionId();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000);

  // Invalidate any earlier outstanding sessions for this user.
  await prisma.mobileOtpSession.updateMany({ where: { userId, consumed: false }, data: { consumed: true } }).catch(() => {});

  let otpHash = null;
  let devOtp = null;
  if (isDev()) {
    devOtp = '1'.repeat(OTP_LENGTH); // illustrative only; ANY numeric of this length will verify
  } else {
    const otp = randomOtp();
    otpHash = await bcrypt.hash(otp, 10);
    await sendSms(mobile, otp);
  }

  await prisma.mobileOtpSession.create({
    data: { sessionId, identifier: String(identifier), userId, otpHash, expiresAt },
  });

  return { sessionId, otpLength: OTP_LENGTH, expiresInMinutes: OTP_EXPIRY_MIN, devOtp };
}

// Verify an OTP for a session. Returns { ok, userId } or { ok:false, code, message, status }.
async function verifySession(sessionId, otp) {
  if (!sessionId || otp == null) return { ok: false, status: 400, code: 'INVALID_REQUEST', message: 'sessionId and otp are required.' };
  const session = await prisma.mobileOtpSession.findUnique({ where: { sessionId } }).catch(() => null);
  if (!session) return { ok: false, status: 400, code: 'INVALID_SESSION', message: 'Invalid or unknown session.' };
  if (session.consumed) return { ok: false, status: 400, code: 'SESSION_CONSUMED', message: 'This OTP session was already used. Please request a new code.' };
  if (session.expiresAt < new Date()) {
    await prisma.mobileOtpSession.update({ where: { id: session.id }, data: { consumed: true } }).catch(() => {});
    return { ok: false, status: 400, code: 'OTP_EXPIRED', message: 'Your code has expired. Please request a new one.' };
  }
  if (session.attempts >= 5) {
    await prisma.mobileOtpSession.update({ where: { id: session.id }, data: { consumed: true } }).catch(() => {});
    return { ok: false, status: 429, code: 'TOO_MANY_ATTEMPTS', message: 'Too many incorrect attempts. Please request a new code.' };
  }

  const code = String(otp).trim();
  let valid;
  if (isDev()) {
    // Development: accept ANY numeric OTP of the configured length.
    valid = new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
  } else {
    valid = session.otpHash ? await bcrypt.compare(code, session.otpHash) : false;
  }

  if (!valid) {
    await prisma.mobileOtpSession.update({ where: { id: session.id }, data: { attempts: { increment: 1 } } }).catch(() => {});
    return { ok: false, status: 400, code: 'INVALID_OTP', message: isDev() ? `Enter any ${OTP_LENGTH}-digit code.` : 'Incorrect verification code.' };
  }

  await prisma.mobileOtpSession.update({ where: { id: session.id }, data: { consumed: true } }).catch(() => {});
  return { ok: true, userId: session.userId };
}

module.exports = { createSession, verifySession, OTP_MODE, OTP_LENGTH, isDev };
