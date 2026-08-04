# Implementation Report — Enterprise Subscription & Employee Slot Management

**Date:** 2026-07-29 · **Status:** Built and verified locally. **Nothing committed, pushed, merged, or deployed. Production untouched.** Awaiting approval.

---

# FIX 6 (same day): ₹500 Minimum REMOVED from Slot Purchases + Simplified Dialog

## 1 · No minimum payment amount for employee slots
The ₹-minimum rule belongs ONLY to the Verification Credit Recharge module (`rechargeSettingsService.minRechargeAmount` — untouched and re-verified). Every trace of it was removed from the Employee Slot module:
- `employeeSlotService.js`: `MIN_ONLINE_AMOUNT` / `minOnlineAmount()` deleted; quotes no longer compute or return `onlineEligible` / `minOnlineAmount` / `shortfall` / `slotsToMinimum`; the 422 `BELOW_MINIMUM` backstop in `createSlotOrder` is gone — **5 slots × current rate goes straight to the gateway**.
- `employeeSlotController.js`: `BELOW_MINIMUM` response branch removed.
- `planStore.js`: `minOnlineSlotAmount` dropped from DEFAULT_SETTINGS (stored value, if any, is simply ignored).
- Super-Admin UIs: the "Minimum Online Purchase (₹)" fields removed from BOTH pricing editors (`SettingsTab.tsx` and `EmployeeSlotAdminTab.tsx`), replaced with "no minimum — 5-slot floor, multiples of 5".
- The dialog's "Minimum Online Purchase" warning panel + progress bar are gone.

**Unchanged:** slot floor (min 5, multiples of 5 — server-enforced), tiered pricing, GST split, subscription/cycle inheritance, payment gateway, settlement, ESP invoices.

## 2 · Simplified purchase dialog (`EmployeeSlotsModal.tsx`)
The repeated plan/cycle/usage blocks collapsed into exactly the requested layout: one **overview strip** (Current Plan · Billing Cycle 🔒inherited · Employee Limit · Active Employees · Available Slots), the **quick buttons + custom multiple-of-5 input**, and ONE **Pricing Summary** (Selected Slots · Rate per Slot with tier/cycle context · Subtotal · CGST+SGST or IGST · Grand Total · New Employee Limit) above the Pay button. Removed: the tall usage-meter card, the standalone billing-cycle card, and the duplicated 4-cell "subscription facts" block inside the quote. Expired-subscription gate, limit-full warning, non-Company-Head notice, success view and the View Slot History link all kept.

## QA
`verifyEmployeeSlotSystem.js` → **66/66** with the rewritten §4: 5-slot quote payable **below ₹500**; quotes for 10 / 25 / 105 slots OK; a real 5-slot ORDER accepted through the (stubbed) gateway path with no backstop; quote payload contains **no** minimum-amount fields; 12 slots still rejected (multiples of 5); **verification recharge still refuses below its own ₹500 minimum**. Regressions: subscription purchase 44/44, recharge payments 32/32, `tsc` 0, build ✓, backend restarted healthy. Settlement/invoice/limit behavior is covered by the untouched §3 (ESP invoice numbering, GST split, limit 100→125, idempotent re-settle).

---

# ENHANCEMENT 5 (same day): Slot History Page UI Redesign (UI only — no backend/API/logic change)

## What changed
- **Summary cards** rebuilt as compact single-row stats (icon beside a highlighted value + one-line subtitle, fixed 72px min height): ~60% shorter than before, equal heights, responsive **6 across on desktop / 3 on tablet / 2 on mobile** (`grid-cols-2 md:grid-cols-3 xl:grid-cols-6`). Same data.
- **Table** consolidated from 13 columns to **8** — Date (+ time · creator), Transaction (ID + invoice link), Type (+ notes line), Slots, Limit Change (`480 → 505`), Payment (amount + method), Status, Actions — so it **fits standard desktop widths with no horizontal scroll** (before: Status was half-cut and Created By/Notes/Actions were off-screen). No data removed: creator, notes, invoice and method now ride as secondary lines inside the combined cells; everything remains in the detail panel and the 12-column exports.
- **Tablet/mobile** now render a **transaction card grid** (2-col / 1-col) instead of a scrolling table; small viewports also keep the compact summary cards and wrapped action buttons.
- **Header** made page-local: the five action buttons drop to their own row below `xl` so the title is never squeezed; skeleton loader updated to the new card shape; icon sizes normalized (14–16px).

## Before/after screenshots (`screenshots/`)
`before-desktop.png` / `after-desktop.png`, `before-tablet.png` / `after-tablet.png`, `before-mobile.png` / `after-mobile.png` — captured on the live app (puppeteer against the local dev server, real Company Head session, temporary UIQA-tagged sample rows for company 1 that were removed afterwards).

## QA
Backend, APIs, business logic, payment flow untouched (only `frontend/src/pages/EmployeeSlotHistory.tsx` changed). `tsc` 0 errors · production build ✓ · screenshots confirm no horizontal scroll at 1440px, 3-across cards at 768px, 2-across at 390px, and no console errors during capture beyond pre-existing app-wide noise.

---

# ENHANCEMENT 4 (same day): Slot History Converted from Modal View to a Dedicated Full Page

## What changed
- **New page `frontend/src/pages/EmployeeSlotHistory.tsx`** (URL `/employee-slot-history`, standard app layout with sidebar + top bar, `company-edit`-style hidden route — no sidebar entry). Header per spec ("Employee Slot History" / "View all employee slot purchases, upgrades, and limit changes.") with **Refresh · Export CSV · Export Excel · Print** buttons plus **Purchase Slots** (Company Head only — opens the existing purchase dialog).
- **Summary cards:** Current Employee Limit, Current Active Employees, Available Slots, Total Purchased Slots, Total Amount Spent, Last Purchase.
- **Filters:** search, date range (from/to), transaction type (Online Purchase / Manual Request / Added by Support / Adjusted by Support / Subscription Change), status (Completed / Approved / Awaiting Approval / Rejected — the real status machine), Newest/Oldest sort; live "showing X of Y" + Clear Filters.
- **Table (13 columns):** Date, Transaction ID, Type, Slots, Previous Limit, New Limit, Amount, Payment Method, Invoice (inline download), Status, Created By, Notes, Actions (View Details / Download Invoice / Print Invoice). Client-side pagination 10/25/50/100 via the shared PaginationBar; horizontal scroll inside the card on small screens; skeleton loaders; professional empty state ("No slot history found."); error state with Retry.
- **Detail side panel** (portalled to `<body>` so the page transform never clips it): Purchase Details, Slot Changes (old → new limit), Payment Information (method, gateway payment id, gateway reference, bank reference, paid/credited times), Tax Details (subtotal, GST, grand total), Invoice (download/print), Audit Log (created/actioned by, timestamps, notes).
- **Modal history REMOVED:** `EmployeeSlotsModal` no longer has a history view at all — its "View Slot History" / success-screen "View History & Invoice" buttons and the PENDING-payment path now navigate to the page (`hrms:view-slot-history` event). The Dashboard "Employee Slots" card now navigates to the page too (the page hosts the Purchase entry point). The purchase flow itself is unchanged.
- **Backend (API enrichment only — zero schema change):** `GET /api/employee-slots/history` now returns the full transaction log (was a 50-row slice), a computed `summary` block for the stat cards, and per-row `invoice` + `payment` pointers (method, gateway ids, GST split, totals — never provider cost or raw gateway payloads). Same route, same role rule (Employee = 403).

## QA (this round)
- Temp controller test (scratch tenant 999913 with a full order→invoice chain): **11/11** — 200 payload shape, invoice + payment enrichment, no internal-field leakage, summary math (25 slots / ₹590 / last-purchase date), manual rows have null pointers, Employee role 403.
- Live HTTP re-verification as a real Company Head: history endpoint 200 with capacity/summary/history blocks; suite `verifyEmployeeSlotSystem.js` **63/63**; `tsc` 0 errors; production build ✓. Backend restarted.

## Files changed (this round)
`frontend/src/pages/EmployeeSlotHistory.tsx` (new) · `frontend/src/App.tsx` (page id, title, permission mapping, route case, `hrms:view-slot-history` listener) · `frontend/src/config/moduleRegistry.tsx` (PageId) · `frontend/src/components/subscription/EmployeeSlotsModal.tsx` (history view removed, buttons navigate) · `frontend/src/components/subscription/EmployeeSlotsCard.tsx` (navigates to page) · `backend/src/controllers/employeeSlotController.js` (getHistory enrichment).

---

# ENHANCEMENT 3 (same day): Minimum Online Purchase Flow (Contact-Sales Removed from the Dialog)

## What changed

**The purchase dialog no longer offers any sales-contact path.** "Please contact our sales team", the support email/phone/WhatsApp lines, and the "Request +N Slots from Sales" button are all removed from the dialog (the expired-subscription panel also lost its contact lines). Below-minimum totals now guide the buyer to a bigger purchase instead:

- **"Minimum Online Purchase Amount" is now a configurable Subscription Setting** (`minOnlineSlotAmount`, default ₹500) stored alongside the slot pricing matrix and editable in Super Admin → Subscription Management → Employee Slots. The hardcoded constant remains only as a fallback when the setting is absent.
- **Quote now returns the guidance the panel needs**: `minOnlineAmount`, `shortfall`, and `slotsToMinimum` — the exact number of additional slots (probed in steps of 5 with the *same* pricing formula, so tier-rate drops at higher limits are handled correctly) needed to reach the minimum.
- **Dialog behaviour**: at/above the minimum → the normal "Pay ₹X Securely" button, nothing else. Below it → the payment button is hidden and a "Minimum Online Purchase" panel shows: *"Your current purchase amount is ₹XXX. The minimum online purchase amount is ₹500. Increase the number of employee slots to continue. Need XX more slots to reach the minimum purchase amount."* with a progress bar (amount vs minimum) and a one-click "Increase to +N slots" shortcut.
- **Server-side backstop kept**: an order below the minimum is still refused (422, now code `BELOW_MINIMUM` with a neutral message — the old `CONTACT_SALES` response is gone). Pricing, GST, subscription validation, payment flow and settlement are untouched.

**Deliberately kept (please confirm):** the full-capacity banner still shows the mandated platform-wide limit message *"You have reached your employee limit. Please purchase additional employee slots or contact our sales team."* — it is the same copy the backend 403 and the limit dialog use everywhere. The Super Admin manual-request/approve endpoints also remain (they're no longer reachable from this dialog); say the word and I'll retire the message copy and/or the request endpoint too.

## QA (this round)

`verifyEmployeeSlotSystem.js` grew to **63 checks — all passing**: below-minimum quote exposes minimum/shortfall; `slotsToMinimum` is exact (adding it crosses the line, one step fewer does not); server refuses a below-minimum order with 422 `BELOW_MINIMUM`; and raising the configured minimum to ₹2000 makes a ₹590 purchase ineligible (setting restored after). Regressions: free-plan-limit **ALL PASS** · payment spine **32/32** · `tsc` 0 errors · production build ✓ · backend restarted, health 200.

## Files changed (this round)

Backend: `services/planStore.js` (`minOnlineSlotAmount` default), `services/employeeSlotService.js` (configurable `minOnlineAmount()`, shared totals helper + `slotsToMinimum` probe in the quote, `BELOW_MINIMUM` order backstop), `controllers/employeeSlotController.js` (BELOW_MINIMUM passthrough, CONTACT_SALES removed). Frontend: `EmployeeSlotsModal.tsx` (minimum-purchase panel with progress bar; all contact-sales UI and the manual-request handler removed), `EmployeeSlotAdminTab.tsx` (Minimum Online Purchase Amount field saved with the pricing matrix). Tests: `scripts/verifyEmployeeSlotSystem.js` (§4 rewritten). No schema change, no new env vars.

---

# ENHANCEMENT 2 (same day): Billing Cycle Inherited from the Active Subscription

## What changed

**The billing cycle is never chosen or guessed.** It was already read server-side from `CompanySubscription.billingCycle` — the frontend has never had a cycle field to send (the quote/order APIs accept only a slot count) — but the dialog displayed it as ambient text ("₹15 / Slot (Quarterly)") that looked selectable. Now:

- `buildQuoteContext` loads the full subscription record (`plan`, `billingCycle`, `status`, `renewalDate`) and every quote/overview response carries a read-only `subscription { plan, billingCycle, status, active, inherited: true }` block. The rate is picked from that record's cycle; nothing in the request can influence it.
- **Purchase dialog pricing section redesigned**: *Current Subscription* (plan name), *Billing Cycle* with an explicit **(Inherited)** marker, *Pricing Tier*, *Rate ₹X / Slot*, and the footnote "This pricing follows your active subscription." No cycle control exists anywhere in the dialog.
- **No active subscription → no purchasing.** The active/expired decision reuses the exact rule the Subscription Management analytics already use: inactive when `status ≠ Active`, or `renewalDate` is in the past, or the company's `paymentStatus` is Overdue/Expired/Unpaid (a company with no subscription row is treated as Active on its plan, like everywhere else in the platform). When inactive: the quote, the online order, **and** the manual sales request are all refused server-side with 422 `SUBSCRIPTION_EXPIRED`, and the dialog hides the entire purchase UI, showing *"Your subscription has expired. Please renew your subscription before purchasing additional employee slots."* with the sales contact details.

Payment logic, settlement, GST math and the tier engine are untouched — this round only adds the subscription gate and the presentation of already-server-side facts.

## QA (this round)

`verifyEmployeeSlotSystem.js` grew to **60 checks — all passing**, adding: the quote echoes the inherited cycle for both Quarterly and Yearly subscriptions; an `Expired` status blocks quote, online order and manual request (all 422 `SUBSCRIPTION_EXPIRED` with the required message); the overview flags the inactive subscription and returns zero purchasable options; a **past renewal date** counts as expired even with status "Active"; and restoring the subscription restores purchasing. Regressions: free-plan-limit **ALL PASS** · payment spine **32/32** · `tsc` 0 errors · production build ✓. Local backend restarted, health 200.

## Files changed (this round)

Backend: `services/employeeSlotService.js` (subscription block in the quote context, expired gate in `priceSlots`/`createSlotOrder`/`requestManualPurchase`, `SUBSCRIPTION_EXPIRED_MESSAGE`), `controllers/employeeSlotController.js` (error-code passthrough on quote/order). Frontend: `components/subscription/EmployeeSlotsModal.tsx` (inherited-cycle pricing panel, expired-subscription panel replacing the purchase UI). Tests: `scripts/verifyEmployeeSlotSystem.js` (§3a-bis). No schema change, no new env vars.

---

# ENHANCEMENT (same day): Flexible Slot Purchases + Tiered Pricing + State-based GST

## What changed

**Custom slot amounts.** Quick buttons (+5/+10/+15/+20) remain, plus a custom input. Server-enforced rule: minimum 5, always a multiple of 5 (6/12/17/23 → 422 on quote, order, and manual request; UI shows the rule inline). Quick buttons are now just preset slot counts — their prices come from the live tier quote, never from the pack table's legacy price column.

**Tiered pricing (configurable, never hardcoded).** New `slotPricingTiers` in the Plan Settings store (defaults: 0–100 → ₹25/₹20 Q/Y · 101–500 → ₹20/₹16 · 500+ → ₹15/₹12), editable in the Super Admin Employee Slots tab via the existing plan-config settings endpoint. The tier is chosen by the company's employee limit **after** adding the requested slots; the rate follows the company's billing cycle (`CompanySubscription.billingCycle`). Verified against the requirement's own example: limit 100 + 25 slots → 125 → tier 101–500 → 25 × ₹20 = **₹500** subtotal.

**State-based GST.** Origin = the platform's registered state (Invoice Settings / issuer store); destination = the company's billing state. Same state (or unknown) → **CGST + SGST** split; different → **IGST**. GST percentage stays configurable (billing settings). The pre-payment quote and the final invoice use the *same* rule (`gstTypeFor`), so they can never disagree; invoices display Subtotal, CGST/SGST or IGST, and Grand Total (they already did — now the quote matches).

**New endpoint:** `POST /api/employee-slots/quote { slots }` → `{ slots, currentLimit, newLimit, tier{label,rate,cycle}, subtotal, gst{type,percent,cgst,sgst,igst,total}, grandTotal, onlineEligible }`. Order creation accepts `{ slots }` (or a quick-option `packId`) and freezes the quoted amounts onto the payment order. The ₹500 online minimum still applies to the grand total; below it the contact-sales path (with the same step validation) takes over.

**UI:** the purchase dialog now shows plan, current usage/limit/remaining, quick buttons + custom input, and a live breakdown — tier, rate/slot, subtotal, CGST+SGST or IGST lines, grand total, and "New employee limit: X → Y".

## QA (enhancement round)

`verifyEmployeeSlotSystem.js` grew to **52 checks — all passing**: the full multiples-of-5 accept/reject matrix, both GST branches (unit) + the live split (integration), the ₹500-worked example, tier boundaries (0–100 vs 101–500), yearly-cycle rates, order freezing ₹590 (500 + 18% GST), settlement 100→125 with base intact, invoice GST equal to the quote, step-validated manual requests, and all previous coverage. Regressions: free-plan-limit **ALL PASS**, payment spine **32/32**, `tsc` 0 errors, production build succeeds.

## Additional files changed (enhancement)

Backend: `planStore.js` (tier defaults in settings), `employeeSlotService.js` (validation + tier/GST quote engine replacing flat pack pricing), `employeeSlotController.js` + `employeeSlotRoutes.js` (quote endpoint, slots-based orders). Frontend: `apiClient.ts` (quote), `EmployeeSlotsModal.tsx` (redesigned purchase flow), `EmployeeSlotAdminTab.tsx` (pricing-matrix editor; packs simplified to quick buttons). No schema change and no new env vars in this round.

## 1. What was built

### Every active user consumes one employee slot
- Company Head and HR users now hold **real Employee profiles**: `userEmployeeProfileService.ensureEmployeeProfileForUser()` links an existing employee (matching employee code or tenant email) or creates one through the **same code generator every employee uses** (e.g. `VE-HQ-0001`) — one numbering system, no special-casing. They appear in the Employee Directory with department, designation, status, joining date, and are included in reports like any staff member.
- Hooked into both user-creation paths: `createCompanyUser` (Settings → user management) and `provisionFreeCompany` (self-registration — the Company Head is the first slot of their own plan). Creating a new slot-consuming user is **capacity-checked before the account exists**; linking to an existing employee consumes nothing.
- **Backfill executed locally** (`backfillManagementEmployeeProfiles.js --apply`): 7 profiles created, 1 linked, 0 failures across all existing companies.
- **Safety net:** any active company user *without* a linked profile is still counted by the limit service (`countUnlinkedActiveUsers`) — no creation path, present or future, can mint hidden slot-free users.

### Slot limits: base plan + purchased extras, never overwritten
- `CompanySubscription.extraEmployeeSlots` (new column) stacks on top of the plan's base limit: `limit = baseLimit + extraSlots`. The base plan is never modified by any slot operation; capacity responses expose `baseLimit`, `extraSlots`, and `limit` separately.
- Limit-reached message everywhere: *"You have reached your employee limit. Please purchase additional employee slots or contact our sales team."*

### Slot packs & purchases
- `employee_slot_packs` (Super-Admin CRUD; seeded **+5 ₹250 / +10 ₹500 / +15 ₹750 / +20 ₹1000**).
- **₹500 rule enforced server-side**: totals under ₹500 are refused for online payment (`CONTACT_SALES`) and the UI shows the sales-team contact (call / email / WhatsApp) plus a "Request from Sales" button that files a manual request and notifies Super Admins. ₹500+ packs pay through the **existing Cashfree spine** (new purpose `EMPLOYEE_SLOT_PURCHASE`, same idempotent settlement, same webhook, same signature checks).
- Settled purchase → slots granted atomically with an append-only `employee_slot_transactions` row recording **old limit → new limit**, an `ESP-YYYY-NNNN` invoice (PDF, downloadable), notifications to the Company Head and Super Admins, and an AuditLog entry (module `EmployeeSlots`).
- Manual lifecycle: Company Head request → Super Admin approve (idempotent, 409 on double-approve) / reject; Super Admin manual grant/decrease with mandatory audited reason; decreases clamp purchased slots at zero.

### UI
- **Dashboard card:** "Employee Slots Used 98 / 100" with meter, opens the slot dialog.
- **Employee Slots dialog** (global): usage breakdown (base + purchased + remaining), packs with online/sales routing, Cashfree modal checkout, purchase history with invoices.
- **Limit dialog** rewritten: primary action **Purchase Additional Slots**, then Upgrade Plan / View Plans.
- **Super Admin:** new "Employee Slots" tab in Subscription Management — packs CRUD, pending requests (approve/reject), per-company usage (base/extra/limit/used/remaining), manual adjust, full transaction history.

## 2. QA results (all local)

| Suite | Result |
|---|---|
| `verifyEmployeeSlotSystem.js` (new, 27 checks: CH=1 slot, HR=1 slot, archived excluded, block at limit + message, +10 purchase → limit 5→15 with base intact, duplicate settlement no-op, ESP invoice, contact-sales rule, request approve/reject, adjust clamp, tenant isolation) | ✅ 27/27 |
| `verifyFreePlanLimit.js` (existing; one assertion updated to the new required message) | ✅ ALL PASS |
| `testRechargePayments.js` (payment spine regression) | ✅ 32/32 |
| `testVerificationWalletGate.js` | ✅ 51/51 |
| HTTP smoke (live server): CH login → overview/packs/history 200; unauth 401; directory shows CH/HR with codes | ✅ |
| `tsc --noEmit` 0 errors · `vite build` succeeds | ✅ |

## 3. Files changed

**Backend new:** `services/userEmployeeProfileService.js`, `services/employeeSlotService.js`, `services/payments/settlements/employeeSlotPurchase.js`, `controllers/employeeSlotController.js`, `routes/employeeSlotRoutes.js`, `routes/superAdminEmployeeSlotRoutes.js`, `scripts/addEmployeeSlotTables.js`, `scripts/backfillManagementEmployeeProfiles.js`, `scripts/verifyEmployeeSlotSystem.js`.
**Backend modified:** `prisma/schema.prisma` (additive), `services/employeeLimitService.js`, `services/payments/paymentOrderService.js` (+generic creator, +purpose), `services/payments/rechargeInvoiceService.js` (purpose-aware), `controllers/userController.js` (capacity gate + profile hook), `services/companyProvisioning.js` (head profile), `server.js` (2 mounts), `scripts/verifyFreePlanLimit.js` (message assertion).
**Frontend new:** `components/subscription/EmployeeSlotsModal.tsx`, `EmployeeSlotsCard.tsx`, `EmployeeSlotAdminTab.tsx`.
**Frontend modified:** `api/apiClient.ts` (`api.employeeSlots`), `components/subscription/EmployeeLimitDialog.tsx`, `App.tsx` (global dialog + event), `pages/Dashboard.tsx` (card), `pages/SubscriptionManagement.tsx` (6th tab).

## 4. API changes (all additive)
Tenant `/api/employee-slots`: `GET overview`, `POST orders`, `POST orders/:id/verify`, `POST request`, `GET history`. Super Admin `/api/super-admin/employee-slots`: packs CRUD, `GET requests`, `POST requests/:id/approve|reject`, `POST adjust`, `GET transactions`, `GET usage`. Slot invoices download via the existing recharge-invoice endpoint (ownership-checked, purpose-agnostic). No existing endpoint changed shape; `getCapacity` gained fields without renaming old ones.

## 5. Database changes (additive, `scripts/addEmployeeSlotTables.js`, never `db push`)
`CompanySubscription.extraEmployeeSlots INT DEFAULT 0` · `employee_slot_packs` (seeded) · `employee_slot_transactions` · `verification_recharge_invoices.purpose`. Plus data backfill (Employee rows + `User.employeeId` links) via the dry-run-first script.

## 6. Environment variables
**None added or modified.** The feature reuses the existing Cashfree PG configuration.

## 7. Security
Company identity from the authenticated session only (`resolveWalletCompany`); slot limits writable only by a settled payment or Super Admin; amount/slots frozen on the order at creation; packs priced server-side; the ₹500 rule enforced server-side (not just hidden in the UI); every slot change audited with old/new limits; Employee-role users have no access to slot endpoints.

## 8. Known notes & decisions
1. **Employee codes follow the existing scheme** (`<COMPANY>-<BRANCH>-NNNN`, e.g. `VE-HQ-0001`), not literally `EMP0001` — the requirement's intent ("same numbering system for everyone") is met by using the one existing generator for CH/HR too.
2. **Payroll visibility:** CH/HR profiles carry salary 0, so they will appear in payroll rosters as pending/zero rows — consistent with "they appear like every other employee"; set their salaries or leave them pending as policy dictates.
3. GST on packs follows the platform billing settings (currently ON at 18%, so +10 = ₹590 payable — still online-eligible; the ₹500 threshold is checked against the payable total).
4. The min-online-amount (₹500) is a named constant (`MIN_ONLINE_AMOUNT`) ready to become a Super-Admin setting later.
5. Company 1 is on Enterprise (unlimited), so its dashboard meter shows ∞ — limits bite on Free/Starter/Custom plans.

## 9. Deployment checklist (NOT executed — awaiting approval)
1. `node scripts/addEmployeeSlotTables.js` on EC2 → `npx prisma generate` → pm2 restart (never `db push`).
2. `node scripts/backfillManagementEmployeeProfiles.js` (dry-run first, then `--apply`).
3. Frontend build + deploy (no new dependencies beyond the already-added Cashfree SDK).
4. Verify pack pricing/GST in Super Admin before enabling; run `verifyEmployeeSlotSystem.js` as a post-deploy smoke check.

---
**STOP:** awaiting your explicit approval before any commit, push, merge, or deployment.
