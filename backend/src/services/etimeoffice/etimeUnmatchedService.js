// ─────────────────────────────────────────────────────────────────────────────
// etimeUnmatchedService — the Unmatched Queue + biometric-mapping resolver.
//
// When a punch can't be matched (no employee in the company carries that
// biometric code — RULE 2), the sync engine parks the FULL raw record in the
// unmatched queue instead of discarding it. This service lets HR/Admin map a
// device code to an employee and, on Resolve, REPLAYS every historical punch for
// that code into the attendance table using the exact same writer the live sync
// uses (etimeSyncService.importOne) — so no data is lost and both paths behave
// identically. Company-isolated throughout (RULE 5).
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../../config/prisma');
const syncService = require('./etimeSyncService');

const parsePayload = (raw) => {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

// Suggest the most likely employee for a device code within a company. Priority:
// (1) an employee whose Employee Code equals the device code exactly, else
// (2) an employee whose Employee Code ends with the code (ignoring leading zeros).
// Never suggests an employee who already carries a DIFFERENT biometric code.
async function suggestEmployee(companyId, code) {
  const c = String(code || '').trim();
  if (!c) return null;
  const stripped = c.replace(/^0+/, '') || c;
  const candidates = await prisma.employee.findMany({
    where: { companyId, OR: [{ employeeId: c }, { employeeId: stripped }, { employeeId: { endsWith: stripped } }] },
    select: { id: true, employeeId: true, name: true, biometricId: true },
    take: 5,
  });
  const exact = candidates.find((e) => e.employeeId === c || e.employeeId === stripped);
  const pick = exact || candidates[0] || null;
  return pick ? { id: pick.id, employeeId: pick.employeeId, name: pick.name, biometricIdSet: !!pick.biometricId } : null;
}

/**
 * listUnmatched — the queue grouped by biometric code (one card per code with a
 * punch count, the newest sample punch, the reason and a suggested employee).
 * Blank-code and duplicate-code rows are surfaced too so nothing is hidden.
 */
async function listUnmatched(companyId) {
  const rows = await prisma.unmatchedAttendance.findMany({
    where: { companyId, resolved: false },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const groups = new Map();
  for (const r of rows) {
    const key = r.biometricCode == null || r.biometricCode === '' ? '(blank)' : r.biometricCode;
    let g = groups.get(key);
    if (!g) { g = { biometricCode: r.biometricCode || '', count: 0, reason: r.reason, sampleName: null, samplePunch: null, firstSeen: r.createdAt, lastSeen: r.createdAt, ids: [] }; groups.set(key, g); }
    g.count++;
    g.ids.push(r.id);
    if (r.createdAt < g.firstSeen) g.firstSeen = r.createdAt;
    if (r.createdAt > g.lastSeen) g.lastSeen = r.createdAt;
    if (!g.samplePunch) {
      const rec = parsePayload(r.rawPayload);
      g.samplePunch = r.punchTime || (rec ? `${rec.DateString || ''} ${rec.INTime || ''}`.trim() : null);
      g.sampleName = rec ? rec.Name : null;
    }
  }

  const list = Array.from(groups.values()).sort((a, b) => b.count - a.count);
  // Attach a suggested employee per real code (skip the blank bucket).
  for (const g of list) {
    g.suggestedEmployee = g.biometricCode ? await suggestEmployee(companyId, g.biometricCode) : null;
  }
  return list;
}

// Lightweight, company-scoped employee list for the mapping dropdown. Includes
// whether each already has a biometric code so the UI can warn on reassignment.
async function employeesForMapping(companyId, q = '') {
  const term = String(q || '').trim();
  const where = { companyId };
  if (term) where.OR = [{ name: { contains: term } }, { employeeId: { contains: term } }, { biometricId: { contains: term } }];
  const emps = await prisma.employee.findMany({
    where,
    select: { id: true, employeeId: true, name: true, biometricId: true, department: true },
    orderBy: { name: 'asc' },
    take: 500,
  });
  return emps.map((e) => ({ id: e.id, employeeId: e.employeeId, name: e.name, department: e.department, biometricId: e.biometricId || '' }));
}

/**
 * resolve — map a device code to an employee, then replay ALL of that code's
 * historical unmatched punches into attendance.
 *
 *   1. Validate the employee is in THIS company (RULE 5).
 *   2. Guard against a code collision (another employee already owns the code).
 *   3. Persist employee.biometricId = code (so future syncs match automatically).
 *   4. Replay every unresolved unmatched row for the code → importOne (idempotent).
 *   5. Mark those queue rows resolved.
 *
 * @returns {Promise<{ ok, imported, updated, failed, skipped, employee, error? }>}
 */
async function resolve(companyId, biometricCode, employeeId, actor = null) {
  const code = String(biometricCode || '').trim();
  const empId = Number(employeeId);
  if (!code) return { ok: false, error: 'A biometric code is required to resolve.' };
  if (!Number.isFinite(empId)) return { ok: false, error: 'Select an employee to map this biometric code to.' };

  const employee = await prisma.employee.findFirst({
    where: { id: empId, companyId },
    select: { id: true, employeeId: true, name: true, biometricId: true, department: true, branch: { select: { branchName: true } } },
  });
  if (!employee) return { ok: false, error: 'That employee was not found in this company.' };

  // Collision guard — a biometric code must be unique within a company so it can
  // never match two people (which would otherwise become a DUPLICATE_CODE later).
  const clash = await prisma.employee.findFirst({
    where: { companyId, biometricId: code, NOT: { id: empId } },
    select: { id: true, employeeId: true, name: true },
  });
  if (clash) {
    return { ok: false, error: `Biometric code "${code}" is already assigned to ${clash.name} (${clash.employeeId}). Unassign it there first, or pick that employee.` };
  }

  // 3 — persist the mapping so all FUTURE syncs match this employee automatically.
  await prisma.employee.update({ where: { id: empId }, data: { biometricId: code } });

  // 4/5 — replay history. Pull the department/branch once for the shared writer.
  const details = { department: employee.department || 'General', branch: (employee.branch && employee.branch.branchName) || null };
  const queued = await prisma.unmatchedAttendance.findMany({
    where: { companyId, resolved: false, biometricCode: code },
    orderBy: { createdAt: 'asc' },
  });

  const summary = { imported: 0, updated: 0, failed: 0, skipped: 0, total: queued.length };
  const resolvedIds = [];
  for (const row of queued) {
    const rec = parsePayload(row.rawPayload);
    if (!rec) { summary.skipped++; resolvedIds.push(row.id); continue; } // unparseable → clear it out
    try {
      const outcome = await syncService.importOne(prisma, companyId, employee, rec, details);
      if (outcome === 'updated') summary.updated++;
      else if (outcome === 'created') summary.imported++;
      else summary.skipped++;
      resolvedIds.push(row.id);
    } catch (e) {
      summary.failed++; // never silently fail — leave the row queued for retry
    }
  }

  if (resolvedIds.length) {
    await prisma.unmatchedAttendance.updateMany({
      where: { id: { in: resolvedIds } },
      data: { resolved: true, message: `Mapped to ${employee.name} (${employee.employeeId})${actor ? ` by ${actor}` : ''} and imported.` },
    });
  }

  // Also log the resolution outcome as a per-punch audit line (kept concise).
  await prisma.attendanceImportLog.create({
    data: {
      companyId, biometricCode: code.slice(0, 191), employeeId: employee.id, employeeCode: employee.employeeId, employeeName: employee.name,
      status: 'MATCHED', message: `Resolved: mapped code ${code} → ${employee.name}; imported ${summary.imported}, updated ${summary.updated}, failed ${summary.failed}.`,
    },
  }).catch(() => {});

  return { ok: true, ...summary, employee: { id: employee.id, employeeId: employee.employeeId, name: employee.name } };
}

/**
 * ignore — dismiss unmatched punches WITHOUT importing (e.g. a decommissioned
 * device code). Marks resolved so they leave the queue but stay auditable.
 */
async function ignore(companyId, { biometricCode, id } = {}) {
  const where = { companyId, resolved: false };
  if (id != null) where.id = Number(id);
  else if (biometricCode != null) where.biometricCode = String(biometricCode);
  else return { ok: false, error: 'Provide an id or biometricCode to ignore.' };
  const r = await prisma.unmatchedAttendance.updateMany({ where, data: { resolved: true, message: 'Ignored by administrator (not imported).' } });
  return { ok: true, ignored: r.count };
}

module.exports = { listUnmatched, employeesForMapping, suggestEmployee, resolve, ignore };
