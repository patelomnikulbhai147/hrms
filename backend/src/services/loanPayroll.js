// ── Loan ⇄ Payroll integration (the automatic-deduction spine) ───────────────
// When a payroll row is (re)computed, an Approved/Disbursed/Running loan's EMI
// for that month is folded into the row's deductions, the matching installment
// is settled in the ledger, the loan status advances (Running/Completed), and a
// notification fires. Everything is IDEMPOTENT: `applyLoanToPayrollRow` strips
// any prior loan portion before re-adding, and installments are keyed by the
// settling payrollId, so repeated recalcs of the same month never double-deduct.
const { r0 } = require('./loanCalc');
const { notifyLoanEvent } = require('./loanNotify');

const ACTIVE_STATUSES = ['Approved', 'Disbursed', 'Running'];
const AUTO_MANAGED = ['Approved', 'Disbursed', 'Running', 'Completed']; // reversible auto states

/**
 * The EMI to deduct for this employee's payroll period + the installment rows to
 * settle. Includes installments already settled by THIS payroll so a recompute of
 * the same month yields the same amount (idempotent).
 */
async function getLoanEmiForPayroll(prisma, companyId, employeeId, month, year, payrollId) {
  const loans = await prisma.loan.findMany({
    where: { companyId: Number(companyId), employeeId: Number(employeeId), status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  if (!loans.length) return { total: 0, items: [] };
  const loanIds = loans.map((l) => l.id);
  const or = [{ status: 'Pending' }];
  if (payrollId) or.push({ paidByPayrollId: Number(payrollId) });
  const insts = await prisma.loanInstallment.findMany({
    where: { loanId: { in: loanIds }, periodMonth: String(month), periodYear: Number(year), OR: or },
    select: { id: true, loanId: true, emiAmount: true },
  });
  const items = insts.map((i) => ({ loanId: i.loanId, installmentId: i.id, amount: r0(i.emiAmount) }));
  return { total: r0(items.reduce((s, i) => s + i.amount, 0)), items };
}

/**
 * Idempotently apply loan EMI to a PERSISTED payroll row. Re-derives the row's
 * deductions/loanDeduction/netSalary (stripping any prior loan portion first) and
 * settles the matching installments. Safe to call repeatedly. Returns the updated
 * payroll row (or the original if there was nothing to change).
 */
async function applyLoanToPayrollRow(prisma, payroll, actor) {
  if (!payroll || !payroll.id) return payroll;
  const loan = await getLoanEmiForPayroll(
    prisma, payroll.companyId, payroll.employeeId, payroll.month, payroll.year, payroll.id
  );
  const priorLoan = Number(payroll.loanDeduction) || 0;
  if (loan.total === 0 && priorLoan === 0) return payroll; // nothing to do — hot path exit

  const baseDeductions = (Number(payroll.deductions) || 0) - priorLoan; // strip old loan portion
  const deductions = r0(baseDeductions + loan.total);
  const gross = (Number(payroll.basicSalary) || 0) + (Number(payroll.allowances) || 0) + (Number(payroll.bonus) || 0);
  const netSalary = Math.max(0, r0(gross - deductions));

  const updated = await prisma.payroll.update({
    where: { id: payroll.id },
    data: { deductions, loanDeduction: loan.total, netSalary },
  });
  await settleLoanInstallments(prisma, loan.items, payroll.id, actor);
  return updated;
}

/** Mark the given installments Paid against a payroll, then refresh loan status. */
async function settleLoanInstallments(prisma, items, payrollId, actor) {
  if (!items || !items.length || !payrollId) return { settled: 0 };
  const now = new Date();
  const loanIds = new Set();
  let settled = 0;
  for (const it of items) {
    const res = await prisma.loanInstallment.updateMany({
      where: { id: Number(it.installmentId), OR: [{ status: 'Pending' }, { paidByPayrollId: Number(payrollId) }] },
      data: { status: 'Paid', paidAmount: it.amount, paidDate: now, paidByPayrollId: Number(payrollId) },
    });
    if (res.count) { settled += it.amount; loanIds.add(it.loanId); }
  }
  for (const loanId of loanIds) await refreshLoanStatus(prisma, loanId, actor);
  return { settled: r0(settled) };
}

/** Recompute a loan's status from its installment ledger (both directions). */
async function refreshLoanStatus(prisma, loanId, actor) {
  const loan = await prisma.loan.findUnique({ where: { id: Number(loanId) } });
  if (!loan || !AUTO_MANAGED.includes(loan.status)) return;
  const insts = await prisma.loanInstallment.findMany({ where: { loanId: Number(loanId) }, select: { status: true } });
  const total = insts.length;
  const paid = insts.filter((i) => i.status === 'Paid').length;

  let next;
  if (total > 0 && paid >= total) next = 'Completed';
  else if (paid > 0) next = 'Running';
  else next = loan.disbursedDate ? 'Disbursed' : 'Approved'; // no EMIs paid (e.g. after un-settle)

  if (next === loan.status) return;
  await prisma.loan.update({
    where: { id: loan.id },
    data: { status: next, closedAt: next === 'Completed' ? new Date() : null },
  });
  await prisma.loanAudit.create({
    data: {
      companyId: loan.companyId, loanId: loan.id,
      action: next === 'Completed' ? 'COMPLETED' : 'EMI_DEDUCTED',
      fromStatus: loan.status, toStatus: next,
      performedBy: actor || 'Payroll Engine',
      details: `Auto via payroll — ${paid}/${total} EMIs paid.`,
    },
  }).catch(() => {});
  if (next === 'Completed') {
    notifyLoanEvent({
      companyId: loan.companyId, employeeId: loan.employeeId, employeeName: loan.employeeName,
      type: 'loan-completed', title: 'Loan Completed',
      message: `Loan ${loan.loanNumber} is fully repaid — all ${total} EMIs deducted.`,
    });
  }
}

/** Reverse a payroll's loan settlements (payroll deleted / regenerated). */
async function unsettleForPayroll(prisma, payrollId) {
  try {
    const insts = await prisma.loanInstallment.findMany({
      where: { paidByPayrollId: Number(payrollId) }, select: { loanId: true },
    });
    if (!insts.length) return;
    await prisma.loanInstallment.updateMany({
      where: { paidByPayrollId: Number(payrollId) },
      data: { status: 'Pending', paidAmount: 0, paidDate: null, paidByPayrollId: null },
    });
    const loanIds = [...new Set(insts.map((i) => i.loanId))];
    for (const id of loanIds) await refreshLoanStatus(prisma, id, 'Payroll Engine');
  } catch (e) {
    console.warn('unsettleForPayroll failed:', e.message);
  }
}

module.exports = {
  getLoanEmiForPayroll, applyLoanToPayrollRow, settleLoanInstallments,
  refreshLoanStatus, unsettleForPayroll, ACTIVE_STATUSES,
};
