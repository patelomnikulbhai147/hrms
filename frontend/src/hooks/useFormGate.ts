import { useCallback, useMemo, useState } from 'react';
import { validateForm, type FieldType } from '@/utils/fieldFormats';

/**
 * One required field in a gated form.
 *
 * `type` selects the rule from the shared FIELD_SPECS registry
 * (utils/fieldFormats.ts) — the same registry the backend mirrors in
 * utils/fieldValidators.js. Validation logic lives there and nowhere else; this
 * hook only decides WHEN a form may be submitted, never HOW a value is judged.
 */
export interface GateField {
  type: FieldType;
  value: unknown;
  /** Required fields block submission when blank. Optional blanks always pass. */
  required?: boolean;
  /** Human label used in the error text and the blocked-button summary. */
  label?: string;
  /**
   * DOM id to scroll to / focus when this field is the first invalid one.
   * Defaults to `field-<name>`, matching the existing convention in the
   * employee wizard.
   */
  focusId?: string;
}

export type GateFields = Record<string, GateField>;

export interface FormGate {
  /** True only when every required field is present and every value is valid. */
  isValid: boolean;
  /** Live errors for ALL fields, whether or not they should be shown yet. */
  errors: Record<string, string>;
  /**
   * Errors the user should actually see right now. A required field that is
   * simply untouched and empty is NOT an error yet — nagging someone about a
   * field they have not reached is noise. A field shows red once it has been
   * touched, once it holds a malformed value, or once submission was attempted.
   */
  visibleErrors: Record<string, string>;
  /** Number of outstanding problems — drives the blocked-button tooltip. */
  invalidCount: number;
  /** Short summary for `blockedReason`, e.g. "2 required fields still need attention". */
  blockedReason: string;
  /** Mark a field interacted-with, so its error may surface (call from onBlur). */
  touch: (name: string) => void;
  /** Reset touched + submit-attempted state, e.g. when a wizard step changes. */
  reset: () => void;
  /**
   * The one entry point for Save / Next / Submit.
   *
   * Valid   → runs `onValid` and returns true.
   * Invalid → reveals every outstanding error, scrolls to the first invalid
   *           field, focuses it, and returns false WITHOUT calling `onValid`.
   *           No API call, no spinner, no navigation.
   */
  attemptSubmit: (onValid?: () => void | Promise<void>) => Promise<boolean>;
}

/** Scroll a field into view and put the cursor in it. */
const focusField = (domId: string) => {
  const el = document.getElementById(domId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const focusable = (el.matches('input,select,textarea')
    ? el
    : el.querySelector('input,select,textarea')) as HTMLElement | null;
  // After the smooth scroll settles, so focus does not fight the animation.
  window.setTimeout(() => focusable?.focus(), 250);
};

/**
 * useFormGate — the shared Save/Next/Submit gating rule for HRMS forms.
 *
 * Pair it with `<Button blocked={!gate.isValid} blockedReason={gate.blockedReason}
 * onClick={() => gate.attemptSubmit(save)}>`. The button LOOKS disabled until the
 * step is complete, but a click still explains what is missing rather than doing
 * nothing at all.
 *
 * The gate is a UX guard, never the enforcement: the backend re-validates every
 * required field and rejects incomplete payloads with field-specific errors.
 */
export function useFormGate(fields: GateFields): FormGate {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);

  // Recomputed on every keystroke — this is what makes the gate live.
  const { isValid, errors } = useMemo(
    () => validateForm(
      Object.fromEntries(
        Object.entries(fields).map(([name, f]) => [name, {
          type: f.type,
          value: f.value == null ? '' : String(f.value),
          required: f.required,
          label: f.label,
        }])
      )
    ),
    [fields]
  );

  const visibleErrors = useMemo(() => {
    if (attempted) return errors;
    const out: Record<string, string> = {};
    for (const [name, msg] of Object.entries(errors)) {
      const raw = fields[name]?.value;
      const isEmpty = raw == null || String(raw).trim() === '';
      // Touched fields always report. An untouched field only reports when it
      // holds something malformed — never merely for being empty.
      if (touched[name] || !isEmpty) out[name] = msg;
    }
    return out;
  }, [errors, touched, attempted, fields]);

  const invalidCount = Object.keys(errors).length;

  const touch = useCallback((name: string) => {
    setTouched(t => (t[name] ? t : { ...t, [name]: true }));
  }, []);

  const reset = useCallback(() => {
    setTouched({});
    setAttempted(false);
  }, []);

  const attemptSubmit = useCallback(async (onValid?: () => void | Promise<void>) => {
    if (!isValid) {
      setAttempted(true);
      // Report in the order the fields were declared, which is the order they
      // appear on screen — so "first invalid" means first on the page.
      const firstInvalid = Object.keys(fields).find(name => errors[name]);
      if (firstInvalid) focusField(fields[firstInvalid].focusId || `field-${firstInvalid}`);
      return false;
    }
    await onValid?.();
    return true;
  }, [isValid, errors, fields]);

  const blockedReason = invalidCount === 0
    ? ''
    : `${invalidCount} required field${invalidCount === 1 ? '' : 's'} still need${invalidCount === 1 ? 's' : ''} attention`;

  return { isValid, errors, visibleErrors, invalidCount, blockedReason, touch, reset, attemptSubmit };
}

export default useFormGate;
