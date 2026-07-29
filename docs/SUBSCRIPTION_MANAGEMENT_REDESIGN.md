# Subscription Management — Redesign Implementation Report

**Date:** 29 July 2026
**Scope:** Super Admin → Subscription Management (frontend redesign)
**Status:** Complete, verified locally. Not committed, not pushed, not deployed.

---

## 1. What was asked, and what was delivered

| Requirement | Delivered |
|---|---|
| Six sections: Overview, Companies, Plans, Billing, Reports, Settings | ✅ All six, in that order |
| Overview: 4 figures + revenue chart + plan distribution chart | ✅ Exactly four tiles, two charts, nothing else |
| Companies: 7-column simplified table, row opens company details | ✅ Company · Plan · Employees Used · Renewal · Status · Outstanding · Actions |
| Company Details: 8 sections | ✅ Subscription · Employee Slots · Verification Credits · Billing · Invoices · Payment History · Usage · Audit Logs |
| Plans: cards, editable pricing / employee limits / features / billing cycles / verification credits | ✅ All five editable |
| Billing: Payments, Invoices, Refunds, Revenue, Pending, Failed | ✅ Six registers |
| Reports: Revenue, Growth, Renewals, Expired Plans, Verification Credit Sales, Employee Slot Sales, GST | ✅ Seven reports |
| Settings: GST, Payment Gateway, Invoice Template, Billing Rules, Pricing Matrix, Coupons | ✅ Six panels |
| Modern enterprise SaaS design, less clutter, better spacing, professional typography, consistent colours, responsive | ✅ Measured — see §5 |
| Do NOT change business logic | ✅ No pricing, permission, GST, invoicing or entitlement rule was altered |
| Do NOT modify APIs unless required for UI | ⚠️ One additive read-only endpoint — see §4 |
| Do NOT push / commit / deploy | ✅ Working tree only |
| Screenshots + implementation report | ✅ 33 screenshots + this document |

---

## 2. The problem being solved

The previous module was a five-tab shell whose first screen opened with **nine KPI tiles of equal visual weight** followed by an **eleven-column table**. Consequences:

- No hierarchy — "Quarterly Plans" was rendered exactly as loudly as "Monthly Revenue".
- The two numbers an operator acts on daily (seats used, money owed) were **not in the table at all**; they were pushed onto four different pages.
- Billing, plan config, slot admin, credit sales and invoice settings each had their own visual language (raw `slate-*` hex in some tabs, design tokens in others).
- Answering "what is going on with this account?" meant visiting four screens.

The redesign is organised around the questions the business actually asks, in order: *how are we doing → who is on what → what do we sell → where is the money → what does it tell us → how does it run*.

---

## 3. Files

### New

| File | Purpose |
|---|---|
| `frontend/src/components/subscription/kit.tsx` | Shared presentation kit — metric tiles, panels, sub-nav, empty/loading states, money & date formatting, CSV export. One source for the module's look. |
| `frontend/src/components/subscription/charts.tsx` | Dependency-free SVG bar chart + donut, theme-aware, with hover tooltips. |
| `frontend/src/components/subscription/OverviewTab.tsx` | Four figures + two charts. |
| `frontend/src/components/subscription/CompaniesTab.tsx` | Seven-column register. |
| `frontend/src/components/subscription/ReportsTab.tsx` | Seven reports. |
| `frontend/src/components/subscription/SettingsTab.tsx` | Six configuration panels. |
| `frontend/src/pages/SubscriptionCompanyDetails.tsx` | Company Subscription Details, eight sections. |
| `backend/scripts/shotSubscriptionRedesign.js` | Screenshot harness (real browser, real login). |
| `backend/scripts/probeSubscriptionResponsive.js` | Responsive overflow probe. |

### Rewritten

| File | Change |
|---|---|
| `frontend/src/pages/SubscriptionManagement.tsx` | 5-tab shell → 6-section shell with cross-section deep links. |
| `frontend/src/components/subscription/BillingTab.tsx` | Single invoice table → six registers; 8 KPI tiles → 4. |
| `frontend/src/components/subscription/PlansTab.tsx` | Restyled cards; editor gained **Billing Cycles** and **Verification Credits** sections. |

### Modified

| File | Change |
|---|---|
| `frontend/src/App.tsx` | `subscription-manage` route now renders `SubscriptionCompanyDetails`; passes `onOpenInvoice`; page title `Manage Subscription` → `Company Subscription`. |
| `frontend/src/api/apiClient.ts` | Added `subscriptionInvoices.allPayments()`. |
| `backend/src/controllers/subscriptionInvoiceController.js` | Added `allPayments` (read-only). |
| `backend/src/routes/subscriptionInvoiceRoutes.js` | Added `GET /payments`, declared **above** `/:id`. |

### Now unused (left in place, not deleted)

`pages/SubscriptionManage.tsx`, `components/subscription/HistoryTab.tsx`, `PlanSettingsTab.tsx`, `EmployeeSlotAdminTab.tsx`. They are no longer imported. Left on disk deliberately — see §7 on concurrent edits.

---

## 4. The one API change, and why

**`GET /api/subscription-invoices/payments`** (Super Admin, read-only).

The requested **Billing → Payments** register needs a list of payments across all invoices. Payment rows existed only per-invoice (`GET /:id/payments`) and per-company, so rendering a platform-wide register would have meant one request per invoice.

The endpoint is a pure projection of rows that already exist — each `SubscriptionInvoicePayment` stamped with its invoice's number, company and status. It computes nothing, writes nothing, and recording a payment still goes exclusively through the existing `addPayment`. It is declared above `/:id` so Express does not capture `payments` as an id (the documented landmine in this router).

**No other endpoint was added or altered.** Everything else reads endpoints that already backed their own admin screens.

---

## 5. Design decisions worth stating

### Colour is computed, not chosen

The plan-master colours (`#64748b`, `#3b82f6`, `#8b5cf6`, `#4f46e5`, `#d97706`) were **measured** as a chart palette and fail:

```
[FAIL] Chroma floor        #64748b reads as gray
[FAIL] CVD separation      #8b5cf6 ↔ #3b82f6  ΔE 1.3 (deuteranopia)
[FAIL] Normal-vision floor #4f46e5 ↔ #8b5cf6  ΔE 11.4 (below the 15 floor)
```

Two plans would have been indistinguishable to a colourblind reader, and two more are hard to tell apart in full colour vision. Those colours stay as each plan's identity badge in the Plans tab; **charts use a separately validated categorical set** that passes every gate on both the light (`#FFFFFF`) and dark (`#1D2230`) surfaces:

```
light  #2a78d6 #eb6834 #1baf7a #eda100 #e87ba4   ALL CHECKS PASS
dark   #3987e5 #d95926 #199e70 #c98500 #d55181   ALL CHECKS PASS
```

Three light-mode slots sit under 3:1 contrast, so every donut segment is **directly labelled** in the legend with its count and share — identity never depends on colour alone.

### Charts

No chart library was added (none was installed). Both charts are plain SVG: a single-series revenue bar chart (rounded 4px data-ends anchored to the baseline, recessive grid, selective direct label on the peak only, hover tooltip on the full column as hit target) and a donut with 2px surface gaps between segments. Both read their colours from CSS custom properties that flip under the app's own `:root:not([data-theme="light"])` selector, so they follow the app's dark mode rather than carrying their own.

### Dates and money

Every date renders through `utils/formatDate.ts` (the project's single formatter) — no raw ISO, no `toLocaleDateString` calls. Money renders through one `inr()` helper with a compact `inrShort()` for axis ticks.

### Interpretations I had to make

- **"Billing Cycles" (Plans editor)** — there is no per-plan list of *offered* cycles in the schema; there are per-cycle *rates*. The editor presents a **Billing Cycles** section holding the quarterly and yearly per-user rates plus a live "yearly is N% cheaper" readout. Adding a new schema field would have been a business-logic change.
- **"Coupons" (Settings)** — no coupon engine exists. Settings now manages the approved coupon **registry** (code, description, discount %, validity, active) persisted through the existing settings store, which accepts arbitrary keys. **Discounts are still applied via the per-company discount % field** — the pricing engine was deliberately not touched. The panel says so on screen, in an amber note, rather than implying automatic redemption.
- **"Monthly Revenue" (Overview)** — shown as money *collected this month* against subscription invoices, with the MRR run-rate on the supporting line, so the headline figure is actual cash rather than a projection.

---

## 6. What moved, and one thing that would otherwise have been lost

The six-section structure has no home for the old **Employee Slots** admin tab. Rather than drop it:

- **Slot pricing tiers + minimum online purchase** → Settings → Pricing Matrix (as requested).
- **Slot packs + the pending-request approval queue** → Settings → Pricing Matrix, below the tiers. These are *actions* (approve/reject a company's seat request) that would have become unreachable otherwise.
- **Manual grant / decrease** → Company Details → Employee Slots, where it applies to a specific company. Same audited endpoint, reason still mandatory.

**Deliberately dropped:** the global *Subscription History* tab. Nothing is lost operationally — the same records are on every company's detail page under Plan Change History and Audit Logs. Only the platform-wide roll-up view is gone. Say the word and it can come back as an eighth report.

---

## 7. Verification

All checks run against the running local app (backend `:5000`, Vite `:5173`, Laragon MySQL), logged in as a real Super Admin through the real login form.

| Check | Result |
|---|---|
| TypeScript `tsc --noEmit` | **exit 0** |
| Production `vite build` | **exit 0**, built in 18.3s |
| Screens captured through a real browser | **33** |
| Browser console errors across all 33 screens | **0** |
| Failed network requests across all 33 screens | **0** |
| Horizontal overflow, 6 sections × 6 widths (1600 → 768) | **0** — PASS |
| Palette validation, light + dark | **ALL CHECKS PASS** |

Screenshots: `screenshots/subscription-redesign/` (plus `capture-report.json`, which records what each screen actually rendered — columns, row counts, chart count — so the images are not the only evidence).

**Live data confirms real wiring**, not empty scaffolding — e.g. Companies shows `238 / 100` seats over-limit in red; Billing → Pending shows `INV-2026-0001 · 2 days late · ₹14,620`; Reports → Employee Slot Sales shows a real `+405 slots · ₹7,169 · 100 → 505` purchase; Reports → GST shows CGST/SGST `₹1,115` each on a `₹14,620` invoice.

### Two things to be aware of

1. **The app shell's sidebar does not collapse on narrow viewports.** At 430px it still occupies 255px, leaving the content area cramped. This affects *every page*, is pre-existing, and is outside this module — so it was not changed. The module's own layout was verified independently and does not overflow at any width (§ table above).
2. **Another session was editing this module concurrently** while this work was in progress — a White Label tab and a subscription purchase wizard appeared mid-flight. The redesigned shell was reconciled to keep **White Label** as a seventh tab so that work is not lost. The four now-unused files were left on disk rather than deleted, for the same reason. Worth a look before committing.

---

## 8. Not done

- Nothing was committed, pushed or deployed. The working tree holds all changes.
- No database migration; no schema change of any kind.
- `backend/data/planDefinitions.json` still carries `includedVerificationCredits: 0` for the seeded plans (the field predates this work but was never surfaced). It is now editable per plan in Plans → Edit → Verification Credits.
