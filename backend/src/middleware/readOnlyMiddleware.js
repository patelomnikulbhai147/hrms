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
      || String(company.accountStatus || '').toLowerCase() === 'offboarded');

    if (readOnly) {
      return res.status(403).json({
        code: 'COMPANY_READ_ONLY',
        error: `${company.name} has been offboarded and is read-only. You can view and export its historical data, but cannot make changes.`,
      });
    }
    return next();
  } catch (_) {
    // Never block the platform on a guard failure.
    return next();
  }
};
