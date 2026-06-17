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
const leaveEncashmentRoutes = require('./src/routes/leaveEncashmentRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
const tenderRoutes = require('./src/routes/tenderRoutes');
const documentRoutes = require('./src/routes/documentRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const payrollRoutes = require('./src/routes/payrollRoutes');
const attendanceRoutes = require('./src/routes/attendanceRoutes');
const attendanceSummaryRoutes = require('./src/routes/attendanceSummaryRoutes');
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
app.use('/api/leave-encashment', leaveEncashmentRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/tenders', tenderRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/attendance-summary', attendanceSummaryRoutes);
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
