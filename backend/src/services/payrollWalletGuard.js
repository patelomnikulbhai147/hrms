// ── Payroll Wallet Gate ───────────────────────────────────────────────────────
// The ONE wallet gate every payroll-generation entry point must pass through
// (payroll.generate, attendance.pushToPayroll, payroll.create). The wallet
// charges the per-employee platform fee from PricingService (25/20/15 per
// active employee) — it does NOT cover the salary amount itself.
//
// Charging model: ONE charge per company + payroll period (month/year),
// identified by referenceNumber `PR-<Month>-<Year>-C<companyId>`. Regenerating
// an already-charged period never double-charges. Branch workspaces charge the
// PARENT company's wallet (one wallet per company group).
//
// Race safety: the deduction is a conditional atomic decrement
// (`WHERE balance >= amount`) inside a transaction with an idempotency re-check,
// so two concurrent generate calls can never both pass on one balance, and the
// balance is re-validated at commit time — the pre-flight assessment is advisory
// only. The DB balance is the sole authority; nothing client-sent is trusted.
const prisma = require('../config/prisma');
const PricingService = require('./pricingService');

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

const chargeReference = (month, year, companyId) => `PR-${month}-${year}-C${companyId}`;

async function resolveWalletCompanyId(companyId) {
  const company = await prisma.company.findUnique({
    where: { id: Number(companyId) },
    select: { id: true, parentCompanyId: true },
  });
  if (!company) {
    const err = new Error(`Company ${companyId} not found for wallet check`);
    err.code = 'WALLET_CHECK_FAILED';
    throw err;
  }
  return company.parentCompanyId || company.id;
}

/**
 * Read-only pre-flight: current balance vs what THIS period still requires.
 * `requiredNow` is 0 when the period was already charged or pricing is ₹0.
 */
async function assessPayrollWallet(companyId, month, year) {
  const walletCompanyId = await resolveWalletCompanyId(companyId);

  let wallet = await prisma.wallet.findUnique({ where: { companyId: walletCompanyId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: { companyId: walletCompanyId, balance: 0.0, status: 'Active' },
    });
  }

  const estimate = await PricingService.estimatePayrollCost(walletCompanyId);
  const required = round2(Math.max(0, estimate.totalCost));
  const reference = chargeReference(month, year, walletCompanyId);

  const alreadyCharged = required > 0
    ? !!(await prisma.walletTransaction.findFirst({
        where: { walletId: wallet.id, type: 'Payroll', referenceNumber: reference },
        select: { id: true },
      }))
    : false;

  const requiredNow = alreadyCharged ? 0 : required;

  return {
    ok: requiredNow <= 0 || wallet.balance >= requiredNow,
    balance: wallet.balance,
    required,
    requiredNow,
    shortfall: round2(Math.max(0, requiredNow - wallet.balance)),
    alreadyCharged,
    reference,
    walletId: wallet.id,
    walletCompanyId,
    estimate,
  };
}

/** The standard 402 body — same shape from every entry point. */
function insufficientPayload(a) {
  return {
    success: false,
    error: 'Insufficient wallet balance to generate payroll.',
    code: 'INSUFFICIENT_WALLET_BALANCE',
    walletBalance: a ? a.balance : undefined,
    requiredAmount: a ? a.requiredNow : undefined,
    shortfall: a ? a.shortfall : undefined,
    activeEmployees: a?.estimate?.activeEmployees,
    costPerEmployee: a?.estimate?.costPerEmployee,
  };
}

/**
 * Validate AND charge in one call. Throws `INSUFFICIENT_WALLET_BALANCE` (with
 * `.assessment` attached) when the balance cannot cover the period fee; any
 * other failure propagates so callers can fail CLOSED (block generation).
 * Returns `{ charged:false }` when the period is already charged or free.
 */
async function chargePayrollWallet({ companyId, month, year, createdBy }) {
  const a = await assessPayrollWallet(companyId, month, year);

  if (a.alreadyCharged || a.requiredNow <= 0) {
    return { charged: false, assessment: a };
  }
  if (!a.ok) {
    const err = new Error('Insufficient wallet balance to generate payroll.');
    err.code = 'INSUFFICIENT_WALLET_BALANCE';
    err.assessment = a;
    throw err;
  }

  const result = await prisma.$transaction(async (tx) => {
    const dup = await tx.walletTransaction.findFirst({
      where: { walletId: a.walletId, type: 'Payroll', referenceNumber: a.reference },
      select: { id: true },
    });
    if (dup) return { charged: false };

    const updated = await tx.wallet.updateMany({
      where: { id: a.walletId, balance: { gte: a.requiredNow } },
      data: { balance: { decrement: a.requiredNow } },
    });
    if (updated.count !== 1) {
      const err = new Error('Insufficient wallet balance to generate payroll.');
      err.code = 'INSUFFICIENT_WALLET_BALANCE';
      throw err;
    }

    const after = await tx.wallet.findUnique({
      where: { id: a.walletId },
      select: { balance: true },
    });
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: a.walletId,
        type: 'Payroll',
        amount: -a.requiredNow,
        balanceBefore: round2(after.balance + a.requiredNow),
        balanceAfter: after.balance,
        referenceNumber: a.reference,
        createdBy: createdBy || 'System',
      },
    });
    return { charged: true, transaction, balanceAfter: after.balance };
  });

  if (result.charged === false) return { charged: false, assessment: a };
  return { ...result, assessment: a };
}

module.exports = { assessPayrollWallet, chargePayrollWallet, insufficientPayload, chargeReference };
