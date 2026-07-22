const prisma = require('../config/prisma');
const { generateEmployeeCode, validateCustomCode } = require('../utils/employeeCode');
const idParam = require('../utils/idParam');
const { coerceEntityIds } = require('../utils/idParam');
const { findDuplicate, buildIndex, matchAgainstIndex } = require('../utils/employeeDedup');
const respondError = require('../utils/respondError');
const { OFFBOARDED_STATUSES, lockRejection } = require('../utils/employeeStatus');
const { prepareEmployeeWriteData, applyCreateDefaults, describePrismaWriteError } = require('../utils/employeeWriteData');
const { validateEmployeePayload, validationErrorBody } = require('../utils/employeeRequiredFields');
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
    const { page, limit, search, department, status, branch, sortField, sortOrder, tab } = req.query;

    // ── Base scope (company/branch authorisation) ──────────────────────────────
    // SINGLE SOURCE OF TRUTH: this scope + the structural filters below are shared
    // by BOTH the table rows AND the summary counts, so the employee list and the
    // count cards can never diverge (the bug this fixes: table 11 vs card 4).
    const baseWhere = {};
    if (req.user && req.user.role !== 'Super Admin') {
      // A user is scoped to their companies AND the branches under those companies.
      // accessibleBranchIds is derived in the protect middleware. Including branch
      // ids here lets a Company Head / HR open a BRANCH sub-workspace (a branch id
      // is no longer ambiguous with a company id — the namespaces no longer collide).
      const companyScope = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      const branchScope = (req.user.accessibleBranchIds || []).filter(Boolean);
      const allowedIds = [...companyScope, ...branchScope];
      baseWhere.OR = [
        { companyId: { in: companyScope } },
        { branchId: { in: branchScope.length ? branchScope : companyScope } }
      ];
      if (companyId) {
        if (!allowedIds.includes(companyId)) {
          return res.status(403).json({ error: 'Unauthorized to view this workspace\'s employees' });
        }
        // The selected workspace id may be a company OR a branch — match either column.
        baseWhere.OR = [{ companyId: companyId }, { branchId: companyId }];
      }
    } else if (companyId) {
      baseWhere.OR = [{ companyId: companyId }, { branchId: companyId }];
    }

    // ── Structural filters (search / department / branch / explicit status) ──────
    // Applied to the counts too, so changing a filter refreshes list AND cards.
    const AND = [];
    if (search) {
      AND.push({ OR: [ { name: { contains: search } }, { employeeId: { contains: search } }, { designation: { contains: search } } ] });
    }
    if (department) {
      AND.push({ OR: [ { department: department }, { designation: department } ] });
    }
    if (status) AND.push({ status });
    if (branch) baseWhere.branchLocation = branch;
    if (AND.length) baseWhere.AND = AND;

    // Clone baseWhere and AND one extra status condition (never mutate baseWhere),
    // so the three count buckets are derived from the exact same scope+filters.
    const withStatus = (extra) => (extra ? { ...baseWhere, AND: [ ...(baseWhere.AND || []), extra ] } : { ...baseWhere });
    const NOT_OFF = { status: { notIn: OFFBOARDED_STATUSES } };
    const IS_OFF = { status: { in: OFFBOARDED_STATUSES } };

    // ── Status axis (which subset the TABLE shows) ───────────────────────────────
    // An explicit tab from the Employee page wins. Otherwise keep the legacy
    // "active-only unless ?include=all" default so generic getAll() callers
    // (dropdowns, attendance/payroll/leave) are unaffected. Frontend isOffboarded
    // = Archived/Resigned/Terminated/Inactive/Offboarded.
    //   tab='all'  → EVERY employee in scope (active + previous). Was previously
    //                excluding offboarded, which is exactly why the All-Staff tab
    //                table (row count) never matched the All-Staff card (count).
    const includeAll = ['all', 'true', '1', 'yes']
      .includes(String(req.query.include || req.query.includeOffboarded || '').toLowerCase());
    let tableWhere;
    if (tab === 'active') tableWhere = withStatus(NOT_OFF);
    else if (tab === 'previous') tableWhere = withStatus(IS_OFF);
    else if (tab === 'all') tableWhere = withStatus(null);
    else if (status) tableWhere = withStatus(null); // explicit status filter defines the set
    else tableWhere = includeAll ? withStatus(null) : withStatus(NOT_OFF);

    let orderBy = {};
    if (sortField) {
      orderBy[sortField] = sortOrder === 'desc' ? 'desc' : 'asc';
    } else {
      orderBy = { employeeId: 'asc' };
    }

    if (page && limit) {
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;

      // Table rows AND the reconciled counts are read from ONE set of queries over
      // the SAME scope+filters. By construction: counts.all === total when tab='all',
      // counts.active === total when tab='active', counts.previous === total when
      // tab='previous'; and counts.all === counts.active + counts.previous always.
      const [employees, total, allCount, activeCount, previousCount] = await Promise.all([
        prisma.employee.findMany({ where: tableWhere, skip, take: limitNum, orderBy }),
        prisma.employee.count({ where: tableWhere }),
        prisma.employee.count({ where: withStatus(null) }),
        prisma.employee.count({ where: withStatus(NOT_OFF) }),
        prisma.employee.count({ where: withStatus(IS_OFF) })
      ]);

      return res.json({
        data: employees,
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        counts: { all: allCount, active: activeCount, previous: previousCount }
      });
    }

    const employees = await prisma.employee.findMany({ where: tableWhere, orderBy });
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
    // companyId is structural (scope), not a form field — checked separately.
    if (!data.companyId || String(data.companyId).trim() === '') {
      return res.status(400).json({ error: `${FIELD_LABELS.companyId} is required.`, code: 'REQUIRED_MISSING' });
    }

    // Every mandatory field re-checked server-side against the shared spec. A
    // payload that skipped the UI gate (DevTools, curl, replay) is refused here
    // with per-field errors — a partial employee record is never written.
    const check = validateEmployeePayload(data, 'create');
    if (!check.valid) return res.status(422).json(validationErrorBody(check.errors));


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

    // ── Write-ownership guard ────────────────────────────────────────────────
    // A non-Super-Admin may only create an employee inside a company/branch they
    // actually have access to. Without this a user could POST companyId/branchId
    // outside their scope and write into a tenant they can't even see.
    if (req.user && req.user.role !== 'Super Admin') {
      const companyScope = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean).map(String);
      const branchScope = (req.user.accessibleBranchIds || []).filter(Boolean).map(String);
      const okCompany = data.companyId != null && companyScope.includes(String(data.companyId));
      const okBranch = data.branchId != null && branchScope.includes(String(data.branchId));
      if (!okCompany && !okBranch) {
        return res.status(403).json({ error: 'You do not have access to the selected company or branch.' });
      }
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

    // ── Subscription employee-limit guard ───────────────────────────────────
    // Enforced for EVERY creator (incl. Super Admin) because the cap belongs to
    // the company's plan, not the actor. FREE = 100. Returns 403
    // EMPLOYEE_LIMIT_REACHED so the client can show the upgrade dialog.
    const cap = await require('../services/employeeLimitService').assertCapacity(data.companyId, 1);
    if (!cap.ok) return res.status(cap.status).json(cap.body);

    // Whitelist to real Employee columns + coerce bonus config fields. `employeeId`
    // was just resolved above, so re-attach it after the pick.
    const createData = applyCreateDefaults(prepareEmployeeWriteData(data));
    createData.employeeId = data.employeeId;
    const employee = await prisma.employee.create({
      data: createData
    });

    const HeadcountSyncService = require('../services/headcountSyncService');
    await HeadcountSyncService.handleEmployeeChange(null, employee);

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

    // ── PRE-FLIGHT plan-capacity check (whole file, BEFORE any write) ────────
    // The plan caps ACTIVE employees, so an import that would breach the cap is
    // rejected in full rather than committing part of the file and silently
    // skipping the tail. Only genuinely NEW people count towards the cap — rows
    // that match someone already on file are updates and consume no seat — and
    // the file is de-duplicated against itself so one person listed twice asks
    // for one seat. Nothing is written when this fires; the response says how
    // many slots are still available.
    const limitSvc = require('../services/employeeLimitService');
    const { norm, normPhone, normEmail } = require('../utils/employeeDedup');
    {
      const seenCode = new Set(), seenPhone = new Set(), seenEmail = new Set(), seenName = new Set();
      const newPerCompany = new Map();
      for (const data of employees) {
        if (!data || !data.companyId) continue;
        if (matchAgainstIndex(data, index)) continue;         // existing person → update
        const code = norm(data.employeeId);
        const ph = normPhone(data.phone);
        const em = normEmail(data.email);
        const nm = norm(data.name);
        const nameSeenKey = `${data.companyId}|${nm}`;
        if ((code && seenCode.has(code)) || (ph && seenPhone.has(ph)) ||
            (em && seenEmail.has(em)) || (nm && nm !== '-' && seenName.has(nameSeenKey))) continue;
        if (code) seenCode.add(code);
        if (ph) seenPhone.add(ph);
        if (em) seenEmail.add(em);
        if (nm && nm !== '-') seenName.add(nameSeenKey);
        const key = String(data.companyId);
        newPerCompany.set(key, (newPerCompany.get(key) || 0) + 1);
      }
      for (const [companyId, addCount] of newPerCompany) {
        const guard = await limitSvc.assertCapacity(companyId, addCount);
        if (!guard.ok) {
          const slots = guard.cap.remaining;
          return res.status(403).json({
            ...guard.body,
            importCount: addCount,
            availableSlots: slots,
            imported: 0,
            error:
              `Your ${guard.cap.plan} plan allows up to ${guard.cap.limit} active employees. ` +
              `Current employees: ${guard.cap.current}. This file adds ${addCount} new employee(s), ` +
              `but only ${slots} more can be added. Please upgrade your plan to continue.`,
          });
        }
      }
    }

    const created = [];
    const merged = [];
    const skipped = [];
    const failed = [];
    // Per-row audit for the import log (row number, who, outcome, why). The client
    // renders this verbatim so the user sees EXACTLY what happened to every row —
    // no silent merges/skips can hide behind a blanket "success".
    const results = [];

    // ── Subscription employee-limit guard (per tenant) ───────────────────────
    // Only genuinely NEW inserts consume a seat; merges/updates to existing
    // people never do. Capacity is resolved once per company and decremented
    // locally as we insert, so the cap holds across the whole batch. When a
    // tenant is full, further NEW rows are skipped (never created) with a
    // limit reason — existing-record updates still proceed. After the pre-flight
    // above this is a belt-and-braces net (e.g. a concurrent import racing us).
    const capCache = new Map();
    const takeSeat = async (companyId) => {
      const key = String(companyId || '');
      if (!capCache.has(key)) capCache.set(key, await limitSvc.getCapacity(companyId));
      const c = capCache.get(key);
      if (c.unlimited) return true;
      if (c.remaining <= 0) return false;
      c.remaining -= 1;
      return true;
    };

    let rowNum = 0;
    for (const data of employees) {
      rowNum++;
      const isBlank = (v) => v == null || String(v).trim() === '' || String(v).trim() === '-';
      const rowLabel = (!isBlank(data.name) ? String(data.name).trim() : (!isBlank(data.employeeId) ? String(data.employeeId).trim() : `Row ${rowNum}`));
      // Each row is isolated: a validation problem or a DB error on ONE row is
      // recorded as a failure for THAT row and the import continues — one bad row
      // can never abort the batch (which previously 500'd after partial commits).
      try {
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

        // ── Validation (reject before insert, with a clear reason) ────────────
        if (isBlank(data.name) && isBlank(data.employeeId)) {
          failed.push({ row: rowNum, name: rowLabel, reason: 'Missing employee name and code' });
          results.push({ row: rowNum, name: rowLabel, employeeId: data.employeeId || null, status: 'failed', reason: 'Missing employee name and code' });
          continue;
        }
        if (!data.companyId) {
          failed.push({ row: rowNum, name: rowLabel, employeeId: data.employeeId || null, reason: 'Missing company mapping' });
          results.push({ row: rowNum, name: rowLabel, employeeId: data.employeeId || null, status: 'failed', reason: 'Missing company mapping' });
          continue;
        }

        const dup = matchAgainstIndex(data, index);
        let result;
        if (dup) {
          // Same person already on file → UPDATE that record (never insert a 2nd
          // row). Keep the existing unique code; don't overwrite it with a blank.
          const patch = prepareEmployeeWriteData(data);
          delete patch.employeeId;
          result = await prisma.employee.update({ where: { id: dup.match.id }, data: patch });
          merged.push({ employeeId: result.employeeId, name: result.name, matchedOn: dup.field });
          results.push({ row: rowNum, name: result.name, employeeId: result.employeeId, status: 'updated', reason: `Matched an existing employee on ${dup.field} — record updated (not duplicated)` });
        } else if (data.employeeId) {
          // Has an explicit code → upsert on the unique code. A code NOT already on
          // file is a new insert → it must consume a seat; an existing code updates.
          const isNewInsert = !index.byCode.has(norm(data.employeeId));
          if (isNewInsert && !(await takeSeat(data.companyId))) {
            skipped.push({ name: data.name, employeeId: data.employeeId, reason: 'EMPLOYEE_LIMIT_REACHED' });
            results.push({ row: rowNum, name: rowLabel, employeeId: data.employeeId, status: 'skipped', reason: 'Plan employee limit reached — upgrade the subscription to add more' });
            continue;
          }
          const clean = prepareEmployeeWriteData(data);
          clean.employeeId = data.employeeId;
          result = await prisma.employee.upsert({
            where: { employeeId: data.employeeId },
            update: clean,
            create: applyCreateDefaults(clean),
          });
          created.push(result);
          results.push({ row: rowNum, name: result.name, employeeId: result.employeeId, status: isNewInsert ? 'created' : 'updated', reason: isNewInsert ? 'Created' : 'Existing code — record updated' });
        } else {
          if (!(await takeSeat(data.companyId))) {
            skipped.push({ name: data.name, reason: 'EMPLOYEE_LIMIT_REACHED' });
            results.push({ row: rowNum, name: rowLabel, employeeId: null, status: 'skipped', reason: 'Plan employee limit reached — upgrade the subscription to add more' });
            continue;
          }
          result = await prisma.employee.create({ data: applyCreateDefaults(prepareEmployeeWriteData(data)) });
          created.push(result);
          results.push({ row: rowNum, name: result.name, employeeId: result.employeeId, status: 'created', reason: 'Created' });
        }
        addToIndex(result);
      } catch (rowErr) {
        const reason = describePrismaWriteError(rowErr);
        console.error(`[bulkCreate] row ${rowNum} (${rowLabel}) failed:`, reason, '|', rowErr.message);
        failed.push({ row: rowNum, name: rowLabel, employeeId: data.employeeId || null, reason });
        results.push({ row: rowNum, name: rowLabel, employeeId: data.employeeId || null, status: 'failed', reason });
      }
    }

    const HeadcountSyncService = require('../services/headcountSyncService');
    await HeadcountSyncService.syncAllBranches();

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

    const limitSkipped = skipped.filter((s) => s.reason === 'EMPLOYEE_LIMIT_REACHED');
    res.status(201).json({
      total: employees.length,
      count: created.length,           // kept for backward-compat (NEW inserts)
      createdCount: created.length,
      mergedCount: merged.length,      // existing people whose record was updated
      updatedCount: merged.length,     // alias
      skippedCount: skipped.length,
      failedCount: failed.length,
      skipped,
      merged,
      failed,
      results,                         // per-row log: { row, name, employeeId, status, reason }
      employees: created,
      // Signal to the client that the plan cap blocked some rows → show upgrade.
      limitReached: limitSkipped.length > 0,
      limitSkippedCount: limitSkipped.length,
    });
  } catch (error) {
    console.error('Error in bulk create:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// ── Single authoritative employee read ──────────────────────────────────────
// There was no GET /employees/:id, so every screen could only ever seed itself
// from a row it happened to be holding — which is how a saved edit could still
// be displayed with its old values. The edit screen re-fetches through this
// before it opens, so what you edit is always the committed database state.
// Scope rules are identical to the update path: a non-Super-Admin may only read
// an employee inside their own company/branch.
exports.getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await prisma.employee.findUnique({ where: { id: idParam(id) } });
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });

    if (req.user && req.user.role !== 'Super Admin') {
      // Mirror getEmployees' scope EXACTLY. It matches `companyId IN companyScope`
      // OR `branchId IN (branchScope, or companyScope when the user has no branch
      // grants)`. Diverging here would refuse a record the list is happy to show,
      // which would silently push the edit screen back onto its stale fallback.
      const companyScope = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean).map(String);
      const branchScope = (req.user.accessibleBranchIds || []).filter(Boolean).map(String);
      const branchMatch = branchScope.length ? branchScope : companyScope;
      const inScope =
        (employee.companyId != null && companyScope.includes(String(employee.companyId))) ||
        (employee.branchId != null && branchMatch.includes(String(employee.branchId)));
      if (!inScope) {
        console.warn(`[employee:get] id=${id} by=${req.user.id} DENIED — outside company/branch scope`);
        return res.status(403).json({ error: 'You do not have access to this employee.' });
      }
    }

    res.json(employee);
  } catch (error) {
    console.error('[employee:get] failed:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.updateEmployee = async (req, res) => {
  // Update audit line: who edited which employee, and which fields they sent.
  // Values are deliberately NOT logged — an employee row is full of PII.
  const auditTag = `[employee:update] id=${req.params.id} by=${req.user?.id ?? '?'} (${req.user?.role || 'unknown'})`;
  // Every refusal is logged before it is returned. A save that the server turned
  // away used to leave no trace at all, so "it said it saved but didn't" was
  // impossible to tell apart from "it was rejected and the client mishandled it".
  const reject = (status, payload) => {
    console.warn(`${auditTag} REJECTED ${status}: ${payload.code || payload.error}`);
    return res.status(status).json(payload);
  };
  try {
    const { id } = req.params;
    let data = coerceEntityIds({ ...req.body });
    console.log(`${auditTag} fields=${Object.keys(data).length}`);

    // Locked-record policy: a PREVIOUS (offboarded) employee is a historical
    // employment record — read-only for everyone but a Super Admin. There is no
    // "reactivate by editing status" path: returning staff go through
    // re-onboarding, which creates a new record and leaves this one intact.
    const existingEmp = await prisma.employee.findUnique({ where: { id: idParam(id) }, select: { status: true, companyId: true, branchId: true, name: true } });
    const locked = existingEmp && lockRejection(existingEmp.status, req.user, existingEmp.name || 'This employee');
    if (locked) return reject(403, locked);

    // ── Write-ownership guard ────────────────────────────────────────────────
    // A non-Super-Admin may only edit an employee that is inside their company/
    // branch scope, AND may not move that employee into a company/branch outside
    // their scope. Both the current record and any new companyId/branchId checked.
    if (existingEmp && req.user && req.user.role !== 'Super Admin') {
      const companyScope = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean).map(String);
      const branchScope = (req.user.accessibleBranchIds || []).filter(Boolean).map(String);
      const inScope = (cid, bid) =>
        (cid != null && companyScope.includes(String(cid))) || (bid != null && branchScope.includes(String(bid)));
      if (!inScope(existingEmp.companyId, existingEmp.branchId)) {
        return reject(403, { error: 'You do not have access to this employee.' });
      }
      const targetCompany = data.companyId != null ? data.companyId : existingEmp.companyId;
      const targetBranch = data.branchId !== undefined ? data.branchId : existingEmp.branchId;
      if (!inScope(targetCompany, targetBranch)) {
        return reject(403, { error: 'You do not have access to the selected company or branch.' });
      }
    }

    // Validation for critical fields if they are provided
    const criticalFields = ['employeeId', 'companyId'];
    for (const field of criticalFields) {
      if (data.hasOwnProperty(field) && (!data[field] || String(data[field]).trim() === '')) {
        return reject(400, { error: `Critical field cannot be empty: ${field}` });
      }
    }

    // Mandatory-field contract, update mode: only the fields actually sent are
    // reviewed, so a partial save stays possible — but a required field that IS
    // sent may not be blanked or malformed. Same rules as create, same shape of
    // per-field errors.
    const check = validateEmployeePayload(data, 'update');
    if (!check.valid) return reject(422, validationErrorBody(check.errors));
    
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
          return reject(409, {
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
        if (!v.ok) return reject(400, { error: v.error });
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
        return reject(409, {
          error: `Update rejected: would duplicate an existing employee (${dup.field} matches ` +
            `${dup.match.name || dup.match.employeeId}, code ${dup.match.employeeId}).`,
          duplicateOf: { id: dup.match.id, employeeId: dup.match.employeeId, name: dup.match.name, field: dup.field },
        });
      }
    }

    await prisma.employee.update({
      where: { id: idParam(id) },
      data: prepareEmployeeWriteData(data)
    });

    // Read the row back BEFORE reporting success, and answer with that. The
    // client shows "saved" on a 2xx, so the response must be the committed DB
    // state — not the payload we were handed. If the re-read fails or the row
    // has vanished, this is NOT a success and must not be reported as one.
    const employee = await prisma.employee.findUnique({ where: { id: idParam(id) } });
    if (!employee) {
      console.error(`${auditTag} FAILED — row not found on read-back; update NOT confirmed`);
      return reject(500, {
        code: 'UPDATE_NOT_CONFIRMED',
        error: 'The update could not be confirmed in the database. Please retry and check the record.',
      });
    }

    const HeadcountSyncService = require('../services/headcountSyncService');
    await HeadcountSyncService.handleEmployeeChange(existingEmp, employee);

    console.log(`${auditTag} committed (updatedAt=${employee.updatedAt?.toISOString?.() || employee.updatedAt})`);
    res.json(employee);
  } catch (error) {
    console.error(`${auditTag} FAILED:`, error);
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

// ── POST /api/employees/:id/re-onboard ───────────────────────────────────────
// Re-hire a PREVIOUS (offboarded) employee.
//
// Deliberately creates a SECOND, brand-new employment record instead of flipping
// the old one back to Active: the previous record stays locked forever as the
// historical employment, and the new one is a fresh, fully-editable record with
// its own employee code. The two are linked only through the audit trail.
//
// `req.body` is the HR-reviewed copy of the old record (join date, department,
// salary etc. may all have changed), so anything the client sends wins over the
// inherited value; anything it omits is inherited from the source record.
exports.reOnboardEmployee = async (req, res) => {
  const auditTag = `[employee:re-onboard] source=${req.params.id} by=${req.user?.id ?? '?'} (${req.user?.role || 'unknown'})`;
  try {
    const sourceId = idParam(req.params.id);
    const source = await prisma.employee.findUnique({ where: { id: sourceId } });
    if (!source) return res.status(404).json({ error: 'Employee not found.' });

    // Only a PREVIOUS employee can be re-onboarded. Re-hiring somebody who is
    // still active would silently create a duplicate active person.
    if (!OFFBOARDED_STATUSES.includes(source.status)) {
      return res.status(400).json({
        code: 'EMPLOYEE_NOT_OFFBOARDED',
        error: `${source.name} is currently ${source.status} — only a previous (offboarded) employee can be re-onboarded.`,
      });
    }

    // ── Write-ownership guard — same rule as create/update ───────────────────
    if (req.user && req.user.role !== 'Super Admin') {
      const companyScope = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean).map(String);
      const branchScope = (req.user.accessibleBranchIds || []).filter(Boolean).map(String);
      const inScope = (source.companyId != null && companyScope.includes(String(source.companyId)))
        || (source.branchId != null && branchScope.includes(String(source.branchId)));
      if (!inScope) return res.status(403).json({ error: 'You do not have access to this employee.' });
    }

    // Inherit the old record, then let the reviewed payload override it. Columns
    // that define the *identity* of an employment record are never inherited:
    // the new row gets its own id/code/timestamps and starts with a clean exit.
    const body = coerceEntityIds({ ...req.body });
    delete body.id;
    delete body.employeeId;
    delete body.codeMode;
    const inherited = { ...source };
    ['id', 'employeeId', 'createdAt', 'updatedAt', 'status', 'exitDate', 'exitReason'].forEach(k => delete inherited[k]);

    let data = { ...inherited, ...body };
    data.status = 'Active';
    data.exitDate = null;
    data.exitReason = null;

    // A re-onboarded person joins on the re-onboarding date unless HR set one.
    data.joinDate = data.joinDate ? new Date(data.joinDate) : new Date();

    if (data.esic !== undefined) { data.esiNumber = data.esic; delete data.esic; }

    // The biometric code is a physical device enrolment and is unique per
    // company, so it cannot be inherited — the old record still holds it. HR
    // re-enrols the returning employee on the device.
    if (body.biometricId !== undefined) {
      data.biometricId = body.biometricId ? String(body.biometricId).trim().slice(0, 50) : null;
    } else {
      data.biometricId = null;
    }
    if (data.biometricId) {
      const clash = await prisma.employee.findFirst({
        where: { companyId: data.companyId, biometricId: data.biometricId },
        select: { id: true, name: true, employeeId: true },
      });
      if (clash) {
        return res.status(409).json({
          code: 'BIOMETRIC_CODE_DUPLICATE',
          error: `Biometric Code "${data.biometricId}" is already assigned to ${clash.name || clash.employeeId} in this company.`,
        });
      }
    }

    // NOTE: findDuplicate() is intentionally NOT run here. It exists to stop HR
    // from typing the same person in twice, and it matches on name/mobile/email —
    // all of which the returning employee legitimately shares with their own
    // locked historical record. Re-onboarding is the one sanctioned way to create
    // that second record.

    // The merged record must satisfy the same mandatory contract as a new hire —
    // inheriting from an old row is not a way around it.
    const check = validateEmployeePayload(data, 'create');
    if (!check.valid) return res.status(422).json(validationErrorBody(check.errors));

    data.employeeId = await generateEmployeeCode(data.branchId, data.companyId);

    // The returning employee occupies a seat again, so the plan cap applies
    // exactly as it does to a brand-new hire.
    const cap = await require('../services/employeeLimitService').assertCapacity(data.companyId, 1);
    if (!cap.ok) return res.status(cap.status).json(cap.body);

    const createData = applyCreateDefaults(prepareEmployeeWriteData(data));
    createData.employeeId = data.employeeId;
    const employee = await prisma.employee.create({ data: createData });

    const HeadcountSyncService = require('../services/headcountSyncService');
    await HeadcountSyncService.handleEmployeeChange(null, employee);

    // The only link between the two employment records. Written against the NEW
    // record so the re-hire shows up on its timeline, with the old code in the
    // details so the historical record is traceable from it.
    if (req.user?.id) {
      try {
        await prisma.auditLog.create({
          data: {
            userId: req.user.id,
            action: 'RE_ONBOARD_EMPLOYEE',
            module: 'Employees',
            targetId: String(employee.id),
            details: JSON.stringify({
              by: req.user.name || req.user.email || 'System',
              role: req.user.role,
              companyId: employee.companyId,
              reOnboardedFrom: { id: source.id, employeeId: source.employeeId, status: source.status, exitDate: source.exitDate },
              newEmployeeId: employee.employeeId,
            }),
          },
        });
      } catch (e) {
        console.error(`${auditTag} audit write failed:`, e.message);
      }
    }

    console.log(`${auditTag} OK new=${employee.employeeId} (id=${employee.id})`);
    res.status(201).json({
      employee,
      previous: { id: source.id, employeeId: source.employeeId },
      message: `${employee.name} re-onboarded as ${employee.employeeId}. The previous record (${source.employeeId}) remains locked.`,
    });
  } catch (error) {
    return respondError(res, error, { action: 're-onboard employee', resource: 'employee' });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.employee.findUnique({ where: { id: idParam(id) }, select: { companyId: true, branchId: true, status: true, name: true } });
    if (!existing) return res.status(404).json({ error: 'Employee not found.' });

    // A previous employee is already historical — archiving it again is a no-op
    // that would only overwrite the real exit date with today's.
    const locked = lockRejection(existing.status, req.user, existing.name || 'This employee');
    if (locked) return res.status(403).json(locked);

    // ── Write-ownership guard ────────────────────────────────────────────────
    // A non-Super-Admin may only archive an employee inside their company/branch.
    if (req.user && req.user.role !== 'Super Admin') {
      const companyScope = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean).map(String);
      const branchScope = (req.user.accessibleBranchIds || []).filter(Boolean).map(String);
      const inScope = (existing.companyId != null && companyScope.includes(String(existing.companyId)))
        || (existing.branchId != null && branchScope.includes(String(existing.branchId)));
      if (!inScope) return res.status(403).json({ error: 'You do not have access to this employee.' });
    }

    // Archive employee instead of hard delete
    const employee = await prisma.employee.update({
      where: { id: idParam(id) },
      data: {
        status: 'Archived',
        exitDate: new Date(),
        exitReason: 'Admin Archived'
      }
    });

    const HeadcountSyncService = require('../services/headcountSyncService');
    await HeadcountSyncService.handleEmployeeChange(existing, employee);

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
