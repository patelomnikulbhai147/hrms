import React, { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { getFieldSpec, normalizeField, type FieldType } from '@/utils/fieldFormats';

/**
 * SmartInput — the ONE reusable field control for every identity / tax / banking /
 * statutory input in the HRMS. It reads its behaviour from the global
 * fieldFormats registry, so every form gets identical real-time validation,
 * auto-formatting, masking, uppercasing and paste-cleaning with zero per-form code.
 *
 * Contract: STORE RAW, DISPLAY FORMATTED.
 *   - `value` is the RAW value you persist (digits-only Aadhaar, un-spaced PAN…).
 *   - `onValueChange(raw, isValid)` fires on every keystroke with the cleaned raw
 *     value and its validity — wire `isValid` into your Save-disabled logic.
 *   - The box auto-formats for display (Aadhaar → 1234 5678 9012, mobile → +91 …).
 *
 * Usage:
 *   <SmartInput type="pan" label="PAN" value={form.pan}
 *      onValueChange={(raw, ok) => { setForm(f => ({...f, pan: raw})); setValid(v => ({...v, pan: ok})); }}
 *      required />
 */
export interface SmartInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  type: FieldType;
  value: string;
  onValueChange: (raw: string, isValid: boolean) => void;
  label?: string;
  required?: boolean;
  /** Force the inline error to show even before the field is touched. */
  showError?: boolean;
  /** Show a green (valid) border once a non-empty value passes. Default true. */
  showSuccess?: boolean;
  /** A parent/server-supplied error (duplicate PAN, account mismatch…). Takes precedence. */
  externalError?: string;
  icon?: React.ReactNode;
}

export const SmartInput: React.FC<SmartInputProps> = ({
  type, value, onValueChange, label, required, showError, showSuccess = true,
  externalError, placeholder, icon, onBlur, ...rest
}) => {
  const spec = getFieldSpec(type);
  const [touched, setTouched] = useState(false);

  const raw = normalizeField(type, value ?? '');
  const display = spec.format(raw);
  const res = spec.validate(raw);
  const isEmpty = raw.trim() === '';
  const requiredEmpty = !!required && isEmpty;
  const isValid = res.isValid && !requiredEmpty;

  // Show an error once the user has interacted (or when forced), for either a
  // malformed value or a missing required field. Never nags on an untouched blank.
  // A parent/server error (mismatch, duplicate) always wins over the inline check.
  const visibleError =
    externalError ||
    ((touched || showError)
      ? (requiredEmpty ? `${label || spec.label} is required.` : (!res.isValid ? res.error : ''))
      : '');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextRaw = spec.normalize(e.target.value);
    onValueChange(nextRaw, spec.validate(nextRaw).isValid && !(required && nextRaw.trim() === ''));
  };

  return (
    <Input
      {...rest}
      value={display}
      inputMode={spec.inputMode as any}
      placeholder={placeholder ?? (spec.example ? `e.g. ${spec.example}` : undefined)}
      label={label ? (required ? `${label} *` : label) : undefined}
      icon={icon}
      error={visibleError || undefined}
      success={showSuccess && touched && !isEmpty && isValid && !externalError}
      onChange={handleChange}
      onBlur={(e) => { setTouched(true); onBlur?.(e); }}
    />
  );
};

export default SmartInput;
