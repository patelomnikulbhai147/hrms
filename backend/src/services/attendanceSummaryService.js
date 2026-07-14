/**
 * Derive a per-employee monthly attendance summary from the raw daily Attendance
 * rows + approved LeaveRequests + Overtime. This is the source of truth that
 * payroll and salary slips read. Admins can override it via the edit endpoint.
 */
const prisma = require('../config/prisma');
const { categoryOf } = require('./leaveService');

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

  const [emp, attendance, leaves, overtime] = await Promise.all([
    prisma.employee.findUnique({ where: { id: eid }, select: { companyId: true } }),
    prisma.attendance.findMany({ where: { employeeId: eid, date: { gte: monthStart, lte: monthEnd } } }),
    prisma.leaveRequest.findMany({ where: { employeeId: eid, status: 'Approved' } }),
    prisma.overtime.findMany({ where: { employeeId: eid, status: 'Approved', date: { gte: monthStart, lte: monthEnd } } }),
  ]);

  const c = { present: 0, absent: 0, half: 0, wfh: 0, holiday: 0, weeklyOff: 0 };
  for (const a of attendance) {
    const b = bucketOf(a.status);
    if (b === 'leave') continue; // leave days come from LeaveRequests below
    c[b] = (c[b] || 0) + 1;
  }

  // Leave days per category, clamped to the month window.
  const leaveDays = { CL: 0, PL: 0, SL: 0, LWP: 0, OTHER: 0 };
  for (const l of leaves) {
    const from = l.fromDate > monthStart ? l.fromDate : monthStart;
    const to = l.toDate < monthEnd ? l.toDate : monthEnd;
    if (from > to) continue; // no overlap with this month
    const overlap = Math.max(0, (new Date(to) - new Date(from)) / 86400000 + 1);
    const span = Math.max(1, (new Date(l.toDate) - new Date(l.fromDate)) / 86400000 + 1);
    const frac = Math.min(1, overlap / span);
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
    if (attDates.has(date)) continue;                                  // already counted from a row
    if (leaves.some(l => date >= l.fromDate && date <= l.toDate)) continue; // counted as leave below
    if (new Date(date).getDay() === 0) c.weeklyOff += 1;               // Sunday → Weekly Off (matches Sync)
    else c.absent += 1;                                                // else → Absent / LOP
  }

  const otHours = round(overtime.reduce((s, o) => s + (o.otHours || 0), 0));
  const cl = round(leaveDays.CL), pl = round(leaveDays.PL), sl = round(leaveDays.SL);
  const lwp = round(leaveDays.LWP), other = round(leaveDays.OTHER);
  const presentDays = c.present;
  const halfDays = c.half;
  // Weekly-off / holiday / WFH are present-equivalent (paid) per existing payroll sync.
  const payableDays = round(presentDays + c.wfh + c.holiday + c.weeklyOff + halfDays * 0.5 + cl + pl + sl + other);

  // ── Snapshot fields the Payroll engine + Salary Worksheet read directly ──
  // workingDays = the days the employee is EXPECTED to work = calendar days minus
  // weekly-offs and holidays. This is payroll's proration DENOMINATOR:
  //   dailyRate = monthlyGross / workingDays ;  grossPay = dailyRate × payableDays.
  const weeklyOffDays = c.weeklyOff;
  const holidayDays = c.holiday;
  const workingDays = round(Math.max(0, lastDay - weeklyOffDays - holidayDays));
  // Recorded-vs-expected coverage → Complete / Partial / Missing.
  const recordedDays = attendance.length;
  const attendanceStatus = recordedDays === 0 ? 'Missing' : recordedDays >= workingDays ? 'Complete' : 'Partial';
  // Where the punches came from — most common non-empty source on the raw rows.
  const srcCounts = {};
  for (const a of attendance) {
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
