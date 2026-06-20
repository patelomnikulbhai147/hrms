const prisma = require('../config/prisma');
const { generateEmployeeCode, validateCustomCode } = require('../utils/employeeCode');
const idParam = require('../utils/idParam');
const { coerceEntityIds } = require('../utils/idParam');
const { findDuplicate, buildIndex, matchAgainstIndex } = require('../utils/employeeDedup');
const respondError = require('../utils/respondError');
const { OFFBOARDED_STATUSES } = require('../utils/employeeStatus');
const locationMaster = require('./locationMasterController');

// Remember any custom state/city on an employee payload for dropdown reuse
// (best-effort, never blocks the save).
const rememberLocations = (data) => {
  if (data.state) locationMaster.remember('state', data.state);
  if (data.city) locationMaster.remember('city', data.city);
};

exports.getEmployees = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      // A user is scoped to their companies AND the branches under those companies.
      // accessibleBranchIds is derived in the protect middleware. Including branch
      // ids here lets a Company Head / HR open a BRANCH sub-workspace (a branch id
      // is no longer ambiguous with a company id — the namespaces no longer collide).
      const companyScope = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      const branchScope = (req.user.accessibleBranchIds || []).filter(Boolean);
      const allowedIds = [...companyScope, ...branchScope];
      whereClause.OR = [
        { companyId: { in: companyScope } },
        { branchId: { in: branchScope.length ? branchScope : companyScope } }
      ];
      if (companyId) {
        if (!allowedIds.includes(companyId)) {
          return res.status(403).json({ error: 'Unauthorized to view this workspace\'s employees' });
        }
        // The selected workspace id may be a company OR a branch — match either column.
        whereClause.OR = [
          { companyId: companyId },
          { branchId: companyId }
        ];
      }
    } else if (companyId) {
      whereClause.OR = [
        { companyId: companyId },
        { branchId: companyId }
      ];
    }

    // Offboarded employees are excluded from the ACTIVE employee dataset by
    // default — active modules (attendance, payroll, leave, shift, dropdowns,
    // dashboards) must never receive them. The Offboarding module, Archive
    // section, Historical Reports and Employee History opt back in with
    // ?include=all (or ?includeOffboarded=true) to retrieve the full roster.
    const includeAll = ['all', 'true', '1', 'yes']
      .includes(String(req.query.include || req.query.includeOffboarded || '').toLowerCase());
    if (!includeAll) {
      whereClause.status = { notIn: OFFBOARDED_STATUSES };
    }

    const employees = await prisma.employee.findMany({ where: whereClause });
    res.json(employees);
  } catch (error) {
    return respondError(res, error);
  }
};

exports.createEmployee = async (req, res) => {
  try {
    let data = coerceEntityIds({ ...req.body });

    // Validation — friendly, field-named messages (joinDate is a required DB
    // column with no default, so guard it here instead of letting Prisma throw
    // a raw multi-line error).
    const FIELD_LABELS = {
      name: 'Full name', companyId: 'Company', department: 'Department',
      designation: 'Designation', joinDate: 'Date of Joining',
    };
    const requiredFields = ['name', 'companyId', 'department', 'designation', 'joinDate'];
    for (const field of requiredFields) {
      if (!data[field] || String(data[field]).trim() === '') {
        return res.status(400).json({ error: `${FIELD_LABELS[field] || field} is required.`, code: 'REQUIRED_MISSING' });
      }
    }
    
    // Sanitize Dates
    if (data.joinDate && typeof data.joinDate === 'string') {
      data.joinDate = new Date(data.joinDate);
    }
    if (data.exitDate && typeof data.exitDate === 'string') {
      if (data.exitDate.trim() === '') data.exitDate = null;
      else data.exitDate = new Date(data.exitDate);
    } else if (data.exitDate === '') {
      data.exitDate = null;
    }
    
    // Map fields
    if (data.esic !== undefined) {
      data.esiNumber = data.esic;
      delete data.esic;
    }

    // Biometric Code (a.k.a. biometricId): optional, trimmed, capped at 50 chars;
    // blank → null. This is the attendance-machine code — NOT the Employee ID.
    if (data.biometricId !== undefined) {
      data.biometricId = data.biometricId ? String(data.biometricId).trim().slice(0, 50) : null;
    }

    if (data.companyId) {
      const comp = await prisma.company.findUnique({ where: { id: data.companyId } });
      if (!comp) data.companyId = 1;
    }

    if (data.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
      if (!branch) data.branchId = null;
    }

    // Biometric Code must be UNIQUE WITHIN THE COMPANY (blank exempt; different
    // companies may reuse the same code — validation is per-company, not global).
    if (data.biometricId) {
      const clash = await prisma.employee.findFirst({
        where: { companyId: data.companyId, biometricId: data.biometricId },
        select: { id: true, name: true, employeeId: true },
      });
      if (clash) {
        return res.status(409).json({
          code: 'BIOMETRIC_CODE_DUPLICATE',
          error: `Biometric Code "${data.biometricId}" is already assigned to ${clash.name || clash.employeeId} (${clash.employeeId}) in this company. Biometric Codes must be unique per company.`,
        });
      }
    }

    rememberLocations(data);

    // ── Uniqueness guard: refuse to create a second record for someone who is
    // already on file (same Company+Branch+Name, or same Mobile / Email / Code).
    const dup = await findDuplicate(prisma, data);
    if (dup) {
      return res.status(409).json({
        error: `Duplicate employee: a record matching this ${dup.field} already exists ` +
          `(${dup.match.name || dup.match.employeeId}, code ${dup.match.employeeId}). ` +
          `Edit the existing employee instead of creating a new one.`,
        duplicateOf: { id: dup.match.id, employeeId: dup.match.employeeId, name: dup.match.name, field: dup.field },
      });
    }

    // ── Employee code: professional branch-wise format  VE-<BRANCH>-#### ──
    // codeMode === 'custom' lets the user supply their own unique code;
    // otherwise (default) the next branch-wise sequence is generated.
    const codeMode = data.codeMode;
    const customCode = (data.employeeId && data.employeeId !== '[ Auto Generated ]') ? data.employeeId : null;
    delete data.codeMode;

    if (codeMode === 'custom' || (customCode && codeMode !== 'auto')) {
      const v = await validateCustomCode(customCode);
      if (!v.ok) return res.status(400).json({ error: v.error });
      data.employeeId = v.code;
    } else {
      data.employeeId = await generateEmployeeCode(data.branchId, data.companyId);
    }

    const employee = await prisma.employee.create({
      data
    });

    // Auto-create initial payroll draft for the current month
    if (employee.status === 'Active' && employee.salary > 0) {
      try {
        const company = await prisma.company.findUnique({ where: { id: employee.companyId } });
        const basicPercent = company?.basicPercent || 50;
        const ctcMonthly = Math.round(employee.salary / 12);
        const basicSalary = Math.round(ctcMonthly * (basicPercent / 100));
        const hra = Math.round(basicSalary * 0.4);
        const special = Math.max(0, ctcMonthly - basicSalary - hra);
        const allowances = hra + special;
        const pfRate = company?.pfRate || 12;
        const esicRate = company?.esicRate || 0.75;
        const profTax = company?.profTaxRate || 200;
        const pfDeduction = Math.round(basicSalary * (pfRate / 100));
        const esicDeduction = Math.round(basicSalary * (esicRate / 100));
        const deductions = pfDeduction + esicDeduction + profTax;
        const netSalary = Math.max(0, ctcMonthly - deductions);

        await prisma.payroll.create({
          data: {
            companyId: employee.companyId,
            employeeId: employee.id,
            employeeName: employee.name,
            department: employee.department,
            month: 'June',
            year: 2026,
            basicSalary,
            allowances,
            deductions,
            netSalary,
            payrollStatus: 'draft',
            paymentStatus: 'pending',
            payslipGenerated: false
          }
        });
      } catch (err) {
        console.error('Failed to create initial payroll record:', err);
      }
    }

    res.status(201).json(employee);
  } catch (error) {
    return respondError(res, error, { action: 'create employee', resource: 'employee' });
  }
};

exports.bulkCreate = async (req, res) => {
  try {
    const { employees } = req.body;
    if (!Array.isArray(employees)) {
      return res.status(400).json({ error: 'Expected an array of employees' });
    }

    // Load every existing employee ONCE and index them, so each incoming row can
    // be matched (by code / company+branch+name / mobile / email) against both
    // the database AND the rows already processed in THIS batch. A match routes
    // to update; only genuinely new people are inserted — imports can never
    // create a duplicate.
    const existing = await prisma.employee.findMany({
      select: { id: true, employeeId: true, companyId: true, branchId: true, name: true, phone: true, email: true },
    });
    const index = buildIndex(existing);
    const addToIndex = (e) => {
      const { norm, normPhone, normEmail, nameKey } = require('../utils/employeeDedup');
      if (e.employeeId) index.byCode.set(norm(e.employeeId), e);
      if (norm(e.name) && norm(e.name) !== '-') index.byName.set(nameKey(e.companyId, e.branchId, e.name), e);
      const ph = normPhone(e.phone); if (ph) index.byPhone.set(ph, e);
      const em = normEmail(e.email); if (em) index.byEmail.set(em, e);
    };

    const created = [];
    const merged = [];
    const skipped = [];
    for (const data of employees) {
      if (data.joinDate && typeof data.joinDate === 'string') {
        data.joinDate = new Date(data.joinDate);
      }
      if (data.exitDate && typeof data.exitDate === 'string') {
        if (data.exitDate.trim() === '') data.exitDate = null;
        else data.exitDate = new Date(data.exitDate);
      } else if (data.exitDate === '') {
        data.exitDate = null;
      }

      if (data.esic !== undefined) {
        data.esiNumber = data.esic;
        delete data.esic;
      }

      const dup = matchAgainstIndex(data, index);
      let result;
      if (dup) {
        // Same person already on file → UPDATE that record (never insert a 2nd
        // row). Keep the existing unique code; don't overwrite it with a blank.
        const patch = { ...data };
        delete patch.id;
        delete patch.employeeId;
        result = await prisma.employee.update({ where: { id: dup.match.id }, data: patch });
        merged.push({ employeeId: result.employeeId, name: result.name, matchedOn: dup.field });
      } else if (data.employeeId) {
        // Has an explicit code → upsert on the unique code.
        result = await prisma.employee.upsert({
          where: { employeeId: data.employeeId },
          update: data,
          create: data,
        });
        created.push(result);
      } else {
        result = await prisma.employee.create({ data });
        created.push(result);
      }
      addToIndex(result);
    }

    // Auto-sync payroll for imported employees in the background
    try {
      const activeNewIds = created.filter(e => e.status === 'Active' && e.salary > 0).map(e => e.id);
      if (activeNewIds.length > 0) {
        // We'll let the user see success immediately, but trigger the payroll creation async
        setImmediate(async () => {
           for (const emp of created) {
             if (emp.status !== 'Active' || !emp.salary) continue;
             const company = await prisma.company.findUnique({ where: { id: emp.companyId } });
             const basicPercent = company?.basicPercent || 50;
             const ctcMonthly = Math.round(emp.salary / 12);
             const basicSalary = Math.round(ctcMonthly * (basicPercent / 100));
             const hra = Math.round(basicSalary * 0.4);
             const special = Math.max(0, ctcMonthly - basicSalary - hra);
             const allowances = hra + special;
             const pfRate = company?.pfRate || 12;
             const esicRate = company?.esicRate || 0.75;
             const profTax = company?.profTaxRate || 200;
             const pfDeduction = Math.round(basicSalary * (pfRate / 100));
             const esicDeduction = Math.round(basicSalary * (esicRate / 100));
             const deductions = pfDeduction + esicDeduction + profTax;
             const netSalary = Math.max(0, ctcMonthly - deductions);

             await prisma.payroll.upsert({
               where: {
                 employeeId_month_year_companyId: {
                   employeeId: emp.id,
                   month: 'June',
                   year: 2026,
                   companyId: emp.companyId
                 }
               },
               update: {},
               create: {
                 companyId: emp.companyId,
                 employeeId: emp.id,
                 employeeName: emp.name,
                 department: emp.department,
                 month: 'June',
                 year: 2026,
                 basicSalary,
                 allowances,
                 deductions,
                 netSalary,
                 payrollStatus: 'draft',
                 paymentStatus: 'pending',
                 payslipGenerated: false
               }
             }).catch(() => {});
           }
        });
      }
    } catch(e) {}

    res.status(201).json({
      count: created.length,
      createdCount: created.length,
      mergedCount: merged.length,
      skippedCount: skipped.length,
      merged,
      employees: created,
    });
  } catch (error) {
    console.error('Error in bulk create:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    let data = coerceEntityIds({ ...req.body });

    // Offboarding policy: an Archived (offboarded) employee is read-only —
    // history is preserved and cannot be edited. The only permitted change is
    // reactivation (status → Active).
    const existingEmp = await prisma.employee.findUnique({ where: { id: idParam(id) }, select: { status: true } });
    // Archived / offboarded employees are HISTORICAL records: read-only for
    // everyone except a Super Admin (who alone may edit or restore them).
    if (existingEmp && OFFBOARDED_STATUSES.includes(existingEmp.status) && !(req.user && req.user.role === 'Super Admin')) {
      return res.status(403).json({
        code: 'EMPLOYEE_OFFBOARDED',
        error: 'This employee is archived/offboarded and is read-only. Only a Super Admin can restore or modify it.',
      });
    }

    // Validation for critical fields if they are provided
    const criticalFields = ['name', 'email', 'employeeId', 'companyId', 'department', 'designation'];
    for (const field of criticalFields) {
      if (data.hasOwnProperty(field) && (!data[field] || String(data[field]).trim() === '')) {
        return res.status(400).json({ error: `Critical field cannot be empty: ${field}` });
      }
    }
    
    // Sanitize Dates
    if (data.joinDate && typeof data.joinDate === 'string') {
      data.joinDate = new Date(data.joinDate);
    }
    if (data.exitDate && typeof data.exitDate === 'string') {
      if (data.exitDate.trim() === '') data.exitDate = null;
      else data.exitDate = new Date(data.exitDate);
    } else if (data.exitDate === '') {
      data.exitDate = null;
    }
    
    // Map fields
    if (data.esic !== undefined) {
      data.esiNumber = data.esic;
      delete data.esic;
    }

    // Biometric Code (a.k.a. biometricId): optional, trimmed, capped at 50 chars;
    // blank → null. This is the attendance-machine code — NOT the Employee ID.
    if (data.biometricId !== undefined) {
      data.biometricId = data.biometricId ? String(data.biometricId).trim().slice(0, 50) : null;
    }

    if (data.companyId) {
      const comp = await prisma.company.findUnique({ where: { id: data.companyId } });
      if (!comp) data.companyId = 1;
    }

    if (data.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
      if (!branch) data.branchId = null;
    }

    // Biometric Code uniqueness within the company (per-company, blank exempt,
    // excluding this same employee). Different companies may reuse a code.
    if (data.biometricId) {
      const target = await prisma.employee.findUnique({ where: { id: idParam(id) }, select: { companyId: true } });
      const effCompanyId = data.companyId || target?.companyId;
      if (effCompanyId) {
        const clash = await prisma.employee.findFirst({
          where: { companyId: effCompanyId, biometricId: data.biometricId, NOT: { id: idParam(id) } },
          select: { id: true, name: true, employeeId: true },
        });
        if (clash) {
          return res.status(409).json({
            code: 'BIOMETRIC_CODE_DUPLICATE',
            error: `Biometric Code "${data.biometricId}" is already assigned to ${clash.name || clash.employeeId} (${clash.employeeId}) in this company. Biometric Codes must be unique per company.`,
          });
        }
      }
    }

    rememberLocations(data);

    // If the employee code is being changed, validate format + uniqueness.
    if (data.hasOwnProperty('employeeId')) {
      const current = await prisma.employee.findUnique({ where: { id: idParam(id) }, select: { employeeId: true } });
      if (current && data.employeeId !== current.employeeId) {
        const v = await validateCustomCode(data.employeeId, id);
        if (!v.ok) return res.status(400).json({ error: v.error });
        data.employeeId = v.code;
      }
    }
    delete data.codeMode;

    // Uniqueness guard: an edit must not turn this row into a duplicate of
    // another employee. Merge the patch over the current record so partial
    // updates are checked against complete identity fields.
    const selfId = idParam(id);
    const current = await prisma.employee.findUnique({
      where: { id: selfId },
      select: { companyId: true, branchId: true, name: true, phone: true, email: true, employeeId: true },
    });
    if (current) {
      const merged = { ...current, ...data };
      const dup = await findDuplicate(prisma, merged, selfId);
      if (dup) {
        return res.status(409).json({
          error: `Update rejected: would duplicate an existing employee (${dup.field} matches ` +
            `${dup.match.name || dup.match.employeeId}, code ${dup.match.employeeId}).`,
          duplicateOf: { id: dup.match.id, employeeId: dup.match.employeeId, name: dup.match.name, field: dup.field },
        });
      }
    }

    const employee = await prisma.employee.update({
      where: { id: idParam(id) },
      data
    });
    res.json(employee);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// GET /api/employees/next-code?branchId=...&companyId=...
// Returns the next auto-generated branch-wise employee code (for form preview).
exports.nextCode = async (req, res) => {
  try {
    const branchId = idParam(req.query.branchId) ?? null;
    const companyId = idParam(req.query.companyId) ?? null;
    const code = await generateEmployeeCode(branchId, companyId);
    res.json({ code });
  } catch (error) {
    return respondError(res, error);
  }
};

// POST /api/employees/validate-code  { code, excludeId? }
// Validates a custom employee code (format + uniqueness) without saving.
exports.validateCode = async (req, res) => {
  try {
    const v = await validateCustomCode(req.body.code, req.body.excludeId);
    res.json(v);
  } catch (error) {
    return respondError(res, error);
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    // Archive employee instead of hard delete
    const employee = await prisma.employee.update({
      where: { id: idParam(id) },
      data: { 
        status: 'Archived', 
        exitDate: new Date(), 
        exitReason: 'Admin Archived' 
      }
    });
    res.json({ message: 'Employee archived successfully', employee });
  } catch (error) {
    return respondError(res, error);
  }
};

// ── Employee Status Verification Report ──────────────────────────────────────
// Returns one row per employee (Employee ID, Name, Status, isArchived, Branch,
// Company) plus a mismatch list, so status inconsistencies can be identified.
// `status` is the single source of truth; isArchived is derived from it.
exports.statusReport = async (req, res) => {
  try {
    const [employees, branches, companies] = await Promise.all([
      prisma.employee.findMany({
        select: { id: true, employeeId: true, name: true, status: true, branchId: true, companyId: true },
        orderBy: { name: 'asc' },
      }),
      prisma.branch.findMany({ select: { id: true, branchName: true, status: true } }),
      prisma.company.findMany({ select: { id: true, name: true, status: true } }),
    ]);
    const bMap = Object.fromEntries(branches.map(b => [b.id, b]));
    const cMap = Object.fromEntries(companies.map(c => [c.id, c]));
    const SUPPORTED = ['Active', 'Archived', 'Resigned', 'Terminated', 'Inactive'];

    const rows = employees.map(e => {
      const b = e.branchId ? bMap[e.branchId] : null;
      const c = cMap[e.companyId] || null;
      const archived = e.status === 'Archived';
      // An archived employee whose parent branch/company is Active is a mismatch.
      const parentActive = b ? b.status === 'Active' : (c ? c.status === 'Active' : false);
      const mismatch =
        (archived && parentActive) ||
        !SUPPORTED.includes(e.status);
      return {
        employeeId: e.employeeId,
        employeeName: e.name,
        status: e.status,
        isArchived: archived,
        branch: b ? b.branchName : '',
        company: c ? c.name : '',
        mismatch,
        mismatchReason: !SUPPORTED.includes(e.status)
          ? `Unsupported status "${e.status}"`
          : (archived && parentActive ? 'Archived employee under an Active branch/company' : ''),
      };
    });

    const mismatches = rows.filter(r => r.mismatch);
    const byStatus = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});

    res.set('Cache-Control', 'no-store');
    res.json({ total: rows.length, byStatus, mismatchCount: mismatches.length, mismatches, rows, generatedAt: new Date().toISOString() });
  } catch (error) {
    return respondError(res, error);
  }
};
