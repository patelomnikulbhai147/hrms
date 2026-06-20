/**
 * Biometric Code mapping — Phase 4 (mapping only; NO attendance sync/import/API).
 *
 * The "Biometric Code" is the attendance-machine employee code. It is stored on
 * Employee.biometricId and is COMPLETELY SEPARATE from the HRMS Employee ID
 * (employeeId), which is never read or modified here. Attendance integration
 * (future) will match: company → branch → biometricCode → employee.
 *
 * Rules:
 *   - Biometric Code is UNIQUE PER COMPANY (blank exempt). Different companies
 *     may reuse the same code.
 *   - Reads/writes are company-scoped. Super Admin = all; Company Head = own
 *     company; HR = view only (when the Employees module is viewable).
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

const companyScopeFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);

const canView = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);
const canManage = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);
const isSuperAdmin = (req) => req.user?.role === 'Super Admin';

const norm = (v) => (v == null ? '' : String(v).trim());

const MAPPING_SELECT = {
  id: true, employeeId: true, name: true, companyId: true, branchId: true,
  branchLocation: true, biometricId: true, status: true,
  company: { select: { id: true, name: true } },
  branch: { select: { id: true, branchName: true } },
};

// GET / — list employee→biometric-code mappings, company-scoped.
exports.list = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view biometric mappings.' });
    const workspaceId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let where = {};
    if (!isSuperAdmin(req)) {
      const scope = companyScopeFor(req);
      where.companyId = { in: scope.length ? scope : [-1] };
      if (workspaceId && !scope.includes(workspaceId)) {
        return res.status(403).json({ error: 'Unauthorized to view this workspace.' });
      }
      if (workspaceId) where.companyId = workspaceId;
    } else if (workspaceId) {
      where.companyId = workspaceId;
    }
    const rows = await prisma.employee.findMany({ where, orderBy: { employeeId: 'asc' }, select: MAPPING_SELECT });
    res.json(rows);
  } catch (e) {
    console.error('biometricMapping.list', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// Resolve the company a write must target (Company Head is pinned to their own).
function targetCompanyId(req, requested) {
  if (isSuperAdmin(req)) return idParam(requested) || null;
  return req.user?.companyId || null;
}

// Validate + apply a single code to one employee (by uuid id). Used by the form
// path too, but the Employee edit screen already updates biometricId directly;
// this endpoint is for the dedicated mapping UI.
exports.setOne = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to edit biometric mappings.' });
    const id = idParam(req.params.id);
    const emp = await prisma.employee.findUnique({ where: { id }, select: { id: true, companyId: true } });
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });
    if (!isSuperAdmin(req) && !companyScopeFor(req).includes(emp.companyId)) {
      return res.status(403).json({ error: 'Unauthorized for this employee.' });
    }
    const code = norm(req.body?.biometricCode).slice(0, 50);
    if (code) {
      const clash = await prisma.employee.findFirst({
        where: { companyId: emp.companyId, biometricId: code, NOT: { id } },
        select: { name: true, employeeId: true },
      });
      if (clash) return res.status(409).json({ error: `Biometric Code "${code}" already belongs to ${clash.name || clash.employeeId} (${clash.employeeId}) in this company.` });
    }
    const updated = await prisma.employee.update({ where: { id }, data: { biometricId: code || null }, select: MAPPING_SELECT });
    res.json(updated);
  } catch (e) {
    console.error('biometricMapping.setOne', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST /bulk — bulk assign codes. Body: { companyId?, rows: [{ employeeId, biometricCode }] }.
// employeeId is the HRMS business code (e.g. VE-AHMD-0001); it is matched, never
// changed. Returns a per-row report; nothing is written for failed rows.
exports.bulk = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to import biometric mappings.' });
    const companyId = targetCompanyId(req, req.body?.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company for the import.' : 'Your account has no company.' });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'No rows to import.' });

    // Preload this company's employees once (employeeId → record).
    const emps = await prisma.employee.findMany({ where: { companyId }, select: { id: true, employeeId: true, name: true, biometricId: true } });
    const byCode = new Map(emps.map(e => [norm(e.employeeId).toUpperCase(), e]));

    const results = { updated: 0, skipped: 0, errors: [] };
    const seenInBatch = new Map(); // biometricCode → employeeId (in-file duplicate guard)

    for (let i = 0; i < rows.length; i++) {
      const rowNo = i + 1;
      const empCode = norm(rows[i].employeeId).toUpperCase();
      const bioCode = norm(rows[i].biometricCode).slice(0, 50);
      if (!empCode || !bioCode) { results.skipped++; results.errors.push({ row: rowNo, employeeId: rows[i].employeeId, error: 'Missing Employee ID or Biometric Code.' }); continue; }

      const emp = byCode.get(empCode);
      if (!emp) { results.skipped++; results.errors.push({ row: rowNo, employeeId: rows[i].employeeId, error: 'Employee not found in this company.' }); continue; }

      // In-file duplicate (same code twice in the upload).
      if (seenInBatch.has(bioCode) && seenInBatch.get(bioCode) !== emp.employeeId) {
        results.skipped++; results.errors.push({ row: rowNo, employeeId: rows[i].employeeId, error: `Biometric Code "${bioCode}" used more than once in the file.` }); continue;
      }
      // Existing different employee in DB with this code.
      const dbClash = emps.find(e => norm(e.biometricId) === bioCode && e.id !== emp.id);
      if (dbClash) { results.skipped++; results.errors.push({ row: rowNo, employeeId: rows[i].employeeId, error: `Biometric Code "${bioCode}" already assigned to ${dbClash.name || dbClash.employeeId}.` }); continue; }

      await prisma.employee.update({ where: { id: emp.id }, data: { biometricId: bioCode } });
      emp.biometricId = bioCode; // keep cache consistent for subsequent rows
      seenInBatch.set(bioCode, emp.employeeId);
      results.updated++;
    }
    res.json(results);
  } catch (e) {
    console.error('biometricMapping.bulk', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
