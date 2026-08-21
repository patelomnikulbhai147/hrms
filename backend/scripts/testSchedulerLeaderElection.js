// ─────────────────────────────────────────────────────────────────────────────
// Leader-election + per-connection lease regression for the E-TimeOffice
// scheduler. Proves that with TWO PM2 instances (simulated here as two INDEPENDENT
// MySQL sessions — the same thing the cluster produces in production):
//
//   A. The server-wide advisory leader lock is mutually exclusive: only one
//      session can hold it at a time.
//   B. Failover: if the leader's connection dies (crash), the other session can
//      acquire the lock on its next attempt — no manual intervention.
//   C. The real schedulerLock.withLeadership() acquires, runs, and RELEASES
//      (a second independent session can grab it afterwards).
//   D. The per-connection time-lease claim is atomic: two instances racing on the
//      SAME due connection produce EXACTLY ONE winner (no double sync).
//   E. Lease expiration: after a claim the connection is no longer due until the
//      interval elapses; once it does, it becomes claimable again (crash recovery).
//   F. Fan-out: many connections raced by two instances → every connection is
//      claimed exactly once, and the two instances share the load.
//   G. Persistence untouched: a punch-less Absent re-sync still cannot overwrite a
//      saved Present, and no duplicate (employeeId,date) rows appear.
//   H. Tenant isolation: claiming company A's connection never touches company B.
//
// Self-cleaning: creates its own throwaway companies / employees / connections and
// deletes them at the end. Safe to run against any environment.
//
//   node scripts/testSchedulerLeaderElection.js
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = require('../src/config/prisma');
const scheduler = require('../src/services/etimeoffice/etimeScheduler');
const lock = require('../src/services/schedulerLock');
const sync = require('../src/services/etimeoffice/etimeSyncService');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { PASS++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
  else { FAIL++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};
const rec = (o) => ({ Empcode: '', Name: '', INTime: '', OUTTime: '', WorkTime: '', OverTime: '', Status: '', Late_In: '', Erl_Out: '', Remark: '', DateString: '', ...o });

// Build a fresh single-connection client = one independent MySQL session = one
// simulated PM2 instance. (In production each PM2 process has its own such session
// inside schedulerLock.js.)
function makeInstance() {
  const base = process.env.DATABASE_URL || '';
  let url = base;
  if (/([?&])connection_limit=\d+/.test(url)) url = url.replace(/([?&])connection_limit=\d+/, '$1connection_limit=1');
  else if (url) url += (url.includes('?') ? '&' : '?') + 'connection_limit=1';
  return new PrismaClient(url ? { datasources: { db: { url } } } : {});
}
const getLock = (cli, name) => cli.$queryRaw`SELECT GET_LOCK(${name}, 0) AS ok`.then(r => Number(r?.[0]?.ok) === 1);
const relLock = (cli, name) => cli.$queryRaw`SELECT RELEASE_LOCK(${name}) AS ok`.then(r => r?.[0]?.ok);
const isFree = (cli, name) => cli.$queryRaw`SELECT IS_FREE_LOCK(${name}) AS f`.then(r => Number(r?.[0]?.f));

const LOCK = 'zeniahr:test:leader:' + process.pid;

(async () => {
  const A = makeInstance();  // "PM2 instance A"
  const B = makeInstance();  // "PM2 instance B"

  // Throwaway fixtures.
  const co = await prisma.company.create({ data: { name: 'QA-LEADER-' + Date.now(), plan: 'Enterprise' } });
  const co2 = await prisma.company.create({ data: { name: 'QA-LEADER2-' + Date.now(), plan: 'Enterprise' } });
  const emp = await prisma.employee.create({ data: {
    companyId: co.id, employeeId: 'LEAD-1', biometricId: 'LB1', name: 'Lease Test',
    email: 'lease' + Date.now() + '@qa.local', department: 'Ops', designation: 'X',
    salary: 1000, status: 'Active', joinDate: new Date('2024-01-01'),
  } });
  const OLD = new Date(Date.now() - 60 * 60000); // 60 min ago → clearly due
  const conn = await prisma.etimeConnection.create({ data: {
    companyId: co.id, enabled: true, corporateId: 'X', apiUsername: 'u', apiPassword: 'p',
    syncIntervalMinutes: 30, lastSyncAt: OLD,
  } });
  const conn2 = await prisma.etimeConnection.create({ data: {
    companyId: co2.id, enabled: true, corporateId: 'X', apiUsername: 'u', apiPassword: 'p',
    syncIntervalMinutes: 30, lastSyncAt: OLD,
  } });

  const cleanup = async () => {
    await relLock(A, LOCK).catch(() => {});
    await relLock(B, LOCK).catch(() => {});
    await prisma.attendance.deleteMany({ where: { employeeId: emp.id } }).catch(() => {});
    await prisma.etimeConnection.deleteMany({ where: { companyId: { in: [co.id, co2.id] } } }).catch(() => {});
    await prisma.employee.deleteMany({ where: { companyId: co.id } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: { in: [co.id, co2.id] } } }).catch(() => {});
    await A.$disconnect().catch(() => {});
    await B.$disconnect().catch(() => {});
    await lock.disconnect().catch(() => {});
  };

  try {
    // ── A. Mutual exclusion ──────────────────────────────────────────────────
    console.log('\nA) Leader lock mutual exclusion (two instances):');
    const aGot = await getLock(A, LOCK);
    const bGot = await getLock(B, LOCK);
    ok('instance A acquires the leader lock', aGot === true);
    ok('instance B is REFUSED while A holds it', bGot === false);
    const bFreeView = await isFree(B, LOCK);
    ok('lock reads as held server-wide (IS_FREE_LOCK=0)', bFreeView === 0, `isFree=${bFreeView}`);

    // ── B. Failover on crash (holder session dies) ───────────────────────────
    console.log('\nB) Failover — leader "crashes" (its connection closes):');
    await A.$disconnect();                 // simulate PM2 instance A dying
    // MySQL frees any lock held by a session when that session's connection drops.
    let bGot2 = false;
    for (let i = 0; i < 20 && !bGot2; i++) { bGot2 = await getLock(B, LOCK); if (!bGot2) await new Promise(r => setTimeout(r, 100)); }
    ok('instance B acquires the lock after A crashes (auto-failover)', bGot2 === true);
    await relLock(B, LOCK);

    // ── C. The real module: withLeadership acquires + releases ────────────────
    console.log('\nC) schedulerLock.withLeadership() acquire → run → release:');
    let ranInside = false, heldDuringRun = null;
    const r = await lock.withLeadership(LOCK, async () => {
      ranInside = true;
      heldDuringRun = await isFree(B, LOCK); // another session sees it held
      return 42;
    });
    ok('withLeadership acquired and ran fn', r.acquired === true && ranInside && r.result === 42);
    ok('lock was actually held during fn (other session saw IS_FREE_LOCK=0)', heldDuringRun === 0, `isFree=${heldDuringRun}`);
    const bAfter = await getLock(B, LOCK);
    ok('lock is RELEASED after withLeadership returns (B can grab it)', bAfter === true);
    await relLock(B, LOCK);

    // ── D. Per-connection claim is atomic under a race ────────────────────────
    console.log('\nD) Per-connection lease claim — two instances race the SAME connection:');
    const snap = await prisma.etimeConnection.findUnique({ where: { id: conn.id } });
    // Both "instances" read the same snapshot, then race to claim.
    const [c1, c2] = await Promise.all([
      scheduler.claimConnection(snap),
      scheduler.claimConnection(snap),
    ]);
    ok('exactly ONE instance wins the claim (no double sync)', (c1 ? 1 : 0) + (c2 ? 1 : 0) === 1, `A=${c1} B=${c2}`);
    const afterClaim = await prisma.etimeConnection.findUnique({ where: { id: conn.id } });
    ok('lastSyncAt advanced to the claim time', afterClaim.lastSyncAt.getTime() > OLD.getTime());
    // A third claim on the STALE snapshot must now fail (already claimed).
    const c3 = await scheduler.claimConnection(snap);
    ok('re-claim on a stale snapshot is refused', c3 === false);

    // ── E. Lease expiration → re-claimable after the interval ─────────────────
    console.log('\nE) Lease expiration / crash recovery:');
    const nowDue = await prisma.etimeConnection.findUnique({ where: { id: conn.id } });
    ok('connection NOT due immediately after a claim (lease active)', scheduler.isDue(nowDue, Date.now()) === false);
    // Simulate the interval elapsing (or the claimer having crashed a while ago):
    await prisma.etimeConnection.update({ where: { id: conn.id }, data: { lastSyncAt: OLD } });
    const expired = await prisma.etimeConnection.findUnique({ where: { id: conn.id } });
    ok('connection due again once the lease has expired', scheduler.isDue(expired, Date.now()) === true);
    const reclaim = await scheduler.claimConnection(expired);
    ok('an instance can re-claim after expiration (failover)', reclaim === true);

    // ── F. Fan-out: every connection claimed exactly once, load shared ────────
    console.log('\nF) Fan-out — two instances race a batch of due connections:');
    // Reset both test connections to due.
    await prisma.etimeConnection.updateMany({ where: { companyId: { in: [co.id, co2.id] } }, data: { lastSyncAt: OLD } });
    const dueConns = await prisma.etimeConnection.findMany({ where: { companyId: { in: [co.id, co2.id] }, enabled: true } });
    // Instance A and instance B both iterate the same due list concurrently.
    const claimAll = async (label) => {
      const won = [];
      for (const cn of dueConns) { if (await scheduler.claimConnection(cn)) won.push(cn.companyId); }
      return { label, won };
    };
    const [ra, rb] = await Promise.all([claimAll('A'), claimAll('B')]);
    const total = ra.won.length + rb.won.length;
    const overlap = ra.won.filter((x) => rb.won.includes(x));
    ok('each due connection claimed exactly once across both instances', total === dueConns.length && overlap.length === 0,
      `A=${JSON.stringify(ra.won)} B=${JSON.stringify(rb.won)}`);

    // ── G. Persistence untouched by these changes ─────────────────────────────
    console.log('\nG) Persistence guard still holds (no Present→Absent, no dup rows):');
    const D = '15/08/2026', ISO = '2026-08-15';
    const get = () => prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: ISO } } });
    await sync.importOne(prisma, co.id, emp, rec({ Empcode: 'LB1', INTime: '09:30', OUTTime: '18:00', Status: 'P', DateString: D }));
    let att = await get();
    ok('initial punch → Present', att && att.status === 'Present' && att.clockIn === '09:30', `${att?.status}/${att?.clockIn}`);
    const outc = await sync.importOne(prisma, co.id, emp, rec({ Empcode: 'LB1', INTime: '--:--', OUTTime: '--:--', Status: 'A', DateString: D }));
    att = await get();
    ok('punch-less Absent re-sync PRESERVES Present', outc === 'skipped' && att.status === 'Present');
    const dupes = await prisma.attendance.groupBy({ by: ['employeeId', 'date'], where: { employeeId: emp.id }, _count: { _all: true } });
    ok('no duplicate (employeeId,date) rows', dupes.every((g) => g._count._all === 1), `groups=${dupes.length}`);

    // ── H. Tenant isolation ───────────────────────────────────────────────────
    console.log('\nH) Tenant isolation — claiming company A never touches company B:');
    await prisma.etimeConnection.updateMany({ where: { companyId: { in: [co.id, co2.id] } }, data: { lastSyncAt: OLD } });
    const snapA = await prisma.etimeConnection.findUnique({ where: { id: conn.id } });
    const before2 = await prisma.etimeConnection.findUnique({ where: { id: conn2.id } });
    await scheduler.claimConnection(snapA);
    const after2 = await prisma.etimeConnection.findUnique({ where: { id: conn2.id } });
    ok("company B's connection is unchanged when company A is claimed",
      after2.lastSyncAt.getTime() === before2.lastSyncAt.getTime());
  } catch (e) {
    console.error('FATAL during tests:', e);
    FAIL++;
  } finally {
    await cleanup();
  }

  console.log(`\nSCHEDULER LEADER ELECTION: ${PASS} passed, ${FAIL} failed`);
  await prisma.$disconnect();
  process.exit(FAIL ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e); try { await prisma.$disconnect(); } catch (_) {} process.exit(1); });
