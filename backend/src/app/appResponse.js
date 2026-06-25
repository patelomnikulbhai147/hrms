/**
 * Standard response envelope for the Mobile App API (/api/app/*).
 * Every endpoint returns: { success, message, data, errors, timestamp }.
 * Completely separate from the website API response format.
 */
const ok = (res, data = {}, message = 'Success', status = 200) =>
  res.status(status).json({ success: true, message, data: data ?? {}, errors: [], timestamp: new Date().toISOString() });

const fail = (res, message = 'Request failed', { status = 400, code, errors } = {}) =>
  res.status(status).json({
    success: false,
    message,
    data: null,
    errors: Array.isArray(errors) && errors.length ? errors : (code ? [{ code, message }] : []),
    timestamp: new Date().toISOString(),
  });

module.exports = { ok, fail };
