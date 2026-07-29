// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM DOMAIN SERVICE (Beta) — one domain ↔ one company, never hardcoded.
//
// The `domain_mappings` table is the single router: host-header resolution,
// DNS verification, the SSL status machine and white-label branding all read
// and write it here. Status machine:
//
//   PENDING_DNS → DNS_VERIFIED → SSL_PENDING → SSL_ISSUED → ACTIVE
//                       ↘ FAILED (repeated verification failures)
//   DISABLED (Super Admin) overrides everything.
//
// Security invariants:
//   • domain UNIQUE + companyId UNIQUE — two companies can never share a host.
//   • Host routing only trusts ACTIVE mappings of companies with an active
//     subscription; requests from a mapped host by users of ANOTHER company
//     are rejected (authMiddleware calls assertHostCompany).
// ─────────────────────────────────────────────────────────────────────────────
const dns = require('dns').promises;
const crypto = require('crypto');
const prisma = require('../../config/prisma');
const sslService = require('./sslService');
const AuditService = require('../auditService');

const MAX_FAILS_BEFORE_FAILED = 10;

// Overridable resolver so the QA suite can simulate DNS without a network.
let dnsResolver = {
  resolveCname: (d) => dns.resolveCname(d),
  resolve4: (d) => dns.resolve4(d),
  resolveTxt: (d) => dns.resolveTxt(d),
};
function __setDnsResolver(mock) { dnsResolver = { ...dnsResolver, ...(mock || {}) }; }

// ── Configuration (SA-editable via the plan settings passthrough) ────────────
function settings() {
  const store = require('../planStore');
  const s = store.getSettings();
  return {
    cnameTarget: String(s.customDomainCnameTarget || 'tenant.zeniahr.com').toLowerCase(),
    aRecord: String(s.customDomainARecord || '').trim(),
    blacklist: Array.isArray(s.customDomainBlacklist) ? s.customDomainBlacklist : [],
  };
}

// Domains that can never be mapped: our own product surface plus well-known
// providers nobody could legitimately point at a tenant workspace.
const RESERVED_SUFFIXES = ['zeniahr.com', 'localhost', 'local', 'internal', 'test', 'invalid', 'example.com'];
const BLACKLIST = [
  'gmail.com', 'google.com', 'googleapis.com', 'facebook.com', 'microsoft.com', 'outlook.com',
  'yahoo.com', 'apple.com', 'amazon.com', 'amazonaws.com', 'github.com', 'cloudflare.com',
];

const normalizeDomain = (raw) => String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
const normalizeHost = (raw) => normalizeDomain(raw).replace(/:\d+$/, '');

const FQDN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/** Format + reserved + blacklist validation. Returns { ok } or { ok:false, error }. */
function validateDomain(raw) {
  const domain = normalizeDomain(raw);
  if (!domain) return { ok: false, error: 'Please enter a domain, e.g. hr.yourcompany.com.' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return { ok: false, error: 'IP addresses cannot be used as a custom domain.' };
  if (!FQDN_RE.test(domain)) return { ok: false, error: 'That does not look like a valid domain name. Example: hr.yourcompany.com.' };
  const labels = domain.split('.');
  if (labels.length < 2) return { ok: false, error: 'Please use a fully-qualified domain, e.g. hr.yourcompany.com.' };
  const suffixHit = (list) => list.some((s) => domain === s || domain.endsWith(`.${s}`));
  if (suffixHit(RESERVED_SUFFIXES)) return { ok: false, error: 'This domain is reserved and cannot be mapped.' };
  if (suffixHit(BLACKLIST) || suffixHit(settings().blacklist.map((b) => String(b).toLowerCase()))) {
    return { ok: false, error: 'This domain cannot be used for a custom workspace.' };
  }
  return { ok: true, domain };
}

/** The DNS records the customer must create (copy-paste ready). */
function dnsInstructionsFor(domain, verifyToken) {
  const cfg = settings();
  const labels = String(domain).split('.');
  return {
    cname: { type: 'CNAME', host: labels[0], target: cfg.cnameTarget },
    aRecord: cfg.aRecord ? { type: 'A', host: labels[0], target: cfg.aRecord } : null,
    txt: { type: 'TXT', host: `_zenia-verify.${domain}`, value: verifyToken },
  };
}

const audit = (userId, action, targetId, details) => {
  if (userId) AuditService.logAudit(userId, action, 'CustomDomain', String(targetId), details || {}).catch(() => {});
};

async function notifyCompanyHeads(companyId, title, message) {
  try {
    const { notify } = require('../notificationService');
    const heads = await prisma.user.findMany({
      where: { companyId, role: 'Company Head', status: 'Active' },
      select: { id: true },
    });
    for (const h of heads) {
      await notify({ userId: h.id, companyId, type: 'CUSTOM_DOMAIN', title, message, priority: 'high' });
    }
  } catch (e) {
    console.error('[custom-domain] notify failed:', e.message);
  }
}

// ── Company-facing operations ────────────────────────────────────────────────

async function getOverview(companyId) {
  const mapping = await prisma.domainMapping.findUnique({ where: { companyId } });
  const whiteLabel = await prisma.whiteLabelSettings.findUnique({ where: { companyId } });
  return {
    mapping,
    instructions: mapping ? dnsInstructionsFor(mapping.domain, mapping.verifyToken) : null,
    whiteLabel,
    sslProvider: sslService.provider(),
    beta: true,
    betaNotice: 'Custom Domain is currently in Beta. Some advanced branding features will be added in future updates.',
  };
}

async function addDomain({ companyId, domain: raw, user }) {
  const v = validateDomain(raw);
  if (!v.ok) { const e = new Error(v.error); e.status = 422; throw e; }
  const domain = v.domain;

  const existingForCompany = await prisma.domainMapping.findUnique({ where: { companyId } });
  if (existingForCompany) {
    const e = new Error(`Your workspace is already mapped to ${existingForCompany.domain}. Remove it before adding a new domain.`);
    e.status = 409;
    throw e;
  }
  const existingDomain = await prisma.domainMapping.findUnique({ where: { domain } });
  if (existingDomain) {
    // Never reveal WHICH company holds it — only that it is taken.
    const e = new Error('This domain is already in use. If you believe this is an error, contact support.');
    e.status = 409;
    throw e;
  }

  const cfg = settings();
  const verifyToken = `zenia-verify-${crypto.randomBytes(16).toString('hex')}`;
  const labels = domain.split('.');
  const mapping = await prisma.domainMapping.create({
    data: {
      uuid: crypto.randomUUID(),
      companyId,
      domain,
      subdomain: labels[0],
      status: 'PENDING_DNS',
      sslStatus: 'NONE',
      healthStatus: 'UNKNOWN',
      dnsType: 'CNAME',
      dnsTarget: cfg.cnameTarget,
      dnsProvider: null,
      // Instruction snapshot frozen at creation (what we told the customer).
      cnameHost: labels[0],
      cnameValue: cfg.cnameTarget,
      txtHost: `_zenia-verify.${domain}`,
      txtValue: verifyToken,
      verificationMethod: 'DNS',
      verifyToken,
      createdBy: user?.name || user?.email || 'Company Head',
    },
  });
  audit(user?.id, 'DOMAIN_ADDED', mapping.id, { companyId, domain, role: user?.role || null, ip: user?.ip || null });
  return mapping;
}

/**
 * DNS check: the domain must point at us (CNAME to our target, or A to our
 * record). The TXT ownership token is checked too and recorded, but the
 * point-at-us check is what gates verification.
 */
async function checkDns(mapping) {
  const cfg = settings();
  const result = { cnameOk: false, aOk: false, txtOk: false, observed: {} };
  try {
    const cnames = await dnsResolver.resolveCname(mapping.domain).catch(() => []);
    result.observed.cname = cnames;
    result.cnameOk = cnames.some((c) => normalizeDomain(c) === cfg.cnameTarget);
  } catch (_) { /* keep false */ }
  if (!result.cnameOk && cfg.aRecord) {
    try {
      const ips = await dnsResolver.resolve4(mapping.domain).catch(() => []);
      result.observed.a = ips;
      result.aOk = ips.includes(cfg.aRecord);
    } catch (_) { /* keep false */ }
  }
  try {
    const txts = await dnsResolver.resolveTxt(`_zenia-verify.${mapping.domain}`).catch(() => []);
    result.txtOk = txts.flat().some((t) => String(t).includes(mapping.verifyToken));
  } catch (_) { /* keep false */ }
  result.ok = result.cnameOk || result.aOk;
  return result;
}

/** Company subscription still entitled to run on a custom domain? */
async function subscriptionActive(companyId) {
  const [sub, company] = await Promise.all([
    prisma.companySubscription.findUnique({ where: { companyId } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { paymentStatus: true, isArchived: true } }),
  ]);
  if (!company || company.isArchived) return false;
  const status = sub?.status || 'Active';
  const expired = status === 'Expired'
    || (sub?.renewalDate && new Date(sub.renewalDate) < new Date())
    || ['Overdue', 'Expired', 'Unpaid'].includes(company.paymentStatus);
  return status === 'Active' && !expired;
}

/**
 * Verify / refresh the domain: DNS check → SSL provisioning → ACTIVE.
 * Used by the Verify button, Refresh Status, and the SA force-reverify.
 */
async function verifyDomain(companyId, { actorId = null, actorRole = null, actorIp = null, force = false } = {}) {
  const mapping = await prisma.domainMapping.findUnique({ where: { companyId } });
  if (!mapping) { const e = new Error('No custom domain is configured.'); e.status = 404; throw e; }
  if (mapping.status === 'DISABLED' && !force) {
    const e = new Error('This domain has been disabled by the platform. Contact support.');
    e.status = 409;
    throw e;
  }

  const dnsResult = await checkDns(mapping);
  const now = new Date();
  let data = { dnsCheckedAt: now };
  let transition = null;

  if (!dnsResult.ok) {
    const failCount = (mapping.failCount || 0) + 1;
    data = {
      ...data,
      failCount,
      lastError: `DNS not pointing at us yet (checked ${now.toISOString()}). Expected CNAME → ${settings().cnameTarget}${settings().aRecord ? ` or A → ${settings().aRecord}` : ''}.`,
      status: mapping.status === 'ACTIVE' || mapping.status === 'DISABLED'
        ? mapping.status // an active domain is not torn down by one bad check
        : failCount >= MAX_FAILS_BEFORE_FAILED ? 'FAILED' : 'PENDING_DNS',
    };
    audit(actorId, 'DOMAIN_VERIFY_FAILED', mapping.id, { domain: mapping.domain, observed: dnsResult.observed, role: actorRole, ip: actorIp });
  } else {
    data = { ...data, failCount: 0, lastError: null, dnsVerifiedAt: mapping.dnsVerifiedAt || now };
    if (!mapping.dnsVerifiedAt) {
      transition = 'DNS_VERIFIED';
      audit(actorId, 'DOMAIN_DNS_VERIFIED', mapping.id, { domain: mapping.domain, txtOk: dnsResult.txtOk, role: actorRole, ip: actorIp });
      notifyCompanyHeads(companyId, 'Custom domain DNS verified', `DNS for ${mapping.domain} is verified. SSL setup is next — no action needed from you.`);
    }

    // SSL: provision if not yet issued (the customer never handles SSL).
    if (mapping.sslStatus !== 'ISSUED') {
      const ssl = await sslService.requestCertificate(mapping.domain);
      if (ssl.status === 'ISSUED') {
        data.sslStatus = 'ISSUED';
        data.sslProvider = sslService.provider();
        data.sslIssuedAt = ssl.issuedAt;
        data.sslExpiresAt = ssl.expiresAt;
        audit(actorId, 'DOMAIN_SSL_ISSUED', mapping.id, { domain: mapping.domain, expiresAt: ssl.expiresAt });
        notifyCompanyHeads(companyId, 'SSL certificate ready', `The SSL certificate for ${mapping.domain} has been issued.`);
      } else {
        data.sslStatus = 'PENDING';
        if (ssl.error) data.lastError = ssl.error;
      }
    }

    const sslIssued = data.sslStatus === 'ISSUED' || mapping.sslStatus === 'ISSUED';
    const subOk = await subscriptionActive(companyId);
    if (sslIssued && subOk) {
      data.status = 'ACTIVE';
      if (!mapping.activatedAt) {
        data.activatedAt = now;
        notifyCompanyHeads(companyId, 'Custom domain active 🎉', `Your workspace is now available at https://${mapping.domain}.`);
      }
    } else if (sslIssued) {
      data.status = 'SSL_ISSUED'; // waiting on subscription
    } else {
      data.status = 'SSL_PENDING';
    }
  }

  const updated = await prisma.domainMapping.update({ where: { id: mapping.id }, data });
  invalidateHostCache(mapping.domain);
  return { mapping: updated, dns: dnsResult, transition };
}

async function removeDomain(companyId, user) {
  const mapping = await prisma.domainMapping.findUnique({ where: { companyId } });
  if (!mapping) { const e = new Error('No custom domain is configured.'); e.status = 404; throw e; }
  await prisma.domainMapping.delete({ where: { id: mapping.id } });
  invalidateHostCache(mapping.domain);
  audit(user?.id, 'DOMAIN_REMOVED', mapping.id, { companyId, domain: mapping.domain, role: user?.role || null, ip: user?.ip || null });
  return { removed: mapping.domain };
}

// ── White label settings ─────────────────────────────────────────────────────

const WL_FIELDS = ['enabled', 'logoUrl', 'faviconUrl', 'primaryColor', 'secondaryColor', 'loginBackground', 'supportEmail', 'supportPhone', 'footerText', 'hideZeniaBranding'];

async function saveWhiteLabel(companyId, patch, user) {
  const data = {};
  for (const k of WL_FIELDS) {
    if (patch[k] !== undefined) data[k] = typeof patch[k] === 'boolean' ? patch[k] : (patch[k] === null ? null : String(patch[k]));
  }
  const row = await prisma.whiteLabelSettings.upsert({
    where: { companyId },
    create: { companyId, ...data },
    update: data,
  });
  const mapping = await prisma.domainMapping.findUnique({ where: { companyId } });
  if (mapping) invalidateHostCache(mapping.domain);
  audit(user?.id, 'WHITE_LABEL_UPDATED', companyId, { fields: Object.keys(data), role: user?.role || null, ip: user?.ip || null });
  return row;
}

// ── Host routing (every request) ─────────────────────────────────────────────
// Small TTL cache so host resolution costs a DB hit at most once a minute per
// host, not once per request.
const hostCache = new Map(); // host → { value, expires }
const HOST_TTL = 60000;
function invalidateHostCache(domain) { hostCache.delete(normalizeHost(domain)); }

/**
 * Resolve a Host header to its mapped company. Only ACTIVE mappings whose
 * company still has an active subscription route traffic — everything else
 * resolves to null (the request is then treated as the default app host).
 */
async function resolveHost(hostHeader) {
  const host = normalizeHost(hostHeader);
  if (!host || !FQDN_RE.test(host)) return null;
  const cached = hostCache.get(host);
  if (cached && cached.expires > Date.now()) return cached.value;

  let value = null;
  const mapping = await prisma.domainMapping.findUnique({ where: { domain: host } }).catch(() => null);
  if (mapping && mapping.status === 'ACTIVE' && (await subscriptionActive(mapping.companyId))) {
    value = { companyId: mapping.companyId, domain: mapping.domain, mappingId: mapping.id };
  }
  hostCache.set(host, { value, expires: Date.now() + HOST_TTL });
  return value;
}

/**
 * Public login-page branding for a host. Branding is shown from DNS_VERIFIED
 * onward (so customers can preview while SSL finishes), but request ROUTING
 * (resolveHost) stays ACTIVE-only.
 */
async function publicBrandingForHost(hostHeader) {
  const host = normalizeHost(hostHeader);
  if (!host || !FQDN_RE.test(host)) return null;
  const mapping = await prisma.domainMapping.findUnique({ where: { domain: host } }).catch(() => null);
  if (!mapping || ['PENDING_DNS', 'FAILED', 'DISABLED'].includes(mapping.status)) return null;
  const [company, wl] = await Promise.all([
    prisma.company.findUnique({ where: { id: mapping.companyId }, select: { name: true } }),
    prisma.whiteLabelSettings.findUnique({ where: { companyId: mapping.companyId } }),
  ]);
  return {
    domain: mapping.domain,
    status: mapping.status,
    companyName: company?.name || null,
    whiteLabel: wl?.enabled
      ? {
          logoUrl: wl.logoUrl, faviconUrl: wl.faviconUrl,
          primaryColor: wl.primaryColor, secondaryColor: wl.secondaryColor,
          loginBackground: wl.loginBackground,
          supportEmail: wl.supportEmail, supportPhone: wl.supportPhone,
          footerText: wl.footerText,
          hideZeniaBranding: wl.hideZeniaBranding,
        }
      : null,
  };
}

/** Base app URL for a company — its active custom domain, else the default. */
async function appBaseUrlFor(companyId) {
  try {
    const mapping = await prisma.domainMapping.findUnique({ where: { companyId } });
    if (mapping && mapping.status === 'ACTIVE') return `https://${mapping.domain}`;
  } catch (_) { /* fall through */ }
  return process.env.APP_PUBLIC_URL || 'https://app.zeniahr.com';
}

// ── Super Admin operations ───────────────────────────────────────────────────

async function adminList() {
  const mappings = await prisma.domainMapping.findMany({ orderBy: { id: 'desc' } });
  const companies = await prisma.company.findMany({
    where: { id: { in: mappings.map((m) => m.companyId) } },
    select: { id: true, name: true, plan: true },
  });
  const byId = new Map(companies.map((c) => [c.id, c]));
  return mappings.map((m) => ({
    ...m,
    companyName: byId.get(m.companyId)?.name || `Company #${m.companyId}`,
    companyPlan: byId.get(m.companyId)?.plan || '',
  }));
}

async function adminSetDisabled(id, disabled, admin) {
  const mapping = await prisma.domainMapping.findUnique({ where: { id: Number(id) || 0 } });
  if (!mapping) { const e = new Error('Domain mapping not found.'); e.status = 404; throw e; }
  const updated = await prisma.domainMapping.update({
    where: { id: mapping.id },
    data: disabled
      ? { status: 'DISABLED', disabledBy: admin?.name || 'Super Admin', disabledAt: new Date() }
      : { status: mapping.sslStatus === 'ISSUED' ? 'SSL_ISSUED' : mapping.dnsVerifiedAt ? 'DNS_VERIFIED' : 'PENDING_DNS', disabledBy: null, disabledAt: null },
  });
  invalidateHostCache(mapping.domain);
  audit(admin?.id, disabled ? 'DOMAIN_DISABLED' : 'DOMAIN_RE_ENABLED', mapping.id, { domain: mapping.domain });
  return updated;
}

async function adminDelete(id, admin) {
  const mapping = await prisma.domainMapping.findUnique({ where: { id: Number(id) || 0 } });
  if (!mapping) { const e = new Error('Domain mapping not found.'); e.status = 404; throw e; }
  await prisma.domainMapping.delete({ where: { id: mapping.id } });
  invalidateHostCache(mapping.domain);
  audit(admin?.id, 'DOMAIN_REMOVED', mapping.id, { domain: mapping.domain, by: 'Super Admin' });
  return { removed: mapping.domain };
}

/**
 * Domain health probe: DNS, SSL state, HTTPS reachability, redirect, response
 * time, certificate expiry and security headers. Each item reports
 * independently — an unreachable probe never masks a good DNS result.
 */
async function healthCheck(companyId) {
  const mapping = await prisma.domainMapping.findUnique({ where: { companyId } });
  if (!mapping) { const e = new Error('No custom domain is configured.'); e.status = 404; throw e; }

  const dnsResult = await checkDns(mapping);
  const health = {
    checkedAt: new Date().toISOString(),
    dns: { ok: dnsResult.ok, observed: dnsResult.observed, txtOk: dnsResult.txtOk },
    ssl: {
      status: mapping.sslStatus,
      expiresAt: mapping.sslExpiresAt,
      daysToExpiry: mapping.sslExpiresAt ? Math.floor((new Date(mapping.sslExpiresAt) - Date.now()) / 86400000) : null,
    },
    https: { reachable: false, statusCode: null, redirect: null, responseTimeMs: null, error: null },
    securityHeaders: null,
  };

  // Live HTTPS probe (5s budget). Locally / pre-infra this reports the real
  // reason it cannot connect instead of pretending.
  try {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://${mapping.domain}/`, { redirect: 'manual', signal: controller.signal });
    clearTimeout(timer);
    health.https.reachable = true;
    health.https.statusCode = res.status;
    health.https.responseTimeMs = Date.now() - started;
    health.https.redirect = res.headers.get('location') || null;
    health.securityHeaders = {
      strictTransportSecurity: res.headers.get('strict-transport-security') || null,
      xContentTypeOptions: res.headers.get('x-content-type-options') || null,
      xFrameOptions: res.headers.get('x-frame-options') || null,
      contentSecurityPolicy: res.headers.get('content-security-policy') ? 'present' : null,
    };
  } catch (e) {
    health.https.error = String(e?.cause?.code || e?.name || e?.message || 'unreachable').slice(0, 120);
  }

  const healthStatus = dnsResult.ok && mapping.sslStatus === 'ISSUED' && health.https.reachable
    ? 'HEALTHY'
    : dnsResult.ok ? 'DEGRADED' : 'DOWN';
  await prisma.domainMapping.update({
    where: { id: mapping.id },
    data: { healthStatus, healthDetail: JSON.stringify(health), dnsCheckedAt: new Date() },
  });
  return { healthStatus, health, mapping: { ...mapping, healthStatus } };
}

/**
 * Periodic monitor (started from server.js unless CUSTOM_DOMAIN_MONITOR=off):
 * re-verifies + health-checks every non-disabled mapping and renews expiring
 * certificates. Company Heads are notified when a previously working domain
 * degrades.
 */
async function monitorSweep() {
  const mappings = await prisma.domainMapping.findMany({ where: { status: { notIn: ['DISABLED'] } } });
  const results = [];
  for (const m of mappings) {
    try {
      const before = m.healthStatus;
      await verifyDomain(m.companyId, {}).catch(() => {});
      const { healthStatus } = await healthCheck(m.companyId);
      if (before === 'HEALTHY' && healthStatus !== 'HEALTHY') {
        await notifyCompanyHeads(m.companyId, 'Custom domain needs attention',
          `${m.domain} is currently ${healthStatus === 'DOWN' ? 'not resolving to ZeniaHR' : 'degraded'}. Check your DNS settings or contact support.`);
      }
      results.push({ domain: m.domain, healthStatus });
    } catch (e) {
      results.push({ domain: m.domain, error: e.message });
    }
  }
  await renewExpiringSsl({}).catch(() => {});
  return results;
}

/** SSL renewal sweep (cron/manual): re-provision certs expiring within 21 days. */
async function renewExpiringSsl({ withinDays = 21 } = {}) {
  const cutoff = new Date(Date.now() + withinDays * 86400000);
  const due = await prisma.domainMapping.findMany({
    where: { sslStatus: 'ISSUED', sslExpiresAt: { lte: cutoff }, status: { in: ['ACTIVE', 'SSL_ISSUED'] } },
  });
  const results = [];
  for (const m of due) {
    const ssl = await sslService.renewCertificate(m.domain);
    if (ssl.status === 'ISSUED') {
      await prisma.domainMapping.update({
        where: { id: m.id },
        data: { sslIssuedAt: ssl.issuedAt, sslExpiresAt: ssl.expiresAt, sslStatus: 'ISSUED', lastError: null },
      });
      audit(null, 'DOMAIN_SSL_RENEWED', m.id, { domain: m.domain, expiresAt: ssl.expiresAt });
    } else {
      await prisma.domainMapping.update({
        where: { id: m.id },
        data: { sslStatus: 'RENEWAL_FAILED', lastError: ssl.error || 'SSL renewal pending' },
      });
      notifyCompanyHeads(m.companyId, 'SSL renewal needs attention', `The SSL certificate for ${m.domain} could not be renewed automatically. Our team has been alerted.`);
      try {
        const { notifySuperAdmins } = require('../payments/paymentOrderService');
        await notifySuperAdmins({ title: 'Custom domain SSL renewal failed', message: `${m.domain} (company #${m.companyId}) needs manual SSL attention.`, priority: 'high' });
      } catch (_) { /* best effort */ }
    }
    results.push({ domain: m.domain, status: ssl.status });
  }
  return results;
}

module.exports = {
  validateDomain,
  normalizeHost,
  dnsInstructionsFor,
  getOverview,
  addDomain,
  checkDns,
  verifyDomain,
  removeDomain,
  saveWhiteLabel,
  resolveHost,
  publicBrandingForHost,
  appBaseUrlFor,
  subscriptionActive,
  adminList,
  adminSetDisabled,
  adminDelete,
  renewExpiringSsl,
  healthCheck,
  monitorSweep,
  __setDnsResolver,
};
