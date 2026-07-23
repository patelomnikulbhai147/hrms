// ─────────────────────────────────────────────────────────────────────────────
// Deriving overtime HOURS from a day's attendance — one rule, one place.
//
// This encodes the rule the Excel-import path (attendanceSheetService) has always
// used, so a day worked 09:00–21:00 earns the same overtime whether the punches
// arrived from a biometric sheet or were typed into the Attendance screen.
// Before this existed only the import derived overtime; a manually entered day
// produced none at all, however long it was.
//
// The rule:
//   • Holiday or weekly-off work  → EVERY worked hour is overtime.
//   • A normal working day        → overtime = worked − the shift's working span,
//                                   and only past a 0.25h cushion so a few
//                                   minutes of overrun is not a claim.
//   • A shift with otEnabled=false earns none.
//   • No shift → no derivation. There is no company-wide "standard day" field to
//     fall back on, and inventing 8 or 9 hours here would silently pay people by
//     a number nobody configured.
//
// Deriving hours is NOT approving them: the caller creates the record as Pending
// so it still goes through the approval workflow before it can ever be paid.
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** 'HH:MM' → minutes since midnight, or null. */
function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

/** Hours between two 'HH:MM' punches, handling an overnight out-time. */
function workedHours(clockIn, clockOut, breakMinutes = 0) {
  const a = toMinutes(clockIn), b = toMinutes(clockOut);
  if (a == null || b == null) return 0;
  let end = b;
  if (end < a) end += 24 * 60;             // out before in ⇒ next-day punch
  const gross = end - a;
  return round2(Math.max(0, gross - (Number(breakMinutes) || 0)) / 60);
}

/** The shift's paid working span in hours (start→end minus break). */
function shiftWorkHours(shift) {
  if (!shift) return null;
  const a = toMinutes(shift.start), b = toMinutes(shift.end);
  if (a == null || b == null) return null;
  let end = b;
  if (end < a) end += 24 * 60;
  const brk = toMinutes(shift.breakTime) != null
    ? toMinutes(shift.breakTime)
    : (Number(String(shift.breakTime || '').replace(/[^0-9.]/g, '')) || 0);
  return round2(Math.max(0, (end - a) - brk) / 60);
}

/**
 * @returns {{ otHours: number, reason: string }} otHours is 0 when none is due;
 *          `reason` explains why, so a caller can log it rather than guess.
 */
function deriveOvertimeHours({ clockIn, clockOut, shift, isHoliday = false, isWeeklyOff = false, breakMinutes = 0 }) {
  const worked = workedHours(clockIn, clockOut, breakMinutes);
  if (worked <= 0) return { otHours: 0, reason: 'no complete in/out punch' };

  if (isHoliday) return { otHours: worked, reason: 'holiday work — all hours are overtime' };
  if (isWeeklyOff) return { otHours: worked, reason: 'weekly-off work — all hours are overtime' };

  if (!shift) return { otHours: 0, reason: 'no shift assigned — nothing to measure the day against' };
  if (shift.otEnabled === false) return { otHours: 0, reason: 'shift is not overtime-eligible' };

  const span = shiftWorkHours(shift);
  if (span == null || span <= 0) return { otHours: 0, reason: 'shift has no usable start/end' };

  if (worked > span + 0.25) return { otHours: round2(worked - span), reason: `worked ${worked}h against a ${span}h shift` };
  return { otHours: 0, reason: `worked ${worked}h, within the ${span}h shift (+0.25h cushion)` };
}

module.exports = { deriveOvertimeHours, workedHours, shiftWorkHours, toMinutes };
