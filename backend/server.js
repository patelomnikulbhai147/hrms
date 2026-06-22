require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/authRoutes');
const companyRoutes = require('./src/routes/companyRoutes');
const branchRoutes = require('./src/routes/branchRoutes');
const employeeRoutes = require('./src/routes/employeeRoutes');
const leaveRoutes = require('./src/routes/leaveRoutes');
const { creditRouter: leaveCreditRoutes, balanceRouter: leaveBalanceRoutes } = require('./src/routes/leaveSystemRoutes');
const leaveAdminRoutes = require('./src/routes/leaveAdminRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
const tenderRoutes = require('./src/routes/tenderRoutes');
const documentRoutes = require('./src/routes/documentRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const payrollRoutes = require('./src/routes/payrollRoutes');
const attendanceRoutes = require('./src/routes/attendanceRoutes');
const attendanceSummaryRoutes = require('./src/routes/attendanceSummaryRoutes');
const attendanceDeviceRoutes = require('./src/routes/attendanceDeviceRoutes');
const attendanceVendorRoutes = require('./src/routes/attendanceVendorRoutes');
const userRoutes = require('./src/routes/userRoutes');
const overtimeRoutes = require('./src/routes/overtimeRoutes');
const shiftRoutes = require('./src/routes/shiftRoutes');
const subscriptionPlanRoutes = require('./src/routes/subscriptionPlanRoutes');
const statisticsRoutes = require('./src/routes/statisticsRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// CORS — in production set CORS_ORIGIN to the frontend origin(s), comma-separated
// (e.g. "http://1.2.3.4" or "https://hrms.example.com"). When unset (local dev,
// or when the frontend reaches the API through the nginx same-origin proxy) all
// origins are reflected.
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: corsOrigin, credentials: true }));

// ── Phase 6: attendance device PUSH receiver (ADMS-style) ────────────────────
// Mounted BEFORE the JSON/urlencoded parsers so the raw device body is captured
// verbatim. Unauthenticated (devices push without a JWT). Capture-only — never
// creates attendance. Also catches real ADMS/iclock devices that POST to the
// vendor's fixed /iclock/* paths.
app.use('/api/attendance-device', require('./src/routes/attendancePushRoutes'));
const _attendancePush = require('./src/controllers/attendancePushController');
app.all(/^\/iclock.*/, _attendancePush.captureRaw, _attendancePush.receive);

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Open the audit-trail actor context for every request so the global audit
// middleware (in config/prisma) can record who performed each mutation.
const auditContext = require('./src/utils/auditContext');
app.use((req, res, next) => auditContext.run(next));

// ── Request diagnostic logging ───────────────────────────────────────────────
// Logs method, path, response status and duration for every API call so a
// failure (slow query, 4xx/5xx, dropped socket) is traceable in the server log.
// Payloads are intentionally NOT dumped wholesale (they can be 100MB base64
// documents); only their size is recorded.
app.use((req, res, next) => {
  const start = Date.now();
  const bytes = req.headers['content-length'] || 0;
  res.on('finish', () => {
    const ms = Date.now() - start;
    const line = `${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms${bytes ? ` (${bytes}b in)` : ''}`;
    if (res.statusCode >= 500) console.error('[req]', line);
    else if (res.statusCode >= 400) console.warn('[req]', line);
    else console.log('[req]', line);
  });
  next();
});

// Routes
app.use('/api/audit', require('./src/routes/auditRoutes'));
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/leave-credit', leaveCreditRoutes);
app.use('/api/leave-balances', leaveBalanceRoutes);
app.use('/api/leave-admin', leaveAdminRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/tenders', tenderRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/attendance-summary', attendanceSummaryRoutes);
app.use('/api/attendance-devices', attendanceDeviceRoutes);
app.use('/api/attendance-vendors', attendanceVendorRoutes);
app.use('/api/biometric-mappings', require('./src/routes/biometricMappingRoutes'));
app.use('/api/attendance-import', require('./src/routes/attendanceImportRoutes'));
app.use('/api/bonus', require('./src/routes/bonusRoutes'));
app.use('/api/employee-bonuses', require('./src/routes/employeeBonusRoutes'));
app.use('/api/location-masters', require('./src/routes/locationMasterRoutes'));
app.use('/api/compliance-reports', require('./src/routes/complianceReportRoutes'));
app.use('/api/nominees', require('./src/routes/nomineeRoutes'));
app.use('/api/ifsc', require('./src/routes/ifscRoutes'));
app.use('/api/users', userRoutes);
app.use('/api/overtime', overtimeRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/plans', subscriptionPlanRoutes);
app.use('/api/statistics', statisticsRoutes);

// Health Check — also verifies the DATABASE is actually reachable, so a green
// health response means the API AND its MySQL connection are live (distinguishes
// "backend down" from "database down" for the frontend / ops).
const prisma = require('./src/config/prisma');
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', message: 'HRMS Backend is running smoothly.', database: 'connected' });
  } catch (e) {
    console.error('[health] Database unreachable:', e.message);
    res.status(503).json({ status: 'degraded', message: 'Backend is up but the database is unreachable.', database: 'disconnected' });
  }
});

// Diagnostics throttle: a misconfigured device can retry dozens of times per
// second; cap repeat captures per source+kind so the debug table isn't flooded.
const _diagThrottle = new Map();
const _shouldLog = (key, ms = 5000) => {
  const now = Date.now();
  if (now - (_diagThrottle.get(key) || 0) < ms) return false;
  _diagThrottle.set(key, now);
  return true;
};

// ── Phase 6 diagnostics: log ANY unmatched HTTP request from a REMOTE host ───
// If a device pushes HTTP to an unexpected path/method, capture it here instead
// of silently 404'ing. Local frontend/API traffic (loopback) is ignored as noise.
app.use((req, res) => {
  const remote = String(req.ip || (req.socket && req.socket.remoteAddress) || '').replace('::ffff:', '');
  const isLocal = remote === '127.0.0.1' || remote === '::1' || remote === '';
  if (!isLocal && _shouldLog('http:' + remote + ':' + req.path)) {
    let raw = '';
    try { raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}); } catch (_) {}
    _attendancePush.logEvent({
      deviceIp: remote, method: req.method, path: req.originalUrl,
      contentType: req.headers['content-type'] || null,
      headers: JSON.stringify(req.headers), query: JSON.stringify(req.query || {}),
      rawPayload: raw, note: 'HTTP_UNMATCHED_PATH (reached server, no matching route)',
    });
  }
  res.status(404).json({ error: 'Not found' });
});

// Centralized Error Handling — turns framework-level failures into specific,
// honest messages instead of a blanket 500.
app.use((err, req, res, next) => {
  // Malformed JSON body
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'The request body was not valid JSON.', code: 'BAD_JSON' });
  }
  // Payload exceeded the 100MB limit (e.g. an oversized document upload)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ error: 'The uploaded data is too large. Please use a smaller file.', code: 'PAYLOAD_TOO_LARGE' });
  }
  console.error(`Unhandled Error on ${req.method} ${req.originalUrl}:`, err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error', code: 'INTERNAL' });
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// ── Phase 6 diagnostics: capture NON-HTTP traffic on the HTTP port ───────────
// An eTimeOffice/Realtime "Host PC" push is a raw/proprietary TCP frame, not
// HTTP. When such bytes hit this port, Node's HTTP parser raises 'clientError';
// we log the raw bytes so we can prove the device reached us even though it is
// not speaking HTTP (this does NOT disturb valid HTTP connections).
server.on('clientError', (err, socket) => {
  try {
    const remote = String(socket.remoteAddress || '').replace('::ffff:', '');
    const isLocal = remote === '127.0.0.1' || remote === '::1' || remote === '';
    const raw = err && err.rawPacket ? err.rawPacket : null;
    if ((!isLocal || raw) && _shouldLog('cerr:' + remote)) {
      _attendancePush.logEvent({
        deviceIp: remote, method: 'NON-HTTP', path: `[clientError on :${PORT}]`,
        headers: JSON.stringify({ code: err && err.code, message: err && err.message }),
        rawPayload: raw
          ? raw.toString('hex').slice(0, 4000) + ' | ascii: ' + raw.toString('latin1').replace(/[^\x20-\x7e]/g, '.').slice(0, 1000)
          : '(connection error, no raw packet captured)',
        note: 'NON_HTTP_BYTES_ON_HTTP_PORT (device is not speaking HTTP here)',
      });
    }
  } catch (_) {}
  try { socket.destroy(); } catch (_) {}
});

// ── Phase 6 diagnostics: dedicated RAW TCP capture on a separate port ────────
// Point the device's "Host PC Port" at this to test raw-socket (Host PC) mode —
// it logs the connection and every byte received, with zero HTTP interference.
// Capture-only; never creates attendance.
const net = require('net');
const RAW_DIAG_PORT = 5005;
const rawDiag = net.createServer((socket) => {
  const remote = String(socket.remoteAddress || '').replace('::ffff:', '');
  if (_shouldLog('tcpconn:' + remote)) _attendancePush.logEvent({ deviceIp: remote, method: 'TCP-CONNECT', path: `[raw socket :${RAW_DIAG_PORT}] connection opened`, note: 'RAW_TCP_CONNECTION (socket opened)' });
  socket.on('data', (d) => {
    if (!_shouldLog('tcpdata:' + remote)) return;
    _attendancePush.logEvent({
      deviceIp: remote, method: 'TCP-RAW', path: `[raw socket :${RAW_DIAG_PORT}] data (${d.length} bytes)`,
      rawPayload: d.toString('hex').slice(0, 4000) + ' | ascii: ' + d.toString('latin1').replace(/[^\x20-\x7e]/g, '.').slice(0, 1000),
      note: 'RAW_TCP_BYTES (proprietary/Host-PC socket push)',
    });
  });
  socket.on('error', () => {});
  socket.setTimeout(15000, () => { try { socket.destroy(); } catch (_) {} });
});
rawDiag.on('error', (e) => console.error(`[diag] raw TCP listener on :${RAW_DIAG_PORT}:`, e.code || e.message));
rawDiag.listen(RAW_DIAG_PORT, () => console.log(`[diag] RAW TCP capture listening on :${RAW_DIAG_PORT}`));

// If the port is already taken — usually an old instance still lingering after a
// fast nodemon restart — fail with a clear, actionable message instead of an
// unhandled 'error' event crash dump.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[server] Port ${PORT} is already in use — another backend instance is still running.`);
    console.error(`[server] Close the other terminal, or free the port, then start again.\n`);
    process.exit(1);
  }
  throw err;
});

// Close the HTTP server cleanly on shutdown / nodemon restart so the port is
// released immediately and the next start cannot hit EADDRINUSE. A short safety
// timeout force-exits if a lingering socket keeps the server from closing.
const shutdown = (signal) => {
  console.log(`[server] ${signal} received — releasing port ${PORT} and shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
// SIGUSR2 is nodemon's restart signal on Unix; it is unsupported on Windows.
if (process.platform !== 'win32') {
  process.once('SIGUSR2', () => shutdown('SIGUSR2'));
}
