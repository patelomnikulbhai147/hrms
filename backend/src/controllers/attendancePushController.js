/**
 * Attendance Push Receiver — Phase 6 (ADMS-style), DEBUG / CAPTURE ONLY.
 *
 * Accepts inbound HTTP requests from attendance devices (which push WITHOUT a
 * JWT) and records them verbatim in `device_push_logs`. It deliberately does NOT
 * create attendance, mark anyone present, or touch payroll/leave — it only
 * captures and inspects punches so we can learn the device's push format.
 *
 * Mounted BEFORE the global JSON/urlencoded parsers so the exact raw body is
 * preserved (ADMS devices send tab-separated text, not JSON).
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

// Capture the raw request body verbatim (latin1 preserves every byte), capped.
function captureRaw(req, res, next) {
  let data = '';
  try { req.setEncoding('latin1'); } catch (_) {}
  req.on('data', (c) => { if (data.length < 1000000) data += c; });
  req.on('end', () => { req.rawBody = data; next(); });
  req.on('error', () => { req.rawBody = data; next(); });
}

const firstVal = (...vals) => vals.find((v) => v !== undefined && v !== null && String(v).trim() !== '');

// Best-effort extraction across JSON / urlencoded / ADMS ATTLOG (tab-separated).
function extractFields(req) {
  const q = req.query || {};
  const raw = req.rawBody || '';
  let parsed = {};
  if (raw.trim().startsWith('{')) { try { parsed = JSON.parse(raw); } catch (_) {} }
  if (!Object.keys(parsed).length && raw.includes('=') && !raw.includes('\t')) {
    try { parsed = Object.fromEntries(new URLSearchParams(raw).entries()); } catch (_) {}
  }
  // ADMS ATTLOG first data line: "PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify ..."
  let admsUser, admsTime, admsStatus;
  if (raw.includes('\t')) {
    const line = raw.split(/\r?\n/).find((l) => l.trim());
    if (line) { const p = line.split('\t'); admsUser = p[0]; admsTime = p[1]; admsStatus = p[2]; }
  }
  return {
    userId: firstVal(parsed.userId, parsed.UserID, parsed.pin, parsed.PIN, parsed.enrollid, q.userId, q.pin, admsUser),
    biometricId: firstVal(parsed.biometricId, parsed.BiometricID, parsed.userId, parsed.pin, q.biometricId, admsUser),
    punchTime: firstVal(parsed.punchTime, parsed.PunchTime, parsed.time, parsed.timestamp, q.punchTime, admsTime),
    punchType: firstVal(parsed.punchType, parsed.PunchType, parsed.status, parsed.state, q.punchType, admsStatus),
    deviceId: idParam(firstVal(parsed.deviceId, q.deviceId)),
    serial: firstVal(parsed.SN, parsed.sn, q.SN, q.sn, parsed.serialNumber, q.serialNumber),
  };
}

exports.captureRaw = captureRaw;

exports.receive = async (req, res) => {
  try {
    const f = extractFields(req);
    const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').replace('::ffff:', '').split(',')[0].trim();

    // Resolve the originating device (explicit id / serial / source IP) for display only.
    let deviceId = f.deviceId || null;
    if (!deviceId && (f.serial || ip)) {
      const or = [];
      if (f.serial) or.push({ serialNumber: String(f.serial) });
      if (ip) or.push({ deviceIp: ip });
      if (or.length) {
        const dev = await prisma.attendanceDevice.findFirst({ where: { OR: or }, select: { id: true } });
        if (dev) deviceId = dev.id;
      }
    }

    await prisma.devicePushLog.create({
      data: {
        deviceId: deviceId || null,
        deviceIp: ip || null,
        method: req.method,
        path: String(req.originalUrl || '').slice(0, 2000),
        contentType: req.headers['content-type'] || null,
        headers: JSON.stringify(req.headers).slice(0, 60000),
        query: JSON.stringify(req.query || {}).slice(0, 60000),
        rawPayload: String(req.rawBody || '').slice(0, 60000),
        userId: f.userId ? String(f.userId).slice(0, 191) : null,
        biometricId: f.biometricId ? String(f.biometricId).slice(0, 191) : null,
        punchTime: f.punchTime ? String(f.punchTime).slice(0, 191) : null,
        punchType: f.punchType != null && f.punchType !== '' ? String(f.punchType).slice(0, 191) : null,
        processingResult: 'LOGGED_ONLY (no attendance created)',
      },
    });

    // ADMS/iclock devices expect a plain-text acknowledgement.
    res.set('Content-Type', 'text/plain').send('OK');
  } catch (e) {
    console.error('attendancePush.receive', e);
    // Acknowledge anyway so a real device doesn't spam-retry; capture failure is logged server-side.
    res.set('Content-Type', 'text/plain').status(200).send('OK');
  }
};

// Generic diagnostic logger used by the non-HTTP / raw-TCP / catch-all taps so
// EVERY way the device might reach us lands in the same Live Monitor table.
exports.logEvent = async (e) => {
  try {
    await prisma.devicePushLog.create({
      data: {
        deviceIp: e.deviceIp || null,
        method: e.method || null,
        path: e.path ? String(e.path).slice(0, 2000) : null,
        contentType: e.contentType || null,
        headers: e.headers ? String(e.headers).slice(0, 60000) : null,
        query: e.query ? String(e.query).slice(0, 60000) : null,
        rawPayload: e.rawPayload ? String(e.rawPayload).slice(0, 60000) : null,
        processingResult: e.note || 'CAPTURED (diagnostic)',
      },
    });
  } catch (err) {
    console.error('attendancePush.logEvent', err.message);
  }
};
