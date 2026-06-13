# Employee Data-Integrity Audit & Cleanup Report
Date: 2026-06-12

## 1. ID system findings (no action needed)
- **All 841 employees already used a consistent code** (`VE-<BRANCH>-####` / `EMP-HP-##`). **No UUIDs and no `a4/a5` values** were present in the `employeeId` column. The legacy values (`a4`, UUIDs) had already been migrated out in a prior pass; `legacyEmployeeId` retains the original Excel codes for traceability.

### `employeeId` semantics (clarified)
| Column | Type | Role |
|---|---|---|
| `id` | `Int @id @default(autoincrement())` | **Internal primary key. The real foreign-key target** — Payroll, Attendance, LeaveRequest, Overtime all reference `Employee.id`. |
| `employeeId` | `String @unique` | **Employee code/number** (e.g. `VE-AHMD-0001`). A business identifier, already DB-unique. **Not** a branch reference, **not** a foreign key. |
| `branchId` | `Int?` | The branch reference (FK → Branch.id). |

Schema was already correct; no schema change required.

## 2. Duplicates found (6 records)
Detected using Company + Branch + Name + Mobile + Email + Code.

### Confirmed duplicate pairs — MERGED (kept Ahmedabad / original)
| Person | Kept (survivor) | Deleted (duplicate) | Matched on |
|---|---|---|---|
| PRAJAPATI POOJA RAMANIKBHAI | VE-AHMD-0193 (Ahmedabad) | VE-SIDD-0016 (Siddhpur) | name + mobile |
| PRANALI JATINKUMAR MANDANKA | VE-AHMD-0292 (Ahmedabad) | VE-AHMD-0766 (Ahmedabad) | mobile + name (reordered/spelling) |
| JADAV BHAVIKABEN BATUKBHAI | VE-AHMD-0563 (Ahmedabad) | VE-BHAV-0009 (Bhavnagar) | name + mobile |

For each merge, child records were re-pointed to the survivor; a duplicate payslip for an already-covered month was dropped (survivor's is authoritative):
- payroll re-pointed 0 / dropped 3, attendance re-pointed 5, leave re-pointed 2, overtime 0.

### Blank-name placeholder rows — DELETED
| Code | Name | Notes |
|---|---|---|
| VE-AHMD-0615 | "-" | no phone/payroll; 2 orphan attendance rows cascade-deleted |
| VE-AHMD-0697 | "-" | no phone/payroll; 2 orphan attendance rows cascade-deleted |

### NOT duplicates (intentionally kept) — shared phone, different people
- GAL VAISHALI MERAMANBHAI (VE-AHMD-0448) & BARAD URVISHA KESHUBHAI (VE-AHMD-0581) — two numbers in one field.
- PATANI VISHAL PRAVINBHAI (VE-AHMD-0545) & PATANI DIPALIBEN PRAVINBHAI (VE-AHMD-0546) — siblings/spouse sharing contact numbers.

These prove mobile number is unreliable as a standalone duplicate key, which shaped the prevention rule below.

## 3. Before / after counts
| Metric | Before | After |
|---|---|---|
| Employees | 841 | **836** |
| Payroll | 826 | 823 |
| Attendance | 1612 | 1608 |
| Leave | 10 | 10 |
| Orphaned child records | — | **0** |

Per branch (after): C1 B3=777, B4=15, B5=22, B6=16 · C2 B7=3, B8=3 → sum **836 = total** ✓

## 4. Prevention (imports can no longer create duplicates)
New shared module `src/utils/employeeDedup.js` + guards wired into:
- **createEmployee** → returns **409** if the new record matches an existing one.
- **bulkCreate / import** → a matching row UPDATES the existing employee instead of inserting a second; intra-batch duplicates are collapsed. Response now returns `{ createdCount, mergedCount, merged[] }`.
- **updateEmployee** → rejects an edit that would turn a row into a duplicate of another.

**Duplicate rule:** same `employeeCode` **OR** same Company+Branch+Name **OR** same real Email **OR** (same Mobile **AND** same name-token-set). Mobile is corroborating-only so shared family numbers never cause a wrong merge.

## 5. Reversibility
Pre-mutation snapshot of all 8 affected employees + their payroll/attendance/leave saved to `scratch/dedupe-snapshot.json`.
