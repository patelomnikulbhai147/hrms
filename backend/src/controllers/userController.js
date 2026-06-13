const bcrypt = require('bcryptjs');
const idParam = require('../utils/idParam');
const respondError = require('../utils/respondError');
// Shared PrismaClient singleton (with ID-coercion middleware). Do NOT create a
// second `new PrismaClient()` here — every extra instance opens its own MySQL
// connection pool, and those idle connections get reaped by MySQL's wait_timeout
// and then reused dead, surfacing as "the socket connection was closed
// unexpectedly". One pool for the whole server.
const prisma = require('../config/prisma');

exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const user = await prisma.user.findUnique({ where: { id: idParam(id) } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { id: idParam(id) },
      data: {
        password: newPassword, // Store plaintext just for fallback if needed, but strictly use hash for auth
        passwordHash: passwordHash
      }
    });

    // We can log this to audit logs
    await prisma.auditLog.create({
      data: {
        userId: req.user ? req.user.id : user.id,
        action: 'RESET_PASSWORD',
        module: 'Users',
        targetId: user.id,
        details: JSON.stringify({ message: 'Admin reset password' })
      }
    });

    res.json({ message: 'Password reset successfully', user: { id: updatedUser.id, username: updatedUser.username } });
  } catch (error) {
    return respondError(res, error);
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status, accessibleCompanyIds, permissions, moduleAccess } = req.body;

    const user = await prisma.user.findUnique({ where: { id: idParam(id) } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Merge moduleAccess into permissions for Prisma if needed, or handle it based on schema
    // The frontend sends `moduleAccess` and `permissions` which we can store in the `permissions` JSON field
    let combinedPermissions = user.permissions || {};
    if (permissions) combinedPermissions.permissions = permissions;
    if (moduleAccess) combinedPermissions.moduleAccess = moduleAccess;

    const dataToUpdate = {};
    if (role) dataToUpdate.role = role;
    if (status) dataToUpdate.status = status;
    if (accessibleCompanyIds) dataToUpdate.accessibleCompanyIds = accessibleCompanyIds;
    if (permissions || moduleAccess) dataToUpdate.permissions = combinedPermissions;

    const updatedUser = await prisma.user.update({
      where: { id: idParam(id) },
      data: dataToUpdate
    });

    if (accessibleCompanyIds || permissions || moduleAccess) {
      await prisma.auditLog.create({
        data: {
          userId: req.user ? req.user.id : user.id,
          action: 'UPDATE_PERMISSIONS',
          module: 'Users',
          targetId: user.id,
          details: JSON.stringify({
            workspaces: accessibleCompanyIds,
            permissionsUpdated: !!permissions,
            moduleAccessUpdated: !!moduleAccess
          })
        }
      }).catch(err => console.error('Failed to write audit log:', err));
    }

    const parsedPerms = updatedUser.permissions || {};
    res.json({
      ...updatedUser,
      permissions: parsedPerms.permissions || {},
      moduleAccess: parsedPerms.moduleAccess || {}
    });
  } catch (error) {
    return respondError(res, error);
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, username, password, role, companyId, status, accessibleCompanyIds, permissions, moduleAccess } = req.body;

    // Specific field-level validation so the UI can point at the real gap
    // instead of a generic "fill all fields".
    const missing = [];
    if (!name || !String(name).trim()) missing.push('Full name');
    if (!email || !String(email).trim()) missing.push('Email');
    if (!username || !String(username).trim()) missing.push('Username');
    if (missing.length) {
      return res.status(400).json({
        error: missing.length === 1
          ? `${missing[0]} is required.`
          : `Please complete all required fields: ${missing.join(', ')}.`,
        code: 'REQUIRED_MISSING',
      });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.', code: 'VALIDATION' });
    }
    if (password && String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.', code: 'VALIDATION' });
    }
    if (role !== 'Super Admin' && !companyId) {
      return res.status(400).json({ error: 'Please assign a company to this user.', code: 'REQUIRED_MISSING' });
    }

    // Pre-flight duplicate check so we can name the exact conflicting field
    // (the DB unique index is the real guard; this just gives a precise message).
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(409).json({ error: 'A user with this email already exists.', code: 'DUPLICATE' });
      }
      return res.status(409).json({ error: 'This username is already taken.', code: 'DUPLICATE' });
    }

    const passwordHash = await bcrypt.hash(password || 'welcome123', 10);

    let combinedPermissions = {};
    if (permissions) combinedPermissions.permissions = permissions;
    if (moduleAccess) combinedPermissions.moduleAccess = moduleAccess;

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        username,
        password: 'REDACTED',
        passwordHash,
        role: role || 'Employee',
        companyId,
        status: status || 'Active',
        accessibleCompanyIds: accessibleCompanyIds || [companyId],
        permissions: combinedPermissions
      }
    });

    const parsedPerms = newUser.permissions || {};
    res.status(201).json({
      ...newUser,
      permissions: parsedPerms.permissions || {},
      moduleAccess: parsedPerms.moduleAccess || {}
    });
  } catch (error) {
    return respondError(res, error, { action: 'create user', resource: 'user' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      // Default ordering by ascending primary key. The id sequence may contain
      // gaps (e.g. a deleted/rolled-back row) — that is expected and the ids are
      // never re-sequenced; the UI shows a derived SR No instead of the raw id.
      orderBy: { id: 'asc' }
    });
    // Remove passwordHash before sending
    const safeUsers = users.map(u => {
      const { passwordHash, password, permissions: rawPermissions, ...rest } = u;
      const parsedPerms = rawPermissions || {};
      return { 
        ...rest, 
        passwordStr: password, 
        password,
        permissions: parsedPerms.permissions || {},
        moduleAccess: parsedPerms.moduleAccess || {}
      };
    });
    res.json(safeUsers);
  } catch (error) {
    return respondError(res, error);
  }
};

// ── Assignable management users for Task Manager ─────────────────────────────
// Returns ONLY authorized management users (never regular employees/staff),
// scoped to the caller's permission boundary:
//   Super Admin   → all management users (frontend offers company/branch filters)
//   Company Admin → management users within their company
//   HR/Branch     → management users within their assigned company/branch
// Each row is enriched with companyName + branchName for the @mention card.
const MANAGEMENT_ROLES = ['Super Admin', 'Company Head', 'Company Admin', 'HR', 'HR Admin', 'Finance', 'Branch Admin', 'Manager'];

exports.getAssignableUsers = async (req, res) => {
  try {
    const role = req.user?.role;
    // Server-side search query (name / email / role). Empty search returns at most
    // `limit` users so the client never downloads the whole user table — the mention
    // box stays fast with thousands of users (Slack/Jira-style server-side search).
    const search = String(req.query.search || '').trim();
    const limit = Math.min(25, Math.max(1, Number(req.query.limit) || 10));
    const filterCompanyId = req.query.companyId ? idParam(req.query.companyId) : null;
    const filterBranchId = req.query.branchId ? idParam(req.query.branchId) : null;

    // Lenient status: include everyone EXCEPT explicitly deactivated accounts, so
    // a non-standard status string can never silently hide valid management users.
    const and = [];
    const where = {
      role: { in: MANAGEMENT_ROLES },
      NOT: { status: { in: ['Disabled', 'Archived', 'Suspended', 'Inactive', 'Deactivated'] } },
    };

    if (role !== 'Super Admin') {
      const allowed = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
      and.push({ OR: [{ companyId: { in: allowed } }, { branchId: { in: allowed } }] });
    }
    if (search) {
      // NAME contains (anywhere) + EMAIL starts-with (local part). Role is excluded
      // (so "om" doesn't match "C(om)pany Head") and email uses startsWith rather
      // than contains (so "om" doesn't match every ".c(om)" address).
      and.push({ OR: [{ name: { contains: search } }, { email: { startsWith: search } }] });
    }
    if (and.length) where.AND = and;

    // Pull a slightly larger candidate set so the post-enrichment company/branch
    // context filter can still return up to `limit` rows.
    const users = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, companyId: true, branchId: true, avatar: true, employeeId: true },
      orderBy: { name: 'asc' },
      take: limit * 4,
    });

    // Resolve company + branch display names in one pass.
    const companyIds = [...new Set(users.map(u => u.companyId).filter(Boolean))];
    const branchIds = [...new Set(users.map(u => u.branchId).filter(Boolean))];
    const [companies, branches] = await Promise.all([
      prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }),
      prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, branchName: true, companyId: true } }),
    ]);
    const companyName = Object.fromEntries(companies.map(c => [c.id, c.name]));
    const branchById = Object.fromEntries(branches.map(b => [b.id, b]));

    let enriched = users.map(u => {
      const br = u.branchId != null ? branchById[u.branchId] : null;
      // Top-level company this user rolls up to: their own company if it is a
      // real company, otherwise the parent company of their branch.
      const resolvedCompanyId = companyName[u.companyId] ? u.companyId : (br ? br.companyId : u.companyId);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        companyId: u.companyId,
        branchId: u.branchId,
        resolvedCompanyId,
        employeeId: u.employeeId,
        avatar: u.avatar || null,
        companyName: companyName[u.companyId] || (br ? companyName[br.companyId] : null) || null,
        branchName: br ? br.branchName : null,
      };
    });

    // Company / branch context filters (used by the Super Admin company picker and
    // by branch workspaces). A branch filter keeps that branch's users AND
    // company-wide admins (no branch) — company managers oversee every branch.
    if (filterCompanyId) {
      enriched = enriched.filter(u => String(u.resolvedCompanyId ?? u.companyId) === String(filterCompanyId));
    }
    if (filterBranchId) {
      enriched = enriched.filter(u => String(u.branchId) === String(filterBranchId) || u.branchId == null);
    }

    res.json(enriched.slice(0, limit));
  } catch (error) {
    return respondError(res, error);
  }
};

// ── Company-level permission management ──────────────────────────────────────
// Resolve a user's TOP-LEVEL company (their company if real, else their branch's
// parent) so company isolation can never be fooled by the branch/company id space.
async function resolveTopCompany(rawCompanyId, rawBranchId) {
  let companyId = rawCompanyId || null;
  if (rawBranchId) {
    const br = await prisma.branch.findUnique({ where: { id: rawBranchId } }).catch(() => null);
    if (br) return br.companyId;
  }
  if (companyId) {
    const co = await prisma.company.findUnique({ where: { id: companyId } }).catch(() => null);
    if (!co) {
      const br = await prisma.branch.findUnique({ where: { id: companyId } }).catch(() => null);
      if (br) return br.companyId;
    } else if (co.parentCompanyId) {
      return co.parentCompanyId;
    }
  }
  return companyId;
}

// Whether the caller may manage permissions at all, and the scope they manage.
function permissionManagerScope(req) {
  const role = req.user?.role;
  if (role === 'Super Admin') return { canManage: true, all: true };
  if (role === 'Company Head' || role === 'Company Admin') return { canManage: true, company: true };
  if (role === 'HR' || role === 'HR Admin' || role === 'Branch Admin') {
    const perms = req.user?.permissions || {};
    const granular = perms.permissions || {};
    const moduleAccess = perms.moduleAccess || {};
    const granted = moduleAccess.users !== false &&
      (granular.users?.manage === true || granular.users?.edit === true || granular.settings?.manage === true);
    return { canManage: granted, branch: true };
  }
  return { canManage: false };
}

// GET /api/users/manageable — users the caller is allowed to manage permissions for.
exports.getManageableUsers = async (req, res) => {
  try {
    const scope = permissionManagerScope(req);
    if (!scope.canManage) return res.status(403).json({ error: 'You do not have permission to manage user roles & permissions.' });

    const users = await prisma.user.findMany({
      where: { NOT: { status: { in: ['Archived'] } } },
      select: { id: true, name: true, email: true, role: true, companyId: true, branchId: true, status: true, avatar: true, permissions: true, accessibleCompanyIds: true },
      orderBy: { name: 'asc' },
    });

    const callerCompany = scope.all ? null : await resolveTopCompany(req.user.companyId, req.user.branchId);
    const callerBranch = req.user.branchId || null;

    const branchIds = [...new Set(users.map(u => u.branchId).filter(Boolean))];
    const companyIds2 = [...new Set(users.map(u => u.companyId).filter(Boolean))];
    const [branches, companies] = await Promise.all([
      prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, branchName: true, companyId: true } }),
      prisma.company.findMany({ where: { id: { in: companyIds2 } }, select: { id: true, name: true } }),
    ]);
    const branchById = Object.fromEntries(branches.map(b => [b.id, b]));
    const companyById = Object.fromEntries(companies.map(c => [c.id, c.name]));

    const out = [];
    for (const u of users) {
      // Never expose Super Admin accounts to a non-super manager.
      if (!scope.all && u.role === 'Super Admin') continue;
      const top = await resolveTopCompany(u.companyId, u.branchId);
      if (scope.company && String(top) !== String(callerCompany)) continue;
      if (scope.branch) {
        if (String(top) !== String(callerCompany)) continue;
        // branch managers only manage their own branch (+ company-wide users)
        if (callerBranch && u.branchId && String(u.branchId) !== String(callerBranch)) continue;
      }
      const perms = u.permissions || {};
      const br = u.branchId != null ? branchById[u.branchId] : null;
      out.push({
        id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
        companyId: u.companyId, branchId: u.branchId, avatar: u.avatar || null,
        companyName: companyById[u.companyId] || (br ? companyById[br.companyId] : null) || null,
        branchName: br ? br.branchName : null,
        resolvedCompanyId: top,
        permissions: perms.permissions || {},
        moduleAccess: perms.moduleAccess || {},
        accessibleCompanyIds: u.accessibleCompanyIds || [],
      });
    }
    res.json(out);
  } catch (error) {
    return respondError(res, error);
  }
};

// PUT /api/users/:id/permissions — company-isolated permission update + audit.
exports.updatePermissions = async (req, res) => {
  try {
    const scope = permissionManagerScope(req);
    if (!scope.canManage) return res.status(403).json({ error: 'You do not have permission to manage user roles & permissions.' });

    const targetId = idParam(req.params.id);
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (!scope.all && target.role === 'Super Admin') {
      return res.status(403).json({ error: 'You cannot modify a Super Admin account.' });
    }

    // Company isolation: a non-super manager may only touch users in their own
    // company (and, for branch managers, their own branch).
    if (!scope.all) {
      const callerCompany = await resolveTopCompany(req.user.companyId, req.user.branchId);
      const targetCompany = await resolveTopCompany(target.companyId, target.branchId);
      if (String(callerCompany) !== String(targetCompany)) {
        return res.status(403).json({ error: 'You can only manage users within your own company.' });
      }
      if (scope.branch && req.user.branchId && target.branchId && String(target.branchId) !== String(req.user.branchId)) {
        return res.status(403).json({ error: 'You can only manage users within your assigned branch.' });
      }
    }

    const { permissions, moduleAccess, role, status, accessibleCompanyIds } = req.body;
    // A non-super manager can never grant Super Admin.
    if (!scope.all && role === 'Super Admin') {
      return res.status(403).json({ error: 'You cannot assign the Super Admin role.' });
    }

    const before = target.permissions || {};
    const combined = { ...before };
    if (permissions !== undefined) combined.permissions = permissions;
    if (moduleAccess !== undefined) combined.moduleAccess = moduleAccess;

    const data = {};
    if (permissions !== undefined || moduleAccess !== undefined) data.permissions = combined;
    if (role !== undefined) data.role = role;
    if (status !== undefined) data.status = status;
    if (accessibleCompanyIds !== undefined && scope.all) data.accessibleCompanyIds = accessibleCompanyIds;
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No changes supplied.' });

    const updated = await prisma.user.update({ where: { id: targetId }, data });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'UPDATE_PERMISSIONS',
        module: 'Users',
        targetId: String(targetId),
        details: JSON.stringify({
          target: target.name,
          oldPermissions: before.permissions || {},
          newPermissions: combined.permissions || {},
          oldModuleAccess: before.moduleAccess || {},
          newModuleAccess: combined.moduleAccess || {},
          roleChange: role !== undefined && role !== target.role ? { from: target.role, to: role } : undefined,
          by: req.user.name || req.user.email,
        }),
      },
    }).catch(e => console.error('audit failed', e));

    const parsed = updated.permissions || {};
    res.json({ ...updated, permissions: parsed.permissions || {}, moduleAccess: parsed.moduleAccess || {} });
  } catch (error) {
    return respondError(res, error);
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id: idParam(id) } });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    return respondError(res, error);
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        action: 'UPDATE_PERMISSIONS'
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } }
      },
      take: 100
    });
    
    // We also need the target user's details
    const targetIds = logs.map(l => l.targetId).filter(Boolean);
    const targets = await prisma.user.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, name: true }
    });
    const targetMap = Object.fromEntries(targets.map(t => [t.id, t.name]));

    const enrichedLogs = logs.map(l => ({
      ...l,
      targetName: l.targetId ? (targetMap[l.targetId] || 'Unknown User') : 'Unknown User'
    }));

    res.json(enrichedLogs);
  } catch (error) {
    return respondError(res, error);
  }
};
