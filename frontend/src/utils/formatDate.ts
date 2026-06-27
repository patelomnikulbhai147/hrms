// Canonical date/time display for the WHOLE app. Converts raw ISO timestamps and
// date-only strings into the enterprise display format, in the configured
// application timezone, so no screen ever shows a raw UTC string like
// "2026-06-20T08:57:04.482Z".
//
//   formatDate("2026-06-20T08:57:04.482Z")  → "20 Jun 2026"
//   formatDateTime("2026-06-20T08:57:04.482Z") → "20 Jun 2026, 02:27 PM"  (Asia/Kolkata)
//   formatTime("2026-06-20T08:57:04.482Z")  → "02:27 PM"
//
// Empty / null / undefined / unparseable values return "—" (never "null",
// "undefined" or "Invalid Date").
//
// IMPORTANT: use these ONLY for DISPLAY. Never feed the result back into an
// <input type="date">, which requires the raw "YYYY-MM-DD" value. Sorting must
// also use the original value, not the formatted string.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The configured application/display timezone. All timestamps are converted to
// this zone so users never see raw UTC. (Single place to change if needed.)
export const APP_TIME_ZONE = 'Asia/Kolkata';

// Break a Date into display parts IN the configured timezone.
function tzParts(dt: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).formatToParts(dt);
  const g = (t: string) => parts.find(p => p.type === t)?.value || '';
  return { day: g('day'), month: g('month'), year: g('year'), hour: g('hour'), minute: g('minute'), period: g('dayPeriod').toUpperCase() };
}

// A pure date-only string ("YYYY-MM-DD") carries no time/zone, so format its parts
// directly — converting it through a timezone could shift it to the previous day.
function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const mi = Number(m[2]) - 1;
  return mi >= 0 && mi < 12 ? `${m[3]} ${MONTHS[mi]} ${m[1]}` : null;
}

export function formatDate(value?: string | number | Date | null, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const d = dateOnly(value);
  if (d) return d;
  const dt = value instanceof Date ? value : new Date(value);
  if (isNaN(dt.getTime())) return fallback;
  const p = tzParts(dt);
  return `${p.day} ${p.month} ${p.year}`;
}

// Date + time, e.g. "20 Jun 2026, 02:27 PM" — for audit trails, activity logs,
// notifications and any place the time matters. Always in the configured timezone.
export function formatDateTime(value?: string | number | Date | null, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  // A pure date-only value has no meaningful time → show the date alone.
  if (dateOnly(value)) return formatDate(value, fallback);
  const dt = value instanceof Date ? value : new Date(value);
  if (isNaN(dt.getTime())) return fallback;
  const p = tzParts(dt);
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.period}`;
}

// Time only, e.g. "02:27 PM" — in the configured timezone.
export function formatTime(value?: string | number | Date | null, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const dt = value instanceof Date ? value : new Date(value);
  if (isNaN(dt.getTime())) return fallback;
  const p = tzParts(dt);
  return `${p.hour}:${p.minute} ${p.period}`;
}
