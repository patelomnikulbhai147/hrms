/**
 * fieldFormats — the SINGLE global registry of identity / tax / banking /
 * statutory field rules for the whole HRMS. One spec per field type describes:
 *   normalize(input) → the RAW value to STORE (strip formatting, cap length, case)
 *   format(raw)      → the DISPLAYED value (mask: Aadhaar 1234 5678 9012, etc.)
 *   validate(raw)    → { isValid, error } for real-time inline feedback
 *
 * Principle (matches idFormat.ts): STORE RAW, DISPLAY FORMATTED. Every form,
 * import, and the SmartInput component consume THIS registry — no field logic is
 * duplicated per form. The backend mirror is backend/src/utils/fieldValidators.js.
 *
 * Backward compatible: reuses the existing validation.ts / idFormat.ts validators
 * so older imports keep working and blank optional fields still save.
 */
import type { ValidationResult } from './validation';
import {
  validateGST, validatePAN, validateCIN, validateTAN, validateIFSC,
  validatePFCode, validateESICode, validateWebsite, validatePincode,
  validateEmail, validatePercentage,
} from './validation';
import { rawAadhaar, formatAadhaar, isValidAadhaar, rawPan } from './idFormat';

export type { ValidationResult };

export interface FieldSpec {
  label: string;
  example: string;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'decimal' | 'url';
  /** Raw value to persist (strip mask, apply case, cap length). */
  normalize: (input: string) => string;
  /** Display value (apply the visual mask). */
  format: (raw: string) => string;
  /** Real-time validation of the RAW value. Empty = valid (forms enforce required). */
  validate: (raw: string) => ValidationResult;
}

// ── shared primitives ────────────────────────────────────────────────────────
const OK: ValidationResult = { isValid: true, error: '' };
const err = (error: string): ValidationResult => ({ isValid: false, error });
const isBlank = (v: string) => v.trim() === '';
const digits = (v: string) => String(v ?? '').replace(/\D/g, '');
const alnumUpper = (v: string) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const collapse = (v: string) => String(v ?? '').replace(/\s+/g, ' ').trimStart();
/** Remove emojis / most non-printable pictographs (kept out of names & codes). */
const stripEmoji = (v: string) =>
  String(v ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, '');
const identity = (v: string) => String(v ?? '');

// Valid Indian GST state codes (01–38 + 97 Other Territory + 99 Centre).
const GST_STATE_CODES = new Set<string>([
  ...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0')), '97', '99',
]);

// Luhn check for card numbers.
function luhnValid(num: string): boolean {
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

const groupEvery = (v: string, size: number, sep = ' ') =>
  v.replace(new RegExp(`(.{${size}})(?=.)`, 'g'), `$1${sep}`);

// ── the registry ─────────────────────────────────────────────────────────────
export type FieldType =
  | 'aadhaar' | 'pan' | 'gst' | 'cin' | 'tan' | 'passport' | 'drivingLicense'
  | 'voterId' | 'uan' | 'esic' | 'pf' | 'professionalTax' | 'shopEstablishment'
  | 'msme' | 'iec' | 'bankAccount' | 'ifsc' | 'micr' | 'cheque' | 'creditCard'
  | 'mobile' | 'telephone' | 'email' | 'website' | 'pincode' | 'employeeCode'
  | 'companyCode' | 'branchCode' | 'gstStateCode' | 'salary' | 'percentage'
  | 'integer' | 'numeric' | 'name' | 'text';

export const FIELD_SPECS: Record<FieldType, FieldSpec> = {
  // ── Identity ──────────────────────────────────────────────────────────────
  aadhaar: {
    label: 'Aadhaar Number', example: '1234 5678 9012', inputMode: 'numeric',
    normalize: rawAadhaar, format: formatAadhaar,
    validate: (r) => isBlank(r) ? OK : (isValidAadhaar(r) ? OK : err('Aadhaar must be exactly 12 digits.')),
  },
  pan: {
    label: 'PAN', example: 'ABCDE1234F', inputMode: 'text',
    normalize: (v) => rawPan(v), format: (r) => rawPan(r),
    validate: validatePAN,
  },
  passport: {
    label: 'Passport Number', example: 'A1234567', inputMode: 'text',
    normalize: (v) => alnumUpper(v).slice(0, 8), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[A-Z][0-9]{7}$/.test(r) ? OK : err('Passport must be 1 letter + 7 digits (e.g. A1234567).')),
  },
  drivingLicense: {
    label: 'Driving License', example: 'GJ0120230001234', inputMode: 'text',
    normalize: (v) => alnumUpper(v).slice(0, 16), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[A-Z]{2}[0-9]{2}[0-9]{4,12}$/.test(r) && r.length >= 15 ? OK : err('Invalid Driving License (e.g. GJ0120230001234).')),
  },
  voterId: {
    label: 'Voter ID', example: 'ABC1234567', inputMode: 'text',
    normalize: (v) => alnumUpper(v).slice(0, 10), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[A-Z]{3}[0-9]{7}$/.test(r) ? OK : err('Voter ID must be 3 letters + 7 digits (e.g. ABC1234567).')),
  },

  // ── Tax / statutory ───────────────────────────────────────────────────────
  gst: {
    label: 'GST Number', example: '24ABCDE1234F1Z5', inputMode: 'text',
    normalize: (v) => alnumUpper(v).slice(0, 15), format: identity,
    validate: (r) => {
      if (isBlank(r)) return OK;
      const base = validateGST(r);
      if (!base.isValid) return base;
      if (!GST_STATE_CODES.has(r.slice(0, 2))) return err(`Invalid GST state code "${r.slice(0, 2)}".`);
      return OK;
    },
  },
  cin: {
    label: 'CIN', example: 'U72900GJ2022PTC123456', inputMode: 'text',
    normalize: (v) => alnumUpper(v).slice(0, 21), format: identity, validate: validateCIN,
  },
  tan: {
    label: 'TAN', example: 'ABCD12345E', inputMode: 'text',
    normalize: (v) => alnumUpper(v).slice(0, 10), format: identity, validate: validateTAN,
  },
  uan: {
    label: 'UAN', example: '100123456789', inputMode: 'numeric',
    normalize: (v) => digits(v).slice(0, 12), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[0-9]{12}$/.test(r) ? OK : err('UAN must be exactly 12 digits.')),
  },
  esic: {
    // The ESIC **IP number** is 10 digits. 17 digits is the challan number — a
    // different identifier — and requiring it made 827 of 828 production employee
    // records unsaveable. Mirrored in backend/src/utils/fieldValidators.js.
    label: 'ESIC IP Number', example: '3100012345', inputMode: 'numeric',
    normalize: (v) => digits(v).slice(0, 10), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[0-9]{10}$/.test(r) ? OK : err('ESIC IP number must be exactly 10 digits.')),
  },
  pf: {
    label: 'PF Number', example: 'GJAHM12345670000012345', inputMode: 'text',
    normalize: (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9/-]/g, '').slice(0, 30), format: identity,
    validate: validatePFCode,
  },
  professionalTax: {
    label: 'Professional Tax No.', example: 'PT-XX-0000000', inputMode: 'text',
    normalize: (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9/-]/g, '').slice(0, 20), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[A-Z0-9/-]{5,20}$/.test(r) ? OK : err('Invalid Professional Tax number.')),
  },
  shopEstablishment: {
    label: 'Shop & Establishment No.', example: 'GJ/SE/0000000', inputMode: 'text',
    normalize: (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9/-]/g, '').slice(0, 25), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[A-Z0-9/-]{4,25}$/.test(r) ? OK : err('Invalid Shop & Establishment number.')),
  },
  msme: {
    label: 'MSME / UDYAM', example: 'UDYAM-GJ-01-0000001', inputMode: 'text',
    normalize: (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16), // UDYAMGJ010000001
    format: (r) => {
      const s = String(r ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!s) return '';
      const body = s.replace(/^UDYAM/, '');
      const st = body.slice(0, 2), dd = body.slice(2, 4), num = body.slice(4, 11);
      return ['UDYAM', st, dd, num].filter(Boolean).join('-');
    },
    validate: (r) => {
      if (isBlank(r)) return OK;
      return /^UDYAM[A-Z]{2}[0-9]{2}[0-9]{7}$/.test(r) ? OK : err('Invalid UDYAM (e.g. UDYAM-GJ-01-0000001).');
    },
  },
  iec: {
    label: 'IEC Code', example: 'ABCDE1234F', inputMode: 'text',
    normalize: (v) => alnumUpper(v).slice(0, 10), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[A-Z0-9]{10}$/.test(r) ? OK : err('IEC must be 10 characters.')),
  },
  gstStateCode: {
    label: 'GST State Code', example: '24', inputMode: 'numeric',
    normalize: (v) => digits(v).slice(0, 2), format: identity,
    validate: (r) => isBlank(r) ? OK : (GST_STATE_CODES.has(r.padStart(2, '0')) ? OK : err('Invalid GST state code (01–38, 97, 99).')),
  },

  // ── Banking ───────────────────────────────────────────────────────────────
  bankAccount: {
    label: 'Bank Account Number', example: '000123456789', inputMode: 'numeric',
    normalize: (v) => digits(v).slice(0, 18), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[0-9]{9,18}$/.test(r) ? OK : err('Account number must be 9–18 digits.')),
  },
  ifsc: {
    label: 'IFSC Code', example: 'SBIN0001234', inputMode: 'text',
    normalize: (v) => alnumUpper(v).slice(0, 11), format: identity, validate: validateIFSC,
  },
  micr: {
    label: 'MICR Code', example: '400002003', inputMode: 'numeric',
    normalize: (v) => digits(v).slice(0, 9), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[0-9]{9}$/.test(r) ? OK : err('MICR must be exactly 9 digits.')),
  },
  cheque: {
    label: 'Cheque Number', example: '000123', inputMode: 'numeric',
    normalize: (v) => digits(v).slice(0, 6), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[0-9]{6}$/.test(r) ? OK : err('Cheque number must be exactly 6 digits.')),
  },
  creditCard: {
    label: 'Card Number', example: '1234 5678 9012 3456', inputMode: 'numeric',
    normalize: (v) => digits(v).slice(0, 19),
    format: (r) => groupEvery(digits(r).slice(0, 19), 4),
    validate: (r) => isBlank(r) ? OK : (luhnValid(r) ? OK : err('Invalid card number (failed Luhn check).')),
  },

  // ── Contact ───────────────────────────────────────────────────────────────
  mobile: {
    label: 'Mobile Number', example: '+91 9876543210', inputMode: 'tel',
    // Strip a RECOGNISED country/trunk prefix, then keep the first 10 digits.
    //
    // This used to keep the LAST 10 digits unconditionally, which quietly turned
    // a typo into a different, perfectly valid number: "98765432100" (one digit
    // too many) became "8765432100" and was accepted. Only +91/91 (12 digits) and
    // a 0 trunk (11 digits) are stripped now — any other overlong input is
    // truncated from the front, matching what typing into the capped field does.
    normalize: (v) => {
      let d = digits(v);
      if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
      else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
      return d.slice(0, 10);
    },
    format: (r) => { const d = digits(r).slice(0, 10); return d ? `+91 ${d}` : ''; },
    validate: (r) => isBlank(r) ? OK : (/^[6-9][0-9]{9}$/.test(r) ? OK : err('Mobile must be 10 digits starting 6–9.')),
  },
  telephone: {
    label: 'Telephone', example: '079-26543210', inputMode: 'tel',
    normalize: (v) => String(v ?? '').replace(/[^0-9-]/g, '').slice(0, 15), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[0-9]{2,5}-?[0-9]{6,8}$/.test(r) ? OK : err('Invalid telephone (e.g. 079-26543210).')),
  },
  email: {
    label: 'Email', example: 'name@company.com', inputMode: 'email',
    normalize: (v) => String(v ?? '').toLowerCase().replace(/\s/g, ''), format: identity,
    validate: validateEmail,
  },
  website: {
    label: 'Website', example: 'https://company.com', inputMode: 'url',
    normalize: (v) => String(v ?? '').trim().replace(/\s/g, ''), format: identity,
    validate: validateWebsite,
  },
  pincode: {
    label: 'PIN Code', example: '380001', inputMode: 'numeric',
    normalize: (v) => digits(v).slice(0, 6), format: identity, validate: validatePincode,
  },

  // ── Internal codes ────────────────────────────────────────────────────────
  employeeCode: {
    label: 'Employee Code', example: 'EMP0001', inputMode: 'text',
    normalize: (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[A-Z0-9-]+$/.test(r) ? OK : err('Employee Code: letters, digits and hyphens only, no spaces.')),
  },
  companyCode: {
    label: 'Company Code', example: 'CMP001', inputMode: 'text',
    normalize: (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[A-Z0-9]+$/.test(r) ? OK : err('Company Code: uppercase letters and digits only.')),
  },
  branchCode: {
    label: 'Branch Code', example: 'BR001', inputMode: 'text',
    normalize: (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[A-Z0-9]+$/.test(r) ? OK : err('Branch Code: uppercase letters and digits only.')),
  },

  // ── Numeric / money ───────────────────────────────────────────────────────
  salary: {
    label: 'Amount', example: '45000.50', inputMode: 'decimal',
    normalize: (v) => { const s = String(v ?? '').replace(/[^0-9.]/g, ''); const p = s.split('.'); return p.length > 2 ? `${p[0]}.${p.slice(1).join('')}`.replace(/(\.\d{2})\d+/, '$1') : s.replace(/(\.\d{2})\d+/, '$1'); },
    format: identity,
    validate: (r) => {
      if (isBlank(r)) return OK;
      if (!/^\d+(\.\d{1,2})?$/.test(r)) return err('Amount: numbers only, max 2 decimals, no negatives.');
      return OK;
    },
  },
  percentage: {
    label: 'Percentage', example: '12.5', inputMode: 'decimal',
    normalize: (v) => String(v ?? '').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'), format: identity,
    validate: (r) => isBlank(r) ? OK : validatePercentage(r),
  },
  integer: {
    label: 'Number', example: '10', inputMode: 'numeric',
    normalize: (v) => digits(v), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^\d+$/.test(r) ? OK : err('Whole numbers only.')),
  },
  numeric: {
    label: 'Number', example: '10.5', inputMode: 'decimal',
    normalize: (v) => String(v ?? '').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^\d+(\.\d+)?$/.test(r) ? OK : err('Numbers only (no scientific notation).')),
  },

  // ── Text ──────────────────────────────────────────────────────────────────
  name: {
    label: 'Name', example: 'Asha Patel', inputMode: 'text',
    normalize: (v) => collapse(stripEmoji(v)).replace(/[^a-zA-Z\s.'-]/g, ''), format: identity,
    validate: (r) => isBlank(r) ? OK : (/^[a-zA-Z\s.'-]+$/.test(r.trim()) ? OK : err('Only letters, spaces, . \' and - allowed.')),
  },
  text: {
    label: 'Text', example: '', inputMode: 'text',
    // Trim leading, collapse doubles, strip emojis & script/HTML tags (XSS guard).
    normalize: (v) => collapse(stripEmoji(String(v ?? '').replace(/<\/?[a-z][^>]*>/gi, ''))),
    format: identity,
    validate: (r) => /<\s*script/i.test(r) ? err('Script tags are not allowed.') : OK,
  },
};

// ── public API ───────────────────────────────────────────────────────────────
export const getFieldSpec = (type: FieldType): FieldSpec => FIELD_SPECS[type] || FIELD_SPECS.text;
export const normalizeField = (type: FieldType, input: string): string => getFieldSpec(type).normalize(input ?? '');
export const formatField = (type: FieldType, raw: string): string => getFieldSpec(type).format(getFieldSpec(type).normalize(raw ?? ''));
export const validateField = (type: FieldType, raw: string): ValidationResult => getFieldSpec(type).validate(getFieldSpec(type).normalize(raw ?? ''));

/**
 * validateForm — validate a map of { fieldName: {type, value, required} } and
 * return per-field errors + an overall `isValid` used to enable/disable Save.
 * Only REQUIRED-but-empty or malformed fields block; optional blanks pass.
 */
export function validateForm(
  fields: Record<string, { type: FieldType; value: string; required?: boolean; label?: string }>
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  for (const [name, f] of Object.entries(fields)) {
    const raw = normalizeField(f.type, f.value ?? '');
    if (f.required && isBlank(raw)) { errors[name] = `${f.label || getFieldSpec(f.type).label} is required.`; continue; }
    const res = getFieldSpec(f.type).validate(raw);
    if (!res.isValid) errors[name] = res.error;
  }
  return { isValid: Object.keys(errors).length === 0, errors };
}

export { luhnValid };
