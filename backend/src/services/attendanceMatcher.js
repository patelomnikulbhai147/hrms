/**
 * attendanceMatcher — the single, reusable safety layer that decides whether a
 * device punch may become attendance. Phase 5 sync MUST route every punch
 * through resolvePunch() before creating anything.
 *
 * Matching contract (enforced here, nowhere else):
 *   RULE 4 — match ONLY by (companyId + biometricCode). Never employeeId/name/email.
 *   RULE 5 — company isolation: a punch is only ever matched within its own
 *            company, so Company A can never resolve to a Company B employee.
 *   RULE 1 — blank biometric code  -> NO_BIOMETRIC_CODE (do not import).
 *   RULE 2 — no employee matches    -> UNMATCHED (park in the queue).
 *   RULE 3 — >1 employee same code  -> DUPLICATE_CODE (block + log error).
 *   otherwise                       -> MATCHED (safe to import in Phase 5).
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

/**
 * Resolve a single punch to an employee, applying RULES 1–5.
 * @returns {Promise<{status:string, message:string, employee?:object, candidates?:object[]}>}
 */
async function resolvePunch(prisma, { companyId, biometricCode }) {
  // Company is mandatory — without it RULE 5 isolation cannot be guaranteed.
  if (!companyId) {
    return { status: STATUS.COMPANY_MISSING, message: 'Company is required for attendance matching.' };
  }
  const code = biometricCode == null ? '' : String(biometricCode).trim();

  // RULE 1 — blank biometric code.
  if (!code) {
    return { status: STATUS.NO_BIOMETRIC_CODE, message: 'Employee biometric code not configured.' };
  }

  // RULE 4 + RULE 5 — match strictly by companyId + biometricId (the Biometric
  // Code), scoped to this company only. Employee ID / name / email are never used.
  const matches = await prisma.employee.findMany({
    where: { companyId, biometricId: code },
    select: { id: true, employeeId: true, name: true, companyId: true },
  });

  // RULE 3 — duplicate code within the same company.
  if (matches.length > 1) {
    return {
      status: STATUS.DUPLICATE_CODE,
      message: `Multiple employees in this company share biometric code "${code}" (${matches.map(m => m.employeeId).join(', ')}). Attendance import blocked until resolved.`,
      candidates: matches,
    };
  }

  // RULE 2 — no match.
  if (matches.length === 0) {
    return { status: STATUS.UNMATCHED, message: `No employee in this company has biometric code "${code}".` };
  }

  return { status: STATUS.MATCHED, message: 'Matched.', employee: matches[0] };
}

module.exports = { resolvePunch, STATUS, QUEUEABLE };
