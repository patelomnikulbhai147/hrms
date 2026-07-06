// Finance & Compliance → Documents. CRUD + summary for the isolated
// `compliance_documents` store. Company-scoped, RBAC via complianceScope.
// Deliberately separate from the generic Document module so the two never mix.
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { canView, canEdit, canManage, actorOf, isSuperAdmin, scopedWhere } = require('../utils/complianceScope');

// The statutory document categories the module ships with. Custom names are also
// allowed (free text) — this list drives the dropdown + the "Compliance
// Certificates" KPI. Kept here so the frontend and backend never drift.
const DEFAULT_CATEGORIES = [
  'Employee Loan Agreement', 'Salary Advance Agreement', 'PF Challan', 'ESI Challan',
  'Professional Tax', 'Labour Welfare Fund', 'GST Return', 'TDS Return',
  'Bonus Register', 'Gratuity Register', 'Custom Document',
];
const STATUSES = ['Pending', 'Verified', 'Active', 'Rejected', 'Expired', 'Archived'];
// Categories that represent a compliance CERTIFICATE (for the KPI card).
const CERTIFICATE_CATEGORIES = new Set(['PF Challan', 'ESI Challan', 'Professional Tax', 'Labour Welfare Fund', 'GST Return', 'TDS Return']);

// Which company a WRITE targets — the VIEWED workspace (validated against the
// user's scope), falling back to their home company. Mirrors the loan-type fix
// so a multi-company user files documents against the company they're viewing.
function writeCompanyId(req, requested) {
  const workspaceId = idParam(requested || req.query.companyId || req.headers['x-workspace-id']);
  if (isSuperAdmin(req)) return workspaceId || null;
  const scope = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
  if (workspaceId && scope.includes(workspaceId)) return workspaceId;
  return req.user?.companyId || null;
}

// Derived expiry state from expiryDate (does not overwrite an explicit terminal
// status like Rejected/Archived). null = no expiry set.
function expiryState(expiryDate) {
  if (!expiryDate) return null;
  const days = Math.round((new Date(expiryDate).getTime() - Date.now()) / 864e5);
  if (Number.isNaN(days)) return null;
  if (days < 0) return 'Expired';
  if (days <= 30) return 'Expiring Soon';
  return 'Valid';
}

// Strip the heavy base64 blob from list payloads; keep a hasFile flag.
function toListRow(d) {
  const { fileData, ...rest } = d;
  return { ...rest, hasFile: !!(fileData || d.url), expiryState: expiryState(d.expiryDate) };
}

function appendHistory(existing, event) {
  const list = Array.isArray(existing) ? existing.slice() : [];
  list.push(event);
  return list;
}

// GET /api/compliance-documents  (+ filters)
exports.list = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorised workspace.' });

    const { q, category, complianceType, employeeId, branchId, department, status, dateFrom, dateTo, source, sourceRef } = req.query;
    const AND = [base];
    if (category) AND.push({ category: String(category) });
    if (complianceType) AND.push({ complianceType: String(complianceType) });
    if (employeeId) AND.push({ employeeId: idParam(employeeId) });
    if (branchId) AND.push({ branchId: idParam(branchId) });
    if (department) AND.push({ department: String(department) });
    if (status) AND.push({ status: String(status) });
    // source/sourceRef scope a record's attachments (e.g. a single loan/advance).
    // `source` accepts a comma list (e.g. "Loan,Advance").
    if (source) {
      const arr = String(source).split(',').map((s) => s.trim()).filter(Boolean);
      AND.push(arr.length > 1 ? { source: { in: arr } } : { source: arr[0] });
    }
    if (sourceRef) AND.push({ sourceRef: String(sourceRef) });
    if (dateFrom) AND.push({ uploadedOn: { gte: String(dateFrom) } });
    if (dateTo) AND.push({ uploadedOn: { lte: String(dateTo) } });
    if (q) {
      const s = String(q);
      AND.push({ OR: [
        { name: { contains: s } },
        { tags: { contains: s } },
        { employeeName: { contains: s } },
        { category: { contains: s } },
        { description: { contains: s } },
      ] });
    }

    const rows = await prisma.complianceDocument.findMany({
      where: { AND },
      orderBy: { id: 'desc' },
      // Never ship base64 blobs in the list — fetch a single doc for view/download.
      select: {
        id: true, companyId: true, branchId: true, name: true, category: true, complianceType: true,
        employeeId: true, employeeName: true, department: true, fileName: true, mimeType: true, size: true,
        url: true, issueDate: true, expiryDate: true, description: true, tags: true, status: true,
        source: true, sourceRef: true, uploadedBy: true, uploadedOn: true, verifiedBy: true, verifiedOn: true,
        editedBy: true, editedOn: true, createdAt: true, updatedAt: true,
        fileData: false,
      },
    });
    res.json(rows.map((d) => ({ ...d, hasFile: !!(d.fileName || d.url), expiryState: expiryState(d.expiryDate) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /api/compliance-documents/summary — dashboard KPI cards.
exports.summary = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorised workspace.' });

    const rows = await prisma.complianceDocument.findMany({
      where: base,
      select: { category: true, status: true, expiryDate: true, uploadedOn: true },
    });
    const monthPrefix = new Date().toISOString().slice(0, 7); // yyyy-mm
    let total = 0, pending = 0, expiringSoon = 0, expired = 0, thisMonth = 0, certificates = 0;
    for (const d of rows) {
      total++;
      if (d.status === 'Pending') pending++;
      const es = expiryState(d.expiryDate);
      if (es === 'Expiring Soon') expiringSoon++;
      else if (es === 'Expired') expired++;
      if (String(d.uploadedOn || '').slice(0, 7) === monthPrefix) thisMonth++;
      if (CERTIFICATE_CATEGORIES.has(d.category)) certificates++;
    }
    res.json({ total, pendingVerification: pending, expiringSoon, expired, uploadedThisMonth: thisMonth, complianceCertificates: certificates });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /api/compliance-documents/categories — dropdown source (defaults + custom).
exports.categories = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorised workspace.' });
    const used = await prisma.complianceDocument.findMany({ where: base, select: { category: true }, distinct: ['category'] });
    const custom = used.map((u) => u.category).filter((c) => c && !DEFAULT_CATEGORIES.includes(c));
    res.json({ categories: [...DEFAULT_CATEGORIES, ...custom], statuses: STATUSES });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /api/compliance-documents/:id — single doc WITH fileData (view/download/history).
exports.get = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const id = idParam(req.params.id);
    const doc = await prisma.complianceDocument.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorised workspace.' });
    // Company isolation: a non-Super-Admin can only read docs in their scope.
    if (!isSuperAdmin(req)) {
      const scope = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
      if (!scope.includes(doc.companyId)) return res.status(403).json({ error: 'Not your company.' });
    }
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /api/compliance-documents
exports.create = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised to upload documents.' });
    const companyId = writeCompanyId(req, req.body.companyId);
    if (!companyId) return res.status(400).json({ error: 'Company context required.' });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'A document name is required.' });
    const category = String(req.body.category || '').trim();
    if (!category) return res.status(400).json({ error: 'A document category is required.' });

    const actor = actorOf(req);
    const today = new Date().toISOString().slice(0, 10);
    const b = req.body;
    const created = await prisma.complianceDocument.create({
      data: {
        companyId,
        branchId: b.branchId ? idParam(b.branchId) : null,
        name, category,
        complianceType: b.complianceType || null,
        employeeId: b.employeeId ? idParam(b.employeeId) : null,
        employeeName: b.employeeName || null,
        department: b.department || null,
        fileName: b.fileName || null,
        fileData: b.fileData || null,
        mimeType: b.mimeType || null,
        size: b.size || null,
        url: b.url || null,
        issueDate: b.issueDate || null,
        expiryDate: b.expiryDate || null,
        description: b.description || null,
        tags: b.tags || null,
        status: b.status || 'Pending',
        source: b.source || 'Manual',
        sourceRef: b.sourceRef || null,
        uploadedBy: actor,
        uploadedOn: today,
        history: [{ action: 'Uploaded', by: actor, at: new Date().toISOString(), note: category }],
      },
    });
    res.status(201).json(created);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// PUT /api/compliance-documents/:id — edit details and/or replace the file.
exports.update = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised.' });
    const id = idParam(req.params.id);
    const existing = await prisma.complianceDocument.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Document not found.' });
    if (!isSuperAdmin(req)) {
      const scope = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
      if (!scope.includes(existing.companyId)) return res.status(403).json({ error: 'Not your company.' });
    }
    const actor = actorOf(req);
    const nowIso = new Date().toISOString();
    const b = req.body;
    const data = { editedBy: actor, editedOn: nowIso };
    // Simple detail fields.
    for (const f of ['name', 'category', 'complianceType', 'employeeName', 'department', 'issueDate', 'expiryDate', 'description', 'tags', 'status']) {
      if (b[f] !== undefined) data[f] = b[f];
    }
    if (b.branchId !== undefined) data.branchId = b.branchId ? idParam(b.branchId) : null;
    if (b.employeeId !== undefined) data.employeeId = b.employeeId ? idParam(b.employeeId) : null;

    const isReplace = b.fileData !== undefined && b.fileData !== null && b.fileData !== '';
    if (isReplace) {
      data.fileData = b.fileData;
      data.fileName = b.fileName || existing.fileName;
      data.mimeType = b.mimeType || existing.mimeType;
      data.size = b.size || existing.size;
      data.url = b.url ?? existing.url;
    } else if (b.url !== undefined) {
      data.url = b.url || null;
    }

    // Verification audit when status flips to a verified/terminal state.
    if (b.status !== undefined && b.status !== existing.status && (b.status === 'Verified' || b.status === 'Rejected')) {
      data.verifiedBy = actor;
      data.verifiedOn = nowIso;
    }

    const action = isReplace ? 'File replaced'
      : (b.status !== undefined && b.status !== existing.status) ? `Status → ${b.status}`
      : 'Details edited';
    data.history = appendHistory(existing.history, { action, by: actor, at: nowIso, note: b.historyNote || null });

    const updated = await prisma.complianceDocument.update({ where: { id }, data });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// DELETE /api/compliance-documents/:id
exports.remove = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Not authorised to delete documents.' });
    const id = idParam(req.params.id);
    const existing = await prisma.complianceDocument.findUnique({ where: { id }, select: { id: true, companyId: true, name: true } });
    if (!existing) return res.status(404).json({ error: 'Document not found.' });
    if (!isSuperAdmin(req)) {
      const scope = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
      if (!scope.includes(existing.companyId)) return res.status(403).json({ error: 'Not your company.' });
    }
    await prisma.complianceDocument.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

module.exports.DEFAULT_CATEGORIES = DEFAULT_CATEGORIES;
