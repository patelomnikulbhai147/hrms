/**
 * customReportController — the Custom Report Builder API (additive; touches no
 * existing report logic). Reports are stored as a single JSON config per row in
 * `custom_reports` so they reload/edit/duplicate without rebuilding. All reads and
 * writes are company-scoped (RULE 5) and role-checked; the actual data query runs
 * through the injection-safe [[customReportEngine]] over the [[customReportRegistry]]
 * allowlist.
 */
const crypto = require('crypto');
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { catalogFor, OPERATORS } = require('../services/customReportRegistry');
const { runReport } = require('../services/customReportEngine');
const { sendReportNow } = require('../services/customReportScheduler');
const templates = require('../services/customReportTemplates');

const companyScopeFor = (req) => [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const canAccess = (req) => ['Super Admin', 'Company Head', 'HR', 'Finance'].includes(req.user?.role);
const canManageAny = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);

// Company ids the caller may READ/RUN against (never widened by client input).
function scopeCompanyIds(req, requestedRaw) {
  const requested = idParam(requestedRaw);
  if (isSuperAdmin(req)) return requested ? [requested] : [];
  const scope = companyScopeFor(req);
  if (requested && scope.includes(requested)) return [requested];
  return scope;
}
// The single company a WRITE lands in.
function targetCompanyId(req, requestedRaw) {
  if (isSuperAdmin(req)) return idParam(requestedRaw) || null;
  return req.user?.companyId || null;
}

// ── Storage tables (created on first use; additive, no prisma generate needed) ──
// custom_reports          — one JSON config per saved report (+ a schedule column).
// custom_report_versions  — an append-only snapshot per save, for version history.
let _tableReady = null;
async function addColumnIfMissing(table, column, ddl) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, table, column);
  const count = Number(rows?.[0]?.c || 0);
  if (!count) await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
function ensureTable() {
  if (!_tableReady) {
    _tableReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS custom_reports (
          id CHAR(36) NOT NULL PRIMARY KEY,
          companyId INT NOT NULL,
          name VARCHAR(191) NOT NULL,
          description TEXT NULL,
          config JSON NOT NULL,
          visibility VARCHAR(32) NOT NULL DEFAULT 'private',
          isTemplate TINYINT(1) NOT NULL DEFAULT 0,
          schedule JSON NULL,
          ownerId INT NULL,
          ownerName VARCHAR(191) NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_cr_company (companyId),
          INDEX idx_cr_owner (ownerId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      // Additive columns for installs created before Phase 2 (idempotent).
      await addColumnIfMissing('custom_reports', 'schedule', 'schedule JSON NULL');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS custom_report_versions (
          id CHAR(36) NOT NULL PRIMARY KEY,
          reportId CHAR(36) NOT NULL,
          name VARCHAR(191) NULL,
          config JSON NOT NULL,
          savedById INT NULL,
          savedByName VARCHAR(191) NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_crv_report (reportId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((e) => { _tableReady = null; throw e; });
  }
  return _tableReady;
}

// Append a snapshot of a report's CURRENT state before it is overwritten, keeping
// the most recent 20 per report so history never grows unbounded.
async function snapshotVersion(row, req) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO custom_report_versions (id, reportId, name, config, savedById, savedByName) VALUES (?,?,?,?,?,?)`,
      crypto.randomUUID(), row.id, String(row.name || '').slice(0, 191), JSON.stringify(row.config || {}),
      req.user?.id || null, (req.user?.name || req.user?.email || '').slice(0, 191));
    const olds = await prisma.$queryRawUnsafe(
      `SELECT id FROM custom_report_versions WHERE reportId = ? ORDER BY createdAt DESC LIMIT 100 OFFSET 20`, row.id);
    if (olds.length) await prisma.$executeRawUnsafe(
      `DELETE FROM custom_report_versions WHERE id IN (${olds.map(() => '?').join(',')})`, ...olds.map((o) => o.id));
  } catch (e) { console.warn('customReport.snapshot', e.message); }
}

const parseJson = (v, fallback) => { try { return typeof v === 'string' ? JSON.parse(v) : (v ?? fallback); } catch { return fallback; } };
const parseRow = (r) => ({
  id: r.id, companyId: r.companyId, name: r.name, description: r.description || '',
  config: parseJson(r.config, {}),
  schedule: parseJson(r.schedule, null),
  visibility: r.visibility, isTemplate: !!r.isTemplate, ownerId: r.ownerId, ownerName: r.ownerName,
  createdAt: r.createdAt, updatedAt: r.updatedAt,
});

// Visibility gate for reads: a private report is owner-only; anything else is
// visible to the whole company (department/hr/admin scoping = Phase 2).
const canRead = (req, row) => row.visibility !== 'private' || row.ownerId === req.user?.id || canManageAny(req);
const canWrite = (req, row) => row.ownerId === req.user?.id || canManageAny(req);

// ── GET /meta — field catalog (role-filtered) + operators + templates ──
exports.meta = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    res.json({ sources: catalogFor(req.user?.role), operators: OPERATORS, templates: templates.list() });
  } catch (e) { console.error('customReport.meta', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── GET /templates/:key — a built-in template's full config ──
exports.template = async (req, res) => {
  if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
  const t = templates.get(req.params.key);
  if (!t) return res.status(404).json({ error: 'Template not found.' });
  res.json(t);
};

// ── GET / — list saved reports in scope (visibility-filtered) ──
exports.list = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    await ensureTable();
    const scope = scopeCompanyIds(req, req.query.companyId || req.headers['x-workspace-id']);
    if (!scope.length && !isSuperAdmin(req)) return res.json([]);
    let rows;
    if (scope.length) {
      const placeholders = scope.map(() => '?').join(',');
      rows = await prisma.$queryRawUnsafe(`SELECT * FROM custom_reports WHERE companyId IN (${placeholders}) ORDER BY updatedAt DESC`, ...scope);
    } else {
      rows = await prisma.$queryRawUnsafe(`SELECT * FROM custom_reports ORDER BY updatedAt DESC LIMIT 500`);
    }
    res.json(rows.map(parseRow).filter((r) => canRead(req, r)));
  } catch (e) { console.error('customReport.list', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

async function loadOne(id) {
  const rows = await prisma.$queryRawUnsafe(`SELECT * FROM custom_reports WHERE id = ? LIMIT 1`, String(id));
  return rows.length ? parseRow(rows[0]) : null;
}

// ── GET /:id — one saved report ──
exports.get = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    await ensureTable();
    const row = await loadOne(req.params.id);
    if (!row) return res.status(404).json({ error: 'Report not found.' });
    if (!scopeCompanyIds(req, row.companyId).includes(row.companyId) && !isSuperAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });
    if (!canRead(req, row)) return res.status(403).json({ error: 'This report is private.' });
    res.json(row);
  } catch (e) { console.error('customReport.get', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── POST / — create ──
exports.create = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    await ensureTable();
    const companyId = targetCompanyId(req, req.body?.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Report name is required.' });
    const config = req.body?.config && typeof req.body.config === 'object' ? req.body.config : {};
    const visibility = ['private', 'company', 'department', 'hr', 'admin'].includes(req.body?.visibility) ? req.body.visibility : 'private';
    const id = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO custom_reports (id, companyId, name, description, config, visibility, isTemplate, ownerId, ownerName) VALUES (?,?,?,?,?,?,?,?,?)`,
      id, companyId, name.slice(0, 191), String(req.body?.description || '').slice(0, 2000), JSON.stringify(config),
      visibility, req.body?.isTemplate ? 1 : 0, req.user?.id || null, (req.user?.name || req.user?.email || '').slice(0, 191),
    );
    res.status(201).json(await loadOne(id));
  } catch (e) { console.error('customReport.create', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── PUT /:id — update (owner or Company Head/Super Admin) ──
exports.update = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    await ensureTable();
    const row = await loadOne(req.params.id);
    if (!row) return res.status(404).json({ error: 'Report not found.' });
    if (!scopeCompanyIds(req, row.companyId).includes(row.companyId) && !isSuperAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });
    if (!canWrite(req, row)) return res.status(403).json({ error: 'Only the owner can edit this report.' });
    const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 191) : row.name;
    if (!name) return res.status(400).json({ error: 'Report name is required.' });
    const description = req.body?.description !== undefined ? String(req.body.description).slice(0, 2000) : row.description;
    const config = req.body?.config && typeof req.body.config === 'object' ? req.body.config : row.config;
    const visibility = ['private', 'company', 'department', 'hr', 'admin'].includes(req.body?.visibility) ? req.body.visibility : row.visibility;
    // Keep a version snapshot of the state we're about to replace (best-effort).
    await snapshotVersion(row, req);
    await prisma.$executeRawUnsafe(
      `UPDATE custom_reports SET name = ?, description = ?, config = ?, visibility = ? WHERE id = ?`,
      name, description, JSON.stringify(config), visibility, row.id,
    );
    res.json(await loadOne(row.id));
  } catch (e) { console.error('customReport.update', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── POST /:id/duplicate ──
exports.duplicate = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    await ensureTable();
    const row = await loadOne(req.params.id);
    if (!row) return res.status(404).json({ error: 'Report not found.' });
    if (!scopeCompanyIds(req, row.companyId).includes(row.companyId) && !isSuperAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });
    if (!canRead(req, row)) return res.status(403).json({ error: 'This report is private.' });
    const id = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO custom_reports (id, companyId, name, description, config, visibility, isTemplate, ownerId, ownerName) VALUES (?,?,?,?,?,?,?,?,?)`,
      id, row.companyId, `${row.name} (Copy)`.slice(0, 191), row.description, JSON.stringify(row.config),
      'private', 0, req.user?.id || null, (req.user?.name || req.user?.email || '').slice(0, 191),
    );
    res.status(201).json(await loadOne(id));
  } catch (e) { console.error('customReport.duplicate', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── DELETE /:id ──
exports.remove = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    await ensureTable();
    const row = await loadOne(req.params.id);
    if (!row) return res.status(404).json({ error: 'Report not found.' });
    if (!scopeCompanyIds(req, row.companyId).includes(row.companyId) && !isSuperAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });
    if (!canWrite(req, row)) return res.status(403).json({ error: 'Only the owner can delete this report.' });
    await prisma.$executeRawUnsafe(`DELETE FROM custom_reports WHERE id = ?`, row.id);
    res.json({ ok: true, id: row.id });
  } catch (e) { console.error('customReport.remove', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── POST /run — execute a config (ad-hoc live preview or export), company-scoped ──
exports.run = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    const config = req.body?.config && typeof req.body.config === 'object' ? req.body.config : null;
    if (!config) return res.status(400).json({ error: 'A report config is required.' });
    const companyIds = scopeCompanyIds(req, req.body?.companyId || req.headers['x-workspace-id']);
    if (!companyIds.length) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company to run against.' : 'Your account has no company.' });
    const result = await runReport(prisma, config, { companyIds, role: req.user?.role });
    if (result?.error) return res.status(400).json(result);
    res.json(result);
  } catch (e) { console.error('customReport.run', e); res.status(500).json({ error: e.message || 'Server error while running the report.' }); }
};

// ── GET /:id/versions — version history (most recent first) ──
exports.versions = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    await ensureTable();
    const row = await loadOne(req.params.id);
    if (!row) return res.status(404).json({ error: 'Report not found.' });
    if (!scopeCompanyIds(req, row.companyId).includes(row.companyId) && !isSuperAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });
    if (!canRead(req, row)) return res.status(403).json({ error: 'This report is private.' });
    const rows = await prisma.$queryRawUnsafe(`SELECT id, name, savedByName, createdAt FROM custom_report_versions WHERE reportId = ? ORDER BY createdAt DESC LIMIT 20`, row.id);
    res.json(rows);
  } catch (e) { console.error('customReport.versions', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── POST /:id/versions/:versionId/restore — roll a report back to a snapshot ──
exports.restoreVersion = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    await ensureTable();
    const row = await loadOne(req.params.id);
    if (!row) return res.status(404).json({ error: 'Report not found.' });
    if (!scopeCompanyIds(req, row.companyId).includes(row.companyId) && !isSuperAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });
    if (!canWrite(req, row)) return res.status(403).json({ error: 'Only the owner can edit this report.' });
    const vRows = await prisma.$queryRawUnsafe(`SELECT * FROM custom_report_versions WHERE id = ? AND reportId = ? LIMIT 1`, String(req.params.versionId), row.id);
    if (!vRows.length) return res.status(404).json({ error: 'Version not found.' });
    const cfg = parseJson(vRows[0].config, {});
    await snapshotVersion(row, req); // snapshot current before restoring
    await prisma.$executeRawUnsafe(`UPDATE custom_reports SET config = ? WHERE id = ?`, JSON.stringify(cfg), row.id);
    res.json(await loadOne(row.id));
  } catch (e) { console.error('customReport.restoreVersion', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// Validate + normalise a schedule payload (never trusts client shape).
function normalizeSchedule(body, req) {
  if (!body || body.enabled === false) return null;
  const freq = ['daily', 'weekly', 'monthly'].includes(body.freq) ? body.freq : 'daily';
  const time = /^\d{1,2}:\d{2}$/.test(body.time) ? body.time : '09:00';
  const recipients = Array.isArray(body.recipients) ? body.recipients.map((e) => String(e).trim()).filter((e) => e.includes('@')).slice(0, 25) : [];
  return {
    enabled: true, freq, time,
    weekday: Math.min(6, Math.max(0, Number(body.weekday) || 0)),
    day: Math.min(28, Math.max(1, Number(body.day) || 1)),
    recipients,
    format: ['csv', 'excel'].includes(body.format) ? body.format : 'excel',
    role: req.user?.role || 'Company Head',   // capture role → sensitive-field gating at run time
    lastRunAt: body.lastRunAt || null,
  };
}

// ── PUT /:id/schedule — set or clear a report's email schedule ──
exports.setSchedule = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    await ensureTable();
    const row = await loadOne(req.params.id);
    if (!row) return res.status(404).json({ error: 'Report not found.' });
    if (!scopeCompanyIds(req, row.companyId).includes(row.companyId) && !isSuperAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });
    if (!canWrite(req, row)) return res.status(403).json({ error: 'Only the owner can schedule this report.' });
    const schedule = normalizeSchedule(req.body?.schedule, req);
    if (schedule && !schedule.recipients.length) return res.status(400).json({ error: 'Add at least one recipient email.' });
    await prisma.$executeRawUnsafe(`UPDATE custom_reports SET schedule = ? WHERE id = ?`, schedule ? JSON.stringify(schedule) : null, row.id);
    res.json(await loadOne(row.id));
  } catch (e) { console.error('customReport.setSchedule', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

// ── POST /:id/send — run + email the report now (manual trigger / test) ──
exports.sendNow = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    await ensureTable();
    const row = await loadOne(req.params.id);
    if (!row) return res.status(404).json({ error: 'Report not found.' });
    if (!scopeCompanyIds(req, row.companyId).includes(row.companyId) && !isSuperAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });
    if (!canRead(req, row)) return res.status(403).json({ error: 'This report is private.' });
    const recipients = Array.isArray(req.body?.recipients) && req.body.recipients.length
      ? req.body.recipients : (row.schedule?.recipients || []);
    const format = ['csv', 'excel'].includes(req.body?.format) ? req.body.format : (row.schedule?.format || 'excel');
    const out = await sendReportNow(row, { recipients, format, role: req.user?.role });
    if (!out.ok) return res.status(400).json({ error: out.error || 'Could not send the report.' });
    res.json(out);
  } catch (e) { console.error('customReport.sendNow', e); res.status(500).json({ error: e.message || 'Server error' }); }
};
