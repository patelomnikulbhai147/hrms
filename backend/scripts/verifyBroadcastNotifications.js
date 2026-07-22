/**
 * Regression test — Broadcast & Notification, end to end.
 *
 * Drives the real HTTP API and then asserts against the DATABASE, not the API
 * echo, because the reported bug was precisely a dispatch that looked successful
 * while nothing was delivered.
 *
 * Pins:
 *   • a broadcast creates one row PER RECIPIENT (shared rows cannot hold per-user
 *     read state — the first reader would clear it for the whole company);
 *   • the dispatcher sees it in their own bell feed;
 *   • marking read affects ONLY that recipient's copy;
 *   • an audience with no logins is a 422, never a false success;
 *   • another tenant receives nothing, and cannot read or delete these rows.
 *
 * Cleans up everything it creates.
 *
 *   node backend/scripts/verifyBroadcastNotifications.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000/api';
const SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

let passed = 0, failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
};
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const tok = (u) => jwt.sign({ id: u.id }, SECRET, { expiresIn: '10m' });
const hdr = (u) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tok(u)}` });

const MARK = `QA-BROADCAST-${Date.now()}`;

(async () => {
  console.log('Broadcast → notification bell\n');

  // A company that actually has more than one login, so "delivered to everyone"
  // is distinguishable from "delivered to just the sender".
  const grouped = await prisma.user.groupBy({
    by: ['companyId'], where: { companyId: { not: null }, status: 'Active' },
    _count: { _all: true }, orderBy: { _count: { companyId: 'desc' } },
  });
  const target = grouped.find((g) => g._count._all > 1) || grouped[0];
  const companyId = target.companyId;

  // "All Staff" means the selected company AND its branches — branch users carry
  // the branch id as their companyId. Computed here independently of the server.
  const ownBranchIds = (await prisma.branch.findMany({ where: { companyId }, select: { id: true } })).map((b) => b.id);
  const staff = await prisma.user.findMany({
    where: { companyId: { in: [companyId, ...ownBranchIds] }, status: 'Active' },
    select: { id: true, email: true, role: true, companyId: true, accessibleCompanyIds: true },
  });
  const sender = staff.find((u) => ['Company Head', 'HR', 'Admin'].includes(u.role));
  if (!sender) throw new Error(`no Company Head/HR in company ${companyId} to broadcast as`);

  // A user of a genuinely different tenant — one whose grants do NOT include the
  // broadcasting company. (Company and branch ids share one sequence, and grants
  // are per user, so "different companyId" alone is not enough.)
  const all = await prisma.user.findMany({
    where: { role: { not: 'Super Admin' }, status: 'Active' },
    select: { id: true, email: true, role: true, companyId: true, accessibleCompanyIds: true },
  });
  const branchIds = ownBranchIds;
  const reaches = (u) => {
    const grants = [u.companyId, ...(Array.isArray(u.accessibleCompanyIds) ? u.accessibleCompanyIds.map(Number) : [])];
    return grants.includes(companyId) || grants.some((g) => branchIds.includes(g));
  };
  const outsider = all.find((u) => !reaches(u));

  console.log(`company ${companyId}: ${staff.length} active login(s); sender ${sender.email} (${sender.role})`);
  console.log(outsider ? `outsider: ${outsider.email} (company ${outsider.companyId})\n` : 'outsider: none available\n');

  // ── the panel's own path: audience "all" ────────────────────────────────────
  const res = await fetch(`${BASE}/notifications/broadcast`, {
    method: 'POST', headers: hdr(sender),
    body: JSON.stringify({ message: MARK, audience: 'all', companyId }),
  });
  const body = await j(res);
  check('dispatching a broadcast succeeds', res.status === 201,
    res.status === 201 ? `${body.recipients} recipient(s)` : `${res.status} ${String(body.error || '').slice(0, 70)}`);
  if (res.status !== 201) throw new Error('cannot continue — the broadcast was not accepted');

  // ── it reached the database, one row per recipient ──────────────────────────
  const rows = await prisma.notification.findMany({ where: { message: MARK } });
  check('a row is stored for every active login in the company',
    rows.length === staff.length, `${rows.length} row(s) for ${staff.length} login(s)`);
  check('every row names an individual recipient',
    rows.length > 0 && rows.every((r) => r.userId != null), 'userId set on each');
  check('every row is scoped to the broadcasting company',
    rows.every((r) => r.companyId === companyId));
  check('every row starts unread',
    rows.every((r) => r.read === false && r.status === 'unread'));

  // ── the bell actually shows it ──────────────────────────────────────────────
  const feed = await j(await fetch(`${BASE}/notifications`, { headers: hdr(sender) }));
  const mine = Array.isArray(feed) ? feed.find((n) => n.message === MARK) : null;
  check('the sender sees it in their own notification feed', !!mine,
    mine ? `title "${mine.title}"` : 'absent from GET /notifications');
  check('it carries a title, a type and a timestamp',
    !!mine && mine.title === 'Broadcast' && mine.type === 'broadcast' && !!mine.timestamp);
  check('it is the newest item in the feed',
    Array.isArray(feed) && feed.length > 0 && feed[0].message === MARK);

  // ── read state is per recipient ─────────────────────────────────────────────
  const other = staff.find((u) => u.id !== sender.id);
  if (other && mine) {
    await fetch(`${BASE}/notifications/${mine.id}`, { method: 'PUT', headers: hdr(sender), body: JSON.stringify({ read: true }) });
    const senderRow = await prisma.notification.findUnique({ where: { id: mine.id } });
    const otherRow = await prisma.notification.findFirst({ where: { message: MARK, userId: other.id } });
    check('marking read updates the sender\'s copy', senderRow?.read === true);
    check('marking read does NOT clear it for the other recipient', otherRow?.read === false,
      otherRow?.read === false ? `${other.email} still unread` : 'read state leaked across users');
  } else {
    console.log('  SKIP  only one login in this company — per-user read state not exercised');
  }

  // ── an audience nobody can receive must not report success ──────────────────
  const empty = await fetch(`${BASE}/notifications/broadcast`, {
    method: 'POST', headers: hdr(sender),
    body: JSON.stringify({ message: `${MARK}-EMPTY`, audience: 'department', department: `__no_such_dept_${Date.now()}`, companyId }),
  });
  const emptyBody = await j(empty);
  check('a broadcast with no recipients is refused, not silently dropped',
    empty.status === 422 && emptyBody.code === 'NO_RECIPIENTS', `status ${empty.status}`);
  check('and nothing was written for it',
    (await prisma.notification.count({ where: { message: `${MARK}-EMPTY` } })) === 0);

  // ── validation ──────────────────────────────────────────────────────────────
  const blank = await fetch(`${BASE}/notifications/broadcast`, {
    method: 'POST', headers: hdr(sender), body: JSON.stringify({ message: '   ', audience: 'all', companyId }),
  });
  check('an empty message is rejected', blank.status === 400, `status ${blank.status}`);

  const bogus = await fetch(`${BASE}/notifications/broadcast`, {
    method: 'POST', headers: hdr(sender), body: JSON.stringify({ message: 'x', audience: 'everyone', companyId }),
  });
  check('an unknown audience is rejected', bogus.status === 400, `status ${bogus.status}`);

  // ── tenant isolation ────────────────────────────────────────────────────────
  if (outsider && mine) {
    const theirFeed = await j(await fetch(`${BASE}/notifications`, { headers: hdr(outsider) }));
    const leaked = Array.isArray(theirFeed) && theirFeed.some((n) => n.message === MARK);
    check('another tenant does not receive the broadcast', !leaked,
      leaked ? `LEAKED to ${outsider.email}` : '');

    const steal = await fetch(`${BASE}/notifications/${mine.id}`, {
      method: 'PUT', headers: hdr(outsider), body: JSON.stringify({ read: true }),
    });
    check('another tenant cannot mark it read', steal.status === 404, `status ${steal.status}`);

    const nuke = await fetch(`${BASE}/notifications/${mine.id}`, { method: 'DELETE', headers: hdr(outsider) });
    const survived = await prisma.notification.findUnique({ where: { id: mine.id } });
    check('another tenant cannot delete it', nuke.status === 404 && !!survived, `status ${nuke.status}`);

    const bulk = await fetch(`${BASE}/notifications/delete-many`, {
      method: 'POST', headers: hdr(outsider), body: JSON.stringify({ ids: rows.map((r) => r.id) }),
    });
    const stillThere = await prisma.notification.count({ where: { message: MARK } });
    check('nor delete them in bulk', stillThere === rows.length,
      `${stillThere}/${rows.length} survived (status ${bulk.status})`);
  } else {
    console.log('  SKIP  no separate tenant available to test isolation with');
  }

  // ── an Employee may not broadcast ───────────────────────────────────────────
  const emp = all.find((u) => u.role === 'Employee');
  if (emp) {
    const forbidden = await fetch(`${BASE}/notifications/broadcast`, {
      method: 'POST', headers: hdr(emp), body: JSON.stringify({ message: 'nope', audience: 'all' }),
    });
    check('an Employee cannot send a broadcast', forbidden.status === 403, `status ${forbidden.status}`);
  } else {
    console.log('  SKIP  no Employee-role login to test the role gate with');
  }

  const removed = await prisma.notification.deleteMany({ where: { message: { startsWith: MARK } } });
  console.log(`\ncleaned up ${removed.count} notification(s)`);

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('\nFAILED:', e.message);
  await prisma.notification.deleteMany({ where: { message: { startsWith: MARK } } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
