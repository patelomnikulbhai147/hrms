const prisma = require('../config/prisma');

// ===========================================================================
//  Offboarding read-only guard.
//
//  An OFFBOARDED COMPANY (Company.isArchived = true, or accountStatus
//  'Offboarded') becomes fully read-only: its users may VIEW and EXPORT
//  historical data, but may not add employees, generate payroll, upload
//  documents, modify settings or create any records.
//
//  Reads (GET/HEAD/OPTIONS) always pass. History is therefore always available.
//  Apply AFTER `protect` on write-bearing routers.
// ===========================================================================
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

module.exports = async function enforceWorkspaceWritable(req, res, next) {
  try {
    if (READ_METHODS.has(req.method)) return next(); // viewing/exporting is allowed

    // Super Admin is the role exception: may view, edit company status, reactivate
    // an archived company, and audit. Only a Super Admin can lift the lockdown.
    if (req.user && req.user.role === 'Super Admin') return next();

    // Resolve the company in context: the active workspace header, then the
    // request body, then the user's own company.
    const raw = req.headers['x-workspace-id']
      || (req.body && req.body.companyId)
      || (req.user && req.user.companyId);
    const id = Number(raw);
    if (!id) return next();

    // A branch workspace resolves to its parent company.
    let company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      const branch = await prisma.branch.findUnique({ where: { id } }).catch(() => null);
      if (branch) company = await prisma.company.findUnique({ where: { id: branch.companyId } });
    }

    const readOnly = company && (company.isArchived === true
      || String(company.status || '').toLowerCase() === 'archived'
      || ['offboarded', 'archived'].includes(String(company.accountStatus || '').toLowerCase()));

    if (readOnly) {
      return res.status(403).json({
        code: 'COMPANY_READ_ONLY',
        error: 'This company is archived. Modifications are not allowed. You can view and export its historical data only.',
      });
    }
    return next();
  } catch (_) {
    // Never block the platform on a guard failure.
    return next();
  }
};
