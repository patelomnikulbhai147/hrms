// ── Employee mandatory-field contract (server-side authority) ────────────────
// The frontend gate (hooks/useFormGate.ts + the per-step map in Employees.tsx)
// decides when a button lights up. THIS file decides whether a record is
// allowed to exist. They are deliberately separate: the button is a courtesy,
// this is the enforcement, and a request that skips the UI entirely — DevTools,
// curl, a replayed payload — meets exactly the same rules.
//
// Field TYPES come from the shared registry in utils/fieldValidators.js, which
// mirrors the frontend's fieldFormats.ts. Nothing re-implements a regex here.
const { validateFields } = require('./fieldValidators');

// name -> { type, required, label }. `label` is what the user sees in the error.
const EMPLOYEE_FIELD_SPEC = {
  name:         { type: 'name',   required: true,  label: 'Full name' },
  department:   { type: 'text',   required: true,  label: 'Department' },
  designation:  { type: 'text',   required: true,  label: 'Designation' },
  joinDate:     { type: 'text',   required: true,  label: 'Date of Joining' },
  phone:        { type: 'mobile', required: true,  label: 'Mobile number' },
  salary:       { type: 'salary', required: true,  label: 'Salary' },
  // Optional, but must be well-formed when supplied.
  email:        { type: 'email',  required: false, label: 'Email address' },
  aadhaar:      { type: 'aadhaar', required: false, label: 'Aadhaar number' },
  pan:          { type: 'pan',    required: false, label: 'PAN' },
  uan:          { type: 'uan',    required: false, label: 'UAN' },
  esiNumber:    { type: 'esic',   required: false, label: 'ESIC number' },
  accountNumber:{ type: 'bankAccount', required: false, label: 'Bank account number' },
  ifsc:         { type: 'ifsc',   required: false, label: 'IFSC code' },
};

/**
 * Validate an employee payload.
 *
 * @param data  the incoming body
 * @param mode  'create' → every required field must be present.
 *              'update' → only the fields actually sent are checked, so a
 *                         partial PATCH-style update is not forced to resend the
 *                         whole record; a required field that IS sent may not be
 *                         blanked.
 * @returns { valid, errors }  errors is { fieldName: message } — field-specific
 *          so the client can mark the exact inputs rather than showing one
 *          generic failure.
 */
function validateEmployeePayload(data, mode = 'create') {
  const fields = {};
  for (const [name, spec] of Object.entries(EMPLOYEE_FIELD_SPEC)) {
    const sent = Object.prototype.hasOwnProperty.call(data, name);
    // On update, a field that was not sent is simply not under review.
    if (mode === 'update' && !sent) continue;
    fields[name] = {
      type: spec.type,
      value: data[name],
      // On update, a required field is only enforced when the client sent it
      // (sending it blank IS an attempt to clear a mandatory value → reject).
      required: spec.required && (mode === 'create' || sent),
      label: spec.label,
    };
  }
  const { valid, errors } = validateFields(fields);
  return { valid, errors };
}

/** The 422 body shape, so every controller reports failures identically. */
function validationErrorBody(errors) {
  const fieldList = Object.keys(errors);
  return {
    code: 'VALIDATION_FAILED',
    error: fieldList.length === 1
      ? errors[fieldList[0]]
      : `${fieldList.length} fields are missing or invalid.`,
    // Field-specific, so the form can highlight each input.
    errors,
    fields: fieldList,
  };
}

module.exports = { EMPLOYEE_FIELD_SPEC, validateEmployeePayload, validationErrorBody };
