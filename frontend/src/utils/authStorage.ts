/**
 * Remember-Me aware storage for authentication state.
 *
 * Strategy (chosen so an un-remembered session is NEVER dropped during normal
 * use — refresh, navigation, etc. — yet still ends when the browser closes):
 *
 *   • Auth state is ALWAYS written to localStorage. localStorage survives page
 *     refreshes, in-app navigation, and even hard reloads, so the user can never
 *     be unexpectedly logged out while actively using the app.
 *
 *   • A per-browser-session marker is kept in sessionStorage. sessionStorage is
 *     cleared by the browser only when the browser session ends (all tabs of the
 *     site closed) — not on refresh or navigation.
 *
 *   • At startup, initSession() runs once. If the last login was NOT "remember
 *     me" AND the session marker is gone (the browser was closed and reopened),
 *     the persisted auth is pruned — so an un-remembered session does not
 *     survive a browser restart. When "remember me" was chosen, the session is
 *     kept across restarts.
 *
 * Only the sensitive auth keys flow through here. Other UI prefs stay in
 * localStorage directly.
 */

const REMEMBER_FLAG = 'hrms_remember';
// sessionStorage-only flag marking that an authenticated browser session is
// active. Present across refresh/navigation; absent after the browser closes.
const SESSION_FLAG = 'hrms_session_active';
// Inactivity tracking + cross-tab logout signalling.
const LAST_ACTIVITY = 'hrms_last_activity';
const LOGOUT_EVENT = 'hrms_logout_event';
export const INACTIVITY_LIMIT_MS = 60 * 60 * 1000; // 60 minutes

// Keys that represent the authenticated session.
export const AUTH_KEYS = [
  'hrms_auth',
  'hrms_profile',
  'hrms_jwt_token',
] as const;

export const authStorage = {
  /** Persist the user's Remember Me choice and arm the active-session marker. */
  setRemember(remember: boolean) {
    localStorage.setItem(REMEMBER_FLAG, remember ? 'true' : 'false');
    // Mark this browser session active so the (localStorage-persisted) session
    // is treated as alive until the browser is actually closed.
    sessionStorage.setItem(SESSION_FLAG, '1');
  },

  /** Default to true so pre-existing sessions keep working after upgrade. */
  isRemember(): boolean {
    return localStorage.getItem(REMEMBER_FLAG) !== 'false';
  },

  set(key: string, value: string) {
    // Always persist to localStorage so refresh/navigation never lose the
    // session. Clear any stale copy left in sessionStorage by older builds.
    // Guarded so a storage failure (quota/private mode) can never crash the app.
    try { sessionStorage.removeItem(key); } catch (_) { /* ignore */ }
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn(`[authStorage] Could not persist "${key}" (${(err as any)?.name || 'error'}).`);
    }
  },

  get(key: string): string | null {
    const local = localStorage.getItem(key);
    if (local !== null) return local;
    // Backward-compat: read sessions written by older builds that used
    // sessionStorage as the primary store.
    return sessionStorage.getItem(key);
  },

  remove(key: string) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },

  /** Stamp "now" as the last user-activity time (shared across tabs). */
  markActivity() {
    try { localStorage.setItem(LAST_ACTIVITY, String(Date.now())); } catch (_) { /* ignore */ }
  },
  getLastActivity(): number {
    const v = Number(localStorage.getItem(LAST_ACTIVITY) || 0);
    return Number.isFinite(v) ? v : 0;
  },
  /** True once the user has been idle beyond the inactivity limit. */
  isExpiredByInactivity(): boolean {
    const last = this.getLastActivity();
    return last > 0 && Date.now() - last > INACTIVITY_LIMIT_MS;
  },
  /** Signal every other open tab to end its session too (multi-tab logout). */
  broadcastLogout(reason?: string) {
    try { localStorage.setItem(LOGOUT_EVENT, JSON.stringify({ t: Date.now(), reason: reason || 'logout' })); } catch (_) { /* ignore */ }
  },

  /** Wipe the entire authenticated session from both stores. */
  clearSession() {
    AUTH_KEYS.forEach((k) => this.remove(k));
    try { localStorage.removeItem(LAST_ACTIVITY); } catch (_) { /* ignore */ }
  },

  /**
   * Run ONCE at app startup, before any auth state is read.
   *
   * If the last login was not "remember me" and this is a fresh browser session
   * (the sessionStorage marker is gone because the browser was fully closed and
   * reopened), drop the persisted session. Within the same browser session the
   * marker is present, so refreshes and navigation keep the user signed in.
   */
  initSession() {
    const hasActiveSession = sessionStorage.getItem(SESSION_FLAG) === '1';
    // Session-only auth: a fresh browser session (the sessionStorage marker is
    // gone because the browser was fully closed) ALWAYS requires re-login —
    // remember-me no longer persists a login across browser restarts. An idle
    // session past the inactivity limit is also pruned at startup.
    if (!hasActiveSession || this.isExpiredByInactivity()) {
      this.clearSession();
    }
    // (Re)arm the marker for the current browser session.
    sessionStorage.setItem(SESSION_FLAG, '1');
  },
};
