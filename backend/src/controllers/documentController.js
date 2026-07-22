const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { lockRejection } = require('../utils/employeeStatus');
const { grantedCompanyIds, grantedBranchIds, canReachCompany } = require('../utils/companyScope');

// Real columns on the Document model. Any other key in the request body (e.g. a
// frontend-only `link`, `branchLocation`, or a stale `id` from a spread) is
// dropped so Prisma never rejects the whole write with "Unknown argument".
const DOCUMENT_FIELDS = [
  'companyId', 'branchId', 'name', 'type', 'employeeId', 'employeeName',
  'uploadedBy', 'uploadedOn', 'size', 'url', 'fileData', 'mimeType',
  'documentNumber', 'issueDate', 'expiryDate', 'remarks',
  'verifiedBy', 'verifiedOn', 'editedBy', 'editedOn', 'status',
];
// Numeric FK/identity columns — the frontend often sends these as strings.
const ID_FIELDS = ['companyId', 'branchId', 'employeeId'];

// Whitelist + coerce the request body into a safe Prisma `data` object.
function pickDocumentData(body) {
  const data = {};
  for (const key of DOCUMENT_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  for (const key of ID_FIELDS) {
    if (data[key] === '' || data[key] === null) {
      data[key] = null;
    } else if (data[key] !== undefined) {
      const n = idParam(data[key]);
      data[key] = n === undefined ? null : n;
    }
  }
  return data;
}

// Human-readable actor for the audit trail (never trust a client-supplied name).
function actorName(req, fallback) {
  return (req.user && (req.user.name || req.user.email || req.user.username)) || fallback || 'System';
}

// A document filed against a PREVIOUS (offboarded) employee belongs to a locked
// historical record: it stays readable and downloadable, but nothing may be
// uploaded, edited or removed until the person is re-onboarded. Returns an error
// body to send, or null when the write is allowed.
async function employeeLockCheck(employeeId, user) {
  if (!employeeId) return null;
  const emp = await prisma.employee.findUnique({
    where: { id: idParam(employeeId) },
    select: { status: true, name: true },
  });
  if (!emp) return null;
  return lockRejection(emp.status, user, emp.name || 'This employee');
}

// GET /documents/:id/file — the contents of ONE document.
// Pairs with getAll, which deliberately omits `fileData`. Scoped exactly like the
// list, so omitting the blob from the list cannot become a way to read another
// tenant's file by id.
exports.getFile = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Document id required.' });

    const doc = await prisma.document.findUnique({
      where: { id },
      select: { id: true, companyId: true, branchId: true, name: true, mimeType: true, fileData: true },
    });
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    // 404 rather than 403: the existence of another tenant's document id is
    // itself information not worth confirming.
    const reachable = canReachCompany(req, doc.companyId)
      || (doc.branchId != null && canReachCompany(req, doc.branchId));
    if (!reachable) return res.status(404).json({ error: 'Document not found.' });

    if (!doc.fileData) return res.status(404).json({ error: 'This document has no attached file.' });
    res.json({ id: doc.id, fileData: doc.fileData, mimeType: doc.mimeType, name: doc.name });
  } catch (error) {
    console.error('document.getFile', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      // Scope to the user's companies AND the branches under them, so a branch
      // sub-workspace resolves (branch ids no longer collide with company ids).
      // Numbers — accessibleCompanyIds holds strings, and feeding those to a
      // Prisma `in` against an Int column silently matched nothing.
      const companyScope = grantedCompanyIds(req);
      const branchScope = grantedBranchIds(req);
      const allowedIds = [...companyScope, ...branchScope];
      whereClause.OR = [
        { companyId: { in: companyScope } },
        { branchId: { in: branchScope.length ? branchScope : companyScope } }
      ];
      if (companyId) {
        if (!allowedIds.includes(companyId)) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        whereClause = { OR: [{ companyId: companyId }, { branchId: companyId }] };
      }
    } else if (companyId) {
      whereClause = { OR: [{ companyId: companyId }, { branchId: companyId }] };
    }

    const data = await prisma.document.findMany({
      where: whereClause,
      orderBy: { id: 'asc' },
    });

    // A LIST must not carry file CONTENTS. `fileData` is a base64 data URL of the
    // whole upload: in production it was 99.9% of this response (1.1 MB for four
    // documents), re-downloaded on every login and workspace switch even though
    // nothing on the list screen renders it — only an explicit download does.
    // The metadata the list actually shows (name, type, size) is kept, plus
    // `hasFile` so the UI can still tell "no attachment" from "not loaded yet".
    // Contents come from GET /documents/:id/file.
    res.json(data.map(({ fileData, ...rest }) => ({ ...rest, hasFile: !!fileData })));
  } catch (error) {
    console.error('Error fetching', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const data = pickDocumentData(req.body);
    delete data.id; // never trust a client primary key — the DB autoincrements

    if (!data.companyId) {
      return res.status(400).json({ error: 'companyId is required to file a document.' });
    }
    if (!data.name) {
      return res.status(400).json({ error: 'A document name is required.' });
    }

    const locked = await employeeLockCheck(data.employeeId, req.user);
    if (locked) return res.status(403).json(locked);

    // Audit + sensible defaults
    if (!data.uploadedBy) data.uploadedBy = actorName(req);
    if (!data.uploadedOn) data.uploadedOn = new Date().toISOString().split('T')[0];
    if (!data.size) data.size = '—';
    if (!data.status) data.status = 'Pending';

    const created = await prisma.document.create({ data });
    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const data = pickDocumentData(req.body);
    delete data.id;

    const current = await prisma.document.findUnique({ where: { id: idParam(id) } });
    if (!current) return res.status(404).json({ error: 'Document not found.' });

    // Checked against BOTH the current owner and any employee the document is
    // being re-pointed at, so a locked record can neither be edited nor become
    // the new home of an edited document.
    for (const owner of [current.employeeId, data.employeeId]) {
      const locked = await employeeLockCheck(owner, req.user);
      if (locked) return res.status(403).json(locked);
    }

    const actor = actorName(req);
    const nowIso = new Date().toISOString();

    // Verification audit: only stamp verifiedBy/On when the status actually
    // transitions into a verified/rejected state (not on a plain detail edit of
    // an already-verified document).
    const statusChanged = data.status !== undefined && data.status !== current.status;
    if (statusChanged && (data.status === 'Verified' || data.status === 'Rejected')) {
      data.verifiedBy = actor;
      data.verifiedOn = nowIso;
    }
    // "Last edited" audit on every update.
    data.editedBy = actor;
    data.editedOn = nowIso;

    const updated = await prisma.document.update({
      where: { id: idParam(id) },
      data,
    });
    res.json(updated);
  } catch (error) {
    console.error('Error updating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.document.findUnique({ where: { id: idParam(id) } });
    if (existing) {
      const locked = await employeeLockCheck(existing.employeeId, req.user);
      if (locked) return res.status(403).json(locked);
    }
    await prisma.document.delete({ where: { id: idParam(id) } });
    // Deletion audit (hard delete keeps the existing workflow; we log the actor
    // for traceability — a persisted "deletedBy" would require soft-delete).
    console.log(`[documents] ${actorName(req)} deleted document #${id}` +
      (existing ? ` (${existing.name}, employee ${existing.employeeId || '—'})` : ''));
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
