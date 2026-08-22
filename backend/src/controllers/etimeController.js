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

const canView = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);
const canManage = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);

// Branch-aware workspace authorisation (see utils/workspaceScope.js). The old
// private helper refused every branch workspace, because branch ids live in
// accessibleBranchIds, never in accessibleCompanyIds.
const { isSuperAdmin, scopedCompanyWhere, targetCompanyId } = require('../utils/workspaceScope');

// Company-scoped WHERE for reads (unauthorised workspace → null).
const scopedWhere = (req) => scopedCompanyWhere(req);

// ── Display helpers (match the reference console's HH:MM formatting) ──────────
const pad2 = (n) => String(n).padStart(2, '0');
// Decimal hours → "HH:MM" (7.63 → "07:38"); 0/blank → '—'.
const decHoursToHHMM = (h) => {
  const v = Number(h) || 0; if (v <= 0) return '—';
  const mins = Math.round(v * 60); return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
};
// Whole minutes → "HH:MM" (4 → "00:04"); 0 → '—'.
const minToHHMM = (m) => { const v = Math.round(Number(m) || 0); return v > 0 ? `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}` : '—'; };
// Read a JSON flags column defensively.
const readFlags = (f) => { try { return typeof f === 'string' ? JSON.parse(f) : (f || {}); } catch { return {}; } };
// "dd/MM/yyyy" → "yyyy-MM-dd" (for matching a raw punch to an attendance row).
const dmyToIso = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

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
    // Optional historical range — validated inside runSync (real dates, from ≤ to,
    // not future, within the max span). Omit both for the rolling IST window.
    const fromDate = req.body?.fromDate || null;
    const toDate = req.body?.toDate || null;
    const result = await sync.runSync(companyId, { trigger: 'manual', dryRun, fromDate, toDate });
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
    // "Today" for the attendance breakdown is the IST business day (matches the
    // IST-anchored sync window), so a UTC-clock host never shows the wrong day.
    const todayIso = sync.istTodayIso();

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

// GET /device-status — live biometric-device connectivity from the vendor API.
// Company-scoped. Distinguishes NOT_CONFIGURED (no creds) / an API failure (with
// its actionable message) / no devices returned / the device grid itself.
exports.deviceStatus = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view device status.' });
    const companyId = targetCompanyId(req, req.query.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const creds = await settings.getDecryptedCreds(companyId);
    if (!creds || !settings.hasCredentials(creds._row)) {
      return res.json({ ok: false, status: 'NOT_CONFIGURED', message: 'Enter and save E-TimeOffice credentials to view devices.', devices: [] });
    }
    const out = await client.deviceStatus(creds);
    // Online iff con_status contains "connect" but not "disconnect" (case-insensitive)
    // — robust to "Connect" / "Connected" / "Disconnected" variants from the device.
    const devices = (out.devices || []).map((d) => {
      const con = String(d.con_status || '').toLowerCase();
      return {
        machineNo: d.MachineNo != null ? String(d.MachineNo) : null,
        location: d.Location || null,
        serialNo: d.SRNO || null,
        online: con.includes('connect') && !con.includes('disconnect'),
        rawStatus: d.con_status || null,
        lastConnected: d.con_date || null,
      };
    });
    res.json({
      ok: out.ok, status: out.status, message: out.ok ? undefined : out.message,
      devices, count: devices.length, httpStatus: out.httpStatus, durationMs: out.durationMs,
    });
  } catch (e) {
    console.error('etime.deviceStatus', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /raw-punches?fromDate=&toDate= — the RAW per-punch stream (read-only viewer;
// never persisted). Company-scoped; the range is validated by the same resolver
// the sync uses (real dates, from ≤ to, not future, capped span).
exports.rawPunches = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view raw punches.' });
    const companyId = targetCompanyId(req, req.query.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const creds = await settings.getDecryptedCreds(companyId);
    if (!creds || !settings.hasCredentials(creds._row)) {
      return res.json({ ok: false, status: 'NOT_CONFIGURED', message: 'Enter and save E-TimeOffice credentials to view raw punches.', punches: [] });
    }
    const range = sync.resolveWindow(creds, { fromDate: req.query.fromDate, toDate: req.query.toDate });
    if (range.error) return res.status(400).json({ ok: false, error: range.error });
    const out = await client.downloadPunchDataMCID(creds, { empCode: creds.empCode || 'ALL', fromDate: range.from, toDate: range.to });
    let raw = (out.punches || []).slice(0, 2000);
    // Optional device filter (Device Details view) — match by machine id.
    const machineId = req.query.machineId ? String(req.query.machineId) : null;
    if (machineId) raw = raw.filter((p) => String(p.MCID ?? p.mcid ?? '') === machineId);
    raw = raw.slice(0, 1000);

    // Device id → location (for the "DEVICE / LOCATION" column). One extra vendor call.
    const devMap = {};
    try {
      const ds = await client.deviceStatus(creds);
      for (const d of (ds.devices || [])) if (d.MachineNo != null) devMap[String(d.MachineNo)] = d.Location || null;
    } catch { /* non-fatal — location just shows blank */ }

    // Resolve punch codes → employee via the SAME index the sync uses (biometric →
    // employee code → device-number), branch-scoped to the connection. One build.
    const empIndex = await sync.buildEmployeeIndex(companyId, creds._row.branchId);
    const resolveCode = (code) => { const v = empIndex.resolve(code); return v && v.status === 'MATCHED' ? v.employee : null; };
    // Which (employee,date) already have an attendance row → SYNC STATUS = Synced.
    const resolvedByCode = {};
    for (const p of raw) { const code = p.Empcode != null ? String(p.Empcode).trim() : ''; if (code && !(code in resolvedByCode)) resolvedByCode[code] = resolveCode(code); }
    const empIds = [...new Set(Object.values(resolvedByCode).filter(Boolean).map((e) => e.id))];
    const syncSet = new Set();
    if (empIds.length) {
      const fromIso = dmyToIso(range.from), toIso = dmyToIso(range.to);
      const rows = await prisma.attendance.findMany({
        where: { companyId, employeeId: { in: empIds }, ...(fromIso && toIso ? { date: { gte: fromIso, lte: toIso } } : {}) },
        select: { employeeId: true, date: true },
      });
      for (const r of rows) syncSet.add(`${r.employeeId}|${r.date}`);
    }

    const punches = raw.map((p) => {
      const code = p.Empcode != null ? String(p.Empcode).trim() : null;
      const emp = code ? (resolvedByCode[code] || null) : null;
      const mid = p.MCID != null ? String(p.MCID) : (p.mcid != null ? String(p.mcid) : null);
      // MCID returns PunchDate as "dd/MM/yyyy HH:mm:ss" — split into date + time.
      const rawPd = String(p.DateString || p.PunchDate || '').trim();
      const spaceIdx = rawPd.indexOf(' ');
      const pd = spaceIdx > 0 ? rawPd.slice(0, spaceIdx) : rawPd;
      const pt = spaceIdx > 0 ? rawPd.slice(spaceIdx + 1) : (p.PunchTime || p.Time || p.INTime || '');
      const iso = dmyToIso(pd);
      const synced = emp && iso ? syncSet.has(`${emp.id}|${iso}`) : false;
      return {
        empCode: code,
        name: (emp && emp.name) || p.Name || null,
        punchDate: pd || null,
        punchTime: pt || null,
        machineId: mid,
        deviceLocation: mid ? (devMap[mid] || null) : null,
        department: (emp && emp.department) || null,
        direction: p.M_Flag || p.INOUT || null,
        syncStatus: synced ? 'Synced' : 'Pending',
      };
    });
    res.json({
      ok: out.ok, status: out.status, message: out.ok ? undefined : out.message,
      punches, count: punches.length, window: { from: range.from, to: range.to }, httpStatus: out.httpStatus,
    });
  } catch (e) {
    console.error('etime.rawPunches', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /attendance — paginated attendance list for the integration console (the
// "Attendance" sub-tab). Company-scoped; filters search / status / date range;
// joins the employee's business code + branch location. Reads the single-source
// attendance table (never invents rows).
exports.attendanceList = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view attendance.' });
    const companyId = targetCompanyId(req, req.query.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const from = String(req.query.fromDate || '').trim();
    const to = String(req.query.toDate || '').trim();

    const where = { companyId };
    if (status && status.toLowerCase() !== 'all') {
      // "Late" is NOT a status value — it's a flag on a (usually Present) row, the
      // same one the Overview counts. Filter by flags.isLate so the Late card /
      // Status=Late list reconciles with the Overview count instead of coming up empty.
      if (status.toLowerCase() === 'late') where.flags = { path: '$.isLate', equals: true };
      else where.status = status;
    }
    if (from || to) { where.date = {}; if (from) where.date.gte = from; if (to) where.date.lte = to; }
    if (search) {
      // Match the employee's name, their HRMS code (employeeId) OR the biometric /
      // device code (what the Raw Punches view shows and users naturally type).
      const byCode = await prisma.employee.findMany({
        where: { companyId, OR: [{ employeeId: { contains: search } }, { biometricId: { contains: search } }] },
        select: { id: true },
      });
      where.OR = [{ employeeName: { contains: search } }, { employeeId: { in: byCode.map((e) => e.id) } }];
    }

    const total = await prisma.attendance.count({ where });
    const rows = await prisma.attendance.findMany({
      where, orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize, take: pageSize,
    });
    // Join business code + branch for the visible page only.
    const ids = [...new Set(rows.map((r) => r.employeeId).filter(Boolean))];
    const emps = ids.length ? await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, employeeId: true, branch: { select: { branchName: true } } } }) : [];
    const empMap = Object.fromEntries(emps.map((e) => [e.id, e]));

    const data = rows.map((r) => {
      const f = readFlags(r.flags);
      const e = empMap[r.employeeId] || {};
      return {
        employee: r.employeeName || 'Unknown',
        empCode: e.employeeId || '—',
        date: r.date,
        firstIn: r.clockIn || '--:--',
        lastOut: r.clockOut || '--:--',
        workHrs: decHoursToHHMM(r.hoursWorked),
        late: minToHHMM(f.lateMinutes),
        earlyOut: minToHHMM(f.earlyExitMinutes),
        status: r.status || '—',
        location: (r.branch || (e.branch && e.branch.branchName)) || '--',
      };
    });
    res.json({ rows: data, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (e) {
    console.error('etime.attendanceList', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /analytics?days=30 — the daily Present/Late/Absent/Leave series for the
// Overview charts (donut = today from the dashboard; bar = this series). Company-scoped.
exports.analytics = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view analytics.' });
    const companyId = targetCompanyId(req, req.query.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));

    // Window: last `days` calendar days ending IST today.
    const today = sync.istTodayYMD();
    const end = new Date(Date.UTC(today.y, today.m - 1, today.d));
    const dates = [];
    for (let i = days - 1; i >= 0; i--) { const d = new Date(end); d.setUTCDate(d.getUTCDate() - i); dates.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`); }
    const fromIso = dates[0], toIso = dates[dates.length - 1];

    const rows = await prisma.attendance.findMany({
      where: { companyId, date: { gte: fromIso, lte: toIso } },
      select: { date: true, status: true, flags: true },
    });
    const bucket = Object.fromEntries(dates.map((d) => [d, { date: d, present: 0, late: 0, absent: 0, leave: 0 }]));
    for (const r of rows) {
      const b = bucket[r.date]; if (!b) continue;
      const s = String(r.status || '').toLowerCase();
      if (s.startsWith('present') || s.startsWith('half')) b.present++;
      else if (s.startsWith('absent')) b.absent++;
      else if (s.startsWith('leave')) b.leave++;
      if (readFlags(r.flags).isLate) b.late++;
    }
    const series = dates.map((d) => bucket[d]);
    const totals = series.reduce((a, s) => ({ present: a.present + s.present, late: a.late + s.late, absent: a.absent + s.absent, leave: a.leave + s.leave }), { present: 0, late: 0, absent: 0, leave: 0 });
    res.json({ days, from: fromIso, to: toIso, series, totals });
  } catch (e) {
    console.error('etime.analytics', e);
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
