const prisma = require('../config/prisma');
const { generateEmployeeCode, validateCustomCode } = require('../utils/employeeCode');
const idParam = require('../utils/idParam');
const { coerceEntityIds } = require('../utils/idParam');
const { toPositiveInt } = require('../utils/numericId');
const { findDuplicate, buildIndex, matchAgainstIndex } = require('../utils/employeeDedup');
const respondError = require('../utils/respondError');
const { OFFBOARDED_STATUSES, lockRejection } = require('../utils/employeeStatus');
const { prepareEmployeeWriteData, applyCreateDefaults, describePrismaWriteError } = require('../utils/employeeWriteData');
const { validateEmployeePayload, validationErrorBody } = require('../utils/employeeRequiredFields');
const { buildEmployeeScope, NOT_OFFBOARDED, IS_OFFBOARDED } = require('../utils/employeeScope');
const locationMaster = require('./locationMasterController');

// The period a seeded payroll draft belongs to. These drafts used to be pinned
// to a literal 'June' / 2026, so every employee created or imported after that
// month landed in the wrong (and eventually long-past) payroll cycle.
const PAYROLL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const currentPayrollPeriod = () => {
  const now = new Date();
  return { month: PAYROLL_MONTH_NAMES[now.getMonth()], year: now.getFullYear() };
};

// Remember any custom state/city on an employee payload for dropdown reuse
// (best-effort, never blocks the save).
const rememberLocations = (data) => {
  if (data.state) locationMaster.remember('state', data.state);
  if (data.city) locationMaster.remember('city', data.city);
};

exports.getEmployees = async (req, res) => {
  try {
    const { page, limit, status, sortField, sortOrder, tab } = req.query;

    // ── Base scope + structural filters ────────────────────────────────────────
    // SINGLE SOURCE OF TRUTH (utils/employeeScope.js): the same builder feeds the
    // table rows, the reconciled counts AND the Employee Cards grid, so the list
    // and the count cards can never diverge (the bug this fixed: table 11 vs card 4).
    const scope = buildEmployeeScope(req);
    if (!scope.ok) return res.status(scope.status).json(scope.body);
    const { withStatus } = scope;
    const NOT_OFF = NOT_OFFBOARDED;
    const IS_OFF = IS_OFFBOARDED;

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

    // `?branchId=` was accepted and silently discarded, so a request for one
    // branch returned every employee in the workspace. It NARROWS the scoped set
    // (AND, never a substitute), so it can only ever show fewer employees than
    // the caller is already entitled to see.
    const branchFilter = idParam(req.query.branchId);
    if (branchFilter) tableWhere = { AND: [tableWhere, { branchId: branchFilter }] };

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

// ── GET /api/employees/cards ─────────────────────────────────────────────────
// The Employee Cards grid, one page at a time, WITH each card's metrics joined
// server-side.
//
// Why this exists rather than reusing GET /employees: the card grid used to pull
// three WHOLE-COMPANY datasets into the browser to compute its metrics — every
// attendance summary for the month, every leave balance, and the entire payroll
// history — then throw away all but the rows it could show. On a real tenant
// that is the page's actual cost; the employee list is the small part. Here the
// metric queries are constrained to the ~20 employees on the requested page.
//
// Query: page, limit, search, branch, department, status (+ companyId/workspace
// header). Returns { data, page, limit, total, totalPages, period }.
exports.employeeCards = async (req, res) => {
  try {
    const scope = buildEmployeeScope(req);
    if (!scope.ok) return res.status(scope.status).json(scope.body);

    // Cards are a roster of people who currently work here.
    const where = scope.withStatus(NOT_OFFBOARDED);

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const [total, employees] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { employeeId: 'asc' },
      }),
    ]);

    const ids = employees.map((e) => e.id);
    let period = null;
    let summaries = [], balances = [], payrolls = [];

    if (ids.length) {
      // Attendance period: the current month if it has been posted, otherwise the
      // most recent month that actually has data — so a card never shows a silent
      // zero for a month that simply has not happened yet.
      const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const now = new Date();
      period = { month: MONTHS[now.getMonth()], year: now.getFullYear() };

      const currentCount = await prisma.attendanceSummary.count({
        where: { employeeId: { in: ids }, month: period.month, year: period.year },
      });
      if (!currentCount) {
        const latest = await prisma.attendanceSummary.findFirst({
          where: { employeeId: { in: ids } },
          orderBy: [{ year: 'desc' }, { id: 'desc' }],
          select: { month: true, year: true },
        });
        if (latest) period = { month: latest.month, year: latest.year };
      }

      [summaries, balances, payrolls] = await Promise.all([
        prisma.attendanceSummary.findMany({
          where: { employeeId: { in: ids }, month: period.month, year: period.year },
        }),
        // One row per employee per YEAR. Ascending so the newest year is the last
        // written into the map below and therefore the one the card shows.
        prisma.leaveBalance.findMany({
          where: { employeeId: { in: ids } },
          orderBy: { year: 'asc' },
        }).catch(() => []),
        // Only this page's payroll rows; the newest per employee is picked below.
        prisma.payroll.findMany({
          where: { employeeId: { in: ids } },
          orderBy: [{ year: 'desc' }, { id: 'desc' }],
        }).catch(() => []),
      ]);
    }

    const MONTH_IDX = (m) => ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December']
      .indexOf(String(m || '')) + 1;

    const summaryBy = new Map(summaries.map((s) => [String(s.employeeId), s]));
    const balanceBy = new Map(balances.map((b) => [String(b.employeeId), b]));
    const latestPayBy = new Map();
    for (const row of payrolls) {
      const k = String(row.employeeId);
      const rank = Number(row.year || 0) * 100 + MONTH_IDX(row.month);
      const cur = latestPayBy.get(k);
      if (!cur || rank > cur._rank) latestPayBy.set(k, { ...row, _rank: rank });
    }

    // Each employee ships with the three records its card needs, so the client
    // does no cross-referencing and no whole-company fetch.
    const data = employees.map((e) => {
      const k = String(e.id);
      return {
        ...e,
        attendanceSummary: summaryBy.get(k) || null,
        leaveBalance: balanceBy.get(k) || null,
        latestPayroll: latestPayBy.get(k) || null,
      };
    });

    res.json({
      data,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
      period,
    });
  } catch (error) {
    return respondError(res, error, { action: 'load employee cards', resource: 'employee' });
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
      // An unresolvable company is a BAD REQUEST. Silently rewriting it to
      // company 1 filed the employee into an unrelated tenant — a cross-tenant
      // data leak triggered by nothing more than a typo'd id.
      if (!comp) return res.status(400).json({ error: 'The selected company does not exist.' });
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
        // `Employee.salary` is the MONTHLY gross (see recalcOne) — dividing by 12
        // seeded this draft at one twelfth of the real pay.
        const ctcMonthly = Math.round(employee.salary);
        const seedPeriod = currentPayrollPeriod();
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
            month: seedPeriod.month,
            year: seedPeriod.year,
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
          // An UNRESOLVED company is not a plan-limit problem — keep the guard's
          // own status and message rather than reporting a bogus
          // "your plan allows up to 0 employees".
          if (!guard.cap.resolved) {
            return res.status(guard.status || 400).json({ ...guard.body, importCount: addCount, imported: 0 });
          }
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
             // `Employee.salary` is the MONTHLY gross (see recalcOne) — dividing
             // by 12 seeded a draft at one twelfth of the real pay.
             const ctcMonthly = Math.round(emp.salary);
             const seedPeriod = currentPayrollPeriod();
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
                   month: seedPeriod.month,
                   year: seedPeriod.year,
                   companyId: emp.companyId
                 }
               },
               update: {},
               create: {
                 companyId: emp.companyId,
                 employeeId: emp.id,
                 employeeName: emp.name,
                 department: emp.department,
                 month: seedPeriod.month,
                 year: seedPeriod.year,
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
    // `idParam` passes a non-numeric value through unchanged, which then throws
    // inside Prisma — answered as a 500 whose message embedded the query and the
    // absolute server path. A malformed id is a bad request, so reject it here.
    const employeeDbId = toPositiveInt(id);
    if (employeeDbId === undefined) return res.status(400).json({ error: 'Invalid employee id.' });
    const employee = await prisma.employee.findUnique({ where: { id: employeeDbId } });
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
    // respondError maps Prisma faults to a safe 4xx and keeps the detail in the
    // log — never echo error.message, it can carry query text and file paths.
    return respondError(res, error, { action: 'load employee', resource: 'employee' });
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
      // Never silently re-home the employee into company 1 (see create()).
      if (!comp) return res.status(400).json({ error: 'The selected company does not exist.' });
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

// ── Employee Search (for Employee Analytics) ──────────────────────────────────
// Server-side, debounced-friendly, paginated search across name/id/email/mobile/
// department/designation/biometricId. Strictly company and branch isolated on the backend.
exports.searchEmployees = async (req, res) => {
  try {
    const { q = '', page = 1, limit = 20 } = req.query;

    // SINGLE SOURCE OF TRUTH (utils/employeeScope.js): Enforces strict company and branch isolation.
    // Automatically uses req.query.companyId or req.headers['x-workspace-id'] and req.user scope.
    const scope = buildEmployeeScope(req);
    if (!scope.ok) return res.status(scope.status).json(scope.body);

    const skip = (Number(page) - 1) * Number(limit);
    const take = Math.min(Number(limit), 50); // cap at 50

    const searchTerm = q.trim();
    const searchFilter = searchTerm ? {
      OR: [
        { name: { contains: searchTerm } },
        { employeeId: { contains: searchTerm } },
        { email: { contains: searchTerm } },
        { phone: { contains: searchTerm } },
        { department: { contains: searchTerm } },
        { designation: { contains: searchTerm } },
        { biometricId: { contains: searchTerm } },
      ],
    } : {};

    // Combine the strict scope with the search filter, ignoring archived/offboarded employees.
    const baseWhere = scope.withStatus(NOT_OFFBOARDED);
    const whereClause = {
      AND: [
        baseWhere,
        ...(searchTerm ? [searchFilter] : [])
      ]
    };

    const [total, employees] = await Promise.all([
      prisma.employee.count({ where: whereClause }),
      prisma.employee.findMany({
        where: whereClause,
        select: {
          id: true,
          employeeId: true,
          name: true,
          email: true,
          phone: true,
          department: true,
          designation: true,
          profilePhoto: true,
          status: true,
          branchId: true,
          companyId: true,
          branch: { select: { branchName: true } },
        },
        skip,
        take,
        orderBy: { name: 'asc' },
      }),
    ]);

    res.json({
      data: employees,
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take),
    });
  } catch (error) {
    return respondError(res, error);
  }
};

// ── Employee Analytics (aggregated real data) ─────────────────────────────────
// Returns attendance summary, leave summary, payroll summary for a single
// employee within a date range. All aggregations happen server-side (no N+1).
exports.getEmployeeAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const { dateRange = 'thisMonth' } = req.query;

    // Enforce strict company and branch isolation using single source of truth.
    const scope = buildEmployeeScope(req);
    if (!scope.ok) return res.status(scope.status).json(scope.body);

    const employee = await prisma.employee.findFirst({
      where: {
        AND: [
          { id: idParam(id) },
          scope.baseWhere
        ]
      },
      include: {
        branch: { select: { branchName: true } },
      },
    });
    
    // If employee is null, either it doesn't exist or it's outside the user's authorized branches/company.
    if (!employee) return res.status(404).json({ error: 'Employee not found or access denied.' });

    // Date range computation
    const now = new Date();
    let startDate, endDate = now;
    switch (dateRange) {
      case 'lastMonth':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'last3Months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      case 'last6Months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        break;
      case 'thisYear':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default: // thisMonth
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Run all queries in parallel for performance
    const [attendanceRecords, leaveRequests, payrollRecords, assets, documents] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { employeeId: employee.id, date: { gte: startDate, lte: endDate } },
        select: { date: true, status: true, checkIn: true, checkOut: true, workingHours: true, isLate: true, isEarlyLeave: true },
        orderBy: { date: 'asc' },
      }),
      prisma.leaveRequest.findMany({
        where: { employeeId: employee.id },
        select: { leaveType: true, status: true, startDate: true, endDate: true, days: true },
      }),
      prisma.payrollRecord.findMany({
        where: { employeeId: employee.id },
        select: { month: true, year: true, basicSalary: true, grossSalary: true, netSalary: true, totalDeductions: true, pfEmployee: true, esiEmployee: true, tds: true, overtimePay: true, status: true },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 12,
      }),
      prisma.asset.findMany({
        where: { assignedToId: employee.id },
        select: { assetCode: true, assetType: true, name: true, allocationDate: true, status: true, warrantyExpiry: true },
      }).catch(() => []),
      prisma.employeeDocument.findMany({
        where: { employeeId: employee.id },
        select: { documentType: true, verificationStatus: true, expiryDate: true, createdAt: true },
      }).catch(() => []),
    ]);

    // Attendance aggregations
    const totalDays = attendanceRecords.length;
    const present = attendanceRecords.filter(r => r.status === 'Present').length;
    const absent = attendanceRecords.filter(r => r.status === 'Absent').length;
    const halfDay = attendanceRecords.filter(r => r.status === 'Half Day').length;
    const late = attendanceRecords.filter(r => r.isLate).length;
    const earlyLeave = attendanceRecords.filter(r => r.isEarlyLeave).length;
    const presentWithHours = attendanceRecords.filter(r => r.workingHours > 0);
    const avgWorkingHours = presentWithHours.length > 0
      ? (presentWithHours.reduce((sum, r) => sum + (r.workingHours || 0), 0) / presentWithHours.length).toFixed(1)
      : 0;
    const attendancePct = totalDays > 0 ? ((present + halfDay * 0.5) / totalDays * 100).toFixed(1) : 0;

    // Leave aggregations
    const leaveByType = {};
    let usedLeave = 0, pendingLeave = 0, approvedLeave = 0, rejectedLeave = 0;
    leaveRequests.forEach(l => {
      const days = l.days || 1;
      if (!leaveByType[l.leaveType]) leaveByType[l.leaveType] = { total: 0, approved: 0, pending: 0, rejected: 0 };
      leaveByType[l.leaveType].total += days;
      if (l.status === 'Approved') { approvedLeave += days; leaveByType[l.leaveType].approved += days; usedLeave += days; }
      else if (l.status === 'Pending') { pendingLeave += days; leaveByType[l.leaveType].pending += days; }
      else if (l.status === 'Rejected') { rejectedLeave += days; leaveByType[l.leaveType].rejected += days; }
    });

    // Payroll aggregations
    const latestPayroll = payrollRecords[0] || null;
    const ytdNetSalary = payrollRecords.filter(p => p.year === now.getFullYear()).reduce((s, p) => s + (p.netSalary || 0), 0);

    res.json({
      employee: {
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        email: employee.email,
        mobile: employee.phone,
        department: employee.department,
        designation: employee.designation,
        profilePhoto: employee.profilePhoto,
        status: employee.status,
        joinDate: employee.joinDate,
        workLocation: employee.workLocation,
        reportingManager: employee.reportingManager,
        branch: employee.branch?.branchName || null,
      },
      attendance: {
        totalDays, present, absent, halfDay, late, earlyLeave,
        attendancePct, avgWorkingHours,
        dateRange: { start: startDate, end: endDate },
        records: attendanceRecords,
      },
      leave: {
        totalUsed: usedLeave, pending: pendingLeave, approved: approvedLeave, rejected: rejectedLeave,
        byType: leaveByType,
        requests: leaveRequests,
      },
      payroll: {
        current: latestPayroll,
        ytdNetSalary,
        history: payrollRecords,
      },
      assets,
      documents,
    });
  } catch (error) {
    return respondError(res, error);
  }
};

// ── GET /api/employees/search ─────────────────────────────────────────────────
// Lightweight, paginated employee search for the Employee Self-Service /
// Employee Analytics page. Company-isolated via buildEmployeeScope.
// Query params: q (search string), page, limit
// Returns: { data: EmployeeSearchResult[], total, page, limit, totalPages }
exports.searchEmployees = async (req, res) => {
  try {
    const scope = buildEmployeeScope(req);
    if (!scope.ok) return res.status(scope.status).json(scope.body);

    // Only active / non-offboarded employees are searchable via ESS
    let where = scope.withStatus(NOT_OFFBOARDED);

    const q = String(req.query.q || '').trim();
    if (q) {
      where = {
        AND: [
          where,
          {
            OR: [
              { name:        { contains: q } },
              { firstName:   { contains: q } },
              { lastName:    { contains: q } },
              { employeeId:  { contains: q } },
              { department:  { contains: q } },
              { designation: { contains: q } },
              { email:       { contains: q } },
              { phone:       { contains: q } },
            ],
          },
        ],
      };
    }

    const pageNum  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const skip     = (pageNum - 1) * limitNum;

    const [total, employees] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { employeeId: 'asc' },
        select: {
          id:          true,
          employeeId:  true,
          name:        true,
          email:       true,
          phone:       true,
          department:  true,
          designation: true,
          status:      true,
          profilePhoto: true,
          branch: { select: { branchName: true } },
        },
      }),
    ]);

    const data = employees.map((e) => ({
      id:           e.id,
      employeeId:   e.employeeId,
      name:         e.name,
      email:        e.email  || '',
      mobile:       e.phone  || '',
      department:   e.department  || '',
      designation:  e.designation || '',
      profilePhoto: e.profilePhoto || null,
      status:       e.status,
      branch:       e.branch || null,
    }));

    res.json({ data, total, page: pageNum, limit: limitNum, totalPages: Math.max(1, Math.ceil(total / limitNum)) });
  } catch (error) {
    return respondError(res, error);
  }
};
