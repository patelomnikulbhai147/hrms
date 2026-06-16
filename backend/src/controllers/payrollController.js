const prisma = require('../config/prisma');
// Coerces a string/number id to an integer PK. Used by update/delete/emailSlip
// below; previously only require()'d inline in one spot, leaving `idParam` undefined
// in the rest of the file (payroll edit/delete 500'd with "idParam is not defined").
const idParam = require('../utils/idParam');

// Helper to sync payroll for missing employees
const syncPayrollForEmployees = async (companyWhere, month, year) => {
  const employeeWhere = { status: 'Active' };
  if (companyWhere) {
    if (typeof companyWhere === 'string') {
      employeeWhere.OR = [
        { companyId: companyWhere },
        { branchId: companyWhere }
      ];
    } else if (companyWhere.in) {
      employeeWhere.OR = [
        { companyId: { in: companyWhere.in } },
        { branchId: { in: companyWhere.in } }
      ];
    }
  }

  const employeesRaw = await prisma.employee.findMany({
    where: employeeWhere
  });

  const companyIds = [...new Set(employeesRaw.map(e => e.companyId).filter(Boolean))];
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } }
  });
  const companyMap = {};
  for (const c of companies) companyMap[c.id] = c;

  const employees = employeesRaw.map(e => ({
    ...e,
    company: companyMap[e.companyId] || null
  }));

  if (!employees.length) return;

  const payrollRecords = await prisma.payroll.findMany({
    where: {
      month,
      year,
      employeeId: { in: employees.map(e => e.id) }
    },
    select: { employeeId: true }
  });

  const existingEmployeeIds = new Set(payrollRecords.map(p => p.employeeId));
  const missingEmployees = employees.filter(e => !existingEmployeeIds.has(e.id) && e.salary > 0);

  if (missingEmployees.length > 0) {
    const promises = missingEmployees.map(async emp => {
      const basicPercent = emp.company?.basicPercent || 50;
      const basicSalary = emp.salary;
      const hra = Math.round(basicSalary * 0.4);
      const special = Math.round(basicSalary * 0.1);
      const allowances = hra + special;
      
      const pfRate = emp.company?.pfRate || 12;
      const esicRate = emp.company?.esicRate || 0.75;
      const profTax = emp.company?.profTaxRate || 200;
      
      const pfDeduction = Math.round(basicSalary * (pfRate / 100));
      const esicDeduction = Math.round(basicSalary * (esicRate / 100));
      const deductions = pfDeduction + esicDeduction + profTax;
      const netSalary = Math.max(0, (basicSalary + allowances) - deductions);

      return prisma.payroll.create({
        data: {
          companyId: emp.companyId,
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department,
          month,
          year,
          basicSalary,
          allowances,
          deductions,
          netSalary,
          payrollStatus: 'draft',
          paymentStatus: 'pending',
          payslipGenerated: false
        }
      }).catch(err => {
         console.error("Failed to auto-create draft payroll:", err.message);
      });
    });

    await Promise.allSettled(promises);
  }
};

// ── Attendance-driven payroll computation ────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const daysInMonthOf = (month, year) => {
  const mi = Math.max(0, MONTHS.findIndex(m => m.toLowerCase() === String(month).toLowerCase()));
  return new Date(Number(year), mi + 1, 0).getDate();
};

/**
 * Recompute one payroll record from its AttendanceSummary. Payable days drive
 * pay; LWP days are deducted at the per-day rate; OT is paid as an allowance.
 * Persists the attendance figures on the payroll and clears `isOutdated`.
 */
async function recalcOne(payroll, summary, emp, company) {
  const basicSalary = emp?.salary || payroll.basicSalary || 0;
  const dim = daysInMonthOf(payroll.month, payroll.year);
  const perDay = dim > 0 ? basicSalary / dim : 0;

  const present = summary?.presentDays || 0;
  const cl = summary?.cl || 0, pl = summary?.pl || 0, sl = summary?.sl || 0;
  const lwp = summary?.lwp || 0, half = summary?.halfDays || 0, ot = summary?.otHours || 0;
  const payableDays = summary ? summary.payableDays : dim;

  const hra = Math.round(basicSalary * 0.4);
  const special = Math.round(basicSalary * 0.1);
  const overtimeRate = company?.overtimeRate || 1.5;
  const hourlyRate = dim > 0 ? basicSalary / (dim * 8) : 0;
  const otAmount = Math.round(ot * hourlyRate * overtimeRate);
  // Leave encashment already pushed onto this record is preserved and paid as an
  // earning (see leaveEncashmentController.addToPayroll), so it flows into net.
  const encashAmount = Math.round(payroll.leaveEncashmentAmount || 0);
  const allowances = hra + special + otAmount + encashAmount;

  const pfRate = company?.pfRate || 12;
  const esicRate = company?.esicRate || 0.75;
  const profTax = company?.profTaxRate || 200;
  const statutory = Math.round(basicSalary * (pfRate / 100)) + Math.round(basicSalary * (esicRate / 100)) + profTax;
  const lwpDeduction = Math.round(perDay * lwp);
  const deductions = statutory + lwpDeduction;
  const netSalary = Math.max(0, (basicSalary + allowances) - deductions);

  return prisma.payroll.update({
    where: { id: payroll.id },
    data: {
      basicSalary, allowances, deductions, netSalary,
      presentDays: present, clDays: cl, plDays: pl, slDays: sl, lwpDays: lwp,
      halfDays: half, otHours: ot, payableDays,
      isOutdated: false, summarySyncedAt: new Date(),
      notes: `Recalc: ${payableDays} payable day(s), ${lwp} LWP, ${ot} OT hr(s).`
        + (encashAmount > 0 ? ` Incl. leave encashment Rs.${encashAmount}.` : ''),
    },
  });
}

// Auto-sync helper: recompute every (unlocked) payroll row for one employee &
// month directly from its AttendanceSummary. Called automatically whenever the
// monthly attendance summary is edited, so payroll/dashboard/reports reflect
// attendance changes WITHOUT a manual "recalculate"/"push" step (Changes #24/#25).
// Locked payroll is left untouched (only an explicit Super-Admin recalc may
// change a locked month). Best-effort: returns count, never throws to the caller
// who should not have their attendance edit fail because of payroll.
async function recalcForEmployeeMonth(employeeId, month, year) {
  const eid = Number(employeeId);
  const records = await prisma.payroll.findMany({
    where: { employeeId: eid, month, year },
    include: { employee: true, company: true },
  });
  if (!records.length) return 0;
  const summary = await prisma.attendanceSummary.findUnique({
    where: { employeeId_month_year: { employeeId: eid, month, year } },
  });
  let n = 0;
  for (const p of records) {
    if (p.payrollStatus === 'locked') continue;
    await recalcOne(p, summary, p.employee, p.company);
    n++;
  }
  return n;
}
exports.recalcForEmployeeMonth = recalcForEmployeeMonth;

// POST /api/payroll/recalculate  { ids?, month?, year?, companyId? }
// Re-syncs payroll from AttendanceSummary. Without ids, recalculates every
// outdated record in scope. Locked records are skipped unless Super Admin.
exports.recalculate = async (req, res) => {
  try {
    const isSuper = req.user?.role === 'Super Admin';
    const ids = Array.isArray(req.body.ids) ? req.body.ids : null;

    let where;
    if (ids && ids.length) {
      where = { id: { in: ids } };
    } else {
      where = { isOutdated: true };
      if (req.body.month) where.month = req.body.month;
      if (req.body.year) where.year = Number(req.body.year);
      if (!isSuper) {
        const allowed = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
        where.OR = [{ companyId: { in: allowed } }, { employee: { branchId: { in: allowed } } }];
      } else if (req.body.companyId) {
        where.companyId = Number(req.body.companyId);
      }
    }

    const records = await prisma.payroll.findMany({ where, include: { employee: true, company: true } });
    let recalculated = 0, skippedLocked = 0;
    for (const p of records) {
      if (p.payrollStatus === 'locked' && !isSuper) { skippedLocked++; continue; }
      const summary = await prisma.attendanceSummary.findUnique({
        where: { employeeId_month_year: { employeeId: p.employeeId, month: p.month, year: p.year } },
      });
      await recalcOne(p, summary, p.employee, p.company);
      recalculated++;
    }
    res.json({ recalculated, skippedLocked });
  } catch (error) {
    console.error('Error recalculating payroll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { month } = req.query;
    const companyId = require('../utils/idParam')(req.query.companyId || req.headers['x-workspace-id']);
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      whereClause = {
        OR: [
          { companyId: { in: allowedIds } },
          { employee: { branchId: { in: allowedIds } } },
          { employee: { companyId: { in: allowedIds } } }
        ]
      };
      if (companyId) {
        if (!allowedIds.includes(companyId) && companyId !== 'c-gcri') {
           // Allow viewing if it's within their accessible companies
        }
        whereClause = {
          OR: [
            { companyId },
            { employee: { branchId: companyId } },
            { employee: { companyId: companyId } }
          ]
        };
      }
    } else if (companyId) {
      whereClause = {
        OR: [
          { companyId },
          { employee: { branchId: companyId } },
          { employee: { companyId: companyId } }
        ]
      };
    }

    const targetMonth = month || 'June';
    const targetYear = 2026;
    
    let syncCompanyWhere = undefined;
    if (companyId) {
      syncCompanyWhere = companyId;
    } else if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      syncCompanyWhere = { in: allowedIds };
    }
    
    await syncPayrollForEmployees(syncCompanyWhere, targetMonth, targetYear);

    const data = await prisma.payroll.findMany({ 
      where: whereClause,
      include: { employee: true }
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.generate = async (req, res) => {
  try {
    const { companyId, branchId, month, year, role, employeeIds } = req.body;

    if ((!companyId && !branchId) || !month || !year) {
      return res.status(400).json({ error: 'Missing required parameters.' });
    }

    const isBranch = !!branchId && role !== 'Company Head';

    // Selective generation: when employeeIds is provided, generate ONLY for those
    // employees (still scoped to the workspace below). No employeeIds = every
    // active employee in the workspace (the original bulk behaviour). We no longer
    // hard-block when a period already exists — generate now find-or-creates the
    // period record and APPENDS, so payroll can be run for a few employees now and
    // more later without a 409.

    // Fetch scoped employees
    const employeeWhere = { status: 'Active' };
    if (isBranch) {
      employeeWhere.branchId = branchId;
    } else {
      employeeWhere.OR = [
        { companyId: companyId },
        { branchId: companyId } // fallback in case branch is passed as companyId
      ];
    }
    if (Array.isArray(employeeIds) && employeeIds.length > 0) {
      employeeWhere.id = { in: employeeIds.map(Number).filter(Boolean) };
    }

    const employeesRaw = await prisma.employee.findMany({
      where: employeeWhere
    });

    const companyIds = [...new Set(employeesRaw.map(e => e.companyId).filter(Boolean))];
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } }
    });
    const companyMap = {};
    for (const c of companies) companyMap[c.id] = c;

    const employees = employeesRaw.map(e => ({
      ...e,
      company: companyMap[e.companyId] || null
    }));

    if (employees.length === 0) {
      return res.status(400).json({ error: 'No active employees found to generate payroll for.' });
    }

    let totalAmount = 0;
    const payrollRecordsToCreate = [];

    for (const emp of employees) {
      const basicPercent = emp.company?.basicPercent || 50;
      const basicSalary = emp.salary;
      const hra = Math.round(basicSalary * 0.4);
      const special = Math.round(basicSalary * 0.1);
      const allowances = hra + special;
      
      const pfRate = emp.company?.pfRate || 12;
      const esicRate = emp.company?.esicRate || 0.75;
      const profTax = emp.company?.profTaxRate || 200;
      
      const pfDeduction = Math.round(basicSalary * (pfRate / 100));
      const esicDeduction = Math.round(basicSalary * (esicRate / 100));
      const deductions = pfDeduction + esicDeduction + profTax;
      const netSalary = Math.max(0, (basicSalary + allowances) - deductions);

      totalAmount += netSalary;

      payrollRecordsToCreate.push({
        companyId: emp.companyId,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        month,
        year,
        basicSalary,
        allowances,
        deductions,
        netSalary,
        // Workflow: generate → Pending Approval (NOT paid). Approval and payment
        // are separate explicit stages (approve, then mark-paid).
        payrollStatus: 'pending_approval',
        paymentStatus: 'pending',
        payslipGenerated: false,
        paymentDate: new Date().toISOString()
      });
    }

    // Find-or-create the period's parent payroll record so SELECTIVE generation
    // can APPEND employees to an existing period instead of being blocked.
    let result;

    if (isBranch) {
      result = await prisma.branchPayroll.upsert({
        where: { branchId_payrollMonth_payrollYear: { branchId, payrollMonth: month, payrollYear: year } },
        update: { generatedBy: req.user?.name || 'System' },
        create: {
          branchId,
          companyId,
          payrollMonth: month,
          payrollYear: year,
          totalEmployees: 0,
          processedEmployees: 0,
          pendingEmployees: 0,
          totalAmount: 0,
          status: 'Pending',
          generatedBy: req.user?.name || 'System'
        }
      });
      payrollRecordsToCreate.forEach(record => { record.branchPayrollId = String(result.id); });
    } else {
      result = await prisma.companyPayroll.upsert({
        where: { companyId_payrollMonth_payrollYear: { companyId, payrollMonth: month, payrollYear: year } },
        update: { generatedBy: req.user?.name || 'System' },
        create: {
          companyId,
          payrollMonth: month,
          payrollYear: year,
          totalEmployees: 0,
          processedEmployees: 0,
          pendingEmployees: 0,
          totalAmount: 0,
          status: 'Pending',
          generatedBy: req.user?.name || 'System'
        }
      });
      payrollRecordsToCreate.forEach(record => { record.companyPayrollId = String(result.id); });
    }

    // Upsert employee payroll records (idempotent — re-generating updates).
    for (const record of payrollRecordsToCreate) {
      await prisma.payroll.upsert({
        where: {
          employeeId_month_year_companyId: {
            employeeId: record.employeeId,
            month: record.month,
            year: record.year,
            companyId: record.companyId
          }
        },
        update: record,
        create: record
      });
    }

    // Recompute the period's totals from ALL its child rows so appends keep the
    // summary accurate.
    const linkWhere = isBranch ? { branchPayrollId: String(result.id) } : { companyPayrollId: String(result.id) };
    const childRows = await prisma.payroll.findMany({ where: linkWhere });
    const sumAmount = childRows.reduce((s, r) => s + (r.netSalary || 0), 0);
    const paidCount = childRows.filter(r => String(r.paymentStatus).toLowerCase() === 'paid').length;
    const parentUpdate = {
      totalEmployees: childRows.length,
      processedEmployees: paidCount,
      pendingEmployees: childRows.length - paidCount,
      totalAmount: sumAmount,
    };
    if (isBranch) {
      await prisma.branchPayroll.update({ where: { id: result.id }, data: parentUpdate });
    } else {
      await prisma.companyPayroll.update({ where: { id: result.id }, data: parentUpdate });
    }

    res.status(201).json({
      message: `Payroll generated for ${payrollRecordsToCreate.length} employee(s).`,
      data: result,
      count: payrollRecordsToCreate.length,
    });
  } catch (error) {
    console.error('Error generating payroll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const { employeeId, month, year, companyId } = req.body;
    
    // Validation
    if (!employeeId || !month || !year || !companyId) {
      return res.status(400).json({ error: 'Missing required payroll fields: employeeId, month, year, companyId' });
    }

    const payload = { ...req.body };
    delete payload.status;
    delete payload.salary;
    delete payload.employee;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.designation;
    delete payload.id;
    // The client generator sends OT as overtimeAmount/overtimeHours, which are NOT
    // columns on Payroll (OT is already folded into `allowances`). Map the hours
    // onto the real `otHours` column and drop the unknown fields so the upsert
    // doesn't fail with "Unknown argument overtimeAmount".
    if (payload.overtimeHours != null && payload.otHours == null) {
      payload.otHours = Number(payload.overtimeHours) || 0;
    }
    delete payload.overtimeHours;
    delete payload.overtimeAmount;

    // Prevent duplicates by upserting based on unique constraint
    const data = await prisma.payroll.upsert({
      where: {
        employeeId_month_year_companyId: {
          employeeId,
          month,
          year,
          companyId
        }
      },
      update: payload,
      create: payload
    });
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("PAYROLL UPDATE CALLED FOR ID:", id);
    console.log("PAYLOAD RECEIVED:", req.body);
    const payload = { ...req.body };
    delete payload.status;
    delete payload.salary;
    delete payload.employee;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.designation;
    delete payload.id;
    // `reason` is metadata for the revision log, not a Payroll column.
    const reason = (payload.reason || '').toString();
    delete payload.reason;

    const existingRecord = await prisma.payroll.findUnique({
      where: { id: idParam(id) }
    });

    if (!existingRecord) {
      return res.status(404).json({ error: 'Payroll record not found.' });
    }

    if (payload.paymentStatus === 'paid' && existingRecord.paymentStatus === 'paid') {
      return res.status(400).json({ error: 'Payroll already paid.' });
    }

    // ── Revision history (replaces the old hard "lock") ──────────────────────
    // Authorized users may edit payroll at any stage; every amount change is
    // captured as a traceable revision: original → modified, by whom, when, why.
    const REVISION_FIELDS = ['basicSalary', 'allowances', 'deductions', 'netSalary', 'bonus', 'tax', 'leaveEncashmentAmount'];
    const changes = [];
    for (const f of REVISION_FIELDS) {
      if (payload[f] !== undefined && Number(payload[f]) !== Number(existingRecord[f] ?? 0)) {
        changes.push({ field: f, original: Number(existingRecord[f] ?? 0), modified: Number(payload[f]) });
      }
    }

    const data = await prisma.payroll.update({
      where: { id: idParam(id) },
      data: payload
    });

    if (changes.length && req.user?.id) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'REVISE_PAYROLL',
          module: 'Payroll',
          targetId: String(existingRecord.id),
          details: JSON.stringify({
            employee: existingRecord.employeeName,
            by: req.user.name || req.user.email,
            reason: reason || '(no reason given)',
            changes,
          }).slice(0, 1500),
        },
      }).catch(() => {});
    }

    // If marked as paid, update the master tables
    if (payload.paymentStatus === 'paid' && existingRecord.paymentStatus !== 'paid') {
      if (existingRecord.companyPayrollId) {
        await prisma.companyPayroll.update({
          where: { id: existingRecord.companyPayrollId },
          data: {
            processedEmployees: { increment: 1 },
            pendingEmployees: { decrement: 1 }
          }
        });
      }
      
      if (existingRecord.branchPayrollId) {
        await prisma.branchPayroll.update({
          where: { id: existingRecord.branchPayrollId },
          data: {
            processedEmployees: { increment: 1 },
            pendingEmployees: { decrement: 1 }
          }
        });
      }
    }

    res.json(data);
  } catch (error) {
    console.error('Error updating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.payroll.delete({
      where: { id: idParam(id) }
    });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// PATCH /api/payroll/:id/slip-event  { event: 'generated'|'downloaded'|'emailed', fileName? }
// Stamps the relevant payslip-lifecycle timestamp (audit history).
exports.slipEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { event, fileName } = req.body;
    const now = new Date();
    const data = {};
    if (fileName) data.payslipFileName = fileName;
    if (event === 'generated') { data.generatedAt = now; data.payslipGenerated = true; }
    else if (event === 'downloaded') { data.downloadedAt = now; data.downloadCount = { increment: 1 }; }
    else if (event === 'emailed') { data.emailSentAt = now; }
    else return res.status(400).json({ error: 'Unknown slip event.' });
    const updated = await prisma.payroll.update({ where: { id: idParam(id) }, data });
    res.json(updated);
  } catch (error) {
    console.error('Error stamping slip event', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// POST /api/payroll/approve  { ids: string[] }  → approve payroll record(s)
exports.approve = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : (req.params.id ? [req.params.id] : []);
    if (!ids.length) return res.status(400).json({ error: 'No payroll ids provided.' });
    const approvedBy = req.user?.name || req.user?.email || 'Admin';
    const result = await prisma.payroll.updateMany({
      where: { id: { in: ids } },
      data: { payrollStatus: 'approved', approvedAt: new Date(), approvedBy },
    });
    res.json({ approved: result.count });
  } catch (error) {
    console.error('Error approving payroll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// POST /api/payroll/mark-paid  { ids: string[] }  → mark record(s) paid
exports.markPaid = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'No payroll ids provided.' });
    const paidBy = req.user?.name || req.user?.email || 'Admin';
    const result = await prisma.payroll.updateMany({
      where: { id: { in: ids } },
      data: { paymentStatus: 'paid', payrollStatus: 'paid', paymentDate: new Date().toISOString(), paymentMethod: 'Bank Transfer', paidBy },
    });
    res.json({ paid: result.count });
  } catch (error) {
    console.error('Error marking paid', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// Lock/unlock the AttendanceSummary rows matching a set of payroll records.
async function setSummaryLock(payrollIds, locked) {
  const rows = await prisma.payroll.findMany({
    where: { id: { in: payrollIds } },
    select: { employeeId: true, month: true, year: true },
  });
  for (const r of rows) {
    await prisma.attendanceSummary.updateMany({
      where: { employeeId: r.employeeId, month: r.month, year: r.year },
      data: { locked },
    });
  }
}

// POST /api/payroll/lock  { ids }  → lock record(s) AND their attendance month
exports.lock = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : (req.params.id ? [req.params.id] : []);
    if (!ids.length) return res.status(400).json({ error: 'No payroll ids provided.' });
    const result = await prisma.payroll.updateMany({
      where: { id: { in: ids } },
      data: { payrollStatus: 'locked', lockedAt: new Date() },
    });
    await setSummaryLock(ids, true); // block attendance editing for the locked month
    res.json({ locked: result.count });
  } catch (error) {
    console.error('Error locking payroll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// POST /api/payroll/unlock  { ids }  → Super Admin only: reopen month + attendance
exports.unlock = async (req, res) => {
  try {
    if (req.user?.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only a Super Admin can unlock a payroll month.' });
    }
    const ids = Array.isArray(req.body.ids) ? req.body.ids : (req.params.id ? [req.params.id] : []);
    if (!ids.length) return res.status(400).json({ error: 'No payroll ids provided.' });
    const result = await prisma.payroll.updateMany({
      where: { id: { in: ids } },
      data: { payrollStatus: 'approved', lockedAt: null },
    });
    await setSummaryLock(ids, false);
    res.json({ unlocked: result.count });
  } catch (error) {
    console.error('Error unlocking payroll', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// POST /api/payroll/:id/email-slip  { pdfBase64, fileName, to? }
// Emails the salary slip (PDF generated client-side) and stamps emailSentAt.
exports.emailSlip = async (req, res) => {
  try {
    const { id } = req.params;
    const { pdfBase64, fileName, to } = req.body;
    const record = await prisma.payroll.findUnique({ where: { id: idParam(id) }, include: { employee: true, company: true } });
    if (!record) return res.status(404).json({ error: 'Payroll record not found.' });

    const recipient = to || record.employee?.email;
    if (!recipient) return res.status(400).json({ error: 'Employee has no email address on file.' });

    const { sendPayslipEmail, isSmtpConfigured } = require('../services/emailService');
    const period = `${record.month} ${record.year}`;
    const result = await sendPayslipEmail({
      to: recipient,
      employeeName: record.employee?.name || record.employeeName,
      period,
      companyName: record.company?.name,
      pdfBase64,
      fileName: fileName || `${record.employee?.employeeId || 'employee'}_${record.month}_${record.year}_Salary_Slip.pdf`,
    });

    // Stamp emailSentAt regardless of dev-mode (the intent + audit trail is recorded).
    await prisma.payroll.update({ where: { id: idParam(id) }, data: { emailSentAt: new Date() } });

    res.json({
      sent: result.delivered,
      devMode: result.devMode,
      smtpConfigured: isSmtpConfigured(),
      to: recipient,
      message: result.delivered
        ? `Salary slip emailed to ${recipient}.`
        : `SMTP is not configured — email was logged, not delivered. Set SMTP_* in backend/.env to enable real delivery. (Recipient: ${recipient})`,
    });
  } catch (error) {
    console.error('Error emailing slip', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
