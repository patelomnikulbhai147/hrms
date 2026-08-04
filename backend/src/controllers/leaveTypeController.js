const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { canReachCompany } = require('../utils/companyScope');
const svc = require('../services/leaveEligibilityService');

/** The company whose policy this request is about, with an access check. */
async function resolveScope(req) {
  const requested = idParam(req.query.companyId || req.body?.companyId || req.headers['x-workspace-id']);
  const companyId = requested || req.user?.companyId;
  if (!companyId) return { error: 400, message: 'A company must be selected.' };
  if (req.user && req.user.role !== 'Super Admin' && !canReachCompany(req, companyId)) {
    return { error: 403, message: 'Not your workspace.' };
  }
  return { companyId: await svc.policyCompanyId(companyId) };
}

// GET /api/leave-types  — the master, for the HR configuration screen.
exports.list = async (req, res) => {
  try {
    const scope = await resolveScope(req);
    if (scope.error) return res.status(scope.error).json({ success: false, message: scope.message });
    const types = await svc.listTypes(scope.companyId);
    res.json({
      companyId: scope.companyId,
      genders: svc.GENDERS,
      types: types.map(({ aliases, ...t }) => t),
    });
  } catch (error) {
    console.error('Error listing leave types', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

// GET /api/leave-types/eligible?employeeId=101
// The types this employee may apply for — what the Log Employee Leave dialog
// renders. Deliberately per-employee: the dialog cannot be right for everyone at
// once, because eligibility depends on who the leave is for.
exports.eligible = async (req, res) => {
  try {
    const employeeId = idParam(req.query.employeeId);
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required.' });

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, gender: true, companyId: true, branchId: true },
    });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    if (req.user && req.user.role !== 'Super Admin') {
      const reachable = canReachCompany(req, employee.companyId)
        || (employee.branchId != null && canReachCompany(req, employee.branchId));
      if (!reachable) return res.status(403).json({ success: false, message: 'Not your workspace.' });
    }

    const gender = svc.normalizeGender(employee.gender);
    res.json({
      employeeId: employee.id,
      employeeName: employee.name,
      gender,
      genderRecorded: gender !== null,
      types: await svc.eligibleTypesFor(employee),
    });
  } catch (error) {
    console.error('Error listing eligible leave types', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

// PUT /api/leave-types/:code   { eligibleGender?, enabled?, label? }
// Configuration is per company: the first change writes the row, so a company
// that never touches it keeps running on the seeded defaults.
exports.upsert = async (req, res) => {
  try {
    const scope = await resolveScope(req);
    if (scope.error) return res.status(scope.error).json({ success: false, message: scope.message });

    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ success: false, message: 'A leave-type code is required.' });

    const types = await svc.listTypes(scope.companyId);
    const current = types.find((t) => t.code === code);
    if (!current) return res.status(404).json({ success: false, message: `Unknown leave type "${code}".` });

    const patch = {};
    if (req.body.eligibleGender !== undefined) {
      const g = String(req.body.eligibleGender);
      if (!svc.GENDERS.includes(g)) {
        return res.status(400).json({ success: false, message: `eligibleGender must be one of ${svc.GENDERS.join(', ')}.` });
      }
      patch.eligibleGender = g;
    }
    if (req.body.enabled !== undefined) patch.enabled = !!req.body.enabled;
    if (req.body.label !== undefined) {
      const label = String(req.body.label).trim();
      if (!label) return res.status(400).json({ success: false, message: 'Label cannot be blank.' });
      patch.label = label;
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update.' });
    }

    const saved = await prisma.leaveTypePolicy.upsert({
      where: { companyId_code: { companyId: scope.companyId, code } },
      update: { ...patch, updatedBy: req.user?.name || req.user?.email || null },
      create: {
        companyId: scope.companyId, code,
        label: patch.label || current.label,
        eligibleGender: patch.eligibleGender || current.eligibleGender,
        enabled: patch.enabled !== undefined ? patch.enabled : current.enabled,
        sortOrder: current.sortOrder,
        isSystem: current.isSystem,
        updatedBy: req.user?.name || req.user?.email || null,
      },
    });

    // Changing who may take a leave type is a policy decision — it belongs in the
    // audit trail, not only in the row's updatedBy.
    try {
      const AuditService = require('../services/auditService');
      if (req.user?.id) {
        await AuditService.logAudit(req.user.id, 'UPDATE_LEAVE_TYPE_POLICY', 'Leaves', String(saved.id), {
          companyId: scope.companyId, code,
          from: { eligibleGender: current.eligibleGender, enabled: current.enabled, label: current.label },
          to: { eligibleGender: saved.eligibleGender, enabled: saved.enabled, label: saved.label },
          by: req.user.name, role: req.user.role,
        });
      }
    } catch (e) { /* audit must never block the save */ }

    res.json({ success: true, type: saved });
  } catch (error) {
    console.error('Error saving leave type policy', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};
