// ── Payroll period guard ─────────────────────────────────────────────────────
// The current payroll period is anchored to the COMPANY timezone (IST by
// default), never the server clock — the live EC2 box runs UTC, and a UTC month
// boundary would flip the allowed period 5½ hours early. Attendance → Payroll
// synchronization must never accept a FUTURE period: the frontend disables the
// options, and every sync write endpoint validates with isFuturePeriod() so a
// hand-crafted API call cannot bypass the rule. Current + past months pass.
const TZ = process.env.ATTENDANCE_TZ || 'Asia/Kolkata';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function currentPeriod(d = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(d);
  const [y, m] = s.split('-').map(Number);
  return { year: y, month: m };
}

/**
 * True when (month, year) is AFTER the current IST period.
 * `month` accepts a 1–12 number, a numeric string, or a month name.
 * Unparseable input returns false — existing month/year validation handles it.
 */
function isFuturePeriod(month, year) {
  const y = Number(year);
  let m = Number(month);
  if (!Number.isFinite(m) || m < 1 || m > 12) {
    const idx = MONTH_NAMES.findIndex((n) => n.toLowerCase() === String(month == null ? '' : month).trim().toLowerCase());
    m = idx === -1 ? NaN : idx + 1;
  }
  if (!Number.isFinite(y) || !Number.isFinite(m)) return false;
  const c = currentPeriod();
  return y > c.year || (y === c.year && m > c.month);
}

const FUTURE_PERIOD_ERROR = Object.freeze({
  success: false,
  error: 'FUTURE_PAYROLL_PERIOD',
  message: 'Attendance and payroll synchronization is not available for future months.',
});

module.exports = { currentPeriod, isFuturePeriod, FUTURE_PERIOD_ERROR };
