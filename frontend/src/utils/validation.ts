/**
 * Global Validation Utilities for the HRMS Platform
 */

export interface ValidationResult {
  isValid: boolean;
  error: string;
}

import { countries } from '@/data/countries';

/**
 * Validates a mobile number.
 * Enforces: Only numbers, dynamic regional digit length constraints.
 */
export const validatePhone = (num: string, dialCode: string = '+91'): ValidationResult => {
  if (!num) {
    return { isValid: false, error: 'Mobile number is required.' };
  }
  // Check if contains non-numeric characters
  if (/[^\d]/.test(num)) {
    return { isValid: false, error: 'Only numbers allowed' };
  }
  
  // Find country configuration based on dialCode
  const cleanDial = dialCode.split(' ')[0].trim();
  const country = countries.find(c => c.dialCode === cleanDial);

  if (country) {
    const len = num.length;
    if (country.minLength === country.maxLength) {
      if (len !== country.minLength) {
        return { 
          isValid: false, 
          error: `${country.name} mobile numbers must be exactly ${country.minLength} digits` 
        };
      }
    } else {
      if (len < country.minLength || len > country.maxLength) {
        return { 
          isValid: false, 
          error: `${country.name} mobile numbers must be ${country.minLength} to ${country.maxLength} digits` 
        };
      }
    }
  } else {
    // ITU-T E.164 general fallback
    if (num.length < 8 || num.length > 15) {
      return { isValid: false, error: 'Mobile number must be 8 to 15 digits' };
    }
  }

  return { isValid: true, error: '' };
};

/**
 * Validates a name (employee, manager, admin, HR, etc.).
 * Enforces: Alphabets and spaces only.
 */
export const validateName = (name: string): ValidationResult => {
  if (!name || name.trim() === '') {
    return { isValid: false, error: 'Name is required' };
  }
  // Allow alphabets (upper/lower) and spaces
  if (!/^[a-zA-Z\s]+$/.test(name)) {
    return { isValid: false, error: 'Only alphabets and spaces allowed' };
  }
  return { isValid: true, error: '' };
};

/**
 * Validates an email address.
 * Enforces: Standard email format.
 */
export const validateEmail = (email: string): ValidationResult => {
  if (!email || email.trim() === '') {
    return { isValid: true, error: '' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Invalid email format' };
  }
  return { isValid: true, error: '' };
};

/**
 * Validates a company name.
 * Enforces: Alphabets, numbers, spaces, '&', and '.'
 */
export const validateCompanyName = (name: string): ValidationResult => {
  if (!name || name.trim() === '') {
    return { isValid: false, error: 'Company name is required' };
  }
  // Allow alphabets, numbers, spaces, &, .
  if (!/^[a-zA-Z0-9\s&.]+$/.test(name)) {
    return { isValid: false, error: "Only alphabets, numbers, spaces, '&', and '.' allowed" };
  }
  return { isValid: true, error: '' };
};

/**
 * Validates a salary or monetary amount.
 * Enforces: Numbers and decimals only.
 */
export const validateSalary = (val: string | number): ValidationResult => {
  const str = String(val).trim();
  if (str === '' || str === '0') {
    return { isValid: false, error: 'Amount is required' };
  }
  if (!/^\d+(\.\d+)?$/.test(str)) {
    return { isValid: false, error: 'Only numbers and decimals allowed' };
  }
  return { isValid: true, error: '' };
};

/**
 * Validates a percentage (PF, ESIC, etc.).
 * Enforces: Numbers, decimals, strictly between 0 and 100.
 */
export const validatePercentage = (val: string | number, fieldName?: string): ValidationResult => {
  const label = fieldName || 'Percentage';
  const str = String(val).trim();
  if (str === '') {
    return { isValid: false, error: `${label} is required` };
  }
  if (!/^\d+(\.\d+)?$/.test(str)) {
    return { isValid: false, error: `${label} must be a number` };
  }
  const num = parseFloat(str);
  if (num < 0 || num > 100) {
    return { isValid: false, error: `${label} must be between 0 and 100` };
  }
  return { isValid: true, error: '' };
};

// ── Company statutory / banking format validators ───────────────────────────
// All are LENIENT on empty (optional fields) and only reject a malformed value,
// so existing companies with blank fields keep saving (backward compatible).
const optional = (v: string | number | undefined | null) => String(v ?? '').trim() === '';

/** GSTIN — 15 chars: 2 state digits, 10-char PAN, entity digit, 'Z', checksum. */
export const validateGST = (val: string): ValidationResult => {
  if (optional(val)) return { isValid: true, error: '' };
  const ok = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(String(val).trim().toUpperCase());
  return ok ? { isValid: true, error: '' } : { isValid: false, error: 'Invalid GST number (e.g. 24ABCDE1234F1Z5)' };
};

/** PAN — 5 letters, 4 digits, 1 letter. */
export const validatePAN = (val: string): ValidationResult => {
  if (optional(val)) return { isValid: true, error: '' };
  const ok = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(String(val).trim().toUpperCase());
  return ok ? { isValid: true, error: '' } : { isValid: false, error: 'Invalid PAN (e.g. ABCDE1234F)' };
};

/** CIN — 21 chars (U/L + 5 digits + 2-letter state + 4-digit year + 3-letter type + 6-digit reg). */
export const validateCIN = (val: string): ValidationResult => {
  if (optional(val)) return { isValid: true, error: '' };
  const ok = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(String(val).trim().toUpperCase());
  return ok ? { isValid: true, error: '' } : { isValid: false, error: 'Invalid CIN (21 chars, e.g. U72200GJ2020PTC000000)' };
};

/** TAN — 4 letters, 5 digits, 1 letter. */
export const validateTAN = (val: string): ValidationResult => {
  if (optional(val)) return { isValid: true, error: '' };
  const ok = /^[A-Z]{4}[0-9]{5}[A-Z]{1}$/.test(String(val).trim().toUpperCase());
  return ok ? { isValid: true, error: '' } : { isValid: false, error: 'Invalid TAN (e.g. ABCD12345E)' };
};

/** IFSC — 4 letters, '0', 6 alphanumerics. */
export const validateIFSC = (val: string): ValidationResult => {
  if (optional(val)) return { isValid: true, error: '' };
  const ok = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(val).trim().toUpperCase());
  return ok ? { isValid: true, error: '' } : { isValid: false, error: 'Invalid IFSC (e.g. HDFC0001234)' };
};

/** PF establishment code — letters/digits/slashes (e.g. GJ/AHD/1234567/000). Lenient. */
export const validatePFCode = (val: string): ValidationResult => {
  if (optional(val)) return { isValid: true, error: '' };
  const ok = /^[A-Z0-9/-]{5,30}$/.test(String(val).trim().toUpperCase());
  return ok ? { isValid: true, error: '' } : { isValid: false, error: 'Invalid PF code (letters, digits, / and - only)' };
};

/** ESI employer code — 17 digits, often dash-separated. Lenient on separators. */
export const validateESICode = (val: string): ValidationResult => {
  if (optional(val)) return { isValid: true, error: '' };
  const digits = String(val).replace(/[^0-9]/g, '');
  const ok = digits.length === 17;
  return ok ? { isValid: true, error: '' } : { isValid: false, error: 'Invalid ESI code (17 digits)' };
};

/** Website / URL — optional protocol, domain with a dot. */
export const validateWebsite = (val: string): ValidationResult => {
  if (optional(val)) return { isValid: true, error: '' };
  const ok = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/.test(String(val).trim());
  return ok ? { isValid: true, error: '' } : { isValid: false, error: 'Invalid website (e.g. www.company.com)' };
};

/** Indian PIN code — exactly 6 digits, not starting with 0. */
export const validatePincode = (val: string): ValidationResult => {
  if (optional(val)) return { isValid: true, error: '' };
  const ok = /^[1-9][0-9]{5}$/.test(String(val).trim());
  return ok ? { isValid: true, error: '' } : { isValid: false, error: 'Invalid PIN code (6 digits)' };
};

/**
 * Validates Employee ID.
 * Enforces: No blank IDs, no duplicates in the company roster, only alphanumeric & hyphens.
 */
export const validateEmployeeId = (
  id: string,
  companyEmployees: { employeeId: string; id: string }[],
  currentEmpId?: string
): ValidationResult => {
  const cleanId = id.trim();
  if (cleanId === '') {
    return { isValid: false, error: 'Employee ID is required.' };
  }
  if (!/^[a-zA-Z0-9-]+$/.test(cleanId)) {
    return {
      isValid: false,
      error: 'Employee ID must contain only alphanumeric characters and hyphens',
    };
  }
  // Check for duplicates
  const isDuplicate = companyEmployees.some(
    e => e.employeeId.toUpperCase() === cleanId.toUpperCase() && e.id !== currentEmpId
  );
  if (isDuplicate) {
    return { isValid: false, error: 'Employee ID already exists' };
  }
  return { isValid: true, error: '' };
};
