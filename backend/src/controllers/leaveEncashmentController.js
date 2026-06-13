/**
 * Leave Encashment — convert unused leave into money, optionally pushing the
 * amount onto a payroll record so it appears as an earning on the salary slip.
 *
 *   amount = encashedDays × dailyRate,  dailyRate = monthlySalary / 30
 *
 * Encashment policy (allowEncashment, encashableTypes, maxEncashmentDays) lives
 * on LeaveCreditConfig. Every mutation is written to the AuditLog.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const leaveService = require('../services/leaveService');
const AuditService = require('../services/auditService');

const DEFAULT_YEAR = leaveService.DEFAULT_YEAR;
const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const dailyRateOf = (salary) => round((Number(salary) || 0) / 30);

const allowedIdsFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);

function scopeEmpWhere(req, companyId) {
  if (req.user && req.user.role !== 'Super Admin') {
    const ids = allowedIdsFor(req);
    return { OR: [{ companyId: { in: ids } }, { branchId: { in: ids } }] };
  }
  if (companyId) return { OR: [{ companyId }, { branchId: companyId }] };
  return {};
}

async function audit(req, action, targetId, details) {
  if (req.user?.id) {
    await AuditService.logAudit(req.user.id, action, 'Leaves', String(targetId), {
      ...details, by: req.user.name || req.user.email,
    });
  }
}

// Resolve which categories a company allows to be encashed.
function encashableSet(cfg) {
  return new Set(String(cfg.encashableTypes || 'PL').split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
}

// ── List encashment records (workspace-scoped) ───────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    const year = Number(req.query.year) || DEFAULT_YEAR;
    const rows = await prisma.leaveEncashment.findMany({
      where: { year, employee: scopeEmpWhere(req, companyId) },
      include: { employee: { select: { employeeId: true, name: true, branchId: true, companyId: true, department: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows.map(r => ({
      id: r.id, employeeId: r.employeeId, employeeCode: r.employee?.employeeId,
      employeeName: r.employeeName || r.employee?.name, department: r.employee?.department,
      branchId: r.employee?.branchId, companyId: r.employee?.companyId,
      year: r.year, leaveType: r.leaveType, days: r.days, dailyRate: r.dailyRate,
      amount: r.amount, status: r.status, processedBy: r.processedBy,
      processedOn: r.processedOn, payrollMonth: r.payrollMonth, notes: r.notes,
      createdAt: r.createdAt,
    })));
  } catch (e) {
    console.error('encashment.getAll', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Preview: encashable days + amount for every scoped employee ──────────────
// GET /api/leave-encashment/calculate?companyId=&year=
exports.calculate = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']) || req.user?.companyId || 1;
    const year = Number(req.query.year) || DEFAULT_YEAR;
    const cfg = await leaveService.getOrCreateConfig(companyId, year);
    const types = encashableSet(cfg);

    const balances = await prisma.leaveBalance.findMany({
      where: { year, employee: scopeEmpWhere(req, companyId) },
      include: { employee: { select: { id: true, employeeId: true, name: true, salary: true, department: true, branchId: true } } },
    });

    const FIELD = { CL: 'clBalance', PL: 'plBalance', SL: 'slBalance' };
    const preview = balances.map(b => {
      const salary = b.employee?.salary || 0;
      const rate = dailyRateOf(salary);
      const lines = ['CL', 'PL', 'SL']
        .filter(t => types.has(t))
        .map(t => ({ type: t, available: round(b[FIELD[t]]) }))
        .filter(l => l.available > 0);
      let days = round(lines.reduce((s, l) => s + l.available, 0));
      const capped = Math.min(days, cfg.maxEncashmentDays);
      return {
        employeeId: b.employeeId,
        employeeCode: b.employee?.employeeId,
        employeeName: b.employee?.name,
        department: b.employee?.department,
        branchId: b.employee?.branchId,
        salary, dailyRate: rate,
        breakdown: lines,
        eligibleDays: round(capped),
        amount: round(capped * rate),
      };
    });
    res.json({ allowEncashment: cfg.allowEncashment, encashableTypes: Array.from(types), maxEncashmentDays: cfg.maxEncashmentDays, preview });
  } catch (e) {
    console.error('encashment.calculate', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Create an encashment record (deducts the wallet) ─────────────────────────
// body: { employeeId, leaveType, days, year?, autoApprove? }
exports.create = async (req, res) => {
  try {
    const employeeId = idParam(req.body.employeeId);
    const cat = leaveService.categoryOf(req.body.leaveType);
    const days = round(req.body.days);
    const year = Number(req.body.year) || DEFAULT_YEAR;
    if (!employeeId || !leaveService.FIELDS[cat] || days <= 0) {
      return res.status(400).json({ error: 'employeeId, an encashable category (CL/PL/SL) and positive days are required.' });
    }

    const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true, salary: true, companyId: true } });
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const cfg = await leaveService.getOrCreateConfig(emp.companyId, year);
    if (!cfg.allowEncashment) return res.status(400).json({ error: 'Leave encashment is disabled in this company policy.' });
    if (!encashableSet(cfg).has(cat)) return res.status(400).json({ error: `${cat} is not an encashable leave type for this company.` });
    if (days > cfg.maxEncashmentDays) return res.status(400).json({ error: `Encashment exceeds the ${cfg.maxEncashmentDays}-day limit.` });

    const bal = await leaveService.getOrCreateBalance(employeeId, year);
    const f = leaveService.FIELDS[cat];
    if (round(bal[f.bal]) < days) {
      return res.status(409).json({ error: `Insufficient ${cat} balance (available ${round(bal[f.bal])}, requested ${days}).` });
    }

    const rate = dailyRateOf(emp.salary);
    const amount = round(days * rate);

    // Deduct the encashed days from the wallet (they are paid out, not taken).
    await prisma.leaveBalance.update({ where: { id: bal.id }, data: { [f.bal]: round(bal[f.bal] - days) } });

    const rec = await prisma.leaveEncashment.create({
      data: {
        companyId: emp.companyId, employeeId, employeeName: emp.name, year,
        leaveType: cat, days, dailyRate: rate, amount,
        status: req.body.autoApprove ? 'Approved' : 'Pending',
        notes: req.body.notes || null,
      },
    });
    await audit(req, 'CREATE_ENCASHMENT', rec.id, { employeeId, category: cat, days, rate, amount, year });
    res.status(201).json(rec);
  } catch (e) {
    console.error('encashment.create', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Approve / update status ──────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const existing = await prisma.leaveEncashment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Encashment not found.' });
    const data = {};
    if (req.body.status !== undefined) data.status = req.body.status;
    if (req.body.notes !== undefined) data.notes = req.body.notes;
    if (req.body.status === 'Approved') { data.processedBy = req.user?.name || req.user?.email; data.processedOn = new Date().toISOString(); }
    const rec = await prisma.leaveEncashment.update({ where: { id }, data });
    await audit(req, 'UPDATE_ENCASHMENT', id, { status: rec.status });
    res.json(rec);
  } catch (e) {
    console.error('encashment.update', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Delete (refunds the wallet if not yet paid) ──────────────────────────────
exports.remove = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const existing = await prisma.leaveEncashment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Encashment not found.' });
    if (existing.status !== 'Paid') {
      const f = leaveService.FIELDS[existing.leaveType];
      if (f) {
        const bal = await leaveService.getOrCreateBalance(existing.employeeId, existing.year);
        await prisma.leaveBalance.update({ where: { id: bal.id }, data: { [f.bal]: round(bal[f.bal] + existing.days) } });
      }
    }
    await prisma.leaveEncashment.delete({ where: { id } });
    await audit(req, 'DELETE_ENCASHMENT', id, { employeeId: existing.employeeId, days: existing.days, refunded: existing.status !== 'Paid' });
    res.json({ message: 'Deleted', refunded: existing.status !== 'Paid' });
  } catch (e) {
    console.error('encashment.remove', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Push an encashment amount onto the employee's payroll for a month ─────────
// body: { id, month, year? }  → sets leaveEncashment* fields, bumps allowances/net.
exports.addToPayroll = async (req, res) => {
  try {
    const id = idParam(req.body.id);
    const month = req.body.month;
    const rec = await prisma.leaveEncashment.findUnique({ where: { id } });
    if (!rec) return res.status(404).json({ error: 'Encashment not found.' });
    if (!month) return res.status(400).json({ error: 'A target payroll month is required.' });
    const year = Number(req.body.year) || rec.year;

    let payroll = await prisma.payroll.findFirst({ where: { employeeId: rec.employeeId, month, year } });
    if (!payroll) {
      return res.status(404).json({ error: `No payroll record for this employee in ${month} ${year}. Generate payroll first.` });
    }

    const newDays = round((payroll.leaveEncashmentDays || 0) + rec.days);
    const newAmount = round((payroll.leaveEncashmentAmount || 0) + rec.amount);
    const allowances = round((payroll.allowances || 0) + rec.amount);
    const netSalary = round(Math.max(0, (payroll.basicSalary || 0) + allowances - (payroll.deductions || 0)));

    const updated = await prisma.payroll.update({
      where: { id: payroll.id },
      data: {
        leaveEncashmentDays: newDays, leaveEncashmentAmount: newAmount,
        allowances, netSalary, isOutdated: false,
        notes: `${payroll.notes || ''} | Leave encashment Rs.${rec.amount} (${rec.days}d ${rec.leaveType}).`.trim(),
      },
    });
    await prisma.leaveEncashment.update({ where: { id }, data: { status: 'Paid', payrollMonth: `${month} ${year}`, processedBy: req.user?.name, processedOn: new Date().toISOString() } });
    await audit(req, 'ENCASHMENT_TO_PAYROLL', id, { employeeId: rec.employeeId, month, year, amount: rec.amount });
    res.json({ payroll: updated, encashmentId: id });
  } catch (e) {
    console.error('encashment.addToPayroll', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Auto year-end: create Pending encashments for all unused encashable leave ─
// body: { companyId?, year? }
exports.yearEnd = async (req, res) => {
  try {
    const companyId = idParam(req.body.companyId || req.headers['x-workspace-id']) || req.user?.companyId || 1;
    const year = Number(req.body.year) || DEFAULT_YEAR;
    const cfg = await leaveService.getOrCreateConfig(companyId, year);
    if (!cfg.allowEncashment) return res.status(400).json({ error: 'Leave encashment is disabled in this company policy.' });
    const types = encashableSet(cfg);
    const FIELD = { CL: 'clBalance', PL: 'plBalance', SL: 'slBalance' };

    const balances = await prisma.leaveBalance.findMany({
      where: { year, employee: scopeEmpWhere(req, companyId) },
      include: { employee: { select: { id: true, name: true, salary: true, companyId: true } } },
    });

    let created = 0;
    for (const b of balances) {
      const rate = dailyRateOf(b.employee?.salary);
      let remaining = ['CL', 'PL', 'SL'].filter(t => types.has(t)).reduce((s, t) => s + round(b[FIELD[t]]), 0);
      remaining = round(Math.min(remaining, cfg.maxEncashmentDays));
      if (remaining <= 0) continue;
      // Deduct proportionally across encashable wallets, recording one row per type.
      for (const t of ['CL', 'PL', 'SL']) {
        if (!types.has(t)) continue;
        const avail = round(b[FIELD[t]]);
        if (avail <= 0 || remaining <= 0) continue;
        const take = round(Math.min(avail, remaining));
        remaining = round(remaining - take);
        await prisma.leaveBalance.update({ where: { id: b.id }, data: { [FIELD[t]]: round(avail - take) } });
        await prisma.leaveEncashment.create({
          data: {
            companyId: b.employee?.companyId || companyId, employeeId: b.employeeId, employeeName: b.employee?.name,
            year, leaveType: t, days: take, dailyRate: rate, amount: round(take * rate),
            status: 'Approved', notes: 'Auto year-end encashment', processedBy: req.user?.name, processedOn: new Date().toISOString(),
          },
        });
        created++;
      }
    }
    await audit(req, 'YEAR_END_ENCASHMENT', companyId, { year, recordsCreated: created });
    res.json({ created, year });
  } catch (e) {
    console.error('encashment.yearEnd', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
