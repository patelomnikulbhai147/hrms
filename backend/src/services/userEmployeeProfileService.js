// ─────────────────────────────────────────────────────────────────────────────
// USER → EMPLOYEE PROFILE — every company login user is a real member of staff.
//
// Business rule (Enterprise Slot Management): Company Heads, HR and every other
// company user consume one employee slot and appear in the Employee Directory
// exactly like any other employee — same profile, same code generator, same
// reports. This service is the ONE place that creates or links that profile:
//
//   • If an Employee row already matches (explicit code from the form, or the
//     same email inside the tenant) → LINK it (User.employeeId), no new row,
//     no extra slot consumed.
//   • Otherwise → CREATE an Employee row through the standard code generator
//     (same numbering system as every other employee) and link it.
//
// Callers: userController.createCompanyUser, companyProvisioning (Company Head
// at self-registration), scripts/backfillManagementEmployeeProfiles.js.
// Failure here must never destroy a user account — the limit service's
// unlinked-user safety net still counts the user until a profile exists.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');
const { generateEmployeeCode, validateCustomCode } = require('../utils/employeeCode');
const { ACTIVE_EMPLOYEE_WHERE } = require('../utils/employeeStatus');
const { tenantCompanyIds, resolveHead } = require('./employeeLimitService');

/** An existing Employee row this user should link to instead of creating one. */
async function findLinkableEmployee(user) {
  const head = await resolveHead(user.companyId);
  if (!head) return null;
  const ids = await tenantCompanyIds(head.id);
  const code = String(user?.permissions?.profile?.employeeCode || '').trim().toUpperCase();
  if (code) {
    const byCode = await prisma.employee.findFirst({
      where: { companyId: { in: ids }, employeeId: code },
    });
    if (byCode) return byCode;
  }
  const email = String(user.email || '').trim().toLowerCase();
  if (email) {
    const byEmail = await prisma.employee.findFirst({
      where: { companyId: { in: ids }, email, ...ACTIVE_EMPLOYEE_WHERE },
    });
    if (byEmail) return byEmail;
  }
  return null;
}

/**
 * Ensure `user` has a linked Employee profile. Idempotent.
 * Returns { employee, action: 'existing' | 'linked' | 'created' } or
 * { employee: null, action: 'skipped', reason } for non-company users.
 */
async function ensureEmployeeProfileForUser(user, opts = {}) {
  if (!user || user.role === 'Super Admin' || !user.companyId) {
    return { employee: null, action: 'skipped', reason: 'not a company user' };
  }

  // Already linked and the row still exists → nothing to do.
  if (user.employeeId) {
    const existing = await prisma.employee.findUnique({ where: { id: Number(user.employeeId) } });
    if (existing) return { employee: existing, action: 'existing' };
  }

  // Link an existing member of staff rather than duplicating them.
  const linkable = await findLinkableEmployee(user);
  if (linkable) {
    await prisma.user.update({ where: { id: user.id }, data: { employeeId: linkable.id } });
    return { employee: linkable, action: 'linked' };
  }

  // Create the profile through the SAME code generator as every employee.
  const profile = user?.permissions?.profile || {};
  const preferredCode = String(profile.employeeCode || '').trim();
  let code = null;
  if (preferredCode) {
    const v = await validateCustomCode(preferredCode, null, user.companyId);
    if (v.ok) code = v.code; // taken/invalid → fall through to auto-generation
  }
  if (!code) code = await generateEmployeeCode(user.branchId || null, user.companyId);

  const employee = await prisma.employee.create({
    data: {
      employeeId: code,
      companyId: Number(user.companyId),
      branchId: user.branchId ? Number(user.branchId) : null,
      name: user.name,
      email: String(user.email || '').toLowerCase(),
      phone: profile.mobile || null,
      department: String(profile.department || '').trim() || 'General',
      designation: String(profile.designation || '').trim() || user.role,
      // Employee.role is the staff-level label; management users keep their
      // real function visible in the directory.
      role: user.role === 'Employee' ? 'Staff' : user.role,
      employmentType: profile.employmentType || 'Full-time',
      status: user.status === 'Active' ? 'Active' : 'Inactive',
      joinDate: opts.joinDate ? new Date(opts.joinDate) : (user.createdAt ? new Date(user.createdAt) : new Date()),
      salary: 0,
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { employeeId: employee.id } });
  return { employee, action: 'created' };
}

module.exports = { ensureEmployeeProfileForUser, findLinkableEmployee };
