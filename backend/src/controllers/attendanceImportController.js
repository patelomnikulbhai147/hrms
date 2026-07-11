/**
 * Attendance Import — Pre-Phase 5 SAFETY VALIDATION ONLY.
 *
 * This module validates device punches against the safety rules and records the
 * outcome (import log + unmatched queue). It DOES NOT create attendance and DOES
 * NOT call any vendor API. Phase 5 will reuse `attendanceMatcher.resolvePunch`
 * to actually import the MATCHED punches.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { resolvePunch, STATUS, QUEUEABLE } = require('../services/attendanceMatcher');
const { processAttendanceRows } = require('../services/attendanceSheetService');

const companyScopeFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const canView = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);
const canManage = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);

// Resolve which company a write targets, honouring RULE 5 isolation: a non-admin
// can only ever act on their own company; an admin must name the company.
function targetCompanyId(req, requested) {
  if (isSuperAdmin(req)) return idParam(requested) || null;
  return req.user?.companyId || null;
}

/**
 * POST /validate — run the safety checks over a batch of punches (DRY RUN).
 * Body: { companyId?, deviceId?, punches: [{ biometricCode, punchTime }] }.
 * Writes one import-log row per punch and queues every non-matched punch.
 * Returns a per-status summary. NO attendance is created.
 */
exports.validate = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to validate attendance imports.' });
    const companyId = targetCompanyId(req, req.body?.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company to validate against.' : 'Your account has no company.' });
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) return res.status(400).json({ error: 'Selected company does not exist.' });

    const deviceId = idParam(req.body?.deviceId) || null;
    const punches = Array.isArray(req.body?.punches) ? req.body.punches : [];
    if (!punches.length) return res.status(400).json({ error: 'No punches to validate.' });

    const summary = { total: punches.length, MATCHED: 0, NO_BIOMETRIC_CODE: 0, UNMATCHED: 0, DUPLICATE_CODE: 0 };
    const details = [];

    for (const p of punches) {
      const biometricCode = p?.biometricCode;
      const punchTime = p?.punchTime != null ? String(p.punchTime) : null;
      const verdict = await resolvePunch(prisma, { companyId, biometricCode });

      // Audit every punch (RULE 6).
      await prisma.attendanceImportLog.create({
        data: {
          companyId, deviceId,
          biometricCode: biometricCode != null ? String(biometricCode).slice(0, 191) : null,
          employeeId: verdict.employee?.id || null,
          employeeCode: verdict.employee?.employeeId || null,
          employeeName: verdict.employee?.name || null,
          punchTime, status: verdict.status, message: verdict.message,
        },
      });

      // Park anything that is not safe to import (RULES 1/2/3).
      if (QUEUEABLE.has(verdict.status)) {
        await prisma.unmatchedAttendance.create({
          data: {
            companyId, deviceId,
            biometricCode: biometricCode != null ? String(biometricCode).slice(0, 191) : null,
            punchTime, reason: verdict.status, message: verdict.message,
            rawPayload: p?.raw ? String(p.raw).slice(0, 4000) : null,
          },
        });
      }

      if (summary[verdict.status] !== undefined) summary[verdict.status]++;
      details.push({ biometricCode, punchTime, status: verdict.status, message: verdict.message, employee: verdict.employee ? { id: verdict.employee.id, employeeId: verdict.employee.employeeId, name: verdict.employee.name } : null });
    }

    res.json({ companyId, attendanceCreated: 0, note: 'Safety validation only — no attendance was created.', summary, details });
  } catch (e) {
    console.error('attendanceImport.validate', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

/**
 * POST /process — the REAL Attendance Excel Import engine (creates/updates
 * attendance). Body: { companyId?, fileName?, dryRun?, options?, rows:[...] }.
 * rows are canonical punch rows from the client parser:
 *   { rowNo, employeeKey, altKey?, date, inTime?, outTime?, punchTime?, status?, shift? }.
 * Matching, status derivation, idempotent upsert, OT queueing and payroll
 * flagging all live in attendanceSheetService (company-isolated, RULE 5).
 */
exports.process = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to import attendance.' });
    const companyId = targetCompanyId(req, req.body?.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company to import into.' : 'Your account has no company.' });
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) return res.status(400).json({ error: 'Selected company does not exist.' });

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'No rows to import.' });
    if (rows.length > 100000) return res.status(400).json({ error: 'Too many rows in one import (limit 100,000). Split the file.' });

    // dryRun may arrive at the top level (the client sends { dryRun, rows }) or
    // inside options — honour BOTH. Without this the top-level flag was dropped and
    // a "preview" silently COMMITTED (there must never be a direct upload).
    const options = { ...(req.body?.options || {}) };
    if (req.body?.dryRun !== undefined) options.dryRun = !!req.body.dryRun;

    const result = await processAttendanceRows(prisma, {
      companyId,
      rows,
      options,
      actor: { id: req.user?.id, name: req.user?.name || req.user?.email },
    });

    // Audit the import (best-effort — never blocks the response).
    if (!result.dryRun && req.user?.id) {
      try {
        await prisma.auditLog.create({
          data: {
            userId: req.user.id, action: 'IMPORT_ATTENDANCE', module: 'Attendance',
            targetId: String(companyId),
            details: JSON.stringify({
              companyId, file: String(req.body?.fileName || '').slice(0, 191),
              by: req.user.name || req.user.email,
              total: result.summary.total, imported: result.summary.imported,
              updated: result.summary.updated, skipped: result.summary.skipped,
              errors: result.summary.errors, overtimeQueued: result.summary.overtimeQueued,
            }).slice(0, 1000),
          },
        });
      } catch (_) { /* audit best-effort */ }
    }

    res.json(result);
  } catch (e) {
    console.error('attendanceImport.process', e);
    res.status(500).json({ error: e.message || 'Server error during attendance import.' });
  }
};

// Build a company-scoped WHERE that enforces RULE 5 for reads.
function scopedWhere(req) {
  const workspaceId = idParam(req.query.companyId || req.headers['x-workspace-id']);
  if (isSuperAdmin(req)) return workspaceId ? { companyId: workspaceId } : {};
  const scope = companyScopeFor(req);
  if (workspaceId && !scope.includes(workspaceId)) return null; // unauthorized
  return { companyId: workspaceId || { in: scope.length ? scope : [-1] } };
}

// GET /logs — import-log audit trail, company-scoped.
exports.getLogs = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view import logs.' });
    const where = scopedWhere(req);
    if (where === null) return res.status(403).json({ error: 'Unauthorized to view this workspace.' });
    if (req.query.status) where.status = String(req.query.status);
    const logs = await prisma.attendanceImportLog.findMany({ where, orderBy: { importDate: 'desc' }, take: 500 });
    res.json(logs);
  } catch (e) {
    console.error('attendanceImport.getLogs', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /history — past Excel import runs (audit trail), company-scoped. Reads the
// IMPORT_ATTENDANCE audit rows written by `process`, so HR can reopen a previous
// import's summary (file, who, when, totals). Read-only.
exports.getHistory = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view import history.' });
    // Which companies this caller may see (audit rows are keyed by targetId=companyId string).
    let companyIds;
    if (isSuperAdmin(req)) {
      const ws = idParam(req.query.companyId || req.headers['x-workspace-id']);
      companyIds = ws ? [ws] : null; // null → all
    } else {
      const scope = companyScopeFor(req);
      companyIds = scope.length ? scope : [-1];
    }
    const where = { action: 'IMPORT_ATTENDANCE' };
    if (companyIds) where.targetId = { in: companyIds.map(String) };
    const rows = await prisma.auditLog.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 50,
      include: { user: { select: { name: true, email: true } } },
    });
    const history = rows.map((r) => {
      let d = {};
      try { d = JSON.parse(r.details || '{}'); } catch (_) { d = {}; }
      return {
        id: r.id,
        fileName: d.file || '—',
        importedBy: d.by || r.user?.name || r.user?.email || '—',
        importDate: r.createdAt,
        total: d.total ?? null, imported: d.imported ?? null, updated: d.updated ?? null,
        skipped: d.skipped ?? null, errors: d.errors ?? null, overtimeQueued: d.overtimeQueued ?? null,
      };
    });
    res.json(history);
  } catch (e) {
    console.error('attendanceImport.getHistory', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /unmatched — unmatched queue, company-scoped (unresolved by default).
exports.getUnmatched = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view the unmatched queue.' });
    const where = scopedWhere(req);
    if (where === null) return res.status(403).json({ error: 'Unauthorized to view this workspace.' });
    if (req.query.all !== '1' && req.query.all !== 'true') where.resolved = false;
    const rows = await prisma.unmatchedAttendance.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
    res.json(rows);
  } catch (e) {
    console.error('attendanceImport.getUnmatched', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// PUT /unmatched/:id/resolve — mark a queued item as handled (company-scoped).
exports.resolveUnmatched = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to resolve queue items.' });
    const id = idParam(req.params.id);
    const row = await prisma.unmatchedAttendance.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ error: 'Queue item not found.' });
    if (!isSuperAdmin(req) && !companyScopeFor(req).includes(row.companyId)) {
      return res.status(403).json({ error: 'Unauthorized for this queue item.' });
    }
    const updated = await prisma.unmatchedAttendance.update({ where: { id }, data: { resolved: true } });
    res.json(updated);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Queue item not found.' });
    console.error('attendanceImport.resolveUnmatched', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
