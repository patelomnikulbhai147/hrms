// ===========================================================================
// Guarded localStorage helpers.
//
// A storage write must NEVER crash the UI. Quota exhaustion, private-browsing
// mode, or storage being disabled should all degrade gracefully — the app
// re-fetches whatever it needs from the backend, so a failed cache write is
// harmless.
//
// IMPORTANT: large datasets (payroll, employees, attendance, leaves, documents,
// reports, …) must NOT be persisted in localStorage at all — that is what
// triggered `QuotaExceededError` (the 5–10 MB limit) after offboarding. Only
// lightweight session/preference data belongs here (token, theme, language,
// active workspace id, small caches). Everything else loads from the backend.
// ===========================================================================

// Legacy keys that older builds cached as multi-MB JSON blobs. They are never
// read back any more, so we prune them to reclaim quota.
export const LEGACY_LARGE_KEYS = [
  'hrms_employees',
  'hrms_payroll',
  'hrms_leaves',
  'hrms_documents',
  'hrms_attendance',
];

/** Remove the legacy large dataset caches. Best-effort, never throws. */
export function pruneLargeLegacyCaches(): void {
  for (const key of LEGACY_LARGE_KEYS) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

/**
 * Write a string to localStorage without ever throwing. Returns true on
 * success. On QuotaExceededError it prunes legacy blobs and retries once so an
 * essential write (token, workspace id, theme) can still land.
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    const name = (err as { name?: string } | null)?.name || 'Error';
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      // A stale large blob likely filled the quota — free it and retry once.
      pruneLargeLegacyCaches();
      try {
        localStorage.setItem(key, value);
        return true;
      } catch { /* fall through to graceful skip */ }
    }
    console.warn(`[safeStorage] Skipped persisting "${key}" (${name}); continuing without local cache.`);
    return false;
  }
}

/** JSON.stringify + safeSetItem. Never throws (stringify failures are swallowed). */
export function safeSetJSON(key: string, value: unknown): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch (err) {
    console.warn(`[safeStorage] Could not serialize "${key}"; skipping persist.`, err);
    return false;
  }
  return safeSetItem(key, serialized);
}
