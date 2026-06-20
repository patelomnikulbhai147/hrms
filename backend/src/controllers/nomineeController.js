/**
 * Employee Nominee management. Self-contained module — reads/writes ONLY the
 * dedicated nominee tables (employee_nominees, nominee_documents,
 * nominee_audit_logs). Never touches the Employee table or any other module.
 * Uses parameterized raw SQL against the shared Prisma client (no schema/client
 * regeneration required).
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

const clean = (v) => (v == null ? null : String(v).trim() || null);
const toInt = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true') ? 1 : 0;

const canWrite = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);
const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const actorName = (req) => req.user?.name || req.user?.email || (req.user?.id ? `user#${req.user.id}` : 'system');

const RELATIONSHIPS = ['Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Guardian', 'Friend', 'Other'];

// ── Validation ───────────────────────────────────────────────────────────────
function validateNominee(b) {
  if (!clean(b.fullName)) return 'Nominee full name is required.';
  if (!clean(b.relationship)) return 'Relationship is required.';
  const pct = num(b.percentage);
  if (pct < 0 || pct > 100) return 'Nomination percentage must be between 0 and 100.';
  const aadhaar = clean(b.aadhaar);
  if (aadhaar && !/^\d{12}$/.test(aadhaar.replace(/\s/g, ''))) return 'Aadhaar must be 12 digits.';
  const pan = clean(b.pan);
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase())) return 'PAN must be in the format ABCDE1234F.';
  const email = clean(b.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email address is not valid.';
  const mobile = clean(b.mobile);
  if (mobile && !/^\d{10}$/.test(mobile.replace(/\D/g, '').slice(-10))) return 'Mobile number must be 10 digits.';
  return null;
}

// Verify the requester may access this employee's nominees (company scope).
async function scopeCheck(req, employeeId) {
  const eid = toInt(employeeId);
  if (!eid) return { ok: false, code: 400, error: 'employeeId is required.' };
  const emp = await prisma.employee.findUnique({ where: { id: eid }, select: { id: true, companyId: true, branchId: true } });
  if (!emp) return { ok: false, code: 404, error: 'Employee not found.' };
  if (isSuperAdmin(req)) return { ok: true, emp };
  const scope = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || []), ...(req.user?.accessibleBranchIds || [])].filter(Boolean).map(Number);
  if (scope.includes(emp.companyId) || (emp.branchId && scope.includes(emp.branchId))) return { ok: true, emp };
  return { ok: false, code: 403, error: 'You do not have access to this employee.' };
}

async function logAudit(action, nomineeId, employeeId, req, previous, next) {
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO nominee_audit_logs (nomineeId, employeeId, action, performedBy, performedById, previousValues, newValues) VALUES (?,?,?,?,?,?,?)',
      nomineeId, employeeId, action, actorName(req), req.user?.id || null,
      previous ? JSON.stringify(previous).slice(0, 8000) : null,
      next ? JSON.stringify(next).slice(0, 8000) : null,
    );
  } catch (_) { /* audit must never block the operation */ }
}

const COLS = ['employeeId', 'companyId', 'fullName', 'relationship', 'dob', 'gender', 'mobile', 'email', 'nationality', 'maritalStatus', 'aadhaar', 'pan', 'passport', 'drivingLicense', 'country', 'state', 'city', 'addressLine1', 'addressLine2', 'postalCode', 'percentage', 'isEmergencyContact', 'isDependent', 'isLegalHeir', 'status', 'createdBy', 'updatedBy'];

function rowFromBody(b, emp, req, forCreate) {
  return {
    employeeId: emp.id, companyId: emp.companyId ?? null,
    fullName: clean(b.fullName), relationship: clean(b.relationship), dob: clean(b.dob), gender: clean(b.gender),
    mobile: clean(b.mobile), email: clean(b.email), nationality: clean(b.nationality) || 'India', maritalStatus: clean(b.maritalStatus),
    aadhaar: clean(b.aadhaar), pan: clean(b.pan) ? clean(b.pan).toUpperCase() : null, passport: clean(b.passport), drivingLicense: clean(b.drivingLicense),
    country: clean(b.country) || 'India', state: clean(b.state), city: clean(b.city), addressLine1: clean(b.addressLine1), addressLine2: clean(b.addressLine2), postalCode: clean(b.postalCode),
    percentage: num(b.percentage), isEmergencyContact: bool(b.isEmergencyContact), isDependent: bool(b.isDependent), isLegalHeir: bool(b.isLegalHeir),
    status: clean(b.status) || 'Active',
    createdBy: forCreate ? actorName(req) : undefined, updatedBy: actorName(req),
  };
}

async function activeTotal(employeeId, excludeId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(percentage),0) AS total FROM employee_nominees WHERE employeeId = ? AND status = 'Active'` + (excludeId ? ' AND id <> ?' : ''),
    ...(excludeId ? [employeeId, excludeId] : [employeeId])
  );
  return Number(rows[0]?.total || 0);
}

async function nomineeDocs(nomineeIds) {
  if (!nomineeIds.length) return {};
  const docs = await prisma.$queryRawUnsafe(
    `SELECT id, nomineeId, docType, fileName, mimeType, uploadedBy, createdAt FROM nominee_documents WHERE nomineeId IN (${nomineeIds.map(() => '?').join(',')})`,
    ...nomineeIds
  );
  const map = {};
  for (const d of docs) { (map[d.nomineeId] = map[d.nomineeId] || []).push(d); }
  return map;
}

// ── Endpoints ────────────────────────────────────────────────────────────────
// GET /api/nominees?employeeId=
exports.list = async (req, res) => {
  try {
    const access = await scopeCheck(req, req.query.employeeId);
    if (!access.ok) return res.status(access.code).json({ error: access.error });
    const rows = await prisma.$queryRawUnsafe('SELECT * FROM employee_nominees WHERE employeeId = ? ORDER BY status ASC, id ASC', access.emp.id);
    const docMap = await nomineeDocs(rows.map(r => r.id));
    const nominees = rows.map(r => ({ ...r, isEmergencyContact: !!r.isEmergencyContact, isDependent: !!r.isDependent, isLegalHeir: !!r.isLegalHeir, percentage: Number(r.percentage), documents: docMap[r.id] || [] }));
    const totalPercentage = nominees.filter(n => n.status === 'Active').reduce((s, n) => s + n.percentage, 0);
    res.json({ nominees, totalPercentage, isValid: Math.abs(totalPercentage - 100) < 0.01 || nominees.length === 0, relationships: RELATIONSHIPS });
  } catch (e) { console.error('nominee.list', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// POST /api/nominees
exports.create = async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ error: 'You do not have permission to add nominees.' });
    const access = await scopeCheck(req, req.body.employeeId);
    if (!access.ok) return res.status(access.code).json({ error: access.error });
    const err = validateNominee(req.body);
    if (err) return res.status(400).json({ error: err });

    // Duplicate prevention (same employee + same Aadhaar, or same name+relationship).
    const dupes = await prisma.$queryRawUnsafe(
      `SELECT id FROM employee_nominees WHERE employeeId = ? AND status <> 'Archived' AND ((aadhaar IS NOT NULL AND aadhaar <> '' AND aadhaar = ?) OR (LOWER(fullName) = LOWER(?) AND LOWER(relationship) = LOWER(?)))`,
      access.emp.id, clean(req.body.aadhaar) || '__none__', clean(req.body.fullName), clean(req.body.relationship)
    );
    if (dupes.length) return res.status(409).json({ error: 'A nominee with the same Aadhaar (or same name & relationship) already exists for this employee.' });

    // Allocation guard — active total may not exceed 100%.
    const total = await activeTotal(access.emp.id, null);
    if (total + num(req.body.percentage) > 100.01) return res.status(400).json({ error: `Total nomination would be ${total + num(req.body.percentage)}%. It cannot exceed 100% (currently ${total}% allocated).` });

    const row = rowFromBody(req.body, access.emp, req, true);
    const cols = COLS; const placeholders = cols.map(() => '?').join(',');
    const values = cols.map(c => row[c] === undefined ? null : row[c]);
    const result = await prisma.$transaction([
      prisma.$executeRawUnsafe(`INSERT INTO employee_nominees (${cols.join(',')}) VALUES (${placeholders})`, ...values),
      prisma.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id'),
    ]);
    const newId = Number(result[1][0].id);

    // Optional documents in the create payload.
    const docs = Array.isArray(req.body.documents) ? req.body.documents : [];
    for (const d of docs) {
      if (!d || !d.docType || !d.fileData) continue;
      await prisma.$executeRawUnsafe('INSERT INTO nominee_documents (nomineeId, docType, fileName, mimeType, fileData, uploadedBy) VALUES (?,?,?,?,?,?)', newId, clean(d.docType), clean(d.fileName), clean(d.mimeType), d.fileData, actorName(req));
    }

    await logAudit('CREATE', newId, access.emp.id, req, null, row);
    res.status(201).json({ id: newId, message: 'Nominee added.' });
  } catch (e) { console.error('nominee.create', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// POST /api/nominees/bulk  { employeeId, nominees: [...] }
// Transactional: creates ALL nominees (+ their documents) or NONE. Used by the
// Employee Registration wizard to save staged nominees together with the new
// employee — nominee records are only created AFTER the employee exists.
exports.bulkCreate = async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ error: 'You do not have permission to add nominees.' });
    const access = await scopeCheck(req, req.body.employeeId);
    if (!access.ok) return res.status(access.code).json({ error: access.error });
    const list = Array.isArray(req.body.nominees) ? req.body.nominees : [];
    if (!list.length) return res.status(200).json({ created: 0 });

    // Validate every nominee up-front + the combined allocation (fail before writing).
    let totalPct = 0;
    const seen = new Set();
    for (const n of list) {
      const err = validateNominee(n);
      if (err) return res.status(400).json({ error: `${clean(n.fullName) || 'Nominee'}: ${err}` });
      const dupKey = `${(clean(n.fullName) || '').toLowerCase()}|${(clean(n.relationship) || '').toLowerCase()}`;
      if (seen.has(dupKey)) return res.status(409).json({ error: `Duplicate nominee in the list: ${clean(n.fullName)} (${clean(n.relationship)}).` });
      seen.add(dupKey);
      totalPct += num(n.percentage);
    }
    if (totalPct > 100.01) return res.status(400).json({ error: `Total nomination is ${totalPct}%. It cannot exceed 100%.` });

    const created = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const n of list) {
        const row = rowFromBody(n, access.emp, req, true);
        const placeholders = COLS.map(() => '?').join(',');
        const values = COLS.map(c => row[c] === undefined ? null : row[c]);
        await tx.$executeRawUnsafe(`INSERT INTO employee_nominees (${COLS.join(',')}) VALUES (${placeholders})`, ...values);
        const idRows = await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
        const newId = Number(idRows[0].id);
        const docs = Array.isArray(n.documents) ? n.documents : [];
        for (const d of docs) {
          if (!d || !d.docType || !d.fileData) continue;
          await tx.$executeRawUnsafe('INSERT INTO nominee_documents (nomineeId, docType, fileName, mimeType, fileData, uploadedBy) VALUES (?,?,?,?,?,?)', newId, clean(d.docType), clean(d.fileName), clean(d.mimeType), d.fileData, actorName(req));
        }
        count++;
      }
      return count;
    });
    await logAudit('CREATE', null, access.emp.id, req, null, { bulkRegistration: created });
    res.status(201).json({ created, message: `${created} nominee(s) saved.` });
  } catch (e) { console.error('nominee.bulkCreate', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// PUT /api/nominees/:id
exports.update = async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ error: 'You do not have permission to edit nominees.' });
    const id = idParam(req.params.id);
    const existingRows = await prisma.$queryRawUnsafe('SELECT * FROM employee_nominees WHERE id = ?', id);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Nominee not found.' });
    const access = await scopeCheck(req, existing.employeeId);
    if (!access.ok) return res.status(access.code).json({ error: access.error });
    const err = validateNominee(req.body);
    if (err) return res.status(400).json({ error: err });

    const total = await activeTotal(access.emp.id, id);
    const newStatus = clean(req.body.status) || existing.status;
    if (newStatus === 'Active' && total + num(req.body.percentage) > 100.01) return res.status(400).json({ error: `Total nomination would be ${total + num(req.body.percentage)}%. It cannot exceed 100% (other active nominees use ${total}%).` });

    const row = rowFromBody(req.body, access.emp, req, false);
    const updCols = COLS.filter(c => c !== 'employeeId' && c !== 'companyId' && c !== 'createdBy');
    const setClause = updCols.map(c => `${c} = ?`).join(',');
    const values = updCols.map(c => row[c] === undefined ? null : row[c]);
    await prisma.$executeRawUnsafe(`UPDATE employee_nominees SET ${setClause} WHERE id = ?`, ...values, id);

    await logAudit('UPDATE', id, access.emp.id, req, existing, row);
    res.json({ id, message: 'Nominee updated.' });
  } catch (e) { console.error('nominee.update', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// DELETE /api/nominees/:id
exports.remove = async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ error: 'You do not have permission to delete nominees.' });
    const id = idParam(req.params.id);
    const rows = await prisma.$queryRawUnsafe('SELECT * FROM employee_nominees WHERE id = ?', id);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: 'Nominee not found.' });
    const access = await scopeCheck(req, existing.employeeId);
    if (!access.ok) return res.status(access.code).json({ error: access.error });
    await prisma.$executeRawUnsafe('DELETE FROM employee_nominees WHERE id = ?', id); // cascades documents
    await logAudit('DELETE', id, existing.employeeId, req, existing, null);
    res.json({ message: 'Nominee deleted.' });
  } catch (e) { console.error('nominee.remove', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// POST /api/nominees/:id/archive
exports.archive = async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ error: 'You do not have permission to archive nominees.' });
    const id = idParam(req.params.id);
    const rows = await prisma.$queryRawUnsafe('SELECT * FROM employee_nominees WHERE id = ?', id);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: 'Nominee not found.' });
    const access = await scopeCheck(req, existing.employeeId);
    if (!access.ok) return res.status(access.code).json({ error: access.error });
    const newStatus = existing.status === 'Archived' ? 'Active' : 'Archived';
    await prisma.$executeRawUnsafe('UPDATE employee_nominees SET status = ?, updatedBy = ? WHERE id = ?', newStatus, actorName(req), id);
    await logAudit('ARCHIVE', id, existing.employeeId, req, { status: existing.status }, { status: newStatus });
    res.json({ message: `Nominee ${newStatus === 'Archived' ? 'archived' : 'restored'}.`, status: newStatus });
  } catch (e) { console.error('nominee.archive', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// POST /api/nominees/:id/documents  { docType, fileName, mimeType, fileData }
exports.addDocument = async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ error: 'No permission.' });
    const id = idParam(req.params.id);
    const rows = await prisma.$queryRawUnsafe('SELECT employeeId FROM employee_nominees WHERE id = ?', id);
    if (!rows[0]) return res.status(404).json({ error: 'Nominee not found.' });
    const access = await scopeCheck(req, rows[0].employeeId);
    if (!access.ok) return res.status(access.code).json({ error: access.error });
    const { docType, fileName, mimeType, fileData } = req.body || {};
    if (!docType || !fileData) return res.status(400).json({ error: 'docType and fileData are required.' });
    await prisma.$executeRawUnsafe('INSERT INTO nominee_documents (nomineeId, docType, fileName, mimeType, fileData, uploadedBy) VALUES (?,?,?,?,?,?)', id, clean(docType), clean(fileName), clean(mimeType), fileData, actorName(req));
    res.status(201).json({ message: 'Document uploaded.' });
  } catch (e) { console.error('nominee.addDocument', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// GET /api/nominees/documents/:docId  → raw file data (for preview/download)
exports.getDocument = async (req, res) => {
  try {
    const docId = idParam(req.params.docId);
    const rows = await prisma.$queryRawUnsafe('SELECT d.*, n.employeeId FROM nominee_documents d JOIN employee_nominees n ON n.id = d.nomineeId WHERE d.id = ?', docId);
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    const access = await scopeCheck(req, doc.employeeId);
    if (!access.ok) return res.status(access.code).json({ error: access.error });
    res.json({ id: doc.id, docType: doc.docType, fileName: doc.fileName, mimeType: doc.mimeType, fileData: doc.fileData });
  } catch (e) { console.error('nominee.getDocument', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// DELETE /api/nominees/documents/:docId
exports.removeDocument = async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ error: 'No permission.' });
    const docId = idParam(req.params.docId);
    const rows = await prisma.$queryRawUnsafe('SELECT d.nomineeId, n.employeeId FROM nominee_documents d JOIN employee_nominees n ON n.id = d.nomineeId WHERE d.id = ?', docId);
    if (!rows[0]) return res.status(404).json({ error: 'Document not found.' });
    const access = await scopeCheck(req, rows[0].employeeId);
    if (!access.ok) return res.status(access.code).json({ error: access.error });
    await prisma.$executeRawUnsafe('DELETE FROM nominee_documents WHERE id = ?', docId);
    res.json({ message: 'Document removed.' });
  } catch (e) { console.error('nominee.removeDocument', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// GET /api/nominees/audit?employeeId=
exports.audit = async (req, res) => {
  try {
    const access = await scopeCheck(req, req.query.employeeId);
    if (!access.ok) return res.status(access.code).json({ error: access.error });
    const logs = await prisma.$queryRawUnsafe('SELECT * FROM nominee_audit_logs WHERE employeeId = ? ORDER BY id DESC LIMIT 200', access.emp.id);
    res.json(logs);
  } catch (e) { console.error('nominee.audit', e); res.status(500).json({ error: e.message || 'Server error' }); }
};
