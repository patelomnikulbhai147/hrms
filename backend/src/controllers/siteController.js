/**
 * Contract Sites — a contract can contain many sites. Commercial/structural
 * mutations are limited to Company Head / Super Admin; reads are company-scoped.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

// Includes company-wide grants AND specific branch grants, so a branch-restricted
// user is scoped to exactly their branch workspace(s) — never sibling branches.
const allowedIdsFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || []), ...(req.user?.accessibleBranchIds || [])].filter(Boolean);
const isSuper = (req) => req.user?.role === 'Super Admin';
const canManage = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);
const inScope = (req, companyId) => isSuper(req) || allowedIdsFor(req).includes(companyId);

exports.getAll = async (req, res) => {
  try {
    const where = {};
    if (req.query.contractId) where.contractId = idParam(req.query.contractId);
    if (!isSuper(req)) where.companyId = { in: allowedIdsFor(req) };
    else if (req.query.companyId) where.companyId = idParam(req.query.companyId);

    const sites = await prisma.contractSite.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { deployments: true } } },
    });
    res.json(sites.map((s) => ({
      ...s,
      assignedHeadcount: s._count.deployments,
      vacancies: Math.max(0, (s.requiredHeadcount || 0) - s._count.deployments),
    })));
  } catch (e) {
    console.error('site.getAll', e);
    res.status(500).json({ error: 'Could not load sites.' });
  }
};

exports.create = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only a Company Head can manage sites.' });
    const b = req.body || {};
    const contractId = idParam(b.contractId);
    if (!contractId) return res.status(400).json({ error: 'A contract is required.' });
    if (!b.siteName || !String(b.siteName).trim()) return res.status(400).json({ error: 'Site name is required.' });
    const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { companyId: true } });
    if (!contract) return res.status(404).json({ error: 'Contract not found.' });
    if (!inScope(req, contract.companyId)) return res.status(403).json({ error: 'This contract is outside your workspace.' });

    const site = await prisma.contractSite.create({
      data: {
        contractId,
        companyId: contract.companyId,
        siteName: String(b.siteName).trim(),
        siteAddress: b.siteAddress || null,
        siteSupervisor: b.siteSupervisor || null,
        requiredHeadcount: Number(b.requiredHeadcount) || 0,
        status: b.status || 'Active',
      },
    });
    res.status(201).json(site);
  } catch (e) {
    console.error('site.create', e);
    res.status(500).json({ error: 'Could not create the site.' });
  }
};

exports.update = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only a Company Head can edit sites.' });
    const id = idParam(req.params.id);
    const existing = await prisma.contractSite.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Site not found.' });
    if (!inScope(req, existing.companyId)) return res.status(403).json({ error: 'This site is outside your workspace.' });

    const b = req.body || {};
    const data = {};
    for (const f of ['siteName', 'siteAddress', 'siteSupervisor', 'status']) if (b[f] !== undefined) data[f] = b[f];
    if (b.requiredHeadcount !== undefined) data.requiredHeadcount = Number(b.requiredHeadcount) || 0;
    const site = await prisma.contractSite.update({ where: { id }, data });
    res.json(site);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Site not found.' });
    console.error('site.update', e);
    res.status(500).json({ error: 'Could not update the site.' });
  }
};

exports.remove = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only a Company Head can delete sites.' });
    const id = idParam(req.params.id);
    const existing = await prisma.contractSite.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Site not found.' });
    if (!inScope(req, existing.companyId)) return res.status(403).json({ error: 'This site is outside your workspace.' });
    await prisma.contractSite.delete({ where: { id } }); // deployments cascade
    res.json({ message: 'Deleted' });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Site not found.' });
    console.error('site.remove', e);
    res.status(500).json({ error: 'Could not delete the site.' });
  }
};
