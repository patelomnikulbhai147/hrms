/**
 * White Label & Custom Domain (Beta) — HTTP layer.
 *
 * Company routes ride requirePlanModule('custom-domain') (plan gate) and
 * resolve the tenant from the session. Writes (add/verify/remove/branding)
 * are Company Head only; HR gets read-only. Super Admin routes are hard-gated
 * by requireSuperAdmin in the router.
 */
const { resolveWalletCompany } = require('../utils/verificationScope');
const domainService = require('../services/customDomain/domainService');

const resolveTenant = (req, res) => {
  const scope = resolveWalletCompany(req);
  if (scope.error) {
    res.status(scope.status).json({ error: scope.error });
    return null;
  }
  return scope;
};

// Security spec: ONLY Super Admin and Company Head may access this module —
// HR / Manager / Employee receive 403 on every endpoint.
const canManage = (req) => ['Company Head', 'Super Admin'].includes(req.user?.role);
const canView = canManage;

// Audit context (user, role, company, IP) attached to every write.
const actor = (req) => ({
  ...req.user,
  ip: String(req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '').split(',')[0].trim(),
});

// ── Company endpoints ────────────────────────────────────────────────────────

exports.getOverview = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to custom domain settings.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const overview = await domainService.getOverview(scope.companyId);
    res.json({ ...overview, canManage: canManage(req) });
  } catch (e) {
    console.error('custom-domain overview:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not load custom domain settings.' });
  }
};

exports.addDomain = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only a Company Head can add a custom domain.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const mapping = await domainService.addDomain({ companyId: scope.companyId, domain: req.body?.domain, user: actor(req) });
    res.status(201).json({ mapping, instructions: domainService.dnsInstructionsFor(mapping.domain, mapping.verifyToken) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not add the domain.' });
  }
};

exports.verifyDomain = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only a Company Head can verify the domain.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const result = await domainService.verifyDomain(scope.companyId, { actorId: req.user?.id, actorRole: req.user?.role, actorIp: actor(req).ip });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not verify the domain.' });
  }
};

// Refresh Status — read-only re-check, allowed for viewers too.
exports.refreshStatus = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to custom domain settings.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const result = await domainService.verifyDomain(scope.companyId, { actorId: req.user?.id, actorRole: req.user?.role, actorIp: actor(req).ip });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not refresh the domain status.' });
  }
};

exports.removeDomain = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only a Company Head can remove the custom domain.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    res.json(await domainService.removeDomain(scope.companyId, actor(req)));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not remove the domain.' });
  }
};

exports.saveWhiteLabel = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only a Company Head can change white-label settings.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    res.json(await domainService.saveWhiteLabel(scope.companyId, req.body || {}, actor(req)));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not save white-label settings.' });
  }
};

// Lightweight status (mapping row only — no DNS/SSL side effects).
exports.getStatus = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to custom domain settings.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    const overview = await domainService.getOverview(scope.companyId);
    res.json({ mapping: overview.mapping, beta: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not load the domain status.' });
  }
};

// Full health probe: DNS, SSL, HTTPS reachability, redirect, response time,
// certificate expiry, security headers.
exports.getHealth = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have access to custom domain settings.' });
    const scope = resolveTenant(req, res);
    if (!scope) return;
    res.json(await domainService.healthCheck(scope.companyId));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not run the health check.' });
  }
};

// ── Public (unauthenticated): login-page branding by host ────────────────────
exports.publicHostBranding = async (req, res) => {
  try {
    const host = String(req.query.host || req.headers['x-forwarded-host'] || req.headers.host || '');
    const branding = await domainService.publicBrandingForHost(host);
    res.json({ branding }); // null branding = default ZeniaHR login
  } catch (e) {
    res.json({ branding: null });
  }
};

// ── Super Admin endpoints (router gated by requireSuperAdmin) ────────────────

exports.adminList = async (_req, res) => {
  try {
    res.json(await domainService.adminList());
  } catch (e) {
    res.status(500).json({ error: 'Could not load domain mappings.' });
  }
};

exports.adminDisable = async (req, res) => {
  try {
    res.json(await domainService.adminSetDisabled(req.params.id, true, req.user));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

exports.adminEnable = async (req, res) => {
  try {
    res.json(await domainService.adminSetDisabled(req.params.id, false, req.user));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

exports.adminReverify = async (req, res) => {
  try {
    const mapping = await require('../config/prisma').domainMapping.findUnique({ where: { id: Number(req.params.id) || 0 } });
    if (!mapping) return res.status(404).json({ error: 'Domain mapping not found.' });
    res.json(await domainService.verifyDomain(mapping.companyId, { actorId: req.user?.id, force: true }));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

exports.adminDelete = async (req, res) => {
  try {
    res.json(await domainService.adminDelete(req.params.id, req.user));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

exports.adminRenewSweep = async (_req, res) => {
  try {
    res.json({ results: await domainService.renewExpiringSsl({}) });
  } catch (e) {
    res.status(500).json({ error: 'SSL renewal sweep failed.' });
  }
};
