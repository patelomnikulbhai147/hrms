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

// Tenders carry commercial terms (value) — only Company Head / Super Admin may
// create, edit, convert or delete. HR is view-only on tenders & contracts.
const canManageTenders = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);

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
        status: b.status || 'Draft',
        documentPath: b.documentPath || null,
        category: b.category || null,
        companyId: companyId ?? null,
        notes: b.notes || null,
        clientName: b.clientName || null,
        branchId: b.branchId ? idParam(b.branchId) : null,
        serviceType: b.serviceType || null,
        startDate: b.startDate || null,
        endDate: b.endDate || null,
        remarks: b.remarks || null,
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
    const fields = ['tenderNumber', 'tenderName', 'department', 'publishDate', 'closingDate', 'status', 'documentPath', 'category', 'notes',
      'clientName', 'serviceType', 'startDate', 'endDate', 'remarks'];
    const data = {};
    for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
    if (req.body.tenderValue !== undefined) data.tenderValue = Number(req.body.tenderValue) || 0;
    if (req.body.branchId !== undefined) data.branchId = req.body.branchId ? idParam(req.body.branchId) : null;
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

// POST /api/tenders/:id/convert — a Won tender becomes a Contract (1:1).
// Auto-fills the contract from the tender; idempotent (returns the existing
// contract if already converted).
exports.convertToContract = async (req, res) => {
  try {
    if (!canManageTenders(req)) return res.status(403).json({ error: 'Only a Company Head can convert a tender to a contract.' });
    const id = idParam(req.params.id);
    const tender = await prisma.tender.findUnique({ where: { id } });
    if (!tender) return res.status(404).json({ error: 'Tender not found.' });
    if (req.user?.role !== 'Super Admin') {
      const allowed = allowedIdsFor(req);
      if (tender.companyId && !allowed.includes(tender.companyId)) return res.status(403).json({ error: 'This tender is outside your workspace.' });
    }
    if (String(tender.status).toLowerCase() !== 'won') {
      return res.status(400).json({ error: 'Only a tender with status "Won" can be converted to a contract.' });
    }
    // Idempotent — if already converted, return the existing contract.
    if (tender.convertedContractId) {
      const existing = await prisma.contract.findUnique({ where: { id: tender.convertedContractId } });
      if (existing) return res.json({ contract: existing, alreadyConverted: true });
    }
    const companyId = tender.companyId || req.user?.companyId;
    if (!companyId) return res.status(400).json({ error: 'Tender has no company; cannot create a contract.' });

    const contract = await prisma.contract.create({
      data: {
        contractNumber: tender.tenderNumber ? `C-${tender.tenderNumber}` : null,
        contractName: tender.tenderName,
        clientName: tender.clientName || null,
        companyId,
        branchId: tender.branchId || null,
        tenderId: tender.id,
        contractValue: tender.tenderValue || 0,
        startDate: tender.startDate || null,
        endDate: tender.endDate || null,
        status: 'Active',
        documentPath: tender.documentPath || null,
        notes: tender.remarks || tender.notes || null,
      },
    });
    await prisma.tender.update({ where: { id }, data: { convertedContractId: contract.id } });
    res.status(201).json({ contract });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'This tender already has a contract.' });
    console.error('tender.convertToContract', e);
    res.status(500).json({ error: 'Could not convert the tender to a contract.' });
  }
};
