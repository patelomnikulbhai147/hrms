/**
 * Mobile App — Registration controller (/api/app/profile/*).
 *
 * Each step saves a DRAFT to the shared TemporaryEmployee record (same data the
 * web onboarding uses), recomputes completion, advances the current step, and never
 * loses data. Editing is allowed any time until approval (status === 'Converted').
 */
const prisma = require('../config/prisma');
const { ok, fail } = require('./appResponse');
const H = require('./appHelpers');

const orNull = (v) => (v != null && String(v).trim() !== '' ? (typeof v === 'string' ? v.trim() : v) : null);
const joinParts = (...p) => p.map((x) => (x == null ? '' : String(x).trim())).filter(Boolean).join(', ');

// Guard: block edits once converted (approved). Other statuses remain editable.
function editable(temp, res) {
  if (temp.status === 'Converted') { fail(res, 'Your profile is approved and can no longer be edited here.', { status: 403, code: 'ALREADY_APPROVED' }); return false; }
  return true;
}

// Persist a step: merge scalar columns + selfProfile patch + advance step pointer.
async function persistStep(temp, { scalars = {}, selfPatch = {}, jsonCols = {}, stepId }) {
  const prevSp = (temp.selfProfile && typeof temp.selfProfile === 'object') ? temp.selfProfile : {};
  const app = { ...(prevSp.app || {}) };
  const completedBefore = new Set(app.completedSteps || []);
  if (stepId) { completedBefore.add(stepId); app.completedSteps = [...completedBefore].sort((a, b) => a - b); app.currentStep = Math.min(stepId + 1, H.TOTAL_STEPS); }
  const selfProfile = { ...prevSp, ...selfPatch, app };

  const data = { ...scalars, ...jsonCols, selfProfile };
  // Drop undefined so we never clobber unrelated fields.
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

  const updated = await prisma.temporaryEmployee.update({ where: { id: temp.id }, data });
  updated.profileCompletion !== H.completionPercentage(updated) &&
    await prisma.temporaryEmployee.update({ where: { id: temp.id }, data: { profileCompletion: H.completionPercentage(updated) } }).catch(() => {});
  return prisma.temporaryEmployee.findUnique({ where: { id: temp.id } });
}

function stepResponse(res, temp, message) {
  return ok(res, { saved: true, ...H.progressPayload(temp) }, message);
}

// ── Step 1 — Personal ────────────────────────────────────────────────────────
exports.personal = async (req, res) => {
  const { temp } = req.appCtx; if (!editable(temp, res)) return;
  const b = req.body || {};
  const name = joinParts(b.firstName, b.middleName, b.lastName) || b.name || temp.name;
  const updated = await persistStep(temp, {
    stepId: 1,
    scalars: { name: orNull(name) || temp.name, dob: orNull(b.dob), gender: orNull(b.gender), email: orNull(b.email) },
    selfPatch: {
      firstName: orNull(b.firstName), middleName: orNull(b.middleName), lastName: orNull(b.lastName),
      maritalStatus: orNull(b.maritalStatus), nationality: orNull(b.nationality), bloodGroup: orNull(b.bloodGroup),
    },
  });
  return stepResponse(res, updated, 'Personal information saved.');
};

// ── Step 2 — Address ─────────────────────────────────────────────────────────
exports.address = async (req, res) => {
  const { temp } = req.appCtx; if (!editable(temp, res)) return;
  const b = req.body || {};
  const present = b.present || {};
  const permanent = b.sameAsPresent ? present : (b.permanent || {});
  const compose = (a) => joinParts(a.line1, a.line2, a.area, a.landmark, a.city, a.district, a.state, a.country, a.pincode);
  const updated = await persistStep(temp, {
    stepId: 2,
    scalars: { presentAddress: orNull(compose(present)) || temp.presentAddress, permanentAddress: orNull(compose(permanent)) || temp.permanentAddress },
    selfPatch: { present, permanent, sameAsPresent: !!b.sameAsPresent },
  });
  return stepResponse(res, updated, 'Address saved.');
};

// ── Step 3 — Family / Nominee ────────────────────────────────────────────────
exports.family = async (req, res) => {
  const { temp } = req.appCtx; if (!editable(temp, res)) return;
  const b = req.body || {};
  const updated = await persistStep(temp, {
    stepId: 3,
    scalars: { fatherSpouseName: orNull(b.fatherSpouseName), emergencyContact: orNull(b.emergencyContact || b.emergencyContactNumber) },
    jsonCols: { nominee: b.nominee !== undefined ? b.nominee : temp.nominee },
    selfPatch: { emergencyContactName: orNull(b.emergencyContactName), emergencyRelationship: orNull(b.relationship) },
  });
  return stepResponse(res, updated, 'Family / nominee saved.');
};

// ── Step 4 — Bank ────────────────────────────────────────────────────────────
exports.bank = async (req, res) => {
  const { temp } = req.appCtx; if (!editable(temp, res)) return;
  const b = req.body || {};
  const updated = await persistStep(temp, {
    stepId: 4,
    scalars: { bankName: orNull(b.bankName), accountNumber: orNull(b.accountNumber), ifsc: orNull(b.ifsc) },
    selfPatch: { accountHolderName: orNull(b.accountHolderName), bankBranch: orNull(b.bankBranch), accountType: orNull(b.accountType) },
  });
  return stepResponse(res, updated, 'Bank details saved.');
};

// ── Step 5 — Education ───────────────────────────────────────────────────────
exports.education = async (req, res) => {
  const { temp } = req.appCtx; if (!editable(temp, res)) return;
  const b = req.body || {};
  const value = b.education !== undefined ? b.education : (Array.isArray(b) ? b : b.items);
  const updated = await persistStep(temp, { stepId: 5, jsonCols: { education: value !== undefined ? value : temp.education } });
  return stepResponse(res, updated, 'Education saved.');
};

// ── Step 6 — Experience ──────────────────────────────────────────────────────
exports.experience = async (req, res) => {
  const { temp } = req.appCtx; if (!editable(temp, res)) return;
  const b = req.body || {};
  const value = b.experience !== undefined ? b.experience : (Array.isArray(b) ? b : b.items);
  const updated = await persistStep(temp, { stepId: 6, jsonCols: { experience: value !== undefined ? value : temp.experience } });
  return stepResponse(res, updated, 'Experience saved.');
};

// ── Step 7 — Documents (bulk save) ───────────────────────────────────────────
exports.documents = async (req, res) => {
  const { temp } = req.appCtx; if (!editable(temp, res)) return;
  const b = req.body || {};
  const prevDocs = (temp.documents && typeof temp.documents === 'object') ? temp.documents : {};
  const incoming = b.documents && typeof b.documents === 'object' ? b.documents : {};
  const updated = await persistStep(temp, {
    stepId: 7,
    scalars: { photoUpload: b.photo !== undefined ? b.photo : temp.photoUpload },
    jsonCols: { documents: { ...prevDocs, ...incoming } },
  });
  return stepResponse(res, updated, 'Documents saved.');
};

// ── Single document upload ───────────────────────────────────────────────────
// POST /api/app/profile/document — { type, name, dataUrl }
// type → storage key (kept consistent with the HR approval gate).
const DOC_KEY = { aadhaar: 'aadhaarDoc', pan: 'panDoc', passbook: 'bankProof', bank: 'bankProof', signature: 'signature', degree: 'degree', education: 'educationCert', experience: 'experienceLetter', other: 'other' };
exports.uploadDocument = async (req, res) => {
  const { temp } = req.appCtx; if (!editable(temp, res)) return;
  const b = req.body || {};
  const type = String(b.type || '').toLowerCase();
  if (!type) return fail(res, 'Document type is required.', { status: 400, code: 'TYPE_REQUIRED' });
  const payload = b.dataUrl || b.data || b.url ? { name: b.name || type, dataUrl: b.dataUrl || b.data || b.url, uploadedAt: new Date().toISOString() } : null;
  if (!payload) return fail(res, 'Document content is required.', { status: 400, code: 'CONTENT_REQUIRED' });

  if (type === 'photo') {
    const updated = await persistStep(temp, { scalars: { photoUpload: payload.dataUrl } });
    return ok(res, { uploaded: 'photo', ...H.progressPayload(updated) }, 'Photo uploaded.');
  }
  const key = DOC_KEY[type] || type;
  const prevDocs = (temp.documents && typeof temp.documents === 'object') ? temp.documents : {};
  const updated = await persistStep(temp, { jsonCols: { documents: { ...prevDocs, [key]: payload } } });
  return ok(res, { uploaded: key, ...H.progressPayload(updated) }, 'Document uploaded.');
};

// ── Progress ─────────────────────────────────────────────────────────────────
exports.progress = async (req, res) => ok(res, H.progressPayload(req.appCtx.temp), 'Progress loaded.');

// ── Submit for approval ──────────────────────────────────────────────────────
exports.submit = async (req, res) => {
  const { temp } = req.appCtx;
  if (temp.status === 'Converted') return fail(res, 'Your profile is already approved.', { status: 400, code: 'ALREADY_APPROVED' });
  const v = H.validateForSubmit(temp);
  if (!v.ok) return fail(res, 'Please complete all required fields and documents before submitting.', { status: 422, code: 'VALIDATION_FAILED', errors: v.errors });

  const actor = temp.name || 'Mobile App';
  const updated = await prisma.temporaryEmployee.update({
    where: { id: temp.id },
    data: {
      status: 'Pending Approval', submittedBy: actor, submittedAt: new Date(),
      rejectedReason: null, rejectedBy: null, rejectedAt: null,
      changeRequestNote: null, changeRequestBy: null, changeRequestAt: null,
    },
  });
  return ok(res, { approvalStatus: H.approvalStatus(updated), submittedAt: updated.submittedAt }, 'Submitted for approval.');
};

// ── Approval status ──────────────────────────────────────────────────────────
exports.status = async (req, res) => {
  const { temp } = req.appCtx;
  const status = H.approvalStatus(temp);
  const data = { approvalStatus: status, completionPercentage: H.completionPercentage(temp) };
  if (status === 'Rejected') data.remarks = temp.rejectedReason || null;
  if (status === 'Changes Requested') data.remarks = temp.changeRequestNote || null;
  if (status === 'Approved') data.employeeId = req.appCtx.employee?.employeeId || temp.convertedEmployeeCode || null;
  return ok(res, data, 'Status loaded.');
};

// ── Generic profile update ───────────────────────────────────────────────────
// Before approval: edits the TemporaryEmployee draft. After approval (Converted):
// applies limited self-service edits to the real Employee record.
exports.update = async (req, res) => {
  const { temp, employee } = req.appCtx;
  if (temp.status === 'Converted' && employee) {
    const eb = req.body || {};
    const ALLOWED_E = ['email', 'phone', 'presentAddress', 'permanentAddress', 'emergencyContact'];
    const data = {}; for (const k of ALLOWED_E) if (k in eb) data[k] = eb[k] === '' ? null : eb[k];
    if (!Object.keys(data).length) return ok(res, {}, 'Nothing to update.');
    const upd = await prisma.employee.update({ where: { id: employee.id }, data });
    return ok(res, { email: upd.email, phone: upd.phone, presentAddress: upd.presentAddress }, 'Profile updated.');
  }
  const b = req.body || {};
  const ALLOWED = ['name', 'email', 'dob', 'gender', 'fatherSpouseName', 'aadhaar', 'pan', 'bankName', 'accountNumber', 'ifsc', 'presentAddress', 'permanentAddress', 'emergencyContact'];
  const scalars = {}; for (const k of ALLOWED) if (k in b) scalars[k] = b[k] === '' ? null : b[k];
  const jsonCols = {}; for (const k of ['nominee', 'education', 'experience', 'documents']) if (k in b) jsonCols[k] = b[k];
  const selfPatch = (b.selfProfile && typeof b.selfProfile === 'object') ? b.selfProfile : {};
  const updated = await persistStep(temp, { scalars, jsonCols, selfPatch });
  return ok(res, H.progressPayload(updated), 'Profile updated.');
};
