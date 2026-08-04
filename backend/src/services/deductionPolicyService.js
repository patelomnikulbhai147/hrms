/**
 * Attendance & Salary Deduction Policy — the MASTER calculation engine config.
 *
 * This is the single source of truth for how attendance converts to salary.
 * The Payroll engine (recalcOne) and the AttendanceSummary service both resolve
 * the effective policy through here and use `computeMoneyDays()` for the
 * payable/working-day math — there are NO hardcoded deduction rules anywhere
 * else. When no policy row exists (or it is disabled) the DEFAULTS reproduce the
 * historical behaviour exactly, so existing payroll is never silently changed.
 *
 * Storage = `deduction_policy` (isolated table). Every save inserts a NEW row =
 * a new immutable version; the highest version for a (companyId, branchId) scope
 * is effective. branchId = null → company-wide; a non-null branchId row is a
 * branch-level override that wins for that branch when present.
 */
const prisma = require('../config/prisma');

// Historical/default policy. These values MUST reproduce the pre-policy engine:
//   • weekly-off / holiday / WFH paid   • half-day = 0.5 day paid
//   • absent = 1 day unpaid             • LWP = 100% unpaid
//   • working-day divisor = calendar − weekly-off − holiday
//   • OT multiplier 1.5
const POLICY_DEFAULTS = {
  enabled: true,
  // Attendance rules (late/min-hours enforcement in live payroll is part of the
  // attendance-detail rollout; stored here so the policy is the sole config).
  graceMins: 10,
  lateMarksAllowed: 3,
  lateMarksPerDeduction: 3,
  lateDeductionUnit: 'half', // 'half' | 'full'
  earlyExitGraceMins: 10,
  minHoursFullDay: 8,
  minHoursHalfDay: 4,
  // Salary deduction rules (money-affecting — wired into the engine)
  lopBasis: 'working', // 'working' | 'calendar' | 'fixed30'
  absentDeductionDays: 1, // days of salary lost per absent day
  halfDayPayFraction: 0.5, // fraction of a day PAID for a half-day (0.5 = 50%)
  lwpDeductionPercent: 100, // % of an LWP day deducted (100 = full)
  overtimeMultiplier: 1.5, // OT pay multiplier
  rounding: 'nearest', // 'nearest' | 'down' | 'none'
  weeklyOffPaid: true,
  holidayPaid: true,
  sandwichPolicy: false,
};

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const round2 = (n) => Math.round((num(n) || 0) * 100) / 100;

// Merge a stored config over the defaults, coercing to known keys/types so a
// legacy or partial snapshot can never produce NaN/undefined in the engine.
function mergeDefaults(config) {
  const c = config && typeof config === 'object' ? config : {};
  return {
    ...POLICY_DEFAULTS,
    ...c,
    graceMins: num(c.graceMins, POLICY_DEFAULTS.graceMins),
    lateMarksAllowed: num(c.lateMarksAllowed, POLICY_DEFAULTS.lateMarksAllowed),
    lateMarksPerDeduction: Math.max(1, num(c.lateMarksPerDeduction, POLICY_DEFAULTS.lateMarksPerDeduction)),
    earlyExitGraceMins: num(c.earlyExitGraceMins, POLICY_DEFAULTS.earlyExitGraceMins),
    minHoursFullDay: num(c.minHoursFullDay, POLICY_DEFAULTS.minHoursFullDay),
    minHoursHalfDay: num(c.minHoursHalfDay, POLICY_DEFAULTS.minHoursHalfDay),
    absentDeductionDays: Math.max(0, num(c.absentDeductionDays, POLICY_DEFAULTS.absentDeductionDays)),
    halfDayPayFraction: clamp01(num(c.halfDayPayFraction, POLICY_DEFAULTS.halfDayPayFraction)),
    lwpDeductionPercent: Math.min(100, Math.max(0, num(c.lwpDeductionPercent, POLICY_DEFAULTS.lwpDeductionPercent))),
    overtimeMultiplier: Math.max(0, num(c.overtimeMultiplier, POLICY_DEFAULTS.overtimeMultiplier)),
    weeklyOffPaid: c.weeklyOffPaid !== undefined ? !!c.weeklyOffPaid : POLICY_DEFAULTS.weeklyOffPaid,
    holidayPaid: c.holidayPaid !== undefined ? !!c.holidayPaid : POLICY_DEFAULTS.holidayPaid,
    sandwichPolicy: c.sandwichPolicy !== undefined ? !!c.sandwichPolicy : POLICY_DEFAULTS.sandwichPolicy,
    lopBasis: ['working', 'calendar', 'fixed30'].includes(c.lopBasis) ? c.lopBasis : POLICY_DEFAULTS.lopBasis,
    lateDeductionUnit: c.lateDeductionUnit === 'full' ? 'full' : 'half',
    rounding: ['nearest', 'down', 'none'].includes(c.rounding) ? c.rounding : POLICY_DEFAULTS.rounding,
    enabled: c.enabled !== undefined ? !!c.enabled : true,
  };
}

// ── Scope resolution ─────────────────────────────────────────────────────────
// A workspace id can be a parent company, a branch stored as a Company row (with
// parentCompanyId), or a Branch-table id. Normalise to { companyId (parent),
// branchId } so policies key off the parent company with an optional branch.
async function resolveScope(rawId, explicitBranchId) {
  const id = Number(rawId) || 0;
  let companyId = id;
  let branchId = explicitBranchId != null && explicitBranchId !== '' ? Number(explicitBranchId) : null;
  if (!id) return { companyId, branchId };
  const co = await prisma.company.findUnique({ where: { id } }).catch(() => null);
  if (co) {
    if (co.parentCompanyId) { companyId = co.parentCompanyId; branchId = branchId ?? id; }
    else companyId = id;
    return { companyId, branchId };
  }
  const br = await prisma.branch.findUnique({ where: { id } }).catch(() => null);
  if (br) { companyId = br.companyId; branchId = branchId ?? id; }
  return { companyId, branchId };
}

function latestPolicyRow(companyId, branchId) {
  return prisma.deductionPolicy
    .findFirst({ where: { companyId: Number(companyId), branchId: branchId == null ? null : Number(branchId) }, orderBy: { version: 'desc' } })
    .catch(() => null);
}

// Resolve the effective policy for a (company/branch) scope: branch override
// first, then company-wide, then defaults. A disabled latest row → defaults
// (historical behaviour) while still reporting its version for the audit trail.
async function resolveEffectivePolicy({ companyId, branchId } = {}) {
  const scope = await resolveScope(companyId, branchId);
  let row = null;
  if (scope.branchId != null) row = await latestPolicyRow(scope.companyId, scope.branchId);
  let branchScoped = !!row;
  if (!row) { row = await latestPolicyRow(scope.companyId, null); branchScoped = false; }
  const enabled = row ? !!row.enabled : true;
  const config = enabled ? mergeDefaults(row && row.config) : { ...POLICY_DEFAULTS };
  return {
    version: row ? row.version : 0,
    enabled,
    exists: !!row,
    branchScoped,
    scope,
    config,
    createdAt: row ? row.createdAt : null,
  };
}

async function listVersions(companyId, branchId, take = 25) {
  const scope = await resolveScope(companyId, branchId);
  const where = { companyId: scope.companyId };
  if (scope.branchId != null) where.branchId = scope.branchId; else where.branchId = null;
  const rows = await prisma.deductionPolicy.findMany({ where, orderBy: { version: 'desc' }, take }).catch(() => []);
  return rows.map((r) => ({ id: r.id, version: r.version, enabled: r.enabled, reason: r.reason, createdBy: r.createdBy, createdAt: r.createdAt }));
}

// Persist a NEW immutable version for the scope and return the created row.
async function saveNewVersion({ companyId, branchId, config, enabled, reason, createdBy }) {
  const scope = await resolveScope(companyId, branchId);
  const last = await latestPolicyRow(scope.companyId, scope.branchId);
  const version = (last && last.version ? last.version : 0) + 1;
  const clean = mergeDefaults(config);
  clean.enabled = enabled !== undefined ? !!enabled : clean.enabled;
  return prisma.deductionPolicy.create({
    data: {
      companyId: scope.companyId,
      branchId: scope.branchId == null ? null : scope.branchId,
      version,
      enabled: clean.enabled,
      config: clean,
      reason: reason ? String(reason).slice(0, 2000) : null,
      createdBy: createdBy ? String(createdBy).slice(0, 191) : null,
    },
  });
}

// ── The one attendance→money-days computation ────────────────────────────────
// `counts` (all in DAYS): present, wfh, holiday, weeklyOff, half, absent,
// cl, pl, sl, other, lwp, plus sandwich credit already gated by the paid flags:
//   sandwichPaidDays = (weeklyOffPaid? sandwichedWeeklyOff:0) + (holidayPaid? sandwichedHoliday:0)
// `lastDay` = calendar days in the month.
function workingDaysFor(policy, { lastDay, weeklyOff, holiday }) {
  switch (policy.lopBasis) {
    case 'calendar': return Math.max(0, num(lastDay));
    case 'fixed30': return 30;
    default: return Math.max(0, num(lastDay) - num(weeklyOff) - num(holiday));
  }
}

function payableDaysFor(policy, counts) {
  const halfFrac = clamp01(num(policy.halfDayPayFraction, 0.5));
  const woCredit = policy.weeklyOffPaid ? num(counts.weeklyOff) : 0;
  const holCredit = policy.holidayPaid ? num(counts.holiday) : 0;
  const absentPenalty = Math.max(0, num(policy.absentDeductionDays, 1)); // days lost per absent
  const lwpPenalty = clamp01(num(policy.lwpDeductionPercent, 100) / 100); // fraction of an LWP day lost

  let payable =
    num(counts.present) +
    num(counts.wfh) +
    holCredit +
    woCredit +
    num(counts.half) * halfFrac +
    num(counts.cl) + num(counts.pl) + num(counts.sl) + num(counts.other);

  // Absent: baseline (penalty 1) leaves absents out entirely. Credit back the
  // un-penalised fraction (penalty 0.5 → each absent only costs half a day).
  payable += num(counts.absent) * (1 - absentPenalty);
  // LWP: baseline (100%) leaves LWP out entirely. Credit back the un-deducted part.
  payable += num(counts.lwp) * (1 - lwpPenalty);
  // Sandwich: remove pay for weekly-offs/holidays bridged by absence.
  if (policy.sandwichPolicy) payable -= num(counts.sandwichPaidDays);

  return round2(Math.max(0, payable));
}

/**
 * `counts`      — days the employee is actually being PAID for (the numerator).
 * `denomCounts` — days in the STANDARD month (the proration denominator).
 *
 * They differ only when an employment starts or ends mid-month. For a leaver the
 * numerator stops at the exit date while the denominator stays the whole month,
 * which is what makes the salary prorate: someone who exits on 15 July with
 * perfect attendance is paid 13/27 of the month, not 13/13 of it. Defaulting
 * `denomCounts` to `counts` keeps every existing caller byte-identical.
 */
function computeMoneyDays(policy, counts, lastDay, denomCounts = counts) {
  const workingDays = round2(workingDaysFor(policy, { lastDay, weeklyOff: denomCounts.weeklyOff, holiday: denomCounts.holiday }));
  const payableDays = payableDaysFor(policy, counts);
  return { workingDays, payableDays };
}

module.exports = {
  POLICY_DEFAULTS,
  mergeDefaults,
  resolveScope,
  resolveEffectivePolicy,
  latestPolicyRow,
  listVersions,
  saveNewVersion,
  workingDaysFor,
  payableDaysFor,
  computeMoneyDays,
};
