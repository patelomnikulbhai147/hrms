// ─────────────────────────────────────────────────────────────────────────────
// etimeScheduler — autonomous E-TimeOffice pull sync.
//
// Every tick it loads all ENABLED per-company connections and, for each one whose
// configured interval has elapsed since its last sync, runs etimeSyncService in
// 'scheduler' mode. Mirrors automationScheduler: a re-entrancy guard prevents
// overlapping ticks, and per-company errors are isolated so one company's failure
// never blocks the others. Disable entirely with env ETIME_SYNC_SCHEDULER=off.
//
// Idempotency is guaranteed downstream: runSync upserts on (employeeId, date), so
// a catch-up / overlapping window never creates duplicate attendance.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../../config/prisma');
const { runSync } = require('./etimeSyncService');
const { withLeadership } = require('../schedulerLock');

const TICK_MS = Number(process.env.ETIME_TICK_MS) || 60000; // check due connections every minute

// Server-wide leader lock name. Shared across every PM2 instance on this DB, so
// only one instance runs a scheduled tick at a time (see schedulerLock.js).
const LEADER_LOCK = 'zeniahr:etime:scheduler';

let timer = null;
let running = false;
const state = { startedAt: null, lastTickAt: null, lastTickDue: 0, lastTickClaimed: 0, ticks: 0, leaderTicks: 0, followerTicks: 0, lastWasLeader: null, lastError: null };

// Due when there has never been a sync, or the interval has elapsed since the
// last one. A small negative skew guard (5s) avoids missing a tick on rounding.
const isDue = (conn, now) => {
  if (!conn.enabled) return false;
  if (!conn.corporateId || !conn.apiUsername || !conn.apiPassword) return false; // not configured
  const interval = Math.max(1, Number(conn.syncIntervalMinutes) || 30) * 60000;
  if (!conn.lastSyncAt) return true;
  return (now - new Date(conn.lastSyncAt).getTime()) >= (interval - 5000);
};

// ── Per-connection time-lease (the "lease with expiration") ──────────────────
// Atomically CLAIM a due connection by bumping lastSyncAt from the exact value we
// read to `now`. MySQL row-locks serialize the two racing UPDATEs, so exactly one
// caller's WHERE still matches → exactly one claim succeeds. This is the second,
// finer-grained guard beneath the leader lock: even if leadership flaps between
// instances at a tick boundary, the SAME company can never be synced twice within
// one interval. The lease "expires" naturally after syncIntervalMinutes — if the
// claimer crashes mid-sync, the connection simply becomes due again next interval
// and any instance re-claims it. Returns true if THIS caller won the claim.
const claimConnection = async (conn) => {
  const res = await prisma.etimeConnection.updateMany({
    where: {
      id: conn.id,
      enabled: true,
      // Compare-and-set on the timestamp we read a moment ago. `null` and the
      // read value are the only two states that mean "not yet claimed by anyone
      // since our snapshot".
      lastSyncAt: conn.lastSyncAt === null ? null : new Date(conn.lastSyncAt),
    },
    data: { lastSyncAt: new Date() },
  });
  return res.count === 1;
};

// The actual work of one tick — runs ONLY on the instance that holds leadership.
const runTick = async () => {
  let claimed = 0;
  const now = Date.now();
  const conns = await prisma.etimeConnection.findMany({ where: { enabled: true } });
  for (const conn of conns) {
    try {
      if (!isDue(conn, now)) continue;
      // Lease claim: skip if another instance already grabbed this connection.
      if (!(await claimConnection(conn))) {
        console.log('[etime][scheduler] company %s already claimed by another instance — skipping', conn.companyId);
        continue;
      }
      claimed++;
      const result = await runSync(conn.companyId, { trigger: 'scheduler' });
      if (result.ok) {
        const s = result.summary;
        console.log('[etime][scheduler] company %s synced → fetched=%s imported=%s updated=%s unmatched=%s duplicates=%s failed=%s (%sms)',
          conn.companyId, s.fetched, s.imported, s.updated, s.unmatched, s.duplicates, s.failed, s.durationMs);
      } else {
        console.warn('[etime][scheduler] company %s sync failed: %s', conn.companyId, result.error);
      }
    } catch (e) {
      console.error('[etime][scheduler] company %s error: %s', conn.companyId, e.message);
    }
  }
  return claimed;
};

const tick = async () => {
  if (running) return;            // in-process re-entrancy guard (no overlapping ticks)
  running = true;
  let claimed = 0, wasLeader = false;
  try {
    // Cross-process leader gate: only the instance that acquires the server-wide
    // advisory lock runs the tick body; the rest skip this tick entirely.
    const { acquired, result, error } = await withLeadership(LEADER_LOCK, runTick);
    wasLeader = acquired;
    if (error) throw new Error('leader lock unavailable: ' + error);
    if (acquired) { claimed = result || 0; state.leaderTicks++; }
    else { state.followerTicks++; }
    state.lastError = null;
  } catch (e) {
    state.lastError = e.message;
    console.error('[etime][scheduler] tick error:', e.message);
  } finally {
    state.ticks++; state.lastTickAt = new Date(); state.lastTickClaimed = claimed; state.lastWasLeader = wasLeader;
    running = false;
  }
};

const start = () => {
  if (process.env.ETIME_SYNC_SCHEDULER === 'off') { console.log('[etime][scheduler] disabled via ETIME_SYNC_SCHEDULER=off'); return; }
  if (timer) return;
  state.startedAt = new Date();
  // First tick shortly after boot (let the app settle), then every TICK_MS.
  setTimeout(() => { tick(); timer = setInterval(tick, TICK_MS); }, 8000);
  console.log('[etime][scheduler] started — checking due connections every %sms', TICK_MS);
};

const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
const status = () => ({ ...state, enabled: process.env.ETIME_SYNC_SCHEDULER !== 'off', tickMs: TICK_MS, leaderLock: LEADER_LOCK });

module.exports = { start, stop, tick, status, isDue, claimConnection, runTick };
