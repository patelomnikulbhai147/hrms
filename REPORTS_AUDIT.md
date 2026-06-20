# Reports Module — Phase 1 Audit

**Date:** 2026-06-20
**Scope:** Full inventory audit of the Reports module. No reports removed; audit only.

> **UPDATE (restoration done):** The missing reports have been implemented as live DB-driven
> generators. The catalog now has **118 functional reports** across **12 categories** —
> exceeding the original 105 target. All 118 pass a generate smoke-test (0 failures).
> Per-category: Payroll 15 · Attendance 11 · Leave 5 · Employee 16 · Document 11 ·
> Compliance 14 · Statutory Registers 8 · PF 16 · ESI 7 · Tax 7 · Gratuity & Settlement 5 · Bonus 3.

---

## 0. Executive summary

| Metric | Finding |
|---|---|
| "Original ~105 reports" | **CONFIRMED — exactly 105**, but they were a **display-only "coming soon" catalog** (`ReportCenter.tsx`), never wired to data. 0 of the 105 ever generated a real report. |
| Current **functional** reports | **66 live reports** that generate dynamically from the database, with Preview / Print / PDF / Excel / Audit log / Generated-by. |
| Net change | We went from **105 placeholders (0 working)** → **66 working reports**. The drop in *count* is real; the drop in *capability* is the opposite (0 → 66 functional). |
| Biggest gaps | Document Reports (whole category, 10), several Payroll variants, Factory-Act registers, some PF/ESI/PT sub-forms, and Loan/Advance (no data source). |

> The system never "lost" 39 working reports. The 105 was a roadmap list. The real task is to **grow the 66 working reports toward (and beyond) 105** and add the Phase 3–8 capabilities.

---

## 1. Source surfaces found in code

| Surface | File | Reports | Status |
|---|---|---|---|
| **Live engine** (dynamic, DB-driven) | `backend/src/controllers/complianceReportController.js` (`REPORTS` registry) | **66** | ✅ ACTIVE — this is the "Reports" menu |
| Static catalog (placeholders) | `frontend/src/pages/ReportCenter.tsx` | 105 | ⚠️ UNLINKED (orphaned in task 1; not routed) |
| Operational tables | `frontend/src/pages/Reports.tsx` | 4 (attendance/payroll/leave/offboarding tables) | ⚠️ UNLINKED (orphaned; not routed) |
| Payslip generator | `frontend/src/utils/salarySlipGenerator.ts` | 1 (payslip PDF) | ✅ used by Payroll module |
| Audit Trail | separate `audit` module | — | ✅ exists, but NOT inside Reports |

---

## 2. Current LIVE inventory (66 reports, by category)

**Payroll (8):** Salary Register · Salary Slip · Payroll Summary · Bank Transfer · Loan Report* · Advance Report* · CTC Report · Increment Report
**Attendance (7):** Daily · Monthly · Muster Roll · Overtime Register · Shift · Late Coming · Attendance Summary
**Leave (4):** Leave Register · Leave Balance · Leave Summary · Leave Encashment
**Employee (8):** Employee Master · Department · Designation · Branch · Joining · Exit · Birthday · Anniversary
**Compliance (14):** Salary Register (Statutory) · Muster Roll · Attendance Register · Wage Register · Leave Register · Employee Register · Bonus Form C · Bonus Form D · Overtime Register · Professional Tax · Form A · Form B · Form C · Form D
**PF (10):** PF Register · PF Summary · PF Challan · Form 3A · Form 6A · Form 11 · Form 19 · Form 10C · ECR File · KYC Export
**ESI (5):** ESI Register · ESI Summary · ESI Challan · ESI Inspection · ESI Coverage
**Tax (4):** Form 16 · TDS · Employee Tax Summary · Professional Tax Summary
**Gratuity & Settlement (3):** Gratuity · Full & Final Settlement · Exit Settlement
**Bonus (3):** Bonus Register · Bonus Summary · Bonus Payment

\* = **BROKEN / no data source** (see §6).

---

## 3. EXISTING (functional equivalents of the original 105) — ~45 covered

Original reports that ARE delivered (sometimes renamed) by the live engine, e.g.:
Salary Register, Salary Slip, Increment Report, Daily/Monthly Attendance, Attendance Register, Late Coming, Muster, Overtime Register, Shift, Leave Balance/Summary/Encashment/Detail, Employee Master, Birthday, Full & Final, PF Register/Summary/Challan/3A/6A/11/19/10C, ESI Register/Challan/Summary/Inspection, Professional Tax Summary, Form 16, TDS, Bonus Register, Gratuity, Form XXI≈Form A, Form XXII≈Form C, Department Salary Summary≈Payroll Summary, KYC≈Employee KYC.

---

## 4. MISSING (in the original 105 catalog, NOT yet in the live engine) — ~60

**Employee (8):** Employee Information Form, Monthly Attrition, Age-Wise, Left/Join, Service Certificate, Identity Card Register, Employee Document Status, Employee Pending Document.
**Attendance (4):** Weekly Attendance, Missing Punch, Early Exit, Overtime Summary.
**Payroll (7):** Salary Slip TDS, Salary Slip Direct Mail, Salary Slip Multi-Download, Payment Report, Salary Certificate, Employee Monthly/Annual Salary Summary, Company Annual Salary Summary, Division Summary.
**Document (10 — ENTIRE CATEGORY MISSING):** Aadhaar, PAN, Passport, Driving License, Bank Document, Education, Experience, Contract, Uploaded Documents Register, Pending Documents.
**PF (7):** Form 5 Monthly, Form 10 Monthly, Form 6A Part II, Form 9, PF Number Report, Employee PF Summary, PF Inspection.
**ESI (3):** Employee ESI Summary, ESI Number Report, ESI Challan Entry.
**Tax/PT (4):** PT Challan Form 5, PT Challan List, IT Declaration Form, Tax Deduction Report.
**Gratuity (2):** Gratuity Statement, Gratuity Register.
**Labour Contractor (5):** Form 13, Form 24, Form 25, Form XX (Loss/Damage), Employment Card.
**Factory Act (8 — ALMOST ENTIRE CATEGORY MISSING):** Form 15-II Wages Register, Accident Register, Compensatory Leave Register, Form 20/32 Health Registers, Form 37 Register, Rest-Leave Wages Register, Exempted-Workers OT Register.

**Phase-2 categories with NO presence in Reports yet:** Recruitment Reports, Document Reports, User Activity Reports (exists only in the separate Audit module), dedicated Loan/Advance reports (broken).

---

## 5. DUPLICATE reports (same generator, different statutory label — intentional but flagged)

| Generator | Exposed as |
|---|---|
| `salaryReg` | Salary Register · Wage Register · Salary Register (Statutory) |
| `musterRoll` | Muster Roll (Attendance) · Muster Roll (Compliance) |
| `leaveRegister` | Leave Register (Leave) · Leave Register (Compliance) |
| `overtimeRegister` | Overtime Register (Attendance) · Overtime Register (Compliance) |
| `employeeMaster` | Employee Master · Employee Register |
| `ptReport` | Professional Tax Summary · Professional Tax Report |
| `exitReport` | Employee Exit · Exit Settlement |
| `esiReport` | ESI Register · ESI Inspection |

→ 8 generators serve ~18 catalog entries. Acceptable for statutory naming, but should be de-duplicated or clearly differentiated in output.

---

## 6. BROKEN reports (no data source)

| Report | Reason |
|---|---|
| **Loan Report** | `noSource('Loan disbursement')` — HRMS has no loan module/table. Returns empty + warning. |
| **Advance Report** | `noSource('Salary advance')` — no advance table. Returns empty + warning. |

→ Need a Loan/Advance data model before these can be real.

---

## 7. HIDDEN / UNLINKED

| Item | Status |
|---|---|
| `ReportCenter.tsx` (105 placeholders) | Orphaned — not imported/routed. Source of the "105" number. |
| `Reports.tsx` (4 operational tables) | Orphaned — not imported/routed. |
| Audit Trail / User Activity | Lives in its own `audit` menu, **not** surfaced under Reports. |

---

## 8. Phase 3–8 capability gaps (current engine)

| Phase | Requirement | Current state |
|---|---|---|
| 3 | Per-report **smart filters** | ❌ ALL reports share one generic filter bar (Company/Branch/Dept/From/To/Employee). |
| 4 | **Interactive/spreadsheet preview** (edit, recalc, save) | ❌ Preview is **read-only**. |
| 5 | **Auto-recalculation engine** | ❌ Not present in reports. |
| 6 | **Statutory lock** (edit source, not the form) | ⚠️ Partial — statutory reports are read-only by default, but no explicit "edit source → regenerate" workflow. |
| 7 | Preview / Print / PDF / Excel / **CSV** / Filters / Audit / Generated-by / Logo / Company / Branch | ✅ all **except CSV** (missing) and per-report branch metadata in some formats. |

---

## 9. Recommended remediation plan (phased)

1. **Restore inventory to ≥105 functional reports** — implement the ~60 missing as real generators (Document category, Payroll variants, Factory/Labour registers, PF/ESI/PT sub-forms). Priority order: Document → Payroll variants → Factory/Labour statutory → PF/ESI sub-forms.
2. **Phase 3 — Smart filters:** add a per-report `filters: [...]` spec to each registry entry; render only those.
3. **Phase 7 — CSV export** + ensure branch metadata in every format. (Quick win.)
4. **Phase 4/5 — Editable preview + recalculation** for non-statutory reports (largest effort).
5. **Phase 6 — Statutory regeneration workflow** (edit source data → auto-regenerate forms).
6. **Re-route** the orphaned catalog so nothing is hidden; surface Audit/User-Activity under Reports.

**Estimated effort:** §9.1 ≈ large; §9.2/§9.3 ≈ medium; §9.4/§9.5 ≈ very large (spreadsheet engine). Recommend executing in the above order, one phase per change set.
