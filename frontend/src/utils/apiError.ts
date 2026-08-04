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

/**
 * Pull per-field validation errors out of a rejected request.
 *
 * The server answers a failed mandatory-field check with 422
 * `{ code: 'VALIDATION_FAILED', errors: { fieldName: message } }` (see
 * backend/src/utils/employeeRequiredFields.js). Feeding that straight back into
 * the form's error state marks the exact inputs that were refused, instead of
 * collapsing everything into one toast.
 *
 * Returns `{}` when the failure was not a field-validation failure.
 */
export function getApiFieldErrors(err: any): Record<string, string> {
  const data = err?.data || err?.response?.data;
  const errors = data?.errors;
  if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return {};
  return Object.fromEntries(
    Object.entries(errors).filter(([, v]) => typeof v === 'string')
  ) as Record<string, string>;
}
