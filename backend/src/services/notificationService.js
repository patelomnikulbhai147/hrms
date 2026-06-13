/**
 * Notification service — the single helper every controller uses to emit a
 * notification. Persists to the DB so the bell (which polls) picks it up, and
 * supports per-user, per-branch and company-wide targeting.
 *
 *   notify({ userId, companyId, branchId, type, title, message, priority })
 *   notifyMany([userId, ...], { companyId, type, title, message })
 */
const prisma = require('../config/prisma');

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function notify({ userId, companyId, branchId, type, title, message, priority }) {
  try {
    return await prisma.notification.create({
      data: {
        userId: num(userId),
        companyId: num(companyId),
        branchId: num(branchId),
        type: type || 'system',
        title: title || null,
        message: message || '',
        priority: priority || 'medium',
        read: false,
        status: 'unread',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.warn('notify() failed:', e.message);
    return null;
  }
}

// Fan a single notification out to several target users (deduped).
async function notifyMany(userIds, base) {
  const ids = [...new Set((userIds || []).map(num).filter((x) => x != null))];
  const rows = [];
  for (const uid of ids) rows.push(await notify({ ...base, userId: uid }));
  return rows.filter(Boolean);
}

module.exports = { notify, notifyMany };
