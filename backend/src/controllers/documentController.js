const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

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

exports.getAll = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      // Scope to the user's companies AND the branches under them, so a branch
      // sub-workspace resolves (branch ids no longer collide with company ids).
      const companyScope = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      const branchScope = (req.user.accessibleBranchIds || []).filter(Boolean);
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
    res.json(data);
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
