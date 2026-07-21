// ── Auto-reminder scheduler (Phase 3) ────────────────────────────────────────
// Fires escalating reminders for statutory compliance FILINGS and loan EMIs at
// 30 / 15 / 7 / 1 days before due (and once when Overdue). Reminders go REAL:
//   • in-app notification (notifyService) → the bell,
//   • email (emailService.sendMail) to HR/Company Head when SMTP is configured,
//   • a queued WhatsApp row (Phase-1 simulated) for the audit trail.
// Deduped per record via the `remindersSent` JSON column so a stage never
// re-sends. Idempotent across ticks. Disable with env REMINDER_SCHEDULER=off.
const prisma = require('../config/prisma');
const { notify } = require('./notificationService');
const { periodDueDate } = require('./loanCalc');
let email = {};
try { email = require('./emailService'); } catch (_) { /* optional */ }

const TICK_MS = Number(process.env.REMINDER_TICK_MS) || 12 * 3600 * 1000; // twice a day
const STAGES = [{ k: '30', d: 30 }, { k: '15', d: 15 }, { k: '7', d: 7 }, { k: '1', d: 1 }];
const state = { startedAt: null, ticks: 0, lastTickAt: null, lastSent: 0 };
let timer = null, running = false;

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysUntil = (dateStr) => Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - new Date(todayStr() + 'T00:00:00').getTime()) / 864e5);

// Which reminder stage applies for `days` until due, plus the stages it "covers"
// (this stage + any looser windows already passed) so old stages never fire late.
function stagePlan(days) {
  if (days < 0) return { stage: 'overdue', cover: ['30', '15', '7', '1', 'overdue'] };
  const match = [...STAGES].reverse().find((s) => days <= s.d); // tightest window containing `days`
  if (!match) return { stage: null, cover: [] };
  return { stage: match.k, cover: STAGES.filter((s) => s.d >= match.d).map((s) => s.k) };
}
const asArr = (v) => (Array.isArray(v) ? v : []);

// Recipients (HR + Company Head users) for a company.
async function managersFor(companyId) {
  return prisma.user.findMany({ where: { companyId: Number(companyId), role: { in: ['HR', 'Company Head'] } }, select: { id: true, email: true, name: true } }).catch(() => []);
}
async function employeeUserFor(employeeId) {
  if (!employeeId) return null;
  return prisma.user.findFirst({ where: { employeeId: Number(employeeId) }, select: { id: true, email: true } }).catch(() => null);
}

// Deliver a reminder over every channel. Best-effort — never throws.
async function deliver({ companyId, employeeId, employeeName, extraUserIds = [], title, message, emailSubject, emailHtml, queueLabel }) {
  const mgrs = await managersFor(companyId);
  const userIds = new Set([...extraUserIds, ...mgrs.map((m) => m.id)]);
  for (const uid of userIds) await notify({ userId: uid, companyId, type: 'reminder', title, message, priority: 'high' });

  if (email.isSmtpConfigured && email.isSmtpConfigured()) {
    const to = [...new Set(mgrs.map((m) => m.email).filter((e) => e && e.includes('@')))];
    if (to.length) await email.sendMail({ companyId, to: to.join(','), subject: emailSubject || title, text: message, html: emailHtml || `<p>${message}</p>` }).catch(() => {});
  }
  try {
    await prisma.whatsAppQueue.create({ data: { companyId: Number(companyId), employeeId: employeeId ? Number(employeeId) : null, employeeName: employeeName || null, templateName: queueLabel || `Reminder · ${title}`, payload: JSON.stringify({ title, message }).slice(0, 4000), status: 'Pending', developmentMode: true, simulated: true } });
  } catch (_) { /* queue best-effort */ }
}

// ── Compliance filing reminders ──────────────────────────────────────────────
async function runComplianceReminders() {
  let checked = 0, sent = 0;
  const filings = await prisma.complianceFiling.findMany({ where: { status: { in: ['Pending', 'Overdue'] } } });
  for (const f of filings) {
    checked++;
    const { stage, cover } = stagePlan(daysUntil(f.dueDate));
    if (!stage) continue;
    const already = asArr(f.remindersSent);
    if (already.includes(stage)) continue;
    const when = stage === 'overdue' ? 'is OVERDUE' : `is due in ${stage} day(s) (${f.dueDate})`;
    const title = `Compliance ${stage === 'overdue' ? 'Overdue' : 'Due Soon'}: ${f.category}`;
    const message = `${f.category} — ${f.title} for ${f.periodLabel} ${when}.${f.amount ? ` Est. ₹${Math.round(f.amount)}.` : ''}`;
    const extra = [];
    if (f.assignedTo) { /* assignedTo is a name; managers already covered */ }
    await deliver({ companyId: f.companyId, title, message, emailSubject: title, extraUserIds: extra, queueLabel: `Compliance · ${f.category}` });
    await prisma.complianceFiling.update({ where: { id: f.id }, data: { remindersSent: [...new Set([...already, ...cover])] } });
    sent++;
  }
  return { checked, sent };
}

// ── Loan EMI reminders (next unpaid installment) ─────────────────────────────
async function runLoanReminders() {
  let checked = 0, sent = 0;
  const loans = await prisma.loan.findMany({ where: { status: { in: ['Approved', 'Disbursed', 'Running'] } } });
  for (const loan of loans) {
    checked++;
    const next = await prisma.loanInstallment.findFirst({ where: { loanId: loan.id, status: { not: 'Paid' } }, orderBy: { seq: 'asc' } });
    if (!next) continue;
    const due = next.dueDate || periodDueDate(next.periodMonth, next.periodYear);
    const { stage, cover } = stagePlan(daysUntil(due));
    if (!stage) continue;
    const already = asArr(loan.remindersSent);
    // Reminder key is stage + installment seq so a NEW installment reopens the cycle.
    const key = `${next.seq}:${stage}`;
    if (already.includes(key)) continue;
    const when = stage === 'overdue' ? 'is OVERDUE' : `is due in ${stage} day(s)`;
    const title = `Loan EMI ${stage === 'overdue' ? 'Overdue' : 'Reminder'}: ${loan.loanNumber}`;
    const message = `EMI #${next.seq} of ₹${Math.round(next.emiAmount)} for ${loan.employeeName}'s loan ${loan.loanNumber} ${when} (${due}).`;
    const empUser = await employeeUserFor(loan.employeeId);
    await deliver({ companyId: loan.companyId, employeeId: loan.employeeId, employeeName: loan.employeeName, extraUserIds: empUser?.id ? [empUser.id] : [], title, message, emailSubject: title, queueLabel: `Loan · ${loan.loanNumber}` });
    const coverKeys = cover.map((c) => `${next.seq}:${c}`);
    await prisma.loan.update({ where: { id: loan.id }, data: { remindersSent: [...new Set([...already, ...coverKeys])] } });
    sent++;
  }
  return { checked, sent };
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const c = await runComplianceReminders();
    const l = await runLoanReminders();
    state.ticks++; state.lastTickAt = new Date(); state.lastSent = c.sent + l.sent;
    if (c.sent + l.sent > 0) console.log(`[reminders] sent ${c.sent} compliance + ${l.sent} loan reminder(s)`);
  } catch (e) {
    console.error('[reminders] tick failed:', e.message);
  } finally { running = false; }
}

const start = () => {
  if (process.env.REMINDER_SCHEDULER === 'off') { console.log('[reminders] disabled via REMINDER_SCHEDULER=off'); return; }
  if (timer) return;
  state.startedAt = new Date();
  setTimeout(() => { tick(); timer = setInterval(tick, TICK_MS); }, 12000); // first pass after boot settles
  console.log('[reminders] scheduler started — every %sms', TICK_MS);
};
const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
const status = () => ({ ...state, enabled: process.env.REMINDER_SCHEDULER !== 'off', tickMs: TICK_MS });

module.exports = { start, stop, tick, status, runComplianceReminders, runLoanReminders, stagePlan, daysUntil };
