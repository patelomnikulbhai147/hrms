/**
 * Attendance Vendor registry — the configurable catalog that makes the device
 * module vendor-driven. Adding a new vendor (eSSL, Matrix, ZKTeco, BioMax, …) is
 * a DATA operation (a row here), never a code change.
 *
 *   - View  : any authenticated user (needed to populate the device form dropdown)
 *   - Manage: Super Admin only (create / edit / delete)
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

const isSuperAdmin = (req) => req.user?.role === 'Super Admin';

const VENDOR_SELECT = {
  id: true, name: true, displayName: true, defaultBaseUrl: true,
  authType: true, isActive: true, notes: true, settings: true,
  sortOrder: true, createdAt: true, updatedAt: true,
};

const shape = (b) => {
  const out = {};
  if (b.name !== undefined) out.name = String(b.name).trim();
  if (b.displayName !== undefined) out.displayName = b.displayName ? String(b.displayName).trim() : null;
  if (b.defaultBaseUrl !== undefined) out.defaultBaseUrl = b.defaultBaseUrl ? String(b.defaultBaseUrl).trim() : null;
  if (b.authType !== undefined) out.authType = b.authType ? String(b.authType).trim() : null;
  if (b.isActive !== undefined) out.isActive = b.isActive === true || b.isActive === 'true' || b.isActive === 1 || b.isActive === '1';
  if (b.notes !== undefined) out.notes = b.notes ? String(b.notes).trim() : null;
  if (b.sortOrder !== undefined) out.sortOrder = Number(b.sortOrder) || 0;
  // settings accepts an object or a JSON string; stored as a JSON string.
  if (b.settings !== undefined) {
    out.settings = b.settings == null ? null
      : (typeof b.settings === 'string' ? b.settings : JSON.stringify(b.settings));
  }
  return out;
};

// GET / — active vendors for everyone; Super Admin may pass ?all=1 to see inactive too.
exports.getAll = async (req, res) => {
  try {
    const showAll = isSuperAdmin(req) && (req.query.all === '1' || req.query.all === 'true');
    const vendors = await prisma.attendanceVendor.findMany({
      where: showAll ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: VENDOR_SELECT,
    });
    res.json(vendors);
  } catch (e) {
    console.error('attendanceVendor.getAll', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Only a Super Admin can manage vendors.' });
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Vendor name is required.' });
    const exists = await prisma.attendanceVendor.findUnique({ where: { name: String(b.name).trim() } });
    if (exists) return res.status(409).json({ error: 'A vendor with this name already exists.' });
    const vendor = await prisma.attendanceVendor.create({ data: { ...shape(b), name: String(b.name).trim() }, select: VENDOR_SELECT });
    res.status(201).json(vendor);
  } catch (e) {
    console.error('attendanceVendor.create', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Only a Super Admin can manage vendors.' });
    const id = idParam(req.params.id);
    const data = shape(req.body || {});
    if (data.name) {
      const clash = await prisma.attendanceVendor.findFirst({ where: { name: data.name, NOT: { id } } });
      if (clash) return res.status(409).json({ error: 'Another vendor already uses this name.' });
    }
    const vendor = await prisma.attendanceVendor.update({ where: { id }, data, select: VENDOR_SELECT });
    res.json(vendor);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Vendor not found.' });
    console.error('attendanceVendor.update', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Only a Super Admin can manage vendors.' });
    const id = idParam(req.params.id);
    const vendor = await prisma.attendanceVendor.findUnique({ where: { id } });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });
    // Guard against removing a vendor still referenced by devices.
    const inUse = await prisma.attendanceDevice.count({ where: { attendanceVendor: vendor.name } });
    if (inUse > 0) return res.status(409).json({ error: `Cannot delete: ${inUse} device(s) still use this vendor. Deactivate it instead.` });
    await prisma.attendanceVendor.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Vendor not found.' });
    console.error('attendanceVendor.remove', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
