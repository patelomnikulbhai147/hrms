/**
 * Bonus Cycle engine — Phases 2-5 of Bonus Management.
 *
 * A cycle ties a configuration to a financial year + bonus type and drives the
 * whole workflow:
 *   eligibility (RULE: workingDays >= config.minWorkingDays)
 *   → calculation (Payment of Bonus Act: bonus = eligible annual salary × %)
 *   → approval (Draft → Calculated → Approved → Paid / Cancelled)
 *   → payments + reports + employee self-service.
 *
 * Everything is company-scoped and audited. Bonus is NEVER stored on the
 * employee table — only in these bonus_* tables.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { OFFBOARDED_STATUSES } = require('../utils/employeeStatus');

const companyScopeFor = (req) => [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const canView = (req) => ['Super Admin', 'Company Head', 'HR', 'Finance'].includes(req.user?.role);
const canGenerate = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);     // HR generates
const canApprove = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);            // Company Head approves
const canRelease = (req) => ['Super Admin', 'Company Head', 'Finance'].includes(req.user?.role); // Payroll Admin releases

function targetCompanyId(req, requested) {
  if (isSuperAdmin(req)) return idParam(requested) || null;
  return req.user?.companyId || null;
}
function ensureCompany(req, companyId) {
  return isSuperAdmin(req) || companyScopeFor(req).includes(companyId);
}

async function audit(req, action, cycleId, entityId, details) {
  try {
    await prisma.bonusAuditLog.create({
      data: { companyId: details.companyId, cycleId: cycleId || null, entityType: details.entityType || 'CYCLE', entityId: entityId || null,
        action, performedBy: req.user?.id || null, performedByName: req.user?.name || req.user?.email || null, details: JSON.stringify(details) },
    });
  } catch { /* never block on audit */ }
}

// ── Statutory engine helpers ────────────────────────────────────────────────
function fyRange(fy) {
  const startY = parseInt(String(fy).split('-')[0], 10) || new Date().getFullYear();
  return { start: new Date(Date.UTC(startY, 3, 1)), end: new Date(Date.UTC(startY + 1, 2, 31)) }; // Apr 1 → Mar 31
}
function overlapDays(s1, e1, s2, e2) {
  const s = Math.max(s1.getTime(), s2.getTime());
  const e = Math.min(e1.getTime(), e2.getTime());
  return e < s ? 0 : Math.floor((e - s) / 86400000) + 1;
}

// Compute eligibility + calculation for one employee against a config.
function evaluate(emp, config, fy) {
  const { start, end } = fyRange(fy);
  const fyTotal = overlapDays(start, end, start, end);
  const join = emp.joinDate ? new Date(emp.joinDate) : start;
  const exit = emp.exitDate ? new Date(emp.exitDate) : end;
  const workingDays = overlapDays(start, end, join, exit);
  const monthly = Number(emp.salary) || 0;

  let eligibilityStatus = 'Eligible', reason = 'Meets minimum working days.';
  if (monthly <= 0) { eligibilityStatus = 'Pending Verification'; reason = 'Salary not configured — verify before calculating.'; }
  else if (workingDays < (config.minWorkingDays || 0)) { eligibilityStatus = 'Not Eligible'; reason = `Worked ${workingDays} day(s); minimum is ${config.minWorkingDays}.`; }

  const ceiling = config.salaryCeiling || null;
  const eligibleMonthly = ceiling ? Math.min(monthly, ceiling) : monthly;
  const proration = fyTotal ? Math.min(1, workingDays / fyTotal) : 1;
  const eligibleSalary = Math.round(eligibleMonthly * 12 * proration);
  const bonusPercent = config.minBonusPercent || 8.33;
  const bonusAmount = eligibilityStatus === 'Eligible' ? Math.round(eligibleSalary * bonusPercent / 100) : 0;
  return { workingDays, eligibilityStatus, reason, eligibleSalary, bonusPercent, bonusAmount };
}

// ── Cycles ──────────────────────────────────────────────────────────────────
exports.listCycles = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission to view bonus cycles.' });
    const wsId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let where = {};
    if (!isSuperAdmin(req)) {
      const scope = companyScopeFor(req);
      where.companyId = wsId && scope.includes(wsId) ? wsId : { in: scope.length ? scope : [-1] };
    } else if (wsId) where.companyId = wsId;
    const cycles = await prisma.bonusCycle.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(cycles);
  } catch (e) { console.error('bonus.listCycles', e); res.status(500).json({ error: e.message }); }
};

exports.createCycle = async (req, res) => {
  try {
    if (!canGenerate(req)) return res.status(403).json({ error: 'No permission to create bonus cycles.' });
    const b = req.body || {};
    const companyId = targetCompanyId(req, b.companyId);
    if (!companyId) return res.status(400).json({ error: 'Company is required.' });
    if (!b.bonusType || !b.financialYear) return res.status(400).json({ error: 'Bonus type and financial year are required.' });
    // Prefer an explicit configId; else the active config for this type+FY.
    let config = null;
    if (b.configId) config = await prisma.bonusConfiguration.findUnique({ where: { id: idParam(b.configId) } });
    if (!config) config = await prisma.bonusConfiguration.findFirst({ where: { companyId, bonusType: b.bonusType, financialYear: b.financialYear, isActive: true } });
    const cycle = await prisma.bonusCycle.create({
      data: { companyId, configId: config?.id || null, name: b.name || `${b.bonusType} ${b.financialYear}`, bonusType: b.bonusType, financialYear: b.financialYear, status: 'Draft' },
    });
    await audit(req, 'CREATE', cycle.id, cycle.id, { companyId, entityType: 'CYCLE', name: cycle.name });
    res.status(201).json(cycle);
  } catch (e) { console.error('bonus.createCycle', e); res.status(500).json({ error: e.message }); }
};

async function loadCycle(req, res) {
  const id = idParam(req.params.id);
  const cycle = await prisma.bonusCycle.findUnique({ where: { id } });
  if (!cycle) { res.status(404).json({ error: 'Bonus cycle not found.' }); return null; }
  if (!ensureCompany(req, cycle.companyId)) { res.status(403).json({ error: 'Unauthorized for this cycle.' }); return null; }
  return cycle;
}

// POST /cycles/:id/generate — Phase 2+3+4: compute eligibility + calculation for
// a scope (all / department / branch / selected employee ids). Replaces the
// cycle's lines and moves it to "Calculated".
exports.generate = async (req, res) => {
  try {
    if (!canGenerate(req)) return res.status(403).json({ error: 'No permission to generate bonus.' });
    const cycle = await loadCycle(req, res); if (!cycle) return;
    if (['Approved', 'Paid'].includes(cycle.status)) return res.status(400).json({ error: `Cannot regenerate a ${cycle.status} cycle.` });
    const config = cycle.configId ? await prisma.bonusConfiguration.findUnique({ where: { id: cycle.configId } })
      : await prisma.bonusConfiguration.findFirst({ where: { companyId: cycle.companyId, bonusType: cycle.bonusType, financialYear: cycle.financialYear } });
    if (!config) return res.status(400).json({ error: 'No bonus configuration found for this type/financial year. Create one first.' });

    const { scope = 'all', department, branch, employeeIds } = req.body || {};
    let where = { companyId: cycle.companyId };
    if (scope === 'department' && department) where.department = department;
    if (scope === 'branch' && branch) where.branchLocation = branch;
    if (scope === 'selected' && Array.isArray(employeeIds) && employeeIds.length) where.id = { in: employeeIds.map(idParam).filter(Boolean) };
    const employees = await prisma.employee.findMany({ where, select: { id: true, employeeId: true, name: true, department: true, branchLocation: true, joinDate: true, exitDate: true, salary: true, status: true } });

    // Replace existing lines for this cycle.
    await prisma.bonusEligibility.deleteMany({ where: { cycleId: cycle.id } });
    await prisma.bonusCalculation.deleteMany({ where: { cycleId: cycle.id } });

    let total = 0, eligibleCount = 0;
    for (const emp of employees) {
      const r = evaluate(emp, config, cycle.financialYear);
      await prisma.bonusEligibility.create({ data: { cycleId: cycle.id, companyId: cycle.companyId, employeeId: emp.id, workingDays: r.workingDays, eligibilityStatus: r.eligibilityStatus, reason: r.reason } });
      await prisma.bonusCalculation.create({ data: { cycleId: cycle.id, companyId: cycle.companyId, employeeId: emp.id, eligibleSalary: r.eligibleSalary, bonusPercent: r.bonusPercent, bonusAmount: r.bonusAmount } });
      if (r.eligibilityStatus === 'Eligible') { eligibleCount++; total += r.bonusAmount; }
    }
    const updated = await prisma.bonusCycle.update({ where: { id: cycle.id }, data: { status: 'Calculated', totalAmount: total, employeeCount: eligibleCount, generatedBy: req.user?.id || null, generatedAt: new Date() } });
    await audit(req, 'GENERATE', cycle.id, cycle.id, { companyId: cycle.companyId, scope, evaluated: employees.length, eligible: eligibleCount, total });
    res.json({ cycle: updated, evaluated: employees.length, eligible: eligibleCount, totalAmount: total });
  } catch (e) { console.error('bonus.generate', e); res.status(500).json({ error: e.message }); }
};

// GET /cycles/:id/lines — per-employee eligibility + calculation (joined) for display & reports.
exports.lines = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const cycle = await loadCycle(req, res); if (!cycle) return;
    const [elig, calc] = await Promise.all([
      prisma.bonusEligibility.findMany({ where: { cycleId: cycle.id } }),
      prisma.bonusCalculation.findMany({ where: { cycleId: cycle.id } }),
    ]);
    const empIds = elig.map(e => e.employeeId);
    const emps = await prisma.employee.findMany({ where: { id: { in: empIds.length ? empIds : [-1] } }, select: { id: true, employeeId: true, name: true, department: true, branchLocation: true, joinDate: true, salary: true } });
    const empMap = new Map(emps.map(e => [e.id, e]));
    const calcMap = new Map(calc.map(c => [c.employeeId, c]));
    const rows = elig.map(e => {
      const emp = empMap.get(e.employeeId) || {}; const c = calcMap.get(e.employeeId) || {};
      return { employeeId: e.employeeId, code: emp.employeeId, name: emp.name, department: emp.department, branch: emp.branchLocation, doj: emp.joinDate, salary: emp.salary,
        workingDays: e.workingDays, eligibilityStatus: e.eligibilityStatus, reason: e.reason,
        eligibleSalary: c.eligibleSalary || 0, bonusPercent: c.bonusPercent || 0, bonusAmount: c.bonusAmount || 0, isManualOverride: !!c.isManualOverride };
    });
    res.json({ cycle, rows });
  } catch (e) { console.error('bonus.lines', e); res.status(500).json({ error: e.message }); }
};

// PUT /cycles/:id/line/:employeeId — authorized manual override of a calculation.
exports.override = async (req, res) => {
  try {
    if (!canApprove(req)) return res.status(403).json({ error: 'Only an authorized approver can override amounts.' });
    const cycle = await loadCycle(req, res); if (!cycle) return;
    if (['Approved', 'Paid'].includes(cycle.status)) return res.status(400).json({ error: `Cannot edit a ${cycle.status} cycle.` });
    const employeeId = idParam(req.params.employeeId);
    const calc = await prisma.bonusCalculation.findFirst({ where: { cycleId: cycle.id, employeeId } });
    if (!calc) return res.status(404).json({ error: 'Calculation line not found.' });
    const amount = Number(req.body?.bonusAmount);
    if (isNaN(amount) || amount < 0) return res.status(400).json({ error: 'A valid bonus amount is required.' });
    await prisma.bonusCalculation.update({ where: { id: calc.id }, data: { bonusAmount: Math.round(amount), isManualOverride: true, overrideBy: req.user?.id || null, notes: req.body?.notes || null } });
    // Recompute cycle total from eligible lines.
    const elig = await prisma.bonusEligibility.findMany({ where: { cycleId: cycle.id, eligibilityStatus: 'Eligible' } });
    const calcs = await prisma.bonusCalculation.findMany({ where: { cycleId: cycle.id, employeeId: { in: elig.map(e => e.employeeId) } } });
    const total = calcs.reduce((s, c) => s + (c.bonusAmount || 0), 0);
    await prisma.bonusCycle.update({ where: { id: cycle.id }, data: { totalAmount: total } });
    await audit(req, 'UPDATE', cycle.id, employeeId, { companyId: cycle.companyId, entityType: 'CALCULATION', override: amount });
    res.json({ ok: true, totalAmount: total });
  } catch (e) { console.error('bonus.override', e); res.status(500).json({ error: e.message }); }
};

async function transition(req, res, { allow, from, to, stampField, action }) {
  if (!allow(req)) return res.status(403).json({ error: 'No permission for this action.' });
  const cycle = await loadCycle(req, res); if (!cycle) return;
  if (!from.includes(cycle.status)) return res.status(400).json({ error: `Cycle must be ${from.join('/')} (currently ${cycle.status}).` });
  const data = { status: to };
  if (stampField) { data[stampField] = req.user?.id || null; data[stampField.replace('By', 'At')] = new Date(); }
  const updated = await prisma.bonusCycle.update({ where: { id: cycle.id }, data });
  await audit(req, action, cycle.id, cycle.id, { companyId: cycle.companyId, from: cycle.status, to });
  return updated;
}

exports.approve = async (req, res) => {
  try {
    const u = await transition(req, res, { allow: canApprove, from: ['Calculated'], to: 'Approved', stampField: 'approvedBy', action: 'APPROVE' });
    if (u) res.json(u);
  } catch (e) { console.error('bonus.approve', e); res.status(500).json({ error: e.message }); }
};

// Release → create payment rows + mark Paid.
exports.release = async (req, res) => {
  try {
    if (!canRelease(req)) return res.status(403).json({ error: 'No permission to release bonus.' });
    const cycle = await loadCycle(req, res); if (!cycle) return;
    if (cycle.status !== 'Approved') return res.status(400).json({ error: `Cycle must be Approved (currently ${cycle.status}).` });
    const elig = await prisma.bonusEligibility.findMany({ where: { cycleId: cycle.id, eligibilityStatus: 'Eligible' } });
    const calcs = await prisma.bonusCalculation.findMany({ where: { cycleId: cycle.id, employeeId: { in: elig.map(e => e.employeeId) } } });
    const when = req.body?.paymentDate ? new Date(req.body.paymentDate) : new Date();
    const mode = req.body?.paymentMode || 'Bank Transfer';
    await prisma.bonusPayment.deleteMany({ where: { cycleId: cycle.id } });
    for (const c of calcs) {
      await prisma.bonusPayment.create({ data: { cycleId: cycle.id, companyId: cycle.companyId, employeeId: c.employeeId, amount: c.bonusAmount, paymentDate: when, paymentMode: mode, status: 'Paid' } });
    }
    const updated = await prisma.bonusCycle.update({ where: { id: cycle.id }, data: { status: 'Paid', releasedBy: req.user?.id || null, paidAt: when } });
    await audit(req, 'RELEASE', cycle.id, cycle.id, { companyId: cycle.companyId, payments: calcs.length });
    res.json({ cycle: updated, payments: calcs.length });
  } catch (e) { console.error('bonus.release', e); res.status(500).json({ error: e.message }); }
};

exports.cancel = async (req, res) => {
  try {
    const u = await transition(req, res, { allow: canApprove, from: ['Draft', 'Calculated', 'Approved'], to: 'Cancelled', action: 'CANCEL' });
    if (u) res.json(u);
  } catch (e) { console.error('bonus.cancel', e); res.status(500).json({ error: e.message }); }
};

// GET /payments — company-scoped payment history.
exports.payments = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const wsId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let where = {};
    if (!isSuperAdmin(req)) { const scope = companyScopeFor(req); where.companyId = wsId && scope.includes(wsId) ? wsId : { in: scope.length ? scope : [-1] }; }
    else if (wsId) where.companyId = wsId;
    const pays = await prisma.bonusPayment.findMany({ where, orderBy: { paymentDate: 'desc' }, take: 1000 });
    const empIds = [...new Set(pays.map(p => p.employeeId))];
    const emps = await prisma.employee.findMany({ where: { id: { in: empIds.length ? empIds : [-1] } }, select: { id: true, employeeId: true, name: true } });
    const cyc = await prisma.bonusCycle.findMany({ where: { id: { in: [...new Set(pays.map(p => p.cycleId))].filter(Boolean) } }, select: { id: true, name: true, bonusType: true, financialYear: true } });
    const em = new Map(emps.map(e => [e.id, e])); const cm = new Map(cyc.map(c => [c.id, c]));
    res.json(pays.map(p => ({ ...p, employee: em.get(p.employeeId) || null, cycle: cm.get(p.cycleId) || null })));
  } catch (e) { console.error('bonus.payments', e); res.status(500).json({ error: e.message }); }
};

// GET /my — employee self-service: own bonus payments (read-only).
exports.mine = async (req, res) => {
  try {
    const u = req.user || {};
    let emp = null;
    if (u.employeeId) emp = await prisma.employee.findFirst({ where: { employeeId: String(u.employeeId) }, select: { id: true } });
    if (!emp && u.email) emp = await prisma.employee.findFirst({ where: { email: u.email }, select: { id: true } });
    if (!emp) return res.json([]);
    const pays = await prisma.bonusPayment.findMany({ where: { employeeId: emp.id }, orderBy: { paymentDate: 'desc' } });
    const cyc = await prisma.bonusCycle.findMany({ where: { id: { in: [...new Set(pays.map(p => p.cycleId))].filter(Boolean) } }, select: { id: true, name: true, bonusType: true, financialYear: true } });
    const cm = new Map(cyc.map(c => [c.id, c]));
    res.json(pays.map(p => ({ id: p.id, amount: p.amount, paymentDate: p.paymentDate, paymentMode: p.paymentMode, status: p.status, cycle: cm.get(p.cycleId) || null })));
  } catch (e) { console.error('bonus.mine', e); res.status(500).json({ error: e.message }); }
};

// GET /dashboard — Company Head widgets summary (company-scoped).
exports.dashboard = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const companyId = targetCompanyId(req, req.query.companyId || req.headers['x-workspace-id']);
    let where = {};
    if (!isSuperAdmin(req)) where.companyId = { in: companyScopeFor(req).length ? companyScopeFor(req) : [-1] };
    else if (companyId) where.companyId = companyId;
    const cycles = await prisma.bonusCycle.findMany({ where });
    const totalBudget = cycles.reduce((s, c) => s + (c.totalAmount || 0), 0);
    const paid = cycles.filter(c => c.status === 'Paid').reduce((s, c) => s + (c.totalAmount || 0), 0);
    const pendingApprovals = cycles.filter(c => c.status === 'Calculated').length;
    const eligible = cycles.reduce((s, c) => s + (c.employeeCount || 0), 0);
    const upcoming = cycles.filter(c => ['Draft', 'Calculated', 'Approved'].includes(c.status)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
    res.json({ totalBudget, bonusPaid: paid, pendingApprovals, employeesEligible: eligible, upcomingCycle: upcoming ? { name: upcoming.name, status: upcoming.status, financialYear: upcoming.financialYear } : null });
  } catch (e) { console.error('bonus.dashboard', e); res.status(500).json({ error: e.message }); }
};
