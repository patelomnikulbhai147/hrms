/**
 * Contracts — part of the Tenders & Contracts module. A contract is created from
 * a Won tender (see tenderController.convertToContract) or directly. Reads are
 * company-scoped; commercial mutations are limited to Company Head / Super Admin.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

const allowedIdsFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
const isSuper = (req) => req.user?.role === 'Super Admin';
// Commercial actions (values/terms): Company Head + Super Admin. HR is view-only.
const canManageCommercial = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);

// Auto-derive a display status from the end date when the stored status is open.
function deriveStatus(stored, endDate) {
  if (stored === 'Closed') return 'Closed';
  if (!endDate) return stored || 'Active';
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return stored || 'Active';
  const days = Math.ceil((end - new Date()) / 86400000);
  if (days < 0) return 'Expired';
  if (days <= 90) return 'Expiring Soon';
  return 'Active';
}

exports.getAll = async (req, res) => {
  try {
    const where = {};
    if (!isSuper(req)) where.companyId = { in: allowedIdsFor(req) };
    else if (req.query.companyId) where.companyId = idParam(req.query.companyId);

    const contracts = await prisma.contract.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        sites: { select: { id: true, siteName: true, requiredHeadcount: true } },
        _count: { select: { sites: true, deployments: true } },
      },
    });
    const withDerived = contracts.map((c) => ({
      ...c,
      derivedStatus: deriveStatus(c.status, c.endDate),
      requiredHeadcount: c.sites.reduce((s, x) => s + (x.requiredHeadcount || 0), 0),
      assignedHeadcount: c._count.deployments,
    }));
    res.json(withDerived);
  } catch (e) {
    console.error('contract.getAll', e);
    res.status(500).json({ error: 'Could not load contracts.' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const c = await prisma.contract.findUnique({
      where: { id },
      include: {
        sites: { orderBy: { createdAt: 'asc' } },
        deployments: { include: { employee: { select: { id: true, name: true, employeeId: true, designation: true } }, site: { select: { id: true, siteName: true } } } },
      },
    });
    if (!c) return res.status(404).json({ error: 'Contract not found.' });
    if (!isSuper(req) && !allowedIdsFor(req).includes(c.companyId)) {
      return res.status(403).json({ error: 'This contract is outside your workspace.' });
    }
    res.json({ ...c, derivedStatus: deriveStatus(c.status, c.endDate) });
  } catch (e) {
    console.error('contract.getOne', e);
    res.status(500).json({ error: 'Could not load the contract.' });
  }
};

exports.create = async (req, res) => {
  try {
    if (!canManageCommercial(req)) return res.status(403).json({ error: 'Only a Company Head can manage contracts.' });
    const b = req.body || {};
    if (!b.contractName || !String(b.contractName).trim()) return res.status(400).json({ error: 'Contract name is required.' });
    let companyId = idParam(b.companyId || req.headers['x-workspace-id']);
    if (!isSuper(req)) {
      const allowed = allowedIdsFor(req);
      if (companyId && !allowed.includes(companyId)) return res.status(403).json({ error: 'You cannot create contracts outside your workspace.' });
      if (!companyId) companyId = req.user.companyId;
    }
    if (!companyId) return res.status(400).json({ error: 'A company/workspace is required.' });
    const c = await prisma.contract.create({
      data: {
        contractNumber: b.contractNumber || null,
        contractName: String(b.contractName).trim(),
        clientName: b.clientName || null,
        companyId,
        branchId: b.branchId ? idParam(b.branchId) : null,
        tenderId: b.tenderId ? idParam(b.tenderId) : null,
        contractValue: Number(b.contractValue) || 0,
        startDate: b.startDate || null,
        endDate: b.endDate || null,
        status: b.status || 'Active',
        documentPath: b.documentPath || null,
        notes: b.notes || null,
      },
    });
    res.status(201).json(c);
  } catch (e) {
    console.error('contract.create', e);
    res.status(500).json({ error: 'Could not create the contract.' });
  }
};

exports.update = async (req, res) => {
  try {
    if (!canManageCommercial(req)) return res.status(403).json({ error: 'Only a Company Head can edit contracts.' });
    const id = idParam(req.params.id);
    const existing = await prisma.contract.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Contract not found.' });
    if (!isSuper(req) && !allowedIdsFor(req).includes(existing.companyId)) return res.status(403).json({ error: 'This contract is outside your workspace.' });

    const b = req.body || {};
    const data = {};
    for (const f of ['contractNumber', 'contractName', 'clientName', 'startDate', 'endDate', 'status', 'documentPath', 'notes']) {
      if (b[f] !== undefined) data[f] = b[f];
    }
    if (b.contractValue !== undefined) data.contractValue = Number(b.contractValue) || 0;
    if (b.branchId !== undefined) data.branchId = b.branchId ? idParam(b.branchId) : null;
    const c = await prisma.contract.update({ where: { id }, data });
    res.json(c);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Contract not found.' });
    console.error('contract.update', e);
    res.status(500).json({ error: 'Could not update the contract.' });
  }
};

exports.remove = async (req, res) => {
  try {
    if (!canManageCommercial(req)) return res.status(403).json({ error: 'Only a Company Head can delete contracts.' });
    const id = idParam(req.params.id);
    const existing = await prisma.contract.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Contract not found.' });
    if (!isSuper(req) && !allowedIdsFor(req).includes(existing.companyId)) return res.status(403).json({ error: 'This contract is outside your workspace.' });
    await prisma.contract.delete({ where: { id } }); // sites + deployments cascade
    res.json({ message: 'Deleted' });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Contract not found.' });
    console.error('contract.remove', e);
    res.status(500).json({ error: 'Could not delete the contract.' });
  }
};
