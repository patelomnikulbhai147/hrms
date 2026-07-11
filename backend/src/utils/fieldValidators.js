/**
 * fieldValidators — the BACKEND mirror of frontend/src/utils/fieldFormats.ts.
 *
 * "Never trust the client." Every API that accepts identity / tax / banking /
 * statutory fields should normalise + validate through here so the same rules are
 * enforced server-side, and free text is sanitised against XSS / HTML / control
 * chars. Blank optional fields pass (backward compatible — existing records with
 * empty fields keep saving); only a clearly malformed value is rejected.
 *
 * API:
 *   sanitizeText(v)                 → trimmed, de-emojied, tag-stripped string
 *   normalizeField(type, v)         → the RAW value to persist (mask stripped)
 *   validateField(type, v)          → { valid, error, normalized }
 *   validateFields({name:{type,value,required,label}}) → { valid, errors, values }
 */

const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const alnumUpper = (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
const isBlank = (v) => String(v == null ? '' : v).trim() === '';
const ok = (normalized) => ({ valid: true, error: '', normalized });
const bad = (error, normalized) => ({ valid: false, error, normalized });

const CONTROL_CHARS = /[\x00-\x1F\x7F]/g; // eslint-disable-line no-control-regex
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;

/** Strip control chars, HTML/script tags, emojis; collapse whitespace; trim. */
function sanitizeText(v) {
  return String(v == null ? '' : v)
    .replace(CONTROL_CHARS, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')            // HTML/script tags (XSS guard)
    .replace(EMOJI, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const GST_STATE_CODES = new Set([
  ...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0')), '97', '99',
]);

function luhnValid(num) {
  const d = digits(num);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

// type → { normalize, test(raw)->bool, error }
const RULES = {
  aadhaar: { normalize: (v) => digits(v).slice(0, 12), test: (r) => /^\d{12}$/.test(r), error: 'Aadhaar must be exactly 12 digits.' },
  pan: { normalize: (v) => alnumUpper(v).slice(0, 10), test: (r) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(r), error: 'Invalid PAN (e.g. ABCDE1234F).' },
  passport: { normalize: (v) => alnumUpper(v).slice(0, 8), test: (r) => /^[A-Z][0-9]{7}$/.test(r), error: 'Passport must be 1 letter + 7 digits.' },
  drivingLicense: { normalize: (v) => alnumUpper(v).slice(0, 16), test: (r) => /^[A-Z]{2}[0-9]{2}[0-9]{4,12}$/.test(r) && r.length >= 15, error: 'Invalid Driving License.' },
  voterId: { normalize: (v) => alnumUpper(v).slice(0, 10), test: (r) => /^[A-Z]{3}[0-9]{7}$/.test(r), error: 'Voter ID must be 3 letters + 7 digits.' },

  gst: { normalize: (v) => alnumUpper(v).slice(0, 15), test: (r) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(r) && GST_STATE_CODES.has(r.slice(0, 2)), error: 'Invalid GST number (e.g. 24ABCDE1234F1Z5).' },
  cin: { normalize: (v) => alnumUpper(v).slice(0, 21), test: (r) => /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(r), error: 'Invalid CIN (21 chars).' },
  tan: { normalize: (v) => alnumUpper(v).slice(0, 10), test: (r) => /^[A-Z]{4}[0-9]{5}[A-Z]$/.test(r), error: 'Invalid TAN (e.g. ABCD12345E).' },
  uan: { normalize: (v) => digits(v).slice(0, 12), test: (r) => /^[0-9]{12}$/.test(r), error: 'UAN must be exactly 12 digits.' },
  esic: { normalize: (v) => digits(v).slice(0, 17), test: (r) => /^[0-9]{17}$/.test(r), error: 'ESIC number must be exactly 17 digits.' },
  pf: { normalize: (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9/-]/g, '').slice(0, 30), test: (r) => /^[A-Z0-9/-]{5,30}$/.test(r), error: 'Invalid PF code.' },
  professionalTax: { normalize: (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9/-]/g, '').slice(0, 20), test: (r) => /^[A-Z0-9/-]{5,20}$/.test(r), error: 'Invalid Professional Tax number.' },
  shopEstablishment: { normalize: (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9/-]/g, '').slice(0, 25), test: (r) => /^[A-Z0-9/-]{4,25}$/.test(r), error: 'Invalid Shop & Establishment number.' },
  msme: { normalize: (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16), test: (r) => /^UDYAM[A-Z]{2}[0-9]{2}[0-9]{7}$/.test(r), error: 'Invalid UDYAM (e.g. UDYAM-GJ-01-0000001).' },
  iec: { normalize: (v) => alnumUpper(v).slice(0, 10), test: (r) => /^[A-Z0-9]{10}$/.test(r), error: 'IEC must be 10 characters.' },
  gstStateCode: { normalize: (v) => digits(v).slice(0, 2), test: (r) => GST_STATE_CODES.has(r.padStart(2, '0')), error: 'Invalid GST state code.' },

  bankAccount: { normalize: (v) => digits(v).slice(0, 18), test: (r) => /^[0-9]{9,18}$/.test(r), error: 'Account number must be 9-18 digits.' },
  ifsc: { normalize: (v) => alnumUpper(v).slice(0, 11), test: (r) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(r), error: 'Invalid IFSC (e.g. SBIN0001234).' },
  micr: { normalize: (v) => digits(v).slice(0, 9), test: (r) => /^[0-9]{9}$/.test(r), error: 'MICR must be exactly 9 digits.' },
  cheque: { normalize: (v) => digits(v).slice(0, 6), test: (r) => /^[0-9]{6}$/.test(r), error: 'Cheque number must be exactly 6 digits.' },
  creditCard: { normalize: (v) => digits(v).slice(0, 19), test: (r) => luhnValid(r), error: 'Invalid card number (failed Luhn check).' },

  mobile: { normalize: (v) => { const d = digits(v); return d.length > 10 ? d.slice(-10) : d; }, test: (r) => /^[6-9][0-9]{9}$/.test(r), error: 'Mobile must be 10 digits starting 6-9.' },
  telephone: { normalize: (v) => String(v == null ? '' : v).replace(/[^0-9-]/g, '').slice(0, 15), test: (r) => /^[0-9]{2,5}-?[0-9]{6,8}$/.test(r), error: 'Invalid telephone (e.g. 079-26543210).' },
  email: { normalize: (v) => String(v == null ? '' : v).toLowerCase().replace(/\s/g, ''), test: (r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r), error: 'Invalid email format.' },
  website: { normalize: (v) => String(v == null ? '' : v).trim().replace(/\s/g, ''), test: (r) => /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/.test(r), error: 'Invalid website.' },
  pincode: { normalize: (v) => digits(v).slice(0, 6), test: (r) => /^[1-9][0-9]{5}$/.test(r), error: 'Invalid PIN code (6 digits).' },

  employeeCode: { normalize: (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20), test: (r) => /^[A-Z0-9-]+$/.test(r), error: 'Employee Code: letters, digits and hyphens only.' },
  companyCode: { normalize: (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15), test: (r) => /^[A-Z0-9]+$/.test(r), error: 'Company Code: uppercase letters and digits only.' },
  branchCode: { normalize: (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15), test: (r) => /^[A-Z0-9]+$/.test(r), error: 'Branch Code: uppercase letters and digits only.' },

  salary: { normalize: (v) => String(v == null ? '' : v).replace(/[^0-9.]/g, ''), test: (r) => /^\d+(\.\d{1,2})?$/.test(r), error: 'Amount: numbers only, max 2 decimals, no negatives.' },
  percentage: { normalize: (v) => String(v == null ? '' : v).replace(/[^0-9.]/g, ''), test: (r) => /^\d+(\.\d+)?$/.test(r) && parseFloat(r) >= 0 && parseFloat(r) <= 100, error: 'Percentage must be between 0 and 100.' },
  integer: { normalize: (v) => digits(v), test: (r) => /^\d+$/.test(r), error: 'Whole numbers only.' },
  numeric: { normalize: (v) => String(v == null ? '' : v).replace(/[^0-9.]/g, ''), test: (r) => /^\d+(\.\d+)?$/.test(r), error: 'Numbers only.' },

  name: { normalize: (v) => sanitizeText(v).replace(/[^a-zA-Z\s.'-]/g, ''), test: (r) => /^[a-zA-Z\s.'-]+$/.test(r.trim()), error: "Only letters, spaces, . ' and - allowed." },
  text: { normalize: (v) => sanitizeText(v), test: () => true, error: '' },
};

function normalizeField(type, value) {
  const rule = RULES[type];
  return rule ? rule.normalize(value) : sanitizeText(value);
}

function validateField(type, value) {
  const rule = RULES[type];
  if (!rule) return ok(sanitizeText(value));
  const normalized = rule.normalize(value);
  if (isBlank(normalized)) return ok(normalized);           // optional-blank passes
  return rule.test(normalized) ? ok(normalized) : bad(rule.error, normalized);
}

/**
 * Validate a batch and get back cleaned values + per-field errors.
 * @param fields { name: { type, value, required?, label? } }
 */
function validateFields(fields) {
  const errors = {};
  const values = {};
  for (const [name, f] of Object.entries(fields || {})) {
    const res = validateField(f.type, f.value);
    values[name] = res.normalized;
    if (f.required && isBlank(res.normalized)) errors[name] = `${f.label || name} is required.`;
    else if (!res.valid) errors[name] = res.error;
  }
  return { valid: Object.keys(errors).length === 0, errors, values };
}

module.exports = { sanitizeText, normalizeField, validateField, validateFields, luhnValid, RULES };
