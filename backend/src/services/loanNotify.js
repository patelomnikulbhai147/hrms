// ── Loan notifications ───────────────────────────────────────────────────────
// Emits REAL in-app notifications (to the employee's linked user + the company's
// HR / Company Head) and best-effort QUEUES an external-channel row (Email/SMS/
// WhatsApp) via the existing Phase-1 (simulated, non-sending) WhatsApp queue.
// Fully guarded — a notification failure can NEVER break the loan/payroll flow.
const prisma = require('../config/prisma');
const { notify } = require('./notificationService');

async function notifyLoanEvent({ companyId, employeeId, employeeName, type = 'loan', title, message, priority = 'medium', queueExternal = true }) {
  try {
    const cid = Number(companyId) || null;

    // In-app → the employee's own login (if they have one)…
    if (employeeId) {
      const u = await prisma.user.findFirst({ where: { employeeId: Number(employeeId) }, select: { id: true } }).catch(() => null);
      if (u?.id) await notify({ userId: u.id, companyId: cid, type, title, message, priority });
    }
    // …and every HR / Company Head of the company.
    if (cid) {
      const mgrs = await prisma.user.findMany({ where: { companyId: cid, role: { in: ['HR', 'Company Head'] } }, select: { id: true } }).catch(() => []);
      for (const m of mgrs) await notify({ userId: m.id, companyId: cid, type, title, message, priority });
    }

    // Queued external channel (Phase-1 simulated — no real send yet).
    if (queueExternal && cid) {
      await prisma.whatsAppQueue.create({
        data: {
          companyId: cid,
          employeeId: employeeId ? Number(employeeId) : null,
          employeeName: employeeName || null,
          templateName: `Loan · ${title || type}`,
          payload: JSON.stringify({ event: type, title, message }).slice(0, 4000),
          status: 'Pending', developmentMode: true, simulated: true,
        },
      }).catch(() => { /* queue is best-effort */ });
    }
  } catch (e) {
    console.warn('notifyLoanEvent failed:', e.message);
  }
}

module.exports = { notifyLoanEvent };
