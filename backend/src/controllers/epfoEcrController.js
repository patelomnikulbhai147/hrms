/**
 * EPFO ECR (Electronic Challan cum Return) generation — ISOLATED report module.
 *
 * Completely self-contained: its own routes (/api/epfo-ecr), its own append-only
 * history table (ecr_history), and the pure ecrEngine for computation. It only
 * READS existing employee + payroll data (never writes to them) and does not
 * touch any existing report, controller, export, or API. Removing this module
 * would leave the rest of the app byte-for-byte unchanged.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const ecrEngine = require('../services/ecrEngine');

// Roles that may use Reports (mirror of complianceReportController.canAccess).
const REPORT_ROLES = ['Super Admin', 'Company Head', 'HR'];
const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const actorOf = (req) => req.user?.name || req.user?.email || 'System';
// Branch-aware: company-wide grants plus the parent company of each accessible
// branch (ECR files are company-level). See utils/workspaceScope.js.
const { companyScopeFor } = require('../utils/workspaceScope');
const canAccess = (req) => REPORT_ROLES.includes(req.user?.role);

/**
 * Resolve the ESTABLISHMENT company + branch filter from the request, honouring
 * branch→parent resolution and the caller's company scope. Returns null when the
 * caller is not authorised for the named workspace.
 */
async function resolveScope(req, body) {
  const baseId = idParam(body.companyId || req.headers['x-workspace-id']) || req.user?.companyId || null;
  if (!baseId) return { error: 'Select a company to generate the ECR.' };

  const company = await prisma.company.findUnique({ where: { id: baseId } }).catch(() => null);
  if (!company) return { error: 'Company not found.' };

  let establishmentId = company.id;
  let implicitBranchName = null;
  if (company.parentCompanyId) {
    establishmentId = company.parentCompanyId;      // a branch-as-company → its parent is the establishment
    implicitBranchName = company.branchName || company.name;
  }

  // Authorisation: a non–Super-Admin may only target a company (or its branch)
  // within their own scope.
  if (!isSuperAdmin(req)) {
    const scope = companyScopeFor(req);
    if (!scope.includes(establishmentId) && !scope.includes(baseId)) {
      return { error: 'You are not authorised to generate the ECR for this company.' };
    }
  }

  const establishment = await prisma.company.findUnique({ where: { id: establishmentId } }).catch(() => null);
  if (!establishment) return { error: 'Establishment company not found.' };

  // Branch filter: an implicit branch (branch workspace) or an explicit body.branch.
  let branchName = implicitBranchName;
  const explicit = body.branch && !['all', 'all branches', ''].includes(String(body.branch).trim().toLowerCase());
  if (!branchName && explicit) branchName = String(body.branch).trim();

  let branchIds = [];
  let resolvedBranchName = null;
  if (branchName) {
    const brs = await prisma.branch.findMany({
      where: { companyId: establishmentId, branchName: { equals: branchName } },
      select: { id: true, branchName: true },
    }).catch(() => []);
    branchIds = brs.map((b) => b.id);
    resolvedBranchName = branchName;
  }

  return {
    companyId: establishmentId,
    company: establishment,
    branchIds,
    branchName: resolvedBranchName,
    pfCode: establishment.pfCode || null,
    pfRate: Number(establishment.pfRate) || ecrEngine.DEFAULT_EPF_RATE,
  };
}

/**
 * Load the employee + payroll data for a scope/period in exactly two indexed
 * queries (scales to 10k+ members). Returns { employees, payrollByEmpId }.
 */
async function loadData(scope, { month, year, department, status }) {
  const empWhere = { companyId: scope.companyId };
  if (scope.branchIds.length) empWhere.branchId = { in: scope.branchIds };
  else if (scope.branchName) empWhere.branchLocation = { equals: scope.branchName };
  if (department && !['all', ''].includes(String(department).trim().toLowerCase())) {
    empWhere.department = { equals: String(department).trim() };
  }
  const st = String(status || 'Active').trim().toLowerCase();
  if (st === 'active') empWhere.status = { equals: 'Active' };
  else if (st === 'inactive') empWhere.status = { not: 'Active' };
  // 'all' → no status filter (inactive members surface in the error report)

  const employees = await prisma.employee.findMany({
    where: empWhere,
    select: { id: true, employeeId: true, name: true, status: true, uan: true, pfNumber: true, salary: true, branchId: true, department: true },
    orderBy: { name: 'asc' },
  });

  const empIds = employees.map((e) => e.id);
  const payrolls = empIds.length
    ? await prisma.payroll.findMany({
        where: { companyId: scope.companyId, month: String(month), year: Number(year), employeeId: { in: empIds } },
        select: { employeeId: true, basicSalary: true, allowances: true, netSalary: true, lwpDays: true, payrollStatus: true },
      })
    : [];
  const payrollByEmpId = new Map(payrolls.map((p) => [p.employeeId, p]));
  return { employees, payrollByEmpId };
}

function requirePeriod(body) {
  const month = body.month || body.periodMonth;
  const year = body.year || body.periodYear;
  if (!month || !year) return null;
  return { month: String(month), year: Number(year) };
}

// ── POST /preview ──────────────────────────────────────────────────────────
// Validate + summarise WITHOUT generating a file or writing history.
exports.preview = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    const period = requirePeriod(req.body || {});
    if (!period) return res.status(400).json({ error: 'Select a payroll month and year.' });
    const scope = await resolveScope(req, req.body || {});
    if (scope.error) return res.status(scope.error.includes('authorised') ? 403 : 400).json({ error: scope.error });

    const { employees, payrollByEmpId } = await loadData(scope, { ...period, department: req.body.department, status: req.body.status });
    const { errors, warnings, summary } = ecrEngine.buildEcr(employees, payrollByEmpId, { pfRate: scope.pfRate });

    return res.json({
      canGenerate: summary.eligibleEmployees > 0,
      company: { id: scope.companyId, name: scope.company.name, pfCode: scope.pfCode },
      branch: scope.branchName || 'All Branches',
      period,
      summary,
      errors,
      warnings,
    });
  } catch (e) {
    console.error('[epfoEcr.preview]', e);
    return res.status(500).json({ error: 'Failed to build the ECR preview.' });
  }
};

// ── POST /generate ─────────────────────────────────────────────────────────
// Validate, build the ECR text, persist a history row, and return the file.
exports.generate = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    const period = requirePeriod(req.body || {});
    if (!period) return res.status(400).json({ error: 'Select a payroll month and year.' });
    const scope = await resolveScope(req, req.body || {});
    if (scope.error) return res.status(scope.error.includes('authorised') ? 403 : 400).json({ error: scope.error });

    const { employees, payrollByEmpId } = await loadData(scope, { ...period, department: req.body.department, status: req.body.status });
    const { members, errors, warnings, summary } = ecrEngine.buildEcr(employees, payrollByEmpId, { pfRate: scope.pfRate });

    if (!members.length) {
      return res.status(422).json({ error: 'No eligible employees — the ECR file was not generated.', summary, errors, warnings, canGenerate: false });
    }

    const content = ecrEngine.buildEcrFileContent(members);
    const fileName = ecrEngine.ecrFileName({ pfCode: scope.pfCode, month: period.month, year: period.year });

    let historyId = null;
    try {
      const row = await prisma.ecrHistory.create({
        data: {
          companyId: scope.companyId,
          companyName: scope.company.name || null,
          branchId: scope.branchIds[0] || null,
          branchName: scope.branchName || 'All Branches',
          month: period.month,
          year: period.year,
          department: req.body.department && String(req.body.department).toLowerCase() !== 'all' ? String(req.body.department) : null,
          employeeStatus: req.body.status || 'Active',
          employeeCount: summary.eligibleEmployees,
          totalEmployees: summary.totalEmployees,
          fileName,
          fileContent: content,
          generatedBy: req.user?.id ? String(req.user.id) : null,
          generatedByName: actorOf(req),
        },
      });
      historyId = row.id;
    } catch (histErr) {
      // History persistence is best-effort — never block the download on it.
      console.error('[epfoEcr.generate] history write failed:', histErr.message);
    }

    return res.json({
      fileName,
      content,
      historyId,
      company: { id: scope.companyId, name: scope.company.name, pfCode: scope.pfCode },
      branch: scope.branchName || 'All Branches',
      period,
      summary,
      errors,
      warnings,
    });
  } catch (e) {
    console.error('[epfoEcr.generate]', e);
    return res.status(500).json({ error: 'Failed to generate the ECR file.' });
  }
};

// ── GET /history ───────────────────────────────────────────────────────────
exports.history = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    const baseId = idParam(req.query.companyId || req.headers['x-workspace-id']) || req.user?.companyId;
    let where = {};
    if (baseId) {
      const company = await prisma.company.findUnique({ where: { id: baseId } }).catch(() => null);
      const establishmentId = company?.parentCompanyId || baseId;
      if (!isSuperAdmin(req)) {
        const scope = companyScopeFor(req);
        if (!scope.includes(establishmentId) && !scope.includes(baseId)) return res.json({ history: [] });
      }
      where.companyId = establishmentId;
    } else if (!isSuperAdmin(req)) {
      where.companyId = { in: companyScopeFor(req).length ? companyScopeFor(req) : [-1] };
    }
    const rows = await prisma.ecrHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, companyName: true, branchName: true, month: true, year: true, department: true, employeeCount: true, totalEmployees: true, fileName: true, generatedByName: true, createdAt: true },
    });
    return res.json({ history: rows });
  } catch (e) {
    console.error('[epfoEcr.history]', e);
    return res.status(500).json({ error: 'Failed to load ECR history.' });
  }
};

// ── GET /history/:id/download ──────────────────────────────────────────────
exports.download = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    const id = idParam(req.params.id);
    const row = await prisma.ecrHistory.findUnique({ where: { id } }).catch(() => null);
    if (!row) return res.status(404).json({ error: 'ECR file not found.' });
    if (!isSuperAdmin(req)) {
      const scope = companyScopeFor(req);
      if (!scope.includes(row.companyId)) return res.status(403).json({ error: 'Not authorised for this ECR file.' });
    }
    return res.json({ fileName: row.fileName, content: row.fileContent || '' });
  } catch (e) {
    console.error('[epfoEcr.download]', e);
    return res.status(500).json({ error: 'Failed to download the ECR file.' });
  }
};
