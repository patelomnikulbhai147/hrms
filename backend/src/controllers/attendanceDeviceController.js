/**
 * Attendance Device Management — Phase 1 (infrastructure / registry only).
 *
 * CRUD for biometric attendance devices. This module deliberately does NOT:
 *   - connect to any biometric machine,
 *   - run any sync service, or
 *   - touch attendance calculation logic.
 * The existing `attendance` table remains the single source of attendance truth.
 *
 * Reads are workspace-scoped. Mutations are role-gated (mirrors the spec):
 *   - Super Admin  : view all, create/edit/delete, assign devices to any company
 *   - Company Head : view + create/edit within their own company (no delete)
 *   - HR           : view only
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const deviceProbe = require('../services/deviceProbe');
const { encrypt } = require('../utils/secretCrypto');

// Vendor validity is data-driven: a vendor is valid iff it exists and is active
// in the attendance_vendors registry. No vendor names are hardcoded here, so new
// vendors are supported by adding a registry row — never by editing this file.
async function isValidVendor(name) {
  if (!name || !String(name).trim()) return false;
  const v = await prisma.attendanceVendor.findFirst({ where: { name: String(name).trim(), isActive: true } });
  return !!v;
}

// Strip the encrypted apiPassword from any device before returning it to the
// client; expose only a boolean indicating whether a password is on file.
const sanitize = (d) => {
  if (!d) return d;
  const { apiPassword, ...rest } = d;
  return { ...rest, apiPasswordSet: !!apiPassword };
};

const companyScopeFor = (req) =>
  [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
const branchScopeFor = (req) =>
  (req.user?.accessibleBranchIds || []).filter(Boolean);

const canView = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);
const canManage = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role); // create / edit
const canDelete = (req) => req.user?.role === 'Super Admin';

const DEVICE_INCLUDE = {
  company: { select: { id: true, name: true } },
  branch: { select: { id: true, branchName: true } },
};

// Explicit select of ONLY the core, always-present columns (+ relations). Used
// for every read/write so a query never references debug/phase-only columns
// (lastTestAt/lastTestStatus/lastTestResponseMs) that may not exist in every
// deployed database. This keeps the page working without any schema migration.
const DEVICE_SELECT = {
  id: true, companyId: true, branchId: true, deviceName: true,
  deviceIp: true, port: true, serialNumber: true, deviceType: true,
  status: true, lastSync: true, createdAt: true, updatedAt: true,
  // Phase 2 config fields. apiPassword is selected only so sanitize() can derive
  // the apiPasswordSet boolean — the ciphertext itself is never sent to clients.
  attendanceVendor: true, apiBaseUrl: true, corporateId: true, apiUsername: true,
  apiPassword: true, deviceLocation: true, syncEnabled: true, syncIntervalMinutes: true,
  company: { select: { id: true, name: true } },
  branch: { select: { id: true, branchName: true } },
};

// Map an incoming body to the editable scalar columns (never id/company/branch —
// those are resolved separately so they can be validated/role-gated).
const shapeFields = (b) => {
  const out = {};
  if (b.deviceName !== undefined) out.deviceName = String(b.deviceName).trim();
  if (b.deviceIp !== undefined) out.deviceIp = b.deviceIp ? String(b.deviceIp).trim() : null;
  if (b.port !== undefined) out.port = (b.port === '' || b.port === null) ? null : Number(b.port);
  if (b.serialNumber !== undefined) out.serialNumber = b.serialNumber ? String(b.serialNumber).trim() : null;
  if (b.deviceType !== undefined) out.deviceType = b.deviceType ? String(b.deviceType).trim() : null;
  if (b.status !== undefined) out.status = b.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  // Phase 2 config fields (apiPassword is handled separately so it can be encrypted).
  if (b.attendanceVendor !== undefined) out.attendanceVendor = b.attendanceVendor ? String(b.attendanceVendor).trim() : null;
  if (b.apiBaseUrl !== undefined) out.apiBaseUrl = b.apiBaseUrl ? String(b.apiBaseUrl).trim() : null;
  if (b.corporateId !== undefined) out.corporateId = b.corporateId ? String(b.corporateId).trim() : null;
  if (b.apiUsername !== undefined) out.apiUsername = b.apiUsername ? String(b.apiUsername).trim() : null;
  if (b.deviceLocation !== undefined) out.deviceLocation = b.deviceLocation ? String(b.deviceLocation).trim() : null;
  if (b.syncEnabled !== undefined) out.syncEnabled = b.syncEnabled === true || b.syncEnabled === 'true' || b.syncEnabled === 1 || b.syncEnabled === '1';
  if (b.syncIntervalMinutes !== undefined) out.syncIntervalMinutes = (b.syncIntervalMinutes === '' || b.syncIntervalMinutes === null) ? null : Number(b.syncIntervalMinutes);
  return out;
};

// Validate a branch id against the DB; an invalid/blank one becomes null instead
// of bubbling up a raw foreign-key error.
async function resolveBranchId(value) {
  let branchId = idParam(value);
  if (!branchId) return null;
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  return branch ? branchId : null;
}

exports.getAll = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view attendance devices.' });
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let where = {};
    if (req.user.role !== 'Super Admin') {
      const companyScope = companyScopeFor(req);
      const branchScope = branchScopeFor(req);
      where.OR = [
        { companyId: { in: companyScope } },
        { branchId: { in: branchScope.length ? branchScope : companyScope } },
      ];
      if (companyId) {
        const allowed = [...companyScope, ...branchScope];
        if (!allowed.includes(companyId)) {
          return res.status(403).json({ error: 'Unauthorized to view this workspace\'s devices.' });
        }
        where.OR = [{ companyId }, { branchId: companyId }];
      }
    } else if (companyId) {
      where.OR = [{ companyId }, { branchId: companyId }];
    }
    const devices = await prisma.attendanceDevice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: DEVICE_SELECT,
    });
    res.json(devices.map(sanitize));
  } catch (e) {
    console.error('attendanceDevice.getAll', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.getOne = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view attendance devices.' });
    const id = idParam(req.params.id);
    const device = await prisma.attendanceDevice.findUnique({ where: { id }, select: DEVICE_SELECT });
    if (!device) return res.status(404).json({ error: 'Device not found.' });
    if (req.user.role !== 'Super Admin') {
      const allowed = [...companyScopeFor(req), ...branchScopeFor(req)];
      const ok = allowed.includes(device.companyId) || (device.branchId && allowed.includes(device.branchId));
      if (!ok) return res.status(403).json({ error: 'Unauthorized to view this device.' });
    }
    res.json(sanitize(device));
  } catch (e) {
    console.error('attendanceDevice.getOne', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to add attendance devices.' });
    const b = req.body || {};
    // ── Required-field validation (Phase 2): Device Name, Vendor, Company, Branch ──
    if (!b.deviceName || !String(b.deviceName).trim()) {
      return res.status(400).json({ error: 'Device name is required.' });
    }
    if (!b.attendanceVendor || !String(b.attendanceVendor).trim()) {
      return res.status(400).json({ error: 'Attendance vendor is required.' });
    }
    if (!(await isValidVendor(b.attendanceVendor))) {
      return res.status(400).json({ error: 'Invalid or inactive attendance vendor.' });
    }

    // Company assignment: Super Admin chooses any company; everyone else is
    // pinned to their own company (client-supplied companyId is ignored).
    let companyId = req.user.role === 'Super Admin'
      ? idParam(b.companyId || req.headers['x-workspace-id'])
      : req.user.companyId;
    if (!companyId) return res.status(400).json({ error: 'Company is required.' });
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return res.status(400).json({ error: 'Selected company does not exist.' });

    const branchId = await resolveBranchId(b.branchId);
    if (!branchId) return res.status(400).json({ error: 'Branch is required.' });

    const data = { ...shapeFields(b), status: b.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE', companyId, branchId };
    // Encrypt the vendor API password at rest (only when one was provided).
    if (b.apiPassword && String(b.apiPassword).trim() !== '') data.apiPassword = encrypt(String(b.apiPassword));

    const device = await prisma.attendanceDevice.create({ data, select: DEVICE_SELECT });
    res.status(201).json(sanitize(device));
  } catch (e) {
    console.error('attendanceDevice.create', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to edit attendance devices.' });
    const id = idParam(req.params.id);
    const existing = await prisma.attendanceDevice.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Device not found.' });

    // Company-scoped users may only edit devices inside their own workspace.
    if (req.user.role !== 'Super Admin') {
      const allowed = [...companyScopeFor(req), ...branchScopeFor(req)];
      if (!allowed.includes(existing.companyId)) {
        return res.status(403).json({ error: 'Unauthorized to edit this device.' });
      }
    }

    const body = req.body || {};
    // Validate fields that are present (Vendor must stay valid; Branch must stay set).
    if (body.deviceName !== undefined && !String(body.deviceName).trim()) {
      return res.status(400).json({ error: 'Device name is required.' });
    }
    if (body.attendanceVendor !== undefined) {
      const v = String(body.attendanceVendor || '').trim();
      if (!v) return res.status(400).json({ error: 'Attendance vendor is required.' });
      if (!(await isValidVendor(v))) return res.status(400).json({ error: 'Invalid or inactive attendance vendor.' });
    }
    const data = shapeFields(body);

    // Reassigning a device to a different company is Super-Admin only.
    if (req.user.role === 'Super Admin' && body.companyId !== undefined) {
      const companyId = idParam(body.companyId);
      const company = companyId && await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) return res.status(400).json({ error: 'Selected company does not exist.' });
      data.companyId = companyId;
    }
    if (body.branchId !== undefined) {
      const branchId = await resolveBranchId(body.branchId);
      if (!branchId) return res.status(400).json({ error: 'Branch is required.' });
      data.branchId = branchId;
    }
    // Update the API password only when a new non-blank value is supplied; a blank
    // value leaves the stored (encrypted) password unchanged.
    if (body.apiPassword !== undefined && String(body.apiPassword).trim() !== '') {
      data.apiPassword = encrypt(String(body.apiPassword));
    }

    const device = await prisma.attendanceDevice.update({ where: { id }, data, select: DEVICE_SELECT });
    res.json(sanitize(device));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Device not found.' });
    console.error('attendanceDevice.update', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    if (!canDelete(req)) return res.status(403).json({ error: 'Only a Super Admin can delete attendance devices.' });
    const id = idParam(req.params.id);
    await prisma.attendanceDevice.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Device not found.' });
    console.error('attendanceDevice.remove', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// ── Phase 5: read-only diagnostics ──────────────────────────────────────────
// Fetch the device + enforce workspace scope (diagnostics are management-only).
async function loadForDiagnostics(req) {
  if (!canManage(req)) { const e = new Error('You do not have permission to run device diagnostics.'); e.status = 403; throw e; }
  const id = idParam(req.params.id);
  const device = await prisma.attendanceDevice.findUnique({ where: { id } });
  if (!device) { const e = new Error('Device not found.'); e.status = 404; throw e; }
  if (req.user.role !== 'Super Admin') {
    const allowed = [...companyScopeFor(req), ...branchScopeFor(req)];
    if (!allowed.includes(device.companyId)) { const e = new Error('Unauthorized for this device.'); e.status = 403; throw e; }
  }
  if (!device.deviceIp) { const e = new Error('Device has no IP address configured.'); e.status = 400; throw e; }
  return device;
}

// ── Temporarily disabled features ───────────────────────────────────────────
// Device communication (test-connection / discover) and the push-log monitor are
// intentionally turned off for now. They are stubbed so they NEVER touch the
// device_push_logs table, the terminalType column, or the phase-only
// attendance_devices columns — none of which are required for the page to work.
// These endpoints remain mounted (no route changes) and simply return graceful,
// user-safe payloads instead of querying anything.

// POST /:id/test-connection — disabled (no device communication, no DB writes).
exports.testConnection = async (req, res) => {
  res.json({ ok: false, error: 'Device diagnostics are currently disabled.' });
};

// GET /push-logs — disabled. Returns an empty list so the (hidden) monitor never
// queries device_push_logs / its phase columns.
exports.getPushLogs = async (req, res) => {
  res.json([]);
};

// POST /:id/discover — disabled (no device communication).
exports.discover = async (req, res) => {
  res.json({ error: 'Device discovery is currently disabled.' });
};
