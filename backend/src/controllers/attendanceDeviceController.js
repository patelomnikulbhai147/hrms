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
      include: DEVICE_INCLUDE,
    });
    res.json(devices);
  } catch (e) {
    console.error('attendanceDevice.getAll', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.getOne = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view attendance devices.' });
    const id = idParam(req.params.id);
    const device = await prisma.attendanceDevice.findUnique({ where: { id }, include: DEVICE_INCLUDE });
    if (!device) return res.status(404).json({ error: 'Device not found.' });
    if (req.user.role !== 'Super Admin') {
      const allowed = [...companyScopeFor(req), ...branchScopeFor(req)];
      const ok = allowed.includes(device.companyId) || (device.branchId && allowed.includes(device.branchId));
      if (!ok) return res.status(403).json({ error: 'Unauthorized to view this device.' });
    }
    res.json(device);
  } catch (e) {
    console.error('attendanceDevice.getOne', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to add attendance devices.' });
    const b = req.body || {};
    if (!b.deviceName || !String(b.deviceName).trim()) {
      return res.status(400).json({ error: 'Device name is required.' });
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

    const device = await prisma.attendanceDevice.create({
      data: { ...shapeFields(b), status: b.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE', companyId, branchId },
      include: DEVICE_INCLUDE,
    });
    res.status(201).json(device);
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
    const data = shapeFields(body);

    // Reassigning a device to a different company is Super-Admin only.
    if (req.user.role === 'Super Admin' && body.companyId !== undefined) {
      const companyId = idParam(body.companyId);
      const company = companyId && await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) return res.status(400).json({ error: 'Selected company does not exist.' });
      data.companyId = companyId;
    }
    if (body.branchId !== undefined) {
      data.branchId = await resolveBranchId(body.branchId);
    }

    const device = await prisma.attendanceDevice.update({ where: { id }, data, include: DEVICE_INCLUDE });
    res.json(device);
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

// POST /:id/test-connection — TCP reachability + response time; persists result.
exports.testConnection = async (req, res) => {
  try {
    const device = await loadForDiagnostics(req);
    const r = await deviceProbe.testConnection(device.deviceIp, device.port || 4370);
    const updated = await prisma.attendanceDevice.update({
      where: { id: device.id },
      data: {
        lastTestAt: new Date(),
        lastTestStatus: r.ok ? 'CONNECTED' : 'FAILED',
        lastTestResponseMs: r.responseMs ?? null,
      },
      include: DEVICE_INCLUDE,
    });
    res.json({ ok: r.ok, responseMs: r.responseMs, error: r.error || null, device: updated });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error('attendanceDevice.testConnection', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /push-logs — recent raw device push logs for the Live Device Monitor (Phase 6).
exports.getPushLogs = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to view device push logs.' });
    const logs = await prisma.devicePushLog.findMany({ orderBy: { receivedAt: 'desc' }, take: 200 });
    res.json(logs);
  } catch (e) {
    console.error('attendanceDevice.getPushLogs', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST /:id/discover — read-only protocol probe (ZK handshake + info/counts) with raw bytes.
exports.discover = async (req, res) => {
  try {
    const device = await loadForDiagnostics(req);
    const r = await deviceProbe.discover(device.deviceIp, device.port || 4370);
    res.json(r);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error('attendanceDevice.discover', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
