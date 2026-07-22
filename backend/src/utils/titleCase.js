/**
 * The naming standard for master data — server side.
 *
 * MUST stay in step with frontend/src/utils/titleCase.ts. Kept as a mirror rather
 * than shared because this repo has no shared package boundary (the same pattern
 * as fieldValidators.js ↔ fieldFormats.ts).
 *
 * Used to normalise values on WRITE so new records stop creating fresh casing
 * duplicates, and by scripts/normalizeMasterDataCasing.js to clean up existing
 * rows. Display formatting happens on the frontend.
 */

const ACRONYMS = new Set([
  'HR', 'IT', 'QA', 'QC', 'CEO', 'CFO', 'CTO', 'COO', 'MD', 'GM', 'VP', 'PA',
  'AHA', 'CCTV', 'CSSD', 'ECG', 'ECHO', 'ICU', 'NICU', 'OPD', 'IPD', 'OT',
  'MRI', 'CT', 'XRAY', 'ENT', 'EEG', 'EMG', 'CPR', 'RMO', 'ANM', 'GNM',
  'PF', 'ESI', 'ESIC', 'PT', 'TDS', 'GST', 'PAN', 'TAN', 'CIN', 'UAN', 'LWF',
  'IFSC', 'UPI', 'MSME', 'IEC', 'ISO', 'FSSAI', 'DSC', 'KYC', 'CTC', 'LOP',
  'ID', 'API', 'PDF', 'URL', 'SMS', 'OTP', 'NA', 'BSC', 'MSC', 'BA', 'MA',
]);

const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'via', 'with']);
const PREFIXED = /^(mc|mac|o')(.+)$/i;

const capitalise = (w) => {
  if (!w) return w;
  const i = w.search(/[A-Za-z]/);
  if (i < 0) return w;
  return w.slice(0, i) + w[i].toUpperCase() + w.slice(i + 1).toLowerCase();
};

function caseWord(word, isFirst) {
  if (!word) return word;
  for (const sep of ['-', '/', '.']) {
    if (word.includes(sep) && word.length > 1) {
      const parts = word.split(sep);
      if (sep === '.' && parts.every((p) => p.length <= 1)) return word.toUpperCase();
      return parts.map((p, i) => caseWord(p, isFirst && i === 0)).join(sep);
    }
  }
  const bare = word.replace(/[^A-Za-z0-9]/g, '');
  if (!bare) return word;
  if (ACRONYMS.has(bare.toUpperCase())) return word.replace(bare, bare.toUpperCase());
  if (/\d/.test(bare)) return word.toUpperCase() === word ? capitalise(word) : word;
  const m = word.match(PREFIXED);
  if (m) return capitalise(m[1]) + capitalise(m[2]);
  if (word.includes("'")) {
    const [head, ...rest] = word.split("'");
    if (head.length <= 2) return capitalise(head) + "'" + rest.map(capitalise).join("'");
  }
  if (!isFirst && MINOR.has(bare.toLowerCase())) return word.toLowerCase();
  return capitalise(word);
}

/** Render a master-data value in the application's standard casing. */
function titleCase(value) {
  const s = String(value === null || value === undefined ? '' : value).trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s.split(' ').map((w, i) => caseWord(w, i === 0)).join(' ');
}

/** The key two values are considered the same entity by (case/space insensitive). */
const normalizeKey = (value) =>
  String(value === null || value === undefined ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');

/** Case-insensitive, whitespace-tolerant equality. */
const sameValue = (a, b) => normalizeKey(a) === normalizeKey(b);

module.exports = { titleCase, normalizeKey, sameValue, ACRONYMS };
