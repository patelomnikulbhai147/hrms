/**
 * Aadhaar & PAN display/validation helpers.
 *
 * Principle: STORE RAW, DISPLAY FORMATTED. The database keeps the unformatted
 * value (e.g. "567238580931" / "ABCDE1234F"). Aadhaar is shown spaced
 * ("5672 3858 0931"); PAN is shown EXACTLY as stored, uppercase with NO spaces
 * ("ABCDE1234F"). Use the raw* helpers to normalise what gets stored.
 */

// ── Aadhaar ─────────────────────────────────────────────────────────────────
/** Strip to digits only, max 12 — the value to persist. */
export const rawAadhaar = (v?: string | null): string =>
  String(v ?? '').replace(/\D/g, '').slice(0, 12);

/** Group into 4-4-4 for display: "5672 3858 0931". Works for partial input too. */
export const formatAadhaar = (v?: string | null): string =>
  rawAadhaar(v).replace(/(\d{4})(?=\d)/g, '$1 ').trim();

/** Exactly 12 digits. */
export const isValidAadhaar = (v?: string | null): boolean =>
  /^\d{12}$/.test(rawAadhaar(v));

// ── PAN ─────────────────────────────────────────────────────────────────────
/** Uppercase, alphanumeric only, max 10 — the value to persist. */
export const rawPan = (v?: string | null): string =>
  String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

/**
 * PAN is displayed EXACTLY as stored — uppercase, NO spaces: "ABCDE1234F".
 * (Spacing is applied to Aadhaar only.) Kept as a function so callers can format
 * PAN uniformly without special-casing.
 */
export const formatPan = (v?: string | null): string => rawPan(v);

/** Pattern [A-Z]{5}[0-9]{4}[A-Z]{1}. */
export const isValidPan = (v?: string | null): boolean =>
  /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(rawPan(v));

export const AADHAAR_ERROR = 'Please enter a valid 12-digit Aadhar Number.';
export const PAN_ERROR = 'Please enter a valid PAN Number.';
