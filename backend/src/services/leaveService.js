/**
 * Leave wallet + monthly-accrual engine.
 *
 * Categories tracked as a balance: CL (Casual), PL (Privilege/Annual/Earned),
 * SL (Sick). LWP (Leave Without Pay / Unpaid) is always allowed and never has a
 * balance — it is deducted in payroll. Any other type (Maternity/Paternity/etc.)
 * is treated as paid special leave with no balance check.
 *
 * Monthly accrual: clBalance = clPerMonth × monthsElapsed + carryForward − clUsed
 * (idempotent via accruedThroughMonth, so re-running never double-credits).
 */
const prisma = require('../config/prisma');

const DEFAULT_YEAR = 2026;

// Map a free-form leaveType string to a tracked category.
function categoryOf(leaveType) {
  const s = String(leaveType || '').toLowerCase();
  if (/lwp|without pay|unpaid|loss of pay/.test(s)) return 'LWP';
  if (/casual|\bcl\b/.test(s)) return 'CL';
  if (/sick|medical|\bsl\b/.test(s)) return 'SL';
  if (/privilege|annual|earned|\bpl\b|\bel\b/.test(s)) return 'PL';
  return 'OTHER'; // maternity / paternity / comp-off etc. — paid, no balance
}

const FIELDS = {
  CL: { bal: 'clBalance', used: 'clUsed', rate: 'clPerMonth', label: 'Casual' },
  PL: { bal: 'plBalance', used: 'plUsed', rate: 'plPerMonth', label: 'Privilege' },
  SL: { bal: 'slBalance', used: 'slUsed', rate: 'slPerMonth', label: 'Sick' },
};

async function getOrCreateConfig(companyId, year = DEFAULT_YEAR) {
  const cid = Number(companyId);
  let cfg = await prisma.leaveCreditConfig.findUnique({ where: { companyId_year: { companyId: cid, year } } });
  if (!cfg) {
    cfg = await prisma.leaveCreditConfig.create({ data: { companyId: cid, year } });
  }
  return cfg;
}

async function getOrCreateBalance(employeeId, year = DEFAULT_YEAR) {
  const eid = Number(employeeId);
  let bal = await prisma.leaveBalance.findUnique({ where: { employeeId_year: { employeeId: eid, year } } });
  if (!bal) {
    const emp = await prisma.employee.findUnique({ where: { id: eid }, select: { companyId: true } });
    bal = await prisma.leaveBalance.create({ data: { employeeId: eid, companyId: emp?.companyId || 1, year } });
  }
  return bal;
}

/**
 * Accrue an employee's wallet up to `throughMonth` (1-12). Idempotent: only
 * advances when throughMonth > accruedThroughMonth. Recomputes available balance
 * from accrued − used + carryForward so it stays correct even if used changed.
 */
async function accrue(employeeId, throughMonth, year = DEFAULT_YEAR) {
  const bal = await getOrCreateBalance(employeeId, year);
  const cfg = await getOrCreateConfig(bal.companyId, year);
  const months = Math.max(0, Math.min(12, Number(throughMonth) || 0));
  const data = {
    clBalance: round(cfg.clPerMonth * months + bal.carryForward - bal.clUsed),
    plBalance: round(cfg.plPerMonth * months + bal.carryForward - bal.plUsed),
    slBalance: round(cfg.slPerMonth * months + bal.carryForward - bal.slUsed),
    accruedThroughMonth: months,
  };
  return prisma.leaveBalance.update({ where: { id: bal.id }, data });
}

/**
 * Validate a leave request against the wallet WITHOUT mutating it.
 * Returns { ok, category, available, paidDays, lwpDays, message }.
 */
async function validate(employeeId, leaveType, days, year = DEFAULT_YEAR) {
  const cat = categoryOf(leaveType);
  const d = Number(days) || 0;
  if (cat === 'LWP') return { ok: true, category: cat, available: 0, paidDays: 0, lwpDays: d, message: '' };
  if (cat === 'OTHER') return { ok: true, category: cat, available: 0, paidDays: d, lwpDays: 0, message: '' };

  const bal = await getOrCreateBalance(employeeId, year);
  const f = FIELDS[cat];
  const available = round(bal[f.bal]);
  if (d <= available) {
    return { ok: true, category: cat, available, paidDays: d, lwpDays: 0, message: '' };
  }
  return {
    ok: false,
    category: cat,
    available,
    paidDays: available,
    lwpDays: round(d - available),
    message: `Insufficient ${f.label} Leave Balance (available ${available}, requested ${d})`,
  };
}

/**
 * Deduct an APPROVED leave from the wallet. Paid portion = min(days, available);
 * any excess becomes LWP. Returns { paidDays, lwpDays }.
 */
async function deduct(employeeId, leaveType, days, year = DEFAULT_YEAR) {
  const cat = categoryOf(leaveType);
  const d = Number(days) || 0;
  if (cat === 'LWP') return { paidDays: 0, lwpDays: d };
  if (cat === 'OTHER') return { paidDays: d, lwpDays: 0 };

  const bal = await getOrCreateBalance(employeeId, year);
  const f = FIELDS[cat];
  const available = round(bal[f.bal]);
  const paid = round(Math.min(d, Math.max(0, available)));
  const lwp = round(d - paid);
  await prisma.leaveBalance.update({
    where: { id: bal.id },
    data: { [f.bal]: round(available - paid), [f.used]: round(bal[f.used] + paid) },
  });
  return { paidDays: paid, lwpDays: lwp };
}

// Reverse a prior deduction (e.g. an approved leave is rejected/cancelled).
async function restore(employeeId, leaveType, paidDays, year = DEFAULT_YEAR) {
  const cat = categoryOf(leaveType);
  if (cat === 'LWP' || cat === 'OTHER') return;
  const p = Number(paidDays) || 0;
  if (p <= 0) return;
  const bal = await getOrCreateBalance(employeeId, year);
  const f = FIELDS[cat];
  await prisma.leaveBalance.update({
    where: { id: bal.id },
    data: { [f.bal]: round(bal[f.bal] + p), [f.used]: round(Math.max(0, bal[f.used] - p)) },
  });
}

function round(n) { return Math.round((Number(n) || 0) * 100) / 100; }

module.exports = { categoryOf, getOrCreateConfig, getOrCreateBalance, accrue, validate, deduct, restore, FIELDS, DEFAULT_YEAR };
