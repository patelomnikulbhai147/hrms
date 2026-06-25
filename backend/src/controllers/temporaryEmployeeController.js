/**
 * Temporary Employee (Quick Registration) — fully ADDITIVE & ISOLATED.
 *
 * HR creates a temporary employee with only Name + Mobile + Branch (Department
 * optional). The record lives in its own `TemporaryEmployee` table and never
 * touches Employee / payroll / attendance / leave.
 *
 * A temp can NEVER be activated directly. Lifecycle (no shortcuts):
 *   Pending Profile → (profile + mandatory docs) → Pending Approval
 *     → [HR/Head/Super] Approve → real Employee created (Active)   [terminal: Converted]
 *     → [HR/Head/Super] Reject  → Rejected (reason; employee may edit & resubmit)
 *     → [HR/Head/Super] Request Changes → Changes Requested (note; edit & resubmit)
 * The official Employee code is generated via the existing employeeCode util on
 * approval — preserving the assigned branch and linking the records.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const respondError = require('../utils/respondError');
const { generateTempCode, generateEmployeeCode } = require('../utils/employeeCode');

// Who performed an action (for the audit trail).
const actorOf = (req) => req.user?.name || req.user?.email || 'System';

// ── Profile completion ───────────────────────────────────────────────────────
// Scalar onboarding fields + structured sections. Completion drives the % bar.
const COMPLETION_FIELDS = [
  'dob', 'gender', 'fatherSpouseName', 'email', 'designation', 'department',
  'aadhaar', 'pan', 'bankName', 'accountNumber', 'ifsc',
  'presentAddress', 'permanentAddress', 'emergencyContact', 'photoUpload',
];
const SECTION_FIELDS = ['education', 'experience', 'nominee', 'documents'];

function computeCompletion(t) {
  const total = COMPLETION_FIELDS.length + SECTION_FIELDS.length;
  let filled = 0;
  for (const f of COMPLETION_FIELDS) if (t[f] != null && String(t[f]).trim() !== '') filled++;
  for (const f of SECTION_FIELDS) {
    const v = t[f];
    if (Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' && Object.keys(v).length > 0)) filled++;
  }
  return Math.round((filled / total) * 100);
}

// ── Mandatory requirements (configurable) ────────────────────────────────────
// The gate between "Pending Profile" and "Pending Approval". A temp cannot be
// submitted for approval — and thus cannot be activated — until ALL of these are
// satisfied. Edit these arrays to change what is mandatory (the frontend mirrors
// the same list for the live checklist).
// Employee self-onboarding owns PERSONAL + verification info only. Official
// employment fields (Department, Designation, Salary, Shift, etc.) are NOT the
// employee's to enter — HR/Company Head assign them at the approval step, so they
// are intentionally absent from this gate.
const MANDATORY_FIELDS = [
  { key: 'name',           label: 'Name' },
  { key: 'mobile',         label: 'Mobile' },
  { key: 'presentAddress', label: 'Address' },
  { key: 'aadhaar',        label: 'Aadhaar' },
  { key: 'pan',            label: 'PAN' },
  { key: 'accountNumber',  label: 'Bank Account' },
];
const MANDATORY_DOCS = [
  { key: 'photo',      label: 'Photo' },        // stored on photoUpload
  { key: 'aadhaarDoc', label: 'Aadhaar Copy' }, // stored in documents JSON
  { key: 'panDoc',     label: 'PAN Copy' },
  { key: 'bankProof',  label: 'Bank Proof' },
];
const hasVal = (v) => v != null && String(v).trim() !== '';
function docPresent(t, key) {
  if (key === 'photo') return hasVal(t.photoUpload);
  const d = t.documents;
  if (!d || typeof d !== 'object') return false;
  const entry = d[key];
  if (!entry) return false;
  if (typeof entry === 'string') return entry.trim() !== '';
  return !!(entry.dataUrl || entry.data || entry.url || entry.name);
}
function validateMandatory(t) {
  const missingFields = MANDATORY_FIELDS.filter((f) => !hasVal(t[f.key])).map((f) => f.label);
  if (!hasVal(t.branchId) && !hasVal(t.branchLocation)) missingFields.push('Branch');
  const missingDocs = MANDATORY_DOCS.filter((d) => !docPresent(t, d.key)).map((d) => d.label);
  return { ok: missingFields.length === 0 && missingDocs.length === 0, missingFields, missingDocs };
}

// Status after a profile edit. Completion alone NEVER reaches approval — only the
// mandatory gate does (auto-submission). 'Converted' is the sole hard-terminal
// for edits; a 'Rejected' record may be edited and resubmitted.
function nextStatusAfterEdit(current, completion, mandatoryOk) {
  if (current === 'Converted') return current;
  if (mandatoryOk) return 'Pending Approval';
  if (completion > 0) return 'Partially Completed';
  return 'Pending Profile';
}

// ── Scope (mirrors employeeController: company + accessible branches) ─────────
function scopeOf(req) {
  const isSuper = req.user?.role === 'Super Admin';
  const companyScope = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
  const branchScope = (req.user?.accessibleBranchIds || []).filter(Boolean);
  return { isSuper, companyScope, branchScope };
}
const inScope = (req, companyId) => {
  const { isSuper, companyScope } = scopeOf(req);
  return isSuper || companyScope.includes(companyId);
};

// GET /api/temporary-employees — the user's accessible temporary employees.
exports.list = async (req, res) => {
  try {
    const { isSuper, companyScope, branchScope } = scopeOf(req);
    let where = {};
    if (!isSuper) {
      where = { OR: [
        { companyId: { in: companyScope.length ? companyScope : [-1] } },
        { branchId: { in: branchScope.length ? branchScope : [-1] } },
      ] };
    }
    const rows = await prisma.temporaryEmployee.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(rows);
  } catch (e) { return respondError(res, e); }
};

// GET /api/temporary-employees/:id
exports.get = async (req, res) => {
  try {
    const row = await prisma.temporaryEmployee.findUnique({ where: { id: idParam(req.params.id) } });
    if (!row) return res.status(404).json({ error: 'Temporary employee not found.' });
    if (!inScope(req, row.companyId)) return res.status(403).json({ error: 'Unauthorized.' });
    res.json(row);
  } catch (e) { return respondError(res, e); }
};

// POST /api/temporary-employees — Quick Registration (Name + Mobile + Branch).
exports.create = async (req, res) => {
  try {
    const b = req.body || {};
    if (!String(b.name || '').trim()) return res.status(400).json({ error: 'Employee Name is required.' });
    if (!String(b.mobile || '').trim()) return res.status(400).json({ error: 'Mobile Number is required.' });
    if (!idParam(b.branchId) && !String(b.branchLocation || '').trim()) {
      return res.status(400).json({ error: 'Branch is required.' });
    }

    // Resolve the parent company from the branch / workspace / user.
    let companyId = idParam(b.companyId) || null;
    let branchId = idParam(b.branchId) || null;
    let branchLocation = String(b.branchLocation || '').trim() || null;
    if (branchId) {
      const br = await prisma.branch.findUnique({ where: { id: branchId } }).catch(() => null);
      if (br) { companyId = br.companyId; if (!branchLocation) branchLocation = br.branchName; }
      else branchId = null; // not a real Branch id (e.g. a company-record id) — resolve by name below
    }
    if (!companyId) companyId = idParam(req.headers['x-workspace-id']) || req.user?.companyId || null;
    if (companyId) {
      const c = await prisma.company.findUnique({ where: { id: companyId } }).catch(() => null);
      if (c && c.parentCompanyId) companyId = c.parentCompanyId; // company-as-branch → parent
    }
    if (!companyId) return res.status(400).json({ error: 'Could not resolve the company for this temporary employee.' });
    // Resolve the real Branch-table id from the branch NAME so the converted
    // employee is correctly branch-scoped (the UI may send a company-record id).
    if (!branchId && branchLocation) {
      const byName = await prisma.branch.findFirst({ where: { companyId, branchName: branchLocation } }).catch(() => null);
      if (byName) branchId = byName.id;
    }
    if (!inScope(req, companyId)) return res.status(403).json({ error: 'Unauthorized to create in this company.' });

    const tempEmployeeId = await generateTempCode(companyId);
    const created = await prisma.temporaryEmployee.create({
      data: {
        tempEmployeeId, companyId, branchId, branchLocation,
        name: String(b.name).trim(), mobile: String(b.mobile).trim(),
        department: String(b.department || '').trim() || null,
        designation: String(b.designation || '').trim() || null,
        email: String(b.email || '').trim() || null,
        status: 'Pending Profile', profileCompletion: 0,
        createdBy: req.user?.name || req.user?.email || null,
      },
    });
    res.status(201).json(created);
  } catch (e) { return respondError(res, e); }
};

// PUT /api/temporary-employees/:id — fill / update onboarding profile fields.
exports.updateProfile = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const existing = await prisma.temporaryEmployee.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Temporary employee not found.' });
    if (!inScope(req, existing.companyId)) return res.status(403).json({ error: 'Unauthorized.' });
    if (existing.status === 'Converted') return res.status(400).json({ error: 'This temporary employee has already been converted.' });

    const b = req.body || {};
    const ALLOWED = [
      'name', 'mobile', 'department', 'designation', 'email', 'branchId', 'branchLocation',
      'dob', 'gender', 'fatherSpouseName', 'aadhaar', 'pan', 'bankName', 'accountNumber', 'ifsc',
      'presentAddress', 'permanentAddress', 'nominee', 'emergencyContact', 'education', 'experience',
      'photoUpload', 'documents',
      // Expanded employee-owned personal data (name parts, marital status,
      // nationality, blood group, structured addresses, extra identity/banking).
      'selfProfile',
    ];
    const data = {};
    for (const k of ALLOWED) if (k in b) data[k] = b[k] === '' ? null : b[k];
    if ('branchId' in data) data.branchId = idParam(data.branchId);

    const merged = { ...existing, ...data };
    data.profileCompletion = computeCompletion(merged);
    const mand = validateMandatory(merged);
    const newStatus = nextStatusAfterEdit(existing.status, data.profileCompletion, mand.ok);
    data.status = newStatus;
    // Auto-submission: the moment every mandatory field + document is present the
    // record moves itself into the approval queue and the audit clock starts.
    if (newStatus === 'Pending Approval' && existing.status !== 'Pending Approval') {
      data.submittedBy = actorOf(req);
      data.submittedAt = new Date();
      data.rejectedReason = null; data.rejectedBy = null; data.rejectedAt = null;
      data.changeRequestNote = null; data.changeRequestBy = null; data.changeRequestAt = null;
    }

    const updated = await prisma.temporaryEmployee.update({ where: { id }, data });
    res.json({ ...updated, validation: mand });
  } catch (e) { return respondError(res, e); }
};

// POST /api/temporary-employees/:id/submit — explicit "Submit for Approval".
// Validates the mandatory gate; on success moves the record to Pending Approval.
exports.submit = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const t = await prisma.temporaryEmployee.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: 'Temporary employee not found.' });
    if (!inScope(req, t.companyId)) return res.status(403).json({ error: 'Unauthorized.' });
    if (t.status === 'Converted') return res.status(400).json({ error: 'Already converted to a permanent employee.' });
    const mand = validateMandatory(t);
    if (!mand.ok) {
      return res.status(400).json({
        error: 'Profile is incomplete — cannot submit for approval.',
        missingFields: mand.missingFields, missingDocs: mand.missingDocs,
      });
    }
    const updated = await prisma.temporaryEmployee.update({
      where: { id },
      data: {
        status: 'Pending Approval', submittedBy: actorOf(req), submittedAt: new Date(),
        rejectedReason: null, rejectedBy: null, rejectedAt: null,
        changeRequestNote: null, changeRequestBy: null, changeRequestAt: null,
      },
    });
    res.json(updated);
  } catch (e) { return respondError(res, e); }
};

// POST /api/temporary-employees/:id/request-changes — bounce back for edits.
exports.requestChanges = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const t = await prisma.temporaryEmployee.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: 'Temporary employee not found.' });
    if (!inScope(req, t.companyId)) return res.status(403).json({ error: 'Unauthorized.' });
    if (t.status === 'Converted') return res.status(400).json({ error: 'A converted employee cannot be sent back.' });
    const updated = await prisma.temporaryEmployee.update({
      where: { id },
      data: {
        status: 'Changes Requested',
        changeRequestNote: String(req.body?.note || req.body?.reason || '').trim() || null,
        changeRequestBy: actorOf(req), changeRequestAt: new Date(),
      },
    });
    res.json(updated);
  } catch (e) { return respondError(res, e); }
};

// POST /api/temporary-employees/:id/approve  (alias: /convert)
// GATED activation — only a record that is "Pending Approval" can be approved,
// and approval is what creates the real Active Employee. There is no direct path
// from Pending Profile to Active; the mandatory gate + submission must happen
// first. Restricted to HR / Company Head / Super Admin by the route's RBAC.
exports.approve = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const t = await prisma.temporaryEmployee.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: 'Temporary employee not found.' });
    if (!inScope(req, t.companyId)) return res.status(403).json({ error: 'Unauthorized.' });
    if (t.status === 'Converted') return res.status(400).json({ error: 'Already converted to a permanent employee.', convertedEmployeeId: t.convertedEmployeeId });
    if (t.status !== 'Pending Approval') {
      return res.status(400).json({ error: 'Only an employee that is Pending Approval can be approved. Complete the profile and submit for approval first.' });
    }
    // Defensive re-check: never activate an incomplete record.
    const mand = validateMandatory(t);
    if (!mand.ok) {
      return res.status(400).json({ error: 'Mandatory requirements are not met — cannot approve.', missingFields: mand.missingFields, missingDocs: mand.missingDocs });
    }

    // ── HR Employment Assignment ──────────────────────────────────────────────
    // Official employment details are assigned by HR / Company Head AT APPROVAL
    // (the employee never enters them). Department + Designation are required
    // here; the rest are optional and map onto the existing Employee columns.
    // Deeper payroll/attendance/leave configuration continues to be managed in
    // those modules after activation — engines are untouched.
    const a = req.body || {};
    const department = String(a.department || '').trim();
    const designation = String(a.designation || '').trim();
    if (!department || !designation) {
      return res.status(400).json({ error: 'Department and Designation must be assigned before approval.', requires: ['department', 'designation'] });
    }
    const joinDate = a.joinDate ? new Date(a.joinDate) : new Date();
    const salary = a.salary != null && a.salary !== '' ? Number(a.salary) || 0 : 0;
    const employmentType = String(a.employmentType || '').trim() || 'Permanent';

    // Carry the employee-entered personal data onto the real Employee record.
    const sp = (t.selfProfile && typeof t.selfProfile === 'object') ? t.selfProfile : {};
    const orNull = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : null);

    // Extended HR employment assignment that has no dedicated Employee column is
    // recorded as `employmentMeta` (a record only — the payroll/attendance/leave
    // engines are untouched and read their own config).
    const META_KEYS = [
      'grade', 'level', 'confirmationDate', 'probationPeriod', 'salaryStructure',
      'basicSalary', 'grossSalary', 'ctc', 'wageCategory', 'skillCategory',
      'pf', 'esi', 'professionalTax', 'bonusEligibility',
      'weeklyOff', 'attendancePolicy', 'leavePolicy', 'holidayCalendar',
    ];
    const employmentMeta = {};
    for (const k of META_KEYS) if (a[k] !== undefined && a[k] !== '' && a[k] !== null) employmentMeta[k] = a[k];
    employmentMeta.assignedBy = actorOf(req);

    // Official employee code via the EXISTING generator (unchanged ID scheme),
    // using the temp's assigned branch so payroll/attendance/report branch
    // mapping is preserved on the new Active employee.
    const employeeId = await generateEmployeeCode(t.branchId, t.companyId);
    const employee = await prisma.employee.create({
      data: {
        employeeId, companyId: t.companyId, branchId: t.branchId || null, branchLocation: t.branchLocation || null,
        name: t.name, email: t.email || `${t.mobile}@pending.local`, phone: t.mobile,
        // HR-assigned employment details:
        department, designation,
        manager: orNull(a.reportingManager),
        category: orNull(a.employeeCategory),
        employmentType, joinDate, salary,
        shiftId: idParam(a.shiftId) || null,
        employmentMeta: Object.keys(employmentMeta).length ? employmentMeta : undefined,
        status: 'Active',
        // Employee-entered personal data (scalars + expanded selfProfile):
        firstName: orNull(sp.firstName), middleName: orNull(sp.middleName), lastName: orNull(sp.lastName),
        maritalStatus: orNull(sp.maritalStatus), nationality: orNull(sp.nationality),
        dob: t.dob || null, gender: t.gender || null, fatherSpouseName: t.fatherSpouseName || null,
        aadhaar: t.aadhaar || null, pan: t.pan || null,
        uan: orNull(sp.uan),
        bankName: t.bankName || null, accountNumber: t.accountNumber || null, ifsc: t.ifsc || null,
        accountHolderName: orNull(sp.accountHolderName), bankBranch: orNull(sp.bankBranch),
        state: orNull(sp.present?.state), city: orNull(sp.present?.city),
        presentAddress: t.presentAddress || null, permanentAddress: t.permanentAddress || null,
        emergencyContact: t.emergencyContact || null, photoUpload: t.photoUpload || null,
        documents: t.documents || undefined,
      },
    });
    const updated = await prisma.temporaryEmployee.update({
      where: { id },
      data: {
        status: 'Converted', convertedEmployeeId: employee.id, convertedEmployeeCode: employee.employeeId,
        convertedAt: new Date(), approvedBy: actorOf(req), approvedAt: new Date(),
        // Record the HR-assigned employment details on the temp for the audit trail.
        department, designation,
      },
    });
    res.json({ temporaryEmployee: updated, employee });
  } catch (e) { return respondError(res, e); }
};
// Back-compat alias — the old /convert route now enforces the same approval gate.
exports.convert = exports.approve;

// POST /api/temporary-employees/:id/reject — mark Rejected with an audited reason.
// The record may still be edited and resubmitted by the employee/HR afterwards.
exports.reject = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const t = await prisma.temporaryEmployee.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: 'Temporary employee not found.' });
    if (!inScope(req, t.companyId)) return res.status(403).json({ error: 'Unauthorized.' });
    if (t.status === 'Converted') return res.status(400).json({ error: 'A converted employee cannot be rejected.' });
    const updated = await prisma.temporaryEmployee.update({
      where: { id }, data: {
        status: 'Rejected', rejectedReason: String(req.body?.reason || '').trim() || null,
        rejectedBy: actorOf(req), rejectedAt: new Date(),
      },
    });
    res.json(updated);
  } catch (e) { return respondError(res, e); }
};

// DELETE /api/temporary-employees/:id — remove a temporary record (never deletes
// a converted employee's real record).
exports.remove = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const t = await prisma.temporaryEmployee.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: 'Temporary employee not found.' });
    if (!inScope(req, t.companyId)) return res.status(403).json({ error: 'Unauthorized.' });
    await prisma.temporaryEmployee.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { return respondError(res, e); }
};
