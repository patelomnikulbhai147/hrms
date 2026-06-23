/**
 * Deployments — assign employees to contract sites. Employees may be split across
 * sites (allocationPercent). HR can manage deployment (assign / transfer /
 * release); Company Head and Super Admin too. Reads are company-scoped.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

// Includes company-wide grants AND specific branch grants, so a branch-restricted
// user is scoped to exactly their branch workspace(s) — never sibling branches.
const allowedIdsFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || []), ...(req.user?.accessibleBranchIds || [])].filter(Boolean);
const isSuper = (req) => req.user?.role === 'Super Admin';
// Deployment management is allowed for HR as well as Company Head / Super Admin.
const canDeploy = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);
const inScope = (req, companyId) => isSuper(req) || allowedIdsFor(req).includes(companyId);

exports.getAll = async (req, res) => {
  try {
    const where = {};
    if (req.query.contractId) where.contractId = idParam(req.query.contractId);
    if (req.query.siteId) where.siteId = idParam(req.query.siteId);
    if (req.query.employeeId) where.employeeId = idParam(req.query.employeeId);
    if (req.query.status) where.status = req.query.status;
    if (!isSuper(req)) where.companyId = { in: allowedIdsFor(req) };
    else if (req.query.companyId) where.companyId = idParam(req.query.companyId);

    const rows = await prisma.deployment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { id: true, name: true, employeeId: true, designation: true, department: true } },
        site: { select: { id: true, siteName: true } },
        contract: { select: { id: true, contractName: true } },
      },
    });
    res.json(rows);
  } catch (e) {
    console.error('deployment.getAll', e);
    res.status(500).json({ error: 'Could not load deployments.' });
  }
};

exports.create = async (req, res) => {
  try {
    if (!canDeploy(req)) return res.status(403).json({ error: 'You do not have permission to deploy employees.' });
    const b = req.body || {};
    const siteId = idParam(b.siteId);
    const employeeId = idParam(b.employeeId);
    if (!siteId || !employeeId) return res.status(400).json({ error: 'Both an employee and a site are required.' });

    const site = await prisma.contractSite.findUnique({ where: { id: siteId }, select: { id: true, contractId: true, companyId: true } });
    if (!site) return res.status(404).json({ error: 'Site not found.' });
    if (!inScope(req, site.companyId)) return res.status(403).json({ error: 'This site is outside your workspace.' });

    const dep = await prisma.deployment.create({
      data: {
        contractId: site.contractId,
        siteId,
        employeeId,
        companyId: site.companyId,
        roleAtSite: b.roleAtSite || null,
        assignmentDate: b.assignmentDate || new Date().toISOString().split('T')[0],
        allocationPercent: b.allocationPercent != null ? Number(b.allocationPercent) : 100,
        status: 'Assigned',
        notes: b.notes || null,
      },
    });
    res.status(201).json(dep);
  } catch (e) {
    console.error('deployment.create', e);
    res.status(500).json({ error: 'Could not assign the employee.' });
  }
};

exports.update = async (req, res) => {
  try {
    if (!canDeploy(req)) return res.status(403).json({ error: 'You do not have permission to manage deployments.' });
    const id = idParam(req.params.id);
    const existing = await prisma.deployment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Deployment not found.' });
    if (!inScope(req, existing.companyId)) return res.status(403).json({ error: 'This deployment is outside your workspace.' });

    const b = req.body || {};
    const data = {};
    for (const f of ['roleAtSite', 'assignmentDate', 'releaseDate', 'status', 'notes']) if (b[f] !== undefined) data[f] = b[f];
    if (b.allocationPercent !== undefined) data.allocationPercent = Number(b.allocationPercent) || 0;
    // Transfer to another site (re-validate scope).
    if (b.siteId !== undefined && idParam(b.siteId) !== existing.siteId) {
      const site = await prisma.contractSite.findUnique({ where: { id: idParam(b.siteId) }, select: { contractId: true, companyId: true } });
      if (!site || !inScope(req, site.companyId)) return res.status(403).json({ error: 'Target site is invalid or outside your workspace.' });
      data.siteId = idParam(b.siteId);
      data.contractId = site.contractId;
      if (!b.status) data.status = 'Transferred';
    }
    // Releasing → stamp release date if not provided.
    if (b.status === 'Released' && !b.releaseDate) data.releaseDate = new Date().toISOString().split('T')[0];

    const dep = await prisma.deployment.update({ where: { id }, data });
    res.json(dep);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Deployment not found.' });
    console.error('deployment.update', e);
    res.status(500).json({ error: 'Could not update the deployment.' });
  }
};

exports.remove = async (req, res) => {
  try {
    if (!canDeploy(req)) return res.status(403).json({ error: 'You do not have permission to manage deployments.' });
    const id = idParam(req.params.id);
    const existing = await prisma.deployment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Deployment not found.' });
    if (!inScope(req, existing.companyId)) return res.status(403).json({ error: 'This deployment is outside your workspace.' });
    await prisma.deployment.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Deployment not found.' });
    console.error('deployment.remove', e);
    res.status(500).json({ error: 'Could not delete the deployment.' });
  }
};
