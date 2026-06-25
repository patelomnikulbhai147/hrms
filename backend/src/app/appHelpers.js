/**
 * Shared helpers for the Mobile App registration flow. Works directly on the
 * existing TemporaryEmployee record so mobile + web onboarding share one dataset
 * and one approval queue. App-only meta (current step, completed steps) is stored
 * inside the existing `selfProfile` JSON under `selfProfile.app` — no schema change.
 */

// 7-step registration model (order matters for currentStep resolution).
const STEPS = [
  { id: 1, key: 'personal',   label: 'Personal Information' },
  { id: 2, key: 'address',    label: 'Address' },
  { id: 3, key: 'family',     label: 'Family / Nominee' },
  { id: 4, key: 'bank',       label: 'Bank Details' },
  { id: 5, key: 'education',  label: 'Education' },
  { id: 6, key: 'experience', label: 'Experience' },
  { id: 7, key: 'documents',  label: 'Documents' },
];
const TOTAL_STEPS = STEPS.length;

const hasVal = (v) => v != null && String(v).trim() !== '';
const sp = (temp) => (temp.selfProfile && typeof temp.selfProfile === 'object') ? temp.selfProfile : {};
const docs = (temp) => (temp.documents && typeof temp.documents === 'object') ? temp.documents : {};
const jsonFilled = (v) => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' && Object.keys(v).length > 0);

// Has a document been uploaded? photo lives on photoUpload; others in documents JSON.
function docPresent(temp, key) {
  if (key === 'photo') return hasVal(temp.photoUpload);
  const entry = docs(temp)[key];
  if (!entry) return false;
  if (typeof entry === 'string') return entry.trim() !== '';
  return !!(entry.dataUrl || entry.data || entry.url || entry.name);
}

// Is a given registration step considered complete (has its core data)?
function stepComplete(temp, key) {
  const p = sp(temp);
  switch (key) {
    case 'personal':   return hasVal(temp.name) && (hasVal(temp.dob) || hasVal(temp.gender) || hasVal(p.firstName));
    case 'address':    return hasVal(temp.presentAddress) || jsonFilled(p.present);
    case 'family':     return jsonFilled(temp.nominee) || hasVal(temp.emergencyContact) || hasVal(temp.fatherSpouseName);
    case 'bank':       return hasVal(temp.accountNumber) && hasVal(temp.ifsc);
    case 'education':  return jsonFilled(temp.education);
    case 'experience': return jsonFilled(temp.experience);
    case 'documents':  return docPresent(temp, 'photo') && docPresent(temp, 'aadhaarDoc') && docPresent(temp, 'panDoc') && docPresent(temp, 'bankProof');
    default: return false;
  }
}

function completedSteps(temp) {
  return STEPS.filter((s) => stepComplete(temp, s.key)).map((s) => s.id);
}
function completionPercentage(temp) {
  return Math.round((completedSteps(temp).length / TOTAL_STEPS) * 100);
}
// Current step = stored pointer if valid, else first incomplete step (or last).
function currentStep(temp) {
  const stored = sp(temp).app?.currentStep;
  if (Number.isInteger(stored) && stored >= 1 && stored <= TOTAL_STEPS) return stored;
  const done = new Set(completedSteps(temp));
  const firstIncomplete = STEPS.find((s) => !done.has(s.id));
  return firstIncomplete ? firstIncomplete.id : TOTAL_STEPS;
}

// Map the TemporaryEmployee.status to the app's approval status vocabulary.
function approvalStatus(temp) {
  switch (temp.status) {
    case 'Converted': return 'Approved';
    case 'Pending Approval': return 'Pending Approval';
    case 'Rejected': return 'Rejected';
    case 'Changes Requested': return 'Changes Requested';
    default: return 'Draft'; // Pending Profile / Partially Completed
  }
}
const registrationCompleted = (temp) => ['Pending Approval', 'Converted'].includes(temp.status) || completionPercentage(temp) === 100;

// Submission gate — mirrors the existing web/HR mandatory checks so a record
// submitted from the app passes HR re-validation on approval.
const MANDATORY_FIELDS = [
  { key: 'name', label: 'Full Name' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'presentAddress', label: 'Present Address' },
  { key: 'aadhaar', label: 'Aadhaar Number' },
  { key: 'pan', label: 'PAN Number' },
  { key: 'accountNumber', label: 'Bank Account Number' },
];
const MANDATORY_DOCS = [
  { key: 'photo', label: 'Photo' },
  { key: 'aadhaarDoc', label: 'Aadhaar Document' },
  { key: 'panDoc', label: 'PAN Document' },
  { key: 'bankProof', label: 'Bank Passbook / Proof' },
];
function validateForSubmit(temp) {
  const errors = [];
  for (const f of MANDATORY_FIELDS) if (!hasVal(temp[f.key])) errors.push({ code: 'MISSING_FIELD', field: f.key, message: `${f.label} is required.` });
  if (!hasVal(temp.branchId) && !hasVal(temp.branchLocation)) errors.push({ code: 'MISSING_FIELD', field: 'branch', message: 'Branch is required.' });
  for (const d of MANDATORY_DOCS) if (!docPresent(temp, d.key)) errors.push({ code: 'MISSING_DOCUMENT', field: d.key, message: `${d.label} is required.` });
  return { ok: errors.length === 0, errors };
}

function progressPayload(temp) {
  const done = completedSteps(temp);
  return {
    currentStep: currentStep(temp),
    completedSteps: done,
    completionPercentage: completionPercentage(temp),
    totalSteps: TOTAL_STEPS,
    canSubmit: validateForSubmit(temp).ok && !['Converted'].includes(temp.status),
    approvalStatus: approvalStatus(temp),
  };
}

module.exports = {
  STEPS, TOTAL_STEPS, hasVal, docPresent, stepComplete, completedSteps,
  completionPercentage, currentStep, approvalStatus, registrationCompleted,
  validateForSubmit, progressPayload, sp,
};
