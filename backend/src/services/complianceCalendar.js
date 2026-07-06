// ── Compliance filing calendar engine ───────────────────────────────────────
// Generates the recurring statutory FILING obligations (PF/ESI/PT/GST/TDS/LWF)
// with their due dates, and derives the statutory liability AMOUNT for a period
// from the persisted payroll rows (read-only — payroll math is untouched).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const r0 = (n) => Math.round(Number(n) || 0);
const pad2 = (n) => String(n).padStart(2, '0');
const monthFullName = (m) => MONTHS_FULL[m - 1];

// Recurring statutory obligations (India). dueDay/dueMonthOffset → the filing is
// due `dueDay` of the month `dueMonthOffset` after the liability month.
const DEFAULT_OBLIGATIONS = [
  { category: 'PF', title: 'EPF ECR & Payment', frequency: 'Monthly', dueDay: 15, dueMonthOffset: 1 },
  { category: 'ESI', title: 'ESI Contribution', frequency: 'Monthly', dueDay: 15, dueMonthOffset: 1 },
  { category: 'PT', title: 'Professional Tax Return', frequency: 'Monthly', dueDay: 21, dueMonthOffset: 1 },
  { category: 'GST', title: 'GSTR-3B Return', frequency: 'Monthly', dueDay: 20, dueMonthOffset: 1 },
  { category: 'TDS', title: 'TDS Return (Form 24Q)', frequency: 'Quarterly' },
  { category: 'LWF', title: 'Labour Welfare Fund', frequency: 'Half-Yearly' },
];

// yyyy-MM-dd due date for a monthly obligation liable in (month,year).
function monthlyDue(month, year, dueDay, offset) {
  let m = month + offset, y = year;
  while (m > 12) { m -= 12; y += 1; }
  return `${y}-${pad2(m)}-${pad2(dueDay)}`;
}
// TDS quarter-end anchor months → return due date (Q1 Jun→Jul31, Q2 Sep→Oct31,
// Q3 Dec→Jan31 next yr, Q4 Mar→May31).
const TDS_DUE = { 6: (y) => `${y}-07-31`, 9: (y) => `${y}-10-31`, 12: (y) => `${y + 1}-01-31`, 3: (y) => `${y}-05-31` };
const TDS_QUARTER = { 6: 'Q1', 9: 'Q2', 12: 'Q3', 3: 'Q4' };
// LWF half-year anchors → Jun (Jan–Jun) due Jul 15, Dec (Jul–Dec) due Jan 15.
const LWF_DUE = { 6: (y) => `${y}-07-15`, 12: (y) => `${y + 1}-01-15` };

// Statutory liability for a period, derived from stored payroll rows.
async function statutoryAmountFor(prisma, company, category, month, year) {
  const cid = Number(company.id);
  const pfRate = company.pfRate || 12, esicRate = company.esicRate || 0.75, profTax = company.profTaxRate || 200;
  if (category === 'TDS') {
    // Quarter = the 3 months ending at `month`.
    const months = [month - 2, month - 1, month].map((m) => (m < 1 ? m + 12 : m)).map(monthFullName);
    const rows = await prisma.payroll.findMany({ where: { companyId: cid, year, month: { in: months } }, select: { tax: true } });
    return r0(rows.reduce((s, p) => s + (p.tax || 0), 0));
  }
  const rows = await prisma.payroll.findMany({ where: { companyId: cid, month: monthFullName(month), year }, select: { basicSalary: true } });
  if (!rows.length) return 0;
  if (category === 'PF') return r0(rows.reduce((s, p) => s + r0(p.basicSalary * pfRate / 100), 0));
  if (category === 'ESI') return r0(rows.reduce((s, p) => s + r0(p.basicSalary * esicRate / 100), 0));
  if (category === 'PT') return r0(rows.length * profTax);
  return 0; // GST / LWF have no payroll basis — entered manually
}

// Build the obligation rows that SHOULD exist for a liability month/year.
function obligationsForMonth(month, year) {
  const out = [];
  for (const o of DEFAULT_OBLIGATIONS) {
    if (o.frequency === 'Monthly') {
      out.push({ category: o.category, title: o.title, frequency: o.frequency, periodMonth: month, periodYear: year,
        periodLabel: `${MONTHS[month - 1]} ${year}`, dueDate: monthlyDue(month, year, o.dueDay, o.dueMonthOffset) });
    } else if (o.category === 'TDS' && TDS_DUE[month]) {
      out.push({ category: 'TDS', title: o.title, frequency: 'Quarterly', periodMonth: month, periodYear: year,
        periodLabel: `${TDS_QUARTER[month]} FY${year}`, dueDate: TDS_DUE[month](year) });
    } else if (o.category === 'LWF' && LWF_DUE[month]) {
      out.push({ category: 'LWF', title: o.title, frequency: 'Half-Yearly', periodMonth: month, periodYear: year,
        periodLabel: `${month === 6 ? 'H1' : 'H2'} ${year}`, dueDate: LWF_DUE[month](year) });
    }
  }
  return out;
}

/**
 * Idempotently ensure the filing calendar exists for a window of months around
 * now. Creates missing rows (with derived amounts), never touches existing ones,
 * and flips past-due Pending rows to Overdue. Safe to call on every dashboard load.
 */
async function generateCalendar(prisma, company, { monthsBack = 3, monthsAhead = 2, actor } = {}) {
  const cid = Number(company.id);
  const now = new Date();
  let created = 0;
  for (let off = -monthsBack; off <= monthsAhead; off++) {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const month = d.getMonth() + 1, year = d.getFullYear();
    for (const ob of obligationsForMonth(month, year)) {
      const exists = await prisma.complianceFiling.findFirst({ where: { companyId: cid, category: ob.category, periodMonth: ob.periodMonth, periodYear: ob.periodYear }, select: { id: true } });
      if (exists) continue;
      const amount = await statutoryAmountFor(prisma, company, ob.category, ob.periodMonth, ob.periodYear).catch(() => 0);
      await prisma.complianceFiling.create({ data: { companyId: cid, ...ob, amount, autoGenerated: true, createdBy: actor || 'System', status: 'Pending' } });
      created++;
    }
  }
  // Flip overdue.
  const today = now.toISOString().slice(0, 10);
  await prisma.complianceFiling.updateMany({ where: { companyId: cid, status: 'Pending', dueDate: { lt: today } }, data: { status: 'Overdue' } });
  return { created };
}

module.exports = { DEFAULT_OBLIGATIONS, generateCalendar, statutoryAmountFor, obligationsForMonth, MONTHS, MONTHS_FULL, monthFullName };
