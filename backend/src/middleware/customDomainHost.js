/**
 * Custom-domain host resolution — runs on EVERY request, cheaply.
 *
 * If the request's Host header (or X-Forwarded-Host behind the proxy) matches
 * an ACTIVE domain mapping whose company still has an active subscription,
 * the mapped tenant is attached as req.customDomain. Auth then enforces that
 * the logged-in user actually belongs to that company (authMiddleware).
 *
 * Unknown/default hosts resolve to null (60s TTL cache) and behave exactly as
 * before — existing routing is untouched.
 */
const domainService = require('../services/customDomain/domainService');

module.exports = async function customDomainHost(req, _res, next) {
  try {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    const mapped = await domainService.resolveHost(host);
    if (mapped) req.customDomain = mapped;
  } catch (_) { /* never block a request on host resolution */ }
  next();
};
