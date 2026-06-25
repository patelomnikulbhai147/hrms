/**
 * JWT service for the v1 mobile auth module.
 *
 * IMPORTANT: the ACCESS token is signed exactly like the existing web token —
 * payload `{ id }` with `JWT_SECRET` — so a Flutter-issued access token is accepted
 * by the existing `protect` middleware and can call EVERY protected API unchanged.
 * The REFRESH token uses a separate secret + longer lifetime and is only consumed
 * by POST /api/v1/auth/refresh.
 */
const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_SECRET;
// Fall back to a derived secret so the module works out-of-the-box even before the
// dedicated env var is set; set JWT_REFRESH_SECRET in production for full isolation.
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET || 'hrms'}::refresh`;
const ACCESS_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '1h';
const REFRESH_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '30d';

// Convert an expiry string like "1h"/"30d"/"3600" to seconds (for expiresIn field).
function expirySeconds(exp) {
  if (/^\d+$/.test(String(exp))) return Number(exp);
  const m = String(exp).match(/^(\d+)\s*([smhd])$/i);
  if (!m) return 3600;
  const n = Number(m[1]);
  return { s: n, m: n * 60, h: n * 3600, d: n * 86400 }[m[2].toLowerCase()];
}

exports.signAccessToken = (userId) =>
  jwt.sign({ id: userId, type: 'access' }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });

exports.signRefreshToken = (userId) =>
  jwt.sign({ id: userId, type: 'refresh' }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });

exports.verifyRefreshToken = (token) => jwt.verify(token, REFRESH_SECRET);

exports.accessTokenExpiresIn = () => expirySeconds(ACCESS_EXPIRY);
exports.refreshTokenExpiresIn = () => expirySeconds(REFRESH_EXPIRY);
