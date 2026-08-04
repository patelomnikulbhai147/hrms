# Payroll → Generate Payroll: Prisma validation error — root cause & fix

**Status:** Fixed and verified locally. Not committed, not pushed, not deployed.
**Date:** 2026-07-29
**Schema change:** none. **Business logic change:** none.

---

## 1. The error

```
PrismaClientValidationError
Invalid `prisma.employee.findMany()` invocation:
{
  where: {
    status: { notIn: ["Offboarded","Archived","Resigned","Terminated","Inactive"] },
    OR: [ { companyId: "1" }, { branchId: "1" } ]
  }
}
Argument `companyId`: Invalid value provided. Expected IntFilter or Int, provided String.
```

Reproduced verbatim against the live database, then confirmed fixed (same payload now
returns 830 employees).

---

## 2. Root cause

**Prisma coerces a numeric string at the top level of a `where`, but *not* inside an
`OR` / `AND` / `NOT` block.** Measured on this schema:

| Filter | Result |
|---|---|
| `{ branchId: '5' }` | ✅ OK — coerced |
| `{ companyId: '1' }` | ✅ OK — coerced |
| `{ OR: [{ companyId: '1' }] }` | ❌ **THROWS** |
| `{ OR: [{ branchId: '1' }] }` | ❌ **THROWS** |
| `{ AND: [{ companyId: '1' }] }` | ❌ **THROWS** |
| `{ id: { in: ['1','2'] } }` | ✅ OK — uniform array coerces |
| `{ id: { in: [1,'x'] } }` | ❌ THROWS `Expected Int, provided String` |
| `{ id: { in: [1, undefined] } }` | ❌ THROWS ``Argument `in` is missing`` |

`generate` builds its scope two different ways:

```js
if (isBranch) {
  employeeWhere.branchId = branchId;        // TOP LEVEL  → string coerced → worked
} else {
  employeeWhere.OR = [
    { companyId: companyId },               // INSIDE OR  → string rejected → threw
    { branchId: companyId }
  ];
}
```

and `companyId` came straight from `req.body`. The client sends a string —
`frontend/src/pages/Payroll.tsx:58` types the prop as `activeCompanyId: string`
(`App.tsx:795` is `useState<string>` seeded from localStorage) and passes it
unconverted at `Payroll.tsx:1081`.

**That is the whole bug, and it explains the symptom exactly:** generating *by company*
took the `OR` path and threw; generating *by branch* took the top-level path and quietly
worked. Nothing was wrong with the schema, the status list, or the payroll maths.

---

## 3. Point-by-point answers to the checklist

1. **`companyId`** — `Employee.companyId Int` (required). Was receiving a String.
   Now converted with a strict parser before use. ✅
2. **`branchId`** — `Employee.branchId Int?` (nullable). Matches the query. Was also
   receiving a String, but survived only because it sat at the top level. Now converted. ✅
3. **`employeeIds`** — now stripped of `null`/`undefined`/`NaN`/non-numeric/zero/negative
   /non-integer values, de-duplicated, and converted to numbers. An empty result is
   **rejected with 400**, never executed as `id: { in: [] }`. ✅
4. **`OR` condition** — `companyId` and `branchId` are **plain scalar FK columns**;
   the `company` / `branch` relations are separate fields on the model. A scalar filter
   is therefore correct and **no relation-filter rewrite was needed.** ✅
5. **Status filter** — already correct, and already centralised. `utils/employeeStatus.js`
   exports `OFFBOARDED_STATUSES = ['Offboarded','Archived','Resigned','Terminated','Inactive']`
   — exactly the five values in the brief. Nothing hardcoded, nothing added. ✅
6. **Defensive validation** — added, with dev-only logging of discarded ids. ✅

---

## 4. What changed

**New — `backend/src/utils/numericId.js`**
`toPositiveInt(v)` → a positive integer or `undefined` (rejects blank, `null`, `NaN`,
non-integers, zero, negatives, booleans and objects — `Number(true) === 1` would
otherwise smuggle in a fake id). `toPositiveIntList(v)` → `{ ids, rejected }`, de-duplicated,
*returning* what it discarded so a dropped id is never silently swallowed.
Kept separate from the existing `utils/idParam.js`, which is deliberately forgiving
(it returns non-numeric input unchanged) and so cannot be used to reject bad input.

**`backend/src/controllers/payrollController.js`**

| Handler | Change |
|---|---|
| `generate` | `companyId` / `branchId` parsed to Int before any Prisma call. A supplied-but-invalid id → `400 INVALID_COMPANY_ID` / `INVALID_BRANCH_ID`. |
| `generate` | `employeeIds` sanitised; non-array → `400 INVALID_EMPLOYEE_IDS`; empty-after-cleaning → `400 NO_VALID_EMPLOYEE_IDS`; discarded ids logged outside production. |
| `recalculate` | Same sanitising for `req.body.ids` (identical defect class — the ids go into `{ in: [...] }` next to an `OR`), and `Number(req.body.companyId)` no longer relays `NaN` to Prisma. |

Nothing else was touched: the salary formula, proration, attendance recompute, loan hook,
the `OR` fallback that also matches a branch id passed as `companyId`, the upsert keys,
and the approval workflow are all unchanged.

### One behaviour change, deliberate

`employeeIds: []` previously fell through the `length > 0` guard and generated payroll for
**the entire company**. An explicit empty selection now returns `400`. Bulk mode is still
available by omitting the field, which is how the "all employees" path already works — the
UI always sends a populated array (`Payroll.tsx:1079`) and guards against an empty selection
before calling, so no working flow changes.

---

## 5. Verification

`backend/scripts/verifyPayrollGenerateIds.js` — scratch tenant, self-cleaning: **43 passed, 0 failed.**

| Scenario | Result |
|---|---|
| All employees (bulk) | ✅ |
| Selected employees — numeric **and** string ids | ✅ |
| By branch (`branchId` as a string) | ✅ |
| By company (`companyId` as a string — the reported failure) | ✅ 201 |
| Empty employee selection | ✅ 400, and did **not** widen to the whole company |
| Archived / Offboarded / Resigned / Terminated / Inactive | ✅ all five excluded |
| Company Head | ✅ |
| HR | ✅ |
| 705 employees | ✅ 201 in 32.0s, one row each, no duplicates |
| Re-generation ×3 | ✅ row count unchanged, zero duplicate employee rows |
| Invalid ids (`'abc'`, `0`, `-5`, `1.5`, `'xyz'`, non-array) | ✅ clean 400, never a 500, no raw Prisma text |

Live HTTP test through the running server (real login, real RBAC, the exact client payload):
**10 passed, 0 failed.**

Pipeline regressions, all green: net = basic + allowances + bonus − deductions holds;
status stays `pending_approval`/`pending`; attendance summaries computed; period totals
recomputed from child rows. `verifyOvertimePayroll` 29/29, `verifyAttendanceSummaryOvertime`
9/9, `verifyPayloadSlimming` 13/13.

**Isolation:** real payroll rows 7260 → 7260 across every test; zero scratch rows,
employees, or period records left behind.

---

## 6. Notes

- **The frontend was left alone.** Sending an Int from `Payroll.tsx` would also fix this
  one call, but the server must not depend on a client sending the right JSON type — the
  same string would still arrive from any other caller. The server-side parse is the fix;
  a frontend change would only be cosmetic.
- **Pre-existing gap, not fixed (flagging, not silently changing):** on the branch path,
  `branchPayroll.create` requires `companyId`, so a branch-only generate for a period that
  does not yet exist would fail with Prisma's "Argument `companyId` is missing". No current
  UI path reaches it — `Payroll.tsx` never sends `branchId` — so I did not add a new
  required-field rule that could reject a request that works today via the `update` branch
  of the upsert.
- **Unrelated observation:** 4 payroll rows were created in companies 1 and 11 at 12:58 and
  13:04 today by app activity in your browser, not by these tests. All test data used
  company ids ≥ 999931 and year 2031, and all of it was removed.
