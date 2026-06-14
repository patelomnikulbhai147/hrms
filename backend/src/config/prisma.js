const { PrismaClient } = require('@prisma/client');

// Single, shared PrismaClient for the entire server (one connection pool).
// `log` surfaces real DB warnings/errors to the server console so a socket /
// connection / constraint failure is diagnosable instead of silent.
const prisma = new PrismaClient({
  log: [
    { emit: 'stdout', level: 'warn' },
    { emit: 'stdout', level: 'error' },
  ],
});

// Verify connectivity once at boot so a bad DB URL / down MySQL fails loudly and
// early rather than as a mysterious "socket closed" on the first request.
prisma.$connect()
  .then(() => console.log('[prisma] Connected to database.'))
  .catch((e) => console.error('[prisma] INITIAL CONNECTION FAILED:', e.message));

// Close the pool cleanly on shutdown so connections aren't left dangling (a
// source of "socket connection was closed unexpectedly" on the next run).
for (const sig of ['SIGINT', 'SIGTERM', 'beforeExit']) {
  process.once(sig, async () => {
    try { await prisma.$disconnect(); } catch (_) {}
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ID-coercion middleware.
//
// Company.id, Branch.id and Employee.id are integers, and every companyId /
// branchId / parentCompanyId foreign key is an integer too. Requests, however,
// often carry these as numeric STRINGS ("1") — from URL params, the
// x-workspace-id header, or JSON bodies. This middleware transparently converts
// those numeric strings to numbers before the query runs, so we never have to
// sprinkle parseInt() through every controller and Prisma never rejects a
// "string given for Int field" query.
// ─────────────────────────────────────────────────────────────────────────────
const INT_PK_MODELS = new Set([
  'Company', 'Branch', 'Employee', 'User',
  // Transactional / log tables with integer PKs — a string id from a URL param
  // ("/payroll/5") is coerced to a number here.
  'Attendance', 'Payroll', 'Document', 'LeaveRequest', 'Overtime',
  'Notification', 'PaymentRecord', 'CompanyPayroll', 'BranchPayroll',
  'AuditLog', 'Shift', 'LoginAudit', 'PasswordResetToken', 'SubscriptionPlan',
  'LeaveCreditConfig', 'LeaveBalance', 'AttendanceSummary',
]);
const FK_KEYS = ['companyId', 'branchId', 'parentCompanyId'];

const toIntIfNumericString = (v) =>
  (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) ? Number(v) : v;

function coerceFks(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of FK_KEYS) {
    if (k in obj && obj[k] !== null && obj[k] !== undefined) {
      // only top-level scalar values (skip filter objects like { in: [...] })
      if (typeof obj[k] === 'string') obj[k] = toIntIfNumericString(obj[k]);
    }
  }
}

prisma.$use(async (params, next) => {
  const a = params.args;
  if (a) {
    coerceFks(a.data);
    coerceFks(a.where);
    if (Array.isArray(a.data)) a.data.forEach(coerceFks);
    // Integer primary keys addressed by string id (findUnique / update / delete),
    // including bulk `id: { in: ["5","6"] }` filters used by payroll approve /
    // markPaid / lock.
    if (INT_PK_MODELS.has(params.model) && a.where && a.where.id != null) {
      if (typeof a.where.id === 'string') {
        a.where.id = toIntIfNumericString(a.where.id);
      } else if (typeof a.where.id === 'object' && Array.isArray(a.where.id.in)) {
        a.where.id.in = a.where.id.in.map(toIntIfNumericString);
      }
    }
    // Integer primary keys on the way IN (create / update data). A numeric
    // string ("5") is coerced; a non-numeric client id (a leftover UUID or an
    // optimistic key like "new-7-2026-06-12") is dropped so the AUTO_INCREMENT
    // column assigns the next sequential value instead of erroring.
    if (INT_PK_MODELS.has(params.model) && a.data && !Array.isArray(a.data) && typeof a.data.id === 'string') {
      const n = toIntIfNumericString(a.data.id);
      if (typeof n === 'number') a.data.id = n;
      else delete a.data.id;
    }
  }
  return next(params);
});

module.exports = prisma;
