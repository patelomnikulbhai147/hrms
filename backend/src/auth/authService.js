/**
 * Auth resolver + profile builder for the v1 mobile auth module.
 *
 * Resolves a login identifier (Mobile / Employee ID / Email) to an existing User
 * (the auth identity that `protect` loads), optionally joined to its Employee
 * record for the rich app profile. Purely READ-ONLY against existing tables.
 */
const prisma = require('../config/prisma');

const digitsOf = (m) => String(m == null ? '' : m).replace(/\D/g, '');
const isEmail = (s) => /@/.test(String(s || ''));
const isActive = (status) => String(status || '').toLowerCase() === 'active';

// Pull the first non-empty identifier from a flexible body.
function pickIdentifier(body = {}) {
  const raw = body.mobile || body.employeeId || body.email || body.identifier || body.username || '';
  return String(raw).trim();
}

// Find the Employee record behind a mobile number or an employee CODE (e.g. VE-AHM-001).
async function findEmployee(identifier) {
  const id = String(identifier || '').trim();
  if (!id) return null;
  // Employee code (exact, case-insensitive via MySQL collation).
  const byCode = await prisma.employee.findFirst({ where: { employeeId: id } }).catch(() => null);
  if (byCode) return byCode;
  // Mobile — exact then digit-normalised.
  const digits = digitsOf(id);
  if (digits.length >= 6) {
    const byPhone = await prisma.employee.findFirst({ where: { phone: id } }).catch(() => null);
    if (byPhone) return byPhone;
    const candidates = await prisma.employee.findMany({
      where: { phone: { not: null } },
      select: { id: true, employeeId: true, name: true, firstName: true, lastName: true, email: true, phone: true, department: true, designation: true, companyId: true, branchId: true, branchLocation: true, status: true, photoUpload: true, avatar: true },
    });
    return candidates.find((e) => digitsOf(e.phone) === digits) || null;
  }
  return null;
}

// Resolve the auth User for a login identifier. Returns { user, employee } or
// { error: { status, code, message } }.
async function resolveUser(body) {
  const identifier = pickIdentifier(body);
  if (!identifier) return { error: { status: 400, code: 'IDENTIFIER_REQUIRED', message: 'Provide a mobile number, employee ID, or email.' } };

  let user = null;
  let employee = null;

  if (isEmail(identifier)) {
    user = await prisma.user.findFirst({ where: { email: identifier } }).catch(() => null);
    if (user?.employeeId) employee = await prisma.employee.findUnique({ where: { id: user.employeeId } }).catch(() => null);
    if (!employee) employee = await prisma.employee.findFirst({ where: { email: identifier } }).catch(() => null);
  } else {
    employee = await findEmployee(identifier);
    if (employee) {
      // Linked User first, then a User sharing the employee's email.
      user = await prisma.user.findFirst({ where: { employeeId: employee.id } }).catch(() => null);
      if (!user && employee.email) user = await prisma.user.findFirst({ where: { email: employee.email } }).catch(() => null);
    }
    // Last resort: treat the identifier as a username.
    if (!user) user = await prisma.user.findFirst({ where: { username: identifier } }).catch(() => null);
  }

  if (!user) return { error: { status: 404, code: 'USER_NOT_FOUND', message: 'No account is registered for that identifier.' } };
  if (!isActive(user.status)) return { error: { status: 403, code: 'ACCOUNT_INACTIVE', message: 'Account inactive. Please contact your administrator.' } };

  // If linked to an employee, ensure the branch isn't disabled/archived.
  if (!employee && user.employeeId) employee = await prisma.employee.findUnique({ where: { id: user.employeeId } }).catch(() => null);
  if (employee?.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: employee.branchId } }).catch(() => null);
    if (branch && (branch.isArchived || /disabled|inactive|suspended/i.test(String(branch.status || '')))) {
      return { error: { status: 403, code: 'BRANCH_DISABLED', message: 'Branch disabled. Please contact your administrator.' } };
    }
  }

  return { user, employee };
}

// Flatten the permission matrix into the array form Flutter expects, e.g.
// ["attendance.view", "leave.create", ...].
function flattenPermissions(user) {
  const raw = (user.permissions && user.permissions.permissions) || {};
  const out = [];
  for (const [mod, actions] of Object.entries(raw)) {
    if (actions && typeof actions === 'object') {
      for (const [action, enabled] of Object.entries(actions)) if (enabled === true) out.push(`${mod}.${action}`);
    }
  }
  return out;
}

// Build the complete, Flutter-ready user object.
async function buildProfile(user, employee) {
  const companyId = employee?.companyId || user.companyId || null;
  const branchId = employee?.branchId || user.branchId || null;
  const [company, branch] = await Promise.all([
    companyId ? prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } }).catch(() => null) : null,
    branchId ? prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, branchName: true } }).catch(() => null) : null,
  ]);

  const firstName = employee?.firstName || (user.name || '').split(' ')[0] || '';
  const lastName = employee?.lastName || (user.name || '').split(' ').slice(1).join(' ') || '';

  return {
    id: user.id,
    userId: user.id,
    employeeRecordId: employee?.id || null,
    employeeId: employee?.employeeId || null,         // official code e.g. VE-AHM-001
    employeeCode: employee?.employeeId || null,
    firstName,
    lastName,
    name: employee?.name || user.name || `${firstName} ${lastName}`.trim(),
    email: user.email || employee?.email || null,
    mobile: employee?.phone || null,
    company: company ? { id: company.id, name: company.name } : null,
    branch: branch ? { id: branch.id, name: branch.branchName } : null,
    department: employee?.department || null,
    designation: employee?.designation || null,
    role: user.role,
    permissions: flattenPermissions(user),
    permissionMatrix: (user.permissions && user.permissions.permissions) || {},
    moduleAccess: (user.permissions && user.permissions.moduleAccess) || {},
    profileImage: employee?.photoUpload || employee?.avatar || user.avatar || '',
    themePreference: null,    // reserved for future use
    languagePreference: null, // reserved for future use
    isFirstLogin: !user.lastLoginAt,
    isPasswordCreated: !!user.passwordHash,
  };
}

module.exports = { resolveUser, buildProfile, flattenPermissions, pickIdentifier };
