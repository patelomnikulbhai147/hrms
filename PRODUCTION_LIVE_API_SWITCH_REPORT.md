# Deployment Report — Switching Bank Verification & Slot Payments to LIVE APIs

**Date:** 2026-07-29 · **Status:** Code audited and hardened locally; **nothing committed, pushed, or deployed.** The actual live flip is a documented one-line environment change on the production server (§8) — deliberately NOT applied to the local dev environment, where a live gateway would turn developer test payments into real money.

---

## 1 · Audit result (Step 1)

Every sandbox/test reference was located. The key finding: **the platform was already architected for a config-only live switch** — no code held credentials, no frontend file holds any gateway URL or key, and every sandbox URL lives only in an environment-driven branch.

| Area | File | Mode selection |
|---|---|---|
| Payment gateway client (ONLY file that talks HTTP to Cashfree PG) | `backend/src/services/payments/cashfreePgClient.js` | `CASHFREE_PG_ENV=production` → `https://api.cashfree.com/pg` + `CASHFREE_PG_PROD_CLIENT_ID/SECRET`; anything else → sandbox URL + sandbox keypair |
| Bank verification provider | `backend/src/services/bankVerification/CashfreeProvider.js` | `environment === 'Production'` → `https://api.cashfree.com/verification` + `CASHFREE_PROD_CLIENT_ID/SECRET` |
| Bank verification environment resolution | `backend/src/services/bankVerificationService.js` `globalProviderConfig()` | Explicit `BANK_VERIFICATION_ENVIRONMENT` wins; otherwise **auto-Production when `CASHFREE_PROD_CLIENT_ID` is set** |
| Checkout mode → frontend SDK | `paymentOrderService` / `rechargeSettingsService` → `checkoutMode: cashfreePg.envMode()` | The Cashfree JS SDK (`load({ mode })`) follows the server's mode automatically — slots, recharges and subscription purchases all inherit it |
| Frontend | — | Zero URLs, zero keys. Receives only `paymentSessionId` (designed-public) + `checkoutMode` |

**Removed in this round (dead/simulated code — "no mock remains"):** `src/services/bankVerification/SandboxProvider.js` and `CashfreeSandboxProvider.js` (Phase-1 always-succeed simulators; unreachable — the provider factory never instantiated them) and the legacy `scripts/phase1_test.js` that referenced them.

## 2 · Files modified

1. `backend/src/services/verificationCreditService.js` — two hardcoded defaults (`provider: 'Cashfree Sandbox API'`, `environment: 'Sandbox'`) now resolve from `globalProviderConfig()` so a fresh company row created while the platform runs Production is labeled/routed Production.
2. `backend/server.js` — **boot-time mode visibility** (names only, never secret values): logs `Cashfree PG mode: SANDBOX/PRODUCTION · credentials configured/missing` and `bank-verification environment: …` on every start; loud warnings when `CASHFREE_PG_ENV=production` lacks its keypair, or `NODE_ENV=production` while either module is still in sandbox mode.
3. Deleted: the three dead sandbox-simulation files listed above.

Nothing else needed changing — base URLs, credential pairing, signature verification, retries, timeouts, GST, settlement and invoices were already environment-driven and production-grade.

## 3 · Sandbox → Live URLs

No URL replacement was needed in code. On the production flip these resolve automatically:
- PG: `https://sandbox.cashfree.com/pg` → **`https://api.cashfree.com/pg`**
- Verification: `https://sandbox.cashfree.com/verification` → **`https://api.cashfree.com/verification`** (already active — see §7)
- Optional overrides exist (`CASHFREE_PG_BASE_URL`, `BANK_VERIFICATION_API_BASE_URL`) and are unset, as they should be.

## 4 · Environment variables (all secrets env-only; none hardcoded anywhere)

| Variable | Purpose | Status |
|---|---|---|
| `CASHFREE_PG_ENV` | `production` \| `sandbox` — THE live switch for all payments (slots, credit recharges, subscription purchases) | `sandbox` locally (correct); **set `production` on the server** |
| `CASHFREE_PG_PROD_CLIENT_ID` / `CASHFREE_PG_PROD_CLIENT_SECRET` | Live PG keypair | **Values already present** in backend/.env |
| `CASHFREE_PG_SANDBOX_CLIENT_ID` / `..._SECRET` | Sandbox keypair (kept for non-prod environments) | Present |
| `CASHFREE_PROD_CLIENT_ID` / `CASHFREE_PROD_CLIENT_SECRET` | Live Bank-Verification (Secure ID) keypair — a SEPARATE Cashfree product from PG | **Present → bank verification already resolves to Production** |
| `BANK_VERIFICATION_ENVIRONMENT` / `_PROVIDER` / `_API_BASE_URL` | Optional explicit overrides | Unset (auto-resolution active) |

Per-company BYO bank-verification credentials remain AES-encrypted in `company_bank_verification_settings` and are never returned to any client (masked display only).

## 5 · Webhook configuration (Step 4)

Endpoint: **`POST https://<production-domain>/api/payments/webhooks/cashfree`** — mounted BEFORE the JSON body parser (raw bytes for HMAC), unauthenticated by design, and already:
- verifies `x-webhook-signature` with a **timing-safe** HMAC-SHA256 over `timestamp + rawBody` using the active mode's client secret (live secret once flipped);
- **rejects invalid signatures with 401** — stored for forensics, never processed;
- **dedupes** every delivery via a unique event key in `payment_webhook_events` (full redacted payload logged per delivery, with processed/result columns);
- is double-protected against duplicate credits: settlement itself is idempotent (conditional `updateMany` gate), so even two distinct deliveries for the same payment cannot credit twice;
- returns 500 on processing failure so Cashfree retries.

## 6 · Security review (Steps 5, 7, 13)

✓ All gateway/verification calls originate from the backend; the frontend receives only public artifacts. ✓ No secret appears in code, logs, or API responses (configStatus reports variable NAMES only; webhook/audit payloads pass through `redactPayload`; internal cost fields never reach tenants). ✓ Raw provider errors are normalized to user-facing messages (`FAILED` / `NETWORK_ERROR` / friendly copy); PG has a 15s timeout with one retry on idempotent reads only, verification a 10s timeout — order creation is never blind-retried (unique merchant order id makes replays safe regardless).

## 7 · Test results (Step 8–11 — what can be verified without live money)

- Recharge payment spine **32/32** · Employee slots (incl. settlement → limit update → ESP invoice → audit, idempotent re-settle, no-minimum) **66/66** · Wallet gate **51/51**.
- Boot visibility verified live on restart: `[payments] Cashfree PG mode: SANDBOX · credentials configured` + `[bank-verification] provider: Cashfree · environment: PRODUCTION`.
- Payment-state handling (success / pending / failed / cancelled / refunded / timeout / duplicate / webhook retry) is covered by the suites against the stubbed gateway; slots are only ever credited by `verifyAndSettle` after the gateway confirms payment.
- **Honest limitation:** real LIVE transactions (Step 10/11 end-to-end) cannot be exercised from this machine without spending real money against the live merchant account — they are the post-deploy checklist below.

## 8 · Manual production steps (the actual go-live)

1. On the production server's `backend/.env`: set **`CASHFREE_PG_ENV=production`** (PG prod keypair is already present; confirm the same on EC2) and restart the backend. Watch the boot log print `Cashfree PG mode: PRODUCTION · credentials configured`.
2. Bank verification: confirm `CASHFREE_PROD_CLIENT_ID/SECRET` exist on the server (boot log must print `environment: PRODUCTION`).
3. In the **Cashfree PG merchant dashboard (production)**: add the webhook URL `https://<domain>/api/payments/webhooks/cashfree` for payment + refund events (API version 2023-08-01).
4. Post-deploy smoke test with real money: one ₹-small slot purchase end-to-end (order → checkout → webhook → settle → limit raised → ESP invoice → audit row), then a dashboard-initiated refund to watch the refund webhook record. One live bank verification against a known account (valid + an intentionally wrong IFSC for the failure path).
5. Keep `CASHFREE_PG_ENV` unset/`sandbox` in every non-production environment.
