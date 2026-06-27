/**
 * Company Profile — the Company Head's master repository for all company data.
 *
 * Reuses the existing single-source-of-truth tables: company fields live on the
 * `Company` model (written through the same whitelist as branding), company
 * documents reuse the `Document` model (employeeId = null), key personnel live in
 * the new `CompanyContact` table, branches come from the `Branch` model, and the
 * audit timeline is the global `AuditLog`. Every read is scoped to the caller's
 * OWN top-level company so one company can never see another's data.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

// ── Company resolution ───────────────────────────────────────────────────────
// Resolve the request to a single TOP-LEVEL company id. Branding/profile always
// lives on the parent company (never a branch), so branch ids and sub-company ids
// are resolved up to their parent. A non-Super-Admin is locked to their own
// company regardless of the workspace header (branch ids overlap company ids, so
// we never trust the header to widen scope).
async function resolveTopCompanyId(req) {
  const toParent = async (rawId) => {
    if (!rawId) return undefined;
    const asCompany = await prisma.company.findUnique({ where: { id: rawId } });
    if (asCompany) return asCompany.parentCompanyId || asCompany.id;
    const asBranch = await prisma.branch.findUnique({ where: { id: rawId } }).catch(() => null);
    return asBranch ? asBranch.companyId : rawId;
  };

  if (req.user?.role === 'Super Admin') {
    const raw = idParam(req.query.companyId || req.headers['x-workspace-id']);
    return await toParent(raw);
  }
  return await toParent(req.user?.companyId);
}

// Required-document checklist — used to flag MISSING company documents. Matching
// is by category first, then a loose name match, so an uploaded "GST Certificate"
// satisfies the GST requirement regardless of which field was used.
const REQUIRED_DOCS = [
  { key: 'incorporation', label: 'Certificate of Incorporation', category: 'Legal' },
  { key: 'pan', label: 'PAN Card', category: 'Tax' },
  { key: 'gst', label: 'GST Certificate', category: 'Tax' },
  { key: 'tan', label: 'TAN Certificate', category: 'Tax' },
  { key: 'pf', label: 'PF Registration Certificate', category: 'Labour' },
  { key: 'esi', label: 'ESI Registration Certificate', category: 'Labour' },
  { key: 'shops', label: 'Shops & Establishment Certificate', category: 'Labour' },
  { key: 'msme', label: 'MSME / Udyam Certificate', category: 'Business' },
];

const dayMs = 24 * 60 * 60 * 1000;

// Bucket a document by its expiry date. Returns { bucket, daysRemaining, color }.
function expiryStatus(expiryDate) {
  if (!expiryDate) return { bucket: 'valid', daysRemaining: null, color: 'green' };
  const exp = new Date(expiryDate);
  if (isNaN(exp.getTime())) return { bucket: 'valid', daysRemaining: null, color: 'green' };
  const today = new Date();
  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const e0 = Date.UTC(exp.getFullYear(), exp.getMonth(), exp.getDate());
  const days = Math.round((e0 - t0) / dayMs);
  if (days < 0) return { bucket: 'expired', daysRemaining: days, color: 'red' };
  if (days === 0) return { bucket: 'today', daysRemaining: 0, color: 'red' };
  if (days <= 30) return { bucket: 'd30', daysRemaining: days, color: 'amber' };
  if (days <= 60) return { bucket: 'd60', daysRemaining: days, color: 'amber' };
  if (days <= 90) return { bucket: 'd90', daysRemaining: days, color: 'amber' };
  return { bucket: 'valid', daysRemaining: days, color: 'green' };
}

// Company-scoped documents = filed against this company with NO employee owner.
async function companyDocuments(companyId) {
  return prisma.document.findMany({
    where: { companyId, employeeId: null },
    orderBy: { id: 'desc' },
  });
}

function computeDocumentHealth(docs) {
  const counts = { expired: 0, today: 0, d30: 0, d60: 0, d90: 0, valid: 0 };
  const enriched = docs.map((d) => {
    const st = expiryStatus(d.expiryDate);
    counts[st.bucket] = (counts[st.bucket] || 0) + 1;
    return { ...d, ...st };
  });
  // Missing required documents (by category, then loose name match).
  const present = docs.map((d) => ({
    category: (d.category || '').toLowerCase(),
    name: (d.name || '').toLowerCase(),
    type: (d.type || '').toLowerCase(),
  }));
  const missing = REQUIRED_DOCS.filter((r) => {
    const cat = r.category.toLowerCase();
    const lbl = r.label.toLowerCase();
    const key = r.key.toLowerCase();
    return !present.some((p) =>
      (p.category && p.category === cat && (p.name.includes(key) || p.name.includes(lbl.split(' ')[0]))) ||
      p.name.includes(lbl) || p.name.includes(key) || p.type.includes(key)
    );
  }).map((r) => ({ key: r.key, label: r.label, category: r.category }));

  return { counts, documents: enriched, missing, requiredTotal: REQUIRED_DOCS.length };
}

// Turn any caught error into an HONEST HTTP response. Maps Prisma's error codes
// (and its validation error) to clean 4xx messages so the UI shows the real cause
// (validation / not-found / duplicate / FK) instead of a raw 500 invocation dump.
// A genuine 5xx is reserved for unexpected server faults — never for bad input.
function sendError(res, e, label) {
  console.error(label, e);
  const code = e && e.code;
  if (code === 'P2025') return res.status(404).json({ error: 'Record not found.' });
  if (code === 'P2002') return res.status(409).json({ error: 'A record with this value already exists.' });
  if (code === 'P2003') return res.status(400).json({ error: 'A related record is missing or invalid.' });
  if (code === 'P2000') return res.status(400).json({ error: 'A value is too long for its field.' });
  // PrismaClientValidationError = wrong type / unknown field. Caller input problem.
  if (e && (e.name === 'PrismaClientValidationError' || /Invalid `prisma\./.test(e.message || ''))) {
    return res.status(400).json({ error: 'Invalid data: one or more fields have the wrong format. Please review your entries and try again.' });
  }
  return res.status(500).json({ error: (e && e.message) || 'Server error' });
}

// Coerce a value destined for a String? column. Numbers/booleans -> String,
// objects/arrays -> JSON. Prevents a stray non-string from tripping Prisma's
// type validation (the silent cause of compliance/document save failures).
function asStringCol(v) {
  if (v == null) return v;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return null; } }
  return String(v);
}

// Create a notification only if an identical one (same companyId + title) does not
// already exist — so reloading the profile never spams the bell.
async function notifyOnce(companyId, title, message, priority) {
  const existing = await prisma.notification.findFirst({ where: { companyId, title } });
  if (existing) return;
  await prisma.notification.create({
    data: {
      companyId,
      userId: null,
      type: 'document_expiry',
      title,
      message,
      priority: priority || 'medium',
      read: false,
      status: 'unread',
      timestamp: new Date().toISOString(),
    },
  });
}

// ── Endpoints ────────────────────────────────────────────────────────────────

// GET /api/company-profile — full aggregate for the module.
exports.getProfile = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'No company in context.' });

    const [company, contacts, docs, branches] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.companyContact.findMany({ where: { companyId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      companyDocuments(companyId),
      prisma.branch.findMany({ where: { companyId }, orderBy: [{ branchNo: 'asc' }, { id: 'asc' }] }),
    ]);
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    // Live employee headcount per branch (mirrors branchController).
    const branchIds = branches.map((b) => b.id);
    let totalBy = {}, activeBy = {};
    if (branchIds.length) {
      const [totalGroups, activeGroups] = await Promise.all([
        prisma.employee.groupBy({ by: ['branchId'], where: { branchId: { in: branchIds } }, _count: { _all: true } }),
        prisma.employee.groupBy({ by: ['branchId'], where: { branchId: { in: branchIds }, status: { in: ['Active', 'ACTIVE'] } }, _count: { _all: true } }),
      ]);
      totalBy = Object.fromEntries(totalGroups.map((g) => [g.branchId, g._count._all]));
      activeBy = Object.fromEntries(activeGroups.map((g) => [g.branchId, g._count._all]));
    }
    const enrichedBranches = branches.map((b) => ({
      ...b,
      headcount: totalBy[b.id] || 0,
      activeHeadcount: activeBy[b.id] || 0,
    }));

    res.json({
      company,
      contacts,
      documents: docs,
      branches: enrichedBranches,
      documentHealth: computeDocumentHealth(docs),
    });
  } catch (e) {
    console.error('companyProfile.getProfile', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /api/company-profile/document-health?notify=1 — buckets + missing + alerts.
exports.getDocumentHealth = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'No company in context.' });
    const docs = await companyDocuments(companyId);
    const health = computeDocumentHealth(docs);

    // Emit (deduped) notifications for expired / expiring / missing documents.
    if (String(req.query.notify) === '1') {
      for (const d of health.documents) {
        if (d.bucket === 'expired') {
          await notifyOnce(companyId, `Document expired: ${d.name}`, `"${d.name}" expired on ${d.expiryDate}. Please renew it.`, 'high');
        } else if (['today', 'd30'].includes(d.bucket)) {
          await notifyOnce(companyId, `Document expiring soon: ${d.name}`, `"${d.name}" expires on ${d.expiryDate} (${d.daysRemaining} day(s) left).`, 'high');
        } else if (['d60', 'd90'].includes(d.bucket)) {
          await notifyOnce(companyId, `Document expiring in ${d.daysRemaining} days: ${d.name}`, `"${d.name}" expires on ${d.expiryDate}.`, 'medium');
        }
      }
      for (const m of health.missing) {
        await notifyOnce(companyId, `Missing required document: ${m.label}`, `The required document "${m.label}" (${m.category}) has not been uploaded.`, 'medium');
      }
    }
    res.json(health);
  } catch (e) {
    console.error('companyProfile.getDocumentHealth', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /api/company-profile/audit — company-scoped audit timeline (profile,
// branding, company documents, contacts, branches). The global /api/audit is
// Super-Admin-only, so this returns only THIS company's changes.
exports.getAuditTimeline = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'No company in context.' });

    const [contacts, docs, branches] = await Promise.all([
      prisma.companyContact.findMany({ where: { companyId }, select: { id: true } }),
      prisma.document.findMany({ where: { companyId, employeeId: null }, select: { id: true } }),
      prisma.branch.findMany({ where: { companyId }, select: { id: true } }),
    ]);
    const contactIds = contacts.map((c) => String(c.id));
    const docIds = docs.map((d) => String(d.id));
    const branchIds = branches.map((b) => String(b.id));

    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { module: 'Company', targetId: String(companyId) },
          { module: 'Branding', targetId: String(companyId) },
          { module: 'CompanyContact', targetId: { in: contactIds.length ? contactIds : ['__none__'] } },
          { module: 'Document', targetId: { in: docIds.length ? docIds : ['__none__'] } },
          { module: 'Branch', targetId: { in: branchIds.length ? branchIds : ['__none__'] } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(req.query.limit) || 150, 500),
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    res.json(logs.map((l) => ({
      id: l.id,
      action: l.action,
      module: l.module,
      targetId: l.targetId,
      details: l.details,
      createdAt: l.createdAt,
      actorName: (l.user && (l.user.name || l.user.email)) || 'System',
      actorRole: (l.user && l.user.role) || '',
    })));
  } catch (e) {
    console.error('companyProfile.getAuditTimeline', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Statutory & Compliance (ComplianceRecord CRUD + summary + alerts) ────────
// Minimal mandatory catalog used ONLY for "missing mandatory" notifications. The
// full UI catalog (labels, grouping, icons, company-field prefill) lives on the
// frontend; this is a deliberately small mirror for server-side alerting.
const MANDATORY_COMPLIANCE = [
  { key: 'pf_registration', label: 'PF Registration' },
  { key: 'esi_registration', label: 'ESI Registration' },
  { key: 'professional_tax', label: 'Professional Tax Registration' },
  { key: 'gst_registration', label: 'GST Registration' },
  { key: 'pan', label: 'PAN' },
  { key: 'tan', label: 'TAN' },
  { key: 'shops_establishment', label: 'Shops & Establishment Registration' },
];

// Compute the display status + day counters from a record's dates.
function complianceStatus(rec) {
  if (!rec.expiryDate) {
    return { displayStatus: rec.status || 'Active', daysRemaining: null, overdueDays: null };
  }
  const e = new Date(rec.expiryDate);
  if (isNaN(e.getTime())) return { displayStatus: rec.status || 'Active', daysRemaining: null, overdueDays: null };
  const t = new Date();
  const days = Math.round((Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / dayMs);
  const reminder = Number(rec.reminderDays) || 90;
  if (days < 0) return { displayStatus: 'Expired', daysRemaining: days, overdueDays: -days };
  // Pending Renewal: a renewal date set and already passed, but not yet expired.
  if (rec.renewalDate) {
    const r = new Date(rec.renewalDate);
    if (!isNaN(r.getTime())) {
      const rdays = Math.round((Date.UTC(r.getFullYear(), r.getMonth(), r.getDate()) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / dayMs);
      if (rdays < 0) return { displayStatus: 'Pending Renewal', daysRemaining: days, overdueDays: null };
    }
  }
  if (days <= reminder) return { displayStatus: 'Expiring Soon', daysRemaining: days, overdueDays: null };
  return { displayStatus: 'Active', daysRemaining: days, overdueDays: null };
}

const ALERT_THRESHOLDS = [180, 90, 60, 30, 15, 7];

exports.listCompliance = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'No company in context.' });
    const records = await prisma.complianceRecord.findMany({ where: { companyId }, orderBy: [{ category: 'asc' }, { id: 'asc' }] });
    const enriched = records.map((r) => ({ ...r, ...complianceStatus(r) }));

    // Summary buckets for the dashboard cards.
    const summary = {
      total: enriched.length,
      active: enriched.filter((r) => r.displayStatus === 'Active').length,
      expiring90: enriched.filter((r) => r.daysRemaining != null && r.daysRemaining >= 0 && r.daysRemaining <= 90).length,
      expiring30: enriched.filter((r) => r.daysRemaining != null && r.daysRemaining >= 0 && r.daysRemaining <= 30).length,
      expired: enriched.filter((r) => r.displayStatus === 'Expired').length,
      pendingRenewal: enriched.filter((r) => r.displayStatus === 'Pending Renewal').length,
    };
    const presentKeys = new Set(enriched.map((r) => r.complianceKey));
    const missingMandatory = MANDATORY_COMPLIANCE.filter((m) => !presentKeys.has(m.key));
    summary.missingMandatory = missingMandatory.length;

    // Deduped alerts (expiry thresholds + missing mandatory).
    if (String(req.query.notify) === '1') {
      for (const r of enriched) {
        if (r.displayStatus === 'Expired') {
          await notifyOnce(companyId, `Compliance expired: ${r.name}`, `"${r.name}" expired on ${r.expiryDate} (${r.overdueDays} day(s) overdue). Renew immediately.`, 'high');
        } else if (r.daysRemaining != null && r.daysRemaining >= 0) {
          const hit = ALERT_THRESHOLDS.find((t) => r.daysRemaining <= t);
          if (r.daysRemaining === 0) await notifyOnce(companyId, `Compliance expires today: ${r.name}`, `"${r.name}" expires today.`, 'high');
          else if (hit) await notifyOnce(companyId, `Compliance expiring (~${hit}d): ${r.name}`, `"${r.name}" expires on ${r.expiryDate} (${r.daysRemaining} day(s) left).`, hit <= 30 ? 'high' : 'medium');
        }
      }
      for (const m of missingMandatory) {
        await notifyOnce(companyId, `Mandatory compliance missing: ${m.label}`, `The mandatory compliance "${m.label}" has not been recorded.`, 'high');
      }
    }
    res.json({ records: enriched, summary, missingMandatory });
  } catch (e) {
    console.error('companyProfile.listCompliance', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

const COMPLIANCE_FIELDS = ['category', 'complianceKey', 'name', 'mandatory', 'registrationNumber', 'certificateNumber',
  'issuingAuthority', 'issueDate', 'expiryDate', 'renewalDate', 'status', 'reminderDays', 'assignedTo', 'uploadedBy', 'remarks',
  'fileData', 'mimeType', 'fileName', 'fileSize', 'versionHistory'];
// String columns on ComplianceRecord — anything non-string the client sends here
// (e.g. fileSize as a number, versionHistory as an array) is coerced so the save
// never fails with a Prisma type error.
const COMPLIANCE_STRING_COLS = ['category', 'complianceKey', 'name', 'registrationNumber', 'certificateNumber',
  'issuingAuthority', 'issueDate', 'expiryDate', 'renewalDate', 'status', 'assignedTo', 'uploadedBy', 'remarks',
  'fileData', 'mimeType', 'fileName', 'fileSize', 'versionHistory'];
function pickCompliance(body) {
  const data = {};
  for (const f of COMPLIANCE_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  if (data.mandatory !== undefined) data.mandatory = !!data.mandatory;
  if (data.reminderDays !== undefined) data.reminderDays = data.reminderDays === '' || data.reminderDays == null ? null : Number(data.reminderDays);
  for (const f of COMPLIANCE_STRING_COLS) if (data[f] !== undefined) data[f] = asStringCol(data[f]);
  return data;
}

exports.createCompliance = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'No company in context.' });
    const data = pickCompliance(req.body);
    if (!data.name || !String(data.name).trim()) return res.status(400).json({ error: 'Compliance name is required.' });
    if (!data.category) data.category = 'Other';
    if (!data.complianceKey) data.complianceKey = `custom_${Date.now()}`;
    if (!data.uploadedBy) data.uploadedBy = actorName(req);
    const created = await prisma.complianceRecord.create({ data: { ...data, companyId } });
    res.status(201).json(created);
  } catch (e) {
    sendError(res, e, 'companyProfile.createCompliance');
  }
};

exports.updateCompliance = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.complianceRecord.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Compliance record not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) {
      return res.status(403).json({ error: 'This compliance record is outside your company.' });
    }
    const updated = await prisma.complianceRecord.update({ where: { id }, data: pickCompliance(req.body) });
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'companyProfile.updateCompliance');
  }
};

exports.deleteCompliance = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.complianceRecord.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Compliance record not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) {
      return res.status(403).json({ error: 'This compliance record is outside your company.' });
    }
    await prisma.complianceRecord.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) {
    sendError(res, e, 'companyProfile.deleteCompliance');
  }
};

// ── Contacts & Management (CompanyContact CRUD) ──────────────────────────────
const CONTACT_FIELDS = ['name', 'designation', 'roleKey', 'mobile', 'email', 'photo', 'signature', 'sortOrder'];
function pickContact(body) {
  const data = {};
  for (const f of CONTACT_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  if (data.sortOrder !== undefined) data.sortOrder = Number(data.sortOrder) || 0;
  return data;
}

exports.listContacts = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'No company in context.' });
    const contacts = await prisma.companyContact.findMany({ where: { companyId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    res.json(contacts);
  } catch (e) {
    console.error('companyProfile.listContacts', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.createContact = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'No company in context.' });
    const data = pickContact(req.body);
    if (!data.name || !String(data.name).trim()) return res.status(400).json({ error: 'Contact name is required.' });
    const created = await prisma.companyContact.create({ data: { ...data, companyId } });
    res.status(201).json(created);
  } catch (e) {
    sendError(res, e, 'companyProfile.createContact');
  }
};

exports.updateContact = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.companyContact.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Contact not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) {
      return res.status(403).json({ error: 'This contact is outside your company.' });
    }
    const updated = await prisma.companyContact.update({ where: { id }, data: pickContact(req.body) });
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'companyProfile.updateContact');
  }
};

exports.deleteContact = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.companyContact.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Contact not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) {
      return res.status(403).json({ error: 'This contact is outside your company.' });
    }
    await prisma.companyContact.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) {
    sendError(res, e, 'companyProfile.deleteContact');
  }
};

// ── Company Documents (reuse Document model, employeeId = null) ───────────────
const DOC_FIELDS = ['name', 'type', 'category', 'documentNumber', 'issuingAuthority',
  'issueDate', 'expiryDate', 'renewalDate', 'remarks', 'status', 'url', 'fileData', 'mimeType', 'size'];
function pickDoc(body) {
  const data = {};
  for (const f of DOC_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  // All Document text columns — coerce so a numeric size / object never 500s.
  for (const f of DOC_FIELDS) if (data[f] !== undefined) data[f] = asStringCol(data[f]);
  return data;
}
function actorName(req) {
  return (req.user && (req.user.name || req.user.email || req.user.username)) || 'System';
}

exports.listDocuments = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'No company in context.' });
    res.json(await companyDocuments(companyId));
  } catch (e) {
    console.error('companyProfile.listDocuments', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.createDocument = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'No company in context.' });
    const data = pickDoc(req.body);
    if (!data.name || !String(data.name).trim()) return res.status(400).json({ error: 'A document name is required.' });
    const created = await prisma.document.create({
      data: {
        ...data,
        companyId,
        employeeId: null,
        type: data.type || data.category || 'Company',
        uploadedBy: actorName(req),
        uploadedOn: new Date().toISOString().split('T')[0],
        size: data.size || '—',
        status: data.status || 'Verified',
      },
    });
    res.status(201).json(created);
  } catch (e) {
    sendError(res, e, 'companyProfile.createDocument');
  }
};

exports.updateDocument = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Document not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) {
      return res.status(403).json({ error: 'This document is outside your company.' });
    }
    const data = pickDoc(req.body);
    data.editedBy = actorName(req);
    data.editedOn = new Date().toISOString();
    const updated = await prisma.document.update({ where: { id }, data });
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'companyProfile.updateDocument');
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const companyId = await resolveTopCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Document not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) {
      return res.status(403).json({ error: 'This document is outside your company.' });
    }
    await prisma.document.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) {
    sendError(res, e, 'companyProfile.deleteDocument');
  }
};
