/**
 * attendanceMatcher — the single, reusable safety layer that decides whether a
 * device punch may become attendance. Phase 5 sync MUST route every punch
 * through resolvePunch() before creating anything.
 *
 * Matching contract (enforced here, nowhere else):
 *   RULE 4 — match by identifier, in PRIORITY order, within the company:
 *              1) (companyId + Employee Code)   → matched by employee code
 *              2) (companyId + Biometric Code)  → matched by biometric code
 *            Never by internal id / name / email. Either identifier alone is enough
 *            (Employee-Code-only, Biometric-only, or both — code wins on both).
 *   RULE 5 — company (+ optional branch) isolation: a punch is only ever matched
 *            within its own company, so Company A can never resolve to a Company B
 *            employee. When a branchId is supplied, matching is confined to it.
 *   RULE 1 — blank biometric code AND no employee code -> NO_BIOMETRIC_CODE.
 *   RULE 2 — no employee matches either identifier      -> UNMATCHED (park in queue).
 *   RULE 3 — >1 employee share the SAME code            -> DUPLICATE_CODE (block).
 *   otherwise                                           -> MATCHED (safe to import).
 *
 * This module NEVER creates attendance. It only returns a verdict.
 */
const STATUS = Object.freeze({
  MATCHED: 'MATCHED',
  NO_BIOMETRIC_CODE: 'NO_BIOMETRIC_CODE',
  UNMATCHED: 'UNMATCHED',
  DUPLICATE_CODE: 'DUPLICATE_CODE',
  COMPANY_MISSING: 'COMPANY_MISSING',
});

// A non-MATCHED, non-COMPANY_MISSING verdict belongs in the unmatched queue.
const QUEUEABLE = new Set([STATUS.NO_BIOMETRIC_CODE, STATUS.UNMATCHED, STATUS.DUPLICATE_CODE]);

// Normalise an identifier: coerce to string + trim outer whitespace. Leading
// zeros and internal characters are PRESERVED (codes are matched as strings, so
// "0113" stays "0113" and "PM-HQ-0001" stays intact) — only accidental
// surrounding whitespace / non-string types are cleaned up.
const normId = (v) => (v == null ? '' : String(v).trim());

// Employee fields returned on a verdict (never id/name/email used FOR matching).
const EMP_SELECT = { id: true, employeeId: true, name: true, companyId: true, branchId: true, biometricId: true };

/**
 * Resolve a single punch to an employee, applying RULES 1–5.
 *
 * Accepts BOTH identifiers — Employee Code is tried first, then Biometric Code —
 * so a file exported with employee codes, biometric ids, or both all resolve.
 *
 * @param {object} prisma
 * @param {object} args
 * @param {number|string} args.companyId   required — RULE 5 isolation anchor
 * @param {string} [args.biometricCode]    the device / biometric id
 * @param {string} [args.employeeCode]     the Employee Code (employeeId)
 * @param {number|string} [args.branchId]  optional — confine matching to a branch
 * @param {boolean} [args.debug]           when true, log every lookup step
 * @param {string|number} [args.rowLabel]  row/label for the debug log
 * @returns {Promise<{status:string, message:string, matchedBy?:string, employee?:object, candidates?:object[]}>}
 */
async function resolvePunch(prisma, { companyId, biometricCode, employeeCode, branchId, debug, rowLabel } = {}) {
  // Company is mandatory — without it RULE 5 isolation cannot be guaranteed.
  if (!companyId) {
    return { status: STATUS.COMPANY_MISSING, message: 'Company is required for attendance matching.' };
  }

  const bio = normId(biometricCode);
  const empCode = normId(employeeCode);

  // RULE 5 — company (+ optional branch) isolation. Every lookup below is scoped
  // to this base filter, so a punch can never resolve to another company's (or,
  // when a branch is selected, another branch's) employee.
  const scope = { companyId };
  if (branchId != null && String(branchId).trim() !== '') scope.branchId = Number(branchId) || branchId;

  const log = (...a) => { if (debug) console.log(`[attendanceMatcher]${rowLabel != null ? ` Row ${rowLabel}` : ''}`, ...a); };
  log(`Employee Code: ${empCode || '—'} | Biometric Code: ${bio || '—'}`);

  // ── PRIORITY 1 — Employee Code (companyId + employeeId) ──────────────────────
  if (empCode) {
    log('Searching by Employee Code…');
    const byCode = await prisma.employee.findMany({ where: { ...scope, employeeId: empCode }, select: EMP_SELECT });
    if (byCode.length > 1) {
      // Duplicate employee code within the company — block (RULE 3, code variant).
      log(`Status: DUPLICATE_CODE — ${byCode.map(m => m.employeeId).join(', ')}`);
      return {
        status: STATUS.DUPLICATE_CODE, matchedBy: 'employeeCode',
        message: `Multiple employees in this company share Employee Code "${empCode}" (${byCode.map(m => m.employeeId).join(', ')}). Attendance import blocked until resolved.`,
        candidates: byCode,
      };
    }
    if (byCode.length === 1) {
      log(`Matched Employee: ${byCode[0].employeeId} | Status: MATCHED`);
      return { status: STATUS.MATCHED, matchedBy: 'employeeCode', message: 'Matched by Employee Code.', employee: byCode[0] };
    }
    log('Employee Code not found — falling back to Biometric Code…');
  }

  // ── PRIORITY 2 — Biometric Code (companyId + biometricId) ────────────────────
  // RULE 1 — a blank biometric code is only a NO_BIOMETRIC_CODE error when there
  // was ALSO no employee code to try (preserves the original behaviour). If an
  // employee code was supplied but didn't match, this is simply UNMATCHED.
  if (!bio) {
    if (empCode) {
      log('Status: UNMATCHED — Employee not found in current company.');
      return { status: STATUS.UNMATCHED, message: 'No employee matched by Employee Code or Biometric Code in the current company.' };
    }
    log('Status: NO_BIOMETRIC_CODE');
    return { status: STATUS.NO_BIOMETRIC_CODE, message: 'Employee biometric code not configured.' };
  }

  log('Searching by Biometric Code…');
  const byBio = await prisma.employee.findMany({ where: { ...scope, biometricId: bio }, select: EMP_SELECT });

  // RULE 3 — duplicate biometric code within the same company.
  if (byBio.length > 1) {
    log(`Status: DUPLICATE_CODE — ${byBio.map(m => m.employeeId).join(', ')}`);
    return {
      status: STATUS.DUPLICATE_CODE, matchedBy: 'biometricCode',
      message: `Multiple employees in this company share biometric code "${bio}" (${byBio.map(m => m.employeeId).join(', ')}). Attendance import blocked until resolved.`,
      candidates: byBio,
    };
  }

  // RULE 2 — no match on either identifier.
  if (byBio.length === 0) {
    log('Status: UNMATCHED — Employee not found in current company.');
    return { status: STATUS.UNMATCHED, message: 'No employee matched by Employee Code or Biometric Code in the current company.' };
  }

  log(`Matched Employee: ${byBio[0].employeeId} | Status: MATCHED`);
  return { status: STATUS.MATCHED, matchedBy: 'biometricCode', message: 'Matched by Biometric Code.', employee: byBio[0] };
}

module.exports = { resolvePunch, STATUS, QUEUEABLE };
