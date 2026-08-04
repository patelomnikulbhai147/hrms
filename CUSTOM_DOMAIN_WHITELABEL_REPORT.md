# BUG FIX — Feature gate: paid companies were treated as free (2026-07-29)

**Symptom:** Company Heads on PAID plans saw the "Custom Domain is a premium feature" Upgrade Card.

**Root cause (data + a hardcoded mirror, not the gate engine):**
1. **Stored plan data** — `backend/data/planDefinitions.json` → the **Starter** plan's `enabledModules` had no `custom-domain` (the initial Beta rollout deliberately granted only Professional/Enterprise/Custom via `enableCustomDomainModule.js`). The generic gate (`isModuleLocked` → premium key ∉ `enabledModules` ⇒ locked) then correctly returned 403 `PLAN_UPGRADE_REQUIRED` for every Starter company — paid, but treated like Free.
2. **Frontend mirror** — `frontend/src/config/planEntitlements.ts` hardcoded `Starter: { locked: ['custom-domain'], lockedPages: ['custom-domain'] }`, so even the client-side fallback locked Starter.
3. **Stale in-process cache** — `planStore` caches `planDefinitions.json` in memory per process; a data fix from a script does NOT reach a running backend until restart (restarted as part of the fix).

**Old logic:** `custom-domain` enabled only where the rollout script had granted it (Professional, Enterprise, Custom template); Starter and any future paid plan locked by default.

**New logic (no plan names hardcoded — driven by the stored plan/subscription records):**
- Free tier (not custom-priced AND ₹0 on both cycles) → **locked**, Upgrade Card.
- Every **paid** plan (custom-priced OR a non-zero price on either cycle) → **enabled**, unless the Super Admin explicitly disables it (unticks the module in the plan editor / omits it from a Custom company's `customModules`).
- Unknown plan strings resolve to unrestricted (never accidentally lock a paying customer).

**Files changed:** `backend/scripts/enableCustomDomainModule.js` (now grants to ALL paid plans by price/custom flag + Custom-plan `customModules` arrays; still idempotent; ran locally — Starter granted), `backend/data/planDefinitions.json` (Starter now lists `custom-domain`), `frontend/src/config/planEntitlements.ts` (Starter lock removed), `backend/src/services/planEntitlements.js` (Free static fallback also locks the `custom-domain` page), `frontend/src/pages/CustomDomain.tsx` (upgrade copy: "included with every paid plan"), `backend/scripts/verifyCustomDomain.js` + `verifySubscriptionPurchase.js` (assertions updated to the new rule).

**Test results (real middleware `requirePlanModule('custom-domain')` run per company + live HTTP):**
| Plan | Company | Result |
|---|---|---|
| Free | 26 vufics | 403 PLAN_UPGRADE_REQUIRED → Upgrade Card ✓ |
| Starter | 11 pulpit mobility, 13 VISHV ENTERPR | **ALLOWED** ✓ (previously 403) |
| Professional | 2 HealthPlus LLC | ALLOWED ✓ |
| Enterprise | 1 Vishv Enterprise, 9 Test Company | ALLOWED ✓ |
| Custom (SA granted) | scratch 999911 | ALLOWED ✓ |
| Custom (SA explicitly disabled) | scratch 999912 | 403 ✓ (SA override honored) |

Suites: custom-domain **47/47** (3 new gate checks incl. "every stored paid plan has custom-domain"), subscription purchase 44/44, slots 63/63, `tsc` 0, build ✓. Backend restarted; live login (Company Head) → `lockedPages=[]`, `GET /api/custom-domain/overview` → 200. Pricing, GST, settlement and all other module gates untouched. **Deploy note:** the updated `enableCustomDomainModule.js` must run on EC2 (then restart the backend) for the live store to gain the Starter grant.

---

# COMPLETION ROUND — "Could not load custom domain settings." + production hardening

**Root cause (verified with a live authenticated repro, not guessed):** the API itself was healthy — a real Company Head login (Enterprise) returned 200 with correct data. The message came from the page collapsing EVERY non-200 into one generic error: a plan-locked company (403 `PLAN_UPGRADE_REQUIRED` — stale cached sessions predate the module, so the route-level premium screen didn't intercept) and non-authorized roles both rendered "Could not load custom domain settings." **Fix:** the page now distinguishes real states — skeleton loader while fetching; **Upgrade Card** (config hidden, button opens the Subscription Upgrade Wizard) on `PLAN_UPGRADE_REQUIRED`; an access-denied notice for disallowed roles; and a real error message with **Retry** for genuine failures. Endpoint re-verified 200 after all changes.

**Also completed this round:**
- **DB (additive, applied locally):** `domain_mappings` gained `uuid` (unique), `subdomain`, `sslProvider`, `healthStatus`, `healthDetail`, `dnsProvider`, `cnameHost/cnameValue`, `txtHost/txtValue`, `verificationMethod` — populated on creation (instruction snapshot frozen).
- **Security tightened per this spec:** the module is now **Super Admin + Company Head only — HR/Manager/Employee receive 403** on every endpoint (supersedes the earlier HR-read-only rule); the sidebar entry is Company-Head-only. Ownership resolves from the session on every API; duplicate/cross-company protections unchanged.
- **APIs (§15):** RESTful aliases `GET/POST/PUT/DELETE /api/custom-domain`, `POST /verify`, `POST /activate` (activation *is* a successful verify → DNS→SSL→ACTIVE), `GET /status`, `GET /health` — same gates as the original routes.
- **Domain Health card (§12):** live probe of DNS, SSL status + days-to-expiry, HTTPS reachability with status code/redirect/response time, and security headers (HSTS, X-Content-Type-Options, X-Frame-Options, CSP). Honestly reported — locally the HTTPS probe shows the real connection error rather than pretending; overall status persists as HEALTHY/DEGRADED/DOWN.
- **Automatic monitoring (§13):** a 6-hour sweep (kill switch `CUSTOM_DOMAIN_MONITOR=off`) re-verifies, health-checks, renews expiring certificates, and notifies Company Heads when a previously healthy domain degrades.
- **Audit (§17):** every write now records user, **role**, company, **IP**, timestamp.
- **Nginx (§19):** [deploy/nginx-custom-domain.conf.example](deploy/nginx-custom-domain.conf.example) — wildcard catch-all vhost, Host/X-Forwarded-Host passthrough, ACME challenge path, HTTPS redirect, security headers. Not applied (infra; deploy step).
- **QA:** suite extended to **44/44** (new: completion columns, honest health probe, persisted health detail, monitor sweep, sslProvider recording). Regressions: slots 63/63, subscription 44/44, `tsc` 0, build ✓, backend restarted + live-login re-verification 200.

**Remaining manual infrastructure (unchanged, documented below):** tenant DNS record, nginx install, `CUSTOM_DOMAIN_SSL_PROVIDER=certbot` on EC2 — the application layer requires no further work.

---

# Implementation Report & Architecture — White Label & Custom Domain Module 🧪 BETA

**Date:** 2026-07-29 · **Status:** Built and verified locally. **Nothing committed, pushed, merged, or deployed. Production untouched.** Awaiting approval.

---

## 1. Architecture

### Domain mapping is a table, never a hardcode
`domain_mappings` (new, additive) is the single router: `domain` **UNIQUE** + `companyId` **UNIQUE** — one domain ↔ one company is a database constraint, not a convention. Columns carry the full lifecycle: status, sslStatus, dnsType/dnsTarget, ownership `verifyToken` (TXT), dnsCheckedAt/dnsVerifiedAt, sslIssuedAt/sslExpiresAt, activatedAt, lastError, failCount, disabledBy/At, createdBy.

### Status machine
```
PENDING_DNS → DNS_VERIFIED → SSL_PENDING → SSL_ISSUED → ACTIVE
                    ↘ FAILED (after 10 consecutive failed checks)
DISABLED (Super Admin override — stops routing instantly)
```
`verifyDomain()` drives every transition: DNS check → SSL provisioning → ACTIVE (only if SSL is issued **and** the subscription is active). An ACTIVE domain is never torn down by one transient bad DNS check.

### DNS verification
`services/customDomain/domainService.js` resolves the domain via Node's DNS: **CNAME → configured target** (`customDomainCnameTarget`, SA-editable in plan settings, default `tenant.zeniahr.com`) or **A → configured IP** (`customDomainARecord`), plus a **TXT ownership token** (`_zenia-verify.<domain>`), recorded with every check. Validation before anything touches DNS: FQDN format, no IPs, reserved suffixes (zeniahr.com, localhost, test…), built-in + SA-configurable blacklist (gmail.com, google.com, …), duplicate protection that never reveals which company holds a taken domain.

### SSL — pluggable provisioner (`sslService.js`), customer never touches certificates
| Provider (`CUSTOM_DOMAIN_SSL_PROVIDER`) | Behaviour |
|---|---|
| `certbot` | Production: shells out to certbot (`--nginx`, non-interactive) for a real **Let's Encrypt** cert |
| `manual` (default) | Platform operator provisions (wildcard/ALB cert or SA marks issued) |
| `mock` | Local QA only: instant issue, 90-day expiry |

`renewExpiringSsl()` (SA button "Run SSL Renewal Sweep"; cron-ready) re-provisions certs expiring within 21 days; a failure flags `RENEWAL_FAILED` and notifies the Company Head + Super Admins. **Honest scope note:** real certificate issuance is EC2/nginx work — locally the machine runs on `mock`; the abstraction, state machine, renewal sweep and alerts are fully built and tested.

### Host routing (no existing route touched)
- `middleware/customDomainHost.js` runs on **every** request: resolves `X-Forwarded-Host`/`Host` against the table (**60s TTL cache**, invalidated on any mapping change). Only **ACTIVE** mappings whose company passes the platform's standard subscription-active rule route traffic; every other host behaves exactly as before.
- `authMiddleware` then enforces isolation: a request on a mapped tenant host from a user of **another** company → **403** (Super Admin exempt). Host header → mapped company → active subscription → SSL-issued ACTIVE status: all four verified per the security spec.
- `GET /api/public/host-branding` (unauthenticated) powers the login page: company name + white-label branding for the host, shown from DNS_VERIFIED onward (preview while SSL finishes) while routing stays ACTIVE-only. Unknown hosts → `{branding: null}` → stock ZeniaHR login.
- `appBaseUrlFor(companyId)` → `https://<active domain>` else the default app URL — the email-link resolver (tested; adopting it inside individual mail templates is an incremental follow-up).

### Plan gating (Feature Matrix)
New **premium module key `custom-domain`** in the plan store's module catalog + page mapping — the same machinery every premium module uses: backend routes gated by `requirePlanModule('custom-domain')` (403 `PLAN_UPGRADE_REQUIRED`), frontend locked via `lockedModules`/`lockedPages` from the auth profile. **Free: locked · Starter: locked (SA can enable it in the plan editor — the toggle appears there automatically) · Professional/Enterprise/Custom-template: enabled** (via `scripts/enableCustomDomainModule.js`, run locally). Clicking the locked sidebar item shows the **Upgrade Required** dialog whose Upgrade Plan button opens the **Subscription Purchase Wizard** built in the previous round.

## 2. What the user sees

**Sidebar (Company Head + HR):** `🧪 Custom Domain (Beta)` — rides the Settings permission (Custom-Report-Builder pattern; no RBAC matrix change), plan-locked by page id.

**Company page** ([pages/CustomDomain.tsx](enterprise-hrms-crm-application - Copy(d1)/frontend/src/pages/CustomDomain.tsx)): Beta notice with the required copy; explainer; domain input (Company Head only — HR gets an explicit read-only note, enforced server-side too); copy-paste DNS table (CNAME + optional A + TXT) with Copy buttons; **Verify** / **Refresh Status** buttons; a status rail (Pending DNS → DNS Verified → SSL Pending → SSL Issued → Active) with last-checked / SSL-renewal timestamps and the live URL when active; Remove Domain (confirm dialog); and the **White Label** panel — logo, favicon, primary/secondary colors, login background, support email/phone, footer text, hide-ZeniaHR toggle.

**Login page on a mapped domain:** fetches `/api/public/host-branding` pre-login; when white label is enabled the company's logo replaces the ZeniaLogo (desktop + mobile), the company name replaces the ZeniaHR wordmark, primary/secondary colors re-theme the wordmark, focus accents and all four primary buttons, the login background swaps, and a support/footer line appears. Unbranded hosts render pixel-identical to today.

**Super Admin → Subscription Management → White Label (new tab):** every mapping with Company, Domain, Status, SSL, Verified, Last Checked, SSL Renewal — actions **Force Reverify · Disable/Enable · Delete** + the SSL renewal sweep.

**Audit + notifications:** AuditLog module `CustomDomain` records DOMAIN_ADDED / DOMAIN_DNS_VERIFIED / DOMAIN_SSL_ISSUED / DOMAIN_SSL_RENEWED / DOMAIN_REMOVED / DOMAIN_VERIFY_FAILED / DOMAIN_DISABLED / WHITE_LABEL_UPDATED; Company Heads are notified on DNS verified, SSL ready, domain activated, and SSL renewal failure.

## 3. QA — new 39-check suite, all passing

`scripts/verifyCustomDomain.js` (scratch tenants, injected DNS resolver, mock SSL — zero network): plan gating per plan; the full validation matrix (garbage/IP/reserved/blacklist/normalisation); add + one-domain-per-company + cross-company duplicate (no owner leak); failed DNS check (fail counter + explanatory error); success path DNS_VERIFIED → SSL ISSUED → ACTIVE with 90-day expiry; host routing incl. case/port normalisation, unknown-host null, cache invalidation; expired subscription kills routing / renewal restores it; white-label branding on/off + unmapped-host null; email base-URL resolution; SA disable (routing stops instantly, company verify blocked), enable, reverify, fleet list; SSL auto-renewal + RENEWAL_FAILED alerting; removal + tenant isolation.

Regressions: subscription purchase **44/44** (one assertion updated: Starter now deliberately locks `custom-domain`), slots **63/63**, free-plan **ALL PASS**, payment spine **32/32**, `tsc` 0 errors, production build ✓. Backend restarted: health 200, `/api/custom-domain/*` auth-gated (401), public branding endpoint live.

## 4. Files

**Backend new:** `services/customDomain/domainService.js`, `services/customDomain/sslService.js`, `middleware/customDomainHost.js`, `controllers/customDomainController.js`, `routes/customDomainRoutes.js`, `routes/superAdminWhiteLabelRoutes.js`, `scripts/addDomainMappingTables.js`, `scripts/enableCustomDomainModule.js`, `scripts/verifyCustomDomain.js`.
**Backend modified:** `prisma/schema.prisma` (+2 models, additive), `services/planStore.js` (module catalog + page map), `middleware/authMiddleware.js` (host-isolation guard), `server.js` (host middleware + 3 mounts).
**Frontend new:** `pages/CustomDomain.tsx`, `components/subscription/WhiteLabelTab.tsx`.
**Frontend modified:** `config/moduleRegistry.tsx` (+PageId+entry), `config/planEntitlements.ts` (mirror), `App.tsx` (title/route/perm-map/case), `pages/SubscriptionManagement.tsx` (7th tab), `pages/Login.tsx` (host branding), `api/apiClient.ts` (`api.customDomain`).

**Database:** 2 new tables via the additive idempotent script (never `db push`), applied locally. **Env:** optional `CUSTOM_DOMAIN_SSL_PROVIDER` (defaults `manual`), `APP_PUBLIC_URL`, `LETSENCRYPT_EMAIL` — none required locally.

## 5. Known limits (Beta — please review)
1. **Real SSL + edge routing are infrastructure**: production needs the DNS target record (`tenant.zeniahr.com` → EC2), an nginx catch-all `server_name` forwarding `Host`/`X-Forwarded-Host`, and certbot (or a wildcard cert with the `manual` provider). The application layer is complete and tested; the report's deploy checklist covers the infra.
2. **Email links**: `appBaseUrlFor()` is built/tested; existing mail templates adopt it incrementally (most current templates don't embed app links).
3. Login/logout/session on a real custom host needs a browser click-through after the infra exists locally only service/middleware-level tests were possible; the host-mismatch 403 guard is implemented in authMiddleware.
4. Favicon swap on the logged-in app shell (not just login) is a Beta follow-up — consistent with the required Beta notice.

## 6. Deployment checklist (NOT executed — awaiting approval)
1. `node scripts/addDomainMappingTables.js` → `npx prisma generate` → restart (never `db push`).
2. `node scripts/enableCustomDomainModule.js` (enables Professional/Enterprise/Custom).
3. Frontend build + deploy.
4. Infra: create `tenant.zeniahr.com` DNS record → app server; nginx catch-all vhost forwarding Host; set `CUSTOM_DOMAIN_SSL_PROVIDER=certbot` + `LETSENCRYPT_EMAIL`; optionally set `customDomainARecord` in plan settings.
5. Smoke: `node scripts/verifyCustomDomain.js` (self-cleaning), then a real domain end-to-end.

---
**STOP:** awaiting your explicit approval before any commit, push, merge, or deployment.
