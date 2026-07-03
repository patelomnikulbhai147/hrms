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

const TICK_MS = Number(process.env.ETIME_TICK_MS) || 60000; // check due connections every minute

let timer = null;
let running = false;
const state = { startedAt: null, lastTickAt: null, lastTickDue: 0, ticks: 0, lastError: null };

// Due when there has never been a sync, or the interval has elapsed since the
// last one. A small negative skew guard (5s) avoids missing a tick on rounding.
const isDue = (conn, now) => {
  if (!conn.enabled) return false;
  if (!conn.corporateId || !conn.apiUsername || !conn.apiPassword) return false; // not configured
  const interval = Math.max(1, Number(conn.syncIntervalMinutes) || 30) * 60000;
  if (!conn.lastSyncAt) return true;
  return (now - new Date(conn.lastSyncAt).getTime()) >= (interval - 5000);
};

const tick = async () => {
  if (running) return;
  running = true;
  let due = 0;
  try {
    const now = Date.now();
    const conns = await prisma.etimeConnection.findMany({ where: { enabled: true } });
    for (const conn of conns) {
      try {
        if (!isDue(conn, now)) continue;
        due++;
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
    state.lastError = null;
  } catch (e) {
    state.lastError = e.message;
    console.error('[etime][scheduler] tick error:', e.message);
  } finally {
    state.ticks++; state.lastTickAt = new Date(); state.lastTickDue = due;
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
const status = () => ({ ...state, enabled: process.env.ETIME_SYNC_SCHEDULER !== 'off', tickMs: TICK_MS });

module.exports = { start, stop, tick, status, isDue };
