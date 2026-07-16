// Frontend mirror of the backend Attendance & Salary Deduction Policy engine
// (backend/src/services/deductionPolicyService.js). Used ONLY for the instant
// "Live Policy Impact" preview so an admin sees how a setting changes salary
// BEFORE saving. The authoritative computation still runs on the backend; this
// mirror deliberately uses the SAME formulas so the preview matches payroll.

export interface DeductionPolicy {
  enabled: boolean;
  graceMins: number;
  lateMarksAllowed: number;
  lateMarksPerDeduction: number;
  lateDeductionUnit: 'half' | 'full';
  earlyExitGraceMins: number;
  minHoursFullDay: number;
  minHoursHalfDay: number;
  lopBasis: 'working' | 'calendar' | 'fixed30';
  absentDeductionDays: number;
  halfDayPayFraction: number;
  lwpDeductionPercent: number;
  overtimeMultiplier: number;
  rounding: 'nearest' | 'down' | 'none';
  weeklyOffPaid: boolean;
  holidayPaid: boolean;
  sandwichPolicy: boolean;
}

export const POLICY_DEFAULTS: DeductionPolicy = {
  enabled: true,
  graceMins: 10,
  lateMarksAllowed: 3,
  lateMarksPerDeduction: 3,
  lateDeductionUnit: 'half',
  earlyExitGraceMins: 10,
  minHoursFullDay: 8,
  minHoursHalfDay: 4,
  lopBasis: 'working',
  absentDeductionDays: 1,
  halfDayPayFraction: 0.5,
  lwpDeductionPercent: 100,
  overtimeMultiplier: 1.5,
  rounding: 'nearest',
  weeklyOffPaid: true,
  holidayPaid: true,
  sandwichPolicy: false,
};

const num = (v: any, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function mergePolicy(config: any): DeductionPolicy {
  return { ...POLICY_DEFAULTS, ...(config && typeof config === 'object' ? config : {}) } as DeductionPolicy;
}

export interface PreviewInputs {
  monthlySalary: number;
  workingDays: number;   // scheduled working days (LOP-basis 'working' divisor)
  calendarDays: number;  // days in the month (LOP-basis 'calendar' divisor)
  present: number;
  absent: number;
  halfDay: number;
  lateMarks: number;
  otHours: number;
}

export interface PreviewResult {
  workingDays: number;
  dailySalary: number;
  payableDays: number;
  absentDeduction: number;
  lateDeductionDays: number;
  latePenalty: number;
  halfDayDeduction: number;
  otAddition: number;
  grossSalary: number;
  estStatutory: number;
  netSalary: number;
}

// Late marks → deduction DAYS per policy (illustrative; live payroll wiring of
// late marks is part of the attendance-detail rollout).
export function lateDeductionDaysFor(policy: DeductionPolicy, lateMarks: number): number {
  const over = Math.max(0, num(lateMarks) - num(policy.lateMarksAllowed));
  const units = Math.floor(over / Math.max(1, num(policy.lateMarksPerDeduction)));
  return units * (policy.lateDeductionUnit === 'full' ? 1 : 0.5);
}

// Compute the salary impact of the policy for one sample employee.
export function previewPolicy(policyConfig: any, input: PreviewInputs): PreviewResult {
  const policy = mergePolicy(policyConfig);
  const monthly = Math.max(0, num(input.monthlySalary));
  const workingDaysInput = Math.max(0, num(input.workingDays));
  const calendarDays = Math.max(1, num(input.calendarDays, 30));

  const divisor =
    policy.lopBasis === 'calendar' ? calendarDays :
    policy.lopBasis === 'fixed30' ? 30 :
    workingDaysInput;
  const dailySalary = divisor > 0 ? monthly / divisor : 0;

  const halfFrac = clamp01(num(policy.halfDayPayFraction, 0.5));
  const absentPenalty = Math.max(0, num(policy.absentDeductionDays, 1));
  const lateDays = lateDeductionDaysFor(policy, input.lateMarks);

  // Payable days: present + paid half-day fraction, minus absent penalty and late
  // penalty. (Leaves/weekly-off/holiday omitted from this compact preview = 0.)
  let payableDays =
    num(input.present) +
    num(input.halfDay) * halfFrac -
    num(input.absent) * absentPenalty -
    lateDays;
  payableDays = Math.max(0, Math.round(payableDays * 100) / 100);

  const otAddition = Math.round(num(input.otHours) * (dailySalary / 8) * num(policy.overtimeMultiplier, 1.5));
  const grossUncapped = dailySalary * payableDays;
  const grossSalary = Math.round(Math.min(monthly, Math.max(0, grossUncapped)));

  const absentDeduction = Math.round(num(input.absent) * absentPenalty * dailySalary);
  const halfDayDeduction = Math.round(num(input.halfDay) * (1 - halfFrac) * dailySalary);
  const latePenalty = Math.round(lateDays * dailySalary);

  // Indicative statutory deductions (default rates — real payroll uses the
  // company's configured PF/ESI/PT). Basic assumed 50% of gross.
  const basic = grossSalary * 0.5;
  const pf = Math.round(basic * 0.12);
  const esi = Math.round(grossSalary * 0.0075);
  const pt = grossSalary > 0 ? 200 : 0;
  const estStatutory = pf + esi + pt;
  const netSalary = Math.max(0, grossSalary + otAddition - estStatutory);

  return {
    workingDays: divisor,
    dailySalary: Math.round(dailySalary),
    payableDays,
    absentDeduction,
    lateDeductionDays: lateDays,
    latePenalty,
    halfDayDeduction,
    otAddition,
    grossSalary,
    estStatutory,
    netSalary,
  };
}
