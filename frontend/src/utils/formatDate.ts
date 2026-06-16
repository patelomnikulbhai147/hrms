// Canonical date display for the whole app. Converts raw ISO timestamps and
// date-only strings (e.g. "2022-11-01T00:00:00.000Z" or "2022-11-01") to the
// enterprise display format "01-Nov-2022". Returns a dash for empty/invalid
// values so tables never show "null"/"Invalid Date".
//
// IMPORTANT: use this ONLY for DISPLAY. Never feed the result back into an
// <input type="date">, which requires the raw "YYYY-MM-DD" value.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(value?: string | number | Date | null, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;

  // Pure date-only string ("YYYY-MM-DD") — parse the parts directly to avoid any
  // timezone shift that `new Date()` would introduce.
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
    if (m) {
      const [, y, mo, d] = m;
      const mi = Number(mo) - 1;
      if (mi >= 0 && mi < 12) return `${d}-${MONTHS[mi]}-${y}`;
    }
  }

  const dt = value instanceof Date ? value : new Date(value);
  if (isNaN(dt.getTime())) return typeof value === 'string' ? value : fallback;
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dd}-${MONTHS[dt.getMonth()]}-${dt.getFullYear()}`;
}

// Same as formatDate but appends the time (e.g. "01-Nov-2022, 14:05") — for
// audit trails / activity logs where the timestamp matters.
export function formatDateTime(value?: string | number | Date | null, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const dt = value instanceof Date ? value : new Date(value);
  if (isNaN(dt.getTime())) return typeof value === 'string' ? value : fallback;
  const datePart = formatDate(dt, fallback);
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${datePart}, ${hh}:${mm}`;
}
