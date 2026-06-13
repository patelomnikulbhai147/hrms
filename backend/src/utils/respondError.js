/**
 * Centralised controller error responder.
 *
 * Goal: the API must NEVER answer a real failure with a vague "Server error".
 * It maps the actual cause (Prisma error codes, validation, auth) to a
 * user-friendly message and the correct HTTP status, while logging the full
 * technical detail server-side under a short Error ID so support can trace it.
 *
 *   - Frontend shows the friendly message (+ Error ID for unknown faults).
 *   - Backend log keeps the stack / Prisma meta for diagnosis.
 *
 * Usage in a controller catch block:
 *   } catch (error) {
 *     return respondError(res, error, { action: 'create user', resource: 'user' });
 *   }
 */

// Turn a Prisma "target" (the column(s) that violated a unique constraint) into
// a human label. Prisma reports e.g. meta.target = ['email'] or 'User_email_key'.
function fieldLabel(target) {
  if (!target) return 'value';
  const raw = Array.isArray(target) ? target.join(', ') : String(target);
  // Strip table/index decoration like "User_email_key" -> "email".
  const cleaned = raw
    .replace(/_key$/i, '')
    .replace(/^[A-Za-z]+_/, '')
    .replace(/_/g, ' ')
    .trim();
  return cleaned || 'value';
}

// Short, log-correlatable id (e.g. "ERR-LX9F2A"). Date/random are fine in the
// Node backend (this is not a workflow script).
function newErrorId() {
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  const t = Date.now().toString(36).slice(-4).toUpperCase();
  return `ERR-${t}${rnd}`;
}

/**
 * @param {import('express').Response} res
 * @param {any} error            the caught error
 * @param {object} [opts]
 * @param {string} [opts.action]   e.g. 'create user' — used in fallback message
 * @param {string} [opts.resource] e.g. 'user'        — used for not-found text
 */
function respondError(res, error, opts = {}) {
  const action = opts.action || 'complete the request';
  const resource = opts.resource || 'record';
  const code = error && error.code;

  // ── Known, explainable causes ────────────────────────────────────────────
  switch (code) {
    case 'P2002': // unique constraint
      return res.status(409).json({
        error: `A ${resource} with this ${fieldLabel(error.meta && error.meta.target)} already exists.`,
        code: 'DUPLICATE',
      });
    case 'P2025': // record not found (update/delete on missing row)
      return res.status(404).json({
        error: `The ${resource} you tried to ${action.replace(/^(create|add) /, 'modify ')} no longer exists.`,
        code: 'NOT_FOUND',
      });
    case 'P2003': // foreign key constraint
      return res.status(409).json({
        error: `Cannot ${action}: it references a related record that does not exist, or is still in use elsewhere.`,
        code: 'FK_CONSTRAINT',
      });
    case 'P2000': // value too long for column
      return res.status(400).json({
        error: `One of the values is too long for its field. Please shorten it and try again.`,
        code: 'VALUE_TOO_LONG',
      });
    case 'P2011': // null constraint violation
    case 'P2012': // missing required value
      return res.status(400).json({
        error: `A required field is missing. Please complete all required fields.`,
        code: 'REQUIRED_MISSING',
      });
    default:
      break;
  }

  // Prisma validation error (bad argument / wrong type) — almost always a
  // client-side payload problem, surface as 400 with the concise reason.
  if (error && (error.name === 'PrismaClientValidationError' || error.name === 'PrismaClientKnownRequestError')) {
    const concise = String(error.message || '').split('\n').filter(Boolean).pop();
    return res.status(400).json({
      error: `The data sent for this ${resource} was invalid. ${concise ? concise.trim() : ''}`.trim(),
      code: 'VALIDATION',
    });
  }

  // ── Unknown / unexpected fault: log full detail under an Error ID ─────────
  const errorId = newErrorId();
  console.error(`[${errorId}] Failed to ${action}:`, error);
  return res.status(500).json({
    error: `Unable to ${action} due to an unexpected error. Please try again. (Error ID: ${errorId})`,
    code: 'INTERNAL',
    errorId,
  });
}

module.exports = respondError;
module.exports.respondError = respondError;
