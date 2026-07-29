# Billing Cycle at Onboarding → Inherited by Employee Slot Purchases

**Status:** Implemented and verified locally. Not committed, not pushed, not deployed.
**Date:** 2026-07-29
**Schema change:** none — both columns already existed.

---

## 1. What was already true, and what was actually missing

The employee-slot module already inherited the billing cycle correctly. Requirements 1–4 of the
brief were largely satisfied before this work: the slot dialog had no cycle selector, the quote was
computed server-side from `CompanySubscription.billingCycle`, and it was read live so a subscription
change flowed through.

The real gap was at the **other end of the chain — onboarding never asked for the cycle.**
Every company-creation path hardcoded `billingCycle: 'Quarterly'`:

| Path | Before |
|---|---|
| Public self-registration → `companyProvisioning.js:109` | hardcoded `'Quarterly'` |
| Super Admin "Add Company" → `companyController.js:486` | hardcoded `'Quarterly'` |
| Lazy get-or-create → `subscriptionController.js:31` | hardcoded `'Quarterly'` |
| Slot settlement lazy create → `employeeSlotService.js:241` | schema default `'Quarterly'` |

So "inherit the cycle from the subscription" was working perfectly — inheriting a value nobody had
ever been allowed to choose. A tenant who wanted yearly billing had no way to express it, and the
Super Admin form additionally wrote `Company.billingCycle = 'Monthly'`, which is not a valid cycle
in this system at all.

---

## 2. Design decision: one authority, one vocabulary

**`CompanySubscription.billingCycle` is the source of truth.** `Company.billingCycle` is a legacy
column that predates it (exports and older screens read it) and is now maintained strictly as a
**mirror** — written from the subscription, never the reverse.

New file **`backend/src/utils/billingCycle.js`** is the single vocabulary:

```js
BILLING_CYCLES        = ['Quarterly', 'Yearly']
DEFAULT_BILLING_CYCLE = 'Quarterly'
isBillingCycle(v)                  // exact match only
normalizeBillingCycle(v, fallback) // coerce anything to a storable cycle
```

`normalizeBillingCycle` accepts the canonical values plus the synonyms a form or import can produce
(`yearly`, `annual`, `ANNUALLY`, `quarter`). Everything else — blank, `null`, a number, an object,
and the legacy `'Monthly'` — resolves to the fallback. A **bad fallback cannot leak either**: it is
itself validated. This is what guarantees no junk value ever reaches the record that prices
purchases.

---

## 3. Changes

### Backend

| File | Change |
|---|---|
| `src/utils/billingCycle.js` | **NEW.** The vocabulary + normalizer described above. |
| `src/services/companyProvisioning.js` | `provisionFreeCompany` accepts `billingCycle`, normalizes it, writes it to both the Company mirror and the subscription. |
| `src/controllers/registrationController.js` | Validates the cycle at `/start`, embeds it in the **signed** verification token, passes it to provisioning at `/verify`. Response echoes it. |
| `src/controllers/companyController.js` | `createCompany` normalizes the submitted cycle and uses it for both rows. `updateCompany` now **refuses** to change the cycle. |
| `src/controllers/subscriptionController.js` | `getOrCreateSubscription` seeds the cycle **from the Company row** instead of hardcoding. Cycle changes now mirror onto the Company row. `VALID_CYCLES` sources from the shared list. |
| `src/services/employeeSlotService.js` | Quote context falls back subscription → company mirror → default, all normalized. The lazy subscription create inside the settlement transaction seeds from the company. |
| `src/services/employeeLimitService.js` | `resolveHead` also selects `billingCycle` so callers can seed from it. |

Two `.catch()`-guarded subscription inserts were changed from fire-and-forget to **awaited**. My
verification caught the race: `createCompany` responded before the insert landed, so an immediate
read found no subscription row. Still `.catch()`-guarded, so a failure there still never fails
company creation — only the race is gone.

### Frontend

| File | Change |
|---|---|
| `pages/CompanyRegistration.tsx` | New "Plan & Billing" block on step 4: plan shown read-only (`Free`), **Quarterly / Yearly** selector, and a line explaining that later slot purchases use the same cycle. Sent to `/start`. Success screen shows the chosen cycle. Still 4 steps. |
| `pages/Companies.tsx` | "Billing Cycle" select beside "Pricing Plan" in Add Company. **Removed the hardcoded `billingCycle: 'Monthly'`.** |
| `components/subscription/EmployeeSlotsModal.tsx` | The inherited cycle is now shown **from the moment the dialog opens**, not only after a quote is calculated: a read-only row reading `Billing Cycle / Quarterly (Inherited)` with a lock icon and "From your <plan> subscription". |

**No cycle selector was added to the slot purchase dialog**, and none was removed from Subscription
Management (which is where a cycle change belongs).

### Rule-by-rule

1. **No Quarterly/Yearly selector in the slot dialog** — none exists; verified statically (no slot
   handler reads a cycle off the request) and over HTTP.
2. **Read from the active subscription** — `buildQuoteContext` loads `CompanySubscription`.
3. **Displayed read-only as `Quarterly (Inherited)`** — now visible on open, not just on quote.
4. **A subscription change applies to future purchases** — read live; proven both directions.
5. **Never trust the frontend** — an injected `billingCycle` in the request body changes nothing.
6. **Payment / pricing / GST / settlement untouched** — no change to the tier table, the GST split,
   the ₹500 minimum, the multiples-of-5 rule, or any settlement handler.

---

## 4. Verification

New suite **`backend/scripts/verifyBillingCycleInheritance.js`** — self-cleaning scratch tenants,
no real tenant touched.

```
§1 Cycle vocabulary                              13/13
§2 Onboarding writes the cycle                    7/7
§3 Slot purchase inherits it                     11/11
§4 The cycle is never a client input              4/4
§5 A cycle change flows through automatically     7/7
§6 A lost subscription row keeps the cycle        2/2
§7 Not editable via the company profile           3/3
§8 Pricing / GST / rules unchanged                4/4
                                          51 passed, 0 failed
```

The decisive check: **the same 25-slot purchase prices differently purely because of the inherited
cycle** — ₹16/slot → ₹472 yearly vs ₹20/slot → ₹590 quarterly, with no client input differing.
Flipping the subscription then re-quoting moves the price with it, both directions.

**Live HTTP e2e** against the running server (register → auto-login → real slot endpoints):
**15 passed, 0 failed** — including an injected `billingCycle` + `tier.rate` in the request body
being ignored on both `/quote` and `/orders`.

**Regressions, all green:**

| Suite | Result |
|---|---|
| `verifyEmployeeSlotSystem.js` | 63 passed, 0 failed |
| `verifyFreePlanLimit.js` | ALL PASS |
| `verifyOnboardingPhase1.js` | ALL PASS |
| `verifyRegistrationStepGate.js` | 11 passed, 0 failed |
| `verifySubscriptionInvoiceTemplate.js` | ALL PASS |
| `tsc --noEmit` | exit 0 |
| `vite build` | ✓ 18.45s |

**No live tenant's pricing moved** — all six companies quoted Quarterly before and after.

---

## 5. Data backfill (run locally, needs re-running on deploy)

**`backend/scripts/backfillCompanyBillingCycleMirror.js`** — dry-run by default, `--apply` to write,
idempotent.

Pre-existing tenants had a `null` mirror (and company 11 held the legacy `'Monthly'`). Their
subscriptions were all valid, so nobody was mispriced — but the reseed path would have guessed.
Applied locally: **4 mirrors aligned**, re-run reports "already agrees".

It only ever copies **subscription → company**. It never writes a subscription, so it **cannot
change what any tenant is charged.**

Two companies (9, 13) have no subscription row at all. Left untouched deliberately — those are
created lazily on first read, now seeded from the company row rather than a hardcoded default.

---

## 6. Notes and residual risk

- **`updateCompany` now rejects a cycle change** with `400 BILLING_CYCLE_READONLY`. No current UI
  sends one, so nothing breaks today; a payload that includes an unchanged `billingCycle` alongside
  other fields still succeeds (the key is dropped, the rest is written). This is deliberate: a second
  unaudited write path is exactly how the mirror would drift from the value purchases inherit.
- **Free plan and the cycle.** Free is ₹0 on either cycle, so the choice looks cosmetic at signup —
  but it is not: it selects the rate a later slot purchase pays (₹25/slot quarterly vs ₹20 yearly at
  the entry tier). That is why the selector is on the free registration wizard too.
- **Deploy:** no SQL, no `prisma db push`, no `prisma generate` — no schema change. Deploy is code
  only, plus running the backfill script once.

---

## 7. Files touched

**New (3)**
```
backend/src/utils/billingCycle.js
backend/scripts/verifyBillingCycleInheritance.js
backend/scripts/backfillCompanyBillingCycleMirror.js
```

**Modified (9)**
```
backend/src/services/companyProvisioning.js
backend/src/services/employeeSlotService.js
backend/src/services/employeeLimitService.js
backend/src/controllers/registrationController.js
backend/src/controllers/companyController.js
backend/src/controllers/subscriptionController.js
frontend/src/pages/CompanyRegistration.tsx
frontend/src/pages/Companies.tsx
frontend/src/components/subscription/EmployeeSlotsModal.tsx
```
