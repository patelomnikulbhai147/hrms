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

// GET /api/contracts/:id/cost?month=&year=  → payroll cost rollup for a contract,
// reusing the existing payroll/salary data. Allocates each deployed employee's
// cost by allocationPercent (split-across-sites), grouped by site and employee.
exports.getCost = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        deployments: {
          where: { status: { not: 'Released' } },
          include: {
            employee: { select: { id: true, name: true, employeeId: true, salary: true } },
            site: { select: { id: true, siteName: true } },
          },
        },
      },
    });
    if (!contract) return res.status(404).json({ error: 'Contract not found.' });
    if (!isSuper(req) && !allowedIdsFor(req).includes(contract.companyId)) return res.status(403).json({ error: 'This contract is outside your workspace.' });

    const month = req.query.month;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const empIds = [...new Set(contract.deployments.map((d) => d.employeeId))];
    let payrollByEmp = {};
    if (empIds.length) {
      const pw = { employeeId: { in: empIds } };
      if (month) pw.month = month;
      if (year) pw.year = year;
      const payrolls = await prisma.payroll.findMany({ where: pw, orderBy: { createdAt: 'desc' } });
      for (const p of payrolls) if (payrollByEmp[p.employeeId] == null) payrollByEmp[p.employeeId] = p.netSalary || 0;
    }

    const bySite = {};
    const byEmployee = [];
    let total = 0;
    for (const d of contract.deployments) {
      // Use the period's payroll net when available; otherwise the employee's
      // monthly salary as the manpower-cost basis (no separate payroll module).
      const base = payrollByEmp[d.employeeId] != null ? payrollByEmp[d.employeeId] : (d.employee?.salary || 0);
      const alloc = (d.allocationPercent != null ? d.allocationPercent : 100) / 100;
      const cost = Math.round(base * alloc);
      total += cost;
      const sk = d.site?.siteName || 'Unassigned';
      bySite[sk] = (bySite[sk] || 0) + cost;
      byEmployee.push({ employee: d.employee?.name, employeeId: d.employee?.employeeId, site: d.site?.siteName, allocationPercent: d.allocationPercent ?? 100, cost });
    }
    res.json({ contractId: id, period: month && year ? `${month} ${year}` : 'Latest / salary basis', total, bySite, byEmployee });
  } catch (e) {
    console.error('contract.getCost', e);
    res.status(500).json({ error: 'Could not compute contract cost.' });
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
