// Employee Loan Management — request lifecycle, approval workflow, EMI schedule
// (ledger), dashboard KPIs, employee portal, and reports. The actual payroll
// deduction lives in services/loanPayroll.js (auto-runs on payroll recompute).
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { computeLoan, buildSchedule, addMonths, MONTHS, monthIndex, r0 } = require('../services/loanCalc');
const { notifyLoanEvent } = require('../services/loanNotify');
const {
  canView, canEdit, canApprove, canManage, isEmployee, actorOf, targetCompanyId, scopedWhere,
} = require('../utils/loanScope');

const ACTIVE = ['Approved', 'Disbursed', 'Running'];

async function logAction(companyId, loanId, action, extra = {}) {
  try {
    await prisma.loanAudit.create({
      data: { companyId: Number(companyId), loanId: loanId ? Number(loanId) : null, action, ...extra },
    });
  } catch (_) { /* audit best-effort */ }
}

// Sequential per-company loan number: LN-YYYY-#### .
async function nextLoanNumber(companyId) {
  const year = new Date().getFullYear();
  const prefix = `LN-${year}-`;
  const last = await prisma.loan.findFirst({
    where: { companyId: Number(companyId), loanNumber: { startsWith: prefix } },
    orderBy: { loanNumber: 'desc' }, select: { loanNumber: true },
  });
  const seq = last ? (parseInt(last.loanNumber.slice(prefix.length), 10) || 0) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// Derived ledger figures for a loan given its installments.
function derive(loan, installments) {
  const paid = installments.filter((i) => i.status === 'Paid');
  const pending = installments.filter((i) => i.status !== 'Paid');
  const paidPrincipal = r0(paid.reduce((s, i) => s + (i.principalComponent || 0), 0));
  const paidTotal = r0(paid.reduce((s, i) => s + (i.paidAmount || i.emiAmount || 0), 0));
  const outstandingPayable = r0(pending.reduce((s, i) => s + (i.emiAmount || 0), 0));
  const outstandingPrincipal = r0((loan.principalAmount || 0) - paidPrincipal);
  const next = pending.sort((a, b) => a.seq - b.seq)[0] || null;
  const lastPaid = paid.sort((a, b) => b.seq - a.seq)[0] || null;
  return {
    installmentsPaid: paid.length,
    installmentsTotal: installments.length,
    installmentsRemaining: pending.length,
    paidPrincipal, paidTotal, outstandingPayable, outstandingPrincipal,
    nextDueMonth: next ? `${next.periodMonth} ${next.periodYear}` : null,
    nextDueDate: next?.dueDate || null,
    lastDeductionMonth: lastPaid ? `${lastPaid.periodMonth} ${lastPaid.periodYear}` : null,
  };
}

// ── EMI preview (no save) ────────────────────────────────────────────────────
exports.previewEmi = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const totals = computeLoan({
      principal: req.body.principalAmount, interestType: req.body.interestType,
      interestRate: req.body.interestRate, tenureMonths: req.body.tenureMonths,
    });
    const schedule = buildSchedule({
      principal: req.body.principalAmount, interestType: req.body.interestType,
      interestRate: req.body.interestRate, tenureMonths: req.body.tenureMonths,
      deductionStartMonth: req.body.deductionStartMonth || MONTHS[new Date().getMonth()],
      deductionStartYear: req.body.deductionStartYear || new Date().getFullYear(),
    });
    res.json({ ...totals, schedule });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Dashboard KPIs ───────────────────────────────────────────────────────────
exports.dashboard = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const where = scopedWhere(req);
    if (where === null) return res.status(403).json({ error: 'Unauthorised workspace.' });

    const loans = await prisma.loan.findMany({ where });
    const loanIds = loans.map((l) => l.id);
    const installments = loanIds.length
      ? await prisma.loanInstallment.findMany({ where: { loanId: { in: loanIds } } })
      : [];
    const byLoan = {};
    for (const i of installments) (byLoan[i.loanId] ||= []).push(i);

    const now = new Date();
    const curMonth = MONTHS[now.getMonth()];
    const curYear = now.getFullYear();
    const isPast = (m, y) => y < curYear || (y === curYear && monthIndex(m) < now.getMonth());

    let totalActive = 0, pending = 0, completed = 0, totalOutstanding = 0;
    let emiThisMonth = 0, overdue = 0, closingThisMonth = 0, totalDisbursed = 0;

    for (const l of loans) {
      const insts = byLoan[l.id] || [];
      const d = derive(l, insts);
      if (ACTIVE.includes(l.status)) { totalActive++; totalOutstanding += d.outstandingPayable; }
      if (l.status === 'Pending Approval') pending++;
      if (['Completed', 'Closed'].includes(l.status)) completed++;
      if (['Disbursed', 'Running', 'Completed', 'Closed'].includes(l.status)) totalDisbursed += l.principalAmount || 0;
      // EMI deducted this month = installments Paid for the current period.
      emiThisMonth += insts.filter((i) => i.status === 'Paid' && i.periodMonth === curMonth && i.periodYear === curYear)
        .reduce((s, i) => s + (i.paidAmount || i.emiAmount || 0), 0);
      // Overdue = active loan with a Pending installment in the past.
      if (ACTIVE.includes(l.status) && insts.some((i) => i.status !== 'Paid' && isPast(i.periodMonth, i.periodYear))) overdue++;
      // Closing this month = active loan whose LAST installment falls in this period.
      if (ACTIVE.includes(l.status) && insts.length) {
        const last = insts.reduce((a, b) => (a.seq > b.seq ? a : b));
        if (last.periodMonth === curMonth && last.periodYear === curYear) closingThisMonth++;
      }
    }
    res.json({
      kpis: {
        totalActiveLoans: totalActive,
        pendingApprovals: pending,
        completedLoans: completed,
        totalOutstanding: r0(totalOutstanding),
        emiThisMonth: r0(emiThisMonth),
        overdueLoans: overdue,
        closingThisMonth,
        totalDisbursed: r0(totalDisbursed),
        totalLoans: loans.length,
      },
      recent: loans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6)
        .map((l) => ({ id: l.id, loanNumber: l.loanNumber, employeeName: l.employeeName, loanTypeName: l.loanTypeName, principalAmount: l.principalAmount, emiAmount: l.emiAmount, status: l.status })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── List (filters + pagination) ──────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorised workspace.' });
    const where = { ...base };
    if (req.query.status) where.status = req.query.status;
    if (req.query.employeeId) where.employeeId = idParam(req.query.employeeId);
    if (req.query.loanTypeId) where.loanTypeId = idParam(req.query.loanTypeId);
    if (req.query.q) where.OR = [
      { employeeName: { contains: String(req.query.q) } },
      { loanNumber: { contains: String(req.query.q) } },
    ];
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 25));
    const [total, rows] = await Promise.all([
      prisma.loan.count({ where }),
      prisma.loan.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    // Attach derived ledger figures (recovered / remaining / next-due) so list
    // consumers (e.g. the Salary Advances table) don't need a call per row.
    const ids = rows.map((l) => l.id);
    const insts = ids.length ? await prisma.loanInstallment.findMany({ where: { loanId: { in: ids } } }) : [];
    const byLoan = {};
    for (const i of insts) (byLoan[i.loanId] ||= []).push(i);
    const loans = rows.map((l) => ({ ...l, derived: derive(l, byLoan[l.id] || []) }));
    res.json({ total, page, pageSize, loans });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Single loan (with schedule + audit + derived figures) ────────────────────
exports.get = async (req, res) => {
  try {
    if (!canView(req) && !isEmployee(req)) return res.status(403).json({ error: 'Not authorised.' });
    const id = idParam(req.params.id);
    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan) return res.status(404).json({ error: 'Loan not found.' });
    // Employees may only see their own loan.
    if (isEmployee(req) && !canView(req)) {
      const emp = await prisma.employee.findFirst({ where: { email: req.user?.email }, select: { id: true } }).catch(() => null);
      if (!emp || emp.id !== loan.employeeId) return res.status(403).json({ error: 'Not your loan.' });
    }
    const [installments, audit] = await Promise.all([
      prisma.loanInstallment.findMany({ where: { loanId: id }, orderBy: { seq: 'asc' } }),
      prisma.loanAudit.findMany({ where: { loanId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    res.json({ ...loan, installments, audit, derived: derive(loan, installments) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Employee portal — the caller's own loans ─────────────────────────────────
exports.myLoans = async (req, res) => {
  try {
    const emp = await prisma.employee.findFirst({ where: { email: req.user?.email }, select: { id: true, companyId: true } }).catch(() => null);
    if (!emp) return res.json({ loans: [] });
    const loans = await prisma.loan.findMany({ where: { employeeId: emp.id }, orderBy: { createdAt: 'desc' } });
    const ids = loans.map((l) => l.id);
    const installments = ids.length ? await prisma.loanInstallment.findMany({ where: { loanId: { in: ids } } }) : [];
    const byLoan = {};
    for (const i of installments) (byLoan[i.loanId] ||= []).push(i);
    res.json({ loans: loans.map((l) => ({ ...l, derived: derive(l, byLoan[l.id] || []), installments: (byLoan[l.id] || []).sort((a, b) => a.seq - b.seq) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Create loan request ──────────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised to create loans.' });
    const companyId = targetCompanyId(req, req.body.companyId);
    if (!companyId) return res.status(400).json({ error: 'Company context required.' });

    const employeeId = idParam(req.body.employeeId);
    if (!employeeId) return res.status(400).json({ error: 'Employee is required.' });
    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const principalAmount = Number(req.body.principalAmount) || 0;
    if (principalAmount <= 0) return res.status(400).json({ error: 'Loan amount must be greater than zero.' });
    const tenureMonths = Math.max(1, Math.round(Number(req.body.tenureMonths) || 1));

    // Enforce the loan type's configured limits (0 = unlimited).
    if (req.body.loanTypeId) {
      const lt = await prisma.loanType.findUnique({ where: { id: idParam(req.body.loanTypeId) } });
      if (lt) {
        if (lt.maxAmount && principalAmount > lt.maxAmount) return res.status(400).json({ error: `Amount exceeds the ${lt.name} limit of ₹${lt.maxAmount}.` });
        if (lt.maxTenureMonths && tenureMonths > lt.maxTenureMonths) return res.status(400).json({ error: `Tenure exceeds the ${lt.name} maximum of ${lt.maxTenureMonths} month(s).` });
      }
    }
    const interestType = req.body.interestType || 'Flat';
    const interestRate = Math.max(0, Number(req.body.interestRate) || 0);
    const deductionStartMonth = req.body.deductionStartMonth || MONTHS[new Date().getMonth()];
    const deductionStartYear = Number(req.body.deductionStartYear) || new Date().getFullYear();

    const totals = computeLoan({ principal: principalAmount, interestType, interestRate, tenureMonths });
    const start = addMonths(deductionStartMonth, deductionStartYear, 0);
    const end = addMonths(deductionStartMonth, deductionStartYear, tenureMonths - 1);
    const loanNumber = await nextLoanNumber(companyId);
    const submit = req.body.submit === true || req.body.status === 'Pending Approval';

    const loan = await prisma.loan.create({
      data: {
        companyId, employeeId, employeeName: emp.name || 'Unknown',
        department: emp.department || null, branchId: emp.branchId || null,
        loanNumber,
        loanTypeId: req.body.loanTypeId ? idParam(req.body.loanTypeId) : null,
        loanTypeName: req.body.loanTypeName || 'Loan',
        principalAmount, interestType, interestRate,
        totalInterest: totals.totalInterest, totalPayable: totals.totalPayable,
        tenureMonths, emiAmount: totals.emiAmount,
        startDate: req.body.startDate || `${deductionStartYear}-${String(monthIndex(start.month) + 1).padStart(2, '0')}-01`,
        endDate: req.body.endDate || `${end.year}-${String(monthIndex(end.month) + 1).padStart(2, '0')}-28`,
        deductionStartMonth, deductionStartYear,
        approvalAuthority: req.body.approvalAuthority || null,
        purpose: req.body.purpose || null,
        remarks: req.body.remarks || null,
        attachments: req.body.attachments ? JSON.stringify(req.body.attachments).slice(0, 200000) : null,
        status: submit ? 'Pending Approval' : 'Draft',
        requestedBy: actorOf(req),
      },
    });
    await logAction(companyId, loan.id, submit ? 'SUBMITTED' : 'CREATED', { toStatus: loan.status, performedBy: actorOf(req), details: `${loan.loanTypeName} ₹${principalAmount} / ${tenureMonths}m` });
    if (submit) notifyLoanEvent({ companyId, employeeId, employeeName: emp.name, type: 'loan-request', title: 'Loan Pending Approval', message: `Loan ${loanNumber} (₹${principalAmount}) awaits approval.`, queueExternal: false });
    res.status(201).json(loan);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Duplicate loan number — retry.' });
    res.status(500).json({ error: e.message });
  }
};

// ── Update (Draft only) ──────────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised.' });
    const id = idParam(req.params.id);
    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan) return res.status(404).json({ error: 'Loan not found.' });
    if (!['Draft', 'Pending Approval'].includes(loan.status)) {
      return res.status(409).json({ error: `A ${loan.status} loan's terms can no longer be edited.` });
    }
    const b = req.body;
    const principalAmount = b.principalAmount !== undefined ? Number(b.principalAmount) : loan.principalAmount;
    const tenureMonths = b.tenureMonths !== undefined ? Math.max(1, Math.round(Number(b.tenureMonths))) : loan.tenureMonths;
    const interestType = b.interestType || loan.interestType;
    const interestRate = b.interestRate !== undefined ? Math.max(0, Number(b.interestRate)) : loan.interestRate;
    const deductionStartMonth = b.deductionStartMonth || loan.deductionStartMonth;
    const deductionStartYear = b.deductionStartYear !== undefined ? Number(b.deductionStartYear) : loan.deductionStartYear;
    if (principalAmount <= 0) return res.status(400).json({ error: 'Loan amount must be greater than zero.' });
    const totals = computeLoan({ principal: principalAmount, interestType, interestRate, tenureMonths });

    const data = {
      principalAmount, interestType, interestRate, tenureMonths,
      totalInterest: totals.totalInterest, totalPayable: totals.totalPayable, emiAmount: totals.emiAmount,
      deductionStartMonth, deductionStartYear,
    };
    for (const f of ['loanTypeName', 'approvalAuthority', 'purpose', 'remarks', 'startDate', 'endDate']) if (b[f] !== undefined) data[f] = b[f];
    if (b.loanTypeId !== undefined) data.loanTypeId = b.loanTypeId ? idParam(b.loanTypeId) : null;
    if (b.attachments !== undefined) data.attachments = b.attachments ? JSON.stringify(b.attachments).slice(0, 200000) : null;
    const updated = await prisma.loan.update({ where: { id }, data });
    await logAction(loan.companyId, id, 'UPDATED', { performedBy: actorOf(req) });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Duplicate ────────────────────────────────────────────────────────────────
// Clone an existing loan (any status) into a brand-new DRAFT the user can edit
// and re-submit. Terms are copied verbatim; only the workflow fields reset and a
// fresh loan number is issued. No installments/ledger are created (that happens
// on disbursement), so this never touches payroll.
exports.duplicate = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised to create loans.' });
    const id = idParam(req.params.id);
    const src = await prisma.loan.findUnique({ where: { id } });
    if (!src) return res.status(404).json({ error: 'Loan not found.' });
    // Company scope — only duplicate loans within the caller's own company.
    const companyId = targetCompanyId(req, src.companyId);
    if (!companyId || Number(companyId) !== src.companyId) return res.status(403).json({ error: 'Not authorised for this loan.' });

    const loanNumber = await nextLoanNumber(src.companyId);
    const copy = await prisma.loan.create({
      data: {
        companyId: src.companyId, branchId: src.branchId, employeeId: src.employeeId, employeeName: src.employeeName,
        department: src.department, loanNumber,
        loanTypeId: src.loanTypeId, loanTypeName: src.loanTypeName,
        principalAmount: src.principalAmount, interestType: src.interestType, interestRate: src.interestRate,
        totalInterest: src.totalInterest, totalPayable: src.totalPayable, tenureMonths: src.tenureMonths, emiAmount: src.emiAmount,
        startDate: src.startDate, endDate: src.endDate,
        deductionStartMonth: src.deductionStartMonth, deductionStartYear: src.deductionStartYear,
        approvalAuthority: src.approvalAuthority, purpose: src.purpose, remarks: src.remarks, attachments: src.attachments,
        status: 'Draft', requestedBy: actorOf(req),
      },
    });
    await logAction(src.companyId, copy.id, 'DUPLICATED', { toStatus: 'Draft', performedBy: actorOf(req), details: `Copied from ${src.loanNumber}` });
    res.status(201).json(copy);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Duplicate loan number — retry.' });
    res.status(500).json({ error: e.message });
  }
};

// ── Workflow transitions ─────────────────────────────────────────────────────
// action: submit | approve | reject | disburse | close
exports.setStatus = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    const action = String(req.body.action || '').toLowerCase();
    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan) return res.status(404).json({ error: 'Loan not found.' });

    const guard = (ok) => { if (!ok) { const e = new Error('Not authorised for this action.'); e.code = 403; throw e; } };
    let next, needSchedule = false;
    switch (action) {
      case 'submit':
        guard(canEdit(req));
        if (loan.status !== 'Draft') return res.status(409).json({ error: 'Only a Draft can be submitted.' });
        next = 'Pending Approval'; break;
      case 'approve':
        guard(canApprove(req));
        if (loan.status !== 'Pending Approval') return res.status(409).json({ error: 'Only a Pending loan can be approved.' });
        next = 'Approved'; needSchedule = true; break;
      case 'reject':
        guard(canApprove(req));
        if (loan.status !== 'Pending Approval') return res.status(409).json({ error: 'Only a Pending loan can be rejected.' });
        next = 'Rejected'; break;
      case 'disburse':
        guard(canApprove(req) || canEdit(req));
        if (loan.status !== 'Approved') return res.status(409).json({ error: 'Only an Approved loan can be disbursed.' });
        next = 'Disbursed'; break;
      case 'close':
        guard(canManage(req));
        if (['Completed', 'Closed', 'Rejected'].includes(loan.status)) return res.status(409).json({ error: 'Loan is already closed.' });
        next = 'Closed'; break;
      default:
        return res.status(400).json({ error: 'Unknown action.' });
    }

    // On approval, generate the installment schedule (the ledger).
    if (needSchedule) {
      const existing = await prisma.loanInstallment.count({ where: { loanId: id } });
      if (existing === 0) {
        const schedule = buildSchedule({
          principal: loan.principalAmount, interestType: loan.interestType, interestRate: loan.interestRate,
          tenureMonths: loan.tenureMonths, deductionStartMonth: loan.deductionStartMonth, deductionStartYear: loan.deductionStartYear,
        });
        await prisma.loanInstallment.createMany({
          data: schedule.map((s) => ({ ...s, companyId: loan.companyId, loanId: id })),
          skipDuplicates: true,
        });
      }
    }

    const data = { status: next };
    if (action === 'approve') { data.approvedBy = actorOf(req); data.approvedAt = new Date(); }
    if (action === 'reject') data.rejectionReason = req.body.reason || 'Not specified';
    if (action === 'disburse') data.disbursedDate = req.body.disbursedDate || new Date().toISOString().slice(0, 10);
    if (action === 'close') data.closedAt = new Date();
    const updated = await prisma.loan.update({ where: { id }, data });

    await logAction(loan.companyId, id, action.toUpperCase(), { fromStatus: loan.status, toStatus: next, performedBy: actorOf(req), details: req.body.reason || null });

    // Notifications
    const notifyMap = {
      approve: ['loan-approved', 'Loan Approved', `Loan ${loan.loanNumber} (₹${loan.principalAmount}) approved. EMI ₹${loan.emiAmount} × ${loan.tenureMonths}m.`],
      reject: ['loan-rejected', 'Loan Rejected', `Loan ${loan.loanNumber} was rejected. ${data.rejectionReason || ''}`.trim()],
      disburse: ['loan-disbursed', 'Loan Disbursed', `Loan ${loan.loanNumber} disbursed. EMI deduction starts ${loan.deductionStartMonth} ${loan.deductionStartYear}.`],
      close: ['loan-closed', 'Loan Closed', `Loan ${loan.loanNumber} was closed.`],
    };
    if (notifyMap[action]) {
      const [type, title, message] = notifyMap[action];
      notifyLoanEvent({ companyId: loan.companyId, employeeId: loan.employeeId, employeeName: loan.employeeName, type, title, message });
    }
    res.json(updated);
  } catch (e) {
    if (e.code === 403) return res.status(403).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
};

// ── Delete (Draft / Rejected only) ───────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Not authorised to delete loans.' });
    const id = idParam(req.params.id);
    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan) return res.status(404).json({ error: 'Loan not found.' });
    if (!['Draft', 'Rejected'].includes(loan.status)) {
      return res.status(409).json({ error: `A ${loan.status} loan can't be deleted (it has a financial ledger). Close it instead.` });
    }
    await prisma.loanInstallment.deleteMany({ where: { loanId: id } });
    await prisma.loan.delete({ where: { id } });
    await logAction(loan.companyId, null, 'DELETED', { performedBy: actorOf(req), details: loan.loanNumber });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Run EMI reminders now (manual trigger of the scheduler's loan pass) ──────
exports.runReminders = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised.' });
    const out = await require('../services/reminderScheduler').runLoanReminders();
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Reports ──────────────────────────────────────────────────────────────────
// key: ledger | outstanding | monthly | summary | completed | history | interest
exports.report = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const where = scopedWhere(req);
    if (where === null) return res.status(403).json({ error: 'Unauthorised workspace.' });
    const key = String(req.params.key || 'summary');
    const loans = await prisma.loan.findMany({ where, orderBy: { createdAt: 'desc' } });
    const ids = loans.map((l) => l.id);
    const installments = ids.length ? await prisma.loanInstallment.findMany({ where: { loanId: { in: ids } } }) : [];
    const byLoan = {};
    for (const i of installments) (byLoan[i.loanId] ||= []).push(i);

    const rowsFor = (l) => ({ l, d: derive(l, byLoan[l.id] || []) });
    let columns = [], rows = [], summary = {};

    if (key === 'ledger') {
      columns = ['Loan #', 'Employee', 'Type', 'Seq', 'Period', 'EMI', 'Principal', 'Interest', 'Status', 'Balance'];
      for (const l of loans) for (const i of (byLoan[l.id] || []).sort((a, b) => a.seq - b.seq)) {
        rows.push([l.loanNumber, l.employeeName, l.loanTypeName, i.seq, `${i.periodMonth} ${i.periodYear}`, i.emiAmount, i.principalComponent, i.interestComponent, i.status, i.closingBalance]);
      }
    } else if (key === 'outstanding') {
      columns = ['Loan #', 'Employee', 'Type', 'Principal', 'EMI', 'Paid', 'Outstanding', 'Remaining EMIs', 'Status'];
      for (const l of loans.filter((x) => ACTIVE.includes(x.status))) { const { d } = rowsFor(l); rows.push([l.loanNumber, l.employeeName, l.loanTypeName, l.principalAmount, l.emiAmount, d.paidTotal, d.outstandingPayable, d.installmentsRemaining, l.status]); }
      summary.totalOutstanding = r0(rows.reduce((s, r) => s + (r[6] || 0), 0));
    } else if (key === 'monthly') {
      const m = req.query.month || MONTHS[new Date().getMonth()];
      const y = Number(req.query.year) || new Date().getFullYear();
      columns = ['Loan #', 'Employee', 'Type', 'Period', 'EMI Deducted', 'Status'];
      for (const l of loans) for (const i of (byLoan[l.id] || [])) if (i.periodMonth === m && i.periodYear === y) rows.push([l.loanNumber, l.employeeName, l.loanTypeName, `${m} ${y}`, i.status === 'Paid' ? (i.paidAmount || i.emiAmount) : 0, i.status]);
      summary.totalDeducted = r0(rows.reduce((s, r) => s + (r[4] || 0), 0));
      summary.period = `${m} ${y}`;
    } else if (key === 'completed') {
      columns = ['Loan #', 'Employee', 'Type', 'Principal', 'Total Paid', 'Closed On'];
      for (const l of loans.filter((x) => ['Completed', 'Closed'].includes(x.status))) { const { d } = rowsFor(l); rows.push([l.loanNumber, l.employeeName, l.loanTypeName, l.principalAmount, d.paidTotal, l.closedAt ? new Date(l.closedAt).toISOString().slice(0, 10) : '—']); }
    } else if (key === 'interest') {
      columns = ['Loan #', 'Employee', 'Type', 'Interest Type', 'Rate %', 'Principal', 'Total Interest', 'Total Payable'];
      for (const l of loans) rows.push([l.loanNumber, l.employeeName, l.loanTypeName, l.interestType, l.interestRate, l.principalAmount, l.totalInterest, l.totalPayable]);
      summary.totalInterest = r0(loans.reduce((s, l) => s + (l.totalInterest || 0), 0));
    } else { // summary / history
      columns = ['Loan #', 'Employee', 'Department', 'Type', 'Principal', 'EMI', 'Tenure', 'Paid', 'Outstanding', 'Status'];
      for (const l of loans) { const { d } = rowsFor(l); rows.push([l.loanNumber, l.employeeName, l.department || '—', l.loanTypeName, l.principalAmount, l.emiAmount, l.tenureMonths, d.installmentsPaid, d.outstandingPayable, l.status]); }
      summary.totalPrincipal = r0(loans.reduce((s, l) => s + (l.principalAmount || 0), 0));
      summary.count = loans.length;
    }
    res.json({ key, columns, rows, summary, generatedAt: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
