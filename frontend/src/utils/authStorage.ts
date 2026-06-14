/**
 * Remember-Me aware storage for authentication state.
 *
 * When "Remember me" is checked the session is written to localStorage so it
 * survives a browser restart. When unchecked it is written to sessionStorage so
 * it is cleared automatically when the tab/browser closes. Reads transparently
 * fall back across both stores, and writes keep the two in sync (a value only
 * ever lives in one place at a time).
 *
 * Only the sensitive auth keys flow through here. Other UI prefs stay in
 * localStorage directly.
 */

const REMEMBER_FLAG = 'hrms_remember';

// Keys that represent the authenticated session.
export const AUTH_KEYS = [
  'hrms_auth',
  'hrms_profile',
  'hrms_jwt_token',
] as const;

export const authStorage = {
  /** Persist the user's Remember Me choice. */
  setRemember(remember: boolean) {
    localStorage.setItem(REMEMBER_FLAG, remember ? 'true' : 'false');
  },

  /** Default to true so pre-existing sessions keep working after upgrade. */
  isRemember(): boolean {
    return localStorage.getItem(REMEMBER_FLAG) !== 'false';
  },

  /** The store to write new auth values into, based on the Remember Me flag. */
  primary(): Storage {
    return this.isRemember() ? localStorage : sessionStorage;
  },

  set(key: string, value: string) {
    const primary = this.primary();
    const secondary = primary === localStorage ? sessionStorage : localStorage;
    secondary.removeItem(key); // never keep a stale copy in the other store
    primary.setItem(key, value);
  },

  get(key: string): string | null {
    const local = localStorage.getItem(key);
    if (local !== null) return local;
    return sessionStorage.getItem(key);
  },

  remove(key: string) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },

  /** Wipe the entire authenticated session from both stores. */
  clearSession() {
    AUTH_KEYS.forEach((k) => this.remove(k));
  },
};
