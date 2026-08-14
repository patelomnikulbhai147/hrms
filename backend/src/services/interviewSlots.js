/**
 * Interview slot engine — single source of truth for candidate self-scheduling
 * availability. Both the public GET (what the candidate sees) and the public
 * POST (booking validation) derive dates/slots from here, so a slot the UI
 * never offered can never be booked.
 *
 * The availability window lives ON the invitation (RecruitmentInterview row);
 * company-level InterviewScheduleSettings only provide defaults for legacy
 * invites created before per-invitation windows existed.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_WORKING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const MAX_WINDOW_DAYS = 60;

function toMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const mins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return mins >= 0 && mins < 24 * 60 ? mins : null;
}

function toHHMM(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isValidDateStr(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

/** Current date (YYYY-MM-DD) and minutes-of-day in the given IANA timezone. */
function nowInTimezone(timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = t => parts.find(p => p.type === t)?.value;
    const hour = parseInt(get('hour'), 10) % 24; // en-CA may report 24:xx at midnight
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      minutes: hour * 60 + parseInt(get('minute'), 10),
    };
  } catch (_) {
    const d = new Date();
    return { date: d.toISOString().split('T')[0], minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }
}

function weekdayOf(dateStr) {
  return DAY_NAMES[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

/**
 * Effective availability window for an invitation, falling back to company
 * settings (legacy invites) and safe defaults.
 */
function resolveWindow(interview, settings) {
  const s = settings || {};
  const from = interview.availableFrom || s.availableFrom || null;
  const to = interview.availableTo || s.availableTo || null;
  let workingDays = interview.workingDays || s.workingDays || DEFAULT_WORKING_DAYS;
  if (!Array.isArray(workingDays) || !workingDays.length) workingDays = DEFAULT_WORKING_DAYS;
  workingDays = workingDays.filter(d => DAY_NAMES.includes(d));
  if (!workingDays.length) workingDays = DEFAULT_WORKING_DAYS;

  const startTime = interview.dayStartTime || s.startTime || '10:00';
  const endTime = interview.dayEndTime || s.endTime || '17:00';
  const duration = interview.duration || s.duration || 30;
  const buffer = Number.isFinite(interview.bufferMinutes) ? interview.bufferMinutes : 0;
  const timezone = interview.timezone || s.timezone || 'Asia/Kolkata';

  return { from, to, workingDays, startTime, endTime, duration, buffer, timezone };
}

/**
 * All bookable dates in the window: within [from, to], on an allowed weekday,
 * not in the past (today allowed — future slots within today are filtered per
 * slot). Capped at MAX_WINDOW_DAYS entries.
 */
function generateDates(window) {
  const { date: today } = nowInTimezone(window.timezone);
  let from = window.from && isValidDateStr(window.from) ? window.from : today;
  const to = window.to && isValidDateStr(window.to) ? window.to : addDays(from, 13);
  if (from < today) from = today;
  if (to < from) return [];

  const dates = [];
  for (let d = from, i = 0; d <= to && i < MAX_WINDOW_DAYS; d = addDays(d, 1), i++) {
    if (window.workingDays.includes(weekdayOf(d))) {
      dates.push({ date: d, weekday: weekdayOf(d) });
    }
  }
  return dates;
}

/**
 * The full slot grid for one date (before subtracting bookings): start times
 * step by duration+buffer inside [startTime, endTime]; a slot must END by
 * endTime; slots earlier than "now" (same-day) are excluded.
 */
function generateSlotGrid(window, dateStr) {
  const startMin = toMinutes(window.startTime);
  const endMin = toMinutes(window.endTime);
  const duration = parseInt(window.duration, 10) || 30;
  const buffer = parseInt(window.buffer, 10) || 0;
  if (startMin === null || endMin === null || duration <= 0 || endMin <= startMin) return [];

  const now = nowInTimezone(window.timezone);
  const slots = [];
  for (let t = startMin; t + duration <= endMin; t += duration + buffer) {
    if (dateStr === now.date && t <= now.minutes) continue; // past slot today
    slots.push({ start: toHHMM(t), end: toHHMM(t + duration) });
    if (slots.length >= 96) break;
  }
  return slots;
}

/** Do [aStart,aEnd) and [bStart,bEnd) overlap (minutes)? */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Busy intervals for a company on the given dates. An existing SCHEDULED
 * interview blocks a slot when it overlaps in time AND is for the same
 * interviewer (or when either side has no interviewer recorded, in which case
 * it blocks company-wide — the conservative reading).
 */
async function fetchBusyIntervals(prisma, companyId, dates, excludeInterviewId) {
  const rows = await prisma.recruitmentInterview.findMany({
    where: {
      application: { companyId },
      status: 'SCHEDULED',
      scheduledDate: { in: dates },
      scheduledTime: { not: null },
      ...(excludeInterviewId ? { id: { not: excludeInterviewId } } : {}),
    },
    select: { scheduledDate: true, scheduledTime: true, scheduledEndTime: true, duration: true, interviewer: true },
  });

  const busy = {};
  for (const r of rows) {
    const start = toMinutes(r.scheduledTime);
    if (start === null) continue;
    let end = toMinutes(r.scheduledEndTime);
    if (end === null || end <= start) end = start + (r.duration || 30);
    if (!busy[r.scheduledDate]) busy[r.scheduledDate] = [];
    busy[r.scheduledDate].push({ start, end, interviewer: (r.interviewer || '').trim().toLowerCase() });
  }
  return busy;
}

function slotBlockedBy(busyList, slotStart, slotEnd, interviewer) {
  const me = (interviewer || '').trim().toLowerCase();
  return (busyList || []).some(b => {
    if (!overlaps(slotStart, slotEnd, b.start, b.end)) return false;
    if (me && b.interviewer && me !== b.interviewer) return false; // different interviewer → parallel OK
    return true;
  });
}

/**
 * Full availability payload for the public scheduling page:
 * dates + per-date slots with availability flags.
 */
async function buildAvailability(prisma, interview, settings) {
  const window = resolveWindow(interview, settings);
  const dates = generateDates(window);
  const busy = await fetchBusyIntervals(prisma, interview.application.companyId, dates.map(d => d.date), interview.id);

  const slots = {};
  const outDates = [];
  for (const d of dates) {
    const grid = generateSlotGrid(window, d.date);
    const withAvail = grid.map(s => ({
      ...s,
      available: !slotBlockedBy(busy[d.date], toMinutes(s.start), toMinutes(s.end), interview.interviewer),
    }));
    if (withAvail.length) {
      slots[d.date] = withAvail;
      outDates.push({ ...d, availableCount: withAvail.filter(s => s.available).length });
    }
  }
  return { window, dates: outDates, slots };
}

/**
 * Server-side validation that (date, time) is a legal, offered, non-past slot
 * for this invitation. Returns { ok, error, slot } — conflict checking is done
 * separately inside the booking transaction.
 */
function validateSlotSelection(window, date, time) {
  if (!isValidDateStr(date)) return { ok: false, error: 'Invalid interview date.' };
  const dates = generateDates(window);
  if (!dates.some(d => d.date === date)) {
    return { ok: false, error: 'The selected date is not within the available interview window.' };
  }
  const grid = generateSlotGrid(window, date);
  const slot = grid.find(s => s.start === time);
  if (!slot) {
    return { ok: false, error: 'The selected time is not an available interview slot.' };
  }
  return { ok: true, slot };
}

module.exports = {
  DAY_NAMES,
  DEFAULT_WORKING_DAYS,
  toMinutes,
  toHHMM,
  isValidDateStr,
  nowInTimezone,
  resolveWindow,
  generateDates,
  generateSlotGrid,
  fetchBusyIntervals,
  slotBlockedBy,
  buildAvailability,
  validateSlotSelection,
};
