# Implementation Report — Enterprise Subscription Upgrade & Renewal Flow

**Date:** 2026-07-29 · **Status:** Built and verified locally. **Nothing committed, pushed, merged, or deployed. Production untouched.** Awaiting approval.

---

## 1. What was built

A complete self-service purchase and subscription-management flow — not a redirect, not a pricing popup. A new **Subscription Purchase Wizard** rides the existing Cashfree payment spine as a third settlement purpose (`SUBSCRIPTION_PURCHASE`), so orders, webhooks, idempotent settlement, invoices, refund records and audit all reuse infrastructure that is already stress-tested.

### Entry points (all wired to the wizard)
Every "Upgrade Plan" button in the product now opens the wizard via a global `hrms:upgrade-plan` event:
- **Locked sidebar module** → Upgrade Required dialog → *Upgrade Plan*
- **Locked page by direct URL** → Premium Required screen → *Upgrade Plan*
- **Employee-limit dialog** → *Upgrade Plan*
- **Plans page** → *Upgrade Now* (previously an informational alert; now the real flow)

The wizard is mounted globally in App (same pattern as the Employee Slots dialog).

### The wizard (5 screens + success)
1. **Current Subscription** — plan, billing cycle, renewal date, status, employee limit, employees used, extra slots, verification credits, and the list of currently unlocked premium modules.
2. **Plan Selection** — every Active, non-Custom plan from the Super-Admin plan store as cards: quarterly/yearly per-employee pricing with yearly-savings %, employee limit, included verification credits, module count, storage, API limits, support level, plus **Current Plan / Most Popular / Upgrade** badges. (Which plan is "Most Popular" is a setting — `popularPlan`, default Professional.)
3. **Billing Cycle** — Quarterly vs Yearly side by side with the per-employee rate and "Save N%" computed from the plan's own prices.
4. **Employee Count** — auto-detects **Current Active Users** (employees + CH/HR profiles + the unlinked-user safety net) as the hard minimum; the user cannot purchase fewer seats than are in use. Quick presets (100/125/150/200/250/500) plus free input; exceeding the plan's capacity points the user to a higher plan.
5. **Summary & Pay** — a live server quote: selected plan, cycle, change type (New/Upgrade/Renewal/Cycle Change), new employee limit, extra slots, included credits, renewal date, then Subtotal → Discount → **CGST+SGST or IGST** → Grand Total, and the *Pay Securely* button (Cashfree modal checkout → verify → settle).
6. **Success** — new plan, new limit, renewal date, credits granted, "all features unlocked immediately — no logout required."

### Server-side pricing (SECURITY)
The client only ever sends `{ planKey, billingCycle, employeeCount }`. Everything else is computed server-side and **frozen on the payment order**:
- **Rate** from the plan store (`priceQuarterly` / `priceYearly` per plan — SA-editable),
- **Discount** from the company's own `CompanySubscription.discountPercent` (SA-set),
- **GST** from billing settings; **CGST+SGST vs IGST** decided by the company's billing state vs the platform's registered GST state — the same `gstTypeFor` rule the invoice renderer uses, so quote === invoice,
- **Employee floor** from live capacity (`minEmployees = current active users`) and **plan capacity ceiling** from the plan's `employeeMax`.
Settlement reads only the frozen order row (`notes` metadata: planKey/cycle/seats), never the request.

### Settlement (atomic, idempotent)
On a Cashfree-verified payment, inside the spine's settlement transaction (`applySubscriptionInTx`):
1. `CompanySubscription` → plan, billingCycle, status **Active**, **renewalDate** (a renewal with time remaining **extends** from the current renewal date; upgrades/cycle changes start a fresh period), seat-derived `extraEmployeeSlots`.
2. **Company mirror** → `plan`, `paymentStatus: 'Paid'`, `billingCycle` — this is what the module gates, capacity engine, and slot pricing read live, so **every premium module unlocks the moment the transaction commits.** No manual activation anywhere.
3. **Employee limit** updated (plan base; seats above base become extra slots); the change is recorded in the append-only `employee_slot_transactions` trail (`SUBSCRIPTION_CHANGE`, old → new limit).
4. **Included verification credits** granted to the wallet through the existing credit-purchase ledger (idempotent with the settlement gate — a duplicate webhook cannot double-grant).
After commit (failure-tolerant, never rolls back the plan): **SUB-YYYY-NNNN invoice** (PDF, GST split), `subscriptionHistory` row (same table the SA plan editor writes), AuditLog entry, notifications to the purchaser + Super Admins, receipt email with the invoice attached.

### No-logout refresh
The frontend keeps entitlements in the auth profile and already re-fetches `/auth/me` on window focus / every 2 min. The wizard's success path dispatches `hrms:plan-updated` (now also a trigger for that same refresh) plus `hrms:slots-updated` / `hrms:wallet-updated` — sidebar locks, dashboard cards, and the employee-limit gate all update in place. JWTs carry no plan claims, so no session change is needed.

### Downgrade protection
- Seats below **current active users** → refused server-side (`BELOW_CURRENT_USAGE`) with the exact count.
- Seats above the target plan's capacity → refused (`EXCEEDS_PLAN_CAPACITY`).
- Free plan / unknown plans / Custom plan → not purchasable online (Custom stays a managed, SA-configured plan).
- Storage / feature-usage floors: no storage metering exists in the platform today, so these cannot be enforced yet — documented as a follow-up (see §6).

### Unified history & invoices
- `GET /api/subscription-purchase/history` returns **every** self-service payment for the tenant — subscription, employee slots, verification credits, future add-ons — each with its invoice pointer (SUB-/ESP-/VCR- numbering on the shared invoice table + the existing ownership-checked download endpoint).
- Super Admin: subscription orders appear on the shared payment-orders spine, upgrade history lands in the per-company Subscription Management history (same `subscriptionHistory` table), and plans/pricing/feature matrix/discounts/GST settings were already SA-editable.

## 2. QA results (all local)

| Suite | Result |
|---|---|
| **`verifySubscriptionPurchase.js` (new, 44 checks)** — wizard context; Free/unknown/Custom refused; below-usage and above-capacity guards; ₹2500+₹450 GST=₹2950 pricing; 10% discount math; state-rule GST split; failed payment changes nothing; settlement flips plan+mirror+limit+renewal; module unlock; +100 included credits (from plan config); SUB- invoice matches order; duplicate settlement no-op; renewal extends (+3mo on top); upgrade resets period + audit row 100→1000; Quarterly→Yearly (+12mo, slot pricing follows); tenant isolation; unified spine | ✅ 44/44 |
| `verifyEmployeeSlotSystem.js` (regression) | ✅ 63/63 |
| `verifyFreePlanLimit.js` (regression) | ✅ ALL PASS |
| `testRechargePayments.js` (payment spine regression — webhook signatures, concurrency, refunds) | ✅ 32/32 |
| `tsc --noEmit` 0 errors · `vite build` ✓ (18.0s) | ✅ |
| Backend restarted; health 200; new route auth-gated (401 unauthenticated) | ✅ |

Webhook/duplicate/refund behaviour is purpose-agnostic in the spine (dispatch by handler) and remains covered by the 32-check payment suite; the subscription suite adds the purpose-specific duplicate-settlement and failed-payment checks.

## 3. Files changed

**Backend new:** `services/subscriptionPurchaseService.js` (context/quote/order/settlement engine), `services/payments/settlements/subscriptionPurchase.js` (settlement handler), `controllers/subscriptionPurchaseController.js`, `routes/subscriptionPurchaseRoutes.js`, `scripts/verifySubscriptionPurchase.js`.
**Backend modified:** `services/payments/paymentOrderService.js` (+`PURPOSE_SUBSCRIPTION`, +`notes` metadata on the generic order creator), `services/payments/rechargeInvoiceService.js` (+SUB- invoice presentation), `services/planStore.js` (+`includedVerificationCredits` per plan, seeded on fresh installs), `server.js` (route mount).
**Frontend new:** `components/subscription/SubscriptionPurchaseWizard.tsx`.
**Frontend modified:** `api/apiClient.ts` (+`api.subscriptionPurchase`), `App.tsx` (global wizard mount, `hrms:upgrade-plan` listener, `hrms:plan-updated` → instant entitlement refresh, entry-point rewires), `components/layout/Sidebar.tsx` + `pages/PlansView.tsx` (+`EmployeeLimitDialog` wiring in App) — all Upgrade buttons open the wizard, `components/subscription/EmployeeSlotsModal.tsx` (label for the new `SUBSCRIPTION_CHANGE` history rows).

## 4. Database & environment
**No schema changes and no new environment variables.** The feature reuses the existing `payment_orders` spine (the previously-unused `notes` column now carries frozen settlement metadata), the shared invoice table, `CompanySubscription`, `subscription_history`, and `employee_slot_transactions`.

## 5. Security summary
Tenant identity from the authenticated session only (`resolveWalletCompany`, branch → head). Plan, price, discount, GST, cycle and limits are never accepted from the client. Amounts frozen at order creation; settlement recomputes nothing from the request. Purchase is Company Head only; Employee-role users cannot even view. Only a Cashfree-verified, idempotently-settled payment (or a Super Admin through the existing tools) can change a subscription. Every change audited (AuditLog + subscriptionHistory + slot-transaction trail).

## 6. Decisions & known follow-ups (please review)
1. **Included verification credits default to 0 on this install.** The live plan store predates the new field; fresh installs seed 100/250/500 for Starter/Professional/Enterprise. Setting them here is a one-line plan-store edit per plan — say the word and I'll add the field to the Super-Admin plan editor UI too (grant path is fully tested).
2. **Coupons** are not built; per-company **discounts** (SA-set `discountPercent`) are honoured end-to-end. A coupon-code engine would be a follow-on.
3. **Add-on verification credit purchase inside the wizard** was left out deliberately — the existing recharge dialog already does exactly that; the wizard shows included credits.
4. **A dedicated company "Subscription & Billing" page** was not added as a new sidebar module: the wizard (current plan/upgrade/renew), slots dialog, recharge dialog and their histories cover the listed content, and the new unified history endpoint is ready to power such a page next.
5. **Storage / feature-usage downgrade floors** can't be enforced yet (no storage metering); the employee floor is hard-enforced.
6. Buying seats **below the plan's base limit** still grants the plan's full base limit (the plan is a floor — e.g. 86 seats on Starter yields limit 100); billing is per selected seat count.
7. **Renewal grants included credits again by design** (each paid period brings its credits).

## 7. Deployment checklist (NOT executed — awaiting approval)
1. No DDL needed. Deploy backend (standard additive deploy — never `db push`), restart.
2. Deploy frontend build.
3. Optionally set `includedVerificationCredits` on the live plan definitions and review plan prices in the Super-Admin plan editor.
4. Run `verifySubscriptionPurchase.js` as a post-deploy smoke check (self-cleaning, stubbed gateway).
5. Sandbox → production gateway switch stays config-only (existing `CASHFREE_PG_ENV`).

---
**STOP:** awaiting your explicit approval before any commit, push, merge, or deployment.
