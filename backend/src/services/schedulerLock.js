// ─────────────────────────────────────────────────────────────────────────────
// schedulerLock — a cross-process leader gate built on MySQL advisory locks.
//
// PM2 runs the backend in CLUSTER mode (multiple instances share one MySQL/RDS
// server). Every instance boots the same schedulers, so without coordination the
// SAME scheduled job fires from every instance every tick — harmless to the data
// (idempotent upserts) but it multiplies vendor API calls.
//
// MySQL's GET_LOCK(name, timeout) is a SERVER-WIDE named advisory lock: only one
// database SESSION on the whole server can hold a given name at once. That makes
// it a perfect zero-schema-change leader gate across PM2 instances that share a
// database. Crucially, the lock is released AUTOMATICALLY when the holding
// session's connection closes — so if the leader process crashes, another
// instance can acquire it on its very next tick (automatic failover).
//
// CONNECTION AFFINITY: GET_LOCK / RELEASE_LOCK are SESSION-scoped, but the shared
// PrismaClient pools connections, so GET_LOCK and its matching RELEASE_LOCK could
// land on different sessions — which silently leaks the lock. To guarantee both
// run on the SAME session we use a DEDICATED PrismaClient pinned to a pool of ONE
// connection. Only this module ever touches it, and it uses it serially, so the
// single pooled connection is the single lock-holding session.
//
// This module is additive and self-contained: it introduces no schema change and
// touches no existing table.
// ─────────────────────────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client');

// A dedicated single-connection client so GET_LOCK/RELEASE_LOCK share one session.
let lockClient = null;
function getLockClient() {
  if (lockClient) return lockClient;
  const base = process.env.DATABASE_URL || '';
  // Force connection_limit=1 (overriding whatever the app URL specifies) so this
  // client holds exactly one persistent MySQL session for the lock.
  let url = base;
  if (/([?&])connection_limit=\d+/.test(url)) {
    url = url.replace(/([?&])connection_limit=\d+/, '$1connection_limit=1');
  } else if (url) {
    url += (url.includes('?') ? '&' : '?') + 'connection_limit=1';
  }
  lockClient = new PrismaClient(url ? { datasources: { db: { url } } } : {});
  return lockClient;
}

// MySQL lock names are limited to 64 characters and are shared across the WHOLE
// server (every database), so keep them explicitly namespaced.
const clampName = (name) => String(name).slice(0, 64);

// Try to acquire the named lock without waiting. Returns true if this session now
// holds it, false if another session (another PM2 instance) already holds it.
async function tryAcquire(name) {
  const n = clampName(name);
  const rows = await getLockClient().$queryRaw`SELECT GET_LOCK(${n}, 0) AS ok`;
  return Number(rows && rows[0] && rows[0].ok) === 1;
}

// Release the named lock (no-op if this session doesn't hold it).
async function release(name) {
  const n = clampName(name);
  try { await getLockClient().$queryRaw`SELECT RELEASE_LOCK(${n}) AS ok`; }
  catch (_) { /* release must never throw into the caller's finally */ }
}

// Run `fn` only if this instance can acquire the named leader lock RIGHT NOW.
// Returns { acquired: boolean, result }. The lock is always released afterwards
// (per-tick leadership: non-sticky, so a crashed leader's next-tick successor is
// whichever instance grabs the freed lock first). If the process dies while
// holding it, MySQL frees it when the connection drops.
async function withLeadership(name, fn) {
  let acquired = false;
  try {
    acquired = await tryAcquire(name);
  } catch (e) {
    // If the lock backend itself is unreachable, do NOT run — better to skip a
    // tick than to run uncoordinated across instances.
    return { acquired: false, error: e.message };
  }
  if (!acquired) return { acquired: false };
  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    await release(name);
  }
}

async function disconnect() {
  if (lockClient) { try { await lockClient.$disconnect(); } catch (_) {} lockClient = null; }
}

for (const sig of ['SIGINT', 'SIGTERM', 'beforeExit']) {
  process.once(sig, () => { disconnect(); });
}

module.exports = { withLeadership, tryAcquire, release, disconnect, _getLockClient: getLockClient };
