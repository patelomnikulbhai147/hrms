/**
 * Leave Administration — manual wallet operations performed by HR / Company
 * Admin / Super Admin. Every mutation is written to the immutable AuditLog so
 * the "Audit" tab can answer who granted / deducted / reset / transferred leave.
 *
 * Categories: CL (Casual), PL (Privilege/Annual), SL (Sick). These map to the
 * clBalance/plBalance/slBalance + clUsed/plUsed/slUsed columns on LeaveBalance
 * via leaveService.FIELDS.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const leaveService = require('../services/leaveService');
const AuditService = require('../services/auditService');
const { OFFBOARDED_STATUSES, ACTIVE_EMPLOYEE_WHERE } = require('../utils/employeeStatus');
const { scopeWhere } = require('./leaveAdministrationController');

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DEFAULT_YEAR = leaveService.DEFAULT_YEAR;

// Normalise a free-form category/type into one of CL/PL/SL (the tracked wallets).
function normCategory(input) {
  const cat = leaveService.categoryOf(input);
  return leaveService.FIELDS[cat] ? cat : null;
}

async function audit(req, action, targetId, details) {
  if (req.user?.id) {
    await AuditService.logAudit(req.user.id, action, 'Leaves', String(targetId), {
      ...details,
      by: req.user.name || req.user.email,
    });
  }
}

// ── Grant leave (credit a wallet) ────────────────────────────────────────────
// body: { employeeId, category|leaveType, days, reason?, year? }
exports.grant = async (req, res) => {
  try {
    const employeeId = idParam(req.body.employeeId);
    const cat = normCategory(req.body.category || req.body.leaveType);
    const days = round(req.body.days);
    const year = Number(req.body.year) || DEFAULT_YEAR;
    if (!employeeId || !cat || days <= 0) {
      return res.status(400).json({ error: 'employeeId, a valid category (CL/PL/SL) and positive days are required.' });
    }
    const bal = await leaveService.getOrCreateBalance(employeeId, year);
    const f = leaveService.FIELDS[cat];
    const previousBalance = round(bal[f.bal]);
    const updated = await prisma.leaveBalance.update({
      where: { id: bal.id },
      data: { [f.bal]: round(bal[f.bal] + days) },
    });
    await audit(req, 'GRANT_LEAVE', employeeId, {
      category: cat, days, reason: req.body.reason || '',
      previousBalance, newBalance: updated[f.bal],
      effectiveDate: req.body.effectiveDate || null, year,
    });
    res.json(updated);
  } catch (e) {
    console.error('grant', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Grant leave globally (bulk) ──────────────────────────────────────────────
// body: { category|leaveType, days, reason?, year?, effectiveDate?, companyId?, branch?, department?, search?, status?, allowDuplicate? }
exports.grantBulk = async (req, res) => {
  try {
    const cat = normCategory(req.body.category || req.body.leaveType);
    const days = round(req.body.days);
    const year = Number(req.body.year) || DEFAULT_YEAR;
    if (!cat || days <= 0) {
      return res.status(400).json({ error: 'A valid category (CL/PL/SL) and positive days are required.' });
    }

    const scoped = await scopeWhere(req);
    if (!scoped.ok) {
      return res.status(scoped.status).json(scoped.body);
    }

    const search = String(req.body.search || '').trim();
    const department = String(req.body.department || '').trim();
    const branchFilter = String(req.body.branch || '').trim();
    
    // Only target active employees
    const where = { ...scoped.where, ...ACTIVE_EMPLOYEE_WHERE };
    if (department) where.department = department;
    if (branchFilter) where.branchLocation = branchFilter;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { employeeId: { contains: search } },
        { department: { contains: search } },
      ];
    }

    const emps = await prisma.employee.findMany({ where, select: { id: true, name: true, employeeId: true } });
    if (!emps.length) {
      return res.status(400).json({ error: 'No eligible employees found matching these filters.' });
    }

    const effectiveDate = req.body.effectiveDate || todayStr();

    // Check for duplicate bulk grant unless override is provided
    if (!req.body.allowDuplicate) {
      // Look for a recent audit log for GRANT_BULK_LEAVE with same details today
      // Or just look for any audit log where target is this company and details match.
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const recentAudit = await prisma.auditLog.findFirst({
        where: {
          action: 'GRANT_BULK_LEAVE',
          createdAt: { gte: startOfDay }
        }
      });

      if (recentAudit) {
        let parsed = {};
        try { parsed = JSON.parse(recentAudit.details); } catch(e){}
        if (parsed.category === cat && parsed.days === days) {
           return res.status(409).json({ 
             error: 'A similar bulk leave credit was already applied today. Allow duplicate to proceed.',
             isDuplicate: true 
           });
        }
      }
    }

    // Execute updates in a transaction for data consistency
    let processed = 0;
    const f = leaveService.FIELDS[cat];
    
    // We cannot easily do bulk getOrCreateBalance inside a single Prisma updateMany,
    // so we iterate. 
    // To ensure a proper transaction, we use Prisma interactive transaction.
    await prisma.$transaction(async (tx) => {
      for (const emp of emps) {
        // We can't use leaveService directly if it doesn't take `tx`, 
        // so we manually do getOrCreateBalance logic here to use tx.
        let bal = await tx.leaveBalance.findUnique({
          where: { employeeId_year: { employeeId: emp.id, year } }
        });
        if (!bal) {
          bal = await tx.leaveBalance.create({
            data: { companyId: scoped.companyId || req.user.companyId, employeeId: emp.id, year }
          });
        }
        await tx.leaveBalance.update({
          where: { id: bal.id },
          data: { [f.bal]: round(bal[f.bal] + days) },
        });
        processed++;
      }
      
      // Log the bulk action
      if (req.user?.id) {
        await tx.auditLog.create({
          data: {
            userId: req.user.id,
            action: 'GRANT_BULK_LEAVE',
            module: 'Leaves',
            targetId: 'Bulk',
            details: JSON.stringify({
              by: req.user.name || req.user.email,
              category: cat,
              days,
              reason: req.body.reason || '',
              effectiveDate,
              year,
              affectedEmployees: processed,
              filters: { department, branchFilter, search }
            })
          }
        });
      }
    });

    res.json({ success: true, processed });
  } catch (e) {
    console.error('grantBulk', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Deduct leave (debit a wallet) ────────────────────────────────────────────
// body: { employeeId, category|leaveType, days, reason?, year? }
exports.deduct = async (req, res) => {
  try {
    const employeeId = idParam(req.body.employeeId);
    const cat = normCategory(req.body.category || req.body.leaveType);
    const days = round(req.body.days);
    const year = Number(req.body.year) || DEFAULT_YEAR;
    if (!employeeId || !cat || days <= 0) {
      return res.status(400).json({ error: 'employeeId, a valid category (CL/PL/SL) and positive days are required.' });
    }
    const bal = await leaveService.getOrCreateBalance(employeeId, year);
    const f = leaveService.FIELDS[cat];
    const previousBalance = round(bal[f.bal]);
    const updated = await prisma.leaveBalance.update({
      where: { id: bal.id },
      data: { [f.bal]: round(Math.max(0, bal[f.bal] - days)) },
    });
    await audit(req, 'DEDUCT_LEAVE', employeeId, {
      category: cat, days, reason: req.body.reason || '',
      previousBalance, newBalance: updated[f.bal],
      effectiveDate: req.body.effectiveDate || null, year,
    });
    res.json(updated);
  } catch (e) {
    console.error('deduct', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Reset yearly balance ─────────────────────────────────────────────────────
// body: { employeeId, year?, keepCarryForward? }
// Zeroes used + balances; optionally re-seeds balances from carryForward.
exports.reset = async (req, res) => {
  try {
    const employeeId = idParam(req.body.employeeId);
    const year = Number(req.body.year) || DEFAULT_YEAR;
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required.' });
    const bal = await leaveService.getOrCreateBalance(employeeId, year);
    const cf = req.body.keepCarryForward ? round(bal.carryForward) : 0;
    const updated = await prisma.leaveBalance.update({
      where: { id: bal.id },
      data: {
        clBalance: cf, plBalance: cf, slBalance: cf,
        clUsed: 0, plUsed: 0, slUsed: 0,
        accruedThroughMonth: 0,
      },
    });
    await audit(req, 'RESET_LEAVE', employeeId, { year, keptCarryForward: cf });
    res.json(updated);
  } catch (e) {
    console.error('reset', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Transfer leave between two employees (same category) ─────────────────────
// body: { fromEmployeeId, toEmployeeId, category|leaveType, days, reason?, year? }
exports.transfer = async (req, res) => {
  try {
    const fromId = idParam(req.body.fromEmployeeId);
    const toId = idParam(req.body.toEmployeeId);
    const cat = normCategory(req.body.category || req.body.leaveType);
    const days = round(req.body.days);
    const year = Number(req.body.year) || DEFAULT_YEAR;
    if (!fromId || !toId || fromId === toId || !cat || days <= 0) {
      return res.status(400).json({ error: 'Distinct from/to employees, a valid category and positive days are required.' });
    }
    const f = leaveService.FIELDS[cat];
    const fromBal = await leaveService.getOrCreateBalance(fromId, year);
    if (round(fromBal[f.bal]) < days) {
      return res.status(409).json({ error: `Source employee has only ${round(fromBal[f.bal])} ${cat} day(s) to transfer.` });
    }
    const toBal = await leaveService.getOrCreateBalance(toId, year);
    const [src, dst] = await prisma.$transaction([
      prisma.leaveBalance.update({ where: { id: fromBal.id }, data: { [f.bal]: round(fromBal[f.bal] - days) } }),
      prisma.leaveBalance.update({ where: { id: toBal.id }, data: { [f.bal]: round(toBal[f.bal] + days) } }),
    ]);
    await audit(req, 'TRANSFER_LEAVE', `${fromId}->${toId}`, { category: cat, days, reason: req.body.reason || '', year });
    res.json({ from: src, to: dst });
  } catch (e) {
    console.error('transfer', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Carry forward unused balance into next year ──────────────────────────────
// body: { employeeId?, year?, companyId? }  (no employeeId → whole workspace)
exports.carryForward = async (req, res) => {
  try {
    const year = Number(req.body.year) || DEFAULT_YEAR;
    const nextYear = year + 1;
    const companyId = idParam(req.body.companyId || req.headers['x-workspace-id']);
    const cfg = await leaveService.getOrCreateConfig(companyId || req.user?.companyId || 1, year);
    if (!cfg.carryForwardEnabled) {
      return res.status(400).json({ error: 'Carry-forward is disabled in the leave policy for this company.' });
    }
    const cap = round(cfg.maxCarryForward);

    let targetEmployeeIds = [];
    if (req.body.employeeId) {
      targetEmployeeIds = [idParam(req.body.employeeId)];
    } else {
      // Offboarded employees are excluded from leave carry-forward.
      let empWhere = { status: { notIn: OFFBOARDED_STATUSES } };
      if (req.user && req.user.role !== 'Super Admin') {
        const ids = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
        empWhere.OR = [{ companyId: { in: ids } }, { branchId: { in: ids } }];
      } else if (companyId) {
        empWhere.OR = [{ companyId }, { branchId: companyId }];
      }
      const emps = await prisma.employee.findMany({ where: empWhere, select: { id: true } });
      targetEmployeeIds = emps.map(e => e.id);
    }

    let processed = 0;
    for (const eid of targetEmployeeIds) {
      const bal = await leaveService.getOrCreateBalance(eid, year);
      // Remaining = highest of the three wallets, capped by policy.
      const remaining = round(Math.max(bal.clBalance, bal.plBalance, bal.slBalance));
      const carry = round(Math.min(remaining, cap));
      if (carry <= 0) continue;
      const next = await leaveService.getOrCreateBalance(eid, nextYear);
      await prisma.leaveBalance.update({ where: { id: next.id }, data: { carryForward: carry } });
      processed++;
    }
    await audit(req, 'CARRY_FORWARD_LEAVE', companyId || 'workspace', { fromYear: year, toYear: nextYear, cap, processed });
    res.json({ processed, fromYear: year, toYear: nextYear, cap });
  } catch (e) {
    console.error('carryForward', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Audit trail (leave-related entries) ──────────────────────────────────────
// Company-scoped: a Company Head / HR sees ONLY leave actions performed by users
// in their own company scope — never another company's leave audit (Change #28).
// AuditLog has no companyId column, so scope by the acting user's company.
exports.getAuditLog = async (req, res) => {
  try {
    const take = Math.min(500, Number(req.query.limit) || 200);
    const where = { module: 'Leaves' };

    if (req.user && req.user.role !== 'Super Admin') {
      const allowed = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      // Users who belong to (or have access to) the caller's companies.
      const scopedUsers = await prisma.user.findMany({
        where: { OR: [{ companyId: { in: allowed } }, { id: req.user.id }] },
        select: { id: true },
      });
      where.userId = { in: scopedUsers.map(u => u.id) };
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: { user: { select: { name: true, email: true, role: true } } },
    });
    res.json(logs.map(l => ({
      id: l.id,
      action: l.action,
      targetId: l.targetId,
      details: (() => { try { return JSON.parse(l.details); } catch { return l.details; } })(),
      user: l.user?.name || l.user?.email || `User #${l.userId}`,
      role: l.user?.role,
      createdAt: l.createdAt,
    })));
  } catch (e) {
    console.error('getAuditLog', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
