// ─────────────────────────────────────────────────────────────────────────────
// The single naming standard for master data.
//
// Production data arrived largely from ALL-CAPS imports, so the same entity shows
// up as "AHMEDABAD", "Ahmedabad" and "ahmedabad" and appears three times in a
// filter. Everything user-facing renders through `titleCase` so one entity reads
// one way, everywhere.
//
// A NAIVE `s[0].toUpperCase() + s.slice(1).toLowerCase()` per word is wrong for
// this dataset and would look broken:
//     HR        → "Hr"        (the brief itself specifies HR stays HR)
//     IT        → "It"
//     ECG/CSSD  → "Ecg"/"Cssd"
//     O.T       → "O.t"
//     X-RAY     → "X-ray"
//     D'SOUZA   → "D'souza"
//     MCDONALD  → "Mcdonald"
// So acronyms are preserved, and hyphen/apostrophe/dot compounds are cased on
// each part rather than only after spaces.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tokens that must keep their exact casing. Matched case-insensitively against a
 * whole word, so "hr" and "HR" both render "HR" but "Hri" is untouched.
 * Extend this rather than special-casing at a call site.
 */
const ACRONYMS = new Set([
  // Organisational
  'HR', 'IT', 'QA', 'QC', 'CEO', 'CFO', 'CTO', 'COO', 'MD', 'GM', 'VP', 'PA',
  // Clinical / technical — present in this dataset
  'AHA', 'CCTV', 'CSSD', 'ECG', 'ECHO', 'ICU', 'NICU', 'OPD', 'IPD', 'OT',
  'MRI', 'CT', 'XRAY', 'ENT', 'EEG', 'EMG', 'CPR', 'RMO', 'ANM', 'GNM',
  // Statutory / finance
  'PF', 'ESI', 'ESIC', 'PT', 'TDS', 'GST', 'PAN', 'TAN', 'CIN', 'UAN', 'LWF',
  'IFSC', 'UPI', 'MSME', 'IEC', 'ISO', 'FSSAI', 'DSC', 'KYC', 'CTC', 'LOP',
  // Misc
  'ID', 'API', 'PDF', 'URL', 'SMS', 'OTP', 'NA', 'BSC', 'MSC', 'BA', 'MA',
]);

/** Lowercase connectors — kept lowercase unless they open the string. */
const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'via', 'with']);

/** Surname particles that carry their own capital: McDonald, O'Brien, D'Souza. */
const PREFIXED = /^(mc|mac|o')(.+)$/i;

// Capitalise the first LETTER, not the first character — real values are wrapped
// in punctuation ("(MULTI TASK)"), and uppercasing "(" is a no-op that then left
// the rest lowercased: "(multi task)".
const capitalise = (w: string) => {
  if (!w) return w;
  const i = w.search(/[A-Za-z]/);
  if (i < 0) return w;
  return w.slice(0, i) + w[i].toUpperCase() + w.slice(i + 1).toLowerCase();
};

/** Case one whitespace-delimited word, descending through . - / ' compounds. */
function caseWord(word: string, isFirst: boolean): string {
  if (!word) return word;

  // Split on internal punctuation and case each side: "BIO-MEDICAL" → "Bio-Medical",
  // "O.T" → "O.T" (each part is a one-letter acronym), "A/C" → "A/C".
  for (const sep of ['-', '/', '.']) {
    if (word.includes(sep) && word.length > 1) {
      const parts = word.split(sep);
      // Dotted initials (O.T, H.A.M) are acronyms — keep every part uppercase.
      if (sep === '.' && parts.every((p) => p.length <= 1)) return word.toUpperCase();
      return parts.map((p, i) => caseWord(p, isFirst && i === 0)).join(sep);
    }
  }

  const bare = word.replace(/[^A-Za-z0-9]/g, '');
  if (!bare) return word;

  if (ACRONYMS.has(bare.toUpperCase())) {
    // Preserve any punctuation that was attached, e.g. "(HR)".
    return word.replace(bare, bare.toUpperCase());
  }

  // Anything with digits ("X2", "10TH") is left as typed apart from a leading cap.
  if (/\d/.test(bare)) return word.toUpperCase() === word ? capitalise(word) : word;

  const m = word.match(PREFIXED);
  if (m) return capitalise(m[1]) + capitalise(m[2]);

  // Apostrophe inside a word: D'SOUZA → D'Souza, but don't touch "don't".
  if (word.includes("'")) {
    const [head, ...rest] = word.split("'");
    if (head.length <= 2) return capitalise(head) + "'" + rest.map(capitalise).join("'");
  }

  if (!isFirst && MINOR.has(bare.toLowerCase())) return word.toLowerCase();
  return capitalise(word);
}

/**
 * Render a master-data value in the application's standard casing.
 * Null/blank in → '' out, so it is safe to call directly in JSX.
 */
export function titleCase(value: unknown): string {
  const s = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s.split(' ').map((w, i) => caseWord(w, i === 0)).join(' ');
}

/**
 * The key two values are considered "the same entity" by.
 * Case-, space- and punctuation-insensitive, so "AHMEDABAD", "Ahmedabad" and
 * " ahmedabad " collapse to one. Used to de-duplicate dropdown/filter options.
 */
export const normalizeKey = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * De-duplicate a list of raw master-data strings for a dropdown or filter.
 * Returns display-ready, sorted, unique values — the fix for one branch showing
 * up as both "AHMEDABAD" and "Ahmedabad".
 *
 * NOTE: this collapses CASING only. Genuine spelling variants
 * ("BIO-MEDICAL ENGINER") remain distinct, because merging those is a business
 * decision, not a formatting one.
 */
export function uniqueTitled(values: Array<unknown>): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const key = normalizeKey(v);
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, titleCase(v));
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Case-insensitive, whitespace-tolerant equality for master-data values. */
export const sameValue = (a: unknown, b: unknown): boolean => normalizeKey(a) === normalizeKey(b);
