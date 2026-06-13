/**
 * Tender Information — future-ready tender management. The current version is a
 * placeholder (no live tender API integration), but the table + endpoints are
 * ready so real Government / Private / HR-Service / Recruitment / Vendor tenders
 * can be ingested later. Reads are workspace-scoped on the backend.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

const allowedIdsFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);

// Only management roles may mutate tender records (placeholder module).
const canManageTenders = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);

exports.getAll = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let where = {};
    if (req.user && req.user.role !== 'Super Admin') {
      const allowed = allowedIdsFor(req);
      // Company-wide tenders (companyId null) are visible to everyone; otherwise
      // scope to the caller's accessible companies.
      where.OR = [{ companyId: null }, { companyId: { in: allowed } }];
    } else if (companyId) {
      where.OR = [{ companyId: null }, { companyId }];
    }
    const tenders = await prisma.tender.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(tenders);
  } catch (e) {
    console.error('tender.getAll', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    if (!canManageTenders(req)) return res.status(403).json({ error: 'You do not have permission to manage tenders.' });
    const b = req.body || {};
    if (!b.tenderName || !String(b.tenderName).trim()) {
      return res.status(400).json({ error: 'Tender name is required.' });
    }
    let companyId = idParam(b.companyId || req.headers['x-workspace-id']);
    if (req.user && req.user.role !== 'Super Admin') {
      const allowed = allowedIdsFor(req);
      if (companyId && !allowed.includes(companyId)) {
        return res.status(403).json({ error: 'You cannot create tenders outside your workspace.' });
      }
      if (!companyId) companyId = req.user.companyId;
    }
    const tender = await prisma.tender.create({
      data: {
        tenderNumber: b.tenderNumber || null,
        tenderName: String(b.tenderName).trim(),
        department: b.department || null,
        tenderValue: Number(b.tenderValue) || 0,
        publishDate: b.publishDate || null,
        closingDate: b.closingDate || null,
        status: b.status || 'Upcoming',
        documentPath: b.documentPath || null,
        category: b.category || null,
        companyId: companyId ?? null,
        notes: b.notes || null,
      },
    });
    res.status(201).json(tender);
  } catch (e) {
    console.error('tender.create', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    if (!canManageTenders(req)) return res.status(403).json({ error: 'You do not have permission to manage tenders.' });
    const id = idParam(req.params.id);
    const fields = ['tenderNumber', 'tenderName', 'department', 'publishDate', 'closingDate', 'status', 'documentPath', 'category', 'notes'];
    const data = {};
    for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
    if (req.body.tenderValue !== undefined) data.tenderValue = Number(req.body.tenderValue) || 0;
    const tender = await prisma.tender.update({ where: { id }, data });
    res.json(tender);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tender not found.' });
    console.error('tender.update', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    if (!canManageTenders(req)) return res.status(403).json({ error: 'You do not have permission to manage tenders.' });
    const id = idParam(req.params.id);
    await prisma.tender.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tender not found.' });
    console.error('tender.remove', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
