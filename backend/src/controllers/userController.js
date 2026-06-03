const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { id },
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
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Internal server error while resetting password' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status, accessibleCompanyIds, permissions, moduleAccess } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
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
      where: { id },
      data: dataToUpdate
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error while updating user' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, username, password, role, companyId, status, accessibleCompanyIds, permissions, moduleAccess } = req.body;

    if (!name || !email || !username) {
      return res.status(400).json({ error: 'Missing required user fields: name, email, username' });
    }
    if (role !== 'Super Admin' && !companyId) {
      return res.status(400).json({ error: 'companyId is required for non-Super Admin users' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
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

    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal server error while creating user' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
    // Remove passwordHash before sending
    const safeUsers = users.map(u => {
      const { passwordHash, password, ...rest } = u;
      return { ...rest, passwordStr: password, password };
    });
    res.json(safeUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error while fetching users' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error while deleting user' });
  }
};
