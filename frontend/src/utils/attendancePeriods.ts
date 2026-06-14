import { AttendanceRecord, Employee, LeaveRequest } from '../types';

// ===========================================================================
// Shared attendance period + summary logic.
//
// Used by the Daily / Weekly / Monthly / Yearly / Custom views and the export
// modal so every view derives status the SAME way the existing daily Entry tab
// does (existing record -> approved leave -> Sunday Weekly Off -> Absent). This
// keeps the new enterprise views byte-for-byte consistent with the original
// single-day behaviour (backward compatible).
// ===========================================================================

export type PeriodMode = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface PeriodRange {
  start: string; // YYYY-MM-DD inclusive
  end: string;   // YYYY-MM-DD inclusive
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Compute the inclusive date range + a human label for a given mode/anchor. */
export function getPeriodRange(
  mode: PeriodMode,
  anchorDate: string,
  customStart?: string,
  customEnd?: string
): PeriodRange {
  const anchor = parseISO(anchorDate);

  if (mode === 'daily') {
    return { start: anchorDate, end: anchorDate, label: anchor.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) };
  }

  if (mode === 'weekly') {
    // Week runs Monday -> Sunday.
    const day = anchor.getDay(); // 0=Sun..6=Sat
    const diffToMonday = (day + 6) % 7;
    const start = new Date(anchor); start.setDate(anchor.getDate() - diffToMonday);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { start: toISO(start), end: toISO(end), label: `Week of ${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` };
  }

  if (mode === 'monthly') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start: toISO(start), end: toISO(end), label: `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}` };
  }

  if (mode === 'yearly') {
    const start = new Date(anchor.getFullYear(), 0, 1);
    const end = new Date(anchor.getFullYear(), 11, 31);
    return { start: toISO(start), end: toISO(end), label: `Year ${anchor.getFullYear()}` };
  }

  // custom
  const s = customStart || anchorDate;
  const e = customEnd || anchorDate;
  const [start, end] = s <= e ? [s, e] : [e, s];
  return { start, end, label: `${parseISO(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${parseISO(end).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` };
}

/** All YYYY-MM-DD dates in an inclusive range (capped to avoid runaway loops). */
export function eachDateInRange(start: string, end: string, maxDays = 420): string[] {
  const out: string[] = [];
  const cur = parseISO(start);
  const last = parseISO(end);
  let guard = 0;
  while (cur <= last && guard < maxDays) {
    out.push(toISO(cur));
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return out;
}

// Status buckets — mirror the regexes used by the existing `liveStats` memo.
export type StatusBucket = 'present' | 'absent' | 'leave' | 'half' | 'wfh' | 'holiday' | 'weeklyOff';

export function bucketOf(status: string): StatusBucket {
  const s = String(status || '').toLowerCase();
  if (/work from home|wfh/.test(s)) return 'wfh';
  if (/half[\s-]?day/.test(s)) return 'half';
  if (/leave/.test(s)) return 'leave';
  if (/holiday/.test(s)) return 'holiday';
  if (/weekly off|week off/.test(s)) return 'weeklyOff';
  if (/present|on duty|wfo/.test(s)) return 'present';
  return 'absent';
}

/** Short cell code for grid views. */
export function statusCode(status: string): string {
  switch (bucketOf(status)) {
    case 'present': return 'P';
    case 'absent': return 'A';
    case 'leave': return 'L';
    case 'half': return 'HD';
    case 'wfh': return 'WFH';
    case 'holiday': return 'H';
    case 'weeklyOff': return 'WO';
  }
}

/**
 * Resolve an employee's effective status on a date — identical precedence to the
 * existing daily Entry tab: stored record -> approved leave -> Sunday Weekly Off
 * -> Absent.
 */
export function resolveStatus(
  empId: string,
  date: string,
  attendance: AttendanceRecord[],
  leaves: LeaveRequest[]
): { status: string; record?: AttendanceRecord; leaveType?: string } {
  const existing = attendance.find(a => a.employeeId === empId && a.date === date);
  if (existing) return { status: existing.status, record: existing };

  const onLeave = leaves.find(l => l.employeeId === empId && l.status === 'Approved' && date >= l.fromDate && date <= l.toDate);
  if (onLeave) return { status: 'Leave', leaveType: (onLeave as any).leaveType };

  const isSunday = parseISO(date).getDay() === 0;
  return { status: isSunday ? 'Weekly Off' : 'Absent' };
}

export interface EmployeePeriodSummary {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  designation: string;
  branch: string;
  present: number;
  absent: number;
  leave: number;
  half: number;
  wfh: number;
  holiday: number;
  weeklyOff: number;
  lateMarks: number;
  otHours: number;
  workingDays: number; // calendar days that are not Weekly Off / Holiday
  lop: number;         // loss-of-pay days (absent + unpaid)
  payableDays: number; // present + half*0.5 + paid leave + weekly off + holiday + wfh
}

const isOtRecord = (o: any, date?: string) =>
  Number(o?.otHours ?? o?.overtimeHours ?? 0) > 0 && (!date || o?.date === date);

/** Aggregate one employee across a set of dates. */
export function summarizeEmployeePeriod(
  emp: Employee,
  dates: string[],
  attendance: AttendanceRecord[],
  leaves: LeaveRequest[],
  overtime: any[] = []
): EmployeePeriodSummary {
  const s: EmployeePeriodSummary = {
    employeeId: emp.id,
    employeeCode: emp.employeeId || '',
    employeeName: emp.name,
    department: emp.department || '',
    designation: (emp as any).designation || '',
    branch: emp.branchLocation || 'Head Office',
    present: 0, absent: 0, leave: 0, half: 0, wfh: 0, holiday: 0, weeklyOff: 0,
    lateMarks: 0, otHours: 0, workingDays: 0, lop: 0, payableDays: 0,
  };

  for (const date of dates) {
    const { status, record } = resolveStatus(emp.id, date, attendance, leaves);
    const bucket = bucketOf(status);
    s[bucket]++;

    if (bucket !== 'weeklyOff' && bucket !== 'holiday') s.workingDays++;

    const flags = (record as any)?.flags;
    if ((record as any)?.lateMark === true || (Array.isArray(flags) && flags.some((f: any) => /late/i.test(String(f))))) s.lateMarks++;
  }

  // Overtime hours over the period (employee may use id or code).
  s.otHours = (overtime || [])
    .filter(o => (o.empId === emp.id || o.employeeId === emp.id || o.empCode === emp.employeeId) && dates.includes(o.date) && isOtRecord(o))
    .reduce((acc, o) => acc + Number(o.otHours ?? o.overtimeHours ?? 0), 0);

  s.lop = s.absent; // unpaid absence
  s.payableDays = s.present + s.half * 0.5 + s.leave + s.weeklyOff + s.holiday + s.wfh;
  return s;
}

/** Per-month aggregate for the yearly analytics view. */
export interface MonthlyAggregate {
  month: string;       // 'Jan'..'Dec'
  monthIndex: number;
  present: number;
  absent: number;
  leave: number;
  half: number;
  wfh: number;
  otHours: number;
  attendanceRate: number; // present / workingDays %
}

export function summarizeYear(
  year: number,
  employees: Employee[],
  attendance: AttendanceRecord[],
  leaves: LeaveRequest[],
  overtime: any[] = []
): MonthlyAggregate[] {
  const result: MonthlyAggregate[] = [];
  for (let m = 0; m < 12; m++) {
    const start = toISO(new Date(year, m, 1));
    const end = toISO(new Date(year, m + 1, 0));
    const dates = eachDateInRange(start, end);
    let present = 0, absent = 0, leave = 0, half = 0, wfh = 0, otHours = 0, workingDays = 0;
    for (const emp of employees) {
      const sum = summarizeEmployeePeriod(emp, dates, attendance, leaves, overtime);
      present += sum.present; absent += sum.absent; leave += sum.leave;
      half += sum.half; wfh += sum.wfh; otHours += sum.otHours; workingDays += sum.workingDays;
    }
    result.push({
      month: MONTHS[m], monthIndex: m, present, absent, leave, half, wfh, otHours,
      attendanceRate: workingDays > 0 ? Math.round(((present + wfh + half * 0.5) / workingDays) * 100) : 0,
    });
  }
  return result;
}

export const MONTH_NAMES = MONTHS;
