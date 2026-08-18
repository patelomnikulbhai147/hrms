// ── Payroll Wallet Gate ───────────────────────────────────────────────────────
// The ONE wallet gate every payroll-generation entry point must pass through
// (payroll.generate, attendance.pushToPayroll, payroll.create). The wallet
// charges the per-employee platform fee from PricingService (25/20/15 per
// active employee) — it does NOT cover the salary amount itself.
//
// Charging model (delta billing): an employee is billed ONCE per company +
// payroll period. "Already billed" means a payroll_employee_billing ledger row
// exists, OR a payroll row already exists for the period (grandfathers all
// history and makes every re-sync/recalc/replace free), OR the period was
// charged in full under the legacy one-lump model (`PR-…` reference). Only
// genuinely NEW employees are charged — editing, saving, recalculating or
// re-pushing attendance/payroll never charges again, and a required amount of
// ₹0 is a VALID state that must not block generation (even on a ₹0 wallet).
//
// Race safety: ledger inserts use the (companyId, employeeId, month, year)
// unique key with skipDuplicates, and the deduction is a conditional atomic
// decrement (`WHERE balance >= amount`) in the same transaction — concurrent
// pushes can never double-bill an employee or overdraw the balance. The DB is
// the sole authority; nothing client-sent is trusted.
//
// Workspace ids: Company.id and Branch.id share ONE sequence and callers
// routinely hold a BRANCH id — the resolver checks both tables and always
// lands on the parent company that owns the wallet.
const prisma = require('../config/prisma');
const PricingService = require('./pricingService');

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

// Legacy one-lump-per-period reference (still recognised so already-paid
// periods stay covered) vs the reference written by delta charges. They MUST
// differ: a delta charge must never be mistaken for "whole period paid".
const chargeReference = (month, year, companyId) => `PR-${month}-${year}-C${companyId}`;
const deltaChargeReference = (month, year, companyId) => `PRB-${month}-${year}-C${companyId}`;

async function resolveWalletCompanyId(companyId) {
  const id = Number(companyId);
  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, parentCompanyId: true },
  });
  if (company) return company.parentCompanyId || company.id;

  // Not a company — Company.id and Branch.id share one sequence, so this is
  // routinely a branch workspace id. Resolve branch → owning company → parent.
  const branch = await prisma.branch.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (branch) {
    const owner = await prisma.company.findUnique({
      where: { id: branch.companyId },
      select: { id: true, parentCompanyId: true },
    });
    if (owner) return owner.parentCompanyId || owner.id;
  }

  const err = new Error(`Workspace ${companyId} does not resolve to a company for the wallet check`);
  err.code = 'WALLET_CHECK_FAILED';
  throw err;
}

/** Active employee ids across the wallet company's group (parent + children). */
async function activeEmployeeIdsForGroup(walletCompanyId) {
  const group = await prisma.company.findMany({
    where: { OR: [{ id: walletCompanyId }, { parentCompanyId: walletCompanyId }] },
    select: { id: true },
  });
  const employees = await prisma.employee.findMany({
    where: {
      companyId: { in: group.map((c) => c.id) },
      status: 'Active',
      OR: [{ exitDate: null }, { exitDate: { gte: new Date() } }],
    },
    select: { id: true },
  });
  return employees.map((e) => e.id);
}

/**
 * Read-only pre-flight: which of the target employees still need billing for
 * this period, and whether the balance covers ONLY them. `employeeIds` is the
 * exact set the operation covers (pushed roster / generation scope / single
 * row); omitted, it defaults to every active employee in the company group
 * (company-wide estimate for the UI). `requiredNow` is 0 — a VALID, passing
 * state — when every target is already billed.
 */
async function assessPayrollWallet(companyId, month, year, opts = {}) {
  const walletCompanyId = await resolveWalletCompanyId(companyId);

  let wallet = await prisma.wallet.findUnique({ where: { companyId: walletCompanyId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: { companyId: walletCompanyId, balance: 0.0, status: 'Active' },
    });
  }

  const targetIds = [...new Set(
    (Array.isArray(opts.employeeIds) && opts.employeeIds.length
      ? opts.employeeIds.map(Number).filter(Number.isFinite)
      : await activeEmployeeIdsForGroup(walletCompanyId)),
  )];

  const estimate = await PricingService.estimatePayrollCost(walletCompanyId);
  const costPerEmployee = round2(Math.max(0, estimate.costPerEmployee));
  const reference = deltaChargeReference(month, year, walletCompanyId);

  // Legacy one-lump charge → the whole period's platform fee was already
  // collected; nobody in it is billed again. (Delta charges use PRB- refs.)
  const legacyPeriodCharged = !!(await prisma.walletTransaction.findFirst({
    where: {
      walletId: wallet.id,
      type: 'Payroll',
      referenceNumber: chargeReference(month, year, walletCompanyId),
    },
    select: { id: true },
  }));

  let newEmployeeIds = [];
  if (!legacyPeriodCharged && targetIds.length) {
    const [ledgerRows, payrollRows] = await Promise.all([
      prisma.payrollEmployeeBilling.findMany({
        where: { companyId: walletCompanyId, month, year, employeeId: { in: targetIds } },
        select: { employeeId: true },
      }),
      // An existing payroll row = the employee already went through generation
      // for this period (grandfathers everything created before the ledger).
      prisma.payroll.findMany({
        where: { month, year, employeeId: { in: targetIds } },
        select: { employeeId: true },
      }),
    ]);
    const billed = new Set([
      ...ledgerRows.map((r) => r.employeeId),
      ...payrollRows.map((r) => r.employeeId),
    ]);
    newEmployeeIds = targetIds.filter((id) => !billed.has(id));
  }

  const requiredNow = round2(newEmployeeIds.length * costPerEmployee);

  return {
    ok: requiredNow <= 0 || wallet.balance >= requiredNow,
    balance: wallet.balance,
    required: requiredNow,
    requiredNow,
    shortfall: round2(Math.max(0, requiredNow - wallet.balance)),
    totalEmployees: targetIds.length,
    alreadyBilled: targetIds.length - newEmployeeIds.length,
    newEmployees: newEmployeeIds.length,
    newEmployeeIds,
    costPerEmployee,
    walletRequired: requiredNow > 0,
    alreadyCharged: legacyPeriodCharged || (targetIds.length > 0 && newEmployeeIds.length === 0),
    reference,
    walletId: wallet.id,
    walletCompanyId,
    estimate,
  };
}

/** The standard 402 body — same shape from every entry point. */
function insufficientPayload(a) {
  const n = a ? a.newEmployees : undefined;
  return {
    success: false,
    error: n
      ? `Insufficient wallet balance for the ${n} newly added employee(s). Existing employees are not billed again.`
      : 'Insufficient wallet balance to generate payroll.',
    code: 'INSUFFICIENT_WALLET_BALANCE',
    walletBalance: a ? a.balance : undefined,
    requiredAmount: a ? a.requiredNow : undefined,
    shortfall: a ? a.shortfall : undefined,
    totalEmployees: a ? a.totalEmployees : undefined,
    alreadyBilled: a ? a.alreadyBilled : undefined,
    newEmployees: n,
    billableEmployees: n,
    chargeAmount: a ? a.requiredNow : undefined,
    costPerEmployee: a ? a.costPerEmployee : undefined,
    activeEmployees: a?.estimate?.activeEmployees,
  };
}

/**
 * Validate AND charge in one call. Charges ONLY the target employees not yet
 * billed for the period; `{ charged:false }` (a passing state) when there is
 * nothing to bill. Throws `INSUFFICIENT_WALLET_BALANCE` (with `.assessment`)
 * when the balance cannot cover the NEW employees; any other failure
 * propagates so callers can fail CLOSED (block generation).
 */
async function chargePayrollWallet({ companyId, month, year, employeeIds, createdBy }) {
  const a = await assessPayrollWallet(companyId, month, year, { employeeIds });

  // ZERO billable is a valid, allowed state — never a wallet failure.
  if (a.newEmployees === 0 || a.requiredNow <= 0) {
    return { charged: false, billedEmployees: 0, amount: 0, assessment: a };
  }
  if (!a.ok) {
    const err = new Error(
      `Insufficient wallet balance for the ${a.newEmployees} newly added employee(s).`,
    );
    err.code = 'INSUFFICIENT_WALLET_BALANCE';
    err.assessment = a;
    throw err;
  }

  const result = await prisma.$transaction(async (tx) => {
    // The unique key makes this the idempotency point: a concurrent charge
    // that already billed some of these employees is silently skipped, and the
    // wallet is debited only for the rows THIS transaction actually inserted.
    const inserted = await tx.payrollEmployeeBilling.createMany({
      data: a.newEmployeeIds.map((employeeId) => ({
        companyId: a.walletCompanyId,
        employeeId,
        month,
        year,
        amount: a.costPerEmployee,
        reference: a.reference,
        createdBy: createdBy || 'System',
      })),
      skipDuplicates: true,
    });
    if (inserted.count === 0) return { charged: false, billedEmployees: 0, amount: 0 };

    const amount = round2(inserted.count * a.costPerEmployee);
    const updated = await tx.wallet.updateMany({
      where: { id: a.walletId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (updated.count !== 1) {
      const err = new Error(
        `Insufficient wallet balance for the ${inserted.count} newly added employee(s).`,
      );
      err.code = 'INSUFFICIENT_WALLET_BALANCE';
      err.assessment = a;
      throw err; // rolls the ledger rows back with it
    }

    const after = await tx.wallet.findUnique({
      where: { id: a.walletId },
      select: { balance: true },
    });
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: a.walletId,
        type: 'Payroll',
        amount: -amount,
        balanceBefore: round2(after.balance + amount),
        balanceAfter: after.balance,
        referenceNumber: a.reference,
        createdBy: createdBy || 'System',
      },
    });
    return { charged: true, billedEmployees: inserted.count, amount, transaction, balanceAfter: after.balance };
  });

  return { ...result, assessment: a };
}

module.exports = {
  assessPayrollWallet,
  chargePayrollWallet,
  insufficientPayload,
  chargeReference,
  deltaChargeReference,
};
