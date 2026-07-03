/**
 * E-TimeOffice Attendance API Integration — HTTP surface.
 *
 * Manages the per-company connection config, connection testing, manual "Sync
 * Now", the run-level sync-log history, and a dashboard aggregate. Company-scoped
 * and role-gated (mirrors attendanceImportController):
 *   - Super Admin  : any company (must name it / masquerade)
 *   - Company Head : manage their own company
 *   - HR           : view only
 * All credential handling goes through etimeSettingsService (encrypted at rest).
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { settings, sync, client, unmatched } = require('../services/etimeoffice');

const companyScopeFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const canView = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);
const canManage = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);

// Which company a WRITE targets — RULE 5 isolation: a non-admin is pinned to
// their own company; a Super Admin must name one (query / body / workspace).
function targetCompanyId(req, requested) {
  if (isSuperAdmin(req)) return idParam(requested || req.query.companyId || req.headers['x-workspace-id']) || null;
  return req.user?.companyId || null;
}

// Company-scoped WHERE for reads (unauthorised workspace → null).
function scopedWhere(req) {
  const workspaceId = idParam(req.query.companyId || req.headers['x-workspace-id']);
  if (isSuperAdmin(req)) return workspaceId ? { companyId: workspaceId } : {};
  const scope = companyScopeFor(req);
  if (workspaceId && !scope.includes(workspaceId)) return null;
  return { companyId: workspaceId || { in: scope.length ? scope : [-1] } };
}

// GET /connection — the (sanitized) connection config for the target company.
exports.getConnection = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view the attendance integration.' });
    const companyId = targetCompanyId(req, req.query.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const conn = await settings.getOrCreate(companyId);
    res.json(settings.sanitize(conn));
  } catch (e) {
    console.error('etime.getConnection', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// PUT /connection — save config (Super Admin / Company Head). Password encrypted.
exports.saveConnection = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to edit the attendance integration.' });
    const companyId = targetCompanyId(req, req.body?.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) return res.status(400).json({ error: 'Selected company does not exist.' });
    const saved = await settings.save(companyId, req.body || {});
    res.json(settings.sanitize(saved));
  } catch (e) {
    console.error('etime.saveConnection', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST /connection/test — live connectivity + credential check.
exports.testConnection = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to test the connection.' });
    const companyId = targetCompanyId(req, req.body?.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const creds = await settings.getDecryptedCreds(companyId);
    if (!creds || !settings.hasCredentials(creds._row)) {
      return res.status(400).json({ ok: false, error: 'Enter and save Corporate ID, Username and Password before testing.' });
    }
    const result = await client.testConnection(creds);
    await prisma.etimeConnection.update({
      where: { companyId },
      data: {
        lastTestAt: new Date(),
        lastTestStatus: result.ok ? 'CONNECTED' : 'FAILED',
        lastTestResponseMs: result.durationMs || null,
        connectionStatus: result.ok ? 'connected' : 'error',
        lastError: result.ok ? null : (result.message || 'Connection test failed.'),
      },
    }).catch(() => {});
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    console.error('etime.testConnection', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST /sync — manual "Sync Now" (Imported / Skipped / Errors / Duration).
exports.syncNow = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to run a sync.' });
    const companyId = targetCompanyId(req, req.body?.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const dryRun = req.body?.dryRun === true || req.body?.dryRun === 'true';
    const result = await sync.runSync(companyId, { trigger: 'manual', dryRun });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error('etime.syncNow', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /sync-logs — run-level history (company-scoped).
exports.getSyncLogs = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view sync logs.' });
    const where = scopedWhere(req);
    if (where === null) return res.status(403).json({ error: 'Unauthorized to view this workspace.' });
    const logs = await prisma.attendanceSyncLog.findMany({ where, orderBy: { startedAt: 'desc' }, take: 100 });
    res.json(logs);
  } catch (e) {
    console.error('etime.getSyncLogs', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /dashboard — status + statistics for the integration admin page.
exports.getDashboard = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view the dashboard.' });
    const companyId = targetCompanyId(req, req.query.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });

    const conn = await settings.getOrCreate(companyId);
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const todayIso = `${midnight.getFullYear()}-${String(midnight.getMonth() + 1).padStart(2, '0')}-${String(midnight.getDate()).padStart(2, '0')}`;

    const [todaysRuns, pendingUnmatched, todaysRows, recentRuns] = await Promise.all([
      prisma.attendanceSyncLog.findMany({ where: { companyId, startedAt: { gte: midnight } } }),
      prisma.unmatchedAttendance.count({ where: { companyId, resolved: false } }),
      prisma.attendance.findMany({ where: { companyId, date: todayIso }, select: { status: true, flags: true } }),
      prisma.attendanceSyncLog.findMany({ where: { companyId }, orderBy: { startedAt: 'desc' }, take: 10 }),
    ]);

    // Today's attendance breakdown (Present / Absent / Late / On-Leave) computed
    // from the single-source-of-truth attendance table so the dashboard mirrors
    // exactly what the Attendance module shows.
    const isLate = (f) => { try { const j = typeof f === 'string' ? JSON.parse(f) : f; return !!(j && j.isLate); } catch { return false; } };
    const st = (r) => String(r.status || '').toLowerCase();
    const presentToday = todaysRows.filter((r) => st(r).startsWith('present') || st(r).startsWith('half')).length;
    const absentToday = todaysRows.filter((r) => st(r).startsWith('absent')).length;
    const onLeaveToday = todaysRows.filter((r) => st(r).startsWith('leave')).length;
    const lateToday = todaysRows.filter((r) => isLate(r.flags)).length;

    const sum = (k) => todaysRuns.reduce((n, r) => n + (r[k] || 0), 0);
    const stats = {
      connectionStatus: conn.connectionStatus,
      enabled: conn.enabled,
      lastSyncAt: conn.lastSyncAt,
      lastSyncStatus: conn.lastSyncStatus,
      lastError: conn.lastError,
      syncIntervalMinutes: conn.syncIntervalMinutes,
      todaysAttendanceRecords: todaysRows.length,
      presentToday,
      absentToday,
      lateToday,
      onLeaveToday,
      importedToday: sum('imported') + sum('updated'),
      failedToday: sum('failed'),
      duplicatesToday: sum('duplicates'),
      unmatchedToday: sum('unmatched'),
      pendingUnmatched,
      runsToday: todaysRuns.length,
    };
    res.json({ connection: settings.sanitize(conn), stats, recentRuns });
  } catch (e) {
    console.error('etime.getDashboard', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /unmatched — the unmatched-punch queue, grouped by biometric code with a
// suggested employee for each. Company-scoped.
exports.getUnmatched = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view the unmatched queue.' });
    const companyId = targetCompanyId(req, req.query.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const groups = await unmatched.listUnmatched(companyId);
    res.json({ groups, total: groups.reduce((n, g) => n + g.count, 0) });
  } catch (e) {
    console.error('etime.getUnmatched', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /employees — company-scoped employee list for the mapping dropdown.
exports.getMappingEmployees = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission.' });
    const companyId = targetCompanyId(req, req.query.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const employees = await unmatched.employeesForMapping(companyId, req.query.q || '');
    res.json(employees);
  } catch (e) {
    console.error('etime.getMappingEmployees', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST /unmatched/resolve — map a code → employee, then replay its history.
exports.resolveUnmatched = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to resolve unmatched punches.' });
    const companyId = targetCompanyId(req, req.body?.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const actor = req.user?.name || req.user?.email || null;
    const result = await unmatched.resolve(companyId, req.body?.biometricCode, req.body?.employeeId, actor);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error('etime.resolveUnmatched', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST /unmatched/ignore — dismiss unmatched punches without importing.
exports.ignoreUnmatched = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to modify the unmatched queue.' });
    const companyId = targetCompanyId(req, req.body?.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const result = await unmatched.ignore(companyId, { biometricCode: req.body?.biometricCode, id: req.body?.id });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error('etime.ignoreUnmatched', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
