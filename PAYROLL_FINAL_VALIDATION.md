# Payroll — final validation report

**Status:** Both items resolved, everything re-verified. Not committed, not pushed, not deployed.
**Date:** 2026-07-29

---

## Item 1 — Branch-only generation for a brand-new period

**Cause.** `BranchPayroll.companyId` is a required column, but the branch path passed the
caller's `companyId` straight through. Omit it and Prisma raised
``Argument `companyId` is missing`` — **but only on the first run of a period.** A re-run took
the upsert's `update` branch, which needs no `companyId`, so the failure was invisible except
on a period's very first generation. That intermittency is why it had never surfaced.

**Fix** (`payrollController.generate`). A branch already knows its company, so it is resolved
from the `Branch` row rather than demanded from the caller. An explicitly supplied `companyId`
still wins, and an unknown branch now returns `404 BRANCH_NOT_FOUND` instead of a Prisma crash.

```js
let periodCompanyId = companyId;
if (isBranch && periodCompanyId === undefined) {
  const branchRow = await prisma.branch.findUnique({ where: { id: branchId }, select: { companyId: true } });
  if (!branchRow) return res.status(404).json({ error: 'Branch not found.', code: 'BRANCH_NOT_FOUND' });
  periodCompanyId = branchRow.companyId;
}
```

Verified: brand-new period → 201, period row created with the company resolved from the branch,
re-run still works via the update path, no duplicate rows, unknown branch → clean 404.

---

## Item 2 — The four payroll rows

### What created them

`config/prisma.js` auto-audits every write, so the audit action names the **Prisma operation**,
not the endpoint. That, plus the row shape, identified both sources exactly.

| Rows | When | Source | Verdict |
|---|---|---|---|
| 17633 (company 11, emp 3200) | 12:58:45 | `attendanceController.syncPayroll` — full-sync path | **Expected** |
| 17634–17636 (company 1, branch 3) | 13:04:50 | `attendanceController.pushToPayroll` — batch `PB-3-2026-07` | **Expected** |

Both were made by user 2 (`om@gmail.com`, Company Head), from **Attendance → Sync / Push to
Payroll**. Neither came from `generate`: all four carry `payrollStatus: 'draft'` and a null
period link, whereas `generate` writes `pending_approval` and always links a parent period row.

### Why this is expected

Creating the payroll row **is the purpose** of these actions, and both say so in code:

- `syncPayroll` (full sync): *"Ensure a payroll row exists for this employee/month so recalc can
  fill it."* It writes a `draft` row, then recomputes attendance and runs the engine.
- `pushToPayroll`: transfers a reviewed attendance batch into payroll, upserting one row per
  employee and then running the single engine over the batch. 774 employees were pushed for
  branch Ahmedabad, July 2026 — 771 already had rows (updated), 3 did not (created).

Nothing is double-counted: both paths use `upsert`/find-first-then-create keyed on
employee+month+year+company, and the final sweep shows **0 duplicate rows** across the table.

`snapshotOnly: true` — the Phase-1 "Push to Payroll Engine" mode — deliberately creates **no**
payroll row at all. Only the full-sync and batch-push modes do.

### One genuine defect found while investigating

The company-11 row was written during company 1's session, which I checked rather than assumed.
It turned out to be legitimate: `om` holds `accessibleCompanyIds: ["1","2","11"]`. But verifying
it exposed a real hole in **both** attendance→payroll write paths:

- **`syncPayroll`** computed `allowedIds` and then used it only as a *fallback*. Naming
  `companyId` (or any `scopeIds`) **replaced** the caller's scope instead of narrowing it.
- **`pushToPayroll`**'s in-scope test was *"does this employee belong to the company the CLIENT
  named"* — satisfied by simply naming the victim's company.

Demonstrated live before the fix: a Company Head of company 26 sent `companyId: 1` and received
**830 of company 1's employees**. With `dryRun: false` the same call writes payroll rows for them.
This is the same class as ZHR-002 from the earlier audit, in a write path.

**Fixed.** A named workspace is now authorised through the shared branch-aware
`canEnterWorkspace` (403 if not), and `syncPayroll`'s query is fenced with an `AND` against
`companyScopeFor(req)` so a client-named id can only ever **narrow**. `pushToPayroll` now
requires the caller's real grants first and treats a named `companyId` as an additional filter.

| Case | Before | After |
|---|---|---|
| Outsider names another tenant (`syncPayroll`) | 830 rows leaked | **403** |
| Outsider names foreign `scopeIds` | leaked | **0 rows** |
| Outsider names victim company (`pushToPayroll`) | would write payroll | **403** |
| Outsider, own tenant | 31 rows | 31 rows (unchanged) |
| Multi-company head reaching a granted company | 65 rows | 65 rows (unchanged) |
| Super Admin | unrestricted | unrestricted |

---

## Regression suite — all green

| Suite | Result |
|---|---|
| `verifyPayrollGenerateIds` | **49 passed, 0 failed** |
| `verifyAttendancePayrollScope` *(new)* | **13 passed, 0 failed** |
| `verifyOvertimePayroll` | 29 passed, 0 failed |
| `verifyOvertimeApprovalSync` | 24 passed, 0 failed |
| `verifyAttendanceSummaryOvertime` | 9 passed, 0 failed |
| `verifyPayloadSlimming` | 13 passed, 0 failed |
| `verifyNamingAndBranchScope` | 13 passed, 0 failed |
| `verifyOvertimeCreate` | 8 passed, 0 failed |
| Live HTTP (real login + RBAC) | 10 passed, 0 failed |
| **Total** | **158 checks, 0 failures** |

### One pre-existing failure found and fixed

`verifyOvertimeApprovalSync` was **22/2** — not from these changes. The Salary Worksheet
endpoint was returning **HTTP 500**: `Table 'corehrms.payroll_worksheet' doesn't exist`. That
table is created by raw SQL, is not declared in `schema.prisma`, and had simply never been run
against this local database, so `prisma generate`/`db push` would never have created it. I ran
the repo's own `backend/scripts/createPayrollWorksheetTables.js` (idempotent, `CREATE TABLE IF
NOT EXISTS` only — no DROP/ALTER/DELETE). Suite now **24/0**.

Worth checking whether the RDS instance has these two tables; if not, the Salary Worksheet is
500ing in production too.

---

## Generation modes verified

| Mode | Result |
|---|---|
| By company (id as Int **and** as String) | ✅ 201 |
| By branch (with companyId) | ✅ 201 |
| **By branch only, brand-new period** | ✅ 201, company resolved from the branch |
| Branch only, re-run | ✅ 201, no duplicates |
| Selected employees (Int and String ids) | ✅ correct count |
| All employees (bulk, no `employeeIds`) | ✅ 201 |
| Empty selection `[]` | ✅ 400, did **not** widen to the whole company |
| Partly-invalid selection | ✅ valid ids processed, rejects logged |
| Company Head / HR | ✅ both |
| 705 employees | ✅ 201 in ~32s, one row each |

---

## Final data integrity

```
payroll rows total                      7260   (unchanged from baseline)
duplicate emp+month+year+company rows      0
scratch payroll / employees / cos / users  0 / 0 / 0 / 0
payroll rows in a future test year         0
orphan branchPayroll / companyPayroll      0 / 0
negative net salary rows                   0
Prisma validation errors in the logs       0
```

---

## Files changed this round

**Modified (2)**
```
backend/src/controllers/payrollController.js   — branch→company resolution for a new period
backend/src/controllers/attendanceController.js — tenant fence on syncPayroll + pushToPayroll
```

**New (1)**
```
backend/scripts/verifyAttendancePayrollScope.js
```

**Local DB** — ran `backend/scripts/createPayrollWorksheetTables.js` (additive, idempotent).
Must also be run wherever else these tables are missing.
