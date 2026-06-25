/**
 * Mobile App — Dashboard controller (/api/app/*).
 * Available ONLY after HR approval (requireApproved). Reads the converted Employee's
 * real data from the existing tables. Read endpoints are defensive — they return
 * empty collections rather than erroring if a record set is missing.
 */
const prisma = require('../config/prisma');
const { ok, fail } = require('./appResponse');

const emp = (req) => req.appCtx.employee;
const today = () => new Date().toISOString().slice(0, 10);

// GET /api/app/dashboard — at-a-glance summary.
exports.dashboard = async (req, res) => {
  try {
    const e = emp(req);
    const [company, branch, todays, pendingLeaves, latestPayroll] = await Promise.all([
      e.companyId ? prisma.company.findUnique({ where: { id: e.companyId }, select: { name: true } }).catch(() => null) : null,
      e.branchId ? prisma.branch.findUnique({ where: { id: e.branchId }, select: { branchName: true } }).catch(() => null) : null,
      prisma.attendance.findFirst({ where: { employeeId: e.id, date: today() } }).catch(() => null),
      prisma.leaveRequest.count({ where: { employeeId: e.id, status: 'Pending' } }).catch(() => 0),
      prisma.payroll.findFirst({ where: { employeeId: e.id }, orderBy: { id: 'desc' } }).catch(() => null),
    ]);
    return ok(res, {
      employeeId: e.employeeId,
      name: e.name,
      designation: e.designation,
      department: e.department,
      company: company?.name || null,
      branch: branch?.branchName || e.branchLocation || null,
      todayAttendance: todays ? { status: todays.status, clockIn: todays.clockIn, clockOut: todays.clockOut } : { status: 'Not Marked' },
      pendingLeaveRequests: pendingLeaves,
      latestPayrollNet: latestPayroll?.netSalary ?? null,
    }, 'Dashboard loaded.');
  } catch (e) {
    return fail(res, 'Could not load the dashboard.', { status: 500, code: 'SERVER_ERROR' });
  }
};

// GET /api/app/profile — the approved employee profile.
exports.profile = async (req, res) => {
  const e = emp(req);
  const [company, branch] = await Promise.all([
    e.companyId ? prisma.company.findUnique({ where: { id: e.companyId }, select: { id: true, name: true } }).catch(() => null) : null,
    e.branchId ? prisma.branch.findUnique({ where: { id: e.branchId }, select: { id: true, branchName: true } }).catch(() => null) : null,
  ]);
  return ok(res, {
    employeeId: e.employeeId, name: e.name, firstName: e.firstName, lastName: e.lastName,
    email: e.email, mobile: e.phone, department: e.department, designation: e.designation,
    company: company ? { id: company.id, name: company.name } : null,
    branch: branch ? { id: branch.id, name: branch.branchName } : null,
    joinDate: e.joinDate, dob: e.dob, gender: e.gender, bloodGroup: e.bloodGroup || null,
    aadhaar: e.aadhaar, pan: e.pan, bankName: e.bankName, accountNumber: e.accountNumber, ifsc: e.ifsc,
    presentAddress: e.presentAddress, permanentAddress: e.permanentAddress,
    profileImage: e.photoUpload || e.avatar || '',
  }, 'Profile loaded.');
};

// GET /api/app/profile/documents
exports.documents = async (req, res) => {
  const e = emp(req);
  return ok(res, { photo: e.photoUpload || null, documents: e.documents || {} }, 'Documents loaded.');
};

// PUT /api/app/profile/update — limited self-service edits post-approval.
exports.updateProfile = async (req, res) => {
  const e = emp(req);
  const b = req.body || {};
  const ALLOWED = ['email', 'phone', 'presentAddress', 'permanentAddress', 'emergencyContact'];
  const data = {}; for (const k of ALLOWED) if (k in b) data[k] = b[k] === '' ? null : b[k];
  if (!Object.keys(data).length) return ok(res, {}, 'Nothing to update.');
  const updated = await prisma.employee.update({ where: { id: e.id }, data });
  return ok(res, { email: updated.email, phone: updated.phone, presentAddress: updated.presentAddress }, 'Profile updated.');
};

// GET /api/app/attendance?month=&year=
exports.attendance = async (req, res) => {
  const e = emp(req);
  const rows = await prisma.attendance.findMany({ where: { employeeId: e.id }, orderBy: { date: 'desc' }, take: 60 }).catch(() => []);
  const records = rows.map((r) => ({ date: r.date, status: r.status, clockIn: r.clockIn, clockOut: r.clockOut, hoursWorked: r.hoursWorked }));
  const present = records.filter((r) => /present/i.test(r.status)).length;
  return ok(res, { summary: { totalRecords: records.length, presentDays: present }, records }, 'Attendance loaded.');
};

// GET /api/app/leave
exports.leave = async (req, res) => {
  const e = emp(req);
  const rows = await prisma.leaveRequest.findMany({ where: { employeeId: e.id }, orderBy: { id: 'desc' }, take: 50 }).catch(() => []);
  return ok(res, { requests: rows.map((r) => ({ id: r.id, leaveType: r.leaveType, fromDate: r.fromDate, toDate: r.toDate, days: r.days, reason: r.reason, status: r.status, appliedOn: r.appliedOn })) }, 'Leave loaded.');
};

// POST /api/app/leave/apply — { leaveType, fromDate, toDate, days, reason }
exports.applyLeave = async (req, res) => {
  try {
    const e = emp(req);
    const b = req.body || {};
    const missing = ['leaveType', 'fromDate', 'toDate'].filter((k) => !String(b[k] || '').trim());
    if (missing.length) return fail(res, 'leaveType, fromDate and toDate are required.', { status: 422, code: 'VALIDATION_FAILED', errors: missing.map((f) => ({ code: 'MISSING_FIELD', field: f, message: `${f} is required.` })) });
    const created = await prisma.leaveRequest.create({
      data: {
        companyId: e.companyId, employeeId: e.id, employeeName: e.name, department: e.department || 'General',
        leaveType: String(b.leaveType), fromDate: String(b.fromDate), toDate: String(b.toDate),
        days: Number(b.days) || 1, reason: String(b.reason || ''), status: 'Pending', appliedOn: today(),
      },
    });
    return ok(res, { id: created.id, status: created.status }, 'Leave application submitted.', 201);
  } catch (e) {
    return fail(res, 'Could not submit the leave application.', { status: 500, code: 'SERVER_ERROR' });
  }
};

// GET /api/app/payroll
exports.payroll = async (req, res) => {
  const e = emp(req);
  const rows = await prisma.payroll.findMany({ where: { employeeId: e.id }, orderBy: { id: 'desc' }, take: 24 }).catch(() => []);
  return ok(res, { payslips: rows.map((r) => ({ id: r.id, month: r.month, year: r.year, basicSalary: r.basicSalary, allowances: r.allowances, deductions: r.deductions, netSalary: r.netSalary, paymentStatus: r.paymentStatus, payslipGenerated: r.payslipGenerated })) }, 'Payroll loaded.');
};

// GET /api/app/notifications
exports.notifications = async (req, res) => {
  const e = emp(req);
  const rows = await prisma.notification.findMany({
    where: { OR: [{ companyId: e.companyId }, { branchId: e.branchId || -1 }] },
    orderBy: { id: 'desc' }, take: 50,
  }).catch(() => []);
  return ok(res, { notifications: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, message: n.message, read: n.read, timestamp: n.timestamp })) }, 'Notifications loaded.');
};

// GET /api/app/holiday — holiday list (no dedicated table yet → empty, defensive).
exports.holiday = async (_req, res) => ok(res, { holidays: [] }, 'Holidays loaded.');
