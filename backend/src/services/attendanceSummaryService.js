/**
 * Derive a per-employee monthly attendance summary from the raw daily Attendance
 * rows + approved LeaveRequests + Overtime. This is the source of truth that
 * payroll and salary slips read. Admins can override it via the edit endpoint.
 */
const prisma = require('../config/prisma');
const { categoryOf } = require('./leaveService');
const policyService = require('./deductionPolicyService');
// Offboarding cut-off: MIN(last day of month, Employee.exitDate). Single source
// of truth, shared with the payroll engine and the eligibility roster.
const { employmentWindow } = require('../utils/employmentWindow');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthIndex = (name) => Math.max(0, MONTHS.findIndex(m => m.toLowerCase() === String(name).toLowerCase()));

function bucketOf(status) {
  const s = String(status || '').toLowerCase();
  if (/work from home|wfh/.test(s)) return 'wfh';
  if (/half[\s-]?day/.test(s)) return 'half';
  if (/leave/.test(s)) return 'leave';
  if (/holiday/.test(s)) return 'holiday';
  if (/weekly off|week off/.test(s)) return 'weeklyOff';
  if (/present|on duty|wfo/.test(s)) return 'present';
  return 'absent';
}

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

/**
 * Compute (but do not persist) the summary figures for one employee/month/year.
 */
async function compute(employeeId, month, year) {
  const eid = Number(employeeId);
  const mi = monthIndex(month);
  const monthStart = `${year}-${pad(mi + 1)}-01`;
  const lastDay = new Date(year, mi + 1, 0).getDate();
  // Count the FULL calendar month of verified attendance rows — the exact same
  // window the Attendance module uses to display Present/Absent/etc. Payroll and
  // Attendance MUST show identical figures (single source of truth), so no
  // date clamping happens here: attendance rows exist only for days that were
  // actually recorded, so "future" days simply have no rows to count. (A prior
  // build clamped this to today, which made a recompute silently drop payroll
  // below the Attendance module's count — the mismatch this fixes.)
  const monthEnd = `${year}-${pad(mi + 1)}-${pad(lastDay)}`;

  const emp = await prisma.employee.findUnique({
    where: { id: eid },
    // joinDate/exitDate/status drive the employment cut-offs below.
    select: { companyId: true, branchId: true, joinDate: true, exitDate: true, status: true },
  });

  // ── Employment cut-offs ────────────────────────────────────────────────────
  // The payable window runs MAX(1st of month, join date) … MIN(last day of
  // month, exit date). Attendance is still READ for the whole month, because
  // the proration DENOMINATOR is the standard month — but nothing dated before
  // `windowStart` or after `windowEnd` may be paid for (a mid-month joiner
  // used to receive paid weekly-off credit for pre-employment Sundays).
  const win = employmentWindow(emp, month, year);
  const { windowStart, windowEnd, startDay, cutoffDay, truncated, truncatedStart } = win;
  const inWindow = (date) => String(date) >= windowStart && String(date) <= windowEnd;

  const [attendance, leaves, overtime] = await Promise.all([
    prisma.attendance.findMany({ where: { employeeId: eid, date: { gte: monthStart, lte: monthEnd } } }),
    prisma.leaveRequest.findMany({ where: { employeeId: eid, status: 'Approved' } }),
    // Overtime outside the employment window is not payable, so never loaded.
    prisma.overtime.findMany({ where: { employeeId: eid, status: 'Approved', date: { gte: windowStart, lte: windowEnd } } }),
  ]);

  // `c` = days INSIDE the employment window (what the employee is paid for).
  // `full` = the same tally across the whole calendar month, used ONLY for the
  // proration denominator, which must stay a standard month.
  const c = { present: 0, absent: 0, half: 0, wfh: 0, holiday: 0, weeklyOff: 0 };
  const full = { holiday: 0, weeklyOff: 0 };
  // Days that already carry a NON-leave attendance record. A day the employee
  // demonstrably attended (or was marked absent/holiday/off) must never ALSO
  // earn leave credit — one calendar day counts exactly once.
  const recordedNonLeaveDates = new Set();
  for (const a of attendance) {
    const b = bucketOf(a.status);
    if (b === 'leave') continue; // leave days come from LeaveRequests below
    recordedNonLeaveDates.add(a.date);
    if (b === 'holiday' || b === 'weeklyOff') full[b] += 1;
    if (!inWindow(a.date)) continue;              // outside the employment window → ignored
    c[b] = (c[b] || 0) + 1;
  }

  // Leave days per category, clamped to the EMPLOYMENT window (leave granted
  // before the join date or past the exit date is not leave the company owes
  // anyone), and EXCLUDING days that already have a non-leave attendance row —
  // a day marked Present cannot simultaneously be a paid leave day.
  const leaveDays = { CL: 0, PL: 0, SL: 0, LWP: 0, OTHER: 0 };
  const eachDate = (from, to, fn) => {
    for (let t = new Date(`${from}T00:00:00.000Z`); ; t.setUTCDate(t.getUTCDate() + 1)) {
      const date = t.toISOString().slice(0, 10);
      if (date > to) break;
      fn(date);
    }
  };
  for (const l of leaves) {
    const from = l.fromDate > windowStart ? l.fromDate : windowStart;
    const to = l.toDate < windowEnd ? l.toDate : windowEnd;
    if (from > to) continue; // no overlap with this month/window
    // Days of this leave that actually need leave credit here: inside the
    // employment window and NOT already carrying a non-leave attendance row.
    let overlap = 0;
    eachDate(from, to, (date) => { if (!recordedNonLeaveDates.has(date)) overlap += 1; });
    if (overlap <= 0) continue;
    // paidDays/lwpDays were granted for the leave's uncovered days (the leave
    // engine already excludes rest days it does not owe), so the apportioning
    // base is the span MINUS days this month shows as separately recorded —
    // otherwise a Weekly-Off row inside the span would shrink the credit twice.
    const span = Math.max(1, (new Date(l.toDate) - new Date(l.fromDate)) / 86400000 + 1);
    let recordedInSpan = 0;
    const mFrom = l.fromDate > monthStart ? l.fromDate : monthStart;
    const mTo = l.toDate < monthEnd ? l.toDate : monthEnd;
    if (mFrom <= mTo) eachDate(mFrom, mTo, (date) => { if (recordedNonLeaveDates.has(date)) recordedInSpan += 1; });
    const effectiveSpan = Math.max(1, span - recordedInSpan);
    const frac = Math.min(1, overlap / effectiveSpan);
    const cat = categoryOf(l.leaveType);
    const paid = (l.paidDays || 0) * frac;
    const lwp = (l.lwpDays || 0) * frac;
    if (cat === 'LWP') leaveDays.LWP += round(overlap);
    else {
      leaveDays[cat] = (leaveDays[cat] || 0) + round(paid || overlap);
      if (lwp) leaveDays.LWP += round(lwp);
    }
  }

  // ── Gap-fill uncovered days — SINGLE engine, identical to "Sync → Payroll" ──
  // A calendar day with no attendance row AND not inside an approved leave is a
  // Weekly Off (Sunday) or an Absent (LOP). This credits weekly-offs into payable
  // days and counts genuine absences, so the Salary Worksheet, Attendance module
  // and the Sync popup all read ONE identical snapshot. Fully-recorded months
  // (every day has a row — e.g. the demo dataset) are untouched.
  const attDates = new Set(attendance.map(a => a.date));
  for (let day = 1; day <= lastDay; day++) {
    const date = `${year}-${pad(mi + 1)}-${pad(day)}`;
    const isSunday = new Date(date).getDay() === 0;
    // The denominator counts the whole month's rest days regardless of the
    // join/exit dates — the proration base stays the standard month.
    if (!attDates.has(date) && isSunday && !leaves.some(l => date >= l.fromDate && date <= l.toDate)) full.weeklyOff += 1;
    if (day < startDay || day > cutoffDay) continue;                   // outside the employment window → ignored
    if (attDates.has(date)) continue;                                  // already counted from a row
    if (leaves.some(l => date >= l.fromDate && date <= l.toDate)) continue; // counted as leave below
    if (isSunday) c.weeklyOff += 1;                                    // Sunday → Weekly Off (matches Sync)
    else c.absent += 1;                                                // else → Absent / LOP
  }

  const otHours = round(overtime.reduce((s, o) => s + (o.otHours || 0), 0));
  const cl = round(leaveDays.CL), pl = round(leaveDays.PL), sl = round(leaveDays.SL);
  const lwp = round(leaveDays.LWP), other = round(leaveDays.OTHER);
  const presentDays = c.present;
  const halfDays = c.half;
  const weeklyOffDays = c.weeklyOff;
  const holidayDays = c.holiday;

  // ── Resolve the Attendance & Salary Deduction Policy (single source of truth) ──
  // The policy decides how attendance converts to payable/working days: weekly-off
  // & holiday pay, half-day pay fraction, absent/LWP deduction weight, LOP basis
  // and the sandwich rule. Defaults reproduce the historical formula exactly, so
  // an unconfigured company/branch behaves identically to before.
  const effective = await policyService.resolveEffectivePolicy({ companyId: emp?.companyId, branchId: emp?.branchId }).catch(() => null);
  const policy = effective ? effective.config : policyService.POLICY_DEFAULTS;

  // Sandwich detection needs a per-day classification for the WHOLE month. Built
  // separately from the tallies above (which stay exactly as-is) so only the
  // sandwich rule — when enabled — changes the numbers.
  // Scanned only across the EMPLOYMENT window — a rest day the employee was no
  // longer employed for cannot be "bridged by absence".
  const dayType = new Array(cutoffDay + 1).fill(null);
  for (const a of attendance) {
    const d = Number(String(a.date).slice(8, 10));
    if (d >= startDay && d <= cutoffDay) { const b = bucketOf(a.status); if (b !== 'leave') dayType[d] = b; }
  }
  for (const l of leaves) {
    const isLwp = categoryOf(l.leaveType) === 'LWP';
    for (let d = startDay; d <= cutoffDay; d++) {
      const date = `${year}-${pad(mi + 1)}-${pad(d)}`;
      if (dayType[d] == null && date >= l.fromDate && date <= l.toDate) dayType[d] = isLwp ? 'lwp' : 'leave';
    }
  }
  for (let d = startDay; d <= cutoffDay; d++) {
    if (dayType[d] == null) {
      const date = `${year}-${pad(mi + 1)}-${pad(d)}`;
      dayType[d] = new Date(date).getDay() === 0 ? 'weeklyOff' : 'absent';
    }
  }
  const isRest = (t) => t === 'weeklyOff' || t === 'holiday';
  const isUnpaidGap = (t) => t === 'absent' || t === 'lwp';
  let sandwichWeeklyOff = 0, sandwichHoliday = 0;
  for (let d = startDay; d <= cutoffDay; d++) {
    if (!isRest(dayType[d])) continue;
    let l = d - 1; while (l >= startDay && isRest(dayType[l])) l--;
    let r = d + 1; while (r <= cutoffDay && isRest(dayType[r])) r++;
    if (l >= startDay && isUnpaidGap(dayType[l]) && r <= cutoffDay && isUnpaidGap(dayType[r])) {
      if (dayType[d] === 'weeklyOff') sandwichWeeklyOff++; else sandwichHoliday++;
    }
  }
  // Only rest days that would otherwise be PAID cost anything under sandwich.
  const sandwichPaidDays = (policy.weeklyOffPaid ? sandwichWeeklyOff : 0) + (policy.holidayPaid ? sandwichHoliday : 0);

  // ── payableDays (numerator) & workingDays (proration denominator) ──
  // Both come from the ONE policy-driven computation. dailyRate = monthlyGross /
  // workingDays ; grossPay = dailyRate × payableDays.
  const counts = {
    present: presentDays, wfh: c.wfh, holiday: holidayDays, weeklyOff: weeklyOffDays,
    half: halfDays, absent: c.absent, cl, pl, sl, other, lwp, sandwichPaidDays,
  };
  // The DENOMINATOR is always the standard month — the whole month's rest days,
  // not the ones inside the employment window. Prorating a leaver against their
  // own shortened window would divide 13 payable days by 13 working days and pay
  // a full month's salary for half a month's work.
  const denomCounts = { weeklyOff: full.weeklyOff, holiday: full.holiday };

  // ── Numerator and denominator must share a basis ──────────────────────────
  // On the 'working' LOP basis the denominator EXCLUDES rest days (31 − 4 = 27),
  // so the daily rate (₹30,000 ÷ 27) already carries each Sunday's share. For a
  // FULL month that mismatch is invisible — payable exceeds working and the
  // engine caps the ratio at 1 — but on a truncated month it is real money: an
  // exit on 15 July credited 13 present + 2 Sundays against a 27-day denominator
  // and paid 15/27 (₹16,667) for what is 13/27 of the month (₹14,444).
  // The 'calendar' and 'fixed30' bases DO include rest days, so they keep theirs.
  const restIncludedBasis = policy.lopBasis === 'calendar' || policy.lopBasis === 'fixed30';
  const partialMonth = truncated || truncatedStart; // join or exit inside the month
  const payableCounts = (partialMonth && !restIncludedBasis)
    ? { ...counts, weeklyOff: 0, holiday: 0, sandwichPaidDays: 0 }
    : counts;
  const money = policyService.computeMoneyDays(policy, payableCounts, lastDay, denomCounts);
  const payableDays = money.payableDays;
  const workingDays = money.workingDays > 0 ? money.workingDays : round(Math.max(0, lastDay - full.weeklyOff - full.holiday));
  // Recorded-vs-expected coverage → Complete / Partial / Missing. Rows after the
  // exit date are not part of this employment, so they neither count as coverage
  // nor is the employee expected to cover the days they were no longer employed.
  const windowRows = partialMonth ? attendance.filter((a) => inWindow(a.date)) : attendance;
  const recordedDays = windowRows.length;
  const expectedDays = partialMonth
    ? round(Math.max(0, cutoffDay - startDay + 1 - c.weeklyOff - c.holiday))
    : workingDays;
  const attendanceStatus = recordedDays === 0 ? 'Missing' : recordedDays >= expectedDays ? 'Complete' : 'Partial';
  // Where the punches came from — most common non-empty source on the raw rows.
  const srcCounts = {};
  for (const a of windowRows) {
    const s = a.source || a.importSource || a.method;
    if (s) srcCounts[s] = (srcCounts[s] || 0) + 1;
  }
  const topSource = Object.keys(srcCounts).sort((x, y) => srcCounts[y] - srcCounts[x])[0];
  const attendanceSource = topSource || (recordedDays > 0 ? 'Attendance Records' : 'System Computed');

  return {
    companyId: emp?.companyId || 1,
    employeeId: eid, month, year: Number(year),
    presentDays, absentDays: c.absent, cl, pl, sl, lwp, halfDays, otHours, payableDays,
    workingDays, weeklyOffDays, holidayDays, attendanceStatus, attendanceSource,
  };
}

/**
 * Compute and upsert the summary (preserves `locked` and `shift`).
 * When `opts.markSynced` is true (the Attendance → Payroll "Confirm & Write" step)
 * we also stamp `syncedAt`, marking this month as officially synchronized — the
 * flag the Salary Worksheet / Slip gate their actions on.
 */
async function recompute(employeeId, month, year, opts = {}) {
  const figures = await compute(employeeId, month, year);
  if (opts.markSynced) figures.syncedAt = new Date();
  const existing = await prisma.attendanceSummary.findUnique({
    where: { employeeId_month_year: { employeeId: figures.employeeId, month, year: figures.year } },
  });
  if (existing && existing.locked) return existing; // don't overwrite a locked month
  return prisma.attendanceSummary.upsert({
    where: { employeeId_month_year: { employeeId: figures.employeeId, month, year: figures.year } },
    update: figures,
    create: figures,
  });
}

module.exports = { compute, recompute, monthIndex, MONTHS };
