// ─────────────────────────────────────────────────────────────────────────────
// automationScheduler — the production tick that makes automation autonomous.
//
// Every minute it loads all ACTIVE automation rules, checks whether each is due
// now (in the rule's timezone), and — if it has not already run in this period —
// executes it in 'send' mode (render HRMate card → upload → approved WhatsApp
// IMAGE template → delivery log → webhook/analytics/audit).
//
// This module is NEW (no scheduler existed before) and only EXTENDS the platform:
// it calls the existing automationEngine.execute() + the existing per-employee
// idempotency. The "Send Test Message" connectivity check is untouched and is
// never part of this path. Disable with env AUTOMATION_SCHEDULER=off.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../../config/prisma');
const engine = require('./automationEngine');

const DEFAULT_TZ = process.env.AUTOMATION_DEFAULT_TZ || 'Asia/Kolkata';
const TICK_MS = Number(process.env.AUTOMATION_TICK_MS) || 60000;

// Triggers that fire automatically on a schedule (manual/api never auto-fire).
const AUTO_TRIGGERS = new Set(['daily', 'weekly', 'monthly', 'yearly', 'specific_date', 'employee_birthday', 'employee_anniversary', 'company_holiday']);

let timer = null;
let running = false;            // re-entrancy guard (a slow tick must not overlap)
const state = { startedAt: null, lastTickAt: null, lastTickDue: 0, lastTickSent: 0, ticks: 0, lastError: null };

// Resolve the wall-clock parts (year/month/day/weekday/HH:mm) in a timezone.
const partsInTz = (tz) => {
  const d = new Date();
  let fmt;
  try { fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz || DEFAULT_TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { fmt = new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' }); }
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(p.hour, 10); if (hour === 24) hour = 0; // some ICU emit 24 at midnight
  return {
    year: parseInt(p.year, 10), month: parseInt(p.month, 10), day: parseInt(p.day, 10),
    weekday: wdMap[p.weekday] != null ? wdMap[p.weekday] : new Date().getDay(),
    minutes: hour * 60 + parseInt(p.minute, 10),
    dateStr: `${p.year}-${p.month}-${p.day}`,
  };
};

const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

// Is today an eligible DAY for this rule's trigger? (time checked separately)
const eligibleDay = (rule, parts) => {
  switch (rule.triggerType) {
    case 'weekly': return rule.scheduleDay == null || rule.scheduleDay === parts.weekday;
    case 'monthly': return rule.scheduleDay == null || rule.scheduleDay === parts.day;
    case 'yearly': return (rule.scheduleMonth == null || rule.scheduleMonth === parts.month) && (rule.scheduleDay == null || rule.scheduleDay === parts.day);
    case 'specific_date': return rule.specificDate === parts.dateStr;
    case 'daily':
    case 'employee_birthday':
    case 'employee_anniversary':
    case 'company_holiday':
    default: return true;
  }
};

// Due now? Eligible day AND the scheduled minute has arrived (catch-up: any tick
// at/after the time still fires, because the once-per-period guard stops repeats).
const isDue = (rule, parts) => {
  if (!AUTO_TRIGGERS.has(rule.triggerType)) return false;
  const sched = toMinutes(rule.scheduleTime);
  if (sched == null) return false;
  if (!eligibleDay(rule, parts)) return false;
  return parts.minutes >= sched;
};

// Has this rule already had a 'send' run in the current period (today)? Reuses
// AutomationRun history so restarts / catch-up never double-send a period.
const ranThisPeriod = async (rule) => {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const row = await prisma.automationRun.findFirst({
    where: { ruleId: rule.id, mode: 'send', createdAt: { gte: d } },
    select: { id: true },
  }).catch(() => null);
  return !!row;
};

// Compute the next fire time (for the UI). Best-effort for display only.
const nextRunAt = (rule) => {
  const sched = toMinutes(rule.scheduleTime);
  if (sched == null || !AUTO_TRIGGERS.has(rule.triggerType)) return null;
  const tz = rule.timezone || DEFAULT_TZ;
  const parts = partsInTz(tz);
  const hh = String(Math.floor(sched / 60)).padStart(2, '0');
  const mm = String(sched % 60).padStart(2, '0');
  // Search up to 366 days ahead for the next eligible day at/after the time.
  for (let add = 0; add <= 366; add++) {
    const probe = new Date(); probe.setDate(probe.getDate() + add);
    const pp = partsInTz(tz);
    // Reuse eligibleDay against a synthetic parts for the probe day.
    const synthetic = { ...pp, weekday: (pp.weekday + add) % 7, day: probe.getDate(), month: probe.getMonth() + 1, dateStr: `${probe.getFullYear()}-${String(probe.getMonth() + 1).padStart(2, '0')}-${String(probe.getDate()).padStart(2, '0')}` };
    const passedToday = add === 0 && parts.minutes >= sched;
    if (eligibleDay(rule, synthetic) && !passedToday) {
      return `${synthetic.dateStr} ${hh}:${mm} (${tz})`;
    }
  }
  return null;
};

// One scheduler tick — fire every due, not-yet-run active rule.
const tick = async () => {
  if (running) return;            // skip overlapping ticks
  running = true;
  let due = 0, sentTotal = 0;
  try {
    const rules = await prisma.automationRule.findMany({ where: { status: 'active', channel: 'whatsapp' } });
    for (const rule of rules) {
      try {
        const parts = partsInTz(rule.timezone || DEFAULT_TZ);
        if (!isDue(rule, parts)) continue;
        if (await ranThisPeriod(rule)) continue;
        due++;
        const result = await engine.execute(rule.companyId, rule, 'send');
        sentTotal += (result && result.summary && result.summary.sentMessages) || 0;
        console.log('[automation][scheduler] fired rule #%s "%s" (company %s) → eligible=%s sent=%s failed=%s skipped=%s',
          rule.id, rule.name, rule.companyId,
          result.summary.eligibleRecipients, result.summary.sentMessages, result.summary.failedMessages, result.summary.skippedMessages);
      } catch (e) {
        console.error('[automation][scheduler] rule #%s error: %s', rule.id, e.message);
      }
    }
    state.lastError = null;
  } catch (e) {
    state.lastError = e.message;
    console.error('[automation][scheduler] tick error:', e.message);
  } finally {
    state.ticks++; state.lastTickAt = new Date(); state.lastTickDue = due; state.lastTickSent = sentTotal;
    running = false;
  }
};

const start = () => {
  if (process.env.AUTOMATION_SCHEDULER === 'off') { console.log('[automation][scheduler] disabled via AUTOMATION_SCHEDULER=off'); return; }
  if (timer) return;
  state.startedAt = new Date();
  // First tick shortly after boot (let the app settle), then every minute.
  setTimeout(() => { tick(); timer = setInterval(tick, TICK_MS); }, 5000);
  console.log('[automation][scheduler] started — ticking every %sms (tz default %s)', TICK_MS, DEFAULT_TZ);
};

const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

const status = () => ({ ...state, enabled: process.env.AUTOMATION_SCHEDULER !== 'off', tickMs: TICK_MS, defaultTz: DEFAULT_TZ });

module.exports = { start, stop, tick, status, isDue, nextRunAt, partsInTz, toMinutes };
