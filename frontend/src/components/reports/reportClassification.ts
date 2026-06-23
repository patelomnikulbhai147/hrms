// ─────────────────────────────────────────────────────────────────────────────
// Report classification: STATUTORY (legally prescribed — must stay unchanged) vs
// INTERNAL business report (approved for enterprise modernization).
//
// Statutory reports keep their existing compliant layout (plain register/table or
// the faithful government template). Internal reports render through the modern
// BusinessReportView. This is PRESENTATION ONLY — it never changes the data, the
// generation logic, calculations, exports, permissions, or the API.
// ─────────────────────────────────────────────────────────────────────────────

// Whole categories that are statutory by nature — never modernized.
const STATUTORY_CATEGORIES = new Set<string>([
  'Compliance Reports',
  'Statutory Registers',
  'PF Reports',
  'ESI Reports',
  'Tax Reports',            // Form 16 / TDS / Professional Tax / tax summaries
  'Gratuity & Settlement',  // gratuity is a prescribed computation
]);

// Specific reports that live in an otherwise-internal category but are themselves
// legally prescribed registers/formats (Wage/Salary Register, Muster Roll,
// Overtime Register, Bonus Register, statutory payslips, TDS slip).
const STATUTORY_KEYS = new Set<string>([
  'salary_register', 'salary_slip', 'salary_slip_tds',
  'muster_roll', 'overtime_register',
  'bonus_register', 'bonus_summary', 'bonus_payment',
]);

/** True when a report must keep its legally prescribed format (do not modernize). */
export function isStatutoryReport(key?: string, category?: string): boolean {
  if (key && STATUTORY_KEYS.has(key)) return true;
  if (category && STATUTORY_CATEGORIES.has(category)) return true;
  return false;
}

/** Convenience inverse — an internal business report eligible for modernization. */
export const isBusinessReport = (key?: string, category?: string) => !isStatutoryReport(key, category);
