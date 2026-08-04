/**
 * White Label & Custom Domain (Beta) — verification suite.
 *
 * Scratch tenants (999909/999910), MOCK SSL provider, injected DNS resolver
 * (no network), self-cleaning. Covers: plan gating, domain validation
 * (format/IP/reserved/blacklist), add + duplicate protection, DNS verification
 * fail/success, automatic SSL, ACTIVE transition, host routing (+cache
 * invalidation, port/case normalisation), subscription lock, white-label
 * public branding, appBaseUrlFor, SA disable/enable/delete, SSL renewal
 * success + failure, tenant isolation.
 *
 *   node scripts/verifyCustomDomain.js
 */
process.env.CUSTOM_DOMAIN_SSL_PROVIDER = 'mock';

const prisma = require('../src/config/prisma');
const domainService = require('../src/services/customDomain/domainService');
const { isModuleLocked } = require('../src/services/planEntitlements');
const planStore = require('../src/services/planStore');

const COMPANY = 999909;
const BYSTANDER = 999910;
const DOMAIN = 'hr.qa-domain-test.com';

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// Injected DNS resolver — the test controls exactly what "DNS" answers.
const dnsState = { cname: {}, a: {}, txt: {} };
domainService.__setDnsResolver({
  resolveCname: async (d) => dnsState.cname[d] || [],
  resolve4: async (d) => dnsState.a[d] || [],
  resolveTxt: async (d) => dnsState.txt[d] || [],
});

const user = { id: null, name: 'QA Company Head', role: 'Company Head' };

async function main() {
  console.log('Custom Domain verification (scratch tenants, mock SSL, injected DNS)\n');

  await prisma.company.createMany({
    data: [
      { id: COMPANY, name: 'QA Domain Co', plan: 'Professional', isHeadOffice: true, state: 'Gujarat' },
      { id: BYSTANDER, name: 'QA Domain Bystander', plan: 'Free', isHeadOffice: true },
    ],
    skipDuplicates: true,
  });

  try {
    // §1 Plan gating (Feature Matrix)
    console.log('§1 Subscription plan gating');
    // Rule: ONLY the free tier locks Custom Domain — every paid plan has it
    // enabled unless the Super Admin explicitly disables it in the plan editor.
    check('Free plan: custom-domain module LOCKED', isModuleLocked('Free', 'custom-domain') === true);
    check('Starter plan: ENABLED (paid)', isModuleLocked('Starter', 'custom-domain') === false);
    check('Professional plan: ENABLED (paid)', isModuleLocked('Professional', 'custom-domain') === false);
    check('Enterprise plan: ENABLED (paid)', isModuleLocked('Enterprise', 'custom-domain') === false);
    check('Custom plan template: ENABLED (paid)', isModuleLocked('Custom', 'custom-domain') === false);
    check('every stored PAID plan has custom-domain enabled', planStore.getPlans()
      .filter((p) => !!p.custom || Number(p.priceQuarterly) > 0 || Number(p.priceYearly) > 0)
      .every((p) => p.enabledModules.includes('custom-domain')));
    check('unknown plan string is never locked out', isModuleLocked('SomeFuturePaidPlan', 'custom-domain') === false);

    // §2 Domain validation
    console.log('§2 Domain validation');
    check('garbage rejected', domainService.validateDomain('not a domain').ok === false);
    check('IP address rejected', domainService.validateDomain('192.168.1.10').ok === false);
    check('reserved zeniahr.com rejected', domainService.validateDomain('app.zeniahr.com').ok === false);
    check('blacklisted provider rejected', domainService.validateDomain('mail.gmail.com').ok === false);
    check('scheme + path stripped, lowercased', domainService.validateDomain('HTTPS://HR.Company.COM/login').domain === 'hr.company.com');
    check('valid subdomain accepted', domainService.validateDomain(DOMAIN).ok === true);

    // §3 Add domain + duplicate protection
    console.log('§3 Add domain & duplicates');
    const mapping = await domainService.addDomain({ companyId: COMPANY, domain: DOMAIN, user });
    check('mapping created as PENDING_DNS with a verify token', mapping.status === 'PENDING_DNS' && /^zenia-verify-/.test(mapping.verifyToken));
    check('completion columns populated (uuid, subdomain, snapshot, method)',
      /^[0-9a-f-]{36}$/.test(mapping.uuid || '') && mapping.subdomain === 'hr'
      && mapping.cnameHost === 'hr' && !!mapping.cnameValue && mapping.txtValue === mapping.verifyToken
      && mapping.verificationMethod === 'DNS' && mapping.healthStatus === 'UNKNOWN');
    const instr = domainService.dnsInstructionsFor(mapping.domain, mapping.verifyToken);
    check('DNS instructions carry the CNAME target', instr.cname.type === 'CNAME' && !!instr.cname.target && instr.txt.value === mapping.verifyToken);
    let dupErr = null;
    try { await domainService.addDomain({ companyId: COMPANY, domain: 'other.example.org', user }); } catch (e) { dupErr = e; }
    check('second domain for the same company refused (409)', dupErr?.status === 409);
    let stealErr = null;
    try { await domainService.addDomain({ companyId: BYSTANDER, domain: DOMAIN, user }); } catch (e) { stealErr = e; }
    check('ANOTHER company cannot claim the same domain (409, no owner leak)',
      stealErr?.status === 409 && !/QA Domain Co/.test(stealErr?.message || ''));

    // §4 DNS verification — failure first
    console.log('§4 DNS verification (failure)');
    dnsState.cname[DOMAIN] = ['wrong.example.net'];
    let res = await domainService.verifyDomain(COMPANY, {});
    check('wrong CNAME → still PENDING_DNS with an explanatory error',
      res.mapping.status === 'PENDING_DNS' && res.mapping.failCount === 1 && /not pointing at us/i.test(res.mapping.lastError || ''));

    // §5 DNS verification — success → automatic SSL → ACTIVE
    console.log('§5 DNS verified → SSL issued → ACTIVE');
    dnsState.cname[DOMAIN] = [instr.cname.target];
    dnsState.txt[`_zenia-verify.${DOMAIN}`] = [[mapping.verifyToken]];
    res = await domainService.verifyDomain(COMPANY, {});
    check('DNS verified + mock SSL issued + subscription active → ACTIVE',
      res.mapping.status === 'ACTIVE' && res.mapping.sslStatus === 'ISSUED', JSON.stringify({ s: res.mapping.status, ssl: res.mapping.sslStatus }));
    check('SSL expiry ≈ 90 days out', res.mapping.sslExpiresAt && (new Date(res.mapping.sslExpiresAt) - Date.now()) > 80 * 86400000);
    check('activation timestamp recorded', !!res.mapping.activatedAt);
    check('fail counter reset on success', res.mapping.failCount === 0 && res.mapping.lastError == null);

    // §6 Host routing
    console.log('§6 Host-header routing');
    let hit = await domainService.resolveHost(DOMAIN);
    check('active domain routes to the mapped company', hit?.companyId === COMPANY);
    hit = await domainService.resolveHost(`HR.QA-DOMAIN-TEST.COM:443`);
    check('host matching is case-insensitive and ignores the port', hit?.companyId === COMPANY);
    check('unknown host resolves to null (default routing untouched)', (await domainService.resolveHost('unknown.example.com')) === null);
    check('default app host untouched', (await domainService.resolveHost('localhost:5000')) === null);

    // §7 Subscription lock on routing
    console.log('§7 Active-subscription requirement');
    await prisma.companySubscription.upsert({
      where: { companyId: COMPANY },
      create: { companyId: COMPANY, plan: 'Professional', status: 'Expired' },
      update: { status: 'Expired' },
    });
    await domainService.adminSetDisabled((await prisma.domainMapping.findUnique({ where: { companyId: COMPANY } })).id, false, { name: 'cachebust' }); // invalidates host cache
    check('expired subscription → host no longer routes', (await domainService.resolveHost(DOMAIN)) === null);
    await prisma.companySubscription.update({ where: { companyId: COMPANY }, data: { status: 'Active' } });
    await domainService.verifyDomain(COMPANY, {}); // re-activate + bust cache
    check('renewed subscription → routing restored', (await domainService.resolveHost(DOMAIN))?.companyId === COMPANY);

    // §8 White label + public login branding
    console.log('§8 White label & public branding');
    await domainService.saveWhiteLabel(COMPANY, {
      enabled: true, logoUrl: 'https://cdn.qa/logo.png', primaryColor: '#112233', secondaryColor: '#445566',
      supportEmail: 'help@qa-domain-test.com', footerText: '© QA Domain Co', hideZeniaBranding: true,
    }, user);
    let brand = await domainService.publicBrandingForHost(DOMAIN);
    check('branding returned for the mapped host (logo, colors, no ZeniaHR)',
      brand?.companyName === 'QA Domain Co' && brand?.whiteLabel?.logoUrl === 'https://cdn.qa/logo.png'
      && brand?.whiteLabel?.primaryColor === '#112233' && brand?.whiteLabel?.hideZeniaBranding === true);
    await domainService.saveWhiteLabel(COMPANY, { enabled: false }, user);
    brand = await domainService.publicBrandingForHost(DOMAIN);
    check('white label OFF → company name only, no branding payload', brand?.companyName === 'QA Domain Co' && brand?.whiteLabel === null);
    check('unmapped host → no branding at all', (await domainService.publicBrandingForHost('unknown.example.com')) === null);

    // §8b Domain health + monitoring
    console.log('§8b Health probe & automatic monitoring');
    const hc = await domainService.healthCheck(COMPANY);
    check('health probe: DNS ok, SSL issued, HTTPS honestly reported (no fake reachability)',
      hc.health.dns.ok === true && hc.health.ssl.status === 'ISSUED'
      && hc.health.ssl.daysToExpiry > 80 && hc.health.https.reachable === false && !!hc.health.https.error,
      JSON.stringify(hc.health.https));
    check('health status persisted (DEGRADED: DNS+SSL good, edge not deployed locally)',
      hc.healthStatus === 'DEGRADED' && JSON.parse((await prisma.domainMapping.findUnique({ where: { companyId: COMPANY } })).healthDetail).dns.ok === true);
    const sweep = await domainService.monitorSweep();
    check('monitor sweep covers the domain', sweep.some((r) => r.domain === DOMAIN));
    check('sslProvider recorded on issue', (await prisma.domainMapping.findUnique({ where: { companyId: COMPANY } })).sslProvider === 'mock');

    // §9 Email base URL
    console.log('§9 Custom-domain URLs for emails');
    check('active mapping → https://<domain>', (await domainService.appBaseUrlFor(COMPANY)) === `https://${DOMAIN}`);
    const fallback = await domainService.appBaseUrlFor(BYSTANDER);
    check('no mapping → default app URL', /^https?:\/\//.test(fallback) && !fallback.includes(DOMAIN));

    // §10 Super Admin fleet operations
    console.log('§10 Super Admin operations');
    const list = await domainService.adminList();
    const row = list.find((m) => m.domain === DOMAIN);
    check('fleet list shows company, status, SSL, verified & last-checked', !!row && row.companyName === 'QA Domain Co' && !!row.dnsVerifiedAt && !!row.dnsCheckedAt);
    await domainService.adminSetDisabled(row.id, true, { name: 'QA SA' });
    check('disabled mapping stops routing immediately', (await domainService.resolveHost(DOMAIN)) === null);
    let disabledErr = null;
    try { await domainService.verifyDomain(COMPANY, {}); } catch (e) { disabledErr = e; }
    check('company cannot verify a disabled domain', disabledErr?.status === 409);
    await domainService.adminSetDisabled(row.id, false, { name: 'QA SA' });
    await domainService.verifyDomain(COMPANY, { force: true });
    check('re-enabled + reverified → ACTIVE again', (await domainService.resolveHost(DOMAIN))?.companyId === COMPANY);

    // §11 SSL renewal (auto success + failure alerting)
    console.log('§11 SSL renewal');
    await prisma.domainMapping.update({ where: { companyId: COMPANY }, data: { sslExpiresAt: new Date(Date.now() + 5 * 86400000) } });
    let renewals = await domainService.renewExpiringSsl({ withinDays: 21 });
    let after = await prisma.domainMapping.findUnique({ where: { companyId: COMPANY } });
    check('expiring cert renewed automatically (mock provider)',
      renewals.some((r) => r.domain === DOMAIN && r.status === 'ISSUED') && (new Date(after.sslExpiresAt) - Date.now()) > 80 * 86400000);
    process.env.CUSTOM_DOMAIN_SSL_PROVIDER = 'manual';
    await prisma.domainMapping.update({ where: { companyId: COMPANY }, data: { sslExpiresAt: new Date(Date.now() + 5 * 86400000) } });
    renewals = await domainService.renewExpiringSsl({ withinDays: 21 });
    after = await prisma.domainMapping.findUnique({ where: { companyId: COMPANY } });
    check('renewal failure flagged as RENEWAL_FAILED (alerts fired)', after.sslStatus === 'RENEWAL_FAILED');
    process.env.CUSTOM_DOMAIN_SSL_PROVIDER = 'mock';
    await domainService.verifyDomain(COMPANY, {}); // heals back to ISSUED/ACTIVE

    // §12 Removal + isolation
    console.log('§12 Removal & tenant isolation');
    const removed = await domainService.removeDomain(COMPANY, user);
    check('domain removed', removed.removed === DOMAIN && (await prisma.domainMapping.count({ where: { companyId: COMPANY } })) === 0);
    check('removed domain stops routing', (await domainService.resolveHost(DOMAIN)) === null);
    check('bystander company has no mappings or settings',
      (await prisma.domainMapping.count({ where: { companyId: BYSTANDER } })) === 0
      && (await prisma.whiteLabelSettings.count({ where: { companyId: BYSTANDER } })) === 0);
  } finally {
    console.log('\nCleaning up scratch tenants…');
    await prisma.domainMapping.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
    await prisma.whiteLabelSettings.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
    await prisma.companySubscription.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: { in: [COMPANY, BYSTANDER] } } }).catch(() => {});
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
