// Central place to turn a caught API error into a user-facing message.
//
// The backend now returns specific, honest causes (duplicate email, validation,
// not-found, "Error ID: …", etc.) and apiFetch (api/apiClient.ts) tags genuine
// transport failures with `isNetworkError` / `isTimeout`. This helper picks the
// best message:
//   1. A real connectivity failure  -> "Server unavailable…" (the ONLY case where
//      "ensure the server is running" is the truthful explanation).
//   2. Otherwise the server's actual message (err.message).
//   3. A provided fallback, only if nothing else is available.
//
// Use this in catch blocks instead of hardcoding "Failed to … Ensure backend is
// running.", which was misleading whenever the real cause was a validation or
// duplicate error coming back with a perfectly good message.
export function getApiErrorMessage(err: any, fallback = 'Something went wrong. Please try again.'): string {
  if (!err) return fallback;

  if (err.isTimeout) {
    return 'The request timed out. The server took too long to respond — please try again.';
  }
  if (err.isNetworkError) {
    return 'Server unavailable. Please check that the server is running and try again.';
  }
  if (err.status === 401) {
    return err.message || 'Your session has expired. Please sign in again.';
  }
  if (err.status === 403) {
    return err.message || 'You do not have permission to perform this action.';
  }

  const msg = typeof err === 'string' ? err : (err.message || '').trim();
  if (msg && msg !== 'API request failed') return msg;

  return fallback;
}
